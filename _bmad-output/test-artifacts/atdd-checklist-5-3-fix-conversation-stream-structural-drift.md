---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-12'
storyId: '5.3'
storyKey: '5-3-fix-conversation-stream-structural-drift'
storyFile: '_bmad-output/implementation-artifacts/5-3-fix-conversation-stream-structural-drift.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-5-3-fix-conversation-stream-structural-drift.md'
generatedTestFiles:
  - apps/web/src/components/conversation/ChatMessageList.test.tsx
  - apps/web/src/components/conversation/ChatInput.test.tsx
  - apps/web/src/components/conversation/ConversationPane.test.tsx
  - apps/web/src/components/conversation/AgentMessage.test.tsx
  - apps/web/src/components/conversation/UserMessage.test.tsx
  - apps/web/src/components/conversation/ScrollToBottomButton.test.tsx
  - apps/web/src/components/conversation/SemanticPill.test.tsx
  - apps/web/src/components/conversation/SlashCommandPicker.test.tsx
  - apps/web/src/components/conversation/useDraftPersistence.test.ts
  - apps/web/src/app/(dashboard)/(app)/conversations/new/page.test.tsx
inputDocuments:
  - '_bmad-output/implementation-artifacts/5-3-fix-conversation-stream-structural-drift.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/decision-policy.md'
  - '_bmad/tea/config.yaml'
---

# ATDD Checklist — Story 5.3: Fix Conversation Stream Structural Drift

**Date:** 2026-07-12
**Author:** Marius
**Primary Test Level:** Component

---

## Story Summary

As a user in a conversation, I want the chat interface to match the design, so that messages, tool calls, and input feel integrated and readable.

**As a** user in a conversation
**I want** the chat interface to match the design
**So that** messages, tool calls, and input feel integrated and readable

---

## Acceptance Criteria

1. AC-1: 824px column centering for messages and chat input
2. AC-2: Rich new-conversation empty-state (icon, title, kbd)
3. AC-3: SessionStartSpinner centered in chat-messages panel
4. AC-4: Disabled Send button uses muted-surface style
5. AC-5: Conversation micro-drift — copy and spacing (placeholders, gap, padding, color, opacity)
6. AC-6: New-conversation page header removal (visually-hidden h1 remains)
7. AC-7: Accessibility and focus fixes (role="log", link focus ring, localStorage key)
8. AC-8: Send button arrow icon and font-medium
9. AC-9: Slash picker "Skills — type to filter" header
10. AC-10: Conversation limit copy "limit of 10 active conversations"
11. AC-11: Retry button text color uses accent-fg

---

## Story Integration Metadata

- **Story ID:** `5.3`
- **Story Key:** `5-3-fix-conversation-stream-structural-drift`
- **Story File:** `_bmad-output/implementation-artifacts/5-3-fix-conversation-stream-structural-drift.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-5-3-fix-conversation-stream-structural-drift.md`
- **Generated Test Files:** 10 files (8 updated, 2 created)

---

## Red-Phase Test Scaffolds Created

### Component Tests (41 skipped tests across 10 files)

**File:** `apps/web/src/components/conversation/ChatMessageList.test.tsx` (updated)
- `it.skip` — messages container has `max-w-[824px] mx-auto w-full` for column centering (AC-1)
- `it.skip` — renders ✦ icon character in empty state (AC-2)
- `it.skip` — renders "Start a new conversation" title in empty state (AC-2)
- `it.skip` — renders `<kbd>` element showing "/" in empty state (AC-2)
- `it.skip` — does not render the old simplified placeholder text (AC-2)
- `it.skip` — chat-messages container has `role="log"` (AC-7)

**File:** `apps/web/src/components/conversation/ChatInput.test.tsx` (updated)
- `it.skip` — disabled Send button does not use opacity-50 (AC-4)
- `it.skip` — disabled Send button uses bg-surface-raised for muted surface (AC-4)
- `it.skip` — disabled Send button uses text-text-3 for muted text (AC-4)
- `it.skip` — disabled Send button uses border border-border for muted border (AC-4)
- `it.skip` — default placeholder is "Message..." not "Type a message..." (AC-5)
- `it.skip` — does not use "Type a message..." as placeholder (AC-5)
- `it.skip` — Send button text uses font-medium (AC-8)
- `it.skip` — Send button has gap-1.5 between text and icon (AC-8)
- `it.skip` — Send button displays an upward arrow (↑) character (AC-8)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx` (updated)
- `it.skip` — SessionStartSpinner renders inside the chat-messages panel, not the input area (AC-3)
- `it.skip` — SessionStartSpinner does not render in the input area (AC-3)
- `it.skip` — limit-reached message includes "limit of 10 active conversations" (AC-10)
- `it.skip` — limit-reached fallback message includes "limit of 10 active conversations" (AC-10)
- `it.skip` — Retry button uses text-accent-fg (not text-bg) (AC-11)

**File:** `apps/web/src/components/conversation/AgentMessage.test.tsx` (updated)
- `it.skip` — agent message container uses mb-6 (24px gap), not mb-4 (AC-5)
- `it.skip` — markdown link component includes focus ring classes (AC-7)

**File:** `apps/web/src/components/conversation/UserMessage.test.tsx` (updated)
- `it.skip` — user message container uses mb-6 (24px gap), not mb-4 (AC-5)
- `it.skip` — user bubble uses py-3 (12px padding), not py-2 (AC-5)

**File:** `apps/web/src/components/conversation/ScrollToBottomButton.test.tsx` (created)
- `it.skip` — button uses text-text-2, not text-text-1 (AC-5)
- `it.skip` — button with new messages count uses text-text-2 (AC-5)

**File:** `apps/web/src/components/conversation/SemanticPill.test.tsx` (updated)
- `it.skip` — separator span uses 0.4 alpha (opacity-40) (AC-5)
- `it.skip` — separator does not use full opacity (no opacity-100) (AC-5)

**File:** `apps/web/src/components/conversation/SlashCommandPicker.test.tsx` (updated)
- `it.skip` — renders "Skills — type to filter" header at the top of the picker (AC-9)
- `it.skip` — header renders before the skills list (AC-9)

**File:** `apps/web/src/components/conversation/useDraftPersistence.test.ts` (updated)
- `it.skip` — existing test renamed: uses "new-conversation" key (not "new-conversation-draft") (AC-7)
- `it.skip` — uses "new-conversation" key when conversationId is null (AC-7)
- `it.skip` — does not use "new-conversation-draft" key when reading (AC-7)
- `it.skip` — writes to "new-conversation" key (not "new-conversation-draft") (AC-7)
- `it.skip` — clearDraft removes "new-conversation" key (not "new-conversation-draft") (AC-7)

**File:** `apps/web/src/app/(dashboard)/(app)/conversations/new/page.test.tsx` (created)
- `it.skip` — does not render a visible Breadcrumb (AC-6)
- `it.skip` — does not render a visible `<header>` element (AC-6)
- `it.skip` — does not render a visible h1 with "New Conversation" text (AC-6)
- `it.skip` — renders a visually-hidden h1 with tabIndex={-1} (AC-6)
- `it.skip` — visually-hidden h1 has sr-only class (AC-6)
- `it.skip` — visually-hidden h1 contains "New Conversation" text (AC-6)

---

## E2E Deferral Check

**Question:** Can a browser-level mock pattern simulate the scenario and cover the ACs?

**Browser-level mock patterns checked:**

1. **`page.evaluate()` with `getComputedStyle()`:** Could verify computed styles (e.g., `max-width: 824px`, `margin: 0 auto`, `color: rgb(...)`). However, className assertions in jsdom are more precise — they verify the Tailwind token directly, not the computed style. A computed style check would pass even if the wrong token is used (e.g., `text-text-1` and `text-text-2` might both resolve to similar RGB values depending on config). className assertions catch token-level drift.
2. **`page.locator().evaluate()` for DOM structure:** Could verify DOM hierarchy (e.g., SessionStartSpinner inside chat-messages panel vs input area). But component tests already verify this more reliably — no flakiness, no dev server required, deterministic.
3. **Playwright route interception:** Not relevant — no API calls in these ACs.
4. **Visual screenshot comparison:** Could verify visual layout, but the ACs specify CSS classes and DOM structure, not pixel-level appearance. The existing E2E suite already covers behavioral aspects (navigation, conversation creation, message sending).
5. **`page.locator('[role="log"]')` for ARIA:** Could verify `role="log"` exists, but component tests assert this more precisely and deterministically.

**Answer:** No browser-level mock pattern adds value beyond component/page tests for these ACs. All 11 ACs are verifiable via className assertions, text content checks, DOM structure verification, and localStorage key assertions — all of which are more precise and less flaky at the component/page level.

**Decision (DP-4: test-only changes):** E2E coverage deferred. All 11 ACs are purely structural assertions (CSS class presence, text content, DOM hierarchy, ARIA attributes, localStorage key) that component/page tests cover at the appropriate level. The existing E2E suite already covers behavioral aspects. Writing E2E tests for the same structural assertions would create duplicate coverage across levels, which Step 3 of the ATDD workflow explicitly says to avoid ("Avoid duplicate coverage across levels").

---

## Regression Guard Check

**Question:** Does the story involve code that executes external commands with user-controlled input?

**Answer:** NO — Story 5.3 is purely frontend visual structure (CSS classes, DOM hierarchy, text content, ARIA attributes, localStorage key). No external command execution, no user-controlled input passed to shell commands, no credential isolation concerns. The uniform guard template for credential-isolation and input-injection invariants is not applicable.

---

## Required data-testid Attributes

No new data-testid attributes required. All tests use existing `data-testid="chat-message-list"` or query by role/text content.

---

## Implementation Checklist

### Test: ChatMessageList — AC-1, AC-2, AC-7

**File:** `apps/web/src/components/conversation/ChatMessageList.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 1: Add `max-w-[824px] mx-auto w-full` to the messages scroll container (AC-1)
- [ ] Task 2: Replace simplified placeholder with rich empty-state (✦ icon, "Start a new conversation" title, `<kbd>/</kbd>`) (AC-2)
- [ ] Task 7.1: Add `role="log"` to the chat-messages container (AC-7)
- [ ] Remove `it.skip()` from 6 tests in "Story 5.3 structural drift" describe block
- [ ] Run test: `yarn nx test web -- --testPathPattern=ChatMessageList`
- [ ] All 6 tests pass (green phase)

### Test: ChatInput — AC-4, AC-5, AC-8

**File:** `apps/web/src/components/conversation/ChatInput.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 4: Replace `disabled:opacity-50` with `bg-surface-raised text-text-3 border border-border` on disabled Send button (AC-4)
- [ ] Task 5.1: Change default placeholder from "Type a message..." to "Message..." (AC-5)
- [ ] Task 8: Add ↑ arrow icon with `gap-1.5` and `font-medium` to Send button (AC-8)
- [ ] Remove `it.skip()` from 9 tests in "Story 5.3 structural drift" describe block
- [ ] Run test: `yarn nx test web -- --testPathPattern=ChatInput`
- [ ] All 9 tests pass (green phase)

### Test: ConversationPane — AC-3, AC-10, AC-11

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 3: Move SessionStartSpinner from input area to chat-messages panel (AC-3)
- [ ] Task 10: Change "limit of active conversations" to "limit of 10 active conversations" (AC-10)
- [ ] Task 11: Change `text-bg` to `text-accent-fg` on Retry button (AC-11)
- [ ] Remove `it.skip()` from 5 tests in "Story 5.3 — structural drift" describe block
- [ ] Run test: `yarn nx test web -- --testPathPattern=ConversationPane`
- [ ] All 5 tests pass (green phase)

### Test: AgentMessage — AC-5, AC-7

**File:** `apps/web/src/components/conversation/AgentMessage.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 5.2: Change `mb-4` to `mb-6` on agent message container (AC-5)
- [ ] Task 7.2: Add focus ring classes to markdown `a` component (AC-7)
- [ ] Remove `it.skip()` from 2 tests in "Story 5.3 structural drift" describe block
- [ ] Run test: `yarn nx test web -- --testPathPattern=AgentMessage`
- [ ] All 2 tests pass (green phase)

### Test: UserMessage — AC-5

**File:** `apps/web/src/components/conversation/UserMessage.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 5.3: Change `mb-4` to `mb-6` on user message container (AC-5)
- [ ] Task 5.4: Change `py-2` to `py-3` on user bubble (AC-5)
- [ ] Remove `it.skip()` from 2 tests in "Story 5.3 structural drift" describe block
- [ ] Run test: `yarn nx test web -- --testPathPattern=UserMessage`
- [ ] All 2 tests pass (green phase)

### Test: ScrollToBottomButton — AC-5

**File:** `apps/web/src/components/conversation/ScrollToBottomButton.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 5.5: Change `text-text-1` to `text-text-2` on ScrollToBottomButton (AC-5)
- [ ] Remove `it.skip()` from 2 tests
- [ ] Run test: `yarn nx test web -- --testPathPattern=ScrollToBottomButton`
- [ ] All 2 tests pass (green phase)

### Test: SemanticPill — AC-5

**File:** `apps/web/src/components/conversation/SemanticPill.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 5.6: Add `opacity-40` to separator spans (AC-5)
- [ ] Remove `it.skip()` from 2 tests in "Story 5.3 structural drift" describe block
- [ ] Run test: `yarn nx test web -- --testPathPattern=SemanticPill`
- [ ] All 2 tests pass (green phase)

### Test: SlashCommandPicker — AC-9

**File:** `apps/web/src/components/conversation/SlashCommandPicker.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 9: Add "Skills — type to filter" header at the top of the picker (AC-9)
- [ ] Remove `it.skip()` from 2 tests in "Story 5.3 structural drift" describe block
- [ ] Run test: `yarn nx test web -- --testPathPattern=SlashCommandPicker`
- [ ] All 2 tests pass (green phase)

### Test: useDraftPersistence — AC-7

**File:** `apps/web/src/components/conversation/useDraftPersistence.test.ts`

**Tasks to make these tests pass:**

- [ ] Task 7.3: Change localStorage key from `new-conversation-draft` to `new-conversation` in all 3 occurrences (AC-7)
- [ ] Remove `it.skip()` from 1 existing test (renamed) + 4 new tests in "Story 5.3 structural drift" describe block
- [ ] Run test: `yarn nx test web -- --testPathPattern=useDraftPersistence`
- [ ] All 5 tests pass (green phase)

### Test: NewConversationPage — AC-6

**File:** `apps/web/src/app/(dashboard)/(app)/conversations/new/page.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 6: Remove visible `<header>` element; replace with visually-hidden `<h1 tabIndex={-1} className="sr-only">New Conversation</h1>` (AC-6)
- [ ] Remove `it.skip()` from 6 tests
- [ ] Run test: `yarn nx test web -- --testPathPattern="new/page"`
- [ ] All 6 tests pass (green phase)

---

## Running Tests

```bash
# Run all tests for this story (including skipped scaffolds)
yarn nx test web

# Run specific test file
yarn nx test web -- --testPathPattern=ChatMessageList
yarn nx test web -- --testPathPattern=ChatInput
yarn nx test web -- --testPathPattern=ConversationPane
yarn nx test web -- --testPathPattern=AgentMessage
yarn nx test web -- --testPathPattern=UserMessage
yarn nx test web -- --testPathPattern=ScrollToBottomButton
yarn nx test web -- --testPathPattern=SemanticPill
yarn nx test web -- --testPathPattern=SlashCommandPicker
yarn nx test web -- --testPathPattern=useDraftPersistence
yarn nx test web -- --testPathPattern="new/page"
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

- All 41 tests written as red-phase scaffolds with `it.skip()`
- 1 existing test updated to expect new behavior and skipped (useDraftPersistence `new-conversation` key)
- 2 new test files created (ScrollToBottomButton.test.tsx, conversations/new/page.test.tsx)
- 8 existing test files updated with new "Story 5.3 structural drift" describe blocks
- Story Task 12 amended from "Write/update" to "Activate" to reflect scaffolding already applied

### GREEN Phase (DEV Team — Next Steps)

1. **Pick one scaffolded test** from the implementation checklist (start with highest priority)
2. **Remove `it.skip()`** for that test and confirm it fails first
3. **Read the test** to understand expected behavior
4. **Implement minimal code** to make that specific test pass
5. **Run the test** to verify it now passes (green)
6. **Check off the task** in implementation checklist
7. **Move to next test** and repeat

### REFACTOR Phase (DEV Team — After All Tests Pass)

1. Verify all tests pass
2. Review code for quality
3. Ensure tests still pass after each refactor

---

## Test Execution Evidence

### Initial Scaffold Review / RED Verification

**Command:** `yarn nx test web -- --testPathPattern="conversation/(ChatMessageList|ChatInput|AgentMessage|UserMessage|ScrollToBottomButton|SemanticPill|SlashCommandPicker|useDraftPersistence|ConversationPane)\.test"`

**Results:**
- Test Suites: 2 skipped, 62 passed, 62 of 64 total
- Tests: 41 skipped, 781 passed, 822 total
- Status: Red-phase scaffolds verified (all 41 scaffolds properly skipped)

**Lint:** 1 pre-existing error (MockEventSource.close empty method), 35 warnings (1 new from scaffolds — acceptable). No new errors introduced.

**Typecheck:** 1 pre-existing error (AgentMessage.tsx:18 — noted in story's "What NOT to Change"). No new errors introduced.

---

## Notes

- The existing `useDraftPersistence.test.ts` test at line 39 was updated to expect the new `new-conversation` key (renamed from `new-conversation-draft`) and skipped. This is a red-phase scaffold — it will fail when activated until the implementation changes the key in all 3 occurrences.
- The `ConversationPane.test.tsx` Story 5.3 tests are placed INSIDE the main `describe('ConversationPane', ...)` block to inherit the `beforeEach`/`afterEach` setup (MockEventSource, global.fetch mock, localStorage mock).
- The `conversations/new/page.test.tsx` uses `@jest-environment node` and `renderToStaticMarkup` following the canonical Server Component page test pattern (see `project-context.md` — Server Component page tests).
- Story Task 12 was amended from "Write/update co-located tests" to "Activate co-located red-phase test scaffolds" — the scaffolding has already been applied by ATDD, so the dev's task is to remove `it.skip()` and implement the code to make the tests pass, not to write the tests.

---

## Knowledge Base References Applied

- **component-tdd.md** — Component test strategies, co-located test patterns
- **test-quality.md** — Test design principles (Given-When-Then, one assertion per test, determinism, isolation)
- **test-healing-patterns.md** — Red-phase scaffold patterns with `it.skip()`

---

**Generated by BMad TEA Agent** — 2026-07-12
