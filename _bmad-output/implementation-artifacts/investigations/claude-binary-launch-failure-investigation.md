# Investigation: Claude Code native binary fails to launch during Tier 3 E2E tests

## Hand-off Brief

1. **What happened.** The Claude Code native binary fails to launch because `AgentService.runTurn()` passes `cwd: process.env.AGENT_WORKDIR ?? '/workspace'` to the SDK `query()` call, but `AGENT_WORKDIR` is never set and `/workspace` does not exist on any runtime environment (dev codespace, CI runner). `child_process.spawn` emits `ENOENT` for the missing `cwd`; the SDK's error handler sees `existsSync(binaryPath) === true` + `ENOENT` and produces the misleading message "exists but failed to launch."

2. **Where the case stands.** Root cause is Confirmed with High confidence. The binary itself is healthy (executes `--version` successfully), shared libraries resolve, permissions are correct. The failure is purely the non-existent `cwd` directory.

3. **What's needed next.** Set `AGENT_WORKDIR` to an existing directory (or change the fallback from `/workspace` to `process.cwd()` or `/tmp`), then re-run the Tier 3 test. One-line code fix in `agent.service.ts:93`.

## Case Info

| Field            | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Ticket           | N/A                                                                   |
| Date opened      | 2026-07-11                                                            |
| Status           | Concluded                                                             |
| System           | Linux x86-64 (dev codespace + GitHub Actions Ubuntu runner)           |
| Evidence sources | SDK source (`sdk.mjs`), `agent.service.ts`, env files, CI workflow, runtime binary inspection, reproduction tests |

## Problem Statement

The binary at `node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude` exists on disk but AgentService logs "Claude Code native binary at ... exists but failed to launch." during real-service Tier 3 E2E tests. The sandbox provisions successfully (Daytona clone, git config, SESSION_READY), but the agent run fails immediately when trying to start the Claude Code process. The error originates in AgentService. Only affects the real-service tier — PR-tier tests use fakes and pass.

## Evidence Inventory

| Source              | Status    | Notes                                                                              |
| ------------------- | --------- | ---------------------------------------------------------------------------------- |
| SDK source (sdk.mjs) | Available | Minified; error message + launch logic traced via grep                             |
| agent.service.ts    | Available | Full file read (592 lines); `query()` call at line 90                              |
| Env files           | Available | `.env`, `.env.test`, `.env.example`, `.env.local` — none set `AGENT_WORKDIR`      |
| CI workflow         | Available | `.github/workflows/test.yml` — no `AGENT_WORKDIR` in env or secrets                |
| Binary on disk      | Available | `-rwxr-xr-x`, ELF 64-bit, 250MB, all shared libraries resolve via `ldd`           |
| Runtime tests       | Available | 3 controlled spawn tests confirming root cause                                     |
| env.validation.ts   | Available | Zod schema validates 4 keys; `AGENT_WORKDIR` and `ANTHROPIC_API_KEY` not in schema |

## Investigation Backlog

| # | Path to Explore                                      | Priority | Status | Notes                                              |
| - | ---------------------------------------------------- | -------- | ------ | -------------------------------------------------- |
| 1 | Trace error message origin in SDK source             | High     | Done   | Found in `sdk.mjs` function `xB`                   |
| 2 | Identify `hB`, `rE` helper functions                 | High     | Done   | `hB` = `existsSync`, `rE` = error code check       |
| 3 | Verify binary executability and shared libraries    | High     | Done   | `file` + `ldd` — binary is healthy                 |
| 4 | Test spawn with non-existent cwd                    | High     | Done   | Reproduced ENOENT with cwd=/workspace              |
| 5 | Rule out `env` option as contributing factor         | Medium   | Done   | Minimal env works fine with existing cwd           |
| 6 | Check if `AGENT_WORKDIR` is set anywhere             | High     | Done   | Not in any .env file, not in CI workflow            |
| 7 | Check if `/workspace` exists on runtime environments | High     | Done   | Does not exist on dev codespace; CI runner wouldn't have it either |

## Timeline of Events

| Time | Event                                                                  | Source                  | Confidence |
| ---- | ---------------------------------------------------------------------- | ----------------------- | ---------- |
| N/A  | `agent-be:serve` boots with production AppModule (no SandboxServiceFake) | playwright.config.ts:113 | Confirmed  |
| N/A  | Test creates conversation; Daytona sandbox provisions successfully     | User report             | Confirmed  |
| N/A  | Test sends message; `AgentService.runTurn()` calls `query()`          | agent.service.ts:90     | Confirmed  |
| N/A  | SDK resolves binary path via `LT()` → `existsSync` returns true        | sdk.mjs (LT function)  | Confirmed  |
| N/A  | SDK calls `spawn(binaryPath, args, {cwd: '/workspace', env: {ANTHROPIC_API_KEY}})` | sdk.mjs (initialize) | Confirmed  |
| N/A  | `spawn` emits `error` event with code `ENOENT` (cwd doesn't exist)    | Node.js child_process   | Confirmed  |
| N/A  | SDK error handler: `rE(ENOENT)` → true, `existsSync(path)` → true     | sdk.mjs (process.on error handler) | Confirmed |
| N/A  | SDK sets `exitError = ReferenceError("...exists but failed to launch.") | sdk.mjs (xB function) | Confirmed  |
| N/A  | `readMessages()` throws `exitError`                                    | sdk.mjs (readMessages)  | Confirmed  |
| N/A  | `AgentService` catch block logs "Agent run failed for conversation..." | agent.service.ts:205-208 | Confirmed |

## Confirmed Findings

### Finding 1: The error message originates in the SDK, not AgentService

**Evidence:** `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs` — function `xB(e, t)`:
```javascript
function xB(e,t){
  if(hB(e))  // hB = existsSync
    return t ? `Claude Code native binary at ${e} exists but failed to launch.`
             : `Claude Code executable at ${e} exists but failed to launch.`;
  return t ? `Claude Code native binary not found at ${e}...`
           : `Claude Code executable not found at ${e}...`
}
```

**Detail:** `AgentService` does not contain this string. The SDK's `process.on("error")` handler calls `xB` when `rE(error)` is true (error code is ENOENT/EACCES/EPERM/ENOTDIR/ELOOP/EROFS). The `AgentService` catch block at `agent.service.ts:205-208` wraps it as `Agent run failed for conversation ${conversationId}: ${errorMessage}`.

### Finding 2: `hB` = `existsSync`, `rE` checks for spawn error codes

**Evidence:**
- `import{existsSync as hB}from"fs"` — in `sdk.mjs`
- `function rE(e){let t=Ge(e);return t==="ENOENT"||t==="EACCES"||t==="EPERM"||t==="ENOTDIR"||t==="ELOOP"||t==="EROFS"}` — in `sdk.mjs`

**Detail:** The error "exists but failed to launch" is produced when: (1) the spawn `error` event fires with one of those codes, AND (2) `existsSync(binaryPath)` returns `true`. This means the binary file exists on disk, but something prevented the spawn from succeeding.

### Finding 3: The binary is healthy — executable, shared libraries resolve

**Evidence:**
- `file` output: `ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2`
- `ldd` output: all 7 shared libraries resolve (`librt.so.1`, `libc.so.6`, `ld-linux-x86-64.so.2`, `libpthread.so.0`, `libdl.so.2`, `libm.so.6`, `linux-vdso.so.1`)
- Permissions: `-rwxr-xr-x` (executable by all)
- Direct execution: `claude --version` → `2.1.177 (Claude Code)` exit 0

**Detail:** The binary itself is not the problem. It exists, is executable, all shared libraries resolve, and it runs successfully when invoked directly.

### Finding 4: `AGENT_WORKDIR` is never set; `/workspace` does not exist

**Evidence:**
- `agent.service.ts:93`: `cwd: process.env.AGENT_WORKDIR ?? '/workspace'`
- `.env`, `.env.test`, `.env.example`, `.env.local` — none contain `AGENT_WORKDIR`
- `.github/workflows/test.yml` — no `AGENT_WORKDIR` in env or secrets
- `env.validation.ts` — `AGENT_WORKDIR` not in Zod schema (no boot-time validation)
- `ls /workspace` → `No such file or directory` (dev codespace)
- GitHub Actions Ubuntu runners use `/home/runner`, not `/workspace`

**Detail:** The `cwd` option passed to the SDK `query()` call always falls back to `/workspace`, which does not exist on any runtime environment.

### Finding 5: `spawn` with non-existent `cwd` produces `ENOENT` (root cause)

**Evidence:** Controlled reproduction test:
```
Test A (cwd=/workspace, non-existent): ERROR: ENOENT
Test B (cwd=/tmp, minimal env):       STDOUT: 2.1.177 (Claude Code), EXIT: 0
Test C (cwd=/tmp, full env):          STDOUT: 2.1.177 (Claude Code), EXIT: 0
```

**Detail:** `child_process.spawn` emits an `error` event with code `ENOENT` when the `cwd` option points to a non-existent directory, even though the binary path itself is valid and exists. The SDK's error handler sees `ENOENT` (via `rE`) + `existsSync(binaryPath) === true` (via `hB`) and produces the misleading message "exists but failed to launch." The `env` option (minimal vs. full) is not a contributing factor — Tests B and C both succeed with the same minimal env.

## Deduced Conclusions

### Deduction 1: The error message is misleading — it's not a binary problem

**Based on:** Findings 2, 3, 5

**Reasoning:** The SDK's error handler checks two conditions: (1) the error code is in the `rE` set (ENOENT, EACCES, etc.), and (2) `existsSync(binaryPath)` returns true. When both are true, it says "exists but failed to launch." But `ENOENT` from `spawn` can mean either the command doesn't exist OR the `cwd` doesn't exist. The SDK assumes the former (binary exists, so it must be a binary problem), but the latter is the actual cause.

**Conclusion:** The error message "exists but failed to launch" is technically accurate (the binary exists but the spawn failed) but misleading — it implies a binary problem when the actual issue is the `cwd` directory not existing.

### Deduction 2: The `env` option passing only `ANTHROPIC_API_KEY` is not a contributing factor

**Based on:** Finding 5 (Tests B and C both succeed with minimal env)

**Reasoning:** The SDK's `initialize()` method uses the provided `env` option directly: `let {..., env: c = {...process.env}, ...} = this.options`. When `env: { ANTHROPIC_API_KEY: ... }` is provided, the spawned process gets only that env var. But the native binary doesn't need `PATH`, `HOME`, or `LD_LIBRARY_PATH` to launch — it's spawned by absolute path, and shared libraries resolve via the ELF header and `/etc/ld.so.cache`. Tests B and C confirm both minimal and full env work fine with an existing `cwd`.

**Conclusion:** The `env` option is not a contributing factor to the launch failure. (Note: it may cause secondary issues later — e.g., the binary might need `HOME` for config — but it doesn't prevent launch.)

## Hypothesized Paths

### Hypothesis 1: Missing system dependencies

**Status:** Refuted

**Theory:** The binary requires shared libraries that are missing on the runtime environment.

**Supporting indicators:** The error message mentions "failed to launch," which could imply missing dependencies.

**Would confirm:** `ldd` showing unresolved libraries on the runtime environment.

**Would refute:** `ldd` showing all libraries resolve, and direct execution succeeding.

**Resolution:** Refuted by Finding 3 — all shared libraries resolve and the binary executes successfully.

### Hypothesis 2: Permission issues (binary not executable)

**Status:** Refuted

**Theory:** The binary file lacks execute permission.

**Supporting indicators:** "Failed to launch" could imply permission denied.

**Would confirm:** `ls -la` showing no execute bit.

**Would refute:** `ls -la` showing `-rwxr-xr-x`.

**Resolution:** Refuted by Finding 3 — binary has execute permission for all users.

### Hypothesis 3: SDK version mismatch

**Status:** Refuted

**Theory:** The SDK version doesn't match the binary version.

**Supporting indicators:** The binary is version 2.1.177 and the SDK is version 0.3.177 — the numbers don't obviously match.

**Would confirm:** SDK code expecting a different binary version.

**Would refute:** `package.json` showing `"claudeCodeVersion": "2.1.177"` matching the binary's `--version` output.

**Resolution:** Refuted — `package.json` line 89 shows `"claudeCodeVersion": "2.1.177"`, and the binary outputs `2.1.177 (Claude Code)`. The SDK version (0.3.177) is the npm package version, not the binary version.

### Hypothesis 4: Shared libraries not resolving

**Status:** Refuted

**Theory:** The binary is dynamically linked and some shared libraries are missing.

**Supporting indicators:** "Failed to launch" could imply missing libraries.

**Would confirm:** `ldd` showing "not found" for any library.

**Would refute:** `ldd` showing all libraries resolved.

**Resolution:** Refuted by Finding 3 — all 7 shared libraries resolve correctly.

### Hypothesis 5: Non-existent `cwd` directory (actual root cause)

**Status:** Confirmed

**Theory:** The `cwd` option passed to `query()` points to `/workspace`, which doesn't exist. `spawn` fails with `ENOENT`.

**Supporting indicators:** `AGENT_WORKDIR` is never set in any env file or CI workflow. `/workspace` doesn't exist on dev codespace. The error message matches the SDK's `xB` function output for `ENOENT` + `existsSync === true`.

**Would confirm:** Reproducing the ENOENT error with `cwd: '/workspace'` and showing it succeeds with an existing `cwd`.

**Would refute:** Finding that `/workspace` exists on the runtime environment, or that the `cwd` option is overridden elsewhere.

**Resolution:** Confirmed by Finding 5 — controlled reproduction tests show `ENOENT` with non-existent `cwd` and success with existing `cwd`.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Exact CI runner environment | Would confirm `/workspace` doesn't exist on GitHub Actions Ubuntu | Check GitHub Actions runner docs or add `ls /workspace` to CI step |
| Tier 3 test execution logs | Would show the exact error message as it appears in agent-be logs | Run the Tier 3 test and capture agent-be stdout |

## Source Code Trace

| Element       | Detail                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Error origin  | `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs` — function `xB(e, t)`, called from `process.on("error")` handler in `Dh.initialize()` |
| Trigger       | `AgentService.runTurn()` calls `query()` at `agent.service.ts:90` with `cwd: process.env.AGENT_WORKDIR ?? '/workspace'` |
| Condition     | `AGENT_WORKDIR` env var is unset → `cwd` falls back to `/workspace` → directory doesn't exist → `spawn` emits `ENOENT` → SDK error handler produces "exists but failed to launch" |
| Related files | `agent.service.ts:90-100` (query call), `env.validation.ts` (missing validation), `.env`/`.env.test` (missing AGENT_WORKDIR), `.github/workflows/test.yml` (missing AGENT_WORKDIR) |

## Conclusion

**Confidence:** High

**Root cause:** `agent.service.ts:93` passes `cwd: process.env.AGENT_WORKDIR ?? '/workspace'` to the SDK `query()` call. The `AGENT_WORKDIR` environment variable is never set in any `.env` file, the CI workflow, or the env validation schema. The fallback directory `/workspace` does not exist on the dev codespace (workspace is at `/workspaces/bmad-playground`) or on GitHub Actions Ubuntu runners (which use `/home/runner`). When `child_process.spawn` is called with a non-existent `cwd`, it emits an `ENOENT` error event. The SDK's error handler sees `ENOENT` (via `rE`) + `existsSync(binaryPath) === true` (via `hB`) and produces the misleading message "Claude Code native binary at ... exists but failed to launch." The binary itself is healthy — executable, all shared libraries resolve, and it runs successfully when spawned with a valid `cwd`.

The user's original hypotheses (missing dependencies, permission issues, SDK version mismatch, shared libraries) are all refuted. The actual cause is "something else" — a non-existent working directory.

## Recommended Next Steps

### Fix direction

**Primary fix (one line):** Change `agent.service.ts:93` from:
```typescript
cwd: process.env.AGENT_WORKDIR ?? '/workspace',
```
to:
```typescript
cwd: process.env.AGENT_WORKDIR ?? process.cwd(),
```

This makes the fallback the current working directory of the agent-be process, which always exists. The `AGENT_WORKDIR` override remains available for explicit configuration.

**Alternative:** Set `AGENT_WORKDIR` in `.env` and `.env.test` to an existing directory (e.g., `/tmp` or the repo root). This is less robust because it requires every environment to remember to set it.

**Secondary issue (not blocking, but worth addressing):** The `env` option at `agent.service.ts:95-97` passes only `ANTHROPIC_API_KEY`, which replaces the entire process environment. The spawned Claude Code process won't have `HOME`, `PATH`, `USER`, etc. This doesn't prevent launch (confirmed by reproduction tests) but may cause runtime issues inside the binary (e.g., config file resolution, session persistence). Consider spreading `process.env` and overriding the key: `env: { ...process.env, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '' }`.

**Tertiary issue:** `ANTHROPIC_API_KEY` and `AGENT_WORKDIR` are not in `env.validation.ts`. A missing `ANTHROPIC_API_KEY` silently becomes `''` at the call site, failing at first agent run rather than at boot. Consider adding both to the Zod schema with appropriate validation (required for `ANTHROPIC_API_KEY`, optional with default for `AGENT_WORKDIR`).

### Diagnostic

To confirm the fix: run `PLAYWRIGHT_REAL_SERVICE=1 yarn playwright test --grep @real-service` after applying the fix. The agent run should proceed past the binary launch and either succeed or fail with a different error (e.g., API key issues, sandbox communication).

### Verification plan

1. Apply the one-line fix (`/workspace` → `process.cwd()`)
2. Run the Tier 3 E2E test
3. Verify the error message changes from "exists but failed to launch" to either success or a different error
4. If successful, consider also addressing the `env` and `env.validation.ts` issues

## Reproduction Plan

**Setup:** Any machine with the repo installed and `@anthropic-ai/claude-agent-sdk-linux-x64` present.

**Trigger:**
```bash
node -e "
const { spawn } = require('child_process');
const { existsSync } = require('fs');
const binaryPath = './node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude';
console.log('existsSync(binary):', existsSync(binaryPath));
console.log('existsSync(/workspace):', existsSync('/workspace'));
const p = spawn(binaryPath, ['--version'], {
  cwd: '/workspace',
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ANTHROPIC_API_KEY: 'test' }
});
p.on('error', (err) => console.log('Error:', err.code, err.message));
"
```

**Expected results:**
- `existsSync(binary): true`
- `existsSync(/workspace): false`
- `Error: ENOENT spawn .../claude ENOENT`

This reproduces the exact condition that triggers the SDK's "exists but failed to launch" error message.

## Side Findings

- **SDK error message is misleading.** The `xB` function in `sdk.mjs` conflates two distinct ENOENT causes: (1) the binary doesn't exist, and (2) the `cwd` doesn't exist. When `existsSync(binaryPath)` is true, it says "exists but failed to launch" — but the actual cause may be a non-existent `cwd`, not a binary problem. This is an SDK limitation, not a bug in bmad-easy.

- **`env` option replaces the entire environment.** `agent.service.ts:95-97` passes `env: { ANTHROPIC_API_KEY: ... }`, which the SDK uses directly (not merged with `process.env`). The spawned process has no `PATH`, `HOME`, `USER`, etc. This doesn't prevent launch but may cause runtime issues inside the binary. The SDK's `initialize()` method: `let {..., env: c = {...process.env}, ...} = this.options` — when `env` is provided, it replaces the default.

- **`ANTHROPIC_API_KEY` and `AGENT_WORKDIR` are not in `env.validation.ts`.** The Zod schema validates only `DATABASE_URL`, `DAYTONA_API_URL`, `DAYTONA_API_KEY`, `AUTH_SECRET`. A missing `ANTHROPIC_API_KEY` silently becomes `''` at the call site, failing at first agent run rather than at boot. This violates the pattern established for other env vars (e.g., `CIRCUIT_BREAKER_TIMEOUT_MS` uses an inline IIFE with fallback).

- **No agent-be Dockerfile exists.** The architecture document (`architecture.md:592`) references `apps/agent-be/Dockerfile` as a planned artifact, but it hasn't been created. The root `docker-compose.yml` defines only datastores (Postgres, Redis, n8n-Postgres). During Tier 3 E2E tests, agent-be runs via `yarn nx run agent-be:serve` directly on the CI runner.

- **Architecture decision DP-2 (story 3.3) documents that the agent runs in the host Node.js process, not inside the Daytona sandbox.** This is why the `cwd` must be a local directory — the Daytona sandbox is remote, and its filesystem is not mounted locally. The `cwd` option tells the Claude Code process where to operate, but since the agent runs in the host process, it needs a local working directory.
