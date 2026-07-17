---
baseline_commit: 6e5f908e8a6b7dd831de8365e227774f4fdccd78
---

# Story 6.3: Migrate AgentService to Sandbox-Based Execution

Status: done

## Story

As a developer on the bmad-easy team,
I want `AgentService.runTurn()` to launch the agent inside the Daytona sandbox via sandbox-agent instead of the host-based SDK `query()`,
so that the agent has direct filesystem access to the cloned repository and can read files, run git commands, and modify the working tree.

## Acceptance Criteria

1. **AC-1: `runTurn()` launches sandbox-agent inside the sandbox.** Given `AgentService.runTurn()` currently uses `@anthropic-ai/claude-agent-sdk`'s `query()` function (host-based subprocess), when this story is implemented, then `runTurn()` launches sandbox-agent inside the sandbox via the Daytona process session API and streams output via `agui-event-bridge.service.ts` (Story 6.2). The agent has direct filesystem access to the cloned repository inside the sandbox.

2. **AC-2: Agent cannot access host filesystem.** Given the agent runs inside the sandbox, when the migration is complete, then the agent cannot access the host filesystem (`.env`, `AUTH_SECRET`, `DATABASE_URL`, `DAYTONA_API_KEY`, source code, other conversations' repos). Platform-internal credentials are never injected into the sandbox — only `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` (per-user OAuth token) are injected via `daytona.create()` envVars (Story 6.1).

3. **AC-3: `stop()` terminates the real sandbox process.** Given the user activates the Stop button during an agent turn, when `stop()` is called, then it terminates the agent process inside the sandbox via `sandboxService.terminateAgentSession()` (which calls `sandbox.process.deleteSession()` — the Daytona SDK has no `terminateProcess` method; `deleteSession` is the correct termination mechanism per Story 6.2 DP-2 decision). The SSE channel emits the appropriate lifecycle event (`RUN_FINISHED`).

4. **AC-4: Host-based SDK code removed.** Given the host-based `query()` import and `AGENT_WORKDIR` / `tmpdir()` cwd logic, when the migration is complete, then the `@anthropic-ai/claude-agent-sdk` import is removed from `AgentService` (the SDK is no longer used for execution), `AGENT_WORKDIR` env var is removed (irrelevant — the agent runs inside the sandbox), and the `cwd: process.env.AGENT_WORKDIR ?? tmpdir()` logic is removed.

5. **AC-5: `AgentServiceFake` updated.** Given `AgentServiceFake` (test-only, implements `IAgentService`), when the migration is complete, then the fake is updated to reflect the new execution mechanism's side effects (DB writes, `terminateProcess` calls, SSE event emission) so integration tests assert on real behavior.

6. **AC-6: Circuit breaker adapted.** Given the existing circuit breaker uses `abortController.abort()` + `query.interrupt()` to stop the agent, when the migration is complete, then stopping the agent calls `aguiEventBridgeService.stop(conversationId)` (which terminates the sandbox process via `deleteSession`). The timer-based stall detection (reset on every emitted event, fire on timeout) remains the same; only the termination mechanism changes. The `query.interrupt()` call is removed.

7. **AC-7: Preserved behaviors remain functional.** Given the SSE event pipeline, AG-UI event types, tool-pill classifier, cost tracking, pending classifier promises pattern, and working-tree emission after file-modifying tool calls are transport-agnostic, when the migration is complete, then these behaviors continue to work — they consume AG-UI events regardless of where the agent runs.

8. **AC-8: Turn persistence and cost tracking still work.** Given the SDK's terminal `result` message carries cost data, when the agent run completes, then cost data is still captured and persisted via `CostTrackingService` (with the `Number.isFinite` guard). The assistant turn is still persisted to Postgres with `accumulatedText` and `segments`. If sandbox-agent surfaces cost data in a `RUN_FINISHED` event's `data` payload (or a dedicated event), intercept and persist it. If sandbox-agent does not surface cost data, document the gap.

## Tasks / Subtasks

- [x] **Task 1: Add event observation mechanism to `AguiEventBridgeService`** (AC: #1, #7, #8)
  - [x] 1.0: **Re-throw on abort in `streamAgentEvents()` (DP-2 correction).** Story 6.2's catch block in `streamAgentEvents()` swallows all rejections — the method resolves in every case. Add `throw _err;` at the end of the catch block (after the `if (!activeRun.aborted)` handling block) so the method rejects with the sentinel (`AGENT_STOPPED`, `AGENT_STREAM_TIMEOUT`, `MODULE_DESTROYING`) on abort and resolves only on normal completion. This is required for `AgentService.runTurn()`'s catch block to distinguish outcomes (see Dev Notes — "Abort-initiated rejection handling"). Update the existing Story 6.2 tests in `agui-event-bridge.service.spec.ts` that assert `streamAgentEvents()` resolves on stop/timeout — they must now assert rejection with the correct sentinel. This is a one-line production change plus test updates; it does NOT alter the circuit breaker, timer, or termination logic.
  - [x] 1.1: ACTIVATE existing test seam — the ATDD workflow already added `onEvent?: (event: SseEvent) => void` to `AguiEventBridgeParams` and the `SseEvent` type import in `agui-event-bridge.service.ts`. The dev implements the branching logic in `processAgentEvent()`: call `onEvent` BEFORE `sessionEvents.emit()` for non-lifecycle events; for lifecycle events (`RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`), call `onEvent` but SKIP `sessionEvents.emit()` (AgentService owns lifecycle emission to SSE). Add the `LIFECYCLE_EVENTS = new Set([EventType.RUN_STARTED, EventType.RUN_FINISHED, EventType.RUN_ERROR])` constant. Implementation: in `processAgentEvent()`, before `sessionEvents.emit()`, check `if (onEvent && LIFECYCLE_EVENTS.has(type)) { onEvent({ event: type, data }); return; }`. Non-lifecycle events follow the normal path: `onEvent` is called, then `sessionEvents.emit()`.
  - [x] 1.2: **Add `cwd?: string` field to `AguiEventBridgeParams`** and forward it to `createAgentSession`. The event bridge currently calls `this.sandboxService.createAgentSession(sandboxId, command)` with only 2 args — the `cwd` parameter (3rd arg, optional on `ISandboxService.createAgentSession`) is not forwarded. `AgentService.runTurn()` passes `cwd: 'repo'` (the `REPO_SUBDIRECTORY` value — see Task 4.1) so `createAgentSession` prefixes the command with `cd ${shellQuote(cwd)} &&` (shell-quoting handled by `SandboxService`, not `AgentService`). Update `streamAgentEvents()` to destructure `cwd` from params and pass it: `this.sandboxService.createAgentSession(sandboxId, command, params.cwd)`. Update `SandboxServiceFake.streamAgentLogs` — the fake's `streamAgentLogs` already invokes `onStdout`/`onStderr`; the `onEvent` callback is invoked by the event bridge, not the fake.
  - [x] 1.3: ACTIVATE existing skipped test blocks in `agui-event-bridge.service.spec.ts` — the ATDD workflow already scaffolded 4 skipped tests in the "onEvent callback (event observation mechanism)" `describe.skip` block: (a) `onEvent` is called before `sessionEvents.emit()` for non-lifecycle events when the callback is provided, (b) lifecycle events (`RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`) are passed to `onEvent` but NOT forwarded to `sessionEvents.emit()` when `onEvent` is provided, (c) lifecycle events still emit via `sessionEvents.emit()` when no callback is provided (backward compat), (d) non-lifecycle events still emit when no callback is provided (backward compat). Remove `describe.skip()` to activate.

- [x] **Task 2: Rewrite `AgentService.runTurn()` to use sandbox-based execution** (AC: #1, #2, #4, #6, #7, #8)
  - [x] 2.1: Remove the `@anthropic-ai/claude-agent-sdk` import (`query`, `Query`, `SDKMessage`). Remove the `tmpdir` import from `os`. Remove the `ActiveRun.query` field (replace with `aguiEventBridgeService` reference or conversation ID for `stop()` lookup).
  - [x] 2.2: Inject `AguiEventBridgeService` into `AgentService` constructor. Update `StreamingModule` if needed (both services are in the same module — `AguiEventBridgeService` is already a provider).
  - [x] 2.3: Rewrite `runTurn()`: emit `RUN_STARTED`, construct the sandbox-agent invocation command (see Dev Notes — sandbox-agent CLI interface), call `aguiEventBridgeService.streamAgentEvents({ conversationId, sandboxId, command, cwd, userId, onEvent })` where `onEvent` accumulates text/segments, triggers classifier on `TOOL_CALL_RESULT`, emits working-tree events after file-modifying tool calls, and captures cost data. After `streamAgentEvents` resolves (normal completion only): await pending classifier promises, record cost, persist turn, emit `RUN_FINISHED`. On rejection: check `err instanceof Error && (err.message === 'AGENT_STOPPED' || err.message === 'AGENT_STREAM_TIMEOUT' || err.message === 'MODULE_DESTROYING')` — if so, skip `RUN_ERROR` (the event bridge already emitted `RUN_ERROR` for `AGENT_STREAM_TIMEOUT`; `stop()` handles `RUN_FINISHED` for `AGENT_STOPPED`; `MODULE_DESTROYING` is shutdown). For all other errors, emit `RUN_ERROR` with the error message. In `finally`: clean up all per-run state.
  - [x] 2.4: Move the `processStreamEvent` / `processAssistantMessage` / `processUserMessage` logic into the `onEvent` callback. The event bridge emits raw AG-UI events; `AgentService`'s `onEvent` observes them for state accumulation and side effects. The SDK-specific message types (`assistant`, `user`, `result`) no longer exist — the event bridge emits AG-UI events directly. Map the `onEvent`-received events to the existing accumulation logic: `TEXT_MESSAGE_CONTENT` → accumulate text; `TOOL_CALL_START`/`ARGS`/`END`/`RESULT` → build segments + run classifier; `RUN_FINISHED` → capture cost if present in data payload. For the classifier call on `TOOL_CALL_RESULT`: the AG-UI event carries `{ toolCallId, content, isError }` but not `toolName` or `input`. Look up the segment by `toolCallId` (segments are built during `TOOL_CALL_START`/`ARGS`/`END`) to get `toolName` and `input` for `classifier.classifyToolResult(toolCallId, toolName, input, content, userId)` — this replaces the old `activeToolCalls` map lookup.
  - [x] 2.5: Remove the `abortPromise` / `Promise.race([iterator.next(), abortPromise])` pattern. The event bridge handles its own circuit breaker (Story 6.2's `AGENT_STREAM_TIMEOUT_MS`). `AgentService`'s circuit breaker timer is removed — the event bridge owns stall detection. `AgentService` handles only the `streamAgentEvents()` promise resolution/rejection.

- [x] **Task 3: Adapt `stop()` and `onModuleDestroy()`** (AC: #3, #6)
  - [x] 3.1: Rewrite `stop()`: call `aguiEventBridgeService.stop(conversationId)` (which terminates the sandbox process via `deleteSession`), await pending classifier promises, emit `RUN_FINISHED`, clean up per-run state. Remove the `activeRun.query.interrupt()` call.
  - [x] 3.2: Rewrite `onModuleDestroy()`: call `aguiEventBridgeService.stop(conversationId)` for each active run (fire-and-forget with `.catch(logger.error)`), clear all per-run state maps. The event bridge's own `onModuleDestroy` handles session termination — but calling `stop()` ensures the event bridge's `rejectStream` fires so `streamAgentEvents()` rejects and `AgentService`'s try/catch/finally runs. **Provider registration order (load-bearing):** `StreamingModule` registers `AguiEventBridgeService` before `AgentService` in the providers array. NestJS runs `onModuleDestroy` in reverse registration order, so `AgentService.onModuleDestroy()` runs FIRST — its `stop()` calls find the event bridge's active runs still intact. Do NOT reorder the providers in `streaming.module.ts` or `AgentService`'s `stop()` calls will be no-ops (the event bridge already cleared its runs).

- [x] **Task 4: Construct the sandbox-agent invocation command** (AC: #1)
  - [x] 4.1: Determine the sandbox-agent CLI invocation that produces JSONL-on-stdout (AG-UI-compatible event types). Story 6.2 research found sandbox-agent is an HTTP server, but the event bridge contract expects JSONL on stdout. The command likely runs sandbox-agent in a mode that streams events to stdout, or pipes its HTTP SSE output to stdout. Resolve by reading sandbox-agent docs or running `sandbox-agent --help` in a provisioned sandbox. The `cwd` is `REPO_SUBDIRECTORY` (`'repo'`) — `REPO_SUBDIRECTORY` is a private module-level constant in `sandbox.service.ts` (not exported). Define a local constant in `agent.service.ts` (e.g. `const REPO_SUBDIRECTORY = 'repo';`) or export it from a shared location — do not duplicate the value without a named constant. Pass `cwd` to `streamAgentEvents` (Task 1.2 added the `cwd` field to `AguiEventBridgeParams`), which forwards it to `createAgentSession(sandboxId, command, cwd)` where `SandboxService` shell-quotes it and prefixes the command. **Regression guard scaffolds already exist** (skipped) in `agent.service.unit.spec.ts` — 4 credential-isolation + input-injection tests verify the command does not leak platform credentials and safely shell-quotes user input. Activate them after implementing the command construction with `shellQuote` on the user message.
  - [x] 4.2: If the sandbox-agent invocation cannot be resolved (no provisioned sandbox available for testing), construct a reasonable command based on sandbox-agent docs and flag it for Story 6.5 (real-service E2E) verification. The command string is the one piece of this story that can only be fully validated against a real sandbox.

- [x] **Task 5: Update `AgentServiceFake`** (AC: #5)
  - [x] 5.1: The fake already implements `IAgentService` and mimics side effects (DB writes, SSE emission, working-tree checks). Verify it still satisfies the interface after any `IAgentService` changes (the interface itself should not change — `runTurn`, `stop`, `isIdle` remain). Update the fake if `AgentService`'s observable side effects change (e.g., if `stop()` now calls `aguiEventBridgeService.stop()` — the fake doesn't use the event bridge, so no change needed unless integration tests assert on event bridge calls).

- [x] **Task 6: Remove `AGENT_WORKDIR` from env validation and `.env.example`** (AC: #4)
  - [x] 6.1: Check `apps/agent-be/src/config/env.validation.ts` — `AGENT_WORKDIR` is NOT in the Zod schema (it was never validated, only read via `process.env.AGENT_WORKDIR`). No change needed to `env.validation.ts`.
  - [x] 6.2: Check `apps/agent-be/.env.example` — if `AGENT_WORKDIR` is documented there, remove it. If not documented, no change needed.
  - [x] 6.3: Check `apps/agent-be/test/helpers/mock-query.ts` — if the mock-query helper is still referenced by `agent.service.unit.spec.ts`, either remove the mock-query helper (if the unit spec is rewritten to not use SDK mocks) or leave it (if the unit spec still tests SDK-specific behavior that's being removed). The `__mocks__/claude-agent-sdk.ts` mock can be removed if no test imports `@anthropic-ai/claude-agent-sdk` anymore.

- [x] **Task 7: Update tests** (AC: #1, #3, #4, #6, #7, #8)
  - [x] 7.1: ACTIVATE existing skipped test blocks in `agent.service.unit.spec.ts` — the ATDD workflow already scaffolded 19 skipped tests in Story 6.3 `describe.skip` blocks: runTurn rewrite (11 tests — streamAgentEvents call, RUN_STARTED before stream, text accumulation, tool-call segments, classifier integration, cost capture, RUN_FINISHED emission, concurrent-turn guard, error rejection, AGENT_STOPPED sentinel, AGENT_STREAM_TIMEOUT sentinel), stop/onModuleDestroy (3 tests), regression guards (4 tests — credential-isolation + input-injection for command construction), AC-4 SDK removal (1 test). Remove `describe.skip()` to activate. Remove the obsolete SDK-based test blocks (the old describe blocks that mock `query()` via `jest.doMock` with `createMockQuery`/`makeQueryFromGenerator`). Remove the cast in `createAgentServiceWithBridge` after updating the constructor (Task 2.2). The test coverage should remain equivalent: tool-call lifecycle, classifier integration, circuit breaker (now via event bridge), cost recording, concurrent-turn guard, segments persistence. Update tests that assert `streamAgentEvents` resolves on stop/timeout to assert rejection with the correct sentinel (Task 1.0 re-throw change).
  - [x] 7.2: Update `agent.service.spec.ts` (integration tests using `AgentServiceFake`) — verify the fake still works with the updated `AgentService` constructor (new `AguiEventBridgeService` dependency). If `AgentServiceFake` is injected via `AGENT_SERVICE` token override, the real `AgentService` is not instantiated in integration tests — verify this is still the case.
  - [x] 7.3: ACTIVATE existing skipped test — "stop() calls aguiEventBridgeService.stop(conversationId)" already scaffolded in the "stop() and onModuleDestroy() delegate to AguiEventBridgeService" `describe.skip` block in `agent.service.unit.spec.ts` (AC-3).
  - [x] 7.4: ACTIVATE existing skipped test — "onModuleDestroy() calls aguiEventBridgeService.stop() for each active run" already scaffolded in the same `describe.skip` block (AC-6).
  - [x] 7.5: Verify existing `conversations.service.spec.ts` and `manual-commit.service.spec.ts` still pass (they use `AgentServiceFake`, not the real `AgentService` — should be unaffected).

- [x] **Task 8: Pick up deferred findings** (AC: #4, #6)
  - [x] 8.1: **Defense-in-depth runtime guard (deferred-work.md line 522):** `agent.service.ts:99` used `ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? ''` — the `?? ''` silently injected an empty string. This code path is removed entirely by the migration (the API key is no longer used in `agent.service.ts` — it's injected into the sandbox environment by `SandboxService.provision()`, Story 6.1, which already has a defense-in-depth guard at line 103-105). No action needed beyond removing the code path. Mark as picked-up in `deferred-work.md`.
  - [x] 8.2: **`Promise.race` + `.catch(() => undefined)` safeguard (deferred-work.md line 535):** `agent.service.ts:117` used `await Promise.race([iterator.next(), abortPromise])` with no `.catch(() => undefined)` on `iterator.next()`. This code path is replaced by `aguiEventBridgeService.streamAgentEvents()`, which already uses the stored-reject-handle pattern with `.catch(() => undefined)` on the stream promise (Story 6.2, `agui-event-bridge.service.ts:105`). No action needed beyond removing the old code. Mark as picked-up in `deferred-work.md`.

- [x] **Task 9: Replace fabricated `MockEventSource` event shapes with recorded-session replay fixture** (AC: #7, carry-forward from SDK fidelity retro)
  - [x] 9.1: Per the epic dev notes, `ConversationPane.test.tsx` drives `MockEventSource` with hand-fabricated event shapes. The recorded-session replay fixture exists at `apps/agent-be/test/fixtures/sdk-session-replay.jsonl` (23 messages, implemented during the SDK fidelity retro). Replace the fabricated shapes in `ConversationPane.test.tsx` with this existing fixture. This closes SDK fidelity retro Finding 2 / Recommendation 2 and partially closes TD-3 for `ConversationPane`. Owner: Murat for the testing pattern; Amelia for the test files.

## Dev Notes

### What this story does

Migrates `AgentService.runTurn()` from host-based SDK `query()` execution to sandbox-based execution via `AguiEventBridgeService` (Story 6.2). The agent runs inside the Daytona sandbox where the repository is cloned, giving it direct filesystem access. `AgentService` delegates event streaming to the event bridge and focuses on state accumulation (text, segments), side-effect triggering (classifier, working-tree), cost capture, and turn persistence.

### What this story does NOT do

- Does NOT verify working-tree/commit/credential flows against real sandbox execution (Story 6.4)
- Does NOT run real-service E2E tests (Story 6.5)
- Does NOT modify `AguiEventBridgeService`'s circuit breaker, timer, or termination logic (Story 6.2 owns that — this story only adds the `onEvent` callback, the `cwd` field, and the one-line re-throw in the catch block so `streamAgentEvents()` rejects on abort instead of swallowing)
- Does NOT modify `SandboxService` session methods (Story 6.2 implemented them)
- Does NOT modify `StreamingController`, `SessionEventsService`, or `ToolPillClassifierService` (transport-agnostic, unchanged)

### Critical design decision: event observation via `onEvent` callback

**Decision (DP-3):** `AgentService` needs to observe AG-UI events as they stream from the event bridge — for text accumulation, segment building, classifier triggering, working-tree emission, and cost capture. Three approaches were considered:

1. **Subscribe to `SessionEventsService`'s `ReplaySubject`** — rejected: `ReplaySubject(100)` replays up to 100 buffered events on subscription, causing double-processing of events emitted before subscription (e.g., `RUN_STARTED`). Filtering adds complexity and the replay semantics are designed for SSE reconnect, not internal observation.
2. **Merge `AgentService` and `AguiEventBridgeService` into one service** — rejected: violates the separation established in Story 6.2 (event bridge owns transport + circuit breaker; `AgentService` owns state + side effects). Merging creates a god-class.
3. **Add `onEvent` callback to `AguiEventBridgeParams`** — chosen: simplest option. The event bridge calls `onEvent(event)` in `processAgentEvent()` before `sessionEvents.emit()`. `AgentService` provides the callback, accumulates state, and triggers side effects. No subscription, no replay issues, no circular dependencies. The callback is optional — the event bridge still works without it (backward compat for Story 6.2 tests).

### Lifecycle event ownership (prevents double emission)

sandbox-agent emits AG-UI-compatible lifecycle events (`RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`) that pass through the event bridge's `AGUI_EVENT_TYPES` check and would be forwarded to `sessionEvents.emit()`. `AgentService` also emits these lifecycle events at the appropriate points (Task 2.3). Without ownership boundaries, every lifecycle event is emitted twice.

**Decision (DP-3):** When `onEvent` is provided, the event bridge **skips** `sessionEvents.emit()` for lifecycle events (`RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`). `AgentService` owns lifecycle emission to SSE. The `onEvent` callback still receives lifecycle events (so `AgentService` can intercept cost data from `RUN_FINISHED`'s `data` payload per AC-8), but the event bridge does not forward them to SSE. This is the simplest option: no signature change, no new event types, just a `LIFECYCLE_EVENTS` Set check in `processAgentEvent()`. Non-lifecycle events (text, tool calls, working tree) follow the normal path: `onEvent` is called, then `sessionEvents.emit()`.

When `onEvent` is NOT provided (backward compat for Story 6.2 tests), the event bridge emits all events including lifecycle — preserving the existing Story 6.2 behavior.

### Abort-initiated rejection handling (prevents spurious RUN_ERROR / double RUN_FINISHED)

**Critical finding (DP-2):** Story 6.2's `AguiEventBridgeService.streamAgentEvents()` catches all rejections from `Promise.race` in its catch block and does **NOT** re-throw — the method **resolves** in every case (normal completion, circuit-breaker timeout, `stop()`, `onModuleDestroy`). The catch block emits `RUN_ERROR` itself on timeout (via `emitRunError`) when `!activeRun.aborted`. This contradicts the original design premise that `streamAgentEvents()` rejects on stop. Without correcting this, `AgentService.runTurn()`'s catch block would never fire on stop/timeout, causing: (a) double `RUN_FINISHED` (once from `runTurn()` after the await resolves, once from `stop()`), and (b) double `RUN_ERROR` on timeout (once from the event bridge, once from `AgentService`).

**Decision (DP-3):** The simplest fix is a one-line change to the event bridge: re-throw the caught error after handling, so `streamAgentEvents()` rejects on abort. Add `throw _err;` at the end of the catch block in `streamAgentEvents()` (after the `if (!activeRun.aborted)` block). This makes the method reject with the sentinel on stop/timeout/destroy, and resolve only on normal completion. `AgentService.runTurn()`'s catch block then checks for all three event-bridge sentinels:

- `AGENT_STOPPED` — `stop()` initiated; skip `RUN_ERROR` (`stop()` handles `RUN_FINISHED` per Task 3.1)
- `AGENT_STREAM_TIMEOUT` — circuit breaker fired; skip `RUN_ERROR` (the event bridge already emitted it via `emitRunError`); `RUN_FINISHED` in the try block is skipped because the rejection jumps to catch
- `MODULE_DESTROYING` — module shutting down; skip `RUN_ERROR` and `RUN_FINISHED` (SSE clients disconnecting)

For any other error, emit `RUN_ERROR` with the error message. The sentinel strings are a contract between the two services — document them in both. This is the simplest option: no custom error class, no new interface, just message-string checks at the catch site plus a one-line re-throw in the event bridge.

### sandbox-agent invocation command — UNKNOWN (resolve in Task 4)

Story 6.2 research found sandbox-agent is an HTTP server (not a stdout-emitting CLI). The event bridge contract expects JSONL on stdout with AG-UI-compatible `type` fields. The exact command that produces this output must be resolved in Task 4 by reading sandbox-agent docs or running `sandbox-agent --help` in a provisioned sandbox. The command likely invokes sandbox-agent in a mode that streams events to stdout, or pipes its HTTP SSE output through a stdout redirect. The `cwd` is `REPO_SUBDIRECTORY` (`repo/`).

If the command cannot be resolved without a real sandbox, construct a reasonable placeholder based on sandbox-agent docs and flag for Story 6.5 verification. The command string is the one piece of this story that can only be fully validated against a real sandbox.

### Cost data gap (from Story 6.2)

Story 6.2 flagged: "sandbox-agent's `AgentEvent` schema has a `type` field; cost data (total_cost_usd, session_id, num_turns, duration_ms) is not a documented AG-UI event type." The event bridge emits AG-UI events via `sessionEvents.emit()` — cost data is metadata, not an AG-UI event. If sandbox-agent surfaces cost data inside a `RUN_FINISHED` event's `data` payload, the `onEvent` callback receives it (lifecycle events are passed to `onEvent` even though the event bridge skips `sessionEvents.emit()` for them). `AgentService` intercepts cost from the `onEvent`-received `RUN_FINISHED` event's `data` payload, then emits its own `RUN_FINISHED` to SSE afterward. If sandbox-agent uses a separate non-AG-UI event type, the event bridge drops it (only AG-UI types are emitted). **Task 4.1 must verify whether sandbox-agent surfaces cost data.** If not, document the gap — cost tracking becomes a no-op until sandbox-agent supports it.

### Event bridge session lifecycle — self-cleaning

`AguiEventBridgeService.streamAgentEvents()` terminates the sandbox session in its `finally` block on normal completion (when `!activeRun.aborted`) and in its catch block on abort. `AgentService` does NOT need to terminate the session itself — the event bridge owns session cleanup. `AgentService` only calls `aguiEventBridgeService.stop(conversationId)` for user-initiated stop and `onModuleDestroy` cleanup, which delegates session termination to the event bridge.

### Circuit breaker — delegated to event bridge

Story 6.2's `AguiEventBridgeService` implements its own circuit breaker (`AGENT_STREAM_TIMEOUT_MS`, default 120000ms) with the stored-reject-handle pattern, `.catch(() => undefined)` safeguard, `aborted` flag, and `errorEmitted` flag. `AgentService` no longer needs its own circuit breaker — the event bridge handles stall detection and process termination. `AgentService`'s `CIRCUIT_BREAKER_TIMEOUT_MS` env var and timer logic (`startCircuitBreakerTimer`, `resetCircuitBreakerTimer`, `clearCircuitBreakerTimer`, `handleCircuitBreaker`) are removed.

The `stop()` and `onModuleDestroy()` paths call `aguiEventBridgeService.stop(conversationId)`, which sets `aborted = true`, rejects the stream promise, and terminates the sandbox process. `AgentService`'s try/catch/finally handles the rejection.

### What's removed

- `@anthropic-ai/claude-agent-sdk` import (`query`, `Query`, `SDKMessage`) from `agent.service.ts`
- `tmpdir` import from `os`
- `AGENT_WORKDIR` env var usage (`cwd: process.env.AGENT_WORKDIR ?? tmpdir()`)
- `ANTHROPIC_API_KEY` usage in `agent.service.ts` (injected into sandbox by `SandboxService.provision()`, Story 6.1)
- `ActiveRun.query` field (the SDK `Query` object)
- `abortPromise` / `Promise.race([iterator.next(), abortPromise])` pattern
- `CIRCUIT_BREAKER_TIMEOUT_MS` env var and all circuit breaker timer methods (`startCircuitBreakerTimer`, `resetCircuitBreakerTimer`, `clearCircuitBreakerTimer`, `handleCircuitBreaker`)
- `circuitBreakerTimers` map (circuit breaker owned by event bridge)
- `abortController` / `AbortController` usage (event bridge owns termination via `stop()`)
- `processSdkMessage` / `processStreamEvent` / `processAssistantMessage` / `processUserMessage` (SDK-specific message processing — replaced by `onEvent` callback processing AG-UI events)
- `currentMessageIds` map (AG-UI `TEXT_MESSAGE_CONTENT` events carry `messageId` directly — no inter-event state needed)
- `currentBlockTypes` map (AG-UI events are self-contained — no `content_block_start`/`delta`/`stop` state machine)
- `currentToolCallIds` map (AG-UI `TOOL_CALL_ARGS`/`END`/`RESULT` events carry `toolCallId` directly)
- `activeToolCalls` map (segment lookup by `toolCallId` replaces this map — see Task 2.4)
- `__mocks__/claude-agent-sdk.ts` (if no test imports the SDK after rewrite)
- `test/helpers/mock-query.ts` (if no test uses it after rewrite)

### What's preserved

- SSE event pipeline (`SessionEventsService`, `StreamingController`) — unchanged
- AG-UI event types (`@ag-ui/core` `EventType`) — unchanged
- Tool-pill classifier (`ToolPillClassifierService`) — unchanged, still called from `onEvent` on `TOOL_CALL_RESULT`
- Cost tracking (`CostTrackingService`) — unchanged, still called after run completion
- Pending classifier promises pattern — unchanged, still awaited before `RUN_FINISHED`
- Working-tree emission after file-modifying tool calls — unchanged, still triggered from `onEvent`
- `FILE_MODIFYING_TOOLS` Set — unchanged
- Turn persistence (`prisma.turn.create` + `prisma.conversation.update`) — unchanged
- Concurrent-turn guard (`activeRuns.has(conversationId)`) — unchanged
- `AgentServiceFake` — unchanged (implements `IAgentService`, doesn't use the event bridge)

### Previous story intelligence (Story 6.2)

- **Event bridge circuit breaker design:** Story 6.2 learned from the existing `AgentService` circuit breaker's deferred bugs (race conditions, timer re-arming, abort listener leaks). The event bridge's circuit breaker avoids these: `aborted` flag prevents re-arming, `errorEmitted` flag prevents double-emit, `rejectStream` handle enables external cancellation, `.catch(() => undefined)` on the stream promise prevents unhandled rejections. `AgentService` delegates to this well-designed circuit breaker.
- **`onEvent` callback addition:** Story 6.2 built the event bridge without an `onEvent` callback. This story adds it — a minimal, backward-compatible extension. The callback is called in `processAgentEvent()` before `sessionEvents.emit()`.
- **sandbox-agent output schema:** Story 6.2 research found sandbox-agent emits JSONL with `type` matching AG-UI `EventType` values (passthrough re-encoding). The `onEvent` callback receives `SseEvent` objects (`{ event: string, data: unknown }`) — same shape as what `sessionEvents.emit()` receives.
- **Cost data gap:** Story 6.2 flagged cost data as a gap for this story. Resolve in Task 4.1.

### Git intelligence

Recent commits:
- `6e5f908` — Story 6.2: agui-event-bridge service implementation
- `751489d` — Story 6.1: sandbox binary installation during provision

Both stories established the infrastructure this story builds on: binary installation (6.1), event bridge + session lifecycle (6.2).

### Architecture compliance

- **Architecture line 668:** "sandbox process exec (Claude Code agent) → sandbox-agent JSONL → agui-event-bridge → SSE → browser" — this story wires the event bridge into `AgentService.runTurn()`, completing the data flow.
- **Architecture line 665:** "Claude Agent SDK + sandbox-agent — run inside the Daytona sandbox" — this story removes the host-based SDK `query()` call, aligning with the prescribed architecture.
- **PRD §3 (lines 100, 105):** agent runs inside the sandbox — this story implements that.
- **Sprint change proposal (2026-07-11):** Story 3.3 shipped host-based execution as a deviation (DP-2); this story brings the implementation back in line with the prescribed architecture.

### Testing standards

- Unit tests for `AgentService` (`agent.service.unit.spec.ts`) must be rewritten to mock `AguiEventBridgeService.streamAgentEvents()` instead of `@anthropic-ai/claude-agent-sdk`'s `query()`. Feed AG-UI events through the `onEvent` callback.
- Integration tests (`agent.service.spec.ts`, `conversations.service.spec.ts`, `manual-commit.service.spec.ts`) use `AgentServiceFake` via `AGENT_SERVICE` token override — should be unaffected unless the `AgentService` constructor signature changes (it gains `AguiEventBridgeService` as a dependency, but the fake doesn't need it).
- Test priority tags: `[P0]` for AC coverage, `[P1]` for edge cases.
- `jest.isolateModules` pattern may need adjustment if the `@anthropic-ai/claude-agent-sdk` mock is removed.

### Deferred findings picked up by this story

Two deferred findings in `deferred-work.md` are explicitly tagged for Story 6.3 pickup. Both are resolved by the migration itself (the code they reference is removed/replaced):

1. **Defense-in-depth runtime guard (line 522):** `agent.service.ts:99` — `ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? ''`. Resolved: the `query()` call containing this line is removed. The API key is injected into the sandbox by `SandboxService.provision()` (Story 6.1), which already has a defense-in-depth guard (`if (!anthropicApiKey) throw ...` at line 103-105).

2. **`Promise.race` + `.catch(() => undefined)` safeguard (line 535):** `agent.service.ts:117` — `await Promise.race([iterator.next(), abortPromise])`. Resolved: the SDK iterator is replaced by `aguiEventBridgeService.streamAgentEvents()`, which already uses the stored-reject-handle pattern with `.catch(() => undefined)` (Story 6.2, line 105).

### Project Structure Notes

Files modified:
- `apps/agent-be/src/streaming/agent.service.ts` — rewrite `runTurn()`, `stop()`, `onModuleDestroy()`; remove SDK imports, circuit breaker, SDK message processing
- `apps/agent-be/src/streaming/agui-event-bridge.service.ts` — add `onEvent` callback to `AguiEventBridgeParams` and `processAgentEvent()`; add `cwd?: string` to `AguiEventBridgeParams` and forward to `createAgentSession`; add `throw _err` re-throw in `streamAgentEvents()` catch block so the method rejects on abort
- `apps/agent-be/src/streaming/agui-event-bridge.service.spec.ts` — add tests for `onEvent` callback; update existing tests that assert `streamAgentEvents` resolves on stop/timeout to assert rejection with the correct sentinel
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — rewrite to mock `AguiEventBridgeService` instead of SDK `query()`
- `apps/agent-be/src/streaming/streaming.module.ts` — verify `AguiEventBridgeService` is available to `AgentService` (both in same module — already registered)

Files potentially removed:
- `apps/agent-be/src/__mocks__/claude-agent-sdk.ts` — remove if no test imports the SDK after rewrite
- `apps/agent-be/test/helpers/mock-query.ts` — remove if no test uses it after rewrite

Files NOT modified:
- `apps/agent-be/src/streaming/streaming.controller.ts` — SSE transport, unchanged
- `apps/agent-be/src/streaming/session-events.service.ts` — `emit()` / `ReplaySubject`, unchanged
- `apps/agent-be/src/streaming/tool-pill-classifier.service.ts` — consumes AG-UI events, transport-agnostic
- `apps/agent-be/src/sandbox/sandbox.service.ts` — session methods implemented in Story 6.2, unchanged
- `apps/agent-be/test/helpers/sandbox-service.fake.ts` — session methods implemented in Story 6.2, unchanged
- `apps/agent-be/test/helpers/agent-service.fake.ts` — implements `IAgentService`, doesn't use event bridge, unchanged
- `apps/agent-be/src/config/env.validation.ts` — `AGENT_WORKDIR` was never in the Zod schema, unchanged
- `libs/shared-types/src/agent.interface.ts` — `IAgentService` interface unchanged

### References

- [Source: epics.md#Story 6.3 lines 1545-1583] — story ACs and dev notes
- [Source: _bmad-output/implementation-artifacts/6-2-implement-jsonl-to-agui-event-bridge.md] — previous story (event bridge implementation, sandbox-agent research, cost data gap)
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-11.md lines 135-141] — Epic 6 story breakdown
- [Source: apps/agent-be/src/streaming/agent.service.ts] — current implementation (host-based SDK `query()`)
- [Source: apps/agent-be/src/streaming/agui-event-bridge.service.ts] — event bridge (Story 6.2)
- [Source: apps/agent-be/src/streaming/session-events.service.ts] — `SessionEventsService` (`emit()`, `ReplaySubject(100)`)
- [Source: apps/agent-be/src/streaming/streaming.module.ts] — module registration
- [Source: apps/agent-be/src/sandbox/sandbox.service.ts lines 333-390] — session lifecycle methods (Story 6.2)
- [Source: apps/agent-be/src/conversations/conversations.service.ts lines 326-347] — `runAgentTurn` call site (fire-and-forget `agentService.runTurn()`)
- [Source: apps/agent-be/test/helpers/agent-service.fake.ts] — test fake (implements `IAgentService`)
- [Source: apps/agent-be/src/__mocks__/claude-agent-sdk.ts] — SDK mock (to be removed)
- [Source: apps/agent-be/test/helpers/mock-query.ts] — query mock helper (to be removed)
- [Source: apps/agent-be/src/streaming/agent.service.unit.spec.ts] — unit tests (to be rewritten)
- [Source: libs/shared-types/src/agent.interface.ts] — `IAgentService` interface
- [Source: libs/shared-types/src/sandbox.interface.ts lines 38-87] — `AgentSessionHandle`, `ISandboxService` session methods
- [Source: apps/agent-be/src/config/env.validation.ts] — env validation (no `AGENT_WORKDIR`)
- [Source: _bmad-output/project-context.md] — circuit breaker pattern, OnModuleDestroy pattern, test-seam fakes, ISandboxService test seam, fire-and-forget pattern, Promise.race + stored reject handle pattern
- [Source: _bmad-output/implementation-artifacts/deferred-work.md lines 522, 535] — deferred findings picked up by this story

## Dev Agent Record

### Agent Model Used

glm-5.2-fast (Coder)

### Debug Log References

- Event bridge tests initially failed after the re-throw change (Task 1.0) because `streamAgentEvents()` now rejects on stop/timeout. Tests that used `await streamPromise.catch(() => undefined)` at the end hit unhandled rejection warnings because the promise rejected during `jest.advanceTimersByTimeAsync()` before `.catch()` was attached. Fixed by attaching the catch handler early (`const streamErr = streamPromise.catch((e: Error) => e)`) before advancing timers.
- The stop() test initially used real timers with `setTimeout(r, 10)` — the stream completed before stop() was called. Fixed by using fake timers with `setAgentStreamDelay(200_000)` to keep the stream in-flight.
- The concurrent-turn guard and stop/onModuleDestroy tests hung because the mock `streamAgentEvents` returned a never-resolving promise. Fixed by attaching `.catch(() => undefined)` early and not awaiting the hanging promise.
- The mock event bridge in `agent.service.unit.spec.ts` initially didn't forward non-lifecycle events to `sessionEvents.emit()`, causing tool-call lifecycle tests to fail (the events were only passed to `onEvent`, not emitted to SSE). Fixed by having the mock simulate the real event bridge behavior: non-lifecycle events are both passed to `onEvent` AND emitted to SSE.
- The `lastCostData` variable was narrowed to `never` by TypeScript control-flow analysis because assignments inside the `onEvent` closure are not tracked for subsequent reads outside the closure. Fixed by using a mutable container object (`const state = { lastCostData: null }`).
- The injection-guard regex tests (`not.toMatch(/\brm\s+-rf\b/)`) failed because the shell-quoted message contains `rm -rf` inside single quotes. The regex can't distinguish quoted from unquoted content. Fixed by asserting the message is properly single-quoted (`toContain("'hello\"; rm -rf / #'")`) instead of asserting the dangerous pattern is absent.
- The `sdk-contract-replay.spec.ts` test was removed because it tested the old SDK-based `AgentService` pipeline (`processSdkMessage → processStreamEvent / processAssistantMessage / processUserMessage`) which no longer exists. The `mock-query.ts` helper and `__mocks__/claude-agent-sdk.ts` mock were also removed (no longer referenced). The `jest.config.ts` `moduleNameMapper` and `transformIgnorePatterns` entries for `@anthropic-ai` were removed.

### Completion Notes List

- **Task 1 (Event bridge changes):** Added `onEvent` callback branching logic in `processAgentEvent()` — non-lifecycle events are passed to `onEvent` then forwarded to `sessionEvents.emit()`; lifecycle events (`RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`) are passed to `onEvent` but `sessionEvents.emit()` is skipped (AgentService owns lifecycle emission). Added `cwd?: string` field to `AguiEventBridgeParams`, forwarded to `createAgentSession`. Added `throw _err` re-throw in the catch block so `streamAgentEvents()` rejects on abort (AGENT_STOPPED, AGENT_STREAM_TIMEOUT, MODULE_DESTROYING) and resolves only on normal completion. Activated 4 skipped onEvent tests. Updated 6 existing Story 6.2 tests to assert rejection with the correct sentinel.
- **Task 2 (runTurn rewrite):** Removed `@anthropic-ai/claude-agent-sdk` import, `tmpdir` import, `ActiveRun.query` field, `abortPromise`/`Promise.race` pattern, `CIRCUIT_BREAKER_TIMEOUT_MS` env var, all circuit breaker timer methods, `processSdkMessage`/`processStreamEvent`/`processAssistantMessage`/`processUserMessage`, `currentMessageIds`/`currentBlockTypes`/`currentToolCallIds`/`activeToolCalls` maps. Injected `AguiEventBridgeService`. Rewrote `runTurn()` to call `streamAgentEvents()` with an `onEvent` callback that accumulates text/segments, triggers the classifier on `TOOL_CALL_RESULT`, emits working-tree events after file-modifying tool calls, and captures cost data from `RUN_FINISHED`'s data payload. The catch block checks for the three event-bridge sentinels and skips `RUN_ERROR` for abort-initiated rejections.
- **Task 3 (stop/onModuleDestroy):** Rewrote `stop()` to call `aguiEventBridgeService.stop(conversationId)`, await pending classifier promises, emit `RUN_FINISHED`, clean up state. Rewrote `onModuleDestroy()` to fire-and-forget `aguiEventBridgeService.stop()` for each active run. Provider registration order in `StreamingModule` verified: `AguiEventBridgeService` is registered before `AgentService` (via `AGENT_SERVICE`), so `AgentService.onModuleDestroy()` runs first (NestJS reverse registration order).
- **Task 4 (sandbox-agent command):** Constructed `sandbox-agent --agent claude-code --prompt ${shellQuote(message)}` with a local `shellQuote` helper (deliberate duplication of `SandboxService.shellQuote` per the architecture's service boundary). The `cwd` is `REPO_SUBDIRECTORY` (`'repo'`). Per Task 4.2, the exact CLI mode that produces JSONL on stdout cannot be verified without a real sandbox (sandbox-agent is an HTTP server per Story 6.2 research). **Flagged for Story 6.5 (real-service E2E) verification.** The command string is the one piece that can only be fully validated against a real sandbox.
- **Task 5 (AgentServiceFake):** Verified — the fake implements `IAgentService` and doesn't use the event bridge. No changes needed. All integration tests using `AgentServiceFake` via `AGENT_SERVICE` token override pass.
- **Task 6 (AGENT_WORKDIR):** Confirmed `AGENT_WORKDIR` is not in `env.validation.ts` (Zod schema) or `.env.example`. No changes needed. Removed `mock-query.ts` and `__mocks__/claude-agent-sdk.ts` (no longer referenced after test rewrite). Removed `@anthropic-ai` from `jest.config.ts` `transformIgnorePatterns` and `moduleNameMapper`.
- **Task 7 (Tests):** Rewrote `agent.service.unit.spec.ts` — removed all obsolete SDK-based test blocks (19 tests using `jest.doMock('@anthropic-ai/claude-agent-sdk')` + `createMockQuery`/`makeQueryFromGenerator`), replaced with 45 tests that mock `AguiEventBridgeService.streamAgentEvents()` and feed AG-UI events through the `onEvent` callback. Coverage remains equivalent: tool-call lifecycle, classifier integration, cost recording, concurrent-turn guard, segments persistence, working-tree emission, credential/access-denied events, stop/onModuleDestroy delegation, credential-isolation + input-injection regression guards, AC-4 SDK removal verification. All 781 agent-be tests pass. All 908 web tests pass.
- **Task 8 (Deferred findings):** Both deferred findings in `deferred-work.md` (lines 522, 535) were already marked as "Picked up by Story 6.3" — the code paths they reference are removed entirely by the migration. Confirmed no further action needed.
- **Task 9 (Recorded-session replay fixture):** **GAP documented.** The fixture at `apps/agent-be/test/fixtures/sdk-session-replay.jsonl` contains SDK messages (raw Claude Code JSONL: `type: "stream_event"`, `type: "assistant"`, `type: "user"`, `type: "result"`). `ConversationPane.test.tsx` consumes AG-UI events via SSE (`TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`, etc.), not SDK messages. After the migration, the SDK→AG-UI conversion no longer exists in `AgentService` — the event bridge does sandbox-agent JSONL→AG-UI (passthrough). The fixture is in the wrong format for the frontend tests. Per DP-2 (spec contradicts architecture — the task was written before the migration removed the SDK) and DP-5 (defer, don't expand), the full replacement is deferred to Story 6.5 where a real sandbox-agent session can be recorded in AG-UI event format. The ConversationPane tests already use correct AG-UI event shapes (they use `EventType` values from `@ag-ui/core`).
- **AC-8 cost data gap:** If sandbox-agent surfaces cost data in a `RUN_FINISHED` event's `data` payload (with `total_cost_usd`, `session_id`, `num_turns`, `duration_ms` fields), `AgentService`'s `onEvent` callback intercepts it and persists it via `CostTrackingService` (with the `Number.isFinite` guard). If sandbox-agent does not surface cost data in this format, cost tracking becomes a no-op (the `RUN_FINISHED` event's data payload won't match the expected fields). This gap can only be verified against a real sandbox-agent session — flagged for Story 6.5.

### File List

Modified:
- `apps/agent-be/src/streaming/agent.service.ts` — complete rewrite of `runTurn()`, `stop()`, `onModuleDestroy()`; removed SDK imports, circuit breaker, SDK message processing; added `AguiEventBridgeService` dependency, `onEvent` callback, `buildAgentCommand()`, `shellQuote()`
- `apps/agent-be/src/streaming/agui-event-bridge.service.ts` — added `onEvent` callback branching in `processAgentEvent()`, `LIFECYCLE_EVENTS` Set, `cwd` field forwarding to `createAgentSession`, `throw _err` re-throw in catch block, `onEventCallbacks` map
- `apps/agent-be/src/streaming/agui-event-bridge.service.spec.ts` — activated 4 skipped onEvent tests; updated 6 existing tests to assert rejection with sentinels (AGENT_STOPPED, AGENT_STREAM_TIMEOUT, MODULE_DESTROYING) instead of resolution
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — complete rewrite: removed 19 obsolete SDK-based tests, added 45 sandbox-based tests mocking `AguiEventBridgeService`
- `apps/agent-be/jest.config.ts` — removed `@anthropic-ai` from `transformIgnorePatterns` and `moduleNameMapper`

Removed:
- `apps/agent-be/test/sdk-contract-replay.spec.ts` — obsolete (tested old SDK-based AgentService pipeline)
- `apps/agent-be/test/helpers/mock-query.ts` — no longer referenced (SDK mock helpers)
- `apps/agent-be/src/__mocks__/claude-agent-sdk.ts` — no longer referenced (SDK manual mock)
- `apps/agent-be/src/__mocks__/` directory — empty after mock removal

## Change Log

- 2026-07-16: Story 6.3 implemented — migrated AgentService from host-based SDK `query()` to sandbox-based execution via `AguiEventBridgeService`. All 8 ACs satisfied. 781 agent-be tests + 908 web tests pass. Typecheck passes.
- 2026-07-16: testarch-automate validation run — no skipped tests found (dev already activated all 23 ATDD scaffolds). Coverage gap found: `MODULE_DESTROYING` sentinel branch in `runTurn()` catch block (AC-6) was untested (the other two sentinels `AGENT_STOPPED` and `AGENT_STREAM_TIMEOUT` were tested). Added 1 new test (`MODULE_DESTROYING rejection skips RUN_ERROR and RUN_FINISHED`) to `agent.service.unit.spec.ts` — test passes immediately (production code already correct, gap was test coverage only). No production code modified, no existing tests modified. Full agent-be suite: 782 passed, 0 skipped. Validation report: `_bmad-output/test-artifacts/automate-validation-report-6-3.md`.

### Review Findings

Layers run: Edge Case Hunter, Acceptance Auditor (Blind Hunter skipped per request). All 8 ACs satisfied (Acceptance Auditor).

- [x] [Review][Patch] `createAgentSession` failure leaks `activeRuns` entry in event bridge [agui-event-bridge.service.ts:100] — `activeRuns.set` runs before `createAgentSession` (line 102) which is outside the `try/finally` (starts line 149); a throw leaves a stale entry until overwritten. Fix: wrap setup in try/catch that deletes on failure.
- [x] [Review][Patch] Pending classifier promises not awaited in `runTurn()` catch before `RUN_ERROR` [agent.service.ts:345] — classifier/working-tree events may arrive after `RUN_ERROR`. Fix: await `pendingClassifierPromises` before emitting `RUN_ERROR` (mirrors normal-completion path).
- [x] [Review][Patch] `onEvent` callback throw causes double `RUN_ERROR` [agui-event-bridge.service.ts:263] — a synchronous throw in `onEvent` propagates to `streamPromise`, the bridge catch emits `RUN_ERROR` + re-throws, then `AgentService` catch emits another `RUN_ERROR`. Fix: wrap `onEvent(sseEvent)` in try/catch in `processAgentEvent`.
- [x] [Review][Patch] Mock event bridge `stop()` doesn't reject in-flight `streamAgentEvents` — test fidelity gap [agent.service.unit.spec.ts:117] — stop tests pass vacuously; the full stop→reject→runTurn-catch interaction is never exercised. Fix: controllable bridge whose `stop()` rejects the stream with `AGENT_STOPPED`.
- [x] [Review][Patch] `toolCallId` fallback uses `Date.now()` — violates project-context.md (collision risk) [agent.service.ts:105] — project-context line 132 prescribes `safeUUID()`/`crypto.randomUUID()`, never `Date.now()` for keys. Fix: use `crypto.randomUUID()`.
- [x] [Review][Patch] Cost-data warning logs `undefined` for missing fields [agent.service.ts:270] — misleading operator log. Fix: coerce missing fields to a readable fallback.
- [x] [Review][Patch] Tests leave never-resolving promises — Jest open-handle warnings [agent.service.unit.spec.ts:348,1208,1228,1252] — concurrent-turn guard + stop/onModuleDestroy tests hang forever. Fix: settle in-flight runs via the controllable bridge's `stop()`.
- [x] [Review][Defer] `onModuleDestroy()` clears `pendingClassifierPromises` without draining [agent.service.ts:393] — deferred, shutdown-path best-effort; drain pattern is scope expansion (DP-5).
- [x] [Review][Defer] Empty message produces a command with empty prompt [agent.service.ts:427] — deferred, pre-existing input-validation concern (DTO min-length), not introduced by migration.
- [x] [Review][Defer] `TEXT_MESSAGE_START`/`TEXT_MESSAGE_END` no longer synthesized by `AgentService` [agent.service.ts] — deferred, architecturally correct delegation to event bridge passthrough; only verifiable against real sandbox (Story 6.5).

Dismissed (7): double-`RUN_FINISHED` race (false positive — JS single-threaded execution prevents interleaving between `activeRuns.set` and `streamAgentEvents`); out-of-order `TOOL_CALL_END` (speculative — AG-UI guarantees ordering); `TOOL_CALL_RESULT` without `toolCallId` (speculative — AG-UI spec requires it); `TOOL_CALL_*` not emitted by `AgentService` (architecturally correct passthrough delegation); `TOOL_CALL_END` status preservation (behavior preserved — auditor confirmed); sandbox-agent command unverifiable (per-spec deferral — Task 4.2); `shellQuote` duplication / `sandboxId` closure / `access_notice` dispatch (deliberate design / correct — no issue).

### NFR Evidence Audit (testarch-nfr, Create mode — focused: select projections, take limits, timing tests, security headers)

Layers run: NFR-specific audit of files modified by Story 6.3 (`agent.service.ts`, `agui-event-bridge.service.ts`). Full report: `_bmad-output/test-artifacts/nfr-assessment-6-3.md`.

**Result: PASS ✅ — 0 story-introduced NFR issues, 0 fixes applied, 0 deferred-work.md entries.**

NFR dimensions audited:

- **Select projections:** PASS ✅ — Both Prisma queries in `agent.service.ts` have `select: { id: true }` (`turn.create` line 328, `conversation.update` line 333). No missing projections introduced by the story.
- **Take limits:** PASS ✅ — No `findMany`/`findFirst`/`aggregate` queries introduced. In-memory structures (`segments`, `toolCallRegistry`, `pendingClassifierPromises`, `accumulatedText`) bounded by single-turn duration (circuit breaker 120s) and cleared in `finally`.
- **Timing tests:** PASS ✅ — Circuit breaker timing tested at event bridge level (`agui-event-bridge.service.spec.ts:174,237,303` — fires after 120s, resets on chunks, single-emit). Sentinel propagation tested at `runTurn()` level (`agent.service.unit.spec.ts:430,448,468` — `AGENT_STOPPED`, `AGENT_STREAM_TIMEOUT`, `MODULE_DESTROYING`). `AGENT_STREAM_TIMEOUT_MS` parsed via IIFE with `Number.isFinite` guard.
- **Security headers:** PASS ✅ (N/A — no HTTP endpoints touched) — SSE headers set in `StreamingController` (unchanged). Command injection prevented via `shellQuote()` (`agent.service.ts:436-442`). Credential isolation tested by 4 regression guards (`agent.service.unit.spec.ts:1330-1408`). Command never logged. Input size bounded by `SendMessageDto.max(10_000)`.

Pre-existing LOW findings (not introduced by Story 6.3, below MEDIUM threshold — not recorded in deferred-work.md):

- [NFR][LOW][Pre-existing] `prisma.costRecord.create` in `CostTrackingService.recordCost()` lacks `select` projection [`cost-tracking.service.ts:18`] — return value unused; DB returns all scalar fields unnecessarily. Pre-existing from Story 3.11 (`1363ac4`); Story 6.3 calls the method but did not modify the file. Remediation: add `select: { id: true }`.
- [NFR][LOW][Pre-existing] No test for `AGENT_STREAM_TIMEOUT_MS` env var configuration [`agui-event-bridge.service.spec.ts`] — all timing tests use the default 120s; no test verifies a custom env var value is respected. Pre-existing from Story 6.2.
