# Test Automation Summary

**Last updated:** 2026-07-01

---

## Story 1.4: Validate BMAD Initialization

**Generated:** 2026-06-24
**Story status:** review

---

## Generated Tests

### E2E Tests (Playwright)

- [x] [playwright/e2e/onboarding/bmad-validation.spec.ts](../../../playwright/e2e/onboarding/bmad-validation.spec.ts) — BMAD validation error display and success flow (10 tests)

#### Test Inventory

| Test | AC | Priority | Description |
|---|---|---|---|
| MISSING_DIRECTORY error display | AC-3 | P0 | Submitting a URL for a repo missing BMAD directories shows error with `_bmad/` and "missing" text |
| MISSING_DIRECTORY documentation link | AC-3 | P0 | Error includes clickable documentation link with correct href, target, and rel attributes |
| UNSUPPORTED_VERSION error display | AC-6 | P0 | Submitting a URL for a repo with v5.9.9 shows error naming the version and mentioning v6 |
| UNSUPPORTED_VERSION detected version | AC-6 | P0 | Error message names the detected version (7.0.0) |
| NO_SKILLS_FOUND — missing directory | AC-4 | P0 | Submitting a URL for a repo with no `.claude/skills/` shows error mentioning "skill" and "directory" |
| NO_SKILLS_FOUND — empty directory | AC-5 | P0 | Submitting a URL for a repo with empty `.claude/skills/` shows error mentioning "skill" |
| Documentation link not shown for non-BMAD errors | AC-3 | P0 | NOT_FOUND error does not display a documentation link |
| Documentation link cleared on resubmission | AC-3 | P1 | Link appears on first error, clears on second submission that succeeds |
| Successful validation redirects to /project-map | AC-1 | P0 | Submitting a URL that passes BMAD validation navigates to /project-map |

---

## Coverage

| Level | File | Tests | Active | Skipped | Status |
|---|---|---|---|---|---|
| E2E | `bmad-validation.spec.ts` | 10 | 10 | 0 | **ALL PASSING** |

### Acceptance Criteria Coverage

| AC | Description | E2E Test(s) | Unit/Component Tests |
|---|---|---|---|
| AC-1 | All dirs present + version 6.x → success | Successful validation redirects to /project-map | `repository-validation.actions.spec.ts` (4 tests), `RepositoryUrlForm.test.tsx` (1 test) |
| AC-2 | Empty `_bmad-output/` accepted | (covered by unit tests) | `repository-validation.actions.spec.ts` (1 test) |
| AC-3 | Missing dirs → blocking message + docs link | MISSING_DIRECTORY error display, documentation link, link cleared on resubmission | `repository-validation.actions.spec.ts` (6 tests), `RepositoryUrlForm.test.tsx` (2 tests) |
| AC-4 | Missing `.claude/skills/` → blocking message | NO_SKILLS_FOUND — missing directory | `repository-validation.actions.spec.ts` (2 tests) |
| AC-5 | Empty `.claude/skills/` → blocking message | NO_SKILLS_FOUND — empty directory | `repository-validation.actions.spec.ts` (2 tests) |
| AC-6 | Version outside v6.x → blocking message + detected version | UNSUPPORTED_VERSION error display, detected version named | `repository-validation.actions.spec.ts` (6 tests), `RepositoryUrlForm.test.tsx` (1 test) |

---

## E2E Test Approach: Server Action Mocking

All E2E tests mock the `connectRepository` Server Action response using `page.route()` to intercept POST requests bearing the `Next-Action` header. The mock returns a React Flight (RSC) wire-format payload matching the Next.js 16 format:

```
0:{"a":"$@1","f":"","b":"development","q":"","i":false}
1:D{"time":0.5}
1:<JSON action result>
```

This avoids needing real GitHub credentials while preserving end-to-end coverage of the form's error display, documentation link rendering, and navigation logic.

### Key Fix: Next.js 16 RSC Wire Format

The `rscActionPayload()` helper in `onboarding.spec.ts` (Story 1.3) used an outdated format that Next.js 16 rejects, causing the client to fall back to the `.catch()` handler with "An unexpected error occurred." The Story 1.4 E2E tests use the correct Next.js 16 format with:
- Root chunk includes `"b":"development","q":"","i":false` (not `"b":""`)
- A `1:D{"time":...}` diagnostic line before the action result
- The `page.locator('#repo-url-error')` selector instead of `getByRole('alert')` to avoid strict mode violations from Next.js 16's route announcer element

> **Note:** The Story 1.3 `onboarding.spec.ts` tests have the same RSC format and `getByRole('alert')` issues and need the same fixes applied. This is tracked as a follow-up.

### Route Mocking for /project-map

RSC prefetch requests to `/project-map?_rsc=...` must also be intercepted. The `**/project-map**` glob pattern matches both regular and RSC prefetch requests, preventing the `networkErrorMonitor` fixture from failing on 404s.

---

## Test Execution

```bash
pnpm playwright test playwright/e2e/onboarding/bmad-validation.spec.ts --reporter=list
```

```
  10 passed (8.2s)
```

---

## Next Steps

- Apply the RSC wire format fix and `#repo-url-error` locator fix to `onboarding.spec.ts` (Story 1.3 E2E tests)
- Run the full E2E suite to confirm no regressions:
  ```bash
  pnpm playwright test playwright/e2e/onboarding/ --reporter=list
  ```

---

## Story 1.5: Resolve Git Identity for Commit Attribution

**Reviewed:** 2026-07-01
**Story status:** review
**Decision:** No E2E or API tests generated

### Rationale

Story 1.5 has no testable surface for E2E or API automation:

| Check | Result |
|---|---|
| UI components calling `getGitIdentity` / `resolveGitIdentity` | None — grep of `apps/web/src/**/*.tsx` returned no matches |
| HTTP API endpoint | None — the story's API Contract states: *"This story has no HTTP API endpoint. The `getGitIdentity` Server Action is callable only from server-side code in `apps/web`"* |
| Story's explicit testing requirement | *"No E2E tests needed — this story has no UI surface; the identity is consumed internally by Epic 3"* |
| Playwright E2E directories | `auth`, `conversation`, `onboarding`, `project-map` — no git-identity surface |

The `GitUserConfig` produced here is consumed internally by **Epic 3, Story 3.1** (`ISandboxService.injectGitConfig`) during the sandbox init sequence. Git identity attribution only becomes user-visible at that point, which is where E2E coverage naturally belongs.

### Existing Coverage (Complete)

All three acceptance criteria are already covered by passing unit and integration tests:

| Level | File | Tests | ACs Covered |
|---|---|---|---|
| Unit | `apps/web/src/lib/git-identity.test.ts` | 13 | AC-1, AC-2, AC-3 |
| Integration | `apps/web/src/actions/git-identity.actions.spec.ts` | 9 | AC-3 |

**Total: 22 tests, all passing.**

### Acceptance Criteria Coverage

| AC | Description | Test Level | Test File(s) |
|---|---|---|---|
| AC-1 | Name and primary email from OAuth profile | Unit | `git-identity.test.ts` (2 tests: exact values, special characters) |
| AC-2 | Noreply email fallback | Unit | `git-identity.test.ts` (4 tests: null, empty, whitespace, name preserved) |
| AC-3 | Consumable by sandbox init; no token leakage | Unit + Integration | `git-identity.test.ts` (2 tests: return-type keys, no token props); `git-identity.actions.spec.ts` (3 tests: `select` clause, no token in result, error paths) |

### Checklist Validation

- [x] API tests generated (if applicable) — N/A: no HTTP API endpoint exists
- [x] E2E tests generated (if UI exists) — N/A: no UI surface exists
- [x] Tests cover happy path — covered by existing unit tests
- [x] Tests cover 1-2 critical error cases — covered by existing integration tests (unauthenticated, user-not-found, DB error)
- [x] Test summary created — this document
- [x] All existing tests run successfully — 22 tests pass (verified during story implementation)

### Next Steps

- No action required for Story 1.5
- When Story 3.1 (Provision a Sandbox When Opening a Conversation) is implemented, add E2E coverage for the sandbox init sequence including git-config injection attribution
