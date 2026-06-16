---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - '_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md'
  - '_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md'
  - '_bmad-output/planning-artifacts/briefs/brief-bmad-easy-2026-06-12/brief.md'
  - '_bmad-output/planning-artifacts/research/technical-backend-service-architecture-claude-agent-sdk-ag-ui-research-2026-06-12.md'
  - '_bmad-output/planning-artifacts/research/technical-git-repository-authentication-multi-host-research-2026-06-13.md'
  - '_bmad-output/planning-artifacts/research/technical-github-oauth-scope-vs-pat-for-repository-access-research-2026-06-15.md'
  - '_bmad-output/planning-artifacts/research/technical-programmatic-claude-code-agent-sdk-research-2026-06-11.md'
  - '_bmad-output/planning-artifacts/research/technical-oss-react-chat-ui-for-agent-sdk-sse-streaming-research-2026-06-12.md'
  - '_bmad-output/planning-artifacts/research/technical-claude-agent-sdk-sandboxed-tool-execution-research-2026-06-12.md'
  - '_bmad-output/planning-artifacts/research/technical-bmad-session-token-consumption-and-cost-claude-sonnet-4-6-research-2026-06-14.md'
  - '_bmad-output/planning-artifacts/research/technical-docker-per-session-daytona-ai-agent-isolation-research-2026-06-12.md'
workflowType: 'architecture'
project_name: 'bmad-easy'
user_name: 'Marius'
date: '2026-06-15'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

19 requirements across 5 feature areas: Repository Connection & Onboarding (FR-1–5), Project Map (FR-6–8), Conversations (FR-9–15), Artifact Browser (FR-16–17), and Authentication & Access Control (FR-18–19).

Architecturally significant FRs:
- **FR-9/FR-10** drive the sandbox provisioning strategy — the Sandbox must be ready before the first user message (10-second window), and the chat must stream with visible tool call history.
- **FR-11** (10 concurrent Conversations per user) directly determines the SSE connection capacity requirement (NFR-R4) and the sandbox count ceiling per user.
- **FR-12** (Tool Pills / Semantic Pills) requires real-time event classification on the streaming path — the backend must recognize `git commit` events and promote them to Semantic Pills before they reach the browser.
- **FR-14/FR-15** (Working Tree Indicator / Manual Commit) require the backend to query and act on git working tree state between agent turns, independent of the agent itself.
- **FR-3** (Commit Attribution) means per-session git config injection must happen reliably at Sandbox initialization and every resume for every Conversation.

**Non-Functional Requirements:**

| NFR | Requirement | Architectural driver |
|-----|-------------|----------------------|
| NFR-P1 | First streamed token ≤ 1,500ms | SSE streaming path must be low-latency; no buffering |
| NFR-P2 | Chat ready ≤ 10s from page open | Sandbox provisioned on page open (not first send); background clone |
| NFR-P3 | Project Map load ≤ 2s | Git read on page load; lightweight `_bmad-output/` scan |
| NFR-P4 | Artifact Browser load ≤ 2s | Direct git file read at committed revision |
| NFR-P5 | Manual commit ≤ 5s | Platform-level git commit inside Sandbox, bypassing agent |
| NFR-R3 | SSE back-pressure | Transport must pause emission when client is slow |
| NFR-R4 | 10 concurrent SSE connections/browser | HTTP/2 multiplexing required; HTTP/1.1 6-connection browser limit not acceptable |
| NFR-S2 | Sandbox credential/network isolation | Platform-internal credentials must not reach Sandbox |
| NFR-S3 | Per-user credential isolation | Every credential lookup must pass tenant authorization check |
| NFR-S4 | Active sandbox termination on deactivation | DELETE API call required; passive rejection insufficient |
| NFR-S5 | OAuth token storage | AES-256-GCM encrypted at rest; never returned to client |
| NFR-O1 | Per-user LLM spend monitoring | SDK cost reporting wired from day one; budget alerting at launch |

**Scale & Complexity:**

- Primary domain: Full-stack SaaS + cloud infrastructure orchestration
- Complexity level: High
- Estimated architectural components: 8 (Next.js BFF, NestJS agent backend, Daytona Sandbox, Claude Code agent, sandbox-agent event bridge, PostgreSQL, GitHub OAuth, AG-UI streaming layer)
- Concurrent load ceiling (MVP): 10 Conversations × N users (single-container; no horizontal scaling)

### Technical Constraints & Dependencies

- **GitHub-only** in MVP. A provider abstraction layer is the extension point for post-MVP providers.
- **Main branch only.** No branching or PR workflows. Two concurrent Conversations writing to the same Artifact path: last-write-wins, no conflict detection (MVP).
- **Single NestJS container.** No horizontal scaling; no distributed session registry. Sandbox state is in-process or delegated to Daytona API.
- **Model hardcoded:** `claude-sonnet-4-6`. Extended thinking disabled (PRD §8). No user-selectable model.
- **Daytona Cloud** is a critical dependency (A-7). Migration contained to `SandboxService` layer; Daytona OSS is the documented fallback.
- **Repository size boundary (Q-1 resolution):** NFR-P2 (10s chat ready) is validated only for repositories ≤ 200MB. This boundary is asserted, not empirically validated against Daytona clone timing; empirical validation is deferred. Shallow clone / sparse checkout for large repositories is post-MVP.
- **OAuth App restrictions:** GitHub organizations can block OAuth App access. During repository validation (FR-1) the platform must test write access with a dry-run git operation and surface the org-restriction cause explicitly in the 403 error path — not a generic "couldn't connect" message. No in-app workaround exists; org-owner approval of the bmad-easy OAuth App is required. GitHub App (post-MVP) sidesteps this.
- **UX/PRD reconciliation required:** EXPERIENCE.md onboarding Flow 1 references a PAT input field (pre-DL-7). The correct onboarding model per PRD DL-7: sign-in with GitHub OAuth obtains the `repo`-scoped token; onboarding only requires a Repository URL input field. The architecture specifies the DL-7 model; EXPERIENCE.md requires a corresponding update.
- **HTTP/2 deployment invariant:** The NestJS agent backend must be fronted by an HTTP/2-capable reverse proxy at the load balancer level. HTTP/1.1 anywhere in the browser→NestJS path caps concurrent SSE connections at 6, breaking NFR-R4. This is a deployment configuration requirement verified in the launch checklist, not a code requirement.
- **Sandbox idle timeout:** A sandbox provisioned on page open (FR-9) that receives no first message within a configurable timeout (default 60s, read from `SandboxService` config) must be torn down. This prevents wasted allocations from users who navigate away before sending a message. The 60-second default is not empirically validated; treat as a tunable parameter.
- **Sandbox initialization sequence (ordered):** provision → clone (or restore on resume) → inject per-user git config → run `git status --porcelain` → emit `WORKING_TREE_*` event → emit `SESSION_READY`. Git config injection must occur at every provision **and** every resume, not only at initial provision.
- **sandbox-agent version policy:** Pin to an exact binary version in the Dockerfile (no floating tags). Before any upgrade: diff the JSONL→AG-UI event mapping in the release changelog; run the new version against a recorded BMAD session replay and validate the expected AG-UI event sequence matches. Upgrade only when a specific bug fix or capability drives it. Monitor upstream for abandonment signals.
- **AG-UI package version policy:** Pin `@assistant-ui/react-ag-ui`, `@ag-ui/client`, and `@ag-ui/core` to exact versions in `package.json` (no `^` or `~`). Before any upgrade: check changelog for `IAgentHarness` interface changes and `EventType` enum changes; validate against a recorded session replay in isolation. Upgrade only when needed. Same discipline as sandbox-agent.

### Cross-Cutting Concerns Identified

1. **Multi-tenant credential isolation** — affects every git operation, every Sandbox initialization, every credential lookup. Every code path must carry a `tenant_id` check before resolving an OAuth token.
2. **Sandbox lifecycle management** — provision, clone, run, pause, resume, destroy must be handled transparently per Conversation. Lifecycle state affects UI (status indicators), session recovery (FR-13), and active termination on deactivation (NFR-S4). The AG-UI SSE channel carries lifecycle events (`SESSION_STARTED`, `SESSION_READY`, `WORKING_TREE_DIRTY`, `WORKING_TREE_CLEAN`) as well as agent tokens — single connection for both. Working tree state is checked via `git status --porcelain` after Bash and file-write tool calls only; initial state is emitted as part of the session ready sequence. One sandbox : one conversation is an enforced invariant.
3. **Real-time SSE streaming** — affects the entire agent-to-browser event path: back-pressure (NFR-R3), 10 concurrent connections (NFR-R4), HTTP/2 requirement, AG-UI event classification (Tool Pills, Semantic Pills). sandbox-agent must be wrapped in a circuit-breaker: if it fails to emit events within a timeout, the backend emits a synthetic error event on the SSE channel. The SSE channel must emit heartbeat comments on a fixed interval so the browser detects dead connections even when sandbox-agent is stalled.
4. **OAuth token lifecycle** — encryption at storage, health monitoring, re-auth flow, credential failure propagation to UI — affects NestJS service layer, Next.js BFF, and frontend state.
5. **Git transport and commit attribution** — every Conversation requires sandbox-level git config injection (user identity from OAuth profile) before any agent turn. Manual commit (FR-15) is a platform-level operation executed via Daytona process execution API, not an agent action. Queued behind agent turn idle state in-process.
6. **LLM cost observability** — per-user spend tracking via SDK cost reporting must be wired into the NestJS agent backend from day one (NFR-O1). Budget alerting at launch is non-negotiable.
7. **Session persistence and recovery** — Conversations are always resumable (FR-13). Recovery must be transparent: sandbox re-initialization is hidden from the user behind a "Reconnecting…" indicator; chat history must be available immediately from platform storage, independent of sandbox state.
8. **Sandbox isolation risk (post-MVP hardening item):** Daytona Cloud Docker-level isolation is an accepted risk for MVP, premised on authenticated, non-adversarial users (A-2). No runtime abuse detection mechanism exists in MVP. **This must not be forgotten after launch.** The documented escalation trigger is: if adversarial use is detected, upgrade to Firecracker microVM isolation (Fly.io Sprites or Daytona OSS with VM backend). The architecture contains this migration within the `SandboxService` layer. Post-MVP hardening review should evaluate whether an abuse signal (e.g., anomalous tool call patterns, excessive resource usage per sandbox) can be added.

### Architectural Risk Findings (Elicitation Pass)

Surfaced through pre-mortem, cascading failure, and second-order analysis of the draft. These are constraints that Step 4's architectural decisions must satisfy — not yet designed, only identified.

**High severity:**

- **Runaway agent on sandbox-agent crash:** If sandbox-agent (the JSONL→AG-UI bridge) crashes, the Claude Code agent process inside the sandbox keeps running — making tool calls and potentially committing to the Repository — with no SSE listener observing it. The backend must terminate the agent process via the Daytona process management API when sandbox-agent dies, before emitting the error event to the user.
- **Missing frontend session-start timeout:** If `SESSION_READY` never arrives (e.g., Daytona 503 on provision), the "Starting session…" state has no client-side timeout and can spin indefinitely. A timeout distinct from the server-side idle timeout (ADR-A) is required, with a retry affordance.
- **Credential failure must propagate immediately to the active session:** A 403 on git push mid-Conversation currently only updates credential health on the next page load's git operation (per FR-4's letter, not its intent). The re-auth prompt must fire on the active Conversation's SSE channel the moment the failure is detected, not wait for the next navigation event.

**Medium severity:**

- **Graceful degradation when Daytona is unavailable:** Project Map and Artifact Browser are pure git reads with no sandbox dependency. The architecture should keep them functional during a Daytona outage; only new Conversation provisioning should be blocked.
- **Conversation history persistence boundary:** It must be explicit which session state lives only in NestJS memory (lost on restart) versus persisted to PostgreSQL per turn. Conversation history should be written to the DB on every turn, not held in memory, so a container restart does not lose it.
- **Graceful shutdown for deploys:** The single-container constraint (PRD §8) means every deploy drops all active SSE connections simultaneously. NestJS shutdown hooks must drain SSE connections (notify clients, allow reconnect) rather than hard-killing them.
- **Per-user sandbox provision queue:** Opening multiple Conversation tabs quickly triggers simultaneous repo clones against the same GitHub repository. With the FR-11 ceiling of 10 concurrent Conversations, a burst could pressure GitHub's OAuth rate limit (5,000 req/hour). A per-user concurrency cap (2–3 simultaneous provisions) is recommended.
- **Main-branch silent overwrite is a product risk, not only a technical one:** Last-write-wins on concurrent commits to the same Artifact path (accepted in PRD §6.2) creates a second-order incentive for teams to self-limit to one active BMAD user at a time — quietly undermining the "full team participation" value proposition. A post-commit `git fetch --dry-run` divergence check (surface a warning, not a block) is worth considering even pre-MVP.
- **Sandbox provision failure cleanup:** On a failed `SandboxService.provision()` call, any partial Daytona allocation must be torn down — otherwise zombie sandboxes accrue Daytona billing with no active Conversation.

**Low severity:**

- **Conversation history retention:** No retention or archival policy is defined; storage grows unbounded at an estimated 1–3MB per full BMAD session. The schema should include `last_active_at` from the start to enable future archival, independent of when archival is actually implemented.
- **Auth.js v5 beta contingency:** `next-auth@^5.0.0-beta.31` is a beta dependency; a future Next.js security patch could force an incompatible bump. No contingency is documented — monitor the Auth.js changelog before any Next.js upgrade.
- **GitHub org OAuth restriction self-service path:** The 403 error path (already improved to name the org-restriction cause) should also include a direct link to GitHub's OAuth App org-approval flow and, ideally, a way to notify the org admin from within the app — this is a sales-blocking friction point for enterprise accounts otherwise.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack SaaS + cloud infrastructure orchestration. Two deployed services in an Nx
monorepo, plus one external dynamic service (Daytona Cloud sandboxes).

### Deployed Services

| Service | Location | Deployment |
|---------|----------|------------|
| `apps/web` | Next.js 15 BFF + frontend | Vercel |
| `apps/agent-be` | NestJS agent orchestrator backend | Docker / Fly.io or Railway |
| Daytona sandboxes | One per active Conversation | Daytona Cloud (external, dynamically scaled) |

**Note on sandbox scaling:** Daytona Cloud manages sandbox container lifecycle and
dynamic allocation — not a service we deploy or scale. The sandbox orchestration
abstraction within `apps/agent-be` contains the Daytona API integration. Post-MVP
extraction path: sandbox orchestration → own deployable NestJS service when independent
scaling is required. Migration is bounded to that abstraction boundary.

**JSONL normalisation decision:** sandbox-agent (rivet-dev) remains the chosen approach
for normalising Claude Code JSONL output into AG-UI events (per research ADR-001). The
in-process parsing alternative was raised during elicitation but not adopted. The
sandbox-agent reliability risk (A-8) stands as documented — pinned exact version,
upgrade protocol requiring changelog review and session-replay validation, plus the
circuit-breaker and SSE heartbeat mitigations already captured in Cross-Cutting Concerns.

### Monorepo Structure

Nx workspace with pnpm.

```
bmad-easy/
├── apps/
│   ├── web/            # Next.js 15 — BFF + frontend (Vercel)
│   └── agent-be/       # NestJS — agent orchestrator (Docker / Fly.io)
├── libs/
│   └── shared-types/   # @bmad-easy/shared-types — shared TypeScript interfaces
├── nx.json
├── package.json
└── tsconfig.base.json
```

`libs/shared-types` contains interfaces shared across `apps/web` and `apps/agent-be`:
AG-UI event types, API request/response contracts, session and conversation types,
credential health status types.

### Initialization Commands

```bash
# 1. Create Nx workspace (empty preset, pnpm)
npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=pnpm

# 2. Next.js BFF + frontend
nx generate @nx/next:app apps/web --style=none --appDir --src --e2eTestRunner=none

# 3. NestJS agent orchestrator backend
nx generate @nx/nest:app apps/agent-be --e2eTestRunner=none

# 4. Shared TypeScript interfaces library
nx generate @nx/js:lib shared-types --directory=libs \
  --importPath=@bmad-easy/shared-types --bundler=none
```

### Architectural Decisions Established by Starters

**Language:** TypeScript strict mode throughout — all apps and libs.

**`apps/web` (Next.js 15):** App Router, `src/` layout, `@/*` import alias,
Tailwind CSS, Turbopack dev server, ESLint.

**`apps/agent-be` (NestJS):** NestJS module pattern, Jest, ESLint + Prettier,
`nest-cli.json` build config.

**`libs/shared-types`:** Plain TypeScript, no bundler — resolved via path mappings
in `tsconfig.base.json`.

### Key Packages Added Post-Scaffold

| Package | Version | Service | Note |
|---------|---------|---------|------|
| `next-auth` | `^5.0.0-beta.31` | `apps/web` | App Router-native (Auth.js v5 beta); v4 does not support App Router |
| `@assistant-ui/react-ag-ui` | `0.0.38` | `apps/web` | Pinned exact — pre-1.0 |
| `@ag-ui/client` | `0.0.55` | `apps/web` | Pinned exact — pre-1.0 |
| `@ag-ui/core` | `0.0.57` | `apps/web` + `apps/agent-be` | Pinned exact — pre-1.0 |
| `@anthropic-ai/claude-agent-sdk` | `0.3.177` | `apps/agent-be` | Pinned exact — pre-1.0 |
| `@daytonaio/sdk` | `0.187.0` | `apps/agent-be` | Pinned exact — pre-1.0 |
| `prisma` | `^7.8.0` | `apps/agent-be` | ORM — confirmed |
| `@prisma/client` | `^7.8.0` | `apps/agent-be` | ORM — confirmed |

**Note:** Project initialization using these commands is the first implementation story.
