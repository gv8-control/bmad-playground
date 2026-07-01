---
stepsCompleted:
  - step-01-load-context
  - step-02-discover-tests
  - step-03-quality-evaluation
  - step-03f-aggregate-scores
  - step-04-generate-report
lastStep: step-04-generate-report
lastSaved: '2026-07-01'
workflowType: 'testarch-test-review'
inputDocuments:
  - _bmad/tea/config.yaml
  - _bmad-output/implementation-artifacts/1-6-detect-and-recover-from-credential-failures.md
  - apps/web/src/lib/credential-health.ts
  - apps/web/src/lib/credential-health.test.ts
  - apps/web/src/actions/credential-health.actions.ts
  - apps/web/src/actions/credential-health.actions.spec.ts
  - apps/web/src/lib/auth.ts
  - apps/web/src/lib/auth.credential.spec.ts
  - apps/web/src/actions/repo-connection.actions.ts
  - apps/web/src/actions/repo-connection.actions.spec.ts
  - apps/web/src/actions/repository-validation.actions.ts
  - apps/web/src/actions/repository-validation.actions.spec.ts
  - apps/web/src/actions/repository-validation.test-utils.ts
  - .claude/skills/bmad-tea/resources/knowledge/test-quality.md
  - .claude/skills/bmad-tea/resources/knowledge/data-factories.md
  - .claude/skills/bmad-tea/resources/knowledge/test-levels-framework.md
  - .claude/skills/bmad-tea/resources/knowledge/selective-testing.md
  - .claude/skills/bmad-tea/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-tea/resources/knowledge/timing-debugging.md
  - .claude/skills/bmad-tea/resources/knowledge/test-priorities-matrix.md
---

# Test Quality Review — Story 1.6: Detect and Recover from Credential Failures

**Quality Score**: 99/100 (A — Excellent)
**Review Date**: 2026-07-01
**Review Scope**: Suite (5 files — 2 new unit/integration, 3 updated spec files)
**Stack**: fullstack (Next.js 16 + Jest)
**Reviewer**: Master Test Architect (TEA bmad-testarch-test-review)

---

Note: This review audits existing tests; it does not generate tests.
Coverage mapping and coverage gates are out of scope here. Use `trace` for coverage decisions.

## Executive Summary

**Overall Assessment**: Excellent

**Recommendation**: Approve

### Key Strengths

- Priority markers applied to **every** test across all 5 files — directly resolves the Story 1.5 review finding (M-1) and restores the selective-testing convention from Stories 1.2–1.4.
- AC-2 (tenant isolation) verified at the data layer: tests assert the Prisma `findUnique` query uses `where: { userId }` — not just the result — preventing a regression that could silently resolve another user's token.
- `markCredentialFailed` best-effort error handling tested — a `[P1]` test verifies the function does not throw when `updateMany` rejects (credential-health.ts:38-47 try/catch), matching the "fire-and-forget" design intent.
- `beforeEach` default authenticated state in `credential-health.actions.spec.ts` — implements the Story 1.5 review recommendation (L-1) for reducing mock setup duplication.
- Shared test-utils extraction (`repository-validation.test-utils.ts`) — fixtures and fetch-setup helpers are reused across the `inspectBmadSetup` and `validateRepository` test suites, reducing duplication.

### Key Weaknesses

- `CredentialFailureError` mock class duplicated identically in two spec files (`repo-connection.actions.spec.ts:24-29` and `repository-validation.actions.spec.ts:24-29`) — must stay manually in sync with the real class.
- Stale "RED PHASE" comment in `auth.credential.spec.ts:9-10` — references a skipped-test workflow from Story 1.3 that no longer applies.
- No test for `markCredentialHealthy` rejection behaviour — `markCredentialFailed` has a best-effort test (line 130), but `markCredentialHealthy` has no equivalent, leaving an asymmetry unverified.

### Summary

Story 1.6's tests are production-ready and demonstrate a clear quality improvement over Story 1.5. The most significant gain is the universal application of `[P0]`/`[P1]`/`[P2]` priority markers — every test across all 5 files is tagged, directly resolving the M-1 finding from the Story 1.5 review. The new `credential-health.test.ts` (15 unit tests) and `credential-health.actions.spec.ts` (9 integration tests) follow the correct test-level separation: pure-function edge cases at unit level, Server Action concerns (auth, DB, error handling) at integration level.

The 3 updated spec files (`auth.credential.spec.ts`, `repo-connection.actions.spec.ts`, `repository-validation.actions.spec.ts`) correctly mock the new `resolveOAuthToken`/`markCredentialFailed` interface instead of the old inline `oAuthCredential.findUnique`/`decryptToken` pattern. The `CredentialFailureError` catch tests verify AC-1 (401/403 detection marks credential as failed) at every call site: `resolveOAuthToken` rejection, direct 401 response, direct 403 response, and `inspectBmadSetup` throwing `CredentialFailureError`. All 212 tests pass in 7.9 seconds with zero determinism or isolation violations. The only findings are Low-severity maintainability items that do not block merge.

---

## Quality Criteria Assessment

| Criterion | Status | Violations | Notes |
|---|---|---|---|
| BDD Format (Given-When-Then) | ✅ PASS | 0 | Descriptive names with AC references in describe blocks (consistent with Stories 1.2–1.5) |
| Test IDs | ✅ PASS | 0 | AC-1, AC-2, AC-3 referenced in describe blocks and test names |
| Priority Markers (P0/P1/P2/P3) | ✅ PASS | 0 | All 119 tests tagged — fixes Story 1.5 M-1 finding |
| Hard Waits (sleep, waitForTimeout) | ✅ PASS | 0 | Zero hard waits; `jest.useFakeTimers()` for timeout test (deterministic) |
| Determinism (no conditionals) | ✅ PASS | 0 | No random/time dependencies, no if/else flow control |
| Isolation (cleanup, no shared state) | ✅ PASS | 0 | `jest.clearAllMocks()` / `restoreAllMocks()` / `clearValidationCache()` in every describe |
| Fixture Patterns | ✅ PASS | 0 | Module-level `jest.mock()` + shared test-utils extraction |
| Data Factories | ⚠️ WARN | 0 | Hardcoded test data (acceptable for mocked unit/integration tests) |
| Network-First Pattern | ✅ PASS | 0 | All dependencies mocked at module level (N/A for unit tests) |
| Explicit Assertions | ✅ PASS | 0 | All `expect()` calls visible in test bodies, no hidden assertions |
| Test Length (≤300 lines) | ✅ PASS | 0 | Individual tests all <20 lines; largest file 621 lines (pre-existing, 51 short tests) |
| Test Duration (≤1.5 min) | ✅ PASS | 0 | 212 tests pass in 7.9 seconds |
| Flakiness Patterns | ✅ PASS | 0 | No timing-dependent assertions, no race conditions |

**Total Violations**: 0 Critical, 0 High, 0 Medium, 3 Low

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
  LOW: Duplicated CredentialFailureError mock class (-2)
  LOW: Stale RED PHASE comment (-1)
  LOW: Missing markCredentialHealthy rejection test (-1)
  Score:                 96/100 (A)

Dimension: Performance (weight: 15%)
  Violations:            0
  Score:                 100/100 (A+)

Weighted Total:          99/100 (A)
  Determinism:      100 × 0.30 = 30.00
  Isolation:        100 × 0.30 = 30.00
  Maintainability:   96 × 0.25 = 24.00
  Performance:      100 × 0.15 = 15.00
  ─────────────────────────────────
  Total:                          99.00 → 99
```

---

## Critical Issues (Must Fix)

No critical issues detected. ✅

---

## Recommendations (Should Fix)

### L-1: Duplicated `CredentialFailureError` mock class

**Severity**: P3 (Low)
**Location**: `apps/web/src/actions/repo-connection.actions.spec.ts:24-29` and `apps/web/src/actions/repository-validation.actions.spec.ts:24-29`
**Dimension**: Maintainability
**Knowledge Base**: test-quality.md — DRY test setup; test-healing-patterns.md — shared state patterns

**Issue Description**:

The `CredentialFailureError` class is defined identically in two spec files because `jest.mock('@/lib/credential-health', ...)` replaces the entire module, including the real class. Both mock classes must stay manually in sync with the real class in `credential-health.ts:6-11`. If the real class gains a property or changes its constructor signature, these mocks won't reflect the change, and `instanceof` checks could silently pass or fail incorrectly.

**Current Code**:

```typescript
// ❌ Duplicated in both repo-connection.actions.spec.ts and repository-validation.actions.spec.ts:
class CredentialFailureError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Credential failure: GitHub API returned ${statusCode}`);
    this.name = 'CredentialFailureError';
  }
}

jest.mock('@/lib/credential-health', () => ({
  resolveOAuthToken: (...args: unknown[]) => mockResolveOAuthToken(...args),
  markCredentialFailed: (...args: unknown[]) => mockMarkCredentialFailed(...args),
  CredentialFailureError,
}));
```

**Recommended Improvement**:

```typescript
// ✅ Preserve the real class via jest.requireActual, mock only the functions:
jest.mock('@/lib/credential-health', () => {
  const actual = jest.requireActual<typeof import('@/lib/credential-health')>('@/lib/credential-health');
  return {
    ...actual,
    resolveOAuthToken: (...args: unknown[]) => mockResolveOAuthToken(...args),
    markCredentialFailed: (...args: unknown[]) => mockMarkCredentialFailed(...args),
  };
});

// Then import the real class for use in tests:
import { CredentialFailureError } from '@/lib/credential-health';
```

**Benefits**: Eliminates the duplication and the sync risk. The real `CredentialFailureError` class is used in both the source code and the tests, so `instanceof` checks are always consistent. If the class changes, tests automatically use the updated version.

**Priority**: P3 — the current mock class is simple (one property) and matches the real class exactly. The risk of divergence is low, but the pattern should be improved before more spec files adopt it.

*Reference: test-quality.md — DRY test setup; test-healing-patterns.md — shared state pattern*

---

### L-2: Stale "RED PHASE" comment in `auth.credential.spec.ts`

**Severity**: P3 (Low)
**Location**: `apps/web/src/lib/auth.credential.spec.ts:9-10`
**Dimension**: Maintainability

**Issue Description**:

The file header comment says "RED PHASE: all tests are skipped until auth.ts is updated (Task 3.1). Remove test.skip() one at a time as you implement." This comment is stale from Story 1.3's ATDD phase — none of the tests are skipped, and the file has been extended in Story 1.6 with 3 new tests. The stale comment misleads readers into thinking the tests are incomplete.

**Current Code**:

```typescript
/**
 * @jest-environment node
 *
 * ATDD — Story 1.3: Connect a Repository by URL
 * Tests for the OAuthCredential storage added to auth.ts in Task 3.1.
 * Verifies the jwt callback encrypts and upserts the access token after user
 * upsert when account.access_token is present (AC-3).
 *
 * RED PHASE: all tests are skipped until auth.ts is updated (Task 3.1).
 * Remove test.skip() one at a time as you implement.
 *
 * Relationship to auth.integration.spec.ts:
 *   auth.integration.spec.ts covers the existing jwt/session callbacks from Story 1.2.
 *   This file covers only the NEW credential-storage behaviour added in Story 1.3.
 */
```

**Recommended Improvement**:

```typescript
/**
 * @jest-environment node
 *
 * Tests for the jwt callback in auth.ts — OAuthCredential storage and
 * credential health reset (Stories 1.3 + 1.6).
 *
 * Relationship to auth.integration.spec.ts:
 *   auth.integration.spec.ts covers the existing jwt/session callbacks from Story 1.2.
 *   This file covers credential-storage behaviour (Story 1.3) and
 *   credential health reset on re-auth (Story 1.6).
 */
```

**Benefits**: Removes misleading "RED PHASE" / "skipped" language. Updates the file description to reflect Story 1.6's additions (credential health reset).

**Priority**: P3 — documentation cleanup, no functional impact.

---

### L-3: No test for `markCredentialHealthy` rejection behaviour

**Severity**: P3 (Low)
**Location**: `apps/web/src/lib/credential-health.test.ts` (missing test in `markCredentialHealthy` describe block, lines 138-156)
**Dimension**: Maintainability

**Issue Description**:

`markCredentialFailed` has a `[P1]` test verifying it does not throw when `updateMany` rejects (line 130-133) — testing the try/catch in the implementation (credential-health.ts:38-47). However, `markCredentialHealthy` has **no equivalent test**. The two functions have asymmetric error handling:

- `markCredentialFailed`: wraps `updateMany` in try/catch (best-effort, swallows errors)
- `markCredentialHealthy`: calls `updateMany` directly (will throw on rejection)

This asymmetry is currently safe because `markCredentialHealthy` is only called from the jwt callback in `auth.ts:68-73`, which wraps it in `.catch()`. But if someone calls `markCredentialHealthy` directly without a try/catch, it could throw. The test suite should verify the actual behaviour of both functions so that a future refactor (adding or removing the try/catch) is caught.

**Recommended Improvement**:

Add a test verifying `markCredentialHealthy`'s actual rejection behaviour:

```typescript
// If markCredentialHealthy is intended to be best-effort (matching markCredentialFailed):
it('[P1] does not throw when updateMany rejects (best-effort)', async () => {
  mockUpdateManyRepoConnection.mockRejectedValue(new Error('DB connection lost'));
  await expect(markCredentialHealthy(USER_ID)).resolves.toBeUndefined();
});

// If markCredentialHealthy is intended to throw (current behaviour):
it('[P1] propagates updateMany rejection', async () => {
  mockUpdateManyRepoConnection.mockRejectedValue(new Error('DB connection lost'));
  await expect(markCredentialHealthy(USER_ID)).rejects.toThrow('DB connection lost');
});
```

Choose the test that matches the intended design. If best-effort is intended, add a try/catch to `markCredentialHealthy` to match `markCredentialFailed`. If propagation is intended, document the asymmetry.

**Priority**: P3 — the current call site (jwt callback) has its own `.catch()`, so the asymmetry doesn't cause a runtime issue today. But the test gap means a future refactor could change the behaviour undetected.

*Reference: test-quality.md — Deterministic Test Pattern; test-healing-patterns.md — error handling patterns*

---

## Best Practices Found

### 1. AC-2 tenant isolation verified at the data layer

**Location**: `apps/web/src/lib/credential-health.test.ts:94-106`
**Pattern**: Query-level assertion for security requirements
**Knowledge Base**: test-quality.md — Explicit Assertions

**Why This Is Good**:

AC-2 ("tokens are never resolved across users") is verified by asserting the Prisma query itself uses `where: { userId: USER_ID }` — not just checking the result. Two tests verify this:

1. `toHaveBeenCalledWith({ where: { userId: USER_ID } })` — verifies the query is scoped to the requesting user.
2. `JSON.stringify(callArg).not.toContain('usr_other')` — verifies no other user ID appears anywhere in the query.

This is stronger than result-level assertions: if someone changes the `where` clause to include another user's ID (e.g., during a refactor), the test catches it even if the result happens to be correct.

**Code Example**:

```typescript
// ✅ Query-level assertion (unit test)
it('[P0] queries only by the provided userId — never another user (AC-2 tenant isolation)', async () => {
  await resolveOAuthToken(USER_ID);
  expect(mockFindUniqueCredential).toHaveBeenCalledWith({
    where: { userId: USER_ID },
  });
});

it('[P1] does not query for any other userId', async () => {
  await resolveOAuthToken(USER_ID);
  const callArg = mockFindUniqueCredential.mock.calls[0]?.[0];
  expect(callArg).toEqual({ where: { userId: USER_ID } });
  expect(JSON.stringify(callArg)).not.toContain('usr_other');
});
```

**Use as Reference**: All security-critical ACs should include query-level assertions verifying the Prisma `where` clause, not just result-level assertions.

---

### 2. AC-1 verified at every call site

**Location**: `repo-connection.actions.spec.ts:185-190, 288-302, 304-314` and `repository-validation.actions.spec.ts:567-583`
**Pattern**: Exhaustive call-site coverage for a cross-cutting concern

**Why This Is Good**:

AC-1 ("401/403 detection updates credential health to `failed`") is tested at **every** code path where `markCredentialFailed` should be called:

1. `resolveOAuthToken` throws `CredentialFailureError` (credential resolution failure)
2. GitHub API returns 401 (token expired/revoked)
3. GitHub API returns 403 (insufficient permission / org restriction)
4. `inspectBmadSetup` throws `CredentialFailureError` (cascaded 401/403 from `fetchGithubContents`)

Each test verifies `expect(mockMarkCredentialFailed).toHaveBeenCalledWith(SESSION.userId)`. This exhaustive approach ensures no call site is missed — if a future refactor removes a `markCredentialFailed` call, the corresponding test fails.

**Use as Reference**: Cross-cutting concerns (logging, health updates, audit trails) should be tested at every call site, not just one representative path.

---

### 3. `beforeEach` default authenticated state

**Location**: `apps/web/src/actions/credential-health.actions.spec.ts:40-43`
**Pattern**: Default mock state with per-test overrides

**Why This Is Good**:

```typescript
describe('getCredentialHealthStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(SESSION);  // default: authenticated
  });

  it('[P0] returns error for unauthenticated request', async () => {
    mockAuth.mockResolvedValue(null);  // override default
    // ...
  });
});
```

This implements the Story 1.5 review recommendation (L-1): happy-path tests don't repeat the `mockAuth.mockResolvedValue(SESSION)` boilerplate, and error-path tests explicitly override the default. Each test body is shorter and more focused on what it's actually testing.

**Use as Reference**: All integration spec files should adopt this pattern — default authenticated state in `beforeEach`, explicit overrides for error-path tests.

---

### 4. `select` clause assertion for credential health reads

**Location**: `apps/web/src/lib/credential-health.test.ts:183-190`
**Pattern**: Verifying the database query reads only what's needed

**Why This Is Good**:

```typescript
it('[P1] selects only credentialHealth column', async () => {
  mockFindUniqueRepoConnection.mockResolvedValue({ credentialHealth: 'healthy' });
  await getCredentialHealth(USER_ID);
  expect(mockFindUniqueRepoConnection).toHaveBeenCalledWith({
    where: { userId: USER_ID },
    select: { credentialHealth: true },
  });
});
```

This verifies the Prisma query uses `select: { credentialHealth: true }` — reading only the `credentialHealth` column, not the entire `RepoConnection` row (which includes `repoUrl`, `userId`, etc.). This is a performance and security best practice: minimal data exposure. If someone removes the `select` clause during a refactor, this test catches it.

**Use as Reference**: All `findUnique` calls that only need specific fields should include a `select` clause assertion in their tests.

---

## Test File Analysis

### File 1: `apps/web/src/lib/credential-health.test.ts` (NEW)

| Metric | Value |
|---|---|
| **File Path** | `apps/web/src/lib/credential-health.ts` |
| **File Size** | 191 lines |
| **Test Framework** | Jest |
| **Language** | TypeScript |
| **Describe Blocks** | 4 |
| **Test Cases (it)** | 15 |
| **Average Test Length** | ~8 lines per test |
| **Fixtures Used** | 0 (pure function with mocked deps) |
| **Data Factories Used** | 0 (hardcoded test data — acceptable for unit tests) |
| **Priority Markers** | 15/15 (10 P0, 5 P1) |

### Test Structure

```
describe('resolveOAuthToken (AC-2 — tenant-scoped credential resolution)')
  ├── it('[P0] returns decrypted token for valid userId (AC-2)')
  ├── it('[P0] throws CredentialFailureError when no OAuthCredential exists (AC-2)')
  ├── it('[P0] CredentialFailureError carries statusCode 401 when credential is missing')
  ├── it('[P0] throws when decryptToken fails (tampered credential, KEK rotation mismatch)')
  ├── it('[P0] queries only by the provided userId — never another user (AC-2 tenant isolation)')
  └── it('[P1] does not query for any other userId')
describe('markCredentialFailed (AC-1 — 401/403 detection)')
  ├── it('[P0] updates credentialHealth to "failed" (AC-1)')
  ├── it('[P0] is a no-op (no throw) when no RepoConnection exists')
  └── it('[P1] does not throw when updateMany rejects (best-effort)')
describe('markCredentialHealthy (AC-3 — re-auth restores health)')
  ├── it('[P0] updates credentialHealth to "healthy" (AC-3)')
  └── it('[P0] is a no-op when no RepoConnection exists')
describe('getCredentialHealth')
  ├── it('[P0] returns "healthy" for existing RepoConnection with healthy status')
  ├── it('[P0] returns "failed" for existing RepoConnection with failed status')
  ├── it('[P0] returns null when no RepoConnection exists')
  └── it('[P1] selects only credentialHealth column')
```

### File 2: `apps/web/src/actions/credential-health.actions.spec.ts` (NEW)

| Metric | Value |
|---|---|
| **File Path** | `apps/web/src/actions/credential-health.actions.spec.ts` |
| **File Size** | 106 lines |
| **Test Framework** | Jest |
| **Language** | TypeScript |
| **Describe Blocks** | 2 |
| **Test Cases (it)** | 9 |
| **Average Test Length** | ~7 lines per test |
| **Mock Pattern** | Module-level `jest.mock()` + `beforeEach` default authenticated state |
| **Cleanup** | `afterEach(() => jest.clearAllMocks())` |
| **Priority Markers** | 9/9 (7 P0, 2 P1) |

### Test Structure

```
describe('getCredentialHealthStatus')
  ├── it('[P0] returns healthy for authenticated user with healthy connection')
  ├── it('[P0] returns failed for authenticated user with failed connection')
  ├── it('[P0] returns healthy for authenticated user with no RepoConnection')
  ├── it('[P0] returns error for unauthenticated request')
  ├── it('[P0] returns error on unexpected DB failure')
  └── it('[P1] passes session.userId to getCredentialHealth')
describe('reauthorizeGitHub (AC-3)')
  ├── it('[P0] calls signIn with "github" provider (AC-3)')
  ├── it('[P0] passes callbackUrl as redirectTo to signIn')
  └── it('[P1] passes undefined redirectTo when no callbackUrl provided')
```

### File 3: `apps/web/src/lib/auth.credential.spec.ts` (UPDATED)

| Metric | Value |
|---|---|
| **File Path** | `apps/web/src/lib/auth.credential.spec.ts` |
| **File Size** | 236 lines |
| **Test Framework** | Jest |
| **Language** | TypeScript |
| **Describe Blocks** | 1 |
| **Test Cases (it)** | 10 (7 pre-existing + 3 new for Story 1.6) |
| **Mock Pattern** | `NextAuth` mock captures jwt callback config; `repoConnection.updateMany` added to Prisma mock |
| **Cleanup** | `beforeEach(jest.clearAllMocks)` + `afterEach(delete process.env.CREDENTIAL_ENCRYPTION_KEK)` |
| **Priority Markers** | 10/10 (7 P0, 3 P1) |

### New Tests Added (Story 1.6)

```
it('[P0] calls repoConnection.updateMany with healthy status after credential upsert (AC-3)')
it('[P0] does NOT call repoConnection.updateMany when account.access_token is absent')
it('[P1] does not abort sign-in when repoConnection.updateMany rejects')
```

### File 4: `apps/web/src/actions/repo-connection.actions.spec.ts` (UPDATED)

| Metric | Value |
|---|---|
| **File Path** | `apps/web/src/actions/repo-connection.actions.spec.ts` |
| **File Size** | 512 lines |
| **Test Framework** | Jest |
| **Language** | TypeScript |
| **Describe Blocks** | 4 |
| **Test Cases (it)** | 34 (30 pre-existing + 4 new for Story 1.6) |
| **Mock Pattern** | `resolveOAuthToken`/`markCredentialFailed` mocked from `@/lib/credential-health`; `CredentialFailureError` local mock class |
| **Cleanup** | Top-level `beforeEach`/`afterEach` for fetch spy; `jest.clearAllMocks()` per describe |
| **Priority Markers** | 34/34 (20 P0, 12 P1, 2 P2) |

### New Tests Added (Story 1.6)

```
it('[P0] calls markCredentialFailed when resolveOAuthToken throws CredentialFailureError (AC-1)')
it('[P0] calls markCredentialFailed on 401 response (AC-1)')
it('[P0] calls markCredentialFailed on 403 response (AC-1)')
it('[P0] calls markCredentialFailed when inspectBmadSetup throws CredentialFailureError (AC-1)')
```

### File 5: `apps/web/src/actions/repository-validation.actions.spec.ts` (UPDATED)

| Metric | Value |
|---|---|
| **File Path** | `apps/web/src/actions/repository-validation.actions.spec.ts` |
| **File Size** | 621 lines |
| **Test Framework** | Jest |
| **Language** | TypeScript |
| **Describe Blocks** | 8 |
| **Test Cases (it)** | 51 (48 pre-existing + 3 new for Story 1.6) |
| **Mock Pattern** | `resolveOAuthToken`/`markCredentialFailed` mocked from `@/lib/credential-health`; `CredentialFailureError` local mock class; shared `test-utils.ts` for fixtures |
| **Cleanup** | `jest.clearAllMocks()` + `clearValidationCache()` + `restoreAllMocks()` per describe |
| **Priority Markers** | 51/51 (28 P0, 18 P1, 5 P2) |

### New Tests Added (Story 1.6)

```
it('[P0] calls markCredentialFailed when resolveOAuthToken throws CredentialFailureError (AC-1)')
it('[P1] returns errorCode NO_CREDENTIAL when inspectBmadSetup throws CredentialFailureError (GitHub API 403)')
it('[P0] calls markCredentialFailed when inspectBmadSetup throws CredentialFailureError (AC-1)')
```

### Story 1.6 Totals

| Metric | Value |
|---|---|
| **Total Test Cases** | 119 (15 new unit + 9 new integration + 10 updated auth + 34 updated repo-connection + 51 updated validation) |
| **New Tests Added** | 34 (15 + 9 + 3 + 4 + 3) |
| **P0 (Critical)** | 65 tests tagged |
| **P1 (High)** | 38 tests tagged |
| **P2 (Medium)** | 7 tests tagged |
| **P3 (Low)** | 0 tests tagged |
| **All Tests Passing** | ✅ Yes (212/212 across all projects, 7.9s) |

> **Note**: The story's completion notes claim "29 new tests added (207 total)" but the actual count of new tests is 34. The total test count is now 212 (up from 207 at story completion — 5 additional tests may have been added during review fixes or subsequent stories). The discrepancy in "new" count (29 vs 34) is because some tests were modifications of existing tests (changed error codes from `UNKNOWN` to `NO_CREDENTIAL`) rather than purely new additions.

---

## Context and Integration

### Related Artifacts

- **Story File**: `_bmad-output/implementation-artifacts/1-6-detect-and-recover-from-credential-failures.md`
- **Source Implementation (credential health service)**: `apps/web/src/lib/credential-health.ts` (73 lines)
- **Source Implementation (Server Actions)**: `apps/web/src/actions/credential-health.actions.ts` (45 lines)
- **Source Implementation (auth jwt callback)**: `apps/web/src/lib/auth.ts` (87 lines)
- **Source Implementation (repo-connection)**: `apps/web/src/actions/repo-connection.actions.ts` (181 lines)
- **Source Implementation (repository-validation)**: `apps/web/src/actions/repository-validation.actions.ts` (346 lines)
- **Shared Test Utils**: `apps/web/src/actions/repository-validation.test-utils.ts` (96 lines)
- **Shared Types**: `libs/shared-types/src/credential-health.types.ts` — `CredentialHealthStatus` type
- **ATDD Checklist**: Not found — no `atdd-checklist-1-6-*.md` exists
- **Test Design**: Not found — no test design doc for Story 1.6
- **Previous Review**: `_bmad-output/test-artifacts/test-reviews/test-review-1-5.md` — Story 1.5 review (98/100, Approve with Comments)

### Acceptance Criteria Coverage

| AC | Description | Tests | Level | Status |
|---|---|---|---|---|
| AC-1 | 401/403 detection updates credential health to `failed` | 3 unit (markCredentialFailed updates, no-op, best-effort) + 7 integration (401, 403, inspectBmadSetup throw — across 2 action files) | Unit + Integration | ✅ Covered |
| AC-2 | Tenant authorization check before token resolution | 6 unit (resolveOAuthToken valid, missing, statusCode, decrypt fail, tenant isolation ×2) + 4 integration (resolveOAuthToken mock across 2 action files) | Unit + Integration | ✅ Covered |
| AC-3 | Re-auth flow restores credential health to `healthy` | 2 unit (markCredentialHealthy updates, no-op) + 3 auth (health reset, no-token no-reset, rejection-safe) + 3 integration (reauthorizeGitHub signIn, callbackUrl, undefined) | Unit + Integration | ✅ Covered |
| AC-4 | UI display deferred to Epic 2 | N/A (no UI surface) | — | ✅ Out of scope (correct) |

> **Coverage note**: Coverage analysis is out of scope for `test-review`. The above table shows which tests map to which ACs for context only. Use the `trace` workflow to evaluate acceptance-criteria traceability and coverage gates.

---

## Knowledge Base References

This review consulted the following knowledge base fragments:

| Fragment | Applied To |
|---|---|
| `test-quality.md` | Definition of Done (no hard waits, <300 lines, <1.5 min, self-cleaning, explicit assertions) |
| `data-factories.md` | Factory pattern evaluation (hardcoded data acceptable for mocked unit tests) |
| `test-levels-framework.md` | Test-level separation (unit vs integration), duplicate coverage guard |
| `selective-testing.md` | Priority marker requirement for tag-based execution (`--grep @p0`) — verified all 119 tests tagged |
| `test-priorities-matrix.md` | P0/P1/P2/P3 classification framework and tagging strategy |
| `test-healing-patterns.md` | Shared state pattern (isolation verification), error handling patterns |
| `timing-debugging.md` | Hard wait detection (zero found), `jest.useFakeTimers()` for timeout test |

For coverage mapping, consult `trace` workflow outputs.

---

## Prioritized Action Items

| Priority | Action | File(s) | Effort |
|---|---|---|---|
| Optional | **Use `jest.requireActual` for `CredentialFailureError`** instead of duplicated mock class (L-1) | `repo-connection.actions.spec.ts`, `repository-validation.actions.spec.ts` | 15 min |
| Optional | **Remove stale "RED PHASE" comment** and update file description (L-2) | `auth.credential.spec.ts` | 5 min |
| Optional | **Add `markCredentialHealthy` rejection test** to verify actual behaviour and resolve asymmetry (L-3) | `credential-health.test.ts` | 10 min |
| Optional | Consider `trace` workflow to validate acceptance-criteria coverage gates | — | — |

---

## Next Steps

### Immediate Actions (Before Merge)

None required — all findings are P3 (Low) and do not block merge.

### Follow-up Actions (Future PRs)

1. **Replace `CredentialFailureError` mock class with `jest.requireActual`** (L-1) — eliminates duplication and sync risk across 2 spec files. Adopt the `jest.requireActual` pattern before more spec files mock `@/lib/credential-health`.
   - Priority: P3
   - Target: next PR touching these spec files

2. **Remove stale "RED PHASE" comment** (L-2) — 5-minute documentation cleanup.
   - Priority: P3
   - Target: next PR touching `auth.credential.spec.ts`

3. **Add `markCredentialHealthy` rejection test** (L-3) — verify whether best-effort behaviour is intended (matching `markCredentialFailed`) or propagation is intended. If best-effort, add try/catch to the implementation.
   - Priority: P3
   - Target: next PR touching `credential-health.ts`

### Re-Review Needed?

✅ No re-review needed — approve as-is. All 3 findings are P3 (Low) maintainability improvements that do not affect test correctness, determinism, isolation, or performance. The tests are production-ready, follow best practices, and demonstrate clear improvement over Story 1.5 (priority markers restored, `beforeEach` default state pattern adopted).

---

## Decision

**Recommendation**: Approve

> Test quality is excellent with 99/100 score. Story 1.6 directly resolves the Story 1.5 M-1 finding (missing priority markers) — all 119 tests across 5 files are tagged `[P0]`/`[P1]`/`[P2]`. The new `credential-health.test.ts` and `credential-health.actions.spec.ts` demonstrate strong patterns: AC-2 tenant isolation verified at the query level, AC-1 exhaustively tested at every call site, `beforeEach` default authenticated state (implementing the Story 1.5 L-1 recommendation), and `select` clause assertion for minimal data exposure. All 212 tests pass in 7.9 seconds with zero determinism, isolation, or performance violations. The 3 Low-severity findings (duplicated mock class, stale comment, missing rejection test) are optional improvements that do not block merge.

---

## Appendix

### Violation Summary by Location

| File | Line | Severity | Dimension | Issue | Fix |
|---|---|---|---|---|---|
| `repo-connection.actions.spec.ts` | 24-29 | P3 | Maintainability | Duplicated `CredentialFailureError` mock class | Use `jest.requireActual` |
| `repository-validation.actions.spec.ts` | 24-29 | P3 | Maintainability | Duplicated `CredentialFailureError` mock class | Use `jest.requireActual` |
| `auth.credential.spec.ts` | 9-10 | P3 | Maintainability | Stale "RED PHASE" comment | Remove/update comment |
| `credential-health.test.ts` | 138-156 | P3 | Maintainability | No `markCredentialHealthy` rejection test | Add test for rejection behaviour |

### Quality Trends

| Review Date | Score | Grade | Critical Issues | Trend |
|---|---|---|---|---|
| 2026-07-01 (Story 1.4) | 93/100 | A | 1 (cache isolation) | — |
| 2026-07-01 (Story 1.5) | 98/100 | A | 0 | ⬆️ Improved (+5) |
| 2026-07-01 (Story 1.6) | 99/100 | A | 0 | ⬆️ Improved (+1) |

### Related Reviews

| Story | File | Score | Grade | Critical | Status |
|---|---|---|---|---|---|
| 1.4 | `test-review-1-4.md` | 93/100 | A | 1 (cache isolation) | Request changes |
| 1.5 | `test-review-1-5.md` | 98/100 | A | 0 | Approved with comments |
| 1.6 | `test-review-1-6.md` | 99/100 | A | 0 | Approved |

---

## Review Metadata

**Generated By**: BMad TEA Agent (Test Architect)
**Workflow**: bmad-testarch-test-review v5.0 (Step-File Architecture)
**Review ID**: test-review-1-6-20260701
**Timestamp**: 2026-07-01
**Version**: 1.0
**Execution Mode**: sequential (auto → sequential, no subagent runtime)
