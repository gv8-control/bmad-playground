# Monitoring Setup

This runbook covers configuring minimal monitoring and alerting on the production deployment of `apps/web` (Vercel) and `apps/agent-be` (Railway) for the MVP launch window. It documents every step — UptimeRobot monitor setup (API commands, human-executed), log access verification (Vercel + Railway dashboards), deploy failure notification (GitHub Actions default email + optional webhook), and out-of-scope boundaries.

An operator reading this runbook should be able to configure monitoring and verify log access end-to-end without consulting any other document.

**Execution model:** UptimeRobot monitor creation via the API (`newMonitor`) is an external service call with side effects — the agent documents the commands; the human executes them with a valid `UPTIMEROBOT_API_KEY`. Read-only API calls (`getAccountDetails`, `getMonitors`) are agent-executable for verification. Log access and deploy failure notifications are platform-native features — the runbook documents how to access them; no additional setup is required.

---

## Prerequisites

**Production URLs (operator reference):**

- `apps/web`: `https://bmad-easy.vercel.app` (Vercel-provided domain; custom domain may also be configured per Story 4.9)
- `apps/agent-be`: `https://agent-be-production-1c09.up.railway.app` (Railway-provided domain, confirmed in Story 4.7 HTTP/2 verification)
- `GET /health` endpoint on agent-be: serves at root (`https://agent-be-production-1c09.up.railway.app/health`), excluded from the `/api` global prefix

**UptimeRobot account details (operator reference):**

- UptimeRobot free tier: 50 monitors, 5-minute intervals, email alerts
- Rate limit: 10 API requests per minute on the free tier. If you run multiple API commands in quick succession (e.g. creating both monitors back-to-back), you may hit the rate limit. Space commands by a few seconds if you receive a rate limit error.
- API v2 base URL: `https://api.uptimerobot.com/v2/`
- `UPTIMEROBOT_API_KEY` must be present in `.env.local`. It was verified present on 2026-07-14 (see Verification Record). If missing, obtain it from the UptimeRobot dashboard: Integrations & API → API → Create Key (create a main API key) and add it to `.env.local`.
- Export it before running curl commands: `export UPTIMEROBOT_API_KEY=$(grep '^UPTIMEROBOT_API_KEY=' .env.local | cut -d= -f2-)`
- The API key is passed in the POST body as `api_key=$UPTIMEROBOT_API_KEY`, not as an Authorization header.
- **Note on `--fail`:** UptimeRobot API v2 returns HTTP 200 even for API-level errors (invalid key, bad request). The `--fail` flag only catches HTTP 4xx/5xx — it does not detect a 200 response with `stat: "fail"` in the JSON body. Always check the `stat` field in the response.

**Monitor type reference:**

- Type 1 = HTTP monitoring (polls a URL and checks for a 2xx response)

---

## Section 1 — Uptime Monitoring (UptimeRobot, human-executed)

Two monitors are required — one for each production deployment. Monitor creation is human-executed: the API commands below are external service calls with side effects. The agent documents the commands; the human executes them with a valid `UPTIMEROBOT_API_KEY`.

### Step 1 — Verify API key (read-only, agent-executable)

Verify the API key works by calling `getAccountDetails`:

```bash
curl --fail --max-time 30 -s -X POST "https://api.uptimerobot.com/v2/getAccountDetails" \
  --data-urlencode "api_key=$UPTIMEROBOT_API_KEY" \
  --data-urlencode "format=json"
```

**Expected response:** `stat: "ok"` with account details (email, plan, monitor limit). If the key is invalid, the response contains `stat: "fail"` with an error message.

### Step 2 — Create Monitor 1: apps/web homepage (human-executed, side effects)

Create the apps/web homepage monitor:

```bash
curl --fail --max-time 30 -s -X POST "https://api.uptimerobot.com/v2/newMonitor" \
  --data-urlencode "api_key=$UPTIMEROBOT_API_KEY" \
  --data-urlencode "format=json" \
  --data-urlencode "name=apps-web homepage" \
  --data-urlencode "url=https://bmad-easy.vercel.app" \
  --data-urlencode "type=1" \
  --data-urlencode "interval=300"
```

**Expected response:** `stat: "ok"` with a `monitor` object containing the `id` (this is the `<monitor-id>` for this monitor). The interval is 300 seconds (5 minutes).

### Step 3 — Create Monitor 2: apps/agent-be health (human-executed, side effects)

Create the apps/agent-be health monitor:

```bash
curl --fail --max-time 30 -s -X POST "https://api.uptimerobot.com/v2/newMonitor" \
  --data-urlencode "api_key=$UPTIMEROBOT_API_KEY" \
  --data-urlencode "format=json" \
  --data-urlencode "name=apps-agent-be health" \
  --data-urlencode "url=https://agent-be-production-1c09.up.railway.app/health" \
  --data-urlencode "type=1" \
  --data-urlencode "interval=300"
```

**Expected response:** `stat: "ok"` with a `monitor` object containing the `id` (this is the `<monitor-id>` for this monitor). The interval is 300 seconds (5 minutes).

### Step 4 — List monitors (read-only, agent-executable)

Verify both monitors exist:

```bash
curl --fail --max-time 30 -s -X POST "https://api.uptimerobot.com/v2/getMonitors" \
  --data-urlencode "api_key=$UPTIMEROBOT_API_KEY" \
  --data-urlencode "format=json"
```

**Expected response:** `stat: "ok"` with a `monitors` array containing both monitors (`apps-web homepage` and `apps-agent-be health`), each with `status: 2` (up) or `status: 1` (not checked yet).

### Step 5 — Alert contact configuration

UptimeRobot's free tier includes email alerts — enabled by default to the account email. The operator receives an email alert within 5 minutes of a monitor going down.

**Optional: Add a Slack webhook alert contact.** This is not required by AC-1 (email alerts satisfy the requirement) but is documented for convenience:

1. Create a Slack incoming webhook in your Slack workspace (Slack → Apps → Incoming Webhooks).
2. In the UptimeRobot dashboard, go to My Settings → Alert Contacts → Add Alert Contact.
3. Select type "Slack", paste the Slack webhook URL, and save.
4. Assign the alert contact to each monitor (My Settings → Alert Contacts → edit monitor → select the Slack contact).

---

## Section 2 — Log Access (Vercel + Railway, verification)

Both platforms provide log access via their dashboards by default — no additional setup is required for the operator to access logs. This section documents how to access logs and confirms the retention period meets the 7-day requirement from AC-2.

### Vercel deployment logs

**Dashboard access:** Vercel dashboard → Project (`bmad-easy`) → Deployments → click a deployment → "Logs" tab.

**CLI access:**

```bash
vercel logs <deployment-url>
```

Replace `<deployment-url>` with a deployment URL from the Vercel dashboard Deployments list (e.g. `https://bmad-easy-abc123.vercel.app`).

The Vercel CLI reads `VERCEL_TOKEN` from the environment. Export it before running CLI commands: `export VERCEL_TOKEN=$(grep '^VERCEL_TOKEN=' .env.local | cut -d= -f2-)`

**Retention:** Vercel's Hobby plan retains deployment logs for 1 hour. The Pro plan retains logs for 7 days. If the current plan is Hobby, log retention does not meet the 7-day requirement from AC-2 — the operator must upgrade to Vercel Pro to satisfy the retention requirement. Upgrading increases recurring cost — escalate per decision policy before proceeding.

### Railway service logs

**Dashboard access:** Railway dashboard → Project → Service (`agent-be`) → "Logs" tab.

**CLI access:**

```bash
railway logs
```

Prerequisite: the Railway CLI requires a linked project. Run `railway link` first, or use `railway logs --project <project-id> --environment <environment-id>` with IDs from the Railway dashboard (Project → Settings).

The Railway CLI reads `RAILWAY_TOKEN` from the environment. Export it before running CLI commands: `export RAILWAY_TOKEN=$(grep '^RAILWAY_TOKEN=' .env.local | cut -d= -f2-)`

**Retention:** Railway retains service logs for 7 days on the Pro plan. Verify the actual plan by checking the Railway dashboard (Project → Settings → Billing). If the plan is not Pro, log retention may be less than 7 days — the operator must upgrade to Railway Pro to satisfy the retention requirement.

### Verification

Both platforms provide log access via their dashboards by default — the operator knows how to access logs without additional setup. The retention period must be verified by checking the dashboards or platform docs. If either platform's retention is less than 7 days, document the limitation and the upgrade path (increases recurring cost — always escalate per decision policy).

---

## Section 3 — Deploy Failure Notification (GitHub Actions)

GitHub Actions sends email notifications for failed workflows by default. The deploy workflow (`.github/workflows/deploy.yml`) uses `workflow_dispatch` — a failed deploy triggers the notification automatically. No workflow YAML changes are needed — AC-3 is satisfied by confirming the default notification mechanism works.

### How GitHub Actions failure notifications work

1. The deploy workflow (`.github/workflows/deploy.yml`) is triggered manually via `workflow_dispatch`.
2. If any job in the workflow fails, GitHub Actions sends an email notification to the repository owner and collaborators who have enabled Actions notifications.
3. The email includes the workflow name, the failed job name, and a link to the workflow run.

### Verify notification settings

1. Navigate to GitHub → Settings → Notifications.
2. Under "Actions", verify that notifications are enabled:
   - "Send notifications for failed workflows only" (recommended) or "All actions".
3. Verify the email address on file is correct.

### Optional: Configure a Slack webhook for additional notification

This is optional — AC-3 is satisfied by the default email notification.

1. Navigate to the GitHub repo → Settings → Webhooks → Add webhook.
2. Set the Payload URL to the Slack incoming webhook URL.
3. Set Content type to `application/json`.
4. Select the `workflow_run` event.
5. Click Add webhook.

---

## Section 4 — Out of Scope

The following are explicitly out of scope for this story — this story covers only minimal observability for platform-level outage detection during the MVP launch window:

- **NFR-O1 per-user LLM spend monitoring** (Epic 3 Story 3.8): per-user LLM spend tracking and budget alerting is owned by Epic 3 and is out of scope for this monitoring setup story.
- **Distributed tracing:** OpenTelemetry, Jaeger, or similar distributed tracing tools are out of scope — platform-native logs and uptime monitoring are sufficient for MVP launch-window observability.
- **APM tools:** Application Performance Monitoring tools (Datadog, New Relic, Sentry, etc.) are out of scope — no custom APM instrumentation is needed for the MVP launch window.
- **Custom log aggregation:** A centralized log aggregation pipeline (ELK stack, Loki, etc.) is out of scope — platform-native logs (Vercel + Railway dashboards) are the intended solution.
- **Custom dashboarding:** Building custom dashboards (Grafana, etc.) is out of scope — UptimeRobot's dashboard and the platforms' native dashboards are sufficient.

---

## Rollback Procedure

If the monitoring setup causes issues, revert by removing the UptimeRobot monitors. Log access and deploy failure notifications require no rollback — they are platform-native features, not custom configurations.

This rollback section is independently executable — it includes the `getMonitors` command to list monitor IDs before deletion, so an operator can complete the rollback without having first run the forward procedure.

### Step 1 — List existing monitors (read-only)

```bash
curl --fail --max-time 30 -s -X POST "https://api.uptimerobot.com/v2/getMonitors" \
  --data-urlencode "api_key=$UPTIMEROBOT_API_KEY" \
  --data-urlencode "format=json"
```

Find the monitors with friendly names `apps-web homepage` and `apps-agent-be health`. Note the `id` field for each — these are the `<monitor-id>` values used in the next step.

### Step 2 — Delete the apps/web homepage monitor (human-executed, side effects)

```bash
curl --fail --max-time 30 -s -X POST "https://api.uptimerobot.com/v2/deleteMonitor" \
  --data-urlencode "api_key=$UPTIMEROBOT_API_KEY" \
  --data-urlencode "format=json" \
  --data-urlencode "id=<monitor-id>"
```

Replace `<monitor-id>` with the ID of the `apps-web homepage` monitor from Step 1.

### Step 3 — Delete the apps/agent-be health monitor (human-executed, side effects)

```bash
curl --fail --max-time 30 -s -X POST "https://api.uptimerobot.com/v2/deleteMonitor" \
  --data-urlencode "api_key=$UPTIMEROBOT_API_KEY" \
  --data-urlencode "format=json" \
  --data-urlencode "id=<monitor-id>"
```

Replace `<monitor-id>` with the ID of the `apps-agent-be health` monitor from Step 1.

### Step 4 — Verify deletion (read-only)

```bash
curl --fail --max-time 30 -s -X POST "https://api.uptimerobot.com/v2/getMonitors" \
  --data-urlencode "api_key=$UPTIMEROBOT_API_KEY" \
  --data-urlencode "format=json"
```

Verify the `apps-web homepage` and `apps-agent-be health` monitors no longer appear in the response.

---

## Verification Record

**Date:** 2026-07-14

### UptimeRobot API verification (validated 2026-07-14)

**Status:** API key verified. `getAccountDetails` succeeded.

**Command run:**

```bash
curl --fail --max-time 30 -s -X POST "https://api.uptimerobot.com/v2/getAccountDetails" \
  --data-urlencode "api_key=$UPTIMEROBOT_API_KEY" \
  --data-urlencode "format=json"
```

**Result:** `stat: "ok"`. Account email confirmed, plan is free tier (50 monitors, 5-minute intervals), 1 existing monitor (unrelated to bmad-easy). Monitor limit: 50, up monitors: 1.

### Monitor creation (pending human execution)

**Status:** Pending human execution. Monitor creation via `newMonitor` is an external service call with side effects — the human must execute the commands in Section 1, Steps 2 and 3 with a valid `UPTIMEROBOT_API_KEY`. Two monitors need to be created:

1. `apps-web homepage` — URL: `https://bmad-easy.vercel.app`, type 1, 5-minute interval
2. `apps-agent-be health` — URL: `https://agent-be-production-1c09.up.railway.app/health`, type 1, 5-minute interval

### Log access verification (pending human confirmation)

**Status:** Pending human confirmation. The runbook documents how to access logs on both platforms (dashboard + CLI). The operator must verify the retention period by checking the Vercel and Railway dashboards:

- Vercel: verify the plan (Hobby = 1 hour retention, Pro = 7 days). If Hobby, upgrade to Pro to meet the 7-day requirement.
- Railway: verify the plan (Pro = 7 days retention). If not Pro, upgrade to Pro to meet the 7-day requirement.

### Deploy failure notification verification (pending human confirmation)

**Status:** Pending human confirmation. The runbook documents that GitHub Actions sends email notifications for failed workflows by default. The operator must verify notification settings are enabled (GitHub → Settings → Notifications → Actions).

**Credential isolation:** All verification commands use `$UPTIMEROBOT_API_KEY` as an environment variable reference. No token values, API keys, or connection strings with passwords are recorded in this runbook.
