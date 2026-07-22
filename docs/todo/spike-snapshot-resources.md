# Spike: do Daytona snapshots honor `resources` params?

**Date:** 2026-07-22
**Status:** Complete — prescription VERIFIED (snapshot path rejects resources; image path honors all three)
**Verifies:** The claim in `docs/todo/graph-pipeline.md` (Worker sandbox design → Provisioning): "Create from image, not snapshot, to control resources — snapshots ignore resource params."
**Harness:** Reuses `docs/todo/spike-opencode-sandbox.js` (`log`, `sleep`, `elapsed`); uses the Daytona SDK directly for both create paths.
**Scripts:** `docs/todo/spike-snapshot-resources.js` (both paths), `docs/todo/spike-snapshot-resources-cgroup.js` (cgroup-level follow-up)

## TL;DR

The plan's prescription — "create from image, not snapshot, to control
resources" — is **correct**, but for a stronger reason than the docs imply.
The snapshot path does not silently ignore `resources`; it **rejects the
create call with a hard API error**. The image path **honors all three
resources** (cpu, memory, disk), but cpu and memory are enforced at the
cgroup-v2 level and are **not visible to `nproc` / `free`** (which report
host-level values) — only disk shows up in `df`. Verifying allocation requires
reading cgroup files, not the usual Unix tools.

| Path | Create with `resources` | CPU | Memory | Disk |
|---|---|---|---|---|
| Named snapshot (`daytona-small`) | ❌ **API error:** "Cannot specify Sandbox resources when using a snapshot" | n/a | n/a | n/a |
| Declarative image (`Image.base`) | ✅ Accepted | ✅ Honored (cgroup v2 `cpu.max` = 4 cores) | ✅ Honored (cgroup v2 `memory.max` = 8 GiB) | ✅ Honored (overlay 10G) |

**One-paragraph verdict:** "Create from image, not snapshot" is the correct
prescription — and stronger than "snapshots ignore resource params" suggests.
The snapshot path does not ignore `resources`, it **rejects the create call
with an explicit API error** ("Cannot specify Sandbox resources when using a
snapshot"), so a caller that passes `resources` alongside `snapshot` gets no
sandbox at all, not a default-sized one. The image path accepts `resources`
and honors all three: disk as a 10G overlay (visible in `df`), cpu and memory
as cgroup-v2 quotas (`cpu.max` = `400000 100000` → 4 cores; `memory.max` =
`8589934592` → 8 GiB) that `nproc` and `free -m` do not reflect (they report
host-level 48 cores / 189 GiB). The pipeline must create from image to control
resources; there is no snapshot-with-resources shortcut. A secondary finding:
the dispatcher's reconcile/health checks should not use `nproc` or `free` to
verify a sandbox's allocation — read `/sys/fs/cgroup/cpu.max` and
`/sys/fs/cgroup/memory.max` instead.

## What was tested

The claim from the plan:

> Create sandboxes from the custom snapshot with explicit resources:
> `resources: { cpu: 4, memory: 8, disk: 10 }` (the platform max). Create from
> image, not snapshot, to control resources — snapshots ignore resource params.

Two paths, identical `resources: { cpu: 4, memory: 8, disk: 10 }` (the org
max, for maximal contrast with defaults):

1. **Named snapshot** — `daytona.create({ snapshot: 'daytona-small', resources: {...} })`.
   `daytona-small` is a default named snapshot with defaults 1 vCPU / 1 GiB / 3
   GiB. Default and custom named snapshots share the same create API path, so
   this tests the behavior for any named snapshot.
2. **Declarative image** — `daytona.create({ image: Image.base('daytonaio/sandbox:0.8.0'), resources: {...} })`.
   The path the plan prescribes; the control.

For each: confirm the create call succeeds (no API error), then measure actual
allocation inside the sandbox. Initial measurement used `nproc`, `free -m`,
`df -h /`; a cgroup-level follow-up was needed because cpu/memory did not
show up in the Unix tools (see F2).

### SDK note (why the snapshot path was testable at all)

The SDK's TypeScript types omit `resources` from `CreateSandboxFromSnapshotParams`
(it is a field on `CreateSandboxFromImageParams` only), which would suggest
the SDK strips `resources` for the snapshot path. It does not: the runtime
`Daytona.create` checks `if ('resources' in params)` **independently** of the
snapshot/image branch and forwards `cpu/memory/disk` to the API in both cases.
So the open question was purely about API behavior — does the API honor,
silently ignore, or reject `resources` when `snapshot` is set? The spike ran
as plain JS (no type-check), so the SDK forwarded the params and the API
answered.

## Results

### Path 1 — named snapshot with resources: FAIL (API rejects)

```
daytona.create({ snapshot: 'daytona-small', resources: { cpu: 4, memory: 8, disk: 10 } })
→ Error: "Cannot specify Sandbox resources when using a snapshot" (1.3s)
```

The create call was **rejected** by the API with an explicit error. No sandbox
was created. This is stronger than "ignored" — the caller gets nothing, not a
default-sized sandbox. The SDK forwarded `resources` (it does not strip them
for the snapshot branch), and the API enforced the mutual exclusivity.

### Path 2 — declarative image with resources: PASS (all three honored)

Create succeeded in 35.5s (first build; cached rebuilds are near-instant per
the docs and prior spikes). Measurement:

| Resource | Requested | `nproc` / `free` / `df` | cgroup v2 | Honored? |
|---|---|---|---|---|
| CPU | 4 | `nproc` = 48 (host) | `cpu.max` = `400000 100000` → 4 cores | ✅ |
| Memory | 8 GiB | `free -m` total = 193206 (host, ~189 GiB) | `memory.max` = `8589934592` → 8 GiB | ✅ |
| Disk | 10 GiB | `df -h /` overlay = 10G | (filesystem) | ✅ |

All three resources are honored on the image path. Disk is visible in `df`;
cpu and memory are enforced as cgroup-v2 quotas at the root cgroup, **not**
visible to `nproc` or `free -m` (see F2).

## Findings

### F1: The snapshot path REJECTS `resources` — a hard API error, not silent ignore

**Impact: High** — confirms the plan's prescription is load-bearing. A caller
that passes `resources` alongside `snapshot` gets no sandbox at all.

The API returns an explicit error: "Cannot specify Sandbox resources when
using a snapshot". The SDK runtime forwards `resources` in both branches (the
`if ('resources' in params)` check is independent of the snapshot/image
branch in `Daytona.create`), so the API — not the SDK — enforces the mutual
exclusivity. The Daytona docs show `resources` only on the image create path
and the SDK types omit it from `CreateSandboxFromSnapshotParams`, both
consistent with this being an API-level constraint.

This means the pipeline's per-claim recipe **must** use the image path
(`daytona.create({ image, resources })`) to control resources. There is no
"create from a named snapshot with resources" shortcut — the build-once-via-
Declarative-Builder, create-from-image-each-claim shape the plan already
describes is the only shape that works. The plan's wording ("snapshots ignore
resource params") understates it: the API rejects, not ignores.

### F2: `nproc` and `free -m` do NOT reflect cgroup-limited cpu/memory — read cgroup files instead

**Impact: Medium** — any dispatcher reconcile/health check that verifies a
sandbox's allocation must not use `nproc` or `free`.

On the image-path sandbox (created with `cpu: 4, memory: 8`), `nproc`
reported **48** (host cores) and `free -m` reported **193206 MiB** (~189 GiB,
host memory) — neither reflects the requested 4 cores / 8 GiB. The cgroup-v2
probe confirmed the limits **are** enforced:

- `/sys/fs/cgroup/cpu.max` → `400000 100000` (quota 400000 / period 100000 = **4 cores**)
- `/sys/fs/cgroup/memory.max` → `8589934592` bytes (= **8 GiB** exactly)
- `/sys/fs/cgroup/` is `cgroup2fs` (cgroup v2 unified hierarchy)
- `/proc/self/cgroup` → `0::/init.scope` (the process lives in a child of the root; the root's quotas bound it)

This is the standard container-measurement quirk: `nproc` reads the number of
processors from `/sys/devices/system/cpu/online` (host-level, not cgroup-
limited), and `free` reads `/proc/meminfo` (host-level). Cgroup v2 cpu/memory
quotas are enforced by the kernel scheduler / OOM killer, not by hiding CPUs
or shrinking the reported memory. Disk, by contrast, is a filesystem
(overlay) size and shows correctly in `df`.

**Practical consequence for the pipeline:** if the dispatcher ever needs to
verify a sandbox's actual allocation (e.g. a health check that a sandbox was
provisioned with the requested resources before launching an agent), it must
read `/sys/fs/cgroup/cpu.max` and `/sys/fs/cgroup/memory.max`, not `nproc` /
`free`. The per-claim recipe does not currently do such a check (it trusts the
create call), so this is informational — but it would bite any future
allocation-verification logic that used the obvious Unix tools.

### F3: Disk is honored and visible in `df` on the image path

**Impact: Low** — confirms the disk resource works as expected.

`df -h /` showed `overlay 10G` on the image-path sandbox, matching the
requested `disk: 10`. Disk is a filesystem size, so it is visible to standard
tools (unlike cpu/memory cgroup quotas). This is consistent with prior spikes
(the 3 GB default-disk limitation that caused the original Yarn 4 failure was
visible in `df`).

## SDK API surface confirmed

| Call | Behavior |
|---|---|
| `daytona.create({ snapshot, resources })` | SDK forwards `resources` to API; **API rejects** with "Cannot specify Sandbox resources when using a snapshot" |
| `daytona.create({ image, resources })` | API accepts; cpu/memory enforced as cgroup-v2 quotas, disk as overlay size |
| `daytona.create({ snapshot })` (no resources) | Works — sandbox gets the snapshot's fixed resource tier |
| `daytona.create({ image })` (no resources) | Works — sandbox gets defaults (1 vCPU / 1 GiB / 3 GiB per docs) |

The SDK's `CreateSandboxFromSnapshotParams` type omits `resources` (it is on
`CreateSandboxFromImageParams` only), which is consistent with the API
constraint — but the SDK runtime does not enforce the type, so a plain-JS
caller can pass `resources` with `snapshot` and hit the API error.

## Online sources

### Daytona sandboxes (resources)

**Source:** https://www.daytona.io/docs/sandboxes

> Create a sandbox with custom resources. Sandboxes have 1 vCPU, 1GB RAM, and
> 3GiB disk by default. Organizations get a maximum sandbox resource limit of
> 4 vCPUs, 8GB RAM, and 10GB disk.

The Resources section shows `resources` passed alongside `image` only. The
Snapshots section shows snapshot creation with no `resources` field. Neither
page states the mutual exclusivity explicitly; the spike confirmed it is an
API-enforced constraint (hard error, not silent ignore).

### Daytona snapshots

**Source:** https://www.daytona.io/docs/en/snapshots

Default snapshots have fixed resource tiers (`daytona-small` = 1 vCPU / 1 GiB
/ 3 GiB, `daytona-large` = 4 vCPU / 8 GiB / 10 GiB). The snapshot create
examples pass no `resources`; the sandbox-from-snapshot examples pass no
`resources`. Consistent with the API rejecting `resources` on the snapshot
path — a snapshot's resources are fixed at snapshot-build time, not at
sandbox-create time.

### cgroup v2 cpu/memory quotas vs nproc/free

**Source:** kernel cgroup-v2 documentation (`Documentation/admin-guide/cgroup-v2.rst`)

`cpu.max` (`quota period`) limits CPU time; `memory.max` limits memory. These
are enforced by the kernel scheduler / memory reclaim, not by masking the host
CPU/memory from `/proc` or `/sys/devices`. `nproc` (util-linux) reads
`/sys/devices/system/cpu/online`; `free` (procps) reads `/proc/meminfo` —
both host-level. This is why a cgroup-limited container reports host values
to `nproc`/`free` while still being bounded. Standard container behavior;
the spike confirmed Daytona sandboxes follow it.

## Impact on the graph pipeline plan

The plan's prescription is verified correct. No design change is needed; the
findings refine the wording and add one informational note.

### Wording refinement (folded into the plan)

The plan says "snapshots ignore resource params." This understates it: the
snapshot path **rejects** `resources` with a hard API error, so a caller that
passes both gets no sandbox. The image path is the only way to control
resources, and it honors all three (cpu/memory as cgroup-v2 quotas, disk as
overlay). The plan's per-claim recipe already uses the image path, so this
changes nothing operationally — but the wording is updated to reflect that
"ignore" is really "reject."

### Informational note (not folded — no current code path uses it)

If the dispatcher ever verifies a sandbox's actual allocation, it must read
`/sys/fs/cgroup/cpu.max` and `/sys/fs/cgroup/memory.max`, not `nproc` / `free`
(which report host-level values). The per-claim recipe trusts the create call
and does no such check today, so this is a future-consideration note, not a
change.

## Spike scripts

| Script | Purpose | Reuses |
|---|---|---|
| `spike-snapshot-resources.js` | Tests both create paths (named snapshot + declarative image) with identical `resources: { cpu: 4, memory: 8, disk: 10 }`; confirms create succeeds/fails and measures allocation via `nproc`/`free`/`df` | `spike-opencode-sandbox.js` (`log`, `sleep`, `elapsed`); Daytona SDK directly |
| `spike-snapshot-resources-cgroup.js` | Follow-up: probes cgroup-v2 `cpu.max` / `memory.max` on an image-path sandbox to confirm cpu/memory are enforced (not visible to `nproc`/`free`) | same |

Both scripts create and destroy their own sandboxes. Total sandbox time:
~70 seconds across three sandboxes (one failed snapshot create, two image
sandboxes). No sandboxes were left running.

## Decision

**No change to the design.** The plan's "create from image, not snapshot, to
control resources" is verified correct. The per-claim recipe already uses
`daytona.create({ image, resources: { cpu: 4, memory: 8, disk: 10 } })` and
that is the only path that works. The plan's wording is updated from
"snapshots ignore resource params" to reflect that the API rejects them with
an explicit error.
