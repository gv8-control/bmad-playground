# Spike: in-sandbox command template push-on-failure behavior (A4)

**Date:** 2026-07-23
**Status:** Complete — assumption A4 VERIFIED (spec gap confirmed; recommended fix: unconditional push)
**Verifies:** Reviewer-flagged assumption A4 (unverified assumption from pre-implementation review)
**Sub-agents:** Two (no MCP access) — template design analysis, recovery/classification path analysis

## TL;DR

A4 is a **real specification gap, not just a missing clarification**. The plan never states whether the in-sandbox command template's push step runs when opencode exits non-zero. The template's described step order (install → opencode run → exit capture → branch push) plus default bash `set -e` semantics means the push step does not run when opencode fails — so hours of agent file work sit on the sandbox disk only, the pass classifies `failed`, destroys the sandbox, and the work is lost. The push-failure recovery path (the `push-failed` marker) covers push-step *failure*, not push-step *absence*.

Two compounding defects surfaced during the spike:

- **The "Branch push failure" section does not exist.** It is referenced four times (graph-pipeline.md:663, :1392, :1450, :1809) as a forward reference but was never written. The reviewer's recall of "exit code 42" as the push-failure signal is **not in the plan** — a grep for `42` returns only unrelated contexts. The only described signal is the `push-failed` marker file, which is conditional on the push step having run.
- **The durability floor's "never silently lost" promise is unbacked by any described mechanism for the agent-failure case.** The transcript collection path preserves conversation logs (messages + tool calls), not the file tree. The diffstat computation requires a "pushed head" that does not exist in the A4 scenario. The reconcile pass's "collect work whose branch is pushed" path requires a pushed branch.

Five findings for the plan:

- **F1:** The template must push unconditionally — the plan's merge-trigger rules already prevent broken work from merging (a `failed` node never triggers the merge queue; only `completed` merge-point nodes do). The durability goal is only achievable under unconditional push.
- **F2:** A `failed` outcome's branch does NOT trigger the merge queue. The merge-trigger rule is keyed to "completed merge-point node" — `failed` ≠ `completed`. Broken partial work landing on the chain branch is quarantined, not merged.
- **F3:** Transcript collection recovers evidence (reasoning, tool calls), not work product (file diffs). The retry starts from the original base commit with no memory of the failed attempt's file changes.
- **F4:** The "Branch push failure" section is a dangling forward reference — it does not exist. Four citations point at nothing. The `push-failed` marker covers push-step failure, not push-step absence.
- **F5:** Orphaned branches on origin need cleanup. Under unconditional push, a `failed` node's branch sits on origin (the merge cycle only deletes merged branches). A retry overwrites the same branch name, but a node that exhausts `maxAttemptsPerNode` leaves a permanent orphan.

The recommended fix is a one-line specification: the push step runs unconditionally regardless of opencode's exit code. No new markers, no new code paths, no new state — the existing merge-trigger gate already quarantines failed work.

## What was tested

The reviewer flagged assumption A4 from the plan:

> The push-failure recovery path triggers on exit code 42. But what if opencode exits with code 1 (agent failure) before the push step runs? The template's push step is the last step — if opencode crashes, does the template still execute the push? The plan doesn't say. If it doesn't, the agent's partial work is on the sandbox disk only, the exit code is 1, the pass classifies it as failed, destroys the sandbox, and the work is lost. The push-failure marker is never written because the push step never ran.

The spike is a **pure design analysis** — no infrastructure, no network, no sandboxes, no LLM calls. Two sub-agents (no MCP access) provided parallel analysis:

- **Sub-agent 1 (template design analysis):** Whether the template should push unconditionally or conditionally, the implications of each option, whether broken work reaches the merge queue, and a recommendation.
- **Sub-agent 2 (recovery/classification path analysis):** The exact sequence of events when opencode exits non-zero, whether transcript collection recovers file changes, whether a `failed` node triggers the merge queue, whether the retry preserves work, and the actual risk magnitude.

The analysis covers five areas:

**Area 1 — Template structure.** What the plan says (and doesn't say) about the in-sandbox command template's script structure, and whether the push step runs when opencode exits non-zero.

**Area 2 — Merge-trigger rules.** Whether a `failed` outcome's branch reaches the merge queue, traced through the plan's classification and merge-trigger logic.

**Area 3 — Recovery paths.** Whether transcript collection, the reconcile pass, the diffstat computation, or the collecting-pass recovery push cover the A4 case (agent failed before push).

**Area 4 — The "Branch push failure" section.** Whether the referenced section exists, what it says, and whether it covers push-step absence vs. push-step failure.

**Area 5 — Risk magnitude.** How common the A4 scenario is, how much work is lost, and whether the transcript is sufficient to reconstruct it.

## Results

### Area 1: template structure — SPEC GAP

The plan describes the template's steps in order at graph-pipeline.md:1141:

> `In-sandbox command template (install check, opencode run with --format json and </dev/null, exit capture, branch push with bounded retry + push-failed marker)`

And at graph-pipeline.md:1388-1392:

> "The in-sandbox command ends with a branch push (`git push origin HEAD:pipeline/<runId>/<chainId>` — the chain branch) so the result is durable in git regardless of what is watching. The push step retries with bounded backoff and writes a `push-failed` marker on permanent failure; the collecting pass checks the marker before destroying the sandbox and attempts one recovery push or parks the node (see Branch push failure)."

Note that **"exit capture" is listed before "branch push"** — the template's stated order implies the exit code is captured first, then the push runs. But the plan never states the predicate the push step uses:

- Does "exit capture" mean "capture the exit code and then push unconditionally"?
- Or "capture the exit code and push only if opencode exited 0"?
- Or "capture the exit code, push unconditionally, and record the capture separately for the classifier"?

The plan does not show the actual script body, does not state whether `set -e` is on, does not mention trap handlers, and does not state whether the push is gated on the opencode exit code.

**Under default bash `set -e` semantics** (the safe default for a script wrapping a long-running agent), a non-zero exit at the `opencode run` step halts the script before the push step runs. The "exit capture" step would never record anything useful because the script has already exited. The push step never runs. The `push-failed` marker is never written — it is conditional on the push step having run and failed.

**The asymmetry with the planning-run wrapper is a design smell.** The planning-run wrapper (graph-pipeline.md:757-759) does exactly the right thing: "record exit code → promote → release lock" — an unconditional post-exit step (the wrapper promotes the delta unconditionally after the agent exits). The in-sandbox template is not described as having any wrapper at all — its described structure is the bare step sequence.

### Area 2: merge-trigger rules — `failed` does NOT trigger the merge queue

Tracing the path when opencode exits non-zero:

1. **Classification** (graph-pipeline.md:577-578): "exit code ≠ 0 with a completed last assistant message → `failed`."
2. **Data flow** (graph-pipeline.md:1110-1112): "`failed` consumes an attempt and, if attempts remain, the node is re-claimable."
3. **Merge-trigger rule** (graph-pipeline.md:542-548, restated at :1618-1623): "a **completed** merge-point node whose branch has neither merged nor a pending conflict report, with `merge.lock` acquirable and capacity available... (re)triggers the merge-queue workflow."

The merge trigger fires on a **completed** merge-point node. The status `failed` is distinct from `completed` (graph-pipeline.md Glossary, :126-130; delta validation at :785 treats `failed` as a terminal status separate from `completed`).

**Therefore: a `failed` outcome's branch does NOT trigger the merge queue.** This is confirmed by the data-flow section (graph-pipeline.md:1107-1112):

> "COMPLETE on a merge-point node (`mergeTo` — chain-final nodes always are) triggers the merge queue... `failed` consumes an attempt and, if attempts remain, the node is re-claimable."

Only COMPLETE triggers the merge queue. `failed` consumes an attempt and optionally re-claims. There is no path from `failed` to the merge queue in the plan.

**This is the decisive finding for the recommendation:** broken partial work landing on the chain branch is quarantined — the merge gate excludes `failed`. The A4 reviewer's concern about "broken partial work merging to trunk" is not realized under the plan's current merge-trigger rules.

### Area 3: recovery paths — none cover the A4 case

| Recovery path | Covers A4? | Why not |
|---|---|---|
| Reconcile pass "collect work whose branch is pushed but whose outcome was never journaled" (graph-pipeline.md:510) | No | Requires a pushed branch. In A4, no branch was pushed. |
| Transcript collection (graph-pipeline.md:664-686) | Partially | Pulls messages + tool calls, not the file tree. Evidence for human investigation, not a recovery artifact. |
| Diffstat computation (graph-pipeline.md:1171-1179) | No | Requires a "pushed head" to diff against. In A4, no push happened. |
| Collecting-pass recovery push (graph-pipeline.md:1391) | No | Gated on finding the `push-failed` marker, which is conditional on the push step having run. In A4, the push step never ran, so no marker exists. |
| Retry (graph-pipeline.md:1111-1112) | No | Fresh sandbox, fresh session, starts from the original base commit. The failed attempt's file changes are destroyed with the sandbox disk. |

**Transcript collection recovers evidence, not work product.** The transcript is messages and tool calls (graph-pipeline.md:136-137, :681-686). Tool calls include `edit`/`write` operations with their parameters, which in principle encode what edits the agent attempted — but reconstructing the final file tree requires replaying every tool call against the base commit, a non-trivial engineering effort the plan does not describe. Tool calls do not capture file changes made via `bash` (sed, awk, git apply, installers). The plan's own framing confirms this: "a failed attempt's transcript is exactly the evidence a retry investigation needs" (graph-pipeline.md:665) — investigation evidence, not recoverable work.

**The work is actually lost in the A4 scenario as the plan is currently written.** No described recovery path covers "push step never ran because the agent died first."

### Area 4: the "Branch push failure" section — DOES NOT EXIST

The phrase "Branch push failure" is referenced four times as if pointing to a section:

- graph-pipeline.md:663 (Durability floor): "a permanent failure parks the node with the work preserved (see Branch push failure)."
- graph-pipeline.md:1392 (In-sandbox command): "or parks the node (see Branch push failure)."
- graph-pipeline.md:1450 (Sandbox lifecycle): "never silently lost (see Branch push failure)."
- graph-pipeline.md:1809 (Path step 3): "terminal branch push with bounded retry + `push-failed` marker — see Branch push failure"

**There is no section heading "Branch push failure" anywhere in the 2130-line plan.** It is a dangling forward reference. The reader who follows any of these four pointers lands nowhere.

What the plan *does* say about push failure (scattered across the four references):

- **Marker file:** `push-failed` marker (graph-pipeline.md:1390).
- **Recovery action:** "the collecting pass checks the marker before destroying the sandbox and attempts one recovery push or parks the node" (graph-pipeline.md:1391-1392).
- **Preservation intent:** "never silently lost" (graph-pipeline.md:1450), "with the work preserved" (graph-pipeline.md:663).

What the plan does NOT say:

- **The exit code.** The reviewer's flag says "exit code 42" — the plan does not mention 42 anywhere. A grep for `42` in the file returns only unrelated contexts (the BANANA_42 secret in spike-stop-resume, line numbers in citations like `525-542`). The only described signal mechanism is the `push-failed` marker file.
- **The case where the push step never ran at all.** Every reference to the push-failure path assumes the push step ran and failed. The path is triggered by the push step's failure, not by the push step's absence.
- **Coverage of the agent-failure case.** The "never silently lost" claim is scoped to push failures, but the section that would clarify whether this also covers agent-failure-before-push is the section that doesn't exist.

### Area 5: risk magnitude — A4 is the default failure path, not an edge case

The plan defines `failed` as the standard failure outcome (graph-pipeline.md:130): "the agent failed (non-zero exit with a completed last assistant message, or a timeout)." This is the expected failure classification, not a rare edge case. Several documented failure modes land here:

- **Timeouts.** The default policy (graph-pipeline.md:640-641): "a timeout is a failure, counted against `maxAttemptsPerNode`." This is the default, not an edge case.
- **Provider errors that are not stream-truncation.** The plan's INCOMPLETE-vs-`failed` distinction (graph-pipeline.md:628-633): only a mid-stream error that left the session alive recovers via INCOMPLETE. A provider error that produces a completed final assistant message followed by a non-zero exit is classified `failed`.
- **Agent crashes, tool-call infinite loops, and any non-stream-truncated provider failure.** All route to `failed`.

**Per-attempt loss:** hours of agent work — file changes produced during the run. Skill runs are "measured in hours" (graph-pipeline.md:498, :220-221). A failed mid-run agent can produce hours of file edits that vanish with the sandbox.

**Per-retry chain:** `maxAttemptsPerNode` retries, each starting from scratch against the original base commit with no memory of prior attempts' file output. Cumulative wasted work could be `maxAttempts × hours`.

## Findings

### F1: The template must push unconditionally (SPEC GAP)

**Impact: High (data loss without this specification)** — the plan's durability floor ("the result is durable in git regardless of what is watching" — graph-pipeline.md:660-661, :1388-1390) is only achievable under unconditional push. Under conditional push (the default `set -e` reading), every `failed` outcome loses its file changes — and `failed` is the default failure path, not an edge case.

The push step must run regardless of opencode's exit code. The template records opencode's exit code separately (for the classifier) and pushes in all cases. This preserves the durability floor for failed outcomes: a `failed` node's partial work is on the chain branch, not lost with the sandbox.

**Recommendation:** the plan should state explicitly that the push step runs unconditionally. Suggested text: "The push step runs unconditionally — it pushes the branch regardless of opencode's exit code. The template records opencode's exit code separately (for the classifier) and pushes in all cases. This preserves the durability floor for failed outcomes: a `failed` node's partial work is on the chain branch, not lost with the sandbox."

### F2: A `failed` outcome's branch does NOT trigger the merge queue (VERIFIED)

**Impact: None (confirms the plan's safety)** — the merge-trigger rule (graph-pipeline.md:542-548, :1618-1623) is keyed to "completed merge-point node." The status `failed` is distinct from `completed` (graph-pipeline.md:126-130, :785). Only COMPLETE triggers the merge queue (graph-pipeline.md:1107-1112). A `failed` node's branch contains partial/broken work that is never merged.

This is the decisive finding that makes unconditional push safe: durability is preserved (work is on the branch), and broken work is quarantined (the merge gate excludes `failed`). The A4 reviewer's concern about "broken partial work merging to trunk" is not realized under the plan's current merge-trigger rules.

**Recommendation:** the plan should note explicitly that a `failed` outcome does not trigger the merge queue — only `completed` merge-point nodes do. This is currently implied but not stated as a guarantee.

### F3: Transcript collection recovers evidence, not work product (CLARIFICATION)

**Impact: Low (already correct, but the distinction matters for A4)** — the transcript (graph-pipeline.md:664-686, :136-137) is messages and tool calls, not the file tree. The plan's own framing confirms this: "a failed attempt's transcript is exactly the evidence a retry investigation needs" (graph-pipeline.md:665). The diffstat computation (graph-pipeline.md:1171-1179) requires a "pushed head" that does not exist when the push never ran.

Under unconditional push (F1), the partial file changes are on the branch (durable), giving a retry the option to inspect them. Under conditional push, they are gone. Unconditional push strictly dominates on recoverability.

**Recommendation:** no change needed — the plan's transcript description is correct. The distinction matters for A4 because it confirms that transcript collection is not a recovery path for lost work, which is why unconditional push (F1) is necessary.

### F4: The "Branch push failure" section does not exist (DOC DEFECT)

**Impact: Medium (dangling forward reference)** — four citations (graph-pipeline.md:663, :1392, :1450, :1809) point at a "Branch push failure" section that was never written. The reviewer's "exit code 42" signal is not in the plan — the only described signal is the `push-failed` marker file, which is conditional on the push step having run. The A4 case (push step never ran) is not covered by the described recovery path.

**Recommendation:** write the "Branch push failure" section. It must cover: the bounded-retry backoff parameters, the `push-failed` marker contents, the collecting-pass recovery-push behavior, and — critically — the unconditional-push guarantee (F1) that prevents the A4 case from arising. The section should state that the push step runs unconditionally (via a trap, wrapper, or `;`-separated command), so the "push step never ran" case does not occur.

### F5: Orphaned branches need cleanup (DOC GAP)

**Impact: Low (hygiene, not correctness)** — under unconditional push, a `failed` node's branch sits on origin. The merge cycle only deletes merged branches (graph-pipeline.md:1609), so a `failed` node's branch is never deleted by the merge cycle. A retry overwrites the same branch name (`pipeline/<runId>/<chainId>`), so a single retry cleans up. But a node that exhausts `maxAttemptsPerNode` leaves a permanent orphan.

**Recommendation:** the scoped reaper (or a periodic garbage-collection pass) should delete chain branches whose nodes are all terminal (`completed`-and-merged, `failed`-and-exhausted, or `abandoned`). This is a hygiene improvement, not a correctness fix — the broken work is quarantined by the merge-trigger gate (F2), not by branch deletion.

## Options evaluated

| Option | Durability | Broken-work risk | Machinery cost | Recommendation |
|---|---|---|---|---|
| A. Always push (unconditional) | YES (work on branch) | Quarantined by merge gate (F2) | Zero (no new markers, no new code paths) | **Adopt** |
| B. Push only on success (conditional) | NO (work lost on `failed`) | None (no push) | New `agent-failed-before-push` marker + collecting-pass recovery push | **Reject** |
| C. Hybrid (push always, mark failure) | YES (work on branch) | Quarantined by merge gate (F2) | New marker (redundant with session-API exit-code recovery) | Reject (marker redundant) |

**Option A (always push)** is the recommended design. The plan's merge-trigger rules already prevent the primary risk A4 raises (broken work merging to trunk) — a `failed` outcome does not trigger the merge queue (F2). So under unconditional push, broken partial work lands on the chain branch but is never merged. The risk A4 names is not realized.

The plan's stated durability goal ("durable in git regardless of what is watching") is only achievable under Option A. Option B breaks this for every `failed` outcome — the common failure case. Option B's "prevent broken merges" rationale is already covered by the merge-trigger gate.

Option C's marker is redundant with the session-API exit-code recovery the pass already uses for classification (graph-pipeline.md:1368-1369: "getSessionCommandLogs"). The pass already knows opencode's exit code from the session, not from a sandbox-local marker. The marker's only marginal value is branch self-description for human inspection — a real but minor hygiene benefit, achievable more simply with a commit-message convention.

## Sub-agent analyses

Two sub-agents (no MCP access) provided parallel analysis that informed the findings:

**Sub-agent 1 (template design analysis):** Traced the exact template structure described in the plan, identified the gap (push step predicate unspecified), evaluated three options (always push, push on success, hybrid), traced the merge-trigger path to confirm `failed` does not trigger the merge queue, and recommended Option A (unconditional push) with documentation of the orphaned-branch cleanup gap. Key insight: the plan's durability floor and merge-trigger gate together make unconditional push safe — durability is preserved, broken work is quarantined.

**Sub-agent 2 (recovery/classification path analysis):** Traced the exact sequence of events when opencode exits non-zero, confirmed the default `set -e` reading means the push step does not run, confirmed transcript collection recovers evidence not work product, confirmed no recovery path covers the A4 case, discovered the "Branch push failure" section does not exist (four dangling references), discovered the "exit code 42" signal is not in the plan, and assessed the risk as material (A4 is the default failure path, not an edge case). Key insight: the asymmetry between the planning-run wrapper (which runs an unconditional post-exit step) and the in-sandbox template (not described as having any wrapper) is a design smell.

## What this means for the plan

The plan has a real specification gap (F1) compounded by a missing section (F4). Four documentation changes are needed:

1. **F1: Specify unconditional push.** The in-sandbox command template description (graph-pipeline.md:1388-1392) should state that the push step runs unconditionally regardless of opencode's exit code. The template records the exit code separately for the classifier and pushes in all cases. This closes the A4 gap — the durability floor holds for failed outcomes.

2. **F2: Note that `failed` does not trigger the merge queue.** The merge-trigger rule (graph-pipeline.md:542-548) should state explicitly that only `completed` merge-point nodes trigger the merge queue — a `failed` node's branch is never merged. This is currently implied but not stated as a guarantee. It is the safety property that makes unconditional push safe.

3. **F4: Write the "Branch push failure" section.** Four forward references (graph-pipeline.md:663, :1392, :1450, :1809) point at a section that does not exist. The section should cover: the bounded-retry backoff parameters, the `push-failed` marker contents, the collecting-pass recovery-push behavior, and the unconditional-push guarantee (F1) that prevents the "push step never ran" case from arising.

4. **F5: Address orphaned-branch cleanup.** Under unconditional push, a `failed` node whose attempts are exhausted leaves an orphaned chain branch on origin. The scoped reaper (or a periodic garbage-collection pass) should delete chain branches whose nodes are all terminal. This is a hygiene improvement, not a correctness fix.
