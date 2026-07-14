# Test Review Validation Report — Story 5.4

**Story:** 5.4 — Fix Token-Usage Drift and Token-Config Gaps
**Date:** 2026-07-12
**Agent:** Master Test Architect (TEA)
**Mode:** Validate (expanded scope: skipped-test removal, stale-marker cleanup, empty-stub removal)

---

## Executive Summary

| Metric | Result |
|--------|--------|
| Jest unit tests | **853 passed, 0 skipped, 0 failed** |
| Playwright E2E test listing | **20 tests in 3 files (0 skipped)** |
| Skipped tests removed | **8** (2 from Story 5.4, 6 from Story 5.1) |
| Empty placeholder stubs removed | **2** (1 from Story 5.4, 1 from Story 5.1) |
| Dead code blocks removed | **1** (`rscActionPayload` function + `BMAD_DOCS_URL` constant) |
| Stale transitional markers fixed | **3** (header comments, serial-mode comment, stale cross-reference) |
| Co-located unit test files reviewed | **10** (all clean — no stale markers) |
| Production code edits | **None** (test-only validation) |

**Verdict: PASS** — All skipped story-related tests in the `visual-containers/` directory have been evaluated and removed where the skip reason is no longer applicable. No stale transitional markers remain. No empty placeholder stubs remain.

---

## Skipped Test Removal Summary

### Removal Criteria Applied

A skipped test was removed directly (not just flagged) when any of the following conditions were met:

1. **Behavior covered by other tests** — the AC is verified by a co-located unit/component test
2. **Environmental dependency is permanent with no planned fix** — the fixture/environment issue has no tracked fix in `deferred-work.md` or any sprint planning artifact
3. **Test body is empty** — the test contains only a comment or empty body (transitional artifact that inflates count without verifying behavior)

### Story 5.4 E2E (`story-5-4-token-usage-drift.spec.ts`)

| # | Test | Skip Reason | Removal Criteria | Covering Test |
|---|------|-------------|-----------------|---------------|
| 1 | `test.describe.skip('AC-1: ArtifactCard hover border')` — 1 test with full body | withArtifacts fixture broken (unique constraint violations on POST /api/internal/test/artifacts) | Behavior covered by co-located unit test; environmental dependency with no planned fix | `ArtifactCard.test.tsx:147` — asserts `hover:border-accent` (not `hover:border-text-3`) |
| 2 | `test.skip('[P1] artifact list pane hides scrollbars in two-pane layout')` — **empty body** (only a comment) | Same withArtifacts fixture issue | Empty body (transitional artifact); behavior covered by co-located unit test | `artifacts/page.test.tsx:461` — asserts `no-scrollbar` class on artifact list pane |

**Before:** 8 tests total (6 active + 2 skipped)
**After:** 6 active tests (AC-2: 2, AC-3: 2, AC-6: 1, AC-7: 1)

### Story 5.1 E2E (`story-5-1-visual-containers.spec.ts`) — earlier story in same directory

| # | Test | Skip Reason | Removal Criteria | Covering Test |
|---|------|-------------|-----------------|---------------|
| 3 | `test.describe.skip('AC-3: Onboarding BMAD-not-found panel')` — 2 tests with full bodies | Server Action mocking via RSC wire format doesn't work in Next.js 16 — click times out | Behavior covered by co-located unit test; environmental dependency with no planned fix | `RepositoryUrlForm.test.tsx:350-413` — 4 tests covering styled panel, title/body split, non-BMAD error distinction, aria-describedby wiring |
| 4 | `test.describe.skip('AC-5: Artifact frontmatter metadata badge')` — 3 tests with full bodies | withArtifacts fixture broken / artifact content pane doesn't render in E2E environment | Behavior covered by co-located unit test; environmental dependency with no planned fix | `ArtifactViewer.test.tsx:135-195` — 6 tests covering badge rendering, field parsing, status pill, absence for no-frontmatter, document order |
| 5 | `test.skip('[P1] Stop button replaces Send button when agent is processing')` — **empty body** (only a comment) | EventSource not created in this environment (waitForEventSource times out) | Empty body (transitional artifact); behavior covered by co-located unit test | `ChatInput.test.tsx` — Stop button behavior verified at component level |

**Before:** 19 tests total (13 active + 6 skipped)
**After:** 13 active tests (AC-1: 5, AC-2: 2, AC-4: 4, AC-6: 2)

### Dead Code Removed

| Item | File | Reason |
|------|------|--------|
| `rscActionPayload()` function | `story-5-1-visual-containers.spec.ts` | Only used by removed AC-3 `test.describe.skip` block |
| `BMAD_DOCS_URL` constant | `story-5-1-visual-containers.spec.ts` | Only used by removed AC-3 `test.describe.skip` block |

---

## Stale Transitional Marker Cleanup

### Markers Fixed

| # | File | Location | Issue | Fix |
|---|------|----------|-------|-----|
| 1 | `story-5-4-token-usage-drift.spec.ts` | Header comment (lines 14-22) | "Skipped (pre-existing environment issues)" section described tests that were removed | Removed "Skipped" section; moved AC-1 and AC-7 P1 to "NOT covered here" section with updated rationale |
| 2 | `story-5-4-token-usage-drift.spec.ts` | Header comment (AC-5 line) | Referenced "Story 5.1 AC-5 skipped" — stale cross-reference now that AC-5 skip is removed | Updated to "Verified at the component level" |
| 3 | `story-5-1-visual-containers.spec.ts` | Header comment (lines 8-12) | "Covers" section listed AC-3 and AC-5 as covered by E2E tests — they are not | Updated "Covers" to list only AC-1/2/4/6; added "Not covered here" section explaining AC-3 and AC-5 are covered by co-located unit tests |
| 4 | `story-5-1-visual-containers.spec.ts` | Serial mode comment (line 40) | Referenced "AC-2/AC-3 tests" — AC-3 was removed | Updated to "AC-2 tests" |

### Co-Located Unit Test Files Reviewed (All Clean)

All 10 co-located unit test files for Story 5.4 were reviewed for stale transitional markers (comments claiming tests are skipped/disabled/red-phase when actually active). **No stale markers found.** All "GREEN PHASE" and "Tests are active" comments accurately reflect the current state.

| File | Status |
|------|--------|
| `ArtifactCard.test.tsx` | Clean — header accurately reflects Story 5.4 AC-1 coverage |
| `RepositoryUrlForm.test.tsx` | Clean — "GREEN PHASE" comment accurate |
| `WorkingTreeIndicator.test.tsx` | Clean — header accurately reflects Story 5.4 AC-4/AC-9 coverage |
| `ArtifactListEntry.test.tsx` | Clean — header accurately reflects Story 5.4 AC-5 coverage |
| `SideNavigation.test.tsx` | Clean — "GREEN PHASE" comment accurate |
| `artifacts/page.test.tsx` | Clean — header accurately reflects Story 5.4 AC-6/AC-7 coverage |
| `ArtifactViewer.test.tsx` | Clean — "GREEN PHASE" comment accurate |
| `ChatMessageList.test.tsx` | Clean — header accurately reflects Story 5.4 AC-7 coverage |
| `global-css.spec.ts` | Clean — "GREEN PHASE" comment accurate |
| `tailwind-theme.spec.ts` | Clean — header accurately reflects Story 5.4 AC-8/AC-10/AC-11 coverage |

---

## Verification Results

### Jest Unit/Component Tests

```
Test Suites: 65 passed, 65 total
Tests:       853 passed, 853 total
Snapshots:   0 total
Time:        11.474s
```

### Playwright E2E Test Listing

```
Total: 20 tests in 3 files
```

- `story-5-1-visual-containers.spec.ts`: 13 active tests (0 skipped)
- `story-5-4-token-usage-drift.spec.ts`: 6 active tests (0 skipped)
- `auth.setup.ts`: 1 setup test

### Skip Pattern Audit

Searched `playwright/e2e/visual-containers/` for `.skip()`, `.todo()`, `.fixme()`, `xit`, `xdescribe`, `describe.skip` — **0 matches**.

Searched `apps/web/src/**/*.test.tsx` and `apps/web/src/**/*.spec.ts` for skip patterns — **0 actual calls** (2 comment references stating "all test.skip() markers have been removed", both accurate).

### Stale Marker Audit

Searched `playwright/e2e/visual-containers/*.spec.ts` for "SKIPPED", "RED PHASE", "red-phase", "disabled", "skipped" — **1 match** (legitimate: "scrolling disabled" in a scrollbar behavior comment, not a transitional marker).

---

## Checklist Validation

### Prerequisites

- [x] Test file(s) identified for review (E2E in `visual-containers/`, 10 co-located unit test files)
- [x] Test files exist and are readable
- [x] Test framework detected (Playwright for E2E, Jest for unit/component)
- [x] Test framework configuration found (`playwright.config.ts`, `jest.config.ts`)

### Skipped Test Evaluation

- [x] All skipped tests in `visual-containers/` directory identified (8 total across 2 files)
- [x] Each skip reason evaluated against removal criteria
- [x] All 8 skipped tests removed (behavior covered by co-located unit tests; environmental dependencies with no planned fix; 2 had empty bodies)
- [x] Dead code from removed tests cleaned up (`rscActionPayload`, `BMAD_DOCS_URL`)

### Stale Transitional Marker Evaluation

- [x] All E2E test files in `visual-containers/` reviewed for stale comments/headers
- [x] 4 stale markers fixed (header comments, serial-mode comment, cross-reference)
- [x] All 10 co-located unit test files reviewed — no stale markers found
- [x] No stale "SKIPPED" / "RED PHASE" / "disabled" comments remain in active test files

### Empty Placeholder Stub Evaluation

- [x] Searched for active tests with no assertions (only a comment or empty body)
- [x] 2 empty placeholder stubs found and removed (Story 5.4 AC-7 P1, Story 5.1 AC-6 P1)

### Post-Removal Verification

- [x] Jest unit tests pass (853 passed, 0 skipped, 0 failed)
- [x] Playwright E2E test listing succeeds (20 tests, 0 skipped)
- [x] No unused imports or dead code remaining in edited files
- [x] Header comments accurately reflect current test coverage

---

## Files Modified

| File | Changes |
|------|---------|
| `playwright/e2e/visual-containers/story-5-4-token-usage-drift.spec.ts` | Removed AC-1 `describe.skip` block (1 test); removed AC-7 P1 `test.skip` empty stub; updated header comment (removed "Skipped" section, moved AC-1/AC-7 P1 to "NOT covered here", fixed stale "Story 5.1 AC-5 skipped" reference); 236 → 185 lines |
| `playwright/e2e/visual-containers/story-5-1-visual-containers.spec.ts` | Removed AC-3 `describe.skip` block (2 tests) + dead code (`rscActionPayload`, `BMAD_DOCS_URL`); removed AC-5 `describe.skip` block (3 tests); removed AC-6 P1 `test.skip` empty stub; updated header comment (moved AC-3/AC-5 to "Not covered here"); fixed serial-mode comment; 468 → 318 lines |

---

## Out-of-Scope Skipped Tests (Not Removed)

The following skipped tests were found during the search but are in **different directories** from Story 5.4's tests. Per the user's instruction ("including those from earlier stories in the same directories"), these are out of scope for this validation. They are listed here for visibility.

| File | Line | Context |
|------|------|---------|
| `playwright/e2e/onboarding/onboarding.spec.ts` | 232, 284 | Different directory |
| `playwright/e2e/auth/sign-in.spec.ts` | 139 | Different directory |
| `playwright/e2e/performance-spike/repo-size.spec.ts` | 245, 261, 343 | Different directory |
| `playwright/e2e/real-service/nfr-p5-manual-commit.spec.ts` | 60 | Different directory |
| `playwright/e2e/real-service/functional-smoke.spec.ts` | 57 | Different directory |
| `playwright/e2e/real-service/nfr-performance.spec.ts` | 72 | Different directory |
| `playwright/e2e/multi-conn/sse-back-pressure.spec.ts` | 195, 214 | Different directory |
| `playwright/e2e/multi-conn/concurrent-sse.spec.ts` | 161 | Different directory |

---

## Conclusion

All skipped story-related tests in the `playwright/e2e/visual-containers/` directory (the same directory as Story 5.4's E2E tests, including the earlier Story 5.1 tests) have been evaluated and removed. The removal criteria were met for every skipped test: behavior is covered by co-located unit tests, environmental dependencies (withArtifacts fixture, RSC wire format) have no planned fix, and 2 of the skipped tests had empty bodies. All stale transitional markers have been fixed. No empty placeholder stubs remain. The Jest test suite (853 tests) and Playwright test listing (20 tests) both pass cleanly with 0 skipped tests.
