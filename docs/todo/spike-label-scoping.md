# Spike: reconcile orphan matching via sandbox labels

**Date:** 2026-07-22
**Status:** Complete — interaction seam VERIFIED
**Verifies:** "Reconcile orphan matching" interaction seam from `docs/todo/graph-pipeline.md`
**Script:** `docs/todo/spike-label-scoping.js`

## TL;DR

The `scope: pipeline` label is settable at sandbox creation time, present on
the returned `Sandbox` instance immediately (no propagation delay on the
object), and queryable via `daytona.list({ labels: {...} })` after a ~5 second
index propagation delay. Reconcile can find orphaned sandboxes by label without
a separate labeling call — the primary assumption holds.

One secondary finding: `setLabels()` (post-creation label replacement) returns
the correct replaced labels in its response, but the `list()` index continues
to show stale labels merged with new ones for at least 20 seconds. This does
not affect the pipeline's use case (reconcile finds sandboxes by labels set at
creation, not by labels updated post-creation).

## What was tested

The interaction seam from the plan:

> "Destroy sandboxes no journal entry accounts for" matches by label, not by
> ID. A sandbox created by a pass that died before journaling the claim is
> orphaned and destroyed — fine, if the label is set at creation. If a sandbox
> is created without the label (a bug in the create path), reconcile cannot
> see it, and it leaks — consuming quota silently. The label is load-bearing
> for cleanup.

The spike script (`spike-label-scoping.js`) tests six things:

1. Labels passed to `daytona.create({ labels })` are on the returned `Sandbox`
   instance immediately (no separate `setLabels` call needed).
2. `daytona.list({ labels: { scope, runId } })` returns the sandbox — filtered
   listing works with multi-key exact match.
3. A filter with a wrong `runId` value does NOT return the sandbox — exact
   match, not substring.
4. A single-key filter (`scope` only) finds a sandbox that has additional
   labels — partial-label filtering works.
5. `setLabels()` replaces labels on a running sandbox (the response confirms
   replacement).
6. No propagation delay between `create()` returning and the label being on
   the instance — the label is usable the instant `create()` resolves.

**All primary checks pass.** Total runtime: ~45 seconds (including delays).

## Results

### Labels at creation — PASS

| Check | Result |
|---|---|
| Labels on `Sandbox` instance after `create()` resolves | PASS — all 3 labels present immediately |
| `code-toolbox-language: python` auto-added by Daytona | Observed — Daytona adds this label automatically |

Labels passed to `create({ labels: { scope: 'pipeline', runId: '...', purpose: 'label-spike' } })`
are on the returned instance the instant `create()` resolves. No separate
labeling call is needed. This is the load-bearing property for reconcile: a
sandbox that exists has its labels from the moment the dispatcher can reference
it.

### List with label filter — PASS (with ~5s index delay)

| Check | Result |
|---|---|
| `list({ labels: { scope, runId } })` returns exactly the sandbox | PASS |
| `list({ labels: { scope, runId: 'wrong' } })` returns 0 sandboxes | PASS — exact match |
| `list({ labels: { scope } })` (single key) finds sandbox with 3 labels | PASS — partial filter works |
| Sandbox visible in unfiltered `list({})` | PASS |

**Finding: ~5 second index propagation delay.** Immediately after `create()`,
`list({ labels: {...} })` returns 0 results. After a 5-second wait, the same
query returns the sandbox. The label is on the `Sandbox` instance immediately
(usable by the dispatcher's in-memory state), but the list/filter API needs a
few seconds to index it.

This delay is not a problem for the pipeline: a pass that creates a sandbox
and journals the claim in the same pass has the sandbox ID in the journal —
it does not need to find it via `list()` until a later pass's reconcile step,
which is minutes later (tick cadence). An orphaned sandbox (pass died after
create, before journaling) is found by the next reconcile pass, which is also
minutes later — well past the indexing delay.

### setLabels post-creation — PASS (response), with secondary finding (list index)

| Check | Result |
|---|---|
| `setLabels()` response shows replaced labels (old key gone) | PASS |
| `sb.labels` updated from response after `setLabels()` | PASS |
| `list()` shows old key gone after 5s | NOTE — old key still present |
| `list()` shows old key gone after 20s | NOTE — old key still present |

The `setLabels()` API endpoint is named "Replace sandbox labels" and the
response confirms replacement: passing `{ scope, runId, status: 'relabeled' }`
returns `{ scope, runId, status: 'relabeled' }` — the old `purpose` key is
absent from the response.

However, `list()` continues to show the old `purpose` key alongside the new
`status` key even 20 seconds later. The list index appears to merge stale
labels with new ones rather than reflecting the replacement. The
`code-toolbox-language` label (auto-added by Daytona at creation) also
reappears in list results after `setLabels` removed it from the response.

**Impact on the pipeline: none.** The pipeline sets labels at creation and
never updates them post-creation. Reconcile finds sandboxes by the creation
labels (`scope: pipeline`, `runId`), which are stable. If post-creation label
updates are ever needed (e.g. marking a sandbox as `parked`), the `setLabels`
response is authoritative and the list index lag would need to be accounted
for — but that is not a current use case.

### No propagation delay on the instance — PASS

The label is on the `Sandbox` instance from the moment `create()` resolves.
The dispatcher can use `sb.labels` or `sb.id` immediately to journal the
claim — there is no window where the sandbox exists but the label doesn't,
which was the specific concern in the interaction seam note.

## Findings

### F1: Labels are set at creation — no separate call needed

`daytona.create({ labels: { scope: 'pipeline', runId: '...' } })` sets labels
atomically with sandbox creation. The returned `Sandbox` instance has the
labels. This eliminates the "create-then-label" window the interaction seam
worried about: there is no moment where a sandbox exists without its labels.

### F2: ~5 second list index propagation delay

The `list({ labels: {...} })` filter does not find a sandbox until ~5 seconds
after creation. This is an index propagation delay, not a creation delay — the
sandbox exists and its labels are on the instance immediately. The delay only
affects discovery via the list/filter API.

Not a problem for the pipeline: the dispatcher journals the sandbox ID at
claim time (same pass), so it never needs to discover its own just-created
sandbox via `list()`. Reconcile runs on later passes (minutes later), well
past the delay.

### F3: setLabels response is authoritative; list index lags on label removal

`setLabels()` returns the correctly replaced labels (old keys removed), but
`list()` continues to show stale labels merged with new ones for at least 20
seconds. If post-creation label updates are ever needed, the `setLabels`
response — not `list()` results — is the source of truth.

Not a problem for the pipeline: labels are set at creation and never updated.
The `scope: pipeline` and `runId` labels are stable for the sandbox's lifetime.

### F4: Daytona auto-adds `code-toolbox-language: python`

Every sandbox gets a `code-toolbox-language: python` label automatically at
creation, in addition to any labels passed in `create()`. This is visible in
both the instance and list results. It does not interfere with filtering — a
filter for `{ scope: 'pipeline' }` still finds sandboxes that also have
`code-toolbox-language`.

## Impact on the plan

The interaction seam is resolved. The plan's reconcile step can rely on:

```js
// Create with labels — no separate labeling call
const sb = await daytona.create({ labels: { scope: 'pipeline', runId } });

// Reconcile: find all pipeline sandboxes
for await (const sb of daytona.list({ labels: { scope: 'pipeline' } })) {
  if (!journalAccountsFor(sb.id)) {
    await daytona.delete(sb);  // orphaned
  }
}
```

The ~5s list index delay is noted but does not affect the design: reconcile
runs on passes minutes apart, not seconds after creation. No design change
needed.
