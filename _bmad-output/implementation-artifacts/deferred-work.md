# Deferred Work

## Deferred from: code review of 1-1-scaffold-the-platform-monorepo-and-ci-pipeline (2026-06-18)

- `.claude/settings.json` — leading `*` wildcard in `Bash(python3 *_bmad/scripts/*)` removes the path anchor present in the original rule; any path ending in `_bmad/scripts/` is now accepted, widening attack surface beyond the intended `_bmad/` directory.
- `ProvisionParams.repoUrl` and `credential` never passed in tests — all test calls use `{ conversationId } as any`, bypassing type safety. Real integration coverage of these fields deferred to the story that implements the real SandboxService.
- `credential` field flows as a bare string with no format documentation, no logging guard, and no expiry awareness. Mitigate before real credential handling is wired in (Story 1.2 / 3.x range).
- `SandboxInfo.provisionedAt` is typed `?: Date` but no consumer null-guards it. Any idle-timeout or TTL logic that reads this field will silently skip eviction on undefined, producing zombie sandboxes. Fix when idle-timeout logic is implemented.
- `sandboxId: fake-sandbox-${Date.now()}` — two provisions in the same millisecond produce the same ID and silently overwrite in the Map. Low risk at `maxWorkers: 1` but will bite if worker count is raised. Switch to `crypto.randomUUID()` or similar before parallelising tests.
- `overrideProviders` in `test-module-builder.ts` silently drops entries where `useValue` is explicitly `undefined` due to `!== undefined` guard. Fix when a test needs to override a provider to `undefined`.

## Deferred from: re-review of 1-1-scaffold-the-platform-monorepo-and-ci-pipeline (2026-06-18)

- `libs/shared-types/src/sandbox.constants.ts` re-exports `SANDBOX_SERVICE` from `sandbox.interface.ts`, and both are re-exported via `index.ts` — redundant but functional since both traces resolve to the same declaration.
- Nx generator stub files `libs/shared-types/src/lib/shared-types.ts` and `libs/database-schemas/src/lib/database-schemas.ts` are not part of the public API and serve no purpose beyond the auto-generated spec files. Remove when cleaning up generator residue.
- `apps/web/src/app/page.tsx` is the Nx default welcome template rather than a placeholder redirect. Replace when the first real page is implemented.
- Inter and JetBrains Mono fonts are declared in `tailwind.config.ts` theme but never loaded (no `<link>` in layout or `@import` in CSS). Add font loading when the first styled component is built.
- `libs/database-schemas/src/index.ts` imports from `./generated/client` which does not exist on a clean checkout until `prisma generate` runs. The `dependsOn: ["generate"]` on `lint` and `typecheck` targets mitigates this for Nx-driven workflows, but a bare `tsc` or IDE cold-start will show import errors until generate is run.

## Deferred from: code review of 1-3-connect-a-repository-by-url (2026-06-19)

- DEK not zeroed after use in `decryptToken` — the plaintext DEK remains on the heap until GC; standard practice is `dek.fill(0)` in a `finally` block.
- Org-restriction detection via heuristic GitHub API message substring matching — fragile if GitHub changes error message wording. Revisit when a reliable GitHub header is documented.
- `data.permissions` absent or degraded for organization repos accessed via team membership — results in misleading `INSUFFICIENT_PERMISSION` error; documented in Dev Notes #8. Mitigate in Story 1.6 (credential failure recovery).
- `callbackUrl` in `auth.config.ts` set to `pathname` only — query string parameters stripped on auth redirect; no protected pages currently use query params.
- `/api/internal/test/repo-connections/[id]` DELETE has no Prisma P2025 error handling — non-existent ID throws 500, causing misleading test teardown failures.
- `syntheticSession` in `playwright/auth.setup.ts` mints real JWT tokens from `AUTH_SECRET` — if `AUTH_SECRET` leaks from CI, arbitrary sessions can be forged; inherent to synthetic session architecture.

## Deferred from: code review of 1-3-connect-a-repository-by-url (2026-06-20)

- Nonce length not validated in `decryptToken` — `dekNonce`/`tokenNonce` decoded from Base64 without asserting exactly 12 bytes; a corrupt nonce throws an unhelpful native OpenSSL error rather than a descriptive application error.
- `encryptedDek` minimum-size guard too weak — `< TAG_LENGTH` (16-byte) guard passes for exactly 16 bytes, yielding zero-byte ciphertext; a valid DEK ciphertext is at least 48 bytes. Currently caught by outer try/catch.
- Parallel E2E workers share fixed `E2E_GITHUB_ID` — concurrent `withRepoConnection` fixtures mutate the same DB row; teardown from one test can delete another's fixture. Safe with sequential workers.
- No unit test for `decryptToken` failure path in `connectRepository` — a KEK-rotated or tampered credential throws as `UNKNOWN`; no test verifies the catch behavior.
- Middleware permanently exempts `/api/internal/test` from auth — `TEST_ENV` route guard is the sole protection layer; accidental `TEST_ENV=true` in a non-local environment exposes data-mutation endpoints without authentication.

## Deferred from: code review of 1-3-connect-a-repository-by-url (Review 4 — 2026-06-20)

- `encryptToken` in NextAuth jwt callback has no application-level error handling — if `CREDENTIAL_ENCRYPTION_KEK` is misconfigured, `getKek()` throws and NextAuth's internal error handler redirects all sign-in attempts to `/sign-in?error=…`; the root cause (missing env var) is not logged at the catch site. A startup env-var validation or an explicit try/catch with a targeted log is the proper fix. [`apps/web/src/lib/auth.ts:49`]
- Silent repository replacement — `repoConnection.upsert` overwrites an existing connection without user confirmation; guarded by the onboarding redirect in normal flow but reachable via direct navigation. Intentional upsert semantics for MVP; confirmation UI belongs in a future story. [`apps/web/src/actions/repo-connection.actions.ts:126`]
- Internal test routes return 500 on malformed/missing JSON body — `request.json()` has no try/catch in any of the three test API routes; opaque 500 is returned instead of a descriptive error. Test-only risk; the E2E fixture always sends valid JSON. [`apps/web/src/app/api/internal/test/seed-user/route.ts:9`]
- Migration CREATE TABLE has no `IF NOT EXISTS` guard — partial manual pre-creation of `oauth_credentials` or `repo_connections` blocks `prisma migrate deploy` and permanently marks the migration as failed in `_prisma_migrations`. Normal Prisma workflow prevents this via the migration table; idempotency via SQL guards was not added by design. [`libs/database-schemas/src/prisma/migrations/20260619000000_.../migration.sql`]
- GitHub API 429 rate limit treated as generic UNKNOWN — `!response.ok` catch-all returns "unexpected error (429)" with no retry guidance and ignores `Retry-After` header. Rare in current single-user MVP; belongs in a resilience story. [`apps/web/src/actions/repo-connection.actions.ts:109`]

## Deferred from: code review of 1-3-connect-a-repository-by-url (Review 3 — 2026-06-20)

_Edge Case Hunter layer failed (process exited); findings from Blind Hunter and Acceptance Auditor only._

- `withRepoConnection` Playwright fixture only deletes the `RepoConnection` row on teardown — the seeded `User` and its `OAuthCredential` accumulate across test runs; upsert idempotency prevents correctness failures but orphaned credential rows persist in the database.
- `credential_health` TEXT column has no DB-level CHECK constraint — valid values `"healthy"` / `"failed"` enforced only at the TypeScript layer; a typo is silently stored without a constraint violation.
- `CREDENTIAL_ENCRYPTION_KEK` is validated lazily on first call rather than at process startup — spec says "startup guard"; Next.js lazy module loading means misconfiguration surfaces as a user-facing error on the first sign-in rather than a boot failure. Documented as intentional in Dev Notes #10.

## Deferred from: code review of 1-2-sign-in-with-github (2026-06-18)

- No database migration infrastructure — no `prisma/migrations` directory or `migrate` script; schema must be applied manually via `prisma db push`.
- `email` column has no uniqueness constraint or index on the `User` model — same email can appear on multiple rows without constraint.
- `next-auth` beta pinned with `^` range — `^5.0.0-beta.31` allows automatic upgrades to future beta releases with potential breaking changes.
- `active` and `lastActiveAt` fields in the `User` model are never updated by the application — fields exist in schema but have no writer until a future story implements them.
- No unit/integration test coverage for AC-2 session persistence (8h maxAge) — requires E2E test coverage in a future story.
- Non-GitHub provider path not handled — if a second OAuth provider is added, `token.userId` is never set for it and `session.userId` will be absent for those users.
- Prisma singleton never resets on stale DB connection — known limitation of the global singleton pattern in Next.js; mitigate when connection resilience is required.
- Static assets in `/public/` beyond `favicon.ico` not excluded from middleware matcher — theoretical concern; no non-favicon public assets currently exist.
