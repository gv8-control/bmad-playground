# Plan: Conversation evidence for the self-reflector

**Date:** 2026-07-05
**Status:** Draft — S3 spike complete; ready for execution
**Commission:** `docs/expanded-trace-plan/commission-reflector-conversation-evidence.md`
**Scope:** Persist step conversation content and expose it to the reflection step via progressive disclosure. The reflector agent itself is out of scope.

## 1. Objective — restated and confirmed

Give the post-story reflector access to the **actual conversation content** of each playbook step (the opencode session transcript), with a disclosure model that keeps routine reflection cheap while letting the reflector dig deeper on demand. This closes the three classes of finding the commission names as systematically out of reach: metadata/narrative contradictions, unresolved transitional artifacts, and deferred/escalated decisions.

The deliverable is a **record-side** capability (the pipeline persists full-fidelity transcripts per step) and a **read-side** capability (a disclosure interface the reflector widens on demand), plus the **integration** that teaches the reflector to use them. No reflector agent changes; no n8n write access for any automated agent.

**Assumptions called out (not silently absorbed):**

- The reflector runs as whatever agent the `Reflect` node invokes (today `--agent planner`); the integration point is the per-run prompt (`reflect-prompt.mjs`), not a specific agent identity. This matches the commission's "do not assume a specific agent" constraint.
- "Full fidelity at persistence time" means all part types are preserved; it does **not** mandate byte-for-byte identity with `opencode export` stdout. A stream-friendly container that preserves every field is acceptable if it is the only way to honor the never-in-memory constraint. (See §6, decision D2.) **S3 correction:** the spike observed 6 part types (`text`, `reasoning`, `tool`, `step-start`, `step-finish`, `patch`), not 12 — see §11 for the verified schema.
- The gen-1 freeze is lifted **only** for the one additive `sessionId` assignment on the `Output` node, as the commission explicitly authorizes.

## 2. Context and constraints

### What was verified against the codebase

| Fact                                                                                                            | Where verified                                         | Implication                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Extract SessionID` node already extracts `sessionId` from the first stdout line                                | `C8qzMFk2e00sLHJg.json:339-349`                        | The ID is in the workflow's data flow; the `Output` node just doesn't surface it. Requirement 1 is a one-line addition.                                                                                  |
| `Output` node is a `Set` node emitting `finalResponse` + `questionCount`                                        | `C8qzMFk2e00sLHJg.json:160-186`                        | Adding a `sessionId` assignment is additive; existing callers that don't read it are unaffected.                                                                                                         |
| `Assess step result` Code node builds the `step_end` payload from `item.finalResponse`/`item.questionCount`     | `GGiJ7KGUez94SaOc.json:219-231`                        | This is where `sessionId` is journaled and where a recording command is wired. Gen-2 workflow (not frozen).                                                                                              |
| `step_end` event shape today: `ts, type, story, runId, step, index, status, durationMs, responseExcerpt, halts` | `journal.jsonl` (verified via tail)                    | `sessionId` is a new additive field; `journal.mjs trends` ignores unknown fields, so no trend-script change needed.                                                                                      |
| `step` field is kebab-case, unique per story run                                                                | `journal.jsonl` distinct values                        | Safe to use as the trace filename: `traces/<runId>/<stepId>.json`.                                                                                                                                       |
| Reflector invoked as `opencode run --agent planner` with `reflect-prompt.mjs` output                            | `7akkpjTdEW6RMIJG.json:339`                            | The per-run prompt is the sole integration point. `.opencode/agent/reflector.md` exists but is dormant in the loop — a pre-existing discrepancy, out of scope here.                                      |
| Channel decision already made: use `opencode export` (post-hoc, source-derived), not run-to-file                | `trace-channel-comparison.md` §7                       | This plan inherits that decision; it does not re-litigate it.                                                                                                                                            |
| Node v24 (`node:sqlite` experimental available), `jq 1.7` available                                             | toolchain check                                        | Child-session discovery can query the opencode SQLite DB directly; jq can stream-filter large JSON without loading it whole.                                                                             |
| `opencode export` writes pretty-printed JSON to stdout; a 96s step = 473 KB | commission §"Size"; `trace-channel-comparison.md` §2.1 | Confirmed by S3 spike: export writes pretty-printed JSON (2-space indent). A 464K-token NFR review = 2.2 MB. The never-in-memory constraint is honored conservatively (see §6, D3). **Caveat:** piping `opencode export \| jq` is unreliable (jq reads mid-stream); writing to a file first is required — see D3. |
| **S3 spike — `session.parent_id` column exists and is indexed** | `opencode.db` schema (read-only query) | `session` table has `parent_id text` column with `session_parent_idx` index. `EXPLAIN QUERY PLAN` confirms indexed `SEARCH`. Query runs in 0.70 ms against the live 1.4 GB DB with active WAL. |
| **S3 spike — `node:sqlite` (experimental) is stable for read-only child lookup** | spike script `s3-spike.mjs` | `DatabaseSync` with `{ readOnly: true }` works; only an `ExperimentalWarning` (harmless). No fallback to `sqlite3` CLI needed (though available). Assumption A1 verified. |
| **S3 spike — playbook-step (planner) sessions spawn enumerable children** | `opencode.db` query | 83 child sessions exist. Planner sessions for review steps delegate 3–4 children each (e.g. "Code review (3.7)" → 3, "NFR review (2.3)" → 4). Child `agent` values are opencode subagent types (`general`/`explore`/`coder`), NOT BMAD persona names. |
| **S3 spike — export pipe-to-jq is unreliable; file-based jq is reliable** | spike: `opencode export <sid> \| jq` fails (parse error, mid-stream read); `opencode export > file; jq file` works | S4's design (stdio → file write stream) is correct and validated. S6 must read the persisted file, never pipe the live export. See D3. |
| **S3 spike — export schema documented** | spike inspection of 2 exports + 12-session sample | Top-level keys: `info`, `messages`. Messages have only `{info, parts}`; message ID is at `message.info.id` (`msg_*`), NOT top-level. 6 part types observed: `text`, `reasoning`, `tool`, `step-start`, `step-finish`, `patch`. `step-finish` carries `reason` + per-step `cost`/`tokens`. `info` block carries session-level `cost`, `tokens`, `agent`, `model`, `summary`, `parentID`. See §11 for full schema. |

### Hard constraints (from the commission, non-negotiable)

1. **Never load a full session transcript into a single in-memory buffer.** The `tail -n 10` pipe exists because n8n memory-overflowed on long autonomy sessions. Every component — recording, disclosure, any n8n node touching transcript content — must stream to/from disk and operate on bounded slices.
2. **No n8n workflow write access for any automated agent, ever.** Development-time edits (the `Output` node change, the recording node) are allowed and necessary; runtime agent edits to n8n are permanently out of scope.
3. **Schema volatility.** Pin part-type names/field shapes in the recording step; fail soft (degrade to journal-only data) if the opencode export schema changes. **S3 reference:** the 6 part types to pin are `text`, `reasoning`, `tool`, `step-start`, `step-finish`, `patch` (see §11).
4. **The reflector's only write is its proposal file.** Persistence is a recording-side concern (pipeline writes; reflector reads).
5. **Do not overfit to the resolved phantom-escalation incident.** Design for the general analytic need.

## 3. Approach

Three seams, matching the system's existing record/read split:

```
RECORD SIDE (pipeline writes)              READ SIDE (reflector reads)
┌──────────────────────────────┐          ┌──────────────────────────────┐
│ BMAD Session (OpenCode)       │          │ reflect-prompt.mjs            │
│  └─ Output node += sessionId  │          │  └─ evidence source #6: trace │
│                                │          │     + disclosure discipline   │
│ Develop Story (Playbook)       │          │                               │
│  └─ Assess step result:        │          │ trace-view.mjs                │
│       journal step_end.sid     │          │  └─ default minimal view     │
│       + record-trace.mjs call  │          │  └─ --narrative / --from     │
│                                │          │  └─ --include machinery      │
│ record-trace.mjs               │          │  └─ --subagents              │
│  └─ spawn opencode export →file│  traces/ │     (streams file, bounded)  │
│  └─ discover+export children   │◄─────────│                               │
│  └─ manifest + fail-soft       │  read    │ reflector widens on suspicion │
└──────────────────────────────┘          └──────────────────────────────┘
```

**Why this decomposition:**

- **Record-side logic lives in a script (`record-trace.mjs`), not in n8n Code nodes.** This matches the established pattern: all deterministic pipeline logic lives in `scripts/pipeline/*.mjs` (dependency-free, reviewable, versioned). n8n nodes only shell out to them.
- **The transcript never enters n8n memory.** `record-trace.mjs` spawns `opencode export` with `stdio` routed straight to a file write stream; n8n's executeCommand captures only the script's small JSON summary, never the transcript. This is the direct analogue of why `tail -n 10` exists.
- **One disclosure interface, filter-driven widening.** The reflector uses one tool (`trace-view.mjs`) and widens by relaxing filters against the one persisted artifact — never by reaching for alternate data sources. This is the commission's explicit requirement 3.
- **The journal stays the orchestration spine; traces hold the content the journal deliberately doesn't.** `sessionId` on `step_end` is the correlation key. The journal excerpt remains the zero-dependency fallback when a trace is missing.

## 4. Steps

### S1 — Add `sessionId` to the `Output` node of `BMAD Session (OpenCode)`

- **What:** Add a third assignment to the `Output` Set node: `sessionId` = `={{ $('Extract SessionID').item.json.sessionId }}`.
- **Where:** `n8n/workflows/C8qzMFk2e00sLHJg.json`, node `Output` (the Set node at id `3156269c-...`).
- **Why:** Prerequisite for every other requirement — the pipeline cannot persist or index content it cannot locate. The ID is already extracted upstream; this just surfaces it to callers. This is the only gen-1 workflow touch, explicitly authorized by the commission.
- **Dependencies:** None.
- **Done when:** The `Output` node emits `sessionId` alongside `finalResponse`/`questionCount`; existing callers (Develop Story's `Run BMAD Session` → `Assess step result`) see the new field without breaking.

### S2 — Journal `sessionId` on `step_end`

- **What:** In the `Assess step result` Code node, add `if (item.sessionId) payload.sessionId = item.sessionId;` to the `step_end` payload (mirroring the conditional pattern already used for `halts`).
- **Where:** `n8n/workflows/GGiJ7KGUez94SaOc.json`, node `Assess step result` (jsCode at id `aba944ff-...`).
- **Why:** Makes the session ID a durable, queryable part of the journal — the correlation key the reflector and the view script use. Without this, trace files are orphaned from the journal.
- **Dependencies:** S1.
- **Done when:** A new `step_end` event in `journal.jsonl` carries `sessionId`; `journal.mjs story` output includes it; `journal.mjs trends` is unaffected (it ignores unknown fields).

### S3 — Spike: verify child-session discovery ✅ DONE

- **What:** Resolve the one genuine mechanical unknown: how to enumerate a step's subagent child sessions. Verify against the real opencode DB (`~/.local/share/opencode/opencode.db`): confirm the `session` table has a `parent_id` column and that `SELECT id FROM session WHERE parent_id = ?` returns child session IDs for a known delegating step.
- **Where:** Ad-hoc verification against the live DB (read-only, WAL-safe). Use `node:sqlite` (available, experimental) or `sqlite3`/`jq` as fallback.
- **Why:** This is the riskiest unknown in the record side. If child discovery can't be done deterministically, subagent content (a success criterion) is unreachable. Sequenced first so nothing is built on an unverified mechanism.
- **Dependencies:** None (can use any past delegating session).
- **Result:** **Verified.** The `session` table has a `parent_id text` column, indexed via `session_parent_idx`. The exact query `SELECT id, agent, title FROM session WHERE parent_id = ? ORDER BY time_created` returns child session IDs deterministically. Verified against `ses_0ce2d79f4ffeJTyXFBGknDtMoa` (a `thinker` parent with 8 children) and `ses_0d854a16cffegC99QAV44MABGU` (a `planner` "NFR review" parent with 4 children — a real playbook-step delegation). Query runs in 0.70 ms against the live 1.4 GB DB. `node:sqlite` (`DatabaseSync`, `{ readOnly: true }`) is stable — only an `ExperimentalWarning`; no fallback needed (assumption A1 confirmed). Child `agent` values are opencode subagent types (`general`/`explore`/`coder`), not BMAD persona names — the manifest should record `agent` so the reflector can distinguish child roles.
- **Mechanism for S4:** `node:sqlite` read-only, query `SELECT id, agent, title FROM session WHERE parent_id = ? ORDER BY time_created`, parameterized by the parent `sessionId`. No `sqlite3` CLI fallback required (available if ever needed).

### S4 — Build `record-trace.mjs` (the recording script)

- **What:** New script `scripts/pipeline/record-trace.mjs <sessionId> <runId> <stepId>` that:
  1. Creates `_bmad-output/pipeline/traces/<runId>/`.
  2. Spawns `opencode export <sessionId>` with stdout piped **directly to a file write stream** at `<runId>/<stepId>.json` (never into Node memory). **S3 caveat:** do NOT pipe `opencode export` stdout into `jq` or any parser directly — the live export stream is read mid-write by downstream consumers and produces parse errors. Writing to a file stream first is the only reliable path (verified in S3).
  3. Discovers child sessions via `node:sqlite` read-only query `SELECT id, agent, title FROM session WHERE parent_id = ? ORDER BY time_created` (S3-verified mechanism) and exports each to `<runId>/<stepId>.subagents/<n>-<shortChildId>.json`, streamed the same way.
  4. Writes a lightweight `<runId>/<stepId>.manifest.json` recording `{stepId, sessionId, file, subagents: [{sessionId, agent, file}], recordedAt, schemaOk: bool, cost, tokens}`. The `cost` and `tokens` fields are read from the export's top-level `info` block (`info.cost`, `info.tokens`) via a single bounded `jq` query against the persisted file — cheap, and enables the deferred trend-hook (§7.3.5, open question #1 resolved as yes).
  5. Pins the 6 part-type names observed in the spike (`text`, `reasoning`, `tool`, `step-start`, `step-finish`, `patch`) as the schema check. Fails soft: on missing session, non-zero opencode exit, or schema mismatch (pinned part-types absent from the file), writes a manifest with `schemaOk: false` / error note and exits 0 — never breaks the step loop.
- **Where:** `scripts/pipeline/record-trace.mjs` (dependency-free Node, matching `lib.mjs` conventions; add `PATHS.tracesDir` to `lib.mjs`). Uses `node:sqlite` (`DatabaseSync`, `{ readOnly: true }`) for child discovery — no `sqlite3` CLI dependency.
- **Why:** Centralizes all transcript-persistence logic in a reviewable script; keeps n8n nodes dumb shell callers; honors the never-in-memory constraint by construction (stdio → file). The manifest's `cost`/`tokens` enrichment is free at record time and saves a future trend-hook from re-reading transcripts.
- **Dependencies:** S3 (child-discovery mechanism — verified).
- **Done when:** Running the script against a known past sessionId produces `<stepId>.json` + child files + manifest; `wc -c` confirms non-trivial size; `jq '.messages | length'` parses the persisted file; memory profile of the script stays flat regardless of transcript size (verify with a large session, e.g. the 2.2 MB NFR review export); a deliberately-bad sessionId produces a fail-soft manifest, not a crash; the manifest carries `cost`/`tokens` from the `info` block.

### S5 — Wire recording into `Develop Story (Playbook)`

- **What:** Add a `traceCmd` to the `Assess step result` Code node output (alongside `journalCmd`): `node scripts/pipeline/record-trace.mjs "<sid>" "<runId>" "<stepId>"` when `item.sessionId` is present, empty string otherwise. Add an executeCommand node that runs `$json.traceCmd` after the journal-append executeCommand, gated to skip when `traceCmd` is empty.
- **Where:** `n8n/workflows/GGiJ7KGUez94SaOc.json`, after the existing journal executeCommand node.
- **Why:** Records per-step, matching the journal pattern; the sessionId is fresh and available exactly here; partial traces survive a mid-story failure. (Batch-in-Develop-Epic was considered and rejected — see §6, D1.)
- **Dependencies:** S2 (sessionId on the item), S4 (the script).
- **Done when:** A story run produces `traces/<runId>/*.json` per step; a step with no sessionId (hard opencode crash) skips recording without failing the loop; the step loop's latency impact is bounded (export is a SQLite read).

### S6 — Build `trace-view.mjs` (the disclosure interface)

- **What:** New script `scripts/pipeline/trace-view.mjs <runId> <stepId> [flags]` that reads the **persisted** artifact (never pipes the live `opencode export` — S3 verified this is unreliable) and prints a bounded, filtered slice to stdout. Flags implement progressive disclosure:
  - _(default)_: the last message's `text` part(s) — the agent's final substantive message. Char-capped (e.g. 4000). If absent, prints a one-line "no narrative in final step; widen with --narrative".
  - `--narrative`: all `text` parts across all messages (capped higher, e.g. 20000; reports truncation with a widen hint).
  - `--from <msgId>`: narrative from a specific message onward (lets the reflector resume after spotting a signal). **Schema note (S3):** message IDs live at `message.info.id` (format `msg_*`), NOT at a top-level message field. The filter matches `message.info.id == <msgId>`.
  - `--include machinery`: add `reasoning`/`tool`/`step-start`/`step-finish`/`patch` parts (still bounded). **Schema note (S3):** only 6 part types are observed in practice (`text`, `reasoning`, `tool`, `step-start`, `step-finish`, `patch`). The plan's earlier mention of `file`/`retry`/`compaction` part types is not borne out by the spike sample — handle them gracefully if they appear, but do not assume they exist.
  - `--grep <pattern>`: scan all `text` parts across the full step for a keyword/regex (e.g. "skip", "TODO", "FIXME", "defer") and return matching lines with message context. Cheap (streams the persisted file), directly addresses commission need #2 (transitional artifacts). Added per open question #2 (resolved as yes).
  - `--subagents`: include each child session's default narrative.
  - `--full`: no cap (the reflector uses this only for a focused sub-investigation; the script still streams and reports total size).
  - Always prints a trailing `[view: <level>, <nParts> of <total> shown, <bytes> bytes]` line so the reflector knows whether it truncated.
- **Where:** `scripts/pipeline/trace-view.mjs` (dependency-free Node; uses `lib.mjs`). Reads the persisted file with `jq` (streaming, bounded) — the persisted file is complete and parses cleanly (S3 verified); only the live export pipe is unreliable.
- **Why:** This is the read-side capability the commission's requirements 3 & 4 specify. One tool, filter-driven widening, bounded output → keeps the reflector's token spend proportional to how eventful the step is. The `--grep` flag makes the existing prompt's keyword-scan instruction workable against the full narrative (today the excerpt is too short for it to function).
- **Dependencies:** S4 (the artifact shape), S2 (the runId/stepId keys).
- **Done when:** Default view on a known step returns a small, useful slice; `--narrative` returns more; `--subagents` includes child narrative; `--include machinery` adds tool/reasoning; `--grep` returns matching lines with context; `--from` resumes from a `msg_*` ID; a missing trace file degrades to a clear "no trace for this step" message (not a crash); output size stays bounded at every level.

### S7 — Extend `reflect-prompt.mjs` with the trace evidence source + disclosure discipline

- **What:** Add to the evidence-gathering list a 6th source and usage guidance:
  - "Run `node scripts/pipeline/trace-view.mjs <runId> <stepId>` for any step whose journal excerpt surfaces a candidate signal. Default view is cheap; widen (`--narrative`, `--from`, `--include machinery`, `--subagents`) only when the default view is insufficient. Use `--grep <pattern>` to scan the full step narrative for transitional-artifact markers (skip, TODO, FIXME, defer) — this is cheaper than `--narrative` when hunting for a specific signal."
  - Reframe `responseExcerpt`: it is a **pointer** into the trace and a **fallback** when no trace exists — never the evidence itself. (This sharpens the existing "the journal excerpt is a pointer, not the evidence" line.)
  - State the cost discipline explicitly: default view for most steps; widen on suspicion, not eagerly. Most steps need no widening.
  - State the degradation path: if `trace-view` reports no trace for a step, fall back to the journal excerpt + produced artifacts (the existing evidence sources). Do not treat a missing trace as a finding by itself.
  - Tell the reflector it can cite trace locations in observation `evidence` (e.g. `traces/<runId>/<stepId>.json, message <msgId>`).
- **Where:** `scripts/pipeline/reflect-prompt.mjs`.
- **Why:** The reflector has no other way to learn the disclosure interface exists or how to use it. The agent system prompt (whether `reflector.md` or `planner.md`) already carries the methodology ("follow evidence into actual artifacts"); the per-run prompt carries the task-specific tool surface.
- **Dependencies:** S6 (the interface must exist to be referenced).
- **Done when:** The prompt names `trace-view.mjs`, describes default + widening, states cost discipline and degradation, and reframes the excerpt. A dry run of the prompt against a past runId reads sensibly.

### S8 — End-to-end verification + fail-soft paths

- **What:** Verify against a real past run (re-export a known sessionId from a completed story). Confirm each success criterion from the commission:
  1. Reflector can read the last substantive message of any step without reading the raw export.
  2. Reflector can widen a specific step on demand without pulling machinery noise by default.
  3. A routine reflection (default view sufficient for most steps) does not balloon in cost — measure the default-view byte size across a full 11-step story.
  4. A metadata/narrative contradiction can be recorded as a hypothesized cause + next step, not a flat observation.
  5. Subagent activity is visible; the reflector can widen into a child session.
  - Plus fail-soft: a deliberately-bad sessionId, a renamed part-type field, and a missing traces dir all degrade to journal-only reflection without crashing the loop.
- **Where:** Manual verification using `journal.mjs story <id>`, `record-trace.mjs`, `trace-view.mjs`, and a reflector prompt dry run.
- **Dependencies:** S1–S7.
- **Done when:** All five success criteria demonstrated; all three fail-soft paths demonstrated; findings recorded in this plan's Verification section.

## 5. Sequencing

**Critical path:** S1 → S2 → S4 → S5 → S6 → S7 → S8.

- **S3 (child-discovery spike) ✅ DONE:** ran in parallel with S1/S2 and de-risked S4. Result: `node:sqlite` read-only query against `session.parent_id` (indexed) is the verified mechanism — no fallback needed. S4 proceeds with confidence.
- **S1 and S2 are a tight pair** (one workflow each, both small, S2 depends on S1) — do them together.
- **S4 and S6 are the two script builds.** S6 depends on S4's artifact shape, so S4 leads. But S6's _interface design_ (flag set, output contract) can be drafted in parallel with S4's build — only the implementation needs S4 done.
- **S7 depends on S6** (you can't reference an interface that doesn't exist), but S7's _content_ can be drafted alongside S6.
- **S5 (wiring) depends on S2 + S4** — it's the integration of record-side pieces.
- **S8 is last** — it gates the whole plan.

```
S1 ──► S2 ──► S5 ──┐
                   ├──► S8
S3 ──► S4 ──► S6 ──┤
              └──► S7 ─┘
```

## 6. Decisions (with rationale)

- **D1 — Record per-step (in Develop Story playbook), not batch (in Develop Epic).** Per-step matches the journal pattern, keeps the sessionId fresh at the point of recording, and leaves partial traces if a story fails midway. Batch was considered (one node, decoupled from the step loop) and rejected: it doesn't match the journal pattern, and a crashed story leaves an incomplete journal to batch from. Per-step adds one fast SQLite-read node per step — acceptable.
- **D2 — Persist the raw `opencode export` output verbatim, not a reformatted container.** The commission says "the raw export is the persisted artifact." `opencode export` writes pretty-printed JSON (2-space indent, confirmed by S3). The view script (S6) streams it with `jq` (available, streams by default) rather than `JSON.parse`-ing the whole file — honoring the never-in-memory constraint without reformatting at persistence time. **S3 caveat:** `opencode export` stdout must be written to a file stream directly; piping it into `jq` or any parser mid-stream produces parse errors (jq reads before the export finishes writing). S4's design (stdio → file write stream) is correct; S6 reads the persisted file only. If `jq` streaming proves insufficient for very large sessions, the fallback is a bounded Node stream parser; reformatting to NDJSON at persistence time is the last resort (it changes the persisted shape and is recorded as a deviation from "raw export").
- **D3 — The view script streams with `jq`, not `JSON.parse`.** `jq` processes JSON as a stream and never materializes the whole document in the Node process. This is the conservative reading of the never-in-memory constraint, even though a single bounded file parse in a short-lived Node process is not the n8n accumulation failure the constraint was born from. Conservative is correct here because the constraint is explicitly "hard-learned." **S3 note:** `jq` reads the persisted file (complete on disk) — this is reliable. Only the live `opencode export | jq` pipe is unreliable; that path is never used.
- **D4 — Child discovery via `node:sqlite` (verified; no fallback needed).** S3 confirms `node:sqlite` (`DatabaseSync`, `{ readOnly: true }`) is stable for this read-only query — only an `ExperimentalWarning`, no instability. The recording script queries `SELECT id, agent, title FROM session WHERE parent_id = ? ORDER BY time_created` (indexed, 0.70 ms) rather than parsing the parent export for child references (fragile, schema-dependent). The `sqlite3` CLI remains available as a fallback if a future Node version changes `node:sqlite` semantics, but it is not required today.
- **D5 — `responseExcerpt` stays.** It is NOT made redundant (see §7). It is the zero-dependency fallback when a trace is missing (recording failure, schema change, pre-feature runs). Its _role_ shifts from primary evidence to pointer+fallback; the prompt (S7) reframes it.

## 7. Second-order effects, cross-cutting implications, and redundancy

The user asked for deep analysis here. This is the heart of the plan's honesty about impact.

### 7.1 Second-order effects on the self-improvement system

1. **Observation quality inverts from low-signal to high-signal — but volume may rise.** Today the reflector emits flat observations ("halt happened, dunno why") because it cannot see the conversation. With trace access, observations carry hypothesized causes and confirmable next steps — exactly the upgrade the commission wants. The flip side: a reflector with rich evidence tends to _find more things_, so ledger volume may increase even though each entry is sharper. The recurrence gate (≥2 distinct runs) still prevents premature amendments, but the ledger grows faster. **Mitigation:** S7 reinforces the reflector's "default to the null hypothesis" stance — more evidence ≠ more findings. This is a prompt-discipline matter, not a structural one.

2. **Hypothesis accumulation becomes a genuine cross-run investigation memory.** A `hypothesized` observation in run N can now say "confirm by widening into the subagent narrative of step X, message msg_abc" — and that pointer is confirmable in run N+1 because (a) traces persist in the repo, (b) sessionIds are stable in the journal, (c) message IDs are stable in the export. This is the intended positive effect: the ledger stops being a flat event log and becomes an accumulative investigation. The design supports this fully — no additional work needed beyond what S1–S7 specify.

3. **Token spend on reflection rises (controlled, proportional).** The floor is higher than today: the reflector reads at least the default view for every step it inspects, where today it read only the 2000-char excerpt. The progressive model keeps spend proportional to eventfulness, but if "minimal default" isn't minimal enough, routine reflection over an 11-step story gets expensive. **Mitigation:** S6 caps the default view tightly (last message's text parts, 4000 chars). The success criterion explicitly accepts a higher-but-bounded floor.

4. **The ledger now contains evidence pointers into trace files — a longevity coupling.** Observations recorded with `evidence: "traces/<runId>/<stepId>.json, message msg_abc"` create a durable reference. If trace files are ever garbage-collected, those pointers dangle. **Mitigation:** traces are durable evidence and must not be GC'd; the prompt (S7) should encourage self-contained evidence (quote the relevant snippet, don't only point). Flag this as a new consideration for the ledger's long-term hygiene — not blocking, but real.

5. **Subagent visibility is a genuinely new signal class.** Today the planner's delegation to reviewers/auditors is invisible. With traces, the reflector can see that a step delegated (`tool`/`subtask` parts) and widen into the child to ask "did the Acceptance Auditor actually verify X?" This can surface findings no current evidence source can. It also expands the reflector's evidence scope non-trivially — without usage discipline it will eagerly widen into every subagent (cost). **Mitigation:** S7 states subagent widening is on-suspicion, not eager.

### 7.2 Cross-cutting implications between self-improvement components

| Seam                                                                        | Implication                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reflect-prompt.mjs` ↔ `trace-view.mjs`                                     | The prompt must teach the interface (S7). Without it, the reflector never discovers the capability.                                                                                                                                                                                                                                                                                                  |
| `reflect-prompt.mjs` ↔ `reflector.md` (agent system prompt)                 | **Clean seam — no agent change needed.** The agent methodology already says "follow evidence into actual artifacts" and "the excerpt is a summary, not the record." The trace is just a new actual artifact. The per-run prompt carries the tool surface; the system prompt carries the methodology.                                                                                                 |
| `journal.mjs` ↔ `traces/`                                                   | `step_end.sessionId` is the correlation key. `journal.mjs trends` ignores unknown fields, so adding `sessionId` needs no trend-script change. Future: trends could fold in per-step cost from trace manifests (deferred — see §7.3).                                                                                                                                                                 |
| `apply-amendments.mjs` ↔ `traces/`                                          | **No direct change.** The gatekeeper reads the proposal, not traces. But proposals may now cite trace locations in `evidence` (freeform string — no schema change). The ledger inherits the trace-pointer longevity coupling (§7.1.4).                                                                                                                                                               |
| `runner-errors.jsonl` ↔ `traces/`                                           | A runner error (opencode crash) may mean no session was created → no trace. The reflector must handle "no trace for this step" gracefully — already analogous to how it handles missing runner-errors lines. S7 makes this degradation explicit.                                                                                                                                                     |
| `BMAD Outcome` / `INCOMPLETE` outcome (postmortem long-term fix) ↔ `traces` | The postmortem's proposed `INCOMPLETE` outcome would classify length-truncated steps. The trace's `step-finish.reason: "length"` is exactly the signal that investigation had to find manually. **Future cross-cut (out of scope):** once `INCOMPLETE` lands, it can be cross-checked against the trace. The trace artifact makes that future fix easier — a positive externality, not a dependency. |

### 7.3 What stays, what shifts, what's deferred

1. **`responseExcerpt` stays — but its role shifts.** It remains the zero-dependency fallback (no trace file needed) and a pointer into the trace. **Do not remove it.** The prompt (S7) reframes it from "primary evidence" to "pointer + fallback."

2. **Cost/token trending is deferred, not dropped.** The disclosure model's narrative default view does not surface cost/tokens (they live in `step-finish`, a machinery part). Cost-trending across stories is a separate future enhancement — the persisted artifacts contain the data, but no view or trend hook is built in this work.

## 8. Risks, assumptions, unknowns, decisions

| #   | Item                                                                        | Severity                                     | Mitigation / owner                                                                                                    |
| --- | --------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| R1  | Child-session discovery mechanism unverified (S3)                           | **Resolved** — S3 spike verified             | `session.parent_id` column exists, indexed (`session_parent_idx`); `node:sqlite` read-only query returns children deterministically in 0.70 ms. No fallback needed. |
| R2  | `jq` streaming insufficient for very large sessions                         | Medium                                       | S6 falls back to a bounded Node stream parser; last resort is NDJSON reformat at record time (D2 deviation recorded). |
| R3  | Opencode export schema changes (part-type names/fields)                     | Medium                                       | S4 pins expected part-type names; fail-soft manifest with `schemaOk: false`; reflector degrades to journal-only (S7). |
| R4  | Reflector eagerly widens on every step → token cost balloons                | Medium                                       | S7 states cost discipline explicitly; default view tightly capped (S6).                                               |
| R5  | Ledger evidence pointers dangle if traces are ever GC'd                     | Low–medium                                   | Traces are durable evidence (no GC); S7 encourages self-contained evidence (quote, don't only point).                 |
| R6  | Recording node adds per-step latency                                        | Low                                          | Export is a SQLite read (fast); measured in S8.                                                                       |
| R7  | Reflector runs as `planner` agent, not `reflector` agent (pre-existing)     | Low (out of scope)                           | Noted; the per-run prompt is the integration point regardless. Flagged for the separate reflector-agent commission.   |
| R8  | Mid-story failure leaves partial traces                                     | Low                                          | Acceptable — partial traces are useful; the manifest records what was captured.                                       |
| A1  | `node:sqlite` experimental stability is adequate for read-only child lookup | —                                            | **Verified in S3.** `DatabaseSync` with `{ readOnly: true }` works; only `ExperimentalWarning` (harmless). No instability observed. |
| A2  | The `Output` node change is truly additive (no caller breaks)               | —                                            | Verified by the Set-node structure; S8 confirms.                                                                      |
| A3  | `step` field stays unique per story run (filename safety)                   | —                                            | Verified against current journal; if a future playbook duplicates step labels, switch to `<stepId>-<index>`.          |

## 9. Verification

**Per-step done conditions** (S1–S8) are the primary gates. **End-to-end (S8)** verifies the commission's five success criteria against a real past run:

1. **Last substantive message without raw export** — `trace-view.mjs <runId> <stepId>` returns the final text part(s); the raw `<stepId>.json` is never opened by the reflector.
2. **On-demand widening without machinery noise** — `--narrative` returns text-only across messages; `--include machinery` is required to see tool/reasoning.
3. **Routine cost stays bounded** — sum of default-view byte sizes across an 11-step story is small (target: well under a single reflection prompt's budget); widening is opt-in.
4. **Contradiction → hypothesized cause + next step** — against the phantom-escalation run (session `ses_0d142e75effeqmGrh3pAURq8RW`), the reflector can see the mid-stream narration vs. the final "No HALT needed" and record a hypothesized cause pointing at the specific message. (This validates the capability against the motivating incident without overfitting to it — the incident is already resolved.)
5. **Subagent visibility** — a `review-code` step that delegated shows child sessions in the manifest; `--subagents` returns the child narrative.

**Fail-soft paths (S8):**

- Bad/missing sessionId → recording skipped, step loop continues, reflector falls back to journal excerpt.
- Renamed part-type → manifest `schemaOk: false`, reflector degrades to journal-only.
- Missing traces dir → `trace-view.mjs` prints "no trace for this step", reflector uses existing evidence sources.

## 10. Open questions

1. ~~**Should the manifest also record a per-step cost/token summary** (from the trace's `step-finish` parts) so `journal.mjs trends` can later fold in cost drift without re-reading transcripts?~~ **Resolved (S3): yes.** The export's top-level `info` block carries `cost` and `tokens` (input/output/reasoning/cache) at the session level, and each `step-finish` part carries per-step cost/tokens. S4's manifest now records `cost`/`tokens` from the `info` block — cheap (one bounded `jq` query against the persisted file), enables the deferred trend-hook (§7.3.5) without rework.
2. ~~**Should `trace-view.mjs` support a `--grep <pattern>` flag** so the reflector can scan the narrative for transitional-artifact markers ("skip", "todo", "FIXME") across the whole step without pulling the full narrative?~~ **Resolved (S3): yes.** Added to S6's flag set. The persisted file parses cleanly with `jq`, so `--grep` can stream-scan `text` parts across the full narrative cheaply. This makes the existing prompt's keyword-scan instruction workable (today the excerpt is too short for it to function). S7 references `--grep` in the prompt guidance.
3. **The reflector-agent discrepancy** (loop runs `--agent planner`; `reflector.md` exists but is dormant) — is the reflector-agent commission expected to switch the loop to `--agent reflector`? If so, S7's guidance must be agent-agnostic (it already is). Flagged for that commission, not this one.

## 11. Verified opencode export schema (S3 spike reference)

Documented here so the executors of S4 and S6 do not have to re-discover it. Verified against `opencode v1.17.13`, two exports (a 544 KB child session and a 2.2 MB planner session), plus a 12-session sample.

### Top-level shape

```
{ "info": {...}, "messages": [ {...}, ... ] }
```

Pretty-printed JSON (2-space indent, trailing EOL).

### `info` block (session-level metadata)

| Field | Example | Notes |
| --- | --- | --- |
| `id` | `ses_0cdfc0115ffe8abnuB883mU8Kq` | The session ID |
| `parentID` | `ses_0ce2d79f4ffeJTyXFBGknDtMoa` | Present if this is a child session; absent/null otherwise |
| `agent` | `general` / `explore` / `coder` / `planner` / `thinker` | opencode subagent type, NOT BMAD persona name |
| `model` | `{id, providerID, variant}` | Model used |
| `cost` | `0.518` | Session cost (USD) — **manifest-enriched in S4** |
| `tokens` | `{input, output, reasoning, cache: {read, write}}` | Session token totals — **manifest-enriched in S4** |
| `summary` | `{additions, deletions, files}` | Diff summary |
| `time` | `{created, updated}` | Epoch ms |
| `title`, `slug`, `directory`, `path`, `version`, `permission` | — | Other metadata |

### `messages` array

Each message has exactly two keys: `info` and `parts`. There is **no top-level `id`, `role`, or `type`** on a message.

- `message.info.id` — the message ID, format `msg_*` (e.g. `msg_f3203ff14001Y9Ig493pSyyx9H`). **This is what S6's `--from <msgId>` matches.**
- `message.info.sessionID` — the session ID.
- `message.parts` — array of part objects.

### Part types (6 observed)

| Part type | Count (large session) | Machinery? | Notes |
| --- | --- | --- | --- |
| `text` | 50 | No (narrative) | The reflector's default view |
| `reasoning` | 38 | Yes | Model reasoning |
| `tool` | 115 | Yes | Tool calls |
| `step-start` | 77 | Yes | Marks a model step boundary |
| `step-finish` | 76 | Yes | Carries `reason` (e.g. "tool-calls"), `snapshot`, per-step `cost`/`tokens`, `id` (`prt_*`), `messageID`, `sessionID` |
| `patch` | 19 | Yes | File patches |

**Not observed** in the 14-session sample: `file`, `retry`, `compaction`. The plan's earlier references to these part types (S6 machinery list) are speculative — handle gracefully if they appear, but do not assume they exist. S4's schema check pins the 6 observed types.

### Reliability caveat

`opencode export <sid> | jq ...` is **unreliable** — jq reads the stdout stream mid-write and fails with parse errors. Writing to a file first (`opencode export <sid> > file.json`) then running `jq file.json` is **reliable**. S4 writes export stdout directly to a file write stream (correct); S6 reads the persisted file only (correct). No component ever pipes the live export into a parser.
