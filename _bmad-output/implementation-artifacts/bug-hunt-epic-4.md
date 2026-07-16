# Bug Hunt Report: Epic 4 — Infrastructure and Deployment (Stories 4-1 through 4-12)

**Date:** 2026-07-14
**Target files:** `.github/workflows/deploy.yml`, `.github/workflows/secret-rotation-reminder.yml`, `.github/workflows/test.yml`, `apps/agent-be/Dockerfile`, `apps/agent-be/src/config/configuration.ts`, `apps/agent-be/src/config/cors-options.ts`, `apps/agent-be/src/config/env.validation.ts`, `apps/agent-be/src/config/cors-options.spec.ts`, `apps/agent-be/src/config/env.validation.spec.ts`, `apps/agent-be/test/unit/check-rotations.spec.ts`, `apps/agent-be/test/unit/custom-domain-setup.spec.ts`, `apps/agent-be/test/unit/db-restore.spec.ts`, `apps/agent-be/test/unit/deploy-failure-recovery.spec.ts`, `apps/agent-be/test/unit/deploy-workflow.spec.ts`, `apps/agent-be/test/unit/http2-verification.spec.ts`, `apps/agent-be/test/unit/monitoring-setup.spec.ts`, `apps/agent-be/test/unit/run-migrations.spec.ts`, `apps/agent-be/test/unit/secret-rotation-schedule.spec.ts`, `docs/runbooks/custom-domain-setup.md`, `docs/runbooks/db-restore.md`, `docs/runbooks/deploy-failure-recovery.md`, `docs/runbooks/http2-verification.md`, `docs/runbooks/kek-rotation.md`, `docs/runbooks/monitoring-setup.md`, `docs/runbooks/secret-rotation-schedule.md`, `.github/scripts/check-rotations.js`, `.github/secret-rotation-config.json`, `scripts/run-migrations.ts`
**Has diff:** false

## Summary

- **Total findings:** 24
- **Critical:** 2
- **High:** 5
- **Medium:** 12
- **Low:** 5

### Layer results:
- **TFA (Test Fidelity Audit):** 9 findings — verdict: false-confidence-found
- **ECH (Edge Case Hunter):** 14 unhandled paths
- **CR (Code Review):** 12 findings (1 dismissed as informational — runbook verification-pending notes captured as separate findings L4/L5)

---

## Findings

### Critical

#### [C1] Secret rotation config holds placeholder `productionLaunchDate = <YYYY-MM-DD>` — reminder cron is silently inactive forever
- **Sources:** tfa+ech+cr
- **Location:** `.github/secret-rotation-config.json:2` (config); `.github/scripts/check-rotations.js:35-39` (silent swallow); `apps/agent-be/test/unit/check-rotations.spec.ts:513-519` (false-green test enforcing the bug); `apps/agent-be/test/unit/secret-rotation-schedule.spec.ts:607-610` (placeholder-accepting guard)
- **Detail:** The committed config file ships `"productionLaunchDate": "<YYYY-MM-DD>"`. `check-rotations.js` `parseDate("<YYYY-MM-DD>")` returns `null` (because `new Date("<YYYY-MM-DD>")` is invalid). The script then writes `[]` to stdout and exits 0. The weekly Monday 00:00 UTC cron therefore does nothing every week — no GitHub issue is ever created — and the workflow reports success.
- Operators have no signal that rotation reminders are inoperative. Secrets will silently pass their 90/180-day intervals and the project will be out of compliance with the rotation schedule documented in `docs/runbooks/secret-rotation-schedule.md` without any alert.
- Two tests **enforce** the broken state, making this also a false-green-finding pair:
  - `check-rotations.spec.ts` "real config with placeholder date produces empty array (no crash)" asserts `result` equals `[]` — this is the production reality, asserted as the desired behaviour. A future operator who starts the launch will not be warned.
  - `secret-rotation-schedule.spec.ts` "config file uses <YYYY-MM-DD> placeholder or real date for productionLaunchDate" accepts EITHER pattern; a placeholder never rotates out of validity.
- **Original classifications:** TFA=C (test enforces broken contract) / ECH=production-reachable silent failure / CR=decision_needed
- **Suggested fix:** Either (a) require `productionLaunchDate` to be a real date in the spec test (fail CI while placeholder remains after launch), or (b) add a workflow-level guard that emits a clear failure or a `needs-triage` issue if `productionLaunchDate` parsing fails. Critical because the entire Story 4.12 feature is silently off until fixed.

#### [C2] Deploy quality gate does not verify SHA match — can deploy an untested commit using a stale "success" Test Pipeline run
- **Sources:** tfa+ech+cr
- **Location:** `.github/workflows/deploy.yml:24-36` (quality gate); `.github/workflows/test.yml:71,100,127,166,274` (PR-tier jobs gated on push/PR only); `apps/agent-be/test/unit/deploy-workflow.spec.ts:165-222` (tests verify the gate exists but never assert SHA equality)
- **Detail:** `deploy.yml` quality gate runs `gh run list --repo "$REPO" --workflow=test.yml --branch="$BRANCH" --status=completed --limit=1 --json conclusion,databaseId,number` and asserts the latest COMPLETED run on the branch has `conclusion == "success"`. It never compares the run's `headSha` to `github.sha`.
- Failure scenarios:
  1. **Stale-success deploy:** Commit A passes tests; commit B pushed but no `test.yml` runs for B (rare: push trigger disabled, branch filter mismatch, etc.); operator manually dispatches deploy on B; gate picks up A's success run and deploys B untested.
  2. **Scheduled-run accepted as PR-tier proof:** `test.yml` gates `lint`, `typecheck`, `unit`, `e2e`, `burn-in` on `github.event_name == 'push' || 'pull_request'`. A **nightly** (Tier 2/3) schedule-triggered run SKIPS all PR-tier jobs; only the nightly/weekly-specific jobs (multi-conn, real-service smoke, performance) run, plus the always-run `Test Report` aggregator. Workflow conclusion: `success` — but no real test suite ran for HEAD. The deploy.yml gate accepts this.
- The `deploy-workflow.spec.ts` tests verify the gate exists, hits `test.yml`, checks success message strings, etc. — but never assert `headSha` equality. False-green: tests pass; the SHA gap is undetectable.
- **Original classifications:** TFA=C (false-green hiding a real contract gap on a deployment invariant) / ECH=unhandled path with production consequence / CR=decision_needed
- **Suggested fix:** After `gh run list`, add a check that `.[0].headSha == ${{ github.sha }}`. Alternatively pass `--commit` flag to `gh run list`. Also: consider declaring the deploy gate's accepted `event_name` (push or pull_request only) so scheduled runs cannot satisfy the gate.

---

### High

#### [H1] Deploy steps lack post-deploy health verification (deployed app may be unhealthy but deploy reports success)
- **Sources:** ech+cr
- **Location:** `.github/workflows/deploy.yml:50-65`
- **Detail:** `vercel deploy --prod --yes --cwd=apps/web` returns success on BUILD success — the workflow does not check whether the new production deployment serves HTTP 200. Railway's `railway up` similarly returns success when the image builds; Railway's Dockerfile `HEALTHCHECK` runs asynchronously after deploy, and Railway's behaviour on health-check failure is to keep the PREVIOUS deployment serving while a new one is unhealthy (documented at `docs/runbooks/deploy-failure-recovery.md:88-99`). The deploy workflow has no awareness of this — its `Deployment summary` step (lines 66-74) reports both deployments as completed even when Railway's new deployment is unhealthy.
- A deploy can therefore "succeed" while apps/agent-be returns 500s in production, and operators only notice via the UptimeRobot alert (5-minute polling, Story 4.11) — a 5+ minute window of degraded service with no CI signal.
- **Original classifications:** ECH=unhandled path with production consequence / CR=patch
- **Suggested fix:** Add a post-deploy step: `curl --fail --max-time 30 --retry 5 --retry-delay 10 https://bmad-easy.vercel.app/ && curl --fail --max-time 30 --retry 5 --retry-delay 10 https://agent-be-production-1c09.up.railway.app/health`. Fail the deploy job if either check fails; surface actionable rollback guidance in `$GITHUB_STEP_SUMMARY`.

#### [H2] Deploy has no atomicity between Vercel and Railway — split-brain deploys stay live for minutes
- **Sources:** ech+cr
- **Location:** `.github/workflows/deploy.yml:50-65`; documented (but not automated) at `docs/runbooks/deploy-failure-recovery.md:301-355`
- **Detail:** Vercel deploy (`vercel deploy --prod`) runs BEFORE Railway deploy (`railway up`). If Railway fails, Vercel has already PREPARED AND PROMOTED a new production deployment — production has new `apps/web` against the OLD `apps/agent-be`. No automated rollback exists; operators must notice the GitHub Actions failure email and execute manual `vercel rollback` per the runbook.
- The split-brain window duration = time-from-railway-failure + human-reaction-time + rollback execution. For an after-hours deploy, this can be hours. New `apps/web` running against old `apps/agent-be` API contracts is a real production-error surface.
- The deploy summary step writes "Deployment Summary" only on success; the runbook documents the failure mode but the workflow has no awareness.
- **Original classifications:** ECH=unhandled path with production consequence / CR=decision_needed
- **Suggested fix:** At minimum, deploy Railway FIRST then Vercel (so a broken backend fails the workflow before promoting the frontend); OR keep current order but add automated health check between steps with automatic `vercel rollback` on Railway failure. The deploy-failure-recovery.md runbook already lists `vercel rollback <previous-deployment-url>` — automate it.

#### [H3] `check-rotations.js` swallows ALL exceptions and exits 0 — silent cron failures永远 invisible
- **Sources:** ech+cr
- **Location:** `.github/scripts/check-rotations.js:27-33` (config parse error), `:35-39` (invalid launch date), `:85-90` (outer try/catch)
- **Detail:** Three separate code paths produce empty `[]` output and `process.exit(0)`:
  - Invalid JSON in config file (line 30)
  - Invalid `productionLaunchDate` (line 37) — this is the C1 trigger
  - Outer try/catch around the whole `main()` body (lines 85-90)
- The cron workflow always reports success when `check-rotations.js` exits 0; operators have no signal that the script is silently failing. The check-rotations.spec.ts test "[P0] script exits 0 when no config path is provided" reinforces this exit-0-always design (a "no input" scenario, fair enough) but the test doesn't distinguish expected-empty (`[]`) from swallowed-error-empty.
- This compounds C1: even if someone fixes the placeholder, future config-file typos or runtime errors will still be invisible.
- **Original classifications:** ECH=unhandled recovery / CR=patch
- **Suggested fix:** Exit non-zero (with `console.error` diagnostic) for UNEXPECTED errors. Exit 0 ONLY for explicitly-empty results (config has no due secrets, reminderWindow matched nothing, etc.). Document the exit-code contract in the script header.

#### [H4] Dockerfile install stage omits `.yarn/` directory — Yarn Berry patches/plugins not in build context
- **Sources:** ech
- **Location:** `apps/agent-be/Dockerfile:5-6` (install stage)
- **Detail:** Install stage `COPY package.json yarn.lock .yarnrc.yml ./` does NOT copy `.yarn/` directory. Yarn Berry uses `.yarn/` for:
  - `.yarn/releases/` — explicit Yarn binary (referenced by `yarnPath` in `.yarnrc.yml`)
  - `.yarn/patches/` — patch files referenced by `package.json` `resolutions` / `patchedDependencies`
  - `.yarn/plugins/` — plugin hooks
  - `.yarn/cache/` — zero-install binary cache
- `corepack enable` (line 3) provides a global Yarn so `yarn install --immutable` doesn't crash on a missing `.yarn/releases/` binary, but configured patches silently won't apply. If the project introduces a patch later (e.g., to pin a transitive dep), the Docker build will silently produce an image WITHOUT the patch.
- The build stage (`COPY . .` at line 13) replaces the install-stage node_modules with a full source copy, so the install stage is only a cache. The cache mismatch still costs rebuilds.
- **Original classifications:** ECH=unhandled scenario for build correctness
- **Suggested fix:** Copy `.yarn/` directory in the install stage: `COPY package.json yarn.lock .yarnrc.yml .yarn ./`. Verify with a simple patch test (add a noop patch to a transitive dep, check that the build artifact reflects it).

#### [H5] `check-rotations.js` floor-formula uses elapsed-ms arithmetic — DST / calendar drift over multi-year rotation cycles
- **Sources:** ech+cr
- **Location:** `.github/scripts/check-rotations.js:59-65` (`intervalMs = intervalDays * 24*60*60*1000`; `mostRecentDueDate = launchDate + intervalsPassed * intervalMs`); test asserting the same arithmetic at `apps/agent-be/test/unit/check-rotations.spec.ts:266-269`
- **Detail:** The script treats a "90-day rotation interval" as exactly `90 * 24h = 7,776,000 ms`, not as 90 calendar days. Over a long rotation cycle:
  - DST transitions shift wall-clock by 1 hour on transition days. If the launch date is e.g. 2026-03-08 (US DST "spring forward"), the `mostRecentDueDate` for a 90-day interval may drift an hour, occasionally landing on the wrong `YYYY-MM-DD` calendar day when formatted via `toISOString().split('T')[0]` (UTC representation).
  - The test "dueDate in output is a valid YYYY-MM-DD string" uses the SAME ms arithmetic to compute the expected date (`launchMs + 180 * 24 * 60 * 60 * 1000`) — so the test confirms "script matches ms arithmetic" not "script matches calendar semantics." False-green if the calendar interpretation matters (which it does for "rotate by this date" operator messaging).
- **Original classifications:** ECH=boundary condition; CR=defer (the impact is rare — a 90-day interval crosses DST only if launch is near a transition date)
- **Suggested fix:** Use calendar arithmetic: e.g. `new Date(launchDate); date.setDate(date.getDate() + intervalDays); date.getTime()`. Document that the contract is "calendar-day interval" not "fixed-ms interval."

---

### Medium

#### [M1] `env.validation.ts` permits production boot without `DAYTONA_API_URL` / `DAYTONA_API_KEY`
- **Sources:** ech+cr
- **Location:** `apps/agent-be/src/config/env.validation.ts:5-6`
- **Detail:** Both fields are `z.string().optional().default('')`. A productionRailway deploy with either missing will BOOT SUCCESSFULLY — NestJS starts, `/health` returns 200, the Dockerfile HEALTHCHECK passes, deploy.yml reports success. First real sandbox provisioning fails at runtime with a non-obvious Daytona SDK error.
- The env.validation.spec.ts file tests ONLY `ANTHROPIC_API_KEY` (AC-7), and `ANTHROPIC_API_KEY` IS required (`z.string().min(1)`). But the same fail-at-boot guarantee is advertised for Daytona in the Story 4-5 spec without verification.
- Combined with H1 (no post-deploy health check), a misconfigured prod deploy can ship silently.
- **Suggested fix:** Make `DAYTONA_API_URL` and `DAYTONA_API_KEY` required (`z.string().min(1)`) — or introduce a NODE_ENV-aware schema that requires them only when `NODE_ENV === 'production'`. Add a test asserting the requirement as new AC.
- **Fixable by:** dev sub-agent

#### [M2] `cors-options.ts` filters ONLY exact `*` — `https://*.example.com` wildcard subdomains are sent verbatim to browsers
- **Sources:** ech
- **Location:** `apps/agent-be/src/config/cors-options.ts:28`; tests at `apps/agent-be/src/config/cors-options.spec.ts:79-94`
- **Detail:** `.filter((o) => o !== '*')` excludes only the exact string `*`. If an operator (mistakenly believing they're enabling subdomain CORS) types `https://*.example.com` in `CORS_ALLOWED_ORIGINS`, the code sends it to the browser verbatim with `credentials: true`. The browser treats `*.example.com` as a literal origin (matches only `https://*.example.com` URLs — effectively never). Combined with `credentials: true`, any real subdomain request will be rejected with a CORS error.
- The tests cover exact `*` filtering (P1 tests at cors-options.spec.ts:79-94) but NO test covers the `*.` substring case — a future regression would be undetectable.
- **Suggested fix:** Either reject any origin containing `*` substring (treat as invalid input → fall back to default), OR document explicitly in a JSDoc that only EXACT origin matches are supported. Add a test case for `https://*.example.com` → fall back to default.
- **Fixable by:** dev sub-agent

#### [M3] `db-restore.spec.ts` curl-flag test is per-FILE not per-BLOCK — false-green if any single curl block omits `--fail`/`--max-time`
- **Sources:** tfa+cr
- **Location:** `apps/agent-be/test/unit/db-restore.spec.ts:343-358`
- **Detail:** Test pattern:
  ```js
  if (/curl\s/i.test(content)) {
    expect(content).toMatch(/--fail\b/);
  }
  ```
  This verifies `--fail` exists SOMEWHERE in the file, not that EVERY curl code block has it. If `db-restore.md` (currently 10 curl blocks, all with both flags) had ONE block missing `--fail` (e.g., a future addition by a contributor who doesn't know the convention), the test would still pass — false-green.
- Compare with `monitoring-setup.spec.ts:391-421` which iterates per code-block. The per-block pattern is the right one.
- **Suggested fix:** Replicate the monitoring-setup.spec.ts pattern: extract all `curl` blocks via `content.match(/```[\s\S]*?```/g)` → filter by `/curl\s/i` → iterate and assert both `--fail` and `--max-time` per block.
- **Fixable by:** dev sub-agent

#### [M4] `secret-rotation-schedule.spec.ts` "no `${{ }}` in run blocks" regex catches ONLY multi-line `run: |` form
- **Sources:** tfa+cr
- **Location:** `apps/agent-be/test/unit/secret-rotation-schedule.spec.ts:728-735`
- **Detail:** The regex `text.match(/run:\s*\|[\s\S]*?(?=\s*[-a-z]+:|$)/g)` only matches multi-line `run: |` blocks. A single-line `run: cmd ${{ secrets.X }}` (valid YAML) would NOT be matched. The guard gives false confidence.
- The `secret-rotation-reminder.yml` workflow currently uses `run: |` form for all steps, so the test is green and the workflow is clean. But the test as written would not catch a future single-line `${{ }}` injection.
- Compare with `deploy-workflow.spec.ts:334-340` which uses YAML parsing via `js-yaml` and iterates `step.run` directly — robust pattern.
- **Suggested fix:** Replace the regex-against-raw-text approach with YAML parsing + step iteration (matching `deploy-workflow.spec.ts`).
- **Fixable by:** dev sub-agent

#### [M5] `secret-rotation-schedule.spec.ts` "workflow passes dynamic values through env: intermediaries" assertion is vacuous
- **Sources:** tfa
- **Location:** `apps/agent-be/test/unit/secret-rotation-schedule.spec.ts:621-628`
- **Detail:** The test asserts `steps.some(s => s.env && Object.keys(s.env).length > 0)`. ANY step with ANY env var satisfies this — e.g. a static env like `CONFIG_PATH: .github/secret-rotation-config.json` (a literal path, not a dynamic value). The test does not verify the actual security concern: that user-controlled / `${{ }}` expressions are passed ONLY via env intermediaries.
- Currently green because `CONFIG_PATH` env var exists. But a future workflow that uses `${{ github.event_name }}` directly in a `run:` block would not be caught.
- **Suggested fix:** Identify the `${{ }}` expressions in the workflow and assert each appears in `env:` values, not in `run:` values. Or remove this test in favour of the (more specific) "no `${{ }}` in `run:` blocks" test, with the regex fix from M4.
- **Fixable by:** dev sub-agent

#### [M6] `monitoring-setup.spec.ts` "human.executed" regex too permissive (matches `humanXexecuted` for any X)
- **Sources:** tfa
- **Location:** `apps/agent-be/test/unit/monitoring-setup.spec.ts:196-198` (also custom-domain-setup.spec.ts:121-122)
- **Detail:** `expect(content).toMatch(/human.executed/i);` — the `.` is "any character", so this matches `human-executed`, `human executed`, `humanXexecuted`, `human_executed`. The intent is clearly "human-executed" or "human executed". A future runbook typo (`human.executed` literal, missing emoji $\dots$) would pass the test while failing the actual AC.
- Same pattern appears in `custom-domain-setup.spec.ts:121-122`.
- **Suggested fix:** Replace `/human.executed/i` with `/human[\s_-]executed/i` (explicit separators).
- **Fixable by:** dev sub-agent

#### [M7] `deploy-workflow.spec.ts` credential-isolation regexes are too broad — give false confidence on token-prefix matching
- **Sources:** tfa+cr
- **Location:** `apps/agent-be/test/unit/deploy-workflow.spec.ts:283-289`
- **Detail:** The "no credential values appear in the workflow YAML" test uses three regex patterns:
  - `/vcp_[A-Za-z0-9]/` — Vercel token prefix. Not all Vercel tokens start with `vcp_` (legacy tokens can start with different prefixes). False positive risk: misses actual leaks.
  - `/d49618b7/` — specific known Railway token fragment. Brittle: future rotation invalidates this guard.
  - `/sk-[A-Za-z0-9]/` — too broad. Matches any `sk-X` substring, including benign strings like `slack-info`, `sk-iteration`, code identifiers. Also misses real Anthropic API keys that begin `sk-ant-api03-...` (which ARE matched — OK) but a token that starts with different prefix would not be.
  - `/postgresql:\/\/[^:]+:[^@]+@/` — catches literal postgres URLs (good).
- The companion `CREDENTIAL_ENV_VARS` regex check (lines 270-281) is more robust but only checks for `VAR=value` patterns. The token-prefix tests give false confidence in coverage.
- **Suggested fix:** Combine the `CREDENTIAL_ENV_VARS` iteration with stricter token-prefix patterns (e.g. GitHub classic PATs `/ghp_[A-Za-z0-9]{36}/`, Anthropic `/sk-ant-[A-Za-z0-9_-]+/`). Remove the brittle `d49618b7` known-fragment pattern.
- **Fixable by:** dev sub-agent

#### [M8] `env.validation.spec.ts` scope is too narrow despite generic file name — only covers `ANTHROPIC_API_KEY`
- **Sources:** tfa
- **Location:** `apps/agent-be/src/config/env.validation.spec.ts` (entire file)
- **Detail:** The file is named `env.validation.spec.ts` (suggesting whole-schema coverage) but only tests Story 4.5 AC-7: `ANTHROPIC_API_KEY` required-field behaviour. Tests for `DATABASE_URL` (URL format), `AUTH_SECRET` (min length), `DAYTONA_API_URL`/`DAYTONA_API_KEY` (optional-with-default), and the boot-failure message format are all missing.
- The file's JSDoc claims "AC-7 ensures a missing key fails at boot rather than silently becoming ''" — that's the actual scope. The file name should reflect that OR the test scope should broaden.
- Combined with M1: the optional default-`''` for `DAYTONA_API_URL`/`DAYTONA_API_KEY` is the production-readiness concern this test suite should cover, given the spec is wired this way.
- **Suggested fix:** Either rename to `env.validation.anthropic-key.spec.ts` (matching AC-7 scope) OR broaden to cover all schema fields with named AC tests.
- **Fixable by:** dev sub-agent

#### [M9] Secret-rotation issue deduplication can race with GitHub search index OR race with transient `gh issue list` failures
- **Sources:** ech+cr
- **Location:** `.github/workflows/secret-rotation-reminder.yml:70-77`
- **Detail:** Dedup logic: `gh issue list --search "Rotate ${SECRET_NAME} in:title" --state open --json number,title` → if exact title match found, skip; else `gh issue create`.
  - GitHub's issue search index is eventually consistent — a brand-new issue may not appear in search results for up to ~1 minute after creation. For a weekly cron this is unlikely to manifest, but if the workflow is triggered twice in the same minute (e.g., a manual `workflow_dispatch` while the cron is running), both runs could create duplicate issues.
  - More realistically: `gh issue list` returns error (network/rate-limit) → workflow defaults `EXISTING='[]'` (line 70) → if `gh issue create` ALSO fails (`continue` on line 75) the workflow continues — but no issue is created, and the failure is silently swallowed (`echo "Failed to create issue: ${TITLE}"` is the only signal).
- **Suggested fix:** Persist last-known-issue state via workflow artifact OR via a committed tracking file (e.g. `.github/secret-rotation-state.json`). Re-check after `gh issue create` that the issue now exists in the search index.
- **Fixable by:** dev sub-agent (with design discussion)

#### [M10] Dockerfile runtime stage mutates `package.json` on the fly via an inline Node script — fragile and undocumented
- **Sources:** ech+cr
- **Location:** `apps/agent-be/Dockerfile:26`
- **Detail:** The runtime stage runs an inline Node one-liner that:
  1. Reads `./package.json` (the agent-be one) and `/tmp/root-package.json` (the root one)
  2. Merges root dependencies into agent-be's dependencies
  3. Explicitly adds `ws: ^8.18.0`
  4. Writes back the merged package.json
  5. Copies root yarn.lock into the runtime stage and deletes the temp files
- This is opaque. Why is `ws` added explicitly? (The codebase uses raw `ws` in server.ts for SSE — but that's not documented inline.) Why are root deps merged? (Yarn workspaces should resolve this automatically.) The script gives the appearance of working but future maintenance requires deep understanding of Yarn Berry workspace resolution.
- **Suggested fix:** Extract the dependency-merge logic into a small build script (`scripts/docker-merge-package.js`) with comments explaining the WHY. Document the `ws` workaround with a TODO/issue link. Consider using a proper Yarn workspaces install for the runtime image instead of the merge hack.
- **Fixable by:** dev sub-agent (with design clarification on the `ws` requirement)

#### [M11] `run-migrations.spec.ts` mocks `execSync` — verifies command-STRING composition but not actual prisma execution
- **Sources:** tfa
- **Location:** `apps/agent-be/test/unit/run-migrations.spec.ts:13-21`
- **Detail:** `jest.mock('child_process', () => ({ execSync: jest.fn() }))` mocks the only side-effecting call. All tests verify the COMMAND STRING passed to `execSync` (e.g., that it doesn't contain `secretpass`/`postgresql://`/`;`; that it includes `prisma migrate deploy --config libs/database-schemas/prisma.config.ts`). None verify that prisma actually runs migrations against a real database.
- The credential-isolation tests are the genuine value of this file — verifying that `DATABASE_URL` value is NOT interpolated into the command. But the test names look broader (`"behavioural flow (AC-2: target confirmed before and after)"`), suggesting the full flow is verified.
- A future change to `scripts/run-migrations.ts` that breaks the actual prisma invocation path (e.g., wrong config file path) would NOT be caught here — the mock returns empty string, tests still pass.
- Companion to H1 — operator assumes "the migrations script is tested" because CI green; reality is "the credential-isolation contract is tested, but not the actual `prisma migrate deploy` invocation."
- **Suggested fix:** Either add a CI-tier smoke test against a Docker Postgres service container that actually runs the migration script, OR rename the file to `run-migrations.credential-isolation.spec.ts` and update the JSDoc to clarify scope.
- **Fixable by:** dev sub-agent (scope clarification) / needs CI engineering (actual smoke)

#### [M12] `deploy-failure-recovery.md` manual `railway deployment redeploy` command buries the auth caveat — operators in an incident may miss it
- **Sources:** ech+cr
- **Location:** `docs/runbooks/deploy-failure-recovery.md:121-138`
- **Detail:** Section "Manual Redeploy" presents `railway deployment redeploy --service ... --environment ... --project ... --yes` at lines 125-127. The CRITICAL caveat — that `railway deployment redeploy` may require interactive `railway login` even when `RAILWAY_TOKEN` is set — appears 11 lines later (line 138), four paragraphs down. An operator in an incident under stress would likely run the command, get "Unauthorized", and lose minutes diagnosing the cause.
- The runbook does NOT mention fall-back to `railway up` near the failed command; the operator must read down to lines 132-133 (under "Or to deploy a new image from the source:") to find the alternative.
- **Suggested fix:** Move the auth caveat to a callout blockquote immediately under the `railway deployment redeploy` command, e.g. `> WARNING: This subcommand may reject RAILWAY_TOKEN and require interactive railway login. If you need non-interactive deploy, use railway up instead (below).`
- **Fixable by:** dev sub-agent

---

### Low

#### [L1] `check-rotations.js` rejects string-typed `reminderWindowDays` — would silently default to 7 if config converted to YAML
- **Sources:** tfa
- **Location:** `.github/scripts/check-rotations.js:42`
- **Detail:** `typeof config.reminderWindowDays === 'number'` — if someone converts the JSON config to YAML and writes `reminderWindowDays: "7"`, this would fail the type check and silently fall back to the default 7. Currently OK because the config is JSON (numbers stay numbers). Low-priority robustness issue.
- **Fixable by:** dev sub-agent

#### [L2] `monitoring-setup.md` Slack webhook instructions don't reference secret rotation / revocation
- **Sources:** cr
- **Location:** `docs/runbooks/monitoring-setup.md:99-104` and `:167-176`
- **Detail:** The Slack webhook URL is stored as a string in UptimeRobot's alert contact settings. The runbook doesn't document how to rotate or revoke it (e.g., if the webhook URL leaks). Minor security hygiene gap.
- **Fixable by:** dev sub-agent

#### [L3] `deploy-failure-recovery.md` confirms Vercel rollback procedure has NEVER been end-to-end verified for this project
- **Sources:** cr
- **Location:** `docs/runbooks/deploy-failure-recovery.md:73`
- **Detail:** "A rollback test could not be performed because there is no previous READY deployment to roll back to." — `vercel rollback` (the documented recovery action) has only been confirmed to be AVAILABLE, not actually executed against this project. Real-incident usage would be the first end-to-end test.
- Original CR triage: dismissed as "documentation completeness" rather than a code defect. Captured here as low-priority because the runbook itself acknowledges the gap.
- **Suggested fix:** Schedule a one-off deployment + rollback exercise before relying on this runbook during a real incident.
- **Fixable by:** operator (manual procedure)

#### [L4] `db-restore.md` Railway production restore procedure UNVERIFIED — only local Docker Postgres was exercised
- **Sources:** cr
- **Location:** `docs/runbooks/db-restore.md:313-314`
- **Detail:** "The production Railway restore test is pending the production DATABASE_URL (not available in the development environment)" — the `volumeInstanceBackupRestore` GraphQL mutation has been documented but never actually invoked against the Railway production Postgres. Real-incident usage would be the first end-to-end test.
- Original CR triage: dismissed as "verification pending," captured here as low-priority because the operators are aware.
- **Suggested fix:** Schedule a one-off production restore test in a maintenance window before relying on this runbook during a data-loss incident.
- **Fixable by:** operator (manual procedure)

#### [L5] Dockerfile `HEALTHCHECK` does not validate `process.env.PORT` is numeric — silently builds malformed URL if misconfigured
- **Sources:** ech
- **Location:** `apps/agent-be/Dockerfile:30`
- **Detail:** Inline Node script does `'http://127.0.0.1:'+(process.env.PORT||3001)+'/health'`. If `PORT` env var is set to a non-numeric string (operator typo), `http.get` builds an invalid URL silently. The healthcheck would always fail in this configuration, marking the container unhealthy and causing endless Railway restarts.
- Not realistically an issue (PORT env would be numeric in prod).
- **Fixable by:** dev sub-agent

---

## Top 3 Critical/High Findings (At-A-Glance)

1. **[C1] Silent inactive secret rotation reminder cron** — `.github/secret-rotation-config.json:2` ships a `<YYYY-MM-DD>` placeholder that makes the weekly cron do nothing. Two tests enforce the broken state. **Needs Marius' attention** before production launch.
2. **[C2] Deploy quality gate does not verify SHA match** — `.github/workflows/deploy.yml:24-36` accepts a stale or scheduled-only "success" Test Pipeline run as proof. Can deploy untested commits. **Needs Marius' attention** — affects deploy CI contract.
3. **[H1] Deploy workflow lacks post-deploy health verification** — `.github/workflows/deploy.yml:50-65` reports "deploy success" while Railway can be unhealthy. Split-brain gap [H2] compounds this. **Can start with dev sub-agent** to add health-check steps; severity escalates if [H2] atomicity not also addressed.

---

## Severity vs Triage-Owner Map

| ID | Severity | Title (short) | Fixable by dev sub-agent? |
|----|----------|---------------|--------------------------|
| C1 | Critical | Placeholder `productionLaunchDate` silently disables rotation cron | **No — needs Marius' decision** (replace with real launch date, also need to harden tests to reject the placeholder post-launch) |
| C2 | Critical | Deploy quality gate missing SHA check | **No — needs Marius' decision** (CI contract change; affects deploy governance) |
| H1 | High | No post-deploy health verification | Yes (mechanical add of curl steps), but should be done in concert with H2 |
| H2 | High | Vercel/Railway split-brain with no automation | **No — needs Marius' decision** (deploy-order change or auto-rollback policy) |
| H3 | High | `check-rotations.js` swallows all errors silently | Yes (script exit-code contract tightening), should be done WITH C1 |
| H4 | High | Dockerfile install stage omits `.yarn/` directory | Yes (add `COPY .yarn` and run a patch-test verification) |
| H5 | High | `check-rotations.js` ms-arithmetic drift over DST / calendar bounds | Yes (switch to calendar `setDate` arithmetic, update test) |
| M1 | Medium | `env.validation.ts` permits prod boot without Daytona keys | Yes (tighten schema OR add NODE_ENV gating) |
| M2 | Medium | CORS wildcard subdomains not filtered | Yes (add `*`-substring rejection + test) |
| M3 | Medium | db-restore.spec.ts curl-flag test per-file not per-block | Yes (mirror monitoring-setup.spec.ts pattern) |
| M4 | Medium | "no `${{ }}` in run blocks" regex misses single-line `run:` | Yes (use YAML parse + step iteration) |
| M5 | Medium | "workflow env intermediaries" assertion vacuous | Yes (assert on `${{ }}` flows specifically) |
| M6 | Medium | `human.executed` regex too permissive | Yes (tighten regex) |
| M7 | Medium | deploy-workflow.spec.ts token-prefix regexes over/under-broad | Yes (use documented token-prefix patterns) |
| M8 | Medium | `env.validation.spec.ts` scope too narrow vs filename | Yes (rename OR broaden test scope) |
| M9 | Medium | Secret-rotation issue dedup race | Yes (with design discussion on state persistence) |
| M10 | Medium | Dockerfile inline package.json mutation | Yes (extract to documented build script) |
| M11 | Medium | `run-migrations.spec.ts` fully mocks execSync | Yes (rename OR add CI-tier smoke) |
| M12 | Medium | Runbook buries railway auth caveat | Yes (move caveat to callout near command) |
| L1 | Low | `reminderWindowDays` type-check rejects string | Yes (minor robustness fix) |
| L2 | Low | Slack webhook runbook lacks rotation docs | Yes (minor addition) |
| L3 | Low | Vercel rollback procedure unverified end-to-end | Operator manual procedure |
| L4 | Low | Railway production restore procedure unverified | Operator manual procedure |
| L5 | Low | Dockerfile HEALTHCHECK doesn't validate PORT numeric | Yes (minor robustness) |

**Summary of ownership split:**
- **Needs Marius' attention (5):** C1, C2, H2 (deploy architecture / governance decisions) plus H3 + H5 (must be coordinated with C1 fix or the silent-failure pattern returns).
- **Fixable by dev sub-agent (16):** H1, H4, M1-M12, L1, L2, L5 — straightforward code/test/runbook patches.
- **Operator manual procedure (2):** L3, L4 — schedule exercises before relying on runbooks.
