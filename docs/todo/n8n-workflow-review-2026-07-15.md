# n8n Workflow Review — Self-Improving Pipeline — 2026-07-17

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
| `C8qzMFk2e00sLHJg` | BMAD Session (OpenCode) | opencode runner, question form, outcome classification, auto-continue |
| `tDs1dBlOKDd3aDH8` | Parse OpenCode Response | stdout → response text + runner signals |
| `3D8Jw6GicWiwBQc6` | BMAD Outcome | deterministic front-end + LLM tie-breaker classifier |
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

## The INCOMPLETE outcome — current state

The pipeline now classifies each agent response into one of four outcomes:

| Outcome | When | Routing |
| --- | --- | --- |
| `COMPLETE` | Agent finished cleanly | → Output (success) |
| `QUESTION` | Agent genuinely asks a human decision | → human form |
| `INCOMPLETE` | Agent quit mid-stream (timeout, provider error salvaged, or partial non-question text) — resumable | → auto-continue (resume session with `"Continue"`), capped at `incompleteContinueCap` (10) |
| `UNKNOWN` | Empty output, unclassifiable, classifier failure | → failed (sets `error`, step retries via existing machinery) |

The classification uses a deterministic front-end (`Determine outcome` Code node)
before the LLM, handling the clear cases without a model call:

1. response is empty → `UNKNOWN` (failed)
2. response starts with `[opencode error]` → `INCOMPLETE` (provider error)
3. `salvaged=="yes"` OR `rc!=0` → `INCOMPLETE` (timeout/crash)
4. otherwise → LLM decides `{COMPLETE | QUESTION | INCOMPLETE}`

The LLM tie-breaker runs at `temperature: 0`. The `Validate Classification` Code
node converges on `UNKNOWN` (with `classificationFallback: true`) for any
unrecognised LLM output — it no longer throws and no longer falls back to
`QUESTION`.

The `INCOMPLETE` branch re-enters at `Agent run (follow-up)` (which uses
`--session <id>`), bypassing the `Get response` Wait form entirely. A
branch-local `Incomplete counter` tracks `$runIndex` (incomplete traversals
only); `Check incomplete cap` compares the would-be continue count against
`incompleteContinueCap`. Under cap → `Prepare continue` sets `Answer: "Continue"`
and loops back. Over cap → `Output (cap exhausted)` sets `error` so `Assess
step result` sees `failed`, then `Notify cap` sends an ntfy notification.

Counter separation: `questionCount = totalTraversals − incompleteCount` (derived
in the `Output` node from `Run counter`'s `$runIndex` minus `Incomplete counter`'s
branch-local `$runIndex`). The `Output` node guards the "Incomplete counter never
ran" case with `$('Incomplete counter').isExecuted` inside a try/catch.

Signal threading: the `Agent run` shells append a final `runner_meta` JSON line
(`{"type":"runner_meta","rc":%d,"salvaged":"%s"}`) to stdout; `Parse OpenCode
Response` extracts `rc`/`salvaged` from it and returns them alongside `response`,
making the signals available to `Determine outcome` and the journal.

`stderrTail` is redacted before writing `runner-errors.jsonl`: `Bearer …` and
`sk-…` patterns are replaced with `[REDACTED]`, and an error category
(`auth`/`rate-limit`/`context-length`/`unknown`) is classified from the tail.

---

## Resolved assumptions and unknowns

### R1 — `questionCount` / `$runIndex` is CORRECT (negative result)

`Run counter` stamps `runIndex: $runIndex`; n8n's `$runIndex` is 0-based and
increments once per graph-cycle traversal, so the last run's `runIndex` naturally
equals `(Parse runs) − 1`. The journal confirms: steps that fired the form 1, 2,
and 3 times record `halts: 1`, `halts: 2`, `halts: 3` respectively. **No change
to `questionCount` is needed or wanted.** The `incompleteCount` derivation
(`totalTraversals − incompleteTraversals`) preserves this: an INCOMPLETE-continue
that re-enters the shared spine increments `runIndex` but is subtracted out, so
`questionCount` still counts only human-form fires.

### R2 — `outcomeHistory` accretion is now in place (resolved)

The `Output` node no longer relies on `$('BMAD Outcome').all()`, which broke
across Wait-node resume segments. Two `Accrete outcome` Code nodes (one on the
QUESTION branch, one on the INCOMPLETE branch) append each outcome to an array
keyed by `$execution.id` in `$getWorkflowStaticData('incomplete')`. The `Output`
node reads the array from staticData and deletes the key to prevent unbounded
growth. The reflector now sees the full outcome sequence.

### R3 — `Validate Classification` draft/active divergence is resolved

The draft and active versions have converged. The published `Validate
Classification` no longer throws `Error('Invalid outcome: ...')` and no longer
falls back to `QUESTION`. Unrecognised output returns
`{ outcome: 'UNKNOWN', rawOutcome: raw, classificationFallback: true }`. The
enum is `['COMPLETE', 'QUESTION', 'INCOMPLETE']`.

### R4 — Misclassified salvaged output reaching the question form (resolved)

Timeout/provider errors produced salvaged output that was classified as
`QUESTION`, firing the question form for non-questions.

The chain is now broken at three points:

1. **Salvaged/empty output no longer reaches the question form.** The
   deterministic front-end classifies `salvaged=="yes"`, `rc!=0`, and
   `[opencode error]` responses as `INCOMPLETE`, which routes to auto-continue,
   not the form. Empty responses route to `UNKNOWN` → failed.
2. **Classification failure no longer defaults to `QUESTION`.** It defaults to
   `UNKNOWN` → failed. The throw is gone.
3. **`outcomeHistory` captures the real sequence** (R2), so the reflector can
   distinguish a genuine `QUESTION` from a phantom one.

---

## Resolved findings (implemented by the INCOMPLETE work)

The following findings from the prior review pass are now resolved. Recorded
here so future work does not re-litigate them.

| Finding | Resolution |
| --- | --- |
| F-3 — Phantom-halt chain | **Resolved.** `INCOMPLETE` outcome + auto-continue routes salvaged/empty/provider-error output away from the question form. Deterministic front-end handles clear cases; LLM tie-breaker at `temperature: 0` handles ambiguous text. Cap at 10 with clean escalation to `failed`. |
| F-4 — `outcomeHistory` only holds final outcome | **Resolved.** `Accrete outcome` nodes append to staticData keyed by `$execution.id`; `Output` reads + deletes. |
| F-10 — `BMAD Outcome` Execute Workflow no retry/onError | **Resolved.** `retryOnFail: true, maxTries: 2, onError: continueRegularOutput`. `Validate Classification` checks `item.error` first → `UNKNOWN` if the sub-workflow failed. |
| F-14 — `Extract SessionID` fragile against truncation | **Partially resolved.** Now a Code node that scans all stdout lines for the first JSON with `.sessionID`, returns `null` + `sessionIdMissing` flag instead of throwing. |
| F-15 — `salvaged`/`classificationFallback` dropped before journal | **Resolved.** `Output` carries both; `Assess step result` journals them in the `step_end` payload. |
| F-16 — Draft/active divergence in `BMAD Outcome` | **Resolved.** Published version converges on `UNKNOWN`-on-unrecognised. |
| F-17 — `stderrTail` leaks infrastructure/API detail | **Resolved.** `Bearer …`/`sk-…` redacted via `sed`; error category classified (`auth`/`rate-limit`/`context-length`/`unknown`). |
| F-18 — Non-deterministic LLM classifier on every iteration | **Resolved.** `Determine outcome` deterministic front-end handles empty/`[opencode error]`/`salvaged`/`rc!=0` cases without an LLM call. LLM tie-breaker at `temperature: 0`. |
| F-26 — `arrayValue` type in `Extract SessionID` | **Resolved.** `Extract SessionID` now returns `sessionId` as a string. |

---

## Consolidated findings

Findings are ordered by severity. Each carries the long-term, semantically
correct fix — not options. Findings marked **RESOLVED** above are not repeated
here.

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
  Execute Command interpolation with a wrapper script that receives the epic as
  an env var (`EPIC`) — Code nodes cannot use `child_process` (see V5).

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
- **Fix:** (1) Restructure the Reflect command to avoid the pipe (capture
  opencode output to a variable, then `tail` separately, checking exit code
  between) — `pipefail` is not available because n8n uses `sh`→`dash`, not
  `bash` (see V8). (2) After Reflect, add a validation node that checks whether
  the proposal file exists and is valid JSON; if not, route to a "reflection
  failed" notification and record an `infra-reflection-failure` entry in
  `runner-errors.jsonl`. (3) Long-term, run the reflector through the same
  runner machinery as step runs so it gets timeout salvage, INCOMPLETE
  auto-continue, and runner-errors logging for free.

#### F-8 — `readJsonl` crashes on a single corrupt line

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

### Medium

#### F-11 — Error Handler click URL is unreachable (`0.0.0.0`)

- **Where:** Error Handler → `Notify failure`; BMAD Session → `Notify` (question)
- **Evidence:** `N8N_HOST=0.0.0.0` with no `EDITOR_BASE_URL` override. The Error
  Handler's `$json.execution?.url` resolves to `http://0.0.0.0:5678/...` —
  browsers cannot reach it. The question-form `Recovery URL`
  (`$execution.resumeUrl.replace('webhook','form')`) resolves to
  `http://0.0.0.0:5678/form-executions/...` — also unreachable. Every other
  notification hardcodes `http://localhost:5678/...` (reachable).
- **Fix:** Set `WEBHOOK_URL=http://localhost:5678` in n8n's env (preferred —
  controls both webhook and resume URLs) or `N8N_EDITOR_BASE_URL=http://localhost:5678`
  (controls editor/instance URLs). `WEBHOOK_URL` is the more complete fix
  because it directly controls `webhookWaitingBaseUrl`, which is what
  `$execution.resumeUrl` derives from.

#### F-12 — Existing Notify nodes have no `onError`; an ntfy outage halts the pipeline

- **Where:** Develop Epic (5 Notify nodes), BMAD Session (3 existing Notify
  nodes), Error Handler (1 Notify node)
- **Evidence:** The new `Notify cap` node has `onError: continueRegularOutput`,
  but the 9 pre-existing Notify nodes across the other workflows do not. ntfy.sh
  is a free external service with no SLA. If it is unreachable, any Notify node
  fails → triggers `errorWorkflow` → Error Handler fires → which also POSTs to
  ntfy → which also fails. The pipeline halts on a notification failure.
- **Fix:** Set `onError: continueRegularOutput` on all 9 pre-existing Notify
  nodes. Notifications are best-effort observability; a missed notification must
  never halt development.

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

---

## Remediation plan

Sequenced by priority and by safety (script-layer fixes take effect on the next
invocation; workflow publications create a new active version without disturbing
in-flight executions). The phantom-halt workstream (formerly Workstream B) is
complete; it is listed here as closed for reference.

### Workstream A — Data integrity and crash recovery (script layer, safe mid-pipeline)

These are changes to `scripts/pipeline/*.mjs`. They take effect on the next
script invocation, so they do not disturb a running story.

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

### Workstream B — Phantom-halt elimination (runner layer) — CLOSED

This workstream is complete. The INCOMPLETE outcome, deterministic front-end,
auto-continue with cap, counter separation, signal threading, stderr redaction,
and outcomeHistory accretion are all implemented and published.

| Step | Finding | Status |
| ---- | ---- | ---- |
| B1 | F-3.1 | **Done.** `salvaged`/`rc` threaded via `runner_meta` → `Parse` → `Determine outcome`. |
| B3 | F-3.3 | **Done.** `Validate Classification` defaults to `UNKNOWN`, not `QUESTION`. |
| B4 | F-4 | **Done.** Accretion via staticData keyed by `$execution.id`. |
| B5 | F-10 | **Done.** `onError: continueRegularOutput` + `retryOnFail: true, maxTries: 2`. |
| B6 | F-14 | **Partially done.** Hardened (scan all lines, no throw, `sessionIdMissing` flag). |
| B7 | F-15 | **Done.** `salvaged`/`classificationFallback` in Output payload. |
| B8 | F-17 | **Done.** `Bearer`/`sk-` redacted; error category classified. |
| B9 | F-18 | **Done.** `Determine outcome` deterministic front-end; LLM at `temperature: 0`. |

### Workstream C — Self-improvement evidence integrity (cross-cutting)

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| C1 | F-5 | Error Handler appends to `runner-errors.jsonl` (`source:"n8n-error-handler"`) | M | Closes the self-improvement contract gap for n8n failures |
| C2 | F-6 | Restructure the Reflect command to avoid the pipe (capture output to a variable, then `tail` separately, checking exit code between) — `pipefail` is not available because n8n uses `sh`→`dash`, not `bash` (see V8); validate proposal file after Reflect; record `infra-reflection-failure` | M | Makes reflection failures visible |
| C3 | F-6 | Long-term: route the reflector through the runner machinery | L | Reflection gets timeout salvage, INCOMPLETE auto-continue, and runner-errors for free |

### Workstream D — Security perimeter

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| D1 | F-1 | Validate `Epic` in `Configuration` node (digits-only before shell) | S | Closes the shell-injection vector |
| D2 | F-1 | Add header authentication to `Develop epic webhook` | S | Prevents unauthorised loop triggers |
| D3 | F-1 | Long-term: replace Execute Command interpolation with a wrapper script that receives the epic as an env var (`EPIC`) — Code nodes cannot use `child_process` (see V5) | M | Eliminates the shell-interpolation class without weakening the sandbox |

### Workstream E — Robustness of the loop

| Step | Finding | Action | Effort | Impact |
| ---- | ---- | ---- | ---- | ---- |
| E1 | F-12 | Set `onError: continueRegularOutput` on all 9 pre-existing Notify nodes (the new `Notify cap` already has it) | S | ntfy outage no longer halts the pipeline |
| E2 | F-13 | Add retry/onError to journaling and parse Execute Command/Code nodes | S | Transient fs failures no longer halt the epic |
| E3 | F-11 | Set `WEBHOOK_URL=http://localhost:5678` in n8n env | S | Fixes unreachable click/recovery URLs |

---

## Sequencing and safety

The recommended order, respecting the constraint of not impacting ongoing story
development:

1. **Workstream A first** (script layer). These changes are safe mid-pipeline —
   they take effect on the next script invocation. A1 (atomic playbook write)
   and A2 (corruption-tolerant read) are the highest-leverage data-integrity
   fixes and should land first.

2. **Workstream E (E1, E3) and D (D1, D2) next.** These are small, isolated
   workflow/env changes that harden the perimeter and decouple the pipeline from
   external service availability. Publishing them does not disturb in-flight
   executions.

3. **Workstream C (evidence integrity).** C1 (Error Handler writes to
   runner-errors.jsonl) closes the self-improvement contract gap and should
   land before any further runner-layer changes, so that failures during
   rollout are themselves captured for reflection.

Workstream B (phantom-halt elimination) is complete and requires no further
sequencing.

---

## Assumptions verified after the review

Each assumption the plan's fixes carry was verified against the installed n8n
(v2.26.8), the node source, the env configuration, and the filesystem. Results
below. Items marked **CONFIRMED** need no further action; items marked
**REFUTED** require a fix change; items marked **PARTIALLY VERIFIED** carry a
residual caveat.

### V1 — `staticData` persists across executions in production mode — CONFIRMED

**Finding:** `staticData` is saved to the `workflow` table in the database
(`WorkflowStaticDataService.saveStaticDataById`, which does
`UPDATE workflow SET staticData = ... WHERE id = ...`) after every execution
where `__dataChanged === true`, in all non-manual modes
(`execution-lifecycle-hooks.js:396-398` and `:459-461`). It is loaded from the
same table at the start of each execution (`getStaticDataById`). **This means
`staticData` persists across executions, not just within one.**

**Impact on the implemented F-4 fix:** The implementation uses
`$getWorkflowStaticData('incomplete')` keyed by `$execution.id`. This prevents
cross-execution data leakage in the sequential-execution model (each execution
writes to its own key). The `delete staticData[key]` at `Output` prevents
unbounded growth. The pipeline runs sequentially, so this is safe today.

### V3 — `EDITOR_BASE_URL` / `WEBHOOK_URL` control resume and execution URLs — CONFIRMED

**Finding:** `UrlService.getWebhookBaseUrl()` uses `process.env.WEBHOOK_URL`
first, falling back to `generateBaseUrl()` which constructs
`${protocol}://${host}:${port}${path}` from `GlobalConfig` (which reads
`N8N_PROTOCOL`, `N8N_HOST`, `N8N_PORT`). The `resumeUrl` is built from
`webhookWaitingBaseUrl`.

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

**Finding:** n8n v2.26.8 uses the `JsTaskRunnerSandbox` for Code nodes. The task
runner runs code in a `node:vm` context with a `requireResolver` that **blocks
any module not on the allow-list**. The allow-list for built-in modules defaults
to `''` (empty), and the env override is `NODE_FUNCTION_ALLOW_BUILTIN`. The
current `.env` sets only `NODE_FUNCTION_ALLOW_EXTERNAL=uuid` — `child_process`
is not on the allow-list and will throw `DisallowedModuleError`.

**Impact on D3:** The long-term fix (replace Execute Command shell interpolation
with a Code node calling `child_process.execFile`) is **blocked** unless
`NODE_FUNCTION_ALLOW_BUILTIN=child_process` is set in `.env`. That would weaken
the sandbox for all Code nodes, not just the intended one. The correct approach
is: (1) keep the Execute Command node but validate the `Epic` input in the
`Configuration` Set node (digits-only regex) so only digits ever reach the
shell — this is the D1 fix and it is unaffected; (2) for the long-term D3 fix,
write a small wrapper script (`scripts/pipeline/run-next-story.sh`) that
receives the epic as an environment variable (`EPIC`) rather than a shell-
interpolated argument, and have the Execute Command node set `EPIC` via n8n's
env mechanism instead of interpolating into the command string.

### V6 — `UNKNOWN` as a routing outcome requires a coordinated `error` field — CONFIRMED (implemented)

**Finding:** `Assess step result` detects failure via `item.error !== undefined`.
The `Output` node now sets `error` for `UNKNOWN` outcomes
(`error = { message: 'outcome classified as UNKNOWN' }`) and for cap-exhaustion
(`error = { message: 'incomplete-continue cap exhausted (N)' }`). `Assess step
result` detects both correctly. The contract is: `error` field presence =
failure, which is the existing pattern.

### V7 — `continueRegularOutput` on Execute Workflow produces a processable item — CONFIRMED (implemented)

**Finding:** When the Execute Workflow node's `onError` is
`continueRegularOutput`, the catch block pushes `{json: {error: error.message},
pairedItem: ...}` to the output data. The downstream `Validate Classification`
Code node checks `item.error !== undefined` first and returns
`{ outcome: 'UNKNOWN', rawOutcome: String(item.error?.message ?? item.error),
classificationFallback: true }` before attempting to read `item.output`. This
is implemented as designed.

### V8 — The shell is bash, but n8n Execute Command uses dash — PARTIALLY VERIFIED

**Finding:** The login shell is `/bin/bash` (5.2.21). However, n8n's Execute
Command node uses the system's default shell via `child_process.exec`, which on
this system is `sh` → `dash` (`/usr/bin/sh -> dash`). `dash` does **not** support
`set -o pipefail`.

**Impact on C2 (the Reflect pipefail fix):** The fix as written (`set -o
pipefail`) would fail if the Execute Command node uses `sh`. The correct
approach is to avoid `pipefail` and instead capture opencode output to a
variable, then `tail` separately, checking the exit code between. This is a
minor correction to the C2 fix direction, not a fundamental change.

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

### V10 — The Error Handler can write to `runner-errors.jsonl` — CONFIRMED

**Finding:** The Error Handler is a regular n8n workflow. It can use an
Execute Command node to run a script that appends to
`_bmad-output/pipeline/runner-errors.jsonl`. The n8n process has filesystem
access to the workspace (`N8N_RESTRICT_FILE_ACCESS_TO=""` in `.env`, which
means no file access restrictions). The C1 fix is viable as designed — add an
Execute Command node to the Error Handler that calls a small script
(`scripts/pipeline/record-runner-error.mjs`) to append the structured entry.

### V11 — The auto-exported JSON files are the draft, not the active version — CONFIRMED

**Finding:** The auto-exported files in `n8n/workflows/` are the **draft**
versions, not necessarily the published active versions. The F-16 divergence
(draft vs active in BMAD Outcome) is now resolved — both converge on
`UNKNOWN`-on-unrecognised. Going forward, the auto-exported files should be
treated as the source of truth and published deliberately.

### V12 — opencode's output format — CONFIRMED via implementation

**Finding:** The `Extract SessionID` hardening (scan all lines for JSON with
`.sessionID`) is now in place and works regardless of whether `sessionID`
appears in every line or only the first. The `runner_meta` line appended by the
shell provides `rc`/`salvaged` deterministically. The `sessionIdMissing` flag
surfaces the edge case where no sessionID is found.

### V13 — The reflector agent is configured — CONFIRMED

**Finding:** The reflector agent is defined at `.opencode/agent/reflector.md`
(mode: primary, model: neuralwatt/glm-5.2, temperature: 0.3, reasoningEffort:
max). It is not in `opencode.json` (which has no agents section), but opencode
discovers agents from the `.opencode/agent/` directory. The agent is properly
configured with a detailed system prompt covering evidence grading, signal-vs-
noise discipline, hypothesis discipline, and output discipline. The
`reflect-prompt.mjs` now includes an `INCOMPLETES` guidance block that
distinguishes (a) genuine auto-continues that resolve, (b) cap-exhaustion
(`infra-incomplete-cap-exhausted`), and (c) phantom INCOMPLETE from
misclassification (`infra-incomplete-misclassification`). F-6 (reflection
failures invisible) is not caused by a missing agent or missing guidance — it
is caused by the `Reflect` node swallowing the exit code (the pipe).
