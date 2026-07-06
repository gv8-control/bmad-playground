---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-06'
workflowType: testarch-atdd
storyId: '3.12'
storyKey: '3-12-drain-conversations-gracefully-on-deploy'
storyFile: '_bmad-output/implementation-artifacts/3-12-drain-conversations-gracefully-on-deploy.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-3-12-drain-conversations-gracefully-on-deploy.md'
generatedTestFiles:
  - 'apps/agent-be/src/streaming/session-events.service.spec.ts'
  - 'apps/agent-be/src/conversations/conversations.service.spec.ts'
  - 'apps/agent-be/src/conversations/manual-commit.service.spec.ts'
  - 'apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts'
  - 'apps/web/src/components/conversation/ConversationPane.test.tsx'
  - 'apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts'
inputDocuments:
  - '_bmad-output/implementation-artifacts/3-12-drain-conversations-gracefully-on-deploy.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/decision-policy.md'
  - 'apps/agent-be/src/streaming/session-events.service.ts'
  - 'apps/agent-be/src/conversations/conversations.service.ts'
  - 'apps/agent-be/src/conversations/manual-commit.service.ts'
  - 'apps/agent-be/src/sandbox/sandbox.service.ts'
  - 'apps/agent-be/src/streaming/agent.service.ts'
  - 'apps/agent-be/src/app/app.module.ts'
  - 'libs/shared-types/src/ag-ui.types.ts'
  - 'libs/database-schemas/src/prisma/schema.prisma'
  - 'apps/agent-be/test/helpers/sandbox-service.fake.ts'
  - 'apps/agent-be/test/helpers/agent-service.fake.ts'
  - 'apps/agent-be/test/helpers/test-module-builder.ts'
  - 'apps/agent-be/src/conversations/conversations.service.spec.ts'
  - 'apps/agent-be/src/conversations/manual-commit.service.spec.ts'
  - 'apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts'
  - 'apps/web/src/components/conversation/ConversationPane.test.tsx'
  - 'apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts'
---

# ATDD Checklist - Epic 3, Story 3.12: Drain Conversations Gracefully on Deploy

**Date:** 2026-07-06
**Author:** Marius
**Primary Test Level:** Unit + Integration + Component (split by AC — see deferral analysis)

---

## Story Summary

As a user with an active Conversation when the platform deploys a new version, I want my connection to end cleanly and let me reconnect without losing history, so that routine deploys never look like a crash or lose my work.

**As a** user with an active Conversation when the platform deploys
**I want** my connection to end cleanly and let me reconnect without losing history
**So that** routine deploys never look like a crash or lose my work

---

## Acceptance Criteria

1. **AC-1 (SIGTERM → SSE drain notification):** Given `apps/agent-be` is deployed or restarted, When the process receives `SIGTERM`, Then shutdown hooks notify all clients with active SSE connections that the connection is draining, before the process exits. And notified clients can reconnect and resume their Conversation without losing chat history. And turn/session state is persisted to Postgres on every turn.
2. **AC-2 (getStatus reports correct sandbox status after restart):** Given `apps/agent-be` restarts and a client reconnects, When the client calls `getStatus`, Then it reports the correct sandbox status (ready, failed, or not-found) — not a fallback `'provisioning'` — because sandbox state is persisted to Postgres.
3. **AC-3 (ManualCommitService drain — complete or notify):** Given a manual save is pending when `SIGTERM` is received, When `onModuleDestroy` runs, Then the pending commit is either completed before exit or the client is notified via `MANUAL_SAVE_FAILED` — pending saves are never silently dropped.

---

## Story Integration Metadata

- **Story ID:** `3.12`
- **Story Key:** `3-12-drain-conversations-gracefully-on-deploy`
- **Story File:** `_bmad-output/implementation-artifacts/3-12-drain-conversations-gracefully-on-deploy.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-3-12-drain-conversations-gracefully-on-deploy.md`
- **Generated Test Files:**
  - `apps/agent-be/src/streaming/session-events.service.spec.ts` (unit, NEW file, 6 tests)
  - `apps/agent-be/src/conversations/conversations.service.spec.ts` (unit, 13 new tests)
  - `apps/agent-be/src/conversations/manual-commit.service.spec.ts` (unit, 6 new tests)
  - `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (unit, 3 new tests)
  - `apps/web/src/components/conversation/ConversationPane.test.tsx` (component, 4 new tests)
  - `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` (integration, 4 new tests)

---

## E2E Deferral Analysis (Browser-Level Mock Verification)

Per user instruction: "Before deferring E2E coverage, verify no browser-level mock pattern can simulate the scenario — only defer if no mock covers the ACs, and record the check in the ATDD checklist."

The existing E2E pattern in `playwright/e2e/conversation/sandbox-lifecycle.spec.ts` establishes that browser-level mocks CAN intercept `fetch` (via `page.addInitScript`) and mock `EventSource` — exercising the real `ConversationPane` state machine without a live backend. This pattern is the baseline for the analysis below.

### AC-1: SIGTERM → SSE drain notification + reconnect + resume

**Can a browser-level mock simulate this?** No — for the core "SIGTERM → drain" trigger.

**Reasoning:** AC-1 has three parts:
1. **SIGTERM → onModuleDestroy → emit SESSION_DRAINING** — the drain trigger is a backend process signal (`SIGTERM`) received by the NestJS container, which invokes `onModuleDestroy()` on `SessionEventsService`. A browser-level mock cannot send a real `SIGTERM` to the backend process. The `onModuleDestroy` → `emit(SESSION_DRAINING)` → `complete()` chain is entirely backend-internal (NestJS lifecycle hooks + RxJS ReplaySubject). A browser mock can only simulate the *result* (emitting a `SESSION_DRAINING` event via mock EventSource), which is exactly what the component test does — it cannot prove the backend actually drains on SIGTERM.
2. **Client receives SESSION_DRAINING → sets state to 'reconnecting'** — browser-observable. A browser-level mock CAN emit `SESSION_DRAINING` via mock EventSource and verify the state transition. But this is identical to the component test (`ConversationPane.test.tsx`) — the only difference is real browser vs jsdom. The 3.11 precedent (AC-1 deferred) established that when the browser-observable part is purely "receive SSE event → state transition" (no HTTP interaction), the component test is sufficient and an E2E test adds no meaningful coverage.
3. **Client reconnects and resumes without losing history** — the "reconnect" part is browser-observable (EventSource auto-reconnect + `POST /resume`), but the "without losing history" part depends on Postgres persistence (backend-internal). A browser mock returns whatever data it's programmed to return — it cannot prove the history is actually persisted. The persistence guarantee rests on the existing `Turn` model (Story 3.1) and `sendTurn` writing every turn to Postgres — verified by unit tests, not E2E.

A browser-level mock that emits `SESSION_DRAINING` and then mocks the reconnect would be redundant with the component test (which already verifies the state transition + `onerror` preservation + `'reconnecting'` label). The SIGTERM trigger itself — the core of the AC — is not browser-simulatable.

**Coverage:** Unit tests (session-events.service.spec.ts, 6 tests — onModuleDestroy emits SESSION_DRAINING + completes subjects) + Integration tests (sandbox-lifecycle.integration.spec.ts, 4 tests — full drain sequence, shutdown ordering, getStatus after restart) + Component tests (ConversationPane.test.tsx, 4 tests — SESSION_DRAINING → 'reconnecting' state, try/catch on parse, onerror preservation).

**Decision (DP-5):** E2E deferred for AC-1. No browser-level mock covers the SIGTERM trigger (backend process signal). The browser-observable part (receiving SESSION_DRAINING → state transition) is covered by component tests. The SIGTERM → onModuleDestroy → emit chain is covered by unit + integration tests. Same deferral rationale as Story 3.11 AC-1 (backend-internal core behavior).

### AC-2: getStatus reports correct sandbox status after restart

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-2's core behavior is backend persistence: sandbox state (`sandboxId`, `sandboxStatus`) must be persisted to Postgres so that after a restart, `getStatus` reads from the database instead of the in-memory `Map` (which is empty after restart). A browser-level mock can intercept `GET /status` and return any response, but that only tests the browser's reaction to a response — it cannot prove the backend actually persists and reads from Postgres. The "restart" itself (process death + rebirth) is not browser-simulatable.

The browser-observable part (client calls `getStatus` and receives the correct status) is trivially covered by mocking the fetch response — but that proves nothing about the backend's persistence behavior. The meaningful test is at the unit/integration level: verify `getStatus` reads from Postgres (not the in-memory Map) after the Maps are cleared (simulating restart).

**Coverage:** Unit tests (conversations.service.spec.ts, 4 tests — getStatus reads from Postgres, returns persisted status after Map cleared, does not fall back to Map) + Integration test (sandbox-lifecycle.integration.spec.ts, 1 test — getStatus returns persisted status after simulated restart).

**Decision (DP-5):** E2E deferred for AC-2. No browser-level mock covers the backend persistence behavior. The unit + integration tests verify the actual Postgres read path. Same deferral rationale as Story 3.11 AC-1 (backend-internal core behavior).

### AC-3: ManualCommitService drain — complete or notify

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-3's core behavior is the `ManualCommitService.onModuleDestroy` lifecycle hook: when SIGTERM arrives, pending commits must either complete (with a bounded timeout) or emit `MANUAL_SAVE_FAILED`. This is entirely backend-internal (NestJS lifecycle hook + `pendingCommits` Set + `sessionEvents.emit()`). A browser-level mock can emit a `MANUAL_SAVE_FAILED` event via mock EventSource, but that only tests the browser's reaction to the event — it cannot prove the backend actually attempts completion and emits failure on timeout.

The browser-observable part (receiving `MANUAL_SAVE_FAILED` → tool pill shows error state) is already covered by existing Story 3.6 component tests. The new behavior (drain logic in `onModuleDestroy`) is backend-internal and must be tested at the unit level.

**Coverage:** Unit tests (manual-commit.service.spec.ts, 6 tests — onModuleDestroy emits MANUAL_SAVE_FAILED, bounded timeout, executingCommits guard, async hook) + Integration test (sandbox-lifecycle.integration.spec.ts, 1 test — MANUAL_SAVE_FAILED emits before SESSION_DRAINING in shutdown ordering).

**Decision (DP-5):** E2E deferred for AC-3. No browser-level mock covers the backend drain logic. The unit + integration tests verify the actual `onModuleDestroy` behavior. Same deferral rationale as Story 3.11 AC-3 (backend-internal core behavior).

### E2E Deferral Summary

| AC | Browser-level mock covers? | E2E tests created? | Coverage level |
| --- | --- | --- | --- |
| AC-1 | No (SIGTERM trigger is backend process signal) | No (deferred, DP-5) | Unit + Integration + Component |
| AC-2 | No (Postgres persistence is backend-internal) | No (deferred, DP-5) | Unit + Integration |
| AC-3 | No (onModuleDestroy drain logic is backend-internal) | No (deferred, DP-5) | Unit + Integration |

---

## Regression Guard Template Check (External Commands with User-Controlled Input)

Per user instruction: "When creating regression guards for code that executes external commands with user-controlled input, apply a uniform guard template to every call site: exercise both credential-isolation invariants (no credentials leak via command arguments or environment variables) and input-injection invariants (malicious input is safely quoted and cannot alter the command's behavior)."

**Does Story 3.12 involve code that executes external commands with user-controlled input?** No.

**Analysis:** Story 3.12's tasks are:
- Task 1: Prisma migration (schema change — add `sandboxId`/`sandboxStatus` columns) — no external commands
- Task 2: Postgres reads/writes (Prisma queries in ConversationsService) — no external commands
- Task 3: Fix `SandboxService.resume()` (reads `conversationId` from `sandbox.labels`) — no shell commands, no user-controlled input interpolation. The fix reads a label that was set at provision time (`labels: { conversationId: params.conversationId }`), not a user-supplied string.
- Task 4: Add `SESSION_DRAINING` SSE event type (constant in `ag-ui.types.ts`) — no external commands
- Task 5: `SessionEventsService.onModuleDestroy` (emit + complete RxJS subjects) — no external commands
- Task 6: `ManualCommitService.onModuleDestroy` (bounded timeout + emit `MANUAL_SAVE_FAILED`) — no external commands
- Task 7: Frontend `SESSION_DRAINING` handler (React state transition) — no external commands
- Task 8: Shutdown ordering coordination (NestJS module registration order verification) — no external commands

The `shellQuote` pattern (project-context.md "Shell-quote all interpolated values in sandbox process commands") applies to `SandboxService` git commands (`git clone`, `git config`, `git status`, `git commit`), which are NOT modified in this story. Task 3 only reads `sandbox.labels.conversationId` — it does not add new shell commands or interpolate user input. The existing regression guards in `sandbox.service.nfr-s1.spec.ts` (Stories 3.8 + 3.10) cover the existing shell command call sites.

**Decision (DP-4):** The regression guard template for external commands does not apply to Story 3.12. No new regression guards for credential-isolation or input-injection invariants are needed. Recorded because the user instruction explicitly requires the check.

---

## Red-Phase Test Scaffolds Created

### Unit Tests (6 tests) — NEW FILE

**File:** `apps/agent-be/src/streaming/session-events.service.spec.ts` (97 lines)

#### describe('[P0] Story 3.12 — onModuleDestroy emits SESSION_DRAINING (AC: 1)')

- **Test:** `[P0] onModuleDestroy emits SESSION_DRAINING to all conversations with active subjects`
  - **Status:** RED — `it.skip()` — `onModuleDestroy` not implemented yet (Task 5.1-5.2)
  - **Verifies:** AC-1 (drain notification reaches all active conversations)

- **Test:** `[P0] onModuleDestroy completes each subject after emitting drain`
  - **Status:** RED — `it.skip()` — `onModuleDestroy` not implemented yet
  - **Verifies:** AC-1 (subjects completed so reconnecting clients get fresh ReplaySubject)

- **Test:** `[P0] onModuleDestroy emits SESSION_DRAINING before completing the subject`
  - **Status:** RED — `it.skip()` — ordering not implemented yet (Task 5.2)
  - **Verifies:** AC-1 (drain event reaches subscribers before subject completes)

- **Test:** `[P0] onModuleDestroy is a no-op when no conversations have active subjects`
  - **Status:** RED — `it.skip()` — `onModuleDestroy` not implemented yet
  - **Verifies:** AC-1 (no spurious events when no active conversations)

#### describe('[P0] Story 3.12 — complete() removes subject from Map (AC: 1)')

- **Test:** `[P0] complete() removes the subject so reconnecting clients get a fresh ReplaySubject`
  - **Status:** RED — `it.skip()` — verifies existing `complete()` behavior holds after drain changes (Task 5.3)
  - **Verifies:** AC-1 (no stale drain event replayed on reconnect)

#### describe('[P1] Story 3.12 — onModuleDestroy implements OnModuleDestroy interface (AC: 1)')

- **Test:** `[P1] SessionEventsService implements OnModuleDestroy`
  - **Status:** RED — `it.skip()` — `OnModuleDestroy` not implemented yet (Task 5.1)
  - **Verifies:** AC-1 (NestJS lifecycle hook wired)

### Unit Tests (13 tests) — ADDED TO EXISTING FILE

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts` (36 new tests added at end)

#### describe('[P0] Story 3.12 — getStatus reads sandboxStatus from Postgres (AC: 2, P1)')

- **Test:** `[P0] getStatus returns persisted sandboxStatus after restart (in-memory Map cleared)`
  - **Status:** RED — `it.skip()` — Postgres read not implemented yet (Task 2.4)
  - **Verifies:** AC-2 (status read from Postgres, not in-memory Map)

- **Test:** `[P0] getStatus returns "failed" when conversation not found in Postgres`
  - **Status:** RED — `it.skip()` — Postgres read not implemented yet
  - **Verifies:** AC-2 (not-found returns 'failed', not 'provisioning')

- **Test:** `[P0] getStatus returns "provisioning" when sandboxStatus is null in Postgres (new conversation)`
  - **Status:** RED — `it.skip()` — Postgres read not implemented yet
  - **Verifies:** AC-2 (null status falls back to 'provisioning' for new conversations)

- **Test:** `[P0] getStatus does NOT fall back to in-memory Map when Postgres has the status`
  - **Status:** RED — `it.skip()` — Postgres read not implemented yet
  - **Verifies:** AC-2 (Postgres is source of truth, Map is not consulted)

#### describe('[P0] Story 3.12 — countActiveConversations uses Postgres filter (AC: 2, P1)')

- **Test:** `[P0] countActiveConversations queries Postgres with sandboxStatus in filter (not findMany + Map iteration)`
  - **Status:** RED — `it.skip()` — Postgres count query not implemented yet (Task 2.5)
  - **Verifies:** AC-2 (single DB query with status filter, not in-memory iteration)

- **Test:** `[P0] countActiveConversations returns 0 when no active conversations exist`
  - **Status:** RED — `it.skip()` — Postgres count not implemented yet
  - **Verifies:** AC-2 (zero count when no active conversations)

#### describe('[P0] Story 3.12 — resumeConversation reads sandbox state from Postgres (AC: 2, P1)')

- **Test:** `[P0] resumeConversation reads sandboxStatus and sandboxId from Postgres (not in-memory Maps)`
  - **Status:** RED — `it.skip()` — Postgres read not implemented yet (Task 2.6)
  - **Verifies:** AC-2 (resume reads from Postgres after restart)

- **Test:** `[P0] resumeConversation fast-path works after restart (Postgres has ready status + sandboxId)`
  - **Status:** RED — `it.skip()` — Postgres read not implemented yet
  - **Verifies:** AC-2 (fast-path resume works when Postgres has 'ready' status)

- **Test:** `[P0] resumeConversation returns "failed" when conversation not found in Postgres`
  - **Status:** RED — `it.skip()` — Postgres read not implemented yet
  - **Verifies:** AC-2 (not-found returns 'failed')

#### describe('[P0] Story 3.12 — persist sandbox state to Postgres on every write (AC: 2, P1)')

- **Test:** `[P0] provisionSandbox writes sandboxId and sandboxStatus="ready" to Postgres on success`
  - **Status:** RED — `it.skip()` — Postgres write not implemented yet (Task 2.1-2.2)
  - **Verifies:** AC-2 (sandbox state persisted on successful provision)

- **Test:** `[P0] provisionSandbox writes sandboxStatus="failed" and clears sandboxId on provision failure`
  - **Status:** RED — `it.skip()` — Postgres write on failure not implemented yet (Task 2.3)
  - **Verifies:** AC-2 (failure state persisted)

- **Test:** `[P0] mid-session idle timeout writes sandboxStatus="idle-timeout" and clears sandboxId`
  - **Status:** RED — `it.skip()` — Postgres write on teardown not implemented yet (Task 2.3)
  - **Verifies:** AC-2 (idle-timeout state persisted)

- **Test:** `[P0] createConversation writes sandboxStatus="provisioning" to Postgres`
  - **Status:** RED — `it.skip()` — Postgres write on create not implemented yet (Task 2.1)
  - **Verifies:** AC-2 (initial provisioning state persisted)

#### describe('[P0] Story 3.12 — listSkills reads sandboxId from Postgres (AC: 2, P1)')

- **Test:** `[P0] listSkills reads sandboxId from Postgres (not in-memory Map)`
  - **Status:** RED — `it.skip()` — Postgres read not implemented yet (Task 2.7)
  - **Verifies:** AC-2 (sandboxId read from Postgres)

- **Test:** `[P0] listSkills returns [] when sandboxId is null in Postgres`
  - **Status:** RED — `it.skip()` — Postgres read not implemented yet
  - **Verifies:** AC-2 (no sandboxId → empty skills list)

### Unit Tests (6 tests) — ADDED TO EXISTING FILE

**File:** `apps/agent-be/src/conversations/manual-commit.service.spec.ts` (6 new tests added at end)

#### describe('[P0] Story 3.12 — onModuleDestroy drains pending commits (AC: 3, P2)')

- **Test:** `[P0] onModuleDestroy emits MANUAL_SAVE_FAILED for each pending commit`
  - **Status:** RED — `it.skip()` — drain logic not implemented yet (Task 6.1-6.4)
  - **Verifies:** AC-3 (pending commits surfaced, not silently dropped)

- **Test:** `[P0] onModuleDestroy does NOT silently drop pending commits (clear without emit is forbidden)`
  - **Status:** RED — `it.skip()` — drain logic not implemented yet
  - **Verifies:** AC-3 (regression guard — silent drop is the bug being fixed)

- **Test:** `[P0] onModuleDestroy attempts bounded completion of pending commits before emitting failure`
  - **Status:** RED — `it.skip()` — bounded completion not implemented yet (Task 6.3)
  - **Verifies:** AC-3 (attempts to complete before failing)

- **Test:** `[P0] onModuleDestroy emits MANUAL_SAVE_FAILED when completion attempt times out (NFR-P5 ≤ 5s budget)`
  - **Status:** RED — `it.skip()` — bounded timeout not implemented yet (Task 6.3)
  - **Verifies:** AC-3 (timeout → failure notification)

- **Test:** `[P0] onModuleDestroy preserves the executingCommits Set guard (no parallel-commit race)`
  - **Status:** RED — `it.skip()` — guard preservation not verified yet (Task 6.5)
  - **Verifies:** AC-3 (regression guard — no parallel-commit race introduced)

- **Test:** `[P0] onModuleDestroy is async (NestJS awaits async lifecycle hooks)`
  - **Status:** RED — `it.skip()` — async hook not implemented yet (Task 6.1)
  - **Verifies:** AC-3 (NestJS awaits the async drain)

### Unit Tests (3 tests) — ADDED TO EXISTING FILE

**File:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (3 new tests added at end)

#### describe('[P0] Story 3.12 — resume() returns correct conversationId (AC: 1, P3)')

- **Test:** `[P0] resume() returns conversationId from sandbox.labels, not the sandboxId`
  - **Status:** RED — `it.skip()` — `resume()` fix not implemented yet (Task 3.2)
  - **Verifies:** AC-1 (P3 prerequisite — resume returns correct conversationId)

- **Test:** `[P0] resume() returns the correct sandboxId (distinct from conversationId)`
  - **Status:** RED — `it.skip()` — `resume()` fix not implemented yet
  - **Verifies:** AC-1 (sandboxId and conversationId are distinct)

- **Test:** `[P0] resume() returns status "ready" after starting the sandbox`
  - **Status:** RED — `it.skip()` — `resume()` fix not implemented yet
  - **Verifies:** AC-1 (status is 'ready' after resume)

### Component Tests (4 tests) — ADDED TO EXISTING FILE

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx` (4 new tests added at end)

#### describe('Story 3.12 — SESSION_DRAINING event handler')

- **Test:** `[P0] sets state to "reconnecting" when SESSION_DRAINING is received`
  - **Status:** RED — `it.skip()` — `SESSION_DRAINING` listener not implemented yet (Task 7.1-7.2)
  - **Verifies:** AC-1 (drain notification → 'reconnecting' state)

- **Test:** `[P0] SESSION_DRAINING listener wraps JSON.parse in try/catch (does not throw on malformed data)`
  - **Status:** RED — `it.skip()` — listener not implemented yet (Task 7.1, project-context.md:122)
  - **Verifies:** AC-1 (try/catch pattern — malformed data doesn't kill the listener)

- **Test:** `[P0] onerror does not override "reconnecting" state set by SESSION_DRAINING`
  - **Status:** RED — `it.skip()` — listener not implemented yet (Task 7.3, project-context.md:123)
  - **Verifies:** AC-1 (onerror preserves 'reconnecting' — intentional state transition)

- **Test:** `[P0] SESSION_DRAINING transitions from "ready" to "reconnecting" (not "error")`
  - **Status:** RED — `it.skip()` — listener not implemented yet
  - **Verifies:** AC-1 (drain is not an error — 'reconnecting', not 'error')

### Integration Tests (4 tests) — ADDED TO EXISTING FILE

**File:** `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` (4 new tests added at end)

#### describe('[P0] Story 3.12 — SIGTERM drain → reconnect → resume from Postgres (AC: 1, 2, 3)')

- **Test:** `[P0] SessionEventsService.onModuleDestroy emits SESSION_DRAINING to all active conversations`
  - **Status:** RED — `it.skip()` — `onModuleDestroy` not implemented yet (Task 5)
  - **Verifies:** AC-1 (drain reaches all conversations through full NestJS wiring)

- **Test:** `[P0] ManualCommitService.onModuleDestroy emits MANUAL_SAVE_FAILED for pending commits before subjects complete`
  - **Status:** RED — `it.skip()` — drain logic not implemented yet (Task 6)
  - **Verifies:** AC-3 (pending commits surfaced through full NestJS wiring)

- **Test:** `[P0] getStatus returns persisted sandboxStatus after simulated restart (in-memory Maps cleared)`
  - **Status:** RED — `it.skip()` — Postgres persistence not implemented yet (Task 2)
  - **Verifies:** AC-2 (status survives restart through full NestJS wiring)

- **Test:** `[P0] full drain sequence: MANUAL_SAVE_FAILED emits before SESSION_DRAINING (shutdown ordering)`
  - **Status:** RED — `it.skip()` — both drain hooks not implemented yet (Task 8)
  - **Verifies:** AC-1, AC-3 (shutdown ordering — manual save failure before SSE drain)

---

## Data Factories Created

No new data factories created. Tests use the existing `SandboxServiceFake` and `AgentServiceFake` test helpers (`apps/agent-be/test/helpers/`), which are the canonical test doubles for all Conversation-path tests. The `buildTestModule()` factory wires the fakes through the `SANDBOX_SERVICE` and `AGENT_SERVICE` DI tokens.

---

## Fixtures Created

No new fixtures created. Tests use the existing `buildTestModule()` NestJS test module factory (`apps/agent-be/test/helpers/test-module-builder.ts`), which pre-wires the `SandboxServiceFake` and supports array-form provider overrides.

---

## Mock Requirements

No new external service mocks required. All tests use existing test doubles:

### SandboxServiceFake

**File:** `apps/agent-be/test/helpers/sandbox-service.fake.ts`

**Notes:** Existing fake supports controllable failure injection (`failNextProvision()`, `failNextCommit()`, `setProvisionDelay()`). Task 3.4 requires updating `resume()` to mirror the corrected contract (reading `conversationId` from labels). The existing `resume()` already returns the correct `conversationId` from `provision()`'s stored value — verify it still matches after the fix.

### MockPrisma

**Pattern:** Inline `jest.fn().mockResolvedValue(...)` mocks for `prisma.conversation.findFirst`, `update`, `count`, `create`, `delete`. Tests for Task 2 (Postgres persistence) extend the mock to return `sandboxId` and `sandboxStatus` fields from `findFirst`, and assert on `update` calls with `sandboxId`/`sandboxStatus` data.

### MockEventSource (Component Tests)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

**Notes:** Existing `MockEventSource` class with static `emit()` method dispatches `MessageEvent` to registered listeners. The `SESSION_DRAINING` listener tests use the same pattern as `SESSION_TIMEOUT` tests — `MockEventSource.emit('SESSION_DRAINING', {})` dispatches to the registered listener.

---

## Required data-testid Attributes

No new `data-testid` attributes required. The `SESSION_DRAINING` handler tests assert on the existing "Reconnecting…" text label (already rendered when state is `'reconnecting'`), which is the same selector used by Story 3.5 resume tests.

---

## Implementation Checklist

### Test: onModuleDestroy emits SESSION_DRAINING to all conversations

**File:** `apps/agent-be/src/streaming/session-events.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Implement `OnModuleDestroy` interface on `SessionEventsService` (Task 5.1)
- [ ] In `onModuleDestroy`: iterate all `emitters` keys, `emit()` a `SESSION_DRAINING` event to each (Task 5.2)
- [ ] Add `SESSION_DRAINING_EVENT = 'SESSION_DRAINING'` constant to `ag-ui.types.ts` (Task 4.1-4.2)
- [ ] Run test: `yarn nx test agent-be --testPathPattern="session-events.service.spec"`
- [ ] ✅ Test passes (green phase)

### Test: onModuleDestroy completes each subject after emitting drain

**File:** `apps/agent-be/src/streaming/session-events.service.spec.ts`

**Tasks to make this test pass:**

- [ ] In `onModuleDestroy`: after `emit()`, call `complete()` on each subject (Task 5.2)
- [ ] `complete()` removes the subject from the `emitters` Map (Task 5.3)
- [ ] Run test: `yarn nx test agent-be --testPathPattern="session-events.service.spec"`
- [ ] ✅ Test passes (green phase)

### Test: getStatus returns persisted sandboxStatus after restart

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Add `sandboxId String?` and `sandboxStatus String?` columns to `Conversation` model (Task 1.1)
- [ ] Generate and commit migration (Task 1.2)
- [ ] Regenerate Prisma client (Task 1.3)
- [ ] Extend `getStatus` `select` projection to include `sandboxStatus` (Task 2.4)
- [ ] Read `sandboxStatus` from Postgres result instead of in-memory Map fallback (Task 2.4)
- [ ] Run test: `yarn nx test agent-be --testPathPattern="conversations.service.spec"`
- [ ] ✅ Test passes (green phase)

### Test: countActiveConversations uses Postgres filter

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Replace `findMany` + in-memory iteration with `prisma.conversation.count` (Task 2.5)
- [ ] Use `where: { userId, sandboxStatus: { in: ['provisioning', 'ready'] } }` (Task 2.5)
- [ ] Run test: `yarn nx test agent-be --testPathPattern="conversations.service.spec"`
- [ ] ✅ Test passes (green phase)

### Test: resumeConversation reads sandbox state from Postgres

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Extend `resumeConversation` `findFirst` `select` to include `sandboxId` and `sandboxStatus` (Task 2.6)
- [ ] Read `sandboxStatus` and `sandboxId` from Postgres instead of in-memory Maps (Task 2.6)
- [ ] Run test: `yarn nx test agent-be --testPathPattern="conversations.service.spec"`
- [ ] ✅ Test passes (green phase)

### Test: provisionSandbox writes sandboxId and sandboxStatus to Postgres

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] On `sandboxStatuses.set(...)`, also write to Postgres (Task 2.1)
- [ ] On `sandboxIds.set(...)`, also write `sandboxId` to Postgres (Task 2.2)
- [ ] On teardown (idle-timeout, failed), update Postgres `sandboxStatus` and clear `sandboxId` (Task 2.3)
- [ ] Run test: `yarn nx test agent-be --testPathPattern="conversations.service.spec"`
- [ ] ✅ Test passes (green phase)

### Test: onModuleDestroy emits MANUAL_SAVE_FAILED for pending commits

**File:** `apps/agent-be/src/conversations/manual-commit.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Make `onModuleDestroy` `async` (Task 6.1)
- [ ] For each entry in `pendingCommits`: resolve `sandboxId` (Task 6.2)
- [ ] Attempt bounded completion with `Promise.race` + timeout (Task 6.3)
- [ ] For commits that cannot complete: `sessionEvents.emit(conversationId, { event: 'MANUAL_SAVE_FAILED', data: { toolCallId: 'manual-save-drain', error: 'Server shutting down' } })` (Task 6.4)
- [ ] Run test: `yarn nx test agent-be --testPathPattern="manual-commit.service.spec"`
- [ ] ✅ Test passes (green phase)

### Test: resume() returns correct conversationId from sandbox.labels

**File:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts`

**Tasks to make this test pass:**

- [ ] Verify Daytona `Sandbox` object exposes `labels` (Task 3.1)
- [ ] Read `conversationId` from `sandbox.labels.conversationId` in `resume()` (Task 3.2)
- [ ] Update `SandboxServiceFake.resume()` to mirror corrected contract (Task 3.4)
- [ ] Run test: `yarn nx test agent-be --testPathPattern="sandbox.service.nfr-s1.spec"`
- [ ] ✅ Test passes (green phase)

### Test: SESSION_DRAINING sets state to "reconnecting"

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

**Tasks to make this test pass:**

- [ ] Add `SESSION_DRAINING` event listener in `startSession()` (Task 7.1)
- [ ] On `SESSION_DRAINING`: `setState('reconnecting')` (Task 7.2)
- [ ] Follow `try/catch` around `JSON.parse` pattern (Task 7.1, project-context.md:122)
- [ ] Run test: `yarn nx test web --testPathPattern="ConversationPane"`
- [ ] ✅ Test passes (green phase)

### Test: full drain sequence — MANUAL_SAVE_FAILED before SESSION_DRAINING

**File:** `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts`

**Tasks to make this test pass:**

- [ ] Implement `SessionEventsService.onModuleDestroy` (Task 5)
- [ ] Implement `ManualCommitService.onModuleDestroy` drain (Task 6)
- [ ] Verify NestJS reverse-registration `onModuleDestroy` order (Task 8.1)
- [ ] Run test: `cd apps/agent-be && npx jest --config test/jest-integration.config.ts sandbox-lifecycle`
- [ ] ✅ Test passes (green phase)

---

## Running Tests

```bash
# Run all agent-be unit tests
yarn nx test agent-be

# Run specific test files
yarn nx test agent-be --testPathPattern="session-events.service.spec"
yarn nx test agent-be --testPathPattern="conversations.service.spec"
yarn nx test agent-be --testPathPattern="manual-commit.service.spec"
yarn nx test agent-be --testPathPattern="sandbox.service.nfr-s1.spec"

# Run web component tests
yarn nx test web --testPathPattern="ConversationPane"

# Run integration tests
cd apps/agent-be && npx jest --config test/jest-integration.config.ts sandbox-lifecycle

# Run all tests for this story (after activating scaffolds)
yarn nx test agent-be --testPathPattern="session-events|conversations.service|manual-commit|sandbox.service.nfr-s1"
yarn nx test web --testPathPattern="ConversationPane"
cd apps/agent-be && npx jest --config test/jest-integration.config.ts sandbox-lifecycle
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ All tests written as red-phase scaffolds with `it.skip()`
- ✅ Fixtures and factories reuse existing test helpers (`buildTestModule`, `SandboxServiceFake`)
- ✅ Mock requirements documented
- ✅ Implementation checklist created

**Verification:**

- All generated tests are present and marked with `it.skip()`
- Activation guidance is clear and actionable
- Any activated test fails due to missing implementation, not test bugs

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Pick one scaffolded test** from implementation checklist (start with highest priority)
2. **Remove `it.skip()`** for that test and confirm it fails first
3. **Read the test** to understand expected behavior
4. **Implement minimal code** to make that specific test pass
5. **Run the test** to verify it now passes (green)
6. **Check off the task** in implementation checklist
7. **Move to next test** and repeat

**Key Principles:**

- One test at a time (don't try to fix all at once)
- Minimal implementation (don't over-engineer)
- Run tests frequently (immediate feedback)
- Use implementation checklist as roadmap

**Suggested activation order (dependency-aware):**

1. Task 1 (Prisma migration) — unblocks Tasks 2, 9.1
2. Task 4 (SESSION_DRAINING event type) — unblocks Tasks 5, 7
3. Task 5 (SessionEventsService.onModuleDestroy) — unblocks integration tests
4. Task 6 (ManualCommitService.onModuleDestroy) — unblocks integration tests
5. Task 2 (Persist sandbox state) — unblocks 9.1 getStatus/resumeConversation tests
6. Task 3 (Fix resume() contract) — unblocks 9.4 resume tests
7. Task 7 (Frontend SESSION_DRAINING handler) — unblocks 9.5 component tests
8. Task 8 (Shutdown ordering) — unblocks integration test 9.6

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

**DEV Agent Responsibilities:**

1. **Verify all tests pass** (green phase complete)
2. **Review code for quality** (readability, maintainability, performance)
3. **Extract duplications** (DRY principle)
4. **Optimize performance** (if needed)
5. **Ensure tests still pass** after each refactor
6. **Update documentation** (if API contracts change)

---

## Story Task Amendments (Per User Instruction)

Per user instruction: "After applying TDD red-phase scaffolding (adding skipped test blocks to new or existing files, adding test seams, or creating stub files), update the story file's tasks to reflect what was already done — tasks that instruct the dev to create scaffolding that prepare-tests has already applied should be amended to instruct activation of the existing scaffolding instead, so the story does not contradict the codebase state."

The following story tasks (Task 9) have been amended to reflect that the red-phase scaffolding already exists:

### Original Task 9 (Story File)

```
- [ ] **Task 9: Tests** (AC: #1, #2, #3)
  - [ ] 9.1 `conversations.service.spec.ts` — `getStatus` reads from Postgres after restart...
  - [ ] 9.2 `manual-commit.service.spec.ts` — `onModuleDestroy` emits `MANUAL_SAVE_FAILED`...
  - [ ] 9.3 `session-events.service.spec.ts` — `onModuleDestroy` emits `SESSION_DRAINING`...
  - [ ] 9.4 `sandbox.service.spec.ts` (or NFR spec) — `resume()` returns correct `conversationId`...
  - [ ] 9.5 `ConversationPane.test.tsx` — `SESSION_DRAINING` handler sets state to `'reconnecting'`
  - [ ] 9.6 Integration test: SIGTERM → drain notification → reconnect → resume from Postgres...
```

### Amended Task 9 (Reflecting Existing Scaffolding)

```
- [ ] **Task 9: Tests** (AC: #1, #2, #3) — RED-PHASE SCAFFOLDS ALREADY APPLIED by ATDD workflow
  - [ ] 9.1 ACTIVATE existing scaffolds in `conversations.service.spec.ts` — remove `it.skip()` for
        getStatus/countActiveConversations/resumeConversation/persist-on-write/listSkills tests,
        confirm RED, then implement to GREEN. Scaffolds: 13 tests across 5 describe blocks.
  - [ ] 9.2 ACTIVATE existing scaffolds in `manual-commit.service.spec.ts` — remove `it.skip()` for
        onModuleDestroy drain tests, confirm RED, then implement to GREEN. Scaffolds: 6 tests.
  - [ ] 9.3 ACTIVATE existing scaffolds in `session-events.service.spec.ts` (NEW FILE) — remove
        `it.skip()` for onModuleDestroy/complete tests, confirm RED, then implement to GREEN.
        Scaffolds: 6 tests.
  - [ ] 9.4 ACTIVATE existing scaffolds in `sandbox.service.nfr-s1.spec.ts` — remove `it.skip()`
        for resume() contract tests, confirm RED, then implement to GREEN. Scaffolds: 3 tests.
  - [ ] 9.5 ACTIVATE existing scaffolds in `ConversationPane.test.tsx` — remove `it.skip()` for
        SESSION_DRAINING handler tests, confirm RED, then implement to GREEN. Scaffolds: 4 tests.
  - [ ] 9.6 ACTIVATE existing scaffolds in `sandbox-lifecycle.integration.spec.ts` — remove
        `it.skip()` for SIGTERM drain integration tests, confirm RED, then implement to GREEN.
        Scaffolds: 4 tests.
```

**Action required:** The story file (`_bmad-output/implementation-artifacts/3-12-drain-conversations-gracefully-on-deploy.md`) Task 9 should be updated to reflect that scaffolds already exist. The dev should ACTIVATE (remove `it.skip()`) rather than CREATE new test blocks.

---

## Test Execution Evidence

### Initial Scaffold Review / RED Verification

**Command:** `yarn nx test agent-be` + `yarn nx test web --testPathPattern="ConversationPane"` + `cd apps/agent-be && npx jest --config test/jest-integration.config.ts sandbox-lifecycle`

**Results:**

```
agent-be unit tests:
Test Suites: 1 skipped, 11 passed, 12 total
Tests:       30 skipped, 210 passed, 240 total

web component tests:
Test Suites: 54 passed, 54 total
Tests:       4 skipped, 663 passed, 667 total

agent-be integration tests:
Test Suites: 1 passed, 1 total
Tests:       4 skipped, 12 passed, 16 total
```

**Summary:**

- Total new tests: 36 (6 + 13 + 6 + 3 + 4 + 4)
- Skipped: 36 (expected before activation)
- Passing: 0 before implementation (expected for skipped scaffolds)
- Status: ✅ Red-phase scaffolds verified — all compile and run, all skipped

---

## Notes

- **No E2E tests created** — all three ACs have backend-internal core behaviors (SIGTERM trigger, Postgres persistence, onModuleDestroy drain logic) that cannot be simulated by browser-level mocks. The browser-observable parts (receiving SESSION_DRAINING → state transition) are covered by component tests. See E2E Deferral Analysis above.
- **No regression guards for external commands** — Story 3.12 does not add or modify code that executes external commands with user-controlled input. Task 3 (resume fix) reads `sandbox.labels.conversationId`, not a user-supplied string. See Regression Guard Template Check above.
- **New test file created:** `session-events.service.spec.ts` — `SessionEventsService` had no dedicated spec file before this story. The new file follows the co-located test pattern (`*.spec.ts` next to source).
- **Integration test `module` reference:** The `sandbox-lifecycle.integration.spec.ts` `beforeEach` was updated to store the `module` reference (previously destructured but not stored) so the Story 3.12 integration tests can access `module.get(ManualCommitService)`.
- **Shutdown ordering test:** The integration test "full drain sequence: MANUAL_SAVE_FAILED emits before SESSION_DRAINING" verifies Task 8.1 (NestJS reverse-registration `onModuleDestroy` order). The test calls `manualCommitService.onModuleDestroy()` before `sessionEvents.onModuleDestroy()` to simulate the real shutdown order (ConversationsModule before StreamingModule).

---

## Knowledge Base References Applied

This ATDD workflow consulted the following knowledge fragments and project-context rules:

- **project-context.md:122** — `try/catch` around `JSON.parse` in every `EventSource.addEventListener` handler (applied to SESSION_DRAINING listener test)
- **project-context.md:123** — `eventSource.onerror` must not override intentional state transitions (applied to drain → 'reconnecting' → onerror test)
- **project-context.md:143** — `ReplaySubject<SseEvent>(100)` per conversation (applied to complete() removes subject test)
- **project-context.md:144** — Per-connection SSE events written directly to `res`, NOT via `emit()` (drain is conversation-level, uses `emit()`)
- **project-context.md:147** — `OnModuleDestroy` for in-process state cleanup (Story 3.12 extends this)
- **project-context.md:156** — `executingCommits` Set guard for queue-then-flush services (preserved in drain)
- **project-context.md:230** — `setImmediate` for deterministic fire-and-forget waits (integration test pattern)
- **project-context.md:231** — `jest.advanceTimersByTimeAsync(0)` under fake timers (manual-commit drain timeout test)
- **project-context.md:235** — Regression-guard tests for security invariants assert ABSENCE (checked — not applicable to 3.12)
- **decision-policy.md DP-3** — All options reversible + architecture-consistent → pick simplest (applied to SESSION_DRAINING event type, drain via emit(), sandbox columns on Conversation model)
- **decision-policy.md DP-4** — Test-only changes → decide autonomously (applied to regression guard template check)
- **decision-policy.md DP-5** — Scope temptation → defer, don't expand (applied to E2E deferral, AgentService.onModuleDestroy gaps)

---

**Generated by BMad TEA Agent** - 2026-07-06
