# Post-mortem: Phantom user-input escalations from length-truncated agent runs

**Date:** 2026-07-05
**Status:** Resolved (short-term); long-term fix outstanding
**Severity:** Medium — false-positive human interruptions, but no data loss or incorrect work
**Affected:** `validate-story` and `validate-story-2` playbook steps on stories 3.6 and 3.7

## Summary

The BMAD pipeline sent "Action Needed" ntfy notifications to the user for questions the agent never actually asked. The root cause was a hardcoded output-token cap in opencode (`OUTPUT_TOKEN_MAX = 32_000`) that truncated reasoning-heavy validation steps mid-stream. The truncated output was then misclassified by `BMAD Outcome` as a `QUESTION`, routing a non-existent question to the user. The fix raises the cap to 128K via an environment variable; the complete fix requires a new `INCOMPLETE` outcome in the classifier.

## Symptom

The user received this ntfy notification:

> **Validate story (1st pass) (3.6) - Action Needed**
> BMAD run is awaiting your response

Clicking through to the resume form, the user saw an agent response that made no sense as a question:

> "I've confirmed two critical gaps. Let me verify the frontend files before recording decisions."

The user replied *"i don't know what you're saying. but continue"* — confirming the agent had not posed a coherent question.

## Timeline

| Time (UTC) | Event |
| --- | --- |
| 2026-07-04 20:06:10 | Story 3.6, `validate-story` step started (n8n execution #665) |
| 2026-07-04 20:13:33 | First agent run finished; `BMAD Outcome` classified response as `QUESTION`; ntfy "Action Needed" sent |
| 2026-07-04 20:13:33 | `Get response` Wait node opened the human form |
| 2026-07-04 20:28:54 | Human submitted: *"i don't know what you're saying. but continue"* |
| 2026-07-04 20:32:52 | Follow-up run completed as `COMPLETE`; "Finished" notification sent |
| 2026-07-04 23:15:30 | Same pattern recurred on story 3.7, `validate-story-2` (execution #707) — 7-hour wait |

The recurrence on story 3.7 confirmed this was a pattern, not a one-off.

## Investigation

### Step 1: Trace the notification to its source

The ntfy topic `agent-outcome` receives messages from the `BMAD Session (OpenCode)` workflow (`C8qzMFk2e00sLHJg`). The `Notify` node sends `"<conversationTitle> - Action Needed"` when the `Routing` Switch node classifies the outcome as `QUESTION`. The conversation title is built as `"<Conversation label> (<Story>)"`, so "Validate story (1st pass) (3.6)" mapped to playbook step `validate-story`, story 3.6.

### Step 2: Reconcile with the journal

The journal (`journal.jsonl`) told a contradictory story. The `step_end` event for `validate-story` recorded `status: "success"` with a response excerpt ending in *"No HALT needed."* No `halts` field was present. This suggested the step had completed without interruption — directly contradicting the "Action Needed" notification and the 15-minute form wait.

### Step 3: Inspect the n8n execution data

Pulling execution #665's node data revealed the `Routing` node had run **twice**:

1. First run: `outcome: "QUESTION"` → fired `Notify` + `Get response` (Wait)
2. Second run (after human response): `outcome: "COMPLETE"` → fired `Notify finish`

The `Get response` node confirmed the human form submission at 20:28:54. The journal's `responseExcerpt` had captured only the **final** response (the second run), which ended with "No HALT needed" — masking the fact that the first run had been classified as a question.

### Step 4: Find the agent response that was classified as QUESTION

The `Parse OpenCode Response` node's output showed the classified-as-QUESTION response was:

> *"I've confirmed two critical gaps. Let me verify the frontend files before recording decisions."*

This was a single sentence — mid-stream narration, not a question. The agent was announcing its next step, not asking for input.

### Step 5: Export the opencode session

The opencode session ID was `ses_0d142e75effeqmGrh3pAURq8RW`. Exporting it revealed the actual final step (`msg_f2ebffdc4001JQ5TS7SC1dmSnT`):

```
"finish": "length",
"tokens": {
  "total": 125601,
  "input": 1633,
  "output": 32000,      ← exactly 32,000 — the cap
  "reasoning": 0,
  "cache": { "read": 91968 }
}
```

The model had hit an output token cap at exactly 32,000 tokens. The reasoning block consumed the entire budget — the agent never produced actual tool calls or a final response. The "Let me verify the frontend files…" text was from the **previous** message, salvaged by n8n as the last available text.

### Step 6: Identify the source of the 32,000 cap

**False lead — provider cap.** Initially suspected neuralwatt (the inference provider) was imposing a 32K output ceiling. Checked Z.ai's docs (the model creator) — GLM-5.2 supports up to 128K output. This suggested the provider might be capping below the model's capability.

**Correction — queried the authoritative source.** The user pointed to neuralwatt's `/v1/models` API (`https://portal.neuralwatt.com/docs/api/models`). Querying it for `glm-5.2` returned:

```
max_context_length: 1048560
max_output_tokens:  null
```

Per the docs: *"`null` means no explicit ceiling beyond `max_context_length`."* Neuralwatt imposes no output cap on glm-5.2. The 32K was not coming from the provider.

**Actual source — opencode's hardcoded constant.** Found in the opencode source (`packages/opencode/src/provider/transform.ts`):

```typescript
// line 18
export const OUTPUT_TOKEN_MAX = 32_000

// line 1325-1326
export function maxOutputTokens(model: Provider.Model, outputTokenMax = OUTPUT_TOKEN_MAX): number {
  return Math.min(model.limit.output, outputTokenMax) || outputTokenMax
}
```

The `opencode.json` `limit.output: 1048560` is metadata (used for context-window UI, compaction math), not the value sent to the API. The `maxOutputTokens` function clamps it down to 32,000 unless the `OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX` environment variable overrides (runtime-flags.ts:52).

### Step 7: Confirm the full causal chain

```
opencode hardcodes OUTPUT_TOKEN_MAX = 32_000  (transform.ts:18)
  → maxOutputTokens() clamps model.limit.output (1,048,560) down to 32,000  (transform.ts:1326)
  → unless OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX env var is set  (runtime-flags.ts:52)
  → the 32,000 becomes generation.maxTokens  (request.ts:129)
  → sent as max_tokens: 32000 in the API request  (openai-chat.ts:361)
  → GLM-5.2 honors the client's max_tokens (supports up to 128K, neuralwatt imposes no cap)
  → planner agent at reasoning_effort="max" (the model default, no override in opencode.json)
  → reasoning-heavy validate-story task consumes all 32K on reasoning
  → API returns stop_reason: "length"
  → opencode run treats "length" as terminal, exits with code 0
  → n8n salvages last text from prior message ("Let me verify...")
  → BMAD Outcome classifies the truncated/incomplete output as QUESTION
  → ntfy sends "Action Needed" — for a question the agent never asked
```

## Resolution

Set `OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX=128000` in `.env` and `.env.example`:

```bash
# ─── opencode (BMAD pipeline runner) ───────────────────────────────────────────
# opencode hardcodes max output tokens at 32,000 (OUTPUT_TOKEN_MAX in transform.ts).
# GLM-5.2 supports up to 128K output. Without this flag, reasoning-heavy steps
# (e.g. validate-story) exhaust the 32K budget on reasoning alone and exit with
# stop_reason "length" before producing a response.
OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX=128000
```

The value was validated against three layers:

| Layer | Limit | Source |
| --- | --- | --- |
| Neuralwatt (provider) | No cap (`null`) | `/v1/models` API — authoritative |
| GLM-5.2 (model) | 128K output | Z.ai docs — model creator |
| opencode (client) | 32K hardcoded → 128K via env flag | `transform.ts:18` + `runtime-flags.ts:52` |

An experiment confirmed the fix: a reasoning-heavy step that previously exhausted 32K on reasoning now completes with output to spare.

## Limitations of the fix

This fix **raises the limit** but does not fix the underlying classification defect. Two gaps remain:

1. **The classifier still treats length-truncated output as `QUESTION`.** If a step ever exceeds 128K output (unlikely but possible for very long reasoning on complex stories), the same phantom escalation will recur. The `BMAD Outcome` workflow has no concept of an incomplete or truncated response — it forces every output into `COMPLETE` or `QUESTION`, and a truncated response lands in `QUESTION` by default.

2. **The journal does not record the halt.** The `step_end` event for the affected step has no `halts` field, despite the `Count halt` node firing and the `Output` node computing `questionCount: 1`. This means the reflection loop has no visibility into false-positive halts — the self-improvement system cannot learn from what it cannot see.

## Long-term fix: `INCOMPLETE` outcome

The complete fix is to add an `INCOMPLETE` outcome to the `BMAD Outcome` classifier bucket (workflow `3D8Jw6GicWiwBQc6`). Currently the classifier distinguishes only:

- `COMPLETE` — the agent finished its work
- `QUESTION` — the agent is asking the human a question

A third outcome is needed:

- `INCOMPLETE` — the agent's response was truncated (stop reason `length`, or similar machinery signal)

When `BMAD Outcome` returns `INCOMPLETE`, the `Routing` node should **auto-continue** the session (re-invoke `Agent run (follow-up)` with a "continue" prompt) rather than opening the human form. This treats length-truncation as the infrastructure issue it is, not a decision requiring human input.

This aligns with the pipeline's existing policy vocabulary: `infra-*` fingerprints are recorded as observations but never self-mended by the playbook. An `INCOMPLETE` outcome routes the failure to the runner (auto-continue) rather than to the human (escalation), matching the principle that machinery failures are diagnosed, never self-mended into playbook changes.

## Related findings

These surfaced during the investigation but are separate issues:

- **`responseExcerpt` captures only the final response.** Intermediate questions (the ones that actually caused halts) are invisible to reflection. Combined with the missing `halts` field, reflection has no signal that false-positive halts are happening on `validate-story`.
- **The `planner` agent has no `reasoningEffort` override** in `opencode.json`, inheriting the model default of `"max"`. The `coder` agent is explicitly set to `"max"`. For reasoning-heavy validation tasks, `"high"` may be sufficient and would reduce the output budget consumed by reasoning — a complementary mitigation to raising the cap.

## Evidence

| Artifact | Location |
| --- | --- |
| n8n execution (story 3.6) | #665, workflow `C8qzMFk2e00sLHJg` |
| n8n execution (story 3.7, 2nd pass) | #707, workflow `C8qzMFk2e00sLHJg` |
| opencode session | `ses_0d142e75effeqmGrh3pAURq8RW` |
| Truncated step | `msg_f2ebffdc4001JQ5TS7SC1dmSnT` (`finish: "length"`, `output: 32000`) |
| Journal entry | `journal.jsonl` line 269 (`step_end`, `validate-story`, story 3.6) |
| opencode source constant | `packages/opencode/src/provider/transform.ts:18` |
| opencode env flag | `packages/opencode/src/effect/runtime-flags.ts:52` |
| Neuralwatt model limits | `GET https://api.neuralwatt.com/v1/models` → `glm-5.2` → `metadata.limits.max_output_tokens: null` |
