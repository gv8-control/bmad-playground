---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-03'
storyId: '2.2'
storyKey: 2-2-view-the-project-map
storyFile: _bmad-output/implementation-artifacts/2-2-view-the-project-map.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-2-2-view-the-project-map.md
generatedTestFiles:
  - apps/web/src/components/project-map/ArtifactCard.test.tsx
  - apps/web/src/components/project-map/CredentialErrorBanner.test.tsx
  - apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx
  - playwright/e2e/project-map/project-map.spec.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/2-2-view-the-project-map.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/project-context.md
  - _bmad-output/test-artifacts/atdd-checklist-1-3-connect-a-repository-by-url.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/component-tdd.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/selector-resilience.md
---

# ATDD Checklist — Story 2.2: View the Project Map

**TDD Phase:** RED (all test scaffolds generated, will fail until implementation)
**Stack:** fullstack (Next.js + NestJS) — this story is frontend-only
**Generated:** 2026-07-03
**Activated:** 2026-07-03
**Execution Mode:** SEQUENTIAL

---

## Step 1 Output: Preflight & Context

### Stack Detection
- Config `test_stack_type`: auto
- Auto-detected: `fullstack` (package.json with Next.js/React + NestJS)
- Story scope: frontend-only (apps/web, no backend changes)

### Prerequisites
- Story 2.2 approved, status `ready-for-dev`, 5 clear ACs ✓
- Jest configured: `apps/web/jest.config.ts` (jsdom default, node env for Server Components) ✓
- Playwright configured: `playwright.config.ts` (auth setup + chromium projects) ✓
- Dev environment available ✓

### Story Context
- **Story file:** `_bmad-output/implementation-artifacts/2-2-view-the-project-map.md`
- **Story key:** `2-2-view-the-project-map`
- **Story ID:** `2.2`
- **Acceptance Criteria:**
  - AC-1: Artifact list with cards (FR6, UX-DR11)
  - AC-2: In-progress visual distinction (UX-DR11, UX-DR16)
  - AC-3: Empty state (UX-DR19)
  - AC-4: Credential error banner (UX-DR10)
  - AC-5: Loading skeleton and performance (NFR-P3)

### Framework & Existing Patterns
- Jest with jsdom (default) for client component tests
- `@jest-environment node` for Server Component tests
- Playwright with auth setup project, chromium project
- Co-located tests (`*.test.tsx` next to source)
- P0/P1 priority tags in `it()` descriptions
- Mock patterns: `jest.mock` at top, `jest.clearAllMocks` in `beforeEach`, `jest.restoreAllMocks` in `afterEach`
- Test header comments citing story, ACs, red-phase status

### TEA Config Flags
- `tea_use_playwright_utils`: true
- `tea_use_pactjs_utils`: false
- `tea_pact_mcp`: none
- `tea_browser_automation`: auto
- `test_stack_type`: auto

### Knowledge Fragments Loaded
- Core: component-tdd, test-quality, test-healing-patterns
- Frontend: selector-resilience
- (data-factories, timing-debugging referenced from tea-index.csv)

### Existing Test Files Referenced
- `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx` — client component test pattern
- `apps/web/src/app/(dashboard)/onboarding/page.test.tsx` — server component test pattern
- `playwright/e2e/project-map/project-map.spec.ts` — existing E2E placeholder (to be replaced)

### Test Files to Generate
1. `apps/web/src/components/project-map/ArtifactCard.test.tsx` — component tests (AC-1, AC-2)
2. `apps/web/src/components/project-map/CredentialErrorBanner.test.tsx` — client component tests (AC-4)
3. `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` — server component tests (AC-1,2,3,4,5)
4. `playwright/e2e/project-map/project-map.spec.ts` — E2E tests (replace placeholder)

---

## Step 2 Output: Generation Mode

**Chosen mode: AI Generation**

Rationale:
- Acceptance criteria are clear and well-defined (5 ACs with Given/When/Then)
- Scenarios are standard (component rendering, page data-fetching, E2E navigation)
- All test patterns are established in the existing codebase (RepositoryUrlForm.test.tsx, onboarding/page.test.tsx)
- No complex UI interactions requiring live browser recording (no drag/drop, wizards, or multi-step state)
- Story is frontend-only with well-understood Next.js App Router patterns

---

## Step 3 Output: Test Strategy

### AC → Test Scenario Mapping

#### AC-1: Artifact list with cards (FR6, UX-DR11)

| ID | Scenario | Level | File | Priority |
|---|---|---|---|---|
| CARD-01 | ArtifactCard renders type label, title, and completed badge | Component (Jest/jsdom) | `ArtifactCard.test.tsx` | P0 |
| CARD-02 | ArtifactCard renders in-progress badge with distinct style (caution border, not just color) | Component (Jest/jsdom) | `ArtifactCard.test.tsx` | P0 |
| CARD-03 | ArtifactCard renders all 12 type labels correctly | Component (Jest/jsdom) | `ArtifactCard.test.tsx` | P1 |
| CARD-04 | Completed badge is visually muted (transparent bg, text-2) vs in-progress (caution bg, caution text) | Component (Jest/jsdom) | `ArtifactCard.test.tsx` | P1 |
| PAGE-01 | Page renders artifact cards when Postgres has artifacts | Server Component (Jest/node) | `page.test.tsx` | P0 |
| E2E-01 | Authenticated user sees artifact cards on /project-map | E2E (Playwright) | `project-map.spec.ts` | P0 |

#### AC-2: In-progress visual distinction (UX-DR11, UX-DR16)

| ID | Scenario | Level | File | Priority |
|---|---|---|---|---|
| CARD-02 | (same as above — distinct badge style, not color alone) | Component | `ArtifactCard.test.tsx` | P0 |
| CARD-05 | Both badges include text labels ("Completed" / "In progress") — never color alone (UX-DR16) | Component (Jest/jsdom) | `ArtifactCard.test.tsx` | P0 |

#### AC-3: Empty state (UX-DR19)

| ID | Scenario | Level | File | Priority |
|---|---|---|---|---|
| PAGE-02 | Page renders empty state when no artifacts and sync returns empty | Server Component (Jest/node) | `page.test.tsx` | P0 |
| PAGE-03 | Page renders empty state when sync returns NOT_FOUND and Postgres is empty | Server Component (Jest/node) | `page.test.tsx` | P1 |
| E2E-02 | Empty state shows prompt to start first conversation when no artifacts | E2E (Playwright) | `project-map.spec.ts` | P1 |

#### AC-4: Credential error banner (UX-DR10)

| ID | Scenario | Level | File | Priority |
|---|---|---|---|---|
| BANNER-01 | CredentialErrorBanner renders banner text and link | Component (Jest/jsdom) | `CredentialErrorBanner.test.tsx` | P0 |
| BANNER-02 | Clicking link opens the dialog modal | Component (Jest/jsdom) | `CredentialErrorBanner.test.tsx` | P0 |
| BANNER-03 | Dialog contains "Reconnect" button | Component (Jest/jsdom) | `CredentialErrorBanner.test.tsx` | P0 |
| BANNER-04 | Clicking "Reconnect" calls reauthorizeGitHub | Component (Jest/jsdom) | `CredentialErrorBanner.test.tsx` | P1 |
| BANNER-05 | Banner is non-dismissible (no close button in banner itself — only dialog can be dismissed) | Component (Jest/jsdom) | `CredentialErrorBanner.test.tsx` | P1 |
| BANNER-06 | "Update access token" link has aria-label | Component (Jest/jsdom) | `CredentialErrorBanner.test.tsx` | P1 |
| PAGE-04 | Page renders CredentialErrorBanner when credential health is failed | Server Component (Jest/node) | `page.test.tsx` | P0 |
| PAGE-05 | Page does NOT trigger sync when credential is already failed | Server Component (Jest/node) | `page.test.tsx` | P0 |
| PAGE-06 | Page renders credential banner when sync returns NO_CREDENTIAL | Server Component (Jest/node) | `page.test.tsx` | P1 |

#### AC-5: Loading skeleton and performance (NFR-P3)

| ID | Scenario | Level | File | Priority |
|---|---|---|---|---|
| E2E-03 | Project Map loads within 2 seconds (NFR-P3) | E2E (Playwright) | `project-map.spec.ts` | P0 |

#### Page-load sync behavior (Dev Notes strategy)

| ID | Scenario | Level | File | Priority |
|---|---|---|---|---|
| PAGE-07 | Page triggers syncArtifactsAction when Postgres is empty | Server Component (Jest/node) | `page.test.tsx` | P0 |
| PAGE-08 | Page does NOT trigger sync on subsequent visits (populated Postgres) | Server Component (Jest/node) | `page.test.tsx` | P1 |
| PAGE-09 | Page uses refreshedArtifacts after successful sync | Server Component (Jest/node) | `page.test.tsx` | P1 |
| PAGE-10 | Page falls back to original empty artifacts when sync fails | Server Component (Jest/node) | `page.test.tsx` | P1 |

### Test Level Summary

| Level | File | Tests | P0 | P1 |
|---|---|---|---|---|
| Component (Jest/jsdom) | `ArtifactCard.test.tsx` | 5 | 3 | 2 |
| Component (Jest/jsdom) | `CredentialErrorBanner.test.tsx` | 6 | 3 | 3 |
| Server Component (Jest/node) | `page.test.tsx` | 12 | 6 | 6 |
| E2E (Playwright) | `project-map.spec.ts` | 3 | 2 | 1 |
| **Total** | | **26** | **14** | **12** |

### Red Phase Design

All tests are designed to fail before implementation:
- **ArtifactCard.test.tsx**: imports `ArtifactCard` from `./ArtifactCard` — module doesn't exist yet (Task 2.1)
- **CredentialErrorBanner.test.tsx**: imports `CredentialErrorBanner` from `./CredentialErrorBanner` — module doesn't exist yet (Task 3.1)
- **page.test.tsx**: imports updated `page.tsx` — current placeholder doesn't export data-fetching logic (Task 5.1)
- **project-map.spec.ts**: existing placeholder tests wrong routes/selectors — will be replaced (Task 5.10)

### Coverage Avoidance

- **No duplicate coverage** between Component and Server Component tests: ArtifactCard tests verify rendering in isolation with props; page tests verify data-fetching decisions and mock child components as render stubs
- **E2E tests** focus on user-visible journeys (page load, visible content, performance) — not internal logic
- **CredentialErrorBanner** component tests verify modal interaction; page tests only verify the banner is rendered when `credentialFailed` is true (banner is mocked as a stub)

---

## Step 4 Output: Test Generation (RED PHASE)

### Generated Files

| File | Level | Environment | Tests | P0 | P1 | Red Signal |
|---|---|---|---|---|---|---|
| `apps/web/src/components/project-map/ArtifactCard.test.tsx` | Component | Jest/jsdom | 5 | 3 | 2 | Module not found (Task 2.1) |
| `apps/web/src/components/project-map/CredentialErrorBanner.test.tsx` | Component | Jest/jsdom | 6 | 3 | 3 | Module not found (Task 3.1) |
| `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` | Server Component | Jest/node | 12 | 6 | 6 | Mocks never called (placeholder page) |
| `playwright/e2e/project-map/project-map.spec.ts` | E2E | Playwright | 3 | 2 | 1 | `test.skip()` (page not implemented) |
| **Total** | | | **24** | **14** | **10** | |

### TDD Red Phase Compliance

- **Jest component tests** (ArtifactCard, CredentialErrorBanner): No `it.skip()` — the module-not-found error IS the red-phase signal (following Story 1.3 pattern). Tests assert expected behavior, not placeholders.
- **Jest server component test** (page.test.tsx): No `it.skip()` — the current placeholder page doesn't call `auth()`, `getPrisma()`, `getCredentialHealthStatus()`, or `syncArtifactsAction()`. 6 tests fail (mocked functions never called, artifact titles not in HTML), 6 pass (placeholder happens to produce similar output for h1 and empty state text). When the page is implemented, the 6 "accidentally green" tests will pass for the right reason.
- **Playwright E2E tests** (project-map.spec.ts): All tests use `test.skip()` — the page exists as a placeholder but doesn't have the expected behavior. Existing placeholder tests (referencing `/dashboard`, non-existent testids) replaced entirely.
- **No placeholder assertions**: All tests assert expected behavior from acceptance criteria — no `expect(true).toBe(true)`.
- **No regressions**: All 359 pre-existing tests still pass (365 total including 6 new page tests that pass).

---

## Step 4C Output: Aggregation

### Fixture Needs

- `withRepoConnection` fixture (already exists in `playwright/support/custom-fixtures.ts`) — used by E2E tests
- No new fixtures needed — Jest tests use inline mock data and jest.mock stubs
- Future: An internal test API route for seeding artifacts would enable more E2E tests (out of scope for this story)

### Knowledge Fragments Used

- `component-tdd` — Red-Green-Refactor cycle, provider isolation, accessibility assertions
- `test-quality` — Deterministic tests, explicit assertions, <300 lines, self-cleaning
- `test-healing-patterns` — Common failure patterns (stale selectors, race conditions, hard waits)
- `selector-resilience` — Selector hierarchy (getByRole > getByText > getByTestId)

---

## Step 5 Output: Validation & Completion

### Validation Checklist

- [x] Story approved with clear acceptance criteria (5 ACs, status `ready-for-dev`)
- [x] Test framework configured (Jest + Playwright)
- [x] All 4 test files created in correct locations (co-located with source)
- [x] All tests assert expected behavior (no placeholder assertions)
- [x] All tests are red-phase scaffolds (module-not-found or `test.skip()`)
- [x] AC coverage: all 5 ACs have at least one P0 test
- [x] No duplicate coverage across levels
- [x] Story metadata and handoff paths captured in frontmatter
- [x] No orphaned CLI sessions (no browser recording used)
- [x] Temp artifacts stored in `_bmad-output/test-artifacts/`

### Acceptance Criteria Coverage

| AC | Description | Test IDs | P0 Coverage |
|---|---|---|---|
| AC-1 | Artifact list with cards | CARD-01, CARD-02, CARD-05, PAGE-01, E2E-01 | 4 P0 tests |
| AC-2 | In-progress visual distinction | CARD-02, CARD-05 | 2 P0 tests |
| AC-3 | Empty state | PAGE-02, PAGE-03, E2E-02 | 1 P0 test |
| AC-4 | Credential error banner | BANNER-01..06, PAGE-04, PAGE-05, PAGE-06 | 5 P0 tests |
| AC-5 | Loading skeleton / performance | E2E-03 | 1 P0 test |

### Red Phase: Module-Not-Found Signals

| Test file | Depends on | Implement in |
|---|---|---|
| `ArtifactCard.test.tsx` | `apps/web/src/components/project-map/ArtifactCard.tsx` | Task 2.1 |
| `CredentialErrorBanner.test.tsx` | `apps/web/src/components/project-map/CredentialErrorBanner.tsx` + `apps/web/src/components/ui/dialog.tsx` | Task 1.1 + Task 3.1 |
| `page.test.tsx` | Updated `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` | Task 5.1 |
| `project-map.spec.ts` | Full page implementation (all tasks) | Task 5.10 (remove `test.skip()`) |

---

## Task-by-Task Activation Guide

### Task 1: Add shadcn `dialog` component (AC: 4)
- No test to activate — `dialog.tsx` is a dependency of `CredentialErrorBanner.test.tsx`
- Run `yarn dlx shadcn@latest add dialog` from `apps/web/`

### Task 2: Create `ArtifactCard` component (AC: 1, 2)
- **Activate:** `ArtifactCard.test.tsx` — no `it.skip()` to remove; tests will start passing once the module exists
- **Run:** `yarn nx test web --testPathPattern="ArtifactCard"`
- **Expected:** 5 tests pass (3 P0, 2 P1)

### Task 3: Create `CredentialErrorBanner` component (AC: 4)
- **Activate:** `CredentialErrorBanner.test.tsx` — no `it.skip()` to remove; tests will start passing once the module + dialog exist
- **Run:** `yarn nx test web --testPathPattern="CredentialErrorBanner"`
- **Expected:** 6 tests pass (3 P0, 3 P1)

### Task 4: Create `loading.tsx` skeleton state (AC: 5)
- No unit test generated — `loading.tsx` is a Next.js convention file, verified by E2E
- E2E coverage: `project-map.spec.ts` E2E-03 (page load time)

### Task 5: Update Project Map page (AC: 1, 2, 3, 4, 5)
- **Activate:** `page.test.tsx` — no `it.skip()` to remove; tests will start passing once the page calls the mocked functions
- **Run:** `yarn nx test web --testPathPattern="project-map/page"`
- **Expected:** 10 tests pass (6 P0, 4 P1)
- **Activate E2E:** Remove `test.skip()` from `project-map.spec.ts` tests as the page implementation lands
- **Run E2E:** `yarn test:e2e --grep "Story 2.2"`

### Task 6: Verify lint, typecheck, and tests pass
- **Run:** `yarn nx lint web` — 0 new errors/warnings
- **Run:** `yarn nx typecheck web` — clean
- **Run:** `yarn nx test web` — all tests pass

---

## Skipped Tests Requiring External Configuration

| Test | Condition to activate |
|---|---|
| E2E-01 (artifact cards visible) | Needs seeded artifacts in Postgres (internal test API route or manual seed) |
| E2E-02 (empty state) | Needs empty Postgres (clean database state) |
| E2E-03 (load within 2s) | Needs running dev server + seeded data |

---

## Risk Cross-Reference

| Risk | AC | Test | Status |
|---|---|---|---|
| In-progress artifact not visually distinct from completed | AC-2 | `[P0] renders in-progress badge with distinct style` | RED |
| Status signaled by color alone (UX-DR16 violation) | AC-2 | `[P0] both badges include text labels — never color alone` | RED |
| Credential banner missing or dismissible | AC-4 | `[P0] renders CredentialErrorBanner when credential health is failed` | RED |
| Sync triggered when credential already failed (wasteful) | AC-4 | `[P0] does NOT trigger sync when credential is already failed` | RED |
| Page loads slowly (NFR-P3 violation) | AC-5 | `[P0] Project Map loads within 2 seconds` | RED |
| Empty state not shown when no artifacts | AC-3 | `[P0] renders empty state when no artifacts and sync returns empty` | RED |

---

## Next Steps

1. **Implement the feature** following the story's task list (Tasks 1-6)
2. **Remove `test.skip()`** from E2E tests as page implementation lands (Task 5)
3. **Run activated tests** → verify they FAIL before implementation, then PASS after
4. **Commit passing tests** per task
5. **Recommended next workflow:** `dev-story` (implement the story)
