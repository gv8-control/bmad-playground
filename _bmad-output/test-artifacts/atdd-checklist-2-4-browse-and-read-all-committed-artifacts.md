---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-07-03'
storyId: '2.4'
storyKey: '2-4-browse-and-read-all-committed-artifacts'
storyFile: '_bmad-output/implementation-artifacts/2-4-browse-and-read-all-committed-artifacts.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-2-4-browse-and-read-all-committed-artifacts.md'
generatedTestFiles:
  - 'apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx'
  - 'apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx'
inputDocuments:
  - '_bmad-output/implementation-artifacts/2-4-browse-and-read-all-committed-artifacts.md'
  - '_bmad-output/project-context.md'
  - '_bmad/tea/config.yaml'
  - 'apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx'
  - 'apps/web/src/components/project-map/ArtifactCard.test.tsx'
  - 'apps/web/src/components/project-map/ArtifactCard.tsx'
  - 'apps/web/src/app/(dashboard)/(app)/project-map/error.tsx'
  - 'apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx'
  - 'knowledge/component-tdd.md'
  - 'knowledge/test-quality.md'
  - 'knowledge/test-healing-patterns.md'
---

# ATDD Checklist — Story 2.4: Browse and Read All Committed Artifacts

## Step 1: Preflight & Context

### Stack Detection
- `test_stack_type: auto` → auto-detected `fullstack` (Next.js + NestJS manifests present)
- Story 2.4 scope is pure `apps/web` — Jest unit/component tests only. No E2E/Playwright tests in this story's task list.

### Prerequisites
- Story status: `ready-for-dev` with clear acceptance criteria (AC-1, AC-2, AC-3)
- Test framework configured: Jest ~30.3.0 (co-located `*.test.tsx`), Playwright config present (not used for this story)
- Dev environment available

### Story Context
- **story_id:** `2.4`
- **story_key:** `2-4-browse-and-read-all-committed-artifacts`
- **story_file:** `_bmad-output/implementation-artifacts/2-4-browse-and-read-all-committed-artifacts.md`
- **Acceptance Criteria:**
  - AC-1: Full-width flat list of all Artifacts sorted by last-modified descending (FR16, UX-DR12)
  - AC-2: Skeleton loader shown in content pane while loading
  - AC-3: Credential Error Banner (same as Project Map) when credential health is `failed`
- **Affected components/integrations:**
  - NEW: `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` (Server Component, display-only)
  - UPDATE: `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` (replace 17-line placeholder)
  - NEW: `apps/web/src/app/(dashboard)/(app)/artifacts/loading.tsx` (skeleton)
  - NEW: `apps/web/src/app/(dashboard)/(app)/artifacts/error.tsx` (error boundary)
- **Integrations (existing, do not modify):** `syncArtifactsAction`, `getCredentialHealthStatus`, `CredentialErrorBanner`, `Breadcrumb`, `Artifact` Prisma model, `ArtifactType`/`ArtifactStatus` types

### Framework & Existing Patterns
- Canonical Server Component page test: `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` — `@jest-environment node`, `renderToStaticMarkup`, child components mocked as render stubs
- Canonical component test: `apps/web/src/components/project-map/ArtifactCard.test.tsx` — jsdom, `@testing-library/react` `render()`/`screen`
- Canonical error boundary: `apps/web/src/app/(dashboard)/(app)/project-map/error.tsx` — `'use client'`, full page shell with h1, `ring-offset-surface` button
- Maps to duplicate in `ArtifactListEntry`: `TYPE_LABELS`, `STATUS_LABELS`, `STATUS_BADGE_CLASSES` (from `ArtifactCard.tsx`)

### TEA Config Flags
- `tea_use_playwright_utils: true` (not exercised — no E2E in scope)
- `tea_use_pactjs_utils: false`
- `tea_pact_mcp: none`
- `tea_browser_automation: auto`
- `test_stack_type: auto`

### Knowledge Fragments Loaded
- **Core:** `component-tdd.md`, `test-quality.md`, `test-healing-patterns.md`, `data-factories.md`
- **Skipped:** Playwright Utils fragments (no E2E in scope), Pact fragments (disabled), selector-resilience/timing-debugging (E2E-focused, not applicable to Jest component tests)

### Test Files to Generate (Red-Phase Scaffolds)
1. `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` — component unit test (jsdom, RTL)
2. `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` — Server Component page test (`@jest-environment node`, `renderToStaticMarkup`)

> `loading.tsx` and `error.tsx` are Next.js convention files with no test tasks in the story spec.

## Step 2: Generation Mode

**Chosen mode: AI Generation.**

Rationale:
- Acceptance criteria are clear and prescriptive (story spec lists exact test cases)
- Scenarios are standard: Server Component data-fetching decisions + presentational component rendering
- Story 2.4 tests are Jest unit/component tests (jsdom + `@jest-environment node`), not E2E — no browser recording applicable
- Canonical patterns already exist in the codebase (`project-map/page.test.tsx`, `ArtifactCard.test.tsx`) to mirror

## Step 3: Test Strategy

### AC → Test Scenario Map

#### File 1: `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx`
**Level:** Component (jsdom, `@testing-library/react` `render`/`screen`)
**AC coverage:** AC-1 (flat list entry rendering), UX-DR16 (non-color state signaling, a11y)

| # | Scenario | AC | Priority |
|---|----------|----|----------|
| 1 | renders type label text | AC-1 | P0 |
| 2 | renders title | AC-1 | P0 |
| 3 | renders status badge text | AC-1 | P0 |
| 4 | renders formatted date (`new Date('2026-06-14')` → "Jun 14") | AC-1 | P0 |
| 5 | renders `role="listitem"` | AC-1, UX-DR16 | P0 |
| 6 | renders `aria-label` in correct format (`{TYPE_LABELS[type]}: {title} — {STATUS_LABELS[status]}`) | AC-1, UX-DR16 | P0 |
| 7 | renders "Other" label for unknown type | AC-1 (edge) | P1 |
| 8 | renders "Completed" for unknown status | AC-1 (edge) | P1 |

#### File 2: `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx`
**Level:** Unit / Server Component (`@jest-environment node`, `renderToStaticMarkup`, child components as render stubs)
**AC coverage:** AC-1 (list + ordering + empty state + structure), AC-3 (credential banner + sync gating)

| # | Scenario | AC | Priority |
|---|----------|----|----------|
| 1 | queries artifacts by repoConnectionId ordered by lastModifiedAt desc | AC-1 | P0 |
| 2 | renders artifact titles when Postgres has artifacts | AC-1 | P0 |
| 3 | renders empty state when no artifacts and sync returns empty | AC-1 | P0 |
| 4 | calls getCredentialHealthStatus | AC-3 | P0 |
| 5 | renders CredentialErrorBanner when credential health is failed | AC-3 | P0 |
| 6 | does NOT trigger sync when credential is already failed | AC-3 | P0 |
| 7 | triggers syncArtifactsAction when Postgres is empty | AC-1 | P0 |
| 8 | renders h1 "Artifact Browser" for route-change focus management | AC-1, UX-DR16 | P0 |
| 9 | renders Breadcrumb | AC-1 | P0 |
| 10 | renders refreshed artifact titles after successful sync | AC-1 | P1 |
| 11 | falls back to empty state when sync returns UNKNOWN error | AC-1 (edge) | P1 |
| 12 | does NOT trigger sync on subsequent visits (populated Postgres) | AC-1 (edge) | P1 |
| 13 | renders CredentialErrorBanner when sync returns NO_CREDENTIAL | AC-3 (edge) | P1 |

### AC-2 (Skeleton loader)
Covered by the `loading.tsx` Next.js convention file (Task 3) AND `loading.test.tsx` (added during automate validation — see `automate-validation-report-2-4.md`). The original checklist incorrectly accepted AC-2 as an untested coverage gap, claiming the Project Map's `loading.tsx` was also untested; the Project Map's `loading.tsx` IS tested (`project-map/loading.test.tsx`, 4 tests). The `loading.test.tsx` adds 3 tests (2 P0, 1 P1): h1 for route-focus management, 5 `animate-pulse` skeleton entries, no credential banner in loading state.

### Test Level Selection
- **Component (jsdom):** `ArtifactListEntry` — synchronous presentational Server Component, no async logic → `render()` works directly (no `renderToStaticMarkup` needed)
- **Unit / Server Component (`@jest-environment node`):** `ArtifactsPage` — async Server Component reading Postgres → `renderToStaticMarkup` after `await Page()`, child components mocked as render stubs
- **No E2E / Integration / API levels** — Story 2.4 is pure `apps/web` Server Component rendering with no new backend surface

### Red-Phase Confirmation
- **`ArtifactListEntry.test.tsx`:** `ArtifactListEntry.tsx` does not exist yet → "Cannot find module" is the expected red signal (mirrors `ArtifactCard.test.tsx` red-phase note). No `it.skip()` needed — module-not-found IS the red signal.
- **`page.test.tsx`:** current `page.tsx` is a 17-line placeholder that does not call `auth()`, `getPrisma()`, `getCredentialHealthStatus()`, or `syncArtifactsAction()`. Tests will fail because mocked functions are never called and expected content (artifact titles, CredentialErrorBanner, empty-state copy) is absent. This is the expected TDD red-phase signal — implementation lands in Task 2.

### Priority Summary
- **P0:** 14 tests (all AC-1/AC-3 critical-path coverage; CI fails immediately on any P0 failure)
- **P1:** 6 tests (edge cases: unknown type/status, sync error fallback, sync gating, NO_CREDENTIAL)
- **P2/P3:** none (no NFR/perf/exploratory scope for this story)

## Step 4: Generate Red-Phase Test Scaffolds

### Execution Mode Resolution
- `tea_execution_mode: auto` → resolved to **sequential**
- No API endpoints in scope → Worker A (API red-phase) skipped (no new backend surface in Story 2.4)
- No E2E journeys in scope → Worker B (E2E red-phase) skipped (Story 2.4 is pure `apps/web` Server Component rendering)
- Both test files are Jest unit/component tests, generated directly in sequential mode

### Red-Phase Convention (codebase-specific)
This codebase's established ATDD convention (per `project-context.md:176` and the canonical `ArtifactCard.test.tsx` / `project-map/page.test.tsx` headers) uses **real `it()` tests with no `test.skip()`** — the module-not-found / placeholder behavior IS the red signal. This diverges from the workflow's default `test.skip()` scaffold convention but matches the project's existing patterns exactly. Tests are removed from the file as implementation lands per task.

### Generated Test Files

#### 1. `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx`
- **Level:** Component (jsdom, `@testing-library/react` `render`/`screen`)
- **Tests:** 9 (7 P0, 2 P1)
- **Red signal:** `Cannot find module './ArtifactListEntry'` — component does not exist yet (Task 1.1)
- **Coverage:** AC-1 (type label, title, status badge, formatted date, `role="listitem"`, `aria-label`), UX-DR16 (non-color state signaling), AC-1 edge (unknown type → "Other", unknown status → "Completed")

#### 2. `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx`
- **Level:** Unit / Server Component (`@jest-environment node`, `renderToStaticMarkup`, child components as render stubs)
- **Tests:** 13 (8 P0, 5 P1)
- **Red signal:** `Could not locate module @/components/artifact-browser/ArtifactListEntry` (mock target doesn't exist yet) + placeholder `page.tsx` doesn't call `auth()`/`getPrisma()`/`getCredentialHealthStatus()`/`syncArtifactsAction()`
- **Coverage:** AC-1 (query ordering, artifact titles, empty state, h1, Breadcrumb, sync-on-empty), AC-3 (credential health check, banner render, sync gating, NO_CREDENTIAL)

### Verification
- **Red phase confirmed:** both new test suites fail (2 failed), 408 existing tests pass (no regressions)
- **Lint:** `yarn nx lint web` → 0 errors, 9 warnings (all pre-existing baseline from Story 2.3; no new issues from test files)

## Step 4C: Aggregate

### Subagent Outputs
No API/E2E subagent temp files — sequential mode, tests generated directly (no API endpoints or E2E journeys in scope for Story 2.4).

### TDD Red-Phase Validation
- **Codebase convention override:** this project uses real `it()` tests (no `test.skip()`) — module-not-found / placeholder behavior IS the red signal (per `project-context.md:176` and canonical `ArtifactCard.test.tsx` / `project-map/page.test.tsx` headers). The workflow's default `test.skip()` check does not apply.
- **No placeholder assertions:** verified — all `expect()` calls assert expected behavior (text content, query args, mock call counts), no `expect(true).toBe(true)`.
- **Red signal confirmed via test run:** both new suites fail (2 failed), 408 existing pass.

### Test Files Written to Disk
1. `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` (9 tests: 7 P0, 2 P1)
2. `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` (13 tests: 8 P0, 5 P1)

### Fixture Needs
None — test data is inline (matching the canonical `project-map/page.test.tsx` and `ArtifactCard.test.tsx` patterns). No shared fixture files required for red phase.

### Story Linking
Added `### ATDD Artifacts` subsection under `## Dev Agent Record` in `_bmad-output/implementation-artifacts/2-4-browse-and-read-all-committed-artifacts.md` with checklist + test file paths.

### Summary Statistics
- **TDD phase:** RED
- **Total tests:** 25 (9 component + 13 page + 3 loading skeleton)
- **P0:** 18 (critical-path AC coverage)
- **P1:** 7 (edge cases)
- **Execution:** SEQUENTIAL (no API/E2E workers; baseline, no parallel speedup)
- **Acceptance criteria covered:** AC-1 (flat list, ordering, empty state, structure), AC-2 (skeleton loader — expanded during automate validation), AC-3 (credential banner, sync gating)
- **Knowledge fragments used:** component-tdd, test-quality, test-healing-patterns, data-factories

## Step 5: Validate & Complete

### Validation Against Checklist
Applicable items (E2E/API/Playwright-factory items marked N/A — Story 2.4 is Jest unit/component only):

**Prerequisites:** ✅ Story approved (ready-for-dev, testable AC-1/2/3), ✅ dev environment ready, ✅ Jest framework configured, ✅ test deps installed
**Step 1 (Context):** ✅ story loaded/parsed, ✅ ACs identified, ✅ affected components identified, ✅ constraints documented, ✅ framework config loaded, ✅ existing patterns reviewed (canonical project-map/ArtifactCard tests), ✅ knowledge fragments loaded (component-tdd, test-quality, test-healing-patterns, data-factories; fixture-architecture/network-first N/A — E2E-focused)
**Step 2 (Strategy):** ✅ each AC mapped to test level, ✅ Component + Unit levels selected, ✅ no duplicate coverage, ✅ P0/P1 prioritized, ✅ documented
**Step 3 (Scaffolds):** ✅ test files co-located (codebase convention), ✅ Component test created, ✅ Page/Unit test created, ✅ codebase red-phase convention (real `it()`, no `test.skip()` — documented override), ✅ descriptive names, ✅ no duplicates, ✅ no flaky patterns, ✅ isolated (`jest.clearAllMocks` in beforeEach), ✅ deterministic
**Step 4 (Data infra):** N/A factories (inline data matches canonical patterns), N/A Playwright fixtures, ✅ mock requirements documented (auth, prisma, credential-health, artifacts actions, child stubs), N/A data-testid (no E2E)
**Step 5 (Impl checklist):** story spec Tasks 1-6 ARE the implementation checklist; ✅ red-green-refactor documented; ✅ execution command `yarn nx test web`
**Step 6 (Deliverables):** ✅ checklist at correct path, ✅ frontmatter complete (storyId/storyKey/storyFile/atddChecklistPath/generatedTestFiles), ✅ story file linked (ATDD Artifacts subsection), ✅ red-phase verified (test run captured: 2 failed, 408 pass), ✅ summary provided
**Quality:** ✅ readable, ✅ maintainable (mirrors canonical patterns), ✅ isolated, ✅ deterministic, ✅ no lint errors (0 errors, 9 pre-existing warnings)

### Key Assumptions
1. **Red-phase convention override:** codebase uses real `it()` (no `test.skip()`) per `project-context.md:176` and canonical test headers — module-not-found/placeholder behavior IS the red signal. Diverges from workflow default but matches project patterns exactly.
2. **AC-2 (skeleton) coverage gap accepted:** `loading.tsx` is a static Server Component with no logic; no test task in story spec. Mirrors Project Map's untested `loading.tsx`.
3. **No API/E2E workers:** Story 2.4 is pure `apps/web` Server Component rendering with no new backend surface or browser journeys.

### Completion Summary
- **Test files created:**
  - `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` (9 tests)
  - `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` (13 tests)
  - `apps/web/src/app/(dashboard)/(app)/artifacts/loading.test.tsx` (3 tests — added during automate validation)
- **Checklist:** `_bmad-output/test-artifacts/atdd-checklist-2-4-browse-and-read-all-committed-artifacts.md`
- **Story handoff:** `_bmad-output/implementation-artifacts/2-4-browse-and-read-all-committed-artifacts.md` (ATDD Artifacts subsection added)
- **Story key:** `2-4-browse-and-read-all-committed-artifacts`
- **Total tests:** 25 (18 P0, 7 P1)
- **Red phase:** verified — both suites fail (module-not-found), 408 existing tests pass
- **Automate validation:** `loading.test.tsx` added (3 tests) — AC-2 coverage gap found and expanded. See `automate-validation-report-2-4.md`.
- **Lint:** 0 errors, 9 pre-existing warnings

### Next Recommended Workflow
`dev-story` — implement Story 2.4 (Tasks 1-6). Tests turn green as each task lands. `automate` comes after implementation if coverage expansion is needed.





