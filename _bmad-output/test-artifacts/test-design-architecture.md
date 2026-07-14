---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-07-13'
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
**Status:** Architecture Review Complete — all four pre-implementation blockers (B-01–B-04) resolved or delivered. Revised 2026-07-13 against post-Story-5.5 implementation evidence (Epics 1, 2, 3, and 5 complete — 33 stories done per `sprint-status.yaml`; Epic 5 now spans 5 stories — 5.1 through 5.5, the architectural segments-model story; Epic 5 traceability gate upgraded from CONCERNS to **PASS** (48/48 ACs FULL coverage; 1,201 Jest tests across 81 suites + 7 Story 5.5 E2E Playwright tests, 0 skipped); NFR-5 epic PASS-WITH-CONCERNS (3 Medium + 3 Low de-duplicated; 2 Mediums and all 3 Lows are pre-existing project-wide; only the one Medium `M3-new` AgentServiceFake test-seam divergence is Story-5.5-introduced); Epic 6 backlog, not started). Earlier baselines — 2026-07-12 (4 Epic-5 stories, gate CONCERNS, 853 tests) and 2026-07-07 (Epics 1–3 complete, gate decision PASS, 92% coverage) — are retained as historical reference in the body of this document.
**Project:** bmad-easy
**PRD Reference:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`
**ADR Reference:** `_bmad-output/planning-artifacts/architecture.md`

---

## Executive Summary

**Scope:** Full system-level test design for bmad-easy — a SaaS platform giving non-developer team members (PMs/BAs/delivery leads) browser-based access to BMAD methodology skills against their own GitHub repository, via a per-Conversation Daytona Cloud sandbox running the Claude Agent SDK.

**Business Context** (from PRD):

- **Revenue/Impact:** Target pricing ~$25–30/seat/month; PRD §10 includes a cost-floor analysis tying Daytona/Claude spend directly to unit economics.
- **Problem:** Non-dev roles cannot run BMAD methodology skills today because they require a local dev environment, CLI fluency, and direct GitHub repo access.
- **GA Launch:** Not yet dated. Epics 1, 2, 3, and 5 complete (32 stories per `sprint-status.yaml` as of 2026-07-12). Epic 5 (UX Mockup Fidelity — Close Visual Drift, 4 stories 5.1–5.4) completed this session with gate = CONCERNS: 38/38 ACs at FULL coverage, 853 tests passing across 65 Jest suites plus 3 active Playwright visual-container specs; NFR-5 epic PASS-WITH-CONCERNS (1 Medium story-introduced regression — auto-scroll effect deps after Story 5.3 AC-3 spinner relocation; ~9 quick-win fixes tracked for a follow-up hardening story). Epic 6 (Sandbox-Based Agent Execution) is backlog — it migrates agent execution from the host process (host-based SDK `query()` per Story 3.3 DP-2) back into the Daytona sandbox per PRD §3 and architecture.md data flow, and is the next scope for test planning.

**Architecture** (from architecture.md):

- **Key Decision 1:** Nx 23 monorepo (Yarn Berry 4.17.0 via Corepack) — `apps/web` (Next.js ~16.1.6 App Router, Vercel) + `apps/agent-be` (NestJS ^11, Railway/Docker) + shared `libs/shared-types`, `libs/database-schemas` (single Prisma ^7.8 schema, Postgres on Railway).
- **Key Decision 2:** One Daytona Cloud sandbox per Conversation; Claude Agent SDK (`claude-sonnet-4-6`, hardcoded) + sandbox-agent (JSONL→AG-UI bridge, pinned exact version) streamed to the browser over SSE (AG-UI protocol).
- **Key Decision 3:** GitHub OAuth (`repo` scope) via Auth.js v5 beta; boundary JWT between `apps/web` and `apps/agent-be`; OAuth tokens stored with AES-256-GCM envelope encryption (DEK+KEK).

**Expected Scale** (from architecture.md):

- Up to 10 concurrent Conversations/sessions per the stated NFR-R4 ceiling; single-container NestJS deploy for MVP (no horizontal scaling yet).

### Post-Epic-5 Update (2026-07-12)

Epic 5 is complete. The four stories (5.1–5.4) delivered the UX-mockup fidelity fixes across the shared shell, page headers, conversation stream, and Tailwind token drift; all ATDD checklists, automate-validation reports, and three of four test-review-validation reports exist under `_bmad-output/test-artifacts/`. Story 5.2's test-review-validation report is the one missing evidence artefact (recorded as a Low evidence gap, not a coverage gap — see `nfr-assessment-5-epic.md`).

**Traceability gate (CONCERNS, not PASS):** per `traceability/gate-decision-epic-5.json`, 38/38 ACs have FULL coverage with real exercising tests (135 Epic-5-specific tests, 853 total tests, 0 skipped). The decision is CONCERNS rather than PASS because of four documented weaknesses (none a blocker):

1. **5.4-AC7 full-width artifact list pane missing `no-scrollbar`** (bug-hunt M2, NFR-5.4-2) — implementation gap inside an AC that otherwise has coverage. Issue: `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:123` has `overflow-y-auto` but lacks `no-scrollbar`; existing tests pass `{ id: 'art_1' }` (two-pane mode), no test renders the page without an `id` searchParam.
2. **5.3-AC5 branded placeholder not wired in implementation** — test correctly verifies the default placeholder; the branded variant is deferred.
3. **5.2-AC10 scroll behavior untested in jsdom** — component tests provide structural coverage; a supplementary E2E is recommended for scroll behaviour on the conversation list.
4. **NFR-5.4 a11y gaps** — `no-scrollbar` panels (Story 5.4 AC-7) lack `tabIndex={0}` + `role="region"` (bug-hunt L6, NFR-5.4-4); keyboard-only users cannot scroll them.

**Known gaps to close in a follow-up hardening story** (sourced from `bug-hunt-epic-5-…md`, `test-fidelity-audit-2026-07-12.md`, `nfr-assessment-5-epic.md`):

- **Auto-scroll regression test** — `ChatMessageList.tsx:44-48` `useEffect` deps `[messages, isThinking]` omit `errorMessage`/`showRetry`/`showSpinner` after Story 5.3 AC-3 relocated the spinner/Retry into the scrollable container (bug-hunt M1, NFR-5.3-1, Medium). Add a regression test asserting the Retry button is scrolled into view on `SESSION_TIMEOUT` while the user is scrolled up. Recommended default: scroll-override is appropriate for error states.
- **5.4-AC7 no-scrollbar full-width pane + test** — one-line fix at `artifacts/page.tsx:123` (add `no-scrollbar`) plus a test case rendering the page without an `id` searchParam.
- **False-green ChatInput test (bug-hunt L1)** — `ChatInput.test.tsx:224-241` asserts `toContain('bg-text-3')` which matches both `disabled:bg-text-3` (correct) and `bg-text-3` (always-applied regression). Add a positive assertion that the enabled Send button does NOT contain `bg-text-3`.
- **5.4 AC-1 / AC-5 hover-token E2E restoration** — `test-review-validation-report-5-4.md` removed the skipped E2E blocks because the `withArtifacts` Playwright fixture is broken on unique-constraint violations. Only className-level unit tests remain for `ArtifactCard` and `ArtifactListEntry` hover borders (fidelity audit Finding 3, INFO). Track `withArtifacts` fixture fix as a deferred-work item; when fixed, restore the removed E2E blocks for computed `borderColor` / `backgroundColor` verification.
- **Type-checked `connectRepository` mock factory + `.catch()` path test (fidelity audit Finding 1, LOW Gap-C)** — `RepositoryUrlForm.test.tsx:20-22` mocks `connectRepository` as a bare `jest.fn()` typed only as `(...args: unknown[]) => any`. Replace with a typed factory keyed on `ConnectResult`; add one `.catch()`-path test asserting the generic "unexpected error occurred" fallback renders.
- **NFR quick-wins bundle (~9 fixes, ~1 hour total)** — see `nfr-assessment-5-epic.md` "Quick Wins" list: `take: 100` on `turn.findMany`; `select: { id: true }` on `repoConnection.findUnique`; hoist `Intl.DateTimeFormat` to module scope in `AgentMessage`/`UserMessage`; add `aria-live="polite"` test assertion; update `conversations/[conversationId]/loading.tsx` to the canonical depth-1 header; add `tabIndex={0}` + `role="region"` to the three `no-scrollbar` panels; add `maxLength={2000}` to `RepositoryUrlForm` input; add `MAX_DRAFT_SIZE` guard to `useDraftPersistence`.

**Deferred work — pruned clean:** 0 orphaned deferred-work items remaining across Epic 5 stories (per the post-epic assessment).

### Post-Story-5.5 Update (2026-07-13)

Story 5.5 ("Interleave Tool and Semantic Pills Within the Agent Markdown Stream", architectural — initially split out of Story 5.3 because it requires a data-model change, not a visual CSS fix) shipped after the 2026-07-12 post-Epic-5 update above. Story 5.5 changed: (a) the **`ChatMessage` data model** — added `segments?: MessageSegment[]` discriminated union with `{ type: 'text' } | { type: 'tool_call' }` literal types in `libs/shared-types/src/conversation.types.ts:25-27`; (b) **every SSE event handler in `ConversationPane.tsx`** — rewritten from pushing flat entries to the `messages` array to inserting/updating `MessageSegment` entries inside the streaming agent message (TOOL_CALL_START, TOOL_CALL_RESULT, TOOL_CALL_PROMOTED, TOOL_CALL_END, ACCESS_DENIED, MANUAL_SAVE_SUCCEEDED/FAILED, TEXT_MESSAGE_CONTENT); (c) a **Prisma migration** — `20260713120000_add_turn_segments` adding `Turn.segments JSONB`; (d) **`AgentMessage.tsx`** — new render path that calls `renderSegment(segment, index)` and renders N separate `<Markdown>` instances (one per text segment) instead of a single `<Markdown>` for the flat `content` string; (e) **backend persistence** — `AgentService.runTurn()` builds `accumulatedText` AND `segments` array in parallel; both persisted to `Turn` via dual-write (`content: String`, `segments: Json?`); resume path selects `segments` on `turn.findMany` and reconstructs the segments array via `Array.isArray` guard (`conversations/[conversationId]/page.tsx:44`); (f) **`AgentServiceFake`** — extended to build/persist segments alongside its mock event emissions.

**Traceability gate (PASS, upgraded from 2026-07-12 CONCERNS):** per `traceability/gate-decision-epic-5.json` (`evaluated_at: 2026-07-13T19:30:00.000Z`, `gate_status: PASS`), 48/48 ACs at FULL coverage across all 5 stories; P0 100% (46/46), P1 100% (2/2); 0 critical-open, 0 high-open; 1,201 Jest tests across 81 suites (894 web + 307 agent-be) + 7 Story 5.5 E2E Playwright tests, 0 skipped. The single fix that upgraded the gate from CONCERNS to PASS was the `no-scrollbar` class addition on the full-width artifact-list pane (`artifacts/page.tsx:124` + test at `artifacts/page.test.tsx:265-269`) during the Story 5.5 bug-hunt — it closed the 5.4-AC7 implementation gap that had been the primary driver of the 2026-07-12 CONCERNS field.

**Test count delta:** 853 (2026-07-12 post-Epic-5) → 1,201 Jest tests + 7 Story 5.5 E2E Playwright tests = +348 Jest tests + 7 E2E tests. Story 5.5 added 9 ConversationPane tests, 5 AgentMessage tests, 3 backend persistence unit tests, 1 strengthened `agent.service.spec.ts` test (segments contents asserted via `arrayContaining`), and the 7-test Playwright E2E spec at `playwright/e2e/conversation/story-5-5-inline-pills.spec.ts`.

**Story 5.5 NFR audit (`nfr-assessment-5-5.md`, 2026-07-13):** PASS-WITH-CONCERNS — 8 PASS, 4 CONCERNS (1 Medium + 3 Low), 0 FAIL.

**Epic 5 NFR audit (`nfr-assessment-5-epic.md`, 2026-07-13 revision):** PASS-WITH-CONCERNS — 23 PASS, 6 CONCERNS (de-duplicated: 3 Medium + 3 Low), 0 FAIL. Two of the 3 Mediums are pre-existing project-wide patterns surfaced by Epic 5 touching the files they live in: (i) `turn.findMany` missing `take` limit (NFR-5.2-1; amplified by Story 5.5 because the resume-path now loads `segments` JSONB column per row); (ii) `messages.map()` unbound rendering in `ChatMessageList.tsx:98-130` (NFR-5.3-2; amplified by Story 5.5 because each agent message now renders N `<Markdown>` instances rather than 1). The third Medium (`M3-new`) is the only Story-5.5-introduced finding.

**New architectural concerns from the Story 5.5 cycle** (recorded so the next epic-level architectural review begins from the current state, not from the 2026-07-12 baseline):

- **`M3-new` — `AgentServiceFake` diverges from production `pendingClassifierPromises` pattern (Medium, test-seam fidelity per `project-context.md:138`).** Production's `agent.service.ts:630-660` fires the working-tree-status check as a `void`-returned promise, pushes it to `pendingClassifierPromises`, and continues processing subsequent SDK messages without awaiting; `await Promise.allSettled(pendingClassifierPromises)` (line 167) ensures all pending fire-and-forget work resolves BEFORE `RUN_FINISHED`. The fake at `agent-service.fake.ts:186-203` awaits inline, blocking the event loop before the next scripted event emits — making the fake more deterministic than production. Any timing-dependent bug (e.g. `WORKING_TREE_DIRTY` emitted before a subsequent `TEXT_MESSAGE_*` delta) would pass fake-based tests but fail in production. Production code is correct today — the divergence is a test-seam parity violation. Tracked as new test-plan item **P1-018** in `test-design-qa.md` Post-Story-5.5 Gap Closure Update. Lesson for Epic 6: the new `AguiEventBridgeServiceFake` must mirror the production `void`-promise pattern from the start.
- **`L7-new` — `apps/web/project.json` lacks a `typecheck` nx target (Low, surfaced by the Story 5.5 M2-new TS narrowing sub-bug).** `nx.json:38-41` defines a `typecheck` task template; `apps/agent-be/project.json` exposes the target (executor `@nx/js:tsc`); `apps/web/project.json` exposes only `build`, `lint`, `test`. The M2-new fix introduced a TS narrowing bug (`'error' : 'completed' as const` widened `'error'` to `string` due to operator precedence) that silently passed `yarn nx test web` (jest transpiles via babel — no strict type-check) and `yarn nx lint web` (eslint — does not catch TS narrowing). Only direct `npx tsc --noEmit -p apps/web/tsconfig.json` surfaced the TS2345. The immediate bug was fixed in the Story 5.5 NFR audit (extracted `const nextStatus: 'error' | 'completed'`); the structural gap (no CI type-check on `web`) is what's tracked as test-plan item **P1-020**. Other pre-existing TS errors may be silently accumulating without detection.
- **`L5-new` — index-based React keys for text segments (`AgentMessage.tsx:99`, `key={`text-${index}`}`) (Low, React reconciliation anti-pattern).** Currently inert because segments are append-only in current handlers. Future refactor that inserts segments mid-array would shift index-based keys, causing React to mis-reconcile DOM nodes. Coordinate with the deferred MessageSegment runtime-validation story (DP-3). Tracked in **P3-002** hardening bundle.
- **`L6-new` — `MANUAL_SAVE_SUCCEEDED/FAILED` handler duplication (~150 lines, `ConversationPane.tsx:543-693`) (Low, code-quality concern).** The two handlers share ~90% of their structure; only `status`, `semantic`, and `errorMessage` differ. Future edit to one without the other risks behavioral divergence. Extract `buildManualSaveSegment(toolCallId, status, semantic?, errorMessage?)` helper. Tracked in **P3-002** hardening bundle.

**Test-seam parity verification (`M3-new` carry-forward impact for Epic 6):** Story 5.5 is the architectural centerpiece Epic 6 builds on — the `ConversationPane` SSE handlers now expect segments-shaped AG-UI events (interleaved with text), not the pre-5.5 flat-`messages`-array shape. Epic 6's new `agui-event-bridge.service.ts` (Story 6.2) must emit AG-UI events that match the post-Story-5.5 handler contract. The `M3-new` lesson (fake diverges from production's `pendingClassifierPromises`) means the new `AguiEventBridgeServiceFake` must be designed against the production pattern from the start — not retrofitted after wedge bugs surface. The architect's pre-implementation action: define `IAguiEventBridgeService` in `libs/shared-types` BEFORE Story 6.2 implementation begins, with the explicit test-seam parity contract documented in the interface-level JSDoc.

**Deferred work — still pruned clean:** 0 orphaned deferred-work items remaining across the 5 Epic 5 stories (Story 5.5's only deferred item is the DP-3 per-segment narrowing of persisted JSON, explicitly outside the 10 AC scope per story spec).

### Epic 6 (Sandbox-Based Agent Execution) — Forward-Looking Testability Preview

Epic 6 is backlog, not started. Per `sprint-change-proposal-2026-07-11.md` and `sprint-status.yaml`, it has five stories (6.1–6.5) that migrate agent execution from the host process (host-based SDK `query()` per Story 3.3 DP-2) back into the Daytona sandbox per PRD §3 and architecture.md data flow. This update records the testability needs the test plan must tee up before Epic 6 enters implementation. **(2026-07-13 revision: Story 5.5's segments data model is now the substrate Epic 6's agent execution migration builds on — the new `agui-event-bridge.service.ts` (Story 6.2) will emit AG-UI events that feed the post-Story-5.5 `ConversationPane` handlers, not the pre-5.5 flat-`messages`-array behavior. The Story 5.5 `M3-new` lesson — `AgentServiceFake` diverges from production `pendingClassifierPromises` — generalizes to any new test double Epic 6 introduces.)**

- **New test seam: `agui-event-bridge.service.ts`** (Story 6.2). This is a new NestJS service that receives the sandbox-agent (rivet-dev) normalized event stream via Daytona's `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)` API and re-encodes to AG-UI events, with circuit breaker + heartbeat. Like `ISandboxService` / `SANDBOX_SERVICE` and `IAgentService` / `AGENT_SERVICE`, it needs an `IAguiEventBridgeService` / `AGUI_EVENT_BRIDGE_SERVICE` Symbol-token test seam plus an `AguiEventBridgeServiceFake` that reproduces production side effects (emitting AG-UI events, calling `terminateProcess` on circuit-breaker trip). The fake must be delivered with the service, not bolted on later (B-01 lesson). Action for the architect: add the interface to `libs/shared-types` before Story 6.2 implementation begins.
- **`ISandboxService` extension (possible)** — `SandboxServiceFake` may need a `getSessionCommandLogs` or equivalent streaming-exec method so the new event bridge can be integration-tested without a real Daytona sandbox. Story-level design decision; flagged here so the Story 6.2 design does not regress the B-01 test seam that unblocked the entire Conversation-path suite.
- **Story 3.3 DP-2 reconciliation** — Story 3.3's `AgentService` runs the agent via `query()` in the host Node.js process; `terminateProcess` is kept for `IAgentService` compliance but is effectively a no-op. Epic 6 makes `terminateProcess` real (it terminates a genuine sandbox process session). Existing P0-010 (sandbox-agent bridge killed mid-session → backend terminates the orphaned agent process, asserted "not just that an error event is emitted") was structurally correct but practically unverifiable against the host-based execution; Epic 6 makes it fully testable. Keep P0-010 on the Epic 6 test plan and tighten the assertion to verify the Daytona process session actually terminates.
- **Story 6.5 Real-Service E2E Verification is Tier 3 in practice.** The QA doc's "Nightly: Real-Service Smoke Tests" tier was always a backlog need (per `bmad-easy-handoff.md` § "Real-Service Smoke Tests"). Epic 6's Story 6.5 makes that tier mandatory — NFR-P1 (first token ≤1,500 ms) and NFR-P2 (chat ready ≤10 s) timing assertions depend on the real Daytona + real Claude API path that only the new sandbox-based execution exercises. Plan to land the Tier 3 wiring as part of Story 6.5, not as a deferred enhancement.
- **`networkAllowList` egress control** (Story 6.1) — adds a NFR-S1 defence-in-depth test: assert the allow list excludes platform-internal endpoints (`apps/agent-be`, Postgres, Auth.js). This extends the existing P0-014 (sandbox env injection excludes internal credentials) with a network-route assertion.
- **`ANTHROPIC_API_KEY` becomes a required env var** in `apps/agent-be/src/config/env.validation.ts` Zod schema once Epic 6 lands (per `sprint-change-proposal-2026-07-11.md` §4.5); `AGENT_WORKDIR` becomes dead config (remove). Update the env-validation unit test accordingly when the change ships.

These items are recorded here so that when Epic 6 enters implementation, the per-story ATDD + test-design work begins from a pre-identified testability surface — not from a greenfield discovery pass. **(2026-07-13 addendum: Story 5.5's `Turn.segments` JSONB migration + `ConversationPane` handler rewrite means Epic 6 builds on a richer event-payload contract than the original greenfield test plan anticipated. The resume-path `turn.findMany` now loads the `segments` JSONB column per row — without a `take` limit, this is unbounded row×payload growth on long conversations. The architect's pre-implementation review for Story 6.5 should evaluate whether the real-service NFR-P2 timing budget accounts for the post-Story-5.5 segment JSONB payload, not just the flat `content` string Epic 3 originally budgeted against.)**

**Risk Summary:**

- **Total risks**: 10 (R-01–R-10)
- **High-priority (≥6)**: 4 risks requiring mitigation before their respective implementation milestones (none score 9 / gate-blocking)
- **Test effort**: ~140–205 hours system-wide (~4–6 sprints for 1 QA/SDET working in parallel with implementation), excluding items currently blocked on open architecture/PM decisions. **(2026-07-07: superseded — Epics 1–3 complete; actual effort recorded in per-story test artifacts. Gate decision PASS, 92% coverage, 251/251 tests passing.)** **(2026-07-12: further superseded — Epics 1, 2, 3, and 5 complete; 853/853 tests passing across 65 suites; Epic 5 gate = CONCERNS with 38/38 ACs at FULL coverage; NFR-5 epic PASS-WITH-CONCERNS. Per-story test artefacts (ATDD checklists, automate-validation reports, test reviews, NFR assessments) under `_bmad-output/test-artifacts/` elaborate the scenarios below. The system-level ranges are retained for historical reference only.)**

---

## Quick Guide

### 🚨 BLOCKERS - Team Must Decide (Can't Proceed Without)

**Pre-Implementation Critical Path** — these must be resolved before QA can write the corresponding tests:

1. **B-01: No `SandboxService` test seam** ~~Architecture must define a fake/test-double interface~~ → **DELIVERED** (2026-07-07). `ISandboxService` is defined in `libs/shared-types/src/sandbox.interface.ts`; `SandboxServiceFake` (`apps/agent-be/test/helpers/sandbox-service.fake.ts`) and `AgentServiceFake` both implement their interfaces and reproduce production side effects (DB writes, `terminateProcess` calls, SSE event emission). Wired via `SANDBOX_SERVICE` / `AGENT_SERVICE` Symbol DI tokens; injected through `buildTestModule()` from `test-module-builder.ts`. Unblocks P0-006 through P0-011.

2. **B-02: Repo-size performance boundary** ~~NFR-P2's "≤200MB" scope is asserted, not empirically validated~~ → **RESOLVED** (2026-06-17). Architecture now mandates `git clone --depth=1` (shallow clone) for all Conversation provisions, making 200 MB a consistent testable threshold bounded to working-tree size. Empirical validation spike is required as the first action in Implementation Sequence step 7 (target: ≤ 8 s for the full provision+clone+config+status sequence). QA may write P0-006 with a conditional skip pending spike sign-off; once the spike confirms ≤ 8 s, remove the skip.

3. **B-03: SSE back-pressure threshold undefined** ~~"Must not silently drop events" has no numeric definition~~ → **RESOLVED** (2026-06-17). NFR-R3 threshold is now: per-connection queue capped at **200 events**; if not drained within **30 seconds**, emit `STREAM_ERROR { code: 'STREAM_BACK_PRESSURE' }` and close with reconnect-eligible `200 + data: [DONE]`. Silent drops are never acceptable. QA can now write P1-013 against these thresholds.

4. **B-04: Cost-alert threshold undefined (NFR-O1, PRD Q-2)** — ~~PARTIALLY ADDRESSED~~ → **RESOLVED** (2026-07-07). `cost-tracking.service.ts` implements per-turn spend tracking; `SPEND_ALERT_THRESHOLD_USD` is env-configured (module-load IIFE parse with fallback, per the env-configured-numeric-threshold pattern) with a $20/user/month default. NFR-O1 audit (2026-07-07): PASS. Threshold remains PM-tunable via env var without code change.

**Current status (2026-07-07):** All four blockers resolved. B-01 delivered (`SandboxServiceFake` + `AgentServiceFake` in `apps/agent-be/test/helpers/`). B-02 resolved (shallow clone mandated and in code; empirical spike still pending — see R-03). B-03 resolved and verified PASS (NFR-R3, 200-event queue / 30 s drain / `STREAM_ERROR`). B-04 resolved and verified PASS (NFR-O1, `SPEND_ALERT_THRESHOLD_USD` env-configured).

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
| **R-03** | **PERF** | NFR-P2 (10s chat-ready) threshold validated only by single manual run; repo-size boundary (~200MB) asserted but not empirically tested (PRD Q-1, open) | 3 | 2 | **6** | Architect to resolve Q-1 with empirical Daytona clone-timing test across repo sizes before the boundary is locked in the launch checklist; treat as CONCERNS by default until resolved. **(2026-07-07: shallow clone in code; Daytona is provisionable on demand — the spike is a ~4h QA task, not a cross-team dependency. NFR-P2 remains CONCERNS only because the spike has not been run, not because it cannot be.)** | Architect / PM | Before Q-1 marked resolved |
| **R-04** | **PERF/OPS** | NFR-R4 (10 concurrent SSE/session) silently degrades to a 6-connection HTTP/1.1 ceiling if the load balancer isn't HTTP/2-capable at deploy time | 2 | 3 | **6** | Add explicit launch-checklist HTTP/2 verification plus an integration test opening 10 concurrent SSE connections against a local HTTP/2 dev server. **(2026-07-07: a local dev-server smoke test — 10 Playwright contexts opening SSE connections — catches the HTTP/1.1 ceiling bug without a production proxy. Production HTTP/2 verification remains a launch-checklist item; the code-level regression is testable now.)** | DevOps / Backend lead | Launch-checklist verification step |

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
| Performance | NFR-P1 (≤1500ms first token), P2 (≤10s chat-ready, ≤~200MB repos), P3/P4 (≤2s renders), P5 (≤5s manual commit) | Supported — P2 boundary now resolved: mandatory `--depth=1` shallow clone, 200 MB threshold (≤ 8 s provision+clone+config+status). **(2026-07-07: dev server + real Daytona + Claude API are accessible; first-pass P1/P2/P5 timing assertions are writable today via Playwright `performance.now()` — no cross-team dependency. k6/Artillery is an enhancement for automated regression at scale, not a prerequisite for first-pass validation.)** | **Remaining:** select k6/Artillery for an automated timing *regression suite* (enhancement, not a blocker for first-pass validation) | Timing assertions in CI test run logs (Playwright); spike report from step 7; k6/Artillery regression report once tool is chosen |
| Reliability | NFR-R1 (credential-health update within one git-op cycle), R2 (committed artifacts always recoverable), R3 (no silent SSE event drop under back-pressure), R4 (10 concurrent SSE, HTTP/2 required) | Fully supported — R3 threshold now defined: 200-event queue cap, 30 s drain timeout, `STREAM_ERROR { code: 'STREAM_BACK_PRESSURE' }` on breach, no silent drops | None — all four R-NFRs now have testable definitions | Integration test logs; for R4, connection-count log proving no starvation; for R3, slow-consumer test asserting error event arrives within 30 s |
| Maintainability | Observability NFR-O1: per-user LLM spend tracked from day one, budget alerting operational at launch | Mechanism designed (`cost-tracking.service.ts`); starting alert threshold recommendation: **$20/user/month** (Winston, 2026-06-17) | **Remaining (PM):** confirm or revise $20/user/month threshold once Daytona compute cost (Q-2) is finalized | Per-turn cost-record assertions in test run output; alert-trigger assertion once PM confirms threshold |

**Unknown thresholds:** ~~NFR-P2 repo-size boundary (Q-1), NFR-R3 back-pressure quantification, NFR-O1 alert threshold (Q-2).~~ **(2026-07-07: all three thresholds are now defined — NFR-P2 (200MB / ≤8s, shallow clone in code), NFR-R3 (200-event queue / 30s drain / `STREAM_ERROR`), NFR-O1 ($20/user/month env-configured). These are tracked as risk R-03 (NFR-P2 empirical spike not yet run) and as resolved items (NFR-R3, NFR-O1 both PASS). The remaining gap is execution, not definition.)**

**Assessment boundary:** Final PASS/CONCERNS/FAIL status belongs in `nfr-assess` after implementation evidence exists.

---

### Testability Concerns and Architectural Gaps

**🚨 ACTIONABLE CONCERNS - Architecture Team Must Address**

#### 1. Blockers to Fast Feedback (WHAT WE NEED FROM ARCHITECTURE)

| Concern | Impact | What Architecture Must Provide | Owner | Timeline |
|---|---|---|---|---|
| **`SandboxService` test seam** ~~No interface defined~~ → **DELIVERED** (2026-07-07) | Nearly every Conversation-path test (FR-9–FR-15) either hits real Daytona Cloud or stays unwritten | `ISandboxService` defined in `libs/shared-types/src/sandbox.interface.ts`; `SandboxServiceFake` + `AgentServiceFake` in `apps/agent-be/test/helpers/`; `SANDBOX_SERVICE` / `AGENT_SERVICE` DI tokens; `buildTestModule()` wires the fake. Fakes reproduce production side effects (DB writes, `terminateProcess`, SSE events). | Backend lead | **Done** |
| **No test-data seeding/factory pattern for Postgres** | Conversation, Artifact, RepoConnection, credential-health rows have no repeatable seeding strategy | Factory functions + a transactional-rollback or truncate-between-tests pattern in `libs/database-schemas` | Backend lead | Implementation Sequence step 2 |
| **~~No load-testing tool named~~** → **Reframed (2026-07-07)** | ~~NFR-P1/P2 automated timing assertions cannot exist in CI~~ | First-pass P1/P2/P5 timing validation is writable today via Playwright `performance.now()` against the dev server with real Daytona + Claude API (both accessible in `.env.local`). k6/Artillery is an **enhancement** for an automated timing *regression suite* at scale, not a prerequisite for first-pass validation. **Action:** write Playwright timing tests now; select k6/Artillery later for regression hardening. | QA | First-pass: now; k6/Artillery: post-MVP |
| **No GitHub org/restricted-token fixture** | FR-1/FR-2's org-restriction 403 error path can't be tested repeatably without a real restricted org | A recorded HTTP cassette or fixture simulating a GitHub App-restriction-policy 403. **(2026-07-07: a real GitHub test org with App-restriction policy is cheap to create; alternatively, a single recorded 403 response cassette covers the path. Either is a ~1h task, not a cross-team dependency.)** | Backend lead | Before FR-1/FR-2 integration tests are written |

#### 2. Architectural Improvements Needed (WHAT SHOULD BE CHANGED)

1. **~~Quantify NFR-R3 back-pressure behavior~~ → RESOLVED** (2026-06-17)
   - **Resolution**: Per-connection queue capped at **200 events**; if not drained within **30 seconds**, emit `STREAM_ERROR { code: 'STREAM_BACK_PRESSURE' }` and close connection with reconnect-eligible `200 + data: [DONE]`. Silent drops forbidden. See architecture.md Cross-Cutting Concerns §3.
   - **QA action**: Write P1-013 against these thresholds using a slow-consumer test client.

2. **Provide a deterministic shutdown trigger for graceful-drain testing** → **RESOLVED** (Story 3.12)
   - **Resolution**: `app.enableShutdownHooks()` in `main.ts`; `OnModuleDestroy` on `IdleTimeoutService`, `ProvisionQueueService`, `SessionEventsService`, `ManualCommitService`. Reverse module registration order guarantees `ManualCommitService` drain notifications emit before `SessionEventsService` subjects complete, before `PrismaService.$disconnect()`. Bounded-parallel drain with shared deadline timer in `ManualCommitService.onModuleDestroy`.
   - **QA action**: P2-005 can now target `onModuleDestroy` directly.

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
| **R-01** Cross-tenant credential leak | Confirm `active-user.guard.ts` covers every credential-resolving route; add P0 unit test enumerating call sites + P0 negative integration test resolving a foreign tenant's token | Backend lead | Before `credentials.service.ts` ships | **Implemented & verified** | NFR-S2 PASS (2026-07-07): `findFirst({ where: { id, userId } })` across all queries; `userId` filter IS the tenant authorization check |
| **R-02** Runaway agent on crash | Confirm Daytona process API can terminate a running agent from `apps/agent-be`; add P0 integration test killing the bridge mid-session and asserting process termination, not just an error event | Backend lead | AG-UI event proxying step | **Implemented** | Circuit breaker / stall-detection timer in `AgentService` (per-active-run timer, resets on every emitted event, `.unref()`'d, `abortController.abort()` + `query.interrupt()` on timeout). NFR audit (2026-07-07): circuit breaker PASS |
| **R-03** NFR-P2 repo-size boundary unresolved | Architecture now mandates `git clone --depth=1`; 200 MB threshold accepted with ≤ 8 s target; empirical spike is first action in Implementation Sequence step 7 | Architect / PM | Step 7 (spike) | **Architectural decision implemented; empirical spike still pending** | Shallow clone in code; NFR-P2 remains CONCERNS (2026-07-07) until spike runs against real Daytona |
| **R-04** NFR-R4 silent HTTP/1.1 degradation | Add HTTP/2 capability check to launch checklist; add P0 integration test opening 10 concurrent SSE connections against an HTTP/2 dev server | DevOps / Backend lead | Launch-checklist step | **Planned** (HTTP/2 invariant documented; not verified) | NFR-R4 CONCERNS (2026-07-07): requires real HTTP/2 proxy + 10 real connections; launch checklist item |

---

### Assumptions and Dependencies

#### Assumptions

1. ~~The architecture's planned stack (Nx monorepo, Next.js 15 + NestJS, single shared Prisma schema) will not materially change before implementation begins.~~ **Updated (2026-07-07):** Stack evolved during implementation — Next.js 15 → ~16.1.6, pnpm → Yarn Berry 4.17.0, Prisma → ^7.8.0, NestJS → ^11. Core architectural decisions (Nx monorepo, single shared Prisma schema, SSE transport, Auth.js v5 beta) held; the drift is in versions, not structure.
2. A load-testing tool (k6/Artillery or equivalent) will be selected before NFR-P1/P2 automated assertions are required in CI.
3. The session-replay fixture referenced in the architecture's Technical Constraints (used for sandbox-agent/AG-UI package upgrade validation) can be reused as the canonical fixture for SSE/Tool-Pill classifier tests.

#### Dependencies

1. `SandboxService` test seam (fake/test-double) — required before Backend lead, pre-implementation.
2. Architect resolution of PRD Q-1 (repo-size boundary) — required before R-03/NFR-P2 thresholds can be locked.
3. PM resolution of PRD Q-2 (Daytona compute cost estimate) — required before NFR-O1 alert threshold can be tested.

#### Risks to Plan

- **Risk**: ~~Sprint planning has not yet started, so this system-level plan cannot yet be mapped to specific stories/sprints.~~ **Resolved (2026-07-07):** Epics 1–3 complete (28 stories done per `sprint-status.yaml`). System-level plan is now mapped to per-story ATDD checklists, automate-validation reports, test reviews, and per-story NFR assessments under `_bmad-output/test-artifacts/`.
  - **Impact**: System-level effort ranges (~140–205 hours) are retained for historical reference; actual effort is tracked in per-story artifacts and the traceability matrix (gate decision: PASS, 2026-07-07, 92% coverage).
  - **Contingency**: For new epics, re-run epic-level test design (see `test-design-epic-hydration-gap.md` for the post-incident epic-level pattern).

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
