---
baseline_commit: 7bf051eb8ae7389bc73bbce24b8067f62ab58ab4
---

# Story 4.2: Provision the Railway Project with Postgres for `apps/agent-be`

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the platform operator,
I want a single Railway project containing both the `apps/agent-be` service and a Postgres instance,
so that the backend and its database share operational lifecycle per architecture.

## Acceptance Criteria

1. **AC-1 (Project contains Postgres and agent-be service shell):** Given a Railway account, When the project is created, Then it contains a Postgres addon/service and a service shell for `apps/agent-be` (Docker-based, pending Story 4.3's Dockerfile).

2. **AC-2 (DATABASE_URL available):** Given the Postgres service, When it is provisioned, Then a `DATABASE_URL` connection string is available for Story 4.4 and Story 4.5.

## Tasks / Subtasks

- [x] **Task 1: Verify Railway API access and workspace** (AC: #1)
  - [x] 1.1 Read `RAILWAY_TOKEN` from `.env.local` (value starts with `d49618b7`)
  - [x] 1.2 Test API connectivity: `curl -s -X POST https://backboard.railway.com/graphql/v2 -H "Authorization: Bearer $RAILWAY_TOKEN" -H "Content-Type: application/json" -d '{"query":"query { me { name email } }"}'` — expect HTTP 200 with email `marius.dras@gmail.com`
  - [x] 1.3 Verify workspace: query `workspace(workspaceId: "a1f06762-5fbd-431e-811f-5183b80576e5")` — expect name `marius321967's Projects`
  - [x] 1.4 Check for existing projects: query `projects(workspaceId: "a1f06762-5fbd-431e-811f-5183b80576e5")` — expect empty list (no existing `bmad-easy` project). If a project named `bmad-easy` already exists, skip Task 2 and use the existing project ID

- [x] **Task 2: Create the Railway project via GraphQL API** (AC: #1)
  - [x] 2.1 Call `projectCreate` mutation:
    ```bash
    curl -s -X POST https://backboard.railway.com/graphql/v2 \
      -H "Authorization: Bearer $RAILWAY_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"query":"mutation { projectCreate(input: { name: \"bmad-easy\", description: \"bmad-easy platform — agent-be + Postgres\", workspaceId: \"a1f06762-5fbd-431e-811f-5183b80576e5\", defaultEnvironmentName: \"production\" }) { id name } }"}'
    ```
  - [x] 2.2 Record the project ID from the response
  - [x] 2.3 Query the project to get the default environment ID:
    ```bash
    curl -s -X POST https://backboard.railway.com/graphql/v2 \
      -H "Authorization: Bearer $RAILWAY_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"query":"query { project(id: \"<PROJECT_ID>\") { id name environments { edges { node { id name } } } } }"}'
    ```
  - [x] 2.4 Record the environment ID (the `production` environment) from the response — needed for Task 4 and Task 5

- [x] **Task 3: Add a PostgreSQL service to the project** (AC: #1, #2)
  - [x] 3.1 Install the Railway CLI: `npm i -g @railway/cli` (requires Node.js 16+; the environment has Node.js 24 per `.nvmrc`). Alternatively use `bash <(curl -fsSL railway.com/install.sh)`
  - [x] 3.2 Link the CLI to the project: `railway link --project <PROJECT_ID>` (or `railway link` interactive). The CLI reads `RAILWAY_TOKEN` from the environment for authentication
  - [x] 3.3 Add PostgreSQL: `railway add --database postgres -e production` — this creates a service from Railway's SSL-enabled Postgres image, auto-provisions a volume for data persistence, and auto-provisions the `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` environment variables
  - [x] 3.4 **Alternative (GraphQL API only, if CLI is unavailable):** Create the Postgres service via `serviceCreate` mutation with `source: { image: "ghcr.io/railwayapp-templates/postgres-ssl:latest" }`, then create a volume via `volumeCreate`, then verify whether `DATABASE_URL` is auto-provisioned. If not auto-provisioned, query the service variables and manually construct `DATABASE_URL` from `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`
  - [x] 3.5 Record the Postgres service ID from the CLI output or by querying `project(id: ...)` and inspecting `services`

- [x] **Task 4: Verify DATABASE_URL is provisioned** (AC: #2)
  - [x] 4.1 Wait for the Postgres service to finish deploying (initial deploy takes ~30-60s). Poll via CLI: `railway status` or via API: query `serviceInstance(serviceId: ..., environmentId: ...)` and check `latestDeployment.status` is `SUCCESS`
  - [x] 4.2 List variables on the Postgres service:
    ```bash
    curl -s -X POST https://backboard.railway.com/graphql/v2 \
      -H "Authorization: Bearer $RAILWAY_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"query":"query { variables(projectId: \"<PROJECT_ID>\", environmentId: \"<ENV_ID>\", serviceId: \"<POSTGRES_SERVICE_ID>\") }"}'
    ```
  - [x] 4.3 Confirm `DATABASE_URL` is present in the response. The format is `postgresql://postgres:<password>@<host>.railway.app:<port>/railway` (or similar). **Do NOT log the full connection string** — record only that it exists and note the host:port for Story 4.4's database confirmation step
  - [x] 4.4 If `DATABASE_URL` is NOT auto-provisioned (GraphQL API path), construct it from the individual `PG*` variables: `postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE` and set it as a variable on the Postgres service via `variableCollectionUpsert`

- [x] **Task 5: Create an empty service shell for `apps/agent-be`** (AC: #1)
  - [x] 5.1 Create the service via `serviceCreate` mutation (no source — empty shell pending Story 4.3's Dockerfile):
    ```bash
    curl -s -X POST https://backboard.railway.com/graphql/v2 \
      -H "Authorization: Bearer $RAILWAY_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"query":"mutation { serviceCreate(input: { projectId: \"<PROJECT_ID>\", name: \"agent-be\" }) { id name } }"}'
    ```
  - [x] 5.2 Record the agent-be service ID from the response
  - [x] 5.3 Set the root directory for the agent-be service (monorepo path):
    ```bash
    curl -s -X POST https://backboard.railway.com/graphql/v2 \
      -H "Authorization: Bearer $RAILWAY_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"query":"mutation { serviceInstanceUpdate(serviceId: \"<AGENT_BE_SERVICE_ID>\", environmentId: \"<ENV_ID>\", input: { rootDirectory: \"apps/agent-be\" }) }"}'
    ```

- [x] **Task 6: Verify the project structure** (AC: #1, #2)
  - [x] 6.1 Query the project and confirm both services exist:
    ```bash
    curl -s -X POST https://backboard.railway.com/graphql/v2 \
      -H "Authorization: Bearer $RAILWAY_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"query":"query { project(id: \"<PROJECT_ID>\") { id name services { edges { node { id name } } } environments { edges { node { id name } } } } }"}'
    ```
  - [x] 6.2 Confirm the response contains two services: one for Postgres and one named `agent-be`
  - [x] 6.3 Confirm `DATABASE_URL` is available (from Task 4)

- [x] **Task 7: Record project details and clean up** (AC: #1, #2)
  - [x] 7.1 Record in Completion Notes: project ID, project name, environment ID, Postgres service ID, agent-be service ID, and confirmation that `DATABASE_URL` is provisioned (host:port only, no credentials)
  - [x] 7.2 If the Railway CLI was installed and created a `.railway/` directory, add `.railway/` to `.gitignore` (or `apps/agent-be/.gitignore`) to prevent committing CLI linking state
  - [x] 7.3 Do NOT commit any other files — this story provisions infrastructure via API, no repo files are created (unlike Story 4.1 which committed `vercel.json`)

## Dev Notes

### Deferred Work Check

**Checked:** `_bmad-output/implementation-artifacts/deferred-work.md` was scanned for deferred findings matching file paths or components in scope for this story's code changes.

**Result: No deferred findings in scope.**

Story 4.2 is an infrastructure provisioning story — it creates a Railway project and Postgres instance via the Railway GraphQL API and CLI. It does NOT modify any source code files. The deferred items that mention Railway (deferred-work.md lines 211, 213, 220, 231, 244, 246, 285, 297-298, 302, 314, 378, 676, 680) are all architecture decisions and constraints documented in `architecture.md`, not deferred code issues matching file paths this story touches.

No deferred items reference Railway project provisioning, Railway GraphQL API, `DATABASE_URL` provisioning, or any files that Story 4.2 creates or modifies.

### Decisions (per decision-policy.md)

**Decision (DP-3):** Use the Railway GraphQL API (`POST https://backboard.railway.com/graphql/v2`) for project creation and agent-be service shell creation. The epics note (2026-07-11) confirms API automation is verified: "Project creation and deletion were confirmed via the Railway GraphQL API (`projectCreate` mutation requires `workspaceId`)." The API is scriptable, idempotent (can check if project exists before creating), and doesn't require installing the Railway CLI for project/service creation.

**Decision (DP-3):** Use the Railway CLI (`railway add --database postgres`) for PostgreSQL provisioning rather than creating a service from a Docker image via the GraphQL API. The CLI uses Railway's custom SSL-enabled Postgres template, which auto-provisions the `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` environment variables, creates a volume for data persistence, and enables TCP proxy. Creating a service from a plain `postgres:16-alpine` Docker image via the API may not trigger this auto-provisioning. The CLI is the simplest reliable path to satisfy AC-2. If the CLI cannot be installed, the GraphQL API path (Task 3.4) is the fallback.

**Decision (DP-3):** Do NOT create a `railway.toml` config file (unlike Story 4.1's `vercel.json`). Railway does not have a project-level config file equivalent to `vercel.json`. The `railway.toml` is per-service and optional — Railway auto-detects Dockerfiles. The agent-be service shell is empty (pending Story 4.3's Dockerfile), so there is nothing to configure. The root directory is set via the API (`serviceInstanceUpdate`). Creating a `railway.toml` now would be speculative configuration for a service that doesn't have a Dockerfile yet.

**Decision (DP-5) — amended by ATDD prepare-tests:** The original decision deferred all ATDD to Story 4.3 because no config file is committed. The user explicitly requested test creation, overriding the deferral. An integration test scaffold (`apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`) was created — it queries the Railway GraphQL API (read-only) and asserts the project structure (AC-1) and `DATABASE_URL` provisioning (AC-2). Unit-level config-file tests remain deferred to Story 4.3 (Dockerfile) since no config file is committed in this story. See `_bmad-output/test-artifacts/atdd-checklist-4-2-provision-the-railway-project-with-postgres-for-apps-agent-be.md` for the full ATDD checklist.

**Decision (DP-3):** API endpoint is `https://backboard.railway.com/graphql/v2` (official Railway docs). The epics note (2026-07-11) references `backboard.railway.app` — both domains respond, but `.com` is the current canonical endpoint per the official documentation. Verified: a `me` query with `RAILWAY_TOKEN` returns HTTP 200 with the user's email.

### Architecture Compliance

**Infrastructure & Deployment (architecture.md:282-290):**
- "`apps/agent-be`: Railway (Docker), same platform as the shared Postgres instance." ✓ This story provisions both the Railway project and Postgres instance.
- "CI/CD: deploy is a manual trigger, not automatic on merge." ✓ No GitHub repo is connected to the Railway project — deploys will be manual (Story 4.6 wires the CI deploy job).
- "Environments: production only for MVP, no separate staging." ✓ The project's default environment is named `production`.

**Deployment Structure (architecture.md:680):**
- "Railway builds `apps/agent-be`'s Dockerfile." ✓ The agent-be service shell is created with `rootDirectory: "apps/agent-be"` (set in Task 5.3). The Dockerfile itself is Story 4.3.
- "Both deploys are manually triggered, gated by the GitHub Actions lint/test workflow." ✓ No auto-deploy is configured; the CI deploy job is Story 4.6.

**Implementation Sequence (architecture.md:297-298):**
- Step 2: "Provision Railway Postgres; define the Prisma schema in `libs/database-schemas`; run initial migration." ✓ This story provisions Railway Postgres. Migrations are Story 4.4.
- Step 3: "Stand up `apps/agent-be` on Railway (Docker); wire the shared Prisma client." ✓ This story creates the agent-be service shell. The Dockerfile is Story 4.3.

**Database (architecture.md:244-248):**
- "PostgreSQL, Railway-hosted (single instance for MVP)." ✓ One Postgres service in the Railway project.
- "Connection limits: Railway's documented concurrent-connection ceiling is accepted as sufficient for MVP scale." ✓ No connection pooling configuration needed for this story.

### Library / Framework Requirements

- **Railway GraphQL API v2** — `POST https://backboard.railway.com/graphql/v2`. Auth: `Authorization: Bearer <token>`. Content-Type: `application/json`. Key mutations:
  - `projectCreate(input: { name, description, workspaceId, defaultEnvironmentName })` — creates a project in the specified workspace. Returns `{ id, name }`.
  - `serviceCreate(input: { projectId, name, source? })` — creates a service. `source` optional (empty shell if omitted). Returns `{ id, name }`.
  - `serviceInstanceUpdate(serviceId, environmentId, input: { rootDirectory, ... })` — updates service instance settings for a specific environment.
  - `variableCollectionUpsert(input: { projectId, environmentId, serviceId, variables })` — sets environment variables on a service.
  - `variables(projectId, environmentId, serviceId)` — query to list variables on a service.
  - `project(id)` — query to get project details including services and environments.
  - `workspace(workspaceId)` — query to verify workspace access.
- **Railway CLI** (`@railway/cli`) — used for PostgreSQL provisioning (`railway add --database postgres`). Reads `RAILWAY_TOKEN` from the environment for authentication. Install via `npm i -g @railway/cli`.
- **curl + jq** — available in the environment for GraphQL API calls and JSON parsing.

### File Structure Requirements

**Files to CREATE (NEW):**

| File | What it does |
|---|---|
| _None_ | This story provisions infrastructure via API — no repo files are created. The Railway project configuration is stored in Railway's infrastructure, not in the repo. |

**Files NOT to modify (preserved interactions — do NOT regress):**

| File | Why preserved |
|---|---|
| `apps/agent-be/src/main.ts` | Referenced for port info (`process.env.PORT || 3001`) but NOT modified. The service shell is empty — no code is deployed yet. |
| `.github/workflows/test.yml` | CI deploy job is Story 4.6, not this story. |
| `apps/web/vercel.json` | Story 4.1's Vercel config. Not related to Railway provisioning. |
| `libs/database-schemas/` | Prisma schema and migrations are Story 4.4. This story only provisions the Postgres instance. |
| `package.json` | No script changes needed. |

### Current State of Key Code (READ BEFORE IMPLEMENTING)

**`.env.local` — Railway token:**
`RAILWAY_TOKEN` is available in `.env.local` (value starts with `d49618b7`). This is an account/workspace-scoped token — verified by querying the `me` endpoint which returns the user's email. Do NOT hardcode the token value in any committed file — read it from `.env.local` at runtime.

Workspace ID: `a1f06762-5fbd-431e-811f-5183b80576e5` (name: `marius321967's Projects`) — from the epics note (2026-07-11), verified via API query.

**`apps/agent-be/src/main.ts` (31 lines) — port and health endpoint:**
```typescript
const port = process.env.PORT || 3001;
await app.listen(port);
```
Railway sets `PORT` automatically. The `GET /health` endpoint (excluded from the `/api` global prefix) is the health check target for Story 4.3's Dockerfile `HEALTHCHECK`. This story does NOT deploy any code — the service shell is empty.

**No existing Railway config files:** No `railway.toml`, `railway.json`, or `.railway/` directory exists in the repo (verified via glob search). Story 4.3 may create a `railway.toml` when the Dockerfile is added.

### Project Structure Notes

- The Railway project name should be `bmad-easy` (matching the Vercel project name from Story 4.1 and the `package.json` `name` field).
- The agent-be service's `rootDirectory` is set to `apps/agent-be` (matching the monorepo structure). Railway will look for a Dockerfile at `apps/agent-be/Dockerfile` when Story 4.3 deploys.
- The Postgres service does not need a `rootDirectory` — it's deployed from a Docker image, not from the repo.
- No `libs/` changes needed — this story provisions infrastructure only.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2] — Story definition and ACs (lines 964-980)
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment] — Railway hosting, manual deploy, production-only (lines 282-290)
- [Source: _bmad-output/planning-artifacts/architecture.md#Deployment Structure] — Railway builds agent-be's Dockerfile (line 680)
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Sequence] — Steps 2-3: provision Postgres, stand up agent-be (lines 297-298)
- [Source: _bmad-output/implementation-artifacts/4-1-provision-the-vercel-project-for-apps-web.md] — Previous story (Vercel provisioning pattern, DP-3 decisions, ATDD approach)
- [Source: apps/agent-be/src/main.ts] — Port and health endpoint (lines 21, 17-18)
- [Source: .env.local] — `RAILWAY_TOKEN` available (value not reproduced here — read from `.env.local` at runtime)
- [Source: https://docs.railway.app/integrations/api/manage-projects] — `projectCreate` mutation reference
- [Source: https://docs.railway.app/integrations/api/manage-services] — `serviceCreate`, `serviceInstanceUpdate` mutation reference
- [Source: https://docs.railway.app/integrations/api/api-cookbook] — `variables` query, `variableCollectionUpsert` mutation reference
- [Source: https://docs.railway.app/databases/postgresql] — PostgreSQL provisioning, auto-provisioned variables (`DATABASE_URL`, `PGHOST`, etc.)
- [Source: https://docs.railway.app/cli] — Railway CLI commands (`init`, `add --database postgres`, `link`)

### Previous Story Intelligence

This is the second story in Epic 4. The previous story (4.1: Provision the Vercel Project for `apps/web`) is complete. Key learnings from Story 4.1 that apply here:

- **API-first provisioning:** Story 4.1 used the Vercel REST API for project creation (confirmed working per the epics note). Story 4.2 follows the same pattern with the Railway GraphQL API.
- **DP-3 pattern:** Pick the simplest reversible option. For this story, that means using the Railway CLI for PostgreSQL provisioning (auto-provisions `DATABASE_URL`) and the GraphQL API for project/service creation.
- **Decision recording:** Record every autonomous decision in the Dev Notes with the DP reference. Story 4.1's decision log is the canonical pattern.
- **File preservation:** Explicitly list files NOT to modify and why. This prevents scope creep (DP-5).
- **Token handling:** Read tokens from `.env.local` at runtime — never hardcode in committed files.
- **Idempotency:** Check for existing projects before creating (Story 4.1 Task 2.3). If the project already exists, use the existing project ID.
- **ATDD approach:** Story 4.1 had ATDD tests for `vercel.json` (a committed config file). Story 4.2 commits no files, so unit-level config-file tests are deferred to Story 4.3 (DP-5). However, integration-level tests that verify the provisioned Railway project structure via the GraphQL API were created per the user's explicit request — see Decisions (DP-5 amended) and ATDD Artifacts.

### Git Intelligence

Recent commits (last 10):
```
7bf051e docs(epics): complete story 4.1 vercel project provisioning for apps-web
112b4fb chore(deploy): add vercel.json for apps/web project configuration
9ba1833 fix(web): resolve TypeScript strict error in AgentMessage extractText
2f52de6 Merge remote-tracking branch 'origin/main' into feat/epic-4
4cef645 Merge pull request #17 from gv8-control/fix/develop-epic-arg-passing
5d37e7d fix(pipeline): pass epic argument through to develop-epic webhook
968bb4a docs(epics): apply Epic 4 implementation readiness findings
b8cb9f5 fix(devcontainer): authenticate daytona cli during create (#15)
c9ef768 docs(epics): annotate Epic 4 stories with API automation verification and decisions
734bafd fix(devcontainer): make yarn install non-interactive (#14)
```

The `feat/epic-4` branch is being worked on. Story 4.1 (`vercel.json` provisioning) is complete and committed. The `docs(epics)` commits show Epic 4 stories were annotated with API automation verification — the epics file is up-to-date with the latest decisions.

### Latest Technical Information

- **Railway GraphQL API v2:** Endpoint `https://backboard.railway.com/graphql/v2`. Auth via `Authorization: Bearer <token>`. Supports introspection — use the [GraphiQL playground](https://railway.com/graphiql) to explore the schema and verify mutation signatures before executing them. The mutations in Tasks 2-5 are from the Railway docs but have not been tested against the live API — run a `me` query first to confirm auth, then verify each mutation's input fields and return type via introspection before relying on the exact shapes documented above. Rate limits: 1000 RPH (Hobby), 10 RPS.
- **Railway token types:** Account token (all resources), workspace token (single workspace), project token (single environment). The `RAILWAY_TOKEN` in `.env.local` is account/workspace-scoped — verified by the `me` query returning the user's email. Project tokens use the `Project-Access-Token` header (different from `Authorization: Bearer`).
- **Railway PostgreSQL template:** Deployed from Railway's SSL-enabled Postgres image ([github.com/railwayapp-templates/postgres-ssl](https://github.com/railwayapp-templates/postgres-ssl)). Auto-provisions: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `DATABASE_URL`. TCP proxy enabled by default (external access). Volume attached for data persistence.
- **Railway CLI:** Install via `npm i -g @railway/cli` (Node.js 16+). Reads `RAILWAY_TOKEN` for authentication. Key commands: `railway link` (link to project), `railway add --database postgres` (add PostgreSQL), `railway status` (project info), `railway variable list` (list variables).
- **Railway `serviceCreate` mutation:** Accepts `input: { projectId, name, source?: { repo | image } }`. If `source` is omitted, creates an empty service shell. The `source.image` field accepts Docker image URLs (e.g., `ghcr.io/railwayapp-templates/postgres-ssl:latest`).
- **Railway `serviceInstanceUpdate` mutation:** Accepts `input: { rootDirectory, buildCommand, startCommand, healthcheckPath, ... }`. Used to configure the monorepo root directory for the agent-be service.
- **Railway environments:** Every project has a default environment (named `production` in this story per the `defaultEnvironmentName` input). The environment ID is needed for `serviceInstanceUpdate` and `variables` queries — extract it from the `project(id: ...)` query response.

### Important Implementation Notes

1. **API endpoint URL:** Use `https://backboard.railway.com/graphql/v2` (official Railway docs). The epics note (2026-07-11) references `backboard.railway.app` — both domains respond, but `.com` is the canonical endpoint. Verified: a `me` query returns HTTP 200.

2. **Token scope:** The `RAILWAY_TOKEN` in `.env.local` is account/workspace-scoped (verified by the `me` query). It can create projects in the workspace `a1f06762-5fbd-431e-811f-5183b80576e5`. Do NOT confuse with project-scoped tokens (which use the `Project-Access-Token` header and cannot create projects).

3. **Idempotency:** If the Railway project already exists (e.g., from a previous attempt), `projectCreate` will return an error. Check for existing projects first via `projects(workspaceId: ...)` and filter by name `bmad-easy`. If it exists, use the existing project ID.

4. **PostgreSQL auto-provisioning:** The Railway CLI's `railway add --database postgres` command creates a service from Railway's SSL-enabled Postgres image and auto-provisions `DATABASE_URL` and other variables. If using the GraphQL API instead (`serviceCreate` with `source: { image: "ghcr.io/railwayapp-templates/postgres-ssl:latest" }`), verify whether `DATABASE_URL` is auto-provisioned — if not, construct it from `PG*` variables and set it via `variableCollectionUpsert`.

5. **DATABASE_URL security:** Do NOT log the full `DATABASE_URL` connection string (it contains the Postgres password). Record only that it exists and note the host:port for Story 4.4's database confirmation step. Story 4.5 wires `DATABASE_URL` as an environment variable on the agent-be service — this story only confirms it exists on the Postgres service.

6. **No GitHub repo connection:** Do NOT connect a GitHub repository to the Railway project. The agent-be service shell is empty (pending Story 4.3's Dockerfile). Deploys will be triggered manually (Story 4.6's CI job). Connecting a GitHub repo would enable auto-deploy-on-push, which violates the architecture's "deploy is a manual trigger" constraint.

7. **Railway CLI cleanup:** If the Railway CLI is installed and creates a `.railway/` directory (project linking state), add `.railway/` to `.gitignore` to prevent committing it. Story 4.1 added `.vercel` to `.gitignore` for the same reason.

8. **Default environment name:** The project is created with `defaultEnvironmentName: "production"` (matching the architecture's "production only for MVP, no staging" constraint). The environment ID is needed for `serviceInstanceUpdate` and `variables` queries — extract it from the `project(id: ...)` query response after project creation.

9. **Story 4.3 dependency:** The agent-be service shell is empty — no Dockerfile, no code, no deploy. Story 4.3 creates the Dockerfile. Story 4.5 wires environment variables (including `DATABASE_URL` referenced from the Postgres service). Story 4.6 adds the CI deploy job. This story only provisions the infrastructure container (project + Postgres + empty service shell).

10. **Postgres service naming:** The Railway CLI's `railway add --database postgres` command names the service automatically (typically `PostgreSQL` or similar). The agent-be service is named `agent-be` explicitly in the `serviceCreate` mutation. Both names are visible in the Railway dashboard and API queries.

### ATDD Artifacts

- **Integration tests:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts` — 6 tests (all `describe.skip()` red-phase scaffolds). Queries the Railway GraphQL API (read-only) and asserts: project exists (AC-1), project contains at least two services (AC-1), Postgres service exists (AC-1), agent-be service exists (AC-1), agent-be rootDirectory is `apps/agent-be` (AC-1), `DATABASE_URL` is provisioned (AC-2). Activate by removing `describe.skip` after Tasks 1-6 complete. Run: `yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure`.
- **Unit tests:** None — this story creates no config files and modifies no source code. Unit-level config-file tests are deferred to Story 4.3 (Dockerfile) when there is a build artifact to test.
- **E2E tests:** Deferred — no browser-level mock can simulate Railway API operations. Browser-level mock feasibility check documented in the ATDD checklist (Playwright `page.route()` only intercepts browser-initiated requests; all Railway operations are server-to-server).
- **Verification:** AC-1 and AC-2 are verified via the Railway GraphQL API (Task 6: query the project and confirm both services exist; Task 4: confirm `DATABASE_URL` is provisioned). The integration test scaffold automates this verification.
- **ATDD checklist:** `_bmad-output/test-artifacts/atdd-checklist-4-2-provision-the-railway-project-with-postgres-for-apps-agent-be.md`

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- RED phase: All 6 integration tests failed with expected reason ("Project 'bmad-easy' not found in workspace") — test scaffold validated.
- Railway CLI authentication: The CLI's `RAILWAY_TOKEN` env var expects a project-level token, not an account-level token. The account token in `.env.local` works with the GraphQL API directly but not with `railway link`. Used the GraphQL API fallback (Task 3.4) for Postgres provisioning.
- Postgres `DATABASE_URL` auto-provisioning: The `ghcr.io/railwayapp-templates/postgres-ssl:latest` Docker image alone does not auto-provision `DATABASE_URL` or `PG*` variables. The Railway CLI's `railway add --database postgres` uses a template that includes an entrypoint script which persists variables via the Railway API — this requires a `RAILWAY_TOKEN` to be set on the service. Manually constructed `DATABASE_URL` and `PG*` variables from the TCP proxy endpoint and `POSTGRES_PASSWORD` per Task 3.4/4.4.
- TCP proxy creation: No `tcpProxyCreate` mutation exists in the Railway GraphQL API. Created a temporary project token via `projectTokenCreate`, used it with the Railway CLI's `railway tcp-proxy create` command, then deleted the project token via `projectTokenDelete`.
- Test fix: The `variables` GraphQL query returns a parsed JSON object, not a JSON string as the test scaffold assumed. Fixed the test to handle both cases (`typeof rawVars === 'string' ? JSON.parse(rawVars) : rawVars`).
- Lint cleanup: Removed 2 unused `eslint-disable-next-line` directives in the test file that became stale after the `JSON.parse` fix removed the `any` type usage at those lines.

### Completion Notes List

- **Project ID:** `30ab04b2-132c-440b-92ca-bc57be294d6f`
- **Project name:** `bmad-easy`
- **Environment ID:** `0c3802e5-d0a4-44c0-beec-ed6ff592f5e5` (production)
- **Postgres service ID:** `c5db0481-9e69-4a51-bed6-bca229431c02` (name: `PostgreSQL`)
- **Postgres volume ID:** `4ef1f581-d16e-4b9c-900f-0f2f69cfe886` (mount path: `/var/lib/postgresql/data`)
- **TCP proxy endpoint:** `tokaido.proxy.rlwy.net:42861` (application port 5432)
- **agent-be service ID:** `4df7d0d1-0040-4395-89c8-bd166c4863cf` (name: `agent-be`, rootDirectory: `apps/agent-be`)
- **`DATABASE_URL` status:** Provisioned on the Postgres service (constructed from TCP proxy endpoint + `POSTGRES_PASSWORD`). Host:port for Story 4.4: `tokaido.proxy.rlwy.net:42861`. Full connection string NOT logged per security policy.
- **`PG*` variables:** `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` all set on the Postgres service.
- **Task 3.2/3.3 (CLI link/add):** The Railway CLI could not authenticate with the account-level token. Used the GraphQL API fallback (Task 3.4) instead — created the Postgres service via `serviceCreate` with `source: { image: "ghcr.io/railwayapp-templates/postgres-ssl:latest" }`, created a volume via `volumeCreate`, set `POSTGRES_PASSWORD` via `variableCollectionUpsert`, redeployed, then manually constructed and set `DATABASE_URL` and `PG*` variables.
- **Task 7.2 (.railway/ in .gitignore):** The Railway CLI was installed globally but did NOT create a `.railway/` directory (it was used with `--project` and `--environment` flags, not `railway link`). The condition in Task 7.2 ("if the Railway CLI was installed and created a `.railway/` directory") was not met, so no `.gitignore` update was needed.
- **Temporary project token:** Created via `projectTokenCreate` for TCP proxy creation, then immediately deleted via `projectTokenDelete`. No lingering tokens.
- **Integration tests:** All 6 tests in `railway-project-structure.integration.spec.ts` pass (GREEN). Tests verify AC-1 (project exists, 2 services, Postgres service, agent-be service, rootDirectory) and AC-2 (DATABASE_URL provisioned).
- **Unit tests:** 303 passed, 0 failed — no regressions.
- **Lint:** 1 pre-existing error (`agent.service.unit.spec.ts:1262` — `require-yield`), 26 pre-existing warnings. 0 new issues from this story's changes.

### File List

- `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts` — Modified: removed `describe.skip` to activate tests, fixed `variables` query response parsing (object vs JSON string), removed unused eslint-disable directives, updated header comment

### Change Log

- 2026-07-12: Story 4.2 implementation complete. Provisioned Railway project `bmad-easy` with PostgreSQL service and agent-be service shell via GraphQL API. Activated integration test scaffold (6 tests, all passing).

### Review Findings

- [x] [Review][Patch] Undeclared `projectId` variable — implicit global, breaks `tsc --noEmit` typecheck (TS2304) [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:86]
- [x] [Review][Patch] Undefined values (`envId`, `agentBeServiceId`, `postgresServiceId`) silently interpolated as "undefined" in GraphQL queries — no null guard before string interpolation [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:142,144,162]
- [x] [Review][Patch] `includes('pg')` substring match too loose — matches non-Postgres services like "pgadmin" [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:129,164]
- [x] [Review][Patch] `fs.readFileSync` throws raw ENOENT when `.env.local` missing — bypasses the intended helpful error message at line 27 [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:22]
- [x] [Review][Patch] `data.variables` null handling — `typeof null === 'object'` causes silent miscast to `Record<string, string>` [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:178]
- [x] [Review][Patch] `DATABASE_URL` test only checks property existence — empty or invalid values pass [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:181]
- [x] [Review][Defer] Token parser doesn't strip surrounding quotes from `.env.local` values — deferred, `.env.local` doesn't use quotes currently [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:23] — deferred, robustness improvement for future environments
- [x] [Review][Defer] `data.serviceInstance` can be null — TypeError instead of clear assertion failure — deferred, diagnostic improvement only [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:154] — deferred, test fails correctly, just with a less clear message
- [x] [Review][Defer] `JSON.parse(rawVars)` throws on non-JSON string — deferred, diagnostic improvement only [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:180] — deferred, test fails correctly on malformed API response
- [x] [Review][Defer] `response.json()` throws on non-JSON body — deferred, diagnostic improvement only [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:52] — deferred, test fails correctly on non-JSON API response
- [x] [Review][Defer] `consistency=cached` in workspaceMount is macOS-specific — deferred, pre-existing from PR #18 [.devcontainer/devcontainer.json] — deferred, not introduced by story 4.2

### NFR Findings (testarch-nfr audit, 2026-07-12)

Scope: NFR-specific issues only (missing select projections, take limits, timing tests, security headers, secret handling, database SSL). Full report: `_bmad-output/test-artifacts/nfr-assessment-4-2.md`.

- [ ] [NFR][MEDIUM] Secret leakage risk in test failure output — `expect(vars).toHaveProperty('DATABASE_URL')` prints the entire `vars` object (containing `DATABASE_URL` with embedded password, `PGPASSWORD`, `POSTGRES_PASSWORD`) to CI logs on assertion failure. The Railway `variables` GraphQL query returns ALL Postgres service variables; a test failure at the `toHaveProperty` assertion leaks all credentials into Jest's diagnostic output. Remediation: replace `expect(vars).toHaveProperty('DATABASE_URL')` with `expect(Object.keys(vars)).toContain('DATABASE_URL')` (prints keys only, not values); extract only `DATABASE_URL` from the response and discard the rest before any assertion. Owner: test hardening (Story 4.3 or post-MVP). [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:196]

- [ ] [NFR][LOW] No SSL verification on manually constructed `DATABASE_URL` — the test checks `startsWith('postgresql://')` but does not verify `sslmode=require` or equivalent SSL parameter. The Completion Notes state the `DATABASE_URL` was "constructed from TCP proxy endpoint + `POSTGRES_PASSWORD`" — the manually constructed connection string may not include SSL parameters, allowing the Prisma client to fall back to an unencrypted connection. Remediation: add an assertion that `DATABASE_URL` contains `sslmode=require`; if missing, append `?sslmode=require` when constructing it (Story 4.5 wires the `DATABASE_URL` as an environment variable on the agent-be service — enforce SSL there). Owner: Story 4.5 (environment variable wiring) or Story 4.4 (database migration — first connection test). [apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:198]

N/A findings (no issues):
- Missing select projections: N/A — Story 4.2 does not touch Prisma/database code.
- Take limits: N/A — Story 4.2 does not touch Prisma/database code.
- Timing tests: PASS — `AbortSignal.timeout(10_000)` in place; no timing-sensitive code paths.
- Security headers: N/A — agent-be service shell is empty (no code deployed); deferred to Story 4.3 (Dockerfile).
