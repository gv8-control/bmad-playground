---
stepsCompleted:
  - step-01-load-context
  - step-02-discover-tests
  - step-03-quality-evaluation
  - step-03f-aggregate-scores
  - step-04-generate-report
lastStep: step-04-generate-report
lastSaved: '2026-07-03'
workflowType: 'testarch-test-review'
inputDocuments:
  - _bmad/tea/config.yaml
  - _bmad-output/project-context.md
  - _bmad-output/implementation-artifacts/2-4-browse-and-read-all-committed-artifacts.md
  - _bmad-output/test-artifacts/atdd-checklist-2-4-browse-and-read-all-committed-artifacts.md
  - _bmad-output/test-artifacts/automate-validation-report-2-4.md
  - _bmad-output/test-artifacts/test-reviews/test-review-2-3.md
  - apps/web/src/components/artifact-browser/ArtifactListEntry.tsx
  - apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx
  - apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx
  - apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx
  - apps/web/src/app/(dashboard)/(app)/artifacts/loading.tsx
  - apps/web/src/app/(dashboard)/(app)/artifacts/loading.test.tsx
  - apps/web/src/app/(dashboard)/(app)/artifacts/error.tsx
  - playwright/e2e/artifact-browser/artifact-browser.spec.ts
  - playwright/support/custom-fixtures.ts
  - playwright/support/merged-fixtures.ts
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/data-factories.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-levels-framework.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/selective-testing.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/selector-resilience.md
---

# Test Quality Review — Story 2.4: Browse and Read All Committed Artifacts

**Quality Score**: 86/100 (B — Good)
**Review Date**: 2026-07-03
**Review Scope**: Story-scoped (4 files — 3 Jest unit/component tests, 1 Playwright E2E suite)
**Stack**: fullstack (Next.js 16 + Jest + Playwright) — story is frontend-only
**Reviewer**: Master Test Architect (TEA bmad-testarch-test-review)

---

Note: This review audits existing tests; it does not generate tests.
Coverage mapping and coverage gates are out of scope here. Use `trace` for coverage decisions.

## Executive Summary

**Overall Assessment**: Good

**Recommendation**: Approve with Comments

### Key Strengths

- All 3 ACs have explicit P0 test coverage across unit and E2E levels. AC-1 (flat list sorted desc) is covered by 10 P0 tests across `ArtifactListEntry.test.tsx` (7 P0), `page.test.tsx` (query ordering, titles, empty state, h1, Breadcrumb), and `artifact-browser.spec.ts` (heading, list entries, sort order, flat list, entry fields, list role). AC-2 (skeleton) is covered by `loading.test.tsx` (2 P0). AC-3 (credential banner) is covered by `page.test.tsx` (health check call, banner render, sync gating) and `artifact-browser.spec.ts` (banner visible). No AC is left without coverage.
- All 4 test files include header comment blocks citing the story, ACs, and red-phase status — 100% compliant with project-context.md:211. The E2E spec additionally documents selector hierarchy strategy and fixture descriptions.
- E2E selectors follow the resilient hierarchy from `selector-resilience.md`: `getByRole('heading')`, `getByRole('link')`, `getByRole('listitem')`, `getByRole('list')`, `getByText()`. Zero CSS class selectors, zero XPath, zero `nth()` for arbitrary indexing. Fully compliant with the data-testid > ARIA > text hierarchy.
- E2E fixtures (`withRepoConnection`, `withArtifacts`) use API-seeded data with `try/finally` cleanup — the canonical pattern from `data-factories.md`. Each test creates its own `connectionId` and tears it down, preventing cross-test state pollution.
- All `Date` objects in test fixtures use fixed string arguments (e.g., `new Date('2026-06-14')`) — fully deterministic, no `Date.now()` or `new Date()` without arguments anywhere. The `formatDate` timezone fix (`timeZone: 'UTC'`) from the story review is properly tested.

### Key Weaknesses

- The `test.describe.configure({ mode: 'serial' })` in `artifact-browser.spec.ts:23` is flagged by 3 of 4 quality dimensions (Determinism, Isolation, Performance). The tests are self-contained with per-test fixture cleanup, so serial mode is unnecessary — it blocks parallel execution, masks potential future coupling, and halts on first failure. This is the single highest-impact issue in the review.
- `page.test.tsx` has significant copy-paste duplication: the sync-trigger setup block (mock `syncArtifactsAction` + two-phase `mockFindMany.mockResolvedValueOnce`) is repeated verbatim across ~5 test sites. No `setupSyncScenario()` helper was extracted, making the test file harder to maintain when sync semantics change.
- `page.test.tsx` uses `jest.clearAllMocks()` in all 4 describe blocks but never `jest.restoreAllMocks()` or `jest.resetAllMocks()`. `clearAllMocks()` resets call history but NOT `mockResolvedValue` implementations — mock return values can leak across tests. This is the same M-1 finding from the Story 2.2 and 2.3 reviews (pre-existing pattern, not a new regression).
- The `/artifacts` route literal appears 8× in the E2E spec with no shared constant — a route change would require 8 manual edits.
- `loading.test.tsx:31` queries skeleton entries by `.animate-pulse` CSS class instead of a semantic role or `data-testid` — breaks if the animation approach changes.

## Quality Criteria Assessment

| Criterion | Status | Score | Grade | Violations |
|-----------|--------|-------|-------|------------|
| Determinism | PASS (with warnings) | 90/100 | A- | 0 HIGH, 2 MEDIUM |
| Isolation | PASS (with warnings) | 93/100 | A | 0 HIGH, 1 MEDIUM, 1 LOW |
| Maintainability | WARN | 76/100 | C | 2 HIGH, 0 MEDIUM, 2 LOW |
| Performance | PASS (with warnings) | 83/100 | B | 1 HIGH, 1 MEDIUM, 1 LOW |
| **Overall (weighted)** | **PASS** | **86/100** | **B** | **3 HIGH, 4 MEDIUM, 4 LOW** |

**Weights**: Determinism 30%, Isolation 30%, Maintainability 25%, Performance 15%

## Test Files Reviewed

| # | File | Level | Framework | Tests | Lines |
|---|------|-------|-----------|-------|-------|
| 1 | `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` | Unit (component) | Jest + Testing Library | 9 (7 P0, 2 P1) | 102 |
| 2 | `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` | Unit (Server Component) | Jest + renderToStaticMarkup | 13 (8 P0, 5 P1) | 267 |
| 3 | `apps/web/src/app/(dashboard)/(app)/artifacts/loading.test.tsx` | Unit (component) | Jest + Testing Library | 3 (2 P0, 1 P1) | 41 |
| 4 | `playwright/e2e/artifact-browser/artifact-browser.spec.ts` | E2E | Playwright | 8 (7 P0, 1 P1) | 143 |

**Total**: 33 tests across 4 files (24 P0, 9 P1)

## Critical Issues (Should Fix)

### Issue 1: E2E serial mode blocks parallelization [HIGH — 3 dimensions]

**Location**: `playwright/e2e/artifact-browser/artifact-browser.spec.ts:23`
**Dimensions**: Determinism, Isolation, Performance

**Problem**: `test.describe.configure({ mode: 'serial' })` forces all 8 E2E tests to run sequentially in a single worker. Each test uses self-contained fixtures (`withArtifacts` / `withRepoConnection`) that set up and tear down their own data via `try/finally`, so no test depends on another test's side effects. Serial mode is unnecessary and blocks Playwright's multi-worker parallelism.

**Fix**:
```typescript
// Remove this line:
test.describe.configure({ mode: 'serial' });

// If serial is needed to guard against concurrent repo-connection creation
// for the shared E2E_GITHUB_ID, add a comment documenting the constraint:
// test.describe.configure({ mode: 'serial' }); // Shared E2E_GITHUB_ID requires sequential execution
```

**Knowledge base reference**: `test-quality.md` (parallel-safe criterion), `selector-resilience.md`

---

### Issue 2: Duplicate sync-trigger setup in page.test.tsx [HIGH — Maintainability]

**Location**: `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx:153-158, 192-196, 208-213, 228-233, 242-246`
**Dimension**: Maintainability

**Problem**: The sync-trigger setup block — `mockSyncArtifactsAction.mockResolvedValue({ success: true, artifactsUpserted: 2, artifactsDeleted: 0 })` followed by `mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce(ARTIFACTS)` — is copy-pasted across ~5 test sites. The same 3-line sync-success object and the two-phase findMany chain are repeated verbatim.

**Fix**:
```typescript
function setupSyncScenario(
  syncResult: Record<string, unknown>,
  finalArtifacts: typeof ARTIFACTS | [],
) {
  mockSyncArtifactsAction.mockResolvedValue(syncResult);
  mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce(finalArtifacts);
}

// Usage:
setupSyncScenario(
  { success: true, artifactsUpserted: 2, artifactsDeleted: 0 },
  ARTIFACTS,
);
```

**Knowledge base reference**: `test-quality.md` (< 300 lines, focused tests)

---

### Issue 3: Magic route literal in E2E spec [HIGH — Maintainability]

**Location**: `playwright/e2e/artifact-browser/artifact-browser.spec.ts:29, 41, 58, 74, 91, 107, 118, 130`
**Dimension**: Maintainability

**Problem**: The route literal `/artifacts` appears 8 times across the suite with no shared constant. A route change would require 8 manual edits, and there is no single source of truth for the path.

**Fix**:
```typescript
const ARTIFACTS_ROUTE = '/artifacts';

// Then replace all:
await page.goto(ARTIFACTS_ROUTE);
```

**Knowledge base reference**: `test-quality.md` (explicit, focused tests)

## Recommendations (Should Fix)

### Rec 1: Replace CSS class selector in loading.test.tsx [MEDIUM — Determinism]

**Location**: `apps/web/src/app/(dashboard)/(app)/artifacts/loading.test.tsx:31`
**Dimension**: Determinism

**Problem**: `container.querySelectorAll('.animate-pulse')` queries by Tailwind CSS class. If the animation approach changes (e.g., Framer Motion, CSS module), the test breaks even though the skeleton behavior is unchanged.

**Fix**: Add `data-testid="skeleton-entry"` to each skeleton div in `loading.tsx`, or add `role="listitem"` to skeleton entries for consistency with the real `ArtifactListEntry` component:
```typescript
// Option A: data-testid
const skeletonEntries = container.querySelectorAll('[data-testid="skeleton-entry"]');

// Option B: role-based (preferred — matches ArtifactListEntry pattern)
const skeletonEntries = screen.getAllByRole('listitem');
```

**Knowledge base reference**: `selector-resilience.md` (data-testid > ARIA > text > CSS)

---

### Rec 2: Switch clearAllMocks to resetAllMocks in page.test.tsx [MEDIUM — Isolation]

**Location**: `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx:124`
**Dimension**: Isolation

**Problem**: `jest.clearAllMocks()` resets mock call history but does NOT reset `mockResolvedValue`/`mockResolvedValueOnce` implementations. Mock return values can leak across tests. Currently no active failure (tests re-establish values via `setupArtifacts()`), but a latent cross-test contamination risk.

**Fix**:
```typescript
// Replace in all 4 describe blocks:
beforeEach(() => jest.clearAllMocks());

// With:
beforeEach(() => {
  jest.resetAllMocks();
  setupArtifacts(ARTIFACTS); // re-establish defaults after reset
});
```

**Note**: This is the same M-1 finding from the Story 2.2 and 2.3 reviews. It is a pre-existing pattern, not a new regression introduced by Story 2.4.

**Knowledge base reference**: `test-quality.md` (self-cleaning, parallel-safe), project-context.md:165

---

### Rec 3: Move seed-user upsert to globalSetup [MEDIUM — Performance]

**Location**: `playwright/support/custom-fixtures.ts:43`
**Dimension**: Performance

**Problem**: The `withRepoConnection` fixture POSTs to `/api/internal/test/seed-user` for every test. The test user is a fixed identity (`E2E_GITHUB_ID = 'e2e-test-default-99999'`) and the endpoint is an idempotent upsert, so only the first call per worker actually creates the user. Across 8 tests, 7 calls are redundant.

**Fix**: Move the seed-user upsert to a Playwright `globalSetup` or make it a worker-scoped fixture. The per-test connection and artifact seeding can remain test-scoped for isolation.

**Knowledge base reference**: `data-factories.md` (API-first setup, globalSetup pattern)

---

### Rec 4: Add render helpers in ArtifactListEntry.test.tsx [LOW — Maintainability]

**Location**: `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx:37`
**Dimension**: Maintainability

**Problem**: `render(<ArtifactListEntry {...COMPLETED_ENTRY} />)` is repeated in 5 of 7 tests in the first describe block. While one-render-per-test is a valid Testing Library pattern, the identical render with identical props is reducible.

**Fix**:
```typescript
function renderCompleted() {
  return render(<ArtifactListEntry {...COMPLETED_ENTRY} />);
}
```

---

### Rec 5: Named constant for skeleton count [LOW — Maintainability]

**Location**: `apps/web/src/app/(dashboard)/(app)/artifacts/loading.test.tsx:32`
**Dimension**: Maintainability

**Problem**: `expect(skeletonEntries).toHaveLength(5)` — the `5` is an unnamed literal with no documented link to the source's `[0,1,2,3,4].map(...)`.

**Fix**:
```typescript
const SKELETON_ENTRY_COUNT = 5;
expect(skeletonEntries).toHaveLength(SKELETON_ENTRY_COUNT);
```

---

### Rec 6: Group read-only E2E tests under shared beforeAll [LOW — Performance]

**Location**: `playwright/e2e/artifact-browser/artifact-browser.spec.ts:29-112`
**Dimension**: Performance

**Problem**: 6 read-only tests (tests 1-6) use `withArtifacts`, seed identical data, and navigate to the same `/artifacts` URL. Each independently re-seeds data and reloads the page.

**Fix**: For read-only tests sharing the same data shape, use `test.beforeAll` to seed artifacts and navigate once. Tests that need a different state (`withRepoConnection` / empty-state tests) keep per-test setup. Requires removing serial mode first (Issue 1).

## Best Practices Examples

### Good Pattern 1: E2E fixture cleanup with try/finally

`playwright/support/custom-fixtures.ts:62-66` — the `withRepoConnection` fixture uses `try { await use(...) } finally { await request.delete(...) }` pattern. This is the canonical cleanup pattern from `data-factories.md` and ensures no state leaks even if the test throws.

### Good Pattern 2: Server Component test isolation via render stubs

`page.test.tsx:53-73` — child components (`ArtifactListEntry`, `CredentialErrorBanner`, `Breadcrumb`) are mocked as render stubs returning identifiable strings (e.g., `ArtifactListEntry:${type}:${title}:${status}:${lastModifiedAt.toISOString()}`). This isolates the page test from child component logic, following the canonical pattern from `project-map/page.test.tsx`.

### Good Pattern 3: ARIA-first E2E selectors

`artifact-browser.spec.ts` — all element location uses `getByRole()` and `getByText()` with no CSS class selectors, no XPath, no arbitrary `nth()`. The `nth(0)` / `nth(1)` / `nth(2)` usage on lines 65-67 is for sort-order verification (legitimate — testing positional order is the test's purpose, not a brittle selector).

### Good Pattern 4: Fixed date strings for determinism

All 4 test files use `new Date('2026-06-14')` with fixed string arguments — never `new Date()` or `Date.now()`. The `formatDate` timezone fix (`timeZone: 'UTC'`) is properly tested in `ArtifactListEntry.test.tsx:51-54`.

## Knowledge Base References

| Fragment | Applied To |
|----------|-----------|
| `test-quality.md` | Determinism, isolation, explicit assertions, < 300 lines, parallel-safe |
| `data-factories.md` | E2E fixture cleanup pattern, API-first setup |
| `test-levels-framework.md` | Unit vs E2E test level selection, duplicate coverage guard |
| `selective-testing.md` | P0/P1 priority tagging, execution strategy |
| `test-healing-patterns.md` | CSS class selector failure pattern, serial mode failure pattern |
| `selector-resilience.md` | E2E selector hierarchy validation (ARIA > text > CSS) |

## Context References

- **Story**: `_bmad-output/implementation-artifacts/2-4-browse-and-read-all-committed-artifacts.md`
- **ATDD checklist**: `_bmad-output/test-artifacts/atdd-checklist-2-4-browse-and-read-all-committed-artifacts.md`
- **Automate validation report**: `_bmad-output/test-artifacts/automate-validation-report-2-4.md`
- **Previous review**: `_bmad-output/test-artifacts/test-reviews/test-review-2-3.md` (Story 2.3 scored 91/100 — A)
- **Project context**: `_bmad-output/project-context.md` (testing rules lines 144-177)

## Notes

- **Test Framework**: Jest (unit/component) + Playwright (E2E)
- **Review Scope**: Story-scoped (4 files, 33 tests)
- **Quality Score**: 86/100, Grade B
- **Critical Issues**: 3 HIGH violations (0 blockers — all are maintainability/performance improvements, not correctness issues)
- **Recommendation**: Approve with Comments
- **Special Considerations**: The `jest.clearAllMocks()` vs `jest.resetAllMocks()` finding is a pre-existing pattern from Story 2.2, flagged in 3 consecutive reviews. The E2E serial mode is new to Story 2.4.
- **Follow-up Actions**: Consider addressing the E2E serial mode and the `setupSyncScenario()` helper extraction in a future test-quality pass. The `jest.resetAllMocks()` fix should be addressed holistically across all Jest test files (project-wide pattern, not Story 2.4-specific).
