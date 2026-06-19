---
stepsCompleted:
  - step-01-load-context
  - step-02-discover-tests
  - step-03-quality-evaluation
  - step-03f-aggregate-scores
  - step-04-generate-report
lastStep: step-04-generate-report
lastSaved: '2026-06-19'
inputDocuments:
  - _bmad/tea/config.yaml
  - _bmad-output/test-artifacts/atdd-checklist-1-2-sign-in-with-github.md
  - _bmad-output/test-artifacts/atdd-checklist-1-3-connect-a-repository-by-url.md
  - playwright.config.ts
  - playwright/auth.setup.ts
  - playwright/e2e/auth/sign-in.spec.ts
  - playwright/e2e/onboarding/onboarding.spec.ts
  - apps/web/src/lib/auth.config.spec.ts
  - apps/web/src/lib/auth.integration.spec.ts
  - apps/web/src/lib/auth.credential.spec.ts
  - apps/web/src/lib/crypto.test.ts
  - apps/web/src/actions/repo-connection.actions.spec.ts
  - apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx
---

# Test Quality Review — Sprint 1 (Stories 1.2 & 1.3)

**Review date:** 2026-06-19
**Scope:** Suite (all tests — Stories 1.2 Sign In with GitHub, 1.3 Connect a Repository by URL)
**Stack:** fullstack (Next.js 15 + NestJS + Playwright + Jest/RTL)
**Playwright Utils:** `@seontechnologies/playwright-utils` enabled (Full UI+API profile)
**Reviewer:** Master Test Architect (TEA bmad-testarch-test-review)

---

## Overall Quality Score

| Metric | Value |
|---|---|
| **Overall Score** | **92 / 100** |
| **Grade** | **A** |
| **Quality Assessment** | Excellent — production-ready test suite with minor improvements available |
| **Recommendation** | ✅ **Approve with comments** |

### Dimension Breakdown

| Dimension | Score | Grade | Weight | Contribution |
|---|---|---|---|---|
| Determinism | 88 | B+ | 30% | 26.4 |
| Isolation | 97 | A | 30% | 29.1 |
| Maintainability | 87 | B+ | 25% | 21.75 |
| Performance | 96 | A | 15% | 14.4 |
| **Weighted Total** | **92** | **A** | 100% | 91.65 |

> **Coverage note:** Coverage analysis is out of scope for `test-review`. Use the `trace` workflow to evaluate acceptance-criteria traceability and coverage gates.

---

## Violation Summary

| Severity | Count |
|---|---|
| HIGH | 0 |
| MEDIUM | 3 |
| LOW | 4 |
| **Total** | **7** |

No HIGH severity violations. All 3 MEDIUM violations are in currently-skipped tests and will only matter when GitHub credentials are configured.

---

## Executive Summary

### Strengths

- **Zero hard waits in active tests.** All 76 active tests use deterministic waits (`waitForResponse`, `toHaveURL`, `findByRole`, `waitFor`). The Playwright config correctly sets `actionTimeout: 15_000` and `navigationTimeout: 30_000`.
- **Excellent test isolation.** Every Jest file pairs `process.env` mutations with `afterEach` cleanup. Playwright E2E tests use `browser.newContext()` with `try/finally` to guarantee context teardown even on failure.
- **Correct playwright-utils integration.** `auth.setup.ts` uses `@seontechnologies/playwright-utils/auth-session` (`authStorageInit`, `getStorageStatePath`). Merged fixtures are consumed correctly from `../../support/merged-fixtures`.
- **Security-sensitive assertions are explicit.** `[P0] raw access token is never placed in the JWT cookie` and `[P0] decrypted access token is NEVER returned to the client` both use `JSON.stringify(result).not.toContain(token)` — the right approach for verifying absence of sensitive data in response objects.
- **Strong mock discipline.** All Jest tests mock external dependencies (Prisma, fetch, crypto, next-auth) and use `jest.clearAllMocks()` in `beforeEach`. The `capturedConfig` pattern (side-effect import to capture NextAuth config) is well-executed across `auth.integration.spec.ts` and `auth.credential.spec.ts`.
- **Accessibility assertions present.** The RTL component tests verify `role="alert"`, `aria-describedby`, and `getByLabelText` — aligning with UX-DR14/UX-DR16 requirements.
- **All tests within size limits.** No file exceeds 282 lines (limit: 300). No individual test exceeds ~40 lines.
- **Parallel-safe config.** `fullyParallel: true`, `retries: 2` in CI, `trace: retain-on-failure`. Well-structured for parallelized E2E runs.

### Weaknesses

- **Boilerplate duplication in E2E tests.** The `browser.newContext() / try/finally / context.close()` pattern appears 7 times across `sign-in.spec.ts` (6×) and `onboarding.spec.ts` (1×). Extracting to an `unauthenticatedPage` fixture would eliminate ~35 lines and make the intent explicit.
- **Two deferred timing issues in skipped tests.** When GitHub credentials are eventually configured, two skipped tests will need fixes before activation: the `setTimeout`-based route delay (`onboarding.spec.ts:119`) and the `Date.now()` cookie maxAge assertion (`sign-in.spec.ts:166`).
- **One static fixture value is time-dependent.** `authenticatedSession.expires` in `auth.config.spec.ts:52` is set dynamically with `new Date(Date.now() + ...)`. Since no test asserts on this value it's harmless today, but a fixed ISO string would be more correct.

---

## Violations

### MEDIUM — Fix Before Activating Skipped Tests

#### M-1: setTimeout hard wait inside route handler
**File:** `playwright/e2e/onboarding/onboarding.spec.ts` **Line 119**
**Dimension:** Determinism

The `'[P1] "Validating…" appears on the button immediately after form submission'` test uses `setTimeout(resolve, 3_000)` inside `page.route()` to hold the Server Action response, giving the test time to observe the pending UI state. This creates a 3-second hard wait that runs on every CI invocation.

```typescript
// ❌ Current (in test.skip block — fix before activating):
await page.route('**/onboarding**', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  await route.continue();
});
```

```typescript
// ✅ Recommended: Use a controlled deferred promise the test controls
let releaseRoute!: () => void;
const routeHeld = new Promise<void>((resolve) => { releaseRoute = resolve; });

await page.route('**/onboarding**', async (route) => {
  await routeHeld;          // waits until test releases it
  await route.continue();
});

await page.getByLabel(/repository url/i).fill('https://github.com/a/b');
await page.getByRole('button', { name: /connect repository/i }).click();

// Assert the pending state BEFORE releasing the route
await expect(page.getByRole('button', { name: /validating/i })).toBeVisible();

// Now release the route and let the action complete
releaseRoute();
```

*Reference: test-quality.md — No Hard Waits; test-healing-patterns.md — Hard Wait Pattern*

---

#### M-2: Date.now() in cookie maxAge assertion
**File:** `playwright/e2e/auth/sign-in.spec.ts` **Line 166**
**Dimension:** Determinism

The `'[P0] session cookie maxAge is at least 8 hours'` test computes the expected expiry floor using `Date.now()` at assertion time. Since the cookie was set during `auth.setup.ts` (which runs earlier), small clock drifts between the setup and assertion can cause false failures in slow CI environments.

```typescript
// ❌ Current (in test.skip block):
const eightHoursFromNow = Date.now() / 1000 + 8 * 60 * 60 - 60; // -60s tolerance
```

```typescript
// ✅ Recommended: Anchor to the pre-auth timestamp
// Capture before the auth setup (or at test start for skipped tests):
const TEST_START_SECONDS = Math.floor(Date.now() / 1000);
const MIN_EXPIRY_SECONDS = TEST_START_SECONDS + 8 * 60 * 60;

// Assertion:
expect(sessionCookie!.expires).toBeGreaterThan(MIN_EXPIRY_SECONDS - 60);
```

*Reference: test-quality.md — No Conditionals/Random; test-healing-patterns.md — Dynamic Data Pattern*

---

#### M-3: Repeated browser.newContext() boilerplate
**File:** `playwright/e2e/auth/sign-in.spec.ts` (6 instances) + `playwright/e2e/onboarding/onboarding.spec.ts` (1 instance)
**Dimension:** Maintainability

Every unauthenticated Playwright test manually creates and tears down a fresh browser context. This 5-line boilerplate repeated 7 times is the single largest structural improvement available in this suite.

```typescript
// ❌ Current — repeated in every active E2E test:
const context = await browser.newContext();
const page = await context.newPage();
try {
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  // ...
} finally {
  await context.close();
}
```

```typescript
// ✅ Recommended — add to playwright/support/custom-fixtures.ts:
import { test as base } from '@playwright/test';

export const test = base.extend<{ unauthenticatedPage: import('@playwright/test').Page }>({
  unauthenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext(); // no storageState
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

// Then in merged-fixtures.ts — add to mergeTests() call.

// Tests become:
test('[P0] visiting / redirects to /sign-in', async ({ unauthenticatedPage }) => {
  await unauthenticatedPage.goto('/');
  await expect(unauthenticatedPage).toHaveURL(/\/sign-in/);
});
```

This reduces `sign-in.spec.ts` by ~35 lines and makes the intent of the test explicit: it needs an unauthenticated session.

*Reference: fixtures-composition.md — mergeTests composition; overview.md — Fixture Shell pattern*

---

### LOW — Nice to Fix

#### L-1: Magic -60 tolerance in cookie maxAge test
**File:** `playwright/e2e/auth/sign-in.spec.ts` **Line 166**

```typescript
// ❌ Unexplained:
const eightHoursFromNow = Date.now() / 1000 + 8 * 60 * 60 - 60; // -60s tolerance

// ✅ Named constant:
const CLOCK_SKEW_TOLERANCE_SECONDS = 60;
const minExpiry = Date.now() / 1000 + 8 * 60 * 60 - CLOCK_SKEW_TOLERANCE_SECONDS;
```

---

#### L-2: Dynamic date in static session fixture
**File:** `apps/web/src/lib/auth.config.spec.ts` **Line 52**

```typescript
// ❌ Dynamic (harmless, no assertion on this value):
expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),

// ✅ Static:
expires: '2099-12-31T00:00:00.000Z',
```

---

#### L-3: global.fetch assignment at module scope
**File:** `apps/web/src/actions/repo-connection.actions.spec.ts` **Line 36**

```typescript
// ❌ Module-scope mutation (standard Jest pattern but advisory):
global.fetch = mockFetch;

// ✅ Stronger isolation:
beforeEach(() => {
  jest.spyOn(global, 'fetch').mockImplementation(mockFetch);
});
afterEach(() => {
  jest.restoreAllMocks();
});
```

Jest's per-file module isolation makes this safe today, but `spyOn` + `restoreAllMocks` is more defensive and signals intent clearly.

---

#### L-4: Response-collection logic in test body (skipped test)
**File:** `playwright/e2e/onboarding/onboarding.spec.ts` **Line 196–205**

The `'[P1] encrypted token is never visible in the browser'` test collects all response bodies with a `page.on('response', ...)` listener with try/catch. Before activation, move this to a helper fixture or a helper function:

```typescript
// ✅ Extract to helper:
async function collectResponseBodies(page: Page): Promise<() => string[]> {
  const bodies: string[] = [];
  page.on('response', async (r) => {
    try { bodies.push(await r.text()); } catch { /* non-text responses */ }
  });
  return () => bodies;
}

// In test:
const getResponseBodies = await collectResponseBodies(page);
// ... perform action ...
expect(getResponseBodies().join('\n')).not.toMatch(/gho_[A-Za-z0-9]+/);
```

---

## Best Practices Highlighted

These patterns in the current suite exemplify best practice and should be retained and replicated:

### 1. Explicit absence assertions for sensitive data
```typescript
// auth.credential.spec.ts:163 — verifies token never leaks into JWT
expect(JSON.stringify(result)).not.toContain('gho_real_access_token');

// repo-connection.actions.spec.ts:279 — verifies decrypted token never returned
expect(JSON.stringify(result)).not.toContain(DECRYPTED_TOKEN);
```
*Pattern: `JSON.stringify(result).not.toContain(secret)` is the correct way to test for absence of sensitive values in complex return objects.*

### 2. Call-order verification via mock implementation array
```typescript
// auth.credential.spec.ts:178 — verifies user upsert happens before credential upsert
const callOrder: string[] = [];
mockUserUpsert.mockImplementation(() => { callOrder.push('userUpsert'); ... });
mockOAuthCredentialUpsert.mockImplementation(() => { callOrder.push('credentialUpsert'); ... });
// ...
expect(callOrder).toEqual(['userUpsert', 'credentialUpsert']);
```
*Pattern: A `callOrder` array populated by mock implementations is the cleanest way to assert execution ordering in async flows.*

### 3. capturedConfig side-effect import pattern
```typescript
// auth.integration.spec.ts:40–49 — captures NextAuth config without a real Auth.js runtime
jest.mock('next-auth', () => ({ __esModule: true, default: jest.fn((_config) => {...}) }));
import './auth'; // side-effect triggers NextAuth(config) call
const capturedConfig = (NextAuth as jest.Mock).mock.calls[0]?.[0];
```
*Pattern: Correct approach for testing configuration passed to framework wrappers when a real runtime isn't available.*

### 4. Playwright ARIA role selectors throughout E2E tests
```typescript
await page.getByRole('button', { name: 'Sign in with GitHub' })
await page.getByRole('alert')
await page.getByLabel(/repository url/i)
```
*Pattern: Consistent use of semantic selectors aligned with selector-resilience.md hierarchy (ARIA > text > CSS).*

### 5. auth-session utility correctly integrated
```typescript
// auth.setup.ts:2-3 — correct use of playwright-utils auth-session
import { authStorageInit, getStorageStatePath } from '@seontechnologies/playwright-utils/auth-session';
authStorageInit(); // creates storage directory before any worker
const storagePath = getStorageStatePath({ environment: 'local', userIdentifier: 'default' });
```
*Pattern: `authStorageInit()` before any test runs, `getStorageStatePath()` for consistent path resolution — exactly as auth-session.md documents.*

---

## Quality Criteria Assessment

| Criterion | Status | Notes |
|---|---|---|
| No hard waits (active tests) | ✅ PASS | Zero `waitForTimeout` in all 76 active tests |
| Deterministic patterns | ⚠️ WARN | 2 deferred MEDIUM issues in skipped tests |
| Test isolation | ✅ PASS | `afterEach` cleanup, `browser.newContext()` teardown |
| Global state cleanup | ✅ PASS | `process.env` mutations restored; `jest.clearAllMocks()` everywhere |
| Fixture patterns | ✅ PASS | `merged-fixtures.ts`, `auth-session` utility correct |
| Test length (< 300 lines/file) | ✅ PASS | Largest file: 282 lines |
| Individual test length (< 100 lines) | ✅ PASS | All individual tests well within limit |
| Assertions explicit in test body | ✅ PASS | No hidden `expect()` in helpers |
| ARIA/semantic selectors | ✅ PASS | `getByRole`, `getByLabel`, `getByText` throughout |
| Priority markers (P0/P1/P2) | ✅ PASS | All 93 tests tagged |
| `@jest-environment node` for server code | ✅ PASS | All 5 Jest files declare this correctly |
| Parallel-safe config | ✅ PASS | `fullyParallel: true`, no serial constraints |
| Trace / failure artifacts | ✅ PASS | `trace: retain-on-failure`, `screenshot: only-on-failure` |
| Auth session reuse | ✅ PASS | `storageState` from setup project; `authStorageInit()` correct |
| Boilerplate duplication | ⚠️ WARN | `browser.newContext()` pattern repeated 7× |
| Factory pattern for test data | ℹ️ N/A | Server mocked at boundary — no data factories needed at this level |
| Network-first (intercept before navigate) | ✅ PASS | No `page.goto` before route interception in active tests |

---

## Test Counts by Status

| Story | Level | File | Total | Active | Skipped | Status |
|---|---|---|---|---|---|---|
| 1.2 | E2E | `playwright/e2e/auth/sign-in.spec.ts` | 11 | 7 | 4 | Active — needs dev server |
| 1.2 | Unit | `apps/web/src/lib/auth.config.spec.ts` | 6 | 6 | 0 | **PASSING** |
| 1.2 | Integration | `apps/web/src/lib/auth.integration.spec.ts` | 7 | 7 | 0 | **PASSING** |
| 1.3 | E2E | `playwright/e2e/onboarding/onboarding.spec.ts` | 14 | 1 | 13 | 1 active, rest need GitHub creds |
| 1.3 | Unit | `apps/web/src/lib/crypto.test.ts` | 9 | 9 | 0 | **PASSING** |
| 1.3 | Integration | `apps/web/src/lib/auth.credential.spec.ts` | 7 | 7 | 0 | **PASSING** |
| 1.3 | Integration | `apps/web/src/actions/repo-connection.actions.spec.ts` | 23 | 23 | 0 | **PASSING** |
| 1.3 | Component | `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx` | 15 | 15 | 0 | **PASSING** |
| Setup | Setup | `playwright/auth.setup.ts` | 1 | 1 | 0 | Active — needs GitHub creds |
| **Total** | | | **93** | **76** | **17** | |

---

## Prioritized Action Items

| Priority | Action | File(s) | Effort |
|---|---|---|---|
| Before activating skipped tests | Fix `setTimeout` → controlled deferred promise | `onboarding.spec.ts:119` | 15 min |
| Before activating skipped tests | Fix `Date.now()` → `testStartTime`-anchored assertion | `sign-in.spec.ts:166` | 10 min |
| Sprint 2 | Extract `unauthenticatedPage` fixture | `sign-in.spec.ts`, `onboarding.spec.ts`, `merged-fixtures.ts` | 30 min |
| Optional | Use fixed ISO string for `authenticatedSession.expires` | `auth.config.spec.ts:52` | 2 min |
| Optional | Switch `global.fetch` to `jest.spyOn` pattern | `repo-connection.actions.spec.ts:36` | 5 min |
| Optional | Extract response-body collection to helper | `onboarding.spec.ts:196` | 10 min |

---

## Knowledge Base References

| Fragment | Applied To |
|---|---|
| `test-quality.md` | Hard waits, determinism, assertions, size limits |
| `auth-session.md` | `auth.setup.ts` validation, `authStorageInit` pattern |
| `fixtures-composition.md` | `unauthenticatedPage` fixture recommendation |
| `overview.md` | Playwright-utils integration validation |
| `test-healing-patterns.md` | setTimeout → deferred promise fix; Date.now() → testStartTime fix |
| `selector-resilience.md` | ARIA role selector validation |
| `test-levels-framework.md` | Unit/integration/E2E level appropriateness |

---

## Next Steps

1. **Resolve the 2 MEDIUM deferred issues** before activating the GitHub credential tests (low effort, high impact on test reliability when those tests are live).
2. **Extract `unauthenticatedPage` fixture** in Sprint 2 to reduce boilerplate and improve maintainability.
3. **Configure GitHub credentials** (`TEST_GITHUB_USERNAME`, `TEST_GITHUB_PASSWORD`) to activate the 17 skipped tests; this is the main remaining blocker for full E2E coverage.
4. **Consider `trace` workflow** to validate acceptance-criteria traceability across both stories after Sprint 2 tests are activated.
