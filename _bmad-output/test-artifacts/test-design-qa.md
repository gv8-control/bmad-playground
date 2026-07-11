---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-07-07'
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

# Test Design for QA: bmad-easy (System-Level)

**Purpose:** Test execution recipe for QA team. Defines what to test, how to test it, and what QA needs from other teams.

**Date:** 2026-06-16
**Author:** TEA Master Test Architect (BMad)
**Status:** Revised 2026-07-07 — implementation phase (Epics 1–3 complete, 28 stories done per `sprint-status.yaml`; gate decision PASS, 92% coverage, 251/251 tests passing).
**Project:** bmad-easy

**Related:** See Architecture doc (`test-design-architecture.md`) for testability concerns and architectural blockers.

---

## Executive Summary

**Scope:** System-level test coverage for the bmad-easy MVP — repository connection/onboarding, Project Map, Conversations (sandbox-backed agent chat), Artifact Browser, and GitHub-OAuth authentication/access control — plus cross-cutting Security and Observability NFRs.

**Risk Summary:**

- Total Risks: 10 (4 high-priority score ≥6, 4 medium, 2 low)
- Critical Categories: SEC (R-01, tenant isolation), TECH/OPS (R-02, runaway agent), PERF (R-03, repo-size boundary), PERF/OPS (R-04, HTTP/2 deployment invariant)

**Coverage Summary:**

- P0 tests: ~17 (critical paths, security, tenant isolation, sandbox lifecycle)
- P1 tests: ~13 (core flows, NFR timing, durability)
- P2 tests: ~7 (secondary flows, accepted-risk regression checks)
- P3 tests: ~0 identified at system level (none surfaced — see note below)
- **Total**: ~37 scenarios (~140–205 hours, ~4–6 sprints with 1 QA/SDET working in parallel with implementation)

**Note on P3:** No purely cosmetic/exploratory scenarios were identified at system level for this MVP; if any emerge during epic-level test design (e.g., UI polish on Project Map), add them there.

---

## Not in Scope

**Components or systems explicitly excluded from this test plan:**

| Item | Reasoning | Mitigation |
|---|---|---|
| **NFR-S3 (active Sandbox/SSE termination on user deactivation)** | Explicitly deferred to post-MVP per architecture; no enforcement mechanism exists to test | Re-assess in post-MVP test design once the mechanism is built |
| **KEK rotation (R-09)** | Manual, post-MVP operational process; not a feature behavior | Confirm rotation runbook exists; no automated test |
| **next-auth beta-version compatibility (R-10)** | Not a testable behavior, a dependency-monitoring practice | Monitor changelog before any Next.js version bump |

**Note:** Items listed here have been reviewed and accepted as out-of-scope for this system-level pass; revisit if scope changes.

---

## Dependencies & Test Blockers

**CRITICAL:** QA cannot proceed without these items from other teams.

### Backend/Architecture Dependencies (Pre-Implementation)

**Source:** See Architecture doc "Quick Guide" for detailed mitigation plans.

1. **`SandboxService` test seam (B-01)** - Backend lead - ~~Pre-implementation~~ **DELIVERED**
   - ~~QA needs a fake/test-double for `@daytonaio/sdk` (provision/clone/resume/destroy, git config injection).~~
   - `SandboxServiceFake` and `AgentServiceFake` delivered in `apps/agent-be/test/helpers/`; wired via `SANDBOX_SERVICE` / `AGENT_SERVICE` DI tokens through `buildTestModule()`. Fakes reproduce production side effects (DB writes, `terminateProcess`, SSE events). Unblocks P0-006 through P0-011.

2. **Repo-size boundary spike (B-02 / PRD Q-1)** - Architect/PM - ~~Before Conversations epic locks NFR-P2 thresholds~~ **Architectural decision implemented; empirical spike pending**
   - Shallow clone (`--depth=1`) mandated and in code; 200 MB threshold accepted with ≤ 8 s target.
   - NFR-P2 remains CONCERNS (2026-07-07) until the empirical spike runs against real Daytona across repo sizes.

3. **SSE back-pressure quantification (B-03 / NFR-R3)** - Architect - ~~Before Conversations epic test design~~ **RESOLVED & VERIFIED PASS**
   - Threshold defined: 200-event queue cap, 30 s drain timeout, `STREAM_ERROR { code: 'STREAM_BACK_PRESSURE' }` on breach, no silent drops.
   - NFR-R3 audit (2026-07-07): PASS. P1-013 can be written against these thresholds.

4. **Cost-alert threshold (B-04 / PRD Q-2)** - PM - ~~Before cost-observability epic test design~~ **RESOLVED & VERIFIED PASS**
   - `cost-tracking.service.ts` implements per-turn spend tracking; `SPEND_ALERT_THRESHOLD_USD` env-configured with $20/user/month default.
   - NFR-O1 audit (2026-07-07): PASS. Threshold remains PM-tunable via env var.

### QA Infrastructure Setup (Pre-Implementation)

1. **Test Data Factories** - QA
   - Conversation, Artifact, RepoConnection, and credential-health-record factories with faker-based randomization.
   - Transactional-rollback or truncate-between-tests pattern for `libs/database-schemas` (Postgres).

2. **Test Environments** - QA
   - Local: `apps/agent-be` running against local Postgres + `SandboxServiceFake` (B-01 delivered).
   - CI/CD: same fake-backed setup; no real Daytona Cloud calls in PR-tier tests.
   - Staging: real Daytona Cloud, reserved for Nightly/Weekly tiers (load test, outage simulation) — not yet provisioned.

**Example factory pattern:**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('example: create and assert conversation record @p0', async ({ apiRequest }) => {
  const payload = {
    id: `conv-${faker.string.uuid()}`,
    repoConnectionId: `repo-${faker.string.uuid()}`,
    status: 'active',
  };

  const { status } = await apiRequest({
    method: 'POST',
    path: '/api/conversations',
    body: payload,
  });

  expect(status).toBe(201);
});
```

---

## Risk Assessment

**Note:** Full risk details in the Architecture doc. This section summarizes risks relevant to QA test planning.

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Score | QA Test Coverage |
|---|---|---|---|---|
| **R-01** | SEC | Cross-tenant credential leak without tenant check | **6** | Unit test enumerating all credential call sites + P0 negative integration test for cross-tenant resolution |
| **R-02** | TECH/OPS | sandbox-agent crash leaves agent running unsupervised | **6** | P0 integration test killing the bridge mid-session, asserting process termination |
| **R-03** | PERF | NFR-P2 repo-size boundary unvalidated (PRD Q-1) | **6** | Blocked — empirical clone-timing test pending architect spike; treat as CONCERNS until then |
| **R-04** | PERF/OPS | NFR-R4 silent HTTP/1.1 degradation | **6** | P0 integration test opening 10 concurrent SSE connections against an HTTP/2 dev server; launch-checklist deployment check |

### Medium/Low-Priority Risks

| Risk ID | Category | Description | Score | QA Test Coverage |
|---|---|---|---|---|
| R-05 | DATA | Last-write-wins on concurrent same-path commits | 4 | P2 multi-session regression test: two Conversations commit to the same path, assert last-write-wins, no crash |
| R-06 | OPS | Daytona outage shouldn't take down read-only views | 4 | P1 integration test simulating Daytona unavailability; assert Project Map/Artifact Browser still render |
| R-07 | OPS | Orphaned Daytona allocation on provision failure | 4 | P1 integration test on `provision()` failure path asserting teardown |
| R-08 | OPS | Hard-kill of SSE connections on container shutdown | 4 | P2 integration test triggering `onApplicationShutdown` mid-stream |
| R-09 | SEC | KEK has no rotation mechanism (accepted) | 2 | No automated test — confirm runbook exists only |
| R-10 | TECH | next-auth beta dependency risk | 2 | No automated test — changelog monitoring only |

---

## NFR Test Coverage Plan

**Purpose:** Map NFR requirements to planned validation work. This section defines what evidence QA should create or collect; it does not assign final PASS/CONCERNS/FAIL status.

| NFR Category | Requirement / Threshold | Planned Validation | Tool / Level | Evidence Artifact | Priority |
|---|---|---|---|---|---|
| Security (S1) | Sandbox excludes platform-internal credentials; no route to internal services | Env-injection assertion + network-policy test | Integration | CI test run output | P0 |
| Security (S2) | Every credential lookup passes tenant-authorization check | Negative cross-tenant resolution test | Unit + Integration | CI test run output | P0 |
| Security (S4) | OAuth tokens AES-256-GCM encrypted at rest, never returned to client | Ciphertext-column check + API response-schema test | Integration + schema | CI test run output | P0 |
| Performance (P1) | First streamed token ≤1,500ms | Timing assertion on SSE first byte | E2E (Playwright `performance.now()`) | CI timing log | P0 |
| Performance (P2) | Chat ready ≤10s; ≤~200MB repos | Timing assertion + empirical repo-size spike | E2E (Playwright timing) + spike (real Daytona) | CI timing log + spike report | P0 |
| Performance (P3) | Project Map ≤2s | Render timing assertion | Component | CI timing log | P1 |
| Performance (P4) | Artifact Browser ≤2s | Render timing assertion | Component/Integration | CI timing log | P1 |
| Performance (P5) | Manual commit ≤5s (excl. queue wait) | Timing assertion on `manual-commit.service.ts` | Integration | CI timing log | P1 |
| Reliability (R1) | Credential health updates within one git-op cycle | Event-latency assertion on `tool-pill-classifier.service.ts` | Integration | CI test run output | P0 |
| Reliability (R2) | Committed Artifacts always recoverable from git | Kill-sandbox-mid-turn test | Integration | CI test run output | P1 |
| Reliability (R3) | SSE must not silently drop events under back-pressure | Slow-consumer test asserting `STREAM_ERROR` within 30s | Integration | CI test run output | P0 |
| Reliability (R4) | 10 concurrent SSE connections without starvation, HTTP/2 required | 10-connection load test + deployment-config check | E2E (10 Playwright contexts) + launch-checklist | Connection-count log + launch-checklist sign-off | P0 |
| Observability (O1) | Per-user LLM spend tracked from day one; alert at $20/user/month | Per-turn cost-record assertions + alert-trigger assertion | Integration | CI test run output | P0 |

**Missing thresholds or evidence sources:** ~~NFR-P2 repo-size boundary (B-02/Q-1), NFR-R3 back-pressure quantification (B-03), NFR-O1 alert threshold (B-04/Q-2).~~ **(2026-07-07: all three thresholds are now defined — NFR-P2: 200MB / ≤8s, shallow clone in code; NFR-R3: 200-event queue / 30s drain / `STREAM_ERROR`; NFR-O1: $20/user/month env-configured. NFR-R3 and NFR-O1 verified PASS. NFR-P2 remains CONCERNS only because the empirical spike hasn't been run — Daytona is provisionable, ~4h task, no cross-team dependency. The remaining gap is execution, not definition.)**

---

## Entry Criteria

**QA testing cannot begin until ALL of the following are met:**

- [x] All requirements and assumptions agreed upon by QA, Dev, PM
- [x] `SandboxService` test seam (B-01) delivered
- [x] Test data factories ready (`buildTestModule()` + `SandboxServiceFake` / `AgentServiceFake` in `apps/agent-be/test/helpers/`)
- [x] Pre-implementation blockers B-01–B-04 resolved or explicitly accepted (see Architecture doc)
- [x] Feature deployed to a test environment (local dev server with real Daytona + Claude API + GitHub OAuth in `.env.local`; staging not yet provisioned but not required for first-pass validation)
- [x] NFR-P1/P2/P5 timing tests writable against dev server (Playwright `performance.now()`; k6/Artillery is an enhancement for regression hardening, not a prerequisite)

## Exit Criteria

**Testing phase is complete when ALL of the following are met:**

- [x] All P0 tests passing (251/251 per fidelity audit 2026-07-06; P0 100% per gate decision 2026-07-07)
- [x] All P1 tests passing (or failures triaged and accepted) — P1 ≥95% per gate decision (2026-07-07: PASS)
- [x] No open high-priority / high-severity bugs
- [x] Test coverage agreed as sufficient — gate decision PASS (2026-07-07), 92% overall coverage
- [ ] All four score-6 risks (R-01–R-04) have verified mitigations — R-01 verified PASS (NFR-S2), R-02 implemented (circuit breaker PASS), R-03 architectural decision made but empirical spike pending, R-04 HTTP/2 invariant documented but not verified
- [x] NFR-R3 and NFR-O1 alert threshold either resolved or explicitly accepted — both PASS (2026-07-07)

---

## Test Coverage Plan

**IMPORTANT:** P0/P1/P2/P3 = **priority and risk level** (what to focus on if time-constrained), NOT execution timing. See "Execution Strategy" for when tests run.

### P0 (Critical)

**Criteria:** Blocks core functionality + High risk (≥6) + No workaround + Affects majority of users

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---|---|---|---|---|
| P0-001 | Connect repo via URL; OAuth write-access validated before save | Integration | FR-1 | |
| P0-002 | BMAD init validation (`_bmad/`, `_bmad-output/`, `.claude/` + version check) | Integration | FR-2 | |
| P0-003 | Commit attribution: git config injected on first provision | Integration | FR-3, R-01 | |
| P0-004 | Commit attribution: git config re-injected on every resume | Integration | FR-3 | |
| P0-005 | Credential health flips within one git-op cycle of 401/403 | Integration | FR-4, NFR-R1 | |
| P0-006 | Sandbox provisioned on Conversation open; chat ready ≤10s | E2E (timing) | FR-9, NFR-P2, R-03 | **Writable now** — B-02 architecturally resolved (shallow clone in code); dev server + real Daytona accessible. Playwright `performance.now()` around provision→`SESSION_READY`. NFR-P2 remains CONCERNS only because the spike hasn't been run, not because it can't be. |
| P0-007 | First streamed token ≤1,500ms | E2E (timing) | FR-10, NFR-P1 | **Writable now** — Playwright `performance.now()` around SSE first-byte. Dev server + real Claude API accessible (~$1/run). k6/Artillery is for regression hardening, not first-pass. |
| P0-008 | 10 concurrent Conversations without SSE starvation | E2E (load) | FR-11, NFR-R4, R-04 | **Writable now** — 10 Playwright contexts opening SSE against dev server catches the HTTP/1.1 ceiling bug. Production HTTP/2 verification remains a launch-checklist item. |
| P0-009 | Tool Pill/Semantic Pill classification incl. `CREDENTIAL_FAILURE` | Integration | FR-12, NFR-R1 | Needs session-replay fixture |
| P0-010 | sandbox-agent bridge killed mid-session → backend terminates orphaned agent process | Integration | FR-12, R-02 | |
| P0-011 | Conversation resume restores turns and re-injects git config | Integration | FR-13, FR-3 | |
| P0-012 | Sign-in is GitHub-OAuth-only; session persists across reload | E2E | FR-18 | |
| P0-013 | Unauthenticated request redirects; authenticated user has full access | Integration | FR-19 | |
| P0-014 | Sandbox env injection excludes internal credentials; no route to internal services | Integration | NFR-S1 | |
| P0-015 | Every credential-resolving call site enforces tenant check; negative cross-tenant test | Unit + Integration | NFR-S2, R-01 | |
| P0-016 | OAuth tokens stored as ciphertext; never present in any API response | Integration + schema | NFR-S4 | |
| P0-017 | `sandbox.service.ts` test seam exists and is usable for all above tests | Infra (prerequisite) | B-01 | **DELIVERED** — `SandboxServiceFake` + `AgentServiceFake` in `apps/agent-be/test/helpers/`, wired via `buildTestModule()`. Unblocks P0-006 through P0-011. |

**Total P0:** ~17 tests

---

### P1 (High)

**Criteria:** Important features + Medium risk (3-4) + Common workflows + Workaround exists but difficult

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---|---|---|---|---|
| P1-001 | Repo connection state correct after full page reload | Component | FR-5 | |
| P1-002 | Project Map render time ≤2s | Component (timing) | NFR-P3 | |
| P1-003 | Project Map/Artifact Browser readable during simulated Daytona outage | Integration | R-06 | |
| P1-004 | Stop button terminates an in-flight LLM response/tool call | E2E | FR-10 | |
| P1-005 | Working Tree Indicator updates between turns | Component/Integration | FR-14 | |
| P1-006 | Manual commit ≤5s excl. queue wait; no-op when clean; disabled while saving | Integration | FR-15, NFR-P5 | |
| P1-007 | `sandbox.service.ts` provision failure tears down partial allocation | Integration | R-07 | |
| P1-008 | Sandbox restart mid-turn: committed Artifacts readable; uncommitted state not guaranteed | Integration | NFR-R2 | |
| P1-009 | Committed artifact renders ≤2s | Component/Integration (timing) | FR-16, NFR-P4 | |
| P1-010 | Org-restricted GitHub OAuth → user-facing 403 error path | Integration | FR-1, FR-2 | **Writable now** — a real GitHub test org with App-restriction policy is cheap to create; alternatively a single recorded 403 cassette (~1h task). No cross-team dependency. |
| P1-011 | Cost-tracking records per-turn spend correctly | Integration | NFR-O1 | **B-04 resolved** — `SPEND_ALERT_THRESHOLD_USD` env-configured ($20/user/month default); NFR-O1 PASS (2026-07-07). Test fully writable. |
| P1-012 | Empirical repo-size boundary clone-timing spike | E2E (spike, timing) | NFR-P2, R-03 | **Runnable now** — B-02 architecturally resolved (shallow clone in code); Daytona provisionable on demand. Spike is a ~4h QA task (clone repos at 50/100/150/200/250MB, measure through `git status --porcelain`). No cross-team dependency. |
| P1-013 | SSE back-pressure does not silently drop events | Integration | NFR-R3 | **Writable now** — B-03 resolved (200-event queue cap, 30s drain, `STREAM_ERROR { code: 'STREAM_BACK_PRESSURE' }`). Slow-consumer test client against dev server. NFR-R3 PASS (2026-07-07). |

**Total P1:** ~13 tests

---

### P2 (Medium)

**Criteria:** Secondary features + Low risk (1-2) + Edge cases + Regression prevention

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---|---|---|---|---|
| P2-001 | Manual refresh re-reads `_bmad-output` and updates list | Integration | FR-7 | |
| P2-002 | Click on completed vs in-progress artifact routes correctly | E2E | FR-8 | |
| P2-003 | Session-limit-reached message shown at 10-concurrent ceiling | API/Component | FR-9 | |
| P2-004 | Two Conversations commit to the same Artifact path concurrently → last-write-wins, no crash | Integration (multi-session) | R-05 | |
| P2-005 | `onApplicationShutdown` mid-stream drains SSE clients with reconnect-eligible close | Integration | R-08 | |
| P2-006 | Access via Project Map and via Semantic Pill land on the same artifact view; back nav returns correctly | E2E | FR-17 | |
| P2-007 | Artifact list renders grouped by type/status | Component | FR-6 | |

**Total P2:** ~7 tests

---

### P3 (Low)

No P3 scenarios identified at system level for this MVP. Re-evaluate during epic-level test design once UI-polish or exploratory items surface.

---

## Execution Strategy

**Philosophy:** Run everything in PRs unless there's significant infrastructure overhead.

**Organized by TOOL TYPE:**

### Every PR: Functional Tests (~10-15 min target)

**All P0/P1/P2 unit, component, and integration functional tests:**

- Tenant-isolation suite, OAuth/session tests, Tool Pill classifier tests, FR-1–FR-19 functional coverage (excluding load/outage/multi-session scenarios below).
- Single-process, deterministic — fits comfortably inside the 15-minute PR budget.
- **Fake-backed:** `SandboxServiceFake` / `AgentServiceFake` injected via `buildTestModule()`; no real Daytona/Claude API calls in PR tier (cost + flakiness).

**Why run in PRs:** Fast feedback, no expensive infrastructure, no real-service cost.

### Nightly: Multi-Connection / Multi-Process Scenarios (~30-60 min)

- P0-008 (10-concurrent-SSE load test) — 10 Playwright contexts against dev server
- P2-004 (multi-session last-write-wins)
- P1-003 (Daytona-outage simulation)
- P0-010 (sandbox-agent-crash termination test)

**Why defer to nightly:** Each requires multi-connection or multi-process orchestration that exceeds the PR time budget.

### Nightly: Real-Service Smoke Tests (~5-10 min, ~$1-2/run)

**One happy-path agent run end-to-end against real Daytona + real Claude API + real GitHub OAuth.**

- Real `@daytonaio/sdk` provision/clone/git-status (catches SDK shape drift that `SandboxServiceFake` cannot)
- Real Claude Agent SDK streaming (catches AG-UI protocol drift, real first-token timing for NFR-P1)
- Real SSE transport over the dev server (catches HTTP/1.1 ceiling symptoms)
- Real Postgres reads/writes against `bmad_easy_test`

**Why defer to nightly (not PR):** Real Claude API cost (~$0.40–$1.10/session per architecture doc), Daytona provisioning latency (~8s), network flakiness. The fake-backed PR tier covers logic; the real-service nightly tier covers integration drift and timing that fakes can't surface. This is the defense-in-depth backstop for the test fidelity audit's concern that `AgentServiceFake` replaces the entire service (Finding 5, mitigated but open).

**Trade-off:** Real-service tests cost real money and can be flaky. Mitigation: tier split (fake-backed in PR, real-service in Nightly), `fail-fast: false` so transient Daytona failures don't block the rest of the suite, and a 3-retry budget for the real-service tier specifically.

### Weekly / On-Demand: Performance Spikes (~hours)

- P1-012 (repo-size boundary empirical spike) — B-02 architecturally resolved; Daytona provisionable on demand; ~4h QA task (clone repos at 50/100/150/200/250MB, measure through `git status --porcelain`). No cross-team dependency.
- Future k6/Artillery-based NFR-P1/P2 latency regression suite — k6/Artillery is an enhancement for automated regression at scale, not a prerequisite for first-pass validation (Playwright timing covers first-pass).

**Why defer to weekly:** Long-running, infrequent validation sufficient.

**Manual tests** (excluded from automation):

- KEK-rotation runbook validation (R-09)
- next-auth changelog monitoring before version bumps (R-10)

---

## QA Effort Estimate

**QA test development effort only** (excludes DevOps, Backend, Architect, PM work on B-01–B-04).

> **Note (2026-07-07):** These ranges were estimated when the project was greenfield. Implementation of Epics 1–3 is now complete (28 stories done per `sprint-status.yaml`); actual per-story test effort is recorded in the ATDD checklists, automate-validation reports, test reviews, and per-story NFR assessments under `_bmad-output/test-artifacts/`. The system-level ranges below are retained for historical reference. Gate decision (2026-07-07): PASS, 92% overall coverage, 251/251 tests passing.

| Priority | Count | Effort Range | Notes |
|---|---|---|---|
| P0 | ~17 | ~70-100 hours | Complex setup: tenant isolation, sandbox lifecycle, SSE classifier, OAuth |
| P1 | ~13 | ~45-65 hours | Standard integration/component coverage, durability tests |
| P2 | ~7 | ~20-35 hours | Edge cases, multi-session harness, graceful shutdown |
| P3 | 0 | — | None identified at system level |
| **Total** | ~37 | **~140-205 hours (~4-6 sprints)** | **1 QA/SDET working in parallel with feature implementation** |

**Assumptions:**

- Includes test design, implementation, debugging, CI integration.
- Excludes ongoing maintenance (~10% effort).
- Assumes `SandboxService` test seam (B-01) and factory/seeding pattern are delivered early, per the Architecture doc's recommended timeline.
- Excludes the three blocked scenarios (P0-006/P1-012 repo-size, P1-013 back-pressure, NFR-O1 alert threshold) from firm estimates until B-02/B-03/B-04 are resolved.

**Dependencies from other teams:**

- See "Dependencies & Test Blockers" section for what QA needs from Backend, Architect, and PM.

---

## Implementation Planning Handoff

**Use this to inform implementation planning; if no dedicated QA, assign to Dev owners.**

| Work Item | Owner | Target Milestone (Optional) | Dependencies/Notes |
|---|---|---|---|
| `SandboxService` fake/test-double (B-01) | Backend | ~~Pre-implementation~~ **Done** | Delivered — `SandboxServiceFake` + `AgentServiceFake` in `apps/agent-be/test/helpers/` |
| Test data factories + seeding pattern | QA | Implementation Sequence step 2 | Blocks all integration tests needing seeded Postgres rows |
| Load-testing tool selection (k6/Artillery) | Backend/DevOps | Post-MVP (enhancement) | **Not a blocker** — Playwright `performance.now()` covers first-pass P1/P2/P5 timing. k6/Artillery is for automated regression at scale. |
| GitHub org-restriction fixture/cassette | Backend | Before P1-010 is written | **~1h task** — real test org or single 403 cassette; no cross-team dependency |
| Repo-size boundary spike (B-02/Q-1) | Architect | Before Conversations epic test design | Unblocks P0-006, P1-012, R-03 |
| SSE back-pressure quantification (B-03/NFR-R3) | Architect | Before Conversations epic test design | Unblocks P1-013 |
| Cost-alert threshold (B-04/Q-2) | PM | Before cost-observability epic test design | Unblocks NFR-O1 alert test |

---

## Tooling & Access

| Tool or Service | Purpose | Access Required | Status |
|---|---|---|---|
| Jest ~30.3.0 + `buildTestModule()` | `apps/agent-be` unit/integration tests | Repo access (already available) | Ready |
| Playwright ^1.61.0 + `performance.now()` | `apps/web` E2E tests + NFR-P1/P2/P5 first-pass timing assertions | Repo access (already available) | Ready |
| Load-testing tool (k6/Artillery, TBD) | NFR-P1/P2 automated timing *regression suite* (enhancement, not first-pass prerequisite) | Tool selection + CI wiring | Enhancement (post-MVP) |
| GitHub org-restriction fixture/cassette | FR-1/FR-2 403 error path testing | Test org or recorded cassette | **Writable now** (~1h task — real test org or single 403 cassette) |

**Access requests needed (if any):**

- [ ] Select k6/Artillery for an automated timing *regression suite* (enhancement, not a first-pass prerequisite — Playwright timing covers first-pass P1/P2/P5).
- [ ] Provision a GitHub test org with App-restriction policy enabled, or record an HTTP cassette (~1h task).

---

## Interworking & Regression

**Services and components impacted by this feature:**

| Service/Component | Impact | Regression Scope | Validation Steps |
|---|---|---|---|
| `apps/agent-be` (NestJS) | All Conversation, credential, and cost-tracking logic | Full P0/P1 integration suite | Run on every PR |
| `apps/web` (Next.js) | All Server Component renders, OAuth flow, navigation | E2E suite (FR-8, FR-17, FR-18) | Run on every PR |
| `libs/database-schemas` (Prisma/Postgres) | Single shared schema — any migration affects all services | Full integration suite | Run on every PR; schema migrations gated on green suite |
| Daytona Cloud (external) | Sandbox lifecycle, SSE bridge | Nightly load/outage/crash scenarios | Run nightly, not in PR (real-dependency risk) |

**Regression test strategy:**

- All P0/P1 PR-tier tests must pass before merge to `main`.
- Nightly suite failures are triaged each morning; a failing Nightly test blocks the next release candidate, not individual PRs.
- Cross-team coordination needed: Backend must flag any change to `sandbox.service.ts` or `credentials.service.ts` for QA review, since these carry the four score-6 risks.

---

## Appendix A: Code Examples & Tagging

> **Note (2026-07-07):** The `@seontechnologies/playwright-utils` import below was illustrative from the template. The actual project uses standard Playwright config (`playwright.config.ts`, 4 shards, `fail-fast: false`, `trace: 'retain-on-failure'`); verify whether `@seontechnologies/playwright-utils` is installed in `package.json` before adopting the `apiRequest` fixture pattern, or adapt to the project's standard Playwright fixtures (`withArtifacts` / `withRepoConnection`).

**Playwright Tags for Selective Execution (`tea_use_playwright_utils: true`):**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';

// P0 critical test — cross-tenant resolution must be rejected
test('@P0 @Security unauthenticated cross-tenant credential resolution returns 403', async ({ apiRequest }) => {
  const { status, body } = await apiRequest({
    method: 'GET',
    path: '/api/credentials/other-tenant-id',
    skipAuth: true,
  });

  expect(status).toBe(403);
  expect(body.code).toBe('FORBIDDEN');
});

// P1 integration test
test('@P1 @Integration working tree indicator reflects dirty state between turns', async ({ apiRequest }) => {
  const { status, body } = await apiRequest({
    method: 'GET',
    path: '/api/conversations/conv-123/working-tree',
  });

  expect(status).toBe(200);
  expect(body.dirty).toBe(true);
});
```

**Run specific tags:**

```bash
# P0 only (smoke, ~2-5 min)
npx playwright test --grep @P0

# P0 + P1 (core functionality, ~10-15 min)
npx playwright test --grep "@P0|@P1"

# Full regression
npx playwright test
```

---

## Appendix B: Knowledge Base References

- **Risk Governance**: `risk-governance.md` - Risk scoring methodology
- **Test Priorities Matrix**: `test-priorities-matrix.md` - P0-P3 criteria
- **Test Levels Framework**: `test-levels-framework.md` - E2E vs API vs Unit selection
- **Test Quality**: `test-quality.md` - Definition of Done (no hard waits, <300 lines, <1.5 min)
- **NFR Criteria**: `nfr-criteria.md` - Security/Performance/Reliability/Maintainability validation criteria
- **ADR Quality Readiness Checklist**: `adr-quality-readiness-checklist.md` - 8-category/29-criteria testability framework

---

**Generated by:** BMad TEA Agent
**Workflow:** `bmad-testarch-test-design`
**Version:** 4.0 (BMad v6)
