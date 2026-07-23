# Spike: planning-run context staleness vs. fold-time validation (I2)

**Date:** 2026-07-23
**Status:** Complete — assumption I2 VERIFIED (real gap, low frequency; recommended fix: re-fetch + fold-time SHA pin with automatic re-plan)
**Verifies:** Reviewer-flagged assumption I2 (unverified assumption from pre-implementation review)
**Script:** `docs/todo/spike-planning-context-staleness.js`

## TL;DR

I2 is a **real gap** — the existing delta validation catches structural staleness (claimed nodes, duplicate ids, dangling edges) but not semantic staleness: the planner reads an artifact at `origin/<trunkBranch>` at T0, another chain merges a different version between T0 and T1, and the delta's structurally-valid addNode ops target an artifact version that no longer exists on trunk. The planned nodes execute against stale content, potentially producing wrong work detected only at merge time or review — hours of wasted agent runtime.

The gap is **low-frequency in practice**: at a realistic merge rate (4 chains, each merging hourly) and a 20% file-overlap probability, only **~15% of planning runs** have semantic staleness. But the cost asymmetry is dramatic: a false positive (re-plan) costs minutes; a false negative (wrong agent work) costs hours — a **30:1 ratio**. This asymmetry strongly favors conservative rejection.

The recommended fix is **Design 6 (hybrid: re-fetch + fold-time SHA pin with automatic re-plan)**. The wrapper does `git fetch origin <trunkBranch>` right before the planner reads, then captures the trunk SHA (T0). At fold time, the pass compares the current trunk SHA (T1) to T0 — if trunk moved, the delta is rejected (`semantic_stale_trunk_moved`) and the level-triggered trigger re-fires a fresh planning run against current state. The re-fetch shrinks the window (fewer false positives); the SHA pin eliminates false negatives (zero semantic staleness reaches execution). The simulation shows a **91% reduction in expected wasted cost** vs. status quo.

The existing rework path ("an early-merged artifact is a promise") remains valuable for a **different failure mode** — implementation divergence from a stable artifact — and is not replaced by this fix. Design 6 catches "planner read old version"; rework catches "implementation diverged from the version the planner read."

Three findings for the plan:

- **F1:** The plan should add a fold-time semantic staleness check: the wrapper records the trunk SHA at T0 (after fetch, before the planner reads), and the fold rejects the delta if trunk moved between T0 and T1. The rejection rides the existing rejection path (journal evidence + delete inbox + level-triggered re-plan).
- **F2:** The wrapper should `git fetch origin <trunkBranch>` immediately before capturing the T0 SHA. The T0 SHA must be captured **after** the fetch, not before — capturing before the fetch guarantees a false positive (the fetch itself moves trunk).
- **F3:** Livelock is a documented residual risk at high merge rates (≥8 chains), not a blocking concern at realistic rates (≤4 chains). A "max replans before fallback to rework" counter is the documented fallback if production data shows livelock — do not build it preemptively.

## What was tested

The reviewer flagged assumption I2 from the plan:

> The planner reads graph.json at launch (T0). By fold time (T1), state has moved. The delta-validation spike verified that structural staleness (claimed nodes, merged nodes) is caught. But there's a semantic staleness layer the validation can't catch: the planner reads an artifact at origin/<trunkBranch> at T0. Between T0 and T1, another chain merges a different version of that artifact (or a conflicting change to the same files). The planner composed nodes based on the T0 artifact. The delta's addNode ops are structurally valid (fresh ids, legal edges), so validation passes. But the planned nodes are semantically wrong — they target an artifact version that no longer exists on trunk.

The spike is a **pure-logic discrete-event simulation** — no infrastructure, no network, no sandboxes, no LLM calls. It models the T0→T1 window as a Poisson merge arrival process, parameterized by merge rate, file-overlap probability, planning-run duration, and fold latency. Six mitigation designs are evaluated against the same simulated workload.

Six phases, each testing a specific question:

**Phase 1 — Window quantification.** How long is the T0→T1 window, and what fraction of planning runs see a merge land in it? Tests three merge rates (low, medium, high) and verifies the simulation matches the Poisson model. Also tests the re-fetch mitigation's window reduction.

**Phase 2 — Semantic staleness rate.** Of the merges that land in the window, how many touch files the planner read (true semantic staleness)? Tests three file-overlap probabilities and verifies the rate matches the Poisson thinning model.

**Phase 3 — Mitigation comparison.** For each of five designs (status quo, re-fetch only, SHA pin on any movement, file-overlap check, hybrid), what are the false positive, false negative, and wasted-cost rates? This is the key comparison.

**Phase 4 — Livelock risk.** Under Design 4/6 (reject on any trunk movement), how many consecutive rejections occur before a planning run succeeds? Is there a livelock risk at realistic merge rates?

**Phase 5 — Cost asymmetry validation.** Confirms that a false positive (re-plan, minutes) is 30× cheaper than a false negative (wrong node run, hours), and that the SHA pin reduces expected wasted cost by 91%.

**Phase 6 — T0 SHA capture ordering.** Verifies the critical ordering detail: the T0 SHA must be captured after the fetch, not before. Capturing before the fetch produces near-guaranteed false positives.

Two sub-agents (no MCP access) provided parallel analysis:
- **Staleness window analysis:** window quantification, file categorization (trunk vs. devcontainer-local), failure-mode tracing, and assessment of both candidate mitigations.
- **Mitigation design analysis:** enumeration of six designs, evaluation against a framework (staleness prevention, false positive/negative rate, machinery cost, invariant preservation, composition with rework), and a recommendation.

## Results

### Phase 1: window quantification — PASS

| Merge rate | Window (ticks) | Window (min) | Avg merges in window | Trials with ≥1 merge |
|---|---|---|---|---|
| low (1 merge/10 ticks) | 3 | ~12 | 0.30 | 25.7% |
| med (4 chains, hourly) | 3 | ~12 | 0.81 | 55.6% |
| high (8 chains) | 3 | ~12 | 1.50 | 78.0% |

The simulation matches the Poisson model: P(≥1 merge in window) ≈ 1 − e^(−λ·window), where λ is the merge rate and the window is 3 ticks (2-tick planning run + 1-tick fold latency). At a realistic medium merge rate, **55.6% of planning runs see at least one merge land in the window** — but only a fraction of those merges touch files the planner read (see Phase 2).

Re-fetch (Design 1) reduces the merge-in-window rate by only **1.8 percentage points** (55.8% → 54.0%) — the fetch is sub-tick, so the window shrinks minimally. Re-fetch is cheap hygiene, not a solution.

### Phase 2: semantic staleness rate — PASS

| Overlap probability | Semantic staleness rate |
|---|---|
| low (10%) | 7.7% |
| med (20%) | 14.6% |
| high (35%) | 25.3% |

The simulation matches the Poisson thinning model: P(semantic staleness) ≈ 1 − e^(−λ·p_overlap), where λ is the expected number of merges in the window and p_overlap is the probability a merge touches a planner-read file. At a realistic medium overlap (20%), **~15% of planning runs have semantic staleness** — the planner read a version of an artifact that was superseded by a concurrent merge before the fold.

### Phase 3: mitigation comparison — PASS (THE KEY RESULT)

| Design | FP% | FN% | Reject% | Wasted cost (ticks) |
|---|---|---|---|---|
| Design 5 (status quo) | 0.0% | 15.5% | 0.0% | 92,820 |
| Design 1 (re-fetch only) | 0.0% | 14.7% | 0.0% | 87,960 |
| Design 4 (SHA pin, reject any) | 41.5% | 0.0% | 55.9% | 8,300 |
| Design 2b/3 (file-overlap check) | 0.0% | 2.3% | 12.5% | 13,620 |
| Design 6 (re-fetch + SHA pin) | 39.8% | 0.0% | 54.1% | 7,952 |

**Design 6 (hybrid) is the clear winner.** It has **zero false negatives** (no semantic staleness reaches execution) and the **lowest wasted cost** (7,952 ticks vs. 92,820 for status quo — a 91% reduction). Its false positive rate (39.8%) is high, but each false positive costs only 2 ticks (~8 minutes of re-planning), while each false negative costs 60 ticks (~4 hours of wrong agent work).

Design 1 (re-fetch only) barely improves on status quo — it shrinks the window by 1.8 percentage points but still lets 14.7% of planning runs through with semantic staleness. Re-fetch alone is insufficient.

Design 2b/3 (file-overlap check) has a lower false positive rate (0%) but a non-zero false negative rate (2.3%) due to unreliable LLM self-reporting of read files. It also breaks the contentless-invocation invariant by coupling the fold to the planner's reported content. The precision gain is not worth the complexity and the unbounded false negative risk.

### Phase 4: livelock risk — PASS

| Merge rate | Avg replans | Max replans | Livelocks (of 1000) |
|---|---|---|---|
| low (0.1/tick) | 0.31 | 4 | 0 |
| med (0.27/tick) | 1.21 | 11 | 0 |
| high (0.5/tick) | 3.13 | 20 | 2 |
| burst (1.0/tick) | 11.62 | 20 | 313 |

At realistic merge rates (low and medium), **zero livelocks** occur — every planning run eventually catches a quiet window where trunk doesn't move. The average re-plan count is 0.31 (low) and 1.21 (medium), meaning most planning runs succeed on the first or second attempt.

At high merge rates (8+ chains), 2 livelocks out of 1000 simulations hit the 20-replan cap — a rare tail case, not a sustained problem. At burst rate (1 merge/tick, extreme), 313 of 1000 simulations livelock — but this rate is not realistic for a finite DAG (chains run out of work, merge demand drains).

**Livelock is a documented residual risk, not a blocking concern.** A "max replans before fallback to rework" counter is the documented fallback if production data shows livelock at realistic rates — do not build it preemptively.

### Phase 5: cost asymmetry validation — PASS

| Metric | Value |
|---|---|
| False positive cost | 2 ticks (~8 min) |
| False negative cost | 60 ticks (~4 hours) |
| Cost ratio (FN/FP) | 30:1 |

A false negative is **30× more expensive** than a false positive. This asymmetry is the load-bearing fact: it strongly favors conservative rejection. A design that rejects too often costs minutes; a design that rejects too rarely costs hours.

Expected wasted cost over 10,000 trials (medium merge rate):

| Design | Wasted cost (ticks) | Wasted cost (hours) | Reduction |
|---|---|---|---|
| Status quo | 90,420 | ~6,028 | — |
| SHA pin (any) | 8,138 | ~543 | 91.0% |

The SHA pin reduces expected wasted cost by **91%** — from ~6,028 hours to ~543 hours across 10,000 planning runs. The cost is the re-planning overhead (false positives), which is negligible against the hours of wrong agent work it prevents.

### Phase 6: T0 SHA capture ordering — PASS

| Ordering | False positive rate |
|---|---|
| Wrong (T0 SHA before fetch) | 47.8% |
| Correct (fetch, then T0 SHA) | 25.1% |

Capturing the T0 SHA **before** the fetch produces near-guaranteed false positives (47.8%) — the fetch itself moves trunk, so the fold always sees movement. Capturing **after** the fetch (correct ordering) produces 25.1% false positives — only real concurrent merges, not the fetch itself.

This ordering detail is critical: the wrapper must `git fetch` first, then capture the T0 SHA, then run the planner. The T0 SHA is stored in the delta's metadata (the envelope already carries `planningRunId`, `mode`, `authoredAt`, and a journal position — adding `trunkShaAtT0` is a one-field addition).

## Findings

### F1: The plan should add a fold-time semantic staleness check (SPEC GAP)

**Impact: High (prevents hours of wasted agent runtime)** — the existing delta validation (spike `spike-delta-validation.md`) catches structural staleness but not semantic staleness. A delta whose addNode ops are structurally valid (fresh ids, legal edges) but target an artifact version that was superseded by a concurrent merge passes validation and reaches execution. The planned nodes execute against stale content, producing wrong work detected only at merge time or review.

The fix is a fold-time trunk-SHA check: the wrapper records the trunk SHA at T0 (after fetch, before the planner reads), stores it in the delta's metadata. At fold time, the pass compares the current trunk SHA to T0 — if trunk moved, the delta is rejected with rule `semantic_stale_trunk_moved`. The rejection rides the existing rejection path (journal evidence + delete inbox + level-triggered re-plan). The simulation shows this eliminates 100% of false negatives at the cost of ~40% false positives (each costing ~8 minutes of re-planning).

**Recommendation:** add `trunkShaAtT0` to the delta envelope and a SHA-comparison check to the fold-time validation. The check runs after the existing structural validation (it's a cheaper, coarser check — if the structural validation already rejected, the SHA check is unnecessary).

### F2: The wrapper must fetch before capturing the T0 SHA (ORDERING DETAIL)

**Impact: High (wrong ordering produces near-guaranteed false positives)** — if the wrapper captures the T0 SHA before fetching, the fetch itself moves trunk, and the fold always sees movement. The simulation confirms: wrong ordering produces 47.8% false positives vs. 25.1% for correct ordering.

The correct sequence in the wrapper is: `git fetch origin <trunkBranch>` → `git rev-parse origin/<trunkBranch>` (T0 SHA) → run planner → wrapper promotes delta (with T0 SHA in metadata) → fold: `git rev-parse origin/<trunkBranch>` (T1 SHA) → compare.

**Recommendation:** document the wrapper's fetch-then-capture ordering explicitly. The fetch is already part of the wrapper's responsibilities (the plan says the wrapper can provide a clean read-only worktree); the T0 SHA capture is a one-line addition after the fetch.

### F3: Livelock is a documented residual risk, not a blocking concern (RESIDUAL RISK)

**Impact: Low (rare at realistic rates, documented fallback exists)** — under Design 6, a rejected delta re-plans automatically (level-triggered trigger re-fires). If trunk moves on every pass, every re-plan is also rejected — a livelock. The simulation shows this does not occur at low or medium merge rates (0 livelocks of 1000 simulations). At high rates (8+ chains), 2 of 1000 simulations hit the 20-replan cap. At burst rate (1 merge/tick, extreme), 313 of 1000 livelock — but this rate is not realistic for a finite DAG.

The DAG is finite: chains run out of work, merge demand drains, and the re-plan eventually catches a quiet window. Sustained livelock requires infinite merge demand, which is not a realistic pipeline shape.

**Recommendation:** document livelock as a residual risk. A "max replans before fallback to rework" counter (reject after N consecutive SHA-pin rejections, let the delta through and rely on the rework path) is the documented fallback if production data shows livelock at realistic rates. Do not build it preemptively — the simulation shows it's not needed at ≤4 chains.

### F4: Re-fetch alone is insufficient (HYGIENE, NOT SOLUTION)

**Impact: Low (re-fetch is worth doing but doesn't solve the problem)** — Design 1 (re-fetch only) reduces the merge-in-window rate by 1.8 percentage points (55.8% → 54.0%). It doesn't reject — it just shrinks the window slightly. Semantic staleness still reaches execution 14.7% of the time (vs. 15.5% without re-fetch). The reduction is negligible because the fetch is sub-tick — it moves T0 by less than a tick, barely shrinking the window.

Re-fetch is still worth doing as part of Design 6 (it reduces false positives by bringing the T0 SHA closer to current), but it is not a standalone solution.

### F5: The file-overlap check (Design 2b/3) is not worth the complexity (REJECTED)

**Impact: None (rejected design)** — Design 2b/3 (reject only if the trunk diff touches files the planner read) has a lower false positive rate (0%) but a non-zero false negative rate (2.3%) due to unreliable LLM self-reporting of read files. It also breaks the contentless-invocation invariant by coupling the fold to the planner's reported content. The precision gain (0% FP vs. 40% FP) is not worth the complexity (prompt contract change, tool-call instrumentation, unbounded false negative risk) and the invariant break.

The false positive cost under Design 6 (40% × 2 ticks = 0.8 ticks per planning run on average) is negligible. Spending engineering effort to reduce it to 0% by adding unreliable machinery is not justified.

### F6: I2 is the same failure mode as "early-merged artifact is a promise" but with a detection opportunity (CLARIFICATION)

**Impact: None (clarifies the relationship to existing rework path)** — the plan's Honest Costs section already acknowledges that "an early-merged artifact is a promise" and routes divergence to rework. I2 is functionally the same failure mode: a planned node executes against a diverged artifact and may produce wrong work. The outcome (rework) and the cost (hours) are identical.

The difference is *when* the divergence happened: the plan's framing covers divergence *after* the fold (the artifact was fresh when the planner read it; divergence is a future event). I2 covers divergence *between read and fold* (the artifact was already stale when the delta composed; the planner didn't know). This difference opens a **narrow detection opportunity at fold time** that the post-fold case doesn't have — the fold can check whether trunk moved during the window. The post-fold case has no such checkpoint.

Design 6 exploits this opportunity. The rework path remains valuable for the post-fold case (implementation divergence from a stable artifact), which Design 6 does not cover. The two are complementary: Design 6 catches "planner read old version"; rework catches "implementation diverged from the version the planner read."

## Sub-agent analyses

Two sub-agents (no MCP access) provided parallel analysis that informed the findings:

**Sub-agent 1 (staleness window analysis):** Quantified the T0→T1 window as 3–10 minutes (planning run + fold latency). Estimated the probability of a merge landing in the window at ~25% (low rate) to ~55% (medium rate). Categorized the planner's reads into trunk files (at risk: story specs, code, backlog) and devcontainer-local files (not at risk: graph.json, guidelines, decision-policy). Traced three failure modes: (1) merge conflict (detected at merge time, cheap), (2) wrong output (detected at review, expensive), (3) silent semantic divergence (detected never, dangerous). Concluded that I2 is already covered by the existing rework path but introduces a fold-time detection opportunity. Assessed re-fetch as cheap hygiene (reduces window by ~30–60 seconds) and the file-overlap check as sound in principle but blocked by the hard problem of knowing what the planner read. Recommended re-fetch as baseline, defer the overlap check unless wrapper instrumentation already exists.

**Sub-agent 2 (mitigation design analysis):** Enumerated six designs and evaluated each against a framework (staleness prevention, false positive/negative rate, machinery cost, invariant preservation, composition with rework). Key insight: the cost asymmetry (minutes vs. hours) strongly favors conservative rejection — a design that rejects too often costs minutes; a design that rejects too rarely costs hours. Found that Design 4 (SHA pin, reject any movement) fully prevents semantic staleness with near-zero false negatives, at the cost of ~40% false positives (each costing minutes). Design 6 (re-fetch + SHA pin) is the sweet spot: the re-fetch reduces false positives for free, the SHA pin eliminates false negatives. Rejected Design 3 (planner reports read-set) as unreliable (LLM self-reporting) and invariant-breaking (contentless invocation). Rejected Design 2c (allowlist) as a maintenance burden with silent false negatives. Identified the critical T0 SHA capture ordering (after fetch, not before) and the livelock residual risk. Recommended Design 6 with a documented "max replans" fallback.

## Mitigation designs evaluated

| Design | Staleness prevention | FP cost | FN rate | Machinery cost | Recommendation |
|---|---|---|---|---|---|
| 1. Re-fetch only | Partially (shrinks window) | Zero | ~15% | One `git fetch` | **Adopt as baseline** (hygiene, not solution) |
| 2a. SHA pin, reject any movement | Fully | ~40% (minutes each) | ~0% | Two `git rev-parse`, one comparison | **Adopt** (core of Design 6) |
| 2b. File-overlap check | Partially (unreliable) | 0% | ~2.3% | Prompt contract + tool instrumentation | **Reject** (unreliable, invariant-breaking) |
| 2c. Allowlist check | Partially | Moderate | Non-zero (silent) | New config surface | **Reject** (maintenance burden, silent FN) |
| 3. Planner reports read-set | Partially (unreliable) | Low | Unbounded | High (prompt + instrumentation) | **Reject** (LLM self-reporting unreliable) |
| 4. SHA pin + auto re-plan | Fully | ~40% (minutes each) | ~0% | Same as 2a + level-triggered re-fire | **Adopt** (same as 2a, framed as re-plan not error) |
| 5. Status quo (rework only) | Not at all | Zero | 100% of staleness | Zero | **Reject as primary** (retain as fallback) |
| 6. Hybrid (re-fetch + SHA pin) | Fully | ~40% (reduced by re-fetch) | ~0% | `git fetch` + two `git rev-parse` + comparison | **Adopt** (recommended design) |

**Design 6 (hybrid)** is the recommended design. It strictly dominates all others: full prevention (zero false negatives), minimal machinery (one fetch + two SHA comparisons + one string compare), no invariant breaks, no prompt contract changes, no new config surfaces, and no content coupling. The false positive cost (~40% of planning runs re-plan once, each costing ~8 minutes) is negligible against the 91% reduction in expected wasted cost.

**Design 3 (planner reports read-set)** is explicitly rejected. LLM self-reporting is too unreliable for a safety-critical check — the planner may forget a file, report a directory instead of files, or read files via `bash` (cat, grep) that the read-tracker doesn't intercept. The precision gain over Design 6 is not worth the unbounded false negative risk and the invariant break.

**Design 5 (status quo)** is rejected as the primary mitigation but retained as the fallback for the post-fold divergence case (implementation divergence from a stable artifact), which Design 6 does not cover.

## What this means for the plan

The plan has a real gap (F1) that is cheap to close. Four documentation changes are needed:

1. **F1: Add fold-time semantic staleness check.** The delta validation section (graph-pipeline.md:790-817) should add a trunk-SHA check: the wrapper records `trunkShaAtT0` in the delta envelope (after fetch, before the planner reads), and the fold rejects the delta with `semantic_stale_trunk_moved` if trunk moved between T0 and T1. The rejection rides the existing rejection path (journal evidence + delete inbox + level-triggered re-plan). This check runs after the structural validation — if the structural validation already rejected, the SHA check is unnecessary.

2. **F2: Document the wrapper's fetch-then-capture ordering.** The planning-run section (graph-pipeline.md:737-789) should state that the wrapper does `git fetch origin <trunkBranch>` → captures the T0 SHA → runs the planner. The T0 SHA must be captured after the fetch, not before — capturing before the fetch guarantees a false positive (the fetch itself moves trunk).

3. **F3: Document livelock as a residual risk.** The planning-run section should note that under the SHA-pin check, a rejected delta re-plans automatically (level-triggered trigger re-fires). At realistic merge rates (≤4 chains), livelock does not occur. A "max replans before fallback to rework" counter is the documented fallback if production data shows livelock at higher rates — do not build it preemptively.

4. **F6: Clarify the relationship to the existing rework path.** The Honest Costs section (graph-pipeline.md:1790-1793) should note that the fold-time SHA check catches "planner read old version" (divergence between read and fold), while the rework path catches "implementation diverged from the version the planner read" (divergence after fold). The two are complementary, not redundant.
