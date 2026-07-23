// Marker file constants and parsing helpers for the in-sandbox command template.
//
// The in-sandbox command template (template.mjs) writes structured marker
// files to a fixed directory inside the sandbox when an infra-level failure
// occurs (proxy failure, install failure, session-capture failure, push
// failure). The collecting pass (supervise.mjs) reads these markers before
// destroying the sandbox to classify the outcome correctly.
//
// The marker/exit-code contract (verified spike 2026-07-23 — see
// docs/todo/spike-in-sandbox-template.md, finding F6):
//
//   Exit codes (the template's process exit code):
//     0  — success (opencode ran and exited, push succeeded)
//     1  — agent failure (opencode exited non-zero, push succeeded)
//     2  — push failed (marker written, work may be on sandbox disk)
//     10 — install failure (install step failed or timed out)
//     20 — proxy failure (tunnel proxy health check failed)
//     66 — session-capture transient (no new session detected, retryable)
//     67 — session-capture permanent (malformed session list, machinery)
//
//   Marker files (JSON, written to /tmp/pipeline/markers/):
//     push-failed.json          — push step exhausted retries
//     proxy-failed.json         — tunnel proxy health check failed
//     install-failed.json       — install step failed or timed out
//     session-capture-failed.json — session ID poller detected a problem
//
//   Other files (written to /tmp/pipeline/):
//     session-id        — the captured opencode session ID (plain text)
//     opencode-exit-code — opencode's raw exit code (plain text)
//
// The pass reads markers first (authoritative for infra failures), then
// exit codes (for outcome classification). If they disagree, the pass logs
// a warning and follows the marker for push-recovery, the exit code for
// classification.

// ─── Paths inside the sandbox ───────────────────────────────────────────────

// The base directory for all pipeline temp files inside the sandbox.
export const PIPELINE_TMP = '/tmp/pipeline';

// Marker files directory.
export const MARKER_DIR = `${PIPELINE_TMP}/markers`;

// The session ID file — written by the background poller.
export const SESSION_ID_PATH = `${PIPELINE_TMP}/session-id`;

// opencode's raw exit code — written after `opencode run` exits.
export const OPENCODE_EXIT_CODE_PATH = `${PIPELINE_TMP}/opencode-exit-code`;

// The opencode JSON event stream — captured stdout from `opencode run --format json`.
export const OPENCODE_EVENT_STREAM_PATH = `${PIPELINE_TMP}/opencode-events.jsonl`;

// ─── Exit codes ─────────────────────────────────────────────────────────────

export const EXIT = {
  SUCCESS: 0,
  AGENT_FAILURE: 1, // opencode exited non-zero, push succeeded
  PUSH_FAILED: 2, // push step exhausted retries, marker written
  INSTALL_FAILURE: 10, // install step failed or timed out
  PROXY_FAILURE: 20, // tunnel proxy health check failed
  SESSION_CAPTURE_TRANSIENT: 66, // no new session detected (retryable)
  SESSION_CAPTURE_PERMANENT: 67, // malformed session list (machinery)
};

// ─── Marker file names ───────────────────────────────────────────────────────

export const MARKER = {
  PUSH_FAILED: 'push-failed.json',
  PROXY_FAILED: 'proxy-failed.json',
  INSTALL_FAILED: 'install-failed.json',
  SESSION_CAPTURE_FAILED: 'session-capture-failed.json',
};

// ─── Marker schemas ─────────────────────────────────────────────────────────

/**
 * Build a push-failed marker object.
 *
 * @param {object} opts
 * @param {number} opts.opencodeExitCode — opencode's raw exit code
 * @param {string} opts.gitError — the last git error output
 * @param {string} opts.errorClassification — one of: auth_failure,
 *   non_fast_forward, network_transient_exhausted, rate_limit_exhausted
 * @param {string} opts.branch — the branch name (pipeline/<runId>/<chainId>)
 * @param {string} opts.commitSha — the HEAD commit SHA at push time
 * @param {Array<{attempt: number, exitCode: number, error: string, at: string}>} opts.retryHistory
 * @returns {object} the marker object
 */
export function buildPushFailedMarker(opts) {
  return {
    marker: 'push-failed',
    at: new Date().toISOString(),
    opencodeExitCode: opts.opencodeExitCode,
    gitError: opts.gitError,
    errorClassification: opts.errorClassification,
    branch: opts.branch,
    commitSha: opts.commitSha,
    retryHistory: opts.retryHistory || [],
  };
}

/**
 * Build a proxy-failed marker object.
 *
 * @param {object} opts
 * @param {string} opts.tier — which tier failed: 'listener' or 'tunnel'
 * @param {string} opts.cause — human-readable cause
 * @param {string} opts.permanence — 'permanent' or 'transient'
 * @returns {object} the marker object
 */
export function buildProxyFailedMarker(opts) {
  return {
    marker: 'proxy-failed',
    at: new Date().toISOString(),
    tier: opts.tier,
    cause: opts.cause,
    permanence: opts.permanence,
  };
}

/**
 * Build an install-failed marker object.
 *
 * @param {object} opts
 * @param {string} opts.cause — 'non_zero_exit' or 'timeout'
 * @param {number} opts.exitCode — the install command's exit code (124 for timeout)
 * @param {string} opts.output — the install command's output (truncated)
 * @returns {object} the marker object
 */
export function buildInstallFailedMarker(opts) {
  return {
    marker: 'install-failed',
    at: new Date().toISOString(),
    cause: opts.cause,
    exitCode: opts.exitCode,
    output: opts.output,
  };
}

/**
 * Build a session-capture-failed marker object.
 *
 * @param {object} opts
 * @param {string} opts.cause — 'no_new_session' or 'malformed_json'
 * @param {string} opts.detail — human-readable detail
 * @returns {object} the marker object
 */
export function buildSessionCaptureFailedMarker(opts) {
  return {
    marker: 'session-capture-failed',
    at: new Date().toISOString(),
    cause: opts.cause,
    detail: opts.detail,
  };
}

// ─── Push error classification ───────────────────────────────────────────────

/**
 * Classify a git push error as transient or permanent.
 *
 * Used by both the in-sandbox template (to decide whether to retry) and
 * the pass (to decide whether a recovery push is worth attempting).
 *
 * @param {string} gitError — the git error output
 * @returns {{ classification: string, transient: boolean }}
 *   classification is one of: auth_failure, non_fast_forward,
 *   network_transient, rate_limit, unknown
 */
export function classifyPushError(gitError) {
  const lower = (gitError || '').toLowerCase();

  // Auth failures — permanent, no retry.
  if (lower.includes('authentication failed') ||
      lower.includes('could not read username') ||
      lower.includes('permission denied') ||
      lower.includes('fatal: could not read password')) {
    return { classification: 'auth_failure', transient: false };
  }

  // Non-fast-forward — permanent, can't push without rebase.
  if (lower.includes('non-fast-forward') ||
      lower.includes('fetch first') ||
      lower.includes('rejected')) {
    return { classification: 'non_fast_forward', transient: false };
  }

  // Rate limit — transient, longer backoff.
  if (lower.includes('rate limit') ||
      lower.includes('secondary rate limit') ||
      lower.includes('too many requests')) {
    return { classification: 'rate_limit', transient: true };
  }

  // Network errors — transient, standard backoff.
  if (lower.includes('could not resolve host') ||
      lower.includes('connection timed out') ||
      lower.includes('connection refused') ||
      lower.includes('network is unreachable') ||
      lower.includes('rpc failed') ||
      lower.includes('early eof') ||
      lower.includes('transfer closed')) {
    return { classification: 'network_transient', transient: true };
  }

  return { classification: 'unknown', transient: false };
}

// ─── Push retry backoff schedules ─────────────────────────────────────────────

// Backoff for network errors: 1s, 5s, 15s (21s total).
export const NETWORK_BACKOFF = [1, 5, 15];

// Backoff for rate-limit errors: 30s, 60s, 120s (210s total).
export const RATE_LIMIT_BACKOFF = [30, 60, 120];

/**
 * Get the backoff schedule for a push error classification.
 *
 * @param {string} classification — from classifyPushError
 * @returns {number[]} array of sleep seconds
 */
export function getBackoffSchedule(classification) {
  if (classification === 'rate_limit') return RATE_LIMIT_BACKOFF;
  if (classification === 'network_transient') return NETWORK_BACKOFF;
  return []; // permanent errors don't retry
}
