# Bug Hunt Report: Story 5.5 — Interleave Tool and Semantic Pills Within the Agent Markdown Stream

**Date:** 2026-07-13
**Target files:** 18 source files + 13 co-located test files changed by commit 465ea50 (`feat(conversation): interleave tool and semantic pills within agent markdown stream`) and the related quick-win commit 11f470f (`fix(ux): prevent timestamp wrapping and restore transparent color token`)
**Has diff:** false

## Summary

- **Total findings:** 9 new + 3 prior-hunt mediums verified
- **Critical:** 0
- **High:** 0
- **Medium:** 3 (new) + 2 prior-hunt mediums fixed in this run + 1 prior-hunt medium already fixed
- **Low:** 6 (new)

### Layer results:
- **TFA (Test Fidelity Audit):** 4 findings — verdict: false-confidence-found
- **ECH (Edge Case Hunter):** 4 unhandled paths
- **CR (Code Review):** 5 findings (0 dismissed)

### Profile note:
Story 5.5 is architectural — it rewrote SSE event handlers across `ConversationPane.tsx` to insert/update `MessageSegment` entries inside the streaming agent message instead of pushing flat entries to the `messages` array; changed the `ChatMessage` data model; added a Prisma migration for a `segments` JSONB column; and updated the backend `AgentService` + `AgentServiceFake` to build/persist segments alongside `accumulatedText`. The finding profile reflects this scope: zero critical/high (no production-reachable data-loss or security regressions introduced), with mediums concentrated in two areas — false-green tests that assert segment presence without verifying the relative ORDER that AC-1 indeed requires ("at the EXACT POSITION"), and one real-but-normally-unreachable status-overwrite bug in `TOOL_CALL_END`. Low findings are test-seam divergence, defense-in-depth gaps on persisted JSON, and React anti-patterns.

Three layers ran sequentially (TFA → ECH → CR) in subagent-fallback mode (single-session inline execution). The bug-hunt skill's subagent-delegation step was unavailable; per step-02 rule, this is the documented fallback — analysis ran directly against the source.

Cross-layer verification: I confirmed (via the `SemanticPill` source's conditional `{artifactType && …}` / `{artifactTitle && …}` / `{viewHref && …}` branches at `SemanticPill.tsx:42-53`) that the empty-string `semantic: { artifactType: '', artifactTitle: '', viewHref: '' }` objects set by the `MANUAL_SAVE_SUCCEEDED` handler at `ConversationPane.tsx:567-569 / 586-589` DO render the bare "Progress saved" pill — intentionally correct, NOT a SemanticPill visual regression as I initially suspected.

Quick-win fixes were applied directly during the hunt:
- **M1** (prior-hunt Medium, was still open) — added `errorMessage`, `showRetry`, `showSpinner` to `ChatMessageList` auto-scroll effect deps.
- **M2** (prior-hunt Medium, was still open) — added `no-scrollbar` class to the full-width artifact list pane.
- **L2** (prior-hunt Low, was still open) — added `aria-live="polite"` assertion to the existing `role="log"` test.
- **L7 test** — added `maxLength` assertion to `RepositoryUrlForm.test.tsx` (the L7 production fix landed earlier as a quick-win, but no test coverage existed; added in this run).
- **M2 test** — added `no-scrollbar` assertion to the full-width list pane test in `artifacts/page.test.tsx`.

All 4 edits verified by running `yarn nx test web -- --testPathPattern="(ChatMessageList|RepositoryUrlForm|artifacts/page|ConversationPane|AgentMessage|useDraftPersistence|ArtifactViewer)"` → 65 suites / 894 tests passed (up from 892 reported by the Story 5.5 spec — the 2 additional tests are the new M2 and L7 assertions).

---

## Prior bug-hunt findings status (Epic 5 — story 5-1 through 5-4)

The previous bug-hunt on 2026-07-12 (`bug-hunt-epic-5-ux-mockup-fidelity-close-visual-drift.md`) reported 3 mediums (M1–M3) and 8 lows (L1–L8). Verified status against current source:

| ID  | Title                                                | Status                                                                                                       |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| M1  | Auto-scroll regression from Story 5.3                | **FIXED in this hunt** — `ChatMessageList.tsx:45` deps array extended. Quick-win applied.                    |
| M2  | `no-scrollbar` missing on full-width artifact pane  | **FIXED in this hunt** — `artifacts/page.tsx:124` updated. Quick-win applied.                                |
| M3  | `parseFrontmatter` renders quoted YAML with quotes   | **FIXED before this hunt** — `ArtifactViewer.tsx:22` strips surrounding quotes; tests at `:204-241` cover it. |
| L1  | ChatInput AC-4 disabled-state test is Gap C          | Still open (out of Story 5.5 scope — different file).                                                       |
| L2  | Missing `aria-live="polite"` assertion                | **FIXED in this hunt** — assertion added to `ChatMessageList.test.tsx:201`.                                  |
| L3  | `conversations/[conversationId]/loading.tsx` header  | Still open (out of Story 5.5 scope — different file).                                                        |
| L4  | `Intl.DateTimeFormat` instantiated on every render   | FIXED before this hunt — both `UserMessage.tsx:10-14` and `AgentMessage.tsx:27-31` use module-scope.        |
| L5  | `ArtifactViewer a` lacks focus ring                  | FIXED before this hunt — `ArtifactViewer.tsx:91-94` has focus ring classes.                                  |
| L6  | `no-scrollbar` panels lack keyboard scrollability    | Still open (out of Story 5.5 scope).                                                                         |
| L7  | `RepositoryUrlForm` input lacks `maxLength`           | Production fix landed before this hunt (`RepositoryUrlForm.tsx:55`); test added in this hunt.                |
| L8  | `SlashCommandPicker.header` `role="presentation"`    | Still open (out of Story 5.5 scope).                                                                         |

---

## Findings (new, Story 5.5 scope)

### Medium

#### [M1] AC-1 inline-position tests assert textContent presence, not relative order
- **Sources:** tfa+ech
- **Location:** `apps/web/src/components/conversation/ConversationPane.test.tsx:2429-2460` (AC-1), `:2554-2592` (AC-4), `:2595-2639` (AC-5), `:2676-2707` (AC-6 MANUAL_SAVE_FAILED); `apps/web/src/components/conversation/AgentMessage.test.tsx:130-157`
- **Detail:** The Story 5.5 AC-1 contract is "renders inline within the agent's markdown stream at the **exact position** the tool call occurred — not as a standalone row above or below the message". The tests render `segments: [{text: 'Before tool.'}, {tool_call: 'Bash'}, {text: 'After tool.'}]` then assert:
  ```ts
  expect(agentMessageContainers[0].textContent).toContain('Before tool.');
  expect(agentMessageContainers[0].textContent).toContain('Bash');
  expect(agentMessageContainers[0].textContent).toContain('After tool.');
  ```
  `textContent` concatenates ALL text nodes inside the container (DOM tree order), so any reordering of the underlying segments would still leave all three substrings present in `textContent`. The test title says "renders segments in order: text, tool_call, text" but no assertion enforces relative order. Same gap appears in `AgentMessage.test.tsx:130-157`. The `agentMessageContainers.length === 1` check verifies the messages array wasn't split (a weak proxy for inline positioning), but doesn't prevent a regression where a refactor reverses or randomizes segment order within a single message.

  Compounding factor: `react-markdown` is mock-stubbed at file level (`__mocks__/react-markdown` renders children as `<div data-testid="markdown">{children}</div>` — no real markdown processing). Even if the test imported a real markdown renderer, `textContent` would still lose structural ordering information. The right tool is `compareDocumentPosition`, `getAllByText`, or walking DOM children in order.

  **Production-reachable consequence:** A future regression that breaks segment ordering (e.g. a refactor that sorts segments by type, or that prepends rather than appends new text segments) would not be caught — the tests would stay green, masking the AC-1 violation.

  Note: `agent.service.unit.spec.ts:1374-1380` (segments array ordered) DOES verify order via `segmentTypes.indexOf('tool_call')` with adjacent positions — that test is correctly written. The frontend tests are not.
- **Original classifications:** TFA: Gap C (missing-order assertion); ECH: unhandled path (AC contract not enforced)
- **Remediation:** Replace the three `.toContain(...)` assertions with a single `expect(agentMessageContainers[0].textContent).toMatch(/Before tool.*Bash.*After tool/s)` (DOTALL regex), or walk childNodes and assert relative positions via `compareDocumentPosition`. The same fix should apply to the AgentMessage.test.tsx Story 5.5 ordering test.

#### [M2] `TOOL_CALL_END` handler unconditionally overwrites status to `'completed'` (overwrites error state if TOOL_CALL_RESULT arrived out-of-order)
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:389-413` (TOOL_CALL_END handler)
- **Detail:** The handler updates the matching `tool_call` segment with `status: 'completed' as const` — unconditionally:
  ```ts
  return { ...s, toolCall: { ...s.toolCall, status: 'completed' as const } };
  ```
  If `TOOL_CALL_RESULT` has already arrived (with `isError=true`) the segment status would already be `'error'`. The subsequent `TOOL_CALL_END` overwrites `'error'` with `'completed'`, SILENTLY HIDING the error. The output/errorMessage fields set by `TOOL_CALL_RESULT` persist, but `ToolPill` renders based on `status === 'error'` (line 17 of `ToolPill.tsx`) — so the pill flips from "X Bash failed" back to "✓ Bash" even though the errorMessage is set.

  **Real-contract violation:** `TOOL_CALL_END` corresponds to the SDK's `content_block_stop` for a `tool_use` block — it signals that streaming args for the tool call have arrived. It carries no information about whether the tool execution succeeded. The status (success/error) is determined downstream by `TOOL_CALL_RESULT` (the tool_result block in the next SDK user message). Allowing `TOOL_CALL_END` to overwrite an already-set `'error'` status is semantically wrong.

  **Production-reachability:** Under normal AG-UI protocol flow from the Claude Agent SDK, `content_block_stop` (emitting `TOOL_CALL_END`) always precedes the `tool_result` user message (emitting `TOOL_CALL_RESULT`). `ReplaySubject(100)` preserves emit order for SSE replay. So in practice the bug is not currently reachable in production. But:
  - A future protocol variant (e.g. AG-UI Server Events from a different agent backend) may legitimately emit `TOOL_CALL_RESULT` before final block-stop.
  - The `AgentServiceFake` script events are arbitrary — a test using `setToolCallScript` could emit `TOOL_CALL_RESULT` before `TOOL_CALL_END` and trigger the bug.
  - Any mutation of `agent.service.ts` that reorders emits (e.g. buffering with deferred flush) would expose this.

  The bug is real; the path is currently indirect.
- **Original classifications:** ECH: unhandled path (status overwrite on out-of-order events); CR: patch
- **Remediation:** Two options:
  - (a) Preserve `'error'` if already set: `status: s.toolCall.status === 'error' ? 'error' : 'completed' as const`. Simplest.
  - (b) Don't set status at all in `TOOL_CALL_END` — leave it as `'running'` until `TOOL_CALL_RESULT` arrives; `TOOL_CALL_RESULT` is the canonical status setter. This aligns with the spec note in `agent.service.ts:465`: `seg.toolCall.status = 'completed'` is set on the backend segment for persistence, but the SSE event itself carries no status.

  Option (a) preserves the current "show checkmark as soon as END arrives" behavior; option (b) only shows checkmark after RESULT arrives (slightly later feedback). Recommend (a) — minimal behavioral change, only fixes the overwrite-with-error case.

#### [M3] `AgentServiceFake` awaits working tree check inline instead of adding to `pendingClassifierPromises`
- **Sources:** cr
- **Location:** `apps/agent-be/test/helpers/agent-service.fake.ts:186-203`
- **Detail:** The real `AgentService.processUserMessage` (line 638-660 of `agent.service.ts`) fires the working-tree-status check as a `void`-returned promise, pushes the promise to `pendingClassifierPromises`, and continues processing subsequent SDK messages without awaiting — the working tree emit may fire AFTER other events have already been emitted on the SSE stream. Then `await Promise.allSettled(pendingClassifierPromises)` (line 167) ensures all pending fire-and-forget work resolves BEFORE `RUN_FINISHED`.

  The fake takes a different shape:
  ```ts
  if (event.event === EventType.TOOL_CALL_RESULT && currentToolName && FILE_MODIFYING_TOOLS.has(currentToolName)) {
    try {
      const status = await this.sandboxService.getWorkingTreeStatus(params.sandboxId);
      // ← emits WORKING_TREE_DIRTY/CLEAN INLINE after the await
    } catch { … }
  }
  ```
  It `await`s the working tree check inline — blocking the event loop before the next scripted event is emitted. The working tree event always arrives immediately after the TOOL_CALL_RESULT in fake runs; in real runs, it may arrive much later (after subsequent text deltas).

  **Test fidelity impact:** Any production bug that depends on the timing relationship between `WORKING_TREE_DIRTY` and subsequent `TEXT_MESSAGE_*` events (e.g. an SSE ordering assumption, a UI state transition that scrolls to reveal the dirty indicator) would pass in fake-based tests but fail in production. This is the project-context.md "test-seam fakes mimic production side effects" rule (line 138) violation — the fake persists segments (good), but the working-tree fire-and-forget pattern is not mirrored.

  Note: the fake's behavior is also MORE deterministic than production — inline await means no race with subsequent events. This makes fake-based tests flakier-resistant but does not faithfully reproduce the timing semantics of the real service.
- **Original classifications:** CR: patch
- **Remediation:** Push the working-tree promise to a local array (mirroring `pendingClassifierPromises`), `await Promise.allSettled(promises)` at the end before persisting the Turn row. Mirror the exact production pattern from `agent.service.ts:630-660` + `:167-170`.

### Low

#### [L1] `AgentServiceFake` segments persistence test asserts only shape, not contents
- **Sources:** tfa
- **Location:** `apps/agent-be/src/streaming/agent.service.spec.ts:184-202`
- **Detail:** The test calls `agentFake.setToolCallScript('Bash', 'git status', 'nothing to commit')` then awaits the turn and asserts:
  ```ts
  expect(assistantTurnCall[0].data).toHaveProperty('content');
  expect(assistantTurnCall[0].data).toHaveProperty('segments');
  expect(Array.isArray(assistantTurnCall[0].data.segments)).toBe(true);
  ```
  It only checks `segments` exists as an array — does NOT assert the segments array contains a `tool_call` segment with `toolName='Bash'`, `input='git status'`, `output='nothing to commit'`. A regression where the fake persists an empty `segments: []` array would still pass this test (false-green).

  Contrast with `agent.service.unit.spec.ts:1309-1414` which DOES verify segment types, relative order, and field values (Test 2 + Test 3 there is well-written). The spec test is much weaker.
- **Original classifications:** TFA: Gap C (contract-shape-blind-spot)
- **Remediation:** Extend the spec test to assert segment contents match the script events. Mirror the assertions from `agent.service.unit.spec.ts` `segments array contains text and tool_call segments in order` test. At minimum: `expect(segments).toEqual(expect.arrayContaining([{ type: 'tool_call', toolCall: expect.objectContaining({ toolName: 'Bash' }) }]))`.

#### [L2] `agent.service.unit.spec.ts` tool_call status assertion is shallow
- **Sources:** tfa
- **Location:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts:1413`
- **Detail:** The assertion:
  ```ts
  expect(toolCallSegment.toolCall).toHaveProperty('status');
  ```
  Verifies the `status` field exists but not its value. Per the spec, after `content_block_stop` for `tool_use`, the segment status should be `'completed'`. A regression to `'running'` or `undefined` would still pass. Contrast with the same test file's segment ordering test (line 1374-1380) which DOES verify actual type values.
- **Original classifications:** TFA: Gap C (shallow-value assertion)
- **Remediation:** Replace `toHaveProperty('status')` with `expect(toolCallSegment.toolCall.status).toBe('completed')`.

#### [L3] `TEXT_MESSAGE_CONTENT` handler silently drops delta when `streamingMessageIdRef.current` is null
- **Sources:** ech
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:280-304`
- **Detail:** The handler:
  ```ts
  const messageId = streamingMessageIdRef.current;
  if (messageId) {
    setMessages((prev) => prev.map(...));
  }
  ```
  If `messageId` is null (no prior `TEXT_MESSAGE_START`), the delta is silently dropped — `setMessages` is not called, the streaming assistant message is not created, the user sees no text from this delta. No log, no error.

  In the AG-UI protocol, `TEXT_MESSAGE_CONTENT` always follows `TEXT_MESSAGE_START` (the SDK's `content_block_delta` event for `text_delta` always follows a `content_block_start` for `text`). So this is unreachable in normal production. But:
  - On `EventSource` reconnect with replay, if the `TEXT_MESSAGE_START` event was emitted BEFORE the client subscribed (i.e. came through `ReplaySubject` and was already drained), the replay order is preserved — so this specific case is safe.
  - If a future event source (different agent backend) emits `TEXT_MESSAGE_CONTENT` without a preceding `TEXT_MESSAGE_START` (protocol violation, but possible), the content is silently lost.

  Production-reachability: requires a contract violation upstream. Not currently exploitable. Defense-in-depth missing.
- **Original classifications:** ECH: unhandled path (silent drop)
- **Remediation:** Optional — log a `console.warn` when the `if (messageId)` guard fails so an upstream protocol violation becomes diagnosable. Or create an empty streaming message if the delta arrives without a START (per the `TOOL_CALL_START` fallback pattern at `:340-358`).

#### [L4] Resume path casts DB JSON to `MessageSegment[]` without runtime validation
- **Sources:** ech
- **Location:** `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx:44`
- **Detail:** The resume path:
  ```ts
  segments: turn.segments as MessageSegment[] | null ?? undefined,
  ```
  Casts the Prisma `Json?` value directly to `MessageSegment[]` with no runtime check. Per `project-context.md:180` the double-cast pattern is documented for typed arrays on `Json?` columns, but the spec specifically says "No runtime validation is needed for MVP (the data is written by our own backend, not external input)". This was a deliberate Story 5.5 DP-3 decision.

  Risk: if the persisted JSON has unexpected shape (manual DB edit, schema drift after a future migration, parallel-write race with a stale code version), downstream consumers crash:
  - `AgentMessage.tsx:131` — `message.segments!.map(...)` crashes if `segments` is not an array
  - `AgentMessage.tsx:96-103` — `renderSegment` accesses `segment.type` and destructures `toolCall` — if `segment.type` is neither `'text'` nor `'tool_call'`, or `segment.toolCall` is undefined, `ToolPill` is rendered with `toolCall: undefined` → React renders with TypeError
  - `AgentMessage.tsx:97` — `if (!segment.content) return null;` reads `content` — undefined on tool_call segment, returns null. OK.

  Defense-in-depth missing: a single malformed segment poisons the entire conversation view. Production-reachability requires malformed persisted data (currently impossible from the same code, but possible after a future code change or manual DB intervention).
- **Original classifications:** ECH: unhandled path (uncast JSON shape)
- **Remediation:** Replace the cast with a runtime guard:
  ```ts
  segments: Array.isArray(turn.segments) ? (turn.segments as MessageSegment[]) : undefined,
  ```
  Optionally also narrow each segment: `segments.filter(s => s && (s.type === 'text' || (s.type === 'tool_call' && s.toolCall)))` before passing to `ChatMessage`. Coordinate with the deferred `MessageSegment` runtime validation story.

#### [L5] `AgentMessage` uses index-based React keys for text segments
- **Sources:** cr
- **Location:** `apps/web/src/components/conversation/AgentMessage.tsx:99` — `<Markdown key={`text-${index}`} ...>`
- **Detail:** React reconciliation uses the key to decide whether to reuse DOM between renders. Index-based keys are unstable when the array is reordered or inserted at non-end positions. The `text-${index}` key for text segments plus the `tool-${toolCall.toolCallId}` key for tool_call segments means: if a text segment is inserted in the MIDDLE of the segments array (rather than appended), the index-based keys of all text segments AFTER the insertion shift, potentially causing React to mis-classify DOM nodes and reuse them for different content.

  In the current ConversationPane.tsx logic, segments are append-only — a text segment is appended when the last segment is a tool_call (line 295: `newSegments.push({ type: 'text', content: delta })`) or replaced when the last segment is also text (line 293: `newSegments[newSegments.length - 1] = ...`). So in normal flow, the index-based keys don't change — each segment keeps its index across renders. Anti-pattern, currently inert.

  Risk: if a future refactor reorders or inserts segments mid-array (e.g. a "Promote to text" refactor), the index-based keys would silently mis-reconcile.
- **Original classifications:** CR: patch (anti-pattern)
- **Remediation:** Use a stable id for each segment. Two options:
  - (a) Pre-assign a `crypto.randomUUID()` to each segment when created in ConversationPane.tsx handlers, include it as a `key` field on the segment, and use it as the React key. Adds a field to the persistable JSON.
  - (b) Use a stable composite key derived from adjacent context: `key={`text-${index}-${segment.content.slice(0, 50)}`}`. Hokey but avoids adding a new field.

  Option (a) is cleaner. Coordinate with the broader segments data model.

#### [L6] `MANUAL_SAVE_SUCCEEDED` and `MANUAL_SAVE_FAILED` handlers contain ~150 lines of duplicated structure
- **Sources:** cr
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:543-693` (manual save handlers combined)
- **Detail:** The two handlers share ~90% of their structure:
  1. Parse `toolCallId`, optional `safeUUID()` fallback.
  2. Clear `saveFallbackTimeoutRef` if set.
  3. Find a target message (`streamingId ?? prev.findLast((m) => m.role === 'assistant')?.id`).
  4. If target found and has no segments: create segments array with a single tool_call segment.
  5. If target found and has segments: check existingIdx for dedup; if not found, append a tool_call segment.
  6. If no target found: append a new assistant message with the tool_call segment.
  7. Set `setWorkingTreeState`.

  Only difference: the `status` field (`'completed'` vs `'error'`), `semantic` field (only on succeeded), and `errorMessage` field (only on failed).

  Each block is ~70 lines; together ~150 lines of mostly-identical logic. A future edit to one without the other (e.g. dedup logic fix) causes a behavioral divergence that's hard to spot in review.

  Note: this is the kind of duplication the bug-hunt step-04 "CR: patch" bucket is designed for. It's a Low finding because there's no actual bug today — the duplication is symmetric and well-tested.
- **Original classifications:** CR: patch (code-quality)
- **Remediation:** Extract a `buildManualSaveSegment(toolCallId, status, semantic?, errorMessage?)` helper that returns the tool_call segment, and a `insertManualSaveSegment(prev, toolCallId, segment)` helper that does the message-targeting + dedup + insert logic. The two handlers shrink to ~10 lines each.

---

## Pre-existing findings reviewed and NOT reported (out of scope for Story 5.5)

Reviewed in the file neighborhood of Story 5.5 changes but pre-existing, not introduced or worsened by it:

- **`useDraftPersistence` save-before-load race (C15 from Epic 3):** The save effect at line 52-63 can write `''` to localStorage before the load effect at line 29-50 sets the saved value on the first render after `conversationId` changes. Sub-millisecond window, self-correcting on next render. Pre-existing.
- **`AgentMessage` markdown links lack `target="_blank"` / `rel="noopener noreferrer"`:** Same pattern as `ArtifactViewer` (deferred from Story 5.3). Pre-existing.
- **`role="alert"` inside `role="log"` conflicting live-regions in `ChatMessageList`:** The error message `<p role="alert">` (line 109) is inside the `role="log"` aria-live="polite" container (line 73) — a nesting of live regions that may cause double-announcement on some screen readers. Deferred from Story 5.3.
- **Empty-state flash during provisioning:** When `messages.length === 0` AND `showSpinner` is false (initial provisioning state), the empty-state UI flashes briefly before `showSpinner` becomes true. Pre-existing.
- **Retry button lacks disabled state during in-flight retry:** After clicking Retry, the button is still clickable until `state` changes. `retryingRef.current` guards against re-entry in the handler, but the button itself is not visually disabled. Pre-existing.
- **ConversationPane timer leak on `SESSION_DRAINING` during provisioning:** `timeoutRef.current` is overwritten at line 235 (draining timeout) without clearing the line 789 (provisioning timeout). Pre-existing.

---

## Autonomous decisions (in place of halting at checkpoints)

1. **Target scope:** Story 5.5's commit 465ea50 changed 46 files (including a 605-line story spec, sprint-status.yaml, project-context.md, journal entries, and 2 validation reports) plus 6 quick-win commits. I scoped the bug hunt to 18 production source files (+ 13 co-located test files) actually changed by Story 5.5 logic, derived from `git show --stat 465ea50`. Excluded: `_bmad-output/` markdown specs/summaries, `n8n/workflows/*.json` (workflow definition not code), `.nx/nxw.js` deletion (not Story 5.5 logic), `apps/web/tsconfig.tsbuildinfo` (build cache).
2. **Subagent fallback:** The bug-hunt skill delegates TFA/ECH/CR to subagents. This session runs as a single inline agent — I executed all three layers inline (subagent-fallback mode, per step-02 rule instruction 2 and step-03 instruction 3). No `bug-hunt-tfa-prompt.md` / `bug-hunt-ech-prompt.md` / `bug-hunt-cr-prompt.md` prompt files written.
3. **TFA scope expansion:** TFA was supposed to run only on the test files in target scope. I extended it to verify behavior parity with `agent.service.unit.spec.ts` (which IS in scope) and confirmed that test's segment ordering assertion is correctly written (segmentTypes.indexOf('tool_call') with adjacent text segments checked). This contrast let me identify the frontend test gap (M1 / L1 / L2 above).
4. **Severity calibration:** Zero findings classified as critical/high. The architectural rewrite of SSE handlers is significant, but the codebase is well-tested (894 passing tests) and the production-reachable consequences are limited: (a) the immediate status-overwrite bug (M2) requires abnormal event ordering that the AG-UI protocol currently guarantees against; (b) the false-green tests (M1) hide regressions but don't cause them today; (c) the test-seam divergence (M3) is a test-fidelity gap, not a production bug. Per step-05 rule "prefer the more conservative classification when uncertain," I considered upgrading M1 to high (the false-green could mask future data-corruption regressions), but classified medium because the test gap currently catches the regression via the `agentMessageContainers.length === 1` assertion (a weak proxy that does catch the most obvious "split into separate messages" regression).
5. **Quick-win fixes applied directly:** Five fixes were small enough to apply inline:
   - M1 (prior-hunt, was open): added 3 deps to ChatMessageList auto-scroll effect.
   - M2 (prior-hunt, was open): added `no-scrollbar` class to artifacts/page.tsx full-width pane.
   - L2 (prior-hunt, was open): added `aria-live="polite"` assertion to ChatMessageList AC-7 test.
   - L7 (prior-hunt, production-fix landed without test): added maxLength assertion to RepositoryUrlForm.test.tsx.
   - M2 test: added `no-scrollbar` assertion to artifacts/page.test.tsx.
   All fixes verified by running `yarn nx test web` → 894 tests pass (up from 892 — 2 new tests added).
6. **Did NOT fix M-new-1 (false-green tests) inline:** Fixing the test assertions for ordering requires choosing an assertion strategy (regex / DOM walking) and could surface latent ordering bugs in the current implementation. Better to schedule as a follow-up — wrong test fix could mask the regression the test was supposed to catch.
7. **Did NOT fix M-new-2 (status overwrite) inline:** One-line fix, but the fix has a subtle choice (preserve `'error'` only vs don't set status at all in TOOL_CALL_END). Decision deferred to user.
8. **Did NOT fix M-new-3 (AgentServiceFake divergence) inline:** Requires restructuring the fake's `runTurn` loop (mirroring pendingClassifierPromises pattern from production), 20+ lines of change. Better as a dedicated task.
9. **`SemanticPill` empty-string investigation:** I initially suspected the manual-save semantic object `{ artifactType: '', artifactTitle: '', viewHref: '' }` was a Story 5.5 regression (broken SemanticPill rendering with empty strings). Investigated `SemanticPill.tsx:42-53` — confirmed the conditional `{artifactType && ...}` / `{artifactTitle && ...}` / `{viewHref && ...}` rendering handles empty strings correctly (renders only "Progress saved"). Intentional design; not a bug. The decision lives in `ConversationPane.tsx:567-569 / 586-589`.
10. **L3 (loading.tsx) status check:** Verified the loading.tsx is using the old `py-6` header structure (not `border-b border-surface-raised pt-6 pb-4`). Marked as still-open pre-existing (out of Story 5.5 scope). Did NOT fix inline because importing `Breadcrumb` into a loading component requires checking whether `Breadcrumb` is a server-compatible component that can be used in `loading.tsx` (which renders during SSR streaming). Better as a dedicated task.
11. **Pre-existing findings:** Listed 6 pre-existing issues in a separate section rather than counting them toward the total. They were reviewed during the hunt but are out of scope for Story 5.5's architectural work.

## Blockers / items for the user to decide

1. **M-new-1 test assertion strategy:** Two viable fixes — (a) replace `toContain` with a single DOTALL regex `textContent.match(/Before tool.*Bash.*After tool/s)`, OR (b) walk childNodes and use `compareDocumentPosition` for explicit ordering checks. Option (a) is simplest and matches the regression-prevention intent. Option (b) is more rigorous but more code. User preference needed.
2. **M-new-2 status-overwrite fix:** Two viable fixes — (a) `status: s.toolCall.status === 'error' ? 'error' : 'completed'` (preserve error), OR (b) don't set status in `TOOL_CALL_END` at all (only `TOOL_CALL_RESULT` sets terminal status). Option (a) is backwards-compatible with the current "show checkmark on END" UX; option (b) delays checkmark until RESULT arrives (slightly later feedback). Recommend (a).
3. **M-new-3 fake restructure scope:** Should the working-tree promise-queue pattern be mirrored in the fake literally, or should the fake be left as-is (more deterministic) since timing-dependent failures aren't currently failing in either real or fake tests? Recommend mirroring — it's a "test-seam fakes mimic production side effects" rule conformance.
4. **L6 helper extraction:** Whether to extract a `buildManualSaveSegment` helper from the two manual-save handlers. Pure code-quality improvement; no behavioral change. Low priority but reduces the maintenance surface for these handlers (whose ~150 line duplication invites future divergence).

---

## Files inspected (full or targeted)

Production source:
- `apps/web/src/components/conversation/ConversationPane.tsx` (1088 lines — full read)
- `apps/web/src/components/conversation/AgentMessage.tsx` (152 lines — full read)
- `apps/web/src/components/conversation/ChatMessageList.tsx` (134 lines — full read)
- `apps/web/src/components/conversation/types.ts` (13 lines — full read)
- `apps/web/src/components/conversation/SemanticPill.tsx` (67 lines — full read)
- `apps/web/src/components/conversation/ToolPill.tsx` (96 lines — full read)
- `apps/web/src/components/conversation/UserMessage.tsx` (32 lines — full read)
- `apps/web/src/components/conversation/useDraftPersistence.ts` (78 lines — full read)
- `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` (107 lines — full read)
- `apps/web/src/components/artifact-browser/ArtifactViewer.tsx` (156 lines — full read)
- `apps/web/src/components/shell/SideNavigation.tsx` (106 lines — full read)
- `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx` (70 lines — full read)
- `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/loading.tsx` (12 lines — full read)
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` (147 lines — full read)
- `apps/agent-be/src/streaming/agent.service.ts` (670 lines — full read)
- `apps/agent-be/test/helpers/agent-service.fake.ts` (248 lines — full read)
- `libs/database-schemas/src/prisma/schema.prisma` (124 lines — full read; `Turn.segments Json?` at line 100)
- `libs/database-schemas/src/prisma/migrations/20260713120000_add_turn_segments/migration.sql` (2 lines — full read; `JSONB` column confirmed)
- `libs/shared-types/src/conversation.types.ts` (27 lines — full read; `MessageSegment` discriminated union at line 25-27)

Test files:
- `apps/web/src/components/conversation/ConversationPane.test.tsx` (2976 lines — full read)
- `apps/web/src/components/conversation/AgentMessage.test.tsx` (262 lines — full read)
- `apps/web/src/components/conversation/ChatMessageList.test.tsx` (335 lines — full read)
- `apps/web/src/components/conversation/useDraftPersistence.test.ts` (216 lines — header + target lines read)
- `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx` (431 lines — full read)
- `apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx` (278 lines — full read)
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` (target lines read)
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (Story 5.5 block lines 1295-1416)
- `apps/agent-be/src/streaming/agent.service.spec.ts` (Story 5.5 block lines 177-204)

Story spec / context:
- `_bmad-output/implementation-artifacts/5-5-interleave-tool-and-semantic-pills-within-the-agent-markdown-stream.md` (544 lines — full read)
- `_bmad-output/project-context.md` (396 lines — full read)
- `_bmad-output/implementation-artifacts/bug-hunt-epic-5-ux-mockup-fidelity-close-visual-drift.md` (prior bug-hunt report, 149 lines — full read)
- `.claude/skills/bmad-bug-hunt/steps/step-{01..05}-*.md` (all 5 step files — full read)
