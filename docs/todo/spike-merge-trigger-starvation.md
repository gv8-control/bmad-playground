# Spike: merge-trigger vs. claim priority within step 6

**Date:** 2026-07-23
**Status:** Complete — assumption A2 VERIFIED with caveat (bounded latency, not true starvation; ordering fix recommended)
**Verifies:** Reviewer-flagged assumption A2 (unverified assumption from pre-implementation review)
**Script:** `docs/todo/spike-merge-trigger-starvation.js`

## TL;DR

The reviewer's starvation concern is **real as latency, not as true starvation**. Under the `claims-first` ordering (claim ready nodes depth-first, then trigger merges), merge triggers suffer up to **184 ticks of wait** (≈ hours) with **264 deferrals** in a steady-state contention scenario — but all merges eventually fire because the DAG is finite and independent ready-node demand drains. Under the `merges-first` ordering (trigger merges, then claim nodes), the same scenario shows a max wait of **3 ticks** (≈ minutes) with only **10 deferrals**.

Neither ordering produces true indefinite starvation on a finite DAG. But the latency difference is dramatic: `claims-first` can delay a merge by hours; `merges-first` delays by minutes. The fairness counter provides **zero protection** for merge triggers — it governs node-to-node selection, not action-to-action selection.

Three findings for the plan:

- **F1:** The plan must specify the ordering within step 6 explicitly. The current text ("Claim and launch" then "Merge triggering is level-triggered here too") reads as claims-first, which is the worse ordering. The plan should specify merges-first: evaluate pending merge triggers before claiming ready nodes.
- **F2:** The fairness counter does not protect merge triggers. Its scope is "which ready node to claim next," not "should we claim a node or trigger a merge." A merge trigger is an action, not a ready node — it's outside the counter's decision space.
- **F3:** True starvation requires an infinite supply of ready independent nodes perpetually saturating the pool — not a realistic finite-DAG pipeline shape. The duration asymmetry (merge = seconds, node = hours) prevents merges from creating sustained contention once they fire, but does not help a merge WIN a slot in the first place — that's purely an intra-pass ordering problem.

The recommended change is a one-line ordering specification: step 6 evaluates merge triggers before node claims. No new state, no new config, no new code paths.

## What was tested

The reviewer flagged assumption A2 from the plan:

> Step 6 is "Claim and launch" and mentions merge triggering inline: "a completed merge-point node... with the merge lock acquirable and capacity available... (re)triggers the merge-queue workflow" (graph-pipeline.md:525-542).
>
> The ordering within step 6 is unspecified. If the pass claims ready nodes depth-first before checking for pending merge triggers, and capacity is near-full, the merge trigger defers. But merge-point completions unblock cross-chain dependents — deferring a merge defers an entire chain's next segment. A busy pool with frequent completions could starve merge triggers indefinitely: every pass claims new nodes, filling the capacity freed by completions, never leaving room for the merge sandbox.

The spike is a **pure-logic discrete-event simulation** — no infrastructure, no network, no sandboxes, no LLM calls. It models the work graph (chains, merge points, cross-chain edges), the dispatcher pass (fold completions → re-evaluate readiness → claim depth-first with fairness bound → trigger merges capacity-gated), capacity accounting (`maxConcurrentSandboxes` includes the merge sandbox), and the duration asymmetry (node skill runs = 60 ticks ≈ hours; merge cycles = 1 tick ≈ seconds; tick ≈ a few minutes).

Five phases, each tested under both orderings (`claims-first` and `merges-first`):

**Phase 1 — The reviewer's exact scenario.** 3 chains, capacity=3. Chain A has a mid-chain merge at n2 (unlocks chain B). Chain C is independent. At start, A-n2 (merge point) and C-n2 (non-merge) are running and complete on tick 1. Tests whether the merge trigger for A-n2 fires.

**Phase 2 — Steady-state contention.** 6 independent chains, each 8 nodes long with a mid-chain merge at n3 and a final merge at n7. Capacity=5. At start, 5 chains' n3 (merge points) are running and complete on tick 1. This is the worst case: many merge triggers pending simultaneously, with continuous independent ready-node supply from each chain's n4-n7 successors. Tests whether merge triggers fire and how long they wait.

**Phase 3 — Finite-DAG drain.** 4 chains with cross-chain dependencies (chain B depends on chain A's mid-chain merge). Capacity=5. Tests the realistic single-run scenario: does the merge trigger fire before the completing chain exhausts its ready successors?

**Phase 4 — Burst completions.** 5 independent chains, each 2 nodes (n0 → n1(merge)). All n1 merge-point nodes complete simultaneously. `merge.lock` serializes to one merge cycle at a time. Tests how many passes until all merges land.

**Phase 5 — Duration asymmetry validation.** Confirms that a merge cycle (1 tick) frees its slot almost immediately, while a node claim (60 ticks) holds for hours-equivalent. Tests whether this asymmetry alone prevents sustained starvation.

Two sub-agents (no MCP access) provided parallel analysis:
- **Scheduling analysis:** whether the starvation is real under the literal plan text, whether the fairness counter helps, what the realistic starvation condition is, and whether merge-first ordering resolves it.
- **Mitigation design analysis:** enumeration of starvation scenarios, evaluation of five mitigation designs (merge-first ordering, capacity reservation, fairness counter extension, separate merge capacity, status quo), and a recommendation framework.

## Results

### Phase 1: reviewer scenario (3 chains, cap=3, 2 merge completions)

| Ordering | A-n2 merged | Max merge wait | Deferrals | Passes |
|---|---|---|---|---|
| claims-first | YES | 0 ticks | 0 | 189 |
| merges-first | YES | 0 ticks | 0 | 189 |

Both orderings fire the merge immediately. The reviewer's exact scenario (3 chains, cap=3) doesn't produce contention because the completing chain's successors need the merge to land (they're not ready), so there are no ready nodes to compete with the merge trigger. The scenario as specified doesn't trigger the starvation concern — the dependent chain's nodes are NOT ready until the merge lands, so they don't consume capacity.

### Phase 2: steady-state contention (6 chains, cap=5) — THE KEY RESULT

| Ordering | Merges landed | Max merge wait | Deferrals | Passes |
|---|---|---|---|---|
| claims-first | 12/12 | **184 ticks** | **264** | 517 |
| merges-first | 12/12 | **3 ticks** | **10** | 511 |

This is where the ordering matters dramatically. Under `claims-first`, merge triggers wait up to **184 ticks** (≈ hours at a few-minutes-per-tick) with **264 deferrals**. Under `merges-first`, the max wait is **3 ticks** (≈ minutes) with only **10 deferrals** (which are merge-lock serialization deferrals, not capacity deferrals).

Both orderings eventually fire all 12 merges — no true starvation on a finite DAG. But `claims-first` delays merges by hours while `merges-first` delays by minutes. The 264 deferrals under `claims-first` are capacity deferrals: every pass, depth-first claiming consumes freed slots before the merge trigger is evaluated.

### Phase 3: finite-DAG drain (4 chains, cap=5)

| Ordering | Terminal | Max merge wait | Deferrals |
|---|---|---|---|
| claims-first | YES | 0 ticks | 1 |
| merges-first | YES | 0 ticks | 1 |

In a realistic single-run scenario with moderate capacity (cap=5 for 4 chains), both orderings perform identically. The merge fires immediately because there's enough capacity for both claims and merges. The 1 deferral in each case is a merge-lock serialization (two merge-point nodes completed near-simultaneously), not a capacity deferral.

### Phase 4: burst completions (5 merge points, cap=5)

| Ordering | Merges landed | Max merge wait | Deferrals |
|---|---|---|---|
| claims-first | 5/5 | 3 ticks | 10 |
| merges-first | 5/5 | 3 ticks | 10 |

Both orderings perform identically for burst completions. The 10 deferrals are all merge-lock serialization (5 merges × 2 deferrals each while waiting for the lock). The max wait of 3 ticks is the time for the merge-lock queue to drain. No capacity contention occurs because all 5 nodes completed (freeing all 5 slots), and merges only need 1 slot at a time.

### Phase 5: duration asymmetry

| Metric | Value |
|---|---|
| Node slot hold | 60 ticks (≈ hours) |
| Merge slot hold | 1 tick (≈ seconds) |
| Ratio | 60:1 |

A merge trigger, once fired, frees its slot within 1 tick. A node claim holds its slot for 60 ticks. This means merges don't create sustained contention — but the asymmetry helps only AFTER a merge fires (frees quickly), not BEFORE (winning the slot is an intra-pass ordering problem).

## Findings

### F1: The plan must specify merges-first ordering (SPEC GAP)

The plan's step 6 text (graph-pipeline.md:525-542) presents "Claim and launch" first, then "Merge triggering is level-triggered here too" — reading as claims-first. The spike shows this is the worse ordering: under steady-state contention, it delays merges by up to 184 ticks (hours) with 264 capacity deferrals.

The `merges-first` ordering (evaluate pending merge triggers before claiming ready nodes) reduces the max wait to 3 ticks (minutes) with only 10 deferrals (all merge-lock serialization, not capacity). The cost is zero: no new state, no new config, no new code paths — just an ordering flip in step 6's logic.

**Recommendation:** the plan should specify that step 6 evaluates pending merge triggers before claiming ready nodes. Suggested text: "Step 6 evaluates pending merge triggers before claiming ready nodes. Merges get priority on capacity freed this pass. This eliminates a single-pass ordering race in which a depth-first node claim could consume a just-freed slot that a pending merge trigger also needs. Because merge cycles complete in seconds and run one-at-a-time under `merge.lock`, ordering them first does not materially delay node claims."

### F2: The fairness counter provides zero protection for merge triggers

The fairness counter (graph-pipeline.md:332-344) governs "which ready node to claim next" — it caps consecutive chain-following claims so an independent ready node can't starve. A merge trigger is **not a ready node** — it's an action ("trigger the merge-queue workflow"). The counter has no concept of "yield to a merge trigger." Its reset-on-yield resets the chain-following counter, not any merge-related state.

The spike confirms this: in Phase 2, the fairness counter (budget=5) is active throughout, yet `claims-first` ordering still produces 264 merge-trigger deferrals. The counter rotates which node gets claimed, but it always claims a node — never yielding to a merge trigger.

**Recommendation:** the plan should note that the fairness counter's starvation-freedom guarantee is scoped to "any independent ready node" and does not extend to merge triggers. Merges are protected by the merges-first ordering (F1), not by the counter.

### F3: True starvation requires infinite ready-node demand — not a realistic finite-DAG shape

True indefinite starvation (a merge trigger NEVER fires) requires every pass to find a ready node to claim before evaluating the merge trigger, indefinitely. This requires an unbounded supply of ready independent nodes that never drain. Real pipeline graphs are finite DAGs: chains have finite length, and independent ready-node demand eventually exhausts.

The spike confirms this: in all phases, both orderings eventually fire all merges. In Phase 2 (the worst case, 6 chains with continuous ready-node supply), all 12 merges land under both orderings — `claims-first` just takes 184 ticks longer for the last one.

The duration asymmetry (merge = 1 tick, node = 60 ticks) prevents merges from creating sustained contention once they fire (a merge frees its slot in 1 tick), but does not help a merge WIN a slot in the first place — that's purely an intra-pass ordering problem.

**Recommendation:** the plan should note that merge-trigger starvation is bounded-latency under any finite-DAG, hours-node workload, not true indefinite starvation. The merges-first ordering (F1) tightens the bound from hours to minutes.

### F4: The reviewer's exact scenario doesn't trigger the starvation

The reviewer specified "3 chains, 2 merge-point nodes completing in the same pass, capacity=3." The spike shows this scenario doesn't produce contention because the completing chain's successors need the merge to land (they're not ready), so there are no ready nodes to compete with the merge trigger. The starvation requires **independent ready nodes from other chains** to refill freed slots — which the reviewer's 3-chain scenario doesn't have in sufficient quantity.

The starvation manifests in Phase 2 (6 chains, cap=5) where each chain has 4+ independent ready successors (n4-n7) that depth-first claiming consumes before the merge trigger is evaluated. This is the realistic shape: a wide fan-out with multiple chains producing ready work while a merge is pending.

### F5: Merge-lock serialization is not capacity starvation

In Phase 4 (burst completions), both orderings show identical performance: 5/5 merges land, max wait 3 ticks, 10 deferrals. The deferrals here are merge-lock serialization (only one merge cycle at a time), not capacity starvation. This is correct behavior — `merge.lock` exists to serialize trunk writes. The 3-tick max wait is the time for the merge-lock queue to drain (5 merges × 1 tick each, with the last one waiting for the previous 4).

## Sub-agent analyses

Two sub-agents (no MCP access) provided parallel analysis that informed the findings:

**Sub-agent 1 (scheduling analysis):** Walked through the exact ordering ambiguity under the literal plan text. Found that the starvation is real as latency under `claims-first` ordering with continuous independent ready nodes, but bounded in finite pipelines. Confirmed the fairness counter provides zero protection for merge triggers — it operates on node-to-node selection, not action-to-action selection. Identified that merge-first ordering resolves the capacity-dimension starvation with minimal risk of reverse starvation, because the merge cycle's short duration (seconds) and merge.lock serialization (one at a time) naturally bound merge-trigger consumption.

**Sub-agent 2 (mitigation design analysis):** Enumerated five scenarios and evaluated five mitigation designs. Found that true starvation requires an infinite supply of ready independent nodes — not a realistic finite-DAG shape. The duration asymmetry (merge = seconds, node = hours) is the load-bearing fact: as long as it holds and the DAG is finite, status quo is correct (bounded latency). Recommended merge-first ordering as the low-cost improvement (strictly dominates status quo on the ordering race, costs nothing). Evaluated and rejected: capacity reservation (over-engineered), fairness counter extension (breaks level-triggered invariant), separate merge capacity (breaks "Honest costs"). Documented capacity reservation as a fallback if merge-trigger latency proves problematic in production.

## Mitigation designs evaluated

| Design | Starvation-freedom | Invariant preservation | Machinery cost | Recommendation |
|---|---|---|---|---|
| 1. Merges-first ordering | YES (eliminates ordering race) | Clean (all invariants intact) | Trivial (ordering flip) | **Adopt** |
| 2. Capacity reservation | YES, but at cost | Muddies cap concept | Low state, dubious magic constant | Fallback only |
| 3. Fairness counter extension | YES, with N×hours bound | **Breaks level-triggered** | High (new persistent state, new knob) | **Reject** |
| 4. Separate merge capacity | Trivially yes | **Breaks "Honest costs"** | Low state, high concept cost | Reject |
| 5. Status quo (no change) | Bounded latency (≤ hours) | Perfect | Zero | Acceptable but suboptimal |

**Design 1 (merges-first ordering)** is the recommended change. It strictly dominates status quo on the ordering race, costs nothing (no state, no config, no code paths), and introduces no meaningful reverse-starvation risk (merges hold slots for seconds, run one-at-a-time under `merge.lock`, so node claims aren't materially delayed).

**Design 2 (capacity reservation)** is documented as a fallback: "If merge-trigger latency proves problematic, reserve one slot for merge cycles by setting the effective node-claim cap to `maxConcurrentSandboxes - 1` (only when `maxConcurrentSandboxes ≥ 3`)."

**Design 3 (fairness counter extension)** should be explicitly rejected in the plan text. It breaks the level-triggered invariant by adding history-dependent escalation (a deferral counter that changes behavior based on past deferrals, not just current state), with no clean reset semantics and no compositional benefit over merge-first ordering.

## What this means for the plan

The plan's step 6 (graph-pipeline.md:525-542) has an ordering ambiguity that produces real latency under contention. The fix is a one-line specification:

1. **Specify merges-first ordering** (F1). Step 6 evaluates pending merge triggers before claiming ready nodes. This eliminates the single-pass ordering race where a depth-first node claim consumes a just-freed slot that a pending merge trigger needs.
2. **Note the fairness counter's scope** (F2). The starvation-freedom guarantee ("any independent ready node is guaranteed to be claimed within `fairnessBudget` node completions") applies to ready nodes, not merge triggers. Merges are protected by the merges-first ordering, not by the counter.
3. **Note bounded-latency, not true starvation** (F3). Merge-trigger starvation is bounded-latency under any finite-DAG, hours-node workload. True starvation requires infinite ready-node demand, which is not a realistic pipeline shape.
4. **Document capacity reservation as a fallback** (Design 2). If production data shows merge-trigger latency exceeding bounds, reserve one slot for merge cycles.
5. **Explicitly reject fairness counter extension** (Design 3). To prevent future re-introduction of a design that breaks the level-triggered invariant.
