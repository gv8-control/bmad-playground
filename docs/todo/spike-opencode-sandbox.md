# Spike: opencode in Daytona sandbox

**Date:** 2026-07-22
**Status:** Complete
**Verifies assumptions from:** `docs/todo/graph-pipeline.md`

## Goal

Verify that opencode can run inside a Daytona sandbox and that the dispatcher
can retrieve structured results (stdout) and command logs via the Daytona SDK
session API.

## What was tested

Three functional assumptions from the graph pipeline plan:

1. `opencode run` executes to completion inside a Daytona sandbox.
2. Session command logs (stdout) are retrievable via `getSessionCommandLogs`.
3. The async session API (`executeSessionCommand` with `runAsync: true`) can
   start opencode and poll for completion via `getSessionCommand`.

## Results

All three assumptions pass, with two findings that affect the pipeline design.

### 1. opencode runs and exits cleanly — PASS

- `opencode-ai@latest` (v1.1.35) installs via `npm install -g` in ~8s.
- `opencode run --model opencode/big-pickle "Print exactly: SPIKE_OK"` exits
  with code 0 in ~10s. (Historical spike test command; production agent runs
  use `--format json`.)
- Output is captured on stdout as expected.

### 2. Session command logs are retrievable — PASS

- `getSessionCommandLogs(sessionId, commandId)` returns a snapshot with
  `output` (combined), `stdout`, and `stderr` fields.
- The streaming overload
  `getSessionCommandLogs(sessionId, commandId, onStdout, onStderr)` streams
  chunks via callbacks until the process exits. This is the pattern the
  existing `sandbox.service.ts` uses (`streamAgentLogs`).

### 3. Async session API works — PASS (with caveat)

- `createSession` + `executeSessionCommand(runAsync: true)` starts the process
  and returns a `cmdId`.
- `getSessionCommand(sessionId, cmdId)` polls and returns `exitCode` once the
  process exits.

## Findings

### F1: Async session commands need `</dev/null` or opencode hangs

**Impact: High** — the pipeline's in-sandbox command runner must redirect stdin.

`executeSessionCommand` with `runAsync: true` runs the command in a PTY.
opencode detects the TTY and stays alive waiting for interactive input after
completing its task. The process never exits, and `getSessionCommand` never
returns an `exitCode`.

**Fix:** Append `</dev/null` to the command. With stdin closed, opencode
exits cleanly after completing its task (verified: 9s, exit 0).

Without this, the pipeline's poll-for-completion loop would time out on every
opencode run.

### F2: neuralwatt API is unreachable from Daytona sandboxes

**Impact: High** — the pipeline cannot use the neuralwatt provider from
sandboxes without a network workaround.

`api.neuralwatt.com` resolves correctly (Cloudflare IPs: 104.26.x.x,
172.67.x.x) and the TCP connection succeeds, but the TLS handshake is reset
by the peer (`write:errno=104`, "Connection reset by peer"). This affects
all TLS clients (curl, wget, openssl s_client, node fetch).

Other Cloudflare-fronted sites (`httpbin.org`) exhibit the same failure.
Non-Cloudflare HTTPS sites (`api.anthropic.com`, `api.openai.com`,
`cloudflare.com` itself, `models.dev`, `registry.npmjs.org`) work fine.

**Root cause:** Likely Cloudflare bot protection blocking the Daytona sandbox
egress IP range. Not a Daytona network restriction — the sandbox has open
egress.

**Workarounds (not tested):**
- Use a non-Cloudflare provider (Anthropic, OpenAI) from sandboxes.
- Proxy neuralwatt API through a non-Cloudflare relay.
- Ask neuralwatt to allowlist the Daytona egress IPs.

The spike used `opencode/big-pickle` (opencode's free hosted model) to
verify mechanics. The pipeline will need a decision on which provider to
use from sandboxes.

### F3: opencode v1.1.35 has no `OPENCODE_DB` env var

**Impact: Low** — the pipeline plan references `OPENCODE_DB` but opencode
v1.1.35 stores data as JSON files in `~/.local/share/opencode/storage/`,
not a SQLite database. The `opencode db` subcommand exists in newer versions
but not in v1.1.35 (the version installed by `npm install -g opencode-ai@latest`
in the sandbox).

The pipeline doesn't need the database file — the agent run uses
`--format json`, so the dispatcher parses JSON events from stdout for
classification; `opencode export [sessionID]` provides structured session
data (messages, tool calls) beyond what the event stream carries.

## SDK API surface confirmed

All methods the pipeline plan depends on exist and work:

| Method | Signature | Notes |
|--------|-----------|-------|
| `daytona.create({labels, envVars})` | Returns `Sandbox` | ~0.3–0.5s |
| `sandbox.process.executeCommand(cmd, cwd, env, timeout)` | Returns `{result, exitCode}` | Sync, blocks until exit |
| `sandbox.process.createSession(sessionId)` | Returns void | |
| `sandbox.process.executeSessionCommand(sessionId, {command, runAsync}, timeout)` | Returns `{cmdId}` | Async when `runAsync: true` |
| `sandbox.process.getSessionCommand(sessionId, cmdId)` | Returns `{exitCode}` | Poll for completion |
| `sandbox.process.getSessionCommandLogs(sessionId, cmdId)` | Returns `{output, stdout, stderr}` | Snapshot overload |
| `sandbox.process.getSessionCommandLogs(sessionId, cmdId, onStdout, onStderr)` | Streams via callbacks | Blocks until process exits |
| `sandbox.fs.downloadFile(path)` | Returns `Buffer` | Works for any file |
| `sandbox.fs.uploadFile(localPath, remotePath, timeout)` | Uploads binary | |
| `sandbox.git.clone(url, subdir, ..., user, token)` | Clones with auth | |
| `sandbox.getWorkDir()` | Returns `/home/daytona` | |
| `daytona.delete(sandbox)` | Destroys sandbox | |

## Recommendation

1. **In-sandbox command runner must append `</dev/null`** to opencode commands
   started via the async session API. Without this, every run hangs.
2. **Resolve the neuralwatt connectivity issue** before building the
   pipeline, or pick an alternative provider for sandbox runs.
3. **Drop the `OPENCODE_DB` assumption** from the pipeline plan — stdout
   retrieval via `getSessionCommandLogs` is the correct path.
