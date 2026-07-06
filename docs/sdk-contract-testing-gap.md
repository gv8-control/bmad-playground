# SDK Contract Testing Gap

**Status:** Open concern, raised 2026-07-06
**Origin:** Epic 3 closeout review of `apps/agent-be/src/streaming/agent.service.ts`

## The concern

Unit tests for `AgentService` used fabricated `SDKMessage` fixtures that did not match the real `@anthropic-ai/claude-agent-sdk` type declarations. Every test passed. The production code was non-functional — a three-layer pipeline break that meant no streaming events, no tool-call lifecycle, and no credential-failure detection ever fired in production.

The tests gave false confidence because they validated our processing logic against a fictional contract, not the real one.

## The incident

Three independent bugs in `agent.service.ts`, all invisible to the test suite:

1. **Streaming never enabled.** `query()` did not set `includePartialMessages: true`. The SDK never emitted `SDKPartialAssistantMessage` (type `'stream_event'`) events. `processStreamEvent` was never called. No `TEXT_MESSAGE_*`, `TOOL_CALL_START/ARGS/END` via streaming.

2. **Wrong field access on `SDKAssistantMessage`.** The code read `msg.content`; the real type has `message: BetaMessage` with content at `msg.message.content`. The guard `if (!msg.content) return ''` always fired. The entire `processAssistantMessage` function was a no-op.

3. **`SDKUserMessage` (type `'user'`) not routed.** `tool_result` blocks only arrive in `SDKUserMessage.message.content` (a `MessageParam`), not in `SDKAssistantMessage`. The dispatch only handled `type === 'assistant'`. User messages were silently dropped — the classifier that detects 401s and emits `CREDENTIAL_FAILURE` never ran.

The test fixtures constructed messages like `{ type: 'assistant', content: [{ type: 'tool_result', ... }] }` — putting `content` directly on the message and `tool_result` blocks in an assistant-typed message. Neither matches the SDK types. The fixtures matched what the broken code expected, so tests passed.

## Why the existing methodology missed it

- **Unit tests with hand-rolled fixtures** validate our processing logic, but only against the contract we *assumed* the SDK exposes — not the one it actually exposes.
- **Type assertions (`as SDKMessage`) bypassed type checking.** `makeSdkMessage(partial: Partial<SDKMessage>): SDKMessage { return partial as SDKMessage; }` silenced the compiler. The real shape mismatch was never surfaced.
- **No runtime contract verification.** Nothing in CI or the dev loop ever observed the actual `SDKMessage` objects the SDK yields. The gap between the assumed contract and the real contract was never tested.
- **No real-sandbox e2e.** Daytona isn't available in CI, and real LLM calls need an API key. Every real-sandbox test in Epic 3 was deferred (DP-5). The streaming pipeline had no integration-level check at all.

## Proposed mitigation: recorded-session contract test

Record one real SDK session, capture the `SDKMessage` stream as JSONL, commit it as a test fixture. Replay it through the real `AgentService.processSdkMessage` pipeline in a unit test. Assert the AG-UI event sequence comes out correct.

This is the architecture's existing prescription, promoted from a manual checklist to an automated test:

> "pin to an exact binary version; before any upgrade, diff the event-mapping changelog and validate against a recorded BMAD session replay" — architecture.md

### What it catches

Processing regressions — our code breaking against a known-good SDK output. This is precisely the bug class above. A real recording would have had the correct shape, and the test would have failed.

### What it doesn't catch

SDK contract changes. If the SDK changes its output format in a future version, the recording is stale until re-recorded. Mitigation: re-record on every SDK version upgrade (the architecture already pins exact versions and prescribes session-replay validation for upgrades).

### Setup

1. **One-time recording script.** Run the agent with a minimal prompt that triggers a tool call (e.g. "run `echo hello` in bash"). Dump each `SDKMessage` from the iterator to a JSONL fixture file. Commit the fixture.
2. **Replay test.** Read the JSONL, replay through the real `AgentService` (mocked `sessionEvents.emit`, mocked classifier/cost-tracking), assert the AG-UI event sequence matches expectations.
3. **CI integration.** Runs in every CI pipeline. No API key, no Daytona, no network.

### Trade-off vs. live smoke test

A gated live SDK smoke test (`RUN_LIVE_SDK_TESTS=true`, ~$0.01/run, needs `ANTHROPIC_API_KEY`) would catch SDK contract changes that a stale recording misses. Lower priority for now — the contract test covers the regression case, and SDK upgrades are rare and already gated by the architecture's pinning + replay-validation discipline. Add the live smoke test as part of the next SDK upgrade validation.

## What this does NOT replace

A real browser session observing a live conversation end-to-end. The contract test verifies the backend pipeline against a recording; the existing frontend unit tests verify event handling; the gap between them (SSE transport delivering events correctly in a deployed environment) remains a deployment-integration concern. This is consistent with the project-wide posture: "manual browser reload is the refresh mechanism."

## Scope of application

This concern is not specific to `AgentService`. Any code that consumes an external SDK's streaming or message contract and tests against hand-rolled fixtures has the same gap. The recorded-session approach applies wherever an external contract is consumed. `SandboxService` (Daytona SDK) and `artifacts.service.ts` (GitHub API contents) are candidates for the same treatment if they have similar fabricated-fixture tests.

## Open questions

- Should the recording script live in `apps/agent-be/test/` or a separate `scripts/` directory?
- Should the JSONL fixture be committed to the repo (large, but reproducible) or generated by a documented procedure and gitignored?
- Does this warrant a project-context.md pattern entry so future stories follow it by default?
