---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-04'
storyId: '3.2'
storyKey: 3-2-invoke-bmad-skills-via-slash-command
storyFile: _bmad-output/implementation-artifacts/3-2-invoke-bmad-skills-via-slash-command.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-3-2-invoke-bmad-skills-via-slash-command.md
generatedTestFiles:
  - apps/agent-be/src/conversations/semantic-title.spec.ts
  - apps/agent-be/src/conversations/conversations.service.spec.ts
  - apps/web/src/components/conversation/SlashCommandPicker.test.tsx
  - apps/web/src/components/conversation/ConversationPane.test.tsx
  - apps/web/src/components/shell/SideNavigation.test.tsx
inputDocuments:
  - _bmad-output/implementation-artifacts/3-2-invoke-bmad-skills-via-slash-command.md
  - _bmad-output/project-context.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/component-tdd.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/data-factories.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-levels-framework.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-priorities-matrix.md
---

# ATDD Checklist — Story 3.2: Invoke BMAD Skills via Slash Command

**TDD Phase:** RED (test scaffolds generated, will fail until implementation)
**Stack:** fullstack (Next.js + NestJS) — this story spans both backend and frontend
**Generated:** 2026-07-04
**Execution Mode:** SEQUENTIAL

---

## Step 1 Output: Preflight & Context

### Stack Detection
- Config `test_stack_type`: auto
- Auto-detected: `fullstack` (package.json with Next.js/React + NestJS)
- Story scope: fullstack (agent-be service/controller + web components)

### Prerequisites
- Story 3.2 approved, status `ready-for-dev`, 4 clear ACs
- Jest configured: jsdom for component tests, `@jest-environment node` for pure function tests
- Playwright configured: `playwright.config.ts` (auth setup + chromium projects)
- Dev environment available

### Story Context
- **Story file:** `_bmad-output/implementation-artifacts/3-2-invoke-bmad-skills-via-slash-command.md`
- **Story key:** `3-2-invoke-bmad-skills-via-slash-command`
- **Story ID:** `3.2`
- **Acceptance Criteria:**
  - AC-1: Slash Command Picker opens on `/` (FR9, UX-DR8)
  - AC-2: Empty skills state
  - AC-3: Skill selected and sent (message persistence + title)
  - AC-4: URL transition and side nav on first message

### Framework & Existing Patterns
- Jest with jsdom (default) for client component tests
- `@jest-environment node` for pure function tests (`semantic-title.spec.ts`)
- Co-located tests (`*.spec.ts` / `*.test.tsx` next to source)
- P0/P1 priority tags in `it()` descriptions
- Mock patterns: `jest.mock` at top, `jest.clearAllMocks` in `beforeEach`
- Test header comments citing story, ACs, red-phase status
- `buildTestModule()` for agent-be tests (pre-wires `SandboxServiceFake`)
- `MockEventSource` class pattern for SSE testing in ConversationPane
- `jest.mock('next/navigation', ...)` for `useRouter` mock

### TEA Config Flags
- `tea_use_playwright_utils`: true
- `tea_use_pactjs_utils`: false
- `tea_pact_mcp`: none
- `tea_browser_automation`: auto
- `test_stack_type`: auto

### Knowledge Fragments Loaded
- `data-factories.md` (core) — Factory functions with overrides, API-first setup
- `component-tdd.md` (core) — Red-Green-Refactor cycle, provider isolation
- `test-quality.md` (core) — Deterministic, isolated, explicit, focused, fast tests
- `test-healing-patterns.md` (core) — Common failure patterns and fixes
- `test-levels-framework.md` (core) — Unit vs integration vs E2E selection
- `test-priorities-matrix.md` (core) — P0-P3 priority assignment

### Existing Test Files (to be extended)
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — Story 3.1 delivered this; Story 3.2 adds `listSkills` and `sendTurn` test blocks, extends mock Prisma with `conversation.update` and `turn.create`
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — Story 3.1 delivered this; Story 3.2 adds picker, message sending, and URL transition tests, adds `useRouter` mock
- `apps/web/src/components/shell/SideNavigation.test.tsx` — Story 1.8 delivered this; Story 3.2 adds conversation list rendering tests

### New Test Files (to be created)
- `apps/agent-be/src/conversations/semantic-title.spec.ts` — pure function unit tests for `generateSemanticTitle`
- `apps/web/src/components/conversation/SlashCommandPicker.test.tsx` — component tests for the presentational picker

### Stub Files Created (for TDD red phase compilation)
- `apps/agent-be/src/conversations/semantic-title.ts` — stub that throws "Not implemented"
- `apps/web/src/components/conversation/SlashCommandPicker.tsx` — stub that returns null
- `libs/shared-types/src/sandbox.interface.ts` — added `SkillInfo` type and `listSkills` method to `ISandboxService`
- `apps/agent-be/test/helpers/sandbox-service.fake.ts` — added `setSkills()` control hook and `listSkills()` method
- `apps/agent-be/src/sandbox/sandbox.service.ts` — added `listSkills()` stub (throws)
- `apps/agent-be/src/conversations/conversations.service.ts` — added `sandboxIds` Map, `listSkills()` and `sendTurn()` stubs (throw)

---

## Step 2 Output: Generation Mode

**Mode:** AI Generation

**Rationale:**
- Acceptance criteria are clear (4 ACs covering picker, empty state, message persistence, URL transition)
- Scenarios are standard (REST endpoints, component rendering, keyboard navigation)
- The story spec defines test cases precisely in Tasks 1.3, 2.3, 3.5, 3.6, 4.2, 5.3, 7.4
- No browser recording needed — component and unit tests cover all ACs

---

## Step 3 Output: Test Strategy

### AC to Test Scenario Mapping

#### AC-1: Slash Command Picker opens on `/` (FR9, UX-DR8)

| # | Scenario | Level | Priority | Red Phase Signal |
|---|----------|-------|----------|-----------------|
| 1 | `listSkills` returns skills from the fake | Unit (agent-be) | P0 | Method throws "Not implemented" |
| 2 | `listSkills` returns `[]` for conversation not owned by user (tenant isolation) | Unit (agent-be) | P0 | Method throws "Not implemented" |
| 3 | `listSkills` returns `[]` when sandbox not yet provisioned | Unit (agent-be) | P0 | Method throws "Not implemented" |
| 4 | `listSkills` returns `[]` when `.claude/skills/` is empty | Unit (agent-be) | P1 | Method throws "Not implemented" |
| 5 | SlashCommandPicker renders all skills passed as props | Component (jsdom) | P0 | Component returns null — no skills rendered |
| 6 | SlashCommandPicker highlights item at `selectedIndex` | Component (jsdom) | P0 | Component returns null — no items to query |
| 7 | SlashCommandPicker shows empty state message when no skills | Component (jsdom) | P0 | Component returns null — empty message not rendered |
| 8 | SlashCommandPicker calls `onSelect` when item clicked | Component (jsdom) | P0 | Component returns null — no click target |
| 9 | ConversationPane opens picker on `/` at start of input | Component (jsdom) | P0 | No picker integration — `listbox` role not found |
| 10 | ConversationPane filters skills by query prefix | Component (jsdom) | P0 | No picker integration — no options to filter |
| 11 | ConversationPane ArrowDown/ArrowUp moves focus in picker | Component (jsdom) | P0 | No picker integration — no keyboard handler |
| 12 | ConversationPane Enter in picker selects skill, appends `/{name} ` | Component (jsdom) | P0 | No picker integration — Enter submits form instead |
| 13 | ConversationPane Escape closes picker | Component (jsdom) | P0 | No picker integration — Escape not handled |
| 14 | ConversationPane closes picker on outside click | Component (jsdom) | P1 | No outside-click handler |

#### AC-2: Empty skills state

| # | Scenario | Level | Priority | Red Phase Signal |
|---|----------|-------|----------|-----------------|
| 15 | ConversationPane shows "No skills found in this repository." when no skills | Component (jsdom) | P0 | No picker integration — empty state not rendered |

#### AC-3: Skill selected and sent (message persistence + title)

| # | Scenario | Level | Priority | Red Phase Signal |
|---|----------|-------|----------|-----------------|
| 16 | `generateSemanticTitle` extracts first 2-5 words | Unit (agent-be) | P0 | Function throws "Not implemented" |
| 17 | `generateSemanticTitle` strips leading `/` from slash commands | Unit (agent-be) | P0 | Function throws "Not implemented" |
| 18 | `generateSemanticTitle` truncates long content with ellipsis at 60 chars | Unit (agent-be) | P0 | Function throws "Not implemented" |
| 19 | `generateSemanticTitle` returns "New Conversation" for empty content | Unit (agent-be) | P1 | Function throws "Not implemented" |
| 20 | `sendTurn` persists a user turn with correct content | Unit (agent-be) | P0 | Method throws "Not implemented" |
| 21 | `sendTurn` clears the idle timeout | Unit (agent-be) | P0 | Method throws "Not implemented" |
| 22 | `sendTurn` generates and persists semantic title on first message | Unit (agent-be) | P0 | Method throws "Not implemented" |
| 23 | `sendTurn` does not overwrite existing title on subsequent messages | Unit (agent-be) | P0 | Method throws "Not implemented" |
| 24 | `sendTurn` throws for conversation not owned by user | Unit (agent-be) | P0 | Method throws "Not implemented" |
| 25 | `sendTurn` updates `lastActiveAt` | Unit (agent-be) | P1 | Method throws "Not implemented" |
| 26 | ConversationPane sends message via POST /turns on Enter | Component (jsdom) | P0 | `sendMessage` is a placeholder that clears input — no fetch to /turns |

#### AC-4: URL transition and side nav on first message

| # | Scenario | Level | Priority | Red Phase Signal |
|---|----------|-------|----------|-----------------|
| 27 | ConversationPane transitions URL to /conversations/:id on first message | Component (jsdom) | P0 | `sendMessage` doesn't call `router.push` — mockPush not called |
| 28 | SideNavigation renders conversation titles as links | Component (jsdom) | P0 | Component doesn't accept `conversations` prop — no links rendered |
| 29 | SideNavigation highlights active conversation | Component (jsdom) | P0 | No conversation links to highlight |
| 30 | SideNavigation shows no items when conversations array is empty | Component (jsdom) | P0 | Existing test asserts empty list — new test asserts with prop passed |

### Test Level Selection

- **Unit (Jest)** — `semantic-title.spec.ts`
  - Scenarios 16-19: pure function tests, no mocks needed
  - Environment: `@jest-environment node`

- **Unit (Jest + buildTestModule)** — `conversations.service.spec.ts`
  - Scenarios 1-4, 20-25: service method tests with mock Prisma and SandboxServiceFake
  - Environment: default (jsdom not needed)

- **Component (Jest + RTL)** — `SlashCommandPicker.test.tsx`
  - Scenarios 5-8: presentational component rendering and interaction
  - Environment: jsdom

- **Component (Jest + RTL)** — `ConversationPane.test.tsx`
  - Scenarios 9-15, 26-27: picker integration, message sending, URL transition
  - Environment: jsdom, with MockEventSource and useRouter mock

- **Component (Jest + RTL)** — `SideNavigation.test.tsx`
  - Scenarios 28-30: conversation list rendering
  - Environment: jsdom, with usePathname mock

- **No E2E** — the story is covered by unit and component tests. E2E would primarily exercise Next.js routing and SSE infrastructure (framework behavior), not story-specific logic.

- **No Integration tests** — the `SandboxServiceFake` covers the sandbox interaction. No real database or Daytona integration needed for AC coverage.

### Priority Assignment

- **P0** (26 scenarios): All directly cover AC-1 through AC-4. Picker opening, skill listing, message persistence, title generation, URL transition, and side nav rendering are all acceptance-criteria coverage.
- **P1** (5 scenarios): Edge cases — empty skills list, whitespace-only title, outside-click dismiss, `lastActiveAt` update.

### Red Phase Confirmation

All new tests will fail before implementation:

- **`semantic-title.spec.ts`**: All tests `it.skip()` — function throws "Not implemented". When activated, tests fail on the throw.
- **`conversations.service.spec.ts`**: New tests `it.skip()` — `listSkills` and `sendTurn` methods throw "Not implemented". When activated, tests fail on the throw.
- **`SlashCommandPicker.test.tsx`**: All tests `it.skip()` — component returns null. When activated, tests fail because no elements are rendered.
- **`ConversationPane.test.tsx`**: New tests `it.skip()` — no picker integration, `sendMessage` is a placeholder. When activated, tests fail because `listbox` role not found, `fetch` not called with /turns, `mockPush` not called.
- **`SideNavigation.test.tsx`**: New tests `it.skip()` — component doesn't accept `conversations` prop. When activated, tests fail because no conversation links are rendered.

### Files to Create/Update

| File | Action | Scenarios |
|------|--------|-----------|
| `apps/agent-be/src/conversations/semantic-title.spec.ts` | Create: 5 new `it.skip()` tests | 16-19 |
| `apps/agent-be/src/conversations/conversations.service.spec.ts` | Update: header, mock Prisma, 10 new `it.skip()` tests | 1-4, 20-25 |
| `apps/web/src/components/conversation/SlashCommandPicker.test.tsx` | Create: 4 new `it.skip()` tests | 5-8 |
| `apps/web/src/components/conversation/ConversationPane.test.tsx` | Update: header, useRouter mock, 12 new `it.skip()` tests | 9-15, 26-27 |
| `apps/web/src/components/shell/SideNavigation.test.tsx` | Update: header, 3 new `it.skip()` tests | 28-30 |

---

## Step 4 Output: Test Generation (Sequential)

### Execution Mode
- Config `tea_execution_mode`: auto → resolved to **SEQUENTIAL** (no subagent dispatch needed)
- Worker A (API tests): **SKIPPED** — no Playwright API request tests; backend tests are Jest unit tests
- Worker B (E2E tests): **SKIPPED** — no E2E tests needed (component + unit tests cover all ACs)
- All tests generated directly (no subagent for unit/component tests)

### TDD Red Phase Compliance

All new tests use `it.skip()` (Jest red-phase scaffolds):

- `semantic-title.spec.ts`: 5 new `it.skip()` tests
- `conversations.service.spec.ts`: 10 new `it.skip()` tests
- `SlashCommandPicker.test.tsx`: 4 new `it.skip()` tests
- `ConversationPane.test.tsx`: 12 new `it.skip()` tests
- `SideNavigation.test.tsx`: 3 new `it.skip()` tests
- No placeholder assertions — all tests assert expected behavior
- All tests marked as expected-to-fail when activated

### Stub Files Created

Minimal stubs created for TDD red phase compilation (methods exist but throw "Not implemented"):

| File | Stub Content |
|------|-------------|
| `apps/agent-be/src/conversations/semantic-title.ts` | `generateSemanticTitle()` throws "Not implemented — Story 3.2 Task 3.4" |
| `apps/web/src/components/conversation/SlashCommandPicker.tsx` | Component returns `null` |
| `libs/shared-types/src/sandbox.interface.ts` | Added `SkillInfo` type + `listSkills` method to interface |
| `apps/agent-be/test/helpers/sandbox-service.fake.ts` | Added `setSkills()` + `listSkills()` (returns in-memory list) |
| `apps/agent-be/src/sandbox/sandbox.service.ts` | Added `listSkills()` stub (throws) |
| `apps/agent-be/src/conversations/conversations.service.ts` | Added `sandboxIds` Map + `listSkills()` and `sendTurn()` stubs (throw) |

### Test Verification Results

```
agent-be:
Test Suites: 1 skipped, 3 passed, 4 total
Tests:       15 skipped, 20 passed, 35 total

web:
Test Suites: 1 skipped, 39 passed, 40 total
Tests:       16 skipped, 485 passed, 501 total
```

- **agent-be**: 20 passed (all existing Story 3.1 tests), 15 skipped (all new red-phase scaffolds), 0 failed
- **web**: 485 passed (all existing tests, matches Story 3.1 baseline), 16 skipped (all new red-phase scaffolds), 0 failed
- **0 failed**: No regressions

### Lint & Typecheck

- `yarn nx lint agent-be`: 0 errors
- `yarn nx lint web`: 0 errors
- `tsc --noEmit -p apps/agent-be/tsconfig.app.json`: clean
- `tsc --noEmit -p apps/web/tsconfig.json`: clean

### Acceptance Criteria Coverage

| AC | Covered By | Tests |
|----|-----------|-------|
| AC-1: Picker opens on `/` | listSkills service tests, SlashCommandPicker component tests, ConversationPane picker tests | 14 P0 + 1 P1 |
| AC-2: Empty skills state | listSkills empty test, SlashCommandPicker empty state test, ConversationPane empty state test | 3 P0 + 1 P1 |
| AC-3: Skill selected and sent | semantic-title tests, sendTurn service tests, ConversationPane message sending test | 9 P0 + 2 P1 |
| AC-4: URL transition and side nav | ConversationPane URL transition test, SideNavigation conversation list tests | 4 P0 |

### Summary Statistics

```json
{
  "tdd_phase": "RED",
  "total_tests": 31,
  "unit_tests": 15,
  "component_tests": 16,
  "api_tests": 0,
  "e2e_tests": 0,
  "all_tests_skipped": true,
  "expected_to_fail": true,
  "stubs_created": 6,
  "acceptance_criteria_covered": ["AC-1", "AC-2", "AC-3", "AC-4"],
  "subagent_execution": "SEQUENTIAL (unit + component only, no API/E2E subagents)",
  "performance_gain": "baseline (no parallel speedup needed)"
}
```

---

## Next Steps (Task-by-Task Activation)

During implementation of each task:

1. **Task 1 (ISandboxService.listSkills):** Remove `it.skip()` from the 4 `listSkills` tests in `conversations.service.spec.ts`. Implement `listSkills` in `sandbox.service.ts` (replace stub). Run `yarn nx test agent-be --testPathPattern=conversations.service.spec`. Verify tests fail first (red), then pass after implementing (green).

2. **Task 2 (agent-be skills endpoint):** Already covered by Task 1 tests. Add `GET /:id/skills` endpoint to controller. The service method is already tested.

3. **Task 3 (agent-be message sending):** Remove `it.skip()` from the 5 `semantic-title.spec.ts` tests and the 6 `sendTurn` tests in `conversations.service.spec.ts`. Implement `generateSemanticTitle` in `semantic-title.ts` (replace stub). Implement `sendTurn` in `conversations.service.ts` (replace stub). Run `yarn nx test agent-be --testPathPattern="semantic-title.spec|conversations.service.spec"`.

4. **Task 4 (SlashCommandPicker):** Remove `it.skip()` from the 4 tests in `SlashCommandPicker.test.tsx`. Implement `SlashCommandPicker.tsx` (replace stub). Run `yarn nx test web --testPathPattern=SlashCommandPicker.test`.

5. **Task 5 (ConversationPane integration):** Remove `it.skip()` from the 12 tests in `ConversationPane.test.tsx`. Implement picker integration, message sending, URL transition in `ConversationPane.tsx`. Run `yarn nx test web --testPathPattern=ConversationPane.test`.

6. **Task 7 (SideNavigation):** Remove `it.skip()` from the 3 tests in `SideNavigation.test.tsx`. Add `conversations` prop to `SideNavigation.tsx` and `AppShell.tsx`. Run `yarn nx test web --testPathPattern=SideNavigation.test`.

7. **Task 8 (Verify):** Run `yarn nx lint agent-be`, `yarn nx lint web`, typecheck, `yarn nx test agent-be`, `yarn nx test web` to verify all tests pass.

---

## Step 5 Output: Validate & Complete

### Validation Checklist

#### Prerequisites
- [x] Story approved with clear acceptance criteria (AC-1 through AC-4 — all testable)
- [x] Development environment ready
- [x] Framework scaffolding exists (Jest configured, Playwright configured)
- [x] Test framework configuration available (`apps/web/jest.config.ts`, `apps/agent-be/jest.config.ts`)

#### Step 1: Story Context
- [x] Story markdown file loaded and parsed
- [x] All acceptance criteria identified (AC-1, AC-2, AC-3, AC-4)
- [x] Affected components identified (ConversationsService, ConversationsController, SandboxService, ConversationPane, SlashCommandPicker, SideNavigation, AppShell, layout.tsx)
- [x] Technical constraints documented (buildTestModule, SandboxServiceFake, MockEventSource, useRouter mock)
- [x] Framework configuration loaded
- [x] Existing fixture patterns reviewed
- [x] Similar test patterns found (ConversationPane.test.tsx, SideNavigation.test.tsx from prior stories)
- [x] Knowledge base fragments loaded (component-tdd, test-quality, test-healing-patterns, data-factories, test-levels-framework, test-priorities-matrix)

#### Step 2: Test Level Selection
- [x] Each AC analyzed for appropriate test level
- [x] Unit tests selected for backend service methods and pure function
- [x] Component tests selected for frontend components
- [x] No E2E needed (component + unit tests cover all ACs)
- [x] No integration tests needed (SandboxServiceFake covers sandbox interaction)
- [x] Duplicate coverage avoided
- [x] Tests prioritized (P0 for AC coverage, P1 for edge cases)
- [x] Test levels documented in checklist

#### Step 3: Red-Phase Scaffolds
- [x] New test files created (co-located with source)
- [x] Existing test files extended (header comments updated, mocks extended)
- [x] Tests follow clear render → query → assert structure
- [x] Component mounting works (render() from RTL)
- [x] Service methods tested via buildTestModule() + SandboxServiceFake
- [x] All new tests use `it.skip()` (Jest red-phase scaffolds)
- [x] Stub files created for compilation (semantic-title.ts, SlashCommandPicker.tsx, interface additions)
- [x] Activation guidance documented

#### Test Quality
- [x] All tests have descriptive names
- [x] No duplicate tests
- [x] No flaky patterns (synchronous components, deterministic mocks)
- [x] No test interdependencies (each test renders its own component / builds its own module)
- [x] Tests are deterministic

#### Code Quality
- [x] Lint passes: 0 errors (agent-be and web)
- [x] Typecheck passes: clean (agent-be and web)
- [x] Consistent naming conventions followed
- [x] Imports organized and correct
- [x] Code follows project style guide (matches existing test patterns)

#### Deliverables
- [x] ATDD checklist created at `_bmad-output/test-artifacts/atdd-checklist-3-2-invoke-bmad-skills-via-slash-command.md`
- [x] Frontmatter includes storyId, storyKey, storyFile, atddChecklistPath, generatedTestFiles
- [x] All scaffolds marked with `it.skip()`
- [x] No scaffold emitted as active passing test
- [x] Test run output captured (31 skipped, 505 passed, 0 failed across both projects)

### Completion Summary

- **Story ID:** 3.2
- **Story file:** `_bmad-output/implementation-artifacts/3-2-invoke-bmad-skills-via-slash-command.md`
- **Primary test levels:** Unit (Jest) + Component (Jest + RTL)
- **Test counts:** 31 new tests (all `it.skip()` red-phase scaffolds)
  - 15 unit tests (agent-be): 5 semantic-title + 4 listSkills + 6 sendTurn
  - 16 component tests (web): 4 SlashCommandPicker + 9 ConversationPane picker/sending + 3 SideNavigation
- **Test file paths:**
  - `apps/agent-be/src/conversations/semantic-title.spec.ts` (5 new scaffolds, new file)
  - `apps/agent-be/src/conversations/conversations.service.spec.ts` (10 new scaffolds, extended)
  - `apps/web/src/components/conversation/SlashCommandPicker.test.tsx` (4 new scaffolds, new file)
  - `apps/web/src/components/conversation/ConversationPane.test.tsx` (9 new scaffolds, extended)
  - `apps/web/src/components/shell/SideNavigation.test.tsx` (3 new scaffolds, extended)
- **Stub files created:** 6 (semantic-title.ts, SlashCommandPicker.tsx, sandbox.interface.ts additions, sandbox-service.fake.ts additions, sandbox.service.ts stub, conversations.service.ts stubs)
- **Factory count:** 0 (no data factories needed — mock Prisma and SandboxServiceFake cover test data)
- **Mock requirements:** Extended mock Prisma (conversation.update, turn.create), useRouter mock, MockEventSource (existing)
- **data-testid count:** 0 (using role-based queries per ARIA-first pattern)
- **Knowledge fragments applied:** component-tdd, test-quality, test-healing-patterns, data-factories, test-levels-framework, test-priorities-matrix
- **Checklist output:** `_bmad-output/test-artifacts/atdd-checklist-3-2-invoke-bmad-skills-via-slash-command.md`
- **Next recommended workflow:** `dev-story` (implement Story 3.2 following the task-by-task activation guidance above)
