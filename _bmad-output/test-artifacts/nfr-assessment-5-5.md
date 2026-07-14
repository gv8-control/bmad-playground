---
stepsCompleted:
  - step-01-load-context
  - step-02-define-thresholds
  - step-03-gather-evidence
  - step-04-evaluate-and-score
  - step-05-generate-report
lastStep: 'step-05-generate-report'
lastSaved: '2026-07-13'
workflowType: 'testarch-nfr-assess'
storyId: '5.5'
storyKey: '5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream'
storyFile: '_bmad-output/implementation-artifacts/5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream.md'
inputDocuments:
  - '_bmad-output/implementation-artifacts/5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream.md'
  - '_bmad-output/implementation-artifacts/bug-hunt-epic-5-story-5-5-interleaved-pills.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - 'apps/web/src/components/conversation/ConversationPane.tsx'
  - 'apps/web/src/components/conversation/AgentMessage.tsx'
  - 'apps/web/src/components/conversation/ToolPill.tsx'
  - 'apps/web/src/components/conversation/SemanticPill.tsx'
  - 'apps/web/src/components/conversation/AccessNotice.tsx'
  - 'apps/web/src/components/conversation/types.ts'
  - 'apps/web/src/components/conversation/ChatMessageList.tsx'
  - 'apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx'
  - 'apps/web/src/components/conversation/ConversationPane.test.tsx'
  - 'apps/web/src/components/conversation/AgentMessage.test.tsx'
  - 'apps/agent-be/src/streaming/agent.service.ts'
  - 'apps/agent-be/test/helpers/agent-service.fake.ts'
  - 'apps/agent-be/src/streaming/agent.service.spec.ts'
  - 'apps/agent-be/src/streaming/agent.service.unit.spec.ts'
  - 'libs/shared-types/src/conversation.types.ts'
  - 'libs/database-schemas/src/prisma/schema.prisma'
  - 'libs/database-schemas/src/prisma/migrations/20260713120000_add_turn_segments/migration.sql'
---

# NFR Evidence Audit — Story 5.5: Interleave Tool and Semantic Pills Within the Agent Markdown Stream

**Date:** 2026-07-13
**Epic:** Epic 5 — UX Mockup Fidelity: Close Visual Drift
**Story:** 5.5 (architectural — initially split out of Story 5.3 because it requires a data model change, not a visual CSS fix)
**Overall Status:** PASS-WITH-CONCERNS

---

Note: This audit summarizes existing implementation evidence. It does not run the live dev server; tests were re-run after applied quick-win fixes (`yarn nx test web`, `yarn nx test agent-be`, `npx tsc --noEmit -p apps/web/tsconfig.json`). The bug-hunt report `bug-hunt-epic-5-story-5-5-interleaved-pills.md` is the primary cross-reference; findings here either confirm FIXED status, record quick-win fixes applied during this audit, or carry forward as OPEN concerns.

## Executive Summary

**Assessment:** 8 PASS, 4 CONCERNS (1 Medium, 3 Low), 0 FAIL

**Blockers:** 0 — no FAIL-status NFRs; no critical, high, or production-reachable data-loss issues introduced by Story 5.5.

**Medium Priority Issues:** 1 — `AgentServiceFake` diverges from production's `pendingClassifierPromises` pattern (M3-new from the bug-hunt; test-fidelity, not a production bug).

**Low Priority Issues:** 3 (de-duplicated):
1. Index-based React keys for text segments (`AgentMessage.tsx:99`) — anti-pattern, currently inert because segments are append-only.
2. `MANUAL_SAVE_SUCCEEDED` + `MANUAL_SAVE_FAILED` handler duplication (~150 lines) — symmetric duplication; behavioral divergence risk on future edits.
3. No `typecheck` nx target for the `web` project — TS narrowing errors silently pass CI.

**Recommendation:** Proceed — no blockers. Story 5.5's architectural change is well-tested (894 web tests, 307 agent-be tests still pass after applied fixes). The one Medium test-fidelity gap (test-seam fake divergence) is bounded by the production code's correctness today but should be scheduled in a follow-up story. Carry-forward the 3 Low findings into the Epic-5 NFR-hardening bundle already scoped in the prior epic-level assessment.

## NFR Matrix for Story 5.5

| NFR | Category | Threshold | Relevance to Story 5.5 |
| --- | --- | --- | --- |
| NFR-P1 | Performance | First streamed token ≤ 1,500 ms | Not exercised — Story 5.5 doesn't change SSE emission or first-token latency. PASS (not affected). |
| NFR-P2 | Performance | Chat ready ≤ 10 s | Not exercised directly. Story 5.5's handler rewrite changes per-event processing cost but not the page-load budget. PASS (not affected). |
| NFR-P3 / P4 | Performance | Project Map / Artifact Browser ≤ 2 s | Not exercised — Story 5.5 touches conversation-stream components, not the Project Map or Artifact Browser. PASS (not affected). |
| NFR-P5 | Performance | Manual commit ≤ 5 s | Not exercised. PASS (not affected). |
| NFR-S1 | Security | Sandbox credential isolation | Not exercised. PASS (not affected). |
| NFR-S2 | Security | Tenant-scoped lookups | Exercised indirectly — Story 5.5's resume path `turn.findMany` query (`conversations/[conversationId]/page.tsx:33-37`) inherits the existing `userId`-scoped `conversation.findFirst`. PASS (no new queries added). |
| NFR-S4 | Security | OAuth token storage encryption | Not exercised. PASS (not affected). |
| NFR-R1 | Reliability | Credential health propagation | Not exercised. PASS (not affected). |
| NFR-R2 | Reliability | Committed Artifacts recoverable | Exercised — `Turn.segments` JSONB column persists interleaved positional data alongside `content`. Resume path reads `segments` via `select` projection and reconstructs the segments array. Two fixes landed: (a) `Array.isArray()` runtime guard on resume `"L4 in bug-hunt"`; (b) persistent JSON shape verified by `agent.service.unit.spec.ts` segments-order test. PASS. |
| NFR-R3 | Reliability | SSE back-pressure | Not exercised — Story 5.5 changes frontend handlers only; SSE transport unchanged. PASS. |
| NFR-R4 | Reliability | 10 concurrent SSE | Not exercised by Story 5.5. Standing CONCERNS (pre-existing, not affected). |
| NFR-O1 | Observability | Per-user LLM spend tracking | Not exercised by Story 5.5. PASS (not affected). |
| UX-DR5 / AC-1 contract | Accessibility / UX-Drift | Inline chip at the exact stream position | Exercised — all 10 Story 5.5 ACs (1–10) cover inline positioning, in-place replacement, promotion, and resume restoration. Test coverage: 9 ConversationPane tests + 5 AgentMessage tests + 3 agent-be persistence tests. PASS. |
| Project convention: defense-in-depth on `Json?` reads | Reliability | Runtime validation on persisted JSON | Exercised — `page.tsx:44` uses `Array.isArray(turn.segments) ? (turn.segments as MessageSegment[]) : undefined`. The narrow-per-segment filter was deferred (DP-3 in story spec; only `Array.isArray` guard landed). LOW CONCERN inherited (single malformed segment, if introduced by future manual DB intervention, still poisons the conversation view). |
| Project convention: TypeScript clean (`tsc --noEmit`) | Maintainability | No new TS errors introduced | Exercised — the M2-new fix (`s.toolCall.status === 'error' ? 'error' : 'completed' as const`) introduced a TS narrowing error (`'error'` widens to `string`). **Fixed in this audit** by extracting `nextStatus: 'error' | 'completed'` const. The `web` project still lacks a `typecheck` nx target — see Finding L7-new (Low). |

## Context Loaded

### Configuration

- `tea_browser_automation`: auto (Playwright CLI + MCP patterns loaded; not used — codebase audit, no running app)
- `test_artifacts`: `_bmad-output/test-artifacts`
- `user_name`: Marius
- `communication_language`: English

### Knowledge Fragments

- `adr-quality-readiness-checklist.md` — 8-category, 29-criteria assessment framework
- `error-handling.md` — resilience checks (SSE handler firing order, silent-drop paths)
- `nfr-criteria.md` — PASS / CONCERNS / FAIL status definitions
- `playwright-cli.md` — Playwright CLI for AI agents (loaded; not invoked — no live dev server)
- `test-quality.md` — Definition of done

### NFR Thresholds (inherited from `architecture.md` + `test-design-architecture.md`)

The thresholds matrix lives in `nfr-assessment.md` (lines 158–231) and the epic-level assessment (`nfr-assessment-5-epic.md`). Re-summarized above in the NFR Matrix for Story 5.5-relevant categories only. No new thresholds were introduced.

## Evidence Gathered

### Performance

**Sources:** `ConversationPane.tsx`, `AgentMessage.tsx`, `agent.service.ts`, `apps/agent-be/test/helpers/agent-service.fake.ts`

- **SSE handler complexity:** `TOOL_CALL_END` (line 393–412), `TOOL_CALL_RESULT` (line 415+), `TOOL_CALL_PROMOTED`, `MANUAL_SAVE_SUCCEEDED/FAILED` handlers all do `m.segments.map((s) => ...)` on every matching event — O(n) per event where n is segment count. For typical agent messages (≤ 20 segments), this is well under 1 ms per event. Not a measured concern at MVP scale. PASS.
- **Multiple Markdown instances per agent message:** `AgentMessage.tsx:131` calls `renderSegment(segment, index)` which renders `<Markdown>` (with `remarkGfm` + a custom components map) for every text segment. For an agent message with N text segments, this is N independent Markdown parses. Long agent messages (5+ tool calls + 5+ text segments = 10+ Markdown instances) increase React render cost vs. the legacy single-Markdown render of the flat `content` string. No timing test exists to validate the threshold. LOW CONCERN at MVP scale; recommend a notes-level budget for an agent message's segment count (mirrors NFR-P2's 200 MB repository boundary).
- **`Intl.DateTimeFormat` hoisting:** `UserMessage.tsx:10–14` and `AgentMessage.tsx:27–31` both instantiate at module scope. Pre-existing low-performance bug FIXED before this story shipped (per bug-hunt L4 verified status). PASS.
- **Backend persistence dual-write:** `agent.service.ts:128–201` builds `accumulatedText` AND `segments` array in parallel; both persisted to `Turn` (`content: String`, `segments: Json?`). Dual-write cost is O(n) per chunk — negligible. Backend persistence is one-shot at end of turn; no per-event DB writes. PASS.
- **Resume-path `findMany` query:** `conversations/[conversationId]/page.tsx:33–37` selects `id, role, content, segments, createdAt` — `segments` adds a JSONB column read. Already documented as a pre-existing project-wide concern (no `take` limit carried over from NFR-5.2-1; not changed by Story 5.5). NOT AFFECTED by Story 5.5.

### Security

**Sources:** `conversations/[conversationId]/page.tsx`, `agent.service.ts`, `schema.prisma`, migration SQL, `ConversationPane.tsx`

- **Prisma migration (`segments Json?` column):** `migration.sql` is `ALTER TABLE "turns" ADD COLUMN "segments" JSONB;` — JSONB column, no injection risk. Prisma parameterizes all queries. No new indexed queries that could be exploited. PASS.
- **Resume path JSON validation (L4 in bug-hunt):** `page.tsx:44` casts `turn.segments as MessageSegment[]` but wraps it with `Array.isArray(turn.segments) ? ... : undefined`. Defense-in-depth for shape verification. Per-segment narrowing (`s.type === 'text' || (s.type === 'tool_call' && s.toolCall)`) was deferred (DP-3 in story spec). PASS-WITH-CONCERNS — single guard at the top-level array, not per-segment. See Finding 1 below.
- **SSE handler changes:** All new SSE handlers (`TOOL_CALL_END`, `MANUAL_SAVE_SUCCEEDED/FAILED`, `CREDENTIAL_FAILURE`, `ACCESS_DENIED`) parse JSON via `JSON.parse((event as MessageEvent).data)` inside a `try { ... } catch { /* ignore */ }` block. No untrusted input flows to `eval`, `dangerouslySetInnerHTML`, command exec, or DOM sink. The `safeUUID()` fallback (used when `toolCallId` is absent in `MANUAL_SAVE_SUCCEEDED/FAILED`) is generated with `crypto.randomUUID()` — no injection surface. PASS.
- **No new credential paths:** No `apiKey`, `oauthToken`, `boundaryJwt`, or sandbox credential is read in the new handler code. No auth/session changes. PASS.
- **No secrets in source:** Searched additions; no hardcoded credentials, no logging of secrets. PASS.

### Reliability

**Sources:** `ConversationPane.tsx` handlers, `agent.service.ts`, ChatMessageList test

- **SSE back-pressure:** Not changed by Story 5.5 — frontend handlers consume events; transport-level back-pressure (R3) is preserved. PASS.
- **Status-overwrite bug (M2-new in bug-hunt):** `TOOL_CALL_END` handler at `ConversationPane.tsx:405` now uses `s.toolCall.status === 'error' ? 'error' : 'completed'` logic — preserves the `'error'` state if `TOOL_CALL_RESULT` (with `isError: true`) arrived out-of-order before `TOOL_CALL_END`. FIXED. (Note: the original M2-new fix introduced a TS narrowing bug; that bug was caught and fixed during this audit — see Autonomous Decisions section.)
- **TEXT_MESSAGE_CONTENT silent drop (L3-new in bug-hunt):** `ConversationPane.tsx:280–305` had an `if (messageId)` guard that silently dropped deltas when `streamingMessageIdRef.current` was null. **Fixed in this audit** by adding `else if (delta) console.warn(...)` defense-in-depth path — protocol violations now surface a console warning. The user-visible behavior is unchanged (delta is still dropped), but the silent-drop symptom is now observable. FIX-APPLIED.
- **Replay dedup:** `findIndex` dedup on `toolCallId` is present in `MANUAL_SAVE_SUCCEEDED/FAILED` handlers (`:574–577` / `:650–653`) — protects against `MANUAL_SAVE_*` re-fires from `ReplaySubject(100)`. Other SSE event types (`TOOL_CALL_END`, `TOOL_CALL_RESULT`) don't deduplicate — they unconditionally update the matching segment if found. The `found` flag (lines 397, 474) is recorded for tool-call segments within the same message; if no matching segment is found, the message is unchanged (`found ? update : m`). No duplicate segments are created by these handlers. PASS — dedup is correct for the production reachability matrix; status-overwrite is bounded.
- **Circuit breaker / graceful shutdown / health endpoint:** Not touched by Story 5.5. Pre-existing PASS preserved.

### Maintainability / Observability

**Sources:** `ConversationPane.tsx`, `AgentMessage.tsx`, `agent-service.fake.ts`, test files

- **Test coverage:** 894 web tests / 65 suites pass (post-fix verification). 307 agent-be tests / 16 suites pass. 0 skipped, 0 failed. Story 5.5 adds 9 ConversationPane tests (AC-1 through AC-9), 5 AgentMessage tests (segment-rendering behavior), 3 agent-be persistence tests (segments persisted, segments ordered, tool_call fields captured). PASS.
- **TypeScript clean:** Pre-existing state passed `tsc --noEmit`. Two of the uncommitted-as-of-this-audit fixes introduced TS issues:
  - M2-new status-overwrite fix widened `'error'` to `string` in the ternary expression. **Fixed in this audit** by extracting `const nextStatus: 'error' | 'completed'`. Re-verified: `npx tsc --noEmit -p apps/web/tsconfig.json` returns 0 errors.
  - The `web` project does NOT have an nx `typecheck` target — `nx.json` defines a `typecheck` task template but `apps/web/project.json` only exposes `build`, `lint`, `test`. Standing-risk OPEN (verified pre-existing).
- **Lint clean:** `yarn nx lint web` exits 0 errors (43 pre-existing warnings, all from pre-existing code; none introduced by Story 5.5). PASS.
- **Code quality / test-seam fidelity** (M3-new in bug-hunt): `AgentServiceFake` (`apps/agent-be/test/helpers/agent-service.fake.ts:186–203`) awaits the working-tree check inline rather than pushing to a `pendingClassifierPromises` array (mirroring production's `agent.service.ts:630–660` pattern). Test-seam parity violation per `project-context.md:138`. NOT production-reachable today — the fake is more deterministic than production, but timing-dependent bugs (between `WORKING_TREE_DIRTY` and a subsequent text delta) won't reproduce in spec tests. CONCERN (Medium).
- **`MANUAL_SAVE_SUCCEEDED/FAILED` duplication (L6-new in bug-hunt):** ~150 lines of mostly-identical structure across the two handlers (`ConversationPane.tsx:543–617` SUCCEEDED, `:619–693` FAILED). Only difference: `status` (`'completed' | 'error'`), `semantic` (only on SUCCEEDED), and `errorMessage` (only on FAILED). Future edit to one without the other risks behavioral divergence. CONCERN (Low).
- **Index-based React keys for text segments (L5-new in bug-hunt):** `AgentMessage.tsx:99` uses `key={`text-${index}`}` for text segments + `key={`tool-${toolCall.toolCallId}`}` for tool_call segments. Append-only segments in current handlers mean keys are stable across renders today. Inert anti-pattern today; future refactor that inserts segments mid-array would cause React mis-reconciliation. CONCERN (Low).
- **Coverage threshold:** Not enforced by `nx` config (no `coverage` threshold in `jest.config`). Pre-existing project-wide gap; not introduced by Story 5.5. NOT AFFECTED.
- **Observability:** No new error tracking or metrics added. The new `console.warn` defense-in-depth path improves silent-drop diagnosability but no production sink (Sentry / Datadog). Standing project-wide CONCERNS inherited.

### Story 5.5 Test Coverage (verified post-fix)

| AC | Test | File | Status |
| --- | --- | --- | --- |
| AC-1 (TOOL_CALL_START inline indicator) | `[P0] tool_call segment renders inline within agent markdown (not standalone row)` | ConversationPane.test.tsx:2429–2457 | PASS (uses `toMatch(/Before tool.*Running.*Bash.*After tool/s)` — DOTALL regex enforces order) |
| AC-2 (TOOL_CALL_RESULT replaces indicator in place) | `[P0] TOOL_CALL_RESULT updates tool_call segment in place` | ConversationPane.test.tsx:2461–2498 | PASS |
| AC-3 (TOOL_CALL_PROMOTED promotes to Semantic Pill) | `[P0] TOOL_CALL_PROMOTED updates tool_call segment semantic field in place` | ConversationPane.test.tsx:2502–2546 | PASS |
| AC-4 (failed tool → error-state Tool Pill inline) | `[P0] failed tool result renders error-state Tool Pill inline as segment` | ConversationPane.test.tsx:2551–2587 | PASS (uses `toMatch(/Trying.*Bash/s)`) |
| AC-5 (ACCESS_DENIED renders Access Notice inline below error Tool Pill) | `[P0] ACCESS_DENIED updates tool_call segment accessNotice within agent message` | ConversationPane.test.tsx:2591–2633 | PASS (uses `toMatch(/Pushing.*GitHub is rate-limiting/s)`) |
| AC-6 (manual save Semantic Pill inline) | `[P0] MANUAL_SAVE_SUCCEEDED` + `[P0] MANUAL_SAVE_FAILED` | ConversationPane.test.tsx:2636–2702 | PASS |
| AC-7 (ChatMessage data model: segments discriminated union) | `MessageSegment` type definition | `libs/shared-types/src/conversation.types.ts:25–27` | PASS (compiler-enforced discriminated union on `type`) |
| AC-8 (ConversationPane handlers insert/update within streaming agent message) | All 9 ConversationPane Story 5.5 tests assert `agentMessageContainers.length === 1` | ConversationPane.test.tsx:2454–2456, 2494–2495, 2584–2585, 2630–2631, 2699–2700, 2791–2792 | PASS |
| AC-9 (resume restores pills at original positions) | `[P0] initialMessages with segments render pills at correct positions` | ConversationPane.test.tsx:2886–2936 | PASS (uses `toMatch(/Let me check.*Bash.*The task is complete/s)` — **fixed in this audit**; previously used 3 separate `toContain` calls) |
| AC-10 (AgentMessage renders interleaved tool calls at correct positions) | `[P0] renders segments in order: text, tool_call, text` | AgentMessage.test.tsx:130–155 | PASS (uses `toMatch(/First.*Read.*Second/s)`) |
| Backend persistence (AC-7 + AC-9 backend mirror) | `[P0] persists segments alongside content in Turn row` + `[P0] segments array contains text and tool_call segments in order` + `[P0] tool_call segment captures toolCallId, toolName, status` | agent.service.unit.spec.ts:1308–1414 + agent.service.spec.ts:184–202 | PASS (3 tests; `agent.service.spec.ts` **strengthened in this audit** to assert segment contents via `arrayContaining`; previously only asserted shape) |

---

## Findings

### Finding 1: Bug-hunt M2-new (TOOL_CALL_END status-overwrite) — FIXED (with TS narrowing bug closed during this audit)

**Category:** Reliability (NFR-R3 — SSE event semantics)
**Introduced by Story 5.5:** Yes (rewrote the TOOL_CALL_END handler)
**Status:** FIXED

**Evidence:**

- File: `apps/web/src/components/conversation/ConversationPane.tsx:402–406`
- Code: `const nextStatus: 'error' | 'completed' = s.toolCall.status === 'error' ? 'error' : 'completed'; return { ...s, toolCall: { ...s.toolCall, status: nextStatus } };`
- Original bug (already documented in bug-hunt): the M2-new fix preserved `'error'` status when `TOOL_CALL_END` arrives after `TOOL_CALL_RESULT` with `isError: true`. The bug-hunt reported this fix as ALREADY-FIXED.

**Sub-finding (caught and fixed during this NFR audit):** The M2-new fix introduced a TypeScript narrowing bug — `s.toolCall.status === 'error' ? 'error' : 'completed' as const` widened `'error'` to `string` (operator precedence: `?:` lower than `as const`), causing `npx tsc --noEmit` to fail with TS2345. Caught by running tsc directly on the workspace; not surfaced by `yarn nx test web` (jest transpiles via babel, no strict type-check). Fixed by extracting `const nextStatus: 'error' | 'completed'` (literal subset of `'error' | 'running' | 'completed'`). TS error resolved; all tests still pass (894 / 65 suites).

**Production-reachable consequence (pre-fix):** A future protocol variant that emits `TOOL_CALL_RESULT` before `TOOL_CALL_END` would hide the error pill's `error` status in subsequent updates. Now bounded by the fix. Regression test for this specific out-of-order case does NOT yet exist — see Recommendation 1.

**Recommendation:** Add a regression test (`[P0] TOOL_CALL_END preserves 'error' status set by out-of-order TOOL_CALL_RESULT`) to `ConversationPane.test.tsx` — emit `TOOL_CALL_RESULT` (with `isError: true`) before `TOOL_CALL_END` and assert the pill's status remains `'error'`.

---

### Finding 2: Bug-hunt M3-new (`AgentServiceFake` diverges from `pendingClassifierPromises` pattern) — OPEN [Medium]

**Category:** Maintainability (test-seam fidelity per `project-context.md:138`)
**Introduced by Story 5.5:** Yes
**Status:** Open

**Evidence:**

- File: `apps/agent-be/test/helpers/agent-service.fake.ts:186–203`
- Production pattern: `apps/agent-be/src/streaming/agent.service.ts:630–660` fires the working-tree-status check as a `void`-returned promise, pushes the promise to `pendingClassifierPromises`, and continues processing subsequent SDK messages without awaiting — the working-tree emit may fire AFTER other events have already been emitted on the SSE stream. Then `await Promise.allSettled(pendingClassifierPromises)` (line 167) ensures all pending fire-and-forget work resolves BEFORE `RUN_FINISHED`.
- Fake pattern: `if (event.event === EventType.TOOL_CALL_RESULT && currentToolName && FILE_MODIFYING_TOOLS.has(currentToolName)) { const status = await this.sandboxService.getWorkingTreeStatus(params.sandboxId); ... }` — awaits inline, blocking the event loop before the next scripted event is emitted.
- **Test-fidelity impact:** Any production bug that depends on the timing relationship between `WORKING_TREE_DIRTY` and subsequent `TEXT_MESSAGE_*` events (e.g. an SSE ordering assumption, a UI state transition that scrolls to reveal the dirty indicator) would pass in fake-based tests but fail in production.

**Recommendation:** Mirror the production's `pendingClassifierPromises` pattern in the fake — push the working-tree promise to a local array, `await Promise.allSettled(promises)` at the end before persisting the Turn row. ~20-line refactor of the fake's `runTurn` loop.

---

### Finding 3: Bug-hunt L5-new (index-based React keys for text segments) — OPEN [Low]

**Category:** Maintainability (React reconciliation anti-pattern)
**Introduced by Story 5.5:** Yes
**Status:** Open

**Evidence:**

- File: `apps/web/src/components/conversation/AgentMessage.tsx:99`
- Code: `<Markdown key={`text-${index}`} ...>` for text segments + `key={`tool-${toolCall.toolCallId}`}` for tool_call segments.
- Current handler logic is append-only (`ConversationPane.tsx:293–295` either replaces the last segment if it's text, or appends when the last segment is tool_call). Index-based keys are stable across renders today — inert.
- **Risk:** A future refactor that inserts segments mid-array (e.g. a "Promote to text" feature like the SemanticPill's promotion) would shift the index-based keys of all subsequent text segments, causing React to mis-reconcile DOM nodes and reuse markdown renders for different content.

**Recommendation:** Either (a) pre-assign a `crypto.randomUUID()` to each segment when created in ConversationPane.tsx handlers and use it as the React key — adds a `key` field on persistable JSON; OR (b) derive a stable composite key from adjacent context (`key={`text-${index}-${segment.content.slice(0, 50)}`}`). Coordinate with the broader `MessageSegment` runtime validation story (deferred DP-3).

---

### Finding 4: Bug-hunt L6-new (`MANUAL_SAVE_SUCCEEDED/FAILED` handler duplication) — OPEN [Low]

**Category:** Maintainability (code duplication)
**Introduced by Story 5.5:** Yes
**Status:** Open

**Evidence:**

- Files: `ConversationPane.tsx:543–617` (MANUAL_SAVE_SUCCEEDED) + `:619–693` (MANUAL_SAVE_FAILED)
- The two handlers share ~90% of their structure: (1) parse `toolCallId`, optional `safeUUID()` fallback; (2) clear `saveFallbackTimeoutRef` if set; (3) find target message (`streamingId ?? prev.findLast(...)`); (4) if target has no segments: create segments array with single tool_call segment; (5) if target has segments: check `existingIdx` for dedup, else append; (6) if no target: append new assistant message.
- Only difference: `status` (`'completed' | 'error'`), `semantic` field (only on SUCCEEDED), `errorMessage` field (only on FAILED).

**Recommendation:** Extract a shared `buildManualSaveSegment(toolCallId, status, semantic?, errorMessage?)` helper that constructs the tool_call segment, and an `insertManualSaveSegment(prev, toolCallId, segment)` helper that does the message-targeting + dedup + insert logic. The two handlers shrink to ~10 lines each. No behavior change.

---

### Finding 5 (NEW): `web` project lacking `typecheck` nx target — OPEN [Low]

**Category:** Maintainability (CI gate)
**Introduced by Story 5.5:** No (pre-existing project-wide gap) — surfaced by the TS narrowing bug in Finding 1
**Status:** Open

**Evidence:**

- File: `apps/web/project.json` exposes only `build`, `lint`, `test` nx targets. No `typecheck`.
- `nx.json:38–41` defines a `typecheck` task template (default executor: nx inferred from tsconfig.json).
- `apps/agent-be/project.json` exposes `typecheck` (executor: `@nx/js:tsc`). The `agent-be` project type-checks cleanly.
- The TS narrowing bug introduced by the bug-hunt's M2-new fix passed CI silently — `yarn nx test web` (jest) and `yarn nx lint web` (eslint) both reported 0 errors; only direct `npx tsc --noEmit -p apps/web/tsconfig.json` surfaced the TS2345.
- Production impact: TypeScript narrowing errors are caught only at next.js production build time (`yarn nx build web`), not during development or pre-merge CI.
- Other pre-existing TS errors may be silently accumulating without detection.

**Recommendation:** Add a `typecheck` nx target to `apps/web/project.json` (mirror the `agent-be` pattern):

```json
"typecheck": {
  "executor": "@nx/js:tsc",
  "outputs": ["{options.tsConfig}"],
  "options": {
    "tsConfig": "apps/web/tsconfig.json"
  }
}
```

Add `typecheck` to the pre-merge CI workflow.

---

## Findings FIXED during this audit (and verified by tests)

| Bug-hunt ID | Title | Fix applied in this audit | Verification |
| --- | --- | --- | --- |
| M1-new — AC-1 false-green test (resume variant only) | AC-9 ordering test used 3 separate `toContain` calls (`agentMessageContainers[0].textContent.toContain('Let me check'); toContain('Bash'); toContain('The task is complete')`) | Replaced with `toMatch(/Let me check.*Bash.*The task is complete/s)` DOTALL regex | `yarn nx test web` — 894 / 65 PASS |
| L1-new — spec test asserts shape only | `agent.service.spec.ts:184–202` only asserted `toHaveProperty('segments')` + `Array.isArray(...)` | Added `expect(assistantTurnCall[0].data.segments).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'tool_call', toolCall: expect.objectContaining({ toolName: 'Bash', input: 'git status', output: 'nothing to commit' }) })]))` | `yarn nx test agent-be` — 307 / 16 PASS |
| L3-new — TEXT_MESSAGE_CONTENT silent drop | `ConversationPane.tsx:280–305` had no signal when `messageId` was null | Added `else if (delta) console.warn('[ConversationPane] TEXT_MESSAGE_CONTENT delta dropped — no streamingMessageIdRef set');` defense-in-depth | `yarn nx test web` — 894 / 65 PASS |
| Sub-finding of M2-new — TS narrowing bug | M2-new fix widened `'error'` to `string` in `s.toolCall.status === 'error' ? 'error' : 'completed' as const` | Extracted `const nextStatus: 'error' | 'completed'` const-typed local | `npx tsc --noEmit -p apps/web/tsconfig.json` — 0 errors |

## Findings ALREADY FIXED before this audit (verified at source)

| Bug-hunt ID | Title | Status at audit time | Source location |
| --- | --- | --- | --- |
| M1-new — AC-1 conversation-pane narrative-ordering variant | AC-1 inline-position test now uses DOTALL regex | FIXED (outside this audit) | `ConversationPane.test.tsx:2456` — `.toMatch(/Before tool.*Running.*Bash.*After tool/s)` |
| M1-new — AC-4 error-state inline test now uses DOTALL regex | FIXED (outside this audit) | `ConversationPane.test.tsx:2586` — `.toMatch(/Trying.*Bash/s)` |
| M1-new — AC-5 access-notice inline test now uses DOTALL regex | FIXED (outside this audit) | `ConversationPane.test.tsx:2632` — `.toMatch(/Pushing.*GitHub is rate-limiting/s)` |
| M1-new — AgentMessage ordering test now uses DOTALL regex | FIXED (outside this audit) | `AgentMessage.test.tsx:154` — `.toMatch(/First.*Read.*Second/s)` |
| M2-new — TOOL_CALL_END status-overwrite | FIXED (production code) | `ConversationPane.tsx:402–406` — preserves 'error' state |
| L2-new — shallow `toHaveProperty('status')` | FIXED (unit test now reads value) | `agent.service.unit.spec.ts:1413` — `.toBe('completed')` |
| L4-new — Resume path casts DB JSON without runtime validation | FIXED — `Array.isArray` guard added | `conversations/[conversationId]/page.tsx:44` |

---

## Categories with No Findings

| Category | Status | Notes |
|----------|--------|-------|
| Authentication & Authorization | PASS | No auth, credential resolution, or SSE transport changes |
| Encryption at rest / in transit | PASS | No encryption or token storage changes |
| API Security (rate limiting, CORS, headers) | PASS | No middleware, API routes, or security headers modified |
| Secrets management | PASS | No new env vars, no hardcoded credentials |
| SSE back-pressure (R3) | PASS | SSE transport unchanged |
| Credential health (R1) | PASS | Not touched |
| Committed Artifacts recoverable (R2) | PASS | `Turn.segments` JSONB persisted alongside `content` — both restorable on resume |
| LLM spend tracking (O1) | PASS | No cost tracking changes |
| Test count | PASS | 894 / 307 / 0 skipped / 0 failed (post-fix) |
| Lint | PASS | `yarn nx lint web` — 0 errors (43 pre-existing warnings) |

---

## Conclusion

Story 5.5 is the architectural centerpiece of Epic 5 — it requires a data model change (`ChatMessage.segments?: MessageSegment[]` discriminated union), a rewrite of every SSE event handler in `ConversationPane.tsx`, a Prisma migration adding a JSONB column, and a new render path in `AgentMessage.tsx`. The story shipped with 10 ACs and full test coverage; one bug-hunt surfaced 9 findings (3 Medium, 6 Low). At NFR audit time:

- 5 of the 9 bug-hunt findings were already fixed in source (M1-new partial / M2-new / L2-new / L4-new plus the M1-new strengthening elsewhere).
- 3 were fixed during this NFR audit (M1-new AC-9 variant, L1-new spec content, L3-new silent-drop warn).
- 3 remain OPEN (M3-new fake divergence Medium; L5-new index-based React keys Low; L6-new handler duplication Low).
- 1 NEW finding surfaced during this audit (the `web` project's missing `typecheck` nx target — Low — exposed by the M2-new fix's TS narrowing bug, which I also closed).

**Final Score:** 8 PASS, 4 CONCERNS (1 Medium, 3 Low), 0 FAIL.

**Gate Decision:** PASS-WITH-CONCERNS — proceed with no blockers. Book the M-knew M3-new (fake divergence) and L5/L6/L7 news into the Epic-5 NFR-hardening bundle already scoped in the epic-level assessment. Add the recommended M2-new regression test (out-of-order TOOL_CALL_RESULT before TOOL_CALL_END preserves error status).

## Autonomous Decisions

In place of halting at checkpoints, the following autonomous decisions were made:

1. **Mode:** Create mode per task brief; skipped user-facing "what would you like to do?" prompt. Ran autonomously, recorded decisions below.
2. **Execution mode for Step 4:** Auto → resolved to `sequential` (subagent fallback per the bug-hunt's documented behavior; same session that ran the bug-hunt).
3. **Bug-hunt questions to NFR:** Rather than re-discover findings, I treated the bug-hunt report as the authoritative cross-reference. Verified status at source for each finding; applied test-strength quick-wins where I could mirror existing patterns. Did NOT reduplicate the bug-hunt's exhaustive step-by-step walkthrough here — NFR assessment's job is the non-functional-requirement verdict, not the bug-hunt replay.
4. **Test-fidelity quick wins applied (3 + 1 TS narrowing fix):**
   - AC-9 narrative ordering: 3 separate `toContain` (false-green per bug-hunt M1) → single `toMatch` DOTALL regex. Mirrors existing AC-1/AC-4/AC-5 pattern.
   - L1-new spec shape-only assertion: added `arrayContaining` with `objectContaining` for `type === 'tool_call'` and `toolCall.toolName === 'Bash'`. Mirrors the unit.spec pattern referenced in bug-hunt remediation.
   - L3-new silent-drop console.warn: aligned with bug-hunt's "optional" remediation language; took the lower-friction defense-in-depth decision rather than the alternative (auto-create a streaming message, which would mask upstream protocol violations).
   - TS narrowing extraction: minimal `const nextStatus: 'error' | 'completed'` introduction — preserves literal-typed narrowing that the inline ternary lost.
5. **Did NOT apply these fixable concerns inline:**
   - **L4-new per-segment narrowing:** Bug-hunt L4 recommends `Array.isArray(turn.segments) ? (turn.segments as MessageSegment[]) : undefined` — landed as the simple guard. The deeper per-segment narrowing `segments.filter(s => s && (s.type === 'text' || ...))` is explicitly deferred (DP-3 in story spec); did not pull it forward without coordination.
   - **M3-new fake divergence:** Requires restructuring the fake's `runTurn` loop to mirror pendingClassifierPromises — ~20-line change with cross-test-reliability implications (existing tests depend on the more-deterministic inline await). Better as a dedicated task.
   - **L5-new index-based keys:** Options (a) and (b) both add fields or change persistence shape; coordinate with the deferred MessageSegment runtime validation story.
   - **L6-new handler duplication:** Pure code-quality refactor of ~150 lines into a helper. Better as a small refactor PR — would expand this NFR audit response too much for a low-priority improvement.
6. **Severity calibration for Finding 5 (`web` typecheck):** Classified Low because no production code is incorrect (after the M2-new TS narrowing bug was fixed). The structural gap (no CI type-check on `web`) is pre-existing project-wide and not introduced by Story 5.5 — but it surfaced (and hid) a story-introduced TS issue, making it traceable to Story 5.5's scope. Resolved the immediate incident; the structural gap is the recommendation.
7. **Test count deltas:** Pre-fix audit baseline was 894 web + 307 agent-be. Post-fix audit verification: 894 web + 307 agent-be (no new tests added — only test-strength fixes). The AC-9 fix swapped the assertion strategy (3 `toContain` → 1 `toMatch`); the L1-new fix added `arrayContaining` content assertion (still one test). The L3-new + TS narrowing fixes did not change tests.

## Related Artifacts

- **Story file:** `_bmad-output/implementation-artifacts/5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream.md`
- **Epic source:** `_bmad-output/planning-artifacts/epics.md` (Story 5.5 at lines 1100–1172)
- **Prior NFR assessments:** `_bmad-output/test-artifacts/nfr-assessment-5-1.md` through `nfr-assessment-5-4.md`
- **Epic-level NFR:** `_bmad-output/test-artifacts/nfr-assessment-5-epic.md` (updated in this audit)
- **Bug-hunt:** `_bmad-output/implementation-artifacts/bug-hunt-epic-5-story-5-5-interleaved-pills.md`
- **Architecture:** `_bmad-output/planning-artifacts/architecture.md` (NFR-S1–S4, P1–P5, R1–R4, O1 at lines 46–56, 90–93)
- **Project context:** `_bmad-output/project-context.md` (test-seam parity rule at line 138; `Json?` cast convention at line 180)

---

**Generated:** 2026-07-13
**Workflow:** testarch-nfr (sequential mode, subagent fallback)
**Evaluator:** Murat (autonomous run; no human checkpoint; quick-win fixes applied and verified by `yarn nx test web` / `yarn nx test agent-be` / `npx tsc --noEmit -p apps/web/tsconfig.json`)

<!-- Powered by BMAD-CORE™ -->
