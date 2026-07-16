---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-07-14'
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
  - '_bmad-output/test-artifacts/traceability-matrix.md (2026-07-14 Epic 4 extension)'
  - '_bmad-output/implementation-artifacts/bug-hunt-epic-4.md'
  - '_bmad-output/implementation-artifacts/epic-4-retro-2026-07-14.md'
---

# Test Design for QA: bmad-easy (System-Level)

**Purpose:** Test execution recipe for QA team. Defines what to test, how to test it, and what QA needs from other teams.

**Date:** 2026-06-16
**Author:** TEA Master Test Architect (BMad)
**Status:** Revised 2026-07-14 — post-Epic-4 update. Epics 1, 2, 3, 4, and 5 all complete (45 stories done per `sprint-status.yaml`). Epic 4 (MVP Cloud Deployment Provisioning, 12 stories 4-1 through 4-12) delivered production deployment infrastructure: Vercel project, Railway project + Postgres, Dockerfile, 9 Prisma migrations, env-var wiring + Anthropic proxy endpoint (NFR-S1), manual-trigger deploy workflow, HTTP/2 confirmed, custom domain, database backups, monitoring/alerting, secret rotation reminder. Combined traceability gate (Epics 1–4) = **CONCERNS** (was PASS for Epics 1–3) — Epic 4 extension introduced 7 documented gaps (3 ATDD-deferred one-time-manual ACs, 2 platform-limitation deferrals, 2 critical bug-hunt findings). Bug-hunt-epic-4 (2026-07-14): 24 findings (2 Critical, 5 High, 12 Medium, 5 Low) — C1 (secret rotation cron silently inactive) and C2 (deploy quality gate missing SHA check) require immediate remediation before closeout release. Epic 5 traceability gate = **PASS** (48/48 ACs FULL coverage) per 2026-07-13 baseline. 4-tier CI pipeline now live with authored specs: PR (fake-backed) → nightly multi-conn → nightly real-service → weekly performance-spike — 11 environment-gated E2E skips. Epic 6 (Sandbox-Based Agent Execution) is backlog. Earlier baselines (2026-07-13 post-Story-5.5, 2026-07-12 post-Epic-5, 2026-07-07) are retained as historical reference in the body of this document.
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
- P1 tests: ~13 + 4 post-Epic-5 gap-closure items (P1-014 through P1-017) + 3 post-Story-5.5 gap-closure items (P1-018 through P1-020) = ~20 (core flows, NFR timing, durability, plus the auto-scroll regression test [now CLOSED], type-checked `connectRepository` mock factory, 5.4-AC7 `no-scrollbar` full-width pane test [now CLOSED], ChatInput AC-4 false-green tightening, AgentServiceFake divergence fix, M2-new out-of-order regression test, `web` typecheck nx target)
- P2 tests: ~7 + 3 post-Epic-5 gap-closure items (P2-008 through P2-010) = ~10 (secondary flows, accepted-risk regression checks, plus `withArtifacts` fixture restoration for 5.4 AC-1/AC-5 hover-token E2E, loading-skeleton header parity E2E, 5.2-AC10 conversation-list scroll E2E)
- P3 tests: ~0 + 1 post-Epic-5 implementation bundle (P3-001 NFR quick-wins hardening story — ~6 of 9 items CLOSED in the Story 5.5 cycle) + 1 post-Story-5.5 expanded bundle (P3-002 supersedes P3-001 — closes the remaining Low findings + 6 Story 5.5 NFR Lows + carryover pre-existing Lows) = ~2
**Total (system-level + post-Epic-5 + post-Story-5.5 gap closure)**: ~49 scenarios. **(2026-07-13: post-Story-5.5 update. Story 5.5 added 4 new test-plan items — P1-018 through P1-020 + P3-002; closed P1-014 and P1-016 + ~6 of 9 P3-001 quick-wins (see "Post-Story-5.5 Gap Closure Update" below). Per-story test artefacts under `_bmad-output/test-artifacts/` elaborate these into 1,201 tests across 81 Jest suites [894 web + 307 agent-be] plus 7 Story 5.5 E2E Playwright tests; Epic 5 gate = PASS (was CONCERNS on 2026-07-12; upgraded because the `no-scrollbar` class fix landed during the Story 5.5 bug-hunt), 48/48 ACs at FULL coverage. The system-level scenario count above is retained for shape/planning reference; the traceability matrix is the source of truth for actual coverage.)**

**Note on P3:** The P3-001 NFR quick-wins bundle was the first P3 entry — ~6 of 9 items closed in the Story 5.5 bug-hunt + NFR audit cycle. The expanded bundle (P3-002) supersedes P3-001 as a ~1.5–2-hour hardening story closing the remaining Story 5.5 Lows (L5-new index-based React keys, L6-new handler duplication, L7-new `web` typecheck target if not done as P1-020) + carryover pre-existing Lows (`turn.findMany` `take` limit Medium NFR-5.2-1, `repoConnection.findUnique` `select` projection Low, `conversations/[conversationId]/loading.tsx` drift Low, `no-scrollbar` keyboard scrollability Low, `QuotaExceededError` silent-swallow Low). Additional P3 items may emerge during future epic-level test design.

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

- [x] All P0 tests passing — Epics 1–3: 100% (gate PASS 2026-07-07, 92% coverage; strengthened 2026-07-11 to 106/106 FULL). Epic 5: 100% (gate PASS 2026-07-13, 48/48 ACs FULL). **Epic 4 (2026-07-14 extension): 85.7% P0 coverage (24/28 FULL; 3 PARTIAL, 1 NONE) — gate CONCERNS.** Combined Epics 1–4: 93.9% P0 (62/66 FULL). The 4 Epic-4 P0 gaps are: 4.3-AC2 (Docker image runtime smoke, NONE — ATDD-deferred), 4.6-AC2 (deploy quality gate SHA-match, PARTIAL — bug-hunt C2 Critical), 4.6-AC3 (GitHub Environment required reviewers, PARTIAL — billing-plan limitation), 4.12-AC2 (secret rotation cron silently inactive, PARTIAL — bug-hunt C1 Critical). **The 2 critical bug-hunt findings (C1 + C2) block the Epic 4 closeout release** — see "Post-Epic-4 Gap Closure Update" below.
- [x] All P1 tests passing (or failures triaged and accepted) — Epics 1–3: 100%. Epic 5: 100%. **Epic 4 (2026-07-14): 72.7% P1 (8/11 FULL; 2 PARTIAL, 1 NONE).** Combined Epics 1–4: 94.3% P1 (50/53 FULL). The 3 Epic-4 P1 gaps: 4.1-AC3 (placeholder URL, NONE — ATDD-deferred), 4.5-AC4 (OAuth callback URL, PARTIAL — manual sub-step), 4.12-AC3 (cron-first-issue confirmation + H3/H5 script errors, PARTIAL).
- [x] No open high-priority / high-severity bugs — Epic 4 bug-hunt (2026-07-14): **2 Critical** (C1 secret rotation placeholder disabling the cron silently; C2 deploy quality gate missing SHA check — untested commits can deploy), **5 High** (H1 no post-deploy health verification; H2 Vercel/Railway split-brain no automation; H3 check-rotations.js swallows ALL exceptions; H4 Dockerfile install stage omits `.yarn/` directory; H5 check-rotations.js ms-arithmetic DST drift), **12 Medium** (M1–M12, concentrated in runbook-regression-guard false-green test patterns), **5 Low**. Epics 1–3 + Epic 5 bug-hunt findings: 0 critical, 0 high. The 2 critical findings block the Epic 4 closeout release.
- [x] Test coverage agreed as sufficient — Epics 1–3 gate = **PASS** (106/106 ACs FULL, 2026-07-11). Epic 5 gate = **PASS** (48/48 ACs FULL, 2026-07-13). **Epic 4 gate = CONCERNS** (36/43 ACs FULL, 5 PARTIAL, 2 NONE, 2026-07-14). **Combined Epics 1–4 gate = CONCERNS** (142/149 ACs FULL, 5 PARTIAL, 2 NONE). The combined CONCERNS is entirely attributable to Epic 4 closeout gaps; Epics 1–3 retain their PASS verdict. See "Post-Epic-4 Gap Closure Update" below for the remediation backlog.
- [ ] All four score-6 risks (R-01–R-04) have verified mitigations — R-01 verified PASS (NFR-S2); R-02 implemented (circuit breaker PASS, becomes fully testable under Epic 6 sandbox-based execution — see Forward-Look); R-03 architectural decision made (shallow clone in code) but empirical spike still pending; R-04 HTTP/2 invariant documented but not verified. **No change since 2026-07-07.**
- [x] NFR-R3 and NFR-O1 alert threshold either resolved or explicitly accepted — both PASS (-standing since 2026-07-07; Epic 5 + Story 5.5 did not modify SSE transport or cost tracking)

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
| P0-018 | Story 5.5 AC-1: Tool-call indicator renders inline at stream position (not standalone row) | Component (Jest + RTL) | FR-12, UX-DR5 | **DELIVERED** — `ConversationPane.test.tsx:2429-2457`. Asserts `agentMessageContainers.length === 1` + `toMatch(/Before tool.*Running.*Bash.*After tool/s)` DOTALL regex enforces relative order (post-bug-hunt M1-new fix). |
| P0-019 | Story 5.5 AC-2: Tool-call result replaces indicator in place (no layout shift) | Component | FR-12, UX-DR5 | **DELIVERED** — `ConversationPane.test.tsx:2461-2498`. |
| P0-020 | Story 5.5 AC-3: Semantic Pill promoted in place (same stream position) | Component | FR-12, UX-DR5 | **DELIVERED** — `ConversationPane.test.tsx:2502-2546`. |
| P0-021 | Story 5.5 AC-4: Error-state Tool Pill renders inline (not standalone row) | Component | FR-12, UX-DR5 | **DELIVERED** — `ConversationPane.test.tsx:2551-2587` (uses `toMatch(/Trying.*Bash/s)` DOTALL). |
| P0-022 | Story 5.5 AC-5: Access Notice renders inline below error Tool Pill | Component | FR-12, UX-DR5 | **DELIVERED** — `ConversationPane.test.tsx:2591-2633` (uses `toMatch(/Pushing.*GitHub is rate-limiting/s)` DOTALL). |
| P0-023 | Story 5.5 AC-6: Manual save Semantic Pill renders inline at stream position (SUCCEEDED + FAILED) | Component | FR-12, FR-15, UX-DR5 | **DELIVERED** — `ConversationPane.test.tsx:2636-2702`. |
| P0-024 | Story 5.5 AC-7: ChatMessage data model supports interleaved tool calls (`segments` discriminated union) | Type-level + Backend persistence | FR-12 | **DELIVERED** — `libs/shared-types/src/conversation.types.ts:25-27` (compiler-enforced discriminated union on `type`); 3 backend persistence tests in `agent.service.unit.spec.ts:1308-1414` verify `Turn.segments` JSONB is dual-written alongside `content`. Prisma migration `20260713120000_add_turn_segments`. |
| P0-025 | Story 5.5 AC-8: SSE event handlers insert/update within the streaming agent message (not flat array) | Component | FR-12, NFR-R3 | **DELIVERED** — all 9 ConversationPane Story 5.5 tests assert `agentMessageContainers.length === 1`; multiple `m.segments.map(...)` updates on each matching event. |
| P0-026 | Story 5.5 AC-9: Resume restores tool pills at original positions (segments persisted + `Array.isArray` guard) | Component | FR-13, FR-12, NFR-R2 | **DELIVERED** — `ConversationPane.test.tsx:2886-2936` uses `toMatch(/Let me check.*Bash.*The task is complete/s)` DOTALL regex (false-green variant FIXED in NFR audit). Resume path: `conversations/[conversationId]/page.tsx:44` `Array.isArray(turn.segments) ? (turn.segments as MessageSegment[]) : undefined` (L4-new guard). |
| P0-027 | Story 5.5 AC-10: AgentMessage renders interleaved tool calls at correct positions | Component | FR-12, UX-DR5 | **DELIVERED** — `AgentMessage.test.tsx:130-155` uses `toMatch(/First.*Read.*Second/s)` DOTALL regex. |
| P0-028 | Story 5.5 inline-pill E2E coverage (AC-1, AC-2, AC-3, AC-4, AC-5, AC-1 multi-tool, AC-2 expand/collapse) | E2E (Playwright) | FR-12, UX-DR5 | **DELIVERED** — `playwright/e2e/conversation/story-5-5-inline-pills.spec.ts` (7 tests, 0 skipped, 0 fixme). Serial mode describe.

**Total P0:** ~17 system-level + 11 Story 5.5-specific (P0-018 through P0-028) = ~28 tests

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

## Post-Epic-5 Gap Closure Plan (2026-07-12)

**Trigger:** Epic 5 complete (4 stories, 38/38 ACs at FULL coverage) but the traceability gate is CONCERNS, not PASS. The wave-1 (bug hunt, fidelity audit, traceability, NFR-5 epic) and wave-2 (per-story NFR aggregation) artefacts identified a small set of follow-up test items that close the documented weaknesses without re-scoping the original system-level coverage matrix below. None blocks release; all are P1/P2/P3 follow-ups.

### New Test-Plan Items

| Test ID | Requirement | Test Level | Priority | Risk / Finding Closed | Notes |
|---|---|---|---|---|---|
| P1-014 | Auto-scroll regression — assert Retry button is scrolled into view on `SESSION_TIMEOUT` while the user is scrolled up | Integration (jsdom) + E2E (real browser, real streaming) | P1 | bug-hunt M1 / NFR-5.3-1 (Medium story-introduced regression) | Recommended default: scroll-override is appropriate for error states (the error is a state change the user should be aware of). Implementation approach: either add `errorMessage`/`showRetry`/`showSpinner` to the existing `useEffect` deps at `ChatMessageList.tsx:44-48`, OR (preferred) add a second `useEffect` that scrolls to bottom when these flags flip, guarded by `isAtBottomRef.current`. |
| P1-015 | Type-checked `connectRepository` mock factory + one `.catch()`-path test (generic "unexpected error occurred" fallback renders) | Unit | P1 | fidelity-audit-2026-07-12 Finding 1 (LOW Gap-C) | Replace `jest.mock('@/actions/repo-connection.actions', () => ({ connectRepository: jest.fn() }))` at `RepositoryUrlForm.test.tsx:20-22` with a typed factory keyed on `ConnectResult`. Mitigated by `repo-connection.actions.spec.ts` (646 lines, action end-to-end covered) — only the consumer-side mock shape is unverified. |
| P1-016 | 5.4-AC7 `no-scrollbar` full-width artifact-list pane: add the class + render a test case without an `id` searchParam asserting `no-scrollbar` is present | Unit (component) | P1 | bug-hunt M2 / NFR-5.4-2 / traceability concern 1 | One-line implementation fix at `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:123` plus one test case in `page.test.tsx`. Existing tests pass `{ id: 'art_1' }` (two-pane mode) — the full-width layout is the untested path. |
| P1-017 | Tighten ChatInput AC-4 disabled-state test — assert the `disabled:` prefix scopes the muted tokens (e.g., `expect(sendButton.className).toContain('disabled:bg-text-3')`) AND add a positive assertion that the enabled Send button does NOT contain `bg-text-3` | Unit (component) | P1 | bug-hunt L1 (false-green test) | The existing `toContain('bg-text-3')` assertion at `ChatInput.test.tsx:224-241` matches both `disabled:bg-text-3` (correct) and `bg-text-3` (always-applied regression). Renders `<ChatInput value="" ... />` only; add a positive `value="hello"` enabled-button case. |
| P2-008 | Restore `withArtifacts` Playwright fixture (broken on unique-constraint violations) and the 5.4 AC-1 (`ArtifactCard` hover border → computed `borderColor`) + AC-5 (`ArtifactListEntry` hover → computed `backgroundColor`) E2E blocks | E2E (Playwright) | P2 | fidelity-audit-2026-07-12 Finding 3 (INFO) | Currently only className-level unit tests remain (`ArtifactCard.test.tsx:147`, `ArtifactListEntry.test.tsx:109-123`). The Story 5.4 computed-style E2E suite covers AC-2/3/6/7 — the hover-only cases (AC-1, AC-5) lack that end-to-end verification. Track `withArtifacts` fixture fix as a deferred-work item; when fixed, restore the removed E2E blocks. |
| P2-009 | Loading-skeleton header parity E2E — every `loading.tsx` renders the same header structure as its companion `page.tsx` (assert `border-b border-surface-raised`, Breadcrumb, h1) | E2E (Playwright) | P2 | bug-hunt L3 / NFR-5.2-3 | Catches the class of `loading.tsx` drift on all 4 depth-1 pages. The specific instance — `conversations/[conversationId]/loading.tsx:4-6` uses pre-5.2 header structure (no `border-b`, no Breadcrumb, `py-6` not `pt-6 pb-4`) — is also a one-line fix bundled into the P3-001 quick-wins story below. |
| P2-010 | Supplement 5.2-AC10 conversation-list scroll behaviour E2E — assert the conversation list scrolls (jsdom cannot test scroll behaviour) | E2E (Playwright) | P2 | traceability concern 4 (5.2-AC10) | Component tests provide structural coverage; this E2E is supplementary — the gate decision does not depend on it. |
| P3-001 | NFR quick-wins bundle — land ~9 small fixes in a single follow-up hardening story | Implementation + tests | P3 | `nfr-assessment-5-epic.md` Quick Wins (closes most bug-hunt L-tier findings) | See "Quick-wins bundle" detail below. |

### P3-001 Quick-Wins Bundle Detail (~1 hour total)

Sourced from `nfr-assessment-5-epic.md` § "Quick Wins". Bundling these into a single PR closes the bulk of Epic 5 NFR findings efficiently:

1. Add `take: 100` to `turn.findMany` at `conversations/[conversationId]/page.tsx:33-37` — closes NFR-5.2-1 (Medium).
2. Add `select: { id: true }` to `repoConnection.findUnique` at `artifacts/page.tsx:24-26` — closes NFR-5.2-2 / NFR-5.4-1 (Low) in a single edit.
3. Add `no-scrollbar` to full-width artifact list pane at `artifacts/page.tsx:123` — closes NFR-5.4-2 / bug-hunt M2 / P1-016's implementation half.
4. Hoist `Intl.DateTimeFormat` to module scope in `AgentMessage.tsx:87-91` and `UserMessage.tsx:11-15` — closes NFR-5.3-3 / bug-hunt L4.
5. Add `aria-live="polite"` assertion at `ChatMessageList.test.tsx:195` — closes NFR-5.3-4 / bug-hunt L2.
6. Update `conversations/[conversationId]/loading.tsx:4-6` to canonical depth-1 header — closes NFR-5.2-3 / bug-hunt L3.
7. Add `tabIndex={0}` + `role="region"` + `aria-label` to the three `no-scrollbar` panels (`SideNavigation.tsx:42`, `ChatMessageList.tsx:75`, `artifacts/page.tsx:93`) — closes NFR-5.4-4 / bug-hunt L6.
8. Add `maxLength={2000}` to `RepositoryUrlForm` input at `RepositoryUrlForm.tsx:46-53` — closes NFR-5.4-5 / bug-hunt L7.
9. Add `MAX_DRAFT_SIZE` guard to `useDraftPersistence` localStorage write — closes NFR-5.3-5.

**Validation:** `yarn nx test web` passes; manual visual check of loading skeleton + `no-scrollbar` panels; lint + typecheck clean.

### Items NOT Requiring New Test-Plan Entries

- **5.3-AC5 branded placeholder not wired** — implementation deferral (DP-5-style design decision); test correctly verifies default placeholder behaviour. No new test needed until the branded variant is implemented.
- **`parseFrontmatter` quoted-YAML handling** (bug-hunt M3) — explicitly deferred per DP-5 (simple string parsing without a YAML parser dependency). Coordinate one-line quote-strip fix with the deferred `stripFrontmatter` regex hardening story; not scoped here.
- **`SlashCommandPicker` header `role="presentation"` inside `role="listbox"`** (bug-hunt L8) — theoretical ARIA structure concern; best-available fix without structural rewrite. Document as accepted deviation; no automated test.
- **`ArtifactViewer` `<a>` link focus ring missing** (bug-hunt L5) — pre-existing, dismissed during 5.3 review as out-of-scope. Coordinate with the deferred `target="_blank"` / `rel="noopener noreferrer"` addition for external links in artifact content. **(2026-07-13: focus ring classes added — `ArtifactViewer.tsx:91-94`; dismissed concern now closed in source; no separate test added.)**

---

## Post-Story-5.5 Gap Closure Update (2026-07-13)

**Trigger:** Story 5.5 shipped (architectural — segments data model + SSE handler rewrite + Prisma migration + backend persistence updates). The 2026-07-13 bug-hunt, NFR audit, and traceability gate re-evaluation moved the Epic 5 gate from CONCERNS → **PASS** (48/48 ACs FULL coverage, 0 critical-open). This section records the delta against the Post-Epic-5 Gap Closure Plan above: which prior items are now CLOSED, which new items emerged from the Story 5.5 cycle, and which carry forward.

### Prior Test-Plan Items — Status Update

| Test ID | Status (2026-07-13) | Notes |
|---|---|---|
| P1-014 | **CLOSED** | Auto-scroll regression quick-win fix applied during Story 5.5 bug-hunt — `ChatMessageList.tsx:45` deps array extended to `[messages, isThinking, errorMessage, showRetry, showSpinner]`. Closes bug-hunt M1 from the 2026-07-12 hunt and NFR-5.3-1. The originally-recommended component+E2E regression test for the scroll-override-on-error behaviour is still valid as a hardening item, but the structural defect (missing effect deps) is gone. Roll the regression test into P3-002 below. |
| P1-015 | Still OPEN | Out of Story 5.5 scope (different file — `RepositoryUrlForm.test.tsx:20-22`). |
| P1-016 | **CLOSED** | 5.4-AC7 `no-scrollbar` full-width artifact-list pane — both implementation (`artifacts/page.tsx:124`) and test (`artifacts/page.test.tsx:265-269`) landed during the Story 5.5 bug-hunt. Closes bug-hunt M2 from the 2026-07-12 hunt, NFR-5.4-2, and traceability concern 1. **This was the single fix that upgraded the Epic 5 traceability gate from CONCERNS → PASS.** |
| P1-017 | Still OPEN | Out of Story 5.5 scope. Tightening the `disabled:` variant assertion on `ChatInput.test.tsx:224-241` remains valid. |
| P2-008 | Still OPEN | `withArtifacts` Playwright fixture restoration + 5.4 AC-1/AC-5 hover-token E2E. No progress in the Story 5.5 cycle. |
| P2-009 | Still OPEN | Loading-skeleton header parity E2E. Still open — `conversations/[conversationId]/loading.tsx:4-6` still uses the pre-5.2 header structure. Bundled into the P3-002 hardening story below as a one-line structural fix. |
| P2-010 | Still OPEN | 5.2-AC10 conversation-list scroll E2E (jsdom cannot test scroll). No progress. |
| P3-001 | **~6 of 9 items CLOSED** | Quick Wins bundle status: (1) `take: 100` on `turn.findMany` — **STILL OPEN** (amplified by Story 5.5's `segments` JSONB column read); (2) `select: { id: true }` on `repoConnection.findUnique` — **STILL OPEN**; (3) `no-scrollbar` on full-width pane — **CLOSED**; (4) `Intl.DateTimeFormat` hoist — **CLOSED** (`UserMessage.tsx:10-14` + `AgentMessage.tsx:27-31`); (5) `aria-live="polite"` assertion — **CLOSED** (`ChatMessageList.test.tsx:201`); (6) loading.tsx canonical header — **STILL OPEN** (rolled into P3-002); (7) `tabIndex={0}` + `role="region"` on the three `no-scrollbar` panels — **STILL OPEN** (rolled into P3-002); (8) `maxLength` on `RepositoryUrlForm` — **CLOSED** (`RepositoryUrlForm.tsx:55` + test at `:324`); (9) `MAX_DRAFT_SIZE` guard — partially applied pre-Story-5.5 (silent-swallow pattern still present, see NFR-5.3-5 — rolled into P3-002). The remaining 4 open items + new Story 5.5 Lows roll into P3-002 below. |

### New Test-Plan Items (Story 5.5 cycle)

| Test ID | Requirement | Test Level | Priority | Risk / Finding Closed | Notes |
|---|---|---|---|---|---|
| P1-018 | `AgentServiceFake` diverges from production `pendingClassifierPromises` pattern — mirror the production `void`-returned promise + `Promise.allSettled(promises)` pattern in the fake's `runTurn` loop so timing-dependent bugs reproduce in fake-based tests | Implementation + tests (fake refactor) | P1 | bug-hunt M3-new / NFR-5.5 Finding 2 / project-context.md:138 test-seam parity rule | ~20-line refactor of `apps/agent-be/test/helpers/agent-service.fake.ts:186-203`. The fix does not change production code (production code is correct today). The M3-new finding is the only NEW Medium test-seam finding Epic 5 introduced; not a production bug. P1 because it could mask future timing-dependent regressions like the one Story 5.5 introduced with `WORKING_TREE_DIRTY` ordering. |
| P1-019 | Story 5.5 M2-new regression test — emit `TOOL_CALL_RESULT` (with `isError: true`) **before** `TOOL_CALL_END` and assert the tool_call segment's `status` remains `'error'` after the END handler fires | Unit (component) | P1 | bug-hunt M2-new / NFR-5.5 Finding 1 (subsequent follow-up) | The production-side fix is applied (`ConversationPane.tsx:402-406` preserves `'error'` state via `const nextStatus: 'error' \| 'completed'`). The regression test is the verification follow-up — locks in the M2-new defense-in-depth guard against future regressions. ~30-minute task. |
| P1-020 | Add `typecheck` nx target to `apps/web/project.json` mirroring `apps/agent-be/project.json` (executor `@nx/js:tsc`, options `{ tsConfig: "apps/web/tsconfig.json" }`). Wire into pre-merge CI workflow alongside `lint` and `test`. | Infra (CI gate) | P1 | NFR-5.5 Finding 5 (L7-new) | Surfaced by the Story 5.5 M2-new TS narrowing sub-bug: the inline ternary `'error' : 'completed' as const` widened `'error'` to `string`, which passed `yarn nx test web` (jest/babel) and `yarn nx lint web` (eslint) silently. Only direct `npx tsc --noEmit -p apps/web/tsconfig.json` surfaced the error. Fixed the immediate bug in the 2026-07-13 NFR audit by extracting `const nextStatus: 'error' \| 'completed'`; the structural gap (no CI type-check on `web`) is what this item closes. ~5-minute task. |
| P3-002 | Epic-5 NFR hardening bundle (post-Story-5.5) — supersedes/expands P3-001. Closes the remaining Low findings + bundles Story 5.5 NFR Lows (L5-new index-based React keys; L6-new `MANUAL_SAVE_SUCCEEDED/FAILED` handler duplication ~150 lines — extract `buildManualSaveSegment` helper) + the Story 5.5 deferred DP-3 per-segment JSON narrowing + carryover pre-existing Lows (turn.findMany `take` limit Medium NFR-5.2-1; `repoConnection.findUnique` `select` projection Low NFR-5.2-2/NFR-5.4-1; `conversations/[conversationId]/loading.tsx` header drift Low NFR-5.2-3; `no-scrollbar` keyboard-scrollability Low NFR-5.4-4; `QuotaExceededError` silent-swallow Low NFR-5.3-5) | Implementation + tests | P3 | closes all remaining Story 5.5 Lows + carryover pre-existing Lows | ~1.5–2 hours bundle. Reduces the per-fix review tax. Roll P2-009 (loading-skeleton fix) into this bundle as well — the loading.tsx drift is also a one-line structural fix alongside the other bundle items. |

### Story 5.5 Specific Test Plan Notes

- **Story 5.5 generated 11 new P0 test-plan entries (P0-018 through P0-028)** in the P0 coverage matrix above — these are the Story-5.5-AC-mapped component, type-level, and E2E scenarios. All 11 are DELIVERED with real, exercising tests (verified post-bug-hunt with `yarn nx test web` and `yarn nx test agent-be`). No new coverage gap was introduced by Story 5.5 — the AC-to-test mapping is 100% FULL coverage.
- **Story 5.5 does NOT register a separate ATDD checklist file under the canonical naming pattern.** Story 5.5's ATDD checklist was generated after implementation rather than as a Red-phase scaffold — the red-phase scaffolds (18 skipped tests in `ConversationPane.test.tsx` Story 5.5 describe block) were retrofitted because Story 5.5 was scoped out of Story 5.3 mid-implementation. Track as an evidence note, not a coverage gap.
- **Backend persistence evidence:** Story 5.5's AC-7 (data model) and AC-9 (resume) have backend mirror tests in `agent.service.unit.spec.ts:1308-1414` (3 tests) and `agent.service.spec.ts:184-202` (1 test — strengthened during NFR audit to use `arrayContaining` / `objectContaining` content assertions rather than shape-only).

---

## Post-Epic-4 Gap Closure Update (2026-07-14)

**Trigger:** Epic 4 (MVP Cloud Deployment Provisioning, 12 stories 4-1 through 4-12) completed 2026-07-14. The 2026-07-14 traceability matrix extension evaluated 43 ACs: 36 FULL, 5 PARTIAL, 2 NONE — gate CONCERNS (degraded from the Epics 1-3 PASS). The bug-hunt overlay (`bug-hunt-epic-4.md`) found 24 findings: 2 Critical, 5 High, 12 Medium, 5 Low. The Epic 4 retro documented the missing Wave-1+2 closeout and the "deferred as human action items" cascade smell.

### New Test-Plan Items (Epic 4 cycle)

| Test ID | Requirement | Test Level | Priority | Risk / Finding Closed | Notes |
|---|---|---|---|---|---|
| P1-021 | Set real `productionLaunchDate` in `.github/secret-rotation-config.json` + rewrite false-green tests at `check-rotations.spec.ts:513-519` and `secret-rotation-schedule.spec.ts:607-610` to reject the `<YYYY-MM-DD>` placeholder once launch has occurred | Implementation + tests | P1 | bug-hunt C1 (Critical) / 4.12-AC2 (P0 PARTIAL) | **BLOCKS EPIC 4 CLOSEOUT RELEASE.** Entire Story 4.12 feature silently off until placeholder is replaced + false-green tests rewritten. Requires Marius to confirm the actual production launch date. |
| P1-022 | Strengthen `deploy-workflow.spec.ts:165-222` AC-2 tests to assert `headSha == ${{ github.sha }}` is checked; update `deploy.yml` gate to fail if SHA mismatches; declare accepted `event_name` (push/PR only — no scheduled runs accepted as PR-tier proof) | Implementation + tests | P1 | bug-hunt C2 (Critical) / 4.6-AC2 (P0 PARTIAL) | **BLOCKS EPIC 4 CLOSEOUT RELEASE.** Untested commits can currently deploy — stale-success or scheduled-only run can satisfy the gate. |
| P1-023 | Add post-deploy health verification step in `deploy.yml`: `curl --fail --max-time 30 --retry 5 --retry-delay 10 https://bmad-easy.vercel.app/ && curl --fail --max-time 30 --retry 5 --retry-delay 10 https://agent-be-production-1c09.up.railway.app/health`; fail the deploy job if either check fails + surface rollback guidance in `$GITHUB_STEP_SUMMARY` | Implementation (CI) | P1 | bug-hunt H1 (High) / 4.8-AC4 | Deployed app may be unhealthy but deploy reports success; 5+ min window of degraded service before UptimeRobot alert. |
| P1-024 | Strengthen `check-rotations.js` exit-code contract: exit 0 ONLY for explicitly-empty results; exit non-zero with `console.error` for unexpected errors (invalid JSON, invalid launch date, outer try-catch); add `check-rotations.spec.ts` assertions that malformed config produces non-zero exit | Implementation + tests | P1 | bug-hunt H3 (High) / 4.12-AC2 + 4.12-AC3 | Compounds C1 — future config typos or runtime errors remain invisible without this fix. Coordinate WITH C1. |
| P1-025 | Two fixes: (a) Add `.yarn/` directory copy to Dockerfile install stage + `dockerfile.spec.ts` regression guard (H4 — future-proof Yarn Berry patches/plugins); (b) Migrate `check-rotations.js` due-date from elapsed-ms to calendar-day arithmetic (`date.setDate(date.getDate() + intervalDays)`) + update `check-rotations.spec.ts:247-273` (H5 — DST drift over multi-year cycles) | Implementation + tests | P1 | bug-hunt H4 + H5 (High) | (a) is low-risk future-proofing. (b) is a correctness fix — the contract is "calendar-day interval" not "fixed-ms interval." |
| P2-011 | Optional Docker-image runtime smoke — `docker compose`-based integration test at `apps/agent-be/test/integration/docker-health.integration.spec.ts` that builds the image and `curl`s `/health` against temporary local Postgres | Integration | P2 | 4.3-AC2 (P0 NONE) — ATDD-deferred | Lower priority — AC text frames as manual; `/health` endpoint covered by `app.controller.spec.ts`; Dockerfile `HEALTHCHECK` structurally asserts container probes. |
| P2-012 | Optional launch-smoke E2E — Playwright project that navigates to `https://bmad-easy.vercel.app` on demand, verifying HTTP 200 | E2E (launch-smoke) | P2 | 4.1-AC3 (P1 NONE) — ATDD-deferred | Lower priority — 4 runbook regression-guard tests already verify the URL is documented as the production target. |
| P2-013 | Marius decision on 4.6-AC3 GitHub Environment required reviewers — either upgrade GitHub billing plan to support required reviewers + branch restriction protection rules, OR formally document the MVP deferral in `deferred-work.md` and re-classify the AC as a documented project decision | Decision (PM) | P1 (decision) | 4.6-AC3 (P0 PARTIAL) — platform limitation | NOT a test-side remediation — requires project owner decision. Without this, the AC remains PARTIAL and the P0 gate stays below 100%. |
| P3-003 | Epic-4 runbook-regression-guard test-pattern audit — audit all 6 regression-guard test files (4.7-4.12) against 5 false-green patterns: M3 (curl-flag test per-file not per-block), M4 (`run:` regex catches only multi-line `run: |`), M5 (env-intermediary assertion vacuous), M6 (`human.executed` regex too permissive — `/human[\s_-]executed/i`), M7 (token-prefix regexes too broad/narrow — remove brittle `d49618b7`). Replicate `monitoring-setup.spec.ts:391-421` per-block pattern + `deploy-workflow.spec.ts:334-340` YAML-parse pattern. | Audit + tests | P3 | bug-hunt M3-M7 (Medium) | Structural-validation approach passes while the underlying feature is broken (C1) — the pattern amplifies false-green risk. Bug-hunt notes 16 of 24 findings are "Fixable by dev sub-agent." |

### Prior Test-Plan Items — Carry-Forward Status

| Test ID | Status (2026-07-14) | Notes |
|---|---|---|
| P1-015 | Still OPEN | Out of Epic 4 scope (frontend file). |
| P1-017 | Still OPEN | Out of Epic 4 scope. |
| P1-018 | Still OPEN | `AgentServiceFake` divergence — not applied during Epic 4. **Must land before Epic 6 starts.** |
| P1-019 | Still OPEN | Story 5.5 M2-new regression test — out of Epic 4 scope. |
| P1-020 | Still OPEN | `web:typecheck` nx target — Story 4.7 added `dependsOn` to `agent-be:typecheck` but not `web:typecheck`. **Must land before Epic 6.** |
| P2-008 | Still OPEN | `withArtifacts` Playwright fixture restoration — no progress. |
| P2-009 | Still OPEN | Loading-skeleton header parity E2E — no progress. |
| P2-010 | Still OPEN | 5.2-AC10 conversation-list scroll E2E — no progress. |
| P3-002 | Still OPEN | Epic-5 NFR hardening bundle — not visible in Epic 4 work. Carries forward. |

### Stale Plans / Assumptions Corrected This Run

- **"Real-service specs are out of scope"** (ci-pipeline-progress.md assumption) — **MARKED STALE**. The specs WERE authored: `multi-conn/concurrent-sse.spec.ts`, `multi-conn/sse-back-pressure.spec.ts`, `real-service/functional-smoke.spec.ts`, `real-service/nfr-performance.spec.ts`, `real-service/nfr-p5-manual-commit.spec.ts`, `performance-spike/repo-size.spec.ts` all exist and are environment-gated.
- **"no Epic 4 — numbering skips per `epics.md`"** (test-design-progress 2026-07-12/13 tables) — **CORRECTED**. Epic 4 IS defined and IS complete.

---

## Epic 6 (Sandbox-Based Agent Execution) — Forward-Look

Epic 6 is backlog, not started (per `sprint-status.yaml` and `sprint-change-proposal-2026-07-11.md`). It migrates agent execution from the host process (host-based SDK `query()` per Story 3.3 DP-2) back into the Daytona sandbox per PRD §3 and architecture.md data flow. Five stories (6.1–6.5). Full testability preview is recorded in `test-design-architecture.md` § "Epic 6 ... Forward-Looking Testability Preview". **(2026-07-13 revision: Story 5.5's segments data model is now the substrate Epic 6's agent execution migration builds on — the new `agui-event-bridge.service.ts` (Story 6.2) will emit AG-UI events that feed the post-Story-5.5 `ConversationPane` handlers, not the pre-5.5 flat-`messages`-array shape. The `M3-new` lesson — `AgentServiceFake` diverges from production `pendingClassifierPromises` — generalizes to any new test double Epic 6 introduces. The NFR-P2 timing budget must account for the post-Story-5.5 `segments` JSONB payload, not just the flat `content` Epic 3 budgeted against.)** Headline items for QA planning:

- **Story 6.1 (binary install during provision):** sandbox-agent + Claude Code binaries deployed inside sandbox during provision; `networkAllowList` applied for egress control. Test needs: binary install path + checksum verification; NFR-S1 defence-in-depth test extends P0-014 with a network-route assertion (allow list excludes `apps/agent-be`, Postgres, Auth.js).
- **Story 6.2 (agui-event-bridge.service.ts):** new NestJS service that receives the sandbox-agent normalized event stream via Daytona's `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)` API and re-encodes to AG-UI events, with circuit breaker + heartbeat. Test needs: new `IAguiEventBridgeService` / `AGUI_EVENT_BRIDGE_SERVICE` Symbol-token test seam + `AguiEventBridgeServiceFake` delivered with the service, not bolted on after (B-01 lesson); possible `ISandboxService` extension for `getSessionCommandLogs` so the bridge can be integration-tested without real Daytona.
- **Story 6.3 (AgentService migration):** `AgentService.runTurn()` launches sandbox-agent inside sandbox via Daytona process session; streams via event bridge; `stop()` terminates a real sandbox process. Test needs: P0-010 (sandbox-agent bridge killed mid-session → backend terminates the orphaned agent process) becomes fully testable — tighten the assertion to verify the Daytona process session actually terminates; update `AgentServiceFake` to reflect the new execution mechanism (per `sprint-change-proposal-2026-07-11.md` §4.6 post-implementation updates).
- **Story 6.4 (verify working-tree / commit / credential flows):** existing P0-009 (Tool Pill/Semantic Pill classification incl. `CREDENTIAL_FAILURE`), P1-005 (Working Tree Indicator), P1-006 (Manual commit), P0-003/004 (git config injection) all need regression runs against the new sandbox-based execution path. The host-based `terminateProcess` no-op behaviour (Story 3.3 DP-2) is replaced by real sandbox process termination.
- **Story 6.5 (Real-Service E2E verification):** Tier 3 real-service smoke + NFR-P1/P2 timing tests pass. This makes the "Nightly: Real-Service Smoke Tests" tier (see "Execution Strategy" / "Real-Service Smoke Tests" above) mandatory, not a deferred enhancement — NFR-P1 (first token ≤1,500ms) and NFR-P2 (chat ready ≤10s) timing assertions depend on the real Daytona + Claude path the new sandbox-based execution exercises.
- **Env validation:** `ANTHROPIC_API_KEY` becomes required in `apps/agent-be/src/config/env.validation.ts` Zod schema; `AGENT_WORKDIR` becomes dead config (remove). Update the env-validation unit test accordingly when the change ships.

**Action before Epic 6 implementation begins:** architect adds `IAguiEventBridgeService` to `libs/shared-types` before Story 6.2 implementation starts; QA reviews the test seam design against the B-01 `SandboxService` / `AgentService` pattern (interface + fake + Symbol DI token + `buildTestModule()` wiring). When Epic 6 enters implementation, run `bmad-testarch-test-design` epic-level to generate the per-story ATDD checklists from this forward-look.

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
