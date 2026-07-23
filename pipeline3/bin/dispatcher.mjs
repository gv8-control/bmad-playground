#!/usr/bin/env node
// Dispatcher CLI wrapper — the thin entry point n8n's Execute Command node
// and the resurrection pass in start.sh both invoke.
//
// Imports runPass from ../lib/pass.mjs and calls it with defaults. The pass
// is level-triggered and carries no payload: all state is durable on disk
// before this fires. A redundant invocation finds fixpoint and exits.
//
// Exit code: the pass's exitCode (0 on success, 1 on a pass crash). n8n's
// schedule-tick workflow reads this to decide whether to fire the error
// notification.

import { runPass } from '../lib/pass.mjs';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('dispatcher — run one reconcile pass (the gen-3 dispatcher).');
  console.log('');
  console.log('Usage: node pipeline3/bin/dispatcher.mjs');
  console.log('');
  console.log('Carries no payload — all state is durable on disk. A redundant');
  console.log('invocation finds fixpoint and exits.');
  console.log('');
  console.log('Exit code: 0 on a clean pass, 1 on a pass crash.');
  process.exit(0);
}

try {
  const result = await runPass();
  process.exit(result.exitCode);
} catch (err) {
  console.error(`dispatcher: ${err.message || err}`);
  process.exit(1);
}
