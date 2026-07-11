---
title: 'Fix silent error swallowing in AgentService.runTurn iterator loop'
type: 'bugfix'
created: '2026-07-11'
status: 'done'
baseline_commit: 'b29c64c3177e37d28ecc53953f84dcbd96ce5479'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `runTurn()` method's SDK message iterator loop has a bare `catch { break; }` that silently swallows all errors from the Claude Agent SDK subprocess. When the SDK's subprocess fails (e.g. cwd doesn't exist, ENOENT on spawn, API key invalid), the error is caught without logging, re-throwing, or emitting RUN_ERROR. Execution falls through to emit RUN_FINISHED as if the run completed successfully — with zero output and zero error signal. Agent-run failures become completely invisible: no error in logs, no RUN_ERROR SSE event, no error message in the UI.

**Approach:** Replace the bare `catch { break; }` with error-aware handling: if the abort controller fired (circuit breaker or user stop), break — this is expected; otherwise, re-throw the error so the outer try/catch can log it and emit RUN_ERROR to the SSE channel. Add a regression test verifying that a non-abort iterator error emits RUN_ERROR (not RUN_FINISHED) and is logged.

## Boundaries & Constraints

**Always:**
- The abort path (circuit breaker or user stop) must still break the loop — that is expected behavior, not an error.
- Non-abort errors must propagate to the outer try/catch at line ~200, which already logs (`logger.error`) and emits `RUN_ERROR`.
- The regression test must use the existing mock pattern: `jest.doMock('@anthropic-ai/claude-agent-sdk', ...)` + `makeQueryFromGenerator` + `createAgentService()` via `jest.isolateModules`.
- The regression test must use `jest.useFakeTimers()` (already active in `beforeEach`) — no real timers.

**Ask First:** None.

**Never:**
- Do NOT run the real-service E2E test — it requires a running Daytona sandbox and costs real API credits.
- Do NOT change the abort/circuit-breaker path behavior — only the non-abort error path.
- Do NOT modify the outer try/catch at line ~200 — it already handles errors correctly.

</frozen-after-approval>

## Code Map

- `apps/agent-be/src/streaming/agent.service.ts` -- Contains `runTurn()` with the bare `catch { break; }` at lines 113-117. The outer try/catch at lines 200-208 already logs and emits RUN_ERROR — errors just never reach it.
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` -- Unit test file for the real AgentService (1259 lines). Contains the mock setup pattern at line 1121 (`jest.doMock` + `makeQueryFromGenerator` + `createAgentService`). The regression test goes here.
- `apps/agent-be/test/helpers/mock-query.ts` -- `makeQueryFromGenerator(gen)` wraps a custom async generator as a `Query` with an `interrupt()` spy. Use this to create a throwing iterator.

## Tasks & Acceptance

**Execution:**
- [x] `apps/agent-be/src/streaming/agent.service.ts` -- Replace the bare `catch { break; }` at line 115 with `catch (err) { if (abortController.signal.aborted) break; throw err; }` -- So non-abort errors propagate to the outer try/catch which logs and emits RUN_ERROR, while abort errors (circuit breaker / user stop) still break the loop as expected.
- [x] `apps/agent-be/src/streaming/agent.service.unit.spec.ts` -- Add a `[P0]` regression test in a new describe block -- Verify that when the SDK iterator throws a non-abort error, RUN_ERROR is emitted with the error message, RUN_FINISHED is NOT emitted, and the error is logged via `logger.error`.

**Acceptance Criteria:**
- Given the SDK iterator's `next()` rejects with a non-abort error, when `runTurn()` is called, then `RUN_ERROR` is emitted with the error message and `RUN_FINISHED` is NOT emitted.
- Given the SDK iterator's `next()` rejects with a non-abort error, when `runTurn()` is called, then the error is logged via `logger.error` with a string containing the error message.
- Given the abort controller fired (circuit breaker or user stop), when the iterator loop catches the abort rejection, then the loop breaks without emitting RUN_ERROR from the outer catch (existing circuit-breaker RUN_ERROR emission path is unchanged).
- Given existing unit tests, when `yarn nx run agent-be:test` is run, then all existing tests pass (no regressions).

## Verification

**Commands:**
- `yarn nx run agent-be:test` -- expected: all unit tests pass, including the new regression test and all existing tests.
- `yarn nx run agent-be:typecheck` -- expected: no type errors (the `catch (err)` binding must satisfy `noUnusedLocals` — `err` is used in the `throw err` statement).

## Design Notes

The regression test mock setup follows the pattern at `agent.service.unit.spec.ts:1121`:

```typescript
async function* throwingGenerator(): AsyncGenerator<SDKMessage, void> {
  throw new Error('spawn failed: ENOENT');
}
mockQuery = jest.fn(() => makeQueryFromGenerator(throwingGenerator()));
jest.doMock('@anthropic-ai/claude-agent-sdk', () => ({ query: mockQuery }));

agentService = createAgentService();
const errorSpy = jest.spyOn(agentService['logger'], 'error');

await agentService.runTurn({
  conversationId: 'conv-1', sandboxId: 'sb-1',
  message: 'test', userId: 'user-1',
});

const emittedEvents = emitSpy.mock.calls.map((c) => c[1]?.event);
expect(emittedEvents).toContain(EventType.RUN_ERROR);
expect(emittedEvents).not.toContain(EventType.RUN_FINISHED);
expect(errorSpy).toHaveBeenCalledWith(
  expect.stringContaining('spawn failed: ENOENT'),
);
```

The generator throws on the first `next()` call. `Promise.race` rejects. The fixed catch block sees `abortController.signal.aborted === false` and re-throws. The outer catch logs and emits RUN_ERROR. The `finally` cleans up. The `runTurn` promise resolves (outer catch does not re-throw). Fake timers are active from `beforeEach` — no timer advancement needed since the error path completes before any timer fires.

## Suggested Review Order

**Error handling fix**

- Core fix: abort path breaks, non-abort errors await pending promises then re-throw to outer catch
  [`agent.service.ts:115`](../../apps/agent-be/src/streaming/agent.service.ts#L115)

- Outer catch that receives the re-thrown error — logs and emits RUN_ERROR (unchanged)
  [`agent.service.ts:200`](../../apps/agent-be/src/streaming/agent.service.ts#L200)

**Regression test**

- Throwing generator mock + assertions for RUN_ERROR event, data.message payload, no RUN_FINISHED, logger.error called
  [`agent.service.unit.spec.ts:1259`](../../apps/agent-be/src/streaming/agent.service.unit.spec.ts#L1259)
