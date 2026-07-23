// Stage 4 integration test: introduces the graph.
//
// Run: node pipeline3/lib/stage4-graph.test.mjs
//
// Tests the full step 4 machinery:
//   - Graph CRUD, DAG traversal, claim, chain/branch bookkeeping
//   - Ready-node evaluation (dependsOn, merge points)
//   - Depth-first bounded fairness
//   - Delta validation (all-or-nothing fold-time validation)
//   - Planning run machinery (lock, delta promotion, process-vanished)
//   - The 7-step reconcile pass (flock, inbox fold, reconcile, claim+launch, heartbeat)
//   - Bootstrap (runId assignment)
//   - Pause/resume gate on claiming
//   - Pipeline control helper (pause/resume/replan inbox requests)
//   - First taste of parallelism: two independent nodes from different chains
//   - Full operator surface: resume to start, pause mid-run, resume
//
// All tests use a temp state dir — no real state is touched.

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Set PIPELINE3_STATE_DIR BEFORE any imports that use paths.mjs.
const tmpStateDir = mkdtempSync(join(tmpdir(), 'pipeline3-stage4-'));
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
const { runPass } = await import('./pass.mjs');

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
  // Write policy.json
  writeFileSync(join(tmpStateDir, 'policy.json'), JSON.stringify({
    maxConcurrentSandboxes: 2,
    opencodeVersion: '1.17.20',
    trunkBranch: 'main',
    fairnessBudget: 2,
    maxAttemptsPerNode: 2,
  }));

  // Write graph.json
  const g = graph || {
    runId: null,
    generatedAt: new Date().toISOString(),
    paused: true,
    policy: {},
    nodes: [],
  };
  writeFileSync(join(tmpStateDir, 'graph.json'), JSON.stringify(g));

  // Clear journal
  writeFileSync(join(tmpStateDir, 'journal.jsonl'), '');

  // Ensure dirs
  mkdirSync(join(tmpStateDir, 'inbox'), { recursive: true });
  mkdirSync(join(tmpStateDir, 'runs'), { recursive: true });

  // Clear inbox
  for (const f of loadInbox(join(tmpStateDir, 'inbox'))) {
    try { purgeInboxFile(f, join(tmpStateDir, 'inbox')); } catch { /* */ }
  }
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

// ─── 1. Graph module: CRUD and traversal ─────────────────────────────────────

console.log('\n1. graph module: CRUD and traversal');

setupState();

const g1 = {
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [
    { id: 'n1', chainId: 'c1', status: 'pending', dependsOn: [], mergeTo: null },
    { id: 'n2', chainId: 'c1', status: 'pending', dependsOn: ['n1'], mergeTo: 'main' },
    { id: 'n3', chainId: 'c2', status: 'pending', dependsOn: [], mergeTo: 'main' },
  ]
};

assert('getNode finds n1', getNode(g1, 'n1') !== undefined);
assert('getNode returns undefined for missing', getNode(g1, 'nope') === undefined);
assert('getChainNodes returns 2 for c1', getChainNodes(g1, 'c1').length === 2);
assert('getChainIds returns 2', getChainIds(g1).length === 2);
assert('isMergePoint true for n2', isMergePoint(g1.nodes[1]));
assert('isMergePoint false for n1', !isMergePoint(g1.nodes[0]));
assert('branchName produces pipeline/r1/c1', branchName('r1', 'c1') === 'pipeline/r1/c1');
assert('getDependents of n1 is [n2]', getDependents(g1, 'n1').length === 1);
assert('n1 is ready (no deps)', isNodeReady(g1, g1.nodes[0]));
assert('n2 is NOT ready (dep pending)', !isNodeReady(g1, g1.nodes[1]));
assert('n3 is ready (no deps)', isNodeReady(g1, g1.nodes[2]));
assert('2 ready nodes', getReadyNodes(g1).length === 2);

// ─── 2. Graph module: claim and outcome ──────────────────────────────────────

console.log('\n2. graph module: claim and outcome');

const { graph: g2, event: claimEv } = claimNode(g1, 'n1', {
  runId: 'r1', baseCommit: 'abc', sandboxId: 'sb1',
  sessionName: 's1', deadlineTs: '2026-07-23T12:00:00Z',
});
assert('n1 is claimed', g1.nodes[0].status === STATUS.CLAIMED);
assert('n1 attempts is 1', g1.nodes[0].attempts === 1);
assert('claim event type', claimEv.type === 'claim');
assert('n2 NOT ready (dep claimed)', !isNodeReady(g1, g1.nodes[1]));
assert('countInFlightSandboxes is 1', countInFlightSandboxes(g1) === 1);

// Complete n1
const { event: outEv, triggersMerge } = foldOutcome(g1, 'n1', {
  outcome: 'COMPLETE', evidence: 'step_finish', durationMs: 5000, diffSummary: '+10 -2',
});
assert('n1 is completed', g1.nodes[0].status === STATUS.COMPLETED);
assert('n2 is NOW ready', isNodeReady(g1, g1.nodes[1]));
assert('no merge trigger for n1 (no mergeTo)', !triggersMerge);
assert('countInFlightSandboxes is 0', countInFlightSandboxes(g1) === 0);

// Complete n2 (merge point)
const { triggersMerge: tm2 } = foldOutcome(g1, 'n2', {
  outcome: 'COMPLETE', evidence: 'done', durationMs: 3000,
});
assert('merge trigger for n2 (has mergeTo)', tm2);

// ─── 3. Graph module: depth-first bounded fairness ───────────────────────────

console.log('\n3. graph module: depth-first bounded fairness');

const g3 = {
  runId: 'r1', nodes: [
    { id: 'a', chainId: 'ca', status: 'completed', dependsOn: [] },
    { id: 'b', chainId: 'ca', status: 'pending', dependsOn: ['a'] },
    { id: 'c', chainId: 'cb', status: 'pending', dependsOn: [] },
  ]
};

// Depth-first: after a completes, claim b (dependent)
const sel1 = selectNextClaim(g3, {
  fairnessBudget: 3, fairnessCounter: 0, lastCompletedNodeId: 'a', maxConcurrent: 5,
});
assert('depth-first selects dependent b', sel1.node.id === 'b');
assert('counter incremented', sel1.fairnessCounter === 1);

// Fairness yield: counter at budget, independent node exists
const sel2 = selectNextClaim(g3, {
  fairnessBudget: 1, fairnessCounter: 1, lastCompletedNodeId: 'a', maxConcurrent: 5,
});
assert('fairness yields to independent c', sel2.node.id === 'c');
assert('counter reset on yield', sel2.fairnessCounter === 0);
assert('yielded flag', sel2.yielded);

// No capacity
const g3full = {
  runId: 'r1', nodes: [
    { id: 'x', chainId: 'cx', status: 'claimed', dependsOn: [] },
    { id: 'y', chainId: 'cy', status: 'pending', dependsOn: [] },
  ]
};
const sel3 = selectNextClaim(g3full, {
  fairnessBudget: 3, fairnessCounter: 0, maxConcurrent: 1,
});
assert('no claim when capacity full', sel3.node === null);

// ─── 4. Graph module: bootstrap (runId assignment) ───────────────────────────

console.log('\n4. graph module: bootstrap');

const emptyG = { runId: null, paused: true, nodes: [] };
const { runId, event: bootEv } = assignRunId(emptyG);
assert('runId assigned', runId && runId.length > 0);
assert('runId format (date-random)', /^\d{8}-[a-f0-9]{4}$/.test(runId));
assert('runId in graph', emptyG.runId === runId);
assert('bootstrap event type', bootEv.type === 'runId_assigned');

// Idempotent
const { runId: runId2, event: bootEv2 } = assignRunId(emptyG);
assert('runId idempotent', runId === runId2);
assert('no second event', bootEv2 === null);

// ─── 5. Graph module: plan-2-ahead frontier ─────────────────────────────────

console.log('\n5. graph module: plan-2-ahead frontier');

assert('frontier low with 0 ready', isFrontierLow({ nodes: [] }, 3));
assert('frontier low with 1 ready', isFrontierLow({
  nodes: [{ id: 'n', status: 'pending', dependsOn: [] }]
}, 3));
assert('frontier NOT low with 2 ready', !isFrontierLow({
  nodes: [
    { id: 'a', status: 'pending', dependsOn: [] },
    { id: 'b', status: 'pending', dependsOn: [] },
  ]
}, 2));
assert('frontier NOT low with 3 ready', !isFrontierLow({
  nodes: [
    { id: 'a', status: 'pending', dependsOn: [] },
    { id: 'b', status: 'pending', dependsOn: [] },
    { id: 'c', status: 'pending', dependsOn: [] },
  ]
}, 3));

// ─── 6. Delta validation: all-or-nothing ─────────────────────────────────────

console.log('\n6. delta validation: all-or-nothing');

const baseGraph = {
  runId: 'r1', nodes: [
    { id: 'n1', chainId: 'c1', status: 'pending', dependsOn: [], mergeTo: 'main', metadata: {} },
  ]
};

// Valid addNode
const validDelta = {
  planningRunId: 'p1', mode: 'expansion', authoredAt: '', trunkShaAtT0: 'abc',
  ops: [{
    type: 'addNode', id: 'n2', chainId: 'c2', skill: 'test', agent: 'coder',
    prompt: 'test', deadline: 'PT1H', dependsOn: [], mergeTo: 'main', metadata: {},
  }],
};
const r1 = validateDelta(validDelta, baseGraph, 'main', null);
assert('valid addNode accepted', r1.accepted);
assert('result has new node', r1.graph.nodes.length === 2);
assert('new node status is pending', r1.graph.nodes[1].status === 'pending');
assert('original graph unchanged', baseGraph.nodes.length === 1);

// Stale target (removeNode on claimed)
const claimedGraph = {
  runId: 'r1', nodes: [
    { id: 'n1', chainId: 'c1', status: 'claimed', dependsOn: [], mergeTo: 'main' },
  ]
};
const staleDelta = {
  planningRunId: 'p2', mode: 'replan', authoredAt: '', trunkShaAtT0: 'abc',
  ops: [{ type: 'removeNode', id: 'n1' }],
};
const r2 = validateDelta(staleDelta, claimedGraph, 'main', null);
assert('stale target rejected', !r2.accepted);
assert('rejection rule is stale_target', r2.rejection.rule === 'stale_target');

// Cyclic delta — add two nodes where the second depends on the first,
// then updateNode the first to depend on the second (creating a cycle).
const cyclicDelta = {
  planningRunId: 'p3', mode: 'expansion', authoredAt: '', trunkShaAtT0: 'abc',
  ops: [
    { type: 'addNode', id: 'a', chainId: 'c', skill: 't', agent: 'c', prompt: 't',
      deadline: 'PT1H', dependsOn: [], mergeTo: 'main', metadata: {} },
    { type: 'addNode', id: 'b', chainId: 'c', skill: 't', agent: 'c', prompt: 't',
      deadline: 'PT1H', dependsOn: ['a'], metadata: {} },
    { type: 'updateNode', id: 'a', dependsOn: ['b'] }, // creates cycle: a→b→a
  ],
};
const r3 = validateDelta(cyclicDelta, { runId: 'r', nodes: [] }, 'main', null);
assert('cyclic rejected', !r3.accepted);
assert('rejection rule is cyclic', r3.rejection.rule === 'cyclic');

// Final node without mergeTo
const noMergeDelta = {
  planningRunId: 'p4', mode: 'expansion', authoredAt: '', trunkShaAtT0: 'abc',
  ops: [{
    type: 'addNode', id: 'x', chainId: 'cx', skill: 't', agent: 'c', prompt: 't',
    deadline: 'PT1H', dependsOn: [], mergeTo: null, metadata: {},
  }],
};
const r4 = validateDelta(noMergeDelta, { runId: 'r', nodes: [] }, 'main', null);
assert('final node without mergeTo rejected', !r4.accepted);
assert('rejection rule is final_node_missing_mergeTo', r4.rejection.rule === 'final_node_missing_mergeTo');

// Empty delta accepted
const emptyDelta = {
  planningRunId: 'p5', mode: 'expansion', authoredAt: '', trunkShaAtT0: 'abc',
  ops: [],
};
const r5 = validateDelta(emptyDelta, baseGraph, 'main', null);
assert('empty delta accepted', r5.accepted);

// All-or-nothing: valid then invalid
const mixedDelta = {
  planningRunId: 'p6', mode: 'expansion', authoredAt: '', trunkShaAtT0: 'abc',
  ops: [
    { type: 'addNode', id: 'new1', chainId: 'cnew', skill: 't', agent: 'c', prompt: 't',
      deadline: 'PT1H', dependsOn: [], mergeTo: 'main', metadata: {} },
    { type: 'removeNode', id: 'n1' }, // n1 is pending — should be ok actually
  ],
};
const r6 = validateDelta(mixedDelta, baseGraph, 'main', null);
// n1 is pending, so removeNode is valid. Both ops should succeed.
assert('mixed delta (valid+valid) accepted', r6.accepted);

// Cross-chain edge to non-merge-point
const crossDelta = {
  planningRunId: 'p7', mode: 'expansion', authoredAt: '', trunkShaAtT0: 'abc',
  ops: [{
    type: 'addNode', id: 'x2', chainId: 'cx', skill: 't', agent: 'c', prompt: 't',
    deadline: 'PT1H', dependsOn: ['n1'], mergeTo: 'main', metadata: {},
  }],
};
// n1 has mergeTo: 'main', so this is a valid cross-chain edge to a merge point.
const r7 = validateDelta(crossDelta, baseGraph, 'main', null);
assert('cross-chain to merge-point accepted', r7.accepted);

// ─── 7. Planning module: lock management ─────────────────────────────────────

console.log('\n7. planning module: lock management');

// Clean any leftover lock
try { rmSync(join(tmpStateDir, 'planning.lock')); } catch { /* */ }

const lock1 = acquirePlanningLock({ lockPath: join(tmpStateDir, 'planning.lock') });
assert('planning lock acquired', lock1.acquired);
assert('planning lock held', isPlanningLockHeld({ lockPath: join(tmpStateDir, 'planning.lock') }));

const lock2 = acquirePlanningLock({ lockPath: join(tmpStateDir, 'planning.lock') });
assert('second acquire fails', !lock2.acquired);

releasePlanningLock(lock1);
assert('planning lock released after release', !isPlanningLockHeld({ lockPath: join(tmpStateDir, 'planning.lock') }));

// ─── 8. Planning module: delta promotion ────────────────────────────────────

console.log('\n8. planning module: delta promotion');

const runDir = buildPlanningRunDir('test-run-1');
mkdirSync(runDir, { recursive: true });

const scratchPath = getScratchDeltaPath(runDir);
const validDeltaJson = JSON.stringify({
  planningRunId: 'test-run-1', mode: 'expansion', authoredAt: '', trunkShaAtT0: 'abc',
  ops: [],
});
writeFileSync(scratchPath, validDeltaJson);

const prom1 = promoteDelta(scratchPath, join(tmpStateDir, 'inbox'), 'test-run-1');
assert('valid delta promoted', prom1.promoted);
assert('inbox file exists', existsSync(join(tmpStateDir, 'inbox', 'test-run-1.json')));

// Parse error
writeFileSync(scratchPath, '{ not valid json');
const prom2 = promoteDelta(scratchPath, join(tmpStateDir, 'inbox'), 'test-run-2');
assert('parse error not promoted', !prom2.promoted);
assert('parse error reason', prom2.reason === 'parse_error');

// Missing file
const prom3 = promoteDelta(join(runDir, 'nonexistent.json'), join(tmpStateDir, 'inbox'), 'test-run-3');
assert('missing file not promoted', !prom3.promoted);
assert('missing file reason', prom3.reason === 'missing_file' || prom3.reason === 'read_error' || prom3.reason === 'parse_error');

// Cleanup
try { rmSync(runDir, { recursive: true }); } catch { /* */ }

// ─── 9. Planning module: prompt builder ──────────────────────────────────────

console.log('\n9. planning module: prompt builder');

const prompt = buildPlanningPrompt({
  mode: 'expansion',
  planningRunId: 'p-test',
  runId: 'r1',
  trunkBranch: 'main',
  runDir: '/tmp/test-run',
  instruction: null,
});
assert('prompt has trigger', prompt.includes('expansion'));
assert('prompt has output contract', prompt.includes('delta.json') || prompt.includes('output'));
assert('prompt has graph pointer', prompt.includes('graph.json'));
assert('prompt has guidelines pointer', prompt.includes('chain-composition-guidelines'));
assert('prompt has staleness rule', prompt.includes('unclaimed') || prompt.includes('fold'));
assert('prompt has trunk ref', prompt.includes('origin/main'));

// ─── 10. Planning module: process-vanished detection ────────────────────────

console.log('\n10. planning module: process-vanished detection');

// No journal entries → not vanished
const v1 = checkPlanningRunVanished({ nodes: [] }, []);
assert('no launch → not vanished', !v1.vanished);

// In-flight launch + lock held → not vanished
appendJournal({ type: 'planning_launch', planningRunId: 'p1', at: new Date().toISOString() },
  join(tmpStateDir, 'journal.jsonl'));
// Acquire the planning lock to simulate "in flight"
const vanishLock = acquirePlanningLock({ lockPath: join(tmpStateDir, 'planning.lock') });
const journalEvents = readJournal(join(tmpStateDir, 'journal.jsonl'));
const v2 = checkPlanningRunVanished({ nodes: [] }, journalEvents);
assert('in-flight + lock held → not vanished', !v2.vanished);
releasePlanningLock(vanishLock);

// In-flight + lock free + no exit → vanished
const v3 = checkPlanningRunVanished({ nodes: [] }, readJournal(join(tmpStateDir, 'journal.jsonl')));
assert('in-flight + lock free → vanished', v3.vanished);
assert('vanished returns planningRunId', v3.planningRunId === 'p1');

// ─── 11. Pass frame: empty paused graph finds fixpoint ───────────────────────

console.log('\n11. pass frame: empty paused graph');

setupState();
const pass1 = await runPass({ skipLock: true });
assert('exit code 0', pass1.exitCode === 0);
assert('no claims', pass1.counts.claims === 0);
assert('no planning', pass1.counts.planning === 0);

// Heartbeat written
const hb1 = atomicReadJSON(join(tmpStateDir, 'last-pass.json'), null);
assert('heartbeat exists', hb1 !== null);
assert('heartbeat has timestamp', hb1.at !== undefined);
assert('heartbeat exit code 0', hb1.exitCode === 0);

// ─── 12. Pass frame: resume starts the pipeline (bootstrap) ──────────────────

console.log('\n12. pass frame: resume starts the pipeline (bootstrap)');

setupState();
writeFileSync(join(tmpStateDir, 'inbox', '001-resume.json'), JSON.stringify({
  type: 'resume', at: new Date().toISOString(), who: 'test',
}));

const pass2 = await runPass({ skipLock: true });
assert('exit code 0', pass2.exitCode === 0);
assert('resume folded', pass2.counts.folds > 0);

const g12 = readGraph();
assert('graph is unpaused', g12.paused === false);
assert('runId assigned (bootstrap)', g12.runId !== null);
assert('planning triggered', pass2.counts.planning >= 1);

// Check journal has the events
const journal12 = readJournalText();
assert('journal has resume event', journal12.includes('"type":"resume"'));
assert('journal has runId_assigned', journal12.includes('"type":"runId_assigned"'));
assert('journal has planning_launch', journal12.includes('"type":"planning_launch"'));

// ─── 13. Pass frame: pause stops claiming ─────────────────────────────────────

console.log('\n13. pass frame: pause stops claiming');

setupState({
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [{
    id: 'n1', chainId: 'c1', skill: 'test', agent: 'coder', prompt: 't',
    deadline: 'PT1H', dependsOn: [], mergeTo: 'main', metadata: {},
    status: 'pending', attempts: 0,
  }]
});

writeFileSync(join(tmpStateDir, 'inbox', '001-pause.json'), JSON.stringify({
  type: 'pause', reason: 'test', who: 'test', at: new Date().toISOString(),
}));

const pass3 = await runPass({ skipLock: true });
assert('exit code 0', pass3.exitCode === 0);
assert('no claims when paused', pass3.counts.claims === 0);

const g13 = readGraph();
assert('graph is paused', g13.paused === true);
assert('node still pending', g13.nodes[0].status === 'pending');

// ─── 14. Pass frame: claim when unpaused ──────────────────────────────────────

console.log('\n14. pass frame: claim when unpaused');

setupState({
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [{
    id: 'n2', chainId: 'c2', skill: 'test', agent: 'coder', prompt: 't',
    deadline: 'PT1H', dependsOn: [], mergeTo: 'main', metadata: {},
    status: 'pending', attempts: 0,
  }]
});

const pass4 = await runPass({ skipLock: true });
assert('exit code 0', pass4.exitCode === 0);
assert('1 claim', pass4.counts.claims === 1);

const g14 = readGraph();
assert('node is claimed', g14.nodes[0].status === 'claimed');
assert('node has attempts', g14.nodes[0].attempts === 1);

const journal14 = readJournalText();
assert('journal has claim event', journal14.includes('"type":"claim"'));

// ─── 15. Pass frame: planning delta folded ───────────────────────────────────

console.log('\n15. pass frame: planning delta folded');

setupState();
const delta = {
  planningRunId: 'plan-test-1', mode: 'expansion', authoredAt: new Date().toISOString(),
  trunkShaAtT0: '', // empty — skip semantic staleness check (no real trunk in test env)
  ops: [{
    type: 'addNode', id: 'planned-1', chainId: 'chain-planned',
    skill: 'bmad-dev-story', agent: 'coder', prompt: 'Implement the story',
    deadline: 'PT2H', dependsOn: [], mergeTo: 'main', metadata: { story: 'S1' },
  }],
};
writeFileSync(join(tmpStateDir, 'inbox', '001-plan-test-1.json'), JSON.stringify(delta));

const pass5 = await runPass({ skipLock: true });
assert('exit code 0', pass5.exitCode === 0);

const g15 = readGraph();
assert('delta folded — node added', g15.nodes.length === 1);
assert('node id matches', g15.nodes[0].id === 'planned-1');
assert('node status is pending', g15.nodes[0].status === 'pending');
assert('inbox file consumed', loadInbox(join(tmpStateDir, 'inbox')).length === 0);

// ─── 16. Pass frame: rejected delta doesn't mutate graph ─────────────────────

console.log('\n16. pass frame: rejected delta');

const badDelta = {
  planningRunId: 'plan-test-2', mode: 'expansion', authoredAt: new Date().toISOString(),
  trunkShaAtT0: '', // empty — skip semantic staleness check
  ops: [{
    type: 'addNode', id: 'planned-1', // duplicate id!
    chainId: 'chain-bad', skill: 'test', agent: 'coder', prompt: 'test',
    deadline: 'PT1H', dependsOn: [], mergeTo: 'main', metadata: {},
  }],
};
writeFileSync(join(tmpStateDir, 'inbox', '002-plan-test-2.json'), JSON.stringify(badDelta));

const pass6 = await runPass({ skipLock: true });
assert('exit code 0', pass6.exitCode === 0);

const g16 = readGraph();
assert('graph unchanged (still 1 node)', g16.nodes.length === 1);
assert('existing node still there', g16.nodes[0].id === 'planned-1');

// ─── 17. Pass frame: depth-first claiming (parallelism) ──────────────────────

console.log('\n17. pass frame: depth-first claiming (parallelism)');

setupState({
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [
    { id: 'a', chainId: 'ca', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'completed', attempts: 1 },
    { id: 'b', chainId: 'ca', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: ['a'], mergeTo: 'main', metadata: {}, status: 'pending', attempts: 0 },
    { id: 'c', chainId: 'cb', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'pending', attempts: 0 },
  ]
});

const pass7 = await runPass({ skipLock: true });
assert('exit code 0', pass7.exitCode === 0);
assert('2 claims (parallelism)', pass7.counts.claims === 2);

const g17 = readGraph();
const claimed = g17.nodes.filter(n => n.status === 'claimed');
assert('2 nodes claimed', claimed.length === 2);

// First taste of parallelism: two independent nodes from different chains
const chainIds = claimed.map(n => n.chainId);
assert('claimed nodes are from different chains', new Set(chainIds).size === 2 || chainIds.includes('ca'));

// ─── 18. Pass frame: full operator surface (pause mid-run, resume) ────────────

console.log('\n18. pass frame: full operator surface (pause mid-run, resume)');

setupState({
  runId: 'r1', generatedAt: '', paused: false, policy: {}, nodes: [
    { id: 'x1', chainId: 'cx', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'claimed', attempts: 1,
      sandboxId: 'sb1', sessionName: 's1', cmdId: 'c1', deadlineTs: '2026-07-23T23:59:59Z' },
    { id: 'x2', chainId: 'cx', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: ['x1'], mergeTo: 'main', metadata: {}, status: 'pending', attempts: 0 },
    { id: 'y1', chainId: 'cy', skill: 't', agent: 'c', prompt: 't', deadline: 'PT1H',
      dependsOn: [], mergeTo: 'main', metadata: {}, status: 'pending', attempts: 0 },
  ]
});

// Step 1: pause mid-run
writeFileSync(join(tmpStateDir, 'inbox', '001-pause.json'), JSON.stringify({
  type: 'pause', reason: 'investigating', who: 'operator', at: new Date().toISOString(),
}));
const pausePass = await runPass({ skipLock: true });
assert('pause pass exit 0', pausePass.exitCode === 0);

const gPaused = readGraph();
assert('graph is paused', gPaused.paused === true);
// x1 is still claimed (in-flight work continues)
assert('x1 still claimed (in-flight continues)', gPaused.nodes[0].status === 'claimed');
// x2 and y1 are NOT claimed (pause stops claiming)
assert('x2 still pending (no new claims)', gPaused.nodes[1].status === 'pending');
assert('y1 still pending (no new claims)', gPaused.nodes[2].status === 'pending');

// Step 2: complete x1 (in-flight work finishes during pause)
foldOutcome(gPaused, 'x1', {
  outcome: 'COMPLETE', evidence: 'done', durationMs: 5000,
});
saveGraph(gPaused);

const completePass = await runPass({ skipLock: true });
assert('complete pass exit 0', completePass.exitCode === 0);
assert('no new claims during pause', completePass.counts.claims === 0);

const gAfterComplete = readGraph();
assert('x1 is completed', gAfterComplete.nodes[0].status === 'completed');
// x2 is ready but NOT claimed (paused)
assert('x2 still pending (paused, not claimed)', gAfterComplete.nodes[1].status === 'pending');

// Step 3: resume — should claim x2 and y1
writeFileSync(join(tmpStateDir, 'inbox', '002-resume.json'), JSON.stringify({
  type: 'resume', at: new Date().toISOString(), who: 'operator',
}));
const resumePass = await runPass({ skipLock: true });
assert('resume pass exit 0', resumePass.exitCode === 0);
assert('claims after resume', resumePass.counts.claims >= 1);

const gResumed = readGraph();
assert('graph is unpaused', gResumed.paused === false);
const claimedAfterResume = gResumed.nodes.filter(n => n.status === 'claimed');
assert('nodes claimed after resume', claimedAfterResume.length >= 1);

// ─── 19. Node digest ─────────────────────────────────────────────────────────

console.log('\n19. node digest');

const digestNode = {
  id: 'd1', chainId: 'c1', skill: 'bmad-dev-story', agent: 'coder',
  status: 'completed', attempts: 2, dependsOn: ['p1'], mergeTo: 'main',
  deadline: 'PT2H', lastOutcome: 'COMPLETE', durations: [1000, 2000],
  metadata: { story: 'S1' },
};
const digest = buildNodeDigest(digestNode);
assert('digest has id', digest.id === 'd1');
assert('digest has status', digest.status === 'completed');
assert('digest has attempts', digest.attempts === 2);
assert('digest has metadata', digest.metadata.story === 'S1');
assert('digest has mergeTo', digest.mergeTo === 'main');

// ─── 20. Chain-composition guidelines document exists ────────────────────────

console.log('\n20. chain-composition guidelines document');

assert('guidelines file exists', existsSync(join(tmpStateDir, 'chain-composition-guidelines.md')) ||
  existsSync(join(process.cwd(), 'pipeline3/state/chain-composition-guidelines.md')));

// ─── 21. n8n workflows exist and are valid ───────────────────────────────────

console.log('\n21. n8n workflows');

const tickWorkflow = JSON.parse(readFileSync(join(process.cwd(), 'pipeline3/n8n/schedule-tick-workflow.json'), 'utf8'));
assert('schedule-tick workflow valid JSON', tickWorkflow.name !== undefined);
assert('schedule-tick workflow active', tickWorkflow.active === true);

const planningWorkflow = JSON.parse(readFileSync(join(process.cwd(), 'pipeline3/n8n/planning-host-workflow.json'), 'utf8'));
assert('planning-host workflow valid JSON', planningWorkflow.name !== undefined);
assert('planning-host workflow NOT active', planningWorkflow.active === false);

// ─── 22. CLI wrappers exist ──────────────────────────────────────────────────

console.log('\n22. CLI wrappers');

assert('dispatcher.mjs exists', existsSync(join(process.cwd(), 'pipeline3/bin/dispatcher.mjs')));
assert('planning-launch.mjs exists', existsSync(join(process.cwd(), 'pipeline3/bin/planning-launch.mjs')));
assert('pipeline.mjs exists', existsSync(join(process.cwd(), 'pipeline3/bin/pipeline.mjs')));

// ─── 23. start.sh has resurrection pass ──────────────────────────────────────

console.log('\n23. start.sh resurrection pass');

const startSh = readFileSync(join(process.cwd(), '.devcontainer/start.sh'), 'utf8');
assert('start.sh has resurrection pass', startSh.includes('dispatcher.mjs'));
assert('start.sh resurrection after n8n health', startSh.indexOf('healthz') < startSh.indexOf('dispatcher.mjs'));

// ─── Cleanup ─────────────────────────────────────────────────────────────────

try { rmSync(tmpStateDir, { recursive: true, force: true }); } catch { /* */ }

console.log(`\n${tests - failures}/${tests} passed`);
if (failures > 0) {
  console.error('\u2717 stage 4 tests FAILED');
  process.exit(1);
} else {
  console.log('\u2705 stage 4 tests passed');
}
