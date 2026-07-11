# Automate Validation Report — Story 3.4

**Date:** 2026-07-04
**Story:** 3.4 — See Tool Calls and Recognized Actions Inline
**Mode:** Validate → Create (coverage expansion via implementation)
**Decision Policy:** `_bmad-output/decision-policy.md` (v1)

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| Skipped tests | 25 (`it.skip()`) | 0 |
| Failing tests | 25 (stubs throw "not implemented") | 0 |
| Total tests (agent-be) | 80 | 80 (all pass) |
| Total tests (web) | 571 | 571 (all pass) |
| Lint errors | 0 | 0 |
| Typecheck | clean | clean |

**Result: PASS — zero skipped tests, all tests pass.**

---

## Skipped Test Inventory

### 1. `agent.service.unit.spec.ts` — 11 skipped tests

| # | Test | Priority | AC | Resolution |
|---|------|----------|----|------------|
| 1 | emits TOOL_CALL_START with toolCallName (not toolName) | P0 | AC-1 | Fixed implementation: `AgentService.processStreamEvent` now emits `toolCallName` |
| 2 | emits TOOL_CALL_ARGS on input_json_delta | P0 | AC-1 | Fixed implementation: added `TOOL_CALL_ARGS` emission on `input_json_delta` |
| 3 | emits TOOL_CALL_END (not TEXT_MESSAGE_END) on content_block_stop for tool_use | P0 | AC-1 | Fixed implementation: `content_block_stop` now checks block type |
| 4 | emits TOOL_CALL_RESULT on tool result message | P0 | AC-1 | Fixed implementation: `processAssistantMessage` handles `tool_result` |
| 5 | calls classifier on TOOL_CALL_RESULT | P0 | AC-2 | Fixed implementation: classifier called after `TOOL_CALL_RESULT` |
| 6 | emits TOOL_CALL_PROMOTED when classifier returns event | P0 | AC-2 | Fixed implementation: emits `TOOL_CALL_PROMOTED` when classifier returns event |
| 7 | fires after 120s timeout with no events | P0 | AC-5 | Fixed implementation: circuit breaker timer with `Promise.race` abort |
| 8 | resets on each emitted event | P0 | AC-5 | Fixed implementation: `resetCircuitBreakerTimer` on each event |
| 9 | calls terminateProcess when circuit breaker fires | P0 | AC-5 | Fixed implementation: `handleCircuitBreaker` calls `terminateProcess` |
| 10 | timer cleared on stop() | P1 | AC-5 | Fixed implementation: `stop()` calls `clearCircuitBreakerTimer` |
| 11 | timer cleared on normal completion | P1 | AC-5 | Fixed implementation: `finally` block calls `clearCircuitBreakerTimer` |

**Test infrastructure fix (DP-4):** `createAgentService()` changed to use `jest.isolateModules` — the original `jest.doMock` with static imports doesn't override already-cached modules.

### 2. `streaming.controller.spec.ts` — 5 skipped tests

| # | Test | Priority | AC | Resolution |
|---|------|----------|----|------------|
| 1 | writes heartbeat comment on 15s interval | P0 | AC-5 | Fixed implementation: `setInterval` writes `: heartbeat\n\n` every 15s |
| 2 | clears heartbeat on connection close | P0 | AC-5 | Fixed implementation: `cleanupHeartbeat` in `req.on('close')` |
| 3 | clears heartbeat on stream complete | P0 | AC-5 | Fixed implementation + test fix: `cleanupHeartbeat` in `complete` callback; test fixed to call `sessionEvents.complete()` |
| 4 | clears heartbeat on stream error | P1 | AC-5 | Fixed implementation + test fix: `cleanupHeartbeat` in `error` callback; test fixed to trigger `subject.error()` |
| 5 | heartbeat write failure does not crash | P1 | AC-5 | Fixed implementation: try/catch around `res.write` in heartbeat interval |

### 3. `ConversationPane.test.tsx` — 9 skipped tests

| # | Test | Priority | AC | Resolution |
|---|------|----------|----|------------|
| 1 | renders Tool Pill on TOOL_CALL_START with tool name | P0 | AC-1 | Fixed implementation: `TOOL_CALL_START` listener creates `ChatMessage` with `toolCall` field |
| 2 | updates tool input on TOOL_CALL_ARGS | P0 | AC-1 | Fixed implementation: `TOOL_CALL_ARGS` listener appends delta to input |
| 3 | marks tool completed on TOOL_CALL_END | P0 | AC-1 | Fixed implementation: `TOOL_CALL_END` listener sets status to `completed` |
| 4 | sets tool output on TOOL_CALL_RESULT | P0 | AC-1 | Fixed implementation: `TOOL_CALL_RESULT` listener sets output |
| 5 | promotes to Semantic Pill on TOOL_CALL_PROMOTED | P0 | AC-2 | Fixed implementation: `TOOL_CALL_PROMOTED` listener sets `semantic` field |
| 6 | renders error-state Tool Pill on failed tool result | P0 | AC-4 | Fixed implementation: error detection in `TOOL_CALL_RESULT` listener |
| 7 | renders system message on RUN_ERROR (not assistant message) | P0 | AC-5 | Fixed implementation: `RUN_ERROR` creates `role: 'system'` message |
| 8 | renders system message on STREAM_ERROR (not assistant message) | P0 | AC-5 | Fixed implementation: `STREAM_ERROR` creates `role: 'system'` message |
| 9 | multiple tool calls each render at their positions | P1 | AC-1 | Fixed implementation: each tool call gets its own `ChatMessage` entry |

**Additional test fix (DP-2/DP-4):** Story 3.3 test "shows tool execution indicator on TOOL_CALL_START" updated to emit `toolCallName` instead of `toolName` (AG-UI spec compliance, DP-2).

---

## Implementation Changes

### Backend (agent-be)

| File | Change |
|------|--------|
| `agent.service.ts` | Full tool call lifecycle (TOOL_CALL_ARGS/END/RESULT), circuit breaker timer (120s), classifier integration (4th constructor param), `toolCallName` fix, `Promise.race` abort mechanism |
| `streaming.controller.ts` | SSE heartbeat interval (15s), cleanup on close/complete/error, try/catch on heartbeat write |
| `streaming.module.ts` | Added `ToolPillClassifierService` as provider |

### Frontend (web)

| File | Change |
|------|--------|
| `ConversationPane.tsx` | Fixed TOOL_CALL_START (toolCallName), added TOOL_CALL_ARGS/END/RESULT/PROMOTED listeners, changed RUN_ERROR/STREAM_ERROR to `role: 'system'` |
| `ChatMessageList.tsx` | Renders ToolPill for toolCall messages, SemanticPill for promoted messages, system messages for `role: 'system'` |
| `ToolExecutionIndicator.tsx` | Deleted (superseded by ToolPill) |

### Already Implemented (Pre-existing)

| File | Status |
|------|--------|
| `ToolPill.tsx` | Already implemented (not a stub) |
| `SemanticPill.tsx` | Already implemented (not a stub) |
| `tool-pill-classifier.service.ts` | Already implemented (not a stub) |
| `ag-ui.types.ts` | Already has TOOL_CALL_PROMOTED_EVENT |
| `types.ts` (conversation) | Already has ToolCallData + extended ChatMessage |

---

## Decision Records

All decisions recorded in the story file under "Coverage Validation Decisions":

| Decision ID | Rule | Summary |
|-------------|------|---------|
| DP-1/DP-4 | DP-1, DP-4 | Chose to fix implementation for all 25 skipped tests rather than remove them (removing AC tests is destructive) |
| DP-4 | DP-4 | Fixed `createAgentService` to use `jest.isolateModules` (jest.doMock doesn't work with static imports) |
| DP-4 | DP-4 | Fixed heartbeat "stream complete" test to call `sessionEvents.complete()` instead of emitting RUN_FINISHED |
| DP-4 | DP-4 | Fixed heartbeat "stream error" test to trigger `subject.error()` instead of subscribe/unsubscribe |
| DP-2/DP-4 | DP-2, DP-4 | Fixed Story 3.3 test to use `toolCallName` instead of `toolName` (AG-UI spec compliance) |

---

## Checklist Validation

| Check | Status |
|-------|--------|
| Zero skipped tests (it.skip, test.skip, describe.skip, test.fixme, it.todo) | PASS |
| All acceptance criteria covered by tests | PASS (AC-1 through AC-5) |
| All tests pass (agent-be: 80, web: 571) | PASS |
| Lint: 0 errors (agent-be + web) | PASS |
| Typecheck: clean (agent-be + web) | PASS |
| Decision policy applied for all decisions | PASS |
| Decisions recorded in story file | PASS |

---

## Conclusion

Story 3.4 is sufficiently covered. All 25 skipped tests have been resolved to zero by implementing the missing production code (AgentService tool call lifecycle + circuit breaker, StreamingController heartbeat, ConversationPane tool call listeners + system messages, ChatMessageList rendering). Five test infrastructure fixes were made (DP-4 test-only changes). No tests were removed — all encode acceptance criteria and now pass.
