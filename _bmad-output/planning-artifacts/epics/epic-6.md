# Epic 6: Sandbox-Based Agent Execution

Migrates agent execution from host-based (`@anthropic-ai/claude-agent-sdk` `query()` subprocess) to sandbox-based execution inside the Daytona sandbox, per PRD §3 and architecture.md data flow. Story 3.3 shipped host-based execution as a deviation (DP-2); this epic brings the implementation back in line with the prescribed architecture. Fixes Stories 3.3 (execution), 3.6 (working tree), and 3.10 (commit identity) at the execution layer.

**Change proposal:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-11.md`

**Process note — pattern-establishment all-files map:** every story in this epic that establishes or modifies a pattern (canonical headers, `no-scrollbar` utility, design-system tokens) must include an all-files matching-pattern map in its spec. The dev must audit completion against that map at review time.

## Story 6.1: Install sandbox-agent + Claude Code Binaries in Sandbox During Provision

As a developer on the bmad-easy team,
I want both the sandbox-agent and Claude Code binaries deployed inside the Daytona sandbox during provisioning,
So that the agent can run inside the sandbox where the repository lives, not on the host.

**Acceptance Criteria:**

**Given** a Sandbox is provisioned (Story 3.1 provision sequence)
**When** provisioning completes
**Then** the sandbox-agent binary (rivet-dev, pinned exact version) is installed inside the sandbox, checksum-verified against a pinned hash
**And** the Claude Code binary is installed inside the sandbox, pinned to an exact version
**And** `ANTHROPIC_API_KEY` is injected into the sandbox environment so the Claude Code agent can authenticate with the Anthropic API
**And** `networkAllowList` egress control is applied to the sandbox, scoped to GitHub, the Anthropic API, and required package registries — closing the credential exfiltration path
**And** the provision sequence is extended: provision → apply `networkAllowList` → install binaries → clone (or restore on resume) → inject git identity → `git status --porcelain` → emit working-tree event → emit session-ready

**Given** `ANTHROPIC_API_KEY` is not set in `apps/agent-be`'s environment
**When** a provision is attempted
**Then** it fails loudly at startup (Zod env validation), not silently after the sandbox is running

**Given** the `networkAllowList` is applied
**When** the agent attempts an outbound network call to a non-allow-listed host
**Then** the call is blocked at the sandbox network boundary

**Given** a sandbox-agent binary version upgrade is proposed
**When** it is reviewed
**Then** the JSONL→AG-UI event mapping changelog is diffed and validated against a recorded BMAD session replay before the version is bumped (PR-review checklist, not an automated test)

**Dev Notes:**

- **sandbox-agent** is an open-source binary by [Rivet (rivet-dev)](https://github.com/rivet-dev/sandbox-agent), released January 2026. It handles Claude Code's JSONL stdout format and normalizes it to a structured event stream. Supported agents include Claude Code, Codex, OpenCode, and Amp. Sources: [GitHub](https://github.com/rivet-dev/sandbox-agent), [Rivet changelog](https://rivet.dev/changelog/2026-01-28-sandbox-agent-sdk/), [sandboxagent.dev](https://sandboxagent.dev/).
- **Binary installation mechanism:** both binaries are deployed inside the sandbox during provision (file upload or download). Pin sandbox-agent to an immutable version; checksum-verify in the Dockerfile layer. The architecture documents the upgrade protocol: "Pin to an exact binary version in the Dockerfile (no floating tags). Before any upgrade: diff the JSONL→AG-UI event mapping in the release changelog."
- **`networkAllowList` constraints:** Daytona's egress firewall is capped at 10 IPv4 CIDR entries with no hostname support. All tiers get pre-whitelisted access to package registries (npm, PyPI), GitHub/GitLab, container registries, and AI/ML APIs (Anthropic, OpenAI) regardless of custom allow-list entries. The custom allow-list closes the exfiltration path for sandbox-resident credentials (`GITHUB_TOKEN`, `ANTHROPIC_API_KEY`).
- **Credential exposure risk:** per Daytona's Security Exhibit, any secret placed inside a sandbox's environment is readable and exfiltratable by the agent process. `networkAllowList` is the cheap, available-now mitigation. Host-mediated git operations (routing git through agent-be with a credential helper that never writes the raw PAT into the sandbox) is a longer-term structural option for the risk register, not in scope for this epic.
- **Env validation:** add `ANTHROPIC_API_KEY` as a required string to `apps/agent-be/src/config/env.validation.ts` (Zod schema). Do NOT add `AGENT_WORKDIR` (irrelevant after Epic 6 — the agent runs inside the sandbox, not on the host).
- **Existing provision code:** `SandboxService.provision()` (Story 3.1) currently provisions the sandbox, clones the repo, injects git identity, and emits session-ready. This story extends the provision sequence — the new steps (binary installation, `networkAllowList`, `ANTHROPIC_API_KEY` injection) are inserted before the clone step.
- **`ISandboxService` test seam:** `SandboxServiceFake` must be updated to reflect the new provision steps (binary installation, `networkAllowList` application) so integration tests can assert on them.
- **SandboxService fidelity audit findings:** fix the 3 findings that fall in this story's scope:
  - **F1 (Gap A+B):** `destroy()` has zero SDK-boundary test coverage. `isNotFoundError()` (`sandbox.service.ts:179-185`) uses string matching (`includes('not found') || includes('404')`) instead of the real `DaytonaNotFoundError` class (`@daytonaio/sdk` errors/DaytonaError.d.ts) with `statusCode === 404`. Fix: replace string heuristic with `err instanceof DaytonaNotFoundError || (err instanceof DaytonaError && err.statusCode === 404)`. Add SDK-boundary tests for `destroy()` using `mock-daytona.ts` (both not-found idempotent-return and non-404 error-propagation paths).
  - **F2 (Gap A+C):** `provision()`'s catch-block cleanup (`sandbox.service.ts:39-45`) is dead code — `daytona.create` either resolves (sandbox assigned) or rejects (sandbox never assigned), so `if (sandbox)` is always false in the catch. The "no zombie sandboxes" integration test (`sandbox-lifecycle.integration.spec.ts:140-148`) is vacuously true because `SandboxServiceFake.failNextProvision` throws before allocation. Fix: either delete the dead branch (the SDK's `create` already waits for readiness internally) or implement real partial-allocation cleanup by surfacing the sandbox ID from `DaytonaError` metadata. If deleting, update the integration test to use `mock-daytona` at the SDK boundary to model the real partial-allocation failure mode.
  - **F3 (Gap C):** `resume()`'s `daytona.start(sandbox)` call (`sandbox.service.ts:67`) is only tested against the success-only mock (`mock-daytona.ts:107`). The real contract throws `DaytonaTimeoutError` / `DaytonaError` on start failures and lets sandboxes enter non-recoverable error states. Add a test with `mockDaytona.start.mockRejectedValueOnce(new DaytonaTimeoutError(...))` and assert the error propagates to the caller. Consider whether `sandbox.recover()` (exists on the `Sandbox` class) should be called before re-throwing.

## Story 6.2: Implement agui-event-bridge.service.ts

As a developer on the bmad-easy team,
I want the `agui-event-bridge.service.ts` created to receive sandbox-agent's normalized event stream and re-encode it as AG-UI events,
So that the browser SSE channel receives properly formatted AG-UI events from the in-sandbox agent.

**Acceptance Criteria:**

**Given** `agui-event-bridge.service.ts` is listed in the architecture (line 575) but was never created
**When** this story is implemented
**Then** the service receives sandbox-agent's normalized event stream via Daytona's `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)` API
**And** re-encodes the stream as AG-UI events for the browser SSE channel
**And** it does NOT parse raw JSONL — sandbox-agent handles JSONL→structured-event normalization; the event bridge only re-encodes
**And** the circuit breaker (Story 3.4) wraps the event stream: if sandbox-agent fails to emit events within a timeout, the backend terminates the Claude Code agent process via the Daytona process management API before emitting an error event
**And** the SSE heartbeat (Story 3.4) runs on a fixed interval so the browser detects dead connections even when sandbox-agent is stalled

**Given** sandbox-agent crashes or stalls mid-stream
**When** the circuit breaker timeout fires
**Then** the backend calls `sandbox.process.terminateProcess(sandboxId, processId)` to terminate the agent process inside the sandbox (no longer a no-op)
**And** emits `RUN_ERROR` with `{ message: 'The agent stopped unexpectedly. Send a new message to try again.' }`
**And** cleans up the active run state

**Given** the transport mechanism
**When** agent-be receives sandbox-agent's output
**Then** agent-be creates a Daytona process session (`sandbox.process.createSession`), runs sandbox-agent inside it asynchronously (`executeCommand(..., { async: true })`), and streams output via `getSessionCommandLogs`
**And** the sandbox never initiates an outbound connection to agent-be — agent-be is the active/polling party

**Dev Notes:**

- **Transport (resolved unknown):** agent-be creates a Daytona process session (`sandbox.process.createSession`), runs sandbox-agent inside it asynchronously (`executeCommand(..., { async: true })`), and calls `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)` which streams stdout/stderr back to agent-be over the authenticated HTTPS/SDK channel. The sandbox never initiates an outbound connection to agent-be. Source: network security research (`technical-network-security-between-agent-be-and-daytona-sandbox-research-2026-06-16.md`).
- **No JSONL parsing:** the project does not write its own JSONL parser. sandbox-agent handles the JSONL→structured-event normalization. The pinned-version discipline applies to sandbox-agent itself (not the JSONL format directly).
- **Existing circuit breaker + heartbeat:** Story 3.4 implemented the circuit breaker (`AgentService` timer-based, resets on every emitted event, aborts via `abortController.abort()` + `query.interrupt()`) and the SSE heartbeat (`StreamingController` comment frames on 15s interval). These were built for the host-based SDK `query()` transport. The circuit breaker's `terminateProcess` call was a no-op (Story 3.3 DP-2). After this story + Story 6.3, `terminateProcess` terminates a real sandbox process. The circuit breaker logic itself may need adaptation to work with the new transport — the `query.interrupt()` call is SDK-specific and won't exist in the sandbox-based model.
- **`ReplaySubject` buffer:** `SessionEventsService` uses `ReplaySubject<SseEvent>(100)` per conversation so late subscribers receive missed lifecycle events (Story 3.1). The event bridge emits through `SessionEventsService.emit()` for conversation-level events.
- **File location:** `apps/agent-be/src/streaming/agui-event-bridge.service.ts` (per architecture line 575). Registered in `StreamingModule`.

## Story 6.3: Migrate AgentService to Sandbox-Based Execution

As a developer on the bmad-easy team,
I want `AgentService.runTurn()` to launch the agent inside the Daytona sandbox via sandbox-agent instead of the host-based SDK `query()`,
So that the agent has direct filesystem access to the cloned repository and can read files, run git commands, and modify the working tree.

**Acceptance Criteria:**

**Given** `AgentService.runTurn()` currently uses `@anthropic-ai/claude-agent-sdk`'s `query()` function (host-based subprocess)
**When** this story is implemented
**Then** `runTurn()` launches sandbox-agent inside the sandbox via the Daytona process session API
**And** streams output via the `agui-event-bridge.service.ts` (Story 6.2)
**And** the agent has direct filesystem access to the cloned repository inside the sandbox
**And** the agent cannot access the host filesystem (`.env`, `AUTH_SECRET`, `DATABASE_URL`, `DAYTONA_API_KEY`, source code, other conversations' repos)

**Given** the user activates the Stop button during an agent turn
**When** `stop()` is called
**Then** it terminates the agent process inside the sandbox via `sandbox.process.terminateProcess(sandboxId, processId)` (no longer a no-op)
**And** the SSE channel emits the appropriate lifecycle event

**Given** the host-based `query()` import and `AGENT_WORKDIR` / `tmpdir()` cwd logic
**When** the migration is complete
**Then** the `@anthropic-ai/claude-agent-sdk` import is removed from `AgentService` (the SDK is no longer used for execution)
**And** `AGENT_WORKDIR` env var is removed (irrelevant — the agent runs inside the sandbox)
**And** the `cwd: process.env.AGENT_WORKDIR ?? tmpdir()` logic is removed

**Given** `AgentServiceFake` (test-only, implements `IAgentService`)
**When** the migration is complete
**Then** the fake is updated to reflect the new execution mechanism's side effects (DB writes, `terminateProcess` calls, SSE event emission) so integration tests assert on real behavior

**Dev Notes:**

- **What's removed:** the `@anthropic-ai/claude-agent-sdk` `query()` call, the `AGENT_WORKDIR` env var, the `cwd` fallback to `tmpdir()`, and the `query.interrupt()` abort mechanism. The SDK package itself may remain installed if other code references it, but it is no longer used for agent execution.
- **What's preserved:** the SSE event pipeline (`SessionEventsService`, `StreamingController`), the AG-UI event types, the tool-pill classifier, the cost tracking, the pending classifier promises pattern, the working-tree emission after file-modifying tool calls. These are transport-agnostic — they consume AG-UI events regardless of where the agent runs.
- **Circuit breaker adaptation:** the existing circuit breaker uses `abortController.abort()` + `query.interrupt()` to stop the agent. In the sandbox-based model, stopping the agent means calling `sandbox.process.terminateProcess(sandboxId, processId)`. The timer-based stall detection (reset on every emitted event, fire on timeout) remains the same; only the termination mechanism changes.
- **`terminateProcess` was a no-op:** Story 3.3 DP-2 documented that `terminateProcess(sandboxId, 'agent-${conversationId}')` was kept for `IAgentService` test compliance but was effectively a no-op for host-process agents. After this story, it terminates a real sandbox process.
- **Cost tracking:** the SDK's terminal `result` message carries cost data. In the sandbox-based model, sandbox-agent's normalized event stream must still surface this cost data. Verify that the `result` message (or equivalent) is part of sandbox-agent's event schema. The `Number.isFinite` guard on cost values before persisting (Story 3.8) still applies.
- **`FILE_MODIFYING_TOOLS` Set:** the module-level `Set` of Claude Code tool names that can modify the working tree (`Bash`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`) and the fire-and-forget `getWorkingTreeStatus` check after these tool calls — these now work correctly because the agent modifies files inside the sandbox where `git status` runs. In the host-based model, these checks ran against the sandbox while the agent modified the host — they never matched.
- **Replace fabricated `MockEventSource` event shapes with recorded-session replay fixture:** `ConversationPane.test.tsx` drives `MockEventSource` with hand-fabricated event shapes. The recorded-session replay fixture already exists at `apps/agent-be/test/fixtures/sdk-session-replay.jsonl` (23 messages). The work is replacing the fabricated shapes in `ConversationPane.test.tsx` with this existing fixture — not creating the fixture.

## Story 6.4: Verify Working Tree, Commit, and Credential Flows

As a developer on the bmad-easy team,
I want the working-tree tracking, manual commit, and credential detection flows verified against the sandbox-based execution,
So that the Stories 3.6, 3.7, and 3.10 flows that were broken by host-based execution now work correctly.

**Acceptance Criteria:**

**Given** the agent modifies files inside the sandbox (via `Write`, `Edit`, `Bash` tool calls)
**When** `getWorkingTreeStatus` runs after a file-modifying tool call
**Then** `WORKING_TREE_DIRTY` fires with the changed files (because the agent and the working tree are now in the same filesystem)
**And** the working-tree indicator (Story 3.6) shows `● Unsaved changes`

**Given** the user triggers a manual save (Story 3.6)
**When** the commit executes inside the sandbox via Daytona process exec
**Then** there are actual changes to commit (the agent's file modifications are in the sandbox)
**And** the commit carries the user's git identity (Story 3.10 / Story 1.5)
**And** the working-tree indicator resets to clean

**Given** the agent runs a git command that hits a 401/403 (e.g., `git push` with an expired token)
**When** the tool-pill classifier (Story 3.7) inspects the tool call result
**Then** credential failure detection triggers (because git commands now run inside the sandbox where the credential is injected)
**And** `CREDENTIAL_FAILURE` or `ACCESS_DENIED` events emit to the browser

**Given** the host-based execution code path
**When** verification is complete
**Then** no agent file operations happen on the host filesystem — all file operations happen inside the sandbox

**Dev Notes:**

- **Why these flows were broken:** in the host-based model, the agent modified files on the host (via `tmpdir()`), but `getWorkingTreeStatus` and manual commit ran against the sandbox via Daytona process exec. The two filesystems were disconnected — the agent's changes never appeared in the sandbox's working tree. `WORKING_TREE_DIRTY` never fired, manual commit had nothing to commit, and git credential detection never triggered because the agent couldn't run git against the sandbox repo.
- **Why they work now:** with sandbox-based execution, the agent runs inside the sandbox where the repository is cloned. File modifications, git commands, and working-tree checks all operate on the same filesystem. The existing `getWorkingTreeStatus` / `ManualCommitService` / `tool-pill-classifier.service.ts` code should work without changes — the fix is the execution location, not the flow logic.
- **Scope:** this story is verification, not new implementation. If a flow doesn't work, the fix is in the execution layer (Stories 6.1–6.3), not in the flow logic (Stories 3.6, 3.7, 3.10). Only adapt the flow logic if the sandbox-based execution surfaces a genuine edge case the host-based model didn't exercise.
- **`executing*` Set guard:** `ManualCommitService`'s `executingCommits` Set guard (Story 3.6) still applies — concurrent commit requests for the same conversation are still prevented. The guard is transport-agnostic.
- **SandboxService fidelity audit findings:** fix the 2 findings in the commit/skills paths that this story verifies:
  - **F4 (Gap C):** `commit()`'s `exitCode !== 0` failure path (`sandbox.service.ts:130-131, 139-140`) is not tested for `git add` or `git commit`. Hidden bug: `git add` writes failures to stderr, but the SDK's `ExecuteResponse.result` is stdout-only — so `throw new Error(addResponse.result)` throws `Error('')`, and the user sees `MANUAL_SAVE_FAILED { error: '' }`. The sibling `injectGitConfig` failure path IS tested (`nfr-s1.spec.ts:207-223`), giving false confidence. Fix: add failure-path tests for both `git add` and `git commit` non-zero exitCode; consider whether the error message should include the exitCode or a generic diagnostic since `result` is empty for `git add` failures.
  - **F5 (Gap C):** `listSkills()`'s catch-block silent-swallow (`sandbox.service.ts:162-165`) is never exercised. Broad `catch (err)` returns `[]` indistinguishably for "no skills", "sandbox unreachable", "sandbox archived". Also reads `result` without checking `exitCode` first. Fix: add tests for `executeCommand` rejection and non-zero exitCode; assert `[]` is returned (current behavior is acceptable but should be an explicit asserted contract, not an unexercised code path).

## Story 6.5: Real-Service E2E Verification

As a developer on the bmad-easy team,
I want Tier 3 real-service E2E tests and NFR performance tests to pass against the sandbox-based execution,
So that we can confirm the agent can read the repo, run tools, commit, and meet performance targets in a real Daytona sandbox.

**Acceptance Criteria:**

**Given** a real Daytona sandbox with sandbox-agent + Claude Code binaries installed
**When** a Tier 3 functional smoke test runs
**Then** the agent responds to a "hello" message with a streamed response
**And** the agent can read files from the cloned repository
**And** the agent can run git commands against the repo
**And** the agent can modify the working tree
**And** `WORKING_TREE_DIRTY` events fire when the agent modifies files
**And** manual commit commits the agent's changes inside the sandbox
**And** `stop()` terminates the agent process inside the sandbox
**And** the agent cannot access host filesystem (`.env`, source code, other conversations' repos)

**Given** NFR-P1 (first streamed token ≤ 1,500ms)
**When** measured against the sandbox-based execution
**Then** the first token appears within 1,500ms of the user sending a message

**Given** NFR-P2 (chat ready ≤ 10s from page open)
**When** measured against the sandbox-based execution
**Then** the chat is ready for input within 10 seconds of page open for repositories under ~200MB

**Given** `networkAllowList` egress control
**When** a negative test runs (attempt to reach a non-allow-listed host from inside the sandbox)
**Then** the call is blocked — verifying the allow-list is not silently ignored or misconfigured

**Dev Notes:**

- **Tier 3 testing:** real Daytona sandbox, real Claude Code agent, real Anthropic API. This is the only tier that can verify the sandbox-based execution end-to-end. Tiers 1–2 use `SandboxServiceFake` and `AgentServiceFake` which don't exercise the real transport.
- **NFR-P1 (first token ≤ 1,500ms):** the sandbox-based model adds transport latency (agent-be → Daytona → sandbox → sandbox-agent → Claude Code → sandbox-agent → Daytona → agent-be → SSE → browser) versus the host-based model (agent-be → SDK `query()` → SSE → browser). The NFR target must be re-measured — if the additional hops push first-token latency over 1,500ms, the NFR target may need revisiting (PM decision, not a developer decision).
- **NFR-P2 (chat ready ≤ 10s):** the provision sequence now includes binary installation (Story 6.1), which adds time. The 10-second target was set for repositories under ~200MB — binary installation may push this. Re-measure and assess.
- **Negative egress test:** the network security research recommends: "As part of the sandbox provisioning test suite, assert that a sandbox with `networkAllowList` applied cannot reach an arbitrary non-allow-listed host (e.g., attempt `curl` to a test endpoint outside the list and assert failure) — this is the only way to catch a misconfigured or silently-ignored allow-list before it reaches production."
- **Success criteria (from change proposal):** (1) Claude Code + sandbox-agent binaries run inside the sandbox; (2) agent can read files, run git, modify working tree; (3) `WORKING_TREE_DIRTY` fires; (4) manual commit works; (5) `stop()` terminates real process; (6) Tier 3 smoke passes; (7) NFR-P1 and NFR-P2 are measurable; (8) agent cannot access host filesystem; (9) `networkAllowList` applied to every provision.
- **`withArtifacts` Playwright fixture (from Epic 5 open-issues P4):** the `withArtifacts` fixture breaks on unique-constraint violations on `[repoConnectionId, path]`. Story 5.4 E2E for AC-1 (ArtifactCard hover border) and AC-5 (ArtifactListEntry hover) were removed and reduced to className-only unit tests. Fix the unique-constraint violations in the fixture and restore the E2E blocks as part of this story's E2E verification scope.
- **Auto-scroll regression E2E test (from Epic 5 open-issues P5):** the auto-scroll fix (Epic 5 M1) landed but no regression E2E test was added. Add a Playwright spec asserting Retry button visibility on `SESSION_TIMEOUT` while scrolled up — defense-in-depth against the auto-scroll regression recurring.
