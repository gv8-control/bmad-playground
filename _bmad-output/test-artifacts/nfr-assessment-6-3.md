---
stepsCompleted: ['step-01-load-context', 'step-02-define-thresholds', 'step-03-audit']
lastStep: 'step-03-audit'
lastSaved: '2026-07-16'
workflowType: 'testarch-nfr-assess'
inputDocuments:
  - '_bmad-output/implementation-artifacts/6-3-migrate-agentservice-to-sandbox-execution.md'
  - '_bmad-output/project-context.md'
  - 'apps/agent-be/src/streaming/agent.service.ts'
  - 'apps/agent-be/src/streaming/agui-event-bridge.service.ts'
  - 'apps/agent-be/src/streaming/agent.service.unit.spec.ts'
  - 'apps/agent-be/src/streaming/agui-event-bridge.service.spec.ts'
  - 'apps/agent-be/src/cost-tracking/cost-tracking.service.ts'
  - 'apps/agent-be/src/conversations/dto/send-message.dto.ts'
  - 'apps/agent-be/src/streaming/streaming.controller.ts'
---

# NFR Evidence Audit - Story 6.3: Migrate AgentService to Sandbox-Based Execution

**Date:** 2026-07-16
**Story:** 6.3
**Overall Status:** PASS ✅

---

Note: This is a focused NFR-specific audit per request — covering select projections, take limits, timing tests, and security headers only. It does not run tests or CI workflows; it verifies evidence in the implementation and test files.

## Executive Summary

**Assessment:** 4 PASS, 2 LOW (pre-existing), 0 FAIL

**Blockers:** 0

**High Priority Issues:** 0

**Recommendation:** No NFR-specific issues introduced by Story 6.3. Two pre-existing LOW findings documented for awareness. No fixes required.

---

## NFR-Specific Audit (Focused Scope)

### 1. Select Projections (Prisma queries)

- **Status:** PASS ✅
- **Scope:** All Prisma calls in files modified by Story 6.3 (`agent.service.ts`, `agui-event-bridge.service.ts`).
- **Evidence:**
  - `agent.service.ts:321-329` — `prisma.turn.create({ data: {...}, select: { id: true } })` ✓
  - `agent.service.ts:330-334` — `prisma.conversation.update({ where: {...}, data: {...}, select: { id: true } })` ✓
- **Findings:** None. Both queries introduced/modified by Story 6.3 have `select: { id: true }` projections, consistent with the project-context.md pattern.

#### Pre-existing (not introduced by Story 6.3):

- **[LOW] `prisma.costRecord.create` in `CostTrackingService.recordCost()` lacks `select` projection** — `cost-tracking.service.ts:18` calls `prisma.costRecord.create({ data: {...} })` without `select`. The return value is unused, so the DB returns all scalar fields unnecessarily. Pre-existing from Story 3.11 (file last modified `1363ac4`); Story 6.3 calls `this.costTracking.recordCost(...)` but did not modify `CostTrackingService`. Remediation: add `select: { id: true }`. Below MEDIUM threshold — not recorded in deferred-work.md.

### 2. Take Limits (unbounded queries)

- **Status:** PASS ✅
- **Scope:** All Prisma calls and in-memory data structures in files modified by Story 6.3.
- **Evidence:**
  - No `findMany` / `findFirst` / `aggregate` queries introduced by Story 6.3.
  - In-memory structures (`segments` array, `toolCallRegistry` Map, `pendingClassifierPromises` array, `accumulatedText` string) are bounded by single-turn duration (circuit breaker 120s timeout) and cleared in `finally` block (`agent.service.ts:372-374`).
  - `onEventCallbacks` Map in event bridge is cleaned in `finally`/`stop()`/`onModuleDestroy()` (`agui-event-bridge.service.ts:195,215,236`).
- **Findings:** None.

### 3. Timing Tests

- **Status:** PASS ✅
- **Scope:** Circuit breaker timing and sentinel propagation for the sandbox-based execution path.
- **Evidence:**
  - Circuit breaker timing tested at event bridge level (`agui-event-bridge.service.spec.ts:174` — "fires after timeout with no events and terminates the agent session"; line 237 — "resets the circuit breaker timer on every received chunk"; line 303 — "emits RUN_ERROR only once"). Tests use `jest.advanceTimersByTimeAsync(120_000)` to simulate the 120s timeout.
  - Sentinel propagation tested at `runTurn()` level (`agent.service.unit.spec.ts:430` — `AGENT_STOPPED` rejection skips `RUN_ERROR`; line 448 — `AGENT_STREAM_TIMEOUT` rejection skips `RUN_ERROR`; line 468 — `MODULE_DESTROYING` rejection skips `RUN_ERROR` and `RUN_FINISHED`).
  - `AGENT_STREAM_TIMEOUT_MS` env var parsed at module load via IIFE pattern with `Number.isFinite` guard (`agui-event-bridge.service.ts:62-65`), consistent with project-context.md.
- **Findings:** None introduced by Story 6.3.

#### Pre-existing (not introduced by Story 6.3):

- **[LOW] No test for `AGENT_STREAM_TIMEOUT_MS` env var configuration** — all timing tests use the default 120s value. No test verifies that setting a custom `AGENT_STREAM_TIMEOUT_MS` env var changes the timeout behavior. Pre-existing from Story 6.2 (the IIFE parsing was added there). Below MEDIUM threshold — not recorded in deferred-work.md.

### 4. Security Headers

- **Status:** PASS ✅ (N/A — Story 6.3 does not touch HTTP endpoints)
- **Scope:** SSE response headers and command construction security.
- **Evidence:**
  - SSE security headers set in `StreamingController` (not modified by Story 6.3): `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`, `X-Content-Type-Options: nosniff` (`streaming.controller.ts:70-74`).
  - Command injection prevention: `buildAgentCommand()` shell-quotes the user message via `shellQuote()` (`agent.service.ts:436-437`). The `shellQuote` helper wraps in single quotes and escapes embedded quotes (`agent.service.ts:440-442`), consistent with the `SandboxService.shellQuote` pattern in project-context.md.
  - Credential isolation: platform credentials (`DATABASE_URL`, `AUTH_SECRET`, `DAYTONA_API_KEY`, `CREDENTIAL_ENCRYPTION_KEK`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`) are NOT interpolated into the command — they are injected into the sandbox environment by `SandboxService.provision()` (Story 6.1). Tested by 4 regression guard tests (`agent.service.unit.spec.ts:1330-1408` — credential-isolation + input-injection).
  - Command is never logged in production code (verified: no `logger.*command` or `logger.*prompt` calls in `agent.service.ts` or `agui-event-bridge.service.ts`).
  - Input size bounded: `SendMessageDto` caps message at `.max(10_000)` (`send-message.dto.ts:5`).
- **Findings:** None.

---

## Findings Summary

| NFR Category        | Status | Story-Introduced | Pre-existing (LOW) |
| ------------------- | ------ | ----------------- | ------------------- |
| Select Projections  | PASS ✅ | 0                 | 1 (`costRecord.create`) |
| Take Limits         | PASS ✅ | 0                 | 0                   |
| Timing Tests        | PASS ✅ | 0                 | 1 (env var config test) |
| Security Headers    | PASS ✅ | 0                 | 0                   |
| **Total**           | **PASS** | **0**           | **2**               |

**Gate Status:** PASS ✅

No MEDIUM+ findings introduced by Story 6.3. No fixes applied (no story-introduced NFR issues with straightforward remediation). No deferred-work.md entries needed (no MEDIUM+ unfixed findings). Two pre-existing LOW findings documented for awareness only.

---

## Related Artifacts

- **Story File:** `_bmad-output/implementation-artifacts/6-3-migrate-agentservice-to-sandbox-execution.md`
- **Evidence Sources:**
  - Implementation: `apps/agent-be/src/streaming/agent.service.ts`, `apps/agent-be/src/streaming/agui-event-bridge.service.ts`
  - Tests: `apps/agent-be/src/streaming/agent.service.unit.spec.ts`, `apps/agent-be/src/streaming/agui-event-bridge.service.spec.ts`
  - Pre-existing: `apps/agent-be/src/cost-tracking/cost-tracking.service.ts`, `apps/agent-be/src/conversations/dto/send-message.dto.ts`, `apps/agent-be/src/streaming/streaming.controller.ts`
  - Test results: 782 agent-be tests pass (verified during audit)

---

**Generated:** 2026-07-16
**Workflow:** testarch-nfr (Create mode, focused NFR scope)
