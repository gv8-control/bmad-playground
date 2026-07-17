# Plan: dependency-graph pipeline with parallel opencode agents

Status: draft vision, not started. Written 2026-07-17, updated same day to make Daytona sandboxes
the primary worker tier (was: local worktrees as first tier, sandboxes as graduation). Supersedes
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
- **A dispatcher, not a loop.** A script/daemon claims ready work and launches one opencode agent
  per claim in a Daytona sandbox from a warm pool. Machine-level isolation eliminates the collision
  surfaces that same-machine concurrency creates (discovered in session-history analysis,
  2026-07-17): cross-process homicide (`pkill -f` can't cross machine boundaries), fixed port
  binding (each sandbox has its own port space), shared test databases (each sandbox runs its own
  Postgres), and shared-file corruption (`sprint-status.yaml`, `deferred-work.md` are
  per-sandbox). The opencode identity-collision risk is also removed — separate machine, separate
  storage. Epic 6 built sandbox provisioning for the product; the pipeline copies the discipline
  patterns, not the code.
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
  them and pushes per-sandbox at provision time.
- Apply `domainAllowList` for egress control. The essential services allowlist already covers
  GitHub, npm, Anthropic, opencode, Playwright, Railway, and Docker registries — start with
  `networkBlockAll: false` (default) and tighten to an explicit allowlist when the pipeline is
  stable. Updatable at runtime without restart.

**Per-claim (fast, from warm pool):**
- Claim a sandbox from the pool. `git fetch && git checkout <base-commit>` to the claim's base.
- Spawn `opencode run` inside the sandbox with `--dir <sandbox-repo-path>` and a per-run
  `OPENCODE_DB=<tmp>/opencode.db`. The dispatcher streams output via Daytona's SDK session API
  (`createSession` + `executeSessionCommand({ runAsync: true })` + `getSessionCommandLogs`
  callbacks) — the pull-based transport model the product already uses. The sandbox never calls
  back to the dispatcher.
- Reuse the timeout/terminate wrapper and `runner-errors.jsonl` capture logic from
  `BMAD Session (OpenCode)`'s `Agent run` nodes.

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
| Network to devcontainer | ❌ No path back | Sandboxes can't reach `localhost:5678` (n8n). Aligned with the architecture — the event-ingest webhook is the channel, not direct MCP. Linked sandboxes (parent-child) have bidirectional networking if the dispatcher itself ran as a sandbox, but that's a design choice, not a requirement |
| Custom snapshots | ✅ Declarative Builder | Build from any base image with `apt-get`, `run_commands()`, `dockerfile_commands()`, or `from_dockerfile()`. Pre-bake Node, Yarn, Postgres, Playwright, opencode, and repo deps. Cached for 24h; subsequent runs on the same runner are "almost instantaneous" |
| Network allow-listing | ✅ Runtime-updatable | `domainAllowList` (wildcards, max 20) + `networkAllowList` (CIDR, max 10) + `networkBlockAll`. Updatable on a running sandbox without restart. Essential services (npm, GitHub, Anthropic, Docker, Playwright, Railway, opencode) are pre-allowed on all tiers |
| Warm pool | ❌ Not provided by platform | The platform has no pool/acquire-release abstraction. Pre-built snapshots make cold starts fast (cached 24h), but the dispatcher must build its own pool management |

One real gap: **warm pool mechanism** — the dispatcher must build this. Everything else is
platform-supported.

### Sandbox lifecycle

- On completion (success or failure): destroy the sandbox (or return to pool if warm and clean).
  The agent's branch is pushed before destruction; git is the persistence layer. No worktree to
  remove, no branch to delete — the sandbox's entire filesystem is ephemeral.
- **Startup sweep:** on dispatcher boot, list sandboxes with the pipeline `scope` label and
  cross-check against the journal; any sandbox with no matching parked or in-flight entry is
  orphaned (crash, kill, rebuild mid-run) and gets destroyed. The product's
  `cleanup-daytona-sandboxes.ts` is account-wide destructive — the pipeline needs a scoped
  reaper (Epic 8.1 adds one for the product; depend on it or build its own).
- **Quota management:** the Daytona account has a 30 GiB shared disk quota across all
  environments. Shallow clones (`--depth 1`) reduce per-sandbox disk. The dispatcher must track
  disk usage and enforce a budget. Label every sandbox with `scope: pipeline` and a `runId` —
  the product's lack of scoping is a known problem the pipeline must not reproduce.
- **Credential isolation:** inject only the minimum secrets as env vars (`ANTHROPIC_API_KEY`,
  `GITHUB_TOKEN`, `NEURALWATT_API_KEY`). Never `DATABASE_URL`, `AUTH_SECRET`,
  `CREDENTIAL_ENCRYPTION_KEK` — those are platform-internal and must not reach the sandbox.
  Copy the product's discipline here exactly.

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

- When an agent's output classifies as outcome `QUESTION`, the step is **parked**, not failed:
  record sandbox ID, session ID, and question text; journal status `parked` (a third status —
  not `success`, not `failed` — so trends don't misread a question as a defect).
- Other agents are unaffected; nothing finished is discarded or re-run.
- An answer resumes exactly one session: `opencode run --session <id> --dir <sandbox-repo-path>
  "<answer>"`, executed inside the parked sandbox via the Daytona SDK session API. The
  surfacing/answering plumbing is an n8n form (ntfy-notified) whose submission re-invokes the
  dispatcher in resume mode for that one agent — this becomes the question inbox for N agents.
- **Decision stands from the previous plan: park/resume is required from the first rollout step,
  no fail-and-retry stopgap.** A parked sandbox lives until answered (inherits the existing
  no-timeout limitation on human questions); it is the only sandbox allowed to outlive its run
  and stay warm in the pool.
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
- 5 concurrent sandboxes consume Daytona account quota (30 GiB shared disk) and API rate limits.
  Shallow clones and scoped cleanup keep this bounded. The 30 GiB is shared across
  dev/test/prod — the pipeline must label and scope its sandboxes or reproduce the product's
  quota-exhaustion problem.
- Docker is available in sandboxes (own kernel, sudo, installable via `get.docker.com` or
  pre-baked into a custom snapshot), but the pipeline doesn't need it — session history (88
  sessions) shows agents use `gh` CLI and `curl` for GitHub operations, not Docker-based MCP.
  MCP tool calls were not recorded in any session; the pipeline does not depend on Docker-based
  MCP.
- Sandboxes can't reach the devcontainer's localhost services (n8n on :5678). The event-ingest
  webhook is the communication channel — this aligns with the architecture, not a workaround.
- The platform provides no warm-pool abstraction. Pre-built snapshots make cold starts fast
  (cached 24h, near-instant on same runner), but acquire/release/reclaim logic is the
  dispatcher's responsibility.
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
3. Build the per-agent machinery: sandbox acquire from the warm pool, `git checkout` to the
   claim's base commit, env file copy, park/resume with a synthetic question, conflict-as-evidence
   journaling. Test against disposable sandboxes with synthetic steps before any real BMAD skill run.
4. Add `depends-on` edges to sprint planning output; introduce `graph.json` and the dispatcher
   with the plan-2-ahead / depth-first policy. First taste of parallelism: two independent
   stories as two concurrent n8n executions of the existing `Develop Story (Playbook)` workflow,
   each in its own sandbox — no new n8n primitives.
5. Move "done" from workflow-return to branch-merged: merge queue + event-ingest webhook +
   Mermaid graph view.
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
   policies; decide before Path step 3 machinery is built.
3. Merge-queue test scope: full suite per merge, or affected-only (`nx affected`) with a
   periodic full run?
4. Warm pool size: how many sandboxes to keep warm? 5 is the starting estimate, but the actual
   number depends on claim rate, sandbox lifetime, and quota. The pool needs auto-scaling logic
   or a fixed size that's "good enough."
5. Snapshot lifecycle: the custom snapshot needs updating when the repo's dependencies change
   (new packages in `package.json`, new system packages). The Declarative Builder caches for 24h;
   a stale cache means new deps aren't installed. Who triggers a rebuild, and how is snapshot
   freshness tracked against the repo's lockfile?
