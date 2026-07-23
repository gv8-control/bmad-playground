#!/usr/bin/env node
/**
 * Spike: verify the Daytona API's termination signal — SIGTERM with grace
 * period vs. immediate SIGKILL.
 *
 * Verifies the claim in docs/todo/graph-pipeline.md (Branch push failure):
 *   "The Daytona API's termination signal (SIGTERM with grace period vs.
 *    immediate SIGKILL) must be verified empirically; the git ls-remote
 *    fallback covers both cases regardless."
 *
 * And the in-sandbox-template spike's F1:
 *   "The Daytona API's session-termination signal is the critical unknown.
 *    If Daytona sends SIGTERM with a grace period (like docker stop's 10s
 *    default), the trap has a window to push. If Daytona sends SIGKILL
 *    immediately, the trap never fires. This must be verified empirically
 *    against the Daytona API."
 *
 * The spike starts a long-running command that installs signal handlers
 * for SIGTERM, SIGINT, SIGHUP (and notes SIGKILL cannot be caught), writes
 * a marker on each signal, and sleeps. The spike then terminates the
 * session command via the Daytona API and checks which signal was caught
 * (if any) and whether the trap had time to run.
 *
 * Test matrix:
 *   1. Start a "trap-test" command that:
 *      - Installs handlers for SIGTERM, SIGINT, SIGHUP, EXIT
 *      - Writes "STARTED <pid>" to a marker file
 *      - On each signal, writes "CAUGHT <signal> <timestamp>" to the marker
 *      - On EXIT, writes "EXIT <timestamp>" to the marker
 *      - Sleeps for 300s
 *   2. Wait for the command to be running (confirm STARTED marker)
 *   3. Terminate the session command via the Daytona API
 *      - The SDK method: sb.process.executeSessionCommand with runAsync,
 *        then terminate via sb.process.stop or similar
 *   4. Wait a few seconds for the trap to fire (if it will)
 *   5. Read the marker file to determine:
 *      - Was SIGTERM caught? (trap fired)
 *      - Did EXIT trap fire?
 *      - How long between termination and trap? (grace period)
 *      - Or was it SIGKILL (no trap fired)?
 *
 * Reuses: spike-opencode-sandbox.js (log, sleep, elapsed, requireEnv).
 * Uses the Daytona SDK directly.
 *
 * Usage:
 *   node spike-termination-signal.js
 *   Requires: DAYTONA_API_KEY, DAYTONA_API_URL in env.
 */

const { Daytona, Image } = require('@daytonaio/sdk');
const { log, sleep, elapsed } = require('./spike-opencode-sandbox.js');

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`${name} is not set in env — cannot create Daytona client`);
  }
  return val;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const BASE_IMAGE = 'daytonaio/sandbox:0.8.0';
const MARKER_PATH = '/tmp/termination-signal-marker.txt';
const SESSION_ID = 'termination-spike';
const POLL_INTERVAL_MS = 1000;
const POST_TERM_WAIT_MS = 15000; // wait 15s after terminate for trap to fire

// ─── Result collection ─────────────────────────────────────────────────────

const results = { steps: [], errors: [], t0: Date.now() };

function record(step, ok, ms, extra = {}) {
  results.steps.push({ step, ok, ms, ...extra });
  log(step, `${ok ? 'PASS' : 'FAIL'} (${elapsed(ms)})`);
}

function recordError(step, err) {
  results.errors.push({ step, error: err.message || String(err) });
  log(step, `ERROR: ${err.message}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  let daytona = null;
  let sb = null;

  try {
    // Step 1: Create sandbox
    const step = '1-create-sandbox';
    log(step, 'Creating sandbox...');
    const t0 = Date.now();
    daytona = new Daytona({
      apiKey: requireEnv('DAYTONA_API_KEY'),
      apiUrl: requireEnv('DAYTONA_API_URL'),
    });
    sb = await daytona.create({
      image: Image.base(BASE_IMAGE),
      resources: { cpu: 2, memory: 2, disk: 5 },
      labels: { scope: 'spike', runId: 'term-signal-' + Date.now() },
    });
    log(step, `Created sandbox ${sb.id} in ${elapsed(Date.now() - t0)}`);
    record(step, true, Date.now() - t0, { sandboxId: sb.id });

    // Step 2: Start the trap-test command
    const step2 = '2-start-trap-test';
    log(step2, 'Starting trap-test command (async)...');
    const t1 = Date.now();

    // The trap-test script: catches SIGTERM/SIGINT/SIGHUP, writes markers, sleeps
    const trapScript = `cat > /tmp/trap-test.sh <<'TRAPEOF'
#!/bin/bash
MARKER="${MARKER_PATH}"
echo "STARTED \$(date +%s%N) \$\$" > \$MARKER

# Signal handlers
trap 'echo "CAUGHT_SIGTERM \$(date +%s%N)" >> \$MARKER' SIGTERM
trap 'echo "CAUGHT_SIGINT \$(date +%s%N)" >> \$MARKER' SIGINT
trap 'echo "CAUGHT_SIGHUP \$(date +%s%N)" >> \$MARKER' SIGHUP
trap 'echo "EXIT_TRAP \$(date +%s%N)" >> \$MARKER' EXIT

echo "HANDLERS_INSTALLED \$(date +%s%N)" >> \$MARKER

# Sleep for 300s (long enough for the test)
sleep 300
TRAPEOF
chmod +x /tmp/trap-test.sh
echo "script written"`;

    const writeResp = await sb.process.executeCommand(trapScript, undefined, undefined, 10);
    log(step2, `script write: ${writeResp.result}`);
    if (writeResp.exitCode !== 0) {
      throw new Error(`Failed to write trap script: ${writeResp.result}`);
    }

    // Create a session and start the trap-test async
    await sb.process.createSession(SESSION_ID);
    const cmd = `/tmp/trap-test.sh </dev/null 2>&1`;
    log(step2, `Starting async command: ${cmd}`);
    const execResp = await sb.process.executeSessionCommand(
      SESSION_ID,
      { command: cmd, runAsync: true },
      30,
    );
    const commandId = execResp.cmdId;
    log(step2, `Command started: cmdId=${commandId}`);
    record(step2, true, Date.now() - t1, { commandId });

    // Step 3: Wait for STARTED marker, confirm trap handlers are installed
    const step3 = '3-confirm-started';
    log(step3, 'Waiting for STARTED marker...');
    const t2 = Date.now();
    let started = false;
    let markerContent = '';
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      const markerResp = await sb.process.executeCommand(
        `cat ${MARKER_PATH} 2>/dev/null || echo "no marker yet"`,
        undefined, undefined, 5,
      );
      markerContent = markerResp.result;
      if (markerContent.includes('STARTED') && markerContent.includes('HANDLERS_INSTALLED')) {
        started = true;
        break;
      }
    }
    log(step3, `marker:\n${markerContent}`);
    record(step3, started, Date.now() - t2, { marker: markerContent });

    if (!started) {
      throw new Error('Trap-test command did not start within 5s');
    }

    // Parse the start timestamp
    const startedMatch = markerContent.match(/STARTED (\d+)/);
    const startedTs = startedMatch ? parseInt(startedMatch[1]) : 0;

    // Step 4: Record the pre-termination state
    const step4 = '4-pre-termination-state';
    log(step4, 'Recording pre-termination state...');
    const t3 = Date.now();
    const preTermState = await sb.process.getSessionCommand(SESSION_ID, commandId);
    log(step4, `pre-term state: exitCode=${preTermState.exitCode}, running=${preTermState.exitCode === undefined || preTermState.exitCode === null}`);
    record(step4, preTermState.exitCode === undefined || preTermState.exitCode === null, Date.now() - t3, {
      state: preTermState,
    });

    // Step 5: Terminate the session command via the Daytona API
    const step5 = '5-terminate';
    log(step5, 'Terminating session command via Daytona API...');
    const t4 = Date.now();
    const termTs = Date.now();
    
    // Try different termination methods
    // Method 1: deleteSession (the most common way to stop a session)
    let termMethod = 'deleteSession';
    let termError = null;
    try {
      await sb.process.deleteSession(SESSION_ID);
      log(step5, 'deleteSession completed');
    } catch (err) {
      log(step5, `deleteSession failed: ${err.message}`);
      termError = err.message;
      // Method 2: try stop on the sandbox itself
      try {
        termMethod = 'sandbox.stop';
        await sb.stop();
        log(step5, 'sandbox.stop completed');
      } catch (err2) {
        log(step5, `sandbox.stop failed: ${err2.message}`);
        termError = err2.message;
      }
    }
    const termDoneTs = Date.now();
    log(step5, `Termination via ${termMethod} took ${elapsed(termDoneTs - termTs)}`);
    record(step5, true, termDoneTs - termTs, { method: termMethod, error: termError });

    // Step 6: Wait for trap to fire (if it will)
    const step6 = '6-wait-for-trap';
    log(step6, `Waiting ${POST_TERM_WAIT_MS}ms for trap to fire...`);
    const t5 = Date.now();
    await sleep(POST_TERM_WAIT_MS);

    // Step 7: Read the final marker
    const step7 = '7-read-final-marker';
    log(step7, 'Reading final marker...');
    const t6 = Date.now();

    // If we used sandbox.stop, we need to restart the sandbox to read the marker
    if (termMethod === 'sandbox.stop') {
      log(step7, 'Restarting sandbox to read marker...');
      try {
        await sb.start();
        await sleep(2000);
      } catch (err) {
        log(step7, `Restart failed: ${err.message}`);
      }
    }

    const finalMarkerResp = await sb.process.executeCommand(
      `cat ${MARKER_PATH} 2>/dev/null || echo "marker not found"`,
      undefined, undefined, 10,
    );
    const finalMarker = finalMarkerResp.result;
    log(step7, `final marker:\n${finalMarker}`);
    record(step7, finalMarkerResp.exitCode === 0, Date.now() - t6, {
      marker: finalMarker,
    });

    // Step 8: Analyze the marker
    const step8 = '8-analyze';
    log(step8, 'Analyzing termination signal...');
    const t7 = Date.now();

    const analysis = {
      started: finalMarker.includes('STARTED'),
      handlersInstalled: finalMarker.includes('HANDLERS_INSTALLED'),
      caughtSigterm: finalMarker.includes('CAUGHT_SIGTERM'),
      caughtSigint: finalMarker.includes('CAUGHT_SIGINT'),
      caughtSighup: finalMarker.includes('CAUGHT_SIGHUP'),
      exitTrapFired: finalMarker.includes('EXIT_TRAP'),
      anyTrapFired: finalMarker.includes('CAUGHT_') || finalMarker.includes('EXIT_TRAP'),
    };

    // Extract timestamps to measure grace period
    const termApiTs = termTs; // when we called the terminate API
    let signalCaughtTs = null;
    let exitTrapTs = null;

    const sigtermMatch = finalMarker.match(/CAUGHT_SIGTERM (\d+)/);
    if (sigtermMatch) {
      signalCaughtTs = parseInt(sigtermMatch[1]);
      // Convert ns to ms for comparison
      analysis.sigtermGraceMs = Math.round((signalCaughtTs / 1_000_000) - termApiTs);
    }

    const exitMatch = finalMarker.match(/EXIT_TRAP (\d+)/);
    if (exitMatch) {
      exitTrapTs = parseInt(exitMatch[1]);
      analysis.exitTrapDelayMs = Math.round((exitTrapTs / 1_000_000) - termApiTs);
    }

    // Determine the termination signal
    let terminationSignal = 'UNKNOWN';
    if (analysis.caughtSigterm) {
      terminationSignal = 'SIGTERM (with grace period — trap fired)';
    } else if (analysis.caughtSighup) {
      terminationSignal = 'SIGHUP (trap fired)';
    } else if (analysis.caughtSigint) {
      terminationSignal = 'SIGINT (trap fired)';
    } else if (!analysis.anyTrapFired && finalMarker.includes('STARTED')) {
      terminationSignal = 'SIGKILL (no trap fired — immediate kill)';
    } else if (!finalMarker.includes('STARTED')) {
      terminationSignal = 'UNKNOWN (marker not found — sandbox may have been destroyed)';
    }

    analysis.terminationSignal = terminationSignal;
    analysis.trapFired = analysis.anyTrapFired;

    log(step8, `Analysis: ${JSON.stringify(analysis, null, 2)}`);
    record(step8, true, Date.now() - t7, analysis);

    // Print summary
    console.log('\n=== TERMINATION SIGNAL ANALYSIS ===');
    console.log(`Signal: ${terminationSignal}`);
    console.log(`Trap fired: ${analysis.trapFired}`);
    if (analysis.sigtermGraceMs !== undefined) {
      console.log(`SIGTERM grace period: ~${analysis.sigtermGraceMs}ms`);
    }
    if (analysis.exitTrapDelayMs !== undefined) {
      console.log(`EXIT trap delay: ~${analysis.exitTrapDelayMs}ms`);
    }
    console.log(`\nFull marker:\n${finalMarker}`);

  } catch (err) {
    recordError('fatal', err);
  } finally {
    // Cleanup
    if (daytona && sb) {
      try {
        log('cleanup', `Destroying sandbox ${sb.id}...`);
        await daytona.delete(sb);
        log('cleanup', 'Sandbox destroyed');
      } catch (err) {
        log('cleanup', `Cleanup failed: ${err.message}`);
      }
    }
  }

  // Print results
  results.totalMs = Date.now() - results.t0;
  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  process.exitCode = results.errors.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
