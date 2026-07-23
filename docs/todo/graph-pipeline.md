# Plan: dependency-graph pipeline with parallel opencode agents

The pipeline is a general graph executor. `chainId` is the structural field the machinery
reads — story, epic, sprint, and all project-specific vocabulary live in node metadata the
machinery never reads. Tests are decoupled from the merge cycle: the merge cycle does fetch +
rebase + merge + fire a post-merge hook, and a hook failure is a standard `failed` outcome
riding the existing remediation path. The planner's prompt carries immutable graph rules
alongside project-specific semantics. The pipeline knows nothing about stories, epics, BMAD
phases, or sprints — those live in project-authored guidance the planner reads. See Pipeline vs.
project-specific customization.

## Glossary

Terms used throughout this plan. Cross-references point to the section where each is
developed in depth.

### Architecture generations

- **gen-2** — the predecessor pipeline: a sequential story loop driven by n8n workflows
  (`Develop Epic`, `Develop Story (Playbook)`, `BMAD Session (OpenCode)`). Its state
  files and engines are not inherited.
- **gen-3** — the pipeline this plan defines: a general graph executor with parallel
  opencode agents supervised by level-triggered dispatcher passes.

### Graph structure

- **Work graph** — a directed acyclic graph of nodes connected by `dependsOn` edges,
  emitted by the planning agent. Replaces gen-2's ordered sequence. See *Graph management
  rules*.
- **Node** — one skill run (or atomic CLI command). The unit of claiming, supervision, and
  retry. Carries a spec (skill, agent, prompt, deadline, `dependsOn`, `mergeTo`,
  `metadata`).
- **Chain** — a sequence of nodes composed for a unit of work, connected by `dependsOn`
  edges. A chain is a total order (all nodes modify files) and shares one branch.
- **`chainId`** — the structural identifier the machinery reads. Branch names are derived
  from it (`pipeline/<runId>/<chainId>`); cross-chain edges are validated against it.
  Story, epic, sprint, and all project-specific vocabulary live in `metadata`, which the
  machinery never reads.
- **`dependsOn`** — the edge field in a node spec. Within a chain: the previous node.
  Cross-chain: a merge-point node only.
- **`mergeTo`** — the optional field marking a node as a merge point. When present, its
  value is the project's configured trunk branch; the node's completion triggers the merge
  queue. Every chain's final node carries `mergeTo`.
- **Merge point** — a node carrying `mergeTo`. Its completion triggers the merge queue for
  the chain branch; its successors base on merged trunk, starting a fresh segment.
- **Segment** — the nodes on a chain branch between two merge points (or from the chain's
  start to its first merge point, or from a merge point to the chain's end). Same branch
  name, successive base commits.
- **Scope** — a project-specific grouping of chains (an epic, a BMAD phase, a research
  agenda). The machinery never tracks scopes; scope transitions are planner judgment. See
  *Scope lifecycle*.
- **Backlog** — whatever the project uses to describe upcoming work (epics files and
  sprint plan, a phase list, a research agenda). The planner reads it to know what work
  exists.
- **Finalization** — a scope-scoped chain of audit/review nodes (bug-hunt, trace, NFR,
  retrospective) composed after a scope's work chains merge. See *Scope lifecycle*.

### Dispatcher

- **Dispatcher** — the bookkeeping and supervision engine. Not a daemon; a short reconcile
  pass invoked by n8n on events. See *Dispatcher*.
- **Reconcile pass (pass)** — one invocation of the dispatcher: acquire the lock,
  reconcile, fold the inbox, poll in-flight sessions, re-evaluate ready nodes, claim and
  launch, write the heartbeat, exit. Seconds long. See *Reconcile pass*.
- **Fixpoint** — the state where a pass has nothing left to do: no inbox to fold, no
  exited sessions to classify, no ready nodes to claim. The pass drives durable state to
  fixpoint then exits.
- **Level-triggered** — a pass processes the entire current state, not "the event that
  woke it." Two events in quick succession: the first pass handles both, the second finds
  fixpoint. See *Dispatcher*.
- **Contentless invocation** — an invocation carries no payload; it is a "wake up." All
  information is durable on disk or in git before the invocation fires.
- **Claim** — the act of a pass taking a ready node for execution: journal the claim (the
  commit point), provision a sandbox, start the node's command. A claimed node's spec is
  frozen.
- **Ready node** — a node whose dependencies are satisfied (predecessor pushed, or merge
  landed) and for which sandbox capacity is available.
- **Frozen spec** — a claimed node's spec cannot be changed by replanning; replanning
  touches only unclaimed nodes.
- **Depth-first traversal** — the dispatcher descends into a node's dependents before
  starting unrelated siblings, bounded by the fairness counter. See *Graph management
  rules*.
- **Fairness counter / `fairnessBudget`** — caps consecutive chain-following claims so an
  independent ready node cannot starve. Defaults to `maxConcurrentSandboxes`. Resets on a
  yield.
- **Inbox** — a directory of files written by n8n's small workflows and the planning
  wrapper (question answers, merge-conflict reports, graph deltas, external events),
  consumed and deleted by passes. Written atomically (tmp + rename).
- **Journal (`journal.jsonl`)** — the append-only commit point for canonical pipeline
  state. Gen-3 schema: claims, outcomes, parks/resumes, merge events, `runner_error`
  events, pause/resume, policy decisions.
- **`graph.json`** — the derived view of graph state, rebuilt from the journal. Carries
  per-node metadata digests so routine readers read one file. Written atomically (tmp +
  rename).
- **`last-pass.json`** — the heartbeat file a pass writes as its last act under the lock
  (timestamp, duration, counts). The schedule tick alerts when it goes stale.
- **Policy block** — a JSON config file in `pipeline3/state/` read at the start of
  every pass. Holds capacity knobs (`maxConcurrentSandboxes`, `fairnessBudget`,
  `maxAttemptsPerNode`, per-node timeout, `opencodeVersion`, `trunkBranch`), the post-merge
  hook, and the per-claim install command.

### Planning

- **Planning run** — graph expansion executed on the devcontainer as an async opencode
  process, hosted by an n8n workflow. Not a graph node. Serialized by `planning.lock`. See
  *Planning runs*.
- **Graph delta** — the planning run's output: a list of operations (`addNode`,
  `updateNode`, `removeNode`, `abandonSegment`) applied at fold time. Not a snapshot, not
  a JSON patch. See *Graph delta format*.
- **Lazy composition** — the planner never composes past an information-producing node;
  the next segment is composed in a later planning run once the artifact is readable at
  `origin/<trunkBranch>`. See *Graph management rules*.
- **Information-producing node** — a node whose artifact determines what the rest of the
  chain should be (e.g. `create-story`). The planner must not compose past it.
- **Chain-composition guidelines** — the project-authored, agent-facing document
  (`chain-composition-guidelines.md`) the planner reads as standing context: chain
  patterns, skill catalog, decision rules, node-spec schema. See *Open question 1*.
- **`decision-policy.md`** — human-authored, agent-facing artifact that keeps questions
  rare. Read by agents during interactive steps.

### Supervision

- **Outcome classification** — deterministic rules first, LLM fallback for the
  COMPLETE/QUESTION/`failed` call. Ported from gen-2's `Parse OpenCode Response` +
  `BMAD Outcome`. See *Supervision*.
- **COMPLETE** — the agent finished its task successfully.
- **QUESTION** — the agent needs a human answer. The node is parked (a third status, not
  `success` or `failed`), the sandbox stopped, and the question-form workflow triggered.
- **`failed`** — the agent failed (non-zero exit with a completed last assistant message,
  or a timeout). Consumes an attempt against `maxAttemptsPerNode`.
- **INCOMPLETE** — a within-session recovery signal (not a node outcome): the LLM provider
  dropped the response mid-stream, the session is still alive, and
  `opencode run --format json --session <id>` resumes it. See *Stream-truncation recovery*.
- **Stream-truncation recovery** — the poll step issues an async continue, extends the
  deadline, and moves on. Does not touch the journal or consume an attempt.
- **Transcript** — the structured session data (messages, tool calls) pulled from a
  sandbox via `opencode export` after a session exits, before the sandbox is destroyed.
- **`runner_error`** — a journal event for machinery failures (non-zero exits, timeouts,
  API failures). Replaces gen-2's `runner-errors.jsonl`.

### Merge

- **Merge cycle** — the merge queue's unit of work: fetch, rebase, merge, push, fire
  post-merge hook. Runs on a sandbox created per cycle. Tests are not part of it. See
  *Merge cycle*.
- **Merge queue** — the n8n workflow that hosts the merge wrapper. Serialized by
  `merge.lock`, level-triggered by passes, capacity-gated by `maxConcurrentSandboxes`.
- **Trunk branch (`trunkBranch`)** — the project's integration branch (`main`, `master`,
  `develop`). Configured in the policy block. The merge cycle pushes to it, the planner
  reads from it, and `mergeTo` targets it.
- **Post-merge hook** — project-authored, configured in the policy block. Fires after a
  merge lands. A hook failure is a standard `failed` outcome riding the existing
  remediation path. A project with no tests configures no hook.
- **Conflict fingerprint** — a stable identifier (e.g. `merge-conflict-<chainId>`)
  journaled with merge-conflict events so recurrence is a query away. See *Conflicts are
  evidence*.
- **Resolution node** — a normal node (claimed, sandboxed, supervised) appended by a
  conflict-mode planning run to resolve a merge conflict in-place. Carries `mergeTo`.
- **Rework** — the alternative to in-place resolution: the conflict reveals semantic
  divergence, so the conflicted segment is abandoned (`abandonSegment`) and replacement
  nodes base on merged trunk.
- **`abandonSegment`** — a graph delta op: the fold journals the abandonment and the pass
  deletes the chain branch. `pending` nodes are removed; `completed`, `failed`, and
  `abandoned` nodes stay as historical record.

### Sandbox

- **Sandbox (worker sandbox)** — a single-use Daytona sandbox, created on demand at claim
  time, destroyed after collection. One per claim attempt. See *Worker sandbox design*.
- **Single-use** — a sandbox is used for exactly one claim attempt and destroyed when the
  session exits (after transcript pull). No warm pool, no reuse. See *Sandbox lifecycle*.
- **Snapshot** — the pre-built Daytona image (built via the Declarative Builder) that
  sandboxes are created from. Bakes the repo clone, dependencies, opencode, and toolchain.
  A cold-start optimization, not a freshness guarantee.
- **Tunnel proxy** — a local CONNECT-to-WebSocket proxy (`tunnel-proxy.js`) running inside
  the sandbox on `127.0.0.1:8888`. Bridges opencode's HTTP CONNECT requests to the relay's
  WebSocket `/tunnel` endpoint. Eliminates the need for a `baseURL` override.
- **Relay** — the custom NestJS service (`apps/sandbox-relay`) deployed to Railway that
  sandboxes reach (Railway is on the Essential Services allowlist). Provides a path-based
  reverse proxy and a WebSocket tunnel.
- **Essential Services allowlist** — Daytona Tier 1's egress policy: only pre-allowed
  domains (GitHub, npm, Anthropic, OpenAI, Docker registries, Railway, etc.) are
  reachable directly. `api.neuralwatt.com` is not on it, hence the relay/tunnel proxy.
- **`maxConcurrentSandboxes`** — the policy knob capping live sandboxes (including the
  merge cycle's sandbox). A claim or merge trigger that would exceed it defers to the next
  pass.
- **`maxAttemptsPerNode`** — the policy knob capping retry attempts for a failed node.
  Merge-queue fallbacks do not consume node attempts.
- **`opencodeVersion`** — the policy knob pinning the opencode version installed in
  sandboxes and on the devcontainer. One source of truth for both install paths.

## Why this shape

n8n executes the nodes of one workflow execution sequentially, even when branches are wired "in
parallel" (verified in gen-1, recorded in the pipeline doc). But n8n runs *separate executions*
concurrently without any special setup — useful for small independent workflows, and irrelevant
for supervision once no long-lived supervisor exists. The discarded stage-group plan worked
around the sequential-execution constraint by doing OS-level concurrency inside a single node;
this plan removes the constraint instead: agents never converge on an n8n node at all, so there
is nothing to join.

The architecture inverts. Today n8n is the engine driving a sequential story loop and the
pipeline files are the record. Here the state is the engine:

- **A work graph, not a list.** A planning agent emits nodes — one skill run each — with
  explicit `dependsOn` edges (a directed acyclic graph) instead of an ordered sequence. A
  chain is a sequence of nodes composed for a unit of work, not stamped from a fixed sequence
  (see Graph management rules); review steps are nodes of their own with explicit ordering edges.
  Any node whose dependencies are satisfied is claimable. Step and chain ordering — not n8n —
  was the real obstacle to parallelism; making dependencies explicit is planning work, not
  plumbing work. A chain itself is a total order — all nodes are assumed to modify files and a
  chain shares one branch (see Graph management rules) — so parallelism is across chains, not
  within one; node granularity buys per-node supervision, retry, and composition flexibility,
  not within-chain latency.
- **A dispatcher, not a loop.** The dispatcher is not a resident process. Each invocation is a
  short reconcile pass, serialized by a lock: read all durable state, drive it to fixpoint
  (poll running work, fold results, update graph state, claim ready nodes, start workers), exit
  in seconds. A completion may unblock dependents, which become new claims, which produce new
completions — the graph unfolds depth-first (descends into a node's dependents before
starting unrelated siblings), not in planned waves. Depth-first is bounded by a fairness
counter so an independent ready node cannot starve (see Graph management rules). Passes are invoked by n8n on events
  (schedule tick, merge complete, question answered) — a local process call; n8n and the
   dispatcher live on the same devcontainer, and overlapping invocations simply wait on the
   lock and coalesce. Supervision is part of the pass itself: each pass polls every in-flight
  agent session, classifies any that exited, and acts — there is no per-worker supervisor
  process anywhere. Canonical pipeline state (journal, graph.json) has at most one writer at a
  time — the pass holding the lock; nothing else writes it. Each claim launches one opencode
  agent in a single-use Daytona sandbox created on demand from a pre-built snapshot.
  Machine-level isolation eliminates the collision
  surfaces that same-machine concurrency creates
  (discovered in session-history analysis): cross-process homicide (`pkill -f` can't cross machine boundaries), fixed port
  binding (each sandbox has its own port space), shared test databases (each sandbox runs its
  own Postgres), and shared-file corruption (pipeline state files are per-sandbox). The
  opencode identity-collision risk is also removed — separate machine, separate storage. Epic 6
  built sandbox provisioning for the product; the pipeline copies the discipline patterns, not
  the code.
- **Git is the convergence point.** Every agent pushes a branch; a serial merge queue
  (rebase → merge) integrates one branch at a time. Integration is serialized, work is
  not — integration takes seconds, skill runs take hours. The whole merge cycle — fetch,
  rebase, merge, push — runs on a sandbox created per merge cycle,
  not on the devcontainer: the devcontainer already runs n8n, the dispatcher, the human's
  dev servers, and the human's Postgres, and its checkout is the human's working copy —
  pipeline git operations never touch it. The n8n workflow runs a merge wrapper that drives the
  merge cycle on the sandbox via the Daytona session API — same create-on-demand path as a
  node claim, held for seconds not hours — and the push to `origin/<trunkBranch>` is the merge cycle's
  commit point: everything before it is sandbox-local and disposable (see Merge cycle under
  Worker sandbox design). A branch whose head is already an ancestor of the trunk branch short-circuits at
  the start of the merge cycle: nothing to merge — the merge cycle just deletes the branch —
  so an empty-diff completion or a conflict that evaporated while its resolution was planned
  costs one git check instead of a full serialized merge cycle. **Testing is not part of the
  merge cycle**: the pipeline merges branches without running tests. A
  post-merge hook — project-authored, configured in the policy block — fires after the merge
  lands; if the hook fails, the failure is a standard `failed` outcome that rides the existing
  remediation path (conflict-mode planning run → resolution node or rework — see
  Merge-conflict resolution). The pipeline does not assume tests exist; early-phase projects with
  no test suite simply merge. See Pipeline vs. project-specific customization.
- **n8n keeps only small workflows:** the schedule tick that invokes the dispatcher, the
  question form + ntfy flow, the merge queue, the planning-run host, error notification, and
  sprint status reporting. Nothing per-worker, and nothing whose survival matters: the
  merge queue and the planning host block on commands for minutes, but canonical state never
  depends on an n8n execution surviving. n8n never writes canonical pipeline state — its
  workflows write only inbox files (a question answer, a merge-conflict report, an external event) that a pass folds in.
  There is no event-ingest webhook: every result is durable on disk (or in git) before the
  dispatcher is invoked, and every invocation is a contentless "wake up".

## Graph management rules

- **Node = one skill run** (project-agnostic — any skill, or another atomic action like a CLI
  command). A chain is a sequence of nodes connected by `dependsOn` edges. What a chain is
  *for* — a story, a finalization, a PRD draft, a research task — is project-specific metadata
  the machinery never reads (see Pipeline vs. project-specific customization).
- **Chains are composed per unit of work, not stamped from a template.** The planning run reads
  the work's content plus a human-authored, agent-facing guidelines document — the successor of
  the gen-2 playbook sequence, demoted to a suggestion and authored fresh (its content is
  seeded from the gen-2 step sequence; the planner never reads `playbook.json` or any other
  gen-2 file); same category as `decision-policy.md` —
  and decides which nodes the chain gets. Units of work differ: a unit whose substance is
  human-performed setup (e.g. the human configures credentials) gets no e2e-test node, because
  there is no automatable behavior to test. The guidelines say when a step applies, not that it
  always does. Human involvement needs no special node type — a normal skill run (e.g.
  dev-story) reads the work, halts with a question, and rides the standard
  QUESTION → park → resume path.
- **Chains share a branch and merge at merge points.** A chain works on one branch
  (`pipeline/<runId>/<chainId>`). A node spec may carry `mergeTo: <trunkBranch>` — the target
  is the project's configured trunk branch (see `trunkBranch` in the policy block; default
  `main`) — marking a merge point: when that node completes, the pass triggers the
  merge queue for the chain branch. Every chain's final node carries `mergeTo` (the guidelines
  instruct the planner; the dispatcher's rule is just "merge when marked", no chain-end special
  case — a final node without `mergeTo` is a planning error rejected at fold time). A mid-chain
  merge point exists to unlock a dependent chain early: e.g. a create-story node whose
  artifact specifies schemas and contracts merges right away, so another chain can start
  implementing against the artifact while this chain's own implementation is still running. Like
  the rest of the spec, `mergeTo` freezes at claim; replanning toggles it only on unclaimed
  nodes.
- **All nodes are assumed to modify files, so a chain is a total order.**
  Two file-modifying nodes can never run concurrently on a shared branch — both would push to
  the same head — and gen-3 keeps no read-only node class to except from that rule. Within a
  chain, `dependsOn` is simply the previous node; the only branching in the graph is
  cross-chain, at merge points. Node-spec field names are camelCase (`dependsOn`, `mergeTo`,
  `maxAttemptsPerNode`, `chainId`) — the state is JSON written and read by JS code.
- **`chainId` is the structural identifier the machinery reads; story, epic, and all
  project-specific vocabulary are metadata.** The machinery derives branch
  names from `chainId`, validates cross-chain edges against `chainId`, and scopes
  `abandonSegment` to `chainId`. Story, epic, sprint, phase, and any other project-specific
  grouping live in a `metadata` dict on the node spec — the planner writes them, the machinery
  never reads them, and they appear in `graph.json` digests for reporting and display only. A
  node with no story in its metadata is a node whose chain isn't story-shaped; everything works.
- **Basing and readiness follow the merge points.** The successor of an unmarked node is ready
  when the predecessor's head is pushed and bases on it — same branch, same segment. The
  successor of a merge-point node is ready when the merge *lands* and bases on merged trunk,
  starting a fresh segment: the merge queue deletes the merged branch and the successor's claim
  recreates `pipeline/<runId>/<chainId>` from the trunk branch — same name, new segment; the journal records
  each claim's base commit. Cross-chain `dependsOn` edges may only target merge-point nodes,
  keeping "cross-chain dependencies gate on a merge" an invariant rather than a convention — an
  edge to an unmarked node is rejected at fold time. A failed mid-chain merge blocks the chain
  like any merge failure: journaled as a conflict event; successors simply never become ready
  until it is resolved (resolution is itself a graph node — see Merge-conflict resolution).
- **Actively managed graph:** never expand more than ~2 chains' worth of unmerged chain ahead.
  The graph is expanded and replanned as work merges, not generated whole up front — by
  planning runs on the devcontainer, which are not graph nodes (see Planning runs under
  Dispatcher). The same rule applies within a chain: the planner never
  composes past an information-producing node — one whose artifact determines what the rest
  of the chain should be; create-story is the type case — and extends the chain in a later
   run once the artifact is readable at `origin/<trunkBranch>`. Composing a whole chain up front from
  the backlog entry alone plans speculation, and depth-first claiming makes the mistake
   irreversible: the pass that folds the artifact-producing node's completion claims the
   pre-planned successor in the same pass, leaving no window for a replan to remove a node the
   artifact just revealed as unnecessary. Lazy composition closes that gap with existing
   machinery — no successor exists yet, so the ready-node frontier runs low and the standard expansion
   trigger fires with the artifact now on the trunk branch. A claimed node's spec is frozen; replanning
  touches only unclaimed nodes.
- **Depth-first traversal, bounded:** the dispatcher descends into a
  node's dependents before starting unrelated siblings — depth-first is the default because it
  unblocks dependents fast. But unbounded depth-first starves: a chain that keeps producing
  ready successors can fill the pool indefinitely while an independent ready node waits. A
  fairness counter caps consecutive chain-following claims: after a node completes, the pass
  claims its dependents by default and increments the counter; when the counter reaches
  `fairnessBudget` and an independent ready node exists, the pass claims the independent node
  instead and resets the counter. `fairnessBudget` defaults to `maxConcurrentSandboxes` (so
  one full pool-fill of chain-following, then a yield). When no independent node is ready, the
  counter increments but the yield never triggers — behavior is identical to pure depth-first.
  The counter is per-pool, not per-chain; it resets on a yield. Any independent ready node is
  guaranteed to be claimed within `fairnessBudget` node completions — starvation-freedom by
  construction, with   one integer of added state. This guarantee is scoped to ready **nodes**:
  a merge trigger is an action, not a ready node, so the counter does not protect it — merge
  triggers are protected by the merges-before-claims ordering in step 6 (verified spike
  2026-07-23: the counter provides zero protection for merge triggers under steady-state
  contention — see `docs/todo/spike-merge-trigger-starvation.md`). Extending the counter to
  count merge-trigger deferrals was considered and rejected: it breaks the level-triggered
  invariant by adding history-dependent escalation, with no clean reset semantics and no
  compositional benefit over the merges-first ordering.
- These rules — and the retry/timeout/capacity knobs (`maxAttemptsPerNode`, per-node timeout,
  `maxConcurrentSandboxes`, `fairnessBudget`, `opencodeVersion`, `trunkBranch`) — are dispatcher claim-time
  policy: plain code plus a small policy block in gen-3's own state, defined fresh, not
  inherited from the gen-2 playbook's `policy`. The policy block is a config file (JSON in
  `pipeline3/state/`) read at the start of every pass, so capacity knobs are tunable
  without a code change or restart — the next pass picks up the new value. `opencodeVersion`
  pins the opencode version installed in sandboxes and on the devcontainer — one source of
  truth, read by both install paths. `trunkBranch` names the project's integration branch —
  the branch the merge cycle pushes to, the planner reads from, and `mergeTo` targets
  (default `main`; a project whose trunk is called `master`, `develop`, or anything else
  configures it here so no code assumes the literal string `main`). Do not pick technology
  expecting it to enforce them.

## Pipeline vs. project-specific customization

The pipeline is a general graph executor. It knows nothing about BMAD, stories, epics, sprints,
phases, or any project-specific workflow. The separation is explicit:

**Pipeline machinery (immutable, pipeline-shipped):**
- Graph, chains, `chainId`, `dependsOn`, merge points, claim/dispatch, supervision, journal
- Graph-shape rules: chains are total orders, cross-chain edges target merge points, every
  chain's final node carries `mergeTo`, the graph stays acyclic
- The merge cycle: fetch + rebase + merge + push + fire post-merge hook
- Retry, timeout, capacity knobs (`maxAttemptsPerNode`, `maxConcurrentSandboxes`,
  `fairnessBudget`, `opencodeVersion`, `trunkBranch`)
- The planner's immutable base rules: "compose chains, don't plan past information-producing
  nodes, mark merge points only where a dependent exists, every chain's final node carries
  `mergeTo`"

**Project-specific guidance (project-authored, the planner reads):**
- What a chain is *for* — a story, a finalization, a PRD draft, a research task — and the
  vocabulary (story, epic, sprint, phase) that describes it
- Which nodes a chain gets — the skill catalog (with per-skill default deadlines),
  include/skip conditions, within-chain ordering advice for review nodes, merge-point
  placement advice
- The post-merge hook (if any) — what to run after a merge lands, configured in the policy
  block; a project with no tests configures no hook
- The trunk branch name — what the project calls its integration branch (`main`, `master`,
  `develop`), configured in the policy block as `trunkBranch`; the machinery reads it, the
  value is the project's
- The per-claim install command (if any) — what to run in the node's sandbox before the
  node's command, configured in the policy block alongside the post-merge hook. The machinery
  runs whatever command is configured (or skips if none); a project with no install step —
  doc-only work, early-phase projects — configures none. Same pattern as the post-merge hook:
  machinery runs the command, the project says which. The install-failure classification
  (park with QUESTION, do not retry — see Supervision) is machinery and applies regardless of
  which package manager failed
- The snapshot's build config — base image, system packages, package-manager install, chown;
  project-authored (the machinery creates sandboxes on demand from the snapshot and asserts
  the opencode version; what gets baked is project-specific — a non-JS project bakes a
  different toolchain)
- The backlog shape — epics files and sprint plan, or a phase list, or a research agenda;
  whatever the planner reads to know what work exists
- `decision-policy.md` — human-authored, agent-facing; what keeps questions rare

The machinery reads `chainId` and node ids. It never reads `metadata.story`, `metadata.epic`,
or any project-specific field. The planner reads the project-specific guidance and reasons in
its vocabulary; the machinery enforces graph-shape rules. A project that has no stories
(BMAD phases 1-2: brainstorming, PRD, architecture) composes chains for its doc-writing work
the same way a story project composes chains for code — the machinery doesn't care what the
files contain.

## Scope lifecycle

Gen-3's scope is not limited to story development: the pipeline runs any unit of work the
planner composes chains for — epic development, post-epic finalization, early-phase doc work
(BMAD phases 1-2: brainstorming, PRD, architecture), research tasks. No new machinery: scope
transitions are planner judgment riding the existing triggers, and finalization is an ordinary
chain.

- **Scope selection is the planner's, in backlog order.** Machinery never tracks scopes. The
  backlog (whatever the project uses — epics files and sprint plan, a phase list, a research
  agenda) is already in the planner's context, and when a scope's chains run out the
   ready-node frontier runs low — the existing expansion trigger fires and the
   planner continues down the backlog. No new trigger, no new authority; a human override
   ("skip to epic 7", "start the architecture phase") is a replan instruction through the inbox
   like any other.
- **Finalization is a scope-scoped chain.** The chain vocabulary generalizes: a chain belongs
  to a unit of work or to a scope's finalization (node specs carry scope membership in
  `metadata`; the machinery-derived branch is per chain, e.g.
  `pipeline/<runId>/scope-<n>-finalization`). Its nodes are ordinary skill runs —
  `bmad-bug-hunt`, `bmad-testarch-trace`, `bmad-testarch-nfr`, deferred-work pruning
  (`bmad-quick-dev`), `bmad-retrospective`, test-plan revision (`bmad-testarch-test-design`),
  project-context cleanup (`bmad-agent-architect`) — composed per the guidelines, which seed
  from the manual flow the way story chains seed from the gen-2 step sequence. The first
  node's `dependsOn` fans in to every work chain's final merge-point node — legal under the
  existing cross-chain-edges-target-merge-points invariant — so finalization starts only after
  the scope's last chain merges, and the chain is composed late, once those final nodes exist.
- **Finalization is full of information-producing nodes, so lazy composition applies with
  force.** A trace FAIL gets a fix node appended in the next planning round; bug-hunt findings
  get remediation nodes; deferred-work pruning asks when a finding is not a stale deferral and
  rides the standard QUESTION park. The sequence unfolds across several planning rounds by
  design.
- **Transitions are automatic and notified.** Entering finalization and entering the next scope
  need no human gate. The pass that folds a delta opening a finalization chain, or that first
  claims a node in a new scope, journals the transition and fires an ntfy notification (a small
  n8n workflow, same tier as error notification) — informational, never blocking. Pause
  remains the intervention tool.
- **Overlap with the next scope is planner judgment, not a machinery rule.**
  Finalization audits the scope's merged whole, and
  next-scope merges landing mid-audit move the target — but gen-3 does not reintroduce a
  between-scopes quiet point in machinery. The guidelines advise when to hold next-scope
  composition back (an in-flight trace or NFR audit whose evidence next-scope merges would
  invalidate) and when overlap is safe (next-scope early work rarely disturbs a scope
  audit); the planner decides per scope. Guideline adherence, not construction — the same
  stance as review ordering.
- **The retrospective node does not conflict with the self-improvement exclusion.** That
  decision excluded gen-2's reflect machinery (ledger, amendments, trends);
  `bmad-retrospective` is an ordinary skill run producing a repo artifact, claimable like any
  other node.
- **Early-phase doc work (BMAD phases 1-2) is ordinary chains.** A brainstorming session, a
  PRD draft, an architecture document — each is a chain of doc-writing nodes, composed per the
  guidelines, running on the same machinery. Every node modifies files (markdown), so the
  total-order chain assumption holds. The merge cycle integrates the branch without tests (the
  post-merge hook is absent or a no-op for doc-only work). Sequential composition is fine: PRD
  then architecture then epics, one chain or a sequence of chains, as the guidelines advise.
  The pipeline does not special-case doc work.

## Dispatcher

The dispatcher is the bookkeeping *and supervision* engine. It is not a daemon and not a
resident event loop — it is a short reconcile pass: invoked, it acquires the state lock, drives
durable state to fixpoint, and exits in seconds. There is no long-lived supervisor anywhere in
the design; watching running agents is the poll step of every pass. "Woken by n8n" means
*invoked*: n8n runs on the same devcontainer (under pm2, started by `.devcontainer/start.sh`)
and launches a pass as a local process call (Execute Command, or HTTP to localhost). No network
hop, no tunnel, no listener waiting on a socket. Multiple events in short succession launch
multiple passes; they wait on the lock and coalesce.

Two rules make overlapping invocations safe:

- **Invocations carry no payload.** An invocation is a contentless "wake up". All information
  is durable before the invocation fires: n8n writes the question answer to an inbox file, then
  invokes; "merge complete" is visible in git — and a merge conflict is durable as an inbox
  report — before the merge-queue workflow invokes; a
  finished agent's work is visible in git (its pushed branch) and in the Daytona API (its
  exited session) before any pass looks. Nothing can be lost — the worst case for a redundant
  invocation is a pass that finds nothing to do.
- **Passes are level-triggered, not edge-triggered.** A pass never processes "the event that
  woke it"; it reads the entire current state and processes everything that state implies. Two
  events in short succession: the first pass to take the lock handles both; the second finds
  fixpoint already reached and exits. Supervision obeys the same rule: a pass doesn't wait for
  completion signals, it polls what is actually running.

Liveness comes from the n8n schedule tick (every few minutes): completions are *detected* at
tick cadence, not pushed. Minutes of detection latency is noise against skill runs measured in
hours; the tick interval is a policy knob to tune in Path step 4.

### Reconcile pass

Each invocation:

1. **Acquire the lock** — blocking `flock` on a lockfile. Passes are seconds long, so waiting
   is fine. `flock` releases automatically when the process dies, so a crashed pass cannot
   leave a stale lock.
2. **Reconcile** — cross-check the journal's in-flight and parked entries against reality:
   sandboxes carrying the pipeline scope label (Daytona API), pushed branches (git), and the
   planning and merge locks (see Planning runs and Merge cycle). Destroy
   sandboxes no journal entry accounts for; collect work whose branch is pushed but whose
   outcome was never journaled (a pass died mid-fold — the poll step below picks it up
   naturally).
3. **Fold the inbox** — consume files written by n8n's small workflows (question answers,
   merge-conflict reports, external events) and by planning runs (graph deltas, validated at fold time — see Planning
   runs): append to the journal first (the append is the commit point), then
   regenerate `graph.json` (a derived view, rebuildable from the journal if a crash lands
   between the two writes).
4. **Poll in-flight sessions (supervision)** — for each running claim, check its session
   command via the Daytona API. Still running and inside its deadline → nothing. Past its
   deadline → terminate the session command, journal a `runner_error` event, and handle per
   retry policy (a timeout is a failure by default — see Timeout policy under Supervision; the
   node is re-claimable on a fresh sandbox and session if attempts remain, not continued).
   Exited → pull
   exit code and logs, classify, act (see Supervision below). A stream-truncation signal
   (session still alive, response cut mid-stream) is handled here too: issue an async
   `opencode run --format json --session <id>` continue, extend the deadline, do not journal an outcome. An
   in-flight planning run or merge cycle is polled the same way, via its lock instead of the
   Daytona API (see Planning runs and Merge cycle).
5. **Re-evaluate** — which nodes are now ready? (Unmarked chain predecessor pushed, or the
    predecessor's merge landed — a merge-point predecessor in-chain or cross-chain; capacity
    available.)
6. **Merge triggers, then claim and launch** — the two sub-operations that
     compete for the same capacity pool are ordered: pending merge triggers are
     evaluated **before** node claims, so a merge gets first claim on capacity
     freed this pass (verified spike 2026-07-23: under steady-state contention
     with 6 chains and cap=5, claims-first ordering delayed merges by up to 184
     ticks ≈ hours with 264 capacity deferrals; merges-first ordering reduced
     the max wait to 3 ticks ≈ minutes with only merge-lock-serialization
     deferrals — see `docs/todo/spike-merge-trigger-starvation.md`). Because
     merge cycles complete in seconds and run one-at-a-time under `merge.lock`,
     ordering them first does not materially delay node claims. Merge triggering
     is level-triggered: a completed merge-point node whose branch has neither
     merged nor a pending conflict report, with the merge lock acquirable
     **and capacity available** (the merge cycle's sandbox counts against
     `maxConcurrentSandboxes` for its duration — see Honest costs — so a merge
     trigger is gated by the same cap as a node claim; if the cap is full, the
     trigger is deferred to the next pass, like a deferred claim), (re)triggers
      the merge-queue workflow — a merge cycle killed mid-run is re-run by the
      next pass, not lost (see Merge cycle). Only `completed` merge-point nodes
      trigger the merge queue — a `failed` node's branch is never merged (verified
      spike 2026-07-23: this is the safety property that makes unconditional push
      safe — broken partial work landing on the chain branch is quarantined by
      the merge gate, not by withholding the push; see
      `docs/todo/spike-push-on-failure.md`). Then claim ready nodes depth-first
     with the fairness bound (journal the claim), create and provision a
     single-use sandbox (capacity permitting — the `maxConcurrentSandboxes`
     cap; see the per-claim recipe under Worker sandbox design), `git checkout`
     to the claim's base, start the node's command via the Daytona session API
     with `runAsync` (appending `</dev/null` — see the per-claim recipe; without
     stdin redirection opencode hangs on the PTY) — the pass does not wait for
     it. If ready nodes are running low (the plan-2-ahead policy) and no
     planning run is in flight, journal the launch and trigger the
     planning-host workflow (see Planning runs). Claiming and planning launches
     are skipped entirely while the pipeline is paused (see Pause/resume) —
     supervision, folding, and merge triggering (finishing claimed work) still
     run.
7. **Write the heartbeat, release the lock, and exit** — the pass's last act under the lock
   is an atomic write (tmp + rename, like `graph.json`) of `last-pass.json`: timestamp,
   duration, and counts of claims, folds, and polls. The schedule tick alerts when this file
   goes stale (see The machinery observes itself under Supervision). Agents still running
   unwatched, by design; the next pass picks them up.

The recursion survives across passes: a completion is detected by a pass, the fold unblocks
dependents, and the same pass claims and launches them. Workers stay busy because every pass
claims everything claimable — there is just no resident process between passes.

### Supervision (in-pass)

What gen-2's `BMAD Session (OpenCode)` did as a long-lived workflow, gen-3 does as the poll
step of every pass. The behaviors carry over; the workflow does not.

- **Outcome classification** — deterministic rules first (no `step_finish` event and no
  `text` events → UNKNOWN, exit code ≠ 0 with a completed last assistant message → `failed`,
  stream-truncation signal → INCOMPLETE recovery — see Stream-truncation recovery), LLM fallback
  only for the COMPLETE/QUESTION/`failed` call. The rules and prompt are ported from gen-2's
  `Parse OpenCode Response` + `BMAD Outcome` into a small JS module; a classification call adds
  a few seconds to a pass, which stays within the seconds-long budget (verified spike 2026-07-23:
  avg 4.3s, median 2.7s, max 15.8s per call — see `docs/todo/spike-lock-hold-time.md`). If N
  sessions exited since the last pass, the pass makes N calls — all under the lock, so a batch of
  exits stretches the budget (measured: 16.0s for N=5 — well within the seconds-long budget). Not
  a performance concern but a correctness one if lock hold time blocks merge triggering or
  question-resume long enough to matter functionally — the spike confirmed none of the five
  blocked operations (merge triggering, question-resume, second-pass coalescence,
  paused-pipeline resumes, planning-run triggering) suffer a functional defect at this lock-hold
  duration, all absorbed by the hour-scale nature of skill runs and the level-triggered design.
  The classification LLM call has an explicit timeout (15s) and classifies as UNKNOWN on timeout
  failure (parking the node for human review rather than silently merging) — without this bound,
  a slow or retrying LLM response is the unbounded risk that could push lock-hold from seconds
  into minutes. A budget guard (defer remaining exits as `classification_deferred` if lock-hold
  exceeds 45s, let a follow-up pass pick them up) is the documented fallback if production data
  shows lock-hold exceeding the budget; it is not needed at the measured 16s. The classifier reads the
  JSON event stream (`--format json` output) — `step_finish` with `reason: "stop"` is the clean
  completion signal, `text` events carry the agent's output, `error` events carry provider
  errors. Every classification journals its evidence with the outcome event: the deterministic
  rule that fired, or — for the LLM fallback — the verdict, a one-line rationale from the model,
  and the judged JSON event excerpt (tail-truncated to a few KB). The worst classification
  failure — a QUESTION read as COMPLETE, silently merging half-done work — is auditable only if
  the classifier's input and reasoning are on record; gen-2 got this for free from n8n execution
  history, gen-3 journals it deliberately. An install-step failure (non-zero exit from the
  package-manager install before the node's command ran) is a distinct signal: it parks the node
  with QUESTION carrying the install output, not a generic `runner_error` to retry — the same
  install against the same missing system dep would fail identically, so retry burns attempts and
  quota for nothing. The human either updates the snapshot's build config (add the system package)
  or removes the dep, then answers the park; the resumed session re-runs the install and
  proceeds. This keeps the snapshot's build config a human-authored artifact and makes the repo
  outgrowing it a surfaced decision rather than a silent retry loop. Note what is *not* in this
  list: INCOMPLETE
  is not a node outcome (see Stream-truncation recovery below).
- **Stream-truncation recovery** (not a node outcome). INCOMPLETE is a within-session recovery
  signal inherited from gen-2: the LLM provider drops the response mid-stream, the opencode
  session is still alive, and `opencode run --format json --session <id>` resumes it from where it left off.
  It is handled entirely inside the poll step — the pass issues the async continue, extends the
  deadline, and moves on. (For a sandbox session the continue goes through the Daytona
  session API; for a planning run it re-triggers the planning-host workflow in resume mode,
  so the leg runs under the launch wrapper — see Planning runs.) It does not touch the journal, does not appear in `graph.json`, and
  does not consume `maxAttemptsPerNode`: a provider stream-drop is not a node attempt. The
  trigger is a two-signal check (verified spike 2026-07-22, see
  `docs/todo/spike-midstream-resume.md`): exit code is non-zero (signal kill: 143 for SIGTERM,
  137 for SIGKILL) OR exit code 0 without a `step_finish` event in the JSON output, AND the
  last assistant message in `opencode export <sessionID>` has `time.completed` unset — not a
  catch-all for anything odd. Independently of the exit code, the dispatcher also scans the JSON
  event stream for `type=error` events: these are provider errors (API failures, connection
  drops, auth errors) that opencode emits as structured signals, and they may appear with either
  exit code 0 or non-zero. An error event that left the session mid-stream warrants INCOMPLETE
  recovery (resume the session) rather than treating the outcome as `failed` — consistent with
  the outcome-classification note that `error` events carry provider errors. A non-zero exit with
  a completed last assistant message is a real failure (`failed`), not INCOMPLETE; a session past
  its deadline is handled by the timeout policy, not relabeled INCOMPLETE.
- **Timeout policy** (open). A session past its deadline is
  terminated by the pass, journaled as a `runner_error`, and handled per retry policy. Whether a
  long-running step should *survive* its per-node timeout by auto-continuing — the gen-2
  behavior, there a workaround for the same provider stream-drop issue — is a real policy
  question gen-3 should decide explicitly, not inherit through an INCOMPLETE label. If
  auto-continue on timeout is wanted, it is a timeout-policy knob (a deadline extension with a
  bound), not a relabeling of the outcome. The default until that decision: a timeout is a
  failure, counted against `maxAttemptsPerNode` like any other `failed` outcome.
- **Question surfacing** — QUESTION journals the node `parked` (a third status — not `success`,
  not `failed` — so a question is never misread as a defect), stops the sandbox, and triggers
  the small n8n question-form workflow (Wait-form + ntfy with the resume URL). The canonical
  parked state is the journal entry; the n8n suspension is only the human-facing surface, so if
  it is ever lost a pass can re-fire it from the journal.
- **Machinery evidence** — non-zero exits, timeouts, and API failures are journaled as
  `runner_error` events in the gen-3 journal (there is no separate `runner-errors.jsonl`).
- **The machinery observes itself** — a pass cannot journal its own death, so dispatcher
  health has its own small surface, separate from canonical state. Each pass writes its
  stdout/stderr to a per-pass log file (a crashed pass leaves its partial log as the record of
  what it was doing) and, as its last act under the lock, atomically writes `last-pass.json`
  (timestamp, duration, counts of claims/folds/polls — see Reconcile pass step 7). The
  schedule-tick workflow checks both after invoking the dispatcher: a non-zero pass exit
  triggers the error-notification workflow, and a `last-pass.json` older than a few tick
  intervals fires a "dispatcher stalled" notification. This is what surfaces a pass
  crash-looping on the same bad input — a malformed journal line, a bug in the fold — which
  would otherwise look exactly like an idle pipeline: ticks fire, passes die, nothing claims,
  nothing notifies.
- **Durability floor** — the agent's in-sandbox command pushes its branch as its last act, so a
  completed result is durable in git no matter what was or wasn't watching when it finished. The
  push is unconditional — it runs regardless of opencode's exit code, so a `failed` outcome's
  partial work is also on the chain branch, not lost with the sandbox (verified spike
  2026-07-23: the merge-trigger gate quarantines `failed` work — only `completed` merge-point
  nodes trigger the merge queue — so unconditional push is safe; see
  `docs/todo/spike-push-on-failure.md`). Push failure is not assumed away: the in-sandbox command
  retries with bounded backoff, and a permanent failure parks the node with the work preserved
  (see Branch push failure).
- **Transcript collection** — when a session exits with an outcome (COMPLETE or `failed` —
  every attempt, not only the last; a failed attempt's transcript is exactly the evidence a
  retry investigation needs), the collecting pass downloads the session transcript and the full
  command logs from the sandbox into the per-run
  directory on the devcontainer, before the sandbox is destroyed (single-use — see Sandbox
  lifecycle): destruction removes the sandbox copy, and the structured transcript (messages,
  tool calls) is evidence the JSON event stream cannot replace — this plan's own session-history
  analysis was built from transcripts that existed locally. Transcript collection runs under the
  lock (it is part of the poll step, step 4 of the reconcile pass) — this is defensible because
  pulls are bounded file operations (verified spike 2026-07-23: avg 1.6s per pull, no variance,
  no unbounded-retry risk — see `docs/todo/spike-lock-hold-time.md`), unlike LLM classification
  calls which carry tail latency. Moving pulls outside the lock would break the single-use
  sequencing invariant (destruction only after transcript pull) and require keeping the sandbox
  alive past the pass; they stay in-lock. A stream-truncation continue pulls
  nothing (the session is still going); a parked
  node's transcript survives the sandbox stop and is pulled after resume, when that session exits.
  Planning runs need no pull — their transcript and log file are already local. **Transcript
  mechanism (spike, 2026-07-22):** opencode v1.17.20 stores data in a SQLite database at
  `~/.local/share/opencode/opencode.db`. The transcript pull uses
  `opencode export [sessionID]` (produces JSON). The agent run emits `--format json` events to stdout, which the dispatcher parses for
  outcome classification and stream-truncation detection; `opencode export` is the correct path
  for structured session data (messages, tool calls) beyond what the event stream carries. See
  `docs/todo/spike-opencode-sandbox.md` (finding F3) and `docs/todo/spike-midstream-resume.md`.

Because no supervisor process exists, the failure mode a long-lived supervisor would create —
supervisor death on n8n restart — does not exist. A restart costs nothing but detection
latency: the next pass polls the same sessions the last one would have. There is no attach
mode, no execution-ID bookkeeping, no spool files.

### Planning runs (graph expansion)

Graph expansion is not a graph node. It runs on the devcontainer — the
same machine as the dispatcher — as an async planning run: a local opencode process that a
pass decides on, journals, and supervises like any other in-flight claim, and that a small
n8n workflow hosts. Every node in the graph is authored by
the planning agent per the chain-composition guidelines; the planning run itself is machinery,
so "agents author all nodes" holds with no machinery-generated node type and no bootstrap
exception. The devcontainer is the right home: planning reads the repo and the stories (at
  `origin/<trunkBranch>` — see Planning-run context) plus the graph state, writes no code, and needs no
isolation — a sandbox would add provisioning cost and buy nothing.

- **Async, never in-pass.** The pass journals the launch (with its deadline), triggers the
  n8n planning-host workflow — a local, contentless call; the journal already records the
  launch — and exits; passes stay seconds long. Running planning inside the pass would hold
  the state lock for the whole run and freeze supervision, folding, and claiming: the exact
  long-lived fragility this design removed.
- **Hosted by n8n.** The planning-host workflow is small: Execute Command runs the launch
  wrapper (blocking for the run's duration — the same pattern as the merge queue, which also
  blocks on commands for minutes), then invokes the dispatcher, so the delta folds immediately
  instead of at the next tick. The execution is a host and a latency optimization, not the
  record: canonical state is the journal, the planning lock, and the delta file. The run also
  becomes visible in n8n's execution list and inherits the error-notification hook. The trade
  accepted here: an n8n restart orphans the execution's child process — `child_process.exec()`
  registers no cleanup handler, so the child is reparented to init (PID 1) and keeps running,
  holding the planning lock (spike 2026-07-22, see
  `docs/todo/spike-execute-command.md`). The process-vanished recovery path therefore does
  **not** trigger on n8n restart in the initial version: the orphaned child holds the lock,
  the pass reads the lock as held (planner "still running"), and the pipeline stalls silently —
  exactly the failure mode to avoid. A parent-alive check in the wrapper (periodically test
  `kill -0 $PPID`, exit if the parent is gone, releasing the lock) is the fix, deferred to a
  follow-up. Until then, an n8n restart during a planning run requires manual intervention
  (kill the orphaned process by its recorded PID). Canonical state is never lost — the journal
  and the delta file are durable — but the lock must be cleared manually.
- **Serialized by its own lock.** The launch wrapper acquires a non-blocking `flock` on
  `planning.lock` and holds it for the run's lifetime. One primitive gives both mutual
  exclusion (at most one planning run in flight — no delta merging) and a liveness probe: a
  pass that can acquire the lock knows the planner is finished or dead (`flock` releases on
  process death), and a pass that cannot knows it is still running. Passes never launch a
  second planner while the lock is held, and a duplicate trigger — a redundant relaunch, a
  manual run — is harmless: a wrapper that cannot acquire the lock exits immediately.
- **Deterministic trigger, agent-authored content.** A pass triggers a planning run when ready
  nodes run low (the plan-2-ahead policy), when a chain blocks on a merge conflict with no
  response yet in the graph (conflict mode — see Merge-conflict resolution), or when it folds
  a question answer — the event most likely to change scope ("skip that",
  "we already have this"), invalidating unclaimed dependents the graph still carries. Answers
  are rare by policy, so firing on every one is cheap; the trigger needs no machinery
  judgment about whether the answer changed anything, and the worst case is an empty delta.
  Epic transitions add no fourth trigger: composing a finalization chain, or the next scope's
   first chains, rides the ready-node-frontier-low trigger (see Scope lifecycle).
  All gated by pause like node claiming. The trigger is machinery; which nodes and edges come
  out is the planning agent's judgment. A human "replan now" goes through the inbox like
  pause: folded by a pass, which journals and triggers the host workflow.
- **Context is a pinned contract** — a small per-run prompt plus a defined set of files the
  planner reads; see Planning-run context below.
- **Output is a graph delta in the inbox — written by the wrapper, never by the agent.**
  The planning agent writes the delta as an ordinary file to a
  scratch path inside the planning run's per-run directory (the path is given in the
  prompt's output contract), as its last act before finishing. The launch wrapper — code we
  control — is the only writer to the inbox: after the opencode child exits, the wrapper
  records the exit code, and only on exit 0 parse-checks the scratch file and promotes it
  into the inbox via tmp + rename on the same filesystem (atomic, like `graph.json` — verified
  under concurrent reads, spike 2026-07-22, see `docs/todo/spike-delta-promotion.md`), then
  exits, releasing the planning lock. Ordering: record exit code → promote → release lock —
  no window exists where the lock is released with a promotion still pending. A non-zero
  exit, a missing file, or an unparseable file promotes nothing; the scratch file stays for
  debugging. A partial write therefore cannot reach the inbox: how opencode's write tool
  writes files never matters, because promotion happens only after the process has exited
  and only for a file that parses. An empty delta (`ops: []`) is still written and still
  promoted — it distinguishes "planner considered and found nothing to change" from
  "planner never finished". Rejected transports: extracting the delta from the agent's
  stdout (`text` events) or from the session transcript — both mean parsing prose for an
  embedded JSON blob, with code-fence and formatting failure modes; a file at a contract
  path is a plain tool-write the agent already does reliably. Otherwise the wrapper mirrors
  the in-sandbox command template: isolated opencode storage (per the concurrency findings —
  the planner shares the machine, possibly with a live interactive session; opencode v1.17.20
  stores data in a SQLite database at `~/.local/share/opencode/opencode.db`
  (spike finding F3, 2026-07-22 — see `docs/todo/spike-stop-resume.md` F1 and
  `docs/todo/spike-opencode-sandbox.md` F3), so isolated storage per agent (separate `--dir`
  and storage path) prevents the schema-migration race documented in the concurrency
  experiment. Output captured to a per-run log file, the opencode child's PID and
  session ID recorded alongside the lock (a small status file the wrapper rewrites tmp +
  rename: PID for pass-side deadline termination — the pass signals the child, and the
  wrapper observes the exit, records it, promotes nothing, and releases the lock; session ID
  captured after the initial run via `opencode session list --format json`, as in the
  in-sandbox template, for resume legs), and the exit code recorded per leg. The planning
  run writes nothing else shared — not the journal, not `graph.json`.
- **Delta validation at fold time — all-or-nothing (verified spike 2026-07-23 — see
  `docs/todo/spike-delta-validation.md`).** Planning reads
  graph state at launch; by fold time nodes have completed or merged. The fold applies the
  delta's ops in order to a copy of current state under the state lock, then accepts or
  rejects the delta as a whole. Per-op rules: an `updateNode`/`removeNode` whose target is
  claimed, parked, completed, failed, or abandoned is stale — the claim hit the journal
  first and the spec is frozen; an `addNode` id must be fresh; an edge target must exist;
  `updateNode` must not set `id`, `chainId`, or `status` (immutable or machinery-derived);
  `addNode` must not set `status` (machinery sets it to `pending`). Whole-graph rules on the
  result: acyclic; cross-chain edges target merge-point nodes; every chain-final node
  carries `mergeTo`; `mergeTo` equals the configured `trunkBranch` (not truthiness — an
  explicit check against the policy value, so a `mergeTo` targeting any other branch is
  rejected); every chain remains a total order (a path). Any violation rejects the
  whole delta, because partial application can produce a graph no planner intended: a delta
  that removes chain node X and rewires X's successor around it, racing a pass that claimed
  X, would on partial application leave two nodes concurrently runnable on one chain branch
  — breaking the total order. Completions, by contrast, are tolerated naturally: an edge to
  a node that completed meanwhile is valid and simply starts satisfied. A rejection journals
  the delta, the failing op, and the rule that fired (evidence, like classification),
  deletes the inbox file, and needs no dedicated retry: the condition that triggered
  planning still holds (frontier still low, chain still conflict-blocked), so the standard
  level-triggered trigger re-fires a fresh run against current state. Stale-target
  rejections should be rare — the prompt already steers the planner toward additive changes
  near nodes likely to be claimed while planning runs. A delta that fails to parse is
  rejected the same way (defense in depth — the wrapper's parse check should make this
  unreachable). Journal ordering resolves any claim-vs-replan race — whichever hit the
  journal first wins. Claiming is not gated while a planning run is in flight: claimed specs
  are frozen, so gating would starve sandboxes for no added protection.
- **Supervised like a sandbox session — and every leg runs under the wrapper.**
  Same classification (COMPLETE / QUESTION / `failed`), same deadline
  enforcement (terminate, journal `runner_error`, retry policy), same stream-truncation
  recovery, with one difference from sandbox sessions: the pass never spawns the resume
  itself. A stream-truncation continue or a question-answer resume re-triggers the
  planning-host workflow in resume mode (passing the session ID recorded at launch, plus
  the answer text for a question resume); the wrapper re-acquires the planning lock, runs
  `opencode run --format json --session <id>`, and performs the same
  record-exit-code-then-promote sequence when the leg ends. A pass-spawned resume would be
  a detached child of a dead pass — nothing holding the planning lock, nothing recording
  the exit, and nothing to promote the delta; routing every leg through the host workflow
  keeps the wrapper the only inbox writer and keeps lock-based liveness supervision intact.
  Classification is deterministic in the common case: a promoted delta is the run's
  completion signal, and the fold's accept/reject is journaled with evidence either way —
  no LLM call needed. A recorded exit with no promoted delta classifies from the wrapper's
  log and exit code like a sandbox session: a question in the output → QUESTION park; a
  truncation signal → resume leg; otherwise a `failed` planning attempt (the output
  contract was violated), handled per retry policy. QUESTION parks and rides the standard
  form path — planning is the step most likely to need a human answer.
- **Process-vanished path.** Unlike sandbox sessions, a local planning run is a child of its
  host workflow's Execute Command. **Caveat (spike 2026-07-22, see
  `docs/todo/spike-execute-command.md`): n8n restart does NOT kill the child.** `child_process.exec()`
  registers no cleanup handler, and `process.exit()` does not signal children; on SIGTERM (the
  signal pm2 sends on restart) the child is reparented to init (PID 1) within ~1s, receives no
  signal, and continues running — holding the planning lock. The recovery design below
  assumes the child dies with its host; that assumption is disproved. In the initial pipeline
  version (no parent-alive check in the wrapper yet), an n8n restart during a planning run
  leaves an orphaned child holding the lock: the pass reads the lock as held and never
  relaunches, so the pipeline stalls silently. The fix — a parent-alive check in the wrapper
  (`kill -0 $PPID` periodically, exit if the parent is gone, releasing the lock) — is deferred
  to a follow-up. Until then, recovery from an n8n restart during a planning run is manual:
  kill the orphaned process by its recorded PID (the wrapper writes it alongside the lock),
  then the next pass acquires the lock and relaunches per retry policy. Canonical state (the
  journal, the delta scratch file) is never lost — only the lock must be cleared. The
  reconcile logic that *would* detect a vanished process — the journal says a planning run is
  in flight, the planning lock is acquirable, and no exit code is recorded for the current leg
  → the wrapper died mid-leg; relaunch per retry policy — is correct for the case it was
  designed for (a wrapper that genuinely died, releasing the lock on process death via `flock`'s
  automatic release). It does not cover the orphaned-child case, where the lock stays held.
  (Lock acquirable *with* a recorded exit code is a normal exit awaiting classification — a
  promoted delta, QUESTION, truncation, or `failed` — not a vanished process; without the
  exit-record discriminator, a QUESTION exit would be indistinguishable from a dead wrapper
  and get relaunched instead of parked.)

### Graph delta format

The delta is a list of operations — not a graph snapshot and not a JSON patch. A snapshot
makes the planner re-assert the whole graph, so anything that changed between launch and fold
(a claim, a completion) reads as planner intent to revert it — the fold cannot tell "the
planner wants this different" from "the planner's copy is stale" — and it would force the
planner to author machinery-derived state (status, attempts, base commits) it is barred from
touching. A generic JSON patch is path-based against a document that has moved — array
indices shift under concurrent mutation. Operations name their target by node id and carry
intent, which is exactly what fold-time validation needs to check per-op legality against
current state.

One JSON file per planning run:

- **Envelope:** `planningRunId`, `mode` (`expansion` | `conflict` | `replan`), `authoredAt`,
  and the journal position the planner's `graph.json` snapshot reflected at launch — for
  diagnostics in rejection events; validation itself always runs against current state.
- **`ops`, applied in order.** Four operations:
  - `addNode` — the full node spec (the node-spec vocabulary: id, `chainId`, skill/agent/prompt,
    deadline, `dependsOn`, `mergeTo`, `metadata`). Ids are planner-authored and
    must be fresh. `metadata` carries project-specific fields (story, epic, phase, sprint —
    whatever the project uses) the machinery never reads.
  - `updateNode` — id plus the spec fields to replace (`dependsOn` rewiring, `mergeTo`
    toggle, prompt or deadline change). Target must exist and be unclaimed. The planner
    must not set `id`, `chainId`, or `status` — these are immutable or machinery-derived
    (verified spike 2026-07-23).
  - `removeNode` — id. Target must exist and be unclaimed; its edges go with it.
  - `abandonSegment` — the chain's `chainId`; the rework path from
    Merge-conflict resolution: the fold journals the abandonment and the pass deletes the
    chain branch. Graph mutation (verified spike 2026-07-23): `pending` nodes in the chain
    are removed from the graph; `completed`, `failed`, and `abandoned` nodes stay as
    historical record. The whole-graph rules then validate the resulting graph (e.g., if
    the removal leaves a chain without a `mergeTo` node, `final_node_missing_mergeTo`
    fires). A chain with any `claimed` or `parked` (in-flight) node is rejected —
    abandonSegment targets blocked chains, not running ones.
- Edges live inside node specs as `dependsOn` — there are no separate edge ops; `updateNode`
  covers rewiring. An empty `ops` array is a legal, meaningful delta: the planner considered
  and found nothing to change — the expected common case for the answer-fold trigger.

Acceptance is all-or-nothing at fold time (see Delta validation at fold time above); the
file reaches the inbox only through the wrapper's atomic promotion (see Output above), so
the fold reads either a complete file or nothing.

### Planning-run context

What the planning agent knows when it runs. Derived from scenario analysis: a unit of work whose
substance is human-performed setup (needs the full work text to skip the e2e node), early
unlock across chains (needs lookahead and claim status), replanning after failures (needs
journal evidence and the frozen boundary), the stale snapshot (needs the staleness rule),
composing the chain's total order (needs a skill catalog), setting deadlines (needs duration
history or defaults), and the dirty working tree (needs a pinned ref). Delivery model: the
prompt stays small — trigger, instruction, pointers — and everything else is files the planner
is directed to read; it is a local opencode run with repo access.

**In the prompt (per-run):**

- **Trigger and mode** — machinery expansion (ready nodes running low), conflict resolution
  (a chain blocked on a merge conflict, with the journaled conflict details — conflicted
  files, diffstat, fingerprint history), or human replan, with the human's instruction text
  passed verbatim from the inbox request.
- **Snapshot pointer and staleness rule** — where `graph.json` and the journal live, the
  launch timestamp, and the warning that the delta is validated at fold time against newer
  state: touch unclaimed nodes only, prefer additive changes near nodes likely to be claimed
  while planning runs.
- **Output contract** — the delta's scratch path in the per-run directory (the wrapper
  promotes it to the inbox — the agent never writes the inbox; see Output under Planning
  runs), the op vocabulary (see Graph delta format), the instruction to write the file as
  the run's last act even when empty, and nothing else shared.

**Files it reads (standing context):**

- **Chain-composition guidelines** — the advisory document (authoring is open question 1),
  including the skill catalog: each skill's purpose, expected inputs, and a default deadline.
  No "modifies files" flag — all nodes are assumed to modify files (see Graph management
  rules), so review ordering is chain position, not a property the catalog must carry. The
  guidelines carry project-specific semantics (story, epic, phase, sprint vocabulary) alongside
  the immutable graph rules — see Pipeline vs. project-specific customization.
- **Node-spec vocabulary** — the schema it may emit (id, `chainId`, skill/agent/prompt, deadline,
  `dependsOn`, `mergeTo`, `metadata`) and what it must not emit because machinery
  derives it: branch names, runId, anything sandbox-related. `metadata` is a free-form dict for
  project-specific fields the machinery never reads. The fold-time validation rules
  are stated to the agent as rules it will be held to: a chain's final node carries `mergeTo`,
  cross-chain edges target merge-point nodes only, the graph stays acyclic.
- **Graph state** — `graph.json`: every node's status, edges, merge points, which chains
  merged, plus the per-node metadata digests (attempt count, last outcome, durations, diff
  summary, parked question text, base commit, `metadata` — see State). The claimed/unclaimed boundary is
  the most load-bearing fact in the context — it is exactly what the planner may touch — and
  a parked node's pending answer can invalidate dependents the planner would otherwise extend
  a chain with.
- **The journal, read-only and optional** — history beyond the graph digests: full event
  sequences and conflict fingerprints (chains that keep conflicting should be serialized,
  not run concurrently). Routine questions are answered by the digests in `graph.json`; for
  the rest, this is the planner reading gen-3's own artifacts ad hoc, inside the "a human (or
  a later tool) queries the journal" scope — no trends machinery, no digest pipeline.
- **The backlog** — whatever the project uses: epics files and sprint plan, a phase list, a
  research agenda. Gives the upcoming-work window, their
  declared cross-chain dependencies, and the scope order that drives scope selection (see Scope
  lifecycle). Merge-point placement needs lookahead: a merge point is
  added only where a dependent chain actually exists to unlock, so the planner must see
  beyond the chain it is currently composing.
- **Work docs and code at `origin/<trunkBranch>`** — pinned ref, decided here: the devcontainer
  checkout is the human's working copy, possibly dirty, possibly on a feature branch, so
  reading the working tree would plan against half-finished human state. The planner reads
  the merged truth the chains base on. (The launch wrapper can provide a clean read-only
  worktree of `origin/<trunkBranch>` if directing reads by ref proves awkward.)
- **`decision-policy.md`** — planning is the step most likely to need a human answer; the
  planner exhausts policy before parking with a QUESTION.

**Outside its context and authority:**

- Gen-2 state files (already decided globally).
- Capacity, pause state, tick cadence — the trigger is machinery; the planner never reasons
  about whether to plan, only what.
- Work authorship — it composes chains for units of work; creating or editing work docs is a
  create-story node's job (or equivalent, per the project's vocabulary).
- Journal and `graph.json` writes — its only shared output is the delta.

### Pause/resume (human-initiated)

A human can pause the pipeline: active nodes run to completion, no new nodes are claimed.

- **Pause stops claiming, not execution.** While paused, a pass still reconciles, folds the
  inbox, polls in-flight sessions, classifies exits, issues stream-truncation continues, parks
  questions, and triggers the merge queue for merge-point nodes that finish — everything about
  *finishing claimed work* proceeds. What stops is the claim step: no new claims, including chain
  successors that become ready. The pipeline quiets down as in-flight nodes complete. No new
  sandboxes get created either — that falls out for free, since sandbox creation happens
  only at claim time. No new planning runs launch while paused; an in-flight planning run is
  supervised to completion and its delta folds — finishing claimed work, like everything else.
- **Mechanism: the same inbox path as every other human/external input.** A small helper script
  (an n8n form later, if wanted) writes a `pause` request to the inbox and invokes the
  dispatcher. The next pass folds it: journal append first (a `pause` event with who/when/why —
  the commit point), then `graph.json` regenerated with `paused: true`. The claim step gates on
  the journaled state, so a pause survives restarts and rebuilds like everything else. `resume`
  is the symmetric event. Repeated pauses or resumes are idempotent — level-triggered like
  every other input.
- **Takes effect within one pass.** The fold step runs before the claim step, so the pass that
  folds a `pause` already claims nothing; the helper invokes the dispatcher directly, so the
  gate is effectively immediate. What pause can never do is instant: in-flight runs measured in
  hours keep running.
- **Answering a parked question while paused resumes that session.** A resume finishes claimed
  work, and submitting the form during a pause is a deliberate human act, so it proceeds. To
  keep a parked node quiet, don't answer while paused — the park is durable.
- **Pause is not preemption.** It never terminates a running session. Stopping a runaway agent
  is the supervision deadline path (terminate + `runner_error`), not pause. A hard stop-everything
  control, if ever needed, is a separate destructive command — out of scope here.
- **Scope: global.** One control for the whole pipeline; per-chain or per-scope pausing only if
  a real need appears.
- Use cases: quiesce before a devcontainer or snapshot rebuild, hold the graph steady while
  replanning unclaimed nodes, stop the spread while investigating a defect that finished nodes
  may be propagating into their dependents.

### Atomicity

All canonical state and the locks live on one local filesystem (co-location is load-bearing —
see below). Three primitives cover every mutation, and two more serialize planning and merging:

| Primitive | Guarantee |
|---|---|
| Blocking `flock` held for the whole pass | Mutual exclusion between passes; released automatically on process death — no stale-lock handling |
| Single-`write` `O_APPEND` appends to `journal.jsonl` | Atomic appends on a local filesystem (verified — spike 2026-07-22: 500 concurrent appends, zero interleaved lines) |
| tmp-file + `renameSync` for `graph.json` | Atomic replace (verified — spike 2026-07-22: 200 rename cycles under concurrent reads, zero failures) |
| Non-blocking `flock` on `planning.lock`, held by the planning run for its lifetime | At most one planning run in flight; doubles as the liveness probe — acquirable means finished or dead |
| Non-blocking `flock` on `merge.lock`, held by the merge wrapper for the merge cycle's lifetime | At most one merge cycle in flight — the trunk branch has one pipeline writer at a time; same liveness probe |
| tmp-file + rename for every inbox write (n8n's small workflows, the merge wrapper, the pause helper, the planning wrapper's delta promotion) | A pass never folds a partial inbox file; the fold's parse check is defense in depth, not the primary guarantee (crash-safety verified — spike 2026-07-22: see `docs/todo/spike-delta-promotion.md`) |

Multi-file consistency comes from write ordering, not transactions: journal first (the commit
point), `graph.json` second (derived, rebuildable). Claims are exclusive by construction — a
claim is a journal append plus a graph mutation performed under the lock, so two passes cannot
double-claim. SQLite would package the same guarantees but costs human-readable jsonl for
debugging and inspection; not needed at tens of nodes.

### n8n / dispatcher split

n8n and the dispatcher are co-located on the devcontainer. n8n is not deployed to Railway and
runs under pm2 (`.devcontainer/start.sh`). The devcontainer never sleeps, so n8n and the
dispatcher are always available. The real split is persistent service vs ephemeral process:
n8n is up for as long as the devcontainer is up and owns schedules, forms, and notifications;
the dispatcher is a seconds-long reconcile pass that n8n invokes locally. The division of labor
follows what each is good at — n8n handles scheduling and human-facing flows; the dispatcher
handles graph algorithms, supervision, and state writing.

Two consequences of n8n being local, stated so nobody designs against the wrong model:

- **No inbound path from the internet.** External webhooks (e.g. GitHub) cannot reach this n8n.
  Every trigger originates locally: n8n schedules, n8n-internal workflow completions (the
  merge queue is an n8n workflow, so "merge complete" is an internal event, not a webhook),
  and forms opened from this machine's browser via forwarded ports.
- **Co-location is load-bearing.** Dispatcher invocation and the planning and merge wrappers
  (with the locks and inbox they serialize through) assume n8n can execute commands on the
  machine that holds the pipeline state. The merge queue's git work no longer needs the local
   repo — the whole merge cycle runs on a sandbox (see Merge cycle) — but moving n8n off the
  devcontainer (e.g. to Railway) would still be its own architecture change, not a deployment
  detail.

| Responsibility | Home | Why |
|---|---|---|
| Trigger the dispatcher (schedule tick, question answered, merge complete, planning exit) | n8n | Persistent scheduler while the devcontainer is up; invokes a pass as a local process call. The tick also checks dispatcher health after invoking: non-zero pass exit → error notification; `last-pass.json` older than a few tick intervals → "dispatcher stalled" ntfy (see The machinery observes itself under Supervision). |
| Merge queue (git integration) | n8n hosts the merge wrapper; the whole merge cycle runs on a sandbox | Serialized by `merge.lock`, level-triggered by passes, capacity-gated by `maxConcurrentSandboxes` (the merge sandbox counts against the cap; a trigger that would exceed it defers to the next pass). The wrapper drives fetch, rebase, merge, and push on a sandbox created per merge cycle via the Daytona session API; pipeline git operations never touch the devcontainer checkout. **No tests in the merge cycle**: the pipeline merges branches without running tests. A post-merge hook — project-authored, configured in the policy block — fires after the merge lands; if the hook fails, the failure is a standard `failed` outcome that rides the existing remediation path (see Merge-conflict resolution). On conflict it writes an inbox report and stops — resolution is a graph node (see Merge-conflict resolution). |
| Question surfacing (form + ntfy) | n8n (small workflow) | Durable Wait-form suspension and forms are n8n's strength. Human-facing surface only — the journal holds the canonical parked state. |
| Error notification | n8n | Existing small workflow, unchanged. |
| Pause/resume control | Helper script → inbox (n8n form optional later) | Human-initiated; folded by the next pass; the claim step gates on the journaled pause state. |
| Sprint status / reporting | n8n | Read gen-3 state, format, notify. |
| Graph traversal + claim logic | Dispatcher pass (JS) | DAG algorithm with stateful mutations. Needs testing, iteration. |
| Graph expansion (planning run) | Dispatcher pass decides + journals; n8n planning-host workflow runs the launch wrapper | Supervised like a sandbox session, but runs on the devcontainer — needs the repo, needs no isolation. Serialized by the planning lock; emits a graph delta; the host invokes the dispatcher on exit so the delta folds immediately. |
| Supervision + outcome classification | Dispatcher pass (JS) | Level-triggered session polling; deterministic rules + one LLM call. No long-lived process to die. |
| Workspace provisioning | Dispatcher pass (JS) | SDK calls + filesystem ops. |
| State writing (journal, graph.json) | Dispatcher pass (JS) | At most one writer at a time — the pass holding the lock. |
| Reconciliation | Dispatcher pass (JS) | Every pass: cross-check journal vs sandboxes vs git; collect, destroy, continue. |
| In-sandbox command (opencode run with `--format json` + branch push) | Command template (JS) | Generated by the dispatcher, executed via the Daytona session API; ends with the branch push. |

Single-writer restated: not "one resident process is the writer" but "at most one pass holds
the lock at a time." n8n's small workflows never touch canonical state — they write only inbox
files (a question answer, a merge-conflict report, an external event) that a pass folds in. The planning run is held to
the same rule: its only shared output is a graph delta in the inbox, and even that is
written by its launch wrapper, not by the agent (see Output under Planning runs). Agents write nothing shared;
their only output channels are their branch push and their session logs, both read by passes.
Session-history analysis confirmed agents already don't write to pipeline state
files in the sequential architecture; the parallel architecture keeps that by construction.

### Data flow

```
n8n (persistent service on the devcontainer, under pm2 — small workflows only)
  │
  ├─ Schedule tick (every few minutes) → invokes dispatcher,   ← primary heartbeat
  │    then checks pass exit code + last-pass.json age (stall alert)
  ├─ Question form + ntfy → answer to inbox file → invokes dispatcher
  ├─ Merge queue workflow → merge wrapper drives a sandbox merge cycle → merge lands (git) or
  │    conflict report to inbox → invokes dispatcher
  ├─ Planning-host workflow → runs the launch wrapper → invokes dispatcher when planning exits
  ├─ Error notification (ntfy)
  └─ Sprint status / reporting (reads gen-3 state)
       │  contentless invocations — every payload is already durable on disk or in git
       ▼
Dispatcher pass (same devcontainer, seconds long, one at a time under flock)
  1. Reconcile (journal vs labeled sandboxes vs pushed branches vs planning lock)
  2. Fold inbox → journal.jsonl (commit point) → graph.json (derived)
  3. Poll in-flight sessions + planning run → classify exits → act (continue / park / collect)
   4. Re-evaluate ready nodes
      5. Trigger pending merges (capacity-gated, merge.lock-serialized) → then claim depth-first (bounded by fairnessBudget) → start session commands (runAsync, with `--format json` and `</dev/null` appended); trigger planning host if ready-node frontier low
  6. Release lock, exit
       │  Daytona API: create/stop,         │  journal launch → trigger n8n planning host,
       │  session exec, log pull                │  which runs the wrapper under planning.lock
       ▼                                        ▼
Daytona sandboxes (one opencode        Planning run (opencode on the devcontainer, hosted
agent each; agent pushes its           by the n8n workflow; its wrapper promotes the graph
branch as its last act)                delta to the inbox as its last act)
```

When an agent finishes:

1. The in-sandbox command pushes the branch — durability does not depend on anything watching.
2. The next pass (tick, or any other invocation) polls the session, sees it exited, pulls exit
   code and logs, and classifies the outcome.
3. The pass folds the outcome: journal append, graph mutation. COMPLETE on a merge-point node
   (`mergeTo` — chain-final nodes always are) triggers the merge queue (level-triggered — any
   later pass re-triggers an unfinished merge; see Merge cycle), and its successors
   become ready when the merge lands; COMPLETE on an unmarked node makes the successor ready
   and the same pass claims it; `failed` consumes an attempt and, if attempts remain, the node
   is re-claimable (a fresh sandbox and session, not a continue — see Supervision) — a `failed`
   node's branch is never merged (only `completed` merge-point nodes trigger the merge queue;
   the branch's partial work is quarantined on origin until a retry overwrites it or the scoped
   reaper cleans it up — see Branch push failure). A stream-truncation
   signal is not an outcome and is not folded here: the pass issues the continue in the poll
   step and the node stays in-flight. An exited
   session also has its transcript and full logs pulled to the devcontainer before its
   sandbox is destroyed (see Supervision).
4. If the outcome is QUESTION: the pass journals `parked` (with sandbox ID, session ID, and
   question text), stops the sandbox, and triggers the question-form workflow, which fires ntfy
   with the form URL and suspends on its Wait node. The session ID was captured at launch (see
   the in-sandbox command template — opencode auto-generates IDs, so the template runs
   `opencode session list --format json` after the initial `opencode run` and records the ID
   for the journal). The human's answer is written to the inbox
   and the dispatcher invoked; the next pass starts the sandbox and issues
   `opencode run --format json --session <id> --dir <sandbox-repo-path> "<answer>"` async, journaling the
   resume. Parking costs nothing while the question waits — disk and opencode storage survive a
   Daytona stop (verified, spike 2026-07-22: stop ~2.3s, start ~0.8s, storage directory
   preserved identically).

### Implementation surface

Rough estimate, ~1090 lines of JS plus three small n8n workflows:

| Module | Lines | Reuses |
|---|---|---|
| Graph management (CRUD, DAG traversal, claim, chain/branch bookkeeping) | ~250 | New |
| Workspace provisioning (sandbox create-on-demand, env + config copy, destroy at collection, scoped reaper) | ~150 | Patterns from product's SandboxService |
| Supervision (session poll, deadline check, continue, park/resume actions, transcript pull) | ~150 | New — behaviors from gen-2's `BMAD Session (OpenCode)`, no workflow port |
| Classification (deterministic rules + LLM fallback, evidence journaled with the outcome) | ~90 | Rules and prompt ported from `Parse OpenCode Response` / `BMAD Outcome`; no n8n dependency |
| Pass frame (flock, inbox fold, reconcile, pause gate, per-pass log + `last-pass.json` heartbeat) | ~170 | New; helper patterns copied from gen-2 scripts, no imports |
| Planning run (launch wrapper with per-leg exit record + atomic delta promotion, resume-mode legs, planning lock, delta validation + fold) | ~120 | New |
| In-sandbox command template (install check, opencode run with `--format json` and `</dev/null`, exit capture, unconditional branch push with bounded retry + `push-failed` marker) | ~90 | New |
| Merge wrapper (merge lock, drives the in-sandbox merge cycle: fetch, rebase, merge, push; fire post-merge hook; conflict report) | ~90 | New |
| Question-form workflow (form + ntfy + inbox write + invoke) | n8n, small | New — the Wait-form/ntfy pattern from gen-2, as a standalone workflow |
| Planning-host workflow (run the launch wrapper, invoke dispatcher on exit) | n8n, small | New |
| Merge queue workflow (runs the merge wrapper, invokes dispatcher on exit) | n8n, small | New — mirrors the planning-host pattern |

## State

- Gen-3 state lives in its own directory (`pipeline3/state/`), so the gen-2
  loop and its files remain untouched and runnable while gen-3 is built. Canonical state is
  two files plus an inbox: `journal.jsonl` (append-only commit point; gen-3 schema: claims with
  sandbox/session IDs and deadlines, outcomes with commits-added, a diffstat (see below), and
  classification evidence (the rule that fired, or the LLM verdict, rationale, and judged
  excerpt — see Supervision),
  parks/resumes, merge events, `runner_error`
  events, pause/resume control events, policy decisions), `graph.json` (derived view,
  rebuildable from the journal, regenerated with per-node metadata digests — attempt count,
  last outcome, durations, diff summary, parked question text, base commit, and the node's
  `metadata` dict — so routine
  readers (the planner, the viewer, sprint status) read one file and never parse the
  journal), and
  `inbox/` (written by n8n's small workflows and by the planning wrapper — graph deltas,
  promoted atomically — consumed and deleted by passes). Per-run log
  excerpts, pulled session transcripts (via `opencode export` or the storage directory — see
  Supervision),
  and merge-cycle logs (see the merge queue row in the n8n / dispatcher split)
  go to a plain directory for debugging and later analysis; per-pass log files and the
  `last-pass.json` heartbeat live beside them — machinery observability, not canonical state.
  At most one writer at a time for
  canonical state: the pass holding the lock.
- **Collection records the diff.** When a pass collects an exited session
  it computes commits-added and a diffstat from the claim's journaled base commit to the
  pushed head and journals them with the outcome; the per-node digest in `graph.json` carries
  the summary. Without this, a COMPLETE with an empty diff is indistinguishable from
  substantive work — hiding exactly the evidence a guideline include/skip condition needs
  ("this node type chronically does nothing for chains like this") and the convergence
  signal that a node found its work already merged by a parallel chain. Free to compute — the
  base commit is already journaled — and squarely inside "journal everything a future
  reflector would want to read."
- **The journal stays separate from the graph.** Folding history into `graph.json` as node
  metadata would require top-level graph fields for non-node events — planning runs
  (deliberately not graph nodes), pause/resume controls, machinery `runner_error`s —
  rebuilding the journal in a worse place; a canonical rewritten
  `graph.json` is protected against crashes (tmp + rename) but not against a buggy pass
  writing wrong content, while an append-only file can gain a bad line but cannot lose good
  ones and remains the rebuild source; and embedded history would grow the file every reader
  parses on every pass. The per-node digests above give readers the convenience without
  giving up the commit point.
- **Not part of gen-3 state:** gen-2's `journal.jsonl`, `ledger.jsonl`, `playbook.json`,
  `runner-errors.jsonl`, and trends. Gen-3 writes nothing to them and reads nothing from them.
  Anything a future reflector needs must come from gen-3's own journal.
- **Atomic writes required:** passes write `graph.json` via tmp-file + `renameSync` (see
  Atomicity under Dispatcher); any viewer keeps last-good state on parse failure. Gen-3
  starts atomic — gen-2's `scripts/pipeline/lib.mjs` (now removed from the repo) used plain
  `fs.writeFileSync`, a known gap there. The `atomicWrite` helper should `fsync(fd)` before `rename` for power-loss
  durability on ext4 — not a crash-safety issue (process kill is covered by rename atomicity),
  only relevant if the state directory is on ext4 rather than tmpfs (spike finding F2,
  2026-07-22 — see `docs/todo/spike-delta-promotion.md`).
- **No in-memory truth.** Journal + graph on disk must be sufficient to resume from cold —
  every pass reconciles, so recovery from a restart is the same code path as a normal tick. The
  pipeline needs a resurrection path (devcontainer postStart hook invoking a pass, plus the n8n
  schedule tick).
- A claimed node's spec is frozen at claim time; replanning touches only unclaimed nodes.

## Viewer

Constraint first: the viewer belongs to the workflow silo, not the product. It must not live in
or reuse code from `apps/web`/`apps/agent-be`, and must stay build-less and app-less — committed
flat files only, provisioned (if at all) via `.devcontainer/`. Access is via VS Code's local
port forwarding on the devcontainer, same as n8n's UI. (This is a local devcontainer on the
user's machine — VS Code Dev Containers, not GitHub Codespaces; the `codespace` username is an
artifact of the `devcontainers/universal` image.)

1. **Start:** the dispatcher regenerates a Mermaid block in a markdown file on every graph
   mutation. Viewable in VS Code preview inside the devcontainer (add the mermaid preview extension
   to `devcontainer.json`) and on GitHub after push. Zero infrastructure.
2. **Upgrade when interactivity is worth it:** one committed `viewer.html` + vendored
   Cytoscape.js + dagre (~717K across 3 plain UMD `<script>` files, no build step) + a ~10-line
   Node stdlib HTTP server in the gen-3 scripts dir serving the page and `graph.json` from one
   origin on a forwarded port, polling every ~30s. Proper layered DAG layout, node-state
   coloring, click-to-inspect sidebar.
3. **Grafana rejected:** its Node Graph panel now has a layered DAG layout, but the Infinity
   data source cannot read a local file — it needs an HTTP URL, i.e. the same tiny file server
   anyway — plus a ~190MB re-download on every devcontainer rebuild, plugin/provisioning
   surface, ~250MB idle RAM next to n8n, and a fixed-vocabulary node inspector.

## Worker sandbox design

### Per-agent workspace recipe (sandbox tier)

One single-use Daytona sandbox per claim attempt, created on demand at claim time and
destroyed after collection (see Sandbox lifecycle). There is no warm pool: creation from a
cached snapshot is near-instant, so pre-provisioning ahead of claims would buy seconds
against hour-long runs at the cost of a pool subsystem (top-up logic, idle-sandbox lifecycle
handling, pool accounting in every reconcile). The only capacity control is the
`maxConcurrentSandboxes` policy knob, enforced at claim time. Each sandbox is
a separate machine — isolation is free, no collision-mitigation discipline needed, and
single-use keeps it free across sequential claims too.

**Provisioning (per claim, at claim time):**
- **Sandboxes use the same image the devcontainer uses.** The snapshot's
  base is the devcontainer's image — not a separately maintained base — so a worker sandbox
  and the devcontainer share one source of truth for the OS, system packages, and toolchain.
  This assumes the host runs as a devcontainer (the devcontainer image is the reference
  environment); a host running on a direct PC machine without a devcontainer would need a
  separate decision, since there is no devcontainer image to mirror. Build the snapshot via
  the Declarative Builder with `run_commands()` that replay whatever the devcontainer's
  lifecycle scripts install on top of the base image (Node.js, Yarn, Postgres, Playwright
  browsers, opencode, and any system packages). Pre-bake the repo's dependencies into the
  snapshot so the per-claim install check is a no-op in the common case (see Per-claim below
  — the install runs every claim; the snapshot makes it fast, not absent). With single-use
  sandboxes the baked dependencies must end up inside each sandbox's checkout: **bake the
  shallow clone itself into the snapshot (Strategy A — per-sandbox
  provisioning then fetches instead of cloning)** — otherwise every claim's install rebuilds
  from scratch and the cold-start optimization is lost. The alternative (move the baked
  `node_modules` into a fresh clone) was verified viable but adds a per-claim copy step and a
  staging path; see `docs/todo/spike-baked-node-modules.md`. "Bake the clone" means bake a
  shallow clone plus `runCommands('npm install')` during the snapshot build — a `git clone`
  alone has no `node_modules` (gitignored), and build-time network is available (spike findings
  F3, F4). Baked files are root-owned but the sandbox runs as `daytona` (uid 1001), so the
  build config must chown via `dockerfileCommands(['USER root', 'RUN chown -R 1001:1001
  /workspace/repo', 'USER 1001'])` after the `COPY` + install — the `user: 'root'` create
  param is ignored (spike finding F1). Daytona caches
  declarative images for 24h; subsequent runs on the same runner are "almost instantaneous."
  This is what makes create-on-demand viable — every worker starts from this snapshot in
  seconds, not minutes, so no pool needs to exist ahead of claims. The snapshot is a
  cold-start optimization, not a freshness guarantee: when the repo's deps change, the
  per-claim install does the real work until the snapshot is rebuilt (a human authors the
  snapshot's build config; the install step surfaces when the repo has outgrown it).
- **opencode version pinning:** the snapshot's build config installs
  opencode at the version specified by `opencodeVersion` in the dispatcher's policy config —
  the same config file as `maxConcurrentSandboxes` and the other knobs. The devcontainer's
  install reads the same value, so both install paths share one source of truth. Daytona has no
  agent-harness or opencode-version selection API — opencode is an ordinary npm package
  installed via `run_commands()` in the snapshot and `npm install -g` on the devcontainer, and
  `opencodeVersion` is what keeps them in sync. A post-install `opencode --version` assertion
  catches a stale snapshot bake.
- Create sandboxes from the custom snapshot with explicit resources:
  `resources: { cpu: 4, memory: 8, disk: 10 }` (the platform max). Create from image, not
  snapshot, to control resources — the snapshot path **rejects** `resources` with a hard API
  error ("Cannot specify Sandbox resources when using a snapshot"), not silently ignores them
  (verified spike 2026-07-22, see `docs/todo/spike-snapshot-resources.md`); the image path
  honors all three — disk as a 10G overlay (visible in `df`), cpu and memory as cgroup-v2
  quotas (`cpu.max` = 4 cores, `memory.max` = 8 GiB) that `nproc` / `free -m` do not reflect
  (they report host-level values). Pass `labels: { scope:
  'pipeline', runId }` at creation — labels are on the returned `Sandbox` instance immediately
  (verified spike 2026-07-22, see `docs/todo/spike-label-scoping.md`), so reconcile can find
  sandboxes by label without a separate labeling call.
- `git clone --depth 1` the repo into the sandbox (shallow, fast) — or, when the clone is
  baked into the snapshot (Strategy A), `git fetch` to current. The Daytona SDK's `git.clone`
  has no depth parameter — use `executeCommand('git clone --depth 1 ...')` instead.
- Copy all `.env*` files from the dispatcher into the sandbox (`.env`, `.env.local`,
  `.env.test`, and any others present). These are gitignored, small, and contain secrets —
  never in the repo, never in the snapshot. The dispatcher holds them and pushes per-sandbox at
  provision time. This transfer is a non-issue: sandboxes are trusted with secrets like the dev
  machine (see Credentials under Sandbox lifecycle).
- Copy the repo's `opencode.json` into the sandbox and ensure `NEURALWATT_API_KEY` is in the
  sandbox env (it rides with the `.env*` files above). opencode ships with neuralwatt as a
  built-in provider, so the provider registration in `opencode.json` only sets model limits —
  no `baseURL` override. The file is committed in the repo and travels with the clone, but the
  dispatcher copies it explicitly the same way it copies the `.env*` files: the snapshot's bake is a
  cold-start optimization, not a freshness guarantee, and an `opencode.json` baked stale would
  silently pin old context limits. **neuralwatt is the LLM
  provider for all opencode runs in the pipeline — sandbox agents, the planning run, and the
  outcome-classification LLM fallback — with `glm-5.2` as the initial model.** The model and
  provider are config in `opencode.json`, so swapping either is a repo change, not a pipeline
  change; the snapshot's `opencode.json` is rebuilt on the next snapshot rebuild like any
  other committed file. **neuralwatt API access from sandboxes (spike, 2026-07-22):
  `api.neuralwatt.com` is not on Daytona's Tier 1 Essential Services allowlist, so sandbox
  agents cannot reach it directly.** The planning run and the outcome-classification call run
   on the devcontainer and are unaffected. The relay is built and deployed; the tunnel proxy
   is verified (2026-07-22).
- **WebSocket tunnel proxy for LLM access (spike, 2026-07-22 — see
  `docs/todo/spike-ws-tunnel-proxy.md`).** The sandbox starts a local CONNECT-to-WebSocket
  tunnel proxy (`tunnel-proxy.js`) on `127.0.0.1:8888` before the agent runs. The proxy handles
  HTTP CONNECT requests from opencode (Go's `net/http` respects `HTTPS_PROXY` natively) and
  bridges each CONNECT to the relay's WebSocket `/tunnel` endpoint, which opens a raw TCP
  connection to the target host and pipes bytes bidirectionally. The outer TLS (sandbox →
  Railway relay) has an allowlisted SNI; the inner TLS (sandbox → target) flows inside the
  WebSocket, invisible to the Envoy SNI filter. The in-sandbox command sets
  `HTTPS_PROXY=http://127.0.0.1:8888` and `NO_PROXY` to exclude Essential Services (which the
  sandbox reaches directly and the relay refuses to tunnel). This approach needs no `baseURL`
  override in `opencode.json` — the agent uses the real `api.neuralwatt.com` URL. The tunnel
  proxy depends on the `ws` npm package (installed globally before the proxy starts).
- **Egress on Tier 1 is restricted to Daytona's Essential Services allowlist (spike,
  2026-07-22 — see `docs/todo/spike-neuralwatt-accessibility.md`).** The sandbox does not have
  open egress: an Envoy proxy inspects the TLS SNI and resets connections to any hostname not on
  the allowlist. `networkBlockAll: false` (the default) does not mean open egress on Tier 1 —
  it means "apply the tier's default policy," which on Tier 1 is the Essential Services
  allowlist. `domainAllowList` cannot override this on Tier 1/2 (the API returns an error);
  only Tier 3+ supports per-sandbox egress configuration. The Essential Services allowlist covers
  GitHub, npm, Anthropic, OpenAI, Docker registries, Railway (`*.railway.app`,
  `*.railway.com`), and others — see the [Daytona network limits docs](https://www.daytona.io/docs/network-limits).
  `api.neuralwatt.com` is not on the allowlist, so sandbox agents cannot reach it directly.
   The resolution is the authenticated sandbox-proxy relay (`sandbox-relay-production.up.railway.app`).

**Per-claim (after provisioning):**
- A pass journals the claim (with its deadline), provisions the sandbox (above), and issues
  `git fetch && git checkout` to the claim's base — the unmarked chain predecessor's pushed
  head, or merged trunk for a chain's first node and for the first node after a merge point.
  Provisioning runs inside the claim step: with a cached snapshot, create is near-instant and
  the fetch and file copies are seconds — within the pass's seconds-long budget. If real-world
  creation latency ever stretches passes, the provisioning commands move into the front of the
  async in-sandbox command, leaving the pass only the create call — a mechanical change.
- The in-sandbox command runs the configured per-claim install command (see Pipeline vs.
  project-specific customization) before the node's command — `npm ci` for this project,
  but a different project configures a different command or none. This is the correctness
  floor: a no-op in seconds when deps haven't changed, real work when they have. The
  snapshot's pre-baked `node_modules` makes the common case fast; the install step handles
  every claim the snapshot doesn't cover. An install failure (a dep change needing a system
  package the snapshot lacks, an unresolvable lockfile) is a distinct classification — see
  Supervision — not a generic runner error. The install step also installs the `ws` npm
  package globally — the tunnel proxy depends on it (see WebSocket tunnel proxy above).
- The in-sandbox command starts the tunnel proxy before the agent runs: `node /tmp/tunnel-proxy.js`
  in the background with `TUNNEL_RELAY_URL`, `TUNNEL_RELAY_TOKEN`, and `TUNNEL_LISTEN_PORT`
  env vars. The proxy listens on `127.0.0.1:8888` and bridges HTTP CONNECT requests to the
  relay's WebSocket `/tunnel` endpoint. The agent's command sets `HTTPS_PROXY=http://127.0.0.1:8888`
  and `NO_PROXY` for Essential Services (which the sandbox reaches directly). This needs no
  `baseURL` override in `opencode.json` — opencode uses the real `api.neuralwatt.com` URL
  (spike, 2026-07-22 — see `docs/todo/spike-ws-tunnel-proxy.md`).
- The pass starts the node's command inside the sandbox via the Daytona session API
  (`createSession` + `executeSessionCommand({ runAsync: true })`) with `--format json`,
  `--dir <sandbox-repo-path>`, and opencode storage at a persistent path on the sandbox
  disk (not tmpfs — a parked sandbox's storage must survive stop/start; see Park/resume).
  opencode v1.17.20 stores data in a SQLite database at
  `~/.local/share/opencode/opencode.db` (spike finding F3, 2026-07-22; stop/start persistence
  verified spike 2026-07-22). The pass then exits — the
  pull-based transport model the product already uses. Later passes poll the command's state
  and pull logs via `getSessionCommandLogs`. The sandbox never calls back to the devcontainer.
  **The command must append `</dev/null`** (verified in the opencode-sandbox spike):
  `executeSessionCommand` with `runAsync: true` runs the command in a PTY;
  opencode detects the TTY and stays alive waiting for interactive input after completing its
  task, so the process never exits and `getSessionCommand` never returns an `exitCode`.
  With stdin closed, opencode exits cleanly after completing its task. Without this, every
  poll-for-completion loop times out.
  **The command uses `--format json`**: the agent run emits
  newline-delimited JSON events (`step_start`, `text`, `step_finish`, `tool_use`,
  `reasoning`, `error`) to stdout, which the dispatcher parses for outcome classification
  and stream-truncation detection. The default formatted output is human-readable text with
  no structured signal — `--format json` gives the dispatcher a machine-readable event stream
  and the `step_finish` event as a clean completion signal (see Supervision, Stream-truncation
  recovery, and spike-midstream-resume.md).
  **The template captures the session ID after the initial run** (verified spike 2026-07-22):
  opencode auto-generates session IDs (format `ses_<hex>`) and `--session` is resume-only, so
  the template runs `opencode session list --format json` (newest first) after the initial
  `opencode run --format json` and writes the ID to a known path for the dispatcher to journal
  with the claim. Without this, the park/resume path has no ID to pass to `--session`.
- The in-sandbox command ends with a branch push (`git push origin HEAD:pipeline/<runId>/<chainId>`
  — the chain branch) so the result is durable in git regardless of what is watching. **The push
  step runs unconditionally** — it pushes the branch regardless of opencode's exit code (verified
  spike 2026-07-23: the plan's merge-trigger rules already quarantine `failed` work — only
  `completed` merge-point nodes trigger the merge queue, so broken partial work landing on the
  chain branch is never merged; see `docs/todo/spike-push-on-failure.md`). The template records
  opencode's exit code separately (for the classifier) and pushes in all cases, so a `failed`
  node's partial work is on the chain branch, not lost with the sandbox. This preserves the
  durability floor for the common failure case (agent exits non-zero before completing) — without
  unconditional push, hours of agent file work would sit on the sandbox disk only, the pass would
  classify `failed`, destroy the sandbox, and the work would be lost. The push step retries with
  bounded backoff and writes a `push-failed` marker on permanent failure; the collecting pass
  checks the marker before destroying the sandbox and attempts one recovery push or parks the
  node (see Branch push failure).
- Deadlines are enforced pass-side: a pass finding a claim past its deadline terminates the
  session command in the sandbox, journals a `runner_error` event, and handles the node per
  retry policy (a timeout is a failure — see Timeout policy under Supervision; the node is
  re-claimable if attempts remain, on a fresh sandbox — the terminated attempt's sandbox is
  destroyed after transcript pull like any exited attempt, never handed to the retry).

**What this eliminates (from session-history analysis):**
- Cross-process homicide via `pkill -f "next dev"` / `pkill -f "agent-be"` — can't cross
  machine boundaries.
- Fixed port binding (3000, 3001) — each sandbox has its own port space.
- Shared Postgres test DB — each sandbox runs its own (installable via `apt-get`).
- Shared-file corruption (`sprint-status.yaml` 56 edits, `deferred-work.md` 11 edits,
  `project-context.md` 13 edits across sessions) — per-sandbox, serialized by merge queue.
- `git add -A` sweeping other agents' files — each sandbox is its own clone.
- opencode identity collision — separate machine, separate storage.

### Sandbox platform capabilities (verified against Daytona docs)

The platform supports custom images, explicit resources, and a declarative builder for
pre-baking snapshots.

| Capability | Status | Note |
|---|---|---|
| Bash, git, Node.js, npm | ✅ Pre-installed | |
| Package installation (apt) | ✅ With sudo | Postgres, jq, etc. |
| Postgres | ✅ Installable | Per-sandbox DB eliminates shared-DB collision |
| Dev servers (next dev, nest) | ✅ Work on localhost | No port conflicts across sandboxes |
| Jest tests | ✅ Work | |
| opencode installation | ✅ Install script works | |
| Git clone (public repo) | ✅ Works | Private repos need credentials injected |
| Network to GitHub | ✅ Works | Essential services allowlist includes `github.com`, `*.github.com` |
| Network to npm registry | ✅ Works | Essential services allowlist includes `registry.npmjs.org`, `*.yarnpkg.com` |
| Disk space | ✅ Up to 10 GB | Specify `resources: { disk: 10 }` when creating from an image. Default is 3 GB; max is 10 GB. 10 GB is enough for this monorepo's `node_modules` (~1.5 GB) plus headroom |
| Resource limits | ✅ Configurable | 1-4 vCPU, 1-8 GB RAM, 1-10 GB disk. Specify when creating from an image. The snapshot path **rejects** `resources` with a hard API error ("Cannot specify Sandbox resources when using a snapshot") — create from image, not snapshot, to control resources. On the image path all three are honored: disk as an overlay size (visible in `df`), cpu/memory as cgroup-v2 quotas (`cpu.max`, `memory.max`) that `nproc` / `free -m` do not reflect (they report host-level values) — verified spike 2026-07-22, see `docs/todo/spike-snapshot-resources.md` |
| Yarn 4 (Berry) | ✅ Likely works | Initial silent fetch failure was almost certainly the 3 GB disk limit, not a platform incompatibility. Needs verification with adequate disk |
| Docker | ✅ Installable | Sandboxes have their own kernel and sudo. Install via `curl -fsSL https://get.docker.com \| sh` or pre-bake into a custom snapshot. Docker registries (`docker.io`, `*.docker.com`) are in the essential services allowlist. Not needed for pipeline agents (session history shows they use `gh` CLI and `curl`), but available if MCP servers are ever needed |
| Browser external access | ✅ Likely works | Playwright is in the essential services allowlist. Initial `ERR_CONNECTION_RESET` was likely a snapshot-specific TLS/proxy issue. A custom snapshot with proper browser deps should resolve it |
| Network to devcontainer | ❌ No path back | Sandboxes can't reach `localhost:5678` (n8n). Not a problem — nothing in the sandbox calls back. Passes pull logs via the Daytona session API from the devcontainer side; the agent's only outbound act is its final git push |
| Custom snapshots | ✅ Declarative Builder | Build from any base image with `apt-get`, `run_commands()`, `dockerfile_commands()`, or `from_dockerfile()`. Pre-bake Node, Yarn, Postgres, Playwright, opencode, and repo deps. Cached for 24h; subsequent runs on the same runner are "almost instantaneous" |
| Network allow-listing | ✅ Runtime-updatable (Tier 3+) | `domainAllowList` (wildcards, max 20) + `networkAllowList` (CIDR, max 10) + `networkBlockAll`. Updatable on a running sandbox without restart. Essential services (npm, GitHub, Anthropic, Docker, Playwright, Railway, opencode) are pre-allowed on all tiers. **Tier 1/2 cannot override the Essential Services restriction** — `domainAllowList` returns an error on those tiers (spike, 2026-07-22). On Tier 1, `networkBlockAll: false` (the default) means "apply the tier policy" (Essential Services only), not "open egress." See `docs/todo/spike-neuralwatt-accessibility.md` |
| Create-on-demand latency | ✅ Fast from cached snapshot | The platform has no pool/acquire-release abstraction, and gen-3 needs none: pre-built snapshots make creation near-instant (cached 24h), so a sandbox is created per claim and destroyed at collection |
| Sandbox labeling | ✅ At creation, filterable via list | `daytona.create({ labels: { scope: 'pipeline', runId } })` sets labels atomically with creation — on the returned instance immediately, no separate call. `daytona.list({ labels: {...} })` filters by exact key-value match after a ~5s index propagation delay. Daytona auto-adds `code-toolbox-language: python` to every sandbox (does not interfere with filtering). `setLabels()` replaces labels (response is authoritative) but the list index lags on label removal for 20s+ — not a problem since the pipeline sets labels at creation and never updates them (spike, 2026-07-22, see `docs/todo/spike-label-scoping.md`) |

No real platform gap remains: create-on-demand needs no pool management — only the scoped
labeling and reaper discipline described under Sandbox lifecycle.

### Sandbox lifecycle

- **Sandboxes are single-use, created on demand**: created at claim time
  (or per merge cycle), used for exactly one claim attempt, and destroyed when the session
  exits — after the collecting pass pulls the transcript and full logs to the devcontainer
  (see Supervision). There is no warm pool (see the per-agent workspace recipe for the
  rationale). The number of live sandboxes is capped by `maxConcurrentSandboxes` in the policy
  config — a claim that would exceed the cap simply isn't made that pass; capacity control is
  claim-time policy, not pool size. The agent's in-sandbox
  command pushes the branch as its last act, so completion is durable in git before
  destruction — and a push that fails is retried in-sandbox, then recovered or parked by the
  collecting pass, never silently lost (see Branch push failure). A retry never reuses the failed attempt's sandbox; a deadline-terminated
  attempt's sandbox is destroyed the same way. Single-use buys reuse hygiene by construction:
  no stray processes from a previous claim (a leftover dev server holding its port), no
  untracked files or Postgres state crossing claims, no disk growth toward the 10 GB cap —
  the collision surfaces machine isolation eliminates across concurrent claims stay
  eliminated across sequential ones, and no reset-discipline code (process kill, selective
  clean that spares `node_modules`) ever needs writing.
- **Parked sandboxes are the exception.** A parked node's sandbox is stopped, not destroyed —
  disk and opencode storage must survive for `opencode run --format json --session <id>` to resume (see
  Park/resume) — and is destroyed like any other when the resumed session exits. Because the
  human-response window is unbounded, the platform's lifecycle timers are set explicitly at
  creation: auto-stop can stay short (the pass stops parked sandboxes itself),
  auto-archive is acceptable (slower restore, disk preserved), auto-delete is disabled — a
  platform default silently deleting a parked sandbox would strand its session.
- **Reconcile on every pass:** list sandboxes with the pipeline `scope` label and cross-check
  against the journal. A sandbox no entry accounts for is orphaned (crash, terminate) and gets
  destroyed; a running one with a live claim is polled; a finished one gets collected and
  destroyed. Labels are set at creation (`daytona.create({ labels: { scope: 'pipeline', runId } })`)
  and are on the returned `Sandbox` instance immediately — no separate labeling call, no window
  where a sandbox exists without its labels (verified spike 2026-07-22, see
  `docs/todo/spike-label-scoping.md`). The `list({ labels: { scope: 'pipeline' } })` filter finds
  sandboxes by exact key-value match; Daytona auto-adds a `code-toolbox-language: python` label
  to every sandbox, which does not interfere with filtering. A ~5s index propagation delay
  exists between creation and list-filter visibility — irrelevant since reconcile runs on passes
  minutes apart, and the dispatcher journals the sandbox ID at claim time (same pass), so it
  never discovers its own just-created sandbox via `list()`. The product's
  `cleanup-daytona-sandboxes.ts` is account-wide destructive — the pipeline needs a scoped
  reaper (Epic 8.1 adds one for the product; depend on it or build its own).
- **Quota management:** the Daytona account has a 30 GiB shared disk quota across all
  environments. Shallow clones (`--depth 1`) reduce per-sandbox disk. Create-on-demand ties
  live sandboxes to in-flight work by construction — in-flight claims plus parked nodes plus
  at most one merge cycle, bounded by `maxConcurrentSandboxes`. The dispatcher must still track
  disk usage and enforce a budget. Label every sandbox with `scope: pipeline` and a `runId` —
  the product's lack of scoping is a known problem the pipeline must not reproduce.
- **Credentials: sandboxes carry the same trust as the dev machine.** Pipeline sandboxes run our own agents on our own code — they are not a
  lower-trust tier, so transferring secrets from the dispatcher into a sandbox is a non-issue
  and no minimization boundary applies. Provision whatever the work needs (`.env`, `.env.test`,
  API keys); anything left out (e.g. platform-internal keys like `AUTH_SECRET` or
  `CREDENTIAL_ENCRYPTION_KEK`) is omitted because agents have no use for it, not as a security
  control. This deliberately relaxes the product's sandbox credential discipline — the
  product's rules serve its own threat model, which the pipeline does not share. Secrets still
  never go into the repo or the snapshot: a committed or cached-image copy is a different,
  broader exposure surface than a live sandbox.

### Branch push failure

The in-sandbox command's push step is the durability mechanism — it runs unconditionally
regardless of opencode's exit code (see Durability floor under Supervision, and the in-sandbox
command template under Per-claim). The push step retries with bounded backoff (e.g. 3 attempts
with exponential backoff: 1s, 5s, 15s) on transient failures (network errors, rate limits). A
permanent failure (all retries exhausted) writes a `push-failed` marker file to a known path on
the sandbox disk, containing the exit code, the last git error, and the retry history.

The collecting pass checks for the `push-failed` marker before destroying the sandbox. If the
marker exists, the pass attempts one recovery push itself (from the sandbox's working tree, via
the Daytona session API) — if the recovery succeeds, the work is durable and the node proceeds
to classification; if the recovery fails, the pass parks the node with QUESTION carrying the
push error, preserving the sandbox (stopped, not destroyed) for manual recovery. The human can
push the branch manually from the sandbox and answer the park, or investigate why the push
failed (credentials, network, branch-lock).

**The "push step never ran" case does not occur** (verified spike 2026-07-23: the template's push
step runs unconditionally — via a trap, wrapper, or `;`-separated command — so opencode exiting
non-zero does not prevent the push; see `docs/todo/spike-push-on-failure.md`). The template
records opencode's exit code separately (for the classifier) and pushes in all cases. This
preserves the durability floor for `failed` outcomes: the partial work is on the chain branch,
not lost with the sandbox. The merge-trigger gate (only `completed` merge-point nodes trigger
the merge queue — see Reconcile pass step 6) quarantines the broken work: a `failed` node's
branch is never merged.

**Orphaned branch cleanup.** A `failed` node's branch sits on origin — the merge cycle only
deletes merged branches, so a `failed` node's branch is never deleted by the merge cycle. A
retry overwrites the same branch name (`pipeline/<runId>/<chainId>`), so a single retry cleans
up. A node that exhausts `maxAttemptsPerNode` leaves a permanent orphan. The scoped reaper (or
a periodic garbage-collection pass) deletes chain branches whose nodes are all terminal
(`completed`-and-merged, `failed`-and-exhausted, or `abandoned`). This is a hygiene improvement,
not a correctness fix — the broken work is quarantined by the merge-trigger gate, not by branch
deletion.

### opencode concurrency

Isolated storage per agent prevents the identity collision observed when multiple opencode
instances share git identity. For the sandbox tier this is moot — separate machines have
separate storage by definition. The isolated-storage pattern is what the sandbox recipe
inherits (each sandbox gets its own storage by machine isolation).

- **Known failure** (see the `n8n-workflow-authoring-gotchas` memory): `opencode run` from a
  second worktree *or* a standalone `git clone --local` at a different path, while a real
  pipeline session was active, failed instantly with `UnknownError: Unexpected server error` —
  before the LLM was called. The session log showed the second instance was assigned the *same*
  internal project identifier as the live repo despite a different `directory=`: opencode keys
  "project" off git remote/repo identity, not filesystem path.
- **Also observed:** three opencode processes (`opencode serve`, a TUI session, a pipeline
  `opencode run`) running simultaneously with cwd = this repo, no collision. Same-path
  coexistence was never the failure mode — different-path worktrees sharing git identity were.
- **The lever:** pointing each agent at an isolated storage directory
  (separate opencode storage per agent), with `--dir <path>` setting the working directory.
  Per-agent `--dir` plus isolated storage gives fully separate storage and cwd. Tested with
  worktrees of this repo sharing its git identity, run concurrently
  while a live session was active against the main repo (the exact condition of the original
  failure): zero failures across 11 runs. Every instance was
  assigned the same `projectID` (git-identity-derived, identical to the live main-repo session);
  opencode's project refresh listed all 7 dirs sharing that ID. **The identity collision did not
  recur.** The `UnknownError: Unexpected server error` was a shared-mutable-state collision in
  common storage, not a fundamental git-identity problem. Isolated storage per agent removes the
  shared mutable state; same-projectID coexistence is safe.
- **Shared-storage caveat (observed, not blocking):** a shared opencode storage directory has a
  schema-migration race at cold start — when multiple instances simultaneously run migrations on
  a fresh storage directory, one fails with a `CREATE TABLE workspace` error. Pre-warming the
  storage (one instance migrates first) eliminates the race. Isolated storage sidesteps it
  entirely, which is why the recipe uses it. Both the devcontainer and the sandbox tier run
  opencode v1.17.20, which uses a SQLite database at
  `~/.local/share/opencode/opencode.db` — hence the `CREATE TABLE` SQL error. The
  isolated-storage prescription applies uniformly to both tiers.
- **Remaining scope (not tested):** the experiments used a trivial prompt (startup + one LLM call).
  Heavier concurrent interactions — tool use, file writes, permission prompts, long sessions,
  `--continue`/`--fork`, `--attach` to a shared server — could still surface a collision. The
  recipe is confirmed safe for the *process*; richer agent interactions need their own test
  before the dispatcher relies on them.

### Park/resume for human questions — mandatory

- When an agent's output classifies as outcome `QUESTION`, the node is **parked**, not failed.
  The canonical parked state is the journal entry (status `parked` — a third status, not
  `success`, not `failed`, so a question is never misread as a defect), carrying sandbox ID,
  session ID, and question text. The pass that parks stops the sandbox and triggers the small
  n8n question-form workflow, which fires ntfy with the form URL and suspends on its Wait node
  (durable across n8n restarts). If the suspension is ever lost, a pass can re-fire it from the
  journal — n8n is the surface, not the record.
- The sandbox is stopped while parked: disk and opencode storage survive a Daytona stop, so
  parking costs nothing while the question waits (the human-response window is unbounded — the
  existing no-timeout limitation on questions carries over; lifecycle timers are set so a long
  park cannot be auto-deleted — see Sandbox lifecycle). Verified: stop ~2.3s,
  start ~0.8s, opencode storage directory preserved identically across the cycle.
- Other agents are unaffected; nothing finished is discarded or re-run.
- An answer resumes exactly one session: the human submits the form, n8n writes the answer to
  the inbox and invokes the dispatcher, and the next pass starts the sandbox and issues
   `opencode run --format json --session <id> --dir <sandbox-repo-path> "<answer>"` async, journaling the
   resume. The session ID is the one captured at launch (opencode auto-generates IDs —
  `--session` is resume-only, so the template captures it via `opencode session list --format
  json` after the initial run; see the per-claim recipe). Agents still never talk to n8n.
- This path is also how human-involved chains run: a chain whose instructions require human
  action (e.g. setting up credentials) is still a normal chain — the skill run reads the work,
  asks, parks, resumes with the answer. There is no separate human-task node type.
- **Park/resume is required from the first rollout step, no fail-and-retry stopgap.**
- Precondition to watch: `_bmad-output/decision-policy.md` (human-authored, agent-facing — kept
  in gen-3) currently drives questions to near zero in the gen-2 loop. Every residual question
  multiplies by N agents; keeping the question rate near zero is what keeps N agents from
  becoming N interruptions.

### Conflicts are evidence, never silently resolved

- No silent last-write-wins anywhere. Lockfile diffs count as conflicts.
- A merge-queue failure is journaled as an event with a stable fingerprint (e.g.
  `merge-conflict-<chainId>`) in the gen-3 journal, so recurrence is a query away and coupled
  chains are identified from data, not guesses. This is written for a future reflector to
  read, but no reflection machinery exists in gen-3 — a human (or a later tool) queries the
  journal.
- A merge-queue fallback (rework, re-run) does not consume a node attempt
  (`maxAttemptsPerNode`, gen-3 dispatcher policy); genuine node failures count exactly as
  chain attempts do today.

### Merge cycle

The merge queue's unit of work. The entire merge cycle — fetch, rebase, merge, push —
runs on a sandbox created for the merge cycle's duration (seconds); the
devcontainer checkout is the human's working copy and never hosts pipeline git operations —
the same fact that put conflict resolution in sandboxes. A dedicated local clone was rejected:
a second repo to maintain, plus a crash-recovery surface (a reboot mid-rebase leaves rebase
state to detect and abort) that a disposable merge cycle simply doesn't have.

**Tests are not part of the merge cycle**. The pipeline merges branches
without running tests — a merge is git integration (fetch, rebase, merge, push), not a quality
gate. A post-merge hook — project-authored, configured in the policy block — fires after the
merge lands. If the hook fails, the failure is a standard `failed` outcome that rides the
existing remediation path (conflict-mode planning run → resolution node or rework — see
Merge-conflict resolution). A project with no tests configures no hook; early-phase doc work
(BMAD phases 1-2) simply merges. This is what makes the pipeline general: it integrates branches
the same way whether the content is code, docs, or anything else. The merge queue does not
assume tests exist, does not assume a test framework, does not assume a package manager install
is meaningful. See Pipeline vs. project-specific customization.

- **Hosted like planning.** The n8n merge-queue workflow mirrors the planning-host pattern:
  Execute Command runs a merge wrapper that holds a non-blocking `flock` on `merge.lock` for
  the merge cycle's lifetime — mutual exclusion (at most one merge cycle in flight, so the trunk branch has one
  pipeline writer at a time) plus the liveness probe — records its PID and sandbox
  ID alongside the lock, drives the sandbox via the Daytona session API, writes any report to
  the inbox, and invokes the
  dispatcher on exit.
- **The merge cycle, in order.** Create a sandbox (same per-claim provisioning as a node claim);
  `git fetch`; short-circuit if the chain branch's
  head is already an ancestor of the trunk branch (delete the branch, done); checkout the
  chain branch; rebase onto `origin/<trunkBranch>` — a conflict aborts the rebase and the wrapper
  writes the conflict report (see Merge-conflict resolution); merge and push
  `origin/<trunkBranch>`; delete the chain branch on origin; destroy the sandbox (single-use — see
  Sandbox lifecycle). If a post-merge hook is configured, fire it after the push; a hook
  failure is journaled as a `failed` outcome with the hook's output, and the chain enters
  the standard remediation path (see Merge-conflict resolution).
- **The push is the commit point.** Everything before it is sandbox-local and disposable: a
  merge cycle that dies mid-run has changed nothing durable, and one that dies after the push
  has merged — the next merge cycle's short-circuit cleans up the leftover branch. A rejected push
  (the trunk branch moved under the merge cycle — e.g. a human pushing to it) is not an error: the merge cycle exits
  and the next trigger runs a fresh one against the new trunk.
- **Level-triggered, supervised like everything else.** No pass "hands off" to the merge queue
  and forgets: any pass that finds a completed merge-point node whose branch has neither
  merged nor a pending conflict report, with `merge.lock` acquirable **and capacity available**
  (the merge sandbox counts against `maxConcurrentSandboxes`; if the cap is full the trigger
  defers to the next pass), (re)triggers the
  workflow. Merge triggers are evaluated before node claims in step 6, so a pending merge gets
  first claim on capacity freed this pass (verified spike 2026-07-23 — see
  `docs/todo/spike-merge-trigger-starvation.md`). A merge cycle killed by an n8n restart has the same caveat as a planning run
  (spike 2026-07-22, see `docs/todo/spike-execute-command.md`):
  the wrapper is a child of Execute Command, and n8n restart does **not** kill it — the
  orphaned child is reparented to init and keeps holding `merge.lock`, so the pass reads the
  lock as held and never re-triggers, stalling the merge queue silently. The same
  parent-alive-check fix (deferred to a follow-up) covers both wrappers. Until then, an n8n
  restart during a merge cycle requires manual recovery: kill the orphaned process by its
  recorded PID, then the next pass re-triggers a fresh merge cycle. Deadline enforcement is
  pass-side via the recorded PID, like planning. A dead merge cycle's sandbox is accounted for by the recorded sandbox ID — the pass destroys it (single-use, see
  Sandbox lifecycle; a half-finished rebase is exactly the state single-use exists to never
  clean up) and the re-triggered merge cycle creates a fresh one.
- **Credentials.** The sandbox pushes the trunk branch with the same repo credentials agents already use
  for their branch pushes (see Credentials under Sandbox lifecycle).

### Merge-conflict resolution

One path for every failure: an agent in a resolution node. Conflict resolution modifies files,
and file-modifying work runs in sandboxes as graph nodes — never on the devcontainer, whose
checkout is the human's working copy. The merge queue never resolves anything, not even a
lockfile.

- **The merge queue detects, reports, and stops.** On a conflict the merge cycle aborts the rebase
  in its sandbox, and the wrapper writes a conflict report to the inbox — chain, merge-point
  node, conflicted files, diffstat, the
  stable fingerprint (see Conflicts are evidence) — and invokes the dispatcher; the report is
  durable before the invocation, like every other input. The pass folds it: journal append
  (the commit point), then `graph.json` marks the chain blocked. Successors stay unready under
  the existing rule; other chains are unaffected.
- **A conflict-triggered planning run authors the response.** A pass that finds a
  conflict-blocked chain with no response yet in the graph and no planning run in flight
  triggers a planning run in conflict mode — the trigger is machinery, the content is the
  planner's, exactly like expansion; the planning lock serializes it and pause gates it like
  any other launch. The prompt carries the journaled conflict details. The planner chooses per
  the chain-composition guidelines: append a **resolution node** (the common case), or
  **replan for rework** when the conflict reveals semantic divergence — the merged upstream
  invalidated this chain's approach, so resolving hunks would merge wrong content. Routing
  through the planner keeps "every node is authored by the planning agent" intact, and the
  response needs planning judgment anyway: the same delta rewires the unclaimed successors'
  `dependsOn` to the resolution node, appends a review node after a heavy resolution (a
  resolution commit otherwise lands on the trunk branch having bypassed the chain's review nodes), and can
  serialize a chronically conflicting chain pair (the fingerprint history is in its context).
- **The resolution node is a normal node.** Claimed by a pass, run in a sandbox on the chain
  branch, supervised, parked on QUESTION like any other; it carries `mergeTo`, so its
  completion re-triggers the merge queue under the merge-when-marked rule. Its job: rebase the
  chain branch onto `origin/<trunkBranch>`, resolve preserving both sides' intent, push. Two mechanical
  differences from other nodes: its push is a forced update of the chain branch (the rebase
  rewrites the segment's history — safe because the chain is blocked, nothing bases on the
  stale head, and the journal records the new head at collection), and the merge queue accepts
  the pre-rebased branch (its own rebase step finds nothing to redo unless the trunk moved again).
- **Rework abandons the segment.** When the planner chooses rework, the delta marks the
  conflicted segment abandoned (`abandonSegment` with the chain's `chainId`) — the pass
  journals the abandonment and deletes the chain
  branch — and the replacement nodes base on merged trunk under the normal rules (same branch
  name, new segment, like the first node after a merge point).
- **Rounds are bounded.** If the trunk moved while resolution ran, the retried merge can conflict
  again — a new report, a new round. A per-merge-point round bound in dispatcher policy stops
  the automatic path: exhaustion notifies the human (error-notification workflow) and leaves
  the chain blocked for a human replan. Merge-queue fallbacks still consume no node attempts
  (see Conflicts are evidence); the round bound is its own knob.
- **The human enters through the park, never around it.** A resolution agent that cannot
  resolve confidently parks with QUESTION — the standard path. The human answers with
  guidance, or resolves manually on the dev machine, pushes the chain branch, and answers the
  park saying so; the resumed session verifies and completes, and its completion re-triggers
  the merge. Manual resolution never bypasses the parked node — two owners of one blocked
  branch is how state diverges.
- **Same path for a post-merge hook failure.** A clean merge whose post-merge hook fails is
  the same evidence class (a `failed` outcome with a fingerprint) and gets the same remedy:
  report, conflict-mode planning run, resolution node or rework. The report carries the hook's
  output, so the planner and the human read the actual failure, not a summary that outlived its
  n8n execution. A project with no hook configured has no failure path here — the merge lands
  and the chain proceeds.

### Dependency knowledge for the graph

- Multiple review nodes modify the same files — `bmad-code-review` applies patches,
  `bmad-testarch-test-review` fixes markers and removes stubs, `bmad-testarch-nfr` applies
  remediations. Gen-3 does not classify skills into read-only and file-modifying: all nodes
  are assumed to modify files, so a chain is a total order and review
  ordering is each node's position in the chain — a per-chain planning decision the graph
  makes visible instead of burying in a step sequence. Which order suits a given chain rests
  on the chain-composition guidelines carrying the ordering advice — a guideline the agent
  follows, not a structural guarantee.

## Honest costs

- The graph encodes *declared* dependencies only. Unknown coupling surfaces later as merge-queue
  conflicts and rework. The main win is throughput (chains per day); a chain is a total order
  (all nodes are assumed to modify files), so node granularity buys per-node supervision and
  composition flexibility, not within-chain latency.
- A mid-chain merge point inserts merge-queue latency (rebase → merge, serialized across
  all chains) between two chain segments, and each one adds a merge-queue run. The
  chain-composition guidelines should mark one only where it buys something — a dependent chain
   to unlock — not by default. The whole merge cycle runs on a sandbox created per merge cycle,
   so merge-queue compute never competes with the human's dev
   servers or Postgres on the devcontainer — the merge cycle's sandbox counts against
  `maxConcurrentSandboxes` for its duration (seconds), reducing node-claim capacity by one
  during that window. The merge cycle does not run tests; a post-merge
  hook, if configured, runs project-specific validation after the merge lands. Mid-chain merge
  points multiply the merge-cycle cost, which is why the
  guidelines mark one only where it earns it. Because the merge sandbox shares the cap with
  node claims, step 6 evaluates merge triggers before node claims so a pending merge gets first
  claim on capacity freed this pass — without this ordering, depth-first claiming can consume
  every freed slot before the merge trigger is evaluated, deferring merges by hours under
  steady-state contention (verified spike 2026-07-23 — see
  `docs/todo/spike-merge-trigger-starvation.md`). A fallback — reserving one slot for merge
  cycles by setting the effective node-claim cap to `maxConcurrentSandboxes - 1` (only when
  `maxConcurrentSandboxes ≥ 3`) — is documented if production data shows merge-trigger latency
  exceeding bounds despite the ordering fix.
- An early-merged artifact is a promise. A chain implementing against a merged artifact's
  schemas and contracts reworks if the upstream implementation later diverges from the artifact —
  divergence is not a file conflict, so the merge queue cannot catch it; it surfaces as rework,
  journaled like any other conflict evidence.
- Every merge conflict — a trivial lockfile collision included — pays the full resolution
  path: conflict report, planning run, sandbox claim, agent run, merge-queue retry. That is
  hours on the blocked chain, accepted to keep one resolution path; other chains
  proceed meanwhile, and a chronically conflicting chain pair is a planning signal (serialize
  them), not a latency problem to optimize.
- Chains are composed from a snapshot of knowledge that reality can overtake: an upstream
  artifact, a question answer, or a parallel chain's merge can reveal a planned node
  unnecessary while its chain is in flight. Unclaimed nodes are pruned by planning runs —
  lazy composition and the answer-fold trigger close the common windows — but a claimed spec
  is frozen, so a claimed no-op executes: a sandbox claim plus a short run concluding
  "nothing to do", journaled with an empty diff and short-circuited at the merge queue. One
  no-op is deliberate and stays: the verify-run after a manual conflict resolution (see
  Merge-conflict resolution).
- Post-scope finalization audits (trace, NFR, bug-hunt) may run while next-scope work merges —
  full overlap is permitted — so their evidence is a snapshot that later merges can
  invalidate. The guidelines advise the planner on when to hold
  next-scope composition back; machinery enforces no between-scopes quiet point (see Scope
  lifecycle).
- **No test safety net in the pipeline**. The merge cycle does not run
  tests; a broken merge lands on the trunk branch and propagates to downstream chains until a post-merge
  hook (if configured) catches it or a human notices. This is the trade-off for generality:
  the pipeline works for doc-only projects, early-phase projects with no tests, and code
  projects alike. A project that wants gates configures a post-merge hook; a project that
  doesn't, accepts unguarded merges. The hook failure rides the standard remediation path —
  no new failure mode.
- Outcome classification calls an LLM from inside a pass — a few seconds per exited session
  (verified spike 2026-07-23: avg 4.3s, max 15.8s — see `docs/todo/spike-lock-hold-time.md`),
  within the seconds-long pass budget. A batch of N=5 exits measured 16.0s total lock-hold —
  coalescence holds, no blocked operation suffers a functional defect. The classification LLM
  call has an explicit 15s timeout; a budget guard (defer remaining exits if lock-hold exceeds
  45s) is the documented fallback if production data shows the budget exceeded.
- The practical caps on parallelism are the Daytona quota and the max-concurrent-sandboxes
  policy knob — n8n execution concurrency no longer participates: the executions that block
  on commands (merge queue, planning host) are serialized by their own locks (`merge.lock`,
  `planning.lock`), so concurrent n8n executions coalesce to one.
- 5 concurrent sandboxes consume Daytona account quota (30 GiB shared disk) and API rate limits.
  Shallow clones and scoped cleanup keep this bounded. The 30 GiB is shared across
  dev/test/prod — the pipeline must label and scope its sandboxes or reproduce the product's
  quota-exhaustion problem.
- Human attention becomes the scarce resource; the question inbox and a near-zero question rate
  are what keep N agents from turning into N interruptions.

## Path (incremental, each step independently useful)

1. The opencode concurrency experiment is complete. Isolated storage per
   agent is safe at N=6. Moot for the sandbox tier (separate machines), but confirms the
   isolated-storage pattern the sandbox recipe inherits. See the opencode concurrency section
   and spike finding F3.
2. **Build the custom snapshot and per-claim provisioning** (gates the sandbox tier):
   - Build a custom Daytona snapshot via the Declarative Builder: Node.js, Yarn, Postgres,
     Playwright browsers, opencode, and the repo's dependencies pre-installed. This eliminates
     the per-sandbox install step and makes claim-to-start fast. **Bake the shallow clone
     itself into the snapshot (Strategy A — verified by
     `docs/todo/spike-baked-node-modules.md`):** bake a shallow clone plus
     `runCommands('npm install')` during the build (a `git clone` alone has no `node_modules`
     — gitignored), and chown the baked checkout to uid 1001 via `dockerfileCommands(['USER
     root', 'RUN chown -R 1001:1001 /workspace/repo', 'USER 1001'])` after the `COPY` +
     install — the `user: 'root'` create param is ignored (spike findings F1, F3, F4).
   - Per-claim provisioning: the dispatcher creates a sandbox at claim time (capped by
     `maxConcurrentSandboxes`), provisions it (fetch to current — the clone is baked in, so
     provisioning fetches instead of cloning — plus secrets and config copy),
     checks out the claim's base, and destroys the sandbox when the session exits (single-use —
     see Sandbox lifecycle). No pool to build. Measure create-from-cached-snapshot latency
     here — claim-time creation depends on it being the seconds the docs promise; if it is
     slower in practice, move the provisioning commands into the front of the async in-sandbox
     command.
    - Scoped reaper: destroy orphaned sandboxes on dispatcher crash — don't reproduce the
      product's 30 GiB quota-exhaustion problem. Label every sandbox with `scope: pipeline` and
      a `runId` at creation (verified viable — see `docs/todo/spike-label-scoping.md`).
   - Verify Yarn 4 Berry works with adequate disk (the initial failure was almost certainly the
     3 GB default disk, not a platform incompatibility).
3. Build the per-agent machinery: the in-sandbox command template (opencode run with `--format json`, exit capture,
   unconditional terminal branch push with bounded retry + `push-failed` marker — see Branch push failure), session start/poll/continue via the Daytona session API, the
   classification module (deterministic rules + LLM fallback, prompt ported from gen-2),
   deadline enforcement (terminate + journal + handle per retry policy; see Timeout policy), park/resume with a synthetic question
   (including sandbox stop/start around the park), transcript pull and sandbox destroy at
   collection, the small question-form workflow, and conflict-as-evidence journaling. Restart n8n mid-run and verify the next pass reconciles
   correctly (collects finished work, keeps polling running work). Exercise the health checks:
   make a pass fail (bad input) and verify the tick fires the error notification; hold
   `last-pass.json` stale and verify the stall alert fires. Test against disposable
   sandboxes with synthetic steps before any real BMAD skill run.
 4. Introduce the graph: `dependsOn` edges in planning output (chains composed per the
    guidelines — author `chain-composition-guidelines.md` first, per open question 1's
    requirements), `graph.json` and the reconcile pass with the plan-2-ahead / bounded
    depth-first policy, node-granularity claims with chain branches, the planning-run machinery (launch
    wrapper, planning lock, n8n host workflow, delta validation and fold, process-vanished
    relaunch), and the
    pause/resume gate on claiming (with its helper script). First taste
    of parallelism: two independent nodes from different chains as two concurrent sandboxes.
    This is the permanent design — sandboxed agents supervised by level-triggered passes; no
    per-worker supervisor exists anywhere. Tune the tick cadence here, and exercise pause: pause
    mid-run, watch in-flight nodes finish with nothing new claimed, resume.
5. Move "done" from workflow-return to branch-merged: merge queue (n8n workflow + merge
   wrapper) + Mermaid graph view. Agents push their own branches; a pass that finds a
   completed merge-point node not yet merged triggers n8n's merge queue (level-triggered); no
   event-ingest webhook — canonical state is written only under the pass lock. The merge queue runs
    the whole merge cycle — rebase, merge, push — on a sandbox created per merge
     cycle, serialized by `merge.lock`. **No tests in the merge
     cycle**; a post-merge hook, if configured, fires after the merge lands.
    Restart n8n mid-merge-cycle and verify the
   next pass re-triggers a fresh merge cycle. Exercise a mid-chain merge point: an early
   node merges its artifact and a dependent chain starts against it while the first
   chain is still running. Exercise the conflict path with a synthetic conflict: inbox report
   → conflict-mode planning run → resolution node → merge retry (see Merge-conflict
   resolution).
6. Upgrade the viewer to `viewer.html` when interactivity earns it.

First real parallel run should be manual and supervised, including at least one supervised park.

## Open questions

1. Chain-composition guidelines document — requirements specified below; the document itself
   is authored during implementation (Path step 4). The mechanical half (graph delta format,
   op vocabulary, envelope, wrapper promotion, all-or-nothing fold — see Graph delta format)
   and the context contract (what the planner knows and may touch — see Planning-run context)
   are decided. What remains is the document the planner reads as standing context — its
   identity, required sections, and success criteria.

   ### Identity

   - **Name:** `chain-composition-guidelines.md`
   - **Location:** `pipeline3/state/chain-composition-guidelines.md` — same tier as
     `decision-policy.md` (human-authored, agent-facing), co-located with the policy block
     and gen-3 state so the planner reads it from the same directory it reads `graph.json`
     from. The planner's prompt points to it; it is not auto-discovered.
   - **Audience:** the planning agent (an LLM running opencode on the devcontainer). Written
     for an LLM reader: patterns and decision rules it can internalize and apply, not a
     reference manual a human browses. The planner reads it every planning run alongside the
     per-run prompt, the graph state, and the backlog.
   - **Role:** the planner's "how to think about composing chains for this project" reference.
     It carries project-specific semantics (story, epic, phase, sprint vocabulary) alongside
     the immutable graph rules restated in planner-facing language. The immutable rules are
     also in the planner's prompt; the guidelines give them context and vocabulary. The
     machinery enforces graph-shape rules; the guidelines tell the planner what nodes to
     compose for a given unit of work.
   - **Relationship to gen-2:** seeded from the gen-2 playbook step sequence (create-story →
     validate → prepare-tests → validate-2 → implement → unit-tests → e2e-tests →
     code-review → test-review → NFR-review → update-project-context → commit) and the
     human's manual post-scope flow (`sprint-flow-draft.md`). The planner never reads
     `playbook.json` or any gen-2 file; the guidelines are authored fresh from that seed.

   ### Required sections

   The document must contain these sections. Each section's content requirements are below.

   #### 1. Chain composition principles

   The immutable graph rules, restated in the planner's own vocabulary. These are the rules
   the fold enforces mechanically; the guidelines restate them so the planner reasons in
   terms of them rather than discovering them as rejection errors:

   - A chain is a total order — all nodes modify files, so they cannot run concurrently on
     one branch. Within a chain, `dependsOn` is simply the previous node.
    - Every chain's final node carries `mergeTo: <trunkBranch>` (the project's configured
      trunk branch — see `trunkBranch` in the policy block). A final node without `mergeTo` is a
     planning error rejected at fold time.
   - Cross-chain `dependsOn` edges may only target merge-point nodes (nodes carrying
     `mergeTo`). An edge to an unmarked node is rejected at fold time.
   - The graph stays acyclic.
   - A claimed node's spec is frozen; replanning touches only unclaimed nodes. The planner
     should prefer additive changes near nodes likely to be claimed while planning runs, and
     touch unclaimed nodes only.
   - The planner never composes past an information-producing node (see lazy composition
     below). This is the single most important planning decision; the guidelines must make
     the concept unambiguous.

   #### 2. Chain patterns

   Templates for common chain shapes. Each pattern states: when it applies, what nodes it
   gets, where the merge points are, where lazy composition cuts the chain, and what
   metadata the nodes carry. The patterns are advice, not templates stamped blindly — the
   planner adapts them per the unit of work's content.

   **2a. Story chain** (seeded from the gen-2 playbook). The gen-2 step sequence rewritten
   as advisory content:

   - **First segment:** `create-story` node only. This is the type case of an
     information-producing node — its artifact (the story spec) determines what the rest of
     the chain should be. The planner composes this one node and stops. If another chain
     depends on the story artifact (e.g. a chain implementing against the story's schemas and
      contracts), `create-story` carries `mergeTo: <trunkBranch>` as a mid-chain merge point; otherwise
      it does not, and the chain continues on the same branch after the artifact is produced.
      Either way, the planner does not compose past it — the next segment is composed in a
      later planning run once the artifact is readable at `origin/<trunkBranch>`.
    - **Second segment** (composed after `create-story`'s artifact lands on the trunk branch): validate
      (1st pass) → prepare-tests → validate (2nd pass) → implement → unit-tests → e2e-tests →
      code-review → test-review → NFR-review → update-project-context → commit (final node,
      carries `mergeTo: <trunkBranch>`).
   - **Include/skip conditions per step** — each step carries a condition stating when it
     applies. These are empirical hypotheses, not immutable rules: empty-diff evidence in
     the journal is what shows a condition is wrong. A verification node that finds nothing
     produced information and stays; a generation node that finds nothing was waste and its
     include condition tightens. The conditions the document must specify:
     - `prepare-tests`: skip if the story has no testable behavior (e.g. a story whose
       substance is human-performed setup — there is no automatable behavior to scaffold
       tests for).
     - `e2e-tests`: skip if the ATDD checklist deferred E2E coverage because no
       browser-level mock can simulate the acceptance criteria. The planner reads the
       checklist from the prepare-tests artifact (on the trunk branch) to decide.
     - `validate (2nd pass)`: skip if prepare-tests made no changes to the story spec (the
       story didn't need updating after tests exist).
     - `review-nfrs`: include always — even a story with no code changes may have NFR
       concerns; the NFR review determines whether there are findings, not whether the step
       runs.
     - `update-project-context`: skip if no new repeatable patterns emerged (the step itself
       decides; the include condition is "always include, the step may be a no-op").
   - **Within-chain review ordering:** code-review → test-review → NFR-review. All nodes are
     assumed file-modifying, so ordering is chain position. The guidelines advise on when
     this order might change: if test-review finds fundamental issues that invalidate the
     code-review's patches, the planner appends a re-implementation node and a re-review — a
     replan, not a different initial order. The default order is advice; the planner may
     deviate with a reason journaled in the node's prompt.

   **2b. Scope-finalization chain** (seeded from `sprint-flow-draft.md`). Composed late,
   once the scope's work chains have all merged. The first node's `dependsOn` fans in to
   every work chain's final merge-point node — legal under the cross-chain-edges-target-
   merge-points invariant. The chain is full of information-producing nodes, so lazy
   composition applies with force — the sequence unfolds across several planning rounds:

   - `bmad-bug-hunt` (target: the scope). The fidelity audit stays folded into bug-hunt, not
     a separate node. **Information-producing:** findings determine whether remediation nodes
     are appended in the next planning round.
   - `bmad-testarch-trace` (Create mode). **Information-producing:** a FAIL decision gets a
     fix node (`bmad-quick-dev` or `bmad-dev-story`) appended in the next planning round; a
     PASS continues to the next node.
   - `bmad-testarch-nfr` (Create mode for the scope). Not information-producing in the lazy
     sense — it audits and applies fixes, but its findings don't determine the next node's
     existence.
   - `bmad-quick-dev` — prune `deferred-work.md` by checking each item against the current
     codebase and removing resolved ones. **Information-producing:** if a finding is not a
     stale deferral (the code has changed but the deferral is still relevant, or the
     deferral describes a problem that has worsened), the node parks with QUESTION — the
     standard path, not a separate node type. The rule: ask when a finding is not a stale
     deferral; otherwise, report that work is completed.
   - `bmad-retrospective` (target: the scope). Produces a repo artifact; not
     information-producing.
   - `bmad-testarch-test-design` (Edit mode — revise the project's test plan to fit current
     reality). Not information-producing.
   - `bmad-agent-architect` — cleanup `project-context.md`: throw out redundant items,
     consolidate multiple items. Not information-producing. This is the final node; it
      carries `mergeTo: <trunkBranch>`.

    The finalization chain's lazy composition is more aggressive than the story chain's:
   bug-hunt and trace are both information-producing, so the planner composes bug-hunt first,
   then (after its findings land) composes trace, then (after trace's FAIL/PASS lands)
   composes the rest. The guidelines must state this explicitly — a planner that composes
   the whole finalization chain up front will pre-plan a fix node for a trace that hasn't
   failed yet.

   **2c. Early-phase doc chain** (BMAD phases 1-2). Each phase is a chain of doc-writing
   nodes: brainstorming → PRD → architecture → epics. Every node modifies files (markdown),
   so the total-order assumption holds. The merge cycle integrates without tests (the
   post-merge hook is absent or a no-op). Sequential composition is fine: one chain or a
   sequence of chains, as the guidelines advise. The skill for each node is the relevant
   BMAD skill (`bmad-brainstorming`, `bmad-prd`, `bmad-create-architecture`,
   `bmad-create-epics-and-stories`). Information-producing nodes: PRD and architecture both
   produce artifacts that determine downstream work, so lazy composition applies — compose
   the PRD node, stop, compose architecture after the PRD lands, stop, compose epics after
   architecture lands.

   #### 3. Skill catalog

   The atomic reference for every skill the planner may emit as a node. Each entry must
   specify:

   - **Skill name** (the `skill` field value, e.g. `bmad-create-story`)
   - **Agent type** (the `agent` field value: `planner` | `coder` | `reviewer` — which
     opencode agent runs the skill)
   - **Purpose** — one sentence: what the skill does
   - **Reads** — what it consumes (files, artifacts, state)
   - **Produces** — what it writes or modifies (files, artifacts)
   - **Default deadline** — an ISO duration (e.g. `PT2H`), tuned empirically from gen-2
     durations; the planner may override per node with a reason
   - **Information-producing** — `yes` | `no` | `conditional`. `yes` means the skill's
     artifact determines what the rest of the chain should be, and the planner must not
     compose past it. `conditional` means it depends on the outcome (e.g.
     `bmad-testarch-trace` is information-producing on FAIL — a fix node is appended — but
     not on PASS). This field is the single most load-bearing catalog entry: it drives the
     lazy-composition decision.

   The catalog must cover at minimum:

   | Skill | Info-producing | Notes |
   |---|---|---|
   | `bmad-create-story` | yes | The type case. Story artifact determines the chain. |
   | `bmad-testarch-atdd` | yes | Test scaffolding determines implementation tasks. |
   | `bmad-dev-story` | yes | Implementation determines test/review scope. |
   | `bmad-testarch-automate` | no | Validates/expands existing tests. |
   | `bmad-qa-generate-e2e-tests` | conditional | May defer (no info produced) or generate (info produced). |
   | `bmad-code-review` | no | Reviews and applies patches. |
   | `bmad-testarch-test-review` | no | Validates and fixes test quality. |
   | `bmad-testarch-nfr` | no | Audits NFRs, applies fixes. |
   | `bmad-agent-tech-writer` | no | Updates project context. |
   | `commit` | no | Commits changes. |
   | `bmad-bug-hunt` | yes | Findings determine remediation nodes. |
   | `bmad-testarch-trace` | conditional | FAIL → fix node appended; PASS → continue. |
   | `bmad-quick-dev` | conditional | Deferred-work pruning may surface a QUESTION. |
   | `bmad-retrospective` | no | Produces a repo artifact. |
   | `bmad-testarch-test-design` | no | Revises test plan. |
   | `bmad-agent-architect` | no | Cleans up project context. |
   | `bmad-brainstorming` | yes | Output determines PRD scope. |
   | `bmad-prd` | yes | PRD determines architecture scope. |
   | `bmad-create-architecture` | yes | Architecture determines epics scope. |
   | `bmad-create-epics-and-stories` | yes | Epic breakdown determines story chains. |

   The catalog is not exhaustive — the planner may emit a node for any skill or atomic CLI
   command. Entries for skills not in the catalog default to `information-producing: no`
   unless the planner has a reason to flag otherwise (journaled in the node's prompt).

   #### 4. Decision rules

   The tricky calls the planner must make, each stated as a rule with its rationale:

   - **Lazy composition:** never compose past an information-producing node. The planner
     composes up to the next information-producing node, then stops. The next planning run
      (triggered by the ready-node frontier running low after the artifact lands on the trunk branch)
     composes the next segment. Rationale: composing a whole chain up front from the backlog
     entry alone plans speculation, and depth-first claiming makes the mistake irreversible
     — the pass that folds the artifact-producing node's completion claims the pre-planned
     successor in the same pass, leaving no window for a replan to remove a node the
     artifact just revealed as unnecessary.
    - **Merge-point placement:** mark `mergeTo: <trunkBranch>` on a node only where a dependent chain
     exists to unlock. The classic case: `create-story` merges right away so another chain
     can start implementing against the artifact while this chain's own implementation is
     still running. If a replan drops the dependent, clear `mergeTo` on the unclaimed node.
     Rationale: a mid-chain merge point inserts merge-queue latency between two chain
     segments; mark one only where it buys something.
   - **Review ordering:** code-review → test-review → NFR-review (default). All nodes are
     assumed file-modifying, so ordering is chain position. The planner may deviate with a
     reason in the node's prompt. If a review finds fundamental issues, the planner appends
     a re-implementation node and a re-review — a replan, not a different initial order.
   - **Conflict resolution — in-place vs rework:** the common case is in-place resolution
     (rebase, resolve preserving both sides' intent, push). Rework is when the conflict
     reveals semantic divergence — the merged upstream invalidated this chain's approach, so
     resolving hunks would merge wrong code. The planner chooses per the conflict details
     (conflicted files, diffstat, fingerprint history from the journal). When a resolution
     is heavy (a resolution commit that bypassed the chain's review nodes), the planner
     appends a trailing review node after the resolution node.
   - **Scope overlap:** when to hold next-scope composition back. An in-flight trace or NFR
     audit whose evidence next-scope merges would invalidate → hold. Next-scope early work
     rarely disturbs a scope audit → overlap is safe. The planner decides per scope; this
     is guideline adherence, not construction.
   - **Scope selection:** the planner continues down the backlog in backlog order. When a
     scope's chains run out, the ready-node frontier runs low and the standard expansion
     trigger fires. A human override ("skip to epic 7", "start the architecture phase") is
     a replan instruction through the inbox. The guidelines state the backlog shape (epics
     files and sprint plan, or a phase list, or a research agenda) so the planner knows what
     to read.

   #### 5. Node-spec schema

   The concrete format the planner emits in `addNode` ops. The guidelines must state the
   schema with field names, types, and which fields are required:

   ```
   {
     "id":          <string, planner-authored, must be fresh — not colliding with any existing node id>
     "chainId":     <string, structural identifier the machinery reads — derived into branch name pipeline/<runId>/<chainId>>
     "skill":       <string, skill name from the catalog — or a CLI command>
     "agent":       <string, "planner" | "coder" | "reviewer" — which opencode agent runs the skill>
     "prompt":      <string, the prompt text passed to the skill — may carry step-specific instructions>
     "deadline":    <string, ISO duration — e.g. "PT2H" — from the catalog default or overridden with a reason>
     "dependsOn":   <string[], node ids — within a chain: the previous node; cross-chain: a merge-point node>
      "mergeTo":     <string, optional — the project's configured trunk branch (e.g. "main", "master", "develop" — see trunkBranch in the policy block) — present only on merge-point nodes; absence means no merge at this node>
     "metadata":    <object, free-form — project-specific fields the machinery never reads: story, epic, sprint, phase, scope>
   }
   ```

   Fields the planner must NOT emit (machinery derives them): branch names, `runId`,
   `sandboxId`, `sessionId`, `status`, `attempts`, `baseCommit`. The planner's only shared
   output is the graph delta; it writes nothing else.

   The fold-time validation rules, stated as rules the planner will be held to: a chain's
   final node carries `mergeTo`; cross-chain edges target merge-point nodes only; the graph
   stays acyclic; every chain remains a total order (a path). A delta that violates any of
   these is rejected as a whole.

   ### Success criteria

   The document is complete enough when:

   1. A human can read it and compose a chain by hand for a story, a finalization, and a
      doc-writing task — following the patterns and decision rules to the same node set the
      planner would produce.
   2. The skill catalog covers every skill referenced in the chain patterns, with the
      information-producing flag set for each.
   3. The include/skip conditions are specific enough to be wrong — a condition like "include
      e2e-tests always" is testable against empty-diff evidence and falsifiable; a condition
      like "include e2e-tests when appropriate" is not.
   4. The lazy-composition rule is unambiguous: given a chain pattern, the planner knows
      exactly where to cut (at each information-producing node) and what triggers the next
      segment (the artifact landing on the trunk branch → ready-node frontier low → expansion trigger).
   5. The node-spec schema is concrete enough that a planner emitting a delta produces
      valid JSON on the first try — no field names guessed, no derived fields emitted.
