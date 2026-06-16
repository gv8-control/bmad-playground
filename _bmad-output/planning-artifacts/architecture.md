---
stepsCompleted: [1, 2, 3, 4, 5]
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

- Live `user.active` DB check on every privileged `apps/agent-be` request (closes the NFR-S4 gap a JWT alone can't cover).
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

### Data Architecture

- **Database:** PostgreSQL, Railway-hosted (single instance for MVP).
- **Schema ownership:** a single shared Prisma schema/client library, `libs/database-schemas`, consumed independently by `apps/web` and `apps/agent-be` (full structural detail already recorded in Starter Template Evaluation → Monorepo Structure). This was the direct resolution to the schema-drift risk identified during Category 1 elicitation: maintaining two independently-edited Prisma schemas against one database was rejected as the root risk, not patched around.
- **Connection limits:** Railway's documented concurrent-connection ceiling is accepted as sufficient for MVP scale; if usage approaches the limit, the resolution is a commercial conversation with Railway, not an architectural change.
- **Library/version reliability:** Prisma is trusted as a foundational dependency; no defensive abstraction layer was added against ORM-level failure modes. Version upgrades follow the same pinned-version, deliberate-upgrade discipline already established for sandbox-agent and the AG-UI packages (see Technical Constraints) rather than floating versions.
- **Validation/migrations:** Migrations run from `libs/database-schemas` against the shared Railway Postgres instance (already recorded in Starter Template Evaluation).
- **Caching:** no caching layer for MVP — consistent with the "no client-side revalidation, no server-side data library" posture adopted in Frontend Architecture.

### Authentication & Security

1. **`apps/web` ↔ `apps/agent-be` identity crossing:** a separate, purpose-built boundary JWT, decoupled from Auth.js's internal JWE. Long-lived, re-minted per page load, no refresh cycle. Transport: `Authorization` header for REST, query parameter for SSE (`EventSource` cannot set headers). Requirement: logs must be sanitized to strip the token before being shipped anywhere.
2. **Deactivation enforcement (NFR-S4 gap closure):** a JWT alone doesn't reflect live account state, so `apps/agent-be` performs a live `user.active` check against Postgres on every privileged request.
3. **OAuth token at rest:** per-user DEK encrypts the GitHub OAuth token; a platform KEK wraps each DEK (envelope encryption), AES-256-GCM (NFR-S5). KEK stored as a Railway env var for MVP, migrating to a third-party KMS post-MVP. KEK rotation runbook documented; GCM nonce-uniqueness enforced.
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

### Pattern Examples

**Good Examples:**

- `apps/agent-be/src/conversations/conversations.controller.ts` returning `{ id, title, createdAt, ... }` directly on success.
- `model Conversation { id String @id; userId String @map("user_id"); @@map("conversations") }`.

**Anti-Patterns:**

- Wrapping success responses in `{ data: {...} }` "for consistency" with the error envelope — explicitly rejected.
- Mixing `class-validator` DTOs into a service that's supposed to be all-Zod.
- A new top-level `libs/utils` created speculatively, "in case it's needed by both services."
