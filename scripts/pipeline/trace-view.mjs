// Progressive-disclosure trace viewer for the self-improving pipeline.
// Reads the persisted opencode export (never pipes the live export) and
// prints a bounded, filtered slice to stdout for the reflector agent.
//
//   node scripts/pipeline/trace-view.mjs <runId> <stepId> [flags]
//
// Flags (progressive disclosure):
//   (default)            last message's text parts (<=4000 chars)
//   --narrative          all text parts across all messages (<=20000 chars)
//   --from <msgId>       text parts from a specific message onward
//   --include machinery  add reasoning/tool/step-start/step-finish/patch parts
//   --grep <pattern>    scan text parts for a keyword/regex, return matching lines
//   --subagents          include each child session's default narrative
//   --full               no cap (still reports total size)
//
// Always prints a trailing line:
//   [view: <level>, <nParts> of <total> shown, <bytes> bytes]
//
// Degradation:
//   missing trace file  -> "no trace for this step" (exit 0)
//   missing manifest    -> read the trace file directly
//   malformed JSON      -> error message (exit 0)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PATHS, fail } from './lib.mjs';

const runId = (process.argv[2] ?? '').trim();
const stepId = (process.argv[3] ?? '').trim();
if (!runId || !stepId) fail('Usage: trace-view.mjs <runId> <stepId> [flags]');
if (runId.includes('/') || runId.includes('..')) fail('invalid runId');
if (stepId.includes('/') || stepId.includes('..')) fail('invalid stepId');

const opts = {
  narrative: false,
  from: null,
  includeMachinery: false,
  grep: null,
  subagents: false,
  full: false,
};
const rawFlags = process.argv.slice(4);
for (let i = 0; i < rawFlags.length; i++) {
  const f = rawFlags[i];
  if (f === '--narrative') opts.narrative = true;
  else if (f === '--from') {
    opts.from = (rawFlags[++i] ?? '').trim();
    if (!opts.from) fail('--from requires a message ID');
  } else if (f === '--include') {
    const what = rawFlags[++i];
    if (what !== 'machinery') fail('--include only supports "machinery"');
    opts.includeMachinery = true;
  } else if (f === '--grep') {
    opts.grep = (rawFlags[++i] ?? '').trim();
    if (!opts.grep) fail('--grep requires a pattern');
  } else if (f === '--subagents') opts.subagents = true;
  else if (f === '--full') opts.full = true;
  else fail(`unknown flag: ${f}`);
}

const traceDir = path.join(PATHS.tracesDir, runId);
const traceFile = path.join(traceDir, `${stepId}.json`);
const manifestFile = path.join(traceDir, `${stepId}.manifest.json`);

if (!fs.existsSync(traceFile)) {
  process.stdout.write('no trace for this step\n');
  process.exit(0);
}

function jq(filter, file, args = []) {
  return execFileSync('jq', ['-c', ...args, filter, file], {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
}

function jqJson(filter, file, args = []) {
  const out = jq(filter, file, args).trim();
  return out === '' ? null : JSON.parse(out);
}

try {
  jq('empty', traceFile);
} catch {
  process.stdout.write('trace file is not valid JSON\n');
  process.exit(0);
}

function truncate(text, max) {
  const t = text ?? '';
  if (t.length <= max) return t;
  return t.slice(0, max) + '...';
}

function renderPart(part) {
  switch (part.type) {
    case 'text':
      return part.text ?? '';
    case 'reasoning':
      return `[reasoning] ${truncate(part.text, 200)}`;
    case 'tool': {
      const status = part.state?.status ?? '?';
      const input = part.state?.input ?? {};
      let detail = '';
      if (input.name) detail = ` (${input.name})`;
      else if (input.command) detail = ` ${truncate(input.command, 80)}`;
      return `[tool: ${part.tool}${detail}] ${status}`;
    }
    case 'step-start':
      return '[step-start]';
    case 'step-finish':
      return `[step-finish] (${part.reason ?? '?'})`;
    case 'patch':
      return `[patch] ${(part.files ?? []).join(', ')}`;
    default:
      return `[${part.type ?? 'unknown'}]`;
  }
}

function cap(text, limit, hint) {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n[truncated; widen with ${hint}]`;
}

function lastMessageText(file) {
  return jqJson('[.messages[-1].parts[]? | select(.type == "text") | .text]', file) ?? [];
}

const totalParts = jqJson('[.messages[].parts[]?] | length', traceFile) ?? 0;

let level;
if (opts.grep) level = 'grep';
else if (opts.subagents) level = 'subagents';
else if (opts.from) level = 'from';
else if (opts.narrative) level = 'narrative';
else if (opts.full) level = 'full';
else if (opts.includeMachinery) level = 'machinery';
else level = 'default';

let content = '';
let nParts = 0;

try {
  if (level === 'grep') {
    const parts =
      jqJson(
        '[.messages[] | . as $m | ((.parts // []) | to_entries[]) | select(.value.type == "text") | {text: .value.text, id: $m.info.id, pidx: .key}]',
        traceFile,
      ) ?? [];
    let regex;
    try {
      regex = new RegExp(opts.grep, 'i');
    } catch {
      process.stdout.write(`invalid regex: ${opts.grep}\n`);
      process.exit(0);
    }
    const matches = [];
    for (const part of parts) {
      const lines = (part.text ?? '').split('\n');
      for (let li = 0; li < lines.length; li++) {
        if (regex.test(lines[li])) {
          matches.push(`${part.id} part ${part.pidx} L${li + 1}: ${lines[li]}`);
        }
      }
    }
    nParts = matches.length;
    content = matches.length > 0 ? matches.join('\n') : `no matches for pattern '${opts.grep}'`;
  } else if (level === 'subagents') {
    const capLimit = opts.full ? Infinity : 4000;
    const parentTexts = lastMessageText(traceFile);
    const parentNarrative =
      parentTexts.length > 0
        ? cap(parentTexts.join('\n\n'), capLimit, '--full')
        : 'no narrative in final step; widen with --narrative';
    const sections = [parentNarrative];
    nParts = parentTexts.length;

    let children = [];
    if (fs.existsSync(manifestFile)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        children = manifest.subagents ?? [];
      } catch {}
    }
    if (children.length === 0) {
      const subagentsDir = path.join(traceDir, `${stepId}.subagents`);
      if (fs.existsSync(subagentsDir)) {
        children = fs
          .readdirSync(subagentsDir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => ({
            file: `${stepId}.subagents/${f}`,
            sessionId: f.replace('.json', ''),
            agent: 'unknown',
          }));
      }
    }

    for (const child of children) {
      const childFile = path.join(traceDir, child.file);
      if (!fs.existsSync(childFile)) {
        sections.push(
          `--- subagent: ${child.agent ?? 'unknown'} (${child.sessionId ?? '?'}) ---\n[child file not found: ${child.file}]`,
        );
        continue;
      }
      try {
        jq('empty', childFile);
      } catch {
        sections.push(
          `--- subagent: ${child.agent ?? 'unknown'} (${child.sessionId ?? '?'}) ---\n[child file is not valid JSON]`,
        );
        continue;
      }
      const childTexts = lastMessageText(childFile);
      const childNarrative =
        childTexts.length > 0
          ? cap(childTexts.join('\n\n'), capLimit, '--full')
          : 'no narrative in final step';
      sections.push(
        `--- subagent: ${child.agent ?? 'unknown'} (${child.sessionId ?? '?'}) ---\n${childNarrative}`,
      );
      nParts += childTexts.length;
    }
    content = sections.join('\n\n');
  } else if (level === 'from') {
    const exists =
      jqJson('([.messages[] | select(.info.id == $id)] | length > 0)', traceFile, [
        '--arg',
        'id',
        opts.from,
      ]) ?? false;
    if (!exists) {
      content = `message ${opts.from} not found in this trace`;
    } else {
      const filter = opts.includeMachinery
        ? '(.messages | to_entries | map(select(.value.info.id == $id) | .key) | .[0]) as $idx | if $idx == null then [] else [.messages[$idx:][] | .parts[]?] end'
        : '(.messages | to_entries | map(select(.value.info.id == $id) | .key) | .[0]) as $idx | if $idx == null then [] else [.messages[$idx:][] | .parts[]? | select(.type == "text") | .text] end';
      const parts = jqJson(filter, traceFile, ['--arg', 'id', opts.from]) ?? [];
      nParts = parts.length;
      content = opts.includeMachinery ? parts.map((p) => renderPart(p)).join('\n') : parts.join('\n\n');
      if (!opts.full) content = cap(content, 20000, '--full');
    }
  } else if (level === 'narrative' || level === 'full') {
    const filter = opts.includeMachinery
      ? '[.messages[].parts[]?]'
      : '[.messages[].parts[]? | select(.type == "text") | .text]';
    const parts = jqJson(filter, traceFile) ?? [];
    nParts = parts.length;
    content = opts.includeMachinery ? parts.map((p) => renderPart(p)).join('\n') : parts.join('\n\n');
    if (!opts.full) content = cap(content, 20000, '--full');
  } else if (level === 'machinery') {
    const parts = jqJson('[.messages[-1].parts[]?]', traceFile) ?? [];
    nParts = parts.length;
    content = parts.map((p) => renderPart(p)).join('\n');
    if (!opts.full) content = cap(content, 4000, '--narrative --include machinery');
  } else {
    const texts = lastMessageText(traceFile);
    nParts = texts.length;
    if (texts.length === 0) {
      content = 'no narrative in final step; widen with --narrative';
    } else {
      content = texts.join('\n\n');
      if (!opts.full) content = cap(content, 4000, '--narrative');
    }
  }
} catch (e) {
  process.stdout.write(`error reading trace: ${e.message}\n`);
  process.exit(0);
}

process.stdout.write(content);
if (!content.endsWith('\n')) process.stdout.write('\n');
const bytes = Buffer.byteLength(content, 'utf8');
process.stdout.write(`[view: ${level}, ${nParts} of ${totalParts} shown, ${bytes} bytes]\n`);
