---
baseline_commit: 30e5d48cb04e14a2f39dae192e5f5821b68786de
---

# Story 1.6: Detect and Recover from Credential Failures

Status: done

## Story

As a user whose repository connection has stopped working,
I want the platform to notice and let me re-authorize without disconnecting my repository,
so that I can keep working without redoing the entire connection setup.

## Acceptance Criteria

### AC-1: 401 detection updates credential health to `failed` within one operation cycle

**Given** a git operation against a connected repository returns HTTP 401
**When** the platform processes that response
**Then** the credential health status is updated to `failed` within one operation cycle, with no silent failure (NFR-R1)

**Note:** A 403 is not a credential failure. It is classified into rate limit (`RATE_LIMITED`), org OAuth App restriction (`ORG_RESTRICTION`), or permission denial (`INSUFFICIENT_PERMISSION` / `MISSING_DIRECTORY`) without calling `markCredentialFailed`. See FINDING-12 in deferred-work.md.

### AC-2: Tenant authorization check before token resolution

**Given** any credential lookup
**When** a token is about to be resolved
**Then** it first passes a tenant authorization check at the service layer — tokens are never resolved across users (NFR-S2)

### AC-3: Re-auth flow restores credential health to `healthy`

**Given** a credential health status of `failed`
**When** the user initiates re-authorization
**Then** a re-auth flow lets them re-grant GitHub OAuth without disconnecting the repository
**And** on success, credential health returns to `healthy`

### AC-4: UI display deferred to Epic 2

**Given** this story's scope
**When** considering UI display
**Then** displaying the failed status visually on the Project Map is delivered in Epic 2 — this story delivers detection, status, and the re-auth flow only

## Tasks / Subtasks

- [x] Task 1: Fix `CredentialHealthStatus` type to match actual codebase values (AC: 1, 3)
  - [x] 1.1 Update `libs/shared-types/src/credential-health.types.ts` — change `CredentialHealthStatus` from `'valid' | 'expired' | 'revoked' | 'unknown'` to `'healthy' | 'failed'` (matches Prisma schema default and existing `repo-connection.actions.ts` usage)
  - [x] 1.2 Verify no existing code references the old status values (`valid`, `expired`, `revoked`, `unknown`) — if any are found, update them

- [x] Task 2: Create credential health service — `apps/web/src/lib/credential-health.ts` (AC: 1, 2)
  - [x] 2.1 Create `CredentialFailureError` class (extends `Error`) — thrown when a git/GitHub API operation returns 401, carrying the HTTP status for caller inspection
  - [x] 2.2 Implement `resolveOAuthToken(userId: string): Promise<string>` — the single tenant-scoped credential resolution point (AC-2). Looks up `OAuthCredential` by `userId` (this `where: { userId }` clause IS the tenant authorization check — tokens are only ever resolved for the requesting user). Throws `CredentialFailureError` if no credential is found. Calls `decryptToken` and returns the plaintext token.
  - [x] 2.3 Implement `markCredentialFailed(userId: string): Promise<void>` — updates `RepoConnection.credentialHealth` to `'failed'` via `updateMany` (no-op if no RepoConnection exists yet — first sign-in before connection)
  - [x] 2.4 Implement `markCredentialHealthy(userId: string): Promise<void>` — updates `RepoConnection.credentialHealth` to `'healthy'` via `updateMany`
  - [x] 2.5 Implement `getCredentialHealth(userId: string): Promise<CredentialHealthStatus | null>` — reads `RepoConnection.credentialHealth`, returns `null` if no RepoConnection exists

- [x] Task 3: Write unit tests for credential health service — `apps/web/src/lib/credential-health.test.ts` (AC: 1, 2)
  - [x] 3.1 Test `resolveOAuthToken` returns decrypted token for valid userId (AC-2)
  - [x] 3.2 Test `resolveOAuthToken` throws `CredentialFailureError` when no OAuthCredential exists (AC-2)
  - [x] 3.3 Test `resolveOAuthToken` throws when `decryptToken` fails (tampered credential, KEK rotation mismatch)
  - [x] 3.4 Test `resolveOAuthToken` only queries by the provided userId — never another user's credential (AC-2 tenant isolation)
  - [x] 3.5 Test `markCredentialFailed` updates `credentialHealth` to `'failed'` (AC-1)
  - [x] 3.6 Test `markCredentialFailed` is a no-op (no throw) when no RepoConnection exists
  - [x] 3.7 Test `markCredentialHealthy` updates `credentialHealth` to `'healthy'` (AC-3)
  - [x] 3.8 Test `markCredentialHealthy` is a no-op when no RepoConnection exists
  - [x] 3.9 Test `getCredentialHealth` returns `'healthy'` or `'failed'` for existing RepoConnection
  - [x] 3.10 Test `getCredentialHealth` returns `null` when no RepoConnection exists

- [x] Task 4: Wire 401 detection into existing GitHub API operations (AC: 1)
  - [x] 4.1 In `repository-validation.actions.ts`: modify `fetchGithubContents` to throw `CredentialFailureError` on HTTP 401 only (currently throws a generic `Error` on any non-OK response). 403 is classified via `detectGithubRateLimit` — rate-limit 403s throw `RateLimitError`, genuine 403s return `null` (path inaccessible). 404 remains `null`. Other non-OK statuses remain generic `Error`.
  - [x] 4.2 In `repo-connection.actions.ts`: refactor `connectRepository` to use `resolveOAuthToken(session.userId)` instead of inline `oAuthCredential.findUnique` + `decryptToken` (AC-2). Replace the inline credential lookup block (lines 51-59) with a call to `resolveOAuthToken`.
  - [x] 4.3 In `repo-connection.actions.ts`: add `markCredentialFailed(session.userId)` call in the 401 error path (line 79-84) — call it before returning the error result, within the same operation cycle (NFR-R1)
  - [x] 4.4 In `repo-connection.actions.ts`: the 403 error path classifies into `RATE_LIMITED`, `ORG_RESTRICTION`, or `INSUFFICIENT_PERMISSION` and does NOT call `markCredentialFailed` — the token is valid but access is denied (resolved per FINDING-12)
  - [x] 4.5 In `repo-connection.actions.ts`: add a catch for `CredentialFailureError` from `inspectBmadSetup` (line 131-138) — call `markCredentialFailed(session.userId)` and return a `NO_CREDENTIAL` error
  - [x] 4.6 In `repository-validation.actions.ts`: refactor `validateRepository` to use `resolveOAuthToken(session.userId)` instead of inline credential lookup + `decryptToken` (lines 286-294) (AC-2)
  - [x] 4.7 In `repository-validation.actions.ts`: add a catch for `CredentialFailureError` from `inspectBmadSetup` (around line 312) — call `markCredentialFailed(session.userId)` and return a `NO_CREDENTIAL` error result

- [x] Task 5: Update existing tests for refactored operations (AC: 1, 2)
  - [x] 5.1 Update `repo-connection.actions.spec.ts` — mock `resolveOAuthToken`, `markCredentialFailed` from `@/lib/credential-health` instead of mocking `decryptToken` directly; add test verifying `markCredentialFailed` is called on 401 response (AC-1)
  - [x] 5.2 Update `repo-connection.actions.spec.ts` — add test verifying `markCredentialFailed` is called on 403 response (AC-1)
  - [x] 5.3 Update `repository-validation.actions.spec.ts` — mock `resolveOAuthToken`, `markCredentialFailed`; add test verifying `markCredentialFailed` is called when `inspectBmadSetup` throws `CredentialFailureError` (AC-1). **Also update two existing tests whose expected error codes change after refactoring**: the test "returns errorCode UNKNOWN when decryptToken throws (corrupted credential)" must now expect `NO_CREDENTIAL` (the `resolveOAuthToken` catch returns `NO_CREDENTIAL` for all resolution failures); the test "returns errorCode UNKNOWN when inspectBmadSetup throws (GitHub API 403)" must now expect `NO_CREDENTIAL` (403 throws `CredentialFailureError`, caught by the new inner catch). Tests for 500 and network failure remain `UNKNOWN` (generic `Error` re-thrown to outer catch).
  - [x] 5.4 Update any test that mocks `oAuthCredential.findUnique` to instead mock `resolveOAuthToken` (the credential lookup is now inside `resolveOAuthToken`, not inline in the action)

- [x] Task 6: Implement re-auth flow — jwt callback + Server Action (AC: 3)
  - [x] 6.1 In `apps/web/src/lib/auth.ts`: after the `oAuthCredential.upsert` block in the jwt callback (line 66), add `repoConnection.updateMany({ where: { userId: user.id }, data: { credentialHealth: 'healthy' } })` — resets health to `healthy` whenever a fresh token is stored (re-auth). Use `updateMany` (not `update`) so it's a no-op if no RepoConnection exists yet. Wrap in `.catch(() => void 0)` is NOT needed — `updateMany` does not throw on zero matches.
  - [x] 6.2 Create `apps/web/src/actions/credential-health.actions.ts` — `'use server'` directive; exports `reauthorizeGitHub(callbackUrl?: string)` that calls `signIn('github', { redirectTo: callbackUrl })` from `@/lib/auth` (AC-3). Also exports `getCredentialHealthStatus()` Server Action that calls `auth()` → `getCredentialHealth(session.userId)` for Epic 2 consumption.
  - [x] 6.3 Create `apps/web/src/actions/credential-health.actions.spec.ts` — integration tests for `reauthorizeGitHub` (calls `signIn('github', ...)` with correct params) and `getCredentialHealthStatus` (returns health for authenticated user, error for unauthenticated)

- [x] Task 7: Update auth credential tests for jwt callback change (AC: 3)
  - [x] 7.1 Update `apps/web/src/lib/auth.credential.spec.ts` — add `repoConnection: { updateMany: mockRepoConnectionUpdateMany }` to the Prisma mock; add test verifying `repoConnection.updateMany` is called with `{ where: { userId }, data: { credentialHealth: 'healthy' } }` after credential upsert (AC-3)
  - [x] 7.2 Add test verifying `repoConnection.updateMany` is NOT called when `account.access_token` is absent (no new token = no health reset)

- [x] Task 8: Verify build, lint, and tests
  - [x] 8.1 Run `yarn nx run-many --target=lint --all --parallel=4` — confirm 0 lint errors
  - [x] 8.2 Run `yarn nx run-many --target=test --all --parallel=4 --passWithNoTests` — confirm all tests pass
  - [x] 8.3 Run `yarn nx build web` — confirm production build succeeds (note: pre-existing Turbopack build failure may persist — verify via `git stash` that any failure is pre-existing, not caused by this story)

## Dev Notes

### Architecture Context

- This story delivers **credential failure detection, health status management, and the re-auth flow** in `apps/web`. The architecture places credential logic in `apps/agent-be/src/credentials/credentials.service.ts` (architecture line 584: "decrypts OAuth token for git operations"), but `apps/agent-be` is still a scaffold (only `main.ts`, `app/`, `sandbox/`, `assets/`). Stories 1.2–1.5 established the pattern of implementing onboarding-adjacent logic in `apps/web` (Server Actions in `apps/web/src/actions/`, utilities in `apps/web/src/lib/`). This story follows that pattern.
- **Real-time SSE propagation** (mid-conversation 401 detection via `tool-pill-classifier.service.ts` emitting `CREDENTIAL_FAILURE` events) is **Epic 3, Story 3.7** — explicitly out of scope here. This story wires detection into the existing GitHub API calls in `apps/web` (`connectRepository`, `validateRepository`).
- The `CredentialHealthStatus` type in `libs/shared-types/src/credential-health.types.ts` was created during Story 1.1 scaffolding with placeholder values (`'valid' | 'expired' | 'revoked' | 'unknown'`) that **do not match** the actual codebase. The Prisma schema default is `"healthy"` (line 46 of `schema.prisma`), and `repo-connection.actions.ts` uses `'healthy'` throughout. The epics and PRD use `'healthy'` and `'failed'`. Task 1 fixes this mismatch.
- The deferred-work log (line 50) confirms: "valid values `"healthy"` / `"failed"` enforced only at the TypeScript layer" — no DB CHECK constraint exists. This story does not add one (out of scope; tracked in deferred-work.md).
- The deferred-work log (line 24) flags: "data.permissions absent or degraded for organization repos accessed via team membership — results in misleading INSUFFICIENT_PERMISSION error." This story does NOT mark the credential as failed on 403 — a 403 from a degraded permission scenario surfaces `INSUFFICIENT_PERMISSION` without triggering a re-auth loop (resolved per FINDING-12).

### Where the Logic Lives

The architecture's `apps/agent-be/src/credentials/credentials.service.ts` is the eventual home for OAuth token decryption and credential health management. When `apps/agent-be` is built (Epic 3), the `resolveOAuthToken` and `markCredentialFailed`/`markCredentialHealthy` functions should be moved or duplicated there. The functions are intentionally kept simple (pure DB + crypto operations) so they can be moved without coupling.

For now, `apps/web` is the sole writer of `RepoConnection.credentialHealth` (via `connectRepository` and this story's new functions). Epic 3's `tool-pill-classifier.service.ts` will also write `failed` status when it detects 401 mid-conversation.

### Critical: Do Not Reinvent

- **DO NOT** create a new `CredentialHealthStatus` type — it already exists in `libs/shared-types/src/credential-health.types.ts`. Fix the values to match the codebase (`'healthy' | 'failed'`).
- **DO NOT** modify the Prisma schema — `RepoConnection.credentialHealth` already exists with `String @default("healthy")`. No migration needed.
- **DO NOT** create a new Prisma client — use `getPrisma()` from `apps/web/src/lib/prisma.ts`.
- **DO NOT** create a new auth utility — use `auth()` from `apps/web/src/lib/auth.ts` and `signIn` exported from the same file.
- **DO NOT** create a new crypto utility — use `decryptToken` from `apps/web/src/lib/crypto.ts`.
- **DO NOT** implement UI for the Credential Error Banner or re-auth modal — that is Epic 2, Story 2.2 (UX-DR10). This story delivers the Server Actions and backend logic that Epic 2's UI will call.
- **DO NOT** implement real-time SSE `CREDENTIAL_FAILURE` event emission — that is Epic 3, Story 3.7.

### apps/web/src/lib/credential-health.ts

```typescript
import { getPrisma } from './prisma';
import { decryptToken } from './crypto';
import type { CredentialHealthStatus } from '@bmad-easy/shared-types';

/** Thrown when a git/GitHub API operation returns HTTP 401. */
export class CredentialFailureError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Credential failure: GitHub API returned ${statusCode}`);
    this.name = 'CredentialFailureError';
  }
}

/**
 * Tenant-scoped OAuth token resolution (NFR-S2).
 *
 * This is the SINGLE point where plaintext OAuth tokens are resolved.
 * The `where: { userId }` clause IS the tenant authorization check —
 * tokens are never resolved across users.
 *
 * @throws {CredentialFailureError} if no OAuthCredential exists for the user
 * @throws if decryptToken fails (tampered credential, KEK mismatch)
 */
export async function resolveOAuthToken(userId: string): Promise<string> {
  const credential = await getPrisma().oAuthCredential.findUnique({
    where: { userId },
  });
  if (!credential) {
    throw new CredentialFailureError(401);
  }
  return decryptToken(credential);
}

/**
 * Mark a user's repository connection credential health as `failed`.
 * Called when a git/GitHub API operation returns 401 (NFR-R1).
 * No-op if no RepoConnection exists (first sign-in before connection).
 */
export async function markCredentialFailed(userId: string): Promise<void> {
  await getPrisma().repoConnection.updateMany({
    where: { userId },
    data: { credentialHealth: 'failed' },
  });
}

/**
 * Mark a user's repository connection credential health as `healthy`.
 * Called after successful re-authorization (AC-3).
 * No-op if no RepoConnection exists.
 */
export async function markCredentialHealthy(userId: string): Promise<void> {
  await getPrisma().repoConnection.updateMany({
    where: { userId },
    data: { credentialHealth: 'healthy' },
  });
}

/**
 * Read a user's current credential health status.
 * @returns `null` if no RepoConnection exists
 */
export async function getCredentialHealth(
  userId: string,
): Promise<CredentialHealthStatus | null> {
  const conn = await getPrisma().repoConnection.findUnique({
    where: { userId },
    select: { credentialHealth: true },
  });
  return (conn?.credentialHealth as CredentialHealthStatus | null) ?? null;
}
```

**Design decisions:**

- **`resolveOAuthToken` throws `CredentialFailureError(401)` when no credential exists**: This treats a missing credential as a credential failure, which is semantically correct — the user has no valid token. Callers catch `CredentialFailureError` and call `markCredentialFailed`, which is a no-op if no RepoConnection exists.
- **`updateMany` instead of `update`**: `update` throws P2025 if no record matches. `updateMany` silently updates 0 rows. This is the correct behavior — `markCredentialFailed`/`markCredentialHealthy` should not throw if the user hasn't connected a repository yet.
- **`CredentialFailureError` carries `statusCode`**: Allows callers to distinguish 401 (token expired/revoked) from 403 (permission denied, org restriction) if needed for error messaging. Only 401 triggers `markCredentialFailed`; 403 is classified and does not mark the credential as failed (per FINDING-12).
- **No `try/catch` in `resolveOAuthToken` for `decryptToken`**: If decryption fails (tampered credential, KEK rotation mismatch), the error propagates to the caller's `resolveOAuthToken` catch block, which returns `NO_CREDENTIAL`. A tampered or unreadable credential is unusable, so prompting re-auth is the correct user action.

### apps/web/src/actions/credential-health.actions.ts

```typescript
'use server';

import { auth, signIn } from '@/lib/auth';
import { getCredentialHealth } from '@/lib/credential-health';
import type { CredentialHealthStatus } from '@bmad-easy/shared-types';

export type GetCredentialHealthResult =
  | { success: true; status: CredentialHealthStatus }
  | { success: false; error: string };

/**
 * Returns the current credential health status for the authenticated user.
 * Called by Epic 2's Project Map / Artifact Browser to decide whether to
 * show the Credential Error Banner (UX-DR10).
 */
export async function getCredentialHealthStatus(): Promise<GetCredentialHealthResult> {
  const session = await auth();
  if (!session?.userId) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const health = await getCredentialHealth(session.userId);
    if (health === null) {
      // No RepoConnection — user hasn't connected a repository yet.
      // Treat as healthy (no connection = no credential failure).
      return { success: true, status: 'healthy' as CredentialHealthStatus };
    }
    return { success: true, status: health };
  } catch (err) {
    console.error('[getCredentialHealthStatus] Unexpected error:', err);
    return { success: false, error: 'Failed to check credential health' };
  }
}

/**
 * Initiates GitHub OAuth re-authorization without disconnecting the repository.
 *
 * Calls `signIn('github')` which redirects to GitHub's OAuth flow. On success,
 * the jwt callback in auth.ts stores the new encrypted token AND resets
 * RepoConnection.credentialHealth to 'healthy' (AC-3).
 *
 * The RepoConnection (repoUrl) is never touched by the re-auth flow —
 * only the OAuthCredential is refreshed.
 *
 * @param callbackUrl - URL to redirect to after successful re-auth (default: current page)
 */
export async function reauthorizeGitHub(callbackUrl?: string): Promise<void> {
  await signIn('github', { redirectTo: callbackUrl });
}
```

**Design decisions:**

- **`reauthorizeGitHub` is a thin wrapper around `signIn('github')`**: Auth.js v5's `signIn` handles the OAuth redirect. The jwt callback in `auth.ts` handles storing the new token and resetting health. This Server Action exists so Epic 2's UI has a callable entry point (the `signIn` function from `@/lib/auth` is not directly callable from Client Components without a Server Action wrapper in some Next.js configurations).
- **`getCredentialHealthStatus` returns `healthy` when no RepoConnection exists**: A user who hasn't connected a repository yet has no credential failure. Epic 2's UI should not show the Credential Error Banner for users in onboarding.
- **`reauthorizeGitHub` accepts `callbackUrl`**: After re-auth, the user should return to the page they were on (e.g., Project Map). Epic 2's UI passes the current pathname.

### auth.ts jwt callback change

Add the following after the `oAuthCredential.upsert` block (after line 66, before the `else` at line 67):

```typescript
// Reset credential health to 'healthy' — a fresh token means credentials are valid.
// updateMany is a no-op if no RepoConnection exists yet (first sign-in before connection).
await getPrisma().repoConnection.updateMany({
  where: { userId: user.id },
  data: { credentialHealth: 'healthy' },
});
```

This fires on every sign-in where `account?.provider === 'github'` and `account.access_token` is present — i.e., initial sign-in AND re-authorization. On initial sign-in, there's no RepoConnection yet, so `updateMany` updates 0 rows (no-op). On re-authorization, it resets the health to `healthy`.

### fetchGithubContents modification (repository-validation.actions.ts)

Current (line 66-68):
```typescript
if (!response.ok) {
  throw new Error(`GitHub API error ${response.status} for path: ${path}`);
}
```

New:
```typescript
if (response.status === 401) {
  throw new CredentialFailureError(401);
}
if (response.status === 403) {
  const body = await response.json().catch(() => undefined);
  const rateLimit = detectGithubRateLimit(response, body);
  if (rateLimit) throw rateLimit;
  // Not a credential failure — token is valid but lacks access to this
  // resource. Return null so the caller handles it as an inaccessible path
  // without marking the credential as failed (FINDING-12).
  return null;
}
if (!response.ok) {
  throw new Error(`GitHub API error ${response.status} for path: ${path}`);
}
```

Add imports: `import { CredentialFailureError } from '@/lib/credential-health';` and `import { detectGithubRateLimit, RateLimitError } from '@/lib/repository-validation';`

### connectRepository refactoring (repo-connection.actions.ts)

Replace the inline credential lookup (lines 51-59):
```typescript
const credential = await getPrisma().oAuthCredential.findUnique({
  where: { userId: session.userId },
});
if (!credential) {
  return {
    error: 'No OAuth credential found. Please sign out and sign in again.',
    errorCode: 'NO_CREDENTIAL',
  };
}
```

With:
```typescript
let accessToken: string;
try {
  accessToken = await resolveOAuthToken(session.userId);
} catch {
  return {
    error: 'No OAuth credential found. Please sign out and sign in again.',
    errorCode: 'NO_CREDENTIAL',
  };
}
```

And remove the later `const accessToken = decryptToken(credential);` (line 62).

Add `markCredentialFailed` call in the 401 error path only (403 does NOT call it — per FINDING-12):
```typescript
// After detecting 401 (line 79):
if (response.status === 401) {
  await markCredentialFailed(session.userId);
  return {
    error: 'Your GitHub access token has expired or been revoked. Please sign out and sign in again.',
    errorCode: 'NO_CREDENTIAL',
  };
}

// After detecting 403 (line 93) — classify, do NOT mark credential failed:
if (response.status === 403) {
  const body = await response.json().catch(() => ({}));
  const rateLimit = detectGithubRateLimit(response, body);
  if (rateLimit) {
    return { error: rateLimitMessage(rateLimit), errorCode: 'RATE_LIMITED' };
  }
  // ... existing org-restriction / insufficient-permission logic
  // (returns ORG_RESTRICTION or INSUFFICIENT_PERMISSION — no markCredentialFailed)
}
```

Add `CredentialFailureError` catch around `inspectBmadSetup`:
```typescript
try {
  const validation = await inspectBmadSetup(accessToken, owner, repo);
  // ...
} catch (err) {
  if (err instanceof CredentialFailureError) {
    await markCredentialFailed(session.userId);
    return {
      error: 'Your GitHub access token has expired or been revoked. Please sign out and sign in again.',
      errorCode: 'NO_CREDENTIAL',
    };
  }
  throw err; // re-throw for the outer catch
}
```

Add imports: `import { resolveOAuthToken, markCredentialFailed, CredentialFailureError } from '@/lib/credential-health';`

Remove import: `import { decryptToken } from '@/lib/crypto';` (no longer used directly).

### validateRepository refactoring (repository-validation.actions.ts)

Replace the inline credential lookup (lines 286-294) with `resolveOAuthToken`, same pattern as `connectRepository`.

Add `CredentialFailureError` catch around `inspectBmadSetup` (line 312):
```typescript
try {
  const result = await inspectBmadSetup(accessToken, owner, repo);
  cacheSet(key, result);
  return result;
} catch (err) {
  if (err instanceof CredentialFailureError) {
    await markCredentialFailed(session.userId);
    return {
      error: 'Your GitHub access token has expired or been revoked. Please sign out and sign in again.',
      errorCode: 'NO_CREDENTIAL',
    };
  }
  throw err;
}
```

Remove import: `import { decryptToken } from '@/lib/crypto';` (no longer used directly).

### Critical Learnings from Previous Stories

**From Story 1.5 (Resolve Git Identity):**
- `getPrisma()` is the singleton accessor — `apps/web/src/lib/prisma.ts`
- `auth()` returns `Promise<Session | null>` — always `await` it
- `session.userId` is typed as `string | undefined` (optional) — always guard with `?.`
- Server Actions return typed result unions, not exceptions for expected failures
- `try/catch` wraps the DB + business logic; unexpected errors return an error result
- Tests mock `@/lib/auth`, `@/lib/prisma`, `@/lib/crypto` at the module level using `jest.mock()`
- Use `jest.clearAllMocks()` in `afterEach` (no `spyOn` used, so `clearAllMocks` suffices)
- `@jest-environment node` directive at the top of test files for server-side tests

**From Story 1.4 (Validate BMAD Initialization):**
- `inspectBmadSetup` is a pure function exported from `repository-validation.actions.ts` — it takes `accessToken`, `owner`, `repo` and makes GitHub API calls
- `fetchGithubContents` is a private helper in the same file — it's the function that makes the actual HTTP calls and could encounter 401/403
- The validation cache (`cacheGet`/`cacheSet`) is module-level — tests must clear it between runs
- 157 web tests pass as of Story 1.4 completion

**From Story 1.3 (Connect a Repository by URL):**
- `connectRepository` handles 401 (token expired), 404 (repo not found), 403 (insufficient permission / org restriction) explicitly
- The 401 path returns `NO_CREDENTIAL` error code — this story adds `markCredentialFailed` before that return
- The 403 path distinguishes rate-limit, org-restriction from insufficient-permission — none trigger `markCredentialFailed` (per FINDING-12)
- `decryptToken` throws on tampered/invalid credentials — currently caught as `UNKNOWN` error
- The `oAuthCredential.findUnique` + `decryptToken` pattern is used in both `connectRepository` and `validateRepository` — this story extracts it into `resolveOAuthToken`

**From Story 1.2 (Sign In with GitHub):**
- The `jwt` callback in `auth.ts` fires on every sign-in. The `if (account?.provider === 'github' && profile)` branch only fires when `account` is present (initial sign-in / re-auth), NOT on session refresh.
- The `jwt` callback already upserts `User` and `OAuthCredential` — this story adds `RepoConnection.updateMany` to reset health.
- `signIn('github')` from `@/lib/auth` initiates the OAuth redirect flow — it's the re-auth entry point.
- `auth.config.ts` is edge-safe (no Prisma) — `auth.ts` is Node.js-only. Server Actions run in Node.js, so `auth()` is safe to call.

**From Story 1.1 (Scaffold):**
- Package manager is now **Yarn (4.17.0)**, not pnpm. Use `yarn nx` for all commands, not `pnpm exec nx`.
- Next.js version is 16 (not 15) — async props must be awaited
- Prisma 7 uses WASM client + PrismaPg adapter — `getPrisma()` handles this
- Tests co-located with source (`*.test.ts` / `*.spec.ts` next to the file under test)
- `@jest-environment node` directive at the top of test files for server-side tests

### Code Structure Requirements

- Follow existing patterns from Stories 1.2–1.5 for Server Actions and utilities
- Use `@bmad-easy/shared-types` for `CredentialHealthStatus` type (after fixing it in Task 1)
- Use `getPrisma()` for DB access, `auth()` for session, `decryptToken` for crypto
- Co-locate tests with source files
- The `CredentialFailureError` class is a local error type — it lives in `apps/web/src/lib/credential-health.ts`, not in shared-types (it's an app-level concern, not a cross-service contract)

### Security Considerations

- **NFR-S2 enforcement**: `resolveOAuthToken(userId)` is the single point where plaintext tokens are resolved. The `where: { userId }` clause ensures tokens are only ever resolved for the requesting user. All existing inline credential lookups are replaced with calls to this function.
- **No token in error messages**: `CredentialFailureError` carries only the HTTP status code, never the token. Error messages returned to the client say "Your GitHub access token has expired or been revoked" — never the token itself.
- **Re-auth preserves RepoConnection**: The `signIn('github')` flow only touches `OAuthCredential` (via the jwt callback). `RepoConnection` is only updated to reset `credentialHealth` — `repoUrl` is never modified by re-auth.
- **`markCredentialFailed` is fire-and-forget-safe**: It uses `updateMany` which doesn't throw on zero matches. A failed credential mark should never prevent the error from being returned to the user.

### Performance Requirements

- `resolveOAuthToken` makes a single Prisma `findUnique` + a `decryptToken` call — single DB round-trip + in-memory crypto. No caching needed.
- `markCredentialFailed`/`markCredentialHealthy` make a single `updateMany` call — single DB round-trip.
- `getCredentialHealth` makes a single `findUnique` with `select: { credentialHealth: true }` — reads one column.
- All operations are O(1) with respect to data size.

### Testing Requirements

- **Unit tests** (`credential-health.test.ts`): cover all functions — `resolveOAuthToken` (valid, missing credential, decrypt failure, tenant isolation), `markCredentialFailed` (updates, no-op on missing), `markCredentialHealthy` (updates, no-op on missing), `getCredentialHealth` (returns status, returns null)
- **Integration tests** (`credential-health.actions.spec.ts`): cover Server Actions — `reauthorizeGitHub` (calls signIn with correct params), `getCredentialHealthStatus` (authenticated, unauthenticated, no RepoConnection, DB error)
- **Updated tests** (`auth.credential.spec.ts`): verify jwt callback resets credentialHealth to 'healthy' after storing new token
- **Updated tests** (`repo-connection.actions.spec.ts`): verify `markCredentialFailed` is called on 401 and NOT called on 403, verify `resolveOAuthToken` is used instead of inline lookup
- **Updated tests** (`repository-validation.actions.spec.ts`): verify `markCredentialFailed` is called when `inspectBmadSetup` throws `CredentialFailureError`
- No E2E tests needed — this story has no UI surface (AC-4)

### Project Structure Notes

```
apps/web/src/
  lib/
    credential-health.ts                           ← NEW (resolveOAuthToken, markCredentialFailed/Healthy, getCredentialHealth, CredentialFailureError)
    credential-health.test.ts                      ← NEW (unit tests)
    auth.ts                                        ← UPDATE (jwt callback: reset credentialHealth to 'healthy' on new token)
    auth.credential.spec.ts                        ← UPDATE (mock repoConnection.updateMany, add health-reset test)
  actions/
    credential-health.actions.ts                   ← NEW (reauthorizeGitHub, getCredentialHealthStatus Server Actions)
    credential-health.actions.spec.ts              ← NEW (integration tests)
    repo-connection.actions.ts                     ← UPDATE (use resolveOAuthToken, add markCredentialFailed on 401 only)
    repo-connection.actions.spec.ts                ← UPDATE (mock resolveOAuthToken/markCredentialFailed, add 401 mark tests, 403 no-mark tests)
    repository-validation.actions.ts               ← UPDATE (use resolveOAuthToken, throw CredentialFailureError on 401 only, classify 403, catch and markCredentialFailed)
    repository-validation.actions.spec.ts          ← UPDATE (mock resolveOAuthToken/markCredentialFailed, add CredentialFailureError catch test)

libs/shared-types/src/
  credential-health.types.ts                       ← UPDATE (fix CredentialHealthStatus to 'healthy' | 'failed')
```

No changes to:
- `libs/database-schemas/src/prisma/schema.prisma` — `RepoConnection.credentialHealth` already exists
- `apps/web/src/lib/crypto.ts` — `decryptToken` and `encryptToken` unchanged
- `apps/web/src/lib/prisma.ts` — no changes needed
- `apps/web/src/lib/auth.config.ts` — no changes needed (edge-safe config unchanged)

### Dependencies

- **Story 1.2**: Must be complete — provides the `auth.ts` jwt callback and `signIn` export
- **Story 1.3**: Must be complete — provides `connectRepository` (401/403 paths to wire), `OAuthCredential` model, `decryptToken`
- **Story 1.4**: Must be complete — provides `inspectBmadSetup`/`validateRepository` (GitHub API calls to wire), `fetchGithubContents`
- **Story 1.1**: Provides the Nx monorepo structure and shared libraries

### Integration Points

- **Consumed by Epic 2, Story 2.2** (View the Project Map): The `getCredentialHealthStatus` Server Action is called by the Project Map to decide whether to show the Credential Error Banner (UX-DR10). The `reauthorizeGitHub` Server Action is called by the re-auth modal's "Re-authorize" button.
- **Consumed by Epic 2, Story 2.4** (Browse and Read All Committed Artifacts): Same `getCredentialHealthStatus` for the Artifact Browser's Credential Error Banner.
- **Consumed by Epic 3, Story 3.7** (Receive Real-Time Credential Failure Alerts): The `markCredentialFailed` function is called by `tool-pill-classifier.service.ts` when it detects 401 in the sandbox-agent JSONL stream. The `CredentialFailureError` pattern established here is the precedent for that flow. A 403 mid-conversation is classified, not treated as a credential failure (per FINDING-12).
- **Not consumed by**: `apps/agent-be` — still a scaffold. When built, `resolveOAuthToken` and `markCredentialFailed`/`markCredentialHealthy` should be moved or duplicated to `apps/agent-be/src/credentials/credentials.service.ts` (they are simple DB + crypto operations with no `apps/web`-specific dependencies beyond `getPrisma()` and `decryptToken`, which are shared-library patterns).

## Architecture Compliance

### Monorepo Structure
```
bmad-easy/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── lib/
│       │   │   ├── credential-health.ts (NEW)
│       │   │   ├── credential-health.test.ts (NEW)
│       │   │   ├── auth.ts (UPDATE — jwt callback)
│       │   │   ├── auth.credential.spec.ts (UPDATE)
│       │   │   └── (crypto.ts, prisma.ts unchanged)
│       │   └── actions/
│       │       ├── credential-health.actions.ts (NEW)
│       │       ├── credential-health.actions.spec.ts (NEW)
│       │       ├── repo-connection.actions.ts (UPDATE)
│       │       ├── repo-connection.actions.spec.ts (UPDATE)
│       │       ├── repository-validation.actions.ts (UPDATE)
│       │       └── repository-validation.actions.spec.ts (UPDATE)
└── libs/
    └── shared-types/
        └── src/
            └── credential-health.types.ts (UPDATE — fix status values)
```

### API Contract

This story has no HTTP API endpoint. The Server Actions are callable only from server-side code in `apps/web`.

**Server Action return types:**

```typescript
// getCredentialHealthStatus
type GetCredentialHealthResult =
  | { success: true; status: CredentialHealthStatus }  // 'healthy' | 'failed'
  | { success: false; error: string };

// reauthorizeGitHub
// Returns void (throws NEXT_REDIRECT to GitHub OAuth)
```

### Data Flow

**Credential failure detection (AC-1):**
1. User triggers a git/GitHub API operation (connect repository, validate repository)
2. `resolveOAuthToken(userId)` resolves the plaintext token (AC-2 tenant check)
3. GitHub API call returns 401 or 403
4. `markCredentialFailed(userId)` updates `RepoConnection.credentialHealth` to `'failed'` (NFR-R1: within one operation cycle)
5. Error returned to caller with `NO_CREDENTIAL` error code

**Re-auth flow (AC-3):**
1. User initiates re-authorization (via `reauthorizeGitHub()` Server Action — UI in Epic 2)
2. `signIn('github')` redirects to GitHub OAuth
3. GitHub redirects back with new `access_token`
4. jwt callback fires: upserts `OAuthCredential` with new encrypted token
5. jwt callback resets `RepoConnection.credentialHealth` to `'healthy'` via `updateMany`
6. User is redirected to `callbackUrl` (or default page)

## Library/Framework Requirements

### Required Libraries (Already Available)
- `zod`: ^4.4.3 (root `package.json`) — not needed for this story (no new input validation)
- `@bmad-easy/shared-types` — provides `CredentialHealthStatus` type (after Task 1 fix)
- `next-auth`: ^5.0.0-beta.31 — provides `signIn` function for re-auth flow
- No new packages to install

### Type Definitions (Update Needed)
The `CredentialHealthStatus` type must be fixed in `libs/shared-types/src/credential-health.types.ts`:

Current (incorrect):
```typescript
export type CredentialHealthStatus = 'valid' | 'expired' | 'revoked' | 'unknown';
```

Fixed:
```typescript
export type CredentialHealthStatus = 'healthy' | 'failed';
```

The `CredentialHealthEvent` interface is retained unchanged (it may be used by Epic 3's `CREDENTIAL_FAILURE` SSE event):
```typescript
export interface CredentialHealthEvent {
  status: CredentialHealthStatus;
  checkedAt: Date;
}
```

## File Structure Requirements

### New Files to Create
1. `apps/web/src/lib/credential-health.ts` — `resolveOAuthToken`, `markCredentialFailed`, `markCredentialHealthy`, `getCredentialHealth`, `CredentialFailureError`
2. `apps/web/src/lib/credential-health.test.ts` — unit tests for all functions
3. `apps/web/src/actions/credential-health.actions.ts` — `reauthorizeGitHub`, `getCredentialHealthStatus` Server Actions
4. `apps/web/src/actions/credential-health.actions.spec.ts` — integration tests

### Files to Update
1. `libs/shared-types/src/credential-health.types.ts` — fix `CredentialHealthStatus` values
2. `apps/web/src/lib/auth.ts` — jwt callback: add `repoConnection.updateMany` to reset health
3. `apps/web/src/lib/auth.credential.spec.ts` — mock `repoConnection.updateMany`, add health-reset test
4. `apps/web/src/actions/repo-connection.actions.ts` — use `resolveOAuthToken`, add `markCredentialFailed` on 401 only
5. `apps/web/src/actions/repo-connection.actions.spec.ts` — update mocks, add 401 mark tests and 403 no-mark tests
6. `apps/web/src/actions/repository-validation.actions.ts` — use `resolveOAuthToken`, throw `CredentialFailureError` on 401 only, classify 403, catch and `markCredentialFailed`
7. `apps/web/src/actions/repository-validation.actions.spec.ts` — update mocks, add `CredentialFailureError` catch test

## Testing Requirements

### Unit Tests (credential-health.test.ts)
- [ ] `resolveOAuthToken` returns decrypted token for valid userId (AC-2)
- [ ] `resolveOAuthToken` throws `CredentialFailureError` when no OAuthCredential exists (AC-2)
- [ ] `resolveOAuthToken` throws when `decryptToken` fails (tampered credential)
- [ ] `resolveOAuthToken` queries only by the provided userId — tenant isolation (AC-2)
- [ ] `markCredentialFailed` updates `credentialHealth` to `'failed'` (AC-1)
- [ ] `markCredentialFailed` is a no-op (no throw) when no RepoConnection exists
- [ ] `markCredentialHealthy` updates `credentialHealth` to `'healthy'` (AC-3)
- [ ] `markCredentialHealthy` is a no-op when no RepoConnection exists
- [ ] `getCredentialHealth` returns `'healthy'` or `'failed'` for existing RepoConnection
- [ ] `getCredentialHealth` returns `null` when no RepoConnection exists

### Integration Tests (credential-health.actions.spec.ts)
- [ ] `getCredentialHealthStatus` returns `healthy` for authenticated user with healthy connection
- [ ] `getCredentialHealthStatus` returns `failed` for authenticated user with failed connection
- [ ] `getCredentialHealthStatus` returns `healthy` for authenticated user with no RepoConnection
- [ ] `getCredentialHealthStatus` returns error for unauthenticated request
- [ ] `getCredentialHealthStatus` returns error on unexpected DB failure
- [ ] `reauthorizeGitHub` calls `signIn('github')` with correct parameters (AC-3)
- [ ] `reauthorizeGitHub` passes `callbackUrl` as `redirectTo` to `signIn`

### Updated Tests (auth.credential.spec.ts)
- [ ] jwt callback calls `repoConnection.updateMany` with `{ where: { userId }, data: { credentialHealth: 'healthy' } }` after credential upsert (AC-3)
- [ ] jwt callback does NOT call `repoConnection.updateMany` when `account.access_token` is absent

### Updated Tests (repo-connection.actions.spec.ts)
- [ ] `connectRepository` calls `resolveOAuthToken` instead of inline credential lookup (AC-2)
- [ ] `connectRepository` calls `markCredentialFailed` on 401 response (AC-1)
- [ ] `connectRepository` does NOT call `markCredentialFailed` on 403 response — token is valid, access denied (AC-1, FINDING-12)
- [ ] `connectRepository` calls `markCredentialFailed` when `inspectBmadSetup` throws `CredentialFailureError` (AC-1)

### Updated Tests (repository-validation.actions.spec.ts)
- [ ] `validateRepository` calls `resolveOAuthToken` instead of inline credential lookup (AC-2)
- [ ] `validateRepository` calls `markCredentialFailed` when `inspectBmadSetup` throws `CredentialFailureError` (AC-1)
- [ ] `fetchGithubContents` throws `CredentialFailureError` on 401 response
- [ ] `fetchGithubContents` throws `RateLimitError` on rate-limit 403, returns `null` on genuine 403 (does NOT throw `CredentialFailureError`)
- [ ] Existing test "returns errorCode UNKNOWN when decryptToken throws" updated to expect `NO_CREDENTIAL` (resolution failure now caught by `resolveOAuthToken` catch)
- [ ] Existing test "returns errorCode UNKNOWN when inspectBmadSetup throws (GitHub API 403)" updated to expect `MISSING_DIRECTORY` (genuine 403 returns `null`, not `CredentialFailureError`)

## Previous Story Intelligence

**From Story 1.5 (Resolve Git Identity):**
- Implemented in `apps/web/src/lib/git-identity.ts` and `apps/web/src/actions/git-identity.actions.ts`
- Pure functions in `lib/`, Server Actions in `actions/` — this story follows the same split
- Tests mock `@/lib/auth`, `@/lib/prisma`, `@/lib/crypto` at the module level using `jest.mock()`
- Use `jest.clearAllMocks()` in `afterEach` (no `spyOn` used, so `clearAllMocks` suffices)
- `@jest-environment node` directive at the top of test files for server-side tests
- 178 web tests pass as of Story 1.5 completion — this story's new tests will add to that count

**From Story 1.4 (Validate BMAD Initialization):**
- `inspectBmadSetup` is exported from `repository-validation.actions.ts` and called by `connectRepository` in `repo-connection.actions.ts`
- `fetchGithubContents` is a private helper — this story modifies it to throw `CredentialFailureError`
- The validation cache (`cacheGet`/`cacheSet`) is module-level — tests must clear it

**From Story 1.3 (Connect a Repository by URL):**
- `connectRepository` handles 401/403 explicitly — this story adds `markCredentialFailed` calls
- `decryptToken` is in `apps/web/src/lib/crypto.ts` — this story wraps it in `resolveOAuthToken`
- `oAuthCredential.findUnique({ where: { userId } })` is the existing credential lookup pattern — this story extracts it into `resolveOAuthToken`

**From Story 1.2 (Sign In with GitHub):**
- The `jwt` callback in `auth.ts` upserts `OAuthCredential` — this story adds `RepoConnection.updateMany` to the same callback
- `signIn('github')` is exported from `@/lib/auth` — this story wraps it in `reauthorizeGitHub`
- The `auth.credential.spec.ts` test file captures the jwt callback config via `NextAuth` mock — this story adds `repoConnection.updateMany` to the Prisma mock

**Key Learnings to Apply:**
- Follow the Server Actions pattern from Stories 1.3, 1.4, 1.5
- Use `getPrisma()` for DB access, `auth()` for session, `decryptToken` for crypto
- Mock at the module level in tests
- Co-locate tests with source files
- Use `@bmad-easy/shared-types` for shared types
- Use `yarn nx` for all task commands (package manager migrated from pnpm to yarn)

## Git Intelligence

**Recent commits relevant to this story:**
- `0c04d93 docs: readme explanation on ntfy.sh` — documentation
- `0013077 ci: add ntfy.sh extension to vscode` — CI config
- `05aaaf1 chore: add ntfy to n8n bmad flow, harden workflow` — n8n workflow
- `94b7756 feat: finalize story 1.5` — Story 1.5 complete, `resolveGitIdentity` + `getGitIdentity` implemented
- `e5ab49a feat: story 1.5 done)` — Story 1.5 implementation
- `438ecf2 chore: migrate package manager from pnpm to yarn` — **CRITICAL**: package manager is now Yarn, not pnpm. Use `yarn nx` for all commands.

**Key patterns from working tree:**
- Server Actions in `apps/web/src/actions/` — `repo-connection.actions.ts`, `repository-validation.actions.ts`, `git-identity.actions.ts`
- Pure utilities in `apps/web/src/lib/` — `crypto.ts`, `prisma.ts`, `auth.ts`, `auth.config.ts`, `git-identity.ts`
- Shared types in `libs/shared-types/src/` — `credential-health.types.ts` (needs fixing), `sandbox.interface.ts`, `repository-validation.ts`
- Prisma schema in `libs/database-schemas/src/prisma/schema.prisma` — `RepoConnection.credentialHealth` already exists with `String @default("healthy")`
- Auth in `apps/web/src/lib/auth.ts` — jwt callback upserts User + OAuthCredential; this story adds RepoConnection health reset

## References

- **Epics Source**: `_bmad-output/planning-artifacts/epics.md` lines 354-377 — Story 1.6 ACs
- **PRD FR-4**: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` lines 160-169 — Credential Health Monitoring
- **PRD NFR-S2**: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` line 441 — Credential isolation (tenant-scoped lookups)
- **PRD NFR-R1**: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` — Credential health update within one operation cycle of 401
- **Architecture**: `_bmad-output/planning-artifacts/architecture.md` — credentials service location (line 584), credential failure propagation (line 655), multi-tenant credential isolation (line 87, 682), OAuth token lifecycle (line 90)
- **Shared Types**: `libs/shared-types/src/credential-health.types.ts` — `CredentialHealthStatus` type (needs fixing)
- **Prisma Schema**: `libs/database-schemas/src/prisma/schema.prisma` — `RepoConnection` model (lines 42-53), `credentialHealth` field (line 46)
- **Auth Implementation**: `apps/web/src/lib/auth.ts` — jwt callback upserts User + OAuthCredential (lines 25-70)
- **Auth Config**: `apps/web/src/lib/auth.config.ts` — GitHub OAuth provider, scope `read:user user:email repo`
- **Crypto**: `apps/web/src/lib/crypto.ts` — `encryptToken`, `decryptToken` (AES-256-GCM envelope encryption)
- **Story 1.5**: `_bmad-output/implementation-artifacts/1-5-resolve-git-identity-for-commit-attribution.md` — Server Actions pattern, test patterns, package manager note
- **Story 1.4**: `_bmad-output/implementation-artifacts/1-4-validate-bmad-initialization-in-the-connected-repository.md` — `inspectBmadSetup`, `fetchGithubContents`, validation cache
- **Story 1.3**: `_bmad-output/implementation-artifacts/1-3-connect-a-repository-by-url.md` — `connectRepository`, 401/403 handling, `OAuthCredential` model
- **Story 1.2**: `_bmad-output/implementation-artifacts/1-2-sign-in-with-github.md` — GitHub OAuth, jwt callback, `signIn` export
- **Deferred Work**: `_bmad-output/implementation-artifacts/deferred-work.md` line 24 — org-restriction permission degradation mitigation; line 50 — credential_health CHECK constraint
- **Sprint Change Proposal**: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-01.md` — pnpm → yarn migration (use `yarn nx` for all commands)

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

No debug issues encountered. All tasks implemented in a single pass without failures.

### Completion Notes List

- **Task 1**: Fixed `CredentialHealthStatus` type from `'valid' | 'expired' | 'revoked' | 'unknown'` to `'healthy' | 'failed'` in `libs/shared-types/src/credential-health.types.ts`. Verified no code references the old values.
- **Task 2**: Created `apps/web/src/lib/credential-health.ts` with `CredentialFailureError`, `resolveOAuthToken`, `markCredentialFailed`, `markCredentialHealthy`, and `getCredentialHealth`. Followed the exact design from the story Dev Notes — `resolveOAuthToken` is the single tenant-scoped credential resolution point (NFR-S2), `updateMany` used for no-op-safe health updates.
- **Task 3**: Created `apps/web/src/lib/credential-health.test.ts` with 14 unit tests covering all functions — resolveOAuthToken (valid, missing, decrypt failure, tenant isolation), markCredentialFailed (updates, no-op), markCredentialHealthy (updates, no-op), getCredentialHealth (returns status, returns null).
- **Task 4**: Wired 401/403 detection into `fetchGithubContents` (throws `CredentialFailureError`), refactored `connectRepository` and `validateRepository` to use `resolveOAuthToken` instead of inline credential lookup, added `markCredentialFailed` calls in 401/403 error paths and `CredentialFailureError` catches around `inspectBmadSetup`.
- **Task 5**: Updated `repo-connection.actions.spec.ts` and `repository-validation.actions.spec.ts` — replaced `oAuthCredential.findUnique`/`decryptToken` mocks with `resolveOAuthToken`/`markCredentialFailed` mocks, added tests verifying `markCredentialFailed` is called on 401/403, updated two existing tests whose error codes changed from `UNKNOWN` to `NO_CREDENTIAL`.
- **Task 6**: Added `repoConnection.updateMany` to jwt callback in `auth.ts` (resets health to `healthy` on re-auth), created `credential-health.actions.ts` with `reauthorizeGitHub` and `getCredentialHealthStatus` Server Actions, created `credential-health.actions.spec.ts` with 9 integration tests.
- **Task 7**: Updated `auth.credential.spec.ts` — added `repoConnection.updateMany` to Prisma mock, added 2 tests verifying health reset on new token and no-reset when `access_token` absent.
- **Task 8**: Lint: 0 errors (9 pre-existing warnings). Tests: 207 pass across all projects (29 new tests added). Build: production build succeeds.

**Test count**: 178 (Story 1.5 baseline) → 207 (Story 1.6 complete). 29 new tests added.

### File List

**New files:**
- `apps/web/src/lib/credential-health.ts`
- `apps/web/src/lib/credential-health.test.ts`
- `apps/web/src/actions/credential-health.actions.ts`
- `apps/web/src/actions/credential-health.actions.spec.ts`

**Modified files:**
- `libs/shared-types/src/credential-health.types.ts` — fixed `CredentialHealthStatus` values
- `apps/web/src/lib/auth.ts` — added `repoConnection.updateMany` to jwt callback
- `apps/web/src/lib/auth.credential.spec.ts` — added `repoConnection.updateMany` mock, 2 new tests
- `apps/web/src/actions/repo-connection.actions.ts` — refactored to use `resolveOAuthToken`, added `markCredentialFailed` on 401/403, `CredentialFailureError` catch around `inspectBmadSetup`
- `apps/web/src/actions/repo-connection.actions.spec.ts` — updated mocks, added 3 new tests for `markCredentialFailed`
- `apps/web/src/actions/repository-validation.actions.ts` — `fetchGithubContents` throws `CredentialFailureError` on 401/403, refactored `validateRepository` to use `resolveOAuthToken`, added `CredentialFailureError` catch
- `apps/web/src/actions/repository-validation.actions.spec.ts` — updated mocks, added `markCredentialFailed` test, updated 2 existing tests for changed error codes

## Change Log

- 2026-07-01: Story 1.6 implemented — credential failure detection, health status management, and re-auth flow. 29 new tests added (207 total). All ACs satisfied.

### Review Findings

- [x] [Review][Patch] Bare `catch {}` in `resolveOAuthToken` callers conflates failure modes and skips `markCredentialFailed` [`apps/web/src/actions/repo-connection.actions.ts:56-63`, `apps/web/src/actions/repository-validation.actions.ts:294-301`] — The bare `catch {}` around `resolveOAuthToken` swallows all error types (missing credential, DB error, KEK mismatch) into `NO_CREDENTIAL` without calling `markCredentialFailed`. A `RepoConnection` whose `OAuthCredential` was deleted stays stuck at `credentialHealth: 'healthy'`. The spec's design decision says "Callers catch `CredentialFailureError` and call `markCredentialFailed`" but the task code sample shows bare `catch {}`. Contradictory guidance requires human decision on whether to distinguish error types and mark failed.
- [x] [Review][Resolved] 403 blanket-treated as credential failure — org restrictions and permission denials mark credential as `failed` [`apps/web/src/actions/repository-validation.actions.ts:67-68`, `apps/web/src/actions/repo-connection.actions.ts:96-97`] — **RESOLVED per FINDING-12**: `fetchGithubContents` now throws `RateLimitError` on rate-limit 403s and returns `null` on genuine 403s (never `CredentialFailureError`). `connectRepository` classifies 403s into `RATE_LIMITED` / `ORG_RESTRICTION` / `INSUFFICIENT_PERMISSION` without calling `markCredentialFailed`. The spec's original task code samples prescribed the buggy behavior; this story's tasks and test checklist have been updated to reflect the resolution.
- [x] [Review][Patch] `markCredentialFailed` throwing in error paths shadows primary error and leaves health stale [`apps/web/src/actions/repo-connection.actions.ts:82,97,140`, `apps/web/src/actions/repository-validation.actions.ts:323`] — `markCredentialFailed` is awaited without try/catch in error-handling paths. If the DB is unreachable, the rejection propagates to the outer catch, returning `UNKNOWN` instead of `NO_CREDENTIAL`, and `credentialHealth` is not persisted as `failed`. The spec's Dev Notes state "a failed credential mark should never prevent the error from being returned to the user" — the implementation contradicts this.
- [x] [Review][Patch] `repoConnection.updateMany` in jwt callback has no error containment — aborts sign-in on DB error [`apps/web/src/lib/auth.ts:68-71`] — The `updateMany` on the OAuth sign-in critical path is not wrapped in try/catch. A transient DB error rejects and propagates out of the jwt callback, aborting sign-in even though the credential was already stored. The spec's Dev Notes incorrectly dismiss the need for `.catch()` by conflating zero-match safety with DB error safety.
- [x] [Review][Defer] `cacheGet` returns stale success after credential expiry [`apps/web/src/actions/repository-validation.actions.ts:314-315`] — deferred, pre-existing
- [x] [Review][Defer] `reauthorizeGitHub` has no error handling — `signIn` rejection surfaces as opaque server-action error [`apps/web/src/actions/credential-health.actions.ts:43-44`] — deferred, Epic 2 UI concern
- [x] [Review][Defer] Re-auth `updateMany('healthy')` races with concurrent `markCredentialFailed('failed')` [`apps/web/src/lib/auth.ts:68`, `apps/web/src/lib/credential-health.ts:38-42`] — deferred, requires transactional design beyond story scope
- [x] [Review][Defer] Tenant-isolation test is tautological — asserts mock not called with `'usr_other'` which could never occur [`apps/web/src/lib/credential-health.test.ts`] — deferred, test quality improvement
