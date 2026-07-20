# Self-Improving Workflow System — Concept Explanation

> **Checkpoint artifact — 2026-07-05.**
> This document captures how the self-improving workflow system works *at this point in time* and why it is shaped the way it is. It is a concept explanation, not a how-to — the mental model and the design rationale, so future evolution can be evaluated against the intent captured here.
>
> Scope: the BMAD development pipeline — the system that takes an epic and develops it story by story, learning between stories. Not the broader BMAD skill/agent ecosystem, except where the pipeline touches it.

## 1. The one-sentence model

Gen-1 baked the development process into n8n workflow nodes; gen-2 lifts the process into a repo artifact and leaves n8n as a generic interpreter that runs a learning loop around it.

Everything else follows from that inversion.

## 2. Gen-1 — process as code

In gen-1 the per-story sequence of BMAD actions (create story, validate, prepare tests, implement, unit tests, E2E, code review, test review, NFR review, update project context) was encoded directly as n8n nodes in a single workflow, `Develop Story` (`vDEOX0DPKdBUEIqx`). One node per action, wired in a fixed graph with merge nodes to fan branches back together.

The supporting cast, all gen-1 and still present:

| Workflow | File | Role |
| --- | --- | --- |
| `Develop Story` | `vDEOX0DPKdBUEIqx` | The static per-node story pipeline. Frozen. |
| `Develop Story (Webhook)` | `gOqc9kLuIwvj6jow` | Webhook entry; validates story input against `sprint-status.yaml`, triggers `Develop Story`. |
| `BMAD Session (OpenCode)` | `C8qzMFk2e00sLHJg` | The step runner. Runs one BMAD skill via `opencode run`, classifies the outcome, surfaces a human-question form, resumes on answer. |
| `BMAD Outcome` | `3D8Jw6GicWiwBQc6` | Two-bucket classifier: `COMPLETE` or `QUESTION`. |
| `Parse OpenCode Response` | `tDs1dBlOKDd3aDH8` | Sub-workflow that decodes the opencode run output. |
| `BMAD Session (Claude Code)` | `wvEI4B8b2pjAB4a7` | Alternate runner for the Claude Code agent. |
| `Error Handler (ntfy)` | `bmadErrNotify001` | Catches unexpected failures, pushes to ntfy. |

Gen-1's properties, which motivated the redesign:

- **The process is the workflow.** Adding, removing, reordering, or tuning a step meant editing the n8n graph. The graph is not version-controlled alongside the repo's process knowledge; it lives in n8n's database.
- **The process is opaque to itself.** n8n execution data is the only record. There is no first-class notion of "what did this step learn," no cross-run trend, no memory of past failures. Each story run starts from a blank slate.
- **Failure recovery is manual and lossy.** A failed run meant disabling the completed nodes and re-running by hand, or re-triggering and hoping. n8n's error outputs turned out to be unreliable in practice (a failing node's error item can exit through the *success* output), so routing on error outputs is unsafe.
- **"Parallel" branches ran serially anyway.** n8n executes branches of one execution one node at a time, so the fan-out groups in the graph were an illusion of concurrency. The ordering was still effectively sequential.

Gen-1 was not wrong — it ran stories end to end. Its limitation was that the process could not improve itself, because the process was welded into the orchestrator.

## 3. Gen-2 — process as data

Gen-2 keeps every gen-1 workflow and adds two new ones:

| Workflow | File | Role |
| --- | --- | --- |
| `Develop Epic` | `7akkpjTdEW6RMIJG` | The outer loop: next story → run playbook → reflect → apply amendments → notify → repeat until the epic is done. |
| `Develop Story (Playbook)` | `GGiJ7KGUez94SaOc` | The inner loop: reads the playbook, runs each enabled step through the unchanged `BMAD Session (OpenCode)` runner, journals every step. |

And it introduces a set of **repo artifacts** that hold the state the loop reads and writes:

| Artifact | Role |
| --- | --- |
| `_bmad-output/pipeline/playbook.json` | The ordered BMAD steps for one story, plus policy thresholds. **Source of truth for the process.** |
| `_bmad-output/pipeline/journal.jsonl` | Append-only event stream: `story_start`, `step_start`, `step_end` (duration, response excerpt, halt count), `story_end`. The orchestration spine. |
| `_bmad-output/pipeline/ledger.jsonl` | Learning memory: observations (with stable fingerprints), applied/rejected amendments, retirements. |
| `_bmad-output/pipeline/proposals/<runId>.json` | One per story run. The reflection agent's proposal; consumed by the deterministic gatekeeper. |
| `_bmad-output/pipeline/runner-errors.jsonl` | Machinery failures captured by the step runner wrapper (opencode exit code, stderr tail, error category). |
| `scripts/pipeline/*.mjs` | Dependency-free Node scripts: story selection, step resolution, journaling, trend aggregation, reflection-prompt building, amendment gating. |
| `_bmad-output/decision-policy.md` | The autonomy boundary — which decisions agents make on their own and which must reach a human. Human-only to edit. |

The inversion in one line: **n8n stops being the process and becomes the interpreter of the process.** The source of truth moves from n8n's workflow graph to a file in the repo, where it can be diffed, versioned, inspected, and — crucially — modified by the system itself through a bounded learning loop.

The only authorized changes to gen-1 are two surgical seams in `BMAD Session (OpenCode)`:

1. The `Agent run` command wrapper now bounds runs with a timeout; any non-zero opencode exit appends a line to `runner-errors.jsonl` so provider errors (context-length overflows, terminated runs) survive into evidence reflection can read.
2. The `Output` node adds a `questionCount` field counting how many times the human-question form fired during the session — journaled as `halts` on the `step_end` event, and treated as an autonomy signal.

Everything else in gen-1 — outcome classification, the question form, the ntfy resume flow — carries over unchanged.

## 4. The loop, conceptually

There are three nested loops. Keeping them distinct is the key to reasoning about the system.

### 4.1 The outer loop — per story (`Develop Epic`)

```
next-story.mjs <epic>
  ├─ no stories left            → epic complete, end
  ├─ story at maxAttempts       → halt for human review
  └─ run                        → Develop Story (Playbook)
                                   ├─ status: success   → reflect → apply amendments → notify → loop
                                   ├─ status: failed    → notify → story gets one more attempt before halt guard
                                   └─ (halt/error)      → notify, stop
```

`next-story.mjs` is deterministic: it reads `sprint-status.yaml`, returns the first story in the epic not `done`, and counts prior attempts from the journal to enforce `maxAttemptsPerStory`. The loop ends in exactly three ways, each with an ntfy notification: **epic complete**, **halt** (attempt guard or invalid epic/story data), or **error** (unexpected failure → `Error Handler (ntfy)`).

### 4.2 The inner loop — per step (`Develop Story (Playbook)`)

`get-steps.mjs` resolves the enabled steps from the playbook; each runs through `BMAD Session (OpenCode)` sequentially. Honest sequencing — no fake parallelism (see §2). The gen-1 grouping survives as the playbook's `stage` field: adjacent steps sharing a stage are *order-independent* and could run concurrently if that is ever built. Today the field is pure metadata, but the amendment gatekeeper respects it: it never inserts a learned step inside a stage group, and gives each learned step its own stage, so learned steps are always sequential until a human says otherwise.

A failed step is retried once at the node level; if it fails again, the story run returns `status: "failed"` **as ordinary data, not an n8n error**. This is deliberate and learned the hard way (see §7): failures travel as data, routing uses IF nodes on status fields, never n8n error outputs.

### 4.3 The learning loop — between stories

```
journal (observe)  →  reflect (LLM proposes)  →  apply-amendments (script decides)  →  playbook + ledger (mutate)  →  next story
```

1. **Observe.** Every step journals `step_start`/`step_end` with duration, outcome, response excerpt, and halt count. The runner-errors file captures machinery failures separately.
2. **Reflect.** After each story, an opencode run (planner agent, prompt built by `reflect-prompt.mjs`) reads the journal, the cross-run trends, the ledger, and the runner errors, then writes one proposal file. It is told explicitly: most findings are noise; record observations, don't eagerly propose fixes.
3. **Gate.** `apply-amendments.mjs` is the deterministic gatekeeper. The LLM proposes; the script decides. Every proposal part is validated against the playbook's policy; what passes is applied, what fails is rejected, and *everything* — applied, rejected, observed — lands in the ledger.
4. **Mutate.** The playbook is rewritten in place; the ledger records the decision with a rationale. The next story run picks up the mutated playbook.
5. **Notify.** An ntfy message per story with a learning summary (amendments applied/rejected/retired, observation count). Then back to step 1.

## 5. The design principles

These are the invariants the system is built to preserve. Any future change should be evaluated against them.

1. **Separation of concerns.** n8n = orchestration (the loop, the routing, the notifications). Repo artifacts = state, memory, and policy. Scripts = deterministic logic (selection, resolution, journaling, gating). LLM = judgment (proposes, never decides alone). Each concern lives where it is cheapest and most inspectable.
2. **The LLM proposes; the script decides.** Reflection is an LLM; amendment application is a script with hard rules. The LLM cannot widen its own authority, retire core steps, or act on a single observation. This is the central safety property.
3. **Observations are cheap, changes are expensive.** Any finding is recorded under a stable fingerprint. Nothing changes on first sight. A guard step is added only when a fingerprint recurs across ≥ 2 distinct runs (`addStepRecurrenceThreshold`). One-off mistakes are not guarded against — the system tolerates noise rather than overfitting to it.
4. **Learned steps must earn their keep.** After 3 consecutive clean runs (`retireCleanStreak`) a learned step is auto-retired (`enabled: false`, kept in the file with a reason). The playbook does not accumulate cruft.
5. **Core steps can be tuned but not removed by the machine.** The machine may update the prompt of any step, core or learned. Retiring (disabling) a step stays human-only for `origin: "core"`; only `origin: "learned"` steps can be retired, by proposal or by the clean-streak rule.
6. **The machine never widens its own authority.** The decision policy (`_bmad-output/decision-policy.md`) is human-only. Reflection may record recurring decision classes as `decision-policy-candidate-*` observations, but only a human turns a candidate into a rule. Notifications shift from "make this call for me" to "review the recorded calls in the artifact."
7. **Machinery failures are diagnosed, never self-mended.** Runner and infrastructure errors (opencode timeouts, context-length or provider API errors, n8n plumbing) are recorded as observations with an `infra-*` fingerprint prefix. `apply-amendments.mjs` rejects any amendment citing `infra-*` evidence — a playbook step cannot fix the machinery. Recurring infra fingerprints are a work queue for humans.
8. **Failures travel as data, not as n8n error outputs.** n8n's error outputs are unreliable in practice (a failing node's error item can exit through the success output). So gen-2 never routes on error outputs: failures are `status: "failed"` on items, and IF nodes inspect the item, not which output it arrived on.
9. **Honest sequencing.** No fake parallelism. The stage field preserves the *option* of concurrency without pretending it exists today.
10. **Bloat cap.** At most `maxLearnedSteps` (4) learned steps can be active; further additions are rejected. The playbook stays readable.

## 6. The autonomy boundary

`_bmad-output/decision-policy.md` is a filter in front of the human-escalation chain. When a decision arises during an interactive step (create, validate, implement, code review), the agent applies the first covering rule, records the decision and rule ID in the story file, and continues. It HALTs (question form + ntfy) only for decisions no rule covers.

This matters for the learning loop because halts are tracked as a metric. Every time the question form fires, it counts as a halt, journaled on `step_end` and aggregated per-step and per-story in the trends. The reflection prompt treats halts as an autonomy signal: a step that keeps halting for the same decision class becomes a `decision-policy-candidate-*` observation (for a human to add a rule) or an `update_step` proposal (to tune the step's prompt toward the policy). Fewer halts over time means the pipeline is becoming more autonomous — *without the machine having granted itself that autonomy*.

## 7. Lessons learned the hard way (n8n behaviors that shaped the design)

Two n8n behaviors shaped the failure model. They are load-bearing assumptions; changing them requires rethinking the routing.

- **Sub-workflow input validation is strict about types.** The Execute Workflow resource mapper rejects a number where the schema says string, even with `convertFieldsToString` on. Numeric expression results must be wrapped in `String(...)`.
- **The error output of a failing node is not reliable.** When `Run story playbook` failed with an input-validation error, the error item exited through the *success* output despite `onError: continueErrorOutput` — silently turning a failure into a "success." Hence principle 8: failures travel as data, never as n8n error outputs.

## 8. What is deliberately out of scope (but prepared for)

- **Chaining epics.** The loop takes any epic number; chaining is one more outer loop or a "notify epic complete → next epic" call, once epic-level gates (retrospective, architecture review) have an autonomy boundary in the decision policy.
- **Per-epic playbook overlays** (e.g. extra NFR steps for security-heavy epics). The playbook schema's `version` field exists for this migration.
- **Concurrency.** The `stage` field preserves the option without implementing it.

## 9. Known limitations and open seams (the work queue)

These are the tensions present at this checkpoint. Future evaluation should check which were resolved and how.

1. **The human-question form has no timeout.** An unanswered question stalls the loop indefinitely. Bounding it is a gen-1 workflow change, decided separately. (Inherited gen-1 limitation.)
2. **The "INCOMPLETE" outcome anomaly.** `BMAD Outcome` has only two buckets (`COMPLETE`/`QUESTION`). A non-complete, non-question turn end (e.g. an agent ending its turn with thinking-out-loud text instead of a question) is forced into `QUESTION`, producing a human escalation with nothing to answer. A third `INCOMPLETE` class that auto-replies "continue" up to N times before escalating is a candidate fix, not implemented.
3. **The journal is data-poor.** The journal records timings, status, a 2000-char response excerpt, and halt counts — but not the OpenCode session ID, agent reasoning, tool calls, token usage, or subagent activity (opencode output is piped through `tail -n 10`, so the rich evidence never reaches the journal at all). The problem is the journal's data poverty, not that reflection reads the journal: reflection cannot answer *why* a step stalled or how much rework happened because the journal never captured it.

## 10. How to read this file in the future

This is a snapshot, not a living document. When evaluating the system's evolution, compare against:

- **The principles (§5)** — are they still held? Which were traded away, and was the trade worth it?
- **The known limitations (§9)** — which were resolved, and did the resolution match the proposed approach or diverge?
- **The gen-1 reuse (§3)** — has the gen-1 freeze held, or have more seams been opened? Each new seam is a cost paid for a capability gained.
