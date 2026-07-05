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
  - _bmad-output/implementation-artifacts/3-4-see-tool-calls-and-recognized-actions-inline.md
  - _bmad-output/test-artifacts/atdd-checklist-3-4-see-tool-calls-and-recognized-actions-inline.md
  - apps/web/src/components/conversation/ToolPill.test.tsx
  - apps/web/src/components/conversation/SemanticPill.test.tsx
  - apps/web/src/components/conversation/ToolPill.tsx
  - apps/web/src/components/conversation/SemanticPill.tsx
  - apps/web/src/components/conversation/ChatMessageList.tsx
  - apps/web/src/components/conversation/ConversationPane.test.tsx
  - apps/web/src/components/conversation/ChatComponents.test.tsx
  - apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts
  - apps/agent-be/src/streaming/tool-pill-classifier.service.ts
  - apps/agent-be/src/streaming/agent.service.unit.spec.ts
  - apps/agent-be/src/streaming/streaming.controller.spec.ts
  - playwright/e2e/onboarding/onboarding.spec.ts
  - playwright/e2e/auth/sign-in.spec.ts
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-healing-patterns.md
---

# Test Quality Review — Story 3.4: See Tool Calls and Recognized Actions Inline

**Quality Score**: 88/100 (B)
**Review Date**: 2026-07-04
**Review Scope**: Story-scoped (7 files — 3 Jest backend unit, 4 Jest frontend component)
**Stack**: fullstack (Next.js 16 + NestJS 11 + Jest 30)
**Reviewer**: Master Test Architect (TEA bmad-testarch-test-review)

---

Note: This review audits existing tests; it does not generate tests.
Coverage mapping and coverage gates are out of scope here. Use `trace` for coverage decisions.

## Skipped Test Audit (Per Reviewer Instruction)

**Instruction**: Treat any skipped test (`test.skip`, `it.skip`, `describe.skip`, `xtest`, `test.fixme`, `it.todo`, or framework equivalent) as a test-quality failure — flag it for un-skipping or removal with a recorded reason.

### In-Scope (Story 3.4 Test Files): 0 Skipped Tests

All 49 Story 3.4 test cases use active `it()` — no `it.skip()`, `test.skip()`, `test.fixme()`, or `it.todo()` calls exist. The story's Coverage Validation Decisions confirm: "All 25 `it.skip()` tests were un-skipped." **No skipped-test failures in scope.**

### Stale "TDD RED PHASE" Headers (In-Scope): 4 Files

Four test files retain "TDD RED PHASE" header comments that claim "tests are skipped until implementation lands" and "Remove `it.skip()` → `it()` when activating for the current task." The tests are NOT skipped — all use active `it()`. The headers are stale and misleading. A developer reading the header would believe the tests are skipped when they are not. Flagged as a maintainability finding (see FINDING-06 below).

| File | Header Lines | Status |
|------|-------------|--------|
| `apps/web/src/components/conversation/ToolPill.test.tsx` | 11-12 | Stale — tests are active |
| `apps/web/src/components/conversation/SemanticPill.test.tsx` | 10-11 | Stale — tests are active |
| `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` | 10-11 | Stale — tests are active |
| `apps/agent-be/src/streaming/agent.service.unit.spec.ts` | 14-15 | Stale — tests are active |

### Out-of-Scope: 3 Skipped Playwright E2E Tests

These are from Stories 1.2 and 1.3, not Story 3.4. Flagged per the reviewer instruction.

| File:Line | Test | Story | Reason Recorded? | Recommendation |
|-----------|------|-------|-------------------|----------------|
| `playwright/e2e/onboarding/onboarding.spec.ts:215` | `[P1] org OAuth App restriction error explicitly names the org cause` | 1.3 | Yes — requires real GitHub org with OAuth App restrictions | Keep skipped (environmental dependency) or convert to unit test mocking GitHub 403 response |
| `playwright/e2e/onboarding/onboarding.spec.ts:265` | `[P1] encrypted token is never visible in the browser` | 1.3 | Yes — requires real GitHub credentials and writable test repo | Keep skipped (security property requires real credentials) or convert to unit test asserting Server Action response shape |
| `playwright/e2e/auth/sign-in.spec.ts:124` | `[P1] clicking "Sign in with GitHub" navigates toward GitHub OAuth` | 1.2 | Yes — conditional skip when `AUTH_GITHUB_ID` not set | Acceptable — conditional skip with clear reason and enablement path |

All 3 out-of-scope skips have recorded reasons in comments. Two are environmental dependencies (require real GitHub org/credentials that cannot be simulated); one is a conditional skip with an env-var enablement path. No action required for Story 3.4 scope.

---

## Executive Summary

**Overall Assessment**: Good

**Recommendation**: Approve with comments

### Key Strengths

- All 5 ACs have direct P0 coverage across 7 files. AC-1 (Tool Pill lifecycle) is verified by 12 P0 tests across `ToolPill.test.tsx` (component states, expand/collapse, aria) and `ConversationPane.test.tsx` (SSE event integration: TOOL_CALL_START/ARGS/END/RESULT). AC-2 (Semantic Pill) is verified by 10 P0 tests across `SemanticPill.test.tsx` (content, link, a11y) and `tool-pill-classifier.service.spec.ts` (git commit detection, artifact type derivation, Postgres lookup, degraded fallback). AC-5 (circuit breaker + heartbeat) is verified by 6 P0 tests across `agent.service.unit.spec.ts` (timer fire, reset, RUN_ERROR message, terminateProcess) and `streaming.controller.spec.ts` (heartbeat interval, cleanup on close/complete/error, write failure safety).
- The `agent.service.unit.spec.ts` correctly tests the REAL `AgentService` (not `AgentServiceFake`) using `jest.isolateModules()` + `jest.doMock('@anthropic-ai/claude-agent-sdk', ...)` with controllable async generators yielding `SDKMessage` sequences. This is the only way to verify the tool call lifecycle emission and circuit breaker — the integration tests via `AgentServiceFake` can't exercise this code. The `createAgentService()` helper using `jest.isolateModules` instead of direct `new AgentService(...)` is the correct fix for the module-registry binding problem (documented as DP-4 in the story).
- The `tool-pill-classifier.service.spec.ts` tests are well-structured with a clean `mockPrisma` setup and cover the full classification decision tree: non-Bash tool → null, Bash without `git commit` → null, failed commit → null, successful commit touching `_bmad-output/` → promoted event, artifact not in Postgres → degraded `viewHref`, Postgres lookup failure → warn log + degraded fallback. The `successOutput` fixture is reused across the successful-commit tests, reducing duplication.
- The `streaming.controller.spec.ts` heartbeat tests use `jest.useFakeTimers()` + `jest.advanceTimersByTime(15_000)` to deterministically verify the 15s heartbeat interval, and the `written.length = 0` pattern cleanly isolates the heartbeat assertion from initial SSE setup writes. The "heartbeat write failure does not crash" test (line 357) uses a `write` mock that throws on heartbeat frames — correctly verifies the try/catch guard.
- The `ConversationPane.test.tsx` Story 3.4 describe block (lines 683-901) covers the full tool pill lifecycle through the SSE integration layer: TOOL_CALL_START creates a running pill, TOOL_CALL_ARGS updates input, TOOL_CALL_END marks completed, TOOL_CALL_RESULT sets output, TOOL_CALL_PROMOTED promotes to Semantic Pill, failed result renders error-state, RUN_ERROR/STREAM_ERROR render system messages (not assistant messages), and multiple tool calls each render at their positions. The `MockEventSource.emit` extension for new event types follows the established pattern.

### Key Weaknesses

- **Stale "TDD RED PHASE" headers in 4 test files** — `ToolPill.test.tsx`, `SemanticPill.test.tsx`, `tool-pill-classifier.service.spec.ts`, and `agent.service.unit.spec.ts` all have header comments saying "TDD RED PHASE — tests are skipped until implementation lands. Remove `it.skip()` → `it()` when activating for the current task." But the tests are NOT skipped — all use active `it()`. This is misleading documentation that confuses future maintainers about test status. The headers should be updated to reflect the green-phase status.
- **Worker process handle leak persists** — Jest reports "A worker process has failed to exit gracefully and has been force exited" for agent-be tests. The circuit breaker tests in `agent.service.unit.spec.ts` create `stalledGenerator` async generators with never-resolving promises (`await new Promise<never>(jest.fn())`) that may keep handles alive after test completion. Despite `jest.useRealTimers()` in `afterEach`, the pending promises from stalled generators are not explicitly resolved/rejected. This is the same handle-leak class flagged in Stories 3.1 and 3.3, now with a new root cause (stalled generators vs. `IdleTimeoutService` timers).
- **`agent.service.unit.spec.ts` exceeds 300-line guideline** — at 457 lines, the file is over the `test-quality.md` threshold. The complexity is inherent (11 tests with shared SDK mock setup, circuit breaker timer management, and controllable async generators), and the helper functions (`createAgentService`, `makeStreamEvent`, `setupMockQuery`, `yieldMessages`) keep individual tests focused. But the file would benefit from extracting the SDK mock helpers into a separate `agent-service-test-helpers.ts` file.
- **`ConversationPane.test.tsx` is 902 lines** — well over the 300-line guideline, spanning 4 stories (3.1, 3.2, 3.3, 3.4). Story 3.4's section (lines 683-901) is ~220 lines and well-organized, but the cumulative file is unwieldy. This is a pre-existing pattern (one file per component) — not introduced by Story 3.4, but the file should be split by story or concern before Epic 3 completes.
- **Private member access in `tool-pill-classifier.service.spec.ts:184`** — `jest.spyOn(service['logger'], 'warn')` accesses the private `logger` property via bracket notation. This is the standard pattern for spying on NestJS `Logger` instances, but it bypasses encapsulation. A `logger` accessor or a test-specific `Logger` injection would be cleaner, though this is a low-severity convention issue.

### Summary

Story 3.4's test suite is comprehensive — 49 new test cases across 7 files covering all 5 ACs at unit and component levels. All tests pass (80 agent-be + 571 web). The test architecture follows established codebase patterns (`MockEventSource` for SSE, `jest.useFakeTimers()` for timer-dependent tests, factory functions with overrides, ESM default-export mocks) and introduces excellent new patterns (`jest.isolateModules()` for real `AgentService` with controllable SDK mocks, `mockResponse()` helper for heartbeat assertions, `successOutput` fixture reuse in classifier tests). **No skipped tests exist in scope** — all 49 tests are active. The 4 stale "TDD RED PHASE" headers are the most actionable finding (trivial to fix, high documentation-value impact). The worker handle leak from stalled generators is a MEDIUM determinism/isolation concern that should be addressed before the pattern propagates. The 2 file-length findings are pre-existing/cumulative and low-severity.

---

## Quality Criteria Assessment

| Criterion | Status | Score | Grade | Violations |
|-----------|--------|-------|-------|------------|
| Determinism | PASS (with warnings) | 88/100 | B | 1 MEDIUM, 2 LOW |
| Isolation | PASS (with warnings) | 90/100 | A | 1 MEDIUM, 1 LOW |
| Maintainability | PASS (with warnings) | 82/100 | B | 4 MEDIUM, 3 LOW |
| Performance | PASS | 92/100 | A | 1 LOW |

**Weighted Overall Score**: 88/100 (Grade B)

| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Determinism | 30% | 88 | 26.4 |
| Isolation | 30% | 90 | 27.0 |
| Maintainability | 25% | 82 | 20.5 |
| Performance | 15% | 92 | 13.8 |
| **Total** | | | **87.7 → 88** |

---

## Test File Inventory

| File | Lines | Tests | Priority Breakdown | Story 3.4 Action |
|------|-------|-------|--------------------|-------------------|
| `apps/web/src/components/conversation/ToolPill.test.tsx` | 142 | 9 | P0: 7, P1: 2 | Created |
| `apps/web/src/components/conversation/SemanticPill.test.tsx` | 62 | 5 | P0: 4, P1: 1 | Created |
| `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` | 199 | 10 | P0: 8, P1: 2 | Created |
| `apps/agent-be/src/streaming/agent.service.unit.spec.ts` | 457 | 11 | P0: 9, P1: 2 | Created |
| `apps/agent-be/src/streaming/streaming.controller.spec.ts` | 390 | 13 (5 new) | P0: 3 new, P1: 2 new | Extended |
| `apps/web/src/components/conversation/ConversationPane.test.tsx` | 902 | 28 (9 new) | P0: 8 new, P1: 1 new | Extended |
| `apps/web/src/components/conversation/ChatComponents.test.tsx` | 47 | 4 | N/A | Modified (removed ToolExecutionIndicator tests) |

**Totals**: 49 new test cases (P0: 39, P1: 10), 7 files, all passing.

---

## Test Execution Results

```
agent-be: 7 suites, 80 tests passed (3.2s)
web:      50 suites, 571 tests passed (6.2s)
```

All tests pass. 0 failures, 0 skipped (in scope).

---

## Findings

### FINDING-01: Stale "TDD RED PHASE" headers in 4 test files [MEDIUM]

**Severity**: MEDIUM (Maintainability)
**Files**:
- `apps/web/src/components/conversation/ToolPill.test.tsx:11-12`
- `apps/web/src/components/conversation/SemanticPill.test.tsx:10-11`
- `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts:10-11`
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts:14-15`

**Issue**: All 4 files have header comments saying:
```
TDD RED PHASE — tests are skipped until implementation lands.
Remove it.skip() → it() when activating for the current task.
```
But the tests are NOT skipped — all use active `it()`. The story's Coverage Validation Decisions confirm: "All 25 `it.skip()` tests were un-skipped." The headers are stale from the ATDD red-phase generation and were never updated when the tests were activated and made to pass (green phase).

**Impact**: A developer reading the header would believe the tests are skipped, potentially ignoring failures or attempting to "activate" already-active tests. Misleading documentation erodes trust in test metadata.

**Recommended Fix**: Update the headers to reflect green-phase status. Replace:
```
TDD RED PHASE — tests are skipped until implementation lands.
Remove it.skip() → it() when activating for the current task.
```
with:
```
TDD GREEN PHASE — tests are active and passing.
```
Or simply remove the phase annotation entirely (the tests speak for themselves).

**Knowledge Reference**: `test-quality.md` — "Tests must be deterministic, isolated, explicit, focused, and fast." Stale headers violate the "explicit" principle.

---

### FINDING-02: Worker process handle leak from stalled generators [MEDIUM]

**Severity**: MEDIUM (Determinism / Isolation)
**File**: `apps/agent-be/src/streaming/agent.service.unit.spec.ts:289-292, 365-368, 390-393`

**Issue**: The circuit breaker tests use `stalledGenerator` async generators that create never-resolving promises:
```typescript
const stalledGenerator = async function* (): AsyncGenerator<SDKMessage> {
  yield* [];
  await new Promise<never>(jest.fn()); // never resolves
};
```
When the circuit breaker fires (via `jest.advanceTimersByTime(120_000)`), the `runTurn` promise resolves (the breaker aborts the run). But the underlying `stalledGenerator`'s pending `Promise<never>` is never settled — it stays pending forever. Jest reports:
```
A worker process has failed to exit gracefully and has been force exited.
This is likely caused by tests leaking due to improper teardown.
```

The `afterEach` calls `jest.useRealTimers()` and `jest.clearAllMocks()` / `jest.restoreAllMocks()`, but these don't settle pending promises. The stalled generator's promise keeps the event loop alive.

**Impact**: Tests pass but leak handles. In larger suites or CI with `--detectOpenHandles`, this produces warnings and may cause slow shutdowns. On rare occasions, a leaked handle from one test could interfere with the next test's timer behavior.

**Recommended Fix**: Track and resolve the stalled generators in `afterEach`. One approach:
```typescript
let pendingResolvers: Array<() => void> = [];

// In stalledGenerator:
const stalledGenerator = async function* (): AsyncGenerator<SDKMessage> {
  yield* [];
  await new Promise<never>((_, reject) => {
    pendingResolvers.push(() => reject(new Error('test cleanup')));
  });
};

// In afterEach:
afterEach(() => {
  pendingResolvers.forEach((resolve) => resolve());
  pendingResolvers = [];
  jest.useRealTimers();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});
```
Alternatively, ensure `runTurn`'s `finally` block aborts the generator (which it should via `abortController.abort()` — verify the abort propagates to the generator's `await`).

**Knowledge Reference**: `test-quality.md` — "Self-Cleaning: Use fixtures with auto-cleanup or explicit `afterEach()` teardown." `test-healing-patterns.md` — worker leak patterns.

---

### FINDING-03: `agent.service.unit.spec.ts` exceeds 300-line guideline [LOW]

**Severity**: LOW (Maintainability)
**File**: `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (457 lines)

**Issue**: The file exceeds the 300-line guideline from `test-quality.md`. The complexity is inherent: 11 tests with shared SDK mock setup, circuit breaker timer management, controllable async generators, and classifier integration. The helper functions (`createAgentService`, `makeStreamEvent`, `setupMockQuery`, `yieldMessages`, `makeSdkMessage`) keep individual tests focused (each test body is 15-30 lines).

**Impact**: The file is long but well-organized. Future additions (Story 3.7 credential failure classification, Story 3.8 cost tracking) will extend it further.

**Recommended Fix**: Extract the SDK mock helpers into a separate test helper file:
```
apps/agent-be/src/streaming/agent-service-test-helpers.ts
```
Move `makeSdkMessage`, `makeStreamEvent`, `yieldMessages`, `setupMockQuery`, and `createAgentService` there. This would reduce the spec file to ~250 lines of test cases.

**Knowledge Reference**: `test-quality.md` — "< 300 Lines: Keep tests focused; split large tests or extract setup to fixtures."

---

### FINDING-04: `ConversationPane.test.tsx` is 902 lines [LOW]

**Severity**: LOW (Maintainability)
**File**: `apps/web/src/components/conversation/ConversationPane.test.tsx` (902 lines)

**Issue**: The file spans 4 stories (3.1, 3.2, 3.3, 3.4) and is 3x the 300-line guideline. Story 3.4's section (lines 683-901, ~220 lines) is well-organized with a dedicated describe block. The file follows the codebase pattern of one test file per component.

**Impact**: Pre-existing pattern, not introduced by Story 3.4. The file is unwieldy but the describe-block-per-story organization provides reasonable navigation. As Epic 3 continues (Stories 3.5-3.12), the file will grow further.

**Recommended Fix**: Consider splitting by story into separate files (`ConversationPane.story-3.1.test.tsx`, `ConversationPane.story-3.4.test.tsx`) or by concern (`ConversationPane.streaming.test.tsx`, `ConversationPane.tool-pills.test.tsx`). This is a codebase-level decision, not a Story 3.4 blocker.

**Knowledge Reference**: `test-quality.md` — "< 300 Lines: Keep tests focused; split large tests or extract setup to fixtures."

---

### FINDING-05: Private member access via bracket notation [LOW]

**Severity**: LOW (Maintainability)
**File**: `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts:184`

**Issue**: `jest.spyOn(service['logger'], 'warn')` accesses the private `logger` property via bracket notation to spy on the NestJS `Logger.warn()` call. This bypasses TypeScript's `private` modifier.

**Impact**: This is the standard pattern for spying on NestJS `Logger` instances across the codebase. The `logger` is a `private readonly` field initialized as `new Logger(ToolPillClassifierService.name)`. Bracket notation access is a common test-only escape hatch. Low-severity convention issue.

**Recommended Fix**: No action required — this is the accepted pattern for NestJS Logger spying. If a cleaner approach is desired, inject a `Logger` via DI (NestJS supports this) and mock it in tests. But this adds indirection for no functional benefit.

**Knowledge Reference**: `test-quality.md` — "Explicit Assertions: Keep `expect()` calls in test bodies, not hidden in helpers." (The spy is explicit; the access pattern is the concern.)

---

### FINDING-06: `eslint-disable` for `any` types in test mocks [LOW]

**Severity**: LOW (Maintainability)
**Files**:
- `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts:17` — `let mockPrisma: any`
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts:28-31` — `let mockPrisma: any`, `let mockQuery: any`
- `apps/agent-be/src/streaming/streaming.controller.spec.ts:17` — `let mockPrisma: any`

**Issue**: Test mocks use `any` type with `eslint-disable-next-line @typescript-eslint/no-explicit-any`. The project's `project-context.md` line 61 states: "`strict: true` is mandatory — never relax it with `any` or `@ts-ignore`. Use `unknown` and narrow with type guards."

**Impact**: Test files are a common exception zone for `any` — mock objects with partial shapes are tedious to type fully. The `eslint-disable` comments are explicit and scoped. This is a convention tension between strict-mode purity and test ergonomics.

**Recommended Fix**: No action required for Story 3.4. For future improvement, consider a `DeepPartialMock<T>` utility type that produces a partial mock with `jest.fn()` return types, eliminating the need for `any`.

**Knowledge Reference**: `project-context.md:61` — TypeScript strict mode rule.

---

### FINDING-07: Conditional flow control in circuit breaker "resets" test [LOW]

**Severity**: LOW (Determinism)
**File**: `apps/agent-be/src/streaming/agent.service.unit.spec.ts:318-362`

**Issue**: The "resets on each emitted event" test uses a `yieldMore` callback pattern with a conditional:
```typescript
if (yieldMore) yieldMore();
await runTurnPromise;
```
The `if (yieldMore)` is conditional flow control — the test behavior varies depending on whether the generator's promise was resolved. The `test-quality.md` guideline says "No Conditionals - Tests execute the same path every time."

**Impact**: In practice, `yieldMore` is always set (the generator's `await new Promise<void>((resolve) => { yieldMore = resolve; })` assigns it synchronously before the first `yield`). The conditional is a defensive null-check, not actual branching logic. The test is deterministic.

**Recommended Fix**: Remove the conditional — `yieldMore!()` with a non-null assertion, since the generator guarantees assignment. Or restructure to avoid the pending-promise pattern entirely.

**Knowledge Reference**: `test-quality.md` — "No Conditionals - Tests execute the same path every time (no if/else, try/catch for flow control)."

---

## Quality Dimension Details

### Determinism (88/100)

**Positives**:
- No hard waits (`waitForTimeout`, `sleep`, arbitrary `setTimeout` delays)
- No `Math.random()` without seeds
- `jest.useFakeTimers()` + `jest.advanceTimersByTime()` for all timer-dependent tests (circuit breaker 120s, heartbeat 15s, back-pressure 30s) — deterministic, instant
- `jest.isolateModules()` for per-test SDK mock isolation — correct pattern for module-registry binding
- Explicit mock return values: `jest.fn().mockResolvedValue()`, `jest.fn().mockImplementation()`
- `MockEventSource` is a deterministic test double — static `emit()` injects events synchronously

**Violations**:
- FINDING-02 (MEDIUM): Stalled generator handle leak — pending promises never settled
- FINDING-07 (LOW): Conditional `if (yieldMore)` in circuit breaker reset test
- LOW: `agent.service.unit.spec.ts:289` — `await new Promise<never>(jest.fn())` is a clever never-resolve pattern but relies on Jest's mock function behavior; a plain `new Promise(() => {})` would be clearer

### Isolation (90/100)

**Positives**:
- `beforeEach`/`afterEach` in every file: `jest.clearAllMocks()`, `jest.restoreAllMocks()`, `jest.useRealTimers()`
- `ConversationPane.test.tsx` saves/restores `global.fetch`, `global.EventSource`, `global.localStorage`
- `streaming.controller.spec.ts` saves/restores `process.env`
- `MockEventSource.reset()` in `beforeEach` — clears static listener state
- `cleanup()` from `@testing-library/react` in `afterEach`
- No shared mutable state between tests — each test creates its own mocks
- `jest.isolateModules()` ensures fresh module registry per test in `agent.service.unit.spec.ts`

**Violations**:
- FINDING-02 (MEDIUM): Worker process handle leak — stalled generators keep handles alive
- LOW: `ConversationPane.test.tsx` — `beforeEach` sets `jest.useFakeTimers()` but several describe blocks override with `jest.useRealTimers()` in their own `beforeEach`. Inconsistent but not a correctness issue (each describe block is isolated).

### Maintainability (82/100)

**Positives**:
- Header comments cite story, ACs, and context in all files
- P0/P1 priority tags in `it()` descriptions (e.g., `[P0] renders spinner and "Running… [toolName]" label`)
- Describe blocks organized by AC (e.g., `[P0] AC-1 — Running state`, `[P0] AC-5 — Circuit breaker`)
- Factory function `makeToolCall()` with `Partial<ToolCallData>` overrides — good pattern
- Helper functions: `mockResponse()`, `mockResponseWithBackPressure()`, `mintToken()`, `createAgentService()`, `setupMockQuery()`, `makeStreamEvent()`, `yieldMessages()` — good extraction
- Tests are focused: each tests one concern, 15-30 lines per test body
- Explicit assertions in test bodies (not hidden in helpers)
- `successOutput` fixture reused across classifier tests — reduces duplication

**Violations**:
- FINDING-01 (MEDIUM): Stale "TDD RED PHASE" headers in 4 files — misleading documentation
- FINDING-03 (LOW): `agent.service.unit.spec.ts` exceeds 300-line guideline (457 lines)
- FINDING-04 (LOW): `ConversationPane.test.tsx` is 902 lines (pre-existing, cumulative)
- FINDING-05 (LOW): Private member access via bracket notation
- FINDING-06 (LOW): `eslint-disable` for `any` types in test mocks
- LOW: `streaming.controller.spec.ts` header (line 1-6) still says "Story 3.1" — should mention Story 3.4 additions

### Performance (92/100)

**Positives**:
- All tests use mocks/stubs — no real database, no real network, no real SDK
- `jest.useFakeTimers()` for timer-dependent tests — instant execution (120s circuit breaker tested in 0ms)
- Unit tests (agent-be): 80 tests in 3.2s = ~40ms/test
- Component tests (web): 571 tests in 6.2s = ~11ms/test
- No unnecessary waits
- API-first setup pattern (mock fetch, mock EventSource, mock Prisma)
- `jest.isolateModules()` is slightly slower than direct instantiation but correct for the SDK mock constraint

**Violations**:
- FINDING-02 (LOW impact on performance): Handle leak causes force-exit warning, marginally slowing CI shutdown
- LOW: `jest.isolateModules()` per test creates a fresh module registry — correct but slower than direct `new AgentService(...)`. Acceptable given the constraint.

---

## Best Practices Observed

1. **`jest.isolateModules()` for real service with controllable SDK mock** (`agent.service.unit.spec.ts:63-76`) — The correct solution to the module-registry binding problem. `jest.doMock` doesn't affect already-imported modules; `jest.isolateModules` creates a fresh registry so `require('./agent.service')` picks up the `jest.doMock` factory. Documented as DP-4 in the story.

2. **`mockResponse()` helper with `written` array** (`streaming.controller.spec.ts:56-78`) — Cleanly captures SSE frame writes for assertion. The `written.length = 0` pattern (line 283) isolates heartbeat assertions from initial setup writes without complex mocking.

3. **`successOutput` fixture reuse** (`tool-pill-classifier.service.spec.ts:85-87`) — A single git commit output fixture is reused across 5 successful-commit tests, reducing duplication while keeping each test's assertions explicit.

4. **`makeToolCall()` factory with overrides** (`ToolPill.test.tsx:19-28`) — Clean factory function with `Partial<ToolCallData>` overrides, following the `data-factories.md` pattern. Each test specifies only the fields relevant to its assertion.

5. **`MockEventSource` extended for new event types** (`ConversationPane.test.tsx:39-79`) — The existing SSE test double was extended with TOOL_CALL_ARGS/END/RESULT/PROMOTED event support, following the established pattern. Static `emit()` enables deterministic event injection.

6. **`jest.spyOn(service['logger'], 'warn')` for degraded-path assertion** (`tool-pill-classifier.service.spec.ts:184`) — Correctly verifies the `logger.warn()` call in the Postgres lookup failure catch block, following the `project-context.md:128` pattern ("`logger.warn()` in catch blocks that return a default value").

---

## Knowledge Base References

- `test-quality.md` — Definition of Done: deterministic, isolated, explicit, focused, fast. Applied to all 4 quality dimensions.
- `test-healing-patterns.md` — Worker leak patterns, stale selector patterns. Applied to FINDING-02.
- `project-context.md` — Codebase rules: `jest.useFakeTimers()` patterns (line 83), `jest.isolateModules` (line 194), `buildTestModule()` (line 194), `userEvent.type()` (line 199), ESM default-export mocks (line 198), co-located tests (line 175), P0/P1 priority tags (line 182), `.unref()` on timers (line 208).
- `data-factories.md` — Factory functions with overrides. Applied to `makeToolCall()` and `defaultProps` patterns.

---

## Context References

- **Story file**: `_bmad-output/implementation-artifacts/3-4-see-tool-calls-and-recognized-actions-inline.md`
- **ATDD checklist**: `_bmad-output/test-artifacts/atdd-checklist-3-4-see-tool-calls-and-recognized-actions-inline.md`
- **Project context**: `_bmad-output/project-context.md`
- **TEA config**: `_bmad/tea/config.yaml`

---

## Completion Summary

**Scope reviewed**: 7 test files (3 backend unit, 4 frontend component) covering Story 3.4's 5 ACs.

**Overall score**: 88/100 (Grade B)

**Critical blockers**: 0

**Findings summary**:
- 0 HIGH violations
- 2 MEDIUM violations (stale headers, handle leak)
- 5 LOW violations (file lengths, private access, eslint-disable, conditional flow, header accuracy)

**Skipped tests**: 0 in scope. 3 out-of-scope Playwright E2E skips (Stories 1.2/1.3) with recorded reasons.

**Recommendation**: Approve with comments. The stale "TDD RED PHASE" headers (FINDING-01) are trivial to fix and should be addressed. The handle leak (FINDING-02) should be tracked but is not a blocker — tests pass deterministically despite the leak warning.

**Next recommended workflow**: `bmad-testarch-trace` for coverage analysis and coverage gate decisions against Story 3.4 acceptance criteria.
