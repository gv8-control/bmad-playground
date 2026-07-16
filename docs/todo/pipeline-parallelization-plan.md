# Plan: parallel execution of playbook stage groups

Status: draft, not started. No code, script, or workflow changes have been made yet. This
document is the design and risk analysis to review before any implementation begins.

Written 2026-07-03 against `_bmad-output/pipeline/playbook.json` (version 2) and the n8n
workflows described in [docs/self-improving-pipeline.md](self-improving-pipeline.md). Read that
document first — this plan only covers the delta needed to make `stage` groups actually run
concurrently instead of being metadata.

## Why now, and why carefully

The playbook already groups adjacent steps that don't depend on each other under the same
`stage` value (`pre-implementation`, `test-generation`, `review`). The doc for gen-2 says
plainly: "the stage field only preserves which steps could run in parallel if that is ever
built — today the field is pure metadata." This plan is that build.

Trend data from `node scripts/pipeline/journal.mjs trends` (4 completed stories, epic 2) gives
real per-step average durations to reason about instead of guessing:

| Step | Stage | Avg duration |
| --- | --- | --- |
| create-story | create | 14m 27s |
| validate-story | validate | 5m 6s |
| prepare-tests | pre-implementation | 7m 31s |
| validate-story-2 | pre-implementation | 5m 4s |
| implement-story | implement | 18m 13s |
| unit-tests | test-generation | 20m 25s |
| e2e-tests | test-generation | 10m 53s |
| review-code | review | 39m 39s |
| review-tests | review | 4m 36s |
| review-nfrs | review | **137m 27s** (max 258m) |
| update-project-context | review | 4m 7s |

Sequential total per story (avg case): ~267 minutes. If `pre-implementation`,
`test-generation`, and `review` each run as one concurrent group (wall-clock = the slowest
member of the group), the total drops to ~203 minutes — about **24% faster per story**,
almost entirely because the four `review` steps collapse to the time of the slowest one.

Two things fall out of that table that matter for scope:

1. **`review-nfrs` dominates the review stage by an order of magnitude** (137m avg vs. 4-40m
   for its stage-mates). Parallelizing `review` only saves the other three reviewers' time
   (~48 minutes); the story is still gated by `review-nfrs`. That step's own runtime is a
   separate problem worth raising with Marius independently — it is not something this plan
   fixes, and no change here should be justified by "it'll make review-nfrs faster" (it won't).
2. **`haltsPerStory` is `{}` across all 4 stories** — the decision policy (`_bmad-output/decision-policy.md`)
   has driven human-in-the-loop halts to zero so far. That's the precondition that makes
   parallel steps tractable at all (see "Human questions during a parallel group" below); if
   halts start recurring, this design's weakest point is exactly where it'll hurt.

## Constraint 1: n8n does not run branches concurrently

Already documented and independently important enough to restate: `docs/self-improving-pipeline.md`
records that n8n executes the branches of one workflow execution one node at a time, even when
multiple nodes are wired to run "in parallel" — this was verified the hard way in gen-1. Wiring
two `Execute Workflow` nodes to both fire from `Step loop` in `Develop Story (Playbook)`
(`n8n/workflows/GGiJ7KGUez94SaOc.json`) would not run them concurrently; n8n would simply run
one to completion, then the other, with the appearance of parallelism in the canvas but none in
practice — precisely the gen-1 mistake this pipeline was already built to avoid repeating.

**Consequence for this design:** true concurrency has to happen *inside a single n8n node*, as
OS-level concurrency in a script that node invokes (background processes joined with `wait`),
not as multiple n8n nodes or multiple n8n executions. This also means no new webhook trigger or
fan-out/fan-in join pattern is needed in the gen-1 workflows — which matters because gen-1
workflows are supposed to stay untouched except for the two already-authorized edits inside
`BMAD Session (OpenCode)` (the `Agent run` timeout/error-capture wrapper and the `questionCount`
field on `Output`). A design that needs a third touch to gen-1 should be flagged as a scope
change, not built quietly.

## Constraint 2: opencode's tolerance of concurrent invocations against this repo is unverified

This is the actual risk in the plan, and it is only partially understood today.

**What's known (from prior sandboxing work, see the `n8n-workflow-authoring-gotchas` memory):**
running `opencode run` from a second git worktree *or* a fully standalone `git clone --local` of
this repo, at a different path, while a real pipeline session was active, failed instantly
(before the LLM was even called) with a generic `UnknownError: Unexpected server error`. The
session log showed the sandbox instance was assigned the *same* internal project identifier as
the live repo despite a different `directory=` — i.e., opencode appears to key "project" off git
remote/repo identity, not filesystem path, and something about a second concurrent instance
against that identity collided.

**What's also true right now, observed live while writing this plan:** three separate opencode
processes are currently running with `cwd` = `/workspaces/bmad-playground` at the same time —
`opencode serve` (a persistent daemon, unrelated to this pipeline), an interactive `opencode` TUI
session, and the pipeline's own `opencode run` for story 2.3's reflection step — with no
apparent collision. So "two opencode processes against the same repo identity" is not
*unconditionally* fatal; the earlier failure was specifically about a worktree/clone at a
different path sharing the same identity. Whether the same-path case is actually safe, or just
hasn't collided yet, is not established either way. **Do not treat this as resolved.**

**A concrete, testable lever exists that may sidestep the whole question:** `opencode run`
supports `OPENCODE_DB=<path>` to point at an isolated SQLite storage file instead of the shared
`~/.local/share/opencode/opencode.db` (confirmed by inspecting the binary — the storage layer
already runs SQLite in WAL mode with `busy_timeout=5000`, i.e. it's already built to tolerate
some concurrent access, which makes a hard collision on *storage* less likely than a collision
in project-identity *resolution* logic elsewhere). It also supports `--dir <path>` to point a run
at an arbitrary working directory, and `--port`/no-port to run its own ephemeral per-invocation
HTTP server rather than attaching to a shared one. Combining `--dir <worktree-path>` with a
per-worktree `OPENCODE_DB` gives each parallel branch a fully separate storage database and
working directory — if the earlier collision really was about shared identity/storage, this
removes it entirely; if it wasn't, the experiment below will show that too.

**This must be verified experimentally before anything is built on top of it**, and the
experiment must not run against this repo while epic 2 is live (see "Testing strategy, and what
not to touch" below).

## Design

### 1. Group steps by stage instead of flattening them

`scripts/pipeline/get-steps.mjs` currently returns a flat array; the n8n `Step loop`
(`SplitInBatches`) in `Develop Story (Playbook)` iterates it one step at a time. Change the
resolution step (either in `get-steps.mjs` or a new `get-stage-groups.mjs` that wraps it) to
group *consecutive* steps sharing a `stage` value into an array of groups:

```
[{ stage: "create", steps: [create-story] },
 { stage: "validate", steps: [validate-story] },
 { stage: "pre-implementation", steps: [prepare-tests, validate-story-2] },
 { stage: "implement", steps: [implement-story] },
 { stage: "test-generation", steps: [unit-tests, e2e-tests] },
 { stage: "review", steps: [review-code, review-tests, review-nfrs, update-project-context] }]
```

`Step loop` in n8n iterates *groups*, not individual steps. A group of size 1 behaves exactly as
today (call `BMAD Session (OpenCode)` directly — zero behavior change, zero new risk, for every
group that isn't actually parallelizable). Only groups with more than one step take the new path.

Note this only groups steps that are *already adjacent in the array*. `apply-amendments.mjs`
already guarantees a learned step never gets inserted inside an existing stage group (it shifts
to the group edge, per the comment at `scripts/pipeline/apply-amendments.mjs:127-136`) and gives
every learned step its own stage — so learned steps stay sequential automatically and need no
change here.

### 2. A single script drives each parallel group

New script, e.g. `scripts/pipeline/run-stage-group.mjs`, invoked by one `executeCommand` node in
place of the direct `Execute Workflow → BMAD Session` call, only for groups with `steps.length >
1`. For each step in the group, in one Node.js process:

1. `git worktree add <tmp-path> HEAD -b pipeline/<runId>/<stepId>` — one throwaway worktree per
   step, branched from the commit the group started at.
2. Symlink (not copy) `node_modules` and any local Nx/build cache directories from the main tree
   into the worktree. This is an Nx monorepo (`apps/web`, `libs/*`); a fresh `npm install` per
   worktree per story would be slow and would partly or fully cancel out the time saved by
   parallelizing steps like `unit-tests` (20m avg) and `e2e-tests` (11m avg). Symlinking assumes
   no step in the group changes `package.json`/the lockfile — see the conflict check below,
   which must treat a lockfile diff as a conflict, not just a content diff.
3. Spawn `opencode run` as a background child process per step (`child_process.spawn`, not
   `exec`, so all children run concurrently), each with `--dir <worktree-path>` and a distinct
   `OPENCODE_DB=<tmp-path>/opencode.db`. Reuse the same timeout/kill-after wrapper and
   runner-errors.jsonl capture logic that `BMAD Session (OpenCode)`'s `Agent run` nodes already
   have (`n8n/workflows/C8qzMFk2e00sLHJg.json:43`) — this is duplicated, not shared, since the
   parallel path can't call through the gen-1 sub-workflow (constraint 1). Journal `step_start`
   for every member of the group at the same time; that's honest — they really do start
   together.
4. `Promise.all` / `wait` for every child.
5. **Conflict check, before merging anything:** for each worktree, compute the changed files
   relative to the group's start commit (`git -C <worktree> diff --name-only HEAD@{group-start}`,
   plus explicitly checking the lockfile). If any file (including the lockfile) appears in more
   than one worktree's changed-file set, this is a real conflict, not a merge to attempt — go to
   the fallback path below instead of guessing which write should win.
6. **No conflict → merge:** commit each worktree's changes (`git -C <worktree> add -A && git -C
   <worktree> commit`), then `git cherry-pick <sha>` each commit into the main tree, in a fixed
   order (group array order, for reproducibility). Disjoint files guarantee no cherry-pick
   conflict. Then **immediately** `git worktree remove --force <path>` *and*
   `git branch -D pipeline/<runId>/<stepId>` for every worktree in the group — removing the
   worktree directory alone leaves the throwaway branch behind in `git branch` forever; both have
   to go.
7. **Conflict → fallback:** discard all the worktrees' changes, **remove every worktree and its
   throwaway branch the same way as step 6** (a conflict is not an excuse to leave them lying
   around), journal a `stage_conflict` event naming the stage and the overlapping file(s), record
   an observation in the ledger with fingerprint `stage-conflict-<stage>` (same "observations are
   cheap" channel reflection already reads), and re-run the group's steps *sequentially in the
   main tree*, exactly like today. This does not consume a story attempt
   (`maxAttemptsPerStory`) — it's the group falling back to its pre-existing safe behavior, not a
   story failure. If conflicts recur for a given stage (the existing `addStepRecurrenceThreshold`
   machinery already tracks fingerprint recurrence), that's a strong, evidence-backed signal to a
   human that this particular stage grouping shouldn't be marked parallel — nobody has to guess.
8. Journal `step_end` per step as today (each still gets its own duration/outcome/halts, so
   trends stay accurate — a parallel group must not blur its members into one aggregate number),
   plus one `stage_group_end` event carrying the group's total wall-clock time and whether it hit
   the conflict fallback.

**Worktree lifecycle — the only case where cleanup can't be immediate is a parked step** (section
3): its worktree has to survive until a human answers, which could be minutes or days. That's a
real exception to "clean up right away," not a loose end, and it needs its own guardrails:

- The parked worktree and its branch are the *only* ones left alive between steps — its siblings
  in the same group still get removed the moment they finish (step 6/7 above applies to them
  individually; the group only *merges* once everyone is done, but a finished sibling's worktree
  isn't needed to do that — its diff can be captured and the worktree freed immediately after it
  finishes, well before the parked step resolves). Don't hold sibling worktrees open just because
  one member of the group is still parked.
- A parked worktree living for a long time is the direct, known-in-advance consequence of the
  same pre-existing limitation already called out in `docs/self-improving-pipeline.md`: "the
  human-question form ... has no timeout, so an unanswered question stalls the loop indefinitely."
  This design doesn't introduce a new open-ended wait — it inherits that one. Fixing the
  no-timeout gap (out of scope here, per that doc) would also bound how long a parked worktree can
  live.
- **A startup sweep, independent of the happy path:** before a new stage-group run starts (and
  optionally on a schedule), list worktrees under the pipeline's known scratch prefix
  (`git worktree list --porcelain`, filtered to the `pipeline/` branch prefix) and cross-check
  each one against the journal — a worktree with no matching `parked` or in-flight
  `stage_group_start` entry is orphaned (left behind by a crashed script, a killed process, or an
  n8n/machine restart mid-group) and gets removed, branch included. This is the actual answer to
  "should never live longer than they need to": the happy-path code removes its own worktrees
  immediately, and the sweep catches the cases where that code didn't get to run at all.

### 3. Human questions during a parallel group

A step asking a question should not cost anything it doesn't have to. Failing the step outright
and discarding its progress — my first pass at this design — was an unnecessary overreaction, not
a real requirement. opencode already gives us the primitive needed to avoid that: `--session <id>`
resumes a specific session exactly where it left off, which is exactly how the existing sequential
flow already answers a question today (`Agent run (follow-up)` in `BMAD Session (OpenCode)`
resumes with `--session "{{ $('Extract SessionID').item.json.sessionId }}"`). There's no reason
that same resume can't apply to one step inside a parallel group instead of one whole story
execution.

Revised design — **park, don't fail:**

- When a background child's `opencode run` output classifies as outcome `QUESTION` (via the same
  `BMAD Outcome` logic the sequential path already uses) instead of `COMPLETE`, the orchestrator
  does not treat it as a failure. It records the step as **parked**: worktree path, session ID,
  and the question text, to a small per-run file. Journal it as a third status — `parked`, not
  `success` or `failed` — so trends don't misread a question as a defect.
- Every other step in the group is completely unaffected — they keep running, finish, and their
  results just sit ready. Nothing already done gets discarded or re-run because a sibling asked a
  question.
- The group can't merge until *every* step (parked ones included) reaches `COMPLETE` — the merge
  needs each worktree's final diff — but waiting costs nothing extra; it's not blocking anyone,
  and it's not re-doing any work.
- Once a human answers, the orchestrator resumes *only* the parked step
  (`opencode run --session <id> --dir <worktree> "<answer>"`), exactly where it stopped, then
  proceeds to the conflict check and merge once it (and everything else) is `COMPLETE`.

What this needs that doesn't exist today: since these are background OS processes, not an n8n
execution sitting on a `Wait` node, surfacing and answering a parked question needs one small new
piece of graph — a form (reachable via the same ntfy-notify pattern already used) that collects an
answer and re-invokes `run-stage-group.mjs` in a "resume" mode for that one step. This is additive
new workflow, not a third edit to gen-1's existing `BMAD Session (OpenCode)` — but it is genuinely
new plumbing, and building it is the actual cost of doing this properly.

Given `haltsPerStory: {}` across all 4 stories so far, that plumbing may see little use, but "used
rarely" is an argument for building it once and forgetting it, not for skipping it — a step's
progress shouldn't be at the mercy of how often the decision policy happens to cover a decision.

**Decided (Marius): park/resume is required for every parallel group, no exceptions.** There is
no fail-and-retry stopgap even for the shorter, lower-risk groups (`pre-implementation`,
`test-generation`) — a question is parked and resumed the same way regardless of which stage
group it happens in. This means the park/resume plumbing is on the critical path for *any* group
going live, not just `review`; it can't be deferred past the first rollout step.

### 4. What doesn't change

- `apply-amendments.mjs` — no change. It already respects stage boundaries for inserting learned
  steps; those rules are exactly what's needed here too.
- `next-story.mjs`, the epic-level halt guard, `maxAttemptsPerStory` — no change. A conflict
  fallback is not a story failure (point 7 above); a genuine step failure inside a parallel group
  is journaled and counted exactly like a sequential step failure is today.
- `BMAD Session (OpenCode)` and the rest of gen-1 — no third touch. The parallel path is a new
  script called from a new branch in `Develop Story (Playbook)`, invoked only for `stage` groups
  with more than one enabled step.

## Testing strategy, and what not to touch

Epic 2 is running right now — as of writing this, `journal.jsonl`/`ledger.jsonl` are mid-update
and an `opencode run` reflection step for story 2.3 is in flight. Nothing below should touch:

- `_bmad-output/pipeline/playbook.json`, `journal.jsonl`, `ledger.jsonl`, `runner-errors.jsonl`,
  or `_bmad-output/implementation-artifacts/sprint-status.yaml` — all live pipeline state.
- Any git worktree of *this* repo while a real session might be active against it — per the
  memory finding, a worktree/clone sharing this repo's remote identity while a real session runs
  is exactly the scenario that failed before.
- The `Develop Epic` / `Develop Story (Playbook)` / `BMAD Session (OpenCode)` n8n workflows —
  don't edit or manually execute them while epic 2 is in progress.

Phased verification, only once the pipeline is confirmed idle (no `opencode` process with `cwd`
under this repo, no in-flight execution in n8n):

1. **Isolate constraint 2 first, in a throwaway repo with no relationship to this one** (a fresh
   `git init` in `/tmp`, not a clone or worktree of bmad-playground) — spin up N concurrent
   `opencode run` invocations there, each with its own `--dir`/`OPENCODE_DB`, and separately with
   shared storage, to learn whether the earlier collision was about shared identity/storage
   (fixed by isolation) or something else. This validates the mechanism without any risk to this
   repo's pipeline, because it isn't this repo.
2. **Only after (1) is understood**, and only when the pipeline is idle, repeat the same
   experiment against a disposable worktree of this repo (`git worktree add /tmp/... HEAD`) to
   confirm the mechanism holds for this repo's actual identity/remote — still never touching the
   main working tree or pipeline state files.
3. **Dry-run `get-steps.mjs`'s grouping change** against the current `playbook.json` with no
   opencode calls at all — pure output-shape verification (does it produce the groups shown in
   section 1) — safe to do any time since it's read-only.
4. Only after 1-3 hold up, build `run-stage-group.mjs` and test it against a disposable worktree
   with a trivial synthetic step pair (e.g. two steps that each write a distinct scratch file) to
   validate the merge and conflict-fallback logic end-to-end before pointing it at a real BMAD
   skill.
5. **Build and test the park/resume path before any real BMAD skill run** — required for every
   group per the decision above, so it can't be left for later. Use a synthetic step that
   deliberately asks a question to validate: the step parks without failing, its sibling(s) finish
   normally and are left untouched, the question surfaces to a human, and answering resumes only
   the parked step via `--session <id>` and reaches the same merge point as if it had never asked.
   This needs its own dry run before step 6 — don't validate it for the first time against a real
   question from a real BMAD skill.
6. First real parallel-group run should be a manual, supervised invocation on a non-epic-2 story
   (or against a paused/completed epic) — not folded into the live loop until it's been watched
   succeed at least once, including at least one supervised run where a step actually parks.

## Rollout order

Given the timing data, suggested order of enabling groups (safest/highest-confidence first, not
all at once):

1. `pre-implementation` (`prepare-tests` + `validate-story-2`) — smallest blast radius: one
   writes test scaffold files, the other edits the story markdown; very unlikely to touch
   overlapping files, ~304s average saving.
2. `test-generation` (`unit-tests` + `e2e-tests`) — both are test-writing steps but in different
   test trees (unit vs. `playwright/e2e`); ~653s average saving. Higher chance of touching shared
   config (`playwright.config`, `package.json`) than group 1 — this is where the lockfile/shared
   file conflict check earns its keep.
3. `review` (`review-code` + `review-tests` + `review-nfrs` + `update-project-context`) — highest
   risk: `review-code` *writes* fixes to the same code the other three *read* to write their
   reports. Even without a file-level conflict, a reviewer reading mid-fix code is a correctness
   concern the file-overlap check won't catch (it only checks which files changed, not read/write
   ordering). Recommend holding this one back until 1 and 2 have run cleanly across several
   stories, and consider running `review-code` to completion first, *then* the remaining three
   reviewers in parallel with each other — a partial parallelization of the group rather than all
   four at once — as a safer middle step. Also note (again) that `review-nfrs`'s own ~137m
   average means this group's wall-clock win is smaller in practice than groups 1-2 relative to
   the risk taken on.

## Risks

| Risk | Mitigation in this design |
| --- | --- |
| Two parallel steps write the same file | Changed-file-set overlap check before merging; fallback to sequential re-run, never a silent last-write-wins |
| Lockfile/`node_modules` drift between worktree and main | Lockfile treated as a conflict-checked file, not silently symlinked-and-ignored; a dependency change in one worktree forces the fallback path |
| opencode collides on shared project identity/storage | Per-worktree `OPENCODE_DB` + `--dir`; verified experimentally in an unrelated repo before use here (see Testing strategy) |
| Human question mid-parallel-step | Park-and-resume via `--session <id>` (section "Human questions") — the step's own progress and its siblings' are both preserved, not discarded |
| Trend/ledger data gets muddied by concurrent steps | Each step still journals its own `step_start`/`step_end`; a new `stage_group_end` event is additive, not a replacement |
| A conflict fallback consumes a story attempt and trips the halt guard | Explicitly designed not to — fallback re-runs the group in-place, same attempt |
| Disk usage / branch clutter from throwaway worktrees | Removed (worktree *and* branch) immediately on both merge and conflict-fallback, not just merge; `node_modules` symlinked, not copied |
| Orphaned worktree left behind by a crashed script or restart | Startup sweep cross-checks live worktrees against the journal and removes any with no matching parked/in-flight entry (see "Worktree lifecycle") |
| A parked worktree lives for a long time waiting on a human | Inherent to the existing no-timeout limitation on human questions (already documented, out of scope to fix here); siblings' worktrees are freed as soon as they finish, not held open alongside it |

## Open questions for Marius before implementation starts

1. ~~Human-questions-during-parallel-steps~~ — **decided:** park/resume is required for every
   group from the first rollout step onward, no fail-and-retry stopgap for any group. This is now
   on the critical path — see step 6 below.
2. Is the `review` stage in scope for v1, or should this start with `pre-implementation` and
   `test-generation` only, given the correctness concern about `review-code` writing what the
   other three reviewers read?
3. Should `review-nfrs`'s ~137-minute average runtime be raised as a separate problem (possibly
   scoping down what the NFR audit covers per story) regardless of what happens with this plan —
   it's the actual long pole for story wall-clock time, parallel or not?
