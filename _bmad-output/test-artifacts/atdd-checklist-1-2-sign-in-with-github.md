---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-activate
lastStep: step-05-activate
lastSaved: '2026-06-18'
storyId: '1.2'
storyKey: 1-2-sign-in-with-github
storyFile: _bmad-output/implementation-artifacts/1-2-sign-in-with-github.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-1-2-sign-in-with-github.md
generatedTestFiles:
  - playwright/e2e/auth/sign-in.spec.ts
  - apps/web/src/lib/auth.config.spec.ts
  - apps/web/src/lib/auth.integration.spec.ts
---

# ATDD Checklist — Story 1.2: Sign In with GitHub

**TDD Phase:** GREEN (tests activated and passing)
**Stack:** fullstack (Next.js + NestJS)
**Generated:** 2026-06-18
**Activated:** 2026-06-18
**Execution Mode:** SEQUENTIAL

---

## Summary

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E (Playwright) | `playwright/e2e/auth/sign-in.spec.ts` | 11 | 7 | 4 | Active — needs dev server |
| Unit (Jest) | `apps/web/src/lib/auth.config.spec.ts` | 6 | 6 | 0 | **PASSING** |
| Integration (Jest) | `apps/web/src/lib/auth.integration.spec.ts` | 7 | 7 | 0 | **PASSING** |
| **Total** | | **24** | **20** | **4** | |

---

## Acceptance Criteria Coverage

| AC | Description | Test IDs | Priority | Status |
|---|---|---|---|---|
| AC-1a | Unauthenticated visit → redirect to `/sign-in` | E2E-01, E2E-02, E2E-03 | P0 | Active |
| AC-1b | `/sign-in` shows "Sign in with GitHub" as sole interactive element | E2E-04, E2E-05 | P0 | Active |
| AC-1c | OAuth initiates with `repo` scope | E2E-08 (skipped), UNIT-05 | P1 | Partial |
| AC-2 | Session persists across reload, maxAge ≥ 8 hours | E2E-06, E2E-07 (skipped) | P0 | Skipped (needs real GitHub) |
| AC-3 | OAuth failure → inline error, button re-enabled | E2E-09, E2E-10 | P1 | Active |
| AC-4 | All unauthenticated requests redirect to `/sign-in` | E2E-01…03, UNIT-01…04 | P0 | Active + Passing |

---

## Infrastructure Fix Applied

`playwright/auth.setup.ts` line 21 was navigating to `${baseUrl}/auth/signin` (wrong URL). Fixed to `${baseUrl}/sign-in` to match the implementation. **This fix is required for any E2E test to reach an authenticated state.**

---

## Mock Fixes Applied (during activation)

| File | Issue | Fix |
|---|---|---|
| `auth.config.spec.ts` | `next-auth/providers/github` mock missing `__esModule: true` | Added `__esModule: true` to mock factory |
| `auth.config.spec.ts` | `Response is not defined` in jsdom — callback uses `Response.redirect()` | Added `@jest-environment node` docblock |
| `auth.integration.spec.ts` | `next-auth` mock missing `__esModule: true` | Added `__esModule: true` to mock factory |

---

## Remaining Skipped Tests (require real GitHub credentials)

| Test | Reason | How to activate |
|---|---|---|
| `[P1] clicking "Sign in with GitHub" navigates toward GitHub OAuth` | Requires `AUTH_GITHUB_ID` env var so Auth.js can generate OAuth redirect URL | Set `AUTH_GITHUB_ID` in `.env`, remove `test.skip` |
| `[P0] authenticated session survives page reload` | Requires `auth.setup.ts` to run with `TEST_GITHUB_USERNAME` / `TEST_GITHUB_PASSWORD` | Configure test GitHub account in `.env`, remove `test.skip` |
| `[P0] session cookie maxAge is at least 8 hours` | Same as above | Same as above |

---

## Activation Checklist

### Unit + Integration tests (no credentials needed)

```bash
pnpm nx test web --testPathPattern="auth\.(config|integration)\.spec"
```

- [x] `[P0] returns true for authenticated user on any route`
- [x] `[P0] redirects unauthenticated page request to /sign-in`
- [x] `[P0] includes callbackUrl matching the requested pathname`
- [x] `[P1] returns a 401 JSON response for unauthenticated /api/* request`
- [x] `[P1] GitHub provider is the only configured provider`
- [x] `[P1] sign-in page is configured as /sign-in`
- [x] `[P0] upserts user in database on first GitHub sign-in`
- [x] `[P0] stores the upserted user id in token.userId`
- [x] `[P1] stores null email when GitHub provides no email`
- [x] `[P1] is a no-op on subsequent calls (session refresh, no account)`
- [x] `[P0] propagates token.userId to session.userId`
- [x] `[P1] does not set session.userId when token has none`
- [x] `[P0] JWT strategy with maxAge of 8 hours`

### E2E tests (requires running dev server, no GitHub credentials needed)

```bash
pnpm nx e2e web-e2e --grep "Story 1.2"
```

- [x] `[P0] visiting / redirects unauthenticated user to /sign-in`
- [x] `[P0] visiting a protected route redirects with callbackUrl`
- [x] `[P0] visiting any unauthenticated page never surfaces app content`
- [x] `[P0] sign-in page renders with "Sign in with GitHub" as sole interactive element`
- [x] `[P1] sign-in page shows no error by default`
- [x] `[P1] ?error query param shows inline error below re-enabled button`
- [x] `[P2] any error value triggers the same inline error message`

### E2E tests requiring GitHub credentials (keep skipped until configured)

- [ ] `[P1] clicking "Sign in with GitHub" navigates toward GitHub OAuth`
- [ ] `[P0] authenticated session survives page reload`
- [ ] `[P0] session cookie maxAge is at least 8 hours`

---

## Note on Existing Scaffold (`github-oauth.spec.ts`)

The pre-existing `playwright/e2e/auth/github-oauth.spec.ts` should be **removed** — it navigates to `/dashboard` and checks for `data-testid="project-map"` and `data-testid="credential-health"` which are Epic 2 scope and do not exist yet. It will remain broken until Epic 2 is complete. `sign-in.spec.ts` provides Story 1.2 coverage.

---

## Risk Cross-Reference (from test-design-qa.md)

| Risk | Covered by | Test ID | Status |
|---|---|---|---|
| P0-012: GitHub-OAuth-only sign-in | E2E sign-in page has sole GH button | E2E-04, E2E-05 | Active |
| P0-013: Unauthenticated redirect | Redirect tests + unit authorized callback | E2E-01…03, UNIT-01…04 | Active + Passing |
