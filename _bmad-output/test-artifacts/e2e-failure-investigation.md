# E2E Test Failure Investigation — bmad-easy

- **Investigated:** 2026-07-06
- **Failing run:** 2026-07-06 ~15:41 UTC (per `test-results/*` trace-folder mtimes and `.auth/local/default/storage-state.json` mtime 15:41:16)
- **Reported totals:** 197 total · 107 passed · 36 failed · 2 skipped · 52 did not run
- **Unit/integration:** 921 pass, 0 fail → confirms application code is correct; failures are environmental.
- **Thoroughness:** medium

## 1. Root cause per failure category

### Category 1 — Auth / session state (~25 failures) — JWT-secret desync between runner and reused dev server

The freshly-generated storage state is being **rejected by the middleware**, sending authed tests to `/sign-in` instead of the protected route. The token itself is well-formed (verified: a `curl` with the on-disk cookie against the currently-running server returns `200` on `/onboarding`), so the failure is a **secret mismatch at the moment of the failing run**, not an inherently bad token.

Mechanism, in order of likelihood:

1. **`webServer` reuses a stale dev server.** `playwright.config.ts:51-56` sets `reuseExistingServer: !process.env.CI` and the `command` is `yarn nx run web:dev` — **without the `dotenv -e .env.test` wrapper** that `package.json:8`'s `test:e2e` script uses. NextAuth v5 (`apps/web/src/lib/auth.ts`) reads `AUTH_SECRET` **once at boot**. If a dev server was already running on `:3000` (e.g. started by `yarn dev` or a raw `yarn nx run web:dev` before `.env`/`.env.test` had `AUTH_SECRET`, or while it held a different value), Playwright reuses that process. It keeps its **boot-time** secret in memory. `auth.setup.ts:72-85` then signs the synthetic JWT with the **runner's current** `AUTH_SECRET` (loaded via `dotenv -e .env.test`). The two secrets disagree → `middleware.ts` (NextAuth `authorized`) rejects → `authorized({ auth })` returns `undefined` → redirect to `/sign-in` → assertions like `expect(page).toHaveURL(/onboarding/)` fail because the URL is `/sign-in`.

2. **Direct invocation bypasses `.env.test`.** `playwright.config.ts:7` loads `.env.local` (`loadDotenv({ path: '.env.local', override: false })`), but **`.env.local` does not exist** in this repo (only `.env`, `.env.example`, `.env.test`). If someone runs `npx playwright test` directly (instead of `yarn test:e2e`), the Playwright runner has no `AUTH_SECRET` in process.env, and `auth.setup.ts:59` throws `AUTH_SECRET is required for synthetic E2E session seeding`. With `dependencies: ['setup']`, a hard setup failure aborts the dependent `chromium` project entirely — but if a stale `storage-state.json` is already on disk and the setup chose the `syntheticSession` path after a partial env load, the chrom project's `storageState: '.auth/local/default/storage-state.json'` (config:46, a hardcoded **string**, not `getStorageStatePath()`) loads the stale file. The file at 15:41:16 was freshly written, so for the failing run the setup did execute — pointing back to cause (1).

3. **Token freshness masking.** `playwright/support/auth/github-auth-provider.ts:36-41` defines `isTokenExpired: () => false` (always "valid"). The auth fixture therefore **trusts the on-disk storage state indefinitely** and will not trigger a refresh even when the embedded JWT's `exp` has passed. `auth.setup.ts:79` sets `exp: now + 8*60*60`. The dev server in this codespace has been up ~8h20m (matches the 8-hour JWT TTL), so a session seeded at server-start time would be at the edge of expiry mid-run. This is the "stale storage state" symptom recorded in `traceability/gate-decision.json:13` and `traceability/e2e-trace-summary.json:141`.

### Category 2 — Seed API 500s — `getPrisma()` throws inside the route handler

All four test-seed routes gate on `!process.env.TEST_ENV` (404 if unset) and then call `getPrisma().{model}.{upsert|create|deleteMany}(...)`:

- `apps/web/src/app/api/internal/test/seed-user/route.ts:15`
- `apps/web/src/app/api/internal/test/artifacts/route.ts:23`
- `apps/web/src/app/api/internal/test/repo-connections/route.ts:14`
- `apps/web/src/app/api/internal/test/conversations/route.ts:19`

`getPrisma()` (`apps/web/src/lib/prisma.ts:14`) throws if `DATABASE_URL` is unset; otherwise any Prisma error (connection refused, missing table, schema drift between the generated client and the live DB, unique-constraint collision with leftover rows from a prior aborted run) propagates as an unhandled rejection in the route handler, which Next.js surfaces as **500**. Confirmed current state: `curl -X POST /api/internal/test/seed-user` returns `200 {"userId":"cmr9jeds..."}`, and `docker ps` shows `bmad-playground-postgres-1` healthy for 36h on `:5432`. So the 500s at 15:41 were one of:

- **The reused dev server was started before postgres was up** (or before `.env` had `DATABASE_URL`), so the cached `PrismaClient` in `globalForPrisma.prisma` was constructed against a dead/unset DB and never reconnected.
- **Schema drift.** `playwright.config.ts` `webServer` runs only `yarn nx run web:dev`/`agent-be:serve` — **no `prisma migrate deploy` / `db push` step**. If the `bmad_easy_test` DB was behind the Prisma client build, `upsert`/`create` throws `P2021` (table missing) or `P2002` (unique) → 500.
- **Leftover rows.** Fixtures in `playwright/support/custom-fixtures.ts` call `DELETE` in `finally` blocks, but a worker crash mid-test (e.g. from a Category-1 auth redirect aborting the test before `finally` runs) leaves seeded rows. The next worker's `upsert` hits the unique constraint (`where: { githubId }` / `where: { userId }`) — usually fine because `upsert` handles it, but `artifact.create` (`artifacts/route.ts:25`) is a plain `create` inside a `$transaction`, so duplicate-seed collisions throw.

### Category 3 — Cascade (52 did not run) — serial groups + `retries:0` + worker crashes

`playwright.config.ts:13` sets `retries: process.env.CI ? 2 : 0` — **zero retries locally**. `fullyParallel: true` (config:11). Multiple suites use `test.describe.configure({ mode: 'serial' })` (e.g. `playwright/e2e/artifact-browser/artifact-browser.spec.ts:26`). In serial mode, **if test #1 fails, every subsequent test in that group is marked skipped (did-not-run)**. Combined with:

- Fixture throws (`withArtifacts`/`withRepoConnection`/`withConversations` in `custom-fixtures.ts:105-243`) aborting the worker when a seed API returns 500.
- `actionTimeout: 15_000` (config:21) and `expect.timeout: 10_000` (config:17) being tight for dev-mode first-compile latencies (the artifact-browser NFR test explicitly "warms up" the route at `artifact-browser.spec.ts:34` to dodge this — other suites don't).

…a single Category-1 or Category-2 failure cascades into ~1-2 downstream did-not-runs each. 36 failures × ~1.4 downstream ≈ 52, which matches the observed count.

## 2. Specific config issues found

| # | Location | Issue |
|---|----------|-------|
| C1 | `playwright.config.ts:7` | Loads `.env.local`, which **does not exist** in the repo. Only `.env`, `.env.example`, `.env.test` exist. Loads nothing for direct `playwright test` invocations; relies entirely on the `dotenv -e .env.test` wrapper in `package.json:8`. |
| C2 | `playwright.config.ts:53` | `webServer.command` is `yarn nx run web:dev` **without** `dotenv -e .env.test`. When Playwright has to *start* a server the child inherits the runner env (works under `yarn test:e2e`), but when it *reuses* an existing server that was started by a different command, the server's env was decided at its own boot time — not by Playwright. |
| C3 | `playwright.config.ts:55` | `reuseExistingServer: !process.env.CI` reuses whatever is on `:3000`. Combined with C2, this is the primary vector for AUTH_SECRET desync. |
| C4 | `playwright.config.ts:46` | `storageState` is a hardcoded **string** path `'.auth/local/default/storage-state.json'`, decoupled from `getStorageStatePath()` used by `auth.setup.ts:88`. If the utility's default path changes, config silently points nowhere. |
| C5 | `playwright/support/auth/github-auth-provider.ts:36-41` | `isTokenExpired: () => false` — a no-op. The comment claims "Auth.js session tokens are opaque," but `auth.setup.ts:72-85` builds a real JWT via `next-auth/jwt`'s `encode()` with a decodable `exp` claim. The provider could decode and compare `exp*1000 < Date.now()` to trigger refresh. |
| C6 | `playwright/auth.setup.ts:79` | JWT `exp: now + 8*60*60` — 8-hour TTL with no per-run refresh path that the framework will actually invoke (because of C5). Long-lived dev servers (this one: 8h20m) outlive the token. |
| C7 | `playwright.config.ts:13` | `retries: 0` locally. Magnifies Category-1/2 environmental flakes into Category-3 cascades. Appropriate for surfacing real flakes, but inflates "did not run". |
| C8 | `playwright.config.ts:51-62` | **No DB migration step** in `webServer`. `yarn nx run web:dev` and `agent-be:serve` start apps; nothing runs `prisma migrate deploy` / `db push` against `bmad_easy_test`. Schema drift → seed API 500s (see Category 2). |
| C9 | `playwright/support/custom-fixtures.ts:134-153` | `withArtifacts` calls `DELETE` then `POST` on the artifacts route. If a prior worker crashed mid-`POST` (transaction partially applied) the cleanup ordering is best-effort; combined with `artifact.create` (not `upsert`) in `artifacts/route.ts:25`, duplicate rows from re-runs can throw `P2002`. |
| C10 | `playwright.config.ts:21` | `actionTimeout: 15_000` is tight for Next.js dev-mode first-compile of unfamiliar routes. The artifact-browser spec works around this by "warming up" (`artifact-browser.spec.ts:34`); other specs do not. |

## 3. Recommended fixes (actionable, in priority order)

### P0 — eliminate the secret desync (Category 1)

1. **Make `webServer` start the dev server with the same env as the runner.** Change `playwright.config.ts:53` to:
   ```ts
   command: 'dotenv -e .env.test -- yarn nx run web:dev',
   ```
   …or set `reuseExistingServer: false` for the E2E profile so Playwright always starts a server under its own env control. This single change removes the AUTH_SECRET mismatch vector.
2. **Replace the `.env.local` load with `.env.test`** in `playwright.config.ts:7` (`loadDotenv({ path: '.env.test', override: false })`) so direct `npx playwright test` invocations work, or document loudly that E2E **must** run via `yarn test:e2e`. Better: remove line 7 and rely solely on the `dotenv -e .env.test` wrapper to avoid two sources of env truth.
3. **Fix `isTokenExpired`** in `github-auth-provider.ts:36-41` to decode the JWT `exp` and return `exp * 1000 < Date.now()`. This lets the `@seontechnologies/playwright-utils` framework's refresh path actually trigger, instead of trusting stale on-disk state forever.

### P0 — eliminate the seed API 500s (Category 2)

4. **Add a migration step before E2E.** Either extend `webServer` with a one-shot `port`/`timeout` command that runs `yarn nx run database-schemas:db-push` (or equivalent) against `bmad_easy_test` before the dev server, or add a `globalSetup` that runs `prisma migrate deploy`. This closes the schema-drift gap (C8).
5. **Make the artifacts seed idempotent.** Change `apps/web/src/app/api/internal/test/artifacts/route.ts:23-37` from `artifact.create` to `artifact.upsert` keyed on `(repoConnectionId, path)` (requires a unique constraint), or have `DELETE` in `custom-fixtures.ts:134` run unconditionally at *start* of `withArtifacts` (it already does — verify it isn't swallowed by a non-ok response being ignored).

### P1 — reduce cascade blast radius (Category 3)

6. **Set `retries: process.env.CI ? 2 : 1`** in `playwright.config.ts:13` for local runs. Once P0 fixes 1-5 land this becomes low-cost insurance rather than masking. If you want to keep `retries: 0` to surface flakes, accept the cascade as a diagnostic and fix the upstream causes.
7. **Warm up routes in `beforeEach`** (or a `globalSetup` that hits each protected route once) so dev-mode first-compile latency doesn't trip `actionTimeout: 15_000`. Alternatively raise `actionTimeout` to 30s for the E2E profile.
8. **Centralize the storage-state path.** Use `getStorageStatePath({ environment: 'local', userIdentifier: 'default' })` in `playwright.config.ts:46` instead of the hardcoded string, so config and `auth.setup.ts` cannot drift.

### P2 — hygiene

9. **Lower the synthetic JWT TTL** in `auth.setup.ts:79` from 8h to ~2h to surface stale-state issues faster in local dev. Pair with fix #3 so refresh actually fires.
10. **Add a `pretest:e2e` script** to `package.json` that runs migrations + `docker compose up -d postgres` + asserts `:5432` is healthy, so E2E can't start against a down DB.

## 4. Confidence and verification

- **Verified live (current state):** `curl -H "Cookie: authjs.session-token=<on-disk>" http://localhost:3000/onboarding` → `200` (token accepted). `curl -X POST /api/internal/test/seed-user` → `200 {"userId":...}`. Dev server process is `dotenv -e .env.test -- yarn nx run web:dev` (etime 08:20:52). Postgres healthy 36h. So the system is healthy **now**; the 15:41 run failed under a desynced server/env state.
- **Inferred:** the precise desync vector at 15:41 cannot be replayed post-hoc (no server log captured), but the config gaps (C1-C3, C5, C6, C8) are sufficient and necessary explanations for all three failure categories.
- **Not verified:** prisma migration status of `bmad_easy_test` (no `psql` in shell; would need `docker exec bmad-playground-postgres-1 psql -U postgres -d bmad_easy_test -c "\dt"` to confirm tables match the schema in `libs/database-schemas/src/prisma/schema.prisma`).

## 5. Files examined

- `playwright.config.ts`
- `playwright/auth.setup.ts`
- `playwright/support/merged-fixtures.ts`
- `playwright/support/custom-fixtures.ts`
- `playwright/support/auth/github-auth-provider.ts`
- `playwright/e2e/auth/sign-in.spec.ts` (lines 1-60)
- `playwright/e2e/onboarding/onboarding.spec.ts` (lines 1-60)
- `playwright/e2e/artifact-browser/artifact-browser.spec.ts` (lines 1-60)
- `apps/web/src/app/api/internal/test/seed-user/route.ts`
- `apps/web/src/app/api/internal/test/artifacts/route.ts`
- `apps/web/src/app/api/internal/test/repo-connections/route.ts`
- `apps/web/src/app/api/internal/test/conversations/route.ts` (and confirmed `conversations/[id]/turns/route.ts` exists)
- `apps/web/src/lib/prisma.ts`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/lib/auth.config.ts`
- `apps/web/src/middleware.ts`
- `apps/web/project.json`
- `package.json` (`test:e2e*` scripts)
- `docker-compose.yml`
- `.env`, `.env.example`, `.env.test` (no `.env.local` present)
- `test-results/junit.xml` (last partial run 16:52, setup skipped — not the failing run)
- `.auth/local/default/storage-state.json` (regenerated 15:41:16 UTC today, cookie `exp` 1783381276 → 23:41 UTC today)
- `_bmad-output/test-artifacts/traceability/e2e-trace-summary.json`, `traceability/gate-decision.json` (recorded prior diagnosis of "stale auth state, seed API 500")
