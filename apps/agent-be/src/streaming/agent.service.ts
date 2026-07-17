import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  IAgentService,
  AgentRunParams,
  MessageSegment,
} from '@bmad-easy/shared-types';
import { EventType } from '@ag-ui/core';
import type { ISandboxService, IAguiEventBridgeService } from '@bmad-easy/shared-types';
import { SANDBOX_SERVICE, AGUI_EVENT_BRIDGE_SERVICE } from '@bmad-easy/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@bmad-easy/database-schemas';
import { SessionEventsService, type SseEvent } from './session-events.service';
import { ToolPillClassifierService } from './tool-pill-classifier.service';
import { CostTrackingService } from '../cost-tracking/cost-tracking.service';

interface ActiveRun {
  sandboxId: string;
  userId: string;
}

interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  input: string;
}

const REPO_SUBDIRECTORY = 'repo';

const FILE_MODIFYING_TOOLS = new Set(['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/**
 * Sentinel error messages from AguiEventBridgeService.streamAgentEvents().
 * AgentService.runTurn()'s catch block checks these to distinguish outcomes:
 * - AGENT_STOPPED: stop() initiated; skip RUN_ERROR (stop() handles RUN_FINISHED)
 * - AGENT_STREAM_TIMEOUT: circuit breaker fired; skip RUN_ERROR (event bridge
 *   already emitted it via emitRunError)
 * - MODULE_DESTROYING: module shutting down; skip RUN_ERROR and RUN_FINISHED
 *   (SSE clients disconnecting). Story 6.3 Task 2.3 (DP-3).
 * - AGENT_STREAM_CRASHED: stream crashed (non-abort); skip RUN_ERROR (event
 *   bridge already emitted it via emitRunError). Bug H1.
 */
const AGENT_STOPPED = 'AGENT_STOPPED';
const AGENT_STREAM_TIMEOUT = 'AGENT_STREAM_TIMEOUT';
const MODULE_DESTROYING = 'MODULE_DESTROYING';
const AGENT_STREAM_CRASHED = 'AGENT_STREAM_CRASHED';

@Injectable()
export class AgentService implements IAgentService, OnModuleDestroy {
  private readonly logger = new Logger(AgentService.name);
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly pendingClassifierPromises = new Map<string, Promise<unknown>[]>();

  constructor(
    @Inject(SANDBOX_SERVICE) private readonly sandboxService: ISandboxService,
    private readonly sessionEvents: SessionEventsService,
    private readonly prisma: PrismaService,
    private readonly classifier: ToolPillClassifierService,
    private readonly costTracking: CostTrackingService,
    @Inject(AGUI_EVENT_BRIDGE_SERVICE) private readonly aguiEventBridgeService: IAguiEventBridgeService,
  ) {}

  async runTurn(params: AgentRunParams): Promise<void> {
    const { conversationId, sandboxId, message, userId } = params;

    if (this.activeRuns.has(conversationId)) {
      this.logger.warn(
        `Concurrent runTurn rejected for conversation ${conversationId} — a turn is already in flight`,
      );
      return;
    }

    this.sessionEvents.emit(conversationId, {
      event: EventType.RUN_STARTED,
      data: { threadId: conversationId },
    });

    let accumulatedText = '';
    const segments: MessageSegment[] = [{ type: 'text', content: '' }];
    // Mutable container so the onEvent closure can update cost data and the
    // outer scope reads it after streamAgentEvents resolves. A bare `let`
    // would be narrowed to `null` by TS control-flow analysis (assignments
    // inside closures are not tracked for subsequent reads outside them).
    const state: {
      lastCostData: {
        totalCostUsd: number;
        sessionId: string;
        numTurns: number;
        durationMs: number;
      } | null;
    } = { lastCostData: null };

    const toolCallRegistry = new Map<string, ToolCallInfo>();

    const onEvent = (event: SseEvent) => {
      const { event: type, data } = event;
      const d = (data ?? {}) as Record<string, unknown>;

      if (type === EventType.TEXT_MESSAGE_CONTENT) {
        const delta = typeof d.delta === 'string' ? d.delta : '';
        accumulatedText += delta;
        const lastSeg = segments[segments.length - 1];
        if (lastSeg && lastSeg.type === 'text') {
          lastSeg.content += delta;
        } else {
          segments.push({ type: 'text', content: delta });
        }
        return;
      }

      if (type === EventType.TOOL_CALL_START) {
        const toolCallId = typeof d.toolCallId === 'string' ? d.toolCallId : `tc-${randomUUID()}`;
        const toolCallName = typeof d.toolCallName === 'string' ? d.toolCallName : 'unknown';
        toolCallRegistry.set(toolCallId, { toolCallId, toolName: toolCallName, input: '' });
        const existingSeg = segments.find(
          (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
        );
        if (!existingSeg) {
          segments.push({
            type: 'tool_call',
            toolCall: { toolCallId, toolName: toolCallName, status: 'running', input: '', output: '' },
          });
        }
        return;
      }

      if (type === EventType.TOOL_CALL_ARGS) {
        const toolCallId = typeof d.toolCallId === 'string' ? d.toolCallId : '';
        const delta = typeof d.delta === 'string' ? d.delta : '';
        if (toolCallId) {
          const info = toolCallRegistry.get(toolCallId);
          if (info) {
            info.input += delta;
          }
          const seg = segments.find(
            (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
          );
          if (seg && seg.type === 'tool_call') {
            seg.toolCall.input += delta;
          }
        }
        return;
      }

      if (type === EventType.TOOL_CALL_END) {
        const toolCallId = typeof d.toolCallId === 'string' ? d.toolCallId : '';
        if (toolCallId) {
          const seg = segments.find(
            (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
          );
          if (seg && seg.type === 'tool_call' && seg.toolCall.status !== 'error') {
            seg.toolCall.status = 'completed';
          }
        }
        return;
      }

      if (type === EventType.TOOL_CALL_RESULT) {
        const toolCallId = typeof d.toolCallId === 'string' ? d.toolCallId : '';
        const content = typeof d.content === 'string' ? d.content : '';
        const isError = d.isError === true;

        const resultSeg = segments.find(
          (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
        );
        if (resultSeg && resultSeg.type === 'tool_call') {
          resultSeg.toolCall.output = content;
          if (isError) {
            resultSeg.toolCall.status = 'error';
            resultSeg.toolCall.errorMessage = content;
          }
        }

        const toolCallInfo = toolCallRegistry.get(toolCallId);
        if (!toolCallInfo) {
          return;
        }

        const classifierPromise = this.classifier
          .classifyToolResult(
            toolCallId,
            toolCallInfo.toolName,
            toolCallInfo.input,
            content,
            userId,
          )
          .then((result) => {
            if (!result) return;
            if (result.type === 'TOOL_CALL_PROMOTED') {
              const seg = segments.find(
                (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
              );
              if (seg && seg.type === 'tool_call') {
                seg.toolCall.semantic = {
                  artifactType: result.artifactType,
                  artifactTitle: result.artifactTitle,
                  viewHref: result.viewHref,
                };
              }
            } else if (result.type === 'CREDENTIAL_FAILURE') {
              const seg = segments.find(
                (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
              );
              if (seg && seg.type === 'tool_call') {
                seg.toolCall.status = 'error';
                seg.toolCall.errorMessage = 'GitHub credentials have expired or been revoked.';
              }
            } else if (result.type === 'ACCESS_DENIED') {
              const seg = segments.find(
                (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
              );
              if (seg && seg.type === 'tool_call') {
                seg.toolCall.status = 'error';
                seg.toolCall.errorMessage = 'Access denied.';
                seg.toolCall.accessNotice = { code: result.code, retryAfter: result.retryAfter };
              }
            }
            this.sessionEvents.emit(conversationId, {
              event: result.type,
              data: result,
            });
          })
          .catch((err) => {
            this.logger.error(`Classifier failed for tool call ${toolCallId} (conversation ${conversationId}): ${err}`);
          });

        if (!this.pendingClassifierPromises.has(conversationId)) {
          this.pendingClassifierPromises.set(conversationId, []);
        }
        this.pendingClassifierPromises.get(conversationId)!.push(classifierPromise);

        if (FILE_MODIFYING_TOOLS.has(toolCallInfo.toolName)) {
          const workingTreePromise = this.sandboxService
            .getWorkingTreeStatus(sandboxId)
            .then((status) => {
              if (status.dirty) {
                this.sessionEvents.emit(conversationId, {
                  event: 'WORKING_TREE_DIRTY',
                  data: { files: status.files },
                });
              } else {
                this.sessionEvents.emit(conversationId, {
                  event: 'WORKING_TREE_CLEAN',
                  data: {},
                });
              }
            })
            .catch((err) => {
              this.logger.warn(`Working tree check failed for conversation ${conversationId}: ${err}`);
            });
          const pending = this.pendingClassifierPromises.get(conversationId);
          if (pending) {
            pending.push(workingTreePromise);
          }
        }
        return;
      }

      if (type === EventType.RUN_FINISHED) {
        const costUsd = d.total_cost_usd;
        const sessionId = d.session_id;
        const numTurns = d.num_turns;
        const durationMs = d.duration_ms;
        if (
          typeof costUsd === 'number' && Number.isFinite(costUsd) &&
          typeof numTurns === 'number' && Number.isFinite(numTurns) &&
          typeof durationMs === 'number' && Number.isFinite(durationMs) &&
          typeof sessionId === 'string'
        ) {
          state.lastCostData = {
            totalCostUsd: costUsd,
            sessionId,
            numTurns,
            durationMs,
          };
        } else if (costUsd !== undefined) {
          this.logger.warn(
            `Non-finite cost data from sandbox-agent for conversation ${conversationId}: total_cost_usd=${costUsd ?? 'missing'}, num_turns=${numTurns ?? 'missing'}, duration_ms=${durationMs ?? 'missing'}, session_id=${sessionId ?? 'missing'}`,
          );
        }
        return;
      }
    };

    const command = this.buildAgentCommand(message);

    this.activeRuns.set(conversationId, { sandboxId, userId });

    try {
      await this.aguiEventBridgeService.streamAgentEvents({
        conversationId,
        sandboxId,
        command,
        userId,
        cwd: REPO_SUBDIRECTORY,
        onEvent,
      });

      const pendingPromises = this.pendingClassifierPromises.get(conversationId) ?? [];
      if (pendingPromises.length > 0) {
        await Promise.allSettled(pendingPromises);
      }

      if (state.lastCostData) {
        try {
          await this.costTracking.recordCost({
            userId,
            conversationId,
            totalCostUsd: state.lastCostData.totalCostUsd,
            sessionId: state.lastCostData.sessionId,
            numTurns: state.lastCostData.numTurns,
            durationMs: state.lastCostData.durationMs,
          });
        } catch (err) {
          this.logger.error(
            `Failed to record cost for conversation ${conversationId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const hasToolCalls = segments.some((s) => s.type === 'tool_call');
      if (accumulatedText.length > 0 || hasToolCalls) {
        const cleanSegments = segments.filter(
          (s) => s.type !== 'text' || s.content.length > 0,
        );
        try {
          await this.prisma.turn.create({
            data: {
              conversationId,
              role: 'assistant',
              content: accumulatedText,
              segments: (cleanSegments.length > 0 ? cleanSegments : segments) as unknown as Prisma.InputJsonValue,
            },
            select: { id: true },
          });
          await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { lastActiveAt: new Date() },
            select: { id: true },
          });
        } catch (err) {
          this.logger.error(
            `Failed to persist assistant turn for conversation ${conversationId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      this.sessionEvents.emit(conversationId, {
        event: EventType.RUN_FINISHED,
        data: {},
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown agent error';
      if (
        errorMessage === AGENT_STOPPED ||
        errorMessage === AGENT_STREAM_TIMEOUT ||
        errorMessage === MODULE_DESTROYING ||
        errorMessage === AGENT_STREAM_CRASHED
      ) {
        // Abort-initiated rejection — skip RUN_ERROR:
        // - AGENT_STOPPED: stop() handles RUN_FINISHED
        // - AGENT_STREAM_TIMEOUT: event bridge already emitted RUN_ERROR
        // - MODULE_DESTROYING: SSE clients disconnecting
        // - AGENT_STREAM_CRASHED: event bridge already emitted RUN_ERROR (Bug H1)
      } else {
        // Await pending classifier/working-tree promises before emitting
        // RUN_ERROR so their SSE events arrive before the error (mirrors the
        // normal-completion path which awaits before RUN_FINISHED).
        const pendingPromises = this.pendingClassifierPromises.get(conversationId) ?? [];
        if (pendingPromises.length > 0) {
          await Promise.allSettled(pendingPromises);
        }
        this.logger.error(`Agent run failed for conversation ${conversationId}: ${errorMessage}`);
        this.sessionEvents.emit(conversationId, {
          event: EventType.RUN_ERROR,
          data: { message: errorMessage },
        });
      }
    } finally {
      this.pendingClassifierPromises.delete(conversationId);
      this.activeRuns.delete(conversationId);
    }
  }

  async stop(conversationId: string): Promise<void> {
    const activeRun = this.activeRuns.get(conversationId);
    if (!activeRun) {
      return;
    }

    // Bug M3: Capture the pendingPromises array reference EARLY — runTurn's
    // finally will delete the Map entry during the await of
    // aguiEventBridgeService.stop(), so a post-await get() would return
    // undefined and miss the promise references (vacuous Promise.allSettled).
    const pendingPromises = this.pendingClassifierPromises.get(conversationId) ?? [];

    await this.aguiEventBridgeService.stop(conversationId).catch((err) => {
      this.logger.warn(`Failed to stop event bridge for conversation ${conversationId}: ${err}`);
    });

    if (pendingPromises.length > 0) {
      await Promise.allSettled(pendingPromises);
    }

    this.sessionEvents.emit(conversationId, {
      event: EventType.RUN_FINISHED,
      data: {},
    });

    this.pendingClassifierPromises.delete(conversationId);
    this.activeRuns.delete(conversationId);
  }

  onModuleDestroy() {
    for (const conversationId of [...this.activeRuns.keys()]) {
      void this.aguiEventBridgeService
        .stop(conversationId)
        .catch((err) => {
          this.logger.error(
            `Failed to stop event bridge on module destroy for conversation ${conversationId}: ${err}`,
          );
        });
      this.logger.log(`Stopped agent run for conversation ${conversationId} on module destroy`);
    }
    this.activeRuns.clear();
    this.pendingClassifierPromises.clear();
  }

  isIdle(conversationId: string): boolean {
    return !this.activeRuns.has(conversationId);
  }

  /**
   * Constructs the sandbox-agent invocation command. The command runs
   * sandbox-agent with the user's message as the prompt. The user message is
   * shell-quoted to prevent command injection. Platform credentials are NEVER
   * interpolated into the command — `ANTHROPIC_API_KEY` and `GITHUB_TOKEN`
   * are injected into the sandbox environment by `SandboxService.provision()`
   * (Story 6.1).
   *
   * Story 6.3 Task 4: sandbox-agent is an HTTP server (rivet-dev/sandbox-agent
   * v0.4.2, Story 6.2 research). The exact CLI mode that produces JSONL on
   * stdout is not fully verifiable without a real sandbox — the command below
   * is a reasonable invocation based on sandbox-agent docs and the event
   * bridge's JSONL-on-stdout contract. Flagged for Story 6.5 (real-service
   * E2E) verification.
   */
  private buildAgentCommand(message: string): string {
    const quotedPrompt = this.shellQuote(message);
    return `sandbox-agent --agent claude-code --prompt ${quotedPrompt}`;
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }
}
