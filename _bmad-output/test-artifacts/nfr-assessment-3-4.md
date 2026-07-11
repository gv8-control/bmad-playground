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
scope: 'Story 3.4 — See Tool Calls and Recognized Actions Inline'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/implementation-artifacts/3-4-see-tool-calls-and-recognized-actions-inline.md
  - _bmad-output/test-artifacts/test-design-architecture.md
  - _bmad-output/test-artifacts/test-reviews/test-review-3-4.md
  - _bmad-output/test-artifacts/nfr-assessment-3-3.md
  - _bmad-output/project-context.md
  - apps/agent-be/src/streaming/agent.service.ts
  - apps/agent-be/src/streaming/tool-pill-classifier.service.ts
  - apps/agent-be/src/streaming/streaming.controller.ts
  - apps/agent-be/src/streaming/streaming.module.ts
  - apps/agent-be/test/helpers/agent-service.fake.ts
  - apps/web/src/components/conversation/ToolPill.tsx
  - apps/web/src/components/conversation/SemanticPill.tsx
  - apps/web/src/components/conversation/ChatMessageList.tsx
  - apps/web/src/components/conversation/ConversationPane.tsx
  - libs/database-schemas/src/prisma/schema.prisma
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/adr-quality-readiness-checklist.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/ci-burn-in.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/playwright-config.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/error-handling.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/nfr-criteria.md
---

# NFR Evidence Audit — Story 3.4: See Tool Calls and Recognized Actions Inline

## Step 1: Context Loaded

### NFR Sources

| Source | Path | NFRs Referenced |
|---|---|---|
| PRD | `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` | FR-12 (Tool Pills / Semantic Pills), NFR-P1 (line 450 — first token ≤1,500ms), NFR-S2 (line 442 — credential isolation), NFR-S4 (line 444 — encryption at rest), NFR-R3 (line 460 — SSE back-pressure), NFR-R4 (line 461 — SSE connection capacity) |
| Architecture | `_bmad-output/planning-artifacts/architecture.md` | Cross-Cutting Concern 3 (line 90 — circuit breaker, heartbeat, back-pressure), `tool-pill-classifier.service.ts` (line 577), `agui-event-bridge.service.ts` (line 576 — folded into `AgentService` per DP-3), `ToolPill.tsx` (line 502), `SemanticPill.tsx` (line 503), AG-UI data flow (line 669), SSE back-pressure (200 events, 30s drain) |
| Epics | `_bmad-output/planning-artifacts/epics.md` | Story 3.4 (lines 683-713), FR12 (line 42), UX-DR5 (line 143), UX-DR6 (line 145), UX-DR18 (line 169), circuit breaker + heartbeat (lines 120, 710-713) |
| Story 3.4 | `_bmad-output/implementation-artifacts/3-4-see-tool-calls-and-recognized-actions-inline.md` | 5 ACs, status: done; 17 review patches applied, 6 deferred, 1 dismissed; NFR audit: 0 new patches needed (all NFR-specific patches already applied during implementation and review) |
| Test Review (3.4) | `_bmad-output/test-artifacts/test-reviews/test-review-3-4.md` | 88/100 (B) — 0 HIGH, 2 MEDIUM (stale TDD headers, worker handle leak), 5 LOW; approved with comments |
| NFR Assessment (3.3) | `_bmad-output/test-artifacts/nfr-assessment-3-3.md` | Predecessor assessment — CONCERNS, 19/29; 2 NFR patches applied (select projections on AgentService writes); 10 deferred. Story 3.3 noted "No circuit breaker on sandbox-agent crash/stall (Story 3.4 scope)" — now resolved. |
| Project Context | `_bmad-output/project-context.md` | NestJS patterns (lines 115-140), Next.js patterns (lines 85-113), SSE patterns (lines 131-136), `select` projection (line 148), `logger.warn()` in catch blocks (line 128), `OnModuleDestroy` (line 134), fire-and-forget (line 133), security rules (lines 283-314), SSE back-pressure (line 318), sandbox idle timeout (line 320), HTTP/2 requirement (line 321), SSE heartbeat (line 322) |

### NFRs in Scope for Story 3.4

| NFR | Category | Threshold | Relevance to Story 3.4 |
|---|---|---|---|
| **NFR-P1** | Performance | First token ≤1,500ms | **Secondary** — Story 3.4 adds tool call lifecycle events to the existing SSE stream. No new DB round-trips on the hot path (classifier runs after `TOOL_CALL_RESULT`, not before first token). Empirical validation requires real Daytona sandbox + Claude API key (deferred). |
| **NFR-S2** | Security | Tenant-scoped credential/token lookups | **Primary** — `ToolPillClassifierService` does `repoConnection.findUnique({ where: { userId } })` + `artifact.findFirst({ where: { repoConnectionId, path } })`. The `userId` filter IS the tenant authorization check. |
| **NFR-S4** | Security | OAuth tokens AES-256-GCM encrypted at rest | **Secondary** — Story 3.4 doesn't touch credential resolution. Classifier queries `Artifact` table only (no token fields). `select` projections exclude token fields. |
| **NFR-R3** | Reliability | SSE back-pressure (200 events, 30s drain → STREAM_ERROR) | **Secondary** — Story 3.4 adds heartbeat to the existing SSE endpoint. Back-pressure tracking unchanged from Story 3.3. |
| **NFR-R4** | Reliability | 10 concurrent SSE connections per browser session | **Secondary** — Story 3.4 adds heartbeat comment frames (ignored by `EventSource`). No change to connection capacity. |
| **AC-5 Circuit Breaker** | Reliability | Stalled/crashed agent terminated; heartbeat detects dead connections | **Primary** — Story 3.4 implements the circuit breaker (120s timeout, resets on events, `RUN_ERROR` + `terminateProcess`) and SSE heartbeat (15s interval). This was deferred from Story 3.3 as "Story 3.4 scope." |

### Evidence Availability

| Evidence Type | Status | Location / Result |
|---|---|---|
| Implementation | Available (Story 3.4 status: done) | `agent.service.ts` (435 lines), `tool-pill-classifier.service.ts` (150 lines), `streaming.controller.ts` (172 lines), `ToolPill.tsx` (96 lines), `SemanticPill.tsx` (56 lines), `ChatMessageList.tsx` (88 lines), `ConversationPane.tsx` (599 lines) |
| Unit/Component Tests | Available | agent-be: 80 tests (7 suites); web: 571 tests (50 suites) — ALL PASSING |
| Test Results | **651 tests, 57 suites — ALL PASSING** (agent-be 3.2s, web 6.2s) | `yarn nx test agent-be` + `yarn nx test web` — run this session |
| Lint | 0 errors (agent-be 12 warnings baseline, web 10 warnings baseline) | `yarn nx lint agent-be` + `yarn nx lint web` — run this session |
| Typecheck | Clean (agent-be) | `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json` — run this session |
| Test Review | 88/100 (B) — approved with comments | `_bmad-output/test-artifacts/test-reviews/test-review-3-4.md` |
| Review Findings | 17 code-review patches applied, 6 deferred, 1 dismissed | Story 3.4 Review Findings section |
| CI Burn-In | Not run for Story 3.4 changes | CI pipeline exists (`.github/workflows/test.yml`) — no execution results available |
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

### NFR Matrix for Story 3.4

Scoped to the files listed in the Story 3.4 File List (7 new files, 12 modified files, 1 deleted file).

#### ADR Category 1: Testability & Automation

| Criterion | Threshold | Source |
|---|---|---|
| 1.1 Isolation | `AgentService` testable via real instantiation with `jest.isolateModules()` + controllable SDK mock (`agent.service.unit.spec.ts`); `ToolPillClassifierService` testable with mock `PrismaService`; `StreamingController` heartbeat testable with fake timers + mock `res.write`; `ConversationPane` tool call listeners testable with `MockEventSource.emit()`; `ToolPill`/`SemanticPill` are presentational components testable in isolation | `agent.service.unit.spec.ts`, `tool-pill-classifier.service.spec.ts`, `streaming.controller.spec.ts`, `ConversationPane.test.tsx`, `ToolPill.test.tsx`, `SemanticPill.test.tsx` |
| 1.2 Headless Interaction | All agent-be endpoints are REST/SSE (no new endpoints in Story 3.4); `ToolPill`/`SemanticPill` are `'use client'` components testable in jsdom; `ChatMessageList` system message rendering testable via `renderToStaticMarkup` or RTL | `streaming.controller.ts`, `ToolPill.tsx`, `SemanticPill.tsx`, `ChatMessageList.tsx` |
| 1.3 State Control | `AgentServiceFake` extended with `setToolCallScript()` and `setCircuitBreakerScript()`; `jest.isolateModules()` for per-test SDK mock isolation; `jest.useFakeTimers()` for circuit breaker (120s) and heartbeat (15s) tests; `MockEventSource.emit()` extended for TOOL_CALL_ARGS/END/RESULT/PROMOTED | `agent-service.fake.ts:40-66`, `agent.service.unit.spec.ts:63-76`, `streaming.controller.spec.ts`, `ConversationPane.test.tsx:39-79` |
| 1.4 Sample Requests | No new DTOs in Story 3.4. Tool call events flow through SSE (no request body validation needed). Classifier input is derived from SDK messages (not user input). `SendMessageDto.max(10_000)` from Story 3.2 bounds user input. | `send-message.dto.ts`, `agent.service.ts:367-434` |

#### ADR Category 2: Test Data Strategy

| Criterion | Threshold | Source |
|---|---|---|
| 2.1 Segregation | `userId` scoping in classifier's `repoConnection.findUnique({ where: { userId } })` — the `userId` filter IS the tenant authorization check. `artifact.findFirst({ where: { repoConnectionId, path } })` — `repoConnectionId` derived from the user's own `repoConnection` (tenant scope). `circuitBreakerTimers`/`activeToolCalls`/`pendingClassifierPromises` Maps keyed by `conversationId`. | `tool-pill-classifier.service.ts:117-126`, `agent.service.ts:35-41` |
| 2.2 Generation | `successOutput` fixture reused across classifier tests; `makeToolCall()` factory with `Partial<ToolCallData>` overrides; `makeSdkMessage()`/`yieldMessages()` helpers for controlled SDK message sequences; `mockResponse()` helper with `written` array for heartbeat assertions | `tool-pill-classifier.service.spec.ts:85-87`, `ToolPill.test.tsx:19-28`, `agent.service.unit.spec.ts`, `streaming.controller.spec.ts:56-78` |
| 2.3 Teardown | `beforeEach(jest.clearAllMocks)` + `afterEach(jest.useRealTimers)` in all test files; `OnModuleDestroy` on `AgentService` clears all Maps and circuit breaker timers; `cleanupAll()` in `StreamingController` clears heartbeat and back-pressure timers; `ConversationPane.test.tsx` saves/restores `global.fetch`, `global.EventSource`, `global.localStorage` | `agent.service.ts:202-217`, `streaming.controller.ts:102-105`, `ConversationPane.test.tsx` |

#### ADR Category 3: Scalability & Availability

| Criterion | Threshold | Source |
|---|---|---|
| 3.1 Statelessness | `AgentService` holds 7 in-process `Map`s (`activeRuns`, `currentMessageIds`, `circuitBreakerTimers`, `currentBlockTypes`, `currentToolCallIds`, `activeToolCalls`, `pendingClassifierPromises`) — bounded by active conversations, cleaned up in `OnModuleDestroy` and `finally` blocks. Documented single-container MVP constraint. | `agent.service.ts:35-41,144-152,202-217` |
| 3.2 Bottlenecks | Classifier does 2 DB round-trips per `git commit` tool result (`repoConnection.findUnique` + `artifact.findFirst`), both with `select` projections. `pendingClassifierPromises` bounded by tool calls per run, cleared in `finally`. No new `findMany` queries. `select` projections on all Story 3.4 Prisma queries. | `tool-pill-classifier.service.ts:117-126`, `agent.service.ts:108-111,120-132` |
| 3.3 SLA Definitions | NFR-P1: First token ≤1,500ms (no timing test — deferred to integration testing). NFR-R3: SSE back-pressure (200 events, 30s drain — implemented in Story 3.3). NFR-R4: 10 concurrent SSE (infrastructure-level HTTP/2). Circuit breaker: 120s timeout (configurable via `CIRCUIT_BREAKER_TIMEOUT_MS`). Heartbeat: 15s interval. | PRD line 450, `agent.service.ts:24-27`, `streaming.controller.ts:89-95` |
| 3.4 Circuit Breakers | **PASS** — Circuit breaker implemented (120s timeout, resets on each emitted event, `RUN_ERROR` + `terminateProcess` on fire). SSE heartbeat implemented (15s interval, try/catch on write, cleanup on close/complete/error). SSE back-pressure (200 events, 30s drain → STREAM_ERROR). `OnModuleDestroy` clears all timers. | `agent.service.ts:219-273`, `streaming.controller.ts:89-105,159-162` |

#### ADR Category 4: Disaster Recovery

| Criterion | Threshold | Source |
|---|---|---|
| 4.1 RTO/RPO | N/A — stateless service, no persistent state beyond Postgres | — |
| 4.2 Failover | N/A — infrastructure-level (Vercel/Railway) | Architecture |
| 4.3 Backups | N/A — Postgres backups (Railway), infrastructure-level | Architecture |

#### ADR Category 5: Security

| Criterion | Threshold | Source |
|---|---|---|
| 5.1 AuthN/AuthZ | `BoundaryJwtGuard` + `ActiveUserGuard` on all agent-be endpoints (unchanged from Story 3.3). `StreamingController` validates boundary JWT from `Authorization` header or `?token=` query param. No new endpoints in Story 3.4. | `streaming.controller.ts:31-59` |
| 5.2 Encryption | NFR-S4: OAuth tokens AES-256-GCM encrypted at rest. Story 3.4 imports no crypto/token modules. `ToolPillClassifierService` queries `Artifact` table only (no token fields). `select` projections exclude token fields on all queries. | `tool-pill-classifier.service.ts:117-126` (select: `{ id: true }` and `select: { id: true, title: true, type: true }`) |
| 5.3 Secrets | Boundary JWT in `Authorization` header (REST) and `?token=` query param (SSE). `ANTHROPIC_API_KEY` from env var. `AUTH_SECRET` from env var. No secrets in code. No new env vars beyond `CIRCUIT_BREAKER_TIMEOUT_MS` (numeric, no secret). | `agent.service.ts:24-27,79`, `streaming.controller.ts:37` |
| 5.4 Input Validation | No new DTOs in Story 3.4. Classifier input is derived from SDK messages (not user input). `SendMessageDto.max(10_000)` from Story 3.2 bounds user input. No shell commands with user-controlled values (agent invocation uses Claude Agent SDK, not shell). | `send-message.dto.ts:5`, `agent.service.ts:73-82` |

#### ADR Category 6: Monitorability/Debuggability/Manageability

| Criterion | Threshold | Source |
|---|---|---|
| 6.1 Tracing | **UNKNOWN** — no distributed tracing for agent-be or apps/web in MVP | Architecture |
| 6.2 Logs | NestJS `Logger` in `AgentService` (`error` on run failure, `warn` on stop/interrupt failure, `warn` on circuit breaker fire, `log` on module destroy). `StreamingController` logs SSE stream errors. `ToolPillClassifierService` logs `warn` on Postgres lookup failure. No structured JSON, no correlation IDs. | `agent.service.ts:34,138,178,184,251,258,264`, `streaming.controller.ts:144`, `tool-pill-classifier.service.ts:136-138` |
| 6.3 Metrics | **UNKNOWN** — no `/metrics` endpoint, no RED metrics | Architecture |
| 6.4 Config | `CIRCUIT_BREAKER_TIMEOUT_MS` env var (validated with NaN fallback to 120,000ms). `ANTHROPIC_API_KEY`, `AGENT_WORKDIR`, `AUTH_SECRET` from env vars. No feature flags. | `agent.service.ts:24-27,44,76,79` |

#### ADR Category 7: QoS/QoE

| Criterion | Threshold | Source |
|---|---|---|
| 7.1 Latency | NFR-P1: First token ≤1,500ms (no timing test — deferred). `select` projections on all Story 3.4 Prisma queries (classifier lookups, turn persistence, conversation update). Classifier runs after `TOOL_CALL_RESULT` (not on the first-token hot path). | `tool-pill-classifier.service.ts:117-126`, `agent.service.ts:120-132` |
| 7.2 Throttling | No per-user rate limiting on `POST /:id/turns` (pre-existing). No concurrent-turn guard (deferred — post-MVP). `SendMessageDto.max(10_000)` bounds input. Circuit breaker (120s) prevents stalled agents from running indefinitely. | `agent.service.ts:219-273`, `send-message.dto.ts:5` |
| 7.3 Perceived Performance | Tool Pills appear inline with "Running…" label, replaced in place by completed/error pill (no layout shift). Semantic Pills promote confirmed commits with "Progress saved" + View link. System messages render as centered muted text. Progressive Markdown rendering (unchanged from Story 3.3). | `ToolPill.tsx`, `SemanticPill.tsx`, `ChatMessageList.tsx:58-64`, `ConversationPane.tsx:217-378` |
| 7.4 Degradation | Circuit breaker emits `RUN_ERROR` with user-friendly message ("The agent stopped unexpectedly. Send a new message to try again."). `STREAM_ERROR` shows back-pressure message. Classifier Postgres lookup failure → degraded `viewHref = '/artifacts'` (functional fallback). Failed tool calls render as error-state Tool Pills with `negative` styling. `RUN_ERROR`/`STREAM_ERROR` render as system messages (not agent messages). | `agent.service.ts:247-273`, `tool-pill-classifier.service.ts:135-139`, `ConversationPane.tsx:280-308,339-378` |

#### ADR Category 8: Deployability

| Criterion | Threshold | Source |
|---|---|---|
| 8.1 Zero Downtime | Vercel (apps/web) atomic deploys. Railway (agent-be) single-container. `app.enableShutdownHooks()` in `main.ts`. `OnModuleDestroy` on `AgentService` aborts active runs, clears all Maps, clears all circuit breaker timers. | `agent.service.ts:202-217` |
| 8.2 Backward Compatibility | No schema changes in Story 3.4. `ToolPillClassifierService` is a new provider (additive). `TOOL_CALL_PROMOTED_EVENT` type is new (additive). `ChatMessage.toolCall` field is optional (additive). `ChatMessage.role: 'system'` is a new role value (additive). All changes are additive. | Story 3.4 dev notes |
| 8.3 Rollback | Manual trigger (not automatic on health check failure). `/health` endpoint present. | project-context.md |

### Thresholds Marked UNKNOWN

| Category | Criterion | Status | Planned Evidence |
|---|---|---|---|
| Monitorability | 6.1 Tracing | UNKNOWN | No tracing implemented for agent-be or apps/web in MVP |
| Monitorability | 6.2 Logs | CONCERNS (improved) | NestJS Logger present; `AgentService` has comprehensive logging including circuit breaker fire. `ToolPillClassifierService` logs `warn` on Postgres lookup failure. No structured JSON, no correlation IDs. |
| Monitorability | 6.3 Metrics | UNKNOWN | No `/metrics` endpoint for agent-be or apps/web |

Per `nfr-criteria.md`: ambiguous or undefined thresholds default to **CONCERNS** until clarified.

---

## Step 3: Evidence Gathered

### Performance Evidence

| Optimization | Location | Status |
|---|---|---|
| `select` projection on `turn.create` in `AgentService` | `agent.service.ts:126` | PASS — `select: { id: true }` (from Story 3.3 NFR patch, verified) |
| `select` projection on `conversation.update` in `AgentService` | `agent.service.ts:131` | PASS — `select: { id: true }` (from Story 3.3 NFR patch, verified) |
| `select` projection on `repoConnection.findUnique` in classifier | `tool-pill-classifier.service.ts:119` | PASS — `select: { id: true }` (applied during implementation per story spec) |
| `select` projection on `artifact.findFirst` in classifier | `tool-pill-classifier.service.ts:125` | PASS — `select: { id: true, title: true, type: true }` (applied during implementation per story spec) |
| Classifier runs after `TOOL_CALL_RESULT` (not on first-token path) | `agent.service.ts:402-429` | PASS — classifier is called after `TOOL_CALL_RESULT` emission, not before first token |
| `pendingClassifierPromises` awaited before `RUN_FINISHED` | `agent.service.ts:108-111` | PASS — `await Promise.allSettled(pendingPromises)` before `RUN_FINISHED` (review patch) |
| Fire-and-forget classifier promise tracked | `agent.service.ts:405-428` | PASS — classifier promise pushed to `pendingClassifierPromises` array, awaited before run completion (review patch) |
| Tool Pill in-place label replacement (no layout shift) | `ConversationPane.tsx:217-242`, `ToolPill.tsx` | PASS — `ChatMessage` entry's `toolCall.status` transitions from `'running'` to `'completed'`; position in `messages` array doesn't change |
| Heartbeat `.unref()` (prevents clean process exit block) | `streaming.controller.ts:96` | PASS — `heartbeatInterval.unref?.()` (review patch) |
| Circuit breaker timer `.unref()` | `agent.service.ts:223,235` | PASS — `timer.unref?.()` on both `startCircuitBreakerTimer` and `resetCircuitBreakerTimer` (review patch) |

### Security Evidence

| Control | Location | Status |
|---|---|---|
| Tenant-scoped classifier `repoConnection.findUnique` | `tool-pill-classifier.service.ts:117-120` — `where: { userId }` | PASS — `userId` is `@unique` on `RepoConnection` (schema verified); `where: { userId }` IS the tenant authorization check |
| Tenant-scoped classifier `artifact.findFirst` | `tool-pill-classifier.service.ts:123-126` — `where: { repoConnectionId, path }` | PASS — `repoConnectionId` derived from the user's own `repoConnection` (tenant scope) |
| No crypto/token imports in Story 3.4 | `tool-pill-classifier.service.ts:1-5`, `agent.service.ts:1-8` | PASS — no token exposure in Story 3.4 code paths |
| `select` projections exclude token fields | All Story 3.4 Prisma queries use `select` with no token fields | PASS — `select: { id: true }` and `select: { id: true, title: true, type: true }` |
| `X-Content-Type-Options: nosniff` on SSE | `streaming.controller.ts:74` | PASS — security header on SSE response (unchanged from Story 3.3) |
| Boundary JWT validation on SSE | `streaming.controller.ts:45-59` — `jwtVerify()` with issuer/audience claims | PASS — validates JWT from `Authorization` header or `?token=` query param |
| No shell commands with user-controlled values | `agent.service.ts:73-82` — Claude Agent SDK `query()` | PASS — agent invocation uses SDK, not shell commands |
| `CIRCUIT_BREAKER_TIMEOUT_MS` env var validation | `agent.service.ts:24-27` | PASS — `Number.isFinite(parsed) && parsed > 0` with fallback to 120,000ms (review patch) |
| Classifier `logger.warn()` on Postgres lookup failure | `tool-pill-classifier.service.ts:135-139` | PASS — follows `project-context.md:128` pattern (`logger.warn()` in catch blocks that return a default) |

### Reliability Evidence

| Control | Location | Status |
|---|---|---|
| Circuit breaker (120s timeout, resets on events) | `agent.service.ts:219-273` | PASS — `startCircuitBreakerTimer` / `resetCircuitBreakerTimer` / `clearCircuitBreakerTimer` / `handleCircuitBreaker` |
| Circuit breaker emits `RUN_ERROR` with user-friendly message | `agent.service.ts:267-270` | PASS — `CIRCUIT_BREAKER_MESSAGE` = "The agent stopped unexpectedly. Send a new message to try again." |
| Circuit breaker calls `terminateProcess` before `RUN_ERROR` emit | `agent.service.ts:261-270` | PASS — `terminateProcess` (fire-and-forget with `.catch()`) is before `RUN_ERROR` emit; `abort()` + `interrupt()` are synchronous and before the emit (DP-2) |
| Circuit breaker race with `stop()` prevented | `agent.service.ts:161-169` | PASS — `stop()` checks `aborted` flag and returns early if circuit breaker already fired (review patch) |
| `abortPromise` listener with `{ once: true }` | `agent.service.ts:62-68` | PASS — prevents listener leak (review patch) |
| Pending classifier promises awaited before `RUN_FINISHED` | `agent.service.ts:108-111` | PASS — `await Promise.allSettled(pendingPromises)` (review patch) |
| `processAssistantMessage` content normalization | `agent.service.ts:385-390` | PASS — normalizes `block.content` to string (handles string, array, non-null, null) (review patch) |
| `content_block_stop` handler split for text/tool_use | `agent.service.ts:342-363` | PASS — text blocks emit `TEXT_MESSAGE_END`, tool_use blocks emit `TOOL_CALL_END` (review patch) |
| SSE heartbeat (15s interval, try/catch on write) | `streaming.controller.ts:89-95` | PASS — `setInterval` with try/catch, `clearInterval` on write failure (review patch) |
| Heartbeat cleanup on close/complete/error | `streaming.controller.ts:98-105,136,145,160` | PASS — `cleanupAll()` called in `complete`, `error`, `next` (back-pressure), and `req.close` (review patch) |
| Back-pressure path calls `cleanupAll()` + `unsubscribe()` | `streaming.controller.ts:121-126` | PASS — prevents heartbeat leak and subscription dangle (review patch) |
| `res.end()` in `complete` handler wrapped in try/catch | `streaming.controller.ts:137-141` | PASS — consistent with `error` handler (review patch) |
| `OnModuleDestroy` clears all Maps and timers | `agent.service.ts:202-217` | PASS — aborts active runs, clears 7 Maps, clears all circuit breaker timers |
| Timer cleanup in `finally` block | `agent.service.ts:144-152` | PASS — `clearCircuitBreakerTimer` + delete all 7 Maps in `finally` |
| `RUN_ERROR`/`STREAM_ERROR` render as system messages | `ConversationPane.tsx:339-378` | PASS — `role: 'system'` (not `role: 'assistant'`) (review patch) |
| Frontend error detection aligned with backend | `ConversationPane.tsx:285-289` | PASS — anchored patterns (`^error:`, `Command exited with code [1-9]`, `failed to push`) matching backend's `isFailedCommit` (review patch) |
| `TOOL_CALL_END` `setAgentState` inside `if (toolCallId)` | `ConversationPane.tsx:265-274` | PASS — `setAgentState('thinking')` only when `toolCallId` is present (review patch) |
| `extractBmadArtifactPaths` regex fix | `tool-pill-classifier.service.ts:50-74` | PASS — `diffMatch` uses `indexOf` + `slice` to strip path prefix (review patch) |
| `deriveTitleFromPath` aligned with source-of-truth | `tool-pill-classifier.service.ts:29-34` | PASS — no capitalization, matches `artifacts.ts` (review patch) |
| `AgentServiceFake.setToolCallScript()` / `setCircuitBreakerScript()` | `agent-service.fake.ts:40-66` | PASS — extended with full tool call lifecycle support (review patch) |

### Maintainability Evidence

| Control | Location | Status |
|---|---|---|
| Test coverage | 651 tests, 57 suites — ALL PASSING (agent-be 3.2s, web 6.2s) | PASS — all 5 ACs have P0 coverage (49 new tests: 39 P0, 10 P1) |
| Lint | 0 errors (agent-be 12 warnings, web 10 warnings — baseline) | PASS |
| Typecheck | Clean (agent-be) | PASS |
| Test review | 88/100 (B) — approved with comments | PASS |
| Code review | 17 patches applied, 6 deferred, 1 dismissed | PASS — no Story 3.4-specific issues remaining |
| NFR patches | 0 new patches needed (all NFR-specific patches already applied) | PASS — all NFR patches verified in place |
| `ToolPillClassifierService` as regular provider | `streaming.module.ts:11` | PASS — not a Symbol-token test seam (DP-3) |
| `AgentServiceFake` faithful test double | `agent-service.fake.ts` | PASS — mimics production side effects (Turn persistence, terminateProcess, full tool call lifecycle) |

### Evidence Gaps

| Gap | Status | Impact |
|---|---|---|
| CI Burn-In | No burn-in execution results for Story 3.4 changes | Cannot verify test stability over 10 iterations |
| Vulnerability Scan | No npm audit/Snyk in CI pipeline (project-wide, pre-existing) | Unknown vulnerability exposure |
| Coverage Report | No coverage threshold in CI (pre-existing) | No coverage regression detection |
| Monitoring | No Sentry/APM/structured logging in apps/web (pre-existing) | Production failures invisible to operators |
| NFR-P1 Timing Test | No timing test for first token ≤1,500ms (requires real Daytona sandbox + Claude API key) | First-token latency not measured end-to-end |
| Circuit Breaker Timeout Tuning | 120s default not empirically validated | May be too short for complex operations or too long for stall detection |
| Heartbeat Interval Tuning | 15s default not empirically validated | Too frequent wastes bandwidth; too infrequent delays dead-connection detection |
| Worker Handle Leak | Stalled generators in `agent.service.unit.spec.ts` keep handles alive | Jest force-exit warning; not a production issue |

---

## Step 4: NFR Evidence Evaluation

### Performance Assessment

#### Response Time (NFR-P1 — First token ≤1,500ms)

- **Status:** CONCERNS
- **Threshold:** ≤1,500ms (NFR-P1 — first token appears within 1,500ms of user message)
- **Actual:** Story 3.4 adds tool call lifecycle events to the existing SSE stream. The classifier runs after `TOOL_CALL_RESULT` (not on the first-token hot path). `select` projections on all Story 3.4 Prisma queries reduce DB transfer. However, no timing test exists — empirical validation requires a real Daytona sandbox + Claude API key.
- **Evidence:** `agent.service.ts:402-429` (classifier after TOOL_CALL_RESULT), `tool-pill-classifier.service.ts:117-126` (select projections)
- **Findings:** NFR-P1 timing test deferred to integration testing (requires real sandbox + API key)

#### Throughput

- **Status:** PASS
- **Threshold:** No formal throughput SLO defined for MVP
- **Actual:** Classifier does 2 DB round-trips per `git commit` tool result (both with `select` projections). `pendingClassifierPromises` bounded by tool calls per run, cleared in `finally`. No new `findMany` queries. Circuit breaker (120s) prevents stalled agents from consuming resources.
- **Evidence:** `tool-pill-classifier.service.ts:117-126`, `agent.service.ts:108-111,219-273`

#### Resource Usage

- **Status:** PASS
- **Threshold:** No formal resource thresholds for MVP
- **Actual:** `AgentService` holds 7 in-process `Map`s — bounded by active conversations. `pendingClassifierPromises` bounded by tool calls per run. SSE back-pressure caps pending events at 200 per connection. `select` projections reduce memory per query. `SendMessageDto.max(10_000)` bounds DB write size. `OnModuleDestroy` cleans up all Maps and timers on shutdown. Timer `.unref()` prevents clean process exit block.
- **Evidence:** `agent.service.ts:35-41,130-137,202-217,223,235`, `streaming.controller.ts:79-112,96`

#### Scalability

- **Status:** CONCERNS
- **Threshold:** MVP scale (single-tenant, small user count, ≤10 concurrent conversations)
- **Actual:** 7 in-process `Map`s for agent/tool-call tracking (documented single-container constraint). No concurrent-turn guard (deferred — post-MVP). All Prisma queries have `select` projections. `pendingClassifierPromises` cleared in `finally`. Circuit breaker prevents resource leaks from stalled agents.
- **Evidence:** `agent.service.ts:35-41,144-152`, `conversations.service.ts:21-22`
- **Recommendation:** Add concurrent-turn guard (deferred — post-MVP, Story 3.11 scope)

---

### Security Assessment

#### Authentication Strength

- **Status:** PASS
- **Threshold:** Boundary JWT (HS256, 8h expiry, `jose` library)
- **Actual:** No new endpoints in Story 3.4. `BoundaryJwtGuard` + `ActiveUserGuard` on all agent-be endpoints (unchanged from Story 3.3). `StreamingController` validates JWT from `Authorization` header or `?token=` query param.
- **Evidence:** `streaming.controller.ts:31-59`

#### Authorization Controls (NFR-S2)

- **Status:** PASS
- **Threshold:** Tenant-scoped credential/token lookups; tokens never resolved across users
- **Actual:** `ToolPillClassifierService` does `repoConnection.findUnique({ where: { userId } })` — the `userId` filter IS the tenant authorization check. `artifact.findFirst({ where: { repoConnectionId, path } })` — `repoConnectionId` derived from the user's own `repoConnection`. All `select` projections exclude token fields.
- **Evidence:** `tool-pill-classifier.service.ts:117-126` (schema verified: `userId` is `@unique` on `RepoConnection`)

#### Data Protection (NFR-S4)

- **Status:** PASS
- **Threshold:** AES-256-GCM encryption at rest; tokens never returned to client
- **Actual:** Story 3.4 imports no crypto/token modules. `ToolPillClassifierService` queries `Artifact` table only (no token fields). `select` projections exclude token fields on all queries.
- **Evidence:** `tool-pill-classifier.service.ts:1-5` (no crypto imports), `tool-pill-classifier.service.ts:117-126` (select projections)

#### Vulnerability Management

- **Status:** CONCERNS
- **Threshold:** No formal vulnerability scan threshold defined
- **Actual:** No npm audit/Snyk in CI pipeline; no security headers in `next.config.js` (project-wide, pre-existing). `SendMessageDto.max(10_000)` bounds input. `X-Content-Type-Options: nosniff` on SSE response. No shell commands with user-controlled values (agent invocation uses SDK). `CIRCUIT_BREAKER_TIMEOUT_MS` env var validated with NaN fallback.
- **Evidence:** `.github/workflows/test.yml` (no security scan job), `streaming.controller.ts:74`, `agent.service.ts:24-27,73-82`
- **Recommendation:** Add security headers to `next.config.js`; add `npm audit` job to CI (project-wide, not Story 3.4-specific)

---

### Reliability Assessment

#### Circuit Breaker (AC-5)

- **Status:** PASS
- **Threshold:** Stalled/crashed agent terminated; heartbeat detects dead connections
- **Actual:** Circuit breaker implemented as a per-run timer in `AgentService.runTurn` (120s default, configurable via `CIRCUIT_BREAKER_TIMEOUT_MS`). Timer resets on every emitted event (`resetCircuitBreakerTimer` in the `while` loop). If the timer fires (no events for 120s during an active run): `abortController.abort()` + `query.interrupt()` + `terminateProcess` (fire-and-forget) + `RUN_ERROR` with user-friendly message. Timer cleared in `finally`, `stop()`, and `onModuleDestroy()`. Race with `stop()` prevented (checks `aborted` flag). SSE heartbeat (15s interval) writes comment frames to `res`, cleared on close/complete/error. Back-pressure (200 events, 30s drain → STREAM_ERROR) unchanged from Story 3.3.
- **Evidence:** `agent.service.ts:50-273`, `streaming.controller.ts:89-105`
- **Findings:** This resolves the Story 3.3 deferred finding "No circuit breaker on sandbox-agent crash/stall (Story 3.4 scope)."

#### Error Handling (NFR-R3 — SSE Back-pressure)

- **Status:** PASS
- **Threshold:** SSE back-pressure (200 events, 30s drain → STREAM_ERROR); no silent event drops
- **Actual:** `StreamingController` tracks per-connection pending events (unchanged from Story 3.3). Story 3.4 adds heartbeat cleanup to the back-pressure path (`cleanupAll()` called before `subscription.unsubscribe()` and `res.end()`). `STREAM_ERROR` written directly to `res` (not via `SessionEventsService.emit()`).
- **Evidence:** `streaming.controller.ts:79-137`

#### Fault Tolerance

- **Status:** PASS
- **Threshold:** Graceful degradation; no silent failures
- **Actual:** `AgentService` catch block emits `RUN_ERROR` (no partial response persisted). `AgentService.stop()` aborts cleanly. Circuit breaker handles stalled/crashed agents. `ToolPillClassifierService` Postgres lookup failure → `logger.warn()` + degraded `viewHref = '/artifacts'` (functional fallback). `ConversationPane` handles all SSE error states (RUN_ERROR, STREAM_ERROR as system messages). Failed tool calls render as error-state Tool Pills. `abortPromise` listener uses `{ once: true }` (no leak). Pending classifier promises awaited before `RUN_FINISHED`. `processAssistantMessage` normalizes content to string (handles array content). `content_block_stop` handler split for text/tool_use (no spurious TEXT_MESSAGE_END).
- **Evidence:** `agent.service.ts:62-68,84-92,99-128,108-111,219-273,342-363,385-390`, `tool-pill-classifier.service.ts:135-139`, `ConversationPane.tsx:280-378`
- **Findings:** All 17 review patches applied (verified in code). This is a significant reliability improvement over Story 3.3.

#### Monitoring & Observability

- **Status:** CONCERNS
- **Threshold:** No formal monitoring threshold defined for MVP
- **Actual:** NestJS `Logger` present in `AgentService` (`error` on run failure, `warn` on stop/interrupt failure, `warn` on circuit breaker fire, `log` on module destroy), `StreamingController` (SSE stream errors), `ToolPillClassifierService` (`warn` on Postgres lookup failure). No structured JSON logging, no correlation IDs, no Sentry/APM, no `/metrics` endpoint (pre-existing, project-wide).
- **Evidence:** `agent.service.ts:34,138,178,184,251,258,264`, `streaming.controller.ts:144`, `tool-pill-classifier.service.ts:136-138`
- **Recommendation:** Add structured JSON logging; install Sentry; add `/metrics` endpoint (project-wide, not Story 3.4-specific)

#### CI Burn-In (Stability)

- **Status:** CONCERNS
- **Threshold:** 10 consecutive successful runs (CI burn-in)
- **Actual:** Burn-in job exists in CI (10 iterations on PRs + weekly) but no execution results available for Story 3.4 changes
- **Evidence:** `.github/workflows/test.yml:156-229`
- **Findings:** Cannot verify burn-in passes for Story 3.4 changes

---

### Maintainability Assessment

#### Test Coverage

- **Status:** PASS
- **Threshold:** No hard coverage % threshold; P0 tests must cover all ACs
- **Actual:** 651 tests across 57 suites — ALL PASSING (agent-be 3.2s, web 6.2s); all 5 ACs have direct P0 coverage (49 new tests: 39 P0, 10 P1 across 7 files)
- **Evidence:** `yarn nx test agent-be` + `yarn nx test web` (this session); `test-review-3-4.md`

#### Code Quality

- **Status:** PASS
- **Threshold:** 0 lint errors (within baseline)
- **Actual:** 0 errors (agent-be 12 warnings, web 10 warnings — baseline); typecheck clean; 17 code-review patches applied; 0 new NFR patches needed (all NFR-specific patches already applied during implementation and review)
- **Evidence:** `yarn nx lint agent-be` + `yarn nx lint web`; `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json` (this session)

#### Technical Debt

- **Status:** CONCERNS
- **Threshold:** No formal debt ratio threshold
- **Actual:** 6 code-review deferred items (parallel/interleaved tool calls, multi-artifact commits, MODIFY commits, `onModuleDestroy` doesn't call `terminateProcess`, circuit breaker timer orphaning, `Date.now()` collisions). 10 NFR deferred findings (all pre-existing from Stories 3.2/3.3 or project-wide). The Story 3.4-specific deferrals are appropriate for MVP scope (DP-5).
- **Evidence:** Story 3.4 Review Findings — Deferred section; NFR Review Findings — Deferred section below

#### Test Quality

- **Status:** PASS
- **Threshold:** Test quality DoD (deterministic, isolated, <300 lines, <1.5 min)
- **Actual:** 651 tests pass in ~9.4s total (agent-be 3.2s + web 6.2s). Test review: 88/100 (B). Stale "TDD RED PHASE" headers (4 files) and worker handle leak (stalled generators) are MEDIUM test-quality findings — not NFR concerns. Automate validation: PASS.
- **Evidence:** `test-review-3-4.md`; test execution this session

---

## Step 5: Final NFR Evidence Audit Report

**Date:** 2026-07-04
**Story:** 3.4 — See Tool Calls and Recognized Actions Inline
**Overall Status:** CONCERNS

---

Note: This audit summarizes existing implementation evidence; it does not run tests or CI workflows. NFR thresholds and planned evidence come from PRD, architecture, and `test-design` outputs.

### Executive Summary

**Assessment:** 20 PASS, 6 CONCERNS, 0 FAIL

**Blockers:** 0 — no FAIL status NFRs

**High Priority Issues:** 0 — all Story 3.4-specific NFR concerns are either pre-existing project-wide issues or deferred to integration testing (NFR-P1 timing).

**NFR Patches Applied:** 0 new patches — all NFR-specific patches were already applied during implementation and review:
- `select` projections on all 4 Story 3.4 Prisma queries (Performance) — applied during implementation
- Timer `.unref()` on circuit breaker and heartbeat (Reliability) — applied as review patches
- `{ once: true }` on abort event listener (Reliability) — applied as review patch
- `CIRCUIT_BREAKER_TIMEOUT_MS` NaN fallback (Reliability/Security) — applied as review patch
- `logger.warn()` in classifier catch block (Reliability) — applied during implementation

**Recommendation:** Approve. Story 3.4's implementation is well-engineered across all four NFR domains. NFR-S2 (tenant scoping) PASSES — `repoConnection.findUnique({ where: { userId } })` + `artifact.findFirst({ where: { repoConnectionId, path } })` with `select` projections. NFR-S4 (encryption) PASSES — no crypto/token imports, `select` projections exclude token fields. AC-5 (circuit breaker + heartbeat) PASSES — 120s timeout with event-based reset, 15s heartbeat with cleanup, `RUN_ERROR` + `terminateProcess` on fire. This resolves the Story 3.3 deferred finding "No circuit breaker on sandbox-agent crash/stall (Story 3.4 scope)." The 17 review patches address all reliability concerns (abort listener leak, pending classifier promises, content normalization, content_block_stop split, back-pressure cleanup, res.end try/catch, timer .unref(), NaN fallback, race with stop(), regex fixes). The remaining CONCERNS are all pre-existing, project-wide issues (no monitoring, no vulnerability scan, no CI burn-in results, no NFR-P1 timing test) or require dev-step analysis (concurrent-turn guard, transaction wrap, fetch timeout, take limit). None block MVP launch at current scale.

---

### NFR-Specific Patches Applied

**0 new patches applied in this audit.** All NFR-specific patches were already in place (applied during implementation and review). Verified:

| # | Patch | Category | File | Status |
|---|---|---|---|---|
| 1 | `select` projection on `turn.create` in `AgentService` | Performance | `agent.service.ts:126` | Verified (from Story 3.3 NFR patch) |
| 2 | `select` projection on `conversation.update` in `AgentService` | Performance | `agent.service.ts:131` | Verified (from Story 3.3 NFR patch) |
| 3 | `select` projection on `repoConnection.findUnique` in classifier | Performance | `tool-pill-classifier.service.ts:119` | Verified (applied during implementation) |
| 4 | `select` projection on `artifact.findFirst` in classifier | Performance | `tool-pill-classifier.service.ts:125` | Verified (applied during implementation) |
| 5 | Timer `.unref()` on circuit breaker timers | Reliability | `agent.service.ts:223,235` | Verified (review patch) |
| 6 | Timer `.unref()` on heartbeat interval | Reliability | `streaming.controller.ts:96` | Verified (review patch) |
| 7 | `{ once: true }` on abort event listener | Reliability | `agent.service.ts:66` | Verified (review patch) |
| 8 | `CIRCUIT_BREAKER_TIMEOUT_MS` NaN fallback | Reliability/Security | `agent.service.ts:24-27` | Verified (review patch) |
| 9 | `logger.warn()` in classifier catch block | Reliability | `tool-pill-classifier.service.ts:136-138` | Verified (applied during implementation) |

**Patches NOT applied (out of scope per user instructions):**

| # | Considered | Why Not Applied |
|---|---|---|
| 1 | `AbortSignal.timeout()` on `ConversationPane` fetch calls (startSession, fetchSkills, sendMessage, handleStop) | Requires error handling changes (distinguishing abort errors from network errors) and careful test interaction analysis (fake timers in `ConversationPane.test.tsx`). Deferred from Story 3.2/3.3 NFR assessments — belongs in a dev step, not an NFR patch. Deferred. |
| 2 | `take` limit on `turn.findMany` in `page.tsx` | Pre-existing from Story 3.3. Would change behavior (pagination — older messages beyond the limit wouldn't load). Feature change, not a pure NFR patch. Deferred. |
| 3 | `select` projection on `turn.create` in `sendTurn` | Pre-existing from Story 3.2. Result not used. Not Story 3.4-specific. Deferred. |
| 4 | `select` projection on `conversation.update` in `sendTurn` | Pre-existing from Story 3.2. Results not used. Not Story 3.4-specific. Deferred. |
| 5 | Security headers in `next.config.js` | Project-wide concern, not Story 3.4-specific. Already recommended in Stories 2.4, 2.6, 3.2, and 3.3 NFR assessments. |
| 6 | `npm audit`/Snyk in CI | Project-wide concern, not Story 3.4-specific. |
| 7 | NFR-P1 timing test (first token ≤1,500ms) | Requires real Daytona sandbox + Claude API key — not feasible in unit/component tests. Deferred to integration testing. |
| 8 | Concurrent-turn guard on backend | Post-MVP hardening (noted in story deferred findings, Story 3.11 scope). MVP assumes authenticated, non-adversarial users. |
| 9 | Transaction wrap on `sendTurn` multi-write | Pre-existing from Story 3.2. Requires mock Prisma updates in `conversations.service.spec.ts`. Belongs in a dev step, not an NFR patch. Deferred. |
| 10 | Circuit breaker timeout empirical validation | 120s default is a reasonable starting point but not empirically validated. Tuning requires real-world usage data. Deferred to production tuning. |
| 11 | Heartbeat interval empirical validation | 15s default is a common SSE heartbeat interval but not empirically validated. Tuning requires real-world usage data. Deferred to production tuning. |

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

**Improvement vs Story 3.3 baseline:** Story 3.3 scored 19/29 (66%) with 19 PASS, 7 CONCERNS, 3 N/A. Story 3.4 scores 20/29 (69%) with 20 PASS, 6 CONCERNS, 3 N/A. **+1 improvement** — criterion 3.4 (Circuit Breakers) promoted from CONCERNS to PASS. The circuit breaker (120s timeout, event-based reset, `RUN_ERROR` + `terminateProcess`) and SSE heartbeat (15s interval, cleanup on close/complete/error) resolve the Story 3.3 deferred finding "No circuit breaker on sandbox-agent crash/stall (Story 3.4 scope)." The DR criteria (4.1-4.3) remain N/A for Story 3.4 (stateless service, infrastructure-level concern) — same as Story 3.3.

**Key AC-5 (Circuit Breaker + Heartbeat) — PASS:** The 120s circuit breaker timeout with event-based reset, `RUN_ERROR` with user-friendly message, `terminateProcess` before emit, timer cleanup in `finally`/`stop()`/`onModuleDestroy()`, and race-with-`stop()` prevention are all implemented and tested (6 P0 + 2 P1 tests in `agent.service.unit.spec.ts`). The 15s SSE heartbeat with try/catch on write, cleanup on close/complete/error, and `.unref()` are all implemented and tested (3 P0 + 2 P1 tests in `streaming.controller.spec.ts`). This is the primary NFR for Story 3.4 and it passes.

---

### Quick Wins

0 new quick wins identified — all NFR-specific patches were already applied during implementation and review.

---

### Recommended Actions

#### Immediate (Before Release) - CRITICAL/HIGH Priority

None — no FAIL status NFRs; no critical vulnerabilities; NFR-S2/S4/R3/AC-5 all PASS. All NFR-specific patches verified in place.

#### Short-term (Next Milestone) - MEDIUM Priority

1. **Add `AbortSignal.timeout()` on `ConversationPane` fetch calls** - MEDIUM - 2 hours - Dev
   - Browser→agent-be REST calls (startSession, fetchSkills, sendMessage, handleStop) have no timeout; stuck agent-be hangs UI
   - Deferred from Story 3.2/3.3 NFR assessments — coordinate fix across all 4 fetch calls
   - Requires error handling changes and test interaction analysis

2. **Add `take` limit to `turn.findMany`** - MEDIUM - 1 hour - Dev
   - `turn.findMany` on page load has no `take` limit — unbounded result set for conversations with many turns
   - Requires pagination behavior decision (feature change, not pure NFR patch)

3. **Wrap `sendTurn` multi-write in `$transaction`** - MEDIUM - 2 hours - Dev
   - `turn.create` + `conversation.update` are dependent writes; a mid-write failure leaves partial state
   - Pre-existing from Story 3.2; requires mock Prisma updates in `conversations.service.spec.ts`

4. **Add `select` projection on `turn.create` and `conversation.update` in `sendTurn`** - MEDIUM - 30 min - Dev
   - Pre-existing from Story 3.2; results not used; reduces return payload
   - Not Story 3.4-specific

5. **Add security headers to `next.config.js`** - MEDIUM - 1 hour - Dev
   - CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy (project-wide, pre-existing)

6. **Add `npm audit`/Snyk to CI** - MEDIUM - 2 hours - Dev
   - Dependency-vulnerability scanning (project-wide, pre-existing)

7. **Run Story 3.4 burn-in** - MEDIUM - 1 hour - DevOps
   - 10x tool call + circuit breaker + heartbeat cycles; verify no flakiness

8. **Add NFR-P1 timing test** - MEDIUM - 2 hours - QA
   - Requires real Daytona sandbox + Claude API key; deferred to integration testing

9. **Validate circuit breaker timeout (120s) and heartbeat interval (15s)** - LOW - Production tuning
   - Empirical validation requires real-world usage data

---

### Monitoring Hooks

4 monitoring hooks recommended (all pre-existing, project-wide):

#### Performance Monitoring

- [ ] Playwright trace artifact for tool pill + circuit breaker E2E — capture on every CI run
  - **Owner:** Dev/DevOps
  - **Deadline:** Next PR

#### Security Monitoring

- [ ] `npm audit` CI job — scan for critical/high vulnerabilities
  - **Owner:** Dev
  - **Deadline:** Next milestone

#### Reliability Monitoring

- [ ] Structured JSON logging in agent-be — `AgentService` circuit breaker fires, `StreamingController` back-pressure events, `ToolPillClassifierService` Postgres lookup failures
  - **Owner:** Dev
  - **Deadline:** Next milestone

- [ ] `/api/health` endpoint for apps/web — verify DATABASE_URL connectivity
  - **Owner:** Dev
  - **Deadline:** Next milestone

---

### Fail-Fast Mechanisms

3 fail-fast mechanisms recommended (all pre-existing, project-wide):

#### Circuit Breakers (Reliability)

- [x] Circuit breaker on stalled/crashed agent — implemented in Story 3.4 (120s timeout, event-based reset, `RUN_ERROR` + `terminateProcess`)
- [ ] Transaction wrap on `sendTurn` multi-write — prevent partial state on mid-write failure
  - **Owner:** Dev
  - **Estimated Effort:** 2 hours

#### Rate Limiting (Performance)

- [ ] Per-user rate limiting on `POST /:id/turns` — prevent message burst-load
  - **Owner:** Dev
  - **Estimated Effort:** 4 hours

#### Validation Gates (Security)

- [ ] Security headers in `next.config.js` — CSP, X-Frame-Options, etc.
  - **Owner:** Dev
  - **Estimated Effort:** 1 hour

---

### Evidence Gaps

8 evidence gaps identified:

- [ ] **CI Burn-In (Reliability)** — No burn-in execution results for Story 3.4 changes
  - **Owner:** DevOps
  - **Suggested Evidence:** CI burn-in run artifacts
  - **Impact:** Cannot verify test stability over 10 iterations

- [ ] **Vulnerability Scan (Security)** — No npm audit/Snyk in CI
  - **Owner:** Dev
  - **Suggested Evidence:** `npm audit` CI job results
  - **Impact:** Unknown vulnerability exposure

- [ ] **Coverage Report (Maintainability)** — No coverage threshold in CI
  - **Owner:** Dev
  - **Suggested Evidence:** Coverage report from `yarn nx test --coverage`
  - **Impact:** No coverage regression detection

- [ ] **Monitoring (Reliability)** — No Sentry/APM/structured logging
  - **Owner:** Dev/DevOps
  - **Suggested Evidence:** Sentry dashboard, structured log output
  - **Impact:** Production failures invisible to operators

- [ ] **NFR-P1 Timing Test (Performance)** — No timing test for first token ≤1,500ms
  - **Owner:** QA
  - **Suggested Evidence:** E2E timing test with real Daytona sandbox + Claude API key
  - **Impact:** First-token latency not measured end-to-end

- [ ] **Circuit Breaker Timeout Tuning (Reliability)** — 120s default not empirically validated
  - **Owner:** Dev/QA
  - **Suggested Evidence:** Integration test with real agent workloads of varying duration
  - **Impact:** May be too short for complex operations or too long for stall detection

- [ ] **Heartbeat Interval Tuning (Reliability)** — 15s default not empirically validated
  - **Owner:** Dev/QA
  - **Suggested Evidence:** Integration test with simulated network latency
  - **Impact:** Too frequent wastes bandwidth; too infrequent delays dead-connection detection

- [ ] **Worker Handle Leak (Maintainability)** — Stalled generators in `agent.service.unit.spec.ts` keep handles alive
  - **Owner:** Dev
  - **Suggested Evidence:** `jest --detectOpenHandles` clean output
  - **Impact:** Jest force-exit warning; not a production issue but indicates test isolation gap

---

### Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-07-04'
  story_id: '3.4'
  feature_name: 'See Tool Calls and Recognized Actions Inline'
  adr_checklist_score: '20/29'
  categories:
    testability_automation: 'PASS'
    test_data_strategy: 'PASS'
    scalability_availability: 'PASS'
    disaster_recovery: 'N/A'
    security: 'PASS'
    monitorability: 'CONCERNS'
    qos_qoe: 'PASS'
    deployability: 'CONCERNS'
  overall_status: 'CONCERNS'
  critical_issues: 0
  high_priority_issues: 0
  medium_priority_issues: 9
  concerns: 6
  blockers: false
  quick_wins: 0
  evidence_gaps: 8
  nfr_patches_applied: 0
  nfr_patches_verified: 9
  nfr_patches_verified_detail:
    - 'select projection on turn.create in AgentService (agent.service.ts:126) — from Story 3.3'
    - 'select projection on conversation.update in AgentService (agent.service.ts:131) — from Story 3.3'
    - 'select projection on repoConnection.findUnique in classifier (tool-pill-classifier.service.ts:119)'
    - 'select projection on artifact.findFirst in classifier (tool-pill-classifier.service.ts:125)'
    - 'timer .unref() on circuit breaker timers (agent.service.ts:223,235) — review patch'
    - 'timer .unref() on heartbeat interval (streaming.controller.ts:96) — review patch'
    - '{ once: true } on abort event listener (agent.service.ts:66) — review patch'
    - 'CIRCUIT_BREAKER_TIMEOUT_MS NaN fallback (agent.service.ts:24-27) — review patch'
    - 'logger.warn() in classifier catch block (tool-pill-classifier.service.ts:136-138)'
  recommendations:
    - 'All NFR-specific patches verified in place — no new patches needed'
    - 'Add AbortSignal.timeout() on ConversationPane fetch calls (MEDIUM, deferred from Story 3.2/3.3)'
    - 'Add take limit to turn.findMany (MEDIUM, requires pagination behavior decision)'
    - 'Wrap sendTurn multi-write in $transaction (MEDIUM, pre-existing from Story 3.2)'
    - 'Add select projections on turn.create and conversation.update in sendTurn (MEDIUM, pre-existing from Story 3.2)'
    - 'Add security headers to next.config.js (MEDIUM, project-wide)'
    - 'Run Story 3.4 burn-in (MEDIUM, verify test stability)'
    - 'Add NFR-P1 timing test (MEDIUM, requires real sandbox + API key)'
    - 'Validate circuit breaker timeout and heartbeat interval (LOW, production tuning)'
```

---

### Related Artifacts

- **Story File:** `_bmad-output/implementation-artifacts/3-4-see-tool-calls-and-recognized-actions-inline.md`
- **Architecture:** `_bmad-output/planning-artifacts/architecture.md`
- **PRD:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`
- **Test Design:** `_bmad-output/test-artifacts/test-design-architecture.md`
- **Test Review:** `_bmad-output/test-artifacts/test-reviews/test-review-3-4.md` (88/100, B — approved with comments)
- **Predecessor Assessment:** `_bmad-output/test-artifacts/nfr-assessment-3-3.md` (CONCERNS, 19/29)
- **Evidence Sources:**
  - Test Results: `yarn nx test agent-be` — 80 tests, 7 suites, 3.2s; `yarn nx test web` — 571 tests, 50 suites, 6.2s
  - Lint: `yarn nx lint agent-be` — 0 errors, 12 warnings (baseline); `yarn nx lint web` — 0 errors, 10 warnings (baseline)
  - Typecheck: `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json` — clean
  - CI: `.github/workflows/test.yml` — lint → unit → E2E (4 shards) → burn-in (10 iterations)

---

### Recommendations Summary

**Release Blocker:** None — no FAIL status NFRs; no critical vulnerabilities; NFR-S2/S4/R3/AC-5 all PASS.

**High Priority:** None — all Story 3.4-specific NFR concerns are either pre-existing project-wide issues or deferred to integration testing.

**Medium Priority:** Add `AbortSignal.timeout()` on fetch calls, add `take` limit to `turn.findMany`, wrap `sendTurn` in `$transaction`, add `select` projections on `sendTurn` writes, add security headers, add `npm audit` to CI, run burn-in, add NFR-P1 timing test (all pre-existing or requiring dev-step analysis).

**Next Steps:** Story 3.4 is approved. All NFR-specific patches are verified in place (0 new patches needed). Re-run `*nfr-assess` after CI burn-in results are available to verify CONCERNS → PASS promotion for CI Burn-In criterion.

---

### Sign-Off

**NFR Evidence Audit:**

- Overall Status: CONCERNS
- Critical Issues: 0
- High Priority Issues: 0
- Concerns: 6
- Evidence Gaps: 8
- NFR Patches Applied: 0 (new)
- NFR Patches Verified: 9 (already in place)

**Gate Status:** CONCERNS — all remaining concerns are pre-existing, project-wide issues (no monitoring, no vulnerability scan, no CI burn-in results, no NFR-P1 timing test) or require dev-step analysis (concurrent-turn guard, transaction wrap, fetch timeout, take limit). No Story 3.4-specific concerns remain.

**Next Actions:**

- If PASS: Proceed to `*gate` workflow or release
- If CONCERNS: Address HIGH/CRITICAL issues, re-run `*nfr-assess`
- If FAIL: Resolve FAIL status NFRs, re-run `*nfr-assess`

**Generated:** 2026-07-04
**Workflow:** testarch-nfr v5.0

---

<!-- Powered by BMAD-CORE™ -->
