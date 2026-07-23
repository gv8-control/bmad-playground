// Stage 5 integration test: move "done" from workflow-return to branch-merged.
//
// Run: node pipeline3/lib/stage5-merge.test.mjs
//
// Tests the full step 5 machinery:
//   - Merge lock (acquire/release/isHeld/stale-recovery/stall-detection)
//   - Merge cycle (runMergeCycle with test overrides: merged, short-circuit,
//     conflict, push-rejected, duplicate, hook-failure)
//   - Conflict report writer (to inbox, stable fingerprint)
//   - Mermaid graph view (regenerated on every graph mutation)
//   - Merges-first ordering in the pass (merge triggers before claims)
//   - Capacity gating (merge sandbox counts against maxConcurrentSandboxes)
//   - Fired-trigger-reserves-slot (merge trigger reserves capacity)
//   - Merge-landed readiness (dependents ready only after merge lands)
//   - Conflict path (inbox report → chain blocked → conflict-mode planning)
//   - n8n restart mid-merge-cycle (stall detection → alert)
//   - Mid-chain merge point (early node merges, dependent chain starts)
//   - Chain-blocked flag (chain-level, not node status)
//   - markMerged / markChainBlocked / clearChainBlocked
//   - bin/merge-launch.mjs CLI wrapper
//   - n8n merge-queue workflow JSON structure
//
// All tests use a temp state dir — no real state is touched.

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Set PIPELINE3_STATE_DIR BEFORE any imports that use paths.mjs.
const tmpStateDir = mkdtempSync(join(tmpdir(), 'pipeline3-stage5-'));
process.env.PIPELINE3_STATE_DIR = tmpStateDir;

// Now import the modules — they'll resolve paths against the temp dir.
const { loadPolicy, loadGraph, saveGraph, emptyGraph, loadInbox, purgeInboxFile } =
  await import('./state.mjs');
const { appendJournal, readJournal } = await import('./journal.mjs');
const { atomicWrite, atomicReadJSON } = await import('./atomic.mjs');
const {
  getNode, getReadyNodes, isNodeReady, countInFlightSandboxes, hasCapacity,
  claimNode, foldOutcome, parkNode, resumeNode, failNode,
  assignRunId, isFrontierLow, selectNextClaim, branchName, isMergePoint,
  captureTrunkSha, buildGraphDigest, buildNodeDigest, getDependents,
  generateRunId, getChainNodes, getChainIds, STATUS,
} = await import('./graph.mjs');
const { validateDelta, foldDelta, buildRejectionEvent, buildAcceptEvent } =
  await import('./delta.mjs');
const {
  acquirePlanningLock, releasePlanningLock, isPlanningLockHeld,
  writePlanningStatus, readPlanningStatus, buildPlanningPrompt,
  promoteDelta, checkPlanningRunVanished, buildPlanningRunDir,
  generatePlanningRunId, getScratchDeltaPath, getPlanningLogPath,
} = await import('./planning.mjs');
const {
  acquireMergeLock, releaseMergeLock, isMergeLockHeld, checkMergeStall,
  readMergeLock, isMergeLockStale,
  findPendingMergeTriggers, markMerged, markChainBlocked, clearChainBlocked,
  getBlockedChains, writeConflictReport, runMergeCycle,
  buildMergeRunDir, generateMergeCycleId, getMergeLogPath,
  writeMergeStatus, readMergeStatus, MergeError,
} = await import('./merge.mjs');
const { runPass } = await import('./pass.mjs');
const { generateMermaid, writeMermaidView } = await import('./mermaid.mjs');

// ─── Test harness ────────────────────────────────────────────────────────────

let tests = 0;
let failures = 0;

function assert(name, cond) {
  tests++;
  if (cond) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures++;
    console.error(`  \u2717 ${name}`);
  }
}

function assertEqual(name, actual, expected) {
  tests++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures++;
    console.error(`  \u2717 ${name}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

function setupState(graph = null) {
  writeFileSync(join(tmpStateDir, 'policy.json'), JSON.stringify({
    maxConcurrentSandboxes: 3,
    opencodeVersion: '1.17.20',
    trunkBranch: 'main',
    fairnessBudget: 3,
    maxAttemptsPerNode: 2,
    mergeStallTimeoutSec: 30,
    maxMergeRounds: 3,
  }));

  const g = graph || {
    runId: null,
    generatedAt: new Date().toISOString(),
    paused: true,
    policy: {},
    nodes: [],
  };
  writeFileSync(join(tmpStateDir, 'graph.json'), JSON.stringify(g));

  writeFileSync(join(tmpStateDir, 'journal.jsonl'), '');

  mkdirSync(join(tmpStateDir, 'inbox'), { recursive: true });
  mkdirSync(join(tmpStateDir, 'runs'), { recursive: true });

  for (const f of loadInbox(join(tmpStateDir, 'inbox'))) {
    try { purgeInboxFile(f, join(tmpStateDir, 'inbox')); } catch { /* */ }
  }

  // Clean up any leftover locks.
  try { unlinkSync(join(tmpStateDir, 'merge.lock')); } catch { /* */ }
  try { unlinkSync(join(tmpStateDir, 'planning.lock')); } catch { /* */ }
  try { unlinkSync(join(tmpStateDir, 'pass.lock')); } catch { /* */ }
}

function readGraph() {
  return atomicReadJSON(join(tmpStateDir, 'graph.json'), null);
}

function readJournalText() {
  try {
    return readFileSync(join(tmpStateDir, 'journal.jsonl'), 'utf8');
  } catch {
    return '';
  }
}

function readInboxFiles() {
  const dir = join(tmpStateDir, 'inbox');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map(f => {
    const content = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return { filename: f, content };
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log('\n═══ Stage 5: Merge Queue ═══');

// ─── 1. Merge lock: acquire/release cycle ────────────────────────────────────

console.log('\n1. merge lock: acquire/release cycle');

setupState();
const a = acquireMergeLock();
assert('acquires when free', a.acquired === true && a.fd !== null);
const b = acquireMergeLock();
assert('refuses when held', b.acquired === false && b.fd === null);
releaseMergeLock(a.fd);
const c = acquireMergeLock();
assert('re-acquires after release', c.acquired === true && c.fd !== null);
releaseMergeLock(c.fd);

// ─── 2. Merge lock: isMergeLockHeld ───────────────────────────────────────────

console.log('\n2. merge lock: isMergeLockHeld');
assert('not held when free', isMergeLockHeld() === false);
const held = acquireMergeLock();
assert('held after acquire', isMergeLockHeld() === true);
releaseMergeLock(held.fd);
assert('not held after release', isMergeLockHeld() === false);

// ─── 3. Merge lock: stale lock recovery (dead PID) ───────────────────────────

console.log('\n3. merge lock: stale lock recovery');
writeFileSync(join(tmpStateDir, 'merge.lock'), JSON.stringify({
  pid: 999999, heldSince: new Date().toISOString(), sandboxId: null,
}));
const stale = acquireMergeLock();
assert('reclaims stale lock (dead PID)', stale.acquired === true);
releaseMergeLock(stale.fd);

// ─── 4. Merge lock: stall detection ──────────────────────────────────────────

console.log('\n4. merge lock: stall detection');
const oldTs = new Date(Date.now() - 60000).toISOString();
writeFileSync(join(tmpStateDir, 'merge.lock'), JSON.stringify({
  pid: process.pid, heldSince: oldTs, sandboxId: 'sb-stall',
}));
const stall = checkMergeStall(30000);
assert('stall detected (held > 30s, live PID)', stall.stalled === true);
assert('stall record has sandboxId', stall.sandboxId === 'sb-stall');
assert('stall record has pid', stall.pid === process.pid);

const recentTs = new Date().toISOString();
writeFileSync(join(tmpStateDir, 'merge.lock'), JSON.stringify({
  pid: process.pid, heldSince: recentTs, sandboxId: 'sb-ok',
}));
const noStall = checkMergeStall(30000);
assert('no stall (just acquired)', noStall.stalled === false);
try { unlinkSync(join(tmpStateDir, 'merge.lock')); } catch { /* */ }

// ─── 5. Merge lock: readMergeLock record ─────────────────────────────────────

console.log('\n5. merge lock: readMergeLock record');
const lockRec = acquireMergeLock({ sandboxId: 'sb-record' });
const record = readMergeLock();
assert('record has pid', record && typeof record.pid === 'number');
assert('record has heldSince', record && typeof record.heldSince === 'string');
assert('record has sandboxId', record && record.sandboxId === 'sb-record');
releaseMergeLock(lockRec.fd);

// ─── 6. Conflict report writer ────────────────────────────────────────────────

console.log('\n6. conflict report writer');
setupState();
const cr = writeConflictReport({
  inboxDirPath: join(tmpStateDir, 'inbox'),
  chainId: 'c1',
  mergePointNodeId: 'n3',
  conflictedFiles: ['src/a.ts', 'package.json'],
  diffstat: '+10 -5',
  runId: 'r1',
  round: 1,
});
assert('conflict report written', cr.written === true);
assert('conflict report file exists', existsSync(cr.inboxPath));
const reportContent = JSON.parse(readFileSync(cr.inboxPath, 'utf8'));
assert('report has type conflict', reportContent.type === 'conflict');
assert('report has fingerprint merge-conflict-c1', reportContent.fingerprint === 'merge-conflict-c1');
assert('report has chainId', reportContent.chainId === 'c1');
assert('report has mergePointNodeId', reportContent.mergePointNodeId === 'n3');
assert('report has conflictedFiles', reportContent.conflictedFiles.length === 2);
assert('report has round', reportContent.round === 1);

// ─── 7. findPendingMergeTriggers ─────────────────────────────────────────────

console.log('\n7. findPendingMergeTriggers');
const triggerGraph = {
  runId: 'r1', nodes: [
    { id: 'n1', chainId: 'c1', status: 'completed', mergeTo: 'main', merged: false },
    { id: 'n2', chainId: 'c2', status: 'completed', mergeTo: 'main', merged: true },
    { id: 'n3', chainId: 'c3', status: 'completed', mergeTo: 'main', merged: false },
    { id: 'n4', chainId: 'c4', status: 'completed', mergeTo: null, merged: false },
    { id: 'n5', chainId: 'c5', status: 'failed', mergeTo: 'main', merged: false },
    { id: 'n6', chainId: 'c6', status: 'claimed', mergeTo: 'main', merged: false },
  ],
  blockedChains: { c3: { round: 1 } },
};
const triggers = findPendingMergeTriggers(triggerGraph, getBlockedChains(triggerGraph));
assert('finds 1 trigger (n1: completed, mergeTo, not merged, not blocked)', triggers.length === 1);
assert('trigger is for n1', triggers[0].nodeId === 'n1');
assert('trigger has chainId c1', triggers[0].chainId === 'c1');
assert('trigger has mergeTo main', triggers[0].mergeTo === 'main');

// ─── 8. markMerged ────────────────────────────────────────────────────────────

console.log('\n8. markMerged');
const { graph: mg, event: me } = markMerged(triggerGraph, 'n1');
assert('n1 merged flag set', triggerGraph.nodes[0].merged === true);
assert('merge event type', me.type === 'merge');
assert('merge event result merged', me.result === 'merged');
assert('merge event has nodeId', me.nodeId === 'n1');
// n1 should no longer trigger
const triggers2 = findPendingMergeTriggers(triggerGraph, getBlockedChains(triggerGraph));
assert('n1 no longer triggers after markMerged', triggers2.length === 0);

// ─── 9. markChainBlocked / clearChainBlocked / getBlockedChains ───────────────

console.log('\n9. markChainBlocked / clearChainBlocked / getBlockedChains');
const blockGraph = { runId: 'r1', nodes: [] };
const { event: be } = markChainBlocked(blockGraph, 'c1', {
  mergePointNodeId: 'n1', round: 1, conflictedFiles: ['a.ts'], diffstat: '+1',
});
assert('blocked event type merge', be.type === 'merge');
assert('blocked event result conflict', be.result === 'conflict');
assert('blockedChains has c1', blockGraph.blockedChains && blockGraph.blockedChains.c1);
const blocked = getBlockedChains(blockGraph);
assert('getBlockedChains returns c1', blocked.has('c1'));
const { event: ce } = clearChainBlocked(blockGraph, 'c1');
assert('clear event type merge', ce.type === 'merge');
assert('clear event result unblocked', ce.result === 'unblocked');
const blocked2 = getBlockedChains(blockGraph);
assert('c1 no longer blocked after clear', !blocked2.has('c1'));

// ─── 10. Merge-landed readiness (isNodeReady checks merged flag) ──────────────

console.log('\n10. merge-landed readiness');
const readyGraph = {
  runId: 'r1', nodes: [
    // Merge-point node, completed, NOT merged → dependents NOT ready
    { id: 'mp1', chainId: 'c1', status: 'completed', mergeTo: 'main', merged: false, dependsOn: [] },
    { id: 'succ1', chainId: 'c1', status: 'pending', mergeTo: null, dependsOn: ['mp1'] },
    // Merge-point node, completed, merged → dependents ready
    { id: 'mp2', chainId: 'c2', status: 'completed', mergeTo: 'main', merged: true, dependsOn: [] },
    { id: 'succ2', chainId: 'c2', status: 'pending', mergeTo: null, dependsOn: ['mp2'] },
    // Non-merge-point completed → dependents ready (same branch)
    { id: 'plain1', chainId: 'c3', status: 'completed', mergeTo: null, dependsOn: [] },
    { id: 'succ3', chainId: 'c3', status: 'pending', mergeTo: null, dependsOn: ['plain1'] },
  ]
};
assert('succ1 NOT ready (mp1 completed but not merged)', !isNodeReady(readyGraph, readyGraph.nodes[1]));
assert('succ2 ready (mp2 completed and merged)', isNodeReady(readyGraph, readyGraph.nodes[3]));
assert('succ3 ready (plain1 completed, no mergeTo)', isNodeReady(readyGraph, readyGraph.nodes[5]));

// After marking mp1 as merged, succ1 should become ready
markMerged(readyGraph, 'mp1');
assert('succ1 ready after mp1 marked merged', isNodeReady(readyGraph, readyGraph.nodes[1]));

// ─── 11. Merge cycle: successful merge (test overrides) ───────────────────────

console.log('\n11. merge cycle: successful merge');
const mockSandbox = { id: 'sb-merge-1', delete: async () => { /* no-op mock */ } };
const mergeResult1 = await runMergeCycle({
  chainId: 'c1', mergePointNodeId: 'n1', runId: 'r1', trunkBranch: 'main',
  provisionSandboxFn: async () => ({ sandbox: mockSandbox, sandboxId: 'sb-1', repoPath: '/workspace/repo' }),
  executeInSandboxFn: async (sb, cmd) => {
    if (cmd.includes('merge-base --is-ancestor')) return { result: 'NOT_ANCESTOR', exitCode: 0 };
    if (cmd.includes('git rebase')) return { result: 'Successfully rebased', exitCode: 0 };
    if (cmd.includes('git push origin HEAD:')) return { result: '', exitCode: 0 };
    return { result: '', exitCode: 0 };
  },
  destroySandboxFn: async () => { /* no-op mock */ },
});
assert('merge result is merged', mergeResult1.result === 'merged');
assert('merge exit code 0', mergeResult1.exitCode === 0);
assert('merge has runDir', mergeResult1.runDir !== null);
const status1 = readMergeStatus(mergeResult1.runDir);
assert('status file has result merged', status1 && status1.result === 'merged');

// ─── 12. Merge cycle: short-circuit (already merged) ─────────────────────────

console.log('\n12. merge cycle: short-circuit (already merged)');
const mergeResult2 = await runMergeCycle({
  chainId: 'c2', mergePointNodeId: 'n2', runId: 'r1', trunkBranch: 'main',
  provisionSandboxFn: async () => ({ sandbox: mockSandbox, sandboxId: 'sb-2', repoPath: '/workspace/repo' }),
  executeInSandboxFn: async (sb, cmd) => {
    if (cmd.includes('merge-base --is-ancestor')) return { result: 'ANCESTOR', exitCode: 0 };
    return { result: '', exitCode: 0 };
  },
  destroySandboxFn: async () => { /* no-op mock */ },
});
assert('short-circuit result', mergeResult2.result === 'short_circuit');
assert('short-circuit exit 0', mergeResult2.exitCode === 0);

// ─── 13. Merge cycle: conflict ───────────────────────────────────────────────

console.log('\n13. merge cycle: conflict');
setupState();
const mergeResult3 = await runMergeCycle({
  chainId: 'c3', mergePointNodeId: 'n3', runId: 'r1', trunkBranch: 'main',
  provisionSandboxFn: async () => ({ sandbox: mockSandbox, sandboxId: 'sb-3', repoPath: '/workspace/repo' }),
  executeInSandboxFn: async (sb, cmd) => {
    if (cmd.includes('merge-base --is-ancestor')) return { result: 'NOT_ANCESTOR', exitCode: 0 };
    if (cmd.includes('git rebase')) return { result: 'CONFLICT (content): Merge conflict in src/a.ts', exitCode: 1 };
    if (cmd.includes('git diff --name-only')) return { result: 'src/a.ts\n', exitCode: 0 };
    if (cmd.includes('git diff --stat')) return { result: 'src/a.ts | 5 +-\n', exitCode: 0 };
    return { result: '', exitCode: 0 };
  },
  destroySandboxFn: async () => { /* no-op mock */ },
});
assert('conflict result', mergeResult3.result === 'conflict');
assert('conflict exit 0 (not an error)', mergeResult3.exitCode === 0);
const conflictInbox = readInboxFiles();
assert('conflict report in inbox', conflictInbox.some(f => f.content.type === 'conflict' && f.content.chainId === 'c3'));
const conflictReport = conflictInbox.find(f => f.content.type === 'conflict' && f.content.chainId === 'c3');
assert('conflict report has fingerprint', conflictReport.content.fingerprint === 'merge-conflict-c3');
assert('conflict report has conflictedFiles', conflictReport.content.conflictedFiles.length === 1);

// ─── 14. Merge cycle: push rejected (trunk moved) ────────────────────────────

console.log('\n14. merge cycle: push rejected (trunk moved)');
const mergeResult4 = await runMergeCycle({
  chainId: 'c4', mergePointNodeId: 'n4', runId: 'r1', trunkBranch: 'main',
  provisionSandboxFn: async () => ({ sandbox: mockSandbox, sandboxId: 'sb-4', repoPath: '/workspace/repo' }),
  executeInSandboxFn: async (sb, cmd) => {
    if (cmd.includes('merge-base --is-ancestor')) return { result: 'NOT_ANCESTOR', exitCode: 0 };
    if (cmd.includes('git rebase')) return { result: 'Successfully rebased', exitCode: 0 };
    if (cmd.includes('git push origin HEAD:')) return { result: '! [rejected] HEAD -> main (non-fast-forward)', exitCode: 1 };
    return { result: '', exitCode: 0 };
  },
  destroySandboxFn: async () => { /* no-op mock */ },
});
assert('push_rejected result', mergeResult4.result === 'push_rejected');
assert('push_rejected exit 0', mergeResult4.exitCode === 0);

// ─── 15. Merge cycle: duplicate trigger (lock held) ──────────────────────────

console.log('\n15. merge cycle: duplicate trigger (lock held)');
const heldLock = acquireMergeLock();
const mergeResult5 = await runMergeCycle({
  chainId: 'c5', mergePointNodeId: 'n5', runId: 'r1',
  provisionSandboxFn: async () => { throw new Error('should not provision'); },
  destroySandboxFn: async () => { /* no-op mock */ },
});
assert('duplicate result', mergeResult5.result === 'duplicate');
assert('duplicate exit 0', mergeResult5.exitCode === 0);
releaseMergeLock(heldLock);

// ─── 16. Merge cycle: post-merge hook failure ────────────────────────────────

console.log('\n16. merge cycle: post-merge hook failure');
const mergeResult6 = await runMergeCycle({
  chainId: 'c6', mergePointNodeId: 'n6', runId: 'r1', trunkBranch: 'main',
  postMergeHook: 'npm test',
  provisionSandboxFn: async () => ({ sandbox: mockSandbox, sandboxId: 'sb-6', repoPath: '/workspace/repo' }),
  executeInSandboxFn: async (sb, cmd) => {
    if (cmd.includes('merge-base --is-ancestor')) return { result: 'NOT_ANCESTOR', exitCode: 0 };
    if (cmd.includes('git rebase')) return { result: 'Successfully rebased', exitCode: 0 };
    if (cmd.includes('git push origin HEAD:')) return { result: '', exitCode: 0 };
    if (cmd.includes('npm test')) return { result: 'tests failed', exitCode: 1 };
    return { result: '', exitCode: 0 };
  },
  destroySandboxFn: async () => { /* no-op mock */ },
});
assert('hook_failed result', mergeResult6.result === 'hook_failed');
assert('hook_failed exit 1', mergeResult6.exitCode === 1);

// ─── 17. Merges-first ordering in the pass ───────────────────────────────────

console.log('\n17. merges-first ordering in the pass');
setupState({
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [
    // A completed merge-point node (not yet merged) — should trigger a merge
    { id: 'mp1', chainId: 'c1', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'completed', attempts: 1, merged: false },
    // An independent ready node — should be claimed
    { id: 'n1', chainId: 'c2', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'pending', attempts: 0 },
  ]
});

const passResult = await runPass({ skipLock: true });
assert('pass exit 0', passResult.exitCode === 0);
assert('1 merge trigger fired', passResult.counts.merges === 1);
assert('1 claim (capacity reduced by merge trigger)', passResult.counts.claims === 1);

const g17 = readGraph();
const claimed17 = g17.nodes.filter(n => n.status === 'claimed');
assert('n1 claimed (independent node)', claimed17.some(n => n.id === 'n1'));
const journal17 = readJournalText();
assert('journal has merge_launch event', journal17.includes('"type":"merge_launch"'));
assert('journal has merge_launch for mp1', journal17.includes('"mergePointNodeId":"mp1"'));

// ─── 18. Capacity gating: merge trigger deferred when cap full ────────────────

console.log('\n18. capacity gating: merge trigger deferred when cap full');
setupState({
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [
    // 3 claimed nodes (filling the cap of 3)
    { id: 'c1', chainId: 'ch1', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'claimed', attempts: 1,
      sandboxId: 'sb1', sessionName: 's1', cmdId: 'cmd1', deadlineTs: '2026-07-23T23:59:59Z' },
    { id: 'c2', chainId: 'ch2', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'claimed', attempts: 1,
      sandboxId: 'sb2', sessionName: 's2', cmdId: 'cmd2', deadlineTs: '2026-07-23T23:59:59Z' },
    { id: 'c3', chainId: 'ch3', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'claimed', attempts: 1,
      sandboxId: 'sb3', sessionName: 's3', cmdId: 'cmd3', deadlineTs: '2026-07-23T23:59:59Z' },
    // A completed merge-point node — should NOT trigger (cap full)
    { id: 'mp1', chainId: 'ch4', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'completed', attempts: 1, merged: false },
  ]
});

const passResult18 = await runPass({ skipLock: true });
assert('pass exit 0', passResult18.exitCode === 0);
assert('0 merge triggers (cap full)', passResult18.counts.merges === 0);
assert('0 claims (cap full)', passResult18.counts.claims === 0);

// ─── 19. Conflict report folding: chain blocked ───────────────────────────────

console.log('\n19. conflict report folding: chain blocked');
setupState({
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [
    { id: 'mp1', chainId: 'c1', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'completed', attempts: 1, merged: false },
  ]
});

// Write a conflict report to the inbox
writeFileSync(join(tmpStateDir, 'inbox', '001-conflict.json'), JSON.stringify({
  type: 'conflict',
  at: new Date().toISOString(),
  fingerprint: 'merge-conflict-c1',
  chainId: 'c1',
  mergePointNodeId: 'mp1',
  conflictedFiles: ['src/a.ts'],
  diffstat: '+5 -3',
  runId: 'r1',
  round: 1,
}));

const passResult19 = await runPass({ skipLock: true });
assert('pass exit 0', passResult19.exitCode === 0);

const g19 = readGraph();
assert('chain c1 is blocked', g19.blockedChains && g19.blockedChains.c1);
assert('blocked chain has mergePointNodeId', g19.blockedChains.c1.mergePointNodeId === 'mp1');
assert('blocked chain has round 1', g19.blockedChains.c1.round === 1);
// mp1 stays completed (not a node status change)
assert('mp1 stays completed', g19.nodes[0].status === 'completed');
assert('mp1 NOT merged (still needs merge)', g19.nodes[0].merged === false);

const journal19 = readJournalText();
assert('journal has conflict event', journal19.includes('"type":"conflict"'));
assert('journal has merge event with conflict result', journal19.includes('"result":"conflict"'));

// ─── 20. Conflict-mode planning trigger ───────────────────────────────────────

console.log('\n20. conflict-mode planning trigger');
// The previous test left c1 blocked. Run another pass — it should trigger
// a conflict-mode planning run.
const passResult20 = await runPass({ skipLock: true });
assert('pass exit 0', passResult20.exitCode === 0);
assert('1 conflict-mode planning launch', passResult20.counts.planning >= 1);

const journal20 = readJournalText();
assert('journal has conflict-mode planning_launch', journal20.includes('"mode":"conflict"'));

// ─── 21. Merge result folding: markMerged via inbox ──────────────────────────

console.log('\n21. merge result folding: markMerged via inbox');
setupState({
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [
    { id: 'mp1', chainId: 'c1', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'completed', attempts: 1, merged: false },
    { id: 'succ1', chainId: 'c1', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: ['mp1'], mergeTo: 'main', metadata: {}, status: 'pending', attempts: 0 },
  ]
});

// Write a merge result to the inbox (merge landed)
writeFileSync(join(tmpStateDir, 'inbox', '001-merge.json'), JSON.stringify({
  type: 'merge',
  at: new Date().toISOString(),
  nodeId: 'mp1',
  chainId: 'c1',
  result: 'merged',
}));

const passResult21 = await runPass({ skipLock: true });
assert('pass exit 0', passResult21.exitCode === 0);

const g21 = readGraph();
assert('mp1 merged flag set', g21.nodes[0].merged === true);
// succ1 should have been claimed (it became ready after mp1 was marked merged)
assert('succ1 claimed (became ready after merge)', g21.nodes[1].status === 'claimed');

const journal21 = readJournalText();
assert('journal has merge event', journal21.includes('"type":"merge"'));
assert('journal has merged result', journal21.includes('"result":"merged"'));

// ─── 22. Mid-chain merge point: dependent chain starts ───────────────────────

console.log('\n22. mid-chain merge point: dependent chain starts');
setupState({
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [
    // Chain A: mp1 is a mid-chain merge point (completed + merged)
    { id: 'mp1', chainId: 'cA', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'completed', attempts: 1, merged: true },
    // Chain A continues after merge
    { id: 'a2', chainId: 'cA', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: ['mp1'], mergeTo: 'main', metadata: {}, status: 'pending', attempts: 0 },
    // Chain B depends on Chain A's merge point (cross-chain)
    { id: 'b1', chainId: 'cB', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: ['mp1'], mergeTo: 'main', metadata: {}, status: 'pending', attempts: 0 },
  ]
});

const passResult22 = await runPass({ skipLock: true });
assert('pass exit 0', passResult22.exitCode === 0);
// Both a2 and b1 should be ready (mp1 is completed + merged)
assert('2 claims (a2 and b1 both ready)', passResult22.counts.claims === 2);

const g22 = readGraph();
const claimed22 = g22.nodes.filter(n => n.status === 'claimed');
assert('a2 claimed', claimed22.some(n => n.id === 'a2'));
assert('b1 claimed (cross-chain dependent)', claimed22.some(n => n.id === 'b1'));

// ─── 23. Mermaid graph view regeneration ──────────────────────────────────────

console.log('\n23. mermaid graph view regeneration');
setupState({
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [
    { id: 'n1', chainId: 'c1', skill: 'dev', agent: 'coder', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'completed', attempts: 1, merged: true },
    { id: 'n2', chainId: 'c1', skill: 'test', agent: 'coder', prompt: 't', deadline: 'PT1H',
      dependsOn: ['n1'], mergeTo: null, metadata: {}, status: 'pending', attempts: 0 },
  ]
});

await runPass({ skipLock: true });

const mermaidPath = join(tmpStateDir, 'graph-view.md');
assert('mermaid view file exists', existsSync(mermaidPath));
const mermaidContent = readFileSync(mermaidPath, 'utf8');
assert('mermaid has flowchart TD', mermaidContent.includes('flowchart TD'));
assert('mermaid has subgraph for c1', mermaidContent.includes('subgraph chain-c1'));
assert('mermaid has edge n1 --> n2', mermaidContent.includes('n1 --> n2'));
assert('mermaid has classDef for completed', mermaidContent.includes('classDef completed'));
assert('mermaid has runId in header', mermaidContent.includes('r1'));

// ─── 24. Mermaid: empty graph ────────────────────────────────────────────────

console.log('\n24. mermaid: empty graph');
const emptyMermaid = generateMermaid({ runId: null, paused: true, nodes: [] });
assert('empty graph has message', emptyMermaid.includes('No nodes'));

// ─── 25. n8n merge-queue workflow JSON exists ────────────────────────────────

console.log('\n25. n8n merge-queue workflow JSON');
import { readFileSync as readFileSyncSync } from 'node:fs';
import { fileURLToPath as fileURLToPathSync } from 'node:url';
const workflowPath = join(fileURLToPathSync(new URL('..', import.meta.url)), '..', 'n8n', 'workflows', 'merge-queue.json');
assert('merge-queue.json exists', existsSync(workflowPath));
const workflow = JSON.parse(readFileSyncSync(workflowPath, 'utf8'));
assert('workflow has name', workflow.name === 'Pipeline3 Merge Queue');
assert('workflow has Start node', workflow.nodes.some(n => n.name === 'Start'));
assert('workflow has Run Merge Wrapper node', workflow.nodes.some(n => n.name === 'Run Merge Wrapper'));
assert('workflow has Invoke Dispatcher node', workflow.nodes.some(n => n.name === 'Invoke Dispatcher'));
assert('workflow has executeCommand for merge wrapper', workflow.nodes.some(n => n.type === 'n8n-nodes-base.executeCommand'));

// ─── 26. bin/merge-launch.mjs exists and has --help ─────────────────────────

console.log('\n26. bin/merge-launch.mjs');
const mergeLaunchPath = join(fileURLToPathSync(new URL('..', import.meta.url)), 'bin', 'merge-launch.mjs');
assert('merge-launch.mjs exists', existsSync(mergeLaunchPath));
const mergeLaunchContent = readFileSyncSync(mergeLaunchPath, 'utf8');
assert('has --chain-id option', mergeLaunchContent.includes('--chain-id'));
assert('has --merge-point-node-id option', mergeLaunchContent.includes('--merge-point-node-id'));
assert('has --run-id option', mergeLaunchContent.includes('--run-id'));
assert('imports runMergeCycle', mergeLaunchContent.includes('runMergeCycle'));

// ─── 27. Merge sandbox counts against maxConcurrentSandboxes ─────────────────

console.log('\n27. merge sandbox counts against maxConcurrentSandboxes');
const capGraph = {
  runId: 'r1', nodes: [
    { id: 'n1', chainId: 'c1', status: 'claimed', dependsOn: [] },
    { id: 'n2', chainId: 'c2', status: 'claimed', dependsOn: [] },
  ]
};
// With 2 claimed + merge sandbox live = 3, cap=3 → no capacity
assert('no capacity with 2 claimed + merge live (cap=3)', !hasCapacity(capGraph, 3, true));
// With 2 claimed + no merge = 2, cap=3 → capacity
assert('capacity with 2 claimed + no merge (cap=3)', hasCapacity(capGraph, 3, false));
// With 2 claimed + merge live + 1 reserved = 4, cap=3 → no capacity
assert('no capacity with 2 claimed + merge + 1 reserved (cap=3)', !hasCapacity(capGraph, 3, true, 1));

// ─── 28. Restart n8n mid-merge-cycle: stall detection ───────────────────────

console.log('\n28. restart n8n mid-merge-cycle: stall detection');
setupState();
// Simulate an orphaned merge lock (n8n restarted, wrapper orphaned)
const stallTs = new Date(Date.now() - 120000).toISOString(); // 2 min ago
writeFileSync(join(tmpStateDir, 'merge.lock'), JSON.stringify({
  pid: process.pid, // we're alive — simulates orphaned process
  heldSince: stallTs,
  sandboxId: 'sb-orphaned',
}));

const passResult28 = await runPass({ skipLock: true });
assert('pass exit 0', passResult28.exitCode === 0);
const journal28 = readJournalText();
assert('journal has merge_stall runner_error', journal28.includes('"errorType":"merge_stall"'));
assert('journal has sandboxId', journal28.includes('"sandboxId":"sb-orphaned"'));

// ─── 29. Merge trigger continues during pause ────────────────────────────────

console.log('\n29. merge trigger continues during pause');
setupState({
  runId: 'r1', generatedAt: '', paused: true, policy: {}, nodes: [
    { id: 'mp1', chainId: 'c1', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'completed', attempts: 1, merged: false },
    { id: 'n1', chainId: 'c2', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'pending', attempts: 0 },
  ]
});

const passResult29 = await runPass({ skipLock: true });
assert('pass exit 0', passResult29.exitCode === 0);
// Merge triggering continues during pause (finishing claimed work)
assert('1 merge trigger fired during pause', passResult29.counts.merges === 1);
// But no claims (pause stops claiming)
assert('0 claims during pause', passResult29.counts.claims === 0);

// ─── 30. Policy defaults: mergeStallTimeoutSec and maxMergeRounds ────────────

console.log('\n30. policy defaults');
setupState();
writeFileSync(join(tmpStateDir, 'policy.json'), JSON.stringify({
  maxConcurrentSandboxes: 3, opencodeVersion: '1.17.20', trunkBranch: 'main',
}));
const policy = loadPolicy();
assert('mergeStallTimeoutSec defaults to 30', policy.mergeStallTimeoutSec === 30);
assert('maxMergeRounds defaults to 3', policy.maxMergeRounds === 3);

// ─── 31. Graph digest includes merged flag and blockedChains ─────────────────

console.log('\n31. graph digest includes merged flag and blockedChains');
const digestGraph = {
  runId: 'r1', paused: false, policy: {},
  blockedChains: { c1: { round: 1 } },
  nodes: [
    { id: 'n1', chainId: 'c1', status: 'completed', mergeTo: 'main', merged: true, attempts: 1, dependsOn: [] },
  ]
};
const digest = buildGraphDigest(digestGraph);
assert('digest has blockedChains', digest.blockedChains && digest.blockedChains.c1);
assert('node digest has merged flag', digest.nodes[0].merged === true);

// ─── 32. Conflict path: full lifecycle ───────────────────────────────────────

console.log('\n32. conflict path: full lifecycle');
setupState({
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [
    { id: 'mp1', chainId: 'c1', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'completed', attempts: 1, merged: false },
  ]
});

// Step 1: conflict report arrives
writeFileSync(join(tmpStateDir, 'inbox', '001-conflict.json'), JSON.stringify({
  type: 'conflict', at: new Date().toISOString(),
  fingerprint: 'merge-conflict-c1', chainId: 'c1', mergePointNodeId: 'mp1',
  conflictedFiles: ['src/a.ts'], diffstat: '+5 -3', runId: 'r1', round: 1,
}));
const pass32a = await runPass({ skipLock: true });
assert('conflict folded (pass exit 0)', pass32a.exitCode === 0);

const g32a = readGraph();
assert('chain c1 blocked', g32a.blockedChains && g32a.blockedChains.c1);
assert('mp1 stays completed', g32a.nodes[0].status === 'completed');
assert('mp1 not merged', g32a.nodes[0].merged === false);

// Step 2: conflict-mode planning run triggers
const pass32b = await runPass({ skipLock: true });
assert('conflict-mode planning triggered', pass32b.counts.planning >= 1);

// Step 3: resolution node appears (simulate planning delta)
// The resolution node depends on mp1 (the merge-point node) — it continues
// the chain. The delta validation requires a total order within a chain.
const resolutionDelta = {
  planningRunId: 'plan-conflict-1', mode: 'conflict', authoredAt: new Date().toISOString(),
  trunkShaAtT0: '', ops: [{
    type: 'addNode', id: 'resolve-1', chainId: 'c1',
    skill: 'bmad-dev-story', agent: 'coder', prompt: 'Resolve the conflict',
    deadline: 'PT2H', dependsOn: ['mp1'], mergeTo: 'main',
    metadata: { resolutionFor: 'mp1' },
  }],
};
writeFileSync(join(tmpStateDir, 'inbox', '002-plan-conflict-1.json'), JSON.stringify(resolutionDelta));
const pass32c = await runPass({ skipLock: true });
assert('resolution delta folded (pass exit 0)', pass32c.exitCode === 0);

const g32c = readGraph();
assert('resolution node added', g32c.nodes.some(n => n.id === 'resolve-1'));
assert('resolution node is pending', g32c.nodes.find(n => n.id === 'resolve-1').status === 'pending');

// Step 4: resolution completes and re-triggers merge
const resolveNode = g32c.nodes.find(n => n.id === 'resolve-1');
const { triggersMerge } = foldOutcome(g32c, 'resolve-1', {
  outcome: 'COMPLETE', evidence: 'resolved', durationMs: 5000,
});
assert('resolution completion triggers merge', triggersMerge);

// ─── 33. Helpers ─────────────────────────────────────────────────────────────

console.log('\n33. helpers');
const mid = generateMergeCycleId();
assert('mergeCycleId is non-empty', mid && mid.length > 0);
assert('mergeCycleId is unique-ish', generateMergeCycleId() !== mid);
assert('buildMergeRunDir format', buildMergeRunDir('xyz').endsWith('merge-xyz'));
assert('getMergeLogPath format', getMergeLogPath('/r').endsWith('merge.log'));

// ─── 34. Merge status read/write ─────────────────────────────────────────────

console.log('\n34. merge status read/write');
const statusDir = buildMergeRunDir('status-test');
mkdirSync(statusDir, { recursive: true });
writeMergeStatus(statusDir, { mergeCycleId: 'x', result: 'merged', exitCode: 0 });
const readStatus = readMergeStatus(statusDir);
assert('status read back', readStatus && readStatus.mergeCycleId === 'x');
assert('status result read back', readStatus && readStatus.result === 'merged');

// ─── Cleanup ─────────────────────────────────────────────────────────────────

try { rmSync(tmpStateDir, { recursive: true, force: true }); } catch { /* */ }

console.log(`\n${tests - failures}/${tests} passed`);
if (failures > 0) {
  console.error('\u2717 stage 5 tests FAILED');
  process.exit(1);
} else {
  console.log('\u2705 stage 5 tests passed');
}
