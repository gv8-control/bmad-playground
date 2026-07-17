# Plan: dependency-graph pipeline with parallel opencode agents

Status: draft vision, not started. Written 2026-07-17. Supersedes and replaces the discarded
stage-group parallelization plan (`pipeline-parallelization-plan.md`, deleted the same day) —
everything still relevant from that plan is folded in here. Read
[docs/self-improving-pipeline.md](../self-improving-pipeline.md) first; this plan describes the
next architecture generation, not a delta to the current loop.

## Why this shape

n8n executes the nodes of one workflow execution sequentially, even when branches are wired "in
parallel" (verified in gen-1, recorded in the pipeline doc). But n8n runs *separate executions*
concurrently without any special setup. The discarded plan worked around the constraint by doing
OS-level concurrency inside a single node; this plan removes the constraint instead: agents never
converge on an n8n node at all, so there is nothing to join.

The architecture inverts. Today n8n is the engine driving a sequential story loop and the
pipeline files are the record. Here the state is the engine:

- **A work graph, not a list.** Sprint planning emits stories with explicit `depends-on` edges (a
  directed acyclic graph) instead of an ordered sequence. Any story whose dependencies are all
  merged is claimable. Story ordering — not n8n — was the real obstacle to cross-story
  parallelism; making dependencies explicit is planning work, not plumbing work.
- **A dispatcher, not a loop.** A script/daemon claims ready work and launches one opencode agent
  per claim in an isolated workspace: git worktree + per-run `OPENCODE_DB` at small N, Daytona
  sandboxes at larger N (Epic 6 built sandbox provisioning for the product; the pipeline copies
  the pattern, not the code). A sandbox also removes the opencode identity-collision risk
  entirely — separate machine, separate storage.
- **Git is the convergence point.** Every agent pushes a branch; a serial merge queue
  (rebase → test → merge) integrates one branch at a time. Integration is serialized, work is
  not — integration takes minutes, stories take hours.
- **n8n keeps two jobs:** human-facing workflows (question forms, ntfy notifications) and an
  event-ingest webhook that serializes journal appends from concurrent agents.

## Graph management rules (decided)

- **Actively managed graph:** never plan more than 2 stories ahead. The graph is expanded and
  replanned as work merges, not generated whole up front.
- **Depth-first traversal:** the dispatcher descends into a story's dependents before starting
  unrelated siblings.
- These rules are dispatcher claim-time policy — plain code, not a feature of any store or
  engine. Do not pick technology expecting it to enforce them.

## State

- `graph.json` in `_bmad-output/pipeline/`, owned and mutated only by the dispatcher, with every
  mutation journaled as an event — the same single-writer convention as `playbook.json` and
  `journal.jsonl`. SQLite only if concurrent queried reads become a real need; at tens of nodes
  they are not.
- **Atomic writes required:** `scripts/pipeline/lib.mjs:24` currently uses plain
  `fs.writeFileSync`, which a poller can catch mid-write. The dispatcher must write
  tmp-file + `renameSync`; the viewer keeps last-good state on parse failure.
- **No in-memory truth.** The devcontainer sleeps and gets rebuilt, so `graph.json` + journal on
  disk must be sufficient to resume from cold. The startup sweep (below) is the standard boot
  sequence, not edge-case cleanup. The dispatcher needs a resurrection path (devcontainer
  postStart hook or a manual command).
- Agents pin the playbook version they claimed against; amendments apply only at claim
  boundaries, never mid-flight.

## Viewer (decided by investigation, 2026-07-17)

Constraint first: the viewer belongs to the workflow silo, not the product. It must not live in
or reuse code from `apps/web`/`apps/agent-be`, and must stay build-less and app-less — committed
flat files only, provisioned (if at all) via `.devcontainer/`. Access is via Codespaces forwarded
ports, same as n8n's UI.

1. **Start:** the dispatcher regenerates a Mermaid block in a markdown file on every graph
   mutation. Viewable in VS Code preview inside the codespace (add the mermaid preview extension
   to `devcontainer.json`) and on GitHub after push. Zero infrastructure.
2. **Upgrade when interactivity is worth it:** one committed `viewer.html` + vendored
   Cytoscape.js + dagre (~717K across 3 plain UMD `<script>` files, no build step) + a ~10-line
   Node stdlib HTTP server in `scripts/pipeline/` serving the page and `graph.json` from one
   origin on a forwarded port, polling every ~30s. Proper layered DAG layout, node-state
   coloring, click-to-inspect sidebar.
3. **Grafana rejected:** its Node Graph panel now has a layered DAG layout, but the Infinity
   data source cannot read a local file — it needs an HTTP URL, i.e. the same tiny file server
   anyway — plus a ~190MB re-download on every devcontainer rebuild, plugin/provisioning
   surface, ~250MB idle RAM next to n8n, and a fixed-vocabulary node inspector.

## Carried over from the stage-group plan

### Per-agent workspace recipe (local tier)

- `git worktree add <tmp-path> <base-commit> -b pipeline/<runId>/<id>` per agent.
- Symlink (not copy) `node_modules` and `.nx/cache` from the main tree — build artifacts, safe to
  share read-only, large. A lockfile change in an agent's diff is treated as a conflict, never
  silently absorbed.
- **Copy (not symlink) `.env`, `.env.test`, and `.auth/` into each worktree** at creation time,
  before the opencode process spawns. A capability audit found these gitignored dependencies break
  in worktrees otherwise: `.env.test` (all `test:e2e*` scripts use `dotenv -e .env.test` — hard
  failure), `.auth/` (Playwright storageState — e2e auth tests fail), `.env` (`db:migrate`,
  `rotate-kek` use `dotenv -e .env` — hard failure). They are small files containing secrets;
  copying is cheap and avoids the semantic weirdness of symlinking secret files into multiple
  worktrees. `.env.local` (API keys) needs no symlink or copy — the n8n `Agent run` command sources
  it from the main repo path (`set -a; . /workspaces/bmad-playground/.env.local`), not CWD, so
  `run-stage-group.mjs` must keep sourcing from the main path.
- Spawn `opencode run` with `--dir <worktree>` and a per-run `OPENCODE_DB=<tmp>/opencode.db`
  (`child_process.spawn`, concurrent children). Reuse the timeout/terminate wrapper and
  `runner-errors.jsonl` capture logic that `BMAD Session (OpenCode)`'s `Agent run` nodes have.

### Cleanup discipline

- On completion (success or failure): remove the worktree **and** delete its throwaway branch —
  removing only the directory leaves branches behind forever.
- **Startup sweep:** on dispatcher boot, list worktrees under the `pipeline/` branch prefix and
  cross-check against the journal; any worktree with no matching parked or in-flight entry is
  orphaned (crash, kill, rebuild mid-run) and gets removed, branch included.

### opencode concurrency: experiment results and remaining risk

The main risk for the local-worktree tier; sandboxes sidestep it wholesale. Preserved in full
because it encodes a failure already paid for once:

- **Known failure** (see the `n8n-workflow-authoring-gotchas` memory): `opencode run` from a
  second worktree *or* a standalone `git clone --local` at a different path, while a real
  pipeline session was active, failed instantly with `UnknownError: Unexpected server error` —
  before the LLM was called. The session log showed the second instance was assigned the *same*
  internal project identifier as the live repo despite a different `directory=`: opencode keys
  "project" off git remote/repo identity, not filesystem path.
- **Also observed:** three opencode processes (`opencode serve`, a TUI session, a pipeline
  `opencode run`) running simultaneously with cwd = this repo, no collision. So two processes
  against the same identity is not unconditionally fatal; the failure was specifically a
  worktree/clone at a different path sharing the identity. Whether same-path is safe or just
  lucky is not established. **Do not treat this as resolved.**
- **The lever, now tested:** `OPENCODE_DB=<path>` points a run at an isolated SQLite storage file,
  and `--dir <path>` sets the working directory. Per-agent `--dir` + `OPENCODE_DB` gives fully
  separate storage and cwd. **Phase 1 of the experiment (throwaway repo) confirms isolated
  `OPENCODE_DB` per agent is safe at N=6** — no collisions, no DDL races. This matches what the
  workspace recipe above already prescribes.
- **Shared-DB caveat (observed, not blocking):** a shared custom `OPENCODE_DB` has a DDL migration
  race at cold start — when multiple instances simultaneously run schema migrations on a fresh DB,
  one fails with a `CREATE TABLE workspace` error. `busy_timeout=5000` does not protect during
  migrations. Pre-warming the DB (one instance migrates first) eliminates the race. Isolated DBs
  sidestep it entirely, which is why the recipe uses them.
- **Experiment status:** phase 1 (throwaway repo: `git init` in `/tmp/oc-test/repo`, 6 worktrees
  `wt-a1..3`/`wt-b1..6`, a script spawning N concurrent `opencode run` with isolated vs shared
  `OPENCODE_DB`) is complete — 6 experiments run (N=3 and N=6, isolated vs shared DB, cold vs warm
  start). Headline results: isolated `OPENCODE_DB` 9/9 success; shared DB 5/6 at cold start with a
  reproducible DDL-migration race (see caveat above), 6/6 when pre-warmed. **Phase 2 remains the
  gate:** repeat against a disposable worktree of *this* repo (pipeline idle) to test whether
  worktrees sharing this repo's git identity collide despite isolated storage. The identity-collision
  risk is not yet ruled out for this repo specifically.

### Park/resume for human questions — mandatory (decided by Marius)

- When an agent's output classifies as outcome `QUESTION`, the step is **parked**, not failed:
  record worktree path, session ID, and question text; journal status `parked` (a third status —
  not `success`, not `failed` — so trends don't misread a question as a defect).
- Other agents are unaffected; nothing finished is discarded or re-run.
- An answer resumes exactly one session: `opencode run --session <id> --dir <worktree> "<answer>"`.
  The surfacing/answering plumbing is an n8n form (ntfy-notified) whose submission re-invokes the
  dispatcher in resume mode for that one agent — this becomes the question inbox for N agents.
- **Decision stands from the previous plan: park/resume is required from the first rollout step,
  no fail-and-retry stopgap.** A parked worktree lives until answered (inherits the existing
  no-timeout limitation on human questions); it is the only worktree allowed to outlive its run.
- Precondition to watch: the decision policy currently drives halts to zero (`haltsPerStory: {}`
  across measured stories). Every residual halt multiplies by N agents.

### Conflicts are evidence, never silently resolved

- No silent last-write-wins anywhere. Lockfile diffs count as conflicts.
- A merge-queue failure journals a fingerprinted observation (e.g. `merge-conflict-<story>`)
  into the ledger — the same observations channel reflection reads — so recurrence data, not
  guessing, tells a human which stories are actually coupled. The existing
  `addStepRecurrenceThreshold` recurrence machinery applies unchanged.
- A merge-queue fallback (rework, re-run) does not consume a story attempt
  (`maxAttemptsPerStory`); genuine step failures count exactly as they do today.

### Dependency knowledge for the graph

- `review-code` *writes* fixes to the same code the other review steps *read*. That is a real
  ordering edge no changed-file overlap check can catch — the graph must encode it explicitly
  wherever review steps become nodes.
- `review-nfrs` averages ~137 minutes (max 258m) — the dominant per-story wall-clock cost in any
  architecture. Parallel stories improve throughput, not story latency; this step's runtime
  should be raised as its own issue regardless of this plan.

## Honest costs

- The graph encodes *declared* dependencies only. Unknown coupling surfaces later as merge-queue
  conflicts and rework. This buys throughput (stories per day), not latency (a story still takes
  what it takes).
- Journal/ledger/sprint-status assume one writer; agents must emit events through the ingest
  webhook rather than editing shared files.
- N concurrent opencode + test runs strain one devcontainer — the pressure that graduates agents
  into sandboxes.
- Human attention becomes the scarce resource; the question inbox and near-zero halt rate are
  what keep N agents from turning into N interruptions.

## Path (incremental, each step independently useful)

1. Run phase 2 of the opencode concurrency experiment (disposable worktree of this repo, pipeline
   idle) — phase 1 (throwaway repo) is done and confirms isolated `OPENCODE_DB` at N=6; phase 2
   gates the entire local-worktree tier.
2. Build the per-agent machinery: workspace recipe, cleanup + startup sweep, park/resume with a
   synthetic question, conflict-as-evidence journaling. Test against disposable worktrees with
   synthetic steps before any real BMAD skill run.
3. Add `depends-on` edges to sprint planning output; introduce `graph.json` and the dispatcher
   with the plan-2-ahead / depth-first policy. First taste of parallelism: two independent
   stories as two concurrent n8n executions of the existing `Develop Story (Playbook)` workflow,
   each in its own workspace — no new n8n primitives.
4. Move "done" from workflow-return to branch-merged: merge queue + event-ingest webhook +
   Mermaid graph view.
5. Graduate agents into Daytona sandboxes when N or machine pressure demands; upgrade the viewer
   to `viewer.html` when interactivity earns it.

First real parallel run should be manual and supervised, including at least one supervised park —
same discipline the discarded plan prescribed.

## Resolved questions

1. **Node definition:** a graph node = one skill run (BMAD-agnostic — any skill, not just BMAD) or
   another atomic action like a CLI command — finer than a whole story. (Reframes the original
   "whole stories only vs review steps as nodes.")
2. **`review-nfrs` runtime (~137m avg):** out of scope for this plan; raise as a separate issue.
   It caps story latency no matter what this plan does (already noted in "Dependency knowledge").

## Open questions

1. `review-code` ordering hazard: it writes fixes to the same code the other review steps read.
   Does this require review steps to be individual nodes with explicit edges? (Sub-question left by
   the resolved node-definition answer above.)
2. Claim unit: if a node is a skill run rather than a whole story, a story becomes a *chain* of
   nodes. The "decided" sections above talk in story-units throughout — "never plan more than 2
   stories ahead," `maxAttemptsPerStory`, `pipeline/<runId>/<id>` branch naming, the park/resume
   boundary ("an agent's output"). Each of these needs to say which it operates on: the
   story-chain or the individual node. "Claim a node" and "claim a story" are different dispatch
   policies; decide before Path step 2 machinery is built.
3. Merge-queue test scope: full suite per merge, or affected-only (`nx affected`) with a
   periodic full run?
