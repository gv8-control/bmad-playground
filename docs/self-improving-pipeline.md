# Self-Improving Development Pipeline (gen-2)

Gen-1 automated a single story: a static n8n workflow (`Develop Story`) with one node per BMAD action. Changing the process meant editing the workflow; a failed run meant disabling completed nodes and re-running by hand.

Gen-2 inverts that. The per-story sequence of BMAD actions lives in a repo artifact — the **playbook** — and n8n runs a generic loop that interprets it, story after story, until the epic is complete. The process improves itself between stories through a reflection step whose proposals are filtered by deterministic policy rules.

## Architecture

```
Develop Epic (n8n loop)                        repo artifacts
┌──────────────────────────────────────┐
│ next-story.mjs ──► run / complete /  │◄──── sprint-status.yaml
│                    halt              │
│   run ─► Develop Story (Playbook) ───┼◄──── playbook.json
│              │  step loop:           │
│              │  BMAD Session         ├────► journal.jsonl (events)
│              │  (OpenCode) per step  │
│          reflect (opencode run) ─────┼────► proposals/<runId>.json
│          apply-amendments.mjs ───────┼────► playbook.json + ledger.jsonl
│          ntfy ─► loop back           │
│   complete ─► ntfy, end              │
│   halt ─► ntfy, stop with error      │
└──────────────────────────────────────┘
```

| Piece | Where | Role |
| ----- | ----- | ---- |
| Playbook | `_bmad-output/pipeline/playbook.json` | Ordered BMAD steps per story (skill, agent, prompt, stage), plus policy thresholds. Source of truth for the process. |
| Develop Epic | n8n workflow `7akkpjTdEW6RMIJG` | The loop: pick next story → run playbook → reflect → learn → notify → repeat. Ends when the epic is complete. |
| Develop Story (Playbook) | n8n workflow `GGiJ7KGUez94SaOc` | Interprets the playbook one step at a time; journals every step; calls the unchanged gen-1 `BMAD Session (OpenCode)` runner. |
| Journal | `_bmad-output/pipeline/journal.jsonl` | Append-only event stream: `story_start`, `step_start`, `step_end` (with duration, response excerpt, and halt count), `story_end`. |
| Ledger | `_bmad-output/pipeline/ledger.jsonl` | Learning memory: observations (with fingerprints), applied/rejected amendments, retirements. |
| Runner errors | `_bmad-output/pipeline/runner-errors.jsonl` | Machinery failures captured by the `BMAD Session (OpenCode)` wrapper: exit code, stderr tail, whether output was salvaged. |
| Scripts | `scripts/pipeline/*.mjs` | Deterministic logic: story selection, step resolution, journaling, trend aggregation, amendment gating. Dependency-free Node. |

Gen-1 workflows (`Develop Story`, `Develop Story (Webhook)`, `BMAD Session (OpenCode)`, `BMAD Outcome`, error handler) are functionally unchanged; gen-2 reuses `BMAD Session (OpenCode)` as its step runner, so outcome classification, the human question form, and the ntfy resume flow all carry over. The only authorized touches are: the `Agent run` command wrapper in `BMAD Session (OpenCode)` (bounds runs with a timeout, salvaging non-empty output; on any non-zero opencode exit appends a line to `runner-errors.jsonl` with the exit code and a stderr tail — so provider errors like context-length overflows survive into evidence reflection can read), and the `Output` node in `BMAD Session (OpenCode)` (adds a `questionCount` field counting how many times the human-question form fired during the session — `Parse OpenCode Response` runs minus 1, since the initial run is not a question). The playbook's `Assess step result` node reads `questionCount` and journals it as `halts` on the `step_end` event.

## The loop, in order

1. **Next story** — `next-story.mjs <epic>` reads `sprint-status.yaml`, returns the first story in the epic not `done`. If none remain: epic complete, loop ends. If the story already used `maxAttemptsPerStory` runs without reaching `done`: halt for human review.
2. **Story run** — `get-steps.mjs` resolves enabled playbook steps; each runs through `BMAD Session (OpenCode)` sequentially (honest sequencing — the gen-1 "parallel" fan-outs ran serially in practice anyway; n8n executes branches of one execution one node at a time). The gen-1 grouping is preserved as the playbook's `stage` field: adjacent steps sharing a stage are order-independent and could run concurrently if that is ever built — today the field is pure metadata. `apply-amendments.mjs` respects it by never inserting a learned step inside a stage group (it shifts to the group edge) and by giving each learned step its own stage, so learned steps are always sequential until a human says otherwise. Every step is journaled with duration and outcome. A failed step is retried once at the node level; if it fails again, the story run returns `status: "failed"` as ordinary data (not an n8n error), the loop notifies, and the story gets one more full attempt before the halt guard trips.
3. **Reflect** — an opencode run (`planner` agent, prompt built by `reflect-prompt.mjs`) reads the journal, trends, ledger, and runner errors, then writes a proposal file. It is told explicitly: most findings are noise; record observations, don't eagerly propose fixes.
4. **Learn** — `apply-amendments.mjs` is the deterministic gatekeeper. The LLM proposes; the script decides (rules below). Everything — applied, rejected, observed — lands in the ledger.
5. **Notify** — ntfy message per story with a learning summary (amendments applied/rejected/retired, observation count). Then back to step 1.

## Learning policy (signal vs noise)

Encoded in `playbook.json` → `policy`, enforced by `apply-amendments.mjs`:

- **Observations are cheap, changes are expensive.** Any finding is recorded in the ledger under a stable fingerprint. Nothing changes on first sight.
- **A guard step is added only when a fingerprint recurs across ≥ 2 distinct runs** (`addStepRecurrenceThreshold`). One-off mistakes are not guarded against.
- **Learned steps that stop earning their keep are removed.** The reflection reports whether each learned step caught anything (`guardReports`); after 3 consecutive clean runs (`retireCleanStreak`) the step is auto-retired (kept in the file, `enabled: false`, with reason).
- **Core steps can be tuned but not removed.** The machine may update the prompt of any step, `core` or `learned`. Retiring a step (disabling it) stays human-only for `origin: "core"` — only `origin: "learned"` steps can be retired, whether by proposal or by the automatic clean-streak rule above.
- **Machinery failures are diagnosed, never self-mended.** Runner and infrastructure errors (opencode timeouts, context-length or provider API errors, n8n plumbing) are recorded as observations with an `infra-` fingerprint prefix, sourced from `runner-errors.jsonl`. `apply-amendments.mjs` rejects any amendment citing `infra-*` evidence — a playbook step cannot fix the machinery. Recurring infra fingerprints in the ledger are a work queue for humans, mirroring the `decision-policy-candidate-*` pattern.
- **Bloat cap.** At most `maxLearnedSteps` (4) learned steps can be active; further additions are rejected.
- **Human interaction is tracked as a metric.** Every time the `BMAD Session (OpenCode)` question form fires, it counts as a halt. The count is journaled as `halts` on the `step_end` event (always present, even when 0) and the outcome sequence is journaled as `outcomeHistory`, aggregated per-step and per-story in the trends. The reflection prompt treats halts as a signal to investigate, not an autonomy verdict: it first determines what caused the form to fire — a genuine uncovered decision (recorded as a `decision-policy-candidate-*` observation) or an infrastructure failure misclassified as a question (recorded as an `infra-*` observation). Fewer genuine halts over time means the pipeline is becoming more autonomous; phantom halts mean the machinery needs attention.

Trend data comes from `node scripts/pipeline/journal.mjs trends`: per-step run counts, failure counts, avg/max durations, halt counts, story attempt counts, halts per story, and recurring-finding fingerprints ranked by distinct-run count.

## Decision policy (autonomy boundary)

`_bmad-output/decision-policy.md` defines which decisions agents make on their own and which must reach a human. The interactive playbook steps (create, validate, implement, code review) point at it: when a decision arises, the agent applies the first covering rule, records the decision and rule ID in the story file, and continues — it HALTs (question form + ntfy) only for decisions no rule covers. The escalation chain is unchanged; the policy is a filter in front of it, so notifications shift from "make this call for me" to "review the recorded calls in the artifact."

The machine never widens its own authority: reflection may record recurring decision classes as `decision-policy-candidate-*` observations in the ledger, but only a human turns a candidate into a rule.

## Running it

```bash
# start the loop for an epic
curl -X POST http://localhost:5678/webhook/develop-epic \
  -H 'Content-Type: application/json' -d '{"epic":"2"}'
```

Or execute `Develop Epic` manually in the n8n UI (defaults to epic 2 via the `Configuration` node), or call it as a sub-workflow with an `Epic` input.

The loop ends on its own in exactly three ways, each with an ntfy notification: **epic complete**, **halt** (attempt guard tripped, or epic/story data invalid), or **error** (unexpected failure → `Error Handler (ntfy)`).

Useful commands:

```bash
node scripts/pipeline/next-story.mjs 2          # what would the loop do next?
node scripts/pipeline/journal.mjs trends        # cross-run trend accumulator
node scripts/pipeline/journal.mjs story 2.1     # one story's event history
```

## Notifications

All pushes go to the ntfy topic set in the `Configuration` node of `Develop Epic` (currently `agent-outcome`, same as gen-1). Per story: started, complete (with learning summary) or failed. Per epic: complete. On halt: high-visibility `Pipeline HALTED` with the reason. Mid-step questions still notify through the unchanged `BMAD Session (OpenCode)` resume-form flow.

> The ntfy topic is public and unauthenticated; anyone who guesses it can read notifications (including resume URLs). When an authenticated topic exists, update it in `Develop Epic` → `Configuration` and in the gen-1 workflows.

## Implementation notes (learned the hard way)

Two n8n behaviors shaped the failure design; keep them in mind when editing the workflows:

- **Sub-workflow input validation is strict about types.** The Execute Workflow resource mapper rejects a number where the schema says string, even with `convertFieldsToString` on. Numeric expression results must be wrapped in `String(...)` (see the `Attempt` input on `Run story playbook`).
- **The error output of a failing node is not reliable.** When `Run story playbook` failed with an input-validation error, the error item exited through the *success* output despite `onError: continueErrorOutput` — silently turning a failure into a "success". Gen-2 therefore never routes on n8n error outputs: failures travel as data (`status: "failed"` from the story pipeline, an `error` key on step items), and routing uses IF nodes on those fields. Both outputs of `Run BMAD Session` converge into `Assess step result`, which inspects the item instead of trusting which output it came from.

## Reaching beyond one epic

Deliberately out of scope for now, but prepared for:

- The loop takes any epic number; chaining epics is one more outer loop (or a `Notify epic complete` → next-epic call) once epic-level gates (retrospective, architecture review) have an autonomy boundary defined in the decision policy.
- The playbook could grow per-epic overlays (e.g. extra NFR steps for security-heavy epics) — the schema's `version` field exists for that migration.
- Known inherited limitation: the human-question form inside `BMAD Session (OpenCode)` has no timeout, so an unanswered question stalls the loop indefinitely. Bounding it belongs to a gen-1 workflow change, decided separately.
