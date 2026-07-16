# Bug Hunt Report: Epic 6 — Sandbox-Based Agent Execution

**Date:** 2026-07-16
**Target files:** Production code (`apps/agent-be/src/sandbox/sandbox.service.ts`, `apps/agent-be/src/streaming/agui-event-bridge.service.ts`, `apps/agent-be/src/streaming/agent.service.ts`, `apps/agent-be/src/streaming/streaming.module.ts`, `apps/agent-be/.env.example`, `apps/agent-be/Dockerfile`, `apps/agent-be/jest.config.ts`; `apps/web/src/app/api/internal/test/artifacts/route.ts`; `libs/shared-types/src/sandbox.interface.ts`; `apps/agent-be/src/__mocks__/claude-agent-sdk.ts` was removed in Story 6.3) + co-located and integration test files (`apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts`, `sandbox.service.session.spec.ts`; `apps/agent-be/src/streaming/agui-event-bridge.service.spec.ts`, `agent.service.unit.spec.ts`; `apps/agent-be/test/helpers/sandbox-service.fake.ts`, `mock-daytona.ts`, `mock-query.ts`; `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts`, `sdk-contract-replay.spec.ts`; `apps/agent-be/test/unit/env-example.spec.ts`; `apps/web/src/app/api/internal/test/artifacts/route.test.ts`; `playwright/e2e/artifact-browser/artifacts-fixture-idempotency.spec.ts`; the 5 `playwright/e2e/real-service/*.spec.ts` files), changed by Epic 6 commits `751489d..dbac901`.
**Has diff:** false

## Summary

- **Total findings:** 3 new
- **Critical:** 0
- **High:** 2
- **Medium:** 1
- **Low:** 0

### Layer results:
- **TFA (Test Fidelity Audit):** 2 findings — verdict: false-confidence-found
- **ECH (Edge Case Hunter):** 3 unhandled paths (2 merged with TFA/CR; 1 standalone)
- **CR (Code Review):** 2 findings (0 dismissed)

### Profile note:

Epic 6 (5 stories, 6-1 through 6-5) migrated agent execution from host-based (`@anthropic-ai/claude-agent-sdk`'s `query()` subprocess) to sandbox-based execution inside the Daytona sandbox (using `sandbox-agent` binary). The migration produced a new event bridge service (`AguiEventBridgeService`) that consumes sandbox-agent's JSONL-on-stdout output and forwards as AG-UI SSE events, plus rewrote `AgentService.runTurn` to drive the event bridge instead of the SDK iterator. The finding profile reflects the architectural complexity of this migration: the cross-service error-handling integration between `AgentService.runTurn`'s catch block and `AguiEventBridgeService.streamAgentEvents`'s catch-and-re-throw pattern. Both High-severity findings (double-RUN_ERROR on stream crash; zombie session leak on stop-before-createAgentSession-completes) come from edge cases in this new integration. The Medium finding (vacuous pendingPromises await in `stop()` due to Map deletion during await) extends a partially-fixed deferred finding from the "opencode session investigation" to the AGENT_STOPPED/sentinel path.

Three layers ran sequentially (TFA → ECH → CR) in subagent-fallback mode (single-session inline execution). The bug-hunt skill's subagent-delegation step was unavailable; per step-02 rule instruction 2, this is the documented fallback — analysis ran directly against the source.

Cross-layer verification: I confirmed by running `yarn nx test agent-be -- --testPathPattern="(agui-event-bridge.service.spec|agent.service.unit.spec)"` → 32 suites / 791 tests passed. The event-bridge-isolation tests assert ONE RUN_ERROR on stream-crash (via `failNextAgentStream`) because the event bridge's `emitRunError` is the only emit on the SSE channel at that layer; but the integration tests use a mock event bridge (`createMockEventBridge`) whose `streamAgentEvents.mockRejectedValueOnce(...)` does NOT simulate `emitRunError`'s side-effect of emitting RUN_ERROR BEFORE re-throwing. This makes the integration tests vacuously pass with ONE RUN_ERROR (from AgentService's catch else-branch), masking the production behavior of TWO RUN_ERRORs.

I also verified my findings against the previously-recorded deferred findings in `_bmad-output/implementation-artifacts/deferred-work.md` (lines 511-610, the Epic-6-related entries). 7 of the 13 "opencode session investigation" deferred findings (recorded 2026-07-16) are ALREADY ADDRESSED by the Story 6.3 production code — see the prior-findings status table below. The remaining findings are re-validated as still relevant. None of the 3 new findings duplicates an existing deferred item — each is a distinct code path or extension of a partially-fixed existing finding.

---

## Prior bug-hunt findings status (Epic 6 deferred findings)

This is the first bug hunt explicitly targeting Epic 6. Prior code reviews of Stories 6.1 through 6.5 recorded ~25 Epic 6-related deferred findings in `deferred-work.md` (lines 511-610). This bug hunt validated each against the current source. Status legend: ✅ addressed/stale (closed by Story 6.3 code), △ partially fixed, ⚠ still open.

| Deferred Finding | Status |
| --- | --- |
| Story 6.1: `networkAllowList: '0.0.0.0/32'` egress-blocking activation unverified | ⚠ Still deferred (requires real-service E2E — Story 6.5 operational prerequisites) |
| Story 6.1: `claude --version` uses bare `claude` (PATH assumption) | ⚠ Still deferred (requires real sandbox image) |
| Story 6.1: `resume()` doesn't handle `DaytonaNotFoundError` from `daytona.start()` | ⚠ Still deferred (`resume()` is uncalled by `resumeConversation`) |
| Story 6.1: sandbox-agent checksum provenance undocumented | ⚠ Still deferred (documentation gap) |
| Story 6.1: defense-in-depth `ANTHROPIC_API_KEY` guard at allocation point | ✅ Applied — `apps/agent-be/src/sandbox/sandbox.service.ts:103-106` |
| Story 6.1: `.env.example` regression-guard test | ✅ Applied — `apps/agent-be/test/unit/env-example.spec.ts` |
| Story 6.2 NFR-1: No timeout on `createSession` SDK call | ⚠ Still deferred |
| Story 6.3: `onModuleDestroy()` clears `pendingClassifierPromises` without draining | ⚠ Still deferred; this bug hunt's M3 finding extends the abandoned-drain concern to the stop()-path Map deletion race |
| Story 6.3: Empty message produces `--prompt ''` | ⚠ Still deferred (DTO bound — needs Story 6.5 verification) |
| Story 6.3: `TEXT_MESSAGE_START`/`END` events no longer synthesized by AgentService | ⚠ Still deferred (verification needs real sandbox-agent session) |
| "session investigation" — Race: `stop()` emits double `RUN_FINISHED` between activeRuns.set and streamAgentEvents | ⚠ **STILL RELEVANT** — `apps/agent-be/src/streaming/agent.service.ts:281-291` retains the race window |
| "session investigation" — Pending classifier promises not awaited in catch block — events arrive after `RUN_ERROR` (line 571) | △ **PARTIALLY FIXED** — `agent.service.ts:357-365` now `await Promise.allSettled(pendingPromises)` in the else (non-sentinel) branch; the sentinel (AGENT_STOPPED) branch is unprotected, and `stop()`'s local re-await is vacuous (M3 below) |
| "session investigation" — `createAgentSession` failure leaks `activeRuns` entry in event bridge (line 572) | ✅ **ADDRESSED** — `agui-event-bridge.service.ts:107-111` deletes the entry on `createAgentSession` rejection (the commit at `0d60d0b` includes this review patch). The related project-context.md rule (line 185) documents the pattern. (H2 below covers a DIFFERENT variant — when createAgentSession RESOLVES during the abort race, not when it REJECTS.) |
| "session investigation" — `onEvent` callback throws synchronously → double `RUN_ERROR` (line 576) | ✅ **ADDRESSED** — `agui-event-bridge.service.ts:276-282` wraps `onEvent(event)` in try/catch with logger.error on throw |
| "session investigation" — `TOOL_CALL_END` before `TOOL_CALL_START` — silent no-op (line 577) | ⚠ Still relevant (no defense-in-depth warning log added) |
| "session investigation" — Mock event bridge doesn't simulate rejection on `stop()` (line 578) | △ **PARTIALLY ADDRESSED** — `agent.service.unit.spec.ts:131-148` adds `createControllableEventBridge` (with proper reject handle); but `createMockEventBridge:117` still returns a plain resolved promise. Tests using `createMockEventBridge` for stop scenarios still give false confidence (this bug hunt's H1 finds an additional mock fidelity gap: `createMockEventBridge` doesn't simulate `emitRunError` either). |
| "session investigation" — `TOOL_CALL_RESULT` without `toolCallId` — segment dropped, classifier skipped (line 579) | ⚠ Still relevant (no warning log added) |
| "session investigation" — `toolCallId` fallback uses `Date.now()` (line 583) | ✅ **ADDRESSED** — `agent.service.ts:106` now uses `tc-${randomUUID()}` (closes this specific instance; `ConversationPane.tsx`'s other `Date.now()` instances for non-toolcall IDs are tracked separately at deferred-work.md:223) |
| "session investigation" — Cost data warning logs `undefined` for missing fields (line 584) | ✅ **ADDRESSED** — `agent.service.ts:272` now uses `?? 'missing'` for each field |
| "session investigation" — Test leaves never-resolving promise open (line 585) | ✅ **ADDRESSED** — `agent.service.unit.spec.ts:380-404` uses `createControllableEventBridge` (which sets up the rejectStream handle) for the concurrent-guard test, with cleanup via `stop()` |
| (Pre-Story 6.3 items no longer reachable because the migration removed the code) | ✅ stale — the `abortPromise` listener (line 212), `Promise.race` iterator release (line 208), race-condition events after `RUN_ERROR` during circuit-breaker (line 206) all referenced pre-Story 6.3 host-based SDK code; the migration replaced the entire pipeline so these findings are no longer reachable |
| Story 6.4: `listSkills()` exitCode gate returns `[]` without logging | ⚠ Still deferred |
| Story 6.4: `injectGitConfig()` has F4 empty-error-message bug | ⚠ Still deferred (pre-existing from Story 3.6) |
| Story 6.4: `installBinaries()` throw sites lack `|| exit code` fallback | ⚠ Still deferred |
| Story 6.5: auto-scroll mock `__mockFetchInstalled` guard | ⚠ Still deferred |
| Story 6.5: POST `/api/internal/test/artifacts` missing input validation | ⚠ Still deferred (test-only route) |
| Story 6.5: AC-1/2/3/4 real-service specs never run | ⚠ Still deferred (operational prerequisites per deferred-work line 591) |

So 8 of the 13 "opencode session investigation" deferred findings (line 537-585) are now closed by Story 6.3 production code; 1 is partially fixed (M3 below extends it); 4 remain open.

---

## Findings (new, Epic 6 scope)

### High

#### [H1] Stream-crash emits DOUBLE RUN_ERROR — event bridge's `emitRunError` fires before re-throw, then AgentService's catch else-branch emits another RUN_ERROR

- **Sources:** tfa+ech+cr (merged)
- **Location:**
  - `apps/agent-be/src/streaming/agui-event-bridge.service.ts:163-182` (`emitRunError` called at line 174 for non-abort failures, then re-throws at line 182 — the comment at lines 176-181 documents the re-throw design for sentinel-based abort propagation but does NOT acknowledge that non-sentinel errors then cause a second RUN_ERROR in the caller)
  - `apps/agent-be/src/streaming/agui-event-bridge.service.ts:316-323` (`emitRunError` private method — directly calls `sessionEvents.emit` with `RUN_ERROR` + `AGENT_STREAM_TIMEOUT_MESSAGE` constant; bypasses the lifecycle-ownership `onEvent` dispatch in `processAgentEvent`)
  - `apps/agent-be/src/streaming/agent.service.ts:346-370` (catch block; sentinel check at lines 348-356 only skips RUN_ERROR for the 3 sentinel message strings; else branch at lines 357-369 emits ANOTHER `RUN_ERROR` with the original error message)
  - `apps/agent-be/src/streaming/agent.service.unit.spec.ts:407-428` (mock-based test that gives false confidence — uses `.toContain` and `errorCalls[0][1].data.message` assertions but never asserts the count, and the mock `createMockEventBridge` at lines 99-123 does not simulate `emitRunError`'s pre-throw side-effect)

- **Detail:** When `streamAgentEvents` rejects with a non-sentinel error (anything other than `AGENT_STOPPED`, `AGENT_STREAM_TIMEOUT`, or `MODULE_DESTROYING`), the cross-service catch-and-re-throw pattern produces TWO `RUN_ERROR` SSE events in sequence:

  1. `AguiEventBridgeService.streamAgentEvents` catch block at line 174 calls `emitRunError()` (private method at lines 316-323). `emitRunError` directly calls `this.sessionEvents.emit(conversationId, { event: EventType.RUN_ERROR, data: { message: AGENT_STREAM_TIMEOUT_MESSAGE } })` — emitting `RUN_ERROR` with the misleading message `'The agent stopped unexpectedly. Send a new message to try again.'` (the `AGENT_STREAM_TIMEOUT_MESSAGE` constant at lines 67-68, which is timeout-specific language but applied to any non-abort failure).
  2. Line 182 re-throws the original error.
  3. `AgentService.runTurn`'s catch block at line 346 sees the original error message. None of the 3 sentinel strings match. Falls through to the else branch (lines 357-369), which emits ANOTHER `RUN_ERROR` via `this.sessionEvents.emit(conversationId, { event: EventType.RUN_ERROR, data: { message: errorMessage } })` — with the original (and more useful) error message.

  **Production consequence:** the SSE channel receives two `RUN_ERROR` events per non-sentinel stream failure. The first carries the misleading timeout message; the second overwrites the first with the actual error. The user sees a brief flicker of "agent stopped unexpectedly" then the actual error. This also violates the `onEvent` lifecycle-ownership rule (project-context.md line 184): when `onEvent` is provided (always so when called from `AgentService.runTurn`), lifecycle events should be passed via `onEvent` and skipped in `sessionEvents.emit`. `emitRunError` bypasses `onEvent` entirely by calling `sessionEvents.emit` directly.

  Why the sentinel-check approach works for STOPPED/TIMEOUT/DESTROYING but not for stream-crash:
  - The 3 sentinel strings are explicitly emitted by the event bridge (line 204: `rejectStream?.(new Error('AGENT_STOPPED'))`; lines 152 and 303: `reject(new Error('AGENT_STREAM_TIMEOUT'))`; line 233: `rejectStream?.(new Error('MODULE_DESTROYING'))`). For these, AgentService recognizes the sentinel and SKIPS its own RUN_ERROR emit (preserves lifecycle-ownership through sentinel-detection as a backstop).
  - For non-sentinel stream crashes (e.g., `getSessionCommandLogs` throws, sandbox-agent crashes, Daytona network issue), the event bridge's catch fires `emitRunError` UNCONDITIONALLY (per `if (!activeRun.aborted)` guard at line 164 — true for non-abort crashes), THEN re-throws. The AgentService catch can't recognize the original error message as a sentinel → emits again.

  **Mock fidelity gap (TFA Gap C — false-confidence-found):** `agent.service.unit.spec.ts:407-428` (`"[P0] streamAgentEvents rejection (non-AGENT_STOPPED) emits RUN_ERROR"`) uses `createMockEventBridge` (lines 99-123). The mock's `streamAgentEvents.mockRejectedValueOnce(new Error('spawn failed: ENOENT'))` does NOT simulate the real event bridge's `emitRunError()` side-effect of emitting RUN_ERROR before re-throwing. The test asserts:
  ```ts
  expect(emittedEvents).toContain(EventType.RUN_ERROR);  // line 421 — passes vacuously for 1 OR N emits
  expect(errorCalls[0][1].data.message).toBe('spawn failed: ENOENT');  // line 427 — only asserts the FIRST error's message
  ```
  It uses `.toContain` (not `.toHaveLength(1)` or a count assertion). The production behavior of emitting TWO RUN_ERRORs would still pass this test because only the FIRST one is message-asserted (it would be the one from AgentService's catch, since the mock skips emitRunError). The test gives false confidence that the integration handles non-sentinel stream crashes correctly.

  The event-bridge-isolation tests in `agui-event-bridge.service.spec.ts:424-449` DO use `sandboxFake.failNextAgentStream()` (the fake synchronously throws inside `streamAgentLogs`), and DO assert `errorCalls.toHaveLength(1)` (line 445). That test exercises the event-bridge LAYER in isolation and one RUN_ERROR is emitted. But there is no integration-level test that combines `failNextAgentStream` with `AgentService.runTurn` — that integration would catch the double-emit and fail the test.

  Verified by running `yarn nx test agent-be -- --testPathPattern="(agui-event-bridge.service.spec|agent.service.unit.spec)"` → 32 suites / 791 tests passed. The green suite is itself evidence that the integration tests give false confidence.

- **Original classifications:**
  - TFA: Gap C (mock-doesn't-replicate-side-effect — false-green integration test)
  - ECH: unhandled path (catch-then-catch double-emit on non-sentinel rejection)
  - CR: patch (false-green test that should assert count and use a real-fake integration)

- **Remediation:** Two viable options:
  - **Option A (minimal fix):** Introduce a 4th sentinel for non-abort stream crashes — e.g., have `AguiEventBridgeService.streamAgentEvents` catch wrap the re-thrown error so its `message` is `'AGENT_STREAM_CRASHED: ' + originalMessage` (or throw a `StreamCrashedError` instance that AgentService recognizes via `instanceof`). Update `AgentService`'s sentinel check at lines 348-356 to recognize the new sentinel and skip the local RUN_ERROR emit. This preserves the existing sentinel-based dispatch architecture and is the least invasive.
  - **Option B (lifecycle-ownership strict fix):** Refactor `emitRunError` to route through `processAgentEvent` (which already has the lifecycle-onEvent dispatch), OR remove `emitRunError` entirely and rely on `AgentService`'s catch to emit the single canonical RUN_ERROR. This is more invasive but eliminates the "two emitters, one event" pattern that produced the bug. Requires careful handling of the timeout case — currently the timeout's RUN_ERROR comes from `emitRunError` while the sentinel text is `AGENT_STREAM_TIMEOUT` which AgentService's catch uses to skip its own emit. If `emitRunError` is removed, the timeout path's RUN_ERROR needs a new owner (AgentService's catch else-branch will fire, but the timeout path's error message is `AGENT_STREAM_TIMEOUT` which IS a sentinel and SKIPS the else-branch emit — leaving NO RUN_ERROR for the timeout case). So Option B requires adjusting the sentinel handling.

  Recommend Option A — minimal change, preserves the existing architectural pattern (event bridge owns emit for stream-internal failures; AgentService owns emit for non-stream errors like cost-record failures), and unifies the RUN_ERROR emit strategy via a 4th sentinel for the crash case.

  Also tighten the test:
  - Update `createMockEventBridge` to simulate the `emitRunError` side-effect for `mockRejectedValueOnce` calls (in the mock's `streamAgentEvents`, when the mock rejects with a non-sentinel error, call `sessionEvents.emit(convId, { event: EventType.RUN_ERROR, data: { message: 'mock bridge simulated emitRunError' } })` BEFORE rejecting — mirroring real behavior).
  - Change test assertions in `agent.service.unit.spec.ts:407-428` to assert the count and ordering:
    - `expect(errorCalls).toHaveLength(1)` — prove no double-emit after the fix.
    - Assert the surviving RUN_ERROR's `data.message` matches the chosen canonical source (for Option A: the bridge's `AGENT_STREAM_TIMEOUT_MESSAGE` for crashes — the caller's emit is skipped; OR for Option B: the caller's original error message).
  - Add a new integration-style test that uses `SandboxServiceFake` + real `AguiEventBridgeService` + `AgentService` (not a mock event bridge), exercises `failNextAgentStream()`, and asserts ONE RUN_ERROR (this would catch the bug pre-fix; forces the fix to be validated against the real integration path).

#### [H2] ZOMBIE Daytona session leak when `stop()` or `onModuleDestroy()` fires during `createAgentSession` in-flight

- **Sources:** ech
- **Location:**
  - `apps/agent-be/src/streaming/agui-event-bridge.service.ts:100-112` (`activeRuns.set(conversationId, activeRun)` at line 100 — `handle: null` at construction, then `await this.sandboxService.createAgentSession(sandboxId, command, cwd)` at line 107 — yield point; the activeRun's `handle` field is only assigned at line 112 AFTER createAgentSession resolves)
  - `apps/agent-be/src/streaming/agui-event-bridge.service.ts:199-216` (`stop()` — at lines 205-213, `if (activeRun.handle)` guard skips `terminateAgentSession` when handle is null. The `activeRuns.delete` at line 214 then runs regardless, leaving the soon-to-resolve `createAgentSession` promise detached from the in-memory tracking.)
  - `apps/agent-be/src/streaming/agui-event-bridge.service.ts:218-237` (`onModuleDestroy()` — the same `if (activeRun.handle)` guard at line 224 skips terminate; `activeRuns.clear()` at line 235 then drains the entire Map, leaving any in-flight createAgentSession detached)

- **Detail:** `streamAgentEvents` synchronously sets `activeRuns.set(conversationId, activeRun)` at line 100 — with `handle: null`. Then at line 107 awaits `createAgentSession`, which performs multiple network calls (daytona.get + `sandbox.process.createSession` + `sandbox.process.executeSessionCommand`) and typically takes milliseconds-to-seconds under normal network conditions. If `stop()` (user clicks Stop) or `onModuleDestroy()` (SIGTERM graceful shutdown) fires during this await window:

  - The activeRuns entry exists.
  - `activeRun.handle` is `null` (not yet assigned at line 112).
  - `stop()` / `onModuleDestroy()` execute their cleanup:
    - Set `aborted = true`.
    - Call `clearCircuitBreakerTimer` (only effective if `activeRun.timer` was set — it isn't yet, the raceLoser's setTimeout is registered at line 151 which hasn't been reached; `clearTimeout(null)` returns without error).
    - Call `activeRun.rejectStream?.(...)` — also `null` at this point (assigned at line 150 in the raceLoser setup that hasn't been reached yet); `?.()` is a no-op.
    - **Skip `terminateAgentSession` because `activeRun.handle` is null** (line 205 / line 224 guards).
    - Delete `activeRuns` entry (and `onEventCallbacks` entry).

  Then the in-flight `createAgentSession` call resolves. At that point:
  - Line 112: `activeRun.handle = handle;` — handle successfully created in Daytona (a real `AgentSessionHandle` with `sessionId` and `commandId`).
  - Line 113: `this.onEventCallbacks.set(conversationId, params.onEvent);` — re-creates the entry previously deleted by stop.
  - Line 115+: `buffer = '';` setup, `onStdout`/`onStderr` callbacks defined (with abort checks at lines 117/136 — these correctly short-circuit since `aborted` is true).
  - Line 141: `streamAgentLogs` is called. It runs to completion (the underlying SDK call doesn't know about the abort intent; `onStdout`/`onStderr` are no-op because `aborted` is true, but the Promise still resolves eventually as the underlying sandbox-agent process runs to completion or times out at the SDK level).
  - Line 147: `streamPromise.catch(() => undefined);` guards unhandled rejection.
  - Line 149-156: `raceLoser` is registered — a `setTimeout` that fires after 120s. At that point, line 301's `const run = this.activeRuns.get(conversationId);` returns `undefined` (entry was deleted by stop); line 302's `if (!run || run.aborted) return;` exits early; raceLoser's reject handle is never invoked (the timer actually does call `reject(new Error('AGENT_STREAM_TIMEOUT'))` directly at line 152 — but this rejects the raceLoser promise on the detached `activeRun.rejectStream` path; Promise.race already settled with streamPromise's resolution, so this rejection has no effect).
  - Line 159: `await Promise.race([streamPromise, raceLoser])` settles with streamPromise's normal resolution.
  - Line 160-162: leftover buffer flush — `if (buffer.trim() && !activeRun.aborted)` — buffer is empty (onStdout was no-op due to abort); `!activeRun.aborted` is false; no flush. No emit.
  - The finally block at line 183-196 runs:
    - `clearCircuitBreakerTimer(conversationId)` — no-op (`activeRuns.get(conversationId)` returns undefined).
    - `if (!activeRun.aborted)` — `aborted` is true → SKIP `terminateAgentSession`.
    - `activeRuns.delete(conversationId)` — no-op.
    - `onEventCallbacks.delete(conversationId)` — no-op.

  **Result:** The Daytona session created by `createAgentSession` (referenced by `handle.sessionId`) is NEVER terminated by `agent-be`. It leaks until Daytona GC's it (or never). Each occurrence of this race condition leaves a zombie session in Daytona, holding resources (process, sandbox state) that count toward Daytona quotas.

  Production-reachability:
  - **User clicks Stop right after Send** — within seconds of the turn starting, during `createAgentSession`'s network round trips. The user may click Stop while still seeing the "Preparing sandbox…" or similar state. Realistic.
  - **Graceful shutdown (SIGTERM)** — `onModuleDestroy` fires for an in-flight `createAgentSession`. During deployment, a request that just landed may be at this point in its lifecycle when the SIGTERM arrives.
  - **`SandboxServiceFake.createAgentSession` resolves synchronously** (see `apps/agent-be/test/helpers/sandbox-service.fake.ts:247-252` — no delay between the 3 sub-calls), so this race window is NEVER exercised by the existing test suite. The functional bug is real but uncovered.

  The project-context.md:185 pattern ("State-Map entry cleanup when pre-pipeline setup throws before the try/finally") was applied at `agui-event-bridge.service.ts:107-111`: the existing try/catch handles `createAgentSession` REJECTION (deletes the activeRuns entry on throw). But the case where `createAgentSession` RESOLVES after `stop()` deleted the entry is NOT handled — the activeRun object reference is detached but its handle is now a real Daytona resource that needs cleanup.

  The existing deferred finding "Race: `stop()` emits double `RUN_FINISHED` when called between `activeRuns.set()` and `streamAgentEvents()` start" (line 570 of `deferred-work.md`) is a related concern at the AgentService layer (activeRuns.set there at `agent.service.ts:281` and `streamAgentEvents` call at line 284). That finding describes the double-RUN_FINISHED UX symptom. This H2 finding describes the zombie-session resource leak at the event-bridge layer (activeRuns.set at line 100, `createAgentSession` await at line 107 — DIFFERENT race window inside `streamAgentEvents` itself, not in `runTurn`'s pre-stream setup).

- **Original classifications:** ECH: unhandled path (resource leak on stop-during-pending-create).

- **Remediation:** In `streamAgentEvents`, after `createAgentSession` resolves, check whether the activeRuns entry was deleted during the await (signal that `stop()` ran):
  ```ts
  let handle;
  try {
    handle = await this.sandboxService.createAgentSession(sandboxId, command, cwd);
  } catch (err) {
    this.activeRuns.delete(conversationId);
    throw err;
  }
  // If stop()/onModuleDestroy() ran during the await, the activeRuns entry is
  // gone; we now hold an orphaned Daytona session that needs cleanup.
  if (!this.activeRuns.has(conversationId)) {
    await this.sandboxService
      .terminateAgentSession(sandboxId, handle.sessionId)
      .catch((err) =>
        this.logger.error(
          `Cleaned up orphaned agent session for ${conversationId} after stop-race: ${err}`,
        ),
      );
    throw new Error('AGENT_STOPPED');  // re-throw as a sentinel so runTurn's catch skips RUN_ERROR
  }
  activeRun.handle = handle;
  ```
  (If the original trigger was `onModuleDestroy` vs `stop()`, the sentinel could be `MODULE_DESTROYING` instead — but distinguishing requires tracking which method set the abort flag. The simpler approach uses one sentinel (`AGENT_STOPPED`) for both, since the caller's behavior is identical: skip RUN_ERROR, skip RUN_FINISHED.)

  Add a regression-guard test in `agui-event-bridge.service.spec.ts`:
  - Set the `SandboxServiceFake.createAgentSession` to delay 200_000ms (would require adding a `setCreateSessionDelay()` control hook to the fake, similar to `setAgentStreamDelay()`).
  - Start `streamAgentEvents` (don't await — it's pending in createAgentSession).
  - Advance timers 0ms so the activeRuns.set and the await start.
  - Call `service.stop('conv-1')`.
  - Advance timers further so `createAgentSession` resolves.
  - Assert `sandboxFake.getTerminatedSessions()` includes the session that was created after stop.
  - Assert `streamPromise` rejects with `AGENT_STOPPED`.

  Without this fix, any user-initiated stop during `createAgentSession`'s network round trips produces a Daytona zombie session — the bug-hunt's H2 finding.

### Medium

#### [M3] AgentService.stop()'s `Promise.allSettled(pendingPromises)` is vacuous — `runTurn`'s finally has already deleted the Map entry during the await of `aguiEventBridgeService.stop()`

- **Sources:** tfa+cr (merged)
- **Location:**
  - `apps/agent-be/src/streaming/agent.service.ts:377-399` (`AgentService.stop` — captures `pendingClassifierPromises.get(conversationId)` AFTER awaiting `aguiEventBridgeService.stop` at lines 383-385; the Map entry may have been deleted by then by `runTurn`'s finally)
  - `apps/agent-be/src/streaming/agent.service.ts:346-374` (`runTurn` catch + finally — the sentinel branch at lines 348-356 intentionally skips `Promise.allSettled` on the assumption that `stop()` will drain the promises; the finally at lines 371-374 deletes the Map entry without awaiting)
  - `apps/agent-be/src/streaming/agui-event-bridge.service.ts:199-216` (`aguiEventBridgeService.stop` — calls `rejectStream` synchronously at line 204 which races the `runTurn` catch's microtask chain to complete via `Promise.race` → re-throw → `runTurn` catch → `runTurn` finally)

- **Detail:** `AgentService.stop` is structured to await pending classifier/working-tree promises before emitting `RUN_FINISHED` (lines 387-390), mirroring `runTurn`'s normal-completion path that awaits `pendingClassifierPromises` before `RUN_FINISHED` (lines 293-296) per project-context.md:160 rule ("Await pending event-emitting promises before run completion").

  However, the await chain has a microtask-ordering race:
  1. `AgentService.stop` at line 383: `await this.aguiEventBridgeService.stop(conversationId).catch(...)`.
  2. `aguiEventBridgeService.stop` synchronously sets `aborted = true` (line 202), calls `clearCircuitBreakerTimer` (line 203), then calls `rejectStream?.(new Error('AGENT_STOPPED'))` (line 204). `raceLoser` rejects synchronously.
  3. `aguiEventBridgeService.stop` then `await`s `this.sandboxService.terminateAgentSession(...)` (lines 206-213) — a network call (Daytona `deleteSession`) that takes milliseconds-to-seconds.
  4. During this `await`, the JS event loop drains the microtask queue:
     - `Promise.race` in `streamAgentEvents` (line 159) picks `raceLoser`'s rejection.
     - `streamAgentEvents` catch block fires (line 163): `!activeRun.aborted` is false (stop set aborted=true synchronously before calling rejectStream). Skip `terminateAgentSession`, skip `emitRunError`. Re-throw `AGENT_STOPPED` (line 182).
     - `streamAgentEvents` finally block fires (lines 183-196): `clearCircuitBreakerTimer`, skip `terminateAgentSession` (aborted is true), delete `activeRuns` + `onEventCallbacks` entries.
     - Re-throw propagates to `runTurn`'s `await this.aguiEventBridgeService.streamAgentEvents(...)` promise (lines 284-291) — the await settles.
     - `runTurn`'s catch block fires (line 346): `errorMessage === AGENT_STOPPED` matches the sentinel → skip the else branch (the else branch would await pendingPromises and emit RUN_ERROR).
     - `runTurn`'s finally block fires (lines 371-374): `this.pendingClassifierPromises.delete(conversationId)` AND `this.activeRuns.delete(conversationId)`.
     - `runTurn`'s promise settles.
  5. `aguiEventBridgeService.stop`'s `await terminateAgentSession` resolves.
  6. `aguiEventBridgeService.stop` returns.
  7. `AgentService.stop` resumes from line 383's await. Reads `this.pendingClassifierPromises.get(conversationId)` (line 387) → returns `undefined` (entry deleted in step 4e). The `?? []` fallback makes it an empty array. Lines 388-390 `if (pendingPromises.length > 0)` is false — skips the `await Promise.allSettled(pendingPromises)` call.
  8. `AgentService.stop` emits `RUN_FINISHED` (lines 392-395).

  But the original pendingPromises (`Promise<unknown>[]`) CONTINUE executing asynchronously — their `.then()` callbacks fire after step 8, emitting SSE events (`TOOL_CALL_PROMOTED`, `WORKING_TREE_DIRTY`, `WORKING_TREE_CLEAN`, etc.) AFTER `RUN_FINISHED` is emitted on the SSE channel.

  This is the same class of issue as the previously-deferred finding (deferred-work.md:571 — "Pending classifier promises not awaited in catch block — events arrive after `RUN_ERROR`") but for a DIFFERENT code path. That earlier finding was for the non-sentinel RUN_ERROR reject path, which was FIXED by adding `await Promise.allSettled(pendingPromises)` to `runTurn`'s else branch (lines 357-365). TheAgAGENT_STOPPED path (sentinel rejection) intentionally skips the await because it relies on `stop()` to drain — but `stop()`'s await is itself broken by the Map-deletion race, so the promises are never drained before RUN_FINISHED.

  Production-reachability: every user-initiated Stop triggers this when there are in-flight classifier/working-tree promises (typical mid-turn). The downstream consequence: tool-call-result pills, tool-call-promoted pills, working-tree indicators may appear on the frontend AFTER the run appears to have finished. The frontend state shows "idle" (because RUN_FINISHED was emitted), then a pill appears momentarily. UX impact: confusing visual artifacts; minimal data impact (no record is lost — the promises' side effects all fire sequentially; just out of order with the lifecycle event).

  Partial mitigation: pendingPromises always have `.catch(...)` chains (lines 217-219, 242-244), so they never cause unhandled-rejection crashes. The events ARE emitted eventually, just after RUN_FINISHED. The frontend typically shows them as transient UI updates while the user is navigating away.

- **Original classifications:**
  - TFA: Gap C (test-fidelity gap — `createMockEventBridge`'s stop at line 117 is `jest.fn().mockResolvedValue(undefined)`, doesn't reject the in-flight streamAgentEvents, so the timing race in the integration is unmodeled)
  - CR: patch (control-flow coupling — Service A's finally and Service B's stop both touch the same Map entry; ordering depends on await chain microtask drainage)

- **Remediation:** Capture the pendingPromises array reference EARLY in `stop()` — before awaiting `aguiEventBridgeService.stop`:
  ```ts
  async stop(conversationId: string): Promise<void> {
    const activeRun = this.activeRuns.get(conversationId);
    if (!activeRun) return;

    // Capture the pendingPromises array reference EARLY — runTurn's finally
    // will delete the Map entry during the await of aguiEventBridgeService.stop(),
    // so a post-await get() would return undefined and miss the promise references.
    const pendingPromises = this.pendingClassifierPromises.get(conversationId) ?? [];

    await this.aguiEventBridgeService.stop(conversationId).catch(...);

    if (pendingPromises.length > 0) {
      await Promise.allSettled(pendingPromises);  // use the captured reference, not a Map.get() re-read
    }

    this.sessionEvents.emit(conversationId, { event: EventType.RUN_FINISHED, data: {} });

    this.pendingClassifierPromises.delete(conversationId);
    this.activeRuns.delete(conversationId);
  }
  ```
  The Map delete in `runTurn`'s finally is harmless — `stop()` holds the array reference directly, so the await works on the same promise array.

  Add a regression-guard test that:
  - Uses `createControllableEventBridge` (which properly simulates `stop` rejecting the in-flight streamAgentEvents).
  - Sets up a `TOOL_CALL_RESULT` event with a `mockClassifier.classifyToolResult` returning a promise that's delayed (e.g., resolves after `await new Promise(r => setTimeout(r, 100))`).
  - Calls `stop()` while the agent is mid-turn.
  - Asserts that `TOOL_CALL_PROMOTED` (or `WORKING_TREE_DIRTY`) is emitted BEFORE `RUN_FINISHED` — verifying the await ordering.

---

## Pre-existing findings reviewed and NOT reported (out of scope for Epic 6)

Reviewed but pre-existing or out of Epic 6's sandbox-execution scope. Not counted toward the finding total above.

- **`mock-daytona.ts` spec verification:** Story 6.2 mock at the SDK boundary; tests at `sandbox.service.session.spec.ts:174-192` use `require('@daytonaio/sdk')` for real error classes (`DaytonaNotFoundError`, `DaytonaAuthorizationError`) per project-context.md:284 pattern. The Daytona SDK contract is asserted (e.g., `executeSessionCommand` returns `{ cmdId, exitCode }` at session spec lines 57-67). No fidelity gap observed.
- **`AgentServiceFake` working-tree emission awaits inline vs. `pendingClassifierPromises`:** pre-existing fake divergence from Story 3.6 (deferred in `bug-hunt-epic-5-story-5-5-interleaved-pills.md` line 105-125). Not addressed by Epic 6 (Epic 6 migrated production `AgentService` to sandbox-execution but left `AgentServiceFake` unchanged — and `agent.service.unit.spec.ts` uses `createMockEventBridge` instead of `AgentServiceFake` anyway). Pre-existing.
- **`onModuleDestroy()` clearing `pendingClassifierPromises` without draining:** deferred (deferred-work.md:539). Partially covered by M3 (sentinel path use-after-delete) but for full `ModuleDestroy` drain (where `SessionEventsService` is being torn down simultaneously — the events emit to completed subjects, becoming no-ops), still deferred. Distinct concern from M3 (M3 is about user-stop timing; this is about shutdown timing).
- **`injectGitConfig()` empty-error-message bug (F4 sibling):** pre-existing from Story 3.6; deferred at deferred-work.md:555. Story 6.4's F4 fix at `commit()` only addressed `commit()`, not the sibling `injectGitConfig()` at lines 192-203 of `sandbox.service.ts`. The code review Dismiss was "git config writes its error to stdout" — factually incorrect per Story 6.4's NFR audit, but the project-context.md:163 fix wasn't propagated to `injectGitConfig`. Pre-existing pattern.
- **`listSkills()` exitCode gate returns `[]` without logging:** deferred (deferred-work.md:554). Story 6.4 added the `exitCode !== 0` gate at `sandbox.service.ts:259-261` but did not add the `logger.warn` per project-context.md:147 ("`logger.warn()` in catch blocks that return a default value"). Subtle issue — the `exitCode !== 0` check is at line 259 which is INSIDE the `try` block (not the `catch`), so the project-context.md:147 rule (specifically about catch blocks) doesn't strictly apply. Pre-existing ambiguity.
- **`installBinaries()` throw sites lack `|| exit code` fallback:** deferred (deferred-work.md:562). Story 6.4's F4 pattern wasn't propagated to `installBinaries()` at `sandbox.service.ts:304/314/324/334`. Each throw uses `${response.result}` which is empty on real failures (stdout-only). Pre-existing.
- **POST `/api/internal/test/artifacts` missing input validation:** deferred (deferred-work.md:590). Story 6.5's P4 fix added idempotency via `upsert()` but didn't add validation for `artifacts` shape. Test-only route. Pre-existing.
- **`buildAgentCommand` does not validate message content (empty message → `--prompt ''`):** deferred (deferred-work.md:540). SendMessageDto's `.min(1)` cap should reject empty messages at the controller boundary, but validation isn't verified at the sandbox-execution path. Pre-existing input-validation concern.
- **`AgentService`'s `turn.create` + `conversation.update` not in a transaction:** (agent.service.ts:321-334) — pre-existing pattern from Story 3.x; `conversation.update` sets `lastActiveAt` and a failure leaves a stale timestamp (no data loss). Not addressed by Epic 6 — out of scope for the bug-hunt architectural focus.
- **Hunt scope vs. Epic 6 git diff:** the Epic 6 commits (751489d..dbac901) touched some non-Epic-6-overlay files (e.g., `ChatMessageList.test.tsx`, `RepositoryUrlForm.test.tsx`, `ArtifactViewer.test.tsx`, `ArtifactCard.test.tsx`, `SideNavigation.test.tsx`, `tailwind-theme.spec.ts`, `auto-scroll-session-timeout.spec.ts`, `story-5-4-token-usage-drift.spec.ts`). I scoped to the explicit Epic 6 production code (sandbox execution migration, real-service e2e, artifacts-route idempotency) and excluded incidental test churn from merges.
- **`SandboxServiceFake.provision()` stores `'simulated-allow-list'` instead of the real `SANDBOX_NETWORK_ALLOW_LIST = '0.0.0.0/32'`:** deferred (deferred-work.md:513). The fake records a different string than production; tests that assert on `getNetworkAllowList(sandboxId)` get the fake's string, not production value. The real-service e2e tests (Story 6.5) would catch the real value but are env-var gated. Pre-existing test fidelity concern.

---

## Autonomous decisions (in place of halting at checkpoints)

1. **Target scope:** Committed Epic 6 commits (751489d..dbac901) changed ~50 files. I scoped the bug hunt to the Epic 6 production source (the 9 files in `apps/agent-be/src/` + `apps/web/src/app/api/internal/test/artifacts/route.ts`) + their co-located/integration tests. Excluded: `_bmad-output/` markdown specs/summaries, `n8n/workflows/*.json` (workflow definition not code), `.gitignore`, build artifacts. The 5 real-service Playwright specs in `playwright/e2e/real-service/` were inspected but not executed (env-var gated — operational prerequisites per deferred-work.md:591).
2. **Subagent fallback:** The bug-hunt skill delegates TFA/ECH/CR to subagents. This session runs as a single inline agent — I executed all three layers inline (subagent-fallback mode, per step-02 rule instruction 2 and step-03 instruction 3). No `bug-hunt-tfa-prompt.md` / `bug-hunt-ech-prompt.md` / `bug-hunt-cr-prompt.md` prompt files written.
3. **TFA scope expansion:** TFA's plan was to audit target test files for false-green contracts. I extended it to ALSO verify behavior parity with the integration cross-service flow (does the mock at the `AgentService` layer actually model the real event bridge's side effects?). This caught H1's mock-fidelity gap (`createMockEventBridge.streamAgentEvents.mockRejectedValueOnce` doesn't model `emitRunError`'s pre-throw emit). Verified by running `yarn nx test agent-be -- --testPathPattern="(agui-event-bridge.service.spec|agent.service.unit.spec)"` → 32 suites / 791 tests passed (which is itself evidence the integration tests give false confidence — they pass vacuously).
4. **Severity calibration:** Two findings classified as HIGH (H1, H2) and one as MEDIUM (M3).
   - H1 (double-RUN_ERROR): I considered downgrading to MEDIUM (the frontend eventually shows the right error via the second RUN_ERROR overwriting the first), but kept HIGH because: (a) the false-green test actively hides the bug from CI; (b) project-context.md:184 lifecycle-ownership rule is violated; (c) the misleading first RUN_ERROR message (`AGENT_STREAM_TIMEOUT_MESSAGE` for non-timeout crashes) is itself an operator-facing annoyance; (d) production-reachable on any non-sentinel stream failure (Daytona SDK issue, sandbox-agent crash, network issue — events realistic during incidents). Per step-05 rule "prefer the more conservative classification when uncertain," HIGH is the conservative choice.
   - H2 (zombie session leak): HIGH because the resource leak is unrecoverable (zombie sessions stay in Daytona until externally GC'd) and the production-reachability is realistic (user clicks Stop within seconds of starting a conversation; SIGTERM during graceful shutdown). Per project-context.md:179 ("Per-call timeouts on Daytona SDK `executeCommand`/`uploadFile`") implied principle: any Daytona resource allocation requires explicit cleanup.
   - M3 (vacuous pendingPromises await): MEDIUM. The promises eventually drain (just out-of-order with `RUN_FINISHED`), visible to users as a transient UI artifact, recoverable. The deferred-work:571 precedent for the analogous RUN_ERROR path didn't carry a severity classification (pre-severity-discipline era) — by comparison M3 is the parallel for the AGENT_STOPPED path, warranting equal-or-lower severity. Per step-05 rule, since the consequence is recoverable, MEDIUM is honest.
5. **Quick-win fixes deliberately NOT applied inline:** All three findings (H1, H2, M3) require user decision on the fix path (which sentinel pattern to use, which test fidelity approach). Per step-04 CR rule "If there is no diff, CR handles it via file-list mode" and per the bug-hunt's step-05 "Be precise. When uncertain between classifications, prefer the more conservative classification" — I refrained from editing production code to avoid entangling the bug-hunt with the fix (the report records remediation options for the user to decide).
6. **Verified prior deferred findings:** Reviewed all 25 Epic-6-related deferred entries in `deferred-work.md` (lines 511-610). Closed 8 ("opencode session investigation" entries for `tc-Date.now()`, cost-data `undefined`, `createAgentSession rejection activeRuns leak`, `onEvent sync throw double-RUN_ERROR`, test never-resolving promise, `abortPromise` listener, `iterator.return`, race-condition events after RUN_ERROR from circuit breaker — the last 3 trace to pre-6.3 code paths that no longer exist). 1 partially fixed (M3 extends it). 4 still open and re-validated as still relevant. Each Epic 6 deferred finding's status is recorded in the "Prior bug-hunt findings status" table above.
7. **Tests run baseline:** `yarn nx test agent-be -- --testPathPattern="(agui-event-bridge.service.spec|agent.service.unit.spec)"` → 32 suites / 791 tests passed. Confirms the false-green nature of the suite against H1 — the integration tests vacuously pass on the double-RUN_ERROR bug.
8. **Hunt scope vs. coverage limit:** H1 and H2 are located in the cross-service integration boundary — exactly the area where single-file unit tests fail to catch bugs. The fake-based integration test (one using SandboxServiceFake + real AguiEventBridgeService + real AgentService) would catch BOTH H1 and H2; that test does not exist. The mock-based unit tests are structurally inadequate for verifying cross-service sentinel contracts. Recommend adding such an integration test as part of fixing H1/H2.

## Blockers / items for the user to decide

1. **H1 fix path:** Option A (4th sentinel `STREAM_CRASHED` for non-sentinel re-throws, minimal change to existing sentinel architecture) vs Option B (refactor `emitRunError` to route through `onEvent` lifecycle dispatch — more invasive but eliminates the "two emitters, one event" pattern). Recommend Option A.
2. **H2 fix path:** Capture-options:
   - a) Pre-createAgentSession race guard (check `activeRuns.has(conversationId)` after the await; if gone, terminate orphaned handle and throw AGENT_STOPPED).
   - b) Wrap the post-createAgentSession flow in an abort-check — `if (activeRun.aborted) { await terminateAgentSession(...); throw new Error('AGENT_STOPPED'); }` immediately after the await at line 107.
   - c) Move `activeRuns.set()` AFTER `createAgentSession` resolves — but this widens the window where `stop()` finds NO entry (no way to short-circuit a stop request mid-createAgentSession), which could violate the existing "stop is responsive" contract.
   - Recommend Option (a) — adds an explicit orphan-cleanup path.
3. **M3 fix path:** Straightforward (capture `pendingPromises` reference early, before the await). Test-level question: does the user want a regression-guard test added to `agent.service.unit.spec.ts`, or is the bug fix alone sufficient (the microtask-timing test is somewhat elaborate to set up with `createControllableEventBridge` + delayed classifier)?
4. **No immediate-attention blocker:** None of the findings constitute a Critical severity (no data loss, no security boundary bypass, no production crash). H1 and H2 are HIGH-severity but only trigger under specific failure modes (stream crashes; rapid stop-during-createAgentSession). They DO warrant attention before the next production deploy (since the false-green tests give misleading CI confidence). M3 is MEDIUM and can be scheduled as a follow-up.
5. **Follow-up work:** Should I run `bmad-quick-dev` to fix H1, H2, M3, OR `bmad-investigate` to trace stream-crash real-world likelihood deeper, OR end the workflow? [_HALT — waiting for user choice (per step-05 instruction 7)._]

---

## Files inspected (full or targeted)

Production source:
- `apps/agent-be/src/streaming/agui-event-bridge.service.ts` (324 lines — full read)
- `apps/agent-be/src/streaming/agent.service.ts` (443 lines — full read)
- `apps/agent-be/src/sandbox/sandbox.service.ts` (406 lines — full read)
- `apps/agent-be/src/streaming/streaming.module.ts` (23 lines — full read)
- `apps/agent-be/jest.config.ts` (21 lines — full read)
- `apps/web/src/app/api/internal/test/artifacts/route.ts` (71 lines — full read)

Test files:
- `apps/agent-be/src/streaming/agui-event-bridge.service.spec.ts` (923 lines — full read)
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (1522 lines — sampled navigation, focus on lines 75-525 and 1495-1522)
- `apps/agent-be/src/sandbox/sandbox.service.session.spec.ts` (326 lines — full read)
- `apps/agent-be/test/helpers/sandbox-service.fake.ts` (289 lines — full read)
- `apps/web/src/app/api/internal/test/artifacts/route.test.ts` (referenced for context)
- `playwright/e2e/artifact-browser/artifacts-fixture-idempotency.spec.ts` (95 lines — full read)
- `playwright/e2e/real-service/egress-control.spec.ts` (171 lines — full read)

Epic 6 deferred findings / context:
- `_bmad-output/implementation-artifacts/deferred-work.md` (610 lines — full read, lines 511-610 are Epic-6-specific; lines 537-585 are the "opencode session investigation" appraisal set)
- `_bmad-output/project-context.md` (lines 1-200, plus pattern search — project-context.md:176-185 specifically on Epic 6 patterns: SDK typed error classes, resource cleanup, defense-in-depth ANTHROPIC_API_KEY guard, per-call timeouts, Promise.race + stored reject handle, bounded line buffer, sentinel-string contract, mutable container object, onEvent lifecycle ownership, state-Map entry cleanup)
- `_bmad-output/implementation-artifacts/bug-hunt-epic-5-story-5-5-interleaved-pills.md` (314 lines — full read; format reference for this report)
- `.claude/skills/bmad-bug-hunt/steps/step-{01..05}-*.md` (all 5 step files — full read; workflow guidance)
