# Automate Workflow Validation Report

**Story:** 2.2 — View the Project Map
**Date:** 2026-07-03
**Mode:** Validate → Create (gap-filling)
**Validator:** Master Test Architect (TEA)
**Story Status:** review

---

## Prerequisites

| Check | Status | Notes |
|---|---|---|
| Framework scaffolding | PASS | Jest ~30.3.0 (co-located `*.test.tsx`); Playwright ^1.61.0 configured with auth setup + chromium projects |
| Test directory structure | PASS | Co-located convention — tests next to source in `apps/web/src/components/project-map/` and `apps/web/src/app/(dashboard)/(app)/project-map/` |
| Package.json test dependencies | PASS | `jest`, `@testing-library/react`, `@testing-library/user-event`, `playwright` all present |
| BMad artifacts (story) | PASS | `implementation-artifacts/2-2-view-the-project-map.md` loaded; 5 ACs, all tasks checked off, status `review` |
| ATDD checklist | PASS | `atdd-checklist-2-2-view-the-project-map.md` loaded; 4 test files planned, 26 scenarios mapped |

---

## Implementation Audit

| Deliverable | Task | Status | Evidence |
|---|---|---|---|
| shadcn `dialog` component | 1.1 | DONE | `apps/web/src/components/ui/dialog.tsx` — Radix Dialog with project design tokens |
| `ArtifactCard` component | 2.1–2.6 | DONE | `apps/web/src/components/project-map/ArtifactCard.tsx` — Server Component, 12 type-label mappings, two status badge variants, `role="listitem"`, no click handlers |
| `CredentialErrorBanner` component | 3.1–3.5 | DONE | `apps/web/src/components/project-map/CredentialErrorBanner.tsx` — Client Component, non-dismissible banner, controlled Dialog, `useTransition()` for pending state |
| `loading.tsx` skeleton | 4.1 | DONE | `apps/web/src/app/(dashboard)/(app)/project-map/loading.tsx` — 3 `animate-pulse` skeleton cards, page shell with h1 |
| Project Map page | 5.1–5.10 | DONE | `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` — async Server Component, auth guard, repo-connection read, artifact query, credential health check, page-load sync, conditional rendering |
| Lint, typecheck, tests | 6.1–6.3 | DONE | 0 lint errors, typecheck clean, 383 tests pass (pre-expansion baseline) |

---

## Test File Inventory

| File | Level | Environment | Tests | P0 | P1 | Status |
|---|---|---|---|---|---|---|
| `apps/web/src/components/project-map/ArtifactCard.test.tsx` | Component | Jest/jsdom | 5 | 3 | 2 | ALL PASS |
| `apps/web/src/components/project-map/CredentialErrorBanner.test.tsx` | Component | Jest/jsdom | 7 | 3 | 4 | ALL PASS |
| `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` | Server Component | Jest/node | 13 | 7 | 6 | ALL PASS |
| `apps/web/src/app/(dashboard)/(app)/project-map/loading.test.tsx` | Component | Jest/jsdom | 4 | 2 | 2 | ALL PASS (NEW) |
| `playwright/e2e/project-map/project-map.spec.ts` | E2E | Playwright | 3 | 2 | 1 | ALL SKIPPED |
| **Total (active)** | | | **29** | **15** | **14** | |
| **Total (skipped E2E)** | | | **3** | **2** | **1** | |

---

## AC Traceability

| AC | Description | Test IDs | P0 Coverage | Status |
|---|---|---|---|---|
| AC-1 | Artifact list with cards (FR6, UX-DR11) | CARD-01, CARD-02, CARD-05, PAGE-01a, PAGE-01b | 4 P0 tests | PASS |
| AC-2 | In-progress visual distinction (UX-DR11, UX-DR16) | CARD-02, CARD-05 | 2 P0 tests | PASS |
| AC-3 | Empty state (UX-DR19) | PAGE-02, PAGE-03 | 1 P0 test | PASS |
| AC-4 | Credential error banner (UX-DR10) | BANNER-01..06, PAGE-04, PAGE-05, PAGE-06 | 6 P0 tests | PASS |
| AC-5 | Loading skeleton and performance (NFR-P3) | LOADING-01, LOADING-02 | 2 P0 tests | PASS |

---

## Gap Analysis → Actions Taken

### Gap 1 (P0 — AC-4): Missing PAGE-04 test

- **What was missing:** The story's Task 5.10 and ATDD checklist both specify `[P0] renders CredentialErrorBanner when credential health is failed`. The actual `page.test.tsx` had a test verifying sync is skipped when credential is already failed, but NO test verified the banner text appears in the rendered HTML when `getCredentialHealthStatus` returns `failed`.
- **Why it matters:** AC-4 requires "a non-dismissible Credential Error Banner appears above the artifact list" when credential health is `failed`. Without this test, the "already failed" path (distinct from the "sync returns NO_CREDENTIAL" path) had no assertion proving the banner renders.
- **Action taken:** Added `[P0] renders CredentialErrorBanner when credential health is already failed` to `page.test.tsx` — sets `mockGetCredentialHealthStatus` to `FAILED` with non-empty artifacts, renders page, asserts HTML contains `'repository connection needs attention'`.
- **File:** `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx`

### Gap 2 (P0 — AC-5): Zero active coverage for loading skeleton

- **What was missing:** AC-5 ("skeleton cards are shown, and the page loads within 2 seconds") had ZERO active test coverage. The only planned test (E2E-03 for 2s load time) is skipped pending dev-server infrastructure. The ATDD checklist explicitly decided not to create a unit test for `loading.tsx`, relying solely on E2E.
- **Why it matters:** The loading skeleton is a user-visible AC requirement. With the E2E test skipped, there was no verification that skeleton cards render at all.
- **Action taken:** Created `loading.test.tsx` with 4 tests: `[P0]` renders h1 "Project Map" (route-change focus), `[P0]` renders 3 skeleton cards with `animate-pulse`, `[P1]` does not render credential banner (loading state), `[P1]` does not render refresh button (Story 2.3 scope).
- **File:** `apps/web/src/app/(dashboard)/(app)/project-map/loading.test.tsx` (NEW)

### Gap 3 (Known limitation — E2E tests skipped)

- **What:** All 3 E2E tests in `project-map.spec.ts` remain skipped with `test.skip()`.
- **Why:** The ATDD checklist documents these as needing external configuration: E2E-01 needs seeded artifacts in Postgres, E2E-02 needs empty Postgres, E2E-03 needs a running dev server + seeded data. No internal test API route for seeding artifacts exists yet (noted as future work in the ATDD checklist).
- **Impact:** E2E-01 and E2E-02 are supplementary — AC-1 and AC-3 have active unit/component test coverage. E2E-03 (2s load time, NFR-P3) is the only performance test, but the skeleton rendering aspect of AC-5 is now covered by the new `loading.test.tsx` unit tests.
- **Action:** No code change — E2E tests correctly remain skipped until infrastructure is available. Documented as a known limitation.

---

## Files Modified

| Action | File | Detail |
|---|---|---|
| Added test | `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` | `[P0] renders CredentialErrorBanner when credential health is already failed` — verifies banner text in HTML when `getCredentialHealthStatus` returns `failed` |
| Created | `apps/web/src/app/(dashboard)/(app)/project-map/loading.test.tsx` | 4 tests for AC-5 skeleton rendering: h1 presence, 3 animate-pulse cards, no banner, no refresh button |

---

## Verification

- **Lint:** 0 errors, 9 warnings (all pre-existing baseline — 0 new warnings introduced)
- **Typecheck:** `tsc --noEmit` clean
- **Tests:** 388 tests across 30 suites — ALL PASSING (was 383 before expansion; 5 new tests added)

---

## Validation Checklist Summary

| Check | Status |
|---|---|
| Execution mode determined (BMad-Integrated) | PASS |
| Framework configuration loaded and validated | PASS |
| Coverage analysis completed (gaps identified) | PASS |
| Automation targets identified | PASS |
| Test levels selected appropriately | PASS |
| Duplicate coverage avoided | PASS |
| Test priorities assigned (P0, P1) | PASS |
| Test files generated at appropriate levels | PASS |
| Given-When-Then format used | PASS |
| Priority tags added to all test names | PASS |
| Quality standards enforced (no hard waits, deterministic, isolated) | PASS |
| All ACs have at least one P0 test | PASS |
| All generated tests passing | PASS |
| Lint clean (0 errors) | PASS |
| Typecheck clean | PASS |

---

## Verdict

**PASS — coverage sufficient.** Two gaps found and fixed: the missing P0 test for CredentialErrorBanner rendering when credential health is already failed (AC-4), and zero active coverage for the loading skeleton (AC-5). Both gaps addressed with new tests. All 5 ACs now have active P0 test coverage. 388 tests pass, lint is clean, typecheck is clean. The 3 skipped E2E tests remain a known limitation pending dev-server infrastructure and an artifact-seeding test API route.
