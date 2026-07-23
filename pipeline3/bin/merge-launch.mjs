#!/usr/bin/env node
// Merge-launch CLI wrapper — what n8n's merge-queue workflow's Execute Command
// node runs (blocking for the merge cycle's duration — seconds).
//
// Imports runMergeCycle from ../lib/merge.mjs and calls it with the parsed
// args. The wrapper acquires the merge lock, creates a sandbox, drives the
// merge cycle (fetch, rebase, merge, push, delete-branch), writes any
// conflict report to the inbox, and releases the lock. Ordering: the push is
// the commit point; everything before it is sandbox-local and disposable.
//
// Exit code: 0 on success (including conflict — conflict is evidence, not an
// error). 1 on hook failure or infrastructure error. A duplicate trigger
// (lock already held) exits 0 immediately — harmless.

import { runMergeCycle } from '../lib/merge.mjs';
import { loadPolicy } from '../lib/state.mjs';

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--chain-id') opts.chainId = argv[++i];
    else if (arg === '--merge-point-node-id') opts.mergePointNodeId = argv[++i];
    else if (arg === '--run-id') opts.runId = argv[++i];
    else if (arg === '--trunk-branch') opts.trunkBranch = argv[++i];
    else if (arg === '--round') opts.round = parseInt(argv[++i], 10);
    else if (arg.startsWith('--chain-id=')) opts.chainId = arg.slice('--chain-id='.length);
    else if (arg.startsWith('--merge-point-node-id=')) opts.mergePointNodeId = arg.slice('--merge-point-node-id='.length);
    else if (arg.startsWith('--run-id=')) opts.runId = arg.slice('--run-id='.length);
    else if (arg.startsWith('--trunk-branch=')) opts.trunkBranch = arg.slice('--trunk-branch='.length);
    else if (arg.startsWith('--round=')) opts.round = parseInt(arg.slice('--round='.length), 10);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  console.log('merge-launch — run a merge cycle (git integration of a chain branch).');
  console.log('');
  console.log('Usage: node pipeline3/bin/merge-launch.mjs [options]');
  console.log('');
  console.log('Options:');
  console.log('  --chain-id <id>            the chain to merge (required)');
  console.log('  --merge-point-node-id <id> the merge-point node that triggered (required)');
  console.log('  --run-id <id>              the pipeline run identifier (required)');
  console.log('  --trunk-branch <branch>    trunk branch (default: from policy.json)');
  console.log('  --round <n>                conflict round (default: 1)');
  console.log('  -h, --help                 show this help');
  console.log('');
  console.log('Exit code: 0 on success (including conflict). 1 on hook/infra failure.');
  console.log('A duplicate trigger (lock already held) exits 0 immediately.');
  process.exit(0);
}

// Validate required args.
if (!opts.chainId) {
  console.error('merge-launch: --chain-id is required');
  process.exit(1);
}
if (!opts.mergePointNodeId) {
  console.error('merge-launch: --merge-point-node-id is required');
  process.exit(1);
}
if (!opts.runId) {
  console.error('merge-launch: --run-id is required');
  process.exit(1);
}

// Load policy for trunkBranch and postMergeHook.
let policy = {};
try {
  policy = loadPolicy();
} catch {
  // Policy load failure is non-fatal — use defaults.
}

try {
  const result = await runMergeCycle({
    chainId: opts.chainId,
    mergePointNodeId: opts.mergePointNodeId,
    runId: opts.runId,
    trunkBranch: opts.trunkBranch || policy.trunkBranch || 'main',
    postMergeHook: policy.postMergeHook || null,
    round: opts.round || 1,
  });
  process.exit(result.exitCode);
} catch (err) {
  console.error(`merge-launch: ${err.message || err}`);
  process.exit(1);
}
