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

## Deferred from: code review of 2-2-view-the-project-map (2026-07-03)

- `syncArtifactsAction` returns `NO_CREDENTIAL` for missing session [`apps/web/src/actions/artifacts.actions.ts:16-18`] — the `!session?.userId` check returns `NO_CREDENTIAL` which the page renders as the credential error banner. Semantically wrong (user needs to sign in, not update token), but the path is unreachable due to the `(dashboard)/layout.tsx` auth guard. Fix is ambiguous (different error code? redirect?).
- No concurrency control on page-load sync / concurrent transactions race on upsert + deleteMany [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:37-47` + `apps/web/src/lib/artifacts.ts:232-274`] — multiple page loads (refresh-spam, multi-tab, prefetch) trigger parallel `syncArtifactsAction` calls with no lock. Each runs a separate `$transaction` with upsert + `deleteMany({ notIn })`. Depending on DB isolation level, one sync's `deleteMany` could wipe rows another sync just upserted. Non-trivial fix (distributed lock or advisory lock); not required by spec.
- `<a href="#">` for non-navigating action [`apps/web/src/components/project-map/CredentialErrorBanner.tsx:27-37`] — the "Update access token" trigger is an `<a href="#">` with `preventDefault`, but semantically should be a `<button>`. Spec Task 3.1 says "a link styled in `text-negative`". Changing to `<button>` requires spec deviation. Works with `aria-label`; minor a11y concern (right-click "open in new tab" navigates to `#`).
- `capturedAt` timestamp captured too early [`apps/web/src/actions/artifacts.actions.ts:35`] — `capturedAt = new Date()` is captured at function entry, before `resolveOAuthToken()`. If token resolution is slow, the timestamp predates the actual failure. Used for optimistic-concurrency guard in `markCredentialFailed`. Minor: a concurrent re-auth during the slow call won't be respected. Fix requires restructuring to capture timestamp just before the GitHub API call.
- `Artifact.content` has no size cap [`libs/database-schemas/src/prisma/schema.prisma`] — every artifact's full markdown body is mirrored into Postgres with no enforced size ceiling. A repo with a 50 MB markdown file writes 50 MB per row. `MAX_CONTENT_ENTRIES` (10k) bounds count but not total bytes. Defer to a hardening story.
- Prisma errors uncaught in page [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:17-29`] — `findUnique` / `findMany` have no try/catch; DB connection pool exhaustion or timeout surfaces as Next.js error boundary with no co-located `error.tsx`. Codebase-wide pattern (same as `auth()` in layouts); not a Story 2.2-specific issue.
- Session drift between page-level `auth()` and inner `auth()` [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:11,31`] — the page calls `auth()` and `getCredentialHealthStatus()` also calls `auth()` internally. If the session expires between the two calls, the health check returns `{ success: false }` and the banner is suppressed. Extremely unlikely timing (both calls within milliseconds).
- Non-`NO_CREDENTIAL` sync error codes render misleading empty state [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:37-47`] — when sync returns `RATE_LIMITED`, `NOT_FOUND`, `NO_REPO_CONNECTION`, or `UNKNOWN`, the page falls through and renders "Start your first conversation to create an artifact." Spec Task 5.6 explicitly mandates this behavior ("proceed with rendering whatever is in Postgres"). Adding a sync-failure indicator is beyond the story's ACs (DP-5: scope temptation).
- Credential health check failure silently treated as "healthy" [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:31-33`] — if `getCredentialHealthStatus()` returns `{ success: false }` (DB error), `credentialFailed` is set to `false`, suppressing the banner. Spec Task 5.4 explicitly specifies `credentialResult.success && credentialResult.status === 'failed'`. Treating health-check failure differently is a UX change with no spec backing (DP-5: scope temptation).

## Deferred from: code review of 2-1-mirror-repository-artifacts-into-postgres (2026-07-03)

- `fetchLastCommitDate` swallows 5xx as `new Date()` instead of propagating [`apps/web/src/lib/artifacts.ts:53-55`] — Non-OK responses (5xx, etc.) on the commits endpoint return `new Date()` (sync time) as `lastModifiedAt`. Spec Task 4.3 sanctions `new Date()` fallback only for 404. Current behavior is defensible (don't abort sync for non-critical metadata field); aborting for transient commits-endpoint 5xx would be worse. Minor spec tension.
- Unbounded parallel API requests may trigger GitHub secondary rate limits [`apps/web/src/lib/artifacts.ts:225-227`] — All file fetches fire in one `Promise.allSettled` batch (N files × 2 requests), not per directory level as spec Performance Considerations recommends. For MVP repo sizes (20-50 artifacts) within GitHub's 5,000 req/h budget. Spec language is guidance-level, not AC-level.
- No recursion depth limit in `scanDirectory` [`apps/web/src/lib/artifacts.ts:62-84`] — Pathological repo with deeply nested directories could stack-overflow. `fetchGithubContents` caps entries per directory (10,000); BMAD repos don't have deep nesting. Not a real scenario for MVP.
- Heading inside a Markdown code block picked up as title [`apps/web/src/lib/artifacts.ts:121-124`] — `parseHeadingTitle` doesn't understand fenced code blocks, so a `#` line inside a code block could be matched as a heading. Proper fix would require a markdown parser, which the spec explicitly prohibits. Regex-based approach is inherently limited.
- Path components not URL-encoded in `fetchGithubContents` calls [`apps/web/src/lib/artifacts.ts:53-55`] — File/directory names with `#`, `?`, or `%` break the content fetch URL (`fetchGithubContents` doesn't encode the path). `fetchLastCommitDate` does encode via `encodeURIComponent`, creating an inconsistency. Fix requires separating the API path (encoded) from the stored path (raw). Low probability in BMAD repos; non-trivial fix.

## Deferred from: adversarial review of 1-6-ac1-credential-flip-within-one-cycle (2026-07-02)

- No coverage for the rejecting-`markCredentialFailed` path on the GitHub API 401 branch [`apps/web/src/actions/repo-connection.actions.ts:107`] — `await markCredentialFailed(...)` on line 107 has no `.catch()` (unlike line 75 which uses `.catch()`). If `markCredentialFailed` rejects (DB unreachable), the error propagates to the outer catch and the user sees `errorCode: 'UNKNOWN'` instead of `'NO_CREDENTIAL'`. The test only exercises the happy-path flip. A test locking down the expected `errorCode` when `markCredentialFailed` rejects belongs here but is out of scope for the "within one cycle" timing property this change closes.

## Deferred from: code review of 2-3-manually-refresh-the-project-map (2026-07-03)

- Silent fallthrough masks sync errors in page.tsx [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:231-243`] — pre-existing from Story 2.2. Sync error codes other than `NO_CREDENTIAL` (`RATE_LIMITED`, `NOT_FOUND`, `UNKNOWN`, `NO_REPO_CONNECTION`) fall through to empty state with no error feedback. User sees "Start your first conversation to create an artifact" when sync actually failed.
- Credential health failure mis-detected when health check itself errors [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:226-227`] — pre-existing from Story 2.2. `credentialResult.success && credentialResult.status === 'failed'` treats `success: false` (health check itself failed) as "healthy," suppressing the credential error banner and proceeding to a sync that may fail for the same reason.
- No pagination — `take: 100` silently truncates [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:220,237`] — pre-existing from Story 2.2, beyond Story 2.3 ACs. Users with >100 artifacts see only the newest 100 with no indication of truncation.
- Unsafe type assertions on DB rows [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:267-270`] — pre-existing from Story 2.2. `a.type as ArtifactType` and `a.status as ArtifactStatus` bypass type checking; invalid DB values would pass through with no runtime guard.
- `Promise.all` has no error boundary — partial failure crashes page [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:216-224`] — pre-existing from Story 2.2. No try/catch around `Promise.all([findMany, getCredentialHealthStatus])`; a transient Prisma error or credential check failure causes the entire page to 500.
- Page-load sync has no concurrency guard [`apps/web/src/lib/artifacts.ts:226-279`] — pre-existing from Story 2.1. Concurrent sync invocations compute different `scannedPaths` snapshots; `deleteMany({ where: { path: { notIn: scannedPaths } } })` can delete rows upserted by the other sync. Last commit wins.
- Scope creep — page.tsx rewritten end-to-end [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx`] — process issue. Story 2.2's page implementation was never committed; dev agent found a 13-line placeholder and implemented the full page as part of Story 2.3's uncommitted changes. Story 2.3's only intended change was adding `<RefreshButton />` to the header.

## Deferred from: code review of 2-4-browse-and-read-all-committed-artifacts (2026-07-03)

- Redirect paths (no session, no repoConnection) have zero test coverage [`apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx`] — the page test suite always mocks `mockAuth` to return a session and `mockFindUnique` to return a repo connection. Two of three control-flow exits (`redirect('/sign-in')`, `redirect('/onboarding')`) are untested. Matches canonical `project-map/page.test.tsx` pattern; spec Task 5.1 does not list redirect tests (DP-5).
- `mockRedirect` doesn't throw `NEXT_REDIRECT` [`apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx:443-446`] — real `redirect()` throws; the mock returns `undefined`, so execution would continue past the redirect. Coupled to the redirect-test gap above. Matches canonical pattern.
- Empty-string `title` renders empty span and malformed `aria-label` [`apps/web/src/components/artifact-browser/ArtifactListEntry.tsx:164,170`] — schema field is non-nullable but allows empty string. An artifact with `title = ""` produces `aria-label="PRD:  — Completed"` (double space). Defensive guard is scope expansion (DP-5).
- Unbounded `title` length — no truncation, wrap control, or `max-w` [`apps/web/src/components/artifact-browser/ArtifactListEntry.tsx:165`] — very long titles blow out row width or wrap many times, pushing the status badge out of alignment. Spec and mockup do not specify truncation (DP-5).
- `syncArtifactsAction()` awaited inline in Server Component with no timeout [`apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:57`] — pre-existing pattern from Story 2.2. The loading skeleton covers the initial `Promise.all` but the sync path extends TTFB by however long the GitHub sync takes (potentially 10s+). No timeout, no backgrounding.

## Deferred from: code review of 2-5-view-a-single-artifacts-rendered-content (2026-07-03)

- Sync triggered on every render of empty artifacts list [`apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:71-83`] — pre-existing from Story 2.4. No throttle/cache; every page view with empty Postgres triggers `syncArtifactsAction()`. Story 2.5 Task 4.6 explicitly says keep unchanged.
- Non-`NO_CREDENTIAL` sync errors silently swallowed [`apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:80-82`] — pre-existing from Story 2.4. `RATE_LIMITED`/`NOT_FOUND`/`NO_REPO_CONNECTION`/`UNKNOWN` fall through with no banner; `credentialFailed` stays false, `renderArtifacts` stays empty. During 30s sync cooldown, ArtifactLoadError Refresh button is a no-op with no feedback.
- `role="listitem"` overrides implicit `link` role of `<Link>`/`<a>` [`apps/web/src/components/artifact-browser/ArtifactListEntry.tsx:63-66`] — setting `role="listitem"` on `<a>` replaces its implicit `link` role. Already noted in story spec Deferred Findings; mockup uses `role="listitem"` on the entry element.
- `stripFrontmatter` regex strips non-frontmatter content starting with `---` [`apps/web/src/components/artifact-browser/ArtifactViewer.tsx:8-10`] — regex `^---\r?\n[\s\S]*?\r?\n---\r?\n?` matches any leading `---\n...\n---\n` block, not just YAML frontmatter. Intentionally copied from `artifacts.ts:121`. Edge case rare for BMAD artifacts (which always have YAML frontmatter).
- Selected artifact out of top-100 list renders viewer with no selected list entry [`apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:57-64,85`] — list query has `take: 100` but `findFirst` has no limit. If selected artifact ranks 101st+, it exists in Postgres but not in the list; no entry gets `selected={true}`. `take: 100` is pre-existing pattern from Story 2.2 (DP-5).

## Deferred from: code review of 2-6-navigate-from-the-project-map-to-an-artifact (2026-07-04)

- Test data over-specified vs. production `select` [`apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx:71-96`] — pre-existing from Story 2.2. `ARTIFACTS` fixture includes `content`, `createdAt`, `updatedAt`, `repoConnectionId` which the production `select` (id/type/title/status/lastModifiedAt/path) excludes. Tests render with fields production won't return, masking potential field-name mismatches between page and `ArtifactCard`. Minor test quality issue.
- No negative-constraint tests for "do not" rules [`apps/web/src/components/project-map/ArtifactCard.test.tsx`] — tests don't assert absence of `tabindex="0"` or `'use client'` directive. Implementation is correct (neither present). Per DP-5, not required by story spec tasks. Test coverage gap, not a code defect.
