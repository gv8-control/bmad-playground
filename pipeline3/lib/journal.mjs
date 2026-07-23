// Journal append + read helpers.
//
// The journal (journal.jsonl) is the append-only commit point for canonical
// pipeline state. Appends are single-write O_APPEND-equivalent calls
// (fs.writeFileSync with { flag: 'a' }), writing one JSON line + \n. The
// append is the commit point.
//
// readJournal returns an array of parsed events. Blank/short lines are
// skipped. A malformed line is returned as { _unparseable: <raw> } rather
// than throwing — the journal can gain a bad line but cannot lose good ones,
// and a reader must not crash the pass.
//
// Event type vocabulary (documented for reference; Stage 0 only emits
// `bootstrap`; the rest are consumed by later stages):
//
//   bootstrap        — first event on journal creation (Stage 0 choice: emitted)
//   claim             — a node was claimed for execution
//   outcome           — a session exited and was classified (COMPLETE/QUESTION/failed)
//   park              — a node was parked with a QUESTION
//   resume            — a parked node was resumed (answer folded)
//   merge             — a merge landed (or conflicted)
//   runner_error      — machinery failure (non-zero exit, timeout, API failure)
//   pause             — human paused the pipeline
//   resume            — human resumed the pipeline (same type, different context)
//   planning_launch   — a planning run was launched
//   planning_exit     — a planning run exited
//   conflict          — a merge conflict was reported

import { writeFileSync, readFileSync } from 'node:fs';
import { journalPath } from './paths.mjs';

/**
 * Append one event to the journal as a JSON line + \n.
 *
 * The append is the commit point. Uses fs.writeFileSync with { flag: 'a' }
 * for O_APPEND-equivalent semantics (verified: 500 concurrent appends, zero
 * interleaved lines — spike 2026-07-22).
 *
 * Accepts a plain object. Serializes with stable key order via
 * JSON.stringify (V8 preserves insertion order, which is stable enough).
 */
export function appendJournal(event, path = journalPath) {
  const line = JSON.stringify(event) + '\n';
  writeFileSync(path, line, { flag: 'a' });
}

/**
 * Read the journal and return an array of parsed events.
 *
 * Skips blank lines. A malformed line is returned as
 * { _unparseable: <raw> } rather than throwing — the journal can gain a bad
 * line but cannot lose good ones, and a reader must not crash the pass.
 */
export function readJournal(path = journalPath) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const events = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      events.push({ _unparseable: trimmed });
    }
  }
  return events;
}
