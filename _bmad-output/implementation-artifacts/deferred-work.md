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
- `libs/database-schemas/src/index.ts` imports from `./generated/client` which does not exist on a clean checkout until `prisma generate` runs. The `dependsOn: ["generate"]` on `lint` and `typecheck` targets mitigates this for Nx-driven workflows, but a bare `tsc` or IDE cold-start will show import errors until generate is run.

## Deferred from: code review of 1-3-connect-a-repository-by-url (2026-06-19)

- Org-restriction detection via heuristic GitHub API message substring matching — fragile if GitHub changes error message wording. Revisit when a reliable GitHub header is documented.
- `data.permissions` absent or degraded for organization repos accessed via team membership — results in misleading `INSUFFICIENT_PERMISSION` error; documented in Dev Notes #8. Mitigate in Story 1.6 (credential failure recovery).
- `callbackUrl` in `auth.config.ts` set to `pathname` only — query string parameters stripped on auth redirect; no protected pages currently use query params.
- `/api/internal/test/repo-connections/[id]` DELETE has no Prisma P2025 error handling — non-existent ID throws 500, causing misleading test teardown failures.
- `syntheticSession` in `playwright/auth.setup.ts` mints real JWT tokens from `AUTH_SECRET` — if `AUTH_SECRET` leaks from CI, arbitrary sessions can be forged; inherent to synthetic session architecture.

## Deferred from: code review of 1-3-connect-a-repository-by-url (2026-06-20)

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
- `CREDENTIAL_ENCRYPTION_KEK` is validated lazily on first call rather than at process startup — spec says "startup guard"; Next.js lazy module loading means misconfiguration surfaces as a user-facing error on the first sign-in rather than a boot failure. Documented as intentional in Dev Notes #10.

## Deferred from: code review of 1-2-sign-in-with-github (2026-06-18)

- No unit/integration test coverage for AC-2 session persistence (8h maxAge) — requires E2E test coverage in a future story.
- Non-GitHub provider path not handled — if a second OAuth provider is added, `token.userId` is never set for it and `session.userId` will be absent for those users.
- Prisma singleton never resets on stale DB connection — known limitation of the global singleton pattern in Next.js; mitigate when connection resilience is required.
- Static assets in `/public/` beyond `favicon.ico` not excluded from middleware matcher — theoretical concern; no non-favicon public assets currently exist.

## Deferred from: adversarial review of fix-turbopack-build-root (2026-06-30)

- `makeValidationError` has zero direct test coverage — the sole constructor for `ValidationError` had its spread order and parameter type changed in this fix, but no spec verifies the `documentationLink` invariant. [`apps/web/src/actions/repository-validation.actions.ts:138`]
- `invalidateValidationCache` silently no-ops on URL mismatch — if `repoUrl` fails the GitHub regex, the function returns without deleting, throwing, or logging. Current caller passes pre-validated URLs, but future callers get silently stale cache. [`apps/web/src/actions/repository-validation.actions.ts:255`]
- Cache-clearing in tests scoped to one `describe` block, not the whole spec file — `validationCache` is module-level, so any other suite calling `validateRepository` leaks cached results across tests. [`apps/web/src/actions/repository-validation.actions.spec.ts:493`]
- `experimental: {}` is dead config in `next.config.js` — empty object serves no purpose. [`apps/web/next.config.js:7`]
- CommonJS `next.config.js` inconsistent with TS/ESM codebase — file uses `require`/`module.exports` + `//@ts-check` while Next.js 16 supports `next.config.ts`. Migrating would give real type-checking on `turbopack.root` and `path.resolve`. [`apps/web/next.config.js`]

## Deferred from: code review of 1-5-resolve-git-identity-for-commit-attribution (2026-07-01)

- Empty/whitespace `githubLogin` produces invalid fallback [`apps/web/src/lib/git-identity.ts:11,16`] — `githubLogin` is not validated for emptiness before being used as fallback name and noreply email local-part. GitHub guarantees `login` is non-empty from OAuth. Not reachable through normal flows.
- `auth()` outside try/catch — rejection unhandled [`apps/web/src/actions/git-identity.actions.ts:13`] — `auth()` call sits outside the try/catch block; if it rejects (JWT decode failure, misconfigured secret), the error escapes as unhandled rejection. Consistent with all sibling Server Actions (`repo-connection.actions.ts:46`, `repository-validation.actions.ts:281`). Codebase-wide pattern, not a Story 1.5 issue.

## Deferred from: adversarial review of git-identity.test.ts comment fix (2026-07-01)

- Test name/body mismatch, pre-existing [`apps/web/src/lib/git-identity.test.ts:124`] — `'function accepts no token parameter in its signature'` describes a signature check, but the body only asserts on the return value; no signature-level check exists. Predates this comment fix.
- Near-duplicate test coverage, pre-existing [`apps/web/src/lib/git-identity.test.ts:115-137`] — the `'return type contains only name and email keys'` test and the `'function accepts no token parameter'` test both assert the same return shape at runtime. Predates this comment fix.

## Deferred from: code review of 1-6-detect-and-recover-from-credential-failures (2026-07-01)

### Tenant-isolation test is tautological [`apps/web/src/lib/credential-health.test.ts`] — the test asserts the mock was not called with `'usr_other'`, but since the test only invokes `resolveOAuthToken(USER_ID)`, the mock could never have been called with another user's ID. The `expect(callArg).toEqual({ where: { userId: USER_ID } })` assertion is meaningful; the `not.toContain('usr_other')` check is redundant. Implementation is correct (`findUnique({ where: { userId } })`).

## Deferred from: code review of 1-7-enforce-authenticated-full-access-for-all-mvp-users (2026-07-01)

- `/api/internal/test/*` bypasses auth in production [`apps/web/src/middleware.ts:8`] — matcher permanently exempts `/api/internal/test` from auth; `TEST_ENV` route guard is the sole protection layer. Known issue (deferred-work.md line 35); spec explicitly says DO NOT fix in this story.
- Layout redirect omits `callbackUrl` (unlike middleware) [`apps/web/src/app/(dashboard)/layout.tsx:7`] — `redirect('/sign-in')` in the dashboard layout does not preserve the user's intended destination via `callbackUrl`, unlike the middleware `authorized` callback. Spec-prescribed pattern; existing pages (`page.tsx`, `onboarding/page.tsx`) follow the same convention.
- Matcher regex over-excludes prefix-colliding paths [`apps/web/src/middleware.ts:8`] — negative-lookahead alternatives `api/auth`, `api/internal/test`, `_next/static`, `_next/image` lack trailing boundary anchors; paths like `/api/authors` or `/api/authentication` are silently excluded from auth. Pre-existing in the unchanged matcher; spec says DO NOT modify.
- `auth()` throwing in layout guard is unhandled [`apps/web/src/app/(dashboard)/layout.tsx:5`] — `await auth()` has no try/catch; if `auth()` rejects (corrupt JWT, misconfigured `AUTH_SECRET`), the error propagates uncaught with no `error.tsx` boundary. Codebase-wide pattern; all existing pages and server actions follow the same convention.

## Deferred from: code review of spec-1-4-fix-skills-directory-detection (2026-07-01)

- No test coverage for large `.claude/skills/` fan-out (dozens+ of directory entries) [`apps/web/src/actions/repository-validation.actions.ts:139-156`] — `countSkills` fires one unbounded parallel GitHub request per skill directory (this repo alone has 90+); the spec explicitly rejected adding a concurrency limiter as speculative for MVP repo sizes, so this is an accepted trade-off, not a bug — but there's no test simulating a large-repo fan-out to document expected behavior (or catch a future secondary-rate-limit regression) if that trade-off is revisited.

## Deferred from: code review of 1-8-build-the-persistent-app-shell (2026-07-01)

- `repoConnection.findUnique` has no error boundary; DB failure 500s every guarded dashboard route [`apps/web/src/app/(dashboard)/(app)/layout.tsx:20`] — `getPrisma().repoConnection.findUnique()` is awaited with no `try/catch` and no `error.tsx` exists in the route tree. A transient DB error or unset `DATABASE_URL` turns every guarded dashboard page into an unhandled 500. Codebase-wide pattern (spec Known Issues says do not fix `auth()` try/catch; same applies here).

## Deferred from: code review of 1-4-validate-bmad-initialization-in-the-connected-repository (2026-07-02)

- `validateRepository` is not wired into any UI flow [`apps/web/src/actions/repository-validation.actions.ts`] — the onboarding flow calls `connectRepository`, which invokes `inspectBmadSetup` directly and bypasses the validation cache. `validateRepository` (with its cache) is exercised only by tests. Wiring it into a UI surface (or removing it) is a product decision.
- In-process validation cache is ineffective on multi-instance/serverless deployments [`apps/web/src/actions/repository-validation.actions.ts`] — the `Map` cache and its invalidation only hold within one process. Accepted MVP limitation; revisit if deployment topology changes.
- GitHub contents API truncates directory listings at 1000 entries [`apps/web/src/actions/repository-validation.actions.ts`] — a repo whose root or `.claude/skills/` exceeds 1000 entries could produce a false `MISSING_DIRECTORY`/skills undercount. Exotic for MVP; the git trees API would be the fix.
- Required dirs tracked as submodules/symlinks report as missing [`apps/web/src/actions/repository-validation.actions.ts`] — the `type === 'dir'` filter rejects `submodule`/`symlink` entries even though the directory exists after checkout.
- `config.yaml` version parsed from a `# Version:` comment [`apps/web/src/actions/repository-validation.actions.ts`] — comment-based format is not guaranteed by BMAD; a regeneration that drops the comment silently downgrades detection to the `package.json` fallback. Works against real BMAD 6.x output today.
- Story 1.4 integration-test checklist (onboarding flow 1.3→1.4→1.5, retry-after-fix e2e) unchecked [`_bmad-output/implementation-artifacts/1-4-validate-bmad-initialization-in-the-connected-repository.md`] — component-level coverage only; onboarding e2e specs exist but do not cover the BMAD-validation retry path.

## Deferred from: code review of 1-9-document-and-validate-the-kek-rotation-runbook (2026-07-02)

- `scripts/rotate-kek.ts` operational polish [`scripts/rotate-kek.ts`] — (a) `findMany` loads the whole `oauth_credentials` table into memory with no cursor batching (fine at MVP scale, revisit for large tables); (c) `retry needed` and `failed` share exit code 1, so automation can't distinguish "loop again" from "stop and investigate". All low severity.

## Deferred from: adversarial review of 1-6-ac1-credential-flip-within-one-cycle (2026-07-02)

- No coverage for the rejecting-`markCredentialFailed` path on the GitHub API 401 branch [`apps/web/src/actions/repo-connection.actions.ts:107`] — `await markCredentialFailed(...)` on line 107 has no `.catch()` (unlike line 75 which uses `.catch()`). If `markCredentialFailed` rejects (DB unreachable), the error propagates to the outer catch and the user sees `errorCode: 'UNKNOWN'` instead of `'NO_CREDENTIAL'`. The test only exercises the happy-path flip. A test locking down the expected `errorCode` when `markCredentialFailed` rejects belongs here but is out of scope for the "within one cycle" timing property this change closes.

## Deferred from: architecture discussion following implementation readiness assessment of Epic 4 (2026-07-03)

- **[BLOCKING — needs security investigation before Epic 3 sandbox-provisioning stories ship] Raw `ANTHROPIC_API_KEY` becomes readable inside every Daytona sandbox, and no existing mitigation addresses the most direct disclosure path.** Per existing research (`technical-programmatic-claude-code-agent-sdk-research-2026-06-11.md`, `technical-claude-agent-sdk-sandboxed-tool-execution-research-2026-06-12.md`, `technical-docker-per-session-daytona-ai-agent-isolation-research-2026-06-12.md`), the Claude Agent SDK runs *inside* the sandbox and is planned to receive a single, shared, platform-wide `ANTHROPIC_API_KEY` as a plaintext env var at Daytona `create()` time (sourced from `apps/agent-be`'s own Railway secret). `technical-network-security-between-agent-be-and-daytona-sandbox-research-2026-06-16.md` already flags this key (and `GITHUB_TOKEN`) as exfiltratable per Daytona's own Security Exhibit, and recommends `networkAllowList` egress restriction as mitigation — but that mitigation only closes *network* exfiltration to an external host. It does nothing about the simpler path: any signed-in user can ask their own agent to print its environment variables, and the value returns through the ordinary, always-open chat/Tool Pill output channel — no network egress, no sophisticated attack, just one chat message. Because the key is shared platform-wide (not per-tenant), one user's action (malicious or merely curious) compromises the credential for every team on the platform. Not yet addressed anywhere in `epics.md` or `architecture.md`.
  - **Investigation needed:** whether Claude Code / the pinned Agent SDK version supports routing its Anthropic authentication through a proxy or credential-helper mechanism controlled by `apps/agent-be`, so the raw key never enters the sandbox's environment or filesystem at all (as opposed to merely narrowing its network egress).
  - **Blocks:** Epic 3 Story 3.1 (sandbox initialization sequence) and Epic 4 Story 4.5 (env vars/secrets wiring) should not be marked complete against the current "inject raw key into sandbox env" design until this is resolved one way or the other.
  - **Resolution (2026-07-11, Party Mode roundtable):** NFR-S1 is inviolable — `ANTHROPIC_API_KEY` must not enter the sandbox. The proxy-through-agent-be approach is the selected solution. `agent-be` exposes a thin pass-through endpoint (e.g. `POST /proxy/anthropic`) that injects the API key as an `Authorization` header and forwards to `api.anthropic.com`. The sandbox is launched with `ANTHROPIC_BASE_URL` pointing at the proxy — no key, no secret, no credential of any kind. The Claude Agent SDK supports `ANTHROPIC_BASE_URL` natively; no agent runtime changes required.
  - **Alternatives considered and rejected:**
    - *Anthropic sub-keys (per-session derived keys with spend limits):* technically feasible but violates NFR-S1 — a derived platform key is still a platform-internal credential, not the user's OAuth token. Shifts risk from key exfiltration to key lifecycle management (provision/rotate/revoke per session). Contingent guarantee ("safe unless sub-key leaks before revocation") vs. the proxy's invariant guarantee ("no credential ever exists in the sandbox").
    - *Daytona's native Claude Code OAuth flow:* dead end for the Agent SDK — requires interactive browser-based auth, not compatible with programmatic SDK usage. Confirmed by Daytona docs (https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/) which never mention `ANTHROPIC_API_KEY` env var injection.
  - **Rework required:**
    - **Story 4.5 ACs:** remove "sandbox env includes `ANTHROPIC_API_KEY`"; add "sandbox config includes `ANTHROPIC_BASE_URL` pointing at agent-be proxy endpoint"; add "no `ANTHROPIC_API_KEY` or secret material in `SandboxService.create()` payload or Daytona snapshot config". `ANTHROPIC_API_KEY` stays as a Railway env var on agent-be, but its purpose changes from "injected into sandboxes" to "consumed by agent-be proxy endpoint".
    - **New story or expanded 4.5:** build the proxy endpoint in `apps/agent-be` (~30 lines: forward HTTP requests to `api.anthropic.com` with injected `Authorization` header; never leak key in response body/headers).
    - **Story 3.1 sandbox init sequence:** replace `ANTHROPIC_API_KEY` env var injection with `ANTHROPIC_BASE_URL` env var injection. The `networkAllowList` must still include the agent-be proxy URL as an allowed egress target.
    - **NFR-P1 latency concern:** the proxy adds a hop (sandbox → agent-be → Anthropic). Pin agent-be and Anthropic API to the same region. Measure, don't assume — if the proxy adds material latency, NFR-P1 (1,500ms to first token) and NFR-S1 are in tension, which is an architecture decision.
    - **NFR-O1 spend tracking:** the proxy can set per-request spend metadata using the platform key — Anthropic-native spend accounting without putting any key in the sandbox.
  - **Test cases:** posted at `_bmad-output/test-artifacts/security-test-cases-secrets-sandbox.md` (SEC-001 through SEC-011).
  - **Residual risk (accepted for MVP):** the per-user `GITHUB_TOKEN` is still injected into the sandbox (NFR-S1-compliant — it's the user's own OAuth token). A prompt-injected agent can exfiltrate it via allowed-host egress (GitHub is on the allow-list). Host-mediated git (agent-be executing git via Daytona process API, raw token stays out of sandbox) is the structural fix, deferred to post-MVP. Document this as a known, accepted risk in the architecture doc.
