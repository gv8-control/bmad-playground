# n8n Execution Review — Develop Story (Webhook) → Develop Story

**Target:** execution 215 (parent) · **Mode:** Execution · **Reviewed:** 2026-07-02
**Status:** success · **Duration:** 6h 42m 19s (2026-07-01T20:14:45.364Z → 2026-07-02T02:57:04.773Z) · **Sub-executions:** 20 (across 4 nesting levels)

## Executive Summary

This run validated story `1.8`, kicked off the "Develop Story" pipeline, and finished green — every one of the 20 executions in the tree reports `success`, no node errored. But the checkmark hides the real story: **39.2 minutes of actual agent/LLM compute time is stretched across 6h 42m of wall clock**, almost entirely because a human-approval form inside the code-review branch sat unanswered for 6h 01m 26s, and because branches that are wired as parallel fan-outs in the graph run strictly one-after-another in practice. Separately, the six nodes that are supposed to create and implement the story (`Create story`, `Implement story`, etc.) are disabled pass-throughs — this pipeline currently only *reviews* code, it doesn't write it.

## Findings

### Orchestration & Sub-Execution Structure — Critical

**Node:** `Get response` (execution 223, `n8n-nodes-base.wait`, `resume: form`)
**Evidence:** The node's second wait cycle opened at `2026-07-01T20:43:02.302Z` (right after `Notify` fired an ntfy.sh alert titled "Code review (1.8) - Action Needed") and didn't resume until `2026-07-02T02:44:27.966Z` — a gap of **21,686,118 ms (6h 01m 26s)**. That single stall accounts for 90% of the entire pipeline's 6h 42m runtime. Cross-check: summing every `executeCommand`/LLM-agent/`httpRequest` node's `executionTimeMs` across the whole 20-execution tree gives **2,354,093 ms (39.2 min)** of real compute — the rest is idle waiting.
**Why it matters:** A form-based `Wait` node has no timeout (`limitWaitTime: false`) and no escalation path beyond a single ntfy.sh push. If nobody sees or acts on that notification, the run — and everything gated behind it — simply hangs indefinitely. The green "success" status doesn't distinguish a 6-hour human delay from a 6-second one, so this class of stall is invisible unless someone reads timestamps like this.
**Direction:** Needs a bounded wait with a fallback (timeout → auto-escalate, re-notify, or fail closed) rather than an unlimited wait keyed to a single notification channel.

### Orchestration & Sub-Execution Structure — High

**Node:** `Review code`, `Review tests`, `Review NFRs` (execution 216, all sourced from `Merge1`)
**Evidence:** All three are wired as a fan-out from the same `Merge1` output (same `source.previousNode`), implying parallel execution. Actual timestamps show otherwise: `Review code`'s sub-execution (223) ran `20:34:25.796Z → 02:45:55.793Z`; `Review tests` (230) did not start until `02:45:55.949Z` (156ms after `Review code` finished); `Review NFRs` (233) did not start until `02:52:12.216Z`, immediately after `Review tests` finished. They executed **strictly sequentially**, not concurrently.
**Why it matters:** `Review tests` and `Review NFRs` have no logical dependency on `Review code` — they're independent review dimensions. Because they ran after it instead of alongside it, both sat idle for the entire 6-hour human-approval stall even though neither needed the human's answer. The same pattern shows up one level up: `E2E tests` (861,550ms) and `Unit tests` (317,784ms) are both wired from `Implement story`, but `Unit tests` doesn't start until the instant `E2E tests` finishes (`20:29:07.916Z`, 22ms after `E2E tests`' `20:29:07.894Z` end) — costing ~5.3 minutes that true parallelism would have hidden.
**Direction:** Needs the fan-out branches to actually execute concurrently (verify n8n's execution/queue mode for this instance), or, if this n8n installation only ever runs branches serially, needs the human-gated branch reordered so it doesn't block branches that don't depend on it.

### Maintainability & Semantic Clarity — High

**Node:** `Validate story`, `Create story`, `Prepare tests`, `Validate story again`, `Implement story`, `Merge` (execution 216)
**Evidence:** All six are `disabled: true` in the workflow snapshot used for this execution, yet still appear in `runData` with `status: success` and `executionTimeMs` of 0–1ms. Their output is byte-identical to their input (`{"Story": "1.8", "Plan Agent": "planner", "Code Agent": "coder"}`) at every step — they're inert pass-throughs, not doing any of the work their names imply.
**Why it matters:** The workflow is named "Develop Story" and its trigger accepted a story ID to "develop." In this run, it never validated the story, never created it, never prepared tests for it, and never implemented it — only `E2E tests`, `Unit tests`, `Review code`, `Review tests`, and `Review NFRs` did real work (calling `opencode run`). Anyone trusting the workflow name plus a green run would reasonably assume the full create → implement → review lifecycle happened; it didn't. (Consistent with this run's actual code changes: the story-1.8 edits — e.g. `AppShell.tsx`'s `Status: review` → `Status: done` — were made by the `Review code` agent's follow-up tool call, not by an `Implement story` step.)
**Direction:** Either re-enable and wire up the create/implement stages, or rename/restructure the workflow (and its trigger's contract) so "Develop Story" accurately describes "review an already-implemented story," so a future reader doesn't assume more coverage than exists.

### Security & Credential Hygiene — Medium

**Node:** `Notify` (execution 223, `n8n-nodes-base.httpRequest`)
**Evidence:** POSTs to the public, unauthenticated `https://ntfy.sh` topic `agent-outcome` (`authentication: none`), with a `click` field carrying the signed resume URL for the paused workflow (`http://0.0.0.0:5678/form-waiting/223?signature=...`).
**Why it matters:** ntfy.sh topics are public by default — anyone who knows or guesses the topic name `agent-outcome` can subscribe and read every notification, including the signed resume-form link for this and any other run using the same topic. The `0.0.0.0` host isn't externally routable from this dev environment today, but the pattern — a bare, guessable public topic carrying an authenticated action link — is the kind of thing that becomes exploitable the moment this n8n instance or topic name changes exposure (tunnel, port-forward, topic reuse in another deployment).
**Direction:** Needs a private/authenticated ntfy topic (ntfy supports access-controlled topics) or a notification channel that doesn't require the resume URL to be readable by any anonymous subscriber.

### Robustness & Failure Handling — Info

**Node:** workflow `settings` (both execution 215 and 216)
**Evidence:** Both the webhook wrapper and the inner pipeline have `errorWorkflow: "bmadErrNotify001"` configured (matches the "Error Handler (ntfy)" workflow in this instance).
**Why it matters:** This is the one piece of good hygiene worth calling out explicitly — real-world side-effecting nodes here (agent runs, file edits, git commits) do have a safety net wired for the failure case, even though this particular run never exercised it.

## Summary

| Severity | Count |
| --- | --- |
| Critical | 1 |
| High | 2 |
| Medium | 1 |
| Low | 0 |
| Info | 1 |

## Sub-Execution Tree

```
215 Develop Story (Webhook) [success, 870ms]
└─ Trigger develop story pipeline → 216 Develop Story [success, 6h42m19s]
   ├─ Implement story → E2E tests → 217 BMAD Session (OpenCode) [success, 14m21s]
   │  └─ Parse OpenCode Response → 218 [success] · BMAD Outcome → 219 [success]
   ├─ Implement story → Unit tests → 220 BMAD Session (OpenCode) [success, 5m18s]
   │  └─ Parse OpenCode Response → 221 [success] · BMAD Outcome → 222 [success]
   ├─ Merge1 → Review code → 223 BMAD Session (OpenCode) [success, 6h11m30s — includes the 6h01m26s stall]
   │  ├─ Parse OpenCode Response → 224 [success] · BMAD Outcome → 225 [success]  (iteration 1)
   │  ├─ Parse OpenCode Response → 226 [success] · BMAD Outcome → 227 [success]  (iteration 2)
   │  └─ Parse OpenCode Response → 228 [success] · BMAD Outcome → 229 [success]  (iteration 3, post-stall)
   ├─ Merge1 → Review tests → 230 BMAD Session (OpenCode) [success, 6m16s]
   │  └─ Parse OpenCode Response → 231 [success] · BMAD Outcome → 232 [success]
   └─ Merge1 → Review NFRs → 233 BMAD Session (OpenCode) [success, 4m52s]
      └─ Parse OpenCode Response → 234 [success] · BMAD Outcome → 235 [success]
```
