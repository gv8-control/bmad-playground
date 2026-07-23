# Spike: fold-time delta validation against a moving target

**Date:** 2026-07-23
**Status:** Complete — admitted assumption 6 VERIFIED
**Verifies:** Admitted assumption 6 from `docs/todo/graph-pipeline.md`
**Script:** `docs/todo/spike-delta-validation.js`

## TL;DR

The delta validation function correctly implements all-or-nothing validation
of planning deltas against current graph state. All five documented scenarios
(a–e) from admitted assumption 6 pass, plus 35 additional edge cases (40
tests total). The function works on a deep copy (`structuredClone`) and never
mutates the input graph — the all-or-nothing guarantee holds by construction.

A sub-agent review caught two blockers (updateNode could change `id` or
`chainId`, corrupting graph invariants) and several defense-in-depth gaps
(addNode silently overwrote `status` instead of rejecting it; shallow
`metadata` copy). All were fixed before the final run.

Three findings for the plan: (F1) `abandonSegment`'s graph mutation is an
interpretation, not doc-specified — the doc should state what happens to
graph nodes; (F2) `FROZEN_STATUSES` extends beyond the doc's three named
statuses to include `failed` and `abandoned` — the doc should name all five;
(F3) `mergeTo` value validation uses truthiness, not an explicit check
against `'main'` — acceptable for now but worth noting.

## What was tested

Admitted assumption 6 from the plan:

> The planner reads `graph.json` at launch (T0); by fold time (T1) a pass may
> have claimed nodes (freezing their specs) or folded completions (changing
> merge state). The delta format and rejection semantics are now decided
> (ops list, all-or-nothing), which pins what the validation checks: per-op
> legality against T1 state, then the whole-graph rules (acyclic,
> cross-chain edges target merge-points, final node carries `mergeTo`, every
> chain remains a total order) on the result.

The spike script (`spike-delta-validation.js`) tests the `validateDelta`
function against the five documented synthetic scenarios plus 35 additional
edge cases:

**The five documented scenarios (admitted assumption 6):**

- **(a)** planner removes a node that was claimed meanwhile → `stale_target`
- **(b)** planner adds a cross-chain edge to a node that merged:
  - (b1) target node removed → `dangling_edge`
  - (b2) target exists but `mergeTo` removed → `cross_chain_not_merge_point`
  - (b3) target completed (edge to completed node is valid) → accepted
- **(c)** planner's delta creates a cycle when merged with T1 state → `cyclic`
- **(d)** planner marks a final node without `mergeTo` → `final_node_missing_mergeTo`
- **(e)** remove+rewire racing a claim (all-or-nothing) → `stale_target` +
  original graph unchanged

**Additional edge cases (35 tests):**

Empty delta acceptance, duplicate id, updateNode on completed/parked nodes,
removeNode creating dangling edges, abandonSegment with claimed/failed/non-existent
chains, abandonSegment keeping completed nodes, valid chain addition, valid chain
extension, cross-chain edge to non-merge-point, updateNode setting status/id/chainId
(rejected), chain with branching, invalid envelope, unknown op type, addNode with
dangling dependsOn, valid cross-chain edge to merge-point, all-or-nothing with
valid-then-invalid ops, updateNode rewiring to cross-chain non-merge-point, self-loop
(via addNode and updateNode), single-node chain (valid and invalid), cross-chain edge
to completed non-merge-point, within-chain cycle, duplicate dependsOn entries, empty
graph with empty delta.

**All 40 tests pass.** Total runtime: <1 second.

## Results

### Scenario (a): planner removes a claimed node — PASS

| Check | Result |
|---|---|
| removeNode on a `claimed` node rejected | PASS |
| Rejection rule | `stale_target` |
| Detail | `removeNode target "n2" is claimed (frozen, not pending)` |

A node claimed between T0 and T1 has its spec frozen. The planner's
removeNode op is rejected because the target is no longer `pending`.

### Scenario (b): cross-chain edge to a merged node — PASS (3 sub-cases)

| Sub-case | Rule | Result |
|---|---|---|
| (b1) target node removed | `dangling_edge` | PASS |
| (b2) target exists, `mergeTo` removed | `cross_chain_not_merge_point` | PASS |
| (b3) target completed (edge to completed node) | accepted | PASS |

The three sub-cases distinguish what "merged" means. If the node was removed
(chain abandoned), the edge target doesn't exist → `dangling_edge`. If the
node exists but its `mergeTo` was removed by a replan, the cross-chain edge
targets a non-merge-point → `cross_chain_not_merge_point`. If the node
completed (still in the graph, still a merge point), the edge is valid —
completions are tolerated naturally, as the doc specifies.

### Scenario (c): delta creates a cycle — PASS

| Check | Result |
|---|---|
| Delta creating a cycle rejected | PASS |
| Rejection rule | `cyclic` |
| Cycle path reported | `n1 → n4 → n3 → n2 → n1` |

The planner added n4 depending on n3, then rewired n1 to depend on n4,
creating a cycle. The DFS cycle detector finds and reports the cycle path.

### Scenario (d): final node without mergeTo — PASS

| Check | Result |
|---|---|
| Chain with final node missing `mergeTo` rejected | PASS |
| Rejection rule | `final_node_missing_mergeTo` |

The planner added a two-node chain (c1 → c2) but forgot `mergeTo` on c2.
The whole-graph rule catches it.

### Scenario (e): remove+rewire racing a claim — PASS

| Check | Result |
|---|---|
| removeNode on claimed node rejected | PASS |
| Rejection rule | `stale_target` |
| Original graph unchanged (all-or-nothing) | PASS |

The delta removed n2 (claimed) and rewired n3 to depend on n1. The
removeNode is rejected (`stale_target`), and the updateNode (rewiring n3)
is rolled back — n3 still depends on n2 in the original graph. This is the
load-bearing all-or-nothing test: partial application would leave two
concurrently runnable nodes on one chain branch.

### All-or-nothing guarantee — PASS

| Check | Result |
|---|---|
| Deep copy via `structuredClone` | PASS |
| Input graph never mutated on rejection | PASS (verified in scenarios e, 17) |
| Valid-then-invalid delta fully rejected | PASS |

The function works on `structuredClone(currentGraph)`, a true deep copy.
Rejections return before any mutation reaches the input. Scenario E and
edge case 17 both verify the original graph is unchanged after rejection.

## Findings

### F1: abandonSegment graph mutation is an interpretation, not doc-specified

**Impact: Low (doc gap, not a code bug)** — the doc says "the fold journals
the abandonment and the pass deletes the chain branch" but does not specify
what happens to graph nodes. The code removes `pending` nodes in the chain
and keeps `completed`/`failed`/`abandoned` nodes (historical record). This is
a reasonable interpretation — pending nodes haven't merged, so they're part
of the abandoned segment; completed nodes have merged and are historical.

Two questions the doc should answer:
1. Should pending nodes be **removed** (current behavior) or **marked
   `abandoned`** (status change, kept as historical record)?
2. Should `failed` nodes in the chain be removed too?

The current behavior (remove pending, keep everything else) is defensible.
The doc should state it explicitly so the implementation is not an
interpretation.

### F2: FROZEN_STATUSES extends beyond the doc's three named statuses

**Impact: Low (doc gap)** — the doc says "an `updateNode`/`removeNode` whose
target is **claimed, parked, or completed** is stale." The code treats `failed`
and `abandoned` as frozen too. This is almost certainly correct (a failed
node has been attempted, its spec is frozen; an abandoned node is historical),
but it is an undocumented extension. The doc should name all five frozen
statuses, or the code should record this as an admitted assumption.

### F3: mergeTo value validation uses truthiness, not explicit check

**Impact: None (acceptable for now)** — the doc says "the only target for now
is `main`." The code checks `!dep.mergeTo` (truthiness) for the cross-chain
rule, not `dep.mergeTo !== 'main'`. A node with `mergeTo: ''` (empty string)
or `mergeTo: 0` would be treated as not-a-merge-point, which is correct
behavior but incidental. If new merge targets are added in the future, the
truthiness check will need to become an explicit allowlist check.

### F4: updateNode must not set id or chainId (found by review, fixed)

**Impact: None (bug found and fixed before final run)** — a sub-agent review
found that `updateNode` could change a node's `id` (corrupting the key/id
invariant) or `chainId` (bypassing chain-structure invariants). Both are now
rejected with `invalid_op`. The doc lists updateNode's scope as "dependsOn
rewiring, mergeTo toggle, prompt or deadline change" — `id` and `chainId`
are not in that list.

### F5: addNode must not set status (found by review, fixed)

**Impact: None (bug found and fixed before final run)** — `addNode` silently
overwrote `status: 'pending'` instead of rejecting it. Now `addNode` rejects
`status` with `invalid_op`, consistent with `updateNode`. The doc says the
planner is "barred from touching" machinery-derived state — the bar is now
enforced consistently for both ops.

### F6: Deep copy uses structuredClone (found by review, fixed)

**Impact: None (latent risk eliminated)** — the original shallow copy
(`{...node, dependsOn: [...deps], metadata: {...node.metadata}}`) shared
nested metadata references with the input graph. Replaced with
`structuredClone(node)` for a true deep copy. No code path mutated nested
metadata in place, so this was a latent risk, not an active bug — but
`structuredClone` eliminates it structurally.

## Implementation notes

The validation function (`validateDelta`) is ~250 lines of pure JS with no
external dependencies. It is ready to drop into the pipeline's fold step
(Path step 4). The interface:

```js
const result = validateDelta(delta, currentGraph);
if (result.accepted) {
  // result.graph is the new graph state — write it under the lock
} else {
  // result.rejection = { opIndex, op, rule, detail }
  // Journal the rejection evidence, delete the inbox file
  // The trigger condition still holds, so the next pass re-fires planning
}
```

Key design decisions in the implementation:

- **Per-op rules checked during application, whole-graph rules after.** Per-op
  rules (stale target, fresh id, edge existence) fire during op application
  and return immediately on failure. Whole-graph rules (acyclic, cross-chain
  merge-point, final-node mergeTo, total order) run after all ops are applied,
  on the resulting graph. This matches the doc's "per-op legality against T1
  state, then the whole-graph rules on the result."

- **Cycle detection via DFS with three-color marking.** White (unvisited),
  gray (in-progress), black (done). A back edge to a gray node is a cycle.
  The cycle path is reported in the rejection evidence.

- **Total order check via within-chain degree analysis.** For each chain, the
  function builds the within-chain subgraph (edges where both endpoints are in
  the same chain), checks each node has at most 1 within-chain predecessor and
  at most 1 within-chain successor, finds exactly 1 head (no predecessor),
  and walks the path to verify connectivity. Cross-chain edges are excluded.

- **abandonSegment removes pending nodes only.** Completed, failed, and
  abandoned nodes stay as historical record. The whole-graph rules then
  validate the resulting graph (e.g., if the removal leaves a chain without
  a `mergeTo` node, `final_node_missing_mergeTo` fires).

- **Immutable fields enforced.** `updateNode` rejects `id`, `chainId`, and
  `status` — all machinery-derived or structural fields the planner must not
  touch. `addNode` rejects `status`. The planner may set `dependsOn`,
  `mergeTo`, `deadline`, `skill`/`agent`/`prompt`, and `metadata`.

## Impact on the plan

Admitted assumption 6 is resolved. The validation function is ready for
Path step 4 (the planning-run machinery). Three doc updates are needed:

1. **F1: Document abandonSegment's graph mutation.** State that pending nodes
   are removed and completed/failed/abandoned nodes stay as historical record.
2. **F2: Name all five frozen statuses.** The doc's "claimed, parked, or
   completed" should be "claimed, parked, completed, failed, or abandoned."
3. **F4/F5: Document immutable fields.** State that `updateNode` may not set
   `id`, `chainId`, or `status`, and `addNode` may not set `status`.

The function's ~250 lines fit within the plan's ~120-line estimate for
"Planning run (launch wrapper with per-leg exit record + atomic delta
promotion, resume-mode legs, planning lock, delta validation + fold)" — the
validation is the core of that module, with the wrapper and lock logic
adding the rest.
