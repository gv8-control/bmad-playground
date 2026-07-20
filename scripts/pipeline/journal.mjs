// Append-only run journal for the gen-2 pipeline, plus derived views.
//
//   node scripts/pipeline/journal.mjs append --b64 <base64-of-json-event>
//   node scripts/pipeline/journal.mjs story <story-id>     # events for one story (markdown-ish JSON)
//   node scripts/pipeline/journal.mjs trends               # cross-run trend accumulator
//
// Event shape (append): { type, story, runId, ... } — ts is added here.
// Types used by the workflows: story_start, step_start, step_end, story_end.
import { PATHS, readJsonl, appendJsonl, fail, output, nowIso } from './lib.mjs';

const [, , command, ...rest] = process.argv;

if (command === 'append') {
  const flag = rest.indexOf('--b64');
  if (flag === -1 || !rest[flag + 1]) fail('append requires --b64 <base64-json>');
  let event;
  try {
    event = JSON.parse(Buffer.from(rest[flag + 1], 'base64').toString('utf8'));
  } catch (e) {
    fail(`append payload is not valid base64 JSON: ${e.message}`);
  }
  if (!event.type) fail('append event requires a "type" field');
  appendJsonl(PATHS.journal, { ts: nowIso(), ...event });
  output({ ok: true, type: event.type });
} else if (command === 'story') {
  const story = (rest[0] ?? '').trim();
  if (!story) fail('story requires a story id');
  output(readJsonl(PATHS.journal).filter((e) => e.story === story));
} else if (command === 'trends') {
  const events = readJsonl(PATHS.journal);
  const perStep = {};
  for (const e of events) {
    if (e.type !== 'step_end') continue;
    const s = (perStep[e.step] ??= { runs: 0, failures: 0, totalMs: 0, maxMs: 0, halts: 0, incompleteCount: 0 });
    s.runs += 1;
    if (e.status !== 'success') s.failures += 1;
    if (typeof e.durationMs === 'number') {
      s.totalMs += e.durationMs;
      s.maxMs = Math.max(s.maxMs, e.durationMs);
    }
    if (typeof e.halts === 'number') s.halts += e.halts;
    if (typeof e.incompleteCount === 'number') s.incompleteCount += e.incompleteCount;
  }
  const steps = Object.fromEntries(
    Object.entries(perStep).map(([id, s]) => [
      id,
      { runs: s.runs, failures: s.failures, avgMs: s.runs ? Math.round(s.totalMs / s.runs) : 0, maxMs: s.maxMs, halts: s.halts, incompleteCount: s.incompleteCount },
    ])
  );
  const attempts = {};
  for (const e of events) {
    if (e.type === 'story_start') attempts[e.story] = (attempts[e.story] ?? 0) + 1;
  }
  const haltsPerStory = {};
  for (const e of events) {
    if (e.type === 'step_end' && typeof e.halts === 'number' && e.halts > 0) {
      haltsPerStory[e.story] = (haltsPerStory[e.story] ?? 0) + e.halts;
    }
  }
  const incompleteCountPerStory = {};
  for (const e of events) {
    if (e.type === 'step_end' && typeof e.incompleteCount === 'number' && e.incompleteCount > 0) {
      incompleteCountPerStory[e.story] = (incompleteCountPerStory[e.story] ?? 0) + e.incompleteCount;
    }
  }
  const recurrences = {};
  for (const entry of readJsonl(PATHS.ledger)) {
    if (entry.type === 'observation' && entry.fingerprint) {
      (recurrences[entry.fingerprint] ??= new Set()).add(entry.runId);
    }
  }
  const findings = Object.entries(recurrences)
    .map(([fingerprint, runs]) => ({ fingerprint, distinctRuns: runs.size }))
    .sort((a, b) => b.distinctRuns - a.distinctRuns);
  output({ steps, storyAttempts: attempts, haltsPerStory, incompleteCountPerStory, recurringFindings: findings });
} else {
  fail('Usage: journal.mjs <append|story|trends> ...');
}
