---
baseline_commit: dd1fbf00254bada5e748fcc613c26c6a92cb3bf1
---

# Story 4.4: Run Prisma Migrations Against the Railway Postgres Instance

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the platform operator,
I want the existing `libs/database-schemas` migrations applied to the Railway Postgres instance,
so that the production database schema matches what both apps expect.

## Acceptance Criteria

1. **AC-1 (All existing migrations apply cleanly):** Given the Railway `DATABASE_URL` from Story 4.2, When `prisma migrate deploy` is run from `libs/database-schemas`, Then all existing migrations (9 as of 2026-07-12 — see Dev Notes for the full list) apply cleanly with no manual schema edits.

2. **AC-2 (Target database confirmed before and after):** Given the migration run, When it completes, Then the target database is confirmed (host:port/dbname only, no credentials logged) before and after, mirroring the safety pattern already used in `scripts/rotate-kek.ts`'s `describeDatabase()`.

## Tasks / Subtasks

- [x] **Task 1: Create `scripts/run-migrations.ts`** (AC: #1, #2)
  - [x] 1.1 Create `scripts/run-migrations.ts` with an **`export`ed** `describeDatabase()` function (copy from `scripts/rotate-kek.ts:51-59` — 8 lines, parses `DATABASE_URL` via `new URL()`, returns `host:port/dbname`, never logs credentials). Add `export` so the unit test (Task 6.2) can import it — the original in `rotate-kek.ts` is NOT exported (local function).
  - [x] 1.2 Script validates `DATABASE_URL` is set (exit 2 if missing, matching `rotate-kek.ts` pattern)
  - [x] 1.3 Script prints `Target database: ${describeDatabase(process.env.DATABASE_URL)}` BEFORE running migrations (the "before" confirmation — AC-2)
  - [x] 1.4 Script runs `prisma migrate deploy --config libs/database-schemas/prisma.config.ts` via `execSync` with `stdio: 'inherit'` (so Prisma's output is visible). Wrap in `try/catch` — `execSync` throws on non-zero exit code, so the catch block handles Task 1.5 (failure) and the try block's continuation handles Task 1.6 (success).
  - [x] 1.5 On migration failure: print `describeDatabase()` again and exit 1
  - [x] 1.6 On migration success: print `describeDatabase()` again (the "after" confirmation — AC-2) and log "Migrations applied successfully."

- [x] **Task 2: Update `package.json` `db:migrate` script** (AC: #1, #2)
  - [x] 2.1 Change `"db:migrate"` from `dotenv -e .env -- prisma migrate deploy --config libs/database-schemas/prisma.config.ts` to `dotenv -e .env -- ts-node --transpile-only scripts/run-migrations.ts` (wraps the existing migration command with the `describeDatabase()` safety pattern — AC-2)
  - [x] 2.2 Do NOT change `"db:migrate:status"` — it's a read-only status check, not a mutation, and doesn't need the safety wrapper

- [x] **Task 3: Fetch the Railway DATABASE_URL** (AC: #1)
  - [x] 3.1 Read `RAILWAY_TOKEN` from `.env.local` (value starts with `d49618b7`)
  - [x] 3.2 Query the Railway GraphQL API for the Postgres service's `DATABASE_URL` variable (reuse the pattern from `railway-project-structure.integration.spec.ts:172-203` — query `variables(projectId, environmentId, serviceId)` on the Postgres service)
  - [x] 3.3 Railway project ID: `30ab04b2-132c-440b-92ca-bc57be294d6f`, environment ID: `0c3802e5-d0a4-44c0-beec-ed6ff592f5e5` (production), Postgres service ID: `c5db0481-9e69-4a51-bed6-bca229431c02` (from Story 4.2 completion notes)
  - [x] 3.4 Confirm the returned `DATABASE_URL` starts with `postgresql://` — do NOT log the full connection string (it contains the Postgres password)

- [x] **Task 4: Run migrations against the Railway Postgres** (AC: #1, #2)
  - [x] 4.1 Run `DATABASE_URL=<railway-url> yarn db:migrate` (the `DATABASE_URL` env var takes precedence over `.env`'s local dev value — `dotenv` doesn't override existing env vars)
  - [x] 4.2 Verify the `describeDatabase()` output shows the Railway host (`tokaido.proxy.rlwy.net:42861` or similar), NOT the local dev database — abort if it shows the wrong database
  - [x] 4.3 Verify Prisma reports all 9 migrations applied (or "already applied" if re-run — `prisma migrate deploy` is idempotent)
  - [x] 4.4 Verify the "after" `describeDatabase()` output matches the "before" (same database)

- [x] **Task 5: Verify migrations applied** (AC: #1)
  - [x] 5.1 Run `DATABASE_URL=<railway-url> yarn db:migrate:status` — confirms all migrations are marked as applied
  - [x] 5.2 Optionally connect via `psql` or Prisma Studio and verify the `_prisma_migrations` table has 9 rows with `finished_at` not null
  - [x] 5.3 Verify key tables exist: `users`, `oauth_credentials`, `repo_connections`, `artifacts`, `conversations`, `turns`, `cost_records` (a quick `SELECT count(*) FROM <table>` for each — tables will be empty but must exist)

- [ ] **Task 6: Activate test scaffolds** (AC: #1, #2) — ATDD red-phase scaffolding already applied by TEA agent. See `_bmad-output/test-artifacts/atdd-checklist-4-4-run-prisma-migrations-against-the-railway-postgres-instance.md` for full details.
  - [x] 6.1 ~~Create `apps/agent-be/test/integration/railway-migrations.integration.spec.ts`~~ — **Scaffolded.** File exists with 3 `[P0]` tests (all `describe.skip()`): `_prisma_migrations` table has all 9 migration names, all have `finished_at` not null, key tables exist. **Activate:** remove `describe.skip()` after Story Task 4 (migrations applied to Railway Postgres). Set `DATABASE_URL` in env or `.env.local` before running.
  - [x] 6.2 ~~Create `apps/agent-be/test/unit/run-migrations.spec.ts`~~ — **Scaffolded.** File exists with 11 `[P0]` tests (all `describe.skip()`): `describeDatabase()` valid URL parsing (3), credential isolation invariant (3), unparseable URL fallback (2), `execSync` command guard regression (3 — credential isolation + input injection). **Activate:** remove `describe.skip()` one block at a time after implementing `describeDatabase()` (Task 1.1) and `main()` (Tasks 1.2-1.6) in the stub `scripts/run-migrations.ts`.
  - [x] 6.3 ~~Update ATDD checklist~~ — **Created.** `_bmad-output/test-artifacts/atdd-checklist-4-4-run-prisma-migrations-against-the-railway-postgres-instance.md` documents the test plan, red-phase status, E2E deferral check, and regression guard template.
  - [x] 6.4 **Stub file created:** `scripts/run-migrations.ts` — exports `describeDatabase()` and `main()` as test seams (both throw "not implemented"). The `require.main === module` guard prevents `main()` from running when imported in tests. **Implement** the functions per Task 1, then activate the test blocks.
  - [x] 6.5 **Run activated unit tests:** `yarn nx test agent-be -- --testPathPattern=run-migrations` — verify all 11 tests pass after implementing `describeDatabase()` and `main()`.
  - [x] 6.6 **Run activated integration tests:** `yarn nx test-integration agent-be -- --testPathPatterns=railway-migrations` — verify all 3 tests pass after migrations are applied to Railway Postgres.

## Dev Notes

### Deferred Work Check

**Checked:** `_bmad-output/implementation-artifacts/deferred-work.md` was scanned for deferred findings matching file paths or components in scope for this story's code changes.

**Result: No deferred findings in scope.**

Story 4.4 creates `scripts/run-migrations.ts` (NEW), modifies `package.json` (the `db:migrate` script line), and creates two new test files. It does NOT modify any existing source code files that have deferred findings.

**Checked but not in scope:**

- **NFR-1 (from 4-3 review):** `expect(vars).toHaveProperty('DATABASE_URL')` at `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:200` prints secrets on failure. Story 4.4 does NOT modify this file — migration verification tests go in a new file (`railway-migrations.integration.spec.ts`). If the dev chooses to extend the existing railway test file instead, pull this fix in: replace `expect(vars).toHaveProperty('DATABASE_URL')` with `expect(Object.keys(vars)).toContain('DATABASE_URL')` (~5 min, per `project-context.md` "Secret-aware test assertions" rule).
- **Migration CREATE TABLE has no IF NOT EXISTS guard** (deferred-work.md line 50): `libs/database-schemas/src/prisma/migrations/.../migration.sql` — this story runs migrations as-is, it does NOT modify migration SQL files. The deferred note says "Normal Prisma workflow prevents this via the migration table; idempotency via SQL guards was not added by design." Accepted tradeoff, not a bug to fix (DP-5).
- **Token parser doesn't strip quotes** (deferred-work.md line 380): `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:23` — not in scope, story doesn't touch this file.

### Decisions (per decision-policy.md)

**Decision (DP-2):** AC-1 in `epics.md` says "all three existing migrations" but there are actually 9 migrations as of 2026-07-12. The epics file was written on 2026-07-03 when only 3 migrations existed (the Epic 1 migrations). Since then, Epics 2 and 3 added 6 more migrations (Artifact model, Artifact index, `last_synced_at`, Conversation+Turn models, CostRecord model, Conversation sandbox state). The semantic intent is "all existing migrations apply cleanly" — the count "three" is stale. Amended AC-1 to reflect the actual count (9) and list them in Dev Notes. The higher-authority artifact (epics.md) should also be amended, but that is a documentation change outside this story's code scope — flag it for the PM.

**Decision (DP-3):** Create `scripts/run-migrations.ts` that wraps `prisma migrate deploy` with the `describeDatabase()` safety pattern, rather than running raw `prisma migrate deploy` with manual `node -e` checks before/after. This mirrors the `scripts/rotate-kek.ts` pattern (operational script with integrated safety checks), makes the safety check permanent (future migration runs also get it), and is ~30 lines of code. The alternative (manual `node -e` one-liners) is a one-off that won't be repeated for future migrations.

**Decision (DP-3):** Copy the `describeDatabase()` function from `scripts/rotate-kek.ts:51-59` into `scripts/run-migrations.ts` rather than extracting it to a shared utility. The function is 8 lines. Both scripts are in the `scripts/` directory (operational scripts, not application code). The "deliberate cross-service logic duplication" pattern in `project-context.md` applies to `apps/web` vs `apps/agent-be` duplication — extracting to `scripts/lib/describe-database.ts` would add module resolution complexity for a trivial function. When a third script needs it, extract then.

**Decision (DP-3):** Update the existing `package.json` `db:migrate` script to use the wrapper (`ts-node --transpile-only scripts/run-migrations.ts`) rather than keeping the wrapper as a separate script. This makes the safety check the default for all future migration runs. The `db:migrate:status` script stays unchanged — it's read-only and doesn't need the safety wrapper.

**Decision (DP-5):** Do NOT modify any existing migration SQL files. `prisma migrate deploy` applies them as-is. The deferred finding about missing `IF NOT EXISTS` guards (deferred-work.md line 50) is an accepted tradeoff documented in the original story review.

**Decision (DP-5):** Do NOT create a new `libs/database-schemas` test directory or migration-specific Nx target. Migration verification tests go in `apps/agent-be/test/integration/` (the existing integration test location). The `libs/database-schemas` package is a Prisma library without test infrastructure — adding it is scope creep.

### Architecture Compliance

**Data Architecture (architecture.md:244-248):**
- "PostgreSQL, Railway-hosted (single instance for MVP)." ✓ This story applies migrations to that instance.
- "Validation/migrations: Migrations run from `libs/database-schemas` against the shared Railway Postgres instance." ✓ `prisma migrate deploy --config libs/database-schemas/prisma.config.ts` runs from `libs/database-schemas`.

**Implementation Sequence (architecture.md:297):**
- Step 2: "Provision Railway Postgres; define the Prisma schema in `libs/database-schemas`; run initial migration." ✓ This story runs the migrations against the provisioned Railway Postgres (Story 4.2 provisioned the instance).

**Infrastructure & Deployment (architecture.md:282-290):**
- "Environments: production only for MVP, no separate staging." ✓ Migrations run against the production Railway Postgres (the only environment).

### Library / Framework Requirements

- **Prisma ^7.8.0** — `prisma migrate deploy` applies pending migrations from `libs/database-schemas/src/prisma/migrations/`. The CLI is available at `node_modules/.bin/prisma` (direct dependency). Config file: `libs/database-schemas/prisma.config.ts` (specifies `schema: 'src/prisma/schema.prisma'` and `datasource: { url: process.env['DATABASE_URL'] }`).
- **ts-node 10.9.1** — runs `scripts/run-migrations.ts` via `ts-node --transpile-only` (same as `rotate-kek.ts`). `--transpile-only` skips type-checking for faster startup (the script is simple enough that type errors are unlikely).
- **dotenv** — `dotenv -e .env` in the `db:migrate` script loads `.env` into `process.env`. Environment variables set by the caller (e.g., `DATABASE_URL=<railway-url> yarn db:migrate`) take precedence — dotenv doesn't override existing env vars.

### File Structure Requirements

**Files to CREATE (NEW):**

| File | What it does |
|---|---|
| `scripts/run-migrations.ts` | Wraps `prisma migrate deploy` with the `describeDatabase()` safety pattern (announce target before, confirm after). ~30 lines. Mirrors `scripts/rotate-kek.ts` structure. |
| `apps/agent-be/test/integration/railway-migrations.integration.spec.ts` | Integration test: connects to Railway Postgres via Prisma client, verifies `_prisma_migrations` table has all 9 entries with `finished_at` not null. |
| `apps/agent-be/test/unit/run-migrations.spec.ts` | Unit test: `describeDatabase()` parses URLs correctly, never logs credentials. |
| `_bmad-output/test-artifacts/atdd-checklist-4-4-run-prisma-migrations-against-the-railway-postgres-instance.md` | ATDD checklist documenting the test plan. |

**Files to MODIFY:**

| File | What changes |
|---|---|
| `package.json` | `db:migrate` script changed from `dotenv -e .env -- prisma migrate deploy --config libs/database-schemas/prisma.config.ts` to `dotenv -e .env -- ts-node --transpile-only scripts/run-migrations.ts`. One line. |

**Files NOT to modify (preserved interactions — do NOT regress):**

| File | Why preserved |
|---|---|
| `libs/database-schemas/prisma.config.ts` | Already correctly specifies schema path and datasource URL from `process.env['DATABASE_URL']`. No changes needed. |
| `libs/database-schemas/project.json` | Nx `generate` target runs `prisma generate`. Not related to migrations. No changes needed. |
| `libs/database-schemas/src/prisma/migrations/*` | Migration SQL files apply as-is via `prisma migrate deploy`. Do NOT edit migration SQL (DP-5). |
| `libs/database-schemas/src/prisma/schema.prisma` | Schema is the source of truth for the Prisma client. Migrations were generated from it. No changes needed. |
| `scripts/rotate-kek.ts` | The `describeDatabase()` function is COPIED from here, not extracted. No changes to `rotate-kek.ts`. |
| `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts` | Railway API structure tests (Stories 4.2 + 4.3). Migration verification goes in a new file. If extending this file instead, pull in NFR-1 fix (see Deferred Work Check). |
| `.github/workflows/test.yml` | CI deploy job is Story 4.6, not this story. |

### Current State of Key Code (READ BEFORE IMPLEMENTING)

**`package.json` — existing db scripts (lines ~15-17):**
```json
"db:migrate": "dotenv -e .env -- prisma migrate deploy --config libs/database-schemas/prisma.config.ts",
"db:migrate:status": "dotenv -e .env -- prisma migrate status --config libs/database-schemas/prisma.config.ts"
```
`db:migrate` runs `prisma migrate deploy` with `DATABASE_URL` from `.env` (local dev). The caller can override `DATABASE_URL` by setting it in the environment: `DATABASE_URL=<railway-url> yarn db:migrate`.

**`scripts/rotate-kek.ts:51-59` — `describeDatabase()` function to COPY:**
```typescript
function describeDatabase(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    // host:port and /dbname only — never the userinfo (credentials).
    return `${url.host}${url.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}
```
Called at line 100: `console.log(\`Target database: ${describeDatabase(process.env.DATABASE_URL)}\`)` — announces the target BEFORE any read/write so the operator can abort if it's the wrong database.

**`libs/database-schemas/prisma.config.ts` — Prisma config:**
```typescript
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'src/prisma/schema.prisma',
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
```
Reads `DATABASE_URL` from `process.env`. The `--config` flag in `prisma migrate deploy` points to this file.

**`libs/database-schemas/src/prisma/migrations/` — all 9 migrations (in order):**
1. `20260618192551_init_users` — `users` table (Epic 1)
2. `20260619000000_add_oauth_credential_and_repo_connection` — `oauth_credentials` + `repo_connections` (Epic 1)
3. `20260702000000_backlog_hardening_aad_kekid_constraints` — `kekId` column, AAD constraints (Epic 1)
4. `20260703022052_add_artifact_model` — `artifacts` table (Epic 2, Story 2.1)
5. `20260703091142_add_artifact_last_modified_index` — index on `artifacts.last_modified_at` (Epic 2, Story 2.1)
6. `20260703110000_add_repo_connection_last_synced_at` — `last_synced_at` column on `repo_connections` (Epic 2, Story 2.2)
7. `20260704050001_add_conversation_and_turn_models` — `conversations` + `turns` tables (Epic 3, Story 3.1)
8. `20260706000000_add_cost_record_model` — `cost_records` table (Epic 3, Story 3.8)
9. `20260707000000_add_conversation_sandbox_state` — `sandbox_id` + `sandbox_status` columns on `conversations` (Epic 3, Story 3.12)

**`apps/agent-be/test/integration/railway-project-structure.integration.spec.ts` — Railway API query pattern to REUSE:**
Lines 172-203 show how to query the Postgres service's `DATABASE_URL` via the Railway GraphQL API. The query uses `variables(projectId, environmentId, serviceId)` and parses the response. The `getRailwayToken()` function (lines 22-40) reads `RAILWAY_TOKEN` from `process.env` or `.env.local`.

**Railway project details (from Story 4.2 completion notes):**
- Project ID: `30ab04b2-132c-440b-92ca-bc57be294d6f`
- Environment ID: `0c3802e5-d0a4-44c0-beec-ed6ff592f5e5` (production)
- Postgres service ID: `c5db0481-9e69-4a51-bed6-bca229431c02` (name: `PostgreSQL`)
- TCP proxy endpoint: `tokaido.proxy.rlwy.net:42861` (application port 5432)
- `RAILWAY_TOKEN` in `.env.local` (value starts with `d49618b7`)

### Project Structure Notes

- `scripts/run-migrations.ts` lives in `scripts/` alongside `rotate-kek.ts` — both are operational scripts run via `yarn <script-name>` with `dotenv -e .env` loading environment variables.
- Migration verification tests go in `apps/agent-be/test/integration/` (the existing integration test location) — NOT in `libs/database-schemas/` (which has no test infrastructure).
- The unit test for `describeDatabase()` goes in `apps/agent-be/test/unit/` — this is a compromise; the function belongs to `scripts/run-migrations.ts` but there's no `scripts/test/` directory. The test imports the **exported** function from the script file (Task 1.1 adds `export` to the function). If `ts-node` module resolution is problematic, inline the function in the test and test it directly (the function is 8 lines).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4] — Story definition and ACs (lines 1007-1021)
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — Migrations run from `libs/database-schemas` against Railway Postgres (line 248)
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Sequence] — Step 2: provision Postgres, run initial migration (line 297)
- [Source: _bmad-output/implementation-artifacts/4-2-provision-the-railway-project-with-postgres-for-apps-agent-be.md] — Railway project IDs, Postgres service ID, DATABASE_URL provisioning (completion notes lines 300-308)
- [Source: _bmad-output/implementation-artifacts/4-3-add-a-dockerfile-for-apps-agent-be.md] — Previous story: DATABASE_URL set as reference variable on agent-be service, Railway API patterns
- [Source: scripts/rotate-kek.ts:51-59] — `describeDatabase()` function to copy
- [Source: scripts/rotate-kek.ts:100] — `describeDatabase()` called before any read/write (safety pattern)
- [Source: libs/database-schemas/prisma.config.ts] — Prisma config: schema path + datasource URL from `process.env`
- [Source: libs/database-schemas/src/prisma/migrations/] — 9 migration directories
- [Source: package.json] — existing `db:migrate` and `db:migrate:status` scripts
- [Source: apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:22-40,172-203] — Railway token reading + DATABASE_URL query pattern

### Previous Story Intelligence

This is the fourth story in Epic 4. The previous story (4.3: Add a Dockerfile for `apps/agent-be`) is complete. Key learnings from Stories 4.2 and 4.3 that apply here:

- **Railway GraphQL API:** `RAILWAY_TOKEN` in `.env.local` is account/workspace-scoped and works with the GraphQL API at `https://backboard.railway.com/graphql/v2`. The `variables(projectId, environmentId, serviceId)` query returns service variables (may be a JSON string or parsed object — handle both).
- **Secret handling:** Never log the full `DATABASE_URL` connection string (it contains the Postgres password). Record only that it exists and note host:port. The `describeDatabase()` function in `rotate-kek.ts` is the canonical pattern — it parses the URL and returns `host:port/dbname` only.
- **Idempotency:** `prisma migrate deploy` is idempotent — re-running it reports "already applied" for existing migrations. Check with `prisma migrate status` first if unsure.
- **DP-3 pattern:** Pick the simplest reversible option. Stories 4.2 and 4.3 used the GraphQL API and existing tooling. This story uses the existing `prisma migrate deploy` CLI, wrapped in a safety-check script.
- **File preservation:** Explicitly list files NOT to modify and why. This prevents scope creep (DP-5).
- **Test file location:** Integration tests for Railway go in `apps/agent-be/test/integration/`. The existing `railway-project-structure.integration.spec.ts` has the `getRailwayToken()` helper and Railway API query patterns to reuse.

### Git Intelligence

Recent commits (last 5):
```
dd1fbf0 docs(epics): complete story 4.3 dockerfile for agent-be
b52e129 Merge remote-tracking branch 'origin/main' into feat/epic-4
acfaf82 feat(n8n): add session trace recording to develop-story playbook (#23)
8ac530c chore(nx): remove dead n8n nx project wrapper (#24)
0754701 fix(devcontainer): restart n8n after workflow import to register webhooks (#22)
```

The `feat/epic-4` branch is being worked on. Stories 4.1 (Vercel), 4.2 (Railway project + Postgres), and 4.3 (Dockerfile) are complete and committed. The Railway project `bmad-easy` exists with a Postgres service (provisioned with `DATABASE_URL`) and an agent-be service (Dockerfile configured, env vars pending Story 4.5). This story applies the Prisma migrations to the Railway Postgres.

### Latest Technical Information

- **`prisma migrate deploy` behavior:** Applies all pending migrations in chronological order (by migration directory timestamp prefix). Creates a `_prisma_migrations` table in the target database to track which migrations have been applied. Idempotent — re-running reports "already applied" for existing migrations. Does NOT create migrations (that's `prisma migrate dev`); only applies existing ones.
- **`prisma migrate status` behavior:** Reports which migrations are applied and which are pending. Read-only — safe to run anytime. Useful for verification after `migrate deploy`.
- **dotenv precedence:** `dotenv -e .env` loads `.env` into `process.env`, but does NOT override existing environment variables. So `DATABASE_URL=<railway-url> yarn db:migrate` uses the Railway URL, not the local dev URL from `.env`. This is the standard `dotenv` behavior.
- **Railway TCP proxy:** The Railway Postgres service is accessible via a TCP proxy endpoint (`tokaido.proxy.rlwy.net:42861` as of Story 4.2). The `DATABASE_URL` contains this proxy endpoint. The proxy is stable but the port may change if the Postgres service is recreated — always fetch the current `DATABASE_URL` from the Railway API rather than hardcoding.

### Important Implementation Notes

1. **The AC says "three migrations" but there are nine.** The epics.md AC-1 was written on 2026-07-03 when only 3 Epic 1 migrations existed. Since then, Epics 2 and 3 added 6 more migrations. The story spec AC-1 is amended to "all existing migrations (9 as of 2026-07-12)" per DP-2 (semantic intent over literal text). The dev agent should verify all 9 apply, not just 3.

2. **`DATABASE_URL` must be set in the environment, not in `.env`.** The Railway `DATABASE_URL` is NOT in `.env` (which has the local dev Postgres URL). The dev agent must fetch it from the Railway API and set it in the environment: `DATABASE_URL=<railway-url> yarn db:migrate`. The `describeDatabase()` output will confirm the target before any migration runs.

3. **`describeDatabase()` is copied, not imported.** The function is 8 lines. Both `rotate-kek.ts` and `run-migrations.ts` are in `scripts/`. Extracting to a shared module adds complexity for a trivial function. Copy it.

4. **`prisma migrate deploy` runs from the workspace root.** The `--config libs/database-schemas/prisma.config.ts` flag points to the config file, which specifies `schema: 'src/prisma/schema.prisma'` (relative to `libs/database-schemas/`). The `execSync` call in `run-migrations.ts` should run from the workspace root (or set `cwd` appropriately).

5. **Do NOT run `prisma migrate dev` or `prisma db push`.** `migrate dev` is for development (creates new migrations). `db push` bypasses migrations. Only `prisma migrate deploy` should be used against the production Railway Postgres.

6. **The `db:migrate` script change is backward-compatible.** The new `run-migrations.ts` wrapper calls the same `prisma migrate deploy` command — it just adds `describeDatabase()` before and after. Local dev migration runs (`yarn db:migrate` without overriding `DATABASE_URL`) still work: `describeDatabase()` shows the local dev database, migrations apply as before.

7. **Migration verification test needs a Prisma client connection.** The integration test (`railway-migrations.integration.spec.ts`) connects to the Railway Postgres using the Prisma client (from `@bmad-easy/database-schemas`) and queries the `_prisma_migrations` table via `$queryRaw`. The test needs `DATABASE_URL` in the environment — use the same `getRailwayToken()` → fetch `DATABASE_URL` from Railway API pattern, OR read it from `.env.local` if the dev agent adds it there temporarily. Do NOT commit the Railway `DATABASE_URL` to any file. The Prisma client is constructed via the `@prisma/adapter-pg` adapter pattern (`new PrismaPg({ connectionString })` → `new PrismaClient({ adapter })`), matching `scripts/rotate-kek.ts`, `apps/web/src/lib/prisma.ts`, and `apps/agent-be/src/prisma/prisma.service.ts`. The `schema.prisma` datasource block has no `url` property (it's in `prisma.config.ts`), so the legacy `datasources: { db: { url } }` constructor option does not apply.

8. **`prisma migrate deploy` output includes migration names.** The CLI prints which migrations were applied (e.g., "Applying migration `20260618192551_init_users`"). The dev agent should verify all 9 migration names appear in the output. If any are missing, check `prisma migrate status` for pending migrations.

### Testing Approach

- **Unit test (`run-migrations.spec.ts`):** Tests the `describeDatabase()` function in isolation. Validates it parses valid `postgresql://` URLs, returns `host:port/dbname`, and never includes credentials (username/password). Also test the unparseable-URL fallback returns `'(unparseable DATABASE_URL)'`.

- **Integration test (`railway-migrations.integration.spec.ts`):** Connects to the Railway Postgres via Prisma client and verifies the `_prisma_migrations` table contains all 9 expected migration names with `finished_at` not null. This test requires `DATABASE_URL` in the environment (Railway Postgres). It follows the same `getRailwayToken()` pattern as `railway-project-structure.integration.spec.ts` for fetching the `DATABASE_URL` from the Railway API, OR reads `DATABASE_URL` directly from `process.env` / `.env.local`.

- **Manual verification (Task 5):** `yarn db:migrate:status` confirms all migrations are applied. Optionally connect via `psql` or Prisma Studio to verify tables exist.

- **No E2E tests.** Browser-level E2E tests cannot verify database migrations. The integration test is the appropriate level.

## Dev Agent Record

### Agent Model Used

glm-5.2 (opencode)

### Debug Log References

- **Railway Postgres crash-loop (resolved):** The Railway Postgres container was crash-looping because `initdb` failed with `directory "/var/lib/postgresql/data" exists but is not empty` — the volume mount contained a `lost+found` directory. Fixed by setting the `PGDATA` environment variable to `/var/lib/postgresql/data/pgdata` (a subdirectory) via the Railway GraphQL API `variableUpsert` mutation. After the fix, Postgres initialized successfully and accepted connections. The `railway` database did not exist in the fresh cluster — created it manually via `CREATE DATABASE railway` before running migrations.

### Completion Notes List

- **Task 1 (Complete):** Implemented `scripts/run-migrations.ts` with exported `describeDatabase()` (copied from `rotate-kek.ts:51-59`, added `export`) and `main()` function. `main()` validates `DATABASE_URL` (exit 2 if missing), prints target database before, runs `prisma migrate deploy --config libs/database-schemas/prisma.config.ts` via `execSync` with `stdio: 'inherit'`, prints target database after on success (exit 1 on failure). The `execSync` command is a static literal — `DATABASE_URL` is never interpolated (credential isolation + input injection invariants verified by regression guard tests).

- **Task 2 (Complete):** Updated `package.json` `db:migrate` script from `dotenv -e .env -- prisma migrate deploy --config libs/database-schemas/prisma.config.ts` to `dotenv -e .env -- ts-node --transpile-only scripts/run-migrations.ts`. Verified backward compatibility: `yarn db:migrate` against local dev database shows `Target database: localhost:5432/bmad_easy_test`, runs migrations, confirms success. `db:migrate:status` left unchanged (read-only).

- **Task 3 (Complete):** Fetched Railway `DATABASE_URL` via Railway GraphQL API `variables(projectId, environmentId, serviceId)` query. Confirmed starts with `postgresql://`. Safe `describeDatabase()` output: `tokaido.proxy.rlwy.net:42861/railway`. Full URL stored in temp file (never logged).

- **Task 4 (Complete):** Ran `DATABASE_URL=<railway-url> yarn db:migrate` — all 9 migrations applied cleanly. `describeDatabase()` confirmed target before and after (AC-2): `tokaido.proxy.rlwy.net:42861/railway`. Prisma reported all 9 migration names applied.

- **Task 5 (Complete):** Verified via `DATABASE_URL=<railway-url> yarn db:migrate:status` — "Database schema is up to date!" Confirmed `_prisma_migrations` table has 9 rows with `finished_at` NOT NULL. All 7 key tables exist (`users`, `oauth_credentials`, `repo_connections`, `artifacts`, `conversations`, `turns`, `cost_records`).

- **Task 6.5 (Complete):** Activated all 11 unit test scaffolds by removing `describe.skip()` from 4 blocks. All 11 tests pass. Removed red-phase markers from test file header. Added `eslint-disable` for `@nx/enforce-module-boundaries` on the cross-project import (scripts/ is not an Nx project).

- **Task 6.6 (Complete):** Activated integration test scaffolds by removing `describe.skip()`. All 3 tests pass with Railway `DATABASE_URL` in environment. Removed red-phase markers from test file header.

- **Infrastructure fix:** Set `PGDATA=/var/lib/postgresql/data/pgdata` on the Railway Postgres service via Railway GraphQL API to resolve the `initdb` crash-loop caused by `lost+found` in the volume mount root. Created the `railway` database manually in the fresh Postgres cluster.

### File List

- `scripts/run-migrations.ts` — MODIFIED (implemented `describeDatabase()` and `main()`, removed stub markers)
- `apps/agent-be/test/unit/run-migrations.spec.ts` — MODIFIED (removed `describe.skip()` from all 4 blocks, removed red-phase header, added eslint-disable for cross-project import)
- `apps/agent-be/test/integration/railway-migrations.integration.spec.ts` — MODIFIED (removed `describe.skip()`, removed red-phase header)
- `package.json` — MODIFIED (`db:migrate` script updated to use `run-migrations.ts` wrapper)
- `_bmad-output/test-artifacts/atdd-checklist-4-4-run-prisma-migrations-against-the-railway-postgres-instance.md` — MODIFIED (removed red-phase markers, updated implementation checklist, updated frontmatter)
- `_bmad-output/implementation-artifacts/4-4-run-prisma-migrations-against-the-railway-postgres-instance.md` — MODIFIED (baseline_commit frontmatter, task checkboxes, dev agent record, status)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED (story status → review)

## TEA Automate Validation (2026-07-12)

### Validation Summary

**Result: PASS** — All 17 tests pass (14 unit + 3 integration). No skipped tests. No production code modified.

### Skipped Tests Check

No skipped tests found in either test file. All 14 pre-existing tests (11 unit + 3 integration) were active.

### Coverage Gap Found and Resolved

**Gap:** AC-2 requires "the target database is confirmed before and after" — the pre-existing tests verified `describeDatabase()` in isolation (8 tests) and the `execSync` command string for credential isolation (3 tests), but no test explicitly verified `main()`'s behavioral flow (before/after logging, exit codes).

**Decision (DP-4):** Test-only change — generated 3 missing `[P0]` unit tests autonomously. No production code modified. No existing tests modified.

**Tests generated (in `apps/agent-be/test/unit/run-migrations.spec.ts`):**
1. `[P0] exits with code 2 when DATABASE_URL is not set`
2. `[P0] logs target database before and after on success (AC-2)`
3. `[P0] logs target database before and after on failure, exits with code 1 (AC-2)`

All 3 new tests passed on first run. No healing needed.

### Test Execution Results

- Unit tests: 14 passed (11 pre-existing + 3 generated)
- Integration tests: 3 passed
- Full agent-be unit suite: 361 passed (no regressions)

### Validation Report

Full validation report at `_bmad-output/test-artifacts/automate-validation-report-4-4.md`.

## Change Log

- 2026-07-12: Story 4.4 implementation complete — `scripts/run-migrations.ts` wrapper with `describeDatabase()` safety pattern, `package.json` `db:migrate` updated, 9 Prisma migrations applied to Railway Postgres, 14 tests activated and passing (11 unit + 3 integration).
- 2026-07-12: TEA automate validation — found AC-2 coverage gap (`main()` behavioral flow), generated 3 missing `[P0]` unit tests (DP-4). All 17 tests pass (14 unit + 3 integration). No production code modified.

### Review Findings

- [x] [Review][Patch] Vacuous env credential isolation test — `if` guard makes `expect` unreachable, test passes vacuously [apps/agent-be/test/unit/run-migrations.spec.ts:122-125]
- [x] [Review][Patch] `getDatabaseUrl()` hand-rolled `.env.local` parser doesn't strip quotes, inline comments, or `export` prefix [apps/agent-be/test/integration/railway-migrations.integration.spec.ts:56-57]
- [x] [Review][Patch] Error object swallowed in catch block — no diagnostic context on migration failure [scripts/run-migrations.ts:35]

### NFR Evidence Audit Findings (2026-07-12)

_Audit scope: NFR-specific issues only (reliability, security, maintainability). Functional correctness verified — all 370 agent-be unit tests pass including 14 run-migrations tests._

- [ ] [Review][NFR] **[HIGH]** Missing `timeout` on `execSync` call — Reliability NFR. `execSync('prisma migrate deploy ...', { stdio: 'inherit' })` at `scripts/run-migrations.ts:32-34` has no `timeout` option. A hung `prisma migrate deploy` (Railway TCP proxy drop, Postgres lock-wait, network partition) blocks the script indefinitely with no bounded execution time. The canonical pattern (`scripts/rotate-kek.ts`) uses Prisma client directly, which inherits `pg` driver connection timeouts; `execSync` has no such inherited protection. **Remediation:** Add `timeout` (e.g., `120_000` ms) and `killSignal: 'SIGTERM'` to the `execSync` options object. Consider making it env-configurable (`MIGRATION_TIMEOUT_MS`) following the env-configured numeric threshold IIFE pattern from `project-context.md` (parse with `parseFloat`, validate `Number.isFinite && > 0`, fall back to default). Add a regression-guard test asserting the `timeout` option is present on the `execSync` call. [scripts/run-migrations.ts:32-34]

- [ ] [Review][NFR] **[LOW]** `$queryRawUnsafe` with interpolated table name — Security NFR (test code). `prisma.$queryRawUnsafe(\`SELECT count(*)::int as count FROM "${table}"\`)` at `apps/agent-be/test/integration/railway-migrations.integration.spec.ts:119-121` uses Prisma's explicitly-unsafe API with an interpolated identifier. The input (`EXPECTED_TABLES` constant array) is hardcoded, so there is no live injection vector. However, the same file uses safe `$queryRaw` tagged templates for the other two queries (lines 89, 104) — the inconsistency models a pattern a future developer could copy with user-controlled input. SQL does not support parameterized identifiers, so `$queryRaw` cannot replace this directly. **Remediation:** Add a whitelist validation guard before interpolation (e.g., `if (!/^[a-z_]+$/.test(table)) throw new Error(...)`), or add a comment documenting that `table` is a hardcoded constant and why `$queryRawUnsafe` is the only option for dynamic table names. [apps/agent-be/test/integration/railway-migrations.integration.spec.ts:119-121]

- [ ] [Review][NFR] **[LOW]** `console.error(err)` dumps full `ExecSyncError` object — Maintainability NFR. `console.error(err)` at `scripts/run-migrations.ts:36` dumps the full error object (`stderr`, `stdout`, `pid`, `signal`, `status`, `cmd`, stack trace). Since `stdio: 'inherit'` already piped Prisma's stdout/stderr to the parent process in real-time, the `stderr`/`stdout` properties in the error object are duplicates of output the operator already saw. Prisma redacts passwords in connection error strings, so there is no credential leak — but the full dump is noisy and the `describeDatabase()` call on line 37 already provides the target context. Distinct from the resolved "Error object swallowed" finding above (that was about absence of logging; this is about verbosity of the dump). **Remediation:** Replace `console.error(err)` with `console.error('Migration failed. See Prisma output above for details.')` — the inherited `stdio` already displayed the diagnostic output, and `describeDatabase()` on the next line confirms the target. [scripts/run-migrations.ts:36]
