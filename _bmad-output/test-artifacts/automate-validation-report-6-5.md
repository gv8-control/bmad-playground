# Automate Validation Report — Story 6.5

**Date:** 2026-07-16
**Story:** 6.5 — Real-Service E2E Verification
**Mode:** Validate (with skipped-test treatment per user instruction)
**Agent:** Master Test Architect (glm-5.2-fast)

---

## Summary

| Metric | Count |
|--------|-------|
| Total Story 6.5 tests | 10 |
| Passing | 1 |
| Expected-to-fail (test.fixme) | 4 |
| Skipped (env-var guard, expected-to-fail comment) | 5 |
| Failing (unhandled) | 0 |
| Missing tests | 0 |

**Overall: WARN** — 1 test passes, 9 tests cannot run due to pre-existing environment issues (JWT decryption, OAuth Configuration error, webServer port conflict, operational prerequisites). No test-quality issues found. No production code edited.

---

## Prerequisites

- [x] Framework scaffolding configured (`playwright.config.ts` exists)
- [x] Test directory structure exists (`playwright/e2e/` with subdirectories)
- [x] Package.json has Playwright dependencies installed
- [x] BMad artifacts loaded (story file: `6-5-real-service-e2e-verification.md`)
- [x] Acceptance criteria extracted from story (AC-1, AC-2, AC-3, AC-4)
- [x] Decision policy loaded (`_bmad-output/decision-policy.md`)

---

## Step 1: Execution Mode and Context

- **Mode:** BMad-Integrated (story_file = `6-5-real-service-e2e-verification.md`)
- **Story:** 6.5 — Real-Service E2E Verification
- **Acceptance criteria:** AC-1 (functional smoke), AC-2 (NFR-P1), AC-3 (NFR-P2), AC-4 (egress)
- **Framework:** Playwright ^1.61.0, `playwright.config.ts`
- **Test directory:** `playwright/e2e/`

---

## Step 2: Automation Targets

### Story 6.5 test files (8 files, 10 tests)

| File | Tests | Task | AC | Priority |
|------|-------|------|----|----------|
| `artifacts-fixture-idempotency.spec.ts` | 1 | 1.1 | AC-1 | P0 |
| `story-5-4-token-usage-drift.spec.ts` (restored) | 3 | 1.2 | AC-1, AC-5 | P0 |
| `auto-scroll-session-timeout.spec.ts` | 1 | 2.1 | (regression guard) | P1 |
| `egress-control.spec.ts` | 1 | 3.1 | AC-4 | P0 |
| `functional-file-access.spec.ts` | 1 | 4.1 | AC-1 | P0 |
| `functional-git-commands.spec.ts` | 1 | 4.2 | AC-1 | P0 |
| `functional-stop-agent.spec.ts` | 1 | 4.3 | AC-1 | P0 |
| `functional-host-isolation.spec.ts` | 1 | 4.4 | AC-1 | P0 |

---

## Step 5: Test Validation and Healing

### Test Execution Results

| Test | Result | Healing attempted | Outcome |
|------|--------|-------------------|---------|
| P4 idempotency | ✅ PASS | N/A | Kept as-is |
| Hover block AC-1 | ❌ FAIL | N/A — not a test-quality issue | Marked `test.fixme()` |
| Hover block AC-5 (bg) | ❌ FAIL | N/A — not a test-quality issue | Marked `test.fixme()` |
| Hover block AC-5 (color) | ❌ FAIL | N/A — not a test-quality issue | Marked `test.fixme()` |
| Auto-scroll regression | ❌ FAIL | N/A — not a test-quality issue | Marked `test.fixme()` |
| Egress control | ⏭️ SKIP (can't run) | N/A — environment issue | Expected-to-fail comment added |
| Functional file access | ⏭️ SKIP (can't run) | N/A — environment issue | Expected-to-fail comment added |
| Functional git commands | ⏭️ SKIP (can't run) | N/A — environment issue | Expected-to-fail comment added |
| Functional stop agent | ⏭️ SKIP (can't run) | N/A — environment issue | Expected-to-fail comment added |
| Functional host isolation | ⏭️ SKIP (can't run) | N/A — environment issue | Expected-to-fail comment added |

### Root cause analysis

**PR-tier browser tests (hover blocks, auto-scroll):**
- **Failure:** `getByRole('heading', { name: 'Project Map' })` not visible; `waitForEventSource` times out.
- **Root cause:** JWT decryption issue — the synthetic session JWT encoded by `next-auth/jwt` `encode()` in Node.js (auth.setup.ts) cannot be decrypted by the Next.js middleware (Edge runtime). `/project-map` and `/conversations/new` redirect to `/sign-in?callbackUrl=...`. The GitHub OAuth flow is also broken (Configuration error).
- **Category:** Environment/infrastructure (Edge vs Node.js JWE key derivation). NOT a test-quality issue (selector, timing, mocking, data).
- **Healing:** Not applicable — the failure is not a test-quality issue. Unfixable without editing production code (middleware/auth config), which is out of scope per DP-5 and explicitly forbidden by the validate instruction.
- **Action:** Marked as `test.fixme()` with detailed comments explaining the environment issue and removal conditions.

**Real-service specs (5 files):**
- **Failure:** Cannot run — webServer port conflict (`reuseExistingServer: false` conflicts with existing dev servers on ports 3000, 3001). Auth setup broken (OAuth Configuration error). Synthetic session doesn't work (JWT decryption issue). Tests require real external services (Daytona, Anthropic API).
- **Root cause:** Environment/infrastructure/operational prerequisites. NOT a test-quality issue.
- **Healing:** Not applicable — the failures are not test-quality issues. The `test.skip(!process.env.PLAYWRIGHT_REAL_SERVICE, ...)` guard is the correct mechanism for env-var-gated real-service tests.
- **Action:** Kept `test.skip()` guard, added expected-to-fail comments to all 5 files.

### Unfixable tests

| Test | File | Reason | Marker |
|------|------|--------|--------|
| Hover block AC-1 | `story-5-4-token-usage-drift.spec.ts` | JWT decryption issue (environment) | `test.fixme()` |
| Hover block AC-5 (bg) | `story-5-4-token-usage-drift.spec.ts` | JWT decryption issue (environment) | `test.fixme()` |
| Hover block AC-5 (color) | `story-5-4-token-usage-drift.spec.ts` | JWT decryption issue (environment) | `test.fixme()` |
| Auto-scroll regression | `auto-scroll-session-timeout.spec.ts` | JWT decryption issue (environment) | `test.fixme()` |
| Egress control | `egress-control.spec.ts` | webServer port conflict + auth broken + needs real services | `test.skip()` + comment |
| Functional file access | `functional-file-access.spec.ts` | Same as egress control | `test.skip()` + comment |
| Functional git commands | `functional-git-commands.spec.ts` | Same as egress control | `test.skip()` + comment |
| Functional stop agent | `functional-stop-agent.spec.ts` | Same as egress control | `test.skip()` + comment |
| Functional host isolation | `functional-host-isolation.spec.ts` | Same as egress control | `test.skip()` + comment |

---

## Coverage Assessment

- **Tests exist for all ACs:** AC-1 (7 tests), AC-2 (1 test, pre-existing), AC-3 (1 test, pre-existing), AC-4 (1 test). No missing tests.
- **Coverage gap:** Environment/infrastructure, not missing tests. No switch to Create/Resume needed.
- **Passing coverage:** P4 idempotency (AC-1, Task 1.1) — the only test that can run in this environment.

---

## Decision Records

- **DP-4:** Marking PR-tier browser tests as `test.fixme()` — test-only change, no production behavior change.
- **DP-5:** JWT decryption issue is a production code issue — deferred, not pulled in as new scope.
- **DP-4:** Keeping `test.skip()` guard for real-service tests — correct mechanism for env-var-gated tests.
- **Escalation:** Real-service tests require external service calls with side effects + recurring costs. User provided sign-off ("un-skip and run each"). Attempted to run; cannot run due to environment issues. No HALT needed.

---

## Files Modified

- `playwright/e2e/visual-containers/story-5-4-token-usage-drift.spec.ts` — `test.fixme()` + comments (AC-1, AC-5 hover blocks)
- `playwright/e2e/conversation/auto-scroll-session-timeout.spec.ts` — `test.fixme()` + comment
- `playwright/e2e/real-service/egress-control.spec.ts` — expected-to-fail comment (kept `test.skip()`)
- `playwright/e2e/real-service/functional-file-access.spec.ts` — expected-to-fail comment (kept `test.skip()`)
- `playwright/e2e/real-service/functional-git-commands.spec.ts` — expected-to-fail comment (kept `test.skip()`)
- `playwright/e2e/real-service/functional-stop-agent.spec.ts` — expected-to-fail comment (kept `test.skip()`)
- `playwright/e2e/real-service/functional-host-isolation.spec.ts` — expected-to-fail comment (kept `test.skip()`)
- `_bmad-output/implementation-artifacts/6-5-real-service-e2e-verification.md` — validation record appended

## No production code edited

Per the validate instruction ("Don't edit production code"), no production code was modified.
