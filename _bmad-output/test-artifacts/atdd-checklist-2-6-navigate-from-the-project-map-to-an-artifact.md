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
storyId: '2.6'
storyKey: 2-6-navigate-from-the-project-map-to-an-artifact
storyFile: _bmad-output/implementation-artifacts/2-6-navigate-from-the-project-map-to-an-artifact.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-2-6-navigate-from-the-project-map-to-an-artifact.md
generatedTestFiles:
  - apps/web/src/components/project-map/ArtifactCard.test.tsx
  - apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx
inputDocuments:
  - _bmad-output/implementation-artifacts/2-6-navigate-from-the-project-map-to-an-artifact.md
  - _bmad-output/project-context.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/component-tdd.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/data-factories.md
---

# ATDD Checklist — Story 2.6: Navigate from the Project Map to an Artifact

**TDD Phase:** RED (test scaffolds to be generated/updated, will fail until implementation)
**Stack:** fullstack (Next.js + NestJS) — this story is frontend-only
**Generated:** 2026-07-03
**Execution Mode:** SEQUENTIAL

---

## Step 1 Output: Preflight & Context

### Stack Detection
- Config `test_stack_type`: auto
- Auto-detected: `fullstack` (package.json with Next.js/React + NestJS)
- Story scope: frontend-only (apps/web, no backend changes)

### Prerequisites
- Story 2.6 approved, status `ready-for-dev`, 2 clear ACs ✓
- Jest configured: jsdom default for component tests, `@jest-environment node` for Server Component page tests ✓
- Playwright configured: `playwright.config.ts` (auth setup + chromium projects) ✓
- Dev environment available ✓

### Story Context
- **Story file:** `_bmad-output/implementation-artifacts/2-6-navigate-from-the-project-map-to-an-artifact.md`
- **Story key:** `2-6-navigate-from-the-project-map-to-an-artifact`
- **Story ID:** `2.6`
- **Acceptance Criteria:**
  - AC-1: Completed artifact click opens the Artifact Browser pre-selected (FR8)
  - AC-2: In-progress artifact click opens the read-only Artifact Browser (FR8)

### Framework & Existing Patterns
- Jest with jsdom (default) for client/synchronous component tests
- `@jest-environment node` for Server Component page tests (`renderToStaticMarkup`)
- Playwright with auth setup project, chromium project
- Co-located tests (`*.test.tsx` next to source)
- P0/P1 priority tags in `it()` descriptions
- Mock patterns: `jest.mock` at top, `jest.clearAllMocks` in `beforeEach`
- Test header comments citing story, ACs, red-phase status
- Canonical `<Link>` pattern from `ArtifactListEntry` (Story 2.5) — the exact pattern this story replicates on `ArtifactCard`

### TEA Config Flags
- `tea_use_playwright_utils`: true
- `tea_use_pactjs_utils`: false
- `tea_pact_mcp`: none
- `tea_browser_automation`: auto
- `test_stack_type`: auto

### Knowledge Fragments Loaded
- `component-tdd.md` (core) — Red-Green-Refactor cycle, provider isolation, accessibility assertions
- `test-quality.md` (core) — Deterministic, isolated, explicit, focused, fast tests
- `test-healing-patterns.md` (core) — Common failure patterns and fixes
- `data-factories.md` (core) — Factory functions with overrides, API-first setup

### Existing Test Files (to be updated, not created from scratch)
- `apps/web/src/components/project-map/ArtifactCard.test.tsx` — Story 2.2 delivered this; Story 2.6 adds `href` to fixtures, new tests for link behavior, `aria-label`, focus/hover classes
- `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` — Story 2.2 delivered this; Story 2.6 updates the `ArtifactCard` mock to accept `href`, adds test for `href` passing

### Reference Pattern
- `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` (Story 2.5) — the canonical `<Link>` pattern with `href`, `aria-label`, `role="listitem"`, `cn()` focus ring classes
- `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` (Story 2.5) — the canonical test pattern for asserting link behavior, `aria-label`, focus ring classes

---

## Step 2 Output: Generation Mode

**Mode:** AI Generation

**Rationale:**
- Acceptance criteria are clear (2 ACs, both about click → navigate)
- Scenarios are standard navigation (card → `<Link>` → URL with query param)
- The exact pattern is already established from `ArtifactListEntry` (Story 2.5)
- The story spec defines the test cases precisely in Tasks 1.2 and 2.2
- No browser recording needed — this is a component-level change, not a complex UI interaction

---

## Step 3 Output: Test Strategy

### AC → Test Scenario Mapping

#### AC-1: Completed artifact click opens the Artifact Browser pre-selected (FR8)

| # | Scenario | Level | Priority | Red Phase Signal |
|---|----------|-------|----------|-----------------|
| 1 | `ArtifactCard` renders as a `<Link>`/`<a>` with the correct `href` | Component (RTL) | P0 | Component renders `<div>`, not `<a>` — `getByRole('link')` fails |
| 2 | `ArtifactCard` has `aria-label="{typeLabel}: {title} — {statusLabel}"` | Component (RTL) | P0 | No `aria-label` attribute on the `<div>` root |
| 3 | `ArtifactCard` has focus ring classes (`focus:ring-2`, `focus:ring-accent`, `focus:ring-offset-2`, `focus:ring-offset-surface`) | Component (RTL) | P0 | No focus classes in className |
| 4 | `ArtifactCard` has hover border classes (`hover:border-text-3`) | Component (RTL) | P0 | No hover classes in className |
| 5 | `ArtifactCard` preserves `role="listitem"` on the link element | Component (RTL) | P0 | `role="listitem"` exists on `<div>` but test queries by `getByRole('link')` which fails |
| 6 | Project Map page passes `href={`/artifacts?id=${a.id}`}` to each `ArtifactCard` | Component (renderToStaticMarkup) | P0 | Mock renders `href` in output string, but page doesn't pass `href` prop yet |

#### AC-2: In-progress artifact click opens the read-only Artifact Browser (FR8)

| # | Scenario | Level | Priority | Red Phase Signal |
|---|----------|-------|----------|-----------------|
| 7 | In-progress artifacts receive the same `href` as completed artifacts (same click behavior for every status) | Component (renderToStaticMarkup) | P0 | Page test asserts both `art_1` (completed) and `art_2` (in-progress) have `href` — page doesn't pass `href` yet |
| 8 | (No new test) Artifacts page renders read-only content | Already covered by Story 2.5 | — | Destination page behavior unchanged |

### Test Level Selection

- **Component (Jest + React Testing Library)** — `ArtifactCard.test.tsx`
  - Scenarios 1–5: link rendering, `aria-label`, focus/hover classes, `role="listitem"` preservation
  - Environment: jsdom (default)
  - Query strategy: `screen.getByRole('link')` for the `<a>` element, `toHaveAttribute()` for `href`/`aria-label`, `className` assertions for classes

- **Component (Jest + renderToStaticMarkup)** — `page.test.tsx`
  - Scenarios 6–7: page passes correct `href` to each `ArtifactCard`
  - Environment: `@jest-environment node`
  - Mock `ArtifactCard` as render stub including `href` in output string
  - Assert rendered HTML contains `ArtifactCard:{type}:{title}:{status}:{href}`

- **No E2E** — the story is a component-level change (adding `href` to an existing card). The destination page already handles `?id=` (Story 2.5). Component tests verify the `href` is correct. An E2E test would primarily exercise Next.js routing (framework behavior), not story-specific logic.

- **No API/Integration tests** — no backend changes, no new endpoints, no database queries.

### Priority Assignment

- **P0** (all 7 scenarios): All directly cover AC-1 or AC-2. Click-to-navigate is the core user journey — every test is acceptance-criteria coverage.

### Red Phase Confirmation

All new tests will fail before implementation:

- **`ArtifactCard.test.tsx`**: New tests query `getByRole('link')` — currently fails because the component renders a `<div>`. The `aria-label`, focus ring, and hover border assertions also fail because the `<div>` root has none of these attributes/classes. Existing tests (type label, title, status badge) will still pass — those parts don't change.

- **`page.test.tsx`**: The updated `ArtifactCard` mock includes `href` in its output string, but the page doesn't pass `href` to `<ArtifactCard>` yet — the rendered HTML won't contain the `href` value. The new assertion fails.

### Files to Update

| File | Action | Scenarios |
|------|--------|-----------|
| `apps/web/src/components/project-map/ArtifactCard.test.tsx` | Update: header comment, fixtures (add `href`), add 5 new P0 tests | 1–5 |
| `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` | Update: `ArtifactCard` mock (accept `href`), add 1 new P0 test | 6–7 |

---

## Step 4 Output: Test Generation (Component Tests Only)

### Execution Mode
- Config `tea_execution_mode`: auto → resolved to **SEQUENTIAL** (no API/E2E subagents needed)
- Worker A (API tests): **SKIPPED** — no API endpoints in this story
- Worker B (E2E tests): **SKIPPED** — no E2E tests needed (component-level change)
- Component tests generated directly (no subagent for component tests)

### TDD Red Phase Compliance

All new tests use `it.skip()` (Jest equivalent of `test.skip()`):

- `ArtifactCard.test.tsx`: 5 new `it.skip()` tests
- `page.test.tsx`: 1 new `it.skip()` test
- No placeholder assertions — all tests assert expected behavior
- All tests marked as expected-to-fail when activated

### Test Verification Results

```
Test Suites: 37 passed, 37 total
Tests:       6 skipped, 464 passed, 470 total
```

- **464 passed**: All existing tests remain green (Story 2.2 base tests + all other web tests)
- **6 skipped**: All new red-phase scaffolds (5 ArtifactCard + 1 page test)
- **0 failed**: No regressions

### Generated/Updated Files

| File | Action | New Tests |
|------|--------|-----------|
| `apps/web/src/components/project-map/ArtifactCard.test.tsx` | Updated: header comment, fixtures (added `href`), 5 new `it.skip()` P0 tests | 5 |
| `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` | Updated: `ArtifactCard` mock (accepts `href`), 1 new `it.skip()` P0 test | 1 |

### Fixture Needs

No new fixtures needed — existing `COMPLETED_ARTIFACT` and `IN_PROGRESS_ARTIFACT` fixtures updated with `href` field. Existing `ARTIFACTS` fixture in page test already includes `id` field.

### Acceptance Criteria Coverage

| AC | Covered By | Tests |
|----|-----------|-------|
| AC-1: Completed artifact click opens Artifact Browser pre-selected | ArtifactCard link/href test, page href-passing test (completed artifact) | 3 P0 |
| AC-2: In-progress artifact click opens read-only Artifact Browser | Page href-passing test (in-progress artifact) | 1 P0 (shared with AC-1) |
| UX-DR16: Focus ring, aria-label, non-color state signaling | ArtifactCard focus ring, aria-label, role tests | 3 P0 |

### Summary Statistics

```json
{
  "tdd_phase": "RED",
  "total_tests": 6,
  "component_tests": 6,
  "api_tests": 0,
  "e2e_tests": 0,
  "all_tests_skipped": true,
  "expected_to_fail": true,
  "fixtures_created": 0,
  "acceptance_criteria_covered": ["AC-1", "AC-2"],
  "subagent_execution": "SEQUENTIAL (component-only, no API/E2E subagents)",
  "performance_gain": "baseline (no parallel speedup needed)"
}
```

## Next Steps (Task-by-Task Activation)

During implementation of each task:

1. **Task 1 (ArtifactCard → `<Link>`):** Remove `it.skip()` from the 5 new tests in `ArtifactCard.test.tsx`. Run `yarn nx test web --testPathPattern=ArtifactCard.test`. Verify tests fail first (red), then pass after implementing Task 1.1 (green).
2. **Task 2 (Page passes `href`):** Remove `it.skip()` from the 1 new test in `page.test.tsx`. Run `yarn nx test web --testPathPattern=project-map/page.test`. Verify test fails first (red), then passes after implementing Task 2.1 (green).
3. **Task 3 (Lint/typecheck/test):** Run `yarn nx lint web`, typecheck, and `yarn nx test web` to verify all tests pass.

---

## Step 5 Output: Validate & Complete

### Validation Checklist

#### Prerequisites
- [x] Story approved with clear acceptance criteria (AC-1, AC-2 — both testable)
- [x] Development environment ready
- [x] Framework scaffolding exists (Jest configured, Playwright configured)
- [x] Test framework configuration available (`apps/web/jest.config.ts`)

#### Step 1: Story Context
- [x] Story markdown file loaded and parsed
- [x] All acceptance criteria identified (AC-1, AC-2)
- [x] Affected components identified (ArtifactCard, page.tsx)
- [x] Technical constraints documented (follow ArtifactListEntry pattern, cn() for classes)
- [x] Framework configuration loaded
- [x] Existing fixture patterns reviewed
- [x] Similar test patterns found (ArtifactListEntry.test.tsx from Story 2.5)
- [x] Knowledge base fragments loaded (component-tdd, test-quality, test-healing-patterns, data-factories)

#### Step 2: Test Level Selection
- [x] Each AC analyzed for appropriate test level
- [x] Component tests selected (no E2E/API needed for this story)
- [x] Duplicate coverage avoided
- [x] Tests prioritized (all P0 — AC coverage)
- [x] Test levels documented in checklist

#### Step 3: Red-Phase Scaffolds
- [x] Component test files updated (co-located with source)
- [x] Tests follow clear render → query → assert structure
- [x] Component mounting works (render() from RTL)
- [x] Props tested (href, aria-label, focus/hover classes, role)
- [x] All new tests use `it.skip()` (Jest red-phase scaffolds)
- [x] Activation guidance documented

#### Test Quality
- [x] All tests have descriptive names
- [x] No duplicate tests
- [x] No flaky patterns (synchronous component, no timing issues)
- [x] No test interdependencies (each test renders its own component)
- [x] Tests are deterministic

#### Code Quality
- [x] Lint passes: 0 errors, 7 warnings (baseline from Story 2.5 — no new warnings)
- [x] Consistent naming conventions followed
- [x] Imports organized and correct
- [x] Code follows project style guide (matches ArtifactListEntry.test.tsx pattern)

#### Deliverables
- [x] ATDD checklist created at `_bmad-output/test-artifacts/atdd-checklist-2-6-navigate-from-the-project-map-to-an-artifact.md`
- [x] Frontmatter includes storyId, storyKey, storyFile, atddChecklistPath, generatedTestFiles
- [x] ATDD artifacts linked back into story file (`### ATDD Artifacts` section)
- [x] All scaffolds marked with `it.skip()`
- [x] No scaffold emitted as active passing test
- [x] Test run output captured (6 skipped, 464 passed, 0 failed)

### Completion Summary

- **Story ID:** 2.6
- **Story file:** `_bmad-output/implementation-artifacts/2-6-navigate-from-the-project-map-to-an-artifact.md`
- **Primary test level:** Component (Jest + RTL / renderToStaticMarkup)
- **Test counts:** 6 component tests (all `it.skip()` red-phase scaffolds)
- **Test file paths:**
  - `apps/web/src/components/project-map/ArtifactCard.test.tsx` (5 new scaffolds)
  - `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` (1 new scaffold)
- **Factory count:** 0 (existing fixtures updated with `href` field)
- **Fixture count:** 0 (no new fixtures needed)
- **Mock requirements:** 0 (existing ArtifactCard mock updated to accept `href`)
- **data-testid count:** 0 (using role-based queries per ARIA-first pattern)
- **Knowledge fragments applied:** component-tdd, test-quality, test-healing-patterns, data-factories
- **Checklist output:** `_bmad-output/test-artifacts/atdd-checklist-2-6-navigate-from-the-project-map-to-an-artifact.md`
- **Next recommended workflow:** `dev-story` (implement Story 2.6 following the task-by-task activation guidance above)
