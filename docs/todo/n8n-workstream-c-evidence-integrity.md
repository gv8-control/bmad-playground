# Workstream C — Self-improvement evidence integrity

Extracted from the n8n Workflow Review (2026-07-17). Workstream B (phantom-halt
elimination) is closed; these changes address the self-improvement contract gaps
that remain.

This workstream should land after Workstream A and the perimeter hardening
(Workstreams D and E), so that failures during rollout are themselves captured
for reflection.

## Workstream steps

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| C1 | F-5 | Error Handler appends to `runner-errors.jsonl` (`source:"n8n-error-handler"`) | M | Closes the self-improvement contract gap for n8n failures |
| C2 | F-6 | Restructure the Reflect command to avoid the pipe (capture output to a variable, then `tail` separately, checking exit code between) — `pipefail` is not available because n8n uses `sh`→`dash`, not `bash` (see V8); validate proposal file after Reflect; record `infra-reflection-failure` | M | Makes reflection failures visible |
| C3 | F-6 | Long-term: route the reflector through the runner machinery | L | Reflection gets timeout handling, INCOMPLETE auto-continue, and runner-errors for free |

## Findings

### F-5 — n8n-level failures never reach the reflection evidence feed

- **Where:** Error Handler (entire workflow); all five production workflows via
  `settings.errorWorkflow`
- **Evidence:** `runner-errors.jsonl` is written only by the `Agent run` shells
  in BMAD Session. Node crashes (`Next story`, `Parse decision`, journal nodes,
  HTTP failures, Mistral outages) go to the Error Handler, which only sends an
  ntfy notification — it does not append to `runner-errors.jsonl`. The
  architecture doc (line 54) says infra failures (including "n8n plumbing") feed
  `infra-*` observations, but n8n plumbing failures never reach the reflector.
- **Consequence:** The self-improvement contract is broken for exactly the
  failure class (machinery) it was designed to learn from. Recurring n8n failures
  never accumulate as a human work queue.
- **Fix:** The Error Handler appends a structured entry to
  `runner-errors.jsonl` alongside the ntfy POST, using the same schema with
  `source:"n8n-error-handler"`, `context:<workflow+node>`, and
  `stderrTail:<error.message>`. This makes n8n-level failures visible to the
  same infra-evidence pipeline that opencode failures already feed.

### F-6 — Reflection failures are invisible; `Reflect` swallows the exit code

- **Where:** Develop Epic → `Reflect`
- **Evidence:** The command is `opencode run --agent reflector "..." | tail -n 5`.
  A pipe's exit code is the last command's — `tail` exits 0 even when opencode
  exits non-zero. If the reflector times out or crashes, the Execute Command node
  sees exit 0 and proceeds to `Apply amendments`. `Apply amendments` reads the
  proposal file independently; if no/partial proposal was written, it outputs
  `{applied:[], rejected:[], ...}` and the loop reports "0 amendments applied."
  Additionally, reflection runs `opencode` directly (not through BMAD Session),
  so runner errors during reflection are NOT captured in `runner-errors.jsonl`.
- **Consequence:** If the reflector consistently fails, the pipeline silently
  stops learning. Nothing distinguishes "reflection ran and found nothing" from
  "reflection crashed."
- **Fix:** (1) Restructure the Reflect command to avoid the pipe (capture
  opencode output to a variable, then `tail` separately, checking exit code
  between) — `pipefail` is not available because n8n uses `sh`→`dash`, not
  `bash` (see V8). (2) After Reflect, add a validation node that checks whether
  the proposal file exists and is valid JSON; if not, route to a "reflection
  failed" notification and record an `infra-reflection-failure` entry in
  `runner-errors.jsonl`. (3) Long-term, run the reflector through the same
  runner machinery as step runs so it gets timeout handling, INCOMPLETE
  auto-continue, and runner-errors logging for free.

## Relevant verifications

### V8 — The shell is bash, but n8n Execute Command uses dash — PARTIALLY VERIFIED

**Finding:** The login shell is `/bin/bash` (5.2.21). However, n8n's Execute
Command node uses the system's default shell via `child_process.exec`, which on
this system is `sh` → `dash` (`/usr/bin/sh -> dash`). `dash` does **not** support
`set -o pipefail`.

**Impact on C2 (the Reflect pipefail fix):** The fix as written (`set -o
pipefail`) would fail if the Execute Command node uses `sh`. The correct
approach is to avoid `pipefail` and instead capture opencode output to a
variable, then `tail` separately, checking the exit code between. This is a
minor correction to the C2 fix direction, not a fundamental change.

### V10 — The Error Handler can write to `runner-errors.jsonl` — CONFIRMED

**Finding:** The Error Handler is a regular n8n workflow. It can use an
Execute Command node to run a script that appends to
`_bmad-output/pipeline/runner-errors.jsonl`. The n8n process has filesystem
access to the workspace (`N8N_RESTRICT_FILE_ACCESS_TO=""` in `.env`, which
means no file access restrictions). The C1 fix is viable as designed — add an
Execute Command node to the Error Handler that calls a small script
(`scripts/pipeline/record-runner-error.mjs`) to append the structured entry.

### V13 — The reflector agent is configured — CONFIRMED

**Finding:** The reflector agent is defined at `.opencode/agent/reflector.md`
(mode: primary, model: neuralwatt/glm-5.2, temperature: 0.3, reasoningEffort:
max). It is not in `opencode.json` (which has no agents section), but opencode
discovers agents from the `.opencode/agent/` directory. The agent is properly
configured with a detailed system prompt covering evidence grading, signal-vs-
noise discipline, hypothesis discipline, and output discipline. The
`reflect-prompt.mjs` now includes an `INCOMPLETES` guidance block that
distinguishes (a) genuine auto-continues that resolve, and (b) phantom INCOMPLETE from
misclassification (`infra-incomplete-misclassification`). F-6 (reflection
failures invisible) is not caused by a missing agent or missing guidance — it
is caused by the `Reflect` node swallowing the exit code (the pipe).
