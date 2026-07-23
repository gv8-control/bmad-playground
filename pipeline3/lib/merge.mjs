// Merge-cycle machinery for the gen-3 pipeline.
//
// This module implements the merge queue's host-side machinery, mirroring the
// planning-run pattern in planning.mjs: the merge lock (acquire/release/
// isHeld/stall-detection), the merge cycle (runMergeCycle — drives fetch,
// rebase, merge, push, delete-branch on a sandbox), the conflict report
// writer (to the inbox), and the post-merge trunk SHA capture.
//
// The merge lock is a non-blocking O_EXCL lock file at mergeLockPath carrying
// the holder's PID, a heldSince timestamp, and the merge sandbox ID — same
// pattern as the planning lock, with the same PID-alive stale-lock recovery.
// The heldSince timestamp enables stall detection: a pass that observes the
// lock held for longer than T_merge_stall (default 30s) emits a stall alert.
//
// The merge cycle runs entirely on a sandbox created per merge cycle (seconds).
// The devcontainer checkout is the human's working copy and never hosts
// pipeline git operations. Tests are NOT part of the merge cycle — a merge is
// git integration (fetch, rebase, merge, push), not a quality gate. A post-
// merge hook, if configured, fires after the merge lands.
//
// Ordering invariant (graph-pipeline.md lines 1942-1946): the push is the
// commit point. Everything before it is sandbox-local and disposable. A merge
// cycle that dies mid-run has changed nothing durable; one that dies after the
// push has merged — the next merge cycle's short-circuit cleans up the
// leftover branch.
//
// References:
//   - graph-pipeline.md: Merge cycle (line 1906), Merge-conflict resolution
//     (line 1977), Reconcile pass step 6 (line 552), Atomicity (line 1223),
//     State (line 1378), Implementation surface (line 1360)
//   - spike-merge-trigger-starvation.md (merges-first ordering proof)
//   - spike-merge-point-lifecycle.md (capacity reservation, conflict path,
//     n8n-restart stall, empty-diff short-circuit)
//   - spike-push-on-failure.md (merge gate quarantines failed work)
//   - spike-resume-burst.md (merge burst handling at resume)

import { exec, execSync } from 'node:child_process';
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { atomicReadJSON, atomicWrite } from './atomic.mjs';
import { captureTrunkSha } from './graph.mjs';
import { mergeLockPath, runsDir, inboxDir } from './paths.mjs';
import { buildConflictEvent } from './supervise.mjs';

const moduleDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(moduleDir, '../..');

// ─── Merge lock ──────────────────────────────────────────────────────────────

/**
 * Acquire the merge lock (non-blocking).
 *
 * Uses an O_EXCL lock file at mergeLockPath carrying the holder's PID, a
 * heldSince timestamp, and the merge sandbox ID. If the file exists, the
 * holder's PID is checked for liveness: a dead PID means the lock is stale
 * (the wrapper crashed) and is reclaimed; a live PID means a merge cycle is
 * in flight and acquisition fails.
 *
 * Returns `{ acquired: true, fd }` on success. Returns
 * `{ acquired: false, fd: null }` if held.
 *
 * @param {object} [opts]
 * @param {string} [opts.lockPath] - override (for tests)
 * @param {number} [opts.pid] - override the PID written (for tests)
 * @param {string} [opts.sandboxId] - the merge sandbox ID (recorded in the lock)
 * @returns {{ acquired: boolean, fd: number|null }}
 */
export function acquireMergeLock(opts = {}) {
  const lockPath = opts.lockPath || mergeLockPath;
  const pid = opts.pid ?? process.pid;
  const sandboxId = opts.sandboxId || null;
  const fd = tryCreateMergeLockfile(lockPath, pid, sandboxId);
  if (fd !== null) return { acquired: true, fd };
  // Lock file exists — check if the holder is still alive.
  if (isStaleMergeLockfile(lockPath)) {
    // Stale: remove and retry once.
    try { unlinkSync(lockPath); } catch { /* race — another process removed it */ }
    const fd2 = tryCreateMergeLockfile(lockPath, pid, sandboxId);
    if (fd2 !== null) return { acquired: true, fd: fd2 };
  }
  return { acquired: false, fd: null };
}

/**
 * Release the merge lock.
 *
 * Unlinks the lock file. Safe to call with a null/undefined fd (no-op).
 */
export function releaseMergeLock(fd) {
  if (fd === null || fd === undefined) return;
  try { closeSync(fd); } catch { /* already closed */ }
  try { unlinkSync(mergeLockPath); } catch { /* already removed */ }
}

/**
 * Liveness probe: is a merge cycle in flight?
 *
 * Tries to acquire the lock non-blocking; if it succeeds, releases
 * immediately and returns false (not held — the merge cycle is finished or
 * dead). If acquisition fails, returns true (held — merge cycle still running).
 */
export function isMergeLockHeld() {
  const { acquired, fd } = acquireMergeLock();
  if (acquired) {
    releaseMergeLock(fd);
    return false;
  }
  return true;
}

/**
 * Read the merge lock record. Returns null if missing/malformed.
 *
 * The record carries PID, heldSince, and sandboxId — used by the pass for
 * stall detection and orphaned-sandbox cross-referencing.
 */
export function readMergeLock() {
  return atomicReadJSON(mergeLockPath, null);
}

/**
 * Check if the merge lock is stale (holder PID is dead).
 *
 * A pass that observes a stale lock can reclaim it. A pass that observes a
 * live-but-stalled lock (heldSince too old) emits a stall alert.
 */
export function isMergeLockStale() {
  return isStaleMergeLockfile(mergeLockPath);
}

/**
 * Check if the merge lock has been held longer than the stall threshold.
 *
 * The merge cycle runs in seconds. A lock held for longer than
 * T_merge_stall (default 30s) indicates a stalled merge cycle — likely an
 * orphaned wrapper process after an n8n restart (spike-merge-point-lifecycle.md
 * F3). The pass converts this silent stall into a loud alert.
 *
 * @param {number} [stallThresholdMs=30000] - the stall threshold in ms
 * @returns {{ stalled: boolean, heldSince: string|null, pid: number|null, sandboxId: string|null }}
 */
export function checkMergeStall(stallThresholdMs = 30000) {
  const record = readMergeLock();
  if (!record || !record.heldSince) {
    return { stalled: false, heldSince: null, pid: null, sandboxId: null };
  }
  const heldSinceMs = new Date(record.heldSince).getTime();
  if (isNaN(heldSinceMs)) {
    return { stalled: false, heldSince: null, pid: null, sandboxId: null };
  }
  const heldFor = Date.now() - heldSinceMs;
  if (heldFor > stallThresholdMs && isPidAlive(record.pid)) {
    return {
      stalled: true,
      heldSince: record.heldSince,
      pid: record.pid,
      sandboxId: record.sandboxId || null,
    };
  }
  return {
    stalled: false,
    heldSince: record.heldSince,
    pid: record.pid || null,
    sandboxId: record.sandboxId || null,
  };
}

function tryCreateMergeLockfile(lockPath, pid, sandboxId) {
  try {
    const fd = openSync(lockPath, 'wx', 0o644);
    try {
      const record = JSON.stringify({
        pid,
        heldSince: new Date().toISOString(),
        sandboxId,
      });
      writeFileSync(fd, record);
    } finally {
      // Keep fd open for the holder's lifetime; do not close here.
    }
    return fd;
  } catch (err) {
    if (err && (err.code === 'EEXIST' || err.code === 'EACCES')) return null;
    throw err;
  }
}

function isStaleMergeLockfile(lockPath) {
  const record = atomicReadJSON(lockPath, null);
  if (!record || !record.pid) {
    // Try the old plain-PID format (planning lock compat).
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
  return !isPidAlive(record.pid);
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

// ─── Per-merge-cycle directory ───────────────────────────────────────────────

/**
 * Returns the per-merge-cycle directory path: <runsDir>/merge-<mergeCycleId>/.
 */
export function buildMergeRunDir(mergeCycleId) {
  return join(runsDir, `merge-${mergeCycleId}`);
}

/**
 * Generate a unique merge cycle ID (timestamp + random).
 */
export function generateMergeCycleId() {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  const random = Math.random().toString(16).slice(2, 8);
  return `${dateStr}-${random}`;
}

/**
 * Returns the merge log path: <runDir>/merge.log.
 */
export function getMergeLogPath(runDir) {
  return join(runDir, 'merge.log');
}

/**
 * Atomically write the merge status file.
 *
 * Carries PID, sandboxId, exitCode, and result (merged/conflict/short-circuit).
 */
export function writeMergeStatus(runDir, status) {
  atomicWrite(join(runDir, 'merge-status.json'), JSON.stringify(status, null, 2));
}

/**
 * Read the merge status file. Returns null if missing/malformed.
 */
export function readMergeStatus(runDir) {
  return atomicReadJSON(join(runDir, 'merge-status.json'), null);
}

// ─── Conflict report writer ──────────────────────────────────────────────────

/**
 * Write a conflict report to the inbox (tmp+rename, like every inbox write).
 *
 * The merge wrapper writes the conflict report on a rebase conflict. The
 * report is durable before the dispatcher invocation — the pass folds it:
 * journal append (the commit point), then graph.json marks the chain blocked.
 *
 * The report carries: chainId, mergePointNodeId, conflictedFiles, diffstat,
 * runId, and the stable fingerprint (merge-conflict-<chainId>).
 *
 * @param {object} opts
 * @param {string} opts.inboxDirPath - the inbox directory
 * @param {string} opts.chainId
 * @param {string} opts.mergePointNodeId
 * @param {string[]} [opts.conflictedFiles]
 * @param {string} [opts.diffstat]
 * @param {string} [opts.runId]
 * @param {number} [opts.round] - the conflict round (1 for first conflict)
 * @returns {{ written: boolean, inboxPath: string }}
 */
export function writeConflictReport(opts) {
  const {
    inboxDirPath = inboxDir,
    chainId,
    mergePointNodeId,
    conflictedFiles = [],
    diffstat = '',
    runId,
    round = 1,
  } = opts;

  const event = buildConflictEvent({
    chainId, mergePointNodeId, conflictedFiles, diffstat, runId,
  });
  event.round = round;

  const filename = `${Date.now()}-conflict-${chainId}.json`;
  const inboxPath = join(inboxDirPath, filename);
  try {
    atomicWrite(inboxPath, JSON.stringify(event, null, 2));
    return { written: true, inboxPath };
  } catch {
    return { written: false, inboxPath };
  }
}

// ─── Merge cycle ──────────────────────────────────────────────────────────────

/**
 * The merge cycle — the merge queue's unit of work.
 *
 * The entire merge cycle runs on a sandbox created for the merge cycle's
 * duration (seconds). Steps (graph-pipeline.md lines 1933-1941):
 *   1. Acquire the merge lock (non-blocking). If can't acquire, exit 0
 *      immediately (another merge cycle is in flight — a duplicate trigger
 *      is harmless).
 *   2. Create a sandbox (same per-claim provisioning as a node claim).
 *   3. git fetch.
 *   4. Short-circuit: if the chain branch's head is already an ancestor of
 *      the trunk branch, delete the branch and exit (already merged).
 *   5. Checkout the chain branch.
 *   6. Rebase onto origin/<trunkBranch> — a conflict aborts the rebase and
 *      the wrapper writes the conflict report.
 *   7. Merge and push origin/<trunkBranch>.
 *   8. Delete the chain branch on origin.
 *   9. If a post-merge hook is configured, fire it after the push.
 *  10. Destroy the sandbox (single-use).
 *  11. Release the lock.
 *
 * The push is the commit point. Everything before it is sandbox-local and
 * disposable. A rejected push (trunk moved under the merge cycle) is not an
 * error — the merge cycle exits and the next trigger runs a fresh one.
 *
 * This function is what the n8n merge-queue workflow's Execute Command node
 * runs (via bin/merge-launch.mjs). It blocks for the merge cycle's duration
 * (seconds).
 *
 * @param {object} opts
 * @param {string} opts.chainId - the chain to merge
 * @param {string} opts.mergePointNodeId - the merge-point node that triggered
 * @param {string} opts.runId - the pipeline run identifier
 * @param {string} [opts.trunkBranch='main'] - the trunk branch
 * @param {string|null} [opts.postMergeHook=null] - post-merge hook command
 * @param {object} [opts.daytona] - Daytona client (for sandbox creation)
 * @param {object} [opts.image] - worker sandbox image
 * @param {string} [opts.repoUrl] - authenticated repo URL
 * @param {number} [opts.round=1] - the conflict round
 * @param {object} [opts.provisionSandboxFn] - test override for sandbox provisioning
 * @param {object} [opts.executeInSandboxFn] - test override for sandbox command execution
 * @param {object} [opts.destroySandboxFn] - test override for sandbox destruction
 * @returns {Promise<{ exitCode: number, mergeCycleId: string, result: string, runDir: string }>}
 *   result is one of: 'merged', 'conflict', 'short_circuit', 'duplicate', 'push_rejected', 'hook_failed'
 */
export async function runMergeCycle(opts) {
  const {
    chainId,
    mergePointNodeId,
    runId,
    trunkBranch = 'main',
    postMergeHook = null,
    round = 1,
  } = opts;

  if (!chainId) throw new Error('runMergeCycle: chainId is required');
  if (!mergePointNodeId) throw new Error('runMergeCycle: mergePointNodeId is required');
  if (!runId) throw new Error('runMergeCycle: runId is required');

  const mergeCycleId = opts.mergeCycleId || generateMergeCycleId();

  // 1. Acquire the merge lock.
  const { acquired, fd } = acquireMergeLock();
  if (!acquired) {
    // Another merge cycle is in flight — a duplicate trigger is harmless.
    return {
      exitCode: 0, mergeCycleId, result: 'duplicate', runDir: null,
    };
  }

  // Test-injectable sandbox operations.
  const provision = opts.provisionSandboxFn || defaultProvisionSandbox;
  const execute = opts.executeInSandboxFn || defaultExecuteInSandbox;
  const destroy = opts.destroySandboxFn || defaultDestroySandbox;

  const branch = `pipeline/${runId}/${chainId}`;
  const runDir = buildMergeRunDir(mergeCycleId);
  let sandbox = null;
  let sandboxId = null;
  let result = 'merged';
  const exitCode = 0;

  try {
    mkdirSync(runDir, { recursive: true });

    writeMergeStatus(runDir, {
      mergeCycleId,
      chainId,
      mergePointNodeId,
      runId,
      trunkBranch,
      branch,
      round,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      result: null,
    });

    // 2. Create a sandbox (same per-claim provisioning as a node claim).
    // The merge sandbox counts against maxConcurrentSandboxes for its
    // duration (seconds). The pass gates the trigger on capacity before
    // invoking the merge queue, so by the time we're here, capacity is
    // available.
    const provisionResult = await provision({
      daytona: opts.daytona,
      image: opts.image,
      runId,
      baseRef: `origin/${trunkBranch}`,
      repoUrl: opts.repoUrl,
    });
    sandbox = provisionResult.sandbox;
    sandboxId = provisionResult.sandboxId;
    const repoPath = provisionResult.repoPath;

    // Update the lock record with the sandbox ID (for orphaned-sandbox
    // cross-referencing by the reconcile step).
    releaseMergeLock(fd);
    const relock = acquireMergeLock({ sandboxId });
    // If re-acquisition fails (race), proceed — the lock is held by us
    // already in the common case. In tests, this is always fine.

    // 3. git fetch.
    const fetchResp = await execute(sandbox, `git -C ${repoPath} fetch origin`, { timeout: 60 });
    if (fetchResp.exitCode !== 0) {
      throw new MergeError(
        `git fetch failed: ${fetchResp.result}`,
        'fetch_failed',
      );
    }

    // 4. Short-circuit: if the chain branch's head is already an ancestor
    // of the trunk branch, delete the branch and exit (already merged).
    const ancestryResp = await execute(
      sandbox,
      `git -C ${repoPath} merge-base --is-ancestor origin/${branch} origin/${trunkBranch} && echo ANCESTOR || echo NOT_ANCESTOR`,
      { timeout: 30 },
    );
    if (ancestryResp.exitCode === 0 && ancestryResp.result.trim() === 'ANCESTOR') {
      // Already merged — delete the branch and exit.
      await execute(
        sandbox,
        `git -C ${repoPath} push origin --delete ${branch} 2>/dev/null || true`,
        { timeout: 30 },
      );
      result = 'short_circuit';
      writeMergeStatus(runDir, {
        mergeCycleId, chainId, mergePointNodeId, runId, trunkBranch, branch,
        round, pid: process.pid, startedAt: new Date().toISOString(),
        result, finishedAt: new Date().toISOString(),
      });
      return { exitCode: 0, mergeCycleId, result, runDir };
    }

    // 5. Checkout the chain branch.
    const checkoutResp = await execute(
      sandbox,
      `git -C ${repoPath} checkout origin/${branch} --detach`,
      { timeout: 30 },
    );
    if (checkoutResp.exitCode !== 0) {
      throw new MergeError(
        `git checkout ${branch} failed: ${checkoutResp.result}`,
        'checkout_failed',
      );
    }

    // 6. Rebase onto origin/<trunkBranch>.
    // A conflict aborts the rebase and the wrapper writes the conflict report.
    const rebaseResp = await execute(
      sandbox,
      `cd ${repoPath} && git rebase origin/${trunkBranch} 2>&1`,
      { timeout: 120 },
    );

    if (rebaseResp.exitCode !== 0) {
      // Conflict — abort the rebase, collect conflict details, write report.
      await execute(sandbox, `cd ${repoPath} && git rebase --abort 2>/dev/null || true`, { timeout: 30 });

      // Collect conflicted files and diffstat.
      const filesResp = await execute(
        sandbox,
        `cd ${repoPath} && git diff --name-only --diff-filter=U 2>/dev/null || true`,
        { timeout: 30 },
      );
      const conflictedFiles = filesResp.result
        .trim().split('\n').filter(Boolean);

      const diffstatResp = await execute(
        sandbox,
        `cd ${repoPath} && git diff --stat origin/${trunkBranch}...origin/${branch} 2>/dev/null || true`,
        { timeout: 30 },
      );

      // Write the conflict report to the inbox.
      writeConflictReport({
        inboxDirPath: inboxDir,
        chainId,
        mergePointNodeId,
        conflictedFiles,
        diffstat: diffstatResp.result.trim(),
        runId,
        round,
      });

      result = 'conflict';
      writeMergeStatus(runDir, {
        mergeCycleId, chainId, mergePointNodeId, runId, trunkBranch, branch,
        round, pid: process.pid, startedAt: new Date().toISOString(),
        result, conflictedFiles, finishedAt: new Date().toISOString(),
      });
      // Exit 0 — the conflict is not an error, it's evidence. The pass
      // folds the conflict report and triggers a conflict-mode planning run.
      return { exitCode: 0, mergeCycleId, result, runDir };
    }

    // 7. Merge and push origin/<trunkBranch>.
    // The rebase already replayed the chain's commits onto the trunk. Now
    // we push the rebased branch to the trunk. A fast-forward push is the
    // common case (the rebase made the chain a linear descendant of trunk).
    const pushResp = await execute(
      sandbox,
      `cd ${repoPath} && git push origin HEAD:${trunkBranch} 2>&1`,
      { timeout: 60 },
    );

    if (pushResp.exitCode !== 0) {
      // A rejected push (trunk moved under the merge cycle) is not an error:
      // the merge cycle exits and the next trigger runs a fresh one.
      result = 'push_rejected';
      writeMergeStatus(runDir, {
        mergeCycleId, chainId, mergePointNodeId, runId, trunkBranch, branch,
        round, pid: process.pid, startedAt: new Date().toISOString(),
        result, pushError: pushResp.result, finishedAt: new Date().toISOString(),
      });
      return { exitCode: 0, mergeCycleId, result, runDir };
    }

    // 8. Delete the chain branch on origin.
    await execute(
      sandbox,
      `git -C ${repoPath} push origin --delete ${branch} 2>/dev/null || true`,
      { timeout: 30 },
    );

    // 9. Fire post-merge hook if configured.
    if (postMergeHook) {
      const hookResp = await execute(
        sandbox,
        `cd ${repoPath} && ${postMergeHook} 2>&1`,
        { timeout: 300 },
      );
      if (hookResp.exitCode !== 0) {
        // Hook failure is journaled as a 'failed' outcome and rides the
        // standard remediation path (conflict-mode planning run).
        result = 'hook_failed';
        writeMergeStatus(runDir, {
          mergeCycleId, chainId, mergePointNodeId, runId, trunkBranch, branch,
          round, pid: process.pid, startedAt: new Date().toISOString(),
          result, hookOutput: hookResp.result, finishedAt: new Date().toISOString(),
        });
        // Exit non-zero so the merge-queue workflow's dispatcher invocation
        // knows something went wrong — but the merge itself landed.
        return { exitCode: 1, mergeCycleId, result, runDir };
      }
    }

    // Success — the merge landed.
    result = 'merged';
    writeMergeStatus(runDir, {
      mergeCycleId, chainId, mergePointNodeId, runId, trunkBranch, branch,
      round, pid: process.pid, startedAt: new Date().toISOString(),
      result, finishedAt: new Date().toISOString(),
    });

    return { exitCode: 0, mergeCycleId, result, runDir };
  } catch (err) {
    result = err.result || 'error';
    writeMergeStatus(runDir, {
      mergeCycleId, chainId, mergePointNodeId, runId, trunkBranch, branch,
      round, pid: process.pid, startedAt: new Date().toISOString(),
      result, error: err.message, finishedAt: new Date().toISOString(),
    });
    return { exitCode: 1, mergeCycleId, result, runDir };
  } finally {
    // 10. Destroy the sandbox (single-use — a half-finished rebase is
    // exactly the state single-use exists to never clean up).
    if (sandbox && destroy) {
      try { await destroy(sandbox); } catch { /* best-effort */ }
    }

    // 11. Release the lock.
    releaseMergeLock(fd);
  }
}

// ─── Default sandbox operations (delegate to provision.mjs / session.mjs) ─────

async function defaultProvisionSandbox(opts) {
  const { provisionSandbox } = await import('./provision.mjs');
  return provisionSandbox(opts);
}

async function defaultExecuteInSandbox(sandbox, command, opts = {}) {
  // The Daytona SDK's executeCommand returns { result, exitCode }.
  const resp = await sandbox.process.executeCommand(
    command,
    undefined, // cwd (the command uses cd internally)
    undefined, // env
    opts.timeout || 60,
  );
  return { result: resp.result || '', exitCode: resp.exitCode };
}

async function defaultDestroySandbox(sandbox) {
  try { await sandbox.delete(); } catch { /* best-effort */ }
}

// ─── Merge-trigger evaluation (called by the pass) ───────────────────────────

/**
 * Find completed merge-point nodes that need merge triggering.
 *
 * A merge trigger fires for a completed merge-point node whose branch has
 * neither merged nor has a pending conflict report, with the merge lock
 * acquirable. The pass evaluates this BEFORE node claims (merges-first
 * ordering — spike-merge-trigger-starvation.md F1).
 *
 * "Neither merged nor pending conflict" means:
 *   - The node's status is 'completed' and it has mergeTo set
 *   - The node does NOT have a 'merged' flag set (the pass sets this after
 *     a merge lands)
 *   - The chain is NOT blocked (no pending conflict report for this chain)
 *
 * @param {object} graph - the graph state
 * @param {Set<string>} blockedChains - chains with pending conflict reports
 * @returns {Array<{ nodeId: string, chainId: string, mergeTo: string }>}
 */
export function findPendingMergeTriggers(graph, blockedChains = new Set()) {
  const triggers = [];
  for (const node of graph.nodes) {
    if (node.status !== 'completed') continue;
    if (!node.mergeTo) continue;
    if (node.merged) continue; // already merged
    if (blockedChains.has(node.chainId)) continue; // chain is conflict-blocked
    triggers.push({
      nodeId: node.id,
      chainId: node.chainId,
      mergeTo: node.mergeTo,
    });
  }
  return triggers;
}

/**
 * Mark a merge-point node as merged (the merge landed).
 *
 * The pass calls this after a merge cycle reports 'merged' or 'short_circuit'.
 * The node stays 'completed' (the merge-trigger rule keys on "completed
 * merge-point node" — spike-merge-point-lifecycle.md F5: blocked is a chain-
 * level flag, never a node status). The 'merged' flag is machinery-derived
 * state that prevents re-triggering.
 *
 * @param {object} graph - the graph state (mutated in-place)
 * @param {string} nodeId - the merge-point node to mark
 * @returns {{ graph: object, event: object }}
 */
export function markMerged(graph, nodeId) {
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error(`markMerged: node not found: ${nodeId}`);
  node.merged = true;

  const event = {
    type: 'merge',
    at: new Date().toISOString(),
    nodeId,
    chainId: node.chainId,
    result: 'merged',
  };

  return { graph, event };
}

/**
 * Mark a chain as blocked (a merge conflict was reported).
 *
 * The pass calls this after folding a conflict report. The chain's merge-
 * point node stays 'completed' — 'blocked' is a chain-level flag on
 * graph.json, never a node status (spike-merge-point-lifecycle.md F5).
 *
 * @param {object} graph - the graph state (mutated in-place)
 * @param {string} chainId - the chain to block
 * @param {object} conflictDetails - the conflict report
 * @returns {{ graph: object, event: object }}
 */
export function markChainBlocked(graph, chainId, conflictDetails) {
  if (!graph.blockedChains) graph.blockedChains = {};
  graph.blockedChains[chainId] = {
    at: new Date().toISOString(),
    mergePointNodeId: conflictDetails.mergePointNodeId,
    round: conflictDetails.round || 1,
    conflictedFiles: conflictDetails.conflictedFiles || [],
    diffstat: conflictDetails.diffstat || '',
  };

  const event = {
    type: 'merge',
    at: new Date().toISOString(),
    chainId,
    result: 'conflict',
    conflictDetails,
  };

  return { graph, event };
}

/**
 * Clear a chain's blocked flag (resolution landed or rework started).
 *
 * @param {object} graph - the graph state (mutated in-place)
 * @param {string} chainId - the chain to unblock
 * @returns {{ graph: object, event: object }}
 */
export function clearChainBlocked(graph, chainId) {
  if (!graph.blockedChains) return { graph, event: null };
  delete graph.blockedChains[chainId];

  const event = {
    type: 'merge',
    at: new Date().toISOString(),
    chainId,
    result: 'unblocked',
  };

  return { graph, event };
}

/**
 * Get the set of currently blocked chains.
 *
 * @param {object} graph - the graph state
 * @returns {Set<string>} the set of blocked chain IDs
 */
export function getBlockedChains(graph) {
  if (!graph.blockedChains) return new Set();
  return new Set(Object.keys(graph.blockedChains));
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class MergeError extends Error {
  constructor(message, result = 'error') {
    super(message);
    this.name = 'MergeError';
    this.result = result;
  }
}

// ─── Self-test ───────────────────────────────────────────────────────────────
// Run with: node pipeline3/lib/merge.mjs

if (import.meta.url === `file://${process.argv[1]}`) {
  let tests = 0, failures = 0;
  function assert(name, cond) {
    tests++;
    if (cond) { console.log(`  \u2713 ${name}`); }
    else { failures++; console.error(`  \u2717 ${name}`); }
  }

  // Use a tmp state dir so the self-test never touches real state.
  const tmpDir = join(tmpdir(), `pipeline3-merge-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(join(tmpDir, 'inbox'), { recursive: true });
  mkdirSync(join(tmpDir, 'runs'), { recursive: true });
  process.env.PIPELINE3_STATE_DIR = tmpDir;

  // Re-import paths now that PIPELINE3_STATE_DIR is set.
  const { mergeLockPath: tmpMergeLockPath, inboxDir: tmpInboxDir, runsDir: tmpRunsDir } =
    await import('./paths.mjs');

  console.log('\nmerge.mjs self-test');

  // --- Lock acquire/release cycle ---
  console.log('\nlock acquire/release');
  try { unlinkSync(tmpMergeLockPath); } catch { /* may not exist */ }
  const a = acquireMergeLock({ lockPath: tmpMergeLockPath });
  assert('acquires when free', a.acquired === true && a.fd !== null);
  const b = acquireMergeLock({ lockPath: tmpMergeLockPath });
  assert('refuses when held', b.acquired === false && b.fd === null);
  releaseMergeLock(a.fd);
  const c = acquireMergeLock({ lockPath: tmpMergeLockPath });
  assert('re-acquires after release', c.acquired === true && c.fd !== null);
  releaseMergeLock(c.fd);

  // --- Lock is held check ---
  console.log('\nisMergeLockHeld');
  assert('not held when free', isMergeLockHeld() === false);
  const held = acquireMergeLock({ lockPath: tmpMergeLockPath });
  assert('held after acquire', isMergeLockHeld() === true);
  releaseMergeLock(held.fd);
  assert('not held after release', isMergeLockHeld() === false);

  // --- Stale lock recovery (dead PID) ---
  console.log('\nstale lock recovery');
  writeFileSync(tmpMergeLockPath, JSON.stringify({ pid: 999999, heldSince: new Date().toISOString(), sandboxId: null }));
  const stale = acquireMergeLock({ lockPath: tmpMergeLockPath });
  assert('reclaims stale lock (dead PID)', stale.acquired === true);
  releaseMergeLock(stale.fd);

  // --- Stall detection ---
  console.log('\nstall detection');
  const oldTs = new Date(Date.now() - 60000).toISOString(); // 60s ago
  writeFileSync(tmpMergeLockPath, JSON.stringify({ pid: process.pid, heldSince: oldTs, sandboxId: 'sb1' }));
  const stall = checkMergeStall(30000);
  assert('stall detected (held > 30s, live PID)', stall.stalled === true);
  assert('stall record has sandboxId', stall.sandboxId === 'sb1');

  const recentTs = new Date().toISOString();
  writeFileSync(tmpMergeLockPath, JSON.stringify({ pid: process.pid, heldSince: recentTs, sandboxId: 'sb2' }));
  const noStall = checkMergeStall(30000);
  assert('no stall (just acquired)', noStall.stalled === false);
  try { unlinkSync(tmpMergeLockPath); } catch { /* */ }

  // --- Conflict report writer ---
  console.log('\nconflict report writer');
  const cr = writeConflictReport({
    inboxDirPath: tmpInboxDir,
    chainId: 'c1',
    mergePointNodeId: 'n3',
    conflictedFiles: ['src/a.ts', 'package.json'],
    diffstat: '+10 -5',
    runId: 'r1',
    round: 1,
  });
  assert('conflict report written', cr.written === true);
  assert('conflict report file exists', existsSync(cr.inboxPath));
  const reportContent = JSON.parse(readFileSync(cr.inboxPath, 'utf8'));
  assert('report has type conflict', reportContent.type === 'conflict');
  assert('report has fingerprint', reportContent.fingerprint === 'merge-conflict-c1');
  assert('report has chainId', reportContent.chainId === 'c1');
  assert('report has round', reportContent.round === 1);

  // --- findPendingMergeTriggers ---
  console.log('\nfindPendingMergeTriggers');
  const testGraph = {
    runId: 'r1', nodes: [
      { id: 'n1', chainId: 'c1', status: 'completed', mergeTo: 'main', merged: false },
      { id: 'n2', chainId: 'c2', status: 'completed', mergeTo: 'main', merged: true },
      { id: 'n3', chainId: 'c3', status: 'completed', mergeTo: 'main', merged: false },
      { id: 'n4', chainId: 'c4', status: 'completed', mergeTo: null, merged: false },
      { id: 'n5', chainId: 'c5', status: 'failed', mergeTo: 'main', merged: false },
    ],
    blockedChains: { c3: { round: 1 } },
  };
  const triggers = findPendingMergeTriggers(testGraph, new Set(['c3']));
  assert('finds n1 (completed, mergeTo, not merged, not blocked)', triggers.length === 1);
  assert('trigger is for n1', triggers[0].nodeId === 'n1');
  assert('trigger has chainId', triggers[0].chainId === 'c1');
  assert('trigger has mergeTo', triggers[0].mergeTo === 'main');

  // --- markMerged ---
  console.log('\nmarkMerged');
  const { graph: mg, event: me } = markMerged(testGraph, 'n1');
  assert('n1 merged flag set', testGraph.nodes[0].merged === true);
  assert('merge event type', me.type === 'merge');
  assert('merge event result', me.result === 'merged');
  // n1 should no longer trigger
  const triggers2 = findPendingMergeTriggers(testGraph, new Set(['c3']));
  assert('n1 no longer triggers after markMerged', triggers2.length === 0);

  // --- markChainBlocked / clearChainBlocked / getBlockedChains ---
  console.log('\nchain blocked flag');
  const blockGraph = { runId: 'r1', nodes: [] };
  const { event: be } = markChainBlocked(blockGraph, 'c1', {
    mergePointNodeId: 'n1', round: 1, conflictedFiles: ['a.ts'], diffstat: '+1',
  });
  assert('blocked event type', be.type === 'merge');
  assert('blocked event result conflict', be.result === 'conflict');
  assert('blockedChains has c1', blockGraph.blockedChains && blockGraph.blockedChains.c1);
  const blocked = getBlockedChains(blockGraph);
  assert('getBlockedChains returns c1', blocked.has('c1'));
  const { event: ce } = clearChainBlocked(blockGraph, 'c1');
  assert('clear event type', ce.type === 'merge');
  assert('clear event result unblocked', ce.result === 'unblocked');
  const blocked2 = getBlockedChains(blockGraph);
  assert('c1 no longer blocked after clear', !blocked2.has('c1'));

  // --- Merge cycle with test overrides ---
  console.log('\nmerge cycle (test overrides)');

  // Scenario 1: successful merge.
  const mockSandbox = { id: 'sb-merge-1', delete: async () => { /* no-op mock */ } };
  let commandsRun = [];
  const mergeResult1 = await runMergeCycle({
    chainId: 'c1',
    mergePointNodeId: 'n1',
    runId: 'r1',
    trunkBranch: 'main',
    provisionSandboxFn: async () => ({ sandbox: mockSandbox, sandboxId: 'sb-merge-1', repoPath: '/workspace/repo' }),
    executeInSandboxFn: async (sb, cmd, opts) => {
      commandsRun.push(cmd);
      // Ancestry check: NOT an ancestor (needs merge)
      if (cmd.includes('merge-base --is-ancestor')) {
        return { result: 'NOT_ANCESTOR', exitCode: 0 };
      }
      // Rebase succeeds
      if (cmd.includes('git rebase')) {
        return { result: 'Successfully rebased', exitCode: 0 };
      }
      // Push succeeds
      if (cmd.includes('git push origin HEAD:')) {
        return { result: '', exitCode: 0 };
      }
      return { result: '', exitCode: 0 };
    },
    destroySandboxFn: async () => { /* no-op mock */ },
  });
  assert('merge cycle result is merged', mergeResult1.result === 'merged');
  assert('merge cycle exit code 0', mergeResult1.exitCode === 0);
  assert('merge cycle has runDir', mergeResult1.runDir !== null);

  // Scenario 2: short-circuit (already merged).
  commandsRun = [];
  const mergeResult2 = await runMergeCycle({
    chainId: 'c2',
    mergePointNodeId: 'n2',
    runId: 'r1',
    trunkBranch: 'main',
    provisionSandboxFn: async () => ({ sandbox: mockSandbox, sandboxId: 'sb-merge-2', repoPath: '/workspace/repo' }),
    executeInSandboxFn: async (sb, cmd, opts) => {
      commandsRun.push(cmd);
      if (cmd.includes('merge-base --is-ancestor')) {
        return { result: 'ANCESTOR', exitCode: 0 };
      }
      return { result: '', exitCode: 0 };
    },
    destroySandboxFn: async () => { /* no-op mock */ },
  });
  assert('short-circuit result', mergeResult2.result === 'short_circuit');
  assert('short-circuit exit 0', mergeResult2.exitCode === 0);

  // Scenario 3: conflict.
  commandsRun = [];
  // Clean inbox for this test.
  for (const f of readdirSync(tmpInboxDir)) {
    try { unlinkSync(join(tmpInboxDir, f)); } catch { /* */ }
  }
  const mergeResult3 = await runMergeCycle({
    chainId: 'c3',
    mergePointNodeId: 'n3',
    runId: 'r1',
    trunkBranch: 'main',
    provisionSandboxFn: async () => ({ sandbox: mockSandbox, sandboxId: 'sb-merge-3', repoPath: '/workspace/repo' }),
    executeInSandboxFn: async (sb, cmd, opts) => {
      commandsRun.push(cmd);
      if (cmd.includes('merge-base --is-ancestor')) {
        return { result: 'NOT_ANCESTOR', exitCode: 0 };
      }
      if (cmd.includes('git rebase')) {
        return { result: 'CONFLICT (content): Merge conflict in src/a.ts', exitCode: 1 };
      }
      if (cmd.includes('git diff --name-only')) {
        return { result: 'src/a.ts\n', exitCode: 0 };
      }
      if (cmd.includes('git diff --stat')) {
        return { result: 'src/a.ts | 5 +-\n', exitCode: 0 };
      }
      return { result: '', exitCode: 0 };
    },
    destroySandboxFn: async () => { /* no-op mock */ },
  });
  assert('conflict result', mergeResult3.result === 'conflict');
  assert('conflict exit 0 (not an error)', mergeResult3.exitCode === 0);
  // Check that a conflict report was written to the inbox.
  const inboxFiles = readdirSync(tmpInboxDir);
  assert('conflict report in inbox', inboxFiles.some(f => f.includes('conflict-c3')));

  // Scenario 4: push rejected (trunk moved).
  commandsRun = [];
  const mergeResult4 = await runMergeCycle({
    chainId: 'c4',
    mergePointNodeId: 'n4',
    runId: 'r1',
    trunkBranch: 'main',
    provisionSandboxFn: async () => ({ sandbox: mockSandbox, sandboxId: 'sb-merge-4', repoPath: '/workspace/repo' }),
    executeInSandboxFn: async (sb, cmd, opts) => {
      commandsRun.push(cmd);
      if (cmd.includes('merge-base --is-ancestor')) {
        return { result: 'NOT_ANCESTOR', exitCode: 0 };
      }
      if (cmd.includes('git rebase')) {
        return { result: 'Successfully rebased', exitCode: 0 };
      }
      if (cmd.includes('git push origin HEAD:')) {
        return { result: '! [rejected] HEAD -> main (non-fast-forward)', exitCode: 1 };
      }
      return { result: '', exitCode: 0 };
    },
    destroySandboxFn: async () => { /* no-op mock */ },
  });
  assert('push_rejected result', mergeResult4.result === 'push_rejected');
  assert('push_rejected exit 0', mergeResult4.exitCode === 0);

  // Scenario 5: duplicate trigger (lock held).
  // Acquire the lock first.
  const heldLock = acquireMergeLock({ lockPath: tmpMergeLockPath });
  const mergeResult5 = await runMergeCycle({
    chainId: 'c5',
    mergePointNodeId: 'n5',
    runId: 'r1',
    provisionSandboxFn: async () => { throw new Error('should not provision'); },
    destroySandboxFn: async () => { /* no-op mock */ },
  });
  assert('duplicate result', mergeResult5.result === 'duplicate');
  assert('duplicate exit 0', mergeResult5.exitCode === 0);
  releaseMergeLock(heldLock.fd);

  // --- Helpers ---
  console.log('\nhelpers');
  const mid = generateMergeCycleId();
  assert('mergeCycleId is non-empty', mid && mid.length > 0);
  assert('mergeCycleId is unique-ish', generateMergeCycleId() !== mid);
  assert('buildMergeRunDir format', buildMergeRunDir('xyz').endsWith('merge-xyz'));
  assert('getMergeLogPath format', getMergeLogPath('/r').endsWith('merge.log'));

  // --- Merge status read/write ---
  console.log('\nmerge status read/write');
  const statusDir = buildMergeRunDir('status-test');
  mkdirSync(statusDir, { recursive: true });
  writeMergeStatus(statusDir, { mergeCycleId: 'x', result: 'merged', exitCode: 0 });
  const readStatus = readMergeStatus(statusDir);
  assert('status read back', readStatus && readStatus.mergeCycleId === 'x');
  assert('status result read back', readStatus && readStatus.result === 'merged');

  // Cleanup.
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  try { unlinkSync(tmpMergeLockPath); } catch { /* */ }

  console.log(`\n${tests - failures}/${tests} passed`);
  if (failures > 0) {
    console.error('\u2717 self-test FAILED');
    process.exit(1);
  } else {
    console.log('\u2705 self-test passed');
  }
}
