#!/usr/bin/env node
/**
 * Spike: n8n Execute Command — blocking for minutes + child death on restart
 *
 * Verifies assumption #5 from docs/todo/graph-pipeline.md:
 *
 *   Both the planning-host and merge-queue workflows use Execute Command to
 *   run a wrapper that blocks for the run's duration (minutes). This assumes
 *   n8n does not kill long-running Execute Command nodes. The process-vanished
 *   recovery path assumes "a local planning run dies when n8n restarts, since
 *   the run is a child of its host workflow's Execute Command."
 *
 * Two phases:
 *
 *   Phase 1 — blocking: replicate the exact mechanism the Execute Command node
 *   uses (child_process.exec with no timeout option) and verify it blocks for
 *   the full duration without timing out. The n8n REST API cannot execute the
 *   Execute Command node programmatically (it is disabled by default and the
 *   internal execution path does not run it via the REST run endpoint), so this
 *   phase tests the underlying mechanism directly — the same `child_process.exec`
 *   call the node's source code makes.
 *
 *   Phase 2 — child death on restart: spawn a child process via the same
 *   mechanism, then simulate n8n restart by killing the parent process (SIGTERM,
 *   the signal pm2 sends on restart). Check whether the child survives (orphaned)
 *   or dies (killed by signal propagation or process-group teardown).
 *
 * Source code analysis (n8n v2.26.8) confirms the mechanism:
 *   - ExecuteCommand.node.js uses child_process.exec(command, {cwd}, callback)
 *   - No timeout option passed → default is 0 (no timeout, blocks indefinitely)
 *   - No killSignal option → default is 'SIGTERM'
 *   - ActiveExecutions.shutdown(cancelAll=false) does NOT cancel running
 *     executions on graceful shutdown
 *   - base-command.js: SIGTERM → shutdownService.shutdown() → 30s force-exit
 *   - No explicit child process cleanup handler registered anywhere
 *
 * Usage:
 *   node spike-execute-command.js
 *
 * No external dependencies required — uses only Node.js stdlib.
 */

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Constants ─────────────────────────────────────────────────────────────

// Phase 1: sleep 30s — long enough to prove "blocks for minutes" behavior
// without wasting 5 minutes of spike time. The source code analysis already
// confirms child_process.exec() has no default timeout (timeout=0), so 30s
// is sufficient to demonstrate the absence of a shorter default.
const PHASE1_SLEEP_S = 30;

// Phase 2: the child sleeps 20s — long enough to kill the parent mid-sleep
// and observe whether the child survives or dies.
const PHASE2_SLEEP_S = 20;
const PHASE2_KILL_DELAY_S = 5; // wait this long before killing the parent
const PHASE2_POST_KILL_WAIT_S = 25; // wait this long after kill before checking

// Marker files on the host filesystem
const MARKER_DIR = '/tmp/spike-execute-command';
const MARKER_STARTED = path.join(MARKER_DIR, 'started.pid');
const MARKER_SURVIVED = path.join(MARKER_DIR, 'survived');
const MARKER_KILLED = path.join(MARKER_DIR, 'killed');

// ─── Utilities ─────────────────────────────────────────────────────────────

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function elapsed(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Check if a process is alive by PID.
 * @param {number} pid
 * @returns {boolean}
 */
function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the parent PID of a process.
 * @param {number} pid
 * @returns {number|null}
 */
function getParentPid(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    // /proc/PID/stat: pid (comm) state ppid ...
    // The comm field can contain spaces and parens, so parse from the end
    const match = stat.match(/\)\s+\S+\s+(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

/**
 * Get the process group ID of a process.
 * @param {number} pid
 * @returns {number|null}
 */
function getPgid(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    // /proc/PID/stat: pid (comm) state ppid pgrp ...
    const match = stat.match(/\)\s+\S+\s+\d+\s+\d+\s+(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

/**
 * Read the comm field of a process.
 * @param {number} pid
 * @returns {string|null}
 */
function getComm(pid) {
  try {
    return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
  } catch {
    return null;
  }
}

// ─── Phase 1: blocking for minutes ─────────────────────────────────────────

/**
 * Phase 1: verify that child_process.exec() (the exact mechanism the Execute
 * Command node uses) blocks for the full duration without timing out.
 *
 * The Execute Command node's source code does:
 *   exec(command, { cwd: process.cwd() }, callback)
 *
 * No timeout option is passed. Node.js child_process.exec() defaults to
 * timeout=0 (no timeout). This phase confirms that empirically.
 */
async function phase1() {
  console.log('\n=== Phase 1: child_process.exec blocks for 30s (no timeout) ===\n');

  const command = `sleep ${PHASE1_SLEEP_S} && echo PHASE1_DONE`;
  log('phase1', `Running: ${command}`);
  log('phase1', 'This replicates exactly what the Execute Command node does:');
  log('phase1', '  exec(command, { cwd: process.cwd() }, callback) — no timeout option');

  const t0 = Date.now();
  let timedOut = false;
  let exitCode = null;
  let stdout = '';
  let stderr = '';

  // Replicate the exact call from ExecuteCommand.node.js
  const child = exec(command, { cwd: process.cwd() }, (error, out, err) => {
    stdout = (out || '').trim();
    stderr = (err || '').trim();
    if (error) {
      exitCode = error.code ?? 1;
    }
  });

  // The 'exit' event gives us the exit code
  child.on('exit', (code) => {
    exitCode = code ?? 0;
  });

  // Wait for the child to exit (with a generous timeout for safety)
  const timeoutMs = (PHASE1_SLEEP_S + 30) * 1000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exitCode !== null) break;
    await sleep(1000);
  }

  const duration = Date.now() - t0;

  if (exitCode === null) {
    // Still running after the generous timeout — kill it
    child.kill('SIGKILL');
    log('phase1', `ERROR: child did not exit within ${timeoutMs / 1000}s`);
    return { pass: false, error: 'child did not exit', duration };
  }

  const blockedLongEnough = duration >= PHASE1_SLEEP_S * 1000 * 0.9; // at least 90% of sleep
  const hasDoneInOutput = stdout.includes('PHASE1_DONE');
  const cleanExit = exitCode === 0;

  log('phase1', `Duration: ${elapsed(duration)} (expected ~${PHASE1_SLEEP_S}s)`);
  log('phase1', `stdout: "${stdout}"`);
  log('phase1', `stderr: "${stderr}"`);
  log('phase1', `exitCode: ${exitCode}`);
  log('phase1', `Blocked long enough (>=90% of sleep): ${blockedLongEnough}`);
  log('phase1', `Output contains PHASE1_DONE: ${hasDoneInOutput}`);
  log('phase1', `Clean exit (code 0): ${cleanExit}`);

  const pass = blockedLongEnough && hasDoneInOutput && cleanExit;
  log('phase1', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);

  return {
    pass,
    duration,
    stdout,
    stderr,
    exitCode,
    blockedLongEnough,
    hasDoneInOutput,
    cleanExit,
  };
}

// ─── Phase 2: child death on parent kill (simulating n8n restart) ───────────

/**
 * Phase 2: verify what happens to the child process when the parent is killed.
 *
 * n8n restart (via `pm2 restart n8n`) sends SIGTERM to the n8n process.
 * The Execute Command node spawns a child via child_process.exec(), which
 * internally uses /bin/sh -c. The question: does the child die when the
 * parent receives SIGTERM?
 *
 * This phase:
 *   1. Spawns a "parent" Node.js process that itself spawns a child via exec()
 *      (simulating n8n's Execute Command node).
 *   2. The child writes marker files: "started" immediately, "survived" after
 *      the sleep, "killed" if it catches a signal.
 *   3. After PHASE2_KILL_DELAY_S, kills the parent with SIGTERM (what pm2 does).
 *   4. Waits PHASE2_POST_KILL_WAIT_S, then checks which markers exist and
 *      whether the child is still alive.
 *
 * The parent process is a separate Node.js script (phase2_parent.js) that
 * spawns the child and waits. This isolates the test: killing the parent
 * simulates n8n being killed by pm2.
 */
async function phase2() {
  console.log('\n=== Phase 2: child process fate on parent SIGTERM (simulating n8n restart) ===\n');

  // Clean up markers
  execSync(`rm -rf ${MARKER_DIR}`);
  fs.mkdirSync(MARKER_DIR, { recursive: true });

  // Write the parent script that spawns the child via exec()
  const parentScript = path.join(MARKER_DIR, 'parent.js');
  const childCommand = [
    `echo $$ > ${MARKER_STARTED}`,
    `trap 'echo "SIGTERM at $(date)" > ${MARKER_KILLED}; exit 143' TERM`,
    `trap 'echo "SIGINT at $(date)" > ${MARKER_KILLED}; exit 130' INT`,
    `sleep ${PHASE2_SLEEP_S}`,
    `echo "survived at $(date)" > ${MARKER_SURVIVED}`,
  ].join('; ');

  const parentCode = `
const { exec } = require('child_process');
const fs = require('fs');

// Replicate the Execute Command node's exact mechanism:
// exec(command, { cwd: process.cwd() }, callback)
const child = exec(${JSON.stringify(childCommand)}, { cwd: process.cwd() }, (error, stdout, stderr) => {
  if (error) {
    fs.writeFileSync(${JSON.stringify(path.join(MARKER_DIR, 'parent-callback'))}, 'error: ' + error.message);
  } else {
    fs.writeFileSync(${JSON.stringify(path.join(MARKER_DIR, 'parent-callback'))}, 'ok: ' + stdout.trim());
  }
});

child.on('exit', (code) => {
  fs.writeFileSync(${JSON.stringify(path.join(MARKER_DIR, 'child-exit'))}, 'exit code: ' + code);
});

// Write our own PID so the test can find us
fs.writeFileSync(${JSON.stringify(path.join(MARKER_DIR, 'parent.pid'))}, String(process.pid));

// Keep the parent alive until the child exits
child.on('exit', () => process.exit(0));
`;

  fs.writeFileSync(parentScript, parentCode);
  log('phase2', `Parent script written to ${parentScript}`);
  log('phase2', `Child command: ${childCommand}`);

  // Spawn the parent process
  log('phase2', 'Spawning parent process...');
  const parent = spawn('node', [parentScript], {
    stdio: 'pipe',
    detached: false, // child is in the same process group as parent
  });

  const parentPid = parent.pid;
  log('phase2', `Parent PID: ${parentPid}`);

  // Wait for the child to write the "started" marker
  log('phase2', 'Waiting for child process to start...');
  let startedPid = null;
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    if (fs.existsSync(MARKER_STARTED)) {
      startedPid = fs.readFileSync(MARKER_STARTED, 'utf8').trim();
      log('phase2', `Child process started: PID ${startedPid}`);
      break;
    }
  }
  if (!startedPid) {
    throw new Error('Child process did not write "started" marker within 15s');
  }

  // Verify the child is running and check process relationships
  const childAliveBefore = processAlive(parseInt(startedPid, 10));
  const childParent = getParentPid(parseInt(startedPid, 10));
  const childPgid = getPgid(parseInt(startedPid, 10));
  const parentPgid = getPgid(parentPid);
  log('phase2', `Child alive before kill: ${childAliveBefore}`);
  log('phase2', `Child PID: ${startedPid}, child's parent PID: ${childParent}`);
  log('phase2', `Child PGID: ${childPgid}, parent PGID: ${parentPgid}`);
  log('phase2', `Child is direct child of parent: ${childParent === parentPid}`);
  log('phase2', `Child is in same process group as parent: ${childPgid === parentPgid}`);

  // Wait a bit more to ensure the child is in the sleep
  log('phase2', `Waiting ${PHASE2_KILL_DELAY_S}s before killing parent (simulating pm2 restart)...`);
  await sleep(PHASE2_KILL_DELAY_S * 1000);

  // Kill the parent with SIGTERM (what pm2 sends on restart)
  log('phase2', `Sending SIGTERM to parent (PID ${parentPid}) — this is what pm2 does on restart...`);
  const t0 = Date.now();
  try {
    process.kill(parentPid, 'SIGTERM');
  } catch (err) {
    log('phase2', `Failed to kill parent: ${err.message}`);
  }

  // Wait for the parent to die
  let parentDied = false;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    if (!processAlive(parentPid)) {
      parentDied = true;
      log('phase2', `Parent died ${elapsed(Date.now() - t0)} after SIGTERM`);
      break;
    }
  }
  if (!parentDied) {
    log('phase2', `Parent did not die within 15s of SIGTERM — force killing...`);
    try { process.kill(parentPid, 'SIGKILL'); } catch {}
  }

  // Monitor the child process every second after the kill
  log('phase2', `Monitoring child process for ${PHASE2_POST_KILL_WAIT_S}s after parent kill...`);
  const childPidInt = parseInt(startedPid, 10);
  const monitorLog = [];
  for (let i = 0; i < PHASE2_POST_KILL_WAIT_S; i++) {
    await sleep(1000);
    const alive = processAlive(childPidInt);
    const ppid = getParentPid(childPidInt);
    const comm = getComm(childPidInt);
    const survived = fs.existsSync(MARKER_SURVIVED);
    const killed = fs.existsSync(MARKER_KILLED);
    monitorLog.push({ t: i + 1, alive, ppid, comm, survived, killed });
    if (i < 5 || !alive || survived || killed) {
      log('phase2', `t=${i + 1}s: alive=${alive} ppid=${ppid} comm=${comm} survived=${survived} killed=${killed}`);
    }
    if (!alive && i > 3) break; // child is dead, no need to keep waiting
  }

  // Check markers
  const startedExists = fs.existsSync(MARKER_STARTED);
  const survivedExists = fs.existsSync(MARKER_SURVIVED);
  const killedExists = fs.existsSync(MARKER_KILLED);
  const childAliveAfter = processAlive(parseInt(startedPid, 10));

  let startedContent = '';
  let survivedContent = '';
  let killedContent = '';
  if (startedExists) startedContent = fs.readFileSync(MARKER_STARTED, 'utf8').trim();
  if (survivedExists) survivedContent = fs.readFileSync(MARKER_SURVIVED, 'utf8').trim();
  if (killedExists) killedContent = fs.readFileSync(MARKER_KILLED, 'utf8').trim();

  log('phase2', '--- Results ---');
  log('phase2', `started marker: ${startedExists ? startedContent : 'NOT FOUND'}`);
  log('phase2', `survived marker: ${survivedExists ? survivedContent : 'NOT FOUND'}`);
  log('phase2', `killed marker: ${killedExists ? killedContent : 'NOT FOUND'}`);
  log('phase2', `Child process alive after parent kill: ${childAliveAfter}`);

  // Determine the outcome
  let outcome;
  if (survivedExists) {
    outcome = 'SURVIVED — child process outlived parent SIGTERM (orphaned, adopted by init)';
  } else if (killedExists) {
    outcome = 'KILLED — child received a signal during parent shutdown';
  } else if (!childAliveAfter) {
    outcome = 'DIED_SILENTLY — child died without writing a marker (killed without signal delivery)';
  } else {
    outcome = 'STILL_RUNNING — child still alive but sleep not finished yet';
  }
  log('phase2', `OUTCOME: ${outcome}`);

  // Also check: was the child reparented to init (PID 1) after parent died?
  const childParentAfter = getParentPid(parseInt(startedPid, 10));
  const reparentedToInit = childParentAfter === 1;
  log('phase2', `Child's parent PID after kill: ${childParentAfter} (reparented to init: ${reparentedToInit})`);

  // Clean up any surviving child
  if (childAliveAfter) {
    log('phase2', `Cleaning up surviving child (PID ${startedPid})...`);
    try { process.kill(parseInt(startedPid, 10), 'SIGKILL'); } catch {}
  }

  return {
    parentPid,
    childPid: startedPid,
    childParentPidBefore: childParent,
    childParentPidAfter: childParentAfter,
    childPgid,
    parentPgid,
    childIsDirectChildOfParent: childParent === parentPid,
    childInSameProcessGroup: childPgid === parentPgid,
    childAliveBefore,
    childAliveAfter,
    startedExists,
    survivedExists,
    killedExists,
    startedContent,
    survivedContent,
    killedContent,
    reparentedToInit,
    outcome,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────

const { execSync } = require('child_process');

async function main() {
  const results = {
    sourceCodeAnalysis: {
      n8nVersion: '2.26.8',
      executeCommandImplementation: 'child_process.exec(command, { cwd: process.cwd() }, callback)',
      timeoutOption: 'not passed — defaults to 0 (no timeout, blocks indefinitely)',
      maxBufferDefault: '1MB (1024*1024) — stdout exceeding this throws "stdout maxBuffer length exceeded"',
      killSignalDefault: 'SIGTERM',
      shutdownBehavior: 'ActiveExecutions.shutdown(cancelAll=false) — does NOT cancel running executions; waits for them to finish',
      gracefulShutdownTimeout: '30s — n8n force-exits after 30s if shutdown stalls',
      childProcessCleanup: 'No explicit kill of child processes on shutdown — child_process.exec() does not register a cleanup handler',
      sigtermHandler: 'base-command.js: process.once("SIGTERM", onTerminationSignal("SIGTERM")) → shutdownService.shutdown() → stopProcess()',
      stopProcess: 'start.js stopProcess() calls ActiveExecutions.shutdown() (without cancelAll), then exits',
    },
    phase1: null,
    phase2: null,
  };

  // Phase 1: blocking
  try {
    results.phase1 = await phase1();
  } catch (err) {
    log('phase1', `FATAL: ${err.message}`);
    results.phase1 = { pass: false, error: err.message };
  }

  // Phase 2: child death on parent kill
  try {
    results.phase2 = await phase2();
  } catch (err) {
    log('phase2', `FATAL: ${err.message}`);
    results.phase2 = { error: err.message };
  }

  // Cleanup
  try { execSync(`rm -rf ${MARKER_DIR}`); } catch {}

  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Phase 1 (blocking): ${results.phase1?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 2 (child fate): ${results.phase2?.outcome || results.phase2?.error || 'UNKNOWN'}`);

  if (results.phase1 && !results.phase1.pass) {
    process.exitCode = 1;
  }
}

// Run as script, export as module.
if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}

module.exports = { phase1, phase2 };
