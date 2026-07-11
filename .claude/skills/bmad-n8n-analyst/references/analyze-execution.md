---
name: analyze-execution
description: Review a single n8n execution, including its sub-executions, for improvement opportunities
---

# Analyze Execution

## What Success Looks Like

Someone reads the report and understands exactly what happened during this run — normal or failed — and walks away with concrete, evidence-backed opportunities to improve the workflow. Every claim traces to a specific node, timestamp, error, or data shape. Nothing is changed, triggered, or fixed in the process.

## Your Approach

Get the execution ID from the user if not already given. Retrieve the execution data — including full run data — using whatever access method is available in your environment. You need per-node run data: timing, status, errors, input/output items, and the workflow definition (node types, parameters, settings). If sub-executions exist, retrieve those too, treating the whole tree as one unit.

If you can't get the data you need, tell the user what's missing rather than guessing.

Load `references/n8n-knowledge.md` and `references/evaluation-rubric.md`, then reason across all eight rubric dimensions using the fetched data. Two things the rubric alone won't tell you to do:

- **If the run failed or any node errored**, root-cause it first — walk backward from the failing node through its inputs to determine whether the failure was foreseeable and preventable upstream, before evaluating anything else.
- **If the run succeeded**, don't stop at the checkmark — look for what a green run hides: timing outliers, data volumes creeping toward a limit, errors silently absorbed by `continueOnFail`.

If sub-executions exist, treat the whole tree as one unit — Orchestration & Sub-Execution Structure is a first-class dimension, not an afterthought, and other dimensions (performance, robustness) should account for time and risk spent in children, not just the parent.

Use `assets/report-skeleton.md` as the shape for the output — adapt it, don't fill it mechanically. Save the report under `{project-root}/_bmad-output/n8n-analysis/`, named so the workflow and date are obvious at a glance, and give the user a concise summary in chat with the highest-severity findings surfaced first.
