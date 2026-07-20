# Plan: dependency-graph pipeline with parallel opencode agents

Status: draft vision, not started. Written 2026-07-17, updated same day to make Daytona sandboxes
the primary worker tier (was: local worktrees as first tier, sandboxes as graduation), and again
to pin down hosting: n8n runs on the devcontainer under pm2 (not Railway), and "woken by n8n"
means locally invoked (see the n8n / dispatcher split). Updated 2026-07-19 to a supervision
design based on long-lived n8n observer executions (the `BMAD Session (OpenCode)` loop with its
agent command swapped for a sandbox wrapper). Updated 2026-07-20 after review, superseding the
observer design with three linked decisions:

1. **The claim unit is a node** — one skill run, not a story. This resolves the open claim-unit
   question, dissolves the `Develop Epic` and `Develop Story (Playbook)` workflows entirely (a
   story is now a chain of graph nodes), and makes review steps individual nodes with explicit
   ordering edges.
2. **Supervision lives in the reconcile pass**, not in n8n observer executions. The observer
   design imported n8n's one structural weakness — an execution blocked in Execute Command dies
   on any restart — into the core of the architecture, then spent attach modes, spool files, and
   reconcile repair compensating. Since the repair path had to be fully robust anyway, the
   primary was redundant: everything runs on the level-triggered pass.
3. **Gen-3 state is defined fresh.** The gen-2 self-improvement substrate — `ledger.jsonl`,
   `playbook.json`, `runner-errors.jsonl`, the trends machinery and its policy vocabulary — is
   not carried over. Self-improvement is out of scope for this generation; a future reflector is
   a separate consumer that reads gen-3's own artifacts.

Supersedes and replaces the discarded stage-group parallelization plan
(`pipeline-parallelization-plan.md`, deleted 2026-07-17) — everything still relevant from that
plan is folded in here. Read [docs/self-improving-pipeline.md](../self-improving-pipeline.md)
for the current (gen-2) architecture; this plan describes gen-3, the next architecture
generation, not a delta to the current loop.

## Why this shape

n8n executes the nodes of one workflow execution sequentially, even when branches are wired "in
parallel" (verified in gen-1, recorded in the pipeline doc). But n8n runs *separate executions*
concurrently without any special setup — useful for small independent workflows, and irrelevant
for supervision once no long-lived supervisor exists. The discarded plan worked around the
sequential-execution constraint by doing OS-level concurrency inside a single node; this plan
removes the constraint instead: agents never converge on an n8n node at all, so there is
nothing to join.

The architecture inverts. Today n8n is the engine driving a sequential story loop and the
pipeline files are the record. Here the state is the engine:

- **A work graph, not a list.** Sprint planning emits nodes — one skill run each — with explicit
  `depends-on` edges (a directed acyclic graph) instead of an ordered sequence. A story is a
  chain of nodes; review steps are nodes of their own with explicit ordering edges. Any node
  whose dependencies are satisfied is claimable. Step and story ordering — not n8n — was the
  real obstacle to parallelism; making dependencies explicit is planning work, not plumbing
  work. Node granularity also buys back some story latency: independent review steps can run
  concurrently instead of queuing behind the slowest one.
- **A dispatcher, not a loop.** The dispatcher is not a resident process. Each invocation is a
  short reconcile pass, serialized by a lock: read all durable state, drive it to fixpoint
  (poll running work, fold results, update graph state, claim ready nodes, start workers), exit
  in seconds. A completion may unblock dependents, which become new claims, which produce new
  completions — the graph unfolds depth-first (descends into a node's dependents before
  starting unrelated siblings), not in planned waves. Passes are invoked by n8n on events
  (schedule tick, merge complete, question answered) — a local process call; n8n and the
  dispatcher live on the same devcontainer, and overlapping invocations simply queue on the
  lock and coalesce. Supervision is part of the pass itself: each pass polls every in-flight
  agent session, classifies any that exited, and acts — there is no per-worker supervisor
  process anywhere. Canonical pipeline state (journal, graph.json) has at most one writer at a
  time — the pass holding the lock; nothing else writes it. Each claim launches one opencode
  agent in a Daytona sandbox from a warm pool. Machine-level isolation eliminates the collision
  surfaces that same-machine concurrency creates (discovered in session-history analysis,
  2026-07-17): cross-process homicide (`pkill -f` can't cross machine boundaries), fixed port
  binding (each sandbox has its own port space), shared test databases (each sandbox runs its
  own Postgres), and shared-file corruption (`sprint-status.yaml`, `deferred-work.md` are
  per-sandbox). The opencode identity-collision risk is also removed — separate machine,
  separate storage. Epic 6 built sandbox provisioning for the product; the pipeline copies the
  discipline patterns, not the code.
- **Git is the convergence point.** Every agent pushes a branch; a serial merge queue
  (rebase → test → merge) integrates one branch at a time. Integration is serialized, work is
  not — integration takes minutes, skill runs take hours.
- **n8n keeps only small workflows:** the schedule tick that invokes the dispatcher, the
  question form + ntfy flow, the merge queue, error notification, and sprint status reporting.
  Nothing long-lived, nothing per-worker, and n8n never writes canonical pipeline state — its
  workflows write only inbox files (a question answer, an external event) that a pass folds in.
  The event-ingest webhook from the earlier design stays eliminated: every result is durable on
  disk (or in git) before the dispatcher is invoked, and every invocation is a contentless
  "wake up".

## What gen-3 keeps from gen-2, and what it discards

The rule applied throughout: **behaviors and small workflows carry over; engines and state do
not.** Gen-2's engines (the epic loop, the playbook interpreter, the session runner) dissolve
into gen-3 structures, and gen-2's state files stay with gen-2.

| Gen-2 piece | Fate in gen-3 |
|---|---|
| `Develop Epic` (n8n) | Dissolved — the epic loop becomes the graph plus dispatcher claiming; its reflect/learn steps are out of scope (see below) |
| `Develop Story (Playbook)` (n8n) + `playbook.json` | Dissolved — a story's step sequence becomes chain edges in the graph; each node spec carries its own skill/agent/prompt, so there is no playbook interpreter and no playbook file |
| `BMAD Session (OpenCode)` (n8n) | Dissolved — its behaviors (bounded runs, INCOMPLETE auto-continue, outcome classification, question form + ntfy resume) are reimplemented as pass logic plus one small question-form workflow; the workflow itself is not ported |
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
  command). A story is a *chain* of nodes connected by `depends-on` edges.
- **Chains share a branch.** A story chain works on one branch (`pipeline/<runId>/<story>`);
  each node's claim bases on its chain predecessor's pushed head. The chain's final node
  completing triggers the merge queue. Cross-story `depends-on` edges gate on the dependency
  story's *merge*, and the dependent bases on merged main.
- **Actively managed graph:** never expand more than ~2 stories' worth of unmerged chain ahead.
  The graph is expanded and replanned as work merges, not generated whole up front. A claimed
  node's spec is frozen; replanning touches only unclaimed nodes.
- **Depth-first traversal:** the dispatcher descends into a node's dependents before starting
  unrelated siblings.
- These rules — and the retry/timeout/capacity knobs (`maxAttemptsPerNode`, per-node timeout,
  max concurrent sandboxes) — are dispatcher claim-time policy: plain code plus a small policy
  block in gen-3's own state, defined fresh, not inherited from the gen-2 playbook's `policy`.
  Do not pick technology expecting it to enforce them.

## Dispatcher

The dispatcher is the bookkeeping *and supervision* engine. It is not a daemon and not a
resident event loop — it is a short reconcile pass: invoked, it acquires the state lock, drives
durable state to fixpoint, and exits in seconds. There is no long-lived supervisor anywhere in
the design; watching running agents is the poll step of every pass. "Woken by n8n" means
*invoked*: n8n runs on the same devcontainer (under pm2, started by `.devcontainer/start.sh`)
and launches a pass as a local process call (Execute Command, or HTTP to localhost). No network
hop, no tunnel, no listener waiting on a socket. Multiple events in short succession launch
multiple passes; they queue on the lock and coalesce.

Two rules make overlapping invocations safe:

- **Invocations carry no payload.** An invocation is a contentless "wake up". All information
  is durable before the invocation fires: n8n writes the question answer to an inbox file, then
  invokes; "merge complete" is visible in git before the merge-queue workflow invokes; a
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
   sandboxes carrying the pipeline scope label (Daytona API) and pushed branches (git). Destroy
   sandboxes no journal entry accounts for; collect work whose branch is pushed but whose
   outcome was never journaled (a pass died mid-fold — the poll step below picks it up
   naturally).
3. **Fold the inbox** — consume files written by n8n's small workflows (question answers,
   external events): append to the journal first (the append is the commit point), then
   regenerate `graph.json` (a derived view, rebuildable from the journal if a crash lands
   between the two writes).
4. **Poll in-flight sessions (supervision)** — for each running claim, check its session
   command via the Daytona API. Still running and inside its deadline → nothing. Past its
   deadline → terminate the session command, journal a `runner_error` event, continue per
   retry policy. Exited → pull exit code and logs, classify, act (see Supervision below).
5. **Re-evaluate** — which nodes are now ready? (Chain predecessor pushed or cross-story
   dependency merged, capacity available.)
6. **Claim and launch** — claim ready nodes depth-first (journal the claim), acquire a sandbox
   from the warm pool, `git checkout` to the claim's base, start the node's command via the
   Daytona session API with `runAsync` — the pass does not wait for it.
7. **Release the lock and exit** — agents still running unwatched, by design; the next pass
   picks them up.

The recursion of the old design survives across passes: a completion is detected by a pass, the
fold unblocks dependents, and the same pass claims and launches them. Workers stay busy because
every pass claims everything claimable — there is just no resident process between passes.

### Supervision (in-pass)

What gen-2's `BMAD Session (OpenCode)` did as a long-lived workflow, gen-3 does as the poll
step of every pass. The behaviors carry over; the workflow does not.

- **Outcome classification** — deterministic rules first (empty output → UNKNOWN, exit
  code ≠ 0 → INCOMPLETE), LLM fallback only for the COMPLETE/QUESTION/INCOMPLETE call. The
  rules and prompt are ported from gen-2's `Parse OpenCode Response` + `BMAD Outcome` into a
  small JS module; a classification call adds a few seconds to a pass, which stays within the
  seconds-long budget.
- **Provider-error recovery** — INCOMPLETE (including timeout terminations) issues an async
  `opencode run --session <id>` continue in the same sandbox, bounded by retry policy. This
  reproduces the gen-2 behavior where a long-running step survives the per-run timeout through
  repeated timeout → INCOMPLETE → continue cycles — as pass logic, not workflow logic.
- **Question surfacing** — QUESTION journals the node `parked` (a third status — not `success`,
  not `failed` — so a question is never misread as a defect), stops the sandbox, and triggers
  the small n8n question-form workflow (Wait-form + ntfy with the resume URL). The canonical
  parked state is the journal entry; the n8n suspension is only the human-facing surface, so if
  it is ever lost a pass can re-fire it from the journal.
- **Machinery evidence** — non-zero exits, timeouts, and API failures are journaled as
  `runner_error` events in the gen-3 journal (there is no separate `runner-errors.jsonl`).
- **Durability floor** — the agent's in-sandbox command pushes its branch as its last act, so a
  completed result is durable in git no matter what was or wasn't watching when it finished.

Because no supervisor process exists, the failure mode the observer design revolved around —
supervisor death on n8n restart or devcontainer sleep — does not exist. A restart or sleep
costs nothing but detection latency: the next pass polls the same sessions the last one would
have. There is no attach mode, no execution-ID bookkeeping, no spool files.

### Atomicity

All canonical state and the lock live on one local filesystem (co-location is load-bearing —
see below). Three primitives cover every mutation:

| Primitive | Guarantee |
|---|---|
| Blocking `flock` held for the whole pass | Mutual exclusion between passes; released automatically on process death — no stale-lock handling |
| Single-`write` `O_APPEND` appends to `journal.jsonl` | Atomic appends on a local filesystem |
| tmp-file + `renameSync` for `graph.json` | Atomic replace |

Multi-file consistency comes from write ordering, not transactions: journal first (the commit
point), `graph.json` second (derived, rebuildable). Claims are exclusive by construction — a
claim is a journal append plus a graph mutation performed under the lock, so two passes cannot
double-claim. SQLite would package the same guarantees but costs human-readable jsonl for
debugging and inspection; not needed at tens of nodes.

### n8n / dispatcher split

n8n and the dispatcher are co-located on the devcontainer. n8n is not deployed to Railway and
is not always-on in absolute terms — it runs under pm2 (`.devcontainer/start.sh`) and sleeps
when the devcontainer sleeps. The real split is persistent service vs ephemeral process: n8n is
up for as long as the devcontainer is up and owns schedules, forms, and notifications; the
dispatcher is a seconds-long reconcile pass that n8n invokes locally. The division of labor
follows what each is good at — n8n handles scheduling and human-facing flows; the dispatcher
handles graph algorithms, supervision, and state writing.

Two consequences of n8n being local, stated so nobody designs against the wrong model:

- **No inbound path from the internet.** External webhooks (e.g. GitHub) cannot reach this n8n.
  Every trigger originates locally: n8n schedules, n8n-internal workflow completions (the merge
  queue is an n8n workflow, so "merge complete" is an internal event, not a webhook), and forms
  opened from this machine's browser via forwarded ports.
- **Co-location is load-bearing.** Dispatcher invocation and the merge queue's repo access
  assume n8n can execute commands on the machine that holds the repo. Moving n8n off the
  devcontainer (e.g. to Railway) would be its own architecture change, not a deployment detail.

| Responsibility | Home | Why |
|---|---|---|
| Trigger the dispatcher (schedule tick, question answered, merge complete) | n8n | Persistent scheduler while the devcontainer is up; invokes a pass as a local process call. |
| Merge queue | n8n | Sequential, API-driven, retry-on-conflict. Textbook n8n workflow. |
| Question surfacing (form + ntfy) | n8n (small workflow) | Durable Wait-form suspension and forms are n8n's strength. Human-facing surface only — the journal holds the canonical parked state. |
| Error notification | n8n | Existing small workflow, unchanged. |
| Sprint status / reporting | n8n | Read gen-3 state, format, notify. |
| Graph traversal + claim logic | Dispatcher pass (JS) | DAG algorithm with stateful mutations. Needs testing, iteration. |
| Supervision + outcome classification | Dispatcher pass (JS) | Level-triggered session polling; deterministic rules + one LLM call. No long-lived process to die. |
| Workspace provisioning | Dispatcher pass (JS) | SDK calls + filesystem ops. |
| State writing (journal, graph.json) | Dispatcher pass (JS) | At most one writer at a time — the pass holding the lock. |
| Reconciliation | Dispatcher pass (JS) | Every pass: cross-check journal vs sandboxes vs git; collect, destroy, continue. |
| In-sandbox command (opencode run + branch push) | Command template (JS) | Generated by the dispatcher, executed via the Daytona session API; ends with the branch push. |

Single-writer restated: not "one resident process is the writer" but "at most one pass holds
the lock at a time." n8n's small workflows never touch canonical state — they write only inbox
files (a question answer, an external event) that a pass folds in. Agents write nothing shared;
their only output channels are their branch push and their session logs, both read by passes.
Session-history analysis (2026-07-17) confirmed agents already don't write to pipeline state
files in the sequential architecture; the parallel architecture keeps that by construction.

### Data flow

```
n8n (persistent service on the devcontainer, under pm2 — small workflows only)
  │
  ├─ Schedule tick (every few minutes) → invokes dispatcher   ← primary heartbeat
  ├─ Question form + ntfy → answer to inbox file → invokes dispatcher
  ├─ Merge queue workflow → invokes dispatcher when a merge lands
  ├─ Error notification (ntfy)
  └─ Sprint status / reporting (reads gen-3 state)
       │  contentless invocations — every payload is already durable on disk or in git
       ▼
Dispatcher pass (same devcontainer, seconds long, one at a time under flock)
  1. Reconcile (journal vs labeled sandboxes vs pushed branches)
  2. Fold inbox → journal.jsonl (commit point) → graph.json (derived)
  3. Poll in-flight sessions → classify exits → act (continue / park / collect)
  4. Re-evaluate ready nodes
  5. Claim depth-first → start session commands (runAsync)
  6. Release lock, exit
       │  Daytona API: create/stop/destroy, session exec, log pull
       ▼
Daytona sandboxes (one opencode agent each; agent pushes its branch as its last act)
```

When an agent finishes:

1. The in-sandbox command pushes the branch — durability does not depend on anything watching.
2. The next pass (tick, or any other invocation) polls the session, sees it exited, pulls exit
   code and logs, and classifies the outcome.
3. The pass folds the outcome: journal append, graph mutation. COMPLETE on a chain-final node
   triggers the merge queue; COMPLETE mid-chain makes the successor ready and the same pass
   claims it; INCOMPLETE issues an async session continue.
4. If the outcome is QUESTION: the pass journals `parked` (with sandbox ID, session ID, and
   question text), stops the sandbox, and triggers the question-form workflow, which fires ntfy
   with the form URL and suspends on its Wait node. The human's answer is written to the inbox
   and the dispatcher invoked; the next pass starts the sandbox and issues
   `opencode run --session <id> --dir <sandbox-repo-path> "<answer>"` async, journaling the
   resume. Parking costs nothing while the question waits — disk and `OPENCODE_DB` survive a
   Daytona stop.

### Implementation surface

Rough estimate, ~880 lines of JS plus two small n8n workflows:

| Module | Lines | Reuses |
|---|---|---|
| Graph management (CRUD, DAG traversal, claim, chain/branch bookkeeping) | ~250 | New |
| Workspace provisioning (sandbox create, env, warm pool, cleanup) | ~200 | Patterns from product's SandboxService |
| Supervision (session poll, deadline check, continue, park/resume actions) | ~150 | New — behaviors from gen-2's `BMAD Session (OpenCode)`, no workflow port |
| Classification (deterministic rules + LLM fallback) | ~80 | Rules and prompt ported from `Parse OpenCode Response` / `BMAD Outcome`; no n8n dependency |
| Pass frame (flock, inbox fold, reconcile) | ~150 | New; helper patterns copied from gen-2 scripts, no imports |
| In-sandbox command template (opencode run, exit capture, branch push) | ~50 | New |
| Question-form workflow (form + ntfy + inbox write + invoke) | n8n, small | New — the Wait-form/ntfy pattern from gen-2, as a standalone workflow |
| Merge queue workflow | n8n, small | New |

Honest comparison with the superseded observer design (~700 lines + a 19-node workflow port):
the agent-lifecycle code the observer design deleted from its estimate returns here, but
smaller — level-triggered polling is simpler than spawn/relay/monitor, and attach mode,
observer-death handling, and spool files disappear entirely. Total effort is comparable; moving
parts are fewer.

## State

- Gen-3 state lives in its own directory (working name `_bmad-output/pipeline3/`), so the gen-2
  loop and its files remain untouched and runnable while gen-3 is built. Canonical state is
  two files plus an inbox: `journal.jsonl` (append-only commit point; gen-3 schema: claims with
  sandbox/session IDs and deadlines, outcomes, parks/resumes, merge events, `runner_error`
  events, policy decisions), `graph.json` (derived view, rebuildable from the journal), and
  `inbox/` (written by n8n's small workflows, consumed and deleted by passes). Per-run log
  excerpts go to a plain directory for debugging. At most one writer at a time for canonical
  state: the pass holding the lock.
- **Not part of gen-3 state:** gen-2's `journal.jsonl`, `ledger.jsonl`, `playbook.json`,
  `runner-errors.jsonl`, and trends. Gen-3 writes nothing to them and reads nothing from them.
  Anything a future reflector needs must come from gen-3's own journal.
- **Atomic writes required:** passes write `graph.json` via tmp-file + `renameSync` (see
  Atomicity under Dispatcher); any viewer keeps last-good state on parse failure. (Gen-2's
  `scripts/pipeline/lib.mjs:24` uses plain `fs.writeFileSync` — a known gap there; gen-3
  starts atomic.)
- **No in-memory truth.** The devcontainer sleeps and gets rebuilt, so journal + graph on disk
  must be sufficient to resume from cold. There is no separate startup sweep — every pass
  reconciles, so recovery from sleep or rebuild is the same code path as a normal tick. The
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

## Worker pool design

### Per-agent workspace recipe (sandbox tier)

A pool of N pre-warmed Daytona sandboxes. Each sandbox is a separate machine — isolation is free,
no collision-mitigation discipline needed.

**Provisioning (warm pool, done ahead of time):**
- Build a custom snapshot via the Declarative Builder (`Image.debian_slim()` or `Image.base()`
  with `run_commands()` for Node.js, Yarn, Postgres, Playwright browsers, opencode, and any
  system packages). Pre-bake the repo's dependencies into the snapshot so `yarn install` is a
  no-op at claim time. Daytona caches declarative images for 24h; subsequent runs on the same
  runner are "almost instantaneous." This is the warm pool — every worker starts from this
  snapshot in seconds, not minutes.
- Create sandboxes from the custom snapshot with explicit resources:
  `resources: { cpu: 4, memory: 8, disk: 10 }` (the platform max). Create from image, not
  snapshot, to control resources — snapshots ignore resource params.
- `git clone --depth 1` the repo into the sandbox (shallow, fast). The Daytona SDK's `git.clone`
  has no depth parameter — use `executeCommand('git clone --depth 1 ...')` instead.
- Copy `.env`, `.env.test`, `.auth/` from the dispatcher into the sandbox. These are gitignored,
  small, and contain secrets — never in the repo, never in the snapshot. The dispatcher holds
  them and pushes per-sandbox at provision time. This transfer is a non-issue: sandboxes are
  trusted with secrets like the dev machine (see Credentials under Sandbox lifecycle).
- Apply `domainAllowList` for egress control. The essential services allowlist already covers
  GitHub, npm, Anthropic, opencode, Playwright, Railway, and Docker registries — start with
  `networkBlockAll: false` (default) and tighten to an explicit allowlist when the pipeline is
  stable. Updatable at runtime without restart.

**Per-claim (fast, from warm pool):**
- A pass claims a sandbox from the pool, journals the claim (with its deadline), and
  `git fetch && git checkout` to the claim's base — the chain predecessor's pushed head, or
  merged main for a chain's first node.
- The pass starts the node's command inside the sandbox via the Daytona session API
  (`createSession` + `executeSessionCommand({ runAsync: true })`) with
  `--dir <sandbox-repo-path>` and a per-run `OPENCODE_DB=<tmp>/opencode.db`, then exits — the
  pull-based transport model the product already uses. Later passes poll the command's state
  and pull logs via `getSessionCommandLogs`. The sandbox never calls back to the devcontainer.
- The in-sandbox command ends with a branch push (`git push origin HEAD:pipeline/<runId>/<story>`
  — the chain branch) so the result is durable in git regardless of what is watching.
- Deadlines are enforced pass-side: a pass finding a claim past its deadline terminates the
  session command in the sandbox, journals a `runner_error` event, and continues the session
  per retry policy.

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
| Network allow-listing | ✅ Runtime-updatable | `domainAllowList` (wildcards, max 20) + `networkAllowList` (CIDR, max 10) + `networkBlockAll`. Updatable on a running sandbox without restart. Essential services (npm, GitHub, Anthropic, Docker, Playwright, Railway, opencode) are pre-allowed on all tiers |
| Warm pool | ❌ Not provided by platform | The platform has no pool/acquire-release abstraction. Pre-built snapshots make cold starts fast (cached 24h), but the dispatcher must build its own pool management |

One real gap: **warm pool mechanism** — the dispatcher must build this. Everything else is
platform-supported.

### Sandbox lifecycle

- On completion (success or failure): destroy the sandbox (or return to pool if warm and clean).
  The agent's in-sandbox command pushes the branch as its last act — completion is durable in
  git even if nothing was alive to watch it happen; git is the persistence layer. No worktree
  to remove, no branch to delete — the sandbox's entire filesystem is ephemeral.
- **Reconcile on every pass:** list sandboxes with the pipeline `scope` label and cross-check
  against the journal. A sandbox no entry accounts for is orphaned (crash, terminate, rebuild
  mid-run) and gets destroyed; a running one with a live claim is polled; a finished one gets
  collected. The product's `cleanup-daytona-sandboxes.ts` is account-wide destructive — the
  pipeline needs a scoped reaper (Epic 8.1 adds one for the product; depend on it or build its
  own).
- **Quota management:** the Daytona account has a 30 GiB shared disk quota across all
  environments. Shallow clones (`--depth 1`) reduce per-sandbox disk. The dispatcher must track
  disk usage and enforce a budget. Label every sandbox with `scope: pipeline` and a `runId` —
  the product's lack of scoping is a known problem the pipeline must not reproduce.
- **Credentials: sandboxes carry the same trust as the dev machine (decided by Marius,
  2026-07-17).** Pipeline sandboxes run our own agents on our own code — they are not a
  lower-trust tier, so transferring secrets from the dispatcher into a sandbox is a non-issue
  and no minimization boundary applies. Provision whatever the work needs (`.env`, `.env.test`,
  `.auth/`, API keys); anything left out (e.g. platform-internal keys like `AUTH_SECRET` or
  `CREDENTIAL_ENCRYPTION_KEK`) is omitted because agents have no use for it, not as a security
  control. This deliberately relaxes the product's sandbox credential discipline — the
  product's rules serve its own threat model, which the pipeline does not share. Secrets still
  never go into the repo or the snapshot: a committed or cached-image copy is a different,
  broader exposure surface than a live sandbox.

### opencode concurrency: resolved (both phases complete)

The concurrency experiment tested whether isolated `OPENCODE_DB` per agent prevents the identity
collision observed when multiple opencode instances share git identity. Both phases are complete;
the result is moot for the sandbox tier — separate machines have separate storage by definition.
The experiment's value is confirming that the isolated-DB pattern works, which the sandbox recipe
inherits (each sandbox gets its own `OPENCODE_DB`). Documented in full because it encodes a
failure already paid for once:

- **Known failure** (see the `n8n-workflow-authoring-gotchas` memory): `opencode run` from a
  second worktree *or* a standalone `git clone --local` at a different path, while a real
  pipeline session was active, failed instantly with `UnknownError: Unexpected server error` —
  before the LLM was called. The session log showed the second instance was assigned the *same*
  internal project identifier as the live repo despite a different `directory=`: opencode keys
  "project" off git remote/repo identity, not filesystem path.
- **Also observed:** three opencode processes (`opencode serve`, a TUI session, a pipeline
  `opencode run`) running simultaneously with cwd = this repo, no collision. Same-path
  coexistence was never the failure mode — different-path worktrees sharing git identity were.
- **The lever, tested in both phases:** `OPENCODE_DB=<path>` points a run at an isolated SQLite
  storage file, and `--dir <path>` sets the working directory. Per-agent `--dir` + `OPENCODE_DB`
  gives fully separate storage and cwd. Phase 1 (throwaway repo) and phase 2 (worktrees of this
  repo, sharing its git identity) both confirm isolated `OPENCODE_DB` per agent is safe at N=6 —
  no collisions, no DDL races. This matches what the workspace recipe above already prescribes.
- **Shared-DB caveat (observed, not blocking):** a shared custom `OPENCODE_DB` has a DDL migration
  race at cold start — when multiple instances simultaneously run schema migrations on a fresh DB,
  one fails with a `CREATE TABLE workspace` error. `busy_timeout=5000` does not protect during
  migrations. Pre-warming the DB (one instance migrates first) eliminates the race. Isolated DBs
  sidestep it entirely, which is why the recipe uses them.
- **Phase 1 (throwaway repo):** `git init` in `/tmp/oc-test/repo`, 6 worktrees, a script spawning N
  concurrent `opencode run` with isolated vs shared `OPENCODE_DB`. 6 experiments (N=3 and N=6,
  isolated vs shared DB, cold vs warm start). Results: isolated `OPENCODE_DB` 9/9 success; shared
  DB 5/6 at cold start with a reproducible DDL-migration race (see caveat above), 6/6 when
  pre-warmed.
- **Phase 2 (this repo's worktrees):** 6 worktrees of bmad-playground created via
  `git worktree add`, each with isolated `OPENCODE_DB` and `--dir <worktree>`, run concurrently
  while a live session was active against the main repo (the exact condition of the original
  failure). Results: 2/2, 3/3, 6/6 success — zero failures across 11 runs. Every instance was
  assigned the same `projectID` (git-identity-derived, identical to the live main-repo session);
  opencode's project refresh listed all 7 dirs sharing that ID. **The identity collision did not
  recur.** The `UnknownError: Unexpected server error` was a shared-mutable-state collision in a
  common DB, not a fundamental git-identity problem. Isolated storage per agent removes the shared
  mutable state; same-projectID coexistence is safe.
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
- The sandbox is stopped while parked: disk and `OPENCODE_DB` survive a Daytona stop, so
  parking costs nothing while the question waits (the human-response window is unbounded — the
  existing no-timeout limitation on questions carries over).
- Other agents are unaffected; nothing finished is discarded or re-run.
- An answer resumes exactly one session: the human submits the form, n8n writes the answer to
  the inbox and invokes the dispatcher, and the next pass starts the sandbox and issues
  `opencode run --session <id> --dir <sandbox-repo-path> "<answer>"` async, journaling the
  resume. Agents still never talk to n8n.
- **Decision stands from the previous plan: park/resume is required from the first rollout step,
  no fail-and-retry stopgap.**
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

### Dependency knowledge for the graph

- `review-code` *writes* fixes to the same code the other review steps *read*. With review
  steps as individual nodes, this is an explicit edge planning must emit — which direction
  (fix-writing review before or after the read-only reviews) is a per-story planning decision,
  and the graph makes it visible instead of burying it in a step sequence.

## Honest costs

- The graph encodes *declared* dependencies only. Unknown coupling surfaces later as merge-queue
  conflicts and rework. The main win is throughput (stories per day); node granularity buys
  some latency where review steps are independent, but a chain is still sequential.
- Canonical pipeline state (journal, graph.json) has at most one writer at a time — the pass
  holding the lock. n8n's small workflows write only inbox files; agents write nothing shared.
  There are no concurrent writers to any shared file, and no event can be lost: every payload
  is durable on disk or in git before any dispatcher invocation fires.
- Completions are detected by polling at tick cadence, not pushed — minutes of latency against
  runs measured in hours. There is no live log streaming; logs are pulled on demand (a small
  `logs <node>` helper makes this a one-liner). Acceptable; revisit only if it hurts in
  practice.
- Outcome classification calls an LLM from inside a pass — a few seconds per exited session,
  within the seconds-long pass budget.
- The practical caps on parallelism are the Daytona quota and the max-concurrent-sandboxes
  policy knob — n8n execution concurrency no longer participates, since no execution lives
  longer than a form suspension.
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
  nothing in the sandbox calls back. Passes pull logs via the Daytona session API, and the
  agent's only outbound act is its final git push.
- The platform provides no warm-pool abstraction. Pre-built snapshots make cold starts fast
  (cached 24h, near-instant on same runner), but acquire/release/reclaim logic is the
  dispatcher's responsibility.
- The devcontainer sleeps and gets rebuilt. When it sleeps, n8n and the dispatcher go down with
  it — no ticks fire, no questions can be answered — while sandboxes keep running (or auto-stop
  on their own intervals), consuming compute and quota unsupervised. Nothing is lost: parked
  questions survive (Wait suspensions are durable, and the journal is the canonical record),
  finished work survives (agents push their own branches), and running agents are simply polled
  by the first pass after wake — the same reconciliation every pass performs, with more failure
  modes to handle (sandbox crashed, auto-stopped, auto-archived, quota exhausted while down).
  It must be robust, not best-effort. Pipeline availability is coupled to this machine's
  uptime; that is an accepted cost of the local-first design, and the standing argument for
  moving n8n and the pipeline to an always-on host if it starts to bite.
- Human attention becomes the scarce resource; the question inbox and a near-zero question rate
  are what keep N agents from turning into N interruptions.

## Path (incremental, each step independently useful)

1. ~~Run the opencode concurrency experiment~~ — done (both phases). Isolated `OPENCODE_DB` per
   agent is safe at N=6. Moot for the sandbox tier (separate machines), but confirms the
   isolated-DB pattern the sandbox recipe inherits.
2. **Build the custom snapshot and warm pool** (gates the sandbox tier):
   - Build a custom Daytona snapshot via the Declarative Builder: Node.js, Yarn, Postgres,
     Playwright browsers, opencode, and the repo's dependencies pre-installed. This eliminates
     the per-sandbox install step and makes claim-to-start fast.
   - Warm pool mechanism: the dispatcher acquires a pre-warmed sandbox per claim, resets it to
     the claim's base commit, and returns it to the pool (or destroys it) on completion. The
     platform has no pool abstraction — the dispatcher builds its own. Pre-built snapshots make
     cold starts fast (cached 24h), so the pool can be lazy (create on demand) rather than
     eagerly maintained, at the cost of first-claim latency.
   - Scoped reaper: destroy orphaned sandboxes on dispatcher crash — don't reproduce the
     product's 30 GiB quota-exhaustion problem. Label every sandbox with `scope: pipeline` and
     a `runId`.
   - Verify Yarn 4 Berry works with adequate disk (the initial failure was almost certainly the
     3 GB default disk, not a platform incompatibility).
3. Build the per-agent machinery: the in-sandbox command template (opencode run, exit capture,
   terminal branch push), session start/poll/continue via the Daytona session API, the
   classification module (deterministic rules + LLM fallback, prompt ported from gen-2),
   deadline enforcement (terminate + journal + continue), park/resume with a synthetic question
   (including sandbox stop/start around the park), the small question-form workflow, and
   conflict-as-evidence journaling. Kill n8n and sleep the devcontainer mid-run and verify the
   next pass reconciles correctly (collects finished work, keeps polling running work). Test
   against disposable sandboxes with synthetic steps before any real BMAD skill run.
4. Introduce the graph: `depends-on` edges in sprint planning output, `graph.json` and the
   reconcile pass with the plan-2-ahead / depth-first policy, node-granularity claims with
   chain branches. First taste of parallelism: two independent nodes from different stories as
   two concurrent sandboxes. This is the permanent design — sandboxed agents supervised by
   level-triggered passes; no per-worker supervisor exists anywhere. Tune the tick cadence
   here.
5. Move "done" from workflow-return to branch-merged: merge queue (n8n workflow) + Mermaid
   graph view. Agents push their own branches; the pass that folds a chain-final SUCCESS
   triggers n8n's merge queue; no event-ingest webhook — canonical state is written only under
   the pass lock.
6. Upgrade the viewer to `viewer.html` when interactivity earns it.

First real parallel run should be manual and supervised, including at least one supervised park —
same discipline the discarded plan prescribed.

## Resolved questions

1. **Node definition:** a graph node = one skill run (BMAD-agnostic — any skill, not just BMAD) or
   another atomic action like a CLI command — finer than a whole story. (Reframes the original
   "whole stories only vs review steps as nodes.")
2. **Claim unit (2026-07-20): the node.** A story is a chain of nodes sharing one branch; each
   node's claim bases on its predecessor's pushed head; the merge queue runs at chain end.
   Story-unit vocabulary from earlier drafts (attempts, branch naming, the park boundary) is
   restated per-node above. Decided from the vision (resolved question 1), not from the
   inventory of existing workflows — claim-a-story survived as an option mainly because
   `Develop Story (Playbook)` already existed.
3. **Supervision home (2026-07-20): the reconcile pass.** The observer-execution design
   required its recovery path (re-attach after routine observer death) to be fully robust,
   which made the observers themselves redundant. Level-triggered polling from passes replaces
   them; n8n keeps only small human-facing workflows.
4. **`review-code` ordering hazard: resolved by node granularity.** Review steps are individual
   nodes; the write/read ordering is an explicit edge that planning emits per story (see
   Dependency knowledge).
5. **Gen-2 self-improvement: not inherited (2026-07-20).** Out of scope for gen-3; a future
   reflector is a separate consumer of gen-3's own journal, designed for a parallel world (the
   gen-2 between-stories reflection cadence has no equivalent here). Gen-3 reads and writes
   none of gen-2's state files.

## Open questions

1. Merge-queue test scope: full suite per merge, or affected-only (`nx affected`) with a
   periodic full run?
2. Warm pool size: how many sandboxes to keep warm? 5 is the starting estimate, but the actual
   number depends on claim rate, sandbox lifetime, and quota. The pool needs auto-scaling logic
   or a fixed size that's "good enough."
3. Snapshot lifecycle: the custom snapshot needs updating when the repo's dependencies change
   (new packages in `package.json`, new system packages). The Declarative Builder caches for 24h;
   a stale cache means new deps aren't installed. Who triggers a rebuild, and how is snapshot
   freshness tracked against the repo's lockfile?
4. Planning-node output contract: graph expansion is itself a skill run (a planning node
   claimed like any other when ready nodes run low). How do the nodes and edges it produces
   enter `graph.json`? Leading idea: a graph-delta file in the planning node's merged branch,
   folded by the next pass — keeps the single-writer rule intact. Decide before Path step 4.
