# Implementation Drift Review — bmad-easy

## Scope
Epic 3 stories 3.1–3.7 (all `done`) vs. finalized spine pair (`DESIGN.md` / `EXPERIENCE.md`, `status: final`, updated 2026-07-04). The three spine sections added by the 2026-07-04 Update-mode audit (session-start timeout, working-tree `ⓘ` disclosure, circuit-breaker system message) are implemented and are **not** re-flagged here. Findings below come from cross-checking `deferred-work.md` (all 273 lines) against the live code in `apps/web/src/components/conversation/` and `apps/agent-be/src/{streaming,conversations}/`.

## Overall verdict
The built UX is broadly faithful to the spines for the happy paths — streaming, tool pills, semantic pills, working-tree indicator, manual-save flow, credential/403 split, and the three audited spine sections all match. Risk is concentrated in two areas: **client-side SSE/streaming resilience** (duplicate messages on reconnect, lost events, dead-end error states) and **the classifier's promotion contract** (modify-commits and multi-artifact-per-commit don't produce the Semantic Pill the spine states unconditionally). One critical gap is a fully missing component — the scroll-to-bottom button — which the code wires up but never actually shows.

## Findings

### Critical (1)

**Scroll-to-bottom button never appears; new-message count never increments** — EXPERIENCE.md › Scroll Behavior + `{components.scroll-to-bottom-button}`; Story 3.3 AC (UX-DR9).
`showScrollToBottom` is initialized `false` (`ConversationPane.tsx:43`) and `setShowScrollToBottom` is called in exactly one place — `handleScrollToBottom`, where it is set to `false` (`ConversationPane.tsx:720`). It is never set `true`. `ChatMessageList` updates a local `isAtBottomRef` on scroll (`ChatMessageList.tsx:34-41`) and auto-scrolls while at bottom (`:28-32`), so auto-scroll *pause* works, but the list never notifies the parent that the user has scrolled away, so the button never shows and `newMessageCount` never increments. The `ScrollToBottomButton` is rendered but always receives `showScrollToBottom={false}`. A user who scrolls up during a long streaming response has no jump-back affordance and no "N new" count — directly contradicting the spine component and the Story 3.3 AC in normal use.
Spine: contradicted. Fix: code — call a parent callback from `ChatMessageList`'s scroll handler to set `showScrollToBottom` when not at bottom, and a `useEffect` on `messages` to increment `newMessageCount` while scrolled away.

### High (2)

**Duplicate messages and tool pills on transient SSE reconnect** — EXPERIENCE.md › Conversation Loading (Returning) + Component Patterns › Streaming Chat Messages.
`SessionEventsService.getEventStream` returns a `ReplaySubject(100)` keyed by `conversationId` (`session-events.service.ts:13-20`). `emit()` writes to that subject if it exists (`:22-27`). On a transient `EventSource` drop, the browser auto-reconnects (the `onerror` handler at `ConversationPane.tsx:504-506` does **not** close the source), the SSE endpoint returns the *same* subject, and the last 100 buffered events replay. Every client handler (`TEXT_MESSAGE_START`, `TOOL_CALL_CONTENT`, `TOOL_CALL_START`, … in `ConversationPane.tsx:179-344`) appends to `messages` with no dedup, so replayed events render as duplicate messages/tokens/pills. Fallback IDs (`msg-${Date.now()}`, `tc-${Date.now()}` at `:182, :233`) collide or regenerate across replays, compounding dupes. (`deferred-work.md:232`.)
Spine: silent (coverage gap — the spine's "Reconnecting…" is about sandbox re-init, not SSE-transport reconnect event dedup). Fix: code — dedup by a stable event/message id in the client handlers, or clear the replay buffer once a stable connection is established.

**Agent `git commit` that modifies an existing `_bmad-output/` artifact produces no Semantic Pill** — EXPERIENCE.md › Tool Pills and Semantic Pills ("A git commit by the agent produces a Semantic Pill") + Story 3.4 AC-2.
`classifyToolResult` only promotes when `extractBmadArtifactPaths` returns ≥1 path (`tool-pill-classifier.service.ts:165-168`). That extractor matches `create mode` lines and a diffMatch regex (`:62-86`), but a plain `git commit -m "msg"` (the Claude Code agent's typical invocation) only lists `create mode` for *new* files — modified-but-existing files are not named in the commit stdout, so `bmadPaths` is empty and the call returns `null` (no promotion). The successful `git commit` then renders as a plain completed Tool Pill, never as "Progress saved · {type} · {title} · View". This contradicts the spine's unconditional wording and AC-2 on iteration commits — a core BMAD pattern (the agent writes to the same PRD/architecture file across multiple turns), so the first commit shows a Semantic Pill and every subsequent one does not. Borderline critical. (`deferred-work.md:229`.) Note the working-tree-clean signal still fires, so the user does see "All saved" — the missing piece is the Semantic Pill + its "View" link.
Spine: contradicted (for modify-commits). Fix: code — run `git show --name-only HEAD` (or `git diff-tree --no-commit-id --name-only -r HEAD`) after a detected successful commit to enumerate changed BMAD paths, then promote.

### Medium (7)

**Working-tree indicator stuck in "Saving…" if the `MANUAL_SAVE_SUCCEEDED` SSE event never arrives** — EXPERIENCE.md › Working Tree Indicator › Save confirmation flow (step 3: "the indicator transitions to clean").
`handleSave` sets `saving`, and on `data.committed === true` does nothing client-side, leaving the transition to the SSE event (`ConversationPane.tsx:614-642`, the `committed` branch at `:635`). If that event is lost (dropped-events race, or a connection drop in the window between the save POST response and the event), the indicator stays on "Saving…" indefinitely. (`deferred-work.md:236`.)
Spine: silent (no lost-event failure mode specified). Fix: code — client-side timeout fallback re-querying working-tree state, or set `clean` after a grace period on `committed=true`.

**`POST /resume` non-2xx response is not detected → UI stuck in "Reconnecting…" for the full 30s** — EXPERIENCE.md › Conversation Loading (Returning) (step 3).
The `/resume` fetch in `startSession` has no `response.ok` check — only `.catch` for network errors (`ConversationPane.tsx:509-519`). A 5xx resolves without throwing, so `state` stays `reconnecting` until the 30s client timeout fires the (false) "Starting your session is taking longer than expected." + Retry. (`deferred-work.md:245`.)
Spine: silent on resume HTTP errors (the timeout→Retry path itself is per spec, but a server error wastes 30s). Fix: code — check `response.ok` on `/resume` and surface an error state immediately.

**The `error` session state is a dead-end: input disabled, no action button** — EXPERIENCE.md › Conversation Surface States (every error row pairs text with a button) + the session-start-timeout Retry pattern.
`inputDisabled` includes `state === 'error'` (`ConversationPane.tsx:724`), but the Retry button renders only for `state === 'timeout'` (`:748`). A `SESSION_ERROR`, a failed conversation-create POST, or a `/resume` network failure lands in `error` with an `errorMessage` paragraph but no Retry/Refresh affordance. The spine's established shape everywhere else is "error text + single action button."
Spine: silent on a *terminal* session-error distinct from the timeout. Fix: code — render the Retry button for `state === 'error'` as well, or add a Refresh action.

**Circuit-breaker race: stream/classifier/working-tree events emit *after* `RUN_ERROR`, so the system message is no longer at the stream-stop point** — EXPERIENCE.md › Conversation Surface States › "Agent process terminated (circuit breaker)" ("appears at the point the stream stopped").
`handleCircuitBreaker` emits `RUN_ERROR` first (`agent.service.ts:269-272`), but pending classifier and working-tree promises (`:415-456`) and one more in-flight `iterator.next()` result can settle and emit `TOOL_CALL_PROMOTED` / `WORKING_TREE_DIRTY` / `TEXT_MESSAGE_*` *after* the system message. The client renders those after the "agent stopped unexpectedly" message, so the apparent stop point drifts downward and the working-tree indicator can flip after the termination notice. (`deferred-work.md:259`.)
Spine: contradicted (the stop point is not the stop point). Fix: code — await/drop pending promises before emitting `RUN_ERROR`, or have the client ignore stream events after `RUN_ERROR`.

**False error-state Tool Pills: client-side string-regex error detection on tool output** — EXPERIENCE.md › Tool Pills and Semantic Pills (error-state Tool Pill is for actual errors).
`TOOL_CALL_RESULT` marks a pill errored when `content` matches `/^error:/im`, `/Command exited with code [1-9]/`, or `/failed to push/i` (`ConversationPane.tsx:297-301`). Legitimate tool output that *contains* those substrings — e.g. a successful `read` of a file mentioning "error:", or a code-review comment containing "failed to push" — renders as a red "✕ {toolName} failed" pill for a call that actually succeeded. Plausible in BMAD workflows that read logs/code. (`deferred-work.md:239`.)
Spine: contradicted (error styling for non-errors). Fix: code — rely on the backend's tool_result error flag / classifier rather than client-side string matching on output content.

**Dropped SSE events before subscription can cause a false session-start timeout** — EXPERIENCE.md › New Conversation / Session start timeout.
`emit()` silently no-ops when no `ReplaySubject` exists for the conversation (`session-events.service.ts:22-27`); the subject is created lazily in `getEventStream`, which only runs when the SSE GET reaches the controller. `provisionSandbox` is fired-and-forgotten in `createConversation` (`conversations.service.ts:46`) and emits `SESSION_READY` (`:95-98`); `resumeConversation`'s fast path emits `SESSION_READY` synchronously-ish (`:303-306`). If either fires before the client's `EventSource` GET is processed (narrow on a fast connection, realistic on a slow proxy), `SESSION_READY` is lost, `state` stays `provisioning`/`reconnecting`, and the user hits the 30s false "Starting your session is taking longer than expected." + Retry. (`deferred-work.md:209`.)
Spine: silent (no dropped-event race specified). Fix: code — create the `ReplaySubject` eagerly in `createConversation`/`resumeConversation` before firing the provisioner, or create-on-first-emit.

**`TOOL_CALL_RESULT` for an untracked `tool_use_id` skips classification → a 401/403 is never detected** — EXPERIENCE.md › Conversation Surface States › Credential failed / Access denied; Story 3.7 AC-1/AC-2.
In `processAssistantMessage`, `TOOL_CALL_RESULT` is emitted *before* the `toolCallInfo` lookup (`agent.service.ts:394-402`); if the lookup misses (a non-streamed `tool_use`), the classifier block is skipped entirely (`:404-458`) — so a 401/403 pattern sitting in such an untracked result never triggers `CREDENTIAL_FAILURE`/`ACCESS_DENIED`, defeating the whole point of Story 3.7's real-time alert. (`deferred-work.md:260`.)
Spine: contradicted (the alert contract is silently skipped for untracked tool_use). Fix: code — track `tool_use_id` on `content_block_start` before results arrive, or run a defensive classification pass on `TOOL_CALL_RESULT` when `toolCallInfo` is missing.

### Low (12)

**`EventSource.onerror` doesn't close the source; state may diverge from the auto-reconnecting stream** — `ConversationPane.tsx:504-506`. (`deferred-work.md:178`.) EXPERIENCE.md is silent on transient SSE drops. Pre-`ready` an error flips to the dead-end `error` state (#medium); post-`ready` errors are silently swallowed. Narrow window; the 30s timeout eventually recovers. Spine: silent. Fix: code or spine — manage the EventSource lifecycle explicitly, or document reconnect semantics.

**Multi-artifact single commit only promotes the first artifact** — `tool-pill-classifier.service.ts:170` (`const fullPath = bmadPaths[0]`). (`deferred-work.md:228`.) A single `git commit` touching PRD + architecture yields one Semantic Pill; the second artifact's "View" is missing. Spine silent (only "multiple commits" addressed). Fix: product decision — emit one promotion per BMAD path, or accept first-wins.

**Semantic title allows 1-word titles for 1-word messages (no 2-word minimum)** — `semantic-title.ts:10` (`.slice(0, 5)`, no min); the LLM-generated title promised in the Story 3.2 deferral was never implemented in 3.3. (`deferred-work.md:195`.) Side nav can show "Hello" / "Test". Cosmetic. Spine: contradicted (Side Navigation "2–5 word semantic title"). Fix: enforce 2-word min in the heuristic, or implement LLM titles.

**`getWorkingTreeStatus` mis-parses renames and ignores git exit code** — `sandbox.service.ts` (per `deferred-work.md:175-176`, not deeply re-verified here). `line.slice(3)` mishandles `R  old -> new` and quoted paths; git error text on stdout is treated as a file list. Could yield a false dirty/clean — the latter risks a misleading "All saved" (data-loss disclosure misfires). Renames rare in BMAD working trees. Spine: contradicted on the rename/error edge. Fix: `--porcelain` -z-aware parsing + exitCode check.

**Concurrent `runTurn` state corruption + orphaned/stale circuit-breaker timers** — `agent.service.ts:52-92, 221-239`. (`deferred-work.md:231, 253, 254, 267`.) A second `runTurn` overwrites the first's maps; `startCircuitBreakerTimer` doesn't clear a pre-existing entry, so an orphaned timer from a prior run could fire on a new run ("agent stopped unexpectedly" on a healthy turn). The UI disables input during processing, so the trigger is UI-prevented in normal use. Spine: silent on concurrent turns. Fix: per-run timer scoping + concurrent-turn guard (Story 3.11 scope).

**First-message + idle-timer race persists a message to a destroyed sandbox (no agent response)** — `conversations.service.ts` (per `deferred-work.md:188`). Edge at the 60s boundary. Spine: silent. Fix: coordinate the boundary.

**`isSuccessfulCommit` / `isFailedCommit` match keywords inside commit messages** — `tool-pill-classifier.service.ts:46-58`. (`deferred-work.md:268, 270`.) Commit-body text containing "error:" or "files changed" is misclassified → false Semantic Pill or missed promotion based on commit-message wording. Spine: contradicted on edge. Fix: parse only git infrastructure output, not the message body.

**`extractBmadArtifactPaths` truncates paths with whitespace; `deriveTitleFromPath` yields "Untitled"** — `tool-pill-classifier.service.ts:69, 78, 41-44`. (`deferred-work.md:269, 271`.) BMAD paths rarely contain spaces. Spine: contradicted on edge. Low.

**`processAssistantMessage` double-processes duplicate `tool_use_id` blocks** — `agent.service.ts:383-459` (no "seen" guard). (`deferred-work.md:262`.) Emits two `TOOL_CALL_RESULT`s, runs the classifier twice, calls `markCredentialFailed` twice. Client overwrites the same id (idempotent); mostly internal. Spine: silent. Low.

**`processAssistantMessage` silently drops non-text content blocks (images)** — `agent.service.ts:369-463`. (`deferred-work.md:240`.) BMAD agent output is text/code. Spine: silent on non-text content. Low.

**Stale-closure `useEffect` + dual `conversationId` ref/state can drift** — `ConversationPane.tsx:43, 54-55` (empty-deps effect captures initial props; `setConversationId` not called on the resume path). (`deferred-work.md:189, 242`.) Props don't change per mount in practice. Spine: silent. Low.

**Deploy-time `onModuleDestroy` drops pending manual commits without `MANUAL_SAVE_FAILED`; in-flight promises emit to a torn-down `SessionEventsService`** — `manual-commit.service.ts:110-113`, `agent.service.ts:204-219`. (`deferred-work.md:230, 238, 241`.) Deploy/drain UX is Story 3.12 (backlog, out of scope here). Spine: silent (forward-looking). Low.

## Not UX-relevant
Considered and excluded — purely backend/internal, no user-visible surface in MVP for stories 3.1–3.7:

- OAuth token embedded in `git clone` URL / `.git/config` (`deferred-work.md:163, 170`) — security hardening.
- `SandboxService.resume` returns `conversationId: sandboxId` (`:161, 173`) — latent internal contract, no caller.
- `provisionQueue.release` in `finally` when `acquire` might throw (`:171, 207`) — internal semaphore; `acquire` has no throw path today.
- SSH-style repo URL → `TypeError` → opaque `SESSION_ERROR` (`:172`) — onboarding validates HTTPS.
- Idle timeout cleared on first message, never restarted (`:210`) — resource/cost; Story 3.9 scope.
- In-memory sandbox state lost on restart (`:182, 208`) — resume flow re-provisions per spec.
- `getStatus` returns `'failed'` not 404 for missing conversation (`:211`) — internal API contract.
- `sendTurn` doesn't validate sandbox state before persisting (`:193`) — `RUN_ERROR` surfaces anyway.
- `SendMessageDto` no `max()` on content (`:194`) — input validation.
- `createConversation` validates a `CreateConversationDto` body it discards (`:180`) — internal.
- `markCredentialFailed` marks all of the user's connections (`:258`) — MVP has a single connection per user.
- `viewHref` not URL-encoded (`:272`) — artifact IDs are UUIDs in practice.
- `pendingClassifierPromises` race (`:273`) — latent.
- `abortPromise` listener never removed / `iterator.return()` not called / `resetCircuitBreakerTimer` re-arms for aborted runs (`:261, 266, 267`) — resource cleanup.
- Several test-only issues (`:186, 187`) — not production code.
