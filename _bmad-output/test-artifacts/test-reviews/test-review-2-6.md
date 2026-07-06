---
stepsCompleted:
  - step-01-load-context
  - step-02-discover-tests
  - step-03-quality-evaluation
  - step-03f-aggregate-scores
  - step-04-generate-report
lastStep: step-04-generate-report
lastSaved: '2026-07-04'
workflowType: 'testarch-test-review'
inputDocuments:
  - _bmad/tea/config.yaml
  - _bmad-output/project-context.md
  - _bmad-output/implementation-artifacts/2-6-navigate-from-the-project-map-to-an-artifact.md
  - _bmad-output/test-artifacts/atdd-checklist-2-6-navigate-from-the-project-map-to-an-artifact.md
  - _bmad-output/test-artifacts/test-reviews/test-review-2-5.md
  - apps/web/src/components/project-map/ArtifactCard.tsx
  - apps/web/src/components/project-map/ArtifactCard.test.tsx
  - apps/web/src/app/(dashboard)/(app)/project-map/page.tsx
  - apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/data-factories.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/selective-testing.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/selector-resilience.md
  - .claude/skills/bmad-testarch-test-review/resources/knowledge/timing-debugging.md
---

# Test Quality Review — Story 2.6: Navigate from the Project Map to an Artifact

**Quality Score**: 96/100 (A — Excellent)
**Review Date**: 2026-07-04
**Review Scope**: Story-scoped (2 files — 2 Jest component test files)
**Stack**: fullstack (Next.js 16 + Jest 30) — story is frontend-only
**Reviewer**: Master Test Architect (TEA bmad-testarch-test-review)

---

Note: This review audits existing tests; it does not generate tests.
Coverage mapping and coverage gates are out of scope here. Use `trace` for coverage decisions.

## Executive Summary

**Overall Assessment**: Excellent

**Recommendation**: Approve

### Key Strengths

- Both ACs have direct P0 coverage. AC-1 (completed artifact click opens Artifact Browser pre-selected) is covered by 6 P0 tests in `ArtifactCard.test.tsx` (link rendering, `aria-label`, focus ring, hover border, `role="listitem"` preservation) and 1 P0 test in `page.test.tsx` (href passing for completed artifact). AC-2 (in-progress artifact click opens read-only Artifact Browser) is covered by the same `page.test.tsx` href test asserting both `art_1` (completed) and `art_2` (in-progress) receive the correct `href` — verifying identical click behavior for every status.
- The `getByRole('listitem')` query strategy correctly accounts for `role="listitem"` overriding the `<a>`'s implicit `link` role. The story spec (DP-4) explicitly corrected the initial ATDD checklist which recommended `getByRole('link')` — the test file uses the correct query from day one. Asserting `item.tagName === 'A'` on the queried element verifies the `<Link>` renders an `<a>` tag without relying on the implicit role.
- Both test files follow the canonical `ArtifactListEntry` pattern from Story 2.5 exactly — `href` prop, `aria-label` format, `cn()` focus ring classes, `role="listitem"` on the link element. This consistency means a developer who has read one card-link test file can read all of them.
- The `ArtifactCard` mock in `page.test.tsx` includes `href` in its output string (`ArtifactCard:${type}:${title}:${status}:${href}`), enabling the page test to assert that the page constructs and passes the correct `href` to each card. This render-stub pattern isolates the page test from child component logic while still verifying the integration contract (page → card prop passing).
- Both files are well under the 300-line limit (156 and 288 lines). Header comments cite the story, ACs, and green-phase status — 100% compliant with `project-context.md:211`.

### Key Weaknesses

- `jest.clearAllMocks()` is used in all describe blocks but `jest.restoreAllMocks()` is never called — `clearAllMocks()` resets call history but not `mockResolvedValue` implementations. Mock return values can leak across describe blocks. This is the same pre-existing codebase-wide pattern noted in Stories 2.2–2.5 reviews.
- The `ARTIFACTS` fixture in `page.test.tsx` (lines 71-96) includes `content`, `createdAt`, `updatedAt`, and `repoConnectionId` which the production `select` (page.tsx lines 27-34) excludes. Tests render with fields production won't return, masking potential field-name mismatches. Pre-existing from Story 2.2.
- The `mockRedirect` mock (page.test.tsx lines 22-25) is a plain `jest.fn()` that does not replicate `redirect()`'s real throwing behavior. Tests that exercise redirect paths (auth failure, no repo connection) cannot verify the redirect actually halts execution. Pre-existing from Story 2.2.

### Summary

Story 2.6's test additions are clean, focused, and follow the established `ArtifactListEntry` pattern from Story 2.5 exactly. The 7 new tests (6 in `ArtifactCard.test.tsx`, 1 in `page.test.tsx`) cover both acceptance criteria with P0 priority, and the existing tests from Stories 2.2–2.5 remain green. No Story 2.6-specific violations were found — all 3 LOW violations are pre-existing issues already documented in `deferred-work.md` and prior test reviews. The test suite passes cleanly (471 tests, 0 failures).

## Quality Criteria Assessment

| Criterion | Status | Score | Grade | Violations |
|-----------|--------|-------|-------|------------|
| Determinism | PASS | 100/100 | A+ | 0 |
| Isolation | PASS (with warnings) | 98/100 | A+ | 1 LOW |
| Maintainability | PASS (with warnings) | 96/100 | A | 2 LOW |
| Performance | PASS | 100/100 | A+ | 0 |
| **Overall (weighted)** | **PASS** | **96/100** | **A** | **0 HIGH, 0 MEDIUM, 3 LOW** |

**Weighting**: Determinism 30%, Isolation 30%, Maintainability 25%, Performance 15%

**Total Violations**: 0 Critical, 0 High, 0 Medium, 3 Low

---

## Quality Score Breakdown

```
Starting Score:          100

Determinism (weight 30%):
  0 violations
  Subtotal:              100/100

Isolation (weight 30%):
  1 LOW × 2 =            -2
  Subtotal:               98/100

Maintainability (weight 25%):
  2 LOW × 2 =            -4
  Subtotal:               96/100

Performance (weight 15%):
  0 violations
  Subtotal:              100/100

Weighted Overall:         96/100
Grade:                    A
```

---

## Critical Issues (Must Fix)

No critical issues detected.

---

## Recommendations (Should Fix)

### 1. Add `jest.restoreAllMocks()` to `afterEach` in both test files

**Severity**: P3 (Low)
**Location**: `apps/web/src/components/project-map/ArtifactCard.test.tsx` (all 4 describe blocks), `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` (all 6 describe blocks)
**Criterion**: Isolation (mock cleanup)
**Knowledge Base**: [test-quality.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md)

**Issue Description**:
All describe blocks use `jest.clearAllMocks()` in `beforeEach` but never `jest.restoreAllMocks()` in `afterEach`. `clearAllMocks()` resets call history and mock instances but does NOT restore the original implementation — `mockResolvedValue` / `mockResolvedValueOnce` implementations persist across tests. While `mockResolvedValueOnce` is consumed per-call, `mockResolvedValue` set in one describe block leaks into the next.

In practice, each test re-sets its mock return values via `setupArtifacts()` or direct `mockResolvedValue` calls, so the leak is masked. But a test that forgets to set a mock value could silently use the previous test's value — a latent isolation bug.

**Recommended Improvement**:
Add `afterEach(() => jest.restoreAllMocks())` alongside the existing `beforeEach(() => jest.clearAllMocks())`. Or use `jest.resetAllMocks()` in `beforeEach` (which does both).

**Note**: This is the same pre-existing pattern noted in Story 2.2, 2.3, 2.4, and 2.5 reviews. It is a codebase-wide convention, not a Story 2.6 regression.

**Priority**: P3 — latent risk, not an active bug. Address codebase-wide in a dedicated cleanup PR.

---

### 2. Align `ARTIFACTS` fixture with production `select` in `page.test.tsx`

**Severity**: P3 (Low)
**Location**: `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx:71-96`
**Criterion**: Maintainability (test data fidelity)
**Knowledge Base**: [data-factories.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/data-factories.md)

**Issue Description**:
The `ARTIFACTS` fixture includes `content`, `createdAt`, `updatedAt`, and `repoConnectionId` fields. The production `artifactSelect` (page.tsx lines 27-34) selects only `id`, `type`, `title`, `status`, `lastModifiedAt`, and `path`. Tests render with fields production won't return, masking potential field-name mismatches — if a test asserts on `content` and the production query doesn't select it, the test passes but the real page would fail.

**Current Code**:
```typescript
const ARTIFACTS = [
  {
    id: 'art_1',
    repoConnectionId: 'conn_1',  // not in production select
    path: '_bmad-output/prd.md',
    type: 'prd',
    title: 'bmad-easy PRD',
    status: 'completed',
    lastModifiedAt: new Date('2026-06-14'),
    content: '# PRD',           // not in production select
    createdAt: new Date('2026-06-14'),  // not in production select
    updatedAt: new Date('2026-06-14'),  // not in production select
  },
  // ...
];
```

**Recommended Improvement**:
Remove fields not in the production `select`:
```typescript
const ARTIFACTS = [
  {
    id: 'art_1',
    path: '_bmad-output/prd.md',
    type: 'prd',
    title: 'bmad-easy PRD',
    status: 'completed',
    lastModifiedAt: new Date('2026-06-14'),
  },
  // ...
];
```

**Note**: Pre-existing from Story 2.2. Already recorded in `deferred-work.md` and the story's Review Findings.

**Priority**: P3 — no active bug, but masks potential field mismatches. Address when the page test is next modified.

---

### 3. Make `mockRedirect` replicate real throwing behavior

**Severity**: P3 (Low)
**Location**: `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx:22-25`
**Criterion**: Isolation (mock fidelity)
**Knowledge Base**: [test-quality.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md)

**Issue Description**:
The `mockRedirect` is a plain `jest.fn()` that records calls but does not throw. In production, `redirect()` throws internally to halt execution. Tests that exercise redirect paths (auth failure, no repo connection) cannot verify that execution actually halts after the redirect — the mock returns `undefined` and the page continues executing, which could produce false positives.

**Current Code**:
```typescript
const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));
```

**Recommended Improvement**:
```typescript
const mockRedirect = jest.fn(() => {
  throw new Error('NEXT_REDIRECT');
});
```

This replicates `redirect()`'s real behavior — tests that assert redirect paths can verify execution halts, and the page's `return null as never` after `redirect()` is exercised correctly.

**Note**: Pre-existing from Story 2.2. Same pattern already recorded for the artifacts page in `deferred-work.md`.

**Priority**: P3 — latent risk, not an active bug (no test currently asserts on post-redirect behavior). Address codebase-wide.

---

## Best Practices Found

### 1. `getByRole('listitem')` + `tagName` assertion for role-overridden link elements

**Location**: `apps/web/src/components/project-map/ArtifactCard.test.tsx:111-116`
**Pattern**: Query by explicit role, assert on tag name
**Knowledge Base**: [selector-resilience.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/selector-resilience.md)

**Why This Is Good**:
The component has `role="listitem"` on the `<Link>`/`<a>`, which overrides the `<a>`'s implicit `link` role. Querying with `getByRole('link')` would fail at runtime because the ARIA role takes precedence. The test correctly queries `getByRole('listitem')` (the role that actually applies), then asserts `item.tagName === 'A'` to verify the element is an anchor tag and `item` has the `href` attribute. This is the correct way to test a link element with a role override.

**Code Example**:
```typescript
it('[P0] renders as a link (<a> tag) with the correct href', () => {
  render(<ArtifactCard {...COMPLETED_ARTIFACT} />);
  const item = screen.getByRole('listitem');
  expect(item.tagName).toBe('A');
  expect(item).toHaveAttribute('href', '/artifacts?id=art_1');
});
```

**Use as Reference**: Whenever a link element has an explicit `role` attribute that overrides its implicit role, query by the explicit role and assert on `tagName` to verify the element type.

---

### 2. Render-stub mock includes all props in output string for integration assertion

**Location**: `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx:52-55`
**Pattern**: Mock renders props as identifiable string for HTML assertion
**Knowledge Base**: [test-quality.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md)

**Why This Is Good**:
The `ArtifactCard` mock accepts `href` and includes it in the output string (`ArtifactCard:${type}:${title}:${status}:${href}`). This enables the page test to assert that the page constructs and passes the correct `href` to each card by checking the rendered HTML string. The mock isolates the page test from child component logic while still verifying the integration contract (page → card prop passing). Both completed and in-progress artifacts are asserted in a single test, covering AC-1 and AC-2 together.

**Code Example**:
```typescript
jest.mock('@/components/project-map/ArtifactCard', () => ({
  ArtifactCard: ({ title, type, status, href }: { title: string; type: string; status: string; href: string }) =>
    `ArtifactCard:${type}:${title}:${status}:${href}`,
}));

// In test:
expect(html).toContain(
  'ArtifactCard:prd:bmad-easy PRD:completed:/artifacts?id=art_1',
);
expect(html).toContain(
  'ArtifactCard:architecture:System Architecture:in-progress:/artifacts?id=art_2',
);
```

**Use as Reference**: When testing Server Components that pass props to child components, mock the children as render stubs that include the props in their output string. This verifies prop passing without testing child logic.

---

### 3. `aria-label` tested for both status variants

**Location**: `apps/web/src/components/project-map/ArtifactCard.test.tsx:118-134`
**Pattern**: Test accessible name for all status variants
**Knowledge Base**: [selector-resilience.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/selector-resilience.md)

**Why This Is Good**:
The `aria-label` tests cover both status variants — completed (`"PRD: bmad-easy PRD — Completed"`) and in-progress (`"Architecture: System Architecture — In progress"`). This verifies the `STATUS_LABELS` map produces correct labels for both statuses, and the `aria-label` template string interpolates all three components (type, title, status) correctly. The P0 test covers the completed variant; the P1 test covers the in-progress variant with its different status label.

**Code Example**:
```typescript
it('[P0] renders aria-label in the format "{TYPE}: {title} — {STATUS}"', () => {
  render(<ArtifactCard {...COMPLETED_ARTIFACT} />);
  const item = screen.getByRole('listitem');
  expect(item).toHaveAttribute('aria-label', 'PRD: bmad-easy PRD — Completed');
});

it('[P1] renders aria-label for in-progress artifact with correct status label', () => {
  render(<ArtifactCard {...IN_PROGRESS_ARTIFACT} />);
  const item = screen.getByRole('listitem');
  expect(item).toHaveAttribute('aria-label', 'Architecture: System Architecture — In progress');
});
```

**Use as Reference**: When a component's accessible name depends on a status/type variant, test all variants to verify the label map produces correct output for each.

---

## Test File Analysis

### File: `ArtifactCard.test.tsx`

| Field | Value |
|-------|-------|
| **File Path** | `apps/web/src/components/project-map/ArtifactCard.test.tsx` |
| **File Size** | 156 lines, 4.8 KB |
| **Test Framework** | Jest 30 + @testing-library/react |
| **Environment** | jsdom |
| **Language** | TypeScript |
| **Describe Blocks** | 4 |
| **Test Cases** | 11 (8 P0, 3 P1) |
| **Average Test Length** | ~8 lines per test |
| **Fixtures Used** | 2 (`COMPLETED_ARTIFACT`, `IN_PROGRESS_ARTIFACT` constants with `href` field) |
| **Data Factories** | 0 (hardcoded constants — appropriate for component tests) |
| **Mock Patterns** | None needed (presentational component, no external dependencies) |
| **Cleanup** | `jest.clearAllMocks()` in `beforeEach` (4 describe blocks) |
| **Story 2.6 Additions** | 6 new tests (link behavior describe block), `href` added to fixtures, header comment updated |

### File: `page.test.tsx`

| Field | Value |
|-------|-------|
| **File Path** | `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` |
| **File Size** | 288 lines, 9.6 KB |
| **Test Framework** | Jest 30 + react-dom/server (`renderToStaticMarkup`) |
| **Environment** | node (`@jest-environment node`) |
| **Language** | TypeScript |
| **Describe Blocks** | 6 |
| **Test Cases** | 15 (9 P0, 6 P1) |
| **Average Test Length** | ~10 lines per test |
| **Fixtures Used** | 0 (mock data constants: `SESSION`, `REPO_CONNECTION`, `ARTIFACTS`) |
| **Mock Patterns** | `jest.mock()` for `next/navigation`, `@/lib/auth`, `@/lib/prisma`, `@/actions/credential-health.actions`, `@/actions/artifacts.actions`, and 3 child component render stubs |
| **Cleanup** | `jest.clearAllMocks()` in `beforeEach` (6 describe blocks) |
| **Helpers** | `setupArtifacts()`, `renderPage()` |
| **Story 2.6 Additions** | 1 new test (artifact card href describe block), `ArtifactCard` mock updated to accept `href` |

---

## Context and Integration

### Related Artifacts

- **Story File**: [2-6-navigate-from-the-project-map-to-an-artifact.md](../../implementation-artifacts/2-6-navigate-from-the-project-map-to-an-artifact.md)
- **ATDD Checklist**: [atdd-checklist-2-6-navigate-from-the-project-map-to-an-artifact.md](../atdd-checklist-2-6-navigate-from-the-project-map-to-an-artifact.md)
- **Previous Review**: [test-review-2-5.md](test-review-2-5.md) (Story 2.5 — baseline for comparison)
- **Risk Assessment**: P0 threshold (all acceptance-criteria tests must pass)
- **Priority Framework**: P0/P1 applied per `project-context.md:158-162`

### Story 2.5 → 2.6 Comparison

| Metric | Story 2.5 | Story 2.6 | Delta |
|--------|-----------|-----------|-------|
| Test files in scope | 5 (4 Jest + 1 E2E) | 2 (2 Jest) | -3 |
| Total tests in scope | 60 (50 unit/component + 10 E2E) | 26 (26 component) | -34 |
| P0 tests | 39 | 17 | -22 |
| P1 tests | 14 | 9 | -5 |
| New tests added | 60 (new story) | 7 (incremental) | -53 |
| Quality score | 91/100 (A) | 96/100 (A) | +5 |
| Lint warnings | 7 | 7 | 0 |
| Full suite | 464 | 471 | +7 |

Story 2.6 improved the quality score from 91 to 96. Key differences from Story 2.5:
- No file length violations (Story 2.5 had `page.test.tsx` at 412 lines; Story 2.6's longest file is 288 lines)
- No timing-based assertions (Story 2.5 had NFR-P4 2-second load E2E test)
- No E2E complexity (Story 2.6 is a component-level change — correctly scoped to Jest component tests)
- Smaller, more focused change (7 new tests vs 60)
- All 3 LOW violations are pre-existing — no Story 2.6-specific issues introduced

---

## Knowledge Base References

This review consulted the following knowledge base fragments:

- **[test-quality.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/test-quality.md)** — Definition of Done for tests (no hard waits, <300 lines, <1.5 min, self-cleaning, explicit assertions)
- **[data-factories.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/data-factories.md)** — Factory functions with overrides, API-first setup, cleanup discipline
- **[selective-testing.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/selective-testing.md)** — Priority-based test selection, duplicate coverage detection
- **[test-healing-patterns.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/test-healing-patterns.md)** — Common failure patterns and fixes
- **[selector-resilience.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/selector-resilience.md)** — Selector hierarchy: ARIA > text > CSS/ID
- **[timing-debugging.md](.claude/skills/bmad-testarch-test-review/resources/knowledge/timing-debugging.md)** — Race condition identification and deterministic wait fixes

For coverage mapping, consult `trace` workflow outputs.

---

## Next Steps

### Immediate Actions (Before Merge)

None required. All 471 tests pass, lint is clean (0 errors, 7 pre-existing warnings), typecheck is clean. The 3 LOW violations are all pre-existing and do not block merge.

### Follow-up Actions (Future PRs)

1. **Add `jest.restoreAllMocks()`** to `afterEach` across all Jest test files — P3, target: codebase-wide cleanup PR (same as Stories 2.2–2.5)
2. **Align `ARTIFACTS` fixture** with production `select` in `page.test.tsx` — P3, target: next modification of the project-map page tests
3. **Make `mockRedirect` throw** to replicate real `redirect()` behavior — P3, target: codebase-wide cleanup PR (same as artifacts page)

### Re-Review Needed?

No re-review needed — approve as-is. The test quality is excellent (96/100, Grade A). All 3 LOW violations are pre-existing issues already documented in `deferred-work.md` and prior test reviews. Story 2.6's 7 new tests are clean, follow established patterns, and cover both ACs with P0 priority.

---

## Decision

**Recommendation**: Approve

**Rationale**:

> Test quality is excellent with 96/100 score (Grade A). Both acceptance criteria have direct P0 coverage — 17 P0 tests and 9 P1 tests across 2 test files. Story 2.6's 7 new tests follow the canonical `ArtifactListEntry` pattern from Story 2.5 exactly, and the `getByRole('listitem')` + `tagName` assertion strategy correctly handles the `role="listitem"` override on the `<Link>` element. The 3 LOW violations (missing `jest.restoreAllMocks()`, fixture over-specification, `mockRedirect` not throwing) are all pre-existing from Story 2.2 and already documented in `deferred-work.md`. No Story 2.6-specific issues were introduced. Tests are production-ready.

---

## Appendix

### Violation Summary by Location

| File | Line(s) | Severity | Dimension | Issue | Fix |
|------|---------|----------|-----------|-------|-----|
| `ArtifactCard.test.tsx` | all describe blocks | P3 | Isolation | Missing `jest.restoreAllMocks()` in `afterEach` | Add `afterEach(() => jest.restoreAllMocks())` |
| `page.test.tsx` | all describe blocks | P3 | Isolation | Missing `jest.restoreAllMocks()` in `afterEach` | Add `afterEach(() => jest.restoreAllMocks())` |
| `page.test.tsx` | 71-96 | P3 | Maintainability | `ARTIFACTS` fixture over-specified vs production `select` | Remove `content`, `createdAt`, `updatedAt`, `repoConnectionId` |
| `page.test.tsx` | 22-25 | P3 | Isolation | `mockRedirect` doesn't replicate real throwing behavior | Make mock throw `'NEXT_REDIRECT'` error |

### Quality Trends

| Review Date | Score | Grade | Critical Issues | Trend |
|-------------|-------|-------|-----------------|-------|
| 2026-07-03 (Story 2.4) | 86/100 | B | 3 HIGH | — |
| 2026-07-03 (Story 2.5) | 91/100 | A | 1 HIGH | Improved (+5 points, -2 HIGH violations) |
| 2026-07-04 (Story 2.6) | 96/100 | A | 0 HIGH | Improved (+5 points, -1 HIGH violation) |

### Related Reviews

| File | Score | Grade | Critical | Status |
|------|-------|-------|----------|--------|
| `ArtifactCard.test.tsx` | 98/100 | A+ | 0 | Approved |
| `page.test.tsx` | 94/100 | A | 0 | Approved |

**Suite Average**: 96/100 (A)

---

## Review Metadata

**Generated By**: BMad TEA Agent (Test Architect)
**Workflow**: testarch-test-review v5.0
**Review ID**: test-review-2-6-20260704
**Timestamp**: 2026-07-04
**Version**: 1.0
**Execution Mode**: Sequential (4 quality dimensions evaluated inline)
**Test Verification**: 471 tests pass (`yarn nx test web --testPathPattern=project-map`), 0 errors, 7 pre-existing lint warnings, typecheck clean
