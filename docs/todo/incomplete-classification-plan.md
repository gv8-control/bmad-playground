# Plan: `INCOMPLETE` outcome classification with auto-continue

Status: **implementation committed to git but never published to live n8n.** The
BMAD Session workflow JSON was subsequently clobbered by an export from live (which
never had INCOMPLETE), leaving the working tree inconsistent. Scripts and playbook
are intact. Three of four workflow JSONs still carry the INCOMPLETE changes; one
(BMAD Session) was overwritten. This document is the authoritative reference for
completing the implementation — see [Current implementation state](#current-implementation-state)
and [Path forward](#path-forward) below.

## Goal

Stop abrupt agent-run quits (timeouts, provider errors, mid-stream truncation) from
being misclassified as `QUESTION` and stalling the pipeline on a human form. Introduce
an `INCOMPLETE` outcome that auto-resumes the opencode session with a "Continue" message,
up to a configurable cap, logging each occurrence. After the cap, escalate cleanly (fail
the step) rather than stalling.

This is the workaround for the root cause documented in three prior artifacts:

- `docs/self-improving-system-concept.md` §9.2 — "The 'INCOMPLETE' outcome anomaly"
- `docs/todo/n8n-workflow-review-2026-07-15.md` — F-3 "Phantom-halt chain", R4
- `docs/pipeline-slowness-investigation-2026-07-14.md` — multi-hour stalls from `infra-phantom-halt`

The cause is upstream (opencode or the neuralwatt provider) and out of scope to fix here;
this plan treats the symptom at the classification/routing layer.

## Current implementation state

Verified 2026-07-17 against live n8n (via MCP), the git HEAD (commit `0c2d4ab`), and the
working tree. All four affected workflows were fetched from live and compared.

### What happened

Commit `0c2d4ab` ("feat: add INCOMPLETE outcome classification with auto-continue")
implemented the full plan across 4 workflow JSONs, 3 scripts, and the playbook — but
**never published any of the workflows to the live n8n instance.** The on-disk JSON
became a draft that diverged from the active version.

A later session made a small fix to the live BMAD Session `Notify` node (dynamic message
body) and published it. An export from live then overwrote the BMAD Session JSON in the
working tree, destroying the INCOMPLETE changes for that one file. The other 3 workflow
JSONs were not exported and still carry the INCOMPLETE changes from the commit.

### Three-way comparison

| Artifact | Git HEAD (`0c2d4ab`) | Working tree | Live n8n |
| --- | --- | --- | --- |
| `playbook.json` | has `incompleteContinueCap: 10` | matches HEAD | n/a (read by scripts) |
| `get-steps.mjs` | emits `incompleteContinueCap` | matches HEAD | n/a |
| `journal.mjs` | has `incompleteCount` + `incompleteCountPerStory` | matches HEAD | n/a |
| `reflect-prompt.mjs` | has INCOMPLETES guidance block | matches HEAD | n/a |
| BMAD Outcome (`3D8Jw6GicWiwBQc6`) | has INCOMPLETE classifier | matches HEAD | **no INCOMPLETE** (2 outcomes, throws on unrecognized) |
| BMAD Session (`C8qzMFk2e00sLHJg`) | has INCOMPLETE routing | **clobbered** (exported from live — no INCOMPLETE) | **no INCOMPLETE** (has Notify fix only) |
| Develop Story (`GGiJ7KGUez94SaOc`) | has `incompleteCount` in journal | matches HEAD | **no INCOMPLETE** |
| Parse OpenCode Response (`tDs1dBlOKDd3aDH8`) | has `rc`/`salvaged` extraction | matches HEAD | **no INCOMPLETE** |

### The inconsistency

The working tree has BMAD Outcome (sub-workflow) with INCOMPLETE classification but BMAD
Session (parent) without INCOMPLETE routing. If BMAD Outcome were published to live as-is,
the classifier would return `INCOMPLETE`/`UNKNOWN` outcomes that BMAD Session's Routing
node can't handle (only 2 rules: COMPLETE, QUESTION) — items would silently stall at the
Switch fallback output.

### The Notify fix

The prior session changed the BMAD Session `Notify` node's message body from the static
`"BMAD run is awaiting your response"` to `={{ $('Parse OpenCode Response').item.json.response }}`
(the agent's actual question text). This fix exists **only on live** — it was never committed
to git, and the HEAD version still has the static message. Restoring BMAD Session from HEAD
(see Path forward) will lose this fix; it must be re-applied after restore.

### Live BMAD Outcome classifier — current dangerous behavior

The live `Validate Classification` node **throws** `Error('Invalid outcome: ...')` on any
LLM output that is not exactly `COMPLETE` or `QUESTION`. No fallback. Model is
`voxtral-small-latest` (not `mistral-small-latest` as the committed version uses). An
unexpected LLM response crashes the workflow and triggers the Error Handler. The committed
version fixes this (fallback to `UNKNOWN`), but the fix was never published.

## Path forward

The implementation is essentially complete in git. The remaining work is: restore
consistency, publish to live, and verify.

### Step 1 — Restore BMAD Session JSON from HEAD

```
git checkout HEAD -- n8n/workflows/C8qzMFk2e00sLHJg.json
```

This brings back the 8 INCOMPLETE-related nodes, 4-rule Routing, `runner_meta` shell
threading, stderr redaction, and the hardened `Extract SessionID`. It also reverts the
`Notify` node's message body to the static `"BMAD run is awaiting your response"`.

### Step 2 — Re-apply the Notify fix

In the restored `C8qzMFk2e00sLHJg.json`, set the `Notify` node's `message` body parameter
from `"BMAD run is awaiting your response"` to `={{ $('Parse OpenCode Response').item.json.response }}`.
This can be done either by editing the JSON directly or via n8n MCP after publishing.

### Step 3 — Publish all 4 workflows to live

Use n8n MCP to publish each workflow. Order matters — publish sub-workflows before parents:

1. **Parse OpenCode Response** (`tDs1dBlOKDd3aDH8`) — publishes `rc`/`salvaged` extraction
2. **BMAD Outcome** (`3D8Jw6GicWiwBQc6`) — publishes INCOMPLETE classifier + `Determine outcome` + UNKNOWN fallback
3. **BMAD Session** (`C8qMFk2e00sLHJg`) — publishes INCOMPLETE routing + counters + cap + `runner_meta` shells
4. **Develop Story** (`GGiJ7KGUez94SaOc`) — publishes `incompleteCount` in journal + `incompleteContinueCap` passthrough

Publishing creates a new active version; in-flight executions continue on their version.
Publish when no step is mid-run.

### Step 4 — Verify

1. Confirm all 4 live workflows match the committed JSON (export and diff, or inspect key
   nodes via MCP).
2. Run pin-data tests (Phase 6 below) on BMAD Outcome and BMAD Session.
3. Confirm the `Notify` node has the dynamic message body on live.

## Verified facts (no assumptions)

Each was confirmed empirically or by reading code, not assumed. Updated 2026-07-17 to
reflect the committed-but-unpublished state.

1. **opencode sessions are resumable after abnormal exit.** Killed sessions via SIGTERM
   (rc 124/143), SIGKILL (rc 137), and provider auth error (rc 1), then resumed each with
   `opencode run --session <id> "Continue"`. **All resumed successfully**, continuing the
   original task and ending with `step_finish`. Sessions persist to SQLite
   (`~/.local/share/opencode/opencode.db`) at creation time, independent of stdout/exit.
   opencode v1.17.20. This is the load-bearing assumption — it holds.
2. **The live BMAD Outcome classifier still throws on unrecognized output.** The live
   `Validate Classification` (`3D8Jw6GicWiwBQc6`) has `const outcomes = ['COMPLETE', 'QUESTION']`
   and throws `Error('Invalid outcome: ...')` on anything else. Live model is
   `voxtral-small-latest`. The committed (HEAD) version fixes this: 3 outcomes, no throw,
   fallback to `UNKNOWN`, model changed to `mistral-small-latest` with `temperature: 0`.
   **The fix exists in git but was never published to live.**
3. **`questionCount`/`halts` would be polluted by INCOMPLETE-continues.** Any re-entry via
   `Parse OpenCode Response → Run counter` mechanically increments `$runIndex`, and
   `Output.questionCount = $('Run counter').last().json.runIndex`. An INCOMPLETE-continue
   that bypasses the human form but re-enters the shared spine would count as a halt — a
   false autonomy signal. A separate counter is required. **Resolved in the committed
   implementation:** `Compute counts` node derives `questionCount = totalTraversals −
   incompleteTraversals` using branch-local `$runIndex` counters.
4. **`outcomeHistory` is broken (F-4, confirmed).** `$('BMAD Outcome').all()` does not
   aggregate across the `Get response` Wait-node resume boundary. Journal evidence: 232
   `step_end` events show `["COMPLETE"]`, 5 show `[]`, **0 ever show `"QUESTION"`** despite
   18 having `halts≥1`. Without fixing this, mid-stream `INCOMPLETE` outcomes vanish from
   reflection. **Resolved in the committed implementation:** `Accrete outcome (Q)` and
   `Accrete outcome (I)` nodes use `$getWorkflowStaticData` to persist the outcome sequence
   across loop iterations; `Compute counts` reads and cleans it up.
5. **The `salvaged`/`rc` signals exist in the shell but never reach the item flow.**
   `Agent run (initial/follow-up)` compute `salvagedOutput` and `rc` and write them only to
   `runner-errors.jsonl`. `Parse OpenCode Response` returns `{response}` only. `Routing`
   cannot see them. **Resolved in the committed implementation:** shells append a
   `runner_meta` JSON line to stdout; `Parse OpenCode Response` extracts `rc`/`salvaged` from
   it; `BMAD Outcome` Execute Workflow node passes `response`/`salvaged`/`rc` as inputs;
   `Determine outcome` uses them for deterministic classification.
6. **`Parse OpenCode Response` already surfaces provider errors** as `[opencode error]
   <msg>` (error-type JSON line fallback). This is a clean deterministic signal for
   infra-error → INCOMPLETE.
7. **`apply-amendments.mjs` is outcome-agnostic** — it reads proposals/observations/
   fingerprints, never raw outcomes. No change needed there.
8. **n8n Code nodes cannot read the filesystem** (V5: `JsTaskRunnerSandbox` blocks built-in
   modules; only `NODE_FUNCTION_ALLOW_EXTERNAL=uuid`). The cap cannot be read from
   `playbook.json` inside a Code node — it must be passed in via Execute Command or workflow
   inputs. **Resolved in the committed implementation:** `incompleteContinueCap` flows from
   `playbook.json` → `get-steps.mjs` → `Prep step` → `Run BMAD Session` workflowInputs →
   `Variables` node.
9. **`Assess step result` failure contract:** `failed = item.error !== undefined`. The
   `Output` node sets no `error` for any case today. Cap-exhaustion must set `error` to be
   seen as failure. **Resolved in the committed implementation:** `Output (cap exhausted)`
   sets `error: { message: "incomplete-continue cap exhausted (<N>)" }`; `Compute counts`
   also sets `error` for `UNKNOWN` outcomes.

## Design overview

### New outcome space

| Outcome | When | Routing |
| --- | --- | --- |
| `COMPLETE` | Agent finished cleanly | → Output (success) |
| `QUESTION` | Agent genuinely asks a human decision | → human form (unchanged) + **form timeout** (F-3.2, recommended companion) |
| `INCOMPLETE` | Agent quit mid-stream (timeout/provider error salvaged, or partial non-question text) — resumable | → auto-continue (resume session with "Continue"), capped at N |
| `UNKNOWN` | Empty output, unclassifiable, classifier failure | → failed (step retries via existing machinery) |

### New routing graph in BMAD Session (as implemented in HEAD)

```
... → Parse OpenCode Response → Run counter → BMAD Outcome → Routing
Routing[COMPLETE]   → Notify finish + Compute counts → Output                    (unchanged + Compute counts added)
Routing[QUESTION]   → Accrete outcome (Q) → Agent MD to HTML → Get response (Wait) → Agent run (follow-up) → Parse...
Routing[INCOMPLETE] → Accrete outcome (I) → Incomplete counter → Check cap
                       ├ under cap → Prepare continue (Answer="Continue") → Agent run (follow-up) → Parse...
                       └ over cap  → Output (cap exhausted) → Notify cap → Compute counts → Output
Routing[UNKNOWN]    → Compute counts → Output (failed, sets error)
```

The INCOMPLETE loop re-enters at `Agent run (follow-up)` (which uses `--session <id>`),
bypassing the `Get response` Wait form entirely. This is the core of the requested
behaviour.

### Classification logic: deterministic front-end + LLM tie-breaker (F-18)

A `Determine outcome` Code node runs **before** the LLM, handling the clear cases
deterministically; an `Outcome is null?` IF node gates the LLM so it only runs on
fall-through. This reduces cost, non-determinism, and data egress, and makes
infra-error→INCOMPLETE reliable.

**As implemented in HEAD:**

```
1. response is empty                              → UNKNOWN (failed)
2. response starts with "[opencode error]"        → INCOMPLETE (provider error; resume clears it — empirically verified)
3. salvaged==yes OR rc!=0 (when threaded)          → INCOMPLETE (timeout/crash; resume continues the work — empirically verified)
4. otherwise                                       → LLM decides {COMPLETE | QUESTION | INCOMPLETE}
```

Note: the plan originally specified a rule 4 ("response has explicit completion markers")
before LLM fall-through. The committed implementation does not have a separate rule 4 —
it falls through directly to the LLM. This is defensible (no reliable deterministic
completion markers were identified), but if empirical inspection of mid-thought responses
reveals a reliable marker, a rule 4 can be added later.

The LLM prompt (committed version) includes INCOMPLETE with instructions and an example:

```
IF it:
  - is a partial or truncated response
  - is mid-thought text where work was interrupted
  - indicates work was interrupted but no question is asked
THEN respond only with INCOMPLETE;

Examples:
- 'Now I will implement the' -> INCOMPLETE
```

Model is `mistral-small-latest` with `temperature: 0` (F-18).

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

Each phase is annotated with its **actual status** as of 2026-07-17.

### Phase 0 — Policy + script layer (safe, lands first)

| # | Where | Change | Effort | Status |
| --- | --- | --- | --- | --- |
| 0.1 | `_bmad-output/pipeline/playbook.json` `policy` | Add `"incompleteContinueCap": 10` (peer of `maxAttemptsPerStory`) | XS | **Done in git.** Working tree has it. |
| 0.2 | `scripts/pipeline/get-steps.mjs` | Also emit `incompleteContinueCap` from `policy` in its JSON output (currently uses only `.steps`) so it can be passed into BMAD Session | S | **Done in git.** Working tree has it (line 28, 32). |
| 0.3 | `scripts/pipeline/journal.mjs` `trends` | Add `incompleteCount` to per-step record and `incompleteCountPerStory` | S | **Done in git.** Working tree has it (lines 34, 42, 47, 60-63, 75). |
| 0.4 | `scripts/pipeline/reflect-prompt.mjs` | Add an `INCOMPLETES` guidance block | S | **Done in git.** Working tree has it (lines 62-63, 100). |

**Verify:** `node scripts/pipeline/get-steps.mjs <story>` shows `incompleteContinueCap`;
`node scripts/pipeline/journal.mjs trends` shows `incompleteCount` column.

### Phase 1 — BMAD Outcome classifier (`3D8Jw6GicWiwBQc6`)

| # | Node | Change | Effort | Status |
| --- | --- | --- | --- | --- |
| 1.0 | (investigation) | Empirically inspect mid-thought response shapes | S | **Partially done.** Rules 1-3 implemented; no separate rule 4 (falls through to LLM). Acceptable — add rule 4 later if a reliable marker is found. |
| 1.1 | `Classify response` (LLM prompt) | Add `INCOMPLETE` to enum and instructions | XS | **Done in git.** Prompt includes INCOMPLETE with instructions and an example. |
| 1.2 | `Validate Classification` (Code) | Add `INCOMPLETE`/`UNKNOWN`, replace throw with fallback | XS | **Done in git.** No throw; unrecognized → `UNKNOWN` with `classificationFallback: true`. |
| 1.3 | (new) `Determine outcome` (Code) + `Outcome is null?` (IF) | Deterministic front-end | S | **Done in git.** `Determine outcome` runs rules 1-3; `Outcome is null?` gates the LLM. |
| 1.4 | LLM model | Set `temperature: 0` (F-18) | XS | **Done in git.** Model is `mistral-small-latest`, `temperature: 0`. |
| 1.5 | `BMAD Outcome` Execute Workflow node (in BMAD Session) | Add `onError: continueRegularOutput` + `retryOnFail:true, maxTries:2` (F-10) | S | **Done in git.** Node has `onError: continueRegularOutput`, `retryOnFail: true`, `maxTries: 2`. Also passes `salvaged`/`rc` as workflow inputs. |

**Not on live.** The live BMAD Outcome still has the 2-outcome throwing classifier.

### Phase 2 — BMAD Session routing + continue path + counters (`C8qzMFk2e00sLHJg`)

| # | Node | Change | Effort | Status |
| --- | --- | --- | --- | --- |
| 2.1 | `Routing` (Switch v3.4) | Add Incomplete + Unknown rules | S | **Done in git (HEAD). Clobbered in working tree.** HEAD has 4 rules: Finished, Question, Incomplete, Unknown. |
| 2.2 | (new) `Accrete outcome (Q)` + `Accrete outcome (I)` (Code) | Prepend outcome to `accumulatedOutcomes` via `$getWorkflowStaticData` | M | **Done in git (HEAD). Clobbered in working tree.** Both nodes use `$getWorkflowStaticData('incomplete')` keyed by `$execution.id`. |
| 2.3 | (new) `Incomplete counter` (Code) | Branch-local `$runIndex` | XS | **Done in git (HEAD). Clobbered in working tree.** |
| 2.4 | (new) `Check incomplete cap` (IF) | Compare against `incompleteContinueCap` | S | **Done in git (HEAD). Clobbered in working tree.** |
| 2.5 | (new) `Prepare continue` (Set) | Set `Answer: "Continue"` | XS | **Done in git (HEAD). Clobbered in working tree.** |
| 2.6 | (new) `Output (cap exhausted)` (Set) | Sets `error` | XS | **Done in git (HEAD). Clobbered in working tree.** |
| 2.7 | (new) `Notify cap` (HTTP) | ntfy alert with `onError: continueRegularOutput` | XS | **Done in git (HEAD). Clobbered in working tree.** |
| 2.8 | `Output` (Set) assignments | Add `incompleteCount`, `salvaged`, `classificationFallback`; fix `outcomeHistory` | M | **Done in git (HEAD). Clobbered in working tree.** HEAD Output reads from `$json` (post-Compute counts). |
| 2.9 | `Agent run (follow-up)` | Confirm `--fork` is not set | — | **No structural change needed.** Node already uses `--session`. |
| 2.10 | `Extract SessionID` (Code) | Harden: scan all lines, return null+flag, fix type | S | **Done in git (HEAD). Clobbered in working tree.** HEAD version scans all stdout lines, sets `sessionIdMissing` flag, returns `string` type. |
| — | (new) `Compute counts` (Code) | Derive `incompleteCount`/`questionCount` from counters; read/clean `accumulatedOutcomes`; set `error` for UNKNOWN | M | **Done in git (HEAD). Clobbered in working tree.** Handles `$('Incomplete counter').isExecuted` with try/catch (resolves the flagged n8n-mechanics unknown). |

> **Phase 2.11 (form timeout) removed — deferred per decision #5.** No `Get response` Wait
> timeout in this change. Owner responds to forms manually.

### Phase 3 — Signal threading (`Parse OpenCode Response` + shells)

| # | Where | Change | Effort | Status |
| --- | --- | --- | --- | --- |
| 3.1 | `Agent run (initial/follow-up)` shells | Append `runner_meta` JSON line to stdout | XS | **Done in git (HEAD). Clobbered in working tree.** HEAD shells have `printf '{"type":"runner_meta","rc":%d,"salvaged":"%s"}\n'`. |
| 3.2 | `Parse OpenCode Response` `Extract JSON` (Code) | Extract `rc`/`salvaged` from `runner_meta` | S | **Done in git + working tree. Not on live.** |
| 3.3 | `Parse OpenCode Response` Execute Workflow node | Output includes `rc`/`salvaged` | — | **Done in git + working tree. Not on live.** |
| 3.4 | `Agent run` shells — stderr redaction | Redact `Bearer`/`sk-`/`Authorization`; keep error category | S | **Done in git (HEAD). Clobbered in working tree.** HEAD shells have `sed -E 's/(Bearer ...)/Bearer [REDACTED]/g'` and `category` field in jq output. |

### Phase 4 — Develop Story journal contract (`GGiJ7KGUez94SaOc`)

| # | Node | Change | Effort | Status |
| --- | --- | --- | --- | --- |
| 4.1 | `Run BMAD Session` Execute Workflow `workflowInputs` | Add `incompleteContinueCap` mapping | XS | **Done in git + working tree. Not on live.** |
| 4.2 | `Assess step result` (Code) jsCode | Add `incompleteCount`, `salvaged`, `classificationFallback` to `step_end` payload | S | **Done in git + working tree. Not on live.** |
| 4.3 | `Prep step` (Code) | Pass `incompleteContinueCap` through | XS | **Done in git + working tree. Not on live.** |

### Phase 5 — Reflection visibility

Covered by Phase 0.3/0.4 (trends + reflect-prompt). No `apply-amendments.mjs` change
(verified fact #7). The reflector can now see `incompleteCount`, the real `outcomeHistory`
sequence (F-4 fix), and has guidance to record `infra-incomplete-cap-exhausted` vs
`incomplete-loop-recurrence` observations. **Done in git. Working tree has it.**

### Phase 6 — Verification (before publishing any workflow)

**Not done.** This is the remaining work. Run after restoring BMAD Session from HEAD and
re-applying the Notify fix (see [Path forward](#path-forward)).

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
3. **Draft/active convergence:** confirm published BMAD Outcome matches the committed draft
   (resolves F-16). Confirm all 4 live workflows match the committed JSON.
4. **Publish** only after pin-data tests pass, and when no step is mid-run (publishing
   creates a new active version; in-flight executions continue on their version).

## Counters — the one genuinely hard n8n mechanic

The requirement: `questionCount` must count only human-form fires; `incompleteCount` must
count only auto-continues; they must not pollute each other (verified fact #3).

**Resolved in the committed implementation** using branch-local `$runIndex` counters:

- `Run counter` (shared spine): `runIndex = $runIndex` = total traversals
  (initial + questions + incompletes).
- `Incomplete counter` (INCOMPLETE branch only): `incompleteRunIndex = $runIndex` =
  incomplete traversals.
- `Compute counts` node derives:
  - `incompleteCount = incompleteTraversals` (from `$('Incomplete counter').last().json.incompleteRunIndex`)
  - `questionCount = totalTraversals − incompleteTraversals`

**The flagged n8n-mechanics unknown is resolved.** The `Compute counts` node handles the
"node never ran" case with try/catch + `$('Incomplete counter').isExecuted`:

```js
let incompleteCount = 0;
try {
  if ($('Incomplete counter').isExecuted) {
    incompleteCount = Number($('Incomplete counter').last().json.incompleteRunIndex) || 0;
  }
} catch {}
```

This was the single n8n-mechanics detail flagged for empirical confirmation — it is handled
in the committed code and should be verified via `test_workflow` with a step that has zero
INCOMPLETEs.

## Relationship to the existing n8n-workflow-review

This plan implements/requires several review findings. Mapping so there is no double-work:

| Review finding | Status in this plan |
| --- | --- |
| F-3.1 (thread `salvaged` flag) | **Implemented in git** (Phase 3.1-3.3). Not on live. |
| F-3.2 (form timeout) | **Deferred** (decision #5) — not in this change |
| F-3.3 (default to UNKNOWN not QUESTION) | **Implemented in git** (Phase 1.2). Not on live. |
| F-4 (outcomeHistory accretion) | **Implemented in git** (Phase 2.2, Compute counts). Not on live. |
| F-10 (BMAD Outcome onError) | **Implemented in git** (Phase 1.5). Not on live. |
| F-14 (Extract SessionID hardening) | **Implemented in git** (Phase 2.10). Not on live. |
| F-15 (salvaged/Fallback in Output) | **Implemented in git** (Phase 2.8). Not on live. |
| F-16 (draft/active divergence) | **Will resolve when published** (Phase 1.2 publishes converged version). Currently still divergent — live has 2-outcome throw, git has 3-outcome fallback. |
| F-17 (stderr redaction) | **Implemented in git** (Phase 3.4). Not on live. |
| F-18 (deterministic classifier layer) | **Implemented in git** (Phase 1.3). Not on live. |
| F-26 (arrayValue type) | **Implemented in git** (Phase 2.10). Not on live. |

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
- **Counter "node never ran" n8n mechanic** — **resolved.** The committed `Compute counts`
  node handles this with try/catch + `isExecuted` check. Verify via `test_workflow` with a
  zero-INCOMPLETE step.
- **`outcomeHistory` accretion across the QUESTION branch's Wait** — **resolved.** The
  committed implementation uses `$getWorkflowStaticData` (persisted across Wait resumes)
  rather than `.all()` (which breaks across Wait). Verify via `test_workflow`.
- **Draft is not active.** All workflow changes must be **published** to take effect; the
  on-disk JSON is the draft. **This is the core remaining work** — see
  [Path forward](#path-forward).
- **BMAD Session JSON was clobbered.** The working tree BMAD Session was exported from live
  (which never had INCOMPLETE), overwriting the committed draft. Must be restored from HEAD
  before publishing. The Notify fix (dynamic message body) exists only on live and must be
  re-applied after restore.

## Out of scope (deliberate)

- Lowering `reasoningEffort` (slowness doc Priority 1) — complementary but separate.
- Chaining epics, per-epic playbook overlays, concurrency.
- The broader review workstreams A/C/D/E/F (data-integrity, evidence, security,
  robustness, hygiene) — orthogonal, safe to leave.
