---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-12'
storyId: '5.1'
storyKey: '5-1-restore-missing-visual-containers'
storyFile: '_bmad-output/implementation-artifacts/5-1-restore-missing-visual-containers.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-5-1-restore-missing-visual-containers.md'
generatedTestFiles:
  - apps/web/src/app/sign-in/page.test.tsx
  - apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx
  - apps/web/src/app/(dashboard)/(app)/settings/page.test.tsx
  - apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx
  - apps/web/src/components/conversation/ChatInput.test.tsx
inputDocuments:
  - '_bmad-output/implementation-artifacts/5-1-restore-missing-visual-containers.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/decision-policy.md'
  - '_bmad/tea/config.yaml'
---

# ATDD Checklist — Story 5.1: Restore Missing Visual Containers Across Surfaces

## Step 1: Preflight & Context

- **Stack detected:** fullstack (frontend-only story — all changes in `apps/web`)
- **Test framework:** Jest ~30.3.0 (unit/component, co-located), Playwright ^1.61.0 (E2E in `playwright/`)
- **Story file:** `_bmad-output/implementation-artifacts/5-1-restore-missing-visual-containers.md`
- **Story key:** `5-1-restore-missing-visual-containers`
- **Story ID:** `5.1`
- **Acceptance criteria:** 6 ACs, all purely structural (visual container elements, CSS classes, element hierarchy)
- **Prerequisites satisfied:** Story approved with clear ACs, test framework configured, dev environment available

## Step 2: Generation Mode

- **Mode:** AI Generation
- **Rationale:** Acceptance criteria are clear, scenarios are standard UI structure assertions (element exists, has correct CSS classes). No complex UI interactions requiring browser recording.

## Step 3: Test Strategy

### AC-to-Test Mapping

| AC | Description | Test Level | Priority | Test File |
|----|-------------|------------|----------|-----------|
| AC-1 | Sign-in auth card, logo box, heading, legal footer | Component | P0/P1 | `sign-in/page.test.tsx` |
| AC-2 | Onboarding form panel wraps input | Component | P0 | `RepositoryUrlForm.test.tsx` |
| AC-3 | Onboarding BMAD-not-found panel for blocking states | Component | P0/P1 | `RepositoryUrlForm.test.tsx` |
| AC-4 | Settings "coming soon" empty-state | Component (Server Component) | P0/P1 | `settings/page.test.tsx` |
| AC-5 | Artifact-browser frontmatter metadata badge | Component | P0/P1 | `ArtifactViewer.test.tsx` |
| AC-6 | Conversation chat-input-box container | Component | P0/P1 | `ChatInput.test.tsx` |

### E2E Deferral Check

**Question:** Can a browser-level mock pattern simulate the scenario and cover the ACs?

**Answer:** YES — a Playwright E2E test with the project's `webServer` config (starts `web:dev` on port 3000) and authenticated storage state (`.auth/local/default/storage-state.json`) can navigate to each page (`/sign-in`, `/onboarding`, `/settings`, `/conversations/[id]`) and assert DOM structure (element exists, has correct CSS classes). A browser-level mock CAN cover all 6 ACs.

**Decision (DP-4: test-only changes):** E2E is deferred. Although a browser-level mock can cover the ACs, all 6 ACs are purely structural assertions (element exists, has correct CSS classes) that component tests already cover at the appropriate level. Writing E2E tests for the same structural assertions would create duplicate coverage across levels, which Step 3 of the ATDD workflow explicitly says to avoid ("Avoid duplicate coverage across levels"). Component tests provide equivalent structural coverage with faster execution and lower maintenance burden. The check is recorded here as required.

**Rationale:** The ACs assert on rendered HTML structure (CSS classes, element hierarchy), not on browser-specific behavior (navigation, real API calls, browser APIs). Component tests with `render()` (jsdom) or `renderToStaticMarkup()` (node) can fully verify all ACs. An E2E test would assert the same DOM structure but slower and more brittle (requires running dev server, auth state, database).

### Regression Guard Check

**Question:** Does the story involve code that executes external commands with user-controlled input?

**Answer:** NO — Story 5.1 is purely frontend visual container structure (CSS classes, element hierarchy). No external command execution, no user-controlled input passed to shell commands, no credential isolation concerns. The uniform guard template for credential-isolation and input-injection invariants is not applicable.

## Step 4: Generated Test Scaffolds

### Test File 1: `apps/web/src/app/sign-in/page.test.tsx` (AC-1)

**Status:** Existing file — added new describe block "visual containers (Story 5.1, AC-1)"

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `test.skip` auth card container | P0 | AC-1 | 1.4 | Asserts `bg-surface border border-border rounded-xl p-8` wraps OAuth button |
| `test.skip` brand logo box | P0 | AC-1 | 1.2 | Asserts 48x48 `bg-accent rounded-lg` with text "be" |
| `test.skip` "Continue with GitHub" heading | P0 | AC-1 | 1.3 | Asserts heading inside auth card |
| `test.skip` legal footer with Terms/Privacy links | P0 | AC-1 | 1.5 | Asserts Terms and Privacy links render |
| `test.skip` error state preserved in auth card | P1 | AC-1 | 1.6 | Asserts `role="alert"` inside auth card |

### Test File 2: `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx` (AC-2, AC-3)

**Status:** Existing file — added two new describe blocks

**Describe: "form panel container (Story 5.1, AC-2)"**

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `test.skip` form panel wraps content | P0 | AC-2 | 2.1 | Asserts `bg-surface border border-border rounded-xl p-7` |
| `test.skip` panel contains label, input, button | P0 | AC-2 | 2.2 | Asserts panel contains all form elements |

**Describe: "BMAD-not-found panel (Story 5.1, AC-3)"**

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `test.skip` styled panel for BMAD errors | P0 | AC-3 | 3.1 | Asserts `bg-negative-bg border border-negative rounded-lg p-4` |
| `test.skip` title/body split layout | P0 | AC-3 | 3.2 | Asserts panel contains documentation link |
| `test.skip` inline error for non-BMAD errors | P0 | AC-3 | 3.3 | Asserts no styled panel for errors without `documentationLink` |
| `test.skip` aria-describedby wiring preserved | P1 | AC-3 | 3.4 | Asserts `role="alert"` and `aria-describedby` in BMAD panel |

### Test File 3: `apps/web/src/app/(dashboard)/(app)/settings/page.test.tsx` (AC-4)

**Status:** NEW FILE — created with `@jest-environment node` + `renderToStaticMarkup` pattern

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `test.skip` 56x56 icon box | P0 | AC-4 | 4.2 | Asserts `w-14 h-14 bg-surface border border-border rounded-xl` |
| `test.skip` title "Settings coming soon" | P0 | AC-4 | 4.3 | Asserts title text |
| `test.skip` body paragraph | P0 | AC-4 | 4.4 | Asserts body copy with "Account management" etc. |
| `test.skip` three teaser items | P0 | AC-4 | 4.5, 4.6 | Asserts 3 teaser texts |
| `test.skip` centered container max-w-[400px] | P0 | AC-4 | 4.7 | Asserts `max-w-[400px]` |
| `test.skip` no bare "Coming soon" placeholder | P0 | AC-4 | 4.1 | Asserts bare `<p>Coming soon</p>` is gone |
| `test.skip` Breadcrumb and h1 tabIndex preserved | P1 | — | — | Asserts route-focus management preserved |

### Test File 4: `apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx` (AC-5)

**Status:** Existing file — added new describe block "frontmatter metadata badge (Story 5.1, AC-5)"

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `test.skip` badge renders with frontmatter | P0 | AC-5 | 5.2, 5.3 | Asserts `bg-surface-raised border border-border rounded-md` with `aria-label` |
| `test.skip` label-value pairs in JetBrains Mono | P0 | AC-5 | 5.4 | Asserts `font-mono` spans with title/updated fields |
| `test.skip` status field as pill | P0 | AC-5 | 5.5 | Asserts `rounded-full` pill with status value |
| `test.skip` no badge without frontmatter | P0 | AC-5 | 5.6 | Asserts no badge when content has no `---` |
| `test.skip` skips absent frontmatter fields | P1 | AC-5 | 5.5 | Asserts only present fields render |
| `test.skip` badge above Markdown content | P1 | AC-5 | 5.2 | Asserts badge precedes Markdown in DOM order |

### Test File 5: `apps/web/src/components/conversation/ChatInput.test.tsx` (AC-6)

**Status:** Existing file — added new describe block "chat-input-box container (Story 5.1, AC-6)"

| Test | Priority | AC | Task | Description |
|------|----------|----|------|-------------|
| `test.skip` chat-input-box container | P0 | AC-6 | 6.1 | Asserts `bg-surface-raised border border-border rounded-lg` |
| `test.skip` transparent textarea | P0 | AC-6 | 6.2 | Asserts `bg-transparent border-none` on textarea |
| `test.skip` footer row with Send button | P0 | AC-6 | 6.3, 6.4 | Asserts `flex items-center justify-between` contains Send |
| `test.skip` workingTreeIndicator in footer | P0 | AC-6 | 6.5 | Asserts prop renders in footer left |
| `test.skip` footer exists without workingTreeIndicator | P0 | AC-6 | 6.5 | Asserts footer renders without prop |
| `test.skip` focus-within ring on container | P1 | AC-6 | 6.1 | Asserts `focus-within:ring-2` class |
| `test.skip` Stop button in footer | P1 | AC-6 | 6.3 | Asserts Stop button in footer when processing |

## Step 5: Validation & Completion

### TDD Red Phase Compliance

- [x] All generated tests use `test.skip()` (TDD red phase)
- [x] Tests assert EXPECTED behavior (will fail when un-skipped until implementation lands)
- [x] Scaffolds stay skipped until a developer activates the current task
- [x] Story file tasks amended to instruct activation of existing scaffolding (not creation)
- [x] No active passing tests generated (red phase only)

### Story File Amendments

- [x] Task 7 title changed from "Write/update co-located tests" to "Activate existing ATDD red-phase test scaffolds"
- [x] Task 7 subtasks (7.1–7.5) amended to instruct removing `test.skip()` from existing describe blocks
- [x] Task 8.2 updated to reference "activated ATDD scaffolds from Task 7"
- [x] Testing section in Dev Notes updated to describe the activate-then-verify workflow

### Checklist Validation

- [x] Prerequisites satisfied
- [x] Test files created/updated correctly
- [x] Checklist matches acceptance criteria (all 6 ACs covered)
- [x] Tests are generated as red-phase scaffolds marked with `test.skip()`
- [x] Story metadata and handoff paths captured
- [x] Temp artifacts stored in `_bmad-output/test-artifacts/`
- [x] E2E deferral check recorded (browser-level mock CAN cover ACs; deferred to avoid duplicate coverage)
- [x] Regression guard check recorded (not applicable — no external command execution)

### Summary

- **Test files created/updated:** 5 (1 new, 4 updated)
- **Total test scaffolds:** 30 (all `test.skip()`)
- **P0 scaffolds:** 22
- **P1 scaffolds:** 8
- **E2E scaffolds:** 0 (deferred — see E2E Deferral Check)
- **API scaffolds:** 0 (no API changes in this story)
- **Checklist output:** `_bmad-output/test-artifacts/atdd-checklist-5-1-restore-missing-visual-containers.md`
- **Story file:** `_bmad-output/implementation-artifacts/5-1-restore-missing-visual-containers.md`
- **Next recommended workflow:** `dev-story` (implement tasks, activate scaffolds one-by-one)
