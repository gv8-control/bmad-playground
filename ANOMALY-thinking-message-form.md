# Anomaly: "Action Needed" form shows a 1-line thinking message with no question

> Throwaway note, 2026-07-03. Status: **located and explained at the "what" level; "why" needs the
> OpenCode transcript.** Hand this file to Claude as context if it happens again.

## What Marius saw

During the Epic 2 / story 2.1 run (2026-07-03, ~02:43 UTC): opened an n8n "Action Needed" form and
found a single line of agent self-narration, no question. Later searched execution **276 (Code
review)** `Get response` run 0 for it and could not find it — that form's recorded input is the long
review-context summary ending in a real `[Y]/[N]` question.

## Where it actually was

Execution **268 — Unit tests (2.1)** (not Code review), `Agent MD to HTML` / `Get response` run 0.
Exact content: `Let me check the imports in `credential-health.ts` to plan my mock strategy for the
lib spec.` OpenCode session: `ses_0da2e6811ffeWvwsBmflxsxtDp` ("Unit tests (2.1)").

Timeline (UTC):
- 02:31:59 initial `opencode run` (bmad-testarch-automate), turn ends after 587s **mid-work** with
  the narration line above as its final text part — no question, no completion.
- 02:41:47 `BMAD Outcome` classifies it `QUESTION` → ntfy "Unit tests (2.1) - Action Needed".
- 02:43:48 Marius answers `?` — the follow-up run resumes, works 23 more minutes, completes.
- 03:06:28 step ends `success`; journal shows only that. The stall is invisible in gen-2 metrics.

## Root cause chain

1. **Agent (origin):** glm-5.2 ended its assistant turn with thinking-out-loud text instead of
   continuing tool work — premature turn end. *Why* it stopped there is not answerable from n8n
   data; the session transcript (reasoning parts before the stop) would show it.
2. **Pipeline (amplifier):** `BMAD Outcome` has only two buckets (`COMPLETE`/`QUESTION`). A
   non-complete, non-question turn end is forced into `QUESTION`, producing a human escalation
   with nothing to answer. Any "continue"-ish reply (even `?`) un-sticks it.
3. **Findability (confusion):** the form/notification doesn't state step or session; with several
   "Action Needed" pushes stacked, memory attributed it to Code review, and the search targeted
   the wrong execution.

## If it recurs — capture this

- The **form URL** (contains the execution id) and the **exact ntfy notification title**.
- Don't answer immediately if you can spare the stall; say the execution id to Claude live.
- To re-find after the fact: sweep `Agent MD to HTML` outputs across recent `BMAD Session
  (OpenCode)` executions in the n8n DB and look for short (<400 char) form bodies. Claude has the
  decode recipe (execution_data is a pointer-pool JSON; numeric strings are pool indexes).

## Remediation candidates (not implemented)

- Third outcome class `INCOMPLETE` in `BMAD Outcome`: auto-reply "continue" up to N times before
  escalating to a human — turns this whole class into self-healing instead of a bogus form.
- Include step label + session id in the ntfy message and form title (currently only the
  conversation title makes it into the notification, and nothing into the form body).
- The step-trace digest from `PLAN-self-eval-trace-source.md` would have made this a one-command
  lookup (turn-end reason + session id per step).
