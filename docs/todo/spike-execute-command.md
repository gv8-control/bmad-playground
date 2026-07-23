# Spike: n8n Execute Command — blocking for minutes + child death on restart

**Date:** 2026-07-22
**Status:** Complete — assumption #5 PARTIALLY VERIFIED (blocking: PASS; child death: FAIL)
**Verifies:** Assumption #5 from `docs/todo/graph-pipeline.md` "Admitted assumptions" section

## Goal

Verify two claims from assumption #5:

1. n8n's Execute Command node can block for minutes without timing out.
2. The child process dies when n8n restarts — the basis for the process-vanished recovery path.

## The assumption from the plan

> Both the planning-host and merge-queue workflows use Execute Command to run a wrapper that
> blocks for the run's duration (minutes). This assumes n8n does not kill long-running Execute
> Command nodes. The process-vanished recovery path assumes "a local planning run dies when n8n
> restarts, since the run is a child of its host workflow's Execute Command" — this is the
> basis for the recovery design. If the child does not die (orphaned and holding the lock), the
> pass thinks the planner is still running and never relaunches — the pipeline stalls silently.
> Conversely, if Execute Command's child survives n8n restart, the planning lock stays held.

## Why the REST API approach was abandoned

The initial plan was to create an n8n workflow with an Execute Command node and execute it via
the internal REST API (`/rest/workflows/:id/run`). This did not work: the Execute Command node
is disabled by default in n8n v2+ (`nodes.config.js`: `exclude: ['n8n-nodes-base.executeCommand', ...]`),
and even with `NODES_EXCLUDE=[]` to override the exclude list, the internal REST execution path
does not actually run the Execute Command node — it completes instantly (8–15ms) with status
"success" but produces no output, writes no files, and introduces no delay. Multiple payload
variations were tried (`startData`, `destinationNode`, `triggerToStartFrom`, `executeOnce`,
`executionOrder`) — none caused the node to execute.

Instead, this spike tests the **underlying mechanism directly**: `child_process.exec()`, which
is the exact call the Execute Command node's source code makes. This is faithful to the real
behavior because the Execute Command node is a thin wrapper around `child_process.exec()`.

## Source code analysis (n8n v2.26.8)

| Aspect | Finding |
|--------|---------|
| Execute Command implementation | `child_process.exec(command, { cwd: process.cwd() }, callback)` |
| Timeout option | Not passed — defaults to `0` (no timeout, blocks indefinitely) |
| maxBuffer default | 1MB (1024×1024) — stdout exceeding this throws "stdout maxBuffer length exceeded" |
| killSignal default | `SIGTERM` |
| Shutdown behavior | `ActiveExecutions.shutdown(cancelAll=false)` — does NOT cancel running executions |
| Graceful shutdown timeout | 30s — n8n force-exits after 30s if shutdown stalls |
| Child process cleanup | No explicit kill of child processes on shutdown — `child_process.exec()` does not register a cleanup handler |
| SIGTERM handler | `base-command.js`: `process.once("SIGTERM", onTerminationSignal("SIGTERM"))` → `shutdownService.shutdown()` → `stopProcess()` |
| stopProcess | `start.js stopProcess()` calls `ActiveExecutions.shutdown()` (without cancelAll), then exits |

Key files examined:
- `n8n-nodes-base/dist/nodes/ExecuteCommand/ExecuteCommand.node.js`
- `n8n/dist/active-executions.js`
- `n8n/dist/commands/base-command.js`
- `n8n/dist/commands/start.js`
- `@n8n/config/dist/configs/nodes.config.js`

## What was tested

### Phase 1: blocking for minutes

Replicated the Execute Command node's exact mechanism — `child_process.exec(command, { cwd },
callback)` with no timeout option — and verified it blocks for the full duration of a 30s sleep
without timing out.

### Phase 2: child process fate on parent SIGTERM

Spawned a "parent" Node.js process that itself spawns a child via `exec()` (simulating n8n's
Execute Command node). The child writes marker files: "started" immediately, "survived" after
completing its sleep, "killed" if it catches a signal. After 5s, killed the parent with SIGTERM
(the signal pm2 sends on restart). Monitored the child process every second for 25s to observe
whether it survived, was reparented, or died.

## Results

### Phase 1: child_process.exec blocks indefinitely — PASS

- `exec('sleep 30 && echo PHASE1_DONE', { cwd: process.cwd() }, callback)` blocked for the
  full 30.0s.
- stdout: `PHASE1_DONE`, stderr: empty, exit code: 0.
- No timeout was applied — the default `timeout=0` means "no timeout."
- The Execute Command node will block for minutes (or hours) without timing out, as long as
  stdout stays under the 1MB maxBuffer.

### Phase 2: child process SURVIVES parent SIGTERM — FAIL (assumption disproved)

- Parent (PID 3818435) spawned child (PID 3818442) via `exec()`.
- Child was a direct child of the parent (same process group: PGID 3817814).
- Sent SIGTERM to parent. Parent died 0.5s later.
- **Child survived.** At t=1s after parent kill: child alive, reparented to init (PID 1),
  no signal received.
- Child continued running for the full 20s sleep duration.
- Child wrote "survived" marker and exited normally at ~14s after parent kill.
- No "killed" marker — the child never received a signal.

**The child process does NOT die when the parent receives SIGTERM.** It gets orphaned,
reparented to init (PID 1), and continues running to completion. This is standard Unix
behavior: when a parent process exits, its children are reparented to init, not killed.

## Findings

### F1: Execute Command blocks indefinitely — no timeout

**Impact: None (confirms the plan's assumption)** — the Execute Command node's
`child_process.exec()` call passes no `timeout` option, so it defaults to `0` (no timeout).
The node will block for minutes, hours, or indefinitely. The plan's hosting pattern (Execute
Command runs a wrapper that blocks for the run's duration) works as expected.

**Caveat:** the 1MB `maxBuffer` default means stdout exceeding 1MB will throw
"stdout maxBuffer length exceeded" and kill the child. The wrapper script must either
suppress stdout or the workflow must configure a larger `maxBuffer`. The Execute Command node
exposes no UI for `maxBuffer`, so the wrapper should redirect heavy output to a file.

### F2: Child process SURVIVES n8n restart — assumption disproved

**Impact: High** — the process-vanished recovery path is broken as designed.

The plan assumes "a local planning run dies when n8n restarts, since the run is a child of
its host workflow's Execute Command." This is false. When n8n receives SIGTERM (from
`pm2 restart n8n`), the following happens:

1. n8n catches SIGTERM via `base-command.js`.
2. `shutdownService.shutdown()` → `stopProcess()` → `ActiveExecutions.shutdown(cancelAll=false)`.
3. `ActiveExecutions.shutdown()` does NOT cancel running executions — it waits for them.
4. n8n exits (via `process.exit()` or the 30s force-exit timer).
5. The child process spawned by `child_process.exec()` is NOT killed — no cleanup handler
   is registered.
6. The child is reparented to init (PID 1) and continues running.

The child process (wrapper script + planning run) continues running as an orphan. The
planning lock stays held. The pipeline's process-vanished recovery path — which relies on
n8n restart killing the child — will not trigger. The pipeline stalls silently, exactly the
failure mode the plan warned about.

**Note on pm2:** pm2 sends SIGTERM to the n8n process PID, not the process group. If pm2
were configured to kill the process group (`kill -- -PGID`), the child would also receive the
signal. But the default pm2 behavior is PID-only SIGTERM, and the child survives.

### F3: n8n's 30s graceful shutdown timeout does not help

**Impact: Medium** — even if n8n's shutdown stalls because `ActiveExecutions.shutdown()` is
waiting for the running execution to finish, the 30s force-exit timer kicks in and n8n exits.
But the child process is still not killed — `process.exit()` does not send signals to child
processes. The child is orphaned and continues running.

## Implication for the pipeline design

The process-vanished recovery path cannot rely on n8n restart killing the child process.
The design needs an alternative mechanism to detect and clean up orphaned processes. Options:

1. **Parent-alive check in the wrapper:** the wrapper script periodically checks if its
   parent process (n8n) is still alive (e.g., `kill -0 $PPID`). If the parent is gone, the
   wrapper exits, releasing the lock. This is the simplest fix — a few lines in the wrapper
   script.

2. **Lock file with PID + heartbeat:** the wrapper writes its PID to the lock file and
   updates a heartbeat timestamp periodically. The recovery path checks if the PID is still
   alive and the heartbeat is recent. If the process is dead or the heartbeat is stale, the
   lock is considered released. This is more robust but more complex.

3. **Process group kill on n8n shutdown:** modify n8n's shutdown to kill the process group
   of each running Execute Command child. This is invasive (modifying n8n internals) and
   not recommended.

Option 1 (parent-alive check) is the recommended fix — it's a small change to the wrapper
script and directly addresses the root cause.

## Recommendation

1. **Execute Command blocking is confirmed** — no design change needed for the blocking
   behavior. The wrapper script should redirect heavy stdout to a file to avoid the 1MB
   maxBuffer limit.
2. **The process-vanished recovery path must be redesigned** — it cannot rely on n8n restart
   killing the child. Add a parent-alive check to the wrapper script: if the parent process
   (n8n) is gone, the wrapper exits and releases the lock.
3. **Update assumption #5 in `graph-pipeline.md`** to reflect the finding: blocking is
   verified, child death on restart is disproved.
