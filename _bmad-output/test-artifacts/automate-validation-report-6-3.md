# Automate Validation Report — Story 6.3

**Story:** 6.3 — Migrate AgentService to Sandbox-Based Execution
**Date:** 2026-07-16
**Validator:** Murat (Master Test Architect)
**Mode:** Validate → Create (coverage gap found)

---

## Executive Summary

| Metric | Value |
| --- | --- |
| Test files validated | 3 |
| Total tests (Story 6.3 files) | 86 |
| Passing | 86 |
| Failing | 0 |
| Skipped | 0 |
| Coverage gaps found | 1 |
| Coverage gaps fixed | 1 |
| Production code modified | No |
| Existing tests modified | No |
| New tests generated | 1 |
| Full agent-be suite | 782 passed, 0 failed, 0 skipped |
| Typecheck | Clean |

**Verdict:** PASS — all ACs covered, no skipped tests, one coverage gap found and fixed.

---

## Step 1: Skipped Test Audit

**Directive:** Treat skipped tests as coverage failures. Un-skip and run each; if pass keep, if fail heal, if unfixable mark expected-to-fail.

**Search performed:** `describe.skip`, `it.skip`, `test.skip`, `xit`, `xdescribe`, `xtest`, `test.todo`, `it.todo`, `test.fixme`, `it.fixme` across all Story 6.3 test files and the full `apps/agent-be/src/` + `apps/agent-be/test/` tree.

**Result:** No skipped tests found in Story 6.3 test files. The dev already activated all 23 ATDD red-phase scaffolds (4 event bridge onEvent + 19 agent service rewrite/regression/AC-4). A leftover comment at `agui-event-bridge.service.spec.ts:807` references `.skip` but the `describe.skip()` was already removed — the block is active `describe()`.

**Full agent-be suite:** 782 tests, 0 skipped, 0 failed.

---

## Step 2: Coverage Assessment Against Acceptance Criteria

### AC-1: `runTurn()` launches sandbox-agent inside the sandbox — PASS

| Test | File | Status |
| --- | --- | --- |
| runTurn calls streamAgentEvents with conversationId, sandboxId, userId, onEvent | agent.service.unit.spec.ts | PASS |
| runTurn emits RUN_STARTED before calling streamAgentEvents | agent.service.unit.spec.ts | PASS |
| onEvent accumulates text from TEXT_MESSAGE_CONTENT | agent.service.unit.spec.ts | PASS |
| onEvent builds tool_call segments from TOOL_CALL_START/ARGS/END/RESULT | agent.service.unit.spec.ts | PASS |
| Tool call lifecycle emission (5 tests) | agent.service.unit.spec.ts | PASS |
| Working tree emission after file-modifying tool calls (5 tests) | agent.service.unit.spec.ts | PASS |
| runTurn emits RUN_FINISHED after streamAgentEvents resolves | agent.service.unit.spec.ts | PASS |
| onEvent called before sessionEvents.emit (non-lifecycle) | agui-event-bridge.service.spec.ts | PASS |
| Lifecycle events passed to onEvent but not forwarded to emit | agui-event-bridge.service.spec.ts | PASS |
| Backward compat: lifecycle events emit when no onEvent | agui-event-bridge.service.spec.ts | PASS |
| Backward compat: non-lifecycle events emit when no onEvent | agui-event-bridge.service.spec.ts | PASS |
| createAgentSession before streamAgentLogs (transport ordering) | agui-event-bridge.service.spec.ts | PASS |
| Command passed through to createAgentSession verbatim | agui-event-bridge.service.spec.ts | PASS |
| Session terminated on normal stream completion | agui-event-bridge.service.spec.ts | PASS |

### AC-2: Agent cannot access host filesystem — PASS

| Test | File | Status |
| --- | --- | --- |
| Command does NOT contain platform credentials | agent.service.unit.spec.ts | PASS |
| ANTHROPIC_API_KEY and GITHUB_TOKEN NOT interpolated into command | agent.service.unit.spec.ts | PASS |
| Malicious user message cannot inject shell commands | agent.service.unit.spec.ts | PASS |
| Shell metacharacters safely quoted in command | agent.service.unit.spec.ts | PASS |

### AC-3: `stop()` terminates the real sandbox process — PASS

| Test | File | Status |
| --- | --- | --- |
| stop() calls aguiEventBridgeService.stop(conversationId) | agent.service.unit.spec.ts | PASS |
| stop() emits RUN_FINISHED after bridge.stop() | agent.service.unit.spec.ts | PASS |
| stop() terminates active session via terminateAgentSession | agui-event-bridge.service.spec.ts | PASS |
| stop() does NOT emit SSE events | agui-event-bridge.service.spec.ts | PASS |
| stop() clears circuit breaker timer | agui-event-bridge.service.spec.ts | PASS |
| stop() calls terminateAgentSession while stream in-flight | agui-event-bridge.service.spec.ts | PASS |
| stop() sets aborted flag | agui-event-bridge.service.spec.ts | PASS |

### AC-4: Host-based SDK code removed — PASS

| Test | File | Status |
| --- | --- | --- |
| AgentService no longer imports query/Query/SDKMessage from SDK | agent.service.unit.spec.ts | PASS |

### AC-5: `AgentServiceFake` updated — PASS

| Test | File | Status |
| --- | --- | --- |
| Integration tests using AgentServiceFake via AGENT_SERVICE token (6 tests) | agent.service.spec.ts | PASS |

### AC-6: Circuit breaker adapted — PASS

| Test | File | Status |
| --- | --- | --- |
| AGENT_STOPPED rejection skips RUN_ERROR | agent.service.unit.spec.ts | PASS |
| AGENT_STREAM_TIMEOUT rejection skips RUN_ERROR | agent.service.unit.spec.ts | PASS |
| **MODULE_DESTROYING rejection skips RUN_ERROR and RUN_FINISHED** (NEW) | agent.service.unit.spec.ts | PASS |
| onModuleDestroy() calls bridge.stop() for each active run | agent.service.unit.spec.ts | PASS |
| Circuit breaker timeout fires with no events | agui-event-bridge.service.spec.ts | PASS |
| Circuit breaker emits RUN_ERROR with canonical message | agui-event-bridge.service.spec.ts | PASS |
| Timer resets on every received chunk | agui-event-bridge.service.spec.ts | PASS |
| Terminates session BEFORE emitting RUN_ERROR (ordering) | agui-event-bridge.service.spec.ts | PASS |
| Emits RUN_ERROR only once (no double-emit) | agui-event-bridge.service.spec.ts | PASS |
| onModuleDestroy terminates all active sessions | agui-event-bridge.service.spec.ts | PASS |
| onModuleDestroy clears all circuit breaker timers | agui-event-bridge.service.spec.ts | PASS |
| onModuleDestroy does not throw when no active sessions | agui-event-bridge.service.spec.ts | PASS |
| onModuleDestroy terminates sessions with active handles | agui-event-bridge.service.spec.ts | PASS |

### AC-7: Preserved behaviors remain functional — PASS

| Test | File | Status |
| --- | --- | --- |
| onEvent triggers classifier on TOOL_CALL_RESULT with segment lookup | agent.service.unit.spec.ts | PASS |
| Classifier integration: calls classifier, emits TOOL_CALL_PROMOTED (2 tests) | agent.service.unit.spec.ts | PASS |
| CREDENTIAL_FAILURE / ACCESS_DENIED emission (4 tests) | agent.service.unit.spec.ts | PASS |
| Concurrent-turn guard: second runTurn rejected silently (2 tests) | agent.service.unit.spec.ts | PASS |
| Segments persistence (3 tests) | agent.service.unit.spec.ts | PASS |
| streamAgentEvents rejection (non-sentinel) emits RUN_ERROR | agent.service.unit.spec.ts | PASS |
| Preserves error status when TOOL_CALL_RESULT isError is true | agent.service.unit.spec.ts | PASS |
| Working tree event arrives before RUN_FINISHED (ordering) | agent.service.unit.spec.ts | PASS |
| Classifier failure does not crash agent run | agent.service.unit.spec.ts | PASS |
| Malformed event handling (4 tests) | agui-event-bridge.service.spec.ts | PASS |
| Leftover buffer flushed on stream completion | agui-event-bridge.service.spec.ts | PASS |

### AC-8: Turn persistence and cost tracking still work — PASS

| Test | File | Status |
| --- | --- | --- |
| onEvent captures cost data from RUN_FINISHED data payload | agent.service.unit.spec.ts | PASS |
| Cost recording happens BEFORE RUN_FINISHED emitted to SSE | agent.service.unit.spec.ts | PASS |
| recordCost called with correct cost data | agent.service.unit.spec.ts | PASS |
| recordCost NOT called when RUN_FINISHED has no cost data | agent.service.unit.spec.ts | PASS |
| recordCost failure does not crash agent run | agent.service.unit.spec.ts | PASS |
| Cost recorded when result message arrives after tool calls | agent.service.unit.spec.ts | PASS |

---

## Step 3: Coverage Gap Found and Fixed

### Gap: `MODULE_DESTROYING` sentinel branch untested (AC-6)

**Location:** `agent.service.ts:347-351` — the catch block in `runTurn()` checks three sentinel strings (`AGENT_STOPPED`, `AGENT_STREAM_TIMEOUT`, `MODULE_DESTROYING`) to skip `RUN_ERROR` emission on abort-initiated rejections. Tests existed for `AGENT_STOPPED` and `AGENT_STREAM_TIMEOUT` but not for `MODULE_DESTROYING`.

**Why it matters:** `MODULE_DESTROYING` is the sentinel the event bridge rejects with when `onModuleDestroy()` fires (line 224 of `agui-event-bridge.service.ts`). The catch block must skip both `RUN_ERROR` and `RUN_FINISHED` for this sentinel (SSE clients are disconnecting during shutdown). The event bridge tests verified the rejection (`agui-event-bridge.service.spec.ts:684`), but no AgentService test verified the catch-block handling.

**Decision (DP-4):** Test-only change, no production behavior change. Decided autonomously to generate the missing test.

**Action taken:** Added one new test to `agent.service.unit.spec.ts` in the "runTurn() uses AguiEventBridgeService" describe block, immediately after the `AGENT_STREAM_TIMEOUT` test:

```
[P0] MODULE_DESTROYING rejection skips RUN_ERROR and RUN_FINISHED — module shutting down (AC-6)
```

**Constraint compliance:** This is a new test generated this run — no existing tests were modified.

**Result:** Test passes immediately (the production code already handles `MODULE_DESTROYING` correctly — the gap was test coverage, not a code defect).

---

## Step 4: Test Execution Results

### Story 6.3 Test Files

```
Command: npx jest src/streaming/agui-event-bridge.service.spec.ts src/streaming/agent.service.unit.spec.ts src/streaming/agent.service.spec.ts

Test Suites: 3 passed, 3 total
Tests:       86 passed, 86 total
Snapshots:   0 total
```

### Full agent-be Suite

```
Command: npx jest

Test Suites: 32 passed, 32 total
Tests:       782 passed, 782 total
```

### Typecheck

```
Command: yarn nx run agent-be:typecheck

NX   Successfully ran target typecheck for project agent-be
```

---

## Step 5: Quality Standards Check

| Criterion | Status |
| --- | --- |
| No skipped tests | PASS |
| No flaky patterns (hard waits, race conditions) | PASS |
| Tests are deterministic | PASS |
| Tests are isolated (no shared state) | PASS |
| Given-When-Then structure | PASS |
| Priority tags ([P0], [P1]) in test names | PASS |
| No production code modified | PASS |
| No existing tests modified | PASS |
| Typecheck clean | PASS |

---

## Decisions Made (Decision Policy)

| Decision | Policy | Rationale |
| --- | --- | --- |
| Generate missing MODULE_DESTROYING test | DP-4 | Test-only change, no production behavior change — autonomous |
| Did not modify existing tests | User directive | "don't modify existing tests you didn't generate this run" |
| Did not edit production code | User directive | "Don't edit production code" |
| No HALT needed | — | All decisions covered by DP-4; no uncovered decisions arose |

---

## Files Modified

| File | Change |
| --- | --- |
| `apps/agent-be/src/streaming/agent.service.unit.spec.ts` | Added 1 new test: `MODULE_DESTROYING rejection skips RUN_ERROR and RUN_FINISHED` (AC-6 sentinel coverage gap) |

**No production code modified. No existing tests modified.**

---

**Generated by BMad TEA Agent** - 2026-07-16
