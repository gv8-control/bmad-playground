# Bug Hunt Report: Epic 3 — Conversations: Running BMAD Skills with the Agent

**Date:** 2026-07-08
**Target files:** 20 files across `apps/agent-be/src/streaming/`, `apps/agent-be/src/conversations/`, `apps/agent-be/src/sandbox/`, `apps/agent-be/src/cost-tracking/`, `apps/web/src/components/conversation/`, `apps/web/src/hooks/`
**Has diff:** false

## Summary

- **Total findings:** 48
- **Critical:** 3 (all fixed — commit `27a5e53`)
- **High:** 12 (all fixed — commit `ca43a61`)
- **Medium:** 16
- **Low:** 17

### Layer results:
- **TFA (Test Fidelity Audit):** 1 finding — verdict: false-confidence-found
- **ECH (Edge Case Hunter):** 57 unhandled paths
- **CR (Code Review):** 35 findings (5 dismissed)

### Cross-cutting verification note:
The TFA finding originally claimed a missing try/catch around `markCredentialFailed` in `tool-pill-classifier.service.ts:134-135`. Cross-cutting verification against `CredentialsService.markCredentialFailed` (`credentials.service.ts:51-64`) confirmed this is a **false positive at the production code level** — the callee has its own internal try/catch that swallows errors and never rethrows. The TFA finding remains valid as a test quality issue (the test mocks an impossible scenario), but it does NOT hide a production bug. Multiple ECH agents reported this as a real finding because they examined the classifier in isolation without verifying the callee.

---

## Findings

### Critical

#### [C1] DB writes after RUN_FINISHED — Postgres rejection causes contradictory RUN_ERROR and silent data loss ✅ Fixed
- **Sources:** ech+cr (blind-hunter + ech + acceptance-auditor)
- **Location:** `apps/agent-be/src/streaming/agent.service.ts:170-184`
- **Status:** Fixed in commit `27a5e53`
- **Detail:** `RUN_FINISHED` is emitted at line 165 before `prisma.turn.create` (171) and `prisma.conversation.update` (179). If either rejects, the catch block (186) emits `RUN_ERROR` — after `RUN_FINISHED` was already sent. The client's `RUN_ERROR` handler early-returns on `runEndedRef.current === true`, so the user sees a successful completion while the assistant message is never persisted. On reload, the message is gone. Production-reachable: any Postgres transient failure triggers this.
- **Original classifications:** ECH: unhandled path; CR: patch (blind+ech+acceptance-auditor)

#### [C2] Back-pressure timer res.write() not wrapped in try/catch — uncaught exception crashes Node.js process ✅ Fixed
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/streaming/streaming.controller.ts:119-131`
- **Status:** Fixed in commit `27a5e53`
- **Detail:** When the 30s back-pressure timer fires, it calls `cleanupAll()`, `subscription.unsubscribe()`, then `res.write('event: STREAM_ERROR\n')` and `res.end()`. If the response was already closed (by `complete`, `error`, or `req.on('close')`), `res.write()` throws an uncaught exception inside the `setTimeout`, crashing the Node.js process. The `complete` and `error` callbacks wrap `res.end()` in try/catch (137-150), but the timer callback does not. Production-reachable: client disconnect during back-pressure. A process crash affects ALL connected users.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C3] requestCommit during executing commit returns queued but doesn't add to pending — pending changes silently lost ✅ Fixed
- **Sources:** ech+cr (ech + acceptance-auditor)
- **Location:** `apps/agent-be/src/conversations/manual-commit.service.ts:25-27`
- **Status:** Fixed in commit `27a5e53`
- **Detail:** When `executingCommits.has(conversationId)` is true, `requestCommit` returns `{ queued: true }` without adding to `pendingCommits`. The in-flight commit's `runCommit` tail-flush (61-64) checks `pendingCommits.has(conversationId)` — but it was never added. If the in-flight commit already passed `getWorkingTreeStatus` and found the tree clean (or committed before new changes arrived), the new changes are never saved. The caller is told "queued" but the commit never happens. Violates project-context.md line 157. Production-reachable: user clicks Save while a prior save is in-flight (common in active conversation).
- **Original classifications:** ECH: unhandled path; CR: patch (ech+acceptance-auditor)

### High

#### [C4] num_turns and duration_ms not guarded with Number.isFinite — NaN poisons Postgres aggregates ✅ Fixed
- **Sources:** ech+cr (ech + acceptance-auditor)
- **Location:** `apps/agent-be/src/streaming/agent.service.ts:129-135`, `apps/agent-be/src/cost-tracking/cost-tracking.service.ts:24-33`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** Only `total_cost_usd` is checked with `Number.isFinite` (line 129). `num_turns` and `duration_ms` from the SDK result are stored into `lastCostData` and passed to `costTracking.recordCost()` without validation. The `recordCost` method itself also does not guard its inputs. NaN/Infinity values are persisted to Postgres, which accepts them silently. NaN propagates through `_sum` aggregates (`NaN > threshold` is `false`, silently suppressing alerts). Violates project-context.md line 177.
- **Original classifications:** ECH: unhandled path (two locations); CR: patch (ech+acceptance-auditor)

#### [C5] Non-finite total_cost_usd — cost silently dropped with no logging ✅ Fixed
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/streaming/agent.service.ts:129`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** When `Number.isFinite(resultMsg.total_cost_usd)` returns false, `lastCostData` is never set and `recordCost` is never called. No `logger.warn` fires; the cost record is silently lost. Operators have no signal that cost tracking failed. Violates project-context.md line 140 ("logger.warn() in catch blocks that return a default value").
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C6] stop() emits RUN_FINISHED without awaiting pendingClassifierPromises ✅ Fixed
- **Sources:** ech+cr (ech + acceptance-auditor)
- **Location:** `apps/agent-be/src/streaming/agent.service.ts:232-235`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** `stop()` calls `abort()`, `interrupt()`, then immediately emits `RUN_FINISHED` (232) and deletes `pendingClassifierPromises` (242) without awaiting. Pending classifier promises (TOOL_CALL_PROMOTED, CREDENTIAL_FAILURE, ACCESS_DENIED) may resolve and emit events after `RUN_FINISHED`. The frontend has already transitioned to idle. Violates project-context.md line 153.
- **Original classifications:** ECH: unhandled path; CR: patch (ech+acceptance-auditor)

#### [C7] sendTurn creates user Turn before verifying sandbox is ready — orphaned user-only Turn ✅ Fixed
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/conversations/conversations.service.ts:277-279`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** `sendTurn` calls `onFirstMessage` (clears idle timer), persists the user Turn (279), and updates the title (286-294) without checking sandbox status. `runAgentTurn` (297) then fire-and-forgets; if `sandboxIds.get(conversationId)` is null (sandbox still provisioning or failed), it emits `RUN_ERROR` and returns. The user Turn is orphaned — persisted with no agent response.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C8] Idle timer cleared before DB writes — Postgres rejection leaves sandbox without timeout protection ✅ Fixed
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/conversations/conversations.service.ts:277-295`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** `onFirstMessage` (277) clears the idle timer. If `prisma.turn.create` (279) or `prisma.conversation.update` (286-294) rejects, the function throws before reaching `runAgentTurn` (297), which starts the mid-session timer. The sandbox now has no idle timer and leaks until process restart or manual destroy.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C9] Unmount during startSession fetch — EventSource leaks ✅ Fixed
- **Sources:** ech+cr (ech + acceptance-auditor)
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:73-82`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** `startSession` is called in a `useEffect` with a cleanup that closes `eventSourceRef.current`. But `startSession` is async — if the component unmounts during `await fetch(...)` (before the EventSource is created), the cleanup runs and closes nothing (ref is null). After the fetch resolves, the EventSource is created and assigned to the ref, but the cleanup already ran. The EventSource leaks, keeping the SSE connection open.
- **Original classifications:** ECH: unhandled path; CR: patch (ech+acceptance-auditor)

#### [C10] POST returns 200 with missing data.id — stuck in provisioning forever ✅ Fixed
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:159-170`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** If the conversation POST returns 200 but `data.id` is undefined (backend bug, proxy truncation), `convId` is set to undefined. Line 170: `if (!convId) return;` exits `startSession` early — before the 30s timeout is set. The state stays at `'provisioning'` indefinitely with no timeout transition and no Retry button.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C11] onerror during agent processing — UI permanently shows processing ✅ Fixed
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:595-601`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** The `onerror` handler preserves `'ready'` state (per project-context.md line 124). When the EventSource dies during agent processing (agentState is `'thinking'`/`'streaming'`/`'tool-executing'`), state stays `'ready'`, no Retry button appears, and `agentState` is never reset to `'idle'` because no `RUN_FINISHED` event arrives (connection is dead). The user is stuck with a permanent processing indicator and disabled input.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C12] Turn POST missing conversationId — router navigates to /conversations/undefined ✅ Fixed
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:680-687`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** `sendMessage` reads `data.conversationId` from the response. If the response is missing `conversationId` (backend returns unexpected shape), `data.conversationId` is undefined. Line 686: `router.push('/conversations/${data.conversationId}')` navigates to `/conversations/undefined`, loading a broken route.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C13] Enter during IME composition — premature submit interrupts CJK character composition ✅ Fixed
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/ChatInput.tsx:51`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** The Enter handler (`e.key === 'Enter' && !e.shiftKey`) doesn't check `e.nativeEvent.isComposing` (or `e.keyCode === 229`). During IME composition (e.g., typing Chinese/Japanese/Korean characters), pressing Enter to confirm the composed character also triggers `onSubmit()`, sending the incomplete or just-composed text as a message.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C14] isThinking toggles but auto-scroll effect deps omit it — indicator below fold ✅ Fixed
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/ChatMessageList.tsx:33-37`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** The auto-scroll `useEffect` (line 33-37) depends on `[messages]` only. When `isThinking` becomes true, `ThinkingIndicator` renders (line 106), but the scroll effect doesn't fire because `messages` didn't change. The indicator appears below the current scroll position, invisible to the user.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C15] Load/save race in useDraftPersistence — draft overwritten with empty string; conversationId change persists old draft as new ✅ Fixed
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/useDraftPersistence.ts:9-38`
- **Status:** Fixed in commit `ca43a61`
- **Detail:** Two related race conditions: (a) On first load, `setLoaded(true)` triggers a re-render where the load effect reads from `localStorage` and calls `setDraft(saved)`, but the save effect fires in the same tick and writes `draft` (still `''`) to `localStorage`, briefly overwriting the saved draft before the loaded value is applied. (b) When `conversationId` changes, the save effect writes the current (old conversation's) draft to the new conversation's `localStorage` key before the load effect's `setDraft` commits the new conversation's actual draft.
- **Original classifications:** ECH: unhandled path (two findings merged); CR: patch

### Medium

#### [C16] Drain failure then success — contradictory MANUAL_SAVE_FAILED then MANUAL_SAVE_SUCCEEDED
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/conversations/manual-commit.service.ts:122-124, 146-153`
- **Detail:** `onModuleDestroy` emits `MANUAL_SAVE_FAILED` for executing commits (122-124) and for pending commits whose drain deadline fires (151-152). But neither the executing commit nor the drain-raced `runCommit` are cancelled. If they complete afterward, `executeCommit` emits `MANUAL_SAVE_SUCCEEDED` (90-93). The client sees contradictory events.
- **Original classifications:** ECH: unhandled path (two findings merged); CR: patch

#### [C17] shellQuote receives non-string — TypeError crashes injectGitConfig/commit callers
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/sandbox/sandbox.service.ts:175-177`
- **Detail:** `resolveGitIdentity` falls back to `user.githubLogin` for `name`. If `user.githubLogin` is null (nullable column), `shellQuote(null)` calls `null.replace(...)` → TypeError. No type guard exists in `shellQuote`.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C18] git.status fileStatus undefined — TypeError on .filter()
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/sandbox/sandbox.service.ts:116-119`
- **Detail:** `getWorkingTreeStatus` calls `status.fileStatus.filter(...)` without checking that `fileStatus` is an array. If the Daytona SDK returns a status object without `fileStatus` (API change, deserialization edge case), `.filter()` throws `TypeError: Cannot read properties of undefined`.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C19] git commit on clean working tree exits non-zero — surfaces as Error instead of no-op
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/sandbox/sandbox.service.ts:133-141`
- **Detail:** `commit` runs `git add -A` then `git commit -m ...`. On a clean tree, `git commit` exits non-zero ("nothing to commit"), and the code throws `new Error(response.result)`. The caller checks `workingTree.dirty` before calling `commit`, but there's a race: the agent may clean/stage files between the check and the commit.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C20] ls non-zero exit not checked — error message parsed as fake skill names
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/sandbox/sandbox.service.ts:147-161`
- **Detail:** `listSkills` runs `ls -1 .claude/skills/` and directly uses `response.result` without checking `response.exitCode`. If the directory doesn't exist (exit non-zero), `ls` writes an error message to the result. The code splits this by newlines and returns each line as a skill name. Violates project-context.md line 155.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C21] 'not found' substring in error message — destroy silently swallows real failures
- **Sources:** ech
- **Location:** `apps/agent-be/src/sandbox/sandbox.service.ts:179-185`
- **Detail:** `isNotFoundError` checks for 'not found' in error messages. If an unrelated error contains "not found" (e.g., "binary not found"), `destroy` silently swallows it instead of propagating.
- **Original classifications:** ECH: unhandled path

#### [C22] daytona.create resolves with sandbox missing id — sandboxId: undefined
- **Sources:** ech
- **Location:** `apps/agent-be/src/sandbox/sandbox.service.ts:32-37`
- **Detail:** If the Daytona SDK returns a sandbox object without an `id` field, the response carries `sandboxId: undefined` to callers. No guard checks for `sandbox?.id` before using it.
- **Original classifications:** ECH: unhandled path

#### [C23] NaN costUsd in _sum aggregate — budget alert silently suppressed
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/cost-tracking/cost-tracking.service.ts:56-57`
- **Detail:** `checkBudgetAlert` does `result._sum.costUsd ?? 0`. If a `costRecord` row has `costUsd = NaN` (from data corruption or a future unguarded code path), Postgres `_sum` returns `NaN`. The comparison `NaN > SPEND_ALERT_THRESHOLD_USD` is `false`, silently suppressing the alert.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C24] No OnModuleDestroy — queued acquire() promises hang on shutdown
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/sandbox/provision-queue.service.ts:10-11`
- **Detail:** `ProvisionQueueService` doesn't implement `OnModuleDestroy`. If the module shuts down while `acquire()` promises are queued (waiting for a slot), those promises never resolve or reject. The request handlers that called `acquire()` hang indefinitely. `app.enableShutdownHooks()` is set, but this service doesn't participate.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C25] Non-UUID path :id — 500 instead of 400 Bad Request
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/conversations/conversations.controller.ts:24-87`
- **Detail:** The `:id` param is passed directly to service methods without format validation. A non-UUID string causes Prisma's `findFirst({ where: { id: ... } })` to throw a validation error, which the global exception filter maps to a 500 Internal Server Error. The correct response is 400 Bad Request.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C26] handleSave lacks useRef re-entrancy guard (project-context.md rule violation)
- **Sources:** ech+cr (acceptance-auditor)
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:710-751`
- **Detail:** `handleSave` is an async handler with an `await` gap (line 717). Project-context.md line 126 requires a `useRef<boolean>` re-entrancy guard for all non-form async handlers with an await gap. The UI state machine (`'saving'` state blocks the popover) currently prevents re-entrancy, but a future code change could introduce a second trigger. The function itself is unguarded.
- **Original classifications:** ECH: unhandled path; CR: patch (acceptance-auditor)

#### [C27] Save fallback timer not cleared on unmount, retry, or re-save
- **Sources:** ech
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:738-741, 76-81, 817-822`
- **Detail:** The 15s save fallback timer (`saveFallbackTimeoutRef`) is not cleared when: (a) the component unmounts — `setState` on unmounted component; (b) the user clicks Retry — timer fires mid-retry, reverting `workingTreeState` to clean unexpectedly; (c) `handleSave` is called again — prior timer leaks and fires later, reverting state.
- **Original classifications:** ECH: unhandled path (three findings merged)

#### [C28] Save popover focus trap breaks on mouse outside-click
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/WorkingTreeIndicator.tsx:134-166`
- **Detail:** The save dialog has a Tab/Shift+Tab focus trap and Escape handler, but no `mousedown` outside-click listener (unlike the info tooltip at line 43-51). If the user clicks elsewhere on the page, focus leaves the dialog. The Tab handler compares `document.activeElement` to `first`/`last` — which no longer matches — so Tab no longer traps within the dialog. The dialog stays open but is keyboard-inaccessible.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C29] Parent state prop transitions to non-dirty while savePopoverOpen is true — overlay reopens without user action
- **Sources:** ech
- **Location:** `apps/web/src/components/conversation/WorkingTreeIndicator.tsx:19-87`
- **Detail:** If the parent's `state` prop transitions to non-dirty (e.g., `'saving'` or `'clean'`) while `savePopoverOpen` is true, the popover stays open. When the state returns to `'dirty'`, the overlay may reopen without user action, and the save-button refocus is skipped because the effect deps haven't changed.
- **Original classifications:** ECH: unhandled path

#### [C30] SESSION_DRAINING emitted more than once — stale timer fires, falsely marking session as timed out
- **Sources:** ech
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:217-227`
- **Detail:** When `SESSION_DRAINING` is received, a 15s timeout is set. If the server emits `SESSION_DRAINING` more than once (e.g., during rapid shutdown), a second timer is created without clearing the first. The stale timer fires later, falsely marking the session as timed out.
- **Original classifications:** ECH: unhandled path

#### [C31] startTimer called while prior onTimeout callback still awaiting — concurrent timeout callbacks
- **Sources:** ech
- **Location:** `apps/agent-be/src/sandbox/idle-timeout.service.ts:27-42`
- **Detail:** If `startTimer` is called while a prior `onTimeout` callback is still awaiting (e.g., the callback's async operation is slow), a second timeout callback runs concurrently, potentially causing double resource cleanup.
- **Original classifications:** ECH: unhandled path

### Low

#### [C32] False-green test: asserts classifier THROWS when markCredentialFailed rejects (impossible scenario)
- **Sources:** tfa
- **Location:** `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts:481-497`
- **Detail:** The test asserts `.rejects.toThrow(...)` when `markCredentialFailed` is mocked to reject. However, `CredentialsService.markCredentialFailed` (`credentials.service.ts:51-64`) has its own internal try/catch that logs and swallows errors — it never rethrows. The test mocks an impossible scenario. If someone later removes the internal try/catch from `markCredentialFailed`, this test would guard the wrong behavior (asserting the classifier throws, rather than that it returns the `CREDENTIAL_FAILURE` event regardless of DB write failure, per project-context.md line 158). The test actively prevents the correct fix.
- **Original classifications:** TFA: Class B false-green test

#### [C33] No validation on timeoutMs — timer fires immediately (NaN/0) or never (Infinity)
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/sandbox/idle-timeout.service.ts:29`
- **Detail:** `startTimer` uses `const delay = timeoutMs ?? this.timeoutMs` without validating `timeoutMs`. If a caller passes `NaN`, `setTimeout(fn, NaN)` fires immediately. If `0` or negative, same. If `Infinity`, the timer never fires. Current callers use guarded constants, but the method itself is unguarded.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C34] Double-release decrements active below zero — bypasses concurrency cap
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/sandbox/provision-queue.service.ts:40-44`
- **Detail:** `release` decrements `active` without a floor check. If `release` is called more times than `acquire` (caller bug), `active` goes negative. A subsequent `acquire` sees `active < MAX_CONCURRENT_PROVISIONS` (e.g., `-1 < 2`) and proceeds, bypassing the cap. Current callers always release exactly once via `finally`.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C35] sandboxId not validated — downstream methods operate on invalid reference
- **Sources:** ech
- **Location:** `apps/agent-be/src/sandbox/sandbox.service.ts:168-173`
- **Detail:** Methods like `injectGitConfig`, `getWorkingTreeStatus`, `commit`, and `listSkills` receive `sandboxId` without validating it's a non-empty string. If `sandboxId` is undefined/empty, the downstream Daytona SDK calls operate on an invalid reference.
- **Original classifications:** ECH: unhandled path

#### [C36] Error status with empty errorMessage — expanded panel shows no diagnostic
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/ToolPill.tsx:77-81`
- **Detail:** When `isError` is true but `errorMessage` is empty/undefined, the error `<pre>` block is not rendered (`isError && errorMessage` is false). The expanded panel shows only input/output (if present), with no error diagnostic. The user sees the pill labeled "failed" but has no explanation when expanded.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C37] Non-string input/output from malformed SSE — React renders [object Object]
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/ToolPill.tsx:82-91`
- **Detail:** `input` and `output` are rendered directly inside `<pre>` tags. The TypeScript types say `string`, but the SSE handlers in ConversationPane.tsx don't validate runtime types. An object would render as `[object Object]` in the DOM.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C38] Very long artifactTitle — pill overflows, breaks chat line layout
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/SemanticPill.tsx:48-53`
- **Detail:** `artifactTitle` is rendered in a `<span>` with no `max-width` or `overflow` handling. A very long title (e.g., a 200-character filename) makes the `inline-flex` pill expand horizontally, overflowing the chat container and breaking the layout.
- **Original classifications:** ECH: unhandled path; CR: patch

#### [C39] Completed status with errorMessage — success icon shown, error message silently dropped
- **Sources:** ech
- **Location:** `apps/web/src/components/conversation/ToolPill.tsx:63-67`
- **Detail:** When `status === 'completed'` but `errorMessage` is populated (contradictory state), the error block is not rendered (`isError` is false). The success icon is shown and the error message is silently dropped in the expanded view.
- **Original classifications:** ECH: unhandled path

#### [C40] Empty or whitespace toolName — labels render with trailing space
- **Sources:** ech
- **Location:** `apps/web/src/components/conversation/ToolPill.tsx:14-29`
- **Detail:** If `toolName` is an empty string or whitespace at runtime, labels render with a trailing space (e.g., "Running… ") and `ariaLabel` has a double space (e.g., "Tool  is running").
- **Original classifications:** ECH: unhandled path

#### [C41] Expanded with no input, output, or errorMessage — empty container div renders
- **Sources:** ech
- **Location:** `apps/web/src/components/conversation/ToolPill.tsx:75-92`
- **Detail:** When `expanded === true` but there is no input, output, or errorMessage, an empty container `<div>` renders after click expand, showing orphaned spacing with no content.
- **Original classifications:** ECH: unhandled path

#### [C42] Duplicate skill names — React key warnings, potential render state bugs
- **Sources:** ech
- **Location:** `apps/web/src/components/conversation/SlashCommandPicker.tsx:39`
- **Detail:** Uses `key={skill.name}` assuming name uniqueness. If the skills array contains entries with identical `name` field, React reconciliation warnings appear and potential render state bugs may occur.
- **Original classifications:** ECH: unhandled path

#### [C43] Info span clicked while save dialog open — both overlays render simultaneously
- **Sources:** ech
- **Location:** `apps/web/src/components/conversation/WorkingTreeIndicator.tsx:112-134`
- **Detail:** There is no mutual exclusion between the save popover and the info tooltip. If the user clicks the info span while the save dialog is open, both overlays render simultaneously in the same container. Escape closes only the focused one.
- **Original classifications:** ECH: unhandled path

#### [C44] TEXT_MESSAGE_CONTENT before TEXT_MESSAGE_START — early content deltas silently dropped
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/ConversationPane.tsx:262-277`
- **Detail:** If a `TEXT_MESSAGE_CONTENT` event arrives when `streamingMessageIdRef.current` is null (because `TEXT_MESSAGE_START` was dropped by the 100-event ReplaySubject buffer overflow, or arrived out of order), the delta is silently dropped. The user sees a message with missing beginning content. Requires non-trivial buffering for an edge case (ReplaySubject overflow) that's unlikely in normal operation. Deferred.
- **Original classifications:** ECH: unhandled path; CR: defer

#### [C45] capturedAt captured post-call — concurrent re-auth clobbered by lt predicate
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/streaming/tool-pill-classifier.service.ts:135`
- **Detail:** `markCredentialFailed(userId, new Date())` captures the timestamp at classification time, not before the git command ran. If a user re-authenticated during the in-flight git operation (between command start and classification), `updatedAt` (re-auth time) < `capturedAt` (classification time), and the `lt` predicate fires, marking the credential as failed despite the re-auth. Proper fix requires passing the command start timestamp through the tool call metadata (architectural change). The race window is narrow (seconds). Deferred.
- **Original classifications:** ECH: unhandled path; CR: defer

#### [C46] Conversation abandoned without complete() — ReplaySubject stays in Map indefinitely
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/streaming/session-events.service.ts:11`
- **Detail:** If `complete()` is never called (e.g., `onFirstMessage` clears the idle timer, `runAgentTurn` fails before starting the mid-session timer, and provisioning hangs), the `ReplaySubject(100)` stays in the `emitters` Map indefinitely. In normal flows, `complete()` is called by idle timeout, abandon, provision failure, or `onModuleDestroy`. The leak only occurs in an error path where all these fail to fire. Requires lifecycle redesign. Deferred.
- **Original classifications:** ECH: unhandled path; CR: defer

#### [C47] Two tabs same conversation, one closes — incorrectly shown as closed
- **Sources:** ech+cr
- **Location:** `apps/web/src/hooks/use-conversation-presence.ts:50-57`
- **Detail:** When Tab A closes, it broadcasts `conversation-closed`. `useOpenConversations` (on the Project Map/list) removes the conversation from the open list. But Tab B still has it open — the conversation is incorrectly shown as closed. BroadcastChannel can't atomically check if another tab has the conversation open before marking it closed. Requires a ref-counting or re-broadcast mechanism. Deferred.
- **Original classifications:** ECH: unhandled path; CR: defer

#### [C48] Tab crashes without cleanup — conversation stays in open list indefinitely
- **Sources:** ech+cr
- **Location:** `apps/web/src/hooks/use-conversation-presence.ts:38-68`
- **Detail:** If a tab crashes (without running the `useEffect` cleanup), `conversation-closed` is never sent. The conversation stays in the open list on other tabs indefinitely. There's no heartbeat or periodic presence refresh. Requires a heartbeat mechanism (periodic re-broadcast with TTL-based expiry). Deferred.
- **Original classifications:** ECH: unhandled path; CR: defer
