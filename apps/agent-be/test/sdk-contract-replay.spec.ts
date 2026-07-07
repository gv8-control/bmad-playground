/**
 * @jest-environment node
 *
 * SDK contract replay test — audit findings #1 and #4.
 *
 * Replays a real recorded `@anthropic-ai/claude-agent-sdk` session
 * (test/fixtures/sdk-session-replay.jsonl) through the REAL AgentService
 * pipeline (processSdkMessage → processStreamEvent / processAssistantMessage /
 * processUserMessage) and asserts the AG-UI event sequence emitted via
 * sessionEvents.emit is correct.
 *
 * This is the automated form of the architecture's prescribed upgrade check:
 *   "run the new version against a recorded BMAD session replay and validate
 *    the expected AG-UI event sequence matches" (architecture.md).
 * No API key, no Daytona, no network — runs in every CI pipeline.
 *
 * To refresh the fixture after an SDK upgrade:
 *   dotenv -e .env -- ts-node --transpile-only \
 *     apps/agent-be/test/fixtures/record-session.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SessionEventsService } from '../src/streaming/session-events.service';
import { AgentService } from '../src/streaming/agent.service';
import type { SandboxServiceFake } from './helpers/sandbox-service.fake';
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createMockQuery, getInterruptMock } from './helpers/mock-query';
import { EventType } from '@ag-ui/core';

const FIXTURE_PATH = join(__dirname, 'fixtures/sdk-session-replay.jsonl');

/**
 * Load the recorded session. `JSON.parse` returns `any`; assigning it to
 * `SDKMessage[]` is NOT an `as` assertion — the recorded JSONL is real SDK
 * output (the contract under test), and replaying real recorded data is the
 * prescribed technique. The structural assertions below validate that the
 * pipeline processes this real contract correctly.
 */
function loadFixture(): SDKMessage[] {
  const text = readFileSync(FIXTURE_PATH, 'utf8');
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  const messages: SDKMessage[] = lines.map((line) => JSON.parse(line));
  return messages;
}

type SDKResultMessage = Extract<SDKMessage, { type: 'result' }>;

describe('SDK contract replay (real recorded session → AgentService → AG-UI)', () => {
  let sessionEvents: SessionEventsService;
  let sandboxFake: SandboxServiceFake;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  let mockClassifier: { classifyToolResult: jest.Mock };
  let mockCostTracking: { recordCost: jest.Mock };
  let emitSpy: jest.SpyInstance;
  let fixtureMessages: SDKMessage[];

  beforeAll(() => {
    fixtureMessages = loadFixture();
  });

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
    mockClassifier = { classifyToolResult: jest.fn().mockResolvedValue(null) };
    mockCostTracking = { recordCost: jest.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  /**
   * Construct a real AgentService with the SDK's `query` factory replaced by
   * `queryFactory` (defaults to a fixture-driven mock). Passing a `jest.fn`-
   * wrapped factory lets callers reach the resulting `Query` instance via
   * `getInterruptMock(factory)` (used by the interrupt-coverage test).
   */
  function createAgentService(queryFactory: () => Query = (): Query => createMockQuery(fixtureMessages)): AgentService {
    let service: AgentService | undefined;
    jest.isolateModules(() => {
      jest.doMock('@anthropic-ai/claude-agent-sdk', () => ({
        query: queryFactory,
      }));
      const mod = require('../src/streaming/agent.service');
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

  it('the committed fixture covers the message types the audit found untested', () => {
    // Finding #1: processAssistantMessage had ZERO coverage — the fixture MUST
    // include a real `assistant` message. Also covers stream_event, user, result.
    //
    // Note (I-1): the replay test does NOT meaningfully exercise
    // processAssistantMessage's tool-registration logic, because the
    // `assistant` message arrives AFTER the `content_block_start` stream
    // event for the same tool. By the time processAssistantMessage runs, the
    // tool is already registered in activeToolCalls (by processStreamEvent),
    // so the `has(block.id)` short-circuit at agent.service.ts:457 returns
    // true and registration is skipped. The replay test's purpose is to
    // validate the REAL recorded session flow (event ordering, lifecycle
    // bookends, cost capture) — not to redundantly exercise a code path
    // already covered by the focused unit test at
    // `src/streaming/agent.service.unit.spec.ts:~1168` (audit finding #1
    // test, which sends an `assistant` message with NO preceding stream
    // event). Do NOT modify the fixture to manufacture
    // processAssistantMessage coverage here — that would defeat the fixture's
    // purpose as a real-session replay.
    const types = new Set(fixtureMessages.map((m) => m.type));
    expect(types).toContain('stream_event');
    expect(types).toContain('assistant');
    expect(types).toContain('user');
    expect(types).toContain('result');
  });

  it('emits the expected AG-UI event sequence for the recorded session', async () => {
    const agentService = createAgentService();
    await agentService.runTurn({
      conversationId: 'conv-replay',
      sandboxId: 'sb-replay',
      message: 'replay',
      userId: 'user-replay',
    });

    const events = emitSpy.mock.calls.map((c) => c[1]?.event as string);

    // Lifecycle bookends, no error.
    expect(events[0]).toBe(EventType.RUN_STARTED);
    expect(events[events.length - 1]).toBe(EventType.RUN_FINISHED);
    expect(events).not.toContain(EventType.RUN_ERROR);

    // Tool-call lifecycle from the streaming content_block_* events (Bash tool_use).
    const toolStart = events.indexOf(EventType.TOOL_CALL_START);
    const toolArgs = events.indexOf(EventType.TOOL_CALL_ARGS);
    const toolEnd = events.indexOf(EventType.TOOL_CALL_END);
    expect(toolStart).toBeGreaterThan(-1);
    expect(toolArgs).toBeGreaterThan(toolStart);
    expect(toolEnd).toBeGreaterThan(toolArgs);

    // The SDKUserMessage's tool_result → TOOL_CALL_RESULT (processUserMessage),
    // followed by a working-tree event (Bash is a file-modifying tool).
    const toolResult = events.indexOf(EventType.TOOL_CALL_RESULT);
    expect(toolResult).toBeGreaterThan(toolEnd);
    const workingTreeAfter = events.findIndex(
      (e, i) => i > toolResult && /^WORKING_TREE_(DIRTY|CLEAN)$/.test(e),
    );
    expect(workingTreeAfter).toBeGreaterThan(toolResult);

    // Text lifecycle from the second assistant turn's content_block_* events.
    const textStart = events.indexOf(EventType.TEXT_MESSAGE_START);
    const textContent = events.indexOf(EventType.TEXT_MESSAGE_CONTENT);
    const textEnd = events.indexOf(EventType.TEXT_MESSAGE_END);
    expect(textStart).toBeGreaterThan(workingTreeAfter);
    expect(textContent).toBeGreaterThan(textStart);
    expect(textEnd).toBeGreaterThan(textContent);
  });

  it('records cost from the SDKResultMessage', async () => {
    const agentService = createAgentService();
    await agentService.runTurn({
      conversationId: 'conv-replay',
      sandboxId: 'sb-replay',
      message: 'replay',
      userId: 'user-replay',
    });

    const resultMsg = fixtureMessages.find(
      (m): m is SDKResultMessage => m.type === 'result',
    );
    expect(resultMsg).toBeDefined();
    if (!resultMsg) {
      throw new Error('fixture missing result message');
    }
    expect(mockCostTracking.recordCost).toHaveBeenCalledWith({
      userId: 'user-replay',
      conversationId: 'conv-replay',
      totalCostUsd: resultMsg.total_cost_usd,
      sessionId: resultMsg.session_id,
      numTurns: resultMsg.num_turns,
      durationMs: resultMsg.duration_ms,
    });
  });

  it('the mocked query exposes a real interrupt() method (no swallowed TypeError)', async () => {
    // Finding #3: the old mock query was a bare async generator with no
    // interrupt(), and `activeRun.query.interrupt is not a function` was
    // swallowed by try/catch. createMockQuery returns a proper Query, so a
    // mid-turn stop() can call interrupt() without throwing.
    //
    // I-2: asserting `RUN_FINISHED` emitted and `RUN_ERROR` not emitted does
    // NOT prove interrupt() ran — both would be true with the old broken
    // mock (the try/catch swallows the TypeError). The direct assertion
    // `expect(getInterruptMock(...)).toHaveBeenCalled()` proves it.
    const mockQueryFactory = jest.fn((): Query => createMockQuery(fixtureMessages));
    const agentService = createAgentService(mockQueryFactory);
    const runTurnPromise = agentService.runTurn({
      conversationId: 'conv-replay',
      sandboxId: 'sb-replay',
      message: 'replay',
      userId: 'user-replay',
    });
    await agentService.stop('conv-replay');
    await runTurnPromise.catch(() => undefined);

    // Directly verifies interrupt() was called on the Query instance that
    // createMockQuery produced — not just that no error escaped.
    expect(getInterruptMock(mockQueryFactory)).toHaveBeenCalled();

    // No RUN_ERROR from a missing interrupt(): stop() emits RUN_FINISHED.
    const events = emitSpy.mock.calls.map((c) => c[1]?.event as string);
    expect(events).not.toContain(EventType.RUN_ERROR);
    expect(events).toContain(EventType.RUN_FINISHED);
  });
});
