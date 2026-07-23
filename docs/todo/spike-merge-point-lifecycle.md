# Spike: multi-pass merge-point lifecycle (I1)

**Date:** 2026-07-23
**Status:** Complete — assumption I1 VERIFIED with caveats (one spec clarification needed; one accepted limitation confirmed; two non-issues)
**Verifies:** Reviewer-flagged assumption I1 (unverified assumption from pre-implementation review)
**Script:** `docs/todo/spike-merge-point-lifecycle.js`

## TL;DR

The merge-point lifecycle is the most interaction-dense path in the design. A merge-point node completion triggers a chain of events across multiple passes and async processes. The reviewer flagged four interaction concerns. The spike is a pure-logic discrete-event simulation that models the full lifecycle end-to-end, plus four sub-agent analyses (no MCP access) providing parallel design reasoning.

The four concerns resolve as follows:

- **I1a (capacity accounting): NOT A REAL CONCERN under merges-first ordering.** The merges-first ordering (already verified by `spike-merge-trigger-starvation.md`) eliminates the "immediately consume" race. The simulation shows zero deferrals in all capacity scenarios, including cap=1 (no deadlock). One minor spec clarification needed: a fired merge trigger reserves its capacity slot for the remainder of the pass, even before the merge sandbox is materialized.

- **I1b (n8n restart during merge): REAL BUT ACCEPTED LIMITATION.** The simulation confirms a permanent stall when n8n restarts mid-merge: the orphaned wrapper holds `merge.lock` indefinitely, the pass reads it as held, and the merge never re-triggers. This is the same caveat already documented for planning runs (assumption 5). The plan correctly defers the parent-alive-check fix. The merge case has a smaller window (seconds vs. minutes) but a wider blast radius (DAG-wide downstream stall). An automated stall-detection mechanism (analogous to `last-pass.json` staleness) is recommended as a low-cost mitigation.

- **I1c (merge conflict mid-lifecycle): CORRECTLY DESIGNED, minor doc gaps.** The simulation traces the full conflict resolution path: conflict → report → planning run → resolution node → re-merge. The pass count (4 dispatcher passes + 2 async hops + 1 planning run) is acceptable — the bottleneck is the resolution node's hours-long skill run, not the seconds-long bookkeeping. Three documentation gaps: the `blocked` state is a chain-level marker (not a node status), the round-bound exhaustion recovery path is missing, and the "other chains are unaffected" claim overstates isolation for cross-chain dependents.

- **I1d (empty-diff short-circuit): CORRECTLY DESIGNED, noise-level cost.** The simulation confirms the short-circuit path works correctly. The sandbox slot cost is seconds (1 tick), and under burst (5 empty-diff merges serialized by `merge.lock`), the total is 11 ticks — minutes, not hours. The ancestry check cannot be moved before sandbox creation without violating the devcontainer isolation invariant. One optimization opportunity: if the diffstat is computed at node completion (before merge enqueue), the pipeline could filter known-empty diffs at enqueue time rather than paying a sandbox slot to rediscover them.

## What was tested

The reviewer flagged assumption I1 from the plan, identifying four interaction concerns in the merge-point lifecycle. The spike is a **pure-logic discrete-event simulation** — no infrastructure, no network, no sandboxes, no LLM calls. It extends the `spike-merge-trigger-starvation.js` model with the full merge-point lifecycle: sandbox destruction and creation as distinct capacity events, the "fired trigger reserves slot" temporal gap, n8n-restart-during-merge stall simulation, conflict-mid-lifecycle state machine (blocked → planning → resolution → re-merge), and empty-diff short-circuit path.

Four phases, each testing one concern:

**Phase 1 — Capacity accounting (I1a).** Three scenarios: basic lifecycle (cap=3, 1 merge-point completion), contention (cap=3, merge + independent ready nodes from 3 chains), cap=1 edge case (single slot). Tests whether merges-first ordering prevents the "immediately consume" race, whether capacity is ever exceeded, and whether cap=1 deadlocks.

**Phase 2 — n8n restart during merge (I1b).** Two scenarios: n8n restart at tick 2 (after merge materializes, before it completes) vs. no restart (control). Tests whether the orphaned merge wrapper causes a permanent stall, whether the stall is detectable, and whether the merge ever completes.

**Phase 3 — Merge conflict mid-lifecycle (I1c).** One scenario: a merge-point node whose merge conflicts on the first attempt. Traces the full resolution path: conflict → conflict report → chain blocked → conflict-mode planning run → resolution node appended → resolution node claimed → resolution completes → merge re-triggered → merge succeeds. Counts pass boundaries and verifies the state machine.

**Phase 4 — Empty-diff short-circuit (I1d).** Two scenarios: single empty-diff merge, and burst of 5 empty-diff merges serialized by `merge.lock`. Tests whether the short-circuit path works correctly, measures the sandbox slot cost, and verifies burst behavior.

Four sub-agents (no MCP access) provided parallel analysis that informed the findings:

- **Sub-agent 1 (capacity accounting):** Traced the exact capacity timeline across Pass A → merge cycle → Pass B. Confirmed merges-first ordering eliminates the race. Identified the "fired trigger reserves slot" temporal gap as a minor spec clarification need.
- **Sub-agent 2 (n8n restart recovery):** Traced the exact stall mechanism. Confirmed level-triggered recovery cannot save this case (the lock is permanently held by a live orphaned process). Identified the orphaned-sandbox detection vector as a promising automated detection mechanism. Assessed the merge case as slightly worse than the planning-run case (smaller window, wider blast radius, harder detection).
- **Sub-agent 3 (merge conflict mid-lifecycle):** Counted 4 dispatcher passes + 2 async hops + 1 planning run across the full resolution path. Identified the `blocked` state ambiguity (chain-level marker, not a node status), the missing round-bound exhaustion recovery path, and the overstatement of "other chains are unaffected" for cross-chain dependents.
- **Sub-agent 4 (empty-diff short-circuit):** Confirmed the short-circuit is correctly placed. Assessed the sandbox slot cost as noise. Evaluated and rejected moving the ancestry check to the devcontainer (violates isolation invariant). Identified the enqueue-time empty-diff filter as an optimization opportunity.

## Results

### Phase 1: capacity accounting (I1a)

| Scenario | Terminal | Stalled | Deferrals | Max merge wait | Capacity exceeded |
|---|---|---|---|---|---|
| 1a basic (cap=3, 1 merge) | YES | NO | 0 | 0 ticks | NO |
| 1b contention (cap=3, 3 chains) | YES | NO | 0 | 0 ticks | NO |
| 1c cap=1 (single slot) | YES | NO | 0 | 0 ticks | NO |

Under merges-first ordering, the merge trigger always wins the freed slot. Zero deferrals in all scenarios. The cap=1 edge case does not deadlock: the node sandbox is destroyed (0 live) → merge trigger fires (1 live) → merge completes (0 live) → successor claimed (1 live). The destroyed node's sandbox and the merge sandbox are distinct, sequential, and never overlap in time.

The "fired trigger reserves slot" temporal gap is handled correctly: a fired merge trigger reserves its slot for the remainder of the pass, so the node-claim phase in the same step 6 cannot consume the slot the merge needs. The simulation models this via `pendingMergeTriggers` accounting.

### Phase 2: n8n restart during merge (I1b)

| Scenario | Terminal | Stalled | Merge lock orphaned | Stall detected | Merges completed |
|---|---|---|---|---|---|
| 2a restart at tick 2 | NO | YES | YES | YES | 0 |
| 2b no restart (control) | YES | NO | NO | NO | 1 |

The n8n restart at tick 2 (after the merge sandbox materializes but before the merge cycle completes) causes a permanent stall. The orphaned wrapper holds `merge.lock` indefinitely (`mergeLockReleaseTick = Infinity`). Every subsequent pass finds the lock held and defers the merge trigger. The merge-point node's successors never become ready. The stall is detectable by the simulation's `isMergeStalled()` check.

The control case (no restart) completes normally in 3 ticks: node completes (tick 1) → merge materializes (tick 2) → merge completes (tick 3).

### Phase 3: merge conflict mid-lifecycle (I1c)

| Metric | Value |
|---|---|
| Terminal | YES |
| Conflicts triggered | 1 |
| Conflict planning runs | 1 |
| Resolution nodes appended | 1 |
| Total merge completions | 1 (the re-merge after resolution) |
| Total passes | 72 |
| Total ticks | 68 |

The full conflict resolution path completes successfully. The event trace shows 10 events across 68 ticks:

1. tick 1: node completes (A-n2, merge-point)
2. tick 1: merge trigger fires
3. tick 2: merge sandbox materializes
4. tick 3: merge conflicts (round 1)
5. tick 3: conflict-mode planning run starts
6. tick 6: planning run completes, resolution node appended
7. tick 6: resolution node claimed
8. tick 66: resolution node completes (60-tick skill run)
9. tick 66: merge re-triggered (resolution node is a merge point)
10. tick 67: merge materializes
11. tick 68: merge completes successfully

The 4 dispatcher passes (conflict-fold, delta-fold, resolution-outcome, merge-landed) plus 2 async hops (merge-queue, planning-host) plus 1 planning run add ~60 ticks of bookkeeping (mostly the planning run's 3 ticks + the resolution node's 60-tick skill run). The bookkeeping overhead is noise against the hours-long resolution node.

### Phase 4: empty-diff short-circuit (I1d)

| Scenario | Terminal | Short-circuits | Sandbox creations | Max merge wait |
|---|---|---|---|---|
| 4a single empty-diff | YES | 1 | 1 | 0 ticks |
| 4b burst of 5 empty-diffs | YES | 5 | 5 | 0 ticks |

The empty-diff short-circuit works correctly. A single empty-diff merge consumes 1 sandbox slot for 1 tick (seconds). Under burst (5 empty-diff merges serialized by `merge.lock`), all 5 complete in 11 ticks (minutes), with zero capacity deferrals. The serialization is correct — `merge.lock` prevents racing merges, and each short-circuit cycle takes 1 tick.

## Findings

### F1: Merges-first ordering eliminates the capacity accounting race (I1a — NOT A REAL CONCERN)

**Impact: None (confirms the plan's existing design)** — the merges-first ordering (already verified by `spike-merge-trigger-starvation.md`) structurally prevents the "immediately consume" race. In step 6 of the reconcile pass, merge triggers are evaluated before node claims. The freed slot (from the destroyed node sandbox in step 4) is visible to the merge trigger evaluation. The merge trigger fires and reserves the slot before any node claim can consume it.

The simulation confirms: zero deferrals in all capacity scenarios, including the cap=1 edge case (no deadlock) and the contention scenario (3 chains, independent ready nodes competing).

**Recommendation:** no change needed. The plan's existing merges-first ordering specification (graph-pipeline.md:532-534, :1680-1681, :1782-1783) is correct.

### F2: A fired merge trigger reserves its capacity slot (I1a — SPEC CLARIFICATION)

**Impact: Low (spec clarification, not a design change)** — the plan does not explicitly state whether a *fired* merge trigger (invocation sent, merge sandbox not yet created by the async n8n workflow) reserves a capacity slot for the node-claim phase in the same step 6. The current text says merge triggers are evaluated "before" node claims, which implies the trigger gets priority, but doesn't say the trigger *holds* the slot through the node-claim phase.

The simulation models this via `pendingMergeTriggers` accounting: a fired trigger reserves a slot even before the merge sandbox is materialized. Without this accounting, an implementer could fire the trigger, then claim a node in the same pass using the slot the merge "should" get, momentarily exceeding the cap when the merge workflow materializes its sandbox.

**Recommendation:** add one clarifying sentence to the plan (in step 6 or Honest costs): "A fired merge trigger reserves its capacity slot for the remainder of the pass; the node-claim phase treats a just-fired trigger as consuming one slot, so the merge sandbox's brief async-creation window cannot be consumed by a node claim in the same pass."

### F3: n8n restart during merge causes a permanent stall (I1b — ACCEPTED LIMITATION)

**Impact: High when it occurs, low frequency** — the simulation confirms a permanent stall when n8n restarts mid-merge. The orphaned merge wrapper (reparented to init) keeps holding `merge.lock`. Every subsequent pass reads the lock as held and defers the merge trigger. The merge-point node's successors never become ready. The pipeline appears alive (passes continue, heartbeats written) but makes no progress on the downstream graph.

This is the same caveat already documented for planning runs (graph-pipeline.md:726-736, :1682-1692). The plan correctly defers the parent-alive-check fix (`kill -0 $PPID` periodically, exit if parent is gone) to a follow-up. The merge case has a smaller window (seconds vs. minutes for planning runs) but a wider blast radius: a stalled merge-point node blocks all its successors, which may include cross-chain dependents and finalization chains.

The stall is **not recoverable by the level-triggered design**. Level-triggering presupposes the failure leaves the system in a re-triggerable state. The orphan-stall violates this: the lock is permanently held by a live process the supervisor cannot observe (it was reparented away from n8n's process tree).

**Recommendation:** the plan's current treatment (defer fix, document manual recovery) is adequate as a v1 strategy. Two additions would strengthen it:

1. **Automated stall detection:** add a `heldSince` timestamp to the `merge.lock` record. A pass that observes `merge.lock` held for longer than `T_merge_stall` (default 30s, tunable) emits a stall alert. This converts a silent stall into a loud alert without requiring the parent-alive-check refactor. The pipeline already has this pattern: `last-pass.json` staleness check (graph-pipeline.md:657-664).

2. **Connect reconcile's orphaned-sandbox detection to lock recovery:** when reconcile (step 2) detects an orphaned sandbox labeled `scope: pipeline` whose associated n8n workflow is gone, it should cross-reference the sandbox ID against `merge.lock` records. If the sandbox is dead but the lock file still references it, the lock is stale and the recorded PID should be probed (`kill -0`).

### F4: The conflict resolution path is correctly designed (I1c — VERIFIED)

**Impact: None (confirms the plan's design)** — the simulation traces the full conflict resolution path with 10 events across 68 ticks. The state machine is well-defined: `completed` → (conflict) → `completed` + chain blocked → (planning) → resolution node `pending` → `running` → `completed` → (re-merge) → `merged`. The 4 dispatcher passes plus 2 async hops plus 1 planning run add ~60 ticks of bookkeeping, which is noise against the resolution node's hours-long skill run.

**Recommendation:** no change needed to the conflict resolution design.

### F5: The `blocked` state is a chain-level marker, not a node status (I1c — DOC GAP)

**Impact: Medium (documentation gap)** — the plan says "graph.json marks the chain blocked" (graph-pipeline.md:1707-1708), but node statuses are a known finite set (`pending`, `claimed`, `parked`, `completed`, `failed`, `abandoned` — graph-pipeline.md:126-130). There is no `blocked` node status. The merge-point node stays `completed` during the blocked window — this is implied by the merge-trigger rule (which keys on "completed merge-point node," graph-pipeline.md:542-548) but never stated explicitly.

A reader could reasonably infer that "chain blocked" means "the merge-point node moved to a `blocked` status," which would break the re-trigger rule after resolution.

**Recommendation:** add one line to the Merge-conflict resolution section: "A conflict-blocked chain's merge-point node stays `completed`; `blocked` is a chain-scoped flag on `graph.json`, never a node status. The merge-trigger rule's 'pending conflict report' is scoped per merge-point node id, not per chain."

### F6: Round-bound exhaustion recovery path is missing (I1c — DOC GAP)

**Impact: Medium (documentation gap)** — the plan says "exhaustion notifies the human (error-notification workflow) and leaves the chain blocked for a human replan" (graph-pipeline.md:1738-1740). But "human replan" is not specified as a machinery action. There is no inbox-input type for "force re-trigger merge" or "clear blocked flag." The plan's own principle — "the human enters through the park, never around it" (graph-pipeline.md:1741-1746) — is violated: the only recovery is manual filesystem intervention.

**Recommendation:** specify that exhaustion parks the original merge-point node's conflict with QUESTION, carrying the round-bound report. The standard question-form path returns the answer to the next conflict-mode planning run. This reuses the existing park/resume machinery — no new state — and honors the "human enters through the park" principle.

### F7: "Other chains are unaffected" overstates isolation for cross-chain dependents (I1c — DOC GAP)

**Impact: Low (documentation clarification)** — the plan says "other chains are unaffected" (graph-pipeline.md:1709) when a chain is conflict-blocked. This is true for chains with no `dependsOn` edge into the blocked merge-point. But the plan also supports cross-chain edges that target merge-point nodes (graph-pipeline.md:314-317): if Chain B's first node `dependsOn` Chain A's merge-point M, and M conflicts, Chain B's successor never becomes ready until M is resolved.

**Recommendation:** change "other chains are unaffected" to "chains with no `dependsOn` edge into this merge-point are unaffected; dependent chains' successors stay unready until resolution lands."

### F8: Empty-diff short-circuit is correctly designed (I1d — VERIFIED)

**Impact: None (confirms the plan's design)** — the simulation confirms the short-circuit path works correctly. A single empty-diff merge consumes 1 sandbox slot for 1 tick (seconds). Under burst (5 empty-diff merges serialized by `merge.lock`), all 5 complete in 11 ticks (minutes), with zero capacity deferrals.

The ancestry check cannot be moved before sandbox creation without violating the devcontainer isolation invariant ("pipeline git operations never touch the devcontainer checkout" — graph-pipeline.md:1638-1641). A read-only `git fetch` writes to `.git/refs` and `.git/objects`, which is a write to the devcontainer's git database. The savings (a sandbox slot for seconds) don't justify the coupling risk.

**Recommendation:** no change needed to the short-circuit design.

### F9: Enqueue-time empty-diff filter is an optimization opportunity (I1d — OPTIMIZATION)

**Impact: Low (optimization, not a correctness issue)** — the diffstat is computed at node completion (graph-pipeline.md:1184-1192, "Collection records the diff"). If the diffstat shows zero changes, the pipeline could skip enqueuing the merge cycle entirely — delete the branch via API and mark the node as merged-no-op. This would eliminate the sandbox slot cost for the empty-diff case.

The merge-cycle ancestry check remains as a fallback for the evaporated-conflict case (diffstat was non-empty at completion but the trunk moved to include the chain's changes while resolution was planned).

**Recommendation:** document as a future optimization, not a v1 requirement. The current design is correct — it pays a sandbox slot for seconds to rediscover what the diffstat already said. If empty diffs become structurally common (analysis/review nodes that legitimately produce no file changes), the enqueue-time filter becomes necessary.

## Sub-agent analyses

Four sub-agents (no MCP access) provided parallel analysis that informed the findings:

**Sub-agent 1 (capacity accounting):** Traced the exact capacity timeline across Pass A → merge cycle → Pass B. Confirmed merges-first ordering eliminates the race — the merge trigger evaluation consumes the freed slot before any node claim runs. Identified the "fired trigger reserves slot" temporal gap (F2) as a minor spec clarification. Verified the cap=1 edge case does not deadlock (sequential execution, never exceeds cap). Confirmed the destroyed node's sandbox and the merge sandbox are distinct, sequential, and never overlap in time.

**Sub-agent 2 (n8n restart recovery):** Traced the exact stall mechanism: n8n restart → wrapper orphaned → holds `merge.lock` → pass reads lock as held → defers → permanent stall. Confirmed level-triggered recovery cannot save this case (the lock is permanently held by a live orphaned process). Identified the orphaned-sandbox detection vector (F3 recommendation 2) as a promising automated detection mechanism — the reconcile step already lists sandboxes by label, and an orphaned merge sandbox cross-referenced against `merge.lock` would reveal the stall. Assessed the merge case as slightly worse than the planning-run case: smaller window (seconds vs. minutes) but wider blast radius (DAG-wide downstream stall) and harder detection (no missing artifact to staleness-check).

**Sub-agent 3 (merge conflict mid-lifecycle):** Counted 4 dispatcher passes + 2 async hops + 1 planning run across the full resolution path. Confirmed the pass count is acceptable — the bottleneck is the resolution node's hours-long skill run, not the seconds-long bookkeeping. Identified three documentation gaps: the `blocked` state is a chain-level marker not a node status (F5), the round-bound exhaustion recovery path is missing (F6), and "other chains are unaffected" overstates isolation for cross-chain dependents (F7). Noted that conflict-mode planning runs are serialized behind expansion-mode runs by `planning.lock`, adding minutes to the resolution path (acceptable noise).

**Sub-agent 4 (empty-diff short-circuit):** Confirmed the short-circuit is correctly placed (after fetch, before rebase). Assessed the sandbox slot cost as noise (seconds, not minutes). Evaluated and rejected moving the ancestry check to the devcontainer (violates the isolation invariant — `git fetch` writes to `.git/refs` and `.git/objects`). Identified the enqueue-time empty-diff filter (F9) as an optimization opportunity: if the diffstat is computed at node completion, the pipeline could filter known-empty diffs at enqueue time rather than paying a sandbox slot to rediscover them. Flagged the push-failed-COMPLETE-with-no-branch edge case as an unhandled path (the ancestry check assumes the branch exists).

## What this means for the plan

The plan's merge-point lifecycle design is fundamentally sound. The merges-first ordering (already verified) eliminates the capacity race. The conflict resolution path is correctly designed. The empty-diff short-circuit is correct. The n8n-restart-during-merge stall is a real but accepted limitation, correctly deferred.

Six documentation changes are needed:

1. **F2: Clarify that a fired merge trigger reserves its capacity slot.** The plan should state that a fired merge trigger reserves its slot for the remainder of the pass, so the node-claim phase in the same step 6 cannot consume it. (One sentence in step 6 or Honest costs.)

2. **F3: Add automated stall detection for orphaned merge locks.** A `heldSince` timestamp on `merge.lock` and a `T_merge_stall` threshold (default 30s) would convert a silent stall into a loud alert. The reconcile step's orphaned-sandbox detection should cross-reference `merge.lock` records. (Low-cost mitigation, does not require the parent-alive-check refactor.)

3. **F5: Define `blocked` as a chain-level marker, not a node status.** The plan should state explicitly that a conflict-blocked chain's merge-point node stays `completed`; `blocked` is a chain-scoped flag on `graph.json`. (One sentence in Merge-conflict resolution.)

4. **F6: Specify the round-bound exhaustion recovery path.** The plan should state that exhaustion parks the conflict with QUESTION, carrying the round-bound report. The standard question-form path returns the answer to the next conflict-mode planning run. (Reuses existing machinery, honors the "human enters through the park" principle.)

5. **F7: Correct the "other chains are unaffected" claim.** Change to "chains with no `dependsOn` edge into this merge-point are unaffected; dependent chains' successors stay unready until resolution lands." (One sentence in Merge-conflict resolution.)

6. **F9: Document the enqueue-time empty-diff filter as a future optimization.** If the diffstat is available at merge enqueue time, the pipeline could skip the merge cycle for known-empty diffs. (Document as a future optimization, not a v1 requirement.)
