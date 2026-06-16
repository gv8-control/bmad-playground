---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-06-16'
workflowType: 'testarch-test-design'
inputDocuments:
  - '_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/adr-quality-readiness-checklist.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/nfr-criteria.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/test-levels-framework.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/risk-governance.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/test-quality.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/test-priorities-matrix.md'
  - '_bmad/tea/config.yaml'
---

# Test Design for Architecture: bmad-easy (System-Level)

**Purpose:** Architectural concerns, testability gaps, and NFR requirements for review by Architecture/Dev teams. Serves as a contract between QA and Engineering on what must be addressed before test development begins.

**Date:** 2026-06-16
**Author:** TEA Master Test Architect (BMad)
**Status:** Architecture Review Pending
**Project:** bmad-easy
**PRD Reference:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`
**ADR Reference:** `_bmad-output/planning-artifacts/architecture.md`

---

## Executive Summary

**Scope:** Full system-level test design for bmad-easy — a SaaS platform giving non-developer team members (PMs/BAs/delivery leads) browser-based access to BMAD methodology skills against their own GitHub repository, via a per-Conversation Daytona Cloud sandbox running the Claude Agent SDK.

**Business Context** (from PRD):

- **Revenue/Impact:** Target pricing ~$25–30/seat/month; PRD §10 includes a cost-floor analysis tying Daytona/Claude spend directly to unit economics.
- **Problem:** Non-dev roles cannot run BMAD methodology skills today because they require a local dev environment, CLI fluency, and direct GitHub repo access.
- **GA Launch:** Not yet dated; project is pre-implementation (no code, no sprint plan).

**Architecture** (from architecture.md):

- **Key Decision 1:** Nx monorepo (pnpm) — `apps/web` (Next.js 15, Vercel) + `apps/agent-be` (NestJS, Railway/Docker) + shared `libs/shared-types`, `libs/database-schemas` (single Prisma schema, Postgres on Railway).
- **Key Decision 2:** One Daytona Cloud sandbox per Conversation; Claude Agent SDK (`claude-sonnet-4-6`, hardcoded) + sandbox-agent (JSONL→AG-UI bridge, pinned exact version) streamed to the browser over SSE (AG-UI protocol).
- **Key Decision 3:** GitHub OAuth (`repo` scope) via Auth.js v5 beta; boundary JWT between `apps/web` and `apps/agent-be`; OAuth tokens stored with AES-256-GCM envelope encryption (DEK+KEK).

**Expected Scale** (from architecture.md):

- Up to 10 concurrent Conversations/sessions per the stated NFR-R4 ceiling; single-container NestJS deploy for MVP (no horizontal scaling yet).

**Risk Summary:**

- **Total risks**: 10 (R-01–R-10)
- **High-priority (≥6)**: 4 risks requiring mitigation before their respective implementation milestones (none score 9 / gate-blocking)
- **Test effort**: ~140–205 hours system-wide (~4–6 sprints for 1 QA/SDET working in parallel with implementation), excluding items currently blocked on open architecture/PM decisions

---

## Quick Guide

### 🚨 BLOCKERS - Team Must Decide (Can't Proceed Without)

**Pre-Implementation Critical Path** — these must be resolved before QA can write the corresponding tests:

1. **B-01: No `SandboxService` test seam** — Architecture must define a fake/test-double interface for `@daytonaio/sdk` (provision/clone/resume/destroy, git config injection) before any Conversation-path integration test can run without hitting real Daytona Cloud (recommended owner: Backend lead, pre-implementation).
2. **B-02: Repo-size performance boundary unresolved (PRD Q-1)** — NFR-P2's "≤200MB" scope is asserted, not empirically validated; blocks any pass/fail test for chat-ready latency until an empirical clone-timing spike is run (recommended owner: Architect/PM).
3. **B-03: SSE back-pressure threshold undefined (NFR-R3)** — "Must not silently drop events" has no numeric definition (buffer size, max delay); no test can be written until this is quantified (recommended owner: Architect).
4. **B-04: Cost-alert threshold undefined (NFR-O1, PRD Q-2)** — Daytona compute cost estimate is pending, so the budget-alert threshold cannot be tested yet, only the tracking mechanism itself (recommended owner: PM).

**What we need from team:** Resolve these 4 items, or explicitly accept them as known gaps with an owner and target date, before integration test development on the Conversations and cost-observability paths begins.

---

### ⚠️ HIGH PRIORITY - Team Should Validate (We Provide Recommendation, You Approve)

1. **R-01: Cross-tenant credential leak** — Single enforcement point already designed (`active-user.guard.ts` + `credentials.service.ts`); we recommend a P0 negative-path integration test attempting cross-user token resolution. Please approve this as sufficient coverage (implementation phase, before `credentials.service.ts` ships).
2. **R-02: Runaway agent on sandbox-agent crash** — Architecture specifies backend-initiated process termination via the Daytona process API; we recommend a test that kills the bridge mid-session and asserts the agent process is actually terminated, not just that an error event is emitted. Please confirm the termination API is reachable from the test environment (implementation phase, AG-UI event proxying step).
3. **R-04: NFR-R4 silent degradation to 6-connection HTTP/1.1 ceiling** — We recommend adding the HTTP/2 capability check to the launch checklist (already named as a deployment invariant) plus a 10-concurrent-SSE integration test. Please confirm DevOps owns the launch-checklist verification (implementation phase, launch-checklist step).

**What we need from team:** Review these three recommendations and approve, or suggest changes.

---

### 📋 INFO ONLY - Solutions Provided (Review, No Decisions Needed)

1. **Test strategy**: Component/Unit/Integration for all deterministic logic; E2E reserved for real navigation flows (FR-8, FR-17, FR-18) and live-browser/SSE scenarios (FR-9 chat-ready, FR-10 Stop button) — minimizes flaky/slow E2E surface.
2. **Tooling**: Jest/Vitest + Supertest (or equivalent) for `apps/agent-be`; Playwright for `apps/web` E2E (per `tea_use_playwright_utils: true`); no contract-testing tool needed (`tea_use_pactjs_utils: false`, single-backend architecture).
3. **Tiered CI/CD**: PR tier (<15 min, all P0/P1 functional tests) → Nightly (multi-connection/multi-process scenarios: 10-concurrent-SSE load, last-write-wins, Daytona-outage simulation, sandbox-crash termination) → Weekly/on-demand (repo-size boundary spike, future k6/Artillery latency regression once a load tool is chosen).
4. **Coverage**: ~38 system-level test scenarios identified across 5 feature areas + cross-cutting security, prioritized P0–P3 with risk-based classification (see companion QA doc for the full coverage matrix).
5. **Quality gates**: P0 = 100% pass, P1 ≥95% pass, all four score-6 risks verified before Conversations epic is release-ready, ≥80% integration coverage on `apps/agent-be`.

**What we need from team:** Just review and acknowledge (we already have the solution).

---

## For Architects and Devs - Open Topics 👷

### Risk Assessment

**Total risks identified**: 10 (4 high-priority score ≥6, 4 medium score 3–5, 2 low score 1–2)

#### High-Priority Risks (Score ≥6) - IMMEDIATE ATTENTION

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
|---|---|---|---|---|---|---|---|---|
| **R-01** | **SEC** | Cross-tenant credential leak if any code path resolves an OAuth token without the tenant check (NFR-S2) | 2 | 3 | **6** | Single enforcement point already designed (`active-user.guard.ts` + `credentials.service.ts`); add P0 test asserting every credential-resolving call site is covered, plus negative cross-tenant test | Backend lead | Before `credentials.service.ts` ships |
| **R-02** | **TECH/OPS** | sandbox-agent crash leaves Claude Code agent running unsupervised, able to keep committing with no SSE listener | 2 | 3 | **6** | Backend-initiated process termination via Daytona process API on bridge death; test must kill the bridge mid-session and assert process termination, not just an error event | Backend lead | AG-UI event proxying implementation step |
| **R-03** | **PERF** | NFR-P2 (10s chat-ready) threshold validated only by single manual run; repo-size boundary (~200MB) asserted but not empirically tested (PRD Q-1, open) | 3 | 2 | **6** | Architect to resolve Q-1 with empirical Daytona clone-timing test across repo sizes before the boundary is locked in the launch checklist; treat as CONCERNS by default until resolved | Architect / PM | Before Q-1 marked resolved |
| **R-04** | **PERF/OPS** | NFR-R4 (10 concurrent SSE/session) silently degrades to a 6-connection HTTP/1.1 ceiling if the load balancer isn't HTTP/2-capable at deploy time | 2 | 3 | **6** | Add explicit launch-checklist HTTP/2 verification plus an integration test opening 10 concurrent SSE connections against a local HTTP/2 dev server | DevOps / Backend lead | Launch-checklist verification step |

#### Medium-Priority Risks (Score 3-5)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|---|
| R-05 | DATA | Last-write-wins on concurrent commits to the same Artifact path — accepted MVP risk, no conflict detection or warning | 2 | 2 | 4 | Two-Conversation concurrent-commit regression test asserting last-write-wins, not a crash | QA |
| R-06 | OPS | Daytona Cloud outage should not take down Project Map / Artifact Browser (pure Postgres reads) | 2 | 2 | 4 | Integration test simulating Daytona unavailability; assert read-only views still render | Backend lead |
| R-07 | OPS | Sandbox provision failure leaves orphaned Daytona allocation (billing leak), no automated cleanup in MVP | 2 | 2 | 4 | Test `provision()` failure path tears down partial allocation explicitly | Backend lead |
| R-08 | OPS | Single-container deploy drops all active SSE connections on shutdown; must drain, not hard-kill | 2 | 2 | 4 | Test that triggers `onApplicationShutdown` mid-stream and asserts reconnect-eligible close | Backend lead |

#### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
|---|---|---|---|---|---|---|
| R-09 | SEC | KEK stored as a plain Railway env var with no rotation mechanism for MVP (accepted risk) | 1 | 2 | 2 | Confirm KEK-rotation runbook exists; no automated test, manual post-MVP process |
| R-10 | TECH | `next-auth@^5.0.0-beta.31` is a beta dependency; an incompatible Next.js patch could force a breaking bump | 1 | 2 | 2 | Monitor changelog before any Next.js version bump (no proactive test) |

#### Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **BUS**: Business Impact (UX harm, logic errors, revenue)
- **OPS**: Operations (deployment, config, monitoring)

---

### NFR Testability Requirements

**Purpose:** Capture what architecture must provide so NFR validation can be automated later. This is planning guidance, not final evidence assessment.

| NFR Category | Threshold / Requirement | Current Design Support | Gap / Decision Needed | Planned Evidence |
|---|---|---|---|---|
| Security | NFR-S1–S4: sandbox network isolation, tenant-scoped credential resolution, deferred active-termination (S3, post-MVP), AES-256-GCM token encryption at rest | Supported — single enforcement point (`active-user.guard.ts`), encryption pattern already named | None for S1/S2/S4; S3 is an accepted MVP gap, not a decision needed now | Integration tests on `credentials.service.ts`; API response-schema test asserting token absence |
| Performance | NFR-P1 (≤1500ms first token), P2 (≤10s chat-ready, ≤~200MB repos), P3/P4 (≤2s renders), P5 (≤5s manual commit) | Partial — thresholds defined for P1/P3/P4/P5; P2 repo-size boundary unvalidated; no load-testing tool named (k6/Artillery) | **Decision needed:** select a load-testing tool for automated P1/P2 timing assertions in CI; resolve Q-1 repo-size boundary | Timing assertions in CI test run logs; future k6/Artillery report once tool is chosen |
| Reliability | NFR-R1 (credential-health update within one git-op cycle), R2 (committed artifacts always recoverable), R3 (no silent SSE event drop under back-pressure), R4 (10 concurrent SSE, HTTP/2 required) | Supported for R1/R2/R4; **unsupported/undefined for R3** | **Decision needed:** quantify "must not silently drop" (max buffer size or max pause before a synthetic error event fires) | Integration test logs; for R4, a connection-count log proving no starvation at 10 concurrent clients |
| Maintainability | Observability NFR-O1: per-user LLM spend tracked from day one, budget alerting operational at launch | Mechanism designed (`cost-tracking.service.ts`); alert threshold value unknown pending Q-2 | **Decision needed:** finalize per-user spend alert threshold once Daytona compute cost (Q-2) is estimated | Per-turn cost-record assertions in test run output |

**Unknown thresholds:** NFR-P2 repo-size boundary (Q-1), NFR-R3 back-pressure quantification, NFR-O1 alert threshold (Q-2). These are tracked as risk R-03 (NFR-P2) and as open clarification items (NFR-R3, NFR-O1) rather than guessed values.

**Assessment boundary:** Final PASS/CONCERNS/FAIL status belongs in `nfr-assess` after implementation evidence exists.

---

### Testability Concerns and Architectural Gaps

**🚨 ACTIONABLE CONCERNS - Architecture Team Must Address**

#### 1. Blockers to Fast Feedback (WHAT WE NEED FROM ARCHITECTURE)

| Concern | Impact | What Architecture Must Provide | Owner | Timeline |
|---|---|---|---|---|
| **No `SandboxService` test seam** | Nearly every Conversation-path test (FR-9–FR-15) either hits real Daytona Cloud or stays unwritten | A fake/test-double implementation of the `@daytonaio/sdk` boundary (provision/clone/resume/destroy, git config injection) | Backend lead | Pre-implementation, before `sandbox.service.ts` is built |
| **No test-data seeding/factory pattern for Postgres** | Conversation, Artifact, RepoConnection, credential-health rows have no repeatable seeding strategy | Factory functions + a transactional-rollback or truncate-between-tests pattern in `libs/database-schemas` | Backend lead | Implementation Sequence step 2 |
| **No load-testing tool named** | NFR-P1/P2 automated timing assertions cannot exist in CI | Selection of k6/Artillery (or equivalent) wired into CI | Backend/DevOps | Before NFR-P1/P2 automation is required |
| **No GitHub org/restricted-token fixture** | FR-1/FR-2's org-restriction 403 error path can't be tested repeatably without a real restricted org | A recorded HTTP cassette or fixture simulating a GitHub App-restriction-policy 403 | Backend lead | Before FR-1/FR-2 integration tests are written |

#### 2. Architectural Improvements Needed (WHAT SHOULD BE CHANGED)

1. **Quantify NFR-R3 back-pressure behavior**
   - **Current problem**: "Must not silently drop events" has no numeric definition.
   - **Required change**: Define max buffer size and/or max pause duration before a synthetic error event fires.
   - **Impact if not fixed**: No automated pass/fail test can exist for this NFR; it remains an unverifiable claim indefinitely.
   - **Owner**: Architect
   - **Timeline**: Before epic-level test design for the Conversations epic locks thresholds

2. **Provide a deterministic shutdown trigger for graceful-drain testing**
   - **Current problem**: Verifying "drain SSE connections rather than hard-kill" has no stated test trigger mechanism.
   - **Required change**: Expose a way to deterministically invoke `onApplicationShutdown` mid-stream in a test environment.
   - **Impact if not fixed**: R-08 (graceful shutdown) cannot be automated, only manually spot-checked.
   - **Owner**: Backend lead
   - **Timeline**: Implementation Sequence step 8

---

### Testability Assessment Summary

**📊 CURRENT STATE - FYI**

#### What Works Well

- ✅ No client-side caching/revalidation (manual-reload-only refresh model) removes an entire class of cache-invalidation flakiness — Server Component renders are a pure function of Postgres state at request time.
- ✅ Single shared Prisma schema (`libs/database-schemas`) eliminates dual-schema drift risk that would otherwise require cross-service contract tests.
- ✅ Consistent `{ code, message, meta }` error envelope and one validation library (Zod/`nestjs-zod`) across `apps/agent-be` makes negative-path API testing uniform — one assertion pattern covers all controllers.
- ✅ Architecture's own pre-mortem pass already identified and structurally resolved two of the higher-risk gaps (NFR-R1 credential-failure propagation → `tool-pill-classifier.service.ts`; runaway-agent-on-crash → backend-initiated process termination) before any code exists — test design can target these named components directly.
- ✅ `apps/agent-be` is the sole Daytona-credential holder with a single authenticated-context path (`boundary-jwt.guard.ts` → `active-user.guard.ts` → `@User()` decorator) — narrows tenant-isolation testing to one enforcement point instead of per-controller checks.

#### Accepted Trade-offs (No Action Required)

For bmad-easy MVP, the following trade-offs are acceptable:

- **Last-write-wins on concurrent same-path commits (R-05)** — no conflict detection or user warning; acceptable given MVP's single-main-branch model and low expected concurrent-edit frequency.
- **NFR-S3 (active session termination on deactivation) deferred to post-MVP** — no enforcement mechanism exists to test; acceptable as the user-deactivation flow itself is out of MVP scope.
- **KEK stored as a plain Railway env var (R-09)** — acceptable for MVP scale; revisit rotation tooling post-MVP.

This is acceptable for Phase 1 (MVP) and should be revisited post-GA, particularly R-05 if concurrent multi-author editing becomes common.

---

### Risk Mitigation Plans (High-Priority Risks ≥6)

**Purpose**: Mitigation strategies for the 4 high-priority risks (score ≥6). These MUST be addressed before the Conversations epic is release-ready.

| Risk | Strategy | Owner | Timeline | Status | Verification |
|---|---|---|---|---|---|
| **R-01** Cross-tenant credential leak | Confirm `active-user.guard.ts` covers every credential-resolving route; add P0 unit test enumerating call sites + P0 negative integration test resolving a foreign tenant's token | Backend lead | Before `credentials.service.ts` ships | Planned | Negative test fails closed (403/404) on cross-tenant resolution |
| **R-02** Runaway agent on crash | Confirm Daytona process API can terminate a running agent from `apps/agent-be`; add P0 integration test killing the bridge mid-session and asserting process termination, not just an error event | Backend lead | AG-UI event proxying step | Planned | Process-termination assertion passes in CI |
| **R-03** NFR-P2 repo-size boundary unresolved | Architect runs empirical clone-timing spike across repo sizes; close PRD Q-1 with a concrete boundary; QA adds the boundary as a timing assertion | Architect / PM | Before Q-1 resolved | Blocked (pending spike) | PRD Q-1 closed; corresponding test added and passing |
| **R-04** NFR-R4 silent HTTP/1.1 degradation | Add HTTP/2 capability check to launch checklist; add P0 integration test opening 10 concurrent SSE connections against an HTTP/2 dev server | DevOps / Backend lead | Launch-checklist step | Planned | 10-connection load test passes with no starvation; checklist signed off |

---

### Assumptions and Dependencies

#### Assumptions

1. The architecture's planned stack (Nx monorepo, Next.js 15 + NestJS, single shared Prisma schema) will not materially change before implementation begins.
2. A load-testing tool (k6/Artillery or equivalent) will be selected before NFR-P1/P2 automated assertions are required in CI.
3. The session-replay fixture referenced in the architecture's Technical Constraints (used for sandbox-agent/AG-UI package upgrade validation) can be reused as the canonical fixture for SSE/Tool-Pill classifier tests.

#### Dependencies

1. `SandboxService` test seam (fake/test-double) — required before Backend lead, pre-implementation.
2. Architect resolution of PRD Q-1 (repo-size boundary) — required before R-03/NFR-P2 thresholds can be locked.
3. PM resolution of PRD Q-2 (Daytona compute cost estimate) — required before NFR-O1 alert threshold can be tested.

#### Risks to Plan

- **Risk**: Sprint planning has not yet started, so this system-level plan cannot yet be mapped to specific stories/sprints.
  - **Impact**: Resource estimates remain system-level ranges, not story-level commitments.
  - **Contingency**: Re-run epic-level test design (`*test-design` Epic-Level Mode) once epics enter sprint planning, using this document and the companion QA doc and handoff doc as inputs.

---

**End of Architecture Document**

**Next Steps for Architecture Team:**

1. Review Quick Guide (🚨/⚠️/📋) and prioritize the 4 blockers (B-01–B-04).
2. Assign owners and timelines for the 4 high-priority risks (R-01, R-02, R-03, R-04) if different from the recommendations above.
3. Validate assumptions and dependencies.
4. Provide feedback to QA on testability gaps, especially the `SandboxService` test seam and NFR-R3 quantification.

**Next Steps for QA Team:**

1. Wait for pre-implementation blockers (B-01–B-04) to be resolved or explicitly accepted.
2. Refer to the companion QA doc (`test-design-qa.md`) for the full test coverage matrix and execution strategy.
3. Begin test infrastructure setup (factories, fixtures, `SandboxService` fake) once Backend lead provides the test seam.
