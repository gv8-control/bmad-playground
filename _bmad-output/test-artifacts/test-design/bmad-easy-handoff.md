---
title: 'TEA Test Design → BMAD Handoff Document'
version: '1.0'
workflowType: 'testarch-test-design-handoff'
inputDocuments:
  - '_bmad-output/test-artifacts/test-design-architecture.md'
  - '_bmad-output/test-artifacts/test-design-qa.md'
sourceWorkflow: 'testarch-test-design'
generatedBy: 'TEA Master Test Architect'
generatedAt: '2026-06-16'
projectName: 'bmad-easy'
---

# TEA → BMAD Integration Handoff

## Purpose

This document bridges TEA's system-level test design outputs with BMAD's epic/story decomposition workflow (`create-epics-and-stories`). It provides structured integration guidance so that quality requirements, risk assessments, and test strategies flow into implementation planning. Note: this project already has a finalized epics/stories document (`_bmad-output/planning-artifacts/epics.md`); use this handoff to retrofit quality gates and acceptance criteria onto those existing epics/stories, or to inform epic-level test design re-runs per epic.

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
- **All epics touching `apps/agent-be`**: ≥80% integration coverage target before merge to `main`.

## Story-Level Integration Guidance

### P0/P1 Test Scenarios → Story Acceptance Criteria

Critical test scenarios that MUST be acceptance criteria (see `test-design-qa.md` Test Coverage Plan for full IDs):

- P0-003/P0-004 (git config injection on provision and resume) → acceptance criteria on the "commit attribution" story.
- P0-008 (10 concurrent Conversations, no SSE starvation) → acceptance criteria on the "concurrent sessions" story, paired with the HTTP/2 launch-checklist item.
- P0-009/P0-010 (Tool Pill classification, sandbox-agent crash termination) → acceptance criteria on the "AG-UI event proxying" story.
- P0-015/P0-016 (tenant-isolation negative test, OAuth ciphertext-only storage) → acceptance criteria on the "credentials service" story.
- P0-012/P0-013 (GitHub-OAuth-only sign-in, unauthenticated redirect) → acceptance criteria on the "authentication" story.

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
| R-03 | PERF | 3×2=6 | Sandbox provisioning story (Conversations epic) — blocked on architect spike (Q-1) | Integration (spike) |
| R-04 | PERF/OPS | 2×3=6 | Concurrent sessions story (Conversations epic) + launch-checklist | Integration (load) |
| R-05 | DATA | 2×2=4 | Manual commit / working tree story (Conversations epic) | Integration (multi-session) |
| R-06 | OPS | 2×2=4 | Project Map / Artifact Browser resilience story | Integration |
| R-07 | OPS | 2×2=4 | Sandbox provisioning story (Conversations epic) | Integration |
| R-08 | OPS | 2×2=4 | Deployment/shutdown handling story | Integration |
| R-09 | SEC | 1×2=2 | KEK management (ops runbook, not a story) | Manual |
| R-10 | TECH | 1×2=2 | Dependency monitoring (ops practice, not a story) | Manual |

## Recommended BMAD → TEA Workflow Sequence

1. **TEA Test Design** (`TD`) → produced this handoff document (system-level, this run).
2. **BMAD Create Epics & Stories** → epics/stories already exist (`_bmad-output/planning-artifacts/epics.md`); retrofit quality requirements from this handoff onto them, or re-run `create-epics-and-stories` if scope changes.
3. **TEA ATDD** (`AT`) → generates acceptance tests per story, informed by the P0/P1 scenarios above.
4. **BMAD Implementation** → developers implement with test-first guidance, starting with B-01 (`SandboxService` test seam).
5. **TEA Automate** (`TA`) → generates full test suite once implementation begins.
6. **TEA Trace** (`TR`) → validates coverage completeness against the ≥80% integration coverage target.

## Phase Transition Quality Gates

| From Phase | To Phase | Gate Criteria |
|---|---|---|
| Test Design | Epic/Story Creation | All P0 risks (R-01, R-02, R-04) have a mitigation strategy; R-03 has an owner and target resolution date for Q-1 |
| Epic/Story Creation | ATDD | Stories have acceptance criteria from the Risk-to-Story Mapping and Story-Level Integration Guidance above |
| ATDD | Implementation | Failing acceptance tests exist for all P0/P1 scenarios listed in `test-design-qa.md` |
| Implementation | Test Automation | All acceptance tests pass; B-01–B-04 resolved or explicitly accepted |
| Test Automation | Release | Trace matrix shows ≥80% coverage of P0/P1 requirements; NFR-R3 and NFR-O1 alert threshold resolved or explicitly accepted with sign-off |
