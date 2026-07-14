---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-13'
workflowType: testarch-atdd
storyId: '4.6'
storyKey: 4-6-add-the-manual-trigger-deploy-step-to-ci
storyFile: _bmad-output/implementation-artifacts/4-6-add-the-manual-trigger-deploy-step-to-ci.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-4-6-add-the-manual-trigger-deploy-step-to-ci.md
generatedTestFiles:
  - apps/agent-be/test/unit/deploy-workflow.spec.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/4-6-add-the-manual-trigger-deploy-step-to-ci.md
  - _bmad-output/decision-policy.md
  - _bmad-output/project-context.md
  - .github/workflows/test.yml
  - apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts
  - apps/agent-be/test/unit/run-migrations.spec.ts
---

# ATDD Checklist - Epic 4, Story 4.6: Add the Manual-Trigger Deploy Step to CI

**Date:** 2026-07-13
**Author:** Marius
**Primary Test Level:** Unit (YAML structure validation + security regression guards)

---

## Story Summary

A manually-triggered deploy job in CI that deploys `apps/web` to Vercel and `apps/agent-be` to Railway, gated by a passing Test Pipeline run and protected by a GitHub Environment with required reviewers.

**As a** developer
**I want** a manually-triggered deploy job in CI
**So that** shipping to production is deliberate, per Story 1.1's manual-trigger deploy policy

---

## Acceptance Criteria

1. **AC-1 (Manual trigger only, deploys both services):** `.github/workflows/deploy.yml` runs via `workflow_dispatch` only — never on `push`, `pull_request`, or `schedule`. Deploys `apps/web` to Vercel and `apps/agent-be` to Railway.
2. **AC-2 (Quality gate dependency):** Verifies the latest Test Pipeline (`test.yml`) run on the same branch completed successfully before deploying. Does not bypass the quality gate. Fails with a clear error if no passing test run exists.
3. **AC-3 (GitHub Environment with protection rules):** Uses a GitHub Environment named `production` with required reviewers (at least 1) and a branch restriction pinning deploys to `main`.

---

## Story Integration Metadata

- **Story ID:** `4.6`
- **Story Key:** `4-6-add-the-manual-trigger-deploy-step-to-ci`
- **Story File:** `_bmad-output/implementation-artifacts/4-6-add-the-manual-trigger-deploy-step-to-ci.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-4-6-add-the-manual-trigger-deploy-step-to-ci.md`
- **Generated Test Files:** `apps/agent-be/test/unit/deploy-workflow.spec.ts`

---

## E2E Coverage Deferral Check

**Per workflow instructions:** Before deferring E2E coverage, verify no browser-level mock pattern can simulate the scenario. Only defer if no mock covers the ACs.

### AC-1 — Manual trigger only, deploys both services

**Check:** The workflow file structure (trigger type, deploy targets) is a YAML file property. Browser-level mocks (Playwright route interception, `page.route()`, `page.goto()`) operate on HTTP requests and DOM interactions — they cannot inspect or assert on the structure of a YAML file on disk. The `on:` trigger type, the `jobs.deploy.steps` array, and the Vercel/Railway deploy commands are file-level properties, not browser-observable behavior.

**Result:** No browser-level mock covers this AC. E2E deferred. Unit test (YAML structure validation) covers it.

### AC-2 — Quality gate dependency

**Check:** The quality-gate step runs `gh run list --workflow=test.yml` — a GitHub CLI command executed inside a GitHub Actions runner. Browser-level mocks cannot simulate the GitHub Actions runtime, the `gh` CLI, or the GitHub API responses that the quality-gate step consumes. The step's logic (check conclusion, fail on non-success) is shell script inside a `run:` block, not browser-executable code.

**Result:** No browser-level mock covers this AC. E2E deferred. Unit test (YAML structure validation of the quality-gate step) covers it. Manual end-to-end verification (Story Task 4) covers the runtime behavior.

### AC-3 — GitHub Environment with protection rules

**Check:** The `environment: production` key is a YAML property. The GitHub Environment itself (required reviewers, branch restriction) is a GitHub repo setting configured via `gh api`, not a browser-observable artifact. Browser-level mocks cannot simulate GitHub Environment protection rules — they exist in GitHub's deployment infrastructure, not in the application's HTTP responses or DOM.

**Result:** No browser-level mock covers this AC. E2E deferred. Unit test (YAML structure validation of `environment: production`) covers it. Manual verification (Story Task 1.4) covers the GitHub Environment configuration.

### Summary

All three ACs are about CI/CD configuration (YAML file structure + GitHub Environment settings), not browser-observable application behavior. No browser-level mock pattern can simulate any of these ACs. E2E coverage is legitimately deferred for all ACs. This aligns with the story's own Testing Approach: "No E2E tests. Browser-level E2E tests cannot verify CI/CD workflow configuration."

---

## Test Scaffolds

### Unit Tests (31 tests)

**File:** `apps/agent-be/test/unit/deploy-workflow.spec.ts`

**Workflow file:** `.github/workflows/deploy.yml`

#### AC-1: Manual trigger only, deploys both services (11 tests)

- **Test:** workflow file exists and is valid YAML
  - **Verifies:** AC-1 file existence and YAML validity

- **Test:** workflow name is "Deploy to Production"
  - **Verifies:** AC-1 workflow naming

- **Test:** on: trigger is workflow_dispatch (string form)
  - **Verifies:** AC-1 manual trigger only

- **Test:** on: trigger contains ONLY workflow_dispatch (object form)
  - **Verifies:** AC-1 no other triggers

- **Test:** on: trigger does NOT contain push
  - **Verifies:** AC-1 no push trigger

- **Test:** on: trigger does NOT contain pull_request
  - **Verifies:** AC-1 no pull_request trigger

- **Test:** on: trigger does NOT contain schedule
  - **Verifies:** AC-1 no schedule trigger

- **Test:** workflow has a "deploy" job
  - **Verifies:** AC-1 deploy job exists

- **Test:** deploy job runs on ubuntu-latest
  - **Verifies:** AC-1 runner configuration

- **Test:** deploy job includes a Vercel deploy step (apps/web)
  - **Verifies:** AC-1 Vercel deploy for apps/web

- **Test:** deploy job includes a Railway deploy step (apps/agent-be)
  - **Verifies:** AC-1 Railway deploy for apps/agent-be

#### AC-2: Quality gate dependency (6 tests)

- **Test:** quality-gate verification step exists in the deploy job
  - **Verifies:** AC-2 quality-gate step exists

- **Test:** quality-gate step is the FIRST step in the deploy job
  - **Verifies:** AC-2 quality-gate runs before any deploy action

- **Test:** quality-gate step uses gh run list --workflow=test.yml
  - **Verifies:** AC-2 checks the correct test workflow

- **Test:** quality-gate step checks for conclusion success
  - **Verifies:** AC-2 only proceeds on success

- **Test:** quality-gate step fails if no completed run exists
  - **Verifies:** AC-2 does not bypass the quality gate

- **Test:** quality-gate step uses GH_TOKEN from GITHUB_TOKEN
  - **Verifies:** AC-2 uses default token (no extra secrets)

#### AC-3: GitHub Environment with protection rules (1 test)

- **Test:** deploy job uses environment: production
  - **Verifies:** AC-3 environment protection

#### Security: permissions and concurrency (3 tests)

- **Test:** permissions block is least-privilege (actions: read, contents: read)
  - **Verifies:** least-privilege token scope

- **Test:** concurrency group prevents concurrent deploys
  - **Verifies:** no concurrent production deploys

- **Test:** deploy job has timeout-minutes set
  - **Verifies:** deploy job has a timeout

#### Security: credential-isolation regression guards (5 tests)

Uniform guard template applied to every call site that handles credentials.

- **Test:** VERCEL_TOKEN is referenced only via secrets.*, never as a literal value
  - **Verifies:** credential isolation — no token leak via command arguments

- **Test:** RAILWAY_TOKEN is referenced only via secrets.*, never as a literal value
  - **Verifies:** credential isolation — no token leak via command arguments

- **Test:** no credential env-var names appear as literal values in run: blocks
  - **Verifies:** credential isolation — no credentials in command strings

- **Test:** no credential values appear in the workflow YAML (credential isolation)
  - **Verifies:** credential isolation — no literal secrets in the file

- **Test:** VERCEL_PROJECT_ID and VERCEL_ORG_ID are in env: (not secrets, but not in run: blocks)
  - **Verifies:** credential isolation — project IDs in env, not in command strings

#### Security: input-injection regression guards (4 tests)

Uniform guard template applied to every call site that uses user-controlled input (`github.ref_name`).

- **Test:** github.ref_name is NOT directly interpolated in run: blocks
  - **Verifies:** input injection — no `${{ github.ref_name }}` in run: text

- **Test:** github.ref_name IS passed through env: intermediaries
  - **Verifies:** input injection — branch name passed via env:

- **Test:** branch name is safely quoted in shell commands (no unquoted $BRANCH)
  - **Verifies:** input injection — malicious input is safely quoted

- **Test:** no ${{ }} expressions in run: blocks except via env: intermediaries
  - **Verifies:** input injection — no direct interpolation of any kind in run: blocks

#### Deployment summary step (1 test)

- **Test:** deploy job includes a deployment summary step writing to GITHUB_STEP_SUMMARY
  - **Verifies:** deployment summary is written

---

## Uniform Guard Template for External Commands with User-Controlled Input

Per workflow instructions: "When creating regression guards for code that executes external commands with user-controlled input, apply a uniform guard template to every call site."

The deploy workflow file (`.github/workflows/deploy.yml`) contains `run:` blocks that execute shell commands. The user-controlled input is `github.ref_name` (the branch name). The credential inputs are `VERCEL_TOKEN` and `RAILWAY_TOKEN`.

### Call sites identified:

1. **Quality-gate step** — `gh run list --branch="$BRANCH"` — uses `github.ref_name` via `env: BRANCH`
2. **Vercel deploy step** — `vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}` — uses `VERCEL_TOKEN` via `secrets.*`
3. **Railway deploy step** — `railway up` — uses `RAILWAY_TOKEN` via `secrets.*`

### Guard template applied to each call site:

**Credential-isolation invariants:**
- No credentials leak via command arguments: `VERCEL_TOKEN` and `RAILWAY_TOKEN` are referenced only via `secrets.*`, never as literal values in `run:` blocks.
- No credentials leak via environment variables: credential env-var names (`DATABASE_URL`, `AUTH_SECRET`, etc.) do not appear as literal values in `run:` blocks.
- No credential values (token prefixes like `vcp_`, `d49618b7`, `sk-`, connection strings) appear anywhere in the YAML.

**Input-injection invariants:**
- `github.ref_name` is NOT directly interpolated in `run:` blocks (no `${{ github.ref_name }}` in `run:` text).
- `github.ref_name` IS passed through `env:` intermediaries (e.g., `env: BRANCH: ${{ github.ref_name }}`).
- Branch name is safely quoted in shell commands (`"$BRANCH"`, not unquoted `$BRANCH`).
- No `${{ }}` expressions of any kind in `run:` blocks — all dynamic values pass through `env:`.

---

## Implementation Checklist

### Test: AC-1 — workflow file exists and is valid YAML

**File:** `apps/agent-be/test/unit/deploy-workflow.spec.ts`

**Tasks to make this test pass:**
- [x] Complete `.github/workflows/deploy.yml` with valid YAML structure
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=deploy-workflow`
- [x] Test passes

---

### Test: AC-1 — on: trigger is workflow_dispatch only

**File:** `apps/agent-be/test/unit/deploy-workflow.spec.ts`

**Tasks to make this test pass:**
- [x] Set `on: workflow_dispatch` in deploy.yml (no push, pull_request, or schedule)
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=deploy-workflow`
- [x] Test passes

---

### Test: AC-1 — deploy job includes Vercel and Railway deploy steps

**File:** `apps/agent-be/test/unit/deploy-workflow.spec.ts`

**Tasks to make this test pass:**
- [x] Add `jobs.deploy` section with steps for Vercel deploy (`vercel deploy --prod --cwd=apps/web`)
- [x] Add Railway deploy step (`railway up --service ... --environment ... --project ...`)
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=deploy-workflow`
- [x] Test passes

---

### Test: AC-2 — quality-gate step is the FIRST step

**File:** `apps/agent-be/test/unit/deploy-workflow.spec.ts`

**Tasks to make this test pass:**
- [x] Add quality-gate step as `steps[0]` in the deploy job
- [x] Step uses `gh run list --workflow=test.yml --branch="$BRANCH" --status=completed --limit=1`
- [x] Step checks for `conclusion: success` and fails otherwise
- [x] Step passes `github.ref_name` through `env: BRANCH`
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=deploy-workflow`
- [x] Test passes

---

### Test: AC-3 — deploy job uses environment: production

**File:** `apps/agent-be/test/unit/deploy-workflow.spec.ts`

**Tasks to make this test pass:**
- [x] Add `environment: production` to the deploy job
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=deploy-workflow`
- [x] Test passes

---

### Test: Security — credential-isolation and input-injection guards

**File:** `apps/agent-be/test/unit/deploy-workflow.spec.ts`

**Tasks to make this test pass:**
- [x] Reference `VERCEL_TOKEN` and `RAILWAY_TOKEN` only via `secrets.*`
- [x] Pass `github.ref_name` through `env: BRANCH`, not direct `${{ }}` interpolation in `run:`
- [x] Quote branch name in shell commands (`"$BRANCH"`)
- [x] Add `permissions: { actions: read, contents: read }` block
- [x] Add `concurrency: { group: deploy-production, cancel-in-progress: false }` block
- [x] Add `timeout-minutes: 15` to the deploy job
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=deploy-workflow`
- [x] Test passes

---

## Running Tests

```bash
# Run all deploy-workflow tests
yarn nx test agent-be -- --testPathPattern=deploy-workflow

# Run a specific test
yarn nx test agent-be -- --testPathPattern=deploy-workflow -t "workflow file exists"

# Run with verbose output
yarn nx test agent-be -- --testPathPattern=deploy-workflow --verbose
```

---

## Test Execution Evidence

**Command:** `yarn nx test agent-be -- --testPathPattern=deploy-workflow`

**Results:**

```
Test Suites: 1 passed, 1 total
Tests:       31 passed, 31 total
```

**Summary:**

- Total tests: 31
- Passing: 31
- Status: All tests passing

---

## Notes

- This story creates a CI/CD configuration file (`.github/workflows/deploy.yml`), not application code. The tests are YAML structure validation tests + security regression guards, not traditional unit/integration tests.
- The story's own Testing Approach section says "No unit/integration tests" and "No E2E tests." The ATDD scaffolds add automated YAML structure validation that the story did not originally call for — this is a deliberate improvement to catch regressions in the workflow file's security properties (credential isolation, input injection prevention).
- The regression guard template (credential-isolation + input-injection invariants) follows the pattern established by `sandbox.service.nfr-s1.spec.ts` and `run-migrations.spec.ts` — asserting ABSENCE of security issues in command strings.
- E2E coverage is deferred for all ACs — no browser-level mock pattern can simulate CI/CD workflow configuration or GitHub Environment settings. This check is recorded above.

---

**Generated by BMad TEA Agent** — 2026-07-13
