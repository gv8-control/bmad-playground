# Open Issues

Consolidated register of all open issues surfaced by the Epic 5 Wave-1+2 closeout assessment (bug-hunt, traceability, NFR audit, deferred-work prune, retrospective) as of 2026-07-13. Supersedes individual artifact tracking where duplicated.

**Epic 5 status:** done (5/5 stories, 48/48 ACs FULL coverage, traceability gate PASS, NFR PASS-WITH-CONCERNS, 0 blockers).

**Test counts:** 1,201 total (894 web / 65 suites + 307 agent-be / 16 suites + 7 E2E), 0 skipped, 0 failed.

---

## 1. Medium Priority

### M1. `AgentServiceFake` diverges from production's `pendingClassifierPromises` pattern

- **Source:** Story 5.5 bug-hunt M3-new / NFR-5.5 Finding 2
- **Location:** `apps/agent-be/test/helpers/agent-service.fake.ts:186-203`
- **Detail:** The fake `await`s the working-tree-status check inline, blocking the event loop before the next scripted event. Production (`agent.service.ts:630-660`) fires it as a fire-and-forget promise pushed to `pendingClassifierPromises`, then `await Promise.allSettled(promises)` at end-of-turn. Timing-dependent bugs (e.g. `WORKING_TREE_DIRTY` emitted before a subsequent `TEXT_MESSAGE_*` delta) would pass fake-based tests but fail in production.
- **Fix:** ~20-line refactor of the fake's `runTurn` loop mirroring the production promise-queue pattern.
- **Test-plan ID:** P1-018
- **Retro action item:** #1
- **Sequencing:** Before Epic 6 starts (Epic 6's 6.2/6.3 will exercise the timing the fake currently masks)
- **Owner:** Amelia (Developer)

### M2. `turn.findMany` missing `take` limit

- **Source:** NFR-5.2-1 (pre-existing, surfaced by Story 5.2)
- **Location:** `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx:33-37`
- **Detail:** No `take` limit on the `turn.findMany` query. A conversation with thousands of turns would load all of them into memory.
- **Fix:** Add `take: 100` (or paginated equivalent).
- **Test-plan ID:** P3-002 (hardening bundle)
- **Sequencing:** Before Epic 6 starts
- **Owner:** Amelia (Developer)

### M3. `messages.map()` unbound rendering

- **Source:** NFR-5.3-2 (pre-existing, amplified by Story 5.5)
- **Location:** `apps/web/src/components/conversation/ChatMessageList.tsx:98-130`
- **Detail:** `messages.map()` renders all messages with no bound. Story 5.5 amplifies this slightly — multiple Markdown instances per agent message (one per text segment). Architectural fix requires `react-window` or equivalent virtualization.
- **Fix:** Message-list windowing / virtualization (1-2 day effort).
- **Sequencing:** Long-term; not Epic 6 blocking
- **Owner:** Amelia (Developer) — backlog

### M4. `repoConnection.findUnique` missing `select` projection

- **Source:** NFR-5.2-2 / NFR-5.4-1 (pre-existing)
- **Location:** `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:24-26` (and possibly other call sites)
- **Detail:** `repoConnection.findUnique` fetches all columns instead of selecting only the needed ones.
- **Fix:** Add `select: { id: true }` (or relevant fields).
- **Test-plan ID:** P3-002 (hardening bundle)
- **Sequencing:** Before Epic 6 starts
- **Owner:** Amelia (Developer)

---

## 2. Low Priority

### L1. `conversations/[conversationId]/loading.tsx` header drift

- **Source:** Prior bug-hunt L3 / NFR-5.2-3
- **Location:** `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/loading.tsx:4-6`
- **Detail:** Still uses the old header structure (`px-8 py-6`, no `border-b border-surface-raised`, no `flex items-center gap-3` wrapper, no `Breadcrumb`). Violates the canonical depth-1 page header pattern established in Story 5.2 (`project-context.md:109`).
- **Fix:** Update to match `page.tsx` header structure. Verify `<Breadcrumb />` is SSR-compatible inside `loading.tsx` first.
- **Test-plan ID:** P2-009
- **Sequencing:** Hardening story
- **Owner:** Amelia (Developer)

### L2. `no-scrollbar` panels lack keyboard scrollability

- **Source:** Prior bug-hunt L6 / NFR-5.4-4
- **Location:** `apps/web/src/components/shell/SideNavigation.tsx:42`, `apps/web/src/components/conversation/ChatMessageList.tsx:72`, `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:124`
- **Detail:** Story 5.4 AC-7 added the `no-scrollbar` utility class (hides visual scrollbar) to three scrollable panels, but none have `tabIndex={0}` or `role="region"` with an `aria-label`. Keyboard-only users cannot scroll these panels.
- **Fix:** Add `tabIndex={0}` and `role="region"` with descriptive `aria-label` to each panel.
- **Test-plan ID:** P3-002 (hardening bundle)
- **Sequencing:** Hardening story
- **Owner:** Amelia (Developer)

### L3. Index-based React keys for text segments

- **Source:** Story 5.5 bug-hunt L5-new
- **Location:** `apps/web/src/components/conversation/AgentMessage.tsx:99`
- **Detail:** `key={`text-${index}`}` for text segments. Anti-pattern — unstable when array is reordered or inserted mid-array. Currently inert because segments are append-only.
- **Fix:** Pre-assign a `crypto.randomUUID()` to each segment when created, or derive a composite key.
- **Test-plan ID:** P3-002 (hardening bundle)
- **Sequencing:** Hardening story
- **Owner:** Amelia (Developer)

### L4. `MANUAL_SAVE_SUCCEEDED/FAILED` handler duplication

- **Source:** Story 5.5 bug-hunt L6-new
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:543-693`
- **Detail:** ~150 lines of mostly-identical logic shared between the two handlers. Only differences: `status`, `semantic`, `errorMessage`. A future edit to one without the other risks behavioral divergence.
- **Fix:** Extract `buildManualSaveSegment` + `insertManualSaveSegment` helpers.
- **Test-plan ID:** P3-002 (hardening bundle)
- **Sequencing:** Hardening story
- **Owner:** Amelia (Developer)

### L5. `apps/web` lacks a `typecheck` nx target

- **Source:** Story 5.5 NFR audit Finding 5 (L7-new)
- **Location:** `apps/web/project.json` (missing target)
- **Detail:** `apps/agent-be/project.json` has a `typecheck` target; `apps/web` does not. TS narrowing errors pass `yarn nx test web` (jest/babel) and `yarn nx lint web` (eslint) silently — only `npx tsc --noEmit` surfaces them. The M2-new fix introduced a TS narrowing bug that shipped undetected until the NFR audit ran `tsc` directly.
- **Fix:** Add `{ "executor": "@nx/js:tsc", "options": { "tsConfig": "apps/web/tsconfig.json" } }` to `apps/web/project.json`. Wire into CI pre-merge workflow.
- **Test-plan ID:** P1-020
- **Retro action item:** #2
- **Sequencing:** Parallel with hardening story
- **Owner:** Amelia (Developer)

### L6. False-green ChatInput AC-4 disabled-state test

- **Source:** Prior bug-hunt L1
- **Location:** `apps/web/src/components/conversation/ChatInput.test.tsx:224-241`
- **Detail:** Test asserts `className.toContain('bg-text-3')` which passes whether the class is `disabled:bg-text-3` (correct) or `bg-text-3` (regression — always applied). Cannot distinguish the `disabled:` variant from unconditional application.
- **Fix:** Add a positive assertion that the enabled Send button does NOT contain `bg-text-3`. Optionally assert `disabled:` prefix is present.
- **Test-plan ID:** P1-017
- **Sequencing:** Hardening story
- **Owner:** Amelia (Developer)

### L7. `SlashCommandPicker` header `role="presentation"` inside `role="listbox"`

- **Source:** Prior bug-hunt L8
- **Location:** `apps/web/src/components/conversation/SlashCommandPicker.tsx:37`
- **Detail:** A `role="presentation"` div is a non-permitted child of `role="listbox"` (which only permits `role="option"` and `role="group"` children). Theoretical ARIA violation — screen readers that honor `role="presentation"` will not see the header.
- **Fix:** Restructure the picker so the header is a sibling of (not a child of) the `role="listbox"` element, or document as an accepted deviation.
- **Sequencing:** Low priority; no behavioral impact today
- **Owner:** Amelia (Developer)

### L8. `QuotaExceededError` silently swallowed in `useDraftPersistence`

- **Source:** NFR-5.3-5
- **Location:** `apps/web/src/components/conversation/useDraftPersistence.ts`
- **Detail:** `localStorage.setItem` can throw `QuotaExceededError` when storage is full. The error is swallowed silently with no user feedback. A `MAX_DRAFT_SIZE` guard was added (10,000 chars) but the silent-swallow pattern remains.
- **Fix:** Surface a user-facing message when `QuotaExceededError` occurs.
- **Test-plan ID:** P3-002 (hardening bundle)
- **Sequencing:** Hardening story
- **Owner:** Amelia (Developer)

### L9. 5.3 AC-5 branded placeholder not wired up

- **Source:** Traceability weakness #2 (2026-07-12)
- **Location:** `apps/web/src/components/conversation/ChatInput.tsx` / `ConversationPane.tsx`
- **Detail:** Story 5.3 AC-5 specifies two placeholder states: "Message..." (active) and "Message bmad-easy..." (branded). The implementation defaults to "Message..." but the parent component never passes the branded variant on the new-conversation surface. Deferred per DP-5.
- **Fix:** Wire the branded placeholder in the `conversations/new` page.
- **Sequencing:** Low priority; deferred DP-5
- **Owner:** Amelia (Developer)

---

## 3. Process and Infrastructure

### P1. Elevate `react-hooks/exhaustive-deps` ESLint rule from `warn` to `error`

- **Source:** 2026-07-12 retro Action Item #5 (STILL NOT DONE)
- **Location:** `apps/web/eslint.config.mjs`
- **Detail:** The Story 5.3 AC-3 auto-scroll regression (now FIXED) would have been caught by this rule at `error` level. The structural safeguard for catching future "missing dep" regressions at lint time is still missing.
- **Fix:** One-line addition to the eslint config rules block.
- **Retro action item:** #4
- **Sequencing:** Parallel with hardening story
- **Owner:** Amelia (Developer)

### P2. Pattern-establishment all-files map at story-creation time

- **Source:** 2026-07-12 retro team agreement (NOT applied as a process change)
- **Detail:** Pattern establishment (canonical headers, `no-scrollbar` utility, design-system tokens) needs an explicit all-files map at story-creation time and a completion audit, not case-by-case review. The `conversations/[conversationId]/loading.tsx` canonical header miss (L1 above) is the standing evidence of this gap.
- **Fix:** Every story establishing/modifying a pattern must include an all-files matching-pattern map in its spec; the dev must audit completion against that map at review time.
- **Retro action item:** #6
- **Sequencing:** Applies to all stories going forward
- **Owner:** Murat (Master Test Architect) for ATDD checklist step; story creator for the all-files map

### P3. Story 5.2 missing test-review-validation report

- **Source:** NFR epic report Evidence Gap 1
- **Detail:** Stories 5.1, 5.3, 5.4, 5.5 all have test-review-validation reports. Story 5.2 does not.
- **Fix:** Run `bmad-testarch-test-review` against the Story 5.2 test files.
- **Sequencing:** Low priority
- **Owner:** Murat (Master Test Architect)

### P4. `withArtifacts` Playwright fixture broken

- **Source:** Fidelity audit Finding 3 (INFO)
- **Detail:** `withArtifacts` Playwright fixture breaks on unique-constraint violations on `[repoConnectionId, path]`. Story 5.4 E2E for AC-1 (ArtifactCard hover border) and AC-5 (ArtifactListEntry hover) were removed and reduced to className-only unit tests.
- **Fix:** Fix unique-constraint violations in the fixture; restore E2E blocks.
- **Test-plan ID:** P2-008
- **Sequencing:** Low priority (className unit tests are a holding pattern)
- **Owner:** Dana (QA Engineer)

### P5. Auto-scroll regression E2E test

- **Source:** 2026-07-12 retro Tech Debt #2
- **Detail:** The auto-scroll fix (M1) landed but no regression E2E test was added. A Playwright spec asserting Retry button visibility on `SESSION_TIMEOUT` while scrolled up should be added.
- **Fix:** New Playwright spec.
- **Sequencing:** Low priority (fix landed; test is defense-in-depth)
- **Owner:** Dana (QA Engineer)

### P6. M2-new regression test (out-of-order TOOL_CALL_RESULT → TOOL_CALL_END)

- **Source:** Story 5.5 bug-hunt M2-new (fix applied, test pending)
- **Detail:** The `TOOL_CALL_END` status-overwrite fix landed (preserve `'error'` state). No regression test exists for the out-of-order case.
- **Fix:** Emit `TOOL_CALL_RESULT` (with `isError: true`) before `TOOL_CALL_END` and assert segment status remains `'error'`.
- **Test-plan ID:** P1-019
- **Sequencing:** Hardening story
- **Owner:** Amelia (Developer)

---

## 4. Carry-Forward from SDK Fidelity Retro

### CF1. Open-concerns registry scan script

- **Source:** SDK fidelity retro Action Item 1
- **Detail:** No scan script exists to detect `^Status: Open` lines in `docs/*.md`. The cross-epic open-concern problem is not addressed by the Wave-1+2 closeout (which is an epic-boundary instrument).
- **Sequencing:** Not Epic 6 blocking; closes a known gap
- **Owner:** Mary / Amelia

### CF2. CI test-source-classification reporter

- **Source:** SDK fidelity retro Action Item 4
- **Detail:** No CI-level three-count reporter (real-contract / fabricated-fixture / internal-only) for test classification. The fidelity audit instrument is built; the CI reporter is not.
- **Sequencing:** Not Epic 6 blocking
- **Owner:** Murat / Amelia

### CF3. `SandboxService` (Daytona SDK) fabricated-fidelity pattern audit

- **Source:** SDK fidelity retro TD-3
- **Detail:** `SandboxService` (Daytona SDK contract) has not been audited for fabricated-fixture patterns. Wave-1 fidelity audit reviewed `ArtifactViewer.components` and `RepositoryUrlForm` but not `SandboxService`.
- **Sequencing:** Not Epic 6 blocking
- **Owner:** Murat

### CF4. Replace `MockEventSource` fabricated event shapes with recorded-session replay fixture

- **Source:** SDK fidelity retro Recommendation 2 + 2026-07-12 retro preparation task
- **Detail:** `ConversationPane.test.tsx` drives `MockEventSource` with fabricated event shapes. Should be replaced with the recorded-session replay fixture (`apps/agent-be/test/fixtures/sdk-session-replay.jsonl`) once the JSONL replay fixture surfaces for the sandbox-execution migration.
- **Sequencing:** During Epic 6 (when Story 6.2/6.3 creates the fixture)
- **Owner:** Murat for testing pattern; Amelia for test files

---

## 5. Deferred-Work Items (Epic 5 scope, still open in `deferred-work.md`)

These are pre-existing findings in files touched by Epic 5 that were explicitly deferred per DP-5 (scope temptation). They are tracked in detail in `_bmad-output/implementation-artifacts/deferred-work.md`.

### DW1. `Date.now()`-based message IDs (partial)

- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx`
- **Detail:** Story 5.5 replaced `tc-${Date.now()}` and `manual-save-${Date.now()}` with `crypto.randomUUID()` (via `safeUUID()` helper). The remaining 4 patterns (`msg-`, `error-`, `stream-error-`, `user-`) still use `Date.now()`. Can collide when two SSE events land in the same millisecond, causing duplicate React keys.
- **Status:** Partially resolved; broader fix deferred per DP-5.

### DW2. Replay dedup for non-tool-call event handlers (partial)

- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx`
- **Detail:** Story 5.5 added replay dedup for `TOOL_CALL_START` tool-call segments (via `toolCallId` existence check). All other event handlers (`TEXT_MESSAGE_START`, `MANUAL_SAVE_*`, etc.) still append without dedup on EventSource reconnect.
- **Status:** Partially resolved; comprehensive fix deferred.

### DW3. `EventSource.onerror` doesn't close source

- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:761`
- **Detail:** `EventSource` auto-reconnects; state diverges from reality if reconnect succeeds. No `eventSource.close()` call.

### DW4. Boundary JWT in SSE URL query string

- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:190`
- **Detail:** `?token=${boundaryJwt}` logged by proxies/CDNs. SSE doesn't support custom headers via native `EventSource`; short-lived single-use ticket would be the proper fix.

### DW5. Stale-closure `useEffect` with empty deps

- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:92`
- **Detail:** `startSession` closes over initial `boundaryJwt`/`apiUrl`/`initialConversationId`; effect won't re-run if they change.

### DW6. `TOOL_CALL_RESULT` error detection uses brittle string regex

- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:420-425`
- **Detail:** Regex patterns (`/^error:/im`, `/Command exited with code [1-9]/`, `/failed to push/i`) will falsely mark legitimate tool output containing those strings as errored.

### DW7. `ChatMessage.createdAt` typed as `Date` but may arrive as ISO string

- **Location:** `apps/web/src/components/conversation/types.ts:9`, `AgentMessage.tsx`, `UserMessage.tsx`
- **Detail:** Produces "Invalid Date" in `Intl.DateTimeFormat.format()` when the value arrives as an ISO string from JSON serialization across the server-to-client boundary.

### DW8. Multiple `role="status"` live regions

- **Location:** `apps/web/src/components/conversation/ChatMessageList.tsx:102`
- **Detail:** Multiple system messages in a single render produce multiple `role="status"` live regions, causing repeated screen-reader announcements.

### DW9. `role="alert"` inside `role="log"` conflicting live regions

- **Location:** `apps/web/src/components/conversation/ChatMessageList.tsx:73,109`
- **Detail:** The error message `<p role="alert">` (assertive) is nested inside the container with `role="log"` + `aria-live="polite"`. Theoretical concern; requires screen-reader testing to confirm.

### DW10. `tsconfig.tsbuildinfo` in version control

- **Location:** `apps/web/tsconfig.tsbuildinfo`
- **Detail:** Build artifact in version control. Changes on every build, creates diff noise. Should be `.gitignore`d.

### DW11. AgentMessage markdown links lack `target="_blank"` / `rel="noopener noreferrer"`

- **Location:** `apps/web/src/components/conversation/AgentMessage.tsx`
- **Detail:** External links open in same tab with no tabnabbing protection. Pre-existing; same pattern as `ArtifactViewer` (deferred from Story 5.3).

### DW12. Empty state flash between spinner disappearing and message appearing

- **Location:** `apps/web/src/components/conversation/ChatMessageList.tsx:80`
- **Detail:** When `SESSION_READY` fires and `showSpinner` becomes false, there is a brief render frame where `messages.length` is still 0, showing the empty state before the user message appears.

### DW13. Story 5.5: Tool calls via SDK assistant message path never reach segments

- **Location:** `apps/agent-be/src/streaming/agent.service.ts:processAssistantMessage`
- **Detail:** `processAssistantMessage` registers tool_use in `activeToolCalls` map but doesn't push a `{ type: 'tool_call' }` segment. If the SDK delivers tool_use via assistant message snapshots (not streaming events), the tool call is not captured in segments.

### DW14. Story 5.5: Turn not persisted on RUN_ERROR / circuit-breaker / non-abort exception

- **Location:** `apps/agent-be/src/streaming/agent.service.ts:189-227`
- **Detail:** `prisma.turn.create` is inside the try block; the catch block only emits RUN_ERROR. All streamed segments and accumulated text are lost. More impactful now that segments carry tool pills. Fix: persist in a `finally` block.

### DW15. Story 5.5: Multiple text content blocks create separate chat bubbles during streaming but persist as one Turn

- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:244-271`
- **Detail:** `TEXT_MESSAGE_START` creates a new ChatMessage per content block. The backend persists one Turn with all segments. On reload, `AgentMessage` renders all segments in one bubble. UI differs before vs after reload.

### DW16. Story 5.5: `TOOL_CALL_START` attaches to stale message when `streamingMessageIdRef` is null

- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:344-365`
- **Detail:** When `TOOL_CALL_START` arrives after `TEXT_MESSAGE_END` cleared the ref, the handler falls back to `findLastIndex((m) => m.role === 'assistant')`. If the last assistant message is from a previous turn, the tool pill is appended to the wrong message.

### DW17. Story 5.5: `RUN_FINISHED` clears `streamingMessageIdRef` without resetting `isStreaming` flags

- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:503-507`
- **Detail:** If `RUN_FINISHED` arrives without a preceding `TEXT_MESSAGE_END` (stream drop, agent emits only tool calls), the matched message's `isStreaming` flag stays `true`, causing the streaming cursor to blink indefinitely.

---

## Summary Table

| ID | Priority | Title | Source | Test-Plan | Owner | Epic 6 Blocking? |
|----|----------|-------|--------|-----------|-------|-------------------|
| M1 | Medium | AgentServiceFake diverges from pendingClassifierPromises | 5.5 bug-hunt M3-new | P1-018 | Amelia | Yes |
| M2 | Medium | turn.findMany missing take limit | NFR-5.2-1 | P3-002 | Amelia | Yes |
| M3 | Medium | messages.map() unbound rendering | NFR-5.3-2 | — | Amelia | No |
| M4 | Medium | repoConnection.findUnique missing select | NFR-5.2-2 | P3-002 | Amelia | Yes |
| L1 | Low | loading.tsx header drift | bug-hunt L3 | P2-009 | Amelia | No |
| L2 | Low | no-scrollbar panels lack keyboard scroll | bug-hunt L6 | P3-002 | Amelia | No |
| L3 | Low | Index-based React keys for text segments | 5.5 bug-hunt L5-new | P3-002 | Amelia | No |
| L4 | Low | Manual save handler duplication | 5.5 bug-hunt L6-new | P3-002 | Amelia | No |
| L5 | Low | web lacks typecheck nx target | NFR-5.5 Finding 5 | P1-020 | Amelia | Yes |
| L6 | Low | False-green ChatInput AC-4 test | bug-hunt L1 | P1-017 | Amelia | No |
| L7 | Low | SlashCommandPicker role=presentation | bug-hunt L8 | — | Amelia | No |
| L8 | Low | QuotaExceededError silent swallow | NFR-5.3-5 | P3-002 | Amelia | No |
| L9 | Low | 5.3 AC-5 branded placeholder not wired | Traceability #2 | — | Amelia | No |
| P1 | Process | ESLint exhaustive-deps elevation | Retro #5 | — | Amelia | No |
| P2 | Process | Pattern-establishment all-files map | Retro #6 | — | Murat | No |
| P3 | Process | Story 5.2 missing test-review report | NFR Evidence Gap 1 | — | Murat | No |
| P4 | Process | withArtifacts Playwright fixture broken | Fidelity audit | P2-008 | Dana | No |
| P5 | Process | Auto-scroll regression E2E test | Retro TD #2 | — | Dana | No |
| P6 | Process | M2-new regression test | 5.5 bug-hunt | P1-019 | Amelia | No |
| CF1 | Carry-fwd | Open-concerns registry scan script | SDK retro #1 | — | Mary/Amelia | No |
| CF2 | Carry-fwd | CI test-source-classification reporter | SDK retro #4 | — | Murat/Amelia | No |
| CF3 | Carry-fwd | SandboxService fidelity audit | SDK retro TD-3 | — | Murat | No |
| CF4 | Carry-fwd | Replace MockEventSource with replay fixture | SDK retro Rec 2 | — | Murat/Amelia | During Epic 6 |
| DW1-DW17 | Deferred | Various pre-existing / Story 5.5 deferred items | deferred-work.md | — | Various | No |

---

## Recommended Pre-Epic-6 Hardening Story

Bundle these items into a single PR before Epic 6 starts:

1. M1 — AgentServiceFake pendingClassifierPromises mirror (~20 lines)
2. M2 — `turn.findMany` take limit (1 line)
3. M4 — `repoConnection.findUnique` select projection (1 line)
4. L1 — `conversations/[conversationId]/loading.tsx` canonical header
5. L2 — `tabIndex={0}` + `role="region"` on 3 no-scrollbar panels
6. L3 — Stable React keys for text segments
7. L4 — Extract `buildManualSaveSegment` helper
8. L5 — Add `typecheck` nx target for `apps/web`
9. P1 — Elevate `react-hooks/exhaustive-deps` to `error`
10. P6 — M2-new regression test

**Estimated effort:** ~1.5-2 hours total.
