// Fold-time delta validation for the gen-3 pipeline's planning runs.
//
// A planning run produces a graph delta (a list of ops) that the
// dispatcher's fold step validates against current graph state and applies
// atomically (all-or-nothing). Validation is two-phase: per-op rules fire
// during application (stale target, fresh id, edge existence, immutable
// fields), whole-graph rules fire after all ops are applied on the resulting
// graph (acyclic, cross-chain merge-points, final-node mergeTo, total order,
// mergeTo equals trunkBranch). A semantic staleness check (trunk-SHA pin)
// runs last, only if structural validation passed.
//
// All-or-nothing is by construction: the function works on a deep copy
// (`structuredClone`) of the input graph and never mutates the input. A
// rejection returns the first failing op/rule; the original graph is
// unchanged. Verified spike 2026-07-23 — see docs/todo/spike-delta-validation.md.

// Statuses whose node specs are frozen — updateNode/removeNode on these is
// stale_target. The doc names claimed/parked/completed; the spike (F2)
// confirmed failed and abandoned are frozen too (a failed node has been
// attempted, an abandoned node is historical).
const FROZEN_STATUSES = new Set(['claimed', 'parked', 'completed', 'failed', 'abandoned']);

// In-flight statuses — a chain with any of these cannot be abandoned
// (abandonSegment targets blocked chains, not running ones).
const IN_FLIGHT_STATUSES = new Set(['claimed', 'parked']);

// Fields updateNode must not set as replacements (immutable or
// machinery-derived). `id` is the target selector, not a replacement field —
// it is required and skipped during application, so it is not listed here.
const UPDATE_NODE_IMMUTABLE = new Set(['chainId', 'status']);

/**
 * Validate a planning delta against current graph state.
 *
 * Per-op rules are checked during application; whole-graph rules are checked
 * on the resulting graph after all ops apply. The input graph is never
 * mutated — validation works on a `structuredClone` deep copy.
 *
 * @param {object} delta - The planning delta envelope.
 * @param {object} currentGraph - The current graph state.
 * @param {string} trunkBranch - The configured trunk branch (e.g. "main").
 * @param {string|null} [currentTrunkSha] - The current trunk SHA, captured by
 *   the caller via `git rev-parse origin/<trunkBranch>`. Null skips the
 *   semantic staleness check (testing / backward compat).
 * @returns {{ accepted: true, graph: object } | { accepted: false, rejection: { opIndex: number, op: object, rule: string, detail: string } }}
 */
export function validateDelta(delta, currentGraph, trunkBranch, currentTrunkSha = null) {
  // --- Envelope / parse check (defense in depth) -------------------------
  if (!isPlainObject(delta)) {
    return reject(-1, null, 'invalid_delta', 'delta is not an object');
  }
  if (!Array.isArray(delta.ops)) {
    return reject(-1, delta, 'invalid_delta', 'delta.ops is missing or not an array');
  }
  if (typeof delta.planningRunId !== 'string' || delta.planningRunId.length === 0) {
    return reject(-1, delta, 'invalid_delta', 'delta.planningRunId is missing or empty');
  }
  if (!['expansion', 'conflict', 'replan'].includes(delta.mode)) {
    return reject(-1, delta, 'invalid_delta', `delta.mode "${delta.mode}" is not a known mode`);
  }

  // --- Deep copy — all-or-nothing by construction ------------------------
  const graph = structuredClone(currentGraph);
  if (!Array.isArray(graph.nodes)) graph.nodes = [];

  // Index existing node ids for the duplicate_id check.
  const ids = new Set(graph.nodes.map((n) => n.id));

  // --- Apply ops in order, checking per-op rules -------------------------
  for (let i = 0; i < delta.ops.length; i++) {
    const op = delta.ops[i];
    if (!isPlainObject(op) || typeof op.type !== 'string') {
      return reject(i, op, 'invalid_op', 'op is missing a string type');
    }
    let r;
    switch (op.type) {
      case 'addNode':
        r = applyAddNode(op, graph, ids, i);
        break;
      case 'updateNode':
        r = applyUpdateNode(op, graph, ids, i);
        break;
      case 'removeNode':
        r = applyRemoveNode(op, graph, ids, i);
        break;
      case 'abandonSegment':
        r = applyAbandonSegment(op, graph, i);
        break;
      default:
        return reject(i, op, 'invalid_op', `unknown op type "${op.type}"`);
    }
    if (r !== null) return r; // per-op rule fired — reject, original graph untouched
  }

  // --- Whole-graph rules on the resulting graph -------------------------
  const whole = checkWholeGraph(graph, trunkBranch);
  if (whole !== null) return reject(-1, null, whole.rule, whole.detail);

  // --- Semantic staleness check (runs only after structural validation) --
  if (
    typeof delta.trunkShaAtT0 === 'string' &&
    delta.trunkShaAtT0.length > 0 &&
    typeof currentTrunkSha === 'string' &&
    currentTrunkSha.length > 0 &&
    delta.trunkShaAtT0 !== currentTrunkSha
  ) {
    return reject(
      -1,
      null,
      'semantic_stale_trunk_moved',
      `trunk moved between T0 (${delta.trunkShaAtT0.slice(0, 12)}) and T1 (${currentTrunkSha.slice(0, 12)})`,
    );
  }

  return { accepted: true, graph };
}

/**
 * Apply an addNode op. Per-op rules: id must be fresh; status must not be set;
 * every dependsOn target must exist.
 */
function applyAddNode(op, graph, ids, opIndex) {
  if (typeof op.id !== 'string' || op.id.length === 0) {
    return reject(opIndex, op, 'invalid_op', 'addNode is missing a string id');
  }
  if (ids.has(op.id)) {
    return reject(opIndex, op, 'duplicate_id', `addNode id "${op.id}" already exists in the graph`);
  }
  if (op.status !== undefined) {
    return reject(opIndex, op, 'invalid_op', 'addNode must not set status (machinery sets it to pending)');
  }
  if (typeof op.chainId !== 'string' || op.chainId.length === 0) {
    return reject(opIndex, op, 'invalid_op', 'addNode is missing a string chainId');
  }
  // Edge targets must exist.
  const deps = Array.isArray(op.dependsOn) ? op.dependsOn : [];
  for (const dep of deps) {
    if (!ids.has(dep)) {
      return reject(opIndex, op, 'dangling_edge', `addNode "${op.id}" depends on "${dep}" which does not exist`);
    }
  }
  // Machinery sets status to pending; metadata defaults to {}.
  const node = { ...op };
  delete node.type;
  node.status = 'pending';
  if (node.metadata === undefined) node.metadata = {};
  if (node.dependsOn === undefined) node.dependsOn = [];
  if (node.attempts === undefined) node.attempts = 0;
  graph.nodes.push(node);
  ids.add(op.id);
  return null;
}

/**
 * Apply an updateNode op. Per-op rules: target must exist and be pending
 * (not frozen); must not set id, chainId, or status; new edge targets must exist.
 */
function applyUpdateNode(op, graph, ids, opIndex) {
  if (typeof op.id !== 'string' || op.id.length === 0) {
    return reject(opIndex, op, 'invalid_op', 'updateNode is missing a string id');
  }
  for (const field of UPDATE_NODE_IMMUTABLE) {
    if (op[field] !== undefined) {
      return reject(opIndex, op, 'invalid_op', `updateNode must not set ${field} (immutable or machinery-derived)`);
    }
  }
  const node = graph.nodes.find((n) => n.id === op.id);
  if (!node) {
    return reject(opIndex, op, 'stale_target', `updateNode target "${op.id}" does not exist`);
  }
  if (FROZEN_STATUSES.has(node.status)) {
    return reject(
      opIndex,
      op,
      'stale_target',
      `updateNode target "${op.id}" is ${node.status} (frozen, not pending)`,
    );
  }
  // If dependsOn is being replaced, every new target must exist.
  if (op.dependsOn !== undefined) {
    if (!Array.isArray(op.dependsOn)) {
      return reject(opIndex, op, 'invalid_op', `updateNode "${op.id}" dependsOn must be an array`);
    }
    for (const dep of op.dependsOn) {
      if (!ids.has(dep)) {
        return reject(opIndex, op, 'dangling_edge', `updateNode "${op.id}" depends on "${dep}" which does not exist`);
      }
    }
  }
  // Apply field replacements (everything except type and id).
  for (const key of Object.keys(op)) {
    if (key === 'type' || key === 'id') continue;
    node[key] = op[key];
  }
  return null;
}

/**
 * Apply a removeNode op. Per-op rules: target must exist and be pending
 * (not frozen). Its edges go with it (other nodes' dependsOn referencing it
 * become dangling — the whole-graph edge check does not catch within-graph
 * dangling edges, so we re-check dependsOn targets after removal).
 */
function applyRemoveNode(op, graph, ids, opIndex) {
  if (typeof op.id !== 'string' || op.id.length === 0) {
    return reject(opIndex, op, 'invalid_op', 'removeNode is missing a string id');
  }
  const idx = graph.nodes.findIndex((n) => n.id === op.id);
  if (idx === -1) {
    return reject(opIndex, op, 'stale_target', `removeNode target "${op.id}" does not exist`);
  }
  const node = graph.nodes[idx];
  if (FROZEN_STATUSES.has(node.status)) {
    return reject(
      opIndex,
      op,
      'stale_target',
      `removeNode target "${op.id}" is ${node.status} (frozen, not pending)`,
    );
  }
  graph.nodes.splice(idx, 1);
  ids.delete(op.id);
  // Any remaining node depending on the removed node now has a dangling edge.
  for (const remaining of graph.nodes) {
    const deps = Array.isArray(remaining.dependsOn) ? remaining.dependsOn : [];
    if (deps.includes(op.id)) {
      return reject(
        opIndex,
        op,
        'dangling_edge',
        `removeNode "${op.id}" leaves "${remaining.id}" with a dangling dependsOn`,
      );
    }
  }
  return null;
}

/**
 * Apply an abandonSegment op. Per-op rules: the chain must exist; no node in
 * the chain may be in-flight (claimed or parked). Mutation (spike F1): pending
 * nodes are removed; completed/failed/abandoned nodes stay as historical record.
 */
function applyAbandonSegment(op, graph, opIndex) {
  if (typeof op.chainId !== 'string' || op.chainId.length === 0) {
    return reject(opIndex, op, 'invalid_op', 'abandonSegment is missing a string chainId');
  }
  const chainNodes = graph.nodes.filter((n) => n.chainId === op.chainId);
  if (chainNodes.length === 0) {
    return reject(opIndex, op, 'stale_target', `abandonSegment chain "${op.chainId}" has no nodes`);
  }
  for (const n of chainNodes) {
    if (IN_FLIGHT_STATUSES.has(n.status)) {
      return reject(
        opIndex,
        op,
        'chain_in_flight',
        `abandonSegment chain "${op.chainId}" has in-flight node "${n.id}" (status: ${n.status})`,
      );
    }
  }
  // Remove pending nodes only; completed/failed/abandoned stay as history.
  graph.nodes = graph.nodes.filter((n) => {
    if (n.chainId !== op.chainId) return true;
    return n.status !== 'pending';
  });
  return null;
}

/**
 * Run all whole-graph rules on the resulting graph. Returns null if all pass,
 * or { rule, detail } for the first failure.
 */
function checkWholeGraph(graph, trunkBranch) {
  const nodes = graph.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Group nodes by chain for the total-order and final-node checks.
  const chains = new Map();
  for (const n of nodes) {
    if (!chains.has(n.chainId)) chains.set(n.chainId, []);
    chains.get(n.chainId).push(n);
  }

  // --- Acyclic (whole-graph, including cross-chain edges) ---------------
  // Runs first — a cycle is the most fundamental structural break, and the
  // total-order check below assumes a DAG (a cycle yields 0 heads).
  const cycle = findCycle(nodes, byId);
  if (cycle !== null) {
    return { rule: 'cyclic', detail: `cycle detected: ${cycle.join(' → ')}` };
  }

  // --- Cross-chain edges target merge-point nodes -----------------------
  for (const n of nodes) {
    const deps = Array.isArray(n.dependsOn) ? n.dependsOn : [];
    for (const dep of deps) {
      const target = byId.get(dep);
      // target existence already checked per-op; defense in depth here.
      if (!target) {
        return { rule: 'dangling_edge', detail: `node "${n.id}" depends on "${dep}" which does not exist` };
      }
      if (target.chainId !== n.chainId) {
        // Cross-chain edge — target must be a merge-point (carry mergeTo).
        if (target.mergeTo === undefined || target.mergeTo === null) {
          return {
            rule: 'cross_chain_not_merge_point',
            detail: `node "${n.id}" cross-chain edge to "${dep}" which is not a merge-point (no mergeTo)`,
          };
        }
      }
    }
  }

  // --- mergeTo equals the configured trunkBranch (explicit, spike F3) ----
  for (const n of nodes) {
    if (n.mergeTo !== undefined && n.mergeTo !== null) {
      if (n.mergeTo !== trunkBranch) {
        return {
          rule: 'invalid_merge_target',
          detail: `node "${n.id}" mergeTo "${n.mergeTo}" !== trunkBranch "${trunkBranch}"`,
        };
      }
    }
  }

  // --- Every chain's final node carries mergeTo -------------------------
  for (const [chainId, chainNodes] of chains) {
    // The final node is the one with no within-chain successor.
    const withinChainSucc = new Set();
    for (const n of chainNodes) {
      const deps = Array.isArray(n.dependsOn) ? n.dependsOn : [];
      for (const dep of deps) {
        const target = byId.get(dep);
        if (target && target.chainId === chainId) {
          // dep is a predecessor of n, so dep has n as a successor.
          // We want nodes that ARE successors — track which nodes appear as a dep target.
        }
      }
    }
    // A node is a "successor" if some other node in the chain depends on it.
    const hasPredecessor = new Set();
    for (const n of chainNodes) {
      const deps = Array.isArray(n.dependsOn) ? n.dependsOn : [];
      for (const dep of deps) {
        const target = byId.get(dep);
        if (target && target.chainId === chainId) {
          hasPredecessor.add(n.id);
        }
      }
    }
    // Final nodes = chain nodes with no predecessor (tail of the path).
    const finalNodes = chainNodes.filter((n) => !hasPredecessor.has(n.id));
    for (const fn of finalNodes) {
      if (fn.mergeTo === undefined || fn.mergeTo === null) {
        return {
          rule: 'final_node_missing_mergeTo',
          detail: `chain "${chainId}" final node "${fn.id}" is missing mergeTo`,
        };
      }
    }
  }

  // --- Every chain remains a total order (a path) -----------------------
  for (const [chainId, chainNodes] of chains) {
    const orderResult = checkTotalOrder(chainId, chainNodes, byId);
    if (orderResult !== null) return orderResult;
  }

  return null;
}

/**
 * Check that a chain is a total order: each node has at most 1 within-chain
 * predecessor and 1 within-chain successor, exactly 1 head, and the path is
 * connected (walkable from head to tail).
 */
function checkTotalOrder(chainId, chainNodes, byId) {
  const inChain = new Set(chainNodes.map((n) => n.id));
  const preds = new Map(); // id -> count of within-chain predecessors
  const succs = new Map(); // id -> count of within-chain successors
  const succOf = new Map(); // id -> successor id (for the walk)
  for (const n of chainNodes) {
    preds.set(n.id, 0);
    succs.set(n.id, 0);
  }
  for (const n of chainNodes) {
    const deps = Array.isArray(n.dependsOn) ? n.dependsOn : [];
    let withinChainPredCount = 0;
    for (const dep of deps) {
      if (inChain.has(dep)) {
        withinChainPredCount++;
        succs.set(dep, succs.get(dep) + 1);
        succOf.set(dep, n.id);
      }
    }
    preds.set(n.id, withinChainPredCount);
  }
  // Each node: at most 1 predecessor, at most 1 successor.
  for (const n of chainNodes) {
    if (preds.get(n.id) > 1) {
      return {
        rule: 'chain_not_total_order',
        detail: `chain "${chainId}" node "${n.id}" has ${preds.get(n.id)} within-chain predecessors (max 1)`,
      };
    }
    if (succs.get(n.id) > 1) {
      return {
        rule: 'chain_not_total_order',
        detail: `chain "${chainId}" node "${n.id}" has ${succs.get(n.id)} within-chain successors (max 1)`,
      };
    }
  }
  // Exactly one head (no predecessor).
  const heads = chainNodes.filter((n) => preds.get(n.id) === 0);
  if (heads.length !== 1) {
    return {
      rule: 'chain_not_total_order',
      detail: `chain "${chainId}" has ${heads.length} head nodes (expected 1)`,
    };
  }
  // Walk from head to tail, verifying connectivity.
  const head = heads[0];
  const visited = new Set();
  let cur = head.id;
  while (cur !== undefined) {
    if (visited.has(cur)) {
      // Should have been caught by the cycle check, but guard anyway.
      return {
        rule: 'chain_not_total_order',
        detail: `chain "${chainId}" walk revisited "${cur}" (internal cycle)`,
      };
    }
    visited.add(cur);
    cur = succOf.get(cur);
  }
  if (visited.size !== chainNodes.length) {
    return {
      rule: 'chain_not_total_order',
      detail: `chain "${chainId}" walk reached ${visited.size} of ${chainNodes.length} nodes (disconnected)`,
    };
  }
  return null;
}

/**
 * Detect a cycle in the whole-graph dependency DAG via DFS three-color marking.
 * White=unvisited, gray=in-progress, black=done. A back edge to a gray node
 * is a cycle. Returns the cycle path as an array of ids, or null if acyclic.
 */
function findCycle(nodes, byId) {
  const color = new Map(); // id -> 'white' | 'gray' | 'black'
  for (const n of nodes) color.set(n.id, 'white');
  const parent = new Map();
  for (const n of nodes) {
    if (color.get(n.id) !== 'white') continue;
    const cycle = dfsVisit(n, color, parent, byId);
    if (cycle !== null) return cycle;
  }
  return null;
}

function dfsVisit(start, color, parent, byId) {
  const stack = [{ id: start.id, depIdx: 0 }];
  color.set(start.id, 'gray');
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const node = byId.get(frame.id);
    const deps = Array.isArray(node.dependsOn) ? node.dependsOn : [];
    if (frame.depIdx >= deps.length) {
      color.set(frame.id, 'black');
      stack.pop();
      continue;
    }
    const dep = deps[frame.depIdx++];
    const target = byId.get(dep);
    if (!target) continue; // dangling — caught elsewhere; skip here
    const c = color.get(target.id);
    if (c === 'gray') {
      // Back edge — cycle. Reconstruct the path from start to target, then close.
      const path = [];
      let cur = frame.id;
      path.push(target.id);
      while (cur !== target.id && cur !== undefined) {
        path.push(cur);
        cur = parent.get(cur);
      }
      path.push(target.id);
      path.reverse();
      return path;
    }
    if (c === 'white') {
      parent.set(target.id, frame.id);
      color.set(target.id, 'gray');
      stack.push({ id: target.id, depIdx: 0 });
    }
  }
  return null;
}

// --- Helpers -----------------------------------------------------------

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function reject(opIndex, op, rule, detail) {
  return { accepted: false, rejection: { opIndex, op, rule, detail } };
}

/**
 * The high-level fold function called by the pass. Validates the delta and
 * returns the result (accepted graph or rejection). Thin wrapper now — leaves
 * room for the pass to add journaling around it.
 *
 * @param {object} delta
 * @param {object} currentGraph
 * @param {string} trunkBranch
 * @param {string|null} [currentTrunkSha]
 */
export function foldDelta(delta, currentGraph, trunkBranch, currentTrunkSha = null) {
  return validateDelta(delta, currentGraph, trunkBranch, currentTrunkSha);
}

/**
 * Build a journal event for a rejected delta, carrying evidence: the delta's
 * planningRunId, the failing op index, the rule, and the detail.
 *
 * @param {object} delta
 * @param {{ opIndex: number, op: object, rule: string, detail: string }} rejection
 */
export function buildRejectionEvent(delta, rejection) {
  return {
    type: 'planning_rejected',
    planningRunId: delta?.planningRunId ?? null,
    mode: delta?.mode ?? null,
    opIndex: rejection.opIndex,
    rule: rejection.rule,
    detail: rejection.detail,
    op: rejection.op,
    authoredAt: delta?.authoredAt ?? null,
    at: new Date().toISOString(),
  };
}

/**
 * Build a journal event for an accepted delta, carrying the planningRunId,
 * mode, and op count.
 *
 * @param {object} delta
 * @param {number} nodeCount - The resulting graph's node count.
 */
export function buildAcceptEvent(delta, nodeCount) {
  return {
    type: 'planning_accepted',
    planningRunId: delta?.planningRunId ?? null,
    mode: delta?.mode ?? null,
    opCount: Array.isArray(delta?.ops) ? delta.ops.length : 0,
    nodeCount,
    authoredAt: delta?.authoredAt ?? null,
    at: new Date().toISOString(),
  };
}

// --- Self-test (guarded) ----------------------------------------------
// Run with: node pipeline3/lib/delta.mjs

if (import.meta.url === `file://${process.argv[1]}`) {
  runSelfTest();
}

function runSelfTest() {
  const TRUNK = 'main';
  let pass = 0;
  let fail = 0;
  function check(name, cond, detail = '') {
    if (cond) {
      pass++;
      console.log(`  ✓ ${name}`);
    } else {
      fail++;
      console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
    }
  }

  function baseGraph() {
    return {
      runId: 'r1',
      generatedAt: '2026-07-23T00:00:00.000Z',
      paused: false,
      policy: { trunkBranch: 'main' },
      nodes: [],
    };
  }

  // 1. Valid addNode delta (single-node chain with mergeTo) → accepted
  {
    const g = baseGraph();
    const delta = {
      planningRunId: 'p1',
      mode: 'expansion',
      authoredAt: '2026-07-23T00:00:00.000Z',
      trunkShaAtT0: 'abc123',
      ops: [
        { type: 'addNode', id: 'n1', chainId: 'c1', skill: 's', agent: 'a', prompt: 'p', mergeTo: 'main' },
      ],
    };
    const r = validateDelta(delta, g, TRUNK, 'abc123');
    check('1. valid addNode accepted', r.accepted === true);
    check('1. resulting graph has the node', r.accepted && r.graph.nodes.length === 1);
    check('1. machinery set status to pending', r.accepted && r.graph.nodes[0].status === 'pending');
    check('1. original graph unchanged', g.nodes.length === 0);
  }

  // 2. removeNode on a claimed node → rejected with stale_target
  {
    const g = baseGraph();
    g.nodes.push({ id: 'n1', chainId: 'c1', status: 'claimed', dependsOn: [], mergeTo: 'main' });
    const delta = {
      planningRunId: 'p2',
      mode: 'replan',
      authoredAt: '2026-07-23T00:00:00.000Z',
      ops: [{ type: 'removeNode', id: 'n1' }],
    };
    const r = validateDelta(delta, g, TRUNK, null);
    check('2. claimed removeNode rejected', r.accepted === false);
    check('2. rule is stale_target', !r.accepted && r.rejection.rule === 'stale_target');
    check('2. original graph unchanged', g.nodes.length === 1);
  }

  // 3. A delta creating a cycle → rejected with cyclic
  {
    const g = baseGraph();
    // n1 → n2 → n3, then updateNode n3 to depend on n1 (cycle).
    g.nodes.push(
      { id: 'n1', chainId: 'c1', status: 'pending', dependsOn: [], mergeTo: 'main' },
      { id: 'n2', chainId: 'c1', status: 'pending', dependsOn: ['n1'] },
      { id: 'n3', chainId: 'c1', status: 'pending', dependsOn: ['n2'] },
    );
    const delta = {
      planningRunId: 'p3',
      mode: 'replan',
      authoredAt: '2026-07-23T00:00:00.000Z',
      ops: [{ type: 'updateNode', id: 'n1', dependsOn: ['n3'] }],
    };
    const r = validateDelta(delta, g, TRUNK, null);
    check('3. cyclic delta rejected', r.accepted === false);
    check('3. rule is cyclic', !r.accepted && r.rejection.rule === 'cyclic');
    check('3. cycle path reported', !r.accepted && r.rejection.detail.includes('→'));
  }

  // 4. A chain final node without mergeTo → rejected with final_node_missing_mergeTo
  {
    const g = baseGraph();
    const delta = {
      planningRunId: 'p4',
      mode: 'expansion',
      authoredAt: '2026-07-23T00:00:00.000Z',
      ops: [
        { type: 'addNode', id: 'c1', chainId: 'ch1', skill: 's', prompt: 'p', dependsOn: [] },
        { type: 'addNode', id: 'c2', chainId: 'ch1', skill: 's', prompt: 'p', dependsOn: ['c1'] },
        // c2 is the final node but has no mergeTo
      ],
    };
    const r = validateDelta(delta, g, TRUNK, null);
    check('4. final-node-missing-mergeTo rejected', r.accepted === false);
    check('4. rule is final_node_missing_mergeTo', !r.accepted && r.rejection.rule === 'final_node_missing_mergeTo');
  }

  // 5. An empty delta → accepted
  {
    const g = baseGraph();
    const delta = {
      planningRunId: 'p5',
      mode: 'expansion',
      authoredAt: '2026-07-23T00:00:00.000Z',
      ops: [],
    };
    const r = validateDelta(delta, g, TRUNK, null);
    check('5. empty delta accepted', r.accepted === true);
    check('5. graph unchanged', r.accepted && r.graph.nodes.length === 0);
  }

  // 6. A cross-chain edge to a non-merge-point → rejected with cross_chain_not_merge_point
  {
    const g = baseGraph();
    // Chain c1: a1 (head, mergeTo main) → a2 (tail, mergeTo main)
    g.nodes.push(
      { id: 'a1', chainId: 'c1', status: 'pending', dependsOn: [], mergeTo: 'main' },
      { id: 'a2', chainId: 'c1', status: 'pending', dependsOn: ['a1'], mergeTo: 'main' },
      // Chain c2: b1 (head, NO mergeTo — not a merge point) → b2 (tail, mergeTo main)
      { id: 'b1', chainId: 'c2', status: 'pending', dependsOn: [] },
      { id: 'b2', chainId: 'c2', status: 'pending', dependsOn: ['b1'], mergeTo: 'main' },
    );
    // Planner adds a node in c3 depending on b1 (cross-chain, non-merge-point).
    const delta = {
      planningRunId: 'p6',
      mode: 'expansion',
      authoredAt: '2026-07-23T00:00:00.000Z',
      ops: [
        { type: 'addNode', id: 'x1', chainId: 'c3', skill: 's', prompt: 'p', dependsOn: ['b1'], mergeTo: 'main' },
      ],
    };
    const r = validateDelta(delta, g, TRUNK, null);
    check('6. cross-chain non-merge-point rejected', r.accepted === false);
    check('6. rule is cross_chain_not_merge_point', !r.accepted && r.rejection.rule === 'cross_chain_not_merge_point');
  }

  // 7. All-or-nothing: valid addNode followed by invalid removeNode → whole delta rejected, original unchanged
  {
    const g = baseGraph();
    g.nodes.push({ id: 'n1', chainId: 'c1', status: 'claimed', dependsOn: [], mergeTo: 'main' });
    const before = JSON.stringify(g);
    const delta = {
      planningRunId: 'p7',
      mode: 'expansion',
      authoredAt: '2026-07-23T00:00:00.000Z',
      ops: [
        // Valid addNode (fresh id, mergeTo main)
        { type: 'addNode', id: 'n2', chainId: 'c2', skill: 's', prompt: 'p', dependsOn: [], mergeTo: 'main' },
        // Invalid removeNode (n1 is claimed — frozen)
        { type: 'removeNode', id: 'n1' },
      ],
    };
    const r = validateDelta(delta, g, TRUNK, null);
    check('7. mixed delta rejected', r.accepted === false);
    check('7. rule is stale_target', !r.accepted && r.rejection.rule === 'stale_target');
    check('7. failing op index is 1', !r.accepted && r.rejection.opIndex === 1);
    check('7. original graph unchanged (all-or-nothing)', JSON.stringify(g) === before);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
