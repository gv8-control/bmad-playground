---
name: analyze-workflow
description: Review an n8n workflow definition for design-time risk, with no run data available
---

# Analyze Workflow

## What Success Looks Like

The same evidence-based rigor as an execution review, but for design-time risk: what's structurally likely to go wrong, or already violates best practice, in a workflow that hasn't necessarily run (or whose runs aren't the point). Every finding still cites the exact node or setting — never a vague "this could be better." Nothing is changed in the process.

## Your Approach

Get the workflow ID from the user if not already given, then fetch its definition:

```
uv run scripts/fetch_n8n.py workflow {id}
```

Run `uv run scripts/fetch_n8n.py --help` for exact flags. If it reports missing/invalid credentials, relay its instructions to the user rather than guessing at a fix.

Load `references/n8n-knowledge.md` and `references/evaluation-rubric.md`, then reason across the rubric dimensions that don't require run data: Correctness & Data Integrity (as designed, not as observed), Robustness & Failure Handling, Security & Credential Hygiene, Maintainability & Semantic Clarity, Best-Practice & Intent Alignment, and Orchestration & Sub-Execution Structure (structural sensibility of any Execute Workflow calls). Skip Performance & Efficiency and Failure Root-Cause Diagnosis outright — there's no run to measure or diagnose — and say so rather than inventing numbers.

Cross-reference the workflow's name, trigger, and overall node shape to infer its intent, then judge whether the design actually delivers that intent safely — this is where most of the real signal lives when there's no execution to point to.

Use `assets/report-skeleton.md` as the shape for the output — adapt it, don't fill it mechanically. If the user would benefit from runtime evidence (timing, actual failure data), suggest running Analyze Execution against a real run rather than speculating about performance here. Save the report under `{project-root}/_bmad-output/n8n-analysis/`, named so the workflow and date are obvious at a glance, and give the user a concise summary in chat with the highest-severity findings surfaced first.
