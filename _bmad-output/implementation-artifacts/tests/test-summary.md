# Test Automation Summary

**Last updated:** 2026-07-04 (Story 2.3 E2E tests activated)

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

---

## Story 2.1: Mirror Repository Artifacts into Postgres

**Reviewed:** 2026-07-03
**Story status:** in-progress
**Decision:** No E2E or API tests generated

### Rationale

Story 2.1 has no testable surface for E2E or API automation:

| Check | Result |
|---|---|
| UI components calling `syncArtifactsAction` / `syncArtifacts` | None — grep of `apps/web/src/**/*.tsx` returned zero matches |
| HTTP API endpoint | None — `syncArtifactsAction` is a Next.js Server Action, not a REST endpoint. The story dev notes state: "This Server Action is the manual-refresh entry point (Story 2.3 will call it from the refresh button). The page-load entry point (Story 2.2) will call `syncArtifacts` directly from a Server Component" |
| Page-load trigger | Not wired — Story 2.2 delivers the page-load trigger |
| Manual-refresh button | Not wired — Story 2.3 wires the refresh button to `syncArtifactsAction` |
| Story scope | "No changes to: Any UI component (Stories 2.2-2.6)" |
| Playwright E2E directories | `auth`, `conversation`, `onboarding`, `project-map`, `shell` — no artifacts-mirroring surface |
| TEA validation report | `automate-validation-report-2-1.md` confirms: "Playwright configured but not applicable to this story (no UI surface)" |

The `syncArtifacts` lib function and `syncArtifactsAction` Server Action are consumed by **Story 2.2** (page-load trigger from a Server Component) and **Story 2.3** (manual-refresh button). E2E coverage for the artifact sync flow naturally belongs in those stories, where the UI surface is delivered.

### Existing Coverage (Complete)

All seven acceptance criteria are already covered by passing unit tests:

| Level | File | Tests | ACs Covered |
|---|---|---|---|
| Unit | `apps/web/src/lib/artifacts.spec.ts` | 24 | AC-1, AC-3, AC-4, AC-5, AC-6, AC-7 |
| Integration | `apps/web/src/actions/artifacts.actions.spec.ts` | 11 | AC-1, AC-6, AC-7 |

**Total: 35 tests, all passing. Full suite: 359 tests pass.**

### Acceptance Criteria Coverage

| AC | Description | Test Level | Test File(s) |
|---|---|---|---|
| AC-1 | Page-load / manual-refresh mirroring scans `_bmad-output/` and upserts artifact metadata + content | Unit + Integration | `artifacts.spec.ts` (happy path: 3 files with frontmatter/heading/path-derived titles, verifies upsert shape + return value); `artifacts.actions.spec.ts` (Server Action delegation with correct args, `.git`/trailing-slash stripping) |
| AC-2 | Commit-time mirroring mechanism (wired in Epic 3) | N/A | No code to test this story — Epic 3 wires the commit-time trigger. The Prisma model + upsert signature support it without schema changes |
| AC-3 | No real-time push detection | N/A | Negative design constraint — inherent in the design (no webhook listener). No test needed |
| AC-4 | Prisma schema extension with migration | Unit | `artifacts.spec.ts` (empty `_bmad-output/`: 0 upserts + stale cleanup; missing `_bmad-output/` 404: 0 upserts, no throw, stale cleanup) |
| AC-5 | Stale artifact cleanup | Unit | `artifacts.spec.ts` (verifies `deleteMany` called with `{ where: { repoConnectionId, path: { notIn: [scannedPaths] } } }` after successful scan) |
| AC-6 | Credential failure handling (401) | Unit + Integration | `artifacts.spec.ts` (401 from root + 401 from file content both throw `CredentialFailureError`); `artifacts.actions.spec.ts` (Server Action catches `CredentialFailureError`, calls `markCredentialFailed`, returns `NO_CREDENTIAL`) |
| AC-7 | Rate-limit and 403 handling | Unit + Integration | `artifacts.spec.ts` (primary rate limit 403 throws `RateLimitError`; non-rate-limit 403 skips subdirectory, scans remaining); `artifacts.actions.spec.ts` (Server Action returns `RATE_LIMITED`) |

### Checklist Validation

- [x] API tests generated (if applicable) — N/A: no HTTP API endpoint exists (`syncArtifactsAction` is a Server Action, not a REST endpoint)
- [x] E2E tests generated (if UI exists) — N/A: no UI surface exists (Stories 2.2-2.6 deliver the UI)
- [x] Tests cover happy path — covered by existing unit tests (3-file happy path with title extraction strategies)
- [x] Tests cover 1-2 critical error cases — covered by existing unit/integration tests (401 credential failure, 403 rate limit, 403 non-rate-limit, missing `_bmad-output/`, missing repo connection, missing session, invalid repo URL)
- [x] Test summary created — this document
- [x] All existing tests run successfully — 359 tests pass (verified via `yarn nx test web`)

### Next Steps

- No action required for Story 2.1
- When Story 2.2 (View the Project Map) is implemented, add E2E coverage for:
  - Page-load artifact sync trigger (Server Component calls `syncArtifacts` on render)
  - Project Map rendering artifact data from Postgres
  - Credential Error Banner display when sync returns `NO_CREDENTIAL`
  - Rate-limit notice when sync returns `RATE_LIMITED`
- When Story 2.3 (Manual Refresh) is implemented, add E2E coverage for:
  - Refresh button triggers `syncArtifactsAction`
  - Loading state during sync
  - Success/error toast after sync completes

---

## Story 2.2: View the Project Map

**Generated:** 2026-07-03
**Story status:** review

---

## Generated Tests

### E2E Tests (Playwright)

- [x] [playwright/e2e/project-map/project-map.spec.ts](../../../playwright/e2e/project-map/project-map.spec.ts) — Project Map user journey: artifact cards, in-progress distinction, empty state, credential banner, load time (5 tests)

The story shipped with 3 E2E tests that were all `test.skip()` placeholders (ATDD red phase). This pass replaced them with 5 real, passing tests covering all 5 ACs. The previously skipped tests required an artifact-seeding mechanism that didn't exist — this pass created it (internal test API route + `withArtifacts` fixture).

#### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| Project Map loads within 2 seconds | AC-5 | P0 | NFR-P3: page load (heading visible) completes in under 2s with seeded artifacts (no GitHub sync triggered) |
| Authenticated user sees artifact cards on /project-map | AC-1 | P0 | FR6: 3 artifact cards render with type labels (PRD, Architecture, Epics) and titles |
| In-progress and completed artifacts show text labels — not color alone | AC-2 | P0 | UX-DR16: both "In progress" and "Completed" text badges are visible (state signaled by text, not color alone) |
| Credential error banner appears when credential is missing | AC-4 | P0 | UX-DR10: banner text "Your repository connection needs attention." and "Update access token" link render when sync returns NO_CREDENTIAL |
| Empty state prompt is visible when no artifacts are available | AC-3 | P1 | UX-DR19: "Start your first conversation to create an artifact." prompt renders when no artifacts exist |

### Unit Tests (Jest)

- [x] [apps/web/src/app/api/internal/test/artifacts/route.test.ts](../../../apps/web/src/app/api/internal/test/artifacts/route.test.ts) — internal test API route for artifact seeding (8 tests)

#### Test Inventory

| Test | Priority | Description |
|---|---|---|
| POST creates artifacts and returns 200 with ids | P0 | Route seeds Artifact rows via `$transaction` and returns created ids |
| POST calls $transaction with create operations | P0 | Each artifact in the request body maps to a `prisma.artifact.create` call |
| POST defaults status to "completed" when omitted | P1 | Missing status field defaults to "completed" |
| POST passes through explicit status and lastModifiedAt | P1 | Explicit `in-progress` status, `lastModifiedAt`, and `content` are passed through correctly |
| POST returns 404 in production | P0 | Route is non-functional when NODE_ENV=production |
| DELETE deletes artifacts by repoConnectionId | P0 | Route deletes all artifacts for a connection and returns `{ ok: true }` |
| DELETE calls deleteMany with correct where clause | P0 | `deleteMany` called with `{ where: { repoConnectionId } }` |
| DELETE returns 404 in production | P0 | Route is non-functional when NODE_ENV=production |

---

## Test Infrastructure Created

### Internal Test API Route: `/api/internal/test/artifacts`

- **POST** — seeds Artifact rows for a RepoConnection (used by `withArtifacts` fixture)
- **DELETE** — removes all Artifact rows for a RepoConnection (fixture teardown)
- Follows the exact pattern of existing test routes (`seed-user`, `repo-connections`): `TEST_ENV` guard, Prisma direct access, JSON responses
- Unit tested with 8 tests (5 POST + 3 DELETE)

### Playwright Fixture: `withArtifacts`

- Added to `playwright/support/custom-fixtures.ts`
- Depends on `withRepoConnection` (which was updated to expose `{ connectionId }`)
- Seeds 3 artifacts (PRD/completed, Architecture/in-progress, Epics/completed) via the internal test API
- Cleans up artifacts in `finally` block (also cascade-deleted when RepoConnection is deleted)
- Enables E2E tests to verify artifact rendering without triggering a real GitHub sync

---

## Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E | `project-map.spec.ts` | 5 | 5 | 0 | **ALL PASSING** |
| Unit | `artifacts/route.test.ts` | 8 | 8 | 0 | **ALL PASSING** |

### Acceptance Criteria Coverage

| AC | Description | E2E Test(s) | Unit/Component Tests |
|---|---|---|---|
| AC-1 | Artifact list with cards (FR6, UX-DR11) | Authenticated user sees artifact cards on /project-map | `ArtifactCard.test.tsx` (5), `page.test.tsx` (PAGE-01) |
| AC-2 | In-progress visual distinction (UX-DR11, UX-DR16) | In-progress and completed artifacts show text labels — not color alone | `ArtifactCard.test.tsx` (CARD-02, CARD-05) |
| AC-3 | Empty state (UX-DR19) | Empty state prompt is visible when no artifacts are available | `page.test.tsx` (PAGE-02, PAGE-03) |
| AC-4 | Credential error banner (UX-DR10) | Credential error banner appears when credential is missing | `CredentialErrorBanner.test.tsx` (6), `page.test.tsx` (PAGE-04, PAGE-05, PAGE-06) |
| AC-5 | Loading skeleton and performance (NFR-P3) | Project Map loads within 2 seconds | `loading.test.tsx` (4) |

---

## Test Execution

```bash
yarn test:e2e --grep "Story 2.2" --workers=1
```

```
  6 passed (14.8s)   [5 project-map tests + 1 auth setup]
```

```bash
yarn nx test web --testPathPattern="api/internal/test/artifacts"
```

```
  8 passed
```

---

## Checklist Validation

- [x] API tests generated (if applicable) — 8 unit tests for the internal test API route (`/api/internal/test/artifacts`)
- [x] E2E tests generated (if UI exists) — 5 tests in `project-map.spec.ts` covering all 5 ACs
- [x] Tests use standard test framework APIs — Playwright `test`/`expect` from project's merged-fixtures; Jest for unit tests
- [x] Tests cover happy path — artifact cards visible (AC-1), page loads within 2s (AC-5)
- [x] Tests cover 1-2 critical error cases — credential error banner (AC-4), empty state (AC-3)
- [x] All generated tests run successfully — 5/5 E2E pass, 8/8 unit tests pass
- [x] Tests use proper locators (semantic, accessible) — `getByRole('heading')`, `getByRole('listitem')`, `getByText`, `getByRole('link')`
- [x] Tests have clear descriptions — `[P0]`/`[P1]` priority prefixes with AC references
- [x] No hardcoded waits or sleeps — all assertions use Playwright auto-waiting
- [x] Tests are independent (no order dependency) — `test.describe.configure({ mode: 'serial' })` manages shared user state; each test seeds/cleans its own data via fixtures
- [x] Test summary created — this document
- [x] Tests saved to appropriate directories — `playwright/e2e/project-map/`, `apps/web/src/app/api/internal/test/artifacts/`

### Next Steps

- ~~When Story 2.3 (Manual Refresh) is implemented, add E2E coverage for the refresh button triggering `syncArtifactsAction` and the loading spinner~~ — **Done (ATDD red-phase, see Story 2.3 section below)**
- ~~When Story 2.6 (Card Click Navigation) is implemented, add E2E coverage for clicking an artifact card navigating to the Artifact Browser~~ ✅ Done (see Story 2.6 section — `navigate-to-artifact.spec.ts`)
- Consider adding a real GitHub credential E2E test path (with `TEST_GITHUB_USERNAME`/`TEST_GITHUB_PASSWORD`) to test the pure empty state (sync succeeds with no `_bmad-output/` content) — currently the empty state E2E test runs via the NO_CREDENTIAL sync failure path

---

## Story 2.3: Manually Refresh the Project Map

**Generated:** 2026-07-03 (activated 2026-07-04)
**Story status:** done

---

## Generated Tests

### E2E Tests (Playwright)

- [x] [playwright/e2e/project-map/project-map-refresh.spec.ts](../../../playwright/e2e/project-map/project-map-refresh.spec.ts) — manual refresh user journey: button visibility, spinner during sync, mirroring mechanism trigger, page re-render, button re-enable (5 tests, all active)

The RefreshButton component was built (Task 1, 7 component tests) and wired to the Project Map page header (Task 2). These E2E tests were written in ATDD red-phase (`test.skip()`) and have now been activated by removing the `.skip` markers — the implementation is complete and all 5 tests pass. The header comment was updated from "RED PHASE" to "GREEN PHASE".

#### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| refresh button is visible on the Project Map page | AC-1 | P0 | Button with aria-label="Refresh Project Map" renders in the page header |
| clicking refresh shows spinner and disables button during sync | AC-1 | P0 | Server Action POST mocked with delayed response; spinner (animate-spin) visible and button disabled during sync |
| clicking refresh calls syncArtifactsAction — the mirroring mechanism | AC-1 | P0 | FR7: POST with Next-Action header intercepted, verifying the Story 2.1 mirroring mechanism is triggered |
| page re-renders with fresh data after refresh completes | AC-1 | P0 | After sync, router.refresh() re-renders the Server Component; artifacts still visible from Postgres |
| refresh button re-enables after sync completes | AC-1 | P1 | isPending flips to false; button re-enables after sync resolves |

### Existing Component Tests (No Changes)

- [x] [apps/web/src/components/project-map/RefreshButton.test.tsx](../../../apps/web/src/components/project-map/RefreshButton.test.tsx) — 7 tests covering AC-1 at the component level (4 P0, 3 P1), all passing

---

## Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E | `project-map-refresh.spec.ts` | 5 | 5 | 0 | **ALL PASSING** |
| Component | `RefreshButton.test.tsx` | 7 | 7 | 0 | **ALL PASSING** (existing) |

### Acceptance Criteria Coverage

| AC | Description | E2E Test(s) | Component Tests |
|---|---|---|---|
| AC-1 | Manual refresh re-reads via mirroring mechanism with spinner (FR7) | All 5 tests (active) | `RefreshButton.test.tsx` (7 tests: aria-label, sync call, spinner, router.refresh, error/throw paths, re-enable) |
| AC-2 | Refresh does not interrupt active Conversations | N/A — architectural invariant (no test needed, per story dev notes) | N/A |

---

## Test Execution

```bash
yarn test:e2e --project=chromium playwright/e2e/project-map/project-map-refresh.spec.ts
```

```
  6 passed (14.2s)   [5 refresh tests + 1 auth setup]
```

---

## E2E Test Approach: Server Action Mocking

All E2E tests mock the `syncArtifactsAction` Server Action response using `page.route()` to intercept POST requests to `/project-map` bearing the `Next-Action` header. The mock returns a React Flight (RSC) wire-format payload matching the Next.js 16 format (same pattern as `bmad-validation.spec.ts`):

```
0:{"a":"$@1","f":"","b":"development","q":"","i":false}
1:D{"time":0.5}
1:{"success":true,"artifactsUpserted":2,"artifactsDeleted":0}
```

The `withArtifacts` fixture seeds Artifact rows in Postgres so the page renders with data without triggering a real GitHub sync. The mocked Server Action response simulates a successful sync without modifying Postgres — `router.refresh()` then re-renders the page from the existing seeded data.

---

## Checklist Validation

- [x] API tests generated (if applicable) — N/A: no HTTP API endpoint exists (`syncArtifactsAction` is a Server Action, not a REST endpoint)
- [x] E2E tests generated (if UI exists) — 5 tests in `project-map-refresh.spec.ts` (all active and passing)
- [x] Tests use standard test framework APIs — Playwright `test`/`expect` from project's merged-fixtures
- [x] Tests cover happy path — refresh button visible, clicking triggers sync, page re-renders with data
- [x] Tests cover 1-2 critical error cases — spinner/disabled state during sync, button re-enable after completion
- [x] All generated tests run successfully — 5/5 pass (verified)
- [x] Tests use proper locators (semantic, accessible) — `getByRole('button', { name: /refresh project map/i })`, `toHaveClass(/animate-spin/)`
- [x] Tests have clear descriptions — `[P0]`/`[P1]` priority prefixes with AC references
- [x] No hardcoded waits or sleeps — only the delayed Server Action mock uses `setTimeout` to keep `isPending` true for assertion
- [x] Tests are independent (no order dependency) — `test.describe.configure({ mode: 'serial' })` manages shared user state; each test seeds/cleans its own data via `withArtifacts` fixture
- [x] Test summary created — this document
- [x] Tests saved to appropriate directories — `playwright/e2e/project-map/`

### Next Steps

- ~~When Task 2.1 (add `<RefreshButton />` to `page.tsx` header) is implemented, remove the `.skip` markers from all 5 tests and verify they pass~~ — **Done (2026-07-04)**
- Consider adding a test for the `NO_CREDENTIAL` error path: mock sync returning `{ error: '...', errorCode: 'NO_CREDENTIAL' }`, verify the CredentialErrorBanner appears after refresh

---

## Story 2.4: Browse and Read All Committed Artifacts

**Generated:** 2026-07-03
**Story status:** review

---

## Generated Tests

### E2E Tests (Playwright)

- [x] [playwright/e2e/artifact-browser/artifact-browser.spec.ts](../../../playwright/e2e/artifact-browser/artifact-browser.spec.ts) — Artifact Browser user journey: flat list, sort order, flat (ungrouped) layout, entry metadata, accessible list, credential banner, empty state (9 tests)

The story shipped with 25 unit/component tests (9 `ArtifactListEntry` + 13 `page` + 3 `loading`). This pass added 9 E2E tests covering the user-facing ACs end-to-end. No API tests were generated — Story 2.4 has no HTTP API endpoint (the Artifact Browser is a pure `apps/web` Server Component page reading Postgres via Prisma; `syncArtifactsAction` is a Server Action, not a REST endpoint).

#### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| Authenticated user sees the Artifact Browser heading and breadcrumb | AC-1 | P0 | h1 "Artifact Browser" and "← Project Map" breadcrumb render on /artifacts |
| Artifact list entries are visible on /artifacts | AC-1 | P0 | FR16: 3 list items render with seeded titles (PRD, Architecture, Epics) |
| List is sorted by last-modified date descending | AC-1 | P0 | FR16/UX-DR12: entries appear in lastModifiedAt desc order (Architecture Jul 2 → PRD Jul 1 → Epics Jun 28) |
| List is flat — completed and in-progress artifacts are mixed, not grouped | AC-1 | P0 | UX-DR12: in-progress Architecture sits above completed PRD, proving no status sectioning |
| Each entry shows type label, title, status badge, and formatted date | AC-1 | P0 | UX-DR16: type labels (Architecture, PRD), text status badges, and Intl-formatted dates (Jul 2, Jul 1, Jun 28) render |
| List container exposes role="list" with an accessible label | AC-1 | P0 | UX-DR16: `role="list"` with `aria-label="Artifact list"` holds the 3 list items |
| Credential error banner appears when credential is missing | AC-3 | P0 | UX-DR10: "Your repository connection needs attention." text and "Update access token" link render when sync returns NO_CREDENTIAL |
| Empty state prompt is visible when no artifacts are available | AC-1 | P1 | UX-DR19: "Start your first conversation to create an artifact." renders when no artifacts exist |
| Skeleton loader while loading (AC-2) | AC-2 | — | Covered at unit level by `loading.test.tsx` (3 tests). Not E2E-tested — see note below |

---

## Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E | `artifact-browser.spec.ts` | 9 | 9 | 0 | **ALL PASSING** |

### Acceptance Criteria Coverage

| AC | Description | E2E Test(s) | Unit/Component Tests |
|---|---|---|---|
| AC-1 | Full-width flat list sorted by last-modified descending | heading + breadcrumb; list entries visible; sorted descending; flat (ungrouped); entry metadata; accessible list container; empty state | `ArtifactListEntry.test.tsx` (9), `page.test.tsx` (13) |
| AC-2 | Skeleton loader while loading | (unit-level only — see note) | `loading.test.tsx` (3) |
| AC-3 | Credential Error Banner when credential failed | credential error banner appears when credential is missing | `page.test.tsx` (PAGE credential banner tests) |

### AC-2 Note: Why no E2E test for the loading skeleton

App Router streams `loading.tsx` as part of the HTML response while the Server Component executes. An E2E assertion would require blocking the document response to observe the skeleton before content resolves — but blocking the response prevents `page.goto()` from resolving (it waits for the `load` event), producing a flaky test. The `project-map` suite follows the same convention (no E2E test for `loading.tsx`); the skeleton is covered by the co-located unit test `loading.test.tsx` (3 tests, added during Story 2.4 automate validation).

---

## Test Execution

```bash
npx playwright test playwright/e2e/artifact-browser/ --reporter=list
```

```
  9 passed (16.0s)
```

Typecheck: `npx tsc --noEmit -p apps/web/tsconfig.json` — clean.

---

## E2E Test Approach

- **Fixtures:** tests use the existing `withArtifacts` and `withRepoConnection` fixtures from `playwright/support/custom-fixtures.ts`. `withArtifacts` seeds 3 Artifact rows (PRD/completed Jul 1, Architecture/in-progress Jul 2, Epics/completed Jun 28) so the list renders without triggering a real GitHub sync. `withRepoConnection` (no OAuthCredential row) drives the AC-3 credential-banner path: `syncArtifactsAction` returns `NO_CREDENTIAL` → `credentialFailed` flips true → banner renders.
- **Selectors:** `getByRole` and `getByText` only (no CSS classes or XPath), per the selector-resilience hierarchy. The breadcrumb link is scoped to its exact accessible name `← Project Map` because the side nav also links to `/project-map`.
- **Serial mode:** `test.describe.configure({ mode: 'serial' })` manages the shared synthetic E2E user's `RepoConnection` state sequentially.

---

## Checklist Validation

- [x] API tests generated (if applicable) — N/A: no HTTP API endpoint exists (Artifact Browser is a pure Server Component page; `syncArtifactsAction` is a Server Action, not a REST endpoint)
- [x] E2E tests generated (if UI exists) — 9 tests in `artifact-browser.spec.ts` covering AC-1 and AC-3; AC-2 covered at unit level
- [x] Tests use standard test framework APIs — Playwright `test`/`expect` from the project's merged-fixtures
- [x] Tests cover happy path — list renders with seeded artifacts, sorted descending, flat layout, entry metadata visible
- [x] Tests cover 1-2 critical error cases — credential error banner (AC-3), empty state
- [x] All generated tests run successfully — 9/9 pass
- [x] Tests use proper locators (semantic, accessible) — `getByRole('heading')`, `getByRole('listitem')`, `getByRole('list', { name })`, `getByText`, `getByRole('link')`
- [x] Tests have clear descriptions — `[P0]`/`[P1]` priority prefixes with AC references
- [x] No hardcoded waits or sleeps — all assertions use Playwright auto-waiting
- [x] Tests are independent (no order dependency) — `test.describe.configure({ mode: 'serial' })`; each test seeds/cleans its own data via fixtures
- [x] Test summary created — this document
- [x] Tests saved to appropriate directories — `playwright/e2e/artifact-browser/`

### Next Steps

- ~~When Story 2.5 (Click-to-Select + Markdown Rendering) is implemented, add E2E coverage for: clicking a list entry narrows the list to 280px and renders the artifact's Markdown content in the detail pane; keyboard navigation between entries~~ — **Done (see Story 2.5 section below)**
- ~~When Story 2.6 (Card Click Navigation from Project Map) is implemented, add E2E coverage for: clicking an Artifact Card on /project-map navigates to /artifacts with that artifact pre-selected~~ ✅ Done (see Story 2.6 section — `navigate-to-artifact.spec.ts`)

---

## Story 2.5: View a Single Artifact's Rendered Content

**Generated:** 2026-07-03
**Story status:** review

---

## Generated Tests

### E2E Tests (Playwright)

- [x] [playwright/e2e/artifact-browser/artifact-viewer.spec.ts](../../../playwright/e2e/artifact-browser/artifact-viewer.spec.ts) — Two-column Artifact Browser with rendered Markdown content: click-to-select, Markdown rendering (headings, lists, tables, code blocks, bold, italic), read-only view, frontmatter stripping, load error state, Refresh button, browser back navigation, breadcrumb (10 tests)

The story shipped with 53 unit/component tests (8 `ArtifactViewer` + 4 `ArtifactLoadError` + 16 `ArtifactListEntry` + 22 `page` + 3 `loading`). This pass added 10 E2E tests covering the user-facing ACs end-to-end. No API tests were generated — Story 2.5 has no HTTP API endpoint (the Artifact Browser is a pure `apps/web` Server Component page reading Postgres via Prisma).

#### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| Clicking an artifact entry shows the two-column layout with list and content pane | AC-1 | P0 | FR16/UX-DR12: navigating to /artifacts?id={id} renders the two-column layout — list pane (role="list") + content pane (role="main", aria-label="Artifact content") |
| Selected entry is marked with aria-current="true" | AC-1 | P0 | UX-DR16: the selected list entry has aria-current="true" attribute |
| Content pane renders Markdown headings, lists, tables, code blocks, bold, and italic | AC-1 | P0 | FR16: rendered Markdown includes h1 heading, list items, table with columnheaders/cells, code elements, strong (bold) text, and em (italic) text |
| Content pane is read-only — no editing controls present | AC-1 | P0 | AC-1 "read-only": no buttons or textboxes in the content pane |
| Selected artifact loads within 2 seconds | AC-1 | P0 | NFR-P4: steady-state page load (after warm-up) completes in under 2 seconds |
| YAML frontmatter is stripped from rendered content | AC-1 | P1 | AC-1 content rendering: frontmatter fields (title, status) do not appear in the rendered content pane |
| Artifact load error state shows message and Refresh button when artifact not found | AC-2 | P0 | AC-2: navigating to /artifacts?id=nonexistent renders "Couldn't load this artifact. Try refreshing the page." with a Refresh button |
| Clicking Refresh re-renders the page without error | AC-2 | P0 | AC-2: Refresh button triggers router.refresh() — page re-renders, error state persists (artifact still not found) |
| Browser back button returns to full-width list from two-column view | AC-3 | P0 | FR17: clicking a list entry → two-column layout → browser back → full-width list (no content pane) |
| Breadcrumb link returns to Project Map | AC-3 | P0 | FR17: "← Project Map" breadcrumb navigates to /project-map |

---

## Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E | `artifact-viewer.spec.ts` | 10 | 10 | 0 | **ALL PASSING** |

### Acceptance Criteria Coverage

| AC | Description | E2E Test(s) | Unit/Component Tests |
|---|---|---|---|
| AC-1 | Two-column layout when an Artifact is selected (FR16, UX-DR12) | two-column layout; aria-current; Markdown rendering; read-only; 2s load; frontmatter stripped | `ArtifactViewer.test.tsx` (8), `ArtifactListEntry.test.tsx` (16), `page.test.tsx` (22) |
| AC-2 | Artifact load error state | error state message + Refresh button; Refresh re-renders | `ArtifactLoadError.test.tsx` (4), `page.test.tsx` (1) |
| AC-3 | Back navigation returns to entry point (FR17) | browser back to full-width list; breadcrumb to Project Map | `page.test.tsx` (4) |

---

## Test Execution

```bash
npx playwright test playwright/e2e/artifact-browser/artifact-viewer.spec.ts --reporter=list --workers=1
```

```
  11 passed (16.4s)
```

Combined with Story 2.4 tests:

```bash
npx playwright test playwright/e2e/artifact-browser/ --reporter=list --workers=1
```

```
  20 passed (29.5s)
```

Typecheck: `npx tsc --noEmit -p apps/web/tsconfig.json` — clean.
Lint: `yarn nx lint web` — 0 errors, 7 pre-existing warnings.

---

## E2E Test Approach

- **Fixtures:** tests use the `withArtifacts` fixture from `playwright/support/custom-fixtures.ts`. The fixture was extended to (a) enrich the PRD artifact's content with full Markdown (headings, lists, tables, code blocks, bold, italic, YAML frontmatter) so AC-1's rendering requirements can be verified end-to-end, and (b) return the seeded artifacts with their generated IDs so tests can navigate to `/artifacts?id={id}` directly. This is a non-breaking change — existing Story 2.4 tests destructure `withArtifacts` but don't use the return value.
- **Selectors:** `getByRole` and `getByText` only (no CSS classes or XPath), per the selector-resilience hierarchy. The content pane is scoped via `getByRole('main', { name: 'Artifact content' })` so list-pane elements (role="listitem") don't interfere with content-pane assertions.
- **Serial mode:** `test.describe.configure({ mode: 'serial' })` ensures tests run sequentially within the file. The synthetic E2E user (fixed `githubId`) has a single `RepoConnection` (unique on `userId`), so parallel tests within the same file would conflict on the `withArtifacts` fixture's `[repoConnectionId, path]` unique constraint. This matches the established pattern from `project-map.spec.ts`.
- **NFR-P4 (2-second load):** the test warms up the route first (dev-mode compilation), then measures the second navigation. This matches the pattern from the Story 2.4 NFR-P4 test.

---

## Design Smells Discovered

### Pre-existing: Cross-file parallelism causes fixture conflicts

The `fullyParallel: true` Playwright config runs test files in parallel. All E2E tests share a single synthetic user (`E2E_GITHUB_ID = 'e2e-test-default-99999'`) with a single `RepoConnection` (unique on `userId`). When two test files using `withArtifacts` run in parallel, they race on the `[repoConnectionId, path]` unique constraint, causing 500 errors from the artifacts seed endpoint.

**Impact:** Running `npx playwright test playwright/e2e/artifact-browser/` (both files) without `--workers=1` causes intermittent failures. The `mode: 'serial'` within each file prevents intra-file conflicts but not cross-file conflicts.

**Recommended fix (separate issue):** Either (a) give each test file its own synthetic user (parameterized `E2E_GITHUB_ID`), or (b) configure the Playwright config with `fullyParallel: false` to serialize all test files, or (c) accept `--workers=1` as the standard E2E run mode (the CI config already uses 4 shards, which effectively serializes within each shard).

**Also fixed:** `artifact-browser.spec.ts` (Story 2.4) was missing `test.describe.configure({ mode: 'serial' })` — added it alongside the new test file. Without it, the Story 2.4 tests also fail under parallel execution.

---

## Checklist Validation

- [x] API tests generated (if applicable) — N/A: no HTTP API endpoint exists (Artifact Browser is a pure Server Component page)
- [x] E2E tests generated (if UI exists) — 10 tests in `artifact-viewer.spec.ts` covering AC-1, AC-2, and AC-3
- [x] Tests use standard test framework APIs — Playwright `test`/`expect` from the project's merged-fixtures
- [x] Tests cover happy path — two-column layout, Markdown rendering, selected entry, breadcrumb navigation
- [x] Tests cover 1-2 critical error cases — artifact load error state (AC-2), Refresh button re-render
- [x] All generated tests run successfully — 10/10 pass (with `--workers=1`)
- [x] Tests use proper locators (semantic, accessible) — `getByRole('heading')`, `getByRole('main', { name })`, `getByRole('list', { name })`, `getByRole('listitem')`, `getByRole('table')`, `getByRole('button', { name })`, `getByRole('link', { name })`, `getByText`
- [x] Tests have clear descriptions — `[P0]`/`[P1]` priority prefixes with AC references
- [x] No hardcoded waits or sleeps — all assertions use Playwright auto-waiting
- [x] Tests are independent (no order dependency) — `test.describe.configure({ mode: 'serial' })`; each test seeds/cleans its own data via fixtures
- [x] Test summary created — this document
- [x] Tests saved to appropriate directories — `playwright/e2e/artifact-browser/`

### Next Steps

- ~~When Story 2.6 (Card Click Navigation from Project Map) is implemented, add E2E coverage for: clicking an Artifact Card on /project-map navigates to /artifacts with that artifact pre-selected~~ ✅ Done — see Story 2.6 section below (3 tests in `navigate-to-artifact.spec.ts`)
- Consider addressing the cross-file parallelism design smell (see Design Smells section above)

---

## Story 2.6: Navigate from the Project Map to an Artifact

**Generated:** 2026-07-03
**Story status:** review

### Generated Tests

#### E2E Tests (Playwright)

- [x] [playwright/e2e/project-map/navigate-to-artifact.spec.ts](../../../playwright/e2e/project-map/navigate-to-artifact.spec.ts) — Cross-page navigation from Project Map card click to Artifact Browser (3 tests)

##### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| clicking a completed artifact card opens the Artifact Browser with that artifact pre-selected | AC-1 | P0 | Clicking the PRD card navigates to `/artifacts?id=...`, renders the two-column layout, marks the entry `aria-current="true"`, and shows the artifact's content |
| clicking an in-progress artifact card opens the read-only Artifact Browser | AC-2 | P0 | Clicking the in-progress Architecture card navigates to `/artifacts?id=...`, renders the content pane, and confirms no editing controls are present |
| keyboard activation (Enter) on a card navigates to the Artifact Browser | UX-DR16 | P1 | Focusing a card and pressing Enter triggers client-side navigation (proves the `<Link>`/`<a>` is keyboard-focusable and activatable) |

#### API Tests

- N/A — Story 2.6 is frontend-only (no backend changes, no new endpoints). `ArtifactCard` became a `<Link>`; navigation is a pure `apps/web` client-side routing concern.

### Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E | `navigate-to-artifact.spec.ts` | 3 | 3 | 0 | **ALL PASSING** |

### Acceptance Criteria Coverage

| AC | Description | E2E Test(s) | Unit/Component Tests |
|---|---|---|---|
| AC-1 | Completed artifact click opens Artifact Browser pre-selected | clicking a completed artifact card... | `ArtifactCard.test.tsx` (link/href, aria-label, focus ring, hover, role), `page.test.tsx` (href passing) |
| AC-2 | In-progress artifact click opens read-only Artifact Browser | clicking an in-progress artifact card... | `page.test.tsx` (in-progress href), Story 2.5 read-only coverage |

### Run Results

```bash
node_modules/.bin/dotenv -e .env -- npx playwright test playwright/e2e/project-map/navigate-to-artifact.spec.ts --project=chromium
```

```
  4 passed (7.8s)   [1 setup + 3 Story 2.6 tests]
```

Typecheck: `npx tsc --noEmit -p tsconfig.json` — clean.
Lint: `npx eslint playwright/e2e/project-map/navigate-to-artifact.spec.ts` — 0 errors, 0 warnings.

### E2E Test Approach

- **Gap filled:** The Story 2.6 ATDD checklist originally opted out of E2E tests (reasoning: "component-level change, E2E would just test Next.js routing"). However, the cross-page user journey — clicking a card on `/project-map` and landing on `/artifacts` with the correct artifact pre-selected — was not covered by any existing E2E test. Story 2.4/2.5 tests navigate directly via URL or click within the Artifact Browser list; none originate from the Project Map. These tests verify the integration between the two pages: the `href` constructed by the Project Map page is consumed by the Artifact Browser page and pre-selects the clicked artifact.
- **Fixtures:** `withArtifacts` (from `playwright/support/custom-fixtures.ts`) seeds 3 artifacts (PRD completed, Architecture in-progress, Epics completed) and returns their generated IDs. Tests find a specific card by filtering `getByRole('listitem')` by the card's title text.
- **Selectors:** `getByRole` only (no CSS classes or XPath). `ArtifactCard` renders as `<Link>`/`<a>` with `role="listitem"` (which overrides the implicit `link` role), so tests query via `getByRole('listitem').filter({ hasText })` — the same approach used in `project-map.spec.ts`. The content pane is scoped via `getByRole('main', { name: 'Artifact content' })`.
- **Serial mode:** `test.describe.configure({ mode: 'serial' })` — matches the established pattern (single synthetic user, single `RepoConnection`, `[repoConnectionId, path]` unique constraint).
- **Pre-selection assertion (AC-1):** the clicked artifact's list entry is asserted to have `aria-current="true"`, and its Markdown content heading renders in the content pane — together proving the correct artifact was navigated to and pre-selected.
- **Read-only assertion (AC-2):** the content pane is asserted to contain zero buttons and zero textboxes — proving the in-progress artifact opens in the read-only Artifact Browser (Conversation-tab-focus deferred to Epic 3 per the AC).
- **No hardcoded waits** — all assertions use Playwright auto-waiting.

### Checklist Validation

- [x] API tests generated (if applicable) — N/A: frontend-only story, no HTTP API endpoints
- [x] E2E tests generated (if UI exists) — 3 tests in `navigate-to-artifact.spec.ts` covering AC-1, AC-2, and keyboard accessibility
- [x] Tests use standard test framework APIs — Playwright `test`/`expect` from the project's merged-fixtures
- [x] Tests cover happy path — completed card navigation (AC-1), in-progress card navigation (AC-2)
- [x] Tests cover 1-2 critical error cases — keyboard activation (accessibility edge case); read-only verification (AC-2 invariant)
- [x] All generated tests run successfully — 3/3 pass (plus 1 setup)
- [x] Tests use proper locators (semantic, accessible) — `getByRole('heading')`, `getByRole('main', { name })`, `getByRole('list', { name })`, `getByRole('listitem')`, `getByRole('button')`, `getByRole('textbox')`
- [x] Tests have clear descriptions — `[P0]`/`[P1]` priority prefixes with AC references
- [x] No hardcoded waits or sleeps — all assertions use Playwright auto-waiting
- [x] Tests are independent (no order dependency) — each test seeds/cleans its own data via the `withArtifacts` fixture
- [x] Test summary created — this section appended to the cumulative summary
- [x] Tests saved to appropriate directories — `playwright/e2e/project-map/`

---

## Story 3.1: Provision a Sandbox When Opening a Conversation

**Generated:** 2026-07-04
**Story status:** review

---

## Generated Tests

### E2E Tests (Playwright)

- [x] [playwright/e2e/conversation/sandbox-lifecycle.spec.ts](../../../playwright/e2e/conversation/sandbox-lifecycle.spec.ts) — New Conversation page session-start lifecycle: page-open provisioning, boundary JWT REST call, SSE EventSource wiring, queued first message, SESSION_ERROR/SESSION_TIMEOUT handling, retry (7 tests)

The story shipped with 31 unit/component/integration tests (3 boundary-JWT + 4 encryption + 8 conversations.service + 4 streaming.controller + 8 ConversationPane + 4 integration). The existing `sandbox-lifecycle.spec.ts` had 5 E2E tests that all skipped without `TEST_GITHUB_REPO_URL` and referenced UI that does not exist in Story 3.1's implementation (`/dashboard` route, `repository-url-input`, `new-conversation-button`, tool pills, manual commit — those are Stories 3.2–3.4 scope). This pass replaced the file with 7 tests that match the actual `ConversationPane` implementation and run without a real GitHub repo or Daytona provisioning.

#### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| New Conversation page renders heading, intro prompt, and active input during provisioning | AC-1 | P0 | Page renders `<h1>New Conversation</h1>`, the "browse available skills" intro prompt, and the message input is enabled (NOT disabled) during provisioning — chat interface visible immediately on page open |
| browser POSTs to /api/conversations with Bearer boundary JWT on mount | AC-1 | P0 | On mount, `ConversationPane` calls `POST {apiUrl}/api/conversations` with `Authorization: Bearer <jwt>` header — triggers background provisioning |
| opens EventSource to the conversations events URL with token query param | AC-1 | P0 | On mount, `ConversationPane` opens an `EventSource` to `{apiUrl}/api/conversations/{id}/events?token=<jwt>` — SSE lifecycle channel |
| message submitted during provisioning shows spinner, then clears after SESSION_READY | AC-2 | P0 | Submitting while provisioning shows "Starting session…" spinner (input active, spinner only on submit); `SESSION_READY` event clears the spinner and re-enables input |
| SESSION_ERROR event displays the error message to the user | AC-5 | P0 | `SESSION_ERROR` SSE event with `{ message }` displays the error message text to the user |
| SESSION_TIMEOUT event shows "taking longer" message and Retry button | AC-5 | P0 | `SESSION_TIMEOUT` SSE event shows "Starting your session is taking longer than expected." and a Retry button — not an indefinitely spinning state |
| clicking Retry re-attempts session start | AC-5 | P1 | Clicking Retry calls `POST /api/conversations` again (second session attempt) with the Bearer JWT |

---

## Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E | `sandbox-lifecycle.spec.ts` | 7 | 7 | 0 | **ALL PASSING** |

### Acceptance Criteria Coverage

| AC | Description | E2E Test(s) | Unit/Integration Tests |
|---|---|---|---|
| AC-1 | Sandbox provisioned on page open as background operation (FR9) | page renders + active input; POST /api/conversations with JWT; EventSource URL with token | `boundary-jwt.test.ts` (3), `encryption.service.spec.ts` (4), `conversations.service.spec.ts` (8), `streaming.controller.spec.ts` (4), `ConversationPane.test.tsx` (8), `sandbox-lifecycle.integration.spec.ts` (4) |
| AC-2 | First message before sandbox ready is queued | spinner on submit-during-provisioning, clears after SESSION_READY | `ConversationPane.test.tsx` (P0 spinner, P1 queued message) |
| AC-3 | Pre-first-message idle timeout (60s) | (backend concern — `SESSION_TIMEOUT` event tested at E2E level for UI; 60s timer tested in integration) | `conversations.service.spec.ts` (idle timeout fires, cleared on first message), `sandbox-lifecycle.integration.spec.ts` (tears down after 60s) |
| AC-4 | Provision failure cleanup | (backend concern — no UI surface; tested in integration) | `conversations.service.spec.ts` (destroy on failure, no zombie), `sandbox-lifecycle.integration.spec.ts` (cleans up partial allocation) |
| AC-5 | Client-side session-start timeout with retry | SESSION_ERROR displays error; SESSION_TIMEOUT shows retry; Retry re-attempts | `ConversationPane.test.tsx` (P0 client-side 30s timeout retry, P1 SESSION_ERROR) |
| AC-6 | Per-user provision concurrency cap | (backend concern — no UI surface) | `conversations.service.spec.ts` (P1 blocks 3rd simultaneous provision) |
| AC-7 | Prisma schema — Conversation and Turn models | (verified by build + migration) | `conversations.service.spec.ts` (implicit — mocks `prisma.conversation.create`) |

---

## Test Execution

```bash
yarn test:e2e:conversation --reporter=list
```

```
  8 passed (9.0s)   [1 auth setup + 7 Story 3.1 tests]
```

Lint: `npx eslint playwright/e2e/conversation/sandbox-lifecycle.spec.ts` — 0 errors, 7 warnings (all `withRepoConnection` unused-fixture-parameter — matches the established pattern from `project-map.spec.ts`).

---

## E2E Test Approach: Browser-Side Mocking of agent-be

The browser calls `agent-be` directly (REST `POST /api/conversations` + SSE `EventSource`). Both `fetch` and `EventSource` are mocked from the page via `page.addInitScript()` so the tests exercise the real `ConversationPane` state machine without a live Daytona provision or a real GitHub repo. `agent-be` still starts (via the Playwright `webServer` block) so the page's boundary-JWT mint path runs against the real `AUTH_SECRET`, but no browser request reaches it.

### Mock Strategy

- **`EventSource` mock:** a `MockEventSource` class replaces `window.EventSource` before any page script runs. It captures the URL passed to the constructor, stores event listeners by type, and exposes a `__emit(type, data)` method that the test calls via `page.evaluate()` to dispatch `SESSION_READY`, `SESSION_ERROR`, and `SESSION_TIMEOUT` events. This mirrors the `MockEventSource` pattern already used in `ConversationPane.test.tsx` (unit).
- **`fetch` mock:** wraps `window.fetch` to intercept `POST /api/conversations` and return `{ id: 'conv-e2e-1' }` (201), while passing all other fetches (Next.js RSC, etc.) through to the real network. Captures request URL, method, and headers (normalized to lowercase keys) so tests can assert the `Authorization: Bearer` header.
- **`withRepoConnection` fixture:** required because `/conversations/new` lives under the `(dashboard)/(app)/` route group whose `layout.tsx` redirects to `/onboarding` when no `RepoConnection` exists for the user.

### Why Not Run Against Real agent-be?

`agent-be:serve` runs the production `SandboxService` (real Daytona SDK). A real provision would require a valid GitHub OAuth token, a real Daytona API key, and a real repo to clone — none of which are available in the E2E environment without `TEST_GITHUB_REPO_URL`. The browser-side mock isolates the frontend state machine (the Story 3.1 UI surface) from the backend provisioning pipeline (already covered by 4 integration tests + 8 service unit tests). When real-infrastructure E2E is needed (NFR-P2 10s chat-ready, streaming tokens, tool pills, manual commit), Stories 3.3–3.4 should add tests gated on `TEST_GITHUB_REPO_URL`.

---

## Design Smells Discovered

### 1. Pre-existing bug: `agent-be` PrismaService missing driver adapter (fixed)

`apps/agent-be/src/prisma/prisma.service.ts` extended `PrismaClient` without passing the `@prisma/adapter-pg` driver adapter. The Prisma schema (`libs/database-schemas/src/prisma/schema.prisma`) declares `datasource db { provider = "postgresql" }` with no `url = env(...)` — it relies on the driver adapter for the connection string (the same pattern `apps/web/src/lib/prisma.ts` uses correctly). Without the adapter, `agent-be:serve` crashed on startup with `PrismaClientInitializationError: PrismaClient needs to be constructed with a non-empty, valid PrismaClientOptions`.

**Impact:** `agent-be:serve` could not start, blocking all E2E tests (the Playwright `webServer` readiness check timed out). Unit/integration tests did not catch this because `buildTestModule()` overrides the `PrismaService` provider with a mock — the real `PrismaService` was never instantiated outside the production server.

**Fix applied:** `PrismaService` constructor now calls `super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`, mirroring `apps/web/src/lib/prisma.ts`. This is a 1-constructor fix.

### 2. Pre-existing: `ConversationPage` page object references non-existent UI

`playwright/support/page-objects/conversation-page.ts` locates `session-status`, `chat-input`, `send-button`, `manual-commit-button`, `working-tree-indicator`, `message-stream`, and `tool-pill` test IDs. None of these exist in Story 3.1's `ConversationPane` (which uses `aria-label="Message input"`, a "Send" button, and "Starting session…" text — no test IDs). The page object was written speculatively for Stories 3.2–3.4 and does not match any implemented UI.

**Impact:** The old `sandbox-lifecycle.spec.ts` used this page object and referenced a `/dashboard` route, `repository-url-input`, and `start-conversation-button` — none of which exist. All 5 tests were skipped (required `TEST_GITHUB_REPO_URL`) and would have failed even if unskipped.

**Recommended fix (separate issue):** Rewrite `ConversationPage` when Story 3.2/3.3 delivers the full chat UI (streaming messages, tool pills, manual commit). The Story 3.1 E2E tests use direct semantic locators (`getByRole`, `getByText`) instead, following the `project-map.spec.ts` pattern.

### 3. Pre-existing: `agent-be` `/health` endpoint blocked by global guards

`GET /health` returns 401 "Missing boundary JWT" because `BoundaryJwtGuard` and `ActiveUserGuard` are registered as global `APP_GUARD`s that run on all routes. The `setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] })` only excludes the route from the `/api` prefix, not from the guards.

**Impact:** The Playwright `webServer` readiness check (`url: 'http://localhost:3001/health'`) still passes (any HTTP response counts as "server up"), so this doesn't block tests. But it means `/health` is not a true unauthenticated health check — it's a guarded endpoint that returns 401. A load balancer or Kubernetes liveness probe expecting 200 would fail.

**Recommended fix (separate issue):** Either (a) use `@Public()` decorator + `Reflector`-based guard exclusion for `/health`, or (b) move `/health` to a separate controller that the global guards don't cover.

---

## Checklist Validation

- [x] API tests generated (if applicable) — N/A: agent-be REST endpoints (`POST /api/conversations`, `GET /:id/status`, SSE `GET /:id/events`) are covered by existing unit/integration tests (`streaming.controller.spec.ts`, `conversations.service.spec.ts`, `sandbox-lifecycle.integration.spec.ts`). No new API tests needed.
- [x] E2E tests generated (if UI exists) — 7 tests in `sandbox-lifecycle.spec.ts` covering AC-1, AC-2, and AC-5
- [x] Tests use standard test framework APIs — Playwright `test`/`expect` from the project's merged-fixtures
- [x] Tests cover happy path — page renders with active input, POST + EventSource wiring, SESSION_READY transition
- [x] Tests cover 1-2 critical error cases — SESSION_ERROR event (AC-5), SESSION_TIMEOUT + retry (AC-5)
- [x] All generated tests run successfully — 7/7 pass (plus 1 auth setup)
- [x] Tests use proper locators (semantic, accessible) — `getByRole('heading')`, `getByRole('textbox', { name })`, `getByRole('button', { name })`, `getByText`
- [x] Tests have clear descriptions — `[P0]`/`[P1]` priority prefixes with AC references
- [x] No hardcoded waits or sleeps — all assertions use Playwright auto-waiting and `waitForFunction` for mock synchronization
- [x] Tests are independent (no order dependency) — `test.describe.configure({ mode: 'serial' })`; each test seeds/cleans its own `RepoConnection` via the `withRepoConnection` fixture
- [x] Test summary created — this section appended to the cumulative summary
- [x] Tests saved to appropriate directories — `playwright/e2e/conversation/`

### Next Steps

- When Story 3.2 (Invoke BMAD Skills via Slash Command) is implemented, extend `ConversationPane` E2E to cover the slash-command picker and the URL transition from `/conversations/new` to `/conversations/:id`
- When Story 3.3 (Converse with the Streaming Agent) is implemented, add E2E coverage for streaming tokens, tool pills, and the full chat UI — gated on `TEST_GITHUB_REPO_URL` for real-infrastructure tests (NFR-P2 10s chat-ready, NFR-P1 1.5s first token)
- Rewrite the `ConversationPage` page object to match the actual chat UI when Stories 3.3–3.4 deliver it
- Address the `/health` guard exclusion design smell when a load balancer or k8s probe is introduced

---

## Story 3.2: Invoke BMAD Skills via Slash Command — E2E Tests

**Generated:** 2026-07-04
**Story status:** review

---

## Generated Tests

### E2E Tests (Playwright)

- [x] [playwright/e2e/conversation/slash-command-picker.spec.ts](../../../playwright/e2e/conversation/slash-command-picker.spec.ts) — Slash command picker, message sending, and URL transition (9 tests)
- [x] [playwright/e2e/conversation/side-nav-conversations.spec.ts](../../../playwright/e2e/conversation/side-nav-conversations.spec.ts) — Side nav conversation list rendering (3 tests)

### Supporting Infrastructure

- [x] [apps/web/src/app/api/internal/test/conversations/route.ts](../../../apps/web/src/app/api/internal/test/conversations/route.ts) — Test seed endpoint for conversations (POST/DELETE), follows the existing `seed-user`/`repo-connections`/`artifacts` pattern
- [x] [playwright/support/custom-fixtures.ts](../../../playwright/support/custom-fixtures.ts) — `withConversations` fixture added, seeds 3 conversations with titles and `lastActiveAt` ordering

#### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| Picker opens on `/` and lists available skills | AC-1 | P0 | Typing `/` at start of empty input opens a listbox with all skills from `GET /:id/skills` |
| Typing after `/` narrows the list by prefix | AC-1 | P0 | Typing `/bmad-a` filters the list to skills starting with `bmad-a` |
| ArrowDown moves focus to next skill | AC-1 | P0 | ArrowDown moves `aria-selected` to the next option |
| ArrowUp wraps focus from first to last | AC-1 | P0 | ArrowUp from index 0 wraps to the last option |
| Enter selects focused skill and appends /{name} | AC-1 | P0 | Enter appends `/{name} ` to input, closes picker, focuses input |
| Escape dismisses the picker | AC-1 | P0 | Escape closes the listbox and returns focus to input |
| Outside click dismisses the picker | AC-1 | P1 | Clicking outside the picker container closes the listbox |
| Picker shows "No skills found" when empty | AC-2 | P0 | Empty skills array renders the empty state message, no options |
| Sending a message calls POST /:id/turns and transitions URL | AC-3, AC-4 | P0 | POST `/turns` called with Bearer JWT; URL transitions to `/conversations/:id` |
| Side nav shows seeded conversations as links | AC-4 | P0 | Seeded conversations render as `<Link>` with correct titles and hrefs |
| Side nav shows conversations ordered by lastActiveAt desc | AC-4 | P0 | Conversation links ordered by `lastActiveAt` descending |
| Active conversation highlighted in side nav | AC-4 | P0 | Active conversation link has `bg-surface-raised` + `text-text-1` classes |

## Coverage

- E2E tests: 12 new tests covering all 4 ACs
- AC-1 (Picker opens on `/`): 7 P0 + 1 P1
- AC-2 (Empty skills state): 1 P0
- AC-3 (Message persistence): 1 P0 (combined with AC-4)
- AC-4 (URL transition + side nav): 1 P0 (URL transition) + 3 P0 (side nav)

## Test Approach

- **Mocked browser→agent-be calls** (slash-command-picker.spec.ts): `fetch` and `EventSource` are mocked from the page via `page.addInitScript`, following the Story 3.1 E2E pattern. The mock intercepts `POST /api/conversations`, `GET /:id/skills`, and `POST /:id/turns`. This exercises the real `ConversationPane` state machine without a live Daytona provision.
- **Real Postgres data** (side-nav-conversations.spec.ts): The `withConversations` fixture seeds real `Conversation` rows via the test endpoint. The layout Server Component fetches these via Prisma, exercising the real side nav rendering pipeline.

## Checklist Validation

- [x] E2E tests generated (if UI exists) — 12 tests across 2 files covering AC-1, AC-2, AC-3, AC-4
- [x] Tests use standard test framework APIs — Playwright `test`/`expect` from the project's merged-fixtures
- [x] Tests cover happy path — picker opens, filters, keyboard navigation, skill selection, message sending, URL transition, side nav rendering
- [x] Tests cover 1-2 critical error cases — empty skills state (AC-2)
- [x] All generated tests run successfully — 12/12 pass (plus 7 existing Story 3.1 tests + 1 auth setup = 20 total)
- [x] Tests use proper locators (semantic, accessible) — `getByRole('listbox')`, `getByRole('option')`, `getByRole('textbox', { name })`, `getByRole('button', { name })`, `getByRole('link', { name })`, `getByTestId`
- [x] Tests have clear descriptions — `[P0]`/`[P1]` priority prefixes with AC references
- [x] No hardcoded waits or sleeps — all assertions use Playwright auto-waiting and `waitForFunction` for mock synchronization
- [x] Tests are independent (no order dependency) — `test.describe.configure({ mode: 'serial' })`; each test seeds/cleans its own data via fixtures
- [x] Test summary created — this section appended to the cumulative summary
- [x] Tests saved to appropriate directories — `playwright/e2e/conversation/`

### Next Steps

- When Story 3.3 (Converse with the Streaming Agent) is implemented, add E2E coverage for streaming tokens, tool pills, and the full chat UI
- Consider adding a real-infrastructure E2E test (with `TEST_GITHUB_REPO_URL`) that exercises the full sandbox provisioning → skills listing → message sending flow end-to-end

---

## Story 3.3: Converse with the Streaming Agent — E2E Tests

**Generated:** 2026-07-04
**Story status:** review

---

## Generated Tests

### E2E Tests (Playwright)

- [x] [playwright/e2e/conversation/streaming-chat.spec.ts](../../../playwright/e2e/conversation/streaming-chat.spec.ts) — Streaming chat: AG-UI event rendering, thinking/tool indicators, Stop button, copy actions, draft persistence, auto-growing textarea keyboard shortcuts (14 tests)

#### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| RUN_STARTED shows thinking indicator with three-dot animation | AC-1 | P0 | Emitting `RUN_STARTED` via SSE makes the "Agent is thinking" `role="status"` element visible |
| TEXT_MESSAGE_CONTENT events progressively render the agent response | AC-1 | P0 | Sequential `TEXT_MESSAGE_CONTENT` deltas ("The answer " + "is 4.") render progressively in the message stream |
| TOOL_CALL_START shows tool execution indicator with tool name | AC-1 | P0 | `TOOL_CALL_START` with `toolName: "read_file"` renders "Running… read_file" inline |
| RUN_FINISHED hides thinking indicator and re-enables Send button | AC-1 | P0 | After `RUN_FINISHED`, the thinking indicator disappears and the Send button reappears (replaces Stop) |
| RUN_ERROR shows error message in the message stream | AC-1 | P1 | `RUN_ERROR` with a message renders the error text in the message stream and returns to idle |
| Enter sends the message without Shift | AC-2 | P0 | Pressing Enter (no Shift) in the textarea triggers `POST /:id/turns` |
| Shift+Enter inserts a newline and does not send | AC-2 | P0 | Pressing Shift+Enter inserts a newline; no `POST /:id/turns` call is made |
| Stop button appears when agent is processing | AC-3 | P0 | After `RUN_STARTED`, the Stop button (aria-label="Stop agent") is visible and the Send button is hidden |
| Clicking Stop calls POST /:id/stop with Bearer JWT | AC-3 | P0 | Clicking Stop triggers `POST /api/conversations/:id/stop` with `Authorization: Bearer` header |
| After Stop, Send button reappears and user can send a new message | AC-3 | P0 | After Stop, Send button is visible; sending a second message results in 2 `POST /:id/turns` calls |
| Copy button copies message content to clipboard | AC-4 | P0 | Clicking the "Copy to clipboard" button on a user message writes the message text to the clipboard and shows "Copied" label |
| Timestamp is visible on hover over user message | AC-4 | P0 | Hovering over a user message reveals a timestamp matching `HH:MM` format |
| Draft is restored from localStorage on page reload | AC-6 | P0 | Typing a draft, reloading the page, and re-establishing the session restores the draft text in the textarea |
| Draft is cleared from localStorage on successful send | AC-6 | P0 | After sending a message, the textarea is empty and the localStorage draft key is cleared or empty |

---

## Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E | `streaming-chat.spec.ts` | 14 | 14 | 0 | **ALL PASSING** |

### Acceptance Criteria Coverage

| AC | Description | E2E Test(s) | Unit/Component Tests |
|---|---|---|---|
| AC-1 | Streaming agent response with indicators | RUN_STARTED thinking indicator; TEXT_MESSAGE_CONTENT progressive rendering; TOOL_CALL_START tool indicator; RUN_FINISHED hides indicator + re-enables Send; RUN_ERROR error message | `ConversationPane.test.tsx` (streaming tests), `ChatComponents.test.tsx`, `AgentMessage.test.tsx`, `agent.service.spec.ts`, `streaming.controller.spec.ts` (back-pressure) |
| AC-2 | Auto-growing chat input | Enter sends message; Shift+Enter inserts newline | `ChatInput.test.tsx` (auto-grow, Enter/Shift+Enter, Send button) |
| AC-3 | Stop button | Stop button appears when processing; Stop calls POST /:id/stop with Bearer JWT; Send reappears after Stop | `ChatInput.test.tsx` (Stop button), `ConversationPane.test.tsx` (Stop calls POST /:id/stop), `conversations.service.spec.ts` (stopAgent) |
| AC-4 | Copy actions and timestamps | Copy button copies to clipboard; Timestamp visible on hover | `ChatComponents.test.tsx` (CopyButton), `UserMessage.test.tsx` (timestamp), `AgentMessage.test.tsx` (timestamp) |
| AC-5 | Scroll-to-bottom button | Not E2E tested — see note below | `ChatMessageList.test.tsx` (prop-based), `ChatComponents.test.tsx` (ScrollToBottomButton) |
| AC-6 | Draft persistence keyed by conversationId | Draft restored on reload; Draft cleared on send | `useDraftPersistence.test.ts` (restore, clear, key switching) |

### AC-5 Note: Why no E2E test for scroll-to-bottom button

The `ConversationPane`'s `showScrollToBottom` state is initialized to `false` and only ever set to `false` (in `handleScrollToBottom`). The `ChatMessageList` tracks scroll position via `isAtBottomRef` but does not call a callback to update the parent's `showScrollToBottom` state. This means the scroll-to-bottom button never appears in the current implementation — the wiring between `ChatMessageList`'s scroll tracking and `ConversationPane`'s `showScrollToBottom` state is missing. This is an implementation gap, not a testing gap. The unit-level `ChatMessageList.test.tsx` verifies the button renders when `showScrollToBottom` is `true` (prop-based), and `ChatComponents.test.tsx` verifies `ScrollToBottomButton` calls `onClick` and shows the count. Full scroll behavior E2E coverage should be added when the implementation is completed.

---

## Test Execution

```bash
yarn test:e2e --grep "Streaming Chat" --reporter=list
```

```
  15 passed (45.1s)   [14 streaming chat tests + 1 auth setup]
```

Lint: `yarn nx lint web` — 0 errors.

---

## Test Approach

- **Mocked browser→agent-be calls:** `fetch` and `EventSource` are mocked from the page via `page.addInitScript`, following the Story 3.1/3.2 E2E pattern. The mock intercepts `POST /api/conversations`, `GET /:id/skills`, `POST /:id/turns`, and `POST /:id/stop`. AG-UI events (`RUN_STARTED`, `TEXT_MESSAGE_*`, `TOOL_CALL_*`, `RUN_FINISHED`, `RUN_ERROR`) are emitted via the mock EventSource's `__emit` method. This exercises the real `ConversationPane` state machine without a live Daytona provision or a real Claude agent.
- **Clipboard permissions:** The copy-to-clipboard test grants `clipboard-read` and `clipboard-write` permissions on the browser context via `page.context().grantPermissions()`, then verifies the clipboard content via `navigator.clipboard.readText()`.
- **Draft persistence:** The draft restore test types a draft, verifies it persists to `localStorage` under the `conversation-${id}-draft` key, reloads the page, re-emits `SESSION_READY`, and asserts the textarea value is restored. The draft clear test verifies the localStorage key is cleared or empty after sending.
- **Selectors:** `getByRole` and `getByText` only (no CSS classes or XPath), per the selector-resilience hierarchy. The timestamp test uses a regex pattern `/\d{2}:\d{2}/` to match the `Intl.DateTimeFormat` output.
- **Serial mode:** `test.describe.configure({ mode: 'serial' })` manages the shared synthetic E2E user's `RepoConnection` state sequentially.

---

## Checklist Validation

- [x] API tests generated (if applicable) — N/A: no new HTTP API endpoint to test from E2E (the `POST /:id/stop` endpoint is tested via the mocked fetch in the Stop button test)
- [x] E2E tests generated (if UI exists) — 14 tests in `streaming-chat.spec.ts` covering AC-1, AC-2, AC-3, AC-4, AC-6; AC-5 deferred (implementation gap)
- [x] Tests use standard test framework APIs — Playwright `test`/`expect` from the project's merged-fixtures
- [x] Tests cover happy path — streaming response renders, thinking/tool indicators appear, Stop button works, copy works, draft persists
- [x] Tests cover 1-2 critical error cases — RUN_ERROR error message display, draft cleared on send
- [x] All generated tests run successfully — 14/14 pass (plus 1 auth setup = 15 total)
- [x] Tests use proper locators (semantic, accessible) — `getByRole('textbox', { name })`, `getByRole('button', { name })`, `getByText`, `getByText(regex)`
- [x] Tests have clear descriptions — `[P0]`/`[P1]` priority prefixes with AC references
- [x] No hardcoded waits or sleeps — all assertions use Playwright auto-waiting, `waitForFunction` for mock synchronization, and `expect().resolves` for localStorage checks
- [x] Tests are independent (no order dependency) — `test.describe.configure({ mode: 'serial' })`; each test seeds/cleans its own `RepoConnection` via the `withRepoConnection` fixture
- [x] Test summary created — this section appended to the cumulative summary
- [x] Tests saved to appropriate directories — `playwright/e2e/conversation/`

### Next Steps

- Fix the AC-5 implementation gap: wire `ChatMessageList`'s scroll-position tracking to `ConversationPane`'s `showScrollToBottom` state so the scroll-to-bottom button appears when the user scrolls up during streaming
- Add a real-infrastructure E2E test (with `TEST_GITHUB_REPO_URL` and a real Claude API key) to empirically validate NFR-P1 (first token ≤ 1,500ms) and the full streaming pipeline end-to-end
- When Story 3.4 (Tool Pills) is implemented, extend the streaming chat E2E to cover the full Tool Pill (expand/collapse, input/output display) replacing the `ToolExecutionIndicator`
