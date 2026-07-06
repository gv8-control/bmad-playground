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
storyId: '3.11'
storyKey: '3-11-run-concurrent-conversations'
storyFile: '_bmad-output/implementation-artifacts/3-11-run-concurrent-conversations.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-3-11-run-concurrent-conversations.md'
generatedTestFiles:
  - 'apps/agent-be/src/conversations/conversations.service.spec.ts'
  - 'apps/agent-be/src/streaming/agent.service.unit.spec.ts'
  - 'apps/web/src/components/conversation/ConversationPane.test.tsx'
  - 'apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts'
  - 'playwright/e2e/conversation/concurrent-conversations.spec.ts'
inputDocuments:
  - '_bmad-output/implementation-artifacts/3-11-run-concurrent-conversations.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/decision-policy.md'
  - 'apps/agent-be/src/conversations/conversations.service.ts'
  - 'apps/agent-be/src/streaming/agent.service.ts'
  - 'apps/agent-be/src/conversations/conversations.service.spec.ts'
  - 'apps/agent-be/src/streaming/agent.service.unit.spec.ts'
  - 'apps/web/src/components/conversation/ConversationPane.test.tsx'
  - 'apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts'
  - 'playwright/e2e/conversation/sandbox-lifecycle.spec.ts'
---

# ATDD Checklist - Epic 3, Story 3.11: Run Concurrent Conversations

**Date:** 2026-07-06
**Author:** Marius
**Primary Test Level:** Unit + Integration + Component + E2E (split by AC — see deferral analysis)

---

## Story Summary

As a user juggling multiple BMAD workflows, I want to have several Conversations active at once, so that I'm not blocked working through one Skill at a time.

**As a** user juggling multiple BMAD workflows
**I want** to have several Conversations active at once
**So that** I'm not blocked working through one Skill at a time

---

## Acceptance Criteria

1. **AC-1:** A user with fewer than 10 active Conversations opens a new one — it runs with an independent Sandbox and chat history at its own stable URL (FR11), and the SSE transport supports 10 concurrent connections per browser session without connection starvation, requiring an HTTP/2-capable reverse proxy in front of `apps/agent-be` (NFR-R4).
2. **AC-2:** A user with 10 active Conversations is blocked with a "session limit reached" message rather than a silent failure (FR11).
3. **AC-3:** A second concurrent `runTurn` on the same conversation is rejected, not allowed to orphan the first — not allowed to overwrite the first turn's `activeRuns` and `circuitBreakerTimers` entries.
4. **AC-4:** Retry cancels in-flight provisioning before minting a new conversation — the previous in-flight provisioning is cancelled (Daytona sandbox torn down, DB row removed) before minting a new conversation, so retry does not leak sandboxes and rows across repeated clicks.

---

## Story Integration Metadata

- **Story ID:** `3.11`
- **Story Key:** `3-11-run-concurrent-conversations`
- **Story File:** `_bmad-output/implementation-artifacts/3-11-run-concurrent-conversations.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-3-11-run-concurrent-conversations.md`
- **Generated Test Files:**
  - `apps/agent-be/src/conversations/conversations.service.spec.ts` (unit, 16 new tests)
  - `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (unit, 4 new tests)
  - `apps/web/src/components/conversation/ConversationPane.test.tsx` (component, 7 new tests)
  - `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` (integration, 3 new tests)
  - `playwright/e2e/conversation/concurrent-conversations.spec.ts` (E2E, 5 new tests)

---

## E2E Deferral Analysis (Browser-Level Mock Verification)

Per user instruction: "Before deferring E2E coverage, verify no browser-level mock pattern can simulate the scenario — only defer if no mock covers the ACs, and record the check in the ATDD checklist."

The existing E2E pattern in `playwright/e2e/conversation/sandbox-lifecycle.spec.ts` establishes that browser-level mocks CAN intercept `fetch` (via `page.addInitScript`) and mock `EventSource` — exercising the real `ConversationPane` state machine without a live backend. This pattern is the baseline for the analysis below.

### AC-1: Independent Sandbox + stable URL + SSE 10 concurrent connections

**Can a browser-level mock simulate this?** No — for the core "independent Sandbox" claim.

**Reasoning:** AC-1 has three parts:
1. **Independent Sandbox** — the sandbox ID is backend in-memory state (`sandboxIds` Map in `ConversationsService`). A browser-level mock can intercept `POST /api/conversations` and return distinct conversation IDs, and can mock distinct SSE streams per conversation. But the mock returns independent data by construction — it cannot prove the backend allocated independent Daytona sandboxes. The "independent Sandbox" is the core of the AC, and it is not browser-observable.
2. **Stable URL** — browser-observable (the URL bar shows `/conversations/[conversationId]`). But this is already covered by existing E2E tests (`sandbox-lifecycle.spec.ts` verifies the EventSource URL contains the conversation ID). The URL stability is a routing concern, not a new behavior in this story.
3. **SSE 10 concurrent connections (NFR-R4)** — this is a deployment/infrastructure requirement (HTTP/2 reverse proxy), not a code behavior. The story explicitly states: "No code change for NFR-R4; verify the deployment invariant is in the launch checklist (it is)." A browser-level mock cannot test real SSE connection capacity — it would need 10 real connections to a real server, which requires the full infrastructure stack.

**Coverage:** Unit tests (conversations.service.spec.ts, 6 tests — count check with provisioning/ready/idle-timeout/failed statuses, boundary at 9, rejection at 10) + Integration test (sandbox-lifecycle.integration.spec.ts, 1 test — two conversations provision independently with distinct sandbox IDs) cover AC-1 at the appropriate level.

**Decision (DP-5):** E2E deferred for AC-1. No browser-level mock covers the backend-internal sandbox independence. The structural verification (distinct sandbox IDs via the fake, distinct DB rows) is sufficient proof. The SSE capacity requirement is a deployment invariant, not a code behavior. Same deferral rationale as Story 3.10.

### AC-2: "Session limit reached" blocking message

**Can a browser-level mock simulate this?** Yes.

**Reasoning:** AC-2 is entirely browser-observable. A browser-level mock (Playwright `page.addInitScript`) can intercept `POST /api/conversations` and return a 409 response with `{ code: 'CONVERSATION_LIMIT_REACHED', message: '...', meta: { limit: 10 } }`. The test can then verify:
- The "session limit reached" message renders in the chat area
- The chat input is hidden (not just disabled)
- No Retry button is rendered (the limit is not a transient error)
- A non-409 error still shows the generic error + Retry button (regression guard)

This is the same mock pattern used in `sandbox-lifecycle.spec.ts` (mock `fetch` + mock `EventSource` via `page.addInitScript`), adapted to return a 409 instead of a 201.

**Coverage:** E2E tests (concurrent-conversations.spec.ts, 3 tests — limit-reached message, input hidden + no Retry, non-409 regression guard) + Component tests (ConversationPane.test.tsx, 4 tests — same assertions at the component level with mocked `fetch`).

**Decision:** E2E NOT deferred for AC-2. A browser-level mock covers the AC. E2E test scaffolds created.

### AC-3: Concurrent `runTurn` rejection

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-3's core behavior is a backend race condition: a second `runTurn` call on a `conversationId` that already has an in-flight agent turn must be rejected before it overwrites `activeRuns` and `circuitBreakerTimers`. This requires controlling the timing of the Claude Agent SDK's async generator — specifically, keeping the first `runTurn` in-flight (awaiting a never-resolving promise) while the second `runTurn` arrives.

A browser-level mock can intercept HTTP requests and SSE events, but it cannot:
- Control the backend's async generator timing (the SDK `query()` function is called server-side)
- Verify that `activeRuns.has(conversationId)` was checked (backend Map state, not browser-observable)
- Verify that `circuitBreakerTimers` was not overwritten (backend Map state)
- Verify that no `RUN_STARTED` or `RUN_ERROR` SSE event was emitted for the rejected turn (the absence of an event is not reliably testable via SSE mocking — the mock would need to distinguish "event not emitted" from "event not yet emitted")

The concurrent-turn guard is a backend safety net against a UI-prevented race (the UI disables input during processing). The test must use the real `AgentService` with a controllable async generator (`yieldThenHang`) — this is only possible in unit tests.

**Coverage:** Unit tests (agent.service.unit.spec.ts, 4 tests — second runTurn rejected, no RUN_STARTED/RUN_ERROR emitted, circuitBreakerTimers not overwritten, defensive timer clear).

**Decision (DP-5):** E2E deferred for AC-3. No browser-level mock can control backend async-generator timing. The unit test with the real `AgentService` and a never-resolving generator is the appropriate test level.

### AC-4: Retry cancels in-flight provisioning before minting new

**Can a browser-level mock simulate this?** Yes — for the browser-observable part.

**Reasoning:** AC-4 has two parts:
1. **Browser-observable:** The `handleRetry` function calls `DELETE /api/conversations/:oldId` before `POST /api/conversations` (mint new). A browser-level mock can capture fetch call ordering via `__mockFetchCalls` (the same pattern used in `sandbox-lifecycle.spec.ts` for POST verification). The test can verify the DELETE call happens before the second POST by comparing `invocationCallOrder` or array indices. The test can also verify no DELETE is called for existing conversations (`initialConversationId` defined) or when the POST never succeeded (`conversationIdRef` is null).
2. **Backend-internal:** The actual Daytona sandbox teardown (`sandboxService.destroy(sandboxId)`) and DB row deletion (`conversation.delete`) happen server-side. A browser mock can't verify these. But the browser can verify the DELETE request was sent, which is the browser's contribution to the cancellation.

The browser-level mock covers the browser-observable part (DELETE-before-POST ordering). The backend part is covered by unit tests (abandonConversation destroys sandbox + deletes row + clears maps + completes SSE subject) and integration tests (abandonConversation through full NestJS module wiring).

**Coverage:** E2E tests (concurrent-conversations.spec.ts, 2 tests — DELETE before POST, no DELETE for existing conversation) + Component tests (ConversationPane.test.tsx, 3 tests — DELETE before POST, no DELETE for existing, no DELETE when POST failed) + Unit tests (conversations.service.spec.ts, 7 tests — abandonConversation full lifecycle) + Integration test (sandbox-lifecycle.integration.spec.ts, 1 test — abandonConversation tears down sandbox + deletes row).

**Decision:** E2E NOT deferred for AC-4. A browser-level mock covers the browser-observable part (DELETE-before-POST ordering). E2E test scaffolds created.

### E2E Deferral Summary

| AC | Browser-level mock covers? | E2E tests created? | Coverage level |
| --- | --- | --- | --- |
| AC-1 | No (sandbox independence is backend-internal) | No (deferred, DP-5) | Unit + Integration |
| AC-2 | Yes (409 response → UI state) | Yes (3 E2E tests) | E2E + Component |
| AC-3 | No (backend async-generator timing) | No (deferred, DP-5) | Unit |
| AC-4 | Yes (DELETE-before-POST ordering) | Yes (2 E2E tests) | E2E + Component + Unit + Integration |

---

## Regression Guard Template Check (External Commands with User-Controlled Input)

Per user instruction: "When creating regression guards for code that executes external commands with user-controlled input, apply a uniform guard template to every call site: exercise both credential-isolation invariants (no credentials leak via command arguments or environment variables) and input-injection invariants (malicious input is safely quoted and cannot alter the command's behavior)."

**Does Story 3.11 involve code that executes external commands with user-controlled input?** No.

**Analysis:** Story 3.11's tasks are:
- Task 1: Per-user concurrent-conversation count check (Postgres query + in-memory Map lookup) — no external commands
- Task 2: Frontend limit-reached state (React state management) — no external commands
- Task 3: Concurrent-turn guard (Map.has check + early return) — no external commands
- Task 4: `abandonConversation` method (calls `sandboxService.destroy(sandboxId)`) — `sandboxId` is an internal ID from the `sandboxIds` Map, not user-controlled input. `destroy` is a Daytona SDK API call, not a shell command.
- Task 5: `DELETE /:id` controller endpoint (NestJS route handler) — no external commands
- Task 6: `handleRetry` frontend (fetch DELETE + POST) — no external commands

The `shellQuote` pattern (project-context.md "Shell-quote all interpolated values in sandbox process commands") applies to `SandboxService` git commands (`git clone`, `git config`, `git status`), which are NOT modified in this story. Story 3.10 already has regression guards for shell-quoting in `sandbox.service.nfr-s1.spec.ts`.

**Decision (DP-4):** The regression guard template for external commands does not apply to Story 3.11. No new regression guards for credential-isolation or input-injection invariants are needed. Recorded because the user instruction explicitly requires the check.

---

## Red-Phase Test Scaffolds Created

### Unit Tests (16 tests)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

#### describe('[P0] Story 3.11 — concurrent conversation limit (AC: 1, 2)')

- **Test:** `[P0] createConversation succeeds when active count < 10`
  - **Status:** RED — `it.skip()` — `countActiveConversations` method does not exist yet (Task 1.2 not implemented)
  - **Verifies:** AC-1 (conversation creation succeeds below the limit)

- **Test:** `[P0] createConversation succeeds at the boundary (9 active)`
  - **Status:** RED — `it.skip()` — `countActiveConversations` does not exist yet
  - **Verifies:** AC-1 (boundary condition — 9 active is still allowed)

- **Test:** `[P0] createConversation throws ConflictException when active count >= 10 (AC-2)`
  - **Status:** RED — `it.skip()` — count check not implemented yet
  - **Verifies:** AC-2 (limit enforcement with correct error code + meta)

- **Test:** `[P0] idle-timed-out conversations do NOT count toward the limit`
  - **Status:** RED — `it.skip()` — `countActiveConversations` does not exist yet
  - **Verifies:** AC-1 (DP-2 decision — idle-timed-out sandboxes are gone, don't count)

- **Test:** `[P0] failed conversations do NOT count toward the limit`
  - **Status:** RED — `it.skip()` — `countActiveConversations` does not exist yet
  - **Verifies:** AC-1 (failed sandboxes don't count)

- **Test:** `[P0] provisioning conversations DO count toward the limit`
  - **Status:** RED — `it.skip()` — `countActiveConversations` does not exist yet
  - **Verifies:** AC-1 (provisioning sandboxes are active, count toward the limit)

#### describe('[P0] Story 3.11 — abandonConversation (AC: 4)')

- **Test:** `[P0] deletes the conversation row when called`
  - **Status:** RED — `it.skip()` — `abandonConversation` method does not exist yet (Task 4.2 not implemented)
  - **Verifies:** AC-4 (DB row removed on abandon)

- **Test:** `[P0] destroys the sandbox when one exists`
  - **Status:** RED — `it.skip()` — `abandonConversation` does not exist yet
  - **Verifies:** AC-4 (Daytona sandbox torn down on abandon)

- **Test:** `[P0] clears in-memory maps`
  - **Status:** RED — `it.skip()` — `abandonConversation` does not exist yet
  - **Verifies:** AC-4 (sandboxStatuses + sandboxIds maps cleared)

- **Test:** `[P0] clears the idle timer`
  - **Status:** RED — `it.skip()` — `abandonConversation` does not exist yet
  - **Verifies:** AC-4 (idle timer cleared on abandon)

- **Test:** `[P0] completes the SSE subject`
  - **Status:** RED — `it.skip()` — `abandonConversation` does not exist yet
  - **Verifies:** AC-4 (SSE subject completed on abandon)

- **Test:** `[P0] returns { abandoned: false } when conversation does not exist (idempotent)`
  - **Status:** RED — `it.skip()` — `abandonConversation` does not exist yet
  - **Verifies:** AC-4 (idempotent — no error on already-deleted conversation)

- **Test:** `[P0] tenant isolation — findFirst called with userId filter`
  - **Status:** RED — `it.skip()` — `abandonConversation` does not exist yet
  - **Verifies:** AC-4 (tenant authorization — userId filter prevents cross-user abandon)

#### describe('[P0] Story 3.11 — provisionSandbox cancellation check (AC: 4)')

- **Test:** `[P0] aborts after queue acquire when cancelled`
  - **Status:** RED — `it.skip()` — cancellation check in `provisionSandbox` not implemented yet (Task 4.3)
  - **Verifies:** AC-4 (provisioning cancelled while waiting for a slot)

- **Test:** `[P0] aborts after sandbox provision when cancelled`
  - **Status:** RED — `it.skip()` — cancellation check after provision not implemented yet
  - **Verifies:** AC-4 (sandbox destroyed if cancelled after provision completed)

- **Test:** `[P0] provision slot is released on cancellation`
  - **Status:** RED — `it.skip()` — `finally` block cleanup not implemented yet
  - **Verifies:** AC-4 (provision queue slot released even on cancellation)

### Unit Tests (4 tests)

**File:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts`

#### describe('[P0] Story 3.11 — concurrent-turn guard (AC: 3)')

- **Test:** `[P0] second runTurn on an in-flight conversationId is rejected (returns without overwriting)`
  - **Status:** RED — `it.skip()` — concurrent-turn guard not implemented yet (Task 3.1)
  - **Verifies:** AC-3 (second runTurn rejected, first run's activeRuns preserved)

- **Test:** `[P0] the rejected second turn does NOT emit RUN_STARTED or RUN_ERROR`
  - **Status:** RED — `it.skip()` — guard not implemented yet
  - **Verifies:** AC-3 (DP-3 decision — silent rejection, no SSE event to avoid disrupting first turn's subscribers)

- **Test:** `[P0] the rejected second turn does NOT overwrite circuitBreakerTimers`
  - **Status:** RED — `it.skip()` — guard not implemented yet
  - **Verifies:** AC-3 (only one timer entry — the first run's)

- **Test:** `[P0] startCircuitBreakerTimer clears a pre-existing timer before setting a new one`
  - **Status:** RED — `it.skip()` — defensive clear in `startCircuitBreakerTimer` not implemented yet (Task 3.2)
  - **Verifies:** AC-3 (deferred-work.md fix — orphaned timer from prior run doesn't fire on new run)

### Component Tests (7 tests)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

#### describe('[P0] Story 3.11 — conversation limit reached (AC: 2)')

- **Test:** `[P0] shows the "limit reached" blocking message`
  - **Status:** RED — `it.skip()` — `'limit-reached'` state not implemented yet (Task 2.1-2.2)
  - **Verifies:** AC-2 (409 response → blocking message renders in chat area)

- **Test:** `[P0] chat input is hidden when limit reached`
  - **Status:** RED — `it.skip()` — `inputDisabled` doesn't include `'limit-reached'` yet (Task 2.3)
  - **Verifies:** AC-2 (chat input hidden, not just disabled)

- **Test:** `[P0] no Retry button in limit-reached state`
  - **Status:** RED — `it.skip()` — Retry button condition doesn't exclude `'limit-reached'` yet (Task 2.4)
  - **Verifies:** AC-2 (limit is not transient — no Retry button)

- **Test:** `[P0] non-409 error still shows generic error + Retry`
  - **Status:** RED — `it.skip()` — 409 handling not implemented yet (regression guard)
  - **Verifies:** AC-2 (regression guard — limit-reached handling doesn't break generic error path)

#### describe('[P0] Story 3.11 — retry cancels in-flight provisioning (AC: 4)')

- **Test:** `[P0] handleRetry calls DELETE on the old conversation before minting new`
  - **Status:** RED — `it.skip()` — `handleRetry` doesn't call DELETE yet (Task 6.1)
  - **Verifies:** AC-4 (DELETE before POST ordering via `invocationCallOrder`)

- **Test:** `[P0] handleRetry does NOT call DELETE when initialConversationId is defined`
  - **Status:** RED — `it.skip()` — `handleRetry` cancel logic not implemented yet
  - **Verifies:** AC-4 (existing conversations keep resume behavior — no DELETE)

- **Test:** `[P0] handleRetry does NOT call DELETE when conversationIdRef is null (POST never succeeded)`
  - **Status:** RED — `it.skip()` — `handleRetry` cancel logic not implemented yet
  - **Verifies:** AC-4 (no DELETE when there's nothing to cancel)

### Integration Tests (3 tests)

**File:** `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts`

#### describe('[P0] Story 3.11 — concurrent conversations + limit + abandon (integration)')

- **Test:** `[P0] two conversations provision independently with distinct sandbox IDs (AC-1)`
  - **Status:** RED — `it.skip()` — `countActiveConversations` not implemented yet (count check would reject the second conversation at 0 active if the check exists but the mock returns [])
  - **Verifies:** AC-1 (end-to-end through full NestJS module wiring — distinct sandbox IDs)

- **Test:** `[P0] createConversation rejects at 10 active (AC-2)`
  - **Status:** RED — `it.skip()` — count check not implemented yet
  - **Verifies:** AC-2 (integration-level limit enforcement)

- **Test:** `[P0] abandonConversation tears down sandbox + deletes row (AC-4)`
  - **Status:** RED — `it.skip()` — `abandonConversation` not implemented yet
  - **Verifies:** AC-4 (end-to-end through full NestJS module wiring — sandbox destroyed, row deleted, SSE completed)

### E2E Tests (5 tests)

**File:** `playwright/e2e/conversation/concurrent-conversations.spec.ts`

- **Test:** `[P0] limit-reached message renders when POST returns 409 CONVERSATION_LIMIT_REACHED (AC-2)`
  - **Status:** RED — `test.skip()` — `'limit-reached'` state not implemented yet (Task 2.1-2.2)
  - **Verifies:** AC-2 (browser-level mock: 409 → blocking message renders in real browser)

- **Test:** `[P0] chat input hidden and no Retry button in limit-reached state (AC-2)`
  - **Status:** RED — `test.skip()` — `inputDisabled` + Retry button conditions not updated yet
  - **Verifies:** AC-2 (browser-level: input hidden, no Retry in limit-reached state)

- **Test:** `[P0] non-409 error shows generic error + Retry (AC-2 regression guard)`
  - **Status:** RED — `test.skip()` — 409 handling not implemented yet
  - **Verifies:** AC-2 (browser-level regression guard — generic error path still works)

- **Test:** `[P0] retry calls DELETE on old conversation before minting new (AC-4)`
  - **Status:** RED — `test.skip()` — `handleRetry` doesn't call DELETE yet (Task 6.1)
  - **Verifies:** AC-4 (browser-level: DELETE-before-POST ordering via fetch call capture)

- **Test:** `[P0] retry does NOT call DELETE for existing conversation (AC-4)`
  - **Status:** RED — `test.skip()` — `handleRetry` cancel logic not implemented yet
  - **Verifies:** AC-4 (browser-level: existing conversations keep resume behavior — no DELETE)

---

## Data Factories Created

No new data factories created. Tests reuse existing test infrastructure:
- `SandboxServiceFake` (test helper) — `provision`, `destroy`, `getCommitCalls` already implemented
- `AgentServiceFake` (test helper) — `isIdle()` returns `true` by default
- `buildTestModule()` from `test-module-builder.ts` (NestJS test module factory)
- `mockPrisma` setup in `beforeEach` — extended with `findMany` and `delete` on the `conversation` mock

---

## Fixtures Created

No new fixtures created. Tests reuse existing test infrastructure:
- `mockPrisma` setup in `beforeEach` (conversations.service.spec.ts) — default user `{ name: 'Test User', email: 'test@example.com', githubLogin: 'testuser' }`
- `mockPrisma` setup in `beforeEach` (sandbox-lifecycle.integration.spec.ts) — same default user
- `MockEventSource` class (ConversationPane.test.tsx) — static `emit()` + `reset()` for SSE event injection
- `withRepoConnection` fixture (custom-fixtures.ts) — seeds test user + repo connection for E2E
- `setupConversationMocks` / `setupLimitReachedMocks` / `setupRetryCancelMocks` helpers (E2E) — `page.addInitScript` mock installation

---

## Mock Requirements

### mockPrisma Extension (Unit + Integration Tests)

**Method:** `conversation.findMany` — added to the mock (returns `[]` by default — no active conversations). Per-test overrides via `mockResolvedValue` with arrays of `{ id: string }`.

**Method:** `conversation.delete` — added to the mock (returns `{ id: 'conv-1' }` by default).

### SandboxServiceFake (Unit + Integration Tests)

No extension needed. `destroy(sandboxId)` already exists from Story 3.1. `provision()` already exists with the `sandboxCounter` from Story 3.10.

### MockEventSource (Component Tests)

No extension needed. The existing `MockEventSource` class with static `emit()` + `reset()` is reused. Tests emit `SESSION_TIMEOUT` to trigger the retry flow.

### Browser-Level Mock (E2E Tests)

**Pattern:** `page.addInitScript()` installs a mock `EventSource` class and a mock `window.fetch` before the page loads. The mock `fetch` intercepts:
- `POST /api/conversations` — returns 409 (limit-reached) or 201 `{ id: 'conv-retry-1' }` (retry-cancel)
- `DELETE /api/conversations/:id` — returns 200 `{ conversationId, abandoned: true }`
- All other URLs — passthrough to original `fetch`

The mock captures all fetch calls in `__mockFetchCalls` for ordering assertions (DELETE before second POST).

---

## Required data-testid Attributes

No new `data-testid` attributes required. E2E tests use `getByRole` / `getByText` selectors:
- `getByRole('button', { name: 'Retry' })` — Retry button
- `getByRole('textbox', { name: 'Message input' })` — Chat input
- `getByText(/reached the limit/i)` — Limit-reached blocking message
- `getByText(/Failed to create conversation/i)` — Generic error message

---

## Implementation Checklist

### Test: createConversation throws ConflictException when active count >= 10 (AC-2)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 1.1: Add `MAX_CONCURRENT_CONVERSATIONS` constant (IIFE pattern)
- [ ] Task 1.2: Add `countActiveConversations(userId)` helper method
- [ ] Task 1.3: Add count check at top of `createConversation` (throw `ConflictException`)
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 1 hour

---

### Test: second runTurn on an in-flight conversationId is rejected (AC-3)

**File:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 3.1: Add `activeRuns.has(conversationId)` guard at top of `runTurn`
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern agent.service.unit.spec`

**Estimated Effort:** 0.5 hours

---

### Test: startCircuitBreakerTimer clears a pre-existing timer (AC-3)

**File:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 3.2: Add `clearCircuitBreakerTimer(conversationId)` call at top of `startCircuitBreakerTimer`
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern agent.service.unit.spec`

**Estimated Effort:** 0.5 hours

---

### Test: deletes the conversation row when called (AC-4)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 4.1: Add `cancelledConversations` Set field
- [ ] Task 4.2: Add `abandonConversation(conversationId, userId)` method
- [ ] Task 4.3: Add cancellation checks in `provisionSandbox`
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 1.5 hours

---

### Test: shows the "limit reached" blocking message (AC-2)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

**Tasks to make this test pass:**

- [ ] Task 2.1: Add `'limit-reached'` to `SessionState` union type
- [ ] Task 2.2: Add 409 detection in `startSession()` error handling
- [ ] Task 2.3: Add `'limit-reached'` to `inputDisabled` condition
- [ ] Task 2.4: Do NOT add `'limit-reached'` to Retry button condition
- [ ] Task 2.5: Verify blocking message renders in place of introductory prompt
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN)
- [ ] Run test: `yarn nx test web -- --testPathPattern ConversationPane.test`

**Estimated Effort:** 1 hour

---

### Test: handleRetry calls DELETE on the old conversation before minting new (AC-4)

**File:** `apps/web/src/components/conversation/ConversationPane.test.tsx`

**Tasks to make this test pass:**

- [ ] Task 6.1: Make `handleRetry` async + add DELETE-before-mint-new logic
- [ ] Task 5.1: Add `DELETE /:id` controller endpoint
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN)
- [ ] Run test: `yarn nx test web -- --testPathPattern ConversationPane.test`

**Estimated Effort:** 1 hour

---

### Test: limit-reached message renders when POST returns 409 (E2E, AC-2)

**File:** `playwright/e2e/conversation/concurrent-conversations.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 2.1-2.5: Implement limit-reached state in `ConversationPane`
- [ ] Remove `test.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN)
- [ ] Run test: `yarn playwright test concurrent-conversations`

**Estimated Effort:** 0.5 hours (after component implementation)

---

### Test: retry calls DELETE on old conversation before minting new (E2E, AC-4)

**File:** `playwright/e2e/conversation/concurrent-conversations.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 6.1: Implement `handleRetry` DELETE-before-mint-new
- [ ] Task 5.1: Add `DELETE /:id` controller endpoint
- [ ] Remove `test.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN)
- [ ] Run test: `yarn playwright test concurrent-conversations`

**Estimated Effort:** 0.5 hours (after component implementation)

---

## Running Tests

```bash
# Run all agent-be unit tests
yarn nx test agent-be

# Run conversations.service.spec.ts (Tasks 1, 4, 7)
yarn nx test agent-be -- --testPathPattern conversations.service.spec

# Run agent.service.unit.spec.ts (Task 8)
yarn nx test agent-be -- --testPathPattern agent.service.unit.spec

# Run sandbox-lifecycle.integration.spec.ts (Task 10)
yarn nx test agent-be -- --testPathPattern sandbox-lifecycle.integration.spec

# Run web component tests
yarn nx test web

# Run ConversationPane.test.tsx (Task 9)
yarn nx test web -- --testPathPattern ConversationPane.test

# Run E2E tests for concurrent conversations
yarn playwright test concurrent-conversations

# Typecheck
npx tsc --noEmit -p apps/agent-be/tsconfig.app.json
npx tsc --noEmit -p apps/web/tsconfig.app.json

# Lint
yarn nx lint agent-be
yarn nx lint web
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- All tests written as red-phase scaffolds with `it.skip()` (Jest) / `test.skip()` (Playwright)
- Tests assert EXPECTED behavior (not placeholder assertions)
- E2E deferral analysis recorded with browser-level mock verification for each AC
- Regression guard template check recorded (does not apply — no external commands with user-controlled input)
- Decision records for all autonomous decisions
- Implementation checklist created

**Verification:**

- All 35 generated tests are present and marked with `it.skip()` / `test.skip()`
- Tests will fail when un-skipped because Tasks 1-6 are not implemented yet
- Activation guidance: remove `it.skip()` / `test.skip()` for the current task, confirm RED, then implement

---

### GREEN Phase (DEV Team — Next Steps)

**DEV Agent Responsibilities:**

1. **Implement Task 1** (count check in `createConversation`) — un-skip AC-1/AC-2 unit tests, confirm RED, implement, confirm GREEN
2. **Implement Task 3** (concurrent-turn guard in `runTurn`) — un-skip AC-3 unit tests, confirm RED, implement, confirm GREEN
3. **Implement Task 4** (`abandonConversation` + cancellation checks) — un-skip AC-4 unit tests, confirm RED, implement, confirm GREEN
4. **Implement Task 5** (`DELETE /:id` endpoint) — un-skip integration tests, confirm RED, implement, confirm GREEN
5. **Implement Task 2** (limit-reached state in `ConversationPane`) — un-skip component tests, confirm RED, implement, confirm GREEN
6. **Implement Task 6** (`handleRetry` cancel-before-mint-new) — un-skip component tests, confirm RED, implement, confirm GREEN
7. **Un-skip E2E tests** — confirm RED, verify GREEN (after component implementation)
8. **Run full test suite** — `yarn nx test agent-be` + `yarn nx test web` + `yarn playwright test concurrent-conversations`
9. **Lint + typecheck** — `yarn nx lint agent-be` + `yarn nx lint web` + `npx tsc --noEmit`

**Key Principles:**

- One test at a time (don't try to fix all at once)
- Minimal implementation (don't over-engineer)
- Run tests frequently (immediate feedback)

---

### REFACTOR Phase (DEV Team — After All Tests Pass)

1. Verify all 35 tests pass
2. Review code for quality
3. Ensure tests still pass after each refactor
4. No production code changes expected beyond Tasks 1-6

---

## Decision Records

**Decision (DP-5):** E2E deferred for AC-1 (independent sandbox). Per user instruction, verified no browser-level mock can simulate the scenario. The core behavior is backend-internal: the sandbox ID is in-memory state in `ConversationsService.sandboxIds`. A browser mock can return distinct conversation IDs and distinct SSE streams, but cannot prove the backend allocated independent Daytona sandboxes — the mock returns independent data by construction. The SSE 10 concurrent connections (NFR-R4) is a deployment invariant (HTTP/2 reverse proxy), not a code behavior. The structural verification (unit + integration tests with distinct sandbox IDs) is sufficient proof.

**Decision (DP-5):** E2E deferred for AC-3 (concurrent-turn guard). Per user instruction, verified no browser-level mock can simulate the scenario. The core behavior is a backend race condition requiring control over the Claude Agent SDK's async generator timing — keeping the first `runTurn` in-flight while the second arrives. A browser mock can intercept HTTP/SSE but cannot control backend async-generator timing or verify backend Map state (`activeRuns`, `circuitBreakerTimers`). The unit test with the real `AgentService` and a never-resolving generator is the appropriate test level.

**Decision (DP-3):** E2E tests created for AC-2 and AC-4 (not deferred). Per user instruction, a browser-level mock CAN cover these ACs: AC-2 is entirely browser-observable (409 response → UI state), and AC-4's browser-observable part (DELETE-before-POST ordering) is verifiable via fetch call capture. The simplest approach that satisfies the user instruction is to create E2E test scaffolds alongside the component tests. The E2E tests use the same `page.addInitScript` mock pattern as `sandbox-lifecycle.spec.ts`.

**Decision (DP-4):** Test scaffolds use `it.skip()` (Jest) for unit/component/integration tests and `test.skip()` (Playwright) for E2E tests. Story 3.11 is a fullstack story using both Jest and Playwright. Test-only change, decided autonomously.

**Decision (DP-3):** Tests are added to existing spec files (`conversations.service.spec.ts`, `agent.service.unit.spec.ts`, `ConversationPane.test.tsx`, `sandbox-lifecycle.integration.spec.ts`) rather than creating new files. The story specifies these files and they already have the required test infrastructure (mock setup, helpers, module wiring). A new E2E file (`concurrent-conversations.spec.ts`) is created because no existing E2E file covers the limit-reached + retry-cancel scenarios. Simplest reversible option — avoids duplicating setup.

**Decision (DP-4):** The regression guard template for external commands with user-controlled input does not apply to Story 3.11. The story does not modify any code that executes external shell commands with user-controlled input. The `abandonConversation` method calls `sandboxService.destroy(sandboxId)` — `sandboxId` is an internal ID from the `sandboxIds` Map, not user-controlled input, and `destroy` is a Daytona SDK API call, not a shell command. The `shellQuote` pattern applies to `SandboxService` git commands, which are NOT modified in this story. Recorded because the user instruction explicitly requires the check.

**Decision (DP-2):** "Active Conversation" for FR-11 = a Conversation with in-memory `sandboxStatuses` status `'provisioning'` or `'ready'`. Idle-timed-out (`'idle-timeout'`) and failed (`'failed'`) conversations do NOT count. Rationale: architecture.md line 37 says FR-11 "directly determines the sandbox count ceiling per user" — the semantic intent is to limit concurrent live/provisioning sandboxes, not total conversation rows. An idle-timed-out conversation has no live sandbox (torn down by Story 3.9) and should not block the user from creating new ones. (Mirrors the story's own Decision Record.)

---

## Knowledge Base References Applied

This ATDD workflow consulted the following knowledge fragments and project patterns:

- **test-quality.md** — Given-When-Then structure, one assertion per test, exact-match over shape-match assertions
- **test-levels-framework.md** — Test level selection (Unit for count check + concurrent-turn guard, Integration for end-to-end sandbox lifecycle, Component for UI state, E2E for browser-observable ACs)
- **test-priorities-matrix.md** — P0 for all AC-covering tests
- **test-healing-patterns.md** — `it.skip()` / `test.skip()` red-phase scaffolds with activation guidance
- **network-first.md** — `page.addInitScript` before `page.goto` for E2E mock installation (prevents race conditions)
- **selector-resilience.md** — `getByRole` > `getByText` > `getByLabel` hierarchy for E2E selectors
- **Project context** — env-configured numeric thresholds IIFE pattern, `findFirst` for tenant-scoped lookup, `select` projection, error envelope `{ code, message, meta }`, `try/catch` around JSON.parse in fetch error handlers, `SandboxServiceFake` test seam, `buildTestModule()` pattern, `jest.spyOn` + `mock.invocationCallOrder` for ordering assertions

---

## Test Execution Evidence

### Initial Scaffold Review / RED Verification

**Command (unit + integration):** `yarn nx test agent-be -- --testPathPattern "conversations.service.spec|agent.service.unit.spec|sandbox-lifecycle.integration.spec"`

**Command (component):** `yarn nx test web -- --testPathPattern "ConversationPane.test"`

**Command (E2E):** `yarn playwright test concurrent-conversations`

**Expected Results:**

- Total tests: 35 new (all `it.skip()` / `test.skip()`)
- Skipped: 35 (expected before activation)
- Passing: 0 (expected — implementation not done yet)
- Status: Red-phase scaffolds verified

**Expected Skip Behavior:**
- All 35 tests are marked `it.skip()` / `test.skip()` — Jest/Playwright reports them as skipped
- When a developer removes `it.skip()` / `test.skip()` for a task, the test should fail because Tasks 1-6 are not implemented yet
- After implementing Tasks 1-6, tests pass (the story is a feature story, not a verification story)

---

## Notes

- Story 3.11 is a **feature story** — the production code (`countActiveConversations`, `abandonConversation`, concurrent-turn guard, limit-reached state, retry-cancel) is NOT yet implemented. The ATDD scaffolds verify the EXPECTED behavior.
- The `mockPrisma` extension (adding `findMany` and `delete` to the `conversation` mock) is needed for the count-check and abandon tests. These are added to the `beforeEach` block so all tests in the file have access.
- The E2E tests for AC-2 and AC-4 use the same `page.addInitScript` mock pattern as `sandbox-lifecycle.spec.ts`, adapted for 409 responses and DELETE call capture.
- The `yieldThenHang` async generator in `agent.service.unit.spec.ts` yields messages then awaits a never-resolving promise — this simulates an in-flight run that doesn't complete, enabling the concurrent-turn guard test.
- The `withRepoConnection` fixture is used in E2E tests to seed the test user + repo connection, preventing the `/onboarding` redirect. Note: the Playwright auth-setup infrastructure was broken per Story 3.9's deferred finding — E2E tests may need the auth setup fixed before they can run. The scaffolds are created regardless so they're ready when the infrastructure is fixed.

---

## Next Steps

1. **Link this checklist** into the story file `Dev Notes` / `ATDD Artifacts` section
2. **Implement Task 1** (count check) — un-skip AC-1/AC-2 unit tests first
3. **Implement Task 3** (concurrent-turn guard) — un-skip AC-3 unit tests first
4. **Implement Task 4** (`abandonConversation` + cancellation) — un-skip AC-4 unit tests first
5. **Implement Task 5** (`DELETE /:id` endpoint) — un-skip integration tests
6. **Implement Task 2** (limit-reached state) — un-skip component + E2E tests
7. **Implement Task 6** (`handleRetry` cancel) — un-skip component + E2E tests
8. **Run full test suite** — `yarn nx test agent-be` + `yarn nx test web` + `yarn playwright test concurrent-conversations`
9. **Lint + typecheck** — `yarn nx lint agent-be` + `yarn nx lint web` + `npx tsc --noEmit`
10. **When all tests pass**, refactor if needed, then update story status to 'done'

---

**Generated by BMad TEA Agent** - 2026-07-06
