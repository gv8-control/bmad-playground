---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
lastStep: step-04-generate-tests
lastSaved: '2026-07-06'
workflowType: testarch-atdd
storyId: '3.9'
storyKey: '3-9-terminate-idle-sandboxes-mid-conversation'
storyFile: '_bmad-output/implementation-artifacts/3-9-terminate-idle-sandboxes-mid-conversation.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-3-9-terminate-idle-sandboxes-mid-conversation.md'
generatedTestFiles:
  - 'apps/agent-be/src/conversations/conversations.service.spec.ts'
  - 'apps/web/src/components/conversation/ConversationPane.test.tsx'
  - 'apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts'
  - 'playwright/e2e/conversation/mid-session-timeout.spec.ts'
inputDocuments:
  - '_bmad-output/implementation-artifacts/3-9-terminate-idle-sandboxes-mid-conversation.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/decision-policy.md'
  - 'apps/agent-be/src/conversations/conversations.service.ts'
  - 'apps/agent-be/src/sandbox/idle-timeout.service.ts'
  - 'apps/agent-be/src/conversations/manual-commit.service.ts'
  - 'apps/web/src/components/conversation/ConversationPane.tsx'
  - 'playwright/e2e/conversation/resume-conversation.spec.ts'
  - 'playwright/e2e/conversation/sandbox-lifecycle.spec.ts'
  - 'playwright/support/custom-fixtures.ts'
---

# ATDD Checklist - Epic 3, Story 3.9: Terminate Idle Sandboxes Mid-Conversation

**Date:** 2026-07-06
**Author:** Marius
**Primary Test Level:** Unit + Component (E2E for AC-3 frontend behavior)

---

## Story Summary

As the platform operator, I want a Sandbox that has gone idle mid-Conversation (not just before the first message) to be torn down, so that abandoned Conversations don't accrue Daytona costs indefinitely.

**As a** platform operator
**I want** a Sandbox that has gone idle mid-Conversation to be torn down
**So that** abandoned Conversations don't accrue Daytona costs indefinitely

---

## Acceptance Criteria

1. **AC-1:** Mid-session idle timeout (default 15 min) tears down the Sandbox — `destroy()`, `sandboxStatuses` → `'idle-timeout'`, `sandboxIds` deleted, `SESSION_TIMEOUT` with `{ reason: 'mid-session' }` emitted before `sessionEvents.complete()`.
2. **AC-2:** Dirty working tree is saved before teardown — `ManualCommitService.requestCommit` is `await`-ed (not fire-and-forget), `MANUAL_SAVE_SUCCEEDED`/`MANUAL_SAVE_FAILED` emitted before `SESSION_TIMEOUT`. Failed save does NOT abort teardown.
3. **AC-3:** Resume flow applies after mid-session teardown — existing `POST /resume` → `resumeConversation` slow path applies. Frontend `SESSION_TIMEOUT` handler shows mid-session-specific message and renders Retry button → `POST /resume`.

---

## Story Integration Metadata

- **Story ID:** `3.9`
- **Story Key:** `3-9-terminate-idle-sandboxes-mid-conversation`
- **Story File:** `_bmad-output/implementation-artifacts/3-9-terminate-idle-sandboxes-mid-conversation.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-3-9-terminate-idle-sandboxes-mid-conversation.md`
- **Generated Test Files:**
  - `apps/agent-be/src/conversations/conversations.service.spec.ts` (unit, 10 new tests)
  - `apps/web/src/components/conversation/ConversationPane.test.tsx` (component, 5 new tests)
  - `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` (integration, 1 new test)
  - `playwright/e2e/conversation/mid-session-timeout.spec.ts` (E2E, 3 new tests)

---

## E2E Deferral Analysis (Browser-Level Mock Verification)

Per user instruction: "Before deferring E2E coverage, verify no browser-level mock pattern can simulate the scenario — only defer if no mock covers the ACs, and record the check in the ATDD checklist."

### AC-1: Mid-session idle timeout tears down the Sandbox

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-1's core behavior is backend-internal: a Node.js `setTimeout` timer fires after 15 min, calls `sandboxService.destroy(sandboxId)`, mutates the `sandboxStatuses` and `sandboxIds` Maps, and emits `SESSION_TIMEOUT` via `sessionEvents.emit()`. A browser-level mock (Playwright `page.route()` / `addInitScript`) can intercept the SSE stream and inject a `SESSION_TIMEOUT` event, but it cannot:
- Verify the timer fires after 15 min (not 60s) — the timer is in the Node.js process
- Verify `destroy()` was called on the sandbox
- Verify `sandboxStatuses` was set to `'idle-timeout'`
- Verify `sandboxIds` was deleted

**Coverage:** Unit tests (conversations.service.spec.ts, 5 tests) + Integration test (sandbox-lifecycle.integration.spec.ts, 1 test) cover AC-1 at the appropriate level.

**Decision (DP-5):** E2E deferred for AC-1. No browser-level mock covers the core behavior. Backend timer + side effects are invisible to the browser.

### AC-2: Dirty working tree is saved before teardown

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-2's core behavior is backend-internal: `getWorkingTreeStatus()` pre-check, `await requestCommit()` (which calls `sandboxService.commit()`), event ordering (`MANUAL_SAVE_SUCCEEDED`/`MANUAL_SAVE_FAILED` before `SESSION_TIMEOUT`), and teardown-proceeds-on-save-failure. A browser-level mock can inject SSE events in order, but it cannot verify:
- `requestCommit` was actually called (not just that the events appeared)
- The `await` ordering (save completes before `SESSION_TIMEOUT` is emitted)
- `destroy()` is called even when the save fails
- The save is not fire-and-forget

**Coverage:** Unit tests (conversations.service.spec.ts, 3 tests) cover AC-2 at the appropriate level.

**Decision (DP-5):** E2E deferred for AC-2. No browser-level mock covers the core behavior. Save logic, `await` ordering, and `destroy`-on-failure are backend-internal.

### AC-3: Resume flow applies after mid-session teardown

**Can a browser-level mock simulate this?** Yes.

**Reasoning:** AC-3's user-facing behavior is entirely browser-observable: the `SESSION_TIMEOUT` SSE event arrives with `{ reason: 'mid-session' }`, the frontend shows a mid-session-specific message ("Your session expired due to inactivity."), renders the Retry button, and clicking Retry calls `POST /resume`. A Playwright test with `addInitScript` mocking `EventSource` and `fetch` can:
- Emit `SESSION_READY` then `SESSION_TIMEOUT` with `{ reason: 'mid-session' }`
- Verify the mid-session message appears in the real browser
- Click the real Retry button
- Verify `POST /resume` was called with the correct URL and Bearer JWT

This tests the real browser `EventSource` handling, real React rendering, and real `fetch` call — beyond what jsdom component tests verify.

**Coverage:** E2E test (mid-session-timeout.spec.ts, 3 tests) + Component tests (ConversationPane.test.tsx, 5 tests) cover AC-3 at both levels.

**Decision (DP-4):** E2E created for AC-3. Browser-level mock covers the user-facing behavior. Test-only change, decided autonomously.

---

## Red-Phase Test Scaffolds Created

### Unit Tests (10 tests)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

#### describe('[P0] Story 3.9 — mid-session idle timeout (AC-1)')

- **Test:** `[P0] mid-session timer starts after runAgentTurn completes — 60s does NOT fire, 900s does`
  - **Status:** RED — `it.skip()` — `IdleTimeoutService.startTimer` does not accept a `timeoutMs` parameter yet; `handleMidSessionIdleTimeout` does not exist
  - **Verifies:** AC-1 (timer starts after runAgentTurn, fires at 15 min not 60s)

- **Test:** `[P0] mid-session timer is cleared when sendTurn is called again`
  - **Status:** RED — `it.skip()` — mid-session timer is not started after `runAgentTurn` yet
  - **Verifies:** AC-1 (timer resets on new user message)

- **Test:** `[P0] mid-session timer fires after 15 min (not 60s)`
  - **Status:** RED — `it.skip()` — `MID_SESSION_IDLE_TIMEOUT_MS` constant does not exist yet
  - **Verifies:** AC-1 (15 min duration, not 60s)

- **Test:** `[P0] mid-session timer emits SESSION_TIMEOUT with { reason: "mid-session" }`
  - **Status:** RED — `it.skip()` — `handleMidSessionIdleTimeout` does not emit `SESSION_TIMEOUT` with `reason` yet
  - **Verifies:** AC-1 (SSE event payload)

- **Test:** `[P0] mid-session timer sets status to "idle-timeout" and deletes sandboxId`
  - **Status:** RED — `it.skip()` — `handleMidSessionIdleTimeout` does not set status / delete sandboxId yet
  - **Verifies:** AC-1 (Map mutations)

#### describe('[P0] Story 3.9 — dirty working tree save before teardown (AC-2)')

- **Test:** `[P0] attempts save when working tree is dirty — requestCommit called BEFORE destroy`
  - **Status:** RED — `it.skip()` — `handleMidSessionIdleTimeout` does not call `requestCommit` yet
  - **Verifies:** AC-2 (dirty tree → save before destroy, invocation order)

- **Test:** `[P0] does NOT save when working tree is clean — destroy called, requestCommit NOT called`
  - **Status:** RED — `it.skip()` — `handleMidSessionIdleTimeout` does not pre-check working tree yet
  - **Verifies:** AC-2 (clean tree → skip save)

- **Test:** `[P0] teardown proceeds even if save fails — MANUAL_SAVE_FAILED emitted, destroy still called`
  - **Status:** RED — `it.skip()` — `handleMidSessionIdleTimeout` does not exist yet
  - **Verifies:** AC-2 (save failure does not abort teardown, event ordering)

#### describe('[P0] Story 3.9 — fast-path resume starts mid-session timer (AC-1)')

- **Test:** `[P0] fast-path resume does NOT reset existing mid-session timer`
  - **Status:** RED — `it.skip()` — `IdleTimeoutService.hasTimer()` does not exist yet; mid-session timer not started in `runAgentTurn` yet
  - **Verifies:** AC-1 (resume fast-path checks `hasTimer`, doesn't reset existing timer)

- **Test:** `[P0] fast-path resume does NOT start mid-session timer when pre-first-message timer is running`
  - **Status:** RED — `it.skip()` — `IdleTimeoutService.hasTimer()` does not exist yet
  - **Verifies:** AC-1 (resume fast-path leaves pre-first-message timer alone)

### Component Tests (5 tests)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

#### describe('Story 3.9 — SESSION_TIMEOUT mid-session')

- **Test:** `[P0] shows "Your session expired due to inactivity." when SESSION_TIMEOUT has { reason: "mid-session" }`
  - **Status:** RED — `it.skip()` — `SESSION_TIMEOUT` handler does not parse `reason` field yet
  - **Verifies:** AC-3 (mid-session-specific message)

- **Test:** `[P0] shows "Starting your session is taking longer than expected." when SESSION_TIMEOUT has no reason (pre-first-message)`
  - **Status:** RED — `it.skip()` — `SESSION_TIMEOUT` handler does not parse `reason` field yet (fallback path)
  - **Verifies:** AC-3 (backward-compatible fallback message)

- **Test:** `[P0] shows "Starting your session is taking longer than expected." when SESSION_TIMEOUT data is unparseable`
  - **Status:** RED — `it.skip()` — `SESSION_TIMEOUT` handler does not wrap `JSON.parse` in try/catch yet
  - **Verifies:** AC-3 (malformed JSON fallback)

- **Test:** `[P0] Retry button calls POST /resume after mid-session SESSION_TIMEOUT`
  - **Status:** RED — `it.skip()` — `SESSION_TIMEOUT` handler does not parse `reason` yet; `onerror` override may hide Retry
  - **Verifies:** AC-3 (Retry → POST /resume)

- **Test:** `[P0] onerror does not override "timeout" state — Retry button remains visible`
  - **Status:** RED — `it.skip()` — `onerror` handler overrides `'timeout'` to `'error'` currently
  - **Verifies:** AC-3 (onerror fix preserves timeout state)

### Integration Tests (1 test)

**File:** `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts`

- **Test:** `[P0] tears down sandbox after mid-session idle timeout (15 min) when no further message is sent`
  - **Status:** RED — `it.skip()` — mid-session timer not wired in `runAgentTurn` yet
  - **Verifies:** AC-1, AC-2 (end-to-end sandbox lifecycle: provision → send turn → 15 min idle → sandbox count returns to 0)

### E2E Tests (3 tests)

**File:** `playwright/e2e/conversation/mid-session-timeout.spec.ts`

- **Test:** `[P0] shows "Your session expired due to inactivity." on mid-session SESSION_TIMEOUT (AC-3)`
  - **Status:** RED — `test.skip()` — `SESSION_TIMEOUT` handler does not parse `reason` field yet
  - **Verifies:** AC-3 (real browser EventSource + real React rendering of mid-session message)

- **Test:** `[P0] clicking Retry after mid-session SESSION_TIMEOUT calls POST /resume with Bearer JWT (AC-3)`
  - **Status:** RED — `test.skip()` — `SESSION_TIMEOUT` handler does not parse `reason` yet; `onerror` may override state
  - **Verifies:** AC-3 (Retry → POST /resume with auth header)

- **Test:** `[P0] shows "taking longer than expected" on pre-first-message SESSION_TIMEOUT (no reason field) — contrast with mid-session (AC-3)`
  - **Status:** RED — `test.skip()` — `SESSION_TIMEOUT` handler does not parse `reason` yet (both paths unimplemented)
  - **Verifies:** AC-3 (backward-compatible fallback for pre-first-message timeout)

---

## Data Factories Created

No new data factories created. Tests reuse existing fixtures:
- `SandboxServiceFake` (test helper) — `failNextCommit()`, `getWorkingTreeStatus` spy
- `AgentServiceFake` (test helper) — synchronous `runTurn` completion
- `withConversationAndTurns` (Playwright fixture) — seeds Conversation + Turn rows in Postgres

---

## Fixtures Created

No new fixtures created. Tests reuse existing test infrastructure:
- `buildTestModule()` from `test-module-builder.ts` (NestJS test module factory)
- `MockEventSource` class in `ConversationPane.test.tsx` (component-level SSE mock)
- `setupMidSessionTimeoutMocks()` in `mid-session-timeout.spec.ts` (Playwright browser-level SSE + fetch mock, follows `setupResumeMocks` pattern from `resume-conversation.spec.ts`)

---

## Mock Requirements

### SSE EventSource Mock (Component Tests)

**Endpoint:** N/A (EventSource is mocked globally in `ConversationPane.test.tsx`)

**Events emitted:**
- `SESSION_READY` with `{ sandboxId: 'sb-1' }` — transitions component to `'ready'` state
- `SESSION_TIMEOUT` with `{ reason: 'mid-session' }` — triggers mid-session timeout handler
- `SESSION_TIMEOUT` with `{}` — triggers pre-first-message fallback

### SSE EventSource Mock (E2E Tests)

**Endpoint:** N/A (EventSource is mocked via `page.addInitScript` in Playwright)

**Events emitted:**
- `SESSION_READY` with `{ sandboxId: 'sb-1' }`
- `SESSION_TIMEOUT` with `{ reason: 'mid-session' }`
- `SESSION_TIMEOUT` with `{}`

### Fetch Mock (E2E Tests)

**Endpoints mocked:**
- `POST /api/conversations/:id/resume` → `200 { conversationId, sandboxStatus: 'provisioning' }`
- `GET /api/conversations/:id/skills` → `200 []`

### SandboxServiceFake Working Tree Mock (Unit Tests)

**Method:** `getWorkingTreeStatus(sandboxId)` — spied via `jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['modified-file.ts'] })`

---

## Required data-testid Attributes

No new `data-testid` attributes required. Tests use existing selectors:
- `getByRole('button', { name: 'Retry' })` — Retry button (already rendered for `'timeout'` and `'error'` states)
- `getByText('Your session expired due to inactivity.')` — mid-session timeout message
- `getByText(/taking longer than expected/i)` — pre-first-message timeout message
- `getByRole('textbox', { name: 'Message input' })` — chat input

---

## Implementation Checklist

### Test: mid-session timer starts after runAgentTurn completes (AC-1)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 1: Add `DEFAULT_MID_SESSION_IDLE_TIMEOUT_MS` + `MID_SESSION_IDLE_TIMEOUT_MS` to `idle-timeout.service.ts`
- [ ] Task 1.3: Add optional `timeoutMs` parameter to `IdleTimeoutService.startTimer()`
- [ ] Task 2.1: Start mid-session timer in `runAgentTurn` after `flushPendingCommit` completes
- [ ] Task 3.1: Add `handleMidSessionIdleTimeout` method to `ConversationsService`
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Implement minimal code to make test pass (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 2 hours

---

### Test: mid-session timer is cleared when sendTurn is called again (AC-1)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 2.1: Start mid-session timer in `runAgentTurn` (timer is cleared by `onFirstMessage` via `sendTurn`, then restarted after `runAgentTurn` completes)
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify timer reset behavior (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 1 hour

---

### Test: mid-session timer fires after 15 min (not 60s) (AC-1)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 1.1-1.2: Add `DEFAULT_MID_SESSION_IDLE_TIMEOUT_MS = 900_000` and env-configured `MID_SESSION_IDLE_TIMEOUT_MS`
- [ ] Task 2.1: Pass `MID_SESSION_IDLE_TIMEOUT_MS` as 4th arg to `startTimer` in `runAgentTurn`
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify 15 min duration (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 1 hour

---

### Test: mid-session timer emits SESSION_TIMEOUT with { reason: "mid-session" } (AC-1)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 3.1: `handleMidSessionIdleTimeout` emits `{ event: 'SESSION_TIMEOUT', data: { reason: 'mid-session' } }`
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify SSE event payload (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 0.5 hours

---

### Test: mid-session timer sets status to "idle-timeout" and deletes sandboxId (AC-1)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 3.1: `handleMidSessionIdleTimeout` sets `sandboxStatuses` to `'idle-timeout'`, deletes `sandboxIds` entry
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify Map mutations (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 0.5 hours

---

### Test: attempts save when working tree is dirty — requestCommit called BEFORE destroy (AC-2)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 3.1: `handleMidSessionIdleTimeout` pre-checks `getWorkingTreeStatus`, calls `await requestCommit` if dirty
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify `requestCommit` called before `destroy` (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 1 hour

---

### Test: does NOT save when working tree is clean (AC-2)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 3.1: `handleMidSessionIdleTimeout` skips `requestCommit` when `workingTree.dirty` is false
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify clean tree path (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 0.5 hours

---

### Test: teardown proceeds even if save fails (AC-2)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 3.1: `handleMidSessionIdleTimeout` wraps save in try/catch, continues to teardown on failure
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify `MANUAL_SAVE_FAILED` emitted before `SESSION_TIMEOUT`, `destroy` still called (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 1 hour

---

### Test: fast-path resume does NOT reset existing mid-session timer (AC-1)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 1.4: Add `hasTimer(conversationId)` method to `IdleTimeoutService`
- [ ] Task 4.1: In `resumeConversation` fast-path, check `hasTimer` before starting mid-session timer
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify existing timer continues (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 1 hour

---

### Test: fast-path resume does NOT start mid-session timer when pre-first-message timer is running (AC-1)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 4.1: `hasTimer` check prevents starting mid-session timer when pre-first-message timer is running
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify pre-first-message timer is left alone (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 0.5 hours

---

### Test: shows "Your session expired due to inactivity." on mid-session SESSION_TIMEOUT (AC-3)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

**Tasks to make this test pass:**

- [ ] Task 5.1: Update `SESSION_TIMEOUT` handler to parse `reason` field and show mid-session message
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify mid-session message renders (GREEN)
- [ ] Run test: `yarn nx test web -- --testPathPattern ConversationPane.test`

**Estimated Effort:** 0.5 hours

---

### Test: shows "Starting your session is taking longer than expected." when no reason (AC-3)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

**Tasks to make this test pass:**

- [ ] Task 5.1: Fallback message in `SESSION_TIMEOUT` handler when `reason` is absent
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify fallback message (GREEN)
- [ ] Run test: `yarn nx test web -- --testPathPattern ConversationPane.test`

**Estimated Effort:** 0.5 hours

---

### Test: shows fallback message when SESSION_TIMEOUT data is unparseable (AC-3)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

**Tasks to make this test pass:**

- [ ] Task 5.1: `try/catch` around `JSON.parse` in `SESSION_TIMEOUT` handler
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify malformed JSON fallback (GREEN)
- [ ] Run test: `yarn nx test web -- --testPathPattern ConversationPane.test`

**Estimated Effort:** 0.5 hours

---

### Test: Retry button calls POST /resume after mid-session SESSION_TIMEOUT (AC-3)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

**Tasks to make this test pass:**

- [ ] Task 5.1: `SESSION_TIMEOUT` handler parses `reason`
- [ ] Task 5.2: Fix `onerror` to not override `'timeout'` state
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify Retry → POST /resume (GREEN)
- [ ] Run test: `yarn nx test web -- --testPathPattern ConversationPane.test`

**Estimated Effort:** 0.5 hours

---

### Test: onerror does not override "timeout" state (AC-3)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

**Tasks to make this test pass:**

- [ ] Task 5.2: Fix `eventSource.onerror` to preserve `'timeout'` and `'reconnecting'` states
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify state preserved after onerror (GREEN)
- [ ] Run test: `yarn nx test web -- --testPathPattern ConversationPane.test`

**Estimated Effort:** 0.5 hours

---

### Test: tears down sandbox after mid-session idle timeout (integration) (AC-1, AC-2)

**File:** `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts`

**Tasks to make this test pass:**

- [ ] Tasks 1-4: Full mid-session timer implementation
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify sandbox count returns to 0 after 15 min (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --config jest-integration.config.ts`

**Estimated Effort:** 1 hour

---

### Test: shows mid-session message on mid-session SESSION_TIMEOUT (E2E) (AC-3)

**File:** `playwright/e2e/conversation/mid-session-timeout.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 5.1: `SESSION_TIMEOUT` handler parses `reason` field
- [ ] Remove `test.skip()` and confirm test fails (RED)
- [ ] Verify real browser renders mid-session message (GREEN)
- [ ] Run test: `yarn test:e2e mid-session-timeout`

**Estimated Effort:** 0.5 hours

---

### Test: Retry → POST /resume after mid-session SESSION_TIMEOUT (E2E) (AC-3)

**File:** `playwright/e2e/conversation/mid-session-timeout.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 5.1-5.2: `SESSION_TIMEOUT` handler + `onerror` fix
- [ ] Remove `test.skip()` and confirm test fails (RED)
- [ ] Verify Retry click → POST /resume with Bearer JWT (GREEN)
- [ ] Run test: `yarn test:e2e mid-session-timeout`

**Estimated Effort:** 0.5 hours

---

### Test: pre-first-message SESSION_TIMEOUT shows fallback message (E2E contrast) (AC-3)

**File:** `playwright/e2e/conversation/mid-session-timeout.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 5.1: `SESSION_TIMEOUT` handler fallback path
- [ ] Remove `test.skip()` and confirm test fails (RED)
- [ ] Verify fallback message in real browser (GREEN)
- [ ] Run test: `yarn test:e2e mid-session-timeout`

**Estimated Effort:** 0.5 hours

---

## Running Tests

```bash
# Run all agent-be unit tests (Story 3.9 tests are skipped)
yarn nx test agent-be

# Run specific unit test file
yarn nx test agent-be -- --testPathPattern conversations.service.spec

# Run integration tests
yarn nx test agent-be -- --config jest-integration.config.ts

# Run all web component tests (Story 3.9 tests are skipped)
yarn nx test web

# Run specific component test file
yarn nx test web -- --testPathPattern ConversationPane.test

# Run E2E tests (Story 3.9 tests are skipped)
yarn test:e2e

# Run specific E2E test file
yarn test:e2e mid-session-timeout

# Run E2E in headed mode
yarn test:e2e:headed mid-session-timeout

# Debug specific E2E test
yarn test:e2e:debug mid-session-timeout
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- All tests written as red-phase scaffolds with `it.skip()` (Jest) / `test.skip()` (Playwright)
- No new fixtures or factories needed (existing test infrastructure reused)
- Mock requirements documented (SSE EventSource + fetch mocks)
- No new `data-testid` attributes required
- Implementation checklist created mapping each test to story tasks

**Verification:**

- All generated tests are present and marked with `it.skip()` / `test.skip()`
- Activation guidance: remove `.skip` for the current task's tests, confirm RED, then implement
- Tests will fail due to missing implementation (`handleMidSessionIdleTimeout` doesn't exist, `SESSION_TIMEOUT` handler doesn't parse `reason`, `onerror` overrides `'timeout'`)

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Pick one scaffolded test** from implementation checklist (start with Task 1 — `IdleTimeoutService` extension)
2. **Remove `it.skip()` / `test.skip()`** for that test and confirm it fails first
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

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

1. Verify all tests pass (green phase complete)
2. Review code for quality (readability, maintainability, performance)
3. Extract duplications (DRY principle)
4. Optimize performance (if needed)
5. Ensure tests still pass after each refactor

---

## Next Steps

1. **Link this checklist** into the story file `Dev Notes` — the story already references ATDD artifacts in its Tasks 7-9
2. **Begin implementation** using Tasks 1-6 from the story (implementation tasks) and this checklist (test activation)
3. **Activate one scaffold at a time** by removing `it.skip()` / `test.skip()` for the current task
4. **Work one activated test at a time** (red → green for each)
5. **When all activated tests pass**, run lint + typecheck (Task 10)
6. **When refactoring complete**, manually update story status to 'done' in sprint-status.yaml

---

## Decision Records

**Decision (DP-5):** E2E deferred for AC-1 (mid-session timer fires, destroy, Map mutations). No browser-level mock can simulate the backend Node.js timer or verify `sandboxService.destroy()` side effects. The core behavior is backend-internal. Covered by unit tests (5 tests) and integration test (1 test) at the appropriate level.

**Decision (DP-5):** E2E deferred for AC-2 (dirty tree save, event ordering, teardown-on-failure). No browser-level mock can verify `requestCommit` was actually called, the `await` ordering, or `destroy`-on-failure. The save logic and event ordering are backend-internal. Covered by unit tests (3 tests).

**Decision (DP-4):** E2E created for AC-3 (frontend resume flow after mid-session timeout). A browser-level mock (Playwright `addInitScript` mocking EventSource + fetch) covers the user-facing behavior: mid-session message rendering, Retry button, POST /resume call. Test-only change, decided autonomously. 3 E2E tests created in `playwright/e2e/conversation/mid-session-timeout.spec.ts`.

**Decision (DP-3):** Reused existing `setupResumeMocks` pattern from `resume-conversation.spec.ts` for the E2E test's mock infrastructure. The pattern (MockEventSource class + fetch mock via `addInitScript`) is proven, architecture-consistent, and functionally equivalent to a new mock. Simplest option — no new mock infrastructure created.

---

## Knowledge Base References Applied

- **project-context.md** — `jest.useFakeTimers()` + `jest.advanceTimersByTimeAsync()` pattern, `jest.spyOn(sandboxFake, 'getWorkingTreeStatus')` for working tree mocking, `events.indexOf()` comparison for event ordering, `setImmediate` for fire-and-forget waits, `try/catch` around `JSON.parse` in SSE handlers, `[P0]`/`[P1]` test priority tags, ATDD `test.skip()` red-phase pattern
- **resume-conversation.spec.ts** — `setupResumeMocks` pattern (MockEventSource + fetch mock via `addInitScript`) reused for E2E test
- **sandbox-lifecycle.spec.ts** — `setupConversationMocks` pattern referenced for E2E mock structure
- **conversations.service.spec.ts** — `buildTestModule()` + `SandboxServiceFake` + `AgentServiceFake` pattern, `jest.spyOn(sessionEvents, 'emit')` for SSE event assertion, `service['manualCommitService']` private member access for spying

---

## Test Execution Evidence

### Initial Scaffold Review / RED Verification

**Command:** `yarn nx test agent-be -- --testPathPattern conversations.service.spec` (and similar for other files)

**Results:**

```
Tests are generated as it.skip() / test.skip() scaffolds.
All 19 new tests (10 unit + 5 component + 1 integration + 3 E2E) are skipped.
No tests run until a developer removes .skip for the current task.
```

**Summary:**

- Total new tests: 19
- Skipped: 19 (expected before activation)
- Passing: 0 before implementation (expected for activated tests)
- Status: Red-phase scaffolds verified

---

## Notes

- The story's Tasks 7-9 specify the exact test scenarios. These scaffolds follow those specifications closely, adding the `it.skip()` / `test.skip()` red-phase marker per the ATDD pattern.
- The E2E test for AC-3 is an addition beyond the story's original tasks — it was created because a browser-level mock (Playwright SSE + fetch interception) CAN simulate the AC-3 scenario, per the user's instruction.
- The `onerror` fix (Task 5.2) is tested at both the component level (ConversationPane.test.tsx) and implicitly at the E2E level (the Retry button must remain visible after SSE closes).
- The `SandboxServiceFake.destroy` throws on already-destroyed sandboxes (pre-existing discrepancy, Story 3.1 fake). The `handleMidSessionIdleTimeout` wraps `destroy` in `try/catch`, so this is caught. Per DP-5, not fixed — cross-cutting test-infrastructure change beyond this story's ACs.

---

**Generated by BMad TEA Agent** - 2026-07-06
