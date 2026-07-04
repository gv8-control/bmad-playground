/**
 * @jest-environment node
 *
 * Story 3.4: See Tool Calls and Recognized Actions Inline
 * Unit tests for the REAL AgentService (not AgentServiceFake).
 *
 * Tests the full AG-UI tool call lifecycle emission and circuit breaker
 * by overriding the __mocks__/claude-agent-sdk.ts mock per-test via jest.doMock
 * with a controllable async generator yielding SDKMessage sequences.
 *
 * Covers: AC-1 (tool call lifecycle), AC-2 (classifier integration),
 *         AC-5 (circuit breaker).
 *
 * TDD RED PHASE — tests are skipped until implementation lands.
 * Remove it.skip() → it() when activating for the current task.
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
    } as unknown as SandboxServiceFake;

    sessionEvents = new SessionEventsService();
    emitSpy = jest.spyOn(sessionEvents, 'emit');

    mockClassifier = {
      classifyToolResult: jest.fn().mockResolvedValue(null),
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
    return new AgentService(
      sandboxFake as never,
      sessionEvents,
      mockPrisma,
      mockClassifier as never,
    );
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
    it.skip('emits TOOL_CALL_START with toolCallName (not toolName)', async () => {
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

    it.skip('emits TOOL_CALL_ARGS on input_json_delta', async () => {
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

    it.skip('emits TOOL_CALL_END (not TEXT_MESSAGE_END) on content_block_stop for tool_use', async () => {
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

    it.skip('emits TOOL_CALL_RESULT on tool result message', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeSdkMessage({
          type: 'assistant',
          content: [
            { type: 'tool_result', tool_use_id: 'tc-1', content: 'nothing to commit' },
          ],
        }),
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
    it.skip('calls classifier on TOOL_CALL_RESULT', async () => {
      setupMockQuery([
        makeStreamEvent('content_block_start', {
          content_block: { type: 'tool_use', id: 'tc-1', name: 'Bash' },
        }),
        makeStreamEvent('content_block_stop', { index: 0 }),
        makeSdkMessage({
          type: 'assistant',
          content: [
            { type: 'tool_result', tool_use_id: 'tc-1', content: '1 file changed' },
          ],
        }),
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

    it.skip('emits TOOL_CALL_PROMOTED when classifier returns event', async () => {
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
        makeSdkMessage({
          type: 'assistant',
          content: [
            { type: 'tool_result', tool_use_id: 'tc-1', content: '1 file changed' },
          ],
        }),
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
    it.skip('fires after 120s timeout with no events', async () => {
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

    it.skip('resets on each emitted event', async () => {
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

    it.skip('calls terminateProcess when circuit breaker fires', async () => {
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
    it.skip('timer cleared on stop()', async () => {
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

    it.skip('timer cleared on normal completion', async () => {
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
});
