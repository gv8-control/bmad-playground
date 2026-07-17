# Workstream A — Data integrity and crash recovery

Extracted from the n8n Workflow Review (2026-07-17). Workstream B (phantom-halt
elimination) is closed; these changes are the remaining data-integrity work.

Changes are to `scripts/pipeline/*.mjs`. They take effect on the next script
invocation, so they do not disturb a running story. This workstream is
recommended to land first.

## Workstream steps

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| A1 | F-2 | Make `writePlaybook` atomic (write-temp-then-rename) | S | Prevents source-of-truth corruption |
| A2 | F-8 | Make `readJsonl` corruption-tolerant: skip-and-log for read-only views; skip-and-log-and-record-observation for the gatekeeper (see V9) | S | Prevents single bad line from halting the pipeline |
| A3 | F-9 | Make `apply-amendments` idempotent (ledger check before processing) | M | Prevents premature step retirement and duplicate ledger entries |
| A4 | F-19 | Count distinct `runId`s for attempt tracking | S | Prevents premature halt from crash-retry |
| A6 | F-22 | Record all apply-amendments decisions to the ledger | S | Closes the audit-trail gaps |
| A7 | F-24 | Handle missing/malformed `sprint-status.yaml` | S | Clearer failure messages |

**Verification:** each script change is testable in isolation by running
`node scripts/pipeline/<script>.mjs <args>` directly — no workflow execution
needed.

## Findings

### F-2 — `writePlaybook` is non-atomic; crash mid-write corrupts the source of truth

- **Where:** `scripts/pipeline/lib.mjs:23` — `writePlaybook()`
- **Evidence:** `fs.writeFileSync(PATHS.playbook, JSON.stringify(playbook, null, 2) + '\n')`.
  A process kill (the 90-minute runner timeout, OOM, or n8n node timeout) during
  the write leaves a truncated `playbook.json`. Every script that calls
  `readPlaybook()` (`next-story.mjs`, `get-steps.mjs`, `apply-amendments.mjs`)
  then throws `SyntaxError` and the pipeline becomes unrecoverable without
  manual file repair.
- **Fix:** Write-to-temp-then-rename (atomic on POSIX):
  ```js
  const tmp = PATHS.playbook + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(playbook, null, 2) + '\n');
  fs.renameSync(tmp, PATHS.playbook);
  ```
  `rename(2)` is atomic — the playbook is either the old version or the new
  version, never partial.

### F-8 — `readJsonl` crashes on a single corrupt line

- **Where:** `scripts/pipeline/lib.mjs:27` — `readJsonl()`
- **Evidence:** `.map((line) => JSON.parse(line))` with no try/catch. A single
  truncated line (from a crash during `appendJsonl`, or interleaved concurrent
  writes) throws `SyntaxError` and crashes the calling script, which crashes the
  n8n Execute Command node. The journal is 865 KB / 956 events and growing.
- **Fix:** Skip-and-log corrupt lines: parse each line in a try/catch, return
  `null` on failure, filter nulls, and write a count of skipped lines to stderr.
  The operator-facing output (and the n8n notification) should surface
  `skippedCorruptLines` so the corruption is visible, not silent. For the
  gatekeeper (`apply-amendments`), skip-and-log **and** write an
  `infra-corrupt-ledger-line` observation to the ledger so the reflector can see
  that evidence may be incomplete (see V9).

### F-9 — `apply-amendments` guard reports are not idempotent on re-run

- **Where:** `scripts/pipeline/apply-amendments.mjs:66` — guard reports section
- **Evidence:** `step.cleanStreak = report.fired ? 0 : (step.cleanStreak ?? 0) + 1`
  increments unconditionally. If the node is re-invoked with the same `runId`
  (n8n retry, or manual re-run), `cleanStreak` is incremented again. With
  `retireCleanStreak: 3`, three re-runs of a single clean report would retire a
  learned step that should have `cleanStreak: 1`. The proposal file is never
  deleted, so the same proposal is always re-processable. `update_step` and
  `retire_step` have the same re-apply issue (duplicate `applied` ledger entries).
- **Fix:** Before processing guard reports and amendments, check the ledger for
  a prior entry with `{type:"applied"|"retired"|"rejected", runId,
  amendment:<same>}`. If found, skip re-processing. The ledger is the source of
  truth for "what has been applied," so checking it is the correct gate.

### F-19 — `next-story.mjs` attempt count is inflated by duplicate `story_start` events

- **Where:** `scripts/pipeline/next-story.mjs:36`
- **Evidence:** `attempts = readJsonl(journal).filter(e => e.type==='story_start' && e.story===story).length`.
  If a story run crashes after `Journal story start` but before the first step,
  the orphaned `story_start` is counted as an attempt. With
  `maxAttemptsPerStory: 2`, a crash before any step costs the story half its
  retry budget.
- **Fix:** Count distinct `runId` values among `story_start` events for the
  story, rather than raw event count:
  `new Set(events.filter(...).map(e => e.runId)).size`. A duplicate
  `story_start` for the same `runId` (from a crash-retry) does not inflate the
  count.

### F-22 — `apply-amendments` does not record all decisions to the ledger

- **Where:** `scripts/pipeline/apply-amendments.mjs` — three branches
- **Evidence:** The doc says "everything — applied, rejected, observed — lands in
  the ledger." But: (1) a missing proposal file outputs a note to stdout and
  writes nothing to the ledger; (2) an observation missing
  fingerprint/summary is pushed to the `rejected` array but not to the ledger;
  (3) a `cleanStreak` update that does not trigger retirement is persisted to the
  playbook but not recorded in the ledger.
- **Fix:** Add `appendJsonl` calls for each: `{type:"skipped", runId, reason}`,
  `{type:"rejected", runId, reason, observation}`, and
  `{type:"guard_report", runId, stepId, cleanStreak, fired}`.

### F-24 — `readSprintStatus` does not handle missing or malformed input

- **Where:** `scripts/pipeline/lib.mjs:44` — `readSprintStatus()`
- **Evidence:** `fs.readFileSync` throws `ENOENT` if the file is missing (no
  try/catch in `next-story.mjs`). A malformed YAML (no
  `development_status:` block) silently returns an empty array, producing a
  misleading "Epic not found" halt reason.
- **Fix:** Wrap `readFileSync` in a try/catch with a clear
  `fail('sprint-status.yaml not found at ...')`. If `entries.length === 0`
  after parsing, `fail('sprint-status.yaml has no development_status entries —
  check format')`.

## Relevant verifications

### V4 — `rename(2)` is atomic on the target filesystem — CONFIRMED

**Finding:** The pipeline data lives on `/dev/nvme0n1p2` mounted as `ext4`
(`df -T`, `mount`). `rename(2)` is atomic on ext4 for same-directory renames.
The A1 fix (write-temp-then-rename with the temp file in the same directory)
is correct and safe.

### V9 — Corruption-tolerant `readJsonl` is semantically safe for the gatekeeper — PARTIALLY VERIFIED

**Finding:** Skipping a corrupt line in `readJsonl` affects the recurrence
count in `apply-amendments` if the corrupt line was an observation entry. The
gatekeeper uses `recurrence()` which counts distinct `runId`s per fingerprint
— a skipped observation would reduce the count by one runId, potentially below
the `addStepRecurrenceThreshold` (2). This could cause an amendment to be
rejected that should have passed.

**Impact on A2:** The fix is correct for read-only views (`journal.mjs
story`/`trends`) but needs a different policy for the gatekeeper. The correct
approach: `readJsonl` takes an optional `onCorrupt` callback. For read-only
views, skip-and-log. For `apply-amendments`, skip-and-log **and** write an
`infra-corrupt-ledger-line` observation to the ledger so the reflector can see
that evidence may be incomplete. This preserves the gatekeeper's conservatism
(an amendment is rejected if evidence is uncertain) without crashing the
pipeline.
