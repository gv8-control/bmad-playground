---
title: 'TEA Test Design → BMAD Handoff Document'
version: '1.0'
workflowType: 'testarch-test-design-handoff'
inputDocuments:
  - '_bmad-output/test-artifacts/test-design-architecture.md'
  - '_bmad-output/test-artifacts/test-design-qa.md'
sourceWorkflow: 'testarch-test-design'
generatedBy: 'TEA Master Test Architect'
generatedAt: '2026-06-16 (revised 2026-07-07; revised 2026-07-12 post-Epic-5; revised 2026-07-13 post-Story-5.5)'
projectName: 'bmad-easy'
---

# TEA → BMAD Integration Handoff

## Purpose

This document bridges TEA's system-level test design outputs with BMAD's epic/story decomposition workflow (`create-epics-and-stories`). It provides structured integration guidance so that quality requirements, risk assessments, and test strategies flow into implementation planning. **(2026-07-13 post-Story-5.5 update: Epics 1, 2, 3, and 5 complete — 33 stories done per `sprint-status.yaml` — Epic 5 now spans 5 stories including the architectural Story 5.5 segments-model retrofit; Epic 5 traceability gate upgraded CONCERNS → **PASS** (48/48 ACs at FULL coverage, 1,201 Jest tests across 81 suites [894 web + 307 agent-be] + 7 Story 5.5 E2E Playwright tests, 0 skipped); NFR-5 epic PASS-WITH-CONCERNS (3 Medium + 3 Low de-duplicated; only one Medium — M3-new AgentServiceFake test-seam divergence — is Story-5.5-introduced). Test-fidelity audit 2026-07-12 PASS. Epic 6 (Sandbox-Based Agent Execution) is backlog, not started — Story 5.5's segments data model is now the substrate Epic 6's agent execution migration builds on (see "Epic 6 Forward-Look" below).)** This handoff is retained as the system-level quality contract. Per-story test-artifacts (ATDD checklists, automate-validation reports, test reviews, NFR assessments) under `_bmad-output/test-artifacts/` elaborate the scenarios below; the Epic 5 traceability matrix (2026-07-13 revision) records the gate decision: PASS — 48/48 ACs FULL, 0 critical-open, 3 medium-open (test-seam and test-fidelity only — none production-reachable). See `test-design-qa.md` "Post-Story-5.5 Gap Closure Update" for the closed/new test-plan items flowing out of the Story 5.5 cycle.

## TEA Artifacts Inventory

| Artifact | Path | BMAD Integration Point |
|---|---|---|
| Test Design — Architecture | `_bmad-output/test-artifacts/test-design-architecture.md` | Epic quality requirements, architectural blockers (B-01–B-04), risk mitigation plans |
| Test Design — QA | `_bmad-output/test-artifacts/test-design-qa.md` | Story acceptance criteria, coverage matrix, execution strategy |
| Risk Assessment | embedded in both documents above | Epic risk classification, story priority |
| Coverage Strategy | embedded in QA doc (Test Coverage Plan) | Story test requirements |

## Epic-Level Integration Guidance

### Risk References

P0/P1 risks that should appear as epic-level quality gates:

- **Conversations epic** (FR-9–FR-15): R-01 (cross-tenant credential leak), R-02 (runaway agent on crash), R-03 (repo-size boundary, blocked on Q-1), R-04 (HTTP/2 deployment invariant) — all four score-6 risks land in this epic.
- **Repository Connection & Onboarding epic** (FR-1–FR-5): R-01 (shared tenant-isolation enforcement point), GitHub org-restriction fixture dependency.
- **Project Map / Artifact Browser epics** (FR-6–FR-8, FR-16–FR-17): R-06 (Daytona-outage resilience).
- **Authentication & Access Control epic** (FR-18–FR-19): R-01 (tenant/session boundary).
- **Cost-observability cross-cutting concern** (NFR-O1): blocked on Q-2 (B-04) — do not close this epic's quality gate until the alert threshold is finalized.

### Quality Gates

Recommended quality gates per epic, based on risk assessment:

- **Conversations epic**: cannot move to "done" until R-01, R-02, R-04 mitigations are verified by a passing test, and R-03 is either resolved (Q-1 closed) or explicitly accepted as a known gap with PM sign-off.
- **Repository Connection & Onboarding epic**: cannot move to "done" until the `SandboxService` test seam (B-01) exists and the credential tenant-isolation test (R-01) passes.
- **All epics touching `apps/agent-be`**: ≥80% integration coverage target before merge to `main`. (2026-07-07: 92% overall coverage per gate decision; P0 100%, P1 ≥95%.)

## Story-Level Integration Guidance

### P0/P1 Test Scenarios → Story Acceptance Criteria

Critical test scenarios that MUST be acceptance criteria (see `test-design-qa.md` Test Coverage Plan for full IDs):

- P0-003/P0-004 (git config injection on provision and resume) → acceptance criteria on the "commit attribution" story.
- P0-008 (10 concurrent Conversations, no SSE starvation) → acceptance criteria on the "concurrent sessions" story, paired with the HTTP/2 launch-checklist item.
- P0-009/P0-010 (Tool Pill classification, sandbox-agent crash termination) → acceptance criteria on the "AG-UI event proxying" story.
- P0-015/P0-016 (tenant-isolation negative test, OAuth ciphertext-only storage) → acceptance criteria on the "credentials service" story.
- P0-012/P0-013 (GitHub-OAuth-only sign-in, unauthenticated redirect) → acceptance criteria on the "authentication" story.

### Real-Service Smoke Tests (Nightly Tier)

The `SandboxServiceFake` / `AgentServiceFake` test seam (B-01, delivered) covers logic in PR-tier tests but cannot surface real `@daytonaio/sdk` shape drift, real Claude Agent SDK protocol drift, real git clone timing, or real network failure modes. The test fidelity audit (2026-07-06) flagged this as Finding 5 (open, mitigated). A nightly real-service smoke tier addresses this:

- **One happy-path agent run end-to-end** against real Daytona + real Claude API + real GitHub OAuth (~$1-2/run, ~5-10 min)
- **NFR-P1/P2 timing assertions** (Playwright `performance.now()`) — writable today, dev server + real credentials accessible
- **NFR-R4 10-concurrent-SSE smoke** (10 Playwright contexts) — catches HTTP/1.1 ceiling locally
- **P1-012 repo-size spike** — ~4h task against provisionable Daytona, no cross-team dependency

**Trade-off:** Real-service tests cost real money and can be flaky. Mitigation: tier split (fake-backed in PR, real-service in Nightly), `fail-fast: false`, 3-retry budget for the real-service tier. Do not move real-service tests into the PR tier.

### Data-TestId Requirements

Recommended `data-testid` attributes for testability (frontend, `apps/web`):

- Working Tree Indicator component (FR-14) — needs a stable test id distinguishing clean/dirty/saving states for P1-005.
- Tool Pill / Semantic Pill components (FR-12) — needs per-classification test ids (e.g., `tool-pill-credential-failure`) for P0-009.
- Manual commit control (FR-15) — needs a disabled-state test id for P1-006's "disabled while saving" assertion.
- Session-limit-reached banner (FR-9) — needs a test id for P2-003.

## Risk-to-Story Mapping

| Risk ID | Category | P×I | Recommended Story/Epic | Test Level |
|---|---|---|---|---|
| R-01 | SEC | 2×3=6 | Credentials service story (Repository Connection epic) | Unit + Integration |
| R-02 | TECH/OPS | 2×3=6 | AG-UI event proxying story (Conversations epic) | Integration |
| R-03 | PERF | 3×2=6 | Sandbox provisioning story (Conversations epic) — ~~blocked on architect spike (Q-1)~~ spike not yet run; Daytona provisionable, ~4h QA task | E2E (spike, timing) |
| R-04 | PERF/OPS | 2×3=6 | Concurrent sessions story (Conversations epic) + launch-checklist | E2E (10 Playwright contexts) + launch-checklist |
| R-05 | DATA | 2×2=4 | Manual commit / working tree story (Conversations epic) | Integration (multi-session) |
| R-06 | OPS | 2×2=4 | Project Map / Artifact Browser resilience story | Integration |
| R-07 | OPS | 2×2=4 | Sandbox provisioning story (Conversations epic) | Integration |
| R-08 | OPS | 2×2=4 | Deployment/shutdown handling story | Integration |
| R-09 | SEC | 1×2=2 | KEK management (ops runbook, not a story) | Manual |
| R-10 | TECH | 1×2=2 | Dependency monitoring (ops practice, not a story) | Manual |

## Recommended BMAD → TEA Workflow Sequence

1. **TEA Test Design** (`TD`) → produced this handoff document (system-level, 2026-06-16; revised 2026-07-07; revised 2026-07-12 post-Epic-5).
2. **BMAD Create Epics & Stories** → epics/stories existed (`_bmad-output/planning-artifacts/epics.md`); Epics 1, 2, 3, and 5 now complete per `sprint-status.yaml`.
3. **TEA ATDD** (`AT`) → per-story acceptance tests generated (15 ATDD checklists under `_bmad-output/test-artifacts/` — Stories 1.x, 2.x, 3.x, 5.x).
4. **BMAD Implementation** → complete for Epics 1, 2, 3, and 5; B-01 (`SandboxService` test seam) delivered early as planned.
5. **TEA Automate** (`TA`) → per-story automation validation reports generated (22+ files under `_bmad-output/test-artifacts/`, including the four Epic 5 reports).
6. **TEA Trace** (`TR`) → coverage completeness for Epics 1–3 (2026-07-07, gate PASS, 92% coverage) and Epic 5 (2026-07-12, gate CONCERNS, 38/38 ACs at FULL coverage).
7. **TEA NFR Assess** → full NFR audit (2026-07-07, CONCERNS, 18/29 criteria) plus Epic 5 epic-level audit (2026-07-12, PASS-WITH-CONCERNS, 24/29 criteria — all code-level NFRs PASS; the 1 Medium is the Story-5.3-introduced auto-scroll regression tracked in `test-design-qa.md` "Post-Epic-5 Gap Closure Plan").
8. **TEA Test Fidelity Audit** → 2026-07-06 (3 blockers, all now resolved) and 2026-07-12 Epic 5 audit (PASS — 2 LOW Gap-C findings bounded, 1 INFO coverage note on the broken `withArtifacts` fixture).

## Post-Epic-5 Update (2026-07-12)

- **Status:** Epics 1, 2, 3, and 5 complete; Epic 5 gate = CONCERNS (38/38 ACs at FULL coverage, 4 documented weaknesses — none a blocker). NFR-5 epic PASS-WITH-CONCERNS. Test-fidelity audit PASS.
- **Known gaps to close:** see `test-design-qa.md` "Post-Epic-5 Gap Closure Plan" — P1-014 auto-scroll regression test, P1-015 type-checked `connectRepository` mock factory + `.catch()` path test, P1-016 5.4-AC7 `no-scrollbar` full-width pane + test, P1-017 ChatInput AC-4 false-green tightening, P2-008 `withArtifacts` fixture restoration and 5.4 AC-1/AC-5 hover-token E2E, P2-009 loading-skeleton header parity E2E, P2-010 5.2-AC10 conversation-list scroll E2E, P3-001 NFR quick-wins bundle (~9 small fixes, ~1 hour total).
- **Deferred work:** pruned clean (0 orphaned deferred-work items across Epic 5 stories).

## Post-Story-5.5 Update (2026-07-13)

- **Status:** Story 5.5 (the architectural segments-model retrofit, scoped out of Story 5.3 mid-implementation) shipped; Epic 5 now spans 5 stories (5.1–5.5) with all 5 marked `done`; Epic 5 gate upgraded **CONCERNS → PASS** (48/48 ACs at FULL coverage; 1,201 Jest tests across 81 suites [894 web + 307 agent-be] + 7 Story 5.5 E2E Playwright tests; 0 skipped, 0 critical-open). NFR-5 epic re-audit PASS-WITH-CONCERNS (3 Medium + 3 Low de-duplicated; only one Medium — M3-new `AgentServiceFake` diverges from production `pendingClassifierPromises` — is Story-5.5-introduced). Test-fidelity audit (2026-07-12) PASS, no re-run needed.
- **Story 5.5 architectural scope:** changed the `ChatMessage` data model (added `segments?: MessageSegment[]` discriminated union in `libs/shared-types/src/conversation.types.ts:25-27`); rewrote every SSE event handler in `ConversationPane.tsx` to insert/update segments inside the streaming agent message rather than push flat entries to `messages`; added Prisma migration `20260713120000_add_turn_segments` for `Turn.segments JSONB`; updated `AgentMessage.tsx` to render interleaved text + tool_call segments; updated `AgentService` + `AgentServiceFake` for backend dual-write.
- **Bug-hunt (2026-07-13):** 9 new + 11 prior-hunt statuses verified. 3 mediums (M1-new false-green ordering tests — FIXED with DOTALL regex; M2-new TOOL_CALL_END status-overwrite — FIXED; M3-new AgentServiceFake diverges from `pendingClassifierPromises` — OPEN, test-seam only). 6 lows (L1-new shape-only test — FIXED; L2-new shallow status assertion — FIXED; L3-new silent-drop console.warn — FIXED; L4-new Array.isArray guard — FIXED; L5-new index-based React keys — OPEN; L6-new handler duplication — OPEN; L7-new `web` typecheck target missing — OPEN). Prior 2026-07-12 hunt's M1–M3 all CLOSED in this cycle.
- **NFR audit (2026-07-13):** Story 5.5 = PASS-WITH-CONCERNS (8 PASS, 4 CONCERNS — 1 Medium + 3 Low); Epic 5 = PASS-WITH-CONCERNS (23 PASS, 6 CONCERNS — 3 Medium + 3 Low). 7 previously-open findings fixed (auto-scroll M1; no-scrollbar M2; parseFrontmatter M3; Intl.DateTimeFormat L4; ArtifactViewer focus ring L5; aria-live assertion L2; maxLength L7).
- **Quick-wins applied in the Story 5.5 bug-hunt + NFR audit cycle:** auto-scroll effect deps; no-scrollbar class + test on full-width pane; TOOL_CALL_END status-overwrite guard + TS narrowing sub-bug fix; 4 ConversationPane narrative-ordering tests converted from `toContain` chains to DOTALL regex `toMatch`; AC-9 false-green test converted to DOTALL regex; L1-new spec shape-only assertion strengthened to `arrayContaining`/`objectContaining`; L3-new silent-drop path gained `console.warn` defense-in-depth; L2-new shallow `toHaveProperty('status')` → `toBe('completed')`; L4-new `Array.isArray` guard on resume-path `turns.segments` cast.
- **Known gaps to close:** see `test-design-qa.md` "Post-Story-5.5 Gap Closure Update" — P1-018 (Mirror `pendingClassifierPromises` in `AgentServiceFake` to close M3-new); P1-019 (Story 5.5 M2-new regression test — out-of-order `TOOL_CALL_RESULT` → `TOOL_CALL_END` preserves `'error'` status); P1-020 (Add `typecheck` nx target to `apps/web/project.json` mirroring `agent-be`); P3-002 (Epic-5 NFR hardening bundle — supersedes/expands P3-001 — closes the remaining Story 5.5 Lows + carryover pre-existing Lows in a single ~1.5–2-hour hardening story). Prior P1-014 and P1-016 CLOSED; ~6 of 9 P3-001 quick-wins CLOSED; P1-015, P1-017, P2-008, P2-009, P2-010 carry forward.
- **Epic 5 status field:** `sprint-status.yaml` still lists `epic-5: in-progress` even though all 5 stories are `done`. Manual-transition item — not a coverage or quality gap.
- **Deferred work:** still pruned clean (0 orphaned deferred-work items — Story 5.5's only deferred item, the DP-3 per-segment narrowing of persisted JSON, is explicitly out of the 10 AC scope per story spec).

## Epic 6 Forward-Look (Backlog, Not Started)

Epic 6 (Sandbox-Based Agent Execution) migrates agent execution from the host process (host-based SDK `query()` per Story 3.3 DP-2) back into the Daytona sandbox per PRD §3 (lines 100, 105) and architecture.md data flow (line 668). Five stories (6.1–6.5) defined in `sprint-change-proposal-2026-07-11.md`. The testability needs the test plan must tee up before Epic 6 enters implementation are recorded in detail in `test-design-architecture.md` § "Epic 6 ... Forward-Looking Testability Preview" and `test-design-qa.md` § "Epic 6 ... Forward-Look". Headline items:

- **New test seam for `agui-event-bridge.service.ts` (Story 6.2)** — `IAguiEventBridgeService` / `AGUI_EVENT_BRIDGE_SERVICE` Symbol-DI-token + `AguiEventBridgeServiceFake` delivered with the service, not bolted on after (B-01 lesson). Architect action: add the interface to `libs/shared-types` before Story 6.2 implementation begins.
- **`ISandboxService` possible extension** for `getSessionCommandLogs` streaming — story-level design decision, flagged so the Story 6.2 design does not regress the B-01 test seam that unblocked the entire Conversation-path suite.
- **P0-010 (sandbox-agent bridge killed mid-session → backend terminates the orphaned agent process)** becomes fully testable under the new sandbox-based execution — tighten the assertion to verify the Daytona process session actually terminates.
- **Story 6.5 Real-Service E2E is Tier 3 in practice** (the "Nightly: Real-Service Smoke Tests" tier above is made mandatory by Epic 6 — NFR-P1/P2 timing depends on the real Daytona + Claude path the new sandbox-based execution exercises).
- **`networkAllowList` egress control (Story 6.1)** extends P0-014 (sandbox env injection excludes internal credentials) with a network-route assertion.
- **Env validation:** `ANTHROPIC_API_KEY` becomes required in `apps/agent-be/src/config/env.validation.ts`; `AGENT_WORKDIR` becomes dead config — update the env-validation unit test when the change ships.
- **Story 5.5 substrate (2026-07-13 addendum):** Epic 6 builds on the post-Story-5.5 segments data model — the `ConversationPane` SSE handlers now expect segments-shaped AG-UI events (interleaved tool_call and text segments), not the pre-5.5 flat-`messages`-array shape. Story 6.2's new `agui-event-bridge.service.ts` will emit AG-UI events that feed the post-Story-5.5 handler contract. The `M3-new` lesson from Story 5.5 (`AgentServiceFake` diverges from production `pendingClassifierPromises`) generalizes — the new `AguiEventBridgeServiceFake` must mirror the production `void`-promise + `Promise.allSettled(promises)` pattern from the start, not retrofitted after wedge bugs surface. The architect's pre-implementation action: define `IAguiEventBridgeService` in `libs/shared-types` BEFORE Story 6.2 implementation begins, with the test-seam parity contract documented at the interface level.
- **NFR-P2 budget update (2026-07-13 addendum):** Story 5.5 added a `segments: Json?` JSONB column to `Turn`; the resume-path `turn.findMany` reads it. Without a `take` limit, this is unbounded row×payload growth on long conversations (NFR-5.2-1 Medium, pre-existing but amplified). Epic 6's real-service NFR-P2 timing budget for Story 6.5 must account for the segment JSONB payload, not just the flat `content` string Epic 3 originally budgeted against.

When Epic 6 enters implementation, run `bmad-testarch-test-design` epic-level to generate the per-story ATDD checklists from this forward-look.

## Phase Transition Quality Gates

| From Phase | To Phase | Gate Criteria | Status (2026-07-13) |
|---|---|---|---|
| Test Design | Epic/Story Creation | All P0 risks (R-01, R-02, R-04) have a mitigation strategy; R-03 has an owner and target resolution date for Q-1 | ✅ Met — all four risks have mitigation strategies; R-01 verified PASS, R-02 implemented (becomes fully testable under Epic 6), R-03 spike not yet run (Daytona provisionable, ~4h task, no cross-team dependency), R-04 documented |
| Epic/Story Creation | ATDD | Stories have acceptance criteria from the Risk-to-Story Mapping and Story-Level Integration Guidance above | ✅ Met — 16 ATDD checklists generated across Epics 1, 2, 3, 5 (Story 5.5 added a checklist retroactively) |
| ATDD | Implementation | Failing acceptance tests exist for all P0/P1 scenarios listed in `test-design-qa.md` | ✅ Met — acceptance tests implemented across Epics 1, 2, 3, and 5 (including all 10 Story 5.5 ACs at full coverage) |
| Implementation | Test Automation | All acceptance tests pass; B-01–B-04 resolved or explicitly accepted | ✅ Met — 1,201/1,201 Jest tests passing across 81 suites (894 web + 307 agent-be) + 7 Story 5.5 E2E Playwright tests; all four blockers resolved/delivered (-standing since 2026-07-07 baseline of 251/251) |
| Test Automation | Release | Trace matrix shows ≥80% coverage of P0/P1 requirements; NFR-R3 and NFR-O1 alert threshold resolved or explicitly accepted with sign-off | ✅ Met for Epics 1–3 (gate decision PASS, 2026-07-07, 92% coverage). Epic 5 gate = **PASS** (2026-07-13, upgraded from 2026-07-12 CONCERNS) — 48/48 ACs at FULL coverage across 5 stories; residual concerns documented in `test-design-qa.md` Post-Story-5.5 Gap Closure Update, none a blocker. 1,201 Jest tests + 7 Story 5.5 E2E tests, 0 skipped. NFR-R3 PASS (-standing); NFR-O1 PASS (-standing) |
