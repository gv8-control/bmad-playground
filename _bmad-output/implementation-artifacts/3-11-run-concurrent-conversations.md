---
baseline_commit: 8ec0d273731fa161cdd458de4af1804386ed3785
---

# Story 3.11: Run Concurrent Conversations

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user juggling multiple BMAD workflows,
I want to have several Conversations active at once,
so that I'm not blocked working through one Skill at a time.

## Acceptance Criteria

### AC-1: A user with fewer than 10 active Conversations opens a new one — independent sandbox + stable URL

**Given** a user has fewer than 10 active Conversations
**When** they open a new one
**Then** it runs with an independent Sandbox and chat history at its own stable URL (FR11)
**And** the SSE transport supports 10 concurrent connections per browser session without connection starvation, requiring an HTTP/2-capable reverse proxy in front of `apps/agent-be` (NFR-R4)

### AC-2: A user with 10 active Conversations is blocked with a "session limit reached" message

**Given** a user already has 10 active Conversations
**When** they attempt to open another
**Then** they see a "session limit reached" message rather than a silent failure (FR11)

### AC-3: A second concurrent `runTurn` on the same conversation is rejected, not allowed to orphan the first

**Given** a second `runTurn` is invoked on a `conversationId` that already has an in-flight agent turn
**When** the second call arrives
**Then** it is rejected or queued — not allowed to overwrite the first turn's `activeRuns` and `circuitBreakerTimers` entries — so the first turn is not orphaned mid-execution

### AC-4: Retry cancels in-flight provisioning before minting a new conversation

**Given** a user clicks retry while in-flight provisioning for a new conversation is already running and `initialConversationId` is undefined
**When** the retry click fires
**Then** the previous in-flight provisioning is cancelled (Daytona sandbox torn down, DB row removed) before minting a new conversation, so retry does not leak sandboxes and rows across repeated clicks

## Tasks / Subtasks

- [x] Task 1: Per-user concurrent-conversation count check in `createConversation` (AC: 1, 2)
  - [x] 1.1 In `apps/agent-be/src/conversations/conversations.service.ts`, add a module-level constant following the env-configured-numeric-threshold IIFE pattern (project-context.md "Env-configured numeric thresholds"):
    ```typescript
    const MAX_CONCURRENT_CONVERSATIONS = (() => {
      const parsed = parseInt(process.env.MAX_CONCURRENT_CONVERSATIONS ?? '10', 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
    })();
    ```
    Deliberately NOT added to `env.validation.ts` (Zod schema) — the var is optional with a fallback; Zod would make it required, contradicting the optional-with-default design. Same pattern as `CIRCUIT_BREAKER_TIMEOUT_MS` / `SPEND_ALERT_THRESHOLD_USD`.
  - [x] 1.2 Add a private helper `countActiveConversations(userId: string): Promise<number>` that counts the user's conversations with a live or provisioning sandbox. Implementation: query Postgres for the user's conversation IDs, then count those whose in-memory `sandboxStatuses` entry is `'provisioning'` or `'ready'`:
    ```typescript
    private async countActiveConversations(userId: string): Promise<number> {
      const conversations = await this.prisma.conversation.findMany({
        where: { userId },
        select: { id: true },
      });
      let active = 0;
      for (const conv of conversations) {
        const status = this.sandboxStatuses.get(conv.id);
        if (status === 'provisioning' || status === 'ready') {
          active++;
        }
      }
      return active;
    }
    ```
    "Active" = sandbox is provisioning or ready (live/provisioning sandbox). Idle-timed-out (`'idle-timeout'`) and failed (`'failed'`) conversations do NOT count — their sandboxes are gone. See Decision Records (DP-2) for the rationale and the restart-unreliability limitation.
  - [x] 1.3 In `createConversation` (line 36), add the count check BEFORE `prisma.conversation.create`:
    ```typescript
    async createConversation(userId: string): Promise<{ id: string }> {
      const activeCount = await this.countActiveConversations(userId);
      if (activeCount >= MAX_CONCURRENT_CONVERSATIONS) {
        throw new ConflictException({
          code: 'CONVERSATION_LIMIT_REACHED',
          message: "You've reached the limit of 10 active conversations. Return to one of your existing conversations, or try again later.",
          meta: { limit: MAX_CONCURRENT_CONVERSATIONS },
        });
      }
      const conversation = await this.prisma.conversation.create({ ... });
      // ... rest unchanged
    }
    ```
    Import `ConflictException` from `@nestjs/common`. The global `HttpExceptionFilter` (line 29-43) maps this to a 409 response with body `{ code: 'CONVERSATION_LIMIT_REACHED', message, meta: { limit: 10 } }`. The `code` field is what the frontend keys on (AC-2).

- [x] Task 2: Frontend — "Conversation limit reached" blocking state (AC: 2)
  - [x] 2.1 In `apps/web/src/components/conversation/ConversationPane.tsx`, add `'limit-reached'` to the `SessionState` union type (line 17).
  - [x] 2.2 In `startSession()` (lines 115-598), the `POST /api/conversations` error-handling sub-block (lines 133-137) currently sets a generic `errorMessage`. Replace the `!response.ok` branch with code that detects the limit-reached error code:
    ```typescript
    if (!response.ok) {
      if (response.status === 409) {
        let code: string | undefined;
        try { code = (await response.json()).code; } catch { /* not JSON */ }
        if (code === 'CONVERSATION_LIMIT_REACHED') {
          setState('limit-reached');
          setErrorMessage(
            "You've reached the limit of 10 active conversations. Return to one of your existing conversations, or try again later."
          );
          return;
        }
      }
      setState('error');
      setErrorMessage('Failed to create conversation.');
      return;
    }
    ```
    The `response.json()` parse must be wrapped in try/catch (project-context.md "try/catch around JSON.parse in every fetch error handler" — the same robustness rule that applies to SSE handlers applies here: a malformed body must not crash the handler).
  - [x] 2.3 Update `inputDisabled` (line 806) to include `state === 'limit-reached'` — the chat input is hidden when the limit is reached (UX spec: "the chat input is not shown").
  - [x] 2.4 The Retry button renders for `state === 'timeout' || state === 'error'` (line 832). Do NOT add `'limit-reached'` — the limit is not a transient error; the user must navigate to an existing conversation. The side nav's New Conversation button stays enabled (UX spec line 233) — the block is on the page, not on navigation.
  - [x] 2.5 When `state === 'limit-reached'`, the `errorMessage` paragraph (line 827-831) renders the blocking message in the chat area. The intro prompt and chat input are hidden (input disabled + no prompt rendered for non-`'ready'` states). Verify the message renders in place of the introductory prompt per the UX spec ("a blocking message in the chat area in place of the introductory prompt").

- [x] Task 3: Concurrent-turn guard in `AgentService.runTurn` (AC: 3)
  - [x] 3.1 In `apps/agent-be/src/streaming/agent.service.ts`, add a guard at the TOP of `runTurn` (line 54), BEFORE `this.sessionEvents.emit(conversationId, { event: 'RUN_STARTED' ... })` (line 59) and BEFORE `this.activeRuns.set(...)` (line 94):
    ```typescript
    async runTurn(params: AgentRunParams): Promise<void> {
      const { conversationId, sandboxId, message, userId } = params;

      if (this.activeRuns.has(conversationId)) {
        this.logger.warn(
          `Concurrent runTurn rejected for conversation ${conversationId} — a turn is already in flight`,
        );
        return;
      }

      const processId = `agent-${conversationId}`;
      // ... rest unchanged
    }
    ```
    The guard is a **silent rejection** (log + return void, no SSE event). Rationale (DP-3): the UI already disables input during processing (project-context.md), so this is a backend safety net against a UI-prevented race (two tabs, programmatic double-submit). Emitting a `RUN_ERROR` would broadcast to ALL SSE subscribers for the conversation — including the tab running the first turn — causing the first tab to incorrectly show "agent stopped unexpectedly." Silent rejection avoids disrupting the first turn. The second caller's `runAgentTurn` proceeds to `flushPendingCommit` (no-op, nothing pending) and `idleTimeout.startTimer` (resets the timer — user is active, acceptable). See Decision Records.
  - [x] 3.2 Fix `startCircuitBreakerTimer` (line 263-269) to clear any pre-existing timer before setting a new one — defensive against orphaned timers from a crashed prior run (deferred-work.md:254, 267):
    ```typescript
    private startCircuitBreakerTimer(conversationId: string): void {
      this.clearCircuitBreakerTimer(conversationId);
      const timer = setTimeout(() => {
        this.handleCircuitBreaker(conversationId);
      }, CIRCUIT_BREAKER_TIMEOUT_MS);
      timer.unref?.();
      this.circuitBreakerTimers.set(conversationId, timer);
    }
    ```
    With the Task 3.1 guard, `startCircuitBreakerTimer` is only called when no active run exists, so an existing timer is unlikely. But `clearCircuitBreakerTimer` is idempotent (no-op if no entry), so the defensive clear is zero-cost belt-and-suspenders. This closes the "stale circuit breaker timer from prior run fires on new run" deferred finding.

- [x] Task 4: Backend — `abandonConversation` method + cancellation check in `provisionSandbox` (AC: 4)
  - [x] 4.1 In `apps/agent-be/src/conversations/conversations.service.ts`, add a private `cancelledConversations = new Set<string>()` field alongside the existing `sandboxStatuses` / `sandboxIds` maps (line 22-23).
  - [x] 4.2 Add a public `abandonConversation(conversationId: string, userId: string): Promise<{ conversationId: string; abandoned: boolean }>` method:
    ```typescript
    async abandonConversation(
      conversationId: string,
      userId: string,
    ): Promise<{ conversationId: string; abandoned: boolean }> {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
      });
      if (!conversation) {
        return { conversationId, abandoned: false };
      }

      this.cancelledConversations.add(conversationId);

      const sandboxId = this.sandboxIds.get(conversationId);
      if (sandboxId) {
        try {
          await this.sandboxService.destroy(sandboxId);
        } catch (err) {
          this.logger.error(`Failed to destroy sandbox ${sandboxId} on abandon: ${err}`);
        }
      }

      this.idleTimeout.clearTimer(conversationId);
      this.sandboxStatuses.delete(conversationId);
      this.sandboxIds.delete(conversationId);

      try {
        await this.prisma.conversation.delete({ where: { id: conversationId } });
      } catch (err) {
        this.logger.error(`Failed to delete conversation ${conversationId} on abandon: ${err}`);
      }

      this.sessionEvents.complete(conversationId);

      return { conversationId, abandoned: true };
    }
    ```
    Idempotent: if the conversation doesn't exist (already deleted), returns `{ abandoned: false }` without error. The `findFirst({ where: { id, userId } })` is the tenant-authorization check (project-context.md "`findFirst` for tenant-scoped lookup"). The `conversation.delete` uses `where: { id }` (not compound) — safe because the `findFirst` already verified ownership. The `ON DELETE CASCADE` on `Turn` and `CostRecord` FKs cleans up child rows automatically (acceptable for an abandoned conversation that never reached SESSION_READY — no meaningful turns or cost data).
  - [x] 4.3 In `provisionSandbox` (line 53-135), add cancellation checks at two checkpoints — after `provisionQueue.acquire` (catches cancellation while waiting for a slot) and after `sandboxService.provision` (catches cancellation during sandbox creation):
    ```typescript
    async provisionSandbox(conversationId: string, userId: string): Promise<void> {
      let sandboxId: string | null = null;
      try {
        await this.provisionQueue.acquire(userId);

        if (this.cancelledConversations.has(conversationId)) {
          this.logger.log(`Provisioning cancelled for conversation ${conversationId} after queue acquire`);
          return;
        }

        // ... repoConnection, credential, gitConfig lookups ...

        const sandbox = await this.sandboxService.provision({ ... });
        sandboxId = sandbox.sandboxId;

        if (this.cancelledConversations.has(conversationId)) {
          this.logger.log(`Provisioning cancelled for conversation ${conversationId} after sandbox provision`);
          await this.sandboxService.destroy(sandboxId);
          return;
        }

        this.sandboxIds.set(conversationId, sandboxId);
        // ... rest unchanged (clone, injectGitConfig, working tree, SESSION_READY, idle timer)
      } catch (err) {
        // ... existing catch block unchanged
      } finally {
        this.provisionQueue.release(userId);
        this.cancelledConversations.delete(conversationId);
      }
    }
    ```
    The `cancelledConversations.delete` in `finally` cleans up the entry whether the provisioning was cancelled, failed, or succeeded normally. If `abandonConversation` is called AFTER `provisionSandbox` already completed (past all checkpoints), the `sandboxIds` entry exists and `abandonConversation` destroys the sandbox directly — the `cancelledConversations` entry is stale but never read again (no future `provisionSandbox` for a deleted conversation). See Decision Records for the stale-entry note.

- [x] Task 5: Backend — `DELETE /:id` controller endpoint (AC: 4)
  - [x] 5.1 In `apps/agent-be/src/conversations/conversations.controller.ts`, import `Delete` from `@nestjs/common` (line 1) and add the endpoint:
    ```typescript
    @Delete(':id')
    async abandonConversation(
      @Param('id') id: string,
      @User() user: UserContext,
    ): Promise<{ conversationId: string; abandoned: boolean }> {
      return this.conversationsService.abandonConversation(id, user.id);
    }
    ```
    The global `BoundaryJwtGuard` + `ActiveUserGuard` apply (registered as `APP_GUARD` in `AppModule`). The `@User()` decorator provides the authenticated `UserContext`. No DTO needed (DELETE has no body). Returns 200 with `{ conversationId, abandoned }` on success (follows the "raw resource body on success" pattern from project-context.md). If the conversation doesn't exist, returns `{ abandoned: false }` with 200 (idempotent — not a 404, because the caller's intent "ensure this conversation is gone" is satisfied).

- [x] Task 6: Frontend — `handleRetry` cancels in-flight provisioning before minting new (AC: 4)
  - [x] 6.1 In `apps/web/src/components/conversation/ConversationPane.tsx`, make `handleRetry` (line 780-789) async and add the cancel-before-mint-new logic. The cancel only fires when `initialConversationId` is undefined (new conversation) AND `conversationIdRef.current` is set (a previous attempt minted a conversation). For existing conversations (`initialConversationId` defined), keep the current resume behavior (do NOT delete — the user owns that conversation):
    ```typescript
    async function handleRetry() {
      eventSourceRef.current?.close();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      queuedMessageRef.current = null;
      setQueuedMessage(null);
      setErrorMessage(null);

      if (!initialConversationId && conversationIdRef.current) {
        const oldId = conversationIdRef.current;
        conversationIdRef.current = null;
        setConversationId(null);
        try {
          await fetch(`${apiUrl}/api/conversations/${oldId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${boundaryJwt}` },
          });
        } catch {
          // best-effort cleanup — don't block retry on cleanup failure
        }
      }

      void startSession();
    }
    ```
    The `conversationIdRef.current = null` + `setConversationId(null)` BEFORE `startSession()` ensures `startSession` sees `conversationIdRef.current === null` → `isResume = false` → mints a NEW conversation (POST /api/conversations). The DELETE is awaited before `startSession()` so the old provisioning is cancelled before the new one starts. The DELETE failure is swallowed (best-effort — the old conversation row may be orphaned, but the new conversation proceeds; the orphaned row has no sandbox and doesn't count against the cap since its status is 'failed' or absent from `sandboxStatuses`).

- [x] Task 7: Unit tests — `conversations.service.spec.ts` — count check + abandon (AC: 1, 2, 4)
  - [x] 7.1 Activate the existing `it.skip`'d `describe('[P0] Story 3.11 — concurrent conversation limit (AC: 1, 2)')` block (spec line 1061 — TDD red phase, test bodies already written). The `mockPrisma.conversation` mock already includes `findMany` (line 51, returns `[]` by default — no active conversations). After implementing Tasks 1-2, unskip each `it.skip` → `it` and verify all pass. Tests:
    - `[P0]` `createConversation` succeeds when active count < 10 — `mockPrisma.conversation.findMany.mockResolvedValue([])` (0 active), `createConversation('user-1')` resolves with `{ id: 'conv-1' }`, assert `conversation.create` was called.
    - `[P0]` `createConversation` succeeds at the boundary (9 active) — mock 9 conversations with active in-memory status. Set 9 statuses via `provisionSandbox` or directly: `service['sandboxStatuses'].set('conv-1', 'ready')` × 9 (accessing the private field via bracket notation in tests is the established pattern). Then `createConversation` succeeds (9 < 10).
    - `[P0]` `createConversation` throws `ConflictException` when active count >= 10 (AC-2) — set 10 active statuses, `await expect(service.createConversation('user-1')).rejects.toThrow(ConflictException)`, assert the error response has `code: 'CONVERSATION_LIMIT_REACHED'` and `meta: { limit: 10 }`. Assert `conversation.create` was NOT called (no row created when over the limit).
    - `[P0]` idle-timed-out conversations do NOT count toward the limit — set 10 statuses to `'idle-timeout'`, `createConversation` succeeds (0 active). Proves the count excludes idle-timed-out conversations (DP-2 decision).
    - `[P0]` failed conversations do NOT count toward the limit — set 10 statuses to `'failed'`, `createConversation` succeeds.
    - `[P0]` provisioning conversations DO count toward the limit — set 10 statuses to `'provisioning'`, `createConversation` throws.
  - [x] 7.2 Activate the existing `it.skip`'d `describe('[P0] Story 3.11 — abandonConversation (AC: 4)')` block (spec line 1134 — TDD red phase, test bodies already written). After implementing Task 4, unskip each `it.skip` → `it` and verify all pass. Tests:
    - `[P0]` deletes the conversation row when called — `abandonConversation('conv-1', 'user-1')`, assert `mockPrisma.conversation.delete` was called with `{ where: { id: 'conv-1' } }`, assert result `{ abandoned: true }`.
    - `[P0]` destroys the sandbox when one exists — provision a conversation first (so `sandboxIds` has an entry), then `abandonConversation`, assert `sandboxFake.destroy` was called with the sandboxId.
    - `[P0]` clears in-memory maps — provision, then abandon, assert `service['sandboxStatuses'].has('conv-1')` is false and `service['sandboxIds'].has('conv-1')` is false.
    - `[P0]` clears the idle timer — provision, then `jest.spyOn(idleTimeout, 'clearTimer')`, then abandon, assert `clearTimer` was called with `'conv-1'`.
    - `[P0]` completes the SSE subject — `jest.spyOn(sessionEvents, 'complete')`, abandon, assert `complete` was called with `'conv-1'`.
    - `[P0]` returns `{ abandoned: false }` when conversation doesn't exist (idempotent) — `mockPrisma.conversation.findFirst.mockResolvedValueOnce(null)`, `abandonConversation('nope', 'user-1')`, assert result `{ abandoned: false }`, assert `conversation.delete` was NOT called.
    - `[P0]` tenant isolation — `findFirst` called with `{ where: { id: 'conv-1', userId: 'user-1' } }`, so a user can't abandon another user's conversation.
  - [x] 7.3 Activate the existing `it.skip`'d `describe('[P0] Story 3.11 — provisionSandbox cancellation check (AC: 4)')` block (spec line 1186 — TDD red phase, test bodies already written). After implementing Task 4, unskip each `it.skip` → `it` and verify all pass. Tests:
    - `[P0]` aborts after queue acquire when cancelled — `service['cancelledConversations'].add('conv-1')` BEFORE calling `provisionSandbox`, then `provisionSandbox('conv-1', 'user-1')`, assert `sandboxFake.provision` was NOT called (aborted before provision), assert `cancelledConversations` entry is cleaned up (in `finally`).
    - `[P0]` aborts after sandbox provision when cancelled — mock `sandboxFake.provision` to resolve, then add to `cancelledConversations` (use `jest.spyOn(sandboxFake, 'provision').mockImplementation(async () => { service['cancelledConversations'].add('conv-1'); return { sandboxId: 'sb-1' }; })`), call `provisionSandbox`, assert `sandboxFake.destroy` was called with `'sb-1'` (sandbox destroyed after cancellation), assert `SESSION_READY` was NOT emitted.
    - `[P0]` provision slot is released on cancellation — spy on `provisionQueue.release`, cancel before provision, call `provisionSandbox`, assert `release` was called (in `finally`).

- [x] Task 8: Unit tests — `agent.service.unit.spec.ts` — concurrent-turn guard (AC: 3)
  - [x] 8.1 Activate the existing `it.skip`'d `describe('[P0] Story 3.11 — concurrent-turn guard (AC: 3)')` block (spec line 1002 — TDD red phase, test bodies already written). The file tests the REAL `AgentService` with a controllable async generator (`yieldMessages`). After implementing Task 3, unskip each `it.skip` → `it` and verify all pass. Tests:
    - `[P0]` second `runTurn` on an in-flight conversationId is rejected (returns without overwriting) — use a generator that yields one message then awaits a never-resolving promise (simulates an in-flight run that doesn't complete). Call `runTurn` once (don't await completion — it's still running). Call `runTurn` again on the same `conversationId`. Assert the second `runTurn` resolves immediately (rejected), and the first run's `activeRuns` entry is preserved (the second didn't overwrite it). Verify via `agentService.isIdle(conversationId)` returning `false` after the second call (the first run is still active). Implementation detail: the "never-resolving generator" can yield one `stream_event` then `await new Promise(() => {})` — the test advances past the first `runTurn`'s initial setup with `jest.advanceTimersByTime(0)` or a microtask flush, then calls the second `runTurn`.
    - `[P0]` the rejected second turn does NOT emit `RUN_STARTED` or `RUN_ERROR` — assert `emitSpy` was NOT called with `RUN_STARTED` or `RUN_ERROR` for the second call (silent rejection — log + return). This is the DP-3 decision: no SSE event to avoid disrupting the first turn's subscribers.
    - [P0]` the rejected second turn does NOT overwrite `circuitBreakerTimers` — call `runTurn` once (in-flight), call `runTurn` again (rejected), assert only ONE timer entry exists in `circuitBreakerTimers` (the first run's). Verify by checking that the first run's circuit breaker timer still fires on timeout (advance fake timers past `CIRCUIT_BREAKER_TIMEOUT_MS`, assert `handleCircuitBreaker` ran for the first run, not skipped).
    - `[P0]` `startCircuitBreakerTimer` clears a pre-existing timer before setting a new one — call `runTurn`, let it complete normally, then call `runTurn` again (the first completed, so the second is allowed). Assert no orphaned timer from the first run fires on the second. This tests the Task 3.2 defensive clear.

- [x] Task 9: Unit tests — `ConversationPane.test.tsx` — limit-reached state + retry cancel (AC: 2, 4)
  - [x] 9.1 Activate the existing `it.skip`'d `describe('[P0] Story 3.11 — conversation limit reached (AC: 2)')` block (spec line 1934 — TDD red phase, test bodies already written). The block mocks `fetch` to return a 409 with `{ code: 'CONVERSATION_LIMIT_REACHED', message: '...', meta: { limit: 10 } }` for `POST /api/conversations` and renders `<ConversationPane>` with no `initialConversationId`. After implementing Task 2, unskip each `it.skip` → `it` and verify all pass. Tests:
    - `[P0]` shows the "limit reached" blocking message — assert the message "You've reached the limit of 10 active conversations..." is visible.
    - `[P0]` chat input is hidden — assert the chat input is NOT rendered (or is disabled). The `inputDisabled` includes `'limit-reached'`.
    - `[P0]` no Retry button — assert no "Retry" button is rendered (limit-reached is not in the `state === 'timeout' || state === 'error'` condition).
    - `[P0]` non-409 error still shows generic error + Retry — mock `POST` to return 500, assert generic "Failed to create conversation." message + Retry button (regression guard — the limit-reached handling doesn't break the generic error path).
  - [x] 9.2 Activate the existing `it.skip`'d `describe('[P0] Story 3.11 — retry cancels in-flight provisioning (AC: 4)')` block (spec line 2029 — TDD red phase, test bodies already written). After implementing Task 6, unskip each `it.skip` → `it` and verify all pass. Tests:
    - `[P0]` `handleRetry` calls DELETE on the old conversation before minting new — render with no `initialConversationId`, mock `POST /api/conversations` to return `{ id: 'conv-1' }` (first mint), then trigger the session-start timeout (advance fake timers past `CLIENT_TIMEOUT_MS`), then click Retry. Assert `fetch` was called with `DELETE /api/conversations/conv-1` BEFORE the second `POST /api/conversations`. Capture call order via `fetchMock.mock.invocationCallOrder`.
    - `[P0]` `handleRetry` does NOT call DELETE when `initialConversationId` is defined (existing conversation) — render with `initialConversationId="conv-existing"`, trigger timeout, click Retry. Assert no `DELETE` call (existing conversation is not abandoned on retry — resume path applies).
    - `[P0]` `handleRetry` does NOT call DELETE when `conversationIdRef` is null (POST never succeeded) — mock `POST` to reject (network error), trigger timeout, click Retry. Assert no `DELETE` call (nothing to cancel).

- [x] Task 10: Integration test — `sandbox-lifecycle.integration.spec.ts` (AC: 1, 2, 4)
  - [x] 10.1 Activate the existing `it.skip`'d `describe('[P0] Story 3.11 — concurrent conversations + limit + abandon (integration)')` block (spec line 211 — TDD red phase, test bodies already written). The file uses `buildTestModule` + `SandboxServiceFake` with mock Prisma. After implementing Tasks 1 and 4, unskip each `it.skip` → `it` and verify all pass. Tests:
    - `[P0]` two conversations provision independently with distinct sandbox IDs (AC-1) — seed two conversation rows, `provisionSandbox` both, assert `sandboxFake` created two distinct sandboxes (distinct IDs — the `sandboxCounter` from Story 3.10 prevents `Date.now()` collisions).
    - `[P0]` `createConversation` rejects at 10 active (AC-2) — seed 10 conversations with `'ready'` status, `createConversation` throws `ConflictException`.
    - `[P0]` `abandonConversation` tears down sandbox + deletes row (AC-4) — provision a conversation, `abandonConversation`, assert `sandboxFake.destroy` called, assert `conversation.delete` called, assert SSE subject completed.

- [x] Task 11: Lint, typecheck, test (AC: all)
  - [x] 11.1 `yarn nx lint agent-be` — 0 errors
  - [x] 11.2 `yarn nx lint web` — 0 errors (1 pre-existing error in `CredentialErrorBanner.test.tsx` — not introduced by this story)
  - [x] 11.3 `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json` — clean
  - [x] 11.4 `npx tsc --noEmit -p apps/web/tsconfig.app.json` — clean (1 pre-existing error in `AgentMessage.tsx` — not introduced by this story)
  - [x] 11.5 `yarn nx test agent-be` — all tests pass (existing + new Story 3.11 tests)
  - [x] 11.6 `yarn nx test web` — all tests pass (existing + new Story 3.11 tests)

## Dev Notes

### Architecture Compliance

- **FR-11 (Concurrent Conversations) — architecture.md line 37:** "FR-11 (10 concurrent Conversations per user) directly determines the SSE connection capacity requirement (NFR-R4) and the sandbox count ceiling per user." Task 1 enforces the sandbox count ceiling at `createConversation`. The SSE connection capacity (NFR-R4) is a deployment configuration requirement (HTTP/2 reverse proxy), not a code requirement — already documented in architecture.md line 77. No code change for NFR-R4; verify the deployment invariant is in the launch checklist (it is).
- **Per-user sandbox provision queue — architecture.md line 83:** "A per-user concurrency cap of 2–3 simultaneous provisions prevents burst pressure on GitHub's OAuth rate limit." The `ProvisionQueueService` (MAX_CONCURRENT_PROVISIONS = 2) already exists from Story 3.1. Task 1's count check is a SEPARATE concern (total active conversations cap = 10) from the provision queue (concurrent provisions cap = 2). Both apply: a user with 10 active conversations can't create an 11th (count check), and no more than 2 provision simultaneously (queue). They compose correctly.
- **Main branch only, last-write-wins — architecture.md line 70:** "Two concurrent Conversations writing to the same Artifact path: last-write-wins, no conflict detection (MVP)." This story does NOT change the git-write model. Two concurrent conversations committing to the same path still result in last-write-wins (deferred to post-MVP per PRD §4.3).
- **Sandbox lifecycle — architecture.md line 79 / project-context.md:** provision → clone → inject git config → working tree → SESSION_READY. Task 4's cancellation checks are inserted into this sequence (after acquire, after provision) without changing the sequence itself. A cancelled provisioning aborts early; a successful provisioning follows the established sequence unchanged.
- **Error envelope — project-context.md:** every endpoint returns raw resource body on success, `{ code, message, meta }` on error. Task 1's `ConflictException` with `{ code, message, meta }` is mapped by the global `HttpExceptionFilter` (line 29-43) to a 409 response with the envelope. Task 5's `DELETE` returns `{ conversationId, abandoned }` on success (raw resource body). Both follow the established pattern.
- **`findFirst` for tenant-scoped lookup — project-context.md:** `abandonConversation` uses `findFirst({ where: { id, userId } })` — the `userId` filter IS the tenant authorization check. Never use `findUnique({ where: { id } })` without the userId filter. Task 4.2 follows this.
- **`select` projection — project-context.md:** `countActiveConversations` uses `select: { id: true }` (only the field needed for the in-memory lookup). `abandonConversation`'s `findFirst` uses `select: { id: true }`. Both follow the column-level performance rule.
- **Env-configured numeric thresholds — project-context.md:** `MAX_CONCURRENT_CONVERSATIONS` uses the module-load IIFE pattern (`parseInt` + `Number.isFinite` guard + default), excluded from `env.validation.ts` Zod schema. Same pattern as `CIRCUIT_BREAKER_TIMEOUT_MS` and `SPEND_ALERT_THRESHOLD_USD`.

### Library / Framework Requirements

- **`ConversationsService`** (`apps/agent-be/src/conversations/conversations.service.ts`) — Story 3.1 delivered this. Task 1 adds `countActiveConversations` + the count check in `createConversation`. Task 4 adds `cancelledConversations` Set + `abandonConversation` method + cancellation checks in `provisionSandbox`. No existing method signatures change.
- **`AgentService`** (`apps/agent-be/src/streaming/agent.service.ts`) — Story 3.3/3.4 delivered this. Task 3 adds the concurrent-turn guard at the top of `runTurn` (3 lines) and the defensive clear in `startCircuitBreakerTimer` (1 line). No existing method signatures change. The `IAgentService` interface (`libs/shared-types/src/agent.interface.ts`) is unchanged — `runTurn` still returns `Promise<void>`.
- **`ConversationsController`** (`apps/agent-be/src/conversations/conversations.controller.ts`) — Task 5 adds the `DELETE /:id` endpoint. Import `Delete` from `@nestjs/common`. No DTO needed.
- **`HttpExceptionFilter`** (`apps/agent-be/src/common/filters/http-exception.filter.ts`) — NOT modified. Already maps `HttpException` subclasses to the `{ code, message, meta }` envelope using the exception's status code. `ConflictException` (HTTP 409) is a built-in NestJS exception that extends `HttpException` — the filter handles it without changes.
- **`ConversationPane`** (`apps/web/src/components/conversation/ConversationPane.tsx`) — Story 3.1/3.3 delivered this. Task 2 adds the `'limit-reached'` state + 409 handling in `startSession`. Task 6 makes `handleRetry` async + adds the DELETE-before-mint-new logic. No existing prop signatures change.
- **`ProvisionQueueService`** (`apps/agent-be/src/sandbox/provision-queue.service.ts`) — NOT modified. The 2-concurrent-provision cap is separate from the 10-conversation cap. They compose: the count check gates creation, the queue gates concurrent provisioning.
- **`IdleTimeoutService`** — NOT modified. `abandonConversation` calls `idleTimeout.clearTimer(conversationId)` (existing method from Story 3.9).

### File Structure Requirements

Files to MODIFY:
- `apps/agent-be/src/conversations/conversations.service.ts` — Task 1 (count check), Task 4 (`abandonConversation` + cancellation checks)
- `apps/agent-be/src/conversations/conversations.controller.ts` — Task 5 (`DELETE /:id` endpoint)
- `apps/agent-be/src/streaming/agent.service.ts` — Task 3 (concurrent-turn guard + defensive timer clear)
- `apps/web/src/components/conversation/ConversationPane.tsx` — Task 2 (limit-reached state), Task 6 (retry cancel)
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — Task 7 (count + abandon tests)
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — Task 8 (concurrent-turn guard tests)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — Task 9 (limit-reached + retry cancel tests)
- `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` — Task 10 (integration tests)

No new files. No new Prisma models or migrations (the Conversation model already has `userId` — no schema change needed for the count query). No new modules. No `.env.example` changes (the `MAX_CONCURRENT_CONVERSATIONS` env var is optional with a default — same as `CIRCUIT_BREAKER_TIMEOUT_MS` which is also not in `.env.example`).

### Testing Requirements

- **Test priority tags:** `[P0]` for all AC-covering tests (count check, limit-reached state, concurrent-turn guard, abandon + cancellation, retry cancel). `[P1]` for edge cases if any arise (none currently identified — all ACs are P0).
- **Real `AgentService` for AC-3 tests:** the concurrent-turn guard is in the REAL `AgentService.runTurn`, not the `AgentServiceFake`. Tests in `agent.service.unit.spec.ts` use the real service with the mocked SDK (`__mocks__/claude-agent-sdk.ts` + `yieldMessages` async generator). The `AgentServiceFake` is NOT modified — its `runTurn` is synchronous-ish and doesn't need the guard (the guard is a backend safety net tested via the real service).
- **Test scaffolding pre-exists (TDD red phase):** all Story 3.11 test blocks already exist as `it.skip`'d tests with complete bodies across the four test files — `conversations.service.spec.ts` (lines 1061-1216), `agent.service.unit.spec.ts` (lines 1002-1107), `ConversationPane.test.tsx` (lines 1934-2144), `sandbox-lifecycle.integration.spec.ts` (lines 211-248). This follows the project's TDD red-phase pattern (see `SlashCommandPicker.test.tsx` line 10: "TDD RED PHASE: All tests are skipped (it.skip). Remove skips"). The `mockPrisma.conversation` mock already includes `findMany` (line 51, returns `[]`) and `delete` (line 52, returns `{ id: 'conv-1' }`). The dev's job for Tasks 7-10 is to implement the production code (Tasks 1-6), then unskip each `it.skip` → `it` and verify all tests pass. Do NOT add new `describe` blocks or mock methods — they already exist.
- **Private field access via bracket notation:** tests that set in-memory `sandboxStatuses` entries use `service['sandboxStatuses'].set(...)` — bracket notation bypasses TypeScript's private access in tests. This is the established pattern in the existing spec (used for `sandboxIds`, etc.).
- **`jest.spyOn` for call-order assertions:** Task 9.1 (DELETE before POST) uses `fetchMock.mock.invocationCallOrder` to assert ordering — same pattern as Story 3.10's inject-before-SESSION_READY order assertion.
- **Fake timers for timeout-triggered retry:** Task 9.2 uses `jest.useFakeTimers()` + `jest.advanceTimersByTime(CLIENT_TIMEOUT_MS)` to trigger the session-start timeout, then `userEvent.click(retryButton)` to trigger retry. The `ConversationPane.test.tsx` already uses fake timers (Story 3.1/3.3 pattern).
- **No E2E tests:** the concurrent-turn guard (AC-3) is a backend race condition that requires controlling SDK async-generator timing — not reproducible in E2E. The limit-reached state (AC-2) and retry-cancel (AC-4) are testable at the unit level (mock fetch). Real-sandbox multi-conversation E2E requires multiple live Daytona sandboxes, which is not available in CI (DP-5 — same as Story 3.10's real-sandbox deferral). Structural verification is sufficient for the ACs.

### Previous Story Intelligence (Story 3.10)

- **`mockPrisma` extension pattern:** Story 3.10 added `mockImplementation` for per-user identity (Task 5). Task 7.1 uses the same `mockImplementation` pattern for per-user conversation lists if needed (though the default `findMany` returning `[]` suffices for most tests).
- **`jest.spyOn` + `mock.invocationCallOrder` for ordering:** Story 3.10's Task 3.1 asserted inject-before-SESSION_READY ordering. Task 9.1 reuses this for DELETE-before-POST ordering.
- **Decision records format:** Story 3.10 recorded DP-2/DP-3/DP-4/DP-5 decisions inline. This story follows the same format (see Decision Records below).
- **`sandboxCounter` in fake:** Story 3.10 added a counter to `SandboxServiceFake.provision()` to prevent `Date.now()` ID collisions. Task 10.1 (two independent conversations) relies on this — the fake already generates distinct sandbox IDs. No additional fix needed.
- **Test-seam fakes mimic production side effects:** Story 3.10 extended `SandboxServiceFake` to capture injected git config. This story does NOT extend the fake — `abandonConversation` calls `sandboxService.destroy` (already in the fake from Story 3.1) and `idleTimeout.clearTimer` (already in the service). No fake extension needed.

### Git Intelligence

Recent commits (HEAD `8ec0d27`) are pipeline/workflow/docs changes. The attribution-critical and conversation-lifecycle code is stable since Story 3.9/3.10. The working tree has uncommitted changes from Stories 3.8/3.9/3.10 (conversations.service.ts, agent.service.ts, ConversationPane.tsx, sandbox.service.ts, etc.) — these are the baseline for Story 3.11. No merge-conflict risk with the planned changes (Story 3.11 adds new methods and new test blocks; it does not rewrite existing code).

### Project Context Reference

This story touches patterns documented in `_bmad-output/project-context.md`:

- **Env-configured numeric thresholds: module-load IIFE + excluded from Zod env schema** — `MAX_CONCURRENT_CONVERSATIONS` follows this pattern.
- **`findFirst` for tenant-scoped lookup by non-unique compound fields** — `abandonConversation` uses `findFirst({ where: { id, userId } })`.
- **`select` projection on `findFirst`/`findUnique`** — `countActiveConversations` and `abandonConversation` use `select: { id: true }`.
- **Error envelope: `{ code, message, meta }`** — `ConflictException` with `{ code, message, meta }` is mapped by the global `HttpExceptionFilter`.
- **`try/catch` around `JSON.parse` in every fetch error handler** — Task 2.2's 409 response body parse is wrapped in try/catch.
- **`onModuleDestroy` for in-process state cleanup** — the `cancelledConversations` Set is cleaned up in `provisionSandbox`'s `finally`. If `abandonConversation` is called for a conversation whose `provisionSandbox` already completed, the entry is stale but never read. No `onModuleDestroy` change needed (the Set is not a timer/connection — it's a lightweight marker).
- **Circuit breaker / stall-detection timer** — Task 3.2's defensive clear in `startCircuitBreakerTimer` follows the "cleared in `finally`, `stop()`, and `onModuleDestroy()`" rule (the `finally` block at line 188-189 already clears the timer; the defensive clear in `startCircuitBreakerTimer` is belt-and-suspenders for the orphaned-timer edge case).

### Deferred Findings Addressed

- **deferred-work.md:231, 253, 254** — "Concurrent `runTurn` calls for same `conversationId` corrupt shared per-conversation state maps" + "Stale circuit breaker timer from prior run fires on new run" — Task 3 (concurrent-turn guard + defensive timer clear) addresses both. The guard prevents the second `runTurn` from overwriting the first's `activeRuns`/`circuitBreakerTimers`. The defensive clear in `startCircuitBreakerTimer` prevents an orphaned timer from a prior run from firing on a new run.
- **deferred-work.md:183** — "`handleRetry` mints a new conversation on every click when `initialConversationId` is undefined — previous in-flight provisioning not cancelled; leaks Daytona sandboxes and DB rows." — Task 6 (cancel-before-mint-new in `handleRetry`) + Task 4/5 (`abandonConversation` + `DELETE` endpoint) address this. The previous in-flight provisioning is cancelled (sandbox torn down, DB row removed) before minting a new conversation.

### Deferred Findings Introduced

- **TOCTOU race in count check (DP-5):** two concurrent `createConversation` calls could both pass the count check (both see 9 active) and both create, resulting in 11. Not worth a DB-level lock or `SELECT FOR UPDATE` for MVP scale (single user, provision queue limits burst to 2 concurrent provisions). The race window is narrow (between `countActiveConversations` and `conversation.create`). Deferred.
- **In-memory count unreliable after server restart (DP-5):** `sandboxStatuses` is in-memory and lost on restart. After a restart, `countActiveConversations` returns 0 (no in-memory statuses), so a user with 10 pre-restart conversations could create new ones. The orphaned sandboxes from before the restart are a Story 3.12 concern (persisting sandbox state to Postgres). This story's count check is correct for the single-instance, no-restart MVP operating mode. Deferred to Story 3.12.
- **Stale `cancelledConversations` entries (DP-5):** if `abandonConversation` is called AFTER `provisionSandbox` already completed (past all cancellation checkpoints), the entry in `cancelledConversations` is added but `provisionSandbox`'s `finally` already ran (so it won't clean up the entry). The entry is stale but never read again (no future `provisionSandbox` for a deleted conversation). For MVP scale (few retries), the memory impact is negligible. A periodic cleanup or TTL is over-engineering. Deferred.
- **Real-sandbox multi-conversation E2E (DP-5):** AC-1's "independent Sandbox and chat history at its own stable URL" describes real-world behavior. In CI, the structural verification (two conversations get distinct sandbox IDs, distinct SSE streams, distinct DB rows) is the testable equivalent. A real-sandbox E2E that provisions multiple Daytona sandboxes concurrently is blocked by no Daytona availability in CI (same as Story 3.10's deferral). Deferred.
- **`handleRetry` DELETE failure leaves orphan (DP-5):** if the DELETE call in `handleRetry` fails (network error), the old conversation row is orphaned (no sandbox, status 'failed' or absent from `sandboxStatuses`). The orphaned row doesn't count against the cap (its status is not 'provisioning' or 'ready'). The new conversation proceeds normally. The orphaned row accumulates in Postgres but is harmless. A server-side orphan-detection mechanism (e.g., a periodic job that deletes conversations with no SSE subscriber and no sandbox after a TTL) is beyond this story's scope. Deferred.

### Decision Records

**Decision (DP-2):** "Active Conversation" for FR-11 = a Conversation with in-memory `sandboxStatuses` status `'provisioning'` or `'ready'`. Idle-timed-out (`'idle-timeout'`) and failed (`'failed'`) conversations do NOT count. Rationale: architecture.md line 37 says FR-11 "directly determines the sandbox count ceiling per user" — the semantic intent is to limit concurrent live/provisioning sandboxes, not total conversation rows. An idle-timed-out conversation has no live sandbox (it was torn down by Story 3.9's mid-session idle timeout) and should not block the user from creating new ones. The in-memory dependency means the count is unreliable after a server restart (sandboxStatuses is lost) — this is a known limitation resolved by Story 3.12 (persisting sandbox state to Postgres). After a restart, the count is 0, so the user can create new conversations; orphaned sandboxes from before the restart are a Story 3.12 concern. Amending the spec: the epics.md AC for 3.11 should clarify "active Conversation = Conversation with a live or provisioning sandbox (in-memory status 'provisioning' or 'ready')."

**Decision (DP-3):** For AC-3, reject (not queue) the second concurrent `runTurn`. The guard returns void (silent rejection — log a warning, no SSE event). Rationale: (1) the UI already disables input during processing (project-context.md), so the guard is a backend safety net against a UI-prevented race — queueing would add a queue data structure and drain logic for a need that doesn't arise in normal use; (2) emitting a `RUN_ERROR` would broadcast to ALL SSE subscribers for the conversation (including the tab running the first turn), causing the first tab to incorrectly show "agent stopped unexpectedly" — silent rejection avoids disrupting the first turn. The second caller's `runAgentTurn` proceeds to `flushPendingCommit` (no-op) and `idleTimeout.startTimer` (resets the timer — user is active, acceptable). Simplest reversible option that satisfies the AC ("rejected or queued — not allowed to overwrite").

**Decision (DP-3):** For AC-4, add a `DELETE /api/conversations/:id` endpoint (cancel-and-mint-new) rather than reusing the existing resume-on-retry behavior (which waits for the stuck provisioning). Rationale: the AC explicitly prescribes "the previous in-flight provisioning is cancelled (Daytona sandbox torn down, DB row removed) before minting a new conversation." Resume-on-retry (Story 3.5's behavior) reconnects to the same stuck provisioning — the user would wait for the same stuck sandbox and timeout again. Cancel-and-mint-new gives the user a fresh provisioning attempt, which is better UX for a stuck provisioning (the retry might succeed if the first failure was transient). The DELETE endpoint is also reusable for a future "delete conversation" UI feature. The cancel only fires for new conversations (`initialConversationId` undefined) — existing conversations keep the resume behavior (the user owns them and may have meaningful history).

**Decision (DP-4):** Task 1's `MAX_CONCURRENT_CONVERSATIONS` constant and Task 4's `cancelledConversations` Set are in-process state with no externally visible behavior change beyond the AC-prescribed cap and cancel. The constant is env-configurable (optional, default 10). The Set is a lightweight marker cleaned up in `provisionSandbox`'s `finally`. Recorded because both are shared in-process state consumed across requests.

**Decision (DP-5):** TOCTOU race in the count check deferred. Two concurrent `createConversation` calls could both pass the count check. For MVP scale (single user, provision queue limits burst to 2), the race window is narrow and the impact is 11 conversations instead of 10 (one extra sandbox — not catastrophic). A DB-level lock or `SELECT FOR UPDATE` is over-engineering. Deferred.

**Decision (DP-5):** Real-sandbox multi-conversation E2E deferred. Daytona is not available in CI. The structural verification (distinct sandbox IDs, distinct SSE streams, distinct DB rows) is sufficient proof for AC-1. Same deferral rationale as Story 3.10.

**Decision (DP-2):** Story Tasks 7-10 + Testing Requirements contradicted the actual test-file state — the story instructed the dev to "Add a `describe` block" and "add `findMany`/`delete` to the mock," but all four test files already contain complete `it.skip`'d Story 3.11 test scaffolding (TDD red phase) and the `mockPrisma.conversation` mock already has `findMany`/`delete` (lines 51-52). Chose amend-the-spec: updated Tasks 7-10 to "Activate the existing `it.skip`'d block" and replaced the Testing Requirements "add to the mock" bullet with a TDD red-phase note. Semantic intent (tests must exist and pass) over literal stale text. Also corrected minor line-number drift in References (`mockPrisma` 46-75→46-77, `buildTestModule` 81-90→83-92, `agent.service.unit.spec` 1-120→1-129, `IAgentService` 1-14→8-12) and Task 2.2's `startSession` range (122-148→115-598 for the function, 133-137 for the error-handling sub-block).

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- Fixed 3 TDD scaffold tests in `agent.service.unit.spec.ts` that were timing out: the original test bodies `await`ed the first `runTurn` which hangs on `yieldThenHang` (never-resolving promise). Changed to not `await` the first run, and added `await jest.advanceTimersByTimeAsync(120_000)` + `await firstRun.catch(() => undefined)` cleanup at the end of each test to let the circuit breaker fire and resolve the hanging first run. This follows the `jest.advanceTimersByTimeAsync(0)` under fake timers pattern from project-context.md.
- Fixed `ConversationPane.test.tsx` "chat input is hidden when limit reached" test: the test expects `queryByLabelText('Message input')` to NOT be in the document (UX spec: "the chat input is not shown"). The original Task 2.3 description said to update `inputDisabled`, but the test expects the ChatInput component to not be rendered at all. Added conditional rendering `{state !== 'limit-reached' && (<ChatInput ... />)}` to hide the input completely when limit-reached. Decision (DP-2): test intent (UX spec "not shown") over literal task text ("input disabled").

### Completion Notes List

- **Task 1 (AC-1, AC-2):** Implemented `MAX_CONCURRENT_CONVERSATIONS` constant (env-configured IIFE pattern, default 10) + `countActiveConversations(userId)` helper (queries Postgres for user's conversation IDs, counts those with in-memory status `'provisioning'` or `'ready'`) + count check at top of `createConversation` (throws `ConflictException` with `{ code: 'CONVERSATION_LIMIT_REACHED', message, meta: { limit } }` when count >= 10).
- **Task 2 (AC-2):** Added `'limit-reached'` to `SessionState` union + 409 detection in `startSession()` error handling (try/catch around `response.json()` per project-context.md) + `'limit-reached'` in `inputDisabled` + conditional ChatInput rendering (hidden when limit-reached per UX spec) + Retry button NOT shown for limit-reached.
- **Task 3 (AC-3):** Added concurrent-turn guard at top of `runTurn` (silent rejection: log + return void, no SSE event — DP-3 decision) + defensive `clearCircuitBreakerTimer` call at top of `startCircuitBreakerTimer` (belt-and-suspenders for orphaned timers).
- **Task 4 (AC-4):** Added `cancelledConversations` Set + `abandonConversation(conversationId, userId)` method (idempotent, tenant-scoped via `findFirst({ where: { id, userId } })`, destroys sandbox, clears idle timer, deletes in-memory maps, deletes DB row, completes SSE subject) + cancellation checks in `provisionSandbox` (after queue acquire + after sandbox provision, with `cancelledConversations.delete` in `finally`).
- **Task 5 (AC-4):** Added `DELETE /:id` controller endpoint (uses existing `BoundaryJwtGuard` + `ActiveUserGuard` + `@User()` decorator, returns `{ conversationId, abandoned }` raw resource body on success).
- **Task 6 (AC-4):** Made `handleRetry` async + added cancel-before-mint-new logic (DELETE old conversation before POST new one, only when `initialConversationId` is undefined AND `conversationIdRef.current` is set; DELETE failure swallowed as best-effort cleanup).
- **Tasks 7-10:** Un-skipped all 30 TDD red-phase tests across 4 test files. All pass. Fixed 3 agent.service.unit.spec.ts tests that timed out due to `await`ing never-resolving `yieldThenHang` first run.
- **Task 11:** Lint (0 new errors — 1 pre-existing in `CredentialErrorBanner.test.tsx`), typecheck (0 new errors — 1 pre-existing in `AgentMessage.tsx`), all 873 tests pass (210 agent-be + 663 web).
- **NFR patterns verified:** env-configured IIFE, `findFirst` tenant-scoped, `select` projection, error envelope, `try/catch` around JSON.parse, circuit breaker timer cleanup, in-process state cleanup in `finally`, raw resource body on success, `@User()` + auth guards, `jest.advanceTimersByTimeAsync` under fake timers, no `console.log`/`any`/`@ts-ignore`.

### File List

**Modified (production code):**
- `apps/agent-be/src/conversations/conversations.service.ts` — Task 1 (MAX_CONCURRENT_CONVERSATIONS + countActiveConversations + count check), Task 4 (cancelledConversations Set + abandonConversation + cancellation checks in provisionSandbox)
- `apps/agent-be/src/conversations/conversations.controller.ts` — Task 5 (DELETE /:id endpoint + Delete import)
- `apps/agent-be/src/streaming/agent.service.ts` — Task 3 (concurrent-turn guard at top of runTurn + defensive clearCircuitBreakerTimer in startCircuitBreakerTimer)
- `apps/web/src/components/conversation/ConversationPane.tsx` — Task 2 (limit-reached state + 409 handling + inputDisabled + conditional ChatInput rendering), Task 6 (async handleRetry + DELETE-before-mint-new)

**Modified (test files — un-skipped TDD red-phase tests + fixes):**
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — Task 7 (un-skipped 16 tests)
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — Task 8 (un-skipped 4 tests + fixed 3 tests that timed out on yieldThenHang)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — Task 9 (un-skipped 7 tests)
- `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` — Task 10 (un-skipped 3 tests)

## Change Log

- 2026-07-06: Story 3.11 context created — concurrent conversations (FR-11 cap + limit-reached UI), concurrent-turn guard (AC-3), retry-cancel-leak fix (AC-4). Absorbs deferred items from 3-4 review (concurrent-turn guard) and 3-2 review (handleRetry leak).
- 2026-07-06: Validation pass — amended stale test-task instructions (Tasks 7-10 said "add"; scaffolding already exists as `it.skip` TDD red phase with complete bodies), corrected line-number drift in References and Task 2.2. Decision (DP-2): intent over literal text; (DP-4): artifact-only, autonomous.
- 2026-07-07: Story 3.11 implemented — all 11 tasks complete. 30 TDD red-phase tests un-skipped and passing. 3 agent.service.unit.spec.ts tests fixed (yieldThenHang timeout). ConversationPane ChatInput conditionally rendered (not just disabled) for limit-reached per UX spec. 873 total tests pass (210 agent-be + 663 web). 0 new lint/typecheck errors.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.11] — ACs, prerequisites, user story (lines 867-895)
- [Source: _bmad-output/planning-artifacts/epics.md#FR11] — Concurrent Conversations (line 40)
- [Source: _bmad-output/planning-artifacts/epics.md#NFR-R4] — 10 concurrent SSE connections (line 90)
- [Source: _bmad-output/planning-artifacts/architecture.md#FR-11] — sandbox count ceiling (line 37)
- [Source: _bmad-output/planning-artifacts/architecture.md#Per-user sandbox provision queue] — 2-3 simultaneous provisions cap (line 83)
- [Source: _bmad-output/planning-artifacts/architecture.md#HTTP/2 deployment invariant] — NFR-R4 requires HTTP/2 reverse proxy (line 77)
- [Source: _bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md#FR-11] — 10 concurrent active Conversations (lines 268-276)
- [Source: _bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/.decision-log.md#DL-3] — Max concurrent Conversations: 10 per user
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md#Blocked entry states] — "Conversation limit reached" state + copy (lines 233-237)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/.decision-log.md] — inline placement + copy confirmed by Marius 2026-07-02 (line 69, 96)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/validation-report.md] — Concurrent runTurn state corruption + orphaned circuit-breaker timers (line 76) — Story 3.11 scope
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/review-implementation-drift.md] — Concurrent runTurn + circuit-breaker fix = Story 3.11 scope (line 67)
- [Source: apps/agent-be/src/streaming/agent.service.ts] — `runTurn` (lines 54-197), `activeRuns` map (line 38), `circuitBreakerTimers` map (line 40), `startCircuitBreakerTimer` (lines 263-269), `isIdle` (lines 537-539)
- [Source: apps/agent-be/src/conversations/conversations.service.ts] — `createConversation` (lines 36-51), `provisionSandbox` (lines 53-135), `sandboxStatuses`/`sandboxIds` maps (lines 22-23), `resumeConversation` (lines 309-379)
- [Source: apps/agent-be/src/conversations/conversations.controller.ts] — controller endpoints (lines 1-80)
- [Source: apps/agent-be/src/sandbox/provision-queue.service.ts] — `MAX_CONCURRENT_PROVISIONS = 2`, acquire/release (lines 1-47)
- [Source: apps/agent-be/src/common/filters/http-exception.filter.ts] — `HttpException` → `{ code, message, meta }` envelope mapping (lines 29-43)
- [Source: apps/web/src/components/conversation/ConversationPane.tsx] — `startSession` (lines 115-598), `handleRetry` (lines 780-789), `SessionState` type (line 17), `inputDisabled` (line 806), Retry button render condition (line 832)
- [Source: apps/web/src/app/(dashboard)/(app)/conversations/new/page.tsx] — renders `ConversationPane` with no `initialConversationId`
- [Source: apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx] — renders `ConversationPane` with `initialConversationId`
- [Source: libs/database-schemas/src/prisma/schema.prisma#Conversation] — model (lines 77-91), `@@index([userId, lastActiveAt])`, no status column
- [Source: apps/agent-be/src/streaming/agent.service.unit.spec.ts] — real `AgentService` test pattern with `yieldMessages` async generator + `jest.isolateModules` (lines 1-129)
- [Source: apps/agent-be/src/conversations/conversations.service.spec.ts] — `mockPrisma` setup (lines 46-77), `buildTestModule` pattern (lines 83-92)
- [Source: apps/agent-be/test/helpers/agent-service.fake.ts] — `AgentServiceFake` (NOT modified — guard tested via real service)
- [Source: libs/shared-types/src/agent.interface.ts] — `IAgentService.runTurn` / `isIdle` interface (lines 8-12; `AgentRunParams` at 1-6, `AGENT_SERVICE` symbol at 14)
- [Source: _bmad-output/implementation-artifacts/3-10-verify-commits-carry-the-users-own-identity.md] — decision-record format, `mock.invocationCallOrder` pattern, fake-extension precedent
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — line 231 (concurrent runTurn), line 253 (state map corruption), line 254 (stale circuit breaker timer), line 183 (handleRetry leak)
- [Source: _bmad-output/decision-policy.md] — DP-2 (semantic intent), DP-3 (simplest reversible), DP-4 (test-only/state), DP-5 (scope temptation)
- [Source: _bmad-output/project-context.md] — env-configured thresholds IIFE, `findFirst` tenant-scoped, `select` projection, error envelope, `try/catch` around JSON.parse, circuit breaker timer cleanup

### Review Findings

Review run 2026-07-06. Layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor. Acceptance Auditor: all ACs satisfied, no spec/context-rule violations. Diff scoped to Story 3.11 File List files vs baseline `8ec0d27` (baseline == HEAD, so diff = uncommitted working-tree changes to those files; note: shared files also carry uncommitted 3.8/3.9/3.10 changes since no per-story commits exist).

**Patches (applied this review):**
- [x] [Review][Patch] Limit-reached message hardcodes "10" while `MAX_CONCURRENT_CONVERSATIONS` is env-configurable — backend message string + frontend hardcoded copy both ignore the constant; `meta.limit` is dynamic. Backend now uses template literal; frontend reads `data.message` from the 409 body (single source of truth). [apps/agent-be/src/conversations/conversations.service.ts:47; apps/web/src/components/conversation/ConversationPane.tsx:143]
- [x] [Review][Patch] `provisionSandbox` catch block not cancellation-aware — when `abandonConversation` races during clone/inject, or the cancel-checkpoint `destroy` throws, the catch resurrects `'failed'` status, double-destroys the sandbox, and emits `SESSION_ERROR` on a cancelled conversation. Added cancellation guard at top of catch. [apps/agent-be/src/conversations/conversations.service.ts:159]
- [x] [Review][Patch] `handleRetry` not idempotent against double-click — async `await fetch(DELETE)` before `void startSession()` with no button disable/ref guard; a second click during the await races two `startSession` calls, orphaning an EventSource and a conversation row. Added `retryingRef` guard. [apps/web/src/components/conversation/ConversationPane.tsx:795]

**Deferred:**
- [x] [Review][Defer] `cancelledConversations` Set leak when `abandonConversation` runs without a concurrent `provisionSandbox` [apps/agent-be/src/conversations/conversations.service.ts:193] — deferred, spec DP-5 explicitly accepts stale inert entries (never read again; periodic cleanup is over-engineering)
- [x] [Review][Defer] `createConversation` TOCTOU race in count check [apps/agent-be/src/conversations/conversations.service.ts:42] — deferred, spec DP-5 (MVP scale, provision queue limits burst to 2, race window narrow)
- [x] [Review][Defer] In-memory count unreliable after server restart [apps/agent-be/src/conversations/conversations.service.ts:69] — deferred, spec DP-5 (sandboxStatuses lost on restart; Story 3.12 persists sandbox state)
- [x] [Review][Defer] `handleMidSessionIdleTimeout` zombie sandbox on destroy failure (`sandboxIds.delete` before `destroy`) [apps/agent-be/src/conversations/conversations.service.ts:343] — deferred, Story 3.9 code (in diff only because 3.9 is uncommitted), not introduced by 3.11
- [x] [Review][Defer] `abandonConversation` doesn't coordinate with in-flight `handleMidSessionIdleTimeout` [apps/agent-be/src/conversations/conversations.service.ts:181] — deferred, fix requires modifying 3.9 code (add `cancelledConversations` checkpoint in `handleMidSessionIdleTimeout`); impact is an inert stale `'idle-timeout'` entry (row deleted, not counted) (DP-5)

**Dismissed (2):**
- `abandonConversation` returns `abandoned: true` when DB delete throws — spec Task 4.2 prescribes best-effort abandon (try/catch + return true); caller (`handleRetry`) treats DELETE as best-effort and ignores the result (Task 6.1). Claimed consequence ("limit still counts it") is false — `countActiveConversations` checks in-memory `sandboxStatuses`, which abandon clears before the delete. Actual impact is an orphaned row, covered by the DP-5 deferral.
- `runTurn` silently drops second concurrent turn — spec DP-3 deliberately chose silent rejection (log + return void, no SSE event): UI already disables input during processing, and emitting `RUN_ERROR` would disrupt the first turn's subscribers. AC-3 ("rejected or queued — not allowed to overwrite") is satisfied.

### NFR Evidence Audit

Review run 2026-07-06. Layer: NFR Evidence Audit (performance, reliability, security). Scope: Story 3.11 production code (`conversations.service.ts`, `conversations.controller.ts`, `agent.service.ts`, `ConversationPane.tsx`) against NFR categories from `architecture.md` §NFR table and `project-context.md` NFR patterns. Findings are NFR-specific only — functional/acceptance concerns are covered by the layers above.

**NFR Findings (5):**

- [NFR][MEDIUM] **Missing `take` limit on `countActiveConversations` `findMany`** (Performance) — `apps/agent-be/src/conversations/conversations.service.ts:69-72`. The query `findMany({ where: { userId }, select: { id: true } })` fetches ALL conversation IDs for the user with no row-level bound. The `select: { id: true }` projection is correct (column-level), but the query grows unbounded as users accumulate conversations over time (hundreds/thousands of rows). The query runs on every `createConversation` call (hot path). The in-memory `sandboxStatuses` map (source of truth for "active" status) is bounded (~10-20 entries), but the DB query fetches all rows to check against the map. A naive `take: MAX_CONCURRENT_CONVERSATIONS` is incorrect — active conversations could be anywhere in the result set. **Remediation:** Restructure to iterate the bounded in-memory `sandboxStatuses` map, collect active conversation IDs, and verify ownership via `prisma.conversation.count({ where: { id: { in: activeConvIds }, userId } })` — bounds the DB query to the in-memory map size (~10-20). Alternatively, defer to Story 3.12 (persisting sandbox status to Postgres enables a DB-level status filter with `take`). Mitigated for MVP by single-user scale and `select: { id: true }` (minimal transfer).
- [NFR][MEDIUM] **No timeout on DELETE fetch in `handleRetry`** (Reliability) — `apps/web/src/components/conversation/ConversationPane.tsx:817-820`. The DELETE fetch `fetch(url, { method: 'DELETE', headers: { Authorization } })` has no `signal: AbortSignal.timeout()`. If `apps/agent-be` is slow or unresponsive, the `await fetch(DELETE)` hangs indefinitely. Because `retryingRef.current = true` is set before the await and only reset in `startSession().finally(...)` (which runs AFTER the DELETE), a hanging DELETE blocks the retry flow entirely: the user cannot click Retry again (guard rejects), `startSession()` is never reached, and there is no UI feedback during the hang. The project-context.md rule "always set `AbortSignal.timeout(10_000)` on every `fetch()` call to the GitHub API" establishes the no-unbounded-waits principle; internal API calls should follow the same discipline. **Remediation:** Add `signal: AbortSignal.timeout(5_000)` to the DELETE fetch. On timeout, the existing `catch { /* best-effort */ }` swallows the `TimeoutError` and proceeds to `startSession()` — the orphaned row is covered by the DP-5 deferral. Note: all other internal fetch calls in `ConversationPane` (POST, resume, skills, turns, stop, save) also lack timeouts — pre-existing pattern, not introduced by 3.11, but the DELETE is uniquely severe because it blocks the retry flow.
- [NFR][LOW] **Missing `select` projection on `conversation.create`** (Performance) — `apps/agent-be/src/conversations/conversations.service.ts:52-58`. `prisma.conversation.create({ data: { ... } })` returns the full created row; only `conversation.id` is read (lines 60, 65). The project-context.md rule "`select` projection on `findFirst`/`findUnique` for column-level performance" names `findFirst`/`findUnique` explicitly, but the principle (fetch only what you read) applies to `create` returns too. Single-row impact is negligible, but the omission is inconsistent with the project's column-level discipline. **Remediation:** Add `select: { id: true }` to the `create` call. Note: `createConversation` was modified by Story 3.11 (Task 1 added the count check before the create); the create call itself is pre-existing from Story 3.1 but is now in scope as part of the modified method.
- [NFR][LOW] **Missing `select` projection on `conversation.delete` in `abandonConversation`** (Performance) — `apps/agent-be/src/conversations/conversations.service.ts:212`. `prisma.conversation.delete({ where: { id } })` returns the full deleted row; the return value is unused (the `await` discards the result). New in Story 3.11 (Task 4.2). **Remediation:** Add `select: { id: true }` to the `delete` call.
- [NFR][LOW] **Missing timing regression guard for `countActiveConversations`** (Performance) — `apps/agent-be/src/conversations/conversations.service.spec.ts:1064-1135`. No `[P1]` timing test verifies the count check completes within a threshold. Story 3.7's NFR assessment added timing tests for the classifier (100ms on 100KB output) as a regression guard; Story 3.11 has no equivalent for the new `countActiveConversations` method, which runs on every `createConversation` call. The operation is simple (one DB query + one in-memory iteration), but a timing test is a cheap guard against accidental O(n²) regressions if the count logic grows. **Remediation:** Add a `[P1] NFR Performance` test mocking `findMany` to return 1000 conversation rows (9 active, 991 idle-timed-out), asserting `countActiveConversations` completes < 50ms. Follows the Story 3.7 timing-test pattern.

**NFR PASS (verified, no finding):**
- Security: `DELETE /:id` endpoint uses global `BoundaryJwtGuard` + `ActiveUserGuard` + `@User()` decorator (tenant-scoped). `abandonConversation` uses `findFirst({ where: { id, userId }, select: { id: true } })` — tenant authorization via `userId` filter, `select` projection present. No secrets in response body (`{ conversationId, abandoned }`). No new dependencies introduced. SSE controller security headers (`X-Content-Type-Options: nosniff`, `Cache-Control: no-cache, no-transform`) are pre-existing and unmodified.
- Reliability: Concurrent-turn guard is O(1) (`Map.has()`). Defensive `clearCircuitBreakerTimer` in `startCircuitBreakerTimer` is O(1). `cancelledConversations` Set cleaned up in `provisionSandbox` `finally`. `abandonConversation` is idempotent (returns `{ abandoned: false }` when not found). `retryingRef` guard prevents double-click race in `handleRetry` (applied by prior review patch).
- NFR-R4 (10 concurrent SSE connections): deployment configuration requirement (HTTP/2 reverse proxy), not a code requirement. Architecture.md line 77 documents the invariant; no code change needed. Verified in launch checklist per Dev Notes.
