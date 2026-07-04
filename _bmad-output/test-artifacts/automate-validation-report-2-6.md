# Automate Workflow Validation Report

**Story:** 2.6 — Navigate from the Project Map to an Artifact
**Date:** 2026-07-03
**Mode:** Validate → Create (coverage expansion)
**Validator:** Master Test Architect (TEA)
**Story Status:** review

---

## Prerequisites

| Check | Status | Notes |
|---|---|---|
| Framework scaffolding | PASS | Jest ~30.3.0 (co-located `*.test.tsx`); Playwright ^1.61.0 configured |
| Test directory structure | PASS | Co-located convention — tests next to source in `apps/web/src/components/project-map/` and `apps/web/src/app/(dashboard)/(app)/project-map/` |
| Package.json test dependencies | PASS | `jest`, `@testing-library/react`, `react-dom/server` all present |
| BMad artifacts (story) | PASS | `implementation-artifacts/2-6-navigate-from-the-project-map-to-an-artifact.md` loaded; 2 ACs, all tasks complete, status `review` |
| ATDD checklist | PASS | `atdd-checklist-2-6-navigate-from-the-project-map-to-an-artifact.md` loaded; 6 red-phase scaffolds generated, all activated during implementation |

---

## Implementation Audit

| Deliverable | Task | Status | Evidence |
|---|---|---|---|
| `ArtifactCard` → `<Link>` update | 1.1 | DONE | `apps/web/src/components/project-map/ArtifactCard.tsx` — root changed from `<div>` to `<Link>`, added `href` prop, `aria-label`, `hover:border-text-3 transition-colors`, focus ring classes via `cn()` |
| `ArtifactCard.test.tsx` update | 1.2 | DONE | 10 tests (8 P0, 2 P1) — 5 new Story 2.6 tests activated from `it.skip()` scaffolds, header updated to GREEN PHASE |
| Project Map page `href` passing | 2.1 | DONE | `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` — passes `href={`/artifacts?id=${a.id}`}` to each `<ArtifactCard>` |
| `page.test.tsx` update | 2.2 | DONE | 15 tests (9 P0, 6 P1) — 1 new Story 2.6 test activated from `it.skip()` scaffold, `ArtifactCard` mock accepts `href` |
| Lint, typecheck, tests | 3.1–3.3 | DONE | 0 errors, 7 warnings; typecheck clean; 470 tests pass |

---

## Test File Inventory

| File | Level | Environment | Tests | P0 | P1 | Status |
|---|---|---|---|---|---|---|
| `apps/web/src/components/project-map/ArtifactCard.test.tsx` | Component | Jest/jsdom | 10 | 8 | 2 | ALL PASS |
| `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` | Server Component | Jest/node | 15 | 9 | 6 | ALL PASS |
| **Total** | | | **25** | **17** | **8** | |

### Story 2.6-Specific Tests (6 new)

| File | Test | Priority | What it verifies |
|---|---|---|---|
| `ArtifactCard.test.tsx` | [P0] renders as a link (`<a>` tag) with the correct href | P0 | Card is a `<Link>`/`<a>` with `href="/artifacts?id=art_1"` (AC-1) |
| `ArtifactCard.test.tsx` | [P0] renders aria-label in the format "{TYPE}: {title} — {STATUS}" | P0 | Accessible name includes type, title, status (AC-1, UX-DR16) |
| `ArtifactCard.test.tsx` | [P0] has focus ring classes for keyboard navigation (UX-DR16) | P0 | `focus:ring-2`, `focus:ring-accent`, `focus:ring-offset-2`, `focus:ring-offset-surface` present |
| `ArtifactCard.test.tsx` | [P0] has hover border classes | P0 | `hover:border-text-3` present (matches mockup hover state) |
| `ArtifactCard.test.tsx` | [P0] preserves role="listitem" on the link element | P0 | `role="listitem"` retained after `<div>` → `<Link>` change |
| `page.test.tsx` | [P0] passes href={`/artifacts?id=${a.id}`} to each ArtifactCard | P0 | Both completed (art_1) and in-progress (art_2) artifacts receive correct href (AC-1, AC-2) |

---

## AC Traceability

| AC | Description | Test IDs | P0 Coverage | Status |
|---|---|---|---|---|
| AC-1 | Completed artifact click opens the Artifact Browser pre-selected (FR8) | AC-01..05, PAGE-15 | 6 P0 tests | PASS |
| AC-2 | In-progress artifact click opens the read-only Artifact Browser (FR8) | PAGE-15 (shared) | 1 P0 test (shared with AC-1) | PASS (expanded) |

### AC-1 Detail

| Test | Priority | What it verifies |
|---|---|---|
| [P0] renders as a link (`<a>` tag) with the correct href | P0 | Card root is `<a>` with `href="/artifacts?id=art_1"` — clicking navigates to Artifact Browser (AC-1) |
| [P0] renders aria-label in the format "{TYPE}: {title} — {STATUS}" | P0 | Accessible name `"PRD: bmad-easy PRD — Completed"` (AC-1, UX-DR16) |
| [P0] has focus ring classes for keyboard navigation (UX-DR16) | P0 | Focus ring classes present for keyboard accessibility (AC-1, UX-DR16) |
| [P0] has hover border classes | P0 | `hover:border-text-3` present — visual hover feedback (AC-1) |
| [P0] preserves role="listitem" on the link element | P0 | ARIA list structure preserved after `<Link>` change (AC-1, UX-DR16) |
| [P0] passes href={`/artifacts?id=${a.id}`} to each ArtifactCard | P0 | Page constructs correct `href` for completed artifact `art_1` (AC-1) |

### AC-2 Detail

| Test | Priority | What it verifies |
|---|---|---|
| [P0] passes href={`/artifacts?id=${a.id}`} to each ArtifactCard | P0 | Page constructs correct `href` for in-progress artifact `art_2` — same click behavior as completed (AC-2) |
| [P1] renders aria-label for in-progress artifact | P1 | Accessible name `"Architecture: System Architecture — In progress"` — status label mapping in aria-label context (AC-2, UX-DR16) — **NEW** |

---

## Gap Analysis → Actions Taken

### Gap 1 (P1 — Coverage Expansion): In-progress artifact `aria-label` untested (AC-2, UX-DR16)

- **What was missing:** The `aria-label` test only used `COMPLETED_ARTIFACT`, verifying `"PRD: bmad-easy PRD — Completed"`. No test verified the `aria-label` for an in-progress artifact. The `STATUS_LABELS` map produces "In progress" (with a space, not a hyphen) — a regression changing this label in the `aria-label` context would not be caught by the existing `aria-label` test (only by the badge text test, which queries a different DOM node).
- **Action taken:** Added `[P1] renders aria-label for in-progress artifact` to `ArtifactCard.test.tsx`. Renders `IN_PROGRESS_ARTIFACT` and asserts `aria-label` is `"Architecture: System Architecture — In progress"`, verifying the status label mapping and em-dash separator work for both statuses.
- **File:** `apps/web/src/components/project-map/ArtifactCard.test.tsx`

### Gap 2 (DP-4 — Test Hygiene): Stale "RED PHASE" header in `page.test.tsx`

- **What was missing:** The `page.test.tsx` header comment (lines 1-21) says "RED PHASE: the current page.tsx is a 14-line placeholder that does not call auth(), getPrisma(), getCredentialHealthStatus(), or syncArtifactsAction()." This is factually stale — the page has been fully implemented since Story 2.2. The `ArtifactCard.test.tsx` header was correctly updated to GREEN PHASE during Story 2.6, but `page.test.tsx` was not. The story spec said "no header change needed" but this was an oversight — the RED PHASE text is misleading for future maintainers.
- **Action taken:** Updated the header to "GREEN PHASE: implementation complete" with an accurate description of the current test scope (Story 2.2 base + Story 2.6 href passing).
- **File:** `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx`

### Accepted Gaps (No Action — Consistent with Codebase Patterns)

- **Actual navigation behavior (click → URL change → artifacts page loads):** Next.js client-side routing is framework behavior, not story-specific logic. The `href` value IS tested. An E2E test would exercise Next.js routing, not application code. Accepted gap — same as Story 2.5.
- **Destination page pre-selection behavior:** The artifacts page (Story 2.5) reads `searchParams.id` and pre-selects the artifact. This is unchanged by Story 2.6 and already tested in Story 2.5's `page.test.tsx`. Accepted gap — destination page unchanged.
- **Destination page read-only view:** AC-2 specifies "read-only Artifact Browser." The artifacts page renders read-only Markdown via `ArtifactViewer` (no editing controls). This is covered by Story 2.5's `[P0] renders no editing controls (read-only view)` test. Accepted gap — destination page unchanged.
- **`transition-colors` class:** The implementation includes `transition-colors` alongside `hover:border-text-3`. The test verifies `hover:border-text-3` but not `transition-colors`. This is a CSS transition polish class — a regression removing it would cause a slightly less smooth hover effect, not a functional failure. Accepted gap — visual polish, not AC requirement.
- **`focus:outline-none` class:** The implementation includes `focus:outline-none` as part of the focus ring pattern (removes default browser outline so the custom ring is the only focus indicator). The test checks the 4 focus ring classes but not `focus:outline-none`. Consistent with the `ArtifactListEntry` focus ring test from Story 2.5 (same 4 classes checked). Accepted gap — consistent with established pattern.
- **`role="listitem"` overrides implicit `link` role:** Documented deferred finding from Story 2.5. The test correctly uses `getByRole('listitem')` (not `getByRole('link')`). Practical impact is minimal — most screen readers announce `<a>` tags as links regardless. Accepted gap — same trade-off as Story 2.5.
- **Auth redirect paths untested:** The page's two `redirect()` paths (no session → `/sign-in`, no repo connection → `/onboarding`) are not tested. Consistent with the codebase pattern — defensive double-checks behind the `(app)` layout guard. Accepted gap.

---

## Files Modified

| Action | File | Detail |
|---|---|---|
| Updated test | `apps/web/src/components/project-map/ArtifactCard.test.tsx` | +1 new test (P1 in-progress aria-label) |
| Updated test | `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` | Fixed stale RED PHASE header → GREEN PHASE (DP-4 test hygiene) |

---

## Verification

- **Lint:** 0 errors, 7 warnings (all pre-existing baseline — 0 new warnings introduced)
- **Typecheck:** `tsc --noEmit` clean
- **Tests:** 471 tests across 37 suites — ALL PASSING (was 470 before coverage expansion; +1 new test)

---

## Validation Checklist Summary

| Check | Status |
|---|---|
| Execution mode determined (BMad-Integrated) | PASS |
| Framework configuration loaded and validated | PASS |
| Coverage analysis completed (gaps identified) | PASS |
| Automation targets identified | PASS |
| Test levels selected appropriately (Component + Server Component) | PASS |
| Duplicate coverage avoided | PASS |
| Test priorities assigned (P0, P1) | PASS |
| Test files generated at appropriate levels | PASS |
| Given-When-Then format used (arrange-act-assert pattern) | PASS |
| Priority tags added to all test names | PASS |
| Quality standards enforced (no hard waits, deterministic, isolated) | PASS |
| All ACs have P0 test coverage or documented as accepted gap | PASS |
| All tests passing | PASS |
| Lint clean (0 errors) | PASS |
| Typecheck clean | PASS |

---

## Verdict

**PASS — coverage sufficient after expansion.** Two gaps found and addressed:

1. **P1:** In-progress artifact `aria-label` was untested — added a P1 test verifying `"Architecture: System Architecture — In progress"` (status label mapping + em-dash separator in aria-label context for both statuses).
2. **DP-4:** `page.test.tsx` had a stale "RED PHASE" header claiming the page was a "14-line placeholder" — updated to GREEN PHASE with accurate scope description.

Both ACs now have direct P0 test coverage. 471 tests pass (was 470, +1), lint is clean (0 errors, 7 pre-existing warnings), typecheck is clean. Seven accepted gaps remain, all consistent with established codebase patterns (navigation behavior, destination page unchanged, CSS polish classes, `role="listitem"` trade-off, auth redirects).
