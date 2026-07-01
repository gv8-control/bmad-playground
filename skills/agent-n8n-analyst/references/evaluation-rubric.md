# Evaluation Rubric

Eight lenses to reason through. Not every lens applies to every review — Execution mode can use all eight; Workflow mode has no run data, so Performance and Failure Root-Cause Diagnosis don't apply (note the gap explicitly rather than guessing at numbers that don't exist). Not every lens will surface a finding every time — an empty lens is a valid outcome, not a sign you didn't look hard enough.

Every finding needs: the specific node, the concrete evidence (a number, an error string, a parameter value, a data shape), why it matters, and a severity. No finding without a receipt.

**Severity:** Critical (data loss, silent failure, or security exposure) · High (breaks correctness or reliability under realistic conditions) · Medium (real but bounded risk or inefficiency) · Low (style/maintainability) · Info (worth noting, not a problem).

## 1. Correctness & Data Integrity
Did each node receive and produce the shape of data the rest of the workflow assumes? Silent type coercion, empty-array vs. single-item ambiguity, expressions resolving to `undefined`/`null`, item-count mismatches across a Merge or loop boundary, off-by-one pagination.

## 2. Performance & Efficiency (execution mode only)
Look at the full per-node duration profile, not just total time — find the actual bottleneck, not just "it was slow." N+1 call patterns inside loops, oversized payloads or binary data, unnecessary Wait nodes, sequential calls that could run in parallel branches, batch size versus what the external system can actually handle, throughput per node.

## 3. Robustness & Failure Handling
How the workflow behaves when something goes wrong — by design or by accident. `continueOnFail` silently swallowing errors that should stop the run, retry configured for a failure class that will never succeed on retry (or missing for one that would), no attached error workflow, no timeout on external calls, non-idempotent side effects that would double-fire on a retry.

## 4. Failure Root-Cause Diagnosis (execution mode only, when the run failed or a node errored)
Walk backward from the failing node: was the failure this node's own logic, or was it fed input an upstream node should have caught? Classify it (auth/credential, timeout, rate-limit, data-shape/expression error, external-service error, logic bug) and say whether it was foreseeable from data already present earlier in the run.

## 5. Security & Credential Hygiene
Secrets or tokens inlined in parameters/expressions instead of the credentials store, webhook nodes with no authentication, sensitive data (PII, tokens) flowing into node outputs or logs with no reason to be there, overly broad file-system or credential access.

## 6. Maintainability & Semantic Clarity
Default/generic node names on nodes doing meaningfully different things, no documentation on a non-trivial workflow, disabled or orphaned nodes left in place, expressions complex enough that they should be a Code node — or a Code node doing what Set/Filter would do more legibly.

## 7. Best-Practice & Intent Alignment
Infer what the workflow is actually trying to accomplish from its name, trigger, and overall shape — then judge whether the design honestly delivers that intent. A workflow named "Sync Orders to CRM" that silently drops failed orders isn't really syncing anything. Cross-check against `./n8n-knowledge.md`'s best-practice checklist: trigger type matching the real event, Switch over nested IF, fast webhook acknowledgment, batched external calls, and so on.

## 8. Orchestration & Sub-Execution Structure (execution mode only, when sub-executions exist)
Is the parent/child decomposition a genuine reusable unit of work, or an arbitrary split? Does a child's error propagate and get handled by the parent, or does it vanish? Roll up the whole tree: total nodes executed, total wall-clock time, where time is actually spent across parent versus children.
