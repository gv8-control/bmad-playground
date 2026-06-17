---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
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
lastStep: 8
status: 'complete'
completedAt: '2026-06-16'
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
| NFR-S1 | Sandbox credential/network isolation | Platform-internal credentials must not reach Sandbox |
| NFR-S2 | Per-user credential isolation | Every credential lookup must pass tenant authorization check |
| NFR-S3 | Active sandbox termination on deactivation | DELETE API call required; passive rejection insufficient — **deferred to post-MVP**, no in-app deactivation flow exists to trigger it |
| NFR-S4 | OAuth token storage | AES-256-GCM encrypted at rest; never returned to client |
| NFR-R1 | Credential health propagation | Health status must update within one git operation cycle of a 401/403; silent failures not acceptable |
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
- **Repository size boundary (Q-1 resolution — updated 2026-06-17):** NFR-P2 (10s chat ready) applies to repositories ≤ 200MB, provisioned via **mandatory shallow clone** (`git clone --depth=1`). Shallow clone bounds clone time to working-tree size rather than git history depth, making 200MB a consistent and testable threshold. All Conversation provisions must use `--depth=1`; full-history clone is not supported in MVP. Empirical validation is required as the **first action in Implementation Sequence step 7**: provision a Daytona sandbox in the production region, shallow-clone test repositories at 50 MB / 100 MB / 150 MB / 200 MB / 250 MB, and measure total elapsed time from clone-start through `git status --porcelain` completion (the SESSION_READY precondition). Accept 200 MB if the full provision + shallow-clone + git-config-injection + working-tree-status sequence completes in ≤ 8 s (reserving 2 s margin for cold-start and network jitter). If 200 MB consistently exceeds 8 s, revise the boundary to 100 MB and update the PRD accordingly. Sparse checkout for oversized repositories remains post-MVP.
- **OAuth App restrictions:** GitHub organizations can block OAuth App access. During repository validation (FR-1) the platform must test write access with a dry-run git operation and surface the org-restriction cause explicitly in the 403 error path — not a generic "couldn't connect" message. No in-app workaround exists; org-owner approval of the bmad-easy OAuth App is required. GitHub App (post-MVP) sidesteps this.
- **UX/PRD reconciliation required:** EXPERIENCE.md onboarding Flow 1 references a PAT input field (pre-DL-7). The correct onboarding model per PRD DL-7: sign-in with GitHub OAuth obtains the `repo`-scoped token; onboarding only requires a Repository URL input field. The architecture specifies the DL-7 model; EXPERIENCE.md requires a corresponding update.
- **HTTP/2 deployment invariant:** The NestJS agent backend must be fronted by an HTTP/2-capable reverse proxy at the load balancer level. HTTP/1.1 anywhere in the browser→NestJS path caps concurrent SSE connections at 6, breaking NFR-R4. This is a deployment configuration requirement verified in the launch checklist, not a code requirement.
- **Sandbox idle timeout:** A sandbox provisioned on page open (FR-9) that receives no first message within a configurable timeout (default 60s, read from `SandboxService` config) must be torn down. This prevents wasted allocations from users who navigate away before sending a message. The 60-second default is not empirically validated; treat as a tunable parameter.
- **Sandbox initialization sequence (ordered):** provision → clone (or restore on resume) → inject per-user git config → run `git status --porcelain` → emit `WORKING_TREE_*` event → emit `SESSION_READY`. Git config injection must occur at every provision **and** every resume, not only at initial provision.
- **sandbox-agent version policy:** Pin to an exact binary version in the Dockerfile (no floating tags). Before any upgrade: diff the JSONL→AG-UI event mapping in the release changelog; run the new version against a recorded BMAD session replay and validate the expected AG-UI event sequence matches. Upgrade only when a specific bug fix or capability drives it. Monitor upstream for abandonment signals.
- **AG-UI package version policy:** Pin `@assistant-ui/react-ag-ui`, `@ag-ui/client`, and `@ag-ui/core` to exact versions in `package.json` (no `^` or `~`). Before any upgrade: check changelog for `IAgentHarness` interface changes and `EventType` enum changes; validate against a recorded session replay in isolation. Upgrade only when needed. Same discipline as sandbox-agent.

### Cross-Cutting Concerns Identified

1. **Multi-tenant credential isolation** — affects every git operation, every Sandbox initialization, every credential lookup. Every code path must carry a `tenant_id` check before resolving an OAuth token.
2. **Sandbox lifecycle management** — provision, clone, run, pause, resume, destroy must be handled transparently per Conversation. Lifecycle state affects UI (status indicators), session recovery (FR-13). Active termination on deactivation (NFR-S3) is deferred to post-MVP (see Deferred Decisions) — no in-app deactivation flow exists in MVP scope to trigger it. The AG-UI SSE channel carries lifecycle events (`SESSION_STARTED`, `SESSION_READY`, `WORKING_TREE_DIRTY`, `WORKING_TREE_CLEAN`) as well as agent tokens — single connection for both. Working tree state is checked via `git status --porcelain` after Bash and file-write tool calls only; initial state is emitted as part of the session ready sequence. One sandbox : one conversation is an enforced invariant.
3. **Real-time SSE streaming** — affects the entire agent-to-browser event path: back-pressure (NFR-R3), 10 concurrent connections (NFR-R4), HTTP/2 requirement, AG-UI event classification (Tool Pills, Semantic Pills). sandbox-agent must be wrapped in a circuit-breaker: if it fails to emit events within a timeout, the backend emits a synthetic error event on the SSE channel. The SSE channel must emit heartbeat comments on a fixed interval so the browser detects dead connections even when sandbox-agent is stalled. **NFR-R3 back-pressure threshold (resolved 2026-06-17):** Each SSE connection maintains a per-connection bounded in-process event queue capped at **200 events**. If the queue reaches 200 events and has not drained within **30 seconds** (client is consuming too slowly), the backend emits a synthetic `STREAM_ERROR` event with payload `{ code: 'STREAM_BACK_PRESSURE' }` on the same SSE channel and closes the connection with a reconnect-eligible `200 + data: [DONE]` termination sequence. Silent event drops are never acceptable: any event that cannot be enqueued must trigger the `STREAM_ERROR` path, not be discarded. This gives QA a concrete pass/fail criterion: (a) no events silently dropped before the error event, and (b) the `STREAM_ERROR` event arrives within 30 s of queue saturation.
4. **OAuth token lifecycle** — encryption at storage, health monitoring, re-auth flow, credential failure propagation to UI — affects NestJS service layer, Next.js BFF, and frontend state.
5. **Git transport and commit attribution** — every Conversation requires sandbox-level git config injection (user identity from OAuth profile) before any agent turn. Manual commit (FR-15) is a platform-level operation executed via Daytona process execution API, not an agent action. Queued behind agent turn idle state in-process.
6. **LLM cost observability** — per-user spend tracking via SDK cost reporting must be wired into the NestJS agent backend from day one (NFR-O1). Budget alerting at launch is non-negotiable. **B-04 PM guidance (2026-06-17):** The alert threshold value (Q-2) depends on the PM finalizing the Daytona compute cost estimate and the unit economics floor. Based on the cost research (`technical-bmad-session-token-consumption-and-cost-claude-sonnet-4-6-research-2026-06-14.md`), a typical bmad-easy session costs approximately $0.40–$1.80 in Claude API spend (extended thinking is disabled per PRD §8, so the lower end applies: $0.40–$1.10/session). PM should set the per-user monthly alert threshold at a value that signals when a user's Claude spend is approaching the revenue margin floor for their seat price. A starting recommendation: alert at **$20/user/month** in Claude API spend (this leaves margin above the ~$10–15/user/month spend for 10–25 sessions, at $25–30/seat pricing). PM must confirm or revise this number before the cost-observability epic test design begins; it is the only remaining open item in B-04.
7. **Session persistence and recovery** — Conversations are always resumable (FR-13). Recovery must be transparent: sandbox re-initialization is hidden from the user behind a "Reconnecting…" indicator; chat history must be available immediately from platform storage, independent of sandbox state.
8. **Sandbox isolation risk (post-MVP hardening item):** Daytona Cloud Docker-level isolation is an accepted risk for MVP, premised on authenticated, non-adversarial users (A-2). No runtime abuse detection mechanism exists in MVP. **This must not be forgotten after launch.** The documented escalation trigger is: if adversarial use is detected, upgrade to Firecracker microVM isolation (Fly.io Sprites or Daytona OSS with VM backend). The architecture contains this migration within the `SandboxService` layer. Post-MVP hardening review should evaluate whether an abuse signal (e.g., anomalous tool call patterns, excessive resource usage per sandbox) can be added.

### Architectural Risk Findings (Elicitation Pass)

Surfaced through pre-mortem, cascading failure, and second-order analysis of the draft. These are constraints that Step 4's architectural decisions must satisfy — not yet designed, only identified.

**High severity:**

- **Runaway agent on sandbox-agent crash:** If sandbox-agent (the JSONL→AG-UI bridge) crashes, the Claude Code agent process inside the sandbox keeps running — making tool calls and potentially committing to the Repository — with no SSE listener observing it. The backend must terminate the agent process via the Daytona process management API when sandbox-agent dies, before emitting the error event to the user.
- **Missing frontend session-start timeout:** If `SESSION_READY` never arrives (e.g., Daytona 503 on provision), the "Starting session…" state has no client-side timeout and can spin indefinitely. A timeout distinct from the server-side idle timeout (ADR-A) is required, with a retry affordance.
- **Credential failure must propagate immediately to the active session:** A 403 on git push mid-Conversation currently only updates credential health on the next page load's git operation (per FR-4's letter, not its intent). The re-auth prompt must fire on the active Conversation's SSE channel the moment the failure is detected, not wait for the next navigation event. **Resolved in Step 6** (NFR-R1): `tool-pill-classifier.service.ts` detects the failure and emits a `CREDENTIAL_FAILURE` event on the existing SSE channel.

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

**Resolved — out of scope for MVP:**

- **Mid-session work loss on client disconnect (laptop close, network drop):** Raised during the party-mode architecture review. If a user closes their laptop mid-Conversation, in-progress agent work that has not been committed is not preserved. This is explicitly out of scope for MVP: NFR-R2 already states that uncommitted working tree state is not guaranteed to survive a Sandbox restart, and FR-15 (manual save) is the existing user-facing mitigation. No automatic persistence or resume-on-reconnect mechanism for in-flight agent/tool-call state is planned for MVP.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack SaaS + cloud infrastructure orchestration. Two deployed services in an Nx
monorepo, plus one external dynamic service (Daytona Cloud sandboxes).

### Deployed Services

| Service | Location | Deployment |
|---------|----------|------------|
| `apps/web` | Next.js 15 BFF + frontend | Vercel |
| `apps/agent-be` | NestJS agent orchestrator backend | Docker / Railway |
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
│   ├── web/                # Next.js 15 — BFF + frontend (Vercel)
│   └── agent-be/           # NestJS — agent orchestrator (Docker / Railway)
├── libs/
│   ├── shared-types/       # @bmad-easy/shared-types — shared TypeScript interfaces
│   └── database-schemas/   # @bmad-easy/database-schemas — shared Prisma schema
├── nx.json
├── package.json
└── tsconfig.base.json
```

`libs/shared-types` contains plain TypeScript artifacts shared across `apps/web` and
`apps/agent-be`: AG-UI event types, API request/response contracts, session and
conversation types, credential health status types. No database artifacts.

`libs/database-schemas` contains the Prisma schema and generated client shared across
`apps/web` and `apps/agent-be` — both services hold an independent Prisma client
instance (generated from this single schema source) and connect directly to the same
Railway Postgres database. Both are server-side runtimes (`apps/web`'s Next.js server
functions — API routes / Server Actions / Route Handlers — and `apps/agent-be`'s NestJS
process); the browser never holds a database credential or connection. A single shared
schema source eliminates the drift risk of maintaining two independently-edited Prisma
schemas against one database.

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

# 5. Shared Prisma schema library
nx generate @nx/js:lib database-schemas --directory=libs \
  --importPath=@bmad-easy/database-schemas --bundler=none
```

### Architectural Decisions Established by Starters

**Language:** TypeScript strict mode throughout — all apps and libs.

**`apps/web` (Next.js 15):** App Router, `src/` layout, `@/*` import alias,
Tailwind CSS, Turbopack dev server, ESLint.

**`apps/agent-be` (NestJS):** NestJS module pattern, Jest, ESLint + Prettier,
`nest-cli.json` build config.

**`libs/shared-types`:** Plain TypeScript, no bundler — resolved via path mappings
in `tsconfig.base.json`.

**`libs/database-schemas`:** Plain TypeScript, no bundler — holds the single Prisma
schema file and generated client, resolved via path mappings in `tsconfig.base.json`.
Migrations run from this library against the shared Railway Postgres instance.

### Key Packages Added Post-Scaffold

| Package | Version | Service | Note |
|---------|---------|---------|------|
| `next-auth` | `^5.0.0-beta.31` | `apps/web` | App Router-native (Auth.js v5 beta); v4 does not support App Router |
| `@assistant-ui/react-ag-ui` | `0.0.38` | `apps/web` | Pinned exact — pre-1.0 |
| `@ag-ui/client` | `0.0.55` | `apps/web` | Pinned exact — pre-1.0 |
| `@ag-ui/core` | `0.0.57` | `apps/web` + `apps/agent-be` | Pinned exact — pre-1.0 |
| `@anthropic-ai/claude-agent-sdk` | `0.3.177` | `apps/agent-be` | Pinned exact — pre-1.0 |
| `@daytonaio/sdk` | `0.187.0` | `apps/agent-be` | Pinned exact — pre-1.0 |
| `prisma` | `^7.8.0` | `libs/database-schemas` | ORM — schema + migrations live here, generated client consumed by both apps |
| `@prisma/client` | `^7.8.0` | `apps/web` + `apps/agent-be` | Each service holds its own client instance generated from the shared schema |
| `zod` | `^4.4.3` | `apps/web` + `apps/agent-be` | Validation library for both services — Server Action input validation in `apps/web`; request DTO validation in `apps/agent-be` |
| `nestjs-zod` | latest matching `zod ^4` | `apps/agent-be` | `createZodDto`/`ZodValidationPipe` integration — replaces `class-validator`/`class-transformer` for controller-boundary validation |

**Note:** Project initialization using these commands is the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- Single shared Prisma schema library (`libs/database-schemas`) for `apps/web` and `apps/agent-be` — eliminates schema drift structurally.
- Boundary JWT between `apps/web` and `apps/agent-be`, decoupled from Auth.js's internal session JWE; transported via `Authorization` header (REST) and query parameter (SSE).
- OAuth token at rest: per-user DEK + platform KEK envelope encryption (AES-256-GCM), KEK as a Railway env var for MVP.
- `apps/agent-be` is the sole initiating party toward Daytona/sandbox-agent — no separate sandbox-agent credential exists or is needed; Daytona's proxy/control-plane already authenticates every request via the existing Daytona API key.
- `apps/agent-be` hosting finalized as Railway (same platform as Postgres).
- `apps/web` never calls `apps/agent-be` server-to-server — all non-live data (Conversation history, Project Map, Artifact Browser) is read directly from Postgres by `apps/web`; only the live REST+SSE interaction is browser-direct to `apps/agent-be`.

**Important Decisions (Shape Architecture):**

- Live `user.active` DB check on every privileged `apps/agent-be` request — a JWT alone doesn't reflect live account state. This rejects the *next* request from a deactivated user, but it is a general request-authorization check, not a fulfillment of NFR-S3: it does not terminate an already-open SSE stream or running sandbox. NFR-S3 itself (active termination) is deferred to post-MVP — see Deferred Decisions.
- KEK rotation runbook documented; GCM nonce-uniqueness enforced.
- Daytona API key stored as a plain Railway environment secret, no rotation mechanism for MVP.
- Consistent JSON error envelope across `apps/agent-be`: `{ code, message, meta }`.
- `@nestjs/throttler` for simple rate limiting on `apps/agent-be`.
- No global client-state library in `apps/web`; Server Components/Server Actions read Postgres directly, local React state for ephemeral UI only.
- Draft message persistence via browser `localStorage`, keyed by `conversationId`, no server round-trip.
- No automatic/scoped client-side revalidation anywhere (Conversation pane, Project Map, Artifact Browser, SSE reconnect) — the user manually reloads the browser page to pick up fresh server-rendered state. This single mechanism also resolves SSE-reconnect-mid-session recovery (falls back to the existing cold-load path) and avoids any live-stream-vs-persisted-render duplication risk, since a full reload tears down the entire client tree before the Server Component re-fetches.
- shadcn/ui (Radix + Tailwind) as the frontend component library.
- CI (GitHub Actions): lint + all available test suites (unit/integration/e2e) gate the pipeline; deploy itself is a manual trigger, not automatic on merge.

**Deferred Decisions (Post-MVP):**

- KEK management migrates from a Railway env var to a third-party KMS.
- Daytona sandbox orphan cleanup: no enforced TTL/backstop; the system operator handles orphaned sandboxes manually for MVP.
- Postgres role separation: `apps/web` and `apps/agent-be` share one permissive DB role/credential; least-privilege role separation deferred.
- SSE/Conversation state durability across an `apps/agent-be` restart: in-memory Conversation→sandbox mapping loss on restart is acceptable degradation for MVP.
- Cross-tab staleness affordance (e.g. a "new activity" indicator on Project Map/Artifact Browser) and a one-time assistant-ui/AG-UI bundle-size sanity check — both optional, not blocking.
- Staging environment — production only for MVP.
- Log consolidation onto a single platform — platform-native logging (Railway/Vercel) for MVP.
- Horizontal scaling of `apps/agent-be` — out of scope until the single-container ceiling is actually reached.
- **NFR-S3 (active termination of an already-running sandbox/SSE session on deactivation) — deferred to post-MVP, not implemented:** MVP has no in-app deactivation flow (FR-19 enrolls all users with no expiry/billing enforcement), so there is no automatic enforcement mechanism that fires at all — `active-user.guard.ts` catches a deactivated user's *next* request, but nothing proactively terminates an already-open SSE stream or running sandbox. If deactivation happens today, it is an operator-performed DB flag flip, the same manual-ops pattern already accepted for sandbox orphan cleanup — the operator is expected to also terminate the Daytona sandbox out-of-band as part of that procedure. NFR-S3 becomes a non-deferrable, day-one requirement of whatever future story introduces an actual deactivate-user flow (e.g. a periodic re-check sweep over open SSE connections, or direct termination triggered by the deactivation action itself).

### Data Architecture

- **Database:** PostgreSQL, Railway-hosted (single instance for MVP).
- **Schema ownership:** a single shared Prisma schema/client library, `libs/database-schemas`, consumed independently by `apps/web` and `apps/agent-be` (full structural detail already recorded in Starter Template Evaluation → Monorepo Structure). This was the direct resolution to the schema-drift risk identified during Category 1 elicitation: maintaining two independently-edited Prisma schemas against one database was rejected as the root risk, not patched around.
- **Connection limits:** Railway's documented concurrent-connection ceiling is accepted as sufficient for MVP scale; if usage approaches the limit, the resolution is a commercial conversation with Railway, not an architectural change.
- **Library/version reliability:** Prisma is trusted as a foundational dependency; no defensive abstraction layer was added against ORM-level failure modes. Version upgrades follow the same pinned-version, deliberate-upgrade discipline already established for sandbox-agent and the AG-UI packages (see Technical Constraints) rather than floating versions.
- **Validation/migrations:** Migrations run from `libs/database-schemas` against the shared Railway Postgres instance (already recorded in Starter Template Evaluation).
- **Caching:** no caching layer for MVP — consistent with the "no client-side revalidation, no server-side data library" posture adopted in Frontend Architecture.

### Authentication & Security

1. **`apps/web` ↔ `apps/agent-be` identity crossing:** a separate, purpose-built boundary JWT, decoupled from Auth.js's internal JWE. Long-lived, re-minted per page load, no refresh cycle. Transport: `Authorization` header for REST, query parameter for SSE (`EventSource` cannot set headers). Requirement: logs must be sanitized to strip the token before being shipped anywhere.
2. **Live account-state check (general; NFR-S3 deferred separately):** a JWT alone doesn't reflect live account state, so `apps/agent-be` performs a live `user.active` check against Postgres on every privileged request, catching the next request from a deactivated user. NFR-S3's actual requirement — active termination of an already-open SSE stream or running sandbox — is deferred to post-MVP, not partially satisfied by this check (see Deferred Decisions).
3. **OAuth token at rest:** per-user DEK encrypts the GitHub OAuth token; a platform KEK wraps each DEK (envelope encryption), AES-256-GCM (NFR-S4). KEK stored as a Railway env var for MVP, migrating to a third-party KMS post-MVP. KEK rotation runbook documented; GCM nonce-uniqueness enforced.
4. **`apps/agent-be` ↔ Daytona/sandbox-agent transport:** no additional credential is needed beyond the Daytona API key `apps/agent-be` already holds. `apps/agent-be` is the sole initiating/active party — Daytona's proxy and control-plane authenticate and broker every interaction (process exec, log streaming) before it reaches a sandbox; sandbox-agent never opens an outbound connection back to `apps/agent-be`. The only implementation requirement is call correctness: every session/log-streaming call must be scoped to the sandboxId tied to the correct Conversation.
5. **Daytona API key:** stored as a plain Railway environment secret, no rotation mechanism for MVP.
6. **DB unavailability:** no fail-open/fail-closed logic; if Postgres is unreachable, the operation simply fails and the frontend surfaces an error.
7. **Daytona sandbox orphan cleanup:** not enforced for MVP; the system operator handles orphaned sandboxes manually. Post-MVP concern.
8. **Postgres role separation:** not enforced for MVP; `apps/web` and `apps/agent-be` share one permissive DB role/credential. Post-MVP concern.

### API & Communication Patterns

1. **API style:** plain REST/JSON NestJS controllers for `apps/agent-be`'s non-streaming endpoints, no additional typed-contract layer beyond what already exists in `libs/shared-types`.
2. **API documentation:** skipped for MVP — internal-only API, no third-party consumers.
3. **Error response format:** a consistent JSON error envelope across `apps/agent-be`: `{ code, message, meta }`, with `meta` available for context-specific detail (e.g. field-level validation errors, the org-restriction cause on a 403).
4. **Rate limiting:** `@nestjs/throttler`, simple global/per-route limits, no per-tenant tiering for MVP.
5. **`apps/web` ↔ `apps/agent-be` communication:** no server-to-server path. The browser connects directly to `apps/agent-be` for the live REST+SSE interaction (start/resume a session, the AG-UI event stream); `apps/web` independently reads Conversation history, Project Map, and Artifact Browser data straight from Postgres via the shared Prisma client. `apps/agent-be` writes each turn/session-state update to Postgres as it processes it.

### Frontend Architecture

1. **State management:** no global client-state library. Server Components/Server Actions handle server data via direct Prisma reads; local React state covers ephemeral UI only (Tool Pill expansion, draft text, optimistic echo of a user's own outbound chat message before the persisted version reconciles).
2. **Data fetching:** plain Server Component Prisma reads; no React Query/SWR.
3. **Component library:** shadcn/ui (Radix + Tailwind).
4. **Routing:** conventional nested Next.js App Router layout — no parallel or intercepting routes for MVP.
5. **Refresh/staleness model:** no automatic or scoped client-side revalidation anywhere — the user manually reloads the browser page to see updated server-rendered state (Conversation pane, Project Map, Artifact Browser). This single, deliberately simple mechanism also covers SSE-reconnect-mid-session recovery (falls back to the existing FR-13 cold-load path from Postgres) and eliminates any risk of the live-SSE-rendered view and the Postgres-backed Server Component render visibly disagreeing or flashing, since a full page reload tears down the entire client tree (including assistant-ui's internal runtime) before the fresh server render occurs.
6. **Draft message persistence:** browser `localStorage`, keyed by `conversationId`, no server round-trip.
7. **Performance/bundle optimization:** deferred as a non-concern for MVP — Next.js defaults only (route-based code splitting, Server Components shipping zero client JS by default).

### Infrastructure & Deployment

- **`apps/web`:** Vercel.
- **`apps/agent-be`:** Railway (Docker), same platform as the shared Postgres instance.
- **CI/CD:** GitHub Actions runs lint + all available test suites (unit/integration/e2e) as a gate; deploy is a manual trigger, not automatic on merge.
- **Environments:** production only for MVP, no separate staging.
- **Monitoring & logging:** platform-native logging (Railway/Vercel) for MVP, plus the already-mandated NFR-O1 per-user LLM spend monitoring with budget alerting wired in from day one. Log consolidation onto a single platform is a post-MVP consideration.
- **Scaling:** single-container ceiling for `apps/agent-be` is accepted for MVP (no horizontal scaling, no distributed session registry); reaching the ceiling requires horizontal scaling work that is explicitly out of scope until needed.
- **Deployment invariants already locked:** `apps/agent-be` must be fronted by an HTTP/2-capable reverse proxy (NFR-R4); NestJS shutdown hooks must drain SSE connections on deploy rather than hard-killing them (single-container constraint).

### Decision Impact Analysis

**Implementation Sequence:**

1. Scaffold the Nx workspace; generate `libs/shared-types` and `libs/database-schemas`.
2. Provision Railway Postgres; define the Prisma schema in `libs/database-schemas`; run initial migration.
3. Stand up `apps/agent-be` on Railway (Docker); wire the shared Prisma client.
4. Implement Auth.js in `apps/web`; mint the boundary JWT for `apps/agent-be` crossing.
5. Implement the `user.active` live-check guard and the JSON error envelope (`{ code, message, meta }`) in `apps/agent-be`.
6. Wire OAuth token envelope encryption (per-user DEK + Railway-env-var KEK, AES-256-GCM) into the GitHub OAuth flow.
7. Integrate the Daytona SDK in `apps/agent-be` (API key as a Railway secret); implement sandbox provisioning and the pull-based session/log-streaming call pattern toward sandbox-agent.
8. Wire AG-UI event proxying over SSE from `apps/agent-be` to the browser, including the circuit-breaker and heartbeat mitigations already specified in Cross-Cutting Concerns.
9. Build the `apps/web` frontend: Server Component reads of Conversation/Project Map/Artifact Browser data, assistant-ui integration seeded from those reads, `localStorage`-based draft persistence, manual-reload-based refresh.
10. Add `@nestjs/throttler` rate limiting to `apps/agent-be`'s REST endpoints.
11. Configure GitHub Actions CI (lint + test gates) and the manual deploy process for both services.
12. Verify launch-checklist deployment invariants (HTTP/2 proxy in front of `apps/agent-be`, NFR-O1 cost monitoring and budget alerts live).

**Cross-Component Dependencies:**

- The boundary JWT (Auth & Security #1) depends on Auth.js being wired in `apps/web` first, and is a prerequisite for any browser→`apps/agent-be` call (API & Communication #5).
- OAuth token envelope encryption depends on the KEK's storage location, which depends on `apps/agent-be`'s hosting platform being finalized as Railway (Infrastructure & Deployment).
- The Daytona-transport authentication model (Auth & Security #4) depends on `apps/agent-be` correctly scoping every session/log call to the right sandboxId — a code-correctness requirement, not a separate credential, so it must be covered by tests rather than additional auth wiring.
- The frontend's manual-reload refresh model (Frontend Architecture #5) depends on the data split established in API & Communication #5 (`apps/web` reading Postgres directly) — if that split ever changes, the refresh model must be re-evaluated.
- CI test gates (Infrastructure & Deployment) depend on the test suites referenced in Implementation Sequence existing; until they exist, the "pass any tests we have" gate is a no-op by construction, not a bypass.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 11 areas where AI agents could make different choices.

### Naming Patterns

**Database Naming Conventions:**
- Prisma models: PascalCase singular (`User`, `Conversation`, `RepoConnection`), mapped to snake_case plural tables via `@@map` (e.g. `@@map("users")`).
- Columns: camelCase in the Prisma schema, mapped to snake_case via `@map` (e.g. `userId @map("user_id")`) — the standard Prisma idiom. TypeScript-facing code stays camelCase; the SQL schema stays snake_case.

**API Naming Conventions:**
- REST endpoints: plural nouns (`/conversations`, `/conversations/:id/turns`).
- Route params: NestJS `:id` style.
- JSON field naming: camelCase throughout — matches TS end-to-end, no case-translation layer between Prisma/TS and API payloads.

**Code Naming Conventions:**
- Component files: PascalCase (`ConversationPane.tsx`).
- Non-component files (routes, utils, configs): kebab-case (`conversation-service.ts`).
- Functions/variables: camelCase. Classes/types/interfaces: PascalCase.

### Structure Patterns

**Project Organization:**
- Tests co-located with source (`*.spec.ts` / `*.test.tsx` next to the file under test) — no separate `__tests__/` tree.
- `apps/web` components organized by feature, flat hierarchy (`components/conversation/`, `components/project-map/`, `components/artifact-browser/`), not by type. Accepted trade-off: if features develop cross-dependencies later this may need revisiting, but flat-by-feature is the simpler MVP default.
- Shared utilities are app-local (`apps/web/src/lib`, `apps/agent-be/src/common`) — no shared utility library beyond `libs/shared-types` (types only) and `libs/database-schemas` (Prisma schema/client). A new shared `libs/` package is only justified by a genuine cross-service need, following the same precedent as `libs/database-schemas`.

### Format Patterns

**API Response Formats:**
- Success: raw resource body, no `{ data: ... }` wrapper.
- Error: `{ code, message, meta }` (already locked in Core Architectural Decisions).
- Date/time in JSON: ISO 8601 strings.

**Data Exchange Formats:**
- JSON field naming: camelCase (see API Naming Conventions).

### Communication Patterns

**Event System Patterns:**
- AG-UI event naming/payload structure is fixed externally by the AG-UI protocol spec — not a project-level decision.

**State Management Patterns:**
- Already locked in Frontend Architecture: no global client-state library; local React state for ephemeral UI only.

### Process Patterns

**Error Handling Patterns:**
- `apps/agent-be`: a global NestJS exception filter maps every thrown error — including Zod validation failures via `nestjs-zod` — to the `{ code, message, meta }` envelope.
- `apps/web`: Server Actions validate input with Zod; validation failures surface as form/field errors, not the `apps/agent-be` envelope (different layer, different consumer).

**Validation Patterns:**
- `apps/agent-be`: Zod schemas via `nestjs-zod` (`createZodDto` + `ZodValidationPipe`) at controller boundaries — replaces `class-validator`/`class-transformer` entirely.
- `apps/web`: Zod schemas validate Server Action input directly.
- One validation library across both services, consistent with the "one shared schema source" philosophy already applied to the database layer.

**Logging Patterns:**
- Structured JSON logs in `apps/agent-be` (queryable in Railway's log search).
- Levels: `debug`, `info`, `warn`, `error` — standard four-level scheme, no custom levels.

### Enforcement Guidelines

**All AI Agents MUST:**

- Use Zod (`nestjs-zod` in `apps/agent-be`) for all input validation — never `class-validator`/`class-transformer`.
- Return raw resource bodies on success and the `{ code, message, meta }` envelope on error from every `apps/agent-be` endpoint.
- Use camelCase for every JSON field, every Prisma-schema-facing identifier, and every TypeScript identifier; snake_case only appears at the SQL column/table level via `@map`/`@@map`.
- Co-locate tests with source; never create a parallel `__tests__/` tree.
- Organize `apps/web` components by feature, not by type.
- Never add a new shared `libs/` package without the same justification already applied to `libs/database-schemas` (a genuine cross-service need, not speculative reuse).

**Pattern Enforcement:**

- Verified via code review and lint rules where mechanically enforceable (e.g. ESLint naming conventions, `nestjs-zod` usage).
- Pattern violations or ambiguities get documented as an addendum to this section, not silently special-cased.
- Any future change to these patterns is a deliberate architecture-doc update, not implicit per-PR drift.

### ISandboxService Contract (B-01 Test Seam)

`libs/shared-types/src/sandbox.interface.ts` defines the interface that both `sandbox.service.ts` (production) and `sandbox.service.fake.ts` (test-only) implement. Backend lead must deliver this interface and the fake before `sandbox.service.ts` is written; QA wires the fake into test modules via a NestJS DI token.

```typescript
// libs/shared-types/src/sandbox.interface.ts

export interface ProvisionParams {
  conversationId: string;
  repoUrl: string;
  credential: string;
}

export interface SandboxInfo {
  sandboxId: string;
  status: 'running' | 'stopped';
}

export interface GitUserConfig {
  name: string;
  email: string;
}

export interface WorkingTreeStatus {
  dirty: boolean;
  files: string[];
}

export interface ISandboxService {
  provision(params: ProvisionParams): Promise<SandboxInfo>;
  clone(sandboxId: string, repoUrl: string, credential: string): Promise<void>;
  resume(sandboxId: string): Promise<SandboxInfo>;
  destroy(sandboxId: string): Promise<void>;
  injectGitConfig(sandboxId: string, config: GitUserConfig): Promise<void>;
  getWorkingTreeStatus(sandboxId: string): Promise<WorkingTreeStatus>;
  terminateProcess(sandboxId: string, processId: string): Promise<void>;
}

export const SANDBOX_SERVICE = Symbol('ISandboxService');
```

`SandboxServiceFake` must support controllable failure injection on any method (e.g. `fake.simulateProvisionFailure()`), deterministic timing (no real sleeps), and capture of call arguments for assertion. It is the canonical test double for all Conversation-path integration tests.

### Pattern Examples

**Good Examples:**

- `apps/agent-be/src/conversations/conversations.controller.ts` returning `{ id, title, createdAt, ... }` directly on success.
- `model Conversation { id String @id; userId String @map("user_id"); @@map("conversations") }`.

**Anti-Patterns:**

- Wrapping success responses in `{ data: {...} }` "for consistency" with the error envelope — explicitly rejected.
- Mixing `class-validator` DTOs into a service that's supposed to be all-Zod.
- A new top-level `libs/utils` created speculatively, "in case it's needed by both services."

## Project Structure & Boundaries

### Complete Project Directory Structure

```
bmad-easy/
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── nx.json
├── tsconfig.base.json
├── .env.example
├── .github/
│   └── workflows/
│       └── ci.yml                              # lint + unit/integration/e2e gate, manual deploy trigger
├── apps/
│   ├── web/                                    # Next.js 15 — BFF + frontend (Vercel)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── globals.css
│   │   │   │   ├── page.tsx                    # landing / redirect to dashboard
│   │   │   │   ├── middleware.ts                # Auth.js session guard
│   │   │   │   ├── api/
│   │   │   │   │   └── auth/
│   │   │   │   │       └── [...nextauth]/
│   │   │   │   │           └── route.ts         # Auth.js v5 route handler (FR-18)
│   │   │   │   ├── sign-in/
│   │   │   │   │   └── page.tsx                 # GitHub OAuth sign-in (FR-18)
│   │   │   │   └── (dashboard)/
│   │   │   │       ├── layout.tsx               # authenticated shell, nav, repo connection status
│   │   │   │       ├── onboarding/
│   │   │   │       │   └── page.tsx             # Repository URL input (FR-1), init validation (FR-2)
│   │   │   │       ├── project-map/
│   │   │   │       │   └── page.tsx             # FR-6/7/8 — Server Component, direct Prisma read
│   │   │   │       ├── conversations/
│   │   │   │       │   ├── page.tsx             # conversation list (FR-11)
│   │   │   │       │   └── [conversationId]/
│   │   │   │       │       └── page.tsx         # FR-9/10/12/13/14/15
│   │   │   │       └── artifacts/
│   │   │   │           └── [artifactId]/
│   │   │   │               └── page.tsx         # FR-16/17 — Server Component, direct Prisma read
│   │   │   ├── components/
│   │   │   │   ├── ui/                          # shadcn/ui primitives
│   │   │   │   ├── onboarding/
│   │   │   │   │   ├── RepositoryUrlForm.tsx
│   │   │   │   │   └── RepositoryUrlForm.test.tsx
│   │   │   │   ├── project-map/
│   │   │   │   │   ├── ProjectMapTree.tsx
│   │   │   │   │   └── RefreshButton.tsx        # FR-7 — triggers full browser reload
│   │   │   │   ├── conversation/
│   │   │   │   │   ├── ConversationPane.tsx      # assistant-ui + direct browser→agent-be AG-UI SSE
│   │   │   │   │   ├── ToolPill.tsx              # FR-12
│   │   │   │   │   ├── SemanticPill.tsx          # FR-12 — "Progress saved"
│   │   │   │   │   ├── WorkingTreeIndicator.tsx  # FR-14
│   │   │   │   │   ├── ManualCommitButton.tsx    # FR-15 — direct fetch to apps/agent-be
│   │   │   │   │   └── useDraftPersistence.ts    # localStorage hook, keyed by conversationId
│   │   │   │   └── artifact-browser/
│   │   │   │       ├── ArtifactViewer.tsx
│   │   │   │       └── ArtifactAccessLink.tsx    # FR-17
│   │   │   ├── lib/
│   │   │   │   ├── auth.ts                       # Auth.js v5 config
│   │   │   │   ├── prisma.ts                     # Prisma client from libs/database-schemas
│   │   │   │   ├── boundary-jwt.ts                # mints JWT for apps/agent-be crossing
│   │   │   │   └── utils.ts
│   │   │   ├── actions/                          # Server Actions, Zod-validated
│   │   │   │   └── repo-connection.actions.ts     # FR-1..FR-5
│   │   │   └── types/
│   │   ├── public/
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── .env.example
│   └── agent-be/                               # NestJS — agent orchestrator (Docker / Railway)
│       ├── src/
│       │   ├── main.ts                          # bootstrap, HTTP/2-aware adapter, SSE-drain shutdown hooks
│       │   ├── app.module.ts
│       │   ├── config/
│       │   │   ├── configuration.ts              # DB url, KEK, Daytona API key, JWT secret, throttler limits
│       │   │   └── env.validation.ts             # Zod-validated env schema
│       │   ├── common/
│       │   │   ├── filters/
│       │   │   │   └── http-exception.filter.ts   # global filter → { code, message, meta }
│       │   │   ├── guards/
│       │   │   │   ├── boundary-jwt.guard.ts        # validates apps/web-issued JWT, extracts userId
│       │   │   │   └── active-user.guard.ts         # request-scoped: fetches User row from Postgres by userId, rejects if !active (general check; NFR-S3 active termination is deferred, see Deferred Decisions), attaches to request.user
│       │   │   ├── interceptors/
│       │   │   │   └── logging.interceptor.ts       # structured JSON logs
│       │   │   ├── decorators/
│       │   │   │   └── user.decorator.ts            # @User() param decorator — reads request.user
│       │   │   └── types/
│       │   │       └── user-context.type.ts         # UserContext interface (id, email, githubLogin, active, ...)
│       │   ├── prisma/
│       │   │   └── prisma.service.ts              # Prisma client from libs/database-schemas
│       │   ├── auth/
│       │   │   ├── auth.module.ts
│       │   │   └── boundary-jwt.strategy.ts
│       │   ├── credentials/
│       │   │   ├── credentials.module.ts
│       │   │   ├── credentials.service.ts         # decrypts OAuth token for git operations
│       │   │   └── encryption.service.ts          # AES-256-GCM, DEK/KEK envelope
│       │   ├── repo-connection/                   # FR-1, FR-2, FR-3, FR-4, FR-5
│       │   │   ├── repo-connection.module.ts
│       │   │   ├── repo-connection.controller.ts
│       │   │   ├── repo-connection.service.ts
│       │   │   └── dto/
│       │   │       └── connect-repository.dto.ts  # Zod schema via createZodDto
│       │   ├── sandbox/                           # Daytona orchestration
│       │   │   ├── sandbox.module.ts
│       │   │   ├── sandbox.service.ts             # implements ISandboxService from libs/shared-types; mandatory --depth=1 shallow clone on provision
│       │   │   ├── sandbox.service.fake.ts        # SandboxServiceFake — test-only; implements ISandboxService; injected via NestJS DI token in test modules; supports controllable failure injection (B-01 test seam)
│       │   │   ├── daytona-client.provider.ts
│       │   │   └── working-tree.service.ts        # git status --porcelain, FR-14
│       │   ├── conversations/                     # FR-9, FR-10, FR-11, FR-13
│       │   │   ├── conversations.module.ts
│       │   │   ├── conversations.controller.ts
│       │   │   ├── conversations.service.ts
│       │   │   └── dto/
│       │   │       └── create-conversation.dto.ts
│       │   ├── streaming/                         # SSE + AG-UI event proxy
│       │   │   ├── streaming.module.ts
│       │   │   ├── streaming.controller.ts        # SSE endpoint, JWT via query param
│       │   │   ├── agui-event-bridge.service.ts    # JSONL→AG-UI passthrough, circuit breaker, heartbeat
│       │   │   └── tool-pill-classifier.service.ts # FR-12 — promotes commits to Semantic Pills
│       │   ├── manual-commit/                     # FR-15
│       │   │   ├── manual-commit.module.ts
│       │   │   ├── manual-commit.controller.ts
│       │   │   └── manual-commit.service.ts
│       │   ├── artifacts/                         # FR-6, FR-7, FR-8, FR-16, FR-17 — Postgres cache, read by apps/web
│       │   │   ├── artifacts.module.ts
│       │   │   └── artifacts.service.ts           # scans _bmad-output/ post-commit, upserts metadata + content
│       │   ├── users/                             # FR-18, FR-19
│       │   │   ├── users.module.ts
│       │   │   └── users.service.ts
│       │   └── cost-tracking/
│       │       ├── cost-tracking.module.ts
│       │       └── cost-tracking.service.ts        # NFR-O1 — SDK cost reporting, budget alerts
│       ├── test/
│       │   └── e2e/
│       ├── Dockerfile
│       ├── nest-cli.json
│       ├── tsconfig.json
│       ├── package.json
│       └── .env.example
├── libs/
│   ├── shared-types/                            # @bmad-easy/shared-types
│   │   └── src/
│   │       ├── index.ts
│   │       ├── ag-ui.types.ts
│   │       ├── conversation.types.ts
│   │       ├── artifact.types.ts
│   │       ├── credential-health.types.ts
│   │       └── sandbox.interface.ts             # ISandboxService — the test-seam contract (B-01); sandbox.service.ts implements it; SandboxServiceFake (test only) implements the same interface
│   └── database-schemas/                        # @bmad-easy/database-schemas
│       └── src/
│           ├── index.ts                          # exported Prisma client factory
│           └── prisma/
│               ├── schema.prisma
│               └── migrations/
```

*(Test files are co-located per the Naming/Structure Patterns above — `RepositoryUrlForm.test.tsx` above is illustrative; every other listed source file gets its sibling `*.spec.ts`/`*.test.tsx` the same way, omitted for brevity.)*

### Architectural Boundaries

**API Boundaries:**
- Browser ↔ `apps/agent-be`: REST (repo connection, conversation create/resume, manual commit) + SSE (AG-UI stream), boundary JWT via `Authorization` header (REST) / query param (SSE). This is the *only* path into `apps/agent-be`.
- `apps/web` Server Actions: Zod-validated, scoped to `repo-connection.actions.ts` only — no other Server Action calls out.
- `apps/agent-be` → Daytona: pull-only via `@daytonaio/sdk`, scoped to `sandboxId`/Conversation; no inbound calls accepted from sandbox-agent.
- Authenticated request context: `boundary-jwt.guard.ts` validates the JWT and resolves `userId`; `active-user.guard.ts` (runs after, request-scoped) fetches the live `User` row from Postgres, rejects with `403` if `!active`, and attaches the row to `request.user`. Controllers never query `User` themselves — they consume it via `@User() user: UserContext`. This is the single point where the live `user.active` check happens; no controller or service re-implements it. This check is general request authorization, not a fulfillment of NFR-S3 — NFR-S3's active-termination requirement is deferred to post-MVP (see Deferred Decisions).
- Credential failure propagation (NFR-R1): `tool-pill-classifier.service.ts` inspects git-related tool call results from the sandbox-agent JSONL stream for 401/403 patterns; on detection it (a) calls `credentials.service.ts` to persist the failed health status, and (b) emits a synthetic `CREDENTIAL_FAILURE` event on the same SSE channel already carrying AG-UI events — no new transport. `apps/web`'s conversation UI (and the `(dashboard)/layout.tsx` repo-connection-status indicator, for the next page load) render the re-auth prompt from that status.

**Component Boundaries:**
- `apps/web/src/components/conversation/*`: client components — own the live SSE connection, Tool/Semantic Pills, working tree indicator, manual commit, draft persistence.
- `apps/web/src/components/project-map/*` and `artifact-browser/*`: rendered from Server Component Prisma reads, no client-side data fetching.
- No shared client-state boundary crossing — each feature directory owns its own local state.

**Service Boundaries:**
- `apps/web` and `apps/agent-be` are independently deployable; the only coupling is the shared Postgres schema (`libs/database-schemas`) and the boundary-JWT trust relationship. No server-to-server REST contract exists between them.

**Data Boundaries:**
- Postgres is the single schema boundary (`libs/database-schemas`), written by `apps/agent-be` (conversations, turns, artifacts, credential health), read directly by `apps/web`.
- The Daytona sandbox filesystem/git state is the live source of truth during an active Conversation; `apps/agent-be/src/artifacts/artifacts.service.ts` is the sole boundary that mirrors it into Postgres, at commit-time.

### Requirements to Structure Mapping

**Feature/FR-Category Mapping:**

| FR Category | apps/web | apps/agent-be |
|---|---|---|
| Repository Connection & Onboarding (FR-1–5) | `app/(dashboard)/onboarding/`, `components/onboarding/`, `actions/repo-connection.actions.ts` | `repo-connection/`, `credentials/` |
| Project Map (FR-6–8) | `app/(dashboard)/project-map/`, `components/project-map/` | `artifacts/` (writes), `sandbox/working-tree.service.ts` |
| Conversations (FR-9–15) | `app/(dashboard)/conversations/`, `components/conversation/` | `conversations/`, `sandbox/`, `streaming/`, `manual-commit/` |
| Artifact Browser (FR-16–17) | `app/(dashboard)/artifacts/`, `components/artifact-browser/` | `artifacts/` |
| Authentication & Access Control (FR-18–19) | `app/sign-in/`, `app/api/auth/`, `lib/auth.ts`, `middleware.ts` | `auth/`, `users/`, `common/guards/` |

**Cross-Cutting Concerns:**
- Multi-tenant credential isolation → `apps/agent-be/src/credentials/`, enforced by `active-user.guard.ts` on every privileged route.
- Sandbox lifecycle → `apps/agent-be/src/sandbox/`.
- LLM cost observability (NFR-O1) → `apps/agent-be/src/cost-tracking/`.

### Integration Points

**Internal Communication:**
- Browser → `apps/agent-be` (REST + SSE), boundary JWT.
- `apps/web` Server Components → Postgres (Prisma), direct.
- `apps/agent-be` → Postgres (Prisma), writes turn/session/artifact state.

**External Integrations:**
- GitHub OAuth — Auth.js v5 in `apps/web` (`lib/auth.ts`).
- Daytona Cloud SDK — `apps/agent-be/src/sandbox/daytona-client.provider.ts`.
- Claude Agent SDK + sandbox-agent — run inside the Daytona sandbox; pulled by `apps/agent-be/src/streaming/agui-event-bridge.service.ts`.

**Data Flow:**
User message (browser) → `conversations.controller.ts` → sandbox process exec (Claude Code agent) → sandbox-agent JSONL → `agui-event-bridge.service.ts` → SSE → browser. In parallel, `apps/agent-be` persists turn/session updates and, on detected commits, `artifacts.service.ts` syncs Artifact metadata + content into Postgres — which `apps/web`'s Server Components read on the next page load or manual reload.

### File Organization Patterns

- Tests co-located with source (`*.spec.ts`/`*.test.tsx`), no `__tests__/` tree.
- `apps/web` components organized by feature, flat (`components/conversation/`, not `components/chat/messages/`).
- Shared utilities app-local (`apps/web/src/lib`, `apps/agent-be/src/common`); no new `libs/` package without genuine cross-service need.
- PascalCase component files, kebab-case everything else, camelCase functions/variables.

### Development Workflow Integration

**Development Server Structure:** `nx serve web` and `nx serve agent-be` run independently; both connect to the shared Railway Postgres instance (or a local Postgres for offline dev — developer's choice, not enforced).

**Build Process Structure:** `nx build <app>` per app. `libs/database-schemas` generates the Prisma client as a build step consumed by both. `apps/agent-be`'s Dockerfile pins the sandbox-agent binary version and Node version per the existing upgrade-discipline decision.

**Deployment Structure:** Vercel builds `apps/web` from the Nx monorepo (root directory `apps/web`); Railway builds `apps/agent-be`'s Dockerfile. Both deploys are manually triggered, gated by the GitHub Actions lint/test workflow.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All technology choices are mutually compatible — Next.js 15/Auth.js v5 beta/Tailwind/shadcn/assistant-ui on the frontend; NestJS/Zod+nestjs-zod/Prisma/Daytona SDK/Claude Agent SDK on the backend; one shared Prisma schema eliminating drift. Every pre-1.0 package (`@assistant-ui/react-ag-ui`, `@ag-ui/client`, `@ag-ui/core`, `@anthropic-ai/claude-agent-sdk`, `@daytonaio/sdk`) follows the same pinned-exact-version, deliberate-upgrade discipline. No contradictory decisions remain — the one found during this validation pass (NFR numbering drift against the PRD, and the "closes the gap" overstatement for NFR-S3) has been corrected directly in the sections above.

**Pattern Consistency:** Step 5's naming/structure/format/communication/process patterns are reflected exactly in Step 6's tree — camelCase JSON fields, PascalCase components, kebab-case services, co-located tests, flat-by-feature `apps/web` components, Zod/`nestjs-zod` at every `apps/agent-be` controller boundary, `{ code, message, meta }` error envelope, raw success bodies.

**Structure Alignment:** The Step 6 structure enforces every locked boundary: `apps/web` never calls `apps/agent-be` server-to-server (browser-direct REST+SSE only); `apps/agent-be` is the sole Daytona-credential holder; the boundary-JWT + `active-user.guard.ts` + `@User()` decorator chain is the single authenticated-context path, with no controller re-implementing it.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:** All 19 FRs across the 5 PRD feature areas map to a specific directory in both services (see Step 6's Feature/FR-Category Mapping table). No FR is unaddressed.

**Non-Functional Requirements Coverage:**
- Performance (NFR-P1–P5): addressed — no-buffering SSE, page-open provisioning, Postgres-cached Project Map/Artifact reads, platform-level manual commit.
- Reliability (NFR-R1–R4): NFR-R1 (credential health propagation) now has a structural home (`tool-pill-classifier.service.ts` → `CREDENTIAL_FAILURE` SSE event), added during this validation pass. NFR-R2–R4 already covered (session recovery via FR-13 cold-load, back-pressure, HTTP/2 + circuit breaker/heartbeat).
- Security (NFR-S1–S4): NFR-S1/S2 covered (Daytona-only credential exposure, tenant-scoped credential lookups via `credentials.service.ts`). NFR-S3 (active termination on deactivation) is **explicitly deferred to post-MVP** — no automatic enforcement mechanism fires at all in MVP scope, since no in-app deactivation flow exists to trigger one (see Deferred Decisions). NFR-S4 (OAuth token storage) fully covered (envelope encryption).
- Observability (NFR-O1): covered (`cost-tracking.service.ts`, wired from day one).

### Implementation Readiness Validation ✅

**Decision Completeness:** All critical/important/deferred decisions are documented with versions where applicable, and every deferred item carries its rationale (manual ops handling, post-MVP migration triggers).

**Structure Completeness:** Complete, specific directory trees for both apps and both libs — no generic placeholders. Every module maps to a named FR category or cross-cutting concern.

**Pattern Completeness:** All 11 originally identified conflict points are resolved with concrete examples and anti-patterns; the two gaps surfaced in this validation pass (NFR-R1 structural home, NFR numbering) are now resolved/corrected directly in the document.

### Gap Analysis Results

**Critical Gaps — Resolved during this validation pass:**
- NFR numbering drift between this document's Requirements Overview table and the PRD's actual `NFR-S1`–`S4` numbering — corrected.
- NFR-R1 (credential health propagation) had no structural home — assigned to `tool-pill-classifier.service.ts` + `CREDENTIAL_FAILURE` SSE event.
- NFR-S3 (active termination on deactivation): the document overstated that the live `user.active` guard "closes" this gap. Corrected: NFR-S3 is explicitly deferred to post-MVP and not implemented — there is no automatic enforcement mechanism, since no in-app deactivation flow exists in MVP scope to trigger one. It becomes a non-deferrable, day-one requirement of whatever future story introduces an actual deactivate-user flow.

**Important Gaps — Addressed by existing structure (clarified, not requiring new files):**
- FR-11 (10 concurrent Conversations/user): enforced in `conversations.service.ts` before provisioning a new sandbox.
- Sandbox idle timeout (60s default, Technical Constraints): owned by `sandbox.service.ts`.
- Per-user sandbox provision queue (GitHub OAuth rate-limit burst protection, Medium severity risk finding): owned by `sandbox.service.ts`, 2–3 concurrent provision cap.
- Sandbox provision failure cleanup (Medium severity risk finding): owned by `sandbox.service.ts`'s `provision()` error path.

**Nice-to-Have Gaps (not addressed, explicitly deferred):**
- GitHub org OAuth-restriction self-service link/admin notification — no UI affordance assigned; Low severity, deferred.
- Conversation history retention/archival policy — `last_active_at` schema field intent recorded, no archival mechanism; explicitly out of scope until needed.

### Validation Issues Addressed

Two issues were raised and resolved collaboratively during this step: (1) the NFR-S3 active-termination gap — resolved by deferring NFR-S3 to post-MVP outright (no automatic enforcement mechanism in MVP scope, since no in-app deactivation flow exists to trigger one), rather than claiming partial coverage; the manual-ops pattern already applied to sandbox orphan cleanup covers the operator-driven path until then; (2) the NFR-R1 structural home — resolved by extending the existing SSE channel rather than introducing new transport. Both resolutions are now reflected in the relevant sections above rather than left as open findings.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY WITH MINOR GAPS

**Confidence Level:** High — all Critical Gaps found during validation were resolved within this step; the remaining open items are explicitly deferred to post-MVP (NFR-S3 active termination on deactivation) or explicitly deferred Nice-to-Have items, not unknowns.

**Key Strengths:**
- Every architectural decision traces to a specific NFR, FR, or risk finding — no speculative decisions.
- Single shared Prisma schema and single validation library (Zod) eliminate two classes of drift structurally rather than by convention.
- The manual-reload refresh model collapses two previously separate problems (SSE-reconnect recovery, live/persisted-render duplication) into one mechanism.
- Deferred decisions are consistently justified by actual MVP scope constraints (no admin UI, no staging budget, single-container ceiling), not omission.

**Areas for Future Enhancement:**
- NFR-S3 (active termination on deactivation) — deferred to post-MVP; becomes a day-one requirement of any future deactivate-user flow.
- Daytona sandbox orphan cleanup automation.
- Postgres role separation (least-privilege).
- Cross-tab staleness affordance for Project Map/Artifact Browser.

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented.
- Use implementation patterns consistently across all components.
- Respect project structure and boundaries.
- Refer to this document for all architectural questions.

**First Implementation Priority:**
Scaffold the Nx workspace via the Initialization Commands in Starter Template Evaluation (`npx create-nx-workspace@latest bmad-easy --preset=empty --packageManager=pnpm`, then generate `apps/web`, `apps/agent-be`, `libs/shared-types`, `libs/database-schemas`), per Decision Impact Analysis's Implementation Sequence step 1.
