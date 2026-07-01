---
baseline_commit: 30e5d48cb04e14a2f39dae192e5f5821b68786de
---

# Story 1.7: Enforce Authenticated, Full Access for All MVP Users

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the platform operator,
I want every page to require authentication and every authenticated MVP user to have full feature access,
so that the platform has a consistent access baseline before billing enforcement exists.

## Acceptance Criteria

### AC-1: Unauthenticated requests redirect to /sign-in

**Given** any platform route
**When** an unauthenticated request reaches it
**Then** the request is redirected to `/sign-in`

### AC-2: Authenticated users have full access — no paywall/trial/billing

**Given** an authenticated user
**When** they access any platform feature
**Then** access is granted without a paywall, trial expiry, or billing check (all MVP users auto-enrolled in full access)
**And** this access baseline is the only gate later epics' feature-specific limits (such as the FR11 concurrent-Conversation cap delivered in Epic 3) build on top of — it does not itself enforce any feature-level limit

## Tasks / Subtasks

- [x] Task 1: Add defense-in-depth auth guard in the dashboard layout (AC: 1)
  - [x] 1.1 Update `apps/web/src/app/(dashboard)/layout.tsx` — call `auth()` and redirect to `/sign-in` if no session (defense-in-depth; middleware is the primary gate, this is the secondary check for all `(dashboard)/` pages)
  - [x] 1.2 Create `apps/web/src/app/(dashboard)/layout.test.tsx` — test that the layout redirects unauthenticated users to `/sign-in` and renders children for authenticated users (follow the `(dashboard)/onboarding/page.test.tsx` pattern: `@jest-environment node`, mock `@/lib/auth` and `next/navigation`)

- [x] Task 2: Add comprehensive middleware/auth tests (AC: 1)
  - [x] 2.1 Extend `apps/web/src/lib/auth.config.spec.ts` — add tests for: unauthenticated request to nested paths (e.g. `/conversations/abc-123`) redirects with correct `callbackUrl`; unauthenticated request to `/api/internal/test/*` is NOT blocked by the `authorized` callback (matcher excludes it — verify the callback is never invoked for that path); authenticated request with session but no `userId` (edge case) still returns `true` (the `authorized` callback checks `auth?.user`, not `userId`)
  - [x] 2.2 Create `apps/web/src/middleware.spec.ts` — integration test verifying the matcher + `authorized` callback composition: assert the matcher regex excludes `/sign-in`, `/sign-in/`, `/api/auth/...`, `/api/internal/test/...`, `/_next/static/...`, `/_next/image/...`, `/favicon.ico` and matches everything else (e.g. `/`, `/onboarding`, `/conversations/123`, `/api/hello`, `/api/conversations`)

- [x] Task 3: Remove the `/api/hello` scaffold artifact (AC: 1)
  - [x] 3.1 Delete `apps/web/src/app/api/hello/route.ts` — leftover from Nx scaffold, not a platform feature; no references exist anywhere in the codebase

- [x] Task 4: Add E2E test for authenticated full-access baseline (AC: 2)
  - [x] 4.1 Add a test block to `playwright/e2e/auth/sign-in.spec.ts` (or a new `playwright/e2e/auth/access-baseline.spec.ts`) — verify an authenticated user can navigate to `/` and `/onboarding` without encountering a paywall, billing redirect, or access-denied page; assert no "upgrade", "trial", "billing", or "paywall" text appears on any rendered page

- [x] Task 5: Verify build, lint, and tests
  - [x] 5.1 Run `yarn nx run-many --target=lint --all --parallel=4` — confirm 0 lint errors
  - [x] 5.2 Run `yarn nx run-many --target=test --all --parallel=4 --passWithNoTests` — confirm all tests pass
  - [x] 5.3 Run `yarn nx build web` — confirm production build succeeds

## Dev Notes

### Architecture Context

This story delivers **FR18 (Platform Authentication)** and **FR19 (Access Control)** — the access baseline that every later epic builds on. The architecture (lines 253–254, 287–288) specifies:

- **`apps/web` middleware** is the primary authentication gate — Auth.js v5's `authorized` callback redirects unauthenticated page requests to `/sign-in` and returns 401 JSON for unauthenticated API requests.
- **`apps/agent-be`'s `active-user.guard.ts`** is the live `user.active` DB check on every privileged request — but `apps/agent-be` is still a scaffold (only `main.ts`, `app/`, `sandbox/`, `assets/`). This story does NOT implement anything in `apps/agent-be`.
- **NFR-S3 (active sandbox termination on deactivation)** is explicitly deferred to post-MVP — no in-app deactivation flow exists in MVP scope. The `User.active` field exists in the Prisma schema (`@default(true)`) but is never checked by `apps/web` (which uses JWT-based sessions, not live DB checks). For MVP, all users are active.

### What Already Exists (from Stories 1.1–1.6)

**Story 1.2 already implemented the core auth infrastructure:**

1. **`apps/web/src/middleware.ts`** — Auth.js middleware. The matcher excludes `/sign-in`, `/api/auth`, `/api/internal/test`, `_next/static`, `_next/image`, `favicon.ico`. Everything else is matched.

2. **`apps/web/src/lib/auth.config.ts`** — the `authorized` callback:
   - Authenticated user (`auth?.user` exists) → `true` (allow)
   - Unauthenticated `/api/*` request → `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`
   - Unauthenticated page request → `Response.redirect` to `/sign-in?callbackUrl=<pathname>`

3. **`apps/web/src/lib/auth.ts`** — Auth.js v5 config: JWT strategy, 8h `maxAge`, GitHub OAuth provider (`read:user user:email repo` scope), `jwt` callback (upserts User + OAuthCredential, resets credential health), `session` callback (attaches `userId`).

4. **`apps/web/src/app/sign-in/page.tsx`** — sign-in page with "Sign in with GitHub" as the sole interactive element.

5. **`apps/web/src/app/page.tsx`** — home page: calls `auth()`, redirects to `/project-map` (if repo connected) or `/onboarding` (if not).

6. **`apps/web/src/app/(dashboard)/onboarding/page.tsx`** — onboarding page: calls `auth()`, redirects to `/sign-in` if no session.

7. **`apps/web/src/lib/auth.config.spec.ts`** — 4 unit tests for the `authorized` callback (authenticated → true, unauthenticated page → redirect, callbackUrl param, unauthenticated API → 401 JSON).

8. **`playwright/e2e/auth/sign-in.spec.ts`** — E2E tests: unauthenticated `/` → redirect to `/sign-in`, unauthenticated `/dashboard` → redirect with `callbackUrl`, unauthenticated `/conversations`, `/settings`, `/artifacts` → redirect, sign-in page UI, OAuth error state, session persistence.

### What This Story Adds

This story is primarily about **enforcing and verifying** the access baseline — most of AC-1 is already implemented. The concrete additions are:

1. **Defense-in-depth auth guard in `(dashboard)/layout.tsx`** — currently the layout is just `<>{children}</>`. Adding an `auth()` check means ALL pages under `(dashboard)/` are protected even if the middleware is somehow bypassed (e.g., misconfigured matcher, future route added outside the group). This also establishes the pattern: the layout is where the `(dashboard)` route group's shared auth enforcement lives, and where Story 1.8 will add the app shell.

2. **Comprehensive middleware tests** — the existing `auth.config.spec.ts` tests the `authorized` callback in isolation but doesn't test the matcher composition. New tests verify the matcher regex excludes the right paths and matches everything else.

3. **E2E test for authenticated full-access** — verifies AC-2 (no paywall/billing gate blocks authenticated users). This is a "negative" test — it asserts the ABSENCE of feature gates.

4. **Remove `/api/hello`** — scaffold artifact cleanup.

### Critical: Do Not Reinvent

- **DO NOT** create a new auth library or middleware — Auth.js v5 is already wired in `apps/web/src/lib/auth.ts` and `apps/web/src/lib/auth.config.ts`.
- **DO NOT** add a live `user.active` DB check to the middleware or layout — the architecture places this in `apps/agent-be`'s `active-user.guard.ts` (still a scaffold). For MVP, all users are active (NFR-S3 deferred). The middleware uses JWT, not live DB checks.
- **DO NOT** create a billing/plan/tier system or a `requireFullAccess()` guard — AC-2 is about the ABSENCE of feature gates. Adding a guard that always returns `true` is over-engineering for MVP. The "full access" policy is enforced by simply not having any feature-gating code.
- **DO NOT** modify the middleware matcher to remove the `/api/internal/test` exclusion — this is a known, documented trade-off (deferred-work.md line 35). The internal test routes have their own `TEST_ENV` env var guard. Fixing this is out of scope.
- **DO NOT** add auth checks to individual `(dashboard)/` pages — the layout handles it. Individual pages that need `userId` (like `page.tsx` and `onboarding/page.tsx`) already call `auth()` for user context, but access control is the layout's job.
- **DO NOT** implement `apps/agent-be`'s `active-user.guard.ts` or `boundary-jwt.guard.ts` — `apps/agent-be` is still a scaffold. Those guards are for Epic 3.

### The Middleware Matcher (do not change)

```typescript
// apps/web/src/middleware.ts
export const config = {
  matcher: [
    '/((?!sign-in(?:/|$)|api/auth|api/internal/test|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
```

This regex excludes:
- `/sign-in` and `/sign-in/...` (the sign-in page itself — no redirect loop)
- `/api/auth/...` (Auth.js route handler — must be publicly accessible)
- `/api/internal/test/...` (test-only routes — protected by `TEST_ENV` env var, not auth; see deferred-work.md line 35)
- `/_next/static/...`, `/_next/image/...`, `/favicon.ico` (static assets)

Everything else is matched and runs through the `authorized` callback.

### The `authorized` Callback (already correct — no changes needed)

```typescript
// apps/web/src/lib/auth.config.ts
authorized({ auth, request }) {
  if (auth?.user) return true;  // AC-2: authenticated = full access, no further checks

  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const signInUrl = new URL('/sign-in', request.url);
  signInUrl.searchParams.set('callbackUrl', pathname);
  return Response.redirect(signInUrl);
}
```

The `if (auth?.user) return true` line IS the MVP full-access policy (AC-2): any authenticated user passes through with no further checks. Later epics add feature-specific limits (e.g., Epic 3's FR11 concurrent-Conversation cap) as separate enforcement points, not by modifying this callback.

### Dashboard Layout Auth Guard

```typescript
// apps/web/src/app/(dashboard)/layout.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.userId) {
    redirect('/sign-in');
  }
  return <>{children}</>;
}
```

This is defense-in-depth — the middleware already protects all matched routes. The layout guard catches the case where a future page is added under `(dashboard)/` without its own auth check, or if the middleware matcher is accidentally narrowed. It follows the same pattern as `page.tsx` and `onboarding/page.tsx` (call `auth()`, check `session?.userId`, redirect if absent).

### Known Issues (Do NOT Fix in This Story)

1. **`/api/internal/test` middleware exemption** (deferred-work.md line 35): The matcher permanently exempts `/api/internal/test` from auth. The routes have a `TEST_ENV` env var guard, but accidental `TEST_ENV=true` in a non-local environment exposes data-mutation endpoints. This is a known, deferred issue — do not fix it in this story.

2. **`clearValidationCache` unauthenticated server action** (deferred-work.md line 67): `clearValidationCache` in `repository-validation.actions.ts` is a `'use server'` function that doesn't call `auth()`. The middleware protects it (POST to a matched route), but any authenticated user can invoke it to flush the global cache (DoS vector). This is a pre-existing issue — do not fix it in this story.

3. **`callbackUrl` strips query string** (deferred-work.md line 25): The `authorized` callback sets `callbackUrl` to `pathname` only, stripping query parameters. No protected pages currently use query params. Do not fix in this story.

4. **`User.active` and `lastActiveAt` never updated** (deferred-work.md line 58): These fields exist in the schema but have no writer. NFR-S3 (active termination) is deferred to post-MVP. Do not add logic to update these fields.

### Security Considerations

- **MVP access policy**: Authentication is the ONLY gate. All authenticated users have unrestricted access to all features. No paywall, trial, billing, or role-based checks exist or should be added.
- **JWT vs live DB**: The middleware uses JWT (not live DB checks). A deactivated user's JWT remains valid until expiry. This is accepted for MVP (NFR-S3 deferred). The live `user.active` check is `apps/agent-be`'s responsibility (Epic 3).
- **Server Actions**: All existing server actions (`repo-connection.actions.ts`, `repository-validation.actions.ts`, `git-identity.actions.ts`, `credential-health.actions.ts`) call `auth()` and check `session?.userId` internally. The middleware provides the first layer of protection; the server actions provide the second.

### Performance Requirements

- The `auth()` call in the layout is a JWT decode (no DB round-trip) — negligible overhead.
- The middleware runs on every matched request — already in place, no new overhead.

### Testing Requirements

- **Unit tests** (`auth.config.spec.ts` extension): edge cases for the `authorized` callback — nested paths, API paths, session-without-userId edge case.
- **Integration tests** (`middleware.spec.ts`): matcher regex composition — verify excluded paths and matched paths.
- **Layout tests** (`layout.test.tsx`): dashboard layout redirects unauthenticated users, renders children for authenticated users.
- **E2E tests** (`access-baseline.spec.ts` or extension of `sign-in.spec.ts`): authenticated user navigates available routes without encountering feature gates.
- No new E2E tests for unauthenticated access — already covered by `sign-in.spec.ts` (Story 1.2).

### Project Structure Notes

```
apps/web/src/
  middleware.ts                                      ← UNCHANGED (matcher already correct)
  middleware.spec.ts                                 ← NEW (matcher composition tests)
  lib/
    auth.config.ts                                   ← UNCHANGED (authorized callback already correct)
    auth.config.spec.ts                              ← UPDATE (add edge case tests)
    auth.ts                                          ← UNCHANGED
  app/
    (dashboard)/
      layout.tsx                                     ← UPDATE (add auth guard)
      layout.test.tsx                                ← NEW (layout auth guard tests)
      onboarding/page.tsx                            ← UNCHANGED (already has auth check)
    page.tsx                                         ← UNCHANGED (already has auth check)
    api/
      hello/route.ts                                 ← DELETE (scaffold artifact)
```

### Code Structure Requirements

- Follow existing patterns from Stories 1.2–1.6 for auth checks: call `auth()`, check `session?.userId`, `redirect('/sign-in')` if absent.
- Use `@jest-environment node` directive at the top of server-side test files.
- Mock `@/lib/auth` at the module level in tests using `jest.mock()`.
- Use `jest.clearAllMocks()` in `afterEach`.
- Co-locate tests with source files.
- Use `yarn nx` for all commands (package manager is Yarn, not pnpm).

### Dependencies

- **Story 1.2**: Must be complete — provides the middleware, `authorized` callback, `auth()` function, and sign-in page.
- **Story 1.1**: Provides the Nx monorepo structure and Prisma schema (`User.active` field).
- No dependency on Stories 1.3–1.6 (those stories added repository connection, BMAD validation, git identity, and credential health — none of which affect the access baseline).

### Integration Points

- **Consumed by all later epics**: Every page in Epics 2 and 3 inherits the `(dashboard)/layout.tsx` auth guard. Feature-specific limits (e.g., FR11 concurrent-Conversation cap in Epic 3) are added as separate enforcement points, not by modifying the auth baseline.
- **Consumed by Story 1.8** (Build the Persistent App Shell): Story 1.8 adds the side navigation, three-zone scroll, and accessibility floor to the `(dashboard)/layout.tsx` — the auth guard established here remains.
- **Not consumed by `apps/agent-be`**: The `active-user.guard.ts` and `boundary-jwt.guard.ts` in `apps/agent-be` are separate enforcement points for the agent backend (Epic 3).

## Previous Story Intelligence

**From Story 1.6 (Detect and Recover from Credential Failures):**
- Server Actions return typed result unions, not exceptions for expected failures.
- `auth()` returns `Promise<Session | null>` — always `await` it.
- `session.userId` is typed as `string | undefined` (optional) — always guard with `?.`.
- Tests mock `@/lib/auth`, `@/lib/prisma`, `@/lib/crypto` at the module level using `jest.mock()`.
- Use `jest.clearAllMocks()` in `afterEach`.
- `@jest-environment node` directive at the top of test files for server-side tests.
- 207 web tests pass as of Story 1.6 completion — this story's new tests will add to that count.

**From Story 1.2 (Sign In with GitHub):**
- The `authorized` callback in `auth.config.ts` is edge-safe (no Prisma) — it runs in the middleware (Edge Runtime).
- `auth.config.ts` is edge-safe; `auth.ts` is Node.js-only (uses Prisma).
- The middleware matcher regex is the sole determinant of which routes the `authorized` callback runs on.
- E2E tests use `browser.newContext()` for unauthenticated tests and the shared `page` fixture (with storage state) for authenticated tests.
- The `playwright/auth.setup.ts` creates a synthetic session by minting a JWT with `AUTH_SECRET` and seeding a user via `/api/internal/test/seed-user`.

**From Story 1.1 (Scaffold):**
- Package manager is **Yarn (4.17.0)**, not pnpm. Use `yarn nx` for all commands.
- Next.js version is 16 (not 15) — async props must be awaited.
- Tests co-located with source (`*.test.ts` / `*.spec.ts` next to the file under test).

**Key Learnings to Apply:**
- The `authorized` callback is already correct — do not modify it.
- The middleware matcher is already correct — do not modify it.
- Follow the existing `auth()` + `redirect('/sign-in')` pattern in the dashboard layout.
- Mock `@/lib/auth` at the module level in layout tests.

## Git Intelligence

**Recent commits relevant to this story:**
- `30e5d48 ci: minor workflow updates` — CI config
- `0c04d93 docs: readme explanation on ntfy.sh` — documentation
- `0013077 ci: add ntfy.sh extension to vscode` — CI config
- `05aaaf1 chore: add ntfy to n8n bmad flow, harden workflow` — n8n workflow
- `94b7756 feat: finalize story 1.5` — Story 1.5 complete
- `e5ab49a feat: story 1.5 done)` — Story 1.5 implementation
- `438ecf2 chore: migrate package manager from pnpm to yarn` — **CRITICAL**: package manager is now Yarn, not pnpm. Use `yarn nx` for all commands.

**Key patterns from working tree:**
- Middleware in `apps/web/src/middleware.ts` — Auth.js middleware with matcher
- Auth config in `apps/web/src/lib/auth.config.ts` — edge-safe `authorized` callback
- Auth implementation in `apps/web/src/lib/auth.ts` — Node.js config with Prisma callbacks
- Server Components call `auth()` for user context: `page.tsx`, `onboarding/page.tsx`
- E2E auth tests in `playwright/e2e/auth/sign-in.spec.ts` — unauthenticated access control + sign-in UI

## References

- **Epics Source**: `_bmad-output/planning-artifacts/epics.md` lines 379–394 — Story 1.7 ACs
- **PRD FR18**: Platform Authentication — GitHub OAuth as the only sign-up/sign-in path
- **PRD FR19**: Access Control — All platform access requires authentication; unauthenticated requests redirect to sign-in; in MVP all authenticated users have unrestricted access
- **Architecture**: `_bmad-output/planning-artifacts/architecture.md` — middleware (line 506), `authorized` callback pattern (lines 287–288), `active-user.guard.ts` for `apps/agent-be` (line 570), NFR-S3 deferred (line 274), Frontend Architecture refresh model (line 310)
- **Middleware**: `apps/web/src/middleware.ts` — Auth.js middleware + matcher
- **Auth Config**: `apps/web/src/lib/auth.config.ts` — `authorized` callback (redirect/401 logic)
- **Auth Implementation**: `apps/web/src/lib/auth.ts` — JWT strategy, GitHub OAuth, jwt/session callbacks
- **Auth Config Tests**: `apps/web/src/lib/auth.config.spec.ts` — existing `authorized` callback tests
- **E2E Auth Tests**: `playwright/e2e/auth/sign-in.spec.ts` — unauthenticated access control + sign-in UI
- **E2E Auth Setup**: `playwright/auth.setup.ts` — synthetic session via JWT minting
- **Prisma Schema**: `libs/database-schemas/src/prisma/schema.prisma` — `User.active` field (line 17, `@default(true)`)
- **Dashboard Layout**: `apps/web/src/app/(dashboard)/layout.tsx` — currently minimal, needs auth guard
- **Home Page**: `apps/web/src/app/page.tsx` — existing `auth()` + redirect pattern
- **Onboarding Page**: `apps/web/src/app/(dashboard)/onboarding/page.tsx` — existing `auth()` + redirect pattern
- **Deferred Work**: `_bmad-output/implementation-artifacts/deferred-work.md` — line 35 (middleware `/api/internal/test` exemption), line 58 (`User.active` never updated), line 67 (`clearValidationCache` unauthenticated server action)
- **Story 1.2**: `_bmad-output/implementation-artifacts/1-2-sign-in-with-github.md` — middleware, `authorized` callback, sign-in page
- **Story 1.6**: `_bmad-output/implementation-artifacts/1-6-detect-and-recover-from-credential-failures.md` — test patterns, `auth()` usage, Server Action patterns

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

No debug issues encountered. All tasks implemented cleanly following red-green-refactor.

### Completion Notes List

- **Task 1**: Added defense-in-depth auth guard to `(dashboard)/layout.tsx` — calls `auth()`, redirects to `/sign-in` if no `session?.userId`. Follows the existing pattern from `page.tsx` and `onboarding/page.tsx`. Layout test (`layout.test.tsx`) verifies: unauthenticated redirect, session-without-userId redirect, and authenticated user renders children without redirect. 3 tests added.

- **Task 2**: Extended `auth.config.spec.ts` with 3 new edge-case tests: (1) nested path `/conversations/abc-123` redirects with correct `callbackUrl`, (2) `/api/internal/test/*` returns 401 JSON at the callback level (matcher excludes it in production — documented in test name), (3) session with `user` but no `userId` returns `true` (confirms callback checks `auth?.user`, not `userId`). Created `middleware.spec.ts` with 15 matcher composition tests (8 excluded paths, 7 matched paths) verifying the regex excludes `/sign-in`, `/sign-in/`, `/api/auth/...`, `/api/internal/test/...`, `/_next/static/...`, `/_next/image/...`, `/favicon.ico` and matches everything else.

- **Task 3**: Deleted `apps/web/src/app/api/hello/route.ts` — Nx scaffold artifact with no references anywhere in the codebase. Confirmed absence via ripgrep. Build output no longer lists `/api/hello` route.

- **Task 4**: Created `playwright/e2e/auth/access-baseline.spec.ts` with 5 E2E tests verifying AC-2: authenticated users navigating to `/` and `/onboarding` encounter no paywall, billing redirect, or access-denied page. Asserts no "upgrade", "trial", "billing", or "paywall" text appears on rendered pages, and verifies the real page rendered via positive assertions (onboarding form visible).

- **Task 5**: All verifications pass — lint: 0 errors (11 pre-existing warnings), tests: 233 web + 3 agent-be + 1 database-schemas all pass, build: production build succeeds with `/api/hello` route removed.

- **Total new tests**: 18 unit/integration tests (3 layout + 3 auth.config + 15 middleware) + 5 E2E tests. Web test count went from 215 → 233.

### File List

- `apps/web/src/app/(dashboard)/layout.tsx` — MODIFIED (added auth guard: `auth()` + `redirect('/sign-in')`)
- `apps/web/src/app/(dashboard)/layout.test.tsx` — NEW (layout auth guard unit tests)
- `apps/web/src/lib/auth.config.spec.ts` — MODIFIED (added 3 edge-case tests for `authorized` callback)
- `apps/web/src/middleware.spec.ts` — NEW (matcher composition integration tests)
- `apps/web/src/app/api/hello/route.ts` — DELETED (Nx scaffold artifact cleanup)
- `playwright/e2e/auth/access-baseline.spec.ts` — NEW (E2E test for authenticated full-access baseline, AC-2)

## Change Log

- 2026-07-01: Story 1.7 implemented — defense-in-depth auth guard in dashboard layout, comprehensive middleware/auth tests, `/api/hello` scaffold artifact removed, E2E full-access baseline test added. All ACs satisfied.

### Review Findings

**Patch:**

- [x] [Review][Patch] Layout guard checks `session?.userId` instead of `session?.user` — A user without an ID is nonsense; the guard should check user existence, not userId, aligning with the middleware's `auth?.user` check. Update layout + tests. [apps/web/src/app/(dashboard)/layout.tsx:6]
- [x] [Review][Patch] E2E access-baseline tests can pass on a broken/blank/error page — 4 of 5 tests only assert negative conditions (no sign-in URL, no forbidden terms). Add positive assertions (e.g., expected content visible) to verify the real page rendered. [playwright/e2e/auth/access-baseline.spec.ts:17-48]
- [x] [Review][Patch] Matcher spec lists `/api/hello` as a matched path but route was deleted in this same diff — removed since `/api/conversations` already covers the API matched-path case. [apps/web/src/middleware.spec.ts:52]
- [x] [Review][Patch] `redirect()` mock does not throw — layout tests can't verify short-circuit semantics — In production `redirect()` throws `NEXT_REDIRECT` to halt rendering; mock now throws to verify children aren't returned on redirect path. [apps/web/src/app/(dashboard)/layout.test.tsx:9-10]
- [x] [Review][Patch] Completion notes undercount E2E tests (claims 2, actually 5) — counts updated. [_bmad-output/implementation-artifacts/1-7-enforce-authenticated-full-access-for-all-mvp-users.md:319,323]

**Deferred (pre-existing):**

- [x] [Review][Defer] `/api/internal/test/*` bypasses auth in production [apps/web/src/middleware.ts:8] — deferred, pre-existing (known issue, deferred-work.md line 35, spec says DO NOT fix)
- [x] [Review][Defer] Layout redirect omits `callbackUrl` (unlike middleware) [apps/web/src/app/(dashboard)/layout.tsx:7] — deferred, pre-existing (spec-prescribed pattern, existing pages do the same)
- [x] [Review][Defer] Matcher regex over-excludes prefix-colliding paths (e.g., `/api/authors`) [apps/web/src/middleware.ts:8] — deferred, pre-existing (matcher unchanged, spec says DO NOT modify)
- [x] [Review][Defer] `auth()` throwing in layout guard is unhandled [apps/web/src/app/(dashboard)/layout.tsx:5] — deferred, pre-existing (existing pages follow same pattern, no error boundary)
