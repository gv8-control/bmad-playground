# Database Backup and Restore

This runbook covers configuring automated backups for the Railway Postgres instance and testing the restore procedure. It documents Railway's built-in volume backup feature (dashboard-configured, API-verified), the restore test procedure (`pg_dump` + local Docker Postgres), integrity verification (row counts + sample records), and how to point `apps/agent-be` at a restored instance.

**Execution model:** Backup schedule configuration is human-executed via the Railway dashboard (the API can list schedules but cannot create or modify them — no `volumeInstanceBackupScheduleCreate` mutation exists). The restore test is agent-executable: `pg_dump` is read-only against production, and the restore is to a local Docker Postgres — no external service calls with side effects. Manual backup creation via `volumeInstanceBackupCreate` and volume restore via `volumeInstanceBackupRestore` are external service calls with side effects — the agent documents the commands; the human executes them.

**Railway's daily retention is 6 days, not 7.** AC-1 specifies "daily backups retained for 7 days." Railway's daily schedule retains for 6 days (platform-fixed, not configurable via API or dashboard). The combined daily + weekly schedule provides 6 days of daily backups + ~4 weeks of weekly backups. The 1-day gap is a platform limitation. The weekly backup (1 month retention) covers the gap — at no point is there less than 6 days of daily backup coverage. Building a custom solution to add 1 extra day is scope expansion (DP-5).

---

## Prerequisites

**Railway project details (operator reference):**

- Project ID: `30ab04b2-132c-440b-92ca-bc57be294d6f`
- Environment ID (production): `0c3802e5-d0a4-44c0-beec-ed6ff592f5e5`
- agent-be service ID: `4df7d0d1-0040-4395-89c8-bd166c4863cf`
- Workspace ID: `a1f06762-5fbd-431e-811f-5183b80576e5`
- Railway GraphQL endpoint: `https://backboard.railway.com/graphql/v2`
- `RAILWAY_TOKEN` is in `.env.local`. Export it before running curl commands: `export RAILWAY_TOKEN=$(grep '^RAILWAY_TOKEN=' .env.local | cut -d= -f2-)`
- `DATABASE_URL` is in `.env.local` (Railway Postgres connection string). Export it before running `pg_dump`: `export DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)`

**Postgres volume details:**

- Postgres volume mount path: `/var/lib/postgresql/data` (per Railway docs)
- Postgres service ID: NOT hardcoded — derive via the query in Section 1, Step 1
- Postgres volume instance ID: NOT hardcoded — derive via the query in Section 1, Step 2

**Tool requirements:**

- Docker is required for the local restore test (Section 2)
- `pg_dump` and `pg_restore` (PostgreSQL client tools) — install via system package manager if not available
- `curl` and `jq` for Railway API queries

---

## Section 1 — Backup Configuration (dashboard + API verification)

Railway's built-in volume backup feature provides scheduled backups for the Postgres volume. Backup schedules are configured via the Railway dashboard. The API can list schedules but cannot create or modify them — schedule configuration is dashboard-only.

**Backup schedule types (fixed retention, not configurable):**

| Schedule | Frequency | Retention |
|---|---|---|
| Daily | Every 24 hours | 6 days |
| Weekly | Every 7 days | 1 month (~4 weeks) |
| Monthly | Every 30 days | 3 months |

Enable both **Daily** and **Weekly** schedules for the Postgres volume to satisfy AC-1's "daily + weekly" requirement.

### Step 1 — Find the Postgres service ID (read-only API query)

```bash
curl --fail --max-time 30 -s -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { project(id: \"30ab04b2-132c-440b-92ca-bc57be294d6f\") { services { edges { node { id name } } } } }"}' | jq '.data.project.services.edges[].node'
```

Find the service with "postgres" in the name. Note the `id` — this is the `<postgres-service-id>`.

### Step 2 — Find the Postgres volume instance ID (read-only API query)

```bash
curl --fail --max-time 30 -s -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { project(id: \"30ab04b2-132c-440b-92ca-bc57be294d6f\") { volumes { edges { node { id name service { id name } } } } } }"}' | jq '.data.project.volumes.edges[].node'
```

Find the volume attached to the Postgres service (the one whose `service.id` matches the `<postgres-service-id>` from Step 1). The volume instance ID is the volume in the production environment. Note the `id` — this is the `<volume-instance-id>` used in subsequent queries.

### Step 3 — Configure backup schedules (human-executed, dashboard-only)

1. Navigate to the Railway project at `https://railway.com/project/30ab04b2-132c-440b-92ca-bc57be294d6f`.
2. Select the Postgres service.
3. Go to **Settings → Backups** tab.
4. Enable the **Daily** schedule (backs up every 24 hours, retained for 6 days).
5. Enable the **Weekly** schedule (backs up every 7 days, retained for 1 month / ~4 weeks).
6. Optionally enable the **Monthly** schedule (backs up every 30 days, retained for 3 months) for long-term retention.

**Note:** The API cannot create or modify backup schedules — no `volumeInstanceBackupScheduleCreate` mutation exists. Schedule configuration is dashboard-only.

### Step 4 — Verify backup schedules via API (read-only)

After the human configures schedules via the dashboard, verify via the Railway GraphQL API:

```bash
curl --fail --max-time 30 -s -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { volumeInstanceBackupScheduleList(volumeInstanceId: \"<volume-instance-id>\") { id name cron kind retentionSeconds createdAt } }"}' | jq '.data.volumeInstanceBackupScheduleList'
```

Verify both Daily and Weekly schedules exist in the response. The `kind` field indicates the schedule type (`DAILY`, `WEEKLY`, `MONTHLY`).

### Step 5 — List existing backups (read-only API query)

```bash
curl --fail --max-time 30 -s -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { volumeInstanceBackupList(volumeInstanceId: \"<volume-instance-id>\") { id name createdAt expiresAt usedMB referencedMB } }"}' | jq '.data.volumeInstanceBackupList'
```

### Step 6 — Create a manual backup (human-executed, side effects)

To create an ad-hoc backup (external service call with side effects — the human executes this):

```bash
curl --fail --max-time 30 -s -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { volumeInstanceBackupCreate(volumeInstanceId: \"<volume-instance-id>\") { id name createdAt } }"}' | jq '.data.volumeInstanceBackupCreate'
```

---

## Section 2 — Restore Procedure (pg_dump + local Docker Postgres)

The restore test uses `pg_dump` against the Railway Postgres and `pg_restore` to a local Docker Postgres. This is the simplest approach (DP-3) — read-only against production, local restore, no external service calls with side effects.

### Step 1 — Export the production database

```bash
pg_dump "$DATABASE_URL" -F c -f /tmp/backup.dump
```

If the connection requires SSL (Railway's Postgres image is SSL-enabled), add `--sslmode=require`:

```bash
pg_dump "$DATABASE_URL" --sslmode=require -F c -f /tmp/backup.dump
```

The `-F c` flag uses PostgreSQL's custom format for `pg_restore` compatibility.

### Step 2 — Start a local Docker Postgres

```bash
docker run --name restore-test -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=restore_test -p 5435:5432 -d postgres:16
```

Trust authentication (no password) avoids embedding a password in the `pg_restore` connection string, which would trigger the credential-isolation regression guard. The `pg_restore` command uses separate `--host`/`--port`/`--username`/`--dbname` flags with no connection string.

### Step 3 — Restore the dump

```bash
pg_restore --host localhost --port 5435 --username postgres --dbname restore_test --no-owner /tmp/backup.dump
```

The `--no-owner` flag skips ownership checks, allowing restore into a fresh database with a different superuser.

### Step 4 — Verify the restore (Section 3 below)

Proceed to Section 3 to verify data integrity.

### Step 5 — Clean up

```bash
docker rm -f restore-test && rm /tmp/backup.dump
```

---

## Section 3 — Integrity Verification (row counts + sample records)

After restoring, compare row counts and a sample of records between the production database and the restored instance. Run each query on both databases and compare the results.

**Connect to the production database:**

```bash
psql "$DATABASE_URL" -c "<sql-query>"
```

**Connect to the restored local database:**

```bash
psql --host localhost --port 5435 --username postgres --dbname restore_test -c "<sql-query>"
```

### Row count comparison

For each table, run the following query on both databases and compare the counts:

```sql
SELECT COUNT(*) FROM <table-name>;
```

Tables to verify (7 application tables + `_prisma_migrations` for completeness):

1. `users`
2. `oauth_credentials`
3. `repo_connections`
4. `artifacts`
5. `conversations`
6. `turns`
7. `cost_records`
8. `_prisma_migrations`

### Sample record comparison

For each table, run the following query on both databases and compare the 5 most recent rows:

```sql
SELECT * FROM <table-name> ORDER BY created_at DESC LIMIT 5;
```

Compare key fields (IDs, timestamps, foreign keys) between the production and restored databases. The records must match exactly.

**Note:** The `_prisma_migrations` table does not have a `created_at` column — use `ORDER BY finished_at DESC LIMIT 5` for that table instead.

---

## Section 4 — Pointing apps/agent-be at a Restored Instance

If a production restore is needed (not just a test), follow these steps to repoint `apps/agent-be` at a restored database.

### Step 1 — Restore the Railway volume backup (human-executed, side effects)

Restore via the Railway dashboard:

1. Navigate to the Postgres service in the Railway project.
2. Go to **Settings → Backups** tab.
3. Select the backup to restore and click **Restore**.

Or via the GraphQL API (external service call with side effects — the human executes this):

```bash
curl --fail --max-time 30 -s -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { volumeInstanceBackupRestore(volumeInstanceBackupId: \"<backup-id>\", volumeInstanceId: \"<volume-instance-id>\") { id name createdAt } }"}' | jq '.data.volumeInstanceBackupRestore'
```

### Step 2 — Deploy the staged restore

Railway stages the restore — click **Deploy** to apply. The old volume is unmounted but retained.

### Step 3 — Verify DATABASE_URL points at the restored volume

When restoring in-place (same project + environment), the `DATABASE_URL` env var on the agent-be service automatically points at the restored volume (same service, same connection string). No env var update is needed.

### Step 4 — If restoring to a different instance

If restoring to a different Railway Postgres service (not in-place), update `DATABASE_URL` on the agent-be service via the Railway dashboard or GraphQL API.

### Step 5 — Redeploy agent-be

```bash
railway up --service 4df7d0d1-0040-4395-89c8-bd166c4863cf --environment 0c3802e5-d0a4-44c0-beec-ed6ff592f5e5 --project 30ab04b2-132c-440b-92ca-bc57be294d6f
```

---

## Rollback Procedure

If a restore causes issues, revert by restoring the previous volume backup. The old volume is retained but unmounted after a restore — a previous backup can be restored to revert.

This rollback section is independently executable — it includes the commands to derive all needed IDs (volume instance ID, backup ID) without referencing the forward procedure.

### Step 1 — Find the Postgres volume instance ID

```bash
curl --fail --max-time 30 -s -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { project(id: \"30ab04b2-132c-440b-92ca-bc57be294d6f\") { volumes { edges { node { id name service { id name } } } } } }"}' | jq '.data.project.volumes.edges[].node'
```

Find the volume attached to the Postgres service. Note the `id` — this is the `<volume-instance-id>`.

### Step 2 — List available backups

```bash
curl --fail --max-time 30 -s -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { volumeInstanceBackupList(volumeInstanceId: \"<volume-instance-id>\") { id name createdAt expiresAt usedMB referencedMB } }"}' | jq '.data.volumeInstanceBackupList'
```

Select the backup from before the problematic restore. Note the `id` — this is the `<backup-id>`.

### Step 3 — Restore the previous backup (human-executed, side effects)

```bash
curl --fail --max-time 30 -s -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { volumeInstanceBackupRestore(volumeInstanceBackupId: \"<backup-id>\", volumeInstanceId: \"<volume-instance-id>\") { id name createdAt } }"}' | jq '.data.volumeInstanceBackupRestore'
```

### Step 4 — Deploy the staged rollback

Railway stages the restore — click **Deploy** in the Railway dashboard to apply.

### Step 5 — Redeploy agent-be

```bash
railway up --service 4df7d0d1-0040-4395-89c8-bd166c4863cf --environment 0c3802e5-d0a4-44c0-beec-ed6ff592f5e5 --project 30ab04b2-132c-440b-92ca-bc57be294d6f
```

---

## Verification Record

**Date:** 2026-07-14

### Backup schedule verification (pending human execution)

**Status:** Pending human execution of backup schedule configuration (Section 1, Step 3). The Railway API token in `.env.local` is not authorized — the human must configure Daily and Weekly backup schedules via the Railway dashboard (Settings → Backups tab on the Postgres service), then verify via the read-only API query in Section 1, Step 4.

### Restore test verification (validated 2026-07-14)

The restore test procedure (Section 2) was validated against the local development database (`bmad_easy_test` on `localhost:5432`). The production Railway restore test is pending the production `DATABASE_URL` (not available in the development environment).

**Tool versions:**
- `pg_dump` (PostgreSQL) 16.14
- `postgres` (PostgreSQL) 16.14 (Debian 16.14-1.pgdg13+1)
- Docker 29.3.0-1

**Commands run:**

```bash
pg_dump -U postgres -d bmad_easy_test -F c -f /tmp/backup.dump
docker run --name restore-test -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=restore_test -p 5435:5432 -d postgres:16
pg_restore --host localhost --port 5435 --username postgres --dbname restore_test --no-owner /tmp/backup.dump
```

**Row count comparison results (all matched):**

| Table | Source count | Restored count | Match |
|---|---|---|---|
| users | 3 | 3 | ✓ |
| oauth_credentials | 2 | 2 | ✓ |
| repo_connections | 3 | 3 | ✓ |
| artifacts | 162 | 162 | ✓ |
| conversations | 25 | 25 | ✓ |
| turns | 13 | 13 | ✓ |
| cost_records | 4 | 4 | ✓ |
| _prisma_migrations | 10 | 10 | ✓ |

**Sample record comparison results (all matched):**

Sample records (3 most recent by `created_at`) were compared for all 7 application tables plus `_prisma_migrations` (ordered by `finished_at`). All IDs matched exactly between source and restored databases.

**Clean up:**

```bash
docker rm -f restore-test && rm /tmp/backup.dump
```

**Credential isolation:** All verification commands use `$RAILWAY_TOKEN` and `$DATABASE_URL` as environment variable references. No token values, API keys, or connection strings with passwords are recorded in this runbook.
