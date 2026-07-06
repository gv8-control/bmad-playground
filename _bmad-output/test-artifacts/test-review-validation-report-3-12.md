---
story: '3.12'
title: 'Drain Conversations Gracefully on Deploy'
date: '2026-07-06'
mode: 'Validate'
agent: 'Master Test Architect'
focus: 'Skipped-test audit + stale transitional marker remediation + empty placeholder stub removal'
---

# Test Review Validation Report — Story 3.12

## Validation Scope

This validation was run with three specific directives:

1. **Flag skipped story-related tests for un-skipping or removal** (with reason)
2. **Fix stale transitional markers directly** — comments/headers claiming tests are skipped/disabled/red-phase when they're actually active must be updated to reflect current state. Do not defer out-of-scope markers to a separate validation — markers from earlier stories in the same directories are fixed directly.
3. **Remove empty placeholder test stubs directly** — active tests with no assertions, only a comment or empty body, are transitional artifacts that inflate the count without verifying behavior. Removed directly wherever found during the search, including those from earlier stories in the same directories.

**Story:** 3.12 — Drain Conversations Gracefully on Deploy
**Story status:** done
**Test framework:** Jest 30 (unit/integration/component, co-located) + Playwright (E2E in `playwright/` dir)

### Test Files in Scope

| File | Story 3.12 Tests | Role |
|------|------------------|------|
| `apps/agent-be/src/streaming/session-events.service.spec.ts` (NEW — created by ATDD) | 6 | AC-1 (onModuleDestroy emits SESSION_DRAINING, completes subjects, drain-before-complete ordering, no-op on empty) |
| `apps/agent-be/src/conversations/conversations.service.spec.ts` (Story 3.12 blocks) | 13 | AC-2 (getStatus/countActiveConversations/resumeConversation/listSkills read from Postgres; persistSandboxState on every write) |
| `apps/agent-be/src/conversations/manual-commit.service.spec.ts` (Story 3.12 block) | 6 | AC-3 (onModuleDestroy drain — bounded completion, MANUAL_SAVE_FAILED, executingCommits guard, async hook) |
| `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (Story 3.12 block) | 3 | AC-1 (resume() returns conversationId from sandbox.labels, not sandboxId) |
| `apps/web/src/components/conversation/ConversationPane.test.tsx` (Story 3.12 blocks) | 4 | AC-1 (SESSION_DRAINING handler sets state to 'reconnecting') |
| `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` (Story 3.12 block) | 4 | AC-1 (SESSION_DRAINING to all conversations), AC-2 (getStatus after restart), AC-3 (MANUAL_SAVE_FAILED before SESSION_DRAINING) |
| **Total** | **36** | |

### Directories Searched (same-directory scope for earlier-story markers and stubs)

| Directory | Files Reviewed |
|-----------|---------------|
| `apps/agent-be/src/streaming/` | `session-events.service.spec.ts`, `agent.service.unit.spec.ts`, `agent.service.spec.ts`, `streaming.controller.spec.ts`, `tool-pill-classifier.service.spec.ts` |
| `apps/agent-be/src/conversations/` | `conversations.service.spec.ts`, `manual-commit.service.spec.ts`, `semantic-title.spec.ts` |
| `apps/agent-be/src/sandbox/` | `sandbox.service.nfr-s1.spec.ts` (new directory for this validation — not covered by 3.11 pass) |
| `apps/web/src/components/conversation/` | `ConversationPane.test.tsx`, `AccessNotice.test.tsx`, `AgentMessage.test.tsx`, `ChatComponents.test.tsx`, `ChatInput.test.tsx`, `ChatMessageList.test.tsx`, `SlashCommandPicker.test.tsx`, `SemanticPill.test.tsx`, `ToolPill.test.tsx`, `UserMessage.test.tsx`, `WorkingTreeIndicator.test.tsx`, `useDraftPersistence.test.ts` |
| `apps/agent-be/test/integration/` | `sandbox-lifecycle.integration.spec.ts` |

---

## Directive 1: Skipped-Test Audit

### Method

Searched all in-scope test files and same-directory neighbors for: `it.skip(`, `test.skip(`, `describe.skip(`, `xit(`, `xdescribe(`, `xtest(`, `test.todo(`, `it.todo(`, `test.fixme(`, `it.fixme(`, and bare `.skip` references in comments.

### Result: PASS — 0 skipped tests found

All 36 Story 3.12 test cases are active (`it()`/`test()`/`describe()` calls, not `.skip()`). Nothing to flag for un-skipping. This confirms the Story 3.12 Dev Agent Record (Task 9: "All 36 ATDD scaffolds activated") and the automate-validation report's finding ("0 skipped tests found — no healing required").

| File | Skipped | Active | Total |
|------|---------|--------|-------|
| `session-events.service.spec.ts` | 0 | 6 | 6 |
| `conversations.service.spec.ts` (Story 3.12 blocks) | 0 | 13 | 13 |
| `manual-commit.service.spec.ts` (Story 3.12 block) | 0 | 6 | 6 |
| `sandbox.service.nfr-s1.spec.ts` (Story 3.12 block) | 0 | 3 | 3 |
| `ConversationPane.test.tsx` (Story 3.12 blocks) | 0 | 4 | 4 |
| `sandbox-lifecycle.integration.spec.ts` (Story 3.12 block) | 0 | 4 | 4 |
| **Total** | **0** | **36** | **36** |

---

## Directive 2: Stale Transitional Marker Remediation

### Method

Read each in-scope file's header comment block in full. Searched all test files in the 5 in-scope directories for: `RED PHASE`, `red-phase`, `TDD RED`, `GREEN PHASE`, `green-phase`, `TDD GREEN`, `skipped`, `disabled`, `un-skip`, `unskip`, `activate`. Distinguished legitimate uses of "disabled" (prop names, UI states) from transitional markers.

### Result: 6 stale/incomplete transitional markers found and fixed

1 stale RED PHASE marker (Story 3.12 in-scope file) claimed tests were skipped when they were active — fixed to GREEN PHASE. 5 incomplete GREEN PHASE markers / story lists didn't mention Story 3.12 despite 3.12 tests being active in the file — updated to reflect current state.

### Fixes Applied

#### Fix 1: `apps/agent-be/src/streaming/session-events.service.spec.ts` (header, line 13) — STALE RED PHASE

**Story:** 3.12 (in-scope file, created by ATDD)

**Stale state:** Header claimed "TDD RED PHASE — all tests skipped until implementation lands (Task 5)." But the file contains zero `it.skip()` calls — all 6 tests are active `it()` calls with real assertions. The marker was left over from the ATDD red-phase scaffold and never updated when the tests were activated during green-phase implementation. The story status is `done`.

**Fix:** Replaced the RED PHASE marker with "TDD GREEN PHASE — all tests un-skipped and passing."

#### Fix 2: `apps/agent-be/src/conversations/conversations.service.spec.ts` (header, lines 7, 20-23) — INCOMPLETE GREEN PHASE

**Story:** 3.12 (in-scope file)

**Stale state:** Header story list (lines 2-7) listed Stories 3.1, 3.2, 3.5, 3.9, 3.10, 3.11 but not 3.12, despite Story 3.12 adding 13 tests across 5 describe blocks. The GREEN PHASE note (line 22) said "Story 3.5/3.9/3.10/3.11 tests un-skipped and passing" — incomplete, since the file now contains 13 active Story 3.12 tests.

**Fix:** Added "Story 3.12: Drain Conversations Gracefully on Deploy" to the story list. Added a "Story 3.12 covers:" line documenting AC-1 (SessionEventsService.onModuleDestroy emits SESSION_DRAINING), AC-2 (getStatus/countActiveConversations/resumeConversation/listSkills read sandbox state from Postgres; persistSandboxState on every write), AC-3 (ManualCommitService drain — complete or notify via MANUAL_SAVE_FAILED). Updated the GREEN PHASE note to "Story 3.5/3.9/3.10/3.11/3.12 tests un-skipped and passing."

#### Fix 3: `apps/agent-be/src/conversations/manual-commit.service.spec.ts` (header, lines 4-12) — INCOMPLETE STORY LIST

**Story:** 3.12 (in-scope file)

**Stale state:** Header (lines 1-11) documented only Story 3.6 and its ACs, with no phase marker. Story 3.12 added a describe block (6 tests) at line 214. The header did not mention Story 3.12 at all.

**Fix:** Added "Story 3.12: Drain Conversations Gracefully on Deploy" to the story list. Added a "Story 3.12 covers:" line documenting AC-3 (onModuleDestroy drain — bounded completion of pending commits or MANUAL_SAVE_FAILED notification; executingCommits guard preserved; async lifecycle hook). Added a "TDD GREEN PHASE — all tests un-skipped and passing." note (the file previously had no phase marker; added to match the established header convention).

#### Fix 4: `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (header, lines 4-10) — INCOMPLETE STORY LIST

**Story:** 3.12 (in-scope file; this directory was not covered by the 3.11 validation pass)

**Stale state:** Header story list (lines 4-5) listed Stories 3.8 and 3.10 but not 3.12, despite Story 3.12 adding a describe block (3 tests) at line 222. The GREEN PHASE note (line 22) said "all tests un-skipped and passing" — accurate but generic; the story list was incomplete.

**Fix:** Added "Story 3.12: Drain Conversations Gracefully on Deploy" to the story list. Added a "Story 3.12 covers:" line documenting AC-1 (resume() returns conversationId from sandbox.labels, not the sandboxId — contract fix for reconnect/resume). The GREEN PHASE note was already accurate ("all tests un-skipped and passing") and left unchanged.

#### Fix 5: `apps/web/src/components/conversation/ConversationPane.test.tsx` (header, lines 9, 23-25) — INCOMPLETE STORY LIST

**Story:** 3.12 (in-scope file)

**Stale state:** Header story list (lines 4-9) listed Stories 3.1, 3.2, 3.3, 3.5, 3.9, 3.11 but not 3.12, despite Story 3.12 adding 4 tests. The GREEN PHASE note (line 24) said "all tests un-skipped and passing" — accurate but generic; the story list was incomplete.

**Fix:** Added "Story 3.12: Drain Conversations Gracefully on Deploy" to the story list. Added a "Story 3.12 covers:" line documenting AC-1 (SESSION_DRAINING event handler sets state to 'reconnecting' — reuses existing SessionState; onerror preserves state). The GREEN PHASE note was already accurate and left unchanged.

#### Fix 6: `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` (header, lines 21-27) — INCOMPLETE COVERAGE LIST

**Story:** 3.12 (in-scope file)

**Stale state:** Header "Covers:" list documented B-01 (fake seam), sandbox provision/destroy, idle timeout, zombie cleanup, Story 3.10's commit-attribution tests, and Story 3.11's integration tests — but did not mention Story 3.12's integration tests (4 tests), despite all being active.

**Fix:** Added "Story 3.12 covers:" line documenting AC-1 (SessionEventsService.onModuleDestroy emits SESSION_DRAINING to all active conversations), AC-2 (getStatus returns persisted sandboxStatus after simulated restart), AC-3 (MANUAL_SAVE_FAILED emits before SESSION_DRAINING — shutdown ordering).

### Files Reviewed With No Markers Found

| File | Result |
|------|--------|
| `apps/agent-be/src/streaming/agent.service.unit.spec.ts` | GREEN PHASE marker "Story 3.4/3.7/3.8/3.11 tests un-skipped and passing" — accurate (Story 3.12 did not add tests to this file). No change. |
| `apps/agent-be/src/streaming/agent.service.spec.ts` | No transitional markers |
| `apps/agent-be/src/streaming/streaming.controller.spec.ts` | No transitional markers |
| `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` | No transitional markers |
| `apps/agent-be/src/conversations/semantic-title.spec.ts` | No transitional markers |
| `apps/web/src/components/conversation/SlashCommandPicker.test.tsx` | GREEN PHASE marker — accurate (fixed in Story 3.11 validation; Story 3.12 did not add tests here). No change. |
| `apps/web/src/components/conversation/ToolPill.test.tsx` | GREEN PHASE marker — accurate (fixed in Story 3.11 validation; Story 3.12 did not add tests here). No change. |
| `apps/web/src/components/conversation/AccessNotice.test.tsx` | No transitional markers |
| `apps/web/src/components/conversation/AgentMessage.test.tsx` | No transitional markers |
| `apps/web/src/components/conversation/ChatComponents.test.tsx` | No transitional markers |
| `apps/web/src/components/conversation/ChatInput.test.tsx` | No transitional markers ("disabled" is a prop name, not a marker) |
| `apps/web/src/components/conversation/ChatMessageList.test.tsx` | No transitional markers |
| `apps/web/src/components/conversation/SemanticPill.test.tsx` | No transitional markers |
| `apps/web/src/components/conversation/UserMessage.test.tsx` | No transitional markers |
| `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx` | No transitional markers ("disabled" is a UI state, not a marker) |
| `apps/web/src/components/conversation/useDraftPersistence.test.ts` | No transitional markers |

---

## Directive 3: Empty Placeholder Test Stub Removal

### Method

Ran a brace-matching scan across all 22 test files in the 5 in-scope directories. For every `it()`/`test()` call, extracted the body between the opening `{` and matching closing `}`, and flagged any test whose body contains no `expect()` call AND only comment lines or whitespace (an empty/comment-only body). These are transitional artifacts — an empty test that passes trivially inflates the count without verifying behavior.

### Result: 2 empty placeholder test stubs found and removed

Both were in `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts`, from earlier stories in the same directory. Removed directly per the validation directive.

### Stubs Removed

#### Removal 1: `it('destroys sandbox on conversation close', ...)` — Story 3.1 (earlier story, same directory)

**File:** `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts`
**Lines (pre-removal):** 127-129

```typescript
it('destroys sandbox on conversation close', () => {
    // No close-conversation endpoint in Story 3.1 — deferred
});
```

**Reason for removal:** This test had no priority tag (`[P0]`/`[P1]`), no assertions, and no implementation — only a comment saying "No close-conversation endpoint in Story 3.1 — deferred". It was a placeholder stub from Story 3.1 that was never implemented. An empty test that passes trivially provides false confidence: it inflates the test count without verifying any behavior. The close-conversation endpoint remains unimplemented (not in any story scope through 3.12); if it becomes relevant, it should be implemented with real assertions, not left as a passing-empty placeholder.

#### Removal 2: `it('terminates agent process via Daytona API when sandbox-agent crashes', ...)` — Story 3.3/3.4 (earlier story, same directory)

**File:** `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts`
**Lines (pre-removal):** 154-156

```typescript
it('terminates agent process via Daytona API when sandbox-agent crashes', () => {
    // Story 3.3/3.4 scope
});
```

**Reason for removal:** This test had no priority tag, no assertions, and no implementation — only a comment saying "Story 3.3/3.4 scope". It was a placeholder stub from Story 3.3/3.4 that was never implemented. This stub was previously flagged for removal in the Story 3.10 validation report and re-flagged in the Story 3.11 validation report ("still present"). Per this validation's directive to remove empty placeholder stubs directly (not defer), it has now been removed. The scenario (sandbox-agent crash → Daytona API termination) remains a Story 3.3/3.4 concern; if still relevant, it should be implemented with real assertions.

### Files Reviewed With No Empty Stubs Found

All other 21 test files in the 5 in-scope directories were scanned. No empty/comment-only test stubs were found. Every `it()`/`test()` call in these files contains at least one `expect()` assertion.

---

## ATDD Checklist Artifact Note

The ATDD checklist (`_bmad-output/test-artifacts/atdd-checklist-3-12-drain-conversations-gracefully-on-deploy.md`) contains historical RED phase documentation (e.g., "Status: RED — `it.skip()`", "All tests written as red-phase scaffolds with `it.skip()`"). This is a **historical workflow artifact** from the ATDD generation step, not a test file header. It accurately documents the state at generation time. The green-phase transition is recorded in the story file's Dev Agent Record (Completion Notes List, Change Log). No modification needed — it is a historical record, not a stale marker in a test file.

---

## Verification: Test Execution

| Suite | Command | Result |
|-------|---------|--------|
| agent-be unit (4 in-scope Jest files) | `yarn nx test agent-be --testPathPattern="session-events.service.spec\|conversations.service.spec\|manual-commit.service.spec\|sandbox.service.nfr-s1.spec"` | 12 suites, 240 tests passed, 0 failed, 0 skipped |
| agent-be integration (1 in-scope file) | `yarn jest --config test/jest-integration.config.ts --testPathPatterns="sandbox-lifecycle.integration.spec"` (run from `apps/agent-be`; the `test-integration` nx target passes the deprecated `--testPathPattern` flag which Jest 30 rejects) | 1 suite, 14 tests passed, 0 failed, 0 skipped |
| web (1 in-scope Jest file) | `yarn nx test web --testPathPattern="ConversationPane.test"` | 54 suites, 667 tests passed, 0 failed, 0 skipped |
| **Total** | | **921 tests passed, 0 failed, 0 skipped** |

The integration file went from 16 tests (14 real + 2 empty stubs) to 14 tests after removing the 2 empty placeholder stubs. All 14 remaining tests pass. The 2 removed stubs passed trivially (empty bodies) and verified no behavior — their removal reduces the count without reducing coverage.

**Pre-existing test infrastructure note:** The `agent-be:test-integration` nx target passes `--testPathPattern` through to Jest 30, which renamed the flag to `--testPathPatterns`. The target runs successfully without a path filter (all integration tests run); the flag incompatibility only surfaces when scoping. This is a pre-existing target configuration issue, not introduced by this validation.

---

## Quality Score

| Component | Score |
|-----------|-------|
| Skipped tests | 100 (0 skipped — nothing to flag for un-skipping) |
| Transitional markers | 100 (6 stale/incomplete markers found and fixed directly) |
| Empty placeholder tests | 100 (2 empty stubs found and removed directly — 0 remaining) |
| Test execution | 100 (921 pass across 67 suites, 0 failed, 0 skipped) |
| **Overall** | **A+ (Excellent)** |

---

## Completion Criteria

| Criterion | Status |
|-----------|--------|
| All Story 3.12 test files identified (6 files) | PASS |
| All test files read and parsed | PASS |
| Searched for all skip/disabled patterns across 5 directories (22 files) | PASS |
| 0 skipped Story 3.12 tests found | PASS |
| All test file headers read for stale markers | PASS |
| 6 stale/incomplete transitional markers found | PASS |
| 6 markers fixed directly (1 RED→GREEN, 5 story-list/coverage updates) | PASS |
| 2 empty placeholder test stubs found (earlier stories, same directory) | PASS |
| 2 empty stubs removed directly (0 remaining) | PASS |
| Test execution verified (921 pass, 0 fail, 0 skip) | PASS |
| Validation report written | PASS |

---

## Summary

**Verdict: PASS** — Story 3.12 test files are clean. All 36 Story 3.12 test cases across 6 files are active and passing (verified via execution: 921 total tests across 67 suites, 0 failed, 0 skipped). No skipped tests to flag for un-skipping.

**Direct fixes applied during this validation:**

- **1 stale RED PHASE marker** in `session-events.service.spec.ts` (Story 3.12 in-scope file) claimed tests were skipped when they were active. Fixed to GREEN PHASE.
- **5 incomplete GREEN PHASE markers / story lists** in Story 3.12 test files didn't mention Story 3.12 despite 3.12 tests being active. All updated to include Story 3.12 in the story list and coverage documentation.
- **2 empty placeholder test stubs** from earlier stories in `sandbox-lifecycle.integration.spec.ts` (Story 3.1 — "destroys sandbox on conversation close", Story 3.3/3.4 — "terminates agent process via Daytona API when sandbox-agent crashes") were removed directly. Both had no assertions, only comment bodies. The Story 3.3/3.4 stub was previously flagged in the Story 3.10 and 3.11 validation reports but never removed; this validation removed it per the directive to not defer empty-stub removal.

The integration file now contains 14 real tests (down from 16), all with assertions, all passing.
