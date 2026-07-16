import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventType } from '@ag-ui/core';
import type { ISandboxService, AgentSessionHandle } from '@bmad-easy/shared-types';
import { SANDBOX_SERVICE } from '@bmad-easy/shared-types';
import { SessionEventsService, type SseEvent } from './session-events.service';

/**
 * Set of recognized AG-UI EventType values. Events with a `type` field not in
 * this set are logged at debug level and skipped — forward-compatible (new
 * event types from sandbox-agent don't crash the bridge) and prevents
 * arbitrary event types from being forwarded to the browser SSE channel.
 */
const AGUI_EVENT_TYPES: ReadonlySet<string> = new Set(Object.values(EventType));

/**
 * Lifecycle events owned by the caller (`AgentService`) when `onEvent` is
 * provided. The event bridge passes these to `onEvent` (so the caller can
 * intercept cost data from `RUN_FINISHED`'s data payload) but SKIPS
 * `sessionEvents.emit()` for them — the caller owns lifecycle emission to SSE
 * (prevents double emission). Story 6.3 Task 1.1 (DP-3).
 */
const LIFECYCLE_EVENTS: ReadonlySet<string> = new Set([
  EventType.RUN_STARTED,
  EventType.RUN_FINISHED,
  EventType.RUN_ERROR,
]);

export interface AguiEventBridgeParams {
  conversationId: string;
  sandboxId: string;
  command: string;
  userId: string;
  /**
   * Optional working directory forwarded to `createAgentSession` (3rd arg).
   * `SandboxService` shell-quotes it and prefixes the command with
   * `cd ${shellQuote(cwd)} &&`. Story 6.3 Task 1.2.
   */
  cwd?: string;
  /**
   * Optional observer callback invoked in `processAgentEvent()` BEFORE
   * `sessionEvents.emit()` for non-lifecycle events. For lifecycle events
   * (`RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`), the callback is invoked but
   * `sessionEvents.emit()` is SKIPPED — the caller owns lifecycle emission to
   * SSE (prevents double emission). When omitted, all events (including
   * lifecycle) are forwarded to `sessionEvents.emit()` (backward compat).
   *
   * Story 6.3 test seam — the branching logic in `processAgentEvent()`
   * dispatches lifecycle vs. non-lifecycle events as described above.
   */
  onEvent?: (event: SseEvent) => void;
}

interface ActiveRun {
  sandboxId: string;
  handle: AgentSessionHandle | null;
  timer: NodeJS.Timeout | null;
  aborted: boolean;
  errorEmitted: boolean;
  rejectStream: ((err: Error) => void) | null;
}

const AGENT_STREAM_TIMEOUT_MS = (() => {
  const parsed = parseInt(process.env.AGENT_STREAM_TIMEOUT_MS ?? '120000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
})();

const AGENT_STREAM_TIMEOUT_MESSAGE =
  'The agent stopped unexpectedly. Send a new message to try again.';

/**
 * Maximum accumulated buffer size before the event bridge resets the buffer.
 * Prevents memory exhaustion if sandbox-agent emits a very long line without a
 * newline (malformed output, binary data, or an oversized JSON object).
 * 1 MB is generous for any legitimate single-line JSON event.
 */
const MAX_LINE_BUFFER_BYTES = 1_048_576;

@Injectable()
export class AguiEventBridgeService implements OnModuleDestroy {
  private readonly logger = new Logger(AguiEventBridgeService.name);
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly onEventCallbacks = new Map<string, ((event: SseEvent) => void) | undefined>();

  constructor(
    @Inject(SANDBOX_SERVICE) private readonly sandboxService: ISandboxService,
    private readonly sessionEvents: SessionEventsService,
  ) {}

  async streamAgentEvents(params: AguiEventBridgeParams): Promise<void> {
    const { conversationId, sandboxId, command, cwd } = params;

    const activeRun: ActiveRun = {
      sandboxId,
      handle: null,
      timer: null,
      aborted: false,
      errorEmitted: false,
      rejectStream: null,
    };
    this.activeRuns.set(conversationId, activeRun);

    // createAgentSession is outside the main try/finally below — if it
    // throws, clean up the activeRuns entry so it does not leak (stop() and
    // onModuleDestroy() would otherwise find a stale entry with a null handle).
    let handle;
    try {
      handle = await this.sandboxService.createAgentSession(sandboxId, command, cwd);
    } catch (err) {
      this.activeRuns.delete(conversationId);
      throw err;
    }
    activeRun.handle = handle;
    this.onEventCallbacks.set(conversationId, params.onEvent);

    let buffer = '';
    const onStdout = (chunk: string) => {
      if (activeRun.aborted) return;
      this.resetCircuitBreakerTimer(conversationId);
      buffer += chunk;
      if (buffer.length > MAX_LINE_BUFFER_BYTES) {
        this.logger.warn(
          `Agent stdout buffer exceeded ${MAX_LINE_BUFFER_BYTES} bytes for ${conversationId} — resetting (possible malformed output)`,
        );
        buffer = '';
      }
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          this.processAgentEvent(conversationId, trimmed);
        }
      }
    };
    const onStderr = (chunk: string) => {
      if (activeRun.aborted) return;
      this.resetCircuitBreakerTimer(conversationId);
      this.logger.warn(`sandbox-agent stderr [${conversationId}]: ${chunk}`);
    };

    const streamPromise = this.sandboxService.streamAgentLogs(
      sandboxId,
      handle,
      onStdout,
      onStderr,
    );
    streamPromise.catch(() => undefined);

    const raceLoser = new Promise<never>((_, reject) => {
      activeRun.rejectStream = reject;
      const timer = setTimeout(() => {
        reject(new Error('AGENT_STREAM_TIMEOUT'));
      }, AGENT_STREAM_TIMEOUT_MS);
      timer.unref?.();
      activeRun.timer = timer;
    });

    try {
      await Promise.race([streamPromise, raceLoser]);
      if (buffer.trim() && !activeRun.aborted) {
        this.processAgentEvent(conversationId, buffer.trim());
      }
    } catch (_err) {
      if (!activeRun.aborted) {
        activeRun.aborted = true;
        this.clearCircuitBreakerTimer(conversationId);
        await this.sandboxService
          .terminateAgentSession(sandboxId, handle.sessionId)
          .catch((e) =>
            this.logger.error(
              `Failed to terminate agent session for ${conversationId}: ${e}`,
            ),
          );
        this.emitRunError(conversationId, activeRun);
      }
      // Re-throw so the method rejects on abort (stop/timeout/destroy) and
      // resolves only on normal completion. AgentService.runTurn()'s catch
      // block distinguishes outcomes by the sentinel message string
      // (AGENT_STOPPED, AGENT_STREAM_TIMEOUT, MODULE_DESTROYING). Without this
      // re-throw, runTurn()'s catch never fires on stop/timeout, causing
      // double RUN_FINISHED / double RUN_ERROR. Story 6.3 Task 1.0 (DP-2).
      throw _err;
    } finally {
      this.clearCircuitBreakerTimer(conversationId);
      if (!activeRun.aborted) {
        await this.sandboxService
          .terminateAgentSession(sandboxId, handle.sessionId)
          .catch((e) =>
            this.logger.error(
              `Failed to terminate agent session on completion for ${conversationId}: ${e}`,
            ),
          );
      }
      this.activeRuns.delete(conversationId);
      this.onEventCallbacks.delete(conversationId);
    }
  }

  async stop(conversationId: string): Promise<void> {
    const activeRun = this.activeRuns.get(conversationId);
    if (!activeRun) return;
    activeRun.aborted = true;
    this.clearCircuitBreakerTimer(conversationId);
    activeRun.rejectStream?.(new Error('AGENT_STOPPED'));
    if (activeRun.handle) {
      await this.sandboxService
        .terminateAgentSession(activeRun.sandboxId, activeRun.handle.sessionId)
        .catch((err) =>
          this.logger.error(
            `Failed to terminate agent session on stop for ${conversationId}: ${err}`,
          ),
        );
    }
    this.activeRuns.delete(conversationId);
    this.onEventCallbacks.delete(conversationId);
  }

  onModuleDestroy(): void {
    for (const conversationId of [...this.activeRuns.keys()]) {
      const activeRun = this.activeRuns.get(conversationId);
      if (!activeRun) continue;
      activeRun.aborted = true;
      this.clearCircuitBreakerTimer(conversationId);
      if (activeRun.handle) {
        void this.sandboxService
          .terminateAgentSession(activeRun.sandboxId, activeRun.handle.sessionId)
          .catch((err) =>
            this.logger.error(
              `Failed to terminate agent session on destroy for ${conversationId}: ${err}`,
            ),
          );
      }
      activeRun.rejectStream?.(new Error('MODULE_DESTROYING'));
    }
    this.activeRuns.clear();
    this.onEventCallbacks.clear();
  }

  private processAgentEvent(conversationId: string, line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.logger.debug(
        `Failed to parse agent event line for ${conversationId}: ${line}`,
      );
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      this.logger.debug(
        `Agent event is not an object for ${conversationId}: ${line}`,
      );
      return;
    }
    const obj = parsed as { type?: unknown; [key: string]: unknown };
    const { type, ...data } = obj;
    if (typeof type !== 'string' || type.length === 0) {
      this.logger.debug(
        `Agent event missing type for ${conversationId}: ${line}`,
      );
      return;
    }
    if (!AGUI_EVENT_TYPES.has(type)) {
      this.logger.debug(
        `Unrecognized agent event type for ${conversationId}: ${type}`,
      );
      return;
    }
    const activeRun = this.activeRuns.get(conversationId);
    const onEvent = activeRun ? this.onEventCallbacks.get(conversationId) : undefined;
    const sseEvent: SseEvent = { event: type, data };
    if (onEvent) {
      // Guard the onEvent callback: a synchronous throw would otherwise
      // propagate to streamPromise, causing the catch block to emit RUN_ERROR
      // and re-throw, then AgentService's catch to emit a second RUN_ERROR.
      try {
        onEvent(sseEvent);
      } catch (err) {
        this.logger.error(
          `onEvent callback threw for ${conversationId} (event ${type}): ${err instanceof Error ? err.message : err}`,
        );
      }
      // Lifecycle events are owned by the caller (AgentService) when onEvent
      // is provided — skip sessionEvents.emit() to prevent double emission.
      // The caller still receives them via onEvent (e.g. to intercept cost
      // data from RUN_FINISHED). Story 6.3 Task 1.1 (DP-3).
      if (LIFECYCLE_EVENTS.has(type)) {
        return;
      }
    }
    this.sessionEvents.emit(conversationId, sseEvent);
  }

  private resetCircuitBreakerTimer(conversationId: string): void {
    const activeRun = this.activeRuns.get(conversationId);
    if (!activeRun || activeRun.aborted) return;
    if (activeRun.timer) {
      clearTimeout(activeRun.timer);
    }
    const timer = setTimeout(() => {
      const run = this.activeRuns.get(conversationId);
      if (!run || run.aborted) return;
      run.rejectStream?.(new Error('AGENT_STREAM_TIMEOUT'));
    }, AGENT_STREAM_TIMEOUT_MS);
    timer.unref?.();
    activeRun.timer = timer;
  }

  private clearCircuitBreakerTimer(conversationId: string): void {
    const activeRun = this.activeRuns.get(conversationId);
    if (!activeRun?.timer) return;
    clearTimeout(activeRun.timer);
    activeRun.timer = null;
  }

  private emitRunError(conversationId: string, activeRun: ActiveRun): void {
    if (activeRun.errorEmitted) return;
    activeRun.errorEmitted = true;
    this.sessionEvents.emit(conversationId, {
      event: EventType.RUN_ERROR,
      data: { message: AGENT_STREAM_TIMEOUT_MESSAGE },
    });
  }
}
