# Test Automation Summary — Story 1.4: Validate BMAD Initialization

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
