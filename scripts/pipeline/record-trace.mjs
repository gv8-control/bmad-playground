// Persist opencode session transcripts for the pipeline reflector.
//
//   node scripts/pipeline/record-trace.mjs <sessionId> <runId> <stepId>
//
// Exports the main session and any child subagent sessions to disk via
// streamed file writes (stdout -> file descriptor, never into Node memory),
// then writes a manifest the reflector consumes. Fails soft: on missing
// session, non-zero opencode exit, or schema mismatch, writes a manifest with
// schemaOk: false and exits 0 so the step loop never breaks.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { PATHS, fail, output, nowIso } from './lib.mjs';

const PINNED_PART_TYPES = ['text', 'reasoning', 'tool', 'step-start', 'step-finish', 'patch'];
const DB_PATH = path.join(process.env.HOME || '', '.local', 'share', 'opencode', 'opencode.db');

// Stream `opencode export <sessionId>` stdout directly to a file descriptor.
// The fd is passed as the child's stdio[1], so the OS writes the transcript
// straight to disk — never buffered in Node memory. (Piping through a Node
// write stream truncates large exports due to backpressure races; a raw fd
// is the only reliable path.) Resolves with { exitCode, stderr }.
function exportSession(sessionId, filePath) {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(filePath, 'w');
    const proc = spawn('opencode', ['export', sessionId], { stdio: [null, fd, 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    proc.on('close', (code) => {
      fs.closeSync(fd);
      resolve({ exitCode: code, stderr });
    });
    proc.on('error', (e) => {
      try {
        fs.closeSync(fd);
      } catch {
        // fd may already be closed
      }
      reject(e);
    });
  });
}

function shortId(id) {
  return id.slice(-8);
}

function queryInfo(traceFile) {
  const buf = execFileSync('jq', ['-c', '.info', traceFile]);
  return JSON.parse(buf.toString().trim());
}

function queryPartTypes(traceFile) {
  const buf = execFileSync('jq', ['-c', '[.messages[].parts[]?.type] | unique', traceFile]);
  return JSON.parse(buf.toString().trim());
}

function discoverChildren(parentSid) {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const rows = db
    .prepare('SELECT id, agent, title FROM session WHERE parent_id = ? ORDER BY time_created')
    .all(parentSid);
  db.close();
  return rows;
}

const [, , sessionId, runId, stepId] = process.argv;

if (!sessionId || !runId || !stepId) fail('Usage: record-trace.mjs <sessionId> <runId> <stepId>');
if (runId.includes('/') || runId.includes('..') || stepId.includes('/') || stepId.includes('..')) {
  fail('runId and stepId must not contain path separators');
}

const runDir = path.join(PATHS.tracesDir, runId);
const traceFile = path.join(runDir, `${stepId}.json`);
const manifestFile = path.join(runDir, `${stepId}.manifest.json`);
const subagentsDir = path.join(runDir, `${stepId}.subagents`);

function writeManifest(manifest) {
  try {
    fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  } catch {
    // best-effort file write; stdout output is the critical path for n8n
  }
  output(manifest);
}

async function main() {
  fs.mkdirSync(runDir, { recursive: true });

  // 1. Export main session (streamed to file, never into memory)
  let exitCode, stderr;
  try {
    ({ exitCode, stderr } = await exportSession(sessionId, traceFile));
  } catch (e) {
    writeManifest({
      stepId,
      sessionId,
      file: `${stepId}.json`,
      subagents: [],
      recordedAt: nowIso(),
      schemaOk: false,
      error: `opencode export failed to spawn: ${e.message}`,
    });
    return;
  }

  if (exitCode !== 0) {
    writeManifest({
      stepId,
      sessionId,
      file: `${stepId}.json`,
      subagents: [],
      recordedAt: nowIso(),
      schemaOk: false,
      error: `opencode export exited ${exitCode}${stderr ? ': ' + stderr.trim().slice(0, 200) : ''}`,
    });
    return;
  }

  // 2. Read info block + part types via bounded jq queries against the persisted file
  let info, partTypes;
  try {
    info = queryInfo(traceFile);
    partTypes = queryPartTypes(traceFile);
  } catch (e) {
    writeManifest({
      stepId,
      sessionId,
      file: `${stepId}.json`,
      subagents: [],
      recordedAt: nowIso(),
      schemaOk: false,
      error: `failed to parse trace file: ${e.message}`,
    });
    return;
  }

  const present = new Set(partTypes);
  const missing = PINNED_PART_TYPES.filter((t) => !present.has(t));
  const schemaOk = missing.length === 0;

  // 3. Discover + export child sessions (non-fatal on failure)
  const subagents = [];
  try {
    const children = discoverChildren(sessionId);
    if (children.length > 0) {
      fs.mkdirSync(subagentsDir, { recursive: true });
    }
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childFile = path.join(subagentsDir, `${i}-${shortId(child.id)}.json`);
      try {
        const { exitCode: childExit } = await exportSession(child.id, childFile);
        if (childExit !== 0) continue;
        subagents.push({
          sessionId: child.id,
          agent: child.agent,
          file: `${stepId}.subagents/${i}-${shortId(child.id)}.json`,
        });
      } catch {
        // skip child on error, continue with remaining children
      }
    }
  } catch {
    // child discovery failure is non-fatal; record what we have
  }

  // 4. Write + print manifest
  const manifest = {
    stepId,
    sessionId,
    file: `${stepId}.json`,
    subagents,
    recordedAt: nowIso(),
    schemaOk,
    ...(schemaOk ? {} : { error: `schema mismatch: missing part types [${missing.join(', ')}]` }),
    cost: info.cost ?? 0,
    tokens: info.tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  };
  writeManifest(manifest);
}

main().catch((e) => {
  writeManifest({
    stepId,
    sessionId,
    file: `${stepId}.json`,
    subagents: [],
    recordedAt: nowIso(),
    schemaOk: false,
    error: e.message,
  });
});
