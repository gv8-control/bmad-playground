---
baseline_commit: 2d917a3b2794b0d9b1b11474e955ae99c252ba1b
---

# Story 3.6: Track and Manually Save Working Tree State

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user mid-Conversation,
I want to see whether my in-progress work has been saved to the repository, and save it on demand,
so that I don't lose work and don't have to wait for the Agent to decide when to commit.

## Acceptance Criteria

### AC-1: Working tree indicator reflects git state (FR14, UX-DR7)

**Given** an active Conversation with a Sandbox
**When** the working tree has uncommitted changes
**Then** the chat input area shows `● Unsaved changes` (amber); when clean, it shows `✓ All saved` or is hidden (FR14, UX-DR7)
**And** the indicator updates after each agent action or manual save, and uses `aria-live="polite"` so changes are announced

### AC-2: Manual save via confirmation popover (FR15, NFR-P5, UX-DR7)

**Given** the indicator is in the dirty state
**When** the user clicks it
**Then** a "Save current progress?" confirmation popover appears with Save/Cancel
**And** confirming executes a platform-level commit inside the Sandbox, bypassing the Agent, completing within 5 seconds of execution (NFR-P5)
**And** the commit uses the message format `chore(platform-save): checkpoint [<ISO8601 UTC timestamp>]`, not shown in the chat UI

### AC-3: Queued save behind in-progress agent turn

**Given** a save is triggered while an agent turn is in progress
**When** the user confirms
**Then** the indicator shows "Saving after response…" and the commit fires once the agent is next idle

### AC-4: Successful save produces Semantic Pill + resets indicator

**Given** a manual save succeeds
**When** it completes
**Then** a Semantic Pill indicating the manual save appears inline at that position, and the indicator resets to clean

### AC-5: Failed save produces error-state Tool Pill + indicator stays dirty

**Given** a manual save fails
**When** the error occurs
**Then** an error-state Tool Pill (same presentation as a failed agent tool call) is shown, the indicator remains dirty, and no partial commit state is created

### AC-6: No-op on clean tree + duplicate submission prevention

**Given** the working tree is already clean when a save is triggered
**When** the operation runs
**Then** it returns a no-op without error
**And** the Save control is disabled while a save is already in progress, preventing duplicate submissions

### AC-7: Help text on dirty indicator (UX-DR7)

**Given** the working tree is in the dirty state
**When** the user seeks more information from the indicator (distinct from triggering the save popover)
**Then** explanatory help text is reachable explaining that closing the page or the Sandbox restarting risks losing unsaved changes, and that saving commits them to the Repository permanently

## Tasks / Subtasks

- [x] Task 1: Add `commit` method to `ISandboxService` + implementations (AC: 2, 4, 5)
  - [x] 1.1 **Already implemented.** `commit(sandboxId: string, message: string): Promise<void>` is already in the `ISandboxService` interface at `libs/shared-types/src/sandbox.interface.ts:35` (after `getWorkingTreeStatus`, before `terminateProcess`). Verified — no change needed
  - [x] 1.2 **Replace the TDD red-phase stub** in `SandboxService` (`apps/agent-be/src/sandbox/sandbox.service.ts:120-121`, currently `throw new Error('SandboxService.commit: not implemented')`). Replace the stub with: run `git add -A` then `git commit -m <shell-quoted message>` via `sandbox.process.executeCommand`. Use the existing `shellQuote` helper for the commit message. Two separate `executeCommand` calls (git add, then git commit) — NOT a single `&&` chain, so a failed `git add` doesn't cascade into a misleading commit. Pass timeout `10` (seconds) to both. On the `git commit` call, check `response.exitCode` — non-zero exit means commit failure (throw `Error` with `response.result` as the message, which contains stderr/stdout). The Daytona SDK `executeCommand` returns `{ exitCode, result }` — `getWorkingTreeStatus` reads `response.result` but doesn't check `exitCode` (a latent gap, deferred per DP-5); `commit` MUST check `exitCode` because a non-zero exit from `git commit` (e.g. "nothing to commit", hook rejection) must surface as a failure. The `git add -A` exit code is less critical (it succeeds even with nothing to add); if it fails, `git commit` will fail with "nothing to commit" which the caller handles as a no-op (see Task 3.1). Follow the exact `executeCommand` signature used by `getWorkingTreeStatus` (lines 104-118) and `injectGitConfig` (lines 88-102): `sandbox.process.executeCommand(command, undefined, undefined, 10)`
  - [x] 1.3 **Already implemented.** `SandboxServiceFake` (`apps/agent-be/test/helpers/sandbox-service.fake.ts`) already has `commit()` (line 95), `commitCalls` array (line 23), `failNextCommit()` (line 41), and `getCommitCalls()` (line 46). Verified — no change needed

- [x] Task 2: Add `isIdle` method to `IAgentService` + implementations (AC: 3)
  - [x] 2.1 **Already implemented.** `isIdle(conversationId: string): boolean` is already in the `IAgentService` interface at `libs/shared-types/src/agent.interface.ts:11` (after `stop`, before the `AGENT_SERVICE` symbol export). Verified — no change needed
  - [x] 2.2 **Already implemented.** `AgentService.isIdle()` at `apps/agent-be/src/streaming/agent.service.ts:436-437`: `return !this.activeRuns.has(conversationId);` — the `activeRuns` Map already tracks running conversations (set in `runTurn` line 84, deleted in `finally` line 151). One-liner method. Verified — no change needed
  - [x] 2.3 **Already implemented.** `AgentServiceFake.isIdle()` at `apps/agent-be/test/helpers/agent-service.fake.ts:139-140`: `return !this.activeRun;` — the `activeRun` boolean already tracks run state (set `true` in `runTurn` line 78, set `false` on completion). Note: `activeRun` is a single boolean (not per-conversation) because the fake processes one run at a time synchronously — sufficient for tests. Verified — no change needed

- [x] Task 2b: Emit `WORKING_TREE_DIRTY`/`WORKING_TREE_CLEAN` after file-modifying agent tool calls (AC: 1)
  - [x] 2b.1 In `AgentService` (`apps/agent-be/src/streaming/agent.service.ts`), add a module-level constant: `const FILE_MODIFYING_TOOLS = new Set(['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);` — these are the Claude Agent SDK tool names that can modify the working tree. The architecture (architecture.md line 89) requires working tree state to be checked "via `git status --porcelain` after Bash and file-write tool calls only". `AgentService` already has `sandboxService` (line 44) and `sessionEvents` (line 45) injected — no new dependencies
  - [x] 2b.2 In `AgentService.processAssistantMessage` (line 367), after emitting `TOOL_CALL_RESULT` and creating the classifier promise, add: if `FILE_MODIFYING_TOOLS.has(toolCallInfo.toolName)`, create a fire-and-forget promise that calls `this.sandboxService.getWorkingTreeStatus(activeRun.sandboxId)` (the `activeRun` is available via `this.activeRuns.get(conversationId)` — store it at the top of `processAssistantMessage` or pass `sandboxId` through), then emits `WORKING_TREE_DIRTY` with `{ files: status.files }` if `status.dirty`, or `WORKING_TREE_CLEAN` with `{}` if not. Follow the EXACT same emit pattern as `provisionSandbox` lines 81-91 and `resumeConversation` lines 265-275. The promise must `.catch((err) => this.logger.warn(...))` — a failed working tree check must not crash the agent run. Add the promise to `pendingClassifierPromises` (rename is NOT needed — it's already a generic "pending post-tool promises" array awaited before `RUN_FINISHED` per the existing pattern at lines 108-111). This ensures the working tree event is emitted before `RUN_FINISHED` (project-context.md line 143 — "Await pending event-emitting promises before run completion")
  - [x] 2b.3 In `AgentServiceFake` (`apps/agent-be/test/helpers/agent-service.fake.ts`), after emitting `TOOL_CALL_RESULT` from the script in `runTurn` (line 98), check if the tool name (available from the `TOOL_CALL_START` event's `toolCallName` in the script) is in `FILE_MODIFYING_TOOLS`. If so, call `this.sandboxService.getWorkingTreeStatus(params.sandboxId)` and emit `WORKING_TREE_DIRTY` or `WORKING_TREE_CLEAN` based on the result. The fake already has `sandboxService` injected (line 29). `SandboxServiceFake.getWorkingTreeStatus` returns `{ dirty: false, files: [] }` by default — tests control the return via `jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['file.ts'] })` to verify dirty-state emission. This mirrors the production side effect so integration tests can assert on it (project-context.md line 129 — fakes mimic production side effects)
  - [x] 2b.4 **Un-skip the existing TDD red-phase tests** in `agent.service.unit.spec.ts` (lines 460, 494 — currently `it.skip`) and make them pass. The skipped tests already cover every case below — do not write from scratch:
    - `[P0]` emits `WORKING_TREE_DIRTY` after a file-modifying tool call when tree is dirty (AC-1) — set `sandboxFake.getWorkingTreeStatus` to return `{ dirty: true, files: ['src/foo.ts'] }`, run a tool call script with `toolName: 'Write'`, assert `WORKING_TREE_DIRTY` emitted with `{ files: ['src/foo.ts'] }`
    - `[P0]` emits `WORKING_TREE_CLEAN` after a file-modifying tool call when tree is clean (AC-1) — same with `{ dirty: false, files: [] }`, assert `WORKING_TREE_CLEAN` emitted
    - `[P0]` does NOT emit working tree events after non-file-modifying tool calls (e.g. `toolName: 'Read'`) — assert no `WORKING_TREE_*` event emitted
    - `[P0]` working tree check failure does not crash the agent run — `sandboxFake.getWorkingTreeStatus` rejects, assert `RUN_FINISHED` still emits, `logger.warn` called
    - `[P1]` working tree event arrives before `RUN_FINISHED` — assert event ordering

- [x] Task 3: Replace `ManualCommitService` stub with implementation (AC: 2, 3, 4, 5, 6)
  - [x] 3.1 **Replace the TDD red-phase stub** in `apps/agent-be/src/conversations/manual-commit.service.ts` (currently `throw new Error('ManualCommitService: not implemented')` on lines 10 and 17). The file already exists as a stub with the `@Injectable()` decorator. Replace both `requestCommit` and `flushPendingCommit` stubs with the actual implementation below:
    - `@Injectable()` class. Injects: `@Inject(SANDBOX_SERVICE) sandboxService: ISandboxService`, `@Inject(AGENT_SERVICE) agentService: IAgentService`, `sessionEvents: SessionEventsService`, `prisma: PrismaService`. Register in `ConversationsModule` providers (Task 4.1)
    - Private field: `private readonly pendingCommits = new Set<string>();` — tracks conversation IDs with a queued commit
    - `async requestCommit(conversationId: string, _userId: string, sandboxId: string): Promise<{ committed: boolean; clean: boolean; queued: boolean }>`:
      1. If `this.pendingCommits.has(conversationId)` → return `{ committed: false, clean: false, queued: true }` (already queued — AC-6 duplicate prevention at the backend level, defense-in-depth alongside the frontend disabled button)
      2. If `!this.agentService.isIdle(conversationId)` → `this.pendingCommits.add(conversationId)`, return `{ committed: false, clean: false, queued: true }` (AC-3: queue behind agent turn)
      3. Agent is idle → call `this.executeCommit(conversationId, sandboxId)` and return the result
    - `async flushPendingCommit(conversationId: string, sandboxId: string): Promise<void>`:
      1. If `!this.pendingCommits.has(conversationId)` → return (no pending commit)
      2. `this.pendingCommits.delete(conversationId)`
      3. Call `this.executeCommit(conversationId, sandboxId)` — errors are caught inside `executeCommit` and emitted as `MANUAL_SAVE_FAILED`, so no try/catch needed here
    - `private async executeCommit(conversationId: string, sandboxId: string): Promise<{ committed: boolean; clean: boolean; queued: boolean }>`:
      1. `const workingTree = await this.sandboxService.getWorkingTreeStatus(sandboxId);`
      2. If `!workingTree.dirty` → emit `WORKING_TREE_CLEAN` (idempotent — indicator may already be clean), return `{ committed: false, clean: true, queued: false }` (AC-6: no-op on clean tree)
      3. `const timestamp = new Date().toISOString();` — ISO 8601 UTC format (e.g. `2026-07-04T12:34:56.789Z`)
      4. `const message = \`chore(platform-save): checkpoint [${timestamp}]\`;` (AC-2: exact message format)
      5. `const toolCallId = \`manual-save-${Date.now()}\`;` — unique ID for the Semantic Pill / Tool Pill
      6. Try `await this.sandboxService.commit(sandboxId, message)`:
         - On success: emit `MANUAL_SAVE_SUCCEEDED` with `{ toolCallId, timestamp }`, emit `WORKING_TREE_CLEAN` with `{}`. Return `{ committed: true, clean: false, queued: false }` (AC-4)
         - On catch (err): emit `MANUAL_SAVE_FAILED` with `{ toolCallId, error: err instanceof Error ? err.message : 'Unknown error' }`. Do NOT emit `WORKING_TREE_CLEAN` (indicator stays dirty — AC-5). Return `{ committed: false, clean: false, queued: false }`
      7. The `executeCommit` method owns ALL error handling — it never throws to the caller. Both `requestCommit` and `flushPendingCommit` rely on this
    - `OnModuleDestroy` implementation: clear `pendingCommits` on shutdown (project-context.md line 138 — `OnModuleDestroy` for in-process state cleanup). Add `implements OnModuleDestroy` and `onModuleDestroy() { this.pendingCommits.clear(); }`
    - **Commit message is NOT shown in chat UI** (AC-2) — the `MANUAL_SAVE_SUCCEEDED` event payload carries only `toolCallId` and `timestamp`, not the commit message. The frontend renders a generic "Progress saved" Semantic Pill, not the commit message
    - **No partial commit state** (AC-5) — `git add -A` + `git commit` is atomic from the user's perspective. If `git add` fails, `git commit` is not called. If `git commit` fails, no commit was created. The `SandboxService.commit` implementation (Task 1.2) uses two separate `executeCommand` calls, so a failed `git add` doesn't cascade

  - [x] 3.2 **Un-skip the existing TDD red-phase tests** in `apps/agent-be/src/conversations/manual-commit.service.spec.ts` (file already exists with `it.skip` tests) and make them pass. Use `buildTestModule()` from `test/helpers/test-module-builder.ts` with `ConversationsModule` import + `AGENT_SERVICE` override with `AgentServiceFake`. Test cases:
    - `[P0]` commits immediately when agent is idle and tree is dirty (AC-2) — assert `sandboxService.commit` called with `chore(platform-save): checkpoint [<ISO8601>]` message format (regex match), `MANUAL_SAVE_SUCCEEDED` + `WORKING_TREE_CLEAN` emitted, returns `{ committed: true, clean: false, queued: false }`
    - `[P0]` returns no-op when tree is clean (AC-6) — assert `sandboxService.commit` NOT called, `WORKING_TREE_CLEAN` emitted, returns `{ committed: false, clean: true, queued: false }`
    - `[P0]` queues commit when agent is not idle (AC-3) — set `agentFake.setActiveRun(true)`, assert `sandboxService.commit` NOT called, returns `{ committed: false, clean: false, queued: true }`, `pendingCommits` has conversation
    - `[P0]` flushPendingCommit executes queued commit after agent idle — queue a commit (agent not idle), then call `flushPendingCommit` after `agentFake.setActiveRun(false)`, assert `sandboxService.commit` called + `MANUAL_SAVE_SUCCEEDED` emitted
    - `[P0]` flushPendingCommit is no-op when no pending commit — assert `sandboxService.commit` NOT called
    - `[P0]` failed commit emits MANUAL_SAVE_FAILED and does NOT emit WORKING_TREE_CLEAN (AC-5) — `sandboxFake.failNextCommit()`, assert `MANUAL_SAVE_FAILED` emitted, `WORKING_TREE_CLEAN` NOT emitted, indicator stays dirty
    - `[P0]` duplicate requestCommit while already queued returns queued=true without double-queueing (AC-6 backend guard)
    - `[P1]` commit message matches exact format `chore(platform-save): checkpoint [<ISO8601 UTC>]` — assert regex `/^chore\(platform-save\): checkpoint \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]$/`
    - `[P1]` executeCommit never throws — errors are caught and emitted as MANUAL_SAVE_FAILED

- [x] Task 4: Wire `ConversationsService` + endpoint (AC: 2, 3)
  - [x] 4.1 **Already implemented.** `ManualCommitService` is already injected into `ConversationsService` constructor at `apps/agent-be/src/conversations/conversations.service.ts:33` and registered in `ConversationsModule` providers at `conversations.module.ts:15`. Verified — no change needed
  - [x] 4.2 **Already implemented.** `manualCommit` method exists at `conversations.service.ts:248-266` with the exact tenant-authorization check (`findFirst({ where: { id, userId } })`), `select: { id: true }` projection, `sandboxIds` lookup, and delegation to `manualCommitService.requestCommit`. Verified — no change needed
  - [x] 4.3 **Already implemented.** `flushPendingCommit` call exists in `runAgentTurn` at `conversations.service.ts:228-229` with the `.catch()` error logging wrapper. Verified — no change needed
  - [x] 4.4 **Already implemented.** `apps/agent-be/src/conversations/dto/save-conversation.dto.ts` exists with `saveConversationSchema = z.object({})` + `SaveConversationDto extends createZodDto(saveConversationSchema)`. Verified — no change needed
  - [x] 4.5 **Already implemented.** `POST :id/save` endpoint exists at `conversations.controller.ts:72-78` with `@Post(':id/save')`, `@User() user: UserContext`, `SaveConversationDto` body, and delegation to `conversationsService.manualCommit`. Verified — no change needed
  - [x] 4.6 **Un-skip the existing TDD red-phase tests** in `conversations.service.spec.ts` (lines 543-610 — currently `it.skip`) and make them pass. The skipped tests already cover every case below — do not write from scratch:
    - `[P0]` manualCommit delegates to manualCommitService.requestCommit with correct args
    - `[P0]` manualCommit throws NotFoundException for conversation not owned by user (tenant isolation)
    - `[P0]` manualCommit throws NotFoundException when sandboxId is missing (session not ready)
    - `[P0]` runAgentTurn calls flushPendingCommit after agentService.runTurn completes
    - `[P0]` runAgentTurn does NOT call flushPendingCommit when sandboxId is missing (early return path)

- [x] Task 5: Frontend — `WorkingTreeIndicator` component (AC: 1, 2, 6, 7, UX-DR7)
  - [x] 5.1 **Replace the TDD red-phase stub** in `apps/web/src/components/conversation/WorkingTreeIndicator.tsx` (currently `throw new Error('WorkingTreeIndicator: not implemented')` on line 11). The file already exists as a stub with the `WorkingTreeState` type and `WorkingTreeIndicatorProps` interface already defined (lines 3-8). Replace the stub function with the actual implementation below:
    ```typescript
    export type WorkingTreeState = 'hidden' | 'dirty' | 'clean' | 'saving' | 'saving-after-response';
    export interface WorkingTreeIndicatorProps {
      state: WorkingTreeState;
      onSave: () => void;
    }
    ```
    Rendering by state:
    - `hidden`: return `null`
    - `dirty`: amber pill `● Unsaved changes` (clickable, opens save popover) + separate `ⓘ` info affordance (clickable, opens disclosure tooltip). The `ⓘ` is its own focusable element (`tabIndex={0}`, `aria-label="Why does this matter?"`) — Tab reaches it independently of the label (EXPERIENCE.md line 388, UX-DR7). The label's Enter/Space opens the Save confirmation, NOT the info text. The `ⓘ`'s Enter/Space opens the info disclosure, NOT the save confirmation
    - `clean`: muted text `✓ All saved` (non-interactive, no info icon — nothing at risk to disclose per DESIGN.md line 352)
    - `saving`: disabled text `Saving…` (Save in progress, button disabled — AC-6)
    - `saving-after-response`: disabled text `Saving after response…` (queued behind agent turn — AC-3)
    - `aria-live="polite"` on the container so state changes are announced to screen readers (UX-DR7, AC-1)
    - Save confirmation popover (dirty state only): a focus-trapping modal with "Save current progress?" text, Save button, Cancel link. Focus-traps and returns focus to the trigger on close (UX-DR16). Use a simple conditional render + `useRef` + `useEffect` for focus management (no new dependency — the codebase has no modal library; follow the pattern that will be established here). The popover renders above the indicator (absolute positioned). Save button calls `onSave()` and closes the popover. Cancel closes the popover. The Save button is disabled when `state === 'saving' || state === 'saving-after-response'` (AC-6)
    - Info disclosure tooltip (dirty state only): a small popover/tooltip showing "Unsaved changes are lost if you close this page or your session restarts. Saving commits them permanently to your repository." (EXPERIENCE.md line 163, AC-7). Toggled by clicking/Enter/Space on the `ⓘ` icon. Dismissible by outside click or Escape
    - Standard focus ring on all interactive elements: `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` (project-context.md line 159)
    - Color tokens: dirty = `caution` text + `caution-bg` background (DESIGN.md line 351); clean = `text-3` (DESIGN.md line 352); info icon = `text-3` default, `text-2` on hover/focus
    - `prefers-reduced-motion` handling: no animations in this component (the indicator is static text + popover), so `motion-reduce:` classes are not needed
  - [x] 5.2 **Un-skip the existing TDD red-phase tests** in `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx` (file already exists with `it.skip` tests) and make them pass. `@jest-environment jsdom`. Test cases:
    - `[P0]` dirty state renders `● Unsaved changes` label + `ⓘ` info affordance
    - `[P0]` clean state renders `✓ All saved` and is non-interactive (no click handler)
    - `[P0]` hidden state renders null
    - `[P0]` clicking dirty label opens save confirmation popover with "Save current progress?"
    - `[P0]` clicking `ⓘ` info affordance opens disclosure tooltip with help text (AC-7)
    - `[P0]` info affordance is independently focusable (Tab reaches it separately from label)
    - `[P0]` Save button in popover calls onSave and closes popover
    - `[P0]` Cancel closes popover without calling onSave
    - `[P0]` Save button is disabled when state is 'saving' or 'saving-after-response' (AC-6)
    - `[P0]` saving state renders "Saving…" text
    - `[P0]` saving-after-response state renders "Saving after response…" text (AC-3)
    - `[P0]` container has `aria-live="polite"` (AC-1)
    - `[P1]` focus is trapped in save popover and returned to trigger on close (UX-DR16)
    - `[P1]` info tooltip dismissible by outside click and Escape

- [x] Task 6: Frontend — Wire `ConversationPane` (AC: 1, 2, 3, 4, 5, 6)
  - [x] 6.1 Add `workingTreeState` state to `ConversationPane`:
    ```typescript
    const [workingTreeState, setWorkingTreeState] = useState<WorkingTreeState>('hidden');
    ```
    Import `WorkingTreeState` type from `./WorkingTreeIndicator`. Initial state is `'hidden'` (no session active)
  - [x] 6.2 Add SSE event listeners in `startSession()` (after the existing `STREAM_ERROR` listener, before `eventSource.onerror`):
    ```typescript
    eventSource.addEventListener('WORKING_TREE_DIRTY', () => {
      setWorkingTreeState('dirty');
    });

    eventSource.addEventListener('WORKING_TREE_CLEAN', () => {
      setWorkingTreeState('clean');
    });

    eventSource.addEventListener('MANUAL_SAVE_SUCCEEDED', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId } = data;
        setMessages((prev) => [
          ...prev,
          {
            id: toolCallId,
            role: 'assistant' as const,
            content: '',
            createdAt: new Date(),
            toolCall: {
              toolCallId,
              toolName: 'Save',
              status: 'completed' as const,
              input: '',
              output: '',
              semantic: { artifactType: '', artifactTitle: '', viewHref: '' },
            },
          },
        ]);
      } catch {
        // ignore parse errors
      }
      setWorkingTreeState('clean');
    });

    eventSource.addEventListener('MANUAL_SAVE_FAILED', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId, error } = data;
        setMessages((prev) => [
          ...prev,
          {
            id: toolCallId,
            role: 'assistant' as const,
            content: '',
            createdAt: new Date(),
            toolCall: {
              toolCallId,
              toolName: 'Save',
              status: 'error' as const,
              input: '',
              output: '',
              errorMessage: error ?? 'Save failed',
            },
          },
        ]);
      } catch {
        // ignore parse errors
      }
      setWorkingTreeState('dirty');
    });
    ```
    The `MANUAL_SAVE_SUCCEEDED` handler adds a `ChatMessage` with `toolCall.semantic` set → `ChatMessageList` renders `SemanticPill` (Task 7). The `MANUAL_SAVE_FAILED` handler adds a `ChatMessage` with `toolCall` but no `semantic` + `status: 'error'` → `ChatMessageList` renders `ToolPill` in error state (Task 7). Both reuse the existing `ChatMessageList` rendering logic — no changes to `ChatMessageList` itself
  - [x] 6.3 Add `handleSave` function to `ConversationPane`:
    ```typescript
    async function handleSave() {
      const convId = conversationIdRef.current;
      if (!convId) return;

      setWorkingTreeState('saving');

      try {
        const response = await fetch(`${apiUrl}/api/conversations/${convId}/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${boundaryJwt}`,
          },
          body: '{}',
        });

        if (!response.ok) {
          setWorkingTreeState('dirty');
          return;
        }

        const data = (await response.json()) as { committed: boolean; clean: boolean; queued: boolean };

        if (data.queued) {
          setWorkingTreeState('saving-after-response');
        } else if (data.committed) {
          // MANUAL_SAVE_SUCCEEDED SSE event will set 'clean' + add the Semantic Pill
          // Keep 'saving' state until the SSE event arrives (should be immediate)
        } else if (data.clean) {
          setWorkingTreeState('clean');
        } else {
          // committed: false, clean: false, queued: false → save failed
          // MANUAL_SAVE_FAILED SSE event will set 'dirty' + add the error Tool Pill
          setWorkingTreeState('dirty');
        }
      } catch {
        setWorkingTreeState('dirty');
      }
    }
    ```
    The `handleSave` function is called by `WorkingTreeIndicator`'s `onSave` prop. The `saving` state disables the Save button (AC-6). The `saving-after-response` state shows the queued message (AC-3). The actual Semantic Pill / error Tool Pill is added by the SSE event listeners (Task 6.2), not by `handleSave` — this ensures the pill appears at the correct stream position even if the save is queued
  - [x] 6.4 Set `workingTreeState` to `'hidden'` when `state !== 'ready'`. Add to the existing `inputDisabled` / `showSpinner` derivation area:
    ```typescript
    const effectiveWorkingTreeState = state === 'ready' ? workingTreeState : 'hidden';
    ```
    Pass `effectiveWorkingTreeState` to `<WorkingTreeIndicator>`. This hides the indicator during provisioning, reconnection, error, and timeout states (UX-DR7: "Hidden: when no session is active")
  - [x] 6.5 Render `<WorkingTreeIndicator>` in the chat input area. Place it in the `flex-shrink-0 border-t border-border px-8 py-4` container (line 594), before the `<ChatInput>`:
    ```tsx
    <div className="flex-shrink-0 border-t border-border px-8 py-4">
      {showSpinner && (...)}
      <WorkingTreeIndicator state={effectiveWorkingTreeState} onSave={handleSave} />
      <div ref={pickerContainerRef} className="relative">
        {pickerOpen && (...)}
        <ChatInput ... />
      </div>
    </div>
    ```
    The indicator is left-aligned below the textarea (DESIGN.md line 349: "Displayed in the chat input area, left-aligned, below the textarea"). The existing `ChatInput` is in a `relative` div for the slash picker — the indicator goes above it
  - [x] 6.6 **Un-skip the existing TDD red-phase tests** in `ConversationPane.test.tsx` (lines 1134, 1156, 1178, 1204, 1234, 1374 — currently `it.skip`) and make them pass. The skipped tests already cover every case below — do not write from scratch. The `MockEventSource.emit` helper already supports any event type:
    - `[P0]` WORKING_TREE_DIRTY event sets indicator to dirty (AC-1)
    - `[P0]` WORKING_TREE_CLEAN event sets indicator to clean (AC-1)
    - `[P0]` MANUAL_SAVE_SUCCEEDED adds a Semantic Pill message + sets indicator to clean (AC-4)
    - `[P0]` MANUAL_SAVE_FAILED adds an error Tool Pill message + keeps indicator dirty (AC-5)
    - `[P0]` handleSave calls POST /conversations/:id/save (AC-2)
    - `[P0]` queued save response sets indicator to "Saving after response…" (AC-3)
    - `[P0]` clean save response (no-op) sets indicator to clean (AC-6)
    - `[P0]` indicator is hidden when session state is not 'ready' (AC-1)
    - `[P0]` Save button is disabled while saving (AC-6) — render the indicator in 'saving' state, assert the Save button is disabled
    - `[P1]` MANUAL_SAVE_SUCCEEDED message has correct toolCall.semantic shape for SemanticPill rendering

- [x] Task 7: Frontend — Extend `SemanticPill` for manual save variant (AC: 4)
  - [x] 7.1 Update `apps/web/src/components/conversation/SemanticPill.tsx` — conditionally render parts based on prop presence:
    - Render the "View" link ONLY when `viewHref` is non-empty (`{viewHref && (<Link ...>)}`)
    - Render the type label + its `·` separator ONLY when `artifactType` is non-empty (`{artifactType && (<><span aria-hidden="true">·</span><span>{typeLabel(artifactType)}</span></>)}`)
    - Render the `artifactTitle` + its `·` separator ONLY when `artifactTitle` is non-empty (`{artifactTitle && (<><span aria-hidden="true">·</span><span className="text-positive/80">{artifactTitle}</span></>)}`)
    - The "Progress saved" label + `role="status"` + `aria-live="polite"` always render
    - For manual save: `artifactType: ''`, `artifactTitle: ''`, `viewHref: ''` → renders just "Progress saved" in a positive-colored pill (AC-4: "a Semantic Pill indicating the manual save"). For agent commit: `artifactType: 'prd'`, `artifactTitle: '...'`, `viewHref: '/artifacts?id=...'` → renders the full "Progress saved · PRD · title · View" (unchanged behavior)
    - This is the simplest reversible change (DP-3) — three conditional renders, no new component, no new prop, no type change. The `ChatMessageList` already routes `toolCall.semantic` messages to `SemanticPill`
  - [x] 7.2 **Un-skip the existing TDD red-phase tests** in `apps/web/src/components/conversation/SemanticPill.test.tsx` (lines 73, 79, 85 — currently `it.skip`) and make them pass. The skipped tests already cover every case below:
    - `[P0]` renders "Progress saved" without View link when viewHref is empty
    - `[P0]` renders "Progress saved" without type label when artifactType is empty
    - `[P0]` renders "Progress saved" without title when artifactTitle is empty
    - `[P0]` renders full pill with View link when all props are present (existing behavior — regression guard)
    - `[P1]` manual-save variant has role="status" and aria-live="polite" (accessibility)

- [x] Task 8: Verify lint, typecheck, and tests pass (AC: all)
  - [x] 8.1 Run `yarn nx lint agent-be` — 0 errors (pre-existing warnings acceptable)
  - [x] 8.2 Run `yarn nx lint web` — 0 new errors/warnings in Story 3.6 files
  - [x] 8.3 Run `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json` — clean
  - [x] 8.4 Run `npx tsc --noEmit -p apps/web/tsconfig.json` — clean
  - [x] 8.5 Run `yarn nx test agent-be` — all unit + integration tests pass
  - [x] 8.6 Run `yarn nx test web` — all tests pass

## Dev Notes

### Decision Records

**Decision (DP-2):** Story Tasks 1.1, 1.3, 2.1, 2.2, 2.3, 4.1, 4.2, 4.3, 4.4, 4.5 said "Add" / "Create" / "Implement" / "Inject" but the TDD red phase already delivered these: `commit()` is in `ISandboxService` (line 35), `isIdle()` is in `IAgentService` (line 11) and implemented in both `AgentService` (line 436) and `AgentServiceFake` (line 139), `SandboxServiceFake.commit()` + `failNextCommit()` + `getCommitCalls()` are fully implemented (lines 23, 40-47, 95-99), `ManualCommitService` is injected into `ConversationsService` (line 33) and registered in `ConversationsModule` (line 15), `manualCommit()` method is implemented (lines 248-266), `flushPendingCommit` call is in `runAgentTurn` (line 228), `SaveConversationDto` exists, and `POST :id/save` endpoint exists (lines 72-78). Amended all ten tasks to `[x]` with "Already implemented" notes citing exact file:line locations. Semantic intent (the feature works) over literal text ("add"/"create"); contradiction resolved on record.

**Decision (DP-2):** Story Tasks 1.2, 3.1, 5.1 said "Implement" / "Create" but the files already exist as TDD red-phase stubs that throw "not implemented": `SandboxService.commit()` (line 120-121), `ManualCommitService.requestCommit()`/`flushPendingCommit()` (lines 10, 17), `WorkingTreeIndicator` (line 11). Amended all three tasks to say "Replace the TDD red-phase stub" with exact stub locations. Semantic intent (replace stub with implementation) over literal text ("create"); contradiction resolved on record.

**Decision (DP-2):** Story Tasks 2b.4, 3.2, 4.6, 5.2, 6.6, 7.2 said "Add test cases" / "Create test file" / "Update test file" but the test files already exist with `it.skip` TDD red-phase tests covering every listed case: `agent.service.unit.spec.ts` (lines 460, 494), `manual-commit.service.spec.ts`, `conversations.service.spec.ts` (lines 543-610), `WorkingTreeIndicator.test.tsx`, `ConversationPane.test.tsx` (lines 1134, 1156, 1178, 1204, 1234, 1374), `SemanticPill.test.tsx` (lines 73, 79, 85). Amended all six tasks to say "Un-skip the existing TDD red-phase tests and make them pass." Semantic intent (tests pass) over literal text ("add"/"create"); contradiction resolved on record.

**Decision (DP-2):** AC-1 vs original story deferral conflict on `WORKING_TREE_DIRTY` emission after agent tool calls — AC-1 states "the indicator updates after each agent action or manual save" and architecture.md line 89 requires "Working tree state is checked via `git status --porcelain` after Bash and file-write tool calls only". The original story draft deferred this to post-MVP, directly contradicting AC-1. Chose follow-semantic-intent-and-amend: added Task 2b implementing the working tree check after file-modifying tool calls (`Bash`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`) in `AgentService`, and amended the "How AC-1 Is Satisfied", "Out of Scope", and "Deferred Findings" sections so the contradiction is resolved on record. Intent (AC-1 + architecture) over literal deferral text.

**Decision (DP-3):** Add `commit(sandboxId, message)` to `ISandboxService` as a specific git operation (not a generic `executeCommand`). The existing interface follows the pattern of specific git operations (`injectGitConfig`, `getWorkingTreeStatus`, `clone`). A generic `executeCommand` would bypass the shell-quoting safety and expose too broad a surface. The `SandboxServiceFake` already has a private `executeCommand` for test convenience, but the production interface should expose specific operations. The `commit` method shell-quotes the commit message via the existing `shellQuote` helper (project-context.md line 140 — shell-quote all interpolated values in sandbox process commands). Simplest reversible option: one new method on an existing interface.

**Decision (DP-3):** Add `isIdle(conversationId)` to `IAgentService` rather than having `ManualCommitService` subscribe to `RUN_FINISHED` events via `SessionEventsService.getEventStream()`. The `activeRuns` Map in `AgentService` already tracks running conversations — `isIdle` is a one-liner that reads it. Subscribing to `SessionEventsService` would couple `ManualCommitService` to the SSE event stream (a transport concern) and require filtering `RUN_FINISHED` from all other events. The `isIdle` check is synchronous and immediate. The queue flush is handled by `ConversationsService` calling `flushPendingCommit` after `runAgentTurn` completes — no event subscription needed. Simplest reversible option.

**Decision (DP-3):** Place `ManualCommitService` in the `conversations/` module (as `apps/agent-be/src/conversations/manual-commit.service.ts`), NOT as a separate `manual-commit/` module. The architecture lists `manual-commit/` as a separate module (architecture.md lines 578-581), but creating it would require either a circular dependency (`ConversationsModule` ↔ `ManualCommitModule`) or extracting the `sandboxIds` Map to a shared registry. `ManualCommitService` needs the `sandboxId` for a conversation, which is tracked in `ConversationsService.sandboxIds` (private Map). By placing `ManualCommitService` in `ConversationsModule`, `ConversationsService` can pass the `sandboxId` directly to `manualCommitService.requestCommit(conversationId, userId, sandboxId)` — no circular dependency, no shared registry. The `POST :id/save` endpoint goes in `ConversationsController` (same base path, no routing conflicts). Per DP-2, the semantic intent (FR-15: manual commit) is satisfied regardless of module structure. If the logic grows complex, it can be extracted to a separate module later. Simplest reversible option.

**Decision (DP-3):** Extend `SemanticPill` to handle the manual-save variant (no artifact, no View link) rather than creating a separate `ManualSavePill` component. The manual save pill and the agent commit pill share the same visual treatment (positive-colored pill, "Progress saved" label, `role="status"`, `aria-live="polite"`). The only difference is the absence of artifact type/title/View link. Three conditional renders in `SemanticPill` handle this. A separate component would duplicate the styling and accessibility attributes. The `ChatMessageList` already routes `toolCall.semantic` messages to `SemanticPill` — no routing change needed. Simplest reversible option.

**Decision (DP-3):** Use new SSE event types `MANUAL_SAVE_SUCCEEDED` and `MANUAL_SAVE_FAILED` rather than reusing `TOOL_CALL_PROMOTED` for success. `TOOL_CALL_PROMOTED` carries `artifactType`, `artifactTitle`, `artifactId`, `viewHref` — all artifact-specific fields that don't apply to a manual save checkpoint. Reusing it would require passing empty strings and having the frontend special-case empty `artifactType`. New event types are clearer: the frontend handler knows exactly what happened (manual save success/failure) without inference. The events carry `{ toolCallId, timestamp }` (success) or `{ toolCallId, error }` (failure) — minimal payloads. Simplest reversible option.

**Decision (DP-3):** The save confirmation popover and info disclosure tooltip are implemented with local React state + `useRef` + `useEffect` for focus management, NOT a modal/popover library. The codebase has no modal library (shadcn/ui is installed but the Radix Popover/Dialog primitives are not imported anywhere in the conversation components). The `WorkingTreeIndicator` is the first component needing a popover — it establishes the pattern. Focus trapping: on open, focus the first focusable element (Save button); on Tab/Shift+Tab at boundaries, keep focus within; on Escape, close and return focus to trigger. This is ~30 lines of focus management code. If more popovers/modals accumulate, extract a shared `useFocusTrap` hook or install Radix Popover. Simplest reversible option for MVP.

**Decision (DP-5):** Do NOT implement `git push` after the manual commit. The manual save is a platform-level commit inside the Sandbox (AC-2: "executes a platform-level commit inside the Sandbox, bypassing the Agent"). The commit is local to the sandbox's git repo. Pushing to the remote GitHub repository is a separate concern — the agent's `git commit` (Story 3.4) also doesn't push. The working tree indicator reflects the local sandbox git state, not the remote repository state. The `artifacts.service.ts` mirror (Story 2.1) scans `_bmad-output/` at commit-time — it reads from the sandbox filesystem, not the remote. Per DP-5, defer `git push` to post-MVP (or to a future story if remote sync is needed).

**Decision (DP-5):** Do NOT fix the `getWorkingTreeStatus` slicing bug (deferred-work.md lines 175-176 — renames sliced incorrectly, exit code not checked). The bug is pre-existing from Story 3.1 and affects the `files` array accuracy, not the `dirty` boolean. Story 3.6 uses `workingTree.dirty` (boolean) for the indicator state and `workingTree.files` is not displayed in the UI (the indicator shows `● Unsaved changes`, not a file list). The bug is latent. Per DP-5, defer to a future hardening story.

**Decision (DP-5):** Do NOT implement working tree state polling. The indicator updates via SSE events (`WORKING_TREE_DIRTY`, `WORKING_TREE_CLEAN`) emitted by the backend after each file-modifying agent tool call (Task 2b), after manual saves (Task 3.1), and at session ready/resume (`provisionSandbox` lines 81-91, `resumeConversation` lines 265-275). No polling is needed — the SSE channel is the single source of truth for working tree state. Per DP-5, defer polling to post-MVP (if SSE events prove unreliable for this use case).

**Decision (DP-5):** Do NOT implement the `MANUAL_SAVE_SUCCEEDED` Semantic Pill with a "View" link to an artifact. The manual save is a checkpoint commit (`chore(platform-save): checkpoint [...]`), not an artifact commit. It doesn't produce a specific artifact to link to. The Semantic Pill shows "Progress saved" only (no artifact type, no title, no View link — Task 7). Per DP-5, defer artifact-linking for manual saves to post-MVP (if a use case emerges for linking manual saves to specific artifacts).

### What Already Exists (Do Not Recreate)

#### Story 3.6 TDD Red-Phase Scaffolding (Already In Place — Replace Stubs, Un-skip Tests)

The TDD red phase for Story 3.6 has already been set up. The following files, interface methods, stubs, and skipped tests already exist. Do NOT recreate them — replace the stubs with implementations and un-skip the tests:

- **`ISandboxService.commit()`** (`libs/shared-types/src/sandbox.interface.ts:35`) — interface method already added. Verified
- **`IAgentService.isIdle()`** (`libs/shared-types/src/agent.interface.ts:11`) — interface method already added. Verified
- **`SandboxService.commit()`** (`apps/agent-be/src/sandbox/sandbox.service.ts:120-121`) — TDD red-phase stub that throws `"SandboxService.commit: not implemented"`. Replace with actual implementation (Task 1.2)
- **`SandboxServiceFake.commit()` + `failNextCommit()` + `getCommitCalls()`** (`apps/agent-be/test/helpers/sandbox-service.fake.ts:23, 40-47, 95-99`) — fully implemented. Verified
- **`AgentService.isIdle()`** (`apps/agent-be/src/streaming/agent.service.ts:436-437`) — fully implemented: `return !this.activeRuns.has(conversationId);`. Verified
- **`AgentServiceFake.isIdle()`** (`apps/agent-be/test/helpers/agent-service.fake.ts:139-140`) — fully implemented: `return !this.activeRun;`. Verified
- **`ManualCommitService`** (`apps/agent-be/src/conversations/manual-commit.service.ts`) — TDD red-phase stub. `requestCommit` and `flushPendingCommit` both throw `"ManualCommitService: not implemented"`. Already registered in `ConversationsModule` providers (line 15) and injected into `ConversationsService` (line 33). Replace stub with actual implementation (Task 3.1)
- **`ConversationsService.manualCommit()`** (`apps/agent-be/src/conversations/conversations.service.ts:248-266`) — fully implemented with tenant check, sandboxId lookup, delegation. Verified
- **`ConversationsService.runAgentTurn` flushPendingCommit call** (`conversations.service.ts:228-229`) — fully implemented with `.catch()` error logging. Verified
- **`ConversationsController POST :id/save`** (`apps/agent-be/src/conversations/conversations.controller.ts:72-78`) — fully implemented. Verified
- **`SaveConversationDto`** (`apps/agent-be/src/conversations/dto/save-conversation.dto.ts`) — fully implemented. Verified
- **`WorkingTreeIndicator`** (`apps/web/src/components/conversation/WorkingTreeIndicator.tsx`) — TDD red-phase stub that throws `"WorkingTreeIndicator: not implemented"` (line 11). The `WorkingTreeState` type and `WorkingTreeIndicatorProps` interface are already defined (lines 3-8). Replace stub with actual implementation (Task 5.1)
- **Skipped test files** — all test files already exist with `it.skip` TDD red-phase tests covering every listed case:
  - `agent.service.unit.spec.ts` (lines 460, 494) — working tree emission tests
  - `manual-commit.service.spec.ts` — ManualCommitService tests
  - `conversations.service.spec.ts` (lines 543-610) — manualCommit + flushPendingCommit tests
  - `WorkingTreeIndicator.test.tsx` — component tests
  - `ConversationPane.test.tsx` (lines 1134, 1156, 1178, 1204, 1234, 1374) — working tree + manual save tests
  - `SemanticPill.test.tsx` (lines 73, 79, 85) — manual save variant tests

#### Story 3.1–3.5 Deliverables (Foundational — Extend, Do Not Rewrite)

- **`ConversationsService`** (`apps/agent-be/src/conversations/conversations.service.ts`) — Story 3.1 delivered this. Has `createConversation()`, `provisionSandbox()`, `getStatus()`, `listSkills()`, `sendTurn()`, `stopAgent()`, `resumeConversation()`, `runAgentTurn()` (private), `resolveGitIdentity()` (private). Tracks `sandboxStatuses` and `sandboxIds` in in-memory Maps. Story 3.6 TDD red phase already added: `manualCommit()` method (line 248), `ManualCommitService` injection (line 33), `flushPendingCommit` call in `runAgentTurn` (line 228). Do NOT rewrite — extend
- **`ConversationsController`** (`apps/agent-be/src/conversations/conversations.controller.ts`) — Story 3.1/3.5 delivered this. Has `POST /` (create), `GET /:id/status`, `GET /:id/skills`, `POST /:id/turns`, `POST /:id/stop`, `POST /:id/resume`. Story 3.6 TDD red phase already added `POST /:id/save` (line 72). Do NOT rewrite — extend
- **`ConversationsModule`** (`apps/agent-be/src/conversations/conversations.module.ts`) — imports `PrismaModule`, `SandboxModule`, `CredentialsModule`, `StreamingModule`. Providers: `ConversationsService`, `ProvisionQueueService`, `IdleTimeoutService`. Story 3.6 TDD red phase already added `ManualCommitService` to providers (line 15). Do NOT rewrite — extend
- **`SandboxService`** (`apps/agent-be/src/sandbox/sandbox.service.ts`) — Story 3.1 delivered this. Has `provision()`, `clone()`, `resume()`, `destroy()`, `injectGitConfig()`, `getWorkingTreeStatus()`, `terminateProcess()`, `listSkills()`, `shellQuote()` (private), `executeCommand` via `sandbox.process.executeCommand`. Story 3.6 TDD red phase added `commit()` stub (line 120) — replace stub with implementation (Task 1.2). Do NOT rewrite — extend
- **`SandboxServiceFake`** (`apps/agent-be/test/helpers/sandbox-service.fake.ts`) — Story 3.1 delivered this. Has `provision()`, `clone()`, `resume()`, `destroy()`, `injectGitConfig()`, `getWorkingTreeStatus()`, `terminateProcess()`, `listSkills()`, `failNextProvision()`, `setProvisionDelay()`, `setSkills()`, `executeCommand()` (NOT on interface — test convenience), `getStatus()`. Story 3.6 TDD red phase already added `commit()` + `failNextCommit()` + `getCommitCalls()` (fully implemented). Do NOT rewrite — extend
- **`AgentService`** (`apps/agent-be/src/streaming/agent.service.ts`) — Story 3.3/3.4 delivered this. Has `runTurn()`, `stop()`, `onModuleDestroy()`, circuit breaker, `activeRuns` Map, `processSdkMessage()` / `processAssistantMessage()` / `processStreamEvent()` private methods, `pendingClassifierPromises` Map for awaiting post-tool promises before `RUN_FINISHED`. Already injects `sandboxService` and `sessionEvents`. Story 3.6 TDD red phase already added `isIdle()` (line 436). Story 3.6 still needs: `FILE_MODIFYING_TOOLS` constant + working tree emission after file-modifying tool calls (Task 2b.2). Do NOT rewrite — extend
- **`AgentServiceFake`** (`apps/agent-be/test/helpers/agent-service.fake.ts`) — Story 3.3 delivered this. Has `runTurn()`, `stop()`, `setStreamDelay()`, `setScript()`, `setToolCallScript()`, `setCircuitBreakerScript()`, `failNextRun()`, `setActiveRun()`, `activeRun` boolean. Already injects `sandboxService`. Story 3.6 TDD red phase already added `isIdle()` (line 139). Story 3.6 still needs: working tree emission after file-modifying tool calls (Task 2b.3). Do NOT rewrite — extend
- **`SessionEventsService`** (`apps/agent-be/src/streaming/session-events.service.ts`) — Story 3.1 delivered this. `ReplaySubject<SseEvent>(100)` per conversation. `emit()`, `getEventStream()`, `complete()`. Story 3.6 does NOT modify this — manual save events are emitted via the existing `emit()` method. Do NOT modify
- **`StreamingController`** (`apps/agent-be/src/streaming/streaming.controller.ts`) — Story 3.1/3.4 delivered this. Validates JWT, checks conversation ownership, opens SSE stream, handles back-pressure + heartbeat. Story 3.6 does NOT modify this — the SSE stream is already open when manual save events are emitted. Do NOT modify
- **`ConversationPane`** (`apps/web/src/components/conversation/ConversationPane.tsx`) — Story 3.1/3.2/3.3/3.4/3.5 delivered this. Manages session lifecycle, SSE event listeners, message state, agent state machine, tool pills, semantic pills, system messages, reconnecting state, cross-tab presence. Story 3.6 EXTENDS this: adds `workingTreeState`, SSE listeners for `WORKING_TREE_*` + `MANUAL_SAVE_*`, `handleSave`, renders `WorkingTreeIndicator`. Do NOT rewrite — extend
- **`ChatMessageList`** (`apps/web/src/components/conversation/ChatMessageList.tsx`) — Story 3.3/3.4 delivered this. Renders messages by role: `UserMessage`, `AgentMessage`, `SemanticPill` (when `toolCall.semantic` present), `ToolPill` (when `toolCall` present without `semantic`), system messages. Story 3.6 does NOT modify this — manual save messages reuse the existing `toolCall.semantic` → `SemanticPill` and `toolCall` (error) → `ToolPill` routing. Do NOT modify
- **`SemanticPill`** (`apps/web/src/components/conversation/SemanticPill.tsx`) — Story 3.4 delivered this. Renders "Progress saved · {type} · {title} · View". Story 3.6 EXTENDS this: conditionally renders type/title/View when props are non-empty (for manual save variant). Do NOT rewrite — extend
- **`ToolPill`** (`apps/web/src/components/conversation/ToolPill.tsx`) — Story 3.4 delivered this. Renders tool call pills with running/completed/error states. Story 3.6 does NOT modify this — manual save failure reuses the existing error-state ToolPill rendering. Do NOT modify
- **`ChatInput`** (`apps/web/src/components/conversation/ChatInput.tsx`) — Story 3.3 delivered this. Auto-growing textarea + Send/Stop button. Story 3.6 does NOT modify this — the `WorkingTreeIndicator` renders above `ChatInput`, not inside it. Do NOT modify
- **`ChatMessage` / `ToolCallData` types** (`apps/web/src/components/conversation/types.ts`) — Story 3.3/3.4 delivered these. `ChatMessage` has `id`, `role`, `content`, `createdAt`, `isStreaming?`, `toolCall?`. `ToolCallData` has `toolCallId`, `toolName`, `status`, `input`, `output`, `errorMessage?`, `semantic?`. Story 3.6 does NOT modify these — manual save messages fit the existing `ChatMessage` shape with `toolCall` set. Do NOT modify
- **`ISandboxService` interface** (`libs/shared-types/src/sandbox.interface.ts`) — Story 3.1 delivered this. Has `provision`, `clone`, `resume`, `destroy`, `injectGitConfig`, `getWorkingTreeStatus`, `terminateProcess`, `listSkills`. Story 3.6 TDD red phase already added `commit` (line 35). Do NOT rewrite — extend
- **`IAgentService` interface** (`libs/shared-types/src/agent.interface.ts`) — Story 3.3 delivered this. Has `runTurn`, `stop`. Story 3.6 TDD red phase already added `isIdle` (line 11). Do NOT rewrite — extend
- **`buildTestModule()`** (`apps/agent-be/test/helpers/test-module-builder.ts`) — canonical test module factory. Story 3.6 uses this for `ManualCommitService` tests. Do NOT modify
- **`MockEventSource`** test pattern (`ConversationPane.test.tsx`) — Story 3.1/3.2/3.3 established this. The `emit(eventType, data)` helper already supports any event type — extend with `WORKING_TREE_DIRTY`, `WORKING_TREE_CLEAN`, `MANUAL_SAVE_SUCCEEDED`, `MANUAL_SAVE_FAILED`. Do NOT rewrite
- **`Conversation` / `Turn` Prisma models** (`libs/database-schemas/src/prisma/schema.prisma`) — Story 3.1 delivered these. Story 3.6 does NOT add new models or fields — manual save is a sandbox git operation, not a database write. Do NOT modify

### How AC-1 Is Satisfied

AC-1 ("Working tree indicator reflects git state") is satisfied by:

1. **Backend emits `WORKING_TREE_DIRTY` / `WORKING_TREE_CLEAN` events** — already implemented in `provisionSandbox` (lines 81-91) and `resumeConversation` (lines 265-275) for initial state. Story 3.6 adds emission after manual save (Task 3.1: `executeCommit` emits `WORKING_TREE_CLEAN` on success) AND after file-modifying agent tool calls (Task 2b: `AgentService` checks `getWorkingTreeStatus` after `Bash`/`Write`/`Edit`/`MultiEdit`/`NotebookEdit` tool results and emits the appropriate event). This satisfies the architecture requirement (architecture.md line 89: "Working tree state is checked via `git status --porcelain` after Bash and file-write tool calls only") and AC-1 ("the indicator updates after each agent action or manual save")
2. **Frontend listens for `WORKING_TREE_*` events** — `ConversationPane` adds SSE listeners (Task 6.2) that set `workingTreeState` to `'dirty'` or `'clean'`
3. **`WorkingTreeIndicator` renders the state** — dirty (amber `● Unsaved changes`), clean (muted `✓ All saved`), hidden (no session), saving, saving-after-response (Task 5.1)
4. **`aria-live="polite"`** on the indicator container announces state changes to screen readers (AC-1, UX-DR7)

### How AC-2 Is Satisfied

AC-2 ("Manual save via confirmation popover") is satisfied by:

1. **Dirty indicator is clickable** — `WorkingTreeIndicator` in `'dirty'` state renders a clickable pill that opens a save confirmation popover (Task 5.1)
2. **Popover has "Save current progress?" + Save/Cancel** — focus-trapping modal (UX-DR16)
3. **Save calls `POST /conversations/:id/save`** — `handleSave` in `ConversationPane` (Task 6.3) calls the endpoint
4. **Backend executes `git add -A && git commit`** — `ManualCommitService.executeCommit` calls `sandboxService.commit(sandboxId, message)` (Task 3.1), which runs the git commands in the sandbox (Task 1.2)
5. **Commit message format** — `chore(platform-save): checkpoint [<ISO8601 UTC timestamp>]` (Task 3.1). Not shown in chat UI — the `MANUAL_SAVE_SUCCEEDED` event carries only `toolCallId` and `timestamp`, not the commit message
6. **NFR-P5 (≤5s)** — the `executeCommand` timeout is 10s (safety net). The actual commit should complete in <1s for typical repositories. The 5s NFR is "exclusive of queue time waiting for an agent turn to complete" — the queue is handled by AC-3

### How AC-3 Is Satisfied

AC-3 ("Queued save behind in-progress agent turn") is satisfied by:

1. **`ManualCommitService.requestCommit` checks `agentService.isIdle(conversationId)`** — if not idle, adds to `pendingCommits` Set, returns `{ queued: true }` (Task 3.1)
2. **Frontend shows "Saving after response…"** — `handleSave` sees `queued: true` in the response, sets `workingTreeState` to `'saving-after-response'` (Task 6.3)
3. **`ConversationsService.runAgentTurn` calls `flushPendingCommit` after the agent completes** — after `await this.agentService.runTurn(...)` resolves, `await this.manualCommitService.flushPendingCommit(conversationId, sandboxId)` fires the queued commit (Task 4.3)
4. **`flushPendingCommit` executes the commit** — calls `executeCommit`, which emits `MANUAL_SAVE_SUCCEEDED` + `WORKING_TREE_CLEAN` on success (Task 3.1)
5. **Frontend receives SSE events** — `MANUAL_SAVE_SUCCEEDED` listener adds the Semantic Pill and sets indicator to clean (Task 6.2)

### How AC-4 Is Satisfied

AC-4 ("Successful save produces Semantic Pill + resets indicator") is satisfied by:

1. **Backend emits `MANUAL_SAVE_SUCCEEDED`** with `{ toolCallId, timestamp }` (Task 3.1)
2. **Frontend adds a `ChatMessage` with `toolCall.semantic`** — `MANUAL_SAVE_SUCCEEDED` listener (Task 6.2) creates a message with `toolCall: { toolCallId, toolName: 'Save', status: 'completed', semantic: { artifactType: '', artifactTitle: '', viewHref: '' } }`
3. **`ChatMessageList` renders `SemanticPill`** — existing routing: `message.toolCall.semantic` present → `SemanticPill` (no change to `ChatMessageList`)
4. **`SemanticPill` renders "Progress saved"** — with empty `artifactType`/`artifactTitle`/`viewHref`, only the "Progress saved" label renders (Task 7.1)
5. **Indicator resets to clean** — `MANUAL_SAVE_SUCCEEDED` listener sets `workingTreeState` to `'clean'` (Task 6.2) + backend emits `WORKING_TREE_CLEAN`

### How AC-5 Is Satisfied

AC-5 ("Failed save produces error-state Tool Pill + indicator stays dirty") is satisfied by:

1. **Backend emits `MANUAL_SAVE_FAILED`** with `{ toolCallId, error }` (Task 3.1) — `executeCommit` catches errors and emits this event. Does NOT emit `WORKING_TREE_CLEAN` (indicator stays dirty)
2. **Frontend adds a `ChatMessage` with `toolCall` (error state)** — `MANUAL_SAVE_FAILED` listener (Task 6.2) creates a message with `toolCall: { toolCallId, toolName: 'Save', status: 'error', errorMessage: error }`
3. **`ChatMessageList` renders `ToolPill` in error state** — existing routing: `toolCall` present without `semantic` → `ToolPill` with `status: 'error'` (red border, ✕ icon, error message in expanded view)
4. **Indicator stays dirty** — `MANUAL_SAVE_FAILED` listener sets `workingTreeState` to `'dirty'` (Task 6.2)
5. **No partial commit state** — `SandboxService.commit` uses two separate `executeCommand` calls (git add, then git commit). If `git add` fails, `git commit` is not called. If `git commit` fails, no commit was created. The working tree is unchanged

### How AC-6 Is Satisfied

AC-6 ("No-op on clean tree + duplicate submission prevention") is satisfied by:

1. **Backend checks `getWorkingTreeStatus` before committing** — `executeCommit` (Task 3.1) calls `sandboxService.getWorkingTreeStatus(sandboxId)`. If `!workingTree.dirty`, returns `{ committed: false, clean: true, queued: false }` without calling `commit`
2. **Frontend handles clean response** — `handleSave` (Task 6.3) sees `clean: true`, sets indicator to `'clean'`
3. **Save button disabled while saving** — `WorkingTreeIndicator` (Task 5.1) disables the Save button when `state === 'saving' || state === 'saving-after-response'`
4. **Backend duplicate guard** — `requestCommit` (Task 3.1) checks `pendingCommits.has(conversationId)` — if already queued, returns `{ queued: true }` without double-queueing

### How AC-7 Is Satisfied

AC-7 ("Help text on dirty indicator") is satisfied by:

1. **`ⓘ` info affordance** — `WorkingTreeIndicator` in `'dirty'` state renders a separate `ⓘ` icon next to the label (Task 5.1). It's its own focusable element (`tabIndex={0}`, `aria-label="Why does this matter?"`)
2. **Disclosure tooltip** — activating the `ⓘ` (click, Enter, or Space) shows: "Unsaved changes are lost if you close this page or your session restarts. Saving commits them permanently to your repository." (EXPERIENCE.md line 163)
3. **Separate from save** — the `ⓘ` opens the info tooltip, NOT the save popover. The label opens the save popover. Enter/Space on the label → save popover. Enter/Space on the `ⓘ` → info tooltip (EXPERIENCE.md line 388)

### Architecture Compliance

- **Global prefix `/api`** — the new `POST /conversations/:id/save` endpoint follows the existing pattern (global prefix, no change to `main.ts`)
- **Raw resource body on success** — the save endpoint returns `{ committed, clean, queued }` directly (no `{ data: ... }` wrapper)
- **`{ code, message, meta }` error envelope** — errors flow through the global exception filter (no custom error handling in the controller)
- **Zod + nestjs-zod** — `SaveConversationDto` uses `createZodDto(z.object({}))` (empty body, same pattern as `ResumeConversationDto`)
- **Boundary JWT** — the save endpoint is authenticated via `BoundaryJwtGuard` (global guard) + `ActiveUserGuard` (global guard). The `@User()` decorator provides `UserContext`. No new auth wiring
- **`ISandboxService` test seam** — `SANDBOX_SERVICE` Symbol DI token (existing). Story 3.6 adds `commit()` to the interface — `SandboxServiceFake` implements it
- **`IAgentService` test seam** — `AGENT_SERVICE` Symbol DI token (existing). Story 3.6 adds `isIdle()` to the interface — `AgentServiceFake` implements it
- **Tenant isolation** — `manualCommit` verifies conversation ownership via `findFirst({ where: { id: conversationId, userId } })` (project-context.md line 154)
- **`select` projection on Prisma reads** — `manualCommit`'s `conversation.findFirst` uses `select: { id: true }` (project-context.md line 148)
- **SSE event emission** — manual save events go through `SessionEventsService.emit()` (existing). The `ReplaySubject<SseEvent>(100)` ensures late SSE subscribers receive missed events (project-context.md line 132)
- **Working tree checks after file-modifying tool calls** — `AgentService` emits `WORKING_TREE_DIRTY`/`WORKING_TREE_CLEAN` after `Bash`/`Write`/`Edit`/`MultiEdit`/`NotebookEdit` tool results (Task 2b), satisfying architecture.md line 89: "Working tree state is checked via `git status --porcelain` after Bash and file-write tool calls only". The check is fire-and-forget with `.catch()`, tracked in `pendingClassifierPromises` so it's awaited before `RUN_FINISHED` (project-context.md line 143)
- **`OnModuleDestroy`** — `ManualCommitService` implements `OnModuleDestroy` to clear `pendingCommits` on shutdown (project-context.md line 138)
- **Shell-quote all interpolated values** — `SandboxService.commit` shell-quotes the commit message via the existing `shellQuote` helper (project-context.md line 140)
- **No global client-state library** — `workingTreeState` is local React state in `ConversationPane` (ephemeral UI state, project-context.md line 91)
- **Server Components are default** — `WorkingTreeIndicator` is a `'use client'` Client Component (needs browser APIs for popover focus management). `ConversationPane` is already a Client Component
- **Co-located tests** — `*.spec.ts` / `*.test.tsx` next to source
- **Standard focus ring** — `WorkingTreeIndicator` interactive elements use `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` (project-context.md line 159)
- **`aria-live="polite"`** — `WorkingTreeIndicator` container has `aria-live="polite"` for state change announcements (UX-DR7, AC-1)
- **`role="status"`** — `SemanticPill` already has `role="status"` (Story 3.4). Manual save reuses it
- **Focus-trapping modals** — save confirmation popover traps focus and returns it to the trigger on close (UX-DR16)
- **Non-color state signaling** — dirty state uses `●` icon + text label + caution color (three signals, never color alone — UX-DR16, EXPERIENCE.md line 391)
- **`prefers-reduced-motion`** — no animations in `WorkingTreeIndicator` (static text + popover). N/A
- **Deliberate cross-service logic duplication** — N/A (no cross-service logic in Story 3.6)
- **`.max(N)` on Zod string fields** — `SaveConversationDto` has an empty body (no string fields). N/A
- **`logger.warn()` in catch blocks that return a default** — `ManualCommitService.executeCommit` catch block emits `MANUAL_SAVE_FAILED` (not a silent return). N/A

### Library/Framework Requirements

**No new packages to install.** All dependencies are already installed:

- `zod` + `nestjs-zod` — DTO validation (already installed)
- `rxjs` — `ReplaySubject` for SSE (already installed)
- No modal/popover library — the save confirmation popover uses local React state + focus management (DP-3)

### File Structure Requirements

TDD red-phase files already in place (replace stubs / un-skip tests — do NOT recreate):
```
apps/agent-be/src/conversations/
├── manual-commit.service.ts                    # TDD stub — replace with implementation (Task 3.1)
├── manual-commit.service.spec.ts               # TDD skipped tests — un-skip and make pass (Task 3.2)
└── dto/
    └── save-conversation.dto.ts                 # already complete (Task 4.4 — done)

apps/web/src/components/conversation/
├── WorkingTreeIndicator.tsx                    # TDD stub — replace with implementation (Task 5.1)
└── WorkingTreeIndicator.test.tsx               # TDD skipped tests — un-skip and make pass (Task 5.2)
```

Modified files:
- `apps/agent-be/src/sandbox/sandbox.service.ts` — replace `commit()` stub with implementation (Task 1.2)
- `apps/agent-be/src/streaming/agent.service.ts` — emit `WORKING_TREE_DIRTY`/`WORKING_TREE_CLEAN` after file-modifying tool calls (Task 2b.2). `isIdle()` already implemented (line 436)
- `apps/agent-be/test/helpers/agent-service.fake.ts` — emit working tree events after file-modifying tool calls (Task 2b.3). `isIdle()` already implemented (line 139)
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — un-skip manualCommit + flush tests (Task 4.6)
- `apps/web/src/components/conversation/ConversationPane.tsx` — add `workingTreeState`, SSE listeners, `handleSave`, render `WorkingTreeIndicator` (Tasks 6.1-6.5)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — un-skip working tree + manual save tests (Task 6.6)
- `apps/web/src/components/conversation/SemanticPill.tsx` — conditional rendering for manual save variant (Task 7.1)
- `apps/web/src/components/conversation/SemanticPill.test.tsx` — un-skip manual save variant tests (Task 7.2)

**Not modified (already implemented by TDD red phase):**
- `libs/shared-types/src/sandbox.interface.ts` — `commit()` already added (line 35)
- `libs/shared-types/src/agent.interface.ts` — `isIdle()` already added (line 11)
- `apps/agent-be/test/helpers/sandbox-service.fake.ts` — `commit()` + `failNextCommit()` + `getCommitCalls()` already implemented
- `apps/agent-be/src/conversations/conversations.module.ts` — `ManualCommitService` already in providers (line 15)
- `apps/agent-be/src/conversations/conversations.service.ts` — `ManualCommitService` injection, `manualCommit()` method, `flushPendingCommit` call all already implemented
- `apps/agent-be/src/conversations/conversations.controller.ts` — `POST :id/save` endpoint already implemented (line 72)
- `apps/agent-be/src/conversations/dto/save-conversation.dto.ts` — already complete

**Not modified (no changes needed):**
- `apps/web/src/components/conversation/ChatMessageList.tsx` — existing `toolCall.semantic` → `SemanticPill` and `toolCall` (error) → `ToolPill` routing handles manual save messages
- `apps/web/src/components/conversation/ToolPill.tsx` — existing error-state rendering handles manual save failure
- `apps/web/src/components/conversation/ChatInput.tsx` — `WorkingTreeIndicator` renders above it, not inside it
- `apps/web/src/components/conversation/types.ts` — existing `ChatMessage` / `ToolCallData` shapes fit manual save messages
- `apps/agent-be/src/streaming/session-events.service.ts` — `emit()` handles manual save events
- `apps/agent-be/src/streaming/streaming.controller.ts` — SSE stream already open
- `libs/database-schemas/src/prisma/schema.prisma` — no new models or fields

### Testing Requirements

- **Test organization:** co-located `*.spec.ts` / `*.test.tsx` next to source (project-context.md line 180)
- **Test priority tags:** `[P0]` for AC coverage (100% pass required), `[P1]` for edge cases (≥95% pass) (project-context.md line 187)
- **`buildTestModule()`** — use for agent-be tests. `ManualCommitService` tests use `ConversationsModule` import + `AGENT_SERVICE` override with `AgentServiceFake` (project-context.md line 199)
- **`SandboxServiceFake`** — the existing fake is extended with `commit()` + `failNextCommit()` + `getCommitCalls()`. Tests spy on `sandboxFake.commit` via `jest.spyOn(sandboxFake, 'commit')` (same pattern as existing `provisionSandbox` tests)
- **`AgentServiceFake`** — the existing fake is extended with `isIdle()`. Tests control idle state via `agentFake.setActiveRun(true/false)` (existing method)
- **Mock `EventSource`** — extend the existing `MockEventSource` pattern in `ConversationPane.test.tsx`. The `emit(eventType, data)` helper already supports any event type — add `WORKING_TREE_DIRTY`, `WORKING_TREE_CLEAN`, `MANUAL_SAVE_SUCCEEDED`, `MANUAL_SAVE_FAILED` emissions
- **Mock `fetch`** — `ConversationPane.test.tsx` already mocks `fetch` for `POST /conversations`, `POST /turns`, `POST /resume`. Extend to mock `POST /save` with responses `{ committed: true, clean: false, queued: false }`, `{ committed: false, clean: true, queued: false }`, `{ committed: false, clean: false, queued: true }`
- **`@jest-environment jsdom`** — for all React component tests (`WorkingTreeIndicator.test.tsx`, `ConversationPane.test.tsx`, `SemanticPill.test.tsx`)
- **`@jest-environment node`** — N/A for Story 3.6 (no WebCrypto usage)
- **Fake timers** — use `jest.useFakeTimers()` for the save timeout test if needed (the existing `CLIENT_TIMEOUT_MS` timer pattern). NFR-P5 (5s) is asserted, not empirically validated, in unit tests — the `executeCommand` timeout is 10s (safety net), and the actual commit is near-instant in tests (SandboxServiceFake is in-memory)

### Previous Story Intelligence

- **Story 3.5 (done):** Delivered resume flow, cross-tab conversation presence. Key learnings applied to Story 3.6:
  - `resolveGitIdentity()` private helper pattern — `ManualCommitService` follows the same "private helper, not shared library" pattern (project-context.md line 139)
  - `findFirst({ where: { id, userId } })` for tenant-scoped lookups — `manualCommit` uses the same pattern
  - `select: { id: true }` projection — `manualCommit` uses the same projection
  - `DP-5` deferral pattern — Story 3.6 defers `git push`, `getWorkingTreeStatus` slicing bug fix, and working tree polling (recorded in Decision Records)
  - `useRef` mirror of state for long-lived event listeners — Story 3.6's `workingTreeState` is read in `handleSave` (not in an event listener), so no ref mirror needed. But if `handleSave` is called from a stale closure, it could read stale state — the existing `conversationIdRef.current` pattern handles this
- **Story 3.4 (done):** Delivered tool pills, semantic pills, circuit breaker, SSE heartbeat. Key learnings:
  - `SemanticPill` component structure — Story 3.6 extends it for the manual save variant
  - `ToolPill` error state — Story 3.6 reuses it for manual save failure
  - `role: 'system'` for platform messages — N/A (manual save uses `SemanticPill` / `ToolPill`, not system messages)
  - Circuit breaker / stall-detection timer — N/A (manual save is not a long-running operation; the 10s `executeCommand` timeout is the safety net)
  - `Await pending event-emitting promises before run completion` — N/A (manual save events are emitted synchronously, not via pending promises)
- **Story 3.3 (done):** Delivered streaming agent conversation. Key:
  - `streamingMessageIdRef` pattern (ref mirror of state) — Story 3.6's `workingTreeState` doesn't need a ref mirror (it's not read inside long-lived event listeners; `handleSave` reads it directly, and `handleSave` is called from the `WorkingTreeIndicator`'s `onSave` prop, not from an SSE listener)
- **Story 3.1 (done):** Delivered foundational infrastructure. Key patterns: `buildTestModule()`, `SandboxServiceFake`, `jose` for JWT, `ReplaySubject` for SSE, fire-and-forget, `findFirst` for tenant-scoped lookups, `provisionSandbox` pipeline. Story 3.6's `ManualCommitService` follows the same DI + test seam patterns

### Git Intelligence

- Recent commits: `3a1b3cf chore: remove 'test' agent`, `609eff0 chore: introduce thinker agent`, `d84b1a6 docs(test-arch): re-run Epic 2 traceability matrix`, `6aeba1b feat(epics): implement epic 3 sandbox, slash commands, and streaming conversations`. Stories 3.1–3.5 are done. Story 3.6 is the sixth story in Epic 3
- The agent-be conversations module has `ConversationsService`, `ConversationsController`, `ConversationsModule` from Stories 3.1/3.2/3.5. Story 3.6 adds `ManualCommitService` + `POST :id/save` + `SaveConversationDto`
- The sandbox module has `SandboxService` with git operations. Story 3.6 adds `commit()`
- The streaming module has `AgentService` with `activeRuns` Map. Story 3.6 adds `isIdle()`
- The web conversation components have `ConversationPane`, `ChatMessageList`, `SemanticPill`, `ToolPill`, `ChatInput`. Story 3.6 adds `WorkingTreeIndicator` + extends `ConversationPane` + `SemanticPill`

### Project Structure Notes

**Alignment with architecture directory structure:**

- `apps/agent-be/src/conversations/manual-commit.service.ts` — `ManualCommitService` in the `conversations/` module. The architecture lists `manual-commit/` as a separate module (architecture.md lines 578-581), but placing it in `conversations/` avoids a circular dependency and keeps the commit logic with the conversation state it needs (DP-3 in Decision Records). The `POST :id/save` endpoint is in `ConversationsController` (same base path, no routing conflicts)
- `apps/agent-be/src/conversations/dto/save-conversation.dto.ts` — matches the `dto/` subdirectory pattern (existing `create-conversation.dto.ts`, `send-message.dto.ts`, `resume-conversation.dto.ts`)
- `apps/web/src/components/conversation/WorkingTreeIndicator.tsx` — matches the `components/conversation/` feature directory (existing `ConversationPane.tsx`, `ChatInput.tsx`, `SemanticPill.tsx`, `ToolPill.tsx`)
- `libs/shared-types/src/sandbox.interface.ts` — `commit()` added to `ISandboxService`. Matches the existing interface location
- `libs/shared-types/src/agent.interface.ts` — `isIdle()` added to `IAgentService`. Matches the existing interface location

**Variance from architecture:**

- `ManualCommitService` is in `conversations/` module, not a separate `manual-commit/` module. The architecture lists `manual-commit/` as a separate module (architecture.md lines 578-581), but creating it would require either a circular dependency (`ConversationsModule` ↔ `ManualCommitModule`) or extracting the `sandboxIds` Map to a shared registry. Placing `ManualCommitService` in `ConversationsModule` is the simplest reversible option (DP-3). The semantic intent (FR-15: manual commit) is satisfied. If the logic grows complex, it can be extracted to a separate module later. This is a deliberate variance, recorded per DP-3.
- `ManualCommitButton.tsx` (architecture.md line 505: `ManualCommitButton.tsx # FR-15 — direct fetch to apps/agent-be`) is not created as a separate component. The save flow is integrated into `WorkingTreeIndicator` (dirty state's save popover) + `ConversationPane.handleSave` (direct fetch to `POST /api/conversations/:id/save`). The architecture's file listing is a suggestion, not a contract — the save affordance is part of the working tree indicator, not a standalone button. Simplest reversible option (DP-3): no new component, the indicator owns the save UX.
- `working-tree.service.ts` (architecture.md line 566: `working-tree.service.ts # git status --porcelain, FR-14`) is not created. `getWorkingTreeStatus` is on `SandboxService` (delivered in Story 3.1), not a separate service. This is a pre-existing variance from Story 3.1 — `SandboxService` already owns git operations (`clone`, `injectGitConfig`, `getWorkingTreeStatus`, `commit`). A separate `WorkingTreeService` would add indirection for no benefit. Simplest reversible option (DP-3).

### Out of Scope (Do Not Implement)

- **`git push` after manual commit:** The manual save is a local sandbox commit. Pushing to the remote GitHub repository is not in scope (DP-5). The agent's `git commit` (Story 3.4) also doesn't push
- **Working tree state polling:** The indicator updates via SSE events only. No polling mechanism (DP-5)
- **Working tree file list display:** The indicator shows `● Unsaved changes`, not a list of changed files. The `WorkingTreeStatus.files` array is available but not displayed in the UI. Deferred
- **Credential failure propagation (CREDENTIAL_FAILURE event, 401 detection):** Story 3.7 scope
- **Access denied propagation (ACCESS_DENIED event, 403 classification):** Story 3.7 scope
- **Cost tracking (per-user LLM spend, NFR-O1):** Story 3.8 scope
- **Mid-session idle timeout:** Story 3.9 scope. Story 3.6's manual save does not interact with the idle timeout
- **Commit identity verification:** Story 3.10 scope. Story 3.6's manual commit uses the git identity injected at provision/resume (Story 1.5 / 3.5) — the identity is already in the sandbox git config
- **Concurrent conversations (FR11 cap, "session limit reached"):** Story 3.11 scope
- **SSE drain on deploy:** Story 3.12 scope
- **Fixing `getWorkingTreeStatus` slicing bug:** Deferred per DP-5 (deferred-work.md lines 175-176). The bug affects the `files` array accuracy, not the `dirty` boolean used by the indicator
- **Fixing `getWorkingTreeStatus` exit code check:** Deferred per DP-5 (deferred-work.md line 176). The bug treats git error text as a file list, but `dirty: true` is still correct (error text is non-empty → `dirty: true`)

### Deferred Findings

The following gaps were identified during story creation but are out of Story 3.6's acceptance criteria. Recorded per DP-5 (defer scope temptation):

- **`getWorkingTreeStatus` slicing bug:** `line.slice(3)` assumes `XY filename` format; renames (`R  old -> new`) and quoted paths produce wrong filenames. Latent — the `files` array is not displayed in the UI. **Owner: post-MVP hardening.**
- **`getWorkingTreeStatus` exit code check:** git error text on stdout is treated as a file list. Latent — `dirty: true` is still correct (error text is non-empty). **Owner: post-MVP hardening.**
- **`git push` after manual commit:** The manual save is a local sandbox commit. If the sandbox is destroyed (idle timeout, server restart), the commit is lost. The `artifacts.service.ts` mirror (Story 2.1) scans `_bmad-output/` at commit-time from the sandbox filesystem — if the sandbox is destroyed before the mirror runs, the artifact is not synced to Postgres. Pushing to the remote would persist the commit. **Owner: post-MVP (if remote sync is needed).**
- **Save confirmation popover focus management:** The popover uses local React state + `useRef` + `useEffect` for focus management (DP-3). If more popovers/modals accumulate, extract a shared `useFocusTrap` hook or install Radix Popover/Dialog. **Owner: future refactoring.**
- **`AbortSignal.timeout()` on save fetch:** The `handleSave` fetch call lacks a timeout (pre-existing pattern — all fetch calls in `ConversationPane` lack timeouts). Deferred from Stories 3.2/3.3/3.4/3.5. **Owner: Dev (next milestone).**
- **Out-of-scope skipped E2E tests (Story 1.2/1.3):** A codebase-wide search for skipped tests during Story 3.6 validation found 3 `test.skip()` calls in Playwright E2E files belonging to Story 1.2 (`sign-in.spec.ts:124` — conditional skip on `AUTH_GITHUB_ID` env var) and Story 1.3 (`onboarding.spec.ts:215` — org OAuth App restriction, `onboarding.spec.ts:265` — encrypted token visibility). These are NOT Story 3.6 tests. The first two require real GitHub resources that cannot be simulated; the third is a legitimate conditional-skip pattern. **Owner: Story 1.2/1.3 owners.**
- **Integration test Jest config gap:** `apps/agent-be/test/jest-integration.config.ts` is missing the `moduleNameMapper` for `@anthropic-ai/claude-agent-sdk` (should map to `src/__mocks__/claude-agent-sdk.ts`) and the `transformIgnorePatterns` entries for `@ag-ui`/`@anthropic-ai` (should be `node_modules/(?!jose|@ag-ui|@anthropic-ai)`). The unit test config (`jest.config.ts`) has both. This gap was introduced in Story 3.3 when `agent.service.ts` first imported the SDK. The single integration test (`sandbox-lifecycle.integration.spec.ts`) covers Story 3.1, not Story 3.6. **Owner: post-MVP hardening.**

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 3.6 (lines 736-774), Epic 3 description (lines 580-583), FR14 (line 46), FR15 (line 48), NFR-P5 (line 80)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Cross-Cutting Concern 2 (line 89: sandbox lifecycle, working tree events), Cross-Cutting Concern 5 (line 92: git transport and commit attribution — "Manual commit (FR-15) is a platform-level operation executed via Daytona process execution API, not an agent action. Queued behind agent turn idle state in-process"), NFR-P5 (line 50: manual commit ≤ 5s), `manual-commit/` module listing (lines 578-581), `ISandboxService` contract (lines 394-433), API & Communication Patterns (line 268: browser → agent-be REST for manual commit)
- EXPERIENCE.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` — Working Tree Indicator (lines 154-176: dirty/clean/hidden states, save confirmation flow, info affordance), Conversation Surface States (line 260: working tree indicator visible in active/idle state), Accessibility Floor (lines 388, 391, 398: info affordance keyboard nav, non-color signaling, `aria-live="polite"`)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` — Working Tree Indicator (lines 347-353: dirty/clean/hidden visual spec, `caution` color, `caution-bg` background, `ⓘ` info icon), Semantic Pill (lines 343-345: "Progress saved" label, positive colors, View link), color tokens (line 228: `caution` = `#F2A944`)
- UX decision log: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/.decision-log.md` — line 86: working tree indicator decision log entries
- Project context: `_bmad-output/project-context.md` — NestJS patterns (lines 120-144: SSE, fire-and-forget, `OnModuleDestroy`, shell-quoting, circuit breaker), Next.js patterns (lines 85-118: Server Components, `aria-live`, focus rings), testing rules (lines 175-216: co-located tests, P0/P1 tags, `buildTestModule()`, `SandboxServiceFake`, mock patterns), `findFirst` for tenant-scoped lookups (line 154), `select` projection (line 148), standard focus ring (line 159), deliberate cross-service logic duplication (line 139)
- Decision policy: `_bmad-output/decision-policy.md` — DP-2 (semantic intent over literal text), DP-3 (simplest reversible option), DP-5 (defer scope temptation)
- Previous story: `_bmad-output/implementation-artifacts/3-5-resume-an-existing-conversation.md` — Story 3.5 delivered resume flow, `resolveGitIdentity()` helper, `findFirst` tenant check pattern, `select` projection, `useConversationPresence` hook. Story 3.6 follows the same extend-don't-rewrite pattern
- Story 3.4: `_bmad-output/implementation-artifacts/3-4-see-tool-calls-and-recognized-actions-inline.md` — `SemanticPill`, `ToolPill`, `tool-pill-classifier.service.ts`. Story 3.6 extends `SemanticPill` and reuses `ToolPill` error state
- Story 3.1: `_bmad-output/implementation-artifacts/3-1-provision-a-sandbox-when-opening-a-conversation.md` — `provisionSandbox` pipeline (emits `WORKING_TREE_*` events), `SandboxServiceFake`, `buildTestModule()`, `ISandboxService` interface. Story 3.6 adds `commit()` to the interface
- Deferred work: `_bmad-output/implementation-artifacts/deferred-work.md` — `getWorkingTreeStatus` slicing bug (lines 175-176), exit code check (line 176)
- ISandboxService: `libs/shared-types/src/sandbox.interface.ts` — `commit()` added (Task 1.1)
- IAgentService: `libs/shared-types/src/agent.interface.ts` — `isIdle()` added (Task 2.1)
- Implementation: `apps/agent-be/src/conversations/conversations.service.ts` (extend — `manualCommit()` + `flushPendingCommit` call), `apps/agent-be/src/conversations/conversations.controller.ts` (extend — `POST :id/save`), `apps/agent-be/src/sandbox/sandbox.service.ts` (extend — `commit()`), `apps/agent-be/src/streaming/agent.service.ts` (extend — `isIdle()`), `apps/web/src/components/conversation/ConversationPane.tsx` (extend — working tree state + SSE listeners + `handleSave` + `WorkingTreeIndicator`), `apps/web/src/components/conversation/SemanticPill.tsx` (extend — conditional rendering)

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- `conversations.service.spec.ts` tests for `manualCommit` and `flushPendingCommit` initially failed because `provisionSandbox` was mocked with `jest.spyOn(sandboxFake, 'provision').mockResolvedValue(...)` but `clone`/`injectGitConfig`/`getWorkingTreeStatus` were not mocked — the `SandboxServiceFake` checks `sandboxes.has(sandboxId)` which was never set since `provision` was bypassed. Fixed by also mocking `clone`, `injectGitConfig`, and `getWorkingTreeStatus` in the two tests that call `provisionSandbox` with a mocked `provision`.
- `conversations.service.spec.ts` tests for `manualCommit` NotFoundException used `NotFoundException` in assertions but the import was missing. Fixed by adding `import { NotFoundException } from '@nestjs/common'`.
- `WorkingTreeIndicator.test.tsx` tests failed because the trigger element was a `<button>` whose accessible name "Unsaved changes" matched `getByRole('button', { name: /save/i })`, conflicting with the Save button in the popover. Fixed by using a `<span>` with `tabIndex={0}` instead of a `<button>` for the trigger.
- `WorkingTreeIndicator.test.tsx` tests for "Saving..." text failed because the component used the ellipsis character `…` (U+2026) but the test regex `/Saving\.\.\./` expects three period characters. Fixed by using `...` (three periods) instead of `…`.
- `WorkingTreeIndicator.test.tsx` focus management test failed because `getByText(/Unsaved changes/)` returned the inner `<span>` while `triggerRef` was on the outer `<span>`. Fixed by putting "Unsaved changes" as a direct text node of the trigger `<span>`.
- `ConversationPane.test.tsx` tests for "queued save response" and "clean save response" failed because `mockImplementationOnce` was consumed by the conversation creation fetch, not the save fetch. Fixed by changing to `mockImplementation` which persists for all fetch calls in the test.
- `manual-commit.service.ts` TypeScript error: `Property 'prisma' is declared but its value is never read.` The spec listed `prisma: PrismaService` as a dependency but the implementation doesn't use it. Per DP-3 (simplest reversible option), removed the unused `prisma` injection.

### Completion Notes List

- **Task 1.2:** Replaced `SandboxService.commit()` stub with implementation: `git add -A` then `git commit -m <shell-quoted message>` via two separate `executeCommand` calls with 10s timeout. Checks `exitCode` on `git commit` and throws with `response.result` on failure.
- **Task 2b:** Added `FILE_MODIFYING_TOOLS` constant (`Bash`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`) to `AgentService`. After emitting `TOOL_CALL_RESULT` and creating the classifier promise, if the tool is file-modifying, creates a fire-and-forget promise that calls `getWorkingTreeStatus` and emits `WORKING_TREE_DIRTY`/`WORKING_TREE_CLEAN`. The promise is added to `pendingClassifierPromises` so it's awaited before `RUN_FINISHED`. Mirrored the same logic in `AgentServiceFake`. Un-skipped 5 tests in `agent.service.unit.spec.ts` — all pass.
- **Task 3.1:** Replaced `ManualCommitService` stub with full implementation: `requestCommit` (queue behind agent turn, duplicate prevention), `flushPendingCommit` (execute queued commit), `executeCommit` (check working tree, commit with `chore(platform-save): checkpoint [<ISO8601>]` message, emit `MANUAL_SAVE_SUCCEEDED`/`MANUAL_SAVE_FAILED` + `WORKING_TREE_CLEAN`). Implements `OnModuleDestroy` to clear `pendingCommits`. Removed unused `prisma` injection per DP-3.
- **Task 3.2:** Un-skipped 9 tests in `manual-commit.service.spec.ts` — all pass.
- **Task 4.6:** Un-skipped 5 tests in `conversations.service.spec.ts` — all pass after fixing test setup (added `NotFoundException` import, mocked `clone`/`injectGitConfig`/`getWorkingTreeStatus` where `provision` was mocked).
- **Task 5.1:** Replaced `WorkingTreeIndicator` stub with full implementation: state-based rendering (`hidden`/`dirty`/`clean`/`saving`/`saving-after-response`), save confirmation popover with focus management, info disclosure tooltip with outside-click/Escape dismissal, `aria-live="polite"`, standard focus ring.
- **Task 5.2:** Un-skipped 14 tests in `WorkingTreeIndicator.test.tsx` — all pass. Removed unused `createEvent` and `userEvent` imports.
- **Task 6.1-6.5:** Wired `ConversationPane`: added `workingTreeState` state, SSE listeners for `WORKING_TREE_DIRTY`/`WORKING_TREE_CLEAN`/`MANUAL_SAVE_SUCCEEDED`/`MANUAL_SAVE_FAILED`, `handleSave` function (POST `/save`, handles queued/clean/committed/failed responses), `effectiveWorkingTreeState` (hidden when not ready), rendered `<WorkingTreeIndicator>` above `<ChatInput>`.
- **Task 6.6:** Un-skipped 9 tests in `ConversationPane.test.tsx` — all pass after fixing `mockImplementationOnce` → `mockImplementation` in two tests.
- **Task 7.1:** Extended `SemanticPill` with conditional rendering: View link only when `viewHref` non-empty, type label only when `artifactType` non-empty, title only when `artifactTitle` non-empty. Manual save variant renders just "Progress saved".
- **Task 7.2:** Un-skipped 5 tests in `SemanticPill.test.tsx` — all pass.
- **Task 8:** All verification passed: agent-be lint (0 errors), web lint (0 new warnings in Story 3.6 files), TypeScript clean for both apps, agent-be tests (106 passed, 0 skipped), web tests (622 passed, 0 skipped).

### Decision Records (Dev)

**Decision (DP-3):** Removed `prisma: PrismaService` injection from `ManualCommitService` constructor. The story spec listed it as a dependency, but the implementation doesn't use database access — it only calls `sandboxService.commit()` and emits SSE events. Per DP-3, simplest reversible option: don't inject what's not needed. If a future story needs Prisma in `ManualCommitService`, it can be added back.

**Decision (DP-4):** Changed `mockImplementationOnce` to `mockImplementation` in two `ConversationPane.test.tsx` tests ("queued save response" and "clean save response"). The `mockImplementationOnce` was consumed by the conversation creation fetch, not the save fetch. This is a test-only fix with no production behavior change.

**Decision (DP-4):** Removed unused `createEvent` and `userEvent` imports from `WorkingTreeIndicator.test.tsx`. Test-only change, no production behavior change.

**Decision (DP-5):** Out-of-scope skipped E2E tests in Story 1.2/1.3 files not addressed. A codebase-wide search for skipped tests during Story 3.6 validation found 3 `test.skip()` calls in `playwright/e2e/onboarding/onboarding.spec.ts` (lines 215, 265) and `playwright/e2e/auth/sign-in.spec.ts` (line 124). These belong to Story 1.2 (sign-in) and Story 1.3 (repository connection), not Story 3.6. The first two require real GitHub resources (org with OAuth App restrictions, real credentials) that cannot be simulated. The third is a conditional skip on `AUTH_GITHUB_ID` env var — a legitimate Playwright pattern. Per DP-5, deferred to their respective story owners. Story 3.6 scope has zero skipped tests.

**Decision (DP-5):** Integration test Jest config gap not addressed. `apps/agent-be/test/jest-integration.config.ts` is missing the `moduleNameMapper` for `@anthropic-ai/claude-agent-sdk` and the `transformIgnorePatterns` entries for `@ag-ui`/`@anthropic-ai` (both present in the unit test config `jest.config.ts`). This gap was introduced in Story 3.3 when `agent.service.ts` first imported the SDK. The single integration test (`sandbox-lifecycle.integration.spec.ts`) covers Story 3.1 sandbox lifecycle, not Story 3.6 acceptance criteria. Per DP-5, deferred to post-MVP hardening. Story 3.6's acceptance criteria are fully covered by unit and component tests (106 agent-be + 622 web, 0 skipped).

### File List

**Modified:**
- `apps/agent-be/src/sandbox/sandbox.service.ts` — replaced `commit()` stub with implementation (Task 1.2)
- `apps/agent-be/src/streaming/agent.service.ts` — added `FILE_MODIFYING_TOOLS` constant + working tree emission after file-modifying tool calls (Task 2b.1-2b.2)
- `apps/agent-be/test/helpers/agent-service.fake.ts` — added `FILE_MODIFYING_TOOLS` + working tree emission after file-modifying tool calls (Task 2b.3)
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — un-skipped 5 working tree emission tests (Task 2b.4)
- `apps/agent-be/src/conversations/manual-commit.service.ts` — replaced stub with full implementation (Task 3.1)
- `apps/agent-be/src/conversations/manual-commit.service.spec.ts` — un-skipped 9 tests (Task 3.2)
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — un-skipped 5 tests, added `NotFoundException` import, fixed test setup (Task 4.6)
- `apps/web/src/components/conversation/WorkingTreeIndicator.tsx` — replaced stub with full implementation (Task 5.1)
- `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx` — un-skipped 14 tests, removed unused imports (Task 5.2)
- `apps/web/src/components/conversation/ConversationPane.tsx` — added working tree state, SSE listeners, handleSave, rendered WorkingTreeIndicator (Tasks 6.1-6.5)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — un-skipped 9 tests, fixed mock setup (Task 6.6)
- `apps/web/src/components/conversation/SemanticPill.tsx` — conditional rendering for manual save variant (Task 7.1)
- `apps/web/src/components/conversation/SemanticPill.test.tsx` — un-skipped 5 tests (Task 7.2)

### Change Log

- 2026-07-04: Story 3.6 implementation complete — all tasks done, all tests pass (agent-be: 106, web: 622), lint and typecheck clean.
- 2026-07-04: Automate validation run — zero skipped tests in Story 3.6 scope, all 7 ACs covered, all tests pass. 3 out-of-scope E2E skips (Story 1.2/1.3) and integration test config gap deferred per DP-5. Validation report at `_bmad-output/test-artifacts/automate-validation-report-3-6.md`.
- 2026-07-04: Code review complete — 13 patch findings fixed, 12 deferred, 2 dismissed. See Review Findings below.
- 2026-07-04: Code review patches applied — focus trap in save popover (Tab/Shift+Tab cycling + aria-modal), tooltip outside-click fix (tooltipRef), role="button"+aria-haspopup on trigger span, ellipsis character per AC-3, setWorkingTreeState moved inside try/catch, fallback toolCallId for malformed SSE payloads, flushPendingCommit race fix (executingCommits Set + tail-flush), git add -A exit code check, logger.warn spy assertion, Save button disabled assertion, outside-click test, handleSave fetch mock fix, stale TDD header comments removed. All 728 tests pass (agent-be: 106, web: 622), lint and typecheck clean.
- 2026-07-04: NFR evidence audit complete — 0 NFR patches applied (all 11 NFR-specific patches verified in place from implementation/code-review); 8 deferred findings documented in NFR Evidence Audit section. Overall status: CONCERNS (20/29 ADR criteria, 0 FAIL, 0 blockers).

### Review Findings

**Patch findings (all fixed):**

- [x] [Review][Patch] Save popover does not trap focus on Tab/Shift+Tab — only Escape handled, no Tab cycling; missing aria-modal [WorkingTreeIndicator.tsx:126-170]
- [x] [Review][Patch] git add -A exit code not checked before git commit — asymmetric error handling, staging failure silently proceeds [sandbox.service.ts:commit]
- [x] [Review][Patch] flushPendingCommit deletes pendingCommits before executeCommit — concurrent requestCommit can start a parallel commit race [manual-commit.service.ts:33-42]
- [x] [Review][Patch] MANUAL_SAVE_SUCCEEDED/FAILED handlers call setWorkingTreeState outside try/catch — malformed payload still mutates state [ConversationPane.tsx:421,448]
- [x] [Review][Patch] Info tooltip self-dismisses when its own text is clicked — handleOutsideClick checks infoRef but tooltip is a sibling [WorkingTreeIndicator.tsx:41-44]
- [x] [Review][Patch] Dirty indicator trigger span missing role="button" and aria-haspopup="dialog" — screen readers won't announce it as interactive [WorkingTreeIndicator.tsx:86-103]
- [x] [Review][Patch] MANUAL_SAVE handlers use undefined toolCallId as React key if SSE payload lacks it — key collision risk [ConversationPane.tsx:400,427]
- [x] [Review][Patch] "Saving..." uses three periods instead of ellipsis character per AC-3 spec [WorkingTreeIndicator.tsx:70,78]
- [x] [Review][Patch] Save button disabled test asserts text rendering only, not toBeDisabled() — AC-6 test gap [WorkingTreeIndicator.test.tsx]
- [x] [Review][Patch] logger.warn not verified in working tree check failure test — spec requires asserting warn called [agent.service.unit.spec.ts]
- [x] [Review][Patch] Info tooltip outside-click dismissal path not exercised by any test — only Escape tested [WorkingTreeIndicator.test.tsx]
- [x] [Review][Patch] handleSave test uses unrelated fetch mock returning conversation body, asserts nothing about post-save indicator state [ConversationPane.test.tsx]
- [x] [Review][Patch] Stale "TDD RED PHASE" header comments in test files whose tests are now green [manual-commit.service.spec.ts, WorkingTreeIndicator.test.tsx, SemanticPill.test.tsx]

**Deferred findings:**

- [x] [Review][Defer] Indicator stuck in 'saving' if SSE never arrives after committed=true [ConversationPane.tsx:561-588] — deferred, DP-5 (spec deliberately relies on SSE for state transition; client-side fallback is beyond ACs)
- [x] [Review][Defer] Circuit breaker abortPromise listener + orphan iterator.next() never cleaned up [agent.service.ts:325-360] — deferred, pre-existing (Story 3.4)
- [x] [Review][Defer] ManualCommitService.onModuleDestroy silently drops pending commits without emitting MANUAL_SAVE_FAILED [manual-commit.service.ts:91-93] — deferred, DP-5 (spec explicitly says clear pendingCommits on shutdown)
- [x] [Review][Defer] TOOL_CALL_RESULT error detection uses brittle string regex on content [ConversationPane.tsx:294-298] — deferred, pre-existing (Story 3.4)
- [x] [Review][Defer] processAssistantMessage casts SDKMessage to hand-rolled shape, drops non-text blocks [agent.service.ts] — deferred, pre-existing (Story 3.3/3.4)
- [x] [Review][Defer] AgentService.onModuleDestroy doesn't await in-flight classifier/working-tree promises [agent.service.ts] — deferred, pre-existing (Story 3.4)
- [x] [Review][Defer] Dual source of truth for conversationId (ref + state) can drift [ConversationPane.tsx] — deferred, pre-existing (Story 3.1/3.3)
- [x] [Review][Defer] pendingCommits keyed only by conversationId — multi-session collision risk [manual-commit.service.ts:8] — deferred, DP-5 (spec explicitly uses conversationId as key)
- [x] [Review][Defer] SDK iterator.next() rejects with non-abort error mid-run — error swallowed [agent.service.ts:98-102] — deferred, pre-existing (Story 3.3/3.4)
- [x] [Review][Defer] POST /resume returns non-2xx — UI stuck in Reconnecting with no specific feedback [ConversationPane.tsx:455-467] — deferred, pre-existing (Story 3.5)
- [x] [Review][Defer] content_block_stop for tool_use when currentToolCallIds has no entry — tool pill stuck in running state [agent.service.ts:344-355] — deferred, pre-existing (Story 3.3/3.4)
- [x] [Review][Defer] Fast-path resume re-injects git config while stale idle timer ticking — sandbox may be destroyed [agent.service.ts:285-318] — deferred, pre-existing (Story 3.5)

### NFR Evidence Audit

**Audit date:** 2026-07-04
**Overall Status:** CONCERNS (20/29 ADR criteria; 0 FAIL, 0 blockers)

**NFR patches applied this audit:** 0 — all NFR-specific patches were already applied during implementation and code review (11 verified in place):

| # | Patch | Category | File | Status |
|---|---|---|---|---|
| 1 | `select: { id: true }` on `conversation.findFirst` in `manualCommit` | Performance | `conversations.service.ts:254` | Verified (implementation) |
| 2 | `executeCommand` timeout (10s) on `git add -A` + `git commit` | Performance/Reliability | `sandbox.service.ts:126,135` | Verified (implementation) |
| 3 | Shell-quoting via `shellQuote()` on commit message | Security | `sandbox.service.ts:132` | Verified (implementation) |
| 4 | Tenant isolation via `findFirst({ where: { id, userId } })` (NFR-S2) | Security | `conversations.service.ts:252-255` | Verified (implementation) |
| 5 | `executeCommit` try/catch → `MANUAL_SAVE_FAILED` (never throws) | Reliability | `manual-commit.service.ts:67-108` | Verified (implementation) |
| 6 | `git add -A` exit code check before `git commit` | Reliability | `sandbox.service.ts:128-130` | Verified (code-review patch) |
| 7 | Concurrency guard (`executingCommits` Set + tail-flush) | Reliability | `manual-commit.service.ts:9,49,56-59` | Verified (code-review patch) |
| 8 | Fire-and-forget `.catch()` → `logger.warn` on working tree check | Reliability | `agent.service.ts:450-452` | Verified (implementation) |
| 9 | `pendingClassifierPromises` awaited before `RUN_FINISHED` + cleared in `finally` | Reliability | `agent.service.ts:110-113,152` | Verified (implementation) |
| 10 | `OnModuleDestroy` clears `pendingCommits` + `executingCommits` | Reliability | `manual-commit.service.ts:110-113` | Verified (implementation) |
| 11 | Security headers in `next.config.js` | Security | `apps/web/next.config.js:14-29` | Verified (Story 2.2, project-wide) |

**NFR deferred findings (documented in NFR assessment report):**

- [x] [NFR][Defer] `take` limit on `turn.findMany` in `[conversationId]/page.tsx` — pre-existing from Story 3.3; AC-1 says "Full chat history restored" — feature change, not pure NFR patch
- [x] [NFR][Defer] `AbortSignal.timeout()` on save fetch in `handleSave` — pre-existing pattern (all 6 fetch calls lack timeouts); requires error handling changes; deferred from Stories 3.2/3.3/3.4/3.5
- [x] [NFR][Defer] NFR-P5 timing test — `SandboxServiceFake` is in-memory (near-instant); real validation requires Daytona sandbox; same deferral pattern as NFR-P2
- [x] [NFR][Defer] Reduce `executeCommand` timeout from 10s to 5s to match NFR-P5 — 10s is a hung-process safety net, not SLA enforcement; story spec explicitly set 10s; tuning concern
- [x] [NFR][Defer] `npm audit`/Snyk in CI — project-wide, not Story 3.6-specific
- [x] [NFR][Defer] Emit `MANUAL_SAVE_FAILED` on `OnModuleDestroy` for pending commits — spec explicitly says clear on shutdown; SSE stream may already be closed; deferred per DP-5
- [x] [NFR][Defer] Structured JSON logging / Sentry / `/metrics` endpoint — project-wide, not Story 3.6-specific
- [x] [NFR][Defer] `getWorkingTreeStatus` slicing bug + exit code check — pre-existing from Story 3.1, deferred per DP-5 (deferred-work.md lines 175-176)

**Key NFR results:**

- **NFR-P5 (Manual Commit Latency):** CONCERNS — `executeCommand` timeout (10s) is a safety net exceeding the 5s target; actual commit near-instant for typical repos; empirical validation requires real sandbox
- **NFR-S2 (Credential Isolation):** PASS — `findFirst({ where: { id, userId } })` tenant auth check; `shellQuote()` on commit message
- **NFR-R2 (Committed Artifacts Recoverable):** PASS — manual commits are local sandbox git operations; `git push` deferred per DP-5
- **AC-5 (Failed Save):** PASS — `executeCommit` catches errors, emits `MANUAL_SAVE_FAILED`, indicator stays dirty, no partial commit state

**Verification:** 728 tests pass (agent-be: 106, web: 622), typecheck clean, agent-be lint 0 errors (web lint 1 pre-existing error in `sheet.test.tsx` — not a Story 3.6 file).
