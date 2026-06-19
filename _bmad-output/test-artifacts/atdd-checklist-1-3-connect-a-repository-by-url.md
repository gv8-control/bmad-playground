---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-06-19'
activatedDate: '2026-06-19'
storyId: '1.3'
storyKey: 1-3-connect-a-repository-by-url
storyFile: _bmad-output/implementation-artifacts/1-3-connect-a-repository-by-url.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-1-3-connect-a-repository-by-url.md
generatedTestFiles:
  - apps/web/src/lib/crypto.test.ts
  - apps/web/src/lib/auth.credential.spec.ts
  - apps/web/src/actions/repo-connection.actions.spec.ts
  - apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx
  - playwright/e2e/onboarding/onboarding.spec.ts
---

# ATDD Checklist — Story 1.3: Connect a Repository by URL

**TDD Phase:** GREEN (all Jest tests active and passing; E2E authenticated flows remain skipped pending GitHub credentials)
**Stack:** fullstack (Next.js + NestJS)
**Generated:** 2026-06-19
**Activated:** 2026-06-19
**Execution Mode:** SEQUENTIAL

---

## Summary

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| Unit (Jest) | `apps/web/src/lib/crypto.test.ts` | 9 | 9 | 0 | **PASSING** |
| Integration (Jest) | `apps/web/src/lib/auth.credential.spec.ts` | 7 | 7 | 0 | **PASSING** |
| Integration (Jest) | `apps/web/src/actions/repo-connection.actions.spec.ts` | 23 | 23 | 0 | **PASSING** |
| Component (Jest) | `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx` | 15 | 15 | 0 | **PASSING** |
| E2E (Playwright) | `playwright/e2e/onboarding/onboarding.spec.ts` | 14 | 1 | 13 | Active — authenticated flows need GitHub creds |
| **Total** | | **68** | **55** | **13** | |

> **Note on test counts vs. original scaffold:** `crypto.test.ts` gained 1 tamper-detection test (T-1); `auth.credential.spec.ts` gained 1 credential upsert error-resilience test (T-2); `repo-connection.actions.spec.ts` had 3 additional tests in the implementation beyond the original scaffold count.

---

## Acceptance Criteria Coverage

| AC | Description | Test file(s) | Test IDs | Priority |
|---|---|---|---|---|
| AC-1 | `/onboarding` shows single URL input, no access-token field | `RepositoryUrlForm.test.tsx`, `onboarding.spec.ts` | COMP-01, COMP-02, E2E-01, E2E-04, E2E-05 | P0 |
| AC-2 | URL submitted → OAuth token checked for write access | `repo-connection.actions.spec.ts` | ACTION-01…10 | P0 |
| AC-3 | AES-256-GCM encrypted storage, unique nonces, never returned to client | `crypto.test.ts`, `auth.credential.spec.ts`, `repo-connection.actions.spec.ts` | UNIT-01…07, CRED-01…06, ACTION-17…20 | P0 |
| AC-4 | Per-cause descriptive errors: NOT_FOUND, INSUFFICIENT_PERMISSION, ORG_RESTRICTION | `repo-connection.actions.spec.ts`, `RepositoryUrlForm.test.tsx`, `onboarding.spec.ts` | ACTION-11…16, COMP-08…10, E2E-10…12 | P0/P1 |

---

## One Active E2E Test (runs immediately)

The following test is **active** (no `test.skip`) and runs against the current codebase. It verifies the Story 1.2 middleware guard still correctly protects `/onboarding`:

```bash
pnpm nx e2e web-e2e --grep "Story 1.3.*unauthenticated"
```

- [x] `[P0] unauthenticated user visiting /onboarding is redirected to /sign-in`

---

## Red Phase: Module-Not-Found Signals

The following test files import implementation files that do not yet exist. Running them before the corresponding task is complete will produce `Cannot find module` errors — this is the **expected TDD red-phase signal**.

| Test file | Depends on | Implement in |
|---|---|---|
| `crypto.test.ts` | `apps/web/src/lib/crypto.ts` | Task 2.1 |
| `repo-connection.actions.spec.ts` | `apps/web/src/actions/repo-connection.actions.ts` | Task 4.1 |
| `RepositoryUrlForm.test.tsx` | `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` | Task 5.3 |

`auth.credential.spec.ts` imports `./auth` which **already exists** (Story 1.2). No module-not-found error. The tests will be skipped (test.skip) until Task 3.1 adds credential storage to the jwt callback.

---

## Task-by-Task Activation Guide

All tasks are complete. Implementation is in the `review` state. Run the full suite with:

```bash
pnpm nx test web
```

### Task 2: AES-256-GCM encryption utilities — COMPLETE

- [x] `[P0] roundtrips an OAuth access token correctly`
- [x] `[P0] generates unique nonces on each call`
- [x] `[P0] stored ciphertexts never share a nonce — verified across 20 calls`
- [x] `[P1] throws if CREDENTIAL_ENCRYPTION_KEK is missing`
- [x] `[P1] throws if CREDENTIAL_ENCRYPTION_KEK is not a 64-char hex string`
- [x] `[P1] encrypted result contains all four required base64 fields`
- [x] `[P1] decryptToken is the inverse of encryptToken for empty string`
- [x] `[P1] decryptToken is the inverse for a token with special characters`
- [x] `[P0] decryptToken rejects a tampered ciphertext — GCM authentication tag integrity` _(added by automate workflow 2026-06-19)_

### Task 3: Store OAuth access token at sign-in — COMPLETE

- [x] `[P0] encrypts the access token using encryptToken on first sign-in`
- [x] `[P0] upserts OAuthCredential with encrypted fields keyed by userId`
- [x] `[P0] does NOT store credential when account.access_token is absent`
- [x] `[P1] does NOT store credential on session refresh (account is null)`
- [x] `[P0] raw access token is never placed in the JWT cookie`
- [x] `[P1] credential upsert happens after the user upsert`
- [x] `[P1] propagates error from oAuthCredential.upsert — sign-in fails rather than silently losing credential` _(added by automate workflow 2026-06-19)_

### Task 4: Implement the repo-connection Server Action — COMPLETE

**URL validation:**
- [x] `[P0] rejects a non-GitHub URL with errorCode INVALID_URL`
- [x] `[P0] rejects a plain string with errorCode INVALID_URL`
- [x] `[P0] rejects a GitHub profile URL with errorCode INVALID_URL`
- [x] `[P1] error message references the expected github.com format`
- [x] `[P0] accepts a URL with .git suffix`
- [x] `[P0] accepts a URL with trailing slash`

**Session + credential checks:**
- [x] `[P0] returns errorCode UNKNOWN when session is missing`
- [x] `[P0] returns errorCode NO_CREDENTIAL when OAuthCredential row is absent`
- [x] `[P1] NO_CREDENTIAL error message tells user to sign out and sign in again`

**GitHub API errors:**
- [x] `[P0] returns errorCode NOT_FOUND when GitHub API returns 404`
- [x] `[P1] NOT_FOUND error message names the specific cause`
- [x] `[P0] returns errorCode ORG_RESTRICTION when GitHub 403 is org restriction`
- [x] `[P0] ORG_RESTRICTION error explicitly names the org cause`
- [x] `[P0] returns errorCode INSUFFICIENT_PERMISSION on 403 without org restriction`
- [x] `[P0] returns errorCode INSUFFICIENT_PERMISSION when permissions.push is false`
- [x] `[P1] returns errorCode INSUFFICIENT_PERMISSION when permissions is absent`
- [x] `[P1] returns errorCode UNKNOWN for unexpected HTTP status`
- [x] `[P1] returns errorCode UNKNOWN when fetch throws`

**Successful connection:**
- [x] `[P0] returns { success: true } when repo is accessible with write access`
- [x] `[P0] upserts RepoConnection with credentialHealth "healthy"`
- [x] `[P1] normalises .git suffix from the stored repoUrl`
- [x] `[P0] calls the GitHub API with Bearer token in Authorization header`
- [x] `[P0] decrypted access token is NEVER returned to the client`

### Task 5: Build the onboarding page — COMPLETE

- [x] `[P0] renders the "Repository URL" labelled input as the sole text input`
- [x] `[P0] shows NO access-token, PAT, or password field`
- [x] `[P0] renders the "Connect repository" submit button`
- [x] `[P1] submit button is disabled when the URL input is empty`
- [x] `[P0] shows no error message on initial render`
- [x] `[P1] shows "Validating…" while the Server Action is in flight`
- [x] `[P1] input is disabled while the action is pending`
- [x] `[P0] shows inline error for INSUFFICIENT_PERMISSION`
- [x] `[P0] shows inline error for NOT_FOUND`
- [x] `[P0] shows org-restriction error that names the org cause`
- [x] `[P1] error element has role="alert"`
- [x] `[P1] input has aria-describedby pointing to the error element`
- [x] `[P0] submit button is re-enabled after an error`
- [x] `[P1] error is cleared on the next submission attempt`
- [x] `[P0] redirects to /project-map on success`

**E2E tests (requires running dev server + GitHub credentials):**

```bash
pnpm nx e2e web-e2e --grep "Story 1.3"
```

- [x] `[P0] unauthenticated user visiting /onboarding is redirected to /sign-in` — **ACTIVE, PASSING**
- [ ] `[P0] authenticated user with no connected repo sees the URL input as the sole text input` — _skipped: needs TEST_GITHUB_USERNAME/PASSWORD_
- [ ] `[P0] "Connect repository" is the only button on the onboarding page` — _skipped: needs creds_
- [ ] `[P1] connect button is disabled when the URL input is empty` — _skipped: needs creds_
- [ ] `[P0] page shows no error message on initial load` — _skipped: needs creds_

### Task 6: Update root page redirect logic — COMPLETE

**E2E tests (requires running dev server and authenticated session):**
- [ ] `[P0] authenticated user with no RepoConnection visiting / is redirected to /onboarding` — _skipped: needs creds_

---

## Skipped Tests Requiring External Configuration

| Test | Condition to activate |
|---|---|
| Authenticated session tests (E2E) | Configure `TEST_GITHUB_USERNAME` / `TEST_GITHUB_PASSWORD` in `.env` |
| `[P0] authenticated user who already has a RepoConnection is redirected to /project-map` | Requires DB seed: user has a `RepoConnection` row |
| `[P0] submitting a valid URL with write access redirects to /project-map` | Set `TEST_REPO_URL` in `.env` (repo the test user has write access to) |
| `[P1] org restriction error explicitly names the org cause` | Requires a test repo in an org with OAuth App access restrictions |

---

## Risk Cross-Reference

| Risk | AC | Test | Status |
|---|---|---|---|
| OAuth token accidentally stored in JWT cookie | AC-3 | `[P0] raw access token is never placed in the JWT cookie` | **PASSING** |
| GCM nonce reuse — breaks AES-256-GCM security | AC-3 | `[P0] stored ciphertexts never share a nonce — 20-call check` | **PASSING** |
| GCM ciphertext tamper — auth tag integrity | AC-3 | `[P0] decryptToken rejects a tampered ciphertext` | **PASSING** _(added 2026-06-19)_ |
| Org restriction mistaken for generic 403 | AC-4 | `[P0] ORG_RESTRICTION error explicitly names the org cause` | **PASSING** |
| Token returned to client in action response | AC-3 | `[P0] decrypted access token is NEVER returned to the client` | **PASSING** |
| No-token field displayed (DL-7 compliance) | AC-1 | `[P0] shows NO access-token, PAT, or password field` | **PASSING** |
