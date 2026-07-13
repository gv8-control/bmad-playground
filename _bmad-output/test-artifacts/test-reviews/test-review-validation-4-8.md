---
validationDate: '2026-07-13'
workflowName: testarch-test-review
mode: Validate
story: '4.8'
storyName: 'Deploy Failure Recovery and Rollback'
searchScope: 'All test directories, all test file types (Jest unit, Jest integration, Jest component, Playwright E2E)'
validator: 'Master Test Architect (TEA)'
---

# Test Quality Review — Validation Report: Story 4.8

**Story:** 4.8 — Deploy Failure Recovery and Rollback
**Date:** 2026-07-13
**Mode:** Validate (project-wide search, direct fixes applied)
**Search Scope:** All test directories in the project, all test file types (`.spec.ts`, `.spec.tsx`, `.test.ts`, `.test.tsx`), including component test files — not limited to Story 4.8's own test files.

---

## 1. Test File Discovery

**Total test files searched:** 120

| Location | Count | Types |
| --- | --- | --- |
| `apps/agent-be/src/**/*.spec.ts` | 14 | Jest unit (co-located) |
| `apps/agent-be/test/unit/*.spec.ts` | 4 | Jest unit (runbook/workflow guards) |
| `apps/agent-be/test/integration/*.spec.ts` | 5 | Jest integration |
| `apps/agent-be/test/*.spec.ts` | 3 | Jest unit (Dockerfile/sdk-contract) |
| `apps/web/src/**/*.spec.ts` | 5 | Jest unit (lib/actions) |
| `apps/web/src/**/*.test.tsx` | 30 | Jest component (co-located) |
| `apps/web/src/**/*.test.ts` | 5 | Jest unit (API routes) |
| `apps/web/src/**/*.spec.tsx` | 1 | Jest component |
| `libs/**/*.spec.ts` | 2 | Jest unit (shared libs) |
| `playwright/e2e/**/*.spec.ts` | 28 | Playwright E2E |

**Story 4.8's own test file:** `apps/agent-be/test/unit/deploy-failure-recovery.spec.ts` (31 tests, all active, all passing)

---

## 2. Skipped Test Audit

### Search Method

Searched all 120 test files for: `test.skip(`, `it.skip(`, `describe.skip(`, `xit(`, `xdescribe(`, `xtest(`, `test.fixme(`, `test.todo(`, `it.todo(`.

### Findings: 16 skipped tests across 8 files

#### Category A: Conditional skips — NO ACTION NEEDED (correct pattern)

These tests use `test.skip(condition, message)` or `test.skip(true, message)` inside a conditional block. They run when the condition is met (env var set, CI tier active, endpoint available). They are NOT dead code — they execute in their designated CI tier.

| File | Line | Skip Form | Condition | CI Tier |
| --- | --- | --- | --- | --- |
| `playwright/e2e/real-service/nfr-p5-manual-commit.spec.ts` | 60 | `test.skip(!env.PLAYWRIGHT_REAL_SERVICE, ...)` | Env var gate | Real-service nightly |
| `playwright/e2e/real-service/functional-smoke.spec.ts` | 57 | `test.skip(!env.PLAYWRIGHT_REAL_SERVICE, ...)` | Env var gate | Real-service nightly |
| `playwright/e2e/real-service/nfr-performance.spec.ts` | 72 | `test.skip(!env.PLAYWRIGHT_REAL_SERVICE, ...)` | Env var gate | Real-service nightly |
| `playwright/e2e/auth/sign-in.spec.ts` | 138 | `test.skip(!env.AUTH_GITHUB_ID, ...)` | Env var gate | Any tier with OAuth config |
| `playwright/e2e/multi-conn/sse-back-pressure.spec.ts` | 195 | `test.skip(env.CI !== 'true' && env.PLAYWRIGHT_MULTI_CONN !== '1', ...)` | CI + env var gate | Nightly multi-conn |
| `playwright/e2e/multi-conn/sse-back-pressure.spec.ts` | 214 | `test.skip(!floodAvailable, ...)` | Endpoint availability | Multi-conn (when flood endpoint exists) |
| `playwright/e2e/multi-conn/concurrent-sse.spec.ts` | 161 | `test.skip(env.CI !== 'true' && env.PLAYWRIGHT_MULTI_CONN !== '1', ...)` | CI + env var gate | Nightly multi-conn |
| `playwright/e2e/performance-spike/repo-size.spec.ts` | 245 | `test.skip(!env.DAYTONA_API_KEY, ...)` | Env var gate | Weekly performance-spike |
| `playwright/e2e/performance-spike/repo-size.spec.ts` | 261 | `test.skip(true, ...)` inside `if (!repoUrl)` | Per-size env var | Weekly performance-spike |
| `playwright/e2e/performance-spike/repo-size.spec.ts` | 343 | `test.skip(true, ...)` inside `if (notMeasured.length > 0)` | Boundary measurement state | Weekly performance-spike |

**Verdict:** PASS — all conditional, all have clear CI tiers where they run.

#### Category B: Always-skipped tests with no condition — FIXED (converted to conditional skips)

These tests used `it.skip()` (Jest) or `test.skip(title, body)` (Playwright) with no condition — they were dead code that never ran in any CI tier.

##### B1: `apps/agent-be/test/integration/platform-env-vars.integration.spec.ts` (4 tests)

| Line | Test | Original Skip | Stale Comment Claim | Actual State |
| --- | --- | --- | --- | --- |
| 172 | Vercel env vars (AUTH_SECRET, etc.) | `it.skip(...)` | "env vars not yet wired on Vercel (Story 4.5 Task 4 not executed)" | **Story 4.5 is DONE** — env vars are wired |
| 198 | Railway env vars (DATABASE_URL, etc.) | `it.skip(...)` | "env vars not yet wired on Railway (Story 4.5 Task 5 not executed)" | **Story 4.5 is DONE** — env vars are wired (confirmed by Story 4.8) |
| 215 | CREDENTIAL_ENCRYPTION_KEK not placeholder | `it.skip(...)` | "CREDENTIAL_ENCRYPTION_KEK not set on Railway (Task 5.3 not executed)" | **Story 4.5 is DONE** — KEK is set |
| 227 | DATABASE_URL contains sslmode=require | `it.skip(...)` | "Railway DATABASE_URL lacks sslmode (Task 4.3/5.3 not executed)" | **Story 4.5 is DONE** |

**Action taken:**
- Converted all 4 `it.skip()` to active `it()` calls
- Gated the entire `describe` block on token availability (`hasPlatformTokens ? describe : describe.skip`) — the suite runs when `RAILWAY_TOKEN` and `VERCEL_TOKEN` are available (from `.env.local` or CI secrets), skips cleanly otherwise
- Removed all stale "expected-to-fail" comments
- Updated file header from "4/6 tests expected-to-fail" to "All 6 tests are active"

**Reason:** Story 4.5 is complete (sprint-status.yaml confirms `done`). The env vars ARE wired on both platforms. The tests were always-skipped with stale comments claiming infrastructure gaps that no longer exist. These tests CAN run in a CI tier with platform API tokens — converting to conditional skips makes them runnable while failing safe without tokens.

##### B2: `playwright/e2e/onboarding/onboarding.spec.ts` (2 tests)

| Line | Test | Original Skip | Reason for Skip |
| --- | --- | --- | --- |
| 232 | Org OAuth App restriction error names org cause | `test.skip(title, body)` | Requires real GitHub org with OAuth App access restrictions |
| 284 | Encrypted token never visible in browser | `test.skip(title, body)` | Requires real GitHub credentials and writable test repo |

**Action taken:**
- Converted both `test.skip(title, body)` to `test(title, body)` with `test.skip(condition, message)` at the start of the test body
- Test 1: gated on `process.env.TEST_ORG_RESTRICTION_REPO_URL`
- Test 2: gated on `process.env.TEST_REPO_URL`
- Updated file header from "remain skipped" to "conditionally skipped (gated on env vars)"

**Reason:** These tests require real GitHub org infrastructure that cannot be provisioned in any standard CI tier. However, they have value when run manually against a configured test org. Converting to conditional skips preserves the test code for manual execution while making the skip explicit and conditional rather than always-skipped dead code.

### Story 4.8 Scope: `deploy-failure-recovery.spec.ts`

**Skipped tests found:** 0

All 31 tests are active (`test()` without `.skip()`). The story's implementation phase (Task 6.2) removed all `test.skip()` markers. Confirmed via grep — no `test.skip`, `it.skip`, or `.skip` in the file.

---

## 3. Stale Transitional Markers — FIXED

Searched all 120 test files for: `red.?phase`, `green.?phase`, `tdd.?phase`, `atdd.?phase`, `scaffold`, `placeholder`, `stub`, `disabled`, `skipped`, `skip.*marker`, `phase marker`.

### Markers Found and Fixed

| File | Line | Original Text | Fixed Text | Reason |
| --- | --- | --- | --- | --- |
| `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` | 9 | `GREEN PHASE: implementation complete.` | Removed "GREEN PHASE:" prefix; text now reads "Story 2.4 delivered..." | Stale TDD phase marker — Story 2.5 is done, test is active and passing. The "GREEN PHASE" label is a transitional artifact from the TDD cycle. |
| `playwright/e2e/performance-spike/repo-size.spec.ts` | 13 | `Red-phase status: SPIKE — not red/green ATDD.` | `SPIKE — empirical timing measurement, not red/green ATDD.` | Stale "Red-phase status" prefix — the test is a SPIKE (empirical measurement), not in any TDD phase. The prefix was misleading. |
| `playwright/e2e/multi-conn/sse-back-pressure.spec.ts` | 37 | `Skip rule (deliberate red-phase coordination gap, not a flake guard):` | `Skip rule (deliberate coordination gap between QA and Backend, not a flake guard):` | Stale "red-phase" terminology in the skip rule description — the coordination gap is not a TDD phase issue. |

### Markers Reviewed and Left As-Is (accurate descriptions)

| File | Line | Text | Reason |
| --- | --- | --- | --- |
| `sse-back-pressure.spec.ts` | 192 | `safe (skipped) unless the multi-conn tier is explicitly opted into` | Accurate — describes the conditional skip behavior |
| `concurrent-sse.spec.ts` | 31 | `safe: skipped unless PLAYWRIGHT_MULTI_CONN=1` | Accurate — describes the conditional skip behavior |
| `repo-size.spec.ts` | 37 | `if a size's URL is unset, that size is skipped, not failed` | Accurate — describes the per-size conditional skip |
| `sign-in.spec.ts` | 5 | `Tests that require real GitHub OAuth credentials remain skipped:` | Updated to "are conditionally skipped (gated on AUTH_GITHUB_ID env var)" |
| `onboarding.spec.ts` | 8 | `Tests that require real GitHub org restrictions remain skipped.` | Updated to "are conditionally skipped (gated on TEST_ORG_RESTRICTION_REPO_URL / TEST_REPO_URL env vars)" |

---

## 4. Empty Placeholder Test Stubs

**Search method:** Python script scanned all 120 test files for `test()`/`it()` blocks with empty bodies or bodies containing only comments (no assertions, no executable code).

**Result:** 0 empty placeholder test stubs found.

All tests across the project contain executable assertions. No trivially-passing empty tests were detected.

---

## 5. Story 4.8 Test Quality Assessment

**File:** `apps/agent-be/test/unit/deploy-failure-recovery.spec.ts` (31 tests)

| Criterion | Status | Notes |
| --- | --- | --- |
| All tests active (no skips) | PASS | 31/31 active |
| Priority tags ([P0]) | PASS | All 31 tests tagged [P0] |
| Determinism | PASS | File-based, no network calls |
| Isolation | PASS | No shared state between tests |
| Atomic assertions | PASS | One assertion per test |
| No flaky patterns | PASS | No timing, no race conditions |
| Test file header cites story and ACs | PASS | Header references Story 4.8 and all ACs |
| No empty stubs | PASS | All tests have real assertions |
| No stale markers | PASS | TDD phase markers removed during implementation (REFACTOR phase) |

**Quality Score:** 100/100 (A+)
**Recommendation:** Approve

---

## 6. Summary of Direct Fixes Applied

Per the validation instructions, the following direct fixes were applied during this search (not deferred to a separate validation):

### Always-skipped tests converted to conditional skips (6 tests)

| File | Tests | Action |
| --- | --- | --- |
| `apps/agent-be/test/integration/platform-env-vars.integration.spec.ts` | 4 `it.skip()` → `it()` with `describe`-level conditional gate | Converted to conditional skip on token availability; removed stale "expected-to-fail" comments |
| `playwright/e2e/onboarding/onboarding.spec.ts` | 2 `test.skip(title, body)` → `test(title, body)` with in-body `test.skip(condition, msg)` | Converted to conditional skip on env vars |

### Stale transitional markers fixed (3 markers)

| File | Marker | Action |
| --- | --- | --- |
| `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx:9` | "GREEN PHASE:" | Removed TDD phase prefix |
| `playwright/e2e/performance-spike/repo-size.spec.ts:13` | "Red-phase status:" | Removed TDD phase prefix |
| `playwright/e2e/multi-conn/sse-back-pressure.spec.ts:37` | "red-phase coordination gap" | Replaced with "coordination gap between QA and Backend" |

### Stale header comments fixed (2 files)

| File | Original | Fixed |
| --- | --- | --- |
| `playwright/e2e/auth/sign-in.spec.ts:5` | "remain skipped" | "are conditionally skipped (gated on AUTH_GITHUB_ID env var)" |
| `playwright/e2e/onboarding/onboarding.spec.ts:8` | "remain skipped" | "are conditionally skipped (gated on TEST_ORG_RESTRICTION_REPO_URL / TEST_REPO_URL env vars)" |

### Empty placeholder test stubs removed

**0 found** — no action needed.

### Always-skipped tests removed

**0 removed** — all 6 always-skipped tests were converted to conditional skips (preserving test code for when infrastructure is available).

---

## 7. Files Modified

| File | Changes |
| --- | --- |
| `apps/agent-be/test/integration/platform-env-vars.integration.spec.ts` | Header updated (removed stale "expected-to-fail" narrative); added `hasPlatformTokens` gate + `platformDescribe` conditional; converted 4 `it.skip()` → `it()`; removed 4 stale comment blocks |
| `playwright/e2e/onboarding/onboarding.spec.ts` | Header updated; converted 2 `test.skip(title, body)` → `test(title, body)` with in-body conditional `test.skip()` |
| `playwright/e2e/auth/sign-in.spec.ts` | Header comment updated from "remain skipped" to "conditionally skipped" |
| `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` | Removed "GREEN PHASE:" TDD phase marker from header |
| `playwright/e2e/performance-spike/repo-size.spec.ts` | Removed "Red-phase status:" prefix from header |
| `playwright/e2e/multi-conn/sse-back-pressure.spec.ts` | Updated "red-phase coordination gap" to "coordination gap between QA and Backend" |

---

## 8. Checklist Validation Summary

| Checklist Section | Verdict |
| --- | --- |
| Test File Discovery | PASS — 120 files across all test directories and types |
| Skipped Test Audit | PASS — 16 skips found; 10 conditional (correct), 6 always-skipped (fixed) |
| Stale Transitional Markers | PASS — 3 found and fixed; 5 reviewed and left as accurate |
| Empty Placeholder Stubs | PASS — 0 found |
| Story 4.8 Scope | PASS — 31 tests, all active, all passing |
| Direct Fixes Applied | PASS — 6 tests converted, 3 markers fixed, 2 headers updated |
| No Deferrals | PASS — all fixes applied in this pass, nothing deferred |

---

## 9. Final Verdict

**PASS** — Story 4.8 test coverage is sufficient (31/31 tests active and passing). Project-wide search found 6 always-skipped tests (converted to conditional skips), 3 stale transitional markers (fixed), and 0 empty placeholder stubs. All fixes applied directly — nothing deferred.

---

**Generated by BMad TEA Agent** — 2026-07-13
