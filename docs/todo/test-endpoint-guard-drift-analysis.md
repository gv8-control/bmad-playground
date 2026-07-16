# Test-Endpoint Guard & Unit Test Fix — Drift Analysis

**Date:** 2026-07-16
**Status:** Analysis complete; plan ready for implementation
**Scope:** Unit & integration tests only (E2E/Playwright sharded tests are out of scope)
**Origin:** Review of commits `0b12f93` through `0bc0104` that fixed CI unit test failures

---

## What was done

The investigation (`_bmad-output/implementation-artifacts/investigations/ci-unit-test-failures-investigation.md`) correctly identified that the "silent death" of CI unit tests was **Nx output truncation masking real failures**. Four `api/internal/test/**/route.test.ts` suites were failing because they hit TEST_ENV-guarded routes that returned 404 when `TEST_ENV` wasn't set in CI (local Nx auto-loads `.env`, which defines `TEST_ENV`; CI does not).

The fixes across commits `0b12f93` → `3019bd8` → `0bc0104`:

| Change | What it did |
|---|---|
| `test-endpoint-guard.ts` created | Centralized the per-route inline guard into a shared function |
| **Guard logic changed** | Added `CI === 'true'` bypass: `TEST_ENV set AND (NODE_ENV != production OR CI === 'true')` -> enabled |
| `test-setup-env.ts` created | Global `beforeEach` setting `TEST_ENV='ci'`, wired via `jest.config.ts` `setupFilesAfterEnv` |
| Per-suite `beforeEach`/`afterAll` removed | Replaced by the centralized setup (good DRY) |
| "returns 404 in production" tests mutated | Now `delete process.env.CI` inside each test body to work around the new bypass |
| `--outputStyle=stream` added to CI | Prevents the output truncation that masked real failures (correct permanent fix) |
| `--parallel=2` restored | After the OOM mitigation was reverted |

### What was done right

- The investigation was thorough, evidence-grounded, and correctly refuted 6 wrong hypotheses (OOM, segfault, unhandled rejection, external kill, process.exit, time-anchored kill)
- `--outputStyle=stream` is the correct permanent fix for the output truncation
- Centralizing `TEST_ENV` setup in `test-setup-env.ts` is a reasonable DRY improvement
- Creating a shared `test-endpoint-guard.ts` is good centralization (the execution drifted, not the concept)

---

## Drift assessment

### Drift 1 (HIGH): The CI bypass is a security model change disguised as a test fix

The guard now allows `CI=true` to override `NODE_ENV=production` blocking. This was added so E2E tests can run against production builds (commit `2dd6495`), where `next start` sets `NODE_ENV=production`. But the author's premise -- "CI=true differentiates a test server from a real production deployment" -- is **factually wrong in two of three deployment contexts**:

- **On Vercel (the actual production host):** `CI` is only available at **build time**, not runtime in serverless functions (per Vercel's own system env var docs). The bypass is inert there **by accident** -- `CI` is simply absent at runtime, so `TEST_ENV` + `production` correctly 404s. The author got lucky, not right.
- **On any self-hosted runtime** (Railway, Docker, GitHub Actions-hosted `next start`): `CI=true` is ambient. If `TEST_ENV` is also set (and the committed `.env` literally has `TEST_ENV=local`), all six unauthenticated DB-seeding endpoints (`seed-user`, `repo-connections`, `conversations`, `turns`, `artifacts`) go live on a production DB. The boot-time `env-guard.ts` uses the same predicate, so it's defeated together.

The fix conflated two concerns: (a) making unit tests pass by setting `TEST_ENV`, and (b) enabling E2E against production builds. The `CI` env var was the wrong mechanism for (b) -- it doesn't reliably distinguish "test server" from "real production."

**Amplifying factor:** `apps/web/src/middleware.ts:8` permanently exempts `/api/internal/test` from the NextAuth matcher. The test endpoints bypass auth middleware entirely. `isTestEndpointEnabled()` is the **sole** gate protecting them. The `CI` check is therefore load-bearing for security, not just a convenience flag.

### Drift 2 (HIGH): The unit tests now test a narrower contract, and the gap is untested

The "returns 404 in production" tests now `delete process.env.CI` to work around the bypass. This means:

- **The test name is misleading** -- it's really "returns 404 in production **outside CI**." `NODE_ENV === 'production'` is no longer sufficient for a 404.
- **The positive bypass case** (`production + CI=true` -> 200) -- the entire *purpose* of the guard change -- is **never asserted** anywhere. It's only trusted implicitly via E2E succeeding.
- **There is no dedicated `test-endpoint-guard.test.ts`** with a truth table. The guard is only indirectly exercised through four route test files.
- **The `env-guard.ts` boot-time guard has zero unit tests.**

Missing guard truth-table cases (against the **current** guard, which uses `CI` as the bypass signal -- Phase 2 tests will cover the equivalent cases against the new `ALLOW_TEST_ENDPOINTS_IN_PRODUCTION` signal):

| TEST_ENV | NODE_ENV | CI | Expected | Tested? |
|---|---|---|---|---|
| set | production | `'true'` | **200** (the bypass case) | **No** |
| set | production | unset | 404 | Yes (inline, after deleting CI) |
| set | non-production | any | 200 | No |
| **unset** | production | `'true'` | **404** (CI alone doesn't open the door) | **No** |
| unset | any | any | 404 | Yes (via "TEST_ENV unset" test) |

### Drift 3 (MEDIUM): Two routes modified in the same commit have no tests at all

`conversations/route.ts` (which has non-trivial upsert-vs-create branching logic added in `0b12f93`) and `conversations/[id]/turns/route.ts` have **no `route.test.ts` files**. The upsert-with-custom-id branch is completely unverified.

### Drift 4 (MEDIUM): The 4 internal/test route tests over-test infrastructure wiring

These routes exist solely to serve E2E fixtures (`withArtifacts`, `withRepoConnection`, `withUser`). The survey confirmed:
- The **404-guard tests** are genuinely valuable -- the test design docs explicitly mandate "regression-guard tests for security invariants assert ABSENCE" (`project-context.md:259`), and the investigation itself recommended keeping them
- The **Prisma-arg-shape tests** (e.g. "calls `deleteMany` with the correct `where` clause") verify trivial wiring of test-only routes against mocks -- low value, redundant with the E2E fixtures that exercise these routes against the real DB

The fix doubled down on testing test infrastructure rather than questioning whether the arg-shape tests add value.

### Drift 5 (LOW): Two vacuous placeholder tests

`libs/database-schemas/src/lib/database-schemas.spec.ts` and `libs/shared-types/src/lib/shared-types.spec.ts` are unmodified Nx scaffolding placeholders that assert a function returns its own name. They add CI time for zero value.

---

## Resolved unknowns

### Unknown 1: Are there other consumers of the `CI` env var for production-vs-test detection?

**Resolved: No.** A complete audit found only two source files read `process.env.CI` for security-sensitive decisions:

1. `apps/web/src/lib/test-endpoint-guard.ts:15` -- the per-request guard
2. `apps/web/src/lib/env-guard.ts:30` -- the boot-time guard (invoked from `instrumentation.ts`)

All other `process.env.CI` reads are for test-runner ergonomics (Playwright config: `forbidOnly`, `retries`, `workers`) or test-tier selection (multi-conn spec skip logic). These are unaffected by changing the guard's logic. There is no existing alternative env var (`VERCEL_ENV`, `RAILWAY_ENVIRONMENT`, etc.) that already serves as an "is production?" signal in source code.

**Blast radius of changing the guard:** the two guard files, the 6 "returns 404 in production" test blocks across 4 route test files, and the E2E setup (which must set whatever new signal replaces CI). The `test.yml` "Start web app" steps (e2e + burn-in jobs) would need the new env var added.

### Unknown 2: Does `conversations/[id]/turns/route.ts` have non-trivial logic worth testing?

**Resolved: Yes, marginally.** The turns route POST has two conditional branches:
1. **`segments` conditional spread** via loose `!= null` check -- only includes the field when not null/undefined. Three cases worth covering: omitted/undefined, explicit `null`, and a real JSON object. The `!= null` loose check is the kind of thing that silently breaks if refactored to `!== undefined`.
2. **`createdAt` fallback** to `new Date()` -- worth one assertion that an omitted `createdAt` results in a stored `Date` instance.

DELETE is a pure passthrough (guard, extract param, `deleteMany`, respond). The turns route is mid-pack complexity -- simpler than artifacts/conversations but more complex than seed-user/repo-connections.

**Priority:** The conversations route is the **more deserving** missing-test candidate -- its upsert-vs-create branch is the kind of logic that actually fails when refactored. If prioritizing, conversations POST edges out turns POST on test value.

**Minor inconsistency noted:** The turns route lacks the body validation (`{ status: 400 }`) that conversations DELETE and artifacts DELETE have. A request missing `turns` throws an unhandled `TypeError` instead of a clean 400.

### Unknown 3: Do the test design docs prescribe an approach for testing test-infrastructure routes?

**Resolved: Yes -- they endorse testing them.** The docs explicitly document test-only routes as legitimate, two-layer-guarded infrastructure (`project-context.md:95`) and mandate regression-guard tests for the security invariant these routes enforce (`project-context.md:259`). The investigation itself recommended keeping the 404-guard tests. The docs do NOT say "don't unit-test test-infrastructure code."

The docs treat test-endpoint reachability as a security concern worth verifying. The 4 route tests align with the documented vision in their guard assertions. The one genuine misalignment was the env-dependence (now fixed). The Prisma-arg-shape tests, however, are not mandated by the docs -- they test mock wiring, not real behavior, and the Duplicate-Coverage Guard (`test-levels-framework.md:120-130`) would question their value given E2E fixtures exercise the real routes.

---

## Plan: Bringing the test setup back on track

### Phase 1: Fix the security model (HIGH, ~1-2 hours)

**Problem:** The `CI` env var is the wrong signal for "is this a test server, not real production."

**Recommendation:** Replace the `CI === 'true'` bypass with an explicit, non-ambient signal. Introduce a dedicated env var (e.g. `ALLOW_TEST_ENDPOINTS_IN_PRODUCTION=true`) as the bypass signal. Set it only on the "Start web app" steps in the e2e and burn-in CI jobs in `test.yml` where `web:start` runs against a production build.

The guard becomes:
```ts
export function isTestEndpointEnabled(): boolean {
  if (!process.env.TEST_ENV) return false;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_ENDPOINTS_IN_PRODUCTION !== 'true') return false;
  return true;
}
```

**Why this is better:** The new signal has no ambient presence on any platform -- it must be explicitly set, making the exposure surface deliberate and visible. It cannot accidentally be true on Vercel, Railway, Docker, or any other deployment context.

**Files to update:**
- `apps/web/src/lib/test-endpoint-guard.ts` -- change the guard predicate
- `apps/web/src/lib/env-guard.ts` -- change the boot-time guard to match (must stay in lockstep)
- `.github/workflows/test.yml` -- set the new env var on the 2 "Start web app" steps (e2e job line ~245, burn-in job line ~390). The "Build web app" steps do **not** need it: the guard runs at runtime (per-request via `isTestEndpointEnabled()` and at boot via `instrumentation.ts` -> `assertRequiredEnv()`), and `next build` invokes neither.
- `apps/web/src/test-setup-env.ts` -- no change needed (already sets `TEST_ENV='ci'`, which is sufficient for non-production test env)

**Trade-off:** Requires updating 2 `test.yml` steps. Small, mechanical change. The benefit is that the bypass signal is now non-ambient and cannot accidentally be true on any deployment platform.

**env-guard.ts redundancy note:** After this change, both `test-endpoint-guard.ts` and `env-guard.ts` will contain identical logic (`TEST_ENV` + `production` + no bypass -> block). The project-context.md describes these as "two layers" of guarding, but if the logic is identical, the second layer catches the exact same condition at a slightly different time (boot vs. per-request). We accept this as defense-in-depth: both must be defeated for the endpoints to be exposed. Making `env-guard.ts` stricter (e.g., refuse to boot if `ALLOW_TEST_ENDPOINTS_IN_PRODUCTION=true` on what looks like real production) would reintroduce the "what signal indicates real production?" problem that this fix eliminates.

**Nightly tiers future-proofing:** The nightly-multi-conn, nightly-real-service, and weekly-spike jobs also set `CI: true` + `TEST_ENV: ci`, but they use `web:dev` (via Playwright's `webServer` block in `playwright.config.ts`), not `web:start`. Since `next dev` doesn't set `NODE_ENV=production`, the bypass isn't needed there today. However, commit `2dd6495` already demonstrated the pattern of switching E2E from dev to production builds -- if someone does the same for nightly tiers, they'd need to set the new env var on those steps too. No change needed now, but flag this if nightly tiers migrate to production builds.

**Alternative considered and rejected:** E2E fixtures could use Prisma directly (via a test-only database connection) instead of HTTP endpoints, eliminating the guard problem entirely -- no HTTP endpoints to protect, no env-var bypass needed. This was rejected because it's a significantly larger change (rewriting all E2E fixtures, removing the route handlers, establishing a test-only DB connection pattern) for a security surface that this env-var fix adequately closes. The current approach trades a smaller implementation for a permanent (but now well-guarded) security surface.

### Phase 2: Add the missing guard truth-table test (HIGH, ~30 min)

**Problem:** The guard's behavior is only indirectly tested through route tests, and the bypass case is untested.

**Recommendation:** Create `apps/web/src/lib/test-endpoint-guard.test.ts` with a parametrized truth table covering all combinations of `(TEST_ENV, NODE_ENV, bypass-signal)`. Also add tests for `env-guard.ts`'s `assertRequiredEnv()` -- it currently has zero unit tests.

**Note on `assertRequiredEnv()` test setup:** `assertRequiredEnv()` validates the entire env schema (`API_URL`, `AUTH_SECRET`, `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK`) via Zod before reaching the TEST_ENV check. Testing just the TEST_ENV branch requires setting all required env vars first. This isn't hard but is non-trivial setup that should be accounted for in the time estimate.

The truth table should cover at minimum:
- The bypass case (`production` + bypass signal set -> 200) -- currently untested
- Production without bypass (`production` + no bypass signal -> 404)
- Non-production with and without bypass signal
- `TEST_ENV` unset in all combinations (must always 404)
- The "CI alone doesn't open the door" case (bypass signal set but `TEST_ENV` unset -> 404)

### Phase 3: Fix the "returns 404 in production" test names + simplify route tests (MEDIUM, ~1 hour)

**Problem:** The test name is misleading, and the route tests include low-value arg-shape assertions.

**Recommendation:**
1. **Rename** the "returns 404 in production" tests to reflect what's actually being tested (e.g. "returns 404 in production without test-endpoint bypass").
2. **Remove the inline `delete process.env.CI` workaround** from the 4 route test files -- once the guard uses a non-ambient bypass signal (Phase 1), the production-guard test just needs to not set that signal, which is the default.
3. **Reduce the 4 route test files** to: one smoke test per route (POST/DELETE happy path) + the 404-guard test. Remove the low-value Prisma-arg-shape assertions that verify trivial wiring already covered by E2E fixtures. This reduces ~26 tests to ~12 without losing real coverage. **Trade-off:** arg-shape tests verify Prisma call arguments against mocks (precise, fast, brittle); E2E fixtures exercise the routes against a real database (comprehensive, slow, less precise). Removing arg-shape tests means a change to Prisma call arguments (e.g., someone changes the `where` clause) would only be caught by E2E, which is slower and harder to debug. For test-only routes, this trade-off is defensible -- the routes exist solely to serve E2E fixtures, and the E2E fixtures are the real contract.
4. **Add route tests for `conversations/route.ts`** -- at minimum a smoke test + the 404-guard + a test for the upsert-vs-create branching logic (the most deserving missing-test candidate). These are **logic tests** (verifying branching behavior), not arg-shape tests (verifying Prisma call arguments) -- the distinction matters because Phase 3 step 3 removes arg-shape tests from existing routes as low-value, while these new tests verify actual behavioral branches that fail when refactored.
5. **Add route tests for `conversations/[id]/turns/route.ts`** -- a smoke test + the 404-guard + a test for the `segments` conditional spread branch. Same logic-test rationale as above.
6. **Fix the turns route body validation bug** (identified in Unknown 2): `conversations/[id]/turns/route.ts` POST lacks body validation -- a request missing `turns` throws an unhandled `TypeError` instead of a clean 400. Add `{ status: 400 }` validation matching the pattern in `conversations/route.ts` DELETE (lines 59-65), plus a test for the 400 case. This is a small fix that should be included in the same phase since we're already adding tests for this route.

### Phase 4: Delete vacuous placeholder tests (LOW, ~5 min)

**Problem:** Two Nx scaffolding placeholder tests add CI time for zero value.

**Recommendation:** Delete `libs/database-schemas/src/lib/database-schemas.spec.ts` and `libs/shared-types/src/lib/shared-types.spec.ts`. The `passWithNoTests: true` flag on their Jest configs keeps the targets green with zero tests.

### Not recommended

- **Do not add a test for the JSDoc corruption** (the `区分ates` typo in `0b12f93`). This is a code-review process issue, not a test issue. A lint rule for non-ASCII in JSDoc would be over-engineering for a one-off.
- **Do not remove the 4 internal/test route test files entirely.** The docs endorse testing the security guard, and the 404-guard tests are mandated. Only the arg-shape assertions should be pruned.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Changing the bypass signal breaks E2E in CI | E2E tests can't access test endpoints against production builds | Update the 2 "Start web app" steps in `test.yml` in the same commit; run E2E to verify |
| Removing Prisma-arg-shape tests reduces coverage | Loss of regression detection if route handler logic changes | The smoke tests + E2E fixtures cover the real behavior; the arg-shape tests only verified mock wiring |
| Self-hosted deployment is not currently a use case | The CI bypass security hole is theoretical | True today (Vercel is the production host), but the `web:start` target was added in the same commit -- if someone uses it, the hole becomes real. Fixing the signal is cheap insurance. |
| `.env` + `next start` local behavior change | Running `next start` locally (production build) with the committed `.env` (`TEST_ENV=local`) will now throw at boot via `env-guard.ts` because `TEST_ENV` + `production` + no bypass signal = refuse to start | This is **correct behavior** (fail loudly, not silently). No mitigation needed -- it's the system working as intended. Document as a known behavior change so developers aren't surprised. |
