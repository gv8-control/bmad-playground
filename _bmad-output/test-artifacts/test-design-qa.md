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

# Test Design for QA: bmad-easy (System-Level)

**Purpose:** Test execution recipe for QA team. Defines what to test, how to test it, and what QA needs from other teams.

**Date:** 2026-06-16
**Author:** TEA Master Test Architect (BMad)
**Status:** Draft
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

1. **`SandboxService` test seam (B-01)** - Backend lead - Pre-implementation
   - QA needs a fake/test-double for `@daytonaio/sdk` (provision/clone/resume/destroy, git config injection).
   - Without it, nearly every Conversation-path test (FR-9–FR-15) either hits real Daytona Cloud or stays unwritten.

2. **Repo-size boundary spike (B-02 / PRD Q-1)** - Architect/PM - Before Conversations epic locks NFR-P2 thresholds
   - QA needs an empirical clone-timing result across repo sizes to write a P0/P1 NFR-P2 pass/fail test.
   - Until resolved, NFR-P2 is treated as CONCERNS by default (per `nfr-criteria.md` ambiguous-threshold rule).

3. **SSE back-pressure quantification (B-03 / NFR-R3)** - Architect - Before Conversations epic test design
   - QA needs a numeric definition ("must not silently drop" → max buffer size or max pause before a synthetic error event).
   - No test can be written until this exists.

4. **Cost-alert threshold (B-04 / PRD Q-2)** - PM - Before cost-observability epic test design
   - QA needs the finalized per-user spend alert threshold to test NFR-O1's alerting behavior (the tracking mechanism itself is testable now).

### QA Infrastructure Setup (Pre-Implementation)

1. **Test Data Factories** - QA
   - Conversation, Artifact, RepoConnection, and credential-health-record factories with faker-based randomization.
   - Transactional-rollback or truncate-between-tests pattern for `libs/database-schemas` (Postgres).

2. **Test Environments** - QA
   - Local: `apps/agent-be` running against a local Postgres + the `SandboxService` fake (once B-01 is delivered).
   - CI/CD: same fake-backed setup, no real Daytona Cloud calls in PR-tier tests.
   - Staging: real Daytona Cloud, used only for Nightly/Weekly tiers (load test, outage simulation).

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
| Performance (P1) | First streamed token ≤1,500ms | Timing assertion on SSE first byte | Integration (tool TBD) | CI timing log | P0 |
| Performance (P2) | Chat ready ≤10s; ≤~200MB repos | Timing assertion + empirical repo-size spike | Integration + spike (blocked, B-02) | CI timing log + spike report | P0 (blocked) |
| Performance (P3) | Project Map ≤2s | Render timing assertion | Component | CI timing log | P1 |
| Performance (P4) | Artifact Browser ≤2s | Render timing assertion | Component/Integration | CI timing log | P1 |
| Performance (P5) | Manual commit ≤5s (excl. queue wait) | Timing assertion on `manual-commit.service.ts` | Integration | CI timing log | P1 |
| Reliability (R1) | Credential health updates within one git-op cycle | Event-latency assertion on `tool-pill-classifier.service.ts` | Integration | CI test run output | P0 |
| Reliability (R2) | Committed Artifacts always recoverable from git | Kill-sandbox-mid-turn test | Integration | CI test run output | P1 |
| Reliability (R3) | SSE must not silently drop events under back-pressure | Blocked — no quantitative threshold yet (B-03) | N/A | N/A | Blocked |
| Reliability (R4) | 10 concurrent SSE connections without starvation, HTTP/2 required | 10-connection load test + deployment-config check | Integration (load) | Connection-count log + launch-checklist sign-off | P0 |
| Observability (O1) | Per-user LLM spend tracked from day one; alert at launch | Per-turn cost-record assertions | Integration | CI test run output | P1 (tracking) / Blocked (alert threshold, B-04) |

**Missing thresholds or evidence sources:** NFR-P2 repo-size boundary (B-02/Q-1), NFR-R3 back-pressure quantification (B-03), NFR-O1 alert threshold (B-04/Q-2). All three require architect/PM clarification before `nfr-assess` can issue a final PASS/CONCERNS/FAIL for their respective categories.

---

## Entry Criteria

**QA testing cannot begin until ALL of the following are met:**

- [ ] All requirements and assumptions agreed upon by QA, Dev, PM
- [ ] `SandboxService` test seam (B-01) delivered
- [ ] Test data factories ready (Conversation, Artifact, RepoConnection, credential-health)
- [ ] Pre-implementation blockers B-01–B-04 resolved or explicitly accepted with owner/date
- [ ] Feature deployed to a test environment
- [ ] A load-testing tool selected for NFR-P1/P2 automation

## Exit Criteria

**Testing phase is complete when ALL of the following are met:**

- [ ] All P0 tests passing
- [ ] All P1 tests passing (or failures triaged and accepted)
- [ ] No open high-priority / high-severity bugs
- [ ] Test coverage agreed as sufficient by QA Lead and Dev Lead
- [ ] All four score-6 risks (R-01–R-04) have verified mitigations
- [ ] NFR-R3 and NFR-O1 alert threshold either resolved or explicitly accepted as open with sign-off

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
| P0-006 | Sandbox provisioned on Conversation open; chat ready ≤10s | E2E (timing) | FR-9, NFR-P2, R-03 | Blocked pending B-02 |
| P0-007 | First streamed token ≤1,500ms | Integration (timing) | FR-10, NFR-P1 | Tool TBD |
| P0-008 | 10 concurrent Conversations without SSE starvation | Integration (load) | FR-11, NFR-R4, R-04 | |
| P0-009 | Tool Pill/Semantic Pill classification incl. `CREDENTIAL_FAILURE` | Integration | FR-12, NFR-R1 | Needs session-replay fixture |
| P0-010 | sandbox-agent bridge killed mid-session → backend terminates orphaned agent process | Integration | FR-12, R-02 | |
| P0-011 | Conversation resume restores turns and re-injects git config | Integration | FR-13, FR-3 | |
| P0-012 | Sign-in is GitHub-OAuth-only; session persists across reload | E2E | FR-18 | |
| P0-013 | Unauthenticated request redirects; authenticated user has full access | Integration | FR-19 | |
| P0-014 | Sandbox env injection excludes internal credentials; no route to internal services | Integration | NFR-S1 | |
| P0-015 | Every credential-resolving call site enforces tenant check; negative cross-tenant test | Unit + Integration | NFR-S2, R-01 | |
| P0-016 | OAuth tokens stored as ciphertext; never present in any API response | Integration + schema | NFR-S4 | |
| P0-017 | `sandbox.service.ts` test seam exists and is usable for all above tests | Infra (prerequisite) | B-01 | Blocks P0-006 through P0-011 |

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
| P1-010 | Org-restricted GitHub OAuth → user-facing 403 error path | Integration | FR-1, FR-2 | Needs GitHub org fixture/cassette |
| P1-011 | Cost-tracking records per-turn spend correctly | Integration | NFR-O1 | Tracking mechanism only; alert threshold blocked (B-04) |
| P1-012 | Empirical repo-size boundary clone-timing spike | Integration (spike) | NFR-P2, R-03 | Blocked pending architect (B-02); becomes a real test once resolved |
| P1-013 | SSE back-pressure does not silently drop events | Integration | NFR-R3 | Blocked — cannot assign test until threshold defined (B-03) |

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

**Why run in PRs:** Fast feedback, no expensive infrastructure.

### Nightly: Multi-Connection / Multi-Process Scenarios (~30-60 min)

- P0-008 (10-concurrent-SSE load test)
- P2-004 (multi-session last-write-wins)
- P1-003 (Daytona-outage simulation)
- P0-010 (sandbox-agent-crash termination test)

**Why defer to nightly:** Each requires multi-connection or multi-process orchestration that exceeds the PR time budget.

### Weekly / On-Demand: Performance Spikes (~hours, tool-dependent)

- P1-012 (repo-size boundary empirical spike) — blocked until a load-testing tool is chosen and B-02 is unblocked.
- Future k6/Artillery-based NFR-P1/P2 latency regression suite once tooling is selected.

**Why defer to weekly:** Expensive infrastructure, long-running, infrequent validation sufficient.

**Manual tests** (excluded from automation):

- KEK-rotation runbook validation (R-09)
- next-auth changelog monitoring before version bumps (R-10)

---

## QA Effort Estimate

**QA test development effort only** (excludes DevOps, Backend, Architect, PM work on B-01–B-04):

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
| `SandboxService` fake/test-double (B-01) | Backend | Pre-implementation | Blocks P0-006 through P0-011 |
| Test data factories + seeding pattern | QA | Implementation Sequence step 2 | Blocks all integration tests needing seeded Postgres rows |
| Load-testing tool selection (k6/Artillery) | Backend/DevOps | Before NFR-P1/P2 automation required | Blocks P1-012, future perf regression suite |
| GitHub org-restriction fixture/cassette | Backend | Before P1-010 is written | Needed for FR-1/FR-2 403 path |
| Repo-size boundary spike (B-02/Q-1) | Architect | Before Conversations epic test design | Unblocks P0-006, P1-012, R-03 |
| SSE back-pressure quantification (B-03/NFR-R3) | Architect | Before Conversations epic test design | Unblocks P1-013 |
| Cost-alert threshold (B-04/Q-2) | PM | Before cost-observability epic test design | Unblocks NFR-O1 alert test |

---

## Tooling & Access

| Tool or Service | Purpose | Access Required | Status |
|---|---|---|---|
| Jest/Vitest + Supertest (or equivalent) | `apps/agent-be` unit/integration tests | Repo access (already available) | Ready |
| Playwright | `apps/web` E2E tests (`tea_use_playwright_utils: true`) | Repo access (already available) | Ready |
| Load-testing tool (k6/Artillery, TBD) | NFR-P1/P2 automated timing assertions | Tool selection + CI wiring | Pending |
| GitHub org-restriction fixture/cassette | FR-1/FR-2 403 error path testing | Test org or recorded cassette | Pending |

**Access requests needed (if any):**

- [ ] Decide and provision a load-testing tool for CI.
- [ ] Provision a GitHub test org with App-restriction policy enabled, or record an HTTP cassette.

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
