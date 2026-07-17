# Epic 4: MVP Cloud Deployment Provisioning

Provision the platform's single production environment: `apps/web` on Vercel, `apps/agent-be` (Docker) and Postgres on Railway, secrets wired on both platforms, migrations applied, and CI able to trigger a deploy manually. Independent of Epic 2/3 sequencing. Out of scope: verifying SSE graceful drain (Epic 3, Story 3.12) and NFR-O1 spend monitoring (Epic 3, Story 3.8) — both require Epic 3 code that doesn't exist yet; this epic confirms platform-level capability only (Story 4.7).

## Story 4.1: Provision the Vercel Project for `apps/web`

As the platform operator,
I want a Vercel project configured for `apps/web` in this Nx monorepo,
So that the frontend has a deployable production target.

**Acceptance Criteria:**

**Given** the Nx monorepo with `apps/web` at its current path
**When** the Vercel project is created
**Then** its root directory is set to `apps/web`, the framework preset is Next.js, and a production build succeeds against the monorepo (Turbopack root resolves to the workspace root per the existing `next.config.js`)
**And** the Vercel project's install command runs at the workspace root (`yarn install --immutable`) and the build command includes a `prisma generate` step (from `libs/database-schemas`) before `nx build web`, so the shared Prisma client is available to `apps/web` at build time against the production `DATABASE_URL`

**Given** the project is created
**When** deploys are configured
**Then** automatic deploy-on-push is disabled (deploy stays manual, per architecture) — either by not connecting a GitHub integration or by setting `git.deploymentEnabled: false` in `vercel.json`

**Given** the project needs a reachable URL before the GitHub OAuth App can be registered (Story 4.5 dependency)
**When** this story completes
**Then** at least a placeholder `*.vercel.app` production URL exists

## Story 4.2: Provision the Railway Project with Postgres for `apps/agent-be`

As the platform operator,
I want a single Railway project containing both the `apps/agent-be` service and a Postgres instance,
So that the backend and its database share operational lifecycle per architecture.

**Acceptance Criteria:**

**Given** a Railway account
**When** the project is created
**Then** it contains a Postgres addon/service and a service shell for `apps/agent-be` (Docker-based, pending Story 4.3's Dockerfile)

**Given** the Postgres service
**When** it is provisioned
**Then** a `DATABASE_URL` connection string is available for Story 4.4 and Story 4.5

## Story 4.3: Add a Dockerfile for `apps/agent-be`

As a developer,
I want a production Dockerfile for `apps/agent-be`,
So that Railway can build and run it as a container.

**Acceptance Criteria:**

**Given** the Nx monorepo
**When** the Dockerfile is authored
**Then** it performs a multi-stage build (install → `nx build agent-be` → slim runtime image) and exposes the port `apps/agent-be` listens on (`process.env.PORT`, defaulting to 3001 per current `main.ts`)
**And** the install stage activates Corepack and uses the Yarn version pinned in the root `package.json`'s `packageManager` field, with `.yarnrc.yml` (`nodeLinker: node-modules`) respected — matching the local development environment exactly to avoid divergent or broken builds

**Given** the built image
**When** it runs locally against a local Postgres
**Then** `GET /health` responds successfully

**Given** the built Docker image
**When** it runs on Railway
**Then** a `HEALTHCHECK` instruction (or Railway health-probe configuration) polls `GET /health` on a defined interval (default 30s) so Railway can detect and restart an unhealthy container automatically

**Given** the Dockerfile's build stage
**When** `nx build agent-be` is run
**Then** a `prisma generate` step (from `libs/database-schemas`) runs before the build, so the shared Prisma client is available at build time — matching the `apps/web` build command in Story 4.1

## Story 4.4: Run Prisma Migrations Against the Railway Postgres Instance

As the platform operator,
I want the existing `libs/database-schemas` migrations applied to the Railway Postgres instance,
So that the production database schema matches what both apps expect.

**Acceptance Criteria:**

**Given** the Railway `DATABASE_URL` from Story 4.2
**When** `prisma migrate deploy` is run from `libs/database-schemas`
**Then** all three existing migrations (`20260618192551_init_users`, `20260619000000_add_oauth_credential_and_repo_connection`, `20260702000000_backlog_hardening_aad_kekid_constraints`) apply cleanly with no manual schema edits

**Given** the migration run
**When** it completes
**Then** the target database is confirmed (host:port/dbname only, no credentials logged) before and after, mirroring the safety pattern already used in `scripts/rotate-kek.ts`'s `describeDatabase()`

## Story 4.5: Wire Environment Variables and Secrets on Both Platforms

As the platform operator,
I want all required secrets set on Vercel and Railway,
So that both services run with the correct production configuration.

**Acceptance Criteria:**

**Given** `apps/web` on Vercel
**When** environment variables are set
**Then** `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_URL`, and `DATABASE_URL` are present

**Given** `apps/agent-be` on Railway
**When** environment variables are set
**Then** `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK` (generate via `openssl rand -hex 32` — current `.env` value is a test placeholder), `DAYTONA_API_URL`, `DAYTONA_API_KEY`, and `ANTHROPIC_API_KEY` are present
**And** the boundary JWT uses `AUTH_SECRET` for both signing and validation — no separate `AGENT_BACKEND_JWT_SECRET` is needed

**Given** either platform
**When** variables are reviewed
**Then** `TEST_ENV` is confirmed absent — `apps/web`'s `assertTestEnvNotInProduction()` guard (in `env-guard.ts`, invoked from `instrumentation.ts`) fails startup if set; `apps/agent-be` requires equivalent verification

**Given** the GitHub OAuth App
**When** `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` are needed
**Then** the OAuth App already exists in `.env` — the only manual step is updating its callback URL to the production `*.vercel.app` domain once Story 4.1 completes (no API exists for OAuth App management)

## Story 4.6: Add the Manual-Trigger Deploy Step to CI

As a developer,
I want a manually-triggered deploy job in CI,
So that shipping to production is deliberate, per Story 1.1's manual-trigger deploy policy.

**Acceptance Criteria:**

**Given** `.github/workflows/test.yml` (or a new `deploy.yml`)
**When** a maintainer runs it via `workflow_dispatch`
**Then** it deploys `apps/web` to Vercel and `apps/agent-be` to Railway, and it never runs on `push`/`pull_request`

**Given** the deploy job
**When** it runs
**Then** it depends on the existing lint/test jobs having passed (does not bypass the quality gate)

**Given** the deploy job targets production
**When** it is configured
**Then** it uses a GitHub Environment (e.g. `production`) with required reviewers enabled, a required reviewer count of at least 1, and a branch restriction pinning deploys to the default branch (e.g. `main`) — so that no maintainer can trigger a production deploy without human approval and no deploy originates from an unmerged branch

## Story 4.7: Confirm HTTP/2-Capable Reverse Proxy in Front of `apps/agent-be`

As the platform operator,
I want confirmation that the deployment path to `apps/agent-be` supports HTTP/2,
So that NFR-R4's 10-concurrent-SSE-connection requirement is satisfiable once Epic 3 builds the streaming transport.

**Acceptance Criteria:**

**Given** `apps/agent-be` deployed on Railway with its public URL
**When** HTTP/2 support is verified
**Then** a concrete check confirms ALPN HTTP/2 negotiation — e.g. `curl -v --http2 https://<agent-be-url>/health` returns response with `< HTTP/2 200` (or equivalent protocol inspection tool) — and the result is recorded; if the check fails, an additional HTTP/2-capable reverse proxy or sidecar is introduced and the check is re-run until it passes

**Given** this story's scope
**When** considering SSE behavior
**Then** actually exercising 10 concurrent SSE connections is Epic 3 Story 3.11's responsibility once the streaming transport exists — this story confirms only the platform-level transport capability

## Story 4.8: Deploy Failure Recovery and Rollback

As the platform operator,
I want a documented recovery path for failed deploys, partial migrations, and misconfigured secrets,
So that a production incident doesn't become a prolonged outage because no one knows how to roll back.

**Acceptance Criteria:**

**Given** a Vercel deploy of `apps/web` that fails mid-flight
**When** the failure is detected
**Then** Vercel's automatic rollback to the previous successful deployment is confirmed enabled, and the operator can trigger `vercel rollback` (or equivalent dashboard action) to restore the last known-good version without a full redeploy

**Given** a Railway deploy of `apps/agent-be` that fails or produces an unhealthy container
**When** the failure is detected
**Then** Railway's automatic redeploy of the previous revision is confirmed enabled, and the operator can manually trigger a redeploy of the last successful image via the Railway dashboard or CLI

**Given** `prisma migrate deploy` fails partway through the migration set
**When** the partial state is detected
**Then** the operator follows a documented recovery procedure (`docs/runbooks/deploy-failure-recovery.md`) covering: inspecting `_prisma_migrations` table for partially-applied state, marking or rolling back the failed migration, and re-running `prisma migrate deploy` — the procedure is validated at least once against a non-production database

**Given** a misconfigured secret causes `apps/agent-be` or `apps/web` to fail startup
**When** the health check fails post-deploy
**Then** the deploy is blocked from receiving traffic (Vercel build-step failure or Railway health-check failure prevents promotion), and the previous working deployment continues serving until the secret is corrected and a new deploy succeeds

## Story 4.9: Configure Custom Domain and Stable Production URL

**Status: Completed (2026-07-14).** Runbook at `docs/runbooks/custom-domain-setup.md`; regression guard test at `apps/agent-be/test/unit/custom-domain-setup.spec.ts` (28 tests, all passing).

As the platform operator,
I want a custom domain configured for the production deployment,
So that the GitHub OAuth callback URL and `AUTH_URL` env var point at a stable domain that doesn't change between deploys.

**Acceptance Criteria:**

**Given** the placeholder `*.vercel.app` URL from Story 4.1
**When** a custom domain is provisioned
**Then** DNS records are configured (A or CNAME pointing to Vercel), the domain is added and verified in the Vercel project settings, and TLS is provisioned automatically by Vercel

**Given** the custom domain is live
**When** environment variables are updated
**Then** `AUTH_URL` on Vercel is updated to the custom domain (e.g., `https://app.bmad-easy.com`) so Auth.js redirects and session callbacks use the stable URL

**Given** the GitHub OAuth App registered in Story 4.5
**When** the callback URL needs updating
**Then** the OAuth App's callback URL is updated at `github.com/settings/developers` to use the custom domain — this sub-step is manual, not attempted by the agent

**Given** the custom domain and updated OAuth configuration
**When** a user signs in
**Then** the full OAuth flow (sign-in → callback → session establishment) works end-to-end against the custom domain, verified by a manual sign-in test

## Story 4.10: Configure Database Backups and Verify Restore

As the platform operator,
I want automated backups and a tested restore procedure for the Railway Postgres instance,
So that a data loss event is recoverable rather than catastrophic.

**Acceptance Criteria:**

**Given** the Railway Postgres instance provisioned in Story 4.2
**When** backups are configured
**Then** Railway's built-in Postgres backup feature is enabled with a retention policy of at least daily backups retained for 7 days and weekly backups retained for 4 weeks

**Given** backups are running
**When** a restore is tested
**Then** a backup is restored to a temporary Postgres instance (local or Railway), and data integrity is confirmed by comparing row counts and a sample of records against the production database

**Given** the restore procedure
**When** it is documented
**Then** a runbook is committed to the repository at `docs/runbooks/db-restore.md` covering: how to trigger a restore from Railway, how to point `apps/agent-be` at the restored instance, and the steps to verify integrity post-restore

## Story 4.11: Configure Launch-Window Monitoring and Alerting

As the platform operator,
I want minimal monitoring and alerting on the production deployment,
So that I know the platform is broken before a user reports it.

**Acceptance Criteria:**

**Given** both `apps/web` (Vercel) and `apps/agent-be` (Railway) deployed to production
**When** uptime monitoring is configured
**Then** an external uptime check polls `GET /health` on `apps/agent-be` and the homepage of `apps/web` at a regular interval (default 5 minutes), and alerts the operator within 5 minutes of a failure (e.g., via email, Slack webhook, or a monitoring service's free tier)

**Given** the production deployment
**When** errors occur
**Then** platform-native logs (Vercel deployment logs, Railway service logs) are confirmed accessible and retained for at least 7 days, and the operator knows how to access them without additional setup

**Given** a deploy failure (Story 4.6's `workflow_dispatch` job fails)
**When** the failure occurs
**Then** the GitHub Actions failure notification reaches the operator (via GitHub's default email notification or a configured webhook), so a failed deploy does not go unnoticed

**Given** this story's scope
**When** considering what is out of scope
**Then** NFR-O1 per-user LLM spend monitoring (Epic 3 Story 3.8), distributed tracing, and APM tools are explicitly out of scope — this story covers only the minimal observability needed to detect and respond to platform-level outages during the MVP launch window

## Story 4.12: Secret Rotation Reminder Mechanism

As the platform operator,
I want automated reminders for rotating production secrets that require manual action,
So that rotations are not forgotten and secrets do not exceed their safe lifetime.

**Acceptance Criteria:**

**Given** the production secrets wired in Story 4.5 (`DAYTONA_API_KEY`, `ANTHROPIC_API_KEY`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET`) and the KEK runbook from Story 1.9
**When** the rotation schedule is authored
**Then** a runbook is committed to `docs/runbooks/secret-rotation-schedule.md` listing each secret, its rotation interval (90 days for API keys, 180 days for OAuth secrets), the manual steps to rotate each, and a reference to the KEK rotation runbook for `CREDENTIAL_ENCRYPTION_KEK`

**Given** the rotation schedule
**When** a secret approaches or passes its rotation due date
**Then** a GitHub Actions cron job (running weekly) creates a GitHub issue in the repository titled "Rotate `<secret-name>` — due `<date>`" with a link to the rotation runbook, so the rotation is tracked as actionable work rather than relying on memory

**Given** the initial production launch
**When** the reminder mechanism is first activated
**Then** each secret's initial rotation due date is set based on the production launch date (launch date + rotation interval), and the cron job is confirmed to have created its first check issue without error

**Given** this story's scope
**When** considering what is out of scope
**Then** automated secret rotation (no human in the loop) is explicitly out of scope — this story delivers reminders only, not rotation automation
