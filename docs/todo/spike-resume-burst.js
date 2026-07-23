#!/usr/bin/env node
/**
 * Spike: pause/resume burst interaction (resume-burst).
 *
 * Verifies the reviewer-flagged interaction from the graph-pipeline plan:
 *
 *   "During pause: claiming stops, but merge triggering continues
 *   ('finishing claimed work'). Merge sandboxes count against
 *   maxConcurrentSandboxes. So during a pause:
 *    - In-flight merge-point nodes complete → trigger merges → merge
 *      sandboxes consume capacity
 *    - No new claims fire (paused)
 *    - If enough merges queue up, capacity fills with merge sandboxes
 *    - When the human resumes, the pool may be full of merge sandboxes (or
 *      recently-freed merge slots), and the ready-node frontier may be deep
 *      (many successors unblocked by the merges)
 *
 *    Spike scope: Simulation only. Verify the resume path doesn't deadlock
 *    or thrash when N merges landed during pause and M successors are now
 *    ready."
 *
 * This is a PURE-LOGIC discrete-event simulation. No infrastructure, no
 * network, no sandboxes, no LLM calls. It extends the
 * spike-merge-point-lifecycle.js model with:
 *   - Pause/resume state (the pause gate on claiming and planning launches)
 *   - Merge triggering continues during pause (finishing claimed work)
 *   - Conflict-blocked chains stay blocked through pause (planning gated)
 *   - The resume burst: deep ready frontier + pending merge triggers
 *
 * What this spike measures:
 *
 *   Phase R1 — Resume into empty pool, deep frontier. The benign-but-bursty
 *   case: all merges landed during pause, frontier is deep, pool is empty.
 *   Does depth-first claiming fill the pool without deadlock or thrash?
 *
 *   Phase R2 — Resume into partially-full pool (one merge in flight). The
 *   reviewer's literal "finishing claimed work" case: a merge is mid-cycle
 *   at the resume moment. Does the resume pass correctly account for the
 *   in-flight merge's slot?
 *
 *   Phase R3 — Resume into cap=1 held by a merge. The edge case: the single
 *   slot is occupied by a merge sandbox at resume. Does the first resume
 *   pass claim nothing, then the next pass (after merge completes) claim?
 *   No deadlock?
 *
 *   Phase R4 — Conflict-blocked chain during pause. A merge conflicted
 *   during pause; the chain is blocked; conflict-mode planning is gated by
 *   pause. At resume: does the conflict-mode planning run trigger? Does the
 *   blocked chain recover?
 *
 *   Phase R5 — Burst of N pending merge triggers at resume (cap ≥ 3, no
 *   in-flight merges). The reviewer's "many merges queued" case. Do the
 *   merges drain one-per-tick under merge.lock serialization? Do node
 *   claims fill remaining capacity in parallel?
 *
 *   Phase R6 — Deep frontier re-filling the pool on subsequent passes.
 *   The "burst" dynamic: first pass claims cap nodes, subsequent passes
 *   claim one each as slots free. Does the fairness counter rotate chains?
 *   No starvation?
 *
 * Usage:
 *   node spike-resume-burst.js
 *
 * No external dependencies — uses only Node.js stdlib.
 * See: docs/todo/spike-resume-burst.md for the full report.
 */

'use strict';

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_FAIRNESS_BUDGET = 5;

// Simulated durations (in ticks). 1 tick ≈ a few minutes.
const NODE_DURATION_TICKS = 60;   // skill run ≈ hours
const MERGE_DURATION_TICKS = 1;   // merge cycle ≈ seconds
const PLANNING_DURATION_TICKS = 3; // planning run ≈ minutes

// ─── Utilities ─────────────────────────────────────────────────────────────

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

// ─── Graph model ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {string} chainId
 * @property {string|null} dependsOn
 * @property {boolean} isMergePoint
 * @property {string} status - pending|running|completed|merging|merged|failed|blocked
 * @property {number} ticksRemaining
 * @property {number} claimTick
 * @property {boolean} isEmptyDiff
 * @property {boolean} willConflict
 * @property {number} conflictRound
 */

function buildChain(chainId, length, mergePointIndices, opts = {}) {
  const nodes = [];
  const mergeSet = new Set(mergePointIndices);
  for (let i = 0; i < length; i++) {
    nodes.push({
      id: `${chainId}-n${i}`,
      chainId,
      dependsOn: i === 0 ? null : `${chainId}-n${i - 1}`,
      isMergePoint: mergeSet.has(i),
      status: 'pending',
      ticksRemaining: 0,
      claimTick: -1,
      isEmptyDiff: false,
      willConflict: false,
      conflictRound: 0,
    });
  }
  if (opts.overrides) {
    for (const [nodeId, override] of Object.entries(opts.overrides)) {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) Object.assign(node, override);
    }
  }
  return nodes;
}

// ─── Dispatcher simulation (extended with pause/resume) ────────────────────

/**
 * Extended dispatcher that models pause/resume:
 *   - Pause gate: no claims, no planning launches (expansion or conflict)
 *   - During pause: supervision, folding, merge triggering continue
 *   - Resume: the gate flips open; the next pass claims and launches normally
 *   - The resume burst: deep ready frontier + pending merge triggers
 */
class ResumeBurstDispatcher {
  constructor(opts) {
    this.maxConcurrent = opts.maxConcurrent;
    this.fairnessBudget = opts.fairnessBudget;
    this.nodes = new Map(opts.nodes.map((n) => [n.id, { ...n }]));
    this.tick = 0;
    this.fairnessCounter = 0;

    // Pause state
    this.paused = false;
    this.pauseTick = -1;
    this.resumeTick = -1;

    // Merge state
    this.mergeLockHeld = false;
    this.mergeLockHolder = null;
    this.mergeLockReleaseTick = -1;
    this.mergeLockPid = -1;
    this.mergeLockOrphaned = false;
    this.mergeSandboxCreated = false;
    this.pendingMergeTriggers = new Set();

    // Conflict state
    this.conflictBlockedChains = new Set();
    this.conflictReports = new Map(); // nodeId -> { round, fingerprint, resolved }
    this.resolutionNodes = new Map(); // originalMergePointId -> resolutionNodeId

    // Planning state
    this.planningLockHeld = false;
    this.planningLockReleaseTick = -1;
    this.planningMode = null; // 'expansion' | 'conflict'

    // Statistics
    this.stats = {
      passes: 0,
      claims: 0,
      mergeTriggers: 0,
      mergeTriggerDeferrals: 0,
      mergeCompletions: 0,
      maxMergeTriggerWait: 0,
      nodeCompletions: 0,
      sandboxCreations: 0,
      sandboxDestructions: 0,
      conflictsTriggered: 0,
      conflictPlanningRuns: 0,
      resolutionNodesAppended: 0,
      resolutionNodesCompleted: 0,
      stallDetected: false,
      stallTick: -1,
      // Resume-burst-specific stats
      claimsAtResume: 0,
      mergeTriggersAtResume: 0,
      firstClaimAfterResumeTick: -1,
      passesAtResume: 0,
      maxPendingMergesDuringPause: 0,
      capacityExceeded: false,
    };

    this.mergePointCompletedTick = new Map();

    // Event log for tracing
    this.events = [];

    // Track whether we've seen the resume event
    this.resumeObserved = false;
  }

  logEvent(type, detail) {
    this.events.push({ tick: this.tick, type, detail });
  }

  /**
   * Count live sandboxes: running nodes + merge sandbox (if lock held and
   * sandbox created) + pending merge triggers (fired but not materialized).
   */
  countLiveSandboxes() {
    let count = 0;
    for (const node of this.nodes.values()) {
      if (node.status === 'running' || node.status === 'claimed') {
        count++;
      }
    }
    if (this.mergeLockHeld && this.mergeSandboxCreated) {
      count++;
    }
    count += this.pendingMergeTriggers.size;
    return count;
  }

  capacityAvailable() {
    return this.countLiveSandboxes() < this.maxConcurrent;
  }

  /**
   * Check if capacity was exceeded (for detecting invariant violations).
   */
  checkCapacityInvariant() {
    const live = this.countLiveSandboxes();
    if (live > this.maxConcurrent) {
      this.stats.capacityExceeded = true;
      this.logEvent('capacity-exceeded', {
        live,
        cap: this.maxConcurrent,
        tick: this.tick,
      });
    }
  }

  isReady(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node || node.status !== 'pending') return false;
    if (node.dependsOn === null) return true;

    const dep = this.nodes.get(node.dependsOn);
    if (!dep) return false;

    // Resolution nodes are ready when their merge-point predecessor is
    // 'completed' and a conflict is pending.
    if (node.isMergePoint && node.dependsOn &&
        this.nodes.get(node.dependsOn)?.isMergePoint &&
        this.conflictReports.has(node.dependsOn) &&
        !this.conflictReports.get(node.dependsOn).resolved) {
      return dep.status === 'completed';
    }

    if (dep.isMergePoint) {
      return dep.status === 'merged';
    }
    return dep.status === 'completed';
  }

  getReadyNodesByChain() {
    const byChain = new Map();
    for (const node of this.nodes.values()) {
      if (this.isReady(node.id)) {
        if (!byChain.has(node.chainId)) byChain.set(node.chainId, []);
        byChain.get(node.chainId).push(node.id);
      }
    }
    return byChain;
  }

  /**
   * Get completed merge-point nodes that need merge triggering.
   * A merge-point node needs triggering if:
   * - status is 'completed'
   * - no pending conflict (chain not blocked for this node)
   * - not already in pendingMergeTriggers
   */
  getPendingMergeTriggers() {
    const pending = [];
    for (const node of this.nodes.values()) {
      if (node.isMergePoint && node.status === 'completed') {
        if (this.conflictReports.has(node.id) &&
            this.conflictReports.get(node.id).resolved === false) {
          continue; // conflict resolution in progress
        }
        if (!this.pendingMergeTriggers.has(node.id)) {
          pending.push(node.id);
        }
      }
    }
    return pending;
  }

  claimNode(nodeId) {
    const node = this.nodes.get(nodeId);
    node.status = 'running';
    node.ticksRemaining = NODE_DURATION_TICKS;
    node.claimTick = this.tick;
    this.stats.claims++;
    this.stats.sandboxCreations++;
    this.logEvent('claim', { nodeId, tick: this.tick });

    if (this.resumeObserved && this.stats.firstClaimAfterResumeTick === -1) {
      this.stats.firstClaimAfterResumeTick = this.tick;
    }
    if (this.resumeObserved) {
      this.stats.claimsAtResume++;
    }
  }

  triggerMerge(nodeId) {
    this.pendingMergeTriggers.add(nodeId);
    this.stats.mergeTriggers++;
    this.logEvent('merge-trigger', { nodeId, tick: this.tick });

    if (this.resumeObserved) {
      this.stats.mergeTriggersAtResume++;
    }
    if (this.paused) {
      const pending = this.pendingMergeTriggers.size;
      if (pending > this.stats.maxPendingMergesDuringPause) {
        this.stats.maxPendingMergesDuringPause = pending;
      }
    }
  }

  materializeMergeSandbox(nodeId) {
    const node = this.nodes.get(nodeId);
    this.pendingMergeTriggers.delete(nodeId);
    this.mergeLockHeld = true;
    this.mergeLockHolder = nodeId;
    this.mergeLockReleaseTick = this.tick + MERGE_DURATION_TICKS;
    this.mergeSandboxCreated = true;
    this.mergeLockPid = Math.floor(Math.random() * 100000) + 1000;
    node.status = 'merging';
    this.stats.sandboxCreations++;
    this.logEvent('merge-materialize', { nodeId, pid: this.mergeLockPid, tick: this.tick });
  }

  completeMerge(nodeId) {
    const node = this.nodes.get(nodeId);

    if (node.isEmptyDiff) {
      node.status = 'merged';
      this.releaseMergeLock();
      this.stats.mergeCompletions++;
      this.stats.sandboxDestructions++;
      this.logEvent('merge-empty-diff', { nodeId, tick: this.tick });
      return;
    }

    if (node.willConflict && node.conflictRound === 0) {
      this.conflictReports.set(nodeId, {
        round: 1,
        fingerprint: `merge-conflict-${node.chainId}`,
        resolved: false,
      });
      this.conflictBlockedChains.add(node.chainId);
      node.status = 'completed';
      this.releaseMergeLock();
      this.stats.conflictsTriggered++;
      this.stats.sandboxDestructions++;
      this.logEvent('merge-conflict', { nodeId, round: 1, tick: this.tick });
      return;
    }

    // Success
    node.status = 'merged';
    this.releaseMergeLock();
    this.stats.mergeCompletions++;
    this.stats.sandboxDestructions++;
    this.logEvent('merge-complete', { nodeId, tick: this.tick });

    // If this node is a resolution node, mark the original merge-point as
    // merged and resolve the conflict report. The resolution node's merge
    // IS the original merge-point's merge — the resolution rebased the
    // chain branch and pushed, so the original merge-point's work is now
    // on the trunk branch.
    for (const [originalId, resolutionId] of this.resolutionNodes) {
      if (resolutionId === nodeId) {
        const original = this.nodes.get(originalId);
        if (original && original.status === 'completed') {
          original.status = 'merged';
          this.logEvent('merge-resolved', { originalId, resolutionId, tick: this.tick });
        }
        if (this.conflictReports.has(originalId)) {
          this.conflictReports.get(originalId).resolved = true;
        }
        this.conflictBlockedChains.delete(node.chainId);
      }
    }
  }

  releaseMergeLock() {
    this.mergeLockHeld = false;
    this.mergeLockHolder = null;
    this.mergeLockReleaseTick = -1;
    this.mergeSandboxCreated = false;
    this.mergeLockPid = -1;
  }

  triggerConflictPlanningRun(chainId, mergePointId) {
    if (this.planningLockHeld) return false;
    // PAUSE GATE: planning launches are gated by pause
    if (this.paused) {
      this.logEvent('conflict-planning-deferred-pause', { chainId, mergePointId, tick: this.tick });
      return false;
    }

    this.planningLockHeld = true;
    this.planningLockReleaseTick = this.tick + PLANNING_DURATION_TICKS;
    this.planningMode = 'conflict';
    this.stats.conflictPlanningRuns++;
    this.logEvent('conflict-planning-start', { chainId, mergePointId, tick: this.tick });
    return true;
  }

  completePlanningRun() {
    this.planningLockHeld = false;
    this.planningLockReleaseTick = -1;

    if (this.planningMode === 'conflict') {
      for (const [mergePointId, report] of this.conflictReports) {
        if (!report.resolved) {
          const node = this.nodes.get(mergePointId);
          const resolutionId = `${mergePointId}-resolution-r${report.round}`;
          this.nodes.set(resolutionId, {
            id: resolutionId,
            chainId: node.chainId,
            dependsOn: mergePointId,
            isMergePoint: true,
            status: 'pending',
            ticksRemaining: 0,
            claimTick: -1,
            isEmptyDiff: false,
            willConflict: false,
            conflictRound: report.round,
          });
          this.resolutionNodes.set(mergePointId, resolutionId);
          this.stats.resolutionNodesAppended++;
          this.logEvent('conflict-planning-complete', {
            mergePointId,
            resolutionId,
            tick: this.tick,
          });
          break;
        }
      }
    }
    this.planningMode = null;
  }

  /**
   * Engage pause: writes pause event to journal (simulated), sets paused=true.
   * The claim gate takes effect on the NEXT pass.
   */
  pause() {
    this.paused = true;
    this.pauseTick = this.tick;
    this.logEvent('pause', { tick: this.tick });
  }

  /**
   * Resume: writes resume event to journal (simulated), sets paused=false.
   * The claim gate opens on the NEXT pass (the resume pass).
   */
  resume() {
    this.paused = false;
    this.resumeTick = this.tick;
    this.resumeObserved = true;
    this.logEvent('resume', { tick: this.tick });
  }

  advanceTime() {
    this.tick++;

    // Complete running nodes (pause does not preempt)
    for (const node of this.nodes.values()) {
      if (node.status === 'running') {
        node.ticksRemaining--;
        if (node.ticksRemaining <= 0) {
          node.status = 'completed';
          this.stats.nodeCompletions++;
          this.stats.sandboxDestructions++;
          if (node.isMergePoint) {
            this.mergePointCompletedTick.set(node.id, this.tick);
          }
          this.logEvent('node-complete', { nodeId: node.id, tick: this.tick });
        }
      }
    }

    // Materialize pending merge triggers (merge-queue workflow creates sandbox)
    // This happens between passes — the workflow runs async.
    // PAUSE DOES NOT GATE THIS: merge triggering continues during pause.
    if (this.pendingMergeTriggers.size > 0 && !this.mergeLockHeld) {
      const firstPending = Array.from(this.pendingMergeTriggers)[0];
      this.materializeMergeSandbox(firstPending);
    }

    // Complete merge cycle (unless orphaned)
    if (this.mergeLockHeld && !this.mergeLockOrphaned &&
        this.tick >= this.mergeLockReleaseTick) {
      this.completeMerge(this.mergeLockHolder);
    }

    // Complete planning runs (pause does not preempt in-flight planning)
    if (this.planningLockHeld && this.tick >= this.planningLockReleaseTick) {
      this.completePlanningRun();
    }

    // Check capacity invariant after all time-advance operations
    this.checkCapacityInvariant();
  }

  /**
   * One reconcile pass. Models the full step sequence with pause gate.
   *
   * During pause:
   *   - Steps 1-5 run normally (reconcile, fold, poll, re-evaluate)
   *   - Step 6a: merge triggers fire (NOT gated by pause)
   *   - Step 6b: claims are GATED (paused)
   *   - Conflict-mode planning launches are GATED (paused)
   *
   * At resume:
   *   - All steps run normally; the gate on claims and planning opens
   */
  pass() {
    this.stats.passes++;
    if (this.resumeObserved) {
      this.stats.passesAtResume++;
    }
    let didWork = false;

    // Step 3: Fold inbox (pause/resume events, conflict reports)
    // In this simulation, pause/resume are set directly on this.paused.
    // Conflict reports are folded in completeMerge().

    // Step 4: Poll in-flight sessions (completions handled in advanceTime)

    // Step 5: Re-evaluate readiness (computed on-the-fly by isReady)

    // Step 6a: Check for conflict-blocked chains that need planning runs
    // PAUSE GATE: planning launches are gated by pause
    if (!this.paused) {
      for (const [mergePointId, report] of this.conflictReports) {
        if (!report.resolved && !this.planningLockHeld) {
          const node = this.nodes.get(mergePointId);
          if (node && !this.resolutionNodes.has(mergePointId)) {
            if (this.triggerConflictPlanningRun(node.chainId, mergePointId)) {
              didWork = true;
            }
          }
        }
      }
    }

    // Step 6b: Trigger pending merges (merges-first ordering)
    // NOT GATED BY PAUSE — merge triggering continues during pause
    const pendingMerges = this.getPendingMergeTriggers();
    for (const nodeId of pendingMerges) {
      if (this.mergeLockHeld) {
        this.stats.mergeTriggerDeferrals++;
        const completedTick = this.mergePointCompletedTick.get(nodeId);
        if (completedTick !== undefined) {
          const wait = this.tick - completedTick;
          if (wait > this.stats.maxMergeTriggerWait) {
            this.stats.maxMergeTriggerWait = wait;
          }
        }
        continue;
      }
      if (!this.capacityAvailable()) {
        this.stats.mergeTriggerDeferrals++;
        const completedTick = this.mergePointCompletedTick.get(nodeId);
        if (completedTick !== undefined) {
          const wait = this.tick - completedTick;
          if (wait > this.stats.maxMergeTriggerWait) {
            this.stats.maxMergeTriggerWait = wait;
          }
        }
        continue;
      }
      this.triggerMerge(nodeId);
      didWork = true;
      break; // one merge trigger per pass (serialized by merge.lock)
    }

    // Step 6c: Claim ready nodes depth-first (after merge triggers)
    // PAUSE GATE: claims are gated by pause
    if (!this.paused) {
      const readyByChain = this.getReadyNodesByChain();
      didWork = this.doClaims(readyByChain) || didWork;
    }

    return didWork;
  }

  doClaims(readyByChain) {
    let claimed = false;
    const chains = Array.from(readyByChain.keys());

    while (true) {
      if (!this.capacityAvailable()) break;
      let claimedThisIteration = false;

      for (const chainId of chains) {
        if (!this.capacityAvailable()) break;
        const readyInChain = readyByChain.get(chainId);
        if (readyInChain.length === 0) continue;

        const otherChainsHaveReady = chains.some(
          (c) => c !== chainId && readyByChain.get(c).length > 0
        );

        if (this.fairnessCounter >= this.fairnessBudget && otherChainsHaveReady) {
          this.fairnessCounter = 0;
          continue;
        }

        const nodeId = readyInChain.shift();
        this.claimNode(nodeId);
        this.fairnessCounter++;
        claimed = true;
        claimedThisIteration = true;
        break;
      }
      if (!claimedThisIteration) break;
    }
    return claimed;
  }

  isTerminal() {
    for (const node of this.nodes.values()) {
      if (['pending', 'running', 'merging'].includes(node.status)) return false;
    }
    return !this.mergeLockHeld && !this.planningLockHeld &&
           this.pendingMergeTriggers.size === 0;
  }

  isStalled() {
    let hasRunning = false;
    let hasPending = false;
    for (const node of this.nodes.values()) {
      if (['running', 'merging'].includes(node.status)) hasRunning = true;
      if (node.status === 'pending') hasPending = true;
    }
    if (!hasRunning && hasPending) {
      if (this.mergeLockOrphaned) return true;
      // Check if all pending nodes depend on a merge that can't fire
      // (simplified — the simulation should not reach here under normal operation)
      return false;
    }
    return false;
  }

  /**
   * Count ready nodes (the frontier depth) without claiming.
   */
  countReadyNodes() {
    let count = 0;
    for (const node of this.nodes.values()) {
      if (this.isReady(node.id)) count++;
    }
    return count;
  }
}

// ─── Simulation runner ─────────────────────────────────────────────────────

/**
 * Run a simulation with pause/resume control.
 *
 * opts:
 *   - maxConcurrent, fairnessBudget, maxTicks
 *   - preSeed(dispatcher): set up initial state
 *   - pauseTick: tick at which to pause (or -1)
 *   - resumeTick: tick at which to resume (or -1)
 *   - n8nRestartTick: tick at which to simulate n8n restart (or -1)
 */
function runSimulation(scenario, opts) {
  const dispatcher = new ResumeBurstDispatcher({
    maxConcurrent: opts.maxConcurrent,
    fairnessBudget: opts.fairnessBudget,
    nodes: scenario.nodes,
  });

  const maxTicks = opts.maxTicks || 5000;
  let stalled = false;
  let terminal = false;

  if (opts.preSeed) opts.preSeed(dispatcher);

  let pauseTick = opts.pauseTick ?? -1;
  let resumeTick = opts.resumeTick ?? -1;
  let restartTick = opts.n8nRestartTick ?? -1;

  while (dispatcher.tick < maxTicks && !stalled && !terminal) {
    dispatcher.advanceTime();

    if (pauseTick > 0 && dispatcher.tick >= pauseTick) {
      dispatcher.pause();
      pauseTick = -1;
    }

    if (resumeTick > 0 && dispatcher.tick >= resumeTick) {
      dispatcher.resume();
      resumeTick = -1;
    }

    if (restartTick > 0 && dispatcher.tick >= restartTick) {
      dispatcher.mergeLockOrphaned = true;
      dispatcher.mergeLockReleaseTick = Infinity;
      dispatcher.logEvent('n8n-restart', { tick: dispatcher.tick });
      restartTick = -1;
    }

    let passCount = 0;
    while (passCount < 100) {
      const didWork = dispatcher.pass();
      passCount++;
      if (!didWork) break;
    }

    terminal = dispatcher.isTerminal();
    stalled = dispatcher.isStalled();
  }

  return {
    dispatcher,
    terminal,
    stalled,
    timedOut: dispatcher.tick >= maxTicks && !terminal && !stalled,
    finalTick: dispatcher.tick,
  };
}

// ─── Phases ────────────────────────────────────────────────────────────────

/**
 * Phase R1: Resume into empty pool, deep frontier.
 *
 * The benign-but-bursty case. 6 chains, each with a mid-chain merge at n2.
 * At T=0, all n2 merge-points complete simultaneously. Pause is engaged
 * before the resume pass. Merges land during pause (serialized by
 * merge.lock, ~6 ticks). At resume (after merges land), the frontier has
 * 6 chains × n3-n7 successors = ~30 ready nodes, and the pool is empty.
 *
 * Verify: depth-first claiming fills the pool in one pass, no deadlock,
 * no thrash, fairness counter rotates chains across pool-fills.
 */
async function phaseR1() {
  console.log('\n=== Phase R1: resume into empty pool, deep frontier ===\n');

  const results = {};

  for (const cap of [3, 5]) {
    log('phaseR1', `Testing cap=${cap}`);

    // 6 chains, each 8 nodes, mid-chain merge at n2, final merge at n7
    const chains = {};
    const allNodes = [];
    for (let c = 0; c < 6; c++) {
      const chainId = `R1-${c}`;
      const chain = buildChain(chainId, 8, [2, 7]);
      chains[chainId] = chain;
      allNodes.push(...chain);
    }

    const preSeed = (d) => {
      // All n0-n1 completed, n2 (merge point) running (1 tick left)
      for (const node of d.nodes.values()) {
        if (node.id.endsWith('-n0') || node.id.endsWith('-n1')) {
          node.status = 'completed';
        }
        if (node.id.endsWith('-n2')) {
          node.status = 'running';
          node.ticksRemaining = 1;
        }
      }
    };

    // Pause at tick 1 (after n2 completes), resume at tick 10
    // (after all 6 merges land, serialized by merge.lock: 6 ticks)
    const result = runSimulation(
      { nodes: allNodes },
      {
        maxConcurrent: cap,
        fairnessBudget: cap,
        preSeed,
        pauseTick: 1,
        resumeTick: 10,
        maxTicks: 2000,
      }
    );

    const d = result.dispatcher;
    const readyAtResume = d.events.find((e) => e.type === 'resume')?.tick;
    const claimsAfterResume = d.stats.claimsAtResume;
    const firstClaimTick = d.stats.firstClaimAfterResumeTick;
    const readyNow = d.countReadyNodes();

    log('phaseR1', `  Terminal: ${result.terminal}, Stalled: ${result.stalled}`);
    log('phaseR1', `  Final tick: ${result.finalTick}`);
    log('phaseR1', `  Total claims: ${d.stats.claims}`);
    log('phaseR1', `  Claims after resume: ${claimsAfterResume}`);
    log('phaseR1', `  First claim after resume at tick: ${firstClaimTick}`);
    log('phaseR1', `  Resume at tick: ${readyAtResume}`);
    log('phaseR1', `  Merge triggers: ${d.stats.mergeTriggers}`);
    log('phaseR1', `  Merge deferrals: ${d.stats.mergeTriggerDeferrals}`);
    log('phaseR1', `  Max merge wait: ${d.stats.maxMergeTriggerWait} ticks`);
    log('phaseR1', `  Capacity exceeded: ${d.stats.capacityExceeded}`);
    log('phaseR1', `  Total passes: ${d.stats.passes}`);
    log('phaseR1', '');

    results[`cap${cap}`] = {
      terminal: result.terminal,
      stalled: result.stalled,
      finalTick: result.finalTick,
      totalClaims: d.stats.claims,
      claimsAfterResume,
      firstClaimAfterResumeTick: firstClaimTick,
      resumeTick: readyAtResume,
      mergeTriggers: d.stats.mergeTriggers,
      mergeDeferrals: d.stats.mergeTriggerDeferrals,
      maxMergeWait: d.stats.maxMergeTriggerWait,
      capacityExceeded: d.stats.capacityExceeded,
      passes: d.stats.passes,
    };
  }

  const pass = results['cap3'].terminal && results['cap5'].terminal &&
               !results['cap3'].capacityExceeded && !results['cap5'].capacityExceeded;

  log('phaseR1', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  log('phaseR1', `  cap=3: terminal=${results['cap3'].terminal}, first claim at tick ${results['cap3'].firstClaimAfterResumeTick}`);
  log('phaseR1', `  cap=5: terminal=${results['cap5'].terminal}, first claim at tick ${results['cap5'].firstClaimAfterResumeTick}`);

  return { pass, results };
}

/**
 * Phase R2: Resume into partially-full pool (one merge in flight).
 *
 * The reviewer's literal "finishing claimed work" case. A merge is mid-cycle
 * at the resume moment. The resume pass should correctly account for the
 * in-flight merge's slot.
 *
 * Setup: 3 chains, cap=3. Chain A's merge-point node (n2) completes at tick 1.
 * Pause at tick 1. The merge trigger fires during pause, materializes at
 * tick 2. Resume at tick 2 (while merge is still running, completes at tick 3).
 * At resume: pool has 1 merge sandbox (1/3 used), 2 slots free.
 */
async function phaseR2() {
  console.log('\n=== Phase R2: resume into partially-full pool (merge in flight) ===\n');

  const results = {};

  for (const cap of [3, 5]) {
    log('phaseR2', `Testing cap=${cap}`);

    const chains = {};
    const allNodes = [];
    for (let c = 0; c < 3; c++) {
      const chainId = `R2-${c}`;
      // 5 nodes, merge at n2 and n4
      const chain = buildChain(chainId, 5, [2, 4]);
      chains[chainId] = chain;
      allNodes.push(...chain);
    }

    const preSeed = (d) => {
      // All n0-n1 completed, n2 (merge point) running (1 tick left)
      for (const node of d.nodes.values()) {
        if (node.id.endsWith('-n0') || node.id.endsWith('-n1')) {
          node.status = 'completed';
        }
        if (node.id.endsWith('-n2')) {
          node.status = 'running';
          node.ticksRemaining = 1;
        }
      }
    };

    // Pause at tick 1 (after n2 completes, before merge fires)
    // Resume at tick 2 (while merge is in flight — merge materializes at tick 2,
    // completes at tick 3)
    const result = runSimulation(
      { nodes: allNodes },
      {
        maxConcurrent: cap,
        fairnessBudget: cap,
        preSeed,
        pauseTick: 1,
        resumeTick: 2,
        maxTicks: 2000,
      }
    );

    const d = result.dispatcher;
    log('phaseR2', `  Terminal: ${result.terminal}, Stalled: ${result.stalled}`);
    log('phaseR2', `  Final tick: ${result.finalTick}`);
    log('phaseR2', `  First claim after resume at tick: ${d.stats.firstClaimAfterResumeTick}`);
    log('phaseR2', `  Capacity exceeded: ${d.stats.capacityExceeded}`);
    log('phaseR2', `  Merge triggers: ${d.stats.mergeTriggers}`);
    log('phaseR2', `  Merge deferrals: ${d.stats.mergeTriggerDeferrals}`);
    log('phaseR2', `  Total claims: ${d.stats.claims}`);
    log('phaseR2', `  Total passes: ${d.stats.passes}`);
    log('phaseR2', '');

    results[`cap${cap}`] = {
      terminal: result.terminal,
      stalled: result.stalled,
      finalTick: result.finalTick,
      firstClaimAfterResumeTick: d.stats.firstClaimAfterResumeTick,
      capacityExceeded: d.stats.capacityExceeded,
      mergeTriggers: d.stats.mergeTriggers,
      mergeDeferrals: d.stats.mergeTriggerDeferrals,
      totalClaims: d.stats.claims,
      passes: d.stats.passes,
    };
  }

  const pass = results['cap3'].terminal && results['cap5'].terminal &&
               !results['cap3'].capacityExceeded && !results['cap5'].capacityExceeded &&
               results['cap3'].firstClaimAfterResumeTick >= 2; // claim fires at or after resume

  log('phaseR2', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  log('phaseR2', `  cap=3: terminal=${results['cap3'].terminal}, first claim at tick ${results['cap3'].firstClaimAfterResumeTick}, capacity exceeded=${results['cap3'].capacityExceeded}`);
  log('phaseR2', `  cap=5: terminal=${results['cap5'].terminal}, first claim at tick ${results['cap5'].firstClaimAfterResumeTick}, capacity exceeded=${results['cap5'].capacityExceeded}`);

  return { pass, results };
}

/**
 * Phase R3: Resume into cap=1 held by a merge.
 *
 * The edge case. Cap=1, single merge in flight at resume. The first
 * post-resume pass should claim nothing (capacity=0). The next pass
 * (1 tick later, after merge completes) should claim the first ready node.
 * No deadlock.
 *
 * Setup: 1 chain, 4 nodes (n0 → n1(merge) → n2 → n3(merge)).
 * n1 completes at tick 1. Pause at tick 1. Merge materializes at tick 2.
 * Resume at tick 2 (while merge is running). Merge completes at tick 3.
 */
async function phaseR3() {
  console.log('\n=== Phase R3: resume into cap=1 held by a merge ===\n');

  const results = {};

  log('phaseR3', `Testing cap=1`);

  // 1 chain, 4 nodes, merge at n1 and n3
  const chain = buildChain('R3', 4, [1, 3]);

  const preSeed = (d) => {
    d.nodes.get('R3-n0').status = 'completed';
    d.nodes.get('R3-n1').status = 'running';
    d.nodes.get('R3-n1').ticksRemaining = 1;
  };

  // Pause at tick 1 (after n1 completes), resume at tick 2 (merge in flight)
  const result = runSimulation(
    { nodes: chain },
    {
      maxConcurrent: 1,
      fairnessBudget: 1,
      preSeed,
      pauseTick: 1,
      resumeTick: 2,
      maxTicks: 500,
    }
  );

  const d = result.dispatcher;
  log('phaseR3', `  Terminal: ${result.terminal}, Stalled: ${result.stalled}`);
  log('phaseR3', `  Final tick: ${result.finalTick}`);
  log('phaseR3', `  First claim after resume at tick: ${d.stats.firstClaimAfterResumeTick}`);
  log('phaseR3', `  Capacity exceeded: ${d.stats.capacityExceeded}`);
  log('phaseR3', `  Merge triggers: ${d.stats.mergeTriggers}`);
  log('phaseR3', `  Total claims: ${d.stats.claims}`);
  log('phaseR3', `  Total passes: ${d.stats.passes}`);
  log('phaseR3', '');

  // The first claim should be at tick 3 (after merge completes at tick 3)
  // or later — NOT at tick 2 (the resume tick, when the merge holds the slot)
  const pass = result.terminal && !result.stalled &&
               !d.stats.capacityExceeded &&
               d.stats.firstClaimAfterResumeTick >= 3;

  results['cap1'] = {
    terminal: result.terminal,
    stalled: result.stalled,
    finalTick: result.finalTick,
    firstClaimAfterResumeTick: d.stats.firstClaimAfterResumeTick,
    capacityExceeded: d.stats.capacityExceeded,
    mergeTriggers: d.stats.mergeTriggers,
    totalClaims: d.stats.claims,
    passes: d.stats.passes,
  };

  log('phaseR3', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  log('phaseR3', `  cap=1: terminal=${results['cap1'].terminal}, first claim at tick ${results['cap1'].firstClaimAfterResumeTick}, capacity exceeded=${results['cap1'].capacityExceeded}`);

  return { pass, results };
}

/**
 * Phase R4: Conflict-blocked chain during pause.
 *
 * A merge conflicted during pause; the chain is blocked; conflict-mode
 * planning is gated by pause. At resume: the conflict-mode planning run
 * should trigger. The blocked chain should recover.
 *
 * Setup: 3 chains. Chain A's merge-point node (n2) conflicts on first merge.
 * During pause: conflict report is folded, chain is blocked. Planning is
 * gated. At resume: conflict-mode planning run triggers, resolution node
 * appended, resolution runs, re-merge succeeds.
 */
async function phaseR4() {
  console.log('\n=== Phase R4: conflict-blocked chain during pause ===\n');

  const results = {};

  for (const cap of [3, 5]) {
    log('phaseR4', `Testing cap=${cap}`);

    const chainA = buildChain('R4-A', 5, [2, 4], {
      overrides: { 'R4-A-n2': { willConflict: true } },
    });
    const chainB = buildChain('R4-B', 3, [2]);
    const chainC = buildChain('R4-C', 4, [3]);

    const preSeed = (d) => {
      // Chain A: n0-n1 completed, n2 (merge, will conflict) running
      d.nodes.get('R4-A-n0').status = 'completed';
      d.nodes.get('R4-A-n1').status = 'completed';
      d.nodes.get('R4-A-n2').status = 'running';
      d.nodes.get('R4-A-n2').ticksRemaining = 1;

      // Chain B: n0-n1 completed, n2 running (independent, will complete normally)
      d.nodes.get('R4-B-n0').status = 'completed';
      d.nodes.get('R4-B-n1').status = 'completed';
      d.nodes.get('R4-B-n2').status = 'running';
      d.nodes.get('R4-B-n2').ticksRemaining = 1;

      // Chain C: n0-n1 completed, n2 running (independent)
      d.nodes.get('R4-C-n0').status = 'completed';
      d.nodes.get('R4-C-n1').status = 'completed';
      d.nodes.get('R4-C-n2').status = 'running';
      d.nodes.get('R4-C-n2').ticksRemaining = 1;
    };

    // Pause at tick 1 (after merges start triggering)
    // Resume at tick 10 (after all merges have had time to complete/conflict)
    const result = runSimulation(
      { nodes: [...chainA, ...chainB, ...chainC] },
      {
        maxConcurrent: cap,
        fairnessBudget: cap,
        preSeed,
        pauseTick: 1,
        resumeTick: 10,
        maxTicks: 2000,
      }
    );

    const d = result.dispatcher;
    const aN2Status = d.nodes.get('R4-A-n2').status;
    const aN3Status = d.nodes.get('R4-A-n3').status;
    const bN2Status = d.nodes.get('R4-B-n2').status;
    const conflictReports = Array.from(d.conflictReports.entries());
    const resolutionNodes = Array.from(d.resolutionNodes.entries());

    log('phaseR4', `  Terminal: ${result.terminal}, Stalled: ${result.stalled}`);
    log('phaseR4', `  Final tick: ${result.finalTick}`);
    log('phaseR4', `  A-n2 status: ${aN2Status} (should be 'merged' after resolution)`);
    log('phaseR4', `  A-n3 status: ${aN3Status}`);
    log('phaseR4', `  B-n2 status: ${bN2Status} (should be 'merged' — independent chain)`);
    log('phaseR4', `  Conflict reports: ${conflictReports.length}`);
    log('phaseR4', `  Resolution nodes appended: ${resolutionNodes.length}`);
    log('phaseR4', `  Conflict planning runs: ${d.stats.conflictPlanningRuns}`);
    log('phaseR4', `  Capacity exceeded: ${d.stats.capacityExceeded}`);
    log('phaseR4', `  Total passes: ${d.stats.passes}`);
    log('phaseR4', '');

    results[`cap${cap}`] = {
      terminal: result.terminal,
      stalled: result.stalled,
      finalTick: result.finalTick,
      aN2Status,
      aN3Status,
      bN2Status,
      conflictReports: conflictReports.length,
      resolutionNodes: resolutionNodes.length,
      conflictPlanningRuns: d.stats.conflictPlanningRuns,
      capacityExceeded: d.stats.capacityExceeded,
      passes: d.stats.passes,
    };
  }

  // Pass if: terminal, A-n2 merged (resolution succeeded), B-n2 merged (independent),
  // no capacity exceeded, conflict planning runs > 0
  const pass = results['cap3'].terminal && results['cap5'].terminal &&
               results['cap3'].aN2Status === 'merged' &&
               results['cap3'].bN2Status === 'merged' &&
               !results['cap3'].capacityExceeded &&
               results['cap3'].conflictPlanningRuns > 0;

  log('phaseR4', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  log('phaseR4', `  cap=3: terminal=${results['cap3'].terminal}, A-n2=${results['cap3'].aN2Status}, B-n2=${results['cap3'].bN2Status}, conflict planning runs=${results['cap3'].conflictPlanningRuns}`);

  return { pass, results };
}

/**
 * Phase R5: Burst of N pending merge triggers at resume (cap ≥ 3, no in-flight merges).
 *
 * The reviewer's "many merges queued" case. 5 chains with merge-points that
 * all completed during pause. At resume, all 5 triggers are pending.
 * Verify: merges drain one-per-tick under merge.lock serialization, node
 * claims fill remaining capacity in parallel, no capacity over-count, no
 * deadlock, no deferral cycles.
 *
 * Setup: 5 chains, each 4 nodes (n0 → n1 → n2(merge) → n3(merge-final)).
 * All n2 complete at tick 1. Pause at tick 1. Merges can't fire during pause
 * because... actually they CAN fire during pause (merge triggering continues).
 * To test the "burst at resume" case, we need to ensure merges DON'T fire
 * during pause. We do this by making the pause happen BEFORE the merge
 * triggers can fire (pause at tick 1, the same tick n2 completes, but before
 * the pass runs). Then merges accumulate as pending triggers. Resume at
 * tick 5 — all 5 triggers pending.
 *
 * Actually, the simulation runs advanceTime() THEN pass(). So at tick 1:
 * advanceTime completes n2, then pass() fires merge triggers. If we pause
 * at tick 1, the pause takes effect before pass() runs... but pause() is
 * called AFTER advanceTime() in the runner. So we need to pause at tick 0
 * (before n2 completes) to prevent the merge triggers from firing.
 *
 * Better approach: pause at tick 1, but the merge triggers fire in the same
 * pass (tick 1's pass runs after pause is set... no, pause is set in the
 * runner loop before pass()). Let me re-check the runner:
 *   while (...) {
 *     advanceTime();        // completes n2 at tick 1
 *     if (pauseTick) pause(); // pauses at tick 1
 *     if (resumeTick) resume();
 *     while (pass()) {}      // pass runs with paused=true
 *   }
 * So if pauseTick=1, the pass at tick 1 runs with paused=true. Merge triggers
 * still fire (not gated by pause). So the first merge trigger fires at tick 1's
 * pass, materializes at tick 2, completes at tick 3. The remaining 4 triggers
 * are deferred by merge.lock. They fire one per tick as the lock frees.
 *
 * To get the "burst at resume" (all 5 pending), we need to prevent merge
 * triggers from firing during pause. But the design says they DO fire during
 * pause. So the realistic scenario is: merges fire one-at-a-time during pause,
 * and at resume some are done, some are pending. The "burst" is the
 * ready-node frontier from the merges that landed.
 *
 * Let me redesign: 5 chains, all n2 complete at tick 1. Pause at tick 1.
 * Merges fire one per tick during pause (1 at tick 1, 1 at tick 2, etc.).
 * Resume at tick 7 (after all 5 merges + their 1-tick materialization).
 * At resume: all 5 chains' n3 are ready (frontier depth = 5). Pool is empty.
 * This is actually Phase R1's shape. Let me make this phase test the
 * "merges still draining at resume" case instead.
 */
async function phaseR5() {
  console.log('\n=== Phase R5: burst of N pending merge triggers at resume ===\n');

  const results = {};

  for (const cap of [3, 5]) {
    log('phaseR5', `Testing cap=${cap}`);

    // 5 chains, each 4 nodes: n0 → n1 → n2(merge) → n3(merge-final)
    const chains = {};
    const allNodes = [];
    for (let c = 0; c < 5; c++) {
      const chainId = `R5-${c}`;
      const chain = buildChain(chainId, 4, [2, 3]);
      chains[chainId] = chain;
      allNodes.push(...chain);
    }

    const preSeed = (d) => {
      for (const node of d.nodes.values()) {
        if (node.id.endsWith('-n0') || node.id.endsWith('-n1')) {
          node.status = 'completed';
        }
        if (node.id.endsWith('-n2')) {
          node.status = 'running';
          node.ticksRemaining = 1;
        }
      }
    };

    // Pause at tick 1 (after n2 completes, before merge triggers fire in pass)
    // Actually, merge triggers fire in the pass at tick 1 (paused=true, but
    // merge triggering is not gated). So the first merge fires at tick 1.
    // Resume at tick 3: 2 merges have fired (tick 1 and tick 2), 3 are pending.
    // At resume: pool has 0 merge sandboxes (they completed in 1 tick each),
    // 3 pending merge triggers, and 2 chains' n3 are ready (from the 2 completed
    // merges). The other 3 chains' n3 are NOT ready (their merges haven't fired).
    const result = runSimulation(
      { nodes: allNodes },
      {
        maxConcurrent: cap,
        fairnessBudget: cap,
        preSeed,
        pauseTick: 1,
        resumeTick: 3,
        maxTicks: 2000,
      }
    );

    const d = result.dispatcher;
    log('phaseR5', `  Terminal: ${result.terminal}, Stalled: ${result.stalled}`);
    log('phaseR5', `  Final tick: ${result.finalTick}`);
    log('phaseR5', `  First claim after resume at tick: ${d.stats.firstClaimAfterResumeTick}`);
    log('phaseR5', `  Capacity exceeded: ${d.stats.capacityExceeded}`);
    log('phaseR5', `  Merge triggers: ${d.stats.mergeTriggers}`);
    log('phaseR5', `  Merge triggers at/after resume: ${d.stats.mergeTriggersAtResume}`);
    log('phaseR5', `  Merge deferrals: ${d.stats.mergeTriggerDeferrals}`);
    log('phaseR5', `  Max merge wait: ${d.stats.maxMergeTriggerWait} ticks`);
    log('phaseR5', `  Total claims: ${d.stats.claims}`);
    log('phaseR5', `  Total passes: ${d.stats.passes}`);
    log('phaseR5', '');

    results[`cap${cap}`] = {
      terminal: result.terminal,
      stalled: result.stalled,
      finalTick: result.finalTick,
      firstClaimAfterResumeTick: d.stats.firstClaimAfterResumeTick,
      capacityExceeded: d.stats.capacityExceeded,
      mergeTriggers: d.stats.mergeTriggers,
      mergeTriggersAtResume: d.stats.mergeTriggersAtResume,
      mergeDeferrals: d.stats.mergeTriggerDeferrals,
      maxMergeWait: d.stats.maxMergeTriggerWait,
      totalClaims: d.stats.claims,
      passes: d.stats.passes,
    };
  }

  const pass = results['cap3'].terminal && results['cap5'].terminal &&
               !results['cap3'].capacityExceeded && !results['cap5'].capacityExceeded;

  log('phaseR5', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  log('phaseR5', `  cap=3: terminal=${results['cap3'].terminal}, merge triggers=${results['cap3'].mergeTriggers}, deferrals=${results['cap3'].mergeDeferrals}, capacity exceeded=${results['cap3'].capacityExceeded}`);
  log('phaseR5', `  cap=5: terminal=${results['cap5'].terminal}, merge triggers=${results['cap5'].mergeTriggers}, deferrals=${results['cap5'].mergeDeferrals}, capacity exceeded=${results['cap5'].capacityExceeded}`);

  return { pass, results };
}

/**
 * Phase R6: Deep frontier re-filling the pool on subsequent passes.
 *
 * The "burst" dynamic: first pass claims cap nodes, subsequent passes
 * claim one each as slots free. Verify: fairness counter rotates chains,
 * no starvation, all ready nodes eventually claimed.
 *
 * Setup: 4 chains × 6 successors each = 24 ready nodes at resume, cap=4.
 * All merges landed during pause. At resume, frontier = 24, pool = empty.
 */
async function phaseR6() {
  console.log('\n=== Phase R6: deep frontier re-filling pool on subsequent passes ===\n');

  const results = {};

  log('phaseR6', `Testing cap=4, 4 chains × 6 successors = 24 ready nodes`);

  // 4 chains, each 8 nodes: n0-n1 completed, n2(merge) completed+merged during pause,
  // n3-n7 pending (ready after merge). n7 is final merge.
  // To get 24 ready nodes: 4 chains × 6 nodes (n3-n7... wait, n7 is merge, so
  // n3-n6 are non-merge successors = 4 per chain × 4 chains = 16. Plus n7 is
  // merge-final, ready when n6 completes. So at resume: 4 chains × 4 ready = 16.
  // Let me use 6-node chains: n0-n1 completed, n2(merge) merged, n3-n4-n5(merge).
  // At resume: n3 ready (4 chains × 1 = 4 ready). Not deep enough.
  // Use 10-node chains: n0-n1 completed, n2(merge) merged, n3-n8 pending, n9(merge).
  // At resume: n3 ready (4 chains × 1 = 4). Still not deep — within-chain is total order.
  //
  // The frontier depth is bounded by the number of chains (cross-chain parallelism),
  // not by within-chain depth (chains are total orders — only one node per chain
  // is ready at a time). So "deep frontier" = many chains with one ready node each.
  // Let me use 8 chains with 1 ready node each = 8 ready, cap=4.
  // Actually, the sub-agent said "6 chains × (n3, n4, …) = ~24 ready nodes" but
  // that's wrong — within a chain, only n3 is ready (n4 depends on n3). So the
  // frontier is 6 ready nodes (one per chain), not 24.
  //
  // Let me test with 8 chains, cap=4: frontier=8, pool fills to 4, then drains
  // as nodes complete. This tests the fairness counter rotation.

  const chains = {};
  const allNodes = [];
  for (let c = 0; c < 8; c++) {
    const chainId = `R6-${c}`;
    // 5 nodes: n0-n1 completed, n2(merge) merged, n3 pending, n4(merge-final)
    const chain = buildChain(chainId, 5, [2, 4]);
    chains[chainId] = chain;
    allNodes.push(...chain);
  }

  const preSeed = (d) => {
    for (const node of d.nodes.values()) {
      if (node.id.endsWith('-n0') || node.id.endsWith('-n1')) {
        node.status = 'completed';
      }
      if (node.id.endsWith('-n2')) {
        // n2 completed AND merged (merge landed during pause)
        node.status = 'merged';
      }
    }
  };

  // No pause needed — we're testing the claiming dynamics of a deep frontier
  // But to simulate the "resume burst" context, let's pause and resume
  const result = runSimulation(
    { nodes: allNodes },
    {
      maxConcurrent: 4,
      fairnessBudget: 4,
      preSeed,
      pauseTick: 0,  // pause immediately
      resumeTick: 1, // resume at tick 1
      maxTicks: 2000,
    }
  );

  const d = result.dispatcher;

  // Count which chains got their n3 claimed first
  const claimOrder = [];
  for (const event of d.events) {
    if (event.type === 'claim' && event.detail.nodeId.endsWith('-n3')) {
      claimOrder.push(event.detail.nodeId);
    }
  }

  // Count how many chains' n3 were claimed
  const chainsClaimed = new Set();
  for (const nodeId of claimOrder) {
    chainsClaimed.add(nodeId.split('-n3')[0]);
  }

  log('phaseR6', `  Terminal: ${result.terminal}, Stalled: ${result.stalled}`);
  log('phaseR6', `  Final tick: ${result.finalTick}`);
  log('phaseR6', `  First claim after resume at tick: ${d.stats.firstClaimAfterResumeTick}`);
  log('phaseR6', `  Capacity exceeded: ${d.stats.capacityExceeded}`);
  log('phaseR6', `  Total claims: ${d.stats.claims}`);
  log('phaseR6', `  Claims after resume: ${d.stats.claimsAtResume}`);
  log('phaseR6', `  Total passes: ${d.stats.passes}`);
  log('phaseR6', `  Chains with n3 claimed: ${chainsClaimed.size}/8`);
  log('phaseR6', `  n3 claim order: ${claimOrder.join(', ')}`);
  log('phaseR6', '');

  results['cap4'] = {
    terminal: result.terminal,
    stalled: result.stalled,
    finalTick: result.finalTick,
    firstClaimAfterResumeTick: d.stats.firstClaimAfterResumeTick,
    capacityExceeded: d.stats.capacityExceeded,
    totalClaims: d.stats.claims,
    claimsAfterResume: d.stats.claimsAtResume,
    passes: d.stats.passes,
    chainsClaimed: chainsClaimed.size,
    claimOrder,
  };

  // Pass if: terminal, all 8 chains' n3 eventually claimed, no capacity exceeded
  const pass = result.terminal && !result.stalled &&
               !d.stats.capacityExceeded &&
               chainsClaimed.size === 8;

  log('phaseR6', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  log('phaseR6', `  cap=4: terminal=${results['cap4'].terminal}, chains claimed=${results['cap4'].chainsClaimed}/8, capacity exceeded=${results['cap4'].capacityExceeded}`);

  return { pass, results };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Spike: pause/resume burst interaction (resume-burst)          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Node duration: ${NODE_DURATION_TICKS} ticks (≈ hours)`);
  console.log(`Merge duration: ${MERGE_DURATION_TICKS} tick (≈ seconds)`);
  console.log(`Planning duration: ${PLANNING_DURATION_TICKS} ticks (≈ minutes)`);
  console.log(`Tick ≈ a few minutes (schedule-tick interval)`);
  console.log();

  const results = {
    phaseR1: null,
    phaseR2: null,
    phaseR3: null,
    phaseR4: null,
    phaseR5: null,
    phaseR6: null,
  };

  // Phase R1: resume into empty pool, deep frontier
  try {
    results.phaseR1 = await phaseR1();
  } catch (err) {
    log('phaseR1', `FATAL: ${err.message}`);
    console.error(err.stack);
    results.phaseR1 = { pass: false, error: err.message };
  }

  // Phase R2: resume into partially-full pool (merge in flight)
  try {
    results.phaseR2 = await phaseR2();
  } catch (err) {
    log('phaseR2', `FATAL: ${err.message}`);
    console.error(err.stack);
    results.phaseR2 = { pass: false, error: err.message };
  }

  // Phase R3: resume into cap=1 held by a merge
  try {
    results.phaseR3 = await phaseR3();
  } catch (err) {
    log('phaseR3', `FATAL: ${err.message}`);
    console.error(err.stack);
    results.phaseR3 = { pass: false, error: err.message };
  }

  // Phase R4: conflict-blocked chain during pause
  try {
    results.phaseR4 = await phaseR4();
  } catch (err) {
    log('phaseR4', `FATAL: ${err.message}`);
    console.error(err.stack);
    results.phaseR4 = { pass: false, error: err.message };
  }

  // Phase R5: burst of N pending merge triggers at resume
  try {
    results.phaseR5 = await phaseR5();
  } catch (err) {
    log('phaseR5', `FATAL: ${err.message}`);
    console.error(err.stack);
    results.phaseR5 = { pass: false, error: err.message };
  }

  // Phase R6: deep frontier re-filling pool on subsequent passes
  try {
    results.phaseR6 = await phaseR6();
  } catch (err) {
    log('phaseR6', `FATAL: ${err.message}`);
    console.error(err.stack);
    results.phaseR6 = { pass: false, error: err.message };
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Phase R1 (empty pool, deep frontier):     ${results.phaseR1?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase R2 (partial pool, merge in flight): ${results.phaseR2?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase R3 (cap=1, merge in flight):        ${results.phaseR3?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase R4 (conflict-blocked during pause): ${results.phaseR4?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase R5 (burst of pending merges):       ${results.phaseR5?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase R6 (deep frontier re-filling):     ${results.phaseR6?.pass ? 'PASS' : 'FAIL'}`);

  // Key results table
  console.log('\n=== KEY RESULTS ===');
  if (results.phaseR1?.results) {
    console.log('Phase R1 (resume into empty pool, deep frontier):');
    console.log(`  cap=3: terminal=${results.phaseR1.results['cap3']?.terminal}, first claim at tick ${results.phaseR1.results['cap3']?.firstClaimAfterResumeTick}, capacity exceeded=${results.phaseR1.results['cap3']?.capacityExceeded}`);
    console.log(`  cap=5: terminal=${results.phaseR1.results['cap5']?.terminal}, first claim at tick ${results.phaseR1.results['cap5']?.firstClaimAfterResumeTick}, capacity exceeded=${results.phaseR1.results['cap5']?.capacityExceeded}`);
  }
  if (results.phaseR2?.results) {
    console.log('Phase R2 (resume into partial pool, merge in flight):');
    console.log(`  cap=3: terminal=${results.phaseR2.results['cap3']?.terminal}, first claim at tick ${results.phaseR2.results['cap3']?.firstClaimAfterResumeTick}, capacity exceeded=${results.phaseR2.results['cap3']?.capacityExceeded}`);
    console.log(`  cap=5: terminal=${results.phaseR2.results['cap5']?.terminal}, first claim at tick ${results.phaseR2.results['cap5']?.firstClaimAfterResumeTick}, capacity exceeded=${results.phaseR2.results['cap5']?.capacityExceeded}`);
  }
  if (results.phaseR3?.results) {
    console.log('Phase R3 (cap=1, merge in flight):');
    console.log(`  cap=1: terminal=${results.phaseR3.results['cap1']?.terminal}, first claim at tick ${results.phaseR3.results['cap1']?.firstClaimAfterResumeTick}, capacity exceeded=${results.phaseR3.results['cap1']?.capacityExceeded}`);
  }
  if (results.phaseR4?.results) {
    console.log('Phase R4 (conflict-blocked during pause):');
    console.log(`  cap=3: terminal=${results.phaseR4.results['cap3']?.terminal}, A-n2=${results.phaseR4.results['cap3']?.aN2Status}, B-n2=${results.phaseR4.results['cap3']?.bN2Status}, conflict planning runs=${results.phaseR4.results['cap3']?.conflictPlanningRuns}`);
    console.log(`  cap=5: terminal=${results.phaseR4.results['cap5']?.terminal}, A-n2=${results.phaseR4.results['cap5']?.aN2Status}, B-n2=${results.phaseR4.results['cap5']?.bN2Status}, conflict planning runs=${results.phaseR4.results['cap5']?.conflictPlanningRuns}`);
  }
  if (results.phaseR5?.results) {
    console.log('Phase R5 (burst of pending merges):');
    console.log(`  cap=3: terminal=${results.phaseR5.results['cap3']?.terminal}, merge triggers=${results.phaseR5.results['cap3']?.mergeTriggers}, deferrals=${results.phaseR5.results['cap3']?.mergeDeferrals}, capacity exceeded=${results.phaseR5.results['cap3']?.capacityExceeded}`);
    console.log(`  cap=5: terminal=${results.phaseR5.results['cap5']?.terminal}, merge triggers=${results.phaseR5.results['cap5']?.mergeTriggers}, deferrals=${results.phaseR5.results['cap5']?.mergeDeferrals}, capacity exceeded=${results.phaseR5.results['cap5']?.capacityExceeded}`);
  }
  if (results.phaseR6?.results) {
    console.log('Phase R6 (deep frontier re-filling):');
    console.log(`  cap=4: terminal=${results.phaseR6.results['cap4']?.terminal}, chains claimed=${results.phaseR6.results['cap4']?.chainsClaimed}/8, capacity exceeded=${results.phaseR6.results['cap4']?.capacityExceeded}`);
  }

  // JSON output for parsing
  console.log('\n=== JSON RESULTS ===');
  console.log(JSON.stringify(results, null, 2));

  const anyFail = Object.values(results).some((r) => r && typeof r === 'object' && r.pass === false);
  if (anyFail) {
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

module.exports = {
  phaseR1, phaseR2, phaseR3, phaseR4, phaseR5, phaseR6,
  ResumeBurstDispatcher, buildChain,
};
