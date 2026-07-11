---
story: '3.12'
title: 'Drain Conversations Gracefully on Deploy'
date: '2026-07-06'
mode: 'Validate'
agent: 'Master Test Architect'
---

# Automate Validation Report — Story 3.12

## Summary

| Metric                  | Value |
| ----------------------- | ----- |
| agent-be test suites    | 12 passed |
| agent-be tests          | 240 passed |
| web test suites         | 54 passed |
| web tests               | 667 passed |
| integration test suites | 1 passed |
| integration tests       | 16 passed |
| Story 3.12 tests        | 38 passed, 0 skipped |
| Skipped/disabled tests  | 0 |
| fixme/todo markers      | 0 |
| Lint errors (new)       | 0 |
| Typecheck errors        | 0 |
| Production code edited  | No |

**Verdict: PASS** — Story 3.12 is sufficiently covered. All 3 ACs (AC-1, AC-2, AC-3) have full unit + integration + component coverage. All 38 Story 3.12 tests pass across 6 test files. 0 skipped tests found — no healing required. No missing tests to generate. No E2E tests (deferred per DP-5 in the ATDD checklist — no browser-level mock covers backend-internal SIGTERM triggers, Postgres persistence, or onModuleDestroy drain logic).

---

## Step 1: Execution Mode & Context

- **Mode:** BMad-Integrated (story file loaded)
- **Story:** `_bmad-output/implementation-artifacts/3-12-drain-conversations-gracefully-on-deploy.md`
- **Story status:** review (all 9 tasks marked complete)
- **Decision policy:** `_bmad-output/decision-policy.md` loaded and consulted
- **Framework:** Jest 30 (unit/integration, co-located), React Testing Library (component)
- **ATDD checklist:** `_bmad-output/test-artifacts/atdd-checklist-3-12-drain-conversations-gracefully-on-deploy.md` cross-referenced (36 planned test cases — actual 38; see Coverage Assessment for the discrepancy)
- **User constraints:** Validate only; treat skipped tests as coverage failures; heal test-quality issues only (no production code edits); generate missing tests only if coverage insufficient; HALT only for decisions no rule covers

---

## Step 2: Skipped/Disabled Test Audit

Searched all 6 Story 3.12 test files for: `it.skip(`, `test.skip(`, `describe.skip(`, `xit(`, `xdescribe(`, `xtest(`, `test.todo(`, `it.todo(`, `test.fixme(`, `it.fixme(`.

**Result: 0 skipped tests.** All 38 Story 3.12 test cases are active. The dev-story step unskipped all ATDD scaffold tests during green-phase. No healing required.

Files verified:
- `apps/agent-be/src/streaming/session-events.service.spec.ts` — 0 skipped (6 active Story 3.12 tests)
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — 0 skipped (15 active Story 3.12 tests across 5 describe blocks)
- `apps/agent-be/src/conversations/manual-commit.service.spec.ts` — 0 skipped (6 active Story 3.12 tests)
- `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` — 0 skipped (3 active Story 3.12 tests)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — 0 skipped (4 active Story 3.12 tests)
- `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` — 0 skipped (4 active Story 3.12 tests)

Also searched for `test.fixme`, `it.fixme`, `TODO`, `FIXME`, `HACK`, `XXX` markers — 0 found.

---

## Step 3: Test Execution

### Unit Tests (agent-be)

**Command:** `yarn nx test agent-be --testPathPattern="session-events|conversations.service|manual-commit|sandbox.service.nfr-s1"`

**Result:** 12 suites passed, 240 tests passed, 0 failed, 0 skipped.

Log output contained expected `ERROR`/`WARN` messages from tests exercising failure paths (provision failure, clone failure, circuit breaker firing, concurrent-turn rejection, sandbox destruction failure) — these are intentional test scenarios asserting resilience, not real failures.

**Known pre-existing issue:** "A worker process has failed to exit gracefully and has been force exited." — caused by `IdleTimeoutService` 60s timers (documented in the story file's Testing Requirements section). Pre-existing across Stories 3.1, 3.3, 3.5, 3.6, 3.11. Not introduced by Story 3.12 tests. Tests still pass.

### Component Tests (web)

**Command:** `yarn nx test web --testPathPattern="ConversationPane"`

**Result:** 54 suites passed, 667 tests passed, 0 failed, 0 skipped.

### Integration Tests (agent-be)

**Command:** `npx jest --config test/jest-integration.config.ts sandbox-lifecycle` (from `apps/agent-be`)

**Result:** 1 suite passed, 16 tests passed, 0 failed, 0 skipped.

### E2E Tests

Not applicable. Story 3.12 has no E2E tests — all 3 ACs deferred per DP-5 in the ATDD checklist. The core behaviors are backend-internal (SIGTERM process signal, Postgres persistence, onModuleDestroy lifecycle hooks) that no browser-level mock can simulate. The browser-observable part (receiving SESSION_DRAINING → state transition) is covered by component tests.

---

## Step 4: AC Coverage Map

### AC-1: SIGTERM → SSE drain notification + reconnect + resume — PASS

| # | Test | File | Priority | Status |
|---|------|------|----------|--------|
| 1.1 | `[P0] onModuleDestroy emits SESSION_DRAINING to all conversations with active subjects` | session-events.service.spec.ts:29 | P0 | PASS |
| 1.2 | `[P0] onModuleDestroy completes each subject after emitting drain` | session-events.service.spec.ts:40 | P0 | PASS |
| 1.3 | `[P0] onModuleDestroy emits SESSION_DRAINING before completing the subject` | session-events.service.spec.ts:51 | P0 | PASS |
| 1.4 | `[P0] onModuleDestroy is a no-op when no conversations have active subjects` | session-events.service.spec.ts:68 | P0 | PASS |
| 1.5 | `[P0] complete() removes the subject so reconnecting clients get a fresh ReplaySubject` | session-events.service.spec.ts:78 | P0 | PASS |
| 1.6 | `[P1] SessionEventsService implements OnModuleDestroy` | session-events.service.spec.ts:92 | P1 | PASS |
| 1.7 | `[P0] sets state to "reconnecting" when SESSION_DRAINING is received` | ConversationPane.test.tsx:2150 | P0 | PASS |
| 1.8 | `[P0] SESSION_DRAINING listener wraps JSON.parse in try/catch (does not throw on malformed data)` | ConversationPane.test.tsx:2167 | P0 | PASS |
| 1.9 | `[P0] onerror does not override "reconnecting" state set by SESSION_DRAINING` | ConversationPane.test.tsx:2186 | P0 | PASS |
| 1.10 | `[P0] SESSION_DRAINING transitions from "ready" to "reconnecting" (not "error")` | ConversationPane.test.tsx:2211 | P0 | PASS |
| 1.11 | `[P0] resume() returns conversationId from sandbox.labels, not the sandboxId` | sandbox.service.nfr-s1.spec.ts:223 | P0 | PASS |
| 1.12 | `[P0] resume() returns the correct sandboxId (distinct from conversationId)` | sandbox.service.nfr-s1.spec.ts:233 | P0 | PASS |
| 1.13 | `[P0] resume() returns status "ready" after starting the sandbox` | sandbox.service.nfr-s1.spec.ts:244 | P0 | PASS |
| 1.14 | `[P0] SessionEventsService.onModuleDestroy emits SESSION_DRAINING to all active conversations` | sandbox-lifecycle.integration.spec.ts:271 | P0 | PASS |
| 1.15 | `[P0] full drain sequence: MANUAL_SAVE_FAILED emits before SESSION_DRAINING (shutdown ordering)` | sandbox-lifecycle.integration.spec.ts:316 | P0 | PASS |

**AC-1 sub-requirements verified:**
- onModuleDestroy emits SESSION_DRAINING to all active conversations (test 1.1) ✓
- Subjects completed after drain (test 1.2) ✓
- Drain-before-complete ordering (test 1.3) ✓
- No-op when no active conversations — edge case (test 1.4) ✓
- complete() removes subject → fresh ReplaySubject on reconnect (test 1.5) ✓
- OnModuleDestroy interface wired (test 1.6) ✓
- Frontend SESSION_DRAINING → 'reconnecting' state (test 1.7) ✓
- try/catch on JSON.parse in SSE listener — project-context.md:122 (test 1.8) ✓
- onerror preserves 'reconnecting' — project-context.md:123 (test 1.9) ✓
- Drain is not an error — 'reconnecting' not 'error' (test 1.10) ✓
- resume() returns correct conversationId from labels — P3 prerequisite (test 1.11) ✓
- sandboxId distinct from conversationId (test 1.12) ✓
- resume() status is 'ready' (test 1.13) ✓
- Integration: drain reaches all conversations through full NestJS wiring (test 1.14) ✓
- Integration: shutdown ordering — MANUAL_SAVE_FAILED before SESSION_DRAINING (test 1.15) ✓

**E2E deferred per DP-5** (documented in ATDD checklist) — SIGTERM trigger is a backend process signal; no browser-level mock covers it.

### AC-2: getStatus reports correct sandbox status after restart — PASS

| # | Test | File | Priority | Status |
|---|------|------|----------|--------|
| 2.1 | `[P0] getStatus returns persisted sandboxStatus after restart (in-memory Map cleared)` | conversations.service.spec.ts:1220 | P0 | PASS |
| 2.2 | `[P0] getStatus returns "failed" when conversation not found in Postgres` | conversations.service.spec.ts:1237 | P0 | PASS |
| 2.3 | `[P0] getStatus returns "provisioning" when sandboxStatus is null in Postgres (new conversation)` | conversations.service.spec.ts:1246 | P0 | PASS |
| 2.4 | `[P0] getStatus does NOT fall back to in-memory Map when Postgres has the status` | conversations.service.spec.ts:1258 | P0 | PASS |
| 2.5 | `[P0] countActiveConversations queries Postgres with sandboxStatus in filter (not findMany + Map iteration)` | conversations.service.spec.ts:1273 | P0 | PASS |
| 2.6 | `[P0] countActiveConversations returns 0 when no active conversations exist` | conversations.service.spec.ts:1287 | P0 | PASS |
| 2.7 | `[P0] resumeConversation reads sandboxStatus and sandboxId from Postgres (not in-memory Maps)` | conversations.service.spec.ts:1297 | P0 | PASS |
| 2.8 | `[P0] resumeConversation fast-path works after restart (Postgres has ready status + sandboxId)` | conversations.service.spec.ts:1311 | P0 | PASS |
| 2.9 | `[P0] resumeConversation returns "failed" when conversation not found in Postgres` | conversations.service.spec.ts:1324 | P0 | PASS |
| 2.10 | `[P0] provisionSandbox writes sandboxId and sandboxStatus="ready" to Postgres on success` | conversations.service.spec.ts:1334 | P0 | PASS |
| 2.11 | `[P0] provisionSandbox writes sandboxStatus="failed" and clears sandboxId on provision failure` | conversations.service.spec.ts:1347 | P0 | PASS |
| 2.12 | `[P0] mid-session idle timeout writes sandboxStatus="idle-timeout" and clears sandboxId` | conversations.service.spec.ts:1360 | P0 | PASS |
| 2.13 | `[P0] createConversation writes sandboxStatus="provisioning" to Postgres` | conversations.service.spec.ts:1374 | P0 | PASS |
| 2.14 | `[P0] listSkills reads sandboxId from Postgres (not in-memory Map)` | conversations.service.spec.ts:1389 | P0 | PASS |
| 2.15 | `[P0] listSkills returns [] when sandboxId is null in Postgres` | conversations.service.spec.ts:1407 | P0 | PASS |
| 2.16 | `[P0] getStatus returns persisted sandboxStatus after simulated restart (in-memory Maps cleared)` | sandbox-lifecycle.integration.spec.ts:300 | P0 | PASS |

**AC-2 sub-requirements verified:**
- getStatus reads from Postgres, not in-memory Map (tests 2.1, 2.4) ✓
- Not-found returns 'failed', not 'provisioning' (test 2.2) ✓
- Null status falls back to 'provisioning' for new conversations (test 2.3) ✓
- countActiveConversations uses Postgres count with status filter (tests 2.5, 2.6) ✓
- resumeConversation reads sandboxId + sandboxStatus from Postgres (tests 2.7, 2.8) ✓
- resumeConversation not-found returns 'failed' (test 2.9) ✓
- Sandbox state persisted on every write: provision success (2.10), failure (2.11), idle timeout (2.12), create (2.13) ✓
- listSkills reads sandboxId from Postgres (tests 2.14, 2.15) ✓
- Integration: getStatus after simulated restart through full NestJS wiring (test 2.16) ✓

**E2E deferred per DP-5** (documented in ATDD checklist) — Postgres persistence is backend-internal; no browser-level mock covers it.

### AC-3: ManualCommitService drain — complete or notify — PASS

| # | Test | File | Priority | Status |
|---|------|------|----------|--------|
| 3.1 | `[P0] onModuleDestroy emits MANUAL_SAVE_FAILED for each pending commit` | manual-commit.service.spec.ts:215 | P0 | PASS |
| 3.2 | `[P0] onModuleDestroy does NOT silently drop pending commits (clear without emit is forbidden)` | manual-commit.service.spec.ts:228 | P0 | PASS |
| 3.3 | `[P0] onModuleDestroy attempts bounded completion of pending commits before emitting failure` | manual-commit.service.spec.ts:239 | P0 | PASS |
| 3.4 | `[P0] onModuleDestroy emits MANUAL_SAVE_FAILED when completion attempt times out (NFR-P5 ≤ 5s budget)` | manual-commit.service.spec.ts:255 | P0 | PASS |
| 3.5 | `[P0] onModuleDestroy preserves the executingCommits Set guard (no parallel-commit race)` | manual-commit.service.spec.ts:274 | P0 | PASS |
| 3.6 | `[P0] onModuleDestroy is async (NestJS awaits async lifecycle hooks)` | manual-commit.service.spec.ts:287 | P0 | PASS |
| 3.7 | `[P0] ManualCommitService.onModuleDestroy emits MANUAL_SAVE_FAILED for pending commits before subjects complete` | sandbox-lifecycle.integration.spec.ts:287 | P0 | PASS |

**AC-3 sub-requirements verified:**
- MANUAL_SAVE_FAILED emitted for pending commits (test 3.1) ✓
- No silent drop — regression guard for the bug being fixed (test 3.2) ✓
- Bounded completion attempted before failure (test 3.3) ✓
- Timeout → MANUAL_SAVE_FAILED (NFR-P5 ≤ 5s budget) (test 3.4) ✓
- executingCommits Set guard preserved — no parallel-commit race (test 3.5) ✓
- Async lifecycle hook (test 3.6) ✓
- Integration: MANUAL_SAVE_FAILED emits before subjects complete through full NestJS wiring (test 3.7) ✓

**E2E deferred per DP-5** (documented in ATDD checklist) — onModuleDestroy drain logic is backend-internal; no browser-level mock covers it.

---

## Step 5: Coverage Assessment

### ATDD Checklist Cross-Reference

The ATDD checklist planned 36 test cases across 6 files. Actual count is 38 — the checklist header for `conversations.service.spec.ts` says "13 tests" but the checklist's own test descriptions list 15 (4+2+3+4+2). The dev agent activated all 15 scaffolds. This is a documentation miscount in the checklist header, not a coverage gap.

| File | Planned (header) | Planned (descriptions) | Actual | Match |
|------|------------------|------------------------|--------|-------|
| session-events.service.spec.ts | 6 | 6 | 6 | Yes |
| conversations.service.spec.ts | 13 | 15 | 15 | Yes (descriptions match) |
| manual-commit.service.spec.ts | 6 | 6 | 6 | Yes |
| sandbox.service.nfr-s1.spec.ts | 3 | 3 | 3 | Yes |
| ConversationPane.test.tsx | 4 | 4 | 4 | Yes |
| sandbox-lifecycle.integration.spec.ts | 4 | 4 | 4 | Yes |
| **Total** | **36** | **38** | **38** | **Yes** |

All planned test cases are present and active. No missing tests.

### Priority Breakdown

| Priority | Actual | Passing |
|----------|--------|---------|
| P0 | 37 | 37 |
| P1 | 1 | 1 |
| **Total** | **38** | **38** |

### Coverage Gaps

**None identified.** All ACs have complete coverage matching the ATDD checklist's test descriptions. E2E tests are deferred per documented DP-5 decisions in the ATDD checklist (no browser-level mock can verify backend-internal SIGTERM triggers, Postgres persistence, or onModuleDestroy drain logic).

**Decision (DP-5):** No additional tests generated. The story's 38 defined test cases are all present, active, and passing. Expanding beyond the story plan would be scope expansion, which DP-5 defers. The user instruction to "generate missing tests only" does not apply — no tests are missing.

---

## Step 6: Healing Summary

No healing was required:
- 0 skipped tests found (nothing to un-skip)
- 0 test-quality failures (nothing to heal)
- 0 unfixable test-quality failures (nothing to mark as expected-to-fail)
- 0 production code edits (per user constraint)

---

## Decision Records

**Decision (DP-4):** Marked coverage as sufficient without generating new tests. Test-only assessment — all 38 planned test cases exist, are active, and all pass. No production behavior change. Autonomous decision per DP-4.

**Decision (DP-5):** Did not generate additional edge-case tests beyond the story plan. The story's 38 defined test cases cover all ACs. E2E deferred per existing DP-5 decisions in the ATDD checklist (SIGTERM trigger, Postgres persistence, onModuleDestroy drain logic are all backend-internal). Expanding test scope beyond the story's acceptance criteria would be scope temptation.

**Decision (DP-5):** Did not mark any tests as expected-to-fail. All 38 tests pass — there is nothing to mark. The E2E deferral is documented in the ATDD checklist as a deferred finding, not as an expected-to-failure on an existing test (no E2E test file exists for Story 3.12).

**Decision (DP-4):** Did not fix the pre-existing "worker process has failed to exit gracefully" warning. Caused by `IdleTimeoutService` 60s timers (documented across Stories 3.1, 3.3, 3.5, 3.6, 3.11). Pre-existing, not introduced by Story 3.12. Test-only teardown change outside this story's scope. Recorded as a deferred finding, not addressed.

---

## Completion Criteria

| Criterion | Status |
|-----------|--------|
| Execution mode determined (BMad-Integrated) | PASS |
| Framework configuration loaded (Jest 30) | PASS |
| Coverage analysis completed (no gaps) | PASS |
| Automation targets identified (38 test cases) | PASS |
| Test levels selected (unit + integration + component) | PASS |
| Duplicate coverage avoided | PASS |
| Test priorities assigned (P0: 37, P1: 1) | PASS |
| All planned tests present and active | PASS |
| Unit tests pass (28/28 Story 3.12: 6+15+6+3 agent-be + 4 web) | PASS |
| Integration tests pass (4/4 Story 3.12) | PASS |
| No skipped tests | PASS |
| No test-quality failures | PASS |
| No fixme/todo markers | PASS |
| No production code edited | PASS |
| AC-1 covered (15 tests) | PASS |
| AC-2 covered (16 tests) | PASS |
| AC-3 covered (7 tests) | PASS |
| Validation report written | PASS |

---

## Test Execution Commands

```bash
# Unit tests (Story 3.12 + all agent-be)
yarn nx test agent-be --testPathPattern="session-events|conversations.service|manual-commit|sandbox.service.nfr-s1"
# Result: 12 suites, 240 tests passed

# Component tests (Story 3.12 + all web)
yarn nx test web --testPathPattern="ConversationPane"
# Result: 54 suites, 667 tests passed

# Integration tests
npx jest --config test/jest-integration.config.ts sandbox-lifecycle
# Result: 1 suite, 16 tests passed
```

---

## Deferred Findings

**E2E coverage (DP-5):** All 3 ACs have backend-internal core behaviors (SIGTERM trigger, Postgres persistence, onModuleDestroy drain logic) that no browser-level mock can simulate. The browser-observable parts (receiving SESSION_DRAINING → state transition) are covered by component tests. Deferred per DP-5 in the ATDD checklist.

**Worker process leak (DP-4):** "A worker process has failed to exit gracefully" Jest warning caused by `IdleTimeoutService` 60s timers. Pre-existing across Stories 3.1, 3.3, 3.5, 3.6, 3.11. Not introduced by Story 3.12. Tests still pass. Deferred — fixing requires clearing IdleTimeoutService timers in afterEach across multiple pre-existing test files, which is outside this story's scope.

**ATDD checklist miscount:** The checklist header for `conversations.service.spec.ts` says "13 tests" but the checklist's own test descriptions list 15 (4+2+3+4+2). The dev agent activated all 15. Documentation-only discrepancy; no coverage impact.
