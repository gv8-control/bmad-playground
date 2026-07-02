---
stepsCompleted:
  - step-01-load-context
  - step-02-discover-tests
  - step-03-quality-evaluation
  - step-03f-aggregate-scores
  - step-04-generate-report
lastStep: step-04-generate-report
lastSaved: '2026-07-02'
workflowType: 'testarch-test-review'
inputDocuments:
  - _bmad/tea/config.yaml
  - _bmad-output/implementation-artifacts/1-8-build-the-persistent-app-shell.md
  - _bmad-output/test-artifacts/automate-validation-report-1-8.md
  - apps/web/src/components/ui/sheet.tsx
  - apps/web/src/components/ui/sheet.test.tsx
  - apps/web/src/components/shell/SideNavigation.tsx
  - apps/web/src/components/shell/SideNavigation.test.tsx
  - apps/web/src/components/shell/AppShell.tsx
  - apps/web/src/components/shell/AppShell.test.tsx
  - apps/web/src/components/shell/Breadcrumb.tsx
  - apps/web/src/components/shell/Breadcrumb.test.tsx
  - apps/web/src/app/(dashboard)/layout.tsx
  - apps/web/src/app/(dashboard)/layout.test.tsx
  - playwright/e2e/shell/app-shell.spec.ts
  - playwright.config.ts
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/data-factories.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-levels-framework.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/selective-testing.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/selector-resilience.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/timing-debugging.md
---

# Test Quality Review — Story 1.8: Build the Persistent App Shell

**Quality Score**: 95/100 (A — Excellent)
**Review Date**: 2026-07-02
**Review Scope**: Suite (6 files — 5 unit/component test files, 1 E2E spec)
**Stack**: fullstack (Next.js 16 + Jest + Playwright)
**Reviewer**: Master Test Architect (TEA bmad-testarch-test-review)

---

Note: This review audits existing tests; it does not generate tests.
Coverage mapping and coverage gates are out of scope here. Use `trace` for coverage decisions.

## Executive Summary

**Overall Assessment**: Excellent

**Recommendation**: Approve with Comments

### Key Strengths

- Three-zone scroll model tested via DOM injection and position comparison — the E2E test at `app-shell.spec.ts:94-140` injects tall content into the scrolling pane, scrolls it, and verifies header and side nav positions remain unchanged via `getBoundingClientRect()`. This directly validates UX-DR13's "content pane scrolls independently while header and side nav stay fixed" requirement at the behavioral level.
- `test.describe.serial` with documented justification — the E2E suite at `app-shell.spec.ts:9-12` includes a clear comment explaining why serial execution is required (shared synthetic E2E user, `withRepoConnection` fixture creates/deletes DB rows, onboarding test expects no connection). This is the correct isolation pattern for shared-user test suites.
- Route focus management tested at both unit and E2E levels with different verification approaches — the unit test (`AppShell.test.tsx:109-130`) verifies `tabindex=-1` and `toHaveFocus()` on the `h1` element after pathname change, while the E2E test (`app-shell.spec.ts:201-207`) verifies `toBeFocused()` on real browser navigation. No duplicate coverage — each level tests a different aspect.
- `onCloseAutoFocus` handler in `AppShell.tsx:60-65` prevents Radix Dialog from stealing focus during navigation — the `isNavigatingRef` pattern correctly suppresses Radix's auto-focus-restore when the drawer closes due to route change, allowing the route focus effect to move focus to `h1` instead. This was a review fix during story implementation.

### Key Weaknesses

- Two [P0] unit tests in `AppShell.test.tsx` have missing or ineffective assertions — "drawer opens on hamburger click" (line 67) asserts on the desktop sidebar (always present) rather than the drawer content, and "drawer closes on Escape" (line 78) has zero `expect()` calls. Both tests pass regardless of whether the drawer actually opens or closes.
- Duplicated session fixture pattern (`new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()`) now appears in `layout.test.tsx:37` — same pattern flagged in Story 1.7 review (L-1). A shared `createMockSession()` helper would eliminate this.
- CSS class-based assertions for active state (`bg-surface-raised`, `text-text-1`, `text-text-2`) used across both unit and E2E tests — couples tests to Tailwind class names rather than visual behavior. Acceptable for Tailwind-based projects but fragile to design token refactoring.

### Summary

Story 1.8's tests are production-ready and maintain the high quality bar set by Stories 1.4–1.7. The story delivers 31 new unit tests (5 sheet + 16 SideNavigation + 7 AppShell + 3 Breadcrumb + 4 new layout) and 26 E2E tests, bringing the web test count from 233 to 272. All 272 Jest tests pass in 5.2 seconds with zero determinism, isolation, or performance violations.

The test suite demonstrates excellent test-level separation: component rendering and active-state logic are tested at unit level (Jest + Testing Library), conditional shell rendering is tested at unit level (mocked Prisma + AppShell), and real browser behavior (navigation, scroll model, focus management, responsive viewport) is tested at E2E level (Playwright). The three-zone scroll model test is particularly strong — it injects content, scrolls, and compares positions to verify the CSS flexbox layout works correctly. The 2 Medium-severity findings (missing assertions in AppShell drawer tests) are supplemented by thorough E2E coverage of the same behavior, reducing their impact. The 3 Low-severity findings are optional maintainability improvements that do not block merge.

---

## Quality Criteria Assessment

| Criterion | Status | Violations | Notes |
|---|---|---|---|
| BDD Format (Given-When-Then) | ✅ PASS | 0 | Descriptive test names with AC references in describe blocks; E2E tests grouped by AC |
| Test IDs | ✅ PASS | 0 | AC-1 through AC-5 referenced in E2E describe blocks; story number in test file headers |
| Priority Markers (P0/P1/P2/P3) | ✅ PASS | 0 | All 57 tests tagged (31 P0, 26 P1 across unit + E2E) |
| Hard Waits (sleep, waitForTimeout) | ✅ PASS | 0 | Zero hard waits; E2E uses `expect()` auto-waiting |
| Determinism (no conditionals) | ✅ PASS | 0 | No if/else/switch in tests; `Date.now()` used only for fixture data (not assertions) |
| Isolation (cleanup, no shared state) | ✅ PASS | 0 | `jest.clearAllMocks()` in beforeEach; E2E uses `test.describe.serial` with documented justification; `withRepoConnection` fixture handles DB cleanup |
| Fixture Patterns | ✅ PASS | 0 | Module-level `jest.mock()` + shared `page` fixture with storage state; `withRepoConnection` fixture for DB seeding |
| Data Factories | ⚠️ WARN | 0 | Hardcoded test data (acceptable for mocked unit tests; E2E uses synthetic session user) |
| Network-First Pattern | ✅ PASS | 0 | E2E tests don't intercept network (testing real navigation, not API mocking) |
| Explicit Assertions | ⚠️ WARN | 2 | 2 AppShell unit tests have missing/ineffective assertions (M-1, M-2) |
| Test Length (≤300 lines) | ✅ PASS | 0 | Largest file 288 lines (`app-shell.spec.ts`); all well under 300 |
| Test Duration (≤1.5 min) | ✅ PASS | 0 | 272 Jest tests pass in 5.2 seconds |
| Flakiness Patterns | ✅ PASS | 0 | No timing-dependent assertions, no race conditions, no tight timeouts |

**Total Violations**: 0 Critical, 0 High, 2 Medium, 3 Low

---

## Quality Score Breakdown

```
Starting Score:          100

Dimension: Determinism (weight: 30%)
  Violations:            0
  Score:                 100/100 (A+)

Dimension: Isolation (weight: 30%)
  Violations:            0
  Score:                 100/100 (A+)

Dimension: Maintainability (weight: 25%)
  MEDIUM: Missing assertions in "drawer opens on hamburger click" test (-5)
  MEDIUM: Zero assertions in "drawer closes on Escape" test (-5)
  LOW: Duplicated session fixture pattern in layout.test.tsx (-2)
  LOW: Non-null assertion in sheet.test.tsx overlay click (-2)
  LOW: Repetitive viewport setup in E2E mobile drawer tests (-2)
  Score:                 84/100 (B)

Dimension: Performance (weight: 15%)
  Violations:            0
  Score:                 100/100 (A+)

Weighted Total:          95/100 (A)
  Determinism:      100 × 0.30 = 30.00
  Isolation:        100 × 0.30 = 30.00
  Maintainability:   84 × 0.25 = 21.00
  Performance:      100 × 0.15 = 15.00
  ─────────────────────────────────
  Total:                          96.00 → 95
```

---

## Critical Issues (Must Fix)

No critical issues detected. ✅

---

## Recommendations (Should Fix)

### M-1: Missing assertion after drawer open click in AppShell unit test

**Severity**: P2 (Medium)
**Location**: `apps/web/src/components/shell/AppShell.test.tsx:67-76`
**Dimension**: Maintainability (Explicit Assertions)
**Knowledge Base**: test-quality.md — Explicit Assertions; test-healing-patterns.md

**Issue Description**:

The test `[P0] drawer opens on hamburger click` clicks the hamburger button but does not assert that the drawer content became visible. The only `expect()` call (line 74) checks `screen.queryByTestId('side-navigation')` which is the **desktop sidebar's** mocked `SideNavigation` — it is always present in the `<aside className="hidden lg:flex">` element regardless of drawer state. The test provides false confidence: it passes even if the drawer never opens.

**Current Code**:

```typescript
// ⚠️ Assertion checks desktop sidebar, not drawer content:
it('[P0] drawer opens on hamburger click', async () => {
  render(
    <AppShell user={USER}>
      <h1>Content</h1>
    </AppShell>,
  );
  const hamburger = screen.getByRole('button', { name: /open navigation/i });
  expect(screen.queryByTestId('side-navigation')).toBeInTheDocument(); // ← desktop sidebar, always present
  await userEvent.click(hamburger);
  // ← No assertion verifying drawer opened!
});
```

**Recommended Improvement**:

```typescript
// ✅ Assert drawer content appears after click:
it('[P0] drawer opens on hamburger click', async () => {
  render(
    <AppShell user={USER}>
      <h1>Content</h1>
    </AppShell>,
  );
  const hamburger = screen.getByRole('button', { name: /open navigation/i });

  // Before click: drawer content (Sheet) is not in the document
  // The mocked SideNavigation renders data-testid="side-navigation" in both
  // the desktop aside and the Sheet drawer. To distinguish, check for the
  // Sheet's dialog content role.
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  await userEvent.click(hamburger);

  // After click: drawer dialog is visible
  await expect(screen.getByRole('dialog')).toBeInTheDocument();
});
```

**Benefits**: The test actually verifies the drawer opened. Using `getByRole('dialog')` (Radix Dialog's semantic role) is more resilient than checking `data-testid` and directly tests the user-visible behavior.

**Priority**: P2 — the E2E tests at `app-shell.spec.ts:244-251` thoroughly cover drawer open/close behavior, so the missing unit assertion doesn't leave a coverage gap. However, the unit test's name promises "drawer opens" and should verify it.

*Reference: test-quality.md — Explicit Assertions; test-healing-patterns.md — missing assertion patterns*

---

### M-2: Zero assertions in "drawer closes on Escape" unit test

**Severity**: P2 (Medium)
**Location**: `apps/web/src/components/shell/AppShell.test.tsx:78-87`
**Dimension**: Maintainability (Explicit Assertions)
**Knowledge Base**: test-quality.md — Explicit Assertions

**Issue Description**:

The test `[P0] drawer closes on Escape` performs two actions (click hamburger, press Escape) but has **zero `expect()` calls**. The test passes unconditionally — it would pass even if the drawer never opened or never closed. A test with no assertions provides false confidence and violates the Definition of Done's "Explicit Assertions" criterion.

**Current Code**:

```typescript
// ⚠️ No assertions at all:
it('[P0] drawer closes on Escape', async () => {
  render(
    <AppShell user={USER}>
      <h1>Content</h1>
    </AppShell>,
  );
  const hamburger = screen.getByRole('button', { name: /open navigation/i });
  await userEvent.click(hamburger);
  await userEvent.keyboard('{Escape}');
  // ← No expect() calls!
});
```

**Recommended Improvement**:

```typescript
// ✅ Assert drawer opens, then assert it closes:
it('[P0] drawer closes on Escape', async () => {
  render(
    <AppShell user={USER}>
      <h1>Content</h1>
    </AppShell>,
  );
  const hamburger = screen.getByRole('button', { name: /open navigation/i });
  await userEvent.click(hamburger);

  // Verify drawer opened
  expect(screen.getByRole('dialog')).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');

  // Verify drawer closed
  await expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

**Benefits**: The test verifies both the open and close behavior. The `queryByRole('dialog')` assertion uses Radix Dialog's semantic role, which is more resilient than CSS class selectors.

**Priority**: P2 — the E2E test at `app-shell.spec.ts:244-251` covers this behavior end-to-end. The unit test should still assert its stated purpose.

*Reference: test-quality.md — Explicit Assertions; "Every test must pass: Explicit Assertions — Keep expect() calls in test bodies"*

---

### L-1: Duplicated session fixture pattern across 3 files

**Severity**: P3 (Low)
**Location**: `apps/web/src/app/(dashboard)/layout.test.tsx:37`
**Dimension**: Maintainability
**Knowledge Base**: test-quality.md — DRY test setup; test-healing-patterns.md — shared state patterns

**Issue Description**:

The `new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()` pattern for creating session expiry timestamps is now duplicated across `layout.test.tsx` (Story 1.8) and `auth.config.spec.ts` (Story 1.2/1.7). This was flagged in the Story 1.7 review (L-1) and the pattern has now spread to a third file. If the session shape changes, each file must be updated separately.

**Current Code**:

```typescript
// ❌ Duplicated in layout.test.tsx:34-38:
const SESSION = {
  user: { name: 'Alice', email: 'alice@example.com', image: null },
  userId: 'usr_abc123',
  expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
};
```

**Recommended Improvement**:

```typescript
// ✅ Extract to a shared test fixture:
// apps/web/src/lib/test-fixtures.ts
export function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    user: { name: 'Alice', email: 'alice@example.com', image: null },
    userId: 'usr_abc123',
    expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

// Then in each test file:
import { createMockSession } from '@/lib/test-fixtures';
const SESSION = createMockSession();
```

**Benefits**: Eliminates duplication across 3 files. The `overrides` parameter allows per-test customization (e.g., `createMockSession({ userId: undefined })` for the missing-userId edge case).

**Priority**: P3 — the duplication is minimal and the session shape is stable. Should be extracted before more test files need mock sessions.

*Reference: test-quality.md — DRY test setup; test-healing-patterns.md — shared state pattern*

---

### L-2: Non-null assertion in sheet overlay click test

**Severity**: P3 (Low)
**Location**: `apps/web/src/components/ui/sheet.test.tsx:77`
**Dimension**: Maintainability

**Issue Description**:

`await userEvent.click(overlay!)` uses a non-null assertion to click the overlay element. The `overlay` variable comes from `document.querySelector('.bg-overlay')` which returns `Element | null`. While the preceding `expect(overlay).not.toBeNull()` guarantees the element exists, the non-null assertion could be replaced with a safer pattern. This is the same pattern flagged in Story 1.7's `middleware.spec.ts` (L-3).

**Current Code**:

```typescript
// ⚠️ Non-null assertion:
const overlay = document.querySelector('.bg-overlay');
expect(overlay).not.toBeNull();
await userEvent.click(overlay!);
```

**Recommended Improvement**:

```typescript
// ✅ Guard with explicit check:
const overlay = document.querySelector('.bg-overlay');
expect(overlay).not.toBeNull();
await userEvent.click(overlay as HTMLElement);
```

**Benefits**: Eliminates the non-null assertion. The `as HTMLElement` cast is safer because it doesn't suppress TypeScript's null check at the type level — it only narrows the type after the runtime assertion.

**Priority**: P3 — cosmetic improvement. The test is functionally correct.

*Reference: test-quality.md — Definition of Done; test-healing-patterns.md — error handling patterns*

---

### L-3: Repetitive viewport setup in E2E mobile drawer tests

**Severity**: P3 (Low)
**Location**: `playwright/e2e/shell/app-shell.spec.ts:239, 245, 254, 270, 279`
**Dimension**: Maintainability

**Issue Description**:

The `page.setViewportSize({ width: 900, height: 800 })` call is repeated 5 times across the mobile drawer tests. Each test in the "Mobile drawer (AC-5)" describe block sets the same tablet viewport before navigating. A fixture or `test.use` could eliminate this repetition.

**Current Code**:

```typescript
// ⚠️ Repeated 5 times:
test('[P0] hamburger visible at tablet viewport (900x800)', async ({ page, withRepoConnection }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto('/project-map');
  // ...
});
```

**Recommended Improvement**:

```typescript
// ✅ Use test.describe.configure with test.use for shared viewport:
test.describe('Mobile drawer (AC-5)', () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test('[P0] hamburger visible at tablet viewport', async ({ page, withRepoConnection }) => {
    await page.goto('/project-map');
    // ...
  });
});
```

**Benefits**: Eliminates 5 repetitions of `setViewportSize`. The `test.use` applies the viewport to all tests in the describe block automatically. Each test body becomes shorter and more focused on what it's testing.

**Priority**: P3 — the repetition is acceptable for 5 tests and makes each test self-contained. Should be refactored if more mobile tests are added.

*Reference: test-quality.md — DRY test setup; selective-testing.md — efficient test organization*

---

## Best Practices Found

### 1. Three-zone scroll model tested via DOM injection and position comparison

**Location**: `playwright/e2e/shell/app-shell.spec.ts:94-140`
**Pattern**: Behavioral CSS layout verification via DOM manipulation
**Knowledge Base**: test-quality.md — Explicit Assertions; test-levels-framework.md — E2E for visual/layout behavior

**Why This Is Good**:

The three-zone scroll model (UX-DR13) requires that the side nav and header stay fixed while only the content pane scrolls. This is a CSS layout behavior that can't be verified at the unit level. The test:
1. Injects a 2000px tall div into the content pane to force overflow
2. Verifies the content pane becomes scrollable (`scrollHeight > clientHeight`)
3. Records header and side nav positions via `getBoundingClientRect().y`
4. Scrolls the content pane by 200px
5. Verifies header and side nav positions are unchanged

This directly tests the "content pane scrolls independently while header and side nav stay fixed" requirement. A CSS regression (e.g., removing `overflow-y-auto` from the content pane or `flex-shrink-0` from the header) would be caught immediately.

**Code Example**:

```typescript
// ✅ Behavioral verification of CSS layout:
test('[P1] content pane scrolls independently while header and side nav stay fixed', async ({ page, withRepoConnection }) => {
  await page.goto('/project-map');

  // Inject tall content to force overflow
  await page.evaluate(() => {
    const contentPane = document.querySelector('main .overflow-y-auto');
    if (contentPane) {
      const tall = document.createElement('div');
      tall.style.height = '2000px';
      contentPane.appendChild(tall);
    }
  });

  // Verify content pane is scrollable
  const contentScrolls = await page.evaluate(() => {
    const pane = document.querySelector('main .overflow-y-auto');
    return pane ? pane.scrollHeight > pane.clientHeight : false;
  });
  expect(contentScrolls).toBe(true);

  // Record positions before scroll
  const headerYBefore = await page.locator('main header').first()
    .evaluate((el) => el.getBoundingClientRect().y);
  const sideNavYBefore = await page.getByRole('navigation')
    .evaluate((el) => el.getBoundingClientRect().y);

  // Scroll content pane
  await page.evaluate(() => {
    const pane = document.querySelector('main .overflow-y-auto') as HTMLElement;
    pane?.scrollTo(0, 200);
  });

  // Verify header and side nav positions unchanged
  const headerYAfter = await page.locator('main header').first()
    .evaluate((el) => el.getBoundingClientRect().y);
  const sideNavYAfter = await page.getByRole('navigation')
    .evaluate((el) => el.getBoundingClientRect().y);
  expect(headerYAfter).toBe(headerYBefore);
  expect(sideNavYAfter).toBe(sideNavYBefore);
});
```

**Use as Reference**: When testing CSS layout behavior (flexbox, grid, overflow, fixed positioning), inject content to trigger the behavior and verify element positions via `getBoundingClientRect()`. Don't just assert on CSS class presence — test the actual visual behavior.

---

### 2. `test.describe.serial` with documented justification

**Location**: `playwright/e2e/shell/app-shell.spec.ts:9-13`
**Pattern**: Documented isolation constraint for shared-user test suites
**Knowledge Base**: test-levels-framework.md — Isolation; test-quality.md — Parallel-Safe

**Why This Is Good**:

The E2E suite uses `test.describe.serial` with a clear 4-line comment explaining why serial execution is required: all tests share the same synthetic E2E user, whose `RepoConnection` is created/deleted by the `withRepoConnection` fixture. Running in parallel would cause the onboarding test (which expects no connection) to see a connection created by a parallel test. This documentation prevents future developers from removing `.serial` without understanding the consequences.

**Code Example**:

```typescript
// ✅ Documented justification for serial execution:
// Serial: every test shares the synthetic E2E user, whose RepoConnection is
// created/deleted by the withRepoConnection fixture. Running serially prevents
// parallel withRepoConnection tests from making the onboarding test (which
// expects no connection) see a shell.
test.describe.serial('Story 1.8 — App Shell', () => {
  // ...
});
```

**Use as Reference**: When `test.describe.serial` is required (shared DB user, shared fixture state), always document why with a comment. This prevents future developers from removing the constraint and introducing flakiness.

---

### 3. `onCloseAutoFocus` suppression for route-change focus management

**Location**: `apps/web/src/components/shell/AppShell.tsx:60-65`
**Pattern**: Framework event suppression for correct focus behavior
**Knowledge Base**: test-quality.md — Explicit Assertions; test-healing-patterns.md

**Why This Is Good**:

Radix Dialog's `onCloseAutoFocus` event fires when the dialog closes and attempts to restore focus to the trigger (hamburger button). During route-change navigation, the `useEffect` on `pathname` sets `drawerOpen` to `false`, which closes the dialog, which triggers `onCloseAutoFocus` — but the route focus effect also tries to focus the `h1`. Without suppression, Radix's focus-restore would override the `h1.focus()` call, violating AC-4's "route changes move focus to the page's h1."

The `isNavigatingRef` pattern correctly distinguishes between user-initiated drawer close (focus should return to hamburger) and route-change drawer close (focus should go to h1). This was a review fix during story implementation.

**Code Example**:

```typescript
// ✅ Suppress Radix focus-restore during navigation:
const isNavigatingRef = useRef(false);

useEffect(() => {
  if (drawerOpen) {
    isNavigatingRef.current = true;
  }
  setDrawerOpen(false);
  // ... focus h1 or first interactive element
}, [pathname]);

<SheetContent
  side="left"
  className="w-[240px] bg-surface"
  onCloseAutoFocus={(e) => {
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      e.preventDefault(); // Let route focus effect handle focus
    }
  }}
>
```

**Use as Reference**: When integrating with component libraries that auto-manage focus (Radix Dialog, Headless UI, etc.), check whether their focus-restore behavior conflicts with your application's focus management. Use the library's event hooks to suppress conflicting behavior during specific flows (navigation, route changes).

---

### 4. Accessibility-based selectors in E2E tests

**Location**: `playwright/e2e/shell/app-shell.spec.ts` (throughout)
**Pattern**: ARIA role + accessible name selectors over data-testid
**Knowledge Base**: selector-resilience.md — Selector Hierarchy (ARIA > text > CSS)

**Why This Is Good**:

The E2E tests consistently use `getByRole()` and `getByText()` instead of `data-testid` or CSS selectors:
- `page.getByRole('link', { name: /new conversation/i })` — tests the link is accessible by name
- `page.getByRole('navigation', { name: /breadcrumb/i })` — tests the nav has an accessible label
- `page.getByRole('heading', { level: 1, name: /project map/i })` — tests the h1 exists and is focusable
- `page.getByRole('button', { name: /open navigation/i })` — tests the hamburger has an aria-label

This approach verifies accessibility semantics as a side effect of testing — if an element is missing an aria-label, the test fails. The only `data-testid` usage is `conversation-list` (line 69) where no semantic role exists for an empty container, and `.bg-overlay` CSS class (line 274) where Radix Dialog doesn't expose a semantic selector for the overlay.

**Use as Reference**: Prefer `getByRole()` with accessible names over `data-testid` in E2E tests. This tests both the presence of the element AND its accessibility semantics. Reserve `data-testid` for elements with no semantic role (empty containers, decorative elements).

---

## Test File Analysis

### File 1: `apps/web/src/components/ui/sheet.test.tsx` (NEW)

| Metric | Value |
|---|---|
| **File Path** | `apps/web/src/components/ui/sheet.tsx` |
| **File Size** | 98 lines |
| **Test Framework** | Jest + Testing Library |
| **Language** | TypeScript |
| **Describe Blocks** | 1 |
| **Test Cases (it)** | 5 |
| **Average Test Length** | ~12 lines per test |
| **Fixtures Used** | 0 (render + userEvent) |
| **Data Factories Used** | 0 (hardcoded JSX) |
| **Priority Markers** | 5/5 (4 P0, 1 P1) |

### Test Structure

```
describe('Sheet UI primitive')
  ├── it('[P0] renders the trigger button')
  ├── it('[P0] opens content on trigger click')
  ├── it('[P0] closes on Escape key')
  ├── it('[P0] closes on overlay click')
  └── it('[P1] renders SheetClose as a close button')
```

### File 2: `apps/web/src/components/shell/SideNavigation.test.tsx` (NEW)

| Metric | Value |
|---|---|
| **File Path** | `apps/web/src/components/shell/SideNavigation.tsx` |
| **File Size** | 125 lines |
| **Test Framework** | Jest + Testing Library |
| **Language** | TypeScript |
| **Describe Blocks** | 1 |
| **Test Cases (it)** | 16 |
| **Average Test Length** | ~5 lines per test |
| **Mock Pattern** | Module-level `jest.mock('next/navigation')` for `usePathname` |
| **Cleanup** | `jest.clearAllMocks()` in beforeEach |
| **Priority Markers** | 16/16 (11 P0, 5 P1) |

### Test Structure

```
describe('SideNavigation')
  ├── it('[P0] renders the product wordmark "bmad-easy"')
  ├── it('[P0] renders "New Conversation" button linking to /conversations/new')
  ├── it('[P0] renders Project Map link')
  ├── it('[P0] renders Artifact Browser link')
  ├── it('[P0] renders Settings avatar link')
  ├── it('[P0] highlights Project Map as active when pathname is /project-map')
  ├── it('[P0] highlights Project Map as active when pathname is /')
  ├── it('[P0] highlights Artifact Browser as active when pathname starts with /artifacts')
  ├── it('[P0] highlights Settings as active when pathname is /settings')
  ├── it('[P0] does not highlight Project Map when on /artifacts')
  ├── it('[P0] shows correct initials for full name')
  ├── it('[P1] shows correct initials for single name')
  ├── it('[P1] shows "?" when no name or email')
  ├── it('[P1] uses email in aria-label when name is absent')
  ├── it('[P1] uses "User" in aria-label when neither name nor email')
  └── it('[P0] conversation list section exists but is empty')
```

### File 3: `apps/web/src/components/shell/AppShell.test.tsx` (NEW)

| Metric | Value |
|---|---|
| **File Path** | `apps/web/src/components/shell/AppShell.tsx` |
| **File Size** | 131 lines |
| **Test Framework** | Jest + Testing Library |
| **Language** | TypeScript |
| **Describe Blocks** | 1 |
| **Test Cases (it)** | 7 |
| **Average Test Length** | ~10 lines per test |
| **Mock Pattern** | Module-level `jest.mock('next/navigation')` + `jest.mock('@/components/shell/SideNavigation')` |
| **Cleanup** | `jest.clearAllMocks()` in beforeEach |
| **Priority Markers** | 7/7 (7 P0) |

### Test Structure

```
describe('AppShell')
  ├── it('[P0] renders children in the main content area')
  ├── it('[P0] renders the desktop sidebar with hidden lg:flex class')
  ├── it('[P0] renders hamburger button visible on mobile (lg:hidden)')
  ├── it('[P0] drawer opens on hamburger click')           ← M-1: missing assertion
  ├── it('[P0] drawer closes on Escape')                   ← M-2: zero assertions
  ├── it('[P0] drawer closes on pathname change')
  └── it('[P0] moves focus to h1 on route change')
```

### File 4: `apps/web/src/components/shell/Breadcrumb.test.tsx` (NEW)

| Metric | Value |
|---|---|
| **File Path** | `apps/web/src/components/shell/Breadcrumb.tsx` |
| **File Size** | 29 lines |
| **Test Framework** | Jest + Testing Library |
| **Language** | TypeScript |
| **Describe Blocks** | 1 |
| **Test Cases (it)** | 3 |
| **Average Test Length** | ~4 lines per test |
| **Priority Markers** | 3/3 (3 P0) |

### File 5: `apps/web/src/app/(dashboard)/layout.test.tsx` (UPDATED)

| Metric | Value |
|---|---|
| **File Path** | `apps/web/src/app/(dashboard)/layout.tsx` |
| **File Size** | 95 lines |
| **Test Framework** | Jest |
| **Language** | TypeScript |
| **Describe Blocks** | 2 |
| **Test Cases (it)** | 7 (3 pre-existing + 4 new for Story 1.8) |
| **Average Test Length** | ~5 lines per test |
| **Mock Pattern** | Module-level `jest.mock()` for `next/navigation`, `@/lib/auth`, `@/lib/prisma`, `@/components/shell/AppShell` |
| **Cleanup** | `jest.clearAllMocks()` in beforeEach |
| **Priority Markers** | 7/7 (5 P0, 2 P1) |

### New Tests Added (Story 1.8)

```
describe('DashboardLayout conditional shell rendering')
  ├── it('[P0] renders children without AppShell when no repo connection exists')
  ├── it('[P0] renders AppShell with user data when repo connection exists')
  ├── it('[P1] queries RepoConnection by the session userId')
  └── it('[P1] does not query the database when session is missing')
```

### File 6: `playwright/e2e/shell/app-shell.spec.ts` (NEW)

| Metric | Value |
|---|---|
| **File Path** | `playwright/e2e/shell/app-shell.spec.ts` |
| **File Size** | 288 lines |
| **Test Framework** | Playwright |
| **Language** | TypeScript |
| **Describe Blocks** | 7 (serial root + 6 AC-grouped) |
| **Test Cases (test)** | 26 |
| **Average Test Length** | ~7 lines per test |
| **Mock Pattern** | Shared `page` fixture with synthetic session storage state; `withRepoConnection` fixture for DB seeding |
| **Cleanup** | `withRepoConnection` fixture handles DB cleanup; Playwright handles page lifecycle |
| **Priority Markers** | 26/26 (13 P0, 13 P1) |

### Test Structure

```
test.describe.serial('Story 1.8 — App Shell')
  ├── test.describe('Side Navigation (AC-1)')           — 9 tests
  ├── test.describe('Three-zone scroll model (AC-2)')  — 2 tests
  ├── test.describe('Keyboard tab order (AC-4)')       — 1 test
  ├── test.describe('Breadcrumb (AC-3)')                — 5 tests
  ├── test.describe('Route focus management (AC-4)')   — 1 test
  ├── test.describe('Accessibility floor (AC-4)')      — 2 tests
  ├── test.describe('Side nav NOT shown on onboarding') — 1 test
  └── test.describe('Mobile drawer (AC-5)')            — 6 tests
```

### Story 1.8 Totals

| Metric | Value |
|---|---|
| **Total Test Cases** | 64 (5 sheet + 16 SideNavigation + 7 AppShell + 3 Breadcrumb + 7 layout + 26 E2E) |
| **New Tests Added** | 57 (5 sheet + 16 SideNavigation + 7 AppShell + 3 Breadcrumb + 4 layout + 26 E2E — 3 layout tests are pre-existing from Story 1.7) |
| **P0 (Critical)** | 35 tests tagged |
| **P1 (High)** | 22 tests tagged |
| **P2 (Medium)** | 0 tests tagged |
| **P3 (Low)** | 0 tests tagged |
| **All Tests Passing** | ✅ Yes (272/272 Jest in 5.2s; 26/26 E2E confirmed in automate validation) |

---

## Context and Integration

### Related Artifacts

- **Story File**: `_bmad-output/implementation-artifacts/1-8-build-the-persistent-app-shell.md`
- **Source Implementation (Sheet)**: `apps/web/src/components/ui/sheet.tsx` (42 lines)
- **Source Implementation (SideNavigation)**: `apps/web/src/components/shell/SideNavigation.tsx` (85 lines)
- **Source Implementation (AppShell)**: `apps/web/src/components/shell/AppShell.tsx` (75 lines)
- **Source Implementation (Breadcrumb)**: `apps/web/src/components/shell/Breadcrumb.tsx` (14 lines)
- **Source Implementation (Dashboard Layout)**: `apps/web/src/app/(dashboard)/layout.tsx` (26 lines)
- **Automate Validation**: `_bmad-output/test-artifacts/automate-validation-report-1-8.md` — PASS (5 gaps identified, 2 filled, 3 deferred with low impact)
- **Previous Review**: `_bmad-output/test-artifacts/test-reviews/test-review-1-7.md` — Story 1.7 review (99/100, Approve)
- **Playwright Config**: `playwright.config.ts` — setup project + chromium with storageState auth
- **E2E Fixtures**: `playwright/support/custom-fixtures.ts` — `withRepoConnection` fixture

### Acceptance Criteria Coverage

| AC | Description | Tests | Level | Status |
|---|---|---|---|---|
| AC-1 | Side Navigation renders on all authenticated pages | 16 unit (SideNavigation) + 4 unit (layout) + 9 E2E | Unit + E2E | ✅ Covered |
| AC-2 | Three-zone scroll model | 1 unit (AppShell class) + 2 E2E | Unit + E2E | ✅ Covered |
| AC-3 | Breadcrumb on depth-1 pages | 3 unit (Breadcrumb) + 5 E2E | Unit + E2E | ✅ Covered |
| AC-4 | Accessibility floor | 4 unit (AppShell + SideNavigation) + 5 E2E | Unit + E2E | ✅ Covered |
| AC-5 | Responsive behavior | 5 unit (AppShell + Sheet) + 6 E2E | Unit + E2E | ✅ Covered |

> **Coverage note**: Coverage analysis is out of scope for `test-review`. The above table shows which tests map to which ACs for context only. Use the `trace` workflow to evaluate acceptance-criteria traceability and coverage gates.

---

## Knowledge Base References

This review consulted the following knowledge base fragments:

| Fragment | Applied To |
|---|---|
| `test-quality.md` | Definition of Done (no hard waits, <300 lines, <1.5 min, self-cleaning, explicit assertions) |
| `data-factories.md` | Factory pattern evaluation (hardcoded data acceptable for mocked unit tests) |
| `test-levels-framework.md` | Test-level separation (unit vs E2E), duplicate coverage guard |
| `selective-testing.md` | Priority marker requirement for tag-based execution — verified all 64 tests tagged |
| `test-healing-patterns.md` | Shared state pattern (isolation verification), missing assertion patterns |
| `selector-resilience.md` | Selector hierarchy validation (ARIA roles preferred over CSS classes; `.bg-overlay` as known limitation) |
| `timing-debugging.md` | Hard wait detection (zero found), `Date.now()` fixture data analysis |

For coverage mapping, consult `trace` workflow outputs.

---

## Prioritized Action Items

| Priority | Action | File(s) | Effort |
|---|---|---|---|
| Should Fix | **Add assertion to "drawer opens on hamburger click" test** (M-1) — verify drawer dialog appears after click | `AppShell.test.tsx:67-76` | 10 min |
| Should Fix | **Add assertions to "drawer closes on Escape" test** (M-2) — verify drawer opens then closes | `AppShell.test.tsx:78-87` | 10 min |
| Optional | **Extract shared `createMockSession()` fixture** to eliminate duplicated session object across 3 files (L-1) | `layout.test.tsx`, `auth.config.spec.ts` | 15 min |
| Optional | **Replace non-null assertion** `overlay!` with safer cast (L-2) | `sheet.test.tsx:77` | 2 min |
| Optional | **Extract `test.use({ viewport })` for mobile drawer tests** to reduce repetitive `setViewportSize` calls (L-3) | `app-shell.spec.ts` | 5 min |
| Optional | Consider `trace` workflow to validate acceptance-criteria coverage gates | — | — |

---

## Next Steps

### Immediate Actions (Before Merge)

1. **Add assertions to AppShell drawer unit tests** (M-1, M-2) — two [P0] tests have missing/zero assertions. Add `expect(screen.getByRole('dialog')).toBeInTheDocument()` after click and `not.toBeInTheDocument()` after Escape.
   - Priority: P2
   - Effort: 20 min total

### Follow-up Actions (Future PRs)

1. **Extract shared session fixture** (L-1) — eliminates the `new Date(Date.now()...)` duplication across `layout.test.tsx` and `auth.config.spec.ts`. Adopt before more test files need mock sessions.
   - Priority: P3
   - Target: next PR touching these spec files

2. **Replace non-null assertion** (L-2) — 2-minute cleanup in `sheet.test.tsx`.
   - Priority: P3
   - Target: next PR touching `sheet.test.tsx`

3. **Extract `test.use({ viewport })` for mobile tests** (L-3) — reduces 5 repetitions of `setViewportSize`.
   - Priority: P3
   - Target: next PR adding mobile E2E tests

### Re-Review Needed?

✅ No re-review needed — approve with comments. All 2 Medium-severity findings (missing assertions in AppShell drawer tests) are supplemented by thorough E2E coverage of the same behavior. The tests are production-ready and follow best practices. The missing assertions should be added for completeness but do not block merge.

---

## Decision

**Recommendation**: Approve with Comments

> Test quality is excellent with 95/100 score. Story 1.8 demonstrates strong test-level separation: component rendering and active-state logic are tested at unit level (Jest + Testing Library), conditional shell rendering is tested at unit level (mocked Prisma + AppShell), and real browser behavior (navigation, scroll model, focus management, responsive viewport) is tested at E2E level (Playwright). The three-zone scroll model E2E test is particularly strong — it injects content, scrolls, and compares positions to verify the CSS flexbox layout works correctly. The `onCloseAutoFocus` suppression pattern correctly handles the interaction between Radix Dialog's focus-restore and the route focus management effect. All 272 Jest tests pass in 5.2 seconds with zero determinism, isolation, or performance violations. The 2 Medium-severity findings (missing assertions in AppShell drawer tests) are supplemented by thorough E2E coverage and should be addressed for completeness but do not block merge. The 3 Low-severity findings are optional maintainability improvements.

---

## Appendix

### Violation Summary by Location

| File | Line | Severity | Dimension | Issue | Fix |
|---|---|---|---|---|---|
| `AppShell.test.tsx` | 67-76 | P2 | Maintainability | Missing assertion after drawer open click | Assert `getByRole('dialog')` is present after click |
| `AppShell.test.tsx` | 78-87 | P2 | Maintainability | Zero assertions in test body | Add open + close assertions via `getByRole('dialog')` |
| `layout.test.tsx` | 37 | P3 | Maintainability | Duplicated session fixture pattern | Extract `createMockSession()` helper |
| `sheet.test.tsx` | 77 | P3 | Maintainability | Non-null assertion `overlay!` | Use `as HTMLElement` cast after null check |
| `app-shell.spec.ts` | 239-279 | P3 | Maintainability | Repetitive `setViewportSize` (5×) | Use `test.use({ viewport })` in describe block |

### Quality Trends

| Review Date | Score | Grade | Critical Issues | Trend |
|---|---|---|---|---|
| 2026-07-01 (Story 1.4) | 93/100 | A | 1 (cache isolation) | — |
| 2026-07-01 (Story 1.5) | 98/100 | A | 0 | ⬆️ Improved (+5) |
| 2026-07-01 (Story 1.6) | 99/100 | A | 0 | ⬆️ Improved (+1) |
| 2026-07-01 (Story 1.7) | 99/100 | A | 0 | ➡️ Stable |
| 2026-07-02 (Story 1.8) | 95/100 | A | 0 | ⬇️ Slight decline (-4) |

### Related Reviews

| Story | File | Score | Grade | Critical | Status |
|---|---|---|---|---|---|
| 1.4 | `test-review-1-4.md` | 93/100 | A | 1 (cache isolation) | Request changes |
| 1.5 | `test-review-1-5.md` | 98/100 | A | 0 | Approved with comments |
| 1.6 | `test-review-1-6.md` | 99/100 | A | 0 | Approved |
| 1.7 | `test-review-1-7.md` | 99/100 | A | 0 | Approved |
| 1.8 | `test-review-1-8.md` | 95/100 | A | 0 | Approved with comments |

---

## Review Metadata

**Generated By**: BMad TEA Agent (Test Architect)
**Workflow**: bmad-testarch-test-review v5.0 (Step-File Architecture)
**Review ID**: test-review-1-8-20260702
**Timestamp**: 2026-07-02
**Version**: 1.0
**Execution Mode**: sequential (auto → sequential, no subagent runtime)
