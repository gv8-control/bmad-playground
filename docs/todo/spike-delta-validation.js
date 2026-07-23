#!/usr/bin/env node
/**
 * Spike: fold-time delta validation against a moving target
 *
 * Verifies admitted assumption 6 from docs/todo/graph-pipeline.md:
 *
 *   The planner reads graph.json at launch (T0); by fold time (T1) a pass may
 *   have claimed nodes (freezing their specs) or folded completions (changing
 *   merge state). The delta format and rejection semantics are now decided
 *   (ops list, all-or-nothing), which pins what the validation checks: per-op
 *   legality against T1 state, then the whole-graph rules (acyclic,
 *   cross-chain edges target merge-points, final node carries mergeTo, every
 *   chain remains a total order) on the result.
 *
 *   Spike: write the validation function and test against synthetic scenarios:
 *   (a) planner removes a node that was claimed meanwhile,
 *   (b) planner adds a cross-chain edge to a node that merged and is no
 *       longer a merge-point target,
 *   (c) planner's delta creates a cycle when merged with T1 state,
 *   (d) planner marks a final node without mergeTo,
 *   (e) a delta that removes a chain node and rewires its successor around it,
 *       racing a claim of the removed node — partial application would leave
 *       two concurrently runnable nodes on one chain branch; the
 *       chain-total-order rule plus all-or-nothing rejection must catch it.
 *
 * The validation function is the most algorithmically intricate piece of the
 * pipeline. This spike tests it against the five documented scenarios plus
 * additional edge cases, verifying that:
 *
 *   1. Per-op rules fire correctly (stale target, fresh id, edge existence)
 *   2. Whole-graph rules fire correctly (acyclic, cross-chain merge-point,
 *      final-node mergeTo, total order)
 *   3. All-or-nothing rejection prevents partial application
 *   4. Completions are tolerated naturally (edge to completed node is valid)
 *   5. Empty deltas are accepted
 *   6. Rejection evidence includes the failing op and rule
 *
 * Usage:
 *   node spike-delta-validation.js
 *
 * No external dependencies required — uses only Node.js stdlib.
 */

// ─── Data model ────────────────────────────────────────────────────────────

/**
 * Node statuses in the graph:
 * - pending: unclaimed, spec not frozen
 * - claimed: a pass has claimed it, spec is frozen
 * - parked: QUESTION outcome, waiting for human answer
 * - completed: finished and outcome folded
 * - failed: finished with failure, may be retried
 * - abandoned: chain segment abandoned (rework path)
 *
 * "Unclaimed" = status === 'pending'. Only unclaimed nodes may be modified
 * by the planner (updateNode, removeNode). Claimed, parked, completed, failed,
 * and abandoned nodes are frozen.
 */

const UNCLAIMED_STATUSES = ['pending'];
const FROZEN_STATUSES = ['claimed', 'parked', 'completed', 'failed', 'abandoned'];

// ─── Validation ───────────────────────────────────────────────────────────

/**
 * Validate a planning delta against current graph state.
 *
 * Applies the delta's ops in order to a deep copy of the current state, then
 * checks whole-graph rules on the result. Returns either:
 *   { accepted: true, graph: <new graph> }
 * or:
 *   { accepted: false, rejection: { opIndex, op, rule, detail } }
 *
 * The caller (the fold step of a pass) journals the rejection evidence and
 * deletes the inbox file. The condition that triggered planning still holds,
 * so the standard level-triggered trigger re-fires a fresh run.
 *
 * @param {object} delta - the planning delta from the inbox
 * @param {object} currentGraph - the current graph state (nodes keyed by id)
 * @returns {object} acceptance or rejection
 */
function validateDelta(delta, currentGraph) {
  // ── Envelope validation ──
  if (!delta || typeof delta !== 'object') {
    return reject(-1, null, 'invalid_envelope', 'delta is not an object');
  }
  if (!delta.planningRunId || typeof delta.planningRunId !== 'string') {
    return reject(-1, null, 'invalid_envelope', 'missing or non-string planningRunId');
  }
  if (!['expansion', 'conflict', 'replan'].includes(delta.mode)) {
    return reject(-1, null, 'invalid_envelope', `invalid mode: ${delta.mode}`);
  }
  if (!Array.isArray(delta.ops)) {
    return reject(-1, null, 'invalid_envelope', 'ops is not an array');
  }

  // ── Deep-copy current state into working graph ──
  // structuredClone gives a true deep copy (metadata may contain nested
  // objects per the doc's "free-form dict" spec). This guarantees the
  // all-or-nothing invariant: the input graph is never mutated, even if
  // a future code path mutates nested metadata in place.
  const working = {};
  for (const [id, node] of Object.entries(currentGraph)) {
    working[id] = structuredClone(node);
  }

  // ── Apply ops in order, checking per-op rules ──

  for (let i = 0; i < delta.ops.length; i++) {
    const op = delta.ops[i];
    const opIndex = i;

    if (!op || typeof op !== 'object' || typeof op.op !== 'string') {
      return reject(opIndex, op, 'invalid_op', 'op is not an object or missing op field');
    }

    switch (op.op) {
      // ── addNode ──
      case 'addNode': {
        const node = op.node;
        if (!node || typeof node !== 'object') {
          return reject(opIndex, op, 'invalid_op', 'addNode missing node object');
        }
        if (!node.id || typeof node.id !== 'string') {
          return reject(opIndex, op, 'invalid_op', 'addNode node missing id');
        }
        if (working[node.id]) {
          return reject(opIndex, op, 'stale_id', `addNode id "${node.id}" already exists`);
        }
        if (!node.chainId || typeof node.chainId !== 'string') {
          return reject(opIndex, op, 'invalid_op', 'addNode node missing chainId');
        }
        // Status is machinery-derived; planner must not set it
        if (node.status !== undefined) {
          return reject(opIndex, op, 'invalid_op',
            `addNode must not set status (machinery-derived field)`);
        }
        // Check all dependsOn targets exist in working graph
        const deps = node.dependsOn || [];
        if (!Array.isArray(deps)) {
          return reject(opIndex, op, 'invalid_op', 'addNode dependsOn is not an array');
        }
        for (const depId of deps) {
          if (!working[depId]) {
            return reject(opIndex, op, 'dangling_edge',
              `addNode "${node.id}" depends on "${depId}" which does not exist`);
          }
        }
        // Add the node — status is set by machinery, never by the planner
        working[node.id] = {
          ...node,
          dependsOn: [...deps],
          metadata: { ...(node.metadata || {}) },
          status: 'pending',
        };
        break;
      }

      // ── updateNode ──
      case 'updateNode': {
        const id = op.id;
        const fields = op.fields;
        if (!id || typeof id !== 'string') {
          return reject(opIndex, op, 'invalid_op', 'updateNode missing id');
        }
        if (!working[id]) {
          return reject(opIndex, op, 'stale_target',
            `updateNode target "${id}" does not exist`);
        }
        if (!UNCLAIMED_STATUSES.includes(working[id].status)) {
          return reject(opIndex, op, 'stale_target',
            `updateNode target "${id}" is ${working[id].status} (frozen, not pending)`);
        }
        if (!fields || typeof fields !== 'object') {
          return reject(opIndex, op, 'invalid_op', 'updateNode missing fields');
        }
        // Apply field replacements (shallow merge)
        const updated = { ...working[id], ...fields };
        // If dependsOn changed, check all new targets exist
        if (fields.dependsOn !== undefined) {
          if (!Array.isArray(fields.dependsOn)) {
            return reject(opIndex, op, 'invalid_op', 'updateNode dependsOn is not an array');
          }
          for (const depId of fields.dependsOn) {
            if (!working[depId]) {
              return reject(opIndex, op, 'dangling_edge',
                `updateNode "${id}" depends on "${depId}" which does not exist`);
            }
          }
        }
        // Status is machinery-derived; planner must not set it
        if (fields.status !== undefined) {
          return reject(opIndex, op, 'invalid_op',
            `updateNode must not set status (machinery-derived field)`);
        }
        // id is the node's identity; changing it corrupts the key/id invariant
        if (fields.id !== undefined) {
          return reject(opIndex, op, 'invalid_op',
            `updateNode must not set id (identity is immutable)`);
        }
        // chainId is structural; moving a node between chains bypasses
        // the total-order and merge-point invariants for the destination
        if (fields.chainId !== undefined) {
          return reject(opIndex, op, 'invalid_op',
            `updateNode must not set chainId (structural — use addNode/removeNode)`);
        }
        updated.dependsOn = [...(updated.dependsOn || [])];
        updated.metadata = { ...(updated.metadata || {}) };
        working[id] = updated;
        break;
      }

      // ── removeNode ──
      case 'removeNode': {
        const id = op.id;
        if (!id || typeof id !== 'string') {
          return reject(opIndex, op, 'invalid_op', 'removeNode missing id');
        }
        if (!working[id]) {
          return reject(opIndex, op, 'stale_target',
            `removeNode target "${id}" does not exist`);
        }
        if (!UNCLAIMED_STATUSES.includes(working[id].status)) {
          return reject(opIndex, op, 'stale_target',
            `removeNode target "${id}" is ${working[id].status} (frozen, not pending)`);
        }
        // Remove the node
        delete working[id];
        // Note: edges TO this node (in other nodes' dependsOn) are not
        // automatically removed here — the whole-graph check will catch
        // dangling edges. The planner typically pairs removeNode with
        // updateNode ops to rewire successors.
        break;
      }

      // ── abandonSegment ──
      case 'abandonSegment': {
        const chainId = op.chainId;
        if (!chainId || typeof chainId !== 'string') {
          return reject(opIndex, op, 'invalid_op', 'abandonSegment missing chainId');
        }
        // Find all nodes in the chain
        const chainNodes = Object.values(working).filter(n => n.chainId === chainId);
        if (chainNodes.length === 0) {
          return reject(opIndex, op, 'stale_target',
            `abandonSegment chainId "${chainId}" has no nodes`);
        }
        // Check no node in the chain is claimed or parked (in-flight work)
        for (const node of chainNodes) {
          if (['claimed', 'parked'].includes(node.status)) {
            return reject(opIndex, op, 'stale_target',
              `abandonSegment chain "${chainId}" has ${node.status} node "${node.id}" (in-flight)`);
          }
        }
        // Remove all pending nodes in the chain
        // Completed/failed/abandoned nodes stay (they're historical record)
        for (const node of chainNodes) {
          if (node.status === 'pending') {
            delete working[node.id];
          }
        }
        break;
      }

      default:
        return reject(opIndex, op, 'invalid_op', `unknown op type: ${op.op}`);
    }
  }

  // ── Whole-graph rules on the result ──

  // Rule 1: No dangling edges (every dependsOn target exists)
  for (const [id, node] of Object.entries(working)) {
    for (const depId of (node.dependsOn || [])) {
      if (!working[depId]) {
        return reject(-1, null, 'dangling_edge',
          `node "${id}" depends on "${depId}" which does not exist (dangling after ops)`);
      }
    }
  }

  // Rule 2: Acyclic
  const cycle = detectCycle(working);
  if (cycle) {
    return reject(-1, null, 'cyclic', `graph has a cycle: ${cycle.join(' → ')}`);
  }

  // Rule 3: Cross-chain edges target merge-point nodes
  for (const [id, node] of Object.entries(working)) {
    for (const depId of (node.dependsOn || [])) {
      const dep = working[depId];
      if (dep.chainId !== node.chainId) {
        // Cross-chain edge — target must be a merge-point node
        if (!dep.mergeTo) {
          return reject(-1, null, 'cross_chain_not_merge_point',
            `node "${id}" (chain ${node.chainId}) depends on "${depId}" (chain ${dep.chainId}) which is not a merge-point node (no mergeTo)`);
        }
      }
    }
  }

  // Rule 4: Every chain's final node carries mergeTo
  const chains = {};
  for (const node of Object.values(working)) {
    if (!chains[node.chainId]) chains[node.chainId] = [];
    chains[node.chainId].push(node);
  }
  for (const [chainId, nodes] of Object.entries(chains)) {
    // Find the final node: the one no other node in the chain depends on
    // (within-chain). A node is "final" if no other node in the same chain
    // has it in dependsOn.
    const dependedUpon = new Set();
    for (const node of nodes) {
      for (const depId of (node.dependsOn || [])) {
        const dep = working[depId];
        if (dep && dep.chainId === chainId) {
          dependedUpon.add(depId);
        }
      }
    }
    const finalNodes = nodes.filter(n => !dependedUpon.has(n.id));
    if (finalNodes.length === 0) {
      // This shouldn't happen if the graph is acyclic and non-empty
      return reject(-1, null, 'no_final_node',
        `chain "${chainId}" has no final node (cyclic or empty)`);
    }
    if (finalNodes.length > 1) {
      return reject(-1, null, 'not_total_order',
        `chain "${chainId}" has ${finalNodes.length} final nodes (not a total order): ${finalNodes.map(n => n.id).join(', ')}`);
    }
    const finalNode = finalNodes[0];
    if (!finalNode.mergeTo) {
      return reject(-1, null, 'final_node_missing_mergeTo',
        `chain "${chainId}" final node "${finalNode.id}" is missing mergeTo`);
    }
  }

  // Rule 5: Every chain remains a total order (a single path)
  for (const [chainId, nodes] of Object.entries(chains)) {
    const orderCheck = checkTotalOrder(nodes, working, chainId);
    if (!orderCheck.ok) {
      return reject(-1, null, 'not_total_order',
        `chain "${chainId}" is not a total order: ${orderCheck.reason}`);
    }
  }

  // All checks passed
  return { accepted: true, graph: working };
}

// ── Helpers ──

function reject(opIndex, op, rule, detail) {
  return {
    accepted: false,
    rejection: { opIndex, op, rule, detail },
  };
}

/**
 * Detect a cycle in the dependsOn graph using DFS.
 * Returns the cycle path if found, or null if acyclic.
 */
function detectCycle(graph) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  for (const id of Object.keys(graph)) color[id] = WHITE;

  const path = [];

  function dfs(id) {
    color[id] = GRAY;
    path.push(id);

    const node = graph[id];
    for (const depId of (node.dependsOn || [])) {
      if (!graph[depId]) continue; // dangling — caught by rule 1
      if (color[depId] === GRAY) {
        // Found a back edge — cycle
        const cycleStart = path.indexOf(depId);
        return path.slice(cycleStart).concat(depId);
      }
      if (color[depId] === WHITE) {
        const cycle = dfs(depId);
        if (cycle) return cycle;
      }
    }

    path.pop();
    color[id] = BLACK;
    return null;
  }

  for (const id of Object.keys(graph)) {
    if (color[id] === WHITE) {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Check that a chain's nodes form a total order (a single path).
 *
 * Within-chain edges should form a linear chain: each node (except the first)
 * has exactly one within-chain predecessor, and each node (except the last)
 * has exactly one within-chain successor.
 *
 * Cross-chain edges (to merge-point nodes in other chains) are additional and
 * don't affect the total order.
 */
function checkTotalOrder(chainNodes, graph, chainId) {
  // Build within-chain adjacency
  const predecessors = {}; // id -> [predecessor ids within chain]
  const successors = {};   // id -> [successor ids within chain]

  for (const node of chainNodes) {
    predecessors[node.id] = [];
    successors[node.id] = [];
  }

  for (const node of chainNodes) {
    for (const depId of (node.dependsOn || [])) {
      const dep = graph[depId];
      if (dep && dep.chainId === chainId) {
        // Within-chain edge: depId is a predecessor of node.id
        predecessors[node.id].push(depId);
        successors[depId].push(node.id);
      }
    }
  }

  // Check: each node has at most 1 within-chain predecessor
  for (const node of chainNodes) {
    const preds = predecessors[node.id];
    if (preds.length > 1) {
      return {
        ok: false,
        reason: `node "${node.id}" has ${preds.length} within-chain predecessors (${preds.join(', ')}) — expected at most 1`,
      };
    }
  }

  // Check: each node has at most 1 within-chain successor
  for (const node of chainNodes) {
    const succs = successors[node.id];
    if (succs.length > 1) {
      return {
        ok: false,
        reason: `node "${node.id}" has ${succs.length} within-chain successors (${succs.join(', ')}) — expected at most 1`,
      };
    }
  }

  // Check: the chain is connected (forms a single path)
  // Find the head (no within-chain predecessor)
  const heads = chainNodes.filter(n => predecessors[n.id].length === 0);
  if (heads.length === 0) {
    return { ok: false, reason: 'no head node (cycle within chain)' };
  }
  if (heads.length > 1) {
    return {
      ok: false,
      reason: `${heads.length} head nodes (not a single path): ${heads.map(n => n.id).join(', ')}`,
    };
  }

  // Walk the path from head to tail
  const head = heads[0];
  const visited = new Set();
  let currentId = head.id;
  while (currentId) {
    if (visited.has(currentId)) {
      return { ok: false, reason: `cycle detected walking chain from "${head.id}"` };
    }
    visited.add(currentId);
    const succs = successors[currentId] || [];
    if (succs.length === 0) break;
    currentId = succs[0];
  }

  // All nodes should be visited
  if (visited.size !== chainNodes.length) {
    const unvisited = chainNodes.filter(n => !visited.has(n.id)).map(n => n.id);
    return {
      ok: false,
      reason: `chain is disconnected — ${unvisited.length} nodes not reachable from head "${head.id}": ${unvisited.join(', ')}`,
    };
  }

  return { ok: true };
}

// ── Graph builders (for test setup) ────────────────────────────────────────

/**
 * Build a simple linear chain: n1 → n2 → n3, all in chainA, n3 has mergeTo.
 */
function buildLinearChain(chainId = 'chainA', nodePrefix = 'n') {
  const nodes = {};
  const ids = [];
  for (let i = 1; i <= 3; i++) {
    const id = `${nodePrefix}${i}`;
    ids.push(id);
    nodes[id] = {
      id,
      chainId,
      skill: 'bmad-dev-story',
      deadline: '2h',
      dependsOn: i > 1 ? [ids[i - 2]] : [],
      mergeTo: i === 3 ? 'main' : null,
      metadata: { story: 'story-1', epic: 'epic-1' },
      status: 'pending',
    };
  }
  return nodes;
}

/**
 * Build two independent chains: chainA (n1→n2→n3) and chainB (m1→m2→m3).
 */
function buildTwoChains() {
  const graph = {};
  // Chain A
  graph['n1'] = { id: 'n1', chainId: 'chainA', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: null, metadata: {}, status: 'pending' };
  graph['n2'] = { id: 'n2', chainId: 'chainA', skill: 'dev', deadline: '2h', dependsOn: ['n1'], mergeTo: null, metadata: {}, status: 'pending' };
  graph['n3'] = { id: 'n3', chainId: 'chainA', skill: 'dev', deadline: '2h', dependsOn: ['n2'], mergeTo: 'main', metadata: {}, status: 'pending' };
  // Chain B
  graph['m1'] = { id: 'm1', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: null, metadata: {}, status: 'pending' };
  graph['m2'] = { id: 'm2', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['m1'], mergeTo: null, metadata: {}, status: 'pending' };
  graph['m3'] = { id: 'm3', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['m2'], mergeTo: 'main', metadata: {}, status: 'pending' };
  return graph;
}

/**
 * Build a graph with a mid-chain merge point: chainA has n1→n2(mergeTo)→n3,
 * and chainB's m1 depends on n2 (cross-chain edge to merge point).
 */
function buildCrossChainGraph() {
  const graph = {};
  // Chain A: n1 → n2 (mergeTo) → n3
  graph['n1'] = { id: 'n1', chainId: 'chainA', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: null, metadata: {}, status: 'pending' };
  graph['n2'] = { id: 'n2', chainId: 'chainA', skill: 'dev', deadline: '2h', dependsOn: ['n1'], mergeTo: 'main', metadata: {}, status: 'pending' };
  graph['n3'] = { id: 'n3', chainId: 'chainA', skill: 'dev', deadline: '2h', dependsOn: ['n2'], mergeTo: 'main', metadata: {}, status: 'pending' };
  // Chain B: m1 depends on n2 (cross-chain, merge point), then m1 → m2
  graph['m1'] = { id: 'm1', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['n2'], mergeTo: null, metadata: {}, status: 'pending' };
  graph['m2'] = { id: 'm2', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['m1'], mergeTo: 'main', metadata: {}, status: 'pending' };
  return graph;
}

function makeDelta(ops, opts = {}) {
  return {
    planningRunId: opts.planningRunId || 'pr_test_001',
    mode: opts.mode || 'expansion',
    authoredAt: opts.authoredAt || '2026-07-22T12:00:00.000Z',
    journalPosition: opts.journalPosition || 0,
    ops,
  };
}

// ── Test framework ─────────────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assertReject(result, expectedRule, testName) {
  totalTests++;
  if (result.accepted) {
    failures.push(`FAIL: ${testName} — expected rejection (${expectedRule}), but delta was accepted`);
    console.log(`  ✗ FAIL: expected rejection (${expectedRule}), but delta was accepted`);
    failedTests++;
    return;
  }
  if (result.rejection.rule !== expectedRule) {
    failures.push(`FAIL: ${testName} — expected rule "${expectedRule}", got "${result.rejection.rule}" (${result.rejection.detail})`);
    console.log(`  ✗ FAIL: expected rule "${expectedRule}", got "${result.rejection.rule}" (${result.rejection.detail})`);
    failedTests++;
    return;
  }
  console.log(`  ✓ PASS: rejected with rule "${expectedRule}" — ${result.rejection.detail}`);
  passedTests++;
}

function assertAccept(result, testName) {
  totalTests++;
  if (!result.accepted) {
    failures.push(`FAIL: ${testName} — expected acceptance, but rejected: ${result.rejection.rule} (${result.rejection.detail})`);
    console.log(`  ✗ FAIL: expected acceptance, but rejected: ${result.rejection.rule} (${result.rejection.detail})`);
    failedTests++;
    return;
  }
  console.log(`  ✓ PASS: delta accepted`);
  passedTests++;
}

function assertAcceptWithGraph(result, testName, checkFn) {
  totalTests++;
  if (!result.accepted) {
    failures.push(`FAIL: ${testName} — expected acceptance, but rejected: ${result.rejection.rule} (${result.rejection.detail})`);
    console.log(`  ✗ FAIL: expected acceptance, but rejected: ${result.rejection.rule} (${result.rejection.detail})`);
    failedTests++;
    return;
  }
  const checkResult = checkFn(result.graph);
  if (!checkResult.ok) {
    failures.push(`FAIL: ${testName} — accepted but graph check failed: ${checkResult.reason}`);
    console.log(`  ✗ FAIL: accepted but graph check failed: ${checkResult.reason}`);
    failedTests++;
    return;
  }
  console.log(`  ✓ PASS: delta accepted, graph check passed — ${checkResult.detail || ''}`);
  passedTests++;
}

// ── Test scenarios ─────────────────────────────────────────────────────────

/**
 * Scenario (a): planner removes a node that was claimed meanwhile.
 *
 * T0: planner sees node n2 as pending, decides to remove it.
 * T1: n2 has been claimed (status: 'claimed') — spec is frozen.
 *
 * Expected: rejection with rule "stale_target".
 */
function scenarioA() {
  console.log('\n=== Scenario (a): planner removes a node that was claimed meanwhile ===\n');

  const graph = buildLinearChain();
  // Simulate T1: n2 was claimed
  graph['n2'].status = 'claimed';

  const delta = makeDelta([
    { op: 'removeNode', id: 'n2' },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'stale_target', 'scenario-a');
}

/**
 * Scenario (b): planner adds a cross-chain edge to a node that merged and is
 * no longer a merge-point target.
 *
 * T0: planner sees node n2 (chainA, mergeTo: 'main') as a merge point, adds
 *     a cross-chain edge from m1 (chainB) to n2.
 * T1: n2 has completed and merged. The branch was deleted. n2 is still in
 *     the graph (completed), but... wait.
 *
 * Actually, re-reading the doc: "an edge to a node that completed meanwhile
 * is valid and simply starts satisfied." So a cross-chain edge TO a completed
 * merge-point node is valid. The "no longer a merge-point target" case is
 * different: the node was REMOVED from the graph (not just completed).
 *
 * Wait — completed nodes stay in the graph (they're historical record). So
 * the edge target still exists. The scenario must be: the node was removed
 * because its chain was abandoned, or the merge point was unmarked (mergeTo
 * removed) by a replan.
 *
 * Let me re-read the doc scenario: "planner adds a cross-chain edge to a
 * node that merged and is no longer a merge-point target."
 *
 * "Merged" = completed. "No longer a merge-point target" = the mergeTo was
 * removed (by a replan) OR the node was removed.
 *
 * Two sub-cases:
 *   (b1) The target node was removed (doesn't exist) → dangling_edge
 *   (b2) The target node exists but mergeTo was removed (replanned) →
 *        cross_chain_not_merge_point
 *
 * Let me test both.
 */
function scenarioB() {
  console.log('\n=== Scenario (b): planner adds a cross-chain edge to a node that merged ===\n');

  // (b1) Target node was removed (chain abandoned)
  {
    console.log('  (b1) target node removed:');
    const graph = buildCrossChainGraph();
    // Simulate T1: n2's chain segment was abandoned (n2 removed)
    delete graph['n2'];
    // Also remove n3 (depends on n2, would be dangling)
    delete graph['n3'];
    // And m1's cross-chain edge to n2 (it was rewired or removed)
    delete graph['m1'];
    graph['m2'].dependsOn = []; // m2 is now the head

    // Planner (at T0) wants to add m1 depending on n2 — but n2 is gone
    const delta = makeDelta([
      { op: 'addNode', node: { id: 'm1', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['n2'], mergeTo: null, metadata: {} } },
    ]);

    const result = validateDelta(delta, graph);
    assertReject(result, 'dangling_edge', 'scenario-b1');
  }

  // (b2) Target node exists but mergeTo was removed by a replan
  {
    console.log('  (b2) target exists but mergeTo removed:');
    const graph = buildCrossChainGraph();
    // Simulate T1: n2 still exists, but a replan removed its mergeTo
    // (n2 is still pending — unclaimed, so the replan could touch it)
    graph['n2'].mergeTo = null;
    // But now n3 (which depends on n2 in-chain) would need n2 to have
    // mergeTo for n3 to be valid... actually no. n3 is in the same chain.
    // The cross-chain rule is about cross-chain edges. n3 → n2 is within-chain.
    // But n3 has mergeTo: 'main', so n3 is the chain's merge point now.
    // And m1 has a cross-chain edge to n2 — which no longer has mergeTo.
    // Remove m1 and m2 from the graph (they don't exist yet at T1)
    delete graph['m1'];
    delete graph['m2'];

    // Planner wants to add m1 depending on n2 (cross-chain)
    const delta = makeDelta([
      { op: 'addNode', node: { id: 'm1', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['n2'], mergeTo: null, metadata: {} } },
      { op: 'addNode', node: { id: 'm2', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['m1'], mergeTo: 'main', metadata: {} } },
    ]);

    const result = validateDelta(delta, graph);
    assertReject(result, 'cross_chain_not_merge_point', 'scenario-b2');
  }

  // (b3) Edge to a completed merge-point node — should be ACCEPTED
  {
    console.log('  (b3) target completed (edge to completed node is valid):');
    const graph = buildCrossChainGraph();
    // Simulate T1: n2 completed (merged)
    graph['n2'].status = 'completed';
    // Remove m1, m2 (planner is adding them now)
    delete graph['m1'];
    delete graph['m2'];

    const delta = makeDelta([
      { op: 'addNode', node: { id: 'm1', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['n2'], mergeTo: null, metadata: {} } },
      { op: 'addNode', node: { id: 'm2', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['m1'], mergeTo: 'main', metadata: {} } },
    ]);

    const result = validateDelta(delta, graph);
    assertAccept(result, 'scenario-b3');
  }
}

/**
 * Scenario (c): planner's delta creates a cycle when merged with T1 state.
 *
 * T0: graph has n1 → n2 → n3 (chainA). Planner doesn't see n2 yet (stale
 *     snapshot) or planner adds an edge that creates a cycle with existing
 *     state.
 *
 * Example: planner adds n4 depending on n3, and updates n1 to depend on n4.
 * n4 → n3 → n2 → n1 → n4 = cycle.
 *
 * Expected: rejection with rule "cyclic".
 */
function scenarioC() {
  console.log('\n=== Scenario (c): planner\'s delta creates a cycle ===\n');

  const graph = buildLinearChain();

  const delta = makeDelta([
    // Add n4 depending on n3
    { op: 'addNode', node: { id: 'n4', chainId: 'chainA', skill: 'dev', deadline: '2h', dependsOn: ['n3'], mergeTo: 'main', metadata: {} } },
    // Update n1 to depend on n4 (creating a cycle: n4 → n3 → n2 → n1 → n4)
    { op: 'updateNode', id: 'n1', fields: { dependsOn: ['n4'] } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'cyclic', 'scenario-c');
}

/**
 * Scenario (d): planner marks a final node without mergeTo.
 *
 * T0: planner adds a new chain (chainC) with nodes c1 → c2, but forgets
 *     to set mergeTo on c2 (the final node).
 *
 * Expected: rejection with rule "final_node_missing_mergeTo".
 */
function scenarioD() {
  console.log('\n=== Scenario (d): planner marks a final node without mergeTo ===\n');

  const graph = buildTwoChains();
  // Remove chainB so the graph only has chainA (cleaner test)
  delete graph['m1'];
  delete graph['m2'];
  delete graph['m3'];

  const delta = makeDelta([
    // Add chainC: c1 → c2, but c2 has no mergeTo
    { op: 'addNode', node: { id: 'c1', chainId: 'chainC', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: null, metadata: {} } },
    { op: 'addNode', node: { id: 'c2', chainId: 'chainC', skill: 'dev', deadline: '2h', dependsOn: ['c1'], mergeTo: null, metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'final_node_missing_mergeTo', 'scenario-d');
}

/**
 * Scenario (e): a delta that removes a chain node and rewires its successor
 * around it, racing a claim of the removed node.
 *
 * T0: graph has n1 → n2 → n3 (chainA). Planner removes n2 and rewires n3
 *     to depend on n1 instead.
 * T1: n2 was claimed (status: 'claimed') between T0 and T1.
 *
 * The removeNode op for n2 should be rejected (stale_target). Because
 * rejection is all-or-nothing, the updateNode op (rewiring n3) is also
 * rolled back. If partial application were allowed, n3 would depend on n1
 * while n2 (still claimed) also depends on n1 — two nodes in the same chain
 * with the same predecessor, but n3 no longer depends on n2, so both would
 * be runnable. That breaks the total order.
 *
 * Expected: rejection with rule "stale_target" (the removeNode op).
 */
function scenarioE() {
  console.log('\n=== Scenario (e): remove+rewire racing a claim (all-or-nothing) ===\n');

  const graph = buildLinearChain();
  // Simulate T1: n2 was claimed
  graph['n2'].status = 'claimed';

  const delta = makeDelta([
    // Remove n2
    { op: 'removeNode', id: 'n2' },
    // Rewire n3 to depend on n1 (bypassing n2)
    { op: 'updateNode', id: 'n3', fields: { dependsOn: ['n1'] } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'stale_target', 'scenario-e');

  // Verify all-or-nothing: n3 should still depend on n2 in the original graph
  // (the delta was not applied)
  totalTests++;
  if (graph['n3'].dependsOn[0] === 'n2') {
    console.log('  ✓ PASS: original graph unchanged (n3 still depends on n2) — all-or-nothing held');
    passedTests++;
  } else {
    failures.push(`FAIL: scenario-e — original graph was mutated despite rejection (n3.dependsOn = ${graph['n3'].dependsOn})`);
    console.log(`  ✗ FAIL: original graph was mutated despite rejection (n3.dependsOn = ${graph['n3'].dependsOn})`);
    failedTests++;
  }
}

// ── Additional edge cases ──────────────────────────────────────────────────

/**
 * Edge case 1: empty delta (ops: []) should be accepted.
 */
function edgeCase1() {
  console.log('\n=== Edge case 1: empty delta (ops: []) ===\n');

  const graph = buildLinearChain();
  const delta = makeDelta([]);

  const result = validateDelta(delta, graph);
  assertAccept(result, 'edge-case-1');
}

/**
 * Edge case 2: addNode with a duplicate id should be rejected.
 */
function edgeCase2() {
  console.log('\n=== Edge case 2: addNode with duplicate id ===\n');

  const graph = buildLinearChain();
  const delta = makeDelta([
    { op: 'addNode', node: { id: 'n1', chainId: 'chainA', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: null, metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'stale_id', 'edge-case-2');
}

/**
 * Edge case 3: updateNode on a completed node should be rejected.
 */
function edgeCase3() {
  console.log('\n=== Edge case 3: updateNode on a completed node ===\n');

  const graph = buildLinearChain();
  graph['n2'].status = 'completed';

  const delta = makeDelta([
    { op: 'updateNode', id: 'n2', fields: { deadline: '4h' } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'stale_target', 'edge-case-3');
}

/**
 * Edge case 4: updateNode on a parked node should be rejected.
 */
function edgeCase4() {
  console.log('\n=== Edge case 4: updateNode on a parked node ===\n');

  const graph = buildLinearChain();
  graph['n2'].status = 'parked';

  const delta = makeDelta([
    { op: 'updateNode', id: 'n2', fields: { deadline: '4h' } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'stale_target', 'edge-case-4');
}

/**
 * Edge case 5: removeNode that creates a dangling edge (successor not rewired).
 */
function edgeCase5() {
  console.log('\n=== Edge case 5: removeNode creating dangling edge ===\n');

  const graph = buildLinearChain();
  // Remove n2 but don't rewire n3 — n3 still depends on n2

  const delta = makeDelta([
    { op: 'removeNode', id: 'n2' },
    // n3 still depends on n2 — dangling edge
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'dangling_edge', 'edge-case-5');
}

/**
 * Edge case 6: abandonSegment with a claimed node should be rejected.
 */
function edgeCase6() {
  console.log('\n=== Edge case 6: abandonSegment with claimed node ===\n');

  const graph = buildLinearChain();
  graph['n2'].status = 'claimed';

  const delta = makeDelta([
    { op: 'abandonSegment', chainId: 'chainA' },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'stale_target', 'edge-case-6');
}

/**
 * Edge case 7: abandonSegment removing only pending nodes, keeping completed.
 */
function edgeCase7() {
  console.log('\n=== Edge case 7: abandonSegment keeps completed nodes ===\n');

  const graph = buildLinearChain();
  // n1 and n2 are completed (merged), n3 is pending
  graph['n1'].status = 'completed';
  graph['n2'].status = 'completed';

  const delta = makeDelta([
    { op: 'abandonSegment', chainId: 'chainA' },
  ]);

  const result = validateDelta(delta, graph);
  // After abandon: n1 and n2 (completed) stay, n3 (pending) removed
  // But now chainA has no pending nodes — the completed nodes are still there
  // with mergeTo on n2. The chain still has a final node (n2, mergeTo: 'main').
  // Wait — n3 was the final node (mergeTo: 'main'). After removing n3, n2
  // becomes the final node. n2 has mergeTo: 'main'. So the chain is valid.
  // Actually, n2 has mergeTo: 'main' (it was a mid-chain merge point in
  // buildLinearChain? No — in buildLinearChain, only n3 has mergeTo.
  // Let me check: buildLinearChain sets mergeTo: i === 3 ? 'main' : null.
  // So n2 has mergeTo: null. After abandoning n3, the final node is n2,
  // which has mergeTo: null → rejection (final_node_missing_mergeTo).
  //
  // Hmm, this is an interesting case. The planner should have added a new
  // final node or updated n2 to have mergeTo. But the delta only has
  // abandonSegment. So this should be rejected.
  assertReject(result, 'final_node_missing_mergeTo', 'edge-case-7');
}

/**
 * Edge case 8: valid delta — add a new chain.
 */
function edgeCase8() {
  console.log('\n=== Edge case 8: valid delta — add a new chain ===\n');

  const graph = buildTwoChains();
  // Remove chainB
  delete graph['m1'];
  delete graph['m2'];
  delete graph['m3'];

  const delta = makeDelta([
    { op: 'addNode', node: { id: 'c1', chainId: 'chainC', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: null, metadata: {} } },
    { op: 'addNode', node: { id: 'c2', chainId: 'chainC', skill: 'dev', deadline: '2h', dependsOn: ['c1'], mergeTo: 'main', metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  assertAcceptWithGraph(result, 'edge-case-8', (g) => {
    if (!g['c1'] || !g['c2']) return { ok: false, reason: 'new nodes not in graph' };
    if (g['c1'].chainId !== 'chainC') return { ok: false, reason: 'c1 chainId wrong' };
    if (g['c2'].dependsOn[0] !== 'c1') return { ok: false, reason: 'c2 dependsOn wrong' };
    if (g['c2'].mergeTo !== 'main') return { ok: false, reason: 'c2 mergeTo wrong' };
    return { ok: true, detail: 'chainC added correctly' };
  });
}

/**
 * Edge case 9: valid delta — extend a chain (add a node after the current final).
 */
function edgeCase9() {
  console.log('\n=== Edge case 9: valid delta — extend a chain ===\n');

  const graph = buildLinearChain();
  // n3 is the current final (mergeTo: 'main'). Planner adds n4 after n3,
  // and moves mergeTo from n3 to n4 (n3 is no longer the merge point).

  const delta = makeDelta([
    // Remove mergeTo from n3 (it's no longer the final node)
    { op: 'updateNode', id: 'n3', fields: { mergeTo: null } },
    // Add n4 as the new final node
    { op: 'addNode', node: { id: 'n4', chainId: 'chainA', skill: 'dev', deadline: '2h', dependsOn: ['n3'], mergeTo: 'main', metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  assertAcceptWithGraph(result, 'edge-case-9', (g) => {
    if (!g['n4']) return { ok: false, reason: 'n4 not in graph' };
    if (g['n3'].mergeTo !== null) return { ok: false, reason: 'n3 still has mergeTo' };
    if (g['n4'].mergeTo !== 'main') return { ok: false, reason: 'n4 missing mergeTo' };
    return { ok: true, detail: 'chain extended correctly' };
  });
}

/**
 * Edge case 10: cross-chain edge to a non-merge-point node should be rejected.
 */
function edgeCase10() {
  console.log('\n=== Edge case 10: cross-chain edge to non-merge-point ===\n');

  const graph = buildTwoChains();
  // Remove chainB
  delete graph['m1'];
  delete graph['m2'];
  delete graph['m3'];

  // Planner adds m1 depending on n1 (chainA), but n1 has no mergeTo
  const delta = makeDelta([
    { op: 'addNode', node: { id: 'm1', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['n1'], mergeTo: null, metadata: {} } },
    { op: 'addNode', node: { id: 'm2', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['m1'], mergeTo: 'main', metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'cross_chain_not_merge_point', 'edge-case-10');
}

/**
 * Edge case 11: updateNode must not set status (machinery-derived field).
 */
function edgeCase11() {
  console.log('\n=== Edge case 11: updateNode must not set status ===\n');

  const graph = buildLinearChain();

  const delta = makeDelta([
    { op: 'updateNode', id: 'n2', fields: { status: 'completed' } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'invalid_op', 'edge-case-11');
}

/**
 * Edge case 12: chain with branching (not a total order) should be rejected.
 */
function edgeCase12() {
  console.log('\n=== Edge case 12: chain with branching (not total order) ===\n');

  const graph = buildLinearChain();
  // Remove chainA, build a branching chain
  delete graph['n1'];
  delete graph['n2'];
  delete graph['n3'];

  const delta = makeDelta([
    // chainD: d1 → d2, d1 → d3 (branching — two successors)
    { op: 'addNode', node: { id: 'd1', chainId: 'chainD', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: null, metadata: {} } },
    { op: 'addNode', node: { id: 'd2', chainId: 'chainD', skill: 'dev', deadline: '2h', dependsOn: ['d1'], mergeTo: 'main', metadata: {} } },
    { op: 'addNode', node: { id: 'd3', chainId: 'chainD', skill: 'dev', deadline: '2h', dependsOn: ['d1'], mergeTo: 'main', metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  // d1 has two successors (d2 and d3) — not a total order
  // Also, both d2 and d3 have mergeTo, so there are two "final" nodes
  assertReject(result, 'not_total_order', 'edge-case-12');
}

/**
 * Edge case 13: invalid envelope (missing planningRunId).
 */
function edgeCase13() {
  console.log('\n=== Edge case 13: invalid envelope (missing planningRunId) ===\n');

  const graph = buildLinearChain();
  const delta = { mode: 'expansion', ops: [] }; // no planningRunId

  const result = validateDelta(delta, graph);
  assertReject(result, 'invalid_envelope', 'edge-case-13');
}

/**
 * Edge case 14: unknown op type.
 */
function edgeCase14() {
  console.log('\n=== Edge case 14: unknown op type ===\n');

  const graph = buildLinearChain();
  const delta = makeDelta([
    { op: 'flyToTheMoon', target: 'mars' },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'invalid_op', 'edge-case-14');
}

/**
 * Edge case 15: addNode with dependsOn on a non-existent node.
 */
function edgeCase15() {
  console.log('\n=== Edge case 15: addNode with dangling dependsOn ===\n');

  const graph = buildLinearChain();
  const delta = makeDelta([
    { op: 'addNode', node: { id: 'x1', chainId: 'chainX', skill: 'dev', deadline: '2h', dependsOn: ['nonexistent'], mergeTo: 'main', metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'dangling_edge', 'edge-case-15');
}

/**
 * Edge case 16: valid cross-chain edge to a merge-point node.
 */
function edgeCase16() {
  console.log('\n=== Edge case 16: valid cross-chain edge to merge-point ===\n');

  const graph = buildCrossChainGraph();
  // Remove chainB (m1, m2)
  delete graph['m1'];
  delete graph['m2'];

  // Planner adds chainB: m1 depends on n2 (merge point in chainA)
  const delta = makeDelta([
    { op: 'addNode', node: { id: 'm1', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['n2'], mergeTo: null, metadata: {} } },
    { op: 'addNode', node: { id: 'm2', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['m1'], mergeTo: 'main', metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  assertAccept(result, 'edge-case-16');
}

/**
 * Edge case 17: all-or-nothing — a delta with a valid op followed by an
 * invalid op must be fully rejected, with no partial application.
 */
function edgeCase17() {
  console.log('\n=== Edge case 17: all-or-nothing (valid then invalid op) ===\n');

  const graph = buildLinearChain();
  const originalGraph = JSON.parse(JSON.stringify(graph));

  const delta = makeDelta([
    // Valid: add a new chain
    { op: 'addNode', node: { id: 'c1', chainId: 'chainC', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: null, metadata: {} } },
    { op: 'addNode', node: { id: 'c2', chainId: 'chainC', skill: 'dev', deadline: '2h', dependsOn: ['c1'], mergeTo: 'main', metadata: {} } },
    // Invalid: remove a claimed node
    { op: 'removeNode', id: 'n2' }, // n2 is pending, so this is valid...
  ]);

  // Actually n2 is pending, so removeNode is valid. Let me make n2 claimed.
  graph['n2'].status = 'claimed';

  const result = validateDelta(delta, graph);
  assertReject(result, 'stale_target', 'edge-case-17');

  // Verify no partial application: c1 and c2 should NOT be in the original graph
  totalTests++;
  if (!graph['c1'] && !graph['c2']) {
    console.log('  ✓ PASS: original graph unchanged (c1, c2 not added) — all-or-nothing held');
    passedTests++;
  } else {
    failures.push(`FAIL: edge-case-17 — original graph was mutated despite rejection (c1=${!!graph['c1']}, c2=${!!graph['c2']})`);
    console.log(`  ✗ FAIL: original graph was mutated despite rejection (c1=${!!graph['c1']}, c2=${!!graph['c2']})`);
    failedTests++;
  }
}

/**
 * Edge case 18: updateNode rewiring dependsOn to a cross-chain non-merge-point.
 */
function edgeCase18() {
  console.log('\n=== Edge case 18: updateNode rewiring to cross-chain non-merge-point ===\n');

  const graph = buildCrossChainGraph();
  // m1 currently depends on n2 (merge point — valid). Planner rewires m1
  // to depend on n1 (not a merge point — invalid).

  const delta = makeDelta([
    { op: 'updateNode', id: 'm1', fields: { dependsOn: ['n1'] } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'cross_chain_not_merge_point', 'edge-case-18');
}

/**
 * Edge case 19: updateNode changing id should be rejected (Blocker 1).
 */
function edgeCase19() {
  console.log('\n=== Edge case 19: updateNode changing id (Blocker 1) ===\n');

  const graph = buildLinearChain();

  const delta = makeDelta([
    { op: 'updateNode', id: 'n2', fields: { id: 'n9' } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'invalid_op', 'edge-case-19');
}

/**
 * Edge case 20: updateNode changing chainId should be rejected (Blocker 2).
 */
function edgeCase20() {
  console.log('\n=== Edge case 20: updateNode changing chainId (Blocker 2) ===\n');

  const graph = buildLinearChain();

  const delta = makeDelta([
    { op: 'updateNode', id: 'n2', fields: { chainId: 'chainB' } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'invalid_op', 'edge-case-20');
}

/**
 * Edge case 21: addNode with status set should be rejected (Major 4).
 */
function edgeCase21() {
  console.log('\n=== Edge case 21: addNode with status set (Major 4) ===\n');

  const graph = buildLinearChain();
  delete graph['n1']; delete graph['n2']; delete graph['n3'];

  const delta = makeDelta([
    { op: 'addNode', node: { id: 's1', chainId: 'chainS', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: 'main', metadata: {}, status: 'completed' } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'invalid_op', 'edge-case-21');
}

/**
 * Edge case 22: self-loop — a node depending on itself.
 *
 * Via addNode, this is caught as a dangling edge (the node doesn't exist
 * yet when we check its dependsOn targets). Via updateNode (where the
 * node already exists), it's caught by cycle detection. Both rejections
 * are correct — the graph must be acyclic.
 */
function edgeCase22() {
  console.log('\n=== Edge case 22: self-loop (node depends on itself) ===\n');

  // (a) Via addNode — caught as dangling_edge (node doesn't exist yet)
  {
    console.log('  (a) via addNode:');
    const graph = buildLinearChain();
    delete graph['n1']; delete graph['n2']; delete graph['n3'];

    const delta = makeDelta([
      { op: 'addNode', node: { id: 'sl1', chainId: 'chainSL', skill: 'dev', deadline: '2h', dependsOn: ['sl1'], mergeTo: 'main', metadata: {} } },
    ]);

    const result = validateDelta(delta, graph);
    assertReject(result, 'dangling_edge', 'edge-case-22a');
  }

  // (b) Via updateNode — caught as cyclic (node already exists)
  {
    console.log('  (b) via updateNode:');
    const graph = {};
    graph['sl2'] = { id: 'sl2', chainId: 'chainSL2', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: 'main', metadata: {}, status: 'pending' };

    const delta = makeDelta([
      { op: 'updateNode', id: 'sl2', fields: { dependsOn: ['sl2'] } },
    ]);

    const result = validateDelta(delta, graph);
    assertReject(result, 'cyclic', 'edge-case-22b');
  }
}

/**
 * Edge case 23: single-node chain (valid — one node with mergeTo).
 */
function edgeCase23() {
  console.log('\n=== Edge case 23: single-node chain (valid) ===\n');

  const graph = buildLinearChain();
  delete graph['n1']; delete graph['n2']; delete graph['n3'];

  const delta = makeDelta([
    { op: 'addNode', node: { id: 'solo1', chainId: 'chainSolo', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: 'main', metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  assertAccept(result, 'edge-case-23');
}

/**
 * Edge case 24: single-node chain without mergeTo (invalid).
 */
function edgeCase24() {
  console.log('\n=== Edge case 24: single-node chain without mergeTo ===\n');

  const graph = buildLinearChain();
  delete graph['n1']; delete graph['n2']; delete graph['n3'];

  const delta = makeDelta([
    { op: 'addNode', node: { id: 'solo2', chainId: 'chainSolo2', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: null, metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'final_node_missing_mergeTo', 'edge-case-24');
}

/**
 * Edge case 25: abandonSegment on a non-existent chain.
 */
function edgeCase25() {
  console.log('\n=== Edge case 25: abandonSegment on non-existent chain ===\n');

  const graph = buildLinearChain();

  const delta = makeDelta([
    { op: 'abandonSegment', chainId: 'chainNonexistent' },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'stale_target', 'edge-case-25');
}

/**
 * Edge case 26: abandonSegment with a failed node (should be allowed —
 * failed nodes are not in-flight).
 */
function edgeCase26() {
  console.log('\n=== Edge case 26: abandonSegment with failed node (allowed) ===\n');

  const graph = buildLinearChain();
  // n1 completed (merged), n2 failed, n3 pending
  graph['n1'].status = 'completed';
  graph['n2'].status = 'failed';

  // Abandon: n3 (pending) removed, n1 (completed) and n2 (failed) stay.
  // After removal, chainA has n1 and n2. n2 is the final node (no successor).
  // n2 has mergeTo: null (only n3 had mergeTo). So this should reject with
  // final_node_missing_mergeTo — the planner needs to handle the chain shape
  // after abandonment. But the abandonSegment itself is not rejected for
  // the failed node.
  const delta = makeDelta([
    { op: 'abandonSegment', chainId: 'chainA' },
  ]);

  const result = validateDelta(delta, graph);
  // The abandonSegment op itself succeeds; the whole-graph check catches
  // the missing mergeTo on the new final node.
  assertReject(result, 'final_node_missing_mergeTo', 'edge-case-26');
}

/**
 * Edge case 27: cross-chain edge to a completed non-merge-point node
 * (completions don't bypass the merge-point requirement).
 */
function edgeCase27() {
  console.log('\n=== Edge case 27: cross-chain edge to completed non-merge-point ===\n');

  const graph = buildCrossChainGraph();
  // n1 completed (but n1 has no mergeTo — it's not a merge point)
  graph['n1'].status = 'completed';
  // Remove chainB
  delete graph['m1']; delete graph['m2'];

  // Planner adds m1 depending on n1 (completed, but not a merge point)
  const delta = makeDelta([
    { op: 'addNode', node: { id: 'm1', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['n1'], mergeTo: null, metadata: {} } },
    { op: 'addNode', node: { id: 'm2', chainId: 'chainB', skill: 'dev', deadline: '2h', dependsOn: ['m1'], mergeTo: 'main', metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'cross_chain_not_merge_point', 'edge-case-27');
}

/**
 * Edge case 28: within-chain cycle (n1 → n2 → n1).
 */
function edgeCase28() {
  console.log('\n=== Edge case 28: within-chain cycle ===\n');

  const graph = {};
  // Build a graph with a within-chain cycle: n1 → n2 → n1
  // Both in chainA. n1 depends on n2, n2 depends on n1.
  // We can't build this with addNode (each would need the other to exist first),
  // so we seed the graph directly and use updateNode to create the cycle.
  graph['n1'] = { id: 'n1', chainId: 'chainA', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: null, metadata: {}, status: 'pending' };
  graph['n2'] = { id: 'n2', chainId: 'chainA', skill: 'dev', deadline: '2h', dependsOn: ['n1'], mergeTo: 'main', metadata: {}, status: 'pending' };

  // Delta: make n1 depend on n2 (creating cycle n1 → n2 → n1)
  const delta = makeDelta([
    { op: 'updateNode', id: 'n1', fields: { dependsOn: ['n2'] } },
  ]);

  const result = validateDelta(delta, graph);
  assertReject(result, 'cyclic', 'edge-case-28');
}

/**
 * Edge case 29: dependsOn with duplicate entries.
 */
function edgeCase29() {
  console.log('\n=== Edge case 29: dependsOn with duplicate entries ===\n');

  const graph = buildLinearChain();
  delete graph['n1']; delete graph['n2']; delete graph['n3'];

  // Add a node with duplicate dependsOn entries
  graph['base'] = { id: 'base', chainId: 'chainD', skill: 'dev', deadline: '2h', dependsOn: [], mergeTo: null, metadata: {}, status: 'pending' };

  const delta = makeDelta([
    { op: 'addNode', node: { id: 'dup1', chainId: 'chainD', skill: 'dev', deadline: '2h', dependsOn: ['base', 'base'], mergeTo: 'main', metadata: {} } },
  ]);

  const result = validateDelta(delta, graph);
  // Two within-chain predecessors for dup1 → not a total order
  assertReject(result, 'not_total_order', 'edge-case-29');
}

/**
 * Edge case 30: empty graph with empty delta (valid — no chains to check).
 */
function edgeCase30() {
  console.log('\n=== Edge case 30: empty graph with empty delta ===\n');

  const graph = {};
  const delta = makeDelta([]);

  const result = validateDelta(delta, graph);
  assertAccept(result, 'edge-case-30');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Spike: fold-time delta validation ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);

  // The five documented scenarios
  scenarioA();
  scenarioB();
  scenarioC();
  scenarioD();
  scenarioE();

  // Additional edge cases
  edgeCase1();
  edgeCase2();
  edgeCase3();
  edgeCase4();
  edgeCase5();
  edgeCase6();
  edgeCase7();
  edgeCase8();
  edgeCase9();
  edgeCase10();
  edgeCase11();
  edgeCase12();
  edgeCase13();
  edgeCase14();
  edgeCase15();
  edgeCase16();
  edgeCase17();
  edgeCase18();
  edgeCase19();
  edgeCase20();
  edgeCase21();
  edgeCase22();
  edgeCase23();
  edgeCase24();
  edgeCase25();
  edgeCase26();
  edgeCase27();
  edgeCase28();
  edgeCase29();
  edgeCase30();

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total tests:  ${totalTests}`);
  console.log(`Passed:       ${passedTests}`);
  console.log(`Failed:       ${failedTests}`);

  if (failures.length > 0) {
    console.log('\n=== FAILURES ===');
    for (const f of failures) {
      console.log(`  ${f}`);
    }
  }

  console.log(`\nResult: ${failedTests === 0 ? 'ALL PASS' : 'HAS FAILURES'}`);

  if (failedTests > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}

module.exports = { validateDelta, detectCycle, checkTotalOrder };
