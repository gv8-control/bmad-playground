---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04c-aggregate
lastStep: step-04c-aggregate
lastSaved: '2026-07-11'
workflowType: testarch-atdd
storyId: '4.1'
storyKey: 4-1-provision-the-vercel-project-for-apps-web
storyFile: _bmad-output/implementation-artifacts/4-1-provision-the-vercel-project-for-apps-web.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-4-1-provision-the-vercel-project-for-apps-web.md
generatedTestFiles:
  - apps/web/src/__tests__/vercel-config.spec.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/4-1-provision-the-vercel-project-for-apps-web.md
  - _bmad-output/project-context.md
  - _bmad-output/decision-policy.md
  - apps/web/jest.config.ts
  - apps/web/src/__tests__/tailwind-theme.spec.ts
  - apps/web/src/__tests__/workspace-build.exclusion.spec.ts
---

# ATDD Checklist - Epic 4, Story 4.1: Provision the Vercel Project for `apps/web`

**Date:** 2026-07-11
**Author:** Marius
**Primary Test Level:** Unit (config file validation)

---

## Story Summary

Provision a Vercel project for `apps/web` in the Nx monorepo, including a `vercel.json` configuration file, Vercel REST API project creation, a production build verification, and auto-deploy disabling.

**As a** platform operator
**I want** a Vercel project configured for `apps/web` in this Nx monorepo
**So that** the frontend has a deployable production target

---

## Acceptance Criteria

1. **AC-1:** Vercel project created with correct monorepo configuration — root directory set to `apps/web`, framework preset is Next.js, production build succeeds, install command runs `yarn install --immutable` at workspace root, build command includes `prisma generate` step before `nx build web`.
2. **AC-2:** Auto-deploy disabled — `git.deploymentEnabled: false` in `vercel.json` and/or no GitHub integration connected.
3. **AC-3:** Placeholder `*.vercel.app` production URL exists.

---

## Story Integration Metadata

- **Story ID:** `4.1`
- **Story Key:** `4-1-provision-the-vercel-project-for-apps-web`
- **Story File:** `_bmad-output/implementation-artifacts/4-1-provision-the-vercel-project-for-apps-web.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-4-1-provision-the-vercel-project-for-apps-web.md`
- **Generated Test Files:** `apps/web/src/__tests__/vercel-config.spec.ts`

---

## Red-Phase Test Scaffolds Created

### Unit Tests (8 tests)

**File:** `apps/web/src/__tests__/vercel-config.spec.ts` (97 lines)

All tests use `test.skip()` — TDD red phase. The dev activates them by removing `test.skip()` after creating `vercel.json`.

- **[P0] vercel.json exists at apps/web/vercel.json**
  - **Status:** RED — file does not exist yet
  - **Verifies:** AC-1 (file is at the correct path, inside Vercel's `rootDirectory`)

- **[P0] framework is set to "nextjs"**
  - **Status:** RED — file does not exist yet
  - **Verifies:** AC-1 (framework preset explicitly declared)

- **[P0] installCommand is "yarn install --immutable"**
  - **Status:** RED — file does not exist yet
  - **Verifies:** AC-1 (immutable installs at workspace root)

- **[P0] buildCommand includes database-schemas:generate**
  - **Status:** RED — file does not exist yet
  - **Verifies:** AC-1 (prisma generate step in build command)

- **[P0] buildCommand includes nx build web**
  - **Status:** RED — file does not exist yet
  - **Verifies:** AC-1 (Nx build target in build command)

- **[P1] buildCommand runs prisma generate before nx build web**
  - **Status:** RED — file does not exist yet
  - **Verifies:** AC-1 (ordering: generate before build)

- **[P0] git.deploymentEnabled is false**
  - **Status:** RED — file does not exist yet
  - **Verifies:** AC-2 (auto-deploy disabled via vercel.json)

- **[P1] $schema is present for IDE validation**
  - **Status:** RED — file does not exist yet
  - **Verifies:** AC-1 (schema reference for IDE validation)

---

## E2E Coverage — Deferred (with browser-level mock check)

### Browser-Level Mock Feasibility Check

Per the ATDD workflow requirement, before deferring E2E coverage, I verified whether any browser-level mock pattern can simulate the deferred ACs:

| AC | Deferred portion | Browser mock check | Verdict |
|---|---|---|---|
| AC-1 | Vercel project creation via REST API (`POST /v10/projects`) | Server-to-server API call. Playwright route interception only intercepts browser-initiated requests, not server-to-server calls. The Vercel API creates real external resources with side effects. | **No mock covers this** — defer |
| AC-1 | Production build succeeds on Vercel | Vercel build pipeline outcome. No browser interaction can verify build success. The build runs in Vercel's infrastructure, not in a browser. | **No mock covers this** — defer |
| AC-2 | No GitHub repo connected (Vercel API state) | Vercel project settings are external service state. A browser-level mock cannot verify external service configuration. | **No mock covers this** — defer |
| AC-3 | Placeholder `*.vercel.app` production URL exists | The URL is a Vercel API response field from project creation. A Playwright test could navigate to the URL and check HTTP 200, but that requires a live deployment — it's an integration with an external service, not a mock. | **No mock covers this** — defer |

**Conclusion:** No browser-level mock pattern can simulate any of the deferred ACs. All deferred portions involve external Vercel API state or infrastructure outcomes that are not browser-interactable.

### Verification Method for Deferred ACs

The deferred ACs are verified operationally per the story's Tasks 2-4:
- Task 2: Create Vercel project via REST API (AC-1, AC-3)
- Task 3: Trigger production deploy and verify build succeeds (AC-1, AC-3)
- Task 4: Verify auto-deploy is disabled (AC-2)

These are manual operational steps with external side effects (creating a Vercel project, triggering a deployment). Per the decision policy, these are "Irreversible or externally visible effects" that must be escalated — they are not automatable as tests.

---

## Regression Guard Check

Per the ATDD workflow requirement, I checked whether the story introduces code that executes external commands with user-controlled input:

- **`vercel.json`** is a static JSON configuration file. It contains no user-controlled input and does not execute commands.
- **Vercel API calls** (Tasks 2-4) are described as manual operational steps in the story, not as code files being created. The `VERCEL_TOKEN` is read from `.env.local` at runtime, not hardcoded.
- **No call sites** executing external commands with user-controlled input are introduced.

**Conclusion:** No regression guards needed — the story does not introduce code that executes external commands with user-controlled input.

---

## Data Factories Created

None — this story validates a static config file, not data-driven behavior.

---

## Fixtures Created

None — the test reads `vercel.json` directly from the filesystem.

---

## Mock Requirements

None — the test validates a local file, no external service mocking needed.

---

## Required data-testid Attributes

None — this story has no UI components.

---

## Implementation Checklist

### Test: vercel.json exists at apps/web/vercel.json

**File:** `apps/web/src/__tests__/vercel-config.spec.ts`

**Tasks to make this test pass:**

- [ ] Create `apps/web/vercel.json` (Story Task 1.1)
- [ ] Run test: `yarn nx test web -- --testPathPattern=vercel-config`
- [ ] Test passes (green phase)

### Test: framework is set to "nextjs"

**File:** `apps/web/src/__tests__/vercel-config.spec.ts`

**Tasks to make this test pass:**

- [ ] Set `framework: "nextjs"` in `vercel.json` (Story Task 1.2)
- [ ] Run test: `yarn nx test web -- --testPathPattern=vercel-config`
- [ ] Test passes (green phase)

### Test: installCommand is "yarn install --immutable"

**File:** `apps/web/src/__tests__/vercel-config.spec.ts`

**Tasks to make this test pass:**

- [ ] Set `installCommand: "yarn install --immutable"` in `vercel.json` (Story Task 1.3)
- [ ] Run test: `yarn nx test web -- --testPathPattern=vercel-config`
- [ ] Test passes (green phase)

### Test: buildCommand includes database-schemas:generate

**File:** `apps/web/src/__tests__/vercel-config.spec.ts`

**Tasks to make this test pass:**

- [ ] Set `buildCommand` to include `yarn nx run database-schemas:generate` (Story Task 1.4)
- [ ] Run test: `yarn nx test web -- --testPathPattern=vercel-config`
- [ ] Test passes (green phase)

### Test: buildCommand includes nx build web

**File:** `apps/web/src/__tests__/vercel-config.spec.ts`

**Tasks to make this test pass:**

- [ ] Set `buildCommand` to include `yarn nx build web` (Story Task 1.4)
- [ ] Run test: `yarn nx test web -- --testPathPattern=vercel-config`
- [ ] Test passes (green phase)

### Test: buildCommand runs prisma generate before nx build web

**File:** `apps/web/src/__tests__/vercel-config.spec.ts`

**Tasks to make this test pass:**

- [ ] Ensure `database-schemas:generate` appears before `nx build web` in `buildCommand` (Story Task 1.4)
- [ ] Run test: `yarn nx test web -- --testPathPattern=vercel-config`
- [ ] Test passes (green phase)

### Test: git.deploymentEnabled is false

**File:** `apps/web/src/__tests__/vercel-config.spec.ts`

**Tasks to make this test pass:**

- [ ] Set `git: { deploymentEnabled: false }` in `vercel.json` (Story Task 1.5)
- [ ] Run test: `yarn nx test web -- --testPathPattern=vercel-config`
- [ ] Test passes (green phase)

### Test: $schema is present for IDE validation

**File:** `apps/web/src/__tests__/vercel-config.spec.ts`

**Tasks to make this test pass:**

- [ ] Add `"$schema": "https://openapi.vercel.sh/vercel.json"` to `vercel.json` (Story Task 1.6)
- [ ] Run test: `yarn nx test web -- --testPathPattern=vercel-config`
- [ ] Test passes (green phase)

---

## Running Tests

```bash
# Run all vercel-config tests (all skipped in red phase)
yarn nx test web -- --testPathPattern=vercel-config

# Run all web tests
yarn nx test web

# Run with verbose output
yarn nx test web -- --verbose --testPathPattern=vercel-config
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- All tests written as red-phase scaffolds with `test.skip()`
- Tests assert expected `vercel.json` structure and content
- E2E deferral documented with browser-level mock feasibility check
- Regression guard check documented (none needed)
- Implementation checklist maps each test to story tasks

**Verification:**

- All generated tests are present and marked with `test.skip()`
- Activation guidance is clear: remove `test.skip()` after creating `vercel.json`
- Tests will fail cleanly (assertion failures, not crashes) when activated before implementation

---

### GREEN Phase (DEV Team - Next Steps)

1. **Create `apps/web/vercel.json`** per Story Task 1 (all subtasks 1.1-1.6)
2. **Remove `test.skip()`** from all tests in `vercel-config.spec.ts`
3. **Run tests:** `yarn nx test web -- --testPathPattern=vercel-config`
4. **Verify all tests pass** (green phase)
5. **Proceed to operational tasks** (Tasks 2-5: API creation, deploy, verification, commit)

---

## Story Task Updates

The story's Task 1 instructs the dev to create `vercel.json` with specific properties. The ATDD scaffolding (`vercel-config.spec.ts`) validates those same properties. No story tasks instruct the dev to create test scaffolding — the tasks are implementation-focused (create `vercel.json`, call APIs, verify, commit). Therefore, no task amendments are needed for scaffolding activation — the dev simply creates `vercel.json` per Task 1, then removes `test.skip()` from the test file to verify the implementation.

---

## Notes

- This story is an infrastructure/deployment story, similar to Story 1.1 (scaffold). The only testable code artifact is `apps/web/vercel.json` — a static JSON config file. The remaining tasks (Vercel API calls, deploy verification) are operational steps with external side effects.
- The test file follows the precedent set by `apps/web/src/__tests__/tailwind-theme.spec.ts` (config file structural validation) and `apps/web/src/__tests__/workspace-build.exclusion.spec.ts` (infrastructure smoke test).
- The `loadVercelConfig()` helper returns `{}` when the file doesn't exist, so activated tests fail with clean assertion messages (e.g., "expected undefined to be 'nextjs'") rather than throwing file-not-found errors.

---

## Knowledge Base References Applied

- **test-quality.md** — Test design principles (one assertion per test, determinism, isolation)
- **test-levels-framework.md** — Test level selection (unit test for config file validation, E2E deferred for external API operations)
- **test-healing-patterns.md** — Common failure patterns (file-not-found handled gracefully)

See `tea-index.csv` for complete knowledge fragment mapping.

---

**Generated by BMad TEA Agent** - 2026-07-11
