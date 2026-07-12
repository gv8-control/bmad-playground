---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-07-12'
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
2. **Target selection (step-01-assess #1):** targeted the existing test-plan files — `test-design-architecture.md`, this file, `test-design-qa.md`, `bmad-easy-handoff.md`, plus a minimal note on the stale `automation-summary.md`. Did not create duplicate artefacts. Left the hydration-gap files (`test-design-progress-hydration-gap.md`, `test-design-epic-hydration-gap.md`) untouched — they are scoped to a separate post-incident design and stand on their own.
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

**Note on Epic 5 status field:** `sprint-status.yaml` still lists `epic-5: in-progress` even though all four stories are `done`. Traceability-matrix-epic-5.md flagged the same. The epic status field is a manual-transition item — not a coverage or quality gap.

### Epic 5 Test Outcomes

- **Traceability gate:** `CONCERNS` (per `traceability/gate-decision-epic-5.json`). 38/38 ACs at FULL coverage; P0 100% (36/36), P1 100% (2/2); 0 critical-open items; 853 tests passing across 65 Jest suites plus 3 active Playwright visual-container specs; 0 skipped.
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
