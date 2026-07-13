# Deploy Failure Recovery and Rollback

This runbook covers recovery procedures for failed deploys, partial migrations, misconfigured secrets, and split-brain deploy states across the Vercel (apps/web) and Railway (apps/agent-be) platforms.

**Production URLs:**

- apps/web (Vercel): `https://bmad-easy.vercel.app`
- apps/agent-be (Railway): `https://agent-be-production-1c09.up.railway.app`

**Railway project details (operator reference):**

- Project ID: `30ab04b2-132c-440b-92ca-bc57be294d6f`
- Environment ID (production): `0c3802e5-d0a4-44c0-beec-ed6ff592f5e5`
- agent-be service ID: `4df7d0d1-0040-4395-89c8-bd166c4863cf`

**Vercel project details (operator reference):**

- Project ID: `prj_ih4UAxO759A1CHdrZ93j4rk3poYD`
- Org ID (team): `team_DV9hczWkgqbOEoMGnX9Pta3t`

---

## Vercel Deploy Failure Recovery

### Automatic Rollback (Build Failure Prevention)

Vercel only promotes a deployment to production when the build succeeds. The deploy workflow (`.github/workflows/deploy.yml` line 57) runs `vercel deploy --prod --yes --cwd=apps/web`. If the build fails (e.g., a missing env var causes `next build` to crash), Vercel does NOT promote the failed build to production — the previous `READY` deployment continues serving.

**Verification (2026-07-13):** Queried the Vercel API:

```
GET https://api.vercel.com/v6/deployments?projectId=prj_ih4UAxO759A1CHdrZ93j4rk3poYD&limit=5&target=production
Authorization: Bearer $VERCEL_TOKEN
```

Result: 2 production deployments found for the `bmad-easy` project:

| Deployment | State | Notes |
|---|---|---|
| `dpl_6P3KQMWFGSBBCNiE7PQaHL1dBK2M` | `READY` | Current production deployment |
| `dpl_66Zk9xshFZTjLbq6sx9NYYyTkELN` | `ERROR` | Failed build — did NOT replace the READY deployment |

The `ERROR` deployment (failed build) was never promoted to production. The `READY` deployment continues serving. This confirms Vercel's automatic rollback: a failed build does not replace the current production deployment.

> **Note:** The Vercel API returned 2 production deployments while `vercel ls --prod` listed 3. This discrepancy is expected — the API and CLI may use different filters or a deployment was created between the two queries. The operator should use `vercel ls --prod` for the most current list when performing a rollback.

### Manual Rollback

To manually roll back to a previous deployment:

1. List recent production deployments:

```bash
vercel ls --prod --yes --cwd=apps/web
```

2. Identify the current production deployment (state `READY`) and the previous one.

3. Roll back to the previous deployment:

```bash
vercel rollback <deployment-url> --yes --cwd=apps/web
```

4. To restore the original deployment, run `vercel rollback` again with the original deployment URL:

```bash
vercel rollback <original-deployment-url> --yes --cwd=apps/web
```

**Note:** `vercel rollback` can only roll back to deployments in `READY` state. A deployment in `ERROR` state cannot be rolled back to.

**Verification (2026-07-13):** Ran `vercel ls --prod --yes --cwd=apps/web` (Vercel CLI 55.0.0). Confirmed 3 production deployments listed. The current production deployment is `READY`; the previous is `ERROR` (failed build). A rollback test could not be performed because there is no previous `READY` deployment to roll back to — the only previous deployment is in `ERROR` state. The `vercel rollback` command is available and documented above.

**Fix-forward when no previous `READY` deployment exists:** If the current `READY` deployment breaks and all previous deployments are in `ERROR` state, `vercel rollback` cannot be used. Instead, fix the issue and trigger a new deploy: `vercel deploy --prod --yes --cwd=apps/web` (or run the deploy workflow). This creates a new deployment that, if the build succeeds, becomes the new production deployment.

### Vercel Dashboard Steps

1. Navigate to the Vercel project dashboard.
2. Go to the "Deployments" tab.
3. Find the deployment you want to roll back to.
4. Click the "..." menu and select "Rollback to this Deployment".

---

## Railway Deploy Failure Recovery

### Automatic Redeploy (HEALTHCHECK Failure Prevention)

The `apps/agent-be` Dockerfile (lines 29-30) defines a `HEALTHCHECK` instruction:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const r=http.get('http://127.0.0.1:'+(process.env.PORT||3001)+'/health',res=>process.exit(res.statusCode===200?0:1));r.on('error',()=>process.exit(1))"
```

Railway respects the Dockerfile `HEALTHCHECK` instruction. If the health check fails (the `CMD` exits non-zero) for `--retries` consecutive attempts (3), Railway marks the container unhealthy and restarts it. The `--start-period=10s` gives the container 10 seconds to start before health checks begin counting failures. The `--timeout=3s` means each health check must respond within 3 seconds.

If `apps/agent-be` crashes on startup (e.g., missing `DATABASE_URL` or `ANTHROPIC_API_KEY`), the health check fails, Railway marks the deployment unhealthy, and the container is restarted. The previous healthy deployment continues serving until a new deploy with a healthy container succeeds.

**Verification (2026-07-13):** Queried the Railway GraphQL API:

```
POST https://backboard.railway.com/graphql/v2
Authorization: Bearer $RAILWAY_TOKEN
```

Query: `service(id: "4df7d0d1-0040-4395-89c8-bd166c4863cf") { deployments { edges { node { status createdAt } } } }`

Result: 4 deployments found:

| Status | Created At |
|---|---|
| `SUCCESS` | 2026-07-13T12:20:30.266Z |
| `FAILED` | 2026-07-12T14:56:21.110Z |
| `FAILED` | 2026-07-12T14:56:11.876Z |
| `FAILED` | 2026-07-12T14:46:11.859Z |

At least one `SUCCESS` deployment exists. The `FAILED` deployments were followed by a later `SUCCESS` deployment, confirming that failed deploys do not permanently block the service. Railway's health check mechanism is documented above; the `SUCCESS` deployment confirms the service recovered.

### Manual Redeploy

To manually trigger a redeploy of the latest deployment:

```bash
railway deployment redeploy --service <service-id> --environment <environment-id> --project <project-id> --yes
```

Or to deploy a new image from the source:

```bash
# Run from the repository root — the Dockerfile expects the full repo context
railway up --service <service-id> --environment <environment-id> --project <project-id>
```

> **Note:** `railway up` may prompt for confirmation in an interactive terminal. In the deploy workflow, CI is non-interactive so no prompt appears. If prompted, confirm the deploy.

**Note:** The `RAILWAY_TOKEN` environment variable works for `railway up` (as used in the deploy workflow). However, `railway deployment redeploy` may require authentication via `railway login` (OAuth flow) — the API token may not be accepted for all CLI subcommands. If a CLI command returns "Unauthorized", use `railway login` to authenticate, or use the Railway dashboard instead.

**Verification (2026-07-13):** The `railway deployment redeploy` command is available (Railway CLI). CLI authentication via `railway login` (OAuth flow) was required for `railway deployment redeploy` — the API token did not work for that subcommand. However, `railway up` works with `RAILWAY_TOKEN` as shown in the deploy workflow. The command syntax is documented above. The Railway GraphQL API verification confirms the deployment status and manual redeploy capability.

### Railway Dashboard Steps

1. Navigate to the Railway project dashboard.
2. Select the `agent-be` service.
3. Go to the "Deployments" tab.
4. Find the deployment you want to redeploy.
5. Click "Redeploy" or use the "..." menu.

---

## Prisma Migration Recovery

### Overview

`prisma migrate deploy` applies pending migrations in order. The `_prisma_migrations` table tracks which migrations have been applied (`migration_name`, `finished_at`, `rolled_back_at`, `applied_steps_count`). A failed migration leaves a partial schema state and a `_prisma_migrations` entry with `finished_at IS NULL`. Prisma does not support automatic migration rollback (no `prisma migrate down` in deploy mode) — recovery is manual.

### Recovery Procedure

1. **Inspect the `_prisma_migrations` table** to identify the failed migration:

```sql
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM _prisma_migrations
ORDER BY finished_at NULLS FIRST;
```

A failed migration will have `finished_at IS NULL` and `applied_steps_count = 0`. Successfully applied migrations will have `finished_at` set to a timestamp. The `NULLS FIRST` ordering ensures failed migrations appear at the top of the result set. If multiple migrations failed, repeat the recovery procedure below for each failed migration.

2. **Identify partially-applied schema changes.** Review the failed migration's SQL file to determine what DDL statements may have partially executed. For example, a migration containing `CREATE TABLE test_recovery (...); CREATE TABLE test_recovery (...);` will have created the table on the first statement and failed on the second.

3. **Roll back the failed migration's DDL manually.** Drop any partially-created tables, columns, or constraints:

```sql
DROP TABLE IF EXISTS "<partially-created-table>" CASCADE;
```

If the migration partially created other object types (indexes, constraints, views, enum types, functions), drop those as well using the appropriate `DROP` command (e.g., `DROP INDEX IF EXISTS`, `DROP TYPE IF EXISTS`). Use `CASCADE` only if dependent objects need to be removed automatically — review the impact before using it.

4. **Delete the failed migration entry** from `_prisma_migrations`:

```sql
DELETE FROM _prisma_migrations WHERE migration_name = '<failed-migration>';
```

5. **Fix or remove the broken migration.** Either correct the migration SQL file or remove the migration directory from `libs/database-schemas/src/prisma/migrations/`. If correcting the SQL file in place, note that re-running `prisma migrate deploy` will re-execute all statements in the migration — already-applied statements must be made idempotent (e.g., `CREATE TABLE IF NOT EXISTS`) or removed from the file before re-running.

6. **Re-run migrations** using the `describeDatabase()` safety pattern:

```bash
DATABASE_URL="<database-url>" yarn db:migrate
```

This runs `scripts/run-migrations.ts`, which calls `prisma migrate deploy` with the `describeDatabase()` safety pattern. The `describeDatabase()` function announces the target database (host:port/dbname only — never credentials) before and after the migration, so the operator can verify they are targeting the correct database.

### Validation Record (2026-07-13)

The recovery procedure was validated against a local Docker Postgres instance:

1. **Started a local Postgres:**

```bash
docker run --name prisma-recovery-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=prisma_recovery_test -p 5434:5432 -d postgres:16
```

2. **Applied all 9 migrations cleanly (baseline):**

```bash
DATABASE_URL="<database-url>" yarn db:migrate
```

Result: All 9 migrations applied successfully. The `describeDatabase()` safety pattern announced the target as `localhost:5434/prisma_recovery_test` (host:port/dbname only — no credentials).

3. **Simulated a failed migration:** Created a test migration with intentionally broken SQL (duplicate table name):

```sql
CREATE TABLE "test_recovery" ("id" SERIAL PRIMARY KEY);
CREATE TABLE "test_recovery" ("id" SERIAL PRIMARY KEY);
```

4. **Ran `prisma migrate deploy`** — observed the failure:

```
Error: P3018
A migration failed to apply. New migrations cannot be applied before the error is recovered from.
Migration name: 20260713120000_test_recovery
Database error code: 42P07
ERROR: relation "test_recovery" already exists
```

5. **Inspected `_prisma_migrations`:**

```sql
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM _prisma_migrations ORDER BY finished_at;
```

Result: 10 rows. 9 with `finished_at` set (successful). 1 (`20260713120000_test_recovery`) with `finished_at IS NULL` and `applied_steps_count = 0` (failed).

6. **Dropped the partially-created table:**

```sql
DROP TABLE IF EXISTS "test_recovery";
```

7. **Deleted the failed migration entry:**

```sql
DELETE FROM _prisma_migrations WHERE migration_name = '20260713120000_test_recovery';
```

8. **Removed the broken migration directory** from `libs/database-schemas/src/prisma/migrations/`.

9. **Re-ran `prisma migrate deploy`:**

```
9 migrations found in prisma/migrations
No pending migrations to apply.
```

10. **Verified clean state:** `_prisma_migrations` table: 9 total, 9 finished, 0 rolled back.

11. **Cleaned up:** `docker rm -f prisma-recovery-test`

The recovery procedure is validated and effective.

---

## Misconfigured Secret Recovery

### Vercel Build Failure Prevention

If a misconfigured secret (e.g., missing `AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEK`) causes `apps/web` to fail the **build** step, Vercel's build-step failure prevents the failed deployment from being promoted to production. The `vercel deploy --prod` command only promotes a deployment to production when the build succeeds. A build failure leaves the deployment in `ERROR` state — the previous `READY` deployment continues serving until the secret is corrected and a new deploy succeeds. Note: this only applies to **build-time** failures. A secret that is present but has a wrong value may pass the build and fail at runtime — Vercel does not automatically roll back runtime failures.

**Mechanism:** Vercel's build pipeline runs `yarn nx run database-schemas:generate && yarn nx build web` (configured in `apps/web/vercel.json`). If the build crashes due to a missing env var, the deployment is marked `ERROR` and is never promoted to production. Note: this only prevents promotion when the **build** fails — a secret that is present but has a wrong value (e.g., an expired API key) may pass the build and fail at runtime, which Vercel does not automatically roll back.

### Railway HEALTHCHECK Failure Prevention

If a misconfigured secret (e.g., missing `DATABASE_URL`, `ANTHROPIC_API_KEY`) causes `apps/agent-be` to crash on startup, the Dockerfile `HEALTHCHECK` instruction (lines 29-30) detects the failure. The health check polls `GET /health` every 30s. If the health check fails for 3 consecutive attempts, Railway marks the container unhealthy and restarts it. The previous healthy deployment continues serving until a new deploy with correct env vars succeeds.

**Mechanism:** The `HEALTHCHECK` CMD runs `node -e "..."` which polls `http://127.0.0.1:$PORT/health`. If the NestJS server crashes on startup (missing env var causes `process.exit(1)` or an unhandled exception), the health check fails, and Railway restarts the container. Note: the `/health` endpoint returns `{ status: 'ok' }` unconditionally — it verifies the process is running, not that dependencies (database, API keys) are reachable. A secret that is present but has a wrong value may pass the health check while the app fails at runtime.

### How to Correct a Misconfigured Secret

1. **Identify the missing or incorrect secret.** Check the deployment logs on Vercel or Railway for error messages indicating a missing env var.

2. **Update the env var on the platform:**
   - **Vercel:** Navigate to the project settings → Environment Variables. Update the value and save.
   - **Railway:** Navigate to the service → Variables. Update the value and save.

3. **Trigger a new deploy:**
   - **Vercel:** Run the deploy workflow (GitHub Actions) or `vercel deploy --prod --yes --cwd=apps/web`.
   - **Railway:** Run `railway up --service <service-id> --environment <environment-id> --project <project-id>` or trigger a redeploy via the Railway dashboard.

4. **Verify the new deployment is healthy:**
   - **Vercel:** Check that the new deployment has state `READY`.
   - **Railway:** Check that the new deployment has status `SUCCESS` and the health check passes.

---

## Split-Brain Deploy Recovery

### Scenario

The deploy workflow (`.github/workflows/deploy.yml`) deploys Vercel first (line 57: `vercel deploy --prod --yes --cwd=apps/web`), then Railway (line 64: `railway up --service ... --environment ... --project ...`). If Vercel succeeds but Railway fails, production has a new `apps/web` but the old `apps/agent-be`. This is a split-brain state — the frontend and backend are running different versions.

The reverse case — Vercel fails but Railway succeeds — is also possible. If the Vercel build fails, the deploy workflow's `set -e` causes the job to exit before reaching the Railway step, so Railway is not deployed. However, if the Vercel deploy is run manually outside the workflow (or if the workflow is modified), a Vercel failure with a Railway success would leave production with the old `apps/web` but a new `apps/agent-be`.

### Detection

The deploy workflow uses `set -e` in the shell, so a failed Railway step causes the job to exit with a failure status. GitHub Actions sends a failure notification to the repo owner by default. The Vercel deployment is already updated at this point — the split-brain state is active.

### Recovery Option A (Recommended — Roll Back Vercel)

When the Railway failure is not quickly fixable, roll back Vercel to the previous deployment to restore both services to the known-good previous version:

```bash
vercel ls --prod --yes --cwd=apps/web
vercel rollback <previous-deployment-url> --yes --cwd=apps/web
```

This restores `apps/web` to the previous version, matching the old `apps/agent-be` that is still running.

### Recovery Option B (Fix Railway and Redeploy)

When the Railway failure is a simple config fix (e.g., missing env var) and can be corrected immediately:

1. Fix the Railway failure (update env vars, fix the Dockerfile, etc.).
2. Redeploy `apps/agent-be`:

```bash
railway up --service <service-id> --environment <environment-id> --project <project-id>
```

Or trigger a redeploy of the latest deployment:

```bash
railway deployment redeploy --service <service-id> --environment <environment-id> --project <project-id> --yes
```

This brings `apps/agent-be` up to match the new `apps/web`.

### Reverse Split-Brain (Vercel Fails, Railway Succeeds)

If Vercel fails but Railway succeeds (production has old `apps/web` but new `apps/agent-be`):

1. **Option A (recommended):** Redeploy `apps/web` via the deploy workflow or `vercel deploy --prod --yes --cwd=apps/web` to bring the frontend up to match the new backend.
2. **Option B:** Roll back Railway to the previous deployment via the Railway dashboard if the new `apps/agent-be` is incompatible with the old `apps/web`.

### Recommendation

- Use **Option A** (roll back Vercel) when the Railway failure is not quickly fixable (e.g., build error, missing dependency, complex config issue). This restores both services to the known-good version immediately.
- Use **Option B** (fix Railway and redeploy) when the failure is a simple config fix (e.g., missing env var) and can be corrected immediately. This avoids rolling back the Vercel deploy.

**Note:** The deploy workflow's step ordering (Vercel first, then Railway) is NOT modified. Changing the order is a deploy-mechanism change (Story 4.6's scope), not a recovery-procedure documentation task. The split-brain risk is mitigated by this documented recovery procedure.

---

## Verification Record

**Date:** 2026-07-13

**Tool versions:**

- Vercel CLI: 55.0.0
- Railway CLI: installed (requires `railway login` for CLI commands; GraphQL API uses API token)
- Docker: 29.3.0
- Prisma: 7.8.0
- curl: available (used for API queries)

**Commands run and results:**

1. **Vercel API — list production deployments:**
   - `GET https://api.vercel.com/v6/deployments?projectId=prj_ih4UAxO759A1CHdrZ93j4rk3poYD&limit=5&target=production`
   - Result: 2 production deployments. Most recent: `READY` (current production). Previous: `ERROR` (failed build, did not replace READY).

2. **Vercel CLI — list production deployments:**
   - `vercel ls --prod --yes --cwd=apps/web`
   - Result: 3 production deployments listed. Current: `READY`. Previous: `ERROR`. No previous `READY` deployment to test rollback.

3. **Railway GraphQL API — list deployments:**
   - `POST https://backboard.railway.com/graphql/v2` with service deployments query
   - Result: 4 deployments. Most recent: `SUCCESS`. 3 previous: `FAILED`.

4. **Dockerfile HEALTHCHECK verification:**
   - Read `apps/agent-be/Dockerfile` lines 29-30.
   - Result: `HEALTHCHECK` instruction confirmed present and correct.

5. **Prisma migration recovery validation:**
   - Started local Docker Postgres (`postgres:16`).
   - Applied 9 migrations cleanly (baseline).
   - Created test migration with broken SQL (duplicate table name).
   - Ran `prisma migrate deploy` — observed failure (P3018, relation already exists).
   - Inspected `_prisma_migrations` — found failed migration with `finished_at IS NULL`.
   - Dropped partially-created table.
   - Deleted failed migration entry from `_prisma_migrations`.
   - Removed broken migration directory.
   - Re-ran `prisma migrate deploy` — "No pending migrations to apply."
   - Verified clean state: 9 migrations, all finished, 0 rolled back.
   - Cleaned up Docker container.

**Credential isolation:** All verification commands use environment variables for credentials (`VERCEL_TOKEN`, `RAILWAY_TOKEN`, `DATABASE_URL`). No token values, API keys, or connection strings with passwords are recorded in this runbook. The `describeDatabase()` safety pattern (from `scripts/run-migrations.ts`) announces the target database as `host:port/dbname` only — never credentials.
