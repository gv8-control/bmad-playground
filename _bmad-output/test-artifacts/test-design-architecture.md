---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-07-16'
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
**Status:** Architecture Review Complete — all four pre-implementation blockers (B-01–B-04) resolved or delivered. Revised 2026-07-16 against post-Epic-6 implementation evidence (Epics 1, 2, 3, 5, and 6 complete — 38 stories done; Epic 6 migrated agent execution from host-based SDK `query()` to sandbox-based execution via `agui-event-bridge.service.ts` + Daytona process session API; 5 SandboxService fidelity-audit findings (F1–F5) fixed; `ANTHROPIC_API_KEY` env validation active; `networkAllowList` egress control applied on every provision; Story 6.5 real-service E2E specs written but env-var gated pending operational prerequisites; 1,697 Jest tests across 98 suites (789 agent-be + 908 web, 0 skipped, 0 failed) + 39 Playwright E2E spec files; NFR-6.3 audit PASS. Prior 2026-07-13 baseline (Epic 5 + Story 5.5, 1,201 tests, gate PASS) and earlier baselines retained as historical reference in the body of this document.
**Project:** bmad-easy
**PRD Reference:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`
**ADR Reference:** `_bmad-output/planning-artifacts/architecture.md`

---

## Executive Summary

**Scope:** Full system-level test design for bmad-easy — a SaaS platform giving non-developer team members (PMs/BAs/delivery leads) browser-based access to BMAD methodology skills against their own GitHub repository, via a per-Conversation Daytona Cloud sandbox running the Claude Agent SDK.

**Business Context** (from PRD):

- **Revenue/Impact:** Target pricing ~$25–30/seat/month; PRD §10 includes a cost-floor analysis tying Daytona/Claude spend directly to unit economics.
- **Problem:** Non-dev roles cannot run BMAD methodology skills today because they require a local dev environment, CLI fluency, and direct GitHub repo access.
- **GA Launch:** Not yet dated. Epics 1, 2, 3, 5, and 6 complete (38 stories). Epic 5 (UX Mockup Fidelity — Close Visual Drift, 5 stories 5.1–5.5) completed 2026-07-13 with gate = PASS. Epic 6 (Sandbox-Based Agent Execution, 5 stories 6.1–6.5) completed 2026-07-16 — agent execution migrated from the host process (host-based SDK `query()` per Story 3.3 DP-2) to the Daytona sandbox via `agui-event-bridge.service.ts` + Daytona process session API (`getSessionCommandLogs`). The `@anthropic-ai/claude-agent-sdk` import is removed from `AgentService`; `terminateProcess` is now real (terminates a genuine sandbox process session); `networkAllowList` egress control applied on every provision; `ANTHROPIC_API_KEY` now a required env var. 1,697 tests across 98 suites + 39 Playwright spec files, 0 skipped. Real-service E2E specs (Story 6.5) are written but env-var gated pending operational prerequisites (GitHub test account, CI secrets, real Daytona + Anthropic API access).

**Architecture** (from architecture.md):

- **Key Decision 1:** Nx 23 monorepo (Yarn Berry 4.17.0 via Corepack) — `apps/web` (Next.js ~16.1.6 App Router, Vercel) + `apps/agent-be` (NestJS ^11, Railway/Docker) + shared `libs/shared-types`, `libs/database-schemas` (single Prisma ^7.8 schema, Postgres on Railway).
- **Key Decision 2:** One Daytona Cloud sandbox per Conversation; Claude Agent SDK (`claude-sonnet-4-6`, hardcoded) + sandbox-agent (JSONL→AG-UI bridge, pinned exact version) streamed to the browser over SSE (AG-UI protocol).
- **Key Decision 3:** GitHub OAuth (`repo` scope) via Auth.js v5 beta; boundary JWT between `apps/web` and `apps/agent-be`; OAuth tokens stored with AES-256-GCM envelope encryption (DEK+KEK).

**Expected Scale** (from architecture.md):

- Up to 10 concurrent Conversations/sessions per the stated NFR-R4 ceiling; single-container NestJS deploy for MVP (no horizontal scaling yet).

### Post-Epic-5 Update (2026-07-12)

Epic 5 is complete. The four stories (5.1–5.4) delivered the UX-mockup fidelity fixes across the shared shell, page headers, conversation stream, and Tailwind token drift; all ATDD checklists, automate-validation reports, and three of four test-review-validation reports exist under `_bmad-output/test-artifacts/`. Story 5.2's test-review-validation report is the one missing evidence artefact (recorded as a Low evidence gap, not a coverage gap — see `nfr-assessment-5-epic.md`).

**Traceability gate (CONCERNS, not PASS):** 38/38 ACs have FULL coverage with real exercising tests (135 Epic-5-specific tests, 853 total tests, 0 skipped). The decision is CONCERNS rather than PASS because of four documented weaknesses (none a blocker):

1. **5.4-AC7 full-width artifact list pane missing `no-scrollbar`** (bug-hunt M2, NFR-5.4-2) — implementation gap inside an AC that otherwise has coverage. Issue: `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:123` has `overflow-y-auto` but lacks `no-scrollbar`; existing tests pass `{ id: 'art_1' }` (two-pane mode), no test renders the page without an `id` searchParam.
2. **5.3-AC5 branded placeholder not wired in implementation** — test correctly verifies the default placeholder; the branded variant is deferred.
3. **5.2-AC10 scroll behavior untested in jsdom** — component tests provide structural coverage; a supplementary E2E is recommended for scroll behaviour on the conversation list.
4. **NFR-5.4 a11y gaps** — `no-scrollbar` panels (Story 5.4 AC-7) lack `tabIndex={0}` + `role="region"` (bug-hunt L6, NFR-5.4-4); keyboard-only users cannot scroll them.

**Known gaps to close in a follow-up hardening story** (sourced from `bug-hunt-epic-5-…md`, `test-fidelity-audit-2026-07-12.md`, `nfr-assessment-5-epic.md`):

- **Auto-scroll regression test** — `ChatMessageList.tsx:44-48` `useEffect` deps `[messages, isThinking]` omit `errorMessage`/`showRetry`/`showSpinner` after Story 5.3 AC-3 relocated the spinner/Retry into the scrollable container (bug-hunt M1, NFR-5.3-1, Medium). Add a regression test asserting the Retry button is scrolled into view on `SESSION_TIMEOUT` while the user is scrolled up. Recommended default: scroll-override is appropriate for error states.
- **5.4-AC7 no-scrollbar full-width pane + test** — one-line fix at `artifacts/page.tsx:123` (add `no-scrollbar`) plus a test case rendering the page without an `id` searchParam.
- **False-green ChatInput test (bug-hunt L1)** — `ChatInput.test.tsx:224-241` asserts `toContain('bg-text-3')` which matches both `disabled:bg-text-3` (correct) and `bg-text-3` (always-applied regression). Add a positive assertion that the enabled Send button does NOT contain `bg-text-3`.
- **5.4 AC-1 / AC-5 hover-token E2E restoration** — the skipped E2E blocks were removed because the `withArtifacts` Playwright fixture is broken on unique-constraint violations. Only className-level unit tests remain for `ArtifactCard` and `ArtifactListEntry` hover borders (fidelity audit Finding 3, INFO). Track `withArtifacts` fixture fix as a deferred-work item; when fixed, restore the removed E2E blocks for computed `borderColor` / `backgroundColor` verification.
- **Type-checked `connectRepository` mock factory + `.catch()` path test (fidelity audit Finding 1, LOW Gap-C)** — `RepositoryUrlForm.test.tsx:20-22` mocks `connectRepository` as a bare `jest.fn()` typed only as `(...args: unknown[]) => any`. Replace with a typed factory keyed on `ConnectResult`; add one `.catch()`-path test asserting the generic "unexpected error occurred" fallback renders.
- **NFR quick-wins bundle (~9 fixes, ~1 hour total)** — see `nfr-assessment-5-epic.md` "Quick Wins" list: `take: 100` on `turn.findMany`; `select: { id: true }` on `repoConnection.findUnique`; hoist `Intl.DateTimeFormat` to module scope in `AgentMessage`/`UserMessage`; add `aria-live="polite"` test assertion; update `conversations/[conversationId]/loading.tsx` to the canonical depth-1 header; add `tabIndex={0}` + `role="region"` to the three `no-scrollbar` panels; add `maxLength={2000}` to `RepositoryUrlForm` input; add `MAX_DRAFT_SIZE` guard to `useDraftPersistence`.

**Deferred work — pruned clean:** 0 orphaned deferred-work items remaining across Epic 5 stories (per the post-epic assessment).

### Post-Story-5.5 Update (2026-07-13)

Story 5.5 ("Interleave Tool and Semantic Pills Within the Agent Markdown Stream", architectural — initially split out of Story 5.3 because it requires a data-model change, not a visual CSS fix) shipped after the 2026-07-12 post-Epic-5 update above. Story 5.5 changed: (a) the **`ChatMessage` data model** — added `segments?: MessageSegment[]` discriminated union with `{ type: 'text' } | { type: 'tool_call' }` literal types in `libs/shared-types/src/conversation.types.ts:25-27`; (b) **every SSE event handler in `ConversationPane.tsx`** — rewritten from pushing flat entries to the `messages` array to inserting/updating `MessageSegment` entries inside the streaming agent message (TOOL_CALL_START, TOOL_CALL_RESULT, TOOL_CALL_PROMOTED, TOOL_CALL_END, ACCESS_DENIED, MANUAL_SAVE_SUCCEEDED/FAILED, TEXT_MESSAGE_CONTENT); (c) a **Prisma migration** — `20260713120000_add_turn_segments` adding `Turn.segments JSONB`; (d) **`AgentMessage.tsx`** — new render path that calls `renderSegment(segment, index)` and renders N separate `<Markdown>` instances (one per text segment) instead of a single `<Markdown>` for the flat `content` string; (e) **backend persistence** — `AgentService.runTurn()` builds `accumulatedText` AND `segments` array in parallel; both persisted to `Turn` via dual-write (`content: String`, `segments: Json?`); resume path selects `segments` on `turn.findMany` and reconstructs the segments array via `Array.isArray` guard (`conversations/[conversationId]/page.tsx:44`); (f) **`AgentServiceFake`** — extended to build/persist segments alongside its mock event emissions.

**Traceability gate (PASS, upgraded from 2026-07-12 CONCERNS):** evaluated at `2026-07-13T19:30:00.000Z` (`gate_status: PASS`), 48/48 ACs at FULL coverage across all 5 stories; P0 100% (46/46), P1 100% (2/2); 0 critical-open, 0 high-open; 1,201 Jest tests across 81 suites (894 web + 307 agent-be) + 7 Story 5.5 E2E Playwright tests, 0 skipped. The single fix that upgraded the gate from CONCERNS to PASS was the `no-scrollbar` class addition on the full-width artifact-list pane (`artifacts/page.tsx:124` + test at `artifacts/page.test.tsx:265-269`) during the Story 5.5 bug-hunt — it closed the 5.4-AC7 implementation gap that had been the primary driver of the 2026-07-12 CONCERNS field.

**Test count delta:** 853 (2026-07-12 post-Epic-5) → 1,201 Jest tests + 7 Story 5.5 E2E Playwright tests = +348 Jest tests + 7 E2E tests. Story 5.5 added 9 ConversationPane tests, 5 AgentMessage tests, 3 backend persistence unit tests, 1 strengthened `agent.service.spec.ts` test (segments contents asserted via `arrayContaining`), and the 7-test Playwright E2E spec at `playwright/e2e/conversation/story-5-5-inline-pills.spec.ts`.

**Story 5.5 NFR audit (2026-07-13):** PASS-WITH-CONCERNS — 8 PASS, 4 CONCERNS (1 Medium + 3 Low), 0 FAIL.

**Epic 5 NFR audit (`nfr-assessment-5-epic.md`, 2026-07-13 revision):** PASS-WITH-CONCERNS — 23 PASS, 6 CONCERNS (de-duplicated: 3 Medium + 3 Low), 0 FAIL. Two of the 3 Mediums are pre-existing project-wide patterns surfaced by Epic 5 touching the files they live in: (i) `turn.findMany` missing `take` limit (NFR-5.2-1; amplified by Story 5.5 because the resume-path now loads `segments` JSONB column per row); (ii) `messages.map()` unbound rendering in `ChatMessageList.tsx:98-130` (NFR-5.3-2; amplified by Story 5.5 because each agent message now renders N `<Markdown>` instances rather than 1). The third Medium (`M3-new`) is the only Story-5.5-introduced finding.

**New architectural concerns from the Story 5.5 cycle** (recorded so the next epic-level architectural review begins from the current state, not from the 2026-07-12 baseline):

- **`M3-new` — `AgentServiceFake` diverges from production `pendingClassifierPromises` pattern (Medium, test-seam fidelity per `project-context.md:138`).** Production's `agent.service.ts:630-660` fires the working-tree-status check as a `void`-returned promise, pushes it to `pendingClassifierPromises`, and continues processing subsequent SDK messages without awaiting; `await Promise.allSettled(pendingClassifierPromises)` (line 167) ensures all pending fire-and-forget work resolves BEFORE `RUN_FINISHED`. The fake at `agent-service.fake.ts:186-203` awaits inline, blocking the event loop before the next scripted event emits — making the fake more deterministic than production. Any timing-dependent bug (e.g. `WORKING_TREE_DIRTY` emitted before a subsequent `TEXT_MESSAGE_*` delta) would pass fake-based tests but fail in production. Production code is correct today — the divergence is a test-seam parity violation. Tracked as new test-plan item **P1-018** in `test-design-qa.md` Post-Story-5.5 Gap Closure Update. Lesson for Epic 6: the new `AguiEventBridgeServiceFake` must mirror the production `void`-promise pattern from the start.
- **`L7-new` — `apps/web/project.json` lacks a `typecheck` nx target (Low, surfaced by the Story 5.5 M2-new TS narrowing sub-bug).** `nx.json:38-41` defines a `typecheck` task template; `apps/agent-be/project.json` exposes the target (executor `@nx/js:tsc`); `apps/web/project.json` exposes only `build`, `lint`, `test`. The M2-new fix introduced a TS narrowing bug (`'error' : 'completed' as const` widened `'error'` to `string` due to operator precedence) that silently passed `yarn nx test web` (jest transpiles via babel — no strict type-check) and `yarn nx lint web` (eslint — does not catch TS narrowing). Only direct `npx tsc --noEmit -p apps/web/tsconfig.json` surfaced the TS2345. The immediate bug was fixed in the Story 5.5 NFR audit (extracted `const nextStatus: 'error' | 'completed'`); the structural gap (no CI type-check on `web`) is what's tracked as test-plan item **P1-020**. Other pre-existing TS errors may be silently accumulating without detection.
- **`L5-new` — index-based React keys for text segments (`AgentMessage.tsx:99`, `key={`text-${index}`}`) (Low, React reconciliation anti-pattern).** Currently inert because segments are append-only in current handlers. Future refactor that inserts segments mid-array would shift index-based keys, causing React to mis-reconcile DOM nodes. Coordinate with the deferred MessageSegment runtime-validation story (DP-3). Tracked in **P3-002** hardening bundle.
- **`L6-new` — `MANUAL_SAVE_SUCCEEDED/FAILED` handler duplication (~150 lines, `ConversationPane.tsx:543-693`) (Low, code-quality concern).** The two handlers share ~90% of their structure; only `status`, `semantic`, and `errorMessage` differ. Future edit to one without the other risks behavioral divergence. Extract `buildManualSaveSegment(toolCallId, status, semantic?, errorMessage?)` helper. Tracked in **P3-002** hardening bundle.

**Test-seam parity verification (`M3-new` carry-forward impact for Epic 6):** Story 5.5 is the architectural centerpiece Epic 6 builds on — the `ConversationPane` SSE handlers now expect segments-shaped AG-UI events (interleaved with text), not the pre-5.5 flat-`messages`-array shape. Epic 6's new `agui-event-bridge.service.ts` (Story 6.2) must emit AG-UI events that match the post-Story-5.5 handler contract. The `M3-new` lesson (fake diverges from production's `pendingClassifierPromises`) means the new `AguiEventBridgeServiceFake` must be designed against the production pattern from the start — not retrofitted after wedge bugs surface. The architect's pre-implementation action: define `IAguiEventBridgeService` in `libs/shared-types` BEFORE Story 6.2 implementation begins, with the explicit test-seam parity contract documented in the interface-level JSDoc.

**Deferred work — still pruned clean:** 0 orphaned deferred-work items remaining across the 5 Epic 5 stories (Story 5.5's only deferred item is the DP-3 per-segment narrowing of persisted JSON, explicitly outside the 10 AC scope per story spec).

### Epic 6 (Sandbox-Based Agent Execution) — Post-Completion Update (2026-07-16)

Epic 6 is complete (5 stories, 6.1–6.5). It migrated agent execution from the host process (host-based SDK `query()` per Story 3.3 DP-2) into the Daytona sandbox per PRD §3 and architecture.md data flow, restoring the prescribed architecture. The forward-looking testability preview that previously occupied this section has been replaced with the post-completion reality.

**What was delivered:**

- **Story 6.1 (binary install + network egress):** sandbox-agent (rivet-dev, pinned exact version, checksum-verified) + Claude Code binary deployed inside the sandbox during provision. `networkAllowList` applied on every provision (egress restricted to GitHub, Anthropic API, package registries). `ANTHROPIC_API_KEY` added as a required string to the Zod env schema in `env.validation.ts`. `AGENT_WORKDIR` removed (dead config post-Epic-6). SandboxService fidelity-audit findings F1 (`isNotFoundError` string heuristic → `DaytonaNotFoundError` / `DaytonaError.statusCode === 404`), F2 (dead `provision()` catch-block deleted), F3 (`resume()` error propagation) fixed. Tests: 22 unit tests in `sandbox.service.nfr-s1.spec.ts` (extended with SDK-boundary tests using `mock-daytona.ts`), 4 integration tests in `sandbox-lifecycle.integration.spec.ts`, 2 new tests in `env-example.spec.ts`.
- **Story 6.2 (agui-event-bridge.service.ts):** new NestJS service at `apps/agent-be/src/streaming/agui-event-bridge.service.ts`, registered in `StreamingModule`. Pull-based transport: agent-be creates a Daytona process session (`sandbox.process.createSession`), runs sandbox-agent asynchronously (`executeSessionCommand(sessionId, { command, runAsync: true })`), streams output via `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)`. Circuit breaker wraps the event stream (timer-based stall detection resets on every chunk, terminates sandbox-agent process on timeout, emits `RUN_ERROR`). No raw JSONL parsing — sandbox-agent handles normalization. `OnModuleDestroy` terminates all active sessions and clears all timers. Tests: 22 tests in `agui-event-bridge.service.spec.ts` (transport, circuit breaker, lifecycle, malformed-event handling, leftover-buffer flush, `onModuleDestroy` cleanup). 22 tests in `sandbox.service.session.spec.ts` (process session lifecycle methods).
- **Story 6.3 (AgentService migration):** `AgentService.runTurn()` launches sandbox-agent inside the sandbox via Daytona process session API. `stop()` calls `aguiEventBridgeService.stop(conversationId)` which terminates the real sandbox process via `terminateAgentSession()`. `@anthropic-ai/claude-agent-sdk` import removed from `AgentService`. `AGENT_WORKDIR` env var and `cwd: process.env.AGENT_WORKDIR ?? tmpdir()` logic removed. `query.interrupt()` abort mechanism replaced by `sandbox.process.terminateProcess()`. Preserved behaviours: SSE event pipeline, AG-UI event types, tool-pill classifier, cost tracking, `pendingClassifierPromises` pattern, working-tree emission — all functional. `AgentServiceFake` updated to reflect new execution mechanism side effects. Tests: 86 tests across 3 files (`agent.service.unit.spec.ts` — 19 new + existing; `agui-event-bridge.service.spec.ts` — 4 new onEvent; `agent.service.spec.ts` — integration). Automate-validation: PASS (782 agent-be tests, 0 skipped). NFR audit (`nfr-assessment-6-3.md`): PASS (4 PASS, 2 pre-existing LOW). One coverage gap found and fixed (`MODULE_DESTROYING` sentinel branch — `agent.service.ts:347-351` tested). Typecheck clean.
- **Story 6.4 (verify working-tree / commit / credential flows):** verification story, not new implementation. F4 (`git add` failure path empty error message — `sandbox.service.ts:130-131`) and F5 (`listSkills()` catch-block silent-swallow — `sandbox.service.ts:162-165`) fidelity fixes applied. Regression tests added for host-filesystem isolation (4 tests verifying credentials are not interpolated into the command, malicious messages cannot inject shell commands, shell metacharacters are safely quoted). Working-tree tracking (`WORKING_TREE_DIRTY`), manual commit, and credential failure detection (`CREDENTIAL_FAILURE` / `ACCESS_DENIED`) verified against sandbox-based execution — they now work correctly because the agent and the working tree share the same filesystem.
- **Story 6.5 (real-service E2E verification):** 5 new real-service E2E specs + 1 auto-scroll regression spec + 1 `withArtifacts` fixture idempotency fix + 2 restored hover-token spec blocks. Real-service specs use `test.skip(!process.env.PLAYWRIGHT_REAL_SERVICE, ...)` env-var guard matching pre-existing pattern. All 5 real-service specs + 1 auto-scroll spec cannot currently run due to environment issues (JWT decryption Edge vs Node.js JWE, webServer port conflict, operational prerequisites). 3 hover-token `test.fixme()` blocks were removed during test-review validation (behavior covered by active unit tests in `ArtifactCard.test.tsx` and `ArtifactListEntry.test.tsx`). Test quality score: A+ (98/100). Automate-validation: WARN (1 passes, 4 `test.fixme()`, 5 `test.skip()` env-var guarded, 0 failing).

**Risk register updates from Epic 6:**

- **R-02 (runaway agent on sandbox-agent crash):** now fully testable. `terminateProcess` is no longer a no-op — it terminates a genuine Daytona process session via `sandbox.process.terminateProcess()`. Circuit breaker at `agui-event-bridge.service.ts` fires on stall detection, calls `terminateAgentSession()`, emits `RUN_ERROR` with canonical message. Tested at unit level in `agui-event-bridge.service.spec.ts` (7 circuit-breaker/termination tests). Full PMC assertion (Daytona process session actually terminates) is verified only in Tier 3 real-service E2E — the 5 Story 6.5 specs are env-var gated.
- **P0-010 (sandbox-agent bridge killed mid-session → backend terminates orphaned agent process):** structurally correct since Epic 3 (design was right); now fully verifiable at the unit/integration level. Tests at `agui-event-bridge.service.spec.ts` verify `terminateAgentSession` is called on circuit-breaker timeout, on `stop()`, and on `onModuleDestroy()` — with and without active handles.
- **NFR-S1 (sandbox network isolation):** strengthened. `networkAllowList` egress control is now applied on every provision (Story 6.1). The negative egress test (blocked non-allow-listed host from inside sandbox) is in the Story 6.5 real-service spec `egress-control.spec.ts`, env-var gated.
- **NFR-P1 (first token ≤1,500ms) and NFR-P2 (chat ready ≤10s):** now measured against the sandbox-based execution path. The sandbox model adds transport latency (agent-be → Daytona → sandbox → sandbox-agent → Claude Code → Daytona → agent-be → SSE → browser). Re-measurement specs exist (`nfr-performance.spec.ts`) but are env-var gated. If the additional hops push first-token latency over 1,500ms, the NFR target may need PM review (not a developer decision).
- **`ANTHROPIC_API_KEY` env validation:** now required — Zod validation in `env.validation.ts` fails loudly at startup if absent. `env.validation.spec.ts` updated.
- **`IAguiEventBridgeService` test seam:** the forward-looking preview recommended the architect define `IAguiEventBridgeService` / `AGUI_EVENT_BRIDGE_SERVICE` Symbol-token test seam in `libs/shared-types` before Story 6.2. The actual implementation instead uses `AguiEventBridgeService` directly wired into `StreamingModule` without a Symbol-token interface (similar to the pre-B-01 pattern). This is a test-seam gap — the service is not swapable in tests. In practice, tests exercise it directly (not via DI swap), so the gap is architecturally significant but not currently blocking. Track as a follow-up if the event bridge needs swapping in integration tests.
- **SandboxService fidelity audit findings F1–F5:** all 5 findings fixed. F1 (`isNotFoundError` string heuristic → typed error), F2 (dead catch-block deleted), F3 (`resume()` error propagation tested), F4 (`git add`/`git commit` failure path — empty error message addressed), F5 (`listSkills()` catch-block exercised with explicit contract). SDK-boundary tests added using `mock-daytona.ts`.

**Epic 6 deferred work / remaining gaps:**

- **Tier 3 real-service tests not yet runnable:** 5 Story 6.5 specs (functional smoke, functional file access, functional git commands, functional stop agent, functional host isolation, egress control) are env-var gated pending GitHub test account, CI secrets, real env vars, and real Daytona + Anthropic API access. Tracked in `deferred-work.md` under "real-service test tier setup."
- **JWT decryption issue (DP-5):** the synthetic session JWT encoded by `next-auth/jwt` `encode()` in Node.js cannot be decrypted by the Edge runtime middleware. Blocks browser-session-dependent E2E tests (including the `auto-scroll-session-timeout.spec.ts` regression guard). Deferred — not a test-quality issue.
- **ATDD checklist stale status markers:** `atdd-checklist-6-5-real-service-e2e-verification.md` claims tests are "GREEN" and "activated (test.skip() removed)" when 1 PR-tier test is `test.fixme()` and 5 real-service tests are `test.skip()`. Noted in the test-review-validation report. Low priority documentation pass.
- **Pre-Story-5.5 gap-closure items still open:** P1-015 (typed `connectRepository` mock factory), P1-017 (ChatInput false-green tightening), P1-018 (`AgentServiceFake` divergence — partially addressed by Story 6.3 fake update), P1-019 (M2-new regression test — partially addressed in Story 6.3), P1-020 (`web` typecheck nx target), P2-009 (loading-skeleton header parity), P2-010 (conversation-list scroll E2E), P3-002 (NFR hardening bundle). Status tracked in `test-design-qa.md`.

**Risk Summary:**

- **Total risks**: 10 (R-01–R-10)
- **High-priority (≥6)**: 4 risks requiring mitigation before their respective implementation milestones (none score 9 / gate-blocking)
- **Test effort**: ~140–205 hours system-wide (~4–6 sprints for 1 QA/SDET working in parallel with implementation), excluding items currently blocked on open architecture/PM decisions. **(2026-07-07: superseded — Epics 1–3 complete; actual effort recorded in per-story test artifacts. Gate decision PASS, 92% coverage, 251/251 tests passing.)** **(2026-07-12: further superseded — Epics 1, 2, 3, and 5 complete; 853/853 tests passing across 65 suites; Epic 5 gate = CONCERNS with 38/38 ACs at FULL coverage; NFR-5 epic PASS-WITH-CONCERNS. Per-story test artefacts (ATDD checklists, automate-validation reports, test reviews, NFR assessments) under `_bmad-output/test-artifacts/` elaborate the scenarios below.)** **(2026-07-13: Story 5.5 shipped — gate upgraded to PASS, 1,201 tests across 81 suites.)** **(2026-07-16: Epic 6 complete — 1,697 tests across 98 suites (789 agent-be + 908 web), 0 skipped, 0 failed; NFR-6.3 audit PASS; 39 Playwright spec files (including 6 new Story 6.5 real-service specs, env-var gated). The system-level ranges are retained for historical reference only; per-story test artefacts under `_bmad-output/test-artifacts/` elaborate the scenarios below.)**

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
| **R-02** | **TECH/OPS** | sandbox-agent crash leaves Claude Code agent running unsupervised, able to keep committing with no SSE listener | 2 | 3 | **6** | Backend-initiated process termination via Daytona process API on bridge death; test must kill the bridge mid-session and assert process termination, not just an error event. **(2026-07-16: Epic 6 landed — `terminateProcess` is now real. Circuit breaker in `agui-event-bridge.service.ts` terminates the sandbox-agent process session on stall detection. 7 unit tests verify termination on timeout/stop/onModuleDestroy. P0-010 fully testable at unit level. PMC assertion deferred to Tier 3 real-service E2E — specs written, env-var gated.)** | Backend lead | ~~AG-UI event proxying implementation step~~ **Done (Epic 6)** |
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
| **R-02** Runaway agent on crash | Confirm Daytona process API can terminate a running agent from `apps/agent-be`; add P0 integration test killing the bridge mid-session and asserting process termination, not just an error event | Backend lead | AG-UI event proxying step | **Implemented (Epic 6)** | Circuit breaker / stall-detection timer in `AguiEventBridgeService` (timer-based, resets on every received chunk, terminates sandbox-agent process via `terminateAgentSession()` on timeout). 7 unit tests in `agui-event-bridge.service.spec.ts` verify termination on timeout, `stop()`, and `onModuleDestroy()`. NFR audit (2026-07-16): PASS. PMC assertion (Daytona process session actually terminates) deferred to Tier 3 real-service E2E. |
| **R-03** NFR-P2 repo-size boundary unresolved | Architecture now mandates `git clone --depth=1`; 200 MB threshold accepted with ≤ 8 s target; empirical spike is first action in Implementation Sequence step 7 | Architect / PM | Step 7 (spike) | **Architectural decision implemented; empirical spike still pending** | Shallow clone in code; NFR-P2 remains CONCERNS (2026-07-07) until spike runs against real Daytona |
| **R-04** NFR-R4 silent HTTP/1.1 degradation | Add HTTP/2 capability check to launch checklist; add P0 integration test opening 10 concurrent SSE connections against an HTTP/2 dev server | DevOps / Backend lead | Launch-checklist step | **Planned** (HTTP/2 invariant documented; not verified) | NFR-R4 CONCERNS (2026-07-07): requires real HTTP/2 proxy + 10 real connections; launch checklist item |

---

### Assumptions and Dependencies

#### Assumptions

1. ~~The architecture's planned stack (Nx monorepo, Next.js 15 + NestJS, single shared Prisma schema) will not materially change before implementation begins.~~ **Updated (2026-07-07):** Stack evolved during implementation — Next.js 15 → ~16.1.6, pnpm → Yarn Berry 4.17.0, Prisma → ^7.8.0, NestJS → ^11. Core architectural decisions (Nx monorepo, single shared Prisma schema, SSE transport, Auth.js v5 beta) held; the drift is in versions, not structure. **(2026-07-16: Epic 6 removed the `@anthropic-ai/claude-agent-sdk` dependency from `AgentService` — agent execution is now sandbox-agent-based. The SDK package may still be in `package.json` if other code references it.)**
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
