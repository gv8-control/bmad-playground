# Test Automation Summary — Story 1.3: Connect a Repository by URL

**Generated:** 2026-06-20
**Story status:** review

---

## Generated / Updated Tests

### Unit Tests (Jest)

- [x] [apps/web/src/lib/crypto.test.ts](../../../apps/web/src/lib/crypto.test.ts) — AES-256-GCM encrypt/decrypt, nonce uniqueness, tamper detection (9 tests)
- [x] [apps/web/src/lib/crypto.test.ts](../../../apps/web/src/lib/crypto.test.ts) — KEK validation (missing/invalid) (2 tests included above)

### Integration Tests (Jest)

- [x] [apps/web/src/lib/auth.credential.spec.ts](../../../apps/web/src/lib/auth.credential.spec.ts) — OAuth token encrypted and upserted at sign-in; not stored on JWT refresh; not placed in JWT cookie (7 tests)
- [x] [apps/web/src/actions/repo-connection.actions.spec.ts](../../../apps/web/src/actions/repo-connection.actions.spec.ts) — URL validation, session/credential guards, GitHub API error paths (NOT_FOUND, INSUFFICIENT_PERMISSION, ORG_RESTRICTION, UNKNOWN), success upsert, token never returned to client (23 tests)

### Component Tests (Jest)

- [x] [apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx](../../../apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx) — Form renders, pending state, per-cause error display, aria attributes, redirect on success (15 tests)

### Server Component Tests (Jest — new this session)

- [x] [apps/web/src/app/(dashboard)/onboarding/page.test.tsx](../../../apps/web/src/app/(dashboard)/onboarding/page.test.tsx) — Redirect guards: unauthenticated → /sign-in, already connected → /project-map, no connection → renders form (6 tests)
- [x] [apps/web/src/app/page.test.tsx](../../../apps/web/src/app/page.test.tsx) — Root redirect: unauthenticated → /sign-in, no RepoConnection → /onboarding, existing connection → /project-map (6 tests)

### Internal Test Route Tests (Jest)

- [x] [apps/web/src/app/api/internal/test/seed-user/route.test.ts](../../../apps/web/src/app/api/internal/test/seed-user/route.test.ts) — POST upsert + DELETE by githubId; returns 404 in production (5 tests)
- [x] [apps/web/src/app/api/internal/test/repo-connections/route.test.ts](../../../apps/web/src/app/api/internal/test/repo-connections/route.test.ts) — POST upsert with correct payload; returns 404 in production (4 tests)
- [x] [apps/web/src/app/api/internal/test/repo-connections/[id]/route.test.ts](../../../apps/web/src/app/api/internal/test/repo-connections/%5Bid%5D/route.test.ts) — DELETE by id; returns 404 in production (3 tests)

### E2E Tests (Playwright)

- [x] [playwright/e2e/onboarding/onboarding.spec.ts](../../../playwright/e2e/onboarding/onboarding.spec.ts) — Full onboarding user flow (12 active, 2 skipped)

---

## Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| Unit | `crypto.test.ts` | 9 | 9 | 0 | PASSING |
| Integration | `auth.credential.spec.ts` | 7 | 7 | 0 | PASSING |
| Integration | `repo-connection.actions.spec.ts` | 23 | 23 | 0 | PASSING |
| Component | `RepositoryUrlForm.test.tsx` | 15 | 15 | 0 | PASSING |
| Server Component | `onboarding/page.test.tsx` | 6 | 6 | 0 | PASSING |
| Server Component | `app/page.test.tsx` | 6 | 6 | 0 | PASSING |
| Internal Routes | `seed-user/route.test.ts` + `repo-connections/*.test.ts` | 12 | 12 | 0 | PASSING |
| E2E | `onboarding.spec.ts` | 14 | 12 | 2 | Requires dev server |
| **Total Jest** | | **78** | **78** | **0** | **ALL PASSING** |
| **Total E2E** | | **14** | **12** | **2** | |

> **Note:** The ATDD checklist previously counted 68 Jest tests (96 after the untracked files were discovered). The final count is 78 active Jest tests across all Story 1.3 test files.

---

## Fixes Applied This Session

### Bug: Server Component redirect guard not returning after mock redirect in tests

**Files:** `apps/web/src/app/(dashboard)/onboarding/page.tsx`, `apps/web/src/app/page.tsx`

`redirect()` in Next.js has return type `never` (it throws `NEXT_REDIRECT`), so TypeScript narrows the session type correctly in production. However, the Jest mock doesn't throw, causing execution to continue past the guard and crash on `session.userId` when `session` is null.

**Fix:** Extract `userId` before the guard and add `return null as never` after each redirect call. The `return` is unreachable in production but exits the function cleanly in tests.

**Tests unblocked:** 6 previously failing tests in `page.test.tsx` (3) and `onboarding/page.test.tsx` (3).

---

## E2E Test Approach: Server Action Mocking

Error-state and success E2E tests (tests 9–13) mock the `connectRepository` Server Action response using `page.route()` to intercept POST requests bearing the `Next-Action` header. The mock returns a minimal React Flight (RSC) wire-format payload:

```
1:<JSON action result>
0:{"a":"$@1","f":"","b":""}
```

This avoids needing real GitHub credentials while preserving end-to-end coverage of the form's error display and navigation logic. These tests must be run against a live dev server (`pnpm nx run web:dev`) to validate the RSC payload format is accepted by the running Next.js version.

### Remaining Skipped E2E Tests (2)

| Test | Reason |
|---|---|
| `[P1] org OAuth App restriction error explicitly names the org cause` | Requires a real GitHub org with OAuth App access restrictions — cannot be simulated |
| `[P1] encrypted token is never visible in the browser` | Requires real GitHub credentials and a writable test repo — server-side security property |

---

## Playwright Infrastructure Change

Removed unused `seededRepository` fixture from `playwright/support/custom-fixtures.ts`. The fixture called `/api/internal/test/repositories` which does not exist, and no test used it (review patch from Story 1.3 code review).

---

## Next Steps

- Run E2E suite against the dev server to confirm RSC payload format:
  ```bash
  pnpm nx e2e web-e2e --grep "Story 1.3"
  ```
- If RSC format assertions fail, inspect the actual `text/x-component` response body and update `rscActionPayload()` in `onboarding.spec.ts`
- The 2 remaining skipped tests (`ORG_RESTRICTION` and token-visibility) activate when a real GitHub org with OAuth App restrictions is available in CI
