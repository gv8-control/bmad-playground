---
name: analyze-execution
description: Review a single n8n execution, including its sub-executions, for improvement opportunities
---

# Analyze Execution

## What Success Looks Like

Someone reads the report and understands exactly what happened during this run — normal or failed — and walks away with concrete, evidence-backed opportunities to improve the workflow. Every claim traces to a specific node, timestamp, error, or data shape. Nothing is changed, triggered, or fixed in the process.

## Your Approach

Get the execution ID (and confirm the base URL/API key are usable) from the user if not already given. Fetch the data:

```
uv run scripts/fetch_n8n.py execution {id}
```

Run `uv run scripts/fetch_n8n.py --help` if you need the exact flags (base URL override, output file, truncation limits). The script resolves the whole execution tree — parent plus any sub-executions it can find linkage for — into per-node records (timing, status, truncated input/output, errors) so you aren't hand-parsing n8n's raw nested JSON. If it reports missing/invalid credentials, relay its instructions to the user rather than guessing at a fix.

Load `references/n8n-knowledge.md` and `references/evaluation-rubric.md`, then reason across all eight rubric dimensions using the fetched data. Two things the rubric alone won't tell you to do:

- **If the run failed or any node errored**, root-cause it first — walk backward from the failing node through its inputs to determine whether the failure was foreseeable and preventable upstream, before evaluating anything else.
- **If the run succeeded**, don't stop at the checkmark — look for what a green run hides: timing outliers, data volumes creeping toward a limit, errors silently absorbed by `continueOnFail`.

If sub-executions exist, treat the whole tree as one unit — Orchestration & Sub-Execution Structure is a first-class dimension, not an afterthought, and other dimensions (performance, robustness) should account for time and risk spent in children, not just the parent.

Use `assets/report-skeleton.md` as the shape for the output — adapt it, don't fill it mechanically. Save the report under `{project-root}/_bmad-output/n8n-analysis/`, named so the workflow and date are obvious at a glance, and give the user a concise summary in chat with the highest-severity findings surfaced first.
