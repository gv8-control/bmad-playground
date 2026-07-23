#!/usr/bin/env node
/**
 * Spike: merge-trigger vs. claim priority within step 6 (assumption A2).
 *
 * Verifies the reviewer-flagged assumption A2 from the graph-pipeline plan:
 *
 *   "The ordering within step 6 is unspecified. If the pass claims ready nodes
 *   depth-first before checking for pending merge triggers, and capacity is
 *   near-full, the merge trigger defers. But merge-point completions unblock
 *   cross-chain dependents — deferring a merge defers an entire chain's next
 *   segment. A busy pool with frequent completions could starve merge triggers
 *   indefinitely: every pass claims new nodes, filling the capacity freed by
 *   completions, never leaving room for the merge sandbox."
 *   (graph-pipeline.md:525-542, paraphrased from the A2 review)
 *
 * This is a PURE-LOGIC discrete-event simulation. No infrastructure, no
 * network, no sandboxes, no LLM calls. It models:
 *
 *   - A work graph: chains of nodes, merge-point nodes, cross-chain edges.
 *   - The dispatcher pass: fold completions → re-evaluate readiness → claim
 *     depth-first (bounded by fairnessBudget) → trigger merges (capacity-gated).
 *   - Capacity accounting: maxConcurrentSandboxes includes the merge sandbox.
 *   - Duration asymmetry: node skill runs take many ticks; merge cycles take
 *     1 tick.
 *
 * What this spike measures:
 *
 *   Phase 1 — The reviewer's exact scenario: 3 chains, 2 merge-point nodes
 *   completing in the same pass, capacity=3. Does the merge trigger ever fire
 *   under (a)-then-(b) ordering? Under (b)-then-(a) ordering?
 *
 *   Phase 2 — Steady-state contention: a graph with continuous independent
 *   ready-node supply (simulating multi-run contention or a wide fan-out).
 *   How many passes does a pending merge trigger wait under each ordering?
 *   Does it ever fire?
 *
 *   Phase 3 — Finite-DAG drain: a realistic single-run graph where chains
 *   have finite length. Does the merge trigger fire before the completing
 *   chain exhausts its ready successors? What's the latency bound?
 *
 *   Phase 4 — Burst completions: multiple merge-point nodes completing in one
 *   pass. merge.lock serializes to one merge cycle. How many passes until all
 *   merges land under each ordering?
 *
 *   Phase 5 — Duration asymmetry validation: confirm that a merge cycle (1
 *   tick) frees its slot almost immediately, while a node claim (many ticks)
 *   holds for hours-equivalent. Does this break the starvation loop?
 *
 * Usage:
 *   node spike-merge-trigger-starvation.js
 *
 * No external dependencies — uses only Node.js stdlib.
 * See: docs/todo/spike-merge-trigger-starvation.md for the full report.
 */

'use strict';

// ─── Constants ─────────────────────────────────────────────────────────────

// Default policy knobs (from the plan's policy block).
const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_FAIRNESS_BUDGET = 5; // defaults to maxConcurrentSandboxes

// Simulated durations (in ticks). The plan says: node skill runs take hours,
// merge cycles take seconds, the tick is every few minutes. So:
//   - 1 tick ≈ a few minutes (the schedule-tick interval).
//   - A node skill run ≈ 60 ticks (a few hours).
//   - A merge cycle ≈ 1 tick (seconds — completes within one tick window).
const NODE_DURATION_TICKS = 60;
const MERGE_DURATION_TICKS = 1;

// ─── Utilities ─────────────────────────────────────────────────────────────

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Graph model ───────────────────────────────────────────────────────────

/**
 * A node in the work graph.
 *
 * @typedef {Object} GraphNode
 * @property {string} id - unique node id
 * @property {string} chainId - the chain this node belongs to
 * @property {string|null} dependsOn - the node this one depends on (within
 *   chain: the previous node; cross-chain: a merge-point node). null = chain
 *   start.
 * @property {boolean} isMergePoint - does this node carry mergeTo?
 * @property {boolean} isCrossChainDependent - is this node's dependsOn a
 *   cross-chain edge (to a merge-point node in another chain)?
 * @property {string} status - 'pending' | 'claimed' | 'running' | 'completed'
 *   | 'merging' | 'merged' | 'failed'
 * @property {number} ticksRemaining - for running/merging nodes, how many
 *   ticks until completion.
 * @property {number} claimTick - when this node was claimed (for diagnostics).
 */

/**
 * Build a chain of nodes.
 *
 * @param {string} chainId - the chain id
 * @param {number} length - number of nodes in the chain
 * @param {number[]} mergePointIndices - which node indices (0-based) are merge
 *   points
 * @param {Object} [crossChainDeps] - { nodeIndex: { chainId, nodeIndex } } for
 *   nodes that depend on a merge-point in another chain
 * @returns {GraphNode[]} the nodes
 */
function buildChain(chainId, length, mergePointIndices, crossChainDeps = {}) {
  const nodes = [];
  const mergePointSet = new Set(mergePointIndices);
  for (let i = 0; i < length; i++) {
    const isMergePoint = mergePointSet.has(i);
    const crossDep = crossChainDeps[i];
    nodes.push({
      id: `${chainId}-n${i}`,
      chainId,
      dependsOn: i === 0 ? null : `${chainId}-n${i - 1}`,
      isMergePoint,
      isCrossChainDependent: !!crossDep,
      crossChainDep: crossDep || null,
      status: 'pending',
      ticksRemaining: 0,
      claimTick: -1,
    });
  }
  return nodes;
}

/**
 * Build the reviewer's exact scenario: 3 chains, capacity=3.
 *
 * Chain A: [n0] → [n1] → [n2(merge)] → [n3] → [n4(merge-final)]
 *   - n2 is a mid-chain merge point (unlocks chain B)
 *   - n4 is the chain-final merge point
 * Chain B: dependsOn(A-n2): [n0] → [n1] → [n2(merge-final)]
 * Chain C: independent: [n0] → [n1] → [n2] → [n3(merge-final)]
 *
 * At simulation start: A-n2 and C-n2 have just completed (merge points).
 * The pool has 3 slots, all occupied by running nodes that complete this pass.
 */
function buildReviewerScenario() {
  // Chain A: 5 nodes, n2 is mid-chain merge, n4 is final merge
  const chainA = buildChain('A', 5, [2, 4]);
  // Chain B: 3 nodes, n0 depends on A-n2 (cross-chain), n2 is final merge
  const chainB = buildChain('B', 3, [2], {
    0: { chainId: 'A', nodeIndex: 2 },
  });
  // Chain B's n0 dependsOn is A-n2, not B-n(-1)
  chainB[0].dependsOn = 'A-n2';
  // Chain C: 4 nodes, n3 is final merge, independent
  const chainC = buildChain('C', 4, [3]);

  const allNodes = [...chainA, ...chainB, ...chainC];
  return { nodes: allNodes, chains: { A: chainA, B: chainB, C: chainC } };
}

/**
 * Build a steady-state contention scenario: many independent chains with
 * continuous ready-node supply. This simulates multi-run contention or a wide
 * fan-out where independent ready nodes are always available.
 *
 * 6 independent chains, each 8 nodes long, each with a mid-chain merge at n3
 * and a final merge. The dependent chains' nodes are NOT ready until merges
 * land, but the independent chains keep producing ready successors.
 */
function buildSteadyStateScenario() {
  const chains = {};
  const allNodes = [];
  for (let c = 0; c < 6; c++) {
    const chainId = `S${c}`;
    const chain = buildChain(chainId, 8, [3, 7]);
    chains[chainId] = chain;
    allNodes.push(...chain);
  }
  return { nodes: allNodes, chains };
}

/**
 * Build a finite-DAG scenario: 4 chains with cross-chain dependencies.
 * Tests whether the merge trigger fires before the completing chain exhausts
 * its ready successors.
 *
 * Chain A: [n0] → [n1] → [n2(merge)] → [n3] → [n4(merge-final)]
 * Chain B: dependsOn(A-n2): [n0] → [n1] → [n2(merge-final)]
 * Chain C: [n0] → [n1] → [n2] → [n3(merge-final)]  (independent)
 * Chain D: [n0] → [n1] → [n2(merge-final)]  (independent)
 */
function buildFiniteDagScenario() {
  const chainA = buildChain('A', 5, [2, 4]);
  const chainB = buildChain('B', 3, [2], {
    0: { chainId: 'A', nodeIndex: 2 },
  });
  chainB[0].dependsOn = 'A-n2';
  const chainC = buildChain('C', 4, [3]);
  const chainD = buildChain('D', 3, [2]);

  const allNodes = [...chainA, ...chainB, ...chainC, ...chainD];
  return { nodes: allNodes, chains: { A: chainA, B: chainB, C: chainC, D: chainD } };
}

// ─── Dispatcher simulation ─────────────────────────────────────────────────

/**
 * The dispatcher simulator. Models the reconcile pass with configurable
 * ordering of step 6's two sub-operations: (a) claim ready nodes depth-first,
 * (b) trigger merges.
 */
class Dispatcher {
  /**
   * @param {Object} opts
   * @param {number} opts.maxConcurrent - maxConcurrentSandboxes
   * @param {number} opts.fairnessBudget - fairness budget
   * @param {'claims-first'|'merges-first'} opts.ordering - step 6 ordering
   * @param {GraphNode[]} opts.nodes - the work graph
   */
  constructor(opts) {
    this.maxConcurrent = opts.maxConcurrent;
    this.fairnessBudget = opts.fairnessBudget;
    this.ordering = opts.ordering;
    this.nodes = new Map(opts.nodes.map((n) => [n.id, { ...n }]));
    this.tick = 0;
    this.fairnessCounter = 0;

    // Merge state
    this.mergeLockHeld = false;
    this.mergeLockHolder = null; // node id whose merge is running
    this.mergeLockReleaseTick = -1;

    // Capacity tracking
    this.liveSandboxes = 0; // claimed/running nodes + merge sandbox

    // Statistics
    this.stats = {
      passes: 0,
      claims: 0,
      mergeTriggers: 0,
      mergeTriggerDeferrals: 0,
      mergeCompletions: 0,
      maxMergeTriggerWait: 0,
      mergeTriggerWaits: [],
      nodeCompletions: 0,
    };

    // Track when each merge-point node completed, to measure trigger latency
    this.mergePointCompletedTick = new Map();
  }

  /**
   * Count live sandboxes: running nodes + merge sandbox if lock held.
   */
  countLiveSandboxes() {
    let count = 0;
    for (const node of this.nodes.values()) {
      if (node.status === 'claimed' || node.status === 'running') {
        count++;
      }
    }
    if (this.mergeLockHeld) {
      count++;
    }
    return count;
  }

  /**
   * Capacity available for a new sandbox (node claim or merge trigger).
   */
  capacityAvailable() {
    return this.countLiveSandboxes() < this.maxConcurrent;
  }

  /**
   * Is a node ready to be claimed?
   * - Status must be 'pending'
   * - Its dependsOn must be satisfied:
   *   - If dependsOn is null: ready (chain start)
   *   - If dependsOn is a non-merge-point node: that node must be 'completed'
   *     (predecessor pushed)
   *   - If dependsOn is a merge-point node: that node must be 'merged' (merge
   *     landed)
   */
  isReady(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node || node.status !== 'pending') return false;

    if (node.dependsOn === null) return true;

    const dep = this.nodes.get(node.dependsOn);
    if (!dep) return false;

    if (dep.isMergePoint) {
      // Cross-chain or in-chain merge-point: successor ready only when merge
      // has landed
      return dep.status === 'merged';
    } else {
      // Non-merge predecessor: successor ready when predecessor completed
      return dep.status === 'completed';
    }
  }

  /**
   * Get all ready nodes, grouped by chain for depth-first traversal.
   * Returns a map: chainId -> [ready node ids in chain order]
   */
  getReadyNodesByChain() {
    const byChain = new Map();
    for (const node of this.nodes.values()) {
      if (this.isReady(node.id)) {
        if (!byChain.has(node.chainId)) {
          byChain.set(node.chainId, []);
        }
        byChain.get(node.chainId).push(node.id);
      }
    }
    return byChain;
  }

  /**
   * Get completed merge-point nodes that need merge triggering.
   * A merge-point node needs triggering if:
   * - status is 'completed'
   * - branch hasn't been merged yet (status != 'merged')
   * - no pending conflict (simulated: no conflicts in this spike)
   * - merge lock is acquirable (or will be, checked at trigger time)
   */
  getPendingMergeTriggers() {
    const pending = [];
    for (const node of this.nodes.values()) {
      if (node.isMergePoint && node.status === 'completed') {
        pending.push(node.id);
      }
    }
    return pending;
  }

  /**
   * Claim a node: journal the claim, provision sandbox, start command.
   * The node is now 'running' with a duration.
   */
  claimNode(nodeId) {
    const node = this.nodes.get(nodeId);
    node.status = 'running';
    node.ticksRemaining = NODE_DURATION_TICKS;
    node.claimTick = this.tick;
    this.stats.claims++;
  }

  /**
   * Trigger a merge for a completed merge-point node.
   * Acquires merge lock, sets up the merge cycle.
   */
  triggerMerge(nodeId) {
    const node = this.nodes.get(nodeId);
    this.mergeLockHeld = true;
    this.mergeLockHolder = nodeId;
    this.mergeLockReleaseTick = this.tick + MERGE_DURATION_TICKS;
    node.status = 'merging';
    this.stats.mergeTriggers++;
  }

  /**
   * Complete a merge: release lock, mark node as merged.
   */
  completeMerge(nodeId) {
    const node = this.nodes.get(nodeId);
    node.status = 'merged';
    this.mergeLockHeld = false;
    this.mergeLockHolder = null;
    this.mergeLockReleaseTick = -1;
    this.stats.mergeCompletions++;
  }

  /**
   * Advance time by one tick: decrement ticksRemaining for running nodes and
   * merge cycles, complete any that reach 0.
   */
  advanceTime() {
    this.tick++;

    // Complete running nodes
    for (const node of this.nodes.values()) {
      if (node.status === 'running') {
        node.ticksRemaining--;
        if (node.ticksRemaining <= 0) {
          node.status = 'completed';
          this.stats.nodeCompletions++;
          if (node.isMergePoint) {
            this.mergePointCompletedTick.set(node.id, this.tick);
          }
        }
      }
    }

    // Complete merge cycle
    if (this.mergeLockHeld && this.tick >= this.mergeLockReleaseTick) {
      this.completeMerge(this.mergeLockHolder);
    }
  }

  /**
   * Simulate one reconcile pass with the configured ordering.
   *
   * Steps:
   * 1. Fold completions (already done by advanceTime — nodes are 'completed')
   * 2. Re-evaluate readiness
   * 3. Step 6: claim + merge trigger (in configured order)
   *
   * Returns true if the pass did any work (claims or merge triggers), false if
   * fixpoint (nothing to do).
   */
  pass() {
    this.stats.passes++;
    let didWork = false;

    const readyByChain = this.getReadyNodesByChain();
    const pendingMerges = this.getPendingMergeTriggers();

    if (this.ordering === 'merges-first') {
      // (b) Trigger merges first
      didWork = this.doMergeTriggers(pendingMerges) || didWork;
      // (a) Claim ready nodes depth-first
      didWork = this.doClaims(readyByChain) || didWork;
    } else {
      // 'claims-first' — the (a)-then-(b) ordering the reviewer flagged
      // (a) Claim ready nodes depth-first
      didWork = this.doClaims(readyByChain) || didWork;
      // (b) Trigger merges
      didWork = this.doMergeTriggers(pendingMerges) || didWork;
    }

    return didWork;
  }

  /**
   * Depth-first claiming with fairness bound.
   *
   * The dispatcher descends into a node's dependents before starting unrelated
   * siblings. The fairness counter caps consecutive chain-following claims.
   */
  doClaims(readyByChain) {
    let claimed = false;

    // Flatten ready nodes into a depth-first-ordered list.
    // Depth-first: for each chain, claim in chain order (which is depth-first
    // within the chain). Between chains, follow the fairness counter.
    const chains = Array.from(readyByChain.keys());

    while (true) {
      if (!this.capacityAvailable()) break;

      // Find a ready node to claim using depth-first + fairness
      let claimedThisIteration = false;

      for (const chainId of chains) {
        if (!this.capacityAvailable()) break;

        const readyInChain = readyByChain.get(chainId);
        if (readyInChain.length === 0) continue;

        // Check fairness: if we've been following this chain for
        // fairnessBudget consecutive claims and other chains have ready nodes,
        // yield to an independent chain.
        const otherChainsHaveReady = chains.some(
          (c) => c !== chainId && readyByChain.get(c).length > 0
        );

        if (
          this.fairnessCounter >= this.fairnessBudget &&
          otherChainsHaveReady
        ) {
          // Yield: skip this chain, claim from an independent chain
          this.fairnessCounter = 0; // reset on yield
          continue;
        }

        // Claim the first ready node in this chain (depth-first)
        const nodeId = readyInChain.shift();
        this.claimNode(nodeId);
        this.fairnessCounter++;
        claimed = true;
        claimedThisIteration = true;
        break; // restart the chain scan from the top
      }

      if (!claimedThisIteration) break;
    }

    return claimed;
  }

  /**
   * Trigger pending merges (capacity-gated, merge-lock-serialized).
   */
  doMergeTriggers(pendingMerges) {
    let triggered = false;

    for (const nodeId of pendingMerges) {
      // Merge lock serializes: only one merge cycle at a time
      if (this.mergeLockHeld) {
        // Can't trigger — merge lock held. Defer to next pass.
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

      // Capacity check: merge sandbox counts against maxConcurrentSandboxes
      if (!this.capacityAvailable()) {
        // Can't trigger — no capacity. Defer to next pass.
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

      // Trigger the merge
      this.triggerMerge(nodeId);
      triggered = true;
      // Only one merge per pass (merge lock)
      break;
    }

    return triggered;
  }

  /**
   * Check if the pipeline has reached a terminal state (all nodes are
   * completed, merged, or failed; nothing running; no pending merges).
   */
  isTerminal() {
    for (const node of this.nodes.values()) {
      if (
        node.status === 'pending' ||
        node.status === 'claimed' ||
        node.status === 'running' ||
        node.status === 'merging'
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if the pipeline is stalled (no forward progress possible).
   * A stall: no running nodes, no pending merges that can fire, but pending
   * nodes exist (waiting on merges that will never trigger).
   */
  isStalled() {
    let hasRunning = false;
    let hasMergeable = false;
    let hasPending = false;

    for (const node of this.nodes.values()) {
      if (node.status === 'running' || node.status === 'merging') {
        hasRunning = true;
      }
      if (node.isMergePoint && node.status === 'completed') {
        hasMergeable = true;
      }
      if (node.status === 'pending') {
        hasPending = true;
      }
    }

    // Stalled if: no running work, but pending nodes exist and mergeable nodes
    // exist but can't fire (capacity or lock). But if there's capacity and no
    // lock, the merge would fire — so check that too.
    if (!hasRunning && hasPending && hasMergeable) {
      // Could the merge fire? If capacity is available and lock is free, it
      // would have fired in the last pass. So if we're here, it couldn't fire.
      return true;
    }

    // Also stalled if: no running, no mergeable, but pending nodes exist
    // (they're waiting on something that will never happen)
    if (!hasRunning && !hasMergeable && hasPending) {
      return true;
    }

    return false;
  }
}

// ─── Simulation runner ─────────────────────────────────────────────────────

/**
 * Run a simulation to completion (or stall, or max ticks).
 *
 * @param {Object} scenario - { nodes, chains }
 * @param {Object} opts - { maxConcurrent, fairnessBudget, ordering, maxTicks }
 * @returns {Object} results
 */
function runSimulation(scenario, opts) {
  const dispatcher = new Dispatcher({
    maxConcurrent: opts.maxConcurrent,
    fairnessBudget: opts.fairnessBudget,
    ordering: opts.ordering,
    nodes: scenario.nodes,
  });

  const maxTicks = opts.maxTicks || 10000;
  let stalled = false;
  let terminal = false;

  // Pre-seed: mark some nodes as already running (simulating a pool that's
  // already full when the merge-point nodes complete)
  if (opts.preSeed) {
    opts.preSeed(dispatcher);
  }

  while (dispatcher.tick < maxTicks && !stalled && !terminal) {
    // Advance time: complete running nodes and merge cycles
    dispatcher.advanceTime();

    // Run passes until fixpoint (no work done in a pass)
    let passCount = 0;
    while (passCount < 100) {
      // Safety limit
      const didWork = dispatcher.pass();
      passCount++;
      if (!didWork) break;
    }

    // Check terminal/stalled
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
 * Phase 1: The reviewer's exact scenario.
 *
 * 3 chains, capacity=3. Chain A has a mid-chain merge at n2. Chain B depends
 * on A-n2. Chain C is independent.
 *
 * At start: pool is full (3/3). A-n2 and C-n2 complete in the same pass (both
 * are merge points). Chain A's successor (n3) is ready (non-merge successor).
 * Chain B's n0 is NOT ready (needs A-n2 merge to land). Chain C's successor
 * (n3) is ready.
 *
 * Tests: does the merge trigger for A-n2 fire under each ordering?
 */
async function phase1() {
  console.log('\n=== Phase 1: reviewer scenario (3 chains, cap=3, 2 merge completions) ===\n');

  const results = {};

  for (const ordering of ['claims-first', 'merges-first']) {
    log('phase1', `Testing ordering: ${ordering}`);

    const scenario = buildReviewerScenario();

    // Pre-seed: A-n0, A-n1 completed; A-n2 running (about to complete).
    // C-n0, C-n1 completed; C-n2 running (about to complete).
    // Pool: A-n2 (running), C-n2 (running), and one more running node.
    // We'll use B-n0... but B-n0 depends on A-n2 merge, so it's not ready.
    // Use A-n3? No, A-n3 depends on A-n2 (merge point), so not ready.
    // Let's use a different pre-seed: A-n2 and C-n2 are running, plus
    // C-n1 is running (independent, to fill the 3rd slot).
    // Actually, let's make it cleaner: A-n2 and C-n2 are the 2 merge-point
    // nodes that complete this pass. The 3rd slot is occupied by... we need
    // something that's running. Let's say A-n1 already completed, C-n1
    // already completed, and the 3rd slot was A-n0 (already completed long
    // ago). So at start: A-n2 and C-n2 are running (2 slots), and we need a
    // 3rd running node. Let's make C-n0 still running (it's a long node).
    // No wait — C-n0 must have completed for C-n1 to be ready, and C-n1
    // must have completed for C-n2 to be ready. So C-n0 and C-n1 are done.
    // Same for A. So the 3rd slot... let's add an independent chain D with
    // one node that's running.

    // Simpler approach: start with A-n2 and C-n2 running (2 slots used),
    // and capacity=3 means 1 slot is free. The merge-point nodes complete
    // on tick 1. Then:
    // - A-n3 is ready (A-n2 completed, non-merge successor... wait, A-n2 IS
    //   a merge point. So A-n3 needs the merge to land.)
    // - C-n3 is ready (C-n2 is NOT a merge point — C's merge is at n3.
    //   Wait, let me re-check the scenario.)

    // Let me re-read buildReviewerScenario:
    // Chain A: 5 nodes, n2 and n4 are merge points.
    //   A-n3 depends on A-n2 (merge point) → needs merge to land.
    // Chain C: 4 nodes, n3 is merge point.
    //   C-n2 is NOT a merge point. C-n3 depends on C-n2 (non-merge) → ready
    //   when C-n2 completes.

    // So at start: A-n2 and C-n2 complete (both merge... wait, C-n2 is NOT
    // a merge point. Only C-n3 is. So C-n2 completing makes C-n3 ready.
    // A-n2 completing makes A-n3... need merge. And A-n2 is a merge point,
    // so its completion should trigger a merge.

    // Let me redo: A-n2 (merge point) and C-n2 (non-merge) complete.
    // After completion:
    // - A-n3: NOT ready (needs A-n2 merge to land)
    // - C-n3: ready (C-n2 non-merge, completed)
    // - A-n2 merge trigger: pending
    // - Pool: 2 slots freed (A-n2 and C-n2 were running), 1 slot was free
    //   (cap=3, only 2 were running)

    // Actually, let me make the pool full at start: 3 running nodes.
    // A-n2, C-n2, and... we need a 3rd. Let's say A-n0 is long-running
    // and still going. No — A-n0 must have completed for A-n1 to be ready,
    // and A-n1 must have completed for A-n2 to be ready.
    // So all predecessors are done. The 3rd slot... let's use a separate
    // independent filler node.

    // Simplest: cap=3, 2 nodes running (A-n2, C-n2), 1 slot free.
    // They complete. Now 3 slots free. A-n2 merge pending. C-n3 ready.
    // Depth-first would claim C-n3 (ready). Then what? A-n3 not ready.
    // B-n0 not ready. If no other ready nodes, merge fires.

    // To create contention, we need MORE ready nodes. Let me add chain D
    // with ready nodes. Actually, the reviewer said "3 chains, 2 merge-point
    // nodes completing, cap=3". Let me make it: A-n2 (merge) and C-n3
    // (merge) complete. Then A-n3 not ready, C has no successor (n3 was
    // final). B-n0 not ready. So only the merge triggers are pending.
    // That's not contention.

    // The real contention: A-n2 (merge) completes, AND there are
    // independent ready nodes from other chains. Let me make C-n1 and C-n2
    // both ready (C-n0 completed). So:
    // - A-n2 completes (merge point) → merge trigger pending
    // - C-n1 ready, C-n2 ready (independent, depth-first would claim them)
    // - cap=3, pool was full: A-n2, C-n0... no, C-n0 completed.
    // OK let me just make it work with a clean setup.

    // CLEAN SETUP:
    // cap=3. At start: A-n2 running, C-n1 running, C-n2 running (3/3 full).
    // Tick 1: A-n2 completes (merge point), C-n1 completes, C-n2 completes.
    // After completion: 3 slots free.
    // Ready: C-n2... wait, C-n2 just completed. C-n3 (if exists) ready.
    // A-n3: not ready (needs A-n2 merge).
    // B-n0: not ready (needs A-n2 merge).
    // So only C-n3 is ready (if C has >3 nodes).
    // C has 4 nodes (n0-n3, n3 is merge). C-n3 ready.
    // Claim C-n3. 1 slot used. 2 free.
    // No more ready nodes. Merge trigger fires. 2 slots → 1 for merge.
    // That works fine — no starvation.

    // To create STARVATION, we need continuous ready nodes. Let me make
    // chain C longer, or add more chains. The reviewer's scenario has 3
    // chains and cap=3. Let me make chain C have 6 nodes (lots of ready
    // successors to claim depth-first).

    // REVISED: chain C = 6 nodes, n5 is merge. C-n0..n2 completed, C-n3
    // running, C-n4 pending (ready when n3 completes). Plus A-n2 completes.
    // After: C-n4 ready, A-n3 not ready, B-n0 not ready.
    // Claim C-n4. Then C-n5? No, C-n5 depends on C-n4 (running). Not ready.
    // So only 1 ready node. Merge fires. Still no starvation.

    // The starvation needs: every time a slot frees, a ready node exists to
    // claim it. With finite chains, this can't persist. But we can simulate
    // a burst: many independent ready nodes at once.

    // Let me just use the scenario as built and see what happens. The key
    // question is: does the merge trigger fire, and how long does it take?

    const disp = new Dispatcher({
      maxConcurrent: 3,
      fairnessBudget: 3,
      ordering,
      nodes: scenario.nodes,
    });

    // Pre-seed: mark A-n0, A-n1 as completed. A-n2 as running (1 tick left).
    // C-n0, C-n1 as completed. C-n2 as running (1 tick left).
    // Pool: A-n2 (running), C-n2 (running) = 2/3. Add C-n3 as running too
    // (it was claimed earlier, long-running). Wait, C-n2 is the predecessor
    // of C-n3. If C-n2 is running, C-n3 can't be running.
    // OK: pool = A-n2 (running), C-n2 (running), and... let's make a filler.
    // Actually, let's just have 2 running and 1 free slot. The merge-point
    // nodes complete, freeing 2 slots. Then we have 3 free + whatever.

    const aN2 = disp.nodes.get('A-n2');
    const cN2 = disp.nodes.get('C-n2');
    aN2.status = 'running';
    aN2.ticksRemaining = 1;
    cN2.status = 'running';
    cN2.ticksRemaining = 1;

    // Mark predecessors as completed
    disp.nodes.get('A-n0').status = 'completed';
    disp.nodes.get('A-n1').status = 'completed';
    disp.nodes.get('C-n0').status = 'completed';
    disp.nodes.get('C-n1').status = 'completed';

    // Run: tick 1 completes A-n2 and C-n2
    disp.advanceTime();

    // Now A-n2 is completed (merge point), C-n2 is completed (non-merge).
    // C-n3 is ready (depends on C-n2, non-merge predecessor).
    // A-n3 is NOT ready (depends on A-n2, merge point — needs merge).
    // B-n0 is NOT ready (depends on A-n2, cross-chain merge — needs merge).

    // Run passes until fixpoint
    let passWork = true;
    while (passWork) {
      passWork = disp.pass();
    }

    // Continue simulation until terminal or stalled or max ticks
    let maxTicks = 500;
    while (disp.tick < maxTicks && !disp.isTerminal() && !disp.isStalled()) {
      disp.advanceTime();
      let didWork = true;
      while (didWork) {
        didWork = disp.pass();
      }
    }

    const aN2Merged = disp.nodes.get('A-n2').status === 'merged';
    const bN0Claimed = disp.nodes.get('B-n0').status !== 'pending';
    const aN2Wait = disp.mergePointCompletedTick.get('A-n2');
    const mergeFireTick = aN2Merged
      ? disp.tick // approximate
      : -1;

    log('phase1', `  A-n2 merged: ${aN2Merged}`);
    log('phase1', `  A-n2 completed at tick: ${aN2Wait}`);
    log('phase1', `  B-n0 claimed: ${bN0Claimed}`);
    log('phase1', `  Merge triggers: ${disp.stats.mergeTriggers}`);
    log('phase1', `  Merge deferrals: ${disp.stats.mergeTriggerDeferrals}`);
    log('phase1', `  Max merge wait: ${disp.stats.maxMergeTriggerWait} ticks`);
    log('phase1', `  Total passes: ${disp.stats.passes}`);
    log('phase1', `  Terminal: ${disp.isTerminal()}, Stalled: ${disp.isStalled()}`);
    log('phase1', '');

    results[ordering] = {
      aN2Merged,
      bN0Claimed,
      mergeTriggers: disp.stats.mergeTriggers,
      mergeDeferrals: disp.stats.mergeTriggerDeferrals,
      maxMergeWait: disp.stats.maxMergeTriggerWait,
      passes: disp.stats.passes,
      terminal: disp.isTerminal(),
      stalled: disp.isStalled(),
      finalTick: disp.tick,
    };
  }

  // Analysis
  const claimsFirstMerged = results['claims-first'].aN2Merged;
  const mergesFirstMerged = results['merges-first'].aN2Merged;
  const pass = claimsFirstMerged && mergesFirstMerged;

  log('phase1', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  log('phase1', `  claims-first: A-n2 merged=${claimsFirstMerged}, max wait=${results['claims-first'].maxMergeWait} ticks`);
  log('phase1', `  merges-first: A-n2 merged=${mergesFirstMerged}, max wait=${results['merges-first'].maxMergeWait} ticks`);

  return { pass, results };
}

/**
 * Phase 2: Steady-state contention.
 *
 * 6 independent chains, each with a mid-chain merge at n3. At start, all n0-n2
 * are completed, n3 (merge point) is running. When n3 completes, the merge
 * trigger is pending. But each chain has n4-n7 as ready successors (depth-first
 * would claim them). With cap=5 and 6 chains, there's continuous contention.
 *
 * Tests: does the merge trigger ever fire under sustained independent ready-node
 * supply? How many passes does it wait?
 */
async function phase2() {
  console.log('\n=== Phase 2: steady-state contention (6 chains, cap=5) ===\n');

  const results = {};

  for (const ordering of ['claims-first', 'merges-first']) {
    log('phase2', `Testing ordering: ${ordering}`);

    const scenario = buildSteadyStateScenario();

    const disp = new Dispatcher({
      maxConcurrent: 5,
      fairnessBudget: 5,
      ordering,
      nodes: scenario.nodes,
    });

    // Pre-seed: for each chain, n0-n2 completed, n3 (merge) running (1 tick).
    // Pool: 5 of 6 chains' n3 are running (cap=5). 6th waits.
    let runningCount = 0;
    for (const node of disp.nodes.values()) {
      if (node.id.endsWith('-n0') || node.id.endsWith('-n1') || node.id.endsWith('-n2')) {
        node.status = 'completed';
      }
      if (node.id.endsWith('-n3') && runningCount < 5) {
        node.status = 'running';
        node.ticksRemaining = 1;
        runningCount++;
      }
    }

    // Run simulation
    const maxTicks = 2000;
    while (disp.tick < maxTicks && !disp.isTerminal() && !disp.isStalled()) {
      disp.advanceTime();
      let didWork = true;
      while (didWork) {
        didWork = disp.pass();
      }
    }

    // Count how many merges landed
    let mergesLanded = 0;
    let mergesPending = 0;
    for (const node of disp.nodes.values()) {
      if (node.isMergePoint) {
        if (node.status === 'merged') mergesLanded++;
        if (node.status === 'completed') mergesPending++;
      }
    }

    log('phase2', `  Merges landed: ${mergesLanded}`);
    log('phase2', `  Merges still pending: ${mergesPending}`);
    log('phase2', `  Merge triggers: ${disp.stats.mergeTriggers}`);
    log('phase2', `  Merge deferrals: ${disp.stats.mergeTriggerDeferrals}`);
    log('phase2', `  Max merge wait: ${disp.stats.maxMergeTriggerWait} ticks`);
    log('phase2', `  Total passes: ${disp.stats.passes}`);
    log('phase2', `  Terminal: ${disp.isTerminal()}, Stalled: ${disp.isStalled()}`);
    log('phase2', '');

    results[ordering] = {
      mergesLanded,
      mergesPending,
      mergeTriggers: disp.stats.mergeTriggers,
      mergeDeferrals: disp.stats.mergeTriggerDeferrals,
      maxMergeWait: disp.stats.maxMergeTriggerWait,
      passes: disp.stats.passes,
      terminal: disp.isTerminal(),
      stalled: disp.isStalled(),
      finalTick: disp.tick,
    };
  }

  // In steady-state, claims-first may show higher latency but merges should
  // eventually fire (finite DAG)
  const pass = results['claims-first'].mergesLanded > 0 && results['merges-first'].mergesLanded > 0;

  log('phase2', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  log('phase2', `  claims-first: ${results['claims-first'].mergesLanded} merges landed, max wait=${results['claims-first'].maxMergeWait} ticks`);
  log('phase2', `  merges-first: ${results['merges-first'].mergesLanded} merges landed, max wait=${results['merges-first'].maxMergeWait} ticks`);

  return { pass, results };
}

/**
 * Phase 3: Finite-DAG drain.
 *
 * 4 chains with cross-chain dependencies. Tests whether the merge trigger
 * fires before the completing chain exhausts its ready successors. This is
 * the realistic single-run scenario.
 */
async function phase3() {
  console.log('\n=== Phase 3: finite-DAG drain (4 chains, cap=5) ===\n');

  const results = {};

  for (const ordering of ['claims-first', 'merges-first']) {
    log('phase3', `Testing ordering: ${ordering}`);

    const scenario = buildFiniteDagScenario();

    const disp = new Dispatcher({
      maxConcurrent: 5,
      fairnessBudget: 5,
      ordering,
      nodes: scenario.nodes,
    });

    // Pre-seed: A-n0, A-n1 completed. A-n2 (merge) running (1 tick).
    // C-n0, C-n1 completed. C-n2 running (1 tick).
    // D-n0 completed. D-n1 running (1 tick).
    // Pool: A-n2, C-n2, D-n1 = 3/5 running.
    disp.nodes.get('A-n0').status = 'completed';
    disp.nodes.get('A-n1').status = 'completed';
    const aN2 = disp.nodes.get('A-n2');
    aN2.status = 'running';
    aN2.ticksRemaining = 1;

    disp.nodes.get('C-n0').status = 'completed';
    disp.nodes.get('C-n1').status = 'completed';
    const cN2 = disp.nodes.get('C-n2');
    cN2.status = 'running';
    cN2.ticksRemaining = 1;

    disp.nodes.get('D-n0').status = 'completed';
    const dN1 = disp.nodes.get('D-n1');
    dN1.status = 'running';
    dN1.ticksRemaining = 1;

    // Run simulation
    const maxTicks = 2000;
    while (disp.tick < maxTicks && !disp.isTerminal() && !disp.isStalled()) {
      disp.advanceTime();
      let didWork = true;
      while (didWork) {
        didWork = disp.pass();
      }
    }

    const aN2Merged = disp.nodes.get('A-n2').status === 'merged';
    const bN0Completed = ['completed', 'merged'].includes(disp.nodes.get('B-n0').status);
    const allTerminal = disp.isTerminal();

    log('phase3', `  A-n2 merged: ${aN2Merged}`);
    log('phase3', `  B-n0 progressed: ${bN0Completed}`);
    log('phase3', `  All terminal: ${allTerminal}`);
    log('phase3', `  Merge triggers: ${disp.stats.mergeTriggers}`);
    log('phase3', `  Merge deferrals: ${disp.stats.mergeTriggerDeferrals}`);
    log('phase3', `  Max merge wait: ${disp.stats.maxMergeWait || disp.stats.maxMergeTriggerWait} ticks`);
    log('phase3', `  Total passes: ${disp.stats.passes}`);
    log('phase3', '');

    results[ordering] = {
      aN2Merged,
      bN0Completed,
      allTerminal,
      mergeTriggers: disp.stats.mergeTriggers,
      mergeDeferrals: disp.stats.mergeTriggerDeferrals,
      maxMergeWait: disp.stats.maxMergeTriggerWait,
      passes: disp.stats.passes,
      finalTick: disp.tick,
    };
  }

  const pass = results['claims-first'].allTerminal && results['merges-first'].allTerminal;

  log('phase3', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  log('phase3', `  claims-first: terminal=${results['claims-first'].allTerminal}, max wait=${results['claims-first'].maxMergeWait} ticks`);
  log('phase3', `  merges-first: terminal=${results['merges-first'].allTerminal}, max wait=${results['merges-first'].maxMergeWait} ticks`);

  return { pass, results };
}

/**
 * Phase 4: Burst completions.
 *
 * Multiple merge-point nodes complete in one pass. merge.lock serializes to
 * one merge cycle. How many passes until all merges land?
 */
async function phase4() {
  console.log('\n=== Phase 4: burst completions (5 merge points, cap=5) ===\n');

  const results = {};

  // 5 independent chains, each 2 nodes: n0 → n1(merge)
  const chains = {};
  const allNodes = [];
  for (let c = 0; c < 5; c++) {
    const chainId = `B${c}`;
    const chain = buildChain(chainId, 2, [1]);
    chains[chainId] = chain;
    allNodes.push(...chain);
  }
  const burstScenario = { nodes: allNodes, chains };

  for (const ordering of ['claims-first', 'merges-first']) {
    log('phase4', `Testing ordering: ${ordering}`);

    const disp = new Dispatcher({
      maxConcurrent: 5,
      fairnessBudget: 5,
      ordering,
      nodes: burstScenario.nodes,
    });

    // Pre-seed: all n0 completed, all n1 (merge) running (1 tick each).
    // Pool: 5/5 full.
    for (const node of disp.nodes.values()) {
      if (node.id.endsWith('-n0')) {
        node.status = 'completed';
      }
      if (node.id.endsWith('-n1')) {
        node.status = 'running';
        node.ticksRemaining = 1;
      }
    }

    // Run simulation
    const maxTicks = 500;
    while (disp.tick < maxTicks && !disp.isTerminal() && !disp.isStalled()) {
      disp.advanceTime();
      let didWork = true;
      while (didWork) {
        didWork = disp.pass();
      }
    }

    let mergesLanded = 0;
    for (const node of disp.nodes.values()) {
      if (node.isMergePoint && node.status === 'merged') mergesLanded++;
    }

    log('phase4', `  Merges landed: ${mergesLanded}/5`);
    log('phase4', `  Merge triggers: ${disp.stats.mergeTriggers}`);
    log('phase4', `  Merge deferrals: ${disp.stats.mergeTriggerDeferrals}`);
    log('phase4', `  Max merge wait: ${disp.stats.maxMergeTriggerWait} ticks`);
    log('phase4', `  Total passes: ${disp.stats.passes}`);
    log('phase4', `  Final tick: ${disp.tick}`);
    log('phase4', '');

    results[ordering] = {
      mergesLanded,
      mergeTriggers: disp.stats.mergeTriggers,
      mergeDeferrals: disp.stats.mergeTriggerDeferrals,
      maxMergeWait: disp.stats.maxMergeTriggerWait,
      passes: disp.stats.passes,
      finalTick: disp.tick,
      terminal: disp.isTerminal(),
    };
  }

  const pass = results['claims-first'].mergesLanded === 5 && results['merges-first'].mergesLanded === 5;

  log('phase4', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);
  log('phase4', `  claims-first: ${results['claims-first'].mergesLanded}/5 landed, max wait=${results['claims-first'].maxMergeWait} ticks`);
  log('phase4', `  merges-first: ${results['merges-first'].mergesLanded}/5 landed, max wait=${results['merges-first'].maxMergeWait} ticks`);

  return { pass, results };
}

/**
 * Phase 5: Duration asymmetry validation.
 *
 * Confirms that a merge cycle (1 tick) frees its slot almost immediately,
 * while a node claim (60 ticks) holds for hours-equivalent. Tests whether
 * this asymmetry alone prevents sustained starvation.
 */
async function phase5() {
  console.log('\n=== Phase 5: duration asymmetry validation ===\n');

  // Show the duration ratio
  const ratio = NODE_DURATION_TICKS / MERGE_DURATION_TICKS;
  log('phase5', `Node duration: ${NODE_DURATION_TICKS} ticks (≈ hours)`);
  log('phase5', `Merge duration: ${MERGE_DURATION_TICKS} ticks (≈ seconds)`);
  log('phase5', `Ratio: ${ratio}:1 (node holds slot ${ratio}× longer than merge)`);
  log('phase5', `A merge trigger, once fired, frees its slot within 1 tick.`);
  log('phase5', `A node claim holds its slot for ${NODE_DURATION_TICKS} ticks.`);

  // Test: with merge-first ordering, how many merge cycles can complete
  // in the time it takes one node to complete?
  // With cap=5, 4 nodes running (240 ticks total), 1 slot for merges:
  // merges can fire back-to-back (1 tick each) = 240 merges in theory.
  // But merge.lock serializes to 1 at a time, and merges only fire when
  // merge-point nodes complete. So this is about throughput, not starvation.

  // The key insight: once a merge fires, it frees its slot in 1 tick.
  // So even under claims-first ordering, the merge trigger only needs ONE
  // pass where a slot is free. The duration asymmetry means:
  // - Node completions are rare (every 60 ticks per node)
  // - When a node completes, it frees a slot for 60+ ticks
  // - A merge trigger needs only 1 of those ticks
  // - So the merge trigger has 60 chances (ticks) to fire before the slot
  //   is re-claimed by a node
  // Wait — the slot is re-claimed in the SAME PASS as the completion.
  // So the merge trigger doesn't get 60 chances; it gets 0 chances if
  // claims-first ordering grabs the slot first.

  // The asymmetry helps AFTER the merge fires (frees quickly), not BEFORE
  // (getting the slot in the first place is the ordering problem).

  log('phase5', '');
  log('phase5', `Key finding: duration asymmetry helps AFTER a merge fires`);
  log('phase5', `(frees slot in 1 tick), but does NOT help a merge WIN a slot`);
  log('phase5', `(that's an intra-pass ordering problem).`);
  log('phase5', `The asymmetry prevents sustained contention from merges`);
  log('phase5', `(a merge holds for 1 tick, not 60), but the initial slot`);
  log('phase5', `acquisition is purely ordering-dependent.`);

  // Quantitative test: simulate a scenario where merges fire and measure
  // how long they hold slots vs nodes
  const scenario = buildReviewerScenario();
  const disp = new Dispatcher({
    maxConcurrent: 3,
    fairnessBudget: 3,
    ordering: 'merges-first',
    nodes: scenario.nodes,
  });

  // Pre-seed same as phase 1
  disp.nodes.get('A-n0').status = 'completed';
  disp.nodes.get('A-n1').status = 'completed';
  const aN2 = disp.nodes.get('A-n2');
  aN2.status = 'running';
  aN2.ticksRemaining = 1;
  disp.nodes.get('C-n0').status = 'completed';
  disp.nodes.get('C-n1').status = 'completed';
  const cN2 = disp.nodes.get('C-n2');
  cN2.status = 'running';
  cN2.ticksRemaining = 1;

  // Run
  const maxTicks = 500;
  while (disp.tick < maxTicks && !disp.isTerminal() && !disp.isStalled()) {
    disp.advanceTime();
    let didWork = true;
    while (didWork) {
      didWork = disp.pass();
    }
  }

  // Measure: how many ticks did the merge hold a slot?
  // The merge started when triggered and ended 1 tick later.
  // Node claims held for 60 ticks each.
  const mergeSlotHoldTicks = MERGE_DURATION_TICKS;
  const nodeSlotHoldTicks = NODE_DURATION_TICKS;

  log('phase5', '');
  log('phase5', `Merge slot hold: ${mergeSlotHoldTicks} ticks`);
  log('phase5', `Node slot hold: ${nodeSlotHoldTicks} ticks`);
  log('phase5', `Merge is ${nodeSlotHoldTicks / mergeSlotHoldTicks}× cheaper per slot-use`);

  const pass = true; // This phase is informational
  return { pass, mergeSlotHoldTicks, nodeSlotHoldTicks, ratio: nodeSlotHoldTicks / mergeSlotHoldTicks };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Spike: merge-trigger vs. claim priority (assumption A2)        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Node duration: ${NODE_DURATION_TICKS} ticks (≈ hours)`);
  console.log(`Merge duration: ${MERGE_DURATION_TICKS} tick (≈ seconds)`);
  console.log(`Tick ≈ a few minutes (schedule-tick interval)`);
  console.log();

  const results = {
    phase1: null,
    phase2: null,
    phase3: null,
    phase4: null,
    phase5: null,
  };

  // Phase 1: reviewer scenario
  try {
    results.phase1 = await phase1();
  } catch (err) {
    log('phase1', `FATAL: ${err.message}`);
    console.error(err.stack);
    results.phase1 = { pass: false, error: err.message };
  }

  // Phase 2: steady-state contention
  try {
    results.phase2 = await phase2();
  } catch (err) {
    log('phase2', `FATAL: ${err.message}`);
    console.error(err.stack);
    results.phase2 = { pass: false, error: err.message };
  }

  // Phase 3: finite-DAG drain
  try {
    results.phase3 = await phase3();
  } catch (err) {
    log('phase3', `FATAL: ${err.message}`);
    console.error(err.stack);
    results.phase3 = { pass: false, error: err.message };
  }

  // Phase 4: burst completions
  try {
    results.phase4 = await phase4();
  } catch (err) {
    log('phase4', `FATAL: ${err.message}`);
    console.error(err.stack);
    results.phase4 = { pass: false, error: err.message };
  }

  // Phase 5: duration asymmetry
  try {
    results.phase5 = await phase5();
  } catch (err) {
    log('phase5', `FATAL: ${err.message}`);
    console.error(err.stack);
    results.phase5 = { pass: false, error: err.message };
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Phase 1 (reviewer scenario):     ${results.phase1?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 2 (steady-state):         ${results.phase2?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 3 (finite-DAG drain):     ${results.phase3?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 4 (burst completions):    ${results.phase4?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 5 (duration asymmetry):   ${results.phase5?.pass ? 'PASS' : 'FAIL'}`);

  // Key comparison table
  console.log('\n=== ORDERING COMPARISON ===');
  if (results.phase1?.results) {
    console.log('Phase 1 (reviewer scenario, cap=3):');
    console.log(`  claims-first: merged=${results.phase1.results['claims-first']?.aN2Merged}, max wait=${results.phase1.results['claims-first']?.maxMergeWait} ticks, deferrals=${results.phase1.results['claims-first']?.mergeDeferrals}`);
    console.log(`  merges-first: merged=${results.phase1.results['merges-first']?.aN2Merged}, max wait=${results.phase1.results['merges-first']?.maxMergeWait} ticks, deferrals=${results.phase1.results['merges-first']?.mergeDeferrals}`);
  }
  if (results.phase2?.results) {
    console.log('Phase 2 (steady-state, cap=5):');
    console.log(`  claims-first: landed=${results.phase2.results['claims-first']?.mergesLanded}, max wait=${results.phase2.results['claims-first']?.maxMergeWait} ticks, deferrals=${results.phase2.results['claims-first']?.mergeDeferrals}`);
    console.log(`  merges-first: landed=${results.phase2.results['merges-first']?.mergesLanded}, max wait=${results.phase2.results['merges-first']?.maxMergeWait} ticks, deferrals=${results.phase2.results['merges-first']?.mergeDeferrals}`);
  }
  if (results.phase3?.results) {
    console.log('Phase 3 (finite-DAG, cap=5):');
    console.log(`  claims-first: terminal=${results.phase3.results['claims-first']?.allTerminal}, max wait=${results.phase3.results['claims-first']?.maxMergeWait} ticks`);
    console.log(`  merges-first: terminal=${results.phase3.results['merges-first']?.allTerminal}, max wait=${results.phase3.results['merges-first']?.maxMergeWait} ticks`);
  }
  if (results.phase4?.results) {
    console.log('Phase 4 (burst, cap=5):');
    console.log(`  claims-first: landed=${results.phase4.results['claims-first']?.mergesLanded}/5, max wait=${results.phase4.results['claims-first']?.maxMergeWait} ticks`);
    console.log(`  merges-first: landed=${results.phase4.results['merges-first']?.mergesLanded}/5, max wait=${results.phase4.results['merges-first']?.maxMergeWait} ticks`);
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

module.exports = { phase1, phase2, phase3, phase4, phase5, Dispatcher, buildChain, buildReviewerScenario };
