// Graph management: CRUD, DAG traversal, claim, chain/branch bookkeeping,
// ready-node evaluation, and depth-first bounded fairness.
//
// This module is the graph-algorithm core of the dispatcher. It operates on
// plain graph objects (as loaded by state.mjs's loadGraph) and returns new
// graph objects or derived data — it does NOT read or write files. The pass
// module (pass.mjs) calls these functions under the lock and handles
// journaling + persistence.
//
// Graph shape (from state.mjs):
//   {
//     runId: string|null,
//     generatedAt: string (ISO),
//     paused: boolean,
//     policy: { ... },
//     nodes: [
//       {
//         id: string,
//         chainId: string,
//         skill: string,
//         agent: string,
//         prompt: string,
//         deadline: string (ISO duration),
//         dependsOn: string[],   // node ids
//         mergeTo: string|null,  // trunkBranch if this is a merge point
//         metadata: object,
//         // machinery-derived fields (not planner-authored):
//         status: string,        // pending|claimed|parked|completed|failed|abandoned
//         attempts: number,
//         baseCommit: string|null,
//         sandboxId: string|null,
//         sessionName: string|null,
//         opencodeSessionId: string|null,
//         cmdId: string|null,
//         deadlineTs: string|null,  // ISO timestamp computed from deadline duration
//         lastOutcome: string|null,
//         lastOutcomeEvidence: string|null,
//         durations: number[],   // ms per attempt
//         diffSummary: string|null,
//         parkedQuestion: string|null,
//       }
//     ]
//   }
//
// References:
//   - graph-pipeline.md: Graph management rules (line 286), Reconcile pass
//     (line 520), Dispatcher (line 490), Depth-first traversal bounded (352)

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Status constants ───────────────────────────────────────────────────────

export const STATUS = Object.freeze({
  PENDING: 'pending',
  CLAIMED: 'claimed',
  PARKED: 'parked',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ABANDONED: 'abandoned',
});

// Statuses that count as "in-flight" — the node is actively running or parked
// waiting for a human answer. These are the statuses the poll step supervises.
const IN_FLIGHT_STATUSES = new Set([STATUS.CLAIMED, STATUS.PARKED]);

// Statuses that are terminal — no further state transitions except via
// replanning (which only touches unclaimed nodes anyway).
const TERMINAL_STATUSES = new Set([STATUS.COMPLETED, STATUS.FAILED, STATUS.ABANDONED]);

// ─── Node lookup ─────────────────────────────────────────────────────────────

/**
 * Find a node by id in the graph. Returns the node object or undefined.
 */
export function getNode(graph, nodeId) {
  return graph.nodes.find(n => n.id === nodeId);
}

/**
 * Find a node by id, throwing if it doesn't exist.
 */
export function requireNode(graph, nodeId) {
  const node = getNode(graph, nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  return node;
}

/**
 * Get all nodes in a chain (by chainId), in graph order.
 */
export function getChainNodes(graph, chainId) {
  return graph.nodes.filter(n => n.chainId === chainId);
}

/**
 * Get all distinct chainIds in the graph.
 */
export function getChainIds(graph) {
  const ids = new Set();
  for (const n of graph.nodes) ids.add(n.chainId);
  return [...ids];
}

// ─── Branch name derivation ──────────────────────────────────────────────────

/**
 * Derive the branch name for a chain: pipeline/<runId>/<chainId>.
 *
 * The branch name is machinery-derived from runId and chainId — the planner
 * never emits it. See graph-pipeline.md: Graph management rules.
 */
export function branchName(runId, chainId) {
  if (!runId) throw new Error('branchName: runId is required (bootstrap assigns it)');
  if (!chainId) throw new Error('branchName: chainId is required');
  return `pipeline/${runId}/${chainId}`;
}

// ─── Merge-point helpers ─────────────────────────────────────────────────────

/**
 * Is this node a merge point? A merge point carries mergeTo (the trunk branch).
 */
export function isMergePoint(node) {
  return Boolean(node && node.mergeTo);
}

/**
 * Get all merge-point nodes in the graph.
 */
export function getMergePoints(graph) {
  return graph.nodes.filter(isMergePoint);
}

// ─── Dependency / readiness evaluation ───────────────────────────────────────

/**
 * Get the direct dependents of a node (nodes that depend on it).
 */
export function getDependents(graph, nodeId) {
  return graph.nodes.filter(n => n.dependsOn && n.dependsOn.includes(nodeId));
}

/**
 * Get the direct dependencies of a node (nodes it depends on).
 */
export function getDependencies(graph, node) {
  if (!node.dependsOn || node.dependsOn.length === 0) return [];
  return node.dependsOn
    .map(id => getNode(graph, id))
    .filter(Boolean);
}

/**
 * Check if a node's dependencies are satisfied — i.e., the node is "ready."
 *
 * Readiness rules (from graph-pipeline.md lines 328-337, 549-551):
 * - The node must be in `pending` status (not claimed, parked, completed, etc.)
 * - For each dependency:
 *   - If the dependency is in the same chain (same chainId) and is NOT a
 *     merge point: the dependency must be `completed` and its branch pushed.
 *     (Same branch, same segment — the successor is ready when the predecessor
 *     pushed.)
 *   - If the dependency is a merge point (carries mergeTo): the dependency
 *     must be `completed` AND its merge must have landed. The merge is
 *     considered landed when the node's status is `completed` and no pending
 *     merge trigger exists for it (the pass checks merge state separately).
 *     For step 4, we treat a completed merge-point node as having its merge
 *     landed (the merge queue is step 5; for now, completed = ready for
 *     dependents).
 *   - Cross-chain dependencies (different chainId) must target merge-point
 *     nodes (validated at fold time). The same merge-point rule applies.
 *
 * @param {object} graph - the graph state
 * @param {object} node - the node to check
 * @returns {boolean} true if the node is ready to be claimed
 */
export function isNodeReady(graph, node) {
  if (node.status !== STATUS.PENDING) return false;

  if (!node.dependsOn || node.dependsOn.length === 0) {
    return true; // no dependencies — ready
  }

  for (const depId of node.dependsOn) {
    const dep = getNode(graph, depId);
    if (!dep) return false; // dependency doesn't exist — not ready

    if (dep.status !== STATUS.COMPLETED) return false;

    // If the dependency is a merge point, the merge must have landed.
    // In step 4 (no merge queue yet), we treat completed merge-point nodes
    // as having their merge landed. Step 5 will add the merge-landed check.
    // (The merge queue is built in step 5; for now, completed = merged.)
  }

  return true;
}

/**
 * Get all ready nodes in the graph (pending nodes whose dependencies are
 * satisfied).
 */
export function getReadyNodes(graph) {
  return graph.nodes.filter(n => isNodeReady(graph, n));
}

/**
 * Count in-flight sandboxes (claimed + parked nodes — each has a sandbox).
 *
 * The pass uses this to enforce maxConcurrentSandboxes at claim time.
 * Parked nodes' sandboxes are stopped but still count against the cap
 * (they will be resumed, not recreated). Actually — parked sandboxes are
 * stopped, so they don't consume Daytona quota. But the plan says "the merge
 * sandbox counts against the cap" and parked nodes are "finishing claimed
 * work." For step 4 (no merge queue), we count claimed nodes only. Parked
 * nodes' sandboxes are stopped and don't count.
 *
 * Actually, re-reading the plan: "maxConcurrentSandboxes" is the cap on
 * live sandboxes. Parked sandboxes are stopped (not live). So we count
 * claimed nodes only. The merge sandbox (step 5) counts too, but that's
 * not built yet.
 */
export function countInFlightSandboxes(graph) {
  return graph.nodes.filter(n => n.status === STATUS.CLAIMED).length;
}

/**
 * Check if capacity is available for a new claim.
 */
export function hasCapacity(graph, maxConcurrent) {
  return countInFlightSandboxes(graph) < maxConcurrent;
}

// ─── Depth-first bounded fairness ────────────────────────────────────────────

/**
 * Select the next node to claim using depth-first traversal with the fairness
 * bound.
 *
 * Depth-first is the default: descend into a node's dependents before
 * starting unrelated siblings. But unbounded depth-first starves: a chain
 * that keeps producing ready successors can fill the pool indefinitely while
 * an independent ready node waits.
 *
 * The fairness counter caps consecutive chain-following claims: after a node
 * completes, the pass claims its dependents by default and increments the
 * counter; when the counter reaches fairnessBudget and an independent ready
 * node exists, the pass claims the independent node instead and resets the
 * counter. When no independent node is ready, the counter increments but the
 * yield never triggers — behavior is identical to pure depth-first.
 *
 * The counter is per-pool, not per-chain; it resets on a yield.
 *
 * (From graph-pipeline.md lines 352-371)
 *
 * @param {object} graph - the graph state
 * @param {object} opts
 * @param {number} opts.fairnessBudget - max consecutive chain-following claims
 *   before yielding to an independent node
 * @param {number} opts.fairnessCounter - the current counter value (maintained
 *   by the pass across claims within a single pass)
 * @param {string|null} [opts.lastCompletedNodeId] - the node that just
 *   completed (for depth-first descent). Null if no node just completed
 *   (e.g., the pass is claiming from scratch).
 * @param {number} [opts.maxConcurrent] - max concurrent sandboxes
 * @returns {{ node: object|null, fairnessCounter: number, yielded: boolean }}
 *   the selected node (or null if none ready / no capacity), the updated
 *   counter, and whether a fairness yield occurred
 */
export function selectNextClaim(graph, opts) {
  const { fairnessBudget, fairnessCounter, lastCompletedNodeId, maxConcurrent } = opts;

  // Check capacity first.
  if (!hasCapacity(graph, maxConcurrent)) {
    return { node: null, fairnessCounter, yielded: false };
  }

  const readyNodes = getReadyNodes(graph);
  if (readyNodes.length === 0) {
    return { node: null, fairnessCounter, yielded: false };
  }

  // Try depth-first: if a node just completed, try to claim its dependents.
  if (lastCompletedNodeId) {
    const dependents = getDependents(graph, lastCompletedNodeId)
      .filter(n => isNodeReady(graph, n));

    if (dependents.length > 0) {
      // Check fairness: if counter reached budget and an independent node
      // exists, yield to the independent node.
      if (fairnessCounter >= fairnessBudget) {
        const independent = findIndependentReadyNode(graph, lastCompletedNodeId, readyNodes);
        if (independent) {
          return { node: independent, fairnessCounter: 0, yielded: true };
        }
      }

      // Claim the first dependent (depth-first).
      return { node: dependents[0], fairnessCounter: fairnessCounter + 1, yielded: false };
    }
  }

  // No depth-first descent (no lastCompleted, or no ready dependents).
  // Fall back to any ready node. If we're at the fairness budget and there
  // are multiple ready nodes, prefer an independent one.
  if (readyNodes.length > 1 && fairnessCounter >= fairnessBudget) {
    if (lastCompletedNodeId) {
      const independent = findIndependentReadyNode(graph, lastCompletedNodeId, readyNodes);
      if (independent) {
        return { node: independent, fairnessCounter: 0, yielded: true };
      }
    }
  }

  // Default: claim the first ready node, reset counter (new chain start).
  return { node: readyNodes[0], fairnessCounter: 0, yielded: false };
}

/**
 * Find a ready node that is NOT a dependent of the lastCompletedNodeId
 * (i.e., from a different chain or an independent root).
 */
function findIndependentReadyNode(graph, lastCompletedNodeId, readyNodes) {
  const dependents = new Set(getDependents(graph, lastCompletedNodeId).map(n => n.id));
  return readyNodes.find(n => !dependents.has(n.id)) || null;
}

// ─── Claim ───────────────────────────────────────────────────────────────────

/**
 * Claim a node for execution.
 *
 * This is the commit-point mutation: the node's status changes from pending
 * to claimed, its spec is frozen, and its attempt count increments. The pass
 * journals the claim event (the actual commit point) and then provisions a
 * sandbox and starts the session.
 *
 * This function returns the claim event and the mutated graph; the pass
 * handles journaling + persistence. The claim event is what gets journaled.
 *
 * @param {object} graph - the graph state (will be mutated in-place)
 * @param {string} nodeId - the node to claim
 * @param {object} opts
 * @param {string} opts.runId - the pipeline run identifier
 * @param {string} opts.baseCommit - the git commit to base the claim on
 * @param {string} opts.sandboxId - the Daytona sandbox ID
 * @param {string} opts.sessionName - the Daytona session name
 * @param {string} opts.opencodeSessionId - the opencode session ID (may be null
 *   at claim time — captured by the background poller)
 * @param {string} opts.cmdId - the Daytona command ID
 * @param {string} opts.deadlineTs - the ISO timestamp deadline
 * @returns {{ graph: object, event: object }} the mutated graph and the claim
 *   journal event
 */
export function claimNode(graph, nodeId, opts) {
  const node = requireNode(graph, nodeId);
  if (node.status !== STATUS.PENDING) {
    throw new Error(`Cannot claim node ${nodeId}: status is ${node.status}, not pending`);
  }

  // Mutate the node in-place (the pass saves the graph after journaling).
  node.status = STATUS.CLAIMED;
  node.attempts = (node.attempts || 0) + 1;
  node.baseCommit = opts.baseCommit || null;
  node.sandboxId = opts.sandboxId || null;
  node.sessionName = opts.sessionName || null;
  node.opencodeSessionId = opts.opencodeSessionId || null;
  node.cmdId = opts.cmdId || null;
  node.deadlineTs = opts.deadlineTs || null;

  const event = {
    type: 'claim',
    nodeId,
    chainId: node.chainId,
    runId: opts.runId,
    at: new Date().toISOString(),
    attempt: node.attempts,
    baseCommit: node.baseCommit,
    sandboxId: node.sandboxId,
    sessionName: node.sessionName,
    cmdId: node.cmdId,
    deadline: node.deadlineTs,
  };

  return { graph, event };
}

// ─── Outcome folding ─────────────────────────────────────────────────────────

/**
 * Fold a completed node outcome into the graph.
 *
 * Sets the node's status to completed, records the outcome evidence, and
 * updates the per-node digest fields. The pass journals the outcome event
 * (the commit point) and then calls this to mutate the graph.
 *
 * For a merge-point node (carries mergeTo), the pass also triggers the merge
 * queue (step 5). For step 4, we just mark it completed — dependents become
 * ready when isNodeReady checks the completed status.
 *
 * @param {object} graph - the graph state (mutated in-place)
 * @param {string} nodeId - the node that completed
 * @param {object} opts
 * @param {string} opts.outcome - COMPLETE | QUESTION | FAILED | UNKNOWN
 * @param {string} opts.evidence - classification evidence
 * @param {number} opts.durationMs - how long the attempt took
 * @param {string} opts.diffSummary - commits-added + diffstat summary
 * @param {boolean} opts.classificationFallback - whether LLM was used
 * @returns {{ graph: object, event: object, triggersMerge: boolean }}
 */
export function foldOutcome(graph, nodeId, opts) {
  const node = requireNode(graph, nodeId);
  const { outcome, evidence, durationMs, diffSummary, classificationFallback } = opts;

  const at = new Date().toISOString();

  // Record duration.
  if (!node.durations) node.durations = [];
  node.durations.push(durationMs || 0);

  node.lastOutcome = outcome;
  node.lastOutcomeEvidence = evidence;
  node.diffSummary = diffSummary || null;

  // Clear in-flight fields.
  node.sandboxId = null;
  node.sessionName = null;
  node.cmdId = null;
  node.deadlineTs = null;

  let triggersMerge = false;

  if (outcome === 'COMPLETE') {
    node.status = STATUS.COMPLETED;
  } else if (outcome === 'FAILED' || outcome === 'UNKNOWN') {
    node.status = STATUS.FAILED;
  } else if (outcome === 'QUESTION') {
    // Park — the pass calls parkNode separately, but if the outcome is
    // QUESTION, we set parked status here too. The pass handles the
    // sandbox stop + question-form workflow.
    node.status = STATUS.PARKED;
  }

  // A completed merge-point node triggers the merge queue.
  if (node.status === STATUS.COMPLETED && isMergePoint(node)) {
    triggersMerge = true;
  }

  const event = {
    type: 'outcome',
    nodeId,
    chainId: node.chainId,
    at,
    outcome,
    evidence,
    classificationFallback: classificationFallback || false,
    durationMs: durationMs || 0,
    diffSummary: diffSummary || null,
    attempt: node.attempts,
  };

  return { graph, event, triggersMerge };
}

/**
 * Park a node with a QUESTION.
 *
 * Sets the node's status to parked, records the question text, and stores
 * the sandbox/session IDs for resume. The pass journals the park event and
 * handles the sandbox stop + question-form workflow.
 *
 * @param {object} graph - the graph state (mutated in-place)
 * @param {string} nodeId - the node to park
 * @param {object} opts
 * @param {string} opts.question - the question text
 * @param {string} opts.sandboxId - the sandbox ID (stopped, not destroyed)
 * @param {string} opts.sessionName - the Daytona session name
 * @param {string} opts.opencodeSessionId - the opencode session ID for resume
 * @returns {{ graph: object, event: object }}
 */
export function parkNode(graph, nodeId, opts) {
  const node = requireNode(graph, nodeId);
  node.status = STATUS.PARKED;
  node.parkedQuestion = opts.question;
  node.sandboxId = opts.sandboxId;
  node.sessionName = opts.sessionName;
  node.opencodeSessionId = opts.opencodeSessionId;

  const event = {
    type: 'park',
    nodeId,
    chainId: node.chainId,
    at: new Date().toISOString(),
    status: 'parked',
    question: opts.question,
    sandboxId: opts.sandboxId,
    sessionName: opts.sessionName,
    opencodeSessionId: opts.opencodeSessionId,
  };

  return { graph, event };
}

/**
 * Resume a parked node (the human answered the question).
 *
 * Sets the node back to claimed and clears the parked question. The pass
 * journals the resume event, starts the sandbox, and issues the resume command.
 *
 * @param {object} graph - the graph state (mutated in-place)
 * @param {string} nodeId - the node to resume
 * @param {object} opts
 * @param {string} opts.cmdId - the new command ID for the resumed session
 * @param {string} opts.deadlineTs - the new deadline
 * @returns {{ graph: object, event: object }}
 */
export function resumeNode(graph, nodeId, opts) {
  const node = requireNode(graph, nodeId);
  if (node.status !== STATUS.PARKED) {
    throw new Error(`Cannot resume node ${nodeId}: status is ${node.status}, not parked`);
  }

  node.status = STATUS.CLAIMED;
  node.parkedQuestion = null;
  node.cmdId = opts.cmdId;
  node.deadlineTs = opts.deadlineTs;

  const event = {
    type: 'resume',
    nodeId,
    chainId: node.chainId,
    at: new Date().toISOString(),
    sessionName: node.sessionName,
    opencodeSessionId: node.opencodeSessionId,
    cmdId: opts.cmdId,
  };

  return { graph, event };
}

/**
 * Mark a node as failed (e.g., from a runner_error / timeout).
 *
 * @param {object} graph - the graph state (mutated in-place)
 * @param {string} nodeId - the node that failed
 * @param {object} opts
 * @param {string} opts.errorType - timeout | non_zero_exit | api_failure
 * @param {string} opts.message - error detail
 * @returns {{ graph: object, event: object }}
 */
export function failNode(graph, nodeId, opts) {
  const node = requireNode(graph, nodeId);
  node.status = STATUS.FAILED;
  node.lastOutcome = 'FAILED';
  node.lastOutcomeEvidence = opts.message || '';
  node.sandboxId = null;
  node.sessionName = null;
  node.cmdId = null;
  node.deadlineTs = null;

  const event = {
    type: 'runner_error',
    nodeId,
    chainId: node.chainId,
    at: new Date().toISOString(),
    errorType: opts.errorType,
    message: opts.message || '',
  };

  return { graph, event };
}

// ─── Bootstrap (runId assignment) ────────────────────────────────────────────

/**
 * Generate a short runId (timestamp-prefixed random string).
 *
 * Format: YYYYMMDD-XXXX (e.g. 20260723-a4f2). Readable in branch names and
 * logs. See graph-pipeline.md: Bootstrap (line 597).
 */
export function generateRunId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(16).slice(2, 6);
  return `${dateStr}-${random}`;
}

/**
 * Assign a runId to the graph (bootstrap).
 *
 * This is the machinery's self-assignment — runId is not a node, not a chain,
 * and not graph content the planner authors. The first pass that needs a
 * runId assigns one. See graph-pipeline.md: Bootstrap (line 597).
 *
 * @param {object} graph - the graph state (mutated in-place)
 * @returns {{ graph: object, event: object, runId: string }}
 */
export function assignRunId(graph) {
  if (graph.runId) {
    // Already assigned — idempotent.
    return { graph, event: null, runId: graph.runId };
  }

  const runId = generateRunId();
  graph.runId = runId;

  const event = {
    type: 'runId_assigned',
    at: new Date().toISOString(),
    runId,
  };

  return { graph, event, runId };
}

// ─── Plan-2-ahead policy ─────────────────────────────────────────────────────

/**
 * Check if the ready-node frontier is running low, triggering a planning run.
 *
 * The plan-2-ahead policy: trigger a planning run when ready nodes run low.
 * "Low" means fewer ready nodes than maxConcurrentSandboxes (the pool can't
 * fill), OR fewer ready nodes than 2 (keep at least 2 in the pipeline for
 * depth-first traversal to have choices).
 *
 * The pass also checks that no planning run is in flight (planning lock
 * acquirable) and that the pipeline is not paused before triggering.
 *
 * (From graph-pipeline.md lines 580-583, 908-916)
 *
 * @param {object} graph - the graph state
 * @param {number} maxConcurrent - maxConcurrentSandboxes from policy
 * @returns {boolean} true if the frontier is low
 */
export function isFrontierLow(graph, maxConcurrent) {
  const readyCount = getReadyNodes(graph).length;
  // Trigger when we have fewer ready nodes than the pool can hold, or
  // fewer than 2 (the minimum for depth-first to have choices).
  return readyCount < Math.min(maxConcurrent, 2);
}

// ─── Inbox request helpers ────────────────────────────────────────────────────

/**
 * Build a pause/resume/replan inbox request filename.
 *
 * Inbox files are written by the pipeline control helper (pipeline3/bin/pipeline.mjs)
 * and by n8n's small workflows. The filename is timestamp-prefixed for
 * ordering, with a type suffix.
 */
export function inboxRequestName(type) {
  const ts = Date.now();
  return `${ts}-${type}.json`;
}

// ─── Trunk SHA capture ───────────────────────────────────────────────────────

/**
 * Capture the current trunk branch SHA from git.
 *
 * Used by the planning wrapper (to record trunkShaAtT0) and by the pass
 * (to check semantic staleness at fold time). The wrapper does
 * `git fetch origin <trunkBranch>` before calling this, to minimize the
 * T0→T1 staleness window.
 *
 * @param {string} trunkBranch - the trunk branch name (e.g. "main")
 * @param {string} [cwd] - the git working directory (defaults to repo root)
 * @returns {string|null} the SHA, or null if git fails
 */
export function captureTrunkSha(trunkBranch, cwd) {
  try {
    const moduleDir = fileURLToPath(new URL('.', import.meta.url));
    const repoRoot = join(moduleDir, '../..');
    const sha = execSync(
      `git rev-parse origin/${trunkBranch}`,
      { cwd: cwd || repoRoot, encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
    return sha || null;
  } catch {
    return null;
  }
}

// ─── Per-node digest (for graph.json) ────────────────────────────────────────

/**
 * Build a per-node digest for graph.json.
 *
 * The digest gives routine readers (the planner, the viewer, sprint status)
 * the convenience of reading one file without parsing the journal. It carries
 * attempt count, last outcome, durations, diff summary, parked question, base
 * commit, and metadata.
 *
 * (From graph-pipeline.md lines 1387-1399)
 */
export function buildNodeDigest(node) {
  return {
    id: node.id,
    chainId: node.chainId,
    skill: node.skill,
    agent: node.agent,
    status: node.status,
    attempts: node.attempts || 0,
    dependsOn: node.dependsOn || [],
    mergeTo: node.mergeTo || null,
    deadline: node.deadline || null,
    lastOutcome: node.lastOutcome || null,
    lastOutcomeEvidence: node.lastOutcomeEvidence || null,
    durations: node.durations || [],
    diffSummary: node.diffSummary || null,
    parkedQuestion: node.parkedQuestion || null,
    baseCommit: node.baseCommit || null,
    metadata: node.metadata || {},
  };
}

/**
 * Build the full graph.json digest (all nodes as digests + top-level fields).
 *
 * Called by saveGraph or the pass to regenerate graph.json with per-node
 * digests.
 */
export function buildGraphDigest(graph) {
  return {
    runId: graph.runId,
    generatedAt: new Date().toISOString(),
    paused: graph.paused,
    policy: graph.policy || {},
    nodes: graph.nodes.map(buildNodeDigest),
  };
}

// ─── Self-test ───────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  let tests = 0, failures = 0;
  function assert(name, cond) {
    tests++;
    if (cond) { console.log(`  \u2713 ${name}`); }
    else { failures++; console.error(`  \u2717 ${name}`); }
  }

  console.log('\ngraph.mjs self-test');

  // --- Branch name ---
  console.log('\nbranch name derivation');
  assert('branchName produces pipeline/run/chain', branchName('r1', 'c1') === 'pipeline/r1/c1');

  // --- Merge point ---
  console.log('\nmerge point detection');
  const mpNode = { id: 'n1', mergeTo: 'main' };
  const plainNode = { id: 'n2', mergeTo: null };
  assert('isMergePoint true for mergeTo node', isMergePoint(mpNode));
  assert('isMergePoint false for plain node', !isMergePoint(plainNode));

  // --- Readiness ---
  console.log('\nreadiness evaluation');
  const graph = {
    runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [
      { id: 'n1', chainId: 'c1', status: 'pending', dependsOn: [] },
      { id: 'n2', chainId: 'c1', status: 'pending', dependsOn: ['n1'] },
      { id: 'n3', chainId: 'c2', status: 'pending', dependsOn: [] },
    ]
  };
  assert('n1 is ready (no deps)', isNodeReady(graph, graph.nodes[0]));
  assert('n2 is NOT ready (dep n1 pending)', !isNodeReady(graph, graph.nodes[1]));
  assert('n3 is ready (no deps, different chain)', isNodeReady(graph, graph.nodes[2]));
  assert('2 ready nodes', getReadyNodes(graph).length === 2);

  // --- Claim ---
  console.log('\nclaim');
  const { graph: g2, event: claimEv } = claimNode(graph, 'n1', {
    runId: 'r1', baseCommit: 'abc123', sandboxId: 'sb1',
    sessionName: 'sess1', deadlineTs: '2026-07-23T12:00:00Z',
  });
  assert('n1 status is claimed', graph.nodes[0].status === STATUS.CLAIMED);
  assert('n1 attempts is 1', graph.nodes[0].attempts === 1);
  assert('claim event type', claimEv.type === 'claim');
  assert('claim event nodeId', claimEv.nodeId === 'n1');
  assert('n2 is NOT ready (dep n1 claimed, not completed)', !isNodeReady(graph, graph.nodes[1]));

  // --- Outcome folding ---
  console.log('\noutcome folding');
  const { graph: g3, event: outEv, triggersMerge } = foldOutcome(graph, 'n1', {
    outcome: 'COMPLETE', evidence: 'step_finish', durationMs: 5000, diffSummary: '+10 -2',
  });
  assert('n1 status is completed', graph.nodes[0].status === STATUS.COMPLETED);
  assert('n2 is NOW ready (dep n1 completed)', isNodeReady(graph, graph.nodes[1]));
  assert('outcome event type', outEv.type === 'outcome');
  assert('no merge trigger for non-merge-point', !triggersMerge);

  // --- Merge-point completion ---
  console.log('\nmerge-point completion');
  const mpGraph = {
    runId: 'r1', nodes: [
      { id: 'mp1', chainId: 'c1', status: 'claimed', mergeTo: 'main', attempts: 1, dependsOn: [] },
    ]
  };
  const { triggersMerge: tm2 } = foldOutcome(mpGraph, 'mp1', {
    outcome: 'COMPLETE', evidence: 'done', durationMs: 1000,
  });
  assert('merge trigger for completed merge-point', tm2);

  // --- Depth-first selection ---
  console.log('\ndepth-first selection');
  const dfGraph = {
    runId: 'r1', nodes: [
      { id: 'a', chainId: 'ca', status: 'completed', dependsOn: [] },
      { id: 'b', chainId: 'ca', status: 'pending', dependsOn: ['a'] },
      { id: 'c', chainId: 'cb', status: 'pending', dependsOn: [] },
    ]
  };
  const sel1 = selectNextClaim(dfGraph, {
    fairnessBudget: 3, fairnessCounter: 0, lastCompletedNodeId: 'a', maxConcurrent: 5,
  });
  assert('depth-first selects dependent b', sel1.node && sel1.node.id === 'b');
  assert('counter incremented', sel1.fairnessCounter === 1);

  // Fairness yield
  const sel2 = selectNextClaim(dfGraph, {
    fairnessBudget: 1, fairnessCounter: 1, lastCompletedNodeId: 'a', maxConcurrent: 5,
  });
  assert('fairness yields to independent c', sel2.node && sel2.node.id === 'c');
  assert('counter reset on yield', sel2.fairnessCounter === 0);
  assert('yielded flag set', sel2.yielded);

  // No capacity
  const fullGraph = {
    runId: 'r1', nodes: [
      { id: 'x', chainId: 'cx', status: 'claimed', dependsOn: [] },
      { id: 'y', chainId: 'cy', status: 'pending', dependsOn: [] },
    ]
  };
  const sel3 = selectNextClaim(fullGraph, {
    fairnessBudget: 3, fairnessCounter: 0, maxConcurrent: 1,
  });
  assert('no claim when capacity full', sel3.node === null);

  // --- Bootstrap ---
  console.log('\nbootstrap (runId assignment)');
  const emptyGraph = { runId: null, paused: true, nodes: [] };
  const { runId, event: bootEv } = assignRunId(emptyGraph);
  assert('runId assigned', runId && runId.length > 0);
  assert('runId in graph', emptyGraph.runId === runId);
  assert('bootstrap event type', bootEv && bootEv.type === 'runId_assigned');
  // Idempotent
  const { runId: runId2, event: bootEv2 } = assignRunId(emptyGraph);
  assert('runId assignment idempotent', runId === runId2);
  assert('no second event', bootEv2 === null);

  // --- Frontier low ---
  console.log('\nplan-2-ahead frontier');
  assert('frontier low with 0 ready', isFrontierLow({ nodes: [] }, 3));
  assert('frontier low with 1 ready', isFrontierLow({
    nodes: [{ id: 'n', status: 'pending', dependsOn: [] }]
  }, 3));
  assert('frontier NOT low with 3 ready', !isFrontierLow({
    nodes: [
      { id: 'a', status: 'pending', dependsOn: [] },
      { id: 'b', status: 'pending', dependsOn: [] },
      { id: 'c', status: 'pending', dependsOn: [] },
    ]
  }, 3));

  // --- Park/resume ---
  console.log('\npark/resume');
  const prGraph = {
    runId: 'r1', nodes: [
      { id: 'p1', chainId: 'c1', status: 'claimed', attempts: 1, dependsOn: [] },
    ]
  };
  const { event: parkEv } = parkNode(prGraph, 'p1', {
    question: 'Which approach?', sandboxId: 'sb1', sessionName: 's1', opencodeSessionId: 'os1',
  });
  assert('p1 status is parked', prGraph.nodes[0].status === STATUS.PARKED);
  assert('parked question stored', prGraph.nodes[0].parkedQuestion === 'Which approach?');
  assert('park event type', parkEv.type === 'park');

  const { event: resumeEv } = resumeNode(prGraph, 'p1', {
    cmdId: 'cmd2', deadlineTs: '2026-07-23T14:00:00Z',
  });
  assert('p1 status is claimed again', prGraph.nodes[0].status === STATUS.CLAIMED);
  assert('parked question cleared', prGraph.nodes[0].parkedQuestion === null);
  assert('resume event type', resumeEv.type === 'resume');

  // --- Node digest ---
  console.log('\nnode digest');
  const digest = buildNodeDigest({
    id: 'd1', chainId: 'c1', skill: 'bmad-dev-story', agent: 'coder',
    status: 'completed', attempts: 2, dependsOn: ['p1'], mergeTo: 'main',
    deadline: 'PT2H', lastOutcome: 'COMPLETE', durations: [1000, 2000],
    metadata: { story: 'S1' },
  });
  assert('digest has id', digest.id === 'd1');
  assert('digest has status', digest.status === 'completed');
  assert('digest has attempts', digest.attempts === 2);
  assert('digest has metadata', digest.metadata.story === 'S1');

  console.log(`\n${tests - failures}/${tests} passed`);
  if (failures > 0) {
    console.error('\u2717 self-test FAILED');
    process.exit(1);
  } else {
    console.log('\u2705 self-test passed');
  }
}
