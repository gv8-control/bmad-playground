# Sprint Change Proposal: Sandbox-Based Agent Execution

**Date:** 2026-07-11
**Trigger:** Story 3.3 — Converse with the Streaming Agent
**Scope Classification:** Major (architecture reconciliation + new epic)
**Status:** Pending Approval

---

## Section 1: Issue Summary

### Problem Statement

Story 3.3 implemented the streaming agent using `@anthropic-ai/claude-agent-sdk`'s `query()` function, which spawns the Claude Code native binary as a **local subprocess of the agent-be process** (host-based execution). The PRD and architecture prescribe the agent running **inside the Daytona sandbox** — where the repository is cloned, git identity is injected, and the working tree lives.

### What Happened

The Claude Agent SDK's `query()` API runs the binary on the host. It takes a `cwd` parameter for the working directory, but that directory is on the **host filesystem** — the Daytona sandbox's filesystem is remote and not mounted locally. The SDK does not provide an API to run the agent inside a remote sandbox.

Story 3.3's DP-2 decision record explicitly documented this as a deviation:

> "Finding: agent runs in host process via SDK `query()`, not inside the Daytona sandbox per architecture.md data flow. [...] Architecture reconciliation deferred to architect."

### Evidence

| # | Evidence | Source |
|---|----------|--------|
| 1 | `agent.service.ts:94` — `cwd: process.env.AGENT_WORKDIR ?? tmpdir()` — agent operates in `tmpdir()`, not the sandbox repo | Code |
| 2 | PRD line 100: "Agent — the Claude Code process running inside a Sandbox" | PRD |
| 3 | PRD line 105: "The Agent and all tool calls run inside the Sandbox" | PRD |
| 4 | PRD line 258: "executing a tool or Bash command inside the Sandbox" | PRD |
| 5 | PRD line 262: "any tool or Bash process running inside the Sandbox" | PRD |
| 6 | PRD line 318: "a platform-level commit inside the Sandbox" | PRD |
| 7 | PRD line 479: "Agent Sandbox execution depends on Daytona Cloud's availability" | PRD |
| 8 | Architecture line 668: "sandbox process exec (Claude Code agent) → sandbox-agent JSONL → agui-event-bridge → SSE" | Architecture |
| 9 | Architecture line 665: "Claude Agent SDK + sandbox-agent — run inside the Daytona sandbox" | Architecture |
| 10 | Story 3.3 DP-2: "Architecture reconciliation deferred to architect" | Story file |
| 11 | Investigation report: confirmed binary is healthy, failure is non-existent `cwd` | Investigation |
| 12 | `agui-event-bridge.service.ts` — listed in architecture line 575, **never created** | Codebase |
| 13 | `terminateProcess(sandboxId, 'agent-${conversationId}')` is a no-op — no agent process exists in the sandbox | Story 3.3 DP-2 |

### Consequences

The host-based agent:
- Cannot access the cloned repository (it's inside the sandbox)
- Cannot run git commands against the repo
- Cannot modify the working tree
- Cannot commit with the injected git identity
- Has access to the host filesystem (security risk — can read `.env` files with `AUTH_SECRET`, `DATABASE_URL`, `DAYTONA_API_KEY`)

Working tree checks (`getWorkingTreeStatus`) run against the sandbox via Daytona process exec, but the agent's file operations happen on the host — the sandbox working tree never changes from agent activity. `WORKING_TREE_DIRTY` events never fire. Manual commit has nothing to commit.

---

## Section 2: Impact Analysis

### Epic Impact

**Epic 3** (Conversations — Running BMAD Skills with the Agent) contains the trigger. All 12 stories are marked `done`, but three are fundamentally broken at the execution layer:

| Story | Impact | Details |
|-------|--------|---------|
| **3.3** (Streaming Agent) | **Broken — core** | Agent runs on host via SDK `query()`, can't access repo. SSE pipeline, UI, circuit breaker are sound — only execution location is wrong. |
| **3.4** (Tool Calls Inline) | **Partially affected** | Tool pill rendering works. But tools (Read, Write, Bash) operate on host filesystem, disconnected from repo. Display layer fine; execution layer broken. |
| **3.6** (Working Tree) | **Broken** | `getWorkingTreeStatus` checks sandbox via Daytona process exec, but agent modifies files on host. `WORKING_TREE_DIRTY` never fires. Manual commit has nothing to commit. |
| **3.7** (Credential Alerts) | **Partially affected** | Git-command credential detection won't trigger (agent can't run git against repo). Non-git credential detection (agent-be's own GitHub API calls) works. |
| **3.10** (Commit Identity) | **Broken** | Manual commit runs inside sandbox via Daytona process exec, but agent's changes are on host. Nothing to commit in sandbox. |
| 3.1, 3.2, 3.5, 3.8, 3.9, 3.11, 3.12 | Not affected | Sandbox lifecycle, UI, cost tracking, concurrency, drain — all work correctly. |

### Artifact Conflicts

| Artifact | Conflict | Action Needed |
|-----------|----------|---------------|
| **PRD** | 6 references to in-sandbox execution violated by host-based implementation | None — PRD is correct; implementation must match |
| **Architecture** | Data flow, event bridge, sandbox-agent all prescribed but never implemented | Update to clarify execution mechanism (all unknowns resolved — see Resolved Unknowns) |
| **UX Design** | No conflicts — UI consumes SSE events, agnostic to execution location | None |
| **project-context.md** | Agent execution rules reference SDK `query()`, `AGENT_WORKDIR`, `tmpdir()` | Update post-implementation |
| **env.validation.ts** | `ANTHROPIC_API_KEY` missing from Zod schema | Add as required |
| **sprint-status.yaml** | No Epic 6 entries | Add Epic 6 with stories in backlog |
| **Story 3.3 file** | DP-2 "architecture reconciliation deferred to architect" | Add note: reconciled via Epic 6 |

### Technical Impact

- **Code:** `AgentService` refactored from SDK `query()` to sandbox process exec + JSONL parsing. New `agui-event-bridge.service.ts`. `ISandboxService` may need a streaming exec method.
- **Infrastructure:** Claude Code binary installed inside sandbox during provision (file upload or download). No new infrastructure services.
- **Deployment:** No changes — agent-be and web deploy unchanged. Sandbox provision step gains binary installation.

---

## Section 3: Recommended Approach

### Selected: Option (a) — Migrate to Sandbox-Based Execution (Epic 6)

Run the Claude Code binary directly inside the Daytona sandbox via the sandbox process exec/PTY API. Parse JSONL output in agent-be's new `agui-event-bridge.service.ts`. Map to AG-UI events. The agent has direct filesystem access to the cloned repo.

### Rationale

1. **PRD compliance** — the PRD explicitly and repeatedly requires in-sandbox execution (6 references across lines 100, 105, 258, 262, 318, 479). Host-based execution violates the PRD.
2. **Architecture alignment** — the architecture already prescribes this approach (data flow line 668, `agui-event-bridge.service.ts` line 575, sandbox-agent line 115). The implementation needs to match, not the other way around.
3. **Security** — preserves sandbox isolation. The agent cannot access host secrets (`.env`, `AUTH_SECRET`, `DATABASE_URL`, `DAYTONA_API_KEY`), source code, or other conversations' repos. The Bash tool gives the agent shell access — in a host-based model, this exposes the entire host filesystem.
4. **Fixes all broken stories at once** — 3.3 (agent execution), 3.6 (working tree), 3.10 (commit identity) are all fixed by moving the agent into the sandbox.
5. **No PRD changes needed** — the PRD is correct as written.
6. **No UX changes needed** — the UI consumes SSE events, which are format-agnostic to execution location.

### Alternatives Considered and Rejected

**Option (b) — Host-based execution with local clone:**
- Violates PRD (6 references to in-sandbox execution — would require PRD changes that undermine the product concept)
- Security risk — Bash tool gives agent shell access to host, where it could read `.env` files with `AUTH_SECRET`, `DATABASE_URL`, `DAYTONA_API_KEY`
- Creates a parallel git/working-tree infrastructure on the host
- Not recommended.

**Option (c) — Hybrid (host execution + proxied file operations):**
- Technically uncertain — the SDK may not support custom tool routing or MCP-based file operation proxying
- Highest complexity, highest risk, unclear feasibility without SDK research
- Not recommended.

### Effort, Risk, and Timeline

| Dimension | Assessment |
|------------|------------|
| **Effort** | Medium-High (5 stories) |
| **Risk** | Medium — JSONL format stability, PTY streaming reliability, binary installation in sandbox |
| **Timeline** | 1 sprint |
| **MVP impact** | MVP is achievable — PRD and architecture are correct; implementation needs to match |

---

## Section 4: Detailed Change Proposals

### 4.1: New Epic 6 — Sandbox-Based Agent Execution

**Artifact:** `_bmad-output/planning-artifacts/epics.md`

Add Epic 6 with five stories. The stories are informed by the resolved unknowns — sandbox-agent (rivet-dev) handles JSONL→event normalization, and agent-be streams output via Daytona's `getSessionCommandLogs` API:

| Story | Title | Key Deliverable |
|-------|-------|-----------------|
| 6.1 | Install sandbox-agent + Claude Code Binary in Sandbox During Provision | Both binaries deployed inside sandbox during provision; `networkAllowList` applied for egress control |
| 6.2 | Implement agui-event-bridge.service.ts | Receives sandbox-agent's normalized event stream via Daytona's `getSessionCommandLogs`; re-encodes as AG-UI events; circuit breaker + heartbeat |
| 6.3 | Migrate AgentService to Sandbox-Based Execution | `AgentService.runTurn()` launches sandbox-agent inside sandbox via Daytona process session; streams via event bridge; `stop()` terminates real sandbox process |
| 6.4 | Verify Working Tree, Commit, and Credential Flows | `WORKING_TREE_DIRTY` fires, manual commit works, credential detection triggers |
| 6.5 | Real-Service E2E Verification | Tier 3 functional smoke + NFR performance tests pass |

### 4.2: Architecture Document Updates

**Artifact:** `_bmad-output/planning-artifacts/architecture.md`

The architecture is correct as prescribed — the research documents provide the full detail. The updates needed are clarifications, not changes:

| Section | Change |
|---------|--------|
| Line 115 (JSONL normalisation) | **Resolved.** sandbox-agent (rivet-dev) is a real third-party product ([GitHub](https://github.com/rivet-dev/sandbox-agent)). No change needed — the architecture is correct. Add a footnote citing the source for future reference. |
| Line 575 (file structure) | Document `agui-event-bridge.service.ts` — receives sandbox-agent's normalized event stream via Daytona's `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)` API; re-encodes as AG-UI events; implements circuit breaker + heartbeat. Does NOT parse raw JSONL — sandbox-agent handles that. |
| Line 665 (external integrations) | Clarify: SDK's `query()` is NOT used for execution. The Claude Code binary + sandbox-agent binary run inside the sandbox. agent-be launches sandbox-agent via Daytona process session API and streams output via `getSessionCommandLogs`. |
| Line 674 (build process) | Document binary installation: both sandbox-agent and Claude Code binaries deployed inside sandbox during provision. Pin sandbox-agent to immutable version; checksum-verify. |
| New section | Document the transport: agent-be creates Daytona process session (`sandbox.process.createSession`), runs sandbox-agent async (`executeCommand(..., { async: true })`), streams output via `getSessionCommandLogs`. The sandbox never initiates outbound connection to agent-be. |
| New section | Document `networkAllowList` egress control on sandbox provision (mitigation for credential exposure risk per network security research). |

### 4.3: Story 3.3 Update

**Artifact:** `_bmad-output/implementation-artifacts/3-3-converse-with-the-streaming-agent.md`

Update DP-2 decision record:

**OLD:**
```
Architecture reconciliation deferred to architect.
```

**NEW:**
```
Architecture reconciliation deferred to architect. Reconciled via Epic 6
(Sandbox-Based Agent Execution) — see sprint-change-proposal-2026-07-11.md.
The host-based execution implemented in this story is superseded by Epic 6,
which migrates agent execution into the Daytona sandbox per PRD §3 (lines 100, 105)
and architecture.md data flow (line 668).
```

### 4.4: sprint-status.yaml Update

**Artifact:** `_bmad-output/implementation-artifacts/sprint-status.yaml`

Add Epic 6 entries (all stories in `backlog` status).

### 4.5: Env Validation Update

**Artifact:** `apps/agent-be/src/config/env.validation.ts`

- Add `ANTHROPIC_API_KEY` as required string to Zod schema
- Do NOT add `AGENT_WORKDIR` (irrelevant after Epic 6)

### 4.6: Post-Implementation Updates (Not Blocking)

These updates happen after Epic 6 is implemented, not as part of this proposal:

- `project-context.md` — update agent execution rules to reflect sandbox-based execution
- `spec-fix-claude-binary-cwd-fallback.md` — `tmpdir()` fallback becomes dead code; cleanup is optional
- `AgentServiceFake` — update to reflect new execution mechanism
- `ISandboxService` — may need a new streaming exec method (story-level design decision)

---

## Section 5: Implementation Handoff

### Scope Classification: Major

This is a Major scope change because it requires architecture document reconciliation and a new epic. However, it is a correction toward the existing PRD and architecture — not a new direction. The PRD and architecture already prescribe sandbox-based execution; the implementation deviated, and Epic 6 brings it back.

### Handoff Recipients

| Role | Responsibility | Deliverable |
|------|---------------|-------------|
| **Architect** | Update architecture document with clarifications (all unknowns resolved — see Resolved Unknowns section); document `agui-event-bridge.service.ts` role and `networkAllowList` egress control | Updated `architecture.md` |
| **PM** | Create Epic 6 stories in `epics.md` | Epic 6 with 5 stories |
| **Developer** | Implement Epic 6 stories (6.1–6.5) | Working sandbox-based agent execution |
| **QA** | Run Tier 3 real-service E2E tests | Verification that agent can read repo, run tools, commit |

### Success Criteria

1. The Claude Code binary + sandbox-agent binary run inside the Daytona sandbox (not on the host)
2. The agent can read files, run git commands, and modify the working tree inside the sandbox
3. `WORKING_TREE_DIRTY` events fire when the agent modifies files
4. Manual commit (`ManualCommitService`) commits the agent's changes inside the sandbox
5. `stop()` terminates the agent process inside the sandbox via `terminateProcess()` (no longer a no-op)
6. Tier 3 functional smoke test passes — agent responds with "hello"
7. NFR-P1 (first token ≤1500ms) and NFR-P2 (chat ready ≤10s) are measurable
8. The agent cannot access host filesystem (`.env`, source code, other conversations' repos)
9. `networkAllowList` egress control applied to every sandbox provision (mitigates credential exposure risk)

### Resolved Unknowns

All four open unknowns from the initial proposal have been resolved by investigating the pre-architecture research documents:

**1. "sandbox-agent (rivet-dev)" — RESOLVED: Real third-party product**

`sandbox-agent` is an open-source binary by [Rivet (rivet-dev)](https://github.com/rivet-dev/sandbox-agent), released January 2026. It's a small server binary deployed inside the Daytona sandbox that exposes an HTTP/SSE endpoint on a local port. It handles Claude Code's JSONL stdout format and normalizes it to a structured event stream. Supported agents include Claude Code, Codex, OpenCode, and Amp.

The backend architecture research (`technical-backend-service-architecture-claude-agent-sdk-ag-ui-research-2026-06-12.md`) evaluated three options for the in-sandbox event channel and selected sandbox-agent (Option 1) via ADR-001, rejecting hooks→POST (Option 2, insufficient streaming fidelity) and WebSocket (Option 3, reconnection complexity).

Sources:
- GitHub: https://github.com/rivet-dev/sandbox-agent
- Rivet changelog: https://rivet.dev/changelog/2026-01-28-sandbox-agent-sdk/
- Website: https://sandboxagent.dev/

**2. Daytona streaming API — RESOLVED: `getSessionCommandLogs`**

The network security research (`technical-network-security-between-agent-be-and-daytona-sandbox-research-2026-06-16.md`) documents the exact transport:

1. agent-be creates a Daytona **process session** (`sandbox.process.createSession`)
2. Runs sandbox-agent inside it asynchronously (`executeCommand(..., { async: true })`)
3. Calls `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)` which streams stdout/stderr back to agent-be over the authenticated HTTPS/SDK channel
4. The sandbox never initiates an outbound connection to agent-be — agent-be is the active/polling party

This means `agui-event-bridge.service.ts` receives sandbox-agent's already-normalized event stream via Daytona's log-streaming API and re-encodes as AG-UI events for the browser SSE channel. It does NOT need to parse raw JSONL — sandbox-agent handles that.

**3. Binary installation mechanism — RESOLVED: Deploy inside sandbox during provision**

The research specifies: "Deploy sandbox-agent binary inside sandbox Docker image" and "Pin sandbox-agent to immutable version; checksum in Dockerfile layer." Both the sandbox-agent binary and the Claude Code binary are deployed inside the sandbox during provision.

**4. JSONL format stability — RESOLVED: sandbox-agent handles JSONL parsing**

The project does not write its own JSONL parser. sandbox-agent handles the JSONL→structured-event normalization. The pinned-version discipline applies to sandbox-agent itself (not the JSONL format directly). The architecture already documents the upgrade protocol: "Pin to an exact binary version in the Dockerfile (no floating tags). Before any upgrade: diff the JSONL→AG-UI event mapping in the release changelog."

### Additional Finding: Sandbox Credential Exposure Risk

The network security research flagged that `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` injected into the sandbox are exfiltratable by the agent process (per Daytona's own Security Exhibit). Two mitigations are documented:

1. **Egress allow-listing** (cheap, available now): Set `networkAllowList` on every sandbox to GitHub, Anthropic API, and package registries only — closes the exfiltration path
2. **Host-mediated git operations** (higher effort, structural): Route git through agent-be via Daytona's process-exec API with a credential helper that never writes the raw PAT into the sandbox's environment

The `networkAllowList` mitigation should be included in Story 6.1 (provision). The host-mediated git operations approach is a longer-term structural option for the risk register.
