---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04c-aggregate
lastStep: step-04c-aggregate
lastSaved: '2026-07-12'
workflowType: testarch-atdd
storyId: '4.2'
storyKey: 4-2-provision-the-railway-project-with-postgres-for-apps-agent-be
storyFile: _bmad-output/implementation-artifacts/4-2-provision-the-railway-project-with-postgres-for-apps-agent-be.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-4-2-provision-the-railway-project-with-postgres-for-apps-agent-be.md
generatedTestFiles:
  - apps/agent-be/test/integration/railway-project-structure.integration.spec.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/4-2-provision-the-railway-project-with-postgres-for-apps-agent-be.md
  - _bmad-output/project-context.md
  - _bmad-output/decision-policy.md
  - apps/agent-be/jest.config.ts
  - apps/agent-be/test/jest-integration.config.ts
  - apps/agent-be/project.json
  - _bmad-output/test-artifacts/atdd-checklist-4-1-provision-the-vercel-project-for-apps-web.md
---

# ATDD Checklist - Epic 4, Story 4.2: Provision the Railway Project with Postgres for `apps/agent-be`

**Date:** 2026-07-12
**Author:** Marius
**Primary Test Level:** Integration (Railway API verification)

---

## Story Summary

Provision a single Railway project containing both the `apps/agent-be` service and a Postgres instance, so that the backend and its database share operational lifecycle per architecture.

**As a** platform operator
**I want** a single Railway project containing both the `apps/agent-be` service and a Postgres instance
**So that** the backend and its database share operational lifecycle per architecture

---

## Acceptance Criteria

1. **AC-1 (Project contains Postgres and agent-be service shell):** Given a Railway account, When the project is created, Then it contains a Postgres addon/service and a service shell for `apps/agent-be` (Docker-based, pending Story 4.3's Dockerfile).
2. **AC-2 (DATABASE_URL available):** Given the Postgres service, When it is provisioned, Then a `DATABASE_URL` connection string is available for Story 4.4 and Story 4.5.

---

## Story Integration Metadata

- **Story ID:** `4.2`
- **Story Key:** `4-2-provision-the-railway-project-with-postgres-for-apps-agent-be`
- **Story File:** `_bmad-output/implementation-artifacts/4-2-provision-the-railway-project-with-postgres-for-apps-agent-be.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-4-2-provision-the-railway-project-with-postgres-for-apps-agent-be.md`
- **Generated Test Files:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

---

## Pre-Existing DP-5 Decision — Overridden

The story's Dev Notes contained a DP-5 decision: "Do NOT create ATDD unit tests for this story." The user explicitly requested test creation, overriding that decision. The original rationale (no committed files to validate) is valid for unit-level config-file tests, but integration-level tests that verify the provisioned Railway project structure via the GraphQL API are meaningful and directly exercise both ACs. The DP-5 decision is amended below to reflect this.

---

## Active Tests

### Integration Tests (6 tests)

**File:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

All tests are active — the Railway project has been provisioned (Story 4.2 Tasks 1-6 complete) and `describe.skip()` markers have been removed.

The test file reads `RAILWAY_TOKEN` from `process.env` or `.env.local`, queries the Railway GraphQL API at `https://backboard.railway.com/graphql/v2`, and asserts the project structure and `DATABASE_URL` provisioning.

- **[P0] project named "bmad-easy" exists in the workspace**
  - **Status:** GREEN — project provisioned, test active and passing
  - **Verifies:** AC-1 (project exists in the correct workspace)

- **[P0] project contains at least two services**
  - **Status:** GREEN — project provisioned, test active and passing
  - **Verifies:** AC-1 (project has both Postgres and agent-be)

- **[P0] project contains a Postgres service**
  - **Status:** GREEN — project provisioned, test active and passing
  - **Verifies:** AC-1 (Postgres addon/service exists)

- **[P0] project contains an "agent-be" service**
  - **Status:** GREEN — project provisioned, test active and passing
  - **Verifies:** AC-1 (agent-be service shell exists)

- **[P1] agent-be service has rootDirectory set to "apps/agent-be"**
  - **Status:** GREEN — project provisioned, test active and passing
  - **Verifies:** AC-1 (monorepo root directory configured for Railway builds)

- **[P0] DATABASE_URL is provisioned on the Postgres service**
  - **Status:** GREEN — project provisioned, test active and passing
  - **Verifies:** AC-2 (DATABASE_URL connection string available)

---

## E2E Coverage — Deferred (with browser-level mock check)

### Browser-Level Mock Feasibility Check

Per the ATDD workflow requirement, before deferring E2E coverage, I verified whether any browser-level mock pattern can simulate the deferred ACs:

| AC | Deferred portion | Browser mock check | Verdict |
|---|---|---|---|
| AC-1 | Railway project creation via GraphQL API (`projectCreate` mutation) | Server-to-server API call. Playwright route interception only intercepts browser-initiated requests (`page.route`, `page.unroute`), not server-to-server calls. The Railway GraphQL API creates real external resources with side effects (project, services, volumes). | **No mock covers this** — defer |
| AC-1 | Postgres service provisioning via Railway CLI (`railway add --database postgres`) | CLI command executed in a terminal, not a browser. No browser interaction can trigger or verify CLI command execution. The CLI creates real infrastructure (Postgres container, volume, TCP proxy). | **No mock covers this** — defer |
| AC-1 | agent-be service shell creation via `serviceCreate` mutation | Server-to-server GraphQL mutation. Same as project creation — no browser involvement. | **No mock covers this** — defer |
| AC-1 | agent-be `rootDirectory` set via `serviceInstanceUpdate` mutation | Server-to-server GraphQL mutation updating service instance settings. No browser interaction. | **No mock covers this** — defer |
| AC-2 | `DATABASE_URL` auto-provisioned by Railway's Postgres template | Railway infrastructure outcome — the variable is provisioned by Railway's Postgres template internals. No browser interaction can verify infrastructure variable provisioning. | **No mock covers this** — defer |

**Conclusion:** No browser-level mock pattern can simulate any of the deferred ACs. All deferred portions involve server-to-server Railway API/CLI operations or infrastructure outcomes that are not browser-interactable. Playwright's `page.route()` can only intercept browser-initiated HTTP requests, and none of the Railway operations originate from a browser.

### Verification Method for Deferred ACs

The deferred ACs are verified via:
1. **Integration test scaffold** (this ATDD output): `railway-project-structure.integration.spec.ts` — queries the Railway GraphQL API (read-only) and asserts the project structure and `DATABASE_URL` provisioning. Activated by the dev after Tasks 1-6 complete.
2. **Operational verification** per the story's Tasks 4 and 6: the dev queries the project and confirms both services exist and `DATABASE_URL` is present.

The integration test is the automated equivalent of the manual verification described in Tasks 4 and 6.

---

## Regression Guard Check

Per the ATDD workflow requirement, I checked whether the story introduces code that executes external commands with user-controlled input:

- **Story tasks** describe `curl` commands and Railway CLI commands as operational steps executed manually by the dev. These are not code files being created or committed to the repo.
- **No source code files** are created by this story (confirmed in the story's File Structure Requirements: "Files to CREATE (NEW): None").
- **`RAILWAY_TOKEN`** is read from `.env.local` at runtime — never hardcoded in committed files.
- **No call sites** executing external commands with user-controlled input are introduced in production code.

**Conclusion:** No regression guards needed — the story does not introduce production code that executes external commands with user-controlled input. The `curl` commands in the tasks are operational steps, not committed code.

### Credential Isolation in Test Code

The integration test scaffold (`railway-project-structure.integration.spec.ts`) handles the `RAILWAY_TOKEN` with the following invariants:

- **No credential leak via command arguments:** The token is passed only in the `Authorization: Bearer` HTTP header of the `fetch` call, never in URL query strings, command arguments, or log output.
- **No credential leak via environment variables:** The token is read from `process.env.RAILWAY_TOKEN` or parsed from `.env.local` at runtime. It is not set as a process-level environment variable by the test.
- **No `DATABASE_URL` value logged:** The test asserts only the presence of the `DATABASE_URL` key in the variables response — it does not log or assert on the value (which contains the Postgres password).

---

## Data Factories Created

None — this story verifies external infrastructure state, not data-driven behavior.

---

## Fixtures Created

None — the test queries the Railway GraphQL API directly. No fixtures or mocks are needed — the test is an integration test that verifies real infrastructure state.

---

## Mock Requirements

None — the test makes real (read-only) API calls to the Railway GraphQL API. No external service mocking is needed.

---

## Required data-testid Attributes

None — this story has no UI components.

---

## Implementation Checklist

### Test: project named "bmad-easy" exists in the workspace

**File:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

**Tasks to make this test pass:**

- [x] Complete Story Task 1 (verify Railway API access and workspace)
- [x] Complete Story Task 2 (create the Railway project via GraphQL API)
- [x] `describe.skip` removed → `describe` in the test file
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure`
- [x] Test passes

### Test: project contains at least two services

**File:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

**Tasks to make this test pass:**

- [x] Complete Story Task 3 (add PostgreSQL service)
- [x] Complete Story Task 5 (create agent-be service shell)
- [x] `describe.skip` removed → `describe` in the test file
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure`
- [x] Test passes

### Test: project contains a Postgres service

**File:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

**Tasks to make this test pass:**

- [x] Complete Story Task 3 (add PostgreSQL service)
- [x] `describe.skip` removed → `describe` in the test file
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure`
- [x] Test passes

### Test: project contains an "agent-be" service

**File:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

**Tasks to make this test pass:**

- [x] Complete Story Task 5 (create agent-be service shell)
- [x] `describe.skip` removed → `describe` in the test file
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure`
- [x] Test passes

### Test: agent-be service has rootDirectory set to "apps/agent-be"

**File:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

**Tasks to make this test pass:**

- [x] Complete Story Task 5.3 (set rootDirectory via `serviceInstanceUpdate`)
- [x] `describe.skip` removed → `describe` in the test file
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure`
- [x] Test passes

### Test: DATABASE_URL is provisioned on the Postgres service

**File:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

**Tasks to make this test pass:**

- [x] Complete Story Task 3 (add PostgreSQL — auto-provisions `DATABASE_URL`)
- [x] Complete Story Task 4 (verify `DATABASE_URL` is provisioned)
- [x] `describe.skip` removed → `describe` in the test file
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure`
- [x] Test passes

---

## Running Tests

```bash
# Run the Railway project structure integration tests (all active)
yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure

# Run all agent-be integration tests
yarn nx test-integration agent-be

# Run all agent-be unit tests (unaffected by this story)
yarn nx test agent-be
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- Integration test written as red-phase scaffold with `describe.skip()` (subsequently activated)
- Test asserts expected Railway project structure (AC-1) and `DATABASE_URL` provisioning (AC-2)
- E2E deferral documented with browser-level mock feasibility check
- Regression guard check documented (none needed — no production code with external commands)
- Credential isolation invariants documented for the test code
- Implementation checklist maps each test to story tasks

**Verification:**

- Generated test is present; `describe.skip()` markers have been removed (all tests active)
- All 6 tests pass against the provisioned Railway project
- Tests fail cleanly (project not found, services not found) when run before implementation

---

### GREEN Phase (Complete)

1. **Complete Story Tasks 1-6** (provision Railway project, Postgres, agent-be service shell) — done
2. **Remove `describe.skip`** → `describe` in `railway-project-structure.integration.spec.ts` — done
3. **Run tests:** `yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure` — done
4. **Verify all tests pass** — done (6/6 passing)
5. **Proceed to Story Task 7** (record project details and clean up)

---

## Story Task Updates

The story's Tasks 1-7 are all operational provisioning steps (API calls, CLI commands). None of them instruct the dev to create test scaffolding — the tasks are implementation-focused (verify API access, create project, add Postgres, verify DATABASE_URL, create service shell, verify structure, record details). The dev completed Tasks 1-6, then removed `describe.skip` from the test file to verify the implementation. All 6 tests are now active and passing.

The story's Dev Notes contained a DP-5 decision ("Do NOT create ATDD unit tests for this story") and the ATDD Artifacts section stated "Unit tests: None." Both have been amended to reflect the created integration test scaffold (see story file updates below).

---

## Notes

- This story is an infrastructure provisioning story — it creates a Railway project and Postgres instance via the Railway GraphQL API and CLI. It commits no source code files to the repo (unlike Story 4.1 which committed `vercel.json`).
- The integration test follows the pattern established by the existing integration tests in `apps/agent-be/test/integration/` (e.g., `sandbox-lifecycle.integration.spec.ts`). It uses the separate Jest integration config (`test/jest-integration.config.ts`) and runs via `yarn nx test-integration agent-be`.
- The test reads `RAILWAY_TOKEN` from `process.env` or `.env.local` at runtime — never hardcodes the token value. This follows the project's token handling pattern (see project-context.md and Story 4.1's approach).
- The test uses `fetch` with `AbortSignal.timeout(10_000)` for Railway API calls, following the project's GitHub API call pattern (project-context.md: "Always set `AbortSignal.timeout(10_000)` on every `fetch()` call").
- The test asserts only the presence of `DATABASE_URL` — it does not log or assert on the value (which contains the Postgres password), following the story's security note: "Do NOT log the full `DATABASE_URL` connection string."
- The original DP-5 decision in the story's Dev Notes was reasonable for unit-level tests (no config file to validate), but the user's explicit request to create tests is satisfied by integration-level tests that verify the provisioned infrastructure via the Railway GraphQL API.

---

## Knowledge Base References Applied

- **test-quality.md** — Test design principles (one assertion per test, determinism, isolation)
- **test-levels-framework.md** — Test level selection (integration test for infrastructure verification, E2E deferred for external API operations)
- **test-healing-patterns.md** — Common failure patterns (project-not-found handled with descriptive error message in `beforeAll`)

See `tea-index.csv` for complete knowledge fragment mapping.

---

**Generated by BMad TEA Agent** - 2026-07-12
