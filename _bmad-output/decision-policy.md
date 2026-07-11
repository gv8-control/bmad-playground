# Decision Policy (Autonomy Boundary)

**Version:** 1 — drafted 2026-07-03. Rules are ratified by the project owner; agents apply them but never edit this file.

This document defines which decisions agents make autonomously and which require human sign-off. Workflow steps that delegate decisions to agents reference this policy.

## How agents use this

1. A decision arises that you would otherwise ask the human about.
2. Find the first rule below that covers it. Covered → decide per the rule, record it (format below), continue working.
3. Not covered, or the rule says escalate → HALT and surface the question to the human.

Autonomy here means deciding **and taking responsibility for the record**. An unrecorded autonomous decision is a policy violation even if the choice was right.

## Rules

| ID | Situation | Decision |
| --- | --- | --- |
| DP-1 | **Ambiguous failure signal.** An error or state could mean several things (e.g. 403 vs 404, timeout vs rejection) and one interpretation leads to deleting or overwriting data. | Never take the destructive path on ambiguity. Surface an explicit error over reporting false success. |
| DP-2 | **Spec contradicts itself or the architecture** (task text vs acceptance criteria, story spec vs architecture.md, two artifacts disagree, etc.). | The higher-authority artifact wins — architecture over story spec, semantic intent over literal text. Amend the lower-authority artifact to match. |
| DP-3 | **All options are reversible, architecture-consistent, and functionally equivalent.** | Pick the simplest one (fewest moving parts, least new surface). Do not build flexibility for needs that don't exist yet. |
| DP-4 | **Test-only or artifact-only changes** (test structure, fixtures, doc wording, formatting) with no production behavior change. | Decide autonomously; record only if the choice constrains future work. |
| DP-5 | **Scope temptation.** A finding suggests work beyond the current task's acceptance criteria. | Defer, don't expand. Record it as a deferred finding in the work record, not as new scope. |

## Always escalate — no rule can cover these

- Weakening authentication, authorization, secrets handling, or input validation in any way.
- Irreversible or externally visible effects: deployments, calls to external services with side effects, migrations or deletions against real (non-test) data.
- Product tradeoffs: user-visible behavior or UX changes with no spec backing.
- Anything that increases recurring cost.
- Any decision no rule above covers.

## Autonomy by stage

The rules above resolve decisions by their *nature*. This table resolves them by *stage* — where the work is in the workflow.

| Stage | Autonomy |
| --- | --- |
| Within-task decisions | Autonomous per rules above; HALT on uncovered decisions |
| Workflow-progression decisions (stage transitions, completions, deployments) | Human |

A project may add rows for its own workflow stages and their stage-specific autonomy profile (e.g. a review stage with its own triage taxonomy). The two rows above are the minimum: they assert every stage has been considered, and they mark where autonomy ends at the workflow level.

## Decision record format

Where the work is documented (task file, review findings, dev notes, or the artifact being changed):

```
**Decision (DP-2):** Spec says "delete on failure" but ACs imply "mark failed" —
chose mark-failed (semantic intent: preserve data), amended spec to match.
```

## Changing this policy

Only the project owner adds, edits, or retires rules. The machine does not widen its own authority.
