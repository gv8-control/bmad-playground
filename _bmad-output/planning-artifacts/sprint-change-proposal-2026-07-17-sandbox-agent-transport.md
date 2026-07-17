# Sprint Change Proposal: sandbox-agent Transport Correction (HTTP SSE on Port 2468)

**Date:** 2026-07-17
**Trigger:** Epic 6 Retro Significant Change #1 — sandbox-agent is an HTTP server on port 2468, not a stdout-emitting CLI. Discovered during Story 6.2 Task 1, flagged in the Epic 6 retrospective (Action Item #3 / Tech Debt #2), never actioned. The architecture document was never reconciled against the discovery.
**Scope Classification:** Major (architecture reconciliation + transport rewrite of a central service + new stories in Epic 8)
**Status:** Pending Approval

---

## Section 1: Issue Summary

### Problem Statement

`_bmad-output/planning-artifacts/architecture.md` prescribes a data flow in which `agui-event-bridge.service.ts` consumes JSONL emitted on sandbox-agent's **stdout** and re-encodes it as AG-UI events:

> Line 667: User message (browser) → `conversations.controller.ts` → sandbox process exec (Claude Code agent) → **sandbox-agent JSONL** → `agui-event-bridge.service.ts` → SSE → browser.
>
> Line 664: Claude Agent SDK + sandbox-agent — run inside the Daytona sandbox; pulled by `apps/agent-be/src/streaming/agui-event-bridge.service.ts`.

This assumption is **false**. `sandbox-agent` (rivet-dev/sandbox-agent v0.4.2, baked into the `apps/agent-be` Docker image per lines 10-12 and 47 of `Dockerfile`) is a **Rust daemon** (`sandbox-agent server`) that exposes an **HTTP + SSE API on port 2468** inside the sandbox. It does **not** emit a normalized agent event stream to stdout when invoked as a plain command — invoking it as `sandbox-agent --agent claude-code --prompt "<message>"` (the placeholder constructed in Story 6.3 and never validated) would start the HTTP server, and `getSessionCommandLogs` would stream the server's startup logs, then block indefinitely waiting for stdout output that never arrives. The event bridge's `onStdout` callback would never receive a valid JSONL line; the circuit breaker (120s timeout) would eventually fire and emit `RUN_ERROR`.

### What Happened

The research documents and the prior change proposal **already knew** the truth before Epic 6 was planned:

- `_bmad-output/planning-artifacts/research/technical-backend-service-architecture-claude-agent-sdk-ag-ui-research-2026-06-12.md` line 283: *"sandbox-agent is a small server binary deployed inside the sandbox that exposes an HTTP/SSE endpoint on a local port."*
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-11.md` line 237 (under "Resolved Unknown #1"): *"It's a small server binary deployed inside the Daytona sandbox that exposes an HTTP/SSE endpoint on a local port."*

During Story 6.2 Task 1, the developer (Amelia) confirmed the discovery directly: sandbox-agent runs as `sandbox-agent server` on port 2468. The story file documents this as **Finding 1 — sandbox-agent is an HTTP server, not a stdout-emitting CLI** (Story 6.2 file, line 273+):

> "sandbox-agent runs as a Rust daemon (`sandbox-agent server`) exposing an HTTP + SSE API on port 2468. Clients connect over HTTP to create sessions, post messages, and stream events. The binary does NOT emit a normalized event stream to stdout when invoked as a plain command — it starts a server. This contradicts the architecture's assumption (line 668: 'sandbox-agent JSONL → event bridge → SSE → browser') that sandbox-agent emits JSONL to stdout."

The developer recorded a Decision Point (DP-2): "the architecture mandates the pull-based `getSessionCommandLogs` transport; the event bridge was built to the ATDD contract (parse JSONL on stdout); the exact sandbox-agent invocation that produces JSONL-on-stdout was deferred from 6.2 → 6.3 → 6.5." Story 6.5 (real-service verification) could not run due to unresolved operational prerequisites, so the contract was never validated. Epic 6 was marked `done` in `sprint-status.yaml` despite the gap.

### Verified Discoveries (2026-07-17 Binary Inspection)

Direct inspection of the sandbox-agent binary (v0.4.2, rivet-dev) at `/opt/sandbox-agent` on 2026-07-17 revealed **two additional defects** beyond the JSONL-on-stdout transport mismatch that this proposal originally scoped. Both would block Story 8.2's implementation even if the transport rewrite were executed perfectly per the original proposal.

**Discovery A — Wrong package installed.** `SandboxService.installBinaries()` (line 337) runs `sudo -E env "PATH=$PATH" npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`. This installs the **Claude Code CLI** (`@anthropic-ai/claude-code`), not the **ACP agent process** (`@agentclientprotocol/claude-agent-acp`) that sandbox-agent's server actually manages. The sandbox-agent server does NOT discover globally-installed npm packages — it maintains its own agent registry at `~/.local/share/sandbox-agent/bin/`. Even with the transport rewritten to HTTP SSE, the server would report Claude as `"installed": false` and reject run requests with `"unsupported_agent"` or `"stream_error"`.

The correct installation mechanism is `sandbox-agent install-agent <AGENT>` (first-class subcommand, no sudo required). For Claude, this installs two artifacts to `~/.local/share/sandbox-agent/bin/` (a user-writable path):
- Native binary: `claude` (v2.1.212, ~264MB, downloaded from GCS)
- ACP agent process: `@agentclientprotocol/claude-agent-acp@0.59.0` (npm package, installed to a sandbox-agent-managed path, not global)

The server then reports `{"id":"claude","installed":true,"credentialsAvailable":true}` via `GET /v1/agents`.

**Discovery B — Wrong API endpoints assumed.** This proposal's "Resolved Unknown #1" assumed a REST-style API: `POST /run` (returns `{ run_id, session_id }`), `GET /runs/:run_id/events` (SSE), `POST /runs/:run_id/cancel`. This is **incorrect**. The actual API is **ACP (Agent Client Protocol)** based, using JSON-RPC envelopes:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/v1/agents` | List all agents and install status (verified: returns `{"agents":[{"id":"claude","installed":true,...}]}`) |
| `POST` | `/v1/acp/{server_id}` | Send one ACP JSON-RPC envelope to the named agent server |
| `GET` | `/v1/acp/{server_id}` | Stream ACP JSON-RPC envelopes from the named agent server (SSE) |
| `POST` | `/v1/acp/{server_id}/close` | Close an ACP server stream |

The `sandbox-agent api acp` CLI subcommands (`post`, `stream`, `close`) map 1:1 to these HTTP endpoints. The `server_id` path parameter identifies the agent (e.g. `claude`). The SSE stream carries JSON-RPC envelopes (ACP protocol), not the `{ event_id, session_id, type, data }` schema this proposal originally assumed — the ACP envelope schema must be validated during Story 8.2 implementation by inspecting the actual SSE stream output.

Both discoveries were verified by starting `sandbox-agent server --port 2468` locally and querying the HTTP API directly.

### Evidence

| # | Evidence | Source |
|---|----------|--------|
| 1 | `architecture.md:667` — "sandbox-agent JSONL → `agui-event-bridge.service.ts` → SSE → browser" | Architecture |
| 2 | `architecture.md:664` — "Claude Agent SDK + sandbox-agent — run inside the Daytona sandbox; pulled by `apps/agent-be/src/streaming/agui-event-bridge.service.ts`." | Architecture |
| 3 | `architecture.md:111` — "sandbox-agent (rivet-dev) normalises Claude Code JSONL output into AG-UI events." | Architecture |
| 4 | `architecture.md:574` — "agui-event-bridge.service.ts # JSONL→AG-UI passthrough, circuit breaker, heartbeat" | Architecture |
| 5 | `architecture.md:622` — "tool-pill-classifier.service.ts inspects git-related tool call results from the sandbox-agent JSONL stream for 401 patterns" | Architecture |
| 6 | Research doc line 283 — "a small server binary deployed inside the sandbox that exposes an HTTP/SSE endpoint on a local port" (2026-06-12, pre-Epic-6) | Research |
| 7 | Prior change proposal line 237 — "It's a small server binary deployed inside the Daytona sandbox that exposes an HTTP/SSE endpoint on a local port" (2026-07-11, pre-Epic-6) | Change Proposal |
| 8 | Story 6.2 file Finding 1 (line 273+) — "sandbox-agent is an HTTP server, not a stdout-emitting CLI." | Implementation Artifact |
| 9 | `agui-event-bridge.service.ts:132-150` — `onStdout` callback splits on `\n`, JSON-parses each line, calls `processAgentEvent()`. Buffer cap of 1 MB. | Code |
| 10 | `sandbox.service.ts:407-420` — `streamAgentLogs()` calls `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)`. | Code |
| 11 | `Dockerfile:7-12, 47` — sandbox-agent binary downloaded and pinned at `/opt/sandbox-agent`. Binary does not exist on host (outside Docker). | Dockerfile |
| 12 | Epic 6 retro Significant Change #1 (lines 172-182) — explicitly recommends filing a sprint change proposal for the transport switch if the JSONL-on-stdout contract is unattainable. | Retro |
| 13 | Epic 6 retro Action Item #3 / Tech Debt #2 — Owner: Amelia. Status: unresolved. | Retro |
| 14 | `sandbox.service.ts:337` — `sudo -E env "PATH=$PATH" npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}` installs the wrong package (CLI, not ACP agent process) | Code |
| 15 | `sandbox-agent install-agent --all` output — installs `claude` native binary (v2.1.212) + `@agentclientprotocol/claude-agent-acp@0.59.0` to `~/.local/share/sandbox-agent/bin/`, no sudo required | Binary inspection |
| 16 | `GET http://127.0.0.1:2468/v1/agents` — returns `{"agents":[{"id":"claude","installed":true,"credentialsAvailable":true,...}]}` after `install-agent`; server does NOT discover globally-installed npm packages | Binary inspection |
| 17 | `sandbox-agent api acp --help` — subcommands `post`, `stream`, `close` map to `POST /v1/acp/{server_id}`, `GET /v1/acp/{server_id}` (SSE), `POST /v1/acp/{server_id}/close` | Binary inspection |

### Consequences

The current event bridge is structurally correct (circuit breaker, `OnModuleDestroy` cleanup, lifecycle event ownership, `onEvent` callback seam) but its **transport mechanism is wrong**:

- `AgentService.runTurn()`'s constructed invocation `sandbox-agent --agent claude-code --prompt "<message>"` (Story 6.3 placeholder) starts the HTTP server. Real agent events only come from the HTTP SSE API on port 2468.
- `getSessionCommandLogs` returns the server's startup logs, then blocks waiting for more stdout — which never comes. The circuit breaker fires after 120s, terminates the Daytona session, and emits `RUN_ERROR`. The user sees "The agent stopped unexpectedly" on every message.
- `CostTrackingService` (Story 6.3 / NFR-O1) never receives cost data from `RUN_FINISHED` because no `RUN_FINISHED` event ever arrives. Per-user LLM spend tracking is silent no-op for sandbox-based execution.
- `tool-pill-classifier.service.ts` (Story 3.7 / NFR-R1) never inspects tool call results — the `TOOL_CALL_END` events it classifies never arrive. Credential failure alerts won't fire on git 401s.
- `ManualCommitService` + working-tree emission can't fire either — `WORKING_TREE_DIRTY` is emitted after `FILE_MODIFYING_TOOLS` calls in the agent stream, which never arrive.
- **Local dev broken:** `nx serve agent-be` locally fails when a conversation request comes in because `/opt/sandbox-agent` doesn't exist on the host (baked into the Docker image). The error path is the new transport's first call.
- **False-confidence tests:** Story 6.2's 44 tests mock JSONL chunks on stdout. Tests are green but exercise a fictional contract. Per Epic 6 retro team agreement: *"A green test asserts the specific contract, not the presence of the contract's bytes."* The current contract is wrong.

The real-service E2E verification (Story 6.5) that would have caught all of this was never able to run — Epic 6 Action Item #1 (operational prerequisites) and Action Item #2 (JWT Edge-vs-Node decryption) remain unresolved.

---

## Section 2: Impact Analysis

### Epic Impact

**Epic 6 (Sandbox-Based Agent Execution)** — marked `done` in `sprint-status.yaml:114-120` but not "operationally validated" per Epic 6 retro team agreement. Three of its five stories have false-confidence foundations:

| Story | Status | Impact |
|-------|--------|---------|
| **6.1** (Install binaries + provision) | `done` | Binaries correctly installed at `/opt/sandbox-agent`; provision sequence correct. The binary itself is correct — only its invocation contract is wrong. **However**, `installBinaries()` line 337 installs the wrong package (`@anthropic-ai/claude-code` CLI via `sudo npm install -g`) instead of the ACP agent process (`@agentclientprotocol/claude-agent-acp`) that the sandbox-agent server manages. This must be replaced with `sandbox-agent install-agent claude` — no sudo, installs to `~/.local/share/sandbox-agent/bin/`, server discovers it automatically. The `CLAUDE_CODE_VERSION` constant (line 50) and its NFR-S1 test (`sandbox.service.nfr-s1.spec.ts:509`) are updated in Story 8.2. |
| **6.2** (Implement agui-event-bridge.service.ts) | `done` | **Central impact.** `onStdout` line-parser logic (lines 132-150) and `processAgentEvent()` JSON-parsing (lines 267-290) exercise a fictional contract. Tests (44 across 2 spec files) mock fabricated JSONL chunks. The transport mechanism needs replacement: HTTP SSE client consuming port 2468, not `getSessionCommandLogs` stdout streaming. The circuit breaker, lifecycle ownership, `onEvent` callback, `OnModuleDestroy` patterns, AG-UI event type validation are all transport-agnostic and survive intact. |
| **6.3** (Migrate AgentService) | `done` | `AgentService.runTurn()` constructs `sandbox-agent --agent claude-code --prompt "<message>"` as the command string passed to the event bridge. This command needs replacement: `sandbox-agent server` to start the daemon, then HTTP POST to port 2468 to drive an agent run. The `onEvent` callback seam (DP-3) and the `pendingClassifierPromises`, `FILE_MODIFYING_TOOLS`, cost recording, working-tree emission patterns all survive — they consume AG-UI events, not stdout. Story 6.3's removal of `@anthropic-ai/claude-agent-sdk`, `AGENT_WORKDIR`, `tmpdir()`, `abortPromise/Promise.race`, circuit breaker methods — all preserve correctly. |
| **6.4** (Verify working tree, commit, credential flows) | `done` | Verification ran against the fabricated JSONL contract — green tests don't exercise the real binary. The flows themselves (working-tree, manual commit, credential detection) are transport-agnostic; they consume AG-UI events. Once the transport is fixed, these flows should work without code changes (per the story's own Dev Notes: "the fix is the execution location, not the flow logic"). F4/F5 fidelity fixes remain valid. |
| **6.5** (Real-service E2E verification) | `done` | Never ran. The 5 real-service specs are written with `beforeAll` env-var skip guards — `PLAYWRIGHT_REAL_SERVICE=1` not set in CI. This is the critical gap that allowed the JSONL-on-stdout assumption to persist unchecked into production-bound code. Resolving this proposal is a precondition for Story 6.5's specs ever being runnable. |

**Epic 7 (Live-Usage UX Improvements)** — `backlog` in `sprint-status.yaml:128`. Frontend presentation only, explicitly independent of Epic 6 transport. **No impact.** Can proceed in parallel.

**Epic 8 (Sandbox Lifecycle and Transport Correction)** — `backlog` in `sprint-status.yaml:144-157`. The reaper (Story 8.1) and the transport correction (Stories 8.2–8.3) are now integrated into a single epic. The reaper's operational value depends on the transport fix (Story 8.2) completing — with the current transport broken, no real sandboxes are in flight. **No code-level impact between the two story groups; operational dependency: Story 8.1's reaper gains significance once Story 8.2 fixes the transport.**

### Story Impact

No existing stories require modification in-place (they were marked done and went through their retrospectives — rewriting them retroactively would erase historical accuracy). The transport fix is scoped into 2 new stories added to Epic 8 (see Section 4.1). Architecture document reconciliation is a handoff item for the Architect, not a story.

### Artifact Conflicts

| Artifact | Conflict | Action Needed |
|-----------|----------|---------------|
| **PRD** | 6 references to in-sandbox execution (lines 100, 105, 258, 262, 318, 479) — all transport-agnostic | None — PRD is correct; the agent runs inside the sandbox regardless of how agent-be polls for events |
| **Architecture** | 5 stale "JSONL"/stdout references | Update — see Section 4.2 |
| **UX Design** | None — UI consumes SSE events, agnostic to transport | None |
| **`project-context.md`** | No existing rule on sandbox-agent transport (the JSONL-on-stdout contract was never codified as a project rule); post-implementation, a rule documenting the HTTP-SSE-on-port-2468 transport pattern should be added | Post-implementation docs update (deferred) |
| **`sprint-status.yaml`** | No Epic 8 transport stories | Add Stories 8.2–8.3 to Epic 8 in `backlog` status (see Section 4.5) |
| **Story 6.2 file** | Finding 1 explicitly flagged this issue; the story's ATDD tests are fictional-contract | Add a "Post-Implementation Update" note pointing to this proposal and the eventual Epic 8 Story 8.2 fix (non-blocking, documentation only) |
| **Story 6.3 file** | Constructed `sandbox-agent --agent claude-code --prompt <message>` placeholder, never validated | Add a "Post-Implementation Update" note pointing to this proposal and the eventual Epic 8 Story 8.2 fix (non-blocking, documentation only) |
| **Epic 6 retro** | Significant Change #1 / Action Item #3 / TD #2 — owner Amelia, unresolved | Mark resolved once Epic 8 transport stories complete; reference this proposal ID |
| **`agent-be/test/fixtures/sdk-session-replay.jsonl`** | Already flagged wrong format (Epic 5/6 retro TD #6 — SDK messages, not AG-UI events); remains a gap; will be superseded by a recorded sandbox-agent HTTP/SSE session in Epic 8 Story 8.2 or remain as a debt item | Cross-reference in Epic 8 Story 8.2 dev notes |
| **Local dev (`nx serve agent-be`)** | `/opt/sandbox-agent` binary missing on host; runtime failure on first conversation request | In scope for Epic 8 Story 8.3 (see Section 4.1) |

### Technical Impact

**Code:**
- `SandboxService.installBinaries()` (lines 309-359): replace the `sudo -E env "PATH=$PATH" npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}` command (line 337) with `sandbox-agent install-agent claude --agent-version <version>`. This installs both the native binary and the ACP agent process to `~/.local/share/sandbox-agent/bin/` (user-writable, no sudo). The `CLAUDE_CODE_VERSION` constant (line 50, currently `'2.1.210'`) is replaced or renamed to reflect the sandbox-agent-managed version. The npm install verification step (lines 350-358) is replaced with a `GET /v1/agents` health check confirming `claude` is `"installed": true`. The NFR-S1 test at `sandbox.service.nfr-s1.spec.ts:509` (asserts `npm install -g @anthropic-ai/claude-code@<version>`) is rewritten to assert `install-agent claude`.
- `AguiEventBridgeService.streamAgentEvents()` (lines 91-225): replace `streamAgentLogs(...)` + `onStdout` JSONL-parsing with an HTTP client consuming `http://<sandbox-tunnel-host>:2468/v1/acp/{server_id}` (SSE stream via `GET`). The `MAX_LINE_BUFFER_BYTES`, `buffer += chunk`, `lines.split('\n')` logic (lines 132-150) becomes unused. `processAgentEvent()` JSON-parsing (lines 267-290) is reused — sandbox-agent's SSE events are still JSON-per-frame — but the input source changes, and the envelope schema is ACP JSON-RPC (not the `{ event_id, session_id, type, data }` shape originally assumed).
- `SandboxService.createAgentSession()` (lines 381-405): the command passed in changes from `sandbox-agent --agent claude-code --prompt <message>` to `sandbox-agent server` (start daemon) — or the daemon is started once during provision (Story 6.1 extension) and `createAgentSession` becomes unnecessary. **Design decision for Story 8.2:** daemon-per-conversation (start in `createAgentSession`, terminate in `terminateAgentSession`) vs. daemon-per-provision (start in `installBinaries`, persist across turns). Daemon-per-provision matches the architecture's "agent-be is the active party, sandbox never initiates outbound" contract and minimizes per-turn startup cost; recommended.
- `SandboxService.streamAgentLogs()` (lines 407-420): currently bridges Daytona's `getSessionCommandLogs` 4-arg callback overload. If the transport changes to HTTP SSE consumption by agent-be directly, this method may become unnecessary for the agent event channel. It could survive as a "stream sandbox-agent startup logs for diagnostic purposes" helper, or be removed. **Design decision for Story 8.2.**
- `SandboxService.terminateAgentSession()` (lines 422-437): if daemon-per-provision, terminating the session deletes the Daytona process session but the daemon survives. Cancelling an in-flight agent run requires `POST /v1/acp/{server_id}/close` (verified endpoint — see Resolved Unknown #1). If daemon-per-conversation, `terminateAgentSession` continues to delete the session and kills the daemon. **Design decision for Story 8.2.**
- `AgentService.runTurn()` (Story 6.3): the `command` and `cwd` parameters passed to `streamAgentEvents()` change shape. Today: `sandbox-agent --agent claude-code --prompt <message>` + `repo` cwd. Tomorrow: `POST /v1/acp/{server_id}` with an ACP JSON-RPC envelope containing the user message, then `GET /v1/acp/{server_id}` for the SSE response stream. The `onEvent` seam, lifecycle ownership, cost recording logic, pendingClassifierPromises pattern — all unchanged.
- `ISandboxService` interface (`libs/shared-types/src/sandbox.interface.ts`): may need new methods (e.g. `startSandboxAgent(sandboxId): Promise<{ port: number; baseUrl: string }>` + `stopSandboxAgent(sandboxId): Promise<void>`) depending on Story 8.2's design decision. The existing `createAgentSession` / `streamAgentLogs` / `terminateAgentSession` signatures may be replaced or augmented — must match whatever the new transport needs.
- `AgentSessionHandle` type — may need to evolve if the handle is no longer `{ sessionId, commandId }` but instead `{ serverId: string; baseUrl: string }` (ACP uses `server_id`, not `runId`).

**Infrastructure:**
- Daytona sandbox network config: the sandbox's local port 2468 must be reachable from agent-be via Daytona's tunnel/bridge. The 2026-07-11 change proposal's "Resolved Unknowns" #2 already established this: *"agent-be creates a Daytona process session (`sandbox.process.createSession`), runs sandbox-agent inside it asynchronously, calls `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)` which streams stdout/stderr back to agent-be."* But this contract assumes stdout streaming — for HTTP SSE consumption, agent-be needs an HTTP client that can reach the sandbox's port 2468 via Daytona's proxy (or the `sandbox` host from inside the SDK). **Resolved Unknown #2 below addresses this.**
- No new infrastructure services. The `sandbox-agent` binary is already baked into the Docker image.
- Local dev needs a stub `sandbox-agent` binary or a fake HTTP server at port 2468 so `nx serve agent-be` doesn't crash. Options: (a) `SandboxServiceFake` already exists for tests — extend it to handle the new HTTP path; (b) ship a small dev-only mock server script in the repo; (c) document "use the Docker image for full local dev." Recommended (a) + (c): `SandboxServiceFake` for unit/integration tests, document Docker-image-based local dev for full-stack smoke (already required for real-service E2E in Story 6.5).

**Deployment:**
- No changes — `apps/agent-be`'s containerImage is unchanged. The new HTTP client is a Node.js dependency (no new packages needed — Node 24's native `fetch` supports SSE via `ReadableStream`, or `eventsource` if a simpler consumer is preferred).
- `apps/web` deploy unchanged.

---

## Section 3: Recommended Approach

### Selected: Hybrid — New Stories in Epic 8 (Transport Correction) + PRD MVP Reaffirmation

Add two stories to the existing Epic 8 ("Sandbox Lifecycle and Transport Correction") that:
1. Rewrite `AguiEventBridgeService`'s transport mechanism from JSONL-on-stdout parsing to HTTP SSE consumption of port 2468 (central dev work).
2. Fix local dev parity and run the real-service E2E verification that Story 6.5 could never run (dev + ops work, depends on Epic 6 retro Action Item #1).

Architecture document reconciliation is a handoff item for the Architect (Section 5), not a story.

The PRD MVP is reaffirmed as fully achievable — only the architecture's transport description was stale, not the PRD's goals. No PRD changes.

### Rationale

1. **Research-aligned correction, not new direction.** The pre-Epic-6 research (`technical-backend-service-architecture-claude-agent-sdk-ag-ui-research-2026-06-12.md` line 283) and the Epic 6 sprint change proposal (line 237) both knew sandbox-agent is an HTTP server. The discovery during Story 6.2 Task 1 confirmed it against the real binary. This proposal is reconciliation of the architecture document + the event bridge code to the truth that research already established.
2. **Preserves the transport-agnostic layer.** Epic 6's central insight — "the SSE event vocabulary above the transport is stable, the transport beneath it is replaceable" (Epic 6 retro Key Insight #2) — is preserved. `SessionEventsService`, `StreamingController`, AG-UI event types, tool-pill classifier, cost tracking, working-tree emission, `onEvent` callback seam — all unchanged. Only the bottom of the stack (how `AguiEventBridgeService` gets events out of sandbox-agent) changes.
3. **No story rollback required.** Epic 6's stories remain `done`. The event-vocabulary preservation work in Story 6.3 — removing `@anthropic-ai/claude-agent-sdk`, removing `AGENT_WORKDIR`/`tmpdir()`/`abortPromise/Promise.race`, removing the entire circuit breaker.Sdk-specific block — all remains correct. The fix is a targeted swap of how events arrive at the event bridge, not a rollback of how events flow from there to the browser.
4. **Minimal external dependencies.** Node 24 ships native `fetch` + `ReadableStream` with SSE-friendly semantics. No new npm packages required unless `eventsource` is preferred for cleaner API (decision deferred to Story 8.2 dev).
5. **Sequencing cleanly.** Story 8.2 (transport rewrite) starts immediately — no external prerequisites beyond what's already in the codebase. Story 8.3 (real-service verification) depends on Epic 6 retro Action Item #1 (operational prerequisites for real-service E2E — GitHub test account with 2FA, CI secrets, etc.) — Marius owns that workstream, parallel to Amelia's Story 8.2 implementation.
6. **PRD compliance.** All 6 PRD references to in-sandbox execution (lines 100, 105, 258, 262, 318, 479) remain satisfied — the agent runs inside the sandbox; only how agent-be polls for its events changes.
7. **Closes the retro accountability gap.** The Epic 6 retro flagged this as Action Item #3 / TD #2 (Owner: Amelia, Status: unresolved) and explicitly recommended "file a sprint change proposal for the transport switch." This is that proposal.

### Alternatives Considered and Rejected

**Option (b) — Add Stories 6.6 and 6.7 to Epic 6 (reopen Epic 6):**
- Epic 6 has a completed retrospective (`epic-6-retro-2026-07-16.md`, `epic-6-retrospective: done` in sprint-status.yaml:120). Reopening retro'd epics means the new scope can't be cleanly tracked through its own retro cycle.
- The Epic 6 retro explicitly said the work is "a post-Epic-6 architectural concern" — the retro itself recommended a separate change proposal rather than in-epic scope expansion.
- Rejected.

**Option (c) — Roll back Epic 6's event bridge, restore host-based SDK `query()` execution:**
- Reintroduces the Story 3.3 DP-2 security risk (Bash tool gives agent shell access to host — `.env`, `AUTH_SECRET`, `DATABASE_URL`, `DAYTONA_API_KEY`, source code, other conversations' repos).
- Reverts the entire 2,478 net+ line migration of Epic 6 (Story 6.3's removal of `@anthropic-ai/claude-agent-sdk`, the SSE vocabulary preservation, the `onEvent` seam, the segments dual-write persistence, the working-tree side-effect structure).
- PRD-violating: requires PRD changes that undermine the product concept ("The Agent and all tool calls run inside the Sandbox" — 6 PRD lines).
- Rejected.

**Option (d) — Wait for Epic 6 retro Action Item #1 (operational prerequisites) to resolve, then validate the JSONL-on-stdout contract against a real sandbox before deciding:**
- The contract is **already known to be unattainable** per the research docs (line 283) and Story 6.2's direct binary inspection. Waiting for real-service access to validate what's already established would block this proposal on a dependency that has no resolution timeline (operational prerequisites are human-action items: GitHub test account with 2FA, CI secrets, OAuth callback setup — retro Action Item #1 hasn't been touched).
- Worst case: the operational unblock takes weeks, during which the broken transport sits in `main`, code review continues to assume it works, and the divergence from research grows. Best case: it still takes days, and the proposal work is gated on it unnecessarily.
- The transport rewrite (Story 8.2) doesn't strictly require real-service access — Node's `EventSource`/`fetch` SSE consumption can be unit-tested against a fake sandbox-agent HTTP server (like Story 6.2's `SandboxServiceFake` for the JSONL path, but emitting SSE). Real-service verification is the right gate for "does it actually work end-to-end," not "have we written the code."
- Rejected — file the proposal now; real-service verification is Story 8.3.

### Effort, Risk, and Timeline

| Dimension | Assessment |
|------------|------------|
| **Effort** | Medium — 2 stories. Story 8.2 is the dev-heavy one — transport swap of `AguiEventBridgeService` + matching `SandboxService` API adjustments + matching test rewrite (44 tests on old contract must be re-evaluated). Story 8.3 is dev + ops — local dev parity + Story 6.5 real-service specs actually running. Total effort estimate: 4-6 dev days for Story 8.2; 2-3 dev days for Story 8.3 (assuming Action Item #1 prerequisites resolve). Architecture doc reconciliation is a handoff item for the Architect (~0.5 dev days), not a story. |
| **Risk** | Medium — sandbox-agent's HTTP/SSE API contract is research-documented but not contract-tested against this codebase (Story 8.2 closes this with unit tests against a fake HTTP server; Story 8.3 closes it with real-service verification). The transport rewrite touches a central service, but the surface area above the transport (SSE pipeline, AG-UI event types, tool-pill classifier, cost tracking) is provably transport-agnostic per Epic 6 — risk of cascading breakage is low. |
| **Timeline** | 1 sprint (or parallel with Epic 7 if capacity allows — Story 8.2 has no external prerequisite; Story 8.3 depends on Action Item #1). |
| **MVP impact** | MVP is achievable — PRD's transport-agnostic in-sandbox-execution goals are correct; only architecture's stale transport description and the built-on-it event bridge need correction. |

---

## Section 4: Detailed Change Proposals

### 4.1: New Stories 8.2–8.3 in Epic 8 — Sandbox-Agent Transport Correction

**Artifact:** `_bmad-output/planning-artifacts/epics/epic-8.md`

Add two stories to Epic 8. Their purpose is to bring the event bridge code and the test suite back in line with the architectural truth that research already established: sandbox-agent is an HTTP server on port 2468, and agent-be must consume its events over HTTP SSE, not JSONL-on-stdout. Architecture document reconciliation is a handoff item for the Architect (Section 5), not a story.

| Story | Title | Key Deliverable |
|-------|-------|-----------------|
| 8.2 | Replace AguiEventBridgeService Transport with ACP HTTP SSE on Port 2468 + Fix Agent Installation | `SandboxService.installBinaries()` rewritten to use `sandbox-agent install-agent claude` (replaces `sudo npm install -g @anthropic-ai/claude-code`); `AguiEventBridgeService.streamAgentEvents()` rewritten to consume `GET http://<sandbox-tunnel-host>:2468/v1/acp/{server_id}` SSE stream via Node `fetch` + `ReadableStream` (or `eventsource`); `AgentService.runTurn()` sends `POST /v1/acp/{server_id}` with ACP JSON-RPC envelopes; matching `SandboxService` API adjustments; 44 existing tests re-evaluated (some survive — circuit breaker, `OnModuleDestroy`, lifecycle ownership; some replaced — JSONL-parsing tests become ACP-SSE-consumption tests); `SandboxServiceFake` extended to expose the ACP-SSE channel mock; NFR-S1 test for npm install rewritten to assert `install-agent` |
| 8.3 | Local Dev Parity + Real-Service E2E Verification | Local dev: `nx serve agent-be` works for full-stack smoke (SandboxServiceFake handles the new HTTP path; no `/opt/sandbox-agent` binary required on host). Real-service: Story 6.5's 5 skipped specs run with `PLAYWRIGHT_REAL_SERVICE=1` against a real Daytona sandbox + real sandbox-agent + real Anthropic API. Depends on Epic 6 retro Action Item #1 (operational prerequisites) and Action Item #2 (JWT Edge-vs-Node decryption) being resolved. |

**Sequencing constraints:**
- 8.3 is gated on Action Item #1 (operational prerequisites) — cannot run real-service specs without a real Daytona sandbox + real Anthropic API key + GitHub test account with 2FA. Coordinate with Marius on timing.
- 8.3 also gated on Action Item #2 (JWT Edge-vs-Node decryption) for the 3 PR-tier Playwright specs (`test.fixme()` markers in Story 5.4 hover blocks + Story 6.5 auto-scroll regression). The 5 functional real-service specs (Tier 3, agent-be to Daytona to Anthropic) don't require the JWT fix — they hit agent-be directly with a boundary JWT minted in Node, not through the browser middleware.
- Architecture doc reconciliation (Architect handoff, Section 5) should land before Story 8.2 merges so the architecture isn't a moving target during review.

### 4.2: Architecture Document Updates

**Artifact:** `_bmad-output/planning-artifacts/architecture.md`

Six sections require updates. All are corrections toward the research-validated truth, not new direction:

| Section | Current Text | Proposed Change |
|---------|--------------|------------------|
| Line 76 (sandbox-agent version policy) | "Before any upgrade: diff the JSONL→AG-UI event mapping in the release changelog" | "Before any upgrade: diff the ACP JSON-RPC event schema and AG-UI re-encoding mapping in the release changelog; verify `install-agent` still succeeds with the new version" |
| Line 111 (JSONL normalisation) | "sandbox-agent (rivet-dev) normalises Claude Code JSONL output into AG-UI events." | "sandbox-agent (rivet-dev, v0.4.2) is a Rust daemon (`sandbox-agent server`) exposing an HTTP + SSE API on port 2468 inside the sandbox. agent-be connects via the Daytona SDK's per-sandbox tunnel and consumes events over HTTP SSE (ACP JSON-RPC envelopes) — sandbox-agent is NOT a stdout-emitting CLI. Claude Code is installed via `sandbox-agent install-agent claude` (not `npm install -g`) and runs as a child process of sandbox-agent." |
| Line 574 (file structure comment for `agui-event-bridge.service.ts`) | "JSONL→AG-UI passthrough, circuit breaker, heartbeat" | "Consumes sandbox-agent's ACP/SSE on port 2468 → AG-UI re-encode, circuit breaker, heartbeat" |
| Line 622 (credential failure propagation) | "inspects git-related tool call results from the sandbox-agent JSONL stream for 401 patterns" | "inspects git-related tool call results from sandbox-agent's ACP/SSE event stream for 401 patterns" |
| Line 664 (External Integrations) | "Claude Agent SDK + sandbox-agent — run inside the Daytona sandbox; pulled by `apps/agent-be/src/streaming/agui-event-bridge.service.ts`." | "sandbox-agent (Rust daemon) runs inside the Daytona sandbox, exposing HTTP + SSE (ACP JSON-RPC) on port 2468; `apps/agent-be` connects to it via the Daytona SDK's per-sandbox tunnel (`sandbox` host alias). Claude Code is installed via `sandbox-agent install-agent claude` (not `npm install -g @anthropic-ai/claude-code`) and runs as a child process of sandbox-agent. The `@anthropic-ai/claude-agent-sdk` is no longer imported in `apps/agent-be` — it was removed in Story 6.3." |
| Line 667 (Data Flow) | "sandbox-agent JSONL → `agui-event-bridge.service.ts` → SSE → browser." | "sandbox-agent ACP/SSE API (port 2468) → `agui-event-bridge.service.ts` → SSE → browser." |

Also add a new "Transport mechanism" subsection (after the External Integrations section, near line 664) documenting:
- `sandbox-agent` is started as `sandbox-agent server` (recommended: once per provision in `SandboxService.installBinaries()` Story 6.1, surviving across turns — design decision for Story 8.2).
- Claude Code is installed via `sandbox-agent install-agent claude` (first-class subcommand, no sudo, installs to `~/.local/share/sandbox-agent/bin/`). NOT `npm install -g @anthropic-ai/claude-code` — that installs the CLI, not the ACP agent process the server manages.
- agent-be's `AguiEventBridgeService` sends ACP JSON-RPC envelopes via `POST http://<sandbox-tunnel-host>:2468/v1/acp/{server_id}` and opens a `GET http://<sandbox-tunnel-host>:2468/v1/acp/{server_id}` SSE stream for the response.
- No startup command per conversation turn — the daemon is already running from provision.
- `stop()` for an in-flight turn sends `POST http://.../v1/acp/{server_id}/close` (verified endpoint — see Resolved Unknown #1). Sandbox never initiates outbound connection to agent-be.

### 4.3: Story 6.2 and Story 6.3 File Updates (Documentation Only)

**Artifacts:**
- `_bmad-output/implementation-artifacts/6-2-implement-jsonl-to-agui-event-bridge.md`
- `_bmad-output/implementation-artifacts/6-3-migrate-agentservice-to-sandbox-execution.md`

Add a "Post-Implementation Update" section to each story file pointing to this proposal as the resolution of the deferred transport-validation gap. The story files' Finding 1 (Story 6.2) and the placeholder invocation (Story 6.3) are not rewritten — they remain as historical record. The update is a pointer:

**Story 6.2 addendum:**

> **Post-Implementation Update (2026-07-17):** Finding 1's deferred validation of the JSONL-on-stdout contract was never resolved within Epic 6. The contract is **unattainable** — sandbox-agent does not emit agent events to stdout. See `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-17-sandbox-agent-transport.md` for the architecture reconciliation (Epic 8). The event bridge's `onStdout` JSONL parsing (lines 132-150, 267-290), `MAX_LINE_BUFFER_BYTES` constant (line 56), and the contract's `getSessionCommandLogs` transport (Story 6.2 AC-1, AC-2, AC-6, Task 3.3) are replaced by HTTP SSE consumption on port 2468 in Epic 8 Story 8.2. The transport-agnostic patterns (circuit breaker, `OnModuleDestroy` cleanup, lifecycle ownership, `onEvent` callback seam) survive intact. The 44 ATDD tests are re-evaluated in Story 8.2 — some survive (circuit breaker, lifecycle, OnModuleDestroy), some are replaced (JSONL-parsing tests become HTTP-SSE-consumption tests).

**Story 6.3 addendum:**

> **Post-Implementation Update (2026-07-17):** The `sandbox-agent --agent claude-code --prompt "<message>"` placeholder invocation constructed in this story was never validated against the real binary. It does not produce JSONL-on-stdout (sandbox-agent is an HTTP server on port 2468). See `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-17-sandbox-agent-transport.md` for the transport rewrite (Epic 8 Story 8.2). The `onEvent` callback seam (DP-3), lifecycle event ownership, cost recording from `RUN_FINISHED` data payload, pending classifier promises, `FILE_MODIFYING_TOOLS` working-tree emission — all transport-agnostic, all unchanged by the transport switch.

### 4.4: Epic 6 Retro Updates

**Artifact:** `_bmad-output/implementation-artifacts/epic-6-retro-2026-07-16.md`

Mark the two retro keys as resolved with a forward reference to this proposal:
- **Action Item #3** (Validate the sandbox-agent invocation command): Status changes from unresolved to "RESOLVED via Epic 8 Sprint Change Proposal 2026-07-17-sandbox-agent-transport." The sprint change proposal itself is the retro's recommendation #2 ("file a sprint change proposal for the transport switch").
- **Significant Change #1**: Append "Resolved 2026-07-17 via Epic 8 — see sprint-change-proposal-2026-07-17-sandbox-agent-transport.md."

These updates are documentation only — they don't change the retro's findings, just close the loop on its action items.

### 4.5: sprint-status.yaml Update

**Artifact:** `_bmad-output/implementation-artifacts/sprint-status.yaml`

Add Epic 8 transport stories (all stories `backlog`):

```yaml
  # ── Epic 8: Sandbox Lifecycle and Transport Correction ──
  # Reconciles architecture (5 stale JSONL/stdout references) and event bridge code
  # with verified truth: sandbox-agent is an ACP HTTP server on port 2468,
  # not a JSONL-on-stdout CLI. Agent installation uses `install-agent`, not
  # `npm install -g`. Triggered by Epic 6 retro Significant Change #1 /
  # Action Item #3 / Tech Debt #2. See:
  # sprint-change-proposal-2026-07-17-sandbox-agent-transport.md
  epic-8: backlog
  8-2-replace-agui-event-bridge-transport-with-acp-sse-on-port-2468-and-fix-agent-installation: backlog
  8-3-local-dev-parity-and-real-service-e2e-verification: backlog
```

### 4.6: Post-Implementation Updates (Non-Blocking)

These updates happen after Epic 8 transport stories are implemented, not as part of this proposal:

- `project-context.md` — add a rule documenting the ACP SSE transport pattern: "When consuming sandbox-agent events, use ACP HTTP SSE on port 2468 — `sandbox-agent server` runs as a daemon per provision; Claude Code is installed via `sandbox-agent install-agent claude` (not `npm install -g`); agent-be sends ACP JSON-RPC envelopes via `POST /v1/acp/{server_id}` and opens a `GET /v1/acp/{server_id}` SSE stream. Do not parse sandbox-agent's stdout via `getSessionCommandLogs` — that API is for diagnostic log streams, not the agent event channel."
- `agent-be/test/fixtures/sdk-session-replay.jsonl` — Epic 5/6 retro TD #6 already flagged this as wrong format. Either replace with a recorded sandbox-agent HTTP/SSE session replay, or replace with a fabricated SSE fixture that exercises the contract shapes recorded against the real binary in Story 8.3's verification. Decision in Story 8.2.
- Story 6.2's 44 tests — re-evaluated in Story 8.2. List of tests that survive (likely: `OnModuleDestroy`, circuit breaker timer reset, lifecycle event ownership, `onEvent` callback seam, abort-sentinel handling, `ABORT_SENTINELS` / `AGENT_STREAM_CRASHED` flow). List of tests that get replaced (likely: the JSONL-parsing logic in `processAgentEvent()`, the `onStdout` buffer split logic, the `MAX_LINE_BUFFER_BYTES` cap test).

---

## Section 5: Implementation Handoff

### Scope Classification: Major

This is a Major scope change because it requires:
- Architecture document reconciliation (6 sections updated).
- Transport rewrite of a central service (`AguiEventBridgeService` is the only path from sandbox-agent to the browser SSE pipeline).
- Test suite re-evaluation (44 tests on a now-fabricated contract).
- Two new stories added to Epic 8 (transport correction).

However — like the 2026-07-11 Sprint Change Proposal that created Epic 6 — this is a **correction toward verified truth**, not a new direction. The research documents established that sandbox-agent is an HTTP server (correct), but assumed REST-style endpoints (incorrect — verified ACP-based on 2026-07-17). The architecture doc and the code built from the stale reading of the research need to catch up to what direct binary inspection confirmed.

### Handoff Recipients

| Role | Responsibility | Deliverable | Success Criteria |
|------|---------------|-------------|-------------------|
| **Architect** (Winston) | Update `architecture.md` with the 6 corrections in Section 4.2; add new "Transport mechanism" subsection documenting the HTTP/SSE-on-port-2468 contract | Updated `architecture.md` | All 5 "JSONL/stdout" references replaced with "HTTP/SSE on port 2468" or equivalent; new transport subsection added; cited research docs unchanged |
| **Tech Writer** (Paige) | Update `project-context.md` with the new transport pattern rule (post-implementation, non-blocking — handoff item, not a story) | Updated `project-context.md` | Rule added citing the HTTP-SSE pattern; rule cites the architecture line references |
| **PM** (John) | Create Epic 8 transport stories in `epic-8.md` (story bodies + acceptance criteria, drafted from this proposal's Section 4.1) | Epic 8 with 2 transport stories (8.2, 8.3) | Stories 8.2–8.3 in `epic-8.md` with full story specs; `sprint-status.yaml` updated per Section 4.5 |
| **Developer** (Amelia) | Implement Epic 8 Story 8.2 (transport rewrite + agent installation fix + test re-evaluation); support Story 8.3 real-service E2E once operational prerequisites resolve | Working ACP-SSE-consuming event bridge + `install-agent` replacing `npm install -g` + updated test suite | `AguiEventBridgeService` consumes ACP SSE on port 2468; `installBinaries()` uses `sandbox-agent install-agent claude` (no sudo); existing 44 tests re-evaluated; `SandboxServiceFake` updated; `AgentService.runTurn()` no longer constructs the placeholder `--agent --prompt` CLI invocation |
| **Developer** (Amelia) + **Project Lead** (Marius) | Story 8.3: local dev parity (SandboxServiceFake handles new HTTP path) + real-service E2E specs running | Real-service E2E passes | `PLAYWRIGHT_REAL_SERVICE=1 yarn playwright test --grep @real-service` discovers all specs; Tier 3 functional smoke passes against real Daytona + real sandbox-agent + real Anthropic API |
| **Master Test Architect** (Murat) | Fidelity audit pre-Story 8.2 implementation (mirroring CF3 SandboxService fidelity audit before Epic 6 stories); ATDD red-phase scaffold workflow for the 44 re-evaluated tests | Pre-epic fidelity audit + ATDD scaffolds | Audit report identifies which Story 6.2 tests survive, which need replacement, which are no longer applicable; ATDD scaffolds ready for Amelia's activation |
| **Architect** (Winston) | Architecture review after Story 8.2 implementation — confirm the corrected architecture is reflected in the code | Architecture-vs-code consistency review | The data flow at architecture.md L667 matches the implementation in `agui-event-bridge.service.ts:streamAgentEvents()` |

### Success Criteria

1. The 5 stale "JSONL/stdout" references in `architecture.md` (lines 76, 111, 574, 622, 664, 667) are replaced with ACP/SSE-on-port-2468 descriptions.
2. `AguiEventBridgeService.streamAgentEvents()` consumes sandbox-agent's ACP SSE stream on port 2468 — no `getSessionCommandLogs`-as-stdout-streaming for agent events (the Daytona API may still be used for sandbox-agent's diagnostic startup logs, if at all).
3. `SandboxService.installBinaries()` uses `sandbox-agent install-agent claude` — no `sudo npm install -g @anthropic-ai/claude-code`. The server reports `{"id":"claude","installed":true}` via `GET /v1/agents`. The NFR-S1 test asserts `install-agent`, not `npm install`.
4. The 44 Story 6.2 ATDD tests are re-evaluated: surviving tests (transport-agnostic patterns — circuit breaker, lifecycle ownership, `onEvent` seam, abort sentinels) keep their assertions; replaced tests (JSONL parsing, `MAX_LINE_BUFFER_BYTES` cap, `onStdout` buffer split logic) are rewritten against the new ACP-SSE consumption contract.
5. `nx serve agent-be` locally no longer fails on first conversation request due to missing `/opt/sandbox-agent` binary — `SandboxServiceFake` handles the ACP path, or a documented local-dev path means the binary isn't required for development (the binary requirement remains for production / Docker-based smoke).
6. `PLAYWRIGHT_REAL_SERVICE=1 yarn playwright test --grep @real-service` discovers and runs the 5 Story 6.5 specs (egress-control, functional-file-access, functional-git-commands, functional-stop-agent, functional-host-isolation) against a real Daytona sandbox + real sandbox-agent + real Anthropic API — all pass.
7. Real-service E2E confirms NFR-O1 (per-user LLM spend tracking) fires — cost data arrives via sandbox-agent's `RUN_FINISHED` event's `data` payload. If the schema differs from what Story 6.3's cost capture expects, Story 8.2 implements the compat shim or Story 8.3 surfaces the schema gap.
8. Epic 6 retro Action Item #3 marked resolved on the retro file (Section 4.4 above).
9. `sprint-status.yaml` updated with Epic 8 transport stories per Section 4.5; once Stories 8.2 + 8.3 are `done`, `epic-8: done` + `epic-8-retrospective: done` set.

### Resolved Unknowns

Three open questions constrain Story 8.2 implementation. Unknown #1 was originally marked "RESOLVED via research" — direct binary inspection on 2026-07-17 revealed the research was wrong. It is now genuinely verified:

**1. sandbox-agent HTTP/SSE API contract — VERIFIED against real binary (2026-07-17).**

Direct inspection by starting `sandbox-agent server --port 2468` locally and querying the HTTP API confirms the API is **ACP (Agent Client Protocol)** based, NOT the REST-style `/run` / `/runs/:id/events` pattern the research docs assumed:

| Method | Endpoint | Purpose | Verified |
|--------|----------|---------|----------|
| `GET` | `/` | Health check — returns `{"docs":"https://sandboxagent.dev","name":"Sandbox Agent"}` | Yes |
| `GET` | `/v1/agents` | List all agents and install status — returns `{"agents":[{"id":"claude","installed":true,"credentialsAvailable":true,"capabilities":{...}}]}` | Yes |
| `POST` | `/v1/acp/{server_id}` | Send one ACP JSON-RPC envelope to the named agent server (e.g. `server_id=claude`) | Yes (via `sandbox-agent api acp post`) |
| `GET` | `/v1/acp/{server_id}` | Stream ACP JSON-RPC envelopes from the named agent server (SSE) | Yes (via `sandbox-agent api acp stream`) |
| `POST` | `/v1/acp/{server_id}/close` | Close an ACP server stream | Yes (via `sandbox-agent api acp close`) |

The `sandbox-agent api acp` CLI subcommands (`post`, `stream`, `close`) map 1:1 to these HTTP endpoints. The `server_id` path parameter identifies the agent (e.g. `claude`).

**What is NOT yet verified:** the exact ACP JSON-RPC envelope schema carried by the SSE stream. The original proposal assumed `{ event_id, session_id, type, data }` (the `AgentEvent` schema from Story 6.2 research). ACP uses JSON-RPC 2.0 envelopes (`{ jsonrpc, method, params, id }` for requests; `{ jsonrpc, result, error, id }` for responses). Story 8.2 must inspect the actual SSE stream output (by sending a test message via `POST /v1/acp/claude` and reading the `GET /v1/acp/claude` stream) to discover the exact envelope shapes and map them to AG-UI events. This is implementation work, not a blocking unknown — the endpoints are confirmed.

**2. Daytona SDK tunnel to sandbox's port 2468 — confirmed in research, validated in Story 8.3.**

The 2026-07-11 change proposal's "Resolved Unknown #2" said: *"agent-be creates a Daytona process session (`sandbox.process.createSession`), runs sandbox-agent inside it asynchronously, calls `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)` which streams stdout/stderr back to agent-be."* That transport assumes stdout streaming — for HTTP SSE consumption, agent-be needs an HTTP client that can reach `http://<sandbox-host>:2468`. Daytona's SDK exposes the sandbox as a host via `sandbox.hostname` or similar — Story 8.2 spikes this in implementation; Story 8.3 validates against a real sandbox.

**3. daemon-per-provision vs. daemon-per-conversation — design decision for Story 8.2.**

Two viable daemon strategies:
- **Daemon-per-provision** (recommended): `sandbox-agent server` starts once during `SandboxService.installBinaries()` (Story 6.1 extension). Survives across turns. `createAgentSession` becomes a no-op or is removed. Pro: matches architecture's "agent-be is the active party, sandbox never initiates outbound" contract; minimizes per-turn startup cost. Con: daemons survive bugs in agent-be's cleanup paths; harder to reason about.
- **Daemon-per-conversation**: `sandbox-agent server` starts in `createAgentSession` (one per conversation), terminates in `terminateAgentSession`. Pro: simpler lifecycle; clean teardown per conversation. Con: per-turn startup cost (curl-style health check to confirm server-up); diverges from architecture's existing per-session model.

Recommended: daemon-per-provision (matches architecture's existing language and minimizes per-turn latency contribution to NFR-P1's 1,500ms first-token target). Story 8.2 dev notes should confirm.

---

## Status

**Approved (2026-07-17).** Originally generated by an autonomous Correct Course workflow run on 2026-07-17 and marked "Pending Approval." Reviewed and approved by Marius (Project Lead) on 2026-07-17 after direct binary inspection verified two additional defects (wrong package, wrong API endpoints) not in the original proposal. The proposal has been updated with the verified findings. Routed to handoff recipients per Section 5.

---

*Generated by bmad-correct-course skill workflow. Activation context: `_bmad-output/project-context.md` (185 rules). Input artifacts: PRD (n/a — no conflict), Epics (Epic 6 + 7 + 8 consulted), Architecture (5 stale references flagged), UX Design (n/a — no conflict). Story-level sources: Story 6.2 (Finding 1), Story 6.3 (placeholder invocation), Story 6.5 (real-service E2E never ran), Epic 6 retro (Significant Change #1, Action Item #3, TD #2).*
