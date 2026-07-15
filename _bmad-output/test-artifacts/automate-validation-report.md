# Automate Validation Report — Story 6.1

**Date:** 2026-07-15
**Story:** 6.1 — Install sandbox-agent + Claude Code Binaries in Sandbox During Provision
**Mode:** Validate (coverage sufficient — no Create/Resume needed)
**Agent:** Murat (Master Test Architect)

---

## Executive Summary

| Metric | Count |
|---|---|
| Story 6.1 test files | 3 |
| Unit tests (Story 6.1) | 22 (all pass, 0 skipped) |
| Integration tests (Story 6.1) | 4 (all pass, 0 skipped) |
| Full unit suite | 717 pass, 0 skipped |
| Full sandbox-lifecycle integration suite | 18 pass, 0 skipped |
| Skipped tests in scope | 0 |
| Skipped tests out of scope (deferred) | 1 describe.skip (Story 4.5, external API) |
| Coverage verdict | SUFFICIENT — all automatable ACs covered |

**Outcome:** Validation PASS. No test generation (Create/Resume) required. No skipped tests in Story 6.1 scope. No production code edited.

---

## Step 1: Execution Mode & Context

- **Mode:** BMad-Integrated (story_file = `_bmad-output/implementation-artifacts/6-1-install-claude-code-binary-in-sandbox-during-provision.md`)
- **Story status:** review
- **Acceptance criteria:** 7 (AC-1 through AC-7)
- **Framework:** Jest 30 (unit, co-located) + Jest integration config (`test/jest-integration.config.ts`)
- **Test stack:** auto-detected, Nx-inferred `@nx/jest/plugin`
- **ATDD artifacts:** checklist at `_bmad-output/test-artifacts/atdd-checklist-6-1-...md` — RED/GREEN/REFACTOR phases all complete

---

## Step 2: Automation Targets & Coverage Mapping

### AC → Test mapping

| AC | Description | Test level | Test file(s) | Test count | Status |
|---|---|---|---|---|---|
| AC-1 | Binaries installed during provision | Unit + Integration | `sandbox.service.nfr-s1.spec.ts` (6), `sandbox-lifecycle.integration.spec.ts` (1) | 7 | ✅ PASS |
| AC-2 | ANTHROPIC_API_KEY + GITHUB_TOKEN injected | Unit + Integration | `sandbox.service.nfr-s1.spec.ts` (4), `sandbox-lifecycle.integration.spec.ts` (1) | 5 | ✅ PASS |
| AC-3 | networkAllowList egress control | Unit + Integration | `sandbox.service.nfr-s1.spec.ts` (2), `sandbox-lifecycle.integration.spec.ts` (1) | 3 | ✅ PASS |
| AC-4 | Provision sequence extended | Integration | `sandbox-lifecycle.integration.spec.ts` (1) | 1 | ✅ PASS |
| AC-5 | ANTHROPIC_API_KEY fails loudly at startup | Unit | `env-example.spec.ts` (2), `env.validation.spec.ts` (4, pre-existing Story 4.5) | 6 | ✅ PASS |
| AC-6 | sandbox-agent version upgrade is PR-review checklist | N/A — manual checklist | (not automatable per story spec) | 0 | ✅ N/A |
| AC-7 | Fidelity audit findings F1–F3 fixed | Unit | `sandbox.service.nfr-s1.spec.ts` (F1: 3, F2: 2, F3: 2) | 7 | ✅ PASS |

**Coverage gaps:** None. All automatable ACs have tests. AC-6 is explicitly a manual PR-review checklist item (not an automated test) per the story spec.

### Duplicate coverage avoidance

- Unit tests assert at the SDK boundary (`mockDaytona.create.mock.calls`, `mockSandbox.process.executeCommand.mock.calls`) — pure contract verification.
- Integration tests assert through the full NestJS module wiring via `SandboxServiceFake` inspection methods — behavior verification.
- No redundant duplication: unit tests verify the `SandboxService` contract; integration tests verify the `ConversationsService` → `SandboxService` wiring.

---

## Step 3: Test Infrastructure

- **Mock factory:** `test/helpers/mock-daytona.ts` — `MockSandbox.fs.uploadFile` added (verified working).
- **Test-seam fake:** `test/helpers/sandbox-service.fake.ts` — inspection methods (`areBinariesInstalled`, `getProvisionedEnvVars`, `getNetworkAllowList`) + `destroy()` idempotency fix (verified working).
- **No new fixtures/factories/helpers needed** — existing infrastructure supports all Story 6.1 assertions.

---

## Step 4: Test Files Validated

### `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (unit)

- 22 Story 6.1 tests across 6 describe blocks (AC-1, AC-2, AC-3, AC-7 F1/F2/F3).
- All tests use `[P0]` priority tags.
- Tests assert on real mock interactions at the SDK boundary (high fidelity).
- Credential-isolation regression guards verify `envVars` contains ONLY `ANTHROPIC_API_KEY` + `GITHUB_TOKEN` — no platform-internal credentials leak.
- Input-injection guards verify binary install commands use constant paths (no user-controlled input).

### `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` (integration)

- 4 Story 6.1 tests (AC-1, AC-2, AC-3, AC-4) through full NestJS module wiring.
- F2 comment documents the fake's limitation (throws before allocation, not after).
- `CredentialsService` mock fixed (added `isCredentialHealthFailed`) — unblocked 9 pre-existing tests.

### `apps/agent-be/test/unit/env-example.spec.ts` (unit, NEW)

- 2 tests (AC-5) verifying `.env.example` exists and documents `ANTHROPIC_API_KEY`.
- The Zod env validation itself is tested in `env.validation.spec.ts` (Story 4.5 AC-7, 4 tests).

---

## Step 5: Test Validation & Healing (Skipped-Test Handling)

### Skipped tests in Story 6.1 scope

**None.** Grep for `describe.skip|test.skip|it.skip|.skip(|xit(|xdescribe(` across all 3 Story 6.1 test files returned zero matches. All scaffolds activated (RED→GREEN complete).

### Skipped tests out of scope (deferred)

**`apps/agent-be/test/integration/platform-env-vars.integration.spec.ts:181`** — `describe.skip` conditional on `hasPlatformTokens`.

- **Belongs to:** Story 4.5 (not Story 6.1).
- **Skip reason:** Requires `RAILWAY_TOKEN` + `VERCEL_TOKEN`; makes live calls to external platform APIs (Railway GraphQL, Vercel API) with side effects.
- **Decision (DP-5 + "Always escalate" rule):** Out of scope for Story 6.1 (scope temptation — defer, don't expand). Un-skipping would trigger calls to external services with side effects, which the decision policy says to always escalate. Tokens are absent in this environment. Recorded as a deferred finding — not un-skipped.

### Test execution results

| Suite | Total | Pass | Fail | Skip |
|---|---|---|---|---|
| Unit (full agent-be) | 717 | 717 | 0 | 0 |
| Integration (sandbox-lifecycle) | 18 | 18 | 0 | 0 |

### Healing

No healing required — all Story 6.1 tests pass on first run. No flaky patterns detected (deterministic mocks, no hard waits in unit tests; integration tests use standard `setImmediate`/`setTimeout(50)` for fire-and-forget async flushing).

---

## Step 6: Code Quality

| Check | Result |
|---|---|
| Typecheck (`nx typecheck agent-be`) | ✅ PASS |
| Lint (`nx lint agent-be`) | ✅ PASS (0 errors, 33 pre-existing warnings — none from Story 6.1 files) |
| Priority tags | ✅ All Story 6.1 tests tagged `[P0]` |
| Given-When-Then | ✅ Descriptive test names; unit tests assert pure contract |
| No flaky patterns | ✅ Deterministic mocks, no race conditions |
| No hardcoded production data | ✅ Test fixtures only (`sk-ant-test-key`, `fake-token`) |
| Test isolation | ✅ `beforeEach`/`afterEach` reset mocks + env vars |

---

## Test Fidelity Assessment

Verified against production code (`apps/agent-be/src/sandbox/sandbox.service.ts`):

- **`provision()`** — tests assert `daytona.create()` receives `envVars` + `networkAllowList` + `labels`; `installBinaries()` called after create. ✅ Real contract.
- **`installBinaries()`** — tests assert `fs.uploadFile`, `chmod +x`, `npm install -g @anthropic-ai/claude-code@<version>`, `--version` verification. ✅ Real contract.
- **`destroy()`** — tests assert `DaytonaNotFoundError` instanceof check (F1 fix). ✅ Real contract.
- **`resume()`** — tests assert `daytona.start()` rejection propagation (F3 fix). ✅ Real contract.
- **F2 (dead catch-block)** — tests assert `daytona.delete` NOT called on `create()` rejection. ✅ Real contract (branch removed).

No fabricated contracts. Tests exercise the real `SandboxService` implementation via the `mock-daytona` SDK-boundary mock.

---

## Completion Criteria

- [x] Execution mode determined (BMad-Integrated)
- [x] Framework configuration loaded and validated
- [x] Coverage analysis completed — no gaps
- [x] Automation targets identified (all 7 ACs mapped)
- [x] Test levels selected (unit + integration)
- [x] No duplicate coverage
- [x] Test priorities assigned (all P0)
- [x] Test files validated (3 files, 29 Story 6.1 tests)
- [x] Skipped tests handled (0 in scope; 1 out-of-scope deferred)
- [x] Quality standards enforced (typecheck + lint pass)
- [x] Test fidelity verified (tests exercise real production contract)
- [x] No production code edited

---

## Deferred Findings

1. **Story 4.5 platform-env-vars skipped tests** — `describe.skip` in `platform-env-vars.integration.spec.ts` requires real platform tokens and makes external API calls with side effects. Out of scope for Story 6.1. Escalation required to un-skip (external side effects per decision policy). Not actionable in this run.

---

## Decision Record

**Decision (DP-5 + "Always escalate"):** The `describe.skip` in `platform-env-vars.integration.spec.ts` (Story 4.5) was not un-skipped. It is out of scope for Story 6.1 (DP-5: scope temptation), and un-skipping would trigger calls to external services with side effects (Railway/Vercel APIs), which the decision policy mandates escalating. Tokens are absent in this environment. Recorded as a deferred finding.

---

## Next Steps

- Story 6.1 test validation is complete. Coverage is sufficient — no Create/Resume generation needed.
- The story is ready for review sign-off (status: `review`).
- The deferred platform-env-vars skip is a Story 4.5 concern, not a Story 6.1 blocker.
