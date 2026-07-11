---
title: 'Split real-service happy-path spec into functional smoke + NFR performance specs'
type: 'refactor'
created: '2026-07-11'
status: 'done'
baseline_commit: '05de3cd900977442a09a6b839207f2a3103f9e62'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The real-service happy-path spec combines functional and NFR assertions in a single test. A slow environment fails NFR-P1 before reaching the content check, and a functional break (error message rendered as `<p>`) satisfies the first-token selector — producing misleading pass/fail status that does not reflect whether the happy path actually worked.

**Approach:** Split into two specs: a functional smoke test that asserts real response content ("hello"), and an NFR performance spec with NFR-P1 and NFR-P2 as separate tests. The NFR first-token detection excludes `role="status"` paragraphs (system/error messages) to prevent false greens from error output.

## Boundaries & Constraints

**Always:**
- Both specs retain `@real-service` tag and `PLAYWRIGHT_REAL_SERVICE` skip guard.
- Functional smoke test asserts response content ("hello"), not just "any non-empty paragraph."
- NFR spec tests NFR-P1 and NFR-P2 as separate `test()` calls.
- NFR-P1 first-token detection excludes `<p role="status">` elements (system/error messages rendered by `ChatMessageList` for `role: 'system'` messages).
- NFR-P1 includes post-hoc validation: after measuring first-token latency, wait for run to finish and verify response contained "hello" to confirm the measurement was on a real response, not an error.
- Selectors follow role/text-resilience hierarchy (getByRole > getByText).
- Shared helpers (`sendMessage`, `waitForSessionReady`) duplicated in both files — consistent with `streaming-chat.spec.ts` local-helper pattern.

**Ask First:** None.

**Never:**
- Never add NFR timing assertions to the functional smoke test.
- Never use `<p role="status">` paragraphs for first-token detection.
- Never create a shared helper file for two specs — duplicate small helpers instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Functional success | Agent returns "hello" | Content check passes, run finishes, working tree updates | N/A |
| Agent error (binary fails) | Error message rendered as `<p role="status">` | Content check fails — "hello" not found | Test fails, no false green |
| NFR-P1 slow environment | First real token >1500ms | NFR-P1 assertion fails with actual latency reported | Test fails, reports actual latency |
| NFR-P1 error before real token | Error `<p role="status">` appears before agent text | First-token detection skips `role="status"` paragraph; post-hoc "hello" check fails | Test fails, no false green |

</frozen-after-approval>

## Code Map

- `playwright/e2e/real-service/happy-path.spec.ts` — DELETE, replaced by two new specs
- `playwright/e2e/real-service/functional-smoke.spec.ts` — CREATE, functional smoke test asserting real response content
- `playwright/e2e/real-service/nfr-performance.spec.ts` — CREATE, NFR-P1 and NFR-P2 as separate tests
- `apps/web/src/components/conversation/ChatMessageList.tsx` — READ ONLY, confirms system messages render as `<p role="status">` (line 80), agent messages via react-markdown `<p>` without `role` (line 104 → `AgentMessage.tsx` line 33)
- `playwright/e2e/conversation/streaming-chat.spec.ts` — READ ONLY, selector and helper patterns reference

## Tasks & Acceptance

**Execution:**
- [x] `playwright/e2e/real-service/functional-smoke.spec.ts` -- CREATE functional smoke test: provision → SESSION_READY → send "Reply with the single word: hello" → wait for run to finish (Send button reappears) → assert response contains "hello" (case-insensitive, in `<p>` inside `[aria-live="polite"]`, skipping intro prompt and `role="status"` paragraphs) → verify working tree indicator visible. No timing assertions.
- [x] `playwright/e2e/real-service/nfr-performance.spec.ts` -- CREATE NFR performance spec with two separate tests: (1) NFR-P2 chat ready ≤10s — navigate → wait SESSION_READY → assert elapsed; (2) NFR-P1 first token ≤1500ms — navigate → wait SESSION_READY (setup only) → send message → wait for first non-empty `<p>` excluding `role="status"` and intro prompt → assert elapsed → wait run finish → assert response contains "hello" (post-hoc validation).
- [x] `playwright/e2e/real-service/happy-path.spec.ts` -- DELETE, replaced by the two new specs.

**Acceptance Criteria:**
- Given the agent returns "hello", when the functional smoke test runs, then the content assertion passes and no NFR timing is checked.
- Given an error message renders as `<p role="status">` in the aria-live region, when the functional smoke test runs, then the content assertion fails (no false green).
- Given the first real token arrives within 1500ms, when the NFR-P1 test runs, then the assertion passes and post-hoc "hello" validation confirms the measurement was on a real response.
- Given an error `<p role="status">` appears before any agent text, when the NFR-P1 first-token detection runs, then the error paragraph is skipped and the post-hoc "hello" check fails the test (no false green).
- Given NFR-P1 and NFR-P2 are separate tests, when one fails, then the other is unaffected.

## Design Notes

System messages (RUN_ERROR, STREAM_ERROR) render as `<p role="status">` inside `[aria-live="polite"]` (ChatMessageList.tsx line 80). Agent messages render via react-markdown as `<p>` without `role` (AgentMessage.tsx line 33). This `role="status"` attribute is the reliable discriminator for excluding error output from first-token detection:

```typescript
// Skip system/error messages — they have role="status"
if (p.getAttribute('role') === 'status') continue;
// Skip the intro prompt
if (text.includes('browse available skills')) continue;
```

The functional smoke test uses "wait for Send button" as a WAIT (not an assertion) — it confirms the run completed without hanging. The content check ("hello") is the sole assertion that gates pass/fail. If the agent errors, the Send button reappears (wait completes), then the content check fails (assertion fails).

## Verification

**Commands:**
- `npx playwright test --list playwright/e2e/real-service/` -- expected: two spec files listed (functional-smoke, nfr-performance), no happy-path.spec.ts
- `npx tsc --noEmit -p tsconfig.json` -- expected: no type errors in new spec files

**Manual checks:**
- Verify both new specs have `@real-service` tag and `PLAYWRIGHT_REAL_SERVICE` skip guard
- Verify functional-smoke.spec.ts has no timing assertions (no `performance.now()` or `toBeLessThanOrEqual`)
- Verify nfr-performance.spec.ts has two separate `test()` calls (NFR-P1, NFR-P2)
- Verify NFR-P1 first-token detection excludes `role="status"` paragraphs

## Suggested Review Order

**False-green prevention (core design decision)**

- `closest('[role="status"]')` catches both `<p role="status">` (system errors) and `<p>` inside `<div role="status">` (AccessNotice)
  [`nfr-performance.spec.ts:139`](../../playwright/e2e/real-service/nfr-performance.spec.ts#L139)

- Same exclusion in the functional content check — defense-in-depth
  [`functional-smoke.spec.ts:120`](../../playwright/e2e/real-service/functional-smoke.spec.ts#L120)

- Same exclusion in the post-hoc validation — guards NFR measurement integrity
  [`nfr-performance.spec.ts:175`](../../playwright/e2e/real-service/nfr-performance.spec.ts#L175)

**Functional gate (sole pass/fail assertion)**

- Content check asserts "hello" — the real response content, not just any non-empty paragraph
  [`functional-smoke.spec.ts:123`](../../playwright/e2e/real-service/functional-smoke.spec.ts#L123)

- Stop→Send button wait confirms run started then finished (prevents pre-RUN_STARTED race)
  [`functional-smoke.spec.ts:96`](../../playwright/e2e/real-service/functional-smoke.spec.ts#L96)

**NFR isolation (separate tests)**

- NFR-P1: first token ≤1500ms with post-hoc "hello" validation
  [`nfr-performance.spec.ts:99`](../../playwright/e2e/real-service/nfr-performance.spec.ts#L99)

- NFR-P2: chat ready ≤10s (isolated from functional gate)
  [`nfr-performance.spec.ts:78`](../../playwright/e2e/real-service/nfr-performance.spec.ts#L78)
