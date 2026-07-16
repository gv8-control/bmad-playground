---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-14'
workflowType: testarch-atdd
storyId: '4.11'
storyKey: 4-11-configure-launch-window-monitoring-and-alerting
storyFile: _bmad-output/implementation-artifacts/4-11-configure-launch-window-monitoring-and-alerting.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-4-11-configure-launch-window-monitoring-and-alerting.md
generatedTestFiles:
  - apps/agent-be/test/unit/monitoring-setup.spec.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/4-11-configure-launch-window-monitoring-and-alerting.md
  - _bmad-output/project-context.md
  - _bmad-output/decision-policy.md
  - apps/agent-be/test/unit/custom-domain-setup.spec.ts
  - apps/agent-be/test/unit/db-restore.spec.ts
---

# ATDD Checklist - Epic 4, Story 4.11: Configure Launch-Window Monitoring and Alerting

**Date:** 2026-07-14
**Author:** Marius
**Primary Test Level:** Unit (regression guard)

---

## Story Summary

Minimal monitoring and alerting on the production deployment so the operator knows the platform is broken before a user reports it.

**As a** platform operator
**I want** minimal monitoring and alerting on the production deployment
**So that** I know the platform is broken before a user reports it

---

## Acceptance Criteria

1. **AC-1 (Uptime monitoring):** External uptime check polls `GET /health` on `apps/agent-be` and the homepage of `apps/web` at 5-minute intervals, alerts operator within 5 minutes of failure.
2. **AC-2 (Log access):** Platform-native logs (Vercel, Railway) confirmed accessible and retained for at least 7 days.
3. **AC-3 (Deploy failure notification):** GitHub Actions failure notification reaches the operator when deploy workflow fails.
4. **AC-4 (Out of scope):** NFR-O1 per-user LLM spend monitoring, distributed tracing, and APM tools are explicitly out of scope.

---

## Story Integration Metadata

- **Story ID:** `4.11`
- **Story Key:** `4-11-configure-launch-window-monitoring-and-alerting`
- **Story File:** `_bmad-output/implementation-artifacts/4-11-configure-launch-window-monitoring-and-alerting.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-4-11-configure-launch-window-monitoring-and-alerting.md`
- **Generated Test Files:** `apps/agent-be/test/unit/monitoring-setup.spec.ts`

---

## Test Scaffolds Created

### Unit Tests (49 tests)

**File:** `apps/agent-be/test/unit/monitoring-setup.spec.ts` (262 lines)

All 49 tests are active and passing.

#### Runbook Structure (11 tests)

- **Test:** `[P0] runbook file exists at docs/runbooks/monitoring-setup.md`
  - **Verifies:** AC-1, AC-2, AC-3, AC-4 (runbook exists)

- **Test:** `[P0] runbook has a markdown heading`

  - **Verifies:** runbook structure

- **Test:** `[P0] runbook is non-trivial (at least 10 lines)`

  - **Verifies:** runbook is substantive

- **Test:** `[P0] runbook contains a date (YYYY-MM-DD format)`

  - **Verifies:** verification record dating

- **Test:** `[P0] runbook contains a Prerequisites section`

  - **Verifies:** runbook structure

- **Test:** `[P0] runbook contains Section 1 heading (Uptime Monitoring)`

  - **Verifies:** AC-1 section

- **Test:** `[P0] runbook contains Section 2 heading (Log Access)`

  - **Verifies:** AC-2 section

- **Test:** `[P0] runbook contains Section 3 heading (Deploy Failure Notification)`

  - **Verifies:** AC-3 section

- **Test:** `[P0] runbook contains Section 4 heading (Out of Scope)`

  - **Verifies:** AC-4 section

- **Test:** `[P0] runbook contains a Rollback Procedure section`

  - **Verifies:** rollback procedure

- **Test:** `[P0] runbook contains a Verification Record section`

  - **Verifies:** verification record

#### AC-1: Uptime Monitoring (11 tests)

- **Test:** `[P0] runbook references UptimeRobot`

  - **Verifies:** AC-1 monitoring service

- **Test:** `[P0] runbook documents two monitors (apps/web homepage + apps/agent-be health)`

  - **Verifies:** AC-1 two monitors

- **Test:** `[P0] runbook documents 5-minute monitoring interval`

  - **Verifies:** AC-1 interval

- **Test:** `[P0] runbook documents email alerts`

  - **Verifies:** AC-1 alerting

- **Test:** `[P0] runbook references GET /health endpoint on agent-be`

  - **Verifies:** AC-1 health endpoint

- **Test:** `[P0] runbook documents the newMonitor API endpoint`

  - **Verifies:** AC-1 monitor creation API

- **Test:** `[P0] runbook references the UptimeRobot API v2 base URL`

  - **Verifies:** AC-1 API base URL

- **Test:** `[P0] runbook documents getAccountDetails API command`

  - **Verifies:** AC-1 API verification

- **Test:** `[P0] runbook documents getMonitors API command`

  - **Verifies:** AC-1 monitor listing

- **Test:** `[P0] runbook documents deleteMonitor API command`

  - **Verifies:** rollback procedure

- **Test:** `[P0] runbook documents that monitor creation is human-executed`

  - **Verifies:** execution model

#### AC-2: Log Access (7 tests)

- **Test:** `[P0] runbook documents Vercel deployment logs`

  - **Verifies:** AC-2 Vercel logs

- **Test:** `[P0] runbook documents Railway service logs`

  - **Verifies:** AC-2 Railway logs

- **Test:** `[P0] runbook documents 7-day retention requirement`

  - **Verifies:** AC-2 retention

- **Test:** `[P0] runbook documents Vercel dashboard access path`

  - **Verifies:** AC-2 dashboard access

- **Test:** `[P0] runbook documents Railway dashboard access path`

  - **Verifies:** AC-2 dashboard access

- **Test:** `[P0] runbook documents vercel logs CLI command`

  - **Verifies:** AC-2 CLI access

- **Test:** `[P0] runbook documents railway logs CLI command`

  - **Verifies:** AC-2 CLI access

#### AC-3: Deploy Failure Notification (4 tests)

- **Test:** `[P0] runbook documents GitHub Actions failure notification`

  - **Verifies:** AC-3 notification

- **Test:** `[P0] runbook references workflow_dispatch trigger`

  - **Verifies:** AC-3 trigger

- **Test:** `[P0] runbook documents email notification for failed workflows`

  - **Verifies:** AC-3 email

- **Test:** `[P0] runbook references the deploy workflow file`

  - **Verifies:** AC-3 deploy.yml

#### AC-4: Out of Scope (3 tests)

- **Test:** `[P0] runbook documents NFR-O1 per-user LLM spend monitoring as out of scope`

  - **Verifies:** AC-4 NFR-O1

- **Test:** `[P0] runbook documents distributed tracing as out of scope`

  - **Verifies:** AC-4 tracing

- **Test:** `[P0] runbook documents APM tools as out of scope`

  - **Verifies:** AC-4 APM

#### Production URL References (2 tests)

- **Test:** `[P0] runbook contains the apps/web production URL`

  - **Verifies:** production URL reference

- **Test:** `[P0] runbook contains the apps/agent-be production URL`

  - **Verifies:** production URL reference

#### Rollback Procedure (2 tests)

- **Test:** `[P0] runbook contains a rollback section`

  - **Verifies:** rollback section

- **Test:** `[P0] runbook rollback section is independently executable (includes getMonitors command)`

  - **Verifies:** independent rollback

#### Credential-Isolation Guards (4 tests)

- **Test:** `[P0] runbook does not contain UptimeRobot API key values`

  - **Verifies:** credential isolation — no API key leak

- **Test:** `[P0] runbook does not contain Bearer followed by a literal token value`

  - **Verifies:** credential isolation — no Bearer token leak

- **Test:** `[P0] runbook does not contain database connection strings with passwords`

  - **Verifies:** credential isolation — no connection string leak

- **Test:** `[P0] runbook does not contain literal credential env-var assignments`

  - **Verifies:** credential isolation — no VAR=value for CREDENTIAL_ENV_VARS

#### Input-Injection Guards (3 tests)

- **Test:** `[P0] documented API commands use <monitor-id> placeholder`

  - **Verifies:** input injection — placeholder usage

- **Test:** `[P0] curl commands reference UPTIMEROBOT_API_KEY as env var, not literal value`

  - **Verifies:** input injection — env var reference

- **Test:** `[P0] UPTIMEROBOT_API_KEY not interpolated into command strings as literal value`

  - **Verifies:** input injection — no literal key in command

#### curl Flags (2 tests)

- **Test:** `[P0] curl commands include --fail flag`

  - **Verifies:** curl safety — --fail flag

- **Test:** `[P0] curl commands include --max-time flag`

  - **Verifies:** curl safety — --max-time flag

---

## E2E Coverage Deferral Check

**Checked:** No browser-level mock pattern can simulate the ACs for Story 4.11. The acceptance criteria are infrastructure verification requirements (uptime monitoring configured, logs accessible, deploy failure notification reaches operator) — not user-facing UI behavior. No browser interaction exercises these ACs.

**Result:** E2E coverage deferred. The regression guard test (unit test reading a committed markdown file) is the appropriate and only viable test level. No mock covers these ACs because they validate documentation content, not runtime behavior.

---

## Uniform Guard Template Applied

The regression guard test applies the uniform guard template to every call site in the runbook that executes external commands with user-controlled input:

| Call site | Credential-isolation invariant | Input-injection invariant |
|---|---|---|
| UptimeRobot API curl (`api_key=...`) | No literal `UPTIMEROBOT_API_KEY` value; `$UPTIMEROBOT_API_KEY` env var reference only | `<monitor-id>` placeholder; no literal monitor IDs |
| UptimeRobot `deleteMonitor` curl | Same as above | Same as above |
| Vercel CLI (`vercel logs`) | No literal `VERCEL_TOKEN` value | `<deployment-url>` placeholder |
| Railway CLI (`railway logs`) | No literal `RAILWAY_TOKEN` value | N/A (no user-controlled input) |

**Credential-isolation invariants tested:**
- No UptimeRobot API key values (keys start with `u`/`m` followed by numbers)
- No Bearer followed by literal token
- No database connection strings with passwords
- No literal `VAR=value` assignments for any `CREDENTIAL_ENV_VARS` entry

**Input-injection invariants tested:**
- `<monitor-id>` placeholder used in API commands
- `$UPTIMEROBOT_API_KEY` as env var, not interpolated into command strings
- `api_key=$UPTIMEROBOT_API_KEY` form (not `api_key=<literal>`)

---

## Decision Policy Consultation

**DP-4 (Test-only changes):** The ATDD scaffold is a test-only change (test structure, no production behavior change). Decided autonomously; no escalation needed.

**No new decisions arose** during ATDD scaffolding. The story's existing decisions (DP-3 for UptimeRobot, DP-5 for scope boundaries, always-escalate for external service calls) cover all relevant scenarios.

---

## Implementation Checklist

### Test: All 49 tests in monitoring-setup.spec.ts

**File:** `apps/agent-be/test/unit/monitoring-setup.spec.ts`

**Tasks to make these tests pass:**

- [x] Create `docs/runbooks/monitoring-setup.md` (Task 1) with all required sections
- [x] Include Prerequisites, Section 1-4, Rollback, Verification Record sections
- [x] Document UptimeRobot monitor setup with API commands (AC-1)
- [x] Document Vercel + Railway log access and retention (AC-2)
- [x] Document GitHub Actions failure notification (AC-3)
- [x] Document out-of-scope boundaries (AC-4)
- [x] Include production URL references
- [x] Include independently executable rollback procedure
- [x] Use `<monitor-id>` placeholders, `$UPTIMEROBOT_API_KEY` env var references
- [x] Include `--fail` and `--max-time` on all curl commands
- [x] Remove `test.skip()` from all 49 test blocks (Task 2.3)
- [x] Run: `yarn nx test agent-be -- --testPathPattern=monitoring-setup`
- [x] All 49 tests pass

---

## Running Tests

```bash
# Run all tests for this story
yarn nx test agent-be -- --testPathPattern=monitoring-setup

# Run specific test file
yarn nx test agent-be -- --testPathPattern=monitoring-setup --verbose
```

---

## Test Execution Evidence

**Command:** `yarn nx test agent-be -- --testPathPattern=monitoring-setup --verbose`

**Results:**

```
Test Suites: 28 passed, 28 total
Tests:       581 passed, 581 total
```

**Summary:**

- Total tests: 49 (monitoring-setup.spec.ts)
- All 49 tests pass
- 4 test regexes fixed (missing `m` flag on multiline heading assertions)
- Runbook created at `docs/runbooks/monitoring-setup.md`

---

## Notes

- This is a documentation + verification story — the primary deliverable is `docs/runbooks/monitoring-setup.md`, and the regression guard test validates its structure/content.
- The test follows the `custom-domain-setup.spec.ts` (Story 4.9) and `db-restore.spec.ts` (Story 4.10) patterns — reading a committed markdown file and asserting on its content.
- No live network calls are made in tests. The UptimeRobot API verification is a one-time manual step documented in the runbook.
- The uniform guard template covers 4 call sites (UptimeRobot API curl, deleteMonitor curl, Vercel CLI, Railway CLI) with both credential-isolation and input-injection invariants.
- The `CREDENTIAL_ENV_VARS` list includes `UPTIMEROBOT_API_KEY`, `VERCEL_TOKEN`, `RAILWAY_TOKEN`, `DATABASE_URL`, `AUTH_SECRET`.

---

**Generated by BMad TEA Agent** - 2026-07-14
