# Plan: `INCOMPLETE` outcome classification with auto-continue

Status: draft, decisions resolved, not started. No code, script, or workflow changes have
been made yet. This document is the design and risk analysis to review before any
implementation begins. It supersedes the candidate fix noted (but not implemented) in
`docs/self-improving-system-concept.md` §9.2.

## Goal

Stop abrupt agent-run quits (timeouts, provider errors, mid-stream truncation) from being
misclassified as `QUESTION` and stalling the pipeline on a human form. Introduce an
`INCOMPLETE` outcome that auto-resumes the opencode session with a "Continue" message, up
to a configurable cap, logging each occurrence. After the cap, escalate cleanly (fail the
step) rather than stalling.

This is the workaround for the root cause documented in three prior artifacts:

- `docs/self-improving-system-concept.md` §9.2 — "The 'INCOMPLETE' outcome anomaly"
- `docs/todo/n8n-workflow-review-2026-07-15.md` — F-3 "Phantom-halt chain", R4
- `docs/pipeline-slowness-investigation-2026-07-14.md` — multi-hour stalls from `infra-phantom-halt`

The cause is upstream (opencode or the neuralwatt provider) and out of scope to fix here;
this plan treats the symptom at the classification/routing layer.

## Verified facts (no assumptions)

Each was confirmed empirically or by reading code, not assumed.

1. **opencode sessions are resumable after abnormal exit.** Killed sessions via SIGTERM
   (rc 124/143), SIGKILL (rc 137), and provider auth error (rc 1), then resumed each with
   `opencode run --session <id> "Continue"`. **All resumed successfully**, continuing the
   original task and ending with `step_finish`. Sessions persist to SQLite
   (`~/.local/share/opencode/opencode.db`) at creation time, independent of stdout/exit.
   opencode v1.17.20. This is the load-bearing assumption — it holds.
2. **The active BMAD Outcome classifier diverges from the on-disk draft.** The active
   `Validate Classification` (`3D8Jw6GicWiwBQc6`) **throws** `Error('Invalid outcome: ...')`
   on any unrecognized LLM output (no QUESTION fallback). Active model is
   `voxtral-small-latest` (draft says `mistral-small-latest`). An `INCOMPLETE` token from
   the LLM would currently throw and trigger `errorWorkflow`. The enum, prompt, and
   validation must all change together.
3. **`questionCount`/`halts` would be polluted by INCOMPLETE-continues.** Any re-entry via
   `Parse OpenCode Response → Run counter` mechanically increments `$runIndex`, and
   `Output.questionCount = $('Run counter').last().json.runIndex`. An INCOMPLETE-continue
   that bypasses the human form but re-enters the shared spine would count as a halt — a
   false autonomy signal. A separate counter is required.
4. **`outcomeHistory` is broken (F-4, confirmed).** `$('BMAD Outcome').all()` does not
   aggregate across the `Get response` Wait-node resume boundary. Journal evidence: 232
   `step_end` events show `["COMPLETE"]`, 5 show `[]`, **0 ever show `"QUESTION"`** despite
   18 having `halts≥1`. Without fixing this, mid-stream `INCOMPLETE` outcomes vanish from
   reflection. This is a **precondition** for INCOMPLETE to be visible to the learning loop.
5. **The `salvaged`/`rc` signals exist in the shell but never reach the item flow.**
   `Agent run (initial/follow-up)` compute `salvagedOutput` and `rc` and write them only to
   `runner-errors.jsonl`. `Parse OpenCode Response` returns `{response}` only. `Routing`
   cannot see them.
6. **`Parse OpenCode Response` already surfaces provider errors** as `[opencode error]
   <msg>` (error-type JSON line fallback). This is a clean deterministic signal for
   infra-error → INCOMPLETE.
7. **`apply-amendments.mjs` is outcome-agnostic** — it reads proposals/observations/
   fingerprints, never raw outcomes. No change needed there.
8. **n8n Code nodes cannot read the filesystem** (V5: `JsTaskRunnerSandbox` blocks built-in
   modules; only `NODE_FUNCTION_ALLOW_EXTERNAL=uuid`). The cap cannot be read from
   `playbook.json` inside a Code node — it must be passed in via Execute Command or workflow
   inputs.
9. **`Assess step result` failure contract:** `failed = item.error !== undefined`. The
   `Output` node sets no `error` for any case today. Cap-exhaustion must set `error` to be
   seen as failure.

## Design overview

### New outcome space

| Outcome | When | Routing |
| --- | --- | --- |
| `COMPLETE` | Agent finished cleanly | → Output (success) |
| `QUESTION` | Agent genuinely asks a human decision | → human form (unchanged) + **form timeout** (F-3.2, recommended companion) |
| `INCOMPLETE` | Agent quit mid-stream (timeout/provider error salvaged, or partial non-question text) — resumable | → auto-continue (resume session with "Continue"), capped at N |
| `UNKNOWN` | Empty output, unclassifiable, classifier failure | → failed (step retries via existing machinery) |

### New routing graph in BMAD Session (additions in bold)

```
... → Parse OpenCode Response → Run counter → BMAD Outcome → Routing
Routing[COMPLETE]   → Notify finish + Output                               (unchanged)
Routing[QUESTION]   → Accrete outcome → Agent MD to HTML → Get response (Wait) → Agent run (follow-up) → Parse...   (accretion added)
Routing[INCOMPLETE] → Accrete outcome → Incomplete counter → Check cap
                       ├ under cap → Prepare continue (Answer="Continue...") → Agent run (follow-up) → Parse...   (NEW auto-continue loop)
                       └ over cap  → Output (cap exhausted, sets error) → Notify cap → Routing[COMPLETE path to Output]
Routing[UNKNOWN]    → Output (failed, sets error)                          (NEW failed path)
```

The INCOMPLETE loop re-enters at `Agent run (follow-up)` (which uses `--session <id>`),
bypassing the `Get response` Wait form entirely. This is the core of the requested
behaviour.

### Classification logic: deterministic front-end + LLM tie-breaker (F-18)

A new `Determine outcome` Code node runs **before** the LLM, handling the clear cases
deterministically; the LLM only decides genuinely ambiguous text. This reduces cost,
non-determinism, and data egress, and makes infra-error→INCOMPLETE reliable.

```
1. response is empty                              → UNKNOWN (failed)
2. response starts with "[opencode error]"        → INCOMPLETE (provider error; resume clears it — empirically verified)
3. salvaged==yes OR rc!=0 (when threaded)          → INCOMPLETE (timeout/crash; resume continues the work — empirically verified)
4. response has explicit completion markers        → COMPLETE
5. otherwise                                       → LLM decides {COMPLETE | QUESTION | INCOMPLETE}
```

> **Note on the prior review's F-3 recommendation.** The n8n-workflow-review recommended
> routing salvaged output to **FAILED**, reasoning "a salvaged run is an infra failure, not
> a human question." That was correct *given the binary question-vs-fail choice*. Verified
> fact #1 updates this: salvaged sessions **are resumable and continue the original work**,
> so INCOMPLETE-continue is defensible for salvaged+non-empty output and matches the stated
> intent ("continue as if nothing happened"). The cap is the safety net for runs that keep
> re-timing-out. **This is a place where new empirical evidence overrides the prior review —
> flagging it explicitly.**

## Phased implementation

Sequenced so script-layer changes (safe mid-pipeline) land first, then workflow
publications (which create a new active version without disturbing in-flight executions).

### Phase 0 — Policy + script layer (safe, lands first)

| # | Where | Change | Effort |
| --- | --- | --- | --- |
| 0.1 | `_bmad-output/pipeline/playbook.json` `policy` | Add `"incompleteContinueCap": 10` (peer of `maxAttemptsPerStory`) | XS |
| 0.2 | `scripts/pipeline/get-steps.mjs` | Also emit `incompleteContinueCap` from `policy` in its JSON output (currently uses only `.steps`) so it can be passed into BMAD Session | S |
| 0.3 | `scripts/pipeline/journal.mjs` `trends` | Add `incompleteCount` to per-step record (init `:34`, accumulate alongside `halts` `:41`, output `:43-48`) and `incompleteCountPerStory` (parallel to `haltsPerStory` `:53-58`) | S |
| 0.4 | `scripts/pipeline/reflect-prompt.mjs` | Add an `INCOMPLETES` guidance block (parallel to `HALTS` at `:62`/`:98`): what `incompleteCount` means; distinguish (a) genuine "more work needed" auto-continues that resolve (signal), (b) cap-exhaustion → record `infra-incomplete-cap-exhausted`, (c) phantom INCOMPLETE from misclassification. Update the COMPLETE/QUESTION-framed halts prose at `:62`/`:98`. | S |

**Verify:** `node scripts/pipeline/get-steps.mjs <story>` shows `incompleteContinueCap`;
`node scripts/pipeline/journal.mjs trends` shows `incompleteCount` column.

### Phase 1 — BMAD Outcome classifier (`3D8Jw6GicWiwBQc6`)

| # | Node | Change | Effort |
| --- | --- | --- | --- |
| 1.0 | (investigation, no node change) | **Empirically inspect the shape of a response when opencode closes mid-thought.** Pull salvaged/partial outputs from `runner-errors.jsonl`; if inconclusive, force a mid-thought exit in a scratch opencode session (SIGTERM mid-stream) and capture stdout. Confirm: (a) what deterministic markers distinguish a complete vs. partial response, (b) the exact fall-through boundary for rule 5. **Output:** the concrete rules 4/5 the classifier will use. This is the precondition for Phase 1.3 — do not finalize the front-end without it. | S |
| 1.1 | `Classify response` (LLM prompt) | Add `INCOMPLETE` to the enum and instructions: "IF the message is a partial/truncated response, mid-thought text, or indicates work was interrupted but no question is asked — THEN respond INCOMPLETE." Add to the "Output:" line. | XS |
| 1.2 | `Validate Classification` (Code) | Add `'INCOMPLETE'` and `'UNKNOWN'` to `outcomes`. **Replace the throw** with: unrecognized → `{ outcome: 'UNKNOWN', rawOutcome: raw, classificationFallback: true }` (converges draft/active, resolves F-16). | XS |
| 1.3 | (new) `Determine outcome` (Code, `runOnceForAllItems`) | Deterministic front-end (rules 1-4 above) using `response` + threaded `salvaged`/`rc`. Falls through to the LLM for rule 5 by returning `{outcome: null}`; wire so the LLM only runs on fall-through. **Alternatively** (simpler): keep the LLM always-on but have `Validate Classification` post-process — but the front-end is recommended for cost/determinism. | S |
| 1.4 | LLM model | Set `temperature: 0` (F-18). | XS |
| 1.5 | `BMAD Outcome` Execute Workflow node (in BMAD Session) | Add `onError: continueRegularOutput` + `retryOnFail:true, maxTries:2` (F-10); `Validate Classification` checks `item.error` first → `UNKNOWN` if classifier sub-workflow failed (V7). | S |

**Verify:** `validate_node_config` on each changed node; `test_workflow` with pinned
`response` values (empty, `[opencode error] ...`, partial text, complete text, question
text) asserting outcomes.

### Phase 2 — BMAD Session routing + continue path + counters (`C8qzMFk2e00sLHJg`)

| # | Node | Change | Effort |
| --- | --- | --- | --- |
| 2.1 | `Routing` (Switch v3.4) | Add rule 2 `outputKey:"Incomplete"` (`$json.outcome === "INCOMPLETE"`) and rule 3 `outputKey:"Unknown"` (`$json.outcome === "UNKNOWN"`). Set `options.fallbackOutput: "extra"` renamed "Fallback" → route to UNKNOWN too (defensive). | S |
| 2.2 | (new) `Accrete outcome` (Set) on QUESTION + INCOMPLETE branches | Prepend current `$json.outcome` to an `accumulatedOutcomes` array (F-4 corrected fix per V1). Carries the sequence to Output. **Must exist on both loop branches** or INCOMPLETE outcomes vanish. | M |
| 2.3 | (new) `Incomplete counter` (Code, `runOnceForAllItems`) | `jsCode: return [{ json: { ...$input.first().json, incompleteRunIndex: $runIndex } }];` — branch-local, so `$runIndex` = incomplete traversals only. Placed on the INCOMPLETE branch before the cap check. | XS |
| 2.4 | (new) `Check incomplete cap` (Code or IF) | Compare `$('Incomplete counter').last().json.incompleteRunIndex + 1` (this would-be continue count) against `incompleteContinueCap` (passed via workflow input). Under cap → `Prepare continue`; over cap → `Output (cap exhausted)`. | S |
| 2.5 | (new) `Prepare continue` (Set) | Set `Answer: "Continue"` and carry `incompleteCount`. → `Agent run (follow-up)` (re-enters the shared spine; `--session` resume, no Wait form). | XS |
| 2.6 | (new) `Output (cap exhausted)` (Set) | Sets `error: { message: "incomplete-continue cap exhausted (<N>)" }` so `Assess step result` sees `failed`. → `Notify cap` (ntfy) → `Output`. | XS |
| 2.7 | (new) `Notify cap` (HTTP) | ntfy: `"<title> - Incomplete cap exhausted"`. `onError: continueRegularOutput` (F-12). | XS |
| 2.8 | `Output` (Set) assignments | Add `incompleteCount` (derived — see Counters below). Change `outcomeHistory` to read `accumulatedOutcomes` from the item (F-4 fix). Keep `questionCount` (derived). Add `salvaged` + `classificationFallback` (F-15) so the journal records them. | M |
| 2.9 | `Agent run (follow-up)` | No structural change (already uses `--session`). Confirm `--fork` is **not** set (we want to continue, not branch). | — |
| 2.10 | `Extract SessionID` (Set) | Harden (F-14): scan all stdout lines for first JSON with `.sessionID`; return `null`+flag instead of throwing. Add title-based fallback (`opencode session list`) for the empty-salvaged-stdout edge case (verified risk #1 from the resume experiment). Fix the `arrayValue` type → `string` (F-26). | S |

> **Phase 2.11 (form timeout) removed — deferred per decision #5.** No `Get response` Wait
> timeout in this change. Owner responds to forms manually.

### Phase 3 — Signal threading (`Parse OpenCode Response` + shells)

| # | Where | Change | Effort |
| --- | --- | --- | --- |
| 3.1 | `Agent run (initial/follow-up)` shells | Append a final meta line to stdout: `printf '{"type":"runner_meta","rc":%d,"salvaged":"%s"}\n' "$rc" "$salvaged"` (compute `salvaged` as the shell already does for runner-errors). | XS |
| 3.2 | `Parse OpenCode Response` `Extract JSON` (Code) | Also extract `rc`/`salvaged` from the `runner_meta` line and return them alongside `response`. | S |
| 3.3 | `Parse OpenCode Response` Execute Workflow node | Output now includes `rc`/`salvaged` → available to `Determine outcome` and `Output`/journal. | — |
| 3.4 | `Agent run` shells — stderr redaction | Redact `Bearer …`/`sk-…`/`Authorization` from `stderrTail` before writing `runner-errors.jsonl` (F-17/B8). Keep an error *category* (auth/rate-limit/context-length). | S |

### Phase 4 — Develop Story journal contract (`GGiJ7KGUez94SaOc`)

| # | Node | Change | Effort |
| --- | --- | --- | --- |
| 4.1 | `Run BMAD Session` Execute Workflow `workflowInputs` | Add `incompleteContinueCap` mapping (sourced from `get-steps.mjs` output via `Prep step`). | XS |
| 4.2 | `Assess step result` (Code) jsCode | Add `incompleteCount: Number(item.incompleteCount) || 0` to the `step_end` payload. Surface `salvaged`/`classificationFallback`. Cap-exhaustion already sets `item.error` → `failed=true` → `status:'failed'` (no change to the `failed` logic needed, just ensure `Output (cap exhausted)` sets `error`). | S |
| 4.3 | `Prep step` (Code) | Pass `incompleteContinueCap` through from the step/policy data. | XS |

### Phase 5 — Reflection visibility

Covered by Phase 0.3/0.4 (trends + reflect-prompt). No `apply-amendments.mjs` change
(verified fact #7). The reflector can now see `incompleteCount`, the real `outcomeHistory`
sequence (F-4 fix), and has guidance to record `infra-incomplete-cap-exhausted` vs
`incomplete-loop-recurrence` observations.

### Phase 6 — Verification (before publishing any workflow)

1. **Per-node validation:** `validate_node_config` on every new/changed node config before
   wiring.
2. **Pin-data tests:** `prepare_test_pin_data` then `test_workflow` on BMAD Outcome and
   BMAD Session with pinned inputs for each branch:
   - empty response → UNKNOWN → failed path
   - `[opencode error] ...` → INCOMPLETE → continue path (first continue)
   - partial text → INCOMPLETE → continue path
   - complete text → COMPLETE → Output
   - question text → QUESTION → form
   - INCOMPLETE repeated `cap+1` times → cap exhausted → `error` set → `failed`
   - counter assertions: `questionCount` unaffected by INCOMPLETE-continues;
     `incompleteCount` increments correctly
3. **Draft/active convergence:** confirm published BMAD Outcome matches the corrected draft
   (resolves F-16).
4. **Publish** only after pin-data tests pass, and when no step is mid-run (publishing
   creates a new active version; in-flight executions continue on their version).

## Counters — the one genuinely hard n8n mechanic

The requirement: `questionCount` must count only human-form fires; `incompleteCount` must
count only auto-continues; they must not pollute each other (verified fact #3).

**Recommended mechanism:** branch-local `$runIndex` counters (reliable across the whole
execution, unlike `.all()` which breaks across Wait resumes — F-4).

- `Run counter` (existing, shared spine): `runIndex = $runIndex` = total traversals
  (initial + questions + incompletes).
- `Incomplete counter` (new, INCOMPLETE branch only): `incompleteRunIndex = $runIndex` =
  incomplete traversals.
- Derivation in a `Compute counts` Code node before `Output`:
  - `incompleteCount = incompleteTraversals`
  - `questionCount = totalTraversals − incompleteTraversals` (since `runIndex = questions +
    incompletes`; initial run is index 0 and contributes to neither — verified by the
    data-contract trace)

**Implementation unknown to validate (do NOT assume):** reading
`$('Incomplete counter')` when the node never executed (a step with zero INCOMPLETEs). n8n
may return null/throw. Validate `$('Node').isExecuted` or equivalent in `test_workflow`;
fallback is a Code node computing both counts with try/catch. This is the single
n8n-mechanics detail that needs empirical confirmation during implementation — it is
flagged, not assumed.

## Relationship to the existing n8n-workflow-review

This plan implements/requires several review findings. Mapping so there is no double-work:

| Review finding | Status in this plan |
| --- | --- |
| F-3.1 (thread `salvaged` flag) | **Implemented** (Phase 3.1-3.3) |
| F-3.2 (form timeout) | **Deferred** (decision #5) — not in this change |
| F-3.3 (default to UNKNOWN not QUESTION) | **Implemented** (Phase 1.2) |
| F-4 (outcomeHistory accretion) | **Implemented** (Phase 2.2, 2.8) — precondition |
| F-10 (BMAD Outcome onError) | **Implemented** (Phase 1.5) |
| F-14 (Extract SessionID hardening) | **Implemented** (Phase 2.10) |
| F-15 (salvaged/Fallback in Output) | **Implemented** (Phase 2.8) |
| F-16 (draft/active divergence) | **Resolved** (Phase 1.2 publishes converged version) |
| F-17 (stderr redaction) | **Implemented** (Phase 3.4) |
| F-18 (deterministic classifier layer) | **Implemented** (Phase 1.3) |
| F-26 (arrayValue type) | **Implemented** (Phase 2.10) |

**Not in scope here** (separate, review workstreams A/C/D/E/F): atomic playbook write,
readJsonl tolerance, apply-amendments idempotency, concurrency lock, Error Handler →
runner-errors, Reflect pipefail, shell-injection auth, ntfy hygiene. These are orthogonal
and safe to leave for later.

## Decisions (resolved)

1. **Cap-exhaustion behaviour → fail the step.** Set `error`, let `Run BMAD Session`'s
   existing `retryOnFail` + the story halt-guard handle it, plus an ntfy notification — no
   blocking form. (Chose 1A.)
2. **Cap value → 10.** (Chose 2C.) Note: at 90-min timeouts this permits up to ~15 h of
   auto-continue on a structurally-expensive step before exhaustion. Acceptable per owner;
   `reasoningEffort` reduction (slowness doc Priority 1) is the complementary cost control,
   out of scope here.
3. **"Continue" message text → `"Continue"`.** (Chose 3B; simplified from the proposed
   wording.)
4. **Deterministic front-end → yes, add the `Determine outcome` node (Phase 1.3).**
   (Chose 4A.) **Caveat / added step:** the front-end's rule 4 ("response has explicit
   completion markers") and the fall-through-to-LLM boundary (rule 5) depend on the actual
   shape of a response when opencode closes mid-thought. Before finalizing the classifier
   rules, **empirically inspect** salvaged/partial outputs from `runner-errors.jsonl` (and,
   if needed, force a mid-thought exit in a scratch session) to confirm the deterministic
   markers. Adjust rules 4/5 to fit the observed shape. See new Phase 1.0 below.
5. **Form timeout → deferred.** (Chose 5B.) No `Get response` Wait timeout in this change.
   Owner will respond to forms manually. Phase 2.11 is removed from scope.

Decisions #1 and #4 (the node-count-changing ones) are resolved. Implementation may
proceed once Phase 1.0's empirical inspection is done.

## Risks and unknowns

- **Resuming a 90-min-timeout session may re-timeout.** The resume experiment verified
  resume works at seconds-scale. Production timeouts occur at 90 min after extensive work.
  Resume *continues the original task* — if the step is structurally too expensive
  (review-code's 3 subagents), it may hit the wall again. The cap (decision #1/#2) is the
  safety net; lowering `reasoningEffort` (slowness doc Priority 1) is the complementary fix,
  out of scope here. **Residual uncertainty: whether resume-and-finish is faster than
  fail-and-retry for the 90-min-timeout case.** Hypothesis: it is (no re-loading context),
  but untested at scale.
- **Empty-salvaged-stdout edge case.** Hard SIGKILL before first stdout flush yields empty
  stdout → no `sessionID` to resume. The shell currently re-exits non-zero in this case
  (bypasses classification → error path). Phase 2.10's title-based fallback addresses it,
  but until then these rare cases fail rather than continue. Acceptable.
- **Counter "node never ran" n8n mechanic** — flagged in the Counters section; to validate,
  not assume.
- **`outcomeHistory` accretion across the QUESTION branch's Wait** — the F-4 corrected fix
  (item-flow accretion) is specified, but the Parse sub-workflow call replaces the item;
  the accretion Set must run after Parse and re-merge. This is the known-hard part of F-4;
  validate the exact placement with `test_workflow`.
- **Draft is not active.** All workflow changes must be **published** to take effect; the
  on-disk JSON is the draft. The plan publishes explicitly in Phase 6.

## Out of scope (deliberate)

- Lowering `reasoningEffort` (slowness doc Priority 1) — complementary but separate.
- Chaining epics, per-epic playbook overlays, concurrency.
- The broader review workstreams A/C/D/E/F (data-integrity, evidence, security,
  robustness, hygiene) — orthogonal, safe to leave.
