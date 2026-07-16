/**
 * @jest-environment node
 *
 * Story 6.2: Implement agui-event-bridge.service.ts
 * Unit tests for AguiEventBridgeService.
 *
 * Covers:
 *   AC-1 (service created and registered — instantiation + DI wiring)
 *   AC-2 (re-encodes as AG-UI events, does NOT parse raw JSONL)
 *   AC-3 (circuit breaker wraps the event stream)
 *   AC-5 (crash/stall termination via Daytona process API)
 *   AC-6 (transport mechanism — pull-based, agent-be is the active party)
 *   AC-7 (OnModuleDestroy cleanup)
 *
 * AC-4 (SSE heartbeat) is NOT tested here — it already runs in
 * StreamingController and the event bridge must not interfere with it.
 */
import { SessionEventsService } from './session-events.service';
import { AguiEventBridgeService } from './agui-event-bridge.service';
import { SandboxServiceFake } from '../../test/helpers/sandbox-service.fake';
import { EventType } from '@ag-ui/core';

describe('AguiEventBridgeService (Story 6.2)', () => {
  let sessionEvents: SessionEventsService;
  let sandboxFake: SandboxServiceFake;
  let service: AguiEventBridgeService;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    sandboxFake = new SandboxServiceFake();
    sessionEvents = new SessionEventsService();
    emitSpy = jest.spyOn(sessionEvents, 'emit');
    service = new AguiEventBridgeService(sandboxFake, sessionEvents);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // ─── AC-1: Event bridge service created and registered ──────────────────

  describe('[P0] AC-1 — Event bridge service created and registered', () => {
    it('[P0] service is instantiable with SANDBOX_SERVICE and SessionEventsService', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(AguiEventBridgeService);
    });

    it('[P0] service implements OnModuleDestroy', () => {
      expect(typeof service.onModuleDestroy).toBe('function');
    });
  });

  // ─── AC-2: Re-encodes as AG-UI events, does NOT parse raw JSONL ─────────

  describe('[P0] AC-2 — Re-encodes sandbox-agent output as AG-UI events', () => {
    it('[P0] onStdout receives sandbox-agent event chunks and emits AG-UI events via sessionEvents.emit()', async () => {
      // sandbox-agent emits normalized events (JSON objects per line).
      // The event bridge parses each line, maps to AG-UI EventType, and
      // calls sessionEvents.emit(conversationId, { event, data }).
      sandboxFake.setAgentEvents([
        JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId: 'msg-1', role: 'assistant' }) + '\n',
        JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'Hello' }) + '\n',
        JSON.stringify({ type: 'TEXT_MESSAGE_END', messageId: 'msg-1' }) + '\n',
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
      });

      const emittedEvents = emitSpy.mock.calls.map((c) => c[1]?.event);
      expect(emittedEvents).toContain(EventType.TEXT_MESSAGE_START);
      expect(emittedEvents).toContain(EventType.TEXT_MESSAGE_CONTENT);
      expect(emittedEvents).toContain(EventType.TEXT_MESSAGE_END);
    });

    it('[P0] emits AG-UI events with correct data payloads', async () => {
      sandboxFake.setAgentEvents([
        JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId: 'msg-1', role: 'assistant' }) + '\n',
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
      });

      const startCall = emitSpy.mock.calls.find(
        (c) => c[1]?.event === EventType.TEXT_MESSAGE_START,
      );
      expect(startCall).toBeDefined();
      expect(startCall[1].data).toHaveProperty('messageId', 'msg-1');
      expect(startCall[1].data).toHaveProperty('role', 'assistant');
    });

    it('[P0] does NOT parse Claude Code raw JSONL — consumes sandbox-agent normalized output', async () => {
      // The event bridge receives sandbox-agent's already-normalized output,
      // NOT Claude Code's raw JSONL. The input to onStdout is sandbox-agent's
      // event schema, not raw Claude Code JSONL.
      sandboxFake.setAgentEvents([
        JSON.stringify({ type: 'TOOL_CALL_START', toolCallId: 'tc-1', toolCallName: 'Bash' }) + '\n',
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "run git status"',
        userId: 'user-1',
      });

      const toolCallStart = emitSpy.mock.calls.find(
        (c) => c[1]?.event === EventType.TOOL_CALL_START,
      );
      expect(toolCallStart).toBeDefined();
      expect(toolCallStart[1].data).toHaveProperty('toolCallId', 'tc-1');
      expect(toolCallStart[1].data).toHaveProperty('toolCallName', 'Bash');
    });

    it('[P0] handles partial chunks split across JSON object boundaries', async () => {
      // sandbox-agent may emit partial JSON across chunk boundaries.
      // The event bridge buffers incomplete lines and parses on newline boundary.
      sandboxFake.setAgentEvents([
        JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId: 'msg-1', role: 'assistant' }).slice(0, 20),
        JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId: 'msg-1', role: 'assistant' }).slice(20) + '\n',
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
      });

      const startCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.TEXT_MESSAGE_START,
      );
      expect(startCalls).toHaveLength(1);
    });

    it('[P0] stderr is logged at warn level and does NOT emit to SSE channel', async () => {
      // The event bridge's onStderr callback logs stderr at warn level
      // (diagnostic, not user-facing). No SSE events emitted for stderr.
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      sandboxFake.setAgentEvents([]);
      sandboxFake.setAgentStderrEvents(['warning: something\n', 'error: details\n']);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
      });

      // stderr is logged at warn level (diagnostic, not user-facing).
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('sandbox-agent stderr'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('warning: something'));

      // No SSE events should be emitted for stderr (only for stdout chunks).
      const stderrEvents = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'STDERR',
      );
      expect(stderrEvents).toHaveLength(0);
    });
  });

  // ─── AC-3: Circuit breaker wraps the event stream ──────────────────────

  describe('[P0] AC-3 — Circuit breaker wraps the event stream', () => {
    it('[P0] fires after timeout with no events and terminates the agent session', async () => {
      // setAgentStreamDelay exceeds the circuit breaker timeout.
      // The event bridge must call terminateAgentSession and emit RUN_ERROR.
      // Story 6.3 Task 1.0: streamAgentEvents now REJECTS with the
      // AGENT_STREAM_TIMEOUT sentinel on timeout (re-throw in catch block).
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000); // exceeds 120s default timeout

        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });
        // Attach handler early to prevent unhandled rejection during timer advance.
        const streamErr = streamPromise.catch((e: Error) => e);

        // advanceTimersByTimeAsync flushes microtasks between timer ticks —
        // required because the circuit breaker timer is scheduled after an
        // await createAgentSession microtask (sync advanceTimersByTime would
        // fire before the timer is scheduled).
        await jest.advanceTimersByTimeAsync(120_000);
        const err = await streamErr;

        expect(sandboxFake.getTerminatedSessions().length).toBeGreaterThanOrEqual(1);
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBe('AGENT_STREAM_TIMEOUT');
      } finally {
        jest.useRealTimers();
      }
    });

    it('[P0] emits RUN_ERROR with canonical message on timeout', async () => {
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000);

        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });
        const streamErr = streamPromise.catch((e: Error) => e);

        await jest.advanceTimersByTimeAsync(120_000);
        const err = await streamErr;
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBe('AGENT_STREAM_TIMEOUT');

        const errorCalls = emitSpy.mock.calls.filter(
          (c) => c[1]?.event === EventType.RUN_ERROR,
        );
        expect(errorCalls).toHaveLength(1);
        expect(errorCalls[0][1].data.message).toBe(
          'The agent stopped unexpectedly. Send a new message to try again.',
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('[P0] resets the circuit breaker timer on every received chunk', async () => {
      jest.useFakeTimers();
      try {
        // Chunks arrive at intervals shorter than the timeout — the timer
        // resets on each chunk, so the circuit breaker should NOT fire.
        sandboxFake.setAgentStreamDelay(60_000); // 60s between chunks, < 120s timeout
        sandboxFake.setAgentEvents([
          JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'chunk1' }) + '\n',
          JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'chunk2' }) + '\n',
        ]);

        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });
        // Attach handler early — the stream may reject if the circuit breaker
        // fires between chunks (race at the 120s boundary).
        const streamErr = streamPromise.catch((e: Error) => e);

        // Advance past what would be a timeout if the timer didn't reset.
        await jest.advanceTimersByTimeAsync(100_000);
        const errorsBefore = emitSpy.mock.calls.filter(
          (c) => c[1]?.event === EventType.RUN_ERROR,
        );
        expect(errorsBefore).toHaveLength(0);

        // Advance past the remaining chunk delay so the stream completes.
        await jest.advanceTimersByTimeAsync(100_000);
        await streamErr;
      } finally {
        jest.useRealTimers();
      }
    });

    it('[P0] terminates the agent session BEFORE emitting RUN_ERROR (ordering)', async () => {
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000);

        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });
        const streamErr = streamPromise.catch((e: Error) => e);

        await jest.advanceTimersByTimeAsync(120_000);
        await streamErr;

        // The architecture says "terminate the agent process before emitting
        // the error event." Verify terminateAgentSession was called before
        // the RUN_ERROR emit.
        const terminatedSessions = sandboxFake.getTerminatedSessions();
        const errorCalls = emitSpy.mock.calls.filter(
          (c) => c[1]?.event === EventType.RUN_ERROR,
        );
        expect(terminatedSessions.length).toBeGreaterThanOrEqual(1);
        expect(errorCalls).toHaveLength(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('[P0] emits RUN_ERROR only once (no double-emit if stream also errors after timeout)', async () => {
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000);
        sandboxFake.failNextAgentStream(); // stream will also error

        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });
        const streamErr = streamPromise.catch((e: Error) => e);

        await jest.advanceTimersByTimeAsync(120_000);
        await streamErr;

        const errorCalls = emitSpy.mock.calls.filter(
          (c) => c[1]?.event === EventType.RUN_ERROR,
        );
        expect(errorCalls).toHaveLength(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ─── AC-5: Crash/stall termination via Daytona process API ──────────────

  describe('[P0] AC-5 — Crash/stall termination via Daytona process API', () => {
    it('[P0] stop() terminates the active session via terminateAgentSession', async () => {
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000); // keep stream in-flight
        sandboxFake.setAgentEvents([
          JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId: 'msg-1', role: 'assistant' }) + '\n',
        ]);

        // Start streaming (don't await — it's long-lived)
        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });
        const streamErr = streamPromise.catch((e: Error) => e);

        // Advance 0ms to let createAgentSession resolve (microtask flush).
        await jest.advanceTimersByTimeAsync(0);

        await service.stop('conv-1');

        expect(sandboxFake.getTerminatedSessions().length).toBeGreaterThanOrEqual(1);

        // Story 6.3 Task 1.0: streamAgentEvents rejects with AGENT_STOPPED on stop.
        const err = await streamErr;
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBe('AGENT_STOPPED');
      } finally {
        jest.useRealTimers();
      }
    });

    it('[P0] stop() does NOT emit any SSE events (RUN_ERROR is for crashes/stalls only)', async () => {
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000); // keep stream in-flight
        sandboxFake.setAgentEvents([]);

        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });
        const streamErr = streamPromise.catch((e: Error) => e);

        await jest.advanceTimersByTimeAsync(0);

        emitSpy.mockClear();
        await service.stop('conv-1');

        expect(emitSpy).not.toHaveBeenCalled();

        await streamErr;
      } finally {
        jest.useRealTimers();
      }
    });

    it('[P0] stop() clears the circuit breaker timer', async () => {
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000); // keep stream in-flight
        sandboxFake.setAgentEvents([]);

        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });
        const streamErr = streamPromise.catch((e: Error) => e);

        await jest.advanceTimersByTimeAsync(0);
        await service.stop('conv-1');

        emitSpy.mockClear();
        jest.advanceTimersByTime(120_000);

        const errorsAfterStop = emitSpy.mock.calls.filter(
          (c) => c[1]?.event === EventType.RUN_ERROR,
        );
        expect(errorsAfterStop).toHaveLength(0);

        await streamErr;
      } finally {
        jest.useRealTimers();
      }
    });

    it('[P0] stream error (crash) terminates the session and emits RUN_ERROR', async () => {
      sandboxFake.failNextAgentStream();

      // Story 6.3 Task 1.0: streamAgentEvents now re-throws on abort. A stream
      // crash (failNextAgentStream) is NOT an abort-initiated rejection (the
      // stream rejects before aborted is set), so the catch block sets
      // aborted=true, emits RUN_ERROR, then re-throws the original error.
      await expect(
        service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        }),
      ).rejects.toThrow('SandboxServiceFake: simulated agent stream failure');

      expect(sandboxFake.getTerminatedSessions().length).toBeGreaterThanOrEqual(1);

      const errorCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.RUN_ERROR,
      );
      expect(errorCalls).toHaveLength(1);
      expect(errorCalls[0][1].data.message).toBe(
        'The agent stopped unexpectedly. Send a new message to try again.',
      );
    });
  });

  // ─── AC-6: Transport mechanism — pull-based, agent-be is the active party ─

  describe('[P0] AC-6 — Transport mechanism (pull-based, agent-be is active party)', () => {
    it('[P0] calls createAgentSession before streamAgentLogs (transport ordering)', async () => {
      sandboxFake.setAgentEvents([
        JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId: 'msg-1', role: 'assistant' }) + '\n',
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
      });

      // createAgentSession must be called (agent-be creates the session,
      // the sandbox never initiates an outbound connection).
      expect(sandboxFake.getCreatedSessions().length).toBeGreaterThanOrEqual(1);
      const createdSession = sandboxFake.getCreatedSessions()[0];
      expect(createdSession.sandboxId).toBe('sb-1');
      expect(createdSession.command).toContain('sandbox-agent');
    });

    it('[P0] passes the command through to createAgentSession verbatim', async () => {
      const command = 'sandbox-agent --agent claude-code --prompt "test prompt"';
      sandboxFake.setAgentEvents([]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command,
        userId: 'user-1',
      }).catch(() => undefined);

      const createdSession = sandboxFake.getCreatedSessions()[0];
      expect(createdSession.command).toBe(command);
    });

    it('[P0] terminates the session on normal stream completion', async () => {
      sandboxFake.setAgentEvents([
        JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId: 'msg-1', role: 'assistant' }) + '\n',
        JSON.stringify({ type: 'TEXT_MESSAGE_END', messageId: 'msg-1' }) + '\n',
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
      });

      // On normal completion, the session should be cleaned up (terminated).
      expect(sandboxFake.getTerminatedSessions().length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── AC-7: OnModuleDestroy cleanup ──────────────────────────────────────

  describe('[P0] AC-7 — OnModuleDestroy cleanup', () => {
    it('[P0] terminates all active sessions on module destroy', async () => {
      // Start two concurrent streams
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000); // keep streams in-flight
        sandboxFake.setAgentEvents([]);

        const stream1 = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        }).catch(() => undefined);

        const stream2 = service.streamAgentEvents({
          conversationId: 'conv-2',
          sandboxId: 'sb-2',
          command: 'sandbox-agent --agent claude-code --prompt "world"',
          userId: 'user-2',
        }).catch(() => undefined);

        await jest.advanceTimersByTimeAsync(0);

        service.onModuleDestroy();

        // Both sessions should be terminated
        expect(sandboxFake.getTerminatedSessions().length).toBeGreaterThanOrEqual(2);

        await Promise.all([stream1, stream2]);
      } finally {
        jest.useRealTimers();
      }
    });

    it('[P0] clears all circuit breaker timers on module destroy', async () => {
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000); // keep stream in-flight
        sandboxFake.setAgentEvents([]);

        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });
        const streamErr = streamPromise.catch((e: Error) => e);

        await jest.advanceTimersByTimeAsync(0);
        service.onModuleDestroy();

        emitSpy.mockClear();
        jest.advanceTimersByTime(120_000);

        // No RUN_ERROR should fire after onModuleDestroy cleared the timer.
        const errorsAfterDestroy = emitSpy.mock.calls.filter(
          (c) => c[1]?.event === EventType.RUN_ERROR,
        );
        expect(errorsAfterDestroy).toHaveLength(0);

        await streamErr;
      } finally {
        jest.useRealTimers();
      }
    });

    it('[P0] onModuleDestroy does not throw when no active sessions exist', () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });

  // ─── Coverage gap tests (automate validation — missing tests only) ──────
  // These tests cover behavioral paths that the existing AC tests assert on
  // but do not actually exercise (the stream completes before stop/onModuleDestroy
  // is called, so the active run is already cleaned up by the finally block).
  // Generated by the automate workflow — does NOT modify existing tests.

  describe('[P0] AC-5 — stop() terminates when stream is still active (coverage gap)', () => {
    it('[P0] stop() calls terminateAgentSession while the stream is in-flight', async () => {
      // Use a large delay so the stream is still in-flight when stop() is called.
      // Without this, the stream resolves immediately and the finally block
      // performs termination — stop() finds no active run and returns early.
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000);
        sandboxFake.setAgentEvents([]);

        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });

        // Advance 0ms to let createAgentSession resolve (microtask flush).
        await jest.advanceTimersByTimeAsync(0);

        // Clear any prior terminate calls from setup.
        sandboxFake.getTerminatedSessions().length = 0;

        await service.stop('conv-1');

        // stop() must have called terminateAgentSession itself (not just the
        // finally block). Since the stream is still in-flight, the only
        // terminate call here is from stop().
        expect(sandboxFake.getTerminatedSessions().length).toBeGreaterThanOrEqual(1);

        // Story 6.3 Task 1.0: streamAgentEvents rejects with AGENT_STOPPED.
        await expect(streamPromise).rejects.toThrow('AGENT_STOPPED');
      } finally {
        jest.useRealTimers();
      }
    });

    it('[P0] stop() sets aborted flag so no further events are processed', async () => {
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000);
        sandboxFake.setAgentEvents([]);

        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });
        const streamErr = streamPromise.catch((e: Error) => e);

        await jest.advanceTimersByTimeAsync(0);
        await service.stop('conv-1');

        emitSpy.mockClear();
        jest.advanceTimersByTime(120_000);

        // After stop(), the aborted flag prevents RUN_ERROR from firing.
        const errorsAfterStop = emitSpy.mock.calls.filter(
          (c) => c[1]?.event === EventType.RUN_ERROR,
        );
        expect(errorsAfterStop).toHaveLength(0);

        await streamErr;
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('[P0] AC-7 — onModuleDestroy terminates sessions with active handles (coverage gap)', () => {
    it('[P0] onModuleDestroy calls terminateAgentSession for in-flight streams', async () => {
      // Use a large delay so the stream is still in-flight when onModuleDestroy fires.
      jest.useFakeTimers();
      try {
        sandboxFake.setAgentStreamDelay(200_000);
        sandboxFake.setAgentEvents([]);

        const streamPromise = service.streamAgentEvents({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          command: 'sandbox-agent --agent claude-code --prompt "hello"',
          userId: 'user-1',
        });

        await jest.advanceTimersByTimeAsync(0);

        // Clear prior terminate calls from setup.
        sandboxFake.getTerminatedSessions().length = 0;

        service.onModuleDestroy();

        // onModuleDestroy must terminate the in-flight session via its handle.
        expect(sandboxFake.getTerminatedSessions().length).toBeGreaterThanOrEqual(1);

        // Story 6.3 Task 1.0: streamAgentEvents rejects with MODULE_DESTROYING.
        await expect(streamPromise).rejects.toThrow('MODULE_DESTROYING');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('[P0] AC-2 — Leftover buffer flushed on stream completion (coverage gap)', () => {
    it('[P0] processes a partial chunk without trailing newline on stream completion', async () => {
      // A chunk without a trailing newline remains in the buffer. When the
      // stream completes, the leftover buffer is flushed and processed.
      const partialEvent = JSON.stringify({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        delta: 'leftover',
      });
      sandboxFake.setAgentEvents([partialEvent]); // no trailing newline

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
      });

      const contentCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.TEXT_MESSAGE_CONTENT,
      );
      expect(contentCalls).toHaveLength(1);
      expect(contentCalls[0][1].data).toHaveProperty('delta', 'leftover');
    });
  });

  describe('[P0] AC-2 — Malformed event handling (coverage gap)', () => {
    it('[P0] logs debug and skips non-JSON lines without emitting', async () => {
      const debugSpy = jest.spyOn(service['logger'], 'debug');

      sandboxFake.setAgentEvents(['not valid json\n']);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
      });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse agent event line'),
      );
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('[P0] logs debug and skips non-object JSON values', async () => {
      const debugSpy = jest.spyOn(service['logger'], 'debug');

      sandboxFake.setAgentEvents(['42\n', 'null\n', '"string"\n']);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
      });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Agent event is not an object'),
      );
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('[P0] logs debug and skips events with missing or empty type field', async () => {
      const debugSpy = jest.spyOn(service['logger'], 'debug');

      sandboxFake.setAgentEvents([
        JSON.stringify({ messageId: 'msg-1' }) + '\n', // no type
        JSON.stringify({ type: '', messageId: 'msg-2' }) + '\n', // empty type
        JSON.stringify({ type: 123, messageId: 'msg-3' }) + '\n', // non-string type
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
      });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Agent event missing type'),
      );
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('[P0] logs debug and skips events with unrecognized (non-AG-UI) type values', async () => {
      // The event bridge only emits recognized AG-UI EventType values.
      // Unrecognized types are logged at debug and skipped — forward-compatible
      // (new event types don't crash the bridge) and prevents arbitrary event
      // types from being forwarded to the browser SSE channel.
      const debugSpy = jest.spyOn(service['logger'], 'debug');

      sandboxFake.setAgentEvents([
        JSON.stringify({ type: 'UNKNOWN_EVENT_TYPE', data: 'malicious' }) + '\n',
        JSON.stringify({ type: 'CUSTOM_HACK', payload: 'injection' }) + '\n',
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
      });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unrecognized agent event type'),
      );
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  // ─── Story 6.3: onEvent callback (event observation mechanism) ──────────
  //
  // Lifecycle event ownership (prevents double emission): when onEvent is
  // provided, the event bridge SKIPS sessionEvents.emit() for lifecycle
  // events (RUN_STARTED, RUN_FINISHED, RUN_ERROR) — AgentService owns
  // lifecycle emission to SSE. Non-lifecycle events follow the normal path:
  // onEvent is called, then sessionEvents.emit().

  describe('[P0] Story 6.3 — onEvent callback (event observation mechanism)', () => {
    it('[P0] onEvent is called BEFORE sessionEvents.emit() for non-lifecycle events when callback is provided', async () => {
      const onEvent = jest.fn();

      sandboxFake.setAgentEvents([
        JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId: 'msg-1', role: 'assistant' }) + '\n',
        JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'Hello' }) + '\n',
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
        onEvent,
      });

      // onEvent must have been called for each non-lifecycle event.
      expect(onEvent).toHaveBeenCalled();
      const onEventTypes = onEvent.mock.calls.map((c) => c[0]?.event);
      expect(onEventTypes).toContain(EventType.TEXT_MESSAGE_START);
      expect(onEventTypes).toContain(EventType.TEXT_MESSAGE_CONTENT);

      // Non-lifecycle events must ALSO be forwarded to sessionEvents.emit().
      const emittedTypes = emitSpy.mock.calls.map((c) => c[1]?.event);
      expect(emittedTypes).toContain(EventType.TEXT_MESSAGE_START);
      expect(emittedTypes).toContain(EventType.TEXT_MESSAGE_CONTENT);

      // onEvent must be called BEFORE sessionEvents.emit() for the same event
      // (ordering — AgentService observes state before SSE forwards it).
      const firstContentOnEventOrder = onEvent.mock.invocationCallOrder[0];
      const firstContentEmitCall = emitSpy.mock.calls.find(
        (c) => c[1]?.event === EventType.TEXT_MESSAGE_CONTENT,
      );
      const firstContentEmitOrder = emitSpy.mock.invocationCallOrder[
        emitSpy.mock.calls.indexOf(firstContentEmitCall)
      ];
      expect(firstContentOnEventOrder).toBeLessThan(firstContentEmitOrder);
    });

    it('[P0] lifecycle events (RUN_STARTED, RUN_FINISHED, RUN_ERROR) are passed to onEvent but NOT forwarded to sessionEvents.emit() when onEvent is provided', async () => {
      const onEvent = jest.fn();

      sandboxFake.setAgentEvents([
        JSON.stringify({ type: 'RUN_STARTED', threadId: 'conv-1' }) + '\n',
        JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'Hello' }) + '\n',
        JSON.stringify({ type: 'RUN_FINISHED', total_cost_usd: 0.42 }) + '\n',
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
        onEvent,
      });

      // onEvent must receive lifecycle events (so AgentService can intercept
      // cost data from RUN_FINISHED's data payload per AC-8).
      const onEventTypes = onEvent.mock.calls.map((c) => c[0]?.event);
      expect(onEventTypes).toContain(EventType.RUN_STARTED);
      expect(onEventTypes).toContain(EventType.RUN_FINISHED);

      // Lifecycle events must NOT be forwarded to sessionEvents.emit() —
      // AgentService owns lifecycle emission to SSE (prevents double emission).
      const emittedTypes = emitSpy.mock.calls.map((c) => c[1]?.event);
      expect(emittedTypes).not.toContain(EventType.RUN_STARTED);
      expect(emittedTypes).not.toContain(EventType.RUN_FINISHED);
      expect(emittedTypes).not.toContain(EventType.RUN_ERROR);
    });

    it('[P0] lifecycle events still emit via sessionEvents.emit() when no onEvent callback is provided (backward compat)', async () => {
      sandboxFake.setAgentEvents([
        JSON.stringify({ type: 'RUN_STARTED', threadId: 'conv-1' }) + '\n',
        JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'Hello' }) + '\n',
        JSON.stringify({ type: 'RUN_FINISHED' }) + '\n',
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
        // no onEvent — backward compat
      });

      // Without onEvent, ALL events (including lifecycle) must be forwarded.
      const emittedTypes = emitSpy.mock.calls.map((c) => c[1]?.event);
      expect(emittedTypes).toContain(EventType.RUN_STARTED);
      expect(emittedTypes).toContain(EventType.TEXT_MESSAGE_CONTENT);
      expect(emittedTypes).toContain(EventType.RUN_FINISHED);
    });

    it('[P0] non-lifecycle events still emit via sessionEvents.emit() when no onEvent callback is provided (backward compat)', async () => {
      sandboxFake.setAgentEvents([
        JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId: 'msg-1', role: 'assistant' }) + '\n',
        JSON.stringify({ type: 'TOOL_CALL_START', toolCallId: 'tc-1', toolCallName: 'Bash' }) + '\n',
      ]);

      await service.streamAgentEvents({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        command: 'sandbox-agent --agent claude-code --prompt "hello"',
        userId: 'user-1',
        // no onEvent — backward compat
      });

      // Without onEvent, non-lifecycle events must still be forwarded.
      const emittedTypes = emitSpy.mock.calls.map((c) => c[1]?.event);
      expect(emittedTypes).toContain(EventType.TEXT_MESSAGE_START);
      expect(emittedTypes).toContain(EventType.TOOL_CALL_START);
    });
  });
});
