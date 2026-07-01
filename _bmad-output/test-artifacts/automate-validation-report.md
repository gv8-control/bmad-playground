# Automate Workflow Validation Report

**Story:** 1.6 — Detect and Recover from Credential Failures
**Date:** 2026-07-01
**Mode:** Validate
**Validator:** Master Test Architect (TEA)
**Story Status:** review

---

## Prerequisites

| Check | Status | Notes |
|---|---|---|
| Framework scaffolding (`playwright.config.ts`) | PASS | Configured with setup project, Chromium, storageState auth |
| Test directory structure (`tests/` folder) | PASS | `apps/web/src/**/*.test.ts` / `*.spec.ts` for Jest (co-located) |
| Package.json test dependencies | PASS | `jest`, `ts-jest`, `@testing-library/react` installed |
| BMad artifacts (story) | PASS | `_bmad-output/implementation-artifacts/1-6-detect-and-recover-from-credential-failures.md` loaded |

---

## Step 1: Execution Mode and Context Loading

### Mode Detection

- **Mode:** BMad-Integrated (story_file = `1-6-detect-and-recover-from-credential-failures.md`)
- **Status:** PASS

### BMad Artifacts

| Artifact | Status |
|---|---|
| Story 1.6 markdown | PASS — loaded, 4 ACs extracted |
| Tech-spec | N/A (not used) |
| Test-design | N/A (not used) |
| PRD | N/A (not used) |

### Framework Configuration

| Check | Status |
|---|---|
| `playwright.config.ts` loaded | PASS |
| `apps/web/jest.config.ts` loaded | PASS |
| Existing test patterns reviewed | PASS — follows Stories 1.2–1.5 patterns (jest.mock at module level, `@jest-environment node`, `jest.clearAllMocks` in afterEach) |
| Test runner capabilities noted | PASS — Jest (unit/integration), Playwright (E2E, not needed for this story — AC-4 explicitly defers UI to Epic 2) |

### Coverage Analysis

| File | Level | Tests | Status |
|---|---|---|---|
| `apps/web/src/lib/credential-health.test.ts` | Unit | 14 | PASSING |
| `apps/web/src/actions/credential-health.actions.spec.ts` | Integration | 9 | PASSING |
| `apps/web/src/lib/auth.credential.spec.ts` | Integration | 9 (2 new for 1.6) | PASSING |
| `apps/web/src/actions/repo-connection.actions.spec.ts` | Integration | 32 (3 new for 1.6) | PASSING |
| `apps/web/src/actions/repository-validation.actions.spec.ts` | Unit | 50 (1 new + 2 updated for 1.6) | PASSING |

**Total: 207 tests across 17 suites — ALL PASSING** (was 178 at Story 1.5 completion; 29 new tests added)

**Test execution command:** `yarn nx test web`
**Result:** 17 suites passed, 207 tests passed, 0 failures

**Lint:** 0 errors across all projects

---

## Step 2: Automation Targets Identification

### AC-to-Test Mapping

#### AC-1: 401/403 detection updates credential health to `failed` within one operation cycle

| Test | Level | Priority | File:Line |
|---|---|---|---|
| updates credentialHealth to "failed" | Unit | P0 | credential-health.test.ts:117 |
| is a no-op (no throw) when no RepoConnection exists | Unit | P0 | credential-health.test.ts:125 |
| calls markCredentialFailed on 401 response | Integration | P0 | repo-connection.actions.spec.ts:274 |
| calls markCredentialFailed on 403 response | Integration | P0 | repo-connection.actions.spec.ts:280 |
| calls markCredentialFailed when inspectBmadSetup throws CredentialFailureError (connectRepository) | Integration | P0 | repo-connection.actions.spec.ts:290 |
| calls markCredentialFailed when inspectBmadSetup throws CredentialFailureError (validateRepository) | Unit | P0 | repository-validation.actions.spec.ts:573 |

**Verdict: PASS** — 401/403 detection is covered at both the service layer (`markCredentialFailed` unit tests) and the integration layer (wiring into `connectRepository` and `validateRepository`). The "within one operation cycle" requirement (NFR-R1) is verified by testing that `markCredentialFailed` is called in the same error-handling block as the 401/403 detection, before returning the error result.

#### AC-2: Tenant authorization check before token resolution

| Test | Level | Priority | File:Line |
|---|---|---|---|
| returns decrypted token for valid userId | Unit | P0 | credential-health.test.ts:64 |
| throws CredentialFailureError when no OAuthCredential exists | Unit | P0 | credential-health.test.ts:71 |
| CredentialFailureError carries statusCode 401 when credential is missing | Unit | P0 | credential-health.test.ts:76 |
| throws when decryptToken fails (tampered credential, KEK rotation mismatch) | Unit | P0 | credential-health.test.ts:87 |
| queries only by the provided userId — never another user (tenant isolation) | Unit | P0 | credential-health.test.ts:94 |
| does not query for any other userId | Unit | P1 | credential-health.test.ts:101 |
| returns errorCode NO_CREDENTIAL when OAuthCredential row is absent (connectRepository) | Integration | P0 | repo-connection.actions.spec.ts:164 |
| returns errorCode NO_CREDENTIAL when resolveOAuthToken throws (validateRepository) | Unit | P1 | repository-validation.actions.spec.ts:561 |

**Verdict: PASS** — Tenant-scoped resolution is verified at the query level (`where: { userId }` clause asserted), the function signature level (only `userId` parameter), and the integration level (both `connectRepository` and `validateRepository` use `resolveOAuthToken` instead of inline credential lookup). The `where: { userId }` clause IS the tenant authorization check — verified by direct assertion on the Prisma call arguments.

#### AC-3: Re-auth flow restores credential health to `healthy`

| Test | Level | Priority | File:Line |
|---|---|---|---|
| updates credentialHealth to "healthy" | Unit | P0 | credential-health.test.ts:139 |
| is a no-op when no RepoConnection exists | Unit | P0 | credential-health.test.ts:147 |
| calls repoConnection.updateMany with healthy status after credential upsert | Integration | P0 | auth.credential.spec.ts:201 |
| does NOT call repoConnection.updateMany when account.access_token is absent | Integration | P0 | auth.credential.spec.ts:214 |
| calls signIn with "github" provider | Integration | P0 | credential-health.actions.spec.ts:90 |
| passes callbackUrl as redirectTo to signIn | Integration | P0 | credential-health.actions.spec.ts:96 |
| passes undefined redirectTo when no callbackUrl provided | Integration | P1 | credential-health.actions.spec.ts:102 |

**Verdict: PASS** — The re-auth flow is covered end-to-end: `reauthorizeGitHub` Server Action calls `signIn('github')` with correct params, the jwt callback resets `credentialHealth` to `healthy` after storing the new token, and `markCredentialHealthy` is unit-tested for both update and no-op scenarios. The negative case (no reset when `access_token` absent) is also verified.

#### AC-4: UI display deferred to Epic 2

**Verdict: PASS (N/A)** — No tests needed. The story explicitly defers UI display to Epic 2, Story 2.2. This story delivers detection, status, and the re-auth flow only. No E2E tests are needed (confirmed in story spec: "No E2E tests needed — this story has no UI surface").

### Additional Coverage (Beyond ACs)

| Area | Tests | Level | Status |
|---|---|---|---|
| `getCredentialHealth` returns "healthy" for existing RepoConnection | 1 | Unit | PASS |
| `getCredentialHealth` returns "failed" for existing RepoConnection | 1 | Unit | PASS |
| `getCredentialHealth` returns null when no RepoConnection exists | 1 | Unit | PASS |
| `getCredentialHealth` selects only credentialHealth column | 1 | Unit | PASS |
| `getCredentialHealthStatus` returns healthy for authenticated user with healthy connection | 1 | Integration | PASS |
| `getCredentialHealthStatus` returns failed for authenticated user with failed connection | 1 | Integration | PASS |
| `getCredentialHealthStatus` returns healthy for authenticated user with no RepoConnection | 1 | Integration | PASS |
| `getCredentialHealthStatus` returns error for unauthenticated request | 1 | Integration | PASS |
| `getCredentialHealthStatus` returns error on unexpected DB failure | 1 | Integration | PASS |
| `getCredentialHealthStatus` passes session.userId to getCredentialHealth | 1 | Integration | PASS |
| Updated error codes: UNKNOWN → NO_CREDENTIAL for decrypt failure (validateRepository) | 1 | Unit | PASS |
| Updated error codes: UNKNOWN → NO_CREDENTIAL for 403 (validateRepository) | 1 | Unit | PASS |

### Duplicate Coverage Avoidance

- Unit tests cover pure service logic (`resolveOAuthToken`, `markCredentialFailed`/`Healthy`, `getCredentialHealth`) — DB mocking, no Server Action wiring
- Integration tests cover Server Action wiring (`getCredentialHealthStatus`, `reauthorizeGitHub`) — auth mocking, service mocking
- Integration tests cover action-level wiring (`connectRepository`, `validateRepository`) — verify `markCredentialFailed` is called in the right error paths
- The jwt callback test covers the auth-layer health reset — separate from the service-layer `markCredentialHealthy` unit test
- Edge case variations (no-op on missing RepoConnection) are tested at unit level only — NOT duplicated at integration level
- **Verdict: PASS** — No unnecessary duplicate coverage. Test level selection is appropriate.

### Test Level Selection

| Level | Used? | Justification |
|---|---|---|
| Unit | Yes | Pure service logic (credential-health.ts), inspectBmadSetup core logic |
| Integration | Yes | Server Action wiring (credential-health.actions, auth.credential, repo-connection, repository-validation) |
| E2E | No | No UI surface — story spec explicitly states "No E2E tests needed" (AC-4) |
| Component | No | No UI component — Server Actions and service layer only |

### Priority Assignment

| Priority | Count | Examples |
|---|---|---|
| P0 | 22 | Credential resolution, 401/403 detection, health reset, tenant isolation |
| P1 | 7 | No-op verification, select clause, error message content, undefined redirectTo |
| P2 | 0 | — |
| P3 | 0 | — |

**Verdict: PASS** — Priority tags ([P0], [P1]) are present on all 29 new tests. This is an improvement over Story 1.5 which had no priority tags.

---

## Step 3: Test Infrastructure

| Check | Status |
|---|---|
| Fixtures needed | N/A — Service tests use jest.mock at module level; integration tests use mock functions |
| Factories needed | N/A — Test data is simple credential/user objects, not entities requiring faker |
| Helper utilities | N/A — No complex setup or teardown needed; `jest.clearAllMocks()` in afterEach suffices |

---

## Step 4: Test File Quality

| Check | Status | Notes |
|---|---|---|
| Test files organized correctly | PASS | Co-located with source (`*.test.ts` / `*.spec.ts` next to implementation) |
| Given-When-Then format | PASS | Describe blocks provide "Given" context; test names describe "When-Then" |
| Priority tags in test names | PASS | All 29 new tests have [P0] or [P1] tags |
| One assertion per test (atomic) | PASS | Most tests have focused assertions; some verify multiple related properties (acceptable) |
| No hard waits | N/A | Jest tests — no Playwright waits |
| No flaky patterns | PASS | Deterministic mocks, no race conditions |
| No shared state | PASS | `jest.clearAllMocks()` in `afterEach` |
| No page objects | N/A | No E2E tests |
| `@jest-environment node` directive | PASS | All test files have the directive |
| Module-level `jest.mock()` pattern | PASS | Follows Stories 1.2–1.5 pattern |
| `CredentialFailureError` mock class in spec files | PASS | Both `repo-connection.actions.spec.ts` and `repository-validation.actions.spec.ts` define a local `CredentialFailureError` class for `instanceof` checks — matches the real class interface |

---

## Step 5: Test Validation and Healing

| Check | Status |
|---|---|
| Tests executed | PASS — 207/207 tests pass across 17 suites |
| Lint clean | PASS — 0 errors across all projects |
| Flaky patterns | PASS — None detected |
| Healing needed | N/A — No failures |

---

## Identified Gaps

### Gap 1 (P2 — Coverage): `fetchGithubContents` 401 path not directly tested

- **What's missing:** No test directly verifies that `fetchGithubContents` throws `CredentialFailureError` on a 401 response. The 403 path IS tested (through `inspectBmadSetup` 403 → `validateRepository` returns `NO_CREDENTIAL` + `markCredentialFailed` called).
- **Why it matters:** Low — 401 and 403 share the exact same code branch (`if (response.status === 401 || response.status === 403)` at `repository-validation.actions.ts:67`). If 403 works, 401 works. The 401 path through `connectRepository`'s direct `fetch` call IS tested (`repo-connection.actions.spec.ts:274`).
- **Impact:** Very low — shared code branch, 403 variant is tested.
- **Action:** Not filled — the code branch is shared and the 403 variant provides sufficient coverage.

### Gap 2 (P2 — Observability): `getCredentialHealthStatus` console.error not verified in DB error test

- **What's missing:** The DB error test (`credential-health.actions.spec.ts:69`) verifies the return value (`{ success: false, error: 'Failed to check credential health' }`) but does not verify that `console.error` was called with the expected message.
- **Why it matters:** The error logging at line 29 of `credential-health.actions.ts` is for debugging/observability. Verifying it ensures the error is logged for troubleshooting.
- **Impact:** Very low — the return value is the primary behavior and is tested.
- **Action:** Not filled — the return value is the critical behavior and is fully tested.

### Gap 3 (P2 — Design Note): `markCredentialHealthy` is tested but not called in production code

- **What's missing:** The `markCredentialHealthy` function is unit-tested (2 tests) but never called in production code. The jwt callback in `auth.ts` resets health inline via `getPrisma().repoConnection.updateMany(...)` rather than calling `markCredentialHealthy`.
- **Why it matters:** This is by design — the story spec's code example for the jwt callback shows the inline `updateMany` call, not a call to `markCredentialHealthy`. The function exists for Epic 3 consumption (`tool-pill-classifier.service.ts`).
- **Impact:** None — this is intentional. The function is tested for correctness so it can be called by Epic 3 without additional test work.
- **Action:** Not filled — by design, not a gap.

---

## Summary

| Section | Verdict |
|---|---|
| Prerequisites | PASS |
| Mode Detection | PASS |
| BMad Artifacts | PASS |
| Framework Configuration | PASS |
| Coverage Analysis | PASS — 207 tests, all passing |
| AC-1 Mapping | PASS — 6 tests (2 unit, 4 integration) |
| AC-2 Mapping | PASS — 8 tests (6 unit, 2 integration) |
| AC-3 Mapping | PASS — 7 tests (2 unit, 5 integration) |
| AC-4 Mapping | PASS (N/A) — no tests needed, UI deferred to Epic 2 |
| Additional Coverage | PASS — 12 tests for getCredentialHealth, getCredentialHealthStatus, updated error codes |
| Duplicate Coverage Avoidance | PASS — Appropriate test level selection |
| Test Infrastructure | N/A — No fixtures/factories/helpers needed |
| Test File Quality | PASS — Priority tags present, Given-When-Then format, co-located |
| Test Validation | PASS — 207/207 tests, 0 lint errors |
| **Overall** | **PASS — Story 1.6 is sufficiently covered** |

### Gap Summary

| # | Priority | Gap | Action |
|---|---|---|---|
| 1 | P2 | `fetchGithubContents` 401 path not directly tested (shares code branch with 403) | Not filled (shared code branch, 403 variant tested) |
| 2 | P2 | `getCredentialHealthStatus` console.error not verified in DB error test | Not filled (observability, not coverage) |
| 3 | P2 | `markCredentialHealthy` tested but not called in production code | Not filled (by design — for Epic 3) |

### Verdict

**PASS — No coverage expansion needed.**

Story 1.6 has comprehensive test coverage across all 4 acceptance criteria:
- 14 unit tests for the credential health service (`resolveOAuthToken`, `markCredentialFailed`/`Healthy`, `getCredentialHealth`, `CredentialFailureError`)
- 9 integration tests for the credential health Server Actions (`getCredentialHealthStatus`, `reauthorizeGitHub`)
- 2 new integration tests for the jwt callback health reset (AC-3)
- 3 new integration tests for `markCredentialFailed` wiring into `connectRepository` 401/403/CredentialFailureError paths (AC-1)
- 1 new unit test for `markCredentialFailed` wiring into `validateRepository` CredentialFailureError path (AC-1)
- 2 updated tests for changed error codes (UNKNOWN → NO_CREDENTIAL)

All 3 gaps are P2 (low priority) and are coverage-adjacent or design-intentional, not functional coverage gaps. All ACs are fully covered at appropriate test levels with no duplicate coverage.
