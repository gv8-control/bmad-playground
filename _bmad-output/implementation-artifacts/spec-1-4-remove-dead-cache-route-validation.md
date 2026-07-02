---
title: 'Remove dead validation cache and route connectRepository through validateRepository'
type: 'refactor'
created: '2026-07-02'
status: 'done'
baseline_commit: '64341a8906ba669397fa3baccc3f8fc840e08f61'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/1-4-validate-bmad-initialization-in-the-connected-repository.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.4's `validateRepository` Server Action owns an in-memory validation cache, but the onboarding flow (`connectRepository`) calls `inspectBmadSetup` directly, bypassing `validateRepository` entirely. The cache is dead code — read/written only by a Server Action no UI calls. The `invalidateValidationCache` call in `connectRepository` is a no-op since nothing populates the cache.

**Approach:** Remove the cache machinery from `repository-validation.ts` and strip cache read/write from `validateRepository`. Route `connectRepository` through `validateRepository` instead of calling `inspectBmadSetup` directly, mapping the result to `ConnectResult`.

## Boundaries & Constraints

**Always:**
- `inspectBmadSetup` remains in `apps/web/src/lib/repository-validation.ts` as an internal helper — never carry `'use server'`.
- `validateRepository` remains the sole public entry point for BMAD validation; `connectRepository` calls it, never `inspectBmadSetup`.
- Error envelope patterns unchanged: `ConnectResult` shape, `ValidationError` codes, `ActionError` codes all stay as-is.
- All existing P0 test assertions for `connectRepository` (MISSING_DIRECTORY, UNSUPPORTED_VERSION, NO_SKILLS_FOUND, documentation link, no-upsert-on-failure, token-never-returned) must still pass.

**Ask First:**
- None anticipated. If `validateRepository`'s double `resolveOAuthToken` call (once in `connectRepository`, once in `validateRepository`) proves problematic, HALT before refactoring the token resolution.

**Never:**
- Do not remove `validateRepository` itself (scope A — keep the Server Action).
- Do not remove or modify `inspectBmadSetup` or its direct tests.
- Do not add a token-passing parameter to `validateRepository` to avoid the double resolution — accept it as a one-time onboarding cost.
- Do not touch the repo-existence/write-access check in `connectRepository` (lines 97-162) — only the validation step changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Valid repo, all BMAD dirs present, v6.x, skills found | `connectRepository` returns `{ success: true }`, upserts RepoConnection | N/A |
| Validation error | `validateRepository` returns `ValidationError` (MISSING_DIRECTORY / UNSUPPORTED_VERSION / NO_SKILLS_FOUND) | `connectRepository` returns `{ error, errorCode, documentationLink }`, no upsert | Mapped from `ValidationError.code` / `.message` / `.meta.documentationLink` |
| Action error | `validateRepository` returns `ActionError` (RATE_LIMITED / NO_CREDENTIAL / UNKNOWN / INVALID_URL) | `connectRepository` returns `{ error, errorCode }`, no upsert | Mapped from `ActionError.error` / `.errorCode` |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/repository-validation.ts` — Remove cache machinery (lines 393-454: `validationCache` Map, `ValidationCacheEntry`, `CACHE_TTL_MS`, `CACHE_MAX_ENTRIES`, `cacheKey`, `getCachedValidation`, `cacheValidation`, `invalidateValidationCache`, `clearValidationCache`). Keep `inspectBmadSetup` and all GitHub API helpers unchanged.
- `apps/web/src/actions/repository-validation.actions.ts` — Remove cache imports (`getCachedValidation`, `cacheValidation`) and `getCredentialHealth` import. Remove cache read (lines 95-99) and cache write (lines 103-105) from `validateRepository`. Keep `validateRepository` as the public Server Action entry point.
- `apps/web/src/actions/repo-connection.actions.ts` — Replace `inspectBmadSetup(accessToken, owner, repo)` call (line 166) + its try/catch error handling (lines 164-192) with `validateRepository(cleanUrl)` call + result mapping. Remove `invalidateValidationCache` call (line 207). Update imports: drop `inspectBmadSetup`, `invalidateValidationCache`, `RateLimitError`; add `validateRepository` from `./repository-validation.actions`. Keep `detectGithubRateLimit`, `rateLimitMessage` for repo-existence 403 handling.
- `apps/web/src/actions/repository-validation.actions.spec.ts` — Remove cache imports (`clearValidationCache`, `invalidateValidationCache`), `mockGetCredentialHealth` setup + mock factory entry, `clearValidationCache()` from `beforeEach`, and 6 cache-behavior tests (lines 803-881). Keep all `inspectBmadSetup` and non-cache `validateRepository` tests.
- `apps/web/src/actions/repo-connection.actions.spec.ts` — Update test description at line 376 (references `inspectBmadSetup` — now goes through `validateRepository`). All test assertions should pass unchanged since `validateRepository` uses the same mocked `auth`/`resolveOAuthToken`/`fetch`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/lib/repository-validation.ts` -- Delete cache machinery (lines 393-454: Map, constants, `ValidationCacheEntry`, `cacheKey`, `getCachedValidation`, `cacheValidation`, `invalidateValidationCache`, `clearValidationCache`) -- Dead code; only exercised by tests and the no-op invalidate call.
- [x] `apps/web/src/actions/repository-validation.actions.ts` -- Remove cache imports and cache read/write from `validateRepository`; remove `getCredentialHealth` import -- Cache is gone; `validateRepository` becomes a clean pass-through to `inspectBmadSetup` with auth + error envelope.
- [x] `apps/web/src/actions/repo-connection.actions.ts` -- Replace `inspectBmadSetup` call + try/catch with `validateRepository(cleanUrl)` + result mapping; remove `invalidateValidationCache` call; update imports -- Routes through the validation Server Action instead of the internal helper.
- [x] `apps/web/src/actions/repository-validation.actions.spec.ts` -- Remove cache imports, `mockGetCredentialHealth` setup + mock entry, `clearValidationCache()` from `beforeEach`, and 6 cache-behavior tests -- Cache no longer exists.
- [x] `apps/web/src/actions/repo-connection.actions.spec.ts` -- Update test description referencing `inspectBmadSetup` at line 376 -- Description should reflect the new routing through `validateRepository`.

**Acceptance Criteria:**
- Given the cache machinery is removed, when `validateRepository` is called, then it calls `inspectBmadSetup` directly without any cache read/write.
- Given `connectRepository` is called with a valid repo, when BMAD validation passes, then `validateRepository` is called (not `inspectBmadSetup` directly) and `RepoConnection` is upserted.
- Given `connectRepository` is called, when `validateRepository` returns a `ValidationError`, then `connectRepository` maps it to `{ error, errorCode, documentationLink }` and does not upsert.
- Given `connectRepository` is called, when `validateRepository` returns an `ActionError`, then `connectRepository` maps it to `{ error, errorCode }` and does not upsert.
- Given the cache is removed, when searching the codebase for `validationCache` or `getCachedValidation` or `cacheValidation` or `invalidateValidationCache` or `clearValidationCache`, then zero non-test references remain.

## Design Notes

`validateRepository` returns a union: `ValidationResult | ValidationError | ActionError`. `connectRepository` maps it to `ConnectResult`:

```typescript
const validation = await validateRepository(cleanUrl);
if ('valid' in validation) {
  // success — proceed to upsert
} else if ('code' in validation) {
  // ValidationError → { error, errorCode: validation.code, documentationLink }
} else {
  // ActionError → { error, errorCode: validation.errorCode }
}
```

`validateRepository` never throws — its outer try/catch converts all errors to `ActionError` results. No try/catch needed around the call in `connectRepository`.

Known trade-off: `resolveOAuthToken` runs twice (once in `connectRepository` for the repo-existence check, once in `validateRepository` for validation). Acceptable for a one-time onboarding operation.

## Verification

**Commands:**
- `yarn nx test web` -- expected: all web tests pass (cache tests removed, remaining tests unchanged)
- `yarn nx lint web` -- expected: zero lint errors (no unused imports)

## Suggested Review Order

**Routing change**

- Entry point: `validateRepository(cleanUrl)` replaces direct `inspectBmadSetup` call; maps union result to `ConnectResult`
  [`repo-connection.actions.ts:162`](../../apps/web/src/actions/repo-connection.actions.ts#L162)

- `ActionError` branch: maps `errorCode`/`error` from `validateRepository` to `ConnectResult`
  [`repo-connection.actions.ts:176`](../../apps/web/src/actions/repo-connection.actions.ts#L176)

**Cache removal**

- `validateRepository` now a clean pass-through to `inspectBmadSetup`, no cache read/write
  [`repository-validation.actions.ts:93`](../../apps/web/src/actions/repository-validation.actions.ts#L93)

- End of `inspectBmadSetup`; cache machinery that followed is deleted
  [`repository-validation.ts:390`](../../apps/web/src/lib/repository-validation.ts#L390)

**Tests**

- 6 cache-behavior tests removed; `validateRepository` tests retained
  [`repository-validation.actions.spec.ts:670`](../../apps/web/src/actions/repository-validation.actions.spec.ts#L670)

- Test description updated to reflect `validateRepository` routing
  [`repo-connection.actions.spec.ts:376`](../../apps/web/src/actions/repo-connection.actions.spec.ts#L376)
