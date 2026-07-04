# Story 3.4: See Tool Calls and Recognized Actions Inline

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user watching the Agent work,
I want to see every tool call it makes, with recognized actions like commits called out clearly,
so that I understand what the Agent is doing without needing to read raw tool output by default.

## Acceptance Criteria

### AC-1: Tool Pill with in-place label replacement (FR12, UX-DR5, UX-DR18)

**Given** the Agent makes any tool call
**When** it occurs
**Then** an inline "Running… [tool name]" label appears in the chat stream at that exact position while the tool executes (UX-DR18)
**And** once the tool call completes, that label is replaced in place — at the same stream position, with no layout shift to surrounding content — by the completed Tool Pill showing the tool name and a short status (FR12, UX-DR5)
**And** clicking the Tool Pill expands it inline to show raw input/output in monospace; clicking again collapses it, without affecting surrounding layout

### AC-2: Semantic Pill for confirmed git commit (FR12, UX-DR6)

**Given** the Agent performs a `git commit`
**When** the commit is confirmed successful (not on initiation)
**Then** its Tool Pill is promoted to a Semantic Pill: "Progress saved" with the Artifact type, title, and a "View" link that opens the Artifact Browser to that Artifact (FR12, UX-DR6)
**And** multiple commits in one Conversation each produce a distinct Semantic Pill at their respective positions

### AC-3: Error-state Tool Pill on failed git commit (FR12, FR14)

**Given** a `git commit` fails
**When** the failure occurs
**Then** an error-state Tool Pill is shown (not a Semantic Pill), the FR14 working-tree indicator remains dirty, and no automatic retry is attempted

### AC-4: Error-state Tool Pill on any failed tool call (FR12)

**Given** any agent tool call fails
**When** the failure occurs
**Then** an error-state Tool Pill appears at that position in the stream, displaying the agent's error description

### AC-5: Circuit breaker terminates stalled/crashed agent (architecture Cross-Cutting Concern 3)

**Given** `sandbox-agent` (the JSONL→AG-UI bridge) crashes or stalls
**When** the backend detects this
**Then** it terminates the Claude Code agent process via the Daytona process management API before emitting an error event, preventing an unobserved agent from continuing to act or commit
**And** the SSE channel emits heartbeat comments on a fixed interval so a stalled connection is detectable even if no events are flowing

## Tasks / Subtasks

- [ ] Task 1: Extend shared types for full tool call lifecycle (AC: 1, 2, 3, 4, 5)
  - [x] 1.1 ~~In `libs/shared-types/src/ag-ui.types.ts`, re-export `ToolCallArgsEvent` from `@ag-ui/core`...~~ **Already done** — `ag-ui.types.ts` already re-exports `ToolCallArgsEvent` (line 10) and defines `TOOL_CALL_PROMOTED_EVENT` + `ToolCallPromotedEvent` (lines 25-34), barrel-exported via `index.ts`. No action needed. Original spec for reference:
    ```typescript
    export const TOOL_CALL_PROMOTED_EVENT = 'TOOL_CALL_PROMOTED' as const;
    export interface ToolCallPromotedEvent {
      type: typeof TOOL_CALL_PROMOTED_EVENT;
      toolCallId: string;
      artifactType: string;
      artifactTitle: string;
      artifactId: string | null;
      viewHref: string;
    }
    ```
    Barrel-export from `libs/shared-types/src/index.ts`
  - [x] 1.2 ~~In `apps/web/src/components/conversation/types.ts`, extend `ChatMessage`...~~ **Already done** — `types.ts` already defines `ToolCallData` (lines 1-13) and the extended `ChatMessage` with `toolCall?: ToolCallData` and `role: 'user' | 'assistant' | 'system'` (lines 15-22). No action needed. Original spec for reference:
    ```typescript
    export interface ToolCallData {
      toolCallId: string;
      toolName: string;
      status: 'running' | 'completed' | 'error';
      input: string;
      output: string;
      errorMessage?: string;
      semantic?: {
        artifactType: string;
        artifactTitle: string;
        viewHref: string;
      };
    }
    export interface ChatMessage {
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      createdAt: Date;
      isStreaming?: boolean;
      toolCall?: ToolCallData;
    }
    ```
    The `toolCall` field is present when the entry is a tool-call pill (not a text message). The `role: 'system'` discriminates platform copy (circuit-breaker message) from agent messages. Existing code that creates `ChatMessage` without `toolCall` or with `role: 'user' | 'assistant'` is unaffected

- [ ] Task 2: Create ToolPill component (AC: 1, 3, 4)
  - [ ] 2.1 Implement `apps/web/src/components/conversation/ToolPill.tsx` (replace existing RED-phase stub that throws `'ToolPill: not implemented'`) — `'use client'`. Replaces the Story 3.3 `ToolExecutionIndicator` for the full Tool Pill experience. Renders as an inline chip per DESIGN.md `tool-pill` spec: `inline-flex`, `surface-raised` background, `1px solid border` border, `rounded.sm` radius, `2px 8px` padding, `text-xs` size, `text-2` color. Shows the tool name and a short status. Three visual states:
    - **Running**: spinner + "Running… [toolName]" (reuses the spinner styling from `ToolExecutionIndicator`)
    - **Completed**: checkmark icon + "[toolName]" (no "completed" label — the pill's presence and styling convey completion)
    - **Error**: `negative` border + `negative` text + "[toolName] failed" with the error message available in the expanded view
    Clicking the pill toggles `expanded` state (local `useState`). When expanded, shows raw input and output in `<pre className="font-mono text-xs ...">` blocks below the pill label. The expansion grows in place — does NOT affect surrounding layout (no layout shift — EXPERIENCE.md line 143). Click again collapses. `role="button"`, `aria-expanded`, `tabIndex={0}`. Focus ring: `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` (project-context.md line 159). `aria-label` describes the action
  - [ ] 2.2 Implement `apps/web/src/components/conversation/ToolPill.test.tsx` (un-skip existing RED-phase tests — all are `it.skip()` with TDD RED PHASE header) — `[P0]` renders running state with spinner and tool name, `[P0]` renders completed state, `[P0]` renders error state with negative styling, `[P0]` expands on click to show input/output, `[P0]` collapses on second click, `[P0]` has aria-expanded reflecting state, `[P1]` keyboard accessible (Enter/Space toggles). Use `@jest-environment jsdom`

- [ ] Task 3: Create SemanticPill component (AC: 2)
  - [ ] 3.1 Implement `apps/web/src/components/conversation/SemanticPill.tsx` (replace existing RED-phase stub that throws `'SemanticPill: not implemented'`) — `'use client'`. Elevated, positive-colored variant per DESIGN.md `semantic-pill` spec: `inline-flex`, `positive-bg` background, `1px solid positive` border, `rounded.sm` radius, `4px 10px` padding, `text-sm` size, `positive` text color. Content: "Progress saved" label + "·" separator + artifact type + title + underlined "View" link. The `artifactType` prop receives a lowercase `ArtifactType` value (e.g. `'prd'`, `'architecture'`) matching the `Artifact.type` field in Postgres — map it to a display label using the same type-to-label mapping as `ArtifactCard.tsx` (`'prd' → 'PRD'`, `'architecture' → 'Architecture'`, etc.). This mapping is deliberately duplicated from `apps/web/src/components/project-map/ArtifactCard.tsx` per the cross-service logic duplication rule (project-context.md line 139) — both are in `apps/web` but in different feature directories; if the mapping becomes complex, extract to a shared `apps/web/src/lib/artifact-labels.ts`. The "View" link is a Next.js `<Link>` (`href` from `viewHref` prop) in `positive` color, underlined, opens the Artifact Browser. `role="status"`, `aria-live="polite"`. Focus ring on the link. Props: `{ artifactType: string; artifactTitle: string; viewHref: string }`
  - [ ] 3.2 Implement `apps/web/src/components/conversation/SemanticPill.test.tsx` (un-skip existing RED-phase tests — all are `it.skip()`) — `[P0]` renders "Progress saved" label, `[P0]` renders artifact type and title, `[P0]` renders View link with correct href, `[P0]` link has positive color and underline, `[P1]` has role="status". Use `@jest-environment jsdom`

- [ ] Task 4: Create ToolPillClassifierService (AC: 2, 3)
  - [ ] 4.1 Implement `apps/agent-be/src/streaming/tool-pill-classifier.service.ts` (replace existing RED-phase stub that throws `'ToolPillClassifierService: not implemented'`) — NestJS `@Injectable()`. Implements the `git commit` → Semantic Pill promotion logic (architecture.md line 577: "promotes commits to Semantic Pills"). The `classifyToolResult` method:
    ```typescript
    async classifyToolResult(
      toolCallId: string,
      toolName: string,
      toolInput: string,
      toolOutput: string,
      userId: string,
    ): Promise<ToolCallPromotedEvent | null>
    ```
    Logic:
    1. If `toolName` is not `'Bash'` and the input doesn't contain `git commit`, return `null` (not a commit)
    2. Parse `toolOutput` for git commit success indicators (e.g., `[branch hash]` prefix, "files changed" — NOT "nothing to commit" or "your branch is up to date" which indicate no-op, and NOT error messages). If the commit failed (non-zero exit, error text), return `null` — the Tool Pill will render as error-state via the normal `TOOL_CALL_RESULT` path
    3. Extract committed file paths from the git commit output (lines like `create mode 100644 path/to/file` or `path/to/file | N +-`). Filter for paths under `_bmad-output/` (BMAD artifacts). If no BMAD artifact paths found, return `null` (commit didn't touch artifacts — still a successful commit, but no Semantic Pill)
    4. Derive artifact type from the path using the same path-to-type mapping as `apps/web/src/lib/artifacts.ts` `deriveArtifactType()` (lines 143-161). The `artifactType` values MUST be lowercase `ArtifactType` values (`'prd'`, `'architecture'`, `'epics'`, `'brainstorming'`, etc.) matching the `ArtifactType` type in `libs/shared-types/src/artifact.types.ts` and the `Artifact.type` field in Postgres — NOT display labels. This path-to-type mapping is deliberately duplicated from `apps/web/src/lib/artifacts.ts` per the cross-service logic duplication rule (project-context.md line 139) — the architecture forbids a shared utility library beyond `libs/shared-types` and `libs/database-schemas`. Derive title from the filename (capitalize, strip extension) or the commit message subject line
    5. Look up the artifact by path in Postgres to get the ID for the "View" link: `prisma.repoConnection.findUnique({ where: { userId }, select: { id: true } })` → then `prisma.artifact.findFirst({ where: { repoConnectionId, path }, select: { id: true, title: true, type: true } })`. If found, use the Postgres `title` and `type` (authoritative — derived from frontmatter/heading during sync) instead of the path-derived values, and `viewHref = /artifacts?id=${artifact.id}`. If not found (artifact not yet synced to Postgres), fall back to path-derived `artifactType`/`artifactTitle` and `viewHref = '/artifacts'` (opens the Artifact Browser without pre-selection — the artifact will appear after the next sync). Use `select` projections (project-context.md line 148)
    6. Return `{ type: TOOL_CALL_PROMOTED_EVENT, toolCallId, artifactType, artifactTitle, artifactId, viewHref }`
    Inject `PrismaService`. Follow the `logger.warn()` in catch blocks pattern (project-context.md line 128) — if the Postgres lookup fails, log at `warn` and return the event with `viewHref = '/artifacts'` (degraded but functional)
  - [ ] 4.2 Implement `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` (un-skip existing RED-phase tests — all are `it.skip()`) — `[P0]` returns null for non-Bash tool, `[P0]` returns null for Bash without git commit, `[P0]` returns null for failed commit (error in output), `[P0]` returns promoted event for successful commit touching `_bmad-output/` files, `[P0]` derives correct lowercase artifactType from path (e.g. `'prd'`, `'architecture'` — matching `ArtifactType` in shared-types and `Artifact.type` in Postgres, NOT display labels), `[P0]` uses Postgres title and type when artifact is found (overrides path-derived values), `[P0]` returns viewHref with id when artifact in Postgres, `[P0]` returns viewHref without id when artifact not in Postgres, `[P1]` returns null for commit not touching `_bmad-output/` files, `[P1]` logs warn on Postgres lookup failure. Mock `PrismaService`

- [ ] Task 5: Extend AgentService for full tool call lifecycle + circuit breaker (AC: 1, 2, 3, 4, 5)
  - [ ] 5.1 Extend `apps/agent-be/src/streaming/agent.service.ts` `processStreamEvent` to emit the full AG-UI tool call lifecycle. Currently it emits only `TOOL_CALL_START` (with `toolName` — fix to `toolCallName` per AG-UI spec). Add:
    - On `content_block_delta` with `delta.type === 'input_json_delta'`: accumulate the `partial_json` into a per-`toolCallId` buffer and emit `TOOL_CALL_ARGS` with `{ toolCallId, delta: partial_json }` (AG-UI `ToolCallArgsEvent` shape)
    - On `content_block_stop` for a `tool_use` block (track which content blocks are tool_use — the `content_block_start` already captures `type: 'tool_use'` and `id`): emit `TOOL_CALL_END` with `{ toolCallId }`. **Fix the existing `content_block_stop` handler:** it currently emits `TEXT_MESSAGE_END` for ALL `content_block_stop` events regardless of block type — split it so text blocks emit `TEXT_MESSAGE_END` and tool_use blocks emit `TOOL_CALL_END`. Track active tool call IDs and their accumulated input args in a per-conversation `Map<string, { toolCallId, toolName, input }>` so the classifier can use them
  - [ ] 5.2 Fix the `TOOL_CALL_START` event field name: change `toolName` to `toolCallName` in the emitted event data (AG-UI `ToolCallStartEvent` uses `toolCallName`, not `toolName`). The current code emits `{ toolCallId, toolName, parentMessageId: null }` — change to `{ toolCallId, toolCallName, parentMessageId: null }`. This is a spec compliance fix (DP-2: the AG-UI protocol defines `toolCallName`; the code uses `toolName`). The frontend `ConversationPane` reads `data.toolName` — update to `data.toolCallName` in Task 7
  - [ ] 5.3 Handle tool results from the SDK stream. The SDK yields `ToolResultMessage` (or equivalent — read the SDK README/types after install for the exact message type discriminator). In `processSdkMessage`, add a case for tool result messages: extract the `toolCallId` and `content` (result text), emit `TOOL_CALL_RESULT` with `{ messageId, toolCallId, content, role: 'tool' }` (AG-UI `ToolCallResultEvent` shape). After emitting `TOOL_CALL_RESULT`, call the `ToolPillClassifierService.classifyToolResult()` with the tool call data (toolName, accumulated input, result content, userId). If the classifier returns a `ToolCallPromotedEvent`, emit it on `SessionEventsService`. Inject `ToolPillClassifierService` into `AgentService` constructor as the 4th parameter (after `PrismaService`). **Note:** `AgentRunParams` already includes `userId: string` (`libs/shared-types/src/agent.interface.ts` line 5) — no type change needed. The current `runTurn` destructuring (line 29: `const { conversationId, sandboxId, message } = params;`) must add `userId` so the classifier call has it. Pass `userId` through to `processSdkMessage`/`processStreamEvent` (or store it in the `ActiveRun` map alongside `sandboxId`/`processId`)
  - [ ] 5.4 Implement the circuit breaker in `AgentService.runTurn`:
    - Add a `circuitBreakerTimer: NodeJS.Timeout` per active run
    - Set a timeout (default 120_000ms = 2 minutes — configurable via `CIRCUIT_BREAKER_TIMEOUT_MS` env var) that starts when the run begins and resets on every emitted event (every `processSdkMessage` call that emits an event clears and re-sets the timer)
    - If the timer fires (no events for 120s during an active run): abort the agent (`abortController.abort()` + `query.interrupt()`), call `sandboxService.terminateProcess(sandboxId, processId)` (no-op for host-process agents per Story 3.3 DP-2 finding, but kept for interface compliance), emit `RUN_ERROR` with `{ message: 'The agent stopped unexpectedly. Send a new message to try again.' }`, and clean up the active run
    - Clear the timer in the `finally` block of `runTurn` (alongside the existing cleanup)
    - Clear the timer in `stop()` (alongside the existing abort logic)
    - Clear the timer in `onModuleDestroy()` for all active runs
  - [ ] 5.5 Wire `ToolPillClassifierService` in `apps/agent-be/src/streaming/streaming.module.ts` — add to `providers` and `exports`
  - [ ] 5.6 Implement `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (file already exists with all tests `it.skip()` — un-skip and make pass). The existing spec tests via `ConversationsService` integration with `AgentServiceFake` (the real `AgentService` is never instantiated; the `__mocks__/claude-agent-sdk.ts` mock throws on `query()`). The tool call lifecycle and circuit breaker tests require the REAL `AgentService` with a controllable SDK mock. The existing `agent.service.unit.spec.ts` already follows the correct pattern: it overrides the `__mocks__/claude-agent-sdk.ts` mock per-test via `jest.doMock('claude-agent-sdk', ...)` with an async generator yielding controlled `SDKMessage` sequences, and instantiates the real `AgentService` directly. **Note:** the existing test constructs `new AgentService(sandboxFake, sessionEvents, mockPrisma, mockClassifier)` with **4 constructor arguments** — the 4th is `mockClassifier` (a `ToolPillClassifierService` mock). The current `AgentService` constructor only takes 3 args; Task 5.3 adds `ToolPillClassifierService` as the 4th. The test expects this new signature. The test:
    - Overrides the `__mocks__/claude-agent-sdk.ts` mock per-test via `jest.doMock('claude-agent-sdk', () => ({ query: mockQuery }))` where `mockQuery` returns an async generator yielding controlled `SDKMessage` sequences (stream_event with content_block_start/delta/stop for text and tool_use, assistant messages with tool results, etc.)
    - Instantiates the real `AgentService` directly: `new AgentService(sandboxFake, sessionEvents, mockPrisma)` (and `ToolPillClassifierService` for the classifier integration tests)
    - Uses `jest.useFakeTimers()` for circuit breaker tests — advance with `jest.advanceTimersByTime(120_000)` to trigger the timeout. Verify the timer resets on event emission by advancing partially, emitting an event, then advancing again
    Tests: `[P0]` emits TOOL_CALL_START with toolCallName (not toolName), `[P0]` emits TOOL_CALL_ARGS on input_json_delta, `[P0]` emits TOOL_CALL_END (not TEXT_MESSAGE_END) on content_block_stop for tool_use, `[P0]` emits TOOL_CALL_RESULT on tool result message, `[P0]` calls classifier on TOOL_CALL_RESULT, `[P0]` emits TOOL_CALL_PROMOTED when classifier returns event, `[P0]` circuit breaker fires after timeout with no events, `[P0]` circuit breaker resets on each event, `[P0]` circuit breaker emits RUN_ERROR with correct message, `[P1]` circuit breaker timer cleared on stop, `[P1]` circuit breaker timer cleared on normal completion

- [ ] Task 6: Add SSE heartbeat to StreamingController (AC: 5)
  - [ ] 6.1 In `apps/agent-be/src/streaming/streaming.controller.ts`, add a heartbeat interval that writes SSE comment frames to `res` on a fixed interval. SSE comment frames start with `:` and are ignored by `EventSource` but keep the connection alive and let the browser detect dead connections. Implementation:
    - After setting headers and before subscribing, start `const heartbeatInterval = setInterval(() => { res.write(': heartbeat\n\n'); }, 15_000)` (15 seconds — a common SSE heartbeat interval)
    - Clear the interval in the `complete` callback, `error` callback, and `req.on('close')` handler (alongside the existing `cleanupBackPressure` and `subscription.unsubscribe()`)
    - Wrap `res.write(': heartbeat\n\n')` in a try/catch — if the response is already closed, `res.write` throws; catch and clear the interval
  - [ ] 6.2 Update `apps/agent-be/src/streaming/streaming.controller.spec.ts` — add tests: `[P0]` writes heartbeat comment on interval, `[P0]` clears heartbeat on connection close, `[P0]` clears heartbeat on stream complete, `[P1]` clears heartbeat on stream error, `[P1]` heartbeat write failure does not crash. Use fake timers (`jest.useFakeTimers()`) and mock `res.write`

- [ ] Task 7: Extend ConversationPane for Tool Pills, Semantic Pills, and system messages (AC: 1, 2, 3, 4, 5)
  - [ ] 7.1 Update `apps/web/src/components/conversation/ChatMessageList.tsx` — handle the three `ChatMessage` shapes:
    - `role === 'user'` → render `<UserMessage>` (existing)
    - `role === 'assistant' && !message.toolCall` → render `<AgentMessage>` (existing)
    - `role === 'assistant' && message.toolCall` → render `<ToolPill>` if no `semantic`, `<SemanticPill>` if `semantic` is present
    - `role === 'system'` → render a system message (centered, `text-3` muted text, no markdown — "same visual treatment as the 'Couldn't load…' error copy elsewhere" per EXPERIENCE.md line 263). Create a small inline `SystemMessage` render (not a separate component file — per DP-3, simplest reversible: inline in `ChatMessageList`):
      ```tsx
      {message.role === 'system' && (
        <div className="flex justify-center py-4">
          <p className="text-xs text-text-3 text-center max-w-md">{message.content}</p>
        </div>
      )}
      ```
  - [ ] 7.2 Update `apps/web/src/components/conversation/ConversationPane.tsx`:
    - Fix `TOOL_CALL_START` listener: read `data.toolCallName` (not `data.toolName` — Task 5.2 fix). Create a `ChatMessage` with `role: 'assistant'`, `toolCall: { toolCallId, toolName: data.toolCallName, status: 'running', input: '', output: '' }`, empty `content`. Use `toolCallId` as the message `id` (so subsequent events can find it)
    - Add `TOOL_CALL_ARGS` listener: append `data.delta` to the matching tool call's `input` field (find by `toolCallId`)
    - Update `TOOL_CALL_END` listener: set the matching tool call's `status` to `'completed'` (the result may follow in `TOOL_CALL_RESULT`). Keep `agentState` transition logic (back to `'thinking'` or `'streaming'`)
    - Add `TOOL_CALL_RESULT` listener: set the matching tool call's `output` to `data.content`. If the content indicates an error (the classifier didn't promote it and the result contains error indicators), set `status` to `'error'` and `errorMessage` to the content
    - Add `TOOL_CALL_PROMOTED` listener: find the matching tool call by `data.toolCallId`, set its `semantic` field to `{ artifactType, artifactTitle, viewHref }` and `status` to `'completed'`
    - Update `RUN_ERROR` listener: create a `ChatMessage` with `role: 'system'` (not `role: 'assistant'`) and the error content. This satisfies the UX spec (EXPERIENCE.md line 263: "system message, platform copy, not an agent message")
    - Update `STREAM_ERROR` listener: create a `ChatMessage` with `role: 'system'` (same treatment as RUN_ERROR)
    - Remove the `ToolExecutionIndicator` import and rendering — the ToolPill component (rendered via `ChatMessageList`) now handles the "Running…" label and the completed pill. The `agentState === 'tool-executing'` state is still tracked for the Stop button / input disabling, but no separate indicator component is rendered (the ToolPill in the stream IS the indicator)
  - [ ] 7.3 Remove `apps/web/src/components/conversation/ToolExecutionIndicator.tsx` — its functionality is fully superseded by `ToolPill.tsx`. **Note:** `ChatComponents.test.tsx` already has the `ToolExecutionIndicator` tests removed (header comment confirms: "Story 3.4: Removed ToolExecutionIndicator tests") — only the file deletion remains. No test migration needed; the `ToolPill.test.tsx` RED-phase tests already cover the replacement
  - [ ] 7.4 Update `apps/web/src/components/conversation/ConversationPane.test.tsx` — extend tests: `[P0]` renders Tool Pill on TOOL_CALL_START with tool name, `[P0]` updates tool input on TOOL_CALL_ARGS, `[P0]` marks tool completed on TOOL_CALL_END, `[P0]` sets tool output on TOOL_CALL_RESULT, `[P0]` promotes to Semantic Pill on TOOL_CALL_PROMOTED, `[P0]` renders error-state Tool Pill on failed tool result, `[P0]` renders system message on RUN_ERROR (not assistant message), `[P0]` renders system message on STREAM_ERROR, `[P1]` Tool Pill expands/collapses on click, `[P1]` multiple tool calls each render at their positions. Extend `MockEventSource.emit` to support the new event types. Mock `react-markdown` is already in place

- [ ] Task 8: Extend AgentServiceFake for full tool call lifecycle (AC: 1, 2, 3, 4)
  - [ ] 8.1 Update `apps/agent-be/test/helpers/agent-service.fake.ts` — extend the default script and `setScript` to support the full tool call event lifecycle. Add a helper method `setToolCallScript(toolName, input, output, promoted?)` that configures a script with: `TOOL_CALL_START` (with `toolCallName` field, NOT `toolName` — consistency with the Task 5.2 AG-UI spec fix) → `TOOL_CALL_ARGS` → `TOOL_CALL_END` → `TOOL_CALL_RESULT` → (optionally `TOOL_CALL_PROMOTED`). Add `setCircuitBreakerScript()` that emits `RUN_STARTED` then nothing (simulating a stall — the circuit breaker timer in the real `AgentService` would fire, but the fake doesn't have a timer; tests that need circuit-breaker behavior test the real `AgentService` with fake timers per Task 5.6). The fake does NOT call the real `ToolPillClassifierService` — tests that need classification test the real `AgentService` or the classifier directly. The fake emits `TOOL_CALL_PROMOTED` events from the script if configured
  - [ ] 8.2 Update `apps/agent-be/test/helpers/test-module-builder.ts` if needed — `ToolPillClassifierService` should be available in test modules. If tests need to override it, add an override pattern. Per DP-3, simplest: register `ToolPillClassifierService` as a regular provider in `StreamingModule` (not a Symbol-token test seam) — it's a pure classification service with no external dependencies beyond `PrismaService`. Tests that need to mock it can override the class directly

- [ ] Task 9: Verify lint, typecheck, and tests pass (AC: all)
  - [ ] 9.1 Run `yarn nx lint agent-be` — 0 errors
  - [ ] 9.2 Run `yarn nx lint web` — 0 new errors/warnings
  - [ ] 9.3 Run `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json` — clean
  - [ ] 9.4 Run `npx tsc --noEmit -p apps/web/tsconfig.json` — clean
  - [ ] 9.5 Run `yarn nx test agent-be` — all unit + integration tests pass
  - [ ] 9.6 Run `yarn nx test web` — all tests pass

## Dev Notes

### Decision Records

**Decision (DP-2):** Fix `TOOL_CALL_START` event field name from `toolName` to `toolCallName`. The AG-UI protocol (`@ag-ui/core` `ToolCallStartEvent`) defines the field as `toolCallName`. Story 3.3's `AgentService` emits `toolName` and `ConversationPane` reads `data.toolName` — a spec deviation. Per DP-2, follow the semantic intent (AG-UI protocol compliance) over the literal code. This is a fix applied within Story 3.4 since the full tool call lifecycle is this story's scope.

**Decision (DP-3):** Extend `ChatMessage` with an optional `toolCall` field rather than introducing a `StreamEntry` discriminated union. The `toolCall` field is present when the entry is a tool-call pill; absent for text messages. The `role` field discriminates user/assistant/system messages. This is the simplest reversible option — no changes to the `messages` array typing (`ChatMessage[]` stays), no new union types, and existing code that creates `ChatMessage` without `toolCall` is unaffected. If the message model becomes complex later, it can be refactored to a union.

**Decision (DP-3):** `ToolPillClassifierService` is a regular NestJS provider (not a Symbol-token test seam like `ISandboxService`/`IAgentService`). It's a pure classification service with `PrismaService` as its only dependency. Tests that need to mock it can override the class directly via `Test.createTestingModule().overrideProvider(ToolPillClassifierService)`. A Symbol-token test seam adds indirection for no benefit — the classifier has no alternate implementation (no "fake" needed; it's pure logic).

**Decision (DP-3):** The circuit breaker is implemented as a timer inside `AgentService.runTurn` (not a separate service). The architecture lists `agui-event-bridge.service.ts` as having "circuit breaker, heartbeat" (line 576), but Story 3.3 folded the event bridge into `AgentService` (DP-3). The circuit breaker is a per-run timer that resets on each emitted event — folding it into `AgentService` is the simplest reversible option. If the logic becomes complex, it can be extracted.

**Decision (DP-3):** The SSE heartbeat is implemented in `StreamingController` (not `SessionEventsService` or `AgentService`). The heartbeat is a per-connection concern (keep the SSE connection alive), not a per-conversation concern. `StreamingController` owns the `res` object and the connection lifecycle — it's the natural place. `SessionEventsService` emits conversation-level events; the heartbeat is a transport-level keepalive.

**Decision (DP-3):** System messages (circuit-breaker termination, stream error) use `role: 'system'` on `ChatMessage` and render as centered muted plain text (no markdown). This is simpler than a separate `SystemMessage` component file — the rendering is 3 lines of JSX inline in `ChatMessageList`. If system message rendering becomes complex, it can be extracted.

**Decision (DP-5):** The `tool-pill-classifier.service.ts` handles only `git commit` → Semantic Pill promotion in Story 3.4. The 401/403 credential-failure classification (architecture.md lines 624-625) is Story 3.7 scope. The classifier is structured to extend for 401/403 in Story 3.7, but only `git commit` recognition is implemented now. Per DP-5, defer.

**Decision (DP-5):** The Semantic Pill "View" link opens the Artifact Browser at `/artifacts?id={artifactId}` when the artifact is in Postgres (looked up by path). If the artifact is not yet synced to Postgres, the link opens `/artifacts` (no pre-selection). The full artifact sync pipeline (agent-be `artifacts.service.ts` scanning `_bmad-output/` post-commit and mirroring to Postgres) is a separate concern — Story 3.4's classifier does a read-only lookup, not a sync. Per DP-5, defer the sync pipeline.

**Decision (DP-5):** Working tree indicator (FR14, dirty/clean UI) is Story 3.6 scope. Story 3.4's AC-3 mentions "the FR14 working-tree indicator remains dirty" on failed commit — this is a statement about the indicator's behavior, not a requirement to implement it in Story 3.4. The indicator doesn't exist yet. Per DP-5, defer. Story 3.4 ensures the failed commit renders as an error-state Tool Pill (which IS in scope); the indicator's behavior is Story 3.6.

**Decision (DP-5):** Manual commit (FR15, Save button) is Story 3.6 scope. Story 3.4 handles only agent-initiated `git commit` (Semantic Pill promotion). The manual-save Semantic Pill is Story 3.6. Per DP-5, defer.

**Decision (DP-5):** Credential failure propagation (CREDENTIAL_FAILURE event, 401 detection) is Story 3.7 scope. Story 3.4's `ToolPillClassifierService` does not inspect tool results for 401 patterns. Per DP-5, defer.

**Decision (DP-5):** Access denied propagation (ACCESS_DENIED event, 403 classification) is Story 3.7 scope. Per DP-5, defer.

**Decision (DP-5):** Cost tracking (per-user LLM spend, NFR-O1) is Story 3.8 scope. Per DP-5, defer.

**Decision (DP-5):** Working tree state events (WORKING_TREE_DIRTY, WORKING_TREE_CLEAN) are Story 3.6 scope. Story 3.4 does not emit working tree state events. Per DP-5, defer.

**Decision (DP-2):** Task 1.1 originally claimed `ToolCallResultEvent` needed re-export from `@ag-ui/core`, but the existing `ag-ui.types.ts` already re-exports it (line 11). Only `ToolCallArgsEvent` is missing. Amended Task 1.1 to add only `ToolCallArgsEvent`. Intent over literal text — verified against actual code.

**Decision (DP-2):** Task 4.1 originally used display labels (`"PRD"`, `"Architecture"`, `"Epics"`) as `artifactType` values, contradicting both the `ArtifactType` type in `libs/shared-types/src/artifact.types.ts` (lowercase: `'prd'`, `'architecture'`, `'epics'`) and the story's own statement that "values should match the `Artifact.type` field in Postgres." Amended Task 4.1 to use lowercase `ArtifactType` values. The `SemanticPill` component maps lowercase types to display labels (reusing the `ArtifactCard.tsx` mapping pattern). Intent over literal text.

**Decision (DP-2/DP-3):** Task 4.1 originally created a new path-to-type mapping without referencing the existing `deriveArtifactType()` in `apps/web/src/lib/artifacts.ts` (lines 143-161). Amended Task 4.1 to reference the existing mapping as the source of truth to duplicate (per the cross-service logic duplication rule, project-context.md line 139 — the architecture forbids a shared utility library beyond `libs/shared-types` and `libs/database-schemas`). Simplest reversible option: duplicate the mapping logic and keep it in sync.

**Decision (DP-3):** Task 4.1 now selects `title` and `type` from Postgres when the artifact is found (same query as the ID lookup — zero additional cost). The Postgres values are authoritative (derived from frontmatter/heading during sync) and override the path-derived values. If the artifact is not in Postgres, fall back to path-derived values. Simplest reversible option — same query, more accurate result.

**Decision (DP-2):** Task 5.1 originally didn't call out that the existing `content_block_stop` handler emits `TEXT_MESSAGE_END` for ALL blocks (including `tool_use`), which would produce spurious `TEXT_MESSAGE_END` events after every `TOOL_CALL_END`. Amended Task 5.1 to explicitly require splitting the handler: text blocks emit `TEXT_MESSAGE_END`, tool_use blocks emit `TOOL_CALL_END`. Intent over literal text — the existing code has a bug that the task description must address.

**Decision (DP-2):** Task 5.6 originally said to update `agent.service.spec.ts` with circuit breaker tests, but the existing spec tests via `ConversationsService` integration with `AgentServiceFake` — the real `AgentService` is never instantiated (the SDK mock throws on `query()`). The circuit breaker and tool call lifecycle tests require the real `AgentService` with a controllable SDK mock. Amended Task 5.6 to specify: override the SDK mock per-test via `jest.doMock` with an async generator yielding controlled `SDKMessage` sequences, and instantiate the real `AgentService` directly. Intent over literal text — the test approach must match the code being tested.

**Decision (DP-4):** Task 8.1 amended to specify that `AgentServiceFake.setToolCallScript` uses the `toolCallName` field (not `toolName`) in `TOOL_CALL_START` events, consistent with the Task 5.2 AG-UI spec fix. Test-only change; recorded because it constrains the fake's event shape contract.

**Decision (DP-2):** The story's Git Intelligence section claimed "No pre-seeded scaffolding or RED-phase tests exist for Story 3.4" — contradicted by the actual codebase, which contains 7 pre-existing RED-phase stub/test files (ToolPill.tsx, SemanticPill.tsx, tool-pill-classifier.service.ts, and their test files + agent.service.unit.spec.ts) plus already-complete type changes (ag-ui.types.ts, types.ts). Amended the story to accurately document the pre-existing scaffolding. Intent over literal text — the dev needs accurate codebase state to avoid duplicate declarations and file-creation errors.

**Decision (DP-3):** Tasks 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.6 originally said "Create" for files that already exist as RED-phase stubs with skipped tests. Amended to "Implement (replace stub)" / "un-skip existing tests." Simplest reversible option — keep the ATDD scaffolding (consistent with project-context.md line 209: "tests are written first (red phase), often skipped with `test.skip()` until implementation lands"), implement in place rather than delete-and-recreate.

**Decision (DP-4):** `agent.service.unit.spec.ts` constructs `new AgentService(sandboxFake, sessionEvents, mockPrisma, mockClassifier)` with 4 constructor arguments — the 4th is a `ToolPillClassifierService` mock. The current `AgentService` constructor takes 3 args. Test-only change; recorded because it constrains the production constructor signature — Task 5.3 must add `ToolPillClassifierService` as the 4th constructor parameter.

**Decision (DP-4):** `ChatComponents.test.tsx` already has `ToolExecutionIndicator` tests removed (header comment confirms). Test-only change; recorded because it constrains Task 7.3 — only the `ToolExecutionIndicator.tsx` file deletion remains, no test migration needed.

**Decision (DP-2):** Task 5.3 originally didn't note that `AgentRunParams.userId` already exists in the type (`libs/shared-types/src/agent.interface.ts` line 5) but `AgentService.runTurn` (line 29) doesn't destructure it. Amended Task 5.3 to explicitly call out adding `userId` to the destructuring so the classifier call has it. Intent over literal text — the classifier requires `userId` for tenant-scoped Postgres lookup.

### What Already Exists (Do Not Recreate)

#### Story 3.3 Deliverables (Foundational — Extend, Do Not Rewrite)

- **`AgentService`** (`apps/agent-be/src/streaming/agent.service.ts`) — Story 3.3 delivered this. Implements `IAgentService`. Runs the Claude Code agent via `@anthropic-ai/claude-agent-sdk`'s `query()` function. Maps SDK messages to AG-UI events. Persists accumulated agent response as Turn on RUN_FINISHED. Has `stop()` (abort + interrupt + terminateProcess), `onModuleDestroy()`. Story 3.4 EXTENDS this: adds full tool call lifecycle emission (TOOL_CALL_ARGS/END/RESULT), circuit breaker timer, and classifier integration. Do NOT rewrite — extend
- **`AgentServiceFake`** (`apps/agent-be/test/helpers/agent-service.fake.ts`) — Story 3.3 delivered this. Emits canned AG-UI events. Persists Turn on RUN_FINISHED. Calls `terminateProcess` on stop. Story 3.4 extends it to support the full tool call event lifecycle. Do NOT rewrite — extend
- **`ConversationPane`** (`apps/web/src/components/conversation/ConversationPane.tsx`) — Story 3.3 delivered this. Manages session lifecycle, SSE event listeners, message state, agent state machine. Story 3.4 extends: adds TOOL_CALL_ARGS/END/RESULT/PROMOTED listeners, fixes TOOL_CALL_START field name, changes RUN_ERROR/STREAM_ERROR to system messages, removes ToolExecutionIndicator rendering. Do NOT rewrite — extend
- **`ChatMessageList`** (`apps/web/src/components/conversation/ChatMessageList.tsx`) — Story 3.3 delivered this. Renders messages, manages auto-scroll. Story 3.4 extends: handles `toolCall` field (renders ToolPill/SemanticPill), handles `role: 'system'` (renders system messages). Do NOT rewrite — extend
- **`AgentMessage`** (`apps/web/src/components/conversation/AgentMessage.tsx`) — Story 3.3 delivered this. Renders markdown with `react-markdown`. Do NOT modify — tool pills are separate entries in the message list, not embedded in agent messages
- **`ChatInput`**, **`ThinkingIndicator`**, **`ScrollToBottomButton`**, **`CopyButton`**, **`UserMessage`**, **`useDraftPersistence`** — Story 3.3 delivered these. Do NOT modify
- **`ToolExecutionIndicator`** (`apps/web/src/components/conversation/ToolExecutionIndicator.tsx`) — Story 3.3 delivered this as a simplified precursor. Story 3.4 REPLACES it with the full `ToolPill` component. Delete `ToolExecutionIndicator.tsx` (its tests are already removed from `ChatComponents.test.tsx`); migrate any reusable spinner styling into `ToolPill`
- **`StreamingController`** (`apps/agent-be/src/streaming/streaming.controller.ts`) — Story 3.3 delivered this with back-pressure tracking. Story 3.4 adds heartbeat interval. Do NOT rewrite — extend
- **`SessionEventsService`** (`apps/agent-be/src/streaming/session-events.service.ts`) — Story 3.1 delivered this. `ReplaySubject<SseEvent>(100)` per conversation. Do NOT modify — the AgentService uses it to emit events
- **`StreamingModule`** (`apps/agent-be/src/streaming/streaming.module.ts`) — Story 3.3 delivered this. Story 3.4 adds `ToolPillClassifierService` as a provider. Do NOT rewrite — extend
- **`ChatMessage` type** (`apps/web/src/components/conversation/types.ts`) — Story 3.3 delivered this. Story 3.4's extension (`toolCall` field and `role: 'system'`) is **already done** (Task 1.2 complete). Do NOT rewrite — extend
- **AG-UI event types** (`libs/shared-types/src/ag-ui.types.ts`) — Story 3.3 delivered this. Re-exports from `@ag-ui/core`. Story 3.4's addition of `TOOL_CALL_PROMOTED_EVENT` is **already done** (Task 1.1 complete). Do NOT rewrite — extend
- **`SandboxService.terminateProcess`** (`apps/agent-be/src/sandbox/sandbox.service.ts` line 120) — Story 3.1 delivered this. Uses `sandbox.process.killPtySession(processId)`. Story 3.4's circuit breaker calls this (no-op for host-process agents per Story 3.3 DP-2 finding, but kept for interface compliance). Do NOT modify
- **`buildTestModule()`** (`apps/agent-be/test/helpers/test-module-builder.ts`) — canonical test module factory. Do NOT rewrite — extend if needed
- **`MockEventSource` test pattern** (`ConversationPane.test.tsx` lines 39-78) — Story 3.1/3.2/3.3 established this. Extend with new event types (TOOL_CALL_ARGS, TOOL_CALL_END, TOOL_CALL_RESULT, TOOL_CALL_PROMOTED). Do NOT rewrite — extend

#### Story 3.1/3.2 Deliverables (Do Not Modify)

- **`ConversationsService`**, **`ConversationsController`**, **`SandboxService`**, **`ISandboxService`**, **`SandboxServiceFake`**, **boundary JWT**, **`IdleTimeoutService`**, **`ProvisionQueueService`**, **`CredentialsService`**, **`EncryptionService`**, **`HttpExceptionFilter`**, **`BoundaryJwtGuard`**, **`ActiveUserGuard`**, **`@User()` decorator**, **`@Public()` decorator**, **`Conversation`/`Turn` Prisma models**, **`AppShell`**, **`SideNavigation`**, **design tokens**, **`cn()` helper**, **`react-markdown` + `remark-gfm`** — all delivered in Stories 1.x/2.x/3.1/3.2. Do NOT modify

#### Pre-Existing RED-Phase Scaffolding (Implement, Do Not Recreate)

A prior ATDD session created RED-phase stubs and skipped test files for Story 3.4 (uncommitted working changes). These follow the project's ATDD pattern (project-context.md line 209: "tests are written first (red phase), often skipped with `test.skip()` until implementation lands"). Implement in place — do NOT delete and recreate:

- **`ToolPill.tsx`** — stub that throws `'ToolPill: not implemented (Story 3.4 ATDD red phase)'`. Replace the throw with the full implementation (Task 2.1)
- **`SemanticPill.tsx`** — stub that throws `'SemanticPill: not implemented (Story 3.4 ATDD red phase)'`. Replace the throw with the full implementation (Task 3.1)
- **`tool-pill-classifier.service.ts`** — stub that throws `'ToolPillClassifierService: not implemented (Story 3.4 ATDD red phase)'`. Replace the throw with the full implementation (Task 4.1)
- **`ToolPill.test.tsx`** — all tests are `it.skip()` with a "TDD RED PHASE" header. Un-skip one `describe` block at a time per task as implementation lands (Task 2.2)
- **`SemanticPill.test.tsx`** — all tests are `it.skip()`. Un-skip as implementation lands (Task 3.2)
- **`tool-pill-classifier.service.spec.ts`** — all tests are `it.skip()`. Un-skip as implementation lands (Task 4.2)
- **`agent.service.unit.spec.ts`** — all tests are `it.skip()`. Tests the REAL `AgentService` (not the fake) with a controllable SDK mock. Constructs `new AgentService(sandboxFake, sessionEvents, mockPrisma, mockClassifier)` with **4 constructor args** — the 4th is a `ToolPillClassifierService` mock. The current `AgentService` constructor takes 3 args; Task 5.3 adds the 4th. Un-skip as implementation lands (Task 5.6)
- **`ag-ui.types.ts`** — already has `ToolCallArgsEvent` re-exported (line 10) and `TOOL_CALL_PROMOTED_EVENT` + `ToolCallPromotedEvent` defined (lines 25-34). Task 1.1 is complete — no action needed
- **`types.ts`** (conversation) — already has `ToolCallData` (lines 1-13) and extended `ChatMessage` with `toolCall?: ToolCallData` and `role: 'user' | 'assistant' | 'system'` (lines 15-22). Task 1.2 is complete — no action needed
- **`ChatComponents.test.tsx`** — already has `ToolExecutionIndicator` tests removed (header: "Story 3.4: Removed ToolExecutionIndicator tests"). Task 7.3's test removal is done; only the `ToolExecutionIndicator.tsx` file deletion remains

### How AC-1 Is Satisfied

AC-1 ("Tool Pill with in-place label replacement") is satisfied by:

1. **Backend:** `AgentService` emits the full AG-UI tool call lifecycle: `TOOL_CALL_START` (with `toolCallName`) → `TOOL_CALL_ARGS` (streaming input) → `TOOL_CALL_END` → `TOOL_CALL_RESULT` (output). The current Story 3.3 code only emits `TOOL_CALL_START` — Story 3.4 extends `processStreamEvent` to handle `input_json_delta` deltas and tool result messages
2. **Frontend:** `ConversationPane` listens for all four events. On `TOOL_CALL_START`, it creates a `ChatMessage` with `toolCall: { status: 'running', ... }`. On `TOOL_CALL_ARGS`, it appends to `input`. On `TOOL_CALL_END`, it sets `status: 'completed'`. On `TOOL_CALL_RESULT`, it sets `output`. The `ChatMessageList` renders `ToolPill` for entries with `toolCall`
3. **In-place replacement:** The ToolPill's "Running…" label and the completed pill occupy the same `ChatMessage` entry — the entry's `toolCall.status` transitions from `'running'` to `'completed'`, and the ToolPill component re-renders in place. No layout shift because the entry's position in the `messages` array doesn't change (EXPERIENCE.md line 143: "The expanded state does not affect surrounding message layout — it grows in place")
4. **Expand/collapse:** ToolPill uses local `useState` for `expanded`. Clicking toggles the expanded view showing raw input/output in monospace. Clicking again collapses. No layout shift to surrounding content

### How AC-2 Is Satisfied

AC-2 ("Semantic Pill for confirmed git commit") is satisfied by:

1. **Detection:** `ToolPillClassifierService.classifyToolResult()` inspects `TOOL_CALL_RESULT` content for `git commit` success. It checks the tool name is `Bash`, the input contains `git commit`, and the output indicates success (commit hash, files changed — not error messages)
2. **Artifact metadata:** The classifier parses committed file paths from the git output, filters for `_bmad-output/` paths, derives artifact type from the path using the same mapping as `apps/web/src/lib/artifacts.ts` `deriveArtifactType()` (lowercase `ArtifactType` values matching Postgres), and title from the filename. When the artifact is found in Postgres, the authoritative `title` and `type` from the `Artifact` row override the path-derived values
3. **Postgres lookup:** The classifier looks up the artifact by path in Postgres to get the ID for the "View" link. If found, `viewHref = /artifacts?id=${id}`. If not found, `viewHref = '/artifacts'`
4. **Promotion:** The `AgentService` calls the classifier after emitting `TOOL_CALL_RESULT`. If the classifier returns a `ToolCallPromotedEvent`, the `AgentService` emits `TOOL_CALL_PROMOTED` on `SessionEventsService`
5. **Frontend:** `ConversationPane` listens for `TOOL_CALL_PROMOTED`. It finds the matching tool call by `toolCallId`, sets its `semantic` field, and `ChatMessageList` renders `SemanticPill` instead of `ToolPill`
6. **Confirmed success only:** The classifier only returns a promotion event when the git commit output indicates success. A failed commit returns `null` — the Tool Pill renders as error-state (AC-3)
7. **Multiple commits:** Each `git commit` produces a separate `TOOL_CALL_PROMOTED` event with its own `toolCallId`, promoting each Tool Pill independently at its stream position

### How AC-3 Is Satisfied

AC-3 ("Error-state Tool Pill on failed git commit") is satisfied by: the classifier returns `null` for a failed commit (output contains error indicators). The `TOOL_CALL_RESULT` event still reaches the frontend, and the ToolPill renders with `status: 'error'` and `negative` styling. The working-tree indicator (FR14) is Story 3.6 scope — Story 3.4 ensures the error-state Tool Pill renders correctly; the indicator's dirty state is Story 3.6's responsibility.

### How AC-4 Is Satisfied

AC-4 ("Error-state Tool Pill on any failed tool call") is satisfied by: when a `TOOL_CALL_RESULT` content indicates an error (the tool result contains error text, or the classifier didn't promote it and the result is an error), the `ConversationPane` sets the tool call's `status` to `'error'` and `errorMessage` to the content. The ToolPill renders with `negative` border and text, and the error message is available in the expanded view.

### How AC-5 Is Satisfied

AC-5 ("Circuit breaker + heartbeat") is satisfied by:

1. **Circuit breaker:** `AgentService.runTurn` sets a 120s timer that resets on every emitted event. If no events are emitted for 120s during an active run, the timer fires: the agent is aborted (`abortController.abort()` + `query.interrupt()`), `terminateProcess` is called (no-op for host-process agents but kept for interface compliance), and `RUN_ERROR` is emitted with "The agent stopped unexpectedly. Send a new message to try again." The frontend renders this as a system message (EXPERIENCE.md line 263)
2. **Heartbeat:** `StreamingController` writes `: heartbeat\n\n` comment frames every 15 seconds. These are ignored by `EventSource` but keep the connection alive and let the browser detect dead connections (if no data arrives within a timeout, the browser's `EventSource` reconnects). The heartbeat is cleared on connection close, stream complete, and stream error

### Architecture Compliance

- **Global prefix `/api`** — no new endpoints (Story 3.4 extends existing SSE and agent infrastructure)
- **Raw resource body on success** — N/A (no new REST endpoints)
- **`{ code, message, meta }` error envelope** — N/A (errors flow through SSE events, not REST)
- **Zod + nestjs-zod** — N/A (no new DTOs)
- **Boundary JWT** — N/A (no new browser→agent-be REST calls; SSE already authenticated)
- **`IAgentService` test seam** — `AGENT_SERVICE` Symbol DI token (existing). `ToolPillClassifierService` is a regular provider (not a test seam — DP-3)
- **Tenant isolation** — the classifier's Postgres lookup uses `userId` to derive `repoConnectionId` (tenant scope). The `where: { repoConnectionId, path }` filter IS the tenant authorization check
- **SSE endpoint pattern** — `StreamingController` already follows the manual `@Get()` + `@Res()` pattern (project-context.md line 131). Story 3.4 adds heartbeat to the existing endpoint
- **`ReplaySubject` for SSE event buffers** — `SessionEventsService` uses `ReplaySubject<SseEvent>(100)` (project-context.md line 132). Do NOT change — late subscribers receive missed events including TOOL_CALL_PROMOTED
- **Fire-and-forget background pipelines** — `runTurn` is already fire-and-forget (project-context.md line 133). The circuit breaker timer is cleaned up in `finally`
- **`OnModuleDestroy`** — `AgentService` already implements this. Story 3.4 adds circuit breaker timer cleanup to `onModuleDestroy`
- **`select` projection on Prisma reads** — the classifier's `repoConnection.findUnique` and `artifact.findFirst` use `select` (project-context.md line 148)
- **`logger.warn()` in catch blocks that return a default** — the classifier's Postgres lookup catch block logs at `warn` and returns `viewHref = '/artifacts'` (project-context.md line 128)
- **No global client-state library** — ToolPill expand/collapse uses local `useState`. No Redux/Zustand/React Query
- **Server Components are default** — all new components are `'use client'` (they need browser interaction). No Server Component changes
- **Co-located tests** — `*.spec.ts` / `*.test.tsx` next to source
- **`userEvent.type()` over `fireEvent.change`** — N/A (no new text inputs)
- **`transformIgnorePatterns`** — N/A (no new ESM-only packages)
- **Markdown rendering** — N/A (ToolPill/SemanticPill don't render markdown; system messages are plain text)
- **Standard focus ring** — `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` on ToolPill and SemanticPill link (project-context.md line 159)
- **`role="status"` + `aria-live="polite"`** — ToolPill uses `role="button"` (interactive), SemanticPill uses `role="status"` (EXPERIENCE.md line 397)
- **Deliberate cross-service logic duplication** — the classifier's path-to-type mapping is deliberately duplicated from `apps/web/src/lib/artifacts.ts` `deriveArtifactType()`. Per project-context.md line 139, the architecture forbids a shared utility library beyond `libs/shared-types` (types) and `libs/database-schemas` (Prisma). The two mappings must stay in sync. When the artifact is found in Postgres, the authoritative `type` from the `Artifact` row is used instead (no duplication needed for that lookup)
- **Shell-quote all interpolated values in sandbox process commands** — N/A (no new sandbox commands; the agent runs its own tools inside the sandbox)

### Library/Framework Requirements

**No new packages to install.** All dependencies are already installed by Story 3.3:

- `@ag-ui/core@0.0.57` — AG-UI event types (already installed). Story 3.4 uses `ToolCallArgsEvent`, `ToolCallResultEvent` types
- `@anthropic-ai/claude-agent-sdk@0.3.177` — Claude Code Agent SDK (already installed). Story 3.4 extends the SDK message handling for tool results
- `react-markdown@^10.1.0` + `remark-gfm@^4.0.1` — already installed (used by AgentMessage)
- `rxjs@^7.8.0` — `ReplaySubject` for SSE (already installed)
- `jose` — boundary JWT (already installed)

### File Structure Requirements

New files in `apps/agent-be/` (exist as RED-phase stubs — implement in place):
```
src/
└── streaming/
    ├── tool-pill-classifier.service.ts       # git commit → Semantic Pill promotion (Task 4.1 — implement, replace stub)
    ├── tool-pill-classifier.service.spec.ts  # unit tests (Task 4.2 — un-skip existing tests)
    └── agent.service.unit.spec.ts            # real AgentService tests (Task 5.6 — un-skip existing tests)
```

New files in `apps/web/` (exist as RED-phase stubs — implement in place):
```
src/
└── components/
    └── conversation/
        ├── ToolPill.tsx                      # full Tool Pill component (Task 2.1 — implement, replace stub)
        ├── ToolPill.test.tsx                 # tests (Task 2.2 — un-skip existing tests)
        ├── SemanticPill.tsx                 # Semantic Pill component (Task 3.1 — implement, replace stub)
        └── SemanticPill.test.tsx            # tests (Task 3.2 — un-skip existing tests)
```

Modified files:
- `libs/shared-types/src/ag-ui.types.ts` — ~~add `TOOL_CALL_PROMOTED_EVENT` type~~ **already done** (Task 1.1)
- `libs/shared-types/src/index.ts` — ~~barrel-export new type~~ **already done** (Task 1.1)
- `apps/web/src/components/conversation/types.ts` — ~~extend `ChatMessage` with `toolCall` field and `role: 'system'`~~ **already done** (Task 1.2)
- `apps/agent-be/src/streaming/agent.service.ts` — full tool call lifecycle, circuit breaker, classifier integration (Tasks 5.1-5.4)
- `apps/agent-be/src/streaming/agent.service.spec.ts` — tool call + circuit breaker tests (Task 5.6)
- `apps/agent-be/src/streaming/streaming.module.ts` — add `ToolPillClassifierService` provider (Task 5.5)
- `apps/agent-be/src/streaming/streaming.controller.ts` — add heartbeat interval (Task 6.1)
- `apps/agent-be/src/streaming/streaming.controller.spec.ts` — heartbeat tests (Task 6.2)
- `apps/agent-be/test/helpers/agent-service.fake.ts` — extend with tool call lifecycle support (Task 8.1)
- `apps/web/src/components/conversation/ChatMessageList.tsx` — handle toolCall + system messages (Task 7.1)
- `apps/web/src/components/conversation/ConversationPane.tsx` — tool call listeners, system messages, remove ToolExecutionIndicator (Task 7.2)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — tool pill + semantic pill + system message tests (Task 7.4)
- `apps/web/src/components/conversation/ChatComponents.test.tsx` — remove ToolExecutionIndicator tests (Task 7.3)

Deleted files:
- `apps/web/src/components/conversation/ToolExecutionIndicator.tsx` — superseded by `ToolPill.tsx` (Task 7.3)

### Testing Requirements

- **Test organization:** co-located `*.spec.ts` / `*.test.tsx` next to source
- **Test priority tags:** `[P0]` for AC coverage (100% pass required), `[P1]` for edge cases (≥95% pass)
- **`buildTestModule()`** — use for agent-be tests. `ToolPillClassifierService` is a regular provider — override via `.overrideProvider(ToolPillClassifierService)` if needed
- **`AgentServiceFake`** — use `setScript(events)` with full tool call lifecycle events. Use `setToolCallScript(toolName, input, output, promoted?)` helper for tool call tests
- **Fake timers for circuit breaker** — `jest.useFakeTimers()` in `AgentService` circuit breaker tests. Advance with `jest.advanceTimersByTime(120_000)` to trigger the timeout. Verify the timer resets on event emission by advancing partially, emitting an event, then advancing again
- **Fake timers for heartbeat** — `jest.useFakeTimers()` in `StreamingController` heartbeat tests. Advance with `jest.advanceTimersByTime(15_000)` to trigger heartbeat
- **Mock `EventSource`** — extend the existing `MockEventSource` pattern. The `emit(eventType, data)` helper already supports any event type — just call `MockEventSource.emit('TOOL_CALL_ARGS', { toolCallId, delta })` etc.
- **Mock `react-markdown`** — already in place in `ConversationPane.test.tsx` (lines 22-27). ToolPill/SemanticPill tests don't need it (they don't render markdown)
- **Mock `next/navigation`** — already in place (`useRouter` mock). SemanticPill uses `<Link>` — mock `next/link` as a render stub if needed
- **`@jest-environment jsdom`** — for all React component tests
- **`@jest-environment node`** — N/A for Story 3.4 (no WebCrypto usage)
- **Prisma mocking** — mock `PrismaService` for `ToolPillClassifierService` tests: `jest.mock('../../src/prisma/prisma.service')` or inject a mock instance. Mock `repoConnection.findUnique` and `artifact.findFirst`

### Previous Story Intelligence

- **Story 3.3 (done):** Delivered streaming agent conversation with AG-UI events, back-pressure, chat components, draft persistence, stop button. Key learnings applied to Story 3.4:
  - `streamingMessageIdRef` pattern (ref mirror of state for stale-closure avoidance in EventSource listeners — project-context.md line 116). The same pattern applies to tool call state: if tool call updates are in state, use a ref for the active tool call ID in event listeners
  - `AgentServiceFake` mimics production side effects (Turn persistence, terminateProcess). Story 3.4 extends the fake to emit the full tool call lifecycle
  - The agent runs in the host process via SDK `query()` (not inside the sandbox). `terminateProcess` is a no-op for host-process agents. The circuit breaker calls it for interface compliance but relies on `abortController.abort()` + `query.interrupt()` for actual termination
  - `@anthropic-ai/sdk@0.110.0` is installed as a dev dependency (peer dep for types). The SDK's `query()` function yields `SDKMessage` objects. Tool results come as a separate message type — read the SDK types to find the exact discriminator
  - The `__mocks__/claude-agent-sdk.ts` mock throws on call — the real SDK is never loaded in tests. `AgentServiceFake` is injected via `AGENT_SERVICE` override
  - `react-markdown` v10 is ESM-only; component tests mock it as a render stub
  - All 603 tests pass (53 agent-be + 550 web). Lint: 0 errors. Typecheck: clean
- **Story 3.2 (done):** Delivered slash command picker, message sending, URL transition. Key learnings: `userEvent.type()` for React 19, `Array.isArray` guard, `select` projection, `.max()` on DTOs
- **Story 3.1 (done):** Delivered foundational infrastructure. Key patterns: `buildTestModule()`, `SandboxServiceFake`, `jose` for JWT, `ReplaySubject` for SSE, fire-and-forget, `findFirst` for tenant-scoped lookups
- **Story 2.5 (done):** Established the `react-markdown` synchronous `Markdown` component pattern. ESM default-export mock: `{ __esModule: true, default: ... }`
- **Story 2.1 (done):** Delivered `Artifact` Prisma model and `syncArtifactsAction`. The `Artifact` model has `id`, `path`, `type`, `title`, `status`, `content`. The `@@unique([repoConnectionId, path])` constraint means path is unique per repo connection. The classifier looks up artifacts by path

### Git Intelligence

- Recent commits: `d357b97 docs(test-arch): add Epic 2 traceability matrix`, `a3d4896 fix(web): reclassify oauth decrypt failures as credential errors`, `1ec9f32 feat(epics): implement epic 2 artifact mirroring and project map browsing`. Epic 1 and Epic 2 are complete. Stories 3.1, 3.2, 3.3 are done. Story 3.4 is the fourth story in Epic 3
- The agent-be streaming module has `AgentService`, `StreamingController`, `SessionEventsService`, `StreamingModule` from Stories 3.1/3.3. Story 3.4 adds `ToolPillClassifierService` and extends `AgentService` + `StreamingController`
- The web app has the conversation components from Story 3.3. Story 3.4 adds `ToolPill`, `SemanticPill` and extends `ConversationPane`, `ChatMessageList`, `types.ts`
- Pre-existing RED-phase scaffolding exists for Story 3.4 (uncommitted, created by a prior ATDD session). See "Pre-Existing RED-Phase Scaffolding" under What Already Exists. Tasks 1.1 and 1.2 are already complete; component/service stubs and skipped test files exist for Tasks 2.1–4.2 and 5.6 — implement in place, do not create new files

### Project Structure Notes

**Alignment with architecture directory structure:**

- `apps/agent-be/src/streaming/tool-pill-classifier.service.ts` — matches architecture line 577: `tool-pill-classifier.service.ts # FR-12 — promotes commits to Semantic Pills`
- `apps/web/src/components/conversation/ToolPill.tsx` — matches architecture line 502: `ToolPill.tsx # FR-12`
- `apps/web/src/components/conversation/SemanticPill.tsx` — matches architecture line 503: `SemanticPill.tsx # FR-12 — "Progress saved"`
- `apps/agent-be/src/streaming/agent.service.ts` — the architecture lists `agui-event-bridge.service.ts` separately (line 576: "JSONL→AG-UI passthrough, circuit breaker, heartbeat"). Story 3.3 folded the event bridge into `AgentService` (DP-3). Story 3.4 adds the circuit breaker to `AgentService` and the heartbeat to `StreamingController`. The `agui-event-bridge.service.ts` file is not created — its responsibilities are distributed across `AgentService` (event bridging, circuit breaker) and `StreamingController` (heartbeat). This is a deliberate variance from the architecture's file listing, recorded per DP-3

**Variance from architecture:**

- `agui-event-bridge.service.ts` is not created as a separate file — its responsibilities (JSONL→AG-UI passthrough, circuit breaker) are folded into `AgentService`. The heartbeat is in `StreamingController`. Per DP-3, simplest reversible option — if the bridge logic becomes complex, it can be extracted
- `ToolPillClassifierService` is a regular provider, not a Symbol-token test seam. Per DP-3, simplest option — it's a pure classification service with no alternate implementation

### Out of Scope (Do Not Implement)

- **Credential failure propagation (CREDENTIAL_FAILURE event, 401 detection):** Story 3.7 scope. The classifier does not inspect tool results for 401 patterns
- **Access denied propagation (ACCESS_DENIED event, 403 classification):** Story 3.7 scope
- **Working tree indicator (dirty/clean UI, FR14):** Story 3.6 scope. AC-3's mention of "the FR14 working-tree indicator remains dirty" describes future behavior, not a Story 3.4 implementation requirement
- **Manual commit (Save button, FR15):** Story 3.6 scope. Story 3.4 handles only agent-initiated `git commit`
- **Working tree state events (WORKING_TREE_DIRTY, WORKING_TREE_CLEAN):** Story 3.6 scope
- **Conversation resume ("Reconnecting…" state):** Story 3.5 scope
- **Cost tracking (per-user LLM spend, NFR-O1):** Story 3.8 scope
- **Mid-session idle timeout:** Story 3.9 scope
- **Commit identity verification:** Story 3.10 scope
- **Concurrent conversations:** Story 3.11 scope
- **SSE drain on deploy:** Story 3.12 scope
- **Full artifact sync pipeline (agent-be `artifacts.service.ts`):** The classifier does a read-only Postgres lookup; the sync pipeline (scanning `_bmad-output/` post-commit and mirroring to Postgres) is a separate concern
- **Recognized actions beyond `git commit`:** MVP scope is `git commit` only (PRD FR-12: "For MVP, `git commit` is the only action that receives Semantic Pill promotion; all other tool calls remain as standard Tool Pills")
- **`@assistant-ui/react-ag-ui` integration:** Not installed (Story 3.3 DP-2/DP-3 decision)

### Deferred Findings

The following gaps were identified during story creation but are out of Story 3.4's acceptance criteria. Recorded per DP-5 (defer scope temptation):

- **Architecture doc does not codify the agent invocation mechanism:** `architecture.md` describes the data flow as "sandbox process exec (Claude Code agent) → sandbox-agent JSONL → agui-event-bridge → SSE → browser" but the actual SDK runs the agent in the host process. Story 3.3's review already recorded this (DP-2). The circuit breaker's `terminateProcess` call is a no-op for host-process agents. **Owner: architect (reconcile architecture doc with SDK reality).**
- **`agui-event-bridge.service.ts` folded into `AgentService`:** The architecture lists it as a separate service (line 576). Story 3.3 folded event bridging into `AgentService`; Story 3.4 adds the circuit breaker there too. The heartbeat is in `StreamingController`. If the bridge logic becomes complex, it may warrant extraction. **Owner: architect / future refactoring.**
- **Circuit breaker timeout not empirically validated:** The 120s default is a reasonable starting point but not empirically validated. The agent may legitimately take >120s for complex operations (long builds, large file reads). The timeout is configurable via `CIRCUIT_BREAKER_TIMEOUT_MS` env var. Tuning requires real-world usage data. **Owner: integration testing / production tuning.**
- **Heartbeat interval not empirically validated:** The 15s default is a common SSE heartbeat interval but not empirically validated. Too frequent wastes bandwidth; too infrequent delays dead-connection detection. **Owner: production tuning.**
- **Artifact type derivation is heuristic:** The classifier derives artifact type from committed file paths using a path-to-type mapping. The mapping may not cover all BMAD artifact types. The `Artifact.type` field in Postgres may have different values. The classifier should match the existing artifact types — check the `ArtifactType` type in `libs/shared-types` and existing artifact data. **Owner: dev agent (verify mapping against existing types).**
- **Tool result error detection is heuristic:** The `ConversationPane` determines if a tool call failed by inspecting the `TOOL_CALL_RESULT` content for error indicators. The AG-UI protocol doesn't have a separate "tool call failed" event — the result content contains the error. The heuristic (checking for error patterns in the content) may not cover all error cases. The classifier's `null` return for failed commits is the primary signal; non-commit tool failures rely on content inspection. **Owner: future hardening.**
- **Concurrent-turn guard still missing:** Story 3.3's deferred finding noted `sendTurn` doesn't guard against concurrent invocations. Story 3.4 doesn't add this guard. **Owner: post-MVP hardening / Story 3.11.**

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 3.4 (lines 683-713), Epic 3 description (lines 580-583), FR12 (line 42), UX-DR5 (line 143), UX-DR6 (line 145), circuit breaker + heartbeat (lines 120, 710-713)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Cross-Cutting Concern 3 (line 90: circuit breaker, heartbeat, back-pressure), `tool-pill-classifier.service.ts` (line 577), `agui-event-bridge.service.ts` (line 576), `ToolPill.tsx` (line 502), `SemanticPill.tsx` (line 503), AG-UI data flow (line 669), component boundaries (line 628), sandbox-agent reliability (line 115)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` — Tool Pill component spec (lines 92-99, 339-341), Semantic Pill component spec (lines 101-108, 343-345), focus ring (line 156), monospace usage (line 242), radius scale (line 295)
- EXPERIENCE.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` — Tool Pills and Semantic Pills (lines 139-152), tool execution indicator (line 134), Conversation Surface States — circuit breaker row (line 263), Agent Processing States (lines 265-274), Accessibility Floor (lines 373-407)
- UX decision log: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/.decision-log.md` — Story 3.4 circuit-breaker termination decision (lines 81-86): system message distinct from Tool Pill error pattern
- Project context: `_bmad-output/project-context.md` — NestJS patterns (lines 115-140), Next.js patterns (lines 85-113), testing rules (lines 163-204), SSE patterns (lines 131-136), focus ring (line 159), `select` projection (line 148), `logger.warn()` in catch blocks (line 128), `ReplaySubject` for SSE (line 132), fire-and-forget (line 133), `OnModuleDestroy` (line 134), stale closure avoidance (line 116)
- Decision policy: `_bmad-output/decision-policy.md` — DP-2 (spec contradiction), DP-3 (simplest reversible option), DP-4 (test-only changes), DP-5 (defer scope temptation)
- Previous story: `_bmad-output/implementation-artifacts/3-3-converse-with-the-streaming-agent.md` — Story 3.3 delivered streaming agent, AG-UI events, chat components. Key: `AgentService` (extend), `ConversationPane` (extend), `ToolExecutionIndicator` (replace with ToolPill), `AgentServiceFake` (extend), `StreamingController` (extend with heartbeat), `ChatMessage` type (extend). Review findings: agent runs in host process (DP-2), duplicate RUN_FINISHED fixed, messageId mismatch fixed, stale closure bug fixed with ref
- AG-UI protocol: `@ag-ui/core` event types — `ToolCallStartEvent` (`toolCallId`, `toolCallName`, `parentMessageId`), `ToolCallArgsEvent` (`toolCallId`, `delta`), `ToolCallEndEvent` (`toolCallId`), `ToolCallResultEvent` (`messageId`, `toolCallId`, `content`, `role`)
- Prisma schema: `libs/database-schemas/src/prisma/schema.prisma` — `Artifact` model (lines 57-74: `id`, `path`, `type`, `title`, `@@unique([repoConnectionId, path])`), `Conversation` model (lines 76-89), `Turn` model (lines 91-102)
- Implementation: `apps/agent-be/src/streaming/agent.service.ts` (extend — tool call lifecycle, circuit breaker), `apps/agent-be/src/streaming/streaming.controller.ts` (extend — heartbeat), `apps/agent-be/src/streaming/session-events.service.ts` (no change — AgentService uses it), `apps/web/src/components/conversation/ConversationPane.tsx` (extend — tool call listeners), `apps/web/src/components/conversation/ChatMessageList.tsx` (extend — toolCall + system rendering), `apps/web/src/components/conversation/types.ts` (extend — ChatMessage), `apps/web/src/components/conversation/ToolExecutionIndicator.tsx` (delete — replaced by ToolPill), `libs/shared-types/src/ag-ui.types.ts` (extend — TOOL_CALL_PROMOTED)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
