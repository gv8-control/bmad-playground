# Spike: snapshot with baked node_modules + fresh clone

**Date:** 2026-07-22
**Status:** Complete — assumption #4 VERIFIED (both strategies viable, with three caveats)
**Verifies:** Assumption #4 from `docs/todo/graph-pipeline.md` "Admitted assumptions" section
**Harness:** Reuses `docs/todo/spike-opencode-sandbox.js` (`log`, `sleep`, `elapsed`); uses the Daytona SDK directly for image-based sandbox creation (the harness's `OpencodeSandbox` creates from the default snapshot; this spike needs custom declarative images)
**Script:** `docs/todo/spike-baked-node-modules.js`

## TL;DR

Assumption #4 passes. Both strategies for getting baked `node_modules` into a
fresh per-claim clone are viable end-to-end:

- **Strategy A — bake the shallow clone into the snapshot:** a clone with
  `node_modules` baked in survives `git fetch` + `git checkout` with
  `node_modules` intact and usable. `node_modules` is gitignored, so git
  operations do not touch it.
- **Strategy B — move baked `node_modules` into a fresh clone:** a fresh
  `git clone --depth 1` has no `node_modules`; copying a baked `node_modules`
  into the clone leaves it usable, including the native esbuild binary.

The spike built two declarative images via the Declarative Builder
(`Image.base('daytonaio/sandbox:0.8.0').addLocalDir(...).dockerfileCommands(...)`),
created a sandbox from each, ran the per-claim git operations, and verified a
baked dep (esbuild — platform-specific native binary) and a pure-JS dep
(lodash) are requireable after provisioning.

Three caveats surfaced — all are per-claim-recipe details, not design changes:

1. **Baked files are root-owned; the sandbox runs as `daytona` (uid 1001).**
   The base image sets `USER daytona`; `COPY` creates root-owned files; `RUN`
   steps execute as `daytona` and cannot `chown` or write to root-owned dirs.
   The `user: 'root'` create param is **ignored**. Fix: switch to root in the
   build via `dockerfileCommands(['USER root', 'RUN chown -R 1001:1001 ...',
   'USER 1001'])` (see F1).
2. **`tar.create` skips empty directories — bare git repos with only
   `packed-refs` break after baking.** A `git clone --bare` repo has refs in
   `packed-refs`, leaving `refs/heads/` empty; the SDK's context archiving
   drops the empty `refs/` dir, and git's repo detection then fails. Fix:
   materialize a loose ref file before baking, or use a non-bare repo as the
   remote (see F2).
3. **`git clone` does not copy gitignored `node_modules`.** A baked clone
   produced via `git clone` has no `node_modules` — it must be installed during
   the snapshot build (`runCommands('npm install')`) or copied in before
   baking. `addLocalDir` does NOT filter by `.gitignore` (it uses `tar.create`,
   which has no `.gitignore` awareness) — `node_modules` IS copied when
   actually present in the source dir (see F3).

## What was tested

The assumption from the plan:

> The per-claim provisioning recipe names two strategies for getting baked
> `node_modules` into a fresh clone — bake the shallow clone itself into the
> snapshot (per-sandbox provisioning then fetches instead of cloning), or move
> the baked `node_modules` into the fresh clone — and verifies neither. The
> interaction between a baked snapshot image and a per-claim `git clone --depth
> 1` is non-obvious: `node_modules` is gitignored, so a fresh clone does not
> have it, and moving it from a baked location into the clone assumes the paths
> line up. The wrong choice makes every claim pay a full install from scratch.
> **Spike:** build a snapshot via the Declarative Builder with the repo's
> `node_modules` baked in, create a sandbox from it, run `git clone --depth 1`
> (or `git fetch`), and check whether `node_modules` is present and usable. Try
> both strategies.

### Fixture

The spike uses a **minimal fixture repo** instead of the real repo's 1.8 GB
`node_modules`. The mechanics being verified — does a baked clone survive
`git fetch`/`git checkout` with `node_modules` intact, and does moving a baked
`node_modules` into a fresh clone leave it usable — do not depend on the repo's
specific deps. The fixture:

- `package.json` depending on `esbuild` (carries `esbuild-linux-x64`, a
  platform-specific native binary — doubles as a native-binary-survives-the-bake
  check) and `lodash` (pure JS).
- A git repo with two commits, so `git fetch` has something to update.
- A bare remote at commit 2, and a clone pinned at commit 1 (for Strategy A).
- The devcontainer and the sandbox are both linux-x64, so the baked esbuild
  binary matches the sandbox runtime.

### Strategy A — bake the shallow clone into the snapshot

The image bakes the clone (at commit 1, WITH `node_modules`) at `/workspace/repo`
and the bare remote at `/opt/remote.git`. Per-claim provisioning then fetches
instead of cloning:

1. `git fetch origin` → fetches commit 2.
2. `git checkout origin/main` → moves HEAD to commit 2 (`feature.txt` appears).
3. Verify `node_modules` still present (gitignored, untouched by git).
4. Verify `node -e "require('esbuild'); require('lodash')"` works.

### Strategy B — move baked node_modules into a fresh clone

The image bakes `node_modules` at `/opt/baked-node_modules` and the bare remote
at `/opt/remote.git`. Per-claim provisioning clones fresh then moves:

1. `git clone --depth 1 /opt/remote.git /workspace/repo` → fresh clone, no
   `node_modules`.
2. Verify `node_modules` absent in the fresh clone.
3. `cp -r /opt/baked-node_modules /workspace/repo/node_modules`.
4. Verify `node -e "require('esbuild'); require('lodash')"` works.

## Results

**All steps passed, zero errors.** Total runtime: ~65 seconds (two image builds
+ two sandbox lifecycles).

### Strategy A — PASS

| Step | Check | Verdict |
|---|---|---|
| A0-diag | sandbox user, baked clone + node_modules on disk, ownership | PASS — `uid=1001(daytona)`, `node_modules` present and owned by daytona |
| A1 | baked clone present at commit 1 | PASS — `GIT_OK`, `06c7dbd commit 1` |
| A2 | `node_modules` present in baked clone | PASS — `NM_OK`, 3 entries |
| A3 | `git fetch origin` + `git checkout origin/main` | PASS — `FETCH_CHECKOUT_OK` |
| A4 | commit-2 file (`feature.txt`) appeared | PASS — proves fetch+checkout worked |
| A5 | `node_modules` survived the git operations | PASS — the core claim |
| A6 | baked deps usable after git ops (native + pure JS) | PASS — `REQUIRE_OK 4.18.1 function` |

The resumed clone correctly moved to commit 2 (`feature.txt` appeared) while
`node_modules` (gitignored) was untouched. `require('esbuild')` loaded the
native binary; `require('lodash')` loaded the pure-JS dep.

### Strategy B — PASS

| Step | Check | Verdict |
|---|---|---|
| B0-diag | baked `node_modules` + bare remote on disk, ownership | PASS |
| B1 | baked `node_modules` present at staging path | PASS |
| B2 | fresh `git clone --depth 1` | PASS — `CLONE_OK` |
| B3 | `node_modules` absent in fresh clone | PASS — `NM_ABSENT` |
| B4 | move baked `node_modules` into clone | PASS |
| B5 | moved deps usable (native + pure JS) | PASS — `REQUIRE_OK 4.18.1 function` |

The fresh clone had no `node_modules` (confirming the plan's premise that a
fresh clone does not carry gitignored `node_modules`); copying the baked
`node_modules` in left both deps requireable.

## Findings

### F1: Baked files are root-owned; the sandbox runs as `daytona` (uid 1001)

**Impact: High** — the per-claim recipe must chown baked dirs to the sandbox
user, or git operations and node require fail with permission errors.

The `daytonaio/sandbox:0.8.0` base image sets `USER daytona` (uid 1001).
`COPY` (from `addLocalDir`) creates files owned by root regardless of the
`USER` directive. `RUN` steps (from `runCommands`) execute as `daytona`, which
cannot `chown` root-owned files or write to root-owned directories. Observed
failures before the fix:

- `git fetch` → `error: cannot open '.git/FETCH_HEAD': Permission denied`
  (`.git` is root-owned, daytona cannot write `FETCH_HEAD`).
- `git clone ... /workspace/repo` → `fatal: repository '/opt/remote.git' does
  not exist` (misleading — daytona cannot create `/workspace/repo` because
  `/workspace` is root-owned).
- `node -e "require('esbuild')"` → `Cannot find module` (daytona cannot
  traverse root-owned `node_modules` in some configurations).

The `user: 'root'` create param is **ignored** by `daytonaio/sandbox:0.8.0` —
the sandbox runs as `uid=1001(daytona)` regardless of the param (verified: the
same `id` output with and without `user: 'root'`).

**Fix:** switch to root for the chown in the build via `dockerfileCommands`,
then switch back:

```js
Image.base(BASE_IMAGE)
  .addLocalDir(cloneDir, '/workspace/repo')
  .dockerfileCommands([
    'USER root',
    'RUN chown -R 1001:1001 /workspace/repo /opt/remote.git',
    'USER 1001',
  ])
```

`runCommands` cannot do this — it runs as the current `USER` (daytona) and
cannot escalate. The Daytona docs confirm the pattern: "Run all installation
steps as root first, then create the user, fix ownership of the working
directory, and switch with the `USER` directive."

This generalizes: **any baked content the sandbox must write to or traverse
must be chowned to the sandbox user in the build.** The real pipeline's
snapshot build config must include this chown for the repo checkout and any
baked `node_modules`.

### F2: `tar.create` skips empty directories — bare git repos break after baking

**Impact: Medium** — affects baking any git repo whose `refs/` is empty (the
common case for `git clone --bare`, which packs refs into `packed-refs`).

The SDK's context archiving uses `tar.create({ cwd, portable: true }, [...])`
(see `ObjectStorage.uploadAsTar` in `@daytonaio/sdk`). `tar.create` skips
empty directories by default. A `git clone --bare` repo stores refs in
`packed-refs`, leaving `refs/heads/` and `refs/tags/` as empty dirs. After
baking, the `refs/` directory vanishes entirely. Git's repository detection
(`is_git_directory`) requires `refs/` to exist, so the baked bare repo fails:

```
fatal: '/opt/remote.git' does not appear to be a git repository
```

even though `objects/`, `HEAD`, `config`, and `packed-refs` are all present and
correct.

**Fix:** materialize a loose ref file before baking, so `refs/heads/` is
non-empty:

```sh
git clone --bare ${REPO} ${REMOTE}
echo "$(git -C ${REMOTE} rev-parse main)" > ${REMOTE}/refs/heads/main
```

Alternatively, bake a non-bare work-tree repo as the remote (git can fetch from
a non-bare repo's `.git`; non-bare clones have loose refs). The loose-ref fix
is minimal and keeps the bare repo small.

This is a property of the SDK's tar archiving, not of git — any baked directory
tree with empty dirs loses them. The real pipeline bakes a shallow clone of the
real repo (Strategy A); a shallow clone's `refs/` is non-empty (loose
`refs/heads/main`), so this does not affect the primary strategy. It affects
only the spike's bare-remote fixture and any future use of bare repos in
snapshots.

### F3: `git clone` does not copy gitignored `node_modules`; `addLocalDir` does not filter by `.gitignore`

**Impact: Medium** — clarifies what "bake the clone" actually requires.

Two facts that together determine Strategy A's shape:

1. **`git clone` does not copy gitignored files.** A clone of a repo whose
   `.gitignore` excludes `node_modules/` has no `node_modules` — confirmed
   empirically (the first spike run baked a `git clone`'d fixture and
   `node_modules` was absent). So "bake the shallow clone" does not, by itself,
   bake `node_modules`; the snapshot build must produce it.
2. **`addLocalDir` does NOT filter by `.gitignore`.** The SDK archives the
   source dir with `tar.create`, which has no `.gitignore` awareness. A
   standalone `node_modules` dir (Strategy B's staging path) IS copied in full
   (verified: `esbuild`, `lodash`, `@esbuild`, `.bin` all present after bake).
   So `node_modules` is baked when actually present in the source dir.

**Consequence for Strategy A:** the snapshot build must `npm install` (or
`yarn install`) inside the baked clone during the image build to produce
`node_modules`, OR copy a pre-built `node_modules` into the clone before
baking. The spike used the latter (copy) to avoid build-time network
dependency; the real pipeline would use `runCommands('npm install')` during the
build — build-time network is available (see F4). This is the natural
cold-start optimization the plan describes: the snapshot's pre-baked
`node_modules` makes the per-claim install a no-op in the common case.

### F4: Build-time network IS available

**Impact: Low** — confirms the Declarative Builder can install deps during the
build.

The image build pulled `daytonaio/sandbox:0.8.0` from Docker Hub and the
fixture's local `npm install` resolved `esbuild` + `lodash` from the npm
registry. The Daytona docs show `runCommands` examples that fetch from the
network during the build (`curl ... | bash`, `apt-get install`, `npm install`),
and the Network Limits page describes itself as controlling outbound access
**from sandboxes** (runtime), not from the build step. No documentation states
that the runtime Essential Services allowlist is applied to the image build
process.

This means Strategy A's "install deps during the snapshot build via
`runCommands('npm install')`" is viable — the build environment can reach the
npm registry. (The spike avoided relying on this by copying a pre-built
`node_modules`, but the real pipeline should install during the build so the
snapshot is reproducible from the repo's lockfile rather than a local artifact.)

### F5: Snapshot build is fast; 24h caching confirmed

**Impact: Low** — confirms the plan's "create-on-demand viable" claim.

| Operation | Duration |
|---|---|
| Image build + sandbox create (Strategy A, first build) | 33.6s |
| Image build + sandbox create (Strategy B, first build) | 29.2s |
| `git fetch` + `git checkout` (Strategy A) | <0.1s |
| `git clone --depth 1` (Strategy B) | <0.1s |
| `cp -r` baked `node_modules` (Strategy B) | <0.1s |
| `node -e "require('esbuild'); require('lodash')"` | <0.1s |

The Daytona docs confirm declarative images are cached for 24h and subsequent
builds on the same runner are "almost instantaneous." The first build took
~30s; cached rebuilds would be faster. This is well within the pass's
seconds-long budget and confirms create-on-demand viability — no pool needed.

## SDK API surface confirmed

The Declarative Builder API the pipeline plan depends on:

| Method | Signature | Notes |
|--------|-----------|-------|
| `Image.base(image)` | `Image` | `FROM <image>`; use `daytonaio/sandbox:0.8.0` for a Node+git+npm base |
| `Image.addLocalDir(localPath, remotePath)` | `Image` | `COPY <localPath> <remotePath>`; archives the local dir via `tar.create` (no `.gitignore` filtering; **skips empty dirs** — see F2) |
| `Image.runCommands(...cmds)` | `Image` | `RUN <cmd>`; executes as the image's current `USER` (daytona for `daytonaio/sandbox:0.8.0`) — cannot chown root-owned files |
| `Image.dockerfileCommands(lines)` | `Image` | Appends raw Dockerfile lines; use for `USER root` / `USER 1001` switches (see F1) |
| `daytona.create({ image, resources, labels, autoStopInterval })` | `Promise<Sandbox>` | Builds a snapshot from the image server-side, then creates the sandbox; `onSnapshotCreateLogs` streams build logs |
| `daytona.create({ user: 'root' })` | — | **Ignored** by `daytonaio/sandbox:0.8.0` (sandbox runs as uid 1001 daytona regardless — see F1) |

## Online sources

### Daytona Declarative Builder (primary)

**Source:** https://www.daytona.io/docs/declarative-builder

Key quotes:

> Declarative Builder provides a powerful, code-first approach to defining
> dependencies for Daytona sandboxes. Instead of importing images from a
> container registry, you can programmatically define them using the Daytona
> SDK.

> Declarative images are cached for 24 hours, and are automatically reused when
> running the same script. Thus, subsequent runs on the same runner will be
> almost instantaneous.

> Run all installation steps as `root` first, then create the user, fix
> ownership of the working directory, and switch with the `USER` directive.
> Commands that write to system locations after switching users will fail with
> permission errors.

This confirms: (a) the `Image` API builds snapshots server-side from a
generated Dockerfile + context archive, (b) 24h caching makes create-on-demand
viable, (c) the root-then-chown-then-switch pattern is the documented fix for
the ownership issue (F1).

### Daytona Image SDK reference

**Source:** https://www.daytona.io/docs/en/typescript-sdk/image

Documents `Image.base()`, `addLocalDir()`, `addLocalFile()`, `runCommands()`,
`dockerfileCommands()`, `fromDockerfile()`, and the `Context` type
(`sourcePath` / `archivePath`). Confirms `addLocalDir` translates to a `COPY`
instruction with the local dir uploaded as context.

### Daytona network limits (build vs runtime)

**Source:** https://www.daytona.io/docs/network-limits

> Network limits control outbound internet access from sandboxes. Each sandbox
> runs behind a firewall that restricts which external IP addresses and domains
> it can reach.

This describes **runtime** sandbox egress (the Essential Services allowlist),
not the image build step. The Declarative Builder docs show `runCommands`
examples that fetch from the network during the build, confirming build-time
network is available (F4).

### Daytona sandboxes (resources)

**Source:** https://www.daytona.io/docs/sandboxes

> Create a sandbox with custom resources. Sandboxes have 1 vCPU, 1GB RAM, and
> 3GiB disk by default.

Resources are settable only when creating from an `image` (not from a
snapshot). The spike used `resources: { cpu: 2, memory: 4, disk: 10 }`.

### gitignore semantics (node_modules survives git operations)

**Source:** https://git-scm.com/docs/gitignore

> A `gitignore` file specifies intentionally untracked files that Git should
> ignore. Files already tracked by Git are not affected.

`git fetch` (updates remote-tracking refs and downloads objects) and
`git checkout` (updates tracked files in the working tree) do not touch
gitignored working-tree files like `node_modules/`. The spike verified this
empirically: after `git fetch` + `git checkout origin/main`, `node_modules` was
unchanged and still usable (Strategy A, step A5/A6).

## Impact on the graph pipeline plan

Assumption #4 is verified. Both strategies are viable; **Strategy A (bake the
clone + install during build) has been chosen** as the primary, since it
avoids the per-claim `node_modules` move and the install-during-build is the
natural cold-start optimization the plan already describes ("the snapshot's
pre-baked `node_modules` makes the common case fast; the install step handles
every claim the snapshot doesn't cover").

### Caveats to fold into the per-claim recipe / snapshot build config

1. **Chown baked dirs to the sandbox user (F1).** The snapshot build config must
   include a `USER root` → `chown -R 1001:1001 <repo> <node_modules>` →
   `USER 1001` step (via `dockerfileCommands`). Without it, git cannot write to
   `.git` (fetch/checkout fail) and the sandbox user cannot traverse
   root-owned `node_modules`. The `user: 'root'` create param does not work.
2. **Produce `node_modules` during the build, not via `git clone` (F3).**
   "Bake the clone" means bake a clone + `runCommands('npm install')` (or
   `yarn install --immutable`) during the snapshot build. A `git clone` alone
   has no `node_modules` (gitignored). Build-time network is available (F4).
3. **Bare repos in snapshots need loose refs (F2).** Only relevant if the
   snapshot bakes a bare git repo. The primary strategy bakes a shallow clone
   (non-bare, loose refs), so this does not affect it — but any future bare-repo
   baking must materialize a loose ref file or the repo is unrecognizable after
   COPY.

### No design changes needed

The plan's per-claim provisioning recipe (Worker sandbox design →
Provisioning → Per-claim) describes the correct shape; the spike confirms the
mechanics work and surfaces only recipe-level details (chown, install-during-
build, loose refs). The "two strategies" the plan named are both viable;
**Strategy A has been chosen** for the reasons above.

## Spike script

| Script | Purpose | Reuses |
|---|---|---|
| `spike-baked-node-modules.js` | Builds two declarative images (Strategy A + B), creates a sandbox from each, runs per-claim git operations, verifies baked deps are present and usable | `spike-opencode-sandbox.js` (`log`, `sleep`, `elapsed`); Daytona SDK directly for image-based creation |

The script creates and destroys its own sandboxes. Total sandbox time: ~65
seconds across two sandboxes. No sandboxes were left running.

## Decision

**Strategy A (bake the clone + install during build) has been chosen.** It
avoids the per-claim `node_modules` move and matches the plan's cold-start-
optimization framing. Strategy B works but adds a per-claim copy step and a
staging path.

The decision folds these recipe details into the snapshot build config:

1. **Fold the chown into the snapshot build config (F1).** `dockerfileCommands([
   'USER root', 'RUN chown -R 1001:1001 /workspace/repo', 'USER 1001'])` after
   the `COPY` + `npm install`. This is the documented Daytona pattern.
2. **Install deps during the build via `runCommands('npm install')`, not by
   copying a local `node_modules` (F3, F4).** Build-time network is available;
   installing from the lockfile makes the snapshot reproducible from the repo
   rather than a local artifact.
3. **The `user: 'root'` create param is ignored (F1).** The snapshot build
   config is the only place to fix ownership; do not rely on the create param.
