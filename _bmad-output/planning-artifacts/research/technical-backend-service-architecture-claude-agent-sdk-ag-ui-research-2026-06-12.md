---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'Backend service architecture for Claude Agent SDK + AG-UI harness'
research_goals: 'Determine the optimal backend architecture for a hybrid Next.js 15 app that uses serverless functions for traditional requests and a long-running containerized service (possibly NestJS) for Claude Agent SDK streaming sessions emitting AG-UI events — covering deployment topology, ClaudeAgentSdkHarness design, session lifecycle, and BMAD skill invocation'
user_name: 'Marius'
date: '2026-06-12'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-06-12
**Author:** Marius
**Research Type:** technical

---

## Research Overview

This report answers one question: **what backend architecture should power a web app that makes Claude Agent SDK (BMAD) sessions accessible to non-developer roles via a browser?**

The research covers three areas confirmed with the user: deployment topology (serverless vs containerised), integration patterns (AG-UI protocol contract, NestJS endpoint design, in-sandbox event channel, auth handoff, session lifecycle), and performance considerations (sandbox cold-start budget, SSE connection management, prompt caching, concurrency limits).

The central finding is that a **hybrid architecture** is mandatory — Next.js serverless functions cannot hold a live SSE connection for the duration of a BMAD session (Vercel's 300s hard cap on Hobby, fragile 1800s beta on Pro). A containerised NestJS backend running on Fly.io or Railway handles all Claude Agent SDK sessions. Critically, tool execution (Bash, git, npm) must be isolated in a **Daytona sandbox** per conversation — running tools on the NestJS host would give every user arbitrary shell access to a shared server. The recommended isolation pattern (Pattern A) runs the entire Claude Agent SDK inside the sandbox; a `sandbox-agent` binary exposes an HTTP/SSE endpoint from which NestJS proxies AG-UI events to the browser.

See the Research Synthesis section for executive summary, full architecture decisions, implementation roadmap, and risk assessment.

---

<!-- Content will be appended sequentially through research workflow steps -->

## Technical Research Scope Confirmation

**Research Topic:** Backend service architecture for Claude Agent SDK + AG-UI harness
**Research Goals:** Determine the optimal backend architecture for a hybrid Next.js 15 app that uses serverless functions for traditional requests and a long-running containerized service for Claude Agent SDK streaming sessions emitting AG-UI events — covering deployment topology, ClaudeAgentSdkHarness design, session lifecycle, and BMAD skill invocation

**Technical Research Scope:**

- Architecture Analysis — hybrid serverless + containerized backend topologies; deployment topology options; where the execution boundary sits; backend framework selection based on evidence, not assumption
- Integration Patterns — how the Next.js frontend connects to the agent backend; session routing; how BMAD skills are invoked as Claude Agent SDK runs from a web request; AG-UI HttpAgent connection lifecycle
- Performance Considerations — SSE connection durability in serverless vs container; long-running session handling; memory-bound vs persisted session state

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-06-12

---

## Architecture Analysis

### The Serverless SSE Constraint

The central architectural question for this project is whether Next.js Route Handlers (serverless) can hold a live SSE connection for the duration of a Claude Agent SDK session — or whether a separate persistent process is required.

**Vercel execution time limits (current as of June 2026):**

| Plan | Default | Configurable max | Extended max (beta) |
|---|---|---|---|
| Hobby | 300 s | 300 s (hard cap) | — |
| Pro | 300 s | 800 s | 1800 s (30 min) |
| Enterprise | 300 s | 800 s | 1800 s (30 min) |

For streaming responses, Vercel's documentation is explicit: the limit includes "time spent processing the request and sending the response, **including streamed responses**." A `504 FUNCTION_INVOCATION_TIMEOUT` terminates the connection if the limit is exceeded.

**Edge Runtime is worse:** must begin sending within 25 seconds; total duration capped at 300 s. No extended cap available.

**What this means for BMAD sessions:** A BMAD skill session running the Claude Agent SDK can easily exceed 5 minutes — especially for research, architecture, or multi-step coding tasks. On Hobby, this is a hard wall. On Pro/Enterprise with the 30-minute extended beta, it is technically possible but: the beta is opt-in per route (`export const maxDuration = 1800`), limited to specific Node runtimes (`nodejs20.x`/`nodejs22.x`/`nodejs24.x`), and a single long-held serverless invocation with no pause/resume semantics. This is fragile for agent workloads.

Community consensus (Vercel Community threads, GitHub discussions #48427, #69800) is consistent: serverless functions are the wrong primitive for long-running agent work. The documented solutions are either reconnection-based workarounds or architectural separation.

_Sources: [Vercel Functions Duration Docs](https://vercel.com/docs/functions/configuring-functions/duration), [Vercel Functions Limitations](https://vercel.com/docs/functions/limitations), [How to solve Next.js timeouts — Inngest](https://www.inngest.com/blog/how-to-solve-nextjs-timeouts), [SSE in Next.js API routes — Vercel Community](https://community.vercel.com/t/can-sse-be-implemented-with-only-next-js-api-routes/11063)_

---

### The Hybrid Architecture Topology

The recommended pattern in 2025–2026 production deployments for AI agent workloads is:

```
Browser
  │
  ├──── Next.js (Vercel or containerized)
  │       ├── App Router / RSC / pages
  │       ├── Authentication (NextAuth / Clerk)
  │       ├── Short-lived REST APIs (user data, config, CRUD)
  │       └── Issues short-lived session tokens for agent backend auth
  │
  └──── Agent Backend (containerized, persistent)
          ├── Long-running Claude Agent SDK sessions
          ├── AG-UI SSE endpoint: POST /agent
          ├── In-memory session registry (Map<threadId, ClaudeSession>)
          └── Deployed on: Fly.io, Railway, Cloud Run, or self-hosted VPS
```

**The execution boundary:** Next.js handles everything that completes quickly (UI, auth, user data). The agent backend handles everything that may run for minutes — it is a persistent process with no execution time limit.

**Two sub-variants for the SSE connection:**

**Variant A — Browser connects directly to agent backend (recommended):**
Next.js issues a short-lived signed token (JWT, 60–120 s TTL) authorising one session. The browser opens the SSE connection directly to `https://agent-backend.domain/agent` with that token. No Vercel timeout involved. No proxy overhead. The agent backend validates the token and initiates the Claude Agent SDK session.

**Variant B — Next.js as SSE proxy:**
The browser connects to a Next.js Route Handler which proxies the SSE stream from the agent backend. Keeps all browser traffic through one origin (no CORS). However, the Next.js route handler must stay within its `maxDuration` budget for the full agent run — making this sub-variant only viable for shorter sessions or when the backend completes within Vercel's limits. Generally avoided for extended agent sessions.

**Variant A is strongly preferred** for this project given that BMAD sessions can run 10–30+ minutes.

**Platforms for the containerized backend:**
- **Fly.io** — persistent process, no execution timeout, global edge deployment, first-class Docker support, WebSockets and SSE work reliably
- **Railway** — simplest Docker deploy, managed database add-ons, good for rapid iteration
- **Google Cloud Run** — scales to zero between sessions, min-instances=1 keeps it warm; strong for variable load
- **Self-hosted VPS** — removes all platform constraints; single Node.js process, in-memory session state, no external deps

_Sources: [Long-running requests with SSE and Next.js — Medium](https://medium.com/@ruslanfg/long-running-nextjs-requests-eff158e75c1d), [BFF Pattern with Next.js — Medium](https://medium.com/digigeek/bff-backend-for-frontend-pattern-with-next-js-api-routes-secure-and-scalable-architecture-d6e088a39855), [Next.js Backend for Conversational AI in 2026 — Sashido](https://www.sashido.io/en/blog/nextjs-backend-conversational-ai-2026)_

---

### Backend Framework Selection

Four Node.js frameworks were evaluated against the specific requirements: AG-UI SSE streaming, concurrent Claude Agent SDK sessions, Docker containerisation, TypeScript-first design.

| Factor | NestJS | Express | Fastify | Hono |
|---|---|---|---|---|
| Native SSE support | `@Sse()` decorator (RxJS `Observable`) | Manual `res.write()` | `@fastify/sse` plugin (async generators) | Built-in `streamSSE()` |
| AG-UI integration example | **Yes** — CometChat NestJS docs | CometChat Express docs | No | No |
| Session management structure | Strong (DI, scoped providers, modules) | DIY | Plugin-based | DIY |
| Claude SDK stream fit | Good (async gen inside Observable) | Best documented (official Anthropic examples) | Good (async generator) | Good but newer |
| Raw streaming throughput | Lowest (~10% below Express, RxJS overhead) | Medium | High (2–3× Express on serialization) | Highest (78k req/s on Node 22) |
| Long-running session safety | Good with care (lifecycle must be managed) | Good | Good | Less proven |
| Production AI agent track record | Strong (LangGraph+NestJS pattern established) | Strong | Medium | Emerging |
| TypeScript ergonomics | Strong | Moderate | Strong | Strongest |

**NestJS is the recommended framework.** Rationale:

1. **AG-UI integration exists:** CometChat has a documented NestJS + AG-UI implementation using `EventEncoder` from `@ag-ui/core`. No equivalent published example for Fastify or Hono.
2. **Session management:** NestJS's DI container and scoped providers map cleanly onto the concurrent-session problem — one service instance per `threadId`, injected lifecycle-aware dependencies. Replicating this in Express or Hono requires building a session registry manually.
3. **SSE lifecycle safety:** The `@Sse()` decorator's `Observable` teardown (`finalize()` on unsubscribe) automatically fires cleanup logic when a client disconnects — preventing orphaned Claude Agent SDK sessions. This is a non-trivial problem to solve correctly in raw Express.
4. **The RxJS overhead is not a practical concern** at AG-UI event frequencies. AG-UI events are lifecycle markers and message chunks — not sub-millisecond ticks. The NestJS overhead matters for micro-benchmark JSON throughput, not for this workload.

**Caveat on `@Sse()` decorator:** GitHub issue #12670 in the NestJS repo flags implementation issues. For production use, the recommended pattern is to use an async generator inside the Observable rather than a `Subject.next()` per token, avoiding the buffering and memory-leak pitfalls:

```ts
@Sse('stream/:sessionId')
stream(@Param('sessionId') sessionId: string): Observable<MessageEvent> {
  return new Observable(subscriber => {
    const session = this.agentService.getOrCreate(sessionId);
    session.on('ag-ui-event', (event) => subscriber.next({ data: event }));
    return () => this.agentService.cleanup(sessionId); // fires on disconnect
  });
}
```

**Fastify is the best alternative** if a lighter framework is preferred. `@fastify/sse` accepts async generators natively — which compose directly with the Claude SDK's async-iterable stream API — and delivers significantly higher throughput with no RxJS dependency.

_Sources: [AG-UI NestJS Implementation — CometChat](https://www.cometchat.com/docs/ai-agents/cometchat-ag-ui-nestjs), [NestJS SSE Official Docs](https://docs.nestjs.com/techniques/server-sent-events), [NestJS SSE Issue #12670](https://github.com/nestjs/nest/issues/12670), [NestJS vs Fastify vs Hono 2026 — Encore](https://encore.dev/articles/nestjs-vs-fastify-vs-hono), [Streaming in NestJS — Medium](https://medium.com/@hadiyolworld007/streaming-in-nestjs-from-bottlenecked-buffers-to-blazing-performance-230a46810e26)_

---

### Architecture Decision

**Recommended stack:**

| Layer | Technology | Justification |
|---|---|---|
| Frontend + BFF | Next.js 15 (App Router) on Vercel | UI, auth, short APIs, token issuance |
| Agent backend | **NestJS** in a Docker container | SSE streaming, Claude Agent SDK sessions, AG-UI harness |
| SSE connection | Browser → Agent backend (Variant A) | Bypasses Vercel timeout entirely |
| Container platform | Fly.io or Railway (evaluate) | Persistent process, no execution limits, simple deploy |

Next.js Route Handlers handle authentication and issue a short-lived JWT. The browser uses that JWT to open a POST connection directly to the NestJS `/agent` endpoint, which streams AG-UI events for the duration of the BMAD session.

---

## Tool Execution Isolation

### Why Isolation Is Mandatory

When a user sends a message to the BMAD agent, Claude Agent SDK executes tools — `Bash`, `Read`, `Write`, `Edit`, `git`, `npm` — on behalf of the user. If these tools execute on the NestJS container host, any user's agent session gains arbitrary shell access to the shared server process, its filesystem, environment variables (including the `ANTHROPIC_API_KEY`), and network. This is not a theoretical risk: BMAD skills routinely run `npm install`, execute scripts, and write files — all attacker-controllable.

The 2025–2026 security consensus is that **standard Docker containers alone are not sufficient isolation** for running LLM-generated commands in multi-tenant environments. A shared-kernel container is one kernel CVE away from host root. microVM-level isolation (Firecracker or Kata Containers) is the appropriate production baseline for a public BMAD web app.

**For the full isolation technology hierarchy, platform comparison (E2B, Daytona, Fly.io Sprites, Docker), security hardening checklist, and decision matrix by scenario**, see the companion research report: [technical-docker-per-session-daytona-ai-agent-isolation-research-2026-06-12.md](technical-docker-per-session-daytona-ai-agent-isolation-research-2026-06-12.md).

**Adopted decision (Pattern A — Entire SDK inside the sandbox):** The Claude Agent SDK process runs inside a Daytona sandbox per conversation. NestJS only manages sandbox lifecycle and proxies the AG-UI event stream — it never executes tool payloads locally. Daytona Cloud is the selected platform (~90 ms warm start, official TypeScript SDK, official Claude Agent SDK guide). The `sandbox-agent` binary (rivet-dev) running inside the sandbox handles event emission back to NestJS.

The final NestJS architecture with isolation:

```
NestJS container (agent orchestrator)
  ├── Receives POST /agent (AG-UI RunAgentInput from browser)
  ├── Creates or reconnects Daytona sandbox (by threadId)
  ├── Spawns Claude Agent SDK process inside sandbox
  ├── Sandbox emits AG-UI events → NestJS proxies → SSE → browser
  └── Destroys sandbox on RUN_FINISHED or session timeout
```

_Sources: [E2B Claude Managed Agents](https://e2b.dev/docs/agents/claude-managed-agents), [Daytona Claude Agent SDK Guide](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-interactive-terminal-sandbox/), [Anthropic Agent SDK Hosting](https://platform.claude.com/docs/en/agent-sdk/hosting), [Claude Agent SDK Custom Tools](https://code.claude.com/docs/en/agent-sdk/custom-tools), [Claude Agent SDK Hooks](https://code.claude.com/docs/en/agent-sdk/hooks)_

---

## Integration Patterns Analysis

### AG-UI Endpoint Contract

The AG-UI protocol defines a precise HTTP contract: a **POST** endpoint on the backend that accepts a JSON body conforming to `RunAgentInput` and returns a **Server-Sent Events stream** for the duration of the agent run. The browser treats this as a single long-lived request/response — it POSTs once and reads the SSE stream until `RUN_FINISHED` or `RUN_ERROR`.

**Required SSE response headers:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no   ← critical for nginx/Fly.io; prevents response buffering
```

**`RunAgentInput` fields (from `@ag-ui/core`):**

```ts
interface RunAgentInput {
  threadId: string;        // stable conversation identifier
  runId: string;           // unique per-turn identifier
  messages: Message[];     // full conversation history (stateless by design)
  tools?: Tool[];          // frontend-declared tools the agent may call
  context?: ContextItem[]; // extra context (workspace files, etc.)
  state?: unknown;         // agent-specific state blob
}
```

The full message history is sent on every request — AG-UI is intentionally stateless on the transport layer. Conversation state lives in the frontend and is replayed each turn.

**Event sequence for a successful run:**

```
RUN_STARTED
TEXT_MESSAGE_START        (delta streaming begins)
TEXT_MESSAGE_CONTENT×N
TEXT_MESSAGE_END
TOOL_CALL_START           (if agent invokes a tool)
TOOL_CALL_END
TEXT_MESSAGE_START        (model resumes after tool)
...
RUN_FINISHED
```

`EventEncoder` from `@ag-ui/encoder` serialises each event as `data: ${JSON.stringify(event)}\n\n` — standard SSE format. The frontend `HttpAgent` (from `@assistant-ui/react-ag-ui`) parses this stream automatically.

_Sources: [AG-UI Protocol Quickstart](https://docs.ag-ui.com/quickstart/build), [AG-UI Server Guide](https://docs.ag-ui.com/quickstart/server), [CometChat NestJS AG-UI Implementation](https://www.cometchat.com/docs/ai-agents/cometchat-ag-ui-nestjs), [AG-UI Protocol Overview](https://levelup.gitconnected.com/agui-agent-to-ui-protocol-what-should-backend-and-frontend-developers-know-25a7a1ddf1f8)_

---

### NestJS AG-UI Endpoint Implementation

**Important:** The `@Sse()` decorator in NestJS handles GET requests only. Since AG-UI sends a POST body (`RunAgentInput`), the agent endpoint must use `@Post()` with manual SSE header injection. This is how CometChat's NestJS reference implementation works:

```ts
@Post('agent')
async runAgent(@Body() input: RunAgentInput, @Res() res: Response): Promise<void> {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const encoder = new EventEncoder();

  res.write(encoder.encode({ type: EventType.RUN_STARTED,
    threadId: input.threadId, runId: input.runId }));

  // Start Claude Agent SDK in sandbox, stream events
  await this.agentService.run(input, (event) => res.write(encoder.encode(event)));

  res.write(encoder.encode({ type: EventType.RUN_FINISHED,
    threadId: input.threadId, runId: input.runId }));
  res.end();
}
```

Client disconnect handling (essential to avoid orphaned sandbox processes):

```ts
req.on('close', () => this.agentService.cancel(input.threadId));
```

The `AgentService.run()` call manages the Daytona sandbox lifecycle and proxies events from the in-sandbox agent process. This is the central integration seam of the entire architecture.

_Sources: [CometChat NestJS AG-UI Implementation](https://www.cometchat.com/docs/ai-agents/cometchat-ag-ui-nestjs), [AG-UI Express.js Implementation](https://www.cometchat.com/docs/ai-agents/cometchat-ag-ui-express), [NestJS SSE Docs](https://docs.nestjs.com/techniques/server-sent-events)_

---

### Pattern A: In-Sandbox Claude Agent SDK → NestJS Event Channel

The most critical integration question for Pattern A is: **how does the Claude Agent SDK process running inside the Daytona sandbox emit structured AG-UI events back to the NestJS host?**

Three viable approaches, ordered by implementation maturity:

---

**Option 1 — `sandbox-agent` (rivet-dev, released Jan 2026, actively maintained)**

`sandbox-agent` is a small server binary deployed inside the sandbox that exposes an HTTP/SSE endpoint on a local port. The NestJS host calls this endpoint to start an agent run and receives a universal event stream. Supported agents include Claude Code, Codex, OpenCode, and Amp.

```
NestJS (host)                         Sandbox
  ├── Creates Daytona sandbox
  ├── Deploys sandbox-agent binary  ──▶ sandbox-agent HTTP server on :8080
  │                                      ├── Starts Claude Agent SDK
  ├── POST http://sandbox:8080/run  ──▶  ├── Runs BMAD skill
  ├── Reads SSE event stream        ◀──  └── Emits universal event stream
  └── Re-encodes as AG-UI events
      → SSE → browser
```

This is the cleanest production option — no custom event emission code inside the sandbox. The sandbox-agent handles Claude Code's JSONL stdout format and normalises it to a structured event schema.

_Source: [sandbox-agent GitHub](https://github.com/rivet-dev/sandbox-agent), [Introducing Sandbox Agent SDK — Rivet](https://rivet.dev/changelog/2026-01-28-sandbox-agent-sdk/), [sandboxagent.dev](https://sandboxagent.dev/)_

---

**Option 2 — Claude Agent SDK hooks → HTTP POST to NestJS**

The Claude Agent SDK exposes hooks that fire at tool boundaries. A lightweight HTTP client inside the sandbox can POST AG-UI events to a NestJS webhook endpoint on each hook:

```ts
// inside sandbox process (BMAD skill entry point)
import { query } from '@anthropic-ai/claude-code';

query({
  prompt: skillPrompt,
  options: {
    hooks: {
      PostToolUse: async ({ tool_name, tool_result }) => {
        await fetch('http://host-internal/agent-events', {
          method: 'POST',
          body: JSON.stringify(toAgUiEvent(tool_name, tool_result))
        });
      }
    }
  }
});
```

NestJS holds an `EventEmitter` per `threadId`; the webhook handler emits to it, and the SSE endpoint subscribes to deliver events to the browser. This approach gives fine-grained control but only fires at tool boundaries — mid-token streaming would require additional wiring via the `Assistant` message callbacks.

_Sources: [Anthropic Agent SDK Hosting](https://platform.claude.com/docs/en/agent-sdk/hosting), [Claude Agent SDK Hooks](https://code.claude.com/docs/en/agent-sdk/hooks), [Claude Code Hooks Multi-Agent Observability](https://github.com/disler/claude-code-hooks-multi-agent-observability)_

---

**Option 3 — WebSocket server inside sandbox (`claude-agent-server`)**

`dzhng/claude-agent-server` wraps the Claude Agent SDK in a WebSocket service that runs inside the sandbox. The NestJS host connects as a WebSocket client and receives a real-time event stream:

```
NestJS ←── WebSocket client ←── claude-agent-server (inside sandbox)
                                   └── Claude Agent SDK process
```

WebSocket is bidirectional, enabling NestJS to send mid-session interrupts (pause, cancel) back to the SDK. Slightly heavier setup than sandbox-agent.

_Source: [claude-agent-server GitHub](https://github.com/dzhng/claude-agent-server)_

---

### ADR-001: In-Sandbox Agent Event Channel

**Decision:** Which mechanism should the Claude Agent SDK process use to emit AG-UI events back to the NestJS host?

| Criterion | Option 1: sandbox-agent | Option 2: Hooks → POST | Option 3: WebSocket |
|---|---|---|---|
| Streaming fidelity (mid-token) | High (continuous SSE) | Low (tool boundaries only) | High (continuous WS) |
| Security (external deps) | Medium (third-party binary) | High (no external dep) | Low (community binary + WS) |
| Network routing complexity | Low (NestJS → sandbox via Daytona SDK) | Medium (sandbox → NestJS outbound route needed) | Low (but persistent WS state) |
| Debuggability | High (separate process, inspectable) | Medium (distributed HTTP POSTs, ordering risk) | Medium (WS half-open state risk) |
| Implementation effort | Low (configure, not build) | High (custom serialisation + sequencing) | Medium (reconnection logic) |
| Bidirectional control (future) | No (SSE only) | No | Yes |
| MVP readiness | High | Medium | Low |

**Decision: Option 1 (sandbox-agent)**

1. **Streaming fidelity is the dominant UX requirement.** Tool-boundary-only events (Option 2) produce a blank screen while Claude reasons between tool calls — unacceptable for BMAD sessions.
2. **Network routing is simpler.** NestJS connects into the sandbox via the Daytona SDK's existing tunnel. Option 2 requires an additional outbound route from sandbox to NestJS host — a new network surface that must be maintained across environments.
3. **The third-party binary risk is mitigable** with standard supply chain hygiene: pin version, verify checksum, run non-root.
4. **Two independent process logs** (sandbox-agent + Claude SDK) are independently inspectable via Daytona's exec API. Standard HTTP SSE is testable with `curl` at any time.

**Explicitly rejected:**
- Option 2: Streaming granularity is insufficient; inverted network direction adds surface area; HTTP POST ordering requires sequencing logic.
- Option 3: WebSocket reconnection complexity and persistent NestJS socket state (N open connections under load) is not justified until bidirectional mid-session control is a product requirement.

**Future trigger for revisiting:** If sandbox-agent drops Claude Code JSONL support, or if pause/cancel/inject mid-session becomes a product requirement — Option 3 becomes justified at that point.

**Required risk mitigations:**
- Pin sandbox-agent to an immutable version tag; never use floating `latest`
- Run sandbox-agent as non-root inside the Daytona sandbox
- Add `req.on('close')` in NestJS to detect silent SSE stream halts and treat them as session cancellations (prevents orphaned Daytona sandboxes)
- Vendor or checksum-verify the sandbox-agent binary in the Dockerfile layer

---

### Next.js → NestJS Authentication Handoff

Since the browser connects directly to the NestJS agent backend (Variant A topology), the browser needs a credential the agent backend will accept. The standard pattern for 2025–2026 is a **short-lived session JWT issued by the Next.js BFF**:

```
Browser → POST /api/agent-session  (authenticated with NextAuth session cookie)
Next.js Route Handler:
  1. Validates user session (NextAuth / Clerk)
  2. Generates a signed JWT:
       { sub: userId, threadId: <new or existing>, permissions: ['agent:run'] }
       exp: now + 120s   ← short enough to limit replay window
       signed with AGENT_BACKEND_JWT_SECRET (shared env var)
  3. Returns { sessionToken, agentBackendUrl }

Browser → POST https://agent-backend/agent
  Authorization: Bearer <sessionToken>
  Body: RunAgentInput (threadId matches JWT claim)
```

NestJS validates the JWT on every POST using a `JwtAuthGuard`. The 120-second expiry is sufficient for the browser to open the connection immediately; once the SSE stream is open, no further token validation is needed until the next turn.

**ThreadId continuity:** The Next.js Route Handler looks up or creates a `threadId` for the user's conversation (stored in its own DB). The JWT embeds this `threadId`, and NestJS verifies that the `RunAgentInput.threadId` matches the JWT claim — preventing one user from hijacking another's sandbox session.

_Sources: [NextJS SSR JWT with External Backend](https://www.thewidlarzgroup.com/blog/nextjs-ssr---jwt-access-refresh-token-authentication-with-external-backend), [Auth.js JWT Reference](https://authjs.dev/reference/nextjs/jwt), [Next.js JWT Authentication Guide](https://www.authgear.com/post/nextjs-jwt-authentication/)_

---

### Git Authentication Inside Daytona Sandboxes

When Claude Agent SDK runs BMAD inside a Daytona sandbox, it needs to clone the user's private GitHub repository and later push commits. The authentication flow must inject the user's GitHub token into the sandbox without exposing it in logs or the filesystem.

**Daytona SDK — credential injection at creation time:**

```ts
const sandbox = await daytona.create({
  envVars: {
    GIT_AUTHOR_NAME:  user.name,
    GIT_AUTHOR_EMAIL: user.email,
    GITHUB_TOKEN:     userGitHubToken,   // stored in NestJS session, not in sandbox FS
  }
});

// Then inside sandbox, clone using token in URL (standard Git credential helper pattern):
// git clone https://oauth2:<token>@github.com/user/repo.git
```

**Daytona Git SDK** (TypeScript) also provides `sandbox.git.clone({ url, username, password })` which handles the credential injection at the protocol level.

**Security considerations:**
- The GitHub token lives in NestJS session memory (Redis or in-process), never in the Daytona sandbox filesystem after the clone is complete
- Use fine-grained GitHub PATs scoped to the specific repository + `contents:write` + `pull_requests:write` only
- Token rotation: issue a new PAT per-session or use GitHub Apps installation tokens (1-hour TTL) for tighter rotation

_Sources: [Daytona Git Operations](https://www.daytona.io/docs/en/git-operations/), [Daytona Python SDK Git](https://www.daytona.io/docs/en/python-sdk/sync/git/), [Daytona Sandboxes via Arcade (OAuth integration)](https://www.daytona.io/dotfiles/sandboxes-now-available-as-agent-ready-tools-through-arcade)_

---

### Session Lifecycle State Machine

The `threadId` from `RunAgentInput` is the single durable key that connects all layers: the Next.js conversation record, the Daytona sandbox, and the Claude Agent SDK session. NestJS manages a `SandboxRegistry` (in-memory map or Redis-backed) keyed by `threadId`:

```
State: NO SANDBOX
  │
  └── User opens chat tab
        ├── Create Daytona sandbox
        ├── git clone user repo (~3–8 s, happens in background while user reads skill options)
        ├── Read skills metadata from sandbox filesystem (surfaces available skills in UI)
        ├── Immediately pause sandbox
        └── → PROVISIONED (sandbox paused, filesystem intact, no SDK process)

State: PROVISIONED
  │
  └── RUN_STARTED (any turn)
        ├── Resume paused sandbox (~90 ms)
        ├── Start SDK process via sandbox-agent (~150–300 ms)
        └── → RUNNING
            │
            ├── RUN_FINISHED → Pause sandbox (preserve filesystem state)
            │                   → PROVISIONED (sandbox warm, waiting)
            │
            ├── Client disconnect → Cancel SDK process, pause sandbox
            │                        → PROVISIONED
            │
            └── Idle timeout (e.g. 30 min) → Destroy sandbox
                                              → NO SANDBOX
```

**Key design decision — sandbox lifecycle anchored to chat tab open, not first message:**
The sandbox is created and immediately paused when the user opens a new chat tab — not when they send their first message. This serves two purposes: (1) the git clone cost (~3–8 s) is paid during the tab-open transition while the user is reading available skill options, making it invisible; (2) the paused sandbox filesystem can be read immediately via the Daytona SDK to populate the skills list in the chat UI, with no separate GitHub API call needed. By the time the user sends their first message, the sandbox is already provisioned and resumes in ~90 ms.

**Skill invocation:** No special initial prompt or skill-selection API is required. The Claude Agent SDK starts in the sandbox environment with all BMAD skills already available (loaded from the cloned `_bmad/` directory, exactly as in Claude Code). Skill dispatch is conversational — the UI reads the skills list from the paused sandbox filesystem and surfaces them as suggestions; the user's first message (e.g. `/bmad-agent-pm`) invokes the skill naturally through the agent loop. The backend has no concept of a "selected skill."

**Pause vs destroy:** Pausing the sandbox (Daytona auto-stop) preserves the filesystem — the user's in-progress work survives across turns without requiring a commit. Destroying on every turn would require a fresh `git clone` each time, adding latency and losing uncommitted file state between turns.

_Sources: [Anthropic Agent SDK Hosting](https://platform.claude.com/docs/en/agent-sdk/hosting), [Daytona Claude Agent SDK Guide](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-interactive-terminal-sandbox/)_

---

## Performance Considerations

### Sandbox Cold Start and Per-Turn Overhead

The latency a user perceives from "send message" to "first token visible in browser" has three components: sandbox resume, SDK process start, and Anthropic API time-to-first-token.

**Daytona warm pool — ~90 ms sandbox creation:**
Daytona maintains a pool of pre-warmed sandboxes using default snapshots. New sandbox creation from the warm pool benchmarks at sub-90 ms. This is approximately 20× faster than cold-booting a fresh Docker container in the same data centre. Daytona processes 850K daily sandbox runs as of May 2026, with performance tuned specifically for agent loop workloads where Anthropic's own documentation lists execution environment latency as a top-three agent performance factor.

**Per-turn latency budget (pause/resume model):**

```
User sends message
  ├── Daytona sandbox resume (warm, paused)       ~90 ms
  ├── sandbox-agent process check / SDK restart   ~150–300 ms
  ├── git status / workspace validation           ~50–100 ms
  └── Anthropic API: time-to-first-token          ~300–1000 ms (model-dependent)
  
Total to first streamed token: ~600–1500 ms
```

This is acceptable for BMAD sessions where individual tasks take minutes. The per-turn overhead does not compound because the sandbox is paused (not destroyed) between turns — the filesystem is preserved, the only cost is the process restart.

**Per-turn latency (all turns benefit from pre-provisioned sandbox):**

| Moment | Sandbox state | Latency driver |
|---|---|---|
| Chat tab open | NO SANDBOX → PROVISIONED | git clone + sandbox-agent install (~3–8 s, background — user is reading skill options) |
| First message | Paused (pre-provisioned) | Sandbox resume + SDK startup (~600–1500 ms) |
| Second+ message | Paused (resume) | Sandbox resume + SDK restart (~600–1500 ms) |
| Same-session reconnect | Running | Zero sandbox overhead — stream reconnect only |

The git clone cost is paid on tab open, not on first message. A loading indicator is appropriate during tab open (skeleton state while sandbox provisions). All message turns — including the first — benefit from the pre-provisioned sandbox and see consistent ~600–1500 ms latency to first streamed token.

_Sources: [Daytona vs E2B vs Modal vs Vercel Sandbox 2026](https://www.startuphub.ai/ai-news/artificial-intelligence/2026/daytona-vs-e2b-vs-modal-vs-vercel-sandbox-2026), [Daytona vs Modal 2026 — Northflank](https://northflank.com/blog/daytona-vs-modal), [AI Agent Sandboxes 2026 — E2B vs Daytona vs WebContainers](https://www.pkgpulse.com/guides/e2b-vs-daytona-vs-webcontainers-ai-agent-sandboxes-2026)_

---

### NestJS SSE Connection Management Under Load

Each active BMAD session holds one open SSE response stream on the NestJS process. At 100 concurrent sessions, that is 100 in-flight HTTP responses, 100 file descriptors, and 100 in-memory event streams.

**Known NestJS SSE memory issue (GitHub #11601):** The `@Sse()` decorator accumulates `drain` listeners on `SseStream` objects without cleanup, producing EventEmitter memory leaks under load. Since the BMAD agent endpoint uses `@Post()` with manual SSE headers (not `@Sse()`), this specific issue is avoided — but the underlying principle holds: every SSE response must be explicitly ended and its resources freed on client disconnect.

**OS file descriptor limit:** Node.js default is 1024 open file descriptors. For a production agent backend targeting 100+ concurrent sessions (each holding an SSE response, a Daytona SDK connection, and a sandbox-agent HTTP connection), the limit must be raised:

```bash
# /etc/security/limits.conf or ulimit in Dockerfile
* soft nofile 65535
* hard nofile 65535
```

**Event loop impact:** AG-UI events are low-frequency lifecycle markers and token deltas — not high-frequency sensor data. A typical BMAD turn emits ~10–200 events per minute. At 100 concurrent sessions, NestJS handles ~1000–20000 events/minute — well within Node.js single-thread capacity. The event loop is not a bottleneck at this scale.

**Horizontal scaling caveat:** NestJS holds the `SandboxRegistry` (Map<threadId, sandbox>) in-process memory. If NestJS is horizontally scaled to multiple instances, a session's subsequent turns may land on a different instance with no sandbox record. At MVP (single NestJS container), this is not an issue. At scale, the registry must move to Redis with the Daytona sandbox ID as the value.

_Sources: [NestJS SSE Memory Leak Issue #11601](https://github.com/nestjs/nest/issues/11601), [Node.js SSE Production Guide 2026](https://www.hirenodejs.com/blog/nodejs-server-sent-events-sse-2026), [NestJS Performance — DEV Community](https://dev.to/leolanese/nestjs-performance-2kcb)_

---

### Prompt Caching and Token Cost

**As of June 15, 2026:** Claude Agent SDK usage is metered separately from interactive Claude Code usage on subscription plans. Agent SDK runs draw from a new monthly Agent SDK credit. This makes cost predictable but means BMAD's token consumption is fully metered.

**AG-UI stateless design creates prompt caching opportunity:** Because AG-UI sends the full `messages` history on every `RunAgentInput`, the prefix of the conversation is identical turn-over-turn (only the latest user message is new). Anthropic's prompt caching caches repeated input prefixes, saving ~90% of those tokens. For a BMAD session with 10 turns, turns 2–10 each get cache hits on the preceding messages.

**BMAD-specific token considerations:**

| Factor | Impact |
|---|---|
| Full message history resent each turn | High — mitigated by prompt caching |
| BMAD skills include long system prompts | High — prime candidates for prompt caching |
| `tools: []` stripped (Pattern A) | Neutral — tool definitions removed from context |
| Workspace file context injected per turn | Medium — changes each turn, no cache benefit |

**Recommended:** Ensure the BMAD system prompt and static skill instructions are positioned at the start of the prompt (before dynamic content) to maximise cache hit rate.

_Sources: [Claude Code Token Optimization 2026](https://buildtolaunch.substack.com/p/claude-code-token-optimization), [Claude Agent SDK Overview](https://code.claude.com/docs/en/agent-sdk/overview), [Claude Platform Release Notes](https://platform.claude.com/docs/en/release-notes/overview)_

---

### Sandbox Concurrency and Daytona Limits

Daytona Cloud account tiers impose concurrent sandbox limits. At the time of writing, the default tier supports up to 10 simultaneous running sandboxes; higher tiers and enterprise plans increase this. For a public BMAD web app with unpredictable concurrent user load, this limit must be validated against the target tier before launch.

**Mitigation strategies:**

1. **Pause aggressively:** Pause sandboxes immediately on `RUN_FINISHED` rather than waiting for a timeout. Paused sandboxes do not count against the running concurrency limit.
2. **Idle timeout:** Destroy sandboxes after 30 minutes of inactivity. Filesystem state is lost but can be recovered from git.
3. **Queue at capacity:** If concurrent sandbox limit is hit, queue incoming sessions with a user-visible "preparing session" state rather than returning an error.

_Sources: [Is Daytona the Best Sandbox Runtime for AI Agents?](https://devaitoolkit.com/blog/is-daytona-the-best-sandbox-runtime-for-ai-agents/), [Daytona Alternatives 2026](https://www.morphllm.com/comparisons/daytona-alternative)_

---

## Research Synthesis

### Executive Summary

Building a browser-accessible BMAD agent requires two architectural decisions that are non-negotiable once you understand the constraints.

**First, serverless execution is categorically unsuitable** for Claude Agent SDK sessions. Vercel's 300-second hard cap on Hobby and the fragile 1800-second Pro beta cannot accommodate BMAD workflows that routinely run 10–30+ minutes. A persistent containerised backend (NestJS on Fly.io or Railway) is required. Next.js remains on Vercel for UI, auth, and short REST APIs — the two form a hybrid topology connected by a short-lived JWT that authorises each agent session.

**Second, tool isolation is mandatory from day one.** Running Claude Agent SDK tools (Bash, git, npm) on the NestJS host gives every authenticated user arbitrary shell access to the shared server and its secrets. The correct architecture (Pattern A) runs the entire Claude Agent SDK process inside a Daytona sandbox per conversation. NestJS creates and manages sandboxes; it does not execute tools itself. The `sandbox-agent` binary (rivet-dev) running inside each sandbox exposes an HTTP/SSE endpoint from which NestJS proxies structured AG-UI events to the browser.

These two decisions — containerised NestJS + Daytona Pattern A — compose into a coherent, independently validated architecture that has official reference implementations from both Anthropic and Daytona.

---

### Architecture Decisions (Final)

| Decision | Choice | Rationale |
|---|---|---|
| Frontend + BFF | Next.js 15 on Vercel | UI, auth (NextAuth/Clerk), short APIs, JWT issuance |
| Agent backend | NestJS (Docker container) | Native SSE/POST, DI for session management, AG-UI reference impl |
| Container platform | Fly.io or Railway | Persistent process, no timeout, simple Docker deploy |
| SSE topology | Browser → agent backend direct (Variant A) | Bypasses Vercel timeout entirely; Next.js issues short-lived JWT |
| Tool isolation | Pattern A — entire SDK inside sandbox | Complete isolation; no per-tool interception code |
| Sandbox platform | Daytona Cloud | ~90 ms warm start, official TypeScript SDK, official Claude Agent SDK guide |
| Event channel | `sandbox-agent` (rivet-dev) | HTTP/SSE from inside sandbox; handles Claude Code JSONL normalisation |
| Sandbox granularity | Per-conversation (threadId) | Pause/resume preserves filesystem; no cross-conversation race conditions |
| Auth handoff | Short-lived JWT (120 s TTL, threadId embedded) | Stateless, verifiable by NestJS; prevents sandbox hijacking |
| Git auth | GitHub PAT injected as env var at sandbox creation | Never stored in sandbox filesystem; scoped fine-grained PAT |
| Sandbox lifecycle | Create → pause → resume → destroy on idle timeout | Preserves uncommitted work; running concurrency managed aggressively |
| Horizontal scaling | Single NestJS container at MVP; Redis SandboxRegistry before scale-out | SandboxRegistry is in-process; Redis required before multiple instances |

---

### Full Technology Stack

```
Browser
  ├── @assistant-ui/react-ag-ui  (HttpAgent, useAgUiRuntime)
  └── AG-UI POST + SSE → agent backend

Next.js 15 (Vercel)
  ├── App Router, React Server Components
  ├── NextAuth / Clerk
  └── Route Handler: POST /api/agent-session → issues JWT + agentBackendUrl

NestJS container (Fly.io or Railway)
  ├── POST /agent  →  AG-UI RunAgentInput
  ├── @ag-ui/encoder  EventEncoder → SSE stream → browser
  ├── SandboxRegistry  Map<threadId, DaytonaSandboxId>
  └── AgentService  →  Daytona TypeScript SDK

Daytona Cloud sandbox (per threadId)
  ├── sandbox-agent binary (rivet-dev) on :8080  →  NestJS reads SSE
  ├── Claude Agent SDK process  (BMAD skill entry point)
  ├── Isolated filesystem with git-cloned user repository
  └── GitHub PAT in env vars → git push
```

---

### Implementation Roadmap

**Phase 0 — Foundation (Week 1–2)**
- Stand up NestJS container (Docker, Railway deploy)
- Implement `POST /agent` endpoint with manual SSE headers + EventEncoder
- Implement Next.js Route Handler for JWT issuance
- Wire `@assistant-ui/react-ag-ui` `HttpAgent` to agent backend URL
- Smoke test: hardcoded "hello world" AG-UI event sequence end-to-end

**Phase 1 — Daytona Integration (Week 2–3)**
- Integrate Daytona TypeScript SDK: create, pause, resume, destroy
- Build `SandboxService` keyed by threadId
- Deploy `sandbox-agent` inside sandbox Docker image
- Test Claude Agent SDK running inside Daytona sandbox, events proxied to NestJS
- Implement `req.on('close')` cleanup — no orphaned sandboxes

**Phase 2 — BMAD Skill Wiring (Week 3–5)**
- Clone user repository into sandbox on first turn
- Configure BMAD skill entry point inside sandbox
- Validate AG-UI event stream for a complete BMAD workflow (brief → PRD)
- Implement idle timeout (30 min) and pause-on-finish
- Raise OS file descriptor limit in Dockerfile

**Phase 3 — Auth + Git (Week 5–6)**
- GitHub OAuth integration (NextAuth provider)
- Fine-grained PAT issuance or GitHub App installation token flow
- Inject token into Daytona sandbox env vars at creation
- Validate git push from inside sandbox to user repo

**Phase 4 — Hardening (Week 6–8)**
- Pin sandbox-agent to immutable version; checksum in Dockerfile
- Non-root user inside Daytona sandbox
- Sandbox concurrency monitoring + queuing at Daytona tier limit
- Prompt caching: BMAD system prompt positioned before dynamic content
- Add SigNoz / observability dashboards (SDK token usage, session latency)
- Verify NestJS memory under 50+ concurrent SSE sessions

---

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `sandbox-agent` drops Claude Code JSONL support | Low | High | ADR-001: switch to SDK hooks (Option 2) or WebSocket (Option 3) |
| Daytona Cloud concurrent sandbox limit hit | Medium | Medium | Pause aggressively; queue; upgrade tier or migrate to Daytona OSS |
| NestJS SSE memory leak under load | Medium | Medium | Use `@Post()` not `@Sse()`; explicit cleanup on close; load test before launch |
| Tab-open provisioning latency (git clone) exceeds UX tolerance | Medium | Low | Sandbox is created on chat tab open, not on first message — git clone cost paid while user reads skill options; skeleton loading state covers the gap |
| Daytona Cloud service availability | Low | High | Daytona OSS self-hosted as fallback; migration is NestJS SandboxService swap |
| GitHub PAT scoping too broad | Medium | High | Fine-grained PATs: repo-specific, `contents:write` + `pull_requests:write` only |
| AG-UI SDK breaking changes | Low | Medium | Pin `@ag-ui/core` and `@assistant-ui/react-ag-ui` versions; test on upgrade |

---

### Open Questions Requiring Product Decision

1. **Git repository source:** Does the user connect an existing GitHub repo, or does bmad-easy create a new repo on their behalf? This determines the OAuth scope and git clone strategy.
2. ~~**BMAD skill entry point:** How is the specific BMAD skill selected at the start of a conversation?~~ **RESOLVED (2026-06-13):** No special entry point mechanism is needed. The Claude Agent SDK starts in the sandbox with all BMAD skills already loaded from the cloned `_bmad/` directory — identical to how Claude Code works. The chat UI reads the skills list from the paused sandbox filesystem and surfaces them as suggestions. Skill invocation is conversational (the user's first message invokes the skill via the standard slash command or natural language). The backend has no concept of a selected skill.
3. ~~**Sandbox pre-warming:** Should sandboxes be created speculatively, or on first message?~~ **RESOLVED (2026-06-13):** Sandbox is created and immediately paused when the user opens a new chat tab. See the Session Lifecycle State Machine section for the full rationale.
4. **Artifact visibility:** BMAD artifacts accumulate in the sandbox filesystem. When and how are they committed to git? On `RUN_FINISHED`? On user request? Auto-commit on idle?

---

**Research Completed:** 2026-06-13
**Scope covered:** Architecture Analysis, Integration Patterns, Performance Considerations
**Confidence level:** High — all major decisions validated against official reference implementations (Anthropic hosting docs, Daytona Claude Agent SDK guide, CometChat NestJS AG-UI, rivet-dev sandbox-agent)

_Sources: [Claude AI Architecture for Production Systems](https://mobisoftinfotech.com/resources/blog/ai-development/claude-ai-architecture-production-systems), [Claude AI Agents Architecture & Deployment Guide 2026](https://dextralabs.com/blog/claude-ai-agents-architecture-deployment-guide/), [Claude Agent SDK Production Patterns 2026](https://www.digitalapplied.com/blog/claude-agent-sdk-production-patterns-guide)_
