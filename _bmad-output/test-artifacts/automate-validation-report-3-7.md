---
story: '3.7'
title: 'Receive Real-Time Credential Failure Alerts Mid-Conversation'
date: '2026-07-05'
mode: 'Validate → Create'
agent: 'Master Test Architect'
---

# Automate Validation Report — Story 3.7

## Summary

| Metric                  | Before | After | Delta |
| ----------------------- | ------ | ----- | ----- |
| agent-be tests          | 127    | 136   | +9    |
| web tests               | 644    | 646   | +2    |
| Skipped/disabled tests  | 0      | 0     | 0     |
| Lint errors (new)       | 0      | 0     | 0     |
| Typecheck errors        | 0      | 0     | 0     |

**Verdict: PASS** — Story 3.7 is sufficiently covered. All 5 ACs have test coverage. 11 new tests generated for edge-case pattern coverage and defensive paths.

---

## Step 1: Execution Mode & Context

- **Mode:** BMad-Integrated (story file loaded)
- **Story:** `_bmad-output/implementation-artifacts/3-7-receive-real-time-credential-failure-alerts-mid-conversation.md`
- **Story status:** review (all 16 tasks marked complete)
- **Decision policy:** `_bmad-output/decision-policy.md` loaded
- **Framework:** Jest 30 (unit/integration, co-located), Playwright (E2E — deferred per DP-5)

---

## Step 2: Skipped/Disabled Test Audit

Searched all Story 3.7 test files for: `test.skip`, `it.skip`, `describe.skip`, `xit`, `xdescribe`, `test.fixme`, `it.fixme`, `.only()`, `test.todo`, `it.todo`.

**Result: 0 skipped tests.** Three files contain stale TDD red-phase header comments mentioning `it.skip()` / `test.skip()`, but no tests are actually skipped — all `it()` calls are active. The stale comments are in:
- `agent.service.unit.spec.ts` (line 15)
- `ConversationPane.test.tsx` (line 18)
- `tool-pill-classifier.service.spec.ts` (inherited from Story 3.4 header)

No healing required.

---

## Step 3: AC Coverage Map

### AC-1: 401 detection emits `CREDENTIAL_FAILURE` and persists failed credential health (NFR-R1) — PASS

| Test                                                                 | File                                        | Priority |
| -------------------------------------------------------------------- | ------------------------------------------- | -------- |
| returns CredentialFailureEvent for "remote: Invalid username or token" | tool-pill-classifier.service.spec.ts        | P0       |
| calls credentialsService.markCredentialFailed(userId, ...)           | tool-pill-classifier.service.spec.ts        | P0       |
| returns CredentialFailureEvent (not ToolCallPromotedEvent) on git commit with 401 | tool-pill-classifier.service.spec.ts  | P0       |
| emits CREDENTIAL_FAILURE on SSE when classifier returns event        | agent.service.unit.spec.ts                  | P0       |
| CREDENTIAL_FAILURE emitted before RUN_FINISHED                       | agent.service.unit.spec.ts                  | P0       |
| markCredentialFailed calls updateMany with correct where/data        | credentials.service.spec.ts                 | P0       |
| markCredentialFailed with capturedAt adds updatedAt: { lt: capturedAt } | credentials.service.spec.ts               | P0       |
| markCredentialFailed does NOT throw when updateMany fails           | credentials.service.spec.ts                 | P0       |
| markCredentialFailed no-op when no RepoConnection exists             | credentials.service.spec.ts                 | P0       |
| CREDENTIAL_FAILURE event shows CredentialErrorBanner                 | ConversationPane.test.tsx                   | P0       |
| CREDENTIAL_FAILURE marks failing tool pill as error state            | ConversationPane.test.tsx                   | P0       |
| CREDENTIAL_FAILURE for non-existent toolCallId does not crash        | ConversationPane.test.tsx                   | P0       |
| markCredentialFailed called with capturedAt Date argument            | tool-pill-classifier.service.spec.ts        | P1       |
| **[NEW]** CredentialFailureEvent for "remote: Anonymous authentication" | tool-pill-classifier.service.spec.ts     | P1       |
| **[NEW]** CredentialFailureEvent for "fatal: Authentication failed for" | tool-pill-classifier.service.spec.ts     | P1       |
| **[NEW]** CredentialFailureEvent for "fatal: could not read Username for" | tool-pill-classifier.service.spec.ts   | P1       |
| **[NEW]** CredentialFailureEvent for "401 Unauthorized"             | tool-pill-classifier.service.spec.ts        | P1       |
| **[NEW]** markCredentialFailed throws → classifier throws (defensive) | tool-pill-classifier.service.spec.ts       | P1       |

### AC-2: 403 classification emits `ACCESS_DENIED` without marking credential failed (FINDING-12) — PASS

| Test                                                                 | File                                        | Priority |
| -------------------------------------------------------------------- | ------------------------------------------- | -------- |
| returns AccessDeniedEvent with code RATE_LIMITED                     | tool-pill-classifier.service.spec.ts        | P0       |
| returns AccessDeniedEvent with code ORG_RESTRICTION                  | tool-pill-classifier.service.spec.ts        | P0       |
| returns AccessDeniedEvent with code INSUFFICIENT_PERMISSION          | tool-pill-classifier.service.spec.ts        | P0       |
| does NOT call markCredentialFailed on 403 detection (FINDING-12)     | tool-pill-classifier.service.spec.ts        | P0       |
| emits ACCESS_DENIED on SSE when classifier returns event            | agent.service.unit.spec.ts                  | P0       |
| ACCESS_DENIED emitted before RUN_FINISHED                            | agent.service.unit.spec.ts                  | P0       |
| retryAfter extracted from rate-limit output                          | tool-pill-classifier.service.spec.ts        | P1       |
| **[NEW]** RATE_LIMITED for "secondary rate limit" pattern             | tool-pill-classifier.service.spec.ts        | P1       |
| **[NEW]** RATE_LIMITED for "abuse detection" pattern                 | tool-pill-classifier.service.spec.ts        | P1       |
| **[NEW]** ORG_RESTRICTION for "org policy" pattern                   | tool-pill-classifier.service.spec.ts        | P1       |
| **[NEW]** INSUFFICIENT_PERMISSION for bare "403" pattern             | tool-pill-classifier.service.spec.ts        | P1       |

### AC-3: Frontend handles `CREDENTIAL_FAILURE` — re-auth prompt without navigation away — PASS

| Test                                                                 | File                                        | Priority |
| -------------------------------------------------------------------- | ------------------------------------------- | -------- |
| CREDENTIAL_FAILURE event shows CredentialErrorBanner                 | ConversationPane.test.tsx                   | P0       |
| CREDENTIAL_FAILURE marks failing tool pill as error state            | ConversationPane.test.tsx                   | P0       |
| CREDENTIAL_FAILURE for non-existent toolCallId does not crash        | ConversationPane.test.tsx                   | P0       |
| CredentialErrorBanner "Update access token" link opens re-auth dialog | ConversationPane.test.tsx                 | P1       |
| credentialFailed state resets on new session start                   | ConversationPane.test.tsx                   | P1       |
| **[NEW]** callbackUrl passed to reauthorizeGitHub when provided      | CredentialErrorBanner.test.tsx              | P1       |
| **[NEW]** reauthorizeGitHub called with undefined when no callbackUrl | CredentialErrorBanner.test.tsx            | P1       |

### AC-4: Frontend handles `ACCESS_DENIED` — error-state Tool Pill + Access Notice, no banner, no halt — PASS

| Test                                                                 | File                                        | Priority |
| -------------------------------------------------------------------- | ------------------------------------------- | -------- |
| ACCESS_DENIED renders AccessNotice below failing tool pill           | ConversationPane.test.tsx                   | P0       |
| ACCESS_DENIED does NOT show CredentialErrorBanner                    | ConversationPane.test.tsx                   | P0       |
| ACCESS_DENIED does NOT disable chat input                            | ConversationPane.test.tsx                   | P0       |
| ACCESS_DENIED does NOT halt agent turn                               | ConversationPane.test.tsx                   | P0       |
| ACCESS_DENIED with ORG_RESTRICTION renders org-restriction copy      | ConversationPane.test.tsx                   | P0       |
| ACCESS_DENIED with INSUFFICIENT_PERMISSION renders copy             | ConversationPane.test.tsx                   | P0       |
| AccessNotice copy for RATE_LIMITED                                   | AccessNotice.test.tsx                       | P0       |
| AccessNotice copy for ORG_RESTRICTION                                | AccessNotice.test.tsx                       | P0       |
| AccessNotice copy for INSUFFICIENT_PERMISSION                        | AccessNotice.test.tsx                       | P0       |
| AccessNotice retry hint when retryAfter present                      | AccessNotice.test.tsx                       | P0       |
| AccessNotice no retry hint when retryAfter absent                    | AccessNotice.test.tsx                       | P0       |
| AccessNotice Dismiss button hides notice                             | AccessNotice.test.tsx                       | P0       |
| AccessNotice caution-bg/caution border for RATE_LIMITED/ORG_RESTRICTION | AccessNotice.test.tsx                    | P0       |
| AccessNotice negative-bg/negative border for INSUFFICIENT_PERMISSION | AccessNotice.test.tsx                     | P0       |
| AccessNotice role="status" + aria-live="polite"                      | AccessNotice.test.tsx                       | P0       |
| AccessNotice Dismiss button has standard focus ring                  | AccessNotice.test.tsx                       | P0       |

### AC-5: Daytona outage does not break Project Map / Artifact Browser — PASS (architecture invariant)

No new code introduced. Project Map and Artifact Browser remain pure Postgres reads with no Sandbox dependency. This AC is a regression guard verified by code inspection — no new Sandbox imports in `project-map/page.tsx` or `artifacts/page.tsx`.

---

## Step 4: Coverage Gaps Identified & Filled

### Gap 1: `isCredentialFailureOutput` — 4 of 5 401 patterns untested

The production code checks 5 regex patterns for 401 detection. Only 1 (`remote: Invalid username or token`) was tested. Added P1 tests for the remaining 4:
- `remote: Anonymous authentication`
- `fatal: Authentication failed for`
- `fatal: could not read Username for`
- `401 Unauthorized`

### Gap 2: `classifyAccessDenied` — 4 sub-patterns untested

The production code classifies 403s into 3 codes using multiple sub-patterns. Only the primary patterns were tested. Added P1 tests for:
- `secondary rate limit` → RATE_LIMITED
- `abuse detection` → RATE_LIMITED (with 403 guard prefix — GitHub always includes a 403 status)
- `org.*policy` → ORG_RESTRICTION
- bare `403` → INSUFFICIENT_PERMISSION

### Gap 3: `markCredentialFailed` throws — defensive test for unreachable path

The story's Testing Requirements explicitly ask for: "Test both paths: `markCredentialFailed` succeeds (event emits) and `markCredentialFailed` throws despite its try/catch (event does NOT emit — the classifier method throws, `.catch()` in AgentService logs, run continues)." The success path was covered; the throw path was not. Added a P1 classifier-level test verifying the classifier propagates the error when `markCredentialFailed` throws.

### Gap 4: `callbackUrl` prop on CredentialErrorBanner — untested

Task 10.6 added an optional `callbackUrl` prop to `CredentialErrorBanner` so re-auth returns the user to the conversation. No test verified the prop is passed to `reauthorizeGitHub`. Added 2 P1 tests:
- `callbackUrl` is passed to `reauthorizeGitHub` when provided
- `reauthorizeGitHub` called with `undefined` when `callbackUrl` not provided (backward compatibility)

---

## Step 5: Test Execution Results

### agent-be

```
Test Suites: 9 passed, 9 total
Tests:       136 passed, 136 total
```

### web

```
Test Suites: 54 passed, 54 total
Tests:       646 passed, 646 total
```

### Lint

- agent-be: 0 errors, 15 pre-existing warnings
- web: 1 pre-existing error (CredentialErrorBanner.test.tsx:41 — `no-empty-function`), 0 new errors

### Typecheck

- `apps/agent-be/tsconfig.app.json`: clean
- `apps/web/tsconfig.json`: clean

---

## Step 6: Files Modified

### New test cases added (no existing tests modified):

- `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` — +9 tests (4 additional 401 patterns, 4 additional 403 sub-patterns, 1 markCredentialFailed throws defensive test)
- `apps/web/src/components/project-map/CredentialErrorBanner.test.tsx` — +2 tests (callbackUrl prop forwarding)

### Production code: NOT modified

Per instruction, no production code was edited.

---

## Decision Records

**Decision (DP-4):** Added 11 new test cases as P1 edge-case coverage to existing test files. No existing tests were modified. Test-only changes with no production behavior change. Per DP-4, decided autonomously.

**Decision (DP-2):** The "abuse detection" 403 sub-pattern test initially used output `'abuse detection mechanism triggered'` alone, which failed because `classifyAccessDenied` has a guard clause requiring `403|Permission denied|Resource not accessible|Rate limit` to be present first. This is correct production behavior — GitHub's abuse detection messages always include a 403 status or "Rate limit" prefix. Amended the test to use `'403 Forbidden: abuse detection mechanism triggered'` (realistic output). Followed semantic intent over literal text.

---

## Completion Criteria

- [x] Execution mode determined (BMad-Integrated)
- [x] All ACs mapped to test scenarios
- [x] Skipped/disabled test audit completed (0 found)
- [x] Coverage gaps identified (4 gaps)
- [x] Missing tests generated (11 new tests)
- [x] All tests pass (136 + 646 = 782 total)
- [x] Lint clean (0 new errors)
- [x] Typecheck clean
- [x] No production code modified
- [x] Decisions recorded per decision-policy.md
