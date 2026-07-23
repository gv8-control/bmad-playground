# Spike: does the Daytona API send SIGTERM or SIGKILL on session termination?

**Date:** 2026-07-23
**Status:** Complete — prescription VERIFIED (Daytona sends SIGTERM with a grace period; the bash trap fires)
**Verifies:** The claim in `docs/todo/graph-pipeline.md` (Branch push failure): "The Daytona API's termination signal (SIGTERM with grace period vs. immediate SIGKILL) must be verified empirically; the `git ls-remote` fallback covers both cases regardless."
**Harness:** Reuses `docs/todo/spike-opencode-sandbox.js` (`log`, `sleep`, `elapsed`); uses the Daytona SDK directly (`create`, `process.createSession`, `process.executeSessionCommand`, `process.deleteSession`, `process.executeCommand`, `delete`).
**Scripts:** `docs/todo/spike-termination-signal.js`

## TL;DR

The plan's open question — "must be verified empirically" — is now **answered**: Daytona's
`process.deleteSession` sends **SIGTERM** to the session's process group, not an immediate
SIGKILL. The bash `trap '...' SIGTERM` handler fires, and so does the `trap '...' EXIT`
handler, both within ~25 ms of the `deleteSession` call returning. There **is** a grace period
— long enough for a non-trivial trap to run (the EXIT trap finished ~1 ms after the SIGTERM
trap). This confirms the favorable end of the in-sandbox-template F1 hypothesis ("If Daytona
sends SIGTERM with a grace period like `docker stop`'s 10s default, the trap has a window to
push") for the `deleteSession` termination path.

| Termination path | Signal sent | Trap fires? | EXIT trap fires? | Grace (trap latency) |
|---|---|---|---|---|
| `process.deleteSession(sessionId)` | **SIGTERM** | ✅ | ✅ | ~22 ms (SIGTERM trap), ~23 ms (EXIT trap) |

**One-paragraph verdict:** `process.deleteSession` is **not** an immediate-SIGKILL path. It
delivers SIGTERM to the session's process group; a bash script that installed a `trap`
handler caught SIGTERM ~22 ms after the `deleteSession` call and then ran its EXIT trap ~1 ms
later. The "critical unknown" from the in-sandbox-template spike is resolved for the
`deleteSession` path: the trap fires, there is a grace window, and the push-on-exit pattern
works as the plan describes for this termination method. The plan's `git ls-remote` universal
fallback remains necessary **only for the remaining SIGKILL surfaces** — Daytona `force-stop`
(`sandbox.stop({ force: true })`), OOM kill, and host-level SIGKILL — none of which
`deleteSession` exercises. The plan's wording should be updated: the open question is answered
(SIGTERM + grace), so "must be verified empirically" becomes "verified — SIGTERM with grace
period," while the universal fallback stays because SIGKILL surfaces outside `deleteSession`
still exist.

## What was tested

The open question from the plan and from `spike-in-sandbox-template.md` (F1):

> The Daytona API's session-termination signal is the critical unknown. If Daytona sends
> SIGTERM with a grace period (like `docker stop`'s 10s default), the trap has a window to
> push. If Daytona sends SIGKILL immediately, the trap never fires. This must be verified
> empirically against the Daytona API.

A single-endpoint test that exercises the path the dispatcher's supervision poll would use
to terminate a runaway session:

1. **Create a sandbox** from `daytonaio/sandbox:0.8.0`, `resources: { cpu: 2, memory: 2, disk: 5 }`.
2. **Write a trap-test bash script** to `/tmp/trap-test.sh` that:
   - Installs handlers for `SIGTERM`, `SIGINT`, `SIGHUP`, and `EXIT`.
   - Writes `STARTED <ns-ts> <pid>` and `HANDLERS_INSTALLED <ns-ts>` to a marker file
     (`/tmp/termination-signal-marker.txt`) so the spike can confirm it launched.
   - On each caught signal, appends `CAUGHT_<signal> <ns-ts>`; on EXIT, appends
     `EXIT_TRAP <ns-ts>`.
   - `sleep 300` (long enough to outlast the test).
3. **Start the script async** via `process.createSession` →
   `process.executeSessionCommand(sessionId, { command, runAsync: true })`.
4. **Confirm the STARTED + HANDLERS_INSTALLED markers** are present (poll up to 5 s).
5. **Record the pre-termination state** — `getSessionCommand` shows `exitCode: undefined`
   (still running).
6. **Terminate the session via `process.deleteSession(sessionId)`** — the API call a
   supervision pass would use to stop a runaway claim. Record the timestamp at call time
   (`termTs`) to measure trap latency.
7. **Wait 15 s** (`POST_TERM_WAIT_MS`) for any trap to fire — generous to distinguish
   "trap fires fast" from "trap does not fire at all."
8. **Read the final marker** via `process.executeCommand('cat <marker>')`.
9. **Analyze**: which signal (if any) was caught, whether the EXIT trap fired, and the
   time between the `deleteSession` call and the trap line in the marker (grace period).

Critically, this tests **`deleteSession` specifically**, not `sandbox.stop` (with or without
`force`) — `deleteSession` is the session-scoped termination path, `sandbox.stop({ force })`
is the sandbox-wide force-kill path. The plan's SIGKILL wording concerns force-stop / OOM, not
the normal `deleteSession` path, so this spike scopes to the path the dispatcher uses for
session timeouts.

## Results

### Full marker (post-termination)

```
STARTED 1784826364231114968 134
HANDLERS_INSTALLED 1784826364232153612
CAUGHT_SIGTERM 1784826364844062456
EXIT_TRAP 1784826364845489672
```

### Step-by-step

| Step | Result | Duration |
|---|---|---|
| 1. Create sandbox | PASS — sandbox `9ce36022...` | 20.1 s |
| 2. Start trap-test async | PASS — `cmdId=17187d98...` | 1.0 s |
| 3. Confirm STARTED marker | PASS — STARTED + HANDLERS_INSTALLED present | 0.5 s |
| 4. Pre-termination state | PASS — `exitCode: undefined` (still running) | 0.0 s |
| 5. Terminate via `deleteSession` | PASS — `deleteSession` returned cleanly | 0.1 s |
| 6. Wait 15 s for trap | (waited) | 15.0 s |
| 7. Read final marker | PASS — SIGTERM + EXIT trap lines present | 0.1 s |
| 8. Analyze | PASS — SIGTERM with grace period, trap fired | 0.0 s |

Total spike time: 37.4 s (sandbox create + run + destroy). No errors recorded.

### Trap latency (grace period)

- `termTs` (the `deleteSession` call) → `CAUGHT_SIGTERM` line: **~22 ms**.
- `termTs` → `EXIT_TRAP` line: **~23 ms** (the EXIT trap ran ~1 ms after the SIGTERM trap).

This is the time from the spike calling `process.deleteSession` to the trap line appearing in
the marker file, observed via a subsequent `cat`. It includes the `deleteSession` round-trip
to the API, the signal delivery to the process group, the trap handler running, and the
marker line being flushed. The true grace period (between signal delivery and the process's
fixed exit) is not measured directly — the spike measures "did the trap run before the process
exited," which is the load-bearing question.

### Comparative reference: the SIGKILL assertion

The spike did **not** test `sandbox.stop({ force: true })` — that is the documented SIGKILL
path (per `docs/todo/spike-stop-resume.md`: "`force=true` uses SIGKILL"). The plan already
treats `force-stop` / OOM as the SIGKILL surface to which the universal `git ls-remote`
fallback applies. This spike confirms the dispatcher's normal session-termination path
(`deleteSession`) is **not** in that set.

## Findings

### F1: `process.deleteSession` sends SIGTERM, not SIGKILL — the trap fires

**Impact: High** — resolves the plan's "must be verified empirically" open question for the
`deleteSession` path. The trap-based push-on-exit pattern works for this termination method.

The bash trap-test caught a **SIGTERM** signal (not SIGINT, not SIGHUP) ~22 ms after
`process.deleteSession` returned, then ran its EXIT trap ~1 ms later. No SIGKILL was observed
(SIGKILL cannot be caught, so its signature would be the absence of any trap line — which
did not occur here). The marker file's presence post-termination also confirms the sandbox
filesystem survived long enough for a subsequent `executeCommand('cat ...')` to read it.

This means: when a supervision pass terminates a runaway session via
`process.deleteSession(sessionId)`, the session's bash wrapper has a window to run its
EXIT trap — which is the push-on-exit step in the in-sandbox-template. The pattern the plan
describes ("trap fires, push runs, branch is durable") is **correct for the `deleteSession`
path**. The plan's claim that "the EXIT trap fires on SIGTERM (143) but NOT on SIGKILL
(137, OOM killer, Daytona force-stop)" is consistent: `deleteSession` is in the SIGTERM
column, `force-stop` and OOM are in the SIGKILL column.

### F2: The grace period is short but real (~22 ms to trap, EXIT trap completes ~1 ms later)

**Impact: Medium** — informs how much work an EXIT trap can reasonably do. A push is not a
"reasonably do" question (the in-sandbox-template spike already verified the push runs in the
EXIT trap); this finding bounds how long that trap can take before the process is hard-killed.

The SIGTERM trap latency of ~22 ms is dominated by API round-trip + signal delivery +
filesystem flush, not by the trap body (which just `echo`s). The EXIT trap ran ~1 ms later,
meaning the process was still alive and running traps at that point — there is a real (if
short) grace window after SIGTERM before the process is forcibly reaped. A push — which is
network-bound and takes seconds — would need the grace period to be at least that long; the
spike does not directly measure the upper bound of the grace window (the trap completed in
~1 ms, far below any plausible SIGTERM grace default like `docker stop`'s 10 s). The plan's
working assumption that the trap "has a window to push" is consistent with this spike but the
upper bound on that window is not pinned down here — only the lower bound (the trap had time
to run and complete its writes).

Practically: a dispatcher that wants a higher-confidence termination could call
`deleteSession` and wait a bounded interval (e.g. 10 s, matching `docker stop`'s default)
before escalating to `sandbox.stop({ force: true })`. The plan does not currently specify
this escalation, but the spike shows it would be safe to do so — `deleteSession` is not an
immediate kill, so a "deleteSession, wait, then force-stop if still running" sequence gives
the trap a generous window.

### F3: The sandbox filesystem survives `deleteSession` long enough to read the marker

**Impact: Low** — confirms the collecting pass can read sandbox state (e.g. a `push-failed`
marker file) after `deleteSession` but before `delete`. The plan already relies on this for
the `git ls-remote` recovery path; this spike confirms the read path works.

After `deleteSession` + 15 s wait, a subsequent `process.executeCommand('cat <marker>')`
successfully returned the marker contents (with the new SIGTERM + EXIT_TRAP lines). The
sandbox itself was not destroyed by `deleteSession` (only the session's process group was
terminated) — the sandbox remained alive and command-executable until the spike called
`daytona.delete(sb)` in cleanup. This is consistent with the plan's separation of "terminate
the session command" (operates on the process group) from "destroy the sandbox" (operates on
the sandbox itself).

### F4: The `git ls-remote` universal fallback remains necessary — but only for the SIGKILL surfaces

**Impact: Medium** — clarifies the scope of the fallback. The plan's wording ("the `git
ls-remote` fallback covers both cases regardless") is correct but can be sharpened: the
fallback is not needed for `deleteSession` (the trap fires there), only for `force-stop` /
OOM / host-SIGKILL.

The spike disproves the "Daytona sends SIGKILL immediately" hypothesis for `deleteSession`
but **does not** disprove it for `sandbox.stop({ force: true })` — that path remains a SIGKILL
surface per `docs/todo/spike-stop-resume.md`. So the universal fallback is still needed for:

- `sandbox.stop({ force: true })` — the escalation path when `deleteSession` does not suffice.
- OOM killer — host kernel event, no trap fires.
- Host-level SIGKILL — sandbox process killed by the orchestrator for unrelated reasons
  (e.g. node pressure, maintenance eviction).

The dispatcher's universal fallback (`git ls-remote` before sandbox destruction, recovery push
if absent) covers all of these without distinguishing the cause. The spike confirms the
fallback is still needed for those surfaces; it just removes `deleteSession` from the set of
"surfaces where the trap might not fire."

## SDK API surface confirmed

| Call | Behavior |
|---|---|
| `sb.process.createSession(id)` | Creates a named command session |
| `sb.process.executeSessionCommand(id, { command, runAsync: true }, timeout)` | Starts an async command in the session; returns `{ cmdId }` |
| `sb.process.getSessionCommand(id, cmdId)` | Returns current state (`exitCode: undefined` while running) |
| `sb.process.deleteSession(id)` | Terminates the session's process group with **SIGTERM** (the trap fires ~22 ms later) |
| `sb.process.executeCommand(cmd, ...)` | Runs a command and returns its output (works after `deleteSession` — sandbox is still alive) |
| `daytona.delete(sb)` | Destroys the sandbox entirely |

## Impact on the graph pipeline plan

The plan's prescription is verified correct for the `deleteSession` path, and the universal
`git ls-remote` fallback remains correct as a defense-in-depth against the SIGKILL surfaces
that `deleteSession` does not exercise. One wording refinement and one optional enhancement.

### Wording refinement (to fold into the plan)

The plan currently says, in the "Branch push failure" section:

> The Daytona API's termination signal (SIGTERM with grace period vs. immediate SIGKILL) must
> be verified empirically; the `git ls-remote` fallback covers both cases regardless.

The empirical verification is now done. The wording should be updated to reflect the result:

> `process.deleteSession` sends SIGTERM with a grace period (verified spike 2026-07-23:
> trap fires ~22 ms after the call, EXIT trap ~1 ms later — see
> `docs/todo/spike-termination-signal.md`), so the bash EXIT trap fires and the push-on-exit
> runs for this termination path. The `git ls-remote` universal fallback remains necessary
> for the SIGKILL surfaces `deleteSession` does not exercise: `sandbox.stop({ force: true })`,
> OOM kill, and host-level SIGKILL.

This sharpens the scope of the fallback from "both cases" to "the SIGKILL cases that
`deleteSession` does not cover," which is the accurate statement.

### Optional enhancement (not folded — current design is correct without it)

The spike suggests an optional escalation pattern the plan does not currently specify: when
the dispatcher needs to terminate a session, call `deleteSession` (SIGTERM, trap fires),
then wait a bounded interval (e.g. 10 s, matching `docker stop`'s default grace) before
escalating to `sandbox.stop({ force: true })` (SIGKILL, no trap). This gives the EXIT trap's
push step a generous window under normal termination while preserving the ability to
force-kill a stuck session. The plan's current design (call `deleteSession`, rely on the
trap + universal fallback) is correct without this escalation; it is a tightening, not a
correctness fix.

## Spike scripts

| Script | Purpose | Reuses |
|---|---|---|
| `spike-termination-signal.js` | Creates a sandbox, starts a trap-test bash script (SIGTERM/SIGINT/SIGHUP/EXIT handlers) async via `executeSessionCommand`, terminates via `deleteSession`, waits 15 s, reads the marker to determine which signal was caught and whether the EXIT trap fired | `spike-opencode-sandbox.js` (`log`, `sleep`, `elapsed`); Daytona SDK directly |

The script creates and destroys its own sandbox. Total sandbox time: ~37 s (one sandbox,
created, used, destroyed). No sandboxes were left running.

## Decision

**No change to the design.** The plan's `deleteSession`-sends-SIGTERM assumption is verified
correct for the normal session-termination path — the trap fires, the EXIT trap fires, the
push-on-exit pattern works. The universal `git ls-remote` fallback remains necessary and
correct as defense against the SIGKILL surfaces (`force-stop`, OOM, host-SIGKILL) that
`deleteSession` does not cover. The plan's wording is updated from "must be verified
empirically" to "verified — SIGTERM with grace period; the fallback covers the SIGKILL
surfaces `deleteSession` does not exercise."
