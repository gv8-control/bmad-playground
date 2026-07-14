---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-12'
storyId: '5.2'
storyKey: '5-2-fix-shared-shell-and-page-header-structural-drift'
storyFile: '_bmad-output/implementation-artifacts/5-2-fix-shared-shell-and-page-header-structural-drift.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-5-2-fix-shared-shell-and-page-header-structural-drift.md'
generatedTestFiles:
  - apps/web/src/components/shell/SideNavigation.test.tsx
  - apps/web/src/components/shell/Breadcrumb.test.tsx
  - apps/web/src/app/(dashboard)/(app)/settings/page.test.tsx
  - apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx
  - apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.test.tsx
inputDocuments:
  - '_bmad-output/implementation-artifacts/5-2-fix-shared-shell-and-page-header-structural-drift.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/decision-policy.md'
  - '_bmad/tea/config.yaml'
---

# ATDD Checklist — Story 5.2: Fix Shared Shell and Page-Header Structural Drift

## Step 1: Preflight & Context

- **Stack detected:** fullstack (frontend-only story — all changes in `apps/web`)
- **Test framework:** Jest ~30.3.0 (unit/component, co-located), Playwright ^1.61.0 (E2E in `playwright/`)
- **Story file:** `_bmad-output/implementation-artifacts/5-2-fix-shared-shell-and-page-header-structural-drift.md`
- **Story key:** `5-2-fix-shared-shell-and-page-header-structural-drift`
- **Story ID:** `5.2`
- **Acceptance criteria:** 10 ACs, all purely structural (CSS class presence, DOM structure, text content)
- **Prerequisites satisfied:** Story approved with clear ACs, test framework configured, dev environment available

## Step 2: Generation Mode

- **Mode:** AI Generation
- **Rationale:** Acceptance criteria are clear, scenarios are standard UI structure assertions (CSS class presence, text content, DOM hierarchy). No complex UI interactions requiring browser recording.

## Step 3: Test Strategy

### AC-to-Test Mapping

| AC | Description | Test Level | Priority | Test File |
|----|-------------|------------|----------|-----------|
| AC-1 | Wordmark `bmad·easy` with accent interpunct + `tracking-tight` | Component | P0 | `SideNavigation.test.tsx` |
| AC-2 | Wordmark `border-b border-surface-raised` separator | Component | P0 | `SideNavigation.test.tsx` |
| AC-3 | "Settings" visible label next to avatar | Component | P0 | `SideNavigation.test.tsx` |
| AC-4 | Active-state inset pill (`mx-2`, `rounded-md`, `px-2`) | Component | P0 | `SideNavigation.test.tsx` |
| AC-5 | Single horizontal padding (no `px-3` on container, `px-3` on items) | Component | P0 | `SideNavigation.test.tsx` |
| AC-6 | Nav button spacing (`mt-3 mb-2`, `flex items-center justify-center`, `+` prefix) | Component | P0 | `SideNavigation.test.tsx` |
| AC-7 | Breadcrumb inline beside title (nav no padding, header flex row) | Component + Page | P0 | `Breadcrumb.test.tsx` + 3 page tests |
| AC-8 | Header `border-b border-surface-raised` divider on depth-1 pages | Page | P0 | 3 page tests |
| AC-9 | Separator `my-2 mx-4 border-surface-raised` | Component | P0 | `SideNavigation.test.tsx` |
| AC-10 | Nav links grouped with conversation list (top-clustered in `flex-1`) | Component | P0 | `SideNavigation.test.tsx` |

### E2E Deferral Check

**Question:** Can a browser-level mock pattern simulate the scenario and cover the ACs?

**Browser-level mock patterns checked:**

1. **`page.evaluate()` with `getComputedStyle()`:** Could verify computed styles (e.g., `border-bottom-width: 1px`, `margin: 0 8px`). However, className assertions in jsdom are more precise — they verify the Tailwind token directly, not the computed style. A computed style check would pass even if the wrong token is used (e.g., `border-border-subtle` instead of `border-surface-raised` both produce `1px` border). className assertions catch token-level drift.
2. **`page.locator().evaluate()` for DOM structure:** Could verify DOM hierarchy (e.g., breadcrumb and h1 inside a flex row). But `renderToStaticMarkup` page tests already verify this more reliably — no flakiness, no dev server required, deterministic.
3. **Playwright route interception:** Not relevant — no API calls in these ACs.
4. **Visual screenshot comparison:** Could verify visual layout, but the ACs specify CSS classes and DOM structure, not pixel-level appearance. The existing E2E suite already covers behavioral aspects (navigation, focus, tab order, breadcrumb visibility).

**Answer:** No browser-level mock pattern adds value beyond component/page tests for these ACs. All 10 ACs are verifiable via className assertions, text content checks, and DOM structure verification — all of which are more precise and less flaky at the component/page level.

**Decision (DP-4: test-only changes):** E2E coverage deferred. All 10 ACs are purely structural assertions (CSS class presence, text content, DOM hierarchy) that component/page tests cover at the appropriate level. The existing E2E suite (`playwright/e2e/shell/app-shell.spec.ts`, 288 lines) already covers behavioral aspects (navigation, focus management, tab order, breadcrumb visibility, mobile drawer). Writing E2E tests for the same structural assertions would create duplicate coverage across levels, which Step 3 of the ATDD workflow explicitly says to avoid ("Avoid duplicate coverage across levels").

### Regression Guard Check

**Question:** Does the story involve code that executes external commands with user-controlled input?

**Answer:** NO — Story 5.2 is purely frontend visual structure (CSS classes, DOM hierarchy, text content). No external command execution, no user-controlled input passed to shell commands, no credential isolation concerns. The uniform guard template for credential-isolation and input-injection invariants is not applicable.

## Step 4: Generated Test Scaffolds

### Test File 1: `apps/web/src/components/shell/SideNavigation.test.tsx` (AC-1, 2, 3, 4, 5, 6, 9, 10)

**Status:** Existing file — updated wordmark test (line 33: `it` → `it.skip`, assertion changed from `getByText('bmad-easy')` to `getByTestId('product-wordmark')` + `toHaveTextContent('bmad·easy')`), added new describe block "Story 5.2 — Shell Structural Drift"

**Updated existing test:**

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `it.skip` wordmark "bmad·easy" with accent interpunct | P0 | AC-1 | 1.1 | Changed from `getByText('bmad-easy')` to `getByTestId` + `toHaveTextContent('bmad·easy')` |

**New describe block: "Story 5.2 — Shell Structural Drift (AC-1, 2, 3, 4, 5, 6, 9, 10)"**

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `it.skip` wordmark has `tracking-tight` | P0 | AC-1 | 1.2 | Asserts letter-spacing class |
| `it.skip` wordmark has `border-b` | P0 | AC-2 | 2.1 | Asserts border-bottom class |
| `it.skip` wordmark border uses `border-surface-raised` | P0 | AC-2 | 2.1 | Asserts border color token |
| `it.skip` settings link contains "Settings" text | P0 | AC-3 | 3.1 | Asserts visible label next to avatar |
| `it.skip` active Project Map has `mx-2` | P0 | AC-4 | 4.1 | Asserts inset margin on active item |
| `it.skip` active Project Map has `rounded-md` | P0 | AC-4 | 4.1 | Asserts pill radius on active item |
| `it.skip` active item has `px-2` (not `px-3`) | P0 | AC-4 | 4.2 | Asserts active padding reduction |
| `it.skip` inactive items do NOT have `mx-2` | P0 | AC-4 | 4.3 | Asserts inset only on active state |
| `it.skip` active Artifact Browser has `mx-2` + `rounded-md` | P0 | AC-4 | 4.4 | Asserts inset pill on all active items |
| `it.skip` active Settings has `mx-2` + `rounded-md` | P0 | AC-4 | 4.4 | Asserts inset pill on settings active |
| `it.skip` active conversation has `mx-2` + `rounded-md` | P0 | AC-4 | 4.4 | Asserts inset pill on conversation active |
| `it.skip` nav links use `px-3` (not `px-4`) | P0 | AC-5 | 5.2 | Asserts 12px horizontal padding on items |
| `it.skip` conversation list container does NOT have `px-3` | P0 | AC-5 | 5.1 | Asserts no doubled padding |
| `it.skip` "New Conversation" text starts with `+` | P0 | AC-6 | 6.3 | Asserts button prefix |
| `it.skip` "New Conversation" has `mt-3` | P0 | AC-6 | 6.1 | Asserts top margin |
| `it.skip` "New Conversation" has `mb-2` | P0 | AC-6 | 6.1 | Asserts bottom margin |
| `it.skip` "New Conversation" has `flex items-center justify-center` | P0 | AC-6 | 6.2 | Asserts centering |
| `it.skip` separator has `my-2` (not `my-4`) | P0 | AC-9 | 9.1 | Asserts vertical margin |
| `it.skip` separator has `mx-4` (not `mx-3`) | P0 | AC-9 | 9.1 | Asserts horizontal margin |
| `it.skip` separator uses `border-surface-raised` | P0 | AC-9 | 9.1 | Asserts border color token |
| `it.skip` separator + nav links inside `flex-1` container | P0 | AC-10 | 10.1 | Asserts top-clustered grouping |
| `it.skip` with 0 conversations, nav links still top-clustered | P0 | AC-10 | 10.6 | Asserts layout with empty list |
| `it.skip` `flex-1` container has `py-1` | P0 | AC-10 | 10.5 | Asserts container padding |
| `it.skip` conversation list wrapper does NOT have `mt-4` | P0 | AC-10 | 10.4 | Asserts gap removed |

### Test File 2: `apps/web/src/components/shell/Breadcrumb.test.tsx` (AC-7)

**Status:** Existing file — added new describe block "Story 5.2 — Breadcrumb inline layout (AC-7)"

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `it.skip` nav does NOT have `px-8` | P0 | AC-7 | 7.1 | Asserts padding moved to header |
| `it.skip` nav does NOT have `py-4` | P0 | AC-7 | 7.1 | Asserts padding moved to header |
| `it.skip` nav does NOT have `flex-shrink-0` | P0 | AC-7 | 7.1 | Asserts inline element, not flex child |

### Test File 3: `apps/web/src/app/(dashboard)/(app)/settings/page.test.tsx` (AC-7, AC-8)

**Status:** Existing file — added new describe block "Story 5.2 — Header structure (AC-7, AC-8)"

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `it.skip` header has `border-b border-surface-raised` | P0 | AC-8 | 8.1 | Asserts divider on depth-1 page |
| `it.skip` header has `pt-6 pb-4 px-8` | P0 | AC-7 | 7.3 | Asserts header padding |
| `it.skip` breadcrumb + h1 in `flex items-center gap-3` row | P0 | AC-7 | 7.3 | Asserts inline layout |
| `it.skip` h1 does NOT have `px-8` | P0 | AC-7 | 7.4 | Asserts padding moved to header |

### Test File 4: `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` (AC-7, AC-8)

**Status:** Existing file — added new describe block "Story 5.2 — Header structure (AC-7, AC-8)"

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `it.skip` header has `border-b border-surface-raised` | P0 | AC-8 | 8.1 | Asserts divider on depth-1 page |
| `it.skip` header has `pt-6 pb-4 px-8` | P0 | AC-7 | 7.3 | Asserts header padding |
| `it.skip` breadcrumb + h1 in `flex items-center gap-3` row | P0 | AC-7 | 7.3 | Asserts inline layout |
| `it.skip` h1 does NOT have `px-8` | P0 | AC-7 | 7.4 | Asserts padding moved to header |

### Test File 5: `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.test.tsx` (AC-7, AC-8)

**Status:** Existing file — added new describe block "Story 5.2 — Header structure (AC-7, AC-8)"

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `it.skip` header has `border-b border-surface-raised` | P0 | AC-8 | 8.1 | Asserts divider on depth-1 page |
| `it.skip` header has `pt-6 pb-4 px-8` | P0 | AC-7 | 7.3 | Asserts header padding |
| `it.skip` breadcrumb + h1 in `flex items-center gap-3` row | P0 | AC-7 | 7.3 | Asserts inline layout |
| `it.skip` h1 does NOT have `px-8` | P0 | AC-7 | 7.4 | Asserts padding moved to header |

### Decision: Page-level tests for AC-7/AC-8 (DP-4)

**Decision (DP-4: test-only changes):** The story Task 11.3 states "No page-level tests needed for the header border-b." I decided to add page-level test scaffolds for AC-7 and AC-8 on 3 of the 4 depth-1 pages (settings, artifacts, conversations/[conversationId]) because:

1. The existing E2E tests verify behavior (breadcrumb visibility, h1 focus, tab order) but NOT CSS class presence (`border-b`, `border-surface-raised`, `flex items-center gap-3`)
2. Page-level tests with `renderToStaticMarkup` can verify the header className precisely and deterministically
3. The existing page tests already mock Breadcrumb as a render stub, so adding header structure assertions is low-cost
4. Testing 3 of 4 pages is sufficient — the header structure is identical across all 4 pages (same Task 7.3 template), and `conversations/new` is covered by E2E

This decision constrains future work: the dev should activate these scaffolds alongside the Breadcrumb component test, not rely solely on E2E.

### Decision: conversations/new/page.test.tsx not created (DP-4)

**Decision (DP-4: test-only changes):** I did NOT create `conversations/new/page.test.tsx`. The page requires auth, boundary-jwt, and ConversationPane mocks — significant setup for just 4 skipped header-structure tests. The header structure is identical to the other 3 pages (same Task 7.3 template), already tested there. The E2E suite covers conversations/new behavior (breadcrumb visibility, h1 focus). Creating a new test file for redundant header-structure assertions would be low-value, high-cost.

## Step 5: Validation & Completion

### TDD Red Phase Compliance

- [x] All generated tests use `it.skip()` (TDD red phase)
- [x] Tests assert EXPECTED behavior (will fail when un-skipped until implementation lands)
- [x] Scaffolds stay skipped until a developer activates the current task
- [x] Story file tasks amended to instruct activation of existing scaffolding (not creation)
- [x] No active passing tests generated (red phase only)
- [x] Existing wordmark test updated to assert new expected behavior (`bmad·easy`) and skipped

### Story File Amendments

- [x] Task 11 title changed from "Write/update co-located tests" to "Activate existing ATDD red-phase test scaffolds"
- [x] Task 11.1 subtasks amended to instruct removing `it.skip()` from existing describe blocks
- [x] Task 11.2 subtasks amended to instruct removing `it.skip()` from existing describe block
- [x] Task 11.3 amended to reflect page-level scaffolds already created for AC-7/AC-8
- [x] Task 12.2 updated to reference "activated ATDD scaffolds from Task 11"

### Checklist Validation

- [x] Prerequisites satisfied
- [x] Test files created/updated correctly
- [x] Checklist matches acceptance criteria (all 10 ACs covered)
- [x] Tests are generated as red-phase scaffolds marked with `it.skip()`
- [x] Story metadata and handoff paths captured
- [x] Temp artifacts stored in `_bmad-output/test-artifacts/`
- [x] E2E deferral check recorded (no browser-level mock adds value beyond component/page tests)
- [x] Regression guard check recorded (not applicable — no external command execution)

### Summary

- **Test files created/updated:** 5 (0 new, 5 updated)
- **Total test scaffolds:** 39 (all `it.skip()`)
  - SideNavigation.test.tsx: 25 (1 updated existing + 24 new)
  - Breadcrumb.test.tsx: 3
  - settings/page.test.tsx: 4
  - artifacts/page.test.tsx: 4
  - conversations/[conversationId]/page.test.tsx: 4 (minus 1 that's actually in the existing test's describe, so 4 new)
- **P0 scaffolds:** 39
- **P1 scaffolds:** 0
- **E2E scaffolds:** 0 (deferred — see E2E Deferral Check)
- **API scaffolds:** 0 (no API changes in this story)
- **Checklist output:** `_bmad-output/test-artifacts/atdd-checklist-5-2-fix-shared-shell-and-page-header-structural-drift.md`
- **Story file:** `_bmad-output/implementation-artifacts/5-2-fix-shared-shell-and-page-header-structural-drift.md`
- **Next recommended workflow:** `dev-story` (implement tasks, activate scaffolds one-by-one)
