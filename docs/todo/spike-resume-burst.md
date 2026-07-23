# Spike: pause/resume burst interaction (resume-burst)

**Date:** 2026-07-23
**Status:** Complete — resume-burst VERIFIED as a non-issue; no deadlock, no thrash, no capacity violation in any tested scenario; one spec clarification needed
**Verifies:** Reviewer-flagged resume-burst interaction (unverified assumption from pre-implementation review)
**Script:** `docs/todo/spike-resume-burst.js`

## TL;DR

The reviewer's resume-burst concern is **structurally impossible as stated, and bounded-latency in its realistic form**. The plan's existing mechanisms — `merge.lock` serialization (at most one merge sandbox live at a time), merges-first ordering (merge triggers evaluated before claims), the fired-trigger-reserves-slot rule, and the fairness counter — handle the resume burst correctly without any resume-specific behavior.

The reviewer's literal worst case ("capacity fills with merge sandboxes") cannot occur: `merge.lock` serializes merge cycles one-at-a-time (graph-pipeline.md:1067, :1697-1699), so at most one slot is ever a merge sandbox at cap ≥ 2. The realistic worst case (many pending merge *triggers*, deep ready frontier) produces minutes of merge-heavy execution at resume, after which the pipeline returns to steady-state node work measured in hours.

Six findings for the plan:

- **F1:** No deadlock in any tested scenario. The resume pass always makes forward progress: merges drain at one-per-tick (seconds each), node claims fill remaining capacity in parallel, the finite DAG eventually reaches terminal state.
- **F2:** No thrash. The merge-trigger queue drains monotonically (each merge completes in 1 tick, the next trigger fires the following pass). No re-queueing, no torn claims, no deferral cycles. The worst-case merge wait was 5 ticks (minutes) under cap=3 with 6 chains.
- **F3:** No capacity violation. The fired-trigger-reserves-slot rule (F2 from `spike-merge-point-lifecycle.md`, already in the plan) holds across the resume transition. Zero capacity-exceeded events across all 13 test scenarios.
- **F4:** The cap=1 edge case does not deadlock. Resume into a single-slot pool held by a merge: the first resume pass claims nothing (capacity=0), the merge completes in 1 tick, the next pass claims the first ready node. Blocking for seconds, not deadlock.
- **F5:** A conflict-blocked chain during pause stays blocked for the entire pause window — conflict-mode planning launches are gated by pause (graph-pipeline.md:1031-1032). At resume, the conflict-mode planning run triggers immediately, the resolution node is appended, and the chain recovers. This is a latency cost (pause duration + planning + resolution skill run), not a deadlock, and it is a deliberate consequence of pause gating claiming.
- **F6:** The fairness counter rotates chains correctly across the resume burst. In Phase R6 (8 chains, cap=4), all 8 chains' ready nodes were eventually claimed — no starvation. The claim order shows the fairness counter yielding after `fairnessBudget` consecutive chain-following claims.

One spec clarification is needed: the plan should note that pause gates conflict-mode planning launches (not just expansion launches), so a conflict-blocked chain stays blocked through the pause. This is already implied by the plan's text but not stated explicitly.

## What was tested

The reviewer flagged the resume-burst interaction:

> During pause: claiming stops, but merge triggering continues ("finishing claimed work"). Merge sandboxes count against maxConcurrentSandboxes. So during a pause:
> - In-flight merge-point nodes complete → trigger merges → merge sandboxes consume capacity
> - No new claims fire (paused)
> - If enough merges queue up, capacity fills with merge sandboxes
> - When the human resumes, the pool may be full of merge sandboxes (or recently-freed merge slots), and the ready-node frontier may be deep (many successors unblocked by the merges)
>
> Spike scope: Simulation only. Verify the resume path doesn't deadlock or thrash when N merges landed during pause and M successors are now ready.

The spike is a **pure-logic discrete-event simulation** — no infrastructure, no network, no sandboxes, no LLM calls. It extends the `spike-merge-point-lifecycle.js` model with pause/resume state: the pause gate on claiming and planning launches, merge triggering continuing during pause, conflict-blocked chains staying blocked through pause, and the resume burst (deep ready frontier + pending merge triggers).

Six phases, each testing one aspect of the resume burst:

**Phase R1 — Resume into empty pool, deep frontier.** 6 chains, each 8 nodes with a mid-chain merge at n2. All n2 merge-points complete simultaneously at tick 1. Pause at tick 1. Merges land during pause (serialized by `merge.lock`, ~6 ticks). Resume at tick 10 (after all merges land). Frontier has 6 chains × 1 ready node each (n3), pool is empty. Tests whether depth-first claiming fills the pool without deadlock or thrash. Tested at cap=3 and cap=5.

**Phase R2 — Resume into partially-full pool (merge in flight).** 3 chains, cap=3 and cap=5. Chain merge-point nodes complete at tick 1. Pause at tick 1. Merge trigger fires during pause, materializes at tick 2. Resume at tick 2 (while merge is still running, completes at tick 3). Tests whether the resume pass correctly accounts for the in-flight merge's slot.

**Phase R3 — Resume into cap=1 held by a merge.** 1 chain, 4 nodes. n1 (merge-point) completes at tick 1. Pause at tick 1. Merge materializes at tick 2. Resume at tick 2 (while merge is running). Tests whether the first resume pass claims nothing (capacity=0), then the next pass (after merge completes at tick 3) claims the first ready node. No deadlock.

**Phase R4 — Conflict-blocked chain during pause.** 3 chains. Chain A's merge-point node (n2) conflicts on first merge. During pause: conflict report is folded, chain is blocked, conflict-mode planning is gated by pause. At resume: conflict-mode planning run triggers, resolution node appended, resolution runs, re-merge succeeds. Tests whether the blocked chain recovers and independent chains proceed.

**Phase R5 — Burst of N pending merge triggers at resume.** 5 chains, each 4 nodes with merge at n2 and n3. All n2 complete at tick 1. Pause at tick 1. Some merges fire during pause (one per tick, serialized by `merge.lock`), some are still pending at resume (tick 3). Tests whether merges drain one-per-tick, node claims fill remaining capacity in parallel, no capacity over-count.

**Phase R6 — Deep frontier re-filling pool on subsequent passes.** 8 chains, cap=4. All merges landed during pause. At resume, frontier has 8 ready nodes (one per chain), pool is empty. Tests whether the fairness counter rotates chains across pool-fills, no starvation, all ready nodes eventually claimed.

Two sub-agents (no MCP access) provided parallel analysis that informed the findings:

- **Scheduling analysis:** Walked through the exact resume-burst mechanics, deadlock analysis, thrash analysis, and capacity accounting. Identified that the reviewer's "pool full of merge sandboxes" framing is structurally impossible at cap ≥ 2 due to `merge.lock` serialization. Confirmed the cap=1 edge case is blocking-not-deadlock. Identified the conflict-blocked-during-pause case as the most interesting latency cost.

- **Mitigation design analysis:** Enumerated five resume-burst scenarios and evaluated five mitigation designs (status quo, drain-merges-before-claims, staged resume, capacity reservation, burst-aware fairness). Found that only status quo preserves all five invariants (level-triggered, merges-first, single-writer, pause-stops-claiming-not-execution, fairness-counter-semantics). Designs B, C, and E break level-triggered; D inverts the documented capacity-reservation direction. Recommended no code change; the existing Honest-costs fallback covers the only realistic failure mode.

## Results

### Phase R1: resume into empty pool, deep frontier

| Cap | Terminal | Stalled | First claim after resume | Capacity exceeded | Merge deferrals | Max merge wait |
|---|---|---|---|---|---|---|
| 3 | YES | NO | tick 10 (immediate) | NO | 12 | 5 ticks |
| 5 | YES | NO | tick 10 (immediate) | NO | 6 | 1 tick |

Resume into an empty pool with a deep frontier is the benign case. The first post-resume pass claims ready nodes immediately (tick 10 = the resume tick). All 30 claims (6 chains × 5 remaining nodes) complete across the simulation. The merge deferrals are `merge.lock` serialization (one merge at a time), not capacity deferrals. At cap=3, the max merge wait is 5 ticks (minutes); at cap=5, it's 1 tick. No deadlock, no thrash, no capacity violation.

### Phase R2: resume into partially-full pool (merge in flight)

| Cap | Terminal | Stalled | First claim after resume | Capacity exceeded | Merge deferrals |
|---|---|---|---|---|---|
| 3 | YES | NO | tick 3 (after merge completes) | NO | 0 |
| 5 | YES | NO | tick 3 (after merge completes) | NO | 0 |

Resume into a pool with an in-flight merge is handled correctly. The merge materializes at tick 2 (the resume tick), but the merge hasn't completed yet. The resume pass sees the merge sandbox occupying 1 slot. At cap=3, 2 slots are free — but the ready nodes (n3 successors) need the merge to land first (they depend on the merge-point node). So the first claim happens at tick 3, after the merge completes and the successors become ready. Zero capacity deferrals: the fired-trigger-reserves-slot rule prevents the node-claim phase from consuming the merge's slot. No capacity violation.

### Phase R3: resume into cap=1 held by a merge

| Cap | Terminal | Stalled | First claim after resume | Capacity exceeded |
|---|---|---|---|---|
| 1 | YES | NO | tick 3 (after merge completes) | NO |

The cap=1 edge case does not deadlock. At resume (tick 2), the single slot is held by the in-flight merge sandbox. The resume pass sees capacity=0 and claims nothing. The merge completes at tick 3, freeing the slot. The next pass (tick 3) claims the first ready node. This is **blocking for 1 tick (seconds), not deadlock**. The merge cycle's only external dependencies are git operations, which nothing in the design lets a node claim interfere with (the single-writer invariant on `merge.lock` ensures this).

### Phase R4: conflict-blocked chain during pause

| Cap | Terminal | Stalled | A-n2 final status | B-n2 final status | Conflict planning runs | Final tick |
|---|---|---|---|---|---|---|
| 3 | YES | NO | merged | merged | 1 | 197 |
| 5 | YES | NO | merged | merged | 1 | 197 |

A conflict-blocked chain during pause stays blocked for the entire pause window because conflict-mode planning launches are gated by pause (graph-pipeline.md:1031-1032). At the resume pass (tick 10), the conflict-mode planning run triggers immediately (planning was deferred during pause). The resolution node is appended at tick 14, claimed at tick 14, completes at tick 74 (60-tick skill run), and its merge succeeds at tick 76. The original merge-point node (A-n2) is marked `merged` when the resolution node's merge lands. Independent chains (B, C) proceed normally during and after the pause. No deadlock, no capacity violation.

The latency cost for the blocked chain: pause duration (9 ticks) + planning run (3 ticks) + resolution node skill run (60 ticks) + re-merge (2 ticks) = 74 ticks from the conflict to resolution. This is the normal conflict-resolution path (verified by `spike-merge-point-lifecycle.md` Phase 3: 68 ticks) plus the pause window — not a burst artifact.

### Phase R5: burst of N pending merge triggers at resume

| Cap | Terminal | Stalled | First claim after resume | Merge triggers | Merge deferrals | Max merge wait |
|---|---|---|---|---|---|---|
| 3 | YES | NO | tick 7 | 10 | 6 | 3 ticks |
| 5 | YES | NO | tick 3 | 10 | 0 | 0 ticks |

A burst of pending merge triggers at resume drains correctly. At cap=3, 6 merge deferrals occur (merge.lock serialization — one merge at a time, 5 of 10 triggers deferred while waiting for the lock). The max merge wait is 3 ticks (minutes). At cap=5, zero deferrals — enough capacity for all merges to proceed without contention. The first claim at cap=3 is tick 7 (after 4 merges drain); at cap=5 it's tick 3 (immediate, after the first merge completes). No capacity violation, no deadlock, no thrash.

### Phase R6: deep frontier re-filling pool on subsequent passes

| Cap | Terminal | Stalled | Chains claimed | Capacity exceeded | Claim order |
|---|---|---|---|---|---|
| 4 | YES | NO | 8/8 | NO | R6-0, R6-1, R6-2, R6-3, R6-5, R6-4, R6-6, R6-7 |

The fairness counter rotates chains correctly across the resume burst. With 8 chains and cap=4, the first pass claims 4 nodes (R6-0 through R6-3). As slots free (nodes complete), subsequent passes claim the remaining chains' nodes. The claim order shows the fairness counter yielding: after R6-0 through R6-3 (4 consecutive chain-following claims = `fairnessBudget`), the counter yields to R6-5 before R6-4, then R6-6, R6-7. All 8 chains' ready nodes were eventually claimed — no starvation. This is the intended consequence of depth-first with fairness: one chain gets a head start, then the counter rotates.

## Findings

### F1: No deadlock in any tested scenario (VERIFIED)

**Impact: None (confirms the plan's design)** — the resume pass always makes forward progress. In all 13 test scenarios (6 phases × multiple caps), the simulation reached terminal state without deadlock or stall. The mechanisms that prevent deadlock:

- `merge.lock` serialization ensures at most one merge cycle is in flight. Merges complete in 1 tick (seconds), freeing their slot.
- Merges-first ordering means pending merge triggers get first claim on freed capacity, but they don't block node claims on remaining capacity.
- The finite DAG eventually drains: every merge completes, every node completes, every ready node is eventually claimed (guaranteed by the fairness counter — graph-pipeline.md:343-351).

The only deadlock candidate — resume into cap=1 held by a merge (Phase R3) — resolves itself in 1 tick (the merge completes, the slot frees, the next pass claims).

**Recommendation:** no change needed. The plan's existing design handles the resume burst without deadlock.

### F2: No thrash — merge queue drains monotonically (VERIFIED)

**Impact: None (confirms the plan's design)** — the merge-trigger queue drains monotonically. Each merge cycle completes in 1 tick, the next trigger fires the following pass. No re-queueing, no torn claims, no deferral cycles. The worst-case merge wait was 5 ticks (Phase R1, cap=3, 6 chains with mid-chain merges) — minutes, not hours.

The "burst" produces throughput pressure (the pool stays fuller for longer as the deep frontier drains), not thrash. This is the same dynamic as normal steady-state operation when a fan-out produces more ready nodes than capacity can absorb at once. The dispatcher claims up to capacity, the pool fills, and further claims wait for completions — the design's intended dispatch pattern (graph-pipeline.md:580-582).

**Recommendation:** no change needed.

### F3: No capacity violation — fired-trigger-reserves-slot holds across resume (VERIFIED)

**Impact: None (confirms the plan's design)** — zero capacity-exceeded events across all 13 test scenarios. The fired-trigger-reserves-slot rule (F2 from `spike-merge-point-lifecycle.md`, already in the plan at graph-pipeline.md:548) holds across the resume transition. Within the resume pass, if step 6a fires a merge trigger, that trigger's slot is reserved before step 6b (claims) runs. 6b cannot consume the slot.

The single-writer lock (graph-pipeline.md:1063, :1115-1119) ensures at most one pass mutates graph state at a time. Two passes cannot simultaneously claim and over-count. `merge.lock` ensures only one merge cycle can be in flight, so only one fired-but-unmaterialized trigger can reserve a slot at any moment.

**Recommendation:** no change needed.

### F4: cap=1 resume edge case is blocking, not deadlock (VERIFIED)

**Impact: None (confirms the plan's design)** — resume into a single-slot pool held by a merge does not deadlock. The first post-resume pass claims nothing (capacity=0). The merge completes in 1 tick (seconds), freeing the slot. The next pass claims the first ready node. This is blocking for seconds, not deadlock.

The merge cycle's only external dependencies are git operations (fetch, push — graph-pipeline.md:1703-1711). Nothing in the design lets a node claim interfere with a running merge (the single-writer invariant on `merge.lock` ensures this). The cap=1 case is structurally the same as the general case — just slower (only one node runs at a time, depth-first).

**Recommendation:** no change needed. The plan's Pause/resume section could optionally note this edge case so an implementer doesn't mistake the 1-tick blocking for a deadlock, but it's not required.

### F5: Conflict-blocked chain during pause is a latency cost, not a deadlock (VERIFIED)

**Impact: Low (documentation gap)** — a conflict-blocked chain during pause stays blocked for the entire pause window because conflict-mode planning launches are gated by pause (graph-pipeline.md:1031-1032: "No new planning runs launch while paused"). At the resume pass, the conflict-mode planning run triggers immediately, the resolution node is appended, and the chain recovers via the standard conflict-resolution path (verified by `spike-merge-point-lifecycle.md` Phase 3).

This is a latency cost (pause duration + planning run + resolution node skill run + re-merge), not a deadlock. It is a deliberate consequence of pause gating claiming: planning runs produce unclaimed nodes, and allowing planning during pause would inject unclaimable nodes into the graph. The blocked chain's resolution proceeds in parallel with the rest of the resume burst — no interaction.

The plan's text at graph-pipeline.md:1031-1032 says "No new planning runs launch while paused; an in-flight planning run is supervised to completion." The conflict-mode case (graph-pipeline.md:1766-1767) describes the trigger but doesn't explicitly note the pause interaction. A reader could reasonably infer that conflict-mode planning is exempt from the pause gate (since it's "finishing claimed work" in some sense — the conflict happened during claimed work). It is not exempt.

**Recommendation:** add one clarifying sentence to the Pause/resume section: "Conflict-mode planning launches are also gated by pause; a conflict-blocked chain stays blocked through the pause window and only begins resolution at the resume pass."

### F6: Fairness counter rotates chains correctly across resume burst (VERIFIED)

**Impact: None (confirms the plan's design)** — the fairness counter rotates chains correctly across the resume burst. In Phase R6 (8 chains, cap=4), all 8 chains' ready nodes were eventually claimed — no starvation. The claim order (R6-0, R6-1, R6-2, R6-3, R6-5, R6-4, R6-6, R6-7) shows the counter yielding after 4 consecutive chain-following claims (`fairnessBudget` = 4), then rotating to R6-5 before returning to R6-4.

The fairness counter's starvation-freedom guarantee ("any independent ready node is guaranteed to be claimed within `fairnessBudget` node completions" — graph-pipeline.md:343-351) holds across the resume transition. The counter is per-pool (not per-chain), resets on yield, and starts at 0 at the resume pass — no history-dependent state, no burst-mode flag.

**Recommendation:** no change needed. The fairness counter's existing design handles the resume burst correctly.

### F7: The reviewer's "pool full of merge sandboxes" framing is structurally impossible (CLARIFICATION)

**Impact: None (clarifies the reviewer's framing)** — the reviewer's literal worst case ("capacity fills with merge sandboxes") cannot occur at cap ≥ 2. `merge.lock` serializes merge cycles one-at-a-time (graph-pipeline.md:1067, :1697-1699), so at most one slot is ever a merge sandbox. The realistic equivalent is "one merge sandbox in flight, N−1 merge triggers pending behind `merge.lock`" — which reduces to the bounded-latency case verified by Phases R1 and R5.

At cap=1, the pool can be full of a single merge sandbox (Phase R3), but this resolves in 1 tick (seconds) — blocking, not deadlock.

**Recommendation:** optionally note in the Honest costs section that `merge.lock` structurally bounds live merge sandboxes to 1, so the pool can never be "full of merge sandboxes" at cap ≥ 2. This prevents the over-stated framing from re-emerging in review.

## Sub-agent analyses

Two sub-agents (no MCP access) provided parallel analysis that informed the findings:

**Sub-agent 1 (scheduling analysis):** Walked through the exact resume-burst mechanics step by step. Identified that the reviewer's "pool full of merge sandboxes" framing is structurally impossible at cap ≥ 2 due to `merge.lock` serialization — at most one merge sandbox is live at any moment. Confirmed the cap=1 edge case is blocking-not-deadlock (the merge completes in seconds, the next pass claims). Identified the conflict-blocked-during-pause case (F5) as the most interesting latency cost: conflict-mode planning is gated by pause, so a conflict-blocked chain stays blocked through the entire pause window. Confirmed the fairness counter's starvation-freedom guarantee holds across the resume transition (the counter is per-pool, resets on yield, starts at 0 at resume). Proposed six simulation phases (R1-R6) that match the implemented spike.

**Sub-agent 2 (mitigation design analysis):** Enumerated five resume-burst scenarios (empty pool/deep frontier, "full-merge" pool, partial-merge/deep frontier, empty/shallow, conflict-blocked) and evaluated five mitigation designs. Found that the reviewer's "full-merge pool" scenario (B) is structurally impossible under `merge.lock`. Confirmed only Design A (status quo) preserves all five invariants: level-triggered (resume is a fold event like any other — graph-pipeline.md:1037-1039), merges-first ordering, single-writer, pause-stops-claiming-not-execution, and fairness-counter-semantics. Designs B (drain-merges-before-claims), C (staged resume), and E (burst-aware fairness) all break level-triggered by introducing history-dependent state. Design D (capacity reservation for claims) inverts the documented capacity-reservation direction — the existing Honest-costs fallback (graph-pipeline.md:1848-1851) already covers the only realistic failure mode (merge-trigger latency exceeding bounds), with the correct direction (reserve for merges, not for claims). Recommended no code change; the existing fallback is the correct response if the burst proves problematic in production.

## Mitigation designs evaluated

| Design | Deadlock-freedom | Invariant preservation | Machinery cost | Recommendation |
|---|---|---|---|---|
| A. Status quo (no change) | YES (verified) | Clean (all 5 invariants intact) | Zero | **Adopt** |
| B. Drain-merges-before-claims at resume | YES, but slower | **Breaks level-triggered** (resume-specific mode) | Low state, high conceptual cost | **Reject** |
| C. Staged resume (ramp up claims) | YES, but throttled | **Breaks level-triggered** (ramp counter is history) | New state, new knob, new edge cases | **Reject** |
| D. Capacity reservation for claims | Marginal | Muddies cap concept; inverts documented direction | Low state, dubious magic constant | **Reject** |
| E. Burst-aware fairness | Already satisfiable | **Breaks level-triggered** (counter reset on event) | New persistent state, new knob | **Reject** |

**Design A (status quo)** is the only mitigation that preserves all five invariants. The simulation confirms it handles every tested resume-burst scenario without deadlock, thrash, or capacity violation. The duration asymmetry (merge = seconds, node = hours) bounds the burst to minutes of merge-heavy execution, after which the pipeline returns to steady-state node work.

**Designs B, C, and E** all break the level-triggered invariant — the same invariant the existing spikes most aggressively defend (spike-merge-trigger-starvation.md F2-F3 explicitly rejected extending the fairness counter for the same reason). The resume fold is level-triggered like every other input (graph-pipeline.md:1037-1039: "Repeated pauses or resumes are idempotent — level-triggered like every other input"). Introducing a resume-specific behavior mode would carve resume out of the level-triggered model.

**Design D** inverts the documented capacity-reservation direction. The existing Honest-costs fallback (graph-pipeline.md:1848-1851) already covers the only realistic failure mode (merge-trigger latency exceeding bounds), with the correct direction: reserve for *merges*, not for claims. This fallback is config-only (one line in the policy block), preserves all invariants, and already has a documented trigger threshold.

## What this means for the plan

The plan's pause/resume design is fundamentally sound. The merges-first ordering (already verified), `merge.lock` serialization, the fired-trigger-reserves-slot rule, and the fairness counter together handle the resume burst without any resume-specific behavior. No code change is warranted.

One documentation change is needed:

1. **F5: Clarify that pause gates conflict-mode planning launches.** The plan's Pause/resume section says "No new planning runs launch while paused" (graph-pipeline.md:1031-1032), but the Merge-conflict resolution section (graph-pipeline.md:1766-1767) describes the conflict-mode planning trigger without noting the pause interaction. A reader could reasonably infer that conflict-mode planning is exempt from the pause gate. It is not. Add one sentence to the Pause/resume section: "Conflict-mode planning launches are also gated by pause; a conflict-blocked chain stays blocked through the pause window and only begins resolution at the resume pass."

Two optional clarifications would strengthen the resume-burst coverage:

2. **F7: Note that `merge.lock` structurally bounds live merge sandboxes to 1.** The Honest costs section describes the merge sandbox's capacity impact but doesn't note the structural bound. A note here would prevent the "pool full of merge sandboxes" framing from re-emerging in review.

3. **F4: Note the cap=1 resume edge case.** Under cap=1, the first post-resume pass may be a claim-noop if a merge is in flight at the resume moment. This is by design (the merge completes in seconds and the next pass claims), but it's worth one line so an implementer doesn't mistake it for a deadlock.

No fallback needs to be added. The existing Honest-costs fallback (reserve one slot for merge cycles when `maxConcurrentSandboxes ≥ 3`) is the correct response if production data shows merge-trigger latency exceeding bounds during a resume burst.
