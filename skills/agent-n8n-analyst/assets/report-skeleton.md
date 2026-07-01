# n8n {Execution|Workflow} Review — {workflow name}

**Target:** {execution ID or workflow ID} · **Mode:** {Execution | Workflow} · **Reviewed:** {date}
{Execution mode only: **Status:** success|error · **Duration:** {ms} · **Sub-executions:** {count}}

## Executive Summary

{2-4 sentences: what this run/workflow does, its overall health, and the single most important finding.}

## Findings

### {Dimension name} — {Critical|High|Medium|Low|Info}

**Node:** {node name} ({node type})
**Evidence:** {concrete data point — timing, error text, parameter value, data shape}
**Why it matters:** {impact}
**Direction:** {what a fix would need to address — not an implementation}

{repeat per finding, grouped or ordered however best serves the reader — most severe first is a reasonable default}

## Summary

| Severity | Count |
| --- | --- |
| Critical | {n} |
| High | {n} |
| Medium | {n} |
| Low | {n} |
| Info | {n} |

{Execution mode only, when sub-executions exist:}

## Sub-Execution Tree

{node name} → execution {id} ({status}, {duration}) → {child node name} → execution {id} ...
