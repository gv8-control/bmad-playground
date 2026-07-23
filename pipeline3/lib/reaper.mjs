// Scoped reaper for pipeline sandboxes.
//
// Destroys orphaned sandboxes — sandboxes no journal entry accounts for
// (crash, terminate, dispatcher death). The reconcile step of every pass
// cross-checks the journal's in-flight and parked entries against sandboxes
// carrying the pipeline scope label (Daytona API), and destroys orphans.
//
// This module is the scoped version of the product's
// `scripts/cleanup-daytona-sandboxes.ts`, which is account-wide destructive
// (no label filter). The pipeline must not reproduce the product's quota-
// exhaustion problem: every sandbox is labeled `scope: pipeline` and a
// `runId` at creation (spike-label-scoping.md), and this reaper only touches
// sandboxes with the pipeline scope label.
//
// Label filtering (spike-label-scoping.md):
//   - Labels are on the returned Sandbox instance immediately at creation.
//   - daytona.list({ labels: { scope: 'pipeline' } }) filters by exact
//     key-value match after a ~5s index propagation delay (irrelevant —
//     reconcile runs on passes minutes apart).
//   - Daytona auto-adds a `code-toolbox-language: python` label to every
//     sandbox; it does not interfere with filtering.
//
// Quota management: the Daytona account has a 30 GiB shared disk quota
// across all environments. Shallow clones (--depth 1) reduce per-sandbox
// disk. Create-on-demand ties live sandboxes to in-flight work by
// construction — in-flight claims plus parked nodes plus at most one merge
// cycle, bounded by maxConcurrentSandboxes. The reaper is the safety net
// for sandboxes that escape that bound (crash, dispatcher death).

import { DaytonaNotFoundError, DaytonaError } from '@daytonaio/sdk';
import { createDaytonaClient } from './provision.mjs';

// The label key used to scope pipeline sandboxes (must match provision.mjs).
const SCOPE_LABEL = 'pipeline';

/**
 * List all sandboxes with the pipeline scope label.
 *
 * Uses daytona.list({ labels: { scope: 'pipeline' } }) — exact key-value
 * match. Returns an array of Sandbox objects.
 *
 * @param {Daytona} [daytona] — an existing Daytona client (creates one if
 *   not provided)
 * @returns {Promise<Array<{id: string, labels: Record<string,string>}>>}
 */
export async function listPipelineSandboxes(daytona) {
  const client = daytona || createDaytonaClient();
  const sandboxes = [];
  for await (const sb of client.list({ labels: { scope: SCOPE_LABEL } })) {
    sandboxes.push({ id: sb.id, labels: sb.labels || {} });
  }
  return sandboxes;
}

/**
 * Destroy a sandbox by ID, idempotently.
 *
 * Catches DaytonaNotFoundError and 404 DaytonaError → returns void (the
 * sandbox is already gone). Non-404 errors propagate. This mirrors the
 * product's SandboxService.destroy pattern (the F1 fix replacing the old
 * string-matching heuristic).
 *
 * @param {Daytona} daytona — the Daytona client
 * @param {string} sandboxId — the sandbox ID to destroy
 */
export async function destroySandbox(daytona, sandboxId) {
  try {
    const sb = await daytona.get(sandboxId);
    await daytona.delete(sb);
  } catch (err) {
    if (isNotFound(err)) return;
    throw err;
  }
}

/**
 * Destroy all orphaned pipeline sandboxes — sandboxes whose IDs are not in
 * the known set.
 *
 * The dispatcher's reconcile step calls this with the set of sandbox IDs
 * the journal accounts for (in-flight claims + parked nodes + the merge
 * cycle's sandbox). Any pipeline-scoped sandbox not in that set is orphaned
 * (crash, terminate, dispatcher death) and gets destroyed.
 *
 * @param {object} opts
 * @param {Daytona} [opts.daytona] — an existing Daytona client
 * @param {Set<string>} knownSandboxIds — the set of sandbox IDs the journal
 *   accounts for
 * @param {string} [opts.runId] — if provided, only destroy sandboxes with
 *   this runId label (scoped cleanup for a specific pipeline run). If not
 *   provided, destroys all orphaned pipeline sandboxes regardless of runId.
 * @returns {Promise<{ destroyed: string[], skipped: string[], errors: Array<{id: string, error: string}> }>}
 */
export async function reapOrphanedSandboxes({ daytona, knownSandboxIds, runId }) {
  const client = daytona || createDaytonaClient();
  const destroyed = [];
  const skipped = [];
  const errors = [];

  for await (const sb of client.list({ labels: { scope: SCOPE_LABEL } })) {
    // If a runId filter is provided, skip sandboxes from other runs.
    if (runId && sb.labels?.runId !== runId) continue;

    // If the sandbox is in the known set, skip it.
    if (knownSandboxIds.has(sb.id)) {
      skipped.push(sb.id);
      continue;
    }

    // Orphaned — destroy it.
    try {
      await client.delete(sb);
      destroyed.push(sb.id);
    } catch (err) {
      if (isNotFound(err)) {
        // Already gone — count as destroyed (it's not orphaned anymore).
        destroyed.push(sb.id);
      } else {
        errors.push({ id: sb.id, error: err.message || String(err) });
      }
    }
  }

  return { destroyed, skipped, errors };
}

/**
 * Destroy all pipeline sandboxes for a specific runId.
 *
 * Used when a pipeline run is abandoned or reset — destroys every sandbox
 * labeled with the given runId, regardless of journal state. This is the
 * "nuke everything from this run" path, not the routine reconcile path.
 *
 * @param {object} opts
 * @param {Daytona} [opts.daytona] — an existing Daytona client
 * @param {string} opts.runId — the pipeline run identifier
 * @returns {Promise<{ destroyed: string[], errors: Array<{id: string, error: string}> }>}
 */
export async function destroyRunSandboxes({ daytona, runId }) {
  if (!runId) throw new Error('destroyRunSandboxes: runId is required');
  const client = daytona || createDaytonaClient();
  const destroyed = [];
  const errors = [];

  for await (const sb of client.list({ labels: { scope: SCOPE_LABEL, runId } })) {
    try {
      await client.delete(sb);
      destroyed.push(sb.id);
    } catch (err) {
      if (isNotFound(err)) {
        destroyed.push(sb.id);
      } else {
        errors.push({ id: sb.id, error: err.message || String(err) });
      }
    }
  }

  return { destroyed, errors };
}

/**
 * Check if a Daytona error is a "not found" (404) error.
 *
 * DaytonaNotFoundError is the SDK's typed error; a 404 DaytonaError is the
 * generic fallback. Both mean "the sandbox is already gone" and should be
 * treated as success in a destroy operation.
 */
function isNotFound(err) {
  if (err instanceof DaytonaNotFoundError) return true;
  if (err instanceof DaytonaError && err.statusCode === 404) return true;
  return false;
}

// createDaytonaClient is imported above from provision.mjs (value import,
// not a re-export — `export { x } from 'mod'` does not create a local binding).
