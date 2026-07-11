# Test Fidelity Audit Report

**Date:** 2026-07-06
**Auditor:** Vera (Test Fidelity Auditor)
**Scope:** Full project — all code paths consuming external SDK contracts
**Verdict:** FAIL — false confidence found (5 findings, 3 blockers)

## Scope

Full-project audit of test fidelity — whether tests exercise the real external contract or a fabricated assumption. Focus narrowed to the code paths that consume external SDK contracts: `@anthropic-ai/claude-agent-sdk` (the `SDKMessage` stream and `Query` interface) and `@daytonaio/sdk` (the Daytona sandbox client). Audited 13 test suites / 251 tests in `apps/agent-be`, plus the architecture and epics prescriptions.

## Verification Method

- Read the real SDK type declarations (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`, `node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts`) and compared against the test fixtures.
- Traced from production contract consumers outward to tests — not from tests inward.
- Ran the full `agent-be` test suite to confirm the green-test condition.
- Cross-referenced the architecture and epics prescriptions for recorded-session replay.
- Read the existing `docs/sdk-contract-testing-gap.md` incident report.

## Contract Consumers Identified

| # | Code path | External contract | File:line |
|---|-----------|-------------------|-----------|
| C1 | `AgentService.runTurn` — consumes `SDKMessage` stream from `query()` | `@anthropic-ai/claude-agent-sdk` `Query` / `SDKMessage` | `apps/agent-be/src/streaming/agent.service.ts:91-140` |
| C2 | `processStreamEvent` — consumes `SDKPartialAssistantMessage.event` (`BetaRawMessageStreamEvent`) | same | `agent.service.ts:355-432` |
| C3 | `processAssistantMessage` — consumes `SDKAssistantMessage.message` (`BetaMessage`) | same | `agent.service.ts:434-468` |
| C4 | `processUserMessage` — consumes `SDKUserMessage.message` (`MessageParam`) | same | `agent.service.ts:470-572` |
| C5 | `stop` / `handleCircuitBreaker` — calls `Query.interrupt()` | `@anthropic-ai/claude-agent-sdk` `Query` | `agent.service.ts:229, 312` |
| C6 | `SandboxService` — consumes `Daytona` / `Sandbox` types | `@daytonaio/sdk` | `apps/agent-be/src/sandbox/sandbox.service.ts:11-206` |

## Findings

### Finding 1 — Gap A: `processAssistantMessage` has ZERO test coverage (BLOCKER)

**Code path:** C3 — `agent.service.ts:434-468`. Handles `SDKAssistantMessage` (type `'assistant'`), reads `msg.message?.content` to extract `tool_use` blocks and register them in `activeToolCalls`.

**Real contract:** `SDKAssistantMessage` (`sdk.d.ts:2698-2731`) declares `message: BetaMessage`. `BetaMessage` (`messages.d.ts:1391`) declares `content` as an array of content blocks. The production code reads `msg.message?.content` (`agent.service.ts:447`) — this is the correct access path.

**Test gap:** No test constructs a `type: 'assistant'` message. Grep across every `*.spec.ts` in `apps/agent-be` for `type: 'assistant'`, `makeAssistantMessage`, and `processAssistantMessage` returned **zero matches**. Every test that exercises tool-call lifecycle uses `makeStreamEvent` (type `'stream_event'`), never the complete `SDKAssistantMessage` path.

**What this hides:** If the SDK changes how `SDKAssistantMessage.message.content` is structured — renames the field, nests it deeper, changes the block shape — `processAssistantMessage` breaks silently. No test would catch it. This is the exact bug class that already shipped once (gap doc incident bug #2: the code read `msg.content` instead of `msg.message.content`; the entire function was a no-op; no test caught it). The bug was fixed in the code, but the test gap that hid it was never closed.

**Evidence:** `agent.service.ts:434-468` (untested code path); `agent.service.unit.spec.ts` (no `type: 'assistant'` fixture); grep result: "No files found."

---

### Finding 2 — Gap B: `makeSdkMessage` type-assertion bypass still present (BLOCKER)

**Code:** `agent.service.unit.spec.ts:93-95`:
```ts
function makeSdkMessage(partial: Partial<SDKMessage>): SDKMessage {
  return partial as SDKMessage;
}
```
And `agent.service.unit.spec.ts:118`: `} as unknown as SDKMessage);` (double assertion on `makeResultMessage`).

**Real contract:** `SDKMessage` (`sdk.d.ts:3660`) is a discriminated union of 30+ member types, each with required fields. For example, `SDKPartialAssistantMessage` (`sdk.d.ts:3742-3749`) requires `parent_tool_use_id`, `uuid`, `session_id` — all omitted by `makeStreamEvent`. `SDKResultSuccess` (`sdk.d.ts:3877-3901`) requires `duration_api_ms`, `stop_reason` — omitted by `makeResultMessage`. `usage: {}` does not satisfy `NonNullableUsage`.

**The gap:** The `as SDKMessage` cast silences the compiler. Every shape mismatch between the fixture and the real type that the compiler would flag as a compile error is hidden. The fixtures match what the production code reads, not what the real SDK emits — so tests pass against a fabricated contract.

**What this hides:** Shape drift. If the SDK renames a field, changes nesting, or adds a required field, the compiler will not flag the fixture. The test continues to pass against the fabricated shape while production breaks against the real one. This is the structural defect that allowed the original three-bug incident: the fixtures matched what the broken code expected, so every test passed.

**Evidence:** `agent.service.unit.spec.ts:93-95, 118`; `sdk.d.ts:3660, 3742-3749, 3877-3901`.

---

### Finding 3 — Gap A: `Query.interrupt()` contract never verified (BLOCKER)

**Code path:** C5 — `agent.service.ts:229` (`await activeRun.query.interrupt()`) and `:312` (same in circuit breaker).

**Real contract:** `Query` (`sdk.d.ts:2240-2250`) extends `AsyncGenerator<SDKMessage, void>` and declares `interrupt(): Promise<void>`. It is a method on the real `Query` object returned by `query()`.

**Test gap:** The mock query (`jest.fn(() => yieldMessages(messages))`) returns a plain async generator with no `interrupt()` method. The test run output shows repeated `TypeError: activeRun.query.interrupt is not a function` warnings. The production code's try/catch (`agent.service.ts:230-232, 313-315`) swallows the error, so tests pass green.

**What this hides:** The stop and circuit-breaker paths call `interrupt()` to halt the real SDK query. No test verifies that `interrupt()` is actually called, that it is awaited, or that it behaves as the contract specifies. If the SDK changes `interrupt()` — renames it, makes it synchronous, removes it — the stop/circuit-breaker paths would silently fail to interrupt the real query. The test would still pass green because the try/catch swallows the `TypeError`.

**Evidence:** `agent.service.ts:229, 312`; `sdk.d.ts:2250`; test output: `Failed to interrupt agent query for conversation conv-1: TypeError: activeRun.query.interrupt is not a function` (repeated 6x across circuit-breaker tests).

---

### Finding 4 — Missing prescribed safeguard: recorded-session replay fixture never implemented (BLOCKER)

**Architecture prescription:** `architecture.md:80` — "Before any upgrade: diff the JSONL->AG-UI event mapping in the release changelog; **run the new version against a recorded BMAD session replay and validate the expected AG-UI event sequence matches**."

**Epics prescription:** `epics.md:117` — "validate against a recorded BMAD session replay. This is a PR-review checklist item enforced by process, not a story acceptance criterion or automated test."

**Gap doc:** `docs/sdk-contract-testing-gap.md` — proposes promoting the manual checklist to an automated recorded-session replay test. Status: "Open concern, raised 2026-07-06." Ends with three unresolved "Open questions" (where the recording script lives, whether the fixture is committed, whether to add a project-context pattern entry).

**What was implemented:** Nothing. No JSONL fixtures exist in `apps/agent-be/test/`. No recording script exists in `apps/agent-be/`. No replay test exists. The only `record*` script in the repo (`scripts/pipeline/record-trace.mjs`) is for pipeline tracing, unrelated to the SDK contract.

**What this hides:** The exact incident the gap doc describes — code breaking against the real SDK contract shape while tests pass against fabricated fixtures. The architecture prescribes the safeguard; the gap doc proposes the implementation; neither exists in the codebase. A regression of the same bug class would again be invisible.

**Evidence:** `architecture.md:80`; `epics.md:117`; `docs/sdk-contract-testing-gap.md:31-51, 65-69`; `find apps/agent-be -name "*.jsonl"` -> empty; `find apps/agent-be scripts -name "*record*"` -> only `scripts/pipeline/record-trace.mjs` (unrelated).

---

### Finding 5 — Gap A (lower severity): `agent.service.spec.ts` replaces the entire service with `AgentServiceFake`

**Code:** `agent.service.spec.ts:69-70` — `.overrideProvider(AGENT_SERVICE).useValue(agentFake)`.

**The gap:** `AgentServiceFake` (`test/helpers/agent-service.fake.ts:10-17, 108-118`) emits downstream SSE events directly from a hardcoded script. It never consumes the SDK contract. The entire `processSdkMessage` / `processStreamEvent` / `processAssistantMessage` / `processUserMessage` pipeline is replaced, not exercised.

**Severity: lower.** `agent.service.unit.spec.ts` DOES exercise the real `AgentService` via `jest.isolateModules` + `jest.doMock`, so the real service is not entirely untested. But the `agent.service.spec.ts` suite gives the appearance of integration coverage for `ConversationsService` <-> `AgentService` while actually testing `ConversationsService` <-> `AgentServiceFake`. The fake is the "well-designed fake that tests the wrong layer" pattern.

**What this hides:** Any integration defect between `ConversationsService` and the real `AgentService` event-mapping pipeline. The fake emits the expected events by construction; the real service must derive them from the SDK stream.

**Evidence:** `agent.service.spec.ts:69-70`; `agent-service.fake.ts:10-17, 108-118`.

---

### Out of scope (verified clean)

**C6 — `SandboxService` (Daytona SDK):** Tests in `sandbox.service.nfr-s1.spec.ts` mock the Daytona client at the correct boundary — `mockDaytona` / `mockSandbox` replace the external SDK, and the real `SandboxService` code runs against the mock. The mock's return shape (`{ exitCode, result }` for `executeCommand`) is a reasonable representation of the real `CommandResponse`. The mock is typed `any` (line 32-34) and constructed with `as never` (line 53), which silences the compiler — but the mock is at the correct boundary and the tests verify the consuming code's behavior (credential isolation, command construction), not the SDK's contract. This is acceptable test design, not a fidelity gap.

## Verdict

**FALSE CONFIDENCE FOUND.** 5 findings (3 blockers, 1 blocker, 1 lower severity, 1 missing safeguard).

The test suite passes 251/251 green. The production bugs described in `docs/sdk-contract-testing-gap.md` were fixed in the code. But the **test methodology that hid them was not structurally changed**:

- The `as SDKMessage` type-assertion bypass that silenced the compiler remains (`agent.service.unit.spec.ts:93-95, 118`).
- The `processAssistantMessage` contract consumer — the exact code path where bug #2 lived — has zero test coverage.
- The `Query.interrupt()` contract is mocked away to a `TypeError` that the try/catch swallows.
- The architecture-prescribed recorded-session replay fixture — the safeguard that would have caught the original incident by construction — was proposed in a gap doc and never implemented.

The same class of bug could ship again undetected. The bugs were fixed; the fidelity gap was not.

## Cross-references

1. **`architecture.md:80`** — "run the new version against a recorded BMAD session replay and validate the expected AG-UI event sequence matches." Prescribed as a pre-upgrade safeguard. Never operationalized into an automated test.

2. **`epics.md:117`** — "validate against a recorded BMAD session replay. This is a PR-review checklist item enforced by process, not a story acceptance criterion or automated test." Explicitly deferred to manual process. The gap doc (`docs/sdk-contract-testing-gap.md:35`) proposes promoting it to an automated test; the promotion was never done.

3. **`docs/sdk-contract-testing-gap.md`** — the incident report documenting the three-bug failure that green tests hid. Proposes the recorded-session replay fix. Status: "Open concern." Open questions unresolved. No implementation exists.

## Contract-Test Strategy Recommendations

For each blocker finding, per the recommend-contract-strategy methodology:

### Finding 1 + Finding 4 — Recorded-session replay fixture (recommended)

- **Gap:** Findings 1 (untested `processAssistantMessage`) and 4 (missing prescribed safeguard).
- **Technique:** Recorded-session replay fixture. Record one real SDK session that triggers an assistant message with `tool_use` blocks, capture the `SDKMessage` stream as JSONL, commit as a fixture. Replay through the real `AgentService.processSdkMessage` pipeline. Assert the AG-UI event sequence.
- **Why:** This is the architecture's existing prescription (`architecture.md:80`), promoted from manual checklist to automated test — exactly as `docs/sdk-contract-testing-gap.md:35` proposes. It exercises the real contract shape by construction: the fixture IS the real shape, captured from a real session. It would have caught the original three-bug incident and would catch the `processAssistantMessage` gap.
- **Boundary:** The test seam sits at the `query()` call — mock `query()` to yield from the JSONL fixture, let the real `AgentService` pipeline run. This is the correct boundary: the SDK entry point is mocked, the contract-consuming code is exercised.
- **Existing prescription:** `architecture.md:80` (quoted above); `epics.md:117`; `docs/sdk-contract-testing-gap.md:31-51`.
- **Trade-off:** One-time recording cost; re-record on SDK version upgrade (already gated by the architecture's pinning discipline). The fixture is a snapshot — it catches processing regressions, not future SDK contract changes. A gated live smoke test (`RUN_LIVE_SDK_TESTS=true`) would catch contract changes; lower priority per gap doc `:53-55`.

### Finding 2 — Type-checked construction (recommended)

- **Gap:** Finding 2 (`as SDKMessage` bypass).
- **Technique:** Replace `makeSdkMessage(partial: Partial<SDKMessage>): SDKMessage { return partial as SDKMessage; }` with type-checked construction. Construct object literals that satisfy the real SDK type without assertion. For `SDKPartialAssistantMessage`, include all required fields (`parent_tool_use_id`, `uuid`, `session_id`). For `SDKResultSuccess`, include `duration_api_ms`, `stop_reason`, and a valid `NonNullableUsage` for `usage`.
- **Why:** Catches shape drift between the fixture and the real type at compile time. If the SDK renames a field or changes nesting, the compiler flags the fixture — not runtime in production.
- **Boundary:** No boundary change — this is a fixture-construction technique, applied in the test file itself.
- **What it doesn't catch:** Shape-correct but semantically-wrong fixtures (e.g. a `tool_result` block in an assistant-typed message). That requires the recorded-session approach above.
- **Trade-off:** More verbose fixtures; compiler errors when fixtures are incomplete (which is the point).

### Finding 3 — Deeper test seam on `Query` (recommended)

- **Gap:** Finding 3 (`Query.interrupt()` unverified).
- **Technique:** Mock `query()` to return an object that satisfies the real `Query` interface — an async generator with an `interrupt()` method spy. Assert `interrupt()` is called and awaited on `stop()` and circuit-breaker paths.
- **Why:** The current mock returns a bare async generator; `interrupt()` is absent, the try/catch swallows the `TypeError`, and the test passes green. A mock that satisfies `Query` would surface the missing method at test time and allow asserting it is called.
- **Boundary:** The seam stays at the `query()` call (correct boundary), but the mock's shape is upgraded to match the real `Query` type rather than a partial fabrication.
- **Trade-off:** Slightly more mock setup; the mock must track both the async-iterator contract and the `interrupt()` method.

---

## Gate Decision

**FAIL.** The work is not done. The fidelity gaps that allowed a known three-bug production incident to ship behind green tests were identified in a gap doc but never closed. The blocker findings (1, 2, 3, 4) must be resolved by:

1. Implementing the recorded-session replay fixture (closes Findings 1 and 4).
2. Replacing the `as SDKMessage` type-assertion bypass with type-checked construction (closes Finding 2).
3. Adding a `Query`-shaped mock with `interrupt()` spy (closes Finding 3).

The step that should resolve this: the `docs/sdk-contract-testing-gap.md` open concern needs to be promoted from a proposal to an implemented test, owned by the story that owns `apps/agent-be/src/streaming/agent.service.ts`.
