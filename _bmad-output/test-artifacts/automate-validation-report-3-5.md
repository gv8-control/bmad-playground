# Automate Validation Report — Story 3.5

**Date:** 2026-07-04
**Story:** 3.5 — Resume an Existing Conversation
**Mode:** Validate (coverage sufficient — no Create/Resume expansion needed)
**Decision Policy:** `_bmad-output/decision-policy.md` (v1)

---

## Summary

| Metric | Value |
|--------|-------|
| Skipped tests in Story 3.5 scope | 0 |
| Failing tests | 0 |
| Total tests (agent-be) | 87 passed, 0 skipped |
| Total tests (web) | 593 passed, 0 skipped |
| ATDD test cases planned | 29 |
| ATDD test cases present | 29 |
| ATDD test cases passing | 29 |
| Lint errors (Story 3.5 files) | 0 |
| Typecheck | clean |

**Result: PASS — zero skipped tests in Story 3.5 scope, all tests pass, all 3 ACs covered.**

---

## Skipped Test Inventory (Story 3.5 Scope)

**None.** All 29 ATDD test cases are un-skipped and active. The dev agent un-skipped every TDD red-phase test during implementation (Tasks 1.2, 3.4, 4.6, 4.7, plus the pre-existing ArtifactCard onClick test).

---

## Test Coverage by Acceptance Criterion

### AC-1: Full chat history restored immediately from Postgres (FR13, NFR-R2)

| # | Test | Priority | File | Status |
|---|------|----------|------|--------|
| 1.1 | initial messages are rendered during "reconnecting" state (history visible before SSE ready) | P0 | `ConversationPane.test.tsx:1101` | PASS |

**Coverage: PASS** — AC-1 is satisfied by Story 3.2's `[conversationId]/page.tsx` (Postgres read in Server Component). The resume flow (AC-2) does not break history display — verified by test 1.1.

### AC-2: "Reconnecting…" state with git identity re-injection on sandbox re-init

**Backend — `ConversationsService.resumeConversation`:**

| # | Test | Priority | File | Status |
|---|------|----------|------|--------|
| 2.1 | returns "ready" status and does NOT call provision when sandbox is already alive (fast path) | P0 | `conversations.service.spec.ts:450` | PASS |
| 2.2 | re-injects git config on fast-path resume (AC-2 git identity re-injection) | P0 | `conversations.service.spec.ts:460` | PASS |
| 2.3 | emits WORKING_TREE_* and SESSION_READY on fast-path resume | P0 | `conversations.service.spec.ts:472` | PASS |
| 2.4 | returns "provisioning" and calls provisionSandbox when sandbox is not alive (slow path) | P0 | `conversations.service.spec.ts:491` | PASS |
| 2.5 | returns "failed" for conversation not owned by user (tenant isolation) | P0 | `conversations.service.spec.ts:497` | PASS |
| 2.6 | does not start duplicate idle timer when one is already running | P1 | `conversations.service.spec.ts:509` | PASS |
| 2.7 | resolveGitIdentity resolves git identity with noreply email fallback | P1 | `conversations.service.spec.ts:518` | PASS |

**Frontend — `ConversationPane` reconnecting state:**

| # | Test | Priority | File | Status |
|---|------|----------|------|--------|
| 2.8 | sets state to "reconnecting" (not "provisioning") when initialConversationId is provided | P0 | `ConversationPane.test.tsx:913` | PASS |
| 2.9 | calls POST /conversations/:id/resume when initialConversationId is provided | P0 | `ConversationPane.test.tsx:930` | PASS |
| 2.10 | does NOT call POST /conversations (create) when initialConversationId is provided | P0 | `ConversationPane.test.tsx:951` | PASS |
| 2.11 | shows "Reconnecting…" label when state is "reconnecting" | P0 | `ConversationPane.test.tsx:973` | PASS |
| 2.12 | input is disabled when state is "reconnecting" | P0 | `ConversationPane.test.tsx:987` | PASS |
| 2.13 | transitions to "ready" on SESSION_READY from "reconnecting" state | P0 | `ConversationPane.test.tsx:1006` | PASS |
| 2.14 | transitions to "timeout" when SESSION_READY doesn't arrive within CLIENT_TIMEOUT_MS during "reconnecting" state | P0 | `ConversationPane.test.tsx:1031` | PASS |
| 2.15 | handleRetry reuses existing conversationIdRef instead of resetting to null | P0 | `ConversationPane.test.tsx:1056` | PASS |
| 2.16 | shows "Starting session…" (not "Reconnecting…") for new conversations | P1 | `ConversationPane.test.tsx:1124` | PASS |

**Coverage: PASS** — 16 tests cover the full resume lifecycle (backend fast/slow path + frontend reconnecting state + timeout + retry fix).

### AC-3: Focus existing Conversation tab from Project Map (FR8)

**`useConversationPresence` / `useOpenConversations` hooks:**

| # | Test | Priority | File | Status |
|---|------|----------|------|--------|
| 3.1 | broadcasts conversation-opened on mount | P0 | `use-conversation-presence.test.ts:84` | PASS |
| 3.2 | broadcasts conversation-closed on unmount | P0 | `use-conversation-presence.test.ts:100` | PASS |
| 3.3 | calls window.focus() on focus-conversation message | P0 | `use-conversation-presence.test.ts:117` | PASS |
| 3.4 | useOpenConversations returns open conversation IDs | P0 | `use-conversation-presence.test.ts:154` | PASS |
| 3.5 | deduplicates conversation-opened messages | P1 | `use-conversation-presence.test.ts:178` | PASS |
| 3.6 | is a no-op when conversationId is null | P1 | `use-conversation-presence.test.ts:133` | PASS |
| 3.7 | is a no-op when BroadcastChannel is unavailable | P1 | `use-conversation-presence.test.ts:139` | PASS |

**`InProgressArtifactCard` component:**

| # | Test | Priority | File | Status |
|---|------|----------|------|--------|
| 3.8 | calls preventDefault and broadcasts focus-conversation when openConversations is non-empty | P0 | `InProgressArtifactCard.test.tsx:78` | PASS |
| 3.9 | does NOT preventDefault when openConversations is empty (lets navigation proceed) | P0 | `InProgressArtifactCard.test.tsx:104` | PASS |
| 3.10 | renders ArtifactCard with correct props | P0 | `InProgressArtifactCard.test.tsx:127` | PASS |
| 3.11 | focuses the most recent conversation (openConversations[0]) | P1 | `InProgressArtifactCard.test.tsx:144` | PASS |

**`ArtifactCard` onClick prop (backward compatibility):**

| # | Test | Priority | File | Status |
|---|------|----------|------|--------|
| 3.12 | accepts optional onClick prop and calls it on click (backward compatible) | P0 | `ArtifactCard.test.tsx:161` | PASS |

**Coverage: PASS** — 12 tests cover the full cross-tab focus flow (BroadcastChannel presence + in-progress artifact click + backward-compatible onClick prop).

---

## Test Priority Breakdown

| Priority | Count | Pass Rate |
|----------|-------|-----------|
| P0 | 22 | 100% (22/22) |
| P1 | 7 | 100% (7/7) |
| **Total** | **29** | **100%** |

---

## Out-of-Scope Skipped Tests (Deferred per DP-5)

The following 3 skipped E2E tests were identified during validation. They belong to Stories 1.2 and 1.3, NOT Story 3.5. Per DP-5 (scope temptation — defer work beyond the story's acceptance criteria), they are recorded as deferred findings, not fixed as part of Story 3.5.

| # | File | Line | Test | Story | Skip Reason |
|---|------|------|------|-------|-------------|
| 1 | `playwright/e2e/onboarding/onboarding.spec.ts` | 215 | org OAuth App restriction error explicitly names the org cause (AC-4) | 1.3 | Requires a real GitHub org with OAuth App access restrictions — cannot be simulated |
| 2 | `playwright/e2e/onboarding/onboarding.spec.ts` | 265 | encrypted token is never visible in the browser — response body check (AC-3) | 1.3 | Requires real GitHub credentials and a writable test repo — cannot be simulated with route mocking |
| 3 | `playwright/e2e/auth/sign-in.spec.ts` | 124 | clicking "Sign in with GitHub" navigates toward GitHub OAuth | 1.2 | Conditional skip: `test.skip(!process.env.AUTH_GITHUB_ID, ...)` — runs when AUTH_GITHUB_ID env var is set |

**Decision (DP-5):** These skipped tests are out of Story 3.5's acceptance criteria (Stories 1.2/1.3 scope). Un-skipping them would require either real GitHub org configuration (#1), real GitHub credentials (#2), or environment variable setup (#3) — none of which are Story 3.5 concerns. Deferred to their respective story owners. Recorded in the story file under Deferred Findings.

---

## Coverage Expansion Assessment

No coverage expansion needed. Rationale:

1. **All 29 ATDD test cases exist and pass** — the ATDD checklist planned 29 test cases; all 29 are present, un-skipped, and passing.
2. **All 3 ACs are covered** — AC-1 (1 test), AC-2 (16 tests), AC-3 (12 tests).
3. **No duplicate coverage gaps** — the `POST /conversations/:id/resume` controller endpoint is covered indirectly via the service spec (thin pass-through, consistent with existing pattern — no separate controller spec). `ProjectMapArtifacts` Client Component is covered via its child components (`useOpenConversations` hooks + `InProgressArtifactCard`) — a separate test would duplicate coverage per the checklist's duplicate-coverage-avoidance principle.
4. **No E2E tests planned for Story 3.5** — the ATDD checklist explicitly states "Execution Mode: SEQUENTIAL (Jest unit/component tests only — no Playwright/E2E in scope)."

---

## Checklist Validation

| Check | Status |
|-------|--------|
| Zero skipped tests in Story 3.5 scope (it.skip, test.skip, describe.skip, test.fixme, it.todo) | PASS |
| All acceptance criteria covered by tests | PASS (AC-1, AC-2, AC-3) |
| All tests pass (agent-be: 87, web: 593) | PASS |
| ATDD test case count matches plan (29 planned, 29 present) | PASS |
| Priority tags present on all tests ([P0]/[P1]) | PASS |
| Given-When-Then format | PASS (via descriptive test names + setup/teardown structure) |
| Tests are co-located with source | PASS |
| Decision policy applied for out-of-scope skips | PASS (DP-5) |
| Decisions recorded in story file | PASS |

---

## Conclusion

Story 3.5 is sufficiently covered. All 29 ATDD test cases are un-skipped, active, and passing. Zero skipped tests exist within Story 3.5's scope. The 3 out-of-scope E2E skips (Stories 1.2/1.3) are recorded as deferred findings per DP-5. No coverage expansion is needed — the test suite fully covers all 3 acceptance criteria at the unit/component level, consistent with the ATDD plan.
