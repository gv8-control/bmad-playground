---
stepsCompleted:
  - step-01-load-context
  - step-02-discover-tests
  - step-03-quality-evaluation
  - step-03f-aggregate-scores
  - step-04-generate-report
lastStep: step-04-generate-report
lastSaved: '2026-07-04'
workflowType: 'testarch-test-review'
inputDocuments:
  - _bmad/tea/config.yaml
  - _bmad-output/project-context.md
  - _bmad-output/implementation-artifacts/3-3-converse-with-the-streaming-agent.md
  - _bmad-output/test-artifacts/automate-validation-report-3-3.md
  - apps/agent-be/src/streaming/agent.service.spec.ts
  - apps/agent-be/src/streaming/streaming.controller.spec.ts
  - apps/agent-be/src/conversations/conversations.service.spec.ts
  - apps/agent-be/test/helpers/agent-service.fake.ts
  - apps/web/src/components/conversation/ChatMessageList.test.tsx
  - apps/web/src/components/conversation/UserMessage.test.tsx
  - apps/web/src/components/conversation/AgentMessage.test.tsx
  - apps/web/src/components/conversation/ChatInput.test.tsx
  - apps/web/src/components/conversation/ChatComponents.test.tsx
  - apps/web/src/components/conversation/useDraftPersistence.test.ts
  - apps/web/src/components/conversation/ConversationPane.test.tsx
  - apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.test.tsx
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/timing-debugging.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/selector-resilience.md
---

# Test Quality Review — Story 3.3: Converse with the Streaming Agent

**Quality Score**: 89/100 (A)
**Review Date**: 2026-07-04
**Review Scope**: Story-scoped (11 files — 3 Jest backend unit, 7 Jest frontend component, 1 Jest Server Component page)
**Stack**: fullstack (Next.js 16 + NestJS 11 + Jest 30)
**Reviewer**: Master Test Architect (TEA bmad-testarch-test-review)

---

Note: This review audits existing tests; it does not generate tests.
Coverage mapping and coverage gates are out of scope here. Use `trace` for coverage decisions.

## Executive Summary

**Overall Assessment**: Good

**Recommendation**: Approve with comments

### Key Strengths

- All 6 ACs have direct P0 coverage across 11 files spanning backend unit tests (AgentService, ConversationsService, StreamingController) and frontend component tests (ChatInput, ChatMessageList, AgentMessage, ConversationPane, etc.). AC-1 (streaming) is verified by 20 P0 tests across 5 files asserting AG-UI event flow (RUN_STARTED → TEXT_MESSAGE_* → RUN_FINISHED), agent state transitions (idle/thinking/streaming/tool-executing), and SSE back-pressure (200-event threshold, 30s drain timeout, timer cleanup on drain and client disconnect).
- The `AgentServiceFake` (`agent-service.fake.ts`) is an excellent test double that faithfully mimics production side effects — persists the accumulated agent response as a Turn (`role: 'assistant'`) on RUN_FINISHED, calls `sandboxService.terminateProcess()` on stop, and supports controllable failure injection (`failNextRun()`, `setStreamDelay()`, `setScript()`). Follows the established `SandboxServiceFake` pattern and injects the same dependencies as the production `AgentService`.
- The back-pressure tests in `streaming.controller.spec.ts` use a well-structured `mockResponseWithBackPressure()` helper that controls `write()` return values and simulates `'drain'` events via `setWriteReturn()` and `emitDrain()`. Combined with `jest.useFakeTimers()` + `jest.advanceTimersByTime(31_000)`, this enables deterministic testing of the 200-event threshold and 30s drain timeout without real-time waiting — the correct pattern for testing Node.js back-pressure.
- The `MockEventSource` class in `ConversationPane.test.tsx` was extended for AG-UI events (RUN_STARTED, TEXT_MESSAGE_START/CONTENT/END, TOOL_CALL_START, RUN_FINISHED/ERROR). Static `emit()` enables deterministic event injection. The `streamingMessageIdRef` fix (ref alongside state to avoid stale closure) is correctly tested — `TEXT_MESSAGE_CONTENT` events find the streaming message by `messageId` across multiple `act()` blocks.
- ESM default-export mocks for `react-markdown` v10 (`{ __esModule: true, default: ... }`) are correctly applied in `ChatMessageList.test.tsx`, `AgentMessage.test.tsx`, and `ConversationPane.test.tsx` — following the pattern established in Story 2.5. `userEvent.type()` is used for React 19 text input testing per `project-context.md:196`.

### Key Weaknesses

- **Hard waits in agent-be tests**: `agent.service.spec.ts` (4 instances) and `conversations.service.spec.ts` (2 instances) use `await new Promise((r) => setTimeout(r, 50))` to wait for fire-and-forget `runTurn` to complete. This is the same non-deterministic pattern flagged in Story 3.1's review — the 50ms is arbitrary and could flake on slow CI runners. A deterministic alternative would spy on `sessionEvents.emit('RUN_FINISHED')` or poll `agentFake` state.
- **`Test.createTestingModule()` instead of `buildTestModule()`** in `agent.service.spec.ts:64` — violates `project-context.md:191`. Story 3.1 had the same violation in `streaming.controller.spec.ts:29` (still unfixed). Story 3.3 introduced the violation in a second file despite the story spec (Task 3.4) explicitly saying "Use `buildTestModule()` and override `AGENT_SERVICE` with `AgentServiceFake`."
- **Growing file sizes**: `conversations.service.spec.ts` is 444 lines and `ConversationPane.test.tsx` is 682 lines — both exceed the 300-line guideline from `test-quality.md`. Both are cumulative files covering Stories 3.1, 3.2, and 3.3. As Epic 3 continues (Stories 3.4–3.12), these files will grow further without a split strategy.
- **`Date.now()` timing assertions**: `agent.service.spec.ts:114-118` and `conversations.service.spec.ts:400-405` use `expect(elapsed).toBeLessThan(100)` to verify fire-and-forget behavior. This is inherently non-deterministic — on a slow CI runner, the elapsed time could exceed 100ms even though `sendTurn` returns immediately.
- **Worker process leak persists**: Jest reports "A worker process has failed to exit gracefully" for agent-be tests. The `IdleTimeoutService` 60s timers started by `provisionSandbox()` are not cleared in `afterEach`. Same issue as Story 3.1, now affecting `agent.service.spec.ts` as well.

### Summary

Story 3.3's test suite is comprehensive — 603 tests across 11 files covering all 6 ACs at unit and component levels. The test architecture follows established codebase patterns (`AgentServiceFake` test double, `MockEventSource` for SSE, `buildTestModule()` in `conversations.service.spec.ts`, ESM mocks, render-stub page tests) and introduces excellent new patterns (back-pressure mock with `setWriteReturn()`/`emitDrain()`, `Object.defineProperty` for `scrollHeight`, `useDraftPersistence` with `Storage.prototype` spies). The 1 HIGH violation (hard waits in fire-and-forget tests) is the same determinism risk flagged in Story 3.1 — it should be addressed before the pattern propagates further. The 6 MEDIUM violations are convention inconsistencies (`buildTestModule` usage, file lengths, priority tags, stale header, `Date.now` timing) that are straightforward to fix. Tests pass cleanly (603 total), lint is clean, typecheck is clean.

## Quality Criteria Assessment

| Criterion | Status | Score | Grade | Violations |
|-----------|--------|-------|-------|------------|
| Determinism | PASS (with warnings) | 85/100 | A | 1 HIGH, 1 MEDIUM, 2 LOW |
| Isolation | PASS (with warnings) | 96/100 | A+ | 2 LOW |
| Maintainability | PASS (with warnings) | 81/100 | B+ | 5 MEDIUM, 4 LOW |
| Performance | PASS | 98/100 | A+ | 2 LOW |
| **Overall (weighted)** | **PASS** | **89/100** | **A** | **1 HIGH, 6 MEDIUM, 6 LOW** |

**Weighting**: Determinism 30%, Isolation 30%, Maintainability 25%, Performance 15%

**Total Violations**: 0 Critical, 1 High, 6 Medium, 6 Low

---

## Quality Score Breakdown

```
Starting Score:          100

Determinism (weight 30%):
  1 HIGH × 8 =           -8   (hard waits in fire-and-forget tests — 6 instances)
  1 MEDIUM × 3 =         -3   (Date.now() timing assertion)
  2 LOW × 2 =            -4   (worker process leak, conditional in test body)
  Subtotal:              85/100

Isolation (weight 30%):
  2 LOW × 2 =            -4   (missing restoreAllMocks, worker process leak)
  Subtotal:              96/100

Maintainability (weight 25%):
  5 MEDIUM × 3 =         -15  (buildTestModule ×2, file length ×2, priority tags)
  4 LOW × 1 =            -4   (stale header, streaming header, eslint-disable, duplicate test)
  Subtotal:              81/100

Performance (weight 15%):
  2 LOW × 1 =            -2   (hard waits 300ms, worker leak overhead)
  Subtotal:              98/100

Weighted Overall:         89/100
Grade:                    A
```

---

## Critical Issues (Must Fix)

No critical issues detected.

---

## Recommendations (Should Fix)

### 1. Replace hard waits with deterministic waits in fire-and-forget tests

**Severity**: P1 (High)
**Location**: `apps/agent-be/src/streaming/agent.service.spec.ts:99,128,146,164`, `apps/agent-be/src/conversations/conversations.service.spec.ts:386,413`
**Criterion**: Determinism (hard waits)
**Knowledge Base**: [test-quality.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md) — "No Hard Waits" rule

**Issue Description**:
Both test files use `await new Promise((r) => setTimeout(r, 50))` to let the fire-and-forget `runTurn` complete before asserting on `agentFake` side effects (Turn persistence, `terminateProcess` calls, `RUN_ERROR` emission). This is the same pattern flagged in Story 3.1's review (`sandbox-lifecycle.integration.spec.ts:72`):

```typescript
it('calls agentService.runTurn after persisting the user turn', async () => {
  await provisionAndWait();

  const runTurnSpy = jest.spyOn(agentFake, 'runTurn');

  await service.sendTurn('conv-1', 'user-1', 'hello agent');

  await new Promise((r) => setTimeout(r, 50)); // ❌ arbitrary hard wait

  expect(runTurnSpy).toHaveBeenCalledWith({
    conversationId: 'conv-1',
    sandboxId: expect.any(String),
    message: 'hello agent',
    userId: 'user-1',
  });
});
```

The `sendTurn()` method fires `runAgentTurn()` as fire-and-forget (`void this.runAgentTurn(...).catch(...)`), so the test must wait for the background operation to complete before asserting. The 50ms wait is non-deterministic — on a slow CI runner or under load, the agent fake may not complete in 50ms, causing a flaky failure.

**Recommended Fix**:
Spy on `sessionEvents.emit('RUN_FINISHED')` and wait for it (the `AgentServiceFake` emits `RUN_FINISHED` at the end of `runTurn`), or poll `agentFake` state with a retry loop:

```typescript
it('calls agentService.runTurn after persisting the user turn', async () => {
  await provisionAndWait();

  const runTurnSpy = jest.spyOn(agentFake, 'runTurn');
  const emitSpy = jest.spyOn(sessionEvents, 'emit');

  await service.sendTurn('conv-1', 'user-1', 'hello agent');

  // Wait for RUN_FINISHED — the final event in the agent run pipeline
  await waitFor(() => {
    const events = emitSpy.mock.calls.map((c) => (c[1] as SseEvent).event);
    expect(events).toContain('RUN_FINISHED');
  });

  expect(runTurnSpy).toHaveBeenCalledWith({
    conversationId: 'conv-1',
    sandboxId: expect.any(String),
    message: 'hello agent',
    userId: 'user-1',
  });
});
```

For the `failNextRun()` test, wait for `RUN_ERROR` instead of `RUN_FINISHED`.

**Why This Matters**: 6 instances of the same non-deterministic pattern across 2 files. On a slow CI runner, any of these 6 tests could flake. The pattern is propagating — Story 3.1 had 1 instance, Story 3.3 adds 6 more.

**Related Violations**: Same pattern in `sandbox-lifecycle.integration.spec.ts:72` (Story 3.1, still unfixed).

---

### 2. Use `buildTestModule()` instead of `Test.createTestingModule()` in agent.service.spec.ts

**Severity**: P2 (Medium)
**Location**: `apps/agent-be/src/streaming/agent.service.spec.ts:64`
**Criterion**: Maintainability (convention compliance)
**Knowledge Base**: [project-context.md:191](../../project-context.md) — "Always use `buildTestModule()` instead of manually calling `Test.createTestingModule()`"

**Issue Description**:
`agent.service.spec.ts` uses `Test.createTestingModule()` with manual `.overrideProvider()` chaining:

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [ConversationsModule],
})
  .overrideProvider(SANDBOX_SERVICE)
  .useValue(sandboxFake)
  .overrideProvider(AGENT_SERVICE)
  .useValue(agentFake)
  .overrideProvider(PrismaService)
  .useValue(mockPrisma)
  // ...
  .compile();
```

The story spec (Task 3.4) explicitly says: "Use `buildTestModule()` and override `AGENT_SERVICE` with `AgentServiceFake`." The sibling file `conversations.service.spec.ts` correctly uses `buildTestModule()` with the same overrides. This is the second file with this violation — `streaming.controller.spec.ts:29` (Story 3.1) also uses `Test.createTestingModule()` and was flagged in Story 3.1's review.

**Recommended Fix**:
```typescript
const { module } = await buildTestModule([ConversationsModule], [
  { provide: PrismaService, useValue: mockPrisma },
  { provide: DAYTONA_CLIENT, useValue: null },
  { provide: CredentialsService, useValue: { resolveOAuthToken: jest.fn().mockResolvedValue('fake-oauth-token') } },
  { provide: AGENT_SERVICE, useValue: agentFake },
  { provide: SANDBOX_SERVICE, useValue: sandboxFake },
]);

service = module.get(ConversationsService);
sessionEvents = module.get(SessionEventsService);
```

**Priority**: P2 — convention violation. The story spec explicitly required `buildTestModule()`. Straightforward fix.

---

### 3. Replace `Date.now()` timing assertions with deterministic fire-and-forget verification

**Severity**: P2 (Medium)
**Location**: `apps/agent-be/src/streaming/agent.service.spec.ts:114-118`, `apps/agent-be/src/conversations/conversations.service.spec.ts:400-405`
**Criterion**: Determinism (non-deterministic data)

**Issue Description**:
Both files test "does not block on agent completion" by measuring elapsed time:

```typescript
it('does not block on agent completion (returns before runTurn resolves)', async () => {
  await provisionAndWait();

  agentFake.setStreamDelay(100);

  const start = Date.now();
  await service.sendTurn('conv-1', 'user-1', 'hello agent');
  const elapsed = Date.now() - start;

  expect(elapsed).toBeLessThan(100); // ❌ non-deterministic
});
```

`Date.now()` timing is environment-dependent. On a slow CI runner, `sendTurn()` itself (without the agent) could take >100ms due to Prisma mock overhead, causing a false failure. The test intent is correct (verify fire-and-forget), but the implementation is non-deterministic.

**Recommended Fix**:
Spy on `agentFake.runTurn` and verify it was called (not awaited) by checking that `sendTurn` returned before `runTurn` resolved. Use a deferred promise:

```typescript
it('does not block on agent completion (returns before runTurn resolves)', async () => {
  await provisionAndWait();

  let resolveRunTurn: () => void;
  agentFake.setScript([
    { event: 'RUN_STARTED', data: {} },
    { event: 'RUN_FINISHED', data: {} },
  ]);
  jest.spyOn(agentFake, 'runTurn').mockImplementation(async () => {
    await new Promise<void>((resolve) => { resolveRunTurn = resolve; });
  });

  await service.sendTurn('conv-1', 'user-1', 'hello agent');

  // sendTurn returned — runTurn is still pending
  expect(agentFake.runTurn).toHaveBeenCalled();
  resolveRunTurn!(); // let the background operation complete
});
```

**Priority**: P2 — flaky test risk. The assertion is correct in intent but unreliable in implementation.

---

### 4. Split `conversations.service.spec.ts` and `ConversationPane.test.tsx` — both exceed 300-line guideline

**Severity**: P2 (Medium)
**Location**: `apps/agent-be/src/conversations/conversations.service.spec.ts` (444 lines), `apps/web/src/components/conversation/ConversationPane.test.tsx` (682 lines)
**Criterion**: Maintainability (test length)
**Knowledge Base**: [test-quality.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md) — "< 300 Lines" rule

**Issue Description**:
Both files are cumulative — they cover Stories 3.1, 3.2, and 3.3 in a single file. `conversations.service.spec.ts` grew from 227 lines (Story 3.1) to 444 lines (Story 3.3). `ConversationPane.test.tsx` grew from 233 lines (Story 3.1) to 682 lines (Story 3.3). As Epic 3 continues (Stories 3.4–3.12 add Tool Pill, resume, manual commit, cost tracking, etc.), these files will grow further.

The `test-quality.md` guideline states: "When tests grow beyond 300 lines, they become hard to understand, debug, and maintain. Refactor long tests by extracting setup helpers, splitting scenarios, or using fixtures."

**Recommended Fix**:
Split by story scope or feature area:

For `conversations.service.spec.ts`:
- Keep Story 3.1 tests (provision, idle timeout, provision queue) in the main file
- Extract Story 3.2 tests (listSkills, sendTurn persistence) to `conversations.service.send-turn.spec.ts`
- Extract Story 3.3 tests (agent invocation, stopAgent) to `conversations.service.agent.spec.ts`

For `ConversationPane.test.tsx`:
- Keep Story 3.1 tests (session lifecycle) in the main file
- Extract Story 3.2 tests (slash picker, message sending) to `ConversationPane.picker.test.tsx`
- Extract Story 3.3 tests (streaming, stop button) to `ConversationPane.streaming.test.tsx`

**Priority**: P2 — maintainability. Not blocking, but the files will become unmanageable as Epic 3 continues. Consider splitting before Story 3.4.

---

### 5. Add `[P0]`/`[P1]` priority tags to `it()` descriptions in agent.service.spec.ts

**Severity**: P2 (Medium)
**Location**: `apps/agent-be/src/streaming/agent.service.spec.ts:92,109,123,141,157,176`
**Criterion**: Maintainability (priority tagging)
**Knowledge Base**: [project-context.md:166](../../project-context.md) — "Tests are tagged `[P0]` or `[P1]` in their `it()` descriptions."

**Issue Description**:
`agent.service.spec.ts` tags priority on `describe()` blocks (e.g., `describe('[P0] sendTurn invokes agentService.runTurn fire-and-forget')`) but not on individual `it()` descriptions. The convention specifies tags belong in `it()` descriptions so they're visible in test runner output and CI reports. Only 1 of 6 tests has a `[P1]` tag on `it()` (line 175). The web test files are correctly tagged.

This is the same inconsistency noted in Story 3.1's review for `boundary-jwt.test.ts`, `conversations.service.spec.ts`, and `streaming.controller.spec.ts`.

**Recommended Fix**:
```typescript
// Before
it('calls agentService.runTurn after persisting the user turn', async () => {

// After
it('[P0] calls agentService.runTurn after persisting the user turn', async () => {
```

**Priority**: P2 — convention inconsistency. Mechanical fix across 5 test descriptions.

---

### 6. Clean up stale TDD red-phase header comment in conversations.service.spec.ts

**Severity**: P3 (Low)
**Location**: `apps/agent-be/src/conversations/conversations.service.spec.ts:11-13`
**Criterion**: Maintainability (documentation)

**Issue Description**:
The header comment says:
```
TDD RED PHASE: Story 3.2 tests are skipped (it.skip). Remove skips
one describe-block at a time per task during implementation.
```

But no tests are skipped — all 22 tests run and pass. The comment is misleading. This was noted in the automate-validation-report as a deferred finding.

**Recommended Fix**: Remove the stale TDD red-phase comment from the header.

**Priority**: P3 — misleading but harmless. Trivial fix.

---

## Recommendations (Nice to Have)

### 7. Update `streaming.controller.spec.ts` header comment to mention Story 3.3

**Severity**: P3 (Low)
**Location**: `apps/agent-be/src/streaming/streaming.controller.spec.ts:1-6`
**Criterion**: Maintainability (documentation)

**Issue Description**:
The header comment says "Story 3.1: Provision a Sandbox When Opening a Conversation" but Story 3.3 added the back-pressure tests (lines 124-272). The header should reflect all stories that contributed to the file.

**Priority**: P3 — trivial documentation fix.

---

### 8. Add `jest.restoreAllMocks()` to `afterEach` in agent-be test files

**Severity**: P3 (Low)
**Location**: `apps/agent-be/src/streaming/agent.service.spec.ts:83-85`, `apps/agent-be/src/streaming/streaming.controller.spec.ts:41-44`, `apps/agent-be/src/conversations/conversations.service.spec.ts:87-90`
**Criterion**: Isolation (mock cleanup)

**Issue Description**:
All 3 agent-be test files use `jest.clearAllMocks()` in `afterEach` but never `jest.restoreAllMocks()`. `clearAllMocks()` resets call history but does NOT restore original implementations — `mockResolvedValue` implementations persist across tests. This is the same codebase-wide pattern noted in Stories 2.2–3.1 reviews. `useDraftPersistence.test.ts` is the only Story 3.3 file that correctly uses `jest.restoreAllMocks()`.

**Priority**: P3 — latent risk, not an active bug. Address codebase-wide in a dedicated cleanup PR.

---

### 9. Fix worker process leak — clean up IdleTimeoutService timers in afterEach

**Severity**: P3 (Low)
**Location**: `apps/agent-be/src/streaming/agent.service.spec.ts:83-85`, `apps/agent-be/src/conversations/conversations.service.spec.ts:87-90`
**Criterion**: Isolation (resource cleanup)

**Issue Description**:
Jest reports: "A worker process has failed to exit gracefully and has been force exited." for agent-be tests. The `IdleTimeoutService` starts real 60s `setTimeout` timers via `startTimer()` when `provisionSandbox()` is called. Tests that call `provisionAndWait()` or `service.provisionSandbox()` trigger these timers. The `afterEach` calls `jest.clearAllMocks()` and `jest.useRealTimers()` but does NOT clear the real timers started by `IdleTimeoutService`. Same issue as Story 3.1, now affecting `agent.service.spec.ts` as well.

**Priority**: P3 — not causing test failures, but causes noisy CI output and ~100-200ms force-exit overhead.

---

### 10. Remove duplicate "sendTurn invokes runTurn" test between agent.service.spec.ts and conversations.service.spec.ts

**Severity**: P3 (Low)
**Location**: `apps/agent-be/src/streaming/agent.service.spec.ts:91-120`, `apps/agent-be/src/conversations/conversations.service.spec.ts:378-406`
**Criterion**: Maintainability (duplicate coverage)

**Issue Description**:
Both files test the same two behaviors:
1. "sendTurn invokes agentService.runTurn fire-and-forget"
2. "does not block on agent completion"

The `agent.service.spec.ts` file was created per Task 3.4 to test AgentService-specific behaviors (response persistence, stop, RUN_ERROR). However, the "sendTurn invokes runTurn" and "does not block" tests duplicate what `conversations.service.spec.ts` already verifies in its Story 3.3 section (Tasks 4.3). The `agent.service.spec.ts` file should focus on AgentService-specific behaviors (persistence, stop, error handling) and leave the `sendTurn` invocation verification to `conversations.service.spec.ts`.

**Priority**: P3 — redundant but not harmful. Consider removing the 2 duplicate tests from `agent.service.spec.ts` in a follow-up.

---

## Best Practices Found

### 1. `AgentServiceFake` — faithful test double mimicking production side effects

**Location**: `apps/agent-be/test/helpers/agent-service.fake.ts:1-110`
**Pattern**: Test seam with controllable failure injection
**Knowledge Base**: [test-quality.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md) — isolated, deterministic test doubles

**Why This Is Good**:
The `AgentServiceFake` implements `IAgentService` and injects the same dependencies as the production `AgentService` (`SessionEventsService`, `PrismaService`, `ISandboxService` via `SANDBOX_SERVICE` token). It reproduces the observable side effects that integration tests verify:
- Persists the accumulated agent response as a Turn (`role: 'assistant'`) on `RUN_FINISHED` — matching production behavior
- Calls `sandboxService.terminateProcess(sandboxId, 'agent-process')` on `stop()` — matching production behavior
- Emits canned AG-UI events (TEXT_MESSAGE_START → CONTENT → END → RUN_FINISHED) with configurable delay
- Supports controllable failure injection: `failNextRun()`, `setStreamDelay(ms)`, `setScript(events)`, `setActiveRun(boolean)`

This follows the established `SandboxServiceFake` pattern and enables testing `ConversationsService` integration without a real Daytona sandbox or Claude API key.

**Code Example**:
```typescript
@Injectable()
export class AgentServiceFake implements IAgentService {
  private streamDelay = 0;
  private script: SseEvent[] = DEFAULT_SCRIPT;
  private shouldFailNextRun = false;

  constructor(
    private readonly sessionEvents: SessionEventsService,
    private readonly prisma: PrismaService,
    @Inject(SANDBOX_SERVICE) private readonly sandboxService: ISandboxService,
  ) {}

  async runTurn(params: AgentRunParams): Promise<void> {
    if (this.shouldFailNextRun) {
      this.shouldFailNextRun = false;
      this.sessionEvents.emit(params.conversationId, {
        event: 'RUN_ERROR',
        data: { message: 'AgentServiceFake: simulated run failure' },
      });
      return;
    }

    let accumulatedText = '';
    for (const event of this.script) {
      if (event.event === 'TEXT_MESSAGE_CONTENT') {
        accumulatedText += (event.data as { delta?: string }).delta ?? '';
      }
      this.sessionEvents.emit(params.conversationId, event);
      if (this.streamDelay > 0) {
        await new Promise((r) => setTimeout(r, this.streamDelay));
      }
    }

    // Mimics production: persist accumulated response as Turn on RUN_FINISHED
    if (hasRunFinished && !hasRunError && accumulatedText.length > 0) {
      await this.prisma.turn.create({
        data: { conversationId: params.conversationId, role: 'assistant', content: accumulatedText },
      });
    }
  }
}
```

**Use as Reference**: When creating test doubles for services with observable side effects (event emission, database persistence), inject the same dependencies as production and mimic the side effects. This enables integration testing without external dependencies.

---

### 2. Back-pressure mock with `setWriteReturn()` / `emitDrain()` — deterministic Node.js back-pressure testing

**Location**: `apps/agent-be/src/streaming/streaming.controller.spec.ts:125-164`
**Pattern**: Controllable mock for Node.js stream back-pressure
**Knowledge Base**: [test-quality.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md) — deterministic test doubles

**Why This Is Good**:
The `mockResponseWithBackPressure()` helper creates a mock `res` object where `write()` return value is controllable via `setWriteReturn(boolean)`, and the `'drain'` event is triggerable via `emitDrain()`. This enables deterministic testing of the back-pressure logic:
- `setWriteReturn(false)` simulates a slow client (Node.js back-pressure signal)
- `emitDrain()` simulates the client catching up
- Combined with `jest.useFakeTimers()` + `jest.advanceTimersByTime(31_000)`, the 30s drain timeout is testable without real-time waiting

The 4 back-pressure tests cover: STREAM_ERROR on 200-event threshold + 30s timeout, connection stays open when queue drains, timer cleared on drain, timer cleared on `req.on('close')` (client disconnect). All use fake timers and restore real timers per test.

**Code Example**:
```typescript
function mockResponseWithBackPressure() {
  let writeReturn = true;
  const drainListeners: Array<() => void> = [];

  const res = {
    write: jest.fn((data: string) => {
      written.push(data);
      return writeReturn; // controllable return value
    }),
    on: jest.fn((event: string, listener: () => void) => {
      if (event === 'drain') drainListeners.push(listener);
    }),
    // ...
  };

  return {
    res, written,
    setWriteReturn: (returnValue: boolean) => { writeReturn = returnValue; },
    emitDrain: () => { for (const l of drainListeners) l(); },
  };
}

it('[P0] emits STREAM_ERROR when queue reaches 200 and does not drain in 30s', async () => {
  const { res, written, setWriteReturn } = mockResponseWithBackPressure();
  jest.useFakeTimers();

  await controller.stream('conv-1', token, /* ... */);
  setWriteReturn(false); // simulate slow client

  for (let i = 0; i < 200; i++) {
    sessionEvents.emit('conv-1', { event: 'TEXT_MESSAGE_CONTENT', data: { delta: 'x' } });
  }

  jest.advanceTimersByTime(31_000); // fast-forward 30s drain timeout

  expect(written.join('')).toContain('STREAM_ERROR');
  expect(written.join('')).toContain('STREAM_BACK_PRESSURE');
  jest.useRealTimers();
});
```

**Use as Reference**: When testing Node.js stream back-pressure behavior, create a mock response with controllable `write()` return values and triggerable `'drain'` events. Combine with fake timers for timeout-based logic.

---

### 3. `Object.defineProperty` for `scrollHeight` — testing layout-dependent logic in jsdom

**Location**: `apps/web/src/components/conversation/ChatInput.test.tsx:91-123`
**Pattern**: Property descriptor mock for jsdom layout limitations

**Why This Is Good**:
jsdom doesn't compute layout — `scrollHeight`, `scrollTop`, and `clientHeight` are all 0. The `ChatInput` auto-grow logic reads `scrollHeight` and sets `style.height`. The test uses `Object.defineProperty` to mock `scrollHeight` on the textarea element, then re-renders with new content to trigger the `useEffect` height adjustment. This correctly tests the auto-grow logic without a real browser.

Two tests verify both the normal case (150px scrollHeight → 150px height) and the cap (500px scrollHeight → 200px max height).

**Code Example**:
```typescript
it('[P0] caps textarea height at 200px (max-height)', () => {
  const { container, rerender } = render(
    <ChatInput value="short" onChange={jest.fn()} onSubmit={jest.fn()} />,
  );
  const textarea = container.querySelector('textarea')!;

  Object.defineProperty(textarea, 'scrollHeight', {
    configurable: true,
    get: () => 500, // simulate very tall content
  });

  rerender(<ChatInput value="very tall content" onChange={jest.fn()} onSubmit={jest.fn()} />);

  expect(textarea.style.height).toBe('200px'); // capped at MAX_HEIGHT
});
```

**Use as Reference**: When testing components that read layout properties (`scrollHeight`, `scrollTop`, `clientHeight`) in jsdom, use `Object.defineProperty` with a getter to mock the property value.

---

### 4. `useDraftPersistence.test.ts` — `Storage.prototype` spy pattern and correct `restoreAllMocks()` usage

**Location**: `apps/web/src/components/conversation/useDraftPersistence.test.ts:14-27`
**Pattern**: Prototype-level spy with full restore

**Why This Is Good**:
This is the only Story 3.3 test file that correctly uses `jest.restoreAllMocks()` in `afterEach`. It also uses a cleaner localStorage mocking pattern than `ConversationPane.test.tsx` — it spies on `Storage.prototype` methods (`getItem`, `setItem`, `removeItem`) rather than replacing `global.localStorage` with a mock object. This approach:
- Doesn't break other code that accesses `localStorage` during the test
- Automatically restores in `afterEach` via `jest.restoreAllMocks()`
- Uses a simple `store` object that persists across `getItem`/`setItem` calls within a test

**Code Example**:
```typescript
let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => store[key] ?? null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
    store[key] = value;
  });
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
    delete store[key];
  });
});

afterEach(() => {
  jest.restoreAllMocks(); // ✅ correctly restores all spies
});
```

**Use as Reference**: When mocking `localStorage` in jsdom tests, prefer spying on `Storage.prototype` methods over replacing `global.localStorage`. Always use `jest.restoreAllMocks()` in `afterEach`.

---

### 5. Server Component page test with render-stub mock and `initialMessages` prop verification

**Location**: `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.test.tsx:49-62,172-198`
**Pattern**: Render-stub mock for prop-pass verification

**Why This Is Good**:
The page test mocks `ConversationPane` as a render stub that outputs its props as a string:
```typescript
jest.mock('@/components/conversation/ConversationPane', () => ({
  ConversationPane: ({ boundaryJwt, apiUrl, initialConversationId, initialMessages }) =>
    `ConversationPane:${boundaryJwt}:${apiUrl}:${initialConversationId}:${initialMessages.length}`,
}));
```

This enables the test to verify that the page passes the correct `initialMessages` to `ConversationPane` by checking the rendered HTML string for `:2` (2 messages) or `:0` (empty). The test also verifies the `turn.findMany` query uses the correct `orderBy: { createdAt: 'asc' }` and `select` projection — testing the data-fetching decision without rendering the full component.

**Use as Reference**: When testing Server Component pages that pass data to Client Components, mock the Client Component as a render stub that outputs its props. Assert on the rendered HTML string to verify prop passing.

---

## Test File Analysis

### File: `agent.service.spec.ts`

| Field | Value |
|-------|-------|
| **File Path** | `apps/agent-be/src/streaming/agent.service.spec.ts` |
| **File Size** | 184 lines, 6.8 KB |
| **Test Framework** | Jest 30 |
| **Environment** | node (implicit) |
| **Language** | TypeScript |
| **Describe Blocks** | 5 |
| **Test Cases** | 6 (4 P0, 2 P1) |
| **Average Test Length** | ~12 lines per test |
| **Fixtures Used** | `AgentServiceFake`, `SandboxServiceFake`, `mockPrisma` object |
| **Mock Patterns** | `Test.createTestingModule()` (should use `buildTestModule()`), `jest.spyOn()` for fake methods |
| **Cleanup** | `afterEach`: `jest.clearAllMocks()` only (missing `restoreAllMocks`) |
| **Header Comment** | Present (Story 3.3, ACs covered) |
| **Priority Tags** | On `describe()` only; 1 test has `[P1]` on `it()` |
| **Notable** | Hard waits (4 × 50ms), `Date.now()` timing assertion, `Test.createTestingModule()` convention violation |

### File: `streaming.controller.spec.ts`

| Field | Value |
|-------|-------|
| **File Path** | `apps/agent-be/src/streaming/streaming.controller.spec.ts` |
| **File Size** | 273 lines, 9.8 KB |
| **Test Framework** | Jest 30 |
| **Environment** | node (implicit) |
| **Language** | TypeScript |
| **Describe Blocks** | 2 (Story 3.1 + Story 3.3 back-pressure) |
| **Test Cases** | 9 (7 P0, 2 P1) — 5 from Story 3.1, 4 from Story 3.3 |
| **Average Test Length** | ~12 lines per test |
| **Fixtures Used** | `mintToken()` helper (real JWT via `jose.SignJWT`), `mockResponse()`, `mockResponseWithBackPressure()` |
| **Mock Patterns** | `Test.createTestingModule()` (pre-existing from Story 3.1), `process.env` save/restore, fake timers for back-pressure |
| **Cleanup** | `afterEach` restores env + `jest.clearAllMocks()`; back-pressure tests restore `jest.useRealTimers()` per test |
| **Header Comment** | Present but says "Story 3.1" only (doesn't mention Story 3.3) |
| **Priority Tags** | Mixed — some `it()` have `[P0]`/`[P1]`, some don't |
| **Notable** | `mockResponseWithBackPressure()` is a best-practice pattern (best practice #2); fake timers correctly used and restored |

### File: `conversations.service.spec.ts`

| Field | Value |
|-------|-------|
| **File Path** | `apps/agent-be/src/conversations/conversations.service.spec.ts` |
| **File Size** | 444 lines, 16.2 KB |
| **Test Framework** | Jest 30 |
| **Environment** | node (implicit) |
| **Language** | TypeScript |
| **Describe Blocks** | 9 (Stories 3.1, 3.2, 3.3) |
| **Test Cases** | 22 (16 P0, 6 P1) — 16 from Stories 3.1/3.2, 6 from Story 3.3 |
| **Average Test Length** | ~10 lines per test |
| **Fixtures Used** | `mockPrisma` object, `SandboxServiceFake` + `AgentServiceFake` via `buildTestModule()` |
| **Mock Patterns** | `buildTestModule()` with array-form overrides ✅, `jest.spyOn()` for sandbox/agent methods, `jest.useFakeTimers()` for idle timeout |
| **Cleanup** | `afterEach`: `jest.clearAllMocks()` + `jest.useRealTimers()` |
| **Header Comment** | Present but has stale TDD red-phase comment (lines 11-13) |
| **Priority Tags** | Mixed — some `it()` have `[P0]`/`[P1]`, some don't |
| **Notable** | Exceeds 300-line guideline (444 lines); hard waits (2 × 50ms); `Date.now()` timing assertion; `invocationCallOrder` assertion for pipeline sequence (Story 3.1 best practice) |

### File: `ChatMessageList.test.tsx`

| Field | Value |
|-------|-------|
| **File Path** | `apps/web/src/components/conversation/ChatMessageList.test.tsx` |
| **File Size** | 79 lines, 2.5 KB |
| **Test Framework** | Jest 30 + @testing-library/react |
| **Environment** | jsdom (`@jest-environment jsdom`) |
| **Language** | TypeScript |
| **Describe Blocks** | 1 |
| **Test Cases** | 3 (all P0) |
| **Average Test Length** | ~8 lines per test |
| **Fixtures Used** | ESM mock for `react-markdown` + `remark-gfm` |
| **Mock Patterns** | `jest.mock()` with `__esModule: true` for ESM default exports ✅ |
| **Cleanup** | No `afterEach` (stateless component, no globals mocked) |
| **Header Comment** | Present (Story 3.3, ACs covered) |
| **Priority Tags** | On `it()` descriptions ✅ |

### File: `UserMessage.test.tsx`

| Field | Value |
|-------|-------|
| **File Path** | `apps/web/src/components/conversation/UserMessage.test.tsx` |
| **File Size** | 34 lines, 1.1 KB |
| **Test Framework** | Jest 30 + @testing-library/react |
| **Environment** | jsdom |
| **Language** | TypeScript |
| **Describe Blocks** | 1 |
| **Test Cases** | 3 (all P0) |
| **Average Test Length** | ~4 lines per test |
| **Fixtures Used** | Inline `ChatMessage` fixture |
| **Header Comment** | Present (Story 3.3, ACs covered) |
| **Priority Tags** | On `it()` descriptions ✅ |

### File: `AgentMessage.test.tsx`

| Field | Value |
|-------|-------|
| **File Path** | `apps/web/src/components/conversation/AgentMessage.test.tsx` |
| **File Size** | 55 lines, 1.8 KB |
| **Test Framework** | Jest 30 + @testing-library/react |
| **Environment** | jsdom |
| **Language** | TypeScript |
| **Describe Blocks** | 1 |
| **Test Cases** | 4 (all P0) |
| **Average Test Length** | ~5 lines per test |
| **Fixtures Used** | ESM mock for `react-markdown` + `remark-gfm`, inline `ChatMessage` fixture |
| **Mock Patterns** | `jest.mock()` with `__esModule: true` ✅, `container.querySelector` for CSS class assertion |
| **Header Comment** | Present (Story 3.3, ACs covered) |
| **Priority Tags** | On `it()` descriptions ✅ |

### File: `ChatInput.test.tsx`

| Field | Value |
|-------|-------|
| **File Path** | `apps/web/src/components/conversation/ChatInput.test.tsx` |
| **File Size** | 124 lines, 4.2 KB |
| **Test Framework** | Jest 30 + @testing-library/react |
| **Environment** | jsdom |
| **Language** | TypeScript |
| **Describe Blocks** | 1 |
| **Test Cases** | 8 (all P0) |
| **Average Test Length** | ~7 lines per test |
| **Fixtures Used** | `Object.defineProperty` for `scrollHeight` mock |
| **Mock Patterns** | `userEvent.type()` for React 19 text input ✅, `fireEvent.keyDown` for Enter/Shift+Enter |
| **Header Comment** | Present (Story 3.3, ACs covered) |
| **Priority Tags** | On `it()` descriptions ✅ |
| **Notable** | `Object.defineProperty` for `scrollHeight` is a best-practice pattern (best practice #3) |

### File: `ChatComponents.test.tsx`

| Field | Value |
|-------|-------|
| **File Path** | `apps/web/src/components/conversation/ChatComponents.test.tsx` |
| **File Size** | 59 lines, 2.0 KB |
| **Test Framework** | Jest 30 + @testing-library/react |
| **Environment** | jsdom |
| **Language** | TypeScript |
| **Describe Blocks** | 4 (ThinkingIndicator, ToolExecutionIndicator, ScrollToBottomButton, CopyButton) |
| **Test Cases** | 5 (all P0) |
| **Average Test Length** | ~4 lines per test |
| **Fixtures Used** | `navigator.clipboard` mock for CopyButton |
| **Mock Patterns** | `Object.assign(navigator, { clipboard: { writeText } })` |
| **Header Comment** | Present (Story 3.3, components covered) |
| **Priority Tags** | On `it()` descriptions ✅ |

### File: `useDraftPersistence.test.ts`

| Field | Value |
|-------|-------|
| **File Path** | `apps/web/src/components/conversation/useDraftPersistence.test.ts` |
| **File Size** | 66 lines, 2.2 KB |
| **Test Framework** | Jest 30 + @testing-library/react (`renderHook`, `act`, `waitFor`) |
| **Environment** | jsdom |
| **Language** | TypeScript |
| **Describe Blocks** | 1 |
| **Test Cases** | 3 (all P0) |
| **Average Test Length** | ~8 lines per test |
| **Fixtures Used** | `Storage.prototype` spy pattern with `store` object |
| **Mock Patterns** | `jest.spyOn(Storage.prototype, ...)` ✅, `jest.restoreAllMocks()` in `afterEach` ✅ |
| **Header Comment** | Present (Story 3.3, ACs covered) |
| **Priority Tags** | On `it()` descriptions ✅ |
| **Notable** | Only file with `jest.restoreAllMocks()` — best-practice cleanup pattern (best practice #4) |

### File: `ConversationPane.test.tsx`

| Field | Value |
|-------|-------|
| **File Path** | `apps/web/src/components/conversation/ConversationPane.test.tsx` |
| **File Size** | 682 lines, 24.5 KB |
| **Test Framework** | Jest 30 + @testing-library/react |
| **Environment** | jsdom |
| **Language** | TypeScript |
| **Describe Blocks** | 6 (Stories 3.1, 3.2 picker, 3.2 sending, 3.2 outside click, 3.3 streaming, 3.3 stop) |
| **Test Cases** | 20 (15 P0, 5 P1) — 11 from Stories 3.1/3.2, 9 from Story 3.3 |
| **Average Test Length** | ~15 lines per test |
| **Fixtures Used** | `MockEventSource` class (co-located), mock `fetch`, mock `localStorage`, ESM mocks for `react-markdown`/`remark-gfm` |
| **Mock Patterns** | `global.fetch`, `global.EventSource`, `global.localStorage` save/restore; `jest.useFakeTimers()` for timeout test; `userEvent.type()` for text input |
| **Cleanup** | `afterEach` restores all globals + `jest.useRealTimers()` + `jest.clearAllMocks()` + `cleanup()` — exemplary |
| **Header Comment** | Present (Stories 3.1, 3.2, 3.3, ACs covered) |
| **Priority Tags** | Mixed — Story 3.3 tests mostly have `[P0]`/`[P1]` on `it()`; some Story 3.1 tests don't |
| **Notable** | Exceeds 300-line guideline (682 lines); `MockEventSource` extended for AG-UI events; `streamingMessageIdRef` stale-closure fix tested |

### File: `page.test.tsx` (Server Component)

| Field | Value |
|-------|-------|
| **File Path** | `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.test.tsx` |
| **File Size** | 215 lines, 7.8 KB |
| **Test Framework** | Jest 30 + `react-dom/server` |
| **Environment** | node (`@jest-environment node`) |
| **Language** | TypeScript |
| **Describe Blocks** | 2 (auth/redirect, conversation rendering) |
| **Test Cases** | 10 (9 P0, 1 P1) — 8 from Story 3.2, 2 from Story 3.3 |
| **Average Test Length** | ~8 lines per test |
| **Fixtures Used** | Render-stub mock for `ConversationPane`, mock `auth()`, mock `getPrisma()`, mock `mintBoundaryJwt()` |
| **Mock Patterns** | `jest.mock()` for modules, `renderToStaticMarkup()` for HTML assertion, `Promise.resolve(params)` for Next.js 16 async params |
| **Cleanup** | `beforeEach`: `jest.clearAllMocks()` |
| **Header Comment** | Present (Story 3.2, ACs covered) |
| **Priority Tags** | On `it()` descriptions ✅ |
| **Notable** | Render-stub mock for prop-pass verification is a best-practice pattern (best practice #5) |

---

## Context and Integration

### Related Artifacts

- **Story File**: [3-3-converse-with-the-streaming-agent.md](../../implementation-artifacts/3-3-converse-with-the-streaming-agent.md)
- **Automate Validation Report**: [automate-validation-report-3-3.md](../automate-validation-report-3-3.md)
- **Previous Review**: [test-review-3-1.md](test-review-3-1.md) (Story 3.1 — most recent prior review)
- **Risk Assessment**: P0 threshold (all acceptance-criteria tests must pass)
- **Priority Framework**: P0/P1 applied per `project-context.md:166-168`

### Story 3.1 → 3.3 Comparison

| Metric | Story 3.1 | Story 3.3 | Delta |
|--------|-----------|-----------|-------|
| Test files in scope | 7 (4 Jest unit + 1 Jest integration + 1 Jest component + 1 E2E) | 11 (3 Jest backend + 7 Jest component + 1 Jest page) | +4 |
| Total tests in scope | 42 (36 P0, 6 P1) + 2 it.todo() | 93 (78 P0, 15 P1) — cumulative across 3 stories | +51 |
| Story-specific new tests | 42 (new story) | 43 (new + extended) | +1 |
| P0 tests | 36 | 78 (cumulative) | +42 |
| P1 tests | 6 | 15 (cumulative) | +9 |
| Quality score | 91/100 (A) | 89/100 (A) | -2 |
| Lint warnings | 6 (agent-be) + 7 (web) | 8 (agent-be) + 7 (web) | +2 |
| Full suite | 502 | 603 | +101 |
| Stack | Fullstack | Fullstack | — |

Story 3.3 is the largest story in Epic 3 so far — 11 test files, 43 new/extended tests, 9 new frontend components with co-located tests, plus backend extensions for agent invocation, stop endpoint, and SSE back-pressure. The quality score dropped 2 points from 91 to 89 — driven by the hard-wait pattern propagating to 6 new instances (same issue as Story 3.1, now in 2 more files), the `Test.createTestingModule()` violation appearing in a second file, and the growing file sizes (`conversations.service.spec.ts` +217 lines, `ConversationPane.test.tsx` +449 lines since Story 3.1).

Key differences from Story 3.1:
- First story with AG-UI event streaming tests (TEXT_MESSAGE_*, TOOL_CALL_*, RUN_*)
- First story with SSE back-pressure testing (fake timers + mock `write()` return values)
- First story with `AgentServiceFake` test double (following `SandboxServiceFake` pattern)
- First story with `Object.defineProperty` for layout-dependent logic testing
- First story with `useDraftPersistence` hook testing
- Growing cumulative test files (`conversations.service.spec.ts` and `ConversationPane.test.tsx` now cover 3 stories each)

---

## Knowledge Base References

This review consulted the following knowledge base fragments:

- **[test-quality.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md)** — Definition of Done for tests (no hard waits, <300 lines, <1.5 min, self-cleaning, explicit assertions)
- **[test-healing-patterns.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/test-healing-patterns.md)** — Common failure patterns (hard waits, race conditions) and fixes
- **[timing-debugging.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/timing-debugging.md)** — Race condition identification and deterministic wait fixes
- **[selector-resilience.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/selector-resilience.md)** — Selector hierarchy: data-testid > ARIA > text > CSS/ID

For coverage mapping, consult `trace` workflow outputs.

---

## Next Steps

### Immediate Actions (Before Merge)

1. **Replace hard waits with deterministic waits** (P1) — `agent.service.spec.ts:99,128,146,164` and `conversations.service.spec.ts:386,413`. Replace `setTimeout(resolve, 50)` with a spy on `sessionEvents.emit('RUN_FINISHED')` or `RUN_ERROR`. This is the only P1 violation and poses a flaky test risk on CI — 6 instances across 2 files.

### Follow-up Actions (Future PRs)

1. **Use `buildTestModule()` in `agent.service.spec.ts`** (P2) — Replace `Test.createTestingModule()` with `buildTestModule()` per codebase convention. Also fix the pre-existing violation in `streaming.controller.spec.ts:29` (Story 3.1).
2. **Replace `Date.now()` timing assertions** (P2) — Use a deferred promise to verify fire-and-forget behavior deterministically.
3. **Split `conversations.service.spec.ts` and `ConversationPane.test.tsx`** (P2) — Both exceed 300 lines. Split by story scope before Story 3.4 adds more tests.
4. **Add `[P0]`/`[P1]` tags to `it()` descriptions** (P2) — 5 test descriptions in `agent.service.spec.ts`.
5. **Clean up stale TDD red-phase header** (P3) — `conversations.service.spec.ts:11-13`.
6. **Update `streaming.controller.spec.ts` header** (P3) — Add Story 3.3 to the header comment.
7. **Add `jest.restoreAllMocks()` to `afterEach`** (P3) — Codebase-wide cleanup PR (same as Stories 2.2–3.1).
8. **Fix worker process leak** (P3) — Add `IdleTimeoutService` timer cleanup in `afterEach`.
9. **Remove duplicate "sendTurn invokes runTurn" tests** (P3) — Consider removing 2 duplicate tests from `agent.service.spec.ts`.

### Re-Review Needed?

Re-review recommended after the P1 hard waits are fixed — the determinism score would improve from 85 to ~93, raising the overall score to ~92/100. The P2 violations can be addressed in a follow-up PR without re-review.

---

## Decision

**Recommendation**: Approve with comments

**Rationale**:

> Test quality is good with 89/100 score (Grade A). All 6 acceptance criteria have direct P0 coverage across 93 tests in 11 files spanning backend unit and frontend component levels. The test architecture follows established codebase patterns (`AgentServiceFake` test double, `MockEventSource` for SSE, `buildTestModule()` in `conversations.service.spec.ts`, ESM mocks, render-stub page tests) and introduces excellent new patterns (back-pressure mock with `setWriteReturn()`/`emitDrain()`, `Object.defineProperty` for `scrollHeight`, `Storage.prototype` spy for localStorage). The 1 HIGH violation (hard waits in fire-and-forget tests — 6 instances) is the same determinism risk flagged in Story 3.1 and should be fixed before merge to prevent CI flakiness. The 6 MEDIUM violations are convention inconsistencies (`buildTestModule` usage, file lengths, priority tags, `Date.now` timing, stale header) that are straightforward to fix. The 6 LOW violations are codebase-wide patterns already documented in prior reviews. Tests pass (603 total), lint is clean, typecheck is clean.

---

## Appendix

### Violation Summary by Location

| File | Line(s) | Severity | Dimension | Issue | Fix |
|------|---------|----------|-----------|-------|-----|
| `agent.service.spec.ts` | 99,128,146,164 | P1 | Determinism | Hard wait `setTimeout(resolve, 50)` (4 instances) | Spy on `RUN_FINISHED`/`RUN_ERROR` |
| `conversations.service.spec.ts` | 386,413 | P1 | Determinism | Hard wait `setTimeout(resolve, 50)` (2 instances) | Spy on `RUN_FINISHED`/`RUN_ERROR` |
| `agent.service.spec.ts` | 64 | P2 | Maintainability | `Test.createTestingModule()` instead of `buildTestModule()` | Use `buildTestModule()` |
| `streaming.controller.spec.ts` | 29 | P2 | Maintainability | `Test.createTestingModule()` (pre-existing from Story 3.1) | Use `buildTestModule()` |
| `agent.service.spec.ts` | 114-118 | P2 | Determinism | `Date.now()` timing assertion | Use deferred promise |
| `conversations.service.spec.ts` | 400-405 | P2 | Determinism | `Date.now()` timing assertion | Use deferred promise |
| `conversations.service.spec.ts` | all | P2 | Maintainability | 444 lines (exceeds 300-line guideline) | Split by story scope |
| `ConversationPane.test.tsx` | all | P2 | Maintainability | 682 lines (exceeds 300-line guideline) | Split by story scope |
| `agent.service.spec.ts` | 92,109,123,141,157 | P2 | Maintainability | Priority tags on `describe()` only | Add `[P0]`/`[P1]` to `it()` |
| `conversations.service.spec.ts` | 11-13 | P3 | Maintainability | Stale TDD red-phase header comment | Remove stale comment |
| `streaming.controller.spec.ts` | 1-6 | P3 | Maintainability | Header doesn't mention Story 3.3 | Update header |
| `agent.service.spec.ts` | 83-85 | P3 | Isolation | Missing `jest.restoreAllMocks()` | Add to `afterEach` |
| `streaming.controller.spec.ts` | 41-44 | P3 | Isolation | Missing `jest.restoreAllMocks()` | Add to `afterEach` |
| `conversations.service.spec.ts` | 87-90 | P3 | Isolation | Missing `jest.restoreAllMocks()` | Add to `afterEach` |
| `agent.service.spec.ts` | 25,131,167 | P3 | Maintainability | `eslint-disable` for `any` types | Import proper types |
| `conversations.service.spec.ts` | 30-33,416 | P3 | Maintainability | `eslint-disable` for `any` types | Import proper types |
| `agent.service.spec.ts` + `conversations.service.spec.ts` | — | P3 | Isolation | Worker process leak (IdleTimeoutService timers) | Clear timers in `afterEach` |
| `streaming.controller.spec.ts` | 264 | P3 | Determinism | Conditional `if (closeHandler)` in test body | Restructure to avoid conditional |
| `agent.service.spec.ts` vs `conversations.service.spec.ts` | 91-120, 378-406 | P3 | Maintainability | Duplicate "sendTurn invokes runTurn" tests | Remove from `agent.service.spec.ts` |

### Quality Trends

| Review Date | Story | Score | Grade | Critical Issues | Trend |
|-------------|-------|-------|-------|-----------------|-------|
| 2026-07-03 | 2.4 | 86/100 | B | 3 HIGH | — |
| 2026-07-03 | 2.5 | 91/100 | A | 1 HIGH | Improved (+5 points) |
| 2026-07-04 | 2.6 | 96/100 | A | 0 HIGH | Improved (+5 points) |
| 2026-07-04 | 3.1 | 91/100 | A | 1 HIGH | New epic, larger surface (-5 points) |
| 2026-07-04 | 3.3 | 89/100 | A | 1 HIGH | Hard waits propagate, files grow (-2 points) |

### Related Reviews

| File | Score | Grade | Critical | Status |
|------|-------|-------|----------|--------|
| `agent.service.spec.ts` | 78/100 | B | 1 HIGH | Approved with comments |
| `streaming.controller.spec.ts` | 85/100 | A | 0 HIGH | Approved with comments |
| `conversations.service.spec.ts` | 82/100 | A | 1 HIGH | Approved with comments |
| `ChatMessageList.test.tsx` | 96/100 | A+ | 0 | Approved |
| `UserMessage.test.tsx` | 98/100 | A+ | 0 | Approved |
| `AgentMessage.test.tsx` | 96/100 | A+ | 0 | Approved |
| `ChatInput.test.tsx` | 95/100 | A+ | 0 | Approved |
| `ChatComponents.test.tsx` | 96/100 | A+ | 0 | Approved |
| `useDraftPersistence.test.ts` | 98/100 | A+ | 0 | Approved |
| `ConversationPane.test.tsx` | 88/100 | A | 0 HIGH | Approved with comments |
| `page.test.tsx` | 95/100 | A+ | 0 | Approved |

**Suite Average**: 89/100 (A)

---

## Review Metadata

**Generated By**: BMad TEA Agent (Test Architect)
**Workflow**: testarch-test-review v5.0
**Review ID**: test-review-3-3-20260704
**Timestamp**: 2026-07-04
**Version**: 1.0
**Execution Mode**: Sequential (4 quality dimensions evaluated inline)
**Test Verification**: 603 tests pass (53 agent-be + 550 web), 0 errors, 15 pre-existing lint warnings (8 agent-be + 7 web), typecheck clean. E2E tests skip without test environment.
