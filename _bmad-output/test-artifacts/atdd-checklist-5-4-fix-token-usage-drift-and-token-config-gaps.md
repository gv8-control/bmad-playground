---
stepsCompleted:
  - 'step-01-preflight-and-context'
  - 'step-02-generation-mode'
  - 'step-03-test-strategy'
  - 'step-04-generate-tests'
lastStep: 'step-04-generate-tests'
lastSaved: '2026-07-12'
workflowType: 'testarch-atdd'
storyId: '5.4'
storyKey: '5-4-fix-token-usage-drift-and-token-config-gaps'
storyFile: '_bmad-output/implementation-artifacts/5-4-fix-token-usage-drift-and-token-config-gaps.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-5-4-fix-token-usage-drift-and-token-config-gaps.md'
generatedTestFiles:
  - 'apps/web/src/components/project-map/ArtifactCard.test.tsx'
  - 'apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx'
  - 'apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx'
  - 'apps/web/src/components/conversation/ChatMessageList.test.tsx'
  - 'apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx'
  - 'apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx'
  - 'apps/web/src/components/shell/SideNavigation.test.tsx'
  - 'apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx'
  - 'apps/web/src/app/global-css.spec.ts'
  - 'apps/web/src/__tests__/tailwind-theme.spec.ts'
inputDocuments:
  - '_bmad-output/implementation-artifacts/5-4-fix-token-usage-drift-and-token-config-gaps.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/decision-policy.md'
  - '.claude/skills/bmad-testarch-atdd/resources/knowledge/component-tdd.md'
  - '.claude/skills/bmad-testarch-atdd/resources/knowledge/test-quality.md'
---

# ATDD Checklist - Epic 5, Story 4: Fix Token-Usage Drift and Token-Config Gaps

**Date:** 2026-07-12
**Author:** Marius
**Primary Test Level:** Component unit tests (Jest + React Testing Library) + structural config tests

---

## Story Summary

Fix token-usage drift (correct tokens exist but wrong ones are used in components) and token-config gaps (structural Tailwind config issues that create drift risk). The investigation confirmed 42/42 token values match DESIGN.md exactly — the problem is token *selection*, not token *definition*.

**As a** developer maintaining the design system
**I want** tokens used correctly and config gaps closed
**So that** drift doesn't recur and the design system is enforced

---

## Acceptance Criteria

1. AC-1: Project-map artifact card hover border uses `hover:border-accent` (not `hover:border-text-3`)
2. AC-2: Onboarding input background is `bg-bg` (recessed), label uses `text-text-1`
3. AC-3: Onboarding focus ring offset uses `ring-offset-bg`, border transitions to `accent` on focus and `negative` on error
4. AC-4: Conversation Save button uses `text-accent-fg` (not `text-bg`)
5. AC-5: Artifact-browser list entry hover uses `hover:bg-surface-raised` (no `/60`), dates use `text-text-3`
6. AC-6: `border-border-subtle` replaced with `border-surface-raised` everywhere
7. AC-7: Scrollbar hiding via `scrollbar-width: none` and `::-webkit-scrollbar { display: none }` in global.css
8. AC-8: `boxShadow: { floating: '0 8px 24px rgba(0,0,0,0.4)' }` token added to Tailwind config
9. AC-9: WorkingTreeIndicator uses `shadow-floating` (not `shadow-lg`)
10. AC-10: `fontWeight` full theme override enforcing 400/500/600 only
11. AC-11: `theme.extend` replaced with full `theme` overrides for `colors`, `borderRadius`, `fontFamily`

---

## Story Integration Metadata

- **Story ID:** `5.4`
- **Story Key:** `5-4-fix-token-usage-drift-and-token-config-gaps`
- **Story File:** `_bmad-output/implementation-artifacts/5-4-fix-token-usage-drift-and-token-config-gaps.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-5-4-fix-token-usage-drift-and-token-config-gaps.md`
- **Generated Test Files:** 10 files (8 existing + 1 new)

---

## E2E Deferral Check

**Per user instruction:** Before deferring E2E coverage, verify no browser-level mock pattern can simulate the scenario.

**Analysis:** All 11 ACs are className/token correctness assertions and Tailwind config structural assertions. A Playwright E2E test could navigate to pages and check element classNames, but:

1. **Component unit tests already assert classNames directly** — they render the component and check `element.className.toContain(...)`. This is the same assertion an E2E test would make, but at lower cost (no browser launch, no auth setup, no page navigation) and higher determinism (no network, no async page load).
2. **jsdom does not compute layout** — `scrollbar-width` and `::-webkit-scrollbar` are CSS rules that jsdom cannot verify at the computed-style level. A Playwright test could check `getComputedStyle()`, but the AC specifies the rules must exist in `global.css` — a structural test on the CSS file content is more direct and deterministic.
3. **Tailwind config structural tests** (AC-8, AC-10, AC-11) are pure unit tests on the config object — no browser adds value.
4. **The story's Testing section explicitly prescribes** component tests asserting className strings and `yarn nx build web` for config verification.

**Conclusion:** No browser-level mock pattern adds value beyond what component unit tests and structural config tests provide. E2E is deferred for all ACs.

**Recorded in ATDD checklist per user instruction.**

---

## Decision Policy Consultation

**Per user instruction:** For any decision that arises, consult `@_bmad-output/decision-policy.md` before escalating.

| Decision | Rule Applied | Resolution |
| --- | --- | --- |
| E2E vs component test level for className assertions | DP-3 (simplest option) | Component unit tests — same assertion, lower cost, higher determinism |
| Test-only changes (scaffold structure, skip markers) | DP-4 (test-only changes) | Decided autonomously — no future constraints |
| Scope: should ArtifactViewer `components` object be exported for testing? | DP-5 (scope temptation) | No — tested via the `components` prop passed to mocked `Markdown` instead |
| External command regression guards | N/A | Not applicable — this story has no code executing external commands with user-controlled input |

**No decision required escalation. All decisions covered by existing rules.**

---

## Red-Phase Test Scaffolds Created

### Component Tests (20 skipped tests across 8 existing files + 1 new file)

#### ArtifactCard.test.tsx (AC-1)

**File:** `apps/web/src/components/project-map/ArtifactCard.test.tsx`

- **Test:** `[P0] has hover border using hover:border-accent (not hover:border-text-3)`
  - **Status:** RED (it.skip) — implementation still has `hover:border-text-3`
  - **Verifies:** AC-1 — hover border uses accent token, not text color token

#### RepositoryUrlForm.test.tsx (AC-2, AC-3)

**File:** `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx`

- **Test:** `[P0] input uses bg-bg (recessed), not bg-surface (raised)` (AC-2)
  - **Status:** RED (it.skip) — implementation still has `bg-surface`
- **Test:** `[P0] field label uses text-text-1, not text-text-2` (AC-2)
  - **Status:** RED (it.skip) — implementation still has `text-text-2`
- **Test:** `[P0] focus ring offset uses ring-offset-bg, not ring-offset-surface` (AC-3)
  - **Status:** RED (it.skip) — implementation still has `ring-offset-surface`
- **Test:** `[P0] input border transitions to border-accent on focus` (AC-3)
  - **Status:** RED (it.skip) — implementation has no `focus:border-accent`
- **Test:** `[P0] input border transitions to border-negative on error` (AC-3)
  - **Status:** RED (it.skip) — implementation has no `border-negative` on error

#### WorkingTreeIndicator.test.tsx (AC-4, AC-9)

**File:** `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx`

- **Test:** `[P0] Save button uses text-accent-fg, not text-bg` (AC-4)
  - **Status:** RED (it.skip) — implementation still has `text-bg`
- **Test:** `[P0] save popover uses shadow-floating, not shadow-lg` (AC-9)
  - **Status:** RED (it.skip) — implementation still has `shadow-lg`
- **Test:** `[P0] info tooltip uses shadow-floating, not shadow-lg` (AC-9)
  - **Status:** RED (it.skip) — implementation still has `shadow-lg`

#### ArtifactListEntry.test.tsx (AC-5)

**File:** `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx`

- **Test:** `[P0] applies hover:bg-surface-raised (no /60 opacity) when not selected` (AC-5)
  - **Status:** RED (it.skip) — implementation still has `hover:bg-surface-raised/60`
- **Test:** `[P0] type label uses text-text-3, not text-text-2` (AC-5)
  - **Status:** RED (it.skip) — implementation still has `text-text-2`
- **Test:** `[P0] date uses text-text-3, not text-text-2` (AC-5)
  - **Status:** RED (it.skip) — implementation still has `text-text-2`

#### SideNavigation.test.tsx (AC-6, AC-7)

**File:** `apps/web/src/components/shell/SideNavigation.test.tsx`

- **Test:** `[P0] nav element uses border-surface-raised on right border, not border-border-subtle` (AC-6)
  - **Status:** RED (it.skip) — implementation still has `border-border-subtle`
- **Test:** `[P0] conversation list scrollable panel has no-scrollbar class` (AC-7)
  - **Status:** RED (it.skip) — implementation has no `no-scrollbar` class

#### artifacts/page.test.tsx (AC-6, AC-7)

**File:** `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx`

- **Test:** `[P0] list pane divider uses border-surface-raised, not border-border-subtle` (AC-6)
  - **Status:** RED (it.skip) — implementation still has `border-border-subtle`
- **Test:** `[P0] artifact list pane has no-scrollbar class` (AC-7)
  - **Status:** RED (it.skip) — implementation has no `no-scrollbar` class

#### ArtifactViewer.test.tsx (AC-6)

**File:** `apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx`

- **Test:** `[P0] h2 separator uses border-surface-raised, not border-border-subtle` (AC-6)
  - **Status:** RED (it.skip) — implementation still has `border-border-subtle`
  - **Note:** Tested via `components` prop function output (react-markdown is mocked)
- **Test:** `[P0] hr element uses border-surface-raised, not border-border-subtle` (AC-6)
  - **Status:** RED (it.skip) — implementation still has `border-border-subtle`
  - **Note:** Tested via `components` prop function output (react-markdown is mocked)

#### ChatMessageList.test.tsx (AC-7)

**File:** `apps/web/src/components/conversation/ChatMessageList.test.tsx`

- **Test:** `[P0] message scroll panel has no-scrollbar class` (AC-7)
  - **Status:** RED (it.skip) — implementation has no `no-scrollbar` class

### Structural Config Tests (9 skipped tests in 1 existing file + 1 new file)

#### global-css.spec.ts (AC-7) — NEW FILE

**File:** `apps/web/src/app/global-css.spec.ts`

- **Test:** `[P0] defines .no-scrollbar with scrollbar-width: none (Firefox)` (AC-7)
  - **Status:** RED (it.skip) — CSS file has no `.no-scrollbar` rule
- **Test:** `[P0] defines .no-scrollbar::-webkit-scrollbar with display: none (Chrome/Safari)` (AC-7)
  - **Status:** RED (it.skip) — CSS file has no `::-webkit-scrollbar` rule

#### tailwind-theme.spec.ts (AC-8, AC-10, AC-11)

**File:** `apps/web/src/__tests__/tailwind-theme.spec.ts`

- **Test:** `[P0] theme.extend.boxShadow.floating matches DESIGN.md` (AC-8)
  - **Status:** RED (it.skip) — config has no `boxShadow` key
- **Test:** `[P0] theme.fontWeight.regular is 400` (AC-10)
  - **Status:** RED (it.skip) — config has no `fontWeight` key
- **Test:** `[P0] theme.fontWeight.medium is 500` (AC-10)
  - **Status:** RED (it.skip) — config has no `fontWeight` key
- **Test:** `[P0] theme.fontWeight.semibold is 600` (AC-10)
  - **Status:** RED (it.skip) — config has no `fontWeight` key
- **Test:** `[P0] fontWeight is a full theme override (not in extend) — font-bold is blocked` (AC-10)
  - **Status:** RED (it.skip) — config has no `theme.fontWeight`
- **Test:** `[P0] colors is a full theme override (in config.theme, not in extend)` (AC-11)
  - **Status:** RED (it.skip) — colors currently in `theme.extend`
- **Test:** `[P0] borderRadius is a full theme override (in config.theme, not in extend)` (AC-11)
  - **Status:** RED (it.skip) — borderRadius currently in `theme.extend`
- **Test:** `[P0] fontFamily is a full theme override (in config.theme, not in extend)` (AC-11)
  - **Status:** RED (it.skip) — fontFamily currently in `theme.extend`
- **Test:** `[P0] spacing remains in theme.extend (not a full override)` (AC-11)
  - **Status:** RED (it.skip) — will pass once config is restructured (spacing stays in extend)
- **Test:** `[P0] fontSize remains in theme.extend (not a full override)` (AC-11)
  - **Status:** RED (it.skip) — will pass once config is restructured (fontSize stays in extend)
- **Test:** `[P0] boxShadow remains in theme.extend (not a full override)` (AC-11)
  - **Status:** RED (it.skip) — will pass once config is restructured (boxShadow stays in extend)

---

## External Command Regression Guards

**Per user instruction:** When creating regression guards for code that executes external commands with user-controlled input, apply a uniform guard template.

**Not applicable to this story.** Story 5.4 is purely frontend CSS/Tailwind config changes — no code executes external commands with user-controlled input. The credential-isolation and input-injection invariant guard template does not apply.

---

## Story File Task Amendments

**Per user instruction:** Tasks that instruct the dev to create scaffolding that ATDD has already applied have been amended to instruct activation of the existing scaffolding instead.

The following tasks in the story file have been amended:

| Task | Original Instruction | Amended Instruction |
| --- | --- | --- |
| 1.2 | "Update ArtifactCard.test.tsx — change assertion from `hover:border-text-3` to `hover:border-accent`" | "ATDD scaffolded — activate the skipped test... Remove `it.skip()` and confirm it fails" |
| 2.5 | "Update RepositoryUrlForm.test.tsx — update assertions to expect `bg-bg`, `text-text-1`, `ring-offset-bg`" | "ATDD scaffolded — activate the skipped tests... Remove `it.skip()` and confirm they fail" |
| 3.4 | "Update WorkingTreeIndicator.test.tsx — assert Save button uses `text-accent-fg`" | "ATDD scaffolded — activate the skipped test... Remove `it.skip()` and confirm it fails" |
| 4.4 | "Update ArtifactListEntry.test.tsx — change assertion from `hover:bg-surface-raised/60` to `hover:bg-surface-raised`" | "ATDD scaffolded — activate the skipped tests... Remove `it.skip()` and confirm they fail" |
| 5.6 (new) | N/A | "ATDD scaffolded — activate the skipped tests for AC-6 in SideNavigation.test.tsx, artifacts/page.test.tsx, ArtifactViewer.test.tsx" |
| 6.4 (new) | N/A | "ATDD scaffolded — activate the skipped tests for AC-7 in global-css.spec.ts, SideNavigation.test.tsx, ChatMessageList.test.tsx, artifacts/page.test.tsx" |
| 8.3 (renumbered) | N/A (was note about shadcn/ui) | "ATDD scaffolded — activate the skipped tests in WorkingTreeIndicator.test.tsx that assert `shadow-floating`" |
| 8.4 (renumbered) | Was 8.3 (shadcn/ui note) | Unchanged — shadcn/ui note preserved |
| 11.1–11.4, 11.6 | "Update [test file] — assert [correct token]" | "ATDD scaffolded — activate the skipped tests... Already scaffolded — remove `it.skip()` after implementing" |

---

## Implementation Checklist

### Test: AC-1 — ArtifactCard hover border

**File:** `apps/web/src/components/project-map/ArtifactCard.test.tsx`

**Tasks to make this test pass:**

- [ ] Remove `it.skip()` from the hover border test
- [ ] Confirm test fails (red) — `hover:border-accent` not found
- [ ] In `ArtifactCard.tsx` line 53, change `hover:border-text-3` to `hover:border-accent`
- [ ] Run test: `yarn nx test web -- ArtifactCard`
- [ ] Test passes (green)

### Test: AC-2, AC-3 — RepositoryUrlForm input bg, label, focus ring

**File:** `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx`

**Tasks to make these tests pass:**

- [ ] Remove `it.skip()` from all 5 token-usage drift tests
- [ ] Confirm tests fail (red)
- [ ] In `RepositoryUrlForm.tsx`: change input `bg-surface` → `bg-bg`, label `text-text-2` → `text-text-1`, ring offset `ring-offset-surface` → `ring-offset-bg`, add `focus:border-accent` and error `border-negative`
- [ ] Run test: `yarn nx test web -- RepositoryUrlForm`
- [ ] Tests pass (green)

### Test: AC-4, AC-9 — WorkingTreeIndicator Save button and shadow

**File:** `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx`

**Tasks to make these tests pass:**

- [ ] Remove `it.skip()` from Save button and shadow-floating tests
- [ ] Confirm tests fail (red)
- [ ] In `WorkingTreeIndicator.tsx`: change `text-bg` → `text-accent-fg` (line 179), `shadow-lg` → `shadow-floating` (lines 139, 207)
- [ ] Run test: `yarn nx test web -- WorkingTreeIndicator`
- [ ] Tests pass (green)

### Test: AC-5 — ArtifactListEntry hover and date color

**File:** `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx`

**Tasks to make these tests pass:**

- [ ] Remove `it.skip()` from hover and date color tests
- [ ] Confirm tests fail (red)
- [ ] In `ArtifactListEntry.tsx`: remove `/60` from hover, change `text-text-2` → `text-text-3` on type label and date
- [ ] Run test: `yarn nx test web -- ArtifactListEntry`
- [ ] Tests pass (green)

### Test: AC-6 — Hairline border tokens

**Files:** `SideNavigation.test.tsx`, `artifacts/page.test.tsx`, `ArtifactViewer.test.tsx`

**Tasks to make these tests pass:**

- [ ] Remove `it.skip()` from all hairline border tests
- [ ] Confirm tests fail (red)
- [ ] In `SideNavigation.tsx` line 29: `border-border-subtle` → `border-surface-raised`
- [ ] In `artifacts/page.tsx` line 93: `border-border-subtle` → `border-surface-raised`
- [ ] In `ArtifactViewer.tsx` lines 36, 99: `border-border-subtle` → `border-surface-raised`
- [ ] Run tests: `yarn nx test web -- SideNavigation ArtifactsPage ArtifactViewer`
- [ ] Tests pass (green)

### Test: AC-7 — Scrollbar hiding

**Files:** `global-css.spec.ts`, `SideNavigation.test.tsx`, `ChatMessageList.test.tsx`, `artifacts/page.test.tsx`

**Tasks to make these tests pass:**

- [ ] Remove `it.skip()` from all scrollbar hiding tests
- [ ] Confirm tests fail (red)
- [ ] In `global.css`: add `.no-scrollbar` rules
- [ ] Apply `no-scrollbar` class to scrollable panels in `SideNavigation.tsx`, `ChatMessageList.tsx`, `artifacts/page.tsx`
- [ ] Run tests: `yarn nx test web -- global-css SideNavigation ChatMessageList ArtifactsPage`
- [ ] Tests pass (green)

### Test: AC-8, AC-10, AC-11 — Tailwind config

**File:** `apps/web/src/__tests__/tailwind-theme.spec.ts`

**Tasks to make these tests pass:**

- [ ] Remove `it.skip()` from all config tests
- [ ] Confirm tests fail (red)
- [ ] In `tailwind.config.ts`: add `boxShadow.floating`, add full `theme.fontWeight` override, move `colors`/`borderRadius`/`fontFamily` from `extend` to `theme`
- [ ] Update existing assertions to read from `config.theme` (not `config.theme.extend`) for colors/borderRadius/fontFamily
- [ ] Run test: `yarn nx test web -- tailwind-theme`
- [ ] Run build: `yarn nx build web` — verify no missing styles
- [ ] Tests pass (green)

---

## Running Tests

```bash
# Run all web tests (skipped tests are ignored)
yarn nx test web

# Run specific test file
yarn nx test web -- ArtifactCard
yarn nx test web -- RepositoryUrlForm
yarn nx test web -- WorkingTreeIndicator
yarn nx test web -- ArtifactListEntry
yarn nx test web -- SideNavigation
yarn nx test web -- ArtifactsPage
yarn nx test web -- ArtifactViewer
yarn nx test web -- ChatMessageList
yarn nx test web -- global-css
yarn nx test web -- tailwind-theme

# Run build to verify Tailwind config changes
yarn nx build web
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

- All tests written as red-phase scaffolds with `it.skip()`
- Tests assert the CORRECT (desired) token values, not the current (wrong) values
- When activated, tests will fail because implementation hasn't changed yet
- Story file tasks amended to instruct activation of existing scaffolding

### GREEN Phase (DEV Team — Next Steps)

1. Pick one AC's test scaffolds from the implementation checklist
2. Remove `it.skip()` for that AC's tests
3. Confirm tests fail (red — implementation still has old tokens)
4. Implement the token changes in the source files
5. Run tests to verify they pass (green)
6. Move to next AC and repeat

### REFACTOR Phase

- Run `yarn nx build web` to verify Tailwind config changes produce valid CSS
- Run `yarn nx lint web` and `yarn nx typecheck web` to verify no errors
- Run full test suite to verify no regressions

---

## Knowledge Base References Applied

- **component-tdd.md** — Red-green-refactor cycle, component test patterns
- **test-quality.md** — Deterministic tests, explicit assertions, isolation

---

## Notes

- All scaffolded tests use `it.skip()` (Jest) — not `test.skip()` — to match the existing test file conventions (all existing tests use `it()`).
- Combined class-string assertions are used throughout (e.g., `expect(className).toContain('hover:border-accent')`) with negative assertions (`not.toContain('hover:border-text-3')`) per the Story 5.2/5.3 review learning.
- The ArtifactViewer hairline border tests access the `components` prop passed to the mocked `Markdown` component, then render the h2/hr function outputs directly — this avoids exporting the `components` object (DP-5: scope temptation).
- The `global-css.spec.ts` file reads the CSS file content via `readFileSync` and asserts on the string content — this is a structural test, not a computed-style test (jsdom cannot verify `scrollbar-width`).
- The existing `tailwind-theme.spec.ts` tests that read from `theme.extend` are NOT modified — they will be updated by the dev as part of Task 11.6 when the config migration moves `colors`/`borderRadius`/`fontFamily` out of `extend`.

---

**Generated by BMad TEA Agent** — 2026-07-12
