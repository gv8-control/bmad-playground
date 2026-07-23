// Graph + policy helpers for the gen-3 pipeline state.
//
// loadPolicy reads and validates policy.json — throwing on missing required
// fields, applying defaults for optional ones.
// loadGraph reads graph.json, returning the empty-graph skeleton on
// missing/malformed (never throws on a bad parse).
// saveGraph atomicWrites graph.json, regenerating generatedAt.
// loadInbox lists files in inbox/. purgeInboxFile deletes one.

import { readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { atomicReadJSON, atomicWrite } from './atomic.mjs';
import { policyPath, graphPath, inboxDir } from './paths.mjs';

// Required policy fields — missing any of these throws.
const REQUIRED_POLICY_FIELDS = ['maxConcurrentSandboxes', 'opencodeVersion', 'trunkBranch'];

/**
 * Read and parse policy.json.
 *
 * Throws if missing required fields (maxConcurrentSandboxes, opencodeVersion,
 * trunkBranch). Applies defaults for optional fields:
 *   fairnessBudget → maxConcurrentSandboxes (doc rule)
 *   postMergeHook → null
 *   perClaimInstallCommand → null
 */
export function loadPolicy(path = policyPath) {
  const policy = atomicReadJSON(path, null);
  if (policy === null) {
    throw new Error(`policy.json not found or unreadable at ${path}`);
  }
  for (const field of REQUIRED_POLICY_FIELDS) {
    if (policy[field] === undefined) {
      throw new Error(`policy.json missing required field: ${field}`);
    }
  }
  // Apply defaults for optional fields.
  if (policy.fairnessBudget === undefined) {
    policy.fairnessBudget = policy.maxConcurrentSandboxes;
  }
  if (policy.postMergeHook === undefined) {
    policy.postMergeHook = null;
  }
  if (policy.perClaimInstallCommand === undefined) {
    policy.perClaimInstallCommand = null;
  }
  if (policy.installTimeoutSec === undefined) {
    policy.installTimeoutSec = 480; // 8 minutes — a fraction of the per-node deadline
  }
  return policy;
}

/**
 * The empty-graph skeleton, matching the shipped graph.json's top-level shape.
 *
 * runId starts null — the bootstrap pass assigns it (see Bootstrap under
 * Dispatcher). paused starts true — a fresh devcontainer does not auto-start
 * the pipeline; the operator runs `resume` to start (see Pipeline control).
 * loadGraph tolerates missing fields and fills defaults.
 */
export function emptyGraph() {
  return {
    runId: null,
    generatedAt: new Date().toISOString(),
    paused: true,
    policy: {},
    nodes: [],
  };
}

/**
 * Read graph.json. If missing/malformed, return the empty-graph skeleton.
 * Never throws on a bad parse — returns the skeleton and logs a warning.
 */
export function loadGraph(path = graphPath) {
  const graph = atomicReadJSON(path, null);
  if (graph === null || typeof graph !== 'object') {
    console.warn(`graph.json missing or malformed, returning empty skeleton`);
    return emptyGraph();
  }
  // Ensure required top-level fields exist.
  if (graph.nodes === undefined) graph.nodes = [];
  if (graph.paused === undefined) graph.paused = false;
  if (graph.policy === undefined) graph.policy = {};
  if (graph.runId === undefined) graph.runId = null;
  return graph;
}

/**
 * Atomic-write graph.json, regenerating generatedAt.
 */
export function saveGraph(graph, path = graphPath) {
  graph.generatedAt = new Date().toISOString();
  atomicWrite(path, JSON.stringify(graph, null, 2));
}

/**
 * List files in inbox/. Returns [] if the directory is absent.
 */
export function loadInbox(path = inboxDir) {
  if (!existsSync(path)) return [];
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

/**
 * Delete one inbox file. The fold consumes and deletes.
 *
 * Uses plain fs.unlinkSync; the atomicity guarantee is on the write side
 * (inbox writers use tmp+rename), not the delete side.
 */
export function purgeInboxFile(name, path = inboxDir) {
  unlinkSync(join(path, name));
}
