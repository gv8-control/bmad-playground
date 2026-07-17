# Workstream D — Security perimeter

Extracted from the n8n Workflow Review (2026-07-17). Workstream B (phantom-halt
elimination) is closed; these changes address the security perimeter.

This workstream should land after Workstream A. Note:
F-1 is Critical and the D1/D2 fixes are Small effort — treat as urgent
regardless of broader sequencing, because the webhook URL is published to a
public ntfy topic and the exposure compounds with time.

## Workstream steps

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| D1 | F-1 | Validate `Epic` in `Configuration` node (digits-only before shell) | S | Closes the shell-injection vector |
| D2 | F-1 | Add header authentication to `Develop epic webhook` | S | Prevents unauthorised loop triggers |
| D3 | F-1 | Long-term: replace Execute Command interpolation with a wrapper script that receives the epic as an env var (`EPIC`) — Code nodes cannot use `child_process` (see V5) | M | Eliminates the shell-interpolation class without weakening the sandbox |

## Findings

### F-1 — Shell injection via unauthenticated webhook

- **Where:** Develop Epic → `Develop epic webhook` → `Configuration` → `Next story`
- **Evidence:** The webhook has no `authentication` field. The body `epic` flows
  through `Configuration` (`$json.body?.epic ?? $json.Epic ?? '2'`) into the
  Execute Command `node scripts/pipeline/next-story.mjs "{{ $('Configuration').first().json.Epic }}"`.
  n8n expression interpolation does not shell-escape. `next-story.mjs` validates
  `/^\d+$/`, but the shell has already interpolated the value before the script
  receives `argv`. A body `{"epic":"2\"; id; #"}` yields
  `node scripts/pipeline/next-story.mjs "2"; id; #"`.
- **Consequence:** Remote code execution on the n8n host for anyone who can
  reach port 5678. The ntfy click URLs (published to the public `agent-outcome`
  topic) reveal the host and port.
- **Fix:** (1) Validate `Epic` in the `Configuration` Set node so only digits
  ever reach the shell:
  `={{ /^\d+$/.test($json.body?.epic ?? '2') ? ($json.body?.epic ?? '2') : '2' }}`.
  (2) Add header authentication to the webhook node. (3) Long-term, replace the
  Execute Command interpolation with a wrapper script that receives the epic as
  an env var (`EPIC`) — Code nodes cannot use `child_process` (see V5).

## Relevant verifications

### V5 — n8n Code nodes can call `child_process` — REFUTED (the D3 fix is blocked)

**Finding:** n8n v2.26.8 uses the `JsTaskRunnerSandbox` for Code nodes. The task
runner runs code in a `node:vm` context with a `requireResolver` that **blocks
any module not on the allow-list**. The allow-list for built-in modules defaults
to `''` (empty), and the env override is `NODE_FUNCTION_ALLOW_BUILTIN`. The
current `.env` sets only `NODE_FUNCTION_ALLOW_EXTERNAL=uuid` — `child_process`
is not on the allow-list and will throw `DisallowedModuleError`.

**Impact on D3:** The long-term fix (replace Execute Command shell interpolation
with a Code node calling `child_process.execFile`) is **blocked** unless
`NODE_FUNCTION_ALLOW_BUILTIN=child_process` is set in `.env`. That would weaken
the sandbox for all Code nodes, not just the intended one. The correct approach
is: (1) keep the Execute Command node but validate the `Epic` input in the
`Configuration` Set node (digits-only regex) so only digits ever reach the
shell — this is the D1 fix and it is unaffected; (2) for the long-term D3 fix,
write a small wrapper script (`scripts/pipeline/run-next-story.sh`) that
receives the epic as an environment variable (`EPIC`) rather than a shell-
interpolated argument, and have the Execute Command node set `EPIC` via n8n's
env mechanism instead of interpolating into the command string.
