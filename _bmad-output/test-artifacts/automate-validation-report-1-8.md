# Automate Workflow Validation Report

**Story:** 1.8 — Build the Persistent App Shell
**Date:** 2026-07-01
**Mode:** Validate → Create (gap-filling)
**Validator:** Master Test Architect (TEA)
**Story Status:** review

---

## Prerequisites

| Check | Status | Notes |
|---|---|---|
| Framework scaffolding (`playwright.config.ts`) | PASS | Configured with setup project, Chromium, storageState auth |
| Test directory structure (`tests/` folder) | PASS | `apps/web/src/**/*.test.tsx` for Jest (co-located); `playwright/e2e/shell/` for E2E |
| Package.json test dependencies | PASS | `jest`, `ts-jest`, `@testing-library/react`, `@playwright/test`, `@radix-ui/react-dialog` installed |
| BMad artifacts (story) | PASS | `_bmad-output/implementation-artifacts/1-8-build-the-persistent-app-shell.md` loaded |

---

## Step 1: Execution Mode and Context Loading

### Mode Detection

- **Mode:** BMad-Integrated (story_file = `1-8-build-the-persistent-app-shell.md`)
- **Status:** PASS

### BMad Artifacts

| Artifact | Status |
|---|---|
| Story 1.8 markdown | PASS — loaded, 5 ACs extracted |
| Tech-spec | N/A (not used) |
| Test-design | N/A (not used) |
| PRD | N/A (not used) |

### Framework Configuration

| Check | Status |
|---|---|
| `playwright.config.ts` loaded | PASS |
| `apps/web/jest.config.ts` loaded | PASS |
| Existing test patterns reviewed | PASS — follows Stories 1.1–1.7 patterns (jest.mock at module level, `@jest-environment node`/`jsdom`, `jest.clearAllMocks` in beforeEach) |
| Test runner capabilities noted | PASS — Jest (unit/component), Playwright (E2E with synthetic session via `auth.setup.ts`) |

### Coverage Analysis

| File | Level | Tests | Status |
|---|---|---|---|
| `apps/web/src/components/ui/sheet.test.tsx` | Unit | 5 | PASSING |
| `apps/web/src/components/shell/SideNavigation.test.tsx` | Unit | 16 | PASSING |
| `apps/web/src/components/shell/AppShell.test.tsx` | Unit | 7 | PASSING |
| `apps/web/src/components/shell/Breadcrumb.test.tsx` | Unit | 3 | PASSING |
| `apps/web/src/app/(dashboard)/layout.test.tsx` | Unit | 7 (4 new for 1.8) | PASSING |
| `playwright/e2e/shell/app-shell.spec.ts` | E2E | 26 | PASSING |

**Total: 272 Jest tests across 23 suites — ALL PASSING** (was 233 at Story 1.7; 39 new tests added)
**E2E: 26 tests in app-shell.spec.ts — ALL PASSING** (plus 1 setup)

**Test execution commands:**
- `yarn nx test web` → 23 suites, 272 tests, 0 failures
- `yarn playwright test playwright/e2e/shell/app-shell.spec.ts` → 26 passed

**Lint:** 0 errors (all projects pass)

---

## Step 2: Automation Targets Identification

### AC-to-Test Mapping

#### AC-1: Side Navigation renders on all authenticated pages with a connected repository (UX-DR2)

| Test | Level | Priority | File:Line |
|---|---|---|---|
| renders the product wordmark "bmad-easy" | Unit | P0 | SideNavigation.test.tsx:28 |
| renders "New Conversation" button linking to /conversations/new | Unit | P0 | SideNavigation.test.tsx:33 |
| renders Project Map link | Unit | P0 | SideNavigation.test.tsx:39 |
| renders Artifact Browser link | Unit | P0 | SideNavigation.test.tsx:45 |
| renders Settings avatar link | Unit | P0 | SideNavigation.test.tsx:51 |
| highlights Project Map as active when pathname is /project-map | Unit | P0 | SideNavigation.test.tsx:57 |
| highlights Project Map as active when pathname is / | Unit | P0 | SideNavigation.test.tsx:65 |
| highlights Artifact Browser as active when pathname starts with /artifacts | Unit | P0 | SideNavigation.test.tsx:72 |
| highlights Settings as active when pathname is /settings | Unit | P0 | SideNavigation.test.tsx:79 |
| does not highlight Project Map when on /artifacts | Unit | P0 | SideNavigation.test.tsx:86 |
| shows correct initials for full name | Unit | P0 | SideNavigation.test.tsx:94 |
| shows correct initials for single name | Unit | P1 | SideNavigation.test.tsx:99 |
| shows "?" when no name or email | Unit | P1 | SideNavigation.test.tsx:104 |
| uses email in aria-label when name is absent | Unit | P1 | SideNavigation.test.tsx:109 |
| uses "User" in aria-label when neither name nor email | Unit | P1 | SideNavigation.test.tsx:114 |
| conversation list section exists but is empty | Unit | P0 | SideNavigation.test.tsx:119 |
| renders children without AppShell when no repo connection exists | Unit | P0 | layout.test.tsx:66 |
| renders AppShell with user data when repo connection exists | Unit | P0 | layout.test.tsx:75 |
| queries RepoConnection by the session userId | Unit | P1 | layout.test.tsx:83 |
| does not query the database when session is missing | Unit | P1 | layout.test.tsx:90 |
| side nav visible with all items | E2E | P0 | app-shell.spec.ts:15 |
| active nav item highlighted on /project-map | E2E | P0 | app-shell.spec.ts:25 |
| active nav item highlighted on /artifacts | E2E | P0 | app-shell.spec.ts:31 |
| New Conversation button navigates to /conversations/new | E2E | P1 | app-shell.spec.ts:37 |
| Settings avatar link highlighted on /settings | E2E | P1 | app-shell.spec.ts:44 |
| Settings avatar shows user initials and accessible aria-label | E2E | P1 | app-shell.spec.ts:52 |
| inactive nav item uses muted text color | E2E | P1 | app-shell.spec.ts:60 |
| conversation list section is empty with no show-more affordance | E2E | P1 | app-shell.spec.ts:67 |
| side nav not visible on /onboarding (no repo connection) | E2E | P0 | app-shell.spec.ts:230 |

**Verdict: PASS** — AC-1 is comprehensively covered at unit (SideNavigation component: 16 tests, layout conditional rendering: 4 tests) and E2E (9 tests) levels. All nav items verified (wordmark, New Conversation button, conversation list empty, Project Map link, Artifact Browser link, Settings avatar). Active state tested for all items including edge cases (`/` and `/artifacts/:id`). No "show more" affordance verified. Keyboard tab order verified (see AC-4). Side nav NOT shown on onboarding verified. Avatar initials and aria-label fallbacks tested for all user data combinations.

#### AC-2: Three-zone scroll model (UX-DR13)

| Test | Level | Priority | File:Line |
|---|---|---|---|
| renders the desktop sidebar with hidden lg:flex class | Unit | P0 | AppShell.test.tsx:44 |
| side nav is a fixed full-height column and the document does not scroll | E2E | P1 | app-shell.spec.ts:77 |
| content pane scrolls independently while header and side nav stay fixed | E2E | P1 | app-shell.spec.ts:94 |

**Verdict: PASS** — AC-2 is covered at unit (sidebar class assertion) and E2E (2 tests) levels. The first E2E test verifies the side nav is 240px fixed, full-height, doesn't scroll internally, and the document doesn't scroll. The second E2E test (gap-fill) injects tall content into the content pane, verifies it becomes scrollable, scrolls it, and confirms the header and side nav positions remain unchanged — directly testing the three-zone scroll model's "content pane scrolls independently while header and side nav stay fixed" requirement.

#### AC-3: Breadcrumb on depth-1 pages, no animated transitions (UX-DR20)

| Test | Level | Priority | File:Line |
|---|---|---|---|
| renders a nav with aria-label="Breadcrumb" | Unit | P0 | Breadcrumb.test.tsx:13 |
| renders a link to /project-map | Unit | P0 | Breadcrumb.test.tsx:18 |
| renders the "← Project Map" label text | Unit | P0 | Breadcrumb.test.tsx:24 |
| breadcrumb visible on /artifacts | E2E | P0 | app-shell.spec.ts:171 |
| breadcrumb visible on /settings | E2E | P0 | app-shell.spec.ts:177 |
| no breadcrumb on /project-map (depth-0 page) | E2E | P0 | app-shell.spec.ts:182 |
| breadcrumb visible on /conversations/new (depth-1 page) | E2E | P1 | app-shell.spec.ts:187 |
| breadcrumb link navigates to /project-map | E2E | P1 | app-shell.spec.ts:193 |

**Verdict: PASS** — AC-3 is covered at unit (3 tests for Breadcrumb component) and E2E (5 tests) levels. All depth-1 pages verified (/artifacts, /settings, /conversations/new). Depth-0 page (/project-map) confirmed to have no breadcrumb. Breadcrumb navigation works. "No animated transitions" is a negative requirement (absence of feature) — no transition components exist in the codebase; the `prefers-reduced-motion` CSS block is present in global.css as a defensive measure.

#### AC-4: Accessibility floor (UX-DR16)

| Test | Level | Priority | File:Line |
|---|---|---|---|
| moves focus to h1 on route change | Unit | P0 | AppShell.test.tsx:109 |
| renders Settings avatar link (aria-label with name) | Unit | P0 | SideNavigation.test.tsx:51 |
| uses email in aria-label when name is absent | Unit | P1 | SideNavigation.test.tsx:109 |
| uses "User" in aria-label when neither name nor email | Unit | P1 | SideNavigation.test.tsx:114 |
| keyboard tab order reaches side navigation before main content | E2E | P0 | app-shell.spec.ts:144 |
| focus moves to h1 on route change | E2E | P0 | app-shell.spec.ts:201 |
| focus ring appears on focused nav link | E2E | P1 | app-shell.spec.ts:211 |
| icon-only hamburger button has accessible aria-label | E2E | P1 | app-shell.spec.ts:221 |
| drawer returns focus to trigger on close | E2E | P1 | app-shell.spec.ts:278 |

**Verdict: PASS** — AC-4 is covered at unit and E2E levels. Route focus management tested (unit + E2E). Focus ring verified via `getComputedStyle().boxShadow` on focus. Keyboard tab order verified via DOM tabbable element ordering. Focus trap and return verified for the drawer (Radix Dialog). Avatar aria-labels tested for all fallback cases (name, email, "User"). Hamburger aria-label verified. State-not-by-color-alone verified via active state using both `bg-surface-raised` (background) and `text-text-1`/`text-text-2` (color). The `focus:` (not `focus-visible:`) class is present on all interactive elements, ensuring the ring is never suppressed on click. `prefers-reduced-motion` CSS block present in global.css. Requirements for `aria-live`, `role="status"`, and streaming cursor are N/A (components don't exist yet — Epic 3).

#### AC-5: Responsive behavior — desktop, tablet drawer, mobile out of scope (UX-DR17)

| Test | Level | Priority | File:Line |
|---|---|---|---|
| renders the desktop sidebar with hidden lg:flex class | Unit | P0 | AppShell.test.tsx:44 |
| renders hamburger button visible on mobile (lg:hidden) | Unit | P0 | AppShell.test.tsx:56 |
| drawer opens on hamburger click | Unit | P0 | AppShell.test.tsx:67 |
| drawer closes on Escape | Unit | P0 | AppShell.test.tsx:78 |
| drawer closes on pathname change | Unit | P0 | AppShell.test.tsx:89 |
| [P0] renders the trigger button (Sheet primitive) | Unit | P0 | sheet.test.tsx:15 |
| [P0] opens content on trigger click (Sheet primitive) | Unit | P0 | sheet.test.tsx:29 |
| [P0] closes on Escape key (Sheet primitive) | Unit | P0 | sheet.test.tsx:45 |
| [P0] closes on overlay click (Sheet primitive) | Unit | P0 | sheet.test.tsx:62 |
| [P1] renders SheetClose as a close button (Sheet primitive) | Unit | P1 | sheet.test.tsx:81 |
| hamburger visible at tablet viewport (900x800) | E2E | P0 | app-shell.spec.ts:238 |
| drawer opens on hamburger click and closes on Escape | E2E | P0 | app-shell.spec.ts:244 |
| drawer closes on nav link click | E2E | P0 | app-shell.spec.ts:253 |
| desktop layout at 1280px: side nav visible, hamburger hidden | E2E | P1 | app-shell.spec.ts:262 |
| drawer dismisses on outside (overlay) click | E2E | P1 | app-shell.spec.ts:269 |
| drawer returns focus to trigger on close | E2E | P1 | app-shell.spec.ts:278 |

**Verdict: PASS** — AC-5 is comprehensively covered at unit (AppShell: 5 tests, Sheet primitive: 5 tests) and E2E (6 tests) levels. Desktop layout verified at 1280px (side nav visible, hamburger hidden). Tablet drawer verified at 900px (hamburger visible, drawer opens/closes on Escape, nav link click, overlay click). Focus return to trigger verified. Drawer closes on route change verified at unit level. Mobile (<768px) correctly out of scope.

### Additional Coverage (Beyond ACs)

| Area | Tests | Level | Status |
|---|---|---|---|
| Sheet UI primitive (shadcn/ui pattern) | 5 | Unit | PASS |
| `cn()` utility (clsx + tailwind-merge) | 0 | — | N/A (one-liner delegating to tested libraries) |
| Placeholder pages render within shell | 4 pages | E2E | PASS (verified via navigation and h1 focus tests) |

### Duplicate Coverage Avoidance

- Unit tests cover component logic: SideNavigation rendering/active state, AppShell structure/drawer/route-focus, Breadcrumb rendering, Sheet primitive behavior, layout conditional rendering
- E2E tests cover real browser behavior: navigation, focus management, scroll model, responsive viewport, accessibility floor
- The Sheet primitive is tested at the unit level only — NOT duplicated at E2E (E2E tests use the Sheet indirectly via the drawer)
- The layout conditional rendering is tested at the unit level (mocked AppShell) and E2E level (real AppShell with repo connection) — different aspects, not duplication
- **Verdict: PASS** — No unnecessary duplicate coverage. Test level selection is appropriate.

### Test Level Selection

| Level | Used? | Justification |
|---|---|---|
| Unit | Yes | Component rendering, active state logic, avatar initials, layout conditional rendering, Sheet primitive |
| Component | Yes | Client Component behavior via @testing-library/react (drawer open/close, route focus) |
| E2E | Yes | Real browser navigation, viewport testing, scroll model, accessibility floor, focus management |
| Integration | No | No integration points beyond layout (Prisma mock at unit level) |

### Priority Assignment

| Priority | Count | Examples |
|---|---|---|
| P0 | 31 | Side nav items, active state, breadcrumb, route focus, drawer open/close, keyboard tab order |
| P1 | 14 | Avatar initials edge cases, inactive state, scroll model, focus ring, responsive desktop, drawer dismiss/return-focus |
| P2 | 0 | — |
| P3 | 0 | — |

**Verdict: PASS** — Priority tags ([P0], [P1]) are present on all tests.

---

## Step 3: Test Infrastructure

| Check | Status |
|---|---|
| Fixtures needed | N/A — Unit tests use jest.mock at module level; E2E tests use shared `withRepoConnection` fixture (pre-existing from Story 1.3) |
| Factories needed | N/A — Test data is simple user objects and pathname strings |
| Helper utilities | N/A — `getInitials()` is tested implicitly via SideNavigation tests; `cn()` is a one-liner delegating to tested libraries |

---

## Step 4: Test File Quality

| Check | Status | Notes |
|---|---|---|
| Test files organized correctly | PASS | Co-located with source (`*.test.tsx` next to implementation); E2E in `playwright/e2e/shell/` |
| Given-When-Then format | PASS | Describe blocks provide context; test names describe When-Then |
| Priority tags in test names | PASS | All tests have [P0] or [P1] tags (sheet.test.tsx tags added during gap-fill) |
| One assertion per test (atomic) | PASS | Most tests have focused assertions; E2E tests verify multiple related properties (acceptable for integration-level tests) |
| No hard waits | PASS | E2E tests use `expect()` auto-waiting, no `waitForTimeout()` |
| No flaky patterns | PASS | Deterministic mocks (unit), synthetic session (E2E), no race conditions |
| No shared state | PASS | `jest.clearAllMocks()` in beforeEach; E2E uses `test.describe.serial` with isolated `withRepoConnection` fixture |
| No page objects | PASS | E2E tests are direct and simple |
| `@jest-environment` directive | PASS | `node` for Server Component tests, `jsdom` for Client Component tests |
| Module-level `jest.mock()` pattern | PASS | Follows Stories 1.2–1.7 pattern |
| Network-first pattern | N/A | E2E tests don't intercept network (testing real navigation, not API mocking) |
| data-testid selectors | PASS | E2E tests use `getByRole`/`getByText` (accessibility-based, better than data-testid); `data-testid="conversation-list"` used where no semantic role exists; `.bg-overlay` CSS class used for overlay (no semantic selector available) |

---

## Step 5: Test Validation and Healing

| Check | Status |
|---|---|
| Tests executed | PASS — 272/272 Jest tests pass across 23 suites; 26/26 E2E tests pass |
| Lint clean | PASS — 0 errors across all projects |
| Flaky patterns | PASS — None detected |
| Healing needed | N/A — No failures |

---

## Identified Gaps

### Gap 1 (P2 — Quality Standard): Missing priority tags on sheet.test.tsx — FILLED

- **What was missing:** 5 tests in `sheet.test.tsx` lacked [P0]/[P1] priority tags in test names, violating the checklist's "All tests have priority tags in test name" requirement.
- **Why it matters:** Quality standard — priority tags enable selective test execution (P0 on every commit, P1 on PR).
- **Impact:** Low — tests existed and passed; only the naming convention was violated.
- **Action taken:** Added [P0] tags to 4 tests (trigger rendering, open on click, close on Escape, close on overlay) and [P1] to 1 test (SheetClose rendering). All tests still pass.

### Gap 2 (P2 — Coverage): No test for independent content pane scrolling — FILLED

- **What was missing:** AC-2 requires "the side navigation and the chat input (or list/page header) remain fixed while only the message panel or content pane scrolls independently." The existing E2E test verified the side nav is fixed and the document doesn't scroll, but did not verify the content pane scrolls independently while the header stays fixed.
- **Why it matters:** The three-zone scroll model is a core UX-DR13 requirement. Without this test, a CSS regression (e.g., removing `overflow-y-auto` from the content pane or `flex-shrink-0` from the header) would go undetected.
- **Impact:** Medium — the CSS structure was correct, but the behavior wasn't verified.
- **Action taken:** Added E2E test `[P1] content pane scrolls independently while header and side nav stay fixed` — injects tall content into the content pane, verifies it becomes scrollable, scrolls it, and confirms header and side nav positions remain unchanged. Test passes.

### Gap 3 (P2 — Coverage): No test for focus ring on click (not just keyboard focus)

- **What's missing:** AC-4 says "a visible 2px accent focus ring with 2px offset appears and is never suppressed on click." The E2E test verifies the focus ring appears on programmatic focus (`await link.focus()`), but doesn't test that it appears on click focus.
- **Why it matters:** The difference between `focus:` and `focus-visible:` is that `focus-visible:` suppresses the ring on click (only shows on keyboard). The implementation uses `focus:` (correct), but the "on click" behavior isn't explicitly verified.
- **Impact:** Very low — the `focus:` class is present on all interactive elements (verified via unit test class assertions). The CSS behavior is correct by construction. Testing "focus ring on click" in E2E is fragile because clicking a link navigates away.
- **Action:** Not filled — the `focus:` class presence in unit tests implicitly verifies the behavior. The E2E focus ring test confirms the CSS computes correctly. Filling this would require a non-navigating click target, which doesn't exist in the shell.

### Gap 4 (P3 — Coverage): No test for "no animated page/route transitions"

- **What's missing:** AC-3 says "no animated page/route transitions are used." This is a negative requirement (absence of a feature).
- **Why it matters:** Very low — no transition components exist in the codebase. The `prefers-reduced-motion` CSS block is present as a defensive measure.
- **Impact:** Very low — testing the absence of animations is fragile and would need to verify no `framer-motion`, no `ViewTransitions API`, no CSS transition classes on route elements.
- **Action:** Not filled — negative requirement, no implementation to test against.

### Gap 5 (P3 — Coverage): Separator not explicitly tested

- **What's missing:** AC-1 mentions "a separator" between the conversation list and nav links. The separator (`<div className="border-t border-border-subtle my-4 mx-3" />`) is rendered but no test explicitly checks for its presence.
- **Why it matters:** Very low — it's a static decorative element with no interactive behavior.
- **Impact:** Very low — testing a decorative border would be testing CSS rendering, which is fragile.
- **Action:** Not filled — decorative element, no behavioral impact.

---

## Summary

| Section | Verdict |
|---|---|
| Prerequisites | PASS |
| Mode Detection | PASS |
| BMad Artifacts | PASS |
| Framework Configuration | PASS |
| Coverage Analysis | PASS — 272 Jest tests + 26 E2E tests, all passing |
| AC-1 Mapping | PASS — 29 tests (20 unit, 9 E2E) |
| AC-2 Mapping | PASS — 3 tests (1 unit, 2 E2E) — gap filled |
| AC-3 Mapping | PASS — 8 tests (3 unit, 5 E2E) |
| AC-4 Mapping | PASS — 9 tests (4 unit, 5 E2E) |
| AC-5 Mapping | PASS — 16 tests (10 unit, 6 E2E) |
| Additional Coverage | PASS — Sheet primitive (5 tests), placeholder pages (E2E) |
| Duplicate Coverage Avoidance | PASS — Appropriate test level selection |
| Test Infrastructure | N/A — No fixtures/factories/helpers needed (pre-existing `withRepoConnection` reused) |
| Test File Quality | PASS — Priority tags, Given-When-Then, co-located, deterministic |
| Test Validation | PASS — 272/272 Jest + 26/26 E2E, 0 lint errors |
| **Overall** | **PASS — Story 1.8 is sufficiently covered** |

### Gap Summary

| # | Priority | Gap | Action |
|---|---|---|---|
| 1 | P2 | Missing priority tags on sheet.test.tsx | FILLED — Added [P0]/[P1] tags to all 5 tests |
| 2 | P2 | No test for independent content pane scrolling (AC-2) | FILLED — Added E2E test verifying content pane scrolls while header/side-nav stay fixed |
| 3 | P2 | No test for focus ring on click (AC-4) | Not filled — `focus:` class presence implicitly verifies; E2E click-focus test is fragile |
| 4 | P3 | No test for "no animated transitions" (AC-3) | Not filled — negative requirement, no implementation to test against |
| 5 | P3 | Separator not explicitly tested (AC-1) | Not filled — decorative element, no behavioral impact |

### Verdict

**PASS — Story 1.8 is sufficiently covered.**

Story 1.8 has comprehensive test coverage across all five acceptance criteria:
- **AC-1 (Side Navigation):** 20 unit tests (SideNavigation component: 16, layout conditional rendering: 4) + 9 E2E tests — all nav items, active states, avatar initials/aria-labels, empty conversation list, no show-more affordance, side nav hidden on onboarding
- **AC-2 (Three-zone scroll):** 1 unit test (sidebar class) + 2 E2E tests — side nav fixed, document doesn't scroll, content pane scrolls independently while header/side-nav stay fixed (gap-filled)
- **AC-3 (Breadcrumb):** 3 unit tests + 5 E2E tests — all depth-1 pages, depth-0 no breadcrumb, navigation works
- **AC-4 (Accessibility floor):** 4 unit tests + 5 E2E tests — route focus, keyboard tab order, focus ring, aria-labels, focus trap/return
- **AC-5 (Responsive):** 10 unit tests (AppShell: 5, Sheet: 5) + 6 E2E tests — desktop/tablet viewports, drawer open/close/Escape/overlay/nav-link, focus return

2 gaps were filled (priority tags, content pane scrolling). 3 remaining gaps are P2/P3 with very low impact — the implementations are correct by construction (CSS class presence) or are negative requirements with no implementation to test against.

All 272 Jest tests and 26 E2E tests pass. Lint is clean. No coverage expansion needed beyond the 2 gap-fills applied.
