#!/usr/bin/env node
/**
 * Spike: in-sandbox command template failure modes (I4).
 *
 * Verifies the reviewer-flagged assumption I4 from the graph-pipeline plan:
 *
 *   "The in-sandbox command template is the most operationally critical piece
 *   of code in the system. It runs inside a sandbox, outside the pass's direct
 *   control, and is responsible for 8 steps. Each has failure modes the pass
 *   can't directly observe."
 *
 * Eight failure scenarios tested (one per step):
 *
 *   S1. Proxy-start failure — proxy fails to start (ws missing, port in use, relay down)
 *   S2. Install failure — npm ci fails or hangs
 *   S3. Session-capture failure — opencode session list returns empty or malformed
 *   S4. opencode hang — opencode never exits, pass kills it, template steps 5-8 never run
 *   S5. Push-transient failure — network error on push, retries succeed
 *   S6. Push-permanent failure — auth error, all retries exhausted, marker written
 *   S7. Marker-write failure — push failed AND marker write failed (disk full)
 *   S8. Exit-code propagation — template exit code vs opencode exit code confusion
 *
 * Plus four interaction scenarios:
 *
 *   I1. opencode succeeds + push succeeds (happy path)
 *   I2. opencode fails + push succeeds (failed outcome, work durable)
 *   I3. opencode succeeds + push fails (work on disk, marker written)
 *   I4. opencode hangs + pass kills + trap fires (SIGTERM) vs trap doesn't fire (SIGKILL)
 *
 * This is a PURE-LOGIC discrete-event simulation. No infrastructure, no
 * network, no sandboxes, no LLM calls. It models the template as a state
 * machine and the pass as an observer that reads markers, exit codes, and
 * session state.
 *
 * Usage:
 *   node spike-in-sandbox-template.js
 *
 * No external dependencies — uses only Node.js stdlib.
 * See: docs/todo/spike-in-sandbox-template.md for the full report.
 */

'use strict';

// ─── Constants ─────────────────────────────────────────────────────────────

const PROXY_PORT = 8888;
const PUSH_RETRY_DELAYS_MS = [1000, 5000, 15000]; // 1s, 5s, 15s
const PASS_DEADLINE_MS = 30 * 60 * 1000; // 30 min per-node deadline
const INSTALL_TIMEOUT_MS = 8 * 60 * 1000; // 8 min sub-step timeout
const PROXY_HEALTH_CHECK_TIMEOUT_MS = 5000; // 5s to verify proxy is up
const SIGTERM = 143;
const SIGKILL = 137;

// ─── Utilities ─────────────────────────────────────────────────────────────

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ─── Template state machine ────────────────────────────────────────────────

/**
 * Models the in-sandbox command template as an ordered sequence of steps.
 * Each step can succeed, fail (with a classification), or hang.
 *
 * The template runs inside a sandbox. The pass observes from outside via:
 * - getSessionCommand() → exit code (or null if still running)
 * - getSessionCommandLogs() → stdout/stderr
 * - file reads (markers, session ID file)
 * - git ls-remote (to check if branch was pushed)
 */

class TemplateSimulation {
  constructor(config) {
    this.config = config; // { proxyFailure, installFailure, sessionCaptureFailure,
                          //   opencodeOutcome, pushFailure, markerWriteFailure,
                          //   terminationSignal, enableHealthCheck, enableInstallTimeout }

    this.stepLog = [];
    this.markers = {};        // marker files written by the template
    this.sessionIdFile = null; // path where session ID is written
    this.opencodeExitCode = null;
    this.templateExitCode = null;
    this.branchPushed = false;
    this.opencodeExited = false;
    this.templateCompleted = false;
    this.killedByPass = false;
    this.trapFired = false;
    this.elapsedMs = 0;
  }

  log(step, msg, data = {}) {
    this.stepLog.push({ step, msg, elapsedMs: this.elapsedMs, ...data });
  }

  // ─── Step 1: Start tunnel proxy ──────────────────────────────────────────

  step1_startProxy() {
    this.log('step1', 'starting tunnel proxy on 127.0.0.1:' + PROXY_PORT);

    if (this.config.proxyFailure === 'ws_missing') {
      this.log('step1', 'FAILED: ws package not installed globally');
      this.markers['proxy-failed'] = {
        cause: 'ws_missing',
        detail: 'Cannot find module \'ws\'',
        permanent: true,
      };
      this.templateExitCode = 20; // proxy failure exit code
      return false;
    }

    if (this.config.proxyFailure === 'port_in_use') {
      this.log('step1', 'FAILED: port 8888 already in use');
      this.markers['proxy-failed'] = {
        cause: 'port_in_use',
        detail: 'EADDRINUSE',
        permanent: true,
      };
      this.templateExitCode = 20;
      return false;
    }

    if (this.config.proxyFailure === 'relay_down') {
      this.log('step1', 'proxy started but relay unreachable');
      // Proxy starts fine, but health check (if enabled) catches it
      if (this.config.enableHealthCheck) {
        this.log('step1-health', 'health check: end-to-end tunnel verification failed');
        this.markers['proxy-failed'] = {
          cause: 'relay_down',
          detail: '502 Bad Gateway from relay',
          permanent: false, // transient — relay might come back
        };
        this.templateExitCode = 20;
        return false;
      } else {
        this.log('step1-health', 'NO health check — proxy failure deferred to opencode');
        // Proxy "starts" but will fail when opencode tries to use it
        return true;
      }
    }

    if (this.config.proxyFailure === 'none') {
      this.log('step1', 'proxy started successfully');
      if (this.config.enableHealthCheck) {
        this.log('step1-health', 'health check passed (HTTP listener + tunnel verification)');
        this.elapsedMs += 2000; // ~2s for health check
      }
      return true;
    }

    return true;
  }

  // ─── Step 2: Run install command ──────────────────────────────────────────

  step2_install() {
    this.log('step2', 'running per-claim install command');

    if (this.config.installFailure === 'npm_ci_fails') {
      this.log('step2', 'FAILED: npm ci exited non-zero (missing system dep)');
      this.markers['install-failed'] = {
        substep: 'project',
        exit_code: 1,
        detail: 'ERR! node-gyp rebuild failed',
        permanent: true,
      };
      this.templateExitCode = 10; // install failure exit code
      return false;
    }

    if (this.config.installFailure === 'ws_global_fails') {
      this.log('step2', 'FAILED: ws global install failed (registry issue)');
      this.markers['install-failed'] = {
        substep: 'infra',
        exit_code: 1,
        detail: 'npm ERR! network timeout',
        permanent: false, // transient — registry hiccup
      };
      this.templateExitCode = 10;
      return false;
    }

    if (this.config.installFailure === 'hang') {
      this.log('step2', 'install hanging (postinstall script blocked)');
      if (this.config.enableInstallTimeout) {
        this.log('step2', 'install sub-step timeout fired (8 min)');
        this.markers['install-failed'] = {
          substep: 'project',
          exit_code: 124, // GNU timeout exit code
          detail: 'install timed out',
          permanent: true,
        };
        this.templateExitCode = 10;
        this.elapsedMs += INSTALL_TIMEOUT_MS;
        return false;
      } else {
        this.log('step2', 'NO install timeout — install hangs until pass deadline');
        this.elapsedMs += PASS_DEADLINE_MS;
        this.killedByPass = true;
        this.templateExitCode = null; // killed, no exit code
        return false;
      }
    }

    this.log('step2', 'install succeeded');
    this.elapsedMs += 30000; // ~30s for npm ci with baked node_modules
    return true;
  }

  // ─── Step 3: Capture session ID ───────────────────────────────────────────

  step3_captureSession() {
    this.log('step3', 'capturing session ID via opencode session list --format json');

    if (this.config.sessionCaptureFailure === 'empty_list') {
      this.log('step3', 'FAILED: session list returned [] (opencode crashed before session creation)');
      this.markers['session-capture-failed'] = {
        cause: 'empty_list',
        detail: 'opencode exited non-zero before creating a session',
        retryable: true, // opencode startup crash — might succeed on retry
      };
      this.templateExitCode = 66; // session capture failure (transient)
      return false;
    }

    if (this.config.sessionCaptureFailure === 'malformed_json') {
      this.log('step3', 'FAILED: session list returned non-JSON output');
      this.markers['session-capture-failed'] = {
        cause: 'malformed',
        detail: 'opencode binary not found / crashed mid-output',
        retryable: false, // machinery failure — same image will fail identically
      };
      this.templateExitCode = 67; // session capture failure (permanent)
      return false;
    }

    if (this.config.sessionCaptureFailure === 'never_runs') {
      // This happens when opencode hangs (step 4) — session list is never called
      // because the template is blocked on `opencode run`
      this.log('step3', 'SKIPPED: opencode never exited, session list never ran');
      this.sessionIdFile = null;
      return false;
    }

    // Happy path
    const sessionId = 'ses_' + Math.random().toString(16).slice(2, 14);
    this.sessionIdFile = sessionId;
    this.log('step3', `session ID captured: ${sessionId}`);
    return true;
  }

  // ─── Step 4: Run opencode ─────────────────────────────────────────────────

  step4_runOpencode() {
    this.log('step4', 'running opencode run --format json --dir <path> </dev/null');

    if (this.config.opencodeOutcome === 'hang') {
      this.log('step4', 'opencode HUNG — never exits, no step_finish event');
      // The template is blocked here. The pass's deadline fires.
      this.elapsedMs += PASS_DEADLINE_MS;
      this.killedByPass = true;

      // Does the trap fire? Depends on the termination signal.
      if (this.config.terminationSignal === 'SIGTERM') {
        this.log('step4', 'pass sent SIGTERM — EXIT trap fires');
        this.trapFired = true;
        // Trap attempts the push (steps 5-7 in the trap handler)
        this._trapPushAttempt();
      } else if (this.config.terminationSignal === 'SIGKILL') {
        this.log('step4', 'pass sent SIGKILL (or OOM) — trap does NOT fire');
        this.trapFired = false;
        // Steps 5-8 never run. Branch is NOT pushed. No marker.
      }

      this.opencodeExitCode = this.config.terminationSignal === 'SIGTERM' ? SIGTERM : SIGKILL;
      this.opencodeExited = true;
      this.templateExitCode = null; // killed
      return;
    }

    // opencode exits (success or failure)
    this.opencodeExited = true;
    this.elapsedMs += 5 * 60 * 1000; // ~5 min for a typical run

    if (this.config.opencodeOutcome === 'success') {
      this.opencodeExitCode = 0;
      this.log('step4', 'opencode exited 0 (success)');
    } else if (this.config.opencodeOutcome === 'failure') {
      this.opencodeExitCode = 1;
      this.log('step4', 'opencode exited 1 (failure)');
    } else if (this.config.opencodeOutcome === 'signal_exit') {
      this.opencodeExitCode = SIGKILL;
      this.log('step4', 'opencode killed by SIGKILL (OOM)');
    }
  }

  // ─── Trap handler push attempt (for SIGTERM case) ─────────────────────────

  _trapPushAttempt() {
    // When the trap fires on SIGTERM, it has limited time before SIGKILL.
    // A real trap would do a single fast push (no retries).
    this.log('trap', 'trap handler: attempting single fast push (no retries)');

    if (this.config.pushFailure === 'none' || this.config.pushFailure === 'transient') {
      this.log('trap', 'fast push succeeded');
      this.branchPushed = true;
    } else {
      this.log('trap', 'fast push failed — writing marker if time allows');
      this._writePushFailedMarker('trap_fast_push_failed');
    }
  }

  // ─── Step 5: Push branch with bounded retry ───────────────────────────────

  step5_pushBranch() {
    if (this.killedByPass && !this.trapFired) {
      this.log('step5', 'SKIPPED — template was killed, trap did not fire');
      return;
    }

    this.log('step5', 'pushing branch with bounded retry');

    if (this.config.pushFailure === 'none') {
      this.log('step5', 'push succeeded on first attempt');
      this.branchPushed = true;
      this.elapsedMs += 2000;
      return;
    }

    if (this.config.pushFailure === 'transient') {
      this.log('step5', 'attempt 1 failed (network error), retrying...');
      this.elapsedMs += PUSH_RETRY_DELAYS_MS[0];
      this.log('step5', 'attempt 2 succeeded');
      this.branchPushed = true;
      this.elapsedMs += 2000;
      return;
    }

    if (this.config.pushFailure === 'auth_failure') {
      this.log('step5', 'auth failure — should short-circuit (no retry)');
      // With proper classification: 0 retries, immediate marker
      this._writePushFailedMarker('auth_failure', 'fatal: Authentication failed');
      return;
    }

    if (this.config.pushFailure === 'permanent') {
      this.log('step5', 'all 3 retry attempts failed (network error persists)');
      for (let i = 0; i < PUSH_RETRY_DELAYS_MS.length; i++) {
        this.log('step5', `attempt ${i + 1} failed, waiting ${PUSH_RETRY_DELAYS_MS[i]}ms`);
        this.elapsedMs += PUSH_RETRY_DELAYS_MS[i];
      }
      this._writePushFailedMarker('network_transient_exhausted', 'Connection timed out');
      return;
    }

    if (this.config.pushFailure === 'non_fast_forward') {
      this.log('step5', 'non-fast-forward rejection — permanent (cannot rebase)');
      this._writePushFailedMarker('non_fast_forward', '! [rejected] (non-fast-forward)');
      return;
    }
  }

  // ─── Step 6+7: Write push-failed marker ───────────────────────────────────

  _writePushFailedMarker(classification, gitError) {
    if (this.config.markerWriteFailure) {
      this.log('step7', 'FAILED: cannot write marker (disk full)');
      // Marker write failed — pass has no signal
      return;
    }

    this.log('step7', 'writing push-failed marker');
    this.markers['push-failed'] = {
      opencode_exit_code: this.opencodeExitCode,
      push_exit_code: 128,
      git_stderr: gitError,
      error_classification: classification,
      branch: `pipeline/run-42/chain-3`,
      retry_history: [],
      working_tree_dirty: false,
    };
  }

  // ─── Step 8: Exit with right code ──────────────────────────────────────────

  step8_exit() {
    if (this.killedByPass && !this.trapFired) {
      this.log('step8', 'SKIPPED — template was killed, no exit code set');
      return;
    }

    if (this.templateExitCode !== null) {
      // Already set by an earlier step (install failure, proxy failure, etc.)
      this.log('step8', `exiting with code ${this.templateExitCode} (set by earlier step)`);
      return;
    }

    // Determine exit code based on opencode + push outcomes
    if (this.opencodeExitCode === 0 && this.branchPushed) {
      this.templateExitCode = 0;
      this.log('step8', 'exiting 0 (success + push succeeded)');
    } else if (this.opencodeExitCode !== 0 && this.branchPushed) {
      this.templateExitCode = 1;
      this.log('step8', 'exiting 1 (opencode failed, push succeeded — work on branch)');
    } else if (this.markers['push-failed']) {
      this.templateExitCode = 2;
      this.log('step8', 'exiting 2 (push failed — marker written)');
    } else {
      this.templateExitCode = 1;
      this.log('step8', 'exiting 1 (fallback)');
    }
  }

  // ─── Run the full template ────────────────────────────────────────────────

  run() {
    // Step 1
    if (!this.step1_startProxy()) {
      this.log('template', 'exiting early after step 1 failure');
      this.step8_exit();
      this.templateCompleted = true;
      return;
    }

    // Step 2
    if (!this.step2_install()) {
      this.log('template', 'exiting early after step 2 failure');
      this.step8_exit();
      this.templateCompleted = true;
      return;
    }

    // Step 4 (runs before step 3 in the "capture after run" model)
    // Actually: step 3 runs AFTER step 4 per the plan ("after the initial opencode run")
    // But for the hang case, step 4 blocks and step 3 never runs.
    this.step4_runOpencode();

    // Step 3 (only if opencode exited)
    if (this.opencodeExited && !this.killedByPass) {
      this.step3_captureSession();
    } else if (this.killedByPass) {
      this.log('step3', 'SKIPPED — opencode was killed, session capture never ran');
    }

    // Steps 5-8 (only if template wasn't killed, OR trap fired AND opencode exited normally)
    // When killed by pass (hang/timeout), the trap handles the push — the main flow
    // does NOT also run steps 5-8 (double push would be redundant and confusing).
    if (!this.killedByPass) {
      this.step5_pushBranch();
      this.step8_exit();
    } else if (this.trapFired) {
      // Trap already handled push — just set exit code
      this.log('template', 'steps 5-8 handled by trap — setting exit code only');
      this.templateExitCode = this.opencodeExitCode; // 143 (SIGTERM)
    }

    this.templateCompleted = true;
  }
}

// ─── Pass observer ──────────────────────────────────────────────────────────

/**
 * Models the dispatcher pass as an observer of the sandbox.
 * The pass can: read exit codes, read markers, check git ls-remote,
 * read session logs, and attempt recovery pushes.
 */
class PassObserver {
  constructor(template) {
    this.template = template;
    this.classification = null;
    this.recoveryAttempted = false;
    this.recoverySucceeded = false;
    this.parked = false;
    this.parkReason = null;
    this.workLost = false;
    this.workPreserved = false;
  }

  classify() {
    const t = this.template;

    // Check markers first (authoritative for infra failures)
    if (t.markers['proxy-failed']) {
      const marker = t.markers['proxy-failed'];
      if (marker.permanent) {
        this.classification = 'infra_failure_permanent';
        this.parked = true;
        this.parkReason = `proxy failed: ${marker.cause}`;
      } else {
        this.classification = 'infra_failure_transient';
        this.parked = true;
        this.parkReason = `proxy failed (transient): ${marker.cause}`;
      }
      return;
    }

    if (t.markers['install-failed']) {
      const marker = t.markers['install-failed'];
      this.classification = 'install_failure';
      this.parked = true;
      this.parkReason = `install failed (${marker.substep}): ${marker.detail}`;
      return;
    }

    if (t.markers['session-capture-failed']) {
      const marker = t.markers['session-capture-failed'];
      if (marker.retryable) {
        this.classification = 'session_capture_transient';
        // Retry on fresh sandbox
      } else {
        this.classification = 'session_capture_permanent';
        this.parked = true;
        this.parkReason = `session capture failed: ${marker.cause}`;
      }
      return;
    }

    // Check for push-failed marker
    if (t.markers['push-failed']) {
      const marker = t.markers['push-failed'];

      // Attempt recovery push
      this.recoveryAttempted = true;
      if (marker.error_classification === 'auth_failure' ||
          marker.error_classification === 'non_fast_forward') {
        // Don't attempt recovery for permanent causes
        this.recoveryAttempted = false;
        this.classification = 'push_failed_permanent';
        this.parked = true;
        this.parkReason = `push failed: ${marker.error_classification}`;
        this.workPreserved = true; // sandbox preserved for manual recovery
        return;
      }

      // Attempt recovery push from working tree
      this.log('pass', 'attempting recovery push from sandbox working tree');
      // Recovery succeeds if the push failure was transient and has recovered
      if (marker.error_classification === 'network_transient_exhausted') {
        this.recoverySucceeded = true;
        this.branchPushed = true;
        this.classification = t.opencodeExitCode === 0 ? 'complete' : 'failed';
      } else {
        this.recoverySucceeded = false;
        this.classification = 'push_failed';
        this.parked = true;
        this.parkReason = `push recovery failed: ${marker.git_stderr}`;
        this.workPreserved = true;
      }
      return;
    }

    // No markers — classify by exit code
    if (t.killedByPass && !t.trapFired) {
      // SIGKILL case — template was killed, no markers, no exit code
      this.classification = 'timeout';
      if (!t.branchPushed) {
        this.workLost = true;
        this.log('pass', 'WORK LOST: timeout kill, no trap, no push, no marker');
      }
      return;
    }

    if (t.killedByPass && t.trapFired) {
      // SIGTERM case — trap fired, may have pushed
      if (t.branchPushed) {
        this.classification = 'timeout_with_push';
        this.workPreserved = true;
        this.log('pass', 'timeout killed, but trap pushed the branch — work preserved');
      } else {
        // Trap fired but push failed and no marker was written
        this.classification = 'timeout';
        this.workLost = true;
        this.log('pass', 'WORK LOST: timeout kill, trap fired but push failed, no marker');
      }
      return;
    }

    // Normal exit (not killed by pass)
    if (t.templateExitCode === 0) {
      this.classification = 'complete';
    } else if (t.templateExitCode === 1) {
      this.classification = 'failed';
      this.workPreserved = t.branchPushed;
    } else if (t.templateExitCode === 2) {
      this.classification = 'push_failed';
      // Should have been caught by marker check above
    } else if (t.templateExitCode === 10) {
      this.classification = 'install_failure';
    } else if (t.templateExitCode === 20) {
      this.classification = 'proxy_failure';
    } else if (t.templateExitCode === 66) {
      this.classification = 'session_capture_transient';
    } else if (t.templateExitCode === 67) {
      this.classification = 'session_capture_permanent';
    } else if (t.opencodeExitCode === SIGKILL) {
      this.classification = 'oom_kill';
      this.workLost = !t.branchPushed;
    } else {
      this.classification = 'unknown';
    }
  }

  log(step, msg) {
    console.log(`  [pass] ${msg}`);
  }
}

// ─── Test runner ───────────────────────────────────────────────────────────

function runScenario(name, config, expected) {
  console.log('\n' + '='.repeat(72));
  console.log(`SCENARIO: ${name}`);
  console.log('='.repeat(72));

  const template = new TemplateSimulation(config);
  template.run();

  console.log('\n--- Template step log ---');
  for (const entry of template.stepLog) {
    log(entry.step, entry.msg);
  }

  console.log('\n--- Pass classification ---');
  const pass = new PassObserver(template);
  pass.classify();

  console.log(`  Classification: ${pass.classification}`);
  console.log(`  Parked: ${pass.parked}${pass.parkReason ? ' (' + pass.parkReason + ')' : ''}`);
  console.log(`  Recovery attempted: ${pass.recoveryAttempted}`);
  console.log(`  Recovery succeeded: ${pass.recoverySucceeded}`);
  console.log(`  Work lost: ${pass.workLost}`);
  console.log(`  Work preserved: ${pass.workPreserved}`);
  console.log(`  Branch pushed: ${template.branchPushed}`);
  console.log(`  Markers written: ${Object.keys(template.markers).join(', ') || 'none'}`);
  console.log(`  Template exit code: ${template.templateExitCode}`);
  console.log(`  opencode exit code: ${template.opencodeExitCode}`);
  console.log(`  Killed by pass: ${template.killedByPass}`);
  console.log(`  Trap fired: ${template.trapFired}`);

  // Verify expectations
  const results = { name, classification: pass.classification, parked: pass.parked,
    workLost: pass.workLost, workPreserved: pass.workPreserved,
    branchPushed: template.branchPushed,
    recoveryAttempted: pass.recoveryAttempted,
    recoverySucceeded: pass.recoverySucceeded,
    expected };

  if (expected) {
    const mismatches = [];
    for (const [key, val] of Object.entries(expected)) {
      if (results[key] !== val) {
        mismatches.push(`${key}: expected ${val}, got ${results[key]}`);
      }
    }
    if (mismatches.length > 0) {
      console.log('\n  ⚠ EXPECTATION MISMATCH:');
      for (const m of mismatches) console.log(`    - ${m}`);
    } else {
      console.log('\n  ✓ All expectations met');
    }
  }

  return results;
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

const scenarios = [];

// --- S1: Proxy-start failure scenarios ---

scenarios.push({
  name: 'S1a: proxy fails — ws missing (with health check)',
  config: { proxyFailure: 'ws_missing', enableHealthCheck: true,
    opencodeOutcome: 'success', pushFailure: 'none' },
  expected: { classification: 'infra_failure_permanent', parked: true, workLost: false },
});

scenarios.push({
  name: 'S1b: proxy fails — relay down (with health check)',
  config: { proxyFailure: 'relay_down', enableHealthCheck: true,
    opencodeOutcome: 'success', pushFailure: 'none' },
  expected: { classification: 'infra_failure_transient', parked: true },
});

scenarios.push({
  name: 'S1c: proxy fails — relay down (NO health check)',
  config: { proxyFailure: 'relay_down', enableHealthCheck: false,
    opencodeOutcome: 'failure', pushFailure: 'none' },
  // Without health check, proxy "starts" but opencode fails when it tries to use it
  // opencode exits non-zero with a provider error → classified as 'failed'
  expected: { classification: 'failed' },
});

// --- S2: Install failure scenarios ---

scenarios.push({
  name: 'S2a: install fails — npm ci (missing system dep)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'npm_ci_fails', opencodeOutcome: 'success', pushFailure: 'none' },
  expected: { classification: 'install_failure', parked: true },
});

scenarios.push({
  name: 'S2b: install fails — ws global (transient registry)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'ws_global_fails', opencodeOutcome: 'success', pushFailure: 'none' },
  expected: { classification: 'install_failure', parked: true },
});

scenarios.push({
  name: 'S2c: install hangs (with sub-step timeout)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'hang', enableInstallTimeout: true,
    opencodeOutcome: 'success', pushFailure: 'none' },
  expected: { classification: 'install_failure', parked: true },
});

scenarios.push({
  name: 'S2d: install hangs (NO sub-step timeout)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'hang', enableInstallTimeout: false,
    opencodeOutcome: 'success', pushFailure: 'none' },
  // Without sub-step timeout, install hangs until pass deadline → timeout kill
  expected: { classification: 'timeout', workLost: true },
});

// --- S3: Session-capture failure scenarios ---

scenarios.push({
  name: 'S3a: session capture — empty list (opencode crashed)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', sessionCaptureFailure: 'empty_list',
    opencodeOutcome: 'failure', pushFailure: 'none' },
  expected: { classification: 'session_capture_transient' },
});

scenarios.push({
  name: 'S3b: session capture — malformed JSON (machinery failure)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', sessionCaptureFailure: 'malformed_json',
    opencodeOutcome: 'failure', pushFailure: 'none' },
  expected: { classification: 'session_capture_permanent', parked: true },
});

// --- S4: opencode hang scenarios ---

scenarios.push({
  name: 'S4a: opencode hangs — pass sends SIGTERM (trap fires)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', opencodeOutcome: 'hang',
    terminationSignal: 'SIGTERM', pushFailure: 'none' },
  // Trap fires, pushes branch, work preserved
  expected: { classification: 'timeout_with_push', workPreserved: true, workLost: false },
});

scenarios.push({
  name: 'S4b: opencode hangs — pass sends SIGKILL (trap does NOT fire)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', opencodeOutcome: 'hang',
    terminationSignal: 'SIGKILL', pushFailure: 'none' },
  // Trap does NOT fire, branch not pushed, work LOST
  expected: { classification: 'timeout', workLost: true, branchPushed: false },
});

scenarios.push({
  name: 'S4c: opencode hangs — SIGTERM but push fails in trap',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', opencodeOutcome: 'hang',
    terminationSignal: 'SIGTERM', pushFailure: 'permanent',
    markerWriteFailure: false },
  // Trap fires, push fails, marker written by trap. Main flow doesn't re-run.
  // Pass sees: killed by pass, trap fired, push-failed marker exists.
  expected: { classification: 'push_failed', parked: true, workPreserved: true },
});

// --- S5: Push-transient failure ---

scenarios.push({
  name: 'S5: push transient failure — retry succeeds',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', opencodeOutcome: 'success',
    pushFailure: 'transient' },
  expected: { classification: 'complete', branchPushed: true },
});

// --- S6: Push-permanent failure ---

scenarios.push({
  name: 'S6a: push permanent — auth failure (short-circuit)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', opencodeOutcome: 'success',
    pushFailure: 'auth_failure' },
  expected: { classification: 'push_failed_permanent', parked: true },
});

scenarios.push({
  name: 'S6b: push permanent — network exhausted (recovery attempted)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', opencodeOutcome: 'success',
    pushFailure: 'permanent' },
  // Push fails, marker written, pass attempts recovery → recovery succeeds
  expected: { classification: 'complete', recoveryAttempted: true, recoverySucceeded: true },
});

scenarios.push({
  name: 'S6c: push permanent — non-fast-forward',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', opencodeOutcome: 'success',
    pushFailure: 'non_fast_forward' },
  expected: { classification: 'push_failed_permanent', parked: true },
});

// --- S7: Marker-write failure ---

scenarios.push({
  name: 'S7: push fails AND marker write fails (disk full)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', opencodeOutcome: 'success',
    pushFailure: 'permanent', markerWriteFailure: true },
  // No marker → pass can't detect push failure → misclassified as 'failed'
  // This is a GENUINE FINDING: marker write failure causes misclassification
  expected: { classification: 'failed', branchPushed: false },
});

// --- S8: Exit-code propagation ---

scenarios.push({
  name: 'S8a: opencode succeeds + push succeeds (happy path)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', opencodeOutcome: 'success',
    pushFailure: 'none' },
  expected: { classification: 'complete', branchPushed: true },
});

scenarios.push({
  name: 'S8b: opencode fails + push succeeds (failed, work durable)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', opencodeOutcome: 'failure',
    pushFailure: 'none' },
  expected: { classification: 'failed', workPreserved: true, branchPushed: true },
});

scenarios.push({
  name: 'S8c: opencode succeeds + push fails (work on disk, marker)',
  config: { proxyFailure: 'none', enableHealthCheck: true,
    installFailure: 'none', opencodeOutcome: 'success',
    pushFailure: 'permanent' },
  // Push fails, marker written, pass recovery succeeds
  expected: { classification: 'complete', recoveryAttempted: true, recoverySucceeded: true },
});

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Spike: in-sandbox command template failure modes (I4)                ║');
  console.log('║  Pure-logic discrete-event simulation — no infrastructure             ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');

  const results = [];
  for (const scenario of scenarios) {
    const result = runScenario(scenario.name, scenario.config, scenario.expected);
    results.push(result);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log('\n\n' + '='.repeat(72));
  console.log('SUMMARY');
  console.log('='.repeat(72));
  console.log('');

  const headers = ['Scenario', 'Classification', 'Parked', 'Work Lost', 'Work Preserved', 'Branch Pushed'];
  const rows = results.map(r => [
    r.name.slice(0, 50),
    r.classification,
    r.parked ? 'YES' : 'no',
    r.workLost ? 'YES' : 'no',
    r.workPreserved ? 'YES' : 'no',
    r.branchPushed ? 'YES' : 'no',
  ]);

  // Simple table
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i]).length)) + 2
  );

  const formatRow = (cells) =>
    '| ' + cells.map((c, i) => String(c).padEnd(colWidths[i] - 2)).join(' | ') + ' |';

  console.log(formatRow(headers));
  console.log('|' + colWidths.map(w => '-'.repeat(w - 1)).join('|') + '|');
  for (const row of rows) {
    console.log(formatRow(row));
  }

  // ─── Key findings ─────────────────────────────────────────────────────────

  console.log('\n--- Key findings ---\n');

  const workLostScenarios = results.filter(r => r.workLost);
  if (workLostScenarios.length > 0) {
    console.log('WORK LOST scenarios (durability floor violated):');
    for (const r of workLostScenarios) {
      console.log(`  - ${r.name}: ${r.classification}`);
    }
  }

  const misclassifiedScenarios = results.filter(r =>
    r.expected && (r.classification !== r.expected.classification));
  if (misclassifiedScenarios.length > 0) {
    console.log('\nMISCLASSIFIED scenarios (pass classification differs from expected):');
    for (const r of misclassifiedScenarios) {
      console.log(`  - ${r.name}: got ${r.classification}, expected ${r.expected.classification}`);
    }
  }

  const parkedScenarios = results.filter(r => r.parked);
  console.log(`\nParked scenarios: ${parkedScenarios.length}/${results.length}`);
  console.log(`Work lost scenarios: ${workLostScenarios.length}/${results.length}`);
  console.log(`Work preserved scenarios: ${results.filter(r => r.workPreserved).length}/${results.length}`);

  // ─── Health-check comparison ──────────────────────────────────────────────

  console.log('\n--- Health check impact ---\n');
  const withHealthCheck = results.filter(r => r.name.includes('with health check') || r.name.includes('S1a') || r.name.includes('S1b'));
  const withoutHealthCheck = results.filter(r => r.name.includes('NO health check'));
  console.log(`With health check: proxy failures caught early = ${withHealthCheck.filter(r => r.classification.startsWith('infra')).length}`);
  console.log(`Without health check: proxy failures misclassified as agent failures = ${withoutHealthCheck.filter(r => r.classification === 'failed').length}`);

  // ─── Trap survival analysis ──────────────────────────────────────────────

  console.log('\n--- Trap survival on termination signal ---\n');
  const sigtermScenarios = results.filter(r => r.name.includes('SIGTERM'));
  const sigkillScenarios = results.filter(r => r.name.includes('SIGKILL'));
  console.log(`SIGTERM (trap fires): work preserved = ${sigtermScenarios.filter(r => r.workPreserved).length}/${sigtermScenarios.length}`);
  console.log(`SIGKILL (trap does NOT fire): work lost = ${sigkillScenarios.filter(r => r.workLost).length}/${sigkillScenarios.length}`);

  console.log('\n' + '='.repeat(72));
  console.log('Simulation complete.');
  console.log('='.repeat(72));
}

main();
