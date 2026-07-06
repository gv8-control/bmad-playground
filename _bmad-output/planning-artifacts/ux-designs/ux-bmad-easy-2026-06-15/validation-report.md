# Validation Report — bmad-easy

- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md`
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md`
- **Run at:** 2026-07-05T18:30:00Z
- **Lens run:** Implementation drift only (rubric walker skipped — 2026-07-02 pass is recent and all findings applied; forward-looking coverage for backlog stories 3.8–3.12 is a separate lens, not run here)

## Overall verdict

The built UX is broadly faithful to the spines for the happy paths — streaming, tool pills, semantic pills, working-tree indicator, manual-save flow, credential/403 split, and the three audited 2026-07-04 spine sections (session-start timeout, working-tree `ⓘ` disclosure, circuit-breaker system message) all match. Risk concentrates in two areas: **client-side SSE/streaming resilience** (duplicate messages on reconnect, lost events, dead-end error states) and **the classifier's promotion contract** (modify-commits and multi-artifact-per-commit don't produce the Semantic Pill the spine states unconditionally).

One critical gap is a fully missing component — the scroll-to-bottom button — which the code wires up but never actually shows, contradicting the spine and Story 3.3 AC (UX-DR9) in normal use. The high-severity items (reconnect duplication, modify-commit promotion) are reachable on common BMAD iteration patterns and warrant fixes before Epic 3 closes.

## Lens verdict

- Implementation drift — **thin** (1 critical, 2 high, 7 medium, 12 low; happy paths faithful, drift concentrated in SSE resilience and classifier promotion)

## Findings by severity

### Critical (1)

**Implementation drift** — Scroll-to-bottom button never appears; new-message count never increments (EXPERIENCE.md › Scroll Behavior + `{components.scroll-to-bottom-button}`; Story 3.3 AC, UX-DR9)
`showScrollToBottom` is initialized `false` and `setShowScrollToBottom` is called in exactly one place — `handleScrollToBottom`, where it is set to `false`. It is never set `true`. `ChatMessageList` updates a local `isAtBottomRef` on scroll and auto-scrolls while at bottom, so auto-scroll *pause* works, but the list never notifies the parent that the user has scrolled away, so the button never shows and `newMessageCount` never increments. The `ScrollToBottomButton` is rendered but always receives `showScrollToBottom={false}`. A user who scrolls up during a long streaming response has no jump-back affordance and no "N new" count — directly contradicting the spine component and the Story 3.3 AC in normal use.
Fix: Code — call a parent callback from `ChatMessageList`'s scroll handler to set `showScrollToBottom` when not at bottom, and a `useEffect` on `messages` to increment `newMessageCount` while scrolled away. Spine: contradicted.

### High (2)

**Implementation drift** — Duplicate messages and tool pills on transient SSE reconnect (EXPERIENCE.md › Conversation Loading (Returning) + Component Patterns › Streaming Chat Messages)
`SessionEventsService.getEventStream` returns a `ReplaySubject(100)` keyed by `conversationId`. On a transient `EventSource` drop, the browser auto-reconnects (the `onerror` handler does not close the source), the SSE endpoint returns the same subject, and the last 100 buffered events replay. Every client handler appends to `messages` with no dedup, so replayed events render as duplicate messages/tokens/pills. Fallback IDs (`msg-${Date.now()}`) collide or regenerate across replays, compounding dupes.
Fix: Code — dedup by a stable event/message id in the client handlers, or clear the replay buffer once a stable connection is established. Spine: silent (coverage gap — "Reconnecting…" is about sandbox re-init, not SSE-transport reconnect event dedup).

**Implementation drift** — Agent `git commit` that modifies an existing `_bmad-output/` artifact produces no Semantic Pill (EXPERIENCE.md › Tool Pills and Semantic Pills + Story 3.4 AC-2)
`classifyToolResult` only promotes when `extractBmadArtifactPaths` returns ≥1 path. That extractor matches `create mode` lines and a diffMatch regex, but a plain `git commit -m "msg"` (the Claude Code agent's typical invocation) only lists `create mode` for *new* files — modified-but-existing files are not named in the commit stdout, so `bmadPaths` is empty and the call returns `null` (no promotion). The successful commit renders as a plain completed Tool Pill, never as "Progress saved · {type} · {title} · View". This contradicts the spine's unconditional wording on iteration commits — a core BMAD pattern (the agent writes to the same PRD/architecture file across multiple turns), so the first commit shows a Semantic Pill and every subsequent one does not. Borderline critical. The working-tree-clean signal still fires, so the user sees "All saved" — the missing piece is the Semantic Pill + its "View" link.
Fix: Code — run `git show --name-only HEAD` (or `git diff-tree --no-commit-id --name-only -r HEAD`) after a detected successful commit to enumerate changed BMAD paths, then promote. Spine: contradicted (for modify-commits).

### Medium (7)

**Implementation drift** — Working-tree indicator stuck in "Saving…" if `MANUAL_SAVE_SUCCEEDED` SSE event never arrives (EXPERIENCE.md › Working Tree Indicator › Save confirmation flow, step 3)
`handleSave` sets `saving`, and on `data.committed === true` does nothing client-side, leaving the transition to the SSE event. If that event is lost (dropped-events race, or a connection drop in the window between the save POST response and the event), the indicator stays on "Saving…" indefinitely.
Fix: Code — client-side timeout fallback re-querying working-tree state, or set `clean` after a grace period on `committed=true`. Spine: silent (no lost-event failure mode specified).

**Implementation drift** — `POST /resume` non-2xx not detected → UI stuck in "Reconnecting…" for full 30s (EXPERIENCE.md › Conversation Loading (Returning), step 3)
The `/resume` fetch in `startSession` has no `response.ok` check — only `.catch` for network errors. A 5xx resolves without throwing, so `state` stays `reconnecting` until the 30s client timeout fires the (false) "Starting your session is taking longer than expected." + Retry.
Fix: Code — check `response.ok` on `/resume` and surface an error state immediately. Spine: silent on resume HTTP errors.

**Implementation drift** — The "error" session state is a dead-end: input disabled, no action button (EXPERIENCE.md › Conversation Surface States — every error row pairs text with a button)
`inputDisabled` includes `state === 'error'`, but the Retry button renders only for `state === 'timeout'`. A `SESSION_ERROR`, a failed conversation-create POST, or a `/resume` network failure lands in `error` with an `errorMessage` paragraph but no Retry/Refresh affordance. The spine's established shape everywhere else is "error text + single action button."
Fix: Code — render the Retry button for `state === 'error'` as well, or add a Refresh action. Spine: silent on a terminal session-error distinct from the timeout.

**Implementation drift** — Circuit-breaker race: events emit after `RUN_ERROR`, so the system message is no longer at the stream-stop point (EXPERIENCE.md › Conversation Surface States › "Agent process terminated (circuit breaker)")
`handleCircuitBreaker` emits `RUN_ERROR` first, but pending classifier and working-tree promises and one more in-flight `iterator.next()` result can settle and emit `TOOL_CALL_PROMOTED` / `WORKING_TREE_DIRTY` / `TEXT_MESSAGE_*` *after* the system message. The client renders those after "The agent stopped unexpectedly," so the apparent stop point drifts downward and the working-tree indicator can flip after the termination notice.
Fix: Code — await/drop pending promises before emitting `RUN_ERROR`, or have the client ignore stream events after `RUN_ERROR`. Spine: contradicted (the stop point is not the stop point).

**Implementation drift** — False error-state Tool Pills: client-side string-regex error detection on tool output (EXPERIENCE.md › Tool Pills and Semantic Pills)
`TOOL_CALL_RESULT` marks a pill errored when `content` matches `/^error:/im`, `/Command exited with code [1-9]/`, or `/failed to push/i`. Legitimate tool output that *contains* those substrings — e.g. a successful `read` of a file mentioning "error:", or a code-review comment containing "failed to push" — renders as a red "✕ {toolName} failed" pill for a call that actually succeeded. Plausible in BMAD workflows that read logs/code.
Fix: Code — rely on the backend's tool_result error flag / classifier rather than client-side string matching on output content. Spine: contradicted (error styling for non-errors).

**Implementation drift** — Dropped SSE events before subscription can cause a false session-start timeout (EXPERIENCE.md › New Conversation / Session start timeout)
`emit()` silently no-ops when no `ReplaySubject` exists for the conversation; the subject is created lazily in `getEventStream`, which only runs when the SSE GET reaches the controller. `provisionSandbox` is fire-and-forgotten and emits `SESSION_READY`; `resumeConversation`'s fast path emits `SESSION_READY` synchronously-ish. If either fires before the client's `EventSource` GET is processed (narrow on a fast connection, realistic on a slow proxy), `SESSION_READY` is lost, state stays `provisioning`/`reconnecting`, and the user hits the 30s false "Starting your session is taking longer than expected." + Retry.
Fix: Code — create the `ReplaySubject` eagerly in `createConversation`/`resumeConversation` before firing the provisioner, or create-on-first-emit. Spine: silent (no dropped-event race specified).

**Implementation drift** — `TOOL_CALL_RESULT` for an untracked `tool_use_id` skips classification → 401/403 never detected (EXPERIENCE.md › Conversation Surface States › Credential failed / Access denied; Story 3.7 AC-1/AC-2)
In `processAssistantMessage`, `TOOL_CALL_RESULT` is emitted *before* the `toolCallInfo` lookup; if the lookup misses (a non-streamed `tool_use`), the classifier block is skipped entirely — so a 401/403 pattern sitting in such an untracked result never triggers `CREDENTIAL_FAILURE`/`ACCESS_DENIED`, defeating the whole point of Story 3.7's real-time alert.
Fix: Code — track `tool_use_id` on `content_block_start` before results arrive, or run a defensive classification pass on `TOOL_CALL_RESULT` when `toolCallInfo` is missing. Spine: contradicted (the alert contract is silently skipped for untracked tool_use).

### Low (12)

**Implementation drift** — `EventSource.onerror` doesn't close the source; state may diverge from auto-reconnecting stream (`ConversationPane.tsx:504-506`). Pre-`ready` an error flips to the dead-end `error` state; post-`ready` errors silently swallowed. Narrow window; 30s timeout recovers. Fix: manage EventSource lifecycle explicitly, or document reconnect semantics. Spine: silent.

**Implementation drift** — Multi-artifact single commit only promotes the first artifact (`tool-pill-classifier.service.ts:170`). A single `git commit` touching PRD + architecture yields one Semantic Pill; second artifact's "View" missing. Fix: product decision — emit one promotion per BMAD path, or accept first-wins. Spine: silent.

**Implementation drift** — Semantic title allows 1-word titles for 1-word messages (`semantic-title.ts:10`). LLM-generated title promised in Story 3.2 deferral never implemented in 3.3. Side nav can show "Hello" / "Test". Fix: enforce 2-word min, or implement LLM titles. Spine: contradicted ("2–5 word semantic title").

**Implementation drift** — `getWorkingTreeStatus` mis-parses renames and ignores git exit code (`sandbox.service.ts`). `line.slice(3)` mishandles `R  old -> new` and quoted paths; git error text on stdout treated as file list. Could yield false dirty/clean — the latter risks misleading "All saved". Fix: `--porcelain` -z-aware parsing + exitCode check. Spine: contradicted on edge.

**Implementation drift** — Concurrent `runTurn` state corruption + orphaned/stale circuit-breaker timers (`agent.service.ts:52-92, 221-239`). Second `runTurn` overwrites first's maps; `startCircuitBreakerTimer` doesn't clear pre-existing entry. UI disables input during processing, so trigger is UI-prevented in normal use. Fix: per-run timer scoping + concurrent-turn guard (Story 3.11 scope). Spine: silent.

**Implementation drift** — First-message + idle-timer race persists a message to a destroyed sandbox (`conversations.service.ts`). Edge at 60s boundary. Fix: coordinate the boundary. Spine: silent.

**Implementation drift** — `isSuccessfulCommit` / `isFailedCommit` match keywords inside commit messages (`tool-pill-classifier.service.ts:46-58`). Commit-body text containing "error:" or "files changed" misclassified → false Semantic Pill or missed promotion. Fix: parse only git infrastructure output, not message body. Spine: contradicted on edge.

**Implementation drift** — `extractBmadArtifactPaths` truncates paths with whitespace; `deriveTitleFromPath` yields "Untitled" (`tool-pill-classifier.service.ts:69, 78, 41-44`). BMAD paths rarely contain spaces. Fix: whitespace-aware parsing. Spine: contradicted on edge.

**Implementation drift** — `processAssistantMessage` double-processes duplicate `tool_use_id` blocks (`agent.service.ts:383-459`). No "seen" guard. Emits two `TOOL_CALL_RESULT`s, runs classifier twice, calls `markCredentialFailed` twice. Client overwrites same id (idempotent); mostly internal. Fix: add "seen" guard. Spine: silent.

**Implementation drift** — `processAssistantMessage` silently drops non-text content blocks (images) (`agent.service.ts:369-463`). BMAD agent output is text/code. Fix: handle non-text blocks or document constraint. Spine: silent.

**Implementation drift** — Stale-closure `useEffect` + dual `conversationId` ref/state can drift (`ConversationPane.tsx:43, 54-55`). Empty-deps effect captures initial props; `setConversationId` not called on resume path. Props don't change per mount in practice. Fix: refactor to dependent effect or document mount-once contract. Spine: silent.

**Implementation drift** — Deploy-time `onModuleDestroy` drops pending manual commits without `MANUAL_SAVE_FAILED`; in-flight promises emit to torn-down `SessionEventsService` (`manual-commit.service.ts:110-113`, `agent.service.ts:204-219`). Deploy/drain UX is Story 3.12 (backlog). Fix: Story 3.12 scope. Spine: silent (forward-looking).

## Not UX-relevant (excluded)

Considered and excluded — purely backend/internal, no user-visible surface in MVP for stories 3.1–3.7:

- OAuth token embedded in `git clone` URL / `.git/config` — security hardening.
- `SandboxService.resume` returns `conversationId: sandboxId` — latent internal contract, no caller.
- `provisionQueue.release` in `finally` when `acquire` might throw — internal semaphore; `acquire` has no throw path today.
- SSH-style repo URL → `TypeError` → opaque `SESSION_ERROR` — onboarding validates HTTPS.
- Idle timeout cleared on first message, never restarted — resource/cost; Story 3.9 scope.
- In-memory sandbox state lost on restart — resume flow re-provisions per spec.
- `getStatus` returns `'failed'` not 404 for missing conversation — internal API contract.
- `sendTurn` doesn't validate sandbox state before persisting — `RUN_ERROR` surfaces anyway.
- `SendMessageDto` no `max()` on content — input validation.
- `createConversation` validates a `CreateConversationDto` body it discards — internal.
- `markCredentialFailed` marks all of the user's connections — MVP has a single connection per user.
- `viewHref` not URL-encoded — artifact IDs are UUIDs in practice.
- `pendingClassifierPromises` race — latent.
- `abortPromise` listener never removed / `iterator.return()` not called / `resetCircuitBreakerTimer` re-arms for aborted runs — resource cleanup.
- Several test-only issues — not production code.

## Reviewer files

- `review-implementation-drift.md`
