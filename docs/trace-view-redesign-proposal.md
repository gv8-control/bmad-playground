# trace-view.mjs redesign proposal

## Problem

The current `trace-view.mjs` (275 lines) uses an output-oriented "levels" model (`default`, `narrative`, `from`, `machinery`, `grep`, `subagents`, `full`) that conflates three orthogonal axes (which messages, which part types, which files) into a single enum with confusing flag interactions. The `--include machinery` distinction saves ~100 bytes on the default view but requires dual code paths everywhere. The 7-level model requires a 91-line reference doc and 25 lines of worked examples in `reflect-prompt.mjs` to teach the reflector how to use it.

## Proposal

Replace the levels model with a single `content` parameter that has four progressive values, plus `--grep` as the one modifier. No caps, no truncation — the caller chooses the level, the script renders fully.

```
node scripts/pipeline/trace-view.mjs <runId> <stepId> [content <level>] [--grep <pattern>]
```

### Content levels (progressive — each includes the previous)

| Level | Scope | What's rendered |
|---|---|---|
| `(default)` | last assistant message | text + tool inputs + patches + files |
| `conversation` | all messages | text only (reveals user dialogue, e.g. HALT exchanges) |
| `extensive` | all messages | text + tool inputs + patches + files |
| `max` | parent + each subagent | extensive for each file |

**Never rendered:** reasoning (internal monologue), step-start/step-finish (structural markers), tool outputs (can be 50KB+ per call). Tool *inputs* (filePath, command, pattern) are always included — they're 20-80 bytes each and tell the reflector what the agent did.

### Modifier

`--grep <pattern>` — searches all text parts across all messages, returns matching lines with message IDs (`msgId L<line>: <line>`). Overrides content level. This is the only discovery mechanism for large traces; without it, finding "skip" in a 239-message trace means reading the entire output.

### Why no caps

The original code capped output at 4000/20000 chars to control cost. But the content levels already provide cost control — `default` is cheap, `max` is expensive. Caps caused a subtle problem: text-only rendering returned empty for 80% of messages in coder traces (which have tool calls but no text). Always rendering tool inputs makes every message non-empty. The caller picks the level; the script doesn't second-guess them.

A trailing line `[trace: <N> parts total, <bytes> bytes]` tells the reflector the trace size so they can judge whether to re-run with a wider level.

## Replacement code

```js
// trace-view.mjs — reader for persisted opencode session transcripts.
//
//   node scripts/pipeline/trace-view.mjs <runId> <stepId> [content <level>] [--grep <pattern>]
//
// Content levels (progressive — each includes the previous):
//   (default)      last assistant message (text + tool inputs + patches)
//   conversation   all messages, text only (reveals user dialogue, e.g. HALT exchanges)
//   extensive      all messages, text + tool inputs + patches (no tool outputs, no reasoning)
//   max            extensive for parent + each subagent session
//
// --grep <pattern>   search text parts across all messages; returns matching lines
//                    with message IDs. Overrides content level.
//
// No truncation, no caps. The caller chooses the level; the script renders fully.
//
// Degradation:
//   missing trace file  -> "no trace for this step" (exit 0)
//   malformed JSON      -> "trace file is not valid JSON" (exit 0)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PATHS, fail } from './lib.mjs';

const runId = (process.argv[2] ?? '').trim();
const stepId = (process.argv[3] ?? '').trim();
if (!runId || !stepId) fail('Usage: trace-view.mjs <runId> <stepId> [content <level>] [--grep <pattern>]');
if (runId.includes('/') || runId.includes('..')) fail('invalid runId');
if (stepId.includes('/') || stepId.includes('..')) fail('invalid stepId');

let level = 'default';
let grepPattern = null;
const args = process.argv.slice(4);
for (let i = 0; i < args.length; i++) {
  if (args[i] === 'content') {
    level = (args[++i] ?? '').trim();
    if (!['default', 'conversation', 'extensive', 'max'].includes(level))
      fail('content level must be: default, conversation, extensive, or max');
  } else if (args[i] === '--grep') {
    grepPattern = (args[++i] ?? '').trim();
    if (!grepPattern) fail('--grep requires a pattern');
  } else fail(`unknown argument: ${args[i]}`);
}

const traceDir = path.join(PATHS.tracesDir, runId);
const traceFile = path.join(traceDir, `${stepId}.json`);

if (!fs.existsSync(traceFile)) {
  process.stdout.write('no trace for this step\n');
  process.exit(0);
}

function jq(filter, file, jqArgs = []) {
  return execFileSync('jq', ['-c', ...jqArgs, filter, file], {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
}

function jqJson(filter, file, jqArgs = []) {
  const out = jq(filter, file, jqArgs).trim();
  return out === '' ? null : JSON.parse(out);
}

try {
  jq('empty', traceFile);
} catch {
  process.stdout.write('trace file is not valid JSON\n');
  process.exit(0);
}

// Part types we render. Never included: reasoning (internal monologue),
// step-start/step-finish (structural markers), tool outputs (can be 50KB+).
// Tool inputs (filePath, command, pattern) are always included — they're
// 20-80 bytes each and tell the reflector what the agent did.
const RENDERABLE = new Set(['text', 'tool', 'patch', 'file']);

function renderPart(part) {
  switch (part.type) {
    case 'text':
      return part.text ?? '';
    case 'tool': {
      const input = part.state?.input ?? {};
      let detail = '';
      if (input.filePath) detail = ` ${input.filePath}`;
      else if (input.command) detail = ` ${input.command}`;
      else if (input.pattern) detail = ` ${input.pattern}`;
      else if (input.name) detail = ` ${input.name}`;
      else if (input.description) detail = ` ${input.description}`;
      return `[tool: ${part.tool}${detail}] ${part.state?.status ?? '?'}`;
    }
    case 'patch':
      return `[patch] ${(part.files ?? []).join(', ')}`;
    case 'file':
      return `[file: ${part.filename ?? part.source?.path ?? 'unknown'}]`;
  }
}

function renderMessages(file, { textOnly = false, lastOnly = false } = {}) {
  let messages = jqJson('[.messages[] | {info: .info, parts: (.parts // [])}]', file) ?? [];
  if (lastOnly) {
    const last = [...messages].reverse().find((m) => m.info?.role === 'assistant');
    if (!last) return 'no assistant message in this trace';
    messages = [last];
  }
  const sections = [];
  for (const msg of messages) {
    const parts = (msg.parts ?? []).filter((p) =>
      textOnly ? p.type === 'text' : RENDERABLE.has(p.type),
    );
    if (parts.length === 0) continue;
    const header = `--- ${msg.info?.role ?? '?'} (${msg.info?.id ?? '?'}) ---`;
    sections.push(`${header}\n${parts.map(renderPart).join('\n')}`);
  }
  return sections.length > 0 ? sections.join('\n\n') : 'no content in this trace';
}

function listChildren(dir, step) {
  const manifestFile = path.join(dir, `${step}.manifest.json`);
  if (fs.existsSync(manifestFile)) {
    try {
      return JSON.parse(fs.readFileSync(manifestFile, 'utf8')).subagents ?? [];
    } catch {}
  }
  const subagentsDir = path.join(dir, `${step}.subagents`);
  if (fs.existsSync(subagentsDir)) {
    return fs
      .readdirSync(subagentsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ file: `${step}.subagents/${f}`, agent: 'unknown' }));
  }
  return [];
}

function doGrep(file, pattern) {
  const parts =
    jqJson(
      '[.messages[] | . as $m | ((.parts // []) | to_entries[]) | select(.value.type == "text") | {text: .value.text, id: $m.info.id}]',
      file,
    ) ?? [];
  let regex;
  try {
    regex = new RegExp(pattern, 'i');
  } catch {
    return `invalid regex: ${pattern}`;
  }
  const matches = [];
  for (const part of parts) {
    const lines = (part.text ?? '').split('\n');
    for (let li = 0; li < lines.length; li++) {
      if (regex.test(lines[li])) matches.push(`${part.id} L${li + 1}: ${lines[li]}`);
    }
  }
  return matches.length > 0 ? matches.join('\n') : `no matches for pattern '${pattern}'`;
}

try {
  let content;
  if (grepPattern) {
    content = doGrep(traceFile, grepPattern);
  } else if (level === 'default') {
    content = renderMessages(traceFile, { lastOnly: true });
  } else if (level === 'conversation') {
    content = renderMessages(traceFile, { textOnly: true });
  } else if (level === 'extensive') {
    content = renderMessages(traceFile, {});
  } else if (level === 'max') {
    const sections = [renderMessages(traceFile, {})];
    for (const child of listChildren(traceDir, stepId)) {
      const childFile = path.join(traceDir, child.file);
      if (!fs.existsSync(childFile)) {
        sections.push(`--- subagent: ${child.agent ?? 'unknown'} ---\n[child file not found]`);
        continue;
      }
      try {
        jq('empty', childFile);
      } catch {
        sections.push(`--- subagent: ${child.agent ?? 'unknown'} ---\n[child file is not valid JSON]`);
        continue;
      }
      sections.push(`--- subagent: ${child.agent ?? 'unknown'} ---\n${renderMessages(childFile, {})}`);
    }
    content = sections.join('\n\n');
  }

  process.stdout.write(content);
  if (!content.endsWith('\n')) process.stdout.write('\n');
  const totalParts = jqJson('[.messages[].parts[]?] | length', traceFile) ?? 0;
  const bytes = Buffer.byteLength(content, 'utf8');
  process.stdout.write(`[trace: ${totalParts} parts total, ${bytes} bytes]\n`);
} catch (e) {
  process.stdout.write(`error reading trace: ${e.message}\n`);
  process.exit(0);
}
```

## What this replaces

| File | Action |
|---|---|
| `scripts/pipeline/trace-view.mjs` | Replace entirely (275 lines → ~150 lines) |
| `docs/trace-view-usage.md` | Delete (91 lines — the 4 levels + grep are self-evident from the script header) |
| `scripts/pipeline/reflect-prompt.mjs` | Rewrite lines 28-53 (25 lines of worked examples → ~6 lines of flag descriptions) |

## What stays unchanged

- `scripts/pipeline/record-trace.mjs` — upstream producer, no trace-view references
- `.opencode/agent/reflector.md` — methodology-only, no trace-view references
- `n8n/workflows/*.json` — no direct trace-view invocation (the Reflect node runs `reflect-prompt.mjs` which the reflector reads; trace-view is invoked by the reflector agent during investigation)
- `_bmad-output/pipeline/ledger.jsonl` — zero `nextStep` fields exist (the mechanism has never been exercised)
- `scripts/pipeline/apply-amendments.mjs` — schema writer, no flag references

## Research basis

- **Tool outputs can be 52KB per call** (measured on real coder trace) — must be excluded. Tool inputs are 20-80 bytes each — always included.
- **80% of messages in coder traces have no text part** (195 of 239 messages) — text-only rendering returns empty for these. Always rendering tool inputs makes every message non-empty.
- **Zero `nextStep` pointers exist in the ledger** — the `--include machinery` pointer in `reflect-prompt.mjs:45` is a prompt-embedded example, never persisted to any artifact.
- **Zero nested subagents exist** in the opencode DB — single-level walk in `max` is sufficient.
- **75 child sessions across 26 parents** verified — manifest schema confirmed end-to-end.
