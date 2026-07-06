---
stories: ['3.4', '3.5', '3.6', '3.7']
title: 'Test Quality Review — Stories 3.4–3.7'
date: '2026-07-06'
mode: 'Test Quality Review'
agent: 'Reviewer'
focus: 'Determinism, isolation, assertion quality, structure, focus, speed, missing scenarios'
---

# Test Quality Review — Stories 3.4, 3.5, 3.6, 3.7

## Review Scope

Adversarial test-quality review of 14 test files across Stories 3.4–3.7. Each file was read in full and checked against six criteria: deterministic execution, isolation, assertion quality, test structure, test focus, and speed/size. Missing test scenarios were identified per file.

**Test framework:** Jest 30 (co-located `*.spec.ts` / `*.test.tsx`, `@jest-environment node` / `jsdom`) + Playwright 1.61 (E2E). `@testing-library/react` v16.3.2 (auto-cleanup enabled by default).

### Files in Scope

| # | File | Story | Lines | Tests |
|---|------|-------|-------|-------|
| 1 | `playwright/e2e/conversation/tool-pills.spec.ts` | 3.4 | 582 | 15 |
| 2 | `apps/web/src/components/conversation/ToolPill.test.tsx` | 3.4 | 141 | 9 |
| 3 | `apps/web/src/components/conversation/SemanticPill.test.tsx` | 3.4 | 104 | 9 |
| 4 | `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` | 3.4/3.7 | 533 | 22 |
| 5 | `apps/agent-be/src/streaming/agent.service.unit.spec.ts` | 3.4/3.7/3.8/3.11 | 1059 | 22 |
| 6 | `playwright/e2e/conversation/resume-conversation.spec.ts` | 3.5 | 352 | 13 |
| 7 | `playwright/e2e/project-map/cross-tab-conversation-focus.spec.ts` | 3.5 | 263 | 3 |
| 8 | `apps/web/src/hooks/use-conversation-presence.test.ts` | 3.5 | 200 | 7 |
| 9 | `playwright/e2e/conversation/working-tree-save.spec.ts` | 3.6 | 497 | 14 |
| 10 | `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx` | 3.6 | 174 | 13 |
| 11 | `apps/agent-be/src/conversations/manual-commit.service.spec.ts` | 3.6/3.12 | 299 | 13 |
| 12 | `playwright/e2e/conversation/credential-failure-alerts.spec.ts` | 3.7 | 573 | 15 |
| 13 | `apps/web/src/components/conversation/AccessNotice.test.tsx` | 3.7 | 112 | 10 |
| 14 | `apps/agent-be/src/credentials/credentials.service.spec.ts` | 3.7 | 75 | 4 |
| | **Total** | | **5164** | **161** |

---

## Story 3.4: See Tool Calls and Recognized Actions Inline

### File 1: `playwright/e2e/conversation/tool-pills.spec.ts`

**Quality Score: WARNING**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | WARNING | File exceeds 300-line threshold (582 lines). Should be split by AC group (AC-1 tool pill lifecycle, AC-2 semantic pill, AC-3/AC-4 error states, AC-5 system messages). | Full file length |
| 2 | WARNING | Duplicated `MockEventSource` class + `setupStreamingMocks` function. The same ~130-line mock infrastructure is copy-pasted across 8+ E2E files (tool-pills, resume-conversation, cross-tab-conversation-focus, working-tree-save, credential-failure-alerts, streaming-chat, sandbox-lifecycle, mid-session-timeout, slash-command-picker, concurrent-conversations). Any change to the mock pattern requires updating all files. | Lines 47–169; grep confirms 100+ matches across `playwright/` |
| 3 | WARNING | Serial mode (`test.describe.configure({ mode: 'serial' })`) makes tests order-dependent. If an early test fails, subsequent tests are skipped, masking failures. Each test sets up fresh mocks and navigates to a new page, so serial mode is not required for state sharing — it appears to be a copy-paste default. | Line 184 |
| 4 | INFO | No `beforeEach`/`afterEach` cleanup at the Playwright level, but each test calls `setupStreamingMocks(page)` + `page.goto()` which provides a fresh page context. Playwright's default `page` fixture creates a new page per test. Acceptable. | — |

**Missing test scenarios:**
- TOOL_CALL_START emitted without a corresponding TOOL_CALL_END (orphaned running pill — does it stay "Running…" forever?)
- TOOL_CALL_START with a duplicate `toolCallId` (replacement vs. accumulation behavior)
- TOOL_CALL_RESULT arriving before TOOL_CALL_END (out-of-order events)
- Rapid sequential TOOL_CALL_START/END pairs (stress test state machine transitions)

**Recommendations:**
1. Extract `MockEventSource` + `setupStreamingMocks` into `playwright/support/streaming-mock.ts` and import from all E2E files. This is the single highest-impact refactor across the entire E2E suite.
2. Split the file into `tool-pills-lifecycle.spec.ts` (AC-1), `tool-pills-semantic.spec.ts` (AC-2), `tool-pills-errors.spec.ts` (AC-3/AC-4), `tool-pills-system-messages.spec.ts` (AC-5).
3. Remove `test.describe.configure({ mode: 'serial' })` — tests are independent and will run faster in parallel.

---

### File 2: `apps/web/src/components/conversation/ToolPill.test.tsx`

**Quality Score: WARNING**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | WARNING | Dead import: `userEvent` is imported on line 14 but never used. All interactions use `fireEvent` instead. | Line 14: `import userEvent from '@testing-library/user-event';` — zero usages in file |
| 2 | WARNING | Test name promises an assertion that is never made. Test at line 39 is named "renders checkmark and tool name without 'completed' label" but only asserts `getByText(/Bash/)` is present and `queryByText(/completed/i)` is absent. The checkmark (`✓` rendered at ToolPill.tsx line 63–67) is never verified. The test passes whether or not the checkmark renders. | Line 39–43; ToolPill.tsx lines 63–67 render `<span aria-hidden="true">✓</span>` |
| 3 | INFO | CSS class assertions (`.animate-spin`, `.negative`, `pre.font-mono`) are fragile — they break if class names change even when behavior is correct. Acceptable for component unit tests but prefer role/semantic queries where possible. | Lines 34, 59, 94 |
| 4 | INFO | Uses `fireEvent` for keyboard tests (lines 129, 137) instead of `userEvent.type`/`userEvent.keyboard`. `fireEvent.keyDown` dispatches a synthetic event without the full keyboard event sequence. For simple toggle behavior this is acceptable. | Lines 129, 137 |

**Missing test scenarios:**
- Tool pill with empty `toolName` (does the label render correctly?)
- Very long tool names (truncation or overflow behavior)
- Tool pill in completed state with empty `input` and `output` (does expand show empty content?)

**Recommendations:**
1. Remove the unused `userEvent` import.
2. Add `expect(screen.getByText('✓')).toBeInTheDocument()` to the test at line 39, or rename the test to "renders tool name without 'completed' label" if the checkmark is not the focus.

---

### File 3: `apps/web/src/components/conversation/SemanticPill.test.tsx`

**Quality Score: PASS**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | INFO | CSS class assertions for styling (`positive`, `underline`) are fragile but acceptable for verifying visual treatment. | Lines 51–52 |
| 2 | INFO | Module-level `jest.mock('next/link', ...)` persists across all tests. This is correct for a static module mock — no cleanup needed. | Lines 16–21 |

**Missing test scenarios:**
- Invalid/unknown `artifactType` (e.g., `"unknown"`) — does the component render gracefully or crash?
- Very long `artifactTitle` (truncation behavior)
- `viewHref` with special characters or query parameters

**Recommendations:**
1. No changes required. The file is well-structured, focused, and covers both the Story 3.4 (full props) and Story 3.6 (empty props) variants with good accessibility assertions.

---

### File 4: `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts`

**Quality Score: WARNING**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | WARNING | File exceeds 300-line threshold (533 lines). Should be split by story: Story 3.4 classifier tests (AC-2/AC-3) and Story 3.7 credential/access tests (AC-1/AC-2). | Full file length |
| 2 | WARNING | Time-dependent performance tests use `Date.now()` and assert `< 100ms` for processing 100KB output. This threshold is tight and can flake on loaded CI runners, producing false failures. The tests are labeled as NFR performance guards, but wall-clock assertions are inherently non-deterministic. | Lines 502–531: `const start = Date.now(); ... expect(elapsed).toBeLessThan(100);` |
| 3 | WARNING | `afterEach` calls `jest.clearAllMocks()` but NOT `jest.restoreAllMocks()`. The `jest.spyOn(service['logger'], 'warn')` at line 189 creates a spy that is not restored. This is mitigated by the fact that `service` is recreated in `beforeEach`, so the spy is on a discarded instance — but it violates best practice and will leak if the service ever becomes a singleton. | Lines 37–39, 189 |
| 4 | INFO | Accesses private member `service['logger']` via bracket notation. Fragile to refactoring if the logger property is renamed. | Line 189 |
| 5 | INFO | Test at line 482 ("classifier throws when markCredentialFailed throws despite its try/catch") has a misleading name — it implies the production code has a try/catch that should prevent throws, but the test expects the method to throw. The test description should clarify whether this is testing a bug or intended behavior. | Lines 481–497 |

**Missing test scenarios:**
- `classifyToolResult` with empty string output
- `classifyToolResult` with null/undefined output (does it throw or return null?)
- Concurrent `classifyToolResult` calls with the same `toolCallId` (thread safety)
- Git commit output with multiple `_bmad-output/` files (does it pick the first? all?)

**Recommendations:**
1. Replace `Date.now()` performance assertions with iteration-count assertions (e.g., "processes 100KB in a single regex pass" verified by mock call count) or increase the threshold to 500ms+ to eliminate CI flakiness.
2. Add `jest.restoreAllMocks()` to `afterEach`.
3. Split the file into `tool-pill-classifier.service.spec.ts` (Story 3.4) and `tool-pill-classifier.credentials.spec.ts` (Story 3.7).

---

### File 5: `apps/agent-be/src/streaming/agent.service.unit.spec.ts`

**Quality Score: WARNING**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | WARNING | File exceeds 300-line threshold (1059 lines — 3.5× the limit). This is the largest file in the review. Should be split by story: Story 3.4 (tool call lifecycle + circuit breaker), Story 3.7 (credential/access emission), Story 3.8 (cost recording), Story 3.11 (concurrent-turn guard). | Full file length |
| 2 | WARNING | Weak assertion at line 1056: `expect(agentService['circuitBreakerTimers'].size).toBeLessThanOrEqual(1)`. The test is named "startCircuitBreakerTimer clears a pre-existing timer before setting a new one" — it should assert exactly `1` timer exists (cleared old, set new). Using `<= 1` allows the case where the timer was cleared but never re-set (size=0), which would mean the circuit breaker is broken. The test passes even if the behavior it claims to verify doesn't work. | Line 1056 |
| 3 | WARNING | Accesses private members via bracket notation: `agentService['logger']` (lines 587, 766, 874), `agentService['circuitBreakerTimers']` (lines 1031, 1056). Fragile to refactoring — if these properties are renamed, all tests break. | Lines 587, 766, 874, 1031, 1056 |
| 4 | INFO | Uses `new Promise<never>(jest.fn())` and `new Promise(() => undefined)` to create never-resolving promises for stalling async generators. Combined with fake timers, this is a valid pattern for testing circuit breaker timeout behavior. | Lines 321, 397, 422, 953 |
| 5 | INFO | Good isolation: `jest.isolateModules()` + per-test `jest.doMock` ensures fresh module loading. `afterEach` correctly calls `jest.useRealTimers()`, `jest.clearAllMocks()`, and `jest.restoreAllMocks()`. | Lines 68–75, 79–91 |
| 6 | INFO | Redundant `loggerErrorSpy.mockRestore()` at line 889 — `afterEach` already calls `jest.restoreAllMocks()`. Not harmful, just unnecessary. | Line 889 |

**Missing test scenarios:**
- Multiple tool calls in a single turn with mixed success/failure results
- TOOL_CALL_RESULT arriving without a preceding TOOL_CALL_START (orphaned result)
- Circuit breaker firing during TOOL_CALL_ARGS streaming (mid-tool-call timeout)

**Recommendations:**
1. Change line 1056 from `toBeLessThanOrEqual(1)` to `toBe(1)` — the test should verify exactly one timer exists after clearing and re-setting.
2. Split the file into 4 files by story. Each story's tests are already grouped in `describe` blocks, making the split straightforward.
3. Consider exposing `circuitBreakerTimers` size via a public method (e.g., `getTimerCount()`) to avoid private member access in tests.

---

## Story 3.5: Resume an Existing Conversation

### File 6: `playwright/e2e/conversation/resume-conversation.spec.ts`

**Quality Score: WARNING**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | WARNING | File exceeds 300-line threshold (352 lines). | Full file length |
| 2 | WARNING | Duplicated `MockEventSource` + `setupResumeMocks` pattern (same as File 1, issue #2). | Lines 45–139 |
| 3 | WARNING | Serial mode (`test.describe.configure({ mode: 'serial' })`). Tests are independent — each navigates to a fresh page with fresh mocks. Serial mode is unnecessary and prevents parallelization. | Line 142 |
| 4 | INFO | Good use of `page.clock.install()` + `page.clock.fastForward(35_000)` for time-dependent timeout tests. This is the correct Playwright approach for deterministic time manipulation. | Lines 279, 286, 297, 302 |
| 5 | INFO | Good pattern for asserting new fetch calls: `callsBefore = (await mocks.fetchCalls()).length` then `waitForFetchCount(callsBefore + 1)`. Avoids hardcoding fetch call indices. | Lines 305–309 |

**Missing test scenarios:**
- Resume when conversation has 0 turns (empty history — does the page render correctly?)
- Resume with very long history (50+ turns — performance/virtualization)
- Resume when the conversation ID doesn't exist in Postgres (404 handling)
- Resume when SESSION_READY arrives before the resume POST completes (race condition)

**Recommendations:**
1. Remove serial mode.
2. Extract mock infrastructure to shared support file (see File 1 recommendation #1).
3. Split into `resume-history.spec.ts` (AC-1) and `resume-reconnecting.spec.ts` (AC-2).

---

### File 7: `playwright/e2e/project-map/cross-tab-conversation-focus.spec.ts`

**Quality Score: WARNING**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | WARNING | Test count discrepancy: the task description states "4 tests" but the file contains only 3 `test()` calls. Either a test was removed without updating the task description, or a test is missing. | Lines 157, 206, 224 — only 3 test blocks |
| 2 | WARNING | Duplicated `MockEventSource` + `setupResumeMocks` pattern (same as File 1, issue #2). | Lines 41–145 |
| 3 | WARNING | Serial mode. Tests are independent — each creates fresh pages and mocks. | Line 155 |
| 4 | INFO | Good cross-tab testing with `context.newPage()` and BroadcastChannel API. The `__focusCalled` spy pattern correctly verifies `window.focus()` was called without relying on actual OS-level window focus. | Lines 105–113, 195–203 |
| 5 | INFO | Good test for the "no open conversation" case (navigates to Artifact Browser) and the "completed artifact always navigates" case. | Lines 206, 224 |

**Missing test scenarios:**
- Closing the conversation tab, then clicking an in-progress artifact (should now navigate to Artifact Browser since no tab is open)
- Multiple open conversation tabs — which one gets focused? (BroadcastChannel `conversation-opened` with different IDs)
- Stale BroadcastChannel state from a previous test (does the project map page correctly track open/close?)

**Recommendations:**
1. Clarify the test count discrepancy — was a 4th test planned but not implemented?
2. Remove serial mode.
3. Extract mock infrastructure to shared support file.

---

### File 8: `apps/web/src/hooks/use-conversation-presence.test.ts`

**Quality Score: PASS**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | INFO | Good isolation: `beforeEach` resets `MockBroadcastChannel.instances` and restores `global.BroadcastChannel`. `afterEach` calls `jest.restoreAllMocks()` and restores the original `BroadcastChannel`. | Lines 72–81 |
| 2 | INFO | `MockBroadcastChannel` implementation correctly simulates cross-tab communication by dispatching `MessageEvent`s to all instances with the same channel name. | Lines 24–67 |
| 3 | INFO | Good ordering assertion: `expect(result.current).toEqual(['conv-2', 'conv-1'])` — verifies newest-first ordering, not just presence. | Line 175 |

**Missing test scenarios:**
- `conversation-closed` message handling in `useOpenConversations` — when a `conversation-closed` message arrives, the conversation ID should be removed from the open list. No test verifies this removal behavior.
- `BroadcastChannel.close()` being called on unmount of `useConversationPresence` (resource cleanup verification)
- Multiple `conversation-opened` messages from different tabs for the same conversation ID (deduplication in `useOpenConversations` is tested, but the cross-tab scenario is not)

**Recommendations:**
1. Add a test for `conversation-closed` message handling in `useOpenConversations` — this is a functional gap where the hook's removal behavior is untested.

---

## Story 3.6: Track and Manually Save Working Tree State

### File 9: `playwright/e2e/conversation/working-tree-save.spec.ts`

**Quality Score: WARNING**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | WARNING | File exceeds 300-line threshold (497 lines). | Full file length |
| 2 | WARNING | Duplicated `MockEventSource` + `setupStreamingMocks` pattern (same as File 1, issue #2). | Lines 56–191 |
| 3 | WARNING | Serial mode. Tests are independent. | Line 206 |
| 4 | WARNING | Fragile fetch count assertion: comment says "The save fetch is the 3rd call (after create-conversation + skills)" and waits for `waitForFetchCount(3)`. This breaks if the app adds any new initial fetch call (e.g., analytics, feature flags). The test at line 305 uses a more robust pattern (`callsBefore + 1`) — that pattern should be used consistently. | Lines 287, 361, 400 |
| 5 | INFO | Good `setSaveResponse` pattern allows per-test save response configuration without re-installing mocks. | Lines 186–189 |
| 6 | INFO | Good AC coverage — all 7 ACs are tested. | — |

**Missing test scenarios:**
- Duplicate save prevention: clicking Save twice rapidly (AC-6 mentions "duplicate submission prevention" but no E2E test verifies this behavior)
- Working tree changes between dirty detection and save click (does the save commit the new files or the original dirty files?)
- MANUAL_SAVE_SUCCEEDED with `artifactType`/`artifactTitle` (does the Semantic Pill show View link in manual save context?)

**Recommendations:**
1. Replace hardcoded `waitForFetchCount(3)` with the `callsBefore + 1` pattern used at line 305.
2. Remove serial mode.
3. Add a test for duplicate save prevention (click Save twice rapidly, verify only one POST /save call).

---

### File 10: `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx`

**Quality Score: WARNING**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | WARNING | Mega-test at line 122: "focus is trapped in save popover and returned to trigger on close" tests three distinct behaviors in one test: (a) Tab wraps from Cancel to Save, (b) Shift+Tab wraps from Save to Cancel, (c) Escape closes and returns focus. If (a) fails, (b) and (c) never execute. Should be 3 separate tests. | Lines 122–146 |
| 2 | WARNING | Mega-test at line 148: "info tooltip dismissible by outside click and Escape" tests two dismissal methods in one test: (a) outside click, (b) Escape. Should be 2 separate tests. | Lines 148–173 |
| 3 | WARNING | Redundant tests: line 105 ("Save button is disabled when state is 'saving'") and line 111 ("saving state renders 'Saving…' text") both assert `getByText(/Saving…/)` with minimal additional value. The first test also asserts no Save button; the second only asserts the text. They should be merged or the second removed. | Lines 105–114 |
| 4 | INFO | `onSave` is defined at module level (`const onSave = jest.fn()`) and shared across all tests. `beforeEach` clears it. This is acceptable since `mockClear()` resets call history, but defining it inside `beforeEach` would be cleaner. | Lines 15, 18 |
| 5 | INFO | Good accessibility testing: `aria-live="polite"`, `tabindex="0"`, focus trap, Escape dismissal. | Lines 56–62, 97–101, 122–146 |

**Missing test scenarios:**
- Clicking the indicator in "clean" state (should it be non-interactive? No popover should open)
- Clicking the indicator in "saving" state (should it be non-interactive? No double-save)
- Clicking the indicator in "saving-after-response" state (should it be non-interactive?)

**Recommendations:**
1. Split the focus trap mega-test into 3 tests: "Tab wraps from last to first element", "Shift+Tab wraps from first to last element", "Escape closes popover and returns focus to trigger".
2. Split the tooltip dismissal mega-test into 2 tests: "outside click dismisses tooltip", "Escape dismisses tooltip".
3. Remove the redundant test at line 111 or merge its unique assertion into line 105.

---

### File 11: `apps/agent-be/src/conversations/manual-commit.service.spec.ts`

**Quality Score: WARNING**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | WARNING | `afterEach` calls `jest.clearAllMocks()` but NOT `jest.restoreAllMocks()`. Multiple `jest.spyOn(sandboxFake, ...)` calls are not restored. Mitigated by `sandboxFake` being recreated in `beforeEach`, but violates best practice. | Lines 93–96; spies at lines 100, 118, 143, 168, 196, 209, 247, 251, 263, 281 |
| 2 | WARNING | Weak assertion at line 230: `expect(drainFailedEvents.some((d) => d.error && typeof d.error === 'string')).toBe(true)`. Only verifies that at least one event has a string `error` property — doesn't check the error content or that all expected events have errors. | Line 230–231 |
| 3 | WARNING | Accesses private member `service['executingCommits']` via bracket notation. Fragile to refactoring. | Line 282 |
| 4 | INFO | Good use of fake timers for timeout tests (`jest.advanceTimersByTimeAsync(5001)` for 5s budget). | Lines 246, 262, 271 |
| 5 | INFO | Good AC coverage including Story 3.12 drain tests (onModuleDestroy). | Lines 220–298 |

**Missing test scenarios:**
- Concurrent `requestCommit` calls from different conversations (does the second conversation's commit work independently?)
- `flushPendingCommit` when agent is still active (should it no-op or queue again?)
- `requestCommit` when `getWorkingTreeStatus` throws (error handling — does it emit MANUAL_SAVE_FAILED?)

**Recommendations:**
1. Add `jest.restoreAllMocks()` to `afterEach`.
2. Strengthen the assertion at line 230 to check specific error content, e.g., `expect(drainFailedEvents[0].error).toContain('drain')` or similar.
3. Consider exposing `executingCommits` via a public method for test access.

---

## Story 3.7: Receive Real-Time Credential Failure Alerts

### File 12: `playwright/e2e/conversation/credential-failure-alerts.spec.ts`

**Quality Score: WARNING**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | WARNING | File exceeds 300-line threshold (573 lines). | Full file length |
| 2 | WARNING | Duplicated `MockEventSource` + `setupStreamingMocks` pattern (same as File 1, issue #2). | Lines 62–184 |
| 3 | WARNING | Test at line 253 asserts `reauthLink` has `href="#"` — a placeholder href. The test acknowledges in a comment (lines 268–271) that clicking the link opens a Radix UI Dialog, but the dialog opening is not verified in E2E. The test only verifies the link is present and has `href="#"`, which provides minimal signal. | Lines 272–274 |
| 4 | INFO | Good — serial mode was explicitly removed for parallelization. Comment explains the decision. | Lines 199–201 |
| 5 | INFO | Good use of `TEST_WORKER_INDEX` for parallel-safe conversation IDs. | Line 41 |
| 6 | INFO | Good AC coverage: CREDENTIAL_FAILURE banner, ACCESS_DENIED notice per code, dismiss, retry hint, no-halt verification. | — |

**Missing test scenarios:**
- Clicking "Update access token" — the re-auth dialog flow is not tested in E2E (only verified in unit tests per the comment)
- Multiple CREDENTIAL_FAILURE events in the same conversation (does the banner show once or duplicate?)
- CREDENTIAL_FAILURE followed by ACCESS_DENIED (or vice versa) — mixed event sequence
- ACCESS_DENIED with an unknown/invalid `code` value (fallback behavior)

**Recommendations:**
1. Add a test that clicks "Update access token" and verifies the re-auth dialog opens (even if the full re-auth flow requires GitHub OAuth and can't be completed in E2E, the dialog opening can be verified).
2. Split the file into `credential-failure-banner.spec.ts` (AC-3) and `access-denied-notice.spec.ts` (AC-4).
3. Extract mock infrastructure to shared support file.

---

### File 13: `apps/web/src/components/conversation/AccessNotice.test.tsx`

**Quality Score: PASS**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | INFO | No `beforeEach`/`afterEach` with `jest.clearAllMocks()`, but no mocks are used — the component is rendered directly with props. `@testing-library/react` v16 auto-cleanup handles DOM cleanup. Acceptable. | — |
| 2 | INFO | CSS class assertions for color tokens (`caution-bg`, `negative-bg`, `focus:ring-2`, etc.) are fragile but acceptable for verifying visual treatment per code. | Lines 73–74, 81–82, 89–90, 106–109 |
| 3 | INFO | Good focused tests: one test = one behavior (copy per code, retry hint presence/absence, dismiss, color tokens, accessibility). | — |

**Missing test scenarios:**
- Unknown/invalid `code` value (e.g., `code: 'UNKNOWN'`) — does the component render a fallback or crash?
- `retryAfter` with non-RATE_LIMITED codes (e.g., `code: 'ORG_RESTRICTION', retryAfter: 60`) — should the retry hint be suppressed?
- `retryAfter: 0` — does it render "retry in ~0s" or suppress the hint?

**Recommendations:**
1. Add a test for unknown/invalid code to verify graceful degradation.
2. Add a test verifying `retryAfter` is only rendered for `RATE_LIMITED` code.

---

### File 14: `apps/agent-be/src/credentials/credentials.service.spec.ts`

**Quality Score: PASS**

**Issues found:**

| # | Severity | Issue | Evidence |
|---|----------|-------|----------|
| 1 | INFO | `afterEach` calls `jest.clearAllMocks()` but NOT `jest.restoreAllMocks()`. The `jest.spyOn(service['logger'], 'error')` at line 61 is not restored. Mitigated by `service` being recreated in `beforeEach`. | Lines 35–37, 61 |
| 2 | INFO | Accesses private member `service['logger']` via bracket notation. | Line 61 |
| 3 | INFO | Good focused tests: optimistic-concurrency guard, error swallowing, no-op on 0 rows. All 4 tests verify one behavior each. | — |

**Missing test scenarios:**
- `capturedAt` in the future (edge case for optimistic concurrency — should the update be skipped?)
- Concurrent `markCredentialFailed` calls with different `capturedAt` values (race condition)
- `markCredentialFailed` with null/undefined userId (input validation)

**Recommendations:**
1. Add `jest.restoreAllMocks()` to `afterEach` for best-practice compliance.
2. Add a test for `capturedAt` in the future to verify the optimistic-concurrency guard edge case.

---

## Overall Summary

### Total files reviewed: 14

### Total issues by severity

| Severity | Count |
|----------|-------|
| BLOCKER | 0 |
| WARNING | 28 |
| INFO | 25 |
| **Total** | **53** |

### Issue breakdown by category

| Category | WARNING | INFO |
|----------|---------|------|
| File exceeds 300-line threshold | 6 | 0 |
| Duplicated mock infrastructure across E2E files | 6 | 0 |
| Serial mode used unnecessarily | 5 | 0 |
| Missing `jest.restoreAllMocks()` in afterEach | 3 | 0 |
| Weak/missing assertions | 4 | 0 |
| Mega-tests (multiple behaviors per test) | 2 | 0 |
| Private member access via bracket notation | 0 | 4 |
| CSS class assertions (fragile) | 0 | 6 |
| Dead import | 1 | 0 |
| Test count discrepancy | 1 | 0 |
| Fragile fetch count assertion | 1 | 0 |
| Redundant tests | 1 | 0 |
| Other (good patterns noted) | 0 | 15 |

### Quality scores by file

| File | Score |
|------|-------|
| `tool-pills.spec.ts` | WARNING |
| `ToolPill.test.tsx` | WARNING |
| `SemanticPill.test.tsx` | PASS |
| `tool-pill-classifier.service.spec.ts` | WARNING |
| `agent.service.unit.spec.ts` | WARNING |
| `resume-conversation.spec.ts` | WARNING |
| `cross-tab-conversation-focus.spec.ts` | WARNING |
| `use-conversation-presence.test.ts` | PASS |
| `working-tree-save.spec.ts` | WARNING |
| `WorkingTreeIndicator.test.tsx` | WARNING |
| `manual-commit.service.spec.ts` | WARNING |
| `credential-failure-alerts.spec.ts` | WARNING |
| `AccessNotice.test.tsx` | PASS |
| `credentials.service.spec.ts` | PASS |

**PASS: 4 files | WARNING: 10 files | BLOCKER: 0 files**

### Top 3 priorities for improvement

**1. Extract duplicated E2E mock infrastructure to a shared support file (highest impact)**

The `MockEventSource` class and `setupStreamingMocks`/`setupResumeMocks` function are copy-pasted across 8+ E2E test files (100+ matches in grep). This is ~130 lines of identical code duplicated in each file. Any change to the mock pattern (e.g., adding a new fetch route, fixing a bug in `MockEventSource`) requires updating all files. Extract to `playwright/support/streaming-mock.ts` and import from all E2E files. This single refactor would reduce total E2E test code by ~1000+ lines and eliminate the largest source of maintenance burden.

**2. Split files exceeding 300 lines (6 files affected)**

Six files exceed the 300-line threshold: `agent.service.unit.spec.ts` (1059 lines), `tool-pills.spec.ts` (582), `credential-failure-alerts.spec.ts` (573), `tool-pill-classifier.service.spec.ts` (533), `working-tree-save.spec.ts` (497), `resume-conversation.spec.ts` (352). Each file's tests are already grouped by AC/story in `describe` blocks, making the split straightforward. The `agent.service.unit.spec.ts` file is the most urgent — at 1059 lines (3.5× the limit), it covers 4 stories and should be split into 4 files.

**3. Fix weak assertions that provide false confidence (3 critical instances)**

Three tests have assertions that pass regardless of whether the behavior they claim to test actually works:
- `agent.service.unit.spec.ts` line 1056: `toBeLessThanOrEqual(1)` should be `toBe(1)` — allows the case where the circuit breaker timer is never set.
- `ToolPill.test.tsx` line 39: test named "renders checkmark" never asserts the checkmark (`✓`) is rendered.
- `tool-pill-classifier.service.spec.ts` lines 502–531: `Date.now()`-based performance assertions with `< 100ms` threshold are non-deterministic and will flake on loaded CI runners.

These are the highest-priority fixes because they undermine test trust — a passing test that doesn't actually verify the behavior is worse than no test at all.
