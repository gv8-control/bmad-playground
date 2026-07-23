// Planning-run machinery for the gen-3 pipeline.
//
// This module implements the planning run's host-side machinery: the launch
// wrapper (runPlanningLaunch), the planning lock (acquire/release/isHeld),
// the per-run status file, delta promotion (tmp+rename into the inbox),
// process-vanished detection (checkPlanningRunVanished), and the resume-mode
// leg (runPlanningResume). The planning agent's prompt is built by
// buildPlanningPrompt; the agent itself is an opencode child process the
// wrapper spawns and blocks on — the same pattern n8n's Execute Command node
// uses (spike-execute-command.md).
//
// Ordering invariant (graph-pipeline.md lines 930-931): record exit code →
// promote → release lock. No window exists where the lock is released with a
// promotion still pending. An empty delta (`ops: []`) is still written and
// still promoted — it distinguishes "planner considered and found nothing to
// change" from "planner never finished" (lines 935-936).
//
// Lock implementation note: the plan calls for `flock` (auto-release on
// process death). Node.js stdlib does not expose flock, and this module
// keeps zero external dependencies. We use an O_EXCL lock file carrying the
// holder's PID, with a PID-alive check for stale-lock recovery. This is
// slightly less robust than flock (no automatic release on process death),
// but the PID check covers the stale case, and checkPlanningRunVanished
// already consults the PID via the status file. The process-vanished path is
// correct for the case it was designed for (a wrapper that genuinely died,
// releasing the lock); the orphaned-child-on-n8n-restart case is documented
// as requiring manual intervention in the initial version
// (spike-execute-command.md F2).

import { exec, execSync } from 'node:child_process';
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicReadJSON, atomicWrite } from './atomic.mjs';
import { captureTrunkSha } from './graph.mjs';
import { planningLockPath, runsDir, inboxDir } from './paths.mjs';

const moduleDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(moduleDir, '../..');

// ─── Planning lock ───────────────────────────────────────────────────────────

/**
 * Acquire the planning lock (non-blocking).
 *
 * Uses an O_EXCL lock file at planningLockPath carrying the holder's PID. If
 * the file exists, the holder's PID is checked for liveness: a dead PID
 * means the lock is stale (the wrapper crashed) and is reclaimed; a live PID
 * means a run is in flight and acquisition fails.
 *
 * Returns `{ acquired: true, fd }` on success (the fd stays open for the
 * run's lifetime — closing it is not what releases the lock; releasePlanningLock
 * unlinks the file). Returns `{ acquired: false, fd: null }` if held.
 *
 * @param {object} [opts]
 * @param {string} [opts.lockPath] - override (for tests)
 * @param {number} [opts.pid] - override the PID written (for tests)
 * @returns {{ acquired: boolean, fd: number|null }}
 */
export function acquirePlanningLock(opts = {}) {
  const lockPath = opts.lockPath || planningLockPath;
  const pid = opts.pid ?? process.pid;
  const fd = tryCreateLockfile(lockPath, pid);
  if (fd !== null) return { acquired: true, fd };
  // Lock file exists — check if the holder is still alive.
  if (isStaleLockfile(lockPath)) {
    // Stale: remove and retry once.
    try { unlinkSync(lockPath); } catch { /* race — another process removed it */ }
    const fd2 = tryCreateLockfile(lockPath, pid);
    if (fd2 !== null) return { acquired: true, fd: fd2 };
  }
  return { acquired: false, fd: null };
}

/**
 * Release the planning lock.
 *
 * Unlinks the lock file. Safe to call with a null/undefined fd (no-op).
 */
export function releasePlanningLock(fd) {
  if (fd === null || fd === undefined) return;
  try { closeSync(fd); } catch { /* already closed */ }
  try { unlinkSync(planningLockPath); } catch { /* already removed */ }
}

/**
 * Liveness probe: is a planning run in flight?
 *
 * Tries to acquire the lock non-blocking; if it succeeds, releases
 * immediately and returns false (not held — the planner is finished or
 * dead). If acquisition fails, returns true (held — planner still running).
 */
export function isPlanningLockHeld() {
  const { acquired, fd } = acquirePlanningLock();
  if (acquired) {
    releasePlanningLock(fd);
    return false;
  }
  return true;
}

function tryCreateLockfile(lockPath, pid) {
  try {
    const fd = openSync(lockPath, 'wx', 0o644);
    try {
      writeFileSync(fd, String(pid));
    } finally {
      // Keep fd open for the holder's lifetime; do not close here.
    }
    return fd;
  } catch (err) {
    if (err && (err.code === 'EEXIST' || err.code === 'EACCES')) return null;
    throw err;
  }
}

function isStaleLockfile(lockPath) {
  let raw;
  try {
    raw = readFileSync(lockPath, 'utf8').trim();
  } catch {
    return false;
  }
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  return !isPidAlive(pid);
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process. EPERM = exists but not ours (treat as alive).
    return err.code === 'EPERM';
  }
}

// ─── Planning-run status file ────────────────────────────────────────────────

/**
 * Atomically write the planning status file to <runDir>/planning-status.json.
 *
 * The status file carries PID, session ID, exit code, and per-leg state. The
 * pass reads it for deadline termination and process-vanished detection.
 */
export function writePlanningStatus(runDir, status) {
  atomicWrite(join(runDir, 'planning-status.json'), JSON.stringify(status, null, 2));
}

/**
 * Read the planning status file. Returns null if missing/malformed.
 */
export function readPlanningStatus(runDir) {
  return atomicReadJSON(join(runDir, 'planning-status.json'), null);
}

// ─── Per-run directory + paths ───────────────────────────────────────────────

/**
 * Returns the per-run directory path: <runsDir>/planning-<planningRunId>/.
 */
export function buildPlanningRunDir(planningRunId) {
  return join(runsDir, `planning-${planningRunId}`);
}

/**
 * Generate a unique planning run ID (timestamp + random).
 */
export function generatePlanningRunId() {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const random = Math.random().toString(16).slice(2, 8);
  return `${dateStr}-${random}`;
}

/**
 * Returns the scratch delta path: <runDir>/delta.json.
 */
export function getScratchDeltaPath(runDir) {
  return join(runDir, 'delta.json');
}

/**
 * Returns the planning log path: <runDir>/planning.log.
 */
export function getPlanningLogPath(runDir) {
  return join(runDir, 'planning.log');
}

// ─── Delta promotion ─────────────────────────────────────────────────────────

/**
 * Promote the scratch delta file to the inbox.
 *
 * Steps: read scratch → parse-check → validate envelope → atomicWrite to
 * <inboxDir>/<planningRunId>.json (tmp+rename on the same filesystem —
 * spike-delta-promotion.md). The wrapper is the only inbox writer.
 *
 * @param {string} scratchPath - the scratch delta path
 * @param {string} inboxDirPath - the inbox directory (defaults to inboxDir)
 * @param {string} planningRunId - the planning run id (filename in the inbox)
 * @returns {{ promoted: boolean, reason?: string, inboxPath?: string }}
 */
export function promoteDelta(scratchPath, inboxDirPath = inboxDir, planningRunId) {
  let raw;
  try {
    raw = readFileSync(scratchPath, 'utf8');
  } catch {
    return { promoted: false, reason: 'missing_file' };
  }
  let delta;
  try {
    delta = JSON.parse(raw);
  } catch {
    return { promoted: false, reason: 'parse_error' };
  }
  if (
    typeof delta !== 'object' || delta === null ||
    typeof delta.planningRunId !== 'string' || delta.planningRunId.length === 0 ||
    typeof delta.mode !== 'string' ||
    !Array.isArray(delta.ops)
  ) {
    return { promoted: false, reason: 'invalid_envelope' };
  }
  const inboxPath = join(inboxDirPath, `${planningRunId}.json`);
  try {
    atomicWrite(inboxPath, raw);
  } catch (err) {
    return { promoted: false, reason: 'write_failed' };
  }
  return { promoted: true, inboxPath };
}

// ─── Planning prompt builder ─────────────────────────────────────────────────

/**
 * Build the per-run prompt for the planning agent.
 *
 * The prompt stays small — trigger, instruction, pointers — and everything
 * else is files the planner is directed to read (graph-pipeline.md lines
 * 1112-1125). The prompt must contain: trigger and mode, snapshot pointer and
 * staleness rule, and output contract (scratch path, op vocabulary, write
 * even when empty).
 *
 * @param {object} opts
 * @param {string} opts.mode - 'expansion' | 'conflict' | 'replan'
 * @param {string} opts.planningRunId
 * @param {string} opts.runDir - the per-run directory (scratch path lives here)
 * @param {string} opts.trunkBranch
 * @param {string} [opts.trunkShaAtT0]
 * @param {string} [opts.instruction] - verbatim human instruction (replan mode)
 * @param {object} [opts.conflict] - conflict details (conflict mode)
 * @param {string} [opts.launchTs] - launch timestamp (ISO)
 * @returns {string} the prompt text
 */
export function buildPlanningPrompt(opts) {
  const {
    mode, planningRunId, runDir, trunkBranch,
    trunkShaAtT0, instruction, conflict, launchTs,
  } = opts;
  const scratchPath = getScratchDeltaPath(runDir);

  const lines = [];
  lines.push('# Planning run');
  lines.push('');
  lines.push(`- planningRunId: ${planningRunId}`);
  lines.push(`- mode: ${mode}`);
  lines.push(`- launchedAt: ${launchTs || new Date().toISOString()}`);
  if (trunkShaAtT0) lines.push(`- trunkShaAtT0: ${trunkShaAtT0}`);
  lines.push('');

  // --- Trigger and mode ---
  lines.push('## Trigger');
  if (mode === 'expansion') {
    lines.push('Expansion: ready nodes are running low (plan-2-ahead policy). Compose chains for upcoming work per the chain-composition guidelines.');
  } else if (mode === 'conflict') {
    lines.push('Conflict: a chain is blocked on a merge conflict with no response yet in the graph. Replan around the conflict.');
    if (conflict) {
      lines.push('');
      lines.push('Conflict details:');
      lines.push('```json');
      lines.push(JSON.stringify(conflict, null, 2));
      lines.push('```');
    }
  } else if (mode === 'replan') {
    lines.push('Replan: human instruction. Execute verbatim:');
    lines.push('');
    lines.push('> ' + (instruction || '(no instruction provided)').split('\n').join('\n> '));
  }
  lines.push('');

  // --- Snapshot pointer and staleness rule ---
  lines.push('## Snapshot and staleness rule');
  lines.push(`- graph state: pipeline3/state/graph.json`);
  lines.push(`- journal (read-only, optional): pipeline3/state/journal.jsonl`);
  lines.push(`- trunk ref: origin/${trunkBranch}`);
  lines.push('');
  lines.push('The delta is validated at fold time against newer state. Touch unclaimed (pending) nodes only — claimed, parked, completed, failed, and abandoned nodes are frozen. Prefer additive changes near nodes likely to be claimed while planning runs.');
  lines.push('');

  // --- Output contract ---
  lines.push('## Output contract');
  lines.push(`Write the delta as a JSON file to this scratch path as your LAST act, even when empty:`);
  lines.push('');
  lines.push('  ' + scratchPath);
  lines.push('');
  lines.push('Envelope fields: `planningRunId`, `mode` ("expansion" | "conflict" | "replan"), `authoredAt` (ISO), `trunkShaAtT0`, `ops` (array, applied in order).');
  lines.push('');
  lines.push('Op vocabulary:');
  lines.push('- `addNode` — full node spec (id, chainId, skill/agent/prompt, deadline, dependsOn, mergeTo, metadata). Ids must be fresh. Do not set status (machinery sets pending).');
  lines.push('- `updateNode` — id plus spec fields to replace (dependsOn rewiring, mergeTo toggle, prompt/deadline change). Target must exist and be pending. Do not set id, chainId, or status.');
  lines.push('- `removeNode` — id. Target must exist and be pending; its edges go with it.');
  lines.push('- `abandonSegment` — chainId. Targets blocked chains (no in-flight nodes). Pending nodes are removed; completed/failed/abandoned stay as history.');
  lines.push('');
  lines.push('An empty `ops: []` is a legal, meaningful delta: you considered and found nothing to change. Write the file anyway — it distinguishes "considered, nothing to change" from "never finished".');
  lines.push('');
  lines.push('Nothing else is shared. Do not write the journal, graph.json, or the inbox — the wrapper promotes the scratch file.');
  lines.push('');

  // --- Standing context files (pointed, not embedded) ---
  lines.push('## Standing context (read these files)');
  lines.push('- pipeline3/state/chain-composition-guidelines.md — advisory chain composition + skill catalog');
  lines.push('- pipeline3/state/graph.json — graph state (the claimed/unclaimed boundary is the most load-bearing fact)');
  lines.push('- pipeline3/state/journal.jsonl — read-only, optional (history beyond the graph digests)');
  lines.push('- the backlog (epics, sprint plan, phase list — whatever the project uses)');
  lines.push('- pipeline3/state/decision-policy.md (if it exists) — exhaust policy before parking with a QUESTION');
  lines.push(`- work docs and code at origin/${trunkBranch} (pinned ref — do not read the dirty working tree)`);

  return lines.join('\n');
}

// ─── Launch wrapper ──────────────────────────────────────────────────────────

/**
 * Build the opencode run command for the planning agent.
 *
 * Isolated storage (separate --dir and storage path) prevents the
 * schema-migration race documented in the concurrency findings (opencode
 * v1.17.20 stores data in SQLite at ~/.local/share/opencode/opencode.db).
 * `--format json` for the event stream; `</dev/null` prevents PTY hang.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} opts.storageDir - isolated opencode storage dir
 * @param {string} [opts.workDir] - opencode --dir (the repo root)
 * @returns {string} the shell command string
 */
export function buildOpencodeCommand(opts) {
  const { prompt, storageDir, workDir } = opts;
  const dirFlag = workDir ? ` --dir ${shellQuote(workDir)}` : '';
  // Isolated storage via env var (opencode respects XDG_DATA_HOME for its db).
  const storageEnv = `XDG_DATA_HOME=${shellQuote(storageDir)}`;
  const promptArg = shellQuote(prompt);
  return `${storageEnv} opencode run${dirFlag} --format json ${promptArg} < /dev/null`;
}

/**
 * The launch wrapper — the core of the planning run. This is what the n8n
 * planning-host workflow's Execute Command node runs (blocking for the run's
 * duration).
 *
 * Steps:
 *  1. Acquire the planning lock (non-blocking). If can't acquire, exit 0
 *     immediately (another run is in flight — a duplicate trigger is harmless).
 *  2. Create the per-run directory.
 *  3. Write the planning status file (PID, startedAt, leg: 1).
 *  4. git fetch origin <trunkBranch> and capture trunkShaAtT0 (fetch MUST
 *     precede the SHA capture — spike-planning-context-staleness.md F2).
 *  5. Build the prompt and opencode command (isolated storage).
 *  6. Spawn the opencode child via child_process.exec (blocks on the child,
 *     same as n8n's Execute Command). Redirect stdout/stderr to a per-run log.
 *  7. Wait for exit. Record the exit code.
 *  8. If exit 0: parse-check the scratch delta; if it parses, promote it.
 *  9. If non-zero: promote nothing (scratch stays for debugging).
 * 10. Update the status file with exit code and leg result.
 * 11. Release the lock.
 * 12. Exit with the child's exit code.
 *
 * Ordering: record exit code → promote → release lock.
 *
 * @param {object} opts
 * @param {string} opts.mode - 'expansion' | 'conflict' | 'replan'
 * @param {string} [opts.planningRunId] - generated if omitted
 * @param {string} [opts.trunkBranch]
 * @param {string} [opts.instruction] - verbatim human instruction (replan)
 * @param {object} [opts.conflict] - conflict details (conflict mode)
 * @param {string} [opts.repoCwd] - git/opencode cwd (defaults to repo root)
 * @param {object} [opts.spawn] - test override: a function(cmd, opts) returning
 *   a child_process ChildProcess (defaults to child_process.exec)
 * @returns {Promise<{ exitCode: number, planningRunId: string, runDir: string, promoted: boolean }>}
 */
export async function runPlanningLaunch(opts) {
  const mode = opts.mode || 'expansion';
  const planningRunId = opts.planningRunId || generatePlanningRunId();
  const trunkBranch = opts.trunkBranch || 'main';
  const cwd = opts.repoCwd || repoRoot;
  const spawn = opts.spawn || exec;

  // 1. Acquire the planning lock.
  const { acquired, fd } = acquirePlanningLock();
  if (!acquired) {
    // Another run is in flight — a duplicate trigger is harmless.
    return { exitCode: 0, planningRunId, runDir: null, promoted: false, duplicate: true };
  }

  let promoted = false;
  let exitCode = 0;
  const runDir = buildPlanningRunDir(planningRunId);

  try {
    // 2. Create the per-run directory.
    mkdirSync(runDir, { recursive: true });

    // 3. Write the initial status file.
    const launchTs = new Date().toISOString();
    writePlanningStatus(runDir, {
      planningRunId,
      mode,
      pid: process.pid,
      startedAt: launchTs,
      leg: 1,
      exitCode: null,
      promoted: false,
    });

    // 4. git fetch + capture trunk SHA (fetch MUST precede capture).
    try {
      execSyncQuiet(`git fetch origin ${trunkBranch}`, cwd);
    } catch {
      // fetch failure is non-fatal — captureTrunkSha returns null on failure
      // and the fold-time staleness check is skipped when trunkShaAtT0 is null.
    }
    const trunkShaAtT0 = captureTrunkSha(trunkBranch, cwd);

    // 5. Build prompt + command.
    const prompt = buildPlanningPrompt({
      mode, planningRunId, runDir, trunkBranch, trunkShaAtT0,
      instruction: opts.instruction, conflict: opts.conflict, launchTs,
    });
    const storageDir = join(runDir, 'opencode-data');
    mkdirSync(storageDir, { recursive: true });
    const cmd = buildOpencodeCommand({
      prompt, storageDir, workDir: cwd,
    });

    // 6-7. Spawn the child and block on it. Redirect output to the per-run log.
    const logPath = getPlanningLogPath(runDir);
    exitCode = await runChild(cmd, cwd, logPath, spawn);

    // 8-9. Promote only on exit 0 and a parseable scratch file.
    const scratchPath = getScratchDeltaPath(runDir);
    if (exitCode === 0 && existsSync(scratchPath)) {
      const result = promoteDelta(scratchPath, inboxDir, planningRunId);
      promoted = result.promoted;
    }

    // 10. Update the status file (record exit code + leg result).
    writePlanningStatus(runDir, {
      planningRunId,
      mode,
      pid: process.pid,
      startedAt: launchTs,
      leg: 1,
      exitCode,
      promoted,
      finishedAt: new Date().toISOString(),
    });
  } finally {
    // 11. Release the lock. Ordering: record exit → promote → release.
    releasePlanningLock(fd);
  }

  // 12. Exit code is returned to the caller (the n8n host workflow sees it).
  return { exitCode, planningRunId, runDir, promoted };
}

/**
 * Resume-mode leg: stream-truncation continue or question-answer resume.
 *
 * Re-triggers the planning-host workflow in resume mode. The wrapper
 * re-acquires the planning lock, runs `opencode run --format json --session <id>`
 * with the answer/continue prompt, and performs the same
 * record-exit-code-then-promote sequence when the leg ends.
 *
 * @param {object} opts
 * @param {string} opts.planningRunId
 * @param {string} opts.runDir - the original per-run directory
 * @param {string} opts.opencodeSessionId
 * @param {string} [opts.answer] - answer text (question resume) or continue prompt
 * @param {string} [opts.mode] - the original run's mode
 * @param {object} [opts.spawn] - test override
 * @returns {Promise<{ exitCode: number, promoted: boolean }>}
 */
export async function runPlanningResume(opts) {
  const { planningRunId, runDir, opencodeSessionId, answer, mode } = opts;
  const spawn = opts.spawn || exec;
  const cwd = opts.repoCwd || repoRoot;

  const { acquired, fd } = acquirePlanningLock();
  if (!acquired) {
    return { exitCode: 0, promoted: false, duplicate: true };
  }

  let promoted = false;
  let exitCode = 0;
  try {
    const resumeTs = new Date().toISOString();
    const prev = readPlanningStatus(runDir) || {};
    writePlanningStatus(runDir, {
      ...prev,
      leg: (prev.leg || 1) + 1,
      resumeStartedAt: resumeTs,
      exitCode: null,
      promoted: false,
    });

    const promptText = answer || 'continue';
    const storageDir = join(runDir, 'opencode-data');
    mkdirSync(storageDir, { recursive: true });
    const storageEnv = `XDG_DATA_HOME=${shellQuote(storageDir)}`;
    const cmd = `${storageEnv} opencode run --format json --session ${shellQuote(opencodeSessionId)} ${shellQuote(promptText)} < /dev/null`;

    const logPath = getPlanningLogPath(runDir);
    exitCode = await runChild(cmd, cwd, logPath, spawn);

    const scratchPath = getScratchDeltaPath(runDir);
    if (exitCode === 0 && existsSync(scratchPath)) {
      const result = promoteDelta(scratchPath, inboxDir, planningRunId);
      promoted = result.promoted;
    }

    writePlanningStatus(runDir, {
      ...prev,
      leg: (prev.leg || 1) + 1,
      resumeStartedAt: resumeTs,
      exitCode,
      promoted,
      finishedAt: new Date().toISOString(),
    });
  } finally {
    releasePlanningLock(fd);
  }

  return { exitCode, promoted };
}

/**
 * Run a child command, redirecting stdout/stderr to a log file, and resolve
 * with the exit code. Mirrors n8n's Execute Command (child_process.exec).
 */
function runChild(cmd, cwd, logPath, spawn) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, maxBuffer: 1024 * 1024 });
    // Redirect output to the per-run log (the 1MB maxBuffer limit means heavy
    // output must go to a file — spike-execute-command.md F1).
    try {
      const logStream = createWriteStream(logPath, { flags: 'w' });
      if (child.stdout) child.stdout.pipe(logStream);
      if (child.stderr) {
        // Merge stderr into the same log.
        child.stderr.pipe(logStream, { end: false });
      }
    } catch {
      // If log redirection fails, the child still runs; output is lost.
    }
    child.on('exit', (code, signal) => {
      if (signal) resolve(128 + signalNumber(signal));
      else resolve(code ?? 0);
    });
    child.on('error', () => resolve(127));
  });
}

function execSyncQuiet(cmd, cwd) {
  // Synchronous git fetch — short, local, fast. Errors propagate to caller.
  execSync(cmd, { cwd, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
}

function signalNumber(signal) {
  const map = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGILL: 4, SIGTRAP: 5,
    SIGABRT: 6, SIGBUS: 7, SIGFPE: 8, SIGKILL: 9, SIGSEGV: 11, SIGTERM: 15 };
  return map[signal] || 0;
}

function shellQuote(s) {
  if (typeof s !== 'string') s = String(s);
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function rmSyncRecursive(p) {
  rmSync(p, { recursive: true, force: true });
}

// ─── Process-vanished detection ──────────────────────────────────────────────

/**
 * Check if a planning run that the journal says is in-flight has actually
 * vanished (the wrapper died, releasing the lock).
 *
 * Logic (graph-pipeline.md lines 1046-1054):
 *  - Find the latest planning_launch event with no corresponding planning_exit.
 *  - If the lock is acquirable AND no exit code is recorded in the status
 *    file → the wrapper died mid-leg. Return { vanished: true, planningRunId }.
 *  - If the lock is acquirable AND an exit code IS recorded → normal exit
 *    awaiting classification. Return { vanished: false }.
 *  - If the lock is NOT acquirable → planner still running. Return
 *    { vanished: false }.
 *
 * IMPORTANT caveat (spike-execute-command.md F2): n8n restart does NOT kill
 * the child. The orphaned child holds the lock, so isPlanningLockHeld returns
 * true, and this function returns { vanished: false }. The process-vanished
 * path does NOT trigger on n8n restart in the initial version. This function
 * is correct for the case it was designed for (a wrapper that genuinely died,
 * releasing the lock).
 *
 * @param {object} _graph - the graph state (unused; reserved for future rules)
 * @param {Array} journal - the parsed journal events (from readJournal)
 * @returns {{ vanished: boolean, planningRunId: string|null }}
 */
export function checkPlanningRunVanished(_graph, journal) {
  const launch = findLatestUnmatchedLaunch(journal);
  if (!launch) return { vanished: false, planningRunId: null };

  // Lock still held → planner still running.
  if (isPlanningLockHeld()) return { vanished: false, planningRunId: null };

  // Lock acquirable. Distinguish vanished from normal-exit-awaiting-classification
  // via the status file's exit code.
  const runDir = buildPlanningRunDir(launch.planningRunId);
  const status = readPlanningStatus(runDir);
  if (status && typeof status.exitCode === 'number') {
    // Exit recorded — normal exit awaiting classification, not a vanished process.
    return { vanished: false, planningRunId: null };
  }
  // Lock acquirable + no exit code → wrapper died mid-leg.
  return { vanished: true, planningRunId: launch.planningRunId };
}

/**
 * Find the latest planning_launch event in the journal that has no
 * corresponding planning_exit event (matched by planningRunId).
 */
function findLatestUnmatchedLaunch(journal) {
  if (!Array.isArray(journal)) return null;
  const exited = new Set();
  for (const ev of journal) {
    if (ev && ev.type === 'planning_exit' && ev.planningRunId) {
      exited.add(ev.planningRunId);
    }
  }
  for (let i = journal.length - 1; i >= 0; i--) {
    const ev = journal[i];
    if (ev && ev.type === 'planning_launch' && ev.planningRunId && !exited.has(ev.planningRunId)) {
      return ev;
    }
  }
  return null;
}

// ─── Self-test ───────────────────────────────────────────────────────────────
// Run with: node pipeline3/lib/planning.mjs

if (import.meta.url === `file://${process.argv[1]}`) {
  let tests = 0, failures = 0;
  function assert(name, cond) {
    tests++;
    if (cond) { console.log(`  \u2713 ${name}`); }
    else { failures++; console.error(`  \u2717 ${name}`); }
  }

  // Use a tmp state dir so the self-test never touches real state.
  // NOTE: paths.mjs reads PIPELINE3_STATE_DIR at import time, so setting it
  // here only affects paths computed lazily. The lock/run paths still resolve
  // to the real state dir, but runs/ and inbox/ are gitignored and the test
  // cleans up every artifact it creates (lock file + runDirs).
  const createdRunDirs = [];
  function trackRunDir(d) { createdRunDirs.push(d); return d; }

  console.log('\nplanning.mjs self-test');

  // --- Lock acquire/release cycle ---
  console.log('\nlock acquire/release');
  // Clean slate.
  try { unlinkSync(planningLockPath); } catch { /* may not exist */ }
  const a = acquirePlanningLock();
  assert('acquires when free', a.acquired === true && a.fd !== null);
  const b = acquirePlanningLock();
  assert('refuses when held', b.acquired === false && b.fd === null);
  releasePlanningLock(a.fd);
  const c = acquirePlanningLock();
  assert('re-acquires after release', c.acquired === true && c.fd !== null);
  releasePlanningLock(c.fd);

  // --- Lock is held check ---
  console.log('\nisPlanningLockHeld');
  assert('not held when free', isPlanningLockHeld() === false);
  const held = acquirePlanningLock();
  assert('held after acquire', isPlanningLockHeld() === true);
  releasePlanningLock(held.fd);
  assert('not held after release', isPlanningLockHeld() === false);

  // --- Stale lock recovery (dead PID) ---
  console.log('\nstale lock recovery');
  writeFileSync(planningLockPath, '999999'); // a PID that does not exist
  const stale = acquirePlanningLock();
  assert('reclaims stale lock (dead PID)', stale.acquired === true);
  releasePlanningLock(stale.fd);

  // --- Delta promotion ---
  console.log('\ndelta promotion');
  const scratch = join(repoRoot, '.tmp-planning-scratch.json');
  const validDelta = {
    planningRunId: 'p1', mode: 'expansion', authoredAt: '2026-07-23T00:00:00Z',
    trunkShaAtT0: 'abc', ops: [],
  };
  writeFileSync(scratch, JSON.stringify(validDelta));
  const tmpInbox = join(repoRoot, '.tmp-planning-inbox');
  mkdirSync(tmpInbox, { recursive: true });
  const pr1 = promoteDelta(scratch, tmpInbox, 'p1');
  assert('valid delta promoted', pr1.promoted === true);
  assert('inbox path returned', pr1.inboxPath && pr1.inboxPath.endsWith('p1.json'));
  assert('inbox file exists', existsSync(pr1.inboxPath));

  writeFileSync(scratch, '{not json');
  const pr2 = promoteDelta(scratch, tmpInbox, 'p2');
  assert('parse error not promoted', pr2.promoted === false && pr2.reason === 'parse_error');

  const missingPath = join(repoRoot, '.tmp-planning-nope.json');
  const pr3 = promoteDelta(missingPath, tmpInbox, 'p3');
  assert('missing file not promoted', pr3.promoted === false && pr3.reason === 'missing_file');

  writeFileSync(scratch, JSON.stringify({ foo: 'bar' }));
  const pr4 = promoteDelta(scratch, tmpInbox, 'p4');
  assert('invalid envelope not promoted', pr4.promoted === false && pr4.reason === 'invalid_envelope');

  // --- Planning prompt builder ---
  console.log('\nplanning prompt builder');
  const runDir = trackRunDir(buildPlanningRunDir('p1'));
  const prompt = buildPlanningPrompt({
    mode: 'replan', planningRunId: 'p1', runDir, trunkBranch: 'main',
    trunkShaAtT0: 'abc123', instruction: 'replan the onboarding flow',
  });
  assert('prompt has mode', prompt.includes('mode: replan'));
  assert('prompt has trigger (replan instruction)', prompt.includes('replan the onboarding flow'));
  assert('prompt has output contract (scratch path)', prompt.includes(getScratchDeltaPath(runDir)));
  assert('prompt has op vocabulary (addNode)', prompt.includes('addNode'));
  assert('prompt has op vocabulary (updateNode)', prompt.includes('updateNode'));
  assert('prompt has op vocabulary (removeNode)', prompt.includes('removeNode'));
  assert('prompt has op vocabulary (abandonSegment)', prompt.includes('abandonSegment'));
  assert('prompt has empty-ops instruction', prompt.includes('empty') && prompt.includes('ops: []'));
  assert('prompt has graph.json pointer', prompt.includes('graph.json'));
  assert('prompt has journal pointer', prompt.includes('journal.jsonl'));
  assert('prompt has trunk ref', prompt.includes('origin/main'));
  assert('prompt has staleness rule', prompt.includes('unclaimed') && prompt.includes('frozen'));

  // --- Process-vanished detection ---
  console.log('\nprocess-vanished detection');
  // No in-flight run.
  assert('no launch → not vanished', checkPlanningRunVanished({}, []).vanished === false);

  // In-flight run, lock held → not vanished.
  const held2 = acquirePlanningLock({ lockPath: planningLockPath });
  const journal1 = [{ type: 'planning_launch', planningRunId: 'pv1', at: '2026-07-23T00:00:00Z' }];
  const r1 = checkPlanningRunVanished({}, journal1);
  assert('in-flight + lock held → not vanished', r1.vanished === false);
  releasePlanningLock(held2.fd);

  // In-flight run, lock acquirable, no exit code → vanished.
  // Use a fresh planningRunId whose runDir has no status file.
  const vanishedId = 'vanished-' + Date.now();
  const journal2 = [{ type: 'planning_launch', planningRunId: vanishedId, at: '2026-07-23T00:00:00Z' }];
  const r2 = checkPlanningRunVanished({}, journal2);
  assert('in-flight + lock free + no exit → vanished', r2.vanished === true);
  assert('vanished returns planningRunId', r2.planningRunId === vanishedId);

  // In-flight run, lock acquirable, exit code recorded → not vanished (normal exit).
  const exitId = 'exit-' + Date.now();
  const exitRunDir = trackRunDir(buildPlanningRunDir(exitId));
  mkdirSync(exitRunDir, { recursive: true });
  writePlanningStatus(exitRunDir, { planningRunId: exitId, exitCode: 0, promoted: true });
  const journal3 = [{ type: 'planning_launch', planningRunId: exitId, at: '2026-07-23T00:00:00Z' }];
  const r3 = checkPlanningRunVanished({}, journal3);
  assert('in-flight + lock free + exit recorded → not vanished', r3.vanished === false);

  // Launch with matching exit → not vanished (matched).
  const journal4 = [
    { type: 'planning_launch', planningRunId: 'matched', at: '2026-07-23T00:00:00Z' },
    { type: 'planning_exit', planningRunId: 'matched', at: '2026-07-23T00:10:00Z' },
  ];
  const r4 = checkPlanningRunVanished({}, journal4);
  assert('matched launch+exit → not vanished', r4.vanished === false);

  // --- Helpers ---
  console.log('\nhelpers');
  const rid = generatePlanningRunId();
  assert('planningRunId is non-empty', rid && rid.length > 0);
  assert('planningRunId is unique-ish', generatePlanningRunId() !== rid);
  assert('buildPlanningRunDir format', buildPlanningRunDir('xyz').endsWith('planning-xyz'));
  assert('getScratchDeltaPath format', getScratchDeltaPath('/r').endsWith('delta.json'));
  assert('getPlanningLogPath format', getPlanningLogPath('/r').endsWith('planning.log'));

  // Cleanup all artifacts the self-test created.
  try { unlinkSync(planningLockPath); } catch { /* may not exist */ }
  for (const d of createdRunDirs) {
    try { rmSyncRecursive(d); } catch { /* best-effort */ }
  }
  try { unlinkSync(join(repoRoot, '.tmp-planning-scratch.json')); } catch { /* may not exist */ }
  try { unlinkSync(join(repoRoot, '.tmp-planning-nope.json')); } catch { /* may not exist */ }
  try { rmSyncRecursive(join(repoRoot, '.tmp-planning-inbox')); } catch { /* may not exist */ }
  console.log(`\n${tests - failures}/${tests} passed`);
  if (failures > 0) {
    console.error('\u2717 self-test FAILED');
    process.exit(1);
  } else {
    console.log('\u2705 self-test passed');
  }
}
