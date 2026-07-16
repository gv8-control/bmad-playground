# n8n Workflow Review — Self-Improving Pipeline — 2026-07-15

## Scope and method

A read-only review of the six n8n workflows that support the gen-2 self-improving
development pipeline, plus the deterministic Node scripts they invoke. The review
did not execute, publish, unpublish, or modify any workflow or script — important
because a `Develop Epic` execution may be in flight.

**Workflows reviewed**

| ID | Name | Role |
| ---- | ---- | ---- |
| `7akkpjTdEW6RMIJG` | Develop Epic | The outer loop |
| `GGiJ7KGUez94SaOc` | Develop Story (Playbook) | Step loop, journaling, trace recording |
| `C8qzMFk2e00sLHJg` | BMAD Session (OpenCode) | opencode runner, question form, halt counting |
| `tDs1dBlOKDd3aDH8` | Parse OpenCode Response | stdout → response text |
| `3D8Jw6GicWiwBQc6` | BMAD Outcome | LLM-based COMPLETE/QUESTION classifier |
| `bmadErrNotify001` | Error Handler (ntfy) | Failure notifications |

**Supporting scripts reviewed:** `scripts/pipeline/{lib,next-story,get-steps,journal,
apply-amendments,record-trace,reflect-prompt}.mjs`.

**Criteria (10 dimensions):** contract fidelity, robustness, self-improvement
integrity, observability, security, maintainability, resource/performance, n8n
best practices, determinism, data integrity.

**Method:** four parallel sub-agents, each owning a cluster (loop layer, runner
layer, cross-cutting/error handler, deterministic scripts). Findings were then
cross-validated against each other and against the live workflow definitions (via
MCP), the auto-exported JSON on disk, and the journal/ledger evidence files.

---

## Resolved assumptions and unknowns

The review resolved several open questions; recording these so future work does
not re-litigate them.

### R1 — `questionCount` / `$runIndex` is CORRECT (negative result)

A leading hypothesis (from `pipeline-slowness-investigation-2026-07-14.md`) was
that the halt counter was miscounting, causing phantom halts. It is not.
`Run counter` stamps `runIndex: $runIndex`; n8n's `$runIndex` is 0-based and
increments once per graph-cycle traversal, so the last run's `runIndex` naturally
equals `(Parse runs) − 1`. The journal confirms: steps that fired the form 1, 2,
and 3 times record `halts: 1`, `halts: 2`, `halts: 3` respectively. The `−1` is
not an explicit subtraction — it falls out of 0-based indexing. **No change to
`questionCount` is needed or wanted.**

### R2 — `outcomeHistory` is broken (confirmed)

The `Output` node builds `outcomeHistory = JSON.stringify($('BMAD Outcome').all().map(r => r.json.outcome))`.
n8n's `$('Node').all()` does **not** aggregate node run-data across Wait-node
resume segments. After the question form resumes, prior-segment items are not
visible, so `.all()` returns only the final (current-segment) item. Journal
evidence: **232** `step_end` events carry `outcomeHistory:["COMPLETE"]`, **5**
carry `[]` (failed steps), and **0** ever contain `"QUESTION"` — yet **18** have
`halts >= 1`. The reflector therefore has the halt *count* but not the
*sequence*, which is exactly the signal it needs to distinguish a genuine
decision-policy candidate from an `infra-phantom-halt`.

### R3 — `Validate Classification` has a draft/active divergence

The auto-exported file (`n8n/workflows/3D8Jw6GicWiwBQc6.json`, the draft) contains
a version that normalises the LLM output and **falls back to `QUESTION`** (with
`classificationFallback: true`) on any unrecognised value. The MCP active version
instead **throws** `new Error('Invalid outcome: ...')`. These diverge. Either way
the phantom-halt chain holds (see F-3): salvaged/empty output reaches the
classifier and produces a `QUESTION` outcome — whether by genuine LLM
classification of truncated text, or by the fallback. The fix is the same for
both versions, but the divergence is itself a finding (F-16).

### R4 — Phantom-halt root cause (confirmed, multi-factor)

The multi-hour stalls documented in the slowness investigation are the product of
a **chain**, not a single bug:

1. A step times out or hits a provider error (`rc:124` or `rc:1`).
2. The runner salvages non-empty output and exits 0 (by design).
3. The salvaged/truncated output (or empty output) reaches `Parse OpenCode
   Response`, which returns `{response:""}` or a partial text fragment.
4. `BMAD Outcome` classifies it — an empty/partial message matches the
   classifier prompt's "asks for input before proceeding" rule, so it returns
   `QUESTION` (or the fallback does).
5. `Routing` sends it to the question form (`Get response`), which has **no
   timeout**.
6. Nobody answers for hours. The step records `halts:1` and a multi-hour
   `durationMs`.

The chain is broken at three points that all need fixing: salvaged output must
not reach the human-question path (F-3); the form must have a timeout (F-4); and
`outcomeHistory` must capture the real sequence so the reflector can see it (R2).

### R5 — Pipeline state at review time

A `Develop Epic` execution (id 13) is marked `running` but has a `stoppedAt`;
recent executions 90 and 94 are `crashed`. The pipeline state is uncertain. The
plan below is sequenced so that script-layer fixes (which take effect on the next
invocation, not the current one) come first, and workflow publications (which
create a new active version without disturbing in-flight executions) come after.

---

## Consolidated findings

Findings are deduplicated across the four reviewers, conflicts resolved, and
ordered by severity. Each carries the long-term, semantically correct fix — not
options.

### Critical

#### F-1 — Shell injection via unauthenticated webhook

- **Where:** Develop Epic → `Develop epic webhook` → `Configuration` → `Next story`
- **Evidence:** The webhook has no `authentication` field. The body `epic` flows
  through `Configuration` (`$json.body?.epic ?? $json.Epic ?? '2'`) into the
  Execute Command `node scripts/pipeline/next-story.mjs "{{ $('Configuration').first().json.Epic }}"`.
  n8n expression interpolation does not shell-escape. `next-story.mjs` validates
  `/^\d+$/`, but the shell has already interpolated the value before the script
  receives `argv`. A body `{"epic":"2\"; id; #"}` yields
  `node scripts/pipeline/next-story.mjs "2"; id; #"`.
- **Consequence:** Remote code execution on the n8n host for anyone who can
  reach port 5678. The ntfy click URLs (published to the public `agent-outcome`
  topic) reveal the host and port.
- **Fix:** (1) Validate `Epic` in the `Configuration` Set node so only digits
  ever reach the shell:
  `={{ /^\d+$/.test($json.body?.epic ?? '2') ? ($json.body?.epic ?? '2') : '2' }}`.
  (2) Add header authentication to the webhook node. (3) Long-term, replace the
  Execute Command interpolation with a Code node that calls
  `child_process.execFile` (argument array, no shell) — eliminating the entire
  class.

#### F-2 — `writePlaybook` is non-atomic; crash mid-write corrupts the source of truth

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

#### F-3 — Phantom-halt chain: salvaged/empty output reaches the human-question form

- **Where:** BMAD Session → `Agent run`, `Parse OpenCode Response`, `BMAD Outcome`,
  `Routing`, `Get response`
- **Evidence:** See R4. The runner salvages non-zero-exit output and exits 0;
  `Parse` returns `{response:""}` for empty/malformed output; `BMAD Outcome`
  classifies it as `QUESTION` (the classifier prompt matches empty/partial text
  to "asks for input before proceeding", and the draft fallback defaults to
  QUESTION); the form fires with no timeout.
- **Consequence:** 18 journal entries with `halts >= 1` and durations of 163–518
  minutes. The self-improving loop's defining feature (autonomy) degrades to
  multi-hour stalls.
- **Fix (three parts, all required):**
  1. **Route salvaged/empty output away from the question form.** Thread a
     `salvaged` flag from the shell (it already computes
     `salvagedOutput:"yes/no"` for `runner-errors.jsonl`) through `Extract
     SessionID` / `Parse` into `Routing`. When `salvaged` is true or `response`
     is empty, Routing sends the item to a **failed** path (returns
     `status:"failed"` as data, per the doc's "failures travel as data" rule),
     not to the question form. A salvaged run is an infra failure, not a human
     question.
  2. **Add a timeout to `Get response`.** Set `limitType: "afterTimeInterval"`,
     `limitWaitTime` to a bounded value (the slowness doc suggests ~15 min; a
     genuine human decision rarely needs more). On expiry, classify the step as
     failed (not as an unanswered question) so the loop-layer retry/halt guard
     can act.
  3. **Do not default classification failure to QUESTION.** Whatever the
     `Validate Classification` code, an unrecognised LLM output is not a human
     question. Default to a distinct `UNKNOWN` state that Routing treats as
     failed. (This also resolves the draft/active divergence of R3 — both
     versions converge on the same semantics.)

#### F-4 — `outcomeHistory` only ever holds the final outcome

- **Where:** BMAD Session → `Output` node
- **Evidence:** See R2. `$('BMAD Outcome').all()` does not aggregate across
  Wait-node resume segments. The reflector is blind to the intermediate
  `QUESTION` outcomes that would expose phantom halts.
- **Fix:** Stop relying on cross-resume `.all()`. Accumulate the outcome
  sequence explicitly in `$workflow.staticData` (which persists across Wait
  resumes within one execution): each `BMAD Outcome` run appends its outcome to
  `staticData.outcomeHistory`, and `Output` reads the full array from
  `staticData` instead of from `.all()`. Reset `staticData.outcomeHistory` at
  workflow start.

### High

#### F-5 — n8n-level failures never reach the reflection evidence feed

- **Where:** Error Handler (entire workflow); all five production workflows via
  `settings.errorWorkflow`
- **Evidence:** `runner-errors.jsonl` is written only by the `Agent run` shells
  in BMAD Session. Node crashes (`Next story`, `Parse decision`, journal nodes,
  HTTP failures, Mistral outages) go to the Error Handler, which only sends an
  ntfy notification — it does not append to `runner-errors.jsonl`. The
  architecture doc (line 54) says infra failures (including "n8n plumbing") feed
  `infra-*` observations, but n8n plumbing failures never reach the reflector.
- **Consequence:** The self-improvement contract is broken for exactly the
  failure class (machinery) it was designed to learn from. Recurring n8n failures
  never accumulate as a human work queue.
- **Fix:** The Error Handler appends a structured entry to
  `runner-errors.jsonl` alongside the ntfy POST, using the same schema with
  `source:"n8n-error-handler"`, `context:<workflow+node>`, and
  `stderrTail:<error.message>`. This makes n8n-level failures visible to the
  same infra-evidence pipeline that opencode failures already feed.

#### F-6 — Reflection failures are invisible; `Reflect` swallows the exit code

- **Where:** Develop Epic → `Reflect`
- **Evidence:** The command is `opencode run --agent reflector "..." | tail -n 5`.
  A pipe's exit code is the last command's — `tail` exits 0 even when opencode
  exits non-zero. If the reflector times out or crashes, the Execute Command node
  sees exit 0 and proceeds to `Apply amendments`. `Apply amendments` reads the
  proposal file independently; if no/partial proposal was written, it outputs
  `{applied:[], rejected:[], ...}` and the loop reports "0 amendments applied."
  Additionally, reflection runs `opencode` directly (not through BMAD Session),
  so runner errors during reflection are NOT captured in `runner-errors.jsonl`.
- **Consequence:** If the reflector consistently fails, the pipeline silently
  stops learning. Nothing distinguishes "reflection ran and found nothing" from
  "reflection crashed."
- **Fix:** (1) Add `set -o pipefail` to the Reflect command so a non-zero
  opencode exit propagates. (2) After Reflect, add a validation node that checks
  whether the proposal file exists and is valid JSON; if not, route to a
  "reflection failed" notification and record an `infra-reflection-failure`
  entry in `runner-errors.jsonl`. (3) Long-term, run the reflector through the
  same runner machinery as step runs so it gets timeout salvage and
  runner-errors logging for free.

#### F-7 — No concurrency guard; parallel loop executions race on the playbook

- **Where:** Develop Epic → `Develop epic webhook` + `Apply amendments`;
  `scripts/pipeline/apply-amendments.mjs` (read-modify-write of `playbook.json`)
- **Evidence:** The webhook accepts POST with no auth and no deduplication. Two
  concurrent POSTs both call `next-story.mjs`, both read the same journal (same
  attempt count), both pick the same story, and both run `apply-amendments.mjs`
  which does `readPlaybook()` → mutate → `writePlaybook()` — a classic TOCTOU
  race. The last writer wins; the first writer's amendments are silently lost.
- **Fix:** Add an advisory lock to `next-story.mjs`: before deciding, acquire a
  lock file (e.g., `flock` on `_bmad-output/pipeline/.loop.lock`); if held,
  output `{action:"halt", reason:"another loop execution is in progress"}`.
  This prevents concurrent execution at the deterministic layer, where it is
  cheapest and most reliable.

#### F-8 — `readJsonl` crashes on a single corrupt line

- **Where:** `scripts/pipeline/lib.mjs:27` — `readJsonl()`
- **Evidence:** `.map((line) => JSON.parse(line))` with no try/catch. A single
  truncated line (from a crash during `appendJsonl`, or interleaved concurrent
  writes) throws `SyntaxError` and crashes the calling script, which crashes the
  n8n Execute Command node. The journal is 865 KB / 956 events and growing.
- **Fix:** Skip-and-log corrupt lines: parse each line in a try/catch, return
  `null` on failure, filter nulls, and write a count of skipped lines to stderr.
  The operator-facing output (and the n8n notification) should surface
  `skippedCorruptLines` so the corruption is visible, not silent. This is the
  read-side counterpart of F-2; both are needed.

#### F-9 — `apply-amendments` guard reports are not idempotent on re-run

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
  Observations are safe to re-record (recurrence counts distinct `runId`s, so
  duplicates from the same run do not inflate the threshold).

#### F-10 — `BMAD Outcome` Execute Workflow node has no retry / `onError`

- **Where:** BMAD Session → `BMAD Outcome` (Execute Workflow node)
- **Evidence:** No `retryOnFail`, no `onError`, only `options:{waitForSubWorkflow:true}`.
  If the Mistral call fails (rate limit, network, model outrage), the node
  errors; since `onError` is unset, the error propagates per n8n default — and
  the pipeline doc warns that n8n error outputs are unreliable.
- **Fix:** Add `onError: continueRegularOutput` and a deterministic fallback: if
  the LLM is unreachable, classify as `UNKNOWN` (per F-3) so the step fails
  cleanly rather than stalling. Pair with a small `retryOnFail` (2 tries) so a
  transient outage does not immediately fail the step.

#### F-11 — Error Handler click URL is unreachable (`0.0.0.0`)

- **Where:** Error Handler → `Notify failure`; BMAD Session → `Notify` (question)
- **Evidence:** `N8N_HOST=0.0.0.0` with no `EDITOR_BASE_URL` override. The Error
  Handler's `$json.execution?.url` resolves to `http://0.0.0.0:5678/...` —
  browsers cannot reach it. The question-form `Recovery URL`
  (`$execution.resumeUrl.replace('webhook','form')`) resolves to
  `http://0.0.0.0:5678/form-executions/...` — also unreachable. Every other
  notification hardcodes `http://localhost:5678/...` (reachable).
- **Fix:** Set `EDITOR_BASE_URL=http://localhost:5678` in n8n's env so n8n
  constructs reachable URLs. This fixes both the Error Handler click URL and the
  question-form recovery URL without per-node changes.

### Medium

#### F-12 — Notify nodes have no `onError`; an ntfy outage halts the pipeline

- **Where:** All 9 ntfy HTTP request nodes across Develop Epic (5), BMAD Session
  (3), Error Handler (1)
- **Evidence:** None of the 9 nodes have `onError` or `retryOnFail`. ntfy.sh is a
  free external service with no SLA. If it is unreachable, any Notify node fails
  → triggers `errorWorkflow` → Error Handler fires → which also POSTs to ntfy →
  which also fails. The pipeline halts on a notification failure.
- **Fix:** Set `onError: continueRegularOutput` on all Notify nodes.
  Notifications are best-effort observability; a missed notification must never
  halt development. (The Error Handler should still attempt the POST, but its
  failure should not propagate.)

#### F-13 — Journaling Execute Command nodes have no error handling

- **Where:** Develop Story → `Journal story start/step start/step end/story end/
  story failed`; Develop Epic → `Next story`, `Parse decision`, `Reflect`, `Apply
  amendments`
- **Evidence:** Only `Run BMAD Session` (`retryOnFail:true, maxTries:2,
  onError:continueErrorOutput`) and `Record trace` (`onError:
  continueRegularOutput`) have error settings. The journaling nodes do not. A
  transient filesystem failure (disk full, permissions) crashes the loop.
- **Fix:** Add `retryOnFail: true, maxTries: 2, waitBetweenTries: 2000` to the
  journaling nodes, consistent with `Run BMAD Session`. For `Parse decision` and
  `Parse steps`, wrap `JSON.parse` in try/catch returning a structured error item
  that routes to the halt path instead of crashing. Journaling is critical, so
  stopping after a retry is acceptable — but a single transient failure should
  not halt the epic.

#### F-14 — `Extract SessionID` is fragile against `tail -n 10` truncation

- **Where:** BMAD Session → `Agent run (initial)` → `Extract SessionID`
- **Evidence:** The shell outputs `printf '%s\n' "$out" | tail -n 10`.
  `Extract SessionID` does `JSON.parse($json.stdout.split('\n')[0]).sessionID`
  with no try/catch — it assumes the first line of the 10-line window is JSON
  with `sessionID`. Trace manifests show valid session IDs today (opencode
  appears to emit `sessionID` in every event line), but this is an unverified
  assumption. If opencode's output format changes, every long step breaks.
- **Fix:** Make `Extract SessionID` a Code node that scans all available lines
  for the first JSON-parseable object exposing `.sessionID`, returning `null`
  plus a flag rather than throwing. Decouple session-ID extraction from the
  `tail -n 10` window by having the shell capture the first line of `$out`
  separately (e.g., into a second stdout field) before truncating.

#### F-15 — `salvaged` and `classificationFallback` signals are dropped before the journal

- **Where:** BMAD Session → `Output`; `BMAD Outcome` → `Validate Classification`
- **Evidence:** `runner-errors.jsonl` carries `salvagedOutput:"yes/no"` and
  `Validate Classification` produces `classificationFallback`/`rawOutcome`, but
  the `Output` node maps only `finalResponse`, `questionCount`,
  `outcomeHistory`, `sessionId`. The runtime `Assess step result` journalling
  consumes the Output payload, so it cannot tell a clean run from a salvaged one.
- **Fix:** Add `salvaged` and `classificationFallback` to the `Output`
  assignment so the journal records them. This lets the reflector stop relying on
  timestamp correlation with a separate file.

#### F-16 — Draft/active version divergence in `BMAD Outcome`

- **Where:** `3D8Jw6GicWiwBQc6` (BMAD Outcome)
- **Evidence:** The auto-exported file (draft) contains a `Validate
  Classification` that normalises output and falls back to `QUESTION` with
  `classificationFallback: true`. The MCP active version throws `new Error(...)`.
  These diverge — unpublished changes are sitting in the draft.
- **Fix:** Publish the draft after applying F-3's `UNKNOWN` default (so the
  published version is the corrected one). Going forward, treat the auto-exported
  files as the source of truth and publish deliberately.

#### F-17 — `stderrTail` leaks infrastructure and API detail

- **Where:** BMAD Session → `Agent run (initial/follow-up)` shell
- **Evidence:** `runner-errors.jsonl` entries contain `https://api.neuralwatt.com/v1/chat/completions`,
  a Cloudflare `x-request-id`, and `"Missing or invalid Authorization header"`.
  The shell does `tail -c 600 "$err"` with no redaction. This file is read by the
  reflector (an opencode run with full repo access) and lives in
  `_bmad-output`.
- **Fix:** Sanitise `stderrTail` before writing — redact `Bearer …`, `sk-…` /
  API-key patterns, and `Authorization` headers. Keep the *category* of the
  error (auth, rate-limit, context-length) via a small classifier on the tail,
  drop the raw bytes.

#### F-18 — Non-deterministic LLM classifier on every loop iteration

- **Where:** `BMAD Outcome` → `Classify response` (Mistral `mistral-small-latest`)
- **Evidence:** No `temperature` override (Mistral default > 0). Invoked once per
  `Parse OpenCode Response` run — i.e. every question-loop iteration plus the
  initial run. The same salvaged response can classify differently across runs,
  adding noise to the halt metric. Story/decision content is sent to a
  third-party LLM for a binary label.
- **Fix:** Add a deterministic rule layer that handles the common cases (empty
  response → `UNKNOWN`; `[opencode error]` prefix → `UNKNOWN`; explicit
  completion markers → `COMPLETE`) and uses the LLM only as a tie-breaker for
  genuinely ambiguous text. Set `temperature: 0` on the LLM when it is used.
  This reduces cost, latency, and the data sent to the third party.

#### F-19 — `next-story.mjs` attempt count is inflated by duplicate `story_start` events

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

#### F-20 — `--dangerously-skip-permissions` lets the LLM technically bypass the gatekeeper

- **Where:** BMAD Session → `Agent run`; Develop Epic → `Reflect`
- **Evidence:** Every opencode run uses `--dangerously-skip-permissions`, giving
  the agent unrestricted file write access. The reflector is told "do not edit
  playbook.json directly," but this is a prompt-level instruction, not a
  technical barrier. A misbehaving agent could edit the playbook directly,
  bypassing all validation in `apply-amendments.mjs`.
- **Fix:** This is an accepted trade-off for unattended runs (an interactive
  permission model cannot gate a headless loop). The semantically correct
  mitigation is defense-in-depth: (1) have `apply-amendments.mjs` verify the
  playbook has not changed unexpectedly between its read and write (a git-diff
  check or a content hash), refusing to write if an external modification
  occurred; (2) scope `.env.local` sourcing to only the env vars opencode needs
  (an allow-list rather than sourcing the whole file).

#### F-21 — Public resume URL on unauthenticated ntfy topic

- **Where:** BMAD Session → `Variables` (`Recovery URL`), `Notify`
- **Evidence:** The question-form `Recovery URL` is published to the public
  `agent-outcome` ntfy topic. Anyone who guesses the topic gets a functional
  form link to inject an answer into a `--dangerously-skip-permissions` agent
  session.
- **Fix:** Stop publishing the raw resume URL on the public topic. When an
  authenticated ntfy topic exists (the doc already calls for this), gate form
  access behind n8n auth. Until then, omit the `click` field from the question
  notification and rely on the operator navigating the n8n UI directly.

#### F-22 — `apply-amendments` does not record all decisions to the ledger

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

#### F-23 — Unbounded journal/ledger growth

- **Where:** `lib.mjs` (`readJsonl`), `journal.mjs` (trends), `apply-amendments.mjs`
  (`recurrence`)
- **Evidence:** The journal is 865 KB / 956 events; the ledger is 228 KB / 181
  entries. `readJsonl` reads the entire file into memory; `journal.mjs trends`
  does three full scans; `recurrence()` is O(n×m). These grow linearly with
  stories.
- **Fix:** Not urgent, but plan for: when the ledger exceeds ~500 entries,
  compact observations to the latest per `(fingerprint, runId)` pair and
  summarise prior observations into a distinct-runs-per-fingerprint index. For
  the journal, archive events from completed epics to `journal.<epic>.jsonl`.
  Also pre-compute a `Map<fingerprint, Set<runId>>` index in
  `apply-amendments` instead of the O(n×m) scan.

#### F-24 — `readSprintStatus` does not handle missing or malformed input

- **Where:** `scripts/pipeline/lib.mjs:44` — `readSprintStatus()`
- **Evidence:** `fs.readFileSync` throws `ENOENT` if the file is missing (no
  try/catch in `next-story.mjs`). A malformed YAML (no
  `development_status:` block) silently returns an empty array, producing a
  misleading "Epic not found" halt reason.
- **Fix:** Wrap `readFileSync` in a try/catch with a clear
  `fail('sprint-status.yaml not found at ...')`. If `entries.length === 0`
  after parsing, `fail('sprint-status.yaml has no development_status entries —
  check format')`.

### Low

#### F-25 — Ntfy topic hardcoded in 4 places; diverges from `Configuration`

- **Where:** BMAD Session (3 Notify nodes), Error Handler (1 Notify node)
- **Evidence:** Develop Epic centralises the topic in `Configuration`, but BMAD
  Session and Error Handler hardcode `"agent-outcome"`. If the topic changes in
  Configuration, those notifications go to the wrong place.
- **Fix:** Reference an environment variable (`NTFY_TOPIC`) in all workflows so
  there is one source of truth.

#### F-26 — Duplicated `Agent run` bash; dead `Variables` assignment; `arrayValue` type

- **Where:** BMAD Session → `Agent run (initial)` vs `Agent run (follow-up)`;
  `Variables` (empty-name assignment); `Extract SessionID` (`type:"arrayValue"`
  for a string field)
- **Fix:** Extract the shared bash into a parameterised script under
  `scripts/pipeline/`. Remove the dead `{"name":"","value":"","type":"string"}`
  assignment. Change `Extract SessionID`'s assignment type from `arrayValue` to
  `string`.

#### F-27 — n8n hygiene: `executionOrder`, `binaryMode`, `typeVersion` inconsistencies

- **Where:** All workflows
- **Evidence:** All use `executionOrder:"v1"` (legacy). `binaryMode:"separate"`
  is set on 4 workflows but not Develop Epic / Develop Story. Execute Workflow
  `typeVersion` is 1.2 in three places and 1.3 in one.
- **Fix:** Standardise. Test `executionOrder:"v2"` on one epic before switching
  (the SplitInBatches loop-back semantics matter). Set `binaryMode:"separate"`
  explicitly on the two loop workflows. Align Execute Workflow `typeVersion`.

#### F-28 — `apply-amendments` does not validate the `agent` field or `fired` boolean

- **Where:** `scripts/pipeline/apply-amendments.mjs:113` (agent), `:70` (fired)
- **Fix:** Validate `agent` against the known set (`planner`, `coder`,
  `reviewer`) and `fired` as a strict boolean (`report.fired === true`).

#### F-29 — `Reflect` and `apply-amendments` shell commands interpolate playbook fields

- **Where:** Develop Epic → `Reflect`; BMAD Session → `Agent run`
- **Evidence:** Playbook step fields (`skill`, `agent`, `prompt`, `label`) are
  interpolated into bash. `apply-amendments.mjs` validates step id and skill
  prefix but not shell metacharacters.
- **Fix:** Defense-in-depth: pass values via environment variables or a JSON
  file rather than shell interpolation. Have `apply-amendments.mjs` reject step
  fields containing shell metacharacters.

---

## Remediation plan

Sequenced by priority and by safety (script-layer fixes take effect on the next
invocation; workflow publications create a new active version without disturbing
in-flight executions). Each item states effort and impact.

### Workstream A — Data integrity and crash recovery (script layer, safe mid-pipeline)

These are changes to `scripts/pipeline/*.mjs`. They take effect on the next
script invocation, so they do not disturb a running story.

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| A1 | F-2 | Make `writePlaybook` atomic (write-temp-then-rename) | S | Prevents source-of-truth corruption |
| A2 | F-8 | Make `readJsonl` corruption-tolerant: skip-and-log for read-only views; skip-and-log-and-record-observation for the gatekeeper (see V9) | S | Prevents single bad line from halting the pipeline |
| A3 | F-9 | Make `apply-amendments` idempotent (ledger check before processing) | M | Prevents premature step retirement and duplicate ledger entries |
| A4 | F-19 | Count distinct `runId`s for attempt tracking | S | Prevents premature halt from crash-retry |
| A5 | F-7 | Add advisory lock to `next-story.mjs` | S | Prevents concurrent loop executions |
| A6 | F-22 | Record all apply-amendments decisions to the ledger | S | Closes the audit-trail gaps |
| A7 | F-24 | Handle missing/malformed `sprint-status.yaml` | S | Clearer failure messages |
| A8 | F-28 | Validate `agent` and `fired` in apply-amendments | S | Closes contract-enforcement gaps |
| A9 | F-23 | Pre-compute recurrence index (Map) in apply-amendments | S | O(n×m) → O(n) |

**Verification:** each script change is testable in isolation by running
`node scripts/pipeline/<script>.mjs <args>` directly — no workflow execution
needed.

### Workstream B — Phantom-halt elimination (runner layer, publish when safe)

These are workflow changes to BMAD Session, BMAD Outcome, and Parse OpenCode
Response. Publishing creates a new active version; in-flight executions
continue with the version they started with, so this is safe mid-pipeline.

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| B1 | F-3.1 | Thread `salvaged`/empty flag through to `Routing`; route salvaged/empty to failed, not question | M | Eliminates the primary phantom-halt cause |
| B2 | F-3.2 | Add `limitWaitTime` to `Get response`; on expiry → failed | S | Bounds the blast radius of any remaining spurious question |
| B3 | F-3.3 | Default `Validate Classification` to `UNKNOWN` (→ failed), not `QUESTION`; publish the corrected draft (resolves F-16) | S | Classification failure no longer fires the form |
| B4 | F-4 | Accumulate `outcomeHistory` in the item flow (not `staticData` — see V1); a Set node in the question branch prepends each outcome to an `accumulatedOutcomes` array on the item, and `Output` reads it | M | Restores the reflector's ability to see the outcome sequence |
| B5 | F-10 | Add `onError` + deterministic fallback to `BMAD Outcome` Execute Workflow node | S | Mistral outage no longer halts the step |
| B6 | F-14 | Harden `Extract SessionID` (scan all lines, no throw) | S | Removes a fragile assumption |
| B7 | F-15 | Surface `salvaged`/`classificationFallback` in the `Output` payload | S | Reflector sees salvage state without timestamp correlation |
| B8 | F-17 | Redact secrets from `stderrTail` before writing `runner-errors.jsonl` | S | Stops leaking infrastructure/API detail |
| B9 | F-18 | Add deterministic rule layer before the LLM classifier; set `temperature:0` | M | Reduces cost, latency, non-determinism, and data egress |

### Workstream C — Self-improvement evidence integrity (cross-cutting)

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| C1 | F-5 | Error Handler appends to `runner-errors.jsonl` (`source:"n8n-error-handler"`) | M | Closes the self-improvement contract gap for n8n failures |
| C2 | F-6 | Restructure the Reflect command to avoid the pipe (capture output to a variable, then `tail` separately, checking exit code between) — `pipefail` is not available because n8n uses `sh`→`dash`, not `bash` (see V8); validate proposal file after Reflect; record `infra-reflection-failure` | M | Makes reflection failures visible |
| C3 | F-6 | Long-term: route the reflector through the runner machinery | L | Reflection gets timeout salvage and runner-errors for free |

### Workstream D — Security perimeter

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| D1 | F-1 | Validate `Epic` in `Configuration` node (digits-only before shell) | S | Closes the shell-injection vector |
| D2 | F-1 | Add header authentication to `Develop epic webhook` | S | Prevents unauthorised loop triggers |
| D3 | F-1 | Long-term: replace Execute Command interpolation with a wrapper script that receives the epic as an env var (`EPIC`) — Code nodes cannot use `child_process` (see V5) | M | Eliminates the shell-interpolation class without weakening the sandbox |
| D4 | F-20 | Scope `.env.local` sourcing to an allow-list of env vars | S | Reduces the credential blast radius |
| D5 | F-21 | Stop publishing the raw resume URL on the public ntfy topic | S | Closes the form-injection vector |
| D6 | F-20 | Have apply-amendments verify the playbook is unchanged between read and write | M | Detects direct LLM edits to the playbook |

### Workstream E — Robustness of the loop

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| E1 | F-12 | Set `onError: continueRegularOutput` on all 9 Notify nodes | S | ntfy outage no longer halts the pipeline |
| E2 | F-13 | Add retry/onError to journaling and parse Execute Command/Code nodes | S | Transient fs failures no longer halt the epic |
| E3 | F-11 | Set `EDITOR_BASE_URL=http://localhost:5678` in n8n env | S | Fixes unreachable click/recovery URLs |

### Workstream F — Maintainability and n8n hygiene (low priority)

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| F1 | F-25 | Centralise ntfy topic in an env var | S | One source of truth |
| F2 | F-26 | Extract shared `Agent run` bash; remove dead assignment; fix `arrayValue` type | M | Reduces drift and confusion |
| F3 | F-27 | Standardise `executionOrder`, `binaryMode`, `typeVersion` | S | Consistency against n8n upgrades |
| F4 | F-29 | Pass playbook fields via env/JSON, not shell interpolation | M | Defense-in-depth |

---

## Sequencing and safety

The recommended order, respecting the constraint of not impacting ongoing story
development:

1. **Workstream A first** (script layer). These changes are safe mid-pipeline —
   they take effect on the next script invocation. A1 (atomic playbook write)
   and A2 (corruption-tolerant read) are the highest-leverage data-integrity
   fixes and should land first.

2. **Workstream E (E1, E3) and D (D1, D2, D5) next.** These are small, isolated
   workflow/env changes that harden the perimeter and decouple the pipeline from
   external service availability. Publishing them does not disturb in-flight
   executions.

3. **Workstream B (phantom-halt elimination).** This is the highest-impact
   runner-layer work. B1–B3 together break the phantom-halt chain; B4 restores
   the reflector's visibility. Publish after a story completes (not mid-step)
   to avoid a version boundary during a long opencode run.

4. **Workstream C (evidence integrity).** C1 (Error Handler writes to
   runner-errors.jsonl) closes the self-improvement contract gap and should
   land before B, so that any failures during the B rollout are themselves
   captured for reflection.

5. **Workstream F last.** Pure maintainability; no urgency.

---

## Assumptions verified after the review

Each assumption the plan's fixes carry was verified against the installed n8n
(v2.26.8), the node source, the env configuration, and the filesystem. Results
below. Items marked **CONFIRMED** need no further action; items marked
**REFUTED** require a fix change; items marked **PARTIALLY VERIFIED** carry a
residual caveat.

### V1 — `staticData` persists across executions in production mode — CONFIRMED, and the B4 fix is REFUTED as written

**Finding:** `staticData` is saved to the `workflow` table in the database
(`WorkflowStaticDataService.saveStaticDataById`, which does
`UPDATE workflow SET staticData = ... WHERE id = ...`) after every execution
where `__dataChanged === true`, in all non-manual modes
(`execution-lifecycle-hooks.js:396-398` and `:459-461`). It is loaded from the
same table at the start of each execution (`getStaticDataById`). **This means
`staticData` persists across executions, not just within one.**

**Impact on B4 (the `outcomeHistory` fix):** The fix as written — "accumulate
outcomes in `$workflow.staticData`, reset at workflow start" — is **wrong**.
If two executions of BMAD Session run concurrently (two different stories
calling the runner), they share the same `staticData` object in the database.
The second execution's reset would wipe the first's in-flight accumulation.
Even sequentially, a crash between the reset and the first outcome append would
lose the prior execution's data (which is fine for `outcomeHistory`, but the
pattern is fragile).

**Corrected fix for B4:** Do not use `$workflow.staticData`. Instead, carry
the outcome sequence in the **item flow itself** — the question branch already
loops back through `Agent run (follow-up)` → `Parse OpenCode Response` →
`BMAD Outcome` → `Routing`. Add a `Set` node in the question branch that
prepends the current outcome to an `accumulatedOutcomes` array carried on the
item, and have `Output` read `accumulatedOutcomes` from the item (which
persists across Wait resumes because it is part of the item data, not
`staticData`). This is immune to cross-execution leakage and does not require
a reset.

### V2 — Wait node `limitWaitTime` support in typeVersion 1.1 — CONFIRMED

**Finding:** The Wait node (`n8n-nodes-base/dist/nodes/Wait/Wait.node.js`)
defines `limitWaitTime` (boolean) and `limitType` (`afterTimeInterval` |
`atSpecifiedTime`) as parameters, with execution logic at lines 522-525. These
are available regardless of `typeVersion` (the node has a single version). The
B2 fix (add a timeout to `Get response`) is viable as designed.

### V3 — `EDITOR_BASE_URL` / `WEBHOOK_URL` control resume and execution URLs — CONFIRMED

**Finding:** `UrlService.getWebhookBaseUrl()` (`url.service.js:21`) uses
`process.env.WEBHOOK_URL` first, falling back to `generateBaseUrl()` which
constructs `${protocol}://${host}:${port}${path}` from `GlobalConfig` (which
reads `N8N_PROTOCOL`, `N8N_HOST`, `N8N_PORT`). The `resumeUrl` is built from
`webhookWaitingBaseUrl` (`get-additional-keys.js:15`), which is
`urlBaseWebhook + globalConfig.endpoints.webhookWaiting`
(`workflow-execute-additional-data.js:373`).

`getInstanceBaseUrl()` uses `globalConfig.editorBaseUrl` (env:
`N8N_EDITOR_BASE_URL`, default `''`) first, falling back to
`getWebhookBaseUrl()`.

**Impact on E3:** The fix is correct — set `WEBHOOK_URL=http://localhost:5678`
(preferred, controls both webhook and resume URLs) or
`N8N_EDITOR_BASE_URL=http://localhost:5678` (controls editor/instance URLs).
`WEBHOOK_URL` is the more complete fix because it directly controls
`webhookWaitingBaseUrl`, which is what `$execution.resumeUrl` derives from.
Neither env var is currently set; the fallback to `N8N_HOST=0.0.0.0` is what
produces the unreachable `0.0.0.0` URLs.

### V4 — `rename(2)` is atomic on the target filesystem — CONFIRMED

**Finding:** The pipeline data lives on `/dev/nvme0n1p2` mounted as `ext4`
(`df -T`, `mount`). `rename(2)` is atomic on ext4 for same-directory renames.
The A1 fix (write-temp-then-rename with the temp file in the same directory)
is correct and safe.

### V5 — n8n Code nodes can call `child_process` — REFUTED (the D3 fix is blocked)

**Finding:** n8n v2.26.8 uses the `JsTaskRunnerSandbox` for Code nodes
(`Code.node.js:185`). The task runner runs code in a `node:vm` context
(`js-task-runner.js:40`) with a `requireResolver` that **blocks any module not
on the allow-list** (`require-resolver.js`). The allow-list for built-in
modules defaults to `''` (empty — `JsRunnerConfig.allowedBuiltInModules`), and
the env override is `NODE_FUNCTION_ALLOW_BUILTIN`. The current `.env` sets
only `NODE_FUNCTION_ALLOW_EXTERNAL=uuid` — **`child_process` is not on the
allow-list and will throw `DisallowedModuleError`**.

**Impact on D3:** The long-term fix (replace Execute Command shell
interpolation with a Code node calling `child_process.execFile`) is **blocked**
unless `NODE_FUNCTION_ALLOW_BUILTIN=child_process` is set in `.env`. That would
weaken the sandbox for all Code nodes, not just the intended one. The correct
approach is: (1) keep the Execute Command node but validate the `Epic` input
in the `Configuration` Set node (digits-only regex) so only digits ever reach
the shell — this is the D1 fix and it is unaffected; (2) for the long-term D3
fix, write a small wrapper script (`scripts/pipeline/run-next-story.sh`) that
receives the epic as an environment variable (`EPIC`) rather than a shell-
interpolated argument, and have the Execute Command node set `EPIC` via n8n's
env mechanism instead of interpolating into the command string. This avoids
both the shell-injection vector and the sandbox restriction.

### V6 — Adding `UNKNOWN` as a third routing outcome is self-contained — PARTIALLY VERIFIED

**Finding:** The `Routing` Switch node in BMAD Session can add a third rule
for `UNKNOWN`. But the downstream consumer — Develop Story's `Assess step
result` — detects failure via `item.error !== undefined`
(`GGiJ7KGUez94SaOc.json` Assess node). If `UNKNOWN` is routed to a failed
path, the `Output` node must set an `error` field with the right shape
(`{message: "classification unknown — salvaged or empty output"}`) so
`Assess` detects it. The current `Output` node does not set `error` for any
case — it only sets `finalResponse`, `questionCount`, `outcomeHistory`,
`sessionId`.

**Impact on B3:** The fix is not self-contained in BMAD Session. It requires
a coordinated change: (1) BMAD Session's `Routing` adds an `UNKNOWN` output
going to a new `Output (failed)` Set node that sets `error: {message: ...}`;
(2) Develop Story's `Assess step result` already checks `item.error !==
undefined`, so it will detect the failure correctly without changes. The
contract is: `error` field presence = failure, which is the existing pattern.

### V7 — `continueRegularOutput` on Execute Workflow produces a processable item — CONFIRMED

**Finding:** The Execute Workflow node (`ExecuteWorkflow.node.js:336-353` and
`:414-428`) handles errors via `this.continueOnFail()`. When the node's
`onError` is `continueRegularOutput` (which sets `continueOnFail` to true), the
catch block pushes `{json: {error: error.message}, pairedItem: ...}` to the
output data. The downstream `Validate Classification` Code node in BMAD Outcome
would receive `{$json: {error: "..."}}` — its `agentOutcome` would be
`undefined` (since it reads `$input.first().json.output`), which falls to the
default path.

**Impact on B5:** The fix is viable but the downstream handling must account
for the `{error: "..."}` item shape. The deterministic fallback in `Validate
Classification` should check for `item.error` first and return
`{outcome: "UNKNOWN", reason: "classifier sub-workflow failed: " + item.error}`
before attempting to read `item.output`.

### V8 — The shell is bash (pipefail available) — PARTIALLY VERIFIED

**Finding:** The login shell is `/bin/bash` (5.2.21). However, n8n's Execute
Command node does not explicitly invoke bash — it uses the system's default
shell via `child_process.exec`, which on this system is `sh` → `dash`
(`/usr/bin/sh -> dash`). `dash` does **not** support `set -o pipefail`.

**Impact on C2 (the Reflect pipefail fix):** The fix as written (`set -o
pipefail`) would fail if the Execute Command node uses `sh`. Two options: (1)
explicitly invoke bash in the command: `bash -c 'set -o pipefail; opencode
run ... | tail -n 5'`; (2) avoid `pipefail` and instead capture
`PIPESTATUS[0]` (also bash-specific) or restructure the command to avoid the
pipe entirely (capture opencode output to a variable, then `tail` separately,
checking the exit code between). Option (2) is the most portable. This is a
minor correction to the C2 fix direction, not a fundamental change.

### V9 — Corruption-tolerant `readJsonl` is semantically safe for the gatekeeper — PARTIALLY VERIFIED

**Finding:** Skipping a corrupt line in `readJsonl` affects the recurrence
count in `apply-amendments` if the corrupt line was an observation entry. The
gatekeeper uses `recurrence()` which counts distinct `runId`s per fingerprint
— a skipped observation would reduce the count by one runId, potentially
below the `addStepRecurrenceThreshold` (2). This could cause an amendment to
be rejected that should have passed.

**Impact on A2:** The fix is correct for read-only views (`journal.mjs
story`/`trends`) but needs a different policy for the gatekeeper. The correct
approach: `readJsonl` takes an optional `onCorrupt` callback. For read-only
views, skip-and-log. For `apply-amendments`, skip-and-log **and** write an
`infra-corrupt-ledger-line` observation to the ledger so the reflector can see
that evidence may be incomplete. This preserves the gatekeeper's conservatism
(an amendment is rejected if evidence is uncertain) without crashing the
pipeline.

### V10 — The Error Handler can write to `runner-errors.jsonl` — CONFIRMED

**Finding:** The Error Handler is a regular n8n workflow. It can use an
Execute Command node to run a script that appends to
`_bmad-output/pipeline/runner-errors.jsonl`. The n8n process has filesystem
access to the workspace (`N8N_RESTRICT_FILE_ACCESS_TO=""` in `.env`, which
means no file access restrictions). The C1 fix is viable as designed — add
an Execute Command node to the Error Handler that calls a small script
(`scripts/pipeline/record-runner-error.mjs`) to append the structured entry.

### V11 — The auto-exported JSON files are the source of truth — REFUTED (they are the draft)

**Finding:** The auto-exported files in `n8n/workflows/` are the **draft**
versions, not the published active versions. F-16 (the draft/active divergence
in BMAD Outcome) proves this: the file contains the fallback-to-QUESTION
version, while the MCP active version throws. The auto-export captures
unpublished edits.

**Impact on the review:** Findings verified against the auto-exported files
are findings about the **draft**, which may differ from what the pipeline is
actually executing. The review cross-checked BMAD Outcome and Develop Epic
against the MCP active versions, but did not do so for all six workflows. The
findings are still valid (the draft is what a maintainer edits), but the
operator should verify which version is active before acting on a finding. The
fix for F-16 (publish the corrected draft) resolves this going forward.

### V12 — opencode's output format (sessionID in every line) — UNVERIFIED

**Finding:** I did not obtain a raw opencode stdout sample. The inference
that `sessionID` appears in every JSON event line is supported by trace
manifests (which show valid session IDs for all tested runs) but not directly
confirmed. The `Extract SessionID` node parses `stdout.split('\n')[0]` — the
first line of the `tail -n 10` window. If opencode emits a non-JSON line first
(banner, warning), this throws.

**Impact on F-14 / B6:** The fix (harden `Extract SessionID` to scan all lines)
is the correct approach regardless of the assumption — it is defensive. But
the operator should run `opencode run --format json --agent coder "echo hello"
| head -n 3` once to confirm the output format and whether sessionID is in
every line or only the first.

### V13 — The reflector agent is configured — CONFIRMED

**Finding:** The reflector agent is defined at
`.opencode/agent/reflector.md` (mode: primary, model: neuralwatt/glm-5.2,
temperature: 0.3, reasoningEffort: max). It is not in `opencode.json` (which
has no agents section), but opencode discovers agents from the
`.opencode/agent/` directory. The agent is properly configured with a detailed
system prompt covering evidence grading, signal-vs-noise discipline,
hypothesis discipline, and output discipline. F-6 (reflection failures
invisible) is not caused by a missing agent — it is caused by the `Reflect`
node swallowing the exit code (the pipe).
