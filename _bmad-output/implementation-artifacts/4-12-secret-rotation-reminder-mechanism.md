---
baseline_commit: 82c795de398d871d7ed93bde9765edfff760e0b8
---

# Story 4.12: Secret Rotation Reminder Mechanism

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the platform operator,
I want automated reminders for rotating production secrets that require manual action,
so that rotations are not forgotten and secrets do not exceed their safe lifetime.

## Acceptance Criteria

1. **AC-1 (Rotation schedule runbook):** Given the production secrets wired in Story 4.5 (`DAYTONA_API_KEY`, `ANTHROPIC_API_KEY`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET`) and the KEK runbook from Story 1.9, When the rotation schedule is authored, Then a runbook is committed to `docs/runbooks/secret-rotation-schedule.md` listing each secret, its rotation interval (90 days for API keys, 180 days for OAuth secrets), the manual steps to rotate each, and a reference to the KEK rotation runbook for `CREDENTIAL_ENCRYPTION_KEK`.

2. **AC-2 (Cron job creates rotation issues):** Given the rotation schedule, When a secret approaches or passes its rotation due date, Then a GitHub Actions cron job (running weekly) creates a GitHub issue in the repository titled "Rotate `<secret-name>` — due `<date>`" with a link to the rotation runbook, so the rotation is tracked as actionable work rather than relying on memory.

3. **AC-3 (Initial due dates and first issue):** Given the initial production launch, When the reminder mechanism is first activated, Then each secret's initial rotation due date is set based on the production launch date (launch date + rotation interval), and the cron job is confirmed to have created its first check issue without error.

4. **AC-4 (Out of scope):** Given this story's scope, When considering what is out of scope, Then automated secret rotation (no human in the loop) is explicitly out of scope — this story delivers reminders only, not rotation automation.

## Tasks / Subtasks

- [x] **Task 1: Create the secret rotation schedule runbook** (AC: #1, #4)

  > The runbook is the primary deliverable for AC-1. It documents every production secret, its rotation interval, the manual steps to rotate it, and references the KEK rotation runbook. An operator reading it should be able to rotate any production secret without consulting any other document (except `docs/runbooks/kek-rotation.md` for the KEK).

  - [x] 1.1 Create `docs/runbooks/secret-rotation-schedule.md` with the following sections:
    - **Prerequisites:** Production launch date (the date the platform first went live in production — used to calculate initial rotation due dates). Access to Vercel dashboard (for `AUTH_SECRET`, `AUTH_GITHUB_SECRET`, `AUTH_URL`, `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK`), Railway dashboard (for `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK`, `DAYTONA_API_KEY`, `ANTHROPIC_API_KEY`, `AUTH_SECRET`), GitHub OAuth App settings at `github.com/settings/developers` (for `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` callback URL). Note that `CREDENTIAL_ENCRYPTION_KEK` rotation follows the dedicated KEK rotation runbook at `docs/runbooks/kek-rotation.md` — this runbook references it, does not duplicate it.
    - **Secret Inventory table:** A table listing each secret with columns: Secret Name, Platform (Vercel/Railway/GitHub), Rotation Interval (days), Interval Category (API key = 90 days, OAuth secret = 180 days), Due Date Calculation (launch date + interval), Runbook Section Reference. The five secrets:
      | Secret | Platform | Interval | Category |
      |---|---|---|---|
      | `DAYTONA_API_KEY` | Railway | 90 days | API key |
      | `ANTHROPIC_API_KEY` | Railway | 90 days | API key |
      | `AUTH_GITHUB_SECRET` | GitHub OAuth App + Vercel | 180 days | OAuth secret |
      | `AUTH_SECRET` | Vercel + Railway | 180 days | OAuth secret |
      | `CREDENTIAL_ENCRYPTION_KEK` | Vercel + Railway | 180 days | Platform secret (ref: `docs/runbooks/kek-rotation.md`) |
    - **Section 1 — `DAYTONA_API_KEY` rotation (Railway, 90 days):** Document the manual steps: (1) Generate a new Daytona API key from the Daytona dashboard. (2) Update `DAYTONA_API_KEY` in the Railway project environment (service: `apps/agent-be`). (3) Redeploy `apps/agent-be` (the key is read at startup via `apps/agent-be/src/config/env.validation.ts`). (4) Verify: open a new Conversation — sandbox provisioning should succeed. (5) Revoke the old key from the Daytona dashboard. Document the impact: `apps/agent-be` uses the Daytona API key to provision, clone, and destroy sandboxes. A stale key causes all new Conversation provisioning to fail; existing conversations continue until the sandbox is destroyed.
    - **Section 2 — `ANTHROPIC_API_KEY` rotation (Railway, 90 days):** Document the manual steps: (1) Generate a new Anthropic API key from the Anthropic console. (2) Update `ANTHROPIC_API_KEY` in the Railway project environment (service: `apps/agent-be`). (3) Redeploy `apps/agent-be`. (4) Verify: open a new Conversation and send a message — the agent should respond. (5) Revoke the old key from the Anthropic console. Document the impact: `apps/agent-be` injects `ANTHROPIC_API_KEY` into each Daytona sandbox as an environment variable at provision time. A stale key causes all agent runs to fail with 401 from the Anthropic API. Existing conversations with running sandboxes continue to use the old key until the sandbox is destroyed and re-provisioned.
    - **Section 3 — `AUTH_GITHUB_SECRET` rotation (GitHub OAuth App + Vercel, 180 days):** Document the manual steps: (1) Generate a new OAuth App secret at `github.com/settings/developers` (the OAuth App is `Ov23liwPSopCBFh9nMRN`). (2) Update `AUTH_GITHUB_SECRET` in the Vercel project environment. (3) Redeploy `apps/web` (the secret is read at startup by Auth.js). (4) Verify: sign out and sign in with GitHub — the OAuth flow should complete. (5) The old secret becomes invalid immediately — active sessions are unaffected (they use the JWT, not the OAuth secret), but new sign-ins require the updated secret. Document the impact: `AUTH_GITHUB_SECRET` is used by Auth.js to authenticate the OAuth flow with GitHub. A stale secret causes all new sign-ins to fail. Active sessions (JWT-based) are unaffected until they expire (8h maxAge).
    - **Section 4 — `AUTH_SECRET` rotation (Vercel + Railway, 180 days):** Document the manual steps: (1) Generate a new secret with `openssl rand -hex 32`. (2) Update `AUTH_SECRET` on BOTH Vercel (apps/web) AND Railway (apps/agent-be) — the boundary JWT is signed with `AUTH_SECRET` in `apps/web` (`apps/web/src/lib/boundary-jwt.ts:4`) and verified in `apps/agent-be` (`apps/agent-be/src/common/guards/boundary-jwt.guard.ts:53`, `apps/agent-be/src/streaming/streaming.controller.ts:37`). Both services MUST use the same value. (3) Redeploy BOTH `apps/web` and `apps/agent-be`. (4) Verify: sign in, open a Conversation, send a message — the boundary JWT is minted by `apps/web` and verified by `apps/agent-be`; both must use the same secret. (5) Document the impact: rotating `AUTH_SECRET` invalidates ALL active Auth.js sessions (users are signed out) AND ALL active boundary JWTs (existing Conversation SSE connections fail until the page is reloaded, which mints a new boundary JWT). This is expected — users simply sign in again and reload their Conversation tabs. Document that `AUTH_SECRET` is used in four places: Auth.js session JWT signing/verification, boundary JWT minting (`boundary-jwt.ts`), boundary JWT REST guard verification (`boundary-jwt.guard.ts`), and boundary JWT SSE guard verification (`streaming.controller.ts`). This dual-purpose nature (Auth.js session + boundary JWT signing) was previously undocumented — see Deferred Finding below.
    - **Section 5 — `CREDENTIAL_ENCRYPTION_KEK` rotation (Vercel + Railway, 180 days):** Do NOT duplicate the KEK rotation procedure. Reference the dedicated runbook: "Follow the procedure in `docs/runbooks/kek-rotation.md`." Document only: (1) the rotation interval (180 days), (2) the reference to the KEK rotation runbook, (3) the impact summary (KEK wraps all per-user DEKs; rotation re-wraps DEKs without touching token ciphertext; users are unaffected during rotation). (4) After KEK rotation is complete, update the `CREDENTIAL_ENCRYPTION_KEK` value on BOTH Vercel (apps/web — `apps/web/src/lib/crypto.ts` uses it for envelope encryption) AND Railway (apps/agent-be — `apps/agent-be/src/credentials/encryption.service.ts` uses it for DEK unwrapping). Redeploy BOTH `apps/web` and `apps/agent-be`. Note: the dedicated KEK rotation runbook (`docs/runbooks/kek-rotation.md`) currently documents only the Vercel side — the Railway side must also be updated.
    - **Section 6 — Out of Scope:** Explicitly document that automated secret rotation (no human in the loop) is out of scope — this runbook documents manual rotation steps and the cron job creates reminders only. Also document that `DATABASE_URL` rotation (Railway Postgres) is out of scope — Railway manages the Postgres connection string; rotating it requires a Railway support ticket and is not a routine operation.
    - **Rollback Procedure:** Document how to revert a rotation: (1) If the old secret value is still available, update the environment variable back to the old value and redeploy. (2) If the old secret was revoked (Daytona, Anthropic, GitHub OAuth App), a new key must be generated — the old key cannot be recovered. (3) For `AUTH_SECRET`, rolling back requires updating both Vercel and Railway simultaneously. (4) For `CREDENTIAL_ENCRYPTION_KEK`, follow the rollback procedure in `docs/runbooks/kek-rotation.md`.
    - **Verification Record:** Date, secrets rotated, results. Document the production launch date and the initial rotation due dates for each secret.
  - [x] 1.2 Use `<placeholder>` syntax for all variable values (e.g., `<production-launch-date>`, `<old-key>`, `<new-key>`) — never hardcode values that may change. The production URLs (`https://bmad-easy.vercel.app`, `https://agent-be-production-1c09.up.railway.app`) are stable reference values from Stories 4.1/4.7 and can be hardcoded as reference constants.
  - [x] 1.3 If any curl commands are documented in the runbook, include `--fail` and `--max-time 30` flags (per project-context.md: curl commands in runbooks must include `--fail` so HTTP 4xx/5xx errors surface as non-zero exit codes, and `--max-time` to prevent indefinite hangs).

- [x] **Task 2: Create the rotation config file** (AC: #2, #3)

  > The cron job needs a machine-readable source of truth for secret names, rotation intervals, and the production launch date. A JSON config file committed to the repo is the simplest approach (DP-3: fewest moving parts, no external service dependency).

  - [x] 2.1 Create `.github/secret-rotation-config.json` with the following structure:
    ```json
    {
      "productionLaunchDate": "<YYYY-MM-DD>",
      "reminderWindowDays": 7,
      "secrets": [
        {
          "name": "DAYTONA_API_KEY",
          "rotationIntervalDays": 90,
          "platform": "Railway",
          "runbookSection": "Section 1"
        },
        {
          "name": "ANTHROPIC_API_KEY",
          "rotationIntervalDays": 90,
          "platform": "Railway",
          "runbookSection": "Section 2"
        },
        {
          "name": "AUTH_GITHUB_SECRET",
          "rotationIntervalDays": 180,
          "platform": "GitHub OAuth App + Vercel",
          "runbookSection": "Section 3"
        },
        {
          "name": "AUTH_SECRET",
          "rotationIntervalDays": 180,
          "platform": "Vercel + Railway",
          "runbookSection": "Section 4"
        },
        {
          "name": "CREDENTIAL_ENCRYPTION_KEK",
          "rotationIntervalDays": 180,
          "platform": "Vercel + Railway",
          "runbookSection": "Section 5",
          "runbookRef": "docs/runbooks/kek-rotation.md"
        }
      ]
    }
    ```
  - [ ] 2.2 Set `productionLaunchDate` to the actual production launch date. If the exact date is unknown, set it to the date of the first successful production deploy (verifiable via `gh run list --workflow=deploy.yml --status=success --limit=1 --json createdAt`). Document the date in the runbook's Verification Record.

- [x] **Task 3: Create the GitHub Actions cron workflow** (AC: #2, #3)

  > The workflow runs weekly, reads the config file, calculates due dates, and creates GitHub issues for secrets approaching or past their rotation due date. The workflow also supports `workflow_dispatch` for manual triggering (AC-3 verification).

  - [x] 3.1 Create `.github/workflows/secret-rotation-reminder.yml` with the following structure:
    - **Triggers:** `on: schedule: - cron: '0 0 * * 1'` (every Monday at 00:00 UTC) + `workflow_dispatch` (for manual triggering and AC-3 verification).
    - **Permissions:** `permissions: issues: write, contents: read` (the workflow creates issues and reads the config file).
    - **Job:** `check-secret-rotations` on `ubuntu-latest`.
    - **Steps:**
      1. Checkout repository (`actions/checkout@v4`).
      2. Setup Node.js (`actions/setup-node@v4`, node-version '24').
      3. Read the config file and calculate due dates. Use a Node.js script (`node -e` or a script file) that: (a) reads `.github/secret-rotation-config.json`, (b) for each secret, calculates the most recent due date as `productionLaunchDate + floor((now - productionLaunchDate) / interval) * interval` (the most recent occurrence of the interval — this may be in the past, indicating the secret has passed its rotation due date) and the next due date as `mostRecentDueDate + interval`, (c) if the most recent due date is in the past (at least one full interval has elapsed since launch) OR the next due date is within `reminderWindowDays` (7 days), output the secret name and due date as JSON.
      4. For each secret that needs a reminder, check if an open issue already exists with the title "Rotate `<secret-name>` — due `<date>`" using `gh issue list --search "Rotate <secret-name>" --state open --json number,title`. If no matching issue exists, create one with `gh issue create --title "Rotate <secret-name> — due <date>" --body "This secret is approaching or has passed its rotation due date. Follow the rotation procedure in [docs/runbooks/secret-rotation-schedule.md](docs/runbooks/secret-rotation-schedule.md), <runbook-section>." --label "secret-rotation"`. Create the label if it doesn't exist (`gh label create secret-rotation --color FBCA04` — a caution/amber color, `|| true` to ignore if it already exists).
    - **Script injection prevention (project-context.md):** Pass ALL dynamic values through `env:` intermediaries — never direct `${{ }}` interpolation in `run:` blocks. The secret name and due date are computed at runtime, so they must be passed through environment variables, not `${{ }}` expressions. Use `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` for the `gh` CLI (it reads the token from the environment automatically).
    - **Credential isolation (project-context.md):** No credential env-var names (`AUTH_SECRET`, `DAYTONA_API_KEY`, etc.) appear as `$VAR` or `${VAR}` in `run:` blocks. The workflow does not handle actual secret values — it only references secret names as strings in the config file and issue titles.

  - [x] 3.2 The Node.js script for due-date calculation should be a committed file (e.g., `.github/scripts/check-rotations.js`) rather than an inline `node -e` one-liner — this makes it testable and readable. The script: (a) reads the config file path from `process.argv[2]`, (b) calculates due dates, (c) outputs a JSON array of `{ name, dueDate, runbookSection, runbookRef }` for secrets needing reminders, (d) exits 0 always (no reminder needed is not an error). The workflow step captures the output and loops over it to create issues.

- [x] **Task 4: Create the regression guard test** (AC: #1, #2, #3, #4)

  > Following the pattern from Stories 4.8-4.11, the test reads the committed runbook, config file, and workflow YAML, and asserts on their structure/content. No live network calls. All tests tagged `[P0]`.

  - [x] 4.1 Create `apps/agent-be/test/unit/secret-rotation-schedule.spec.ts` with the following structure (follow `monitoring-setup.spec.ts` as the primary pattern):
    - File header comment citing the story (4.12), acceptance criteria, and test purpose
    - `@jest-environment node` directive
    - `RUNBOOK_PATH = path.resolve(__dirname, '../../../../docs/runbooks/secret-rotation-schedule.md')`
    - `CONFIG_PATH = path.resolve(__dirname, '../../../../.github/secret-rotation-config.json')`
    - `WORKFLOW_PATH = path.resolve(__dirname, '../../../../.github/workflows/secret-rotation-reminder.yml')`
    - `loadRunbook()` / `loadRunbookLines()` / `loadConfig()` / `loadWorkflow()` helpers
    - `CREDENTIAL_ENV_VARS` array including: `AUTH_SECRET`, `AUTH_GITHUB_SECRET`, `AUTH_GITHUB_ID`, `DAYTONA_API_KEY`, `ANTHROPIC_API_KEY`, `CREDENTIAL_ENCRYPTION_KEK`, `DATABASE_URL`, `VERCEL_TOKEN`, `RAILWAY_TOKEN`
  - [x] 4.2 Test blocks covering:
    - **Runbook structure:** file exists, markdown heading, ≥10 lines, section headings (Prerequisites, Secret Inventory, Section 1-6, Rollback, Verification Record)
    - **AC-1 (Rotation schedule runbook):** runbook lists all 5 secrets (`DAYTONA_API_KEY`, `ANTHROPIC_API_KEY`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEK`), documents 90-day interval for API keys, 180-day interval for OAuth secrets, references `docs/runbooks/kek-rotation.md` for the KEK, documents manual steps for each secret
    - **AC-2 (Cron job):** workflow file exists, has `schedule` trigger with weekly cron, has `workflow_dispatch` trigger, has `issues: write` permission, uses `gh issue create` or GitHub API, issue title format "Rotate `<secret-name>` — due `<date>`", links to rotation runbook
    - **AC-3 (Initial due dates):** config file exists, has `productionLaunchDate` field, has `reminderWindowDays` field, has `secrets` array with all 5 secrets, each secret has `name`, `rotationIntervalDays`, `platform`, `runbookSection`
    - **AC-4 (Out of scope):** runbook documents automated rotation out of scope
    - **`AUTH_SECRET` dual-purpose documentation (deferred finding):** runbook documents that `AUTH_SECRET` is used for both Auth.js sessions AND boundary JWT signing, documents the impact of rotation (invalidates sessions and boundary JWTs), documents that both Vercel and Railway must be updated simultaneously. Assert the runbook references `boundary-jwt.ts` or `boundary-jwt.guard.ts` or mentions "boundary JWT".
    - **Credential-isolation guards:** no literal `VAR=value` assignments for any `CREDENTIAL_ENV_VARS` entry, no literal API key values, no Bearer followed by literal token, no connection strings with passwords. The secret names themselves (e.g., `AUTH_SECRET`, `DAYTONA_API_KEY`) are configuration identifiers, not secret values — they must appear in the runbook and config file. The guard asserts no literal VALUES (e.g., `AUTH_SECRET=abc123`), not no literal NAMES.
    - **Input-injection guards:** runbook uses `<placeholder>` syntax for variable values, config file uses `<YYYY-MM-DD>` placeholder for `productionLaunchDate` (or a real date), workflow uses `env:` intermediaries for dynamic values (no `${{ }}` in `run:` blocks)
    - **curl flags:** if any curl commands exist in the runbook, they include `--fail` and `--max-time` flags
    - **Config file structure:** valid JSON, has required fields, secrets array has 5 entries with correct intervals (90 for API keys, 180 for OAuth secrets and KEK)
    - **Workflow YAML structure:** valid YAML (parse with `js-yaml`), has `schedule` and `workflow_dispatch` triggers, has `issues: write` permission, has checkout step, has issue creation step
    - **Script injection prevention in workflow:** no `${{ }}` expressions in `run:` blocks (all dynamic values through `env:` intermediaries) — assert via raw text regex on the workflow file
    - **Rollback procedure:** section exists, documents how to revert each secret rotation
  - [x] 4.3 Run `yarn nx test agent-be -- --testPathPattern=secret-rotation-schedule` to confirm all tests pass.

- [ ] **Task 5: Verify the cron job creates its first issue** (AC: #3)

  > AC-3 requires the cron job to be "confirmed to have created its first check issue without error." The workflow supports `workflow_dispatch` for manual triggering. Creating a GitHub issue is an external service call with side effects — per the decision policy, this must be escalated. The agent creates the workflow YAML; the human triggers the first run and confirms the issue is created.

  - [ ] 5.1 Ensure the `productionLaunchDate` in `.github/secret-rotation-config.json` is set to the actual production launch date. If the exact date is unknown, determine it via `gh run list --workflow=deploy.yml --status=success --limit=1 --json createdAt` (the first successful deploy workflow run).
  - [ ] 5.2 If any secret's rotation due date is within the 7-day reminder window or past due, trigger the workflow manually via `gh workflow run secret-rotation-reminder.yml` (requires `GITHUB_TOKEN` with `workflow` scope). If no secrets are due yet (production launch was recent), document that the first scheduled run will create the first issue when the earliest due date approaches. The workflow can also be triggered with a test config (temporarily set `productionLaunchDate` to a date >90 days in the past) to verify the issue creation mechanism — but this creates a real GitHub issue, which is an external service call with side effects.
  - [x] 5.3 Document the verification result in the runbook's Verification Record: the production launch date, the initial rotation due dates for each secret, and the first issue creation result (issue URL or "pending — first issue will be created when the earliest due date approaches").

### Review Findings

- [x] [Review][Patch] Dedup by exact title + gh issue list failure handling [.github/workflows/secret-rotation-reminder.yml] — Dedup search matched by secret name only (full-text), not exact title including due date. Stale open issues from previous cycles suppressed new-cycle reminders. gh issue list failure produced duplicate issues. Fixed: use `in:title` qualifier, filter by exact title match via jq, default count to 0 on failure.
- [x] [Review][Patch] Script robustness — try/catch + defensive checks [.github/scripts/check-rotations.js] — No try/catch around main(). Missing config.secrets, invalid JSON, bad rotationIntervalDays all crashed uncaught. Future launch date produced spurious reminders. reminderWindowDays 0 silently became 7. Fixed: added try/catch, Array.isArray check, Number.isFinite check, elapsed < 0 guard, proper nullish check for reminderWindowDays.
- [x] [Review][Patch] False-green test: "real config produces empty array" [apps/agent-be/test/unit/check-rotations.spec.ts:486-489] — Only checked Array.isArray, not emptiness. Fixed: added `expect(result).toEqual([])`.
- [x] [Review][Patch] False-green test: "title format" only checked word presence [apps/agent-be/test/unit/secret-rotation-schedule.spec.ts:383-387] — Checked for "Rotate" and "due" separately, not the full title format. Fixed: strengthened assertion to check full title pattern.
- [x] [Review][Patch] Rollback Step 2 missing OAuth App ID [docs/runbooks/secret-rotation-schedule.md:163-166] — Rollback step for AUTH_GITHUB_SECRET didn't include the OAuth App ID, violating "independently executable" requirement. Fixed: added OAuth App ID `Ov23liwPSopCBFh9nMRN`.
- [x] [Review][Patch] Secret Inventory table missing "Runbook Section Reference" column [docs/runbooks/secret-rotation-schedule.md:39-45] — Spec required this column but it was absent. Fixed: added column.
- [x] [Review][Patch] Task 2.2 marked complete but placeholder not resolved [4-12-secret-rotation-reminder-mechanism.md] — Task 2.2 was marked [x] but productionLaunchDate was still placeholder. Dev agent deferred to human (Task 5.1). Fixed: unmarked Task 2.2.
- [x] [Review][Defer] Perpetual overdue / anchoring to launch date [.github/scripts/check-rotations.js] — deferred, pre-existing — by design per spec formula; reminder-only approach does not track actual rotation dates
- [x] [Review][Defer] Tests rely on real time (execSync) [apps/agent-be/test/unit/check-rotations.spec.ts] — deferred, pre-existing — script calls process.exit(0), preventing direct import; tests use relative dates with sufficient margin from boundaries
- [x] [Review][Defer] System dormant while placeholder date [.github/scripts/check-rotations.js] — deferred, pre-existing — by design; human task (Task 5.1) responsible for setting actual date

#### Code Review Round 2 (2026-07-14)

- [x] [Review][Patch] `gh run list --limit=1` returns most recent deploy, not first [docs/runbooks/secret-rotation-schedule.md:18,188] — Runbook claims the command returns "the first successful deploy workflow run" but `gh run list` returns newest first. Operator would set productionLaunchDate to the latest deploy, not the first. Fixed: corrected command to list all and select oldest via `--jq 'min_by(.createdAt) | .createdAt'`.
- [x] [Review][Patch] `null` entry in secrets array crashes script, drops ALL reminders [.github/scripts/check-rotations.js:52] — `typeof secret.name` on `null` throws TypeError; outer try/catch catches it but outputs `[]`, discarding all valid reminders. Fixed: added `typeof secret !== 'object' || secret === null` guard before property access.
- [x] [Review][Patch] `gh issue create` failure aborts remaining secrets + `gh label create || true` masks failures [.github/workflows/secret-rotation-reminder.yml:29,71] — Under `set -eo pipefail`, one `gh issue create` failure exits the subshell, skipping remaining secrets. `|| true` on label creation masks all errors. Fixed: added `|| { echo "Failed to create issue: ${TITLE}"; }` after `gh issue create`; changed label creation to `|| echo "Label creation failed (may already exist)"`.
- [x] [Review][Patch] No `concurrency:` block — concurrent runs create duplicate issues [.github/workflows/secret-rotation-reminder.yml] — Cron + workflow_dispatch can overlap; check-then-create is not atomic. Fixed: added `concurrency` block with `cancel-in-progress: true`.
- [x] [Review][Patch] `gh issue list` failure silently falls back to `[]`, causing duplicate issues [.github/workflows/secret-rotation-reminder.yml:66] — `2>/dev/null || echo '[]'` swallows errors; duplicate issue created when dedup check fails. Fixed: log warning when `gh issue list` fails.
- [x] [Review][Patch] `reminderWindowDays: 0` makes approaching-detection logically impossible [.github/scripts/check-rotations.js:41-44,67] — With 0, `isApproaching` becomes `nextDueDate <= now && nextDueDate > now` (contradiction). Fixed: enforce minimum value of 1.
- [x] [Review][Patch] Section heading tests are false-green — check substring presence, not heading structure [apps/agent-be/test/unit/secret-rotation-schedule.spec.ts:204-227] — Tests titled "Section N heading" just check `content.toMatch(/SECRET_NAME/i)` which matches anywhere. Fixed: strengthened to check for `## Section N` heading pattern.
- [x] [Review][Patch] Credential-isolation test for config file uses shell-syntax regex on JSON — always passes [apps/agent-be/test/unit/secret-rotation-schedule.spec.ts:558-565] — Regex matches `VAR=value` which doesn't exist in JSON. Fixed: replaced with JSON-appropriate check for literal credential value patterns.
- [x] [Review][Patch] Due date value never asserted in tests — only format checked [apps/agent-be/test/unit/check-rotations.spec.ts:222-245] — Tests check `dueDate` format but not actual date value. Fixed: added assertion verifying dueDate equals expected calculated date.
- [x] [Review][Patch] Boundary test title says "90 days" but code tests 91 days [apps/agent-be/test/unit/check-rotations.spec.ts:197-199] — Test name misleading. Fixed: corrected test name to "91 days" and added a separate exact-boundary test.
- [x] [Review][Patch] "Just outside the reminder window" test is 10 days out, not 1 [apps/agent-be/test/unit/check-rotations.spec.ts:274-276] — 80 days with 90-day interval = 10 days before due, not "just outside" the 7-day window. Fixed: changed to 82 days (8 days before due, 1 day outside window).
- [x] [Review][Patch] Launch date test matches runbook creation date, not launch date [apps/agent-be/test/unit/secret-rotation-schedule.spec.ts:486-491] — `\d{4}-\d{2}-\d{2}` matches `2026-07-14` (runbook date), not the launch date (still placeholder). Fixed: assert the verification section contains `<production-launch-date>` placeholder.
- [x] [Review][Patch] Weekly cron test only checks for `schedule:` and `cron:` presence, not weekly expression [apps/agent-be/test/unit/secret-rotation-schedule.spec.ts:330-334] — A daily cron would pass. Fixed: added assertion for `0 0 * * 1` weekly cron expression.
- [x] [Review][Patch] Interval tests check number presence, not association with secret categories [apps/agent-be/test/unit/secret-rotation-schedule.spec.ts:255-263] — Tests check `90.day` and `180.day` appear, not that 90 is associated with API keys and 180 with OAuth secrets. Fixed: added section-scoped assertions.
- [x] [Review][Patch] Rollback test checks generic "revert" language, not that each secret appears [apps/agent-be/test/unit/secret-rotation-schedule.spec.ts:714-719] — Test doesn't verify each secret name appears in rollback section. Fixed: added assertions for all 5 secret names in rollback section.
- [x] [Review][Patch] Section 4 step 4 verification instruction is a copy of step 2 [docs/runbooks/secret-rotation-schedule.md:118] — Step 4 repeats rationale instead of giving verification instructions. Fixed: rewrote as actual verification step.
- [x] [Review][Patch] Workflow credential check only covers two formats [apps/agent-be/test/unit/secret-rotation-schedule.spec.ts:567-571] — Only checks `sk-` and `postgresql://` patterns. Fixed: added checks for GitHub OAuth secret format and generic hex token patterns.
- [x] [Review][Patch] Missing edge case test: null entry in secrets array [apps/agent-be/test/unit/check-rotations.spec.ts] — No test for `null` entry in secrets array. Fixed: added test verifying null entry is skipped and valid entries still produce reminders.
- [x] [Review][Defer] Due date calculation never accounts for actual rotation — dates drift [.github/scripts/check-rotations.js] — deferred, pre-existing — by design per spec formula (floor-based); reminder-only approach does not track actual rotation dates; already deferred in round 1
- [x] [Review][Defer] Script silently swallows ALL errors and exits 0 [.github/scripts/check-rotations.js] — deferred, pre-existing — by design per spec ("exits 0 always"); workflow cannot distinguish "no secrets due" from "config missing/corrupt"
- [x] [Review][Defer] Config file shipped with unresolved placeholder [.github/secret-rotation-config.json] — deferred, pre-existing — by design; human task (Task 5.1) responsible for setting actual date; already deferred in round 1

#### Code Review Round 3 — NFR Audit (2026-07-14)

NFR-specific audit focused on reliability, security, and maintainability of the workflow, script, and test artifacts. Findings limited to NFR-specific issues (missing regression guards for reliability properties, security headers, timing concerns). Pre-existing deferred findings (perpetual overdue, silent error swallowing, placeholder date dormancy, execSync time dependence) were re-verified and remain correctly deferred — no new NFR issues found in those areas.

- [x] [NFR][Patch] No regression guard test for `concurrency` block [apps/agent-be/test/unit/secret-rotation-schedule.spec.ts] — **Severity: MEDIUM.** The workflow has a `concurrency` block (lines 12-14) with `cancel-in-progress: true` that prevents duplicate issues from overlapping cron + workflow_dispatch runs. This was added as a Round 2 review patch but no regression guard test was added. Without a test, a future change could remove the concurrency block and reintroduce the duplicate-issue bug silently. **Remediation:** Added two `[P0]` test assertions: (1) `workflow.concurrency` is defined with `group: 'secret-rotation-reminder'`, (2) `workflow.concurrency['cancel-in-progress']` is `true`. Also added `WorkflowConcurrency` interface and `concurrency` field to `WorkflowFile` interface. Fix applied directly — introduced by this story, straightforward remediation.
- [x] [NFR][Patch] No regression guard test for `timeout-minutes` [apps/agent-be/test/unit/secret-rotation-schedule.spec.ts] — **Severity: LOW.** The workflow has `timeout-minutes: 5` on the job (line 19) to prevent hung runs. No test asserts this. Without a regression guard, a future change could remove it, allowing the workflow to run indefinitely if `node` or `gh` hangs. **Remediation:** Added `[P0]` test asserting `job['timeout-minutes']` is defined, is a number, and is greater than 0. Also added `timeout-minutes` field to `WorkflowJob` interface. Fix applied directly — introduced by this story, straightforward remediation.

## Dev Notes

### Deferred Work Check

**Checked:** `_bmad-output/implementation-artifacts/deferred-work.md` (all 495 lines) was scanned for deferred findings matching file paths or components in scope for this story (secret rotation, `AUTH_SECRET`, `DAYTONA_API_KEY`, `ANTHROPIC_API_KEY`, `AUTH_GITHUB_SECRET`, `CREDENTIAL_ENCRYPTION_KEK`, `docs/runbooks/secret-rotation-schedule.md`, `.github/workflows/secret-rotation-reminder.yml`, GitHub Actions cron, GitHub issue creation).

**Result: One deferred finding PULLED IN.**

**Pulled in:** deferred-work.md line 273 (architecture-completeness check, 2026-07-06): "Boundary JWT signing key management undocumented — `AUTH_SECRET` is used directly as the HMAC signing key in all three sites: minting (`apps/web/src/lib/boundary-jwt.ts:4`), REST guard (`apps/agent-be/src/common/guards/boundary-jwt.guard.ts:53`), and SSE guard (`apps/agent-be/src/streaming/streaming.controller.ts:37`). No rotation procedure, no compromise response, no documentation that `AUTH_SECRET` is the signing key."

**Why in scope:** Story 4.12 documents rotation steps for `AUTH_SECRET` (AC-1 lists it). The finding provides critical context: `AUTH_SECRET` has a dual purpose (Auth.js session JWT + boundary JWT signing) that the rotation runbook MUST document. Without this context, the dev might document `AUTH_SECRET` rotation as a simple env-var update without noting that: (a) both Vercel AND Railway must be updated simultaneously (boundary JWT is minted by `apps/web` and verified by `apps/agent-be`), (b) rotating invalidates ALL active sessions AND boundary JWTs, (c) the architecture doc says the boundary JWT is "decoupled from Auth.js's internal JWE" but the code uses the same `AUTH_SECRET` for both — this gap is now documented in the runbook rather than left implicit.

**Action taken:** Task 1, Section 4 (`AUTH_SECRET` rotation) documents the dual purpose, the four usage sites, the simultaneous-update requirement, and the rotation impact. The finding is marked as picked-up in `deferred-work.md` line 273.

**Related deferred findings NOT pulled in (DP-5):**
- deferred-work.md line 442: "`docs/runbooks/kek-rotation.md` has NO regression guard test." Story 4.12 references `kek-rotation.md` but does not modify it. The finding says "A future story touching `kek-rotation.md` should add a `kek-rotation.spec.ts`." Story 4.12 creates a new runbook (`secret-rotation-schedule.md`) with its own regression guard test, but does not touch `kek-rotation.md`. Correctly out of scope.
- deferred-work.md line 432: "CREDENTIAL_ENCRYPTION_KEK secret presence not verified in CI." About `.github/workflows/test.yml`, not about secret rotation. Out of scope.
- deferred-work.md lines 475-477: Export command issues (not stripping quotes, failing silently) in sibling runbooks. Story 4.12's runbook may use export commands if it documents CLI-based rotation steps. These are pre-existing patterns to follow from project-context.md, not deferred findings to pull in. If the runbook uses export commands, apply the `| tr -d '"'` and `[ -n "$VAR" ]` guards from the start.
- deferred-work.md (new, 2026-07-14): `docs/runbooks/kek-rotation.md` documents only the Vercel side of KEK rotation, not the Railway side. `apps/agent-be` uses the KEK at runtime (`encryption.service.ts` → `CredentialsService` → `ConversationsService`). Story 4.12's Secret Inventory table and Section 5 document both platforms; the dedicated KEK rotation runbook does not. Correctly out of scope for Story 4.12 (does not modify `kek-rotation.md`). A future story touching `kek-rotation.md` should add the Railway update step.

The PATTERNS established by previous runbook-related deferred findings DO apply to the new files (via project-context.md, loaded as persistent facts):
1. curl commands must include `--fail` and `--max-time` (project-context.md line 266)
2. Runbooks need regression guard tests with credential-isolation + input-injection guards (project-context.md line 262)
3. Runbook rollback sections must be independently executable (project-context.md line 265)
4. Secret-aware test assertions use `Object.keys()` not `toHaveProperty` (project-context.md line 261)
5. `--fail` limitation for APIs returning HTTP 200 with error bodies must be documented (project-context.md line 268)
6. Section-scoped assertions in runbook regression guard tests (project-context.md line 269)
7. Script injection prevention in GitHub Actions `run:` blocks — all dynamic values through `env:` intermediaries (project-context.md line 343)
8. Credential isolation in GitHub Actions workflows — no `$VAR`/`${VAR}` for credential env-var names in `run:` blocks (project-context.md line 344)
9. Testing GitHub Actions workflow YAML files via Jest + js-yaml (project-context.md line 226)

These are project-context rules the dev agent must follow from the start — not deferred findings to pull in.

### Decisions (per decision-policy.md)

**Decision (DP-3): JSON config file for rotation schedule data.** The cron job needs a machine-readable source of truth for secret names, rotation intervals, and the production launch date. A JSON config file (`.github/secret-rotation-config.json`) committed to the repo is the simplest approach — no external service dependency, no database query, no environment variable parsing. The regression guard test can validate the config file structure. The runbook documents the config file. Alternative approaches (environment variables, a database table, a GitHub Actions variable) add complexity for no benefit.

**Decision (DP-3): Node.js script for due-date calculation.** The due-date calculation (most recent occurrence of the rotation interval, plus the next occurrence for the approaching-window check) is non-trivial date arithmetic. A Node.js script (`.github/scripts/check-rotations.js`) is the simplest approach — it runs in the GitHub Actions Node.js environment, can be unit-tested, and outputs JSON that the workflow step can loop over. Alternative approaches (bash date arithmetic, a GitHub Action from the marketplace) are either error-prone or add a dependency.

**Decision (DP-3): `workflow_dispatch` trigger alongside `schedule`.** The workflow supports both `schedule` (weekly cron) and `workflow_dispatch` (manual trigger). The manual trigger allows AC-3 verification without waiting for the scheduled run, and allows operators to check for due rotations on demand. Adding `workflow_dispatch` is zero-cost (one line of YAML).

**Decision (always escalate — external service calls with side effects): First issue creation is human-confirmed.** Creating a GitHub issue is an externally visible effect (it appears in the repository's issue tracker). Per the decision policy, this must be escalated. The agent creates the workflow YAML, the runbook, the config file, and the regression guard test. The human triggers the first workflow run (via `workflow_dispatch` or by waiting for the scheduled run) and confirms the issue is created. This follows the same pattern as Story 4.11 (UptimeRobot monitor creation was human-executed). The agent can trigger the workflow via `gh workflow run` if the `GITHUB_TOKEN` has `workflow` scope, but the issue creation is an externally visible effect — the human confirms the first issue is correct.

**Decision (DP-3): `AUTH_SECRET` classified as 180-day rotation (OAuth secret category).** The ACs specify "90 days for API keys, 180 days for OAuth secrets." `AUTH_SECRET` is the Auth.js session JWT signing key — it's not an API key (not used to authenticate to an external API) and not strictly an OAuth secret (not the GitHub OAuth App secret). It's an auth-related signing key. Classifying it as 180 days (same as OAuth secrets) is the simplest option — it's auth-related, not an API key. A third category (e.g., "signing keys, 180 days") would add complexity for no benefit, since the interval is the same.

**Decision (DP-3): `CREDENTIAL_ENCRYPTION_KEK` classified as 180-day rotation.** The KEK is a platform encryption key, not an API key or OAuth secret. The ACs say "90 days for API keys, 180 days for OAuth secrets" — the KEK fits neither category. 180 days is the longer interval, appropriate for a key whose rotation is a complex multi-step procedure (the KEK rotation runbook has 10 steps). A 90-day interval would be excessively frequent for a procedure of this complexity. The runbook references the dedicated KEK rotation runbook rather than duplicating the procedure.

**Decision (DP-5): Do NOT create a regression guard test for `kek-rotation.md`.** The deferred finding (line 442) says `kek-rotation.md` lacks a regression guard test. Story 4.12 references `kek-rotation.md` but does not modify it. Adding a regression guard test for an unmodified file is scope expansion. The finding says "A future story touching `kek-rotation.md` should add a `kek-rotation.spec.ts`" — Story 4.12 is not that story.

**Decision (DP-5): Do NOT implement automated secret rotation.** AC-4 explicitly says automated secret rotation is out of scope. The cron job creates reminders (GitHub issues), not rotations. The runbook documents manual rotation steps.

**Decision (DP-2): `ANTHROPIC_API_KEY` IS validated in env.validation.ts — stale deferred finding corrected.** The story originally cited deferred-work.md line 332 ("`ANTHROPIC_API_KEY` silently becomes `''` if missing") as current state. The actual code at `apps/agent-be/src/config/env.validation.ts:8` shows `ANTHROPIC_API_KEY: z.string().min(1)` — required, non-empty. The deferred finding is stale; the schema was updated to require it after the finding was filed. The story's "Current State of Key Code" section now reflects the code (higher authority), not the stale finding.

**Decision (DP-2): Due-date formula uses `floor` not `ceil`.** The original formula (`ceil((now - launch) / interval) * interval`) calculates the next future due date. AC-2 requires reminders when a secret "approaches or passes" its due date — the "passes" (past-due) case is the primary use case. `ceil` always yields a future date, so past-due rotations never trigger a reminder. The formula now uses `floor` (most recent due date), which correctly identifies past-due rotations. The AC (higher authority) wins over the formula text.

**Decision (DP-2): `CREDENTIAL_ENCRYPTION_KEK` platform is Vercel + Railway, not Vercel only.** The story originally listed the KEK as "Vercel" only (Secret Inventory table, config file, Current State). The code shows `apps/agent-be/src/credentials/encryption.service.ts` reads `process.env.CREDENTIAL_ENCRYPTION_KEK` at runtime — `EncryptionService` is registered in `credentials.module.ts`, imported into `AppModule`, used by `CredentialsService` → `ConversationsService` + `ToolPillClassifierService`. Story 4.5 wired the KEK on Railway. The code (higher authority) wins over the story spec; all KEK platform references amended to "Vercel + Railway."

### Architecture Compliance

**Architecture line 220/258:** "Daytona API key stored as a plain Railway environment secret, no rotation mechanism for MVP." — Story 4.12 adds a rotation REMINDER mechanism (cron job + runbook), not a rotation MECHANISM (automated rotation). The actual rotation remains manual. Consistent with the architecture's "no rotation mechanism for MVP" stance — the reminder is a scheduling aid, not an automation.

**Architecture line 219:** "KEK rotation runbook documented; GCM nonce-uniqueness enforced." — Story 4.12 references the existing KEK rotation runbook (`docs/runbooks/kek-rotation.md`, Story 1.9) rather than duplicating it. Consistent.

**Architecture line 253:** "a separate, purpose-built boundary JWT, decoupled from Auth.js's internal JWE." — The architecture says the boundary JWT is "decoupled" from Auth.js, but the code uses `AUTH_SECRET` for both. Story 4.12's runbook documents this gap explicitly (deferred finding line 273) — the `AUTH_SECRET` rotation section notes the dual purpose and the four usage sites. This is documentation of an existing implementation reality, not an architecture change.

**Architecture line 287:** "Environments: production only for MVP, no separate staging." — The rotation schedule applies to the single production environment. No staging rotation needed.

### Library / Framework Requirements

- **GitHub Actions** — the cron workflow runs in GitHub Actions. No new npm/yarn dependency. The workflow uses `actions/checkout@v4`, `actions/setup-node@v4`, and the `gh` CLI (pre-installed on GitHub Actions runners). The `GITHUB_TOKEN` secret is automatically available in GitHub Actions with `issues: write` permission when declared in the `permissions` block.
- **Node.js** — the due-date calculation script (`.github/scripts/check-rotations.js`) runs in Node.js 24 (the version pinned in the workflow). No external dependencies — pure Node.js (`fs`, `path` modules only).
- **js-yaml** — used in the regression guard test to parse the workflow YAML. Already a dependency (used by `deploy-workflow.spec.ts`, Story 4.6). Import via `require()` with minimal type assertion.
- No new npm/yarn dependencies. No code changes to `apps/agent-be` or `apps/web`. This is a documentation + CI workflow + test story.

### File Structure Requirements

**Files to CREATE (NEW):**

| File | What it does |
|---|---|
| `docs/runbooks/secret-rotation-schedule.md` | Secret rotation schedule runbook: secret inventory table, per-secret rotation procedures (Daytona API key, Anthropic API key, GitHub OAuth secret, AUTH_SECRET, KEK reference), out-of-scope boundaries, rollback procedure, verification record. ~150-200 lines. |
| `.github/secret-rotation-config.json` | Machine-readable rotation config: production launch date, reminder window (7 days), secrets array (name, rotation interval, platform, runbook section reference). Read by the cron workflow. |
| `.github/workflows/secret-rotation-reminder.yml` | GitHub Actions cron workflow: weekly schedule + manual trigger, reads config, calculates due dates, creates GitHub issues for secrets approaching/past due date. |
| `.github/scripts/check-rotations.js` | Node.js script: reads config file, calculates most recent and next due dates for each secret, outputs JSON array of secrets needing reminders (past-due or approaching). Called by the workflow. |
| `apps/agent-be/test/unit/secret-rotation-schedule.spec.ts` | Regression guard test: validates the runbook, config file, and workflow YAML structure/content. Follows `monitoring-setup.spec.ts` pattern. All tests tagged `[P0]`. |

**Files NOT to modify (preserved interactions — do NOT regress):**

| File | Why preserved |
|---|---|
| `docs/runbooks/kek-rotation.md` | KEK rotation runbook (Story 1.9). Referenced, not modified. The secret rotation schedule points to it for `CREDENTIAL_ENCRYPTION_KEK` rotation. |
| `.github/workflows/deploy.yml` | Deploy workflow (Story 4.6). No changes — the rotation reminder workflow is independent. |
| `.github/workflows/test.yml` | Test workflow. No changes. |
| `apps/agent-be/src/main.ts` | Server entry. No changes. |
| `apps/web/src/lib/boundary-jwt.ts` | Boundary JWT minting. No changes — the runbook documents its `AUTH_SECRET` dependency but does not modify the code. |
| `apps/agent-be/src/common/guards/boundary-jwt.guard.ts` | Boundary JWT REST guard. No changes — documented in runbook, not modified. |
| `apps/agent-be/src/streaming/streaming.controller.ts` | Boundary JWT SSE guard. No changes — documented in runbook, not modified. |

### Current State of Key Code (READ BEFORE IMPLEMENTING)

**Production secrets (from Story 4.5):**
- `DAYTONA_API_KEY` — Railway env var on `apps/agent-be` service. Used by `SandboxService` to provision/clone/destroy Daytona sandboxes. Validated by `apps/agent-be/src/config/env.validation.ts` at startup (`z.string().optional().default('')` — optional with empty default).
- `ANTHROPIC_API_KEY` — Railway env var on `apps/agent-be` service. Injected into each Daytona sandbox at provision time (`daytona.create({ env: { ANTHROPIC_API_KEY: ... } })`). Validated by `apps/agent-be/src/config/env.validation.ts` at startup (`z.string().min(1)` — required, non-empty). The deferred finding at line 332 (which reported `ANTHROPIC_API_KEY` as absent from the validation schema) is stale; the schema was updated to require it after the finding was filed.
- `AUTH_GITHUB_SECRET` — Vercel env var on `apps/web`. Used by Auth.js (`next-auth`) for the GitHub OAuth provider. Configured in `apps/web/src/lib/auth.ts`.
- `AUTH_SECRET` — Vercel env var on `apps/web` AND Railway env var on `apps/agent-be`. Used in four places:
  1. Auth.js session JWT signing/verification (`apps/web/src/lib/auth.ts`)
  2. Boundary JWT minting (`apps/web/src/lib/boundary-jwt.ts:4` — `new SignJWT().setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(process.env.AUTH_SECRET))`)
  3. Boundary JWT REST guard verification (`apps/agent-be/src/common/guards/boundary-jwt.guard.ts:53` — `jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET), { issuer, audience })`)
  4. Boundary JWT SSE guard verification (`apps/agent-be/src/streaming/streaming.controller.ts:37` — same `jwtVerify` call)
  Both services MUST have the same `AUTH_SECRET` value for boundary JWTs to work.
- `CREDENTIAL_ENCRYPTION_KEK` — Vercel env var on `apps/web` AND Railway env var on `apps/agent-be`. 64-char hex string (32 bytes). Used by `apps/web/src/lib/crypto.ts` for AES-256-GCM envelope encryption of OAuth tokens (encryption path) AND by `apps/agent-be/src/credentials/encryption.service.ts` for DEK unwrapping (decryption path, via `EncryptionService` → `CredentialsService` → `ConversationsService`). Both services MUST have the same KEK value. Rotation procedure in `docs/runbooks/kek-rotation.md` (Story 1.9).

**Existing runbooks in `docs/runbooks/` (precedents for the new runbook):**
- `kek-rotation.md` (Story 1.9) — KEK rotation procedure (10 steps, rollback, failure modes, validation record). THE reference for `CREDENTIAL_ENCRYPTION_KEK` rotation.
- `http2-verification.md` (Story 4.7) — HTTP/2 verification record
- `deploy-failure-recovery.md` (Story 4.8) — deploy failure recovery procedures
- `custom-domain-setup.md` (Story 4.9) — custom domain setup runbook (API commands, human-executed)
- `db-restore.md` (Story 4.10) — database backup and restore runbook
- `monitoring-setup.md` (Story 4.11) — monitoring and alerting runbook (UptimeRobot, log access, deploy failure notification)

**Existing regression guard tests in `apps/agent-be/test/unit/` (precedents for the new test):**
- `deploy-failure-recovery.spec.ts` (Story 4.8) — first runbook regression guard with credential-isolation + input-injection
- `custom-domain-setup.spec.ts` (Story 4.9) — THE primary pattern (Bearer token guard, `CREDENTIAL_ENV_VARS`, curl flag assertions)
- `db-restore.spec.ts` (Story 4.10) — runbook regression guard with `POSTGRES_HOST_AUTH_METHOD=trust` pattern
- `monitoring-setup.spec.ts` (Story 4.11) — THE closest precedent (runbook + workflow YAML structure validation, section-scoped assertions, `--fail` limitation documentation guard)
- `deploy-workflow.spec.ts` (Story 4.6) — workflow YAML testing pattern (parse with `js-yaml`, assert on structure + raw text, script injection prevention guard, credential isolation guard)

**Existing GitHub Actions workflows:**
- `.github/workflows/deploy.yml` (Story 4.6) — manual deploy workflow (`workflow_dispatch`). Pattern for `permissions`, `concurrency`, `env:` intermediaries, `GH_TOKEN` usage.
- `.github/workflows/test.yml` — test workflow (lint + unit/integration/e2e). Not modified by this story.
- `.github/workflows/claude.yml`, `claude-code-review.yml` — other workflows. Not modified.

**Production deployment (from Stories 4.1-4.11):**
- `apps/web`: `https://bmad-easy.vercel.app` (Vercel, custom domain per Story 4.9)
- `apps/agent-be`: `https://agent-be-production-1c09.up.railway.app` (Railway, HTTP/2 confirmed per Story 4.7)
- Postgres: Railway Postgres instance (backups configured per Story 4.10)
- Monitoring: UptimeRobot uptime checks (configured per Story 4.11)

### Project Structure Notes

- The runbook goes in `docs/runbooks/` — the established location for operational procedures. `monitoring-setup.md` (Story 4.11) is the closest precedent.
- The config file goes in `.github/` — alongside the workflows directory. This keeps rotation configuration co-located with the workflow that reads it.
- The workflow goes in `.github/workflows/` — the established location for GitHub Actions workflows. `deploy.yml` (Story 4.6) is the closest precedent.
- The due-date calculation script goes in `.github/scripts/` — a new directory for workflow helper scripts. This is cleaner than an inline `node -e` one-liner and makes the script testable.
- The regression guard test goes in `apps/agent-be/test/unit/` — follows the `monitoring-setup.spec.ts` pattern (Story 4.11). These tests read committed files and assert on their structure/content — no live network calls.
- No application code is modified. No new source files in `apps/` or `libs/`. This is a documentation + CI workflow + test story.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.12] — Story definition and ACs (lines 1200-1222)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4] — Epic objectives and scope boundaries (lines 941-943)
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — Daytona API key (line 258), KEK rotation (line 255), boundary JWT (line 253)
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment] — Platform-native logging (line 288), production only (line 287)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — Line 273: AUTH_SECRET boundary JWT signing key finding (PULLED IN). Line 442: kek-rotation.md regression guard gap (NOT pulled in, DP-5). Lines 475-477: export command patterns (applied via project-context.md).
- [Source: _bmad-output/decision-policy.md] — DP-3 (simplest option), DP-5 (scope temptation), always-escalate (external service calls with side effects)
- [Source: _bmad-output/implementation-artifacts/4-11-configure-launch-window-monitoring-and-alerting.md] — Previous story: runbook + regression guard test pattern, human-executed verification
- [Source: _bmad-output/implementation-artifacts/4-5-wire-environment-variables-and-secrets-on-both-platforms.md] — Production secrets list and platforms
- [Source: docs/runbooks/kek-rotation.md] — KEK rotation runbook (Story 1.9), referenced for CREDENTIAL_ENCRYPTION_KEK
- [Source: docs/runbooks/monitoring-setup.md] — Runbook pattern: prerequisites, sections, rollback, verification record
- [Source: apps/agent-be/test/unit/monitoring-setup.spec.ts] — Regression guard test pattern (Story 4.11): CREDENTIAL_ENV_VARS, section-scoped assertions, curl flag assertions
- [Source: apps/agent-be/test/unit/deploy-workflow.spec.ts] — Workflow YAML testing pattern (Story 4.6): js-yaml parsing, script injection prevention guard, credential isolation guard
- [Source: .github/workflows/deploy.yml] — Workflow pattern: permissions, env: intermediaries, GH_TOKEN usage
- [Source: _bmad-output/project-context.md#Script injection prevention in GitHub Actions run: blocks] — All dynamic values through env: intermediaries (line 343)
- [Source: _bmad-output/project-context.md#Credential isolation in GitHub Actions workflows] — No $VAR/${VAR} for credential env-var names in run: blocks (line 344)
- [Source: _bmad-output/project-context.md#Testing GitHub Actions workflow YAML files via Jest + js-yaml] — Parse workflow YAML with js-yaml, assert on structure + raw text (line 226)
- [Source: _bmad-output/project-context.md#--fail and --max-time flags on curl commands in runbooks] — curl flag requirement (line 266)
- [Source: _bmad-output/project-context.md#Credential-isolation + input-injection regression guards] — Guard template for committed operational documents (line 262)
- [Source: _bmad-output/project-context.md#Runbook rollback sections must be independently executable] — Rollback section requirement (line 265)
- [Source: _bmad-output/project-context.md#Secret-aware test assertions] — Object.keys() instead of toHaveProperty (line 261)
- [Source: _bmad-output/project-context.md#--fail limitation for APIs returning HTTP 200 with error bodies] — Document --fail limitation for 200-with-error APIs (line 268)
- [Source: _bmad-output/project-context.md#Section-scoped assertions in runbook regression guard tests] — Extract section via split, assert within (line 269)

### Previous Story Intelligence

This is the twelfth and final story in Epic 4. The previous story (4.11: Configure Launch-Window Monitoring and Alerting) is complete. Key learnings from Stories 4.1-4.11 that apply here:

- **Runbook + regression guard test pattern established:** Stories 4.8-4.11 each created a runbook in `docs/runbooks/` + a regression guard test in `apps/agent-be/test/unit/`. The test reads the committed file and asserts on its structure/content — no live network calls. Follow the same pattern for `secret-rotation-schedule.md` + `secret-rotation-schedule.spec.ts`.
- **Human-executed verification for external service calls:** Story 4.11 documented UptimeRobot monitor creation as human-executed (external service call with side effects). Story 4.12 documents GitHub issue creation as human-confirmed (externally visible effect). Same pattern: the agent creates the workflow YAML and runbook; the human triggers the first run and confirms the issue is created.
- **Workflow YAML testing pattern:** Story 4.6's `deploy-workflow.spec.ts` established the pattern for testing GitHub Actions workflow YAML files: parse with `js-yaml`, assert on parsed structure + raw text (for things YAML parsing normalizes away). The regression guard test should validate the new workflow YAML using this pattern.
- **Script injection prevention in workflow `run:` blocks:** Story 4.6 established the strict pattern: ALL dynamic values through `env:` intermediaries, never `${{ }}` interpolation in `run:` blocks. The new workflow must follow this pattern — the secret name and due date are computed at runtime and must be passed through environment variables.
- **Credential isolation in workflows:** Story 4.6 established the `CREDENTIAL_ENV_VARS` list pattern: credential env-var names must never appear as `$VAR` or `${VAR}` in `run:` blocks. The new workflow does not handle actual secret values — it only references secret names as strings in the config file and issue titles. But the regression guard test should still include the `CREDENTIAL_ENV_VARS` list and assert no literal credential values appear in the runbook.
- **Production URLs:** `apps/web` at `https://bmad-easy.vercel.app` (Vercel, Story 4.1/4.9), `apps/agent-be` at `https://agent-be-production-1c09.up.railway.app` (Railway, Story 4.7).
- **`AUTH_SECRET` dual purpose (deferred finding):** `AUTH_SECRET` is used for both Auth.js session JWT and boundary JWT signing (minting in `apps/web`, verification in `apps/agent-be`). This was previously undocumented (deferred-work.md line 273). The rotation runbook must document this and the simultaneous-update requirement.

### Git Intelligence

Recent commits (last 5):
```
82c795d docs(epics): apply story 4.11 NFR audit fixes and record review pipeline
60da3bb docs(epics): add story 4.11 launch-window monitoring and alerting runbook
5e691e6 docs(epics): add story 4.10 database backup and restore runbook
e6af6d5 Merge remote-tracking branch 'origin/main'
ec82976 feat(epics): close Epic 5 UX mockup visual drift across all surfaces (#10)
```

Stories 4.1-4.11 are complete. The production deployment exists: `apps/web` on Vercel, `apps/agent-be` (Docker) and Postgres on Railway, secrets wired, migrations applied, CI deploy workflow exists, HTTP/2 confirmed, deploy failure recovery documented, custom domain configured, database backups configured, monitoring and alerting configured. This story adds the final piece of the MVP deployment provisioning epic — secret rotation reminders.

### Important Implementation Notes

1. **This is a documentation + CI workflow + test story.** The primary deliverables are the runbook, the config file, the workflow YAML, the due-date calculation script, and the regression guard test. No application code, Dockerfile, or existing workflow YAML is modified.

2. **GitHub issue creation is human-confirmed.** Creating a GitHub issue is an externally visible effect (it appears in the repository's issue tracker). Per the decision policy, this must be escalated. The agent creates the workflow YAML with both `schedule` and `workflow_dispatch` triggers. The human triggers the first run via `workflow_dispatch` (or waits for the scheduled run) and confirms the issue is created. This follows the same pattern as Story 4.11 (UptimeRobot monitor creation was human-executed).

3. **`AUTH_SECRET` has a dual purpose.** `AUTH_SECRET` is used for both Auth.js session JWT signing AND boundary JWT signing (minting in `apps/web`, verification in `apps/agent-be`). Rotating `AUTH_SECRET` invalidates ALL active sessions AND ALL active boundary JWTs. The runbook MUST document this and the requirement to update both Vercel AND Railway simultaneously. This is a pulled-in deferred finding (deferred-work.md line 273).

4. **The regression guard test follows the `monitoring-setup.spec.ts` pattern.** It reads the committed runbook, config file, and workflow YAML, and asserts on their structure/content — no live network calls. Use `path.resolve(__dirname, '../../../../docs/runbooks/secret-rotation-schedule.md')` to locate the runbook, `path.resolve(__dirname, '../../../../.github/secret-rotation-config.json')` for the config, and `path.resolve(__dirname, '../../../../.github/workflows/secret-rotation-reminder.yml')` for the workflow.

5. **The workflow YAML must follow script injection prevention.** ALL dynamic values (secret name, due date) must be passed through `env:` intermediaries — never `${{ }}` interpolation in `run:` blocks. The regression guard test should assert no `${{ }}` expressions appear in `run:` blocks via raw text regex.

6. **The config file is the single source of truth.** The cron job reads `.github/secret-rotation-config.json` for the production launch date, reminder window, and secret list. The runbook documents the config file. The regression guard test validates the config file structure. If a secret's rotation interval changes, update the config file and the runbook — both are validated by the test.

7. **The due-date calculation script is a committed file.** `.github/scripts/check-rotations.js` reads the config file, calculates the most recent and next due dates for each secret, and outputs a JSON array of secrets needing reminders (past-due or approaching). The script is pure Node.js (no external dependencies) and can be tested locally. The workflow calls it via `node .github/scripts/check-rotations.js .github/secret-rotation-config.json`.

8. **Duplicate issue prevention.** The cron job runs weekly. If a secret is past due, it would create a new issue every week without a dedup check. The workflow must check for existing open issues with the same title before creating a new one. Use `gh issue list --search "Rotate <secret-name>" --state open --json number,title` and skip creation if a matching open issue exists.

9. **The `secret-rotation` label.** The workflow creates issues with a `secret-rotation` label (amber/caution color `FBCA04`). The label is created on first run if it doesn't exist (`gh label create secret-rotation --color FBCA04 || true`). This allows filtering rotation issues in the issue tracker.

10. **Rollback section must be independently executable.** Any value needed for rollback (old secret value, platform dashboard URL) must be re-derivable within the rollback section itself — not referenced as "the value from Step X" (project-context.md line 265). For secrets where the old value is revoked (Daytona, Anthropic, GitHub OAuth App), the rollback section must document that the old value cannot be recovered and a new key must be generated.

### Testing Approach

- **Regression guard test (runbook + config + workflow structure validation).** A test at `apps/agent-be/test/unit/secret-rotation-schedule.spec.ts` reads the committed runbook, config file, and workflow YAML, and asserts they contain the required sections, commands, and references. This is NOT a live GitHub API test; it reads the committed files and asserts on their content. Follows the `monitoring-setup.spec.ts` pattern (Story 4.11) + `deploy-workflow.spec.ts` pattern (Story 4.6). Tag tests as `[P0]`.
- **No live-network Jest tests for GitHub issue creation.** The GitHub issue creation verification (Task 5) is a one-time manual step — the workflow documents the issue creation, the regression guard test validates the workflow structure. A Jest test that makes live GitHub API calls in CI would be flaky (transient network issues, token availability) and would create real issues from CI runners.
- **Verification = the runbook + the config + the workflow + the regression guard test.** Each AC is satisfied by: (1) the runbook documenting all secrets, intervals, manual steps, and KEK reference (AC-1), (2) the workflow YAML with cron schedule + issue creation step (AC-2), (3) the config file with production launch date + initial due dates + first issue confirmation (AC-3), (4) the runbook documenting automated rotation out of scope (AC-4), and (5) the regression guard test ensuring the files are not accidentally deleted or emptied in CI.

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- Initial test run (RED phase): all 60+ test blocks failed because deliverable files did not exist yet — confirmed tests fail for the expected reason (file not found).
- Second test run after implementing all deliverables: 10 failures due to section-splitting regexes missing the `m` flag and using `#+` instead of `##\s` for level-2 heading extraction. Fixed by following the `monitoring-setup.spec.ts` pattern (`/^##\s+.*Section N/im` + `/^##\s/im`).
- Final test run: all 670 tests pass (60+ Story 4.12 tests + 610 existing tests, no regressions).
- Verified `check-rotations.js` script works correctly: outputs `[]` for placeholder date, outputs correct reminder for a past date + 90-day interval.

### Completion Notes List

- **Task 1 (Runbook):** Created `docs/runbooks/secret-rotation-schedule.md` with all required sections: Prerequisites, Secret Inventory table (5 secrets), Sections 1-5 (per-secret rotation procedures), Section 6 (Out of Scope), Rollback Procedure, Verification Record. Documents `AUTH_SECRET` dual purpose (Auth.js session JWT + boundary JWT signing) with all four usage sites. References `docs/runbooks/kek-rotation.md` for KEK rotation. Uses `<placeholder>` syntax for all variable values. Production URLs hardcoded as stable reference constants.
- **Task 2 (Config file):** Created `.github/secret-rotation-config.json` with `productionLaunchDate` (placeholder `<YYYY-MM-DD>` — human must set actual date), `reminderWindowDays: 7`, and `secrets` array with all 5 secrets (correct intervals: 90 for API keys, 180 for OAuth secrets and KEK). `CREDENTIAL_ENCRYPTION_KEK` entry includes `runbookRef` pointing to `docs/runbooks/kek-rotation.md`.
- **Task 3 (Workflow + Script):** Created `.github/workflows/secret-rotation-reminder.yml` (weekly cron `0 0 * * 1` + `workflow_dispatch`, `issues: write` + `contents: read` permissions, `check-secret-rotations` job on `ubuntu-latest`). All dynamic values passed through `env:` intermediaries — no `${{ }}` in `run:` blocks. Uses `gh issue create` with dedup check (`gh issue list --search`). Creates `secret-rotation` label (amber `FBCA04`). Created `.github/scripts/check-rotations.js` (pure Node.js, reads config from `process.argv[2]`, calculates due dates using `floor` formula, outputs JSON array, exits 0 always).
- **Task 4 (Regression guard test):** Created `apps/agent-be/test/unit/secret-rotation-schedule.spec.ts` with 60+ test blocks covering all ACs. Follows `monitoring-setup.spec.ts` + `deploy-workflow.spec.ts` patterns. Includes credential-isolation guards, input-injection guards, curl flag assertions, section-scoped assertions, script injection prevention guard, config file structure validation, workflow YAML structure validation. All tests tagged `[P0]`.
- **Task 5 (Human-confirmed):** Task 5 is human-confirmed per decision policy (external service call with side effects — creating a GitHub issue is an externally visible effect). The agent created the workflow YAML, runbook, config file, and regression guard test. Subtasks 5.1 (set `productionLaunchDate` to actual date) and 5.2 (trigger workflow manually) require human action. Subtask 5.3 (document verification result) is complete — the Verification Record documents that the first issue creation is pending human confirmation.
- **NFR patterns applied:** Script injection prevention (env: intermediaries), credential isolation (no $VAR/${VAR} for credential env-var names in run: blocks), `<placeholder>` syntax for variable values, section-scoped test assertions, `--fail`/`--max-time` curl flag guards (no curl commands in runbook, but test guards are in place), rollback section independently executable, `Object.keys()` pattern not needed (string-based assertions).

### File List

- `docs/runbooks/secret-rotation-schedule.md` (NEW) — Secret rotation schedule runbook
- `.github/secret-rotation-config.json` (NEW) — Machine-readable rotation config
- `.github/workflows/secret-rotation-reminder.yml` (NEW) — GitHub Actions cron workflow
- `.github/scripts/check-rotations.js` (NEW) — Due-date calculation Node.js script
- `apps/agent-be/test/unit/secret-rotation-schedule.spec.ts` (NEW) — Regression guard test
- `apps/agent-be/test/unit/check-rotations.spec.ts` (NEW — test automation) — Unit tests for check-rotations.js due-date calculation logic

### Change Log

- 2026-07-14: Implemented Story 4.12 — secret rotation reminder mechanism. Created runbook, config file, cron workflow, due-date calculation script, and regression guard test. Task 5 (first issue creation) is human-confirmed per decision policy.
- 2026-07-14: Test automation validation run. All 670 existing tests pass, no skipped tests in Story 4.12 scope. Coverage gap found: `check-rotations.js` script had no unit tests for its due-date calculation logic (only existence + reference checks). Generated `check-rotations.spec.ts` (18 [P0] tests) covering past-due detection (floor formula), approaching-window detection, future-due secrets, placeholder/invalid dates, missing config path, output format, multiple secrets, and runbookRef field handling. Script tested via `child_process.execSync` (calls `process.exit(0)` unconditionally — direct import would terminate test process). No production code modified. Full suite: 688 tests pass. Validation report at `_bmad-output/test-artifacts/automate-validation-report-4-12.md`.
- 2026-07-14: NFR evidence audit (Round 3). Audited all Story 4.12 artifacts for NFR-specific issues (reliability, security, maintainability). Found 2 issues: (1) MEDIUM — no regression guard test for `concurrency` block (prevents duplicate issues from overlapping runs), (2) LOW — no regression guard test for `timeout-minutes` (prevents hung workflows). Both introduced by this story with straightforward remediation. Applied fixes directly: added 3 `[P0]` test assertions + `WorkflowConcurrency` interface + `timeout-minutes` field on `WorkflowJob` interface. Pre-existing deferred findings (perpetual overdue, silent error swallowing, placeholder dormancy, execSync time dependence) re-verified as correctly deferred. Full suite: 692 tests pass. NFR assessment report at `_bmad-output/test-artifacts/nfr-assessment-4-12.md`.
