// Stage 0 smoke test: proves the state layer round-trips.
//
// Run: node pipeline3/lib/stage0-smoke.test.mjs
//
// Uses a tmp dir via PIPELINE3_STATE_DIR so it never touches real state.
// Exits 0 on success, 1 on failure.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Set the state dir BEFORE importing paths.mjs so it picks up the override.
const tmpStateDir = mkdtempSync(join(tmpdir(), 'pipeline3-stage0-'));
process.env.PIPELINE3_STATE_DIR = tmpStateDir;

// Create subdirectories the modules expect.
mkdirSync(join(tmpStateDir, 'inbox'), { recursive: true });
mkdirSync(join(tmpStateDir, 'runs'), { recursive: true });

// Import after env is set so paths resolve to the tmp dir.
const { atomicWrite, atomicReadJSON } = await import('./atomic.mjs');
const { appendJournal, readJournal } = await import('./journal.mjs');
const { loadPolicy, loadGraph, saveGraph, emptyGraph, loadInbox, purgeInboxFile } = await import('./state.mjs');
const { policyPath, journalPath, graphPath, inboxDir } = await import('./paths.mjs');

let failures = 0;
let tests = 0;

function assert(name, cond) {
  tests++;
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
  }
}

function assertEqual(name, actual, expected) {
  tests++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

// --- 1. atomicWrite round-trip ---
console.log('\n1. atomicWrite round-trip');
{
  const filePath = join(tmpStateDir, 'test-write.txt');
  atomicWrite(filePath, 'hello pipeline3');
  const readBack = readFileSync(filePath, 'utf8');
  assertEqual('content matches after write+read', readBack, 'hello pipeline3');
}

// --- 2. atomicWrite under "concurrent" calls doesn't corrupt ---
console.log('\n2. atomicWrite concurrent calls');
{
  const filePath = join(tmpStateDir, 'concurrent.txt');
  for (let i = 0; i < 20; i++) {
    atomicWrite(filePath, `write-${i}`);
  }
  const readBack = readFileSync(filePath, 'utf8');
  assert('final content is intact (last write wins)', readBack === 'write-19');
}

// --- 3. atomicReadJSON fallback ---
console.log('\n3. atomicReadJSON fallback');
{
  const missingPath = join(tmpStateDir, 'does-not-exist.json');
  const result = atomicReadJSON(missingPath, { default: true });
  assertEqual('returns fallback on missing file', result, { default: true });

  const malformedPath = join(tmpStateDir, 'malformed.json');
  writeFileSync(malformedPath, '{ broken json');
  const result2 = atomicReadJSON(malformedPath, 42);
  assertEqual('returns fallback on malformed file', result2, 42);
}

// --- 4. appendJournal + readJournal round-trip ---
console.log('\n4. journal append + read');
{
  // Start with an empty journal file.
  writeFileSync(journalPath, '', { flag: 'w' });

  appendJournal({ type: 'bootstrap', at: '2026-07-23T05:00:00Z' });
  appendJournal({ type: 'claim', nodeId: 'n1', at: '2026-07-23T05:01:00Z' });
  appendJournal({ type: 'outcome', nodeId: 'n1', result: 'COMPLETE', at: '2026-07-23T05:02:00Z' });

  const events = readJournal();
  assertEqual('readJournal returns 3 events', events.length, 3);
  assertEqual('first event is bootstrap', events[0].type, 'bootstrap');
  assertEqual('second event is claim', events[1].type, 'claim');
  assertEqual('third event is outcome', events[2].type, 'outcome');
}

// --- 5. readJournal tolerates malformed lines ---
console.log('\n5. journal malformed line tolerance');
{
  // Append a malformed line directly.
  writeFileSync(journalPath, 'this is not json\n', { flag: 'a' });

  const events = readJournal();
  const last = events[events.length - 1];
  assert('malformed line returned as _unparseable, not thrown',
    last && typeof last === 'object' && '_unparseable' in last);
  assertEqual('raw content preserved in _unparseable', last._unparseable, 'this is not json');
}

// --- 6. readJournal skips blank lines ---
console.log('\n6. journal blank line skipping');
{
  writeFileSync(journalPath, '\n\n{ "type": "bootstrap" }\n\n', { flag: 'w' });
  const events = readJournal();
  assertEqual('blank lines skipped, 1 event', events.length, 1);
  assertEqual('event is bootstrap', events[0].type, 'bootstrap');
}

// --- 7. loadPolicy parses the committed policy.json ---
console.log('\n7. loadPolicy');
{
  // Write a policy.json matching the committed shape.
  const policy = {
    maxConcurrentSandboxes: 3,
    fairnessBudget: 3,
    maxAttemptsPerNode: 2,
    defaultTimeoutMin: 240,
    tickIntervalSeconds: 180,
    opencodeVersion: '1.17.20',
    trunkBranch: 'main',
    perClaimInstallCommand: 'npm ci',
    postMergeHook: null,
  };
  writeFileSync(policyPath, JSON.stringify(policy, null, 2));

  const loaded = loadPolicy();
  assertEqual('maxConcurrentSandboxes', loaded.maxConcurrentSandboxes, 3);
  assertEqual('opencodeVersion', loaded.opencodeVersion, '1.17.20');
  assertEqual('trunkBranch', loaded.trunkBranch, 'main');
  assertEqual('fairnessBudget', loaded.fairnessBudget, 3);
  assertEqual('postMergeHook', loaded.postMergeHook, null);
}

// --- 8. loadPolicy applies defaults for optional fields ---
console.log('\n8. loadPolicy defaults');
{
  const minimalPolicy = {
    maxConcurrentSandboxes: 2,
    opencodeVersion: '1.17.20',
    trunkBranch: 'main',
  };
  writeFileSync(policyPath, JSON.stringify(minimalPolicy, null, 2));

  const loaded = loadPolicy();
  assertEqual('fairnessBudget defaults to maxConcurrentSandboxes', loaded.fairnessBudget, 2);
  assertEqual('postMergeHook defaults to null', loaded.postMergeHook, null);
  assertEqual('perClaimInstallCommand defaults to null', loaded.perClaimInstallCommand, null);
}

// --- 9. loadPolicy throws on missing required field ---
console.log('\n9. loadPolicy required field validation');
{
  const badPolicy = { maxConcurrentSandboxes: 3, opencodeVersion: '1.17.20' };
  writeFileSync(policyPath, JSON.stringify(badPolicy, null, 2));

  let threw = false;
  try {
    loadPolicy();
  } catch (err) {
    threw = true;
    assert('error mentions trunkBranch', err.message.includes('trunkBranch'));
  }
  assert('throws on missing trunkBranch', threw);
}

// --- 10. saveGraph + loadGraph round-trip ---
console.log('\n10. graph save + load round-trip');
{
  const graph = emptyGraph();
  graph.runId = 'run-test-001';
  graph.paused = false;
  // One node shaped like mock-graph.json's node structure.
  graph.nodes.push({
    id: '7-1-create-story',
    skill: 'bmad-create-story',
    status: 'merged',
    dependsOn: [],
    mergeTo: 'main',
    attempts: 1,
    lastOutcome: 'COMPLETE',
    baseCommit: 'b82c11d',
    branch: 'pipeline/run-test-001/7-1-test',
    deadlineMin: 45,
  });

  saveGraph(graph);
  const loaded = loadGraph();

  assertEqual('runId round-trips', loaded.runId, 'run-test-001');
  assertEqual('nodes length is 1', loaded.nodes.length, 1);
  assertEqual('node id matches', loaded.nodes[0].id, '7-1-create-story');
  assertEqual('node mergeTo matches', loaded.nodes[0].mergeTo, 'main');
  assertEqual('node dependsOn matches', loaded.nodes[0].dependsOn, []);
  assert('generatedAt was set', typeof loaded.generatedAt === 'string' && loaded.generatedAt.length > 0);
}

// --- 11. loadGraph tolerates null runId ---
console.log('\n11. loadGraph tolerates null runId');
{
  const graph = emptyGraph();
  saveGraph(graph);
  const loaded = loadGraph();
  assertEqual('runId is null', loaded.runId, null);
  assertEqual('nodes is empty array', loaded.nodes, []);
}

// --- 12. loadGraph returns skeleton on missing file ---
console.log('\n12. loadGraph missing file → skeleton');
{
  const missingGraphPath = join(tmpStateDir, 'no-such-graph.json');
  const loaded = loadGraph(missingGraphPath);
  assert('returns skeleton (not null)', loaded !== null && typeof loaded === 'object');
  assertEqual('nodes is empty array', loaded.nodes, []);
  assertEqual('runId is null', loaded.runId, null);
}

// --- 13. loadGraph returns skeleton on malformed file ---
console.log('\n13. loadGraph malformed file → skeleton');
{
  const malformedGraphPath = join(tmpStateDir, 'malformed-graph.json');
  writeFileSync(malformedGraphPath, '{ broken');
  const loaded = loadGraph(malformedGraphPath);
  assert('returns skeleton on malformed', loaded !== null && typeof loaded === 'object');
  assertEqual('nodes is empty array', loaded.nodes, []);
}

// --- 14. loadInbox + purgeInboxFile ---
console.log('\n14. inbox load + purge');
{
  // loadInbox returns [] on empty/missing.
  const empty = loadInbox();
  assertEqual('empty inbox returns []', empty, []);

  // Write a file to inbox.
  writeFileSync(join(inboxDir, 'event-1.json'), '{"type":"test"}');
  writeFileSync(join(inboxDir, 'event-2.json'), '{"type":"test2"}');

  const files = loadInbox();
  assertEqual('inbox has 2 files', files.length, 2);

  purgeInboxFile('event-1.json');
  const after = loadInbox();
  assertEqual('inbox has 1 file after purge', after.length, 1);
  assertEqual('remaining file is event-2', after[0], 'event-2.json');
}

// --- 15. PIPELINE3_STATE_DIR override works ---
console.log('\n15. PIPELINE3_STATE_DIR override');
{
  // All paths should resolve under the tmp dir.
  assert('policyPath under tmp dir', policyPath.startsWith(tmpStateDir));
  assert('journalPath under tmp dir', journalPath.startsWith(tmpStateDir));
  assert('graphPath under tmp dir', graphPath.startsWith(tmpStateDir));
  assert('inboxDir under tmp dir', inboxDir.startsWith(tmpStateDir));
}

// --- cleanup ---
rmSync(tmpStateDir, { recursive: true, force: true });

// --- summary ---
console.log(`\n${tests - failures}/${tests} passed`);
if (failures > 0) {
  console.error(`\n❌ ${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log('\n✅ all tests passed');
  process.exit(0);
}
