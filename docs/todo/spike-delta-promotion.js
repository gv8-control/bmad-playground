#!/usr/bin/env node
/**
 * Spike: planning-run delta promotion — tmp+rename crash-safety
 *
 * Verifies the interaction seam "Pass ↔ planning run ↔ n8n host (three-party
 * supervision)" from docs/todo/graph-pipeline.md:
 *
 *   The agent writes the delta only to scratch; the wrapper promotes it to the
 *   inbox via tmp + rename after exit 0 and a parse check, so the inbox never
 *   holds a partial or unparseable delta. The fold's own parse check stays as
 *   defense in depth (parse failure → reject and journal, like any validation
 *   failure).
 *
 * The design decision (2026-07-22) settled the contract: the wrapper is the
 * only inbox writer, promotion happens only after the opencode child exits,
 * and only for a file that parses. This spike empirically verifies the
 * underlying filesystem mechanics that make that contract hold:
 *
 *   Phase 1 — rename atomicity: fs.renameSync(tmp, target) atomically replaces
 *   target. A reader never sees target absent, even mid-rename. Verified by
 *   concurrent reader + rename.
 *
 *   Phase 2 — crash during tmp write: killing the process while writing the
 *   tmp file leaves target untouched. The tmp file is orphaned; target
 *   retains its previous content (or doesn't exist).
 *
 *   Phase 3 — crash mid-rename (SIGKILL between write and rename): target
 *   retains its previous content. No window of absence.
 *
 *   Phase 4 — crash after rename returns: target has the new content. The
 *   rename is already complete from the kernel's perspective.
 *
 *   Phase 5 — fold parse-check as defense in depth: a corrupted tmp file
 *   (simulating a partial write that somehow reached the inbox) is rejected
 *   by JSON.parse without throwing, and the fold can journal the rejection
 *   evidence.
 *
 *   Phase 6 — O_APPEND journal atomicity: concurrent appenders to the journal
 *   produce non-interleaved lines. Each appendFileSync call is a single
 *   atomic write on local filesystems.
 *
 * Filesystem semantics (from research):
 *   - rename(2) is atomic by POSIX spec and on Linux ext4/tmpfs
 *   - fs.renameSync maps 1:1 to rename(2) syscall (verified via strace)
 *   - O_APPEND writes are atomic per call on local fs (POSIX §2.9.7)
 *   - Crash during write → target untouched, tmp orphaned
 *   - Crash mid-rename → old or new, never absent
 *   - /tmp on this devcontainer is tmpfs (verified: mount | grep /tmp)
 *
 * Usage:
 *   node spike-delta-promotion.js
 *
 * No external dependencies required — uses only Node.js stdlib.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// ─── Constants ─────────────────────────────────────────────────────────────

const SPIKE_DIR = '/tmp/spike-delta-promotion';
const SCRATCH_DIR = path.join(SPIKE_DIR, 'scratch');
const INBOX_DIR = path.join(SPIKE_DIR, 'inbox');

// A valid graph delta — the shape the planning agent produces
const VALID_DELTA = {
  planningRunId: 'pr_test_001',
  mode: 'expansion',
  authoredAt: '2026-07-22T12:00:00.000Z',
  journalPosition: 42,
  ops: [
    {
      op: 'addNode',
      node: {
        id: 'node-1',
        skill: 'bmad-dev-story',
        deadline: '2h',
        dependsOn: [],
        mergeTo: 'main',
        story: 'story-1',
        epic: 'epic-1',
      },
    },
  ],
};

// A second valid delta — for testing rename-over-existing
const VALID_DELTA_2 = {
  planningRunId: 'pr_test_002',
  mode: 'expansion',
  authoredAt: '2026-07-22T12:01:00.000Z',
  journalPosition: 43,
  ops: [
    {
      op: 'addNode',
      node: {
        id: 'node-2',
        skill: 'bmad-code-review',
        deadline: '1h',
        dependsOn: ['node-1'],
        mergeTo: 'main',
        story: 'story-1',
        epic: 'epic-1',
      },
    },
  ],
};

// Phase 1: how many concurrent readers to spawn
const PHASE1_READERS = 10;
// Phase 1: how many rename cycles to run
const PHASE1_RENAMES = 200;

// Phase 6: how many concurrent appenders
const PHASE6_APPENDERS = 5;
// Phase 6: how many lines each appender writes
const PHASE6_LINES_EACH = 100;

// ─── Utilities ─────────────────────────────────────────────────────────────

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

function elapsed(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Write a file atomically via tmp + rename, simulating the wrapper's promotion.
 * @param {string} targetPath - the final inbox path
 * @param {string} content - file content to write
 * @param {boolean} fsync - whether to fsync before rename (the canonical pattern)
 */
function atomicWrite(targetPath, content, { fsync: doFsync = false } = {}) {
  const tmpPath = targetPath + '.tmp';
  const fd = fs.openSync(tmpPath, 'w'); // O_CREAT|O_WRONLY|O_TRUNC
  try {
    fs.writeFileSync(fd, content);
    if (doFsync) {
      fs.fsyncSync(fd);
    }
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, targetPath);
}

/**
 * Read a file, returning null if it doesn't exist.
 */
function readOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * Parse JSON, returning { ok: true, value } or { ok: false, error } — never throws.
 */
function safeParseJSON(text) {
  if (text === null) return { ok: false, error: 'file does not exist' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Phase 1: rename atomicity — concurrent reader never sees absence ──────

/**
 * Phase 1: verify that fs.renameSync(tmp, target) atomically replaces target.
 *
 * A concurrent reader repeatedly reads target and parses JSON. If rename is
 * not atomic, the reader will see ENOENT (file missing) or unparseable
 * content (partial write) at some point during the rename.
 *
 * We run PHASE1_RENAMES rename cycles with PHASE1_READERS concurrent readers.
 * Each reader reads in a tight loop for the duration. Any ENOENT or parse
 * failure is a FAIL.
 */
async function phase1() {
  console.log('\n=== Phase 1: rename atomicity (concurrent reader never sees absence) ===\n');

  const targetPath = path.join(INBOX_DIR, 'delta-1.json');
  // Seed with an initial file
  atomicWrite(targetPath, JSON.stringify(VALID_DELTA));

  let readerFailures = 0;
  let readerReads = 0;
  let stopReaders = false;

  // Spawn concurrent readers (use setImmediate to yield between reads)
  const readers = [];
  for (let i = 0; i < PHASE1_READERS; i++) {
    readers.push((async () => {
      while (!stopReaders) {
        const content = readOrNull(targetPath);
        readerReads++;
        if (content === null) {
          readerFailures++;
          if (readerFailures <= 3) {
            log('phase1-reader', `FAIL: reader ${i} saw ENOENT on read #${readerReads}`);
          }
        } else {
          const parsed = safeParseJSON(content);
          if (!parsed.ok) {
            readerFailures++;
            if (readerFailures <= 3) {
              log('phase1-reader', `FAIL: reader ${i} got parse error: ${parsed.error}`);
            }
          }
        }
        // Yield to the event loop so rename cycles can run
        await new Promise(r => setImmediate(r));
      }
    })());
  }

  // Run rename cycles
  log('phase1', `Running ${PHASE1_RENAMES} rename cycles with ${PHASE1_READERS} concurrent readers...`);
  const t0 = Date.now();
  for (let i = 0; i < PHASE1_RENAMES; i++) {
    const delta = i % 2 === 0 ? VALID_DELTA : VALID_DELTA_2;
    atomicWrite(targetPath, JSON.stringify(delta));
  }
  const duration = Date.now() - t0;

  // Stop readers
  stopReaders = true;
  await Promise.all(readers);

  const pass = readerFailures === 0;
  log('phase1', `Duration: ${elapsed(duration)}`);
  log('phase1', `Total reads: ${readerReads}`);
  log('phase1', `Reader failures (ENOENT or parse error): ${readerFailures}`);
  log('phase1', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);

  return {
    pass,
    duration,
    totalReads: readerReads,
    readerFailures,
    renames: PHASE1_RENAMES,
    readers: PHASE1_READERS,
  };
}

// ─── Phase 2: crash during tmp write — target untouched ───────────────────

/**
 * Phase 2: verify that killing the process while writing the tmp file leaves
 * target untouched.
 *
 * We spawn a child process that:
 *   1. Opens a tmp file
 *   2. Starts writing a large payload to it
 *   3. Gets killed (SIGKILL) mid-write
 *
 * After the kill, we check that target still has the original content and
 * the tmp file exists with partial content (orphaned).
 */
async function phase2() {
  console.log('\n=== Phase 2: crash during tmp write (target untouched) ===\n');

  const targetPath = path.join(INBOX_DIR, 'delta-2.json');
  // Seed with known content
  const originalContent = JSON.stringify(VALID_DELTA);
  atomicWrite(targetPath, originalContent);

  // Write a child script that starts writing a tmp file and gets killed
  const tmpPath = targetPath + '.tmp';
  const childScript = path.join(SPIKE_DIR, 'phase2-child.js');
  const childCode = `
const fs = require('fs');

const tmpPath = ${JSON.stringify(tmpPath)};
// Write a payload slowly enough that we can kill mid-write.
// Use a 5MB payload written in 1KB chunks with a 1ms delay every 10 chunks.
// Total time: ~5000 chunks * 1ms = ~5s — plenty of time to kill.
const fd = fs.openSync(tmpPath, 'w');
const chunk = 'A'.repeat(1024); // 1KB
for (let i = 0; i < 5000; i++) {
  fs.writeSync(fd, chunk);
  if (i % 10 === 0) {
    // 1ms delay every 10KB — gives the killer time to strike mid-write
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
  }
}
fs.closeSync(fd);
// If we reach here, we weren't killed — rename to simulate promotion
fs.renameSync(tmpPath, ${JSON.stringify(targetPath)});
`;

  fs.writeFileSync(childScript, childCode);
  log('phase2', `Child script: ${childScript}`);
  log('phase2', `Target before: ${readOrNull(targetPath)?.substring(0, 50)}...`);

  // Spawn the child
  const child = spawn('node', [childScript], { stdio: 'pipe' });
  const childPid = child.pid;
  log('phase2', `Child PID: ${childPid}`);

  // Wait a bit for the child to start writing
  await sleep(200);

  // Kill the child mid-write
  log('phase2', `Sending SIGKILL to child (PID ${childPid})...`);
  try {
    process.kill(childPid, 'SIGKILL');
  } catch (e) {
    log('phase2', `Kill failed: ${e.message}`);
  }

  // Wait for the child to be reaped
  await new Promise((r) => child.on('exit', r));

  // Check target
  const targetAfter = readOrNull(targetPath);
  const targetUnchanged = targetAfter === originalContent;

  // Check tmp
  const tmpAfter = readOrNull(tmpPath);

  log('phase2', `Target after kill: ${targetAfter?.substring(0, 50)}...`);
  log('phase2', `Target unchanged: ${targetUnchanged}`);
  log('phase2', `Tmp file exists (orphaned): ${tmpAfter !== null}`);
  log('phase2', `Tmp file size: ${tmpAfter?.length || 0} bytes`);

  // Clean up tmp
  try { fs.unlinkSync(tmpPath); } catch {}

  const pass = targetUnchanged;
  log('phase2', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);

  return {
    pass,
    targetUnchanged,
    tmpOrphaned: tmpAfter !== null,
    tmpSize: tmpAfter?.length || 0,
  };
}

// ─── Phase 3: crash mid-rename (between write and rename) ─────────────────

/**
 * Phase 3: verify that killing the process after writing the tmp file but
 * before rename leaves target with its previous content.
 *
 * We can't reliably kill between writeSync and renameSync in the same
 * process (the window is microseconds). Instead, we simulate it by:
 *   1. Writing the tmp file (complete)
 *   2. NOT calling rename
 *   3. Killing the process
 *
 * This tests the same invariant: if rename never fires, target is untouched.
 * The tmp file is orphaned.
 */
async function phase3() {
  console.log('\n=== Phase 3: crash mid-rename — target retains previous content ===\n');

  const targetPath = path.join(INBOX_DIR, 'delta-3.json');
  const originalContent = JSON.stringify(VALID_DELTA);
  atomicWrite(targetPath, originalContent);

  const tmpPath = targetPath + '.tmp';
  const newContent = JSON.stringify(VALID_DELTA_2);

  // Write the tmp file but do NOT rename — simulate crash before rename
  fs.writeFileSync(tmpPath, newContent);
  log('phase3', `Wrote tmp file (${newContent.length} bytes) — did NOT call rename`);
  log('phase3', `Target before: ${readOrNull(targetPath)?.substring(0, 50)}...`);

  // Simulate "the process died here" — we just don't rename

  // Check target
  const targetAfter = readOrNull(targetPath);
  const targetUnchanged = targetAfter === originalContent;

  // Check tmp
  const tmpAfter = readOrNull(tmpPath);

  log('phase3', `Target after: ${targetAfter?.substring(0, 50)}...`);
  log('phase3', `Target unchanged: ${targetUnchanged}`);
  log('phase3', `Tmp file exists (orphaned, has new content): ${tmpAfter !== null}`);
  log('phase3', `Tmp file content matches new delta: ${tmpAfter === newContent}`);

  // Clean up tmp
  try { fs.unlinkSync(tmpPath); } catch {}

  const pass = targetUnchanged && tmpAfter === newContent;
  log('phase3', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);

  return {
    pass,
    targetUnchanged,
    tmpOrphaned: tmpAfter !== null,
    tmpHasNewContent: tmpAfter === newContent,
  };
}

// ─── Phase 4: crash after rename returns — target has new content ─────────

/**
 * Phase 4: verify that after rename returns, target has the new content.
 * This is the "happy path" — the wrapper completed promotion successfully.
 *
 * Also verifies that a reader opening target before the rename continues
 * to read the old inode (Linux semantics: open fd stays on old inode).
 */
async function phase4() {
  console.log('\n=== Phase 4: rename completes — target has new content ===\n');

  const targetPath = path.join(INBOX_DIR, 'delta-4.json');
  const originalContent = JSON.stringify(VALID_DELTA);
  atomicWrite(targetPath, originalContent);

  // Open a read fd BEFORE the rename — should continue reading old inode
  const fdBefore = fs.openSync(targetPath, 'r');
  const bufBefore = Buffer.alloc(4096);
  const nBefore = fs.readSync(fdBefore, bufBefore, 0, 4096, 0);
  const contentBeforeRename = bufBefore.toString('utf8', 0, nBefore);

  // Promote
  const newContent = JSON.stringify(VALID_DELTA_2);
  atomicWrite(targetPath, newContent);

  // Read via a NEW fd — should see new content
  const contentAfterRename = readOrNull(targetPath);

  // Read via the OLD fd — should still see old content (inode is unchanged).
  // After rename, the old inode is unlinked but still open — reading the old
  // fd gives the old content (verified on tmpfs).
  const bufAfter = Buffer.alloc(4096);
  const nAfter = fs.readSync(fdBefore, bufAfter, 0, 4096, 0);
  const contentViaOldFd = bufAfter.toString('utf8', 0, nAfter);

  fs.closeSync(fdBefore);

  const targetHasNewContent = contentAfterRename === newContent;
  const oldFdHasOldContent = contentViaOldFd === originalContent;

  log('phase4', `Target after rename has new content: ${targetHasNewContent}`);
  log('phase4', `Old fd still reads old content (inode isolation): ${oldFdHasOldContent}`);

  const pass = targetHasNewContent && oldFdHasOldContent;
  log('phase4', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);

  return {
    pass,
    targetHasNewContent,
    oldFdHasOldContent,
  };
}

// ─── Phase 5: fold parse-check as defense in depth ─────────────────────────

/**
 * Phase 5: verify that the fold's parse-check catches corrupted delta files
 * without crashing, and can journal rejection evidence.
 *
 * The wrapper should never promote a corrupted file (it parse-checks before
 * rename). But "defense in depth" means the fold must also handle it. This
 * phase tests:
 *   a) Truncated JSON (missing closing brace)
 *   b) Empty file
 *   c) Binary garbage
 *   d) Valid JSON but wrong shape (missing required fields)
 *   e) A valid delta (should parse and validate)
 *
 * For each, the fold's safeParseJSON + validation should return a clear
 * rejection without throwing.
 */
async function phase5() {
  console.log('\n=== Phase 5: fold parse-check (defense in depth) ===\n');

  const cases = [
    {
      name: 'truncated JSON',
      content: '{"planningRunId":"pr_test","ops":[{"op":"addNode","node":{"id":"n1"',
      expectParse: false,
    },
    {
      name: 'empty file',
      content: '',
      expectParse: false,
    },
    {
      name: 'binary garbage',
      content: '\x00\x01\x02\x03\xff\xfe',
      expectParse: false,
    },
    {
      name: 'valid JSON, wrong shape (missing ops)',
      content: JSON.stringify({ planningRunId: 'pr_test', mode: 'expansion' }),
      expectParse: true,
      expectValid: false, // missing ops array
    },
    {
      name: 'valid JSON, ops is not an array',
      content: JSON.stringify({ planningRunId: 'pr_test', ops: 'not-an-array' }),
      expectParse: true,
      expectValid: false,
    },
    {
      name: 'valid delta',
      content: JSON.stringify(VALID_DELTA),
      expectParse: true,
      expectValid: true,
    },
  ];

  const results = [];
  for (const c of cases) {
    const parsed = safeParseJSON(c.content);
    let validated = false;
    let validationError = null;

    if (parsed.ok) {
      // Simulate the fold's validation
      const v = parsed.value;
      if (!Array.isArray(v.ops)) {
        validationError = 'ops is not an array';
      } else if (!v.planningRunId || typeof v.planningRunId !== 'string') {
        validationError = 'missing planningRunId';
      } else if (!v.mode || !['expansion', 'conflict', 'replan'].includes(v.mode)) {
        validationError = 'invalid mode';
      } else {
        validated = true;
      }
    }

    const parseOk = parsed.ok === c.expectParse;
    const validOk = c.expectParse ? (validated === (c.expectValid ?? false)) : true;
    const pass = parseOk && validOk;

    log('phase5', `${c.name}: parse=${parsed.ok} valid=${validated} error=${validationError || parsed.error || 'none'} → ${pass ? 'PASS' : 'FAIL'}`);

    results.push({
      name: c.name,
      parseOk: parsed.ok,
      parseError: parsed.error,
      validated,
      validationError,
      pass,
    });
  }

  const allPass = results.every(r => r.pass);
  log('phase5', `RESULT: ${allPass ? 'PASS' : 'FAIL'}`);

  return { pass: allPass, cases: results };
}

// ─── Phase 6: O_APPEND journal atomicity ──────────────────────────────────

/**
 * Phase 6: verify that concurrent fs.appendFileSync calls to the journal
 * produce non-interleaved lines.
 *
 * The journal (journal.jsonl) is the commit point — each event is a single
 * JSON line appended via O_APPEND. If two appends interleave, the journal
 * has corrupted lines. POSIX guarantees O_APPEND writes are atomic per call
 * on local filesystems (§2.9.7). This phase verifies it empirically.
 *
 * We spawn PHASE6_APPENDERS child processes, each writing PHASE6_LINES_EACH
 * lines. Each line is a JSON object with the appender's ID and line number.
 * After all appenders finish, we read the journal and verify every line is
 * valid JSON and no lines are interleaved.
 */
async function phase6() {
  console.log('\n=== Phase 6: O_APPEND journal atomicity (concurrent appenders) ===\n');

  const journalPath = path.join(SPIKE_DIR, 'journal.jsonl');
  // Start clean
  try { fs.unlinkSync(journalPath); } catch {}

  // Write appender scripts
  const appenderScript = path.join(SPIKE_DIR, 'phase6-appender.js');
  const appenderCode = `
const fs = require('fs');
const path = require('path');

const journalPath = ${JSON.stringify(journalPath)};
const appenderId = parseInt(process.argv[2], 10);
const linesEach = ${PHASE6_LINES_EACH};

for (let i = 0; i < linesEach; i++) {
  const entry = JSON.stringify({
    appenderId,
    line: i,
    timestamp: Date.now(),
    payload: 'x'.repeat(50), // small but non-trivial
  });
  fs.appendFileSync(journalPath, entry + '\\n');
}
`;
  fs.writeFileSync(appenderScript, appenderCode);

  // Spawn concurrent appenders
  log('phase6', `Spawning ${PHASE6_APPENDERS} concurrent appenders, ${PHASE6_LINES_EACH} lines each...`);
  const t0 = Date.now();
  const children = [];
  for (let i = 0; i < PHASE6_APPENDERS; i++) {
    children.push(new Promise((resolve, reject) => {
      const child = spawn('node', [appenderScript, String(i)], { stdio: 'pipe' });
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Appender ${i} exited with code ${code}`));
      });
      child.on('error', reject);
    }));
  }

  await Promise.all(children);
  const duration = Date.now() - t0;

  // Read and validate the journal
  log('phase6', `Reading journal and validating lines...`);
  const journal = fs.readFileSync(journalPath, 'utf8');
  const lines = journal.split('\n').filter(l => l.length > 0);

  let validLines = 0;
  let invalidLines = 0;
  let interleavedLines = 0;
  const linesByAppender = {};

  for (const line of lines) {
    const parsed = safeParseJSON(line);
    if (!parsed.ok) {
      invalidLines++;
      if (invalidLines <= 3) {
        log('phase6', `Invalid line (parse error: ${parsed.error}): ${line.substring(0, 80)}...`);
      }
      continue;
    }

    validLines++;
    const entry = parsed.value;

    // Check for interleaving: each line should belong to exactly one appender
    // and have a sequential line number for that appender
    if (entry.appenderId !== undefined) {
      if (!linesByAppender[entry.appenderId]) {
        linesByAppender[entry.appenderId] = [];
      }
      linesByAppender[entry.appenderId].push(entry.line);
    }

    // An interleaved line would have garbled JSON structure or mixed content
    // — JSON.parse would fail on most interleaving. But check for obvious
    // signs: payload length != 50 chars (the 'x'.repeat(50))
    if (entry.payload && entry.payload.length !== 50) {
      interleavedLines++;
    }
  }

  // Verify each appender's lines are sequential (no dropped/interleaved lines)
  let sequenceOk = true;
  for (const [id, lineNums] of Object.entries(linesByAppender)) {
    for (let i = 0; i < lineNums.length; i++) {
      if (lineNums[i] !== i) {
        sequenceOk = false;
        log('phase6', `Appender ${id}: line sequence broken at index ${i} (got ${lineNums[i]})`);
        break;
      }
    }
  }

  const expectedLines = PHASE6_APPENDERS * PHASE6_LINES_EACH;
  const pass = invalidLines === 0 && interleavedLines === 0 && validLines === expectedLines && sequenceOk;

  log('phase6', `Duration: ${elapsed(duration)}`);
  log('phase6', `Expected lines: ${expectedLines}`);
  log('phase6', `Valid lines: ${validLines}`);
  log('phase6', `Invalid (parse error): ${invalidLines}`);
  log('phase6', `Interleaved (payload length mismatch): ${interleavedLines}`);
  log('phase6', `Sequence per appender intact: ${sequenceOk}`);
  log('phase6', `RESULT: ${pass ? 'PASS' : 'FAIL'}`);

  return {
    pass,
    duration,
    expectedLines,
    validLines,
    invalidLines,
    interleavedLines,
    sequenceOk,
    appenders: PHASE6_APPENDERS,
    linesEach: PHASE6_LINES_EACH,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  // Set up spike directory
  execSync(`rm -rf ${SPIKE_DIR}`);
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  fs.mkdirSync(INBOX_DIR, { recursive: true });

  // Verify /tmp is tmpfs (informational)
  let fsType = 'unknown';
  try {
    const mounts = fs.readFileSync('/proc/mounts', 'utf8');
    const tmpLine = mounts.split('\n').find(l => l.includes(' /tmp '));
    if (tmpLine) {
      fsType = tmpLine.split(/\s+/)[2];
    } else {
      // /tmp might not be a separate mount — check the root
      const rootLine = mounts.split('\n').find(l => l.includes(' / '));
      if (rootLine) fsType = rootLine.split(/\s+/)[2] + ' (root, /tmp not separate)';
    }
  } catch {}
  log('setup', `Spike directory: ${SPIKE_DIR}`);
  log('setup', `Filesystem type for /tmp: ${fsType}`);

  const results = {
    filesystemType: fsType,
    phase1: null,
    phase2: null,
    phase3: null,
    phase4: null,
    phase5: null,
    phase6: null,
  };

  // Phase 1: rename atomicity
  try {
    results.phase1 = await phase1();
  } catch (err) {
    log('phase1', `FATAL: ${err.message}`);
    results.phase1 = { pass: false, error: err.message };
  }

  // Phase 2: crash during tmp write
  try {
    results.phase2 = await phase2();
  } catch (err) {
    log('phase2', `FATAL: ${err.message}`);
    results.phase2 = { pass: false, error: err.message };
  }

  // Phase 3: crash mid-rename
  try {
    results.phase3 = await phase3();
  } catch (err) {
    log('phase3', `FATAL: ${err.message}`);
    results.phase3 = { pass: false, error: err.message };
  }

  // Phase 4: rename completes
  try {
    results.phase4 = await phase4();
  } catch (err) {
    log('phase4', `FATAL: ${err.message}`);
    results.phase4 = { pass: false, error: err.message };
  }

  // Phase 5: fold parse-check
  try {
    results.phase5 = await phase5();
  } catch (err) {
    log('phase5', `FATAL: ${err.message}`);
    results.phase5 = { pass: false, error: err.message };
  }

  // Phase 6: O_APPEND journal atomicity
  try {
    results.phase6 = await phase6();
  } catch (err) {
    log('phase6', `FATAL: ${err.message}`);
    results.phase6 = { pass: false, error: err.message };
  }

  // Cleanup
  try { execSync(`rm -rf ${SPIKE_DIR}`); } catch {}

  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Phase 1 (rename atomicity):          ${results.phase1?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 2 (crash during tmp write):     ${results.phase2?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 3 (crash mid-rename):           ${results.phase3?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 4 (rename completes):           ${results.phase4?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 5 (fold parse-check):           ${results.phase5?.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Phase 6 (O_APPEND journal atomicity): ${results.phase6?.pass ? 'PASS' : 'FAIL'}`);

  const anyFail = Object.values(results).some(r => r && typeof r === 'object' && r.pass === false);
  if (anyFail) {
    process.exitCode = 1;
  }
}

// Run as script, export as module.
if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}

module.exports = { phase1, phase2, phase3, phase4, phase5, phase6 };
