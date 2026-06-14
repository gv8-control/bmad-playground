---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'Programmatic Claude Code / Agent SDK for headless skill execution'
research_goals: 'Understand how to drive Claude Code or the Anthropic Agent SDK from a backend web service to execute BMAD skills server-side, manage session lifecycle, and stream output back to the browser — for a SaaS platform giving non-dev roles access to BMAD'
user_name: 'Marius'
date: '2026-06-11'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-06-11
**Author:** Marius
**Research Type:** technical

---

## Research Overview

This research addresses a pivotal architectural question for the BMAD web platform: how to run BMAD skills server-side, triggered by a non-developer web user, with full access to their git repository and with streaming output back to the browser. The Claude Agent SDK (renamed September 2025 from the Claude Code SDK) is the authoritative answer — it exposes the same agent loop, tools, session management, and filesystem-based context loading that power Claude Code interactively, now fully programmable in Python and TypeScript.

The research spans five technical domains: execution models and SDK architecture, session lifecycle and multi-turn conversation management, context injection from the git repository, streaming output delivery to the browser, and multi-tenant isolation for a SaaS deployment. All findings are grounded in current official documentation (Claude Code Docs, June 2026), verified web sources, and established community patterns from 2025–2026.

**Key finding:** The Agent SDK's `query()` async iterator, combined with Daytona sandbox isolation per conversation, git worktrees for per-session filesystem isolation, and SSE for browser delivery, gives the BMAD platform everything it needs to ship an MVP without building any custom agent infrastructure. The most critical non-obvious risk is `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` — without it, auto-memory loads across tenant sessions regardless of other isolation settings. See the Executive Summary in the Research Synthesis section for a full decision map.

---

<!-- Content will be appended sequentially through research workflow steps -->

## Technical Research Scope Confirmation

**Research Topic:** Programmatic Claude Code / Agent SDK for headless skill execution
**Research Goals:** Understand how to drive Claude Code or the Anthropic Agent SDK from a backend web service to execute BMAD skills server-side, manage session lifecycle, and stream output back to the browser — for a SaaS platform giving non-dev roles access to BMAD

**Technical Research Scope:**

- Architecture Analysis — how Claude Code/Agent SDK is structured for server-side orchestration; subprocess vs API models; session and process lifecycle
- Implementation Approaches — SDK patterns for spawning and managing agent sessions, input/output piping, headless execution from a Node.js/Python backend
- Technology Stack — Claude Code CLI, Anthropic Agent SDK, streaming transports (SSE/WebSocket), backend framework options
- Integration Patterns — how the backend platform calls into the SDK, how git commits surface as events, how output streams back to browser clients
- Context Injection — how to feed repo-sourced context into Claude Code sessions (CLAUDE.md, flags, file injection, MCP, or SDK-level context APIs); what gets read automatically vs what must be explicitly provided

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-06-11

---

## Technology Stack Analysis

### Execution Model: Agent SDK

The Agent SDK is the correct execution model for server-side use.

**Agent SDK (TypeScript)**
The SDK (renamed from Claude Code SDK in September 2025) ships as `claude-agent-sdk` (Python 3.10+) and `@anthropic-ai/claude-agent-sdk` (Node.js 18+). The TypeScript package bundles a native Claude Code binary — no separate install needed. The SDK exposes the same agent loop, tools, and context management as the CLI, but as a native async iterator in-process. This is the recommended path for a web backend that needs structured message objects, hook callbacks, and session lifecycle control.

```typescript
// TypeScript SDK — async iterator streams messages as the agent works
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Run the Create PRD skill for the onboarding project",
  options: {
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob"],
    cwd: "/repos/user-project-clone"
  }
})) {
  // stream message to browser client via SSE
}
```

_Source: [Agent SDK overview — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview), [Run Claude Code programmatically](https://code.claude.com/docs/en/headless)_

---

### Session Lifecycle

Sessions are identified by a `session_id` surfaced in the first `SystemMessage` (type `system`, subtype `init`). The SDK stores session state as JSONL on the local filesystem. Sessions can be resumed across multiple turns — critical for a multi-turn BMAD skill workflow where the PM has a back-and-forth conversation with the agent.

```typescript
let sessionId: string | undefined;

// First turn — capture session ID from init event
for await (const message of query({ prompt: "Let's create a PRD", options })) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
  }
  // stream to client...
}

// Subsequent turns — resume with full context
for await (const message of query({
  prompt: "Focus on the onboarding flow",
  options: { resume: sessionId }
})) {
  // stream to client...
}
```

Hooks are available at key lifecycle points: `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `Stop`. The `PostToolUse` hook on `Bash(git commit *)` is the right place to emit the "artifact committed" event that surfaces as a pill in the UI.

_Source: [Agent SDK overview — Sessions tab](https://code.claude.com/docs/en/agent-sdk/overview)_

---

### Context Injection from Git Repo

This is the most nuanced area. Claude Code has two modes of context loading: automatic (reads from disk at session start) and explicit (flags you pass at invocation time).

**Automatic loading (default mode — not bare)**
Claude Code auto-reads `CLAUDE.md` and `.claude/CLAUDE.md` from the working directory, plus `~/.claude/CLAUDE.md` globally. For the platform, the working directory would be a local clone of the user's repo, so placing project context in `CLAUDE.md` at the repo root means it's always injected automatically. Skills in `.claude/skills/*/SKILL.md` are also loaded — this is exactly how BMAD skills propagate into the session.

**Explicit injection (bare mode — recommended for server-side)**
In bare mode, auto-discovery is skipped. Context must be passed explicitly:

| What to inject | Flag |
|---|---|
| System prompt additions | `--append-system-prompt "..."` or `--append-system-prompt-file ./path` |
| CLAUDE.md contents | Read the file, pass via `--append-system-prompt-file` |
| Settings / tool permissions | `--settings <file-or-json>` |
| MCP servers | `--mcp-config <file-or-json>` |
| Custom agents / skills | `--agents <json>` or `--plugin-dir <path>` |

**SDK-level context control**
The SDK's `settingSources` option (TypeScript) / `setting_sources` (Python) restricts which config sources are loaded, giving the platform fine-grained control over what context enters each session without using bare mode.

**Dynamic context from git**
Claude Code supports dynamic context injection via `!` commands in CLAUDE.md files — e.g., `!git log --oneline -20` is executed at session start and its output injected into context. This means a project's CLAUDE.md can self-populate with current git state (recent commits, branch, diff summary) automatically, without the platform having to pre-process it.

_Source: [Run Claude Code programmatically — Customize the system prompt](https://code.claude.com/docs/en/headless)_

---

### Streaming Output: Agent → Backend → Browser

**Agent → Backend**
The SDK emits a stream of typed message objects via the async iterator. Message types include: `SystemMessage` (init metadata, retry events), `AssistantMessage` (text content, tool use), `ToolResultMessage`, `ResultMessage` (final output). The backend receives these natively in-process — no subprocess piping needed when using the SDK library.

For CLI subprocess mode, stdout is newline-delimited JSON (`--output-format stream-json`). The backend reads lines, parses each as a JSON event, and decides which to forward to the client.

**Backend → Browser**
Server-Sent Events (SSE) is the dominant production pattern for streaming LLM output to a browser. It is unidirectional (server → client), simpler than WebSocket, and natively supported in:
- **Next.js** Route Handlers (streaming response)
- **FastAPI** (`EventSourceResponse` or `StreamingResponse`)
- **Express** (chunked `Transfer-Encoding`)

The browser uses the native `EventSource` API or a library like `@microsoft/fetch-event-source` (supports POST, reconnect logic).

A reverse-engineered WebSocket protocol exists inside the Claude Code CLI (used by the community project `Claude-websocket` on GitHub), but it is undocumented and not a stable foundation for production.

**2026 transport note:** The MCP spec (2025-11-25) standardized Streamable HTTP as the transport for MCP connections, replacing the earlier SSE-based MCP transport. This affects MCP server connections from the agent, not the browser-facing stream. For the browser stream, SSE remains the right choice.

_Source: [Streaming messages — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/streaming), [Server-Sent Events with Claude Code — DEV Community](https://dev.to/myougatheaxo/server-sent-events-with-claude-code-real-time-push-without-websocket-complexity-596l), [FastAPI + Claude API: Production Streaming API](https://jangwook.net/en/blog/en/fastapi-claude-api-streaming-production-guide-2026/), [GitHub — jackneil/Claude-websocket](https://github.com/jackneil/Claude-websocket)_

---

### Integration Patterns

**Git commit as event**
Use a `PostToolUse` hook on `Bash(git commit *)` to detect when a skill commits an artifact. The hook fires after the commit completes. The backend can emit a platform event (SSE message of type `artifact_committed`) to the browser, which triggers the pill UI element.

**Working directory per session**
Each concurrent user session needs an isolated working directory — either a separate clone of the repo, or a git worktree (`git worktree add`). Worktrees are lighter than full clones and share the object store. The platform creates a worktree per session, sets it as `cwd` in the SDK call, and removes it on `SessionEnd`.

**Concurrency model**
The Agent SDK `query()` call is an async generator. In Node.js, each user session maps to one `query()` call running in a separate async context. Python uses `asyncio` with the same pattern. Neither requires threads — the event loop handles multiple concurrent sessions naturally.

**Billing (as of June 15, 2026)**
Agent SDK usage on subscription plans draws from a new monthly Agent SDK credit pool, separate from interactive Claude Code usage. API key authentication (not subscription login) is required for third-party platforms — claude.ai login OAuth is not permitted for products built on the SDK.

_Source: [Agent SDK overview — Hooks tab](https://code.claude.com/docs/en/agent-sdk/overview), [Agent SDK overview — Sessions tab](https://code.claude.com/docs/en/agent-sdk/overview)_

---

## Architectural Patterns and Design

### System Architecture: Three-Tier Model

The platform maps cleanly onto three tiers. Each has distinct responsibilities and scaling characteristics.

```
┌─────────────────────────────────────────────────────┐
│  Browser (React)                                    │
│  · Project map tab + N skill chat tabs              │
│  · EventSource (SSE) per active session             │
│  · Inline pill rendering on artifact_committed      │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/2 + SSE
┌──────────────────────▼──────────────────────────────┐
│  Platform Backend (NestJS / TypeScript)             │
│  · Session management (create / resume / end)       │
│  · Git OAuth + repo clone / worktree lifecycle      │
│  · Daytona sandbox lifecycle manager                │
│  · SSE proxy (AG-UI events from sandbox → browser)  │
└──────────────────────┬──────────────────────────────┘
                       │ Daytona SDK / HTTP
┌──────────────────────▼──────────────────────────────┐
│  Daytona Sandbox (per conversation)                 │
│  · Claude Agent SDK process                         │
│  · cwd = git worktree for this session              │
│  · BMAD skills + CLAUDE.md loaded from worktree     │
│  · Bash, Read, Write, Edit, Glob, Grep tools        │
│  · PostToolUse hook → commit event → AG-UI event    │
│  · JSONL transcripts on sandbox disk                │
└─────────────────────────────────────────────────────┘
```

The backend is not stateless — it holds open Daytona sandbox connections and SSE connections for the duration of each session. This rules out serverless functions (AWS Lambda, Vercel Functions) as the primary agent host. Node.js is the right backend language: superior at holding thousands of concurrent open connections, while the TypeScript Agent SDK is already the native fit.

_Source: [AI-Native SaaS Architecture 2026 — Lushbinary](https://lushbinary.com/blog/ai-native-saas-architecture-patterns-developer-guide/), [The Architecture of a Scalable AI SaaS — DEV Community](https://dev.to/frankdotdev/the-architecture-of-a-scalable-ai-saas-my-2026-blueprint-56cm)_

---

---

### Data Architecture: What Lives Where

The platform has three distinct categories of persistent state with different storage requirements.

| State | Storage | Rationale |
|---|---|---|
| **Session transcripts** | JSONL on Daytona sandbox disk | SDK writes natively; survives NestJS restarts because the sandbox filesystem is independent of the NestJS container |
| **Session metadata** (sessionId → userId, repoUrl, skillName, worktree path) | Postgres | Relational, queried by userId; source of truth for session lookup |
| **Git artifacts** (`_bmad-output/**`) | The git repo itself | Already version-controlled; platform reads via OAuth |
| **Worktree files** (during session) | Daytona sandbox local disk | Ephemeral — removed on `SessionEnd`; only committed artifacts persist |

**No external `SessionStore` needed.** Sessions run inside Daytona sandboxes. The SDK writes JSONL transcripts to the sandbox filesystem (`~/.claude/projects/<encoded-cwd>/*.jsonl`). When NestJS restarts, it reconnects to the existing Daytona sandbox via the Daytona SDK and calls `query({ resume: sessionId })` — the SDK locates the JSONL on the sandbox disk. The `SessionStore` mirror API exists for cases where the agent process runs on ephemeral container storage; that concern does not apply here.

_Source: [Persist sessions to external storage — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/session-storage)

---

### Security Architecture

Four isolation boundaries must be enforced for a multi-tenant platform:

**1. Process isolation** — one subprocess per session, each with its own process tree. Never share a subprocess across tenants.

**2. Filesystem isolation** — per-tenant `cwd` (worktree) + per-tenant `CLAUDE_CONFIG_DIR`. No shared `~/.claude/`. Set `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` to prevent auto-memory cross-contamination.

**3. Network isolation** — route all agent outbound traffic through an egress proxy with per-tenant allowlists. The agent should make calls; the proxy injects credentials and enforces domain restrictions. This prevents a compromised session from reaching another tenant's endpoints.

**4. Credential isolation** — the `ANTHROPIC_API_KEY` is set in the subprocess environment. Do not embed it in the agent's prompt or in CLAUDE.md. Rotate via the secret manager; inject at container start. The platform's OAuth token for git access (GitHub/GitLab) should similarly be injected per-session via the egress proxy pattern, not stored in the worktree.

**Inbound auth pattern:** Authentication belongs at the gateway (API Gateway or reverse proxy), not inside the agent container. The container receives pre-authenticated requests. This keeps auth logic out of the agent process and separates concerns cleanly.

_Source: [Hosting the Agent SDK — Multi-tenant isolation](https://code.claude.com/docs/en/agent-sdk/hosting), [Securely deploying AI agents — Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/secure-deployment)_

---

### Scaling Architecture

**Vertical (per host):**
```
agents per host = (host RAM − overhead) / per-session RAM ceiling
```
Baseline: 1 GiB RAM per session. A 16 GiB host with 2 GiB overhead can run ~14 concurrent sessions. Measure actual peak RSS under representative load before finalizing sizing.

**Horizontal (across hosts):**
- Load balancer with sticky sessions (consistent hash on `sessionId`)
- Each host in the pool handles a fixed maximum of concurrent sessions
- New sessions are routed to the least-loaded host; subsequent turns (and the SSE connection) are pinned
- Scale out: add hosts to the pool; sessions auto-distribute via consistent hashing

**Session lifecycle limits (prevent runaway sessions):**
- Set `maxTurns` in `ClaudeAgentOptions` to bound tool-use round trips (prevents infinite loops)
- The SDK has no wall-clock timeout — implement one at the platform layer; kill and emit error event if a session exceeds N minutes

**Known concurrency limit:** Large parallel subagent fanouts from a single session can hit API rate limits. BMAD skills are sequential by design, so this is low-risk, but monitor if skills start spawning subagents.

**HTTP/2 requirement for browser:** With tab-per-session UI, users with multiple concurrent skill sessions will exhaust HTTP/1.1's 6-connection-per-origin limit. HTTP/2 must be enabled at the load balancer for the SSE endpoint — it multiplexes all session streams over a single socket.

_Source: [Hosting the Agent SDK — Scaling and concurrency](https://code.claude.com/docs/en/agent-sdk/hosting), [Node.js SSE 2026 — HireNodeJS](https://www.hirenodejs.com/blog/nodejs-server-sent-events-sse-2026)_

---

## Implementation Approaches

### Development Workflow

**Local development** uses the Agent SDK directly against the Anthropic API. The TypeScript SDK bundles the Claude Code binary — no separate install. Set `ANTHROPIC_API_KEY` and call `query()`.

**Recommended local dev stack:**
- Node.js 20 LTS + TypeScript
- `@anthropic-ai/claude-agent-sdk` (latest)
- A real git repo with BMAD initialized as the test `cwd`
- JSONL transcripts land on the Daytona sandbox disk automatically — no external session store needed

**Iteration loop:** BMAD skills are markdown files. Editing a skill and restarting the agent process picks up the change instantly — no build step, no recompile. This makes skill development very fast. The platform backend only changes when the wiring changes (new hook, new session event type); skill logic lives entirely in the repo.

---

### Testing Approaches

**Unit / integration testing for session resume:**
No external `SessionStore` adapter to test. The SDK's native JSONL storage on the Daytona sandbox disk handles transcript persistence. Integration tests for session resume should verify that a `query({ resume: sessionId })` call on the same sandbox restores conversation context correctly — no conformance suite needed.

**Testing agent behavior (skill outputs):**
Use [Promptfoo](https://www.promptfoo.dev/docs/providers/claude-agent-sdk/) — it has a native Claude Agent SDK provider. Write test cases as YAML: input prompt → expected output pattern. Run against real skills before shipping. This is the closest thing to a functional test for a BMAD skill.

**Testing the SSE stream:**
Collect all messages from the async iterator and assert on message types and order rather than on exact content. Assert that a `ResultMessage` with `subtype: "success"` appears.

**What not to test:**
Don't mock the `query()` call itself in integration tests — the agent's behavior depends on the actual model, and mocked responses diverge from real behavior. Test the wiring (session lifecycle, SSE emit, hook firing) with real SDK calls against a test repo.

_Source: [Claude Agent SDK — Promptfoo](https://www.promptfoo.dev/docs/providers/claude-agent-sdk/)_

---

### Observability

The Agent SDK inherits Claude Code's built-in OpenTelemetry instrumentation. Set four environment variables at the container level and every `query()` call exports spans, metrics, and log events to your collector:

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1
CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1      # required for traces
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector.internal:4318
```

**What you get out of the box:**
- Spans around each model request and tool execution
- Token counters and cost per session
- Tool call decisions (which tools fired and in what order)
- Retry events (`api_retry` system messages)
- Error events

**Per-session cost tracking:** `ResultMessage` includes `total_cost_usd` and a per-model cost breakdown. Read it directly from the stream for real-time spend tracking without needing an OTEL pipeline. Surface this to an internal dashboard keyed by `userId` + `sessionId`.

**Compatible backends:** Honeycomb, Datadog, Grafana/Tempo, SigNoz, Langfuse. Prompt text and tool inputs are not exported by default — opt in via `CLAUDE_CODE_OTEL_INCLUDE_PROMPTS=1` if audit logging is required.

_Source: [Observability with OpenTelemetry — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/observability), [Claude Code + OpenTelemetry: Per-Session Cost — Bindplane](https://bindplane.com/blog/claude-code-opentelemetry-per-session-cost-and-token-tracking)_

---

### Risk Assessment and Mitigation

| Risk | Severity | Mitigation |
|---|---|---|
| **No wall-clock session timeout** | High | Implement platform-layer watchdog; kill subprocess after N minutes of no `ResultMessage` |
| **Memory growth in long sessions** | Medium | Cap `maxTurns` in `ClaudeAgentOptions`; recycle subprocesses after session ends |
| **Auto-memory cross-tenant leakage** | Critical | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in all session environments — non-negotiable |
| **`cwd` mismatch breaks session resume** | High | Store absolute `cwd` path in session metadata DB; reconstruct worktree at exact same path on resume |
| **Worktree collision on concurrent commits** | Low (main-branch-only) | Serialize git commits per repo via a per-repo lock or commit queue |
| **SSE connection limit (HTTP/1.1)** | High | Require HTTP/2 at load balancer on the SSE endpoint |
| **Agent SDK billing credit exhaustion** | Medium | Monitor per-session `total_cost_usd` from `ResultMessage`; set per-user monthly budget alerts |

---

## Technical Research Recommendations

### Implementation Roadmap

**Sprint 1 — Foundation (2–3 weeks)**
1. Set up TypeScript backend with `@anthropic-ai/claude-agent-sdk`
2. Implement `query()` wrapper with multi-tenant isolation options (`cwd`, `settingSources: []`, `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY`)
3. Git worktree lifecycle: create on session start, remove on session end
4. Basic SSE endpoint (Express or Fastify), HTTP/2 at reverse proxy

**Sprint 2 — Core Flow (2–3 weeks)**
1. Session metadata in Postgres (userId → sessionId → worktree path)
2. `PostToolUse` hook on `Bash(git commit *)` → SSE `artifact_committed` event
3. Context injection: CLAUDE.md + skill file via `appendSystemPromptFile`
4. Session resume via stored `sessionId` (SDK locates JSONL on Daytona sandbox disk automatically)
5. OTEL telemetry pipeline + per-session cost tracking

**Sprint 3 — Hardening (1–2 weeks)**
1. Platform-layer session watchdog (wall-clock timeout)
2. `maxTurns` cap on all sessions
3. HTTP/2 load balancer configuration
4. Egress proxy with per-tenant allowlists

### Technology Stack Recommendation

| Layer | Choice | Rationale |
|---|---|---|
| Backend runtime | Node.js 20 LTS + TypeScript | Native Agent SDK; superior at concurrent SSE + stdio |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` latest | Bundles CLI; TypeScript-native; authoritative sessions API |
| Session store | JSONL on Daytona sandbox disk (SDK native) | No external store needed; sandbox filesystem independent of NestJS container |
| Session metadata | Postgres | Relational, queryable, easy audit |
| Git isolation | `git worktree` | Lighter than clones; shares object store |
| Sandbox hosting | Daytona Cloud | Official Claude Agent SDK guide; TypeScript SDK; ~90 ms warm start |
| Observability | OTEL → SigNoz or Grafana | First-class Claude Code support; open-source collector |
| Browser streaming | SSE via EventSource + HTTP/2 | Dominant standard; native reconnect; CDN-compatible |

---

## Integration Patterns Analysis

### Platform Backend → Agent SDK: Session Model

Every `query()` call spawns a `claude` CLI process inside a Daytona sandbox. One conversation = one sandbox. The sandbox owns: a shell, a working directory, and JSONL transcript files on its local disk. This is not a stateless API call — it is a long-lived process that the NestJS backend manages via the Daytona SDK.

**Resource baseline per session:** 1 GiB RAM, 5 GiB disk, 1 CPU. Memory grows with session length and tool activity. Formula for concurrent sessions:

```
agents per host = (host RAM - overhead) / per-session RAM ceiling
```

Measure the per-session ceiling under representative load before sizing.

**Session lifecycle pattern:**
NestJS creates or reconnects a Daytona sandbox by `threadId`. The SDK process runs inside the sandbox and emits events back to NestJS, which proxies them as SSE to the browser.

```typescript
// TypeScript — session resume by ID (JSONL on sandbox disk, no external store)
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: userInput,
  options: {
    resume: sessionId,          // looked up from DB by userId + skillName
    cwd: tenantWorkingDir,      // per-session git worktree path inside sandbox
    settingSources: [],         // no filesystem config leaks between tenants
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: tenantConfigDir,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    },
  },
})) {
  // forward to browser via SSE
}
```

Session transcripts are stored at `~/.claude/projects/<encoded-cwd>/*.jsonl` on the sandbox disk. The `cwd` is encoded as the absolute path with every non-alphanumeric character replaced by `-`. **Critical:** a `resume` call from a different `cwd` will silently create a fresh session instead of restoring history — the working directory must be stable and consistent across turns.

_Source: [Hosting the Agent SDK — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/hosting), [Work with sessions — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/sessions)_

---

### Git Worktree Isolation: One Session, One Worktree

Git worktrees are the standard isolation primitive for concurrent AI agent sessions in 2026. A worktree gives each agent session a dedicated working directory that shares the `.git` object store with the main clone — lighter than a full re-clone, with no duplication of git objects.

**Why worktrees over full clones for this platform:**
- Platform operates on `main` branch only (established brainstorming constraint)
- Multiple PMs could run concurrent sessions on the same project
- Worktrees share object store → no duplication of repo history
- Each worktree is a real directory the agent's `cwd` points to
- Cleanup is a single `git worktree remove` call on `SessionEnd`

**Worktree lifecycle per session:**

```bash
# Session start: create isolated working directory
git worktree add /work/sessions/<sessionId> main

# Agent runs with cwd=/work/sessions/<sessionId>
# All reads/writes are isolated to this directory

# Session end hook: clean up
git worktree remove /work/sessions/<sessionId> --force
```

Claude Code natively supports the `--worktree` flag, which automates this and places worktrees in `.claude/worktrees/`. For a platform-managed flow, creating worktrees explicitly gives the platform more control over naming, lifecycle, and cleanup.

**Conflict consideration (main-branch-only constraint):** Since the platform writes only to main and BMAD skills commit artifacts to `_bmad-output/`, the primary risk is two sessions committing to the same artifact path simultaneously. Mitigation: serialize commits via a lightweight queue per repo, or accept last-write-wins (consistent with the brainstorming session's "silent artifact loss on failure" constraint).

_Source: [How to Use Git Worktrees for Parallel AI Agent Execution — Augment Code](https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution), [Git Worktree Isolation Patterns — Zylos Research](https://zylos.ai/research/2026-02-22-git-worktree-parallel-ai-development/), [Run multiple coding agents safely with git worktrees — Google Cloud Community](https://medium.com/google-cloud/run-multiple-coding-agents-safely-with-git-worktrees-c2d237dbd6b2)_

---

### Multi-Tenant Session Isolation

Default Agent SDK behavior reads settings and CLAUDE.md memory files from the shared filesystem. In a multi-tenant platform, this creates cross-tenant context leakage. Four SDK-level options eliminate this:

| Option | Purpose |
|---|---|
| `cwd: tenantDir` | Scopes file access and session JSONL storage to a per-tenant directory |
| `settingSources: []` | Prevents loading of any `.claude/` filesystem settings |
| `CLAUDE_CONFIG_DIR=tenantConfigDir` | Isolates `~/.claude.json` global config per tenant |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` | Disables auto-memory which loads into system prompt regardless of `settingSources` |

The `CLAUDE_CODE_DISABLE_AUTO_MEMORY` env var is critical and easy to miss — auto-memory at `~/.claude/projects/<project>/memory/` loads unconditionally even when `settingSources: []` is set.

Additional network isolation: route each tenant's outbound calls through an egress proxy with per-tenant allowlists. This prevents a compromised tenant from exfiltrating data via another tenant's outbound policy.

_Source: [Hosting the Agent SDK — Multi-tenant isolation](https://code.claude.com/docs/en/agent-sdk/hosting)_

---

### SSE Streaming: Agent → Backend → Browser

**Agent → Backend (in-process, SDK)**
The SDK async iterator delivers typed message objects as the agent works: `SystemMessage` (init, api_retry), `AssistantMessage` (text + tool calls), `ToolResultMessage`, `ResultMessage` (terminal). No subprocess piping, no line parsing — messages arrive natively.

**Backend → Browser (SSE)**
SSE is the production standard for streaming LLM output to a browser in 2026. The pattern: one HTTP connection per active session, kept open, with the backend pushing `data:` events as the SDK emits messages.

```typescript
// Express SSE route handler — simplified
app.get("/sessions/:id/stream", async (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",     // critical: disables nginx proxy buffering
    "Connection": "keep-alive",
  });

  for await (const message of query({
    prompt: req.query.prompt as string,
    options: { resume: req.params.id, ...tenantOptions }
  })) {
    res.write(`data: ${JSON.stringify(message)}\n\n`);
  }

  res.end();
});
```

**Production gotchas:**
- **Proxy buffering:** nginx and most reverse proxies buffer responses. `X-Accel-Buffering: no` is required on the SSE route, or tokens arrive in batches instead of streaming.
- **Browser connection limits:** HTTP/1.1 caps at 6 concurrent connections per origin. With tab-per-session UI, a user with >6 active skill tabs will have the 7th hang. Solve with HTTP/2 (multiplexes hundreds of streams over one socket) — set up TLS and HTTP/2 on the load balancer.
- **Backpressure:** if a client is slow to read, `res.write()` returns false. Accumulating kernel buffer leads to socket kill under load. Honor the return value; pause the producer on `false` and resume on the `drain` event.
- **Next.js App Router:** uses Web Standard `ReadableStream` / `TransformStream` APIs rather than `res.write()`. Pattern differs from Express but SSE semantics are the same.

_Source: [Node.js Server-Sent Events (SSE) in 2026 — HireNodeJS](https://www.hirenodejs.com/blog/nodejs-server-sent-events-sse-2026), [Streaming LLM responses in Next.js — Eaures](https://www.eaures.online/streaming-llm-responses-in-next-js), [Server-Sent Events with Claude Code — DEV Community](https://dev.to/myougatheaxo/server-sent-events-with-claude-code-real-time-push-without-websocket-complexity-596l)_

---

### Context Injection from the Git Repo

The BMAD platform's core value is running skills within the context of a real project. Context flows into the agent through two mechanisms that should be combined:

**1. Automatic CLAUDE.md loading (via `cwd`)**
When the session's `cwd` is set to the worktree path, the agent auto-loads `CLAUDE.md` from that directory and `.claude/skills/*/SKILL.md`. Since BMAD requires `_bmad` to be initialized in the repo (developer-only constraint), the BMAD skills and CLAUDE.md are already present in every valid project repo. No platform-side work needed — just point `cwd` at the worktree.

In bare mode (`--bare` or `settingSources: []`), this auto-loading is suppressed. For the platform, the recommended approach is to use **explicit context injection** (safer for multi-tenant) rather than relying on auto-load.

**2. Explicit context injection via `--append-system-prompt-file`**
The platform reads key context files from the repo and passes them explicitly:

| Source | What to inject | Mechanism |
|---|---|---|
| `CLAUDE.md` at repo root | Project conventions and context | `--append-system-prompt-file` |
| `.claude/skills/<skill>/SKILL.md` | The specific skill being invoked | `--append-system-prompt-file` or include in prompt |
| `_bmad-output/planning-artifacts/**` | Existing artifacts (PRD, architecture, etc.) | Agent reads via `Read` tool after context established |
| `git log --oneline -20` | Recent commit history | Inject via `--append-system-prompt` after running git command |

**Dynamic context from git (CLAUDE.md `!` commands):**
CLAUDE.md supports `!command` directives that run at session start and inject their output. Example in `CLAUDE.md`:

```markdown
## Recent git activity
!`git log --oneline -10`

## Current branch
!`git branch --show-current`
```

These run automatically when the agent starts, injecting live repo state without the platform having to pre-process it. This is the cleanest approach for git context — let the repo's own CLAUDE.md carry the dynamic injection logic.

**Recommended injection strategy for the platform (bare mode):**
1. Clone/worktree the repo to `tenantDir`
2. Read `CLAUDE.md` and the target skill's `SKILL.md` from disk
3. Pass both via `append_system_prompt_file` (or concatenate and pass as `append_system_prompt`)
4. Set `cwd=tenantDir` so `Read`, `Glob`, `Grep` tools operate on the actual repo files
5. Let the agent use `Bash(git log *)` for any runtime git context it needs

_Source: [Run Claude Code programmatically — Customize the system prompt](https://code.claude.com/docs/en/headless)_

---

### Commit Event → Pill UI: Hook Integration

The "artifact committed" pill is the platform's key feedback signal to the PM. The integration point is the `PostToolUse` hook on `Bash(git commit *)`:

```typescript
import { query, HookCallback } from "@anthropic-ai/claude-agent-sdk";

const onCommit: HookCallback = async (input) => {
  const command = (input as any).tool_input?.command ?? "";
  if (command.startsWith("git commit")) {
    // emit SSE event to the browser client for this session
    sseEmitter.emit(sessionId, {
      type: "artifact_committed",
      command,
      timestamp: new Date().toISOString(),
    });
  }
  return {};
};

for await (const message of query({
  prompt,
  options: {
    hooks: {
      PostToolUse: [{ matcher: "Bash", hooks: [onCommit] }]
    }
  }
})) {
  // ...
}
```

The SSE emitter pushes a typed event to the browser. The frontend receives it, parses the committed artifact path from the git command output, and renders the pill inline in the chat stream. This completes the loop without any polling or separate webhook infrastructure.

_Source: [Agent SDK overview — Hooks tab](https://code.claude.com/docs/en/agent-sdk/overview)_

---

## Research Synthesis

### Table of Contents

1. [Technical Research Scope Confirmation](#technical-research-scope-confirmation)
2. [Technology Stack Analysis](#technology-stack-analysis) — Execution models, SDK APIs, session lifecycle, streaming
3. [Architectural Patterns and Design](#architectural-patterns-and-design) — Three-tier architecture, data architecture, security, scaling
4. [Implementation Approaches and Technology Adoption](#implementation-approaches-and-technology-adoption) — Dev workflow, testing, observability, risk
5. [Technical Research Recommendations](#technical-research-recommendations) — Sprint roadmap, technology stack decision map
6. [Integration Patterns Analysis](#integration-patterns-analysis) — Subprocess model, git worktrees, multi-tenant isolation, SSE wiring, context injection, commit hook

---

### Executive Summary

The Claude Agent SDK (TypeScript package `@anthropic-ai/claude-agent-sdk`, Node.js 18+) is the correct foundation for the BMAD web platform. It exposes the full Claude Code agent loop — tools, session management, context loading, hooks — as a native async iterator callable from a Node.js web backend. The TypeScript SDK bundles the Claude Code binary; no separate install.

**The three core questions this research answers:**

**1. How do you run BMAD skills server-side?**
Call `query()` with the skill prompt, `allowedTools`, and `cwd` pointing to a git worktree of the user's repo inside a Daytona sandbox. The agent reads BMAD skills from `.claude/skills/` and CLAUDE.md from the worktree automatically (or inject explicitly in bare mode). Each `query()` call is an async iterator that streams typed message objects. One conversation = one Daytona sandbox with one agent process and its own working directory.

**2. How do you manage session lifecycle for a multi-turn chat?**
Capture the `session_id` from the first `ResultMessage`. Store it in Postgres keyed by `userId + skillName`. On each subsequent PM turn, call `query()` with `options: { resume: sessionId }`. The SDK finds the JSONL transcript on the Daytona sandbox disk automatically. The `cwd` must be the same absolute path on resume — use a stable git worktree path inside the sandbox.

**3. How do you stream output to the browser?**
Proxy the SDK's async iterator to an SSE response. Each `data:` event is a JSON-serialized SDK message. Requires HTTP/2 at the load balancer (tab-per-session UI will hit HTTP/1.1's 6-connection limit otherwise). Use a `PostToolUse` hook on `Bash(git commit *)` to emit a typed `artifact_committed` SSE event that renders the pill UI.

**Key Technical Findings:**

- The Agent SDK running inside a Daytona sandbox (not on the NestJS host) is the isolation model — direct repo access, no file sync overhead, microVM-grade isolation per conversation
- Git worktrees are the isolation primitive: one per active session, created on `SessionStart`, removed on `SessionEnd`, lighter than full clones
- `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` is a non-negotiable multi-tenant isolation requirement — auto-memory loads unconditionally even when `settingSources: []` is set
- JSONL transcripts on the Daytona sandbox disk are the session store — no external adapter needed
- Token cost is typically 1–2 orders of magnitude larger than container infra cost; plan budget alerting from day one via `ResultMessage.total_cost_usd`
- The Agent SDK billing model changed June 15, 2026: SDK usage on subscription plans draws from a new monthly Agent SDK credit pool; API key auth is required (not subscription login)

**Technical Recommendations (priority order):**

1. Use `@anthropic-ai/claude-agent-sdk` (TypeScript) on Node.js 20 LTS as the backend
2. Run the Agent SDK inside a Daytona Cloud sandbox per conversation — not on the NestJS host
3. Git worktrees for session filesystem isolation (`cwd` per session, inside the sandbox)
4. `settingSources: []` + `CLAUDE_CONFIG_DIR` + `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` on every session — all four, not three
5. HTTP/2 at the load balancer on the SSE endpoint — not optional for the tab-per-session UI model
6. `PostToolUse` hook on `Bash(git commit *)` for the artifact-committed pill

---

### Source Index

| Source | Used in |
|---|---|
| [Agent SDK overview — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview) | Technology Stack, Integration Patterns |
| [Run Claude Code programmatically — Claude Code Docs](https://code.claude.com/docs/en/headless) | Technology Stack, Context Injection |
| [Hosting the Agent SDK — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/hosting) | Architecture, Integration Patterns |
| [Work with sessions — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/sessions) | Integration Patterns |
| [Observability with OpenTelemetry — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/observability) | Implementation |
| [Git Worktrees for AI Coding — Augment Code](https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution) | Integration Patterns |
| [Node.js SSE 2026 — HireNodeJS](https://www.hirenodejs.com/blog/nodejs-server-sent-events-sse-2026) | Architecture, Integration Patterns |
| [Claude Agent SDK — Promptfoo](https://www.promptfoo.dev/docs/providers/claude-agent-sdk/) | Implementation |
| [Claude Code + OpenTelemetry: Per-Session Cost — Bindplane](https://bindplane.com/blog/claude-code-opentelemetry-per-session-cost-and-token-tracking) | Implementation |

---

**Research Completion Date:** 2026-06-11
**Research Period:** Current — all sources verified June 2026
**Confidence Level:** High — based on official Anthropic documentation and verified current sources
**Agent SDK version referenced:** `@anthropic-ai/claude-agent-sdk` latest (June 2026); billing changes effective June 15, 2026
