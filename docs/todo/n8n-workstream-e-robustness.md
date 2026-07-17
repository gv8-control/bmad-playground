# Workstream E — Robustness of the loop

Extracted from the n8n Workflow Review (2026-07-17). Workstream B (phantom-halt
elimination) is closed; these changes harden the loop against transient and
external-service failures.

This workstream should land alongside Workstream D after Workstream A.
Publishing these workflow changes does not disturb in-flight executions.

## Workstream steps

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| E1 | F-12 | Set `onError: continueRegularOutput` on all 9 pre-existing Notify nodes (the new `Notify cap` already has it) | S | ntfy outage no longer halts the pipeline |
| E2 | F-13 | Add retry/onError to journaling and parse Execute Command/Code nodes | S | Transient fs failures no longer halt the epic |
| E3 | F-11 | Set `WEBHOOK_URL=http://localhost:5678` in n8n env | S | Fixes unreachable click/recovery URLs |

## Findings

### F-11 — Error Handler click URL is unreachable (`0.0.0.0`)

- **Where:** Error Handler → `Notify failure`; BMAD Session → `Notify` (question)
- **Evidence:** `N8N_HOST=0.0.0.0` with no `EDITOR_BASE_URL` override. The Error
  Handler's `$json.execution?.url` resolves to `http://0.0.0.0:5678/...` —
  browsers cannot reach it. The question-form `Recovery URL`
  (`$execution.resumeUrl.replace('webhook','form')`) resolves to
  `http://0.0.0.0:5678/form-executions/...` — also unreachable. Every other
  notification hardcodes `http://localhost:5678/...` (reachable).
- **Fix:** Set `WEBHOOK_URL=http://localhost:5678` in n8n's env (preferred —
  controls both webhook and resume URLs) or `N8N_EDITOR_BASE_URL=http://localhost:5678`
  (controls editor/instance URLs). `WEBHOOK_URL` is the more complete fix
  because it directly controls `webhookWaitingBaseUrl`, which is what
  `$execution.resumeUrl` derives from.

### F-12 — Existing Notify nodes have no `onError`; an ntfy outage halts the pipeline

- **Where:** Develop Epic (5 Notify nodes), BMAD Session (3 existing Notify
  nodes), Error Handler (1 Notify node)
- **Evidence:** The new `Notify cap` node has `onError: continueRegularOutput`,
  but the 9 pre-existing Notify nodes across the other workflows do not. ntfy.sh
  is a free external service with no SLA. If it is unreachable, any Notify node
  fails → triggers `errorWorkflow` → Error Handler fires → which also POSTs to
  ntfy → which also fails. The pipeline halts on a notification failure.
- **Fix:** Set `onError: continueRegularOutput` on all 9 pre-existing Notify
  nodes. Notifications are best-effort observability; a missed notification must
  never halt development.

### F-13 — Journaling Execute Command nodes have no error handling

- **Where:** Develop Story → `Journal story start/step start/step end/story end/
  story failed`; Develop Epic → `Next story`, `Parse decision`, `Reflect`, `Apply
  amendments`
- **Evidence:** Only `Run BMAD Session` (`retryOnFail:true, maxTries:2,
  onError:continueErrorOutput`) and `Record trace` (`onError:
  continueRegularOutput`) have error settings. The journaling nodes do not. A
  transient filesystem failure (disk full, permissions) crashes the loop.
- **Fix:** Add `retryOnFail: true, maxTries: 2, waitBetweenTries: 2000` to the
  journaling nodes, consistent with `Run BMAD Session`. For `Parse decision` and
  `Parse steps`, wrap `JSON.parse` in try/catch returning a structured error item
  that routes to the halt path instead of crashing. Journaling is critical, so
  stopping after a retry is acceptable — but a single transient failure should
  not halt the epic.

## Relevant verifications

### V3 — `EDITOR_BASE_URL` / `WEBHOOK_URL` control resume and execution URLs — CONFIRMED

**Finding:** `UrlService.getWebhookBaseUrl()` uses `process.env.WEBHOOK_URL`
first, falling back to `generateBaseUrl()` which constructs
`${protocol}://${host}:${port}${path}` from `GlobalConfig` (which reads
`N8N_PROTOCOL`, `N8N_HOST`, `N8N_PORT`). The `resumeUrl` is built from
`webhookWaitingBaseUrl`.

**Impact on E3:** The fix is correct — set `WEBHOOK_URL=http://localhost:5678`
(preferred, controls both webhook and resume URLs) or
`N8N_EDITOR_BASE_URL=http://localhost:5678` (controls editor/instance URLs).
`WEBHOOK_URL` is the more complete fix because it directly controls
`webhookWaitingBaseUrl`, which is what `$execution.resumeUrl` derives from.
Neither env var is currently set; the fallback to `N8N_HOST=0.0.0.0` is what
produces the unreachable `0.0.0.0` URLs.
