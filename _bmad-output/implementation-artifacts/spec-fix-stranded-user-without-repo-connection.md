---
title: 'Fix stranded user without repo connection on dashboard routes'
type: 'bugfix'
created: '2026-07-02'
status: 'done'
context:
  - '{project-root}/_bmad-output/project-context.md'
baseline_commit: '64341a8906ba669397fa3baccc3f8fc840e08f61'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An authenticated user without a `RepoConnection` who directly visits `/project-map`, `/artifacts`, `/conversations/new`, or `/settings` gets a chrome-less page — the `(dashboard)/layout.tsx` renders bare `<>{children}</>` when no connection exists, with no side nav, no breadcrumb, and no path to `/onboarding`. The root `page.tsx` redirect only catches `/`.

**Approach:** Restructure the route groups: introduce a new `(dashboard)/(app)/` route group whose layout guards on `RepoConnection` (redirect to `/onboarding` if absent, render `AppShell` if present). Move all repo-connection-required pages into `(app)/`. Leave `/onboarding` under `(dashboard)/` directly — outside the `(app)/` guard — so it renders without a redirect loop.

## Boundaries & Constraints

**Always:**
- `(dashboard)/layout.tsx` remains the auth guard for the entire `(dashboard)` group (redirect to `/sign-in` if no session).
- `(app)/layout.tsx` calls `auth()` for session data and as defense-in-depth (matches codebase pattern).
- `redirect()` calls in Server Components are followed by `return null as never;` per codebase convention.
- `AppShell.tsx` is not modified — focus management, three-zone scroll, and responsive drawer behavior stay unchanged.
- Pages render an `<h1>` for AppShell route-focus management to work.

**Ask First:** None.

**Never:**
- Do not add a repo-connection redirect inside `(dashboard)/layout.tsx` — it would loop `/onboarding`.
- Do not move `/onboarding` under `(app)/` — it is the redirect destination, not a guarded page.
- Do not modify `AppShell.tsx`, `SideNavigation.tsx`, `Breadcrumb.tsx`, or `page.tsx` (root).
- Do not change any URL paths — route groups are URL-transparent.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No connection, visits guarded route | Authenticated, no `RepoConnection`, GET `/project-map` | Redirect to `/onboarding` | N/A |
| No connection, visits onboarding | Authenticated, no `RepoConnection`, GET `/onboarding` | Page renders (no redirect loop) | N/A |
| Has connection, visits onboarding | Authenticated, `RepoConnection` exists, GET `/onboarding` | Redirect to `/project-map` | N/A |
| Has connection, visits guarded route | Authenticated, `RepoConnection` exists, GET `/artifacts` | AppShell wraps page content | N/A |
| Unauthenticated, visits any dashboard route | No session, GET `/settings` | Redirect to `/sign-in` | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/(dashboard)/layout.tsx` — auth-only guard for entire dashboard group; renders bare children
- `apps/web/src/app/(dashboard)/(app)/layout.tsx` — NEW: repo-connection guard + AppShell wrapper for guarded pages
- `apps/web/src/app/(dashboard)/onboarding/page.tsx` — unchanged; redirect destination, self-guards connected users to /project-map
- `apps/web/src/app/(dashboard)/project-map/page.tsx` — moves into `(app)/`; content unchanged
- `apps/web/src/app/(dashboard)/artifacts/page.tsx` — moves into `(app)/`; content unchanged
- `apps/web/src/app/(dashboard)/conversations/new/page.tsx` — moves into `(app)/`; content unchanged
- `apps/web/src/app/(dashboard)/settings/page.tsx` — moves into `(app)/`; content unchanged
- `apps/web/src/components/shell/AppShell.tsx` — reference only; not modified
- `apps/web/src/app/page.tsx` — root redirect; not modified

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/app/(dashboard)/(app)/layout.tsx` -- create layout that calls `auth()`, redirects unauthenticated to `/sign-in`, queries `RepoConnection` by `session.userId`, redirects to `/onboarding` if absent, renders `<AppShell user={session.user}>{children}</AppShell>` if present -- centralizes the repo-connection gate so all guarded pages inherit it
- [x] `apps/web/src/app/(dashboard)/layout.tsx` -- strip to auth-only guard (remove `getPrisma`, `AppShell` imports and `RepoConnection` check); render `<>{children}</>` for authenticated users -- onboarding must pass through this layout without a connection redirect
- [x] `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` -- move from `(dashboard)/project-map/` -- route group move; URL stays `/project-map`
- [x] `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` -- move from `(dashboard)/artifacts/` -- URL stays `/artifacts`
- [x] `apps/web/src/app/(dashboard)/(app)/conversations/new/page.tsx` -- move from `(dashboard)/conversations/new/` -- URL stays `/conversations/new`
- [x] `apps/web/src/app/(dashboard)/(app)/settings/page.tsx` -- move from `(dashboard)/settings/` -- URL stays `/settings`
- [x] `apps/web/src/app/(dashboard)/(app)/layout.test.tsx` -- create unit tests: unauthenticated → /sign-in, no connection → /onboarding, connection exists → AppShell with user, queries by userId, no DB query when session missing -- locks down the new guard behavior
- [x] `apps/web/src/app/(dashboard)/layout.test.tsx` -- remove `conditional shell rendering` describe block (RepoConnection/AppShell moved to (app) layout); keep auth guard tests; add test that authenticated user with no connection renders bare children -- aligns tests with stripped layout
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark the stranded-user item (line ~105) as resolved -- closes the tracked gap
- [x] `_bmad-output/project-context.md` -- update the "Conditional app shell" rule (line ~100) to describe the `(app)/` route group guard structure -- keeps AI rules accurate for future work

**Acceptance Criteria:**
- Given an authenticated user without a repo connection, when they directly visit `/project-map` or `/artifacts`, then they are redirected to `/onboarding`
- Given an authenticated user without a repo connection, when they visit `/onboarding`, then the page renders without a redirect loop
- Given an authenticated user with a repo connection, when they visit `/onboarding`, then they are redirected to `/project-map`
- Given an authenticated user with a repo connection, when they visit any guarded dashboard route, then the AppShell renders around it
- The existing focus-management, three-zone scroll, and responsive drawer behavior in `AppShell.tsx` is unchanged

## Verification

**Commands:**
- `yarn nx test web` -- expected: all unit tests pass (layout tests updated, new (app) layout tests pass)
- `yarn nx lint web` -- expected: no lint errors
- `yarn nx typecheck web` -- expected: no type errors

## Suggested Review Order

**Route-group guard (the core change)**

- New `(app)/` layout: the repo-connection gate — no connection redirects to `/onboarding`, connection renders `AppShell`
  [`layout.tsx:24`](../../apps/web/src/app/(dashboard)/(app)/layout.tsx#L24)

- Stripped `(dashboard)/` layout: auth-only guard rendering bare children — onboarding passes through without a connection check
  [`layout.tsx:17`](../../apps/web/src/app/(dashboard)/layout.tsx#L17)

- Onboarding page self-guard: connected users redirect to `/project-map` — mutually exclusive with the `(app)/` guard, no loop
  [`page.tsx:18`](../../apps/web/src/app/(dashboard)/onboarding/page.tsx#L18)

**Tests**

- New `(app)/` layout tests: auth guard, no-connection → `/onboarding`, connection → `AppShell`, userId query, no-DB-when-no-session
  [`layout.test.tsx:64`](../../apps/web/src/app/(dashboard)/(app)/layout.test.tsx#L64)

- Updated `(dashboard)/` layout tests: stripped shell-rendering block, kept auth guard, added bare-render test
  [`layout.test.tsx:50`](../../apps/web/src/app/(dashboard)/layout.test.tsx#L50)

**Artifacts**

- Deferred-work item marked resolved with the new route-group structure
  [`deferred-work.md:105`](../../_bmad-output/implementation-artifacts/deferred-work.md#L105)

- Project-context "Conditional app shell" rule updated to describe the `(app)/` guard
  [`project-context.md:100`](../../_bmad-output/project-context.md#L100)
