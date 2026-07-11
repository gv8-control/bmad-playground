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
storyId: '3.4'
storyKey: 3-4-see-tool-calls-and-recognized-actions-inline
storyFile: _bmad-output/implementation-artifacts/3-4-see-tool-calls-and-recognized-actions-inline.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-3-4-see-tool-calls-and-recognized-actions-inline.md
generatedTestFiles:
  - apps/web/src/components/conversation/ToolPill.test.tsx
  - apps/web/src/components/conversation/SemanticPill.test.tsx
  - apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts
  - apps/agent-be/src/streaming/agent.service.unit.spec.ts
  - apps/agent-be/src/streaming/streaming.controller.spec.ts
  - apps/web/src/components/conversation/ConversationPane.test.tsx
  - apps/web/src/components/conversation/ChatComponents.test.tsx
inputDocuments:
  - _bmad-output/implementation-artifacts/3-4-see-tool-calls-and-recognized-actions-inline.md
  - _bmad-output/project-context.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/component-tdd.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/data-factories.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-levels-framework.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-priorities-matrix.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/selector-resilience.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/timing-debugging.md
---

# ATDD Checklist — Story 3.4: See Tool Calls and Recognized Actions Inline

**TDD Phase:** RED (test scaffolds to be generated, will fail until implementation)
**Stack:** fullstack (Next.js + NestJS) — this story spans both backend and frontend
**Generated:** 2026-07-04
**Execution Mode:** SEQUENTIAL

---

## Step 1 Output: Preflight & Context

### Stack Detection
- Config `test_stack_type`: auto
- Auto-detected: `fullstack` (package.json with Next.js/React + NestJS; both `playwright.config.ts` and `jest.config.ts` present)
- Story scope: fullstack (agent-be streaming service/controller + web conversation components)

### Prerequisites
- Story 3.4 approved, status `ready-for-dev`, 5 clear ACs
- Jest configured: jsdom for component tests, `@jest-environment node` for pure function/backend tests
  - `apps/web/jest.config.ts` — `transformIgnorePatterns: ['node_modules/(?!jose|@ag-ui|@anthropic-ai)']`
  - `apps/agent-be/jest.config.ts` + `jest-integration.config.ts`
- Playwright configured: `playwright.config.ts` (auth setup + chromium projects, 4 shards)
- Dev environment available
- All dependencies already installed by Story 3.3 (`@ag-ui/core`, `@anthropic-ai/claude-agent-sdk`, `react-markdown`, `jose`)

### Story Context
- **Story file:** `_bmad-output/implementation-artifacts/3-4-see-tool-calls-and-recognized-actions-inline.md`
- **Story key:** `3-4-see-tool-calls-and-recognized-actions-inline`
- **Story ID:** `3.4`
- **Acceptance Criteria:**
  - AC-1: Tool Pill with in-place label replacement (FR12, UX-DR5, UX-DR18) — running label → completed pill, expand/collapse
  - AC-2: Semantic Pill for confirmed git commit (FR12, UX-DR6) — "Progress saved" + artifact type/title + View link
  - AC-3: Error-state Tool Pill on failed git commit (FR12, FR14)
  - AC-4: Error-state Tool Pill on any failed tool call (FR12)
  - AC-5: Circuit breaker terminates stalled/crashed agent + SSE heartbeat (architecture Cross-Cutting Concern 3)

### Framework & Existing Patterns
- Jest with jsdom (default) for client component tests
- `@jest-environment node` for backend unit tests with no DOM needs
- Co-located tests (`*.spec.ts` / `*.test.tsx` next to source)
- P0/P1 priority tags in `it()` descriptions
- Mock patterns: `jest.mock` at top, `jest.clearAllMocks` in `beforeEach`, `jest.restoreAllMocks` in `afterEach`
- Test header comments citing story, ACs, red-phase status
- `buildTestModule()` for agent-be tests (pre-wires `SandboxServiceFake`, supports array-form overrides)
- `MockEventSource` class pattern for SSE testing in ConversationPane (static `emit(eventType, data)`)
- `jest.mock('next/navigation', ...)` for `useRouter` mock
- `jest.mock('react-markdown', () => ({ __esModule: true, default: ... }))` for ESM default-export mock
- `jest.useFakeTimers()` + `jest.advanceTimersByTime()` for timer-dependent tests (circuit breaker, heartbeat, back-pressure)
- `userEvent.type()` over `fireEvent.change` for React 19 text inputs
- `Object.defineProperty` to mock layout properties in jsdom (`scrollHeight`, etc.)
- `__mocks__/claude-agent-sdk.ts` manual mock throws on call — real SDK never loaded in tests
- `AgentServiceFake` mimics production side effects (Turn persistence, `terminateProcess` calls, SSE event emission)

### TEA Config Flags
- `tea_use_playwright_utils`: true
- `tea_use_pactjs_utils`: false
- `tea_pact_mcp`: none
- `tea_browser_automation`: auto
- `test_stack_type`: auto

### Knowledge Fragments Loaded
- `data-factories.md` (core) — Factory functions with overrides, API-first setup
- `component-tdd.md` (extended) — Red-Green-Refactor cycle, provider isolation, accessibility assertions
- `test-quality.md` (core) — Deterministic, isolated, explicit, focused, fast tests
- `test-healing-patterns.md` (core) — Common failure patterns and fixes
- `test-levels-framework.md` (core) — Unit vs integration vs E2E selection
- `test-priorities-matrix.md` (core) — P0-P3 priority assignment
- `selector-resilience.md` (extended) — Robust selector strategies (frontend/fullstack)
- `timing-debugging.md` (extended) — Race condition identification and deterministic waits (frontend/fullstack)

### Existing Test Files (to be extended)
- `apps/agent-be/src/streaming/agent.service.spec.ts` — Story 3.3 delivered this; tests via `ConversationsService` integration with `AgentServiceFake`. Story 3.4 adds a new describe block (or separate `agent.service.unit.spec.ts`) for real `AgentService` with controllable SDK mock via `jest.doMock` — tool call lifecycle + circuit breaker tests
- `apps/agent-be/src/streaming/streaming.controller.spec.ts` — Story 3.3 delivered this with back-pressure tests. Story 3.4 adds heartbeat interval tests (fake timers, mock `res.write`)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — Story 3.1/3.2/3.3 delivered this. Story 3.4 adds tool pill, semantic pill, system message tests; extends `MockEventSource.emit` for new event types
- `apps/web/src/components/conversation/ChatComponents.test.tsx` — Story 3.3 delivered this. Story 3.4 removes `ToolExecutionIndicator` tests (component deleted, replaced by `ToolPill`)

### New Test Files (to be created)
- `apps/web/src/components/conversation/ToolPill.test.tsx` — component tests for the full Tool Pill (running/completed/error states, expand/collapse, keyboard a11y)
- `apps/web/src/components/conversation/SemanticPill.test.tsx` — component tests for the Semantic Pill ("Progress saved" + artifact type/title + View link)
- `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` — unit tests for `ToolPillClassifierService.classifyToolResult()` (git commit detection, artifact type derivation, Postgres lookup, degraded fallback)

### Stub Files (for TDD red phase compilation)
- `apps/web/src/components/conversation/ToolPill.tsx` — stub
- `apps/web/src/components/conversation/SemanticPill.tsx` — stub
- `apps/agent-be/src/streaming/tool-pill-classifier.service.ts` — stub
- Type extensions to `libs/shared-types/src/ag-ui.types.ts` (`TOOL_CALL_PROMOTED_EVENT`) and `apps/web/src/components/conversation/types.ts` (`ToolCallData`, `role: 'system'`) — minimal type additions for compilation

### Key Implementation Context (from story + project-context.md)
- **AG-UI event lifecycle:** `TOOL_CALL_START` (with `toolCallName`, NOT `toolName` — DP-2 fix) → `TOOL_CALL_ARGS` (streaming input) → `TOOL_CALL_END` → `TOOL_CALL_RESULT` (output) → optionally `TOOL_CALL_PROMOTED`
- **Circuit breaker:** 120s timer in `AgentService.runTurn`, resets on every emitted event, fires `RUN_ERROR` with "The agent stopped unexpectedly. Send a new message to try again." Configurable via `CIRCUIT_BREAKER_TIMEOUT_MS`
- **Heartbeat:** `StreamingController` writes `: heartbeat\n\n` comment frames every 15s. Cleared on close/complete/error
- **Classifier:** `ToolPillClassifierService` inspects `TOOL_CALL_RESULT` for `git commit` success, derives artifact type from path (lowercase `ArtifactType` values matching Postgres), looks up artifact in Postgres for ID/title/type. Regular NestJS provider (not Symbol-token test seam — DP-3)
- **System messages:** `role: 'system'` on `ChatMessage`, rendered as centered muted plain text (no markdown) — inline in `ChatMessageList`, not a separate component (DP-3)
- **`ToolExecutionIndicator` deleted** — fully superseded by `ToolPill`
- **ArtifactType values:** `'brainstorming' | 'prd' | 'architecture' | 'epics' | 'ux' | 'technical-research' | 'market-research' | 'domain-research' | 'product-brief' | 'prfaq' | 'test-arch' | 'other'`
- **Type-to-label mapping** (from `ArtifactCard.tsx`): `prd → 'PRD'`, `architecture → 'Architecture'`, `epics → 'Epics'`, etc. — deliberately duplicated per cross-service logic duplication rule
- **Path-to-type mapping** (from `artifacts.ts` `deriveArtifactType()`): `brainstorming/ → 'brainstorming'`, `planning-artifacts/prds/ → 'prd'`, `planning-artifacts/architecture/ → 'architecture'`, etc.

---

## Step 2 Output: Generation Mode

**Mode:** AI Generation

**Rationale:**
- Acceptance criteria are clear and well-specified (5 ACs with Given/When/Then)
- Scenarios are standard: component state rendering, service logic, SSE event handling, timer-based behavior
- Stack is fullstack with well-established Jest patterns (`MockEventSource`, `buildTestModule`, `AgentServiceFake`)
- No complex UI interactions requiring live browser recording (no drag/drop, wizards, or multi-step visual state)
- Backend logic (classifier, circuit breaker) is pure/unit-testable with mocks

---

## Step 3 Output: Test Strategy

### AC-1: Tool Pill with in-place label replacement

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 1.1 | Running state renders spinner + "Running… [toolName]" | Component | P0 | `ToolPill.test.tsx` |
| 1.2 | Completed state renders checkmark + tool name (no "completed" label) | Component | P0 | `ToolPill.test.tsx` |
| 1.3 | Error state renders negative border/text + "[toolName] failed" | Component | P0 | `ToolPill.test.tsx` |
| 1.4 | Click expands to show raw input/output in monospace `<pre>` | Component | P0 | `ToolPill.test.tsx` |
| 1.5 | Click again collapses (expanded view hidden) | Component | P0 | `ToolPill.test.tsx` |
| 1.6 | `aria-expanded` reflects expanded state | Component | P0 | `ToolPill.test.tsx` |
| 1.7 | Keyboard accessible: Enter/Space toggles | Component | P1 | `ToolPill.test.tsx` |
| 1.8 | `TOOL_CALL_START` creates running Tool Pill with tool name | Component integration | P0 | `ConversationPane.test.tsx` |
| 1.9 | `TOOL_CALL_ARGS` appends delta to tool input | Component integration | P0 | `ConversationPane.test.tsx` |
| 1.10 | `TOOL_CALL_END` marks tool status completed | Component integration | P0 | `ConversationPane.test.tsx` |
| 1.11 | `TOOL_CALL_RESULT` sets tool output | Component integration | P0 | `ConversationPane.test.tsx` |
| 1.12 | Multiple tool calls each render at their positions | Component integration | P1 | `ConversationPane.test.tsx` |

### AC-2: Semantic Pill for confirmed git commit

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 2.1 | Renders "Progress saved" label | Component | P0 | `SemanticPill.test.tsx` |
| 2.2 | Renders artifact type and title | Component | P0 | `SemanticPill.test.tsx` |
| 2.3 | Renders View link with correct href | Component | P0 | `SemanticPill.test.tsx` |
| 2.4 | Link has positive color and underline | Component | P0 | `SemanticPill.test.tsx` |
| 2.5 | `role="status"` for screen reader announcement | Component | P1 | `SemanticPill.test.tsx` |
| 2.6 | Classifier returns null for non-Bash tool | Unit | P0 | `tool-pill-classifier.service.spec.ts` |
| 2.7 | Classifier returns null for Bash without `git commit` in input | Unit | P0 | `tool-pill-classifier.service.spec.ts` |
| 2.8 | Classifier returns null for failed commit (error in output) | Unit | P0 | `tool-pill-classifier.service.spec.ts` |
| 2.9 | Classifier returns promoted event for successful commit touching `_bmad-output/` | Unit | P0 | `tool-pill-classifier.service.spec.ts` |
| 2.10 | Classifier derives correct lowercase `artifactType` from path | Unit | P0 | `tool-pill-classifier.service.spec.ts` |
| 2.11 | Classifier uses Postgres title/type when artifact found | Unit | P0 | `tool-pill-classifier.service.spec.ts` |
| 2.12 | Classifier returns `viewHref` with id when artifact in Postgres | Unit | P0 | `tool-pill-classifier.service.spec.ts` |
| 2.13 | Classifier returns `viewHref` without id when artifact not in Postgres | Unit | P0 | `tool-pill-classifier.service.spec.ts` |
| 2.14 | Classifier returns null for commit not touching `_bmad-output/` | Unit | P1 | `tool-pill-classifier.service.spec.ts` |
| 2.15 | Classifier logs warn on Postgres lookup failure | Unit | P1 | `tool-pill-classifier.service.spec.ts` |
| 2.16 | `TOOL_CALL_PROMOTED` promotes Tool Pill to Semantic Pill | Component integration | P0 | `ConversationPane.test.tsx` |

### AC-3: Error-state Tool Pill on failed git commit

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 3.1 | Classifier returns null for failed commit (covered by 2.8) | Unit | P0 | `tool-pill-classifier.service.spec.ts` |
| 3.2 | ToolPill renders error state with negative styling (covered by 1.3) | Component | P0 | `ToolPill.test.tsx` |

### AC-4: Error-state Tool Pill on any failed tool call

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 4.1 | `TOOL_CALL_RESULT` with error content sets status to 'error' | Component integration | P0 | `ConversationPane.test.tsx` |
| 4.2 | ToolPill error state displays errorMessage in expanded view | Component | P0 | `ToolPill.test.tsx` |

### AC-5: Circuit breaker terminates stalled/crashed agent + SSE heartbeat

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 5.1 | Circuit breaker fires after 120s timeout with no events | Unit | P0 | `agent.service.unit.spec.ts` |
| 5.2 | Circuit breaker resets on each emitted event | Unit | P0 | `agent.service.unit.spec.ts` |
| 5.3 | Circuit breaker emits `RUN_ERROR` with correct message | Unit | P0 | `agent.service.unit.spec.ts` |
| 5.4 | Circuit breaker calls `terminateProcess` | Unit | P0 | `agent.service.unit.spec.ts` |
| 5.5 | Circuit breaker timer cleared on `stop()` | Unit | P1 | `agent.service.unit.spec.ts` |
| 5.6 | Circuit breaker timer cleared on normal completion | Unit | P1 | `agent.service.unit.spec.ts` |
| 5.7 | Heartbeat writes `: heartbeat` comment on 15s interval | Unit | P0 | `streaming.controller.spec.ts` |
| 5.8 | Heartbeat cleared on connection close | Unit | P0 | `streaming.controller.spec.ts` |
| 5.9 | Heartbeat cleared on stream complete | Unit | P0 | `streaming.controller.spec.ts` |
| 5.10 | Heartbeat cleared on stream error | Unit | P1 | `streaming.controller.spec.ts` |
| 5.11 | Heartbeat write failure does not crash | Unit | P1 | `streaming.controller.spec.ts` |
| 5.12 | `RUN_ERROR` renders system message (not assistant message) | Component integration | P0 | `ConversationPane.test.tsx` |
| 5.13 | `STREAM_ERROR` renders system message (not assistant message) | Component integration | P0 | `ConversationPane.test.tsx` |

### AgentService tool call lifecycle (supports AC-1, AC-2, AC-4)

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| A.1 | Emits `TOOL_CALL_START` with `toolCallName` (not `toolName`) | Unit | P0 | `agent.service.unit.spec.ts` |
| A.2 | Emits `TOOL_CALL_ARGS` on `input_json_delta` | Unit | P0 | `agent.service.unit.spec.ts` |
| A.3 | Emits `TOOL_CALL_END` (not `TEXT_MESSAGE_END`) on `content_block_stop` for tool_use | Unit | P0 | `agent.service.unit.spec.ts` |
| A.4 | Emits `TOOL_CALL_RESULT` on tool result message | Unit | P0 | `agent.service.unit.spec.ts` |
| A.5 | Calls classifier on `TOOL_CALL_RESULT` | Unit | P0 | `agent.service.unit.spec.ts` |
| A.6 | Emits `TOOL_CALL_PROMOTED` when classifier returns event | Unit | P0 | `agent.service.unit.spec.ts` |

### ChatComponents.test.tsx modifications

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| C.1 | Remove `ToolExecutionIndicator` tests (component deleted) | N/A | N/A | `ChatComponents.test.tsx` |

### Red Phase Confirmation

All new test files will fail until implementation:
- `ToolPill.tsx` does not exist → `ToolPill.test.tsx` import fails
- `SemanticPill.tsx` does not exist → `SemanticPill.test.tsx` import fails
- `tool-pill-classifier.service.ts` does not exist → `tool-pill-classifier.service.spec.ts` import fails
- `AgentService` does not emit tool call lifecycle events / has no circuit breaker → `agent.service.unit.spec.ts` assertions fail
- `StreamingController` has no heartbeat → `streaming.controller.spec.ts` heartbeat assertions fail
- `ConversationPane` does not handle `TOOL_CALL_ARGS`/`TOOL_CALL_RESULT`/`TOOL_CALL_PROMOTED` / system messages → `ConversationPane.test.tsx` new tests fail

### Test File Plan

| File | Action | Tests |
|------|--------|-------|
| `apps/web/src/components/conversation/ToolPill.test.tsx` | Create | 7 |
| `apps/web/src/components/conversation/SemanticPill.test.tsx` | Create | 5 |
| `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` | Create | 10 |
| `apps/agent-be/src/streaming/agent.service.unit.spec.ts` | Create | 12 |
| `apps/agent-be/src/streaming/streaming.controller.spec.ts` | Extend | 5 (new describe block) |
| `apps/web/src/components/conversation/ConversationPane.test.tsx` | Extend | 9 (new describe block) |
| `apps/web/src/components/conversation/ChatComponents.test.tsx` | Modify | Remove ToolExecutionIndicator tests |
| **Total** | | **48 test cases** |

---

## Step 4 Output: Test Generation (RED PHASE)

**Execution Mode:** SEQUENTIAL (Jest unit/component tests only — no Playwright/E2E in scope)

**TDD Red Phase:** All new test cases use `it.skip()` — tests are skipped until implementation lands. Remove `it.skip()` → `it()` when activating for the current task.

### Stub Files Created (for TDD red phase compilation)

| File | Type | Stub Behavior |
|------|------|---------------|
| `apps/web/src/components/conversation/ToolPill.tsx` | Component | Throws "not implemented" |
| `apps/web/src/components/conversation/SemanticPill.tsx` | Component | Throws "not implemented" |
| `apps/agent-be/src/streaming/tool-pill-classifier.service.ts` | NestJS Service | Throws "not implemented" |

### Type Extensions (minimal for compilation)

| File | Changes |
|------|---------|
| `libs/shared-types/src/ag-ui.types.ts` | Added `ToolCallArgsEvent` re-export, `TOOL_CALL_PROMOTED_EVENT` const, `ToolCallPromotedEvent` interface, updated `AgUiEventType` |
| `apps/web/src/components/conversation/types.ts` | Added `ToolCallData` interface, extended `ChatMessage` with `toolCall?` field and `role: 'system'` |

### Test Files Generated

| File | Action | New Tests | Priority Breakdown |
|------|--------|-----------|-------------------|
| `apps/web/src/components/conversation/ToolPill.test.tsx` | Created | 9 | P0: 7, P1: 2 |
| `apps/web/src/components/conversation/SemanticPill.test.tsx` | Created | 5 | P0: 4, P1: 1 |
| `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` | Created | 10 | P0: 8, P1: 2 |
| `apps/agent-be/src/streaming/agent.service.unit.spec.ts` | Created | 11 | P0: 9, P1: 2 |
| `apps/agent-be/src/streaming/streaming.controller.spec.ts` | Extended | 5 (new describe) | P0: 3, P1: 2 |
| `apps/web/src/components/conversation/ConversationPane.test.tsx` | Extended | 9 (new describe) | P0: 8, P1: 1 |
| `apps/web/src/components/conversation/ChatComponents.test.tsx` | Modified | -2 (removed) | N/A |
| **Total** | | **49 new test cases** | **P0: 39, P1: 10** |

### TDD Red Phase Compliance

- All new test cases use `it.skip()` (Jest equivalent of `test.skip()`)
- All tests assert EXPECTED behavior (not placeholder assertions)
- All tests are marked as expected_to_fail (stubs throw "not implemented")
- No active passing tests generated (correct TDD red phase)

### Next Steps (Task-by-Task Activation)

During implementation of each task:

1. Remove `it.skip()` from the current test file or describe block
2. Run tests: `yarn nx test agent-be` / `yarn nx test web`
3. Verify the activated test fails first, then passes after implementation (green phase)
4. If any activated tests still fail unexpectedly:
   - Either fix implementation (feature bug)
   - Or fix test (test bug)
5. Commit passing tests

### Implementation Guidance

**Backend (agent-be) to implement:**
- `ToolPillClassifierService.classifyToolResult()` — git commit detection, artifact type derivation, Postgres lookup
- `AgentService` — full tool call lifecycle emission (TOOL_CALL_ARGS/END/RESULT), circuit breaker timer, classifier integration
- `StreamingController` — SSE heartbeat interval (15s)
- `StreamingModule` — register `ToolPillClassifierService` as provider

**Frontend (web) to implement:**
- `ToolPill` component — running/completed/error states, expand/collapse, keyboard a11y
- `SemanticPill` component — "Progress saved" + artifact type/title + View link
- `ConversationPane` — TOOL_CALL_ARGS/END/RESULT/PROMOTED listeners, system messages on RUN_ERROR/STREAM_ERROR
- `ChatMessageList` — handle `toolCall` field (render ToolPill/SemanticPill), handle `role: 'system'`
- Delete `ToolExecutionIndicator.tsx` (superseded by ToolPill)

---

## Step 5 Output: Validate & Complete

### Validation Results

| Check | Status |
|-------|--------|
| Story approved with clear acceptance criteria | PASS — 5 ACs, all testable |
| Test framework configured (Jest) | PASS — jest.config.ts in apps/web + apps/agent-be |
| Test files created correctly | PASS — 3 new, 2 extended, 1 modified |
| Checklist matches acceptance criteria | PASS — all 5 ACs mapped to test scenarios |
| Tests are red-phase scaffolds with `it.skip()` | PASS — 49 new test cases, all `it.skip()` |
| Story metadata and handoff paths captured | PASS — frontmatter complete |
| Temp artifacts in `_bmad-output/test-artifacts/` | PASS |
| TypeScript typecheck passes | PASS — `tsc --noEmit` clean for both apps |
| ESLint passes (0 errors) | PASS — 0 errors in web + agent-be |
| Existing tests still pass | PASS — 548 web + 53 agent-be existing tests pass |
| New skipped tests verified | PASS — 23 web + 27 agent-be new tests properly skipped |

### Completion Summary

**Story:** 3.4 — See Tool Calls and Recognized Actions Inline
**Story ID:** 3.4
**Story key:** 3-4-see-tool-calls-and-recognized-actions-inline
**TDD Phase:** RED (test scaffolds generated, all `it.skip()`)

**Test files created:**
- `apps/web/src/components/conversation/ToolPill.test.tsx` (9 tests)
- `apps/web/src/components/conversation/SemanticPill.test.tsx` (5 tests)
- `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` (10 tests)
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (11 tests)

**Test files extended:**
- `apps/agent-be/src/streaming/streaming.controller.spec.ts` (+5 heartbeat tests)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` (+9 Story 3.4 tests)

**Test files modified:**
- `apps/web/src/components/conversation/ChatComponents.test.tsx` (removed 2 ToolExecutionIndicator tests)

**Stub files created (for compilation):**
- `apps/web/src/components/conversation/ToolPill.tsx`
- `apps/web/src/components/conversation/SemanticPill.tsx`
- `apps/agent-be/src/streaming/tool-pill-classifier.service.ts`

**Type extensions:**
- `libs/shared-types/src/ag-ui.types.ts` — added `ToolCallArgsEvent`, `TOOL_CALL_PROMOTED_EVENT`, `ToolCallPromotedEvent`
- `apps/web/src/components/conversation/types.ts` — added `ToolCallData`, extended `ChatMessage` with `toolCall?` and `role: 'system'`

**Total: 49 new test cases (P0: 39, P1: 10)**

**Checklist output:** `_bmad-output/test-artifacts/atdd-checklist-3-4-see-tool-calls-and-recognized-actions-inline.md`

**Key risks/assumptions:**
- The `agent.service.unit.spec.ts` tests require the real `AgentService` constructor to accept a 4th parameter (`ToolPillClassifierService`). The current constructor has 3 params — implementation must add the 4th.
- The circuit breaker tests use `jest.doMock` to override the `__mocks__/claude-agent-sdk.ts` mock per-test. The implementation must ensure `jest.doMock` is called before `require` or the module is re-imported.
- The `TOOL_CALL_RESULT` event shape in tests uses `{ messageId, toolCallId, content, role }` per AG-UI spec. The SDK's actual tool result message type may differ — verify against SDK types during implementation.

**Next recommended workflow:** `bmad-dev-story` — implement Story 3.4 tasks, removing `it.skip()` → `it()` per task and verifying green phase.
