# Spike: sandbox stop/start disk persistence + opencode session resume

**Date:** 2026-07-22
**Status:** Complete — assumption #2 VERIFIED
**Verifies:** Assumption #2 from `docs/todo/graph-pipeline.md` "Admitted assumptions" section
**Harness:** Reuses `docs/todo/spike-opencode-sandbox.js` (OpencodeSandbox, SpikeRunner)
**Script:** `docs/todo/spike-stop-resume.js`

## TL;DR

Assumption #2 passes. A Daytona container sandbox's filesystem survives a
`stop()` → `start()` cycle, and an opencode session started before the stop is
resumable with full context after the restart via `opencode run --session <id>`.

The spike established a secret word ("BANANA_42") in an opencode session, stopped
the sandbox, waited 60 seconds, restarted the sandbox, and resumed the session —
the resumed session correctly recalled the secret word. Park/resume as designed
in the graph pipeline plan is viable.

## What was tested

The assumption from the plan:

> Park/resume depends on: stop sandbox → disk survives → start sandbox →
> `opencode run --session <id>` resumes. The plan asserts disk and opencode
> storage survive a Daytona stop, but the restart-and-resume path is the
> critical chain and is not verified.

The spike script (`spike-stop-resume.js`) runs an 11-step sequence:

1. Create a container sandbox (default snapshot), install opencode.
2. Run `opencode run` with a prompt establishing a memorable secret word.
3. Capture the auto-generated session ID via `opencode session list --format json`.
4. Verify the opencode storage directory exists on disk (before stop).
5. Stop the sandbox (`sandbox.stop()`).
6. Verify state is "stopped".
7. Wait 60 seconds (simulates a parked question waiting for a human answer).
8. Start the sandbox (`sandbox.start()`).
9. Verify the opencode storage directory still exists (after start).
10. Run `opencode run --session <id>` asking it to recall the secret word.
11. Verify the session still appears in `opencode session list`.

**All 11 steps passed, zero errors.** Total runtime: ~110 seconds.

## Results

### Disk persistence across stop/start — PASS

| Check | Before stop | After start | Verdict |
|---|---|---|---|
| `~/.local/share/opencode/` directory | exists | exists, identical listing | PASS |
| `~/.local/share/opencode/storage/` | exists | exists, identical | PASS |
| Directory timestamps | `Jul 22 11:22` | `Jul 22 11:22` (unchanged) | PASS — disk was not touched during stop |

The Daytona docs confirm this is by design: container sandboxes preserve the
filesystem through stop/start — "it stays on the runner and counts against disk
quota while stopped" (see
[Daytona Persistence docs](https://www.daytona.io/docs/persistence)). Memory is
cleared on stop, but the opencode storage is on disk, not in memory.

### Session resume after restart — PASS

The resumed session (`ses_0767029c5ffe3It1xGdRkber2d`) correctly recalled the
secret word established before the stop:

**Initial prompt (before stop):**
> Remember this secret word for later: BANANA_42. Now print exactly: SESSION_STARTED

**Initial output:** `SESSION_STARTED` (exit 0, 15.3s)

**Resume prompt (after restart):**
> What was the secret word I asked you to remember at the start of this session?
> Print only the word, nothing else.

**Resume output:**
> I don't have the ability to remember information between conversations.
> However, I can see in this conversation that you mentioned "BANANA_42" in
> your first message.

The session resumed with full conversation context — the prior turn was
readable from the on-disk storage that survived the stop/start cycle. Exit 0,
18.5s.

### Session list persistence — PASS

After the resume, `opencode session list --format json` still showed the
original session ID (`ses_0767029c5ffe3It1xGdRkber2d`), now with an updated
`updated` timestamp reflecting the resume turn. The session was not lost or
corrupted by the stop/start cycle.

## Findings

### F1: opencode v1.1.35 in sandboxes uses `storage/` directory, not SQLite

**Impact: Low** — confirms the plan's existing reference; corrects a research
sub-agent finding that applied to the devcontainer, not the sandbox.

The sandbox installs opencode v1.1.35 via `npm install -g opencode-ai@latest`
(the same version spike-opencode-sandbox.md F3 reported). This version stores
session data as files under `~/.local/share/opencode/storage/`, not in a
SQLite database. The plan's references to "JSON files in
`~/.local/share/opencode/storage/`" (graph-pipeline.md lines 402, 464) are
correct for the sandbox environment.

A research sub-agent found that the **devcontainer** runs opencode v1.17.20,
which uses a SQLite DB at `~/.local/share/opencode/opencode.db`. This version
skew between devcontainer and sandbox is noted but does not affect this spike's
conclusion — the sandbox is the environment where park/resume operates, and
v1.1.35's file-based storage persists correctly across stop/start.

**Directory listing (identical before stop and after start):**
```
~/.local/share/opencode/
├── bin/
├── log/
└── storage/    ← session data lives here
```

### F2: opencode session IDs are auto-generated, not user-specifiable

**Impact: Medium** — the pipeline's dispatcher must capture the session ID after
the first `opencode run`, not pre-assign one.

Session IDs follow the format `ses_<26 alphanumeric chars>` (e.g.,
`ses_0767029c5ffe3It1xGdRkber2d`). They are auto-generated by opencode on
session creation. The `--session <id>` flag is **resume-only**: it loads an
existing session and fails with `Error: Session not found` if the ID does not
exist.

The pipeline must:
1. Start the initial `opencode run` (no `--session`).
2. Immediately capture the ID via `opencode session list --format json` (newest
   first).
3. Persist the ID (e.g., in the journal's claim record).
4. Pass it via `--session <id>` on all resumes.

This is a workflow constraint, not a design blocker — the capture is a single
command after the first run.

### F3: Stop/start is fast and clean

**Impact: Low** — park/resume adds minimal latency.

| Operation | Duration |
|---|---|
| `sandbox.stop()` (waits for stopped state) | 2.3s |
| `sandbox.start()` (waits for started state) | 0.8s |
| Initial `opencode run` (establishing context) | 15.3s |
| Resume `opencode run --session <id>` (recalling context) | 18.5s |

Stop and start together add ~3 seconds to the park/resume cycle — negligible
against skill runs measured in hours. The resume run is comparable in latency to
the initial run (~15-20s), confirming that session resume is a fresh process
that reads prior context from disk, not a warm-memory reattach.

### F4: The `</dev/null` stdin redirect (spike F1) composes with `--session`

**Impact: Low** — confirms the two findings compose.

The async session API runs commands in a PTY; opencode detects the TTY and
hangs waiting for interactive input after completing its task (spike F1 from
`spike-opencode-sandbox.md`). The fix is appending `</dev/null`. This spike
confirms the fix composes with `--session`: the resume command
`opencode run --model opencode/big-pickle --session <id> "prompt" </dev/null`
exited cleanly with code 0 in ~18s.

## SDK API surface confirmed

The stop/start methods the pipeline plan depends on:

| Method | Signature | Notes |
|--------|-----------|-------|
| `sandbox.stop(timeout?, force?)` | Returns `Promise<void>`, waits for stopped state | 2.3s in this spike; `force=true` uses SIGKILL |
| `sandbox.start(timeout?)` | Returns `Promise<void>`, waits for started state | 0.8s in this spike |
| `sandbox.refreshData()` | Refreshes sandbox DTO from API | Needed to read `state` after stop/start |
| `sandbox.state` | `SandboxState` enum | `"started"`, `"stopped"`, `"error"`, etc. |

## Online sources

### Daytona filesystem persistence (primary guarantee)

**Source:** https://www.daytona.io/docs/persistence

Key quotes verifying the disk-persistence guarantee:

> Stopping a sandbox does not destroy it: the sandbox keeps its identity, its
> filesystem, and its configuration, and can be started again at any point with
> all files, installed packages, and repositories intact.

> **Container:** Filesystem is preserved through **stop / start**: it stays on
> the runner and counts against disk quota while stopped.

> **Memory:** Memory persists only while the sandbox is running... Pause is not
> supported [for containers].

This directly confirms: (a) container sandbox stop preserves the filesystem,
(b) memory is cleared but opencode storage is on disk so it survives, (c) the
sandbox is the same instance after start (same identity, same files).

### Daytona sandbox lifecycle (stop/start semantics)

**Source:** https://www.daytona.io/docs/sandboxes

Key quotes:

> For container sandboxes, stopping terminates the running container. The
> filesystem is preserved, but memory state is not. Container sandboxes do not
> support pause; stop is the way to shut down a container sandbox when it is not
> in use.

> The sandbox moves to the **stopped** state when shutdown completes. While a
> stop is in progress, the sandbox is in the **stopping** state and does not
> accept new requests.

This confirms the state transitions the spike observed: `started` →
(stop) → `stopped` → (start) → `started`.

### Daytona auto-archive and auto-delete (retention risk for long parks)

**Source:** https://www.daytona.io/docs/persistence#retention-and-lifecycle

> **Auto-archive** (container sandboxes): **7 days** stopped (30 days max) —
> moves the filesystem to object storage.
>
> **Auto-delete** (all sandboxes): Disabled by default — deletes the sandbox
> after it has been stopped.

A parked sandbox is at risk only if it stays stopped longer than the
auto-archive interval (7 days by default). Archive moves the filesystem to
object storage; starting an archived sandbox restores it, so even an archived
park would recover. Auto-delete is disabled by default and would need to be
explicitly set. The pipeline's park/resume use case (hours, not days) is well
within the safe window.

### opencode CLI session resume

**Source:** https://opencode.ai/docs/cli/#run-1

> `--session` `-s` Session ID to **continue**.

> `--continue` `-c` Continue the most recent session.

> `--fork` Fork the session instead of continuing it.

This confirms `--session` resumes (continues) an existing session, appending
new turns to the conversation — exactly what the spike verified empirically.

### opencode Zen free models

**Source:** https://opencode.ai/docs/zen/#pricing

The spike used `opencode/big-pickle` (free, 200K context, zero cost for
input/output/cache). This is the same model the original
`spike-opencode-sandbox.md` validated. The free model is sufficient for
mechanics testing; the pipeline will use neuralwatt (via a Railway relay) or
another provider for production agent runs.

## Impact on the graph pipeline plan

Assumption #2 is verified. The park/resume design as described in the plan is
viable:

- **Stop sandbox → disk survives → start sandbox → `opencode run --session <id>`
  resumes** — all four links in the chain work.
- The opencode storage directory (`~/.local/share/opencode/storage/` in v1.1.35)
  persists across stop/start with identical contents.
- Session resume recalls prior context correctly.
- Stop/start adds ~3 seconds of overhead — negligible against skill run durations.

### Workflow constraint to fold into the dispatcher

The dispatcher must capture the auto-generated session ID after the first
`opencode run` (via `opencode session list --format json`) and persist it in
the journal's claim record, because session IDs are not user-specifiable. This
is a one-command capture, not a design change. See finding F2.

### No changes needed to the park/resume design

The plan's park/resume flow (Supervision → Question surfacing) describes:
> QUESTION journals the node `parked`, stops the sandbox, and triggers the
> small n8n question-form workflow.

And the resume:
> A resume finishes claimed work, and submitting the form during a pause is a
> deliberate human act, so it proceeds.

This spike confirms the mechanism works: stop the sandbox when parked, start it
when the human answers, resume the opencode session with the answer as a new
prompt via `--session <id> "answer text"`.

## Spike script

| Script | Purpose | Reuses |
|---|---|---|
| `spike-stop-resume.js` | Full stop/start/resume chain: create, run, stop, wait, start, resume, verify recall | `spike-opencode-sandbox.js` (OpencodeSandbox, SpikeRunner) |

The script creates and destroys its own sandbox. Total sandbox time: ~110
seconds. No sandboxes were left running.

## Recommendation

1. **Park/resume is viable as designed.** No design changes needed — the
   stop/start/resume chain works end-to-end.
2. **Fold the session-ID capture into the dispatcher's claim recipe.** After the
   initial `opencode run`, the dispatcher runs `opencode session list --format
   json` and stores the ID in the journal. This is a one-command addition to
   the in-sandbox command template, not a new mechanism.
3. **Set `autoStopInterval` to 0 (or a large value) on parked sandboxes.** The
   default 15-minute auto-stop could stop a sandbox that is intentionally
   running a long skill. For parked sandboxes, the stop is deliberate (the pass
   stops it when parking a QUESTION), so auto-stop is not the concern — but
   running sandboxes should disable it. This is already implied by the plan's
   per-claim recipe.
