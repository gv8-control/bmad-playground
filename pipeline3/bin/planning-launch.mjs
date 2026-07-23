#!/usr/bin/env node
// Planning-launch CLI wrapper — what n8n's planning-host workflow's Execute
// Command node runs (blocking for the run's duration).
//
// Imports runPlanningLaunch from ../lib/planning.mjs and calls it with the
// parsed args. The wrapper acquires the planning lock, runs the opencode
// planning process, promotes the delta to the inbox on exit 0, and releases
// the lock. Ordering: record exit code → promote → release lock.
//
// Exit code: the opencode child's exit code (0 on success). A duplicate
// trigger (lock already held) exits 0 immediately — harmless.

import { runPlanningLaunch } from '../lib/planning.mjs';

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--planning-run-id') opts.planningRunId = argv[++i];
    else if (arg === '--mode') opts.mode = argv[++i];
    else if (arg === '--instruction') opts.instruction = argv[++i];
    else if (arg === '--session-id') opts.sessionId = argv[++i];
    else if (arg.startsWith('--planning-run-id=')) opts.planningRunId = arg.slice('--planning-run-id='.length);
    else if (arg.startsWith('--mode=')) opts.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--instruction=')) opts.instruction = arg.slice('--instruction='.length);
    else if (arg.startsWith('--session-id=')) opts.sessionId = arg.slice('--session-id='.length);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  console.log('planning-launch — run a planning launch (graph expansion).');
  console.log('');
  console.log('Usage: node pipeline3/bin/planning-launch.mjs [options]');
  console.log('');
  console.log('Options:');
  console.log('  --planning-run-id <id>   planning run id (generated if omitted)');
  console.log('  --mode <mode>            expansion | conflict | replan (default: expansion)');
  console.log('  --instruction <text>     verbatim human instruction (replan mode)');
  console.log('  --session-id <id>        opencode session id (reserved for resume legs)');
  console.log('  -h, --help               show this help');
  console.log('');
  console.log('Exit code: the opencode child exit code (0 on success). A duplicate');
  console.log('trigger (lock already held) exits 0 immediately.');
  process.exit(0);
}

try {
  const result = await runPlanningLaunch({
    planningRunId: opts.planningRunId,
    mode: opts.mode,
    instruction: opts.instruction,
  });
  process.exit(result.exitCode);
} catch (err) {
  console.error(`planning-launch: ${err.message || err}`);
  process.exit(1);
}
