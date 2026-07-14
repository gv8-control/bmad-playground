---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04c-aggregate
  - step-05-dev-activation
lastStep: step-05-dev-activation
lastSaved: '2026-07-12'
workflowType: testarch-atdd
storyId: '4.4'
storyKey: 4-4-run-prisma-migrations-against-the-railway-postgres-instance
storyFile: _bmad-output/implementation-artifacts/4-4-run-prisma-migrations-against-the-railway-postgres-instance.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-4-4-run-prisma-migrations-against-the-railway-postgres-instance.md
generatedTestFiles:
  - apps/agent-be/test/unit/run-migrations.spec.ts
  - apps/agent-be/test/integration/railway-migrations.integration.spec.ts
  - scripts/run-migrations.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/4-4-run-prisma-migrations-against-the-railway-postgres-instance.md
  - _bmad-output/project-context.md
  - _bmad-output/decision-policy.md
  - apps/agent-be/jest.config.ts
  - apps/agent-be/test/jest-integration.config.ts
  - scripts/rotate-kek.ts
  - apps/agent-be/test/integration/railway-project-structure.integration.spec.ts
  - libs/database-schemas/src/prisma/migrations/
---

# ATDD Checklist - Epic 4, Story 4.4: Run Prisma Migrations Against the Railway Postgres Instance

**Date:** 2026-07-12
**Author:** Marius
**Primary Test Level:** Unit (describeDatabase + execSync guard) + Integration (Railway Postgres migration verification)

---

## Story Summary

Apply the existing `libs/database-schemas` Prisma migrations to the Railway Postgres instance so the production database schema matches what both apps expect, with a safety-check script that confirms the target database before and after.

**As a** platform operator
**I want** the existing migrations applied to the Railway Postgres instance
**So that** the production database schema matches what both apps expect

---

## Acceptance Criteria

1. **AC-1 (All existing migrations apply cleanly):** Given the Railway `DATABASE_URL`, When `prisma migrate deploy` is run from `libs/database-schemas`, Then all 9 existing migrations apply cleanly with no manual schema edits.
2. **AC-2 (Target database confirmed before and after):** Given the migration run, When it completes, Then the target database is confirmed (host:port/dbname only, no credentials logged) before and after, mirroring the `describeDatabase()` safety pattern from `scripts/rotate-kek.ts`.

---

## Story Integration Metadata

- **Story ID:** `4.4`
- **Story Key:** `4-4-run-prisma-migrations-against-the-railway-postgres-instance`
- **Story File:** `_bmad-output/implementation-artifacts/4-4-run-prisma-migrations-against-the-railway-postgres-instance.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-4-4-run-prisma-migrations-against-the-railway-postgres-instance.md`
- **Generated Test Files:**
  - `apps/agent-be/test/unit/run-migrations.spec.ts` (unit — 14 tests active)
  - `apps/agent-be/test/integration/railway-migrations.integration.spec.ts` (integration — 3 tests active)
  - `scripts/run-migrations.ts` (implemented — exports `describeDatabase()` and `main()`)

---

## Test Scaffolds

### Unit Tests — describeDatabase() + execSync guard (11 tests)

**File:** `apps/agent-be/test/unit/run-migrations.spec.ts`

All tests are active. `scripts/run-migrations.ts` exports `describeDatabase()` and `main()` — both implemented per Story Task 1.

#### describeDatabase() — valid URL parsing (AC-2)

- **[P0] returns host:port/dbname for a standard PostgreSQL URL**
  - **Verifies:** AC-2 (parses `postgresql://user:pass@localhost:5432/mydb` → `localhost:5432/mydb`)

- **[P0] handles URL without port**
  - **Verifies:** AC-2 (parses `postgresql://user:pass@localhost/mydb` → `localhost/mydb`)

- **[P0] handles Railway proxy URL**
  - **Verifies:** AC-2 (parses `postgresql://user:pass@tokaido.proxy.rlwy.net:42861/railway` → `tokaido.proxy.rlwy.net:42861/railway`)

#### describeDatabase() — credential isolation invariant (AC-2)

- **[P0] output does not contain username from URL**
  - **Verifies:** AC-2 / credential isolation (username stripped from output — never logged)

- **[P0] output does not contain password from URL**
  - **Verifies:** AC-2 / credential isolation (password stripped from output — never logged)

- **[P0] output does not contain @ separator (userinfo stripped)**
  - **Verifies:** AC-2 / credential isolation (no userinfo leakage in logged output)

#### describeDatabase() — unparseable URL fallback (AC-2)

- **[P0] returns fallback for invalid URL**
  - **Verifies:** AC-2 (graceful fallback: `'not-a-url'` → `'(unparseable DATABASE_URL)'`)

- **[P0] returns fallback for empty string**
  - **Verifies:** AC-2 (graceful fallback: `''` → `'(unparseable DATABASE_URL)'`)

#### execSync command guard — regression guard (AC-2)

These tests verify that the `execSync` call in `main()` does not interpolate `DATABASE_URL` into the command string. The `DATABASE_URL` is user-controlled (set by the operator) and contains the Postgres password. The guard template exercises both credential-isolation invariants and input-injection invariants at the single `execSync` call site.

- **[P0] command string does not contain DATABASE_URL value (credential isolation — command arguments)**
  - **Verifies:** The `execSync` command string (first argument) is a static literal — `prisma migrate deploy --config libs/database-schemas/prisma.config.ts`. The `DATABASE_URL` value (containing `user:password@host:port/db`) is NEVER interpolated into the command string. Test asserts `commandString` does not contain the password, the `postgresql://` scheme, or the `user:` userinfo prefix.

- **[P0] execSync env option does not explicitly pass DATABASE_URL (credential isolation — environment variables)**
  - **Verifies:** The `execSync` call does NOT set a custom `env` option containing `DATABASE_URL`. The child process inherits `process.env` (the standard, secure pattern for passing credentials to child processes). Test asserts that if an `env` option is present, its keys do NOT include `DATABASE_URL` — the credential is inherited, not explicitly passed.

- **[P0] DATABASE_URL with shell metacharacters cannot alter command (input injection)**
  - **Verifies:** A `DATABASE_URL` containing shell metacharacters (`postgresql://user:pass;rm -rf /@host:5432/db`) cannot alter the `execSync` command. The `DATABASE_URL` is never interpolated into the command string — it's only passed via `process.env`. Test asserts the command string does not contain `;`, `rm -rf`, or the password value, regardless of what the `DATABASE_URL` contains.

---

### Integration Tests — Railway Postgres migration verification (3 tests)

**File:** `apps/agent-be/test/integration/railway-migrations.integration.spec.ts`

All tests are active. Requires `DATABASE_URL` in the environment (Railway Postgres). Migrations applied per Story Task 4.

- **[P0] _prisma_migrations table contains all 9 expected migration names**
  - **Verifies:** AC-1 (all 9 migrations applied: `20260618192551_init_users` through `20260707000000_add_conversation_sandbox_state`)

- **[P0] all 9 migrations have finished_at not null**
  - **Verifies:** AC-1 (each migration completed successfully — `finished_at` is not null in `_prisma_migrations` table)

- **[P0] key tables exist (users, oauth_credentials, repo_connections, artifacts, conversations, turns, cost_records)**
  - **Verifies:** AC-1 (schema tables created by migrations are present and queryable)

---

## E2E Coverage — Deferred (with browser-level mock check)

### Browser-Level Mock Feasibility Check

Per the ATDD workflow requirement, before deferring E2E coverage, I verified whether any browser-level mock pattern can simulate the ACs:

| AC | What needs verifying | Browser mock check | Verdict |
|---|---|---|---|
| AC-1 | `prisma migrate deploy` applies 9 migrations to Railway Postgres | Prisma migrations are CLI commands that connect to Postgres via TCP (not HTTP). Playwright `page.route()` only intercepts browser-initiated HTTP requests. The migration creates a `_prisma_migrations` table and schema tables in Postgres — no browser interaction can trigger or verify a TCP database connection. | **No mock covers this** — defer |
| AC-1 | `_prisma_migrations` table has 9 entries with `finished_at` not null | Database table state. Requires a real Postgres connection via Prisma client (`$queryRaw`). No browser-level mock can simulate a Postgres TCP connection or verify table contents. | **No mock covers this** — defer |
| AC-2 | `describeDatabase()` parses URL, returns `host:port/dbname` | `describeDatabase()` is a Node.js function in `scripts/run-migrations.ts`. It uses `new URL()` (Node.js built-in). A browser test cannot import or call a Node.js script function. Playwright runs in the browser context, not Node.js. | **No mock covers this** — defer |
| AC-2 | `describeDatabase()` output logged before and after migrations | CLI script output (`console.log` in Node.js). Browser tests cannot capture Node.js CLI script stdout. Playwright captures browser console output, not Node.js process output. | **No mock covers this** — defer |

**Conclusion:** No browser-level mock pattern can simulate any of the ACs. All ACs involve either TCP database connections (Postgres via Prisma) or Node.js CLI script behavior — neither is browser-interactable. Playwright's `page.route()` can only intercept browser-initiated HTTP requests, and none of the migration operations originate from a browser. E2E deferral is justified.

### Verification Method for Deferred ACs

The deferred ACs are verified via:
1. **Unit test scaffolds** (this ATDD output): `run-migrations.spec.ts` validates `describeDatabase()` URL parsing, credential isolation, and the `execSync` command guard (AC-2). These are testable without a database connection.
2. **Integration test scaffold** (this ATDD output): `railway-migrations.integration.spec.ts` connects to the Railway Postgres via Prisma client and verifies the `_prisma_migrations` table and key tables (AC-1). Requires `DATABASE_URL` in the environment.
3. **Operational verification** per the story's Tasks 3-5: the dev fetches the Railway `DATABASE_URL`, runs `yarn db:migrate`, and verifies via `yarn db:migrate:status` that all migrations are applied.

---

## Regression Guard Check

Per the ATDD workflow requirement, I checked whether the story introduces code that executes external commands with user-controlled input:

- **`scripts/run-migrations.ts`** uses `execSync` to run `prisma migrate deploy --config libs/database-schemas/prisma.config.ts`. The `DATABASE_URL` environment variable is user-controlled (set by the operator) and contains the Postgres password. This is a call site that executes an external command with user-controlled input.

### Uniform Guard Template Applied

The guard template is applied to the single `execSync` call site in `run-migrations.ts`. Three tests exercise both invariant categories:

#### Credential-Isolation Invariants

1. **No credentials leak via command arguments:** The `execSync` command string (first argument) is a static literal — `prisma migrate deploy --config libs/database-schemas/prisma.config.ts`. The `DATABASE_URL` value (containing `user:password@host:port/db`) is NEVER interpolated into the command string. Test asserts `commandString` does not contain the password, the `postgresql://` scheme, or the `user:` userinfo prefix.

2. **No credentials leak via environment variables:** The `execSync` call does NOT set a custom `env` option containing `DATABASE_URL`. The child process inherits `process.env` (the standard, secure pattern for passing credentials to child processes). Test asserts that if an `env` option is present, its keys do NOT include `DATABASE_URL` — the credential is inherited, not explicitly passed.

#### Input-Injection Invariants

3. **Malicious input is safely quoted and cannot alter the command's behavior:** A `DATABASE_URL` containing shell metacharacters (`postgresql://user:pass;rm -rf /@host:5432/db`) cannot alter the `execSync` command. The `DATABASE_URL` is never interpolated into the command string — it's only passed via `process.env`. Test asserts the command string does not contain `;`, `rm -rf`, or the password value, regardless of what the `DATABASE_URL` contains.

**Note:** The `shellQuote` helper pattern (from `project-context.md` — "Shell-quote all interpolated values in sandbox process commands") is NOT needed here because no user-controlled value is interpolated into the command string. The command is a static literal. The guard verifies this invariant persists across future modifications.

---

## Data Factories Created

None — this story validates a CLI script function and database migration state, not data-driven behavior.

---

## Fixtures Created

None — the unit tests call `describeDatabase()` and `main()` directly. The integration test connects to the Railway Postgres via Prisma client. No fixtures or mocks are needed beyond the `jest.mock('child_process')` in the unit test file.

---

## Mock Requirements

### child_process.execSync Mock

**Module:** `child_process`
**Mock:** `jest.mock('child_process', () => ({ execSync: jest.fn() }))`

**Notes:** Auto-mocked at file level in `run-migrations.spec.ts`. The mock replaces `execSync` with a `jest.fn()` returning `undefined`. Used by the regression guard tests to inspect the command string and options without actually running `prisma migrate deploy`. The `describeDatabase()` tests do not trigger `execSync` — the mock is unused for those test blocks.

---

## Required data-testid Attributes

None — this story has no UI components.

---

## Implementation Checklist

### Test: describeDatabase() — valid URL parsing (AC-2)

**File:** `apps/agent-be/test/unit/run-migrations.spec.ts`

- [x] Implement `describeDatabase()` in `scripts/run-migrations.ts` (Story Task 1.1 — copy from `scripts/rotate-kek.ts:51-59`, add `export`)
- [x] Remove `describe.skip()` → `describe()` from the "valid URL parsing" block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=run-migrations`
- [x] Test passes (green phase)

### Test: describeDatabase() — credential isolation invariant (AC-2)

**File:** `apps/agent-be/test/unit/run-migrations.spec.ts`

- [x] Implement `describeDatabase()` in `scripts/run-migrations.ts` (Story Task 1.1 — must return `${url.host}${url.pathname}`, never `url.username` or `url.password`)
- [x] Remove `describe.skip()` → `describe()` from the "credential isolation invariant" block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=run-migrations`
- [x] Tests pass (green phase)

### Test: describeDatabase() — unparseable URL fallback (AC-2)

**File:** `apps/agent-be/test/unit/run-migrations.spec.ts`

- [x] Implement `describeDatabase()` in `scripts/run-migrations.ts` (Story Task 1.1 — `catch` block returns `'(unparseable DATABASE_URL)'`)
- [x] Remove `describe.skip()` → `describe()` from the "unparseable URL fallback" block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=run-migrations`
- [x] Tests pass (green phase)

### Test: execSync command guard — regression guard (AC-2)

**File:** `apps/agent-be/test/unit/run-migrations.spec.ts`

- [x] Implement `main()` in `scripts/run-migrations.ts` (Story Tasks 1.2-1.6 — validate `DATABASE_URL`, call `describeDatabase()` before/after, call `execSync` with static command string, handle success/failure)
- [x] Ensure `execSync` command is a static literal: `execSync('prisma migrate deploy --config libs/database-schemas/prisma.config.ts', { stdio: 'inherit' })` — NO `DATABASE_URL` interpolation
- [x] Ensure NO custom `env` option is passed to `execSync` — child process inherits `process.env`
- [x] Remove `describe.skip()` → `describe()` from the "execSync command guard" block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=run-migrations`
- [x] Tests pass (green phase)

### Test: _prisma_migrations table contains all 9 expected migration names (AC-1)

**File:** `apps/agent-be/test/integration/railway-migrations.integration.spec.ts`

- [x] Fetch Railway `DATABASE_URL` (Story Task 3)
- [x] Run `DATABASE_URL=<railway-url> yarn db:migrate` (Story Task 4 — applies all 9 migrations)
- [x] Remove `describe.skip()` → `describe()` from the "Railway Postgres migrations" block
- [x] Set `DATABASE_URL` in environment or `.env.local` before running the test
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPatterns=railway-migrations`
- [x] Test passes (green phase)

### Test: all 9 migrations have finished_at not null (AC-1)

**File:** `apps/agent-be/test/integration/railway-migrations.integration.spec.ts`

- [x] Same prerequisites as above (migrations applied to Railway Postgres)
- [x] Test is in the same `describe()` block — activated together
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPatterns=railway-migrations`
- [x] Test passes (green phase)

### Test: key tables exist (AC-1)

**File:** `apps/agent-be/test/integration/railway-migrations.integration.spec.ts`

- [x] Same prerequisites as above (migrations applied to Railway Postgres)
- [x] Test is in the same `describe()` block — activated together
- [x] Run test: `yarn nx test-integration agent-be -- --testPathPatterns=railway-migrations`
- [x] Test passes (green phase)

---

## Running Tests

```bash
# Run unit tests for describeDatabase() + execSync guard (all tests active)
yarn nx test agent-be -- --testPathPattern=run-migrations

# Run integration tests for Railway Postgres migrations (all tests active)
yarn nx test-integration agent-be -- --testPathPatterns=railway-migrations

# Run all agent-be unit tests
yarn nx test agent-be

# Run all agent-be integration tests
yarn nx test-integration agent-be
```

---

## Story Task Updates

The story's Task 6 instructed the dev to create test files. The ATDD scaffolding created:

1. **`scripts/run-migrations.ts`** — implemented with exported `describeDatabase()` and `main()`
2. **`apps/agent-be/test/unit/run-migrations.spec.ts`** — 11 unit tests (all active)
3. **`apps/agent-be/test/integration/railway-migrations.integration.spec.ts`** — 3 integration tests (all active)

The story's Task 6 instructed the dev to **activate** the existing scaffolding (remove `describe.skip()`) rather than create new test files. All scaffolds have been activated and verified passing.

---

## Decisions (per decision-policy.md)

**Decision (DP-4):** Created a stub `scripts/run-migrations.ts` with exported `describeDatabase()` and `main()` as test seams. Both functions throw "not implemented". This is a test-only change (the stub is not functional code — it throws on all code paths). The dev implements the functions per Story Task 1, then removes `describe.skip()` to activate the tests. DP-4 applies: test-only/artifact-only changes with no production behavior change.

**Decision (DP-3):** Placed the unit test at `apps/agent-be/test/unit/run-migrations.spec.ts` (creating the `test/unit/` directory). The story notes this as a compromise — the function belongs to `scripts/run-migrations.ts` but there's no `scripts/test/` directory. `apps/agent-be/test/unit/` is the simplest location that's included in `tsconfig.spec.json` and matched by the jest config. The test imports from `../../../scripts/run-migrations` (relative path).

**Decision (DP-3):** Exported `main()` from `scripts/run-migrations.ts` as a test seam (in addition to `describeDatabase()` which the story explicitly requires to be exported). The `main()` export allows the regression guard tests to call `main()` with a mocked `execSync` and inspect the command string. The `require.main === module` guard prevents `main()` from running when the file is imported (only runs when executed directly via `ts-node`).

**Decision (DP-3):** Used `jest.mock('child_process', () => ({ execSync: jest.fn() }))` at the file level in the unit test. The mock is hoisted by Jest before imports, so when `run-migrations.ts` is imported, it receives the mocked `execSync`. The `describeDatabase()` tests don't trigger `execSync` — the mock is unused for those blocks. This is simpler than `jest.isolateModules` per-test mocking.

---

## Notes

- This story is an infrastructure/deployment story, similar to Stories 4.1 (Vercel), 4.2 (Railway project), and 4.3 (Dockerfile). The testable code artifact is `scripts/run-migrations.ts` (a CLI script). The remaining tasks (fetch Railway URL, run migrations, verify) are operational steps with external side effects.
- The script file `scripts/run-migrations.ts` exports `describeDatabase()` and `main()` so the tests can import them. The `require.main === module` guard ensures the script only runs `main()` when executed directly (via `ts-node`), not when imported in tests.
- The unit test file uses `jest.mock('child_process')` at the file level. This is hoisted by Jest before imports. When the dev implements `main()` with `import { execSync } from 'child_process'`, the mock will be applied automatically.
- The integration test follows the same `getDatabaseUrl()` pattern as `railway-project-structure.integration.spec.ts` — reads from `process.env.DATABASE_URL` or `.env.local`.
- The `EXPECTED_MIGRATIONS` array in the integration test lists all 9 migration directory names (verified via `ls libs/database-schemas/src/prisma/migrations/`).
- The regression guard tests use `process.env.DATABASE_URL` with known credential values (`secretpass`, `secretpass123`) and assert these values do NOT appear in the `execSync` command string. The `afterEach` restores the original `DATABASE_URL`.
- The `process.exit` mock in the regression guard tests throws `'process.exit called'` instead of actually exiting. This allows the tests to catch the exit and continue asserting.

---

## Knowledge Base References Applied

- **test-quality.md** — Test design principles (one assertion per test, determinism, isolation)
- **test-levels-framework.md** — Test level selection (unit test for function validation, integration test for database state verification, E2E deferred for CLI/database operations)
- **test-healing-patterns.md** — Common failure patterns (stub throws "not implemented" for clean red-phase failures)
- **data-factories.md** — Not applicable (no data-driven behavior)

See `tea-index.csv` for complete knowledge fragment mapping.

---

**Generated by BMad TEA Agent** - 2026-07-12
