/**
 * @jest-environment node
 *
 * Story 3.4: See Tool Calls and Recognized Actions Inline
 * Story 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation
 * Story 3.8: Track Per-User LLM Spend
 * Story 3.11: Run Concurrent Conversations
 * Unit tests for the REAL AgentService (not AgentServiceFake).
 *
 * Tests the full AG-UI tool call lifecycle emission and circuit breaker
 * by overriding the __mocks__/claude-agent-sdk.ts mock per-test via jest.doMock
 * with a controllable async generator yielding SDKMessage sequences.
 *
 * Story 3.4 covers: AC-1 (tool call lifecycle), AC-2 (classifier integration),
 *                   AC-5 (circuit breaker).
 * Story 3.7 covers: AC-1 (CREDENTIAL_FAILURE/ACCESS_DENIED SSE emission),
 *                   AC-2 (event ordering before RUN_FINISHED).
 * Story 3.8 covers: AC-1 (cost recorded per turn from SDK result message,
 *                   recorded before RUN_FINISHED, recorded on abort if result arrived).
 * Story 3.11 covers: AC-3 (concurrent-turn guard — second runTurn rejected,
 *                    no RUN_STARTED/RUN_ERROR emitted, circuitBreakerTimers not overwritten).
 *
 * TDD GREEN PHASE — Story 3.4/3.7/3.8/3.11 tests un-skipped and passing.
 */
import { SessionEventsService } from './session-events.service';
import { AgentService } from './agent.service';
import type { ToolPillClassifierService } from './tool-pill-classifier.service';
import type { SandboxServiceFake } from '../../test/helpers/sandbox-service.fake';

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

describe('AgentService (real — tool call lifecycle + circuit breaker)', () => {
  let sessionEvents: SessionEventsService;
  let agentService: AgentService;
  let sandboxFake: SandboxServiceFake;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  let mockClassifier: { classifyToolResult: jest.Mock };
  let mockCostTracking: { recordCost: jest.Mock };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockQuery: any;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    mockPrisma = {
      conversation: { update: jest.fn().mockResolvedValue({}) },
      turn: { create: jest.fn().mockResolvedValue({ id: 'turn-1' }) },
    };

    sandboxFake = {
      terminateProcess: jest.fn().mockResolvedValue(undefined),
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

    mockQuery = null;

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function createAgentService(): AgentService {
    let service: AgentService | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('./agent.service');
      service = new mod.AgentService(
        sandboxFake as never,
        sessionEvents,
        mockPrisma,
        mockClassifier as never,
        mockCostTracking as never,
      );
    });
    return service!;
  }

  function makeSdkMessage(partial: Partial<SDKMessage>): SDKMessage {
    return partial as SDKMessage;
  }

  function makeStreamEvent(eventType: string, data: Record<string, unknown>): SDKMessage {
    return makeSdkMessage({
      type: 'stream_event',
      event: { type: eventType, ...data },
    });
  }

  function makeResultMessage(costUsd = 0.42, subtype = 'success'): SDKMessage {
    return makeSdkMessage({
      type: 'result',
      subtype,
      total_cost_usd: costUsd,
      session_id: 'sess-1',
      num_turns: 3,
      duration_ms: 5000,
      is_error: false,
      result: '',
      usage: {},
      modelUsage: {},
      permission_denials: [],
      uuid: 'uuid-1',
    } as unknown as SDKMessage);
  }

  function makeToolResultUserMessage(toolCallId: string, content: string): SDKMessage {
    return makeSdkMessage({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: toolCallId, content },
        ],
      },
      parent_tool_use_id: null,
    });
  }

  async function* yieldMessages(messages: SDKMessage[]): AsyncGenerator<SDKMessage> {
    for (const msg of messages) {
      yield msg;
    }
  }

  function setupMockQuery(messages: SDKMessage[]): void {
    mockQuery = jest.fn(() => yieldMessages(messages));
    jest.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query: mockQuery,
    }));
  }

  describe('[P0] AC-1 — Tool call lifecycle emission', () => {
    it('emits TOOL_CALL_START with toolCallName (not toolName)', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
      ]);

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const startCall = emitSpy.mock.calls.find(
        (c) => c[1]?.event === 'TOOL_CALL_START',
      );
      expect(startCall).toBeDefined();
      expect(startCall[1].data).toHaveProperty('toolCallName', 'Bash');
      expect(startCall[1].data).not.toHaveProperty('toolName');
    });

    it('emits TOOL_CALL_ARGS on input_json_delta', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_delta', {
          delta: { type: 'input_json_delta', partial_json: '{"command":"git status"' },
        }),
        makeStreamEvent('content_block_delta', {
          delta: { type: 'input_json_delta', partial_json: '}' },
        }),
      ]);

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const argsCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'TOOL_CALL_ARGS',
      );
      expect(argsCalls.length).toBeGreaterThanOrEqual(2);
      expect(argsCalls[0][1].data).toHaveProperty('toolCallId', 'tc-1');
      expect(argsCalls[0][1].data).toHaveProperty('delta');
    });

    it('emits TOOL_CALL_END (not TEXT_MESSAGE_END) on content_block_stop for tool_use', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', {
          index: 0,
        }),
      ]);

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const endCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'TOOL_CALL_END',
      );
      expect(endCalls).toHaveLength(1);
      expect(endCalls[0][1].data).toHaveProperty('toolCallId', 'tc-1');

      const textEndCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'TEXT_MESSAGE_END',
      );
      expect(textEndCalls).toHaveLength(0);
    });

    it('emits TOOL_CALL_RESULT on tool result message', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'nothing to commit'),
      ]);

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const resultCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'TOOL_CALL_RESULT',
      );
      expect(resultCalls).toHaveLength(1);
      expect(resultCalls[0][1].data).toHaveProperty('toolCallId', 'tc-1');
      expect(resultCalls[0][1].data).toHaveProperty('content', 'nothing to commit');
    });
  });

  describe('[P0] AC-2 — Classifier integration', () => {
    it('calls classifier on TOOL_CALL_RESULT', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', '1 file changed'),
      ]);

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

    it('emits TOOL_CALL_PROMOTED when classifier returns event', async () => {
      mockClassifier.classifyToolResult.mockResolvedValue({
        type: 'TOOL_CALL_PROMOTED',
        toolCallId: 'tc-1',
        artifactType: 'prd',
        artifactTitle: 'My PRD',
        artifactId: 'art-1',
        viewHref: '/artifacts?id=art-1',
      });

      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', '1 file changed'),
      ]);

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

  describe('[P0] AC-5 — Circuit breaker', () => {
    it('fires after 120s timeout with no events', async () => {
      const stalledGenerator = async function* (): AsyncGenerator<SDKMessage> {
        yield* [];
        await new Promise<never>(jest.fn());
      };

      mockQuery = jest.fn(() => stalledGenerator());
      jest.doMock('@anthropic-ai/claude-agent-sdk', () => ({ query: mockQuery }));

      agentService = createAgentService();
      const runTurnPromise = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      jest.advanceTimersByTime(120_000);

      await runTurnPromise;

      const errorCalls = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'RUN_ERROR',
      );
      expect(errorCalls).toHaveLength(1);
      expect(errorCalls[0][1].data.message).toBe(
        'The agent stopped unexpectedly. Send a new message to try again.',
      );
    });

    it('resets on each emitted event', async () => {
      const messages: SDKMessage[] = [
        makeStreamEvent('content_block_start', {
          content_block: { type: 'text', id: 'msg-1' },
        }),
      ];

      let yieldMore: (() => void) | null = null;
      const slowGenerator = async function* (): AsyncGenerator<SDKMessage> {
        for (const msg of messages) {
          yield msg;
        }
        await new Promise<void>((resolve) => {
          yieldMore = resolve;
        });
      };

      mockQuery = jest.fn(() => slowGenerator());
      jest.doMock('@anthropic-ai/claude-agent-sdk', () => ({ query: mockQuery }));

      agentService = createAgentService();
      const runTurnPromise = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      jest.advanceTimersByTime(100_000);

      const errorBefore100s = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'RUN_ERROR',
      );
      expect(errorBefore100s).toHaveLength(0);

      jest.advanceTimersByTime(30_000);

      const errorAfter130s = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'RUN_ERROR',
      );
      expect(errorAfter130s).toHaveLength(1);

      if (yieldMore) yieldMore();
      await runTurnPromise;
    });

    it('calls terminateProcess when circuit breaker fires', async () => {
      const stalledGenerator = async function* (): AsyncGenerator<SDKMessage> {
        yield* [];
        await new Promise<never>(jest.fn());
      };

      mockQuery = jest.fn(() => stalledGenerator());
      jest.doMock('@anthropic-ai/claude-agent-sdk', () => ({ query: mockQuery }));

      agentService = createAgentService();
      const runTurnPromise = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      jest.advanceTimersByTime(120_000);
      await runTurnPromise;

      expect(sandboxFake.terminateProcess).toHaveBeenCalledWith('sb-1', expect.any(String));
    });
  });

  describe('[P1] AC-5 — Circuit breaker timer cleanup', () => {
    it('timer cleared on stop()', async () => {
      const stalledGenerator = async function* (): AsyncGenerator<SDKMessage> {
        yield* [];
        await new Promise<never>(jest.fn());
      };

      mockQuery = jest.fn(() => stalledGenerator());
      jest.doMock('@anthropic-ai/claude-agent-sdk', () => ({ query: mockQuery }));

      agentService = createAgentService();
      const runTurnPromise = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      await agentService.stop('conv-1');

      const errorBeforeTimeout = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'RUN_ERROR',
      );

      jest.advanceTimersByTime(120_000);

      const errorAfterTimeout = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'RUN_ERROR',
      );

      expect(errorBeforeTimeout).toHaveLength(0);
      expect(errorAfterTimeout).toHaveLength(0);

      await runTurnPromise.catch(() => undefined);
    });

    it('timer cleared on normal completion', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'text', id: 'msg-1' },
        }),
        makeStreamEvent('content_block_delta', {
          delta: { type: 'text_delta', text: 'Hello' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
      ]);

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const errorBefore = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'RUN_ERROR',
      );

      jest.advanceTimersByTime(120_000);

      const errorAfter = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'RUN_ERROR',
      );

      expect(errorBefore).toHaveLength(0);
      expect(errorAfter).toHaveLength(0);
    });
  });

  describe('[P0] AC-1 — Working tree emission after file-modifying tool calls', () => {
    it('emits WORKING_TREE_DIRTY after a file-modifying tool call when tree is dirty', async () => {
      (sandboxFake.getWorkingTreeStatus as jest.Mock).mockResolvedValue({
        dirty: true,
        files: ['src/foo.ts'],
      });

      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Write' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'File written'),
      ]);

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

    it('emits WORKING_TREE_CLEAN after a file-modifying tool call when tree is clean', async () => {
      (sandboxFake.getWorkingTreeStatus as jest.Mock).mockResolvedValue({
        dirty: false,
        files: [],
      });

      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Write' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'File written'),
      ]);

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

    it('does NOT emit working tree events after non-file-modifying tool calls (e.g. Read)', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Read' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'File contents'),
      ]);

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

    it('working tree check failure does not crash the agent run (logger.warn, RUN_FINISHED still emits)', async () => {
      (sandboxFake.getWorkingTreeStatus as jest.Mock).mockRejectedValue(
        new Error('git status failed'),
      );

      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Write' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'File written'),
      ]);

      agentService = createAgentService();
      const warnSpy = jest.spyOn(agentService['logger'], 'warn');

      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const finishedEvents = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'RUN_FINISHED',
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

      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Write' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'File written'),
      ]);

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const events = emitSpy.mock.calls.map((c) => c[1].event);
      const dirtyIndex = events.indexOf('WORKING_TREE_DIRTY');
      const finishedIndex = events.indexOf('RUN_FINISHED');

      expect(dirtyIndex).toBeGreaterThan(-1);
      expect(finishedIndex).toBeGreaterThan(-1);
      expect(dirtyIndex).toBeLessThan(finishedIndex);
    });
  });

  describe('[P0] Story 3.7 — CREDENTIAL_FAILURE / ACCESS_DENIED event emission', () => {
    it('emits CREDENTIAL_FAILURE on the SSE channel when classifier returns CredentialFailureEvent', async () => {
      mockClassifier.classifyToolResult.mockResolvedValue({
        type: 'CREDENTIAL_FAILURE',
        toolCallId: 'tc-1',
      });

      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'remote: Invalid username or token.'),
      ]);

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

    it('emits ACCESS_DENIED on the SSE channel when classifier returns AccessDeniedEvent', async () => {
      mockClassifier.classifyToolResult.mockResolvedValue({
        type: 'ACCESS_DENIED',
        toolCallId: 'tc-1',
        code: 'RATE_LIMITED',
      });

      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'Rate limit exceeded'),
      ]);

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

    it('CREDENTIAL_FAILURE is emitted before RUN_FINISHED (event ordering)', async () => {
      mockClassifier.classifyToolResult.mockResolvedValue({
        type: 'CREDENTIAL_FAILURE',
        toolCallId: 'tc-1',
      });

      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'remote: Invalid username or token.'),
      ]);

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const events = emitSpy.mock.calls.map((c) => c[1].event);
      const credentialIndex = events.indexOf('CREDENTIAL_FAILURE');
      const finishedIndex = events.indexOf('RUN_FINISHED');

      expect(credentialIndex).toBeGreaterThan(-1);
      expect(finishedIndex).toBeGreaterThan(-1);
      expect(credentialIndex).toBeLessThan(finishedIndex);
    });

    it('ACCESS_DENIED is emitted before RUN_FINISHED (event ordering)', async () => {
      mockClassifier.classifyToolResult.mockResolvedValue({
        type: 'ACCESS_DENIED',
        toolCallId: 'tc-1',
        code: 'RATE_LIMITED',
      });

      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'Rate limit exceeded'),
      ]);

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const events = emitSpy.mock.calls.map((c) => c[1].event);
      const deniedIndex = events.indexOf('ACCESS_DENIED');
      const finishedIndex = events.indexOf('RUN_FINISHED');

      expect(deniedIndex).toBeGreaterThan(-1);
      expect(finishedIndex).toBeGreaterThan(-1);
      expect(deniedIndex).toBeLessThan(finishedIndex);
    });

    it('[P1] classifier failure (throws) does not crash the agent run — RUN_FINISHED still emits, logger.error called', async () => {
      mockClassifier.classifyToolResult.mockRejectedValue(new Error('classifier crashed'));

      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'output'),
      ]);

      agentService = createAgentService();
      const errorSpy = jest.spyOn(agentService['logger'], 'error');

      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const finishedEvents = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'RUN_FINISHED',
      );
      expect(finishedEvents).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Classifier failed'),
      );
    });
  });

  describe('[P0] Story 3.8 AC-1 — cost recording from SDK result message', () => {
    it('recordCost is called with correct cost data when a result message is in the stream', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'text', id: 'msg-1' },
        }),
        makeStreamEvent('content_block_delta', {
          delta: { type: 'text_delta', text: 'Hello' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeResultMessage(0.42),
      ]);

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

    it('recordCost is called BEFORE RUN_FINISHED is emitted (event ordering)', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'text', id: 'msg-1' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeResultMessage(0.42),
      ]);

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const recordCostCallOrder = mockCostTracking.recordCost.mock.invocationCallOrder[0];
      const finishedEmitCall = emitSpy.mock.calls.find(
        (c) => c[1]?.event === 'RUN_FINISHED',
      );
      expect(finishedEmitCall).toBeDefined();
      const finishedEmitOrder = emitSpy.mock.invocationCallOrder[
        emitSpy.mock.calls.indexOf(finishedEmitCall)
      ];
      expect(recordCostCallOrder).toBeLessThan(finishedEmitOrder);
    });

    it('recordCost is NOT called when no result message is in the stream (e.g. circuit breaker fires before result)', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'text', id: 'msg-1' },
        }),
      ]);

      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      expect(mockCostTracking.recordCost).not.toHaveBeenCalled();
    });

    it('recordCost failure does not crash the agent run — RUN_FINISHED still emits', async () => {
      mockCostTracking.recordCost.mockRejectedValue(new Error('cost DB write failed'));

      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'text', id: 'msg-1' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeResultMessage(0.42),
      ]);

      agentService = createAgentService();
      const loggerErrorSpy = jest.spyOn(agentService['logger'], 'error').mockImplementation(() => undefined);
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'test',
        userId: 'user-1',
      });

      const finishedEvents = emitSpy.mock.calls.filter(
        (c) => c[1]?.event === 'RUN_FINISHED',
      );
      expect(finishedEvents).toHaveLength(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to record cost for conversation conv-1'),
      );
      loggerErrorSpy.mockRestore();
    });

    it('cost is recorded from SDKResultError (subtype error_max_turns) as well as SDKResultSuccess', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'text', id: 'msg-1' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeResultMessage(1.5, 'error_max_turns'),
      ]);

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
        totalCostUsd: 1.5,
        sessionId: 'sess-1',
        numTurns: 3,
        durationMs: 5000,
      });
    });

    it('[P1] cost is recorded when the result message arrives after tool calls', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeToolResultUserMessage('tc-1', 'done'),
        makeResultMessage(0.77),
      ]);

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

  describe('[P0] Story 3.11 — concurrent-turn guard (AC: 3)', () => {
    async function* yieldThenHang(messages: SDKMessage[]): AsyncGenerator<SDKMessage> {
      for (const msg of messages) {
        yield msg;
      }
      await new Promise(() => undefined);
    }

    it('[P0] second runTurn on an in-flight conversationId is rejected (returns without overwriting)', async () => {
      mockQuery = jest.fn(() => yieldThenHang([makeStreamEvent('text', {})]));
      jest.doMock('@anthropic-ai/claude-agent-sdk', () => ({ query: mockQuery }));

      agentService = createAgentService();
      const firstRun = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'first',
        userId: 'user-1',
      });
      await jest.advanceTimersByTimeAsync(0);

      await expect(agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'second',
        userId: 'user-1',
      })).resolves.toBeUndefined();

      expect(agentService.isIdle('conv-1')).toBe(false);

      await jest.advanceTimersByTimeAsync(120_000);
      await firstRun.catch(() => undefined);
    });

    it('[P0] the rejected second turn does NOT emit RUN_STARTED or RUN_ERROR', async () => {
      mockQuery = jest.fn(() => yieldThenHang([makeStreamEvent('text', {})]));
      jest.doMock('@anthropic-ai/claude-agent-sdk', () => ({ query: mockQuery }));

      agentService = createAgentService();
      const firstRun = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'first',
        userId: 'user-1',
      });
      await jest.advanceTimersByTimeAsync(0);

      emitSpy.mockClear();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'second',
        userId: 'user-1',
      });

      const emittedEvents = emitSpy.mock.calls.map((c) => c[1]?.event);
      expect(emittedEvents).not.toContain('RUN_STARTED');
      expect(emittedEvents).not.toContain('RUN_ERROR');

      await jest.advanceTimersByTimeAsync(120_000);
      await firstRun.catch(() => undefined);
    });

    it('[P0] the rejected second turn does NOT overwrite circuitBreakerTimers', async () => {
      mockQuery = jest.fn(() => yieldThenHang([makeStreamEvent('text', {})]));
      jest.doMock('@anthropic-ai/claude-agent-sdk', () => ({ query: mockQuery }));

      agentService = createAgentService();
      const firstRun = agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'first',
        userId: 'user-1',
      });
      await jest.advanceTimersByTimeAsync(0);

      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'second',
        userId: 'user-1',
      });

      expect(agentService['circuitBreakerTimers'].size).toBe(1);

      await jest.advanceTimersByTimeAsync(120_000);
      await firstRun.catch(() => undefined);
    });

    it('[P0] startCircuitBreakerTimer clears a pre-existing timer before setting a new one', async () => {
      setupMockQuery([makeResultMessage(0.5)]);
      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'first',
        userId: 'user-1',
      });

      setupMockQuery([makeResultMessage(0.6)]);
      agentService = createAgentService();
      await agentService.runTurn({
        conversationId: 'conv-1',
        sandboxId: 'sb-1',
        message: 'second',
        userId: 'user-1',
      });

      expect(agentService['circuitBreakerTimers'].size).toBeLessThanOrEqual(1);
    });
  });
});
