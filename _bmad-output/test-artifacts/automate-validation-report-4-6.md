# Automate Validation Report — Story 4.6

**Date:** 2026-07-13
**Story:** 4.6 — Add the Manual-Trigger Deploy Step to CI
**Test File:** `apps/agent-be/test/unit/deploy-workflow.spec.ts`
**Workflow File:** `.github/workflows/deploy.yml`
**Mode:** Validate

---

## Summary

| Metric | Value |
| --- | --- |
| Total tests | 31 |
| Active tests | 31 |
| Skipped tests | 0 |
| Passing tests | 31 |
| Failing tests | 0 |
| Coverage gaps | 0 |
| Healing needed | No |
| Mode switch (Create/Resume) | No |

**Overall verdict: PASS**

---

## Skipped Test Check

Searched for `test.skip()`, `describe.skip()`, `xtest()`, `xdescribe()`, `test.todo()` in the test file.

**Result:** 0 skipped tests found. All 31 tests are active.

Per the user instruction to treat skipped tests as coverage failures: no action needed — no skipped tests exist.

---

## Test Execution

**Command:** `yarn nx test agent-be -- --testPathPattern=deploy-workflow`

**Result:** 411 passed, 411 total (31 deploy-workflow tests + 380 other agent-be tests). 0 failures, 0 regressions.

---

## Coverage Analysis

### AC-1: Manual trigger only, deploys both services (11 tests) — PASS

| Test | Status |
| --- | --- |
| workflow file exists and is valid YAML | PASS |
| workflow name is "Deploy to Production" | PASS |
| on: trigger is workflow_dispatch (string form) | PASS |
| on: trigger contains ONLY workflow_dispatch (object form) | PASS |
| on: trigger does NOT contain push | PASS |
| on: trigger does NOT contain pull_request | PASS |
| on: trigger does NOT contain schedule | PASS |
| workflow has a "deploy" job | PASS |
| deploy job runs on ubuntu-latest | PASS |
| deploy job includes a Vercel deploy step (apps/web) | PASS |
| deploy job includes a Railway deploy step (apps/agent-be) | PASS |

### AC-2: Quality gate dependency (6 tests) — PASS

| Test | Status |
| --- | --- |
| quality-gate verification step exists in the deploy job | PASS |
| quality-gate step is the FIRST step in the deploy job | PASS |
| quality-gate step uses gh run list --workflow=test.yml | PASS |
| quality-gate step checks for conclusion success | PASS |
| quality-gate step fails if no completed run exists | PASS |
| quality-gate step uses GH_TOKEN from GITHUB_TOKEN | PASS |

### AC-3: GitHub Environment with protection rules (1 test) — PASS

| Test | Status |
| --- | --- |
| deploy job uses environment: production | PASS |

**Note:** AC-3 also specifies required reviewers and branch restriction. These are GitHub Environment settings configured via `gh api`, not YAML properties — they cannot be tested via YAML structure validation. Required reviewers is deferred past MVP (GitHub billing plan limitation, recorded in story file and `deferred-work.md`). Branch restriction is configured via GitHub API and verified manually (Story Task 1.4). The 1 test covers what is testable in the YAML file.

### Security: permissions and concurrency (3 tests) — PASS

| Test | Status |
| --- | --- |
| permissions block is least-privilege (actions: read, contents: read) | PASS |
| concurrency group prevents concurrent deploys | PASS |
| deploy job has timeout-minutes set | PASS |

### Security: credential-isolation regression guards (5 tests) — PASS

| Test | Status |
| --- | --- |
| VERCEL_TOKEN is referenced only via secrets.*, never as a literal value | PASS |
| RAILWAY_TOKEN is referenced only via secrets.*, never as a literal value | PASS |
| no credential env-var names appear as literal values in run: blocks | PASS |
| no credential values appear in the workflow YAML (credential isolation) | PASS |
| VERCEL_PROJECT_ID and VERCEL_ORG_ID are in env: (not secrets, but not in run: blocks) | PASS |

### Security: input-injection regression guards (4 tests) — PASS

| Test | Status |
| --- | --- |
| github.ref_name is NOT directly interpolated in run: blocks | PASS |
| github.ref_name IS passed through env: intermediaries | PASS |
| branch name is safely quoted in shell commands (no unquoted $BRANCH) | PASS |
| no ${{ }} expressions in run: blocks except via env: intermediaries | PASS |

### Deployment summary step (1 test) — PASS

| Test | Status |
| --- | --- |
| deploy job includes a deployment summary step writing to GITHUB_STEP_SUMMARY | PASS |

---

## E2E Coverage Deferral

All three ACs are CI/CD configuration properties (YAML file structure + GitHub Environment settings), not browser-observable behavior. E2E deferral is justified and documented in the ATDD checklist. No browser-level mock pattern can simulate CI/CD workflow configuration or GitHub Environment protection rules.

---

## Checklist Evaluation

| Checklist Section | Result |
| --- | --- |
| Prerequisites: framework scaffolding | PASS — Jest configured, test directory structure exists |
| Step 1: Execution mode and context loading | PASS — BMad-Integrated mode, story loaded, ACs extracted |
| Step 2: Automation targets identified | PASS — ACs mapped to test scenarios, priorities assigned (all P0) |
| Step 3: Test infrastructure | N/A — no fixtures/factories needed (YAML structure validation tests) |
| Step 4: Test files generated | PASS — 31 unit tests in `apps/agent-be/test/unit/deploy-workflow.spec.ts` |
| Step 5: Test validation and healing | PASS — all tests pass, no healing needed |
| Step 6: Documentation | PASS — ATDD checklist documents test structure and execution |
| Quality checks | PASS — tests are deterministic, isolated, atomic, readable |
| Integration points | PASS — tests run in CI, no shared state, appropriate timeouts |

---

## Decisions

No decisions arose during validation. All tests pass, no skipped tests exist, no coverage gaps identified. No decision-policy.md consultation was needed.

---

## Conclusion

Coverage is sufficient. All 31 tests are active and passing. No mode switch to Create/Resume is needed. No healing is needed. No production code was modified.

**Decision (DP-4):** Test-only validation — no production code changes, no constraints on future work.
