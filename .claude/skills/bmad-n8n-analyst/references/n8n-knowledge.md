# n8n Knowledge Base

Preloaded so you don't have to rediscover the data shape or node behavior from scratch on every run. Treat version-sensitive details as best-effort — degrade gracefully when a field you expect isn't there rather than asserting facts this document can't back up.

## Execution Data Shape

- `workflowData` — the workflow snapshot at run time: `.nodes[]` (`id`, `name`, `type`, `typeVersion`, `parameters`, `disabled`, `onError`/`continueOnFail`, `retryOnFail`, `notes`), `.connections`, `.settings` (`errorWorkflow`, `saveDataErrorExecution`, `executionTimeout`).
- `data.resultData.runData[nodeName]` — an array of run attempts for that node (loops and retries produce more than one entry). Each entry carries `startTime`, `executionTime` (ms), `executionStatus` (`success` | `error`), `error` (message/description), `data.main[][]` (arrays of `{json, binary}` items — the node's actual input/output payload), `source` (which upstream node/output-index fed it).
- `data.resultData.error` — a top-level error when the whole execution stopped outside any single node's own handling.
- `data.resultData.lastNodeExecuted` — the last node touched before the run stopped.
- Sub-execution linkage (Execute Workflow calls): a run-data entry for the calling node may carry a reference to the child execution's ID. The exact field name has moved around across n8n versions — check a few likely spots (`metadata.subExecution`, a direct `subExecution` key on the entry) and flag when you can't find one rather than guessing.

## Common Node Types & What Typically Goes Wrong

| Node type | Failure modes to watch for |
| --- | --- |
| HTTP Request | Timeouts, 4xx/5xx, rate-limiting (429), pagination bugs, no timeout or retry configured, secrets inlined instead of using the credentials store |
| Code / Function | An unhandled exception crashes the whole run; accidentally mutating `items` in place; hidden state carried across items |
| IF / Switch | Falling into an unintended branch when conditions aren't actually mutually exclusive; deeply nested IFs are a maintainability smell (Switch reads better) |
| Merge | Item-count mismatches between inputs silently drop or misalign data depending on merge mode |
| Split In Batches / Loop Over Items | Batch size mismatched to the downstream API's rate limit; loop state not reset; a "done" condition that never fires |
| Webhook | Slow synchronous work before responding blocks the caller — should acknowledge fast and offload heavy work to a sub-workflow |
| Execute Workflow | The parent/child boundary — check error propagation into the parent and whether the split is a genuine unit of work |
| Error Trigger | Its presence (or absence) is the workflow's actual safety net; check whether `settings.errorWorkflow` on the reviewed workflow really points at one |
| Set | Usually safe — flag only if it's doing real logic that belongs in Code, or a Code node is doing simple field mapping that Set would do more legibly |
| Wait | Sanity-check the duration against what it's actually waiting for; unnecessary waits are a performance smell |

## Best-Practice Checklist (community-sourced, a rubric aid — not gospel)

- Descriptive node names beat defaults, especially once there's more than one node of the same type.
- Attach an error workflow to anything with real-world side effects.
- Configure retry/`continueOnFail` deliberately, matched to the actual failure class — not left at defaults.
- Webhooks acknowledge fast; heavy work happens in a sub-workflow.
- Batch or paginate external calls instead of looping one item at a time when the API supports it.
- Prefer Switch over nested IF; prefer Set over Code for simple field mapping.
- No secrets in parameters or expressions — always the credentials store.
- Idempotency matters wherever a retry or re-run could double-fire a side effect.
- Trigger type should match the real driving event (webhook for real-time, schedule tuned to how often the source data actually changes).
- Sticky notes or `notes` fields on anything non-obvious.
