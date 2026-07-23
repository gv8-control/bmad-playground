// In-sandbox command template for pipeline worker agents.
//
// This module generates the bash script that runs inside a Daytona sandbox
// when a node is claimed. The script is the single most operationally
// critical piece of code in the system: it runs outside the pass's direct
// control and is responsible for 8 sequential steps, each with failure modes
// the pass can't directly observe (verified spike 2026-07-23 — see
// docs/todo/spike-in-sandbox-template.md).
//
// The template:
//   1. Starts the tunnel proxy (background)
//   2. Runs a two-tier proxy health check (HTTP listener + end-to-end tunnel)
//   3. Runs the per-claim install command with a sub-step timeout
//   4. Captures sessions_before (for the session-ID poller)
//   5. Launches a background session-ID poller (concurrent with opencode)
//   6. Runs `opencode run --format json --dir <repoPath> "<prompt>" </dev/null`
//   7. Captures opencode's exit code to a file
//   8. Pushes the branch unconditionally (EXIT trap, bounded retry,
//      error-type classification, push-failed marker)
//
// The EXIT trap fires on normal exit AND on SIGTERM (verified spike
// 2026-07-23 — see docs/todo/spike-termination-signal.md: deleteSession
// sends SIGTERM with a grace period, the trap fires ~22ms later). It does
// NOT fire on SIGKILL (OOM, force-stop) — the pass's git ls-remote
// fallback covers that case (see docs/todo/spike-in-sandbox-template.md F1).
//
// Exit-code contract (see markers.mjs):
//   0  — success (opencode ran, push succeeded)
//   1  — agent failure (opencode exited non-zero, push succeeded)
//   2  — push failed (marker written, work may be on sandbox disk)
//   10 — install failure
//   20 — proxy failure
//   66 — session-capture transient
//   67 — session-capture permanent
//
// The pass reads markers first (authoritative for infra failures), then
// exit codes (for outcome classification). If they disagree, the pass
// follows the marker for push-recovery, the exit code for classification.

import {
  PIPELINE_TMP,
  MARKER_DIR,
  SESSION_ID_PATH,
  OPENCODE_EXIT_CODE_PATH,
  OPENCODE_EVENT_STREAM_PATH,
  EXIT,
  MARKER,
} from './markers.mjs';
import { SANDBOX_REPO } from './snapshot.mjs';

/**
 * Escape a string for safe inclusion in a bash single-quoted context.
 *
 * Replaces each `'` with `'\''` (close quote, escaped quote, reopen quote).
 * This is the standard bash escaping for single-quoted strings.
 *
 * @param {string} str
 * @returns {string}
 */
function bashSingleQuoteEscape(str) {
  return String(str).replace(/'/g, "'\\''");
}

/**
 * Build the in-sandbox command template as a bash script string.
 *
 * The returned string is a complete bash script that the dispatcher passes
 * to `startAgentSession` as the `command`. The script runs inside the
 * sandbox with the tunnel proxy env vars set.
 *
 * @param {object} opts
 * @param {string} opts.runId — the pipeline run identifier
 * @param {string} opts.chainId — the chain identifier (used in branch name)
 * @param {string} opts.prompt — the prompt text for opencode
 * @param {string} [opts.installCommand] — the per-claim install command
 *   (from policy.json's perClaimInstallCommand). If null/empty, the install
 *   step is skipped.
 * @param {number} [opts.installTimeoutSec=480] — the install sub-step timeout
 *   in seconds (default 8 minutes — a fraction of the per-node deadline)
 * @param {string} [opts.repoPath=SANDBOX_REPO] — the repo path inside the
 *   sandbox (default '/workspace/repo')
 * @param {string} [opts.agent] — the opencode agent type
 *   ('planner' | 'coder' | 'reviewer'). Passed as `--agent <type>` if set.
 * @param {string} [opts.model] — the opencode model override. If set,
 *   passed as `--model <model>`.
 * @param {string} [opts.opencodeSessionId] — an existing opencode session ID
 *   to resume (for park/resume). If set, passed as `--session <id>`.
 * @returns {string} the bash script
 */
export function buildInSandboxCommand(opts) {
  if (!opts) throw new Error('buildInSandboxCommand: opts is required');
  if (!opts.runId) throw new Error('buildInSandboxCommand: runId is required');
  if (!opts.chainId) throw new Error('buildInSandboxCommand: chainId is required');
  if (!opts.prompt) throw new Error('buildInSandboxCommand: prompt is required');

  const runId = opts.runId;
  const chainId = opts.chainId;
  const prompt = bashSingleQuoteEscape(opts.prompt);
  const installCommand = opts.installCommand || '';
  const installTimeoutSec = opts.installTimeoutSec || 480;
  const repoPath = opts.repoPath || SANDBOX_REPO;
  const agent = opts.agent || '';
  const model = opts.model || '';
  const opencodeSessionId = opts.opencodeSessionId || '';
  const branch = `pipeline/${runId}/${chainId}`;

  // Build the opencode run command.
  // --format json: newline-delimited JSON events to stdout (verified
  //   spike 2026-07-22 — see spike-midstream-resume.md).
  // --dir: working directory (the repo path).
  // </dev/null: prevents the PTY hang (verified in spike-opencode-sandbox.md).
  //   executeSessionCommand with runAsync:true runs in a PTY; opencode
  //   detects the TTY and hangs waiting for interactive input unless stdin
  //   is closed.
  let ocCmd = 'opencode run --format json';
  ocCmd += ` --dir '${repoPath}'`;
  if (agent) ocCmd += ` --agent '${agent}'`;
  if (model) ocCmd += ` --model '${model}'`;
  if (opencodeSessionId) ocCmd += ` --session '${opencodeSessionId}'`;
  ocCmd += ` '${prompt}'`;
  ocCmd += ' </dev/null';

  // Build the install command with sub-step timeout.
  // GNU timeout's exit code 124 means the command timed out.
  // The install step is skipped if no installCommand is provided.
  const installCmd = installCommand
    ? `timeout ${installTimeoutSec} ${installCommand}`
    : '';

  // The script. Uses set +e (not set -e) because we need to continue
  // after opencode exits non-zero to run the push step. The EXIT trap
  // handles the unconditional push.
  return `#!/bin/bash
# ── In-sandbox command template (generated by pipeline3/lib/template.mjs) ──
# runId: ${runId}
# chainId: ${chainId}
# branch: ${branch}
#
# This script runs inside a Daytona sandbox as a session command. The pass
# starts it via executeSessionCommand({ runAsync: true }) and polls its
# state via getSessionCommand. The script's exit code is the template's
# outcome code (see markers.mjs for the contract).

set +e  # Don't exit on error — we need to push even if opencode fails.

# ─── Paths ───
PIPELINE_TMP='${PIPELINE_TMP}'
MARKER_DIR='${MARKER_DIR}'
SESSION_ID_PATH='${SESSION_ID_PATH}'
OPENCODE_EXIT_CODE_PATH='${OPENCODE_EXIT_CODE_PATH}'
EVENT_STREAM_PATH='${OPENCODE_EVENT_STREAM_PATH}'
REPO_PATH='${repoPath}'
BRANCH='${branch}'

mkdir -p "$MARKER_DIR"

# ─── State ───
OC_EXIT=0          # opencode's exit code (captured after run)
PUSH_NEEDED=0      # Set to 1 after install succeeds — the EXIT trap checks this
POLLER_PID=0       # Background session-ID poller PID
PROXY_PID=0        # Tunnel proxy PID

# ─── Helper: write a JSON marker file ───
write_marker() {
  local name="$1"
  local json="$2"
  echo "$json" > "$MARKER_DIR/$name"
}

# ─── Helper: the unconditional push (EXIT trap) ───
do_push() {
  # Only push if we got past the install step. Proxy/install failures
  # have no work to push.
  if [ "$PUSH_NEEDED" -ne 1 ]; then
    return
  fi

  # Kill the session-ID poller if still running.
  if [ "$POLLER_PID" -ne 0 ]; then
    kill "$POLLER_PID" 2>/dev/null || true
  fi

  # Stage and commit any uncommitted changes. The agent may have left
  # uncommitted work; --allow-empty ensures the commit succeeds even if
  # there's nothing to stage (the push still needs a HEAD to push).
  cd "$REPO_PATH"
  git add -A 2>/dev/null
  git diff --cached --quiet 2>/dev/null || git commit -m "pipeline: agent work for ${chainId}" --no-verify 2>/dev/null

  # Get the commit SHA for the marker.
  local commit_sha
  commit_sha=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

  # Push with bounded retry. The backoff schedule depends on the error type:
  # - auth_failure, non_fast_forward: permanent, no retry
  # - network_transient: 1s, 5s, 15s
  # - rate_limit: 30s, 60s, 120s
  # - unknown: treat as permanent (no retry)
  local attempt=0
  local max_attempts=3
  local last_error=""
  local last_exit=0
  local retry_history="[]"

  while [ $attempt -lt $max_attempts ]; do
    attempt=$((attempt + 1))
    local git_output
    git_output=$(git push origin "HEAD:$BRANCH" 2>&1)
    local push_exit=$?
    last_exit=$push_exit
    last_error="$git_output"

    if [ $push_exit -eq 0 ]; then
      # Push succeeded — exit with opencode's exit code.
      exit $OC_EXIT
    fi

    # Classify the error to decide whether to retry.
    local lower
    lower=$(echo "$git_output" | tr '[:upper:]' '[:lower:]')

    # Auth failure — permanent, no retry.
    if echo "$lower" | grep -qE 'authentication failed|could not read username|permission denied|could not read password'; then
      write_marker '${MARKER.PUSH_FAILED}' "$(node -e "
        const fs=require('fs');
        fs.writeFileSync('${MARKER_DIR}/${MARKER.PUSH_FAILED}', JSON.stringify({
          marker:'push-failed',
          at:new Date().toISOString(),
          opencodeExitCode:$OC_EXIT,
          gitError:process.argv[1],
          errorClassification:'auth_failure',
          branch:'$BRANCH',
          commitSha:'$commit_sha',
          retryHistory:[{attempt:$attempt,exitCode:$push_exit,error:'auth_failure'}]
        },null,2));
      " "$git_output" 2>/dev/null)"
      exit 2
    fi

    # Non-fast-forward — permanent, no retry.
    if echo "$lower" | grep -qE 'non-fast-forward|fetch first|rejected'; then
      write_marker '${MARKER.PUSH_FAILED}' "$(node -e "
        const fs=require('fs');
        fs.writeFileSync('${MARKER_DIR}/${MARKER.PUSH_FAILED}', JSON.stringify({
          marker:'push-failed',
          at:new Date().toISOString(),
          opencodeExitCode:$OC_EXIT,
          gitError:process.argv[1],
          errorClassification:'non_fast_forward',
          branch:'$BRANCH',
          commitSha:'$commit_sha',
          retryHistory:[{attempt:$attempt,exitCode:$push_exit,error:'non_fast_forward'}]
        },null,2));
      " "$git_output" 2>/dev/null)"
      exit 2
    fi

    # Rate limit — transient, longer backoff.
    if echo "$lower" | grep -qE 'rate limit|secondary rate limit|too many requests'; then
      if [ $attempt -lt $max_attempts ]; then
        local waits=(30 60 120)
        sleep $((waits[$((attempt - 1))]))
        continue
      fi
      write_marker '${MARKER.PUSH_FAILED}' "$(node -e "
        const fs=require('fs');
        fs.writeFileSync('${MARKER_DIR}/${MARKER.PUSH_FAILED}', JSON.stringify({
          marker:'push-failed',
          at:new Date().toISOString(),
          opencodeExitCode:$OC_EXIT,
          gitError:process.argv[1],
          errorClassification:'rate_limit_exhausted',
          branch:'$BRANCH',
          commitSha:'$commit_sha',
          retryHistory:[{attempt:$attempt,exitCode:$push_exit,error:'rate_limit'}]
        },null,2));
      " "$git_output" 2>/dev/null)"
      exit 2
    fi

    # Network error — transient, standard backoff.
    if echo "$lower" | grep -qE 'could not resolve host|connection timed out|connection refused|network is unreachable|rpc failed|early eof|transfer closed'; then
      if [ $attempt -lt $max_attempts ]; then
        local waits=(1 5 15)
        sleep $((waits[$((attempt - 1))]))
        continue
      fi
      write_marker '${MARKER.PUSH_FAILED}' "$(node -e "
        const fs=require('fs');
        fs.writeFileSync('${MARKER_DIR}/${MARKER.PUSH_FAILED}', JSON.stringify({
          marker:'push-failed',
          at:new Date().toISOString(),
          opencodeExitCode:$OC_EXIT,
          gitError:process.argv[1],
          errorClassification:'network_transient_exhausted',
          branch:'$BRANCH',
          commitSha:'$commit_sha',
          retryHistory:[{attempt:$attempt,exitCode:$push_exit,error:'network_transient'}]
        },null,2));
      " "$git_output" 2>/dev/null)"
      exit 2
    fi

    # Unknown error — treat as permanent, no retry.
    write_marker '${MARKER.PUSH_FAILED}' "$(node -e "
      const fs=require('fs');
      fs.writeFileSync('${MARKER_DIR}/${MARKER.PUSH_FAILED}', JSON.stringify({
        marker:'push-failed',
        at:new Date().toISOString(),
        opencodeExitCode:$OC_EXIT,
        gitError:process.argv[1],
        errorClassification:'unknown',
        branch:'$BRANCH',
        commitSha:'$commit_sha',
        retryHistory:[{attempt:$attempt,exitCode:$push_exit,error:'unknown'}]
      },null,2));
    " "$git_output" 2>/dev/null)"
    exit 2
  done

  # All retries exhausted (shouldn't reach here — the loop exits via the
  # writes above, but this is a safety net).
  exit 2
}

# Set the EXIT trap. This fires on normal exit, SIGTERM (143), SIGHUP, SIGINT.
# It does NOT fire on SIGKILL (137) — the pass's git ls-remote fallback
# covers that case (see spike-in-sandbox-template.md F1).
trap do_push EXIT

# ─── Step 1: Start tunnel proxy ───
# The proxy script was copied to /tmp/tunnel-proxy.js by provisionSandbox.
# NODE_PATH points at the repo's node_modules so require('ws') resolves.
node /tmp/tunnel-proxy.js &
PROXY_PID=$!

# ─── Step 2: Proxy health check (two-tier) ───
# Tier 1: HTTP listener check — catches ws-missing, port-in-use, proxy crash.
# Poll for up to 5 seconds (10 * 0.5s).
PROXY_READY=0
for i in $(seq 1 10); do
  if curl -sf --max-time 1 http://127.0.0.1:8888/ >/dev/null 2>&1; then
    PROXY_READY=1
    break
  fi
  sleep 0.5
done

if [ "$PROXY_READY" -ne 1 ]; then
  write_marker '${MARKER.PROXY_FAILED}' '{"marker":"proxy-failed","tier":"listener","cause":"proxy not responding on 127.0.0.1:8888 after 5s poll","permanence":"permanent"}'
  kill "$PROXY_PID" 2>/dev/null || true
  exit ${EXIT.PROXY_FAILURE}
fi

# Tier 2: End-to-end tunnel verification — catches relay-down, bad-token.
# Any HTTP response code (even 401) means the tunnel is working.
# Code 000 means no response at all.
TUNNEL_CODE=$(HTTPS_PROXY=http://127.0.0.1:8888 curl -s --max-time 10 -o /dev/null -w '%{http_code}' https://api.neuralwatt.com/v1/models 2>/dev/null || echo "000")
if [ "$TUNNEL_CODE" = "000" ]; then
  write_marker '${MARKER.PROXY_FAILED}' '{"marker":"proxy-failed","tier":"tunnel","cause":"end-to-end tunnel verification failed (no HTTP response from api.neuralwatt.com)","permanence":"transient"}'
  kill "$PROXY_PID" 2>/dev/null || true
  exit ${EXIT.PROXY_FAILURE}
fi

# ─── Step 3: Install with sub-step timeout ───
# The install command is wrapped in GNU timeout. Exit code 124 means timeout.
# Without this, an install hang consumes the entire per-node deadline and
# hits the SIGKILL work-loss gap (see spike-in-sandbox-template.md F2).
${installCmd ? `
INSTALL_OUTPUT=$(cd "$REPO_PATH" && ${installCmd} 2>&1)
INSTALL_EXIT=$?
if [ $INSTALL_EXIT -ne 0 ]; then
  if [ $INSTALL_EXIT -eq 124 ]; then
    INSTALL_CAUSE="timeout"
  else
    INSTALL_CAUSE="non_zero_exit"
  fi
  # Write the install-failed marker with truncated output.
  TRUNCATED=$(echo "$INSTALL_OUTPUT" | tail -c 4096)
  node -e "
    const fs=require('fs');
    fs.writeFileSync('${MARKER_DIR}/${MARKER.INSTALL_FAILED}', JSON.stringify({
      marker:'install-failed',
      at:new Date().toISOString(),
      cause:'$INSTALL_CAUSE',
      exitCode:$INSTALL_EXIT,
      output:process.argv[1]
    },null,2));
  " "$TRUNCATED" 2>/dev/null
  kill "$PROXY_PID" 2>/dev/null || true
  exit ${EXIT.INSTALL_FAILURE}
fi
` : '# Install step skipped (no installCommand configured).'}

# From here on, the push step runs on exit (EXIT trap).
PUSH_NEEDED=1

# ─── Step 4: Capture sessions_before ───
# The session-ID poller diffs against this snapshot to find the new session
# created by the upcoming opencode run. This handles stale sessions from
# sandbox reuse (the pre-run snapshot diff eliminates them — see
# spike-in-sandbox-template.md F4).
opencode session list --format json 2>/dev/null > "$PIPELINE_TMP/sessions-before.json" || echo '[]' > "$PIPELINE_TMP/sessions-before.json"

# ─── Step 5: Launch background session-ID poller ───
# The poller runs concurrently with opencode run. It polls every ~2s for
# up to 5 minutes (150 iterations). When a new session appears that wasn't
# in sessions_before, it writes the ID to SESSION_ID_PATH and exits.
# If no new session is found, it writes a session-capture-failed marker.
# This is robust against opencode hang (ID captured before the hang is
# detected) and opencode crash (poller detects no new session, writes
# marker) — see spike-in-sandbox-template.md F4.
(
  for i in $(seq 1 150); do
    sleep 2
    opencode session list --format json 2>/dev/null > "$PIPELINE_TMP/sessions-now.json" || echo '[]' > "$PIPELINE_TMP/sessions-now.json"
    NEW_ID=$(node -e "
      let before;
      try { before = JSON.parse(require('fs').readFileSync('$PIPELINE_TMP/sessions-before.json','utf8')); } catch { before = []; }
      const beforeIds = new Set(Array.isArray(before) ? before.map(s=>s.id) : []);
      let now;
      try { now = JSON.parse(require('fs').readFileSync('$PIPELINE_TMP/sessions-now.json','utf8')); } catch { now = []; }
      if (Array.isArray(now)) {
        const found = now.find(s => s && s.id && !beforeIds.has(s.id));
        if (found) process.stdout.write(found.id);
      }
    " 2>/dev/null)
    if [ -n "$NEW_ID" ]; then
      echo "$NEW_ID" > "$SESSION_ID_PATH"
      exit 0
    fi
  done
  # No new session found after 5 minutes — write session-capture-failed marker.
  echo '{"marker":"session-capture-failed","cause":"no_new_session","detail":"no new session detected in 5 min poll"}' > "$MARKER_DIR/${MARKER.SESSION_CAPTURE_FAILED}"
) &
POLLER_PID=$!

# ─── Step 6: Run opencode ───
# The main agent command. --format json emits newline-delimited JSON events
# to stdout (step_start, text, step_finish, tool_use, reasoning, error).
# </dev/null prevents the PTY hang. The event stream is captured to a file
# for the classifier and also goes to the session logs (the pass reads it
# via getSessionCommandLogs).
${ocCmd} > "$EVENT_STREAM_PATH" 2>&1
OC_EXIT=$?

# Capture opencode's exit code for the classifier.
echo "$OC_EXIT" > "$OPENCODE_EXIT_CODE_PATH"

# Kill the session-ID poller if still running.
if [ "$POLLER_PID" -ne 0 ]; then
  kill "$POLLER_PID" 2>/dev/null || true
fi

# Kill the tunnel proxy — no longer needed.
kill "$PROXY_PID" 2>/dev/null || true

# ─── Step 7: Exit ───
# The EXIT trap (do_push) fires here and pushes the branch unconditionally.
# If the push succeeds, the trap exits with $OC_EXIT (0 for success, 1 for
# agent failure). If the push fails, the trap exits with 2 (PUSH_FAILED).
exit $OC_EXIT
`;
}
