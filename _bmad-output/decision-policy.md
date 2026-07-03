# Decision Policy (Autonomy Boundary)

**Version:** 1 — drafted 2026-07-03. Rules are ratified by the project owner; agents apply them but never edit this file.

This document defines which decisions pipeline agents make autonomously and which require human sign-off. Playbook step prompts reference it; it applies to any BMAD skill run, inside or outside the n8n pipeline.

## How agents use this

1. A decision arises that you would otherwise ask the human about.
2. Find the first rule below that covers it. Covered → decide per the rule, record it (format below), continue working.
3. Not covered, or the rule says escalate → HALT with the question, as usual.

Autonomy here means deciding **and taking responsibility for the record**. An unrecorded autonomous decision is a policy violation even if the choice was right.

## Rules

| ID | Situation | Decision |
| --- | --- | --- |
| DP-1 | **Ambiguous failure signal.** An error or state could mean several things (e.g. 403 vs 404, timeout vs rejection) and one interpretation leads to deleting or overwriting data. | Never take the destructive path on ambiguity. Surface an explicit error over reporting false success. |
| DP-2 | **Spec contradicts itself** (task text vs semantics note, story vs architecture, etc.). | Follow the semantic intent over the literal text, then amend the spec artifact so the contradiction is resolved on record. |
| DP-3 | **All options are reversible, architecture-consistent, and functionally equivalent.** | Pick the simplest one (fewest moving parts, least new surface). Do not build flexibility for needs that don't exist yet. |
| DP-4 | **Test-only or artifact-only changes** (test structure, fixtures, doc wording, formatting) with no production behavior change. | Decide autonomously; record only if the choice constrains future work. |
| DP-5 | **Scope temptation.** A finding suggests work beyond the story's acceptance criteria. | Defer, don't expand. Record it as a deferred finding in the story file (or `deferred-work.md`), not as new scope. |

## Always escalate — no rule can cover these

- Weakening authentication, authorization, secrets handling, or input validation in any way.
- Irreversible or externally visible effects: deployments, calls to external services with side effects, migrations or deletions against real (non-test) data.
- Product tradeoffs: user-visible behavior or UX changes with no spec backing.
- Anything that increases recurring cost.
- Any decision no rule above covers.

## Decision record format

Where the work is documented (story file review findings, dev notes, or the artifact being changed):

```
**Decision (DP-2):** Task 4.6 vs Status Semantics conflict on `status` in upsert —
chose omit-and-amend: update omits `status`, Task 4.6 amended to match. Intent over literal text.
```

## Changing this policy

Only the project owner adds, edits, or retires rules. The pipeline's reflection step may **propose** rule candidates when it sees the same decision class recur — as ledger observations with fingerprint prefix `decision-policy-candidate-` — but a candidate becomes a rule only by human edit here. The machine does not widen its own authority.

## Decision points map

| Decision point | Autonomy |
| --- | --- |
| Story creation & validation | Autonomous within rules; HALT on uncovered decisions |
| Implementation | Autonomous within rules; HALT on uncovered decisions |
| Code review findings | `patch`/`defer`/`noise` triage autonomous; `decision-needed` resolved via rules, HALT if uncovered |
| Story status transitions | Managed by skills (sprint-status.yaml) autonomously |
| Epic completion & retrospective | Human: epic marked done manually; loop ends at epic boundary |
| Deployment | Not automated; always human |
