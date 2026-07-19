# Design Review: BMAD Session INCOMPLETE path

The tactical bug fixes (see `docs/todo/classifier-fix.md`) unblock the test, but they do not address the design-level concerns below. These are out of scope for the test task and should be handled as separate follow-up work. Solutions are intentionally not prescribed here — only the concerns and why they matter.

## Workflow static data is not per-execution

`$getWorkflowStaticData('global')` returns workflow-level storage shared across **all** executions. The code emulates per-execution isolation by keying on `$execution.id` inside that shared object, but this is logical namespacing, not physical isolation.

Two concrete risks:

- **Leak on crash.** `Compute counts` cleans up with `delete staticData[key]`, but only if it runs. If the workflow crashes, is cancelled, or hits an n8n error before `Compute counts` executes, the entry persists indefinitely — workflow static data is never auto-deleted. Over hundreds of crashed runs the object grows unbounded.
- **Concurrency hazard (dormant).** n8n snapshots static data at execution start and writes it back at execution end. Two concurrent executions both read the same snapshot, both write back, and last-write-wins can drop the other's entry. The `$execution.id` keying does not protect against this — the keys differ, but the snapshot-and-replace semantics mean one write clobbers the other. Today the pipeline runs steps sequentially so this is dormant, but the moment concurrency is added it breaks silently.

The pipeline's "failures travel as data" principle (see `/workspaces/bmad-playground/docs/self-improving-pipeline.md`) points toward carrying state in the item flow rather than side-channel storage. Worth reviewing whether `outcomeHistory` should be an array carried in `$json` and appended by the `Accrete outcome` nodes, eliminating workflow static data entirely.

## `incompleteCount` is misnamed (pre-existing)

The field `incompleteCount` is actually `incompleteRunIndex` (0-indexed). With `incompleteContinueCap=2`, the test expects `incompleteCount === 2` while `outcomeHistory` has 3 entries `["INCOMPLETE","INCOMPLETE","INCOMPLETE"]`. The `Check incomplete cap` IF node confirms the semantics: it checks `incompleteRunIndex + 1 > cap`. "Count" is a misnomer — it is the last index, not the count. Not in scope to fix now, but flagged for a future rename to avoid misleading future readers.

## Bug 2 fix choice: explicit assignment vs `includeOtherFields`

The fix adds an explicit `error` assignment to the `Output` node rather than switching to `includeOtherFields: true`. This keeps the output schema fixed at 8 fields, but means any future upstream field that should reach the output must be added manually. Review whether that trade-off is correct, or whether `includeOtherFields: true` paired with a downstream schema validator would be more maintainable as the workflow evolves.
