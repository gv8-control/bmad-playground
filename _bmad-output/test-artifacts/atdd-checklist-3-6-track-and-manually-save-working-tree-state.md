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
workflowType: 'testarch-atdd'
storyId: '3.6'
storyKey: 3-6-track-and-manually-save-working-tree-state
storyFile: _bmad-output/implementation-artifacts/3-6-track-and-manually-save-working-tree-state.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-3-6-track-and-manually-save-working-tree-state.md
generatedTestFiles:
  - apps/agent-be/src/conversations/manual-commit.service.spec.ts
  - apps/agent-be/src/streaming/agent.service.unit.spec.ts
  - apps/agent-be/src/conversations/conversations.service.spec.ts
  - apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx
  - apps/web/src/components/conversation/ConversationPane.test.tsx
  - apps/web/src/components/conversation/SemanticPill.test.tsx
inputDocuments:
  - _bmad-output/implementation-artifacts/3-6-track-and-manually-save-working-tree-state.md
  - _bmad-output/project-context.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/data-factories.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/component-tdd.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-levels-framework.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-priorities-matrix.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/ci-burn-in.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/selector-resilience.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/timing-debugging.md
---

# ATDD Checklist — Story 3.6: Track and Manually Save Working Tree State

**TDD Phase:** RED (test scaffolds to be generated, will fail until implementation)
**Stack:** fullstack (Next.js + NestJS) — this story spans both backend and frontend
**Generated:** 2026-07-04
**Execution Mode:** SEQUENTIAL

---

## Step 1 Output: Preflight & Context

### Stack Detection
- Config `test_stack_type`: auto
- Auto-detected: `fullstack` (package.json with Next.js/React + NestJS; both `playwright.config.ts` and `jest.config.ts` present)
- Story scope: fullstack (agent-be `ManualCommitService` + `SandboxService.commit` + `AgentService.isIdle` + working tree emission; web `WorkingTreeIndicator` + `ConversationPane` SSE listeners + `SemanticPill` extension)

### Prerequisites
- Story 3.6 approved, status `ready-for-dev`, 7 clear ACs
- Jest configured: jsdom for component tests, `@jest-environment node` for pure function/backend tests
  - `apps/web/jest.config.ts` — `transformIgnorePatterns: ['node_modules/(?!jose|@ag-ui|@anthropic-ai)']`
  - `apps/agent-be/jest.config.ts` + `jest-integration.config.ts`
- Playwright configured: `playwright.config.ts` (auth setup + chromium projects, 4 shards)
- Dev environment available
- All dependencies already installed (`zod`, `nestjs-zod`, `rxjs`, `jose` already installed; no new packages needed)

### Story Context
- **Story file:** `_bmad-output/implementation-artifacts/3-6-track-and-manually-save-working-tree-state.md`
- **Story key:** `3-6-track-and-manually-save-working-tree-state`
- **Story ID:** `3.6`
- **Acceptance Criteria:**
  - AC-1: Working tree indicator reflects git state (FR14, UX-DR7) — dirty/clean states, updates after agent actions and manual saves, `aria-live="polite"`
  - AC-2: Manual save via confirmation popover (FR15, NFR-P5, UX-DR7) — popover with Save/Cancel, platform-level commit, `chore(platform-save): checkpoint [<ISO8601>]` message, ≤5s, not shown in chat UI
  - AC-3: Queued save behind in-progress agent turn — "Saving after response…" indicator, commit fires when agent is next idle
  - AC-4: Successful save produces Semantic Pill + resets indicator — `MANUAL_SAVE_SUCCEEDED` event, Semantic Pill inline, indicator resets to clean
  - AC-5: Failed save produces error-state Tool Pill + indicator stays dirty — `MANUAL_SAVE_FAILED` event, error Tool Pill, indicator remains dirty, no partial commit
  - AC-6: No-op on clean tree + duplicate submission prevention — returns no-op without error, Save control disabled while saving
  - AC-7: Help text on dirty indicator (UX-DR7) — `ⓘ` info affordance, disclosure tooltip with help text, separate from save trigger

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
- `jest.useFakeTimers()` + `jest.advanceTimersByTime()` for timer-dependent tests
- `userEvent.type()` over `fireEvent.change` for React 19 text inputs
- `AgentServiceFake` mimics production side effects (Turn persistence, `terminateProcess` calls, SSE event emission)
- `jest.isolateModules` for per-test `jest.doMock` of already-imported modules (agent.service.unit.spec.ts pattern)

### TEA Config Flags
- `tea_use_playwright_utils`: true
- `tea_use_pactjs_utils`: false
- `tea_pact_mcp`: none
- `tea_browser_automation`: auto
- `test_stack_type`: auto

### Knowledge Fragments Loaded
- `data-factories.md` (core) — Factory functions with overrides, API-first setup
- `component-tdd.md` (core) — Red-Green-Refactor cycle, provider isolation, accessibility assertions
- `test-quality.md` (core) — Deterministic, isolated, explicit, focused, fast tests
- `test-healing-patterns.md` (core) — Common failure patterns and fixes
- `test-levels-framework.md` (core) — Unit vs integration vs E2E selection
- `test-priorities-matrix.md` (core) — P0-P3 priority assignment
- `ci-burn-in.md` (core) — CI burn-in patterns
- `selector-resilience.md` (extended) — Robust selector strategies (frontend/fullstack)
- `timing-debugging.md` (extended) — Race condition identification and deterministic waits (frontend/fullstack)

### Existing Test Files (to be extended)
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — Story 3.4 delivered this. Story 3.6 adds working tree emission tests (WORKING_TREE_DIRTY/CLEAN after file-modifying tool calls)
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — Stories 3.1/3.2/3.5 delivered this. Story 3.6 adds `manualCommit` + `flushPendingCommit` tests
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — Stories 3.1/3.2/3.3/3.4/3.5 delivered this. Story 3.6 adds working tree state + manual save SSE listener tests
- `apps/web/src/components/conversation/SemanticPill.test.tsx` — Story 3.4 delivered this. Story 3.6 adds manual save variant tests (empty artifact props)

### New Test Files (to be created)
- `apps/agent-be/src/conversations/manual-commit.service.spec.ts` — `ManualCommitService` unit tests (commit, queue, flush, no-op, failure, dedup)
- `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx` — indicator states, save popover, info tooltip, accessibility

### Key Implementation Context (from story + project-context.md)
- **`ManualCommitService`**: new `@Injectable()` in `conversations/` module. Injects `SANDBOX_SERVICE`, `AGENT_SERVICE`, `SessionEventsService`, `PrismaService`. `requestCommit()` checks idle → queue or execute. `flushPendingCommit()` fires queued commit. `executeCommit()` owns all error handling, emits `MANUAL_SAVE_SUCCEEDED`/`MANUAL_SAVE_FAILED` + `WORKING_TREE_CLEAN`. `OnModuleDestroy` clears `pendingCommits`
- **`SandboxService.commit`**: `git add -A` then `git commit -m <shell-quoted>` via `sandbox.process.executeCommand`. Two separate calls. Check `exitCode` on commit. Timeout 10s
- **`SandboxServiceFake.commit`**: tracks `commitCalls` array, `failNextCommit` flag, `getCommitCalls()` inspection
- **`AgentService.isIdle`**: `return !this.activeRuns.has(conversationId)` — one-liner reading existing Map
- **`AgentServiceFake.isIdle`**: `return !this.activeRun` — reads existing boolean
- **Working tree emission after file-modifying tool calls**: `FILE_MODIFYING_TOOLS = Set(['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])`. After `TOOL_CALL_RESULT` for these tools, fire-and-forget `getWorkingTreeStatus` → emit `WORKING_TREE_DIRTY`/`WORKING_TREE_CLEAN`. Track in `pendingClassifierPromises` so awaited before `RUN_FINISHED`
- **`WorkingTreeIndicator`**: Client Component with states `hidden`/`dirty`/`clean`/`saving`/`saving-after-response`. Dirty state has clickable label (opens save popover) + separate `ⓘ` info affordance (opens disclosure tooltip). `aria-live="polite"` container. Focus-trapping popover with Save/Cancel. Standard focus ring
- **`ConversationPane` working tree state**: `useState<WorkingTreeState>('hidden')`. SSE listeners for `WORKING_TREE_DIRTY`/`WORKING_TREE_CLEAN`/`MANUAL_SAVE_SUCCEEDED`/`MANUAL_SAVE_FAILED`. `handleSave` calls `POST /conversations/:id/save`. `effectiveWorkingTreeState` hides indicator when `state !== 'ready'`
- **`SemanticPill` extension**: conditionally render View link, type label, title when props are non-empty. Manual save: `artifactType: ''`, `artifactTitle: ''`, `viewHref: ''` → renders just "Progress saved"
- **Commit message format**: `chore(platform-save): checkpoint [<ISO8601 UTC timestamp>]` — not shown in chat UI
- **`POST /conversations/:id/save`**: `SaveConversationDto` (empty body), returns `{ committed, clean, queued }` directly (no wrapper). Tenant isolation via `findFirst({ where: { id, userId } })`
- **`ConversationsService.runAgentTurn`**: after `agentService.runTurn` resolves, calls `flushPendingCommit(conversationId, sandboxId)` with `.catch()` safety

---

## Step 2 Output: Generation Mode

**Mode:** AI Generation

**Rationale:**
- Acceptance criteria are clear and well-specified (7 ACs with Given/When/Then)
- Scenarios are standard: service logic (commit/queue/flush), component state rendering (indicator states), SSE event handling, popover focus management
- Stack is fullstack with well-established Jest patterns (`MockEventSource`, `buildTestModule`, `AgentServiceFake`, `jest.isolateModules`)
- No complex UI interactions requiring live browser recording (popover is simple conditional render + focus management, no drag/drop or wizards)
- Backend logic (`ManualCommitService`) is unit-testable with mocks
- Working tree emission logic is unit-testable with the existing `agent.service.unit.spec.ts` pattern

---

## Step 3 Output: Test Strategy

### AC-1: Working tree indicator reflects git state (FR14, UX-DR7)

**Backend — `AgentService` working tree emission after file-modifying tool calls:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 1.1 | Emits WORKING_TREE_DIRTY after a file-modifying tool call when tree is dirty | Unit | P0 | `agent.service.unit.spec.ts` |
| 1.2 | Emits WORKING_TREE_CLEAN after a file-modifying tool call when tree is clean | Unit | P0 | `agent.service.unit.spec.ts` |
| 1.3 | Does NOT emit working tree events after non-file-modifying tool calls (e.g. Read) | Unit | P0 | `agent.service.unit.spec.ts` |
| 1.4 | Working tree check failure does not crash the agent run (logger.warn, RUN_FINISHED still emits) | Unit | P0 | `agent.service.unit.spec.ts` |
| 1.5 | Working tree event arrives before RUN_FINISHED (event ordering) | Unit | P1 | `agent.service.unit.spec.ts` |

**Frontend — `ConversationPane` SSE listeners:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 1.6 | WORKING_TREE_DIRTY event sets indicator to dirty | Component | P0 | `ConversationPane.test.tsx` |
| 1.7 | WORKING_TREE_CLEAN event sets indicator to clean | Component | P0 | `ConversationPane.test.tsx` |
| 1.8 | Indicator is hidden when session state is not 'ready' | Component | P0 | `ConversationPane.test.tsx` |
| 1.9 | Container has aria-live="polite" | Component | P0 | `WorkingTreeIndicator.test.tsx` |

### AC-2: Manual save via confirmation popover (FR15, NFR-P5, UX-DR7)

**Backend — `ManualCommitService.executeCommit` + `SandboxService.commit`:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 2.1 | Commits immediately when agent is idle and tree is dirty | Unit | P0 | `manual-commit.service.spec.ts` |
| 2.2 | Commit message matches format `chore(platform-save): checkpoint [<ISO8601 UTC>]` | Unit | P1 | `manual-commit.service.spec.ts` |
| 2.3 | MANUAL_SAVE_SUCCEEDED + WORKING_TREE_CLEAN emitted on success | Unit | P0 | `manual-commit.service.spec.ts` |
| 2.4 | Returns `{ committed: true, clean: false, queued: false }` on success | Unit | P0 | `manual-commit.service.spec.ts` |

**Frontend — `WorkingTreeIndicator` save popover:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 2.5 | Dirty state renders `● Unsaved changes` label + `ⓘ` info affordance | Component | P0 | `WorkingTreeIndicator.test.tsx` |
| 2.6 | Clicking dirty label opens save confirmation popover with "Save current progress?" | Component | P0 | `WorkingTreeIndicator.test.tsx` |
| 2.7 | Save button in popover calls onSave and closes popover | Component | P0 | `WorkingTreeIndicator.test.tsx` |
| 2.8 | Cancel closes popover without calling onSave | Component | P0 | `WorkingTreeIndicator.test.tsx` |
| 2.9 | handleSave calls POST /conversations/:id/save | Component | P0 | `ConversationPane.test.tsx` |

### AC-3: Queued save behind in-progress agent turn

**Backend — `ManualCommitService.requestCommit` queue logic:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 3.1 | Queues commit when agent is not idle (returns queued=true, commit NOT called) | Unit | P0 | `manual-commit.service.spec.ts` |
| 3.2 | flushPendingCommit executes queued commit after agent idle | Unit | P0 | `manual-commit.service.spec.ts` |
| 3.3 | flushPendingCommit is no-op when no pending commit | Unit | P0 | `manual-commit.service.spec.ts` |

**Frontend — `ConversationPane` + `WorkingTreeIndicator`:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 3.4 | Queued save response sets indicator to "Saving after response…" | Component | P0 | `ConversationPane.test.tsx` |
| 3.5 | saving-after-response state renders "Saving after response…" text | Component | P0 | `WorkingTreeIndicator.test.tsx` |

### AC-4: Successful save produces Semantic Pill + resets indicator

**Backend — `ManualCommitService` success emission:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 4.1 | MANUAL_SAVE_SUCCEEDED emitted with `{ toolCallId, timestamp }` on success | Unit | P0 | `manual-commit.service.spec.ts` |

**Frontend — `ConversationPane` SSE listener + `SemanticPill`:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 4.2 | MANUAL_SAVE_SUCCEEDED adds a Semantic Pill message + sets indicator to clean | Component | P0 | `ConversationPane.test.tsx` |
| 4.3 | MANUAL_SAVE_SUCCEEDED message has correct toolCall.semantic shape | Component | P1 | `ConversationPane.test.tsx` |
| 4.4 | Renders "Progress saved" without View link when viewHref is empty | Component | P0 | `SemanticPill.test.tsx` |
| 4.5 | Renders "Progress saved" without type label when artifactType is empty | Component | P0 | `SemanticPill.test.tsx` |
| 4.6 | Renders "Progress saved" without title when artifactTitle is empty | Component | P0 | `SemanticPill.test.tsx` |

### AC-5: Failed save produces error-state Tool Pill + indicator stays dirty

**Backend — `ManualCommitService` failure handling:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 5.1 | Failed commit emits MANUAL_SAVE_FAILED and does NOT emit WORKING_TREE_CLEAN | Unit | P0 | `manual-commit.service.spec.ts` |
| 5.2 | executeCommit never throws — errors caught and emitted as MANUAL_SAVE_FAILED | Unit | P1 | `manual-commit.service.spec.ts` |

**Frontend — `ConversationPane` SSE listener:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 5.3 | MANUAL_SAVE_FAILED adds an error Tool Pill message + keeps indicator dirty | Component | P0 | `ConversationPane.test.tsx` |

### AC-6: No-op on clean tree + duplicate submission prevention

**Backend — `ManualCommitService` no-op + dedup:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 6.1 | Returns no-op when tree is clean (commit NOT called, WORKING_TREE_CLEAN emitted) | Unit | P0 | `manual-commit.service.spec.ts` |
| 6.2 | Duplicate requestCommit while already queued returns queued=true without double-queueing | Unit | P0 | `manual-commit.service.spec.ts` |

**Frontend — `WorkingTreeIndicator` disabled states:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 6.3 | Save button is disabled when state is 'saving' or 'saving-after-response' | Component | P0 | `WorkingTreeIndicator.test.tsx` |
| 6.4 | saving state renders "Saving…" text | Component | P0 | `WorkingTreeIndicator.test.tsx` |
| 6.5 | Clean save response (no-op) sets indicator to clean | Component | P0 | `ConversationPane.test.tsx` |
| 6.6 | Save button is disabled while saving | Component | P0 | `ConversationPane.test.tsx` |

### AC-7: Help text on dirty indicator (UX-DR7)

**Frontend — `WorkingTreeIndicator` info tooltip:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 7.1 | Clicking `ⓘ` info affordance opens disclosure tooltip with help text | Component | P0 | `WorkingTreeIndicator.test.tsx` |
| 7.2 | Info affordance is independently focusable (Tab reaches it separately from label) | Component | P0 | `WorkingTreeIndicator.test.tsx` |
| 7.3 | Info tooltip dismissible by outside click and Escape | Component | P1 | `WorkingTreeIndicator.test.tsx` |

### Additional Component Tests

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 8.1 | Clean state renders `✓ All saved` and is non-interactive | Component | P0 | `WorkingTreeIndicator.test.tsx` |
| 8.2 | Hidden state renders null | Component | P0 | `WorkingTreeIndicator.test.tsx` |
| 8.3 | Focus is trapped in save popover and returned to trigger on close | Component | P1 | `WorkingTreeIndicator.test.tsx` |
| 8.4 | Renders full pill with View link when all props are present (regression guard) | Component | P0 | `SemanticPill.test.tsx` |
| 8.5 | Manual-save variant has role="status" and aria-live="polite" | Component | P1 | `SemanticPill.test.tsx` |

### ConversationsService Integration Tests

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 9.1 | manualCommit delegates to manualCommitService.requestCommit with correct args | Unit | P0 | `conversations.service.spec.ts` |
| 9.2 | manualCommit throws NotFoundException for conversation not owned by user | Unit | P0 | `conversations.service.spec.ts` |
| 9.3 | manualCommit throws NotFoundException when sandboxId is missing | Unit | P0 | `conversations.service.spec.ts` |
| 9.4 | runAgentTurn calls flushPendingCommit after agentService.runTurn completes | Unit | P0 | `conversations.service.spec.ts` |
| 9.5 | runAgentTurn does NOT call flushPendingCommit when sandboxId is missing | Unit | P0 | `conversations.service.spec.ts` |

### Red Phase Confirmation

All new test cases will fail until implementation:
- `ManualCommitService` does not exist → `manual-commit.service.spec.ts` import fails
- `ISandboxService.commit` not on interface → `SandboxServiceFake.commit` doesn't exist → compilation fails
- `IAgentService.isIdle` not on interface → `AgentServiceFake.isIdle` doesn't exist → compilation fails
- `AgentService` has no working tree emission after tool calls → `agent.service.unit.spec.ts` new tests fail
- `WorkingTreeIndicator` component doesn't exist → `WorkingTreeIndicator.test.tsx` import fails
- `ConversationPane` has no `workingTreeState`, no SSE listeners for `WORKING_TREE_*`/`MANUAL_SAVE_*`, no `handleSave` → `ConversationPane.test.tsx` new tests fail
- `SemanticPill` always renders all parts → `SemanticPill.test.tsx` manual save variant tests fail

### Test File Plan

| File | Action | Tests | Priority Breakdown |
|------|--------|-------|-------------------|
| `apps/agent-be/src/conversations/manual-commit.service.spec.ts` | Create | 9 | P0: 7, P1: 2 |
| `apps/agent-be/src/streaming/agent.service.unit.spec.ts` | Extend | 5 (new describe) | P0: 4, P1: 1 |
| `apps/agent-be/src/conversations/conversations.service.spec.ts` | Extend | 5 (new describe) | P0: 5 |
| `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx` | Create | 15 | P0: 13, P1: 2 |
| `apps/web/src/components/conversation/ConversationPane.test.tsx` | Extend | 9 (new describe) | P0: 8, P1: 1 |
| `apps/web/src/components/conversation/SemanticPill.test.tsx` | Extend | 5 (new describe) | P0: 4, P1: 1 |
| **Total** | | **48 test cases** | **P0: 41, P1: 7** |

---

## Step 4 Output: Test Generation (RED PHASE)

**Execution Mode:** SEQUENTIAL (Jest unit/component tests only — no Playwright/E2E in scope)

**TDD Red Phase:** All new test cases use `it.skip()` — tests are skipped until implementation lands. Remove `it.skip()` → `it()` when activating for the current task.

### Stub Files Created (for TDD red phase compilation)

| File | Type | Stub Behavior |
|------|------|---------------|
| `apps/agent-be/src/conversations/manual-commit.service.ts` | NestJS Injectable | `requestCommit()` and `flushPendingCommit()` throw "not implemented" |
| `apps/agent-be/src/conversations/dto/save-conversation.dto.ts` | Zod DTO | Empty body DTO (`z.object({})`) — fully implemented (trivial) |
| `apps/web/src/components/conversation/WorkingTreeIndicator.tsx` | Client Component | Throws "not implemented" on render; exports `WorkingTreeState` type + `WorkingTreeIndicatorProps` |

### Interface Extensions (for compilation)

| File | Changes |
|------|---------|
| `libs/shared-types/src/sandbox.interface.ts` | Added `commit(sandboxId: string, message: string): Promise<void>` to `ISandboxService` |
| `libs/shared-types/src/agent.interface.ts` | Added `isIdle(conversationId: string): boolean` to `IAgentService` |

### Fake Extensions (for test compilation + side-effect mimicry)

| File | Changes |
|------|---------|
| `apps/agent-be/test/helpers/sandbox-service.fake.ts` | Added `commit()` (tracks calls in `commitCalls` array), `failNextCommit()` control hook, `getCommitCalls()` inspection |
| `apps/agent-be/test/helpers/agent-service.fake.ts` | Added `isIdle()` (`return !this.activeRun`) |

### Production Stubs (for compilation — interface satisfaction)

| File | Changes |
|------|---------|
| `apps/agent-be/src/sandbox/sandbox.service.ts` | Added `commit()` stub (throws "not implemented") |
| `apps/agent-be/src/streaming/agent.service.ts` | Added `isIdle()` (trivial one-liner: `return !this.activeRuns.has(conversationId)`) |
| `apps/agent-be/src/conversations/conversations.module.ts` | Added `ManualCommitService` to providers |
| `apps/agent-be/src/conversations/conversations.service.ts` | Injected `ManualCommitService`, added `manualCommit()` method, added `flushPendingCommit` call in `runAgentTurn` (with `.catch()` safety) |
| `apps/agent-be/src/conversations/conversations.controller.ts` | Added `POST :id/save` endpoint + `SaveConversationDto` import |

### Test Files Generated

| File | Action | New Tests | Priority Breakdown |
|------|--------|-----------|-------------------|
| `apps/agent-be/src/conversations/manual-commit.service.spec.ts` | Created | 9 | P0: 7, P1: 2 |
| `apps/agent-be/src/streaming/agent.service.unit.spec.ts` | Extended | 5 (new describe) | P0: 4, P1: 1 |
| `apps/agent-be/src/conversations/conversations.service.spec.ts` | Extended | 5 (new describe) | P0: 5 |
| `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx` | Created | 15 | P0: 13, P1: 2 |
| `apps/web/src/components/conversation/ConversationPane.test.tsx` | Extended | 9 (new describe) | P0: 8, P1: 1 |
| `apps/web/src/components/conversation/SemanticPill.test.tsx` | Extended | 5 (new describe) | P0: 4, P1: 1 |
| **Total** | | **48 new test cases** | **P0: 41, P1: 7** |

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
- `SandboxService.commit()` — `git add -A` then `git commit -m <shell-quoted>` via `sandbox.process.executeCommand`, check `exitCode`
- `ManualCommitService` — `requestCommit()` (idle check → queue or execute), `flushPendingCommit()`, `executeCommit()` (owns all error handling, emits `MANUAL_SAVE_SUCCEEDED`/`MANUAL_SAVE_FAILED` + `WORKING_TREE_CLEAN`), `OnModuleDestroy`
- `AgentService` working tree emission — `FILE_MODIFYING_TOOLS` set, fire-and-forget `getWorkingTreeStatus` after file-modifying tool results, emit `WORKING_TREE_DIRTY`/`WORKING_TREE_CLEAN`, track in `pendingClassifierPromises`

**Frontend (web) to implement:**
- `WorkingTreeIndicator` — states (hidden/dirty/clean/saving/saving-after-response), save confirmation popover (focus-trapping), info disclosure tooltip, `aria-live="polite"`, standard focus ring
- `ConversationPane` — `workingTreeState` state, SSE listeners for `WORKING_TREE_*` + `MANUAL_SAVE_*`, `handleSave` (POST /save), `effectiveWorkingTreeState` (hide when not ready), render `<WorkingTreeIndicator>`
- `SemanticPill` — conditional rendering of View link, type label, title when props are non-empty

---

## Step 5 Output: Validate & Complete

### Validation Results

| Check | Status |
|-------|--------|
| Story approved with clear acceptance criteria | PASS — 7 ACs, all testable |
| Test framework configured (Jest) | PASS — jest.config.ts in apps/web + apps/agent-be |
| Test files created correctly | PASS — 3 new, 3 extended |
| Checklist matches acceptance criteria | PASS — all 7 ACs mapped to test scenarios |
| Tests are red-phase scaffolds with `it.skip()` | PASS — 48 new test cases, all `it.skip()` |
| Story metadata and handoff paths captured | PASS — frontmatter complete |
| Temp artifacts in `_bmad-output/test-artifacts/` | PASS |
| TypeScript typecheck passes | PASS — `tsc --noEmit` clean for both apps |
| ESLint passes (0 errors) | PASS — 0 errors in agent-be; 1 pre-existing error in web (CredentialErrorBanner.test.tsx, not Story 3.6) |
| Existing tests still pass | PASS — agent-be: 87 passed, 19 skipped; web: 593 passed, 29 skipped |
| New skipped tests verified | PASS — 19 agent-be + 29 web = 48 new tests properly skipped |

### Completion Summary

**Story:** 3.6 — Track and Manually Save Working Tree State
**Story ID:** 3.6
**Story key:** 3-6-track-and-manually-save-working-tree-state
**TDD Phase:** RED (test scaffolds generated, all `it.skip()`)

**Test files created:**
- `apps/agent-be/src/conversations/manual-commit.service.spec.ts` (9 tests)
- `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx` (15 tests)

**Test files extended:**
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (+5 working tree emission tests)
- `apps/agent-be/src/conversations/conversations.service.spec.ts` (+5 manualCommit + flush tests)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` (+9 working tree + manual save tests)
- `apps/web/src/components/conversation/SemanticPill.test.tsx` (+5 manual save variant tests)

**Stub files created (for compilation):**
- `apps/agent-be/src/conversations/manual-commit.service.ts`
- `apps/agent-be/src/conversations/dto/save-conversation.dto.ts`
- `apps/web/src/components/conversation/WorkingTreeIndicator.tsx`

**Interface extensions:**
- `libs/shared-types/src/sandbox.interface.ts` — `commit()` on `ISandboxService`
- `libs/shared-types/src/agent.interface.ts` — `isIdle()` on `IAgentService`

**Fake extensions:**
- `apps/agent-be/test/helpers/sandbox-service.fake.ts` — `commit()`, `failNextCommit()`, `getCommitCalls()`
- `apps/agent-be/test/helpers/agent-service.fake.ts` — `isIdle()`

**Production stubs (for compilation — interface satisfaction):**
- `apps/agent-be/src/sandbox/sandbox.service.ts` — `commit()` stub
- `apps/agent-be/src/streaming/agent.service.ts` — `isIdle()` (trivial one-liner)
- `apps/agent-be/src/conversations/conversations.module.ts` — `ManualCommitService` in providers
- `apps/agent-be/src/conversations/conversations.service.ts` — `ManualCommitService` injection, `manualCommit()` method, `flushPendingCommit` call in `runAgentTurn`
- `apps/agent-be/src/conversations/conversations.controller.ts` — `POST :id/save` endpoint

**Total: 48 new test cases (P0: 41, P1: 7)**

**Checklist output:** `_bmad-output/test-artifacts/atdd-checklist-3-6-track-and-manually-save-working-tree-state.md`

**Key risks/assumptions:**
- The `ManualCommitService` tests rely on `AgentServiceFake.setActiveRun()` to control idle state. The implementation must check `agentService.isIdle(conversationId)` in `requestCommit()`.
- The `SandboxServiceFake.commit()` tracks calls in `commitCalls` array. The implementation must call `sandboxService.commit(sandboxId, message)` with the exact message format `chore(platform-save): checkpoint [<ISO8601 UTC>]`.
- The `AgentService` working tree emission tests use `jest.spyOn(sandboxFake, 'getWorkingTreeStatus')` to control the dirty/clean state. The implementation must call `getWorkingTreeStatus` after file-modifying tool results and emit the appropriate `WORKING_TREE_*` event.
- The `WorkingTreeIndicator` tests expect the component to render different content based on the `state` prop. The implementation must handle all 5 states (hidden/dirty/clean/saving/saving-after-response).
- The `ConversationPane` tests use `MockEventSource.emit` to simulate SSE events. The implementation must add event listeners for `WORKING_TREE_DIRTY`, `WORKING_TREE_CLEAN`, `MANUAL_SAVE_SUCCEEDED`, `MANUAL_SAVE_FAILED`.
- The `SemanticPill` tests expect conditional rendering when `artifactType`/`artifactTitle`/`viewHref` are empty strings. The implementation must add conditional renders for each part.
- The `flushPendingCommit` call in `runAgentTurn` logs an error when `ManualCommitService` is not implemented (expected during red phase). This is caught by `.catch()` and does not break existing tests.

**Next recommended workflow:** `bmad-dev-story` — implement Story 3.6 tasks, removing `it.skip()` → `it()` per task and verifying green phase.
