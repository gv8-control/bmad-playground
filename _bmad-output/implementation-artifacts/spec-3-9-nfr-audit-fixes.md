---
title: 'Story 3.9 NFR Audit Fixes'
type: 'bugfix'
created: '2026-07-06'
status: 'done'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The NFR evidence audit on Story 3.9 found 4 issues: a missing `.unref()` on the idle timeout timer (HIGH), a missing event-ordering test for the happy-path save (MEDIUM), no upper bound on the `MID_SESSION_IDLE_TIMEOUT_MS` env var (LOW), and a missing test for `'reconnecting'` state preservation in the `onerror` handler (LOW).

**Approach:** Apply the 4 documented remediations from the Story 3.9 review findings, then verify with the existing test suites.

## Boundaries & Constraints

**Always:** Follow project-context.md timer hygiene rules (`.unref()` on all long-running timers). Follow the established `CIRCUIT_BREAKER_TIMEOUT_MS` IIFE pattern for env-configured thresholds. Use `jest.spyOn(sessionEvents, 'emit')` + `events.indexOf()` comparison for SSE event ordering assertions.

**Ask First:** None — all remediations are documented in the review findings with exact code changes.

**Never:** Do not modify production behavior beyond the documented fixes. Do not change DTOs, controllers, or the `StreamingController`. Do not introduce new files.

</frozen-after-approval>

## Code Map

- `apps/agent-be/src/sandbox/idle-timeout.service.ts` -- timer service, needs `.unref()` + upper bound on env IIFE
- `apps/agent-be/src/conversations/conversations.service.spec.ts` -- needs MANUAL_SAVE_SUCCEEDED ordering assertion in happy-path test
- `apps/web/src/components/conversation/ConversationPane.test.tsx` -- needs 'reconnecting' state preservation test
- `apps/agent-be/src/streaming/agent.service.ts` -- reference for the correct `.unref()` pattern (circuit breaker timer)

## Tasks & Acceptance

**Execution:**
- [ ] `apps/agent-be/src/sandbox/idle-timeout.service.ts` -- Add `timer.unref?.()` after `this.timers.set()` in `startTimer`; add upper bound (`<= 86_400_000`) to the `MID_SESSION_IDLE_TIMEOUT_MS` IIFE -- HIGH + LOW findings
- [ ] `apps/agent-be/src/conversations/conversations.service.spec.ts` -- Add `emitSpy` + `MANUAL_SAVE_SUCCEEDED` before `SESSION_TIMEOUT` ordering assertion to the "attempts save when working tree is dirty" test -- MEDIUM finding
- [ ] `apps/web/src/components/conversation/ConversationPane.test.tsx` -- Add test for `'reconnecting'` state preservation when `onerror` fires -- LOW finding

**Acceptance Criteria:**
- Given the idle timeout timer is started, when the process receives SIGTERM, then the timer does not block clean exit (`.unref()` applied)
- Given `MID_SESSION_IDLE_TIMEOUT_MS` is set to an absurdly large value, when the IIFE parses it, then it falls back to the default (upper bound enforced)
- Given a dirty working tree at mid-session timeout, when the save succeeds, then `MANUAL_SAVE_SUCCEEDED` is emitted before `SESSION_TIMEOUT` (test asserts ordering)
- Given the SSE state is `'reconnecting'`, when `onerror` fires, then the state remains `'reconnecting'` (test asserts preservation)

## Verification

**Commands:**
- `yarn nx test agent-be` -- expected: all tests pass including new assertions
- `yarn nx test web` -- expected: all tests pass including new 'reconnecting' test
- `yarn nx lint agent-be` -- expected: 0 errors
- `yarn nx lint web` -- expected: 0 errors
