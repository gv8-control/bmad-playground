# Plan: trace source for pipeline self-evaluation

> Throwaway working document, 2026-07-03. Decision draft only — nothing has been modified.
> Context: the gen-2 loop's reflection step currently evaluates a story run from `journal.jsonl`
> (timings, status, a 2000-char response excerpt) and n8n execution data. OpenCode runs are piped
> through `tail -n 10`, so agent thinking, tool calls, and intermediate output never reach n8n.

## Decision

**Use local OpenCode session history as the primary evidence for self-evaluation. Keep the
n8n-side journal as the orchestration spine and the index that points into it.** Do not try to
make n8n retain more agent output.

## Why (verified facts, not assumptions)

What each source actually contains — checked against the real story 2.1 run of 2026-07-03:

| | n8n / journal (today) | OpenCode local history |
| --- | --- | --- |
| Step timings, status, attempts | ✔ journal events | ✔ (`time_created/updated`) |
| Final response | 2000-char excerpt | ✔ full |
| Agent reasoning ("thinking") | ✘ discarded by `tail -n 10` | ✔ `reasoning` parts, full text |
| Tool calls | ✘ | ✔ every call with full input and output payloads |
| Token usage and cost | ✘ | ✔ per message and per session (`cost`, `tokens_*` columns) |
| Subagent activity | ✘ | ✔ child sessions linked via `parent_id` (e.g. "Acceptance Auditor review" under "Code review (2.1)") |
| Question/answer loops | outcome only | ✔ full exchange |

Access paths, verified working while a run is live (SQLite is WAL, read-only access is safe):

- `opencode export <sessionID>` → structured JSON (`info` + `messages[].parts[]`). A 96-second
  step produced 473 KB — rich but far too large to feed raw into a reflection prompt.
- `~/.local/share/opencode/opencode.db` → `session` table has title, directory, parent_id,
  per-session cost/tokens, timestamps. Step sessions are titled `"<label> (<story>)"`, e.g.
  `Prepare tests (2.1)`, and scoped to `/workspaces/bmad-playground`.

Why not lean harder on n8n data instead:

- The interesting evaluation questions are agent-level ("why did review stall", "what did the
  agent try before giving up", "how much rework happened") — that information never enters n8n.
- Raising `tail -n 10` would bloat n8n's execution table with megabytes per step and still miss
  reasoning/tool detail, because `--format json` stdout is not the full transcript either.
- n8n execution data remains the right source for *orchestration* questions (stalls, retries,
  wait-form gaps) — but the journal already records those cheaply, and the `bmad-n8n-analyst`
  skill covers deep n8n forensics when needed.

## Gap to close: correlation

The journal does not record which OpenCode session a step ran in. The `Extract SessionID` node
inside `BMAD Session (OpenCode)` captures it, but the workflow's `Output` node returns only
`finalResponse` — and gen-1 workflows are frozen per the standing guardrail.

Two options:

1. **No-touch (recommended now):** a lookup script resolves step → session deterministically from
   the SQLite DB: match `title = "<label> (<story>)"`, `directory = repo`, `time_created` within
   the step's `step_start..step_end` window. Retries produce same-title sessions; the time window
   disambiguates.
2. **Durable (when the gen-1 freeze is revisited):** add `sessionId` to the `Output` node of
   `BMAD Session (OpenCode)` (additive, existing callers unaffected) and journal it in `step_end`.
   One-line change, but it touches a frozen workflow — Marius's call.

## Proposed changes (in order; ~half a day total)

1. **`scripts/pipeline/step-trace.mjs <story> [--run <runId>]`** — new deterministic script:
   journal events → session lookup (option 1) → per-step **trace digest** printed as JSON:
   duration, cost, tokens, tool-call inventory (counts + failures), reasoning-step count,
   question/answer count, subagent sessions, error markers, and the sessionID for drill-down.
   Read-only; caps output size so the reflection prompt stays bounded.
2. **Extend `reflect-prompt.mjs`** — add to the evidence-gathering list:
   "Run `node scripts/pipeline/step-trace.mjs <story>`; for steps that look anomalous
   (failures, outlier duration/cost, many retries), drill into the full transcript with
   `opencode export <sessionID>`." Digest first, full export only on suspicion — keeps token
   spend proportional to how eventful the run was.
3. **Durable trace artifacts (decide):** OpenCode history lives outside the repo and dies with
   the machine/volume, while the journal is the durable record. Option: after each story, write
   the digest (not the full export) to `_bmad-output/pipeline/traces/<runId>.json`. Cheap,
   greppable by future reflections, and keeps `journal.jsonl` lean. Full exports stay on demand
   (`opencode export --sanitize` exists if a transcript ever needs sharing).
4. **Trend hook:** teach `journal.mjs trends` to fold in digest cost/token numbers once digests
   exist, so cost-per-step drift becomes visible across stories.

## Explicitly not doing

- Not increasing `tail -n 10` or storing transcripts in n8n.
- Not parsing n8n's `execution_data` for reflection (pointer-pool format, huge, running
  executions invisible to the public API).
- Not modifying gen-1 workflows (option 2 above is flagged, not planned).

## Risks / notes

- OpenCode schema (`opencode.db`, export format) is an internal contract of a fast-moving tool —
  pin expectations in the script and fail soft (digest degrades to journal-only data if the DB
  layout changes).
- Epic 2 is mid-flight right now (execution 251 waiting on the Code review question form).
  Land these changes between stories; nothing here touches live state.
- Title-based correlation assumes step labels stay unique per story run; if a playbook ever gains
  two steps with the same label, switch to option 2.
