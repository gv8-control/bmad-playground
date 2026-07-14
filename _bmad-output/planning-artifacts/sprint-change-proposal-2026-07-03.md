---
title: "Sprint Change Proposal: Add Epic 4 — MVP Cloud Deployment Provisioning"
status: approved
created: 2026-07-03
approved: 2026-07-03
---

# Sprint Change Proposal: Add Epic 4 — MVP Cloud Deployment Provisioning

## 1. Issue Summary

**Trigger:** User request to provision the MVP cloud deployment (Vercel for `apps/web`, Railway + Postgres for `apps/agent-be`, env var/secret wiring, CI deploy step, HTTP/2 proxy and shutdown-hook verification, NFR-O1 spend-monitoring verification). This was not a defect surfaced mid-story; it is a new, sizeable undertaking that doesn't have a natural home in the current epic structure.

**Discovery context:** While scoping the request against the actual repository state (not just the architecture document), two things surfaced:

1. **No epic or story currently owns the deployment mechanics.** `epics.md`'s FR/NFR Coverage Map files "deployment infra" and "CI/CD" under Epic 1's "Additional Requirements," and Story 1.1 (`done`) carries an AC claiming manual-trigger deploy exists for both Vercel and Railway. In the actual repository:
   - `apps/agent-be/src/main.ts` reads *"This is not a production server yet!"* — no shutdown hooks, no Dockerfile anywhere in `apps/`.
   - `.github/workflows/test.yml` (303 lines) has Lint, Unit & Integration, E2E (4 shards), Burn-In, and Test Report jobs only — **no deploy job of any kind**, manual or automatic.
   - No Vercel or Railway CLI, token, or project reference exists anywhere in this environment.
   So Story 1.1's AC-4 second clause was never actually built — it was marked `done` on the strength of the CI test-gate half only.
2. **Two of the requested verification items have nothing to verify yet.** Per `sprint-status.yaml`, Epic 2 and Epic 3 are entirely `backlog`. NFR-R4 (HTTP/2 proxy → SSE concurrency) and NFR-O1 (per-user spend monitoring) are both mapped in `epics.md`'s coverage map to Epic 3 (Stories 3.11 and 3.8 respectively), and Story 3.12 ("Drain Conversations Gracefully on Deploy") — the actual SSE-graceful-shutdown story — is also `backlog`. There is no SSE/streaming/cost-tracking code in `apps/agent-be` at all yet (`src/services/`, `src/controllers/` are empty).

**Evidence:**
- `apps/agent-be/src/main.ts` — stub bootstrap, no shutdown hooks.
- `.github/workflows/test.yml` — grep for `deploy` returns nothing.
- `sprint-status.yaml` — `epic-2: backlog`, `epic-3: backlog`, all their stories `backlog`.
- `epics.md` FR Coverage Map — NFR-R4 → Epic 3, NFR-O1 → Epic 3, Story 3.12 → Epic 3.
- `_bmad-output/implementation-artifacts/1-1-scaffold-the-platform-monorepo-and-ci-pipeline.md:24` — AC-4 text quoted below.
- No Vercel/Railway CLI, token, or `.mcp.json` entry present in this environment.

## 2. Impact Analysis

### Epic Impact

- **Epic 1 (done):** No code rollback needed — the scaffold, CI lint/test gate, and Tailwind tokens Story 1.1 actually delivered are correct and unaffected. Only AC-4's second clause needs a clarifying annotation (§4, Change 2) pointing at the new epic; status stays `done`.
- **Epic 2 (backlog):** No impact. Project Map / Artifact Browser are unrelated to deployment mechanics.
- **Epic 3 (backlog):** No functional change to its stories. New dependency (not a blocker): Stories 3.8 (spend monitoring), 3.11 (SSE concurrency/HTTP-2), and 3.12 (graceful drain) will eventually need the real Railway environment Epic 4 provisions to verify end-to-end — but Epic 4 does not wait on Epic 3, and Epic 3 does not wait on Epic 4 to start its own implementation/local testing.
- **New Epic 4 (MVP Cloud Deployment Provisioning):** Added as backlog, independent of Epic 2/3 sequencing — can be worked in parallel, per the user's explicit choice.

### Story Impact

- **Story 1.1:** AC-4 text annotated (not reverted) to scope its claim correctly. No other stories in Epics 1–3 change.
- **7 new stories added under Epic 4** (see §4, Change 1).

### Artifact Conflicts

- **`epics.md`:** Add Epic 4 section + 7 stories; add a footnote line to Story 1.1's AC-4.
- **`architecture.md`:** No architectural redesign — the Infrastructure & Deployment section (lines 280–288) already fully specifies this. Only the Decision Impact Analysis's Implementation Sequence steps 11–12 (lines 304–305) get an annotation pointing at Epic 4/Epic 3 for the parts that were never actually executed.
- **PRD:** No conflict. The PRD's constraints (§8: stateful single-container backend, production-only, no staging) already assume this deployment shape; nothing here changes PRD scope or goals.
- **UX Design:** No conflict.
- **`sprint-status.yaml`:** Add `epic-4` and its 7 story keys as `backlog`.
- **`_bmad-output/implementation-artifacts/1-1-scaffold-the-platform-monorepo-and-ci-pipeline.md`:** Add one Change Log entry documenting the AC-4 clarification.

### Technical Impact

- New `Dockerfile` for `apps/agent-be` (Epic 4, Story 4.3).
- New CI job (`workflow_dispatch`) for manual deploy (Epic 4, Story 4.6).
- No schema changes — Prisma migrations already exist and will run as-is against the new Postgres instance (Epic 4, Story 4.4).

## 3. Recommended Approach

**Selected: Add new epic (Option 1/2/3 hybrid — closest to "Direct Adjustment" but as a new epic rather than stuffed into an existing one).**

- **Option 1 (direct adjustment within existing epics):** Not viable as the sole approach — there's no existing epic this cleanly belongs to (confirmed in Epic Impact above), and burying deployment work inside Epic 1's changelog would make it undiscoverable as a trackable unit of work. Rejected per user's explicit preference for a dedicated epic.
- **Option 2 (rollback):** Not viable/needed — no delivered code from Story 1.1 is wrong; only an AC claim needs a documentation correction.
- **Option 3 (MVP scope review):** Not needed — deployment was already implicit MVP scope (architecture specifies production-only, no staging); this proposal doesn't change what "done" means for the MVP, only how the work is tracked.

**Effort:** Medium (mostly one-time cloud setup + a Dockerfile + one CI job; migrations and env-var wiring are mechanical). **Risk:** Low-medium — the main risk is credential handling (tokens passed through this session) and the chicken-and-egg GitHub OAuth App / Vercel-domain sequencing already discussed with the user. **Timeline impact:** None on Epic 2/3 — fully parallel track.

> *Note (2026-07-11): Scope exclusion reviewed and accepted. The original request named "shutdown-hook verification" (SSE graceful drain, Story 3.12) and "NFR-O1 spend-monitoring verification" (Story 3.8) as part of the trigger. These were deliberately deferred to Epic 3 because the underlying streaming and cost-tracking code does not exist yet (Epics 2 and 3 are `backlog`). This is a sound boundary: Epic 4 confirms platform-level capability only (HTTP/2 support via Story 4.7); Epic 3 verifies end-to-end behavior once the streaming transport and cost-tracking code exist. If Epic 3's verification stories surface platform-level gaps that Epic 4 should have addressed, a follow-up sprint change proposal should reopen Epic 4 to close those gaps.*

## 4. Detailed Change Proposals

### Change 1 — Add Epic 4 to `epics.md`

**New section**, inserted after Epic 3, with its own "Epic List" entry:

> ### Epic 4: MVP Cloud Deployment Provisioning
>
> Provision the platform's single production environment (per architecture's "production only, no staging" constraint) so the team has a live, working deployment: `apps/web` on Vercel, `apps/agent-be` (Docker) and Postgres on Railway, secrets wired on both platforms, migrations applied, and CI able to trigger a deploy manually. This epic owns provisioning mechanics only — it does **not** own building or verifying features that don't exist yet. Verifying NestJS shutdown-hook SSE draining (Story 3.12) and NFR-O1 per-user spend monitoring (Story 3.8) remain Epic 3's responsibility once that code exists; this epic only confirms the platform-level capability (HTTP/2 support) is available for Epic 3 to build on.
> **Additional Requirements covered:** deployment infra, CI/CD manual deploy trigger (correcting the gap left by Story 1.1's AC-4).

**Story 4.1: Provision the Vercel Project for `apps/web`**

As the platform operator, I want a Vercel project configured for `apps/web` in this Nx monorepo, so that the frontend has a deployable production target.

- **Given** the Nx monorepo with `apps/web` at its current path **When** the Vercel project is created **Then** its root directory is set to `apps/web`, the framework preset is Next.js, and a production build succeeds against the monorepo (Turbopack root resolves to the workspace root per existing `next.config.js`).
- **Given** the project is created **When** deploys are configured **Then** automatic deploy-on-push is disabled (deploy stays manual, per architecture) — either by not connecting a GitHub integration or by setting `git.deploymentEnabled: false` in `vercel.json`.
- **Given** the project needs a reachable URL before the GitHub OAuth App can be registered (Story 4.5 dependency) **When** this story completes **Then** at least a placeholder `*.vercel.app` production URL exists.

**Story 4.2: Provision the Railway Project with Postgres for `apps/agent-be`**

As the platform operator, I want a single Railway project containing both the `apps/agent-be` service and a Postgres instance, so that the backend and its database share operational lifecycle per architecture.

- **Given** a Railway account **When** the project is created **Then** it contains a Postgres addon/service and a service shell for `apps/agent-be` (Docker-based, pending Story 4.3's Dockerfile).
- **Given** the Postgres service **When** it is provisioned **Then** a `DATABASE_URL` connection string is available for Story 4.4 and Story 4.5.

**Story 4.3: Add a Dockerfile for `apps/agent-be`**

As a developer, I want a production Dockerfile for `apps/agent-be`, so that Railway can build and run it as a container.

- **Given** the Nx monorepo **When** the Dockerfile is authored **Then** it performs a multi-stage build (install → `nx build agent-be` → slim runtime image) and exposes the port `apps/agent-be` listens on (`process.env.PORT`, defaulting to 3001 per current `main.ts`).
- **Given** the built image **When** it runs locally against a local Postgres **Then** `GET /health` responds successfully.

**Story 4.4: Run Prisma Migrations Against the Railway Postgres Instance**

As the platform operator, I want the existing `libs/database-schemas` migrations applied to the Railway Postgres instance, so that the production database schema matches what both apps expect.

- **Given** the Railway `DATABASE_URL` from Story 4.2 **When** `prisma migrate deploy` is run from `libs/database-schemas` **Then** all three existing migrations (`20260618192551_init_users`, `20260619000000_add_oauth_credential_and_repo_connection`, `20260702000000_backlog_hardening_aad_kekid_constraints`) apply cleanly with no manual schema edits.
- **Given** the migration run **When** it completes **Then** the target database is confirmed (host:port/dbname only, no credentials logged) before and after, mirroring the safety pattern already used in `scripts/rotate-kek.ts`'s `describeDatabase()`.

**Story 4.5: Wire Environment Variables and Secrets on Both Platforms**

As the platform operator, I want all required secrets set on Vercel and Railway, so that both services run with the correct production configuration.

- **Given** `apps/web` on Vercel **When** environment variables are set **Then** `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_URL`, `DATABASE_URL` are present.
- **Given** `apps/agent-be` on Railway **When** environment variables are set **Then** `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK` (generated via `openssl rand -hex 32`), `DAYTONA_API_URL`, `DAYTONA_API_KEY` are present.
- **Given** either platform **When** variables are reviewed **Then** `TEST_ENV` is confirmed absent — `assertTestEnvNotInProduction()` must not fail startup.
- **Given** the GitHub OAuth App requirement **When** `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` are needed **Then** the OAuth App itself is registered manually by the user at `github.com/settings/developers` (no API exists for this) using the Story 4.1 Vercel domain as the callback URL — this sub-step is flagged as manual, not attempted by the agent.

**Story 4.6: Add the Manual-Trigger Deploy Step to CI**

As a developer, I want a manually-triggered deploy job in CI, so that shipping to production is deliberate, per Story 1.1 AC-4's original policy intent.

- **Given** `.github/workflows/test.yml` (or a new `deploy.yml`) **When** a maintainer runs it via `workflow_dispatch` **Then** it deploys `apps/web` to Vercel and `apps/agent-be` to Railway, and it never runs on `push`/`pull_request`.
- **Given** the deploy job **When** it runs **Then** it depends on the existing lint/test jobs having passed (does not bypass the quality gate).

**Story 4.7: Confirm HTTP/2-Capable Reverse Proxy in Front of `apps/agent-be`**

As the platform operator, I want confirmation that the deployment path to `apps/agent-be` supports HTTP/2, so that NFR-R4's 10-concurrent-SSE-connection requirement is satisfiable once Epic 3 builds the streaming transport.

- **Given** `apps/agent-be` deployed on Railway **When** its public edge is inspected **Then** Railway's platform-provided TLS-terminating edge proxy is confirmed to negotiate HTTP/2 (Railway's default for HTTP services) — no additional proxy/sidecar is introduced unless this confirmation fails.
- **Given** this story's scope **When** considering SSE behavior **Then** actually exercising 10 concurrent SSE connections is Epic 3 Story 3.11's responsibility once the streaming transport exists — this story confirms only the platform-level transport capability.

### Change 2 — Annotate Story 1.1's AC-4 (epics.md and the implementation-artifact file)

**File:** `epics.md`, Story 1.1 AC-4 (and mirrored in `_bmad-output/implementation-artifacts/1-1-scaffold-the-platform-monorepo-and-ci-pipeline.md:24`)

**OLD:**
> **Given** the scaffolded monorepo **When** a commit is pushed **Then** GitHub Actions CI runs lint and all available test suites as a merge gate **And** deploy is a manual trigger (not automatic) for both Vercel (`apps/web`) and Railway (`apps/agent-be`)

**NEW (append a scope note, AC text unchanged):**
> *Scope note (2026-07-03): the "manual trigger" clause above states the CI/CD policy decided at scaffold time (no automatic deploy). The actual deploy mechanism — Vercel/Railway projects, Dockerfile, and the `workflow_dispatch` CI job — is delivered by Epic 4 (Stories 4.1–4.6), not by this story. Story 1.1's own delivered scope (Nx scaffold, Tailwind tokens, CI lint/test gate) remains complete; status unchanged.*

**Rationale:** Corrects the record without an unnecessary status rollback — nothing Story 1.1 actually built is being redone.

**Change Log entry to append** to `1-1-scaffold-the-platform-monorepo-and-ci-pipeline.md`'s existing `### Change Log` section:
> - 2026-07-03: AC-4 scope note added — manual-trigger deploy mechanism delegated to new Epic 4; no status change, no code rollback.

### Change 3 — Annotate `architecture.md` Decision Impact Analysis

**File:** `architecture.md`, Decision Impact Analysis, Implementation Sequence, steps 11–12 (lines 304–305)

**Append a footnote** after step 12:
> *Note (2026-07-03): Steps 11 (manual deploy process) and 12 (launch-checklist invariant verification) are tracked as Epic 4 (deploy mechanics) and Epic 3 Stories 3.8/3.11/3.12 (invariant verification, once the underlying features exist) rather than as part of Epic 1's delivered scope.*

### Change 4 — Update `sprint-status.yaml`

Add:
```yaml
  # ── Epic 4: MVP Cloud Deployment Provisioning ──
  epic-4: backlog
  4-1-provision-the-vercel-project-for-apps-web: backlog
  4-2-provision-the-railway-project-with-postgres-for-apps-agent-be: backlog
  4-3-add-a-dockerfile-for-apps-agent-be: backlog
  4-4-run-prisma-migrations-against-the-railway-postgres-instance: backlog
  4-5-wire-environment-variables-and-secrets-on-both-platforms: backlog
  4-6-add-the-manual-trigger-deploy-step-to-ci: backlog
  4-7-confirm-http2-capable-reverse-proxy-in-front-of-apps-agent-be: backlog
  epic-4-retrospective: optional
```

## 5. Implementation Handoff

**Scope classification: Moderate** — backlog reorganization (new epic + annotations) plus direct implementation once stories are picked up. No PRD/architecture redesign, so this does not rise to "Major."

- **Product Owner / this workflow:** Apply Changes 1–4 to `epics.md`, the Story 1.1 implementation-artifact file, `architecture.md`, and `sprint-status.yaml` upon approval.
- **Developer agent (`bmad-create-story` → `bmad-dev-story`, or `bmad-quick-dev` per story):** Implements Stories 4.1–4.7 in the dependency order given (4.1/4.2 → 4.3 → 4.4/4.5 → 4.6 → 4.7), using tokens the user supplies for Vercel/Railway CLI access. GitHub OAuth App registration (Story 4.5) and any account creation remain manual actions for the user.
- **Success criteria:** All 7 Epic 4 stories reach `done`; Story 1.1's AC-4 scope note is in place; `sprint-status.yaml` reflects Epic 4 as backlog (then progressing) independent of Epic 2/3.
