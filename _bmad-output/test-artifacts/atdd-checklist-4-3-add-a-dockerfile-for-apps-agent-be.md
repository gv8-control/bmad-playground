---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04c-aggregate
lastStep: step-04c-aggregate
lastSaved: '2026-07-12'
workflowType: testarch-atdd
storyId: '4.3'
storyKey: 4-3-add-a-dockerfile-for-apps-agent-be
storyFile: _bmad-output/implementation-artifacts/4-3-add-a-dockerfile-for-apps-agent-be.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-4-3-add-a-dockerfile-for-apps-agent-be.md
generatedTestFiles:
  - apps/agent-be/test/dockerfile.spec.ts
  - apps/agent-be/test/dockerignore.spec.ts
  - apps/agent-be/test/integration/railway-project-structure.integration.spec.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/4-3-add-a-dockerfile-for-apps-agent-be.md
  - _bmad-output/project-context.md
  - _bmad-output/decision-policy.md
  - apps/agent-be/jest.config.ts
  - apps/agent-be/test/jest-integration.config.ts
  - apps/agent-be/project.json
  - apps/agent-be/src/main.ts
  - apps/web/src/__tests__/vercel-config.spec.ts
  - apps/agent-be/test/integration/railway-project-structure.integration.spec.ts
  - _bmad-output/test-artifacts/atdd-checklist-4-1-provision-the-vercel-project-for-apps-web.md
  - _bmad-output/test-artifacts/atdd-checklist-4-2-provision-the-railway-project-with-postgres-for-apps-agent-be.md
---

# ATDD Checklist - Epic 4, Story 4.3: Add a Dockerfile for `apps/agent-be`

**Date:** 2026-07-12
**Author:** Marius
**Primary Test Level:** Unit (Dockerfile/.dockerignore structural validation) + Integration (Railway API verification)

---

## Story Summary

Create a production Dockerfile for `apps/agent-be` so that Railway can build and run it as a container, including multi-stage build, Corepack/Yarn activation, prisma generate before build, and a HEALTHCHECK instruction.

**As a** developer
**I want** a production Dockerfile for `apps/agent-be`
**So that** Railway can build and run it as a container

---

## Acceptance Criteria

1. **AC-1 (Multi-stage build with Corepack/Yarn):** Given the Nx monorepo, When the Dockerfile is authored, Then it performs a multi-stage build (install → `nx build agent-be` → slim runtime image) and exposes the port `apps/agent-be` listens on (`process.env.PORT`, defaulting to 3001). And the install stage activates Corepack and uses the Yarn version pinned in the root `package.json`'s `packageManager` field, with `.yarnrc.yml` (`nodeLinker: node-modules`) respected.
2. **AC-2 (Local health check passes):** Given the built image, When it runs locally against a local Postgres, Then `GET /health` responds successfully.
3. **AC-3 (Railway health check):** Given the built Docker image, When it runs on Railway, Then a `HEALTHCHECK` instruction (or Railway health-probe configuration) polls `GET /health` on a defined interval (default 30s) so Railway can detect and restart an unhealthy container automatically.
4. **AC-4 (Prisma generate before build):** Given the Dockerfile's build stage, When `nx build agent-be` is run, Then a `prisma generate` step (from `libs/database-schemas`) runs before the build, so the shared Prisma client is available at build time.

---

## Story Integration Metadata

- **Story ID:** `4.3`
- **Story Key:** `4-3-add-a-dockerfile-for-apps-agent-be`
- **Story File:** `_bmad-output/implementation-artifacts/4-3-add-a-dockerfile-for-apps-agent-be.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-4-3-add-a-dockerfile-for-apps-agent-be.md`
- **Generated Test Files:**
  - `apps/agent-be/test/dockerfile.spec.ts` (unit, active)
  - `apps/agent-be/test/dockerignore.spec.ts` (unit, active)
  - `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts` (integration, extended — 3 Story 4.3 tests active)

---

## Pre-Existing DP-5 Decision — Overridden

The story's Testing Approach section stated: "This story creates a Dockerfile and `.dockerignore` — neither is unit-testable. Verification is manual... No automated ATDD scaffolds are created for this story." The user explicitly requested test creation, overriding that decision.

The original rationale ("neither is unit-testable") is incorrect — the Dockerfile and `.dockerignore` are static text files whose structure can be validated identically to Story 4.1's `vercel.json` validation pattern (`apps/web/src/__tests__/vercel-config.spec.ts`). The Dockerfile's multi-stage structure, Corepack activation, prisma generate ordering, HEALTHCHECK instruction, EXPOSE, CMD, and absence of baked-in secrets are all statically assertable. The `.dockerignore`'s exclusion patterns (especially `.env*` for credential isolation) are statically assertable.

The DP-5 decision is amended below to reflect the created test scaffolds.

---

## Test Scaffolds (All Active)

### Unit Tests — Dockerfile (16 tests)

**File:** `apps/agent-be/test/dockerfile.spec.ts`

All tests are active — Dockerfile created and all tests pass.

#### File existence
- **[P0] Dockerfile exists at apps/agent-be/Dockerfile**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (file is at the correct path, with the app it builds)

#### AC-1: Multi-stage build
- **[P0] Dockerfile has an install stage (FROM ... AS install)**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (multi-stage build: install stage)

- **[P0] Dockerfile has a build stage (FROM ... AS build)**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (multi-stage build: build stage)

- **[P0] Dockerfile has a runtime stage (FROM ... AS runtime)**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (multi-stage build: runtime stage)

- **[P0] All stages use node:24-slim base image**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (Node 24 per `.nvmrc`, slim variant for musl compatibility)

#### AC-1: Corepack and Yarn
- **[P0] Install stage activates Corepack (RUN corepack enable)**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (Corepack activates Yarn 4.17.0 per `packageManager` field)

- **[P0] Install stage runs yarn install --immutable**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (immutable install at workspace root, matching local dev)

- **[P0] Runtime stage runs yarn install for production deps**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (production deps from generated `package.json`)

#### AC-4: Prisma generate before build
- **[P0] Build stage runs database-schemas:generate (prisma generate)**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-4 (prisma generate step in build stage)

- **[P0] Build stage runs nx build agent-be**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (Nx build target in build stage)

- **[P1] Prisma generate runs before nx build agent-be**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-4 (ordering: generate before build)

#### AC-1: Runtime image configuration
- **[P0] Dockerfile EXPOSEs port 3001**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (exposes the port agent-be listens on)

- **[P0] CMD is ["node", "main.js"]**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (entry point is the compiled `main.js`)

- **[P0] Runtime stage copies build output from build stage**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (COPY --from=build for build output)

#### AC-3: HEALTHCHECK instruction
- **[P0] HEALTHCHECK instruction is present**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-3 (HEALTHCHECK instruction in Dockerfile)

- **[P0] HEALTHCHECK polls /health (not /api/health)**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-3 (health endpoint at root, excluded from `/api` prefix)

- **[P0] HEALTHCHECK interval is 30s**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-3 (default 30s interval per AC)

- **[P0] HEALTHCHECK uses Node.js (no curl install)**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-3 (Node.js one-liner, no `curl` in `node:24-slim`)

#### Credential isolation — no secrets baked into image
- **[P0] No secret ARG directives in Dockerfile**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 / DP-5 (no `ARG ANTHROPIC_API_KEY`, `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK`, `AUTH_SECRET`, etc.)

- **[P0] No secret ENV directives in Dockerfile**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 / DP-5 (no `ENV <secret>=` directives)

---

### Unit Tests — .dockerignore (14 tests)

**File:** `apps/agent-be/test/dockerignore.spec.ts`

All tests are active — `.dockerignore` created and all tests pass.

#### File existence
- **[P0] .dockerignore exists at repo root**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (`.dockerignore` at repo root, same level as build context)

#### Credential isolation — secrets excluded from build context
- **[P0] .dockerignore excludes .env files**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (`.env*` excluded — secrets must never enter Docker build context)

#### Build artifacts excluded
- **[P0] .dockerignore excludes node_modules/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (avoids copying GBs of `node_modules` into build context)

- **[P0] .dockerignore excludes .git/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (git history not needed in Docker build)

- **[P0] .dockerignore excludes dist/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (build output not needed — Dockerfile produces its own)

- **[P0] .dockerignore excludes .nx/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (Nx cache not needed in build)

- **[P0] .dockerignore excludes .next/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (Next.js build output not needed for agent-be)

- **[P0] .dockerignore excludes out/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (generic build output not needed)

#### Generated code excluded
- **[P0] .dockerignore excludes libs/database-schemas/src/generated/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (Prisma generated client is a build artifact — Dockerfile runs `prisma generate` itself)

#### Test artifacts excluded
- **[P0] .dockerignore excludes playwright-report/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (test reports not needed in production image)

- **[P0] .dockerignore excludes test-results/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (test results not needed in production image)

#### Deployment config excluded
- **[P0] .dockerignore excludes .vercel/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (Vercel config not needed for agent-be build)

- **[P0] .dockerignore excludes .railway/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (Railway config not needed in image)

#### BMAD and docs excluded
- **[P0] .dockerignore excludes .claude/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (Claude config not needed in production image)

- **[P0] .dockerignore excludes _bmad-output/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (BMAD artifacts not needed in production image)

- **[P0] .dockerignore excludes docs/**
  - **Status:** GREEN — file exists, test active and passing
  - **Verifies:** AC-1 (documentation not needed in production image)

---

### Integration Tests — Railway configuration (3 tests, all active)

**File:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

Extended from Story 4.2. All 3 Story 4.3 tests are active — Railway configured with rootDirectory `.`, RAILWAY_DOCKERFILE_PATH, and healthcheckPath `/health`.

- **[P1] agent-be service has rootDirectory set to "." (monorepo root)** — UPDATED (was `apps/agent-be`)
  - **Status:** GREEN — rootDirectory changed to `.`, test active and passing
  - **Verifies:** AC-1 (monorepo root as build context for Dockerfile)

- **[P0] RAILWAY_DOCKERFILE_PATH is set to "apps/agent-be/Dockerfile"** — NEW
  - **Status:** GREEN — variable set, test active and passing
  - **Verifies:** AC-1 (Railway finds Dockerfile at custom path)

- **[P1] healthcheckPath is set to "/health"** — NEW
  - **Status:** GREEN — healthcheckPath set, test active and passing
  - **Verifies:** AC-3 (Railway-level health probe complements Dockerfile HEALTHCHECK)

---

## E2E Coverage — Deferred (with browser-level mock check)

### Browser-Level Mock Feasibility Check

Per the ATDD workflow requirement, before deferring E2E coverage, I verified whether any browser-level mock pattern can simulate the deferred ACs:

| AC | Deferred portion | Browser mock check | Verdict |
|---|---|---|---|
| AC-2 | Docker image build (`docker build -f apps/agent-be/Dockerfile`) | Docker daemon operation. Playwright route interception only intercepts browser-initiated HTTP requests, not Docker daemon CLI commands. The Docker build creates a real container image with layers, filesystem, and metadata. | **No mock covers this** — defer |
| AC-2 | Docker container run (`docker run -e DATABASE_URL=... agent-be:test`) | Docker daemon operation. Running a container creates a real process with network namespace, filesystem, and env vars. No browser interaction can trigger or verify container execution. | **No mock covers this** — defer |
| AC-2 | `GET /health` responds 200 from running container | An HTTP request to `localhost:3001/health` could be intercepted by Playwright, but the container must be running first (Docker daemon operation). Without a running container, there's no server to intercept. | **No mock covers this** — defer |
| AC-3 | Railway deploy and health check | Server-to-server Railway API operation. Railway builds the Docker image in its infrastructure, runs it, and polls the health endpoint. No browser interaction can trigger or verify Railway's build/deploy pipeline. | **No mock covers this** — defer |
| AC-3 | Railway dashboard shows healthy status | Railway infrastructure state. A browser could navigate to the Railway dashboard, but that requires Railway authentication and verifies external service state, not a mock. | **No mock covers this** — defer |

**Conclusion:** No browser-level mock pattern can simulate any of the deferred ACs. All deferred portions involve Docker daemon operations or Railway infrastructure outcomes that are not browser-interactable. Playwright's `page.route()` can only intercept browser-initiated HTTP requests, and none of the Docker/Railway operations originate from a browser.

### Verification Method for Deferred ACs

The deferred ACs are verified via:
1. **Unit test scaffolds** (this ATDD output): `dockerfile.spec.ts` validates the Dockerfile structure including HEALTHCHECK (AC-3), and `dockerignore.spec.ts` validates the `.dockerignore` (AC-1). These are statically assertable without Docker.
2. **Integration test scaffold** (this ATDD output): `railway-project-structure.integration.spec.ts` validates the Railway configuration changes (rootDirectory, RAILWAY_DOCKERFILE_PATH, healthcheckPath).
3. **Operational verification** per the story's Tasks 4 and 5: the dev builds the image locally, runs it against a local Postgres, and asserts `GET /health` responds 200 (AC-2). Then triggers a Railway deploy and verifies the build succeeds and health check passes (AC-3).

---

## Regression Guard Check

Per the ATDD workflow requirement, I checked whether the story introduces code that executes external commands with user-controlled input:

- **Dockerfile** contains build commands (`yarn install`, `nx build agent-be`, `prisma generate`, `node main.js`). These commands do not take user-controlled input — they operate on the monorepo source code and build artifacts. The `yarn install` reads `package.json`/`yarn.lock` (committed files, not user input). The `nx build` reads project configuration (committed files). The `node main.js` starts the NestJS server which reads env vars at runtime (set by Railway, not user-controlled).
- **`.dockerignore`** is a static text file. It contains no executable code and does not execute commands.
- **HEALTHCHECK** runs a Node.js one-liner that reads `process.env.PORT` (set by Railway automatically, not user-controlled) and makes an HTTP GET to `localhost`. No user-controlled input.
- **Railway API calls** (Tasks 3.1-3.3) are described as manual operational steps in the story, not as code files being created. The `RAILWAY_TOKEN` is read from `.env.local` at runtime, not hardcoded.

**Conclusion:** No regression guards needed for external command execution with user-controlled input — the story does not introduce production code that executes external commands with user-controlled input.

### Credential Isolation Invariants (Applied)

Although no external-command call sites are introduced, the Dockerfile and `.dockerignore` are security boundaries for credential isolation. The following regression guards are applied:

1. **Dockerfile — no secrets baked into image:** Two tests assert ABSENCE of secret `ARG` and `ENV` directives for all known secret env vars (`ANTHROPIC_API_KEY`, `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `DAYTONA_API_KEY`, `DAYTONA_API_URL`, `RAILWAY_TOKEN`). This is the credential-isolation invariant — no credentials leak via Dockerfile instructions.

2. **.dockerignore — .env files excluded:** One test asserts `.env` files are excluded from the Docker build context. This is the credential-isolation invariant — no credentials leak via the build context.

3. **Railway integration test — secret-aware assertions:** The `RAILWAY_DOCKERFILE_PATH` test uses `Object.keys(vars).toContain('RAILWAY_DOCKERFILE_PATH')` instead of `toHaveProperty()` to avoid dumping the full variables object (which may contain `DATABASE_URL` with password) on assertion failure. Follows the project-context.md secret-aware assertion rule.

**Input-injection invariants:** Not applicable — no call sites execute external commands with user-controlled input. The Dockerfile commands operate on committed source files, not user input.

---

## Data Factories Created

None — this story validates static infrastructure files (Dockerfile, .dockerignore) and Railway API state, not data-driven behavior.

---

## Fixtures Created

None — the tests read the Dockerfile and `.dockerignore` directly from the filesystem. No fixtures or mocks are needed.

---

## Mock Requirements

None — the unit tests validate local files. The integration test makes real (read-only) API calls to the Railway GraphQL API.

---

## Required data-testid Attributes

None — this story has no UI components.

---

## Implementation Checklist

### Test: Dockerfile exists at apps/agent-be/Dockerfile

**File:** `apps/agent-be/test/dockerfile.spec.ts`

**Tasks to make this test pass:**

- [x] Create `apps/agent-be/Dockerfile` (Story Task 2.1)
- [x] Remove `test.skip()` from the "file existence" describe block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=dockerfile`
- [x] Test passes

### Test: Dockerfile has install/build/runtime stages

**File:** `apps/agent-be/test/dockerfile.spec.ts`

**Tasks to make these tests pass:**

- [x] Create the three-stage Dockerfile (Story Task 2.2-2.4)
- [x] Remove `test.skip()` from the "multi-stage build" describe block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=dockerfile`
- [x] Tests pass

### Test: Corepack and Yarn activation

**File:** `apps/agent-be/test/dockerfile.spec.ts`

**Tasks to make these tests pass:**

- [x] Add `RUN corepack enable` and `yarn install --immutable` to install stage (Story Task 2.2)
- [x] Add `yarn install` to runtime stage (Story Task 2.4)
- [x] Remove `test.skip()` from the "Corepack and Yarn" describe block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=dockerfile`
- [x] Tests pass

### Test: Prisma generate before build

**File:** `apps/agent-be/test/dockerfile.spec.ts`

**Tasks to make these tests pass:**

- [x] Add `yarn nx run database-schemas:generate` and `yarn nx build agent-be` to build stage (Story Task 2.3)
- [x] Remove `test.skip()` from the "prisma generate before build" describe block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=dockerfile`
- [x] Tests pass

### Test: Runtime image configuration (EXPOSE, CMD, COPY)

**File:** `apps/agent-be/test/dockerfile.spec.ts`

**Tasks to make these tests pass:**

- [x] Add `EXPOSE 3001`, `CMD ["node", "main.js"]`, and `COPY --from=build` to runtime stage (Story Task 2.4)
- [x] Remove `test.skip()` from the "runtime image configuration" describe block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=dockerfile`
- [x] Tests pass

### Test: HEALTHCHECK instruction

**File:** `apps/agent-be/test/dockerfile.spec.ts`

**Tasks to make these tests pass:**

- [x] Add HEALTHCHECK instruction to runtime stage (Story Task 2.5)
- [x] Remove `test.skip()` from the "HEALTHCHECK instruction" describe block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=dockerfile`
- [x] Tests pass

### Test: No secrets baked into Dockerfile

**File:** `apps/agent-be/test/dockerfile.spec.ts`

**Tasks to make these tests pass:**

- [x] Ensure no `ARG` or `ENV` directives with secret names in Dockerfile (Story Decision DP-5)
- [x] Remove `test.skip()` from the "credential isolation" describe block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=dockerfile`
- [x] Tests pass

### Test: .dockerignore exists and excludes required patterns

**File:** `apps/agent-be/test/dockerignore.spec.ts`

**Tasks to make these tests pass:**

- [x] Create `.dockerignore` at repo root (Story Task 1.1)
- [x] Remove `test.skip()` from all describe blocks in `dockerignore.spec.ts`
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=dockerignore`
- [x] Tests pass

### Test: rootDirectory set to "." (monorepo root)

**File:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

**Tasks to make this test pass:**

- [x] Complete Story Task 3.1 (change rootDirectory from `apps/agent-be` to `.` via `serviceInstanceUpdate`)
- [x] Remove `it.skip()` → `it` for the rootDirectory test
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPatterns=railway-project-structure`
- [x] Test passes

### Test: RAILWAY_DOCKERFILE_PATH set to "apps/agent-be/Dockerfile"

**File:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

**Tasks to make this test pass:**

- [x] Complete Story Task 3.2 (set `RAILWAY_DOCKERFILE_PATH` via `variableCollectionUpsert`)
- [x] Remove `it.skip()` → `it` for the RAILWAY_DOCKERFILE_PATH test
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPatterns=railway-project-structure`
- [x] Test passes

### Test: healthcheckPath set to "/health"

**File:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`

**Tasks to make this test pass:**

- [x] Complete Story Task 3.3 (set `healthcheckPath` via `serviceInstanceUpdate`)
- [x] Remove `it.skip()` → `it` for the healthcheckPath test
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPatterns=railway-project-structure`
- [x] Test passes

---

## Running Tests

```bash
# Run Dockerfile unit tests (all active)
yarn nx test agent-be -- --testPathPattern=dockerfile

# Run .dockerignore unit tests (all active)
yarn nx test agent-be -- --testPathPattern=dockerignore

# Run Railway integration tests (all active)
yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure

# Run all agent-be unit tests
yarn nx test agent-be

# Run all agent-be integration tests
yarn nx test-integration agent-be
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- Unit test scaffolds written with `test.skip()` for Dockerfile (16 tests) and .dockerignore (14 tests)
- Integration test extended: existing rootDirectory test updated to expect `.` and skipped; 2 new skipped tests added for `RAILWAY_DOCKERFILE_PATH` and `healthcheckPath`
- E2E deferral documented with browser-level mock feasibility check
- Regression guard check documented (no external-command call sites; credential isolation invariants applied to Dockerfile and .dockerignore)
- Implementation checklist maps each test to story tasks

**Verification:**

- All generated unit tests are present; `test.skip()` markers have been removed (all tests active)
- Integration tests: existing tests remain active (from Story 4.2); rootDirectory test updated and activated; 2 new tests activated
- Tests fail cleanly (assertion failures, not crashes) when activated before implementation
- All tests pass after implementation

---

### GREEN Phase (Complete)

1. **Created `.dockerignore`** per Story Task 1 (all subtasks 1.1-1.2)
2. **Created `apps/agent-be/Dockerfile`** per Story Task 2 (all subtasks 2.1-2.6)
3. **Removed `test.skip()`** from all tests in `dockerfile.spec.ts` and `dockerignore.spec.ts`
4. **Ran unit tests:** `yarn nx test agent-be -- --testPathPattern=dockerfile` and `--testPathPattern=dockerignore`
5. **Verified all unit tests pass**
6. **Configured Railway** per Story Task 3 (subtasks 3.1-3.3: rootDirectory, RAILWAY_DOCKERFILE_PATH, healthcheckPath)
7. **Removed `it.skip()`** from the 3 integration tests in `railway-project-structure.integration.spec.ts`
8. **Ran integration tests:** `yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure`
9. **Verified integration tests pass**
10. **Proceeded to operational verification** (Tasks 4-5: local Docker build, Railway deploy)

---

## Story Task Updates

The story's Testing Approach section stated "No automated ATDD scaffolds are created for this story" and "The existing Story 4.2 integration test (`railway-project-structure.integration.spec.ts`) already verifies the Railway project structure; it does not need extension for this story." Both have been amended to reflect the created test scaffolds (see story file updates below).

The story's Tasks 1-2 instruct the dev to create `.dockerignore` and `Dockerfile`. The ATDD scaffolding (`dockerfile.spec.ts`, `dockerignore.spec.ts`) validates those same files. No story tasks instruct the dev to create test scaffolding — the tasks are implementation-focused (create files, configure Railway, verify). Therefore, no task amendments are needed for scaffolding activation — the dev creates the files per Tasks 1-2, configures Railway per Task 3, then removes `test.skip()` from the test files to verify the implementation.

The story's Task 3 instructs the dev to configure Railway (rootDirectory, RAILWAY_DOCKERFILE_PATH, healthcheckPath). The integration test scaffolding validates those same configuration changes. The dev configures Railway per Task 3, then removes `it.skip()` from the 3 integration tests to verify.

---

## Decisions (per decision-policy.md)

**Decision (DP-4):** The story's Testing Approach section stated "neither is unit-testable" for the Dockerfile and `.dockerignore`. This is incorrect — both are static text files whose structure can be validated identically to Story 4.1's `vercel.json` validation pattern. The user's explicit request to create tests overrides the story's DP-5 "no tests" decision. Test-only changes with no production behavior change — DP-4 applies.

**Decision (DP-3):** Test files placed at `apps/agent-be/test/dockerfile.spec.ts` and `apps/agent-be/test/dockerignore.spec.ts` — follows the existing `test/` directory pattern for non-source specs (precedent: `test/sdk-contract-replay.spec.ts`). Simplest location that's included in `tsconfig.spec.json` and matched by the jest config.

**Decision (DP-3):** Existing rootDirectory test updated in-place rather than adding a duplicate test — simpler, avoids two tests asserting the same field with different expectations.

**Decision (DP-3):** Secret-aware assertions in the Railway integration test use `Object.keys(vars).toContain()` instead of `toHaveProperty()` — follows the project-context.md rule to avoid dumping secret-bearing objects on assertion failure.

---

## Notes

- This story is an infrastructure/deployment story, similar to Story 4.1 (Vercel) and Story 4.2 (Railway). The testable code artifacts are `apps/agent-be/Dockerfile` (a text file with Docker build instructions) and `.dockerignore` (a text file with ignore patterns). The remaining tasks (Docker build, Railway deploy) are operational steps with external side effects.
- The unit test files follow the precedent set by `apps/web/src/__tests__/vercel-config.spec.ts` (Story 4.1 — config file structural validation). The `loadDockerfile()` and `loadDockerignore()` helpers return empty strings when the file doesn't exist, so activated tests fail with clean assertion messages rather than throwing file-not-found errors.
- The integration test extension follows the pattern established by the existing `railway-project-structure.integration.spec.ts` (Story 4.2). It uses the same `railwayGraphQL()` helper, `getRailwayToken()` pattern, and `AbortSignal.timeout(10_000)` on all API calls.
- The existing rootDirectory test (Story 4.2) asserted `apps/agent-be`. Story 4.3 Task 3.1 changes it to `.`. The test has been updated to expect `.` and activated — it passes after the dev changed the rootDirectory.
- The `RAILWAY_DOCKERFILE_PATH` test uses `Object.keys(vars).toContain('RAILWAY_DOCKERFILE_PATH')` instead of `expect(vars).toHaveProperty('RAILWAY_DOCKERFILE_PATH')` to avoid dumping the full variables object (which may contain `DATABASE_URL` with password) on assertion failure — follows the project-context.md secret-aware assertion rule.

---

## Knowledge Base References Applied

- **test-quality.md** — Test design principles (one assertion per test, determinism, isolation)
- **test-levels-framework.md** — Test level selection (unit test for config file validation, integration test for Railway API verification, E2E deferred for Docker/Railway operations)
- **test-healing-patterns.md** — Common failure patterns (file-not-found handled gracefully with empty-string return)

See `tea-index.csv` for complete knowledge fragment mapping.

---

**Generated by BMad TEA Agent** - 2026-07-12
