---
stepsCompleted:
  - step-01-load-context
  - step-02-define-thresholds
  - step-03-gather-evidence
  - step-04-evaluate-and-score
  - step-05-generate-report
lastStep: step-05-generate-report
lastSaved: '2026-07-04'
overallStatus: CONCERNS
criteriaScore: '20/29'
workflowType: 'testarch-nfr-assess'
scope: 'Story 3.5 — Resume an Existing Conversation'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/implementation-artifacts/3-5-resume-an-existing-conversation.md
  - _bmad-output/test-artifacts/test-design-architecture.md
  - _bmad-output/test-artifacts/nfr-assessment-3-4.md
  - _bmad-output/test-artifacts/atdd-checklist-3-5-resume-an-existing-conversation.md
  - _bmad-output/project-context.md
  - apps/agent-be/src/conversations/conversations.service.ts
  - apps/agent-be/src/conversations/conversations.controller.ts
  - apps/agent-be/src/conversations/dto/resume-conversation.dto.ts
  - apps/web/src/components/conversation/ConversationPane.tsx
  - apps/web/src/hooks/use-conversation-presence.ts
  - apps/web/src/components/project-map/InProgressArtifactCard.tsx
  - apps/web/src/components/project-map/ProjectMapArtifacts.tsx
  - apps/web/src/app/(dashboard)/(app)/project-map/page.tsx
  - apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx
  - apps/agent-be/src/conversations/conversations.service.spec.ts
  - libs/database-schemas/src/prisma/schema.prisma
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/adr-quality-readiness-checklist.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/ci-burn-in.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/playwright-config.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/error-handling.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/nfr-criteria.md
---

# NFR Evidence Audit — Story 3.5: Resume an Existing Conversation

## Step 1: Context Loaded

### NFR Sources

| Source | Path | NFRs Referenced |
|---|---|---|
| PRD | `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` | FR8 (line 34 — Project Map navigation, cross-tab focus), FR13 (line 44 — Conversation Persistence, resumable), NFR-R2 (line 86 — committed artifacts recoverable independent of Sandbox state), NFR-S2 (line 64 — credential isolation), NFR-P2 (line 74 — chat ready within 10s), NFR-P3 (line 76 — Project Map loads within 2s) |
| Architecture | `_bmad-output/planning-artifacts/architecture.md` | Cross-Cutting Concern 2 (line 89 — sandbox lifecycle, resume), Cross-Cutting Concern 7 (line 94 — session persistence and recovery, "Reconnecting…" indicator), Deferred Decisions (line 233 — in-memory mapping loss acceptable for MVP), Frontend Architecture #5 (line 276 — manual reload for SSE-reconnect recovery) |
| Epics | `_bmad-output/planning-artifacts/epics.md` | Story 3.5 (lines 715-734), FR8 (line 34), FR13 (line 44), NFR-R2 (line 86) |
| Story 3.5 | `_bmad-output/implementation-artifacts/3-5-resume-an-existing-conversation.md` | 3 ACs, status: done; 3 review patches applied (error handling, concurrency guard, test assertion); NFR audit: 2 NFR patches applied (select projections) |
| ATDD Checklist (3.5) | `_bmad-output/test-artifacts/atdd-checklist-3-5-resume-an-existing-conversation.md` | 29 test cases (P0: 22, P1: 7) across 5 files; all un-skipped and passing |
| NFR Assessment (3.4) | `_bmad-output/test-artifacts/nfr-assessment-3-4.md` | Predecessor assessment — CONCERNS, 20/29; 0 NFR patches needed (all applied during implementation/review); 11 deferred findings |
| Project Context | `_bmad-output/project-context.md` | NestJS patterns (lines 115-143), Next.js patterns (lines 85-118), `select` projection (line 148), `findFirst` for tenant-scoped lookups (line 154), fire-and-forget (line 137), `ReplaySubject` for SSE (line 132), `OnModuleDestroy` (line 138), BroadcastChannel SSR guard (line 267), standard focus ring (line 159) |

### NFRs in Scope for Story 3.5

| NFR | Category | Threshold | Relevance to Story 3.5 |
|---|---|---|---|
| **NFR-R2** | Reliability | Committed Artifacts always recoverable, independent of Sandbox state | **Primary** — AC-1 references NFR-R2. The `[conversationId]/page.tsx` Server Component restores full chat history from Postgres (independent of sandbox state). Story 3.5 validates this and ensures the resume flow (AC-2) doesn't break it. |
| **NFR-S2** | Security | Tenant-scoped credential/token lookups | **Primary** — `resumeConversation` does `conversation.findFirst({ where: { id, userId } })` — the `userId` filter IS the tenant authorization check. `resolveGitIdentity` does `user.findUnique({ where: { id: userId } })`. |
| **NFR-P2** | Performance | Chat ready within 10s of Conversation page open | **Secondary** — The resume fast path (sandbox alive) re-injects git config + emits SESSION_READY immediately (no provision/clone). The slow path (sandbox not alive) re-provisions (same 10s target as initial provision). Empirical validation requires real Daytona sandbox. |
| **NFR-P3** | Performance | Project Map loads within 2s | **Secondary** — Story 3.5 modified `project-map/page.tsx` (split rendering into `ProjectMapArtifacts` Client Component). Data fetching logic unchanged. `artifact.findMany` has `take: 100` + `select` projection. |
| **FR8** | Functional | Cross-tab conversation focus from Project Map | **Primary** — AC-3 implements this via `BroadcastChannel` + `InProgressArtifactCard`. Clicking an in-progress artifact with an open conversation tab focuses that tab. |
| **FR13** | Functional | Conversation Persistence — always resumable | **Primary** — AC-1 + AC-2 implement this. History restored from Postgres; sandbox re-init handled transparently with "Reconnecting…" indicator. |

### Evidence Availability

| Evidence Type | Status | Location / Result |
|---|---|---|
| Implementation | Available (Story 3.5 status: done) | `conversations.service.ts` (324 lines), `conversations.controller.ts` (70 lines), `resume-conversation.dto.ts` (6 lines), `ConversationPane.tsx` (624 lines), `use-conversation-presence.ts` (69 lines), `InProgressArtifactCard.tsx` (42 lines), `ProjectMapArtifacts.tsx` (48 lines), `project-map/page.tsx` (93 lines), `[conversationId]/page.tsx` (67 lines) |
| Unit/Component Tests | Available | agent-be: 87 tests (7 suites); web: 593 tests (52 suites) — ALL PASSING |
| Test Results | **680 tests, 59 suites — ALL PASSING** (agent-be 3.6s, web 6.7s) | `yarn nx test agent-be` + `yarn nx test web` — run this session |
| Lint | 0 errors (agent-be, web) | `yarn nx lint agent-be` + `yarn nx lint web` — run this session |
| Typecheck | Clean (agent-be, web) | `npx tsc --noEmit` — run this session |
| Review Findings | 3 code-review patches applied (error handling, concurrency guard, test assertion) | Story 3.5 Review Findings section |
| CI Burn-In | Not run for Story 3.5 changes | CI pipeline exists (`.github/workflows/test.yml`) — no execution results available |
| Load Testing | No tool selected | Blocked per `test-design-architecture.md` |

### Knowledge Fragments Loaded

- `adr-quality-readiness-checklist.md` (8-category, 29-criteria framework)
- `ci-burn-in.md` (CI pipeline and burn-in strategy)
- `test-quality.md` (test DoD: deterministic, isolated, <300 lines, <1.5 min)
- `playwright-config.md` (timeout standards, artifact output, parallelization)
- `error-handling.md` (scoped exception handling, retry validation, graceful degradation)
- `nfr-criteria.md` (NFR validation criteria and gate decision matrix)

### Configuration

- `tea_browser_automation`: auto
- `test_stack_type`: auto
- `ci_platform`: auto
- `test_framework`: auto
- `risk_threshold`: p1

---

## Step 2: NFR Categories & Thresholds

### NFR Matrix for Story 3.5

Scoped to the files listed in the Story 3.5 File List (6 new files, 8 modified files, 0 deleted files).

#### ADR Category 1: Testability & Automation

| Criterion | Threshold | Source |
|---|---|---|
| 1.1 Isolation | `ConversationsService` testable via `buildTestModule()` with `SandboxServiceFake` + `AgentServiceFake`; `ConversationPane` reconnecting state testable with `MockEventSource` + fake timers; `useConversationPresence`/`useOpenConversations` testable with `MockBroadcastChannel`; `InProgressArtifactCard` testable in jsdom with mocked `next/link` | `conversations.service.spec.ts:449-541`, `ConversationPane.test.tsx`, `use-conversation-presence.test.ts`, `InProgressArtifactCard.test.tsx` |
| 1.2 Headless Interaction | All agent-be endpoints are REST (no new SSE endpoints); `ConversationPane` is a `'use client'` component testable in jsdom; `InProgressArtifactCard` is a `'use client'` component testable in jsdom; `ProjectMapArtifacts` is a `'use client'` component testable in jsdom | `conversations.controller.ts`, `ConversationPane.tsx`, `InProgressArtifactCard.tsx`, `ProjectMapArtifacts.tsx` |
| 1.3 State Control | `SandboxServiceFake` supports `injectGitConfig`/`getWorkingTreeStatus` stubs for resume fast-path tests; `MockEventSource.emit()` extended for SESSION_READY during reconnecting state; `MockBroadcastChannel` test implementation for cross-tab hooks; `jest.useFakeTimers()` for reconnection timeout test; `jest.spyOn(sandboxFake, ...)` for method call assertions | `conversations.service.spec.ts:450-539`, `ConversationPane.test.tsx`, `use-conversation-presence.test.ts` |
| 1.4 Sample Requests | `ResumeConversationDto` is `z.object({})` — empty body, no input to bound. The endpoint takes no body content (conversation ID is in the URL param). No new DTOs with user input. | `resume-conversation.dto.ts:4` |

#### ADR Category 2: Test Data Strategy

| Criterion | Threshold | Source |
|---|---|---|
| 2.1 Segregation | `userId` scoping in `resumeConversation`'s `conversation.findFirst({ where: { id, userId } })` — the `userId` filter IS the tenant authorization check. `resolveGitIdentity`'s `user.findUnique({ where: { id: userId } })` — scoped to the authenticated user. `sandboxStatuses`/`sandboxIds` Maps keyed by `conversationId`. BroadcastChannel messages contain `conversationId` only (user's own conversation — not sensitive). | `conversations.service.ts:246-249,305-309`, `use-conversation-presence.ts:14,25-27` |
| 2.2 Generation | Existing test fixtures reused (`mockPrisma` with `conversation`, `user`, `repoConnection` mocks); `SandboxServiceFake` with `injectGitConfig`/`getWorkingTreeStatus` stubs; `MockBroadcastChannel` (EventTarget-based) for cross-tab hook tests; `MockEventSource` for SSE event simulation | `conversations.service.spec.ts:39-68`, `use-conversation-presence.test.ts`, `ConversationPane.test.tsx` |
| 2.3 Teardown | `beforeEach(jest.clearAllMocks)` + `afterEach(jest.useRealTimers)` in all test files; `useConversationPresence` cleanup closes BroadcastChannel on unmount; `useOpenConversations` cleanup closes BroadcastChannel on unmount; `InProgressArtifactCard` closes BroadcastChannel immediately after `postMessage`; `ConversationPane` cleanup closes EventSource + clears timeout | `use-conversation-presence.ts:30-34,62-65`, `InProgressArtifactCard.tsx:29`, `ConversationPane.tsx:68-73` |

#### ADR Category 3: Scalability & Availability

| Criterion | Threshold | Source |
|---|---|---|
| 3.1 Statelessness | `ConversationsService` holds 2 in-process `Map`s (`sandboxStatuses`, `sandboxIds`) — bounded by active conversations, documented single-container MVP constraint. On server restart, Maps are lost and resume slow path re-provisions (accepted MVP degradation per architecture.md line 233). BroadcastChannel is per-browser-tab (no server-side state). | `conversations.service.ts:21-22`, `use-conversation-presence.ts` |
| 3.2 Bottlenecks | Resume fast path: 1 DB round-trip (`conversation.findFirst` with `select: { id: true }`) + 1 `user.findUnique` (git identity, `select` projection) + sandbox API calls (injectGitConfig, getWorkingTreeStatus). Resume slow path: re-provisions via `provisionSandbox` (same as initial provision). All Prisma queries have `select` projections. No new `findMany` queries. `project-map/page.tsx` `artifact.findMany` has `take: 100` + `select` projection. | `conversations.service.ts:246-249,306-309`, `project-map/page.tsx:37-42` |
| 3.3 SLA Definitions | NFR-P2: Chat ready within 10s (resume fast path is immediate; slow path same as initial provision). NFR-P3: Project Map loads within 2s (unchanged data fetching). NFR-R2: Committed artifacts always recoverable (history from Postgres, independent of sandbox state). | PRD lines 74,76,86 |
| 3.4 Circuit Breakers | **PASS** — Resume fast path has try/catch that emits `SESSION_ERROR` + sets status to `'failed'` on failure (review patch). Resume slow path reuses `provisionSandbox` which has its own error handling (SESSION_ERROR + destroy + cleanup). Concurrency guard: early return when status is `'provisioning'` prevents duplicate sandbox race (review patch). Client-side timeout (30s) fires during `'reconnecting'` state (same treatment as `'provisioning'`). | `conversations.service.ts:258-290,293-295`, `ConversationPane.tsx:404-412` |

#### ADR Category 4: Disaster Recovery

| Criterion | Threshold | Source |
|---|---|---|
| 4.1 RTO/RPO | N/A — stateless service, no persistent state beyond Postgres | — |
| 4.2 Failover | N/A — infrastructure-level (Vercel/Railway) | Architecture |
| 4.3 Backups | N/A — Postgres backups (Railway), infrastructure-level | Architecture |

#### ADR Category 5: Security

| Criterion | Threshold | Source |
|---|---|---|
| 5.1 AuthN/AuthZ | `BoundaryJwtGuard` + `ActiveUserGuard` on all agent-be endpoints (unchanged). `POST /conversations/:id/resume` authenticated via global guards. `@User()` decorator provides `UserContext`. No new auth wiring. | `conversations.controller.ts:59-69` |
| 5.2 Encryption | NFR-S4: OAuth tokens AES-256-GCM encrypted at rest. Story 3.5 imports no crypto/token modules. `resumeConversation` queries `Conversation` table only (no token fields). `resolveGitIdentity` queries `User` table (name, email, githubLogin — no token fields). `select` projections exclude unnecessary fields. `RepoConnection` model has no sensitive fields (verified in schema — no token/crypto columns). | `conversations.service.ts:246-249,306-309`, `schema.prisma:42-55` |
| 5.3 Secrets | Boundary JWT in `Authorization` header (REST) and `?token=` query param (SSE). No secrets in code. No new env vars. BroadcastChannel messages contain `conversationId` only (not sensitive — user's own conversation ID). | `conversations.controller.ts:59-69`, `use-conversation-presence.ts:14` |
| 5.4 Input Validation | `ResumeConversationDto` is `z.object({})` — empty body, no input to bound. The endpoint takes no body content (conversation ID is in the URL param, validated by NestJS route matching). No shell commands with user-controlled values (resume fast path calls `injectGitConfig`/`getWorkingTreeStatus` which already shell-quote via `shellQuote` helper). | `resume-conversation.dto.ts:4`, `conversations.controller.ts:59-69` |

#### ADR Category 6: Monitorability/Debuggability/Manageability

| Criterion | Threshold | Source |
|---|---|---|
| 6.1 Tracing | **UNKNOWN** — no distributed tracing for agent-be or apps/web in MVP | Architecture |
| 6.2 Logs | NestJS `Logger` in `ConversationsService` (`error` on fast-path resume failure, `error` on slow-path provision failure). No structured JSON, no correlation IDs. (Pre-existing, project-wide.) | `conversations.service.ts:283,299` |
| 6.3 Metrics | **UNKNOWN** — no `/metrics` endpoint, no RED metrics | Architecture |
| 6.4 Config | `API_URL` env var (used by `ConversationPane` for resume fetch). No new env vars. No feature flags. | `ConversationPane.tsx:391`, `[conversationId]/page.tsx:47` |

#### ADR Category 7: QoS/QoE

| Criterion | Threshold | Source |
|---|---|---|
| 7.1 Latency | NFR-P2: Chat ready within 10s. Resume fast path (sandbox alive): re-injects git config + emits SESSION_READY immediately — no provision/clone delay. Resume slow path (sandbox not alive): re-provisions (same 10s target). `select` projections on all Story 3.5 Prisma queries reduce DB transfer. | `conversations.service.ts:258-281,297-302` |
| 7.2 Throttling | No per-user rate limiting on `POST /:id/resume` (pre-existing pattern — no rate limiting on any agent-be endpoint). Concurrency guard prevents duplicate sandbox provisioning (review patch). MVP assumes authenticated, non-adversarial users. | `conversations.service.ts:293-295` |
| 7.3 Perceived Performance | "Reconnecting…" label with spinner shown immediately on resume (history visible from Postgres before SSE ready). Input disabled during reconnection (re-enables on SESSION_READY). Cross-tab focus is instant (BroadcastChannel — no server round-trip). | `ConversationPane.tsx:100,568-569,596-601`, `InProgressArtifactCard.tsx:21-31` |
| 7.4 Degradation | Resume fast-path failure → `SESSION_ERROR` + status `'failed'` (review patch). Resume slow-path failure → `provisionSandbox` error handling (SESSION_ERROR + destroy + cleanup). Client-side timeout (30s) → `'timeout'` state with Retry button. BroadcastChannel unavailable → hooks are no-op, `InProgressArtifactCard` lets default navigation proceed (graceful degradation). | `conversations.service.ts:282-290`, `ConversationPane.tsx:404-412`, `use-conversation-presence.ts:10,42` |

#### ADR Category 8: Deployability

| Criterion | Threshold | Source |
|---|---|---|
| 8.1 Zero Downtime | Vercel (apps/web) atomic deploys. Railway (agent-be) single-container. `app.enableShutdownHooks()` in `main.ts`. `ConversationsService` uses in-memory Maps (lost on restart — accepted MVP degradation). No new timers or background processes in Story 3.5. | `conversations.service.ts:21-22` |
| 8.2 Backward Compatibility | No schema changes in Story 3.5. `POST /conversations/:id/resume` is a new endpoint (additive). `'reconnecting'` SessionState is a new state value (additive — existing states unchanged). `useConversationPresence`/`useOpenConversations` are new hooks (additive). `InProgressArtifactCard` is a new component (additive). `ProjectMapArtifacts` is a new component (additive). `ArtifactCard` `onClick` prop is optional (additive — default `undefined` is no-op). All changes are additive. | Story 3.5 dev notes |
| 8.3 Rollback | Manual trigger (not automatic on health check failure). `/health` endpoint present. | project-context.md |

### Thresholds Marked UNKNOWN

| Category | Criterion | Status | Planned Evidence |
|---|---|---|---|
| Monitorability | 6.1 Tracing | UNKNOWN | No tracing implemented for agent-be or apps/web in MVP |
| Monitorability | 6.2 Logs | CONCERNS | NestJS Logger present; `ConversationsService` logs `error` on resume failures. No structured JSON, no correlation IDs. |
| Monitorability | 6.3 Metrics | UNKNOWN | No `/metrics` endpoint for agent-be or apps/web |

Per `nfr-criteria.md`: ambiguous or undefined thresholds default to **CONCERNS** until clarified.

---

## Step 3: Evidence Gathered

### Performance Evidence

| Optimization | Location | Status |
|---|---|---|
| `select` projection on `conversation.findFirst` in `resumeConversation` | `conversations.service.ts:248` | PASS — `select: { id: true }` (applied during implementation) |
| `select` projection on `user.findUnique` in `resolveGitIdentity` | `conversations.service.ts:308` | PASS — `select: { name: true, email: true, githubLogin: true }` (applied during implementation) |
| `select` projection on `repoConnection.findUnique` in `provisionSandbox` | `conversations.service.ts:58` | PASS — `select: { id: true, repoUrl: true }` (NFR patch applied this audit) |
| `select` projection on `conversation.findFirst` in `[conversationId]/page.tsx` | `page.tsx:25` | PASS — `select: { id: true, title: true }` (pre-existing from Story 3.2) |
| `select` projection on `turn.findMany` in `[conversationId]/page.tsx` | `page.tsx:36` | PASS — `select: { id: true, role: true, content: true, createdAt: true }` (pre-existing from Story 3.2) |
| `select` projection on `repoConnection.findUnique` in `project-map/page.tsx` | `page.tsx:19` | PASS — `select: { id: true }` (NFR patch applied this audit) |
| `select` projection on `artifact.findMany` in `project-map/page.tsx` | `page.tsx:41` | PASS — `select: { id, type, title, status, lastModifiedAt, path }` + `take: 100` (pre-existing from Story 2.2) |
| Resume fast path avoids provision/clone (immediate SESSION_READY) | `conversations.service.ts:258-281` | PASS — re-injects git config + emits SESSION_READY without provisioning a new sandbox |
| BroadcastChannel cross-tab focus (no server round-trip) | `InProgressArtifactCard.tsx:21-31` | PASS — instant cross-tab focus via BroadcastChannel (no HTTP request) |

### Security Evidence

| Control | Location | Status |
|---|---|---|
| Tenant-scoped `resumeConversation` `conversation.findFirst` | `conversations.service.ts:246-249` — `where: { id: conversationId, userId }` | PASS — `userId` filter IS the tenant authorization check; `select: { id: true }` |
| Tenant-scoped `resolveGitIdentity` `user.findUnique` | `conversations.service.ts:306-309` — `where: { id: userId }` | PASS — scoped to authenticated user; `select: { name, email, githubLogin }` |
| `resumeConversation` returns `'failed'` for not-found (doesn't leak existence) | `conversations.service.ts:251-253` | PASS — consistent with `listSkills`/`getStatus` pattern (project-context.md line 131) |
| No crypto/token imports in Story 3.5 | `conversations.service.ts:1-14`, `ConversationPane.tsx:1-13` | PASS — no token exposure in Story 3.5 code paths |
| `RepoConnection` model has no sensitive fields | `schema.prisma:42-55` | PASS — no token/crypto columns on `RepoConnection` (tokens on `OAuthCredential` model, not queried by Story 3.5) |
| `select` projections exclude unnecessary fields | All Story 3.5 Prisma queries use `select` | PASS — `select: { id: true }`, `select: { name, email, githubLogin }`, `select: { id, repoUrl }` |
| Boundary JWT validation on `POST /:id/resume` | `conversations.controller.ts:59-69` | PASS — global `BoundaryJwtGuard` + `ActiveUserGuard` (no new auth wiring) |
| BroadcastChannel messages contain only `conversationId` | `use-conversation-presence.ts:14,25-27,31` | PASS — user's own conversation ID (not sensitive); no tokens/PII transmitted |
| `ResumeConversationDto` empty body (no user input to inject) | `resume-conversation.dto.ts:4` | PASS — `z.object({})` — no input to bound, no injection surface |
| SSR guard on BroadcastChannel hooks | `use-conversation-presence.ts:10,42` | PASS — `typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function'` guard |

### Reliability Evidence

| Control | Location | Status |
|---|---|---|
| Resume fast-path error handling (try/catch → SESSION_ERROR + status 'failed') | `conversations.service.ts:282-290` | PASS — emits SESSION_ERROR, sets status to 'failed', returns 'failed' (review patch) |
| Resume concurrency guard (early return when 'provisioning') | `conversations.service.ts:293-295` | PASS — prevents duplicate sandbox race (review patch) |
| Resume slow-path fire-and-forget with `.catch()` | `conversations.service.ts:297-300` | PASS — `void this.provisionSandbox(...).catch(...)` (project-context.md line 137 pattern) |
| Client-side timeout includes 'reconnecting' state | `ConversationPane.tsx:404-412` | PASS — `if (prev === 'provisioning' || prev === 'reconnecting')` (EXPERIENCE.md line 248) |
| Resume fetch fire-and-forget with `.catch()` | `ConversationPane.tsx:390-402` | PASS — `void fetch(...).catch(() => { setState('error'); ... })` |
| `useConversationPresence` cleanup on unmount | `use-conversation-presence.ts:30-34` | PASS — broadcasts 'conversation-closed', removes listener, closes channel |
| `useOpenConversations` cleanup on unmount | `use-conversation-presence.ts:62-65` | PASS — removes listener, closes channel |
| `InProgressArtifactCard` channel cleanup after postMessage | `InProgressArtifactCard.tsx:29` | PASS — `channel.close()` immediately after `postMessage` |
| `handleRetry` reuses existing conversationIdRef (no conversation leak) | `ConversationPane.tsx:552-561` | PASS — removed `conversationIdRef.current = initialConversationId ?? null` line (deferred-work.md line 183 fix) |
| `ReplaySubject<SseEvent>(100)` ensures late SSE subscribers receive SESSION_READY | `SessionEventsService` (unchanged) | PASS — resume flow relies on this for SSE-before-resume-endpoint timing (project-context.md line 132) |
| `inputDisabled` includes 'reconnecting' state | `ConversationPane.tsx:568` | PASS — input disabled during reconnection (EXPERIENCE.md line 247) |
| `showSpinner` includes 'reconnecting' state | `ConversationPane.tsx:569` | PASS — "Reconnecting…" label always visible during reconnection |
| `SESSION_READY` listener transitions from 'reconnecting' to 'ready' | `ConversationPane.tsx:139-151` | PASS — existing listener works for both provisioning and reconnecting states |

### Maintainability Evidence

| Control | Location | Status |
|---|---|---|
| Test coverage | 680 tests, 59 suites — ALL PASSING (agent-be 3.6s, web 6.7s) | PASS — all 3 ACs have P0 coverage (29 new tests: 22 P0, 7 P1 across 5 files) |
| Lint | 0 errors (agent-be, web) | PASS |
| Typecheck | Clean (agent-be, web) | PASS |
| Code review | 3 patches applied, 0 deferred | PASS — no Story 3.5-specific issues remaining |
| NFR patches | 2 patches applied (select projections) | PASS — applied this audit |
| `resolveGitIdentity` extracted as private helper (DRY within service) | `conversations.service.ts:305-323` | PASS — not a shared library (deliberate cross-service duplication, project-context.md line 139) |
| BroadcastChannel SSR guard uses `typeof` check (catches undefined) | `use-conversation-presence.ts:10,42` | PASS — `typeof window.BroadcastChannel !== 'function'` (DP-2 semantic intent) |
| `ProjectMapArtifacts` as Client Component (Server Component keeps data fetching) | `project-map/page.tsx`, `ProjectMapArtifacts.tsx` | PASS — Server Component benefits preserved (direct Prisma reads) |

### Evidence Gaps

| Gap | Status | Impact |
|---|---|---|
| CI Burn-In | No burn-in execution results for Story 3.5 changes | Cannot verify test stability over 10 iterations |
| Vulnerability Scan | No npm audit/Snyk in CI pipeline (project-wide, pre-existing) | Unknown vulnerability exposure |
| Coverage Report | No coverage threshold in CI (pre-existing) | No coverage regression detection |
| Monitoring | No Sentry/APM/structured logging in apps/web (pre-existing) | Production failures invisible to operators |
| NFR-P2 Timing Test | No timing test for chat-ready within 10s (requires real Daytona sandbox + Claude API key) | Resume latency not measured end-to-end |
| `turn.findMany` take limit | No `take` limit on `turn.findMany` in `[conversationId]/page.tsx` (pre-existing from Story 3.2/3.3) | Unbounded result set for conversations with many turns |

---

## Step 4: NFR Evidence Evaluation

### Performance Assessment

#### Response Time (NFR-P2 — Chat ready within 10s)

- **Status:** CONCERNS
- **Threshold:** ≤10s (NFR-P2 — chat ready within 10s of Conversation page open)
- **Actual:** Resume fast path (sandbox alive) re-injects git config + emits SESSION_READY immediately — no provision/clone delay. Resume slow path (sandbox not alive) re-provisions (same 10s target as initial provision). `select` projections on all Story 3.5 Prisma queries reduce DB transfer. However, no timing test exists — empirical validation requires a real Daytona sandbox + Claude API key.
- **Evidence:** `conversations.service.ts:258-281` (fast path), `conversations.service.ts:297-302` (slow path)
- **Findings:** NFR-P2 timing test deferred to integration testing (requires real sandbox + API key)

#### Throughput

- **Status:** PASS
- **Threshold:** No formal throughput SLO defined for MVP
- **Actual:** Resume fast path does 2 DB round-trips (`conversation.findFirst` + `user.findUnique`), both with `select` projections. Resume slow path reuses `provisionSandbox` (same as initial provision). BroadcastChannel cross-tab focus is instant (no server round-trip). No new `findMany` queries. Concurrency guard prevents duplicate sandbox provisioning.
- **Evidence:** `conversations.service.ts:246-249,306-309,293-295`, `InProgressArtifactCard.tsx:21-31`

#### Resource Usage

- **Status:** PASS
- **Threshold:** No formal resource thresholds for MVP
- **Actual:** `ConversationsService` holds 2 in-process `Map`s — bounded by active conversations. BroadcastChannel is per-browser-tab (no server-side state). `InProgressArtifactCard` creates and closes a BroadcastChannel per click (cleaned up immediately). `select` projections reduce memory per query. `useConversationPresence`/`useOpenConversations` clean up channels on unmount.
- **Evidence:** `conversations.service.ts:21-22`, `use-conversation-presence.ts:30-34,62-65`, `InProgressArtifactCard.tsx:24-29`

#### Scalability

- **Status:** CONCERNS
- **Threshold:** MVP scale (single-tenant, small user count, ≤10 concurrent conversations)
- **Actual:** 2 in-process `Map`s for sandbox tracking (documented single-container constraint). In-memory state lost on restart (accepted MVP degradation). All Prisma queries have `select` projections. Concurrency guard prevents duplicate provisioning. BroadcastChannel is browser-scoped (no server scalability impact).
- **Evidence:** `conversations.service.ts:21-22,293-295`
- **Recommendation:** Persist `sandboxId` to enable `SandboxService.resume()` for stopped-but-not-destroyed sandboxes (deferred — post-MVP per DP-5)

---

### Security Assessment

#### Authentication Strength

- **Status:** PASS
- **Threshold:** Boundary JWT (HS256, 8h expiry, `jose` library)
- **Actual:** No new endpoints beyond `POST /conversations/:id/resume`, authenticated via global `BoundaryJwtGuard` + `ActiveUserGuard`. `@User()` decorator provides `UserContext`. No new auth wiring.
- **Evidence:** `conversations.controller.ts:59-69`

#### Authorization Controls (NFR-S2)

- **Status:** PASS
- **Threshold:** Tenant-scoped credential/token lookups; tokens never resolved across users
- **Actual:** `resumeConversation` does `conversation.findFirst({ where: { id: conversationId, userId } })` — the `userId` filter IS the tenant authorization check. `resolveGitIdentity` does `user.findUnique({ where: { id: userId } })` — scoped to authenticated user. `resumeConversation` returns `'failed'` for not-found conversations (doesn't leak existence). All `select` projections exclude unnecessary fields. `RepoConnection` model has no sensitive fields (verified in schema).
- **Evidence:** `conversations.service.ts:246-249,251-253,306-309`, `schema.prisma:42-55`

#### Data Protection (NFR-S4)

- **Status:** PASS
- **Threshold:** AES-256-GCM encryption at rest; tokens never returned to client
- **Actual:** Story 3.5 imports no crypto/token modules. `resumeConversation` queries `Conversation` table only (no token fields). `resolveGitIdentity` queries `User` table (name, email, githubLogin — no token fields). `RepoConnection` model has no sensitive fields. BroadcastChannel messages contain only `conversationId` (not sensitive).
- **Evidence:** `conversations.service.ts:1-14,246-249,306-309`, `use-conversation-presence.ts:14`, `schema.prisma:42-55`

#### Vulnerability Management

- **Status:** CONCERNS
- **Threshold:** No formal vulnerability scan threshold defined
- **Actual:** No npm audit/Snyk in CI pipeline; no security headers in `next.config.js` (project-wide, pre-existing). `ResumeConversationDto` is empty body (no input to inject). BroadcastChannel SSR guard prevents server-side execution. `InProgressArtifactCard` doesn't expose user input to shell commands. No new env vars.
- **Evidence:** `.github/workflows/test.yml` (no security scan job), `resume-conversation.dto.ts:4`, `use-conversation-presence.ts:10,42`
- **Recommendation:** Add security headers to `next.config.js`; add `npm audit` job to CI (project-wide, not Story 3.5-specific)

---

### Reliability Assessment

#### Error Handling (AC-2 — Reconnecting state)

- **Status:** PASS
- **Threshold:** Graceful degradation; no silent failures; SESSION_READY or SESSION_ERROR/timeout
- **Actual:** Resume fast path has try/catch that emits `SESSION_ERROR`, sets status to `'failed'`, returns `'failed'` (review patch). Resume slow path reuses `provisionSandbox` error handling (SESSION_ERROR + destroy + cleanup). Client-side timeout (30s) fires during `'reconnecting'` state (same treatment as `'provisioning'`). Resume fetch is fire-and-forget with `.catch()` that sets error state. `handleRetry` reuses existing conversation ID (no conversation leak). `ReplaySubject<SseEvent>(100)` ensures late SSE subscribers receive missed SESSION_READY events.
- **Evidence:** `conversations.service.ts:282-290,297-302`, `ConversationPane.tsx:390-412,552-561`

#### Fault Tolerance

- **Status:** PASS
- **Threshold:** Graceful degradation; no silent failures
- **Actual:** Resume fast-path failure → `SESSION_ERROR` + status `'failed'` (review patch). Resume slow-path failure → `provisionSandbox` error handling. Client-side timeout → `'timeout'` state with Retry button. BroadcastChannel unavailable → hooks are no-op, `InProgressArtifactCard` lets default navigation proceed (graceful degradation). Concurrency guard prevents duplicate sandbox race (review patch). `useConversationPresence`/`useOpenConversations` clean up channels on unmount. `InProgressArtifactCard` closes channel immediately after `postMessage`.
- **Evidence:** `conversations.service.ts:282-290,293-295`, `ConversationPane.tsx:404-412`, `use-conversation-presence.ts:10,30-34,42,62-65`, `InProgressArtifactCard.tsx:24-29`

#### NFR-R2 (Committed Artifacts Always Recoverable)

- **Status:** PASS
- **Threshold:** Committed Artifacts always recoverable from the Repository, independent of Sandbox state
- **Actual:** AC-1 is satisfied by the existing `[conversationId]/page.tsx` Server Component (Story 3.2): reads `conversation.findFirst` + `turn.findMany` from Postgres, maps to `ChatMessage[]`, passes as `initialMessages` to `ConversationPane`. History is visible immediately on page load, before the SSE connection opens or the sandbox resumes. This is "independent of Sandbox state" — the Postgres read happens in the Server Component before `ConversationPane` mounts. Story 3.5 validates this and ensures the resume flow (AC-2) doesn't break it.
- **Evidence:** `[conversationId]/page.tsx:23-44`, `ConversationPane.tsx:35` (`useState<ChatMessage[]>(initialMessages)`)

#### Monitoring & Observability

- **Status:** CONCERNS
- **Threshold:** No formal monitoring threshold defined for MVP
- **Actual:** NestJS `Logger` in `ConversationsService` (`error` on fast-path resume failure, `error` on slow-path provision failure). No structured JSON logging, no correlation IDs, no Sentry/APM, no `/metrics` endpoint (pre-existing, project-wide).
- **Evidence:** `conversations.service.ts:283,299`
- **Recommendation:** Add structured JSON logging; install Sentry; add `/metrics` endpoint (project-wide, not Story 3.5-specific)

#### CI Burn-In (Stability)

- **Status:** CONCERNS
- **Threshold:** 10 consecutive successful runs (CI burn-in)
- **Actual:** Burn-in job exists in CI (10 iterations on PRs + weekly) but no execution results available for Story 3.5 changes
- **Evidence:** `.github/workflows/test.yml:156-229`
- **Findings:** Cannot verify burn-in passes for Story 3.5 changes

---

### Maintainability Assessment

#### Test Coverage

- **Status:** PASS
- **Threshold:** No hard coverage % threshold; P0 tests must cover all ACs
- **Actual:** 680 tests across 59 suites — ALL PASSING (agent-be 3.6s, web 6.7s); all 3 ACs have direct P0 coverage (29 new tests: 22 P0, 7 P1 across 5 files)
- **Evidence:** `yarn nx test agent-be` + `yarn nx test web` (this session); `atdd-checklist-3-5.md`

#### Code Quality

- **Status:** PASS
- **Threshold:** 0 lint errors (within baseline)
- **Actual:** 0 errors (agent-be, web); typecheck clean; 3 code-review patches applied; 2 NFR patches applied (select projections)
- **Evidence:** `yarn nx lint agent-be` + `yarn nx lint web`; `npx tsc --noEmit` (this session)

#### Technical Debt

- **Status:** CONCERNS
- **Threshold:** No formal debt ratio threshold
- **Actual:** 0 code-review deferred items (all 3 patches applied). 8 NFR deferred findings (all pre-existing from Stories 3.1/3.2/3.3 or project-wide). The Story 3.5-specific deferrals are appropriate for MVP scope (DP-5).
- **Evidence:** Story 3.5 Review Findings section; NFR Review Findings — Deferred section below

#### Test Quality

- **Status:** PASS
- **Threshold:** Test quality DoD (deterministic, isolated, <300 lines, <1.5 min)
- **Actual:** 680 tests pass in ~10.3s total (agent-be 3.6s + web 6.7s). All 29 new Story 3.5 tests are un-skipped and passing. `MockBroadcastChannel` test implementation is deterministic. Fake timers for timeout test are isolated.
- **Evidence:** test execution this session; `atdd-checklist-3-5.md`

---

## Step 5: Final NFR Evidence Audit Report

**Date:** 2026-07-04
**Story:** 3.5 — Resume an Existing Conversation
**Overall Status:** CONCERNS

---

Note: This audit summarizes existing implementation evidence; it does not run tests or CI workflows. NFR thresholds and planned evidence come from PRD, architecture, and `test-design` outputs.

### Executive Summary

**Assessment:** 20 PASS, 6 CONCERNS, 0 FAIL

**Blockers:** 0 — no FAIL status NFRs

**High Priority Issues:** 0 — all Story 3.5-specific NFR concerns are either pre-existing project-wide issues or deferred to integration testing (NFR-P2 timing).

**NFR Patches Applied:** 2 new patches — `select` projections on `repoConnection.findUnique` in `provisionSandbox` (Performance) and `project-map/page.tsx` (Performance). All other NFR-specific patches were already applied during implementation and review:
- `select` projection on `conversation.findFirst` in `resumeConversation` (Performance) — applied during implementation
- `select` projection on `user.findUnique` in `resolveGitIdentity` (Performance) — applied during implementation
- Fast-path error handling: try/catch → SESSION_ERROR + status 'failed' (Reliability) — applied as review patch
- Concurrency guard: early return when 'provisioning' (Reliability) — applied as review patch
- Client-side timeout includes 'reconnecting' state (Reliability) — applied during implementation
- `handleRetry` reuses existing conversationIdRef (Reliability) — applied during implementation
- BroadcastChannel SSR guard (Reliability) — applied during implementation
- Channel cleanup on unmount (Reliability) — applied during implementation

**Recommendation:** Approve. Story 3.5's implementation is well-engineered across all four NFR domains. NFR-S2 (tenant scoping) PASSES — `conversation.findFirst({ where: { id, userId } })` with `select: { id: true }`. NFR-S4 (encryption) PASSES — no crypto/token imports, `RepoConnection` has no sensitive fields. NFR-R2 (committed artifacts recoverable) PASSES — history restored from Postgres via Server Component, independent of sandbox state. AC-2 (reconnecting state with git identity re-injection) PASSES — fast path re-injects git config + emits SESSION_READY; slow path re-provisions; client-side timeout fires during 'reconnecting'; error handling emits SESSION_ERROR on failure; concurrency guard prevents duplicate sandbox race. AC-3 (cross-tab focus) PASSES — BroadcastChannel with SSR guard, graceful degradation, proper cleanup. The 3 review patches address all reliability concerns (error handling, concurrency guard, test assertion). The remaining CONCERNS are all pre-existing, project-wide issues (no monitoring, no vulnerability scan, no CI burn-in results, no NFR-P2 timing test) or require dev-step analysis (take limit on turn.findMany, AbortSignal.timeout on fetch calls). None block MVP launch at current scale.

---

### NFR-Specific Patches Applied

**2 new patches applied in this audit:**

| # | Patch | Category | File | Status |
|---|---|---|---|---|
| 1 | `select: { id: true, repoUrl: true }` on `repoConnection.findUnique` in `provisionSandbox` | Performance | `conversations.service.ts:58` | Applied (NFR audit) |
| 2 | `select: { id: true }` on `repoConnection.findUnique` in project-map page | Performance | `project-map/page.tsx:19` | Applied (NFR audit) |

**Verified already in place (applied during implementation and review):**

| # | Patch | Category | File | Status |
|---|---|---|---|---|
| 3 | `select` projection on `conversation.findFirst` in `resumeConversation` | Performance | `conversations.service.ts:248` | Verified (applied during implementation) |
| 4 | `select` projection on `user.findUnique` in `resolveGitIdentity` | Performance | `conversations.service.ts:308` | Verified (applied during implementation) |
| 5 | Fast-path error handling (try/catch → SESSION_ERROR + status 'failed') | Reliability | `conversations.service.ts:282-290` | Verified (review patch) |
| 6 | Concurrency guard (early return when 'provisioning') | Reliability | `conversations.service.ts:293-295` | Verified (review patch) |
| 7 | Slow-path test asserts `provisionSandbox` was called | Reliability | `conversations.service.spec.ts:492-497` | Verified (review patch) |
| 8 | Client-side timeout includes 'reconnecting' state | Reliability | `ConversationPane.tsx:406` | Verified (applied during implementation) |
| 9 | `handleRetry` reuses existing conversationIdRef | Reliability | `ConversationPane.tsx:552-561` | Verified (applied during implementation) |
| 10 | BroadcastChannel SSR guard (`typeof` check) | Reliability | `use-conversation-presence.ts:10,42` | Verified (applied during implementation) |
| 11 | Channel cleanup on unmount | Reliability | `use-conversation-presence.ts:30-34,62-65` | Verified (applied during implementation) |
| 12 | `InProgressArtifactCard` closes channel after postMessage | Reliability | `InProgressArtifactCard.tsx:29` | Verified (applied during implementation) |

**Patches NOT applied (out of scope per user instructions):**

| # | Considered | Why Not Applied |
|---|---|---|
| 1 | `take` limit on `turn.findMany` in `[conversationId]/page.tsx` | Pre-existing from Story 3.2/3.3. Would change behavior (pagination — older messages beyond the limit wouldn't load). AC-1 says "Full chat history restored" — adding a limit would violate this. Feature change, not a pure NFR patch. Deferred. |
| 2 | `AbortSignal.timeout()` on resume fetch in `ConversationPane` | Pre-existing pattern — all fetch calls (startSession, fetchSkills, sendMessage, handleStop, resume) lack timeouts. Requires error handling changes (distinguishing abort errors from network errors) and careful test interaction analysis. Deferred from Story 3.2/3.3/3.4 NFR assessments — belongs in a dev step, not an NFR patch. Deferred. |
| 3 | Security headers in `next.config.js` | Project-wide concern, not Story 3.5-specific. Already recommended in Stories 2.4, 2.6, 3.2, 3.3, and 3.4 NFR assessments. |
| 4 | `npm audit`/Snyk in CI | Project-wide concern, not Story 3.5-specific. |
| 5 | NFR-P2 timing test (chat ready within 10s) | Requires real Daytona sandbox + Claude API key — not feasible in unit/component tests. Deferred to integration testing. |
| 6 | Persist `sandboxId` to enable `SandboxService.resume()` | Deferred per DP-5 (architecture.md line 233 — in-memory mapping loss acceptable for MVP). Post-MVP scope. |
| 7 | `ProvisionQueueService.acquire` timeout | Pre-existing from Story 3.1. Not Story 3.5-specific. |
| 8 | `EventSource.onerror` doesn't close the source | Pre-existing from Story 3.1. Not Story 3.5-specific. |
| 9 | Structured JSON logging / Sentry / `/metrics` endpoint | Project-wide concern, not Story 3.5-specific. |

---

### Findings Summary

**Based on ADR Quality Readiness Checklist (8 categories, 29 criteria)**

| Category | Criteria Met | PASS | CONCERNS | FAIL | Overall Status |
|---|---|---|---|---|---|
| 1. Testability & Automation | 4/4 | 4 | 0 | 0 | PASS |
| 2. Test Data Strategy | 3/3 | 3 | 0 | 0 | PASS |
| 3. Scalability & Availability | 3/4 | 3 | 1 | 0 | PASS |
| 4. Disaster Recovery | 0/3 | 0 | 0 | 0 | N/A (3 N/A) |
| 5. Security | 4/4 | 4 | 0 | 0 | PASS |
| 6. Monitorability | 1/4 | 1 | 3 | 0 | CONCERNS |
| 7. QoS & QoE | 3/4 | 3 | 1 | 0 | PASS |
| 8. Deployability | 2/3 | 2 | 1 | 0 | CONCERNS |
| **Total** | **20/29** | **20** | **6** | **0** | **CONCERNS** |

**Criteria Met Scoring:**

- ≥26/29 (90%+) = Strong foundation
- 20-25/29 (69-86%) = Room for improvement
- <20/29 (<69%) = Significant gaps

**Score: 20/29 (69%) — Room for improvement** (excluding 3 N/A DR criteria: 20/26 = 77%)

**Improvement vs Story 3.4 baseline:** Story 3.4 scored 20/29 (69%) with 20 PASS, 6 CONCERNS, 3 N/A. Story 3.5 scores 20/29 (69%) with 20 PASS, 6 CONCERNS, 3 N/A. **No change** — Story 3.5 adds no new NFR concerns and resolves no pre-existing ones. The 2 NFR patches applied (select projections) are performance optimizations that align with the project convention but don't promote any criterion from CONCERNS to PASS. The DR criteria (4.1-4.3) remain N/A for Story 3.5 (stateless service, infrastructure-level concern) — same as Story 3.4.

**Key NFR-R2 (Committed Artifacts Recoverable) — PASS:** The `[conversationId]/page.tsx` Server Component reads full chat history from Postgres (`conversation.findFirst` + `turn.findMany` with `select` projections), independent of sandbox state. History is visible immediately on page load, before the SSE connection opens or the sandbox resumes. This satisfies AC-1 and NFR-R2.

**Key AC-2 (Reconnecting State) — PASS:** The resume fast path re-injects git config + emits SESSION_READY immediately; the slow path re-provisions via `provisionSandbox`. Error handling (try/catch → SESSION_ERROR), concurrency guard (early return when 'provisioning'), client-side timeout (includes 'reconnecting' state), and `handleRetry` fix (reuses conversation ID) are all implemented and tested.

**Key AC-3 (Cross-Tab Focus) — PASS:** BroadcastChannel API with SSR guard, graceful degradation (no-op when unavailable), proper cleanup (channel closed on unmount / after postMessage), and deduplication in `useOpenConversations`.

---

### Quick Wins

0 new quick wins identified beyond the 2 NFR patches already applied.

---

### Recommended Actions

#### Immediate (Before Release) - CRITICAL/HIGH Priority

None — no FAIL status NFRs; no critical vulnerabilities; NFR-S2/S4/R2/AC-2/AC-3 all PASS. All NFR-specific patches verified in place or applied this audit.

#### Short-term (Next Milestone) - MEDIUM Priority

1. **Add `AbortSignal.timeout()` on `ConversationPane` fetch calls** - MEDIUM - 2 hours - Dev
   - Browser→agent-be REST calls (startSession, fetchSkills, sendMessage, handleStop, resume) have no timeout; stuck agent-be hangs UI
   - Deferred from Story 3.2/3.3/3.4 NFR assessments — coordinate fix across all 5 fetch calls
   - Requires error handling changes and test interaction analysis

2. **Add `take` limit to `turn.findMany`** - MEDIUM - 1 hour - Dev
   - `turn.findMany` on page load has no `take` limit — unbounded result set for conversations with many turns
   - Requires pagination behavior decision (feature change, not pure NFR patch) — AC-1 says "Full chat history restored"

3. **Add security headers to `next.config.js`** - MEDIUM - 1 hour - Dev
   - CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy (project-wide, pre-existing)

4. **Add `npm audit`/Snyk to CI** - MEDIUM - 2 hours - Dev
   - Dependency-vulnerability scanning (project-wide, pre-existing)

5. **Run Story 3.5 burn-in** - MEDIUM - 1 hour - DevOps
   - 10x resume fast-path + slow-path + cross-tab focus cycles; verify no flakiness

6. **Add NFR-P2 timing test** - MEDIUM - 2 hours - QA
   - Requires real Daytona sandbox + Claude API key; deferred to integration testing

7. **Validate resume fast-path latency** - LOW - Production tuning
   - Fast path should be near-instant (no provision/clone); empirical validation requires real sandbox

---

### Monitoring Hooks

4 monitoring hooks recommended (all pre-existing, project-wide):

#### Performance Monitoring

- [ ] Playwright trace artifact for resume + cross-tab focus E2E — capture on every CI run
  - **Owner:** Dev/DevOps
  - **Deadline:** Next PR

#### Security Monitoring

- [ ] `npm audit` CI job — scan for critical/high vulnerabilities
  - **Owner:** Dev
  - **Deadline:** Next milestone

#### Reliability Monitoring

- [ ] Structured JSON logging in agent-be — `ConversationsService` resume failures (fast-path catch, slow-path provision failure)
  - **Owner:** Dev
  - **Deadline:** Next milestone

- [ ] `/api/health` endpoint for apps/web — verify DATABASE_URL connectivity
  - **Owner:** Dev
  - **Deadline:** Next milestone

---

### Fail-Fast Mechanisms

3 fail-fast mechanisms recommended (all pre-existing, project-wide):

#### Circuit Breakers (Reliability)

- [x] Resume fast-path error handling — try/catch emits SESSION_ERROR + sets status 'failed' (review patch)
- [x] Concurrency guard — early return when status 'provisioning' prevents duplicate sandbox race (review patch)
- [x] Client-side timeout — 30s timeout fires during 'reconnecting' state (same treatment as 'provisioning')
- [ ] Transaction wrap on `sendTurn` multi-write — prevent partial state on mid-write failure (pre-existing from Story 3.2)

#### Rate Limiting (Performance)

- [ ] Per-user rate limiting on `POST /:id/resume` — prevent resume burst-load (pre-existing pattern, no rate limiting on any endpoint)
  - **Owner:** Dev
  - **Estimated Effort:** 4 hours

#### Validation Gates (Security)

- [ ] Security headers in `next.config.js` — CSP, X-Frame-Options, etc.
  - **Owner:** Dev
