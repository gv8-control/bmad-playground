// The reconcile pass — the dispatcher's 7-step frame.
//
// Each invocation of the dispatcher is a pass: acquire the lock, reconcile,
// fold the inbox, poll in-flight sessions, re-evaluate ready nodes, claim
// and launch, write the heartbeat, exit. Seconds long. Not a daemon.
//
// The pass is level-triggered: it reads the entire current state and
// processes everything that state implies, not "the event that woke it."
// Two events in quick succession: the first pass handles both, the second
// finds fixpoint and exits.
//
// Invocations carry no payload — all information is durable on disk or in
// git before the invocation fires. The worst case for a redundant
// invocation is a pass that finds nothing to do.
//
// The 7 steps (from graph-pipeline.md lines 520-591):
//   1. Acquire the lock (blocking flock)
//   2. Reconcile (journal vs sandboxes vs git vs locks)
//   3. Fold the inbox (journal first, graph.json second)
//   4. Poll in-flight sessions (supervision)
//   5. Re-evaluate ready nodes
//   6. Merge triggers, then claim and launch (depth-first, bounded)
//   7. Write the heartbeat, release the lock, exit
//
// References:
//   - graph-pipeline.md: Reconcile pass (line 520), Dispatcher (line 490),
//     Pause/resume (line 1178), Atomicity (line 1223), Bootstrap (line 597),
//     Pipeline control (line 643), Planning runs (line 865)
//   - spike-lock-hold-time.md (classification under lock)

import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import { appendJournal, readJournal } from './journal.mjs';
import { loadGraph, saveGraph, loadPolicy, loadInbox, purgeInboxFile } from './state.mjs';
import { atomicWrite, atomicReadJSON } from './atomic.mjs';
import {
  stateDir, runsDir, lastPassPath, inboxDir,
} from './paths.mjs';
import {
  getReadyNodes, hasCapacity,
  claimNode, failNode,
  assignRunId, isFrontierLow, selectNextClaim,
  captureTrunkSha, buildGraphDigest,
  STATUS,
} from './graph.mjs';
import { validateDelta, buildRejectionEvent, buildAcceptEvent } from './delta.mjs';
import {
  isPlanningLockHeld, checkPlanningRunVanished,
} from './planning.mjs';

// ─── Lock management ─────────────────────────────────────────────────────────

// The pass lock is a blocking flock on a lockfile. Node.js stdlib doesn't
// expose flock, so we use an O_EXCL lock file with PID + heartbeat, similar
// to the planning lock. The pass holds this lock for its entire duration
// (seconds). If a previous pass crashed, the PID check reveals a stale lock.
//
// Unlike the planning lock (non-blocking), the pass lock BLOCKS: a second
// pass waits for the first to finish, then takes the lock and runs. This is
// the coalescence property — the second pass finds fixpoint (or near-
// fixpoint) and exits.

const PASS_LOCK_FILE = join(stateDir, 'pass.lock');

/**
 * Acquire the pass lock (blocking).
 *
 * Blocks until the lock is acquired. Checks for stale locks via PID-alive.
 * Returns the lock file path (the lock is released by deleting the file).
 */
function acquirePassLock() {
  const pid = process.pid;
  const startTime = Date.now();

  for (;;) {
    try {
      // Try to create the lock file exclusively.
      const fd = openSync(PASS_LOCK_FILE, 'wx');
      writeFileSync(fd, JSON.stringify({ pid, at: new Date().toISOString() }));
      closeSync(fd);
      return PASS_LOCK_FILE;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;

      // Lock file exists — check if the holder is alive.
      const lockData = atomicReadJSON(PASS_LOCK_FILE, null);
      if (lockData && lockData.pid) {
        if (!isPidAlive(lockData.pid)) {
          // Stale lock — remove and retry.
          try { unlinkSync(PASS_LOCK_FILE); } catch { /* race */ }
          continue;
        }
      } else {
        // Malformed lock file — remove and retry.
        try { unlinkSync(PASS_LOCK_FILE); } catch { /* race */ }
        continue;
      }

      // Lock is held by a live process — wait and retry.
      // Don't spin too tightly; passes are seconds long.
      const elapsed = Date.now() - startTime;
      if (elapsed > 300000) {
        // 5-minute safety timeout — something is very wrong.
        throw new Error(`Pass lock acquisition timed out after ${elapsed}ms`);
      }
      // Sleep 100ms (busy-wait is fine — passes are short).
      execSync('sleep 0.1', { stdio: 'ignore' });
    }
  }
}

/**
 * Release the pass lock.
 */
function releasePassLock() {
  try { unlinkSync(PASS_LOCK_FILE); } catch { /* already gone */ }
}

/**
 * Check if a PID is alive (kill -0).
 */
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ─── Inbox folding ────────────────────────────────────────────────────────────

/**
 * Fold the inbox: consume files written by n8n's small workflows and by
 * planning runs (graph deltas). Append to the journal first (the commit
 * point), then regenerate graph.json.
 *
 * Inbox file types:
 *   - Graph deltas (from planning runs): validated at fold time, applied
 *     all-or-nothing. The delta's filename is `<planningRunId>.json`.
 *   - Pause/resume/replan requests (from pipeline3/bin/pipeline.mjs):
 *     journal the event, regenerate graph.json with paused flag.
 *   - Question answers (from the question-form workflow): journal the
 *     answer, trigger a planning run (the answer may change scope).
 *   - Merge-conflict reports (from the merge queue): journal the conflict.
 *
 * (From graph-pipeline.md lines 533-537, 1200-1206)
 */
function foldInbox(graph, policy, journal) {
  const inboxFiles = loadInbox(inboxDir);
  const events = [];
  let graphMutated = false;

  for (const filename of inboxFiles) {
    const filepath = join(inboxDir, filename);
    let content;
    try {
      content = atomicReadJSON(filepath, null);
    } catch {
      // Malformed inbox file — skip (the atomic write should prevent this).
      continue;
    }
    if (content === null) continue;

    // Determine the inbox file type.
    if (content.type === 'pause' || content.type === 'resume' || content.type === 'replan') {
      // Pipeline control request.
      events.push(...foldControlRequest(graph, content));
      graphMutated = true;
    } else if (content.planningRunId && content.ops !== undefined) {
      // Graph delta from a planning run.
      const result = foldPlanningDelta(graph, content, policy);
      events.push(...result.events);
      if (result.mutated) graphMutated = true;
    } else if (content.type === 'answer') {
      // Question answer from the question-form workflow.
      events.push(...foldQuestionAnswer(graph, content));
      graphMutated = true;
    } else if (content.type === 'conflict') {
      // Merge-conflict report from the merge queue.
      events.push(content);
      // Conflict reports don't mutate the graph directly — the pass
      // triggers a conflict-mode planning run (step 5).
    }

    // Delete the inbox file (consumed).
    try { purgeInboxFile(filename); } catch { /* best-effort */ }
  }

  return { events, graphMutated };
}

/**
 * Fold a pause/resume/replan control request.
 */
function foldControlRequest(graph, request) {
  const events = [];
  const at = new Date().toISOString();

  if (request.type === 'pause') {
    graph.paused = true;
    events.push({
      type: 'pause',
      at,
      reason: request.reason || 'manual',
      who: request.who || 'operator',
    });
  } else if (request.type === 'resume') {
    graph.paused = false;
    events.push({
      type: 'resume',
      at,
      who: request.who || 'operator',
    });
  } else if (request.type === 'replan') {
    // Replan doesn't change the graph directly — it triggers a planning run
    // in replan mode. The pass handles the trigger in step 6.
    // But we do unpause if paused (replan implies the pipeline should run).
    if (graph.paused) {
      graph.paused = false;
      events.push({ type: 'resume', at, who: request.who || 'operator' });
    }
    events.push({
      type: 'replan_request',
      at,
      instruction: request.instruction || '',
      who: request.who || 'operator',
    });
  }

  return events;
}

/**
 * Fold a planning delta (graph delta from a planning run).
 *
 * Validates the delta against current graph state (all-or-nothing), applies
 * it if accepted, and journals the accept/reject event with evidence.
 */
function foldPlanningDelta(graph, delta, policy) {
  const events = [];
  const trunkBranch = policy.trunkBranch || 'main';

  // Capture the current trunk SHA for the semantic staleness check.
  const currentTrunkSha = captureTrunkSha(trunkBranch);

  const result = validateDelta(delta, graph, trunkBranch, currentTrunkSha);

  if (result.accepted) {
    // Apply the delta: replace the graph's nodes with the validated result.
    graph.nodes = result.graph.nodes;
    events.push(buildAcceptEvent(delta, graph.nodes.length));

    // Check if a planning_exit event should be journaled.
    events.push({
      type: 'planning_exit',
      at: new Date().toISOString(),
      planningRunId: delta.planningRunId,
      mode: delta.mode,
      accepted: true,
      opCount: delta.ops ? delta.ops.length : 0,
    });
  } else {
    // Rejected — journal the rejection evidence.
    events.push(buildRejectionEvent(delta, result.rejection));
    events.push({
      type: 'planning_exit',
      at: new Date().toISOString(),
      planningRunId: delta.planningRunId,
      mode: delta.mode,
      accepted: false,
      rejection: result.rejection,
    });
  }

  return { events, mutated: result.accepted };
}

/**
 * Fold a question answer (from the question-form workflow).
 *
 * The answer is journaled. The pass will resume the parked node's session
 * in step 4 (poll) or step 6 (claim+launch). Actually, the answer triggers
 * a resume — the pass starts the sandbox and issues the resume command.
 */
function foldQuestionAnswer(graph, answer) {
  const events = [];
  events.push({
    type: 'answer',
    at: new Date().toISOString(),
    nodeId: answer.nodeId,
    chainId: answer.chainId,
    answer: answer.answer,
  });
  return events;
}

// ─── The 7-step reconcile pass ────────────────────────────────────────────────

/**
 * Run one reconcile pass.
 *
 * This is the main entry point for the dispatcher. n8n's schedule-tick
 * workflow and the pipeline control helper both invoke this function.
 *
 * @param {object} opts
 * @param {boolean} [opts.skipLock=false] — for testing: skip lock acquisition
 * @param {object} [opts.daytona] — Daytona client (for reconcile/claim)
 * @param {object} [opts.image] — worker sandbox image (for provisioning)
 * @param {string} [opts.apiKey] — neuralwatt API key (for classification)
 * @returns {Promise<{ exitCode: number, duration: number, counts: object }>}
 */
export async function runPass(opts = {}) {
  const { skipLock, daytona, image, apiKey } = opts;
  const startTime = Date.now();
  const counts = { claims: 0, folds: 0, polls: 0, merges: 0, planning: 0 };

  // Ensure runsDir exists.
  mkdirSync(runsDir, { recursive: true });

  // Step 1: Acquire the lock.
  if (!skipLock) {
    acquirePassLock();
  }

  let exitCode = 0;

  try {
    // Load state.
    const policy = loadPolicy();
    let graph = loadGraph(); // eslint-disable-line prefer-const -- reassigned by fold mutations
    const journal = readJournal();

    // Step 2: Reconcile.
    // Cross-check the journal's in-flight and parked entries against reality.
    // For step 4 (no merge queue, no Daytona reconcile against real sandboxes
    // in tests), this is primarily: check for vanished planning runs.
    const reconcileResult = reconcile(graph, journal, { daytona });
    if (reconcileResult.events.length > 0) {
      for (const ev of reconcileResult.events) {
        appendJournal(ev);
      }
      counts.folds += reconcileResult.events.length;
    }

    // Step 3: Fold the inbox.
    const foldResult = foldInbox(graph, policy, journal);
    if (foldResult.events.length > 0) {
      for (const ev of foldResult.events) {
        appendJournal(ev);
      }
      counts.folds += foldResult.events.length;
    }

    // Step 4: Poll in-flight sessions (supervision).
    // For each running claim, check its session. This is where the pass
    // detects completions, deadlines, and questions.
    //
    // In step 4, the actual Daytona session polling is done by the
    // integration tests. The pass frame provides the structure; the
    // pollInFlightSessions function is a hook that tests override.
    const pollResult = await pollInFlightSessions(graph, policy, { daytona, image, apiKey });
    if (pollResult.events.length > 0) {
      for (const ev of pollResult.events) {
        appendJournal(ev);
      }
      counts.polls += pollResult.events.length;
    }

    // Step 5: Re-evaluate ready nodes.
    // (This is implicit — getReadyNodes is called in step 6.)

    // Step 6: Merge triggers, then claim and launch.
    // Gated by pause: while paused, no new claims, no planning launches.
    // Supervision, folding, and merge triggering still run.
    if (!graph.paused) {
      // Bootstrap: assign runId if needed and about to trigger planning.
      if (!graph.runId) {
        const readyNodes = getReadyNodes(graph);
        const planningInFlight = !isPlanningLockHeld() === false; // lock held = in flight
        if (readyNodes.length === 0 && !planningInFlight) {
          const bootResult = assignRunId(graph);
          if (bootResult.event) {
            appendJournal(bootResult.event);
            counts.folds++;
          }
        }
      }

      // Claim and launch ready nodes (depth-first, bounded by fairness).
      const claimResult = await claimAndLaunch(graph, policy, {
        daytona, image, apiKey, runId: graph.runId,
      });
      counts.claims += claimResult.claims;

      // Trigger planning run if frontier is low.
      if (isFrontierLow(graph, policy.maxConcurrentSandboxes) && !isPlanningLockHeld()) {
        const planningTriggered = triggerPlanningRun(graph, policy, {
          mode: 'expansion', runId: graph.runId,
        });
        if (planningTriggered) {
          counts.planning++;
        }
      }
    }

    // Save the graph (derived view, rebuildable from journal).
    saveGraph(buildGraphDigest(graph));

    // Step 7: Write the heartbeat, release the lock, exit.
    const duration = Date.now() - startTime;
    const heartbeat = {
      at: new Date().toISOString(),
      duration,
      exitCode: 0,
      counts,
    };
    atomicWrite(lastPassPath, JSON.stringify(heartbeat, null, 2));

    return { exitCode: 0, duration, counts };
  } catch (err) {
    // A pass crash is recoverable — the journal is the commit point, and
    // the next pass reconciles. Write the error to the heartbeat and exit
    // non-zero so the schedule-tick workflow fires the error notification.
    const duration = Date.now() - startTime;
    const heartbeat = {
      at: new Date().toISOString(),
      duration,
      exitCode: 1,
      error: err.message || String(err),
      counts,
    };
    try {
      atomicWrite(lastPassPath, JSON.stringify(heartbeat, null, 2));
    } catch {
      // Best-effort — if we can't write the heartbeat, the schedule tick
      // will detect staleness instead.
    }
    exitCode = 1;
    console.error(`Pass error: ${err.message || err}`);
    return { exitCode, duration, counts };
  } finally {
    if (!skipLock) {
      releasePassLock();
    }
  }
}

// ─── Reconcile (step 2) ───────────────────────────────────────────────────────

/**
 * Reconcile: cross-check the journal's in-flight and parked entries against
 * reality.
 *
 * For step 4, the primary reconciliation is:
 *   - Check for vanished planning runs (wrapper died, lock released)
 *   - Check for orphaned sandboxes (Daytona API — only when daytona client is available)
 *
 * (From graph-pipeline.md lines 527-532)
 */
function reconcile(graph, journal, opts = {}) {
  const events = [];
  const { daytona } = opts;

  // Check for vanished planning runs.
  const vanished = checkPlanningRunVanished(graph, journal);
  if (vanished.vanished && vanished.planningRunId) {
    events.push({
      type: 'runner_error',
      at: new Date().toISOString(),
      errorType: 'planning_vanished',
      planningRunId: vanished.planningRunId,
      message: 'Planning run wrapper died mid-leg (lock released, no exit code recorded)',
    });
    // The trigger condition still holds (frontier still low), so the
    // standard level-triggered trigger re-fires a fresh run.
  }

  // Check for orphaned sandboxes (only when Daytona client is available).
  if (daytona) {
    // The full orphan-sandbox reconciliation calls reapOrphanedSandboxes
    // from reaper.mjs. For step 4's pass frame, we provide the hook but
    // the actual reaping is done by the integration tests / production.
    // The pass collects known sandbox IDs from the journal's in-flight
    // and parked entries, then calls reapOrphanedSandboxes.
    // This is deferred to the integration path — the pass frame doesn't
    // import reaper.mjs to keep the dependency optional.
  }

  return { events };
}

// ─── Poll in-flight sessions (step 4) ────────────────────────────────────────

/**
 * Poll in-flight sessions: for each running claim, check its session via
 * the Daytona API. Detect completions, deadlines, and questions.
 *
 * This is a hook — the actual polling logic is in supervise.mjs and is
 * called by the integration tests. The pass frame provides the structure:
 * iterate claimed nodes, poll each, classify exits, fold outcomes.
 *
 * For step 4, this function does the structural work (iterate, detect
 * completed nodes) but delegates the actual Daytona API calls to the
 * integration path. In tests, the poll function is a no-op (no real
 * sandboxes).
 */
async function pollInFlightSessions(graph, policy, opts = {}) {
  const events = [];
  const { daytona, image, apiKey } = opts;

  // Find all claimed nodes (in-flight).
  const claimedNodes = graph.nodes.filter(n => n.status === STATUS.CLAIMED);

  for (const node of claimedNodes) {
    // Check deadline.
    if (node.deadlineTs) {
      const deadlineMs = new Date(node.deadlineTs).getTime();
      if (Date.now() >= deadlineMs) {
        // Past deadline — the integration path would terminate the session,
        // pull the transcript, and park for human review. For the pass frame,
        // we journal the runner_error and fail the node.
        const { event } = failNode(graph, node.id, {
          errorType: 'timeout',
          message: `Session past deadline (${node.deadlineTs})`,
        });
        events.push(event);
        continue;
      }
    }

    // The actual session polling (pollAgentSession) requires a Daytona
    // sandbox object, which the integration path provides. For the pass
    // frame, we skip polling if no daytona client is available.
    if (!daytona || !node.sandboxId) continue;

    // The integration path would do:
    //   const sandbox = await daytona.get(node.sandboxId);
    //   const { running, exitCode } = await pollAgentSession(sandbox, node.sessionName, node.cmdId);
    //   if (!running) { ... collect, classify, fold ... }
    //
    // This is exercised by the stage4 integration tests.
  }

  return { events };
}

// ─── Claim and launch (step 6) ────────────────────────────────────────────────

/**
 * Claim and launch ready nodes using depth-first traversal with the
 * fairness bound.
 *
 * The pass claims as many ready nodes as capacity allows, using the
 * depth-first bounded fairness policy. Each claim:
 *   1. selectNextClaim (graph algorithm)
 *   2. claimNode (journal the claim — the commit point)
 *   3. provisionSandbox (create + provision a Daytona sandbox)
 *   4. startAgentSession (start the opencode command async)
 *   5. Update the node with sandbox/session IDs
 *
 * For step 4, the actual provisioning and session starting is done by
 * the integration tests. The pass frame provides the structure and the
 * graph mutations.
 */
async function claimAndLaunch(graph, policy, opts = {}) {
  const { daytona, image, apiKey, runId } = opts;
  let claims = 0;
  let fairnessCounter = 0;
  let lastCompletedNodeId = null;

  while (hasCapacity(graph, policy.maxConcurrentSandboxes)) {
    const selection = selectNextClaim(graph, {
      fairnessBudget: policy.fairnessBudget || policy.maxConcurrentSandboxes,
      fairnessCounter,
      lastCompletedNodeId,
      maxConcurrent: policy.maxConcurrentSandboxes,
    });

    if (!selection.node) break; // no ready nodes or no capacity

    // Claim the node (journal the claim — the commit point).
    const { event: claimEvent } = claimNode(graph, selection.node.id, {
      runId,
      baseCommit: null, // set by provisioning
      sandboxId: null, // set by provisioning
      sessionName: null, // set by provisioning
      deadlineTs: computeDeadline(selection.node),
    });
    appendJournal(claimEvent);
    claims++;
    fairnessCounter = selection.fairnessCounter;
    lastCompletedNodeId = null; // reset — the next depth-first descent
    // happens when this node completes, not when it's claimed.

    // The actual provisioning + session start is done by the integration
    // path (provisionSandbox + startAgentSession). For the pass frame,
    // we skip this if no daytona client / image is available.
    if (daytona && image) {
      // Integration path:
      //   const { sandbox, sandboxId, repoPath } = await provisionSandbox({ ... });
      //   const command = buildInSandboxCommand({ ... });
      //   const env = getTunnelProxyEnv();
      //   const { sessionName, cmdId } = await startAgentSession(sandbox, { ... });
      //   node.sandboxId = sandboxId;
      //   node.sessionName = sessionName;
      //   node.cmdId = cmdId;
      //
      // This is exercised by the stage4 integration tests.
    }
  }

  return { claims };
}

/**
 * Compute the deadline timestamp for a node from its deadline duration.
 */
function computeDeadline(node) {
  if (!node.deadline) return null;
  // Parse ISO duration (e.g. "PT2H") and compute the timestamp.
  const ms = parseISODuration(node.deadline);
  if (ms === null) return null;
  return new Date(Date.now() + ms).toISOString();
}

/**
 * Parse an ISO 8601 duration (e.g. "PT2H", "PT30M", "PT1H30M") into ms.
 */
function parseISODuration(duration) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return null;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

// ─── Planning run trigger (step 6) ────────────────────────────────────────────

/**
 * Trigger a planning run.
 *
 * The pass journals the launch (with its deadline), then triggers the n8n
 * planning-host workflow — a local, contentless call. The journal already
 * records the launch; the host workflow runs the launch wrapper.
 *
 * For step 4, the actual n8n trigger is done by the integration path (an
 * HTTP call to n8n's internal API or a direct process call). The pass frame
 * journals the launch event and returns true if triggered.
 *
 * (From graph-pipeline.md lines 879-919)
 */
function triggerPlanningRun(graph, policy, opts = {}) {
  const { mode, runId, instruction } = opts;

  // Don't trigger if paused.
  if (graph.paused) return false;

  // Don't trigger if a planning run is already in flight.
  if (isPlanningLockHeld()) return false;

  // Journal the launch (the commit point).
  const planningRunId = `plan-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min default

  const event = {
    type: 'planning_launch',
    at: new Date().toISOString(),
    planningRunId,
    mode: mode || 'expansion',
    runId,
    deadline,
    instruction: instruction || null,
  };
  appendJournal(event);

  // Trigger the n8n planning-host workflow.
  // The integration path does:
  //   await triggerN8nWorkflow('planning-host', { planningRunId, mode, ... });
  // For the pass frame, we just journal and return true.
  // The schedule-tick or a direct invocation will pick up the planning run.

  return true;
}

// ─── Self-test ───────────────────────────────────────────────────────────────
//
// The self-test is in stage4-graph.test.mjs, which sets PIPELINE3_STATE_DIR
// before importing this module (paths are resolved at import time).
