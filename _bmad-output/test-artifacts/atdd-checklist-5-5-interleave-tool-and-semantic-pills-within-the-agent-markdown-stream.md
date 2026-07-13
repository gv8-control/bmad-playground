---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-13'
storyId: '5.5'
storyKey: 5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream
storyFile: _bmad-output/implementation-artifacts/5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream.md
generatedTestFiles:
  - apps/web/src/components/conversation/ConversationPane.test.tsx
  - apps/web/src/components/conversation/AgentMessage.test.tsx
  - apps/web/src/components/conversation/ChatMessageList.test.tsx
  - apps/agent-be/src/streaming/agent.service.unit.spec.ts
  - apps/agent-be/src/streaming/agent.service.spec.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream.md
  - _bmad-output/project-context.md
  - _bmad-output/decision-policy.md
---

# ATDD Checklist — Story 5.5: Interleave Tool and Semantic Pills Within the Agent Markdown Stream

**Date:** 2026-07-13
**Author:** Marius
**Primary Test Level:** Component (Jest + RTL) + Unit (Jest)

---

## Story Summary

Tool calls and recognized actions must appear inline within the agent's response at the exact position they occurred, not as disconnected events above or below the message. This requires changing the `ChatMessage` data model, SSE event handlers, the agent message rendering pipeline, and the `Turn` persistence format.

**As a** user watching the Agent work
**I want** tool calls and recognized actions to appear inline within the agent's response at the exact position they occurred
**So that** I can follow the Agent's reasoning and actions as a single continuous narrative

---

## Acceptance Criteria

1. **AC-1:** Tool call indicator renders inline at stream position (not standalone row)
2. **AC-2:** Tool call result replaces indicator in place (no layout shift)
3. **AC-3:** Semantic Pill promoted in place (same stream position)
4. **AC-4:** Error-state Tool Pill renders inline (not standalone row)
5. **AC-5:** Access Notice renders inline below error Tool Pill
6. **AC-6:** Manual save Semantic Pill renders inline at stream position
7. **AC-7:** ChatMessage data model supports interleaved tool calls (segments array)
8. **AC-8:** SSE event handlers insert into streaming agent message (not flat array)
9. **AC-9:** Resume restores tool pills at original positions (segments persisted)
10. **AC-10:** AgentMessage renders interleaved pills at correct positions

---

## Story Integration Metadata

- **Story ID:** `5.5`
- **Story Key:** `5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream`
- **Story File:** `_bmad-output/implementation-artifacts/5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream.md`
- **Generated Test Files:**
  - `apps/web/src/components/conversation/ConversationPane.test.tsx` (added describe block)
  - `apps/web/src/components/conversation/AgentMessage.test.tsx` (added describe block)
  - `apps/web/src/components/conversation/ChatMessageList.test.tsx` (added describe block)
  - `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (added describe block)
  - `apps/agent-be/src/streaming/agent.service.spec.ts` (added describe block)

---

## Red-Phase Test Scaffolds Created

### Component Tests (18 tests, all skipped)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx` (Story 5.5 describe block)

- **Test:** `[P0] TOOL_CALL_START inserts tool_call segment into streaming agent message (not new messages entry)`
  - **Status:** RED — current code pushes new entry to messages array, not segment into agent message
  - **Verifies:** AC-1, AC-8

- **Test:** `[P0] tool_call segment renders inline within agent markdown (not standalone row)`
  - **Status:** RED — current code renders tool calls as standalone rows via ChatMessageList
  - **Verifies:** AC-1

- **Test:** `[P0] TOOL_CALL_RESULT updates tool_call segment in place (no new entry created)`
  - **Status:** RED — current code updates flat entry, not segment within agent message
  - **Verifies:** AC-2

- **Test:** `[P0] TOOL_CALL_PROMOTED updates tool_call segment semantic field in place`
  - **Status:** RED — current code updates flat entry, not segment within agent message
  - **Verifies:** AC-3

- **Test:** `[P0] failed tool result renders error-state Tool Pill inline as segment`
  - **Status:** RED — current code renders error pill as standalone row
  - **Verifies:** AC-4

- **Test:** `[P0] ACCESS_DENIED updates tool_call segment accessNotice within agent message`
  - **Status:** RED — current code updates flat entry, not segment within agent message
  - **Verifies:** AC-5

- **Test:** `[P0] MANUAL_SAVE_SUCCEEDED inserts tool_call segment with semantic into last agent message`
  - **Status:** RED — current code pushes new entry to messages array
  - **Verifies:** AC-6

- **Test:** `[P0] MANUAL_SAVE_FAILED inserts error-state tool_call segment into last agent message`
  - **Status:** RED — current code pushes new entry to messages array
  - **Verifies:** AC-6

- **Test:** `[P0] TEXT_MESSAGE_START initializes segments array on streaming agent message`
  - **Status:** RED — current code does not initialize segments
  - **Verifies:** AC-8

- **Test:** `[P0] TOOL_CALL_ARGS updates tool_call segment input within agent message segments`
  - **Status:** RED — current code updates flat entry, not segment
  - **Verifies:** AC-8

- **Test:** `[P0] CREDENTIAL_FAILURE updates tool_call segment within agent message segments`
  - **Status:** RED — current code updates flat entry, not segment
  - **Verifies:** AC-5, AC-8

- **Test:** `[P0] duplicate TOOL_CALL_START on replay updates existing segment (no duplicate)`
  - **Status:** RED — current code has dedup on flat array, not on segments
  - **Verifies:** AC-1, AC-8 (replay dedup)

- **Test:** `[P0] tool call before any text creates agent message with empty text segment + tool_call segment`
  - **Status:** RED — current code creates standalone tool-call entry
  - **Verifies:** AC-1, AC-8

- **Test:** `[P1] multiple tool calls each render as separate segments within same agent message`
  - **Status:** RED — current code creates separate flat entries
  - **Verifies:** AC-1

- **Test:** `[P0] initialMessages with segments render pills at correct positions within agent message`
  - **Status:** RED — current code does not support segments in initialMessages
  - **Verifies:** AC-9

- **Test:** `[P0] initialMessages without segments fall back to content-only rendering (legacy)`
  - **Status:** RED — current code does not have segments fallback logic
  - **Verifies:** AC-9 (backward compatibility)

**File:** `apps/web/src/components/conversation/AgentMessage.test.tsx` (Story 5.5 describe block)

- **Test:** `[P0] renders text segments as markdown and tool_call segments as ToolPill`
  - **Status:** RED — AgentMessage does not render segments yet
  - **Verifies:** AC-10

- **Test:** `[P0] renders segments in order: text, tool_call, text`
  - **Status:** RED — AgentMessage does not render segments yet
  - **Verifies:** AC-10

- **Test:** `[P0] falls back to content when segments is absent (legacy messages)`
  - **Status:** RED — AgentMessage does not have segments fallback yet
  - **Verifies:** AC-10 (backward compatibility)

- **Test:** `[P0] streaming cursor appears after last segment when isStreaming`
  - **Status:** RED — AgentMessage cursor is after markdown content, not after last segment
  - **Verifies:** AC-10

- **Test:** `[P0] renders SemanticPill when tool_call segment has semantic field`
  - **Status:** RED — AgentMessage does not render segments yet
  - **Verifies:** AC-3, AC-10

- **Test:** `[P0] renders AccessNotice when tool_call segment has accessNotice field`
  - **Status:** RED — AgentMessage does not render segments yet
  - **Verifies:** AC-5, AC-10

**File:** `apps/web/src/components/conversation/ChatMessageList.test.tsx` (Story 5.5 describe block)

- **Test:** `[P0] assistant message with segments renders pills inline (not standalone rows)`
  - **Status:** RED — ChatMessageList still has standalone tool-call rendering branch
  - **Verifies:** AC-1, AC-10

- **Test:** `[P0] does not render standalone ToolPill branch for messages with segments`
  - **Status:** RED — ChatMessageList still has standalone tool-call rendering branch
  - **Verifies:** AC-1

- **Test:** `[P0] legacy assistant message without segments still renders via AgentMessage`
  - **Status:** RED — ChatMessageList routes tool-call messages to standalone branch, not AgentMessage
  - **Verifies:** AC-10 (backward compatibility)

### Unit Tests (4 tests, all skipped)

**File:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (Story 5.5 describe block)

- **Test:** `[P0] persists segments alongside content in Turn row`
  - **Status:** RED — backend does not build or persist segments yet
  - **Verifies:** AC-9

- **Test:** `[P0] segments array contains text and tool_call segments in order`
  - **Status:** RED — backend does not build segments yet
  - **Verifies:** AC-9

- **Test:** `[P0] tool_call segment captures toolCallId, toolName, and status`
  - **Status:** RED — backend does not build segments yet
  - **Verifies:** AC-9

**File:** `apps/agent-be/src/streaming/agent.service.spec.ts` (Story 5.5 describe block)

- **Test:** `[P0] persists segments alongside content in Turn row`
  - **Status:** RED — AgentServiceFake does not build or persist segments yet
  - **Verifies:** AC-9

---

## E2E Coverage Deferral Check

**Decision (DP-3):** E2E tests are deferred for Story 5.5. All ACs are covered by component-level tests using `MockEventSource`, which is a browser-level mock that simulates SSE events at the JavaScript runtime level.

**Verification:** The `MockEventSource` class in `ConversationPane.test.tsx` simulates the full SSE event lifecycle:
- `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT`, `TOOL_CALL_PROMOTED`
- `CREDENTIAL_FAILURE`, `ACCESS_DENIED`
- `MANUAL_SAVE_SUCCEEDED`, `MANUAL_SAVE_FAILED`
- `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`
- Replay (emit same event twice to test dedup)

This mock covers all ACs (AC-1 through AC-10) because the behavior under test is how the frontend processes SSE events and renders the result — not browser-specific integration concerns. E2E tests would add no additional coverage beyond what the component tests already verify.

**Recorded:** 2026-07-13. No browser-level mock gap found — deferral is justified.

---

## External Command Regression Guards

**Not applicable to Story 5.5.** This story does not involve code that executes external commands with user-controlled input. The backend changes in `agent.service.ts` process SDK messages (text deltas, tool_use blocks) — they do not execute shell commands. The `SandboxService` handles shell commands but is explicitly out of scope (Story 5.5 scope boundary: "Do NOT change the SSE event emission logic, the SSE event contract, or `tool-pill-classifier.service.ts`").

---

## Data Factories Created

No new data factories created. Tests use inline `ChatMessage` fixtures with `segments` arrays, following the existing pattern in `ConversationPane.test.tsx` and `AgentMessage.test.tsx` of constructing message objects directly in the test.

---

## Fixtures Created

No new fixtures created. Tests reuse the existing `MockEventSource` pattern from `ConversationPane.test.tsx` and the existing SDK message builder functions (`makeTextBlockStart`, `makeToolUseBlockStart`, `makeTextDeltaEvent`, `makeContentBlockStop`, `makeToolResultUserMessage`, `makeResultMessage`) from `agent.service.unit.spec.ts`.

---

## Mock Requirements

No new mock requirements. Tests use existing mocks:
- `MockEventSource` (browser-level SSE mock)
- `react-markdown` mock (renders `<div data-testid="markdown">{children}</div>`)
- `remark-gfm` mock
- `@anthropic-ai/claude-agent-sdk` mock (via `jest.doMock` + `createMockQuery`)

---

## Required data-testid Attributes

No new data-testid attributes required. Tests use existing DOM queries:
- `.group.mb-6` (agent message container) — already rendered by `AgentMessage.tsx`
- `data-testid="markdown"` — already rendered by mocked `react-markdown`
- `data-testid="chat-message-list"` — already rendered by `ChatMessageList.tsx`

---

## Implementation Checklist

### Test: ConversationPane — Story 5.5 describe block

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 1: Update `ChatMessage` data model — add `MessageSegment` type and `segments?: MessageSegment[]` to `ChatMessage` (AC: 7)
- [ ] Task 4: Update SSE event handlers in `ConversationPane.tsx` — insert/update segments within streaming agent message instead of flat array (AC: 1, 2, 4, 5, 6, 8)
- [ ] Task 5: Update `AgentMessage.tsx` rendering — render segments in order (AC: 1, 2, 3, 4, 5, 10)
- [ ] Task 6: Update `ChatMessageList.tsx` — remove standalone tool-call rendering branch (AC: 1, 2, 3, 4, 5)
- [ ] Task 7: Update resume path to restore segments (AC: 9)
- [ ] Remove `it.skip()` from the Story 5.5 tests for the current task
- [ ] Run tests: `yarn nx test web --testPathPattern="ConversationPane"`
- [ ] Confirm tests fail first (RED), then pass after implementation (GREEN)

### Test: AgentMessage — Story 5.5 describe block

**File:** `apps/web/src/components/conversation/AgentMessage.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 1: Add `MessageSegment` type to shared types (AC: 7)
- [ ] Task 5: Update `AgentMessage.tsx` — render segments in order, fallback to content (AC: 10)
- [ ] Remove `it.skip()` from the Story 5.5 tests
- [ ] Run tests: `yarn nx test web --testPathPattern="AgentMessage"`
- [ ] Confirm tests fail first (RED), then pass after implementation (GREEN)

### Test: ChatMessageList — Story 5.5 describe block

**File:** `apps/web/src/components/conversation/ChatMessageList.test.tsx`

**Tasks to make these tests pass:**

- [ ] Task 6: Update `ChatMessageList.tsx` — remove standalone tool-call rendering branch (AC: 1, 2, 3, 4, 5)
- [ ] Remove `it.skip()` from the Story 5.5 tests
- [ ] Run tests: `yarn nx test web --testPathPattern="ChatMessageList"`
- [ ] Confirm tests fail first (RED), then pass after implementation (GREEN)

### Test: agent.service.unit.spec — Story 5.5 describe block

**File:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts`

**Tasks to make these tests pass:**

- [ ] Task 3: Update backend persistence in `agent.service.ts` — build segments array alongside accumulatedText (AC: 9)
- [ ] Remove `it.skip()` from the Story 5.5 tests
- [ ] Run tests: `yarn nx test agent-be --testPathPattern="agent.service.unit"`
- [ ] Confirm tests fail first (RED), then pass after implementation (GREEN)

### Test: agent.service.spec — Story 5.5 describe block

**File:** `apps/agent-be/src/streaming/agent.service.spec.ts`

**Tasks to make these tests pass:**

- [ ] Task 3.7: Update `AgentServiceFake` — build segments array alongside accumulatedText (AC: 9)
- [ ] Remove `it.skip()` from the Story 5.5 tests
- [ ] Run tests: `yarn nx test agent-be --testPathPattern="agent.service.spec"`
- [ ] Confirm tests fail first (RED), then pass after implementation (GREEN)

---

## Running Tests

```bash
# Run all web component tests (includes skipped Story 5.5 scaffolds)
yarn nx test web --testPathPattern="ConversationPane|AgentMessage|ChatMessageList"

# Run all agent-be tests (includes skipped Story 5.5 scaffolds)
yarn nx test agent-be --testPathPattern="agent.service"

# Run specific test file
yarn nx test web --testPathPattern="ConversationPane.test"

# Run tests with verbose output (shows skipped tests)
yarn nx test web --testPathPattern="ConversationPane" --verbose

# Run all project tests after implementation
yarn nx run-many -t test
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

- All tests written as red-phase scaffolds with `it.skip()`
- Tests assert expected behavior (not placeholders)
- Tests will fail when activated because the segments data model, SSE handler changes, and rendering pipeline do not exist yet
- Activation guidance: remove `it.skip()` for the current task, confirm RED, then implement

### GREEN Phase (DEV Team — Next Steps)

1. Pick one scaffolded test group (start with Task 1: data model)
2. Remove `it.skip()` for that group's tests
3. Confirm tests fail (RED)
4. Implement minimal code to make tests pass
5. Run tests to verify GREEN
6. Move to next task group and repeat

### REFACTOR Phase (After All Tests Pass)

1. Verify all tests pass
2. Review code for quality
3. Run `yarn nx lint web` and `yarn nx lint agent-be`
4. Run `yarn nx typecheck web` and `yarn nx typecheck agent-be`
5. Run `yarn nx build web` and `yarn nx build agent-be`

---

## Notes

- **Existing tests:** The existing Story 3.4 tool pill lifecycle tests in `ConversationPane.test.tsx` (lines 730-948) assert pills as entries in the `messages` array. These tests will need to be rewritten during implementation (Task 8.1 in the story) to assert inline positioning within agent message segments instead. The new Story 5.5 tests are additive — they don't modify existing tests.
- **AgentServiceFake:** The fake must be updated (Task 3.7) to build segments alongside `accumulatedText`, per the "test-seam fakes mimic production side effects" rule in `project-context.md` (line 137).
- **Decision policy applied:** DP-3 (simplest option) for E2E deferral — MockEventSource covers all ACs. DP-5 (scope temptation) — no deferred findings pulled in.
- **Story file tasks amended:** Tasks 8.1-8.7 have been amended to instruct activation of existing scaffolding rather than creating new scaffolding.

---

**Generated by BMad TEA Agent** — 2026-07-13
