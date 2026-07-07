---
stepsCompleted: ['step-01-preflight', 'step-02-generate-pipeline', 'step-03-configure-quality-gates', 'step-04-validate-and-summary', 'tier-split-01-preflight', 'tier-split-02-generate-pipeline', 'tier-split-04-validate-and-summary']
lastStep: 'tier-split-04-validate-and-summary'
lastSaved: '2026-07-07'
workflowStatus: 'tier-split-complete'
rework: 'tier-split'
reworkGoal: 'Separate fake-backed PR tests from real-service nightly tests per the 4-tier execution strategy in test-design-qa.md'
---

# CI/CD Pipeline Setup Progress

## Step 01 — Preflight

### Detected Configuration

| Property | Value | Source |
|----------|-------|--------|
| Git repository | ✅ exists | `.git/` present |
| Remote | `github.com/marius321967/bmad-playground.git` | `git remote -v` |
| CI platform | `github-actions` | GitHub remote + existing `.github/workflows/` |
| Test stack type | `fullstack` | architecture.md (Nx monorepo, Next.js 15 + NestJS) |
| Test framework | Playwright (E2E) + Jest + @nestjs/testing | framework-setup-progress.md |
| Local test run | SKIP — blueprint mode | No package.json; pre-implementation |
| Node version | 24 (LTS) | No `.nvmrc`; default |
| Package manager | pnpm | Architecture specifies Nx + pnpm |

### Existing CI Files

`.github/workflows/claude-code-review.yml` and `claude.yml` already present — adding new `test.yml` alongside them.

### Blueprint Mode

Project is pre-implementation. No Nx monorepo scaffolded yet. Pipeline authored against the planned monorepo structure for activation at scaffold time.

---

## Step 02 — Pipeline Generated

### Output File

`.github/workflows/test.yml`

### Template

`github-actions-template.yaml` — adapted for pnpm + Nx + Playwright

### Execution Mode

`sequential` (resolved from `auto`; subagent capability available but not needed for this linear generation)

### Jobs

| Job | Timeout | Trigger | Depends on |
|-----|---------|---------|------------|
| lint | 5 min | all | — |
| unit (Jest via Nx) | 15 min | all | lint |
| e2e ×4 shards (Playwright) | 30 min | all | lint |
| burn-in ×10 (Playwright) | 60 min | PR + cron | e2e |
| report | — | always | unit, e2e, burn-in |

### Key Decisions

- **pnpm** throughout — `pnpm/action-setup@v4` + `actions/setup-node@v4` with `cache: 'pnpm'`
- **Playwright browser cache** keyed on `pnpm-lock.yaml` hash
- **4 E2E shards** with `fail-fast: false` — all shards run even on partial failure
- **webServer blocks** commented out with `[BLUEPRINT]` markers; E2E uses `BASE_URL` repository variable until activated
- **`unit` and `e2e` run in parallel** after lint (independent; lint is the only shared prerequisite)
- `report` runs `if: always()` — always produces a summary regardless of upstream result

### Security

- All `env:` intermediaries in `run:` blocks — no direct `${{ inputs.* }}` interpolation
- No secrets in configuration file
- `BASE_URL` is a repository variable (non-secret), not a secret

---

## Step 03 — Quality Gates & Notifications

### Burn-In

- **Enabled** (stack type: `fullstack` — UI flakiness risk)
- 10 iterations per run
- Triggers: `pull_request` + `schedule` (weekly Sunday 02:00 UTC)
- Failure artifacts: `test-results/`, `playwright-report/`

### Quality Thresholds

| Priority | Threshold | Enforcement |
|----------|-----------|-------------|
| P0 | 100% pass rate | Pipeline fails on any failure |
| P1 | ≥ 95% pass rate | Pipeline fails; artifacts uploaded for diagnosis |

### Contract Testing

Skipped — `tea_use_pactjs_utils: false`

### Notifications

No Slack/email hooks configured at this stage. GitHub Actions' native PR checks and step summary provide in-workflow visibility.

---

## Step 04 — Validation

### Checklist Results

| Item | Status |
|------|--------|
| Git repository validated | ✅ |
| Framework configuration detected (framework-setup-progress.md) | ✅ |
| CI platform detected (`github-actions`) | ✅ |
| CI config created at `.github/workflows/test.yml` | ✅ |
| pnpm + Nx commands configured | ✅ |
| Playwright browser install included (fullstack) | ✅ |
| 4-shard matrix with `fail-fast: false` | ✅ |
| Burn-in enabled (fullstack stack type) | ✅ |
| 10 burn-in iterations with `|| exit 1` | ✅ |
| pnpm dependency cache configured | ✅ |
| Playwright browser cache configured | ✅ |
| Artifacts on failure only (30-day retention) | ✅ |
| Artifact names unique per shard | ✅ |
| No secrets in configuration | ✅ |
| Script injection prevention (`env:` intermediaries) | ✅ |
| `scripts/ci-local.sh` created and executable | ✅ |
| `scripts/test-changed.sh` created and executable | ✅ |
| `scripts/burn-in.sh` created and executable | ✅ |
| `docs/ci.md` created | ✅ |
| `docs/ci-secrets-checklist.md` created | ✅ |

### Blueprint-Mode Items (deferred to scaffold time)

| Item | When to activate |
|------|-----------------|
| webServer blocks in `playwright.config.ts` | Once `apps/web` and `apps/agent-be` are runnable |
| webServer steps in `test.yml` (e2e + burn-in jobs) | Same as above |
| `wait-on` package (`pnpm add -Dw wait-on`) | At webServer activation |
| Remove `BASE_URL` repository variable | After webServer activation |

---

## Completion Summary

**CI platform:** GitHub Actions  
**Config path:** `.github/workflows/test.yml`  
**Stages enabled:** lint → unit/e2e (parallel) → burn-in → report  
**Artifacts:** HTML report, JUnit XML, traces, screenshots, videos (on failure)  
**Burn-in:** enabled, 10 iterations, PR + weekly schedule  

### Next Steps for Marius

1. **Commit the pipeline files** (see commit message suggestion in docs/ci.md)
2. **Set `BASE_URL` repository variable** (GitHub → Settings → Secrets and variables → Actions → Variables) pointing at a staging environment before running E2E tests
3. **Push and open a PR** to trigger the first pipeline run
4. **At Nx scaffold time:** follow the Blueprint Activation Checklist in `docs/ci.md`

### Recommended Next Workflows

- `bmad-testarch-atdd` — generate ATDD scenarios from epics
- `bmad-testarch-automate` — expand test coverage
- `bmad-testarch-nfr` — NFR test implementation (SSE back-pressure, sandbox provisioning latency)

---

## Tier-Split Rework — Step 01 (Preflight)

**Re-run trigger:** Implement the 4-tier execution strategy from
`_bmad-output/test-artifacts/test-design-qa.md` (Execution Strategy section).
The previous pipeline run delivered a single-tier (all-tests-in-PR) workflow.
This rework adds the missing nightly and weekly tiers without disturbing the
existing PR tier.

### Detected Configuration (this run)

| Property | Value | Source |
|----------|-------|--------|
| Git repository | ✅ exists | `.git/` present |
| Remote | `github.com:marius321967/bmad-playground.git` | `git remote -v` |
| CI platform | `github-actions` | existing `.github/workflows/test.yml` (UPDATE mode) |
| Test stack type | `fullstack` | apps/web (Next.js) + apps/agent-be (NestJS) + shared libs |
| Test framework | Playwright ^1.61 + Jest ~30.3 + @nestjs/testing | `playwright.config.ts`, `apps/agent-be/jest.config.ts`, `apps/agent-be/test/jest-integration.config.ts` |
| Local test run | SKIP — out of scope | Task scope is config only (Tier split config + CI workflow); existing PR tier already green per `gate-decision.json` (PASS, 251/251 tests passing, 92% coverage) |
| Node version | 24 (v24.14.0 verified) | No `.nvmrc`; package manager pins via Corepack |
| Package manager | Yarn Berry 4.17.0 | Corepack-pinned in `packageManager` |

### Existing CI Files (UPDATE, not replace)

| File | Status | Action |
|------|--------|--------|
| `.github/workflows/test.yml` | exists, 330 LOC | preserve PR-tier jobs verbatim; append `nightly-real-service`, `nightly-multi-conn`, and `weekly-spike` jobs |
| `.github/workflows/claude-code-review.yml` | exists | untouched |
| `.github/workflows/claude.yml` | exists | untouched |
| `playwright.config.ts` | exists, 63 LOC | preserve `setup` + `chromium` projects; add `real-service` project with own `webServer` block |

### Test-seam verification (critical for tier split)

Confirming how fakes are wired (determines what the real-service project must do):

- `apps/agent-be/src/sandbox/sandbox.module.ts:9` — production wiring uses `{ provide: SANDBOX_SERVICE, useClass: SandboxService }`. **The fake is NEVER injected by the production `AppModule`.**
- `apps/agent-be/src/streaming/streaming.module.ts:16` — production wiring uses `{ provide: AGENT_SERVICE, useClass: AgentService }`.
- `apps/agent-be/test/helpers/test-module-builder.ts` — fakes injected ONLY in Jest-based unit/integration tests via `overrideProviders([SANDBOX_SERVICE, AGENT_SERVICE])`.
- Conclusion: starting `yarn nx run agent-be:serve` ALWAYS uses the real `SandboxService` and `AgentService`. The existing PR-tier e2e tests pass without secrets because no tested path triggers an actual agent run / sandbox provision.
- Real-service-tier requirement: provide real secrets to the existing dev-server startup (no fake-bypass needed, just real env). The `playwright.config.ts` real-service `webServer` block is the existing block reused with `reuseExistingServer: false` and gated on `PLAYWRIGHT_REAL_SERVICE=1` so a single config file can serve both tiers without changing source code.

### Required GitHub Actions secrets (not yet in CI)

The Tier-3 real-service tests need these as repo / environment secrets. `.env.local` already has them for dev; they are NOT in GitHub Actions secrets today.

| Secret | Purpose | Tier that needs it |
|--------|---------|--------------------|
| `DAYTONA_API_KEY` | real `@daytonaio/sdk` provision/clone/git-status | Tier 3 (nightly) |
| `DAYTONA_API_URL` | Daytona API endpoint | Tier 3 (nightly) |
| `ANTHROPIC_API_KEY` (Claude Agent SDK) | real agent streaming + NFR-P1 first-token timing | Tier 3 (nightly) |
| `AUTH_GITHUB_ID` | GitHub OAuth App client id (real OAuth, not placeholder) | Tier 3 (nightly) |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App client secret | Tier 3 (nightly) |
| `AUTH_SECRET` | Auth.js session signing key | Tier 3 (nightly) |
| `DATABASE_URL` | Postgres connection string (real `bmad_easy_test` DB) | Tier 3 (nightly) — also needed by nightly Tier-2 multi-conn tests against live agent-be |
| `CREDENTIAL_ENCRYPTION_KEK` | 32-byte hex KEK for OAuth token encryption | Tier 3 (nightly) |

**No secrets are hardcoded in workflow files.** All access is via `secrets.*` references and gated to the `nightly` schedule / `workflow_dispatch` only.

### Gated-tier decisions

1. PR tier must remain **fake-backed** (no real Daytona/Claude calls). The existing PR-tier e2e jobs already use placeholder values (`AUTH_GITHUB_ID: e2e-placeholder-client-id`); those stay as-is and DO NOT receive real secrets.
2. Tier-2 nightly multi-conn scenarios (P0-008, P2-004, P1-003, P0-010) run against the existing dev server with the same fake-by-omission behavior (no agent-run paths exercised). Secrets need: `DATABASE_URL` only (so agent-be boots fully). Test specs for these scenarios are NOT written in this rework — only CI plumbing.
3. Tier-3 nightly real-service smoke (one happy-path agent run end-to-end) needs the full secrets list above. Single Playwright project tagged `@real-service`, invoked via `--grep @real-service` against a fresh agent-be started with `PLAYWRIGHT_REAL_SERVICE=1` so the real-service `webServer` block engages.
4. Tier-4 weekly spikes (P1-012 repo-size-boundary empirical spike, future k6/Artillery regression) — separate scheduled job. Long-running, can be invoked via `workflow_dispatch` for on-demand runs.

### Assumptions recorded (per project rule: "Ask, don't assume" — running unattended)

- **Tests pass locally** — gate-decision.json (2026-07-07) confirms PASS, 251/251 tests passing, 92% coverage. Skipping the local run step to avoid invoking real services for not-yet-written real-service specs.
- **Existing PR-tier e2e jobs** are kept verbatim — the only change to them is appending the nightly/weekly jobs above; preserved `(&)` background server startup, `wait-on`, 4-shard matrix, `fail-fast: false`, burn-in on PR + weekly. No fragment-level edit to the existing `e2e`, `unit`, `lint`, `typecheck`, `burn-in`, or `report` jobs.
- **Real-service specs are out of scope** — explicit task instruction: "this task is only about establishing the tier split (config + CI workflow), not writing the actual test cases". The `real-service` Playwright project defines the project/tag, but no specs are produced in this pass. CI will skip gracefully (Playwright exits 0 with no tests found because `--grep @real-service` matches nothing yet) until specs land.
- **Single workflow file** — adding jobs to the existing `test.yml` rather than splitting into a separate nightly.yml, because GitHub Actions concurrency groups and the SSoT principle favor one workflow per pipeline concern. Splitting is a possible future refactor if file length becomes a problem.

---

## Tier-Split Rework — Step 02 (Generate Pipeline)

### Output Files

| File | Change |
|------|--------|
| `playwright.config.ts` | `real-service` project (gated on `PLAYWRIGHT_REAL_SERVICE=1`); real-service `webServer` block (own `reuseExistingServer: false` + 120s timeout); existing PR-tier `chromium` project's `grepInvert` widened from `/@real-service/` to `/@real-service\|@multi-conn\|@performance-spike/` so all nightly/weekly tags stay out of the PR tier; removed `as const` from the conditional project object (made `dependencies` readonly, conflicting with Playwright's `string[]` contract). |
| `.github/workflows/test.yml` | Added `workflow_dispatch` (with `inputs.tier` choice) + nightly (`0 3 * * *`) + weekly-spike (`0 4 * * 0`) schedules; appended `nightly-multi-conn`, `nightly-real-service`, `weekly-spike` jobs; added `if:` trigger-scope filters to existing PR-tier jobs (`lint` / `typecheck` / `unit` / `e2e` scoped to push+PR; `burn-in` tightened to PR + Sunday-02:00-cron only) so the new schedules don't accidentally trigger a redundant 4-shard e2e + 10-iteration burn-in. |

### Job-by-job tier placement

| CI job | Tier | Trigger | `if:` filter | Notes |
|--------|------|---------|--------------|-------|
| `lint` | 1 (PR) | push, pull_request | `event_name == 'push' \|\| event_name == 'pull_request'` | NEW `if:` (was implicit). Step/env unchanged. |
| `typecheck` | 1 (PR) | push, pull_request | same as lint | NEW `if:`. Step/env unchanged. |
| `unit` | 1 (PR) | push, pull_request | same as lint | NEW `if:`. Step/env unchanged. |
| `e2e` × 4 shards | 1 (PR) | push, pull_request | same as lint | NEW `if:`. Shards, retries, matrix unchanged. |
| `burn-in` | 1 (PR/weekly) | PR + Sun 02:00 | `event_name == 'pull_request' \|\| (event_name == 'schedule' && event.schedule == '0 2 * * 0')` | TIGHTENED (was any schedule). Step/env/iterations unchanged. |
| `report` | 1 (PR) | `if: always()` | (unchanged — `needs: [unit, e2e, burn-in]`) | PR-tier scope preserved; nightly jobs are self-contained with own artifact uploads. |
| `nightly-multi-conn` | 2 | daily 03:00 + dispatch | `(schedule && '0 3 * * *') \|\| (dispatch && inputs.tier == 'nightly-multi-conn')` | NEW. `--grep @multi-conn --pass-with-no-tests`. |
| `nightly-real-service` | 3 | daily 03:00 + dispatch | same schedule + `inputs.tier == 'nightly-real-service'` | NEW. `PLAYWRIGHT_REAL_SERVICE=1`, `--grep @real-service --pass-with-no-tests`. |
| `weekly-spike` | 4 | Sun 04:00 + dispatch | `(schedule && '0 4 * * 0') \|\| (dispatch && inputs.tier == 'weekly-spike')` | NEW. `--grep @performance-spike --pass-with-no-tests`. 240-min timeout. |

### PR-tier isolation guarantees

1. Real-service specs (`@real-service`) cannot run in PR tier — excluded via `grepInvert` on the `chromium` project + only the `real-service` project (gated on `PLAYWRIGHT_REAL_SERVICE=1` env, which the PR jobs never set) defines `grep: /@real-service/`.
2. Multi-conn specs (`@multi-conn`) cannot run in PR tier — also excluded via `grepInvert`.
3. Performance-spike specs (`@performance-spike`) cannot run in PR tier — same `grepInvert`.
4. PR-tier jobs receive only placeholder secrets (`AUTH_GITHUB_ID: e2e-placeholder-client-id`) — never real Daytona/Claude credentials.
5. PR-tier e2e does NOT set `PLAYWRIGHT_REAL_SERVICE=1`, so Playwright uses the fake-backed `webServer` block (lines 110-121) — `agent-be:serve` boots the production `AppModule`, but no tested code path triggers an agent run, so `SandboxService` / `AgentService` are never exercised against real Daytona/Claude.
6. The nightly/weekly jobs' `if:` filters are scoped to their specific cron schedule OR `workflow_dispatch` with the matching `inputs.tier` — there is no path where a push or PR triggers a real-service job.

### Deviation from preflight assumption

The preflight recorded that PR-tier jobs would be "kept verbatim — only fragment-level edit appending the nightly/weekly jobs above". The implemented change is slightly broader: the PR-tier jobs (`lint`, `typecheck`, `unit`, `e2e`, `burn-in`) all gained explicit `if:` trigger-scope filters. **Rationale:** without `if:` filters, adding the nightly schedule (`0 3 * * *`) to the workflow's `on:` block would have triggered all existing PR-tier jobs every night — wasting ~30+ CI-minutes per shard and re-running the 10-iteration burn-in loop daily (3-4 hours of compute/night). The trigger filters preserve the existing **PR + Sunday-02:00-weekly** behavior exactly; only the new nightly/weekly schedules fan out to the new jobs. The job **steps, env, matrix, retries, and timeouts** of the existing PR-tier jobs are unchanged.

### `--pass-with-no-tests` for the unblocked-state

Until the real-service / multi-conn / performance-spike specs are authored, each new job's `yarn playwright test --grep <tag> --pass-with-no-tests` invocation exits 0 (Playwright treats "no tests matched grep" as success rather than failure with this flag). This keeps the nightly/weekly jobs green while the project hasn't authored the specs yet — they'll begin catching drift the moment a tagged spec lands.

---

## Tier-Split Rework — Step 04 (Validate & Summary)

### Verification results

| Check | Status | Notes |
|------|--------|-------|
| `playwright.config.ts` TypeScript compiles (`tsc --noEmit`) | ✅ PASS | Fixed `as const` readonly-tuple error — Playwright expects `dependencies: string[]`, not `readonly ['setup']`. |
| `.github/workflows/test.yml` YAML parses | ✅ PASS | 9 jobs total (was 6). All `if:` expressions tag-parseable. |
| 4-tier strategy matches `test-design-qa.md` Execution Strategy section | ✅ PASS | Tier 1 (PR) + Tier 2 (nightly multi-conn) + Tier 3 (nightly real-service) + Tier 4 (weekly spike) all mapped. |
| Real-service tests NOT in PR tier (grepInvert + project gating) | ✅ PASS | `grepInvert: /@real-service\|@multi-conn\|@performance-spike/` on `chromium` project. `real-service` project gated on `PLAYWRIGHT_REAL_SERVICE=1`. |
| PR-tier jobs unchanged structurally (steps, env, matrix, retries, timeouts) | ✅ PASS | Only `if:` filters added/tightened; `e2e` shards (4), `burn-in` iterations (10), `unit` parallelism (4) all preserved. |
| Real-service job uses 3-retry budget (not the PR-tier 2) | ✅ PASS | Configured in `playwright.config.ts:79` (`retries: 3` on the `real-service` project), not overridden at the CI job level. |
| `fail-fast: false` for real-service tier | ✅ PASS | `defineConfig` top-level `retries: process.env.CI ? 2 : 0` is the PR default; the `real-service` project overrides to 3 retries, and Playwright's per-project retry model has no `fail-fast` analogue (no `--fail-fast` flag in job args). |
| All required GitHub Actions secrets documented (not hardcoded) | ✅ PASS | Header comment block lists all 8 secrets; each job's `env:` references `secrets.*` symbolically. |
| `workflow_dispatch` for on-demand invocation of nightly/weekly tiers | ✅ PASS | Single `inputs.tier` choice drives the `if:` filter of each nightly/weekly job. |

### Discovered smells (out of scope)

- **Pre-existing TypeScript error** in `apps/web/src/components/conversation/AgentMessage.tsx:18` — `error TS2571: Object is of type 'unknown'`. Surfaces during `yarn tsc --noEmit --project apps/web/tsconfig.json`. Last touched in commit `a59475f` (predates this rework). NOT introduced by tier-split changes.
- **PR-tier e2e/burn-in jobs start the dev servers manually** with `yarn nx run web:dev &` + `wait-on`, AND `playwright.config.ts` has a `webServer` block that also tries to start them with `reuseExistingServer: false` in CI — this is a pre-existing dual-start pattern that could cause port conflicts on a fresh runner. Out of scope for this rework. Worth diagnosing before relying on the existing PR-tier e2e job in production CI.
- **`playwright.config.ts:7`** loads `.env.local` via `loadDotenv({ path: '.env.local', override: false })`. This file does not exist in CI runners (gitignored). Silent no-op in CI today; flag here because the real-service nightly job relies on the secrets being inherited via env from the GitHub Actions step, NOT via `.env.local`. Verified by inspecting the propagation path (GitHub Actions `env:` → playwright process env → webServer subprocess env → `apps/agent-be` `process.env.AUTH_SECRET` etc.).

### Tier-split completion summary

**PR-tier (Tier 1) preserved:** lint → typecheck → unit → e2e (4 shards) → burn-in → report. Identical steps/env/matrix; only `if:` filters added so nightly/weekly schedules don't trigger them.

**Nightly tiers (Tier 2 + Tier 3) added:**
- `nightly-multi-conn` (Tier 2): `--grep @multi-conn --pass-with-no-tests`, secrets = DATABASE_URL + AUTH_SECRET + CREDENTIAL_ENCRYPTION_KEK only (no Daytona/Claude).
- `nightly-real-service` (Tier 3): `PLAYWRIGHT_REAL_SERVICE=1`, `--grep @real-service --pass-with-no-tests`, all 8 secrets, 3-retry budget (in playwright config), 30-min timeout.

**Weekly tier (Tier 4) added:**
- `weekly-spike`: `--grep @performance-spike --pass-with-no-tests`, 240-min timeout, multi-conn-level secrets (promotable to real-service when an actual spike spec requires it).

**On-demand dispatch:** `workflow_dispatch` with `inputs.tier` choice drives each nightly/weekly job's `if:` filter for manual invocation (e.g., debugging a nightly failure during business hours).

### Configuration NOT yet done (next steps for Marius)

1. **Add GitHub Actions secrets** (GitHub → Settings → Secrets and variables → Actions → New repository secret) — see the 8-secret list in the test.yml header comment.
2. **Author the first `@real-service` spec** — minimum viable happy path: create a conversation, send one message, verify an assistant response arrives. Until at least one tagged spec lands, the nightly-real-service job is a green no-op.
3. **Author `@multi-conn` specs** (P0-008 10-concurrent-SSE, P2-004 last-write-wins, P1-003 Daytona-outage, P0-010 sandbox-crash termination) — these need multi-context Playwright orchestration.
4. **Author `@performance-spike` specs** — P1-012 (repo-size boundary empirical spike, ~4h QA task per test-design-qa.md), future k6/Artillery regression suite.
5. **Validate the dispatch path** by manually triggering `workflow_dispatch` with `inputs.tier: nightly-real-service` once secrets are configured.
6. **(Optional) Diagnose the pre-existing PR-tier dev-server dual-start pattern** (see "Discovered smells") if the existing e2e job exhibits port-binding flakiness.
