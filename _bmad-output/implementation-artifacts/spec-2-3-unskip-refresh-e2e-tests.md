---
title: 'Unskip Story 2.3 Manual Refresh E2E Tests'
type: 'bugfix'
created: '2026-07-04'
status: 'done'
route: 'one-shot'
---

# Unskip Story 2.3 Manual Refresh E2E Tests

## Intent

**Problem:** All 5 E2E tests in `project-map-refresh.spec.ts` used `test.skip()` markers that were never removed after Story 2.3 was implemented. The RefreshButton is wired to the page and functional, but the E2E journey had zero active coverage — this was the sole P0 gap blocking the quality gate (FAIL → PASS).

**Approach:** Remove the `test.skip()` markers, run the tests, and fix any issues found by adversarial review (TOCTOU race, missing disabled-state assertion, mid-flight teardown).

## Suggested Review Order

**Test activation and quality patches**

- Removed `test.skip()` → `test()` on all 5 tests; updated header comment from RED to GREEN phase
  [`project-map-refresh.spec.ts:40`](../../playwright/e2e/project-map/project-map-refresh.spec.ts#L40)

- Fixed TOCTOU race: assert disabled+spinning via `Promise.all` instead of two sequential assertions
  [`project-map-refresh.spec.ts:78`](../../playwright/e2e/project-map/project-map-refresh.spec.ts#L78)

- Added `toBeDisabled()` before `toBeEnabled()` so Test 5 actually verifies the disable/enable cycle
  [`project-map-refresh.spec.ts:172`](../../playwright/e2e/project-map/project-map-refresh.spec.ts#L172)

- Added `toBeEnabled()` after poll in Test 3 to prevent mid-flight teardown
  [`project-map-refresh.spec.ts:115`](../../playwright/e2e/project-map/project-map-refresh.spec.ts#L115)

- Extracted magic `500` ms delay to named constant `MOCK_SYNC_DELAY_MS`
  [`project-map-refresh.spec.ts:37`](../../playwright/e2e/project-map/project-map-refresh.spec.ts#L37)
