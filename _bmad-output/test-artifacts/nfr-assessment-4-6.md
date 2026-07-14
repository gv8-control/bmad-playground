---
stepsCompleted:
  - step-01-load-context
  - step-02-define-thresholds
  - step-03-gather-evidence
  - step-04-evaluate-and-score
  - step-05-generate-report
lastStep: 'step-05-generate-report'
lastSaved: '2026-07-13'
workflowType: 'testarch-nfr-assess'
storyId: '4.6'
storyKey: '4-6-add-the-manual-trigger-deploy-step-to-ci'
storyFile: _bmad-output/implementation-artifacts/4-6-add-the-manual-trigger-deploy-step-to-ci.md
inputDocuments:
  - '_bmad-output/implementation-artifacts/4-6-add-the-manual-trigger-deploy-step-to-ci.md'
  - '_bmad-output/test-artifacts/atdd-checklist-4-6-add-the-manual-trigger-deploy-step-to-ci.md'
  - '_bmad-output/test-artifacts/test-review-validation-report-4-6.md'
  - '_bmad-output/project-context.md'
  - '.github/workflows/deploy.yml'
  - 'apps/agent-be/test/unit/deploy-workflow.spec.ts'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

# NFR Evidence Audit - Story 4.6: Add the Manual-Trigger Deploy Step to CI

**Date:** 2026-07-13
**Story:** 4.6
**Overall Status:** CONCERNS ⚠️

---

Note: This audit focuses on NFR-specific issues only (missing select projections, take limits, timing tests, security headers, secret handling, credential isolation, input injection, permissions, deployability). Per user instruction, findings are documented with severity + remediation in the story's review section.

## Executive Summary

**Assessment:** 6 PASS, 5 CONCERNS, 0 FAIL

**Blockers:** 0

**High Priority Issues:** 0

**Recommendation:** Proceed to release. Story 4.6 creates a CI/CD configuration file (`.github/workflows/deploy.yml`) and a test file (`deploy-workflow.spec.ts`). No database code is touched (select projections and take limits are N/A). No HTTP responses are served by this workflow (security headers are N/A — handled by `helmet()` in `main.ts` for agent-be and `next.config.js` for web). No timing-sensitive code paths are introduced (timing tests are N/A). The 5 CONCERNS findings are all test-coverage gaps in the regression guards — the deploy workflow itself is correctly implemented, but the tests don't fully verify all security and reliability properties of the workflow YAML. None block release; all are test-hardening improvements.

---

## NFR Matrix for Story 4.6

| NFR | Category | Threshold | Relevance to Story 4.6 |
| --- | --- | --- | --- |
| **NFR-S1** | Security | Sandbox credential/network isolation | **Not applicable** — Story 4.6 does not inject credentials into sandboxes or modify sandbox network config. |
| **NFR-S2** | Security | Tenant-scoped credential/token lookups | **Not applicable** — Story 4.6 does not touch credential resolution or tenant-scoped database queries. |
| **NFR-S4** | Security | OAuth token storage — encrypted at rest | **Not applicable** — Story 4.6 does not touch OAuth token storage. |
| **NFR-P1** | Performance | First streamed token ≤1,500ms | **Not applicable** — Story 4.6 does not touch the streaming chat interface. |
| **NFR-P2** | Performance | Chat ready ≤10s of Conversation page open | **Not applicable** — Story 4.6 does not touch sandbox provisioning. |
| **NFR-P3** | Performance | Project Map loads ≤2s | **Not applicable** — Story 4.6 does not touch the Project Map. |
| **NFR-P4** | Performance | Artifact Browser loads ≤2s | **Not applicable** — Story 4.6 does not touch the Artifact Browser. |
| **NFR-P5** | Performance | Manual commit completes ≤5s | **Not applicable** — Story 4.6 does not touch manual commit. |
| **NFR-R1** | Reliability | Credential health updates within one git operation cycle | **Not applicable** — Story 4.6 does not touch credential health. |
| **NFR-R2** | Reliability | Committed Artifacts always recoverable | **Not applicable** — Story 4.6 does not touch artifact recovery. |
| **NFR-R3** | Reliability | SSE back-pressure (no silent event drops) | **Not applicable** — Story 4.6 does not touch SSE transport. |
| **NFR-R4** | Scalability | 10 concurrent SSE connections per browser session | **Not applicable** — Story 4.6 does not touch SSE concurrency. |
| **NFR-O1** | Observability | Per-user LLM spend monitoring | **Not applicable** — Story 4.6 does not touch spend monitoring. |
| **Select Projections** | Maintainability | `select` projection on all Prisma DB reads/writes | **Not applicable** — Story 4.6 does not touch Prisma/database code. The deploy workflow is a YAML file. |
| **Take Limits** | Maintainability | Bounded `take` on all Prisma collection queries | **Not applicable** — Story 4.6 does not touch database code. No `findFirst`, `findUnique`, `findMany` calls. |
| **Timing Tests** | Performance | Timing regression guards for performance-sensitive paths | **Not applicable** — Story 4.6 does not introduce timing-sensitive code paths. The deploy workflow is a CI/CD configuration file, not a runtime performance path. |
| **Security Headers** | Security | CSP, HSTS, X-Frame-Options, etc. on production responses | **Not applicable** — Story 4.6 does not serve HTTP responses. Security headers are handled at the application level: `helmet()` in `apps/agent-be/src/main.ts` and `next.config.js` headers for `apps/web`. The deploy workflow triggers deploys; it does not handle HTTP traffic. |
| **Secret Handling** | Security | No secrets in committed files; credentials via `secrets.*` only | **Primary** — `VERCEL_TOKEN` and `RAILWAY_TOKEN` are referenced only via `secrets.*` (verified by 5 credential-isolation guard tests). No credential values appear in the YAML (verified by test). All dynamic values pass through `env:` intermediaries (verified by 4 input-injection guard tests). |
| **Credential Isolation** | Security | Credential env-var names not referenced as `$VAR` in `run:` blocks | **Primary** — 10 credential env-var names are checked against `$VAR` and `${VAR}` patterns in `run:` blocks. However, `GITHUB_TOKEN`/`GH_TOKEN` is NOT in the `CREDENTIAL_ENV_VARS` list — the GitHub token is not covered by the credential-isolation guard. |
| **Input Injection** | Security | No `${{ }}` interpolation in `run:` blocks; dynamic values via `env:` | **PASS** — 4 input-injection guard tests verify: no `${{ github.ref_name }}` in `run:` blocks, `github.ref_name` IS passed through `env:`, branch name is safely quoted, no `${{ }}` expressions of any kind in `run:` blocks. |
| **Permissions** | Security | Least-privilege `GITHUB_TOKEN` scope | **Primary** — `permissions: { actions: read, contents: read }` is set. Test verifies `actions` and `contents` are `read`. But test does NOT verify these are the ONLY permissions — excess permissions (e.g., `packages: write`) could be added without detection. |
| **Deployability** | Deployability | Manual deploy only; quality gate; concurrency control; timeout | **Primary** — `on: workflow_dispatch` only (no push/PR/schedule). Quality-gate step verifies Test Pipeline passed. `concurrency` prevents concurrent deploys. `timeout-minutes: 15` bounds execution. But quality-gate command flags (`--status=completed`, `--limit=1`, `--json`, `--repo`, `--branch=`) are not fully tested — removing any flag would weaken the quality gate silently. |

---

## Performance Assessment

### Response Time (p95)

- **Status:** PASS ✅
- **Threshold:** N/A — no NFR-P1 through NFR-P5 applies to Story 4.6
- **Actual:** Story 4.6 creates a CI/CD workflow file. No runtime code paths with latency sensitivity.
- **Evidence:** Story 4.6 File List — `.github/workflows/deploy.yml`, `deploy-workflow.spec.ts`
- **Findings:** None.

### Timing Tests

- **Status:** PASS ✅
- **Threshold:** N/A — no timing-sensitive code paths introduced
- **Actual:** Story 4.6 does not introduce timing-sensitive code. The deploy workflow has `timeout-minutes: 15` (appropriate for a CI/CD job). The quality-gate step uses `gh run list` (GitHub API call, no application-level timing concern).
- **Evidence:** `.github/workflows/deploy.yml:16` (`timeout-minutes: 15`)
- **Findings:** None. No NFR-P1 through NFR-P5 performance thresholds apply.

### Resource Usage

- **CPU Usage**
  - **Status:** PASS ✅
  - **Threshold:** N/A
  - **Actual:** Story 4.6 creates a YAML file. No CPU usage concerns at runtime.
  - **Evidence:** Story 4.6 File List

- **Memory Usage**
  - **Status:** PASS ✅
  - **Threshold:** N/A
  - **Actual:** Story 4.6 creates a YAML file. No memory usage concerns at runtime.
  - **Evidence:** Story 4.6 File List

### Scalability

- **Status:** PASS ✅
- **Threshold:** N/A — no scalability NFRs apply to CI/CD configuration
- **Actual:** The deploy workflow uses `concurrency: { group: deploy-production, cancel-in-progress: false }` to prevent concurrent production deploys. This is the only scalability concern for a CI/CD workflow.
- **Evidence:** `.github/workflows/deploy.yml:8-10` (concurrency block), test at `deploy-workflow.spec.ts:240-245`
- **Findings:** No scalability regression.

---

## Security Assessment

### Authentication Strength

- **Status:** PASS ✅
- **Threshold:** Deploy tokens stored as environment secrets; `environment: production` gates access
- **Actual:** `VERCEL_TOKEN` and `RAILWAY_TOKEN` are stored as environment secrets on the `production` GitHub Environment (not repo-level secrets). They are only exposed to jobs using `environment: production`. The `environment: production` key is set on the deploy job (verified by test at line 225-229).
- **Evidence:** `.github/workflows/deploy.yml:15` (`environment: production`), `.github/workflows/deploy.yml:52,61` (`secrets.VERCEL_TOKEN`, `secrets.RAILWAY_TOKEN`), Story 4.6 Task 1.3 (environment secrets created via `gh secret set`)
- **Findings:** No authentication regression.

### Authorization Controls

- **Status:** PASS ✅
- **Threshold:** Least-privilege `permissions` block; `environment: production` for branch restriction
- **Actual:** `permissions: { actions: read, contents: read }` restricts the `GITHUB_TOKEN` to only what the deploy job needs. `environment: production` enforces branch restriction (`main` only). Required reviewers deferred past MVP (GitHub billing plan limitation — documented in deferred-work.md).
- **Evidence:** `.github/workflows/deploy.yml:4-6` (permissions), `.github/workflows/deploy.yml:15` (environment), test at `deploy-workflow.spec.ts:233-238`
- **Findings:** No authorization regression. (Required reviewers deferred — see Deferred Items.)

### Data Protection

- **Status:** PASS ✅
- **Threshold:** No secrets in committed files; no credential values in YAML
- **Actual:** No credential values appear in the workflow YAML. The credential-isolation guard test (line 283-289) verifies absence of `vcp_` (Vercel token prefix), `d49618b7` (Railway token fragment), `sk-` (Anthropic key prefix), and `postgresql://` connection strings. All tokens are referenced via `secrets.*`.
- **Evidence:** `.github/workflows/deploy.yml` (no hardcoded secrets), test at `deploy-workflow.spec.ts:283-289`
- **Findings:** No data protection regression.

### Credential Isolation

- **Status:** CONCERNS ⚠️
- **Threshold:** No credential env-var names referenced as `$VAR` or `${VAR}` in `run:` blocks
- **Actual:** 10 credential env-var names are checked (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `CREDENTIAL_ENCRYPTION_KEK`, `DAYTONA_API_KEY`, `DAYTONA_API_URL`, `ANTHROPIC_API_KEY`, `VERCEL_TOKEN`, `RAILWAY_TOKEN`). However, `GITHUB_TOKEN` and `GH_TOKEN` are NOT in the `CREDENTIAL_ENV_VARS` list. The quality-gate step uses `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` via `env:` (correct), but if someone were to reference `$GH_TOKEN` or `$GITHUB_TOKEN` in a `run:` block, the credential-isolation guard would NOT catch it. `GITHUB_TOKEN` is a GitHub Actions-provided credential with `actions: read` and `contents: read` scope — it can read workflow run data and repo contents. Leaking it in a `run:` block could expose it in CI logs if the step echoes command output.
- **Evidence:** `deploy-workflow.spec.ts:80-91` (`CREDENTIAL_ENV_VARS` list — no `GITHUB_TOKEN`/`GH_TOKEN`), `deploy-workflow.spec.ts:270-281` (credential-isolation guard loop)
- **Findings:**
  - [NFR][LOW] `GITHUB_TOKEN`/`GH_TOKEN` not in `CREDENTIAL_ENV_VARS` list. The credential-isolation guard checks 10 credential env-var names but omits `GITHUB_TOKEN` and `GH_TOKEN`. The quality-gate step uses `GH_TOKEN` (mapped from `secrets.GITHUB_TOKEN`) via `env:` — correct. But the regression guard doesn't catch a future regression where `$GH_TOKEN` or `$GITHUB_TOKEN` is referenced in a `run:` block. Remediation: Add `'GITHUB_TOKEN'` and `'GH_TOKEN'` to the `CREDENTIAL_ENV_VARS` array at `deploy-workflow.spec.ts:80-91`. Owner: test hardening.

### Input Injection Prevention

- **Status:** PASS ✅
- **Threshold:** No `${{ }}` interpolation in `run:` blocks; dynamic values via `env:` intermediaries
- **Actual:** 4 input-injection guard tests verify: (1) no `${{ github.ref_name }}` in `run:` blocks, (2) `github.ref_name` IS passed through `env:`, (3) branch name is safely quoted (`"$BRANCH"`), (4) no `${{ }}` expressions of any kind in `run:` blocks. All dynamic values (`github.ref_name`, `github.repository`, `github.sha`) are passed through `env:` intermediaries.
- **Evidence:** `deploy-workflow.spec.ts:301-342` (4 input-injection guard tests), `.github/workflows/deploy.yml:19-22,67-68` (env intermediaries)
- **Findings:** No input injection regression.

### Permissions (Least-Privilege)

- **Status:** CONCERNS ⚠️
- **Threshold:** `permissions` block contains ONLY the scopes the deploy job needs
- **Actual:** `permissions: { actions: read, contents: read }` is set at the workflow level. The test (line 233-238) verifies `actions` is `read` and `contents` is `read`. But the test does NOT verify these are the ONLY permissions in the block. If someone adds `packages: write`, `deployments: write`, or `id-token: write` to the permissions block, the test would still pass — it only checks that `actions` and `contents` are `read`, not that no other scopes exist. This is a gap in the least-privilege regression guard.
- **Evidence:** `deploy-workflow.spec.ts:233-238` (checks `actions` and `contents` but not absence of other scopes), `.github/workflows/deploy.yml:4-6` (permissions block)
- **Findings:**
  - [NFR][MEDIUM] Least-privilege permissions test doesn't verify ONLY `actions` and `contents` are present. The test asserts `permissions.actions === 'read'` and `permissions.contents === 'read'` but does not assert that no other permission scopes exist. A future change adding `packages: write` or `deployments: write` would pass the test silently, expanding the `GITHUB_TOKEN` scope beyond least privilege. Remediation: Add `expect(Object.keys(workflow.permissions ?? {})).toEqual(['actions', 'contents'])` (or `toHaveLength(2)`) to the test at `deploy-workflow.spec.ts:233-238`. Owner: test hardening.

### Vulnerability Management

- **Status:** PASS ✅
- **Threshold:** N/A — no dependency changes in Story 4.6 (CI/CD configuration only)
- **Actual:** No new application dependencies introduced. The deploy workflow installs `vercel@latest` and `@railway/cli` as global tools in the CI runner (not application dependencies). The quality-gate step uses the pre-installed `gh` CLI. The Test Pipeline (`test.yml`) includes a `security-scan` job (npm audit) — the deploy workflow's quality-gate step indirectly verifies it passed.
- **Evidence:** Story 4.6 File List — no `package.json` changes, `.github/workflows/deploy.yml:56,63` (global tool installs)
- **Findings:** No new attack surface from application dependencies. (Unpinned global tool installs deferred in code review — see Deferred Items.)

---

## Reliability Assessment

### Quality Gate Reliability

- **Status:** CONCERNS ⚠️
- **Threshold:** Quality-gate step correctly verifies the latest Test Pipeline run passed before deploying
- **Actual:** The quality-gate step uses `gh run list --repo "$REPO" --workflow=test.yml --branch="$BRANCH" --status=completed --limit=1 --json conclusion,databaseId,number` to fetch the latest completed Test Pipeline run. The test (line 188-194) verifies `--workflow=test.yml` is present. But the test does NOT verify the presence of `--status=completed`, `--limit=1`, `--json`, `--repo`, or `--branch=`. Removing any of these flags would weaken the quality gate silently:
  - Removing `--status=completed` → in-progress runs could be matched (deploy while tests are running)
  - Removing `--limit=1` → multiple runs returned, `jq -r '.[0]'` might not get the latest
  - Removing `--json` → human-readable output, `jq` parsing fails (deploy blocked — safe failure)
  - Removing `--repo "$REPO"` → `gh` CLI has no repo context before checkout (deploy blocked — safe failure)
  - Removing `--branch="$BRANCH"` → runs on ALL branches matched (deploy from unmerged branch if another branch's tests passed)
- **Evidence:** `deploy-workflow.spec.ts:188-194` (only checks `--workflow=test.yml`), `.github/workflows/deploy.yml:24` (full command with all flags)
- **Findings:**
  - [NFR][MEDIUM] Quality-gate command flags untested. The test at `deploy-workflow.spec.ts:188-194` only verifies `--workflow=test.yml` is present in the `gh run list` command. Five critical flags are not tested: `--status=completed`, `--limit=1`, `--json`, `--repo`, `--branch=`. Removing `--status=completed` or `--branch=` would weaken the quality gate (allowing deploys while tests are running or from unmerged branches). Remediation: Add assertions for each flag: `expect(gateStep?.run).toContain('--status=completed')`, `expect(gateStep?.run).toContain('--limit=1')`, `expect(gateStep?.run).toContain('--json')`, `expect(gateStep?.run).toContain('--repo')`, `expect(gateStep?.run).toContain('--branch=')`. Owner: test hardening.

### Deploy Step Reliability

- **Status:** CONCERNS ⚠️
- **Threshold:** Deploy steps use correct flags for CI (non-interactive, production target)
- **Actual:** The Vercel deploy step uses `vercel deploy --prod --yes --cwd=apps/web`. The test (line 143-152) verifies `--prod` and `--cwd=apps/web` but NOT `--yes`. The `--yes` flag skips interactive prompts (required for CI). Without `--yes`, the Vercel CLI would hang waiting for interactive input, eventually hitting the 15-minute timeout. The Railway deploy step uses `railway up --service ... --environment ... --project ...` — the test (line 154-162) verifies `railway up` is present but does NOT verify the service/environment/project IDs are correct (if someone changes the service ID, the test would still pass).
- **Evidence:** `deploy-workflow.spec.ts:143-152` (Vercel step — no `--yes` check), `deploy-workflow.spec.ts:154-162` (Railway step — no ID checks), `.github/workflows/deploy.yml:57` (`--yes` flag present), `.github/workflows/deploy.yml:64` (Railway IDs)
- **Findings:**
  - [NFR][LOW] No test for `--yes` flag on Vercel deploy step. The `--yes` flag skips interactive prompts (required for CI). Without it, the deploy would hang and timeout after 15 minutes. Remediation: Add `expect(vercelStep?.run).toContain('--yes')` to the Vercel deploy step test at `deploy-workflow.spec.ts:143-152`. Owner: test hardening.
  - [NFR][LOW] No test for Railway service/environment/project IDs. The test verifies `railway up` is present but does not verify the service ID (`4df7d0d1-...`), environment ID (`0c3802e5-...`), or project ID (`30ab04b2-...`). If someone changes the service ID, the deploy would target the wrong Railway service. Remediation: Add `expect(railwayStep?.run).toContain('--service')`, `expect(railwayStep?.run).toContain('--environment')`, `expect(railwayStep?.run).toContain('--project')` to the Railway deploy step test. Owner: test hardening.

### Error Rate

- **Status:** PASS ✅
- **Threshold:** N/A
- **Actual:** Story 4.6 does not introduce runtime code. The deploy workflow is a CI/CD configuration file. Error handling is via `exit 1` in the quality-gate step and GitHub Actions' default `set -e` behavior.
- **Evidence:** Story 4.6 File List
- **Findings:** No error handling regression.

### Fault Tolerance

- **Status:** PASS ✅
- **Threshold:** N/A
- **Actual:** The `concurrency: { cancel-in-progress: false }` ensures an in-progress deploy is NOT cancelled by a new trigger — both must complete. The `timeout-minutes: 15` bounds execution. The quality-gate step fails fast if no passing test run exists.
- **Evidence:** `.github/workflows/deploy.yml:8-10` (concurrency), `.github/workflows/deploy.yml:16` (timeout), `.github/workflows/deploy.yml:25-36` (quality-gate fail-fast)
- **Findings:** No fault tolerance gap.

### CI Burn-In (Stability)

- **Status:** PASS ✅
- **Threshold:** P0 tests = 100% pass rate required
- **Actual:** All 31 deploy-workflow tests pass. Full agent-be test suite: 411 passed, 0 regressions.
- **Evidence:** Test execution: `yarn nx test agent-be -- --testPathPattern=deploy-workflow` — 31 passed. Full suite: 411 passed.
- **Findings:** Test suite stable.

### Deployment Health

- **Status:** CONCERNS ⚠️
- **Threshold:** Deploy workflow correctly implements manual deploy with quality gate
- **Actual:** The deploy workflow correctly implements: `on: workflow_dispatch` only (no push/PR/schedule), `environment: production` (branch restriction), quality-gate step as FIRST step, `concurrency` to prevent concurrent deploys, `timeout-minutes: 15`. However, the quality-gate step's `exit 1` in the conclusion-check failure path is not specifically tested — the test at line 205-213 checks for ANY `exit 1` in the `run:` block, not specifically in both failure paths (no-completed-run AND non-success-conclusion). If someone removes the `exit 1` from the conclusion check only, the test would still pass (because the no-completed-run path still has `exit 1`), and a failed test run would allow the deploy to proceed.
- **Evidence:** `deploy-workflow.spec.ts:205-213` (checks for `exit 1` anywhere in the run block), `.github/workflows/deploy.yml:31-34` (conclusion-check `exit 1`)
- **Findings:**
  - [NFR][LOW] `exit 1` in conclusion-check failure path not specifically tested. The test at `deploy-workflow.spec.ts:205-213` asserts `expect(gateStep?.run).toMatch(/exit 1/i)` — this matches ANY `exit 1` in the entire `run:` block. The quality-gate step has TWO failure paths: (1) no completed run found (line 27: `exit 1`), (2) conclusion is not `success` (line 33: `exit 1`). The test only verifies that at least one `exit 1` exists, not that both failure paths have `exit 1`. If someone removes the `exit 1` from the conclusion-check path (line 33), the test would still pass, and a failed Test Pipeline run would allow the deploy to proceed. Remediation: Split the test into two: one asserting `exit 1` appears after the "No completed Test Pipeline run found" message, and one asserting `exit 1` appears after the "concluded with" message. Or use a regex that matches `exit 1` within the conclusion-check `if` block. Owner: test hardening.

---

## Maintainability Assessment

### Test Coverage

- **Status:** PASS ✅
- **Threshold:** P0 tests = 100% pass rate required
- **Actual:** 31 deploy-workflow tests (all P0), all passing. Coverage spans: YAML validity, trigger type, deploy job structure, Vercel/Railway deploy steps, quality-gate step, environment protection, permissions, concurrency, timeout, credential-isolation guards, input-injection guards, deployment summary.
- **Evidence:** `apps/agent-be/test/unit/deploy-workflow.spec.ts` (31 tests), test execution: 31 passed
- **Findings:** All ACs have P0 test coverage for the workflow file structure. (Gaps in regression guard coverage documented above.)

### Code Quality (Select Projections)

- **Status:** PASS ✅ (N/A)
- **Threshold:** `select` projection on all DB reads AND writes (project-context.md:172)
- **Actual:** N/A — Story 4.6 does not touch database code. No Prisma queries. The deploy workflow is a YAML file.
- **Evidence:** Story 4.6 File List — no database code
- **Findings:** No select projection issues (N/A for this story).

### Code Quality (Take Limits)

- **Status:** PASS ✅ (N/A)
- **Threshold:** Bounded `take` on all Prisma collection queries
- **Actual:** N/A — Story 4.6 does not touch database code. No Prisma collection queries.
- **Evidence:** Story 4.6 File List — no database code
- **Findings:** No take limit issues (N/A for this story).

### Technical Debt

- **Status:** PASS ✅
- **Threshold:** UNKNOWN
- **Actual:** Story 4.6 explicitly documents 9 deferred findings (all marked [Defer]): quality-gate HEAD sha, hardcoded token fragment, no atomicity/rollback, unpinned tool installs, cryptic gh error, null run number, no health check, required reviewers, Railway URL. All deferred items have clear owners and rationale (DP-5: scope temptation or beyond AC).
- **Evidence:** Story 4.6 Review Findings section (9 items marked [Defer])
- **Findings:** No undocumented technical debt.

### Test Quality (Timing Tests)

- **Status:** PASS ✅
- **Threshold:** Timing regression guards for performance-sensitive paths
- **Actual:** N/A — Story 4.6 does not introduce timing-sensitive code paths. The deploy workflow has `timeout-minutes: 15` (appropriate for CI/CD). No NFR-P1 through NFR-P5 performance thresholds apply.
- **Evidence:** `.github/workflows/deploy.yml:16` (`timeout-minutes: 15`)
- **Findings:** No timing test gap for Story 4.6's code changes.

### Action Version Pinning

- **Status:** CONCERNS ⚠️
- **Threshold:** GitHub Actions versions pinned to specific major versions
- **Actual:** The deploy workflow uses `actions/checkout@v4` and `actions/setup-node@v4`. These are pinned to major version `v4` (GitHub's recommended practice). However, no test verifies the action versions. If someone downgrades `actions/checkout@v4` to `actions/checkout@v3` (which has known security advisories), no test catches it. Additionally, `vercel@latest` and `@railway/cli` (no version specifier) are unpinned global tool installs — a supply-chain security concern (already deferred in code review).
- **Evidence:** `.github/workflows/deploy.yml:39` (`actions/checkout@v4`), `.github/workflows/deploy.yml:42` (`actions/setup-node@v4`), `deploy-workflow.spec.ts` (no test for action versions)
- **Findings:**
  - [NFR][LOW] No test for `actions/checkout@v4` and `actions/setup-node@v4` action versions. The test file does not verify that the GitHub Actions used are pinned to `v4`. If someone downgrades to `v3` (which has known security advisories) or `@main` (which is mutable), no test catches it. Remediation: Add tests: `expect(checkoutStep.uses).toContain('actions/checkout@v4')`, `expect(setupNodeStep.uses).toContain('actions/setup-node@v4')`. Owner: test hardening.

### RUN_NUMBER Export

- **Status:** CONCERNS ⚠️
- **Threshold:** Deploy summary has access to verified test run number
- **Actual:** The quality-gate step exports `RUN_NUMBER` to `$GITHUB_ENV` via `echo "RUN_NUMBER=$RUN_NUMBER" >> "$GITHUB_ENV"` (line 36). The deployment summary step references `$RUN_NUMBER` (line 74). No test verifies that `RUN_NUMBER` is exported to `$GITHUB_ENV`. If someone removes the `echo` line, the deployment summary would show `#` (empty) for the Test Pipeline run number — a cosmetic issue, but it means the summary loses traceability between the deploy and the verified test run.
- **Evidence:** `.github/workflows/deploy.yml:36` (RUN_NUMBER export), `deploy-workflow.spec.ts` (no test for `GITHUB_ENV` export)
- **Findings:**
  - [NFR][LOW] No test for `RUN_NUMBER` export to `$GITHUB_ENV`. The quality-gate step exports `RUN_NUMBER` via `echo "RUN_NUMBER=$RUN_NUMBER" >> "$GITHUB_ENV"` for use in the deployment summary. No test verifies this export. If the export line is removed, the summary shows `#` (empty) — losing traceability between the deploy and the verified test run. Remediation: Add `expect(gateStep?.run).toContain('GITHUB_ENV')` and `expect(gateStep?.run).toContain('RUN_NUMBER')` to the quality-gate test. Owner: test hardening.

---

## Quick Wins

5 quick wins identified for immediate implementation:

1. **Add `GITHUB_TOKEN`/`GH_TOKEN` to `CREDENTIAL_ENV_VARS`** (Security) - LOW - ~2 min
   - Add `'GITHUB_TOKEN'` and `'GH_TOKEN'` to the `CREDENTIAL_ENV_VARS` array at `deploy-workflow.spec.ts:80-91`
   - No code changes needed — test-only addition

2. **Verify permissions block has ONLY `actions` and `contents`** (Security) - MEDIUM - ~2 min
   - Add `expect(Object.keys(workflow.permissions ?? {})).toEqual(['actions', 'contents'])` to the test at `deploy-workflow.spec.ts:233-238`
   - No code changes needed — test-only addition

3. **Add quality-gate command flag assertions** (Reliability) - MEDIUM - ~5 min
   - Add assertions for `--status=completed`, `--limit=1`, `--json`, `--repo`, `--branch=` to the quality-gate test at `deploy-workflow.spec.ts:188-194`
   - No code changes needed — test-only additions

4. **Add `--yes` flag assertion for Vercel deploy** (Reliability) - LOW - ~1 min
   - Add `expect(vercelStep?.run).toContain('--yes')` to the Vercel deploy step test at `deploy-workflow.spec.ts:143-152`
   - No code changes needed — test-only addition

5. **Add action version assertions** (Security) - LOW - ~3 min
   - Add tests asserting `actions/checkout@v4` and `actions/setup-node@v4` are used
   - No code changes needed — test-only additions

---

## Recommended Actions

### Immediate (Before Release) - CRITICAL/HIGH Priority

None. All critical and high-priority NFR controls are in place. Credentials are via `secrets.*` only. Input injection is prevented via `env:` intermediaries. Least-privilege permissions are set. Quality gate verifies Test Pipeline passed. Concurrency prevents concurrent deploys. Timeout bounds execution.

### Short-term (Next Milestone) - MEDIUM Priority

1. **Verify permissions block has ONLY expected scopes** - MEDIUM - ~2 min - Dev
   - Add `expect(Object.keys(workflow.permissions ?? {})).toEqual(['actions', 'contents'])` to the test
   - Validation: test fails if someone adds `packages: write` or other scopes
   - Owner: test hardening

2. **Add quality-gate command flag assertions** - MEDIUM - ~5 min - Dev
   - Add assertions for `--status=completed`, `--limit=1`, `--json`, `--repo`, `--branch=` to the quality-gate test
   - Validation: test fails if any critical flag is removed from the `gh run list` command
   - Owner: test hardening

### Long-term (Backlog) - LOW Priority

1. **Add `GITHUB_TOKEN`/`GH_TOKEN` to `CREDENTIAL_ENV_VARS`** - LOW - ~2 min - Dev
   - Add `'GITHUB_TOKEN'` and `'GH_TOKEN'` to the credential env-var list
   - Validation: test fails if `$GH_TOKEN` or `$GITHUB_TOKEN` appears in a `run:` block
   - Owner: test hardening

2. **Add `--yes` flag assertion for Vercel deploy** - LOW - ~1 min - Dev
   - Add `expect(vercelStep?.run).toContain('--yes')` to the Vercel deploy step test
   - Validation: test fails if `--yes` is removed (deploy would hang in CI)
   - Owner: test hardening

3. **Add action version assertions** - LOW - ~3 min - Dev
   - Add tests asserting `actions/checkout@v4` and `actions/setup-node@v4`
   - Validation: test fails if action is downgraded to `v3` or changed to `@main`
   - Owner: test hardening

4. **Add `RUN_NUMBER` export test** - LOW - ~2 min - Dev
   - Add test asserting `RUN_NUMBER` is exported to `$GITHUB_ENV`
   - Validation: test fails if the export line is removed
   - Owner: test hardening

5. **Add Railway ID assertions** - LOW - ~3 min - Dev
   - Add tests asserting `--service`, `--environment`, `--project` flags are present
   - Validation: test fails if any flag is removed
   - Owner: test hardening

6. **Split `exit 1` test for both failure paths** - LOW - ~5 min - Dev
   - Split the test at `deploy-workflow.spec.ts:205-213` into two: one for no-completed-run path, one for non-success-conclusion path
   - Validation: test fails if `exit 1` is removed from either failure path
   - Owner: test hardening

---

## Monitoring Hooks

0 monitoring hooks recommended. Story 4.6 creates a CI/CD workflow file — runtime monitoring is handled by Vercel and Railway platform-native logging. No additional monitoring hooks needed for this story.

---

## Fail-Fast Mechanisms

3 fail-fast mechanisms already in place:

### Validation Gates (Security)

- [x] Credential-isolation guard — 5 tests verify no credentials leak via command arguments or env-var references in `run:` blocks
  - **Owner:** Dev
  - **Estimated Effort:** Already implemented

- [x] Input-injection guard — 4 tests verify no `${{ }}` interpolation in `run:` blocks; dynamic values via `env:`
  - **Owner:** Dev
  - **Estimated Effort:** Already implemented

### Quality Gate (Reliability)

- [x] Quality-gate step verifies latest Test Pipeline run passed before deploying
  - **Owner:** Dev
  - **Estimated Effort:** Already implemented

---

## Evidence Gaps

0 evidence gaps identified. All NFR categories relevant to Story 4.6 have been assessed with evidence from the implementation files and test files.

---

## Findings Summary

**Based on NFR-specific issues only (missing select projections, take limits, timing tests, security headers, secret handling, credential isolation, input injection, permissions, deployability)**

| NFR Category | Status | Findings | Introduced by Story 4.6? |
| --- | --- | --- | --- |
| **Missing select projections** | N/A | 0 — Story 4.6 does not touch database code | N/A |
| **Take limits** | N/A | 0 — Story 4.6 does not touch database code | N/A |
| **Timing tests** | PASS ✅ | 0 — no timing-sensitive code paths; `timeout-minutes: 15` on deploy job | N/A |
| **Security headers** | N/A | 0 — Story 4.6 does not serve HTTP responses; `helmet()` and `next.config.js` handle headers at the application level | N/A |
| **Secret handling** | PASS ✅ | 0 — credentials via `secrets.*` only; no credential values in YAML; 5 credential-isolation guard tests | No |
| **Credential isolation** | CONCERNS ⚠️ | 1 LOW — `GITHUB_TOKEN`/`GH_TOKEN` not in `CREDENTIAL_ENV_VARS` list | Yes — test gap in Story 4.6's test file |
| **Input injection** | PASS ✅ | 0 — 4 input-injection guard tests; all dynamic values via `env:` | No |
| **Permissions** | CONCERNS ⚠️ | 1 MEDIUM — test doesn't verify ONLY `actions` and `contents` are present | Yes — test gap in Story 4.6's test file |
| **Quality gate reliability** | CONCERNS ⚠️ | 1 MEDIUM — quality-gate command flags (`--status=completed`, `--limit=1`, `--json`, `--repo`, `--branch=`) untested | Yes — test gap in Story 4.6's test file |
| **Deploy step reliability** | CONCERNS ⚠️ | 2 LOW — `--yes` flag untested; Railway IDs untested | Yes — test gaps in Story 4.6's test file |
| **Deployment health** | CONCERNS ⚠️ | 1 LOW — `exit 1` in conclusion-check path not specifically tested | Yes — test gap in Story 4.6's test file |
| **Action version pinning** | CONCERNS ⚠️ | 1 LOW — `actions/checkout@v4` and `actions/setup-node@v4` versions untested | Yes — test gap in Story 4.6's test file |
| **RUN_NUMBER export** | CONCERNS ⚠️ | 1 LOW — `RUN_NUMBER` export to `$GITHUB_ENV` untested | Yes — test gap in Story 4.6's test file |
| **Total** | CONCERNS ⚠️ | 8 findings (2 MEDIUM, 6 LOW) — all test-coverage gaps, not implementation defects | All introduced by Story 4.6's test file |

---

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-07-13'
  story_id: '4.6'
  feature_name: 'Add the Manual-Trigger Deploy Step to CI'
  categories:
    security: 'CONCERNS'
    performance: 'PASS'
    reliability: 'CONCERNS'
    maintainability: 'CONCERNS'
    deployability: 'PASS'
  overall_status: 'CONCERNS'
  critical_issues: 0
  high_priority_issues: 0
  medium_priority_issues: 2
  concerns: 5
  blockers: false
  quick_wins: 5
  evidence_gaps: 0
  findings_introduced_by_story: 8
  findings_type: 'All test-coverage gaps (no implementation defects)'
  recommendations:
    - 'Proceed to release. All NFR findings are test-coverage gaps, not implementation defects.'
    - 'Add permissions block scope-count assertion (MEDIUM) — prevents silent scope expansion.'
    - 'Add quality-gate command flag assertions (MEDIUM) — prevents silent quality-gate weakening.'
    - 'Add GITHUB_TOKEN to CREDENTIAL_ENV_VARS, --yes flag test, action version tests, RUN_NUMBER export test (LOW) — test hardening.'
```

---

## Related Artifacts

- **Story File:** `_bmad-output/implementation-artifacts/4-6-add-the-manual-trigger-deploy-step-to-ci.md`
- **ATDD Checklist:** `_bmad-output/test-artifacts/atdd-checklist-4-6-add-the-manual-trigger-deploy-step-to-ci.md`
- **Test Review Report:** `_bmad-output/test-artifacts/test-review-validation-report-4-6.md`
- **Previous NFR Assessment (Epic 4):** `_bmad-output/test-artifacts/nfr-assessment-4-3.md`
- **Full System NFR Assessment:** `_bmad-output/test-artifacts/nfr-assessment.md`
- **Evidence Sources:**
  - Deploy workflow: `.github/workflows/deploy.yml`
  - Test file: `apps/agent-be/test/unit/deploy-workflow.spec.ts`
  - Architecture: `_bmad-output/planning-artifacts/architecture.md`
  - Epics: `_bmad-output/planning-artifacts/epics.md`

---

## Recommendations Summary

**Release Blocker:** None.

**High Priority:** None.

**Medium Priority:** 2 items — permissions block scope-count assertion (test hardening), quality-gate command flag assertions (test hardening).

**Low Priority:** 6 items — `GITHUB_TOKEN` in `CREDENTIAL_ENV_VARS` (test hardening), `--yes` flag test (test hardening), action version tests (test hardening), `RUN_NUMBER` export test (test hardening), Railway ID tests (test hardening), `exit 1` split test (test hardening).

**Next Steps:** Proceed to release. All 8 NFR findings are test-coverage gaps in the regression guards — the deploy workflow itself is correctly implemented. The 5 quick wins can be applied in ~15 minutes total as test-hardening improvements.

---

## Sign-Off

**NFR Evidence Audit:**

- Overall Status: CONCERNS ⚠️
- Critical Issues: 0
- High Priority Issues: 0
- Medium Priority Issues: 2
- Low Priority Issues: 6
- Evidence Gaps: 0
- Findings Introduced by Story 4.6: 8 (2 MEDIUM, 6 LOW — all test-coverage gaps, no implementation defects)

**Gate Status:** PASS ✅

**Next Actions:**

- If PASS ✅: Proceed to release. All NFR findings are test-coverage gaps, not implementation defects.
- Apply the 5 quick wins (permissions scope-count, quality-gate flags, GITHUB_TOKEN, --yes flag, action versions) as test-hardening improvements.
- Address the remaining 3 LOW findings (RUN_NUMBER export, Railway IDs, exit 1 split) in the next test-hardening pass.

**Generated:** 2026-07-13
**Workflow:** testarch-nfr v5.0

---

<!-- Powered by BMAD-CORE™ -->
