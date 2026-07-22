# Plan: dependency-graph pipeline with parallel opencode agents

Status: draft vision, not started. This plan describes gen-3, the next architecture generation
for the pipeline — not a delta to the current loop. Read
[docs/self-improving-system-concept.md](../self-improving-system-concept.md) for the current
(gen-2) architecture. It supersedes and replaces the discarded stage-group parallelization plan
(`pipeline-parallelization-plan.md`, deleted 2026-07-17); everything still relevant from that
plan is folded in here.

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
  story is a chain of nodes composed for that story, not stamped from a fixed sequence (see
  Graph management rules); review steps are nodes of their own with explicit ordering edges. Any node
  whose dependencies are satisfied is claimable. Step and story ordering — not n8n — was the
  real obstacle to parallelism; making dependencies explicit is planning work, not plumbing
  work. A chain itself is a total order — all nodes are assumed to modify code and a chain
  shares one branch (see Graph management rules) — so parallelism is across stories, not
  within one; node granularity buys per-node supervision, retry, and composition flexibility,
  not within-story latency.
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
  surfaces that same-machine concurrency creates (discovered in session-history analysis,
  2026-07-17): cross-process homicide (`pkill -f` can't cross machine boundaries), fixed port
  binding (each sandbox has its own port space), shared test databases (each sandbox runs its
  own Postgres), and shared-file corruption (`sprint-status.yaml`, `deferred-work.md` are
  per-sandbox). The opencode identity-collision risk is also removed — separate machine,
  separate storage. Epic 6 built sandbox provisioning for the product; the pipeline copies the
  discipline patterns, not the code.
- **Git is the convergence point.** Every agent pushes a branch; a serial merge queue
  (rebase → test → merge) integrates one branch at a time. Integration is serialized, work is
  not — integration takes minutes, skill runs take hours. The whole merge cycle — fetch,
   rebase, install, test, merge, push — runs on a sandbox created per merge cycle (resolved
   questions 12 and 16), not on the devcontainer: the devcontainer already runs n8n, the
   dispatcher, the human's dev servers, and the human's Postgres, and its checkout is the
   human's working copy — pipeline git operations never touch it. The n8n workflow runs a merge
   wrapper that drives the merge cycle on the sandbox via the Daytona session API — same
   create-on-demand path as a node claim, held for minutes not hours — and the push to `origin/main` is the merge cycle's
   commit point: everything before it is sandbox-local and disposable (see Merge cycle under
   Worker sandbox design). A branch whose head is already an ancestor of main short-circuits at
   the start of the merge cycle: nothing to merge, no test run — the merge cycle just
   deletes the branch — so an empty-diff completion or a conflict that evaporated while its
   resolution was planned costs one git check instead of a full serialized merge cycle.
- **n8n keeps only small workflows:** the schedule tick that invokes the dispatcher, the
  question form + ntfy flow, the merge queue, the planning-run host, error notification, and
  sprint status reporting. Nothing per-worker, and nothing whose survival matters: the
  merge queue and the planning host block on commands for minutes, but canonical state never
  depends on an n8n execution surviving. n8n never writes canonical pipeline state — its
  workflows write only inbox files (a question answer, a merge-conflict report, an external event) that a pass folds in.
  There is no event-ingest webhook: every result is durable on disk (or in git) before the
  dispatcher is invoked, and every invocation is a contentless "wake up".

## What gen-3 keeps from gen-2, and what it discards

The rule applied throughout: **behaviors and small workflows carry over; engines and state do
not.** Gen-2's engines (the epic loop, the playbook interpreter, the session runner) dissolve
into gen-3 structures, and gen-2's state files stay with gen-2. (See
[docs/self-improving-system-concept.md](../self-improving-system-concept.md) for the gen-2
architecture.)

| Gen-2 piece | Fate in gen-3 |
|---|---|
| `Develop Epic` (n8n) | Dissolved — the epic loop becomes the graph plus dispatcher claiming; its reflect/learn steps are out of scope (see below) |
| `Develop Story (Playbook)` (n8n) + `playbook.json` | Dissolved — a story's chain is composed per story by the planning agent; each node spec carries its own skill/agent/prompt, so there is no playbook interpreter and no playbook file. The step sequence itself survives only as content for the advisory chain-composition guidelines (see Graph management rules) |
| `BMAD Session (OpenCode)` (n8n) | Dissolved — its behaviors (bounded runs, stream-truncation auto-continue, outcome classification, question form + ntfy resume) are reimplemented as pass logic plus one small question-form workflow; the workflow itself is not ported. Note: gen-2's INCOMPLETE was a within-session recovery signal for the LLM provider dropping a response mid-stream — the session was still alive and `opencode run --session <id>` resumed it (gen-2 did not use `--format json`). Gen-3 keeps the same within-session recovery, with `opencode run --format json --session <id>` resuming the session (see Supervision), not as a node outcome |
| `Parse OpenCode Response`, `BMAD Outcome` (n8n sub-workflows) | Logic ported — the deterministic rules and the LLM classification prompt move into the dispatcher's classification module; the sub-workflows stay with gen-2 |
| Reflect step, `apply-amendments.mjs`, `ledger.jsonl`, trends | Not inherited — self-improvement is out of scope for gen-3 (rationale below) |
| `runner-errors.jsonl` | Not inherited — machinery failures are `runner_error` events in the gen-3 journal |
| `journal.jsonl` (gen-2 schema) | Not inherited — gen-3 defines its own journal with its own schema (see State) |
| `scripts/pipeline/*.mjs` | Not imported — helper patterns may be copied into gen-3 modules, but gen-3 code has no dependency on gen-2 scripts |
| Error Handler (ntfy) (n8n) | Kept — small and generic |
| `_bmad-output/decision-policy.md` | Kept as an agent-facing artifact — human-authored, read by agents during interactive steps; it is what keeps questions rare. The reflector machinery around it is not inherited |

**Why self-improvement is out of scope.** Two reasons, both structural. First, gen-2 reflects
*between stories* — a quiet point that exists only because the epic loop is sequential. With N
concurrent agents there is no between-stories; the only serialization point is the merge queue.
A reflector for gen-3 must be designed for that world (hook the merge queue, or run on a
schedule against the journal) — porting the gen-2 one buys nothing. Second, carrying the
substrate without the consumer is pure cost: it constrained storage format choices, imported
policy vocabulary (`maxAttemptsPerStory`, `addStepRecurrenceThreshold`), and motivated features
like playbook version pinning that only make sense with a live amendment loop. Gen-3 therefore
journals everything a future reflector would want to read (outcomes, durations, conflicts,
machinery errors — see Conflicts are evidence), but defines no reflection machinery and writes
nothing to gen-2's files. When a reflector is built, it is a separate consumer of gen-3's own
journal.

## Graph management rules (decided)

- **Node = one skill run** (BMAD-agnostic — any skill, or another atomic action like a CLI
  command). A story is a *chain* of nodes connected by `dependsOn` edges.
- **Chains are composed per story, not stamped from a template.** The planning run reads the
  story's content plus a human-authored, agent-facing guidelines document — the successor of
  the gen-2 playbook sequence, demoted to a suggestion and authored fresh (its content is
  seeded from the gen-2 step sequence; the planner never reads `playbook.json` or any other
  gen-2 file); same category as `decision-policy.md` —
  and decides which nodes the story's chain gets. Stories differ: a story whose substance is
  human-performed setup (e.g. the human configures credentials) gets no e2e-test node, because
  there is no automatable behavior to test. The guidelines say when a step applies, not that it
  always does. Human involvement needs no special node type — a normal skill run (e.g.
  dev-story) reads the story, halts with a question, and rides the standard
  QUESTION → park → resume path.
- **Chains share a branch and merge at merge points.** A story chain works on one branch
  (`pipeline/<runId>/<story>`). A node spec may carry `mergeTo: <branch>` — the only target for
  now is `main` — marking a merge point: when that node completes, the pass triggers the
  merge queue for the chain branch. Every chain's final node carries `mergeTo` (the guidelines
  instruct the planner; the dispatcher's rule is just "merge when marked", no chain-end special
  case — a final node without `mergeTo` is a planning error rejected at fold time). A mid-chain
  merge point exists to unlock a dependent story early: e.g. a create-story node whose story
  doc specifies schemas and contracts merges right away, so another story can start
  implementing against the doc while this story's own implementation is still running. Like the
  rest of the spec, `mergeTo` freezes at claim; replanning toggles it only on unclaimed nodes.
- **All nodes are assumed to modify code, so a chain is a total order** (decided 2026-07-21).
  Two code-modifying nodes can never run concurrently on a shared branch — both would push to
  the same head — and gen-3 keeps no read-only node class to except from that rule. Within a
  chain, `dependsOn` is simply the previous node; the only branching in the graph is
  cross-story, at merge points. Node-spec field names are camelCase (`dependsOn`, `mergeTo`,
  `maxAttemptsPerNode`) — the state is JSON written and read by JS code.
- **Basing and readiness follow the merge points.** The successor of an unmarked node is ready
  when the predecessor's head is pushed and bases on it — same branch, same segment. The
  successor of a merge-point node is ready when the merge *lands* and bases on merged main,
  starting a fresh segment: the merge queue deletes the merged branch and the successor's claim
  recreates `pipeline/<runId>/<story>` from main — same name, new segment; the journal records
  each claim's base commit. Cross-story `dependsOn` edges may only target merge-point nodes,
  keeping "cross-story dependencies gate on a merge" an invariant rather than a convention — an
  edge to an unmarked node is rejected at fold time. A failed mid-chain merge blocks the chain
  like any merge failure: journaled as a conflict event; successors simply never become ready
  until it is resolved (resolution is itself a graph node — see Merge-conflict resolution).
- **Actively managed graph:** never expand more than ~2 stories' worth of unmerged chain ahead.
  The graph is expanded and replanned as work merges, not generated whole up front — by
  planning runs on the devcontainer, which are not graph nodes (see Planning runs under
  Dispatcher). The same rule applies within a chain: the planner never
  composes past an information-producing node — one whose artifact determines what the rest
  of the chain should be; create-story is the type case — and extends the chain in a later
  run once the artifact is readable at `origin/main`. Composing a whole chain up front from
  the epic entry alone plans speculation, and depth-first claiming makes the mistake
   irreversible: the pass that folds the artifact-producing node's completion claims the
   pre-planned successor in the same pass, leaving no window for a replan to remove a node the
   artifact just revealed as unnecessary. Lazy composition closes that gap with existing
   machinery — no successor exists yet, so the ready-node frontier runs low and the standard expansion
   trigger fires with the artifact now on main. A claimed node's spec is frozen; replanning
  touches only unclaimed nodes.
- **Depth-first traversal, bounded (decided 2026-07-22):** the dispatcher descends into a
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
  construction, with one integer of added state. See resolved question 18.
- These rules — and the retry/timeout/capacity knobs (`maxAttemptsPerNode`, per-node timeout,
  `maxConcurrentSandboxes`, `fairnessBudget`, `opencodeVersion`) — are dispatcher claim-time
  policy: plain code plus a small policy block in gen-3's own state, defined fresh, not
  inherited from the gen-2 playbook's `policy`. The policy block is a config file (JSON in
  `_bmad-output/pipeline3/`) read at the start of every pass, so capacity knobs are tunable
  without a code change or restart — the next pass picks up the new value. `opencodeVersion`
  pins the opencode version installed in sandboxes and on the devcontainer — one source of
  truth, read by both install paths (see resolved question 19). Do not pick technology
  expecting it to enforce them.

## Epic lifecycle (decided 2026-07-22)

Gen-3's scope is epic development, not only story development: the pipeline selects epics for
development and runs post-epic finalization — the audit-and-cleanup flow the human has been
running by hand after an epic's sprints (sprint-flow-draft.md). No new machinery: epic
transitions are planner judgment riding the existing triggers, and finalization is an ordinary
chain.

- **Epic selection is the planner's, in sprint-plan order.** Machinery never tracks epics. The
  backlog (epics files and sprint plan) is already in the planner's context, and when an
   epic's stories run out the ready-node frontier runs low — the existing expansion trigger fires and the
  planner continues down the sprint plan. No new trigger, no new authority; a human override
  ("skip to epic 7") is a replan instruction through the inbox like any other.
- **Finalization is an epic-scoped chain.** The chain vocabulary generalizes: a chain belongs
  to a story or to an epic's finalization (node specs carry epic membership alongside story
  membership; the machinery-derived branch is per chain, e.g.
  `pipeline/<runId>/epic-<n>-finalization`). Its nodes are ordinary skill runs —
  `bmad-bug-hunt`, `bmad-testarch-trace`, `bmad-testarch-nfr`, deferred-work pruning
  (`bmad-quick-dev`), `bmad-retrospective`, test-plan revision (`bmad-testarch-test-design`),
  project-context cleanup (`bmad-agent-architect`) — composed per the guidelines, which seed
  from the manual flow the way story chains seed from the gen-2 step sequence. The first
  node's `dependsOn` fans in to every story chain's final merge-point node — legal under the
  existing cross-story-edges-target-merge-points invariant — so finalization starts only after
  the epic's last story merges, and the chain is composed late, once those final nodes exist.
- **Finalization is full of information-producing nodes, so lazy composition applies with
  force.** A trace FAIL gets a fix node appended in the next planning round; bug-hunt findings
  get remediation nodes; deferred-work pruning asks when a finding is not a stale deferral and
  rides the standard QUESTION park. The sequence unfolds across several planning rounds by
  design.
- **Transitions are automatic and notified.** Entering finalization and entering the next epic
  need no human gate. The pass that folds a delta opening a finalization chain, or that first
  claims a node in a new epic, journals the transition and fires an ntfy notification (a small
  n8n workflow, same tier as error notification) — informational, never blocking. Pause
  remains the intervention tool.
- **Overlap with the next epic is planner judgment, not a machinery rule** (decided
  2026-07-22: full overlap permitted). Finalization audits the epic's merged whole, and
  next-epic merges landing mid-audit move the target — but gen-3 does not reintroduce a
  between-epics quiet point in machinery. The guidelines advise when to hold next-epic
  composition back (an in-flight trace or NFR audit whose evidence next-epic merges would
  invalidate) and when overlap is safe (next-epic create-story work rarely disturbs an epic
  audit); the planner decides per epic. Guideline adherence, not construction — the same
  stance as review ordering.
- **The retrospective node does not conflict with the self-improvement exclusion.** That
  decision excluded gen-2's reflect machinery (ledger, amendments, trends);
  `bmad-retrospective` is an ordinary skill run producing a repo artifact, claimable like any
  other node.

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
  completion signals, it polls what is actually running. This replaces the earlier
  single-instance-lock design where a second invocation was a no-op — a no-op arriving while
  the running dispatcher is deciding to exit can silently drop an event; a queued
  level-triggered pass cannot.

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
   predecessor's merge landed — a merge-point predecessor in-chain or cross-story; capacity
   available.)
6. **Claim and launch** — claim ready nodes depth-first with the fairness bound (journal the
   claim), create and
   provision a single-use sandbox (capacity permitting — the `maxConcurrentSandboxes` cap; see
   the per-claim recipe under Worker sandbox design), `git checkout` to the claim's base, start
   the node's command via the
   Daytona session API with `runAsync` (appending `</dev/null` — see the per-claim recipe;
   without stdin redirection opencode hangs on the PTY) — the pass does not wait for it. If ready nodes are
   running low (the plan-2-ahead policy) and no planning run is in flight, journal the launch
   and trigger the planning-host workflow (see
   Planning runs). Merge triggering is level-triggered here too: a completed merge-point node
   whose branch has neither merged nor a pending conflict report, with the merge lock
   acquirable, (re)triggers the merge-queue workflow — a merge cycle killed mid-run is re-run by the
   next pass, not lost (see Merge cycle). Claiming and planning launches are skipped entirely
   while the pipeline is paused (see Pause/resume) — supervision, folding, and merge
   triggering (finishing claimed work) still run.
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
  a few seconds to a pass, which stays within the seconds-long budget. The classifier reads the
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
  deadline, and moves on. It does not touch the journal, does not appear in `graph.json`, and
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
  its deadline is handled by the timeout policy, not relabeled INCOMPLETE. Gen-2's "long-running step survives the per-run timeout
   through repeated timeout → INCOMPLETE → continue iterations" is *not* carried over as-is: that
   pattern conflated a provider bug with a timeout policy. Gen-3 decides timeout behavior
   explicitly (see Timeout policy below) rather than smuggling it through the truncation path.
- **Timeout policy** (open, decided separately from truncation). A session past its deadline is
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
  completed result is durable in git no matter what was or wasn't watching when it finished.
- **Transcript collection** — when a session exits with an outcome (COMPLETE or `failed` —
  every attempt, not only the last; a failed attempt's transcript is exactly the evidence a
  retry investigation needs), the collecting pass downloads the session transcript and the full
  command logs from the sandbox into the per-run
  directory on the devcontainer, before the sandbox is destroyed (single-use — see Sandbox
  lifecycle): destruction removes the sandbox copy, and the structured transcript (messages,
  tool calls) is evidence the JSON event stream cannot replace — this plan's own session-history
  analysis was built from transcripts that existed locally. A stream-truncation continue pulls
  nothing (the session is still going); a parked
  node's transcript survives the sandbox stop and is pulled after resume, when that session exits.
  Planning runs need no pull — their transcript and log file are already local. **Transcript
  mechanism (spike, 2026-07-22):** opencode v1.1.35 stores data as JSON files in
  `~/.local/share/opencode/storage/`. The transcript pull uses
  `opencode export [sessionID]` (produces JSON) or downloads the storage directory via the file
  API. The agent run emits `--format json` events to stdout, which the dispatcher parses for
  outcome classification and stream-truncation detection; `opencode export` is the correct path
  for structured session data (messages, tool calls) beyond what the event stream carries. See
  `docs/todo/spike-opencode-sandbox.md` (finding F3) and `docs/todo/spike-midstream-resume.md`.

Because no supervisor process exists, the failure mode a long-lived supervisor would create —
supervisor death on n8n restart — does not exist. A restart costs nothing but detection
latency: the next pass polls the same sessions the last one would have. There is no attach
mode, no execution-ID bookkeeping, no spool files.

### Planning runs (graph expansion)

Graph expansion is not a graph node (decided 2026-07-20). It runs on the devcontainer — the
same machine as the dispatcher — as an async planning run: a local opencode process that a
pass decides on, journals, and supervises like any other in-flight claim, and that a small
n8n workflow hosts. Every node in the graph is authored by
the planning agent per the chain-composition guidelines; the planning run itself is machinery,
so "agents author all nodes" holds with no machinery-generated node type and no bootstrap
exception. The devcontainer is the right home: planning reads the repo and the stories (at
`origin/main` — see Planning-run context) plus the graph state, writes no code, and needs no
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
  accepted here: an n8n restart kills the execution and its child process — a pass-spawned
  detached process would have survived that — and the process-vanished path relaunches. A
  restart costs a relaunch, never lost state.
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
  Epic transitions add no fourth trigger: composing a finalization chain, or the next epic's
   first chains, rides the ready-node-frontier-low trigger (see Epic lifecycle).
  All gated by pause like node claiming. The trigger is machinery; which nodes and edges come
  out is the planning agent's judgment. A human "replan now" goes through the inbox like
  pause: folded by a pass, which journals and triggers the host workflow.
- **Context is a pinned contract** — a small per-run prompt plus a defined set of files the
  planner reads; see Planning-run context below.
- **Output is a graph delta in the inbox.** The wrapper mirrors the in-sandbox command
  template: isolated opencode storage (per the concurrency findings — the planner shares the
  machine, possibly with a live interactive session; opencode v1.1.35 stores data as JSON
  files in `~/.local/share/opencode/storage/`, not a SQLite DB — see spike finding F3),
  output captured to a per-run log file,
  its PID recorded alongside the lock (for pass-side deadline termination), exit code
  recorded, and the graph delta written to the inbox as the last act. The planning
  run writes nothing else shared — not the journal, not `graph.json`.
- **Delta validation at fold time.** Planning reads graph state at launch; by fold time nodes
  have completed or merged. The fold validates the delta against current state under the state
  lock: it touches only unclaimed nodes and tolerates nodes that finished meanwhile. Journal
  ordering resolves any claim-vs-replan race — whichever hit the journal first wins. Claiming
  is not gated while a planning run is in flight: claimed specs are frozen, so gating would
  starve sandboxes for no added protection.
- **Supervised like a sandbox session.** Same classification (COMPLETE / QUESTION / `failed`),
  same deadline enforcement (terminate, journal `runner_error`, retry policy), same
  stream-truncation recovery (the planning run is a local opencode session; a provider
  mid-stream drop resumes via `opencode run --format json --session <id>`, handled in-pass, not journaled
  as an outcome). QUESTION parks and rides the standard form path — planning is the step
  most likely to need a human answer.
- **Process-vanished path.** Unlike sandbox sessions, a local planning run dies when n8n
  restarts, since the run is a child of its host workflow's Execute Command. Reconcile detects
  it: the journal says a planning run is in flight, the planning lock is acquirable, and no
  delta is in the inbox → relaunch per retry policy. This is the honest cost of running planning
  locally, handled by the same level-triggered code path as every other recovery.

### Planning-run context (decided 2026-07-21)

What the planning agent knows when it runs. Derived from scenario analysis: a story whose
substance is human-performed setup (needs the full story text to skip the e2e node), early
unlock across stories (needs lookahead and claim status), replanning after failures (needs
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
- **Output contract** — the delta file path in the inbox, written as the run's last act,
  nothing else shared.

**Files it reads (standing context):**

- **Chain-composition guidelines** — the advisory document (authoring is open question 1),
  including the skill catalog: each skill's purpose, expected inputs, and a default deadline.
  No "modifies code" flag — all nodes are assumed to modify code (see Graph management
  rules), so review ordering is chain position, not a property the catalog must carry.
- **Node-spec vocabulary** — the schema it may emit (id, skill/agent/prompt, deadline,
  `dependsOn`, `mergeTo`, story and epic membership) and what it must not emit because machinery
  derives it: branch names, runId, anything sandbox-related. The fold-time validation rules
  are stated to the agent as rules it will be held to: a chain's final node carries `mergeTo`,
  cross-story edges target merge-point nodes only, the graph stays acyclic.
- **Graph state** — `graph.json`: every node's status, edges, merge points, which chains
  merged, plus the per-node metadata digests (attempt count, last outcome, durations, diff
  summary, parked question text, base commit — see State). The claimed/unclaimed boundary is
  the most load-bearing fact in the context — it is exactly what the planner may touch — and
  a parked node's pending answer can invalidate dependents the planner would otherwise extend
  a chain with.
- **The journal, read-only and optional** — history beyond the graph digests: full event
  sequences and conflict fingerprints (stories that keep conflicting should be serialized,
  not run concurrently). Routine questions are answered by the digests in `graph.json`; for
  the rest, this is the planner reading gen-3's own artifacts ad hoc, inside the "a human (or
  a later tool) queries the journal" scope — no trends machinery, no digest pipeline.
- **The backlog** — epics files and sprint plan, giving the upcoming-stories window, their
  declared cross-story dependencies, and the epic order that drives epic selection (see Epic
  lifecycle). Merge-point placement needs lookahead: a merge point is
  added only where a dependent story actually exists to unlock, so the planner must see
  beyond the story it is currently composing.
- **Story docs and code at `origin/main`** — pinned ref, decided here: the devcontainer
  checkout is the human's working copy, possibly dirty, possibly on a feature branch, so
  reading the working tree would plan against half-finished human state. The planner reads
  the merged truth the chains base on. (The launch wrapper can provide a clean read-only
  worktree of `origin/main` if directing reads by ref proves awkward.)
- **`decision-policy.md`** — planning is the step most likely to need a human answer; the
  planner exhausts policy before parking with a QUESTION.

**Outside its context and authority:**

- Gen-2 state files (already decided globally).
- Capacity, pause state, tick cadence — the trigger is machinery; the planner never reasons
  about whether to plan, only what.
- Story authorship — it composes chains for stories; creating or editing story docs is a
  create-story node's job.
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
- **Scope: global.** One control for the whole pipeline; per-story or per-epic pausing only if
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
| Single-`write` `O_APPEND` appends to `journal.jsonl` | Atomic appends on a local filesystem |
| tmp-file + `renameSync` for `graph.json` | Atomic replace |
| Non-blocking `flock` on `planning.lock`, held by the planning run for its lifetime | At most one planning run in flight; doubles as the liveness probe — acquirable means finished or dead |
| Non-blocking `flock` on `merge.lock`, held by the merge wrapper for the merge cycle's lifetime | At most one merge cycle in flight — main has one pipeline writer at a time; same liveness probe |

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
| Merge queue (git + test orchestration) | n8n hosts the merge wrapper; the whole merge cycle runs on a sandbox | Serialized by `merge.lock`, level-triggered by passes. The wrapper drives fetch, rebase, install, test, merge, and push on a sandbox created per merge cycle via the Daytona session API (resolved questions 12 and 16); pipeline git operations never touch the devcontainer checkout. Test output is pulled from the sandbox into the per-run directory and its path recorded in the journaled merge event — n8n execution history prunes, so the merge queue's evidence must not live only there. On conflict it writes an inbox report and stops — resolution is a graph node (see Merge-conflict resolution). Test scope is all unit tests per merge (superseding the earlier `nx affected` decision — resolved question 13, revised). |
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
the same rule: its only shared output is a graph delta in the inbox. Agents write nothing shared;
their only output channels are their branch push and their session logs, both read by passes.
Session-history analysis (2026-07-17) confirmed agents already don't write to pipeline state
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
     5. Claim depth-first (bounded by fairnessBudget) → start session commands (runAsync, with `--format json` and `</dev/null` appended); trigger planning host if ready-node frontier low
  6. Release lock, exit
       │  Daytona API: create/stop,         │  journal launch → trigger n8n planning host,
       │  session exec, log pull                │  which runs the wrapper under planning.lock
       ▼                                        ▼
Daytona sandboxes (one opencode        Planning run (opencode on the devcontainer, hosted
agent each; agent pushes its           by the n8n workflow; writes a graph delta to the
branch as its last act)                inbox as its last act)
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
   is re-claimable (a fresh sandbox and session, not a continue — see Supervision). A stream-truncation
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

Rough estimate, ~1070 lines of JS plus three small n8n workflows:

| Module | Lines | Reuses |
|---|---|---|
| Graph management (CRUD, DAG traversal, claim, chain/branch bookkeeping) | ~250 | New |
| Workspace provisioning (sandbox create-on-demand, env + config copy, destroy at collection, scoped reaper) | ~150 | Patterns from product's SandboxService |
| Supervision (session poll, deadline check, continue, park/resume actions, transcript pull) | ~150 | New — behaviors from gen-2's `BMAD Session (OpenCode)`, no workflow port |
| Classification (deterministic rules + LLM fallback, evidence journaled with the outcome) | ~90 | Rules and prompt ported from `Parse OpenCode Response` / `BMAD Outcome`; no n8n dependency |
| Pass frame (flock, inbox fold, reconcile, pause gate, per-pass log + `last-pass.json` heartbeat) | ~170 | New; helper patterns copied from gen-2 scripts, no imports |
| Planning run (launch wrapper, planning lock, delta validation + fold) | ~100 | New |
| In-sandbox command template (install check, opencode run with `--format json` and `</dev/null`, exit capture, branch push) | ~60 | New |
| Merge wrapper (merge lock, drives the in-sandbox merge cycle: fetch, rebase, install, test, merge, push; test-log pull, conflict report) | ~100 | New |
| Question-form workflow (form + ntfy + inbox write + invoke) | n8n, small | New — the Wait-form/ntfy pattern from gen-2, as a standalone workflow |
| Planning-host workflow (run the launch wrapper, invoke dispatcher on exit) | n8n, small | New |
| Merge queue workflow (runs the merge wrapper, invokes dispatcher on exit) | n8n, small | New — mirrors the planning-host pattern |

Honest comparison with an earlier iteration of this plan that used long-lived n8n observer
executions for supervision (~700 lines + a 19-node workflow port): the agent-lifecycle code
that iteration deleted from its estimate returns here, but smaller — level-triggered polling
is simpler than spawn/relay/monitor, and attach mode, observer-death handling, and spool
files disappear entirely. Total effort is comparable; moving parts are fewer.

## State

- Gen-3 state lives in its own directory (working name `_bmad-output/pipeline3/`), so the gen-2
  loop and its files remain untouched and runnable while gen-3 is built. Canonical state is
  two files plus an inbox: `journal.jsonl` (append-only commit point; gen-3 schema: claims with
  sandbox/session IDs and deadlines, outcomes with commits-added, a diffstat (see below), and
  classification evidence (the rule that fired, or the LLM verdict, rationale, and judged
  excerpt — see Supervision),
  parks/resumes, merge events (each carrying the path of its captured test log), `runner_error`
  events, pause/resume control events, policy decisions), `graph.json` (derived view,
  rebuildable from the journal, regenerated with per-node metadata digests — attempt count,
  last outcome, durations, diff summary, parked question text, base commit — so routine
  readers (the planner, the viewer, sprint status) read one file and never parse the
  journal), and
  `inbox/` (written by n8n's small workflows and by planning runs — graph deltas — consumed
  and deleted by passes). Per-run log
  excerpts, pulled session transcripts (via `opencode export` or the storage directory — see
  Supervision),
  and merge-cycle test logs (see the merge queue row in the n8n / dispatcher split)
  go to a plain directory for debugging and later analysis; per-pass log files and the
  `last-pass.json` heartbeat live beside them — machinery observability, not canonical state.
  At most one writer at a time for
  canonical state: the pass holding the lock.
- **Collection records the diff.** When a pass collects an exited session
  it computes commits-added and a diffstat from the claim's journaled base commit to the
  pushed head and journals them with the outcome; the per-node digest in `graph.json` carries
  the summary. Without this, a COMPLETE with an empty diff is indistinguishable from
  substantive work — hiding exactly the evidence a guideline include/skip condition needs
  ("this node type chronically does nothing for stories like this") and the convergence
  signal that a node found its work already merged by a parallel story. Free to compute — the
  base commit is already journaled — and squarely inside "journal everything a future
  reflector would want to read."
- **The journal stays separate from the graph.** Folding history into `graph.json` as node
  metadata was considered (2026-07-21) and rejected: non-node events — planning runs
  (deliberately not graph nodes), pause/resume controls, machinery `runner_error`s — would
  need top-level graph fields that rebuild the journal in a worse place; a canonical rewritten
  `graph.json` is protected against crashes (tmp + rename) but not against a buggy pass
  writing wrong content, while an append-only file can gain a bad line but cannot lose good
  ones and remains the rebuild source; and embedded history would grow the file every reader
  parses on every pass. The per-node digests above give readers the convenience without
  giving up the commit point.
- **Not part of gen-3 state:** gen-2's `journal.jsonl`, `ledger.jsonl`, `playbook.json`,
  `runner-errors.jsonl`, and trends. Gen-3 writes nothing to them and reads nothing from them.
  Anything a future reflector needs must come from gen-3's own journal.
- **Atomic writes required:** passes write `graph.json` via tmp-file + `renameSync` (see
  Atomicity under Dispatcher); any viewer keeps last-good state on parse failure. (Gen-2's
  `scripts/pipeline/lib.mjs:24` uses plain `fs.writeFileSync` — a known gap there; gen-3
  starts atomic.)
- **No in-memory truth.** Journal + graph on disk must be sufficient to resume from cold —
  every pass reconciles, so recovery from a restart is the same code path as a normal tick. The
  pipeline needs a resurrection path (devcontainer postStart hook invoking a pass, plus the n8n
  schedule tick).
- A claimed node's spec is frozen at claim time; replanning touches only unclaimed nodes.

## Viewer (decided by investigation, 2026-07-17)

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
- **Sandboxes use the same image the devcontainer uses (decided 2026-07-22).** The snapshot's
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
  sandboxes the baked dependencies must end up inside each sandbox's checkout: bake the
  shallow clone itself into the snapshot (per-sandbox provisioning then fetches instead of
  cloning) or move the baked `node_modules` into the fresh clone — otherwise every claim's
  install rebuilds from scratch and the cold-start optimization is lost. Daytona caches
  declarative images for 24h; subsequent runs on the same runner are "almost instantaneous."
  This is what makes create-on-demand viable — every worker starts from this snapshot in
  seconds, not minutes, so no pool needs to exist ahead of claims. The snapshot is a
  cold-start optimization, not a freshness guarantee: when the repo's deps change, the
  per-claim install does the real work until the snapshot is rebuilt (a human authors the
  snapshot's build config; the install step surfaces when the repo has outgrown it — see
  resolved question 14).
- **opencode version pinning (decided 2026-07-22):** the snapshot's build config installs
  opencode at the version specified by `opencodeVersion` in the dispatcher's policy config —
  the same config file as `maxConcurrentSandboxes` and the other knobs. The devcontainer's
  install reads the same value, so both install paths share one source of truth. Daytona has no
  agent-harness or opencode-version selection API — opencode is an ordinary npm package
  installed via `run_commands()` in the snapshot and `npm install -g` on the devcontainer, and
  `opencodeVersion` is what keeps them in sync. A post-install `opencode --version` assertion
  catches a stale snapshot bake. See resolved question 19.
- Create sandboxes from the custom snapshot with explicit resources:
  `resources: { cpu: 4, memory: 8, disk: 10 }` (the platform max). Create from image, not
  snapshot, to control resources — snapshots ignore resource params.
- `git clone --depth 1` the repo into the sandbox (shallow, fast) — or, when the clone is
  baked into the snapshot, `git fetch` to current. The Daytona SDK's `git.clone`
  has no depth parameter — use `executeCommand('git clone --depth 1 ...')` instead.
- Copy all `.env*` files from the dispatcher into the sandbox (`.env`, `.env.local`,
  `.env.test`, and any others present). These are gitignored, small, and contain secrets —
  never in the repo, never in the snapshot. The dispatcher holds them and pushes per-sandbox at
  provision time. This transfer is a non-issue: sandboxes are trusted with secrets like the dev
  machine (see Credentials under Sandbox lifecycle).
- Copy the repo's `opencode.json` into the sandbox and ensure `NEURALWATT_API_KEY` is in the
  sandbox env (it rides with the `.env*` files above). opencode ships without neuralwatt as a built-in
  provider, so the provider registration in `opencode.json` is what makes `neuralwatt/glm-5.2`
  resolvable at agent launch — without it, `opencode run` fails at provider lookup before the
  LLM is called. The file is committed in the repo and travels with the clone, but the
  dispatcher copies it explicitly the same way it copies the `.env*` files: the snapshot's bake is a
  cold-start optimization, not a freshness guarantee, and an `opencode.json` baked stale would
  silently pin an old model or old context limits. Pinned 2026-07-22: **neuralwatt is the LLM
  provider for all opencode runs in the pipeline — sandbox agents, the planning run, and the
  outcome-classification LLM fallback — with `glm-5.2` as the initial model.** The model and
  provider are config in `opencode.json`, so swapping either is a repo change, not a pipeline
  change; the snapshot's `opencode.json` is rebuilt on the next snapshot rebuild like any
  other committed file. See resolved question 17. **neuralwatt is the LLM
  provider for all opencode runs in the pipeline — sandbox agents, the planning run, and the
  outcome-classification LLM fallback — with `glm-5.2` as the initial model.** The model and
  provider are config in `opencode.json`, so swapping either is a repo change, not a pipeline
  change; the snapshot's `opencode.json` is rebuilt on the next snapshot rebuild like any
  other committed file. See resolved question 17. **neuralwatt API access from sandboxes
  (spike, 2026-07-22): `api.neuralwatt.com` is not on Daytona's Tier 1 Essential Services
  allowlist, so sandbox agents cannot reach it directly.** The planning run and the
  outcome-classification call run on the devcontainer and are unaffected. See resolved
  question 17 (revised) for the resolution path.
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
  The resolution is a neuralwatt relay on Railway (an allowlisted domain) — see resolved
  question 17 (revised).

**Per-claim (after provisioning):**
- A pass journals the claim (with its deadline), provisions the sandbox (above), and issues
  `git fetch && git checkout` to the claim's base — the unmarked chain predecessor's pushed
  head, or merged main for a chain's first node and for the first node after a merge point.
  Provisioning runs inside the claim step: with a cached snapshot, create is near-instant and
  the fetch and file copies are seconds — within the pass's seconds-long budget. If real-world
  creation latency ever stretches passes, the provisioning commands move into the front of the
  async in-sandbox command, leaving the pass only the create call — a mechanical change.
- The in-sandbox command runs the repo's package-manager install with a frozen lockfile
  checkout, before the node's command. This is the correctness floor: a no-op in seconds when
  deps haven't changed, real work when they have. The snapshot's pre-baked `node_modules` makes
  the common case fast; the install step handles every claim the snapshot doesn't cover. An
  install failure (a dep change needing a system package the snapshot lacks, an unresolvable
  lockfile) is a distinct classification — see Supervision — not a generic runner error.
- The pass starts the node's command inside the sandbox via the Daytona session API
  (`createSession` + `executeSessionCommand({ runAsync: true })`) with `--format json`,
  `--dir <sandbox-repo-path>`, and opencode storage at a persistent path on the sandbox
  disk (not tmpfs — a parked sandbox's storage must survive stop/start; see Park/resume).
  opencode v1.1.35 stores data as JSON files in `~/.local/share/opencode/storage/`
  (spike finding F3, 2026-07-22; stop/start persistence verified spike 2026-07-22). The pass
  then exits — the
  pull-based transport model the product already uses. Later passes poll the command's state
  and pull logs via `getSessionCommandLogs`. The sandbox never calls back to the devcontainer.
  **The command must append `</dev/null`** (verified in the opencode-sandbox spike,
  2026-07-22): `executeSessionCommand` with `runAsync: true` runs the command in a PTY;
  opencode detects the TTY and stays alive waiting for interactive input after completing its
  task, so the process never exits and `getSessionCommand` never returns an `exitCode`.
  With stdin closed, opencode exits cleanly after completing its task. Without this, every
  poll-for-completion loop times out.
  **The command uses `--format json`** (decided 2026-07-22): the agent run emits
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
- The in-sandbox command ends with a branch push (`git push origin HEAD:pipeline/<runId>/<story>`
  — the chain branch) so the result is durable in git regardless of what is watching.
- Deadlines are enforced pass-side: a pass finding a claim past its deadline terminates the
  session command in the sandbox, journals a `runner_error` event, and handles the node per
  retry policy (a timeout is a failure — see Timeout policy under Supervision; the node is
  re-claimable if attempts remain, on a fresh sandbox — the terminated attempt's sandbox is
  destroyed after transcript pull like any exited attempt, never handed to the retry).

**What this eliminates (from session-history analysis, 2026-07-17):**
- Cross-process homicide via `pkill -f "next dev"` / `pkill -f "agent-be"` — can't cross
  machine boundaries.
- Fixed port binding (3000, 3001) — each sandbox has its own port space.
- Shared Postgres test DB — each sandbox runs its own (installable via `apt-get`).
- Shared-file corruption (`sprint-status.yaml` 56 edits, `deferred-work.md` 11 edits,
  `project-context.md` 13 edits across sessions) — per-sandbox, serialized by merge queue.
- `git add -A` sweeping other agents' files — each sandbox is its own clone.
- opencode identity collision — separate machine, separate storage.

### Sandbox platform capabilities (verified against Daytona docs, 2026-07-17)

An initial capability test ran against the default snapshot (`daytonaio/sandbox:0.8.0`, 3 GB disk)
and reported several "hard blockers." A subsequent reading of the Daytona docs corrected most of
these: the 3 GB disk, missing Docker, and ignored resource limits were properties of the default
snapshot and the test's configuration, not platform limitations. The platform supports custom
images, explicit resources, and a declarative builder for pre-baking snapshots.

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
| Resource limits | ✅ Configurable | 1-4 vCPU, 1-8 GB RAM, 1-10 GB disk. Specify when creating from an image. Snapshots ignore resource params — create from image, not snapshot, to control resources |
| Yarn 4 (Berry) | ✅ Likely works | Initial silent fetch failure was almost certainly the 3 GB disk limit, not a platform incompatibility. Needs verification with adequate disk |
| Docker | ✅ Installable | Sandboxes have their own kernel and sudo. Install via `curl -fsSL https://get.docker.com \| sh` or pre-bake into a custom snapshot. Docker registries (`docker.io`, `*.docker.com`) are in the essential services allowlist. Not needed for pipeline agents (session history shows they use `gh` CLI and `curl`), but available if MCP servers are ever needed |
| Browser external access | ✅ Likely works | Playwright is in the essential services allowlist. Initial `ERR_CONNECTION_RESET` was likely a snapshot-specific TLS/proxy issue. A custom snapshot with proper browser deps should resolve it |
| Network to devcontainer | ❌ No path back | Sandboxes can't reach `localhost:5678` (n8n). Not a problem — nothing in the sandbox calls back. Passes pull logs via the Daytona session API from the devcontainer side; the agent's only outbound act is its final git push |
| Custom snapshots | ✅ Declarative Builder | Build from any base image with `apt-get`, `run_commands()`, `dockerfile_commands()`, or `from_dockerfile()`. Pre-bake Node, Yarn, Postgres, Playwright, opencode, and repo deps. Cached for 24h; subsequent runs on the same runner are "almost instantaneous" |
| Network allow-listing | ✅ Runtime-updatable (Tier 3+) | `domainAllowList` (wildcards, max 20) + `networkAllowList` (CIDR, max 10) + `networkBlockAll`. Updatable on a running sandbox without restart. Essential services (npm, GitHub, Anthropic, Docker, Playwright, Railway, opencode) are pre-allowed on all tiers. **Tier 1/2 cannot override the Essential Services restriction** — `domainAllowList` returns an error on those tiers (spike, 2026-07-22). On Tier 1, `networkBlockAll: false` (the default) means "apply the tier policy" (Essential Services only), not "open egress." See `docs/todo/spike-neuralwatt-accessibility.md` |
| Create-on-demand latency | ✅ Fast from cached snapshot | The platform has no pool/acquire-release abstraction, and gen-3 needs none: pre-built snapshots make creation near-instant (cached 24h), so a sandbox is created per claim and destroyed at collection |

No real platform gap remains: create-on-demand needs no pool management — only the scoped
labeling and reaper discipline described under Sandbox lifecycle.

### Sandbox lifecycle

- **Sandboxes are single-use, created on demand** (decided 2026-07-22): created at claim time
  (or per merge cycle), used for exactly one claim attempt, and destroyed when the session
  exits — after the collecting pass pulls the transcript and full logs to the devcontainer
  (see Supervision). There is no warm pool (see the per-agent workspace recipe for the
  rationale). The number of live sandboxes is capped by `maxConcurrentSandboxes` in the policy
  config — a claim that would exceed the cap simply isn't made that pass; capacity control is
  claim-time policy, not pool size. The agent's in-sandbox
  command pushes the branch as its last act, so completion is durable in git before
  destruction. A retry never reuses the failed attempt's sandbox; a deadline-terminated
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
  destroyed. The product's `cleanup-daytona-sandboxes.ts` is account-wide
  destructive — the pipeline needs a scoped reaper (Epic 8.1 adds one for the product; depend
  on it or build its own).
- **Quota management:** the Daytona account has a 30 GiB shared disk quota across all
  environments. Shallow clones (`--depth 1`) reduce per-sandbox disk. Create-on-demand ties
  live sandboxes to in-flight work by construction — in-flight claims plus parked nodes plus
  at most one merge cycle, bounded by `maxConcurrentSandboxes`. The dispatcher must still track
  disk usage and enforce a budget. Label every sandbox with `scope: pipeline` and a `runId` —
  the product's lack of scoping is a known problem the pipeline must not reproduce.
- **Credentials: sandboxes carry the same trust as the dev machine (decided by Marius,
  2026-07-17).** Pipeline sandboxes run our own agents on our own code — they are not a
  lower-trust tier, so transferring secrets from the dispatcher into a sandbox is a non-issue
  and no minimization boundary applies. Provision whatever the work needs (`.env`, `.env.test`,
  API keys); anything left out (e.g. platform-internal keys like `AUTH_SECRET` or
  `CREDENTIAL_ENCRYPTION_KEK`) is omitted because agents have no use for it, not as a security
  control. This deliberately relaxes the product's sandbox credential discipline — the
  product's rules serve its own threat model, which the pipeline does not share. Secrets still
  never go into the repo or the snapshot: a committed or cached-image copy is a different,
  broader exposure surface than a live sandbox.

### opencode concurrency: resolved (both phases complete)

The concurrency experiment tested whether isolated storage per agent prevents the identity
collision observed when multiple opencode instances share git identity. Both phases are
complete; the result is moot for the sandbox tier — separate machines have separate storage
by definition. The experiment's value is confirming that the isolated-storage pattern works,
which the sandbox recipe inherits (each sandbox gets its own storage by machine isolation).
Documented in full because it encodes a failure already paid for once:

- **Known failure** (see the `n8n-workflow-authoring-gotchas` memory): `opencode run` from a
  second worktree *or* a standalone `git clone --local` at a different path, while a real
  pipeline session was active, failed instantly with `UnknownError: Unexpected server error` —
  before the LLM was called. The session log showed the second instance was assigned the *same*
  internal project identifier as the live repo despite a different `directory=`: opencode keys
  "project" off git remote/repo identity, not filesystem path.
- **Also observed:** three opencode processes (`opencode serve`, a TUI session, a pipeline
  `opencode run`) running simultaneously with cwd = this repo, no collision. Same-path
  coexistence was never the failure mode — different-path worktrees sharing git identity were.
- **The lever, tested in both phases:** pointing each agent at an isolated storage directory
  (separate opencode storage per agent), with `--dir <path>` setting the working directory.
  Per-agent `--dir` plus isolated storage gives fully separate storage and cwd. Phase 1
  (throwaway repo) and phase 2 (worktrees of this repo, sharing its git identity) both confirm
  isolated storage per agent is safe at N=6 — no collisions, no migration races. This matches
  what the workspace recipe above already prescribes.
- **Shared-storage caveat (observed, not blocking):** a shared opencode storage directory has a
  schema-migration race at cold start — when multiple instances simultaneously run migrations on
  a fresh storage directory, one fails with a `CREATE TABLE workspace` error. Pre-warming the
  storage (one instance migrates first) eliminates the race. Isolated storage sidesteps it
  entirely, which is why the recipe uses it.
- **Phase 1 (throwaway repo):** `git init` in `/tmp/oc-test/repo`, 6 worktrees, a script
  spawning N concurrent `opencode run` with isolated vs shared storage. 6 experiments (N=3 and
  N=6, isolated vs shared storage, cold vs warm start). Results: isolated storage 9/9 success;
  shared storage 5/6 at cold start with a reproducible migration race (see caveat above), 6/6
  when pre-warmed.
- **Phase 2 (this repo's worktrees):** 6 worktrees of bmad-playground created via
  `git worktree add`, each with isolated storage and `--dir <worktree>`, run concurrently
  while a live session was active against the main repo (the exact condition of the original
  failure). Results: 2/2, 3/3, 6/6 success — zero failures across 11 runs. Every instance was
  assigned the same `projectID` (git-identity-derived, identical to the live main-repo session);
  opencode's project refresh listed all 7 dirs sharing that ID. **The identity collision did not
  recur.** The `UnknownError: Unexpected server error` was a shared-mutable-state collision in
  common storage, not a fundamental git-identity problem. Isolated storage per agent removes the
  shared mutable state; same-projectID coexistence is safe.
- **Remaining scope (not tested):** both phases used a trivial prompt (startup + one LLM call).
  Heavier concurrent interactions — tool use, file writes, permission prompts, long sessions,
  `--continue`/`--fork`, `--attach` to a shared server — could still surface a collision. The
  recipe is confirmed safe for the *process*; richer agent interactions need their own test
  before the dispatcher relies on them.

### Park/resume for human questions — mandatory (decided by Marius)

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
  park cannot be auto-deleted — see Sandbox lifecycle). Verified 2026-07-22: stop ~2.3s,
  start ~0.8s, opencode storage directory preserved identically across the cycle.
- Other agents are unaffected; nothing finished is discarded or re-run.
- An answer resumes exactly one session: the human submits the form, n8n writes the answer to
  the inbox and invokes the dispatcher, and the next pass starts the sandbox and issues
   `opencode run --format json --session <id> --dir <sandbox-repo-path> "<answer>"` async, journaling the
   resume. The session ID is the one captured at launch (opencode auto-generates IDs —
  `--session` is resume-only, so the template captures it via `opencode session list --format
  json` after the initial run; see the per-claim recipe). Agents still never talk to n8n.
- This path is also how human-involved stories run: a story whose instructions require human
  action (e.g. setting up credentials) is still a normal chain — the skill run reads the story,
  asks, parks, resumes with the answer. There is no separate human-task node type.
- **Park/resume is required from the first rollout step, no fail-and-retry stopgap.**
- Precondition to watch: `_bmad-output/decision-policy.md` (human-authored, agent-facing — kept
  in gen-3) currently drives questions to near zero in the gen-2 loop. Every residual question
  multiplies by N agents; keeping the question rate near zero is what keeps N agents from
  becoming N interruptions.

### Conflicts are evidence, never silently resolved

- No silent last-write-wins anywhere. Lockfile diffs count as conflicts.
- A merge-queue failure is journaled as an event with a stable fingerprint (e.g.
  `merge-conflict-<story>`) in the gen-3 journal, so recurrence is a query away and coupled
  stories are identified from data, not guesses. This is written for a future reflector to
  read, but no reflection machinery exists in gen-3 — a human (or a later tool) queries the
  journal.
- A merge-queue fallback (rework, re-run) does not consume a node attempt
  (`maxAttemptsPerNode`, gen-3 dispatcher policy); genuine node failures count exactly as
  story attempts do today.

### Merge cycle (decided 2026-07-22)

The merge queue's unit of work. The entire merge cycle — fetch, rebase, install, test, merge, push —
runs on a sandbox created for the merge cycle's duration (minutes); the
devcontainer checkout is the human's working copy and never hosts pipeline git operations —
the same fact that put conflict resolution in sandboxes. A dedicated local clone was rejected:
a second repo to maintain, plus a crash-recovery surface (a reboot mid-rebase leaves rebase
state to detect and abort) that a disposable merge cycle simply doesn't have.

- **Hosted like planning.** The n8n merge-queue workflow mirrors the planning-host pattern:
  Execute Command runs a merge wrapper that holds a non-blocking `flock` on `merge.lock` for
  the merge cycle's lifetime — mutual exclusion (at most one merge cycle in flight, so main has one
  pipeline writer at a time) plus the liveness probe — records its PID and sandbox
  ID alongside the lock, drives the sandbox via the Daytona session API, pulls the full test
  output into the per-run directory, writes any report to the inbox, and invokes the
  dispatcher on exit.
- **The merge cycle, in order.** Create a sandbox (same per-claim provisioning as a node claim);
  `git fetch`; short-circuit if the chain branch's
  head is already an ancestor of main (delete the branch, done — no test run); checkout the
  chain branch; rebase onto `origin/main` — a conflict aborts the rebase and the wrapper
  writes the conflict report (see Merge-conflict resolution); run the package-manager install
  with a frozen lockfile — the rebase can bring dep changes from main, so the same correctness
  floor as node claims applies; run tests per the policy scope (default: all unit tests,
  excluding e2e and other expensive tests — resolved question 13, revised) — a red run gets
  the same report path with its fingerprint; merge and push
  `origin/main`; delete the chain branch on origin; destroy the sandbox (single-use — see
  Sandbox lifecycle).
- **The push is the commit point.** Everything before it is sandbox-local and disposable: a
  merge cycle that dies mid-run has changed nothing durable, and one that dies after the push
  has merged — the next merge cycle's short-circuit cleans up the leftover branch. A rejected push
  (main moved under the merge cycle — e.g. a human pushing to main) is not an error: the merge cycle exits
  and the next trigger runs a fresh one against the new main.
- **Level-triggered, supervised like everything else.** No pass "hands off" to the merge queue
  and forgets: any pass that finds a completed merge-point node whose branch has neither
  merged nor a pending conflict report, with `merge.lock` acquirable, (re)triggers the
  workflow. A merge cycle killed by an n8n restart (the wrapper dies with its host's Execute
  Command, like a planning run) is therefore re-run, not lost. Deadline enforcement is
  pass-side via the recorded PID, like planning. A dead merge cycle's sandbox is accounted for by
  the recorded sandbox ID — the pass destroys it (single-use, see Sandbox lifecycle; a
  half-finished rebase is exactly the state single-use exists to never clean up) and the
  re-triggered merge cycle creates a fresh one.
- **Credentials.** The sandbox pushes main with the same repo credentials agents already use
  for their branch pushes (see Credentials under Sandbox lifecycle).

### Merge-conflict resolution (decided 2026-07-21)

One path for every conflict: an agent in a resolution node. Conflict resolution modifies code,
and code-modifying work runs in sandboxes as graph nodes — never on the devcontainer, whose
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
  invalidated this chain's approach, so resolving hunks would merge wrong code. Routing
  through the planner keeps "every node is authored by the planning agent" intact, and the
  response needs planning judgment anyway: the same delta rewires the unclaimed successors'
  `dependsOn` to the resolution node, appends a review node after a heavy resolution (a
  resolution commit otherwise lands on main having bypassed the chain's review nodes), and can
  serialize a chronically conflicting story pair (the fingerprint history is in its context).
- **The resolution node is a normal node.** Claimed by a pass, run in a sandbox on the chain
  branch, supervised, parked on QUESTION like any other; it carries `mergeTo`, so its
  completion re-triggers the merge queue under the merge-when-marked rule. Its job: rebase the
  chain branch onto `origin/main`, resolve preserving both sides' intent, push. Two mechanical
  differences from other nodes: its push is a forced update of the chain branch (the rebase
  rewrites the segment's history — safe because the chain is blocked, nothing bases on the
  stale head, and the journal records the new head at collection), and the merge queue accepts
  the pre-rebased branch (its own rebase step finds nothing to redo unless main moved again).
- **Rework abandons the segment.** When the planner chooses rework, the delta marks the
  conflicted segment abandoned — the pass journals the abandonment and deletes the chain
  branch — and the replacement nodes base on merged main under the normal rules (same branch
  name, new segment, like the first node after a merge point).
- **Rounds are bounded.** If main moved while resolution ran, the retried merge can conflict
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
- **Same path for a red-test merge failure.** A clean rebase whose tests fail is the same
  evidence class (a merge-queue failure with a fingerprint) and gets the same remedy: report,
  conflict-mode planning run, resolution node or rework. The report carries the path of the
  captured test log (see the merge queue row in the n8n / dispatcher split), so the planner
  and the human read the actual failures, not a summary that outlived its n8n execution.
- **Rejected: a deterministic auto-fix tier in the merge queue** (journal the conflict, then
  mechanically regenerate lockfiles and generated files, re-test, merge; escalate the rest).
  One path for every conflict beats a second resolution surface plus a regenerable-file
  classification to maintain, at the accepted cost that trivial conflicts pay the full path
  (see Honest costs). It also keeps the merge queue simple, which is what makes it safe to
  host in n8n.

### Dependency knowledge for the graph

- Multiple review nodes modify the same code — `bmad-code-review` applies patches,
  `bmad-testarch-test-review` fixes markers and removes stubs, `bmad-testarch-nfr` applies
  remediations. Gen-3 does not classify skills into read-only and code-modifying: all nodes
  are assumed to modify code (decided 2026-07-21), so a chain is a total order and review
  ordering is each node's position in the chain — a per-story planning decision the graph
  makes visible instead of burying in a step sequence. Which order suits a given story rests
  on the chain-composition guidelines carrying the ordering advice — a guideline the agent
  follows, not a structural guarantee.

## Honest costs

- The graph encodes *declared* dependencies only. Unknown coupling surfaces later as merge-queue
  conflicts and rework. The main win is throughput (stories per day); a chain is a total order
  (all nodes are assumed to modify code), so node granularity buys per-node supervision and
  composition flexibility, not within-story latency.
- A mid-chain merge point inserts merge-queue latency (rebase → test → merge, serialized across
  all stories) between two chain segments, and each one adds a merge-queue run. The
  chain-composition guidelines should mark one only where it buys something — a dependent story
   to unlock — not by default. The whole merge cycle runs on a sandbox created per merge cycle
   (resolved questions 12 and 16), so merge-queue compute never competes with the human's dev
   servers or Postgres on the devcontainer — the merge cycle's sandbox counts against
  `maxConcurrentSandboxes` for its duration (minutes), reducing node-claim capacity by one
  during that window. The merge cycle runs all unit tests every time — not `nx affected`'s
  touched-only subset — so a merge-queue run's test step is minutes, not seconds; accepted as
  the price of not relying on the nx project graph's accuracy during structural changes
  (resolved question 13, revised). Mid-chain merge points multiply this cost, which is why the
  guidelines mark one only where it earns it.
- An early-merged artifact is a promise. A story implementing against a merged story doc's
  schemas and contracts reworks if the upstream implementation later diverges from the doc —
  divergence is not a file conflict, so the merge queue cannot catch it; it surfaces as rework,
  journaled like any other conflict evidence.
- Every merge conflict — a trivial lockfile collision included — pays the full resolution
  path: conflict report, planning run, sandbox claim, agent run, merge-queue retry. That is
  hours on the blocked chain, accepted (2026-07-21) to keep one resolution path; other chains
  proceed meanwhile, and a chronically conflicting story pair is a planning signal (serialize
  them), not a latency problem to optimize.
- Chains are composed from a snapshot of knowledge that reality can overtake: an upstream
  artifact, a question answer, or a parallel story's merge can reveal a planned node
  unnecessary while its chain is in flight. Unclaimed nodes are pruned by planning runs —
  lazy composition and the answer-fold trigger close the common windows — but a claimed spec
  is frozen, so a claimed no-op executes: a sandbox claim plus a short run concluding
  "nothing to do", journaled with an empty diff and short-circuited at the merge queue. One
  no-op is deliberate and stays: the verify-run after a manual conflict resolution (see
  Merge-conflict resolution).
- Post-epic finalization audits (trace, NFR, bug-hunt) may run while next-epic work merges —
  full overlap is permitted — so their evidence is a snapshot that later merges can
  invalidate. Accepted (2026-07-22): the guidelines advise the planner on when to hold
  next-epic composition back; machinery enforces no between-epics quiet point (see Epic
  lifecycle).
- Canonical pipeline state (journal, graph.json) has at most one writer at a time — the pass
  holding the lock. n8n's small workflows write only inbox files; agents write nothing shared.
  There are no concurrent writers to any shared file, and no event can be lost: every payload
  is durable on disk or in git before any dispatcher invocation fires.
- Completions are detected by polling at tick cadence, not pushed — minutes of latency against
  runs measured in hours. (Planning runs and merge cycles are the exception: their n8n hosts
  invoke the dispatcher the moment they exit.) There is no live log streaming; logs are pulled on demand (a small
  `logs <node>` helper makes this a one-liner). Acceptable; revisit only if it hurts in
  practice.
- Outcome classification calls an LLM from inside a pass — a few seconds per exited session,
  within the seconds-long pass budget.
- The practical caps on parallelism are the Daytona quota and the max-concurrent-sandboxes
  policy knob — n8n execution concurrency no longer participates: the executions that block
  on commands (merge queue, planning host) are serialized by their own locks (`merge.lock`,
  `planning.lock`), so concurrent n8n executions coalesce to one.
- 5 concurrent sandboxes consume Daytona account quota (30 GiB shared disk) and API rate limits.
  Shallow clones and scoped cleanup keep this bounded. The 30 GiB is shared across
  dev/test/prod — the pipeline must label and scope its sandboxes or reproduce the product's
  quota-exhaustion problem.
- Docker is available in sandboxes (own kernel, sudo, installable via `get.docker.com` or
  pre-baked into a custom snapshot), but the pipeline doesn't need it — session history (88
  sessions) shows agents use `gh` CLI and `curl` for GitHub operations, not Docker-based MCP.
  MCP tool calls were not recorded in any session; the pipeline does not depend on Docker-based
  MCP.
- Sandboxes can't reach the devcontainer's localhost services (n8n on :5678). Not a problem —
  nothing in the sandbox calls back. Passes pull logs via the Daytona session API and
  transcripts via the file API, and the agent's only outbound act is its final git push.
- The platform provides no pool abstraction — and gen-3 needs none: sandboxes are created on
  demand per claim (near-instant from a cached snapshot) and destroyed at collection. The
  dispatcher's only capacity logic is the `maxConcurrentSandboxes` cap and the scoped reaper.
- The devcontainer never sleeps, so n8n and the dispatcher are always available — ticks fire
  on schedule, questions can be answered at any time, and sandboxes are always supervised.
  Sandboxes are single-use, created on demand (destroyed when the session exits — see Sandbox
  lifecycle), so every claim pays per-sandbox provisioning inside the claim step (create from
  snapshot, clone or fetch, secrets copy — seconds with a cached snapshot) and the account pays
  create/destroy API churn — both small against hours-long runs; if provisioning latency ever
  stretches passes past their seconds-long budget, the provisioning commands move into the
  front of the async in-sandbox command. In-flight planning runs and merge cycles are
  the exceptions to "nothing is lost"
  on an n8n restart: unlike sandbox sessions they die with their host workflow's Execute
  Command. The process-vanished path relaunches the planner, and level-triggered merge
   triggering re-runs the merge cycle — a restart costs a relaunch, never lost state (a merge cycle
  changes nothing durable before its final push).
- Human attention becomes the scarce resource; the question inbox and a near-zero question rate
  are what keep N agents from turning into N interruptions.

## Admitted assumptions (functional, to verify before refining)

The plan depends on a set of functional assumptions — behaviors it asserts but has not
demonstrated. These are not performance assumptions (latency, throughput, resource cost —
those live in Honest costs); they are correctness assumptions: if wrong, the design changes.
Each is paired with the limited-scope spike that verifies it. The capability table under
Worker sandbox design verifies the sandbox tier broadly (what is installable, what runs) but
does not verify the command-execution and session lifecycle the dispatcher depends on — that
gap is where most of these live.

### 1. Daytona session API: runAsync, poll, exit code, log pull — VERIFIED (spike, 2026-07-22)

The supervision model is "a pass starts a command via `executeSessionCommand({ runAsync:
true })`, exits in seconds, and later passes poll the command's state." This assumes: the
async call returns immediately and the command keeps running on the sandbox after the API
session disconnects; the command's state (running vs. exited) is queryable; the exit code is
retrievable after exit; and `getSessionCommandLogs` returns the full stdout/stderr after exit,
not a tail or a live stream. The classifier depends on the stdout excerpt; the transcript pull
depends on the file API. If `runAsync` blocks, or if the command is killed when the API
session disconnects, the "pass starts work and exits in seconds" model breaks — the entire
supervision design changes.

**Verified by the opencode-sandbox spike (2026-07-22):** all four assumptions pass. The async
call returns immediately with a `cmdId`; the command survives the API session disconnecting;
`getSessionCommand` polls and returns `exitCode` once the process exits; and
`getSessionCommandLogs` returns `output` (combined), `stdout`, and `stderr` as a snapshot, or
streams via callbacks. The streaming overload is the pattern the existing `sandbox.service.ts`
uses (`streamAgentLogs`). **One caveat found (F1):** `executeSessionCommand` with `runAsync:
true` runs the command in a PTY; opencode detects the TTY and stays alive waiting for
interactive input after completing its task. The process never exits, and
`getSessionCommand` never returns an `exitCode`. **Fix: append `</dev/null` to the command.**
With stdin closed, opencode exits cleanly after completing its task (verified: ~9s, exit 0).
This is folded into the in-sandbox command template (see the per-claim recipe under Worker
sandbox design). See `docs/todo/spike-opencode-sandbox.md` for the full spike report.

### 2. Sandbox stop/start disk persistence + opencode session resume — VERIFIED (spike, 2026-07-22)

Park/resume depends on: stop sandbox → disk survives → start sandbox → `opencode run --format json --session
<id>` resumes. The plan asserts disk and opencode storage survive a Daytona stop, but the
restart-and-resume path is the critical chain and is not verified. This crosses four
components (pass, n8n form, Daytona, opencode) and is mandatory from the first rollout (see
Park/resume).

**Verified by the stop-resume spike (2026-07-22):** all four links in the chain pass. The
spike created a sandbox, ran an opencode session that established a secret word, captured
the session ID, stopped the sandbox, waited 60 seconds, restarted the sandbox, and resumed
the session — the resumed session correctly recalled the secret word. The opencode storage
directory (`~/.local/share/opencode/storage/` in v1.1.35) survived the stop/start cycle with
identical contents (same directory structure, unchanged timestamps). Stop took ~2.3s, start
~0.8s, resume run ~18.5s — negligible against skill runs measured in hours. The Daytona
docs confirm this is by design: container sandbox stop preserves the filesystem ("it stays on
the runner and counts against disk quota while stopped"), and auto-archive (7-day default)
moves the filesystem to object storage with restore on start — so even a multi-day park
recovers. See `docs/todo/spike-stop-resume.md` for the full spike report.

**Finding (F2): opencode session IDs are auto-generated, not user-specifiable.** The
`--session <id>` flag is resume-only: it loads an existing session and fails with `Session
not found` if the ID does not exist. The dispatcher must capture the auto-generated ID (via
`opencode session list --format json`, newest first) immediately after the first `opencode
run` and persist it in the journal's claim record, then pass it via `--session` on all
resumes. This is a one-command addition to the in-sandbox command template, not a design
change.

### 3. opencode mid-stream resume (INCOMPLETE) — VERIFIED (spike, 2026-07-22)

INCOMPLETE is a within-session recovery signal: the LLM provider drops the response
mid-stream, the opencode session is still alive, and `opencode run --format json --session <id>`
resumes it from where it left off. This assumes the session is resumable after a mid-stream drop
and that the resume continues rather than restarts.

**Verified by the midstream-resume spike (2026-07-22):** the INCOMPLETE recovery path is
viable. `opencode run --format json --session <id>` after a mid-stream kill resumes the session
with full conversation context — the resumed response correctly recalls information from
pre-kill turns. The session storage records an incomplete assistant message
(`time.completed = null`) marking the interruption point.

**Detection rule (refined by the spike):** the plan's original heuristic ("exit code 0 with a
truncated last message, or a recognized provider-mid-stream error") does not match observed
behavior — a SIGTERM produces exit code 143, not 0. The refined rule is a two-signal check:
exit code is non-zero (signal kill: 143 for SIGTERM, 137 for SIGKILL) OR exit code 0 without a
`step_finish` event in the `--format json` output, AND the last assistant message in
`opencode export <sessionID>` has `time.completed` unset. The `--format json` event stream
gives the dispatcher a structured signal (`step_finish` present/absent, `error` events) rather
than a heuristic on log content. See `docs/todo/spike-midstream-resume.md` for the full spike
report and findings.

### 4. Snapshot with baked node_modules + fresh clone

The per-claim provisioning recipe names two strategies for getting baked `node_modules` into a
fresh clone — bake the shallow clone itself into the snapshot (per-sandbox provisioning then
fetches instead of cloning), or move the baked `node_modules` into the fresh clone — and
verifies neither. The interaction between a baked snapshot image and a per-claim `git clone
--depth 1` is non-obvious: `node_modules` is gitignored, so a fresh clone does not have it,
and moving it from a baked location into the clone assumes the paths line up. The wrong
choice makes every claim pay a full install from scratch. **Spike:** build a snapshot via the
Declarative Builder with the repo's `node_modules` baked in, create a sandbox from it, run
`git clone --depth 1` (or `git fetch`), and check whether `node_modules` is present and
usable. Try both strategies. This resolves an open design question — the plan names two
without picking one.

### 5. n8n Execute Command: blocking for minutes + child death on restart

Both the planning-host and merge-queue workflows use Execute Command to run a wrapper that
blocks for the run's duration (minutes). This assumes n8n does not kill long-running Execute
Command nodes. The process-vanished recovery path assumes "a local planning run dies when n8n
restarts, since the run is a child of its host workflow's Execute Command" — this is the
basis for the recovery design. If the child does not die (orphaned and holding the lock), the
pass thinks the planner is still running and never relaunches — the pipeline stalls silently.
Conversely, if Execute Command's child survives n8n restart, the planning lock stays held.
**Spike:** in the devcontainer's n8n, create a workflow with an Execute Command node that
runs `sleep 300`. Verify it blocks for 5 minutes and completes. Then run it again and restart
n8n mid-sleep. Verify whether the child process dies (or does not — either way, learn the
truth) and whether the lock is released. If Execute Command times out before minutes, the
hosting pattern needs a different mechanism.

### 6. opencode.json provider registration for neuralwatt — VERIFIED (spike, 2026-07-22; relay spike 2026-07-22)

The provider registration in `opencode.json` (and `NEURALWATT_API_KEY` in the sandbox env) is
what makes `neuralwatt/glm-5.2` resolvable at agent launch — without it, `opencode run` fails
at provider lookup before the LLM is called. This is a functional assumption about opencode's
provider resolution path.

**Verified by the opencode-sandbox spike (2026-07-22):** provider registration works
— `opencode run --model opencode/big-pickle "Print exactly: SPIKE_OK"` exits with code 0 in
~10s, and output is captured on stdout as expected. The spike used opencode's free hosted
model to verify mechanics, not neuralwatt directly. **Finding (F2, corrected by
`spike-neuralwatt-accessibility.md`): neuralwatt's API (`api.neuralwatt.com`) is unreachable
from Daytona Tier 1 sandboxes — not because of Cloudflare bot protection as originally
hypothesized, but because Daytona's Tier 1 network policy restricts egress to an Essential
Services allowlist enforced via SNI inspection at an Envoy proxy.** `api.neuralwatt.com` is not
on that allowlist. The planning run and the outcome-classification call run on the devcontainer
and are unaffected. The resolution is a Railway relay (an allowlisted domain) — see resolved
question 17 (revised) for the full decision. See `docs/todo/spike-neuralwatt-accessibility.md`
for the corrected root cause and evidence chain, and `docs/todo/spike-opencode-sandbox.md` for
the original spike report.

**Relay spike (2026-07-22):** the Caddy relay on Railway
(`neuralwatt-relay-production.up.railway.app`) closes the gap. From a Tier 1 sandbox:
`/v1/models` through the relay returns HTTP 200 with the full model list; a chat completion
(`glm-5.2`, "Print exactly: SPIKE_OK") returns `"SPIKE_OK"`; SSE streaming arrives
incrementally (not buffered). Direct `api.neuralwatt.com` from the same sandbox fails (HTTP
000, connection reset). The sandbox's `opencode.json` provider `baseURL` points at
`https://neuralwatt-relay-production.up.railway.app/v1`. See resolved question 17 for the full
deployment details and spike results.

### 7. Fold-time delta validation against a moving target

The planner reads `graph.json` at launch (T0); by fold time (T1) a pass may have claimed
nodes (freezing their specs) or folded completions (changing merge state). The validation
must apply the delta to T1 state, not T0 state, and the rules (acyclic, cross-story edges
target merge-points, final node carries `mergeTo`, touch unclaimed nodes only) must hold on
the merged graph. A node the planner marked for removal might have been claimed between T0 and
T1 — the validation must reject that removal (spec is frozen). A node the planner added a
`dependsOn` edge to might have merged — the edge target must still exist. This is the most
algorithmically intricate interaction in the design, and it is pure code — testable without
infrastructure. **Spike:** write the validation function and test against synthetic scenarios:
(a) planner removes a node that was claimed meanwhile, (b) planner adds a cross-story edge to
a node that merged and is no longer a merge-point target, (c) planner's delta creates a cycle
when merged with T1 state, (d) planner marks a final node without `mergeTo`.

### 8. Branch push failure (design gap, not a spike)

The plan says "the agent's in-sandbox command pushes its branch as its last act, so a
completed result is durable in git no matter what was or wasn't watching when it finished."
This does not address push failure — a network blip, auth expiry, or force-push rejection. If
the push fails, the agent's work is on the sandbox disk only, and the sandbox is destroyed at
collection: the work is lost and the node is re-claimed from scratch. This is a functional
gap, not an assumption to spike. The plan should either retry the push in the in-sandbox
command before exiting, have the collecting pass attempt the push if the agent did not, or
not destroy the sandbox until the push is confirmed. Raised here as a design question to
resolve before implementation, not a spike to run.

### Interaction seams (where components agree non-obviously)

These are not separate assumptions but the places where the plan's correctness depends on two
or more components agreeing, and where the agreement is non-obvious. The spikes above cover
the ones that matter; these are noted so the seams are visible during implementation.

- **Pass ↔ planning run ↔ n8n host (three-party supervision).** The pass supervises the
  planning run via its lock instead of the Daytona API. "Lock acquirable" is a binary liveness
  signal, not a state signal: it distinguishes "running" from "not running" but not "finished
  cleanly" from "crashed mid-run" from "crashed after writing a partial delta." The delta is
  written as the run's last act, so partial should mean no delta — but this assumes the
  wrapper either writes the complete delta or nothing (an atomic write). If opencode writes a
  partial file and the wrapper crashes before the atomic rename, the inbox has a corrupt delta
  the fold must tolerate (parse failure → ignore).
- **Pass ↔ merge wrapper ↔ per-cycle sandbox.** Same pattern as planning but with a sandbox
  the wrapper creates. If the wrapper creates the sandbox but dies before recording its ID, the
  pass cannot find the sandbox to destroy it — unless reconcile catches it via the
  `scope: pipeline` label, which must be set at creation, not after. The ordering of
  create-sandbox-labeled → record ID → hold lock → do work matters for recovery.
- **Park/resume spanning pass / n8n / Daytona / opencode.** The full park/resume chain crosses
  four components and is the intersection of the sandbox-stop/start and opencode-session-resume
  assumptions above. Each is individually testable; the combination (stop a sandbox with a live
  opencode session, wait hours, restart, resume) is the real test and is what the spike covers.
  **Verified (spike, 2026-07-22):** the full chain works — stop preserves disk, start restores
  it, and `opencode run --format json --session <id>` resumes with prior context intact. See assumption #2
  and `docs/todo/spike-stop-resume.md`.
- **Stream-truncation detection as a signal.** The `--format json` event stream gives the
  dispatcher a structured signal: `step_finish` present means clean completion, absent means
  truncation; `error` events signal provider failures. The two-signal check (exit code +
  `time.completed` on the last assistant message — see Stream-truncation recovery) replaces the
  earlier log-content heuristic. If too loose, every clean exit gets a spurious continue; if too
  tight, real truncations get misclassified as `failed` and consume an attempt. The spike
  (`docs/todo/spike-midstream-resume.md`) defines the detection rule from observed behavior.
- **Outcome classification inside the lock.** The LLM fallback classification runs inside the
  pass, under the lock. If N sessions exited since the last pass, the pass makes N
  classification calls, each a few seconds, all under the lock — no other pass can run during
  that window. The seconds-long budget assumes roughly one exit per pass; a batch of exits
  stretches it. Not a performance concern but a correctness concern if lock hold time blocks
  merge triggering or question-resume long enough to matter functionally.
- **Reconcile orphan matching.** "Destroy sandboxes no journal entry accounts for" matches by
  label, not by ID. A sandbox created by a pass that died before journaling the claim is
  orphaned and destroyed — fine, if the label is set at creation. If a sandbox is created
  without the label (a bug in the create path), reconcile cannot see it, and it leaks —
  consuming quota silently. The label is load-bearing for cleanup.

## Path (incremental, each step independently useful)

1. ~~Run the opencode concurrency experiment~~ — done (both phases). Isolated storage per
   agent is safe at N=6. Moot for the sandbox tier (separate machines), but confirms the
   isolated-storage pattern the sandbox recipe inherits. See the opencode concurrency section
   and spike finding F3.
2. **Build the custom snapshot and per-claim provisioning** (gates the sandbox tier):
   - Build a custom Daytona snapshot via the Declarative Builder: Node.js, Yarn, Postgres,
     Playwright browsers, opencode, and the repo's dependencies pre-installed. This eliminates
     the per-sandbox install step and makes claim-to-start fast.
   - Per-claim provisioning: the dispatcher creates a sandbox at claim time (capped by
     `maxConcurrentSandboxes`), provisions it (clone or fetch, secrets and config copy),
     checks out the claim's base, and destroys the sandbox when the session exits (single-use —
     see Sandbox lifecycle). No pool to build. Measure create-from-cached-snapshot latency
     here — claim-time creation depends on it being the seconds the docs promise; if it is
     slower in practice, move the provisioning commands into the front of the async in-sandbox
     command.
   - Scoped reaper: destroy orphaned sandboxes on dispatcher crash — don't reproduce the
     product's 30 GiB quota-exhaustion problem. Label every sandbox with `scope: pipeline` and
     a `runId`.
   - Verify Yarn 4 Berry works with adequate disk (the initial failure was almost certainly the
     3 GB default disk, not a platform incompatibility).
3. Build the per-agent machinery: the in-sandbox command template (opencode run with `--format json`, exit capture,
   terminal branch push), session start/poll/continue via the Daytona session API, the
   classification module (deterministic rules + LLM fallback, prompt ported from gen-2),
   deadline enforcement (terminate + journal + handle per retry policy; see Timeout policy), park/resume with a synthetic question
   (including sandbox stop/start around the park), transcript pull and sandbox destroy at
   collection, the small question-form workflow, and conflict-as-evidence journaling. Restart n8n mid-run and verify the next pass reconciles
   correctly (collects finished work, keeps polling running work). Exercise the health checks:
   make a pass fail (bad input) and verify the tick fires the error notification; hold
   `last-pass.json` stale and verify the stall alert fires. Test against disposable
   sandboxes with synthetic steps before any real BMAD skill run.
4. Introduce the graph: `dependsOn` edges in planning output (chains composed per story per
   the guidelines), `graph.json` and the reconcile pass with the plan-2-ahead / bounded
   depth-first policy, node-granularity claims with chain branches, the planning-run machinery (launch
   wrapper, planning lock, n8n host workflow, delta validation and fold, process-vanished
   relaunch), and the
   pause/resume gate on claiming (with its helper script). First taste
   of parallelism: two independent nodes from different stories as two concurrent sandboxes.
   This is the permanent design — sandboxed agents supervised by level-triggered passes; no
   per-worker supervisor exists anywhere. Tune the tick cadence here, and exercise pause: pause
   mid-run, watch in-flight nodes finish with nothing new claimed, resume.
5. Move "done" from workflow-return to branch-merged: merge queue (n8n workflow + merge
   wrapper) + Mermaid graph view. Agents push their own branches; a pass that finds a
   completed merge-point node not yet merged triggers n8n's merge queue (level-triggered); no
   event-ingest webhook — canonical state is written only under the pass lock. The merge queue runs
   the whole merge cycle — rebase, install, test, merge, push — on a sandbox created per merge
    cycle, serialized by `merge.lock` (resolved questions 12 and 16) — test scope: all unit
    tests, configurable in the policy config (resolved question 13, revised). Restart n8n mid-merge-cycle and verify the
   next pass re-triggers a fresh merge cycle. Exercise a mid-chain merge point: an early
   node merges its story doc and a dependent story's chain starts against it while the first
   story is still running. Exercise the conflict path with a synthetic conflict: inbox report
   → conflict-mode planning run → resolution node → merge retry (see Merge-conflict
   resolution).
6. Upgrade the viewer to `viewer.html` when interactivity earns it.

First real parallel run should be manual and supervised, including at least one supervised park.

## Resolved questions

1. **Node definition:** a graph node = one skill run (BMAD-agnostic — any skill, not just BMAD) or
   another atomic action like a CLI command — finer than a whole story. (Reframes the original
   "whole stories only vs review steps as nodes.")
2. **Claim unit (2026-07-20): the node.** A story is a chain of nodes sharing one branch; each
   node's claim bases on its predecessor's pushed head; the merge queue runs at merge points
   (chain end always — see resolved question 7).
   Story-unit vocabulary from earlier drafts (attempts, branch naming, the park boundary) is
   restated per-node above. Decided from the vision (resolved question 1), not from the
   inventory of existing workflows — claim-a-story survived as an option mainly because
   `Develop Story (Playbook)` already existed.
3. **Supervision home (2026-07-20): the reconcile pass.** The observer-execution design
   required its recovery path (re-attach after routine observer death) to be fully robust,
   which made the observers themselves redundant. Level-triggered polling from passes replaces
   them; n8n keeps only small human-facing workflows.
4. **Review-node write ordering: resolved by chain linearization (updated 2026-07-21).** All
   nodes are assumed to modify code, so a chain is a total order and review ordering is each
   node's position in the chain (see Dependency knowledge). Which order suits a given story is
   still a judgment call resolved by guideline adherence, not by construction — the
   chain-composition guidelines carry the ordering advice.
5. **Gen-2 self-improvement: not inherited (2026-07-20).** Out of scope for gen-3; a future
   reflector is a separate consumer of gen-3's own journal, designed for a parallel world (the
   gen-2 between-stories reflection cadence has no equivalent here). Gen-3 reads and writes
   none of gen-2's state files.
6. **Graph expansion home (2026-07-20): a local planning run, not a graph node.** Planning
   runs on the devcontainer as an async process: a pass decides and journals the launch, a
   small n8n workflow hosts the run and invokes the dispatcher when it exits, and the planning
   lock serializes; its graph delta is folded from the inbox — resolving the mechanical half
   of the old planning-node contract question. This keeps "agents author all nodes" clean:
   every node in the graph comes from the planning agent; only the trigger (ready nodes
   running low) is machinery, so there is no machinery-generated node type and no bootstrap
   exception.
7. **Mid-chain cross-story dependencies (2026-07-21): planner-designated merge points.** A
   story can unlock a dependent before its own implementation completes — the motivating case:
   a create-story node produces a story doc specifying schemas and contracts, and the
   dependent story implements against the doc alone. The gate stays merge-only: the unlocking
   node carries `mergeTo`, its segment merges early, and the dependent gates on that merge and
   bases on merged main under the normal rules. Two alternatives rejected: basing a dependent
   chain on another chain's unmerged head (couples merge ordering across chains and builds
   against still-changing work), and merging after every node (loses story-atomic integration,
   lands unreviewed or deliberately red intermediate states on trunk, and turns the
   merge queue into a per-node serial bottleneck).
8. **Planning-run context (2026-07-21): pinned.** The prompt carries only trigger/mode (with
   any human replan instruction verbatim), snapshot pointers with the staleness rule, and the
   output contract; everything else is files the planner reads — the chain-composition
   guidelines with a skill catalog, the node-spec vocabulary with its fold-time validation
   rules, `graph.json`, the journal read-only, the backlog, story docs and code at
   `origin/main` (never the devcontainer working tree, which may be dirty or on a feature
   branch), and `decision-policy.md`. Outside its authority: capacity and pause reasoning,
   story authorship, and any shared write except the delta. See Planning-run context under
   Dispatcher.
9. **Merge-conflict resolution (2026-07-21): an agent in a resolution node — one path for
   every conflict.** The merge queue detects, reports to the inbox, and blocks the chain; it
   never resolves, not even a lockfile. A conflict-triggered planning run authors either a
   resolution node appended to the chain (rebase onto `origin/main`, resolve, forced push of
   the chain branch; carries `mergeTo`, so completion re-triggers the merge) or a rework
   replan (abandon the segment; replacement nodes base on merged main) when the conflict
   reveals semantic divergence. Rounds are bounded by dispatcher policy; the human enters
   through the standard park path, or after round exhaustion. Rejected: a deterministic
   auto-fix tier in the merge queue, and any resolution on the devcontainer — the checkout is
   the human's, and code-modifying work runs in sandboxes. See Merge-conflict resolution
   under Worker sandbox design.
10. **Epic lifecycle (2026-07-22): the pipeline develops epics, not only stories.** Epic
     selection is the planner continuing down the sprint plan on the existing ready-node-frontier-low
    trigger; post-epic finalization is an epic-scoped chain of ordinary skill-run nodes,
    gated on all the epic's story merges by cross-story edges to their final merge points
    and composed lazily (its audits are information-producing nodes). Both transitions are
    automatic and ntfy-notified — pause is the brake, no question gate. Overlap with
    next-epic work is planner judgment per the guidelines, not a machinery barrier. See
    Epic lifecycle.
11. **Warm pool (2026-07-22): dropped — create on demand, capped, not pooled.** (Same-day
     revision: this question first resolved to a lazy pool with a `warmPoolSize` target;
     superseded before implementation.) There is no warm pool: a sandbox is created at claim
     time from the pre-built snapshot and destroyed at collection (single-use — see Sandbox
     lifecycle). Creation from a cached snapshot is near-instant, so pre-provisioning bought
     seconds against hour-long runs while costing pool top-up logic, idle-sandbox lifecycle
     handling, and pool accounting in every reconcile. The only capacity control is
     `maxConcurrentSandboxes` in the dispatcher's policy config — the same config file as
     `maxAttemptsPerNode` and per-node timeout, read at the start of every pass, so tuning is
     an operational change, not a code change or restart. 5 is the initial value; a claim that
     would exceed the cap waits for a later pass.
12. **Merge-queue test execution (2026-07-22, superseded same day by resolved question 16):
     the test step runs on a sandbox acquired per merge cycle.** The original decision split the
     merge cycle: git ops (rebase, merge) ran locally on the devcontainer — repo access was considered
     load-bearing (see n8n / dispatcher split) — and the test step ran on a sandbox created for
     the merge cycle via the Daytona session API, held for the duration of one merge cycle (rebase +
     test — minutes, not hours), then destroyed like any finished claim (single-use — see
     Sandbox lifecycle). The n8n workflow drove the sandbox: create, execute the test command
     via the session API, poll for completion, pull results, destroy. This avoided running the
     test suite on the devcontainer, which already carries n8n, the dispatcher, the human's dev
     servers, and the human's Postgres — a performance bottleneck especially under mid-chain
     merge points that multiply merge frequency. The sandbox's isolation (own ports, own
     Postgres, own filesystem) eliminates the collision surfaces that a local worktree would
     reintroduce. The cost was one git round-trip per merge (shipping the rebased branch to the
     sandbox) and one `maxConcurrentSandboxes` slot during each merge cycle — both small
     against minutes-long merge cycles and hours-long node claims. Rejected alternatives:
     reusing the finishing sandbox (holds sandboxes alive waiting for their merge-queue slot, burning
     scarce quota — see Honest costs); optimistic concurrency with no serial merge queue (replaces a
     core design decision for little gain — integration is minutes, skill runs are hours, so
     serialization is not the bottleneck); a dedicated long-lived merge-test sandbox (wastes
     10 GB of the 30 GB quota while idle, needs its own supervision path). **Superseded by
     resolved question 16**: the whole merge cycle — git ops included — runs on the sandbox, so the
    local git-ops half no longer stands; the rejected alternatives above remain rejected. See
    Git is the convergence point, the merge queue row in the n8n / dispatcher split, and
    resolved question 16.
13. **Merge-queue test scope — original decision (2026-07-22, superseded same day): `nx affected`
    with a periodic full run, both tunable in the policy config.** Affected-only runs the tests for
    projects touched by the diff — minutes, not tens of minutes — keeping the serial merge queue's
    per-merge cost low under mid-chain merge points. The periodic full run is the safety net that
    catches what affected-only misses (inaccurate nx project graphs, undeclared dependencies); its
    cadence is a config knob (`fullTestRunIntervalMerges` — every N merges, or
    `fullTestRunIntervalHours` — every N hours), tuned empirically in Path step 5. Both the test
    scope mode (`affected` | `full`) and the full-run cadence live in the dispatcher's policy config
    file — the same one as `maxConcurrentSandboxes` and the other capacity knobs — read at the start of
    every pass, so tuning is an operational change, not a code change. A full-suite-per-merge mode is
    available as a config value for when the nx project graph is not yet trustworthy or for a
    paranoid baseline; the default is `affected`. Superseded — see below.

    **Merge-queue test scope — revision (2026-07-22): all unit tests, every merge; no `nx
    affected`; no periodic full-run cadence.** `nx affected` is unreliable during structural changes
    — a new library with undeclared dependencies runs no tests for the new code, and the periodic
    full run existed only to compensate for that blind spot. Running all unit tests on every merge is
    simpler and safer; the cost is real (minutes, not seconds) but is the same minutes the full-run
    cadence already incurred periodically, paid on every merge instead of every Nth. Excluded: e2e
    tests and other expensive tests (Playwright, integration tests that need external services) —
    those need their own hosting story (own sandbox lifecycle, own timeout budget) and are out of
    scope for this decision; a separate periodic run for them may exist in the future. The test scope
    remains a config value in the dispatcher's policy config file — the same one as
    `maxConcurrentSandboxes` and the other capacity knobs — so the scope can be tightened or
    loosened without a code change; the default is all unit tests. The cadence knobs
    (`fullTestRunIntervalMerges`, `fullTestRunIntervalHours`) are removed — every run is already
    comprehensive for unit tests, so there is nothing to cadence. Supersedes the original decision
    above. See the merge queue row in the n8n / dispatcher split and the Merge cycle section.
14. **Session transcripts are pulled at collection (2026-07-22).** When a session exits with
    an outcome (every attempt, not only the last — revised with the single-use lifecycle,
    which also preserves failed attempts' evidence), the collecting pass downloads the
    session transcript and the full command logs from the sandbox into the per-run
    directory on the devcontainer, before the sandbox is destroyed. Rationale: the
    stdout excerpt used for classification is not the structured record; destruction removes
    the on-sandbox copy, so without the pull the tool-call-level evidence —
    what debugging a strange run needs, what a future reflector reads, and what this plan's
    own session-history analysis was built from — would be lost with the sandbox. A
    stream-truncation continue pulls nothing; a parked node is pulled after resume, when its
    session exits;
    planning-run transcripts are already local. **Transcript mechanism (spike, 2026-07-22):**
    opencode v1.1.35 stores data as JSON files in `~/.local/share/opencode/storage/`. The
    transcript pull uses `opencode export [sessionID]` (produces JSON) or downloads the storage
    directory via the file API. See Transcript collection under Supervision and spike finding F3.
15. **Snapshot freshness (2026-07-22): the per-claim install step is the correctness floor; the
    snapshot is a cold-start optimization, not a freshness guarantee.** The in-sandbox command
    runs the repo's package-manager install with a frozen lockfile after checkout, before the
    node's command. Package managers are idempotent and self-reporting: when deps haven't
    changed, the install checks the lockfile against `node_modules`, finds them in sync, and
    exits in seconds — a no-op. When deps have changed, the install does the real work that
    needed doing. This collapses the freshness-tracking problem the open question posed: there
    is no digest to record, no rebuild trigger, no freshness-pass workflow, no snapshot-swap
    semantics to work out. The snapshot's pre-baked `node_modules` makes the common case fast;
    the install step handles every claim the snapshot doesn't cover. The snapshot's build config
    is a human-authored artifact; when the repo outgrows it (a dep change needing a system
    package the snapshot lacks, an unresolvable lockfile), the install step fails with a
    distinct classification that parks the node with QUESTION carrying the install output —
    not a generic `runner_error` to retry, which would burn attempts and quota failing
    identically. The human updates the snapshot's build config or removes the dep, answers the
    park, and the resumed session re-runs the install and proceeds. Rejected alternatives:
    lockfile-digest tracking at claim time (first claim after a dep change pays full rebuild
    latency anyway); a scheduled freshness pass (a second small n8n
    workflow and a freshness-check cadence to tune — complexity that the idempotent install
    step makes unnecessary); a git hook or CI signal (the no-inbound-webhook constraint on the
    devcontainer rules out the clean version). See the per-claim recipe under Worker sandbox
    design and Outcome classification under Supervision.
16. **Merge-cycle hosting (2026-07-22): the whole merge cycle runs on the sandbox; the devcontainer
    keeps only the wrapper, the lock, and the inbox write.** Supersedes the git-ops-local half
    of resolved question 12. The devcontainer checkout is the human's working copy — the fact
    that put conflict resolution in sandboxes (resolved question 9) applies equally to the
    merge queue's own rebase, which needs a working tree; a dedicated local clone would be a
    second repo to maintain plus a crash-recovery surface (rebase state to detect and abort
    after a reboot), where a merge cycle is disposable. The push to `origin/main` is the
    merge cycle's only durable effect: a merge cycle that dies mid-run changed nothing, one that dies
    after the push has merged, and the next merge cycle's short-circuit deletes the leftover branch;
    a push rejected because main moved (e.g. a human push) just ends the merge cycle — the next
    trigger runs a fresh one. The n8n merge-queue workflow mirrors the planning-host pattern:
    Execute Command runs a merge wrapper holding a non-blocking `flock` on `merge.lock` for
    the merge cycle's lifetime (serialization — main has at most one pipeline writer — and the
    liveness probe: acquirable means finished or dead), with PID and sandbox ID recorded for
    pass-side deadline enforcement and recovery. Merge triggering is level-triggered: any pass
    that finds a completed merge-point node whose branch has neither merged nor a pending
    conflict report, with the lock acquirable, (re)triggers the workflow — an n8n restart
    costs a re-run merge cycle, never lost state. The merge cycle runs the frozen-lockfile install before
    tests (the rebase can bring dep changes from main). Sandbox credentials already cover the
    main push (see Credentials under Sandbox lifecycle). See Merge cycle under Worker sandbox
    design.
17. **LLM provider (2026-07-22, revised 2026-07-22): neuralwatt for all opencode runs;
    sandbox agents route through a Railway relay.** opencode does not ship neuralwatt as a
    built-in provider, so the provider registration in the repo's `opencode.json` (and
    `NEURALWATT_API_KEY` in the sandbox env) is what makes the model resolvable at agent launch
    — without it, `opencode run` fails at provider lookup before the LLM is called. The
    dispatcher copies `opencode.json` into each sandbox at provisioning (same path as `.env`:
    the snapshot's bake is a cold-start optimization, not a freshness guarantee, and a stale
    baked `opencode.json` would silently pin an old model or old context limits). The planning
    run runs on the devcontainer and inherits the working tree's `opencode.json` — no copy
    needed. The provider and model are config in `opencode.json`, so swapping either is a repo
    change picked up by the next snapshot rebuild or the next planning run, not a pipeline code
    change. All opencode runs in the pipeline — sandbox agents, the planning run, and the
    outcome-classification LLM fallback — use neuralwatt with `glm-5.2` as the initial model.
    **Revised after the neuralwatt accessibility spike (2026-07-22): `api.neuralwatt.com` is
    not on Daytona's Tier 1 Essential Services allowlist, so sandbox agents cannot reach it
    directly.** The spike (`docs/todo/spike-neuralwatt-accessibility.md`) corrected the
    original root cause: the block is Daytona's own Tier 1 network policy (an Envoy proxy
    inspects the TLS SNI and resets connections to non-allowlisted hostnames), not Cloudflare
    bot protection as originally hypothesized. Tier 1/2 cannot override this per-sandbox
    (`domainAllowList` returns an error); only Tier 3+ has open egress. A Tier 3 upgrade is not
    an option, so the resolution is a **neuralwatt relay deployed on Railway** —
    `*.railway.app` and `*.railway.com` are on the Essential Services allowlist, so sandbox
    agents can reach the relay. The relay is a thin reverse proxy: it receives requests at
    `https://<relay>.railway.app/v1` and forwards them to `https://api.neuralwatt.com/v1`,
    passing through the `Authorization` header. The sandbox's `opencode.json` provider config
    points `baseURL` at the relay URL instead of `api.neuralwatt.com` directly. The
    `NEURALWATT_API_KEY` rides with the `.env*` files as before — the sandbox sends it in the
    `Authorization` header and the relay forwards it; the relay itself holds no key (or holds a
    shared secret for access control if needed). The devcontainer's `opencode.json` continues
    to point at `api.neuralwatt.com` directly — the relay is only for sandbox egress. This is
    a permanent architecture decision, not a temporary split: one provider, one model, one API
    key everywhere; the only difference is the URL sandbox agents call. The relay is a single
    point of failure for sandbox agents — if it is down, every sandbox agent fails — so it
    needs the same operational attention as any pipeline dependency.

    **Relay deployed and spiked (2026-07-22):** the relay is a Caddy reverse proxy on Railway.
    The Docker image is at `ghcr.io/marius321967/neuralwatt-relay:latest` (public — Railway's
    free tier does not support private registry credentials, so the package is public; the
    image holds no secrets, the Caddyfile is in the public repo). Railway service:
    `neuralwatt-relay` in project `bmad-easy` (production environment). Relay domain:
    `neuralwatt-relay-production.up.railway.app`. Caddy listens on `:80` (Railway terminates
    TLS) and reverse-proxies to `https://api.neuralwatt.com` with `header_up Host
    api.neuralwatt.com`; the `Authorization` header passes through from the client — the relay
    holds no API key. The sandbox's `opencode.json` provider `baseURL` points at
    `https://neuralwatt-relay-production.up.railway.app/v1`. The devcontainer's `opencode.json`
    continues to point at `api.neuralwatt.com` directly — the relay is only for sandbox egress.

    **Spike results (2026-07-22, from a Daytona Tier 1 sandbox with
    `networkBlockAll: false`):**
    1. `curl https://neuralwatt-relay-production.up.railway.app/v1/models` with the
       Authorization header — **succeeded** (HTTP 200, full model list returned).
    2. `curl https://api.neuralwatt.com/v1/models` directly — **failed** (HTTP 000, connection
       reset), confirming the relay is actually needed and `*.railway.app` is on the
       allowlist.
    3. Chat completion through the relay (`glm-5.2`, "Print exactly: SPIKE_OK") —
       **succeeded**, content returned as `"SPIKE_OK"`.
    4. SSE streaming (`stream: true`) through the relay — **succeeded**, chunks arrived
       incrementally over ~50ms with measurable inter-chunk gaps (not buffered). Caddy's
       default streaming behavior passes through chunked responses transparently; no
       `flush_interval` config change needed.

    Alternatives considered and rejected: split-provider (neuralwatt on devcontainer,
    Anthropic/OpenAI in sandboxes) — works but abandons neuralwatt's pricing for sandbox
    agents, which is the whole point; Cloudflare Workers relay (`*.workers.dev` is
    allowlisted) — lighter weight but Railway is already in use and known; BYOC — overkill;
    asking neuralwatt to allowlist Daytona egress IPs — not needed, the block is on Daytona's
    side. See the provisioning recipe under Worker sandbox design and
    `docs/todo/spike-neuralwatt-accessibility.md`.
18. **Depth-first fairness bound (2026-07-22): bounded depth-first with a fairness budget
    (BDFB).** Unbounded depth-first traversal starves: a chain that keeps producing ready
    successors fills the pool indefinitely while an independent ready node waits. The
    mathematical solution is a fairness counter — a variant of deficit round-robin adapted to
    preserve depth-first as the default. The rule: maintain a `chainDepth` counter,
    initialized to 0. After a node completes, the pass claims its dependents by default
    (depth-first) and increments the counter. When `chainDepth` reaches `fairnessBudget` and
    at least one independent ready node exists, the pass claims the independent node instead
    and resets the counter. When no independent node is ready, the counter increments but the
    yield never triggers — behavior is identical to pure depth-first. `fairnessBudget` defaults
    to `maxConcurrentSandboxes` (one full pool-fill of chain-following, then a yield) and lives
    in the dispatcher's policy config. The counter is per-pool, not per-chain; it resets on a
    yield. Starvation-freedom by construction: any independent ready node is claimed within
    `fairnessBudget` node completions, with one integer of added state and no graph topology
    analysis. See Graph management rules.
19. **opencode version pinning (2026-07-22): `opencodeVersion` in the dispatcher's policy
    config.** Daytona has no agent-harness or opencode-version selection API — opencode is an
    ordinary npm package, and the SDK's sandbox-creation and snapshot types have no `agent`,
    `harness`, or `version` field. Version consistency between the devcontainer (which runs the
    planning agent) and the sandboxes (which run node-claim agents) is enforced by a single
    config value: `opencodeVersion` in the dispatcher's policy config — the same file as
    `maxConcurrentSandboxes`, `fairnessBudget`, and the other knobs. The snapshot's Declarative
    Builder config reads it when installing opencode (`npm install -g
    opencode-ai@${opencodeVersion}`), and the devcontainer's install reads the same value, so
    both install paths share one source of truth. A post-install `opencode --version`
    assertion in both environments catches a stale snapshot bake. The version is a config value,
    not a repo file or a code constant, so updating it is an operational change picked up by
    the next pass (devcontainer) and the next snapshot rebuild (sandboxes). See the provisioning
    recipe under Worker sandbox design.

## Open questions

1. Chain-composition guidelines document — to author before Path step 4. The mechanical half
   (graph delta in the inbox — resolved question 6) and the context contract (what the
   planner knows and may touch — resolved question 8) are decided. What remains is writing
   the document itself: name, location, and content — the gen-2 step sequence rewritten as
   advice with include/skip conditions per step (empty-diff evidence in the journal is what
   shows a condition is wrong: a verification node that finds nothing produced information
   and stays, a generation node that finds nothing was waste and its include condition
   tightens), the lazy-composition advice (never compose past an information-producing
   node — see Graph management rules), the within-chain ordering advice for review
   nodes (all nodes are assumed code-modifying, so ordering is chain position), merge-point
   placement advice (only where a dependent story exists to unlock — and cleared on the
   unclaimed node when a replan drops that dependent), the conflict-resolution
   advice (in-place resolution vs rework, and when a resolution node deserves a trailing
   review node — resolved question 9), the epic-finalization playbook seeded from the
   human's manual post-epic flow (sprint-flow-draft.md: `bmad-bug-hunt`,
   `bmad-testarch-trace` with a FAIL → fix follow-up, `bmad-testarch-nfr`, deferred-work
   pruning with its rule to ask when a finding is not a stale deferral,
   `bmad-retrospective`, test-plan revision, project-context cleanup; the fidelity audit
   stays folded into bug-hunt), the overlap advice (when next-epic composition should wait
   for an in-flight epic audit — see Epic lifecycle), the skill catalog with per-skill
   default deadlines, and the concrete node-spec schema (field names and format for the
   vocabulary pinned in resolved question 8).
