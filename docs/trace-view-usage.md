# trace-view.mjs — usage reference

Progressive-disclosure reader for persisted opencode session transcripts. The reflector uses this to inspect step conversations without loading raw exports.

## Command

```
node scripts/pipeline/trace-view.mjs <runId> <stepId> [flags]
```

Reads the persisted artifact at `_bmad-output/pipeline/traces/<runId>/<stepId>.json` (produced by `record-trace.mjs`). Never pipes the live `opencode export`.

## Disclosure levels

Each level is a separate CLI invocation. Start with the default; widen only when the default surfaces a candidate signal.

| Flag | Returns | Cap | When to use |
| --- | --- | --- | --- |
| _(default)_ | Last message's `text` parts — the agent's final substantive message | 4000 chars | First look at any step |
| `--narrative` | All `text` parts across all messages | 20000 chars | Default view surfaced something; need the full narrative arc |
| `--from <msgId>` | Text parts from a specific message onward | 20000 chars | Spotted a signal at a specific point; want what followed |
| `--include machinery` | Adds `reasoning`, `tool`, `step-start`, `step-finish`, `patch` parts | inherits the level's cap | Need to see tool calls or model reasoning, not just narrative |
| `--grep <pattern>` | Matching lines from all `text` parts, with message context | none (scoped to matches) | Hunting for a specific marker (skip, TODO, FIXME, defer) — cheaper than `--narrative` |
| `--subagents` | Each child session's default narrative, prefixed with `--- subagent: <agent> (<sessionId>) ---` | 4000 chars per child | Step delegated to subagents; want to see what they concluded |
| `--full` | No cap on the current level | none | Focused sub-investigation; script still streams and reports total size |

Flags compose. For example: `--narrative --include machinery --full` returns every part of every message, uncapped.

## The trailing line

Every invocation ends with:

```
[view: <level>, <nParts> of <total> shown, <bytes> bytes]
```

Use `<nParts> of <total>` to judge whether widening is warranted. If you saw 1 of 375 parts, there is a lot more to read. If you saw 31 of 50, you have most of it.

## Widening paths

| If the default view shows... | Widen with... |
| --- | --- |
| A suspicious keyword (skip, TODO, FIXME, defer) | `--grep <keyword>` — scoped, cheap |
| A contradiction with the journal excerpt | `--narrative` — full narrative arc |
| A conclusion that doesn't match the mid-stream reasoning | `--from <msgId>` — resume from the point of interest |
| Tool-call behavior you need to verify | `--include machinery` — see tool calls and reasoning |
| A step that delegated to subagents | `--subagents` — see child session conclusions |
| A specific message you need to dig into | `--from <msgId> --include machinery --full` |

## Message IDs

Message IDs live at `message.info.id` in the export, format `msg_*` (e.g. `msg_f3203ff14001Y9Ig493pSyyx9H`). Get a message ID from the default view's output or from `--grep` results (which include the message ID in context).

## Degradation

- **Missing trace file** — prints "no trace for this step", exit 0. Fall back to the journal excerpt + produced artifacts. Do not treat a missing trace as a finding by itself.
- **Missing manifest** — reads the trace file directly (infers path from runId/stepId).
- **Malformed JSON** — prints "trace file is not valid JSON", exit 0.
- **`--from` with unknown msgId** — prints "message not found in this trace", exit 0.

## Cost discipline

- Default view for most steps. Most steps need no widening.
- Widen on suspicion, not eagerly.
- `--grep` is cheaper than `--narrative` when hunting for a specific marker.
- `--subagents` is on-suspicion — don't eagerly widen into every child.

## Citing trace evidence

Observations can cite trace locations in the `evidence` field:

```
traces/<runId>/<stepId>.json, message <msgId>
```

Prefer quoting the relevant snippet alongside the pointer, so the evidence is self-contained if the trace file is ever unavailable.

## Part types

Six part types are observed in opencode exports:

| Type | Category | Content |
| --- | --- | --- |
| `text` | narrative | The agent's substantive messages |
| `reasoning` | machinery | Model reasoning |
| `tool` | machinery | Tool calls |
| `step-start` | machinery | Marks a model step boundary |
| `step-finish` | machinery | Carries `reason`, per-step `cost`/`tokens` |
| `patch` | machinery | File patches |

The default and `--narrative` levels show only `text` parts. `--include machinery` adds the rest.
