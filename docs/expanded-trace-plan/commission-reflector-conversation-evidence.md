# Commission: Conversation evidence for the self-reflector

**Date:** 2026-07-05
**Status:** Commissioned — awaiting planning
**Scope:** Persist step conversation content and expose it to the reflection step via progressive disclosure. A dedicated reflector agent is commissioned separately and is out of scope here.

## Background

The self-improving pipeline runs a reflection step after every story (`reflect-prompt.mjs` → an opencode run → a proposal file → `apply-amendments.mjs`). The reflector's job is signal detection: decide what, if anything, the pipeline should learn from the run.

Today the reflector reads five evidence sources: the story's journal events, cross-run trends, the playbook, a tail of the ledger, and a tail of `runner-errors.jsonl`. For each playbook step it sees a `step_end` event carrying a `responseExcerpt` — a bounded slice (currently 2000 chars) of the step's **final** assistant message.

It does not see the conversation that produced that message: the agent's intermediate decisions, the questions it actually asked the human, the errors it hit and recovered from, the items it said it deferred, or the things it narrated doing next. The excerpt is a lossy summary of one moment in the step, not the step's story.

The data exists. Each step runs through `BMAD Session (OpenCode)`, which invokes `opencode run`. OpenCode persists the full session — reasoning, tool calls, intermediate messages, subagent activity, per-step cost and token accounting — to a local SQLite store. A verified export of a 96-second step produced 473 KB of structured JSON. The content is there; it just never reaches reflection.

## The need

A reflector that can only read lossy summaries of final answers cannot reason well about *why* a step behaved the way it did. Three classes of finding are systematically out of reach:

1. **Contradictions between metadata and narrative.** A step may be journaled as `success` with `halts: 1`, but the excerpt reads as mid-stream narration rather than a question. Without the conversation, the reflector cannot tell whether a real question was asked somewhere in the transcript, whether the halt was a false positive, or whether the excerpt is simply misleading. It can record the contradiction as a flat observation, but it cannot grade the cause or propose where a human should look.

2. **Transitional artifacts left unresolved.** The reflector is told to scan excerpts for markers of unfinished work ("skip", "todo", "stub", "placeholder", "FIXME") and check whether a later step resolved them. But the markers usually live in the full step output, not the 2000-char excerpt. The detection as specified today cannot actually work — the evidence it needs is not in the evidence it has.

3. **Deferred and escalated decisions.** When a step defers a finding or escalates a decision, the *reason* and the *decision class* are in the narrative, not the final summary. The reflector needs these to record `decision-policy-candidate-*` observations that are actionable rather than generic.

In all three, the reflector is a closed-world analyst: it reasons only about what the journal chose to record, and cannot follow evidence outward when the record is suspicious or thin. The result is low-value observations — "halt happened, dunno why" — that land in the human queue without triage signal, versus high-value observations that name a hypothesized cause and point at where to confirm it.

The fix is not a longer excerpt or a richer journal schema. Those overfit to specific past failures and still lose the narrative. The fix is to give the reflector access to the step's actual conversation content, with a disclosure model that keeps routine reflection cheap while letting the reflector dig deeper when the default view surfaces something worth pursuing.

## Verified facts about the evidence source

The following were verified against a real story 2.1 run (2026-07-03) and the OpenCode schema source. They constrain the design space and should be treated as established, not assumed.

**Access.** `opencode export <sessionID>` produces structured JSON (`info` + `messages[].parts[]`), source-derived from the schema, not empirically reverse-engineered. Export is post-hoc and retroactive: any past session is exportable by ID, re-exportable, regardless of how it was invoked. No run-invocation impact — the conversation runs exactly as it does today; export reads the session store afterward.

**Storage.** Sessions live in `~/.local/share/opencode/opencode.db` (SQLite, WAL mode). Read-only access is safe during a live run. The DB is outside the repo and dies with the machine/volume — persisted artifacts must land in the repo to be durable.

**Output shape.** `info` carries session-level metadata (`id`, `title`, `directory`, `parentID`, `cost`, `tokens`, timestamps). `messages[]` are ordered oldest-first; each has `info` (role) and `parts[]`. A typical assistant step produces: `step-start` → (`reasoning`)? → (`text` | `tool`)* → `step-finish`.

**Part types (12 total).** The taxonomy maps directly onto the narrative-vs-machinery split this commission needs:

| Category | Part types |
| --- | --- |
| **Narrative** (what the agent said and decided) | `text` |
| **Machinery** (how it acted, not what it concluded) | `reasoning`, `tool`, `file`, `step-start`, `step-finish`, `snapshot`, `patch`, `agent`, `subtask`, `retry`, `compaction` |

**Subagent sessions.** When a step delegates to a subagent (e.g., the planner spawning an Acceptance Auditor), the subagent gets its own `sessionID`, linked to the parent via `parentID`. The parent export shows the `tool` part (the Task call + result) but not the subagent's reasoning or text — that lives in the child session. Child sessions are part of the step's conversation story and must be included.

**Size.** A 96-second step produced 473 KB of export JSON. This is the concrete cost behind the filtering requirement: raw export fed directly into reflection would dominate token spend, especially across an 11-step story.

> **Warning — never load a full session transcript into memory.** The `tail -n 10` pipe on the OpenCode call nodes in n8n was introduced deliberately: long autonomy sessions were causing JavaScript memory-overflow failures because n8n was accumulating the entire `opencode run` output in memory as it processed. This is a hard-learned constraint, not a preference. Every part of this implementation — the recording step that persists the export, the disclosure interface that filters for the reflector, any n8n node that touches transcript content — must stream to and from disk and operate on bounded slices. Loading a full transcript into a single in-memory buffer reproduces the original failure mode. See the constraint in §Constraints and boundaries.

**Sanitization.** `opencode export --sanitize` redacts content values while preserving structure, IDs, counts, timing, cost, and tokens. Useful if a transcript ever needs sharing with a human to confirm a finding.

**Schema volatility.** The export schema is an internal contract of a fast-moving tool. The recording step should pin expectations (part-type names, field shapes) and fail soft — degrade to journal-only data if the schema changes, rather than crashing the pipeline.

## Requirements

### 1. Record step→session correlation

The pipeline must know which OpenCode session each step ran in. Today the journal does not record this; the `Extract SessionID` node inside `BMAD Session (OpenCode)` captures it, but the workflow's `Output` node returns only `finalResponse`.

**Decision: add `sessionId` to the `Output` node of `BMAD Session (OpenCode)`** (additive — existing callers that don't read the field are unaffected) **and journal it on the `step_end` event.** This is a one-line workflow change. n8n workflow modifications are allowed to achieve what this commission requests; the gen-1 freeze does not apply to this work.

This correlation is a prerequisite for every other requirement below — the pipeline cannot persist or index conversation content it cannot locate.

### 2. Persist full step conversation content as artifacts

The full session export — maximum data, all part types — must be persisted to the filesystem for each step, alongside the journal. The journal remains the event stream; these files hold the conversation content the journal deliberately does not. The pipeline records; the reflector reads — matching the existing journal pattern.

**Full fidelity at persistence time, filtering at read time.** The raw export is the persisted artifact. The narrative-vs-machinery filtering is a disclosure concern (requirement 4), not a persistence concern. The reflector never needs to look for alternate places for the same transcript data — widening its view means applying broader filters against the same persisted artifact, not reaching back to the live session store.

**Subagent content is included.** When a step spawned subagents, their child sessions (linked via `parentID`) are exported and persisted too, with the parent-child link preserved so the reflector knows they exist and can widen into them.

**Durability.** OpenCode history lives outside the repo and dies with the machine. Persisted artifacts must land in the repo. A subdirectory alongside the journal is acceptable, e.g. `_bmad-output/pipeline/traces/<runId>/<stepLabel>.json`.

**What is "substantive content" is a filtering question, not a persistence question.** The full export is voluminous and full of mechanical noise (thinking blocks, tool-call payloads, tool results, framework loading). That cost is managed by the disclosure model (requirement 3), not by persisting less. The persisted artifact is the full transcript; the reflector sees a filtered view of it.

### 3. Progressive disclosure with a minimal default

The reflector must be able to access these persisted artifacts **dynamically**, requesting more detail when the default view is insufficient. The disclosure model is progressive:

- **Default view: minimal.** The least content that could be useful — the agent's last substantive message (the last `text` part(s) of the final step). This is what the reflector sees for every step by default, and it should be cheap enough that routine reflection over an 11-step story stays bounded.
- **On-demand widening.** When the default view surfaces a candidate signal the reflector wants to pursue (a suspicious phrase, a contradiction with metadata, an unresolved marker), the reflector queries the same persisted artifact with expanded filters: earlier messages, the full narrative thread, the decisions and deferrals. The reflector iterates — it asks for more only when it feels it is missing something, not eagerly on every step.
- **Same tool, expanded filters.** Progressive disclosure means the reflector uses one disclosure interface and widens by relaxing its filters against the one persisted transcript. It does not look for alternate data sources for the same content. The full data is always there; the reflector controls how much it pulls.

The mechanism (a script the reflector invokes, an agent tool, an interface shape, or otherwise) is left to the planning agent. The requirement is the capability: a minimal default, progressive widening, and reflector-driven control over how much it pulls.

### 4. Filtering that separates narrative from machinery

Whatever the interface, it must distinguish the agent's substantive narrative from mechanical noise. The verified part-type taxonomy gives the boundary:

- **Narrative by default:** `text` parts — what the agent said and decided.
- **Machinery, filtered by default:** `reasoning` (thinking blocks), `tool` (call payloads and results), `file`, `step-start`, `step-finish`, `snapshot`, `patch`, `agent`, `subtask`, `retry`, `compaction`.

The filtering boundary is a design decision with a trade-off: stripping tool calls hides *which files the agent actually read versus claimed to read*, which can matter for some investigations. Because the full transcript is persisted (requirement 2), this loss is recoverable on demand — the reflector can widen its filter to include machinery parts when an investigation requires it, consistent with the progressive-disclosure model.

### 5. Give the reflector session IDs in its evidence context

The reflector's evidence context — built by `reflect-prompt.mjs` from the journal — must surface the session ID for each step. With `sessionId` journaled on `step_end` (requirement 1), the reflector already has it in the journal events it reads. `reflect-prompt.mjs` must ensure it is passed through, not dropped, so the reflector can:

- Locate the persisted artifact for the step.
- Reference the session in observations (so a human confirming a finding can find the original).
- Widen into subagent sessions by following `parentID` links the persisted artifact exposes.

## Constraints and boundaries

- **A dedicated reflector agent is commissioned separately.** It is out of scope here. The capability this commission describes should be usable by whatever reflector agent exists when it lands — it may be adopted, partially used, or ignored by that agent. Do not assume a specific agent identity, system prompt, or tool surface beyond what is needed to read files and invoke the disclosure interface.
- **No mutation of pipeline state by the reflector.** The reflector's only write remains its proposal file. Session content persistence is a recording-side concern (the pipeline writes; the reflector reads), not a reflector capability.
- **No n8n workflow write access, ever, for any automated agent.** There is no deterministic gatekeeper between an agent and n8n workflows equivalent to `apply-amendments.mjs` for the playbook. A reflector that can edit n8n workflows can modify the machinery that runs reflection — a self-modification loop with no human gate. This is out of scope for this commission and should remain out of scope generally. (This constrains runtime agent behavior. Development-time modifications to n8n workflows — such as adding `sessionId` to the `Output` node — are allowed and necessary to implement this commission.)
- **Schema volatility.** The OpenCode export schema is an internal contract of a fast-moving tool. Pin part-type names and field shapes in the recording step; fail soft (degrade to journal-only data) if the schema changes.
- **Never load a full session transcript into memory.** The `tail -n 10` pipe on the n8n OpenCode call nodes exists because long autonomy sessions caused JavaScript memory-overflow failures — n8n was accumulating the entire `opencode run` output in memory as it processed. The recording step (persisting the export), the disclosure interface (filtering for the reflector), and any n8n node that touches transcript content must all stream to and from disk and operate on bounded slices. Loading a full transcript into a single in-memory buffer reproduces the original failure mode. This is the reason the default view must be minimal and the widening must be filter-driven, not load-driven.
- **Do not overfit to resolved incidents.** The phantom-escalation postmortem (`postmortem-2026-07-05-phantom-escalation.md`) motivated this capability, but the underlying issue (output-token truncation) is already resolved by an env flag and the `halts` journaling gap is already fixed. Design for the general analytic need — the reflector's inability to follow evidence into the conversation narrative — not for reproducing that specific investigation.

## Success criteria

- The reflector can, for any step in the story it is reflecting on, read at least the agent's last substantive message without reading the raw session export.
- When the default view is insufficient, the reflector can widen its view of a specific step on demand, pulling more of the conversation narrative without pulling mechanical noise by default.
- Routine reflection runs (where the default view is sufficient for most steps) do not balloon in cost — the progressive model keeps the common case cheap.
- A reflector that detects a contradiction between journal metadata and step narrative can record an observation that names a hypothesized cause and a next step to confirm it, rather than a flat "something happened here."
- Subagent activity is not a blind spot: the reflector can see that a step delegated, and can widen into the subagent's narrative when the parent step's view is insufficient.
