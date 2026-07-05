# Trace channel comparison: `opencode export` vs `opencode run` → file

> Decision report for the gen-2 self-evaluation loop's trace source.
> Opencode version: `v1.17.13`. The two channel contracts are folded in below (§2) so this
> document stands alone — the export contract from the schema source, the run contract from
> empirical observation.

## 1. Scope and use case

The gen-2 loop's reflection step must answer *why* a story run behaved the way it did — not just
*whether* it succeeded. The questions that matter (drawn from `PLAN-self-eval-trace-source.md` and
`docs/self-improving-system-concept.md`):

- Why did a step stall or take an outlier duration?
- What did the agent try before giving up, and how much rework happened?
- What tool calls were made, with what inputs and outputs?
- What did the agent reason (thinking) at each step?
- Were subagents delegated to, and what did they conclude?
- What did each step cost in tokens and dollars?

Today none of this reaches reflection: `opencode run` output is piped through `tail -n 10`, which
discards reasoning, tool calls, intermediate output, and per-step cost/tokens. The journal records
only timings, status, a 2000-char response excerpt, and halt counts.

Two channels can close this gap. This report compares them.

## 2. The two channel contracts

### 2.1 `opencode export` — post-hoc, source-derived

**Command:** `opencode export [sessionID] [--sanitize]`

Exports a single session as pretty-printed JSON to stdout (2-space indent, trailing EOL). A status
line goes to stderr. If `sessionID` is omitted, launches an interactive picker over recent
sessions. If the ID is not found, exits non-zero. No other flags affect output shape.

Source of truth: `packages/schema/src/v1/session.ts` and `packages/opencode/src/cli/cmd/export.ts`
— i.e. the schema is source-derived, not empirically reverse-engineered.

**Output shape:**

```
{
  info: SessionInfo,                 // session-level metadata
  messages: Array<{                  // ordered, oldest first
    info: User | Assistant,          // discriminator: info.role
    parts: Array<Part>               // discriminator: part.type
  }>
}
```

`info` carries `id`, `slug`, `projectID`, `directory`, `title`, `agent?`, `model?`, `version`,
`cost?`, `tokens?` (`{ input, output, reasoning, cache: { read, write } }`), `summary?`, `parentID?`,
`time` (`{ created, updated, compacting?, archived? }`), and more.

**Part types (12 total):**

| `type`        | Carries                                                | Notes                                                                                                                                    |
| ------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `text`        | `text`, `time?`, `metadata?`                           | Visible user/assistant prose.                                                                                                            |
| `reasoning`   | `text`, `time` (`{ start, end? }`), `metadata?`        | The model's internal thinking. Full text preserved.                                                                                      |
| `tool`        | `tool`, `callID`, `state`, `metadata?`                 | `state.status` ∈ `pending` \| `running` \| `completed` \| `error`. Completed carries `input`, `output`, `title`, `time`, `attachments?`. |
| `file`        | `mime`, `url`, `filename?`, `source?`                  | `source` discriminated by `source.type` (`file` \| `symbol` \| `resource`).                                                             |
| `step-start`  | `snapshot?`                                            | Marks the start of one model step.                                                                                                       |
| `step-finish` | `reason`, `snapshot?`, `cost`, `tokens`                | `reason` e.g. `tool-calls`, `stop`. Per-step cost/token accounting.                                                                      |
| `snapshot`    | `snapshot`                                             | A git-tree hash captured at a point in the session.                                                                                      |
| `patch`       | `hash`, `files[]`                                      | A recorded file change.                                                                                                                  |
| `agent`       | `name`, `source?`                                      | An agent invocation marker.                                                                                                             |
| `subtask`     | `prompt`, `description`, `agent`, `model?`, `command?`  | A delegated subtask.                                                                                                                     |
| `retry`       | `attempt`, `error`, `time.created`                     | A retried model call.                                                                                                                    |
| `compaction`  | `auto`, `overflow?`, `tail_start_id?`                  | Context-window compaction marker.                                                                                                       |

A typical assistant step produces: `step-start` → (`reasoning`)? → (`text` \| `tool`)* → `step-finish`.

**`--sanitize`:** replaces content fields with `[redacted:<kind>:<partID>]` (strings) or
`{ redacted: "<kind>:<partID>" }` (objects). Structure, IDs, counts, and timing are preserved;
only sensitive values are stripped. Notably **not** redacted: `cost`, `tokens`, `time`, `finish`
`reason`, `tool` name and `callID`, part `id`s, and overall message/part structure. A sanitized
export still lets you reconstruct *what* was done and *what it cost* — just not the content.

**Caveats:**

- A step's `reasoning` and `step-finish` only appear once the step completes. Exporting a live
  session yields parts up to the last finalized one.
- When a subagent runs via the Task tool it gets its own `sessionID`. The parent export shows the
  `tool` part (call + result) but not the subagent's `reasoning` parts — export the child session
  for those. Children are linked via `parentID`.
- `reasoning` parts capture only what the provider streamed. If a model did internal reasoning it
  never emitted, or the provider/model has no extended-thinking support, no `reasoning` part exists.
- `reasoning` token count can be 0 even when `reasoning` parts are present — the count reflects
  billed reasoning tokens, not part presence.

### 2.2 `opencode run --format json` — live, empirically observed

**Command:** `opencode run [message..] --format json [--thinking] [--auto] [--agent <s>] [--session <id>] [--title <s>] [--model <s>]`

Emits a stream of JSON events to stdout, **one JSON object per line** (NDJSON). stderr is empty on
success; on failure the command exits non-zero.

**Empirically observed, not source-derived.** The contract below comes from a single simulated run
(`--format json --thinking --auto`) that triggered one `webfetch` tool call and produced 7 NDJSON
lines. Paths not exercised (errors, permission denials, other tools, multi-tool chains, subagents)
are inferred and unverified.

**Flags affecting JSON output:**

| Flag               | Effect on output                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `--format json`    | Selects NDJSON event stream (alternative is `default`, the formatted TUI render).                         |
| `--thinking`       | Emits `reasoning` parts. Without it, no `reasoning` events appear — thinking is silently absent.          |
| `--auto`           | Auto-approves permissions. Documented equivalent of the undocumented `--dangerously-skip-permissions`.     |
| `--agent`          | Selects the agent; does not change the event schema.                                                     |
| `--session`        | Continues an existing session; the continued `sessionID` appears in every event.                         |
| `--title`          | Sets the session title; surfaced in `opencode export`, not in run stdout.                                |
| `--model`          | Selects the model; does not change the event schema.                                                     |

**Output envelope:**

```
{
  type: string,          // snake_case event discriminator
  timestamp: number,     // Unix epoch, milliseconds
  sessionID: string,     // "ses_…"
  part: {                // the detailed payload
    id: string,          // "prt_…"
    messageID: string,   // "msg_…"
    sessionID: string,   // "ses_…"
    type: string,        // kebab-case discriminator (note: differs in case style from top-level type)
    ...                  // type-specific fields
  }
}
```

**Case-style mismatch:** top-level `type` uses `snake_case` (`step_start`, `step_finish`,
`tool_use`); `part.type` uses `kebab-case` (`step-start`, `step-finish`, `tool`). Single-word
types (`reasoning`, `text`) are identical at both levels.

**Event types (5 observed):**

| Top-level `type` | `part.type` | Carries in `part`                                                                                          |
| ---------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `step_start`     | `step-start` | `snapshot` (git-tree hash string)                                                                          |
| `reasoning`      | `reasoning` | `text` (thinking text), `time` (`{ start, end }`, ms)                                                     |
| `tool_use`       | `tool`      | `tool` (name), `callID` (`call_…`), `state` (`{ status, input, output, metadata, title, time }`)           |
| `text`           | `text`      | `text` (response text), `time` (`{ start, end }`, ms)                                                     |
| `step_finish`    | `step-finish` | `reason` (`stop` \| `tool-calls`), `snapshot`, `tokens` (`{ total, input, output, reasoning, cache: { write, read } }`), `cost` (number) |

**Event lifecycle:** one `opencode run` produces one or more **steps**. Each step is bounded by
`step_start` … `step_finish` and all parts within a step share the same `messageID`. A tool-calling
conversation produces at least two steps (model calls tool → tool result fed back → final answer).
A conversation with no tool calls produces a single step.

**`tool_use` detail (observed with `webfetch`; other tools may differ):**

```
part.state = {
  status: "completed",             // inferred: pending | running | completed | error (only "completed" observed)
  input: { url: "https://…" },      // tool-specific params
  output: "Example Domain\n\n…",    // string; tool result
  metadata: { truncated: false },   // tool-specific metadata
  title: "https://example.com (text/html)",
  time: { start, end }              // ms, when the tool ran
}
```

**`step_finish` accounting:** each carries per-step token and cost accounting
(`tokens: { total, input, output, reasoning, cache: { write, read } }`, `cost` in USD). `reasoning`
token count can be 0 even when `reasoning` parts are present. Cache reads dominate input tokens on
the second step (tool result fed back from cache).

**Caveats:**

- Empirically observed, not source-derived. Only five event types seen, from one `webfetch` run.
  Unobserved paths — tool errors, permission denials, `bash`/`read`/`write`/`edit`/`task` tools,
  multi-tool chains, subagent delegation — may produce additional event types or different `state`
  shapes. The `status` values `pending`, `running`, `error` are inferred, not witnessed.
- `reasoning` requires `--thinking`. Without the flag, reasoning events are never emitted. The
  thinking text is simply absent from stdout — there is no placeholder.
- Multiple steps, one session. All events across all steps share the same `sessionID`. Steps are
  distinguished by `messageID`. The first event is always `step_start` and carries `sessionID`.
- Stdout is a live stream, not a transcript. Events appear as they happen. `reasoning` and
  `step_finish` for a step only appear once that step completes. If the process is killed mid-step,
  the in-flight step's `step_finish` (and its token/cost accounting) is lost.
- `--dangerously-skip-permissions` is undocumented. It still works in v1.17.13 (accepted as a hidden
  alias of `--auto`) but does not appear in `opencode run --help`. If the alias is removed in a
  future version, runs using it will fail.

## 3. The two channels at a glance

| | **A. `opencode export` (post-hoc)** | **B. `opencode run --format json` → file (live)** |
| --- | --- | --- |
| When captured | After the conversation (or any past session, by ID) | During the conversation, streamed to stdout |
| Contract basis | Source-derived (`packages/schema/src/v1/session.ts`, `cmd/export.ts`) | Empirically observed from one `webfetch` run |
| Part types known | 12 (`text`, `reasoning`, `tool`, `file`, `step-start`, `step-finish`, `snapshot`, `patch`, `agent`, `subtask`, `retry`, `compaction`) | 5 observed (`step_start`, `reasoning`, `tool_use`, `text`, `step_finish`); 7 unverified |
| Output shape | Single pretty-printed JSON blob (`info` + `messages[].parts[]`) | NDJSON, one event per line, snake/kebab case mismatch |
| Reasoning capture | Always present in export if the provider streamed it during the run | Requires `--thinking` flag; without it, silently absent |
| Subagent reasoning | In a separate child session (linked via `parentID`); export the child | Unverified — behavior unknown |
| Sanitization | `--sanitize` flag (structure/IDs/counts/timing preserved, values redacted) | None |
| Retroactivity | Any past session, re-exportable | Only what was piped at run time; not recoverable after |
| Failure mode on crash | Completed parts stable in SQLite; in-flight step incomplete | In-flight step's `step_finish` (and token/cost accounting) lost |
| Impact on the run invocation | None — export reads the session store after the fact | Adds `--format json --thinking` + redirect; `--thinking` may affect model behavior |
| Touches frozen gen-1 workflow? | No (only the optional durable-`sessionId` Output-node change, already flagged in the plan) | Yes — modifies the `Agent run` wrapper in `BMAD Session (OpenCode)` |
| Durability | Depends on `opencode.db` surviving (outside repo); plan proposes repo-resident digests | File written to runner cwd; must be moved into repo to survive machine death |

## 4. Dimension-by-dimension analysis

### 4.1 Completeness of the trace — export wins, structurally

Export documents 12 part types. Run observed 5. The gap is structural, not theoretical: `file`
and `patch` are first-class part types in export's documented taxonomy but are entirely absent
from the run stream's observed events. `patch` records file changes; `file` carries attachments
inside tool outputs. A run-to-file channel would silently drop at least these, and the run
contract explicitly flags `subtask`, `retry`, `compaction`, `snapshot`, and `agent` as inferred
and unverified.

This gap matters specifically for self-evaluation. The questions the plan wants answered map
directly onto the unverified part types:

- `retry` — "how much rework happened / what did the agent try before giving up"
- `compaction` — "why did this step stall" (context-window compaction is a stall cause)
- `subtask` — "were subagents delegated to" (the planner delegates to reviewers, auditors)
- `patch` — "what files changed" (rework signal)

Betting the trace record on the run stream means betting on event types and field shapes that have
never been witnessed for exactly the scenarios self-evaluation cares about most.

### 4.2 Contract stability — export wins

Export is documented against the schema source files. Breaking changes would be a versioned
schema migration, observable in the opencode changelog.

The run stream is an internal event bus. Three signals:

1. The run contract is empirically observed, not source-derived, from a single simulated run.
2. The case-style mismatch (top-level `type` is `snake_case`; `part.type` is `kebab-case`) suggests
   the stream is assembled from two different layers without a unified public contract.
3. `--dangerously-skip-permissions` is an undocumented hidden alias of `--auto` — the run CLI
   surface is partly undocumented even for flags that are in active use.

For a trace record that becomes durable evidence (and that future reflections will re-read across
opencode version upgrades), contract stability is not optional. The run stream could change shape
between versions with no announcement.

### 4.3 Reasoning capture — export wins, with one critical unknown

Export always includes `reasoning` parts if they exist in the persisted session. No flag is needed
at export time.

Run requires `--thinking`. Without it, no `reasoning` events appear — thinking is silently absent.
This is a footgun: a run invoked without `--thinking` produces a trace that looks complete but is
missing the single most valuable signal for self-evaluation, and nothing in the output tells you
it's missing.

**Critical unknown (see §6):** does `--thinking` affect what is *persisted* to the session (and
thus exportable later), or only what is *streamed* to stdout? Export's `reasoning` parts capture
"what the provider streamed." If `--thinking` governs whether the provider is asked to stream
reasoning at all, then a run invoked without `--thinking` produces a session with no reasoning
parts — and export cannot recover them. If `--thinking` only mirrors to stdout reasoning that is
persisted regardless, export recovers it. This distinction determines whether the export channel is
truly zero-impact on the run invocation.

### 4.4 Subagent handling — export wins (documented remedy vs unknown behavior)

The BMAD pipeline delegates heavily: the planner spawns subagents (Acceptance Auditor, Blind
Hunter, etc.), each of which gets its own `sessionID`.

- **Export:** the parent session shows the `tool` part (the Task call + result). The subagent's
  reasoning lives in a separate child session linked via `parentID`. The remedy is documented and
  mechanical: export the child session too. The plan's `step-trace.mjs` can walk `parent_id`
  links.
- **Run:** subagent delegation is in the explicitly unverified list. The run contract does not
  know whether subagent activity produces additional event types, nested events, or a separate
  stream. For a pipeline whose evaluation questions are largely about subagent behavior, this is a
  serious blind spot.

### 4.5 Timing and robustness — export wins

Export is post-hoc and retroactive: any past session can be exported by ID, re-exported, and
exported regardless of how it was invoked (interactive, `opencode run`, `opencode serve`). The
session is the unit, not the invocation.

Run is a live stream with no retroactivity. If the pipe breaks, the redirect is forgotten, or the
process is killed mid-step, the in-flight step's `step_finish` (and its token/cost accounting) is
lost forever. You cannot re-stream a past run.

The export channel's one robustness gap — dependence on `opencode.db` surviving — is shared by the
run channel in practice: a run-to-file captured to the runner's cwd dies with the machine/volume
unless moved into the repo, which is the same durability remedy the plan already proposes
(repo-resident digests).

### 4.6 Operational complexity and architecture fit — export wins

The pipeline already invokes `opencode run` for each step via `BMAD Session (OpenCode)`. The plan
explicitly lists the only authorized touches to that frozen gen-1 workflow:

- the `Agent run` command wrapper (timeout, output salvage, `runner-errors.jsonl`)
- the `Output` node (adds `questionCount`)

The export channel adds **none** of these touches. It introduces a new read-only script
(`step-trace.mjs`) that runs after the step completes and reads from local session history. The
optional durable-`sessionId` change to the Output node is already flagged in the plan as a
future option behind the gen-1 freeze revisit.

The run channel requires modifying the `Agent run` wrapper to add `--format json --thinking` and
a redirect. That is a new touch to a frozen workflow, outside the authorized set. It also changes
the run invocation itself: `--format json` switches off the default TUI render, and `--thinking`
may change model behavior. The current pipeline doesn't use `--format json` at all — it tails the
default formatted output. Switching formats is a behavior change, not just a capture change.

### 4.7 Cost and storage — export wins (on-demand, suspicion-proportional)

Export is zero-overhead at run time (a SQLite read afterward) and supports the plan's "digest
first, full export only on suspicion" pattern directly: most uneventful steps produce only a small
digest; full exports are pulled on demand for anomalous steps. Token spend in reflection stays
proportional to how eventful the run was.

Run-to-file captures everything always. A single step's export is substantial (reasoning text,
tool inputs/outputs, file attachments); a full story with many steps multiplies that, written to
disk whether or not anyone will ever read it. The digest pattern can be layered on top
(write the file, then digest and discard), but that is wasted I/O for the common case and still
leaves the full file as the canonical record unless you delete it (losing drill-down ability).

### 4.8 Sanitization and sharing — export wins

Export has `--sanitize`: redacts content values while preserving structure, IDs, counts, timing,
cost, and tokens. The plan notes this is useful if a transcript ever needs sharing.

Run has no sanitization. Sanitizing NDJSON after the fact is possible but is bespoke work, and
the case-style mismatch makes it annoying.

### 4.9 Live observability — run wins (but it is not the requirement)

The run stream is the only channel that supports *live* monitoring of a step in progress (e.g.,
detecting a stalled step and intervening mid-run). Export only has completed parts.

This is a real advantage but it does not match the requirement. The requirement is post-hoc
self-evaluation: "after each story, reflect on what happened." The journal already records
`step_start`/`step_end` for orchestration-level timing and stall detection; the gap is the
*content* of completed steps, which export covers fully.

## 5. The one place run-to-file is genuinely useful

If a future requirement adds *live* step monitoring (streaming progress to a dashboard, detecting
runaway steps mid-flight), the run stream is the right primitive for that narrow job. The
recommendation below keeps that option open without making it the evidence of record.

## 6. Critical unknown — `--thinking` and persistence

This is the single most important open question, and it must be resolved before either channel is
committed to:

> Does `opencode run --thinking` affect what is **persisted** to the session store (and therefore
> exportable later), or only what is **streamed** to stdout?

- **If persistence is flag-independent** (reasoning is persisted whenever the provider/model
  streams it, regardless of `--thinking`): the export channel is fully zero-impact. Existing runs
  already have reasoning in their sessions; export recovers it. Recommendation stands as-is.
- **If persistence requires `--thinking`**: then even the export channel requires the run to have
  been invoked with `--thinking`. This means the export channel is not fully zero-impact — it
  still needs the run wrapper to pass `--thinking`. The recommendation still holds (export
  remains the better canonical record), but implementation cost rises and the "no frozen-workflow
  touch" advantage shrinks.

**Verification (small, local, low-risk experiment):** run the same short prompt twice via
`opencode run` — once with `--thinking`, once without — against a model that supports extended
thinking. Export both sessions. Diff the `reasoning` parts. If the no-`--thinking` export has no
reasoning parts, persistence is flag-gated. This takes minutes and settles the question.

A second, related unknown: does the *default* `opencode run` (no `--format json`, the way the
pipeline invokes it today) persist reasoning at all? The pipeline has never passed `--thinking`,
so if persistence is flag-gated, the existing story runs have no recoverable reasoning regardless
of channel — only future runs would benefit.

## 7. Recommendation

**Use `opencode export` as the trace channel for pipeline self-evaluation.** This aligns with
the plan's existing recommendation and fits the architecture without touching frozen workflows.

Rationale, in priority order:

1. **Completeness.** Export captures the full 12-part taxonomy, including `retry`, `compaction`,
   `subtask`, and `patch` — the part types that directly answer the self-evaluation questions.
   `file` and `patch` are absent from the run stream's observed events.
2. **Contract stability.** Source-derived vs empirically observed from one run. For a durable
   evidence record read across version upgrades, this is decisive.
3. **Zero impact on the run invocation.** No `--format json`, no `--thinking` (subject to §6),
   no redirect, no frozen-workflow touch. The conversation runs exactly as it does today.
4. **Retroactivity and robustness.** Any past session is exportable by ID; no mid-step-loss
   problem; single JSON blob easy to digest and cap.
5. **Suspicion-proportional cost.** Digest first; full export only on anomaly. Most steps produce
   a small digest; reflection token spend stays bounded.
6. **Subagent model is documented and addressable.** Walk `parent_id` links to child sessions.

**Keep the run-to-file channel as a complementary live-observability option, not the canonical
record.** If live monitoring becomes a requirement, pipe `--format json` to a sidecar file for
live tailing, but treat the export as the evidence of record. Do not make the run file the
durable trace — its contract is too unstable and too incomplete.

## 8. Risks and unknowns

| Risk / unknown | Severity | Mitigation |
| --- | --- | --- |
| `--thinking` persistence semantics (§6) — unknown whether export recovers reasoning for runs invoked without the flag | **High** — could change implementation cost | Run the verification experiment before committing. If flag-gated, add `--thinking` to the run wrapper (a new authorized touch to flag with Marius). |
| Opencode schema is an internal contract of a fast-moving tool | Medium | Pin expectations in `step-trace.mjs`; fail soft (digest degrades to journal-only data if the DB layout changes). Already noted in the plan. |
| `opencode.db` lost on machine/volume death | Medium | Write repo-resident digests (not full exports) to `_bmad-output/pipeline/traces/<runId>.json`. Full exports stay on demand. Already proposed in the plan. |
| Title-based step→session correlation assumes step labels stay unique per story run | Low–medium | If a playbook ever gains two same-label steps, switch to the durable `sessionId` in the Output node (option 2 in the plan). |
| Subagent reasoning requires exporting child sessions — easy to miss a child | Low | `step-trace.mjs` walks `parent_id` links and lists child sessions in the digest; drill-down exports them on demand. |
| Reflection prompt token budget vs. large exports | Low | Digest-first pattern already addresses this; full export only on suspicion, with size cap. |
| Run channel as live sidecar could drift in event shape across versions | Low (if kept non-canonical) | Only used for live tailing, never as evidence of record; re-derived from export when needed. |

## 9. What this report does not cover

- Whether to write digests to the repo (the plan's "durable trace artifacts" decision) — that is
  a separate decision; this report only establishes which channel feeds the digest.
- The `step-trace.mjs` script design — the plan already specifies its outputs (duration, cost,
  tokens, tool-call inventory, reasoning-step count, Q/A count, subagent sessions, error markers,
  sessionID for drill-down).
- Whether to add `sessionId` to the gen-1 `Output` node — that is the plan's option 2, gated
  behind the gen-1 freeze revisit, and independent of the channel choice.
