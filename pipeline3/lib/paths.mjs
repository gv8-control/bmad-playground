// Central path constants for the gen-3 pipeline state directory.
//
// The state dir defaults to pipeline3/state/ relative to the repo root.
// The PIPELINE3_STATE_DIR env override lets tests point at a tmp dir so they
// never touch real state.

import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(moduleDir, '../..');

const stateDir = resolve(process.env.PIPELINE3_STATE_DIR || join(repoRoot, 'pipeline3/state'));

// Canonical state files
const policyPath = join(stateDir, 'policy.json');
const journalPath = join(stateDir, 'journal.jsonl');
const graphPath = join(stateDir, 'graph.json');
// Inbox
const inboxDir = join(stateDir, 'inbox');
// Per-run logs, transcripts, merge-cycle logs, per-pass logs, last-pass.json
const runsDir = join(stateDir, 'runs');
const lastPassPath = join(stateDir, 'last-pass.json');
// Locks (used by later stages; defined here so paths are centralized)
const planningLockPath = join(stateDir, 'planning.lock');
const mergeLockPath = join(stateDir, 'merge.lock');

export {
  stateDir,
  policyPath,
  journalPath,
  graphPath,
  inboxDir,
  runsDir,
  lastPassPath,
  planningLockPath,
  mergeLockPath,
};
