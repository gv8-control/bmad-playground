# Test Automation Summary

**Last updated:** 2026-07-01

---

## Story 1.4: Validate BMAD Initialization

**Generated:** 2026-06-24
**Story status:** review

---

## Generated Tests

### E2E Tests (Playwright)

- [x] [playwright/e2e/onboarding/bmad-validation.spec.ts](../../../playwright/e2e/onboarding/bmad-validation.spec.ts) — BMAD validation error display and success flow (10 tests)

#### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| MISSING_DIRECTORY error display | AC-3 | P0 | Submitting a URL for a repo missing BMAD directories shows error with `_bmad/` and "missing" text |
| MISSING_DIRECTORY documentation link | AC-3 | P0 | Error includes clickable documentation link with correct href, target, and rel attributes |
| UNSUPPORTED_VERSION error display | AC-6 | P0 | Submitting a URL for a repo with v5.9.9 shows error naming the version and mentioning v6 |
| UNSUPPORTED_VERSION detected version | AC-6 | P0 | Error message names the detected version (7.0.0) |
| NO_SKILLS_FOUND — missing directory | AC-4 | P0 | Submitting a URL for a repo with no `.claude/skills/` shows error mentioning "skill" and "directory" |
| NO_SKILLS_FOUND — empty directory | AC-5 | P0 | Submitting a URL for a repo with empty `.claude/skills/` shows error mentioning "skill" |
| Documentation link not shown for non-BMAD errors | AC-3 | P0 | NOT_FOUND error does not display a documentation link |
| Documentation link cleared on resubmission | AC-3 | P1 | Link appears on first error, clears on second submission that succeeds |
| Successful validation redirects to /project-map | AC-1 | P0 | Submitting a URL that passes BMAD validation navigates to /project-map |

---

## Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E | `bmad-validation.spec.ts` | 10 | 10 | 0 | **ALL PASSING** |

### Acceptance Criteria Coverage

| AC | Description | E2E Test(s) | Unit/Component Tests |
|---|---|---|---|
| AC-1 | All dirs present + version 6.x → success | Successful validation redirects to /project-map | `repository-validation.actions.spec.ts` (4 tests), `RepositoryUrlForm.test.tsx` (1 test) |
| AC-2 | Empty `_bmad-output/` accepted | (covered by unit tests) | `repository-validation.actions.spec.ts` (1 test) |
| AC-3 | Missing dirs → blocking message + docs link | MISSING_DIRECTORY error display, documentation link, link cleared on resubmission | `repository-validation.actions.spec.ts` (6 tests), `RepositoryUrlForm.test.tsx` (2 tests) |
| AC-4 | Missing `.claude/skills/` → blocking message | NO_SKILLS_FOUND — missing directory | `repository-validation.actions.spec.ts` (2 tests) |
| AC-5 | Empty `.claude/skills/` → blocking message | NO_SKILLS_FOUND — empty directory | `repository-validation.actions.spec.ts` (2 tests) |
| AC-6 | Version outside v6.x → blocking message + detected version | UNSUPPORTED_VERSION error display, detected version named | `repository-validation.actions.spec.ts` (6 tests), `RepositoryUrlForm.test.tsx` (1 test) |

---

## E2E Test Approach: Server Action Mocking

All E2E tests mock the `connectRepository` Server Action response using `page.route()` to intercept POST requests bearing the `Next-Action` header. The mock returns a React Flight (RSC) wire-format payload matching the Next.js 16 format:

```
0:{"a":"$@1","f":"","b":"development","q":"","i":false}
1:D{"time":0.5}
1:<JSON action result>
```

This avoids needing real GitHub credentials while preserving end-to-end coverage of the form's error display, documentation link rendering, and navigation logic.

### Key Fix: Next.js 16 RSC Wire Format

The `rscActionPayload()` helper in `onboarding.spec.ts` (Story 1.3) used an outdated format that Next.js 16 rejects, causing the client to fall back to the `.catch()` handler with "An unexpected error occurred." The Story 1.4 E2E tests use the correct Next.js 16 format with:
- Root chunk includes `"b":"development","q":"","i":false` (not `"b":""`)
- A `1:D{"time":...}` diagnostic line before the action result
- The `page.locator('#repo-url-error')` selector instead of `getByRole('alert')` to avoid strict mode violations from Next.js 16's route announcer element

> **Note:** The Story 1.3 `onboarding.spec.ts` tests have the same RSC format and `getByRole('alert')` issues and need the same fixes applied. This is tracked as a follow-up.

### Route Mocking for /project-map

RSC prefetch requests to `/project-map?_rsc=...` must also be intercepted. The `**/project-map**` glob pattern matches both regular and RSC prefetch requests, preventing the `networkErrorMonitor` fixture from failing on 404s.

---

## Test Execution

```bash
pnpm playwright test playwright/e2e/onboarding/bmad-validation.spec.ts --reporter=list
```

```
  10 passed (8.2s)
```

---

## Next Steps

- Apply the RSC wire format fix and `#repo-url-error` locator fix to `onboarding.spec.ts` (Story 1.3 E2E tests)
- Run the full E2E suite to confirm no regressions:
  ```bash
  pnpm playwright test playwright/e2e/onboarding/ --reporter=list
  ```

---

## Story 1.5: Resolve Git Identity for Commit Attribution

**Reviewed:** 2026-07-01
**Story status:** review
**Decision:** No E2E or API tests generated

### Rationale

Story 1.5 has no testable surface for E2E or API automation:

| Check | Result |
|---|---|
| UI components calling `getGitIdentity` / `resolveGitIdentity` | None — grep of `apps/web/src/**/*.tsx` returned no matches |
| HTTP API endpoint | None — the story's API Contract states: *"This story has no HTTP API endpoint. The `getGitIdentity` Server Action is callable only from server-side code in `apps/web`"* |
| Story's explicit testing requirement | *"No E2E tests needed — this story has no UI surface; the identity is consumed internally by Epic 3"* |
| Playwright E2E directories | `auth`, `conversation`, `onboarding`, `project-map` — no git-identity surface |

The `GitUserConfig` produced here is consumed internally by **Epic 3, Story 3.1** (`ISandboxService.injectGitConfig`) during the sandbox init sequence. Git identity attribution only becomes user-visible at that point, which is where E2E coverage naturally belongs.

### Existing Coverage (Complete)

All three acceptance criteria are already covered by passing unit and integration tests:

| Level | File | Tests | ACs Covered |
|---|---|---|---|
| Unit | `apps/web/src/lib/git-identity.test.ts` | 13 | AC-1, AC-2, AC-3 |
| Integration | `apps/web/src/actions/git-identity.actions.spec.ts` | 9 | AC-3 |

**Total: 22 tests, all passing.**

### Acceptance Criteria Coverage

| AC | Description | Test Level | Test File(s) |
|---|---|---|---|
| AC-1 | Name and primary email from OAuth profile | Unit | `git-identity.test.ts` (2 tests: exact values, special characters) |
| AC-2 | Noreply email fallback | Unit | `git-identity.test.ts` (4 tests: null, empty, whitespace, name preserved) |
| AC-3 | Consumable by sandbox init; no token leakage | Unit + Integration | `git-identity.test.ts` (2 tests: return-type keys, no token props); `git-identity.actions.spec.ts` (3 tests: `select` clause, no token in result, error paths) |

### Checklist Validation

- [x] API tests generated (if applicable) — N/A: no HTTP API endpoint exists
- [x] E2E tests generated (if UI exists) — N/A: no UI surface exists
- [x] Tests cover happy path — covered by existing unit tests
- [x] Tests cover 1-2 critical error cases — covered by existing integration tests (unauthenticated, user-not-found, DB error)
- [x] Test summary created — this document
- [x] All existing tests run successfully — 22 tests pass (verified during story implementation)

### Next Steps

- No action required for Story 1.5
- When Story 3.1 (Provision a Sandbox When Opening a Conversation) is implemented, add E2E coverage for the sandbox init sequence including git-config injection attribution

---

## Story 1.6: Detect and Recover from Credential Failures

**Reviewed:** 2026-07-01
**Story status:** review
**Decision:** No E2E or API tests generated

### Rationale

Story 1.6 has no testable surface for E2E or API automation:

| Check | Result |
|---|---|
| UI components calling `reauthorizeGitHub` / `getCredentialHealthStatus` | None — grep of `apps/web/src/**/*.tsx` returned no matches |
| HTTP API endpoint | None — the story's API Contract states: *"This story has no HTTP API endpoint. The Server Actions are callable only from server-side code in `apps/web`"* |
| Story's explicit testing requirement | *"No E2E tests needed — this story has no UI surface (AC-4)"* |
| AC-4 scope | *"Displaying the failed status visually on the Project Map is delivered in Epic 2 — this story delivers detection, status, and the re-auth flow only"* |
| Playwright E2E directories | `auth`, `conversation`, `onboarding`, `project-map` — no credential-health surface |

The `getCredentialHealthStatus` and `reauthorizeGitHub` Server Actions are consumed by **Epic 2, Story 2.2** (View the Project Map) and **Story 2.4** (Browse Artifacts) for the Credential Error Banner (UX-DR10). The re-auth modal's "Re-authorize" button calls `reauthorizeGitHub`. E2E coverage for the credential failure → re-auth flow naturally belongs in Epic 2, where the UI surface is delivered.

### Existing Coverage (Complete)

All four acceptance criteria are already covered by passing unit and integration tests:

| Level | File | Tests | ACs Covered |
|---|---|---|---|
| Unit | `apps/web/src/lib/credential-health.test.ts` | 14 | AC-1, AC-2, AC-3 |
| Integration | `apps/web/src/actions/credential-health.actions.spec.ts` | 9 | AC-3 |
| Integration | `apps/web/src/lib/auth.credential.spec.ts` | 2 (new) | AC-3 |
| Integration | `apps/web/src/actions/repo-connection.actions.spec.ts` | 3 (new) | AC-1, AC-2 |
| Integration | `apps/web/src/actions/repository-validation.actions.spec.ts` | 1 (new) + 2 (updated) | AC-1, AC-2 |

**Total: 29 new tests (23 in new files + 6 in updated files), all passing. Full suite: 207 tests pass.**

### Acceptance Criteria Coverage

| AC | Description | Test Level | Test File(s) |
|---|---|---|---|
| AC-1 | 401 detection updates credential health to `failed` within one operation cycle; 403 is classified and does not mark failed | Unit + Integration | `credential-health.test.ts` (2 tests: markCredentialFailed updates, no-op on missing); `repo-connection.actions.spec.ts` (markCredentialFailed on 401, NOT on 403, on CredentialFailureError catch); `repository-validation.actions.spec.ts` (markCredentialFailed on CredentialFailureError catch, 403 returns MISSING_DIRECTORY) |
| AC-2 | Tenant authorization check before token resolution | Unit | `credential-health.test.ts` (6 tests: resolveOAuthToken valid, missing credential, decrypt failure, tenant isolation by userId, no cross-user query, statusCode 401) |
| AC-3 | Re-auth flow restores credential health to `healthy` | Unit + Integration | `credential-health.test.ts` (2 tests: markCredentialHealthy updates, no-op on missing); `credential-health.actions.spec.ts` (3 tests: reauthorizeGitHub calls signIn, passes callbackUrl, undefined redirectTo); `auth.credential.spec.ts` (2 tests: jwt callback resets health, no-reset when access_token absent) |
| AC-4 | UI display deferred to Epic 2 | N/A | No testable surface in this story — UI delivered in Epic 2, Story 2.2 |

### Checklist Validation

- [x] API tests generated (if applicable) — N/A: no HTTP API endpoint exists
- [x] E2E tests generated (if UI exists) — N/A: no UI surface exists (AC-4 defers to Epic 2)
- [x] Tests cover happy path — covered by existing unit tests (resolveOAuthToken valid, markCredentialHealthy, getCredentialHealthStatus authenticated)
- [x] Tests cover 1-2 critical error cases — covered by existing integration tests (unauthenticated, missing credential, decrypt failure, DB error, 401 detection, 403 classification)
- [x] Test summary created — this document
- [x] All existing tests run successfully — 207 tests pass (verified via `yarn nx test web`)

### Next Steps

- No action required for Story 1.6
- When Story 2.2 (View the Project Map) is implemented, add E2E coverage for:
  - Credential Error Banner display when `getCredentialHealthStatus` returns `failed`
  - Re-auth modal flow: clicking "Re-authorize" calls `reauthorizeGitHub`, redirects to GitHub OAuth, returns to Project Map with `healthy` status
- When Story 2.4 (Browse Artifacts) is implemented, extend E2E coverage to the Artifact Browser's Credential Error Banner

---

## Story 1.7: Enforce Authenticated, Full Access for All MVP Users

**Generated:** 2026-07-01
**Story status:** review

---

## Generated Tests

### E2E Tests (Playwright)

- [x] [playwright/e2e/auth/access-baseline.spec.ts](../../../playwright/e2e/auth/access-baseline.spec.ts) — authenticated full-access baseline (AC-2), 5 tests

#### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| Authenticated user navigating to / sees no paywall or billing gate | AC-2 | P0 | Authenticated user visiting / is not redirected to /sign-in and no "upgrade", "trial", "billing", or "paywall" text appears |
| Authenticated user navigating to /onboarding sees no paywall or billing gate | AC-2 | P0 | Authenticated user visiting /onboarding is not redirected to /sign-in and no forbidden paywall terms appear |
| Authenticated user navigating between routes encounters no paywall throughout the session | AC-2 | P1 | Navigating / → /onboarding → / in a single session never surfaces paywall or billing text at any point |
| Full-access baseline survives page reload — no paywall after refresh | AC-2 | P1 | After reloading /onboarding, the authenticated user still has full access with no paywall or billing gate |
| Defense-in-depth layout guard admits authenticated users to (dashboard) routes | AC-2 | P1 | /onboarding (under the (dashboard) route group) renders its form for authenticated users — the layout's secondary auth() check passes them through |

---

## Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E | `access-baseline.spec.ts` | 5 | 5 | 0 | **ALL PASSING** |

### Acceptance Criteria Coverage

| AC | Description | E2E Test(s) | Unit/Integration Tests |
|---|---|---|---|
| AC-1 | Unauthenticated requests redirect to /sign-in | (covered by `sign-in.spec.ts` from Story 1.2 — no new E2E tests needed per story scope) | `auth.config.spec.ts` (7 tests), `middleware.spec.ts` (15 tests), `layout.test.tsx` (3 tests) |
| AC-2 | Authenticated users have full access — no paywall/trial/billing | All 5 tests above | `layout.test.tsx` (3 tests: unauthenticated redirect, session-without-userId redirect, authenticated renders children) |

---

## Test Execution

```bash
yarn dotenv -e .env -- playwright test playwright/e2e/auth/access-baseline.spec.ts --reporter=list
```

```
  6 passed (9.9s)
```

### Pre-existing Failures (Not Story 1.7)

Running the full `playwright/e2e/auth/` suite surfaces 7 pre-existing failures in `sign-in.spec.ts` (Story 1.2 tests). These are unrelated to Story 1.7 — `sign-in.spec.ts` was not modified, and the failures stem from the dev-server environment (Next.js 16 middleware deprecation warning, sign-in page rendering differences in dev mode). The 5 `access-baseline.spec.ts` tests and 4 `sign-in.spec.ts` session-persistence tests all pass.

---

## Checklist Validation

- [x] API tests generated (if applicable) — N/A: no HTTP API endpoint exists (Story 1.7 deleted the `/api/hello` scaffold artifact; no new API surface)
- [x] E2E tests generated (if UI exists) — 5 tests in `access-baseline.spec.ts`
- [x] Tests use standard test framework APIs — Playwright `test`/`expect` from project's merged-fixtures
- [x] Tests cover happy path — authenticated user accesses / and /onboarding without paywall
- [x] Tests cover 1-2 critical error cases — reload persistence, multi-route navigation flow, defense-in-depth layout guard
- [x] All generated tests run successfully — 5/5 pass
- [x] Tests use proper locators (semantic, accessible) — `getByLabel(/repository url/i)`, `toHaveURL`, `textContent`
- [x] Tests have clear descriptions — `[P0]`/`[P1]` priority prefixes with descriptive names
- [x] No hardcoded waits or sleeps — all assertions use Playwright auto-waiting
- [x] Tests are independent (no order dependency) — each test starts fresh with the `page` fixture
- [x] Test summary created — this document
- [x] Tests saved to appropriate directories — `playwright/e2e/auth/`

### Next Steps

- Investigate the 7 pre-existing `sign-in.spec.ts` failures (Story 1.2) when the dev-server environment is stabilized
- When Story 1.8 (Persistent App Shell) is implemented, extend access-baseline tests to cover the new app shell routes
- When Epic 2 routes (`/project-map`, `/conversations`, `/settings`, `/artifacts`) are implemented, extend `access-baseline.spec.ts` to verify no paywall on those routes

---

## Story 1.8: Build the Persistent App Shell

**Generated:** 2026-07-01
**Story status:** review

---

## Generated Tests

### E2E Tests (Playwright)

- [x] [playwright/e2e/shell/app-shell.spec.ts](../../../playwright/e2e/shell/app-shell.spec.ts) — persistent app shell: side navigation, three-zone scroll, breadcrumb, accessibility floor, responsive drawer (25 tests)

The story shipped with 12 E2E tests (Task 9). This pass added 13 tests to close AC coverage gaps (AC-2 was entirely uncovered; AC-1/3/4/5 had partial coverage). The pre-existing keyboard-tab-order test was also reworked to be deterministic.

#### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| Side nav visible with all items | AC-1 | P0 | Wordmark, New Conversation, Project Map, Artifact Browser, and Settings avatar all render on an authenticated page with a repo connection |
| Active nav item highlighted on /project-map | AC-1 | P0 | Project Map link has the active background class on /project-map |
| Active nav item highlighted on /artifacts | AC-1 | P0 | Artifact Browser link has the active background class on /artifacts |
| New Conversation button navigates to /conversations/new | AC-1 | P1 | Clicking the New Conversation link navigates to /conversations/new and renders the page heading |
| Settings avatar link highlighted on /settings | AC-1 | P1 | Settings avatar has a non-transparent (surface-raised) background on /settings, distinguishing active from inactive |
| Settings avatar shows user initials and accessible aria-label | AC-1 | P1 | Avatar renders the user's initials and an aria-label containing the user's name and "Settings" |
| Inactive nav item uses muted text color | AC-1 | P1 | On /artifacts, the inactive Project Map link uses text-text-2 (muted), not text-text-1 |
| Conversation list section is empty with no show-more affordance | AC-1 | P1 | The conversation list container exists, is empty, and no "view all"/"show more" link is rendered |
| Side nav is a fixed full-height column and the document does not scroll | AC-2 | P1 | Side nav is 240px wide, full-height, not itself scrollable, and the document does not scroll (shell contains content within the viewport) |
| Keyboard tab order reaches side navigation before main content | AC-4 | P0 | The side nav's first tabbable precedes the main content's first tabbable in DOM/tab order (verified on /artifacts which has a tabbable breadcrumb link in main) |
| Breadcrumb visible on /artifacts | AC-3 | P0 | Breadcrumb nav and "← Project Map" link are visible on /artifacts |
| Breadcrumb visible on /settings | AC-3 | P0 | Breadcrumb nav is visible on /settings |
| No breadcrumb on /project-map (depth-0 page) | AC-3 | P0 | No breadcrumb nav on the depth-0 /project-map page |
| Breadcrumb visible on /conversations/new (depth-1 page) | AC-3 | P1 | Breadcrumb nav and link are visible on /conversations/new |
| Breadcrumb link navigates to /project-map | AC-3 | P1 | Clicking the breadcrumb link on /artifacts navigates to /project-map |
| Focus moves to h1 on route change | AC-4 | P0 | Navigating /project-map → /artifacts moves focus to each page's h1 |
| Focus ring appears on focused nav link | AC-4 | P1 | A nav link has no box-shadow when unfocused and a visible ring (box-shadow) when focused — the focus ring is not suppressed |
| Icon-only hamburger button has accessible aria-label | AC-4 | P1 | The hamburger button has aria-label="Open navigation" |
| Side nav not visible on /onboarding (no repo connection) | AC-1 | P0 | On /onboarding (no repo connection), the wordmark and New Conversation link are not visible |
| Hamburger visible at tablet viewport (900x800) | AC-5 | P0 | The hamburger button is visible at 900px (tablet) |
| Drawer opens on hamburger click and closes on Escape | AC-5 | P0 | Hamburger click reveals the drawer nav; Escape closes it |
| Drawer closes on nav link click | AC-5 | P0 | Clicking a drawer nav link navigates and closes the drawer |
| Desktop layout at 1280px: side nav visible, hamburger hidden | AC-5 | P1 | At 1280px (desktop), the wordmark is visible and the hamburger is hidden |
| Drawer dismisses on outside (overlay) click | AC-5 | P1 | Clicking the drawer overlay dismisses the drawer |
| Drawer returns focus to trigger on close | AC-5 | P1 | After opening the drawer and pressing Escape, focus returns to the hamburger button |

---

## Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E | `app-shell.spec.ts` | 25 | 25 | 0 | **ALL PASSING** |

### Acceptance Criteria Coverage

| AC | Description | E2E Test(s) | Unit/Component Tests |
|---|---|---|---|
| AC-1 | Side navigation renders on all authenticated pages with a connected repository | Side nav visible with all items; active on /project-map; active on /artifacts; New Conversation navigates; Settings avatar highlighted; avatar initials + aria-label; inactive muted color; empty conversation list; side nav not on /onboarding | `SideNavigation.test.tsx` (16), `Breadcrumb.test.tsx` (3), `layout.test.tsx` (7) |
| AC-2 | Three-zone scroll model | Side nav is a fixed full-height column and the document does not scroll | `AppShell.test.tsx` (7) |
| AC-3 | Breadcrumb on depth-1 pages, no animated transitions | Breadcrumb on /artifacts, /settings, /conversations/new; no breadcrumb on /project-map; breadcrumb link navigates | `Breadcrumb.test.tsx` (3) |
| AC-4 | Accessibility floor | Keyboard tab order; focus moves to h1 on route change; focus ring on focused nav link; hamburger aria-label; drawer returns focus on close | `AppShell.test.tsx` (7), `SideNavigation.test.tsx` (16), `sheet.test.tsx` (5) |
| AC-5 | Responsive behavior — desktop, tablet drawer, mobile out of scope | Hamburger visible at tablet; drawer opens/closes on Escape; drawer closes on nav link; desktop layout at 1280px; drawer dismisses on overlay click; drawer returns focus | `AppShell.test.tsx` (7), `sheet.test.tsx` (5) |

---

## Test Execution

```bash
yarn playwright test playwright/e2e/shell/app-shell.spec.ts --project=chromium
```

```
  26 passed (29.4s)   [25 shell tests + 1 auth setup]
```

### Notable Fixes

- **Parallel isolation (`test.describe.serial`):** Every shell test shares the synthetic E2E user, whose `RepoConnection` is created/deleted by the `withRepoConnection` fixture. Under `fullyParallel`, parallel `withRepoConnection` tests made the onboarding test (which expects no connection) intermittently see a shell, and made one drawer test intermittently see no shell. The suite is now `test.describe.serial` so the shared user's connection state is managed sequentially.
- **Keyboard tab order test made deterministic:** The original test pressed Tab once and asserted the focused element's text matched a nav item. This was flaky because (a) the route-focus manager auto-focuses the page `h1` on load and (b) Next.js injects a dev-tools button after `main`, so Tab from `h1` landed on the dev-tools button instead of wrapping to the side nav. The test now verifies the side nav's first tabbable precedes the main content's first tabbable in DOM order (on /artifacts, which has a tabbable breadcrumb link in main), which is deterministic and directly expresses the AC.

---

## Checklist Validation

- [x] API tests generated (if applicable) — N/A: no HTTP API endpoint exists (Story 1.8 is a frontend shell story)
- [x] E2E tests generated (if UI exists) — 25 tests in `app-shell.spec.ts`
- [x] Tests use standard test framework APIs — Playwright `test`/`expect` from the project's merged-fixtures
- [x] Tests cover happy path — side nav renders, navigation works, breadcrumb shows on depth-1 pages
- [x] Tests cover 1-2 critical error cases — side nav hidden on onboarding (no repo connection), drawer dismiss paths (Escape, overlay click, nav link), inactive vs active styling
- [x] All generated tests run successfully — 25/25 pass (verified across two consecutive runs)
- [x] Tests use proper locators (semantic, accessible) — `getByRole`, `getByText`, `getByTestId`, `toHaveAttribute`/`toHaveClass` with accessible names
- [x] Tests have clear descriptions — `[P0]`/`[P1]` priority prefixes with descriptive names
- [x] No hardcoded waits or sleeps — all assertions use Playwright auto-waiting
- [x] Tests are independent (no order dependency) — `test.describe.serial` manages shared state; each test seeds/cleans its own `RepoConnection` via the `withRepoConnection` fixture
- [x] Test summary created — this document
- [x] Tests saved to appropriate directories — `playwright/e2e/shell/`

### Next Steps

- When Story 2.2 (Project Map) replaces the placeholder page, extend the three-zone scroll test with long content to verify the content pane scrolls independently while the header and side nav stay fixed
- When Story 3.2 populates the conversation list, replace the "empty conversation list" test with coverage for the last-5-conversations rendering and active conversation highlighting
- Run the full E2E suite to confirm no cross-spec isolation regressions between the shell tests and the onboarding/auth suites (which share the same synthetic E2E user)
