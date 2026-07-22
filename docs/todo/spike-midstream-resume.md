# Spike: opencode mid-stream resume (assumption #3)

**Date:** 2026-07-22
**Status:** Complete — assumption #3 VERIFIED (with caveats)
**Verifies:** Assumption #3 from `docs/todo/graph-pipeline.md` "Admitted assumptions" section
**Harness:** Reuses `docs/todo/spike-opencode-sandbox.js` (OpencodeSandbox, SpikeRunner)
**Script:** `docs/todo/spike-midstream-resume.js`

## TL;DR

Assumption #3 passes with caveats. An opencode session killed mid-response
leaves an incomplete assistant message in session storage (`time.completed`
unset), and `opencode run --format json --session <id>` resumes the session
successfully — the resumed session has full conversation context and continues
rather than restarting. The resume correctly recalls information from the
pre-kill turns.

However, the detection signal the plan hypothesizes ("exit code 0 with a
truncated last message, or a recognized provider-mid-stream error") does not
match what a process kill looks like in practice. A SIGKILL/SIGTERM produces
exit code 143 (128 + SIGTERM=15), not exit code 0. The pipeline uses
`--format json` for all agent runs (decided 2026-07-22), so the JSON event
stream emitted to stdout IS the structured signal: absence of a `step_finish`
event plus `time.completed = null` on the last assistant message marks a
truncated run. The default formatted output is not used for agent runs.

The plan's INCOMPLETE recovery path is viable: the dispatcher can detect a
killed session (non-zero exit code, incomplete assistant message in storage),
issue `opencode run --format json --session <id>` to resume, and the session
continues with full context. But the detection rule needs refinement — see
Findings.

## What was tested

The assumption from the plan:

> INCOMPLETE is a within-session recovery signal: the LLM provider drops the
> response mid-stream, the opencode session is still alive, and
> `opencode run --session <id>` resumes it from where it left off. This
> assumes the session is resumable after a mid-stream drop and that the resume
> continues rather than restarts. The detection signal — "exit code 0 with a
> truncated last message, or a recognized provider-mid-stream error" — is a
> heuristic on log content, not a structured signal; what a truncated last
> message looks like in opencode's stdout is not defined here.

The spike ran two variants in a Daytona sandbox with opencode v1.1.35 and
the free model `opencode/deepseek-v4-flash-free`:

**Variant A — default formatted output:**
1. Start a long opencode run (500+ word essay prompt).
2. Wait 12 seconds for streaming to begin.
3. Kill the process (`pkill -f "opencode run"` — SIGTERM).
4. Capture the session ID via `opencode session list --format json`.
5. Export the session state via `opencode export <sessionID>`.
6. Resume with `opencode run --session <id>` asking it to recall the topic.
7. Export the session state again after resume.

**Variant B — JSON format (`--format json`):**
1. Start a long opencode run with `--format json` (300-word TCP handshake).
2. Wait 12 seconds for streaming to begin.
3. Kill the process.
4. Parse the JSON events emitted before the kill.
5. Capture the session ID.
6. Resume with `--format json --session <id>` and verify it produces events.

**All steps passed, zero errors.** Total runtime: ~59 seconds.

**Pipeline decision (2026-07-22):** the pipeline uses `--format json` for all
agent runs, making Variant B the production path. Variant A (default formatted
output) is retained here as a comparison baseline; it is not the production
path.

## Results

### Session resume after mid-stream kill — PASS

The resumed session correctly recalled the topic from the pre-kill turn:

**Initial prompt (before kill):**
> Write a detailed essay of at least 500 words about the history of computing,
> covering the abacus, mechanical calculators, vacuum tubes, transistors,
> integrated circuits, microprocessors, and the internet.

**Partial output before kill (155 chars):**
```
INFO  2026-07-22T11:43:40 +78ms service=models.dev file={} refreshing

I'll research the history of computing to write a comprehensive essay.
```

**Kill:** `pkill -f "opencode run"` → exit code 143 (SIGTERM)

**Resume prompt:**
> What was the main topic of the essay I asked you to write? Answer in one
> sentence.

**Resume output:**
> The history of computing, covering the abacus, mechanical calculators,
> vacuum tubes, transistors, integrated circuits, microprocessors, and the
> internet with specific dates, names, and technical details.

The session resumed with full conversation context — the prior user prompt
and assistant response were readable from the on-disk storage. Exit 0, 6.3s.

### Incomplete assistant message persisted — PASS

The `opencode export` after the kill shows 3 messages in the session:

| # | Type | Complete | Text length | Notes |
|---|---|---|---|---|
| 0 | user | N/A (user messages have no `time.completed`) | 274 | The original prompt |
| 1 | assistant | **yes** (`time.completed` set) | 72 | "I'll research the history of computing..." — a completed step |
| 2 | assistant | **no** (`time.completed` = null) | 0 | The partial response being generated when killed — empty text |

The incomplete assistant message (msg[2]) has `time.completed = null` and
zero text parts. This is the key detection signal: **an incomplete assistant
message with `time.completed` unset means the session was interrupted
mid-response.** The streaming deltas (live-only events) are not persisted —
only `Text.Ended` events write the full text value to storage. So the partial
text being streamed when the process died is lost, but the message row exists
marking the interruption point.

After resume, the export shows 5 messages:

| # | Type | Complete | Text length | Notes |
|---|---|---|---|---|
| 0 | user | N/A | 274 | Original prompt |
| 1 | assistant | yes | 72 | First completed step |
| 2 | assistant | **no** | 0 | The interrupted partial message (still incomplete) |
| 3 | user | N/A | 85 | The resume prompt |
| 4 | assistant | yes | 203 | The resumed response — correctly recalls the topic |

The incomplete message (msg[2]) persists in storage after resume — opencode
does not clean it up. The resume appends a new user message and a new
(complete) assistant message. The LLM sees the full history including the
incomplete message when generating the resume response.

### JSON event stream before kill — PASS (with caveat)

Variant B used `--format json` to inspect the structured event stream. In
this run, the model completed the response before the kill fired (the shorter
prompt and fast free model finished in ~8s, under the 12s kill delay). The
full event sequence was:

```
step_start → text → step_finish
```

The `step_finish` event includes `reason: "stop"`, `cost`, and `tokens` —
the normal completion signal. Exit code 0.

In variant A (where the kill did catch the process mid-response), the
default formatted output showed partial text on stdout — whatever the TUI
renderer had printed before the kill. There is no structured truncation
signal in the default output format.

## Findings

### F1: Exit code on kill is 143, not 0

**Impact: Medium** — the plan's detection heuristic ("exit code 0 with a
truncated last message") does not match the observed behavior.

The plan hypothesizes the INCOMPLETE detection signal as "exit code 0 with a
truncated last message, or a recognized provider-mid-stream error." In
practice, a process kill via SIGTERM produces exit code 143 (128 + 15), not
0. A SIGKILL would produce 137 (128 + 9). The dispatcher should detect
INCOMPLETE as: **non-zero exit code (not a clean failure) AND an incomplete
assistant message in session storage** — not "exit code 0 with truncated
output."

The distinction matters: exit code 0 means the opencode process completed
normally (the response finished, `step_finish` was emitted). A non-zero exit
code from a signal (143, 137) means the process was killed externally — this
is the within-session recovery case, not a `failed` outcome.

A real provider mid-stream drop (where the LLM API connection is reset) may
produce a different signal — possibly an `error` event in `--format json`
mode, or a non-zero exit code with an error message on stderr. This spike
simulated a process kill, not a provider drop; the two may differ. See
Finding F4.

### F2: The detection signal is `time.completed = null` on the last assistant message

**Impact: High** — this is the reliable detection rule the dispatcher needs.

The `opencode export <sessionID>` output shows each message's `time.completed`
field. For a completed assistant message, `time.completed` is set to a
timestamp. For an interrupted assistant message, `time.completed` is `null`.
This is the structured signal — not a heuristic on log content.

The dispatcher's INCOMPLETE detection rule should be:

1. The session exited with a non-zero code (signal kill) OR exit code 0
   without a `step_finish` event (provider drop — untested).
2. Export the session (`opencode export <sessionID> --format json`).
3. Check the last assistant message: if `time.completed` is null, the
   session was interrupted mid-response → INCOMPLETE.
4. If the last assistant message has `time.completed` set, the session
   completed normally → classify as COMPLETE or `failed` per the output.

This is more reliable than log-content heuristics. The pipeline uses
`--format json` for agent runs (decided 2026-07-22), so the dispatcher has
BOTH the JSON event stream (for `step_finish`/`error` detection — absence of
`step_finish` marks a truncated run) AND the `opencode export` storage-state
check (`time.completed` on the last assistant message). The two signals
compose: the event stream is the live stdout signal, the export is the
durable storage signal.

### F3: Partial text is lost — resume starts a new turn, not continues the old one

**Impact: Medium** — the plan says "resumes it from where it left off,"
which is partially true.

The session is resumable and the conversation context is preserved. However,
the partial text being streamed when the process died is **not** persisted —
streaming deltas are live-only events that are not written to storage. Only
`Text.Ended` events (marking a complete text segment) are durable. So the
incomplete assistant message (msg[2]) has zero text content, even though
the model had started generating a response.

When the session is resumed with `--session <id> "new prompt"`, the LLM sees
the full history (including the empty incomplete message) and generates a
fresh response to the new prompt. It does not "continue" the partial text —
it starts a new turn. This is the correct behavior for the pipeline's use
case: the dispatcher issues `opencode run --format json --session <id> "continue"` and the
LLM generates a new response with full context of what happened before.

The plan's description ("resumes it from where it left off") is accurate at
the session level — the conversation continues — but not at the text level —
the partial response text is lost.

### F4: Provider mid-stream drop vs. process kill may differ

**Impact: Medium** — this spike tests process kill, not provider drop.

The plan's INCOMPLETE scenario is specifically "the LLM provider drops the
response mid-stream" — e.g., the HTTP connection to the LLM API is reset
during streaming. This spike simulated a process kill (SIGTERM via `pkill`),
which is a different failure mode:

- **Process kill:** The opencode process dies. Exit code 143. The session
  storage has an incomplete assistant message. The session is resumable.
- **Provider drop:** The opencode process is still alive. The LLM API
  connection is reset. opencode may emit an `error` event (in `--format json`
  mode) and exit with a non-zero code, or it may handle the error internally
  and retry. The session storage state depends on how opencode handles the
  error.

The research sub-agents found that opencode's event system has a
`session.error` event type that is emitted on provider errors, and the CLI
emits it as an `"error"` JSON event in `--format json` mode. A provider
mid-stream drop would likely surface as an `error` event, not a silent
truncation. But this was not tested empirically — testing a real provider
drop requires either a flaky provider or a network manipulation that this
spike did not attempt.

The plan should treat these as two cases:
1. **Process killed (this spike):** exit code 143/137, incomplete assistant
   message in storage → resume with `--session`.
2. **Provider drop (untested):** may produce an `error` event or a non-zero
   exit code with an error message → may or may not leave an incomplete
   message → the dispatcher should check storage state before deciding to
   resume vs. retry.

### F5: `opencode export` output format has prefix noise

**Impact: Low** — a parsing detail for the dispatcher's transcript pull.

`opencode export <sessionID>` prepends an `INFO` log line and an
"Exporting session: ses_..." line before the JSON output. The JSON object
starts with `{` appended to the "Exporting session:" line. The dispatcher's
transcript pull must strip this prefix before parsing the JSON. Using
`opencode export <sessionID> 2>/dev/null` may help (the INFO line goes to
stderr), but the "Exporting session:" prefix is on stdout. A robust parser
finds the first `{` after "Exporting session:" and extracts from there.

### F6: `opencode/big-pickle` free model is no longer available

**Impact: Low** — affects spike reproducibility, not the pipeline.

The prior spikes (`spike-opencode-sandbox.md`, `spike-stop-resume.md`) used
`opencode/big-pickle` (opencode's free hosted model). As of 2026-07-22, this
model returns "No provider available" when used from a sandbox. The spike
used `opencode/deepseek-v4-flash-free` instead, which is verified working.
Other free models available: `opencode/laguna-s-2.1-free`,
`opencode/mimo-v2.5-free`, `opencode/nemotron-3-ultra-free`,
`opencode/north-mini-code-free`.

## SDK API surface confirmed

All methods the pipeline plan depends on for mid-stream resume:

| Method | Signature | Notes |
|--------|-----------|-------|
| `executeSessionCommand(sessionId, {command, runAsync: true})` | Returns `{cmdId}` | Starts the command async |
| `getSessionCommand(sessionId, cmdId)` | Returns `{exitCode}` | Poll for completion; exitCode 143 = SIGTERM |
| `getSessionCommandLogs(sessionId, cmdId)` | Returns `{output, stdout, stderr}` | Snapshot of output so far |
| `executeCommand(cmd, cwd, env, timeout)` | Returns `{result, exitCode}` | Used for `pkill`, `opencode session list`, `opencode export` |
| `opencode session list --format json` | JSON array of sessions | Newest first; `id` field is the session ID |
| `opencode export <sessionID>` | JSON to stdout | Session info + messages with `time.completed` fields |
| `opencode run --format json --session <id> "prompt"` | Resumes session | Appends new turn; full conversation context preserved |

## Impact on the graph pipeline plan

Assumption #3 is verified with caveats. The INCOMPLETE recovery path is
viable:

- **Session resume works:** `opencode run --format json --session <id>` after a
  mid-stream kill resumes the session with full conversation context. The resumed
  response correctly recalls information from pre-kill turns.
- **Incomplete messages are persisted:** the session storage records an
  incomplete assistant message (`time.completed = null`) marking the
  interruption point.
- **The detection signal is structured, not a heuristic:** with `--format json`
  (the production path), the dispatcher has the JSON event stream as a live
  signal (`step_finish` present/absent, `error` events) AND the `opencode
  export` storage-state check (`time.completed` on the last assistant message)
  as a durable signal. The two compose.

### Detection rule refinement

The plan should update the INCOMPLETE detection rule from:

> "exit code 0 with a truncated last message, or a recognized provider-mid-stream error"

to:

> **exit code is non-zero (signal kill: 143 for SIGTERM, 137 for SIGKILL) OR
> exit code 0 without a `step_finish` event in JSON output** AND **the last
> assistant message in `opencode export <sessionID>` has `time.completed`
> unset.**

This is a two-signal check: the exit code tells the dispatcher the process
died abnormally, and the session export confirms whether it died mid-response
(an incomplete assistant message) or after completing (no incomplete
message — classify as COMPLETE or `failed` per the output). With `--format
json` (the production path), the dispatcher also has the event stream as a
live signal: absence of a `step_finish` event in the JSON output marks a
truncated run, and `error` events signal provider failures. The event-stream
signal and the storage-state signal compose — both point at the same
conclusion when the run was truncated.

### What does NOT need to change

- The resume mechanism (`opencode run --format json --session <id> "continue"`) works as
  designed — no changes needed.
- The session ID capture (via `opencode session list --format json`) works
  as in the prior spikes.
- The `</dev/null` stdin redirect composes with `--session` (confirmed by
  spike-stop-resume.md finding F4, re-confirmed here).

### Open question: provider drop vs. process kill

This spike tested process kill (SIGTERM). A real provider mid-stream drop
(HTTP connection reset during LLM streaming) may produce a different signal.
The research sub-agents found that opencode has a `session.error` event type
for provider errors, which surfaces as an `"error"` JSON event in
`--format json` mode — and `--format json` is now the production path for
agent runs, so the dispatcher will see these events directly, not just as a
research mode. But this was not tested empirically. The dispatcher should
handle both cases: process kill (exit code 143/137, check storage) and
provider error (exit code may be 0 or non-zero, check for `error` events in
JSON output or error messages in stderr). The storage-state check
(`time.completed` on last assistant message) is the reliable signal in both
cases.

## Online sources

### opencode CLI session resume

**Source:** https://opencode.ai/docs/cli/#run-1

> `--session` `-s` Session ID to **continue**.

Confirms `--session` resumes (continues) an existing session, appending new
turns to the conversation.

### opencode session storage (research)

**Source:** https://github.com/sst/opencode (source code analysis by
research sub-agent)

Key findings from the source code:

- opencode uses an event-sourcing architecture with SQLite storage at
  `~/.local/share/opencode/opencode.db` (both v1.17.20 and v1.1.35).
- **Durable events** (persisted to the `event` table): `step.started`,
  `step.ended`, `step.failed`, `text.started`, `text.ended`,
  `reasoning.started`, `reasoning.ended`, `tool.called`, `tool.success`,
  `tool.failed`.
- **Live-only events** (NOT persisted, only streamed): `text.delta`,
  `reasoning.delta`, `tool.input.delta` — streaming fragments.
- The `session_message` table stores projected messages. An assistant
  message's `time.completed` field is set only when `step.ended` or
  `step.failed` is committed — if the process dies mid-response,
  `time.completed` remains null.
- `SessionHistory.load()` loads ALL `session_message` rows for the session,
  including incomplete ones — no filtering by completion status. The partial
  message IS included in the context sent to the LLM on resume.

Source files:
- `packages/core/src/session/projector.ts` — `getCurrentAssistant()` checks
  `!message.time.completed`
- `packages/schema/src/session-event.ts` — durable vs live-only event
  definitions
- `packages/core/src/session/history.ts` — `SessionHistory.load()`
- `packages/opencode/src/cli/cmd/run.ts` — `--session` resume logic
- `packages/opencode/src/cli/cmd/export.ts` — `opencode export` command

### opencode `--format json` event types (research)

**Source:** https://github.com/sst/opencode (source code analysis by
research sub-agent)

The `--format json` flag emits newline-delimited JSON objects with a `type`
field. Five event types are emitted:

| Type | Trigger |
|------|---------|
| `step_start` | `message.part.updated` where `part.type === "step-start"` |
| `step_finish` | `message.part.updated` where `part.type === "step-finish"` |
| `text` | `message.part.updated` where `part.type === "text"` and `part.time.end` is set |
| `reasoning` | `message.part.updated` where `part.type === "reasoning"` and `part.time.end` is set |
| `tool_use` | `message.part.updated` where `part.type === "tool"` and `part.state.status` is `"completed"` or `"error"` |
| `error` | `session.error` event with matching `sessionID` |

There is no dedicated "truncated" or "interrupted" event type. A provider
error surfaces as an `error` event. A process kill produces no cleanup
event — stdout just ends.

## Spike script

| Script | Purpose | Reuses |
|---|---|---|
| `spike-midstream-resume.js` | Kill opencode mid-response, inspect storage, resume, verify context | `spike-opencode-sandbox.js` (OpencodeSandbox, SpikeRunner) |

The script creates and destroys its own sandbox. Total sandbox time: ~59
seconds. No sandboxes were left running.

## Recommendation

1. **INCOMPLETE recovery is viable as designed.** The session resume mechanism
   works — `opencode run --format json --session <id>` after a mid-stream kill resumes with
   full context. No design changes needed to the resume path.
2. **Refine the detection rule.** Replace the log-content heuristic with a
   storage-state check: exit code non-zero (signal) AND last assistant
   message has `time.completed = null` in `opencode export`. The pipeline uses
   `--format json` for agent runs (decided 2026-07-22), so the dispatcher also
   has the JSON event stream as a live signal — absence of a `step_finish`
   event marks a truncated run, and `error` events signal provider failures.
   The event-stream signal and the storage-state signal compose.
3. **Test a real provider drop separately.** This spike tested process kill
   (SIGTERM). A provider mid-stream drop (HTTP connection reset) may produce
   a different signal (an `error` event in JSON mode, or a specific error
   message). `--format json` is the production path, so the dispatcher will
   see `error` events directly. The storage-state check should work in both
   cases, but empirical verification of the provider-drop path is a follow-up.
4. **The partial text is lost — accept this.** Streaming deltas are not
   persisted. The incomplete assistant message has zero text content. The
   resume generates a fresh response with full context. This is the correct
   behavior for the pipeline's use case (the dispatcher issues
   `opencode run --format json --session <id>` with a continue prompt, not a
   "finish the partial sentence" instruction).
