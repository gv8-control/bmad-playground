---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-07-14'
inputDocuments:
  - '_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/adr-quality-readiness-checklist.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/nfr-criteria.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/test-levels-framework.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/risk-governance.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/test-quality.md'
  - '_bmad/tea/config.yaml'
  - '_bmad-output/test-artifacts/traceability-matrix.md (2026-07-14 Epic 4 extension)'
  - '_bmad-output/implementation-artifacts/bug-hunt-epic-4.md'
  - '_bmad-output/implementation-artifacts/epic-4-retro-2026-07-14.md'
  - '_bmad-output/implementation-artifacts/sprint-status.yaml'
---

# Test Design Progress

## Step 1: Detect Mode & Prerequisites

**Mode:** System-Level Test Design

**Rationale:** Project has both PRD (`_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`) and an architecture document (`_bmad-output/planning-artifacts/architecture.md`), plus a finalized epics/stories document (`_bmad-output/planning-artifacts/epics.md`). User was asked to disambiguate scope since both PRD/ADR and Epic/Stories exist; user selected **System-Level**.

**Prerequisite check:**
- PRD: present (572 lines)
- Architecture/ADR doc: present (778 lines, contains architecture decisions)
- Source code/frameworks: not yet initiated (greenfield)
- Sprint planning: not yet started

Prerequisites satisfied. Proceeding to Step 2 (Load Context).

## Step 2: Load Context & Knowledge Base

**Configuration loaded** (`_bmad/tea/config.yaml`):
- `tea_use_playwright_utils`: true
- `tea_use_pactjs_utils`: false
- `tea_pact_mcp`: none
- `tea_browser_automation`: auto
- `test_stack_type`: auto
- `test_artifacts`: `_bmad-output/test-artifacts`

**Stack detection:** Repository is greenfield — no scaffolded code, no `package.json`, no framework config files exist yet (confirmed via filesystem scan). `test_stack_type=auto` could not detect a stack from the filesystem; the **planned** stack was instead extracted from the architecture document:

- `detected_stack`: **fullstack** (planned) — Next.js 15 BFF/frontend (`apps/web`) + NestJS agent orchestrator backend (`apps/agent-be`), Nx monorepo, pnpm
- Data layer: PostgreSQL via single shared Prisma schema (`libs/database-schemas`)
- External dependency: Daytona Cloud (sandbox orchestration), Claude Agent SDK + sandbox-agent (JSONL→AG-UI bridge)
- Realtime transport: SSE (AG-UI event stream), requires HTTP/2
- Auth: GitHub OAuth via Auth.js v5 (beta), boundary JWT between `apps/web` and `apps/agent-be`

**Project artifacts loaded:**
- PRD (`prd.md`): 19 FRs across 5 feature areas (Repository Connection & Onboarding, Project Map, Conversations, Artifact Browser, Authentication & Access Control); NFRs across Security (S1–S4), Performance (P1–P5), Reliability (R1–R4), Observability (O1)
- Architecture (`architecture.md`): full technical decisions, project structure, requirements-to-structure mapping, architectural risk findings (pre-mortem pass), gap analysis — status "READY WITH MINOR GAPS"
- Epics (`epics.md`): loaded for scope cross-reference (epic-level breakdown of the same FRs)

**Knowledge fragments loaded (System-Level Mode, core/extended tier):**
- `adr-quality-readiness-checklist.md` — 8-category/29-criteria testability & NFR framework
- `nfr-criteria.md` — Security/Performance/Reliability/Maintainability validation criteria & gate matrix
- `test-levels-framework.md` — unit/integration/E2E selection rules
- `risk-governance.md` — probability×impact scoring, gate decision rules
- `test-quality.md` — test Definition of Done

**Not loaded (not applicable yet):**
- Playwright Utils detailed fixture fragments (overview/api-request/auth-session/recurse) — deferred to epic-level/implementation-time test design once test files exist; no test directory exists yet to detect API-only vs UI+API profile
- `playwright-cli.md` browser exploration — no running application to explore (greenfield, pre-implementation)
- Pact.js / contract-testing fragments — `tea_use_pactjs_utils` is disabled and no microservices/contract-testing indicators in architecture (single NestJS backend, no service-to-service REST contracts per architecture's locked decision)

**Confirmed with user:** proceeding with this context; no missing inputs blocking Step 3.

## Step 3: Testability & Risk Assessment

### 🚨 Testability Concerns

1. **No documented Daytona/sandbox-agent test double.** `apps/agent-be/src/sandbox/` (provision/clone/resume/destroy, git config injection) is the controllability bottleneck for nearly every Conversation-path requirement (FR-9–FR-15). Architecture names no mock/fake/contract-test boundary for `@daytonaio/sdk` or the sandbox-agent JSONL stream. Without one, integration tests either hit real Daytona Cloud (slow, costly, flaky) or remain unwritten. **Action:** define a `SandboxService` test seam (interface + fake implementation) before `sandbox.service.ts` is implemented.
2. **No test-data seeding strategy for Postgres.** `libs/database-schemas` defines schema/migrations but no factory/seeding pattern for Conversation, Artifact, RepoConnection, or credential-health rows. **Action:** establish factory functions and a transactional-rollback or truncate-between-tests pattern early (Implementation Sequence step 2 is the natural insertion point).
3. **SSE/AG-UI stream is hard to assert on deterministically.** FR-10 (token streaming), FR-12 (Tool/Semantic Pill classification), NFR-R3 (back-pressure), NFR-R4 (10 concurrent connections) all ride one SSE channel. Architecture references a "recorded BMAD session replay" used for sandbox-agent/AG-UI package upgrade validation (Technical Constraints) — this fixture should be reused as the canonical test fixture for the event-bridge and classifier rather than invented separately by QA.
4. **NFR-P1–P5 latency targets are currently verified by a single manual run, not automated measurement** (PRD §7, explicit caveat). No load-testing tool (k6, Artillery) is named anywhere in the architecture document. Automated, repeatable latency assertions cannot exist until one is chosen and wired into CI.
5. **Two PRD Open Questions are direct NFR test blockers, not yet resolved:** Q-1 (repository size boundary for NFR-P2 — "asserted, not empirically validated") and Q-2 (Daytona compute cost estimate, feeds NFR-O1 budget-alert thresholds). Test design cannot assign pass/fail thresholds for these until the architect/PM resolve them.
6. **GitHub org-OAuth-restriction path (FR-1, FR-2) depends on an external GitHub organization with App-restriction policy enabled.** No fixture/mock GitHub org or recorded HTTP cassette is specified for repeatably testing the 403 org-restriction error path without a real restricted org.
7. **Concurrent-write/last-write-wins behavior (PRD §8, "Main branch only") requires orchestrating two simultaneous Sandboxes committing to the same Artifact path** — no multi-session test harness is described; this is a coordination-heavy integration test, not a unit test, and should be flagged early as effort.
8. **Single-container graceful-shutdown draining (NestJS shutdown hooks) has no stated test trigger** — verifying "drain SSE connections rather than hard-kill" requires a way to deterministically invoke shutdown mid-stream in a test environment.

### ✅ Testability Assessment Summary (existing strengths)

- **No client-side caching/revalidation** (manual-reload-only refresh model) removes an entire class of cache-invalidation flakiness from `apps/web` tests — Server Component renders are a pure function of Postgres state at request time.
- **Single shared Prisma schema** (`libs/database-schemas`) eliminates dual-schema drift risk that would otherwise require cross-service contract tests.
- **Consistent `{ code, message, meta }` error envelope** and one validation library (Zod/`nestjs-zod`) across `apps/agent-be` makes negative-path API testing uniform and predictable — one assertion pattern covers all controllers.
- **Architecture's own pre-mortem pass already identified and structurally resolved two of the higher-risk gaps** (NFR-R1 credential-failure propagation → `tool-pill-classifier.service.ts`; runaway-agent-on-crash → backend-initiated process termination) before any code exists — test design can target these named components directly rather than inventing the requirement.
- **`apps/agent-be` is the sole Daytona-credential holder** with a single authenticated-context path (`boundary-jwt.guard.ts` → `active-user.guard.ts` → `@User()` decorator) — narrows tenant-isolation testing to one enforcement point instead of per-controller checks.

### Architecturally Significant Requirements (ASRs)

| Requirement | Classification | Why |
|---|---|---|
| FR-9/FR-10 (sandbox readiness ≤10s, streaming chat) | **ACTIONABLE** | Drives sandbox provisioning strategy and SSE transport; no test double exists yet (Concern #1) |
| FR-11 (10 concurrent Conversations / NFR-R4) | **ACTIONABLE** | Determines SSE connection ceiling and HTTP/2 deployment invariant; silent failure mode if misconfigured |
| FR-12 (Tool Pills / Semantic Pills) | **ACTIONABLE** | Real-time event classification on the streaming path; needs the session-replay fixture (Concern #3) |
| FR-14/FR-15 (Working Tree Indicator / Manual Commit) | **ACTIONABLE** | Backend must query/act on git state between turns, independent of the agent — needs `working-tree.service.ts` test seam |
| FR-3 (Commit Attribution) | **ACTIONABLE** | Per-session git config injection must be verified on every provision *and* every resume, not just first provision |
| NFR-S1–S4 (Security) | **ACTIONABLE** | Tenant isolation, encryption, sandbox network isolation — P0 test priority by definition |
| NFR-R1–R4 (Reliability) | **ACTIONABLE** | NFR-R3 lacks a quantitative threshold (Concern, see NFR Planning below) |
| NFR-O1 (Cost observability) | **ACTIONABLE** | Budget alert thresholds are explicitly TBD pending Q-2 — convert to risk, not a testable target yet |
| NFR-P1–P5 (Performance) | **ACTIONABLE** | Currently manually verified only; no automation tool named (Concern #4) |
| NFR-S3 (Active sandbox termination on deactivation) | **FYI** | Explicitly deferred to post-MVP in architecture; no enforcement mechanism exists in MVP scope to test |
| sandbox-agent / AG-UI package pinned-version upgrade discipline | **FYI** | Operational/process control, not a feature behavior to test directly; relevant to regression risk on dependency bumps |
| Auth.js v5 beta contingency | **FYI** | Documented risk, no mitigating code to test until a forced upgrade occurs |

### Risk Assessment Matrix

Scoring: Probability (1–3) × Impact (1–3) = Score (1–9). Score ≥6 requires mitigation owner + timeline; score = 9 would block the gate (none identified at this pre-implementation stage).

| ID | Category | Risk | P | I | Score | Mitigation | Owner | Timeline |
|---|---|---|---|---|---|---|---|---|
| R-01 | SEC | Cross-tenant credential leak if any code path resolves an OAuth token without the tenant check (NFR-S2) | 2 | 3 | **6** | Single enforcement point already designed (`active-user.guard.ts` + `credentials.service.ts`); add a P0 test asserting every credential-resolving call site is covered, plus a negative integration test attempting cross-user token resolution | Backend lead | Before `credentials.service.ts` ships (Implementation Sequence step 6) |
| R-02 | TECH/OPS | sandbox-agent crash leaves Claude Code agent running unsupervised, able to keep committing with no SSE listener | 2 | 3 | **6** | Architecture already specifies backend-initiated process termination via Daytona process API on bridge death; need a test that kills the bridge mid-session and asserts the agent process is terminated, not just that an error event is emitted | Backend lead | Implementation Sequence step 8 (AG-UI event proxying) |
| R-03 | PERF | NFR-P2 (10s chat-ready) threshold validated only by single manual run; repo-size boundary (~200MB) asserted but not empirically tested (PRD Q-1, open) | 3 | 2 | **6** | Architect to resolve Q-1 with an empirical Daytona clone-timing test across repo sizes before the boundary is locked in launch checklist; until resolved, treat NFR-P2 as CONCERNS by default per `nfr-criteria.md` ambiguous-threshold rule | Architect / PM | Before architecture doc Q-1 is marked resolved |
| R-04 | PERF/OPS | NFR-R4 (10 concurrent SSE/session) silently degrades to 6-connection HTTP/1.1 browser ceiling if the load balancer isn't HTTP/2-capable at deploy time | 2 | 3 | **6** | Add an explicit launch-checklist verification test (already named as a deployment invariant) plus an integration test opening 10 concurrent SSE connections against a local HTTP/2 dev server | DevOps / Backend lead | Implementation Sequence step 12 (launch-checklist verification) |
| R-05 | DATA | Last-write-wins on concurrent commits to the same Artifact path — accepted MVP risk, no conflict detection or user warning | 2 | 2 | 4 | Document as a known-risk regression test (two concurrent Conversations committing to the same path → assert last-write-wins behavior, not a crash); no UI warning to test against in MVP | QA | Epic-level test design (Conversations epic) |
| R-06 | OPS | Daytona Cloud outage should not take down Project Map / Artifact Browser (pure Postgres reads) | 2 | 2 | 4 | Integration test simulating Daytona API unavailability; assert Project Map/Artifact Browser still render, only new-Conversation provisioning is blocked | Backend lead | Implementation Sequence step 7 |
| R-07 | OPS | Sandbox provision failure leaves orphaned Daytona allocation (billing leak), no automated cleanup in MVP | 2 | 2 | 4 | Test `sandbox.service.ts`'s `provision()` failure path explicitly tears down partial allocation; manual-ops monitoring accepted for any gaps | Backend lead | Implementation Sequence step 7 |
| R-08 | OPS | Single-container deploy drops all active SSE connections; shutdown hooks must drain, not hard-kill | 2 | 2 | 4 | Test that triggers NestJS `onApplicationShutdown` mid-stream and asserts clients receive a reconnect-eligible close rather than an abrupt drop | Backend lead | Implementation Sequence step 8 |
| R-09 | SEC | KEK stored as a plain Railway env var with no rotation mechanism for MVP (accepted risk) | 1 | 2 | 2 | No test action beyond confirming the documented KEK-rotation runbook exists; rotation itself is a manual post-MVP process | Backend lead | Accepted for MVP, revisit post-MVP |
| R-10 | TECH | `next-auth@^5.0.0-beta.31` is a beta dependency; an incompatible Next.js patch could force a breaking bump | 1 | 2 | 2 | No proactive test; monitor changelog before any Next.js version bump (already documented mitigation) | Frontend lead | Ongoing / pre-upgrade check |

**High risks requiring mitigation before their respective implementation milestones:** R-01, R-02, R-03, R-04 (all score 6). None scored 9; no gate-blocking risk exists at this pre-implementation stage.

### NFR Planning Assessment

Using `nfr-criteria.md` categories. Thresholds are extracted verbatim from the PRD/architecture where stated; **UNKNOWN** marks anything not yet quantified (converted into a risk/clarification item, not guessed).

**Security**

| NFR | Threshold (from PRD/architecture) | Planned Evidence Source | Status |
|---|---|---|---|
| NFR-S1 | Platform-internal credentials never injected into Sandbox; no route from Sandbox to internal service endpoints | Integration test asserting Sandbox env injection excludes internal secrets; network-policy/route test | Defined |
| NFR-S2 | Every credential lookup passes a tenant-authorization check before resolution | Unit + integration tests on `credentials.service.ts` (see R-01) | Defined |
| NFR-S3 | Active termination of an already-running Sandbox/SSE session on deactivation | N/A — explicitly deferred to post-MVP, no enforcement mechanism exists to test | Deferred (not an MVP test target) |
| NFR-S4 | OAuth tokens encrypted at rest (AES-256-GCM), never returned to client after initial submission | Integration test on stored ciphertext column; API response-schema test asserting token field is absent from any payload | Defined |

**Performance**

| NFR | Threshold | Planned Evidence Source | Status |
|---|---|---|---|
| NFR-P1 | First streamed token ≤1,500ms | Automated timing assertion on SSE first-byte (tool TBD — no k6/Artillery named yet, see Concern #4) | Defined threshold / **UNKNOWN tooling** |
| NFR-P2 | Chat ready ≤10s; scope ≤~200MB repos | Threshold defined; repo-size boundary **UNKNOWN** (Q-1 open) — see R-03 | **CONCERNS by default** (ambiguous threshold per `nfr-criteria.md` rule) |
| NFR-P3 | Project Map ≤2s | Server Component render timing test | Defined |
| NFR-P4 | Artifact Browser ≤2s | Server Component render timing test | Defined |
| NFR-P5 | Manual commit ≤5s (excl. agent-turn queue wait) | Integration test on `manual-commit.service.ts` with queue time excluded from measurement | Defined |

**Reliability**

| NFR | Threshold | Planned Evidence Source | Status |
|---|---|---|---|
| NFR-R1 | Credential health updates within one git-operation cycle of a 401/403 | Integration test on `tool-pill-classifier.service.ts` → `CREDENTIAL_FAILURE` event latency | Defined |
| NFR-R2 | Committed Artifacts always recoverable from git; uncommitted state not guaranteed across Sandbox restart | Integration test: kill Sandbox mid-turn, assert committed Artifacts still readable, uncommitted state is not asserted to survive | Defined |
| NFR-R3 | SSE transport must not silently drop events under back-pressure | "Must not silently drop" has no quantitative threshold (buffer size, max delay) | **UNKNOWN — needs measurable definition** before a pass/fail test can be written; convert to a clarification item for the architect |
| NFR-R4 | 10 concurrent SSE connections/session without starvation; requires HTTP/2 | Integration test opening 10 concurrent SSE connections; deployment-config check (see R-04) | Defined |

**Observability**

| NFR | Threshold | Planned Evidence Source | Status |
|---|---|---|---|
| NFR-O1 | Per-user LLM spend tracked via SDK cost reporting from day one; budget alerting operational at launch | Integration test on `cost-tracking.service.ts` recording cost per turn; alert-threshold value is **UNKNOWN** (PRD §10: "calibrated against the validated cost model at launch", pending Q-2) | Defined mechanism / **UNKNOWN alert threshold** |

**NFR gaps converted to risk register:** the three UNKNOWN items above (NFR-P2 repo-size boundary, NFR-R3 back-pressure threshold, NFR-O1 alert threshold) are tracked via R-03 (NFR-P2) and as net-new clarification items for NFR-R3 and NFR-O1 — see Open Items below, since neither yet has a probability/impact profile distinct enough from R-03 to warrant a separate scored risk entry at this pre-implementation stage.

**Open clarification items (not yet risks, need an owner before epic-level test design can write thresholds):**
- NFR-R3: define what "must not silently drop" means numerically (e.g., max buffered events, max pause duration before a synthetic error event fires).
- NFR-O1: define the actual per-user spend alert threshold once Q-2 (Daytona compute cost) is estimated.

### Summary of Risk Findings

The four score-6 risks (R-01 credential tenant isolation, R-02 runaway-agent-on-crash, R-03 NFR-P2/repo-size threshold, R-04 NFR-R4/HTTP-2 deployment invariant) are the highest-priority items for test design to anchor on. Three of the four (R-01, R-02, R-04) already have a structural mitigation named in the architecture document — test design's job is to verify that mitigation actually works, not to invent a new one. R-03 is the one risk that cannot be closed by writing a test alone: it requires the architect to resolve PRD Open Question Q-1 first. No risk currently scores 9 (gate-blocking), but R-03 and the two NFR clarification items (NFR-R3, NFR-O1) should be escalated to the PM/architect before epic-level test design locks specific pass/fail thresholds for the Conversations and cost-observability epics.

## Step 4: Coverage Plan & Execution Strategy

This is a **system-level** coverage plan: scenarios are grouped by feature area and named architectural component, at the granularity needed to plan resourcing and CI structure. Exhaustive acceptance-criteria-level scenario enumeration is deferred to epic-level test design once sprint planning begins; this plan exists to give the team a defensible shape and cost estimate before any story is picked up.

### Coverage Matrix

**1. Repository Connection & Onboarding (FR-1–FR-5)**

| Scenario | Level | Priority | Linked Risk/NFR |
|---|---|---|---|
| Connect repo via URL; OAuth token validated for write access before save | Integration | P0 | FR-1 |
| Connect attempt against an org with App-restriction policy → user-facing 403 error path | Integration (needs GitHub org fixture/cassette, Concern #6) | P1 | FR-1, FR-2 |
| BMAD init validation: `_bmad/`, `_bmad-output/`, `.claude/` presence + version compatibility check | Integration | P0 | FR-2 |
| Commit attribution: per-session git config injected on first provision | Integration | P0 | FR-3, R-01 (auth boundary reused) |
| Commit attribution: git config re-injected on every Conversation **resume**, not just first provision | Integration | P0 | FR-3 |
| Credential health flips to failed status within one git-operation cycle of a 401/403 | Integration | P0 | FR-4, NFR-R1 |
| Repo connection state correctly reflected after full page reload | Component | P1 | FR-5 |

**2. Project Map (FR-6–FR-8)**

| Scenario | Level | Priority | Linked Risk/NFR |
|---|---|---|---|
| Artifact list renders grouped by type and status from Postgres state | Component | P1 | FR-6 |
| Manual refresh re-reads `_bmad-output` and updates list | Integration | P2 | FR-7 |
| Click on completed vs in-progress artifact routes to correct destination | E2E | P1 | FR-8 |
| Project Map/Artifact Browser remain readable during simulated Daytona Cloud outage | Integration | P1 | R-06 |
| Project Map render time ≤2s (NFR-P3) | Component (timing assertion) | P1 | NFR-P3 |

**3. Conversations (FR-9–FR-15) — highest architectural significance**

| Scenario | Level | Priority | Linked Risk/NFR |
|---|---|---|---|
| Sandbox provisioned on Conversation open; chat ready ≤10s | E2E (timing) | P0 | FR-9, NFR-P2, R-03 (CONCERNS pending Q-1) |
| Session-limit-reached message shown when 10-concurrent ceiling hit | API/Component | P2 | FR-9 |
| First streamed token arrives ≤1,500ms | Integration (timing; tool TBD, Concern #4) | P0 | FR-10, NFR-P1 |
| Stop button terminates an in-flight LLM response/tool call | E2E | P1 | FR-10 |
| 10 concurrent Conversations open simultaneously without SSE starvation | Integration (load) | P0 | FR-11, NFR-R4, R-04 |
| Tool Pill / Semantic Pill classification of streamed events, incl. `CREDENTIAL_FAILURE` | Integration (session-replay fixture, Concern #3) | P0 | FR-12, NFR-R1 |
| sandbox-agent bridge killed mid-session → backend terminates the orphaned agent process (not just emits an error event) | Integration | P0 | FR-12, R-02 |
| Conversation persistence: resume restores prior turns and re-injects git config | Integration | P0 | FR-13, FR-3 |
| Working Tree Indicator updates between turns from `working-tree.service.ts` state | Component/Integration | P1 | FR-14 |
| Manual commit completes ≤5s excluding agent-turn queue wait; no-op when tree is clean; control disabled while saving | Integration | P1 | FR-15, NFR-P5 |
| Two Conversations commit to the same Artifact path concurrently → last-write-wins, no crash | Integration (multi-session harness) | P2 | R-05 (deferred detail to epic-level) |
| `sandbox.service.ts` provision failure tears down the partial allocation (no orphaned billing) | Integration | P1 | R-07 |
| `onApplicationShutdown` mid-stream drains SSE clients with a reconnect-eligible close, not a hard drop | Integration | P2 | R-08 |
| Sandbox restart mid-turn: committed Artifacts remain readable; uncommitted state not guaranteed | Integration | P1 | NFR-R2 |
| SSE stream under back-pressure does not silently drop events | Integration | **Blocked** — no quantitative threshold yet (NFR-R3 open item); cannot assign level/priority until defined | NFR-R3 |

**4. Artifact Browser (FR-16–FR-17)**

| Scenario | Level | Priority | Linked Risk/NFR |
|---|---|---|---|
| Committed artifact renders ≤2s | Component/Integration (timing) | P1 | FR-16, NFR-P4 |
| Access via Project Map and via Semantic Pill land on the same artifact view; back navigation returns to originating context | E2E | P2 | FR-17 |

**5. Authentication & Access Control (FR-18–FR-19)**

| Scenario | Level | Priority | Linked Risk/NFR |
|---|---|---|---|
| Sign-in is GitHub-OAuth-only; session persists across reload | E2E | P0 | FR-18 |
| Unauthenticated request redirects to sign-in; any authenticated user has full feature access (no role tiers in MVP) | Integration | P0 | FR-19 |

**Cross-cutting Security (NFR-S1–S4)**

| Scenario | Level | Priority | Linked Risk/NFR |
|---|---|---|---|
| Sandbox environment injection excludes platform-internal credentials/secrets; no network route to internal services | Integration | P0 | NFR-S1 |
| Every credential-resolving call site enforces tenant authorization; negative test attempts cross-user token resolution | Unit + Integration | P0 | NFR-S2, R-01 |
| OAuth tokens stored as AES-256-GCM ciphertext; never present in any API response payload (schema test) | Integration + contract/schema | P0 | NFR-S4 |
| Active Sandbox/SSE session termination on user deactivation | — | **Out of scope (MVP)** — explicitly deferred, no mechanism exists to test (NFR-S3) | NFR-S3 |

No duplicate coverage: timing-sensitive NFR scenarios (NFR-P1–P5) are validated once at the lowest practical level (Component for pure render timing, Integration for cross-service timing) rather than re-asserted at E2E; E2E is reserved for scenarios that exercise real user navigation (FR-8, FR-17, FR-18) or genuinely require a live browser/SSE client (FR-9 chat-ready, FR-10 Stop button).

### NFR Coverage and Evidence Plan

| NFR Category | Validation Level/Tool | Expected Evidence Artifact for `nfr-assess` | Blocker/Risk/Assumption |
|---|---|---|---|
| Security (S1, S2, S4) | Integration tests (Jest/Vitest + Supertest or equivalent on `apps/agent-be`) | Test run output + coverage report for `credentials.service.ts`, sandbox env-injection assertion, API response-schema test | None — all three have defined thresholds |
| Security (S3) | N/A | N/A | Assumption: out of MVP scope, re-assess post-MVP |
| Performance (P1, P3, P4, P5) | Integration/Component timing assertions | Timing logs from CI test run (first-token latency, render time, commit duration) | None — thresholds defined |
| Performance (P2) | Integration timing assertion **+ empirical repo-size boundary test** | Clone-timing results across a range of repo sizes (architect-owned spike) | **Blocker**: Q-1 (repo-size boundary) unresolved — treat as CONCERNS until architect provides an empirical boundary |
| Reliability (R1, R2, R4) | Integration tests (incl. multi-connection SSE load test for R4) | Test run output; for R4, a connection-count log proving no starvation at 10 concurrent SSE clients | None for R1/R2; R4 also needs the HTTP/2 launch-checklist deployment-config check (R-04) |
| Reliability (R3) | Not yet definable | N/A | **Blocker**: no quantitative back-pressure threshold exists (open item) — escalate to architect before any test can be written |
| Observability (O1) | Integration test on `cost-tracking.service.ts` | Per-turn cost-record assertions in test run output | **Blocker**: alert threshold value UNKNOWN pending Q-2 (Daytona compute cost estimate); mechanism itself is testable now, threshold is not |

### Execution Strategy

- **PR (target <15 min):** all P0/P1 unit, component, and integration functional tests across the five feature areas, including the Tool Pill classifier, credential tenant-isolation tests, and OAuth/session tests. These are deterministic, single-process, and fast.
- **Nightly:** the 10-concurrent-SSE load test (FR-11/NFR-R4), multi-session last-write-wins scenario (R-05), Daytona-outage simulation (R-06), and sandbox-agent-crash termination test (R-02) — each requires multi-connection or multi-process orchestration that exceeds the PR time budget.
- **Weekly (or on-demand once a load-testing tool is chosen, Concern #4):** repo-size boundary empirical test (NFR-P2/R-03) and any future k6/Artillery-based latency regression suite once NFR-P1/P2 automation is wired into CI — currently blocked on tool selection.
- NFR-R3 (back-pressure) and the NFR-O1 alert threshold cannot be scheduled into any tier yet; they remain blocked pending architect/PM input (see Open Items, Step 3).

### Resource Estimates (ranges)

System-level estimate across the full MVP scope, before epic/story breakdown:

- **P0:** ~70–100 hours (test-seam design for `SandboxService` fake, credential tenant-isolation suite, SSE/Tool-Pill classifier tests against the session-replay fixture, OAuth/auth suite, sandbox-crash-termination test)
- **P1:** ~45–65 hours (Working Tree Indicator, manual commit, Project Map/Artifact Browser timing tests, provisioning-failure cleanup, sandbox-restart durability)
- **P2:** ~20–35 hours (last-write-wins harness, graceful-shutdown drain test, manual-refresh, navigation/back-nav E2E)
- **P3:** ~3–6 hours (none currently identified beyond exploratory/manual checks — no P3 scenarios surfaced at system level)
- **Total:** ~140–205 hours, excluding the two blocked NFR scenarios (NFR-R3, NFR-O1 threshold) and the NFR-P2 empirical boundary spike, none of which can be estimated until their respective open items are resolved
- **Timeline:** roughly 4–6 sprints assuming one dedicated QA/SDET working in parallel with feature implementation, longer if test-seam work (`SandboxService` fake, factory/seeding pattern) is not prioritized early as recommended in Step 3

### Quality Gates

- P0 scenario pass rate = 100% before any release candidate
- P1 scenario pass rate ≥ 95%
- All four score-6 risks (R-01, R-02, R-03, R-04) have their named mitigation verified by a passing test before the Conversations epic is considered release-ready; R-03 additionally requires Q-1 to be resolved first
- Coverage target ≥ 80% on `apps/agent-be` integration suite (the tenant-isolation and SSE-bridge code is the highest-value coverage target)
- NFR validation evidence identified for every in-scope NFR category (table above) — full PASS/CONCERNS/FAIL status per category is deferred to `nfr-assess` once code and evidence exist
- NFR-R3 and the NFR-O1 alert threshold remain explicitly open; gate decision on those two items is deferred until the architect/PM provide measurable thresholds — do not default them to PASS

## Step 5: Generate Outputs & Validate

**Execution mode resolved:** `sequential` (config: `tea_execution_mode: auto`; `tea_capability_probe: true`; no agent-team or subagent runtime detected).

**Output files generated:**

| Document | Path | Purpose |
|---|---|---|
| Architecture doc | `_bmad-output/test-artifacts/test-design-architecture.md` | Architectural concerns, testability gaps, NFR requirements — for Architecture/Dev team review |
| QA doc | `_bmad-output/test-artifacts/test-design-qa.md` | Test execution recipe — coverage matrix, execution strategy, resource estimates, for QA team |
| BMAD Handoff doc | `_bmad-output/test-artifacts/test-design/bmad-easy-handoff.md` | Bridges TEA outputs to BMAD epic/story decomposition workflow |

**Checklist validation:**

- Prerequisites (System-Level Mode): PRD ✓, ADR/architecture doc ✓, architecture available ✓
- Risk Assessment: 10 risks, 4 high-priority (≥6) with mitigation plans, 4 medium, 2 low ✓
- NFR Planning: all 4 categories assessed; 3 UNKNOWN thresholds converted to risks/blockers (not guessed) ✓
- Coverage Matrix: ~37 atomic scenarios across P0/P1/P2; no P3 identified at system level ✓
- No duplicate coverage across test levels ✓
- Execution Strategy: PR / Nightly / Weekly model ✓
- Resource Estimates: interval ranges (no false precision) ✓
- Quality Gates: P0=100%, P1≥95%, R-01–R-04 mitigations required, ≥80% integration coverage ✓
- Architecture doc: actionable-first structure (Quick Guide 🚨/⚠️/📋 → Risk → Concerns → Mitigations → Assumptions); no test code, no quality-gate section, no tool-selection section ✓
- QA doc: playwright-utils imports in code examples (`tea_use_playwright_utils: true`) ✓; DON'T INCLUDE items absent ✓
- Handoff doc: at `test-design/{project_name}-handoff.md`, Epic-Level guidance, Story-Level guidance, Risk-to-Story table, Phase Transition gates ✓
- Cross-document consistency: same risk IDs (R-01–R-10), same blocker IDs (B-01–B-04), same priorities (P0–P3) across all three documents ✓
- `on_complete` hook: resolved empty → skipped ✓

**Key risks and gate thresholds:**

- R-01 (SEC, score 6): Cross-tenant credential leak — P0 mitigation required before `credentials.service.ts` ships
- R-02 (TECH/OPS, score 6): Runaway agent on crash — P0 mitigation required at AG-UI event proxying step
- R-03 (PERF, score 6): NFR-P2 repo-size boundary — blocked on architect Q-1 spike; treated as CONCERNS by default
- R-04 (PERF/OPS, score 6): NFR-R4 HTTP/2 degradation — P0 mitigation required at launch-checklist step
- Gate: all 4 score-6 risks must be verified before Conversations epic is release-ready

**Open assumptions requiring resolution before epic-level test design:**

- B-01: `SandboxService` test seam (Backend lead, pre-implementation)
- B-02: PRD Q-1 repo-size boundary (Architect, empirical spike)
- B-03: NFR-R3 back-pressure quantification (Architect)
- B-04: NFR-O1 alert threshold (PM, pending Q-2 cost estimate)

**Workflow complete.** All 5 steps executed. Next step for the team: review and approve Quick Guide items, assign owners, then run `bmad-testarch-atdd` for P0 acceptance test generation per story.

## Post-Epic-5 Update (2026-07-12, EDIT mode)

**Trigger:** Epic 5 ("UX Mockup Fidelity — Close Visual Drift", 4 stories 5.1–5.4) completed; wave-1 (bug hunt, fidelity audit, traceability gate, NFR audit) and wave-2 (per-epic NFR aggregation) assessment artefacts landed. This section records the post-epic reality so the system-level progress file matches `sprint-status.yaml` and the Epic 5 traceability matrix. The original Steps 1–5 above are preserved verbatim for auditability.

**Autonomous decisions (in place of halting at the skill's checkpoints):**

1. **Mode determination:** chose `[E] Edit` per the task brief; the system-level plan already exists and only surgical edits are needed.
2. **Target selection (step-01-assess #1):** targeted the existing test-plan files — `test-design-architecture.md`, this file, `test-design-qa.md`, `bmad-easy-handoff.md`, plus a minimal note on the stale `automation-summary.md`. Did not create duplicate artefacts. Left the `test-design-epic-hydration-gap.md` file untouched — it is scoped to a separate post-incident design and stands on its own.
3. **Confirmation gates (step-01-assess #3, step-02-apply-edit #1):** proceeded without halting; recorded this decision here per the unattended-operation guideline.

### Current Project State (2026-07-12)

| Epic | Status (per `sprint-status.yaml`) | Stories | Test Artefacts |
|---|---|---|---|
| Epic 1 (Authentication & Repository Connection) | done | 9 (1.1–1.9) | ATDD + automate-validation + test-review (where applicable); epic-1-retrospective done |
| Epic 2 (Project Map & Artifact Browser) | done | 6 (2.1–2.6) | ATDD + automate-validation + test-review; epic-2-retrospective done |
| Epic 3 (Conversations — Running BMAD Skills with the Agent) | done | 12 (3.1–3.12) | ATDD + automate-validation + test-review + NFR per story; epic-3-retrospective done |
| Epic 5 (UX Mockup Fidelity — Close Visual Drift) | in-progress in yaml but **all 4 stories done** (5.1–5.4) | 4 | ATDD + automate-validation + 3 of 4 test-reviews (5.2's missing — Low evidence gap) + per-story + epic-level NFR; bug-hunt + fidelity audit + traceability gate complete |
| Epic 6 (Sandbox-Based Agent Execution) | backlog | 5 (6.1–6.5) | None yet — see "Epic 6 forward-look" below |
| Epic 4 | (no Epic 4 — numbering skips per `epics.md`) | — | — |

**Note on Epic 5 status field:** `sprint-status.yaml` still lists `epic-5: in-progress` even though all four stories are `done`. The Epic 5 traceability matrix flagged the same. The epic status field is a manual-transition item — not a coverage or quality gap.

### Epic 5 Test Outcomes

- **Traceability gate:** `CONCERNS`. 38/38 ACs at FULL coverage; P0 100% (36/36), P1 100% (2/2); 0 critical-open items; 853 tests passing across 65 Jest suites plus 3 active Playwright visual-container specs; 0 skipped.
- **Test fidelity audit (2026-07-12):** PASS. 2 LOW Gap-C findings (bounded; both downstream of the prior agent-be SSE contract blocker) + 1 INFO coverage note (`withArtifacts` Playwright fixture broken; hover-token E2E for 5.4 AC-1/AC-5 reduced to className-only unit tests).
- **NFR assessment (epic-level, 2026-07-12):** PASS-WITH-CONCERNS. 24 PASS, 5 CONCERNS (de-duplicated: 1 Medium + 4 Low), 0 FAIL. The 1 Medium is story-introduced: NFR-5.3-1 auto-scroll effect deps after Story 5.3 AC-3 spinner relocation (bug-hunt M1). Roughly 9 quick-win fixes (~1 hour total) identified for a follow-up hardening story.
- **Bug hunt (2026-07-12):** 11 findings (0 critical, 0 high, 3 medium, 8 low). The 3 mediums: M1 auto-scroll regression; M2 `no-scrollbar` missing on full-width artifact list pane (5.4-AC7 gap); M3 `parseFrontmatter` renders quoted YAML values with quotes (deferred DP-5 hardening).
- **Deferred work:** pruned clean (0 orphaned items across Epic 5 stories).

### New Test-Plan Items Tee'd Up for the Known Gaps

These items close the wave-1+2 findings without re-scoping the original system-level coverage matrix. They are tracked in detail in `test-design-qa.md` "Post-Epic-5 Gap Closure Plan":

- **P1-014** — Auto-scroll regression test on `SESSION_TIMEOUT` while scrolled up (closes bug-hunt M1 / NFR-5.3-1).
- **P1-015** — Type-checked `connectRepository` mock factory + `.catch()` path test (closes fidelity-audit Finding 1).
- **P1-016** — 5.4-AC7 full-width artifact-list pane `no-scrollbar` + test case (closes bug-hunt M2 / NFR-5.4-2 / traceability concern 1).
- **P1-017** — Tighten ChatInput AC-4 disabled-state test to assert the `disabled:` variant scoping + a positive enabled-button assertion (closes bug-hunt L1 false-green test).
- **P2-008** — Restore `withArtifacts` Playwright fixture and the 5.4 AC-1 / AC-5 hover-token E2E blocks (closes fidelity-audit Finding 3, INFO).
- **P2-009** — Loading-skeleton header parity E2E: every `loading.tsx` renders the same header as its companion `page.tsx` (closes bug-hunt L3 + NFR-5.2-3).
- **P2-010** — Supplement 5.2-AC10 conversation-list scroll behaviour E2E (closes traceability concern 4; jsdom cannot test scroll).
- **P3-001** — NFR quick-wins bundle (~9 fixes) — landed as a single follow-up hardening story (closes `nfr-assessment-5-epic.md` Quick Wins list and most of the bug-hunt L-tier findings).

### Epic 6 Forward-Look (Backlog, Not Started)

Epic 6 migrates agent execution from the host process (host-based SDK `query()` per Story 3.3 DP-2) back into the Daytona sandbox per PRD §3 and architecture.md data flow. Five stories (6.1–6.5). The testability needs the test plan must tee up before Epic 6 enters implementation are recorded in `test-design-architecture.md` § "Epic 6 (Sandbox-Based Agent Execution) — Forward-Looking Testability Preview". Headline items:

- New test seam `IAguiEventBridgeService` / `AGUI_EVENT_BRIDGE_SERVICE` for the new `agui-event-bridge.service.ts` (Story 6.2) — delivered with the service, not bolted on after (B-01 lesson).
- Possible `ISandboxService` extension for `getSessionCommandLogs` streaming so the event bridge can be integration-tested without real Daytona.
- P0-010 (sandbox-agent bridge killed mid-session → backend terminates the orphaned agent process) becomes fully testable — tighten the assertion to verify the Daytona process session actually terminates.
- Story 6.5 Real-Service E2E is the Tier-3 real-service tier made mandatory, not a deferred enhancement — NFR-P1/P2 timing depends on the real Daytona + Claude path the new sandbox-based execution exercises.
- `networkAllowList` egress control (Story 6.1) extends P0-014 with a network-route assertion.
- `ANTHROPIC_API_KEY` becomes required in `apps/agent-be/src/config/env.validation.ts`; `AGENT_WORKDIR` becomes dead config.

### Files Edited This Run

- `_bmad-output/test-artifacts/test-design-architecture.md` — status line, GA Launch bullet, "Post-Epic-5 Update" + "Epic 6 Forward-Looking Testability Preview" sections, Risk Summary effort note.
- `_bmad-output/test-artifacts/test-design-progress.md` — `lastSaved`, this Post-Epic-5 Update section.
- `_bmad-output/test-artifacts/test-design-qa.md` — status line, exit criteria, Post-Epic-5 Gap Closure Plan + Epic 6 Forward-Look sections.
- `_bmad-output/test-artifacts/test-design/bmad-easy-handoff.md` — `generatedAt`, purpose, Epic-5-done + Epic-6-backlog blocks, Phase Transition table.
- `_bmad-output/test-artifacts/automation-summary.md` — minimal stale-data note pointing to per-story automate-validation reports.

## Post-Story-5.5 Update (2026-07-13, EDIT mode)

**Trigger:** Story 5.5 ("Interleave Tool and Semantic Pills Within the Agent Markdown Stream" — architectural, reverted out of Story 5.3 because it requires a data-model change, not a CSS fix) implemented after the 2026-07-12 post-Epic-5 update. Story 5.5 changed the `ChatMessage` data model (added `segments?: MessageSegment[]` discriminated union), rewrote every SSE event handler in `ConversationPane.tsx` to insert/update segments inside the streaming agent message (rather than pushing flat entries to the `messages` array), added a Prisma migration (`20260713120000_add_turn_segments` — `Turn.segments JSONB`), updated `AgentMessage.tsx` to render interleaved text + tool_call segments, and updated `AgentService` + `AgentServiceFake` to build/persist segments alongside `accumulatedText`. This section records the post-Story-5.5 reality. The 2026-07-12 Post-Epic-5 Update section above and the original Steps 1–5 are preserved verbatim for auditability.

**Autonomous decisions (in place of halting at the skill's step-01-confirm and step-02-confirm gates):**

1. **Mode determination:** chose `[E] Edit` per the task brief; the system-level plan already exists and only surgical edits are needed. Same approach as the 2026-07-12 Post-Epic-5 update.
2. **Target selection (step-01-assess #1):** targeted the same five test-plan files as the 2026-07-12 run — `test-design-architecture.md`, this file, `test-design-qa.md`, `bmad-easy-handoff.md`, and `automation-summary.md`. Did not create duplicate artefacts. The hydration-gap files remained untouched (scoped to a separate post-incident design and unchanged by Story 5.5).
3. **Confirmation gates (step-01-assess #3, step-02-apply-edit #1):** proceeded without halting; recorded this decision here per the unattended-operation guideline.

### Current Project State (2026-07-13, post-Story-5.5)

| Epic | Status | Stories | Test Artefacts |
|---|---|---|---|
| Epic 1 (Authentication & Repository Connection) | done | 9 (1.1–1.9) | ATDD + automate-validation + test-review (where applicable); epic-1-retrospective done |
| Epic 2 (Project Map & Artifact Browser) | done | 6 (2.1–2.6) | ATDD + automate-validation + test-review; epic-2-retrospective done |
| Epic 3 (Conversations — Running BMAD Skills with the Agent) | done | 12 (3.1–3.12) | ATDD + automate-validation + test-review + NFR per story; epic-3-retrospective done |
| Epic 5 (UX Mockup Fidelity — Close Visual Drift) | **done** in artifacts; `sprint-status.yaml` field still says `in-progress` but all **5** stories (5.1–5.5) are `done` | **5** (added 5.5) | ATDD + automate-validation for all 5 stories + test-review for 4 (5.2's missing — Low evidence gap) + per-story + epic-level NFR for all 5; **bug-hunt + traceability + NFR all re-run for Story 5.5 on 2026-07-13** |
| Epic 6 (Sandbox-Based Agent Execution) | backlog | 5 (6.1–6.5) | None yet — see "Epic 6 forward-look" below; Story 5.5's segments model is now the substrate Epic 6 builds on |

**Note on Epic 5 status field:** `sprint-status.yaml` still lists `epic-5: in-progress` even though all five stories are `done`. The epic status field is a manual-transition item — not a coverage or quality gap.

### Test Counts (fresh 2026-07-13 verification)

| Type | Count |
|---|---|
| Jest test files (`apps/web`) | 65 suites |
| Jest tests passing (`apps/web`) | 894 |
| Jest test files (`apps/agent-be`) | 16 suites |
| Jest tests passing (`apps/agent-be`) | 307 |
| Story 5.5 Playwright E2E tests (`playwright/e2e/conversation/story-5-5-inline-pills.spec.ts`) | 7 (0 skipped, 0 fixme) |
| **Total tests across the bmad-easy repo** | **1,201 Jest + 7 Story 5.5 E2E** (post-bug-hunt quick-wins + post-NFR-audit quick-wins applied and re-verified by `yarn nx test web`, `yarn nx test agent-be`, `npx tsc --noEmit -p apps/web/tsconfig.json`) |

Was 853 across 65 suites after Epic 5 (4 stories); +41 web tests + 1 Playwright E2E spec (7 cases) + 307 agent-be tests (already existed; the prior 2026-07-12 entry only counted Web + active visual-container specs) → 1,201 Jest tests + 7 Story 5.5 E2E tests.

### Epic 5 Test Outcomes (post-Story-5.5)

- **Traceability gate (2026-07-13):** `PASS` (`evaluated_at: 2026-07-13T19:30:00.000Z`, `gate_status: PASS`). 48/48 ACs at FULL coverage across all 5 stories; P0 100% (46/46), P1 100% (2/2); 0 critical-open, 0 high-open, 3 medium-open (all test-seam or test-fidelity, none production-reachable), 11 low-open. **The 2026-07-12 CONCERNS field was driven primarily by the AC-7 (5.4) full-width artifact list pane missing the `no-scrollbar` class. That concern is now FIXED** — the 2026-07-13 bug-hunt applied a quick-win fix adding the class to `artifacts/page.tsx:124` and added a test assertion at `artifacts/page.test.tsx:265-269`. All previously-documented weaknesses (see 2026-07-12 section above) are either resolved or re-categorized as residual concerns that do not block the gate.
- **Story 5.5 acceptance criteria:** 10 ACs (AC-1 through AC-10), all FULL coverage. Test evidence:
  - **Component tests:** 9 ConversationPane tests (AC-1 / AC-2 / AC-3 / AC-4 / AC-5 / AC-6 SUCCEEDED + FAILED / AC-8 surrogate / AC-9 resume variant / AC-1 multi-tool variant) + 5 AgentMessage tests (AC-1, AC-10 narrative ordering).
  - **Backend persistence tests:** 3 tests in `agent.service.unit.spec.ts` (segments persisted; segments ordered; tool_call fields captured) + 1 strengthened `agent.service.spec.ts:184-202` test (segment contents asserted via `arrayContaining`).
  - **E2E:** 7 tests in `playwright/e2e/conversation/story-5-5-inline-pills.spec.ts` (covering AC-1, AC-2, AC-3, AC-4, AC-5, multi-tool AC-1 variant, AC-2 expand/collapse variant).
- **Story 5.5 NFR assessment (2026-07-13):** PASS-WITH-CONCERNS. 8 PASS, 4 CONCERNS (1 Medium + 3 Low), 0 FAIL. The 1 Medium is `M3-new` (`AgentServiceFake` diverges from production `pendingClassifierPromises` pattern — test-seam fidelity violation; production code is correct). 3 Lows: `L5-new` index-based React keys for text segments (`AgentMessage.tsx:99`), `L6-new` `MANUAL_SAVE_SUCCEEDED/FAILED` handler duplication (~150 lines), `L7-new` `apps/web/project.json` lacks a `typecheck` nx target (surfaced by the M2-new TS narrowing bug fixed during the audit).
- **Epic 5 NFR assessment (`nfr-assessment-5-epic.md`, 2026-07-13 revision):** PASS-WITH-CONCERNS. 23 PASS, 6 CONCERNS (de-duplicated: 3 Medium + 3 Low), 0 FAIL. Two of the three Mediums are pre-existing project-wide (`turn.findMany` missing `take` limit — NFR-5.2-1, amplified by Story 5.5's `segments` JSONB column read; `messages.map()` unbound rendering — NFR-5.3-2, amplified by Story 5.5's multi-`Markdown` per agent message). The third Medium (`M3-new`) is the only NEW Epic-5-introduced finding — see NFR Story 5.5 above.
- **Story 5.5 bug-hunt (`bug-hunt-epic-5-story-5-5-interleaved-pills.md`, 2026-07-13):** 9 findings (0 critical, 0 high, 3 medium, 6 low) against 18 source files + 13 co-located test files and the committed changes (commit `465ea50` plus related quick-win commit `11f470f`). Profile reflects Story 5.5's architectural scope — zero critical/high (no production-reachable data-loss or security regressions introduced); mediums concentrated in (i) false-green tests asserting segment presence without verifying the relative ORDER that AC-1's "at the EXACT POSITION" contract requires, and (ii) one real-but-normally-unreachable status-overwrite bug in `TOOL_CALL_END`. The 3-layer bug-hunt (TFA → ECH → CR) ran sequentially in subagent-fallback mode (single-session inline execution — same precedence as the 2026-07-12 hunt).

### Prior Bug-Hunt Findings Carried Forward + Closed in Story 5.5's Bug-Hunt

| Prior ID | Title | Status (2026-07-13) |
|---|---|---|
| Prior bug-hunt M1 | Auto-scroll effect deps regression from Story 5.3 | **FIXED** — quick-win applied during Story 5.5 bug-hunt (`ChatMessageList.tsx:45` deps array extended to `[messages, isThinking, errorMessage, showRetry, showSpinner]`). Closes the P1-014 test-plan item and NFR-5.3-1. |
| Prior bug-hunt M2 | `no-scrollbar` missing on full-width artifact pane | **FIXED** — quick-win applied during Story 5.5 bug-hunt (`artifacts/page.tsx:124`); test added at `artifacts/page.test.tsx:265-269`. Closes the P1-016 test-plan item, NFR-5.4-2, and traceability concern 1. This is the single fix that upgraded the traceability gate from CONCERNS → PASS. |
| Prior bug-hunt M3 | `parseFrontmatter` renders quoted YAML with quotes | **FIXED before Story 5.5 audit** — `ArtifactViewer.tsx:22` strips surrounding quotes; tests cover it at `ArtifactViewer.test.tsx:204-241` |
| Prior bug-hunt L1 | False-green `disabled:` variant test (ChatInput) | Still OPEN — different file; out of Story 5.5 scope. Test-plan item P1-017 remains. |
| Prior bug-hunt L2 | Missing `aria-live="polite"` assertion | **FIXED** — assertion added at `ChatMessageList.test.tsx:201` during Story 5.5 bug-hunt. Closes P3-001 quick-wins bundle item #5. |
| Prior bug-hunt L3 | Loading skeleton header drift | Still OPEN — out of Story 5.5 scope. P2-009 test-plan item remains. |
| Prior bug-hunt L4 | `Intl.DateTimeFormat` per-render allocation | **FIXED before Story 5.5 audit** — both `UserMessage.tsx:10-14` and `AgentMessage.tsx:27-31` use module scope. Closes P3-001 quick-wins bundle item #4. |
| Prior bug-hunt L5 | `ArtifactViewer` `<a>` focus ring missing | **FIXED before Story 5.5 audit** — `ArtifactViewer.tsx:91-94` has focus ring classes. |
| Prior bug-hunt L6 | `no-scrollbar` panels lack keyboard scrollability (`tabIndex={0}` + `role="region"`) | Still OPEN — out of Story 5.5 scope. P3-001 quick-wins bundle item #7 remains. |
| Prior bug-hunt L7 | `RepositoryUrlForm` input missing `maxLength` | **FIXED before Story 5.5 audit** + test added during bug-hunt — `RepositoryUrlForm.tsx:55` has `maxLength={MAX_REPOSITORY_URL_LENGTH}`; test added at `RepositoryUrlForm.test.tsx:324`. Closes P3-001 quick-wins bundle item #8. |
| Prior bug-hunt L8 | `SlashCommandPicker.header` `role="presentation"` | Still OPEN — out of Story 5.5 scope. |

### Story 5.5 Bug-Hunt New Findings + NFR-Audit Quick-Win Fixes

| New ID | Title | Status |
|---|---|---|
| `M1-new` | AC-1 inline-position narrative-ordering tests use `textContent.contains()` — does not enforce relative order ("at the EXACT position") | **FIXED** at audit time — 4 ConversationPane tests + 1 AgentMessage test replaced `toContain` chains with DOTALL regex `toMatch(/Before.*Bash.*After/s)`. The AC-9 resume-variant was the last to fall — fixed during the NFR audit (single `toMatch` replaced 3 separate `toContain` calls). Closes the test-fidelity false-green. |
| `M2-new` | `TOOL_CALL_END` handler unconditionally overwrites `tool_call` segment status to `'completed'` — silent overwrite of `'error'` state if `TOOL_CALL_RESULT` (with `isError: true`) arrived out-of-order | **FIXED** at audit time — `ConversationPane.tsx:402-406` now preserves `'error'` state via `const nextStatus: 'error' \| 'completed' = s.toolCall.status === 'error' ? 'error' : 'completed'`. Production-reachability is currently bounded by AG-UI protocol (content_block_stop precedes tool_result) but the defense-in-depth guard is in place. Regression test for the out-of-order case still pending — added as test-plan item **P1-019** below. |
| `M3-new` | `AgentServiceFake` awaits `getWorkingTreeStatus` inline, while production `agent.service.ts:630-660` fires it as a fire-and-forget promise pushed to `pendingClassifierPromises`. Test-seam parity violation per `project-context.md:138` | **OPEN (Medium)** — production code is correct today; the fake is more deterministic than production. Timing-dependent bugs (e.g. `WORKING_TREE_DIRTY` emitted before a subsequent `TEXT_MESSAGE_*` delta) would pass fake-based tests but fail in production. Fix is a ~20-line refactor of the fake's `runTurn` loop mirroring `pendingClassifierPromises`. Booked as new test-plan item **P1-018** below. |
| `L1-new` | `agent.service.spec.ts:184-202` segments persistence test asserts only shape (`toHaveProperty('segments')` + `Array.isArray`), not contents | **FIXED** during NFR audit — added `expect(...segments).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'tool_call', toolCall: expect.objectContaining({ toolName: 'Bash', input: 'git status', output: 'nothing to commit' }) })]))` |
| `L2-new` | `agent.service.unit.spec.ts:1413` uses shallow `toHaveProperty('status')` instead of `toBe('completed')` | **FIXED** before NFR audit — uses `.toBe('completed')` value comparison |
| `L3-new` | `TEXT_MESSAGE_CONTENT` handler silently drops delta when `streamingMessageIdRef.current` is null | **FIXED** during NFR audit — added `else if (delta) console.warn('[ConversationPane] TEXT_MESSAGE_CONTENT delta dropped — no streamingMessageIdRef set')` defense-in-depth. Production user-visible behavior unchanged (delta still dropped on protocol violation) but now diagnosable. |
| `L4-new` | Resume path casts DB JSON to `MessageSegment[]` without runtime validation (Story 5.5 spec DP-3) | **FIXED** before NFR audit — `conversations/[conversationId]/page.tsx:44` adds `Array.isArray(turn.segments) ? (turn.segments as MessageSegment[]) : undefined` guard. Per-segment narrowing deferred per DP-3 (deeper validation requires coordinated MessageSegment runtime validation story). |
| `L5-new` | `AgentMessage.tsx:99` uses index-based React keys (`key={`text-${index}`}`) for text segments. Anti-pattern — unstable when array is reordered or inserted mid-array. Currently inert because segments are append-only. | **OPEN (Low)** — coordinate with deferred MessageSegment runtime validation story (DP-3). Carried as P3-002 hardening bundle item. |
| `L6-new` | `MANUAL_SAVE_SUCCEEDED/FAILED` handler duplication (~150 lines) in `ConversationPane.tsx:543-693`. Only diff: `status` / `semantic` / `errorMessage`. Refactor risk on future edits. | **OPEN (Low)** — extract `buildManualSaveSegment(toolCallId, status, semantic?, errorMessage?)` helper; both handlers shrink to ~10 lines. Carried as P3-002 hardening bundle item. |
| `L7-new` (NEW from NFR audit) | `apps/web/project.json` lacks a `typecheck` nx target; `nx.json:38-41` defines a `typecheck` task template that `apps/web/project.json` does not expose. `apps/agent-be/project.json` has it. The M2-new fix introduced a TS narrowing bug that silently passed `yarn nx test web` (jest/babel) and `yarn nx lint web` (eslint) — only direct `npx tsc --noEmit -p apps/web/tsconfig.json` surfaced the error. Other pre-existing TS errors may be silently accumulating without detection. | **OPEN (Low)** — gated add `typecheck` target mirroring `agent-be`. Sub-finding (M2-new TS narrowing bug) was fixed during the NFR audit by extracting `const nextStatus: 'error' \| 'completed'`. Carried as new test-plan item **P1-020** below. |

### Aggregate Effect on the System-Level Gap-Closure Plan

| Test-Plan ID | Status Change (since 2026-07-12 entry) |
|---|---|
| P1-014 | **CLOSED** — auto-scroll regression quick-win fix applied (ChatMessageList deps array extended during Story 5.5 bug-hunt). No new test needed for the regression case in P0/P1 — the existing tests assert `useEffect` behavior via component mount state. |
| P1-015 | Still OPEN (out of Story 5.5 scope — different file/fidelity-audit-cited shape). |
| P1-016 | **CLOSED** — `no-scrollbar` class + test added at `artifacts/page.tsx:124` + `artifacts/page.test.tsx:265-269` during Story 5.5 bug-hunt. (Was the primary driver of the 2026-07-12 CONCERNS gate decision.) |
| P1-017 | Still OPEN (out of Story 5.5 scope). |
| P2-008 | Still OPEN (`withArtifacts` Playwright fixture restoration deferred). |
| P2-009 | Still OPEN (out of Story 5.5 scope). |
| P2-010 | Still OPEN. |
| P3-001 | **~6 of 9 quick-wins CLOSED** in the Story 5.5 bug-hunt + NFR audit cycle: (1) `take: 100` on `turn.findMany` — **STILL OPEN** (NFR-5.2-1 — Medium — bundled into P3-002 epic-hardening-story scope, not a one-liner); (2) `select: { id: true }` on `repoConnection.findUnique` — **STILL OPEN** (Low — P3-002); (3) `no-scrollbar` on full-width pane — **CLOSED**; (4) `Intl.DateTimeFormat` hoist — **CLOSED**; (5) `aria-live` assertion — **CLOSED**; (6) loading.tsx canonical header — **STILL OPEN** (P2-009); (7) `tabIndex={0}` + `role="region"` on three `no-scrollbar` panels — **STILL OPEN** (P3-002); (8) `maxLength` — **CLOSED** (production + test); (9) `MAX_DRAFT_SIZE` guard — partially applied pre-Story-5.5 (silent-swallow pattern still present — see NFR-5.3-5). |
| **P1-018 (NEW)** | Mirror `pendingClassifierPromises` pattern in `AgentServiceFake` to close `M3-new` test-seam divergence. ~20-line refactor of the fake's `runTurn` loop. P1 because it is the only NEW Medium test-seam finding Epic 5/introduced; not a production bug; the production code is correct today. (See `test-design-qa.md` Post-Story-5.5 Gap Closure Update.) |
| **P1-019 (NEW)** | Story 5.5 `M2-new` regression test — emit `TOOL_CALL_RESULT` (with `isError: true`) before `TOOL_CALL_END` and assert the tool_call segment's `status` remains `'error'` after the END handler fires. Closes the M2-new structural-fix verification gap. The fix itself (production guard) is applied; this is the test-only follow-up. |
| **P1-020 (NEW)** | Add `typecheck` nx target to `apps/web/project.json` mirroring `apps/agent-be/project.json`. Closes `L7-new`. Surfaced by the `M2-new` TS narrowing bug that passed CI silently until the NFR audit ran `npx tsc --noEmit` directly. ~5-minute task. Wire into CI workflow alongside `lint` and `test`. |
| **P3-002 (NEW)** | Epic-5 NFR hardening bundle (post-Story-5.5) — closes the remaining Low findings + bundles the 6 Low NFR findings from Story 5.5 (L1-new [fixed], part of L4-new per-segment narrowing, L5-new index-based React keys, L6-new handler duplication, L7-new typecheck target [if not done as P1-020]) + carryover pre-existing Lows (`turn.findMany` take limit Medium; `repoConnection.findUnique` select projection Low; `conversations/[conversationId]/loading.tsx` drift Low; `no-scrollbar` keyboard scrollability Low; `QuotaExceededError` silent swallow Low). Bundled into a single ~1.5–2-hour hardening story. Supersedes/expands the scope of the original P3-001 bundle. |

### Epic 6 Forward-Look (Updated for Story 5.5 Substrate)

Story 5.5 produced a structural change to the data model that flows directly into Epic 6's testability preview (see `test-design-architecture.md` § "Epic 6 Forward-Looking Testability Preview" for the original five-story scope):

- **Segments model is now the substrate for Epic 6's agent execution migration.** Story 5.5's `MessageSegment` discriminated-union + `Turn.segments` JSONB column + `ConversationPane` handlers became the canonical shape for how tool calls and recognized actions interleave with agent text. Epic 6's new `agui-event-bridge.service.ts` (Story 6.2) will receive the sandbox-agent normalized event stream via Daytona's `getSessionCommandLogs` API and re-encode to AG-UI events — those AG-UI events feed the same `ConversationPane` handlers epid by Story 5.5. The test seam must be designed against the **post-Story-5.5** handler behavior (segments-shaped events), not the pre-5.5 flat-`messages`-array behavior.
- **`pendingClassifierPromises` pattern is the test-seam parity reference.** The `M3-new` finding above means the `AguiEventBridgeServiceFake` (the new test double Story 6.2 will introduce) must mirror the production `void`-returned-promise + `Promise.allSettled(promises)` pattern from the start. The Story 5.5 lesson: a fake that is "more deterministic than production" masks timing-dependent bugs.
- **Status-overwrite lesson generalizes.** The `M2-new` defense-in-depth guard (preserve `'error'` state if a later event arrives with conflicting status) is a pattern the new event bridge must follow for any stateful AG-UI event type that has both "streaming-end" and "result" semantics. The recommended P1-019 regression test (out-of-order `TOOL_CALL_RESULT` → `TOOL_CALL_END`) is the template for similar out-of-order assertions Epic 6 should add.
- **Segment-payload sizing feeds NFR-P2 / NFR-P4 budgeting.** Story 5.5 added a `segments: Json?` column to the `Turn` schema; the resume-path `turn.findMany` reads it (with no `take` limit — pre-existing Medium NFR-5.2-1, amplified because the JSONB payload per row grows). Epic 6's real-service timing tests (Story 6.5) must account for this — NFR-P2/P4 budgets now load interleaved segment JSONB, not just flat text.

These items are recorded so that when Epic 6 enters implementation, its per-story ATDD + test-design work begins from a pre-identified testability surface — now including the segments-model substrate Story 5.5 produced.

### Files Edited This Run

- `_bmad-output/test-artifacts/test-design-progress.md` — `lastSaved` updated to 2026-07-13; this Post-Story-5.5 Update section appended after the 2026-07-12 Post-Epic-5 Update section. All earlier content (Post-Epic-5 Update, Steps 1–5) preserved verbatim.
- `_bmad-output/test-artifacts/test-design-architecture.md` — `lastSaved`; status line; new "Post-Story-5.5 Update (2026-07-13)" subsection extending the 2026-07-12 Post-Epic-5 Update with the segments-substrate context; new architectural concerns from the Story 5.5 bug-hunt (`M3-new` test-seam divergence + `L7-new` `web` typecheck target gap) folded into "Testability Concerns and Architectural Gaps"; Epic 6 forward-look paragraphs extended with Story 5.5 substrate references.
- `_bmad-output/test-artifacts/test-design-qa.md` — `lastSaved`; status line + Executive Summary test counts (853 → 1201 total); Exit Criteria P0/P1 thresholds (matches the PASS gate decision); Story 5.5 IC scenarios added to the coverage matrix in the Conversations feature area; Post-Epic-5 Gap Closure Plan extended with a "Post-Story-5.5 Gap Closure Update" that closes P1-014 + P1-016 + parts of P3-001 and adds new items P1-018, P1-019, P1-020, P3-002; Epic 6 forward-look paragraphs extended with Story 5.5 substrate references.
- `_bmad-output/test-artifacts/test-design/bmad-easy-handoff.md` — `generatedAt` extended with revised-2026-07-13; Post-Story-5.5 Update section; Phase Transition table updated (Implements Test Automation → Release line for Epic 5: CONCERNS → PASS for the gate status; Story-9-5.5 segments-model substrate noted in Risk-to-Story mapping and Epic 6 Forward-Look).
- `_bmad-output/test-artifacts/automation-summary.md` — minimal stale-data note refreshed; test counts updated (853 → 1201 total + 7 Story 5.5 E2E); gate decision updated (CONCERNS → PASS). Retained as historical reference; per-story automate-validation reports remain the source of truth.

## Post-Epic-4 Update (2026-07-14, EDIT mode)

**Trigger:** Epic 4 ("MVP Cloud Deployment Provisioning", 12 stories 4-1 through 4-12) completed 2026-07-12 through 2026-07-14. The 2026-07-14 traceability matrix extension (`traceability-matrix.md` § "Epic 4 Extension") and the bug-hunt overlay (`bug-hunt-epic-4.md`) + Epic 4 retro (`epic-4-retro-2026-07-14.md`) landed. This section records the post-Epic-4 reality so the system-level progress file matches `sprint-status.yaml` (all 12 Epic 4 stories `done` + `epic-4: done` + `epic-4-retrospective: done`). The prior Post-Epic-5, Post-Story-5.5, and original Steps 1–5 sections are preserved verbatim for auditability.

**Autonomous decisions (in place of halting at the skill's step-01-confirm and step-02-confirm gates):**

1. **Mode determination:** chose `[E] Edit` per the task brief; the system-level plan already exists and surgical edits are needed.
2. **Target selection (step-01-assess #1):** targeted `test-design-architecture.md`, this file, `test-design-qa.md`, `test-design-epic-hydration-gap.md`, and `ci-pipeline-progress.md`. Did not create duplicate artefacts.
3. **Confirmation gates (step-01-assess #3, step-02-apply-edit #1):** proceeded without halting; recorded this decision here per the unattended-operation guideline.

### Current Project State (2026-07-14, post-Epic-4)

| Epic | Status | Stories | Test Artefacts |
|---|---|---|---|
| Epic 1 (Authentication & Repository Connection) | done | 9 (1.1–1.9) | ATDD + automate-validation + test-review; epic-1-retrospective done |
| Epic 2 (Project Map & Artifact Browser) | done | 6 (2.1–2.6) | ATDD + automate-validation + test-review; epic-2-retrospective done |
| Epic 3 (Conversations — Running BMAD Skills with the Agent) | done | 12 (3.1–3.12) | ATDD + automate-validation + test-review + NFR per story; epic-3-retrospective done |
| Epic 4 (MVP Cloud Deployment Provisioning) | **done** | **12 (4.1–4.12)** | ATDD + automate-validation for all 12 stories + NFR for 6 (4-1, 4-2, 4-3, 4-6, 4-9, 4-12) + **bug-hunt-epic-4 + traceability extension + epic-4-retrospective** (the missing Wave-1+2 closeout run from the Epic 5 retro agreement) |
| Epic 5 (UX Mockup Fidelity — Close Visual Drift) | done | 5 (5.1–5.5) | ATDD + automate-validation + test-review (4 of 5) + per-story + epic-level NFR; bug-hunt + traceability + NFR all re-run for Story 5.5 on 2026-07-13; gate = PASS |
| Epic 6 (Sandbox-Based Agent Execution) | backlog | 5 (6.1–6.5) | None yet — Story 4.5's Anthropic proxy is the contract Epic 6 builds on |
| Epic 7 (Live-Usage UX Improvements) | backlog | 5 (7.1–7.5) | backlog — 5 UX gaps discovered post-Epic-5; frontend presentation only |

**Correction to the 2026-07-12 and 2026-07-13 table:** those tables listed "no Epic 4 — numbering skips per `epics.md`". That was incorrect — Epic 4 (MVP Cloud Deployment Provisioning) was defined in `epics.md:941-1222` and ran in parallel with Epic 5 (2026-07-12 through 2026-07-14). The prior tables omitted Epic 4 because the test-design workflow was last in Create/Edit mode on 2026-07-13, before Epic 4 stories had completed. This is now corrected.

### Test Counts (2026-07-14 verification)

| Type | Count |
|---|---|
| Total test files (`apps/` + `playwright/`) | 133 files |
| Total test cases (grep-based `it`/`test` count) | ~1,876 cases |
| `.skip` markers | 12 (all environment-gated, none broken) |
| E2E spec files (`playwright/e2e/`) | 28 (across shell, auth, onboarding, project-map, artifact-browser, conversation, multi-conn, performance-spike, real-service shelves) |
| Component test files (`apps/web/src/**/*.test.tsx`) | 37 |
| Unit test files (co-located `*.spec.ts`) | 29 (apps/web + apps/agent-be + libs) |
| Integration test files | 8 total: 4 in `apps/web/src/lib/` + 5 in `apps/agent-be/test/integration/` (of which 3 are Epic 4 environment-gated against `RAILWAY_TOKEN`/`VERCEL_TOKEN`/`DATABASE_URL`) |

The prior 2026-07-13 count (1,201 Jest across 81 suites + 7 E2E) reflected only the Epics 1–3 + Epic 5 test surface. Epic 4 added 17 new test files (14 unit-level + 3 integration-level, ~223 cases) plus the 5 new multi-conn/real-service/performance-spike E2E suites from the pre-Epic-4 sandbox-refactor window. The grep-based total (~1,876) includes `.skip`/`.each` variants; the prior Jest-only count was a different counting basis.

### Epic 4 Test Outcomes

- **Traceability gate (2026-07-14 Epic 4 extension):** `CONCERNS` (strict rule-based: FAIL — P0 85.7% < 100%, P1 72.7% < 80% minimum). 43 ACs: 36 FULL, 5 PARTIAL, 2 NONE. The CONCERNS override applies because all 7 gaps are documented — 3 ATDD-deferred one-time-manual per AC text, 2 platform-limitation deferrals (GitHub billing plan, manual sub-step), 2 critical bug-hunt findings tracked for remediation. **Combined Epics 1–4 gate = CONCERNS** (was PASS for Epics 1–3). The Epics 1–3 PASS verdict is preserved; the CONCERNS is entirely attributable to Epic 4.
- **Bug-hunt-epic-4 (`bug-hunt-epic-4.md`, 2026-07-14):** 24 findings (0 critical? No — **2 Critical**, 5 High, 12 Medium, 5 Low). The 2 critical findings block the Epic 4 closeout release:
  - **C1 — Secret rotation cron silently inactive.** `.github/secret-rotation-config.json` ships `"productionLaunchDate": "<YYYY-MM-DD>"` placeholder; `check-rotations.js` parses it → produces empty `[]` → exits 0 → weekly cron reports success and creates no issues. Two false-green tests enforce the broken state. The entire Story 4.12 feature is silently off.
  - **C2 — Deploy quality gate missing SHA check.** `deploy.yml` accepts a stale `test.yml` success run (different commit SHA) as proof — untested commits can deploy.
  - The 5 Highs: H1 no post-deploy health verification, H2 Vercel/Railway split-brain no automation, H3 `check-rotations.js` swallows ALL exceptions + exits 0, H4 Dockerfile install stage omits `.yarn/` directory, H5 `check-rotations.js` ms-arithmetic DST drift.
  - The 12 Mediums concentrate in the runbook-regression-guard false-green test patterns (M3 per-file-not-per-block curl-flag test, M4 regex too narrow, M5 vacuous assertion, M6 over-permissive regex, M7 too-broad token-prefix patterns, M8 env-validation scope too narrow, M9 issue-dedup race, M10 Dockerfile opaque package.json mutation, M11 run-migrations fully mocks execSync, M12 runbook buries auth caveat).
- **Epic 4 retro (`epic-4-retro-2026-07-14.md`):** Key findings: (1) the Wave-1+2 closeout team agreement from the Epic 5 retro was NOT applied to Epic 4 during the epic — the bug hunt + trace extension + NFR aggregation were run post-hoc, not at the closeout boundary; (2) "deferred as human action items" cascade smell (Story 4.5 → 4.6 → 4.7); (3) `--fail`/`--max-time` curl-flag rule adopted mid-epic but not back-applied to 3 earlier runbooks (4.7, 4.8, 4.9); (4) runbook + regression-guard test pattern matured across 6 consecutive stories (4.7–4.12); (5) Story 4.8's strict zero-deferral policy (26 patches inline, 0 deferred) is the cleanest review outcome.

### New Test-Plan Items (Epic 4 cycle, tracked in `test-design-qa.md` Post-Epic-4 Gap Closure Update)

| Test ID | Requirement | Level | Priority | Finding Closed | Notes |
|---|---|---|---|---|---|
| P1-021 | Set real `productionLaunchDate` in `.github/secret-rotation-config.json` + rewrite false-green tests at `check-rotations.spec.ts:513-519` and `secret-rotation-schedule.spec.ts:607-610` to reject the placeholder post-launch | Implementation + tests | P1 | bug-hunt C1 (Critical) | **Blocks Epic 4 closeout release.** Requires Marius to confirm the actual production launch date (derivable from `gh run list --workflow=deploy.yml --status=success --limit=1 --json createdAt`). |
| P1-022 | Strengthen `deploy-workflow.spec.ts:165-222` AC-2 tests to assert `headSha == ${{ github.sha }}` is checked (or `--commit` flag to `gh run list`); tighten `deploy.yml` gate to fail if SHA mismatches + declare accepted `event_name` (push/PR only — no scheduled runs accepted as PR-tier proof) | Implementation + tests | P1 | bug-hunt C2 (Critical) | **Blocks Epic 4 closeout release.** Untested commits can currently deploy. |
| P1-023 | Add post-deploy health verification step in `deploy.yml` (`curl --fail --max-time 30 --retry 5 --retry-delay 10 https://bmad-easy.vercel.app/ && curl --fail --max-time 30 --retry 5 --retry-delay 10 https://agent-be-production-1c09.up.railway.app/health`); fail the deploy job if either check fails + surface rollback guidance in `$GITHUB_STEP_SUMMARY` | Implementation (CI) | P1 | bug-hunt H1 (High) | Deployed app may be unhealthy but deploy reports success; operators only notice via UptimeRobot alert (5-min window of degraded service). |
| P1-024 | Strengthen `check-rotations.js` exit-code contract — exit 0 ONLY for explicitly-empty results; exit non-zero with `console.error` diagnostic for unexpected errors (invalid JSON config, invalid launch date, outer try-catch failures); add `check-rotations.spec.ts` assertions that malformed config and runtime errors produce non-zero exit | Implementation + tests | P1 | bug-hunt H3 (High) | Compounds C1 — even if the placeholder is fixed, future config-file typos or runtime errors will remain invisible. Should be coordinated WITH the C1 fix. |
| P1-025 | Add `.yarn/` directory copy to the Dockerfile install stage (`COPY package.json yarn.lock .yarnrc.yml .yarn ./`) + add `dockerfile.spec.ts` regression guard asserting `.yarn` is copied; migrate `check-rotations.js` due-date calculation from elapsed-ms arithmetic to calendar-day arithmetic (`date.setDate(date.getDate() + intervalDays)`) + update `check-rotations.spec.ts:247-273` to assert calendar-day semantics | Implementation + tests | P1 | bug-hunt H4 + H5 (High) | Two independent fixes bundled. H4 is future-proofing for when Yarn patches are introduced. H5 is DST-drift correctness over multi-year rotation cycles. |
| P2-011 | Optional Docker-image runtime smoke — add `docker compose`-based integration test at `apps/agent-be/test/integration/docker-health.integration.spec.ts` that builds the agent-be image and `curl`s `/health` against a temporary local Postgres | Integration | P2 | 4.3-AC2 (P0 NONE) — ATDD-deferred | Lower priority than the critical findings — the AC text itself frames this as manual; `HEALTHCHECK` in production catches boot failure. |
| P2-012 | Optional launch-smoke E2E — Playwright project that navigates to `https://bmad-easy.vercel.app` on demand, verifying HTTP 200 | E2E (launch-smoke) | P2 | 4.1-AC3 (P1 NONE) — ATDD-deferred | Lower priority — 4 runbook regression-guard tests already verify the URL is documented as the production target across 4 separate test files. |
| P2-013 | Marius decision on 4.6-AC3 GitHub Environment required reviewers — either upgrade GitHub billing plan to support required reviewers + branch restriction protection rules, OR formally document the MVP deferral in `deferred-work.md` and re-classify the AC as a documented project decision | Decision (PM) | P1 (decision) | 4.6-AC3 (P0 PARTIAL) — platform limitation | Not a test-side remediation — requires project owner decision. Without this decision, the AC remains PARTIAL and the P0 gate stays below 100%. |
| P3-003 | Epic-4 runbook-regression-guard test-pattern audit — the 6 stories (4.7–4.12) follow the structural-validation approach (tests read committed runbooks + assert on structure). The bug-hunt surfaced 5 false-green patterns (M3 per-file-not-per-block, M4 regex too narrow, M5 vacuous assertion, M6 over-permissive regex, M7 too-broad token-prefix). Audit all 6 regression-guard test files against this finding list. | Audit + tests | P3 | bug-hunt M3–M7 (Medium) | The structural-validation approach passes while the underlying feature is broken (C1) — the pattern amplifies false-green risk. |

### Prior Test-Plan Items — Carry-Forward Status (since 2026-07-13)

| Test ID | Status (2026-07-14) | Notes |
|---|---|---|
| P1-015 | Still OPEN | Type-checked `connectRepository` mock factory + `.catch()` path test — out of Epic 4 scope (frontend file). |
| P1-017 | Still OPEN | ChatInput AC-4 false-green tightening — out of Epic 4 scope. |
| P1-018 | Still OPEN | Mirror `pendingClassifierPromises` in `AgentServiceFake` — out of Epic 4 scope (agent-be production code not modified by Epic 4). Epic 4 retro confirms this carries forward unchanged — must land before Epic 6. |
| P1-019 | Still OPEN | Story 5.5 M2-new regression test — out of Epic 4 scope. |
| P1-020 | Still OPEN | Add `typecheck` nx target to `apps/web/project.json` — Epic 4 retro notes Story 4.7 added `dependsOn: ["^generate"]` to `agent-be:typecheck` but did NOT add `web:typecheck`. Carries forward. |
| P2-008 | Still OPEN | `withArtifacts` Playwright fixture restoration — no progress in Epic 4. |
| P2-009 | Still OPEN | Loading-skeleton header parity E2E — no progress. |
| P2-010 | Still OPEN | 5.2-AC10 conversation-list scroll E2E — no progress. |
| P3-002 | Still OPEN | Epic-5 NFR hardening bundle — not visible in Epic 4 work. Carries forward; should be verified complete before Epic 6. |

### Stale Plans Removed / Corrected

- **"no Epic 4 — numbering skips per `epics.md`"** (2026-07-12 and 2026-07-13 progress tables) — **REMOVED/CORRECTED**. Epic 4 IS defined and IS complete. The omission was an artifact of the test-design workflow running before Epic 4 stories had completed; it is not a scope change.
- **CI pipeline progress "Real-service specs are out of scope — explicit task instruction"** (`ci-pipeline-progress.md` Tier-Split Step 01 "Assumptions recorded") — **MARKED STALE**. The specs WERE authored: `playwright/e2e/multi-conn/concurrent-sse.spec.ts`, `playwright/e2e/multi-conn/sse-back-pressure.spec.ts`, `playwright/e2e/real-service/functional-smoke.spec.ts`, `playwright/e2e/real-service/nfr-performance.spec.ts`, `playwright/e2e/real-service/nfr-p5-manual-commit.spec.ts`, `playwright/e2e/performance-spike/repo-size.spec.ts` all exist and are environment-gated. The `ci-pipeline-progress.md` file is updated with a Post-Epic-4 section this run.
- **Hydration gap plan (`test-design-epic-hydration-gap.md`) "Status: Draft"** — **MARKED SUPERSEDED**. The hydration gap plan items were addressed during Epics 1–3 + the sandbox-refactor window: `AppShell.hydration.test.tsx` (component test for `hydrateRoot` round-trip), `playwright/support/console-error-guard.ts` (global `page.on('pageerror')` + `page.on('console')` fixture), `playwright/e2e/hydration/hydration.spec.ts` (E2E hydration assertion on `/project-map`), and `setAttribute` in `AppShell.tsx` was refactored to `tabIndex={-1}` prop (confirmed: no `setAttribute` calls remain in `AppShell.tsx`). See the updated hydration gap doc for per-item verification status.

### Epic 6 Forward-Look (updated for Epic 4 dependencies)

Epic 6 remains backlog (5 stories 6.1–6.5). The testability needs the test plan must tee up are recorded in `test-design-architecture.md` § "Epic 6 Forward-Looking Testability Preview" (Story 5.5 substrate + new test seam) and now additionally informed by Epic 4 dependencies:

- **Story 4.5's Anthropic proxy endpoint is the contract Epic 6 builds on.** `architecture.md:259` still describes the OLD direct-injection design — the architect should amend the architecture doc before Epic 6 begins. The `networkAllowList` (Story 6.1) must include the proxy URL (`/api/proxy/anthropic`), not the raw Anthropic API endpoint.
- **`DAYTONA_API_URL` and `DAYTONA_API_KEY` are still `z.string().optional().default('')`** (bug-hunt M1) — production can boot without them. Tighten to `z.string().min(1)` before Epic 6.
- **The deploy workflow (Story 4.6) blocks Epic 6 deploys** if the Test Pipeline is not green — Epic 6 must land green.
- **The `AgentServiceFake` divergence fix (P1-018) must land before Epic 6 starts** — Epic 4 retro confirms this carries forward unchanged. Story 6.2/6.3 will exercise the working-tree path under sandbox execution.
- **`web:typecheck` nx target (P1-020) must be added** — Story 4.7 added `dependsOn: ["^generate"]` to `agent-be:typecheck` but not `web:typecheck`. Epic 6 will touch `apps/web`.
- **Epic 7 (Live-Usage UX Improvements) is now in the backlog** (5 stories 7.1–7.5) — frontend presentation changes only, independent of Epic 6. Not yet in the test design plan; will need an epic-level test design pass when it enters implementation.

- `_bmad-output/test-artifacts/test-design-architecture.md` — `lastSaved`; status line; new "Post-Epic-4 Update (2026-07-14)" subsection extending the 2026-07-13 Post-Story-5.5 Update with the deployment infrastructure reality + actual test tiers + Anthropic proxy architectural concern + Epic 6 forward-look dependency update; re-added the Epic 6 Forward-Looking Testability Preview header (consumed during the edit, restored).
- `_bmad-output/test-artifacts/test-design-progress.md` — `lastSaved`; this Post-Epic-4 Update section appended after the 2026-07-13 Post-Story-5.5 Update. All earlier content preserved verbatim.
- `_bmad-output/test-artifacts/test-design-qa.md` — `lastSaved`; status line; Exit Criteria P0/P1/P2/P3 thresholds updated to reflect the combined CONCERNS gate; Post-Epic-4 Gap Closure Update appended after the Post-Story-5.5 Gap Closure Update; Epic 6 forward-look extended with Epic 4 dependencies.
- `_bmad-output/test-artifacts/test-design-epic-hydration-gap.md` — `lastSaved`; status changed from Draft; Post-Epic-4 Status section appended documenting which hydration gap plan items were addressed and Epic 4's relationship (infra/deployment, no UI changes, no hydration impact).
- `_bmad-output/test-artifacts/ci-pipeline-progress.md` — `lastSaved` updated to 2026-07-14; Post-Epic-4 Update section appended documenting that specs WERE authored (correcting the stale "specs out of scope" assumption) + deploy.yml + secret-rotation-reminder.yml additions + Epic 4 test files.
