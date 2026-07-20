# Design Review: BMAD Session INCOMPLETE path

The tactical bug fixes (see commit `89ab385`) unblock the test, but they do not address the design-level concerns below. These are out of scope for the test task and should be handled as separate follow-up work. Solutions are intentionally not prescribed here — only the concerns and why they matter.

## Bug 2 fix choice: explicit assignment vs `includeOtherFields`

The fix adds an explicit `error` assignment to the `Output` node rather than switching to `includeOtherFields: true`. This keeps the output schema fixed at 8 fields, but means any future upstream field that should reach the output must be added manually. Review whether that trade-off is correct, or whether `includeOtherFields: true` paired with a downstream schema validator would be more maintainable as the workflow evolves.
