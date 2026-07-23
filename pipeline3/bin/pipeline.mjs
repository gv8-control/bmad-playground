#!/usr/bin/env node
// pipeline3/bin/pipeline.mjs — the operator's entire interface to the pipeline.
//
// Three commands: pause, resume, replan. Each writes a request to the inbox
// (tmp + rename, like every inbox write) and invokes the dispatcher directly
// — a local process call, same as n8n's invocations.
//
// The helper is a thin wrapper around the inbox path — no canonical state
// writes, no direct graph mutation, no lock acquisition. It writes the inbox
// file *then* invokes the dispatcher, so the request is durable before the
// pass reads it (same contentless-invocation rule as every n8n invocation).
//
// (From graph-pipeline.md lines 643-683: Pipeline control / operator surface)
//
// Usage:
//   pipeline pause [reason]     — pause the pipeline (stops claiming)
//   pipeline resume             — resume / start the pipeline
//   pipeline replan [instruction] — trigger a replan with an instruction
//
// Start is `resume` on a shipped `paused: true` graph (see Bootstrap).

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { atomicWrite } from '../lib/atomic.mjs';

const moduleDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(moduleDir, '../..');

// Resolve the state dir (same logic as paths.mjs, but we can't import paths.mjs
// because it resolves at import time and we want to respect the env override).
const stateDir = resolve(process.env.PIPELINE3_STATE_DIR || join(repoRoot, 'pipeline3/state'));
const inboxDir = join(stateDir, 'inbox');
const dispatcherPath = join(repoRoot, 'pipeline3/bin/dispatcher.mjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function writeInboxRequest(type, extra = {}) {
  mkdirSync(inboxDir, { recursive: true });
  const filename = `${Date.now()}-${type}.json`;
  const filepath = join(inboxDir, filename);
  const content = JSON.stringify({
    type,
    at: new Date().toISOString(),
    who: process.env.USER || process.env.USERNAME || 'operator',
    ...extra,
  }, null, 2);
  // Atomic write (tmp + rename) — a pass never folds a partial inbox file.
  atomicWrite(filepath, content);
  return filepath;
}

function invokeDispatcher() {
  // Invoke the dispatcher directly — a local process call.
  // The pass folds the inbox request and acts on it.
  // We don't care about the exit code here — the pass writes its own
  // heartbeat, and the schedule-tick workflow handles error notification.
  try {
    execSync(`node "${dispatcherPath}"`, {
      cwd: repoRoot,
      stdio: 'inherit', // show pass output to the operator
      timeout: 60000,  // 60s — passes are seconds long
    });
  } catch (err) {
    // The pass may exit non-zero (e.g. a crash). The error is already
    // printed to stderr by the pass. We exit 0 because the inbox request
    // was written successfully — the next pass (schedule tick) will fold it.
    if (err.status && err.status !== 0) {
      console.error(`Dispatcher exited with code ${err.status}.`);
      console.error('The inbox request was written and will be folded by the next pass.');
    } else {
      console.error(`Failed to invoke dispatcher: ${err.message}`);
    }
    process.exit(0);
  }
}

function printUsage() {
  console.log(`pipeline — control the gen-3 pipeline.

Usage:
  pipeline pause [reason]       Pause the pipeline (stops claiming, not execution)
  pipeline resume               Resume the pipeline (or start it on a fresh graph)
  pipeline replan [instruction] Trigger a replan with an instruction

Commands:
  pause     Writes a pause request to the inbox and invokes the dispatcher.
            The next pass folds it: journal append (commit point), graph.json
            regenerated with paused: true. Takes effect within one pass.
            Active nodes run to completion; no new nodes are claimed.

  resume    Writes a resume request to the inbox and invokes the dispatcher.
            On a fresh paused: true graph with runId: null, this is the start
            action: the unpaused pass assigns runId and triggers the first
            planning run. On a previously-running pipeline, resumes claiming.

  replan    Writes a replan request with the instruction text and invokes the
            dispatcher. The next pass folds it and triggers a planning run in
            replan mode (the instruction is passed verbatim to the planner).
            This is the human override path: "skip to epic 7", "start the
            architecture phase", "drop the unclaimed review node".

All three are idempotent and level-triggered. The helper writes the inbox
file then invokes the dispatcher, so the request is durable before the pass
reads it.`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'pause': {
    const reason = args.join(' ') || 'manual';
    const path = writeInboxRequest('pause', { reason });
    console.log(`Pause request written to ${path}`);
    console.log('Invoking dispatcher...');
    invokeDispatcher();
    break;
  }
  case 'resume': {
    const path = writeInboxRequest('resume');
    console.log(`Resume request written to ${path}`);
    console.log('Invoking dispatcher...');
    invokeDispatcher();
    break;
  }
  case 'replan': {
    const instruction = args.join(' ');
    if (!instruction) {
      console.error('Error: replan requires an instruction text.');
      console.error('Usage: pipeline replan "skip to epic 7"');
      process.exit(1);
    }
    const path = writeInboxRequest('replan', { instruction });
    console.log(`Replan request written to ${path}`);
    console.log('Invoking dispatcher...');
    invokeDispatcher();
    break;
  }
  case '--help':
  case '-h':
  case 'help':
  case undefined:
    printUsage();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('');
    printUsage();
    process.exit(1);
}
