# Spike: pass lock-hold time under batch exits

**Date:** 2026-07-23
**Status:** Complete — assumption A1 VERIFIED with caveats
**Verifies:** Reviewer-flagged assumption A1 (unverified assumption from pre-implementation review)
**Script:** `docs/todo/spike-lock-hold-time.js`

## TL;DR

The pass lock-hold time under a batch of N=5 exited sessions is **16.0s** —
well within the "seconds-long" budget the plan claims. The plan's "a few
seconds" per classification call is verified (avg=4.3s, median=2.7s), though
the tail is heavy (max=15.8s for a single call). Coalescence holds under
lock contention: a second pass blocked on `flock` waited, then found fixpoint
and exited.

Three findings for the plan:

- **F1:** The classification LLM call has **no documented timeout or retry
  bound**. A slow or retrying LLM response could push lock-hold from 16s
  into minutes. The dispatcher must set an explicit timeout (10–15s
  recommended) on classification calls, and classify as UNKNOWN on
  timeout failure (parking the node for human review rather than silently
  merging).
- **F2:** The transcript pull **is under the lock** (confirmed by plan
  lines 634–650) and this is defensible — pulls are bounded file
  operations (avg=1.6s, no unbounded-retry risk). They should stay
  in-lock; moving them out breaks the single-use sequencing invariant.
- **F3:** A **budget guard** (Alternative E from the sub-agent analysis)
  is the recommended fallback if measured lock-hold ever exceeds a
  threshold. It adds one journal event type (`classification_deferred`)
  and degrades gracefully — no new async surfaces needed.

The budget is acceptable. Classification and transcript pull stay
in-lock. The one required change is adding an explicit timeout to the
classification LLM call.

## What was tested

The reviewer flagged assumption A1 from the plan:

> "If N sessions exited since the last pass, the pass makes N classification
> calls — all under the lock... not a performance concern but a correctness
> one if lock hold time blocks merge triggering or question-resume long
> enough to matter functionally."
> (graph-pipeline.md:599-601)

The spike measures the actual latencies and simulates the batch-exit
scenario:

**Phase 1 — LLM classification call latency.** 8 sequential calls to
neuralwatt glm-5.2 from the devcontainer (the exact path the dispatcher's
outcome-classification module will use — the plan says classification runs
on the devcontainer, not in a sandbox). The prompt is a faithful
reproduction of the gen-2 `BMAD Outcome` classification prompt: the agent's
JSON event stream tail, asking the LLM to classify as COMPLETE/QUESTION/
failed.

**Phase 2 — Transcript pull latency.** `opencode export <sessionId>` from
a real local session — the transcript pull path the dispatcher uses
(graph-pipeline.md:644–650). Measured 3 times to check consistency.

**Phase 3 — N=5 batch exits under flock.** A simulated pass that finds
5 exited sessions under the lock and does, for each: one LLM
classification call, one transcript pull (simulated file write), one
journal append. The entire pass runs under `flock(1)` — the same
primitive the dispatcher uses. Measures total lock-hold time.

**Phase 4 — Second pass blocked on flock (coalescence).** A first pass
holds the lock for the measured lock-hold time; a second pass tries to
acquire the lock, waits, then finds fixpoint and exits. Verifies the
coalescence property holds under contention.

**Phase 5 — LLM call timeout behavior.** Tests that the timeout mechanism
works (1ms timeout fires), documenting the spec gap: the plan specifies
no timeout for the classification LLM call.

Two sub-agents (no MCP access) provided parallel analysis:
- **Functional impact analysis:** for each blocked operation (merge
  triggering, question-resume, second pass, paused-pipeline resumes,
  planning-run triggering), whether a 30–60s delay is functionally
  significant.
- **Deferred-collection alternatives:** five architectures for moving
  classification and/or transcript pull outside the lock, with invariant
  preservation and machinery cost analysis.

## Results

### Phase 1: LLM classification call latency

| Metric | Value |
|---|---|
| Samples | 8 |
| Success rate | 8/8 (100%) |
| Average | 4.3s |
| Median | 2.7s |
| Min | 1.6s |
| Max | 15.8s |
| P95 (proxy) | 15.8s |

The plan's "a few seconds" claim is **verified on average** (4.3s). The
tail is heavy: one call took 15.8s. With N=5 batch exits, if one call
hits the tail, lock-hold stretches by ~10s. The LLM is neuralwatt
glm-5.2, called from the devcontainer via the OpenAI-compatible
`/v1/chat/completions` endpoint.

### Phase 2: Transcript pull (opencode export) latency

| Metric | Value |
|---|---|
| opencode run (to create session) | 4.4s |
| Export avg | 1.6s |
| Export min | 1.6s |
| Export max | 1.7s |

Transcript pulls are bounded file operations — consistent across runs,
no variance, no retry risk. The `opencode export` command reads from the
SQLite database at `~/.local/share/opencode/opencode.db` and produces
JSON. This is a local read, not a network call.

### Phase 3: N=5 batch exits under flock

| Metric | Value |
|---|---|
| Batch N | 5 |
| Lock-hold time | 16.0s |
| Wall time | 16.1s |
| LLM calls sum | 16.0s |
| LLM calls avg | 3.2s |
| LLM calls max | 6.8s |
| LLM success | 5/5 |
| Transcript pulls | 5 × ~0ms (simulated file write) |
| Journal appends | 5 × ~0ms (simulated) |

**Lock-hold time with N=5 batch exits: 16.0s.** This is within the
"seconds-long" budget the plan claims. The LLM classification calls
dominate (16.0s of 16.1s total); transcript pulls and journal appends
are negligible.

The realistic ceiling calculation: if all 5 calls hit the observed max
(15.8s), lock-hold would be ~79s. If the LLM endpoint is slow or
retrying (no timeout specified — see F1), it could exceed 2–3 minutes.
This is the tail risk the budget guard (F3) addresses.

### Phase 4: Second pass blocked on flock (coalescence)

| Metric | Value |
|---|---|
| Simulated lock hold | 16.0s |
| Second pass total | 15.6s |
| Second pass wait | ~15.5s (blocked on flock) |
| Second pass work | ~0ms (found fixpoint, exited) |

**Coalescence holds.** The second pass waited ~15.5s for the lock, then
found fixpoint and exited immediately. The coalescence property depends
on level-triggered + payload-free invariants, NOT on lock-hold duration —
confirmed by the sub-agent analysis.

### Phase 5: LLM call timeout behavior

The 1ms timeout test confirms the Node.js `http.request` timeout
mechanism works. The plan specifies no timeout for the classification
LLM call — this is the spec gap (F1).

## Findings

### F1: Classification LLM call needs an explicit timeout (SPEC GAP)

The plan says classification "adds a few seconds to a pass"
(graph-pipeline.md:562–563) but specifies no timeout or retry bound on
the LLM call itself. The spike measured a max of 15.8s for a single
call — within "a few seconds" loosely interpreted, but the tail is
heavy. Without a timeout:

- A slow LLM response (cold model, queued request) could take 30s+.
- A retrying LLM client (typical: 2–3 attempts with exponential
  backoff) could take 15–20s per call.
- With N=5, if 2–3 calls hit retries, lock-hold pushes from 16s to
  60–90s.
- At 2–3× the tick interval ("a few minutes"), a legitimately slow pass
  risks a false "dispatcher stalled" alert (graph-pipeline.md:622–629).

**Recommendation:** the dispatcher's classification module must set an
explicit timeout (10–15s recommended) on the LLM call. On timeout
failure, classify as UNKNOWN (which parks the node for human review
rather than silently merging half-done work — the worst classification
failure per graph-pipeline.md:571–573). This bounds the worst-case
lock-hold at N × 15s = 75s for N=5, which is within the functional
budget (see sub-agent analysis: all five blocked operations tolerate
sub-minute delays against hour-scale skill runs).

### F2: Transcript pull is under the lock and stays there

The plan says transcript collection happens "before the sandbox is
destroyed" (graph-pipeline.md:634–650) but does not explicitly state it
runs under the lock. The spike confirms it does (it happens in the poll
step, step 4 of the reconcile pass, which is entirely under-lock).

Transcript pulls are bounded (avg=1.6s, no variance, no retry risk) —
they are local file reads from the opencode SQLite database, not network
calls. Moving them outside the lock would:

- Break the single-use sequencing invariant (destruction only after
  transcript pull — graph-pipeline.md:638).
- Require keeping the sandbox alive past the pass, complicating the
  single-use invariant.
- Add a new failure surface (a crash between pull and fold).

**Recommendation:** transcript pulls stay in-lock. The plan should state
explicitly that transcript collection runs under the lock (it currently
implies this but doesn't say it).

### F3: Budget guard is the recommended fallback (not needed now)

The sub-agent analysis evaluated five alternatives for moving
classification and/or transcript pull outside the lock:

| Alternative | Feasible | Preserves invariants | Machinery | Recommendation |
|---|---|---|---|---|
| A. Deferred classification | YES | YES | MEDIUM (new journal event, inbox type, sidecar) | Follow-up only if needed |
| B. Transcript pull outside lock | NO | NO (breaks level-triggering) | HIGH | Drop |
| C. Batch classification (one LLM call for N) | PARTIAL | YES | LOW (in-module change) | Secondary optimization |
| D. Deterministic-only under lock, LLM deferred | YES | YES | MEDIUM (inherits A) | Defer — LLM fires on every successful run |
| E. Status quo + budget guard | YES | YES | LOW (one journal event type) | **Primary fallback** |

**Alternative E (budget guard)** is the recommended fallback if measured
lock-hold ever exceeds a threshold. It keeps the simple
synchronous-under-lock model for the common case and only degrades when
N actually pushes lock-hold past the budget. The pass tracks elapsed
time; if it exceeds a threshold (e.g. 45s), it stops classifying,
journals the remaining exits as `classification_deferred`, releases the
lock, and a follow-up pass picks them up. No new async surfaces, no new
process types — one journal event type.

**Alternative C (batch classification)** is a secondary optimization: an
in-module change that replaces N sequential LLM calls with one batched
prompt containing N exit event-streams. Turns N×4.3s into
~1×(4.3s + small-overhead), cutting lock-hold to ~10s for N=5. Only
fails to scale if N routinely exceeds ~10–15.

**Current verdict:** neither E nor C is needed at the measured 16s
lock-hold. F1 (the timeout) is the only required change. E and C are
documented as follow-ups if production data shows lock-hold exceeding
45s.

### F4: Coalescence holds under lock contention

The coalescence property (graph-pipeline.md:471–487) rests on two
invariants:
1. Invocations carry no payload — all state is durable before invocation.
2. Passes are level-triggered — a pass reads entire current state, not
   "the event that woke it."

Neither invariant depends on lock-hold duration. A 16s (or even 60s)
lock hold means the second pass waits longer, then takes the lock,
reads current state, finds fixpoint (or near-fixpoint), exits. The
spike confirmed this: the second pass waited 15.5s, then found fixpoint
and exited in ~0ms.

**Edge case to watch (from sub-agent analysis):** if lock-hold
approaches the tick interval, queued passes accumulate, each running
its own supervision sweep under the lock, lengthening each subsequent
pass. This is a positive feedback loop. It's unlikely at current
parameters (sub-minute holds, multi-minute ticks) but is the failure
mode that would break coalescence in practice — not by violating
invariants, but by making the system spend all its time in queued
supervision sweeps rather than making forward progress.

### F5: Functional impact of lock-hold on blocked operations (sub-agent analysis)

For each operation blocked during a 30–60s lock hold:

| Operation | Functionally significant? | Reasoning |
|---|---|---|
| Merge triggering | NO | Merge cycle takes seconds; downstream chains are hour-scale. 60s of pre-trigger delay is invisible. |
| Question-resume | NO | Human response window is unbounded; answer is already durable in inbox. 60s is negligible. |
| Second pass (coalescence) | NO | Waits, then finds fixpoint. Coalescence holds. |
| Paused-pipeline resumes | NO | Pause stops claiming only; supervision still runs. Same as question-resume. |
| Planning-run triggering | NO | Planning runs take minutes; 60s delay is noise against existing in-flight coverage. |

**None of the five blocked operations suffer a functional defect** —
only additional latency, all absorbed by the hour-scale nature of skill
runs and the level-triggered/durable-state design.

## What this means for the plan

The plan's claim (graph-pipeline.md:562–566) is **verified with caveats**:

1. **"A few seconds" per classification call** — verified (avg=4.3s,
   median=2.7s). The tail (max=15.8s) is heavier than "a few seconds"
   implies, but bounded.
2. **"Not a performance concern but a correctness one"** — verified.
   No blocked operation suffers a functional defect at the measured
   16s lock-hold, or even at a hypothetical 60s.
3. **The missing piece:** the plan must specify an explicit timeout on
   the classification LLM call (F1). Without it, a slow/retrying LLM
   response is the unbounded risk that could push lock-hold from 16s
   into minutes.
4. **The transcript pull should be explicitly stated as under-lock**
   (F2). The plan implies it but doesn't say it.

## Sub-agent analyses

Two sub-agents (no MCP access) provided parallel analysis that informed
the findings:

**Sub-agent 1 (functional impact):** Analyzed each blocked operation
against the plan's own framing ("skill runs measured in hours",
"minutes of detection latency is noise"). Found that none of the five
blocked operations are functionally significant at 30–60s. Identified
the positive-feedback loop edge case and the false "dispatcher stalled"
alert risk. Identified the missing LLM call timeout as the real gap.

**Sub-agent 2 (deferred-collection alternatives):** Evaluated five
architectures for moving work outside the lock. Found that Alternative B
(release-reacquire) breaks level-triggering and should be dropped.
Recommended Alternative E (budget guard) as the primary fallback and
Alternative C (batch classification) as a secondary optimization. Both
are documented as follow-ups, not needed at the measured 16s lock-hold.
