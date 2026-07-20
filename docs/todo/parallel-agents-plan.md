# Plan: dependency-graph pipeline with parallel opencode agents

Status: draft vision, not started. Written 2026-07-17, updated same day to make Daytona sandboxes
the primary worker tier (was: local worktrees as first tier, sandboxes as graduation), and again
to pin down hosting: n8n runs on the devcontainer under pm2 (not Railway), and "woken by n8n"
means locally invoked (see the n8n / dispatcher split). Updated 2026-07-19 to the current
supervision design: per-worker supervision moves into n8n observer executions (the existing
`BMAD Session (OpenCode)` loop with its agent command swapped for a sandbox wrapper), and the
dispatcher becomes a short, lock-serialized, level-triggered reconcile pass instead of a
resident event loop. Supersedes
and replaces the discarded stage-group parallelization plan (`pipeline-parallelization-plan.md`,
deleted the same day) — everything still relevant from that plan is folded in here. Read
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
- **A dispatcher, not a loop.** The dispatcher is not a resident process. Each invocation is a
  short reconcile pass, serialized by a lock: read all durable state, drive it to fixpoint
  (fold new results, update graph state, claim ready nodes, start workers), exit in seconds.
  A completion may unblock dependents, which become new claims, which produce new completions —
  the graph unfolds depth-first (descends into a story's dependents before starting unrelated
  siblings), not in planned waves. Passes are invoked by n8n on events (merge complete,
  question answered, observer finished, schedule tick) — a local process call; n8n and the
  dispatcher live on the same devcontainer, and overlapping invocations simply queue on the
  lock and coalesce. Long-lived supervision is not the dispatcher's job: each claim is watched
  by one n8n observer execution (see Observer executions under Dispatcher). Canonical pipeline
  state (journal, ledger, graph.json, playbook.json) has at most one writer at a time — the
  pass holding the lock; agents and observers never write it directly. Each claim launches one
  opencode agent in a Daytona sandbox from a warm pool. Machine-level isolation eliminates the
  collision surfaces that same-machine concurrency creates (discovered in session-history
  analysis, 2026-07-17): cross-process homicide (`pkill -f` can't cross machine boundaries),
  fixed port binding (each sandbox has its own port space), shared test databases (each sandbox
  runs its own Postgres), and shared-file corruption (`sprint-status.yaml`, `deferred-work.md`
  are per-sandbox). The opencode identity-collision risk is also removed — separate machine,
  separate storage. Epic 6 built sandbox provisioning for the product; the pipeline copies the
  discipline patterns, not the code.
- **Git is the convergence point.** Every agent pushes a branch; a serial merge queue
  (rebase → test → merge) integrates one branch at a time. Integration is serialized, work is
  not — integration takes minutes, stories take hours.
- **n8n keeps two jobs:** human-facing workflows (question forms, ntfy notifications, sprint
  status reporting, external triggers that invoke the dispatcher) and per-worker supervision —
  one long-lived observer execution per claim, reusing the `BMAD Session (OpenCode)` loop that
  already starts an agent, retries provider errors, surfaces questions, and returns when the
  agent says it is done. n8n still never writes canonical pipeline state — observers record to
  per-run spool files that a dispatcher pass folds in. The event-ingest webhook from the
  earlier design stays eliminated: every result is durable on disk before the dispatcher is
  invoked, and every invocation is a contentless "wake up".

## Graph management rules (decided)

- **Actively managed graph:** never plan more than 2 stories ahead. The graph is expanded and
  replanned as work merges, not generated whole up front.
- **Depth-first traversal:** the dispatcher descends into a story's dependents before starting
  unrelated siblings.
- These rules are dispatcher claim-time policy — plain code, not a feature of any store or
  engine. Do not pick technology expecting it to enforce them.

## Dispatcher

The dispatcher is the bookkeeping engine. It is not a daemon and not a resident event loop — it
is a short reconcile pass: invoked, it acquires the state lock, drives durable state to
fixpoint, and exits in seconds. Supervision of running workers is not its job (the observer
executions hold that — see below); a pass never waits on anything except the lock. "Woken by
n8n" means *invoked*: n8n runs on the same devcontainer (under pm2, started by
`.devcontainer/start.sh`) and launches a pass as a local process call (Execute Command, or HTTP
to localhost). No network hop, no tunnel, no listener waiting on a socket. Multiple events in
short succession launch multiple passes; they queue on the lock and coalesce.

Two rules make overlapping invocations safe:

- **Invocations carry no payload.** An invocation is a contentless "wake up". All information
  is written durably before the invocation fires: n8n writes the question answer to disk, then
  invokes; an observer writes its outcome to the inbox, then invokes; "merge complete" is
  visible in git before the merge-queue workflow invokes. Nothing can be lost — the worst case
  for a redundant invocation is a pass that finds nothing to do.
- **Passes are level-triggered, not edge-triggered.** A pass never processes "the event that
  woke it"; it reads the entire current state and processes everything that state implies. Two
  events in short succession: the first pass to take the lock handles both; the second finds
  fixpoint already reached and exits. This replaces the earlier single-instance-lock design
  where a second invocation was a no-op — a no-op arriving while the running dispatcher is
  deciding to exit can silently drop an event; a queued level-triggered pass cannot.

### Reconcile pass

Each invocation:

1. **Acquire the lock** — blocking `flock` on a lockfile. Passes are seconds long, so waiting
   is fine. `flock` releases automatically when the process dies, so a crashed pass cannot
   leave a stale lock.
2. **Reconcile** — cross-check the journal's parked and in-flight entries against reality:
   sandboxes carrying the pipeline scope label (Daytona API) and their observer executions
   (n8n API). Collect finished work whose observer died, attach a fresh observer to a running
   orphan, destroy sandboxes no entry accounts for.
3. **Fold the inbox** — consume outcome files and per-run journal spools written by observers:
   append to the canonical journal first (the append is the commit point), then regenerate
   `graph.json` (a derived view, rebuildable from the journal if a crash lands between the two
   writes).
4. **Re-evaluate** — which nodes are now ready? (Dependencies all merged, capacity available.)
5. **Claim and launch** — claim ready nodes depth-first (journal the claim), acquire a sandbox
   from the warm pool, `git checkout` to the claim's base, and start one observer execution per
   claim. The observer records its execution ID to its spool as its first act, so later passes
   can cross-check it during reconcile.
6. **Release the lock and exit** — workers still running, observers still watching. Liveness
   comes from observer-completion invocations, plus a periodic n8n schedule tick as a safety
   net for anything that dies without invoking.

The recursion of the old design survives across passes: a completion invokes a pass, the fold
unblocks dependents, and the same pass claims and launches them. Workers stay busy because
every completion immediately triggers the next claim — there is just no resident process
between completions.

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
double-claim. SQLite would package the same guarantees but costs the human-readable jsonl that
reflection reads; not needed at tens of nodes.

### Observer executions (supervision)

Each claim is supervised by one long-lived n8n execution of the observer workflow: the existing
`BMAD Session (OpenCode)` loop with its two `Agent run` Execute Command nodes swapped from a
local `opencode run` to a sandbox wrapper script. The wrapper spawns `opencode run` inside the
sandbox via the Daytona session API, relays the log, and exits with the opencode process's exit
code. n8n's Execute Command node reads `exitCode` natively, so the wrapper only needs to emit
the same JSON-lines stdout contract the local runner produces.
Everything downstream of that contract carries over unchanged and already battle-tested:

- **Outcome classification** — `Parse OpenCode Response` + `BMAD Outcome`: deterministic rules
  first (empty output → UNKNOWN, rc≠0 → INCOMPLETE), LLM fallback only for the
  COMPLETE/QUESTION/INCOMPLETE call.
- **Provider-error recovery** — INCOMPLETE loops back into `opencode run --session <id>` until
  the agent produces COMPLETE or QUESTION. This loop is what lets a 137-minute `review-nfrs` step
  survive the 90-minute per-run timeout, as repeated timeout → INCOMPLETE → continue cycles.
- **Question surfacing** — QUESTION suspends the execution on its Wait-form node (durable
  across n8n restarts), fires ntfy with the resume URL, and the human's form answer resumes
  into a `--session` follow-up. The suspended execution *is* the parked state.
- **Machinery evidence** — non-zero exits are captured as `runner-errors` records exactly as
  today (written to the run's spool, folded by a pass).

n8n runs separate executions concurrently (the fact this whole plan is built on), so N claims
get N observers with no new n8n primitives. Supervision is lighter than today's local tier:
the heavy opencode process runs remotely; the local child only relays logs.

One limitation is structural and is designed for, not hoped away: **an execution blocked inside
Execute Command does not survive an n8n restart.** Wait-node suspensions are durable; a blocked
`Agent run` is not — a pm2 restart or devcontainer sleep terminates it and n8n marks the
execution crashed, while the sandbox agent keeps running. Observer death is therefore routine,
not exceptional, and every reconcile pass handles it. Two mechanisms make that safe:

- **Attach mode in the wrapper:** given a sandbox ID and session ID, resume relaying an
  already-running session from its current position, so a pass can start a fresh observer
  execution against a running orphan.
- **The agent pushes its own branch** as the last act of its in-sandbox command, so a completed
  result is durable in git even if nobody was watching when it finished.

### n8n / dispatcher split

n8n and the dispatcher are co-located on the devcontainer. n8n is not deployed to Railway and
is not always-on in absolute terms — it runs under pm2 (`.devcontainer/start.sh`) and sleeps
when the devcontainer sleeps. The real split is persistent service vs ephemeral process: n8n is
up for as long as the devcontainer is up and owns schedules, forms, workflow events, and the
long-lived observer executions; the dispatcher is a seconds-long reconcile pass that n8n
invokes locally. The division of labor follows what each is good at — n8n handles scheduling,
human-facing flows, and long-lived supervision (durable Wait suspensions, retry loops); the
dispatcher handles graph algorithms and state writing.

Two consequences of n8n being local, stated so nobody designs against the wrong model:

- **No inbound path from the internet.** External webhooks (e.g. GitHub) cannot reach this n8n.
  Every trigger originates locally: n8n schedules, n8n-internal workflow completions (the merge
  queue is an n8n workflow, so "merge complete" is an internal event, not a webhook), and forms
  opened from this machine's browser via forwarded ports.
- **Co-location is load-bearing.** Dispatcher invocation, the merge queue's repo access, and
  skill runs all assume n8n can execute commands on the machine that holds the repo. Moving n8n
  off the devcontainer (e.g. to Railway) would be its own architecture change, not a deployment
  detail.

| Responsibility | Home | Why |
|---|---|---|
| Trigger the dispatcher | n8n | Persistent scheduler while the devcontainer is up; invokes a pass as a local process call. |
| Per-worker supervision | n8n observer execution | Long-lived watching is what executions already do: blocking `Agent run`, INCOMPLETE retry loop, durable Wait-form suspension. |
| Result collection + classification | n8n observer execution | `Parse OpenCode Response` + `BMAD Outcome` already parse and classify; the wrapper preserves their stdout contract. |
| Merge queue | n8n | Sequential, API-driven, retry-on-conflict. Textbook n8n workflow. |
| Question surfacing (forms, ntfy) | n8n | The observer's own Wait-form node; durable across restarts. |
| Graph expansion (plan 2 ahead) | n8n | Triggered when graph is low on ready nodes. Calls a BMAD skill. |
| Sprint status / reporting | n8n | Read state, format, notify. |
| Graph traversal + claim logic | Dispatcher pass (JS) | DAG algorithm with stateful mutations. Needs testing, iteration. |
| Workspace provisioning | Dispatcher pass (JS) | SDK calls + filesystem ops. |
| Agent run + attach in sandbox | Wrapper script (JS) | Spawns or re-attaches to `opencode run` via the Daytona session API; re-emits the local stdout contract; its in-sandbox command ends with the branch push. |
| State writing (journal, graph.json) | Dispatcher pass (JS) | At most one writer at a time — the pass holding the lock. |
| Reconciliation | Dispatcher pass (JS) | Every pass: cross-check journal vs sandboxes vs observer executions; collect, re-attach, destroy. |

Single-writer survives, restated: not "one resident process is the writer" but "at most one
pass holds the lock at a time." Observers never touch canonical state — each records step
events to its own per-run spool file and its final outcome to an inbox directory, and a pass
folds both into the canonical journal and graph. (Today's `Develop Story (Playbook)` appends to
`journal.jsonl` directly from its Journal nodes — safe with one execution at a time, a
collision surface with N concurrent observers; redirecting those appends to the per-run spool
is part of the port.) The event-ingest webhook from the earlier design stays eliminated — it
was solving a concurrent-write problem the architecture itself created by putting n8n in the
canonical data path. Session-history analysis (2026-07-17) confirmed agents already don't
write to pipeline state files in the sequential architecture; the parallel architecture keeps
that by construction.

### Data flow

```
n8n (persistent service on the devcontainer, under pm2)
  │
  ├─ Observer execution per claim (BMAD Session loop + sandbox wrapper):
  │    start agent → relay logs → classify → retry INCOMPLETE → suspend on QUESTION
  │    → on finish: write outcome to inbox, invoke dispatcher
  ├─ Merge queue workflow → invokes dispatcher when a merge lands
  ├─ Question form + ntfy (the observer's own Wait-form node)
  ├─ Schedule tick → invokes dispatcher (safety net)
  └─ Sprint status / reporting
       │  contentless invocations — every payload is already durable on disk
       ▼
Dispatcher pass (same devcontainer, seconds long, one at a time under flock)
  1. Reconcile (journal vs sandboxes vs observer executions)
  2. Fold inbox + spools → journal.jsonl (commit point) → graph.json (derived)
  3. Re-evaluate ready nodes
  4. Claim depth-first → start observer executions
  5. Release lock, exit
       │
       ▼
Daytona sandboxes (one opencode agent each; agent pushes its branch as its last act)
```

When an agent finishes:
1. The agent's in-sandbox wrapper pushes the branch — durability does not depend on any
   supervisor being alive.
2. The observer classifies the outcome, writes it to the inbox (durable), invokes the
   dispatcher, and ends.
3. A pass folds the outcome: journal append, graph mutation, merge-queue trigger on SUCCESS.
   The completion may unblock dependents → new claims → new observer executions.
4. If the outcome is QUESTION: the observer records sandbox ID, session ID, and question to
   its spool, stops the sandbox, and suspends on its Wait-form node — that suspension is the
   parked state. ntfy carries the resume URL; the human's answer resumes the execution, and
   the follow-up wrapper starts the sandbox and resumes the session. No dispatcher round-trip
   is involved in asking or answering.

### Implementation surface

Rough estimate, ~700 lines of JS plus one n8n workflow port:

| Module | Lines | Reuses |
|---|---|---|
| Graph management (CRUD, DAG traversal, claim) | ~250 | New |
| Workspace provisioning (sandbox create, env, cleanup) | ~200 | Patterns from product's SandboxService |
| Sandbox wrapper (run + attach, stdout contract, branch push) | ~120 | Command contract from `BMAD Session (OpenCode)`'s `Agent run` nodes |
| Pass frame (flock, inbox/spool fold, reconcile) | ~150 | `scripts/pipeline/lib.mjs` |
| Observer workflow | n8n port | Copy of `BMAD Session (OpenCode)` with the two `Agent run` commands swapped for the wrapper — classification, INCOMPLETE retry, question form, runner-error capture unchanged |

Gone from the earlier estimate: the ~250-line agent-lifecycle module (spawn/monitor/collect/
classify) — observer executions and the existing classification sub-workflows already do this —
and the n8n signalling module (park/resume is n8n-internal via the Wait-form node).

## State

- `graph.json` in `_bmad-output/pipeline/`, mutated only under the pass lock, with every
  mutation journaled first. Canonical state — `graph.json`, `journal.jsonl`, `ledger.jsonl`,
  `playbook.json`, `runner-errors.jsonl` — has at most one writer at a time: the pass holding
  the lock. Observers write only their own per-run spool and inbox files (including their
  runner-error records, folded the same way); agents write nothing shared. SQLite only if
  concurrent queried reads become a real need; at tens of nodes they are not.
- **Atomic writes required:** `scripts/pipeline/lib.mjs:24` currently uses plain
  `fs.writeFileSync`, which a poller can catch mid-write. Passes must write tmp-file +
  `renameSync` (see Atomicity under Dispatcher); the viewer keeps last-good state on parse
  failure.
- **No in-memory truth.** The devcontainer sleeps and gets rebuilt, so `graph.json` + journal on
  disk must be sufficient to resume from cold. There is no separate startup sweep — every pass
  reconciles, so recovery from sleep or rebuild is the same code path as a normal tick. The
  pipeline needs a resurrection path (devcontainer postStart hook invoking a pass, plus the
  n8n schedule tick).
- Agents pin the playbook version they claimed against; amendments apply only at claim
  boundaries, never mid-flight.

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
   Node stdlib HTTP server in `scripts/pipeline/` serving the page and `graph.json` from one
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
- A pass claims a sandbox from the pool, journals the claim, and starts one observer
  execution. `git fetch && git checkout <base-commit>` to the claim's base.
- The observer's wrapper script spawns `opencode run` inside the sandbox with
  `--dir <sandbox-repo-path>` and a per-run `OPENCODE_DB=<tmp>/opencode.db`, relaying output
  via Daytona's SDK session API (`createSession` + `executeSessionCommand({ runAsync: true })`
  + `getSessionCommandLogs` callbacks) — the pull-based transport model the product already
  uses. The sandbox never calls back to the devcontainer.
- The in-sandbox command ends with a branch push (`git push origin HEAD:pipeline/<runId>/<id>`)
  so the result is durable in git regardless of supervisor liveness.
- The timeout/terminate and runner-error capture logic from `BMAD Session (OpenCode)`'s
  `Agent run` nodes carries over inside the wrapper; on timeout the wrapper must also
  terminate the sandbox session, not just its local relay.

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
| Network to devcontainer | ❌ No path back | Sandboxes can't reach `localhost:5678` (n8n). Not a problem — nothing in the sandbox calls back. The observer's wrapper pulls logs via the Daytona session API from the devcontainer side; the agent's only outbound act is its final git push |
| Custom snapshots | ✅ Declarative Builder | Build from any base image with `apt-get`, `run_commands()`, `dockerfile_commands()`, or `from_dockerfile()`. Pre-bake Node, Yarn, Postgres, Playwright, opencode, and repo deps. Cached for 24h; subsequent runs on the same runner are "almost instantaneous" |
| Network allow-listing | ✅ Runtime-updatable | `domainAllowList` (wildcards, max 20) + `networkAllowList` (CIDR, max 10) + `networkBlockAll`. Updatable on a running sandbox without restart. Essential services (npm, GitHub, Anthropic, Docker, Playwright, Railway, opencode) are pre-allowed on all tiers |
| Warm pool | ❌ Not provided by platform | The platform has no pool/acquire-release abstraction. Pre-built snapshots make cold starts fast (cached 24h), but the dispatcher must build its own pool management |

One real gap: **warm pool mechanism** — the dispatcher must build this. Everything else is
platform-supported.

### Sandbox lifecycle

- On completion (success or failure): destroy the sandbox (or return to pool if warm and clean).
  The agent's in-sandbox wrapper pushes the branch as its last act — completion is durable in
  git even if no supervisor was alive when it happened; git is the persistence layer. No
  worktree to remove, no branch to delete — the sandbox's entire filesystem is ephemeral.
- **Reconcile on every pass:** list sandboxes with the pipeline `scope` label and cross-check
  against the journal and n8n's executions API. A sandbox no entry accounts for is orphaned
  (crash, kill, rebuild mid-run) and gets destroyed; a running sandbox whose observer execution
  died gets a fresh observer attached; a finished one gets collected. The product's
  `cleanup-daytona-sandboxes.ts` is account-wide destructive — the pipeline needs a scoped
  reaper (Epic 8.1 adds one for the product; depend on it or build its own).
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

- When an agent's output classifies as outcome `QUESTION`, the step is **parked**, not failed.
  The parked state is the observer execution itself, suspended on its Wait-form node — the same
  durable suspension questions use today, and it survives n8n restarts. Before suspending, the
  observer records sandbox ID, session ID, and question text to its spool and invokes the
  dispatcher, so the next pass journals status `parked` (a third status — not `success`, not
  `failed` — so trends don't misread a question as a defect).
- The sandbox is stopped while parked: disk and `OPENCODE_DB` survive a Daytona stop, so
  parking costs nothing while the question waits (the human-response window is unbounded — the
  existing no-timeout limitation on questions carries over).
- Other agents are unaffected; nothing finished is discarded or re-run.
- An answer resumes exactly one session: the human submits the observer's form, the execution
  resumes, and the follow-up wrapper starts the sandbox and runs `opencode run --session <id>
  --dir <sandbox-repo-path> "<answer>"` inside it via the Daytona session API. No dispatcher
  round-trip: the dispatcher learns of the park and the resume from the spool, it does not
  mediate them. Agents still never talk to n8n.
- **Decision stands from the previous plan: park/resume is required from the first rollout step,
  no fail-and-retry stopgap.**
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
- Canonical pipeline state (journal, ledger, graph.json, playbook.json) has at most one writer
  at a time — the pass holding the lock. Observers record to per-run spool and inbox files
  that passes fold in; agents write nothing shared. There are no concurrent writers to any
  shared file, and no event can be lost: every payload is durable on disk before any
  dispatcher invocation fires.
- Observer executions are terminated by an n8n restart while blocked in Execute Command
  (Wait-form suspensions survive; blocked commands do not), and the sandbox agent keeps
  running without them. Observer death is therefore routine, and re-attach is ordinary
  reconcile work. n8n's execution concurrency is also the practical cap on parallel workers,
  alongside the Daytona quota.
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
  nothing in the sandbox calls back. Observer wrappers pull logs via the Daytona session API,
  and the agent's only outbound act is its final git push.
- The platform provides no warm-pool abstraction. Pre-built snapshots make cold starts fast
  (cached 24h, near-instant on same runner), but acquire/release/reclaim logic is the
  dispatcher's responsibility.
- The devcontainer sleeps and gets rebuilt. When it sleeps, n8n goes down with it (they are
  co-located) — no schedules fire, no questions can be answered — and observer executions
  blocked in Execute Command die, while their sandboxes keep running (or auto-stop on their
  own intervals), consuming compute and quota with no supervisor. Parked questions survive
  (Wait suspensions are durable) and finished work survives (agents push their own branches).
  Pipeline availability is coupled to this machine's uptime; that is an accepted cost of the
  local-first design, and the standing argument for moving n8n and the pipeline to an
  always-on host if it starts to bite. On wake, the next pass reconciles: collect finished
  sandboxes, re-attach observers to running ones, clean up the rest. This is the same
  reconciliation every pass performs, but across a network boundary with more failure modes
  (sandbox crashed, auto-stopped, auto-archived, quota exhausted while down). It must be
  robust, not best-effort.
- Human attention becomes the scarce resource; the question inbox and near-zero halt rate are
  what keep N agents from turning into N interruptions.

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
3. Build the per-agent machinery: the sandbox wrapper script (run + attach modes, the
   `BMAD Session (OpenCode)` stdout contract, terminal branch push), the observer workflow
   port (a copy of `BMAD Session (OpenCode)` with the two `Agent run` commands swapped for the
   wrapper), sandbox acquire from the warm pool, `git checkout` to the claim's base commit,
   env file copy, park/resume with a synthetic question (including sandbox stop/start around
   the Wait suspension), observer-death re-attach (kill n8n mid-run, verify the next pass
   re-attaches), and conflict-as-evidence journaling. Test against disposable sandboxes with
   synthetic steps before any real BMAD skill run.
4. Add `depends-on` edges to sprint planning output; introduce `graph.json` and the reconcile
   pass with the plan-2-ahead / depth-first policy. First taste of parallelism: two independent
   stories as two concurrent observer executions, each in its own sandbox — no new n8n
   primitives. This is not a stopgap: concurrent n8n executions supervising sandboxed agents
   *is* the permanent supervision design; the dispatcher only adds graph-driven claiming on
   top.
5. Move "done" from workflow-return to branch-merged: merge queue (n8n workflow) + Mermaid
   graph view. Agents push their own branches; the pass that folds a SUCCESS outcome triggers
   n8n's merge queue; no event-ingest webhook — canonical state is written only under the pass
   lock.
6. Upgrade the viewer to `viewer.html` when interactivity earns it.

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
   policies; decide before Path step 3 machinery is built. The observer model sharpens the
   choice: claim-a-story means the observer is the `Develop Story (Playbook)` loop supervising
   a whole chain in one sandbox; claim-a-node means one `BMAD Session` observer per skill run.
3. Merge-queue test scope: full suite per merge, or affected-only (`nx affected`) with a
   periodic full run?
4. Warm pool size: how many sandboxes to keep warm? 5 is the starting estimate, but the actual
   number depends on claim rate, sandbox lifetime, and quota. The pool needs auto-scaling logic
   or a fixed size that's "good enough."
5. Snapshot lifecycle: the custom snapshot needs updating when the repo's dependencies change
   (new packages in `package.json`, new system packages). The Declarative Builder caches for 24h;
   a stale cache means new deps aren't installed. Who triggers a rebuild, and how is snapshot
   freshness tracked against the repo's lockfile?
