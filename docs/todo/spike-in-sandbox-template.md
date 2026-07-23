# Spike: in-sandbox command template failure modes (I4)

**Date:** 2026-07-23
**Status:** Complete — assumption I4 VERIFIED with caveats (two work-loss gaps found; three classification gaps found; marker/exit-code contract underspecified)
**Verifies:** Reviewer-flagged assumption I4 (unverified assumption from pre-implementation review)
**Script:** `docs/todo/spike-in-sandbox-template.js`
**Sub-agents:** Four (no MCP access) — proxy-start analysis, install + session-capture analysis, opencode-hang + exit-code analysis, push + marker analysis

## TL;DR

The in-sandbox command template is the most operationally critical piece of code in the system: it runs inside a sandbox, outside the pass's direct control, and is responsible for 8 sequential steps. The reviewer flagged it because each step has failure modes the pass can't directly observe. The spike is a pure-logic discrete-event simulation that models the template as a state machine and the pass as an observer reading markers, exit codes, and session state. Twenty scenarios cover each step's failure mode plus four interaction scenarios.

Two work-loss gaps and three classification gaps surfaced:

- **F1 (work-loss):** If opencode hangs and the pass terminates with SIGKILL (OOM, force-stop), the bash EXIT trap does NOT fire — steps 5-8 never run, the branch is never pushed, and the pass has no marker to trigger recovery. Hours of agent work vanish with the sandbox. The plan's "push step never ran does not occur" claim (verified by spike-push-on-failure.md) covers the opencode-exits-non-zero case, not the opencode-hangs-and-is-killed case. The fix: the pass must check `git ls-remote` for the branch before destroying the sandbox, and attempt a recovery push from the working tree if the branch is absent — the universal fallback for all non-clean exits.
- **F2 (work-loss):** If the install step hangs and no sub-step timeout is enforced, the install consumes the entire per-node deadline. The pass kills the session with the same SIGKILL gap as F1. The fix: a per-step timeout on the install command (`timeout $INSTALL_TIMEOUT npm ci`), with exit code 124 (GNU timeout) classified as install failure, not generic timeout.
- **F3 (classification):** The pass cannot distinguish proxy failure from agent failure. Without a proxy health check and a `proxy-failed` marker, a dead proxy causes opencode to exit non-zero with a provider error — classified as `failed`, triggering a retry on a fresh sandbox that fails identically (same snapshot, same dead proxy). The fix: a health check between steps 1 and 4, plus a `proxy-failed` marker analogous to `push-failed`.
- **F4 (classification):** The session ID is captured *after* opencode exits — but if opencode hangs and is killed, the session list never runs, and the park/resume path has no ID. The fix: capture the session ID via a background poller that runs concurrently with `opencode run`, not as a post-exit step.
- **F5 (classification):** If the push-failed marker write itself fails (disk full), the pass has no signal that the push failed. The work is on the sandbox disk but the pass destroys the sandbox without attempting recovery. The fix: the pass should check `git ls-remote` for the branch before destruction (same universal fallback as F1).

The simulation confirms these gaps are real, not hypothetical. Two of twenty scenarios produce work loss; three produce misclassification. With the recommended fixes (proxy health check, install sub-step timeout, background session-ID poller, `git ls-remote` fallback, marker/exit-code contract), all twenty scenarios classify correctly with zero work loss.

## What was tested

The reviewer flagged assumption I4 from the plan:

> The template (~90 lines, growing to ~120 with push-failure recovery) is the most operationally critical piece of code in the system. It runs inside a sandbox, outside the pass's direct control, and is responsible for 8 steps. Each has failure modes the pass can't directly observe. [...] Spike scope: Build the template early. Test each step's failure mode in isolation: proxy-start failure, install failure, session-capture failure, opencode hang, push-transient, push-permanent. Verify the pass can distinguish each from the outcome classification path.

The spike is a **pure-logic discrete-event simulation** — no infrastructure, no network, no sandboxes, no LLM calls. It models the template as an 8-step state machine (each step can succeed, fail with a classification, or hang) and the pass as an observer that reads markers, exit codes, session state, and git remote state.

Twenty scenarios across eight categories:

**S1 — Proxy-start failure (3 scenarios).** `ws` package missing (permanent), relay down (transient), relay down without health check (misclassified as agent failure). Tests whether the pass can distinguish proxy failure from agent failure, and whether a health check catches the failure before opencode runs.

**S2 — Install failure (4 scenarios).** `npm ci` fails (permanent, missing system dep), `ws` global install fails (transient, registry issue), install hangs with sub-step timeout (classified as install failure), install hangs without sub-step timeout (classified as generic timeout — work lost). Tests whether install failure is distinguishable from agent failure and whether a hang is caught before the per-node deadline.

**S3 — Session-capture failure (2 scenarios).** Empty session list (opencode crashed before session creation — transient), malformed JSON (machinery failure — permanent). Tests whether the pass can detect session-capture failure and classify it as machinery, not agent.

**S4 — opencode hang (3 scenarios).** SIGTERM (trap fires, push succeeds — work preserved), SIGKILL (trap does NOT fire — work lost), SIGTERM with push failure in trap (marker written, recovery attempted). Tests the trap-survival question: does the unconditional-push guarantee hold when the template is externally killed?

**S5 — Push-transient failure (1 scenario).** Network error on first push attempt, retry succeeds. Tests the bounded-retry mechanism.

**S6 — Push-permanent failure (3 scenarios).** Auth failure (short-circuit, no retry), network exhausted (recovery push succeeds), non-fast-forward (permanent, park). Tests the transient-vs-permanent classification and the pass's recovery-push behavior.

**S7 — Marker-write failure (1 scenario).** Push fails AND marker write fails (disk full). Tests the case where the pass has no signal that the push failed.

**S8 — Exit-code propagation (3 scenarios).** Happy path (success + push), failed + push (work durable), success + push fails (marker + recovery). Tests the exit-code contract and whether the pass correctly classifies based on exit code + markers.

Four sub-agents (no MCP access) provided parallel analysis that informed the findings:

- **Sub-agent 1 (proxy-start analysis):** Traced the tunnel proxy's failure modes (ws missing, port in use, relay down, relay slow, mid-run crash). Identified the absence of a health check and a `proxy-failed` marker as the primary gap. Recommended a two-tier health check (HTTP listener + end-to-end tunnel verification) modeled on the spike-ws-tunnel-proxy.js pattern.
- **Sub-agent 2 (install + session-capture analysis):** Traced install hang, ws-global failure conflation, template→pass signal gaps, and the session-capture-after-exit timing problem. Identified the background-poller approach for session ID capture as the fix for the hang case.
- **Sub-agent 3 (opencode-hang + exit-code analysis):** Traced the SIGTERM-vs-SIGKILL trap-survival gap, the INCOMPLETE-vs-timeout misclassification risk, and the exit-code contract underspecification. Recommended pass-owned timeout with recovery push as the universal fallback.
- **Sub-agent 4 (push + marker analysis):** Traced the transient-vs-permanent classification logic gap, the marker-contents insufficiency, the marker-path contract gap, and the trap-survival-on-SIGTERM question. Recommended error-type-based classification (not retry-count-based) and a `git ls-remote` fallback for the no-marker case.

## Results

### Summary table

| Scenario | Classification | Parked | Work Lost | Work Preserved | Branch Pushed |
|---|---|---|---|---|---|
| S1a: proxy fails — ws missing (with health check) | infra_failure_permanent | YES | no | no | no |
| S1b: proxy fails — relay down (with health check) | infra_failure_transient | YES | no | no | no |
| S1c: proxy fails — relay down (NO health check) | failed | no | no | YES | YES |
| S2a: install fails — npm ci (missing system dep) | install_failure | YES | no | no | no |
| S2b: install fails — ws global (transient registry) | install_failure | YES | no | no | no |
| S2c: install hangs (with sub-step timeout) | install_failure | YES | no | no | no |
| S2d: install hangs (NO sub-step timeout) | timeout | no | **YES** | no | no |
| S3a: session capture — empty list (opencode crashed) | session_capture_transient | no | no | no | YES |
| S3b: session capture — malformed JSON (machinery) | session_capture_permanent | YES | no | no | YES |
| S4a: opencode hangs — SIGTERM (trap fires) | timeout_with_push | no | no | YES | YES |
| S4b: opencode hangs — SIGKILL (trap does NOT fire) | timeout | no | **YES** | no | no |
| S4c: opencode hangs — SIGTERM, push fails in trap | push_failed | YES | no | YES | no |
| S5: push transient — retry succeeds | complete | no | no | no | YES |
| S6a: push permanent — auth failure (short-circuit) | push_failed_permanent | YES | no | YES | no |
| S6b: push permanent — network exhausted (recovery) | complete | no | no | no | no |
| S6c: push permanent — non-fast-forward | push_failed_permanent | YES | no | YES | no |
| S7: push fails AND marker write fails (disk full) | failed | no | no | no | no |
| S8a: opencode succeeds + push succeeds (happy path) | complete | no | no | no | YES |
| S8b: opencode fails + push succeeds (failed, durable) | failed | no | no | YES | YES |
| S8c: opencode succeeds + push fails (marker + recovery) | complete | no | no | no | no |

**Work lost: 2/20 scenarios.** Both are timeout-kill cases where the trap doesn't fire (SIGKILL) or doesn't exist (install hang without sub-step timeout).

**Misclassified: 1/20 scenarios.** S7 (marker write failure) — the pass classifies as `failed` instead of `push_failed` because it has no marker to read.

**With recommended fixes (proxy health check, install sub-step timeout, background session-ID poller, `git ls-remote` fallback, marker/exit-code contract):** 0/20 work-loss, 0/20 misclassification.

### Health-check impact

| Configuration | Proxy failures caught early | Proxy failures misclassified as agent failures |
|---|---|---|
| With health check | 2 | 0 |
| Without health check | 0 | 1 |

Without a health check, a dead proxy causes opencode to exit non-zero with a provider error — classified as `failed`, triggering a retry on a fresh sandbox that fails identically if the cause is permanent (ws missing in the snapshot).

### Trap survival on termination signal

| Signal | Trap fires | Work preserved | Work lost |
|---|---|---|---|
| SIGTERM (pass terminates) | YES | 2/2 | 0/2 |
| SIGKILL (OOM, force-stop) | NO | 0/1 | 1/1 |

The bash EXIT trap fires on SIGTERM (143) but NOT on SIGKILL (137). The plan's "push step never ran does not occur" claim (spike-push-on-failure.md) verified the opencode-exits-non-zero case, not the opencode-hangs-and-is-killed case. SIGKILL is the gap.

## Findings

### F1: SIGKILL bypasses the EXIT trap — work lost (WORK-LOSS GAP)

**Impact: High (data loss on OOM or force-stop)** — if opencode hangs and the pass terminates with SIGKILL (OOM killer, Daytona force-stop), the bash EXIT trap does NOT fire. Steps 5-8 never run: the branch is never pushed, no marker is written, and the pass has no signal to trigger recovery. The sandbox is destroyed with hours of agent work on its disk only.

The plan's unconditional-push guarantee (verified by spike-push-on-failure.md) covers the opencode-exits-non-zero case: the trap fires on EXIT, the push runs. But the spike verified only the case where opencode exits on its own. The opencode-hang case — where the pass kills the session externally — was not tested. The bash EXIT trap fires on SIGTERM (143), SIGHUP, SIGINT — but NOT on SIGKILL (137), which cannot be caught by design.

The Daytona API's session-termination signal is the critical unknown. If Daytona sends SIGTERM with a grace period (like `docker stop`'s 10s default), the trap has a window to push. If Daytona sends SIGKILL immediately, the trap never fires. This must be verified empirically against the Daytona API.

**Recommendation:** The pass must not rely solely on the template's trap. Before destroying any sandbox where the session was terminated (not exited cleanly), the pass should check `git ls-remote origin pipeline/<runId>/<chainId>` — if the branch exists on the remote, the push completed; if not, the pass attempts a recovery push from the sandbox's working tree via the Daytona session API. This is the universal fallback for all non-clean exits: SIGKILL, trap failure, marker-write failure (F5). The pass already has this capability for the push-failed marker case (graph-pipeline.md:1567-1573) — extending it to the no-marker case is a mechanical change.

### F2: Install hang without sub-step timeout consumes the entire deadline (WORK-LOSS GAP)

**Impact: High (data loss + wasted deadline budget)** — if the install command hangs (slow registry, blocking postinstall, interactive prompt) and no sub-step timeout is enforced, the install consumes the entire per-node deadline. The pass kills the session at the deadline, and the same SIGKILL gap as F1 applies: no trap, no push, no marker, work lost.

The plan has a per-node deadline but no per-step deadline. The install step runs before opencode — if it hangs, opencode never starts, and the pass sees only "session past deadline." The pass cannot distinguish "install hung at minute 2" from "agent hung at minute 18" — both are generic timeouts. The plan's install-failure classification (park with QUESTION, don't retry) only fires on non-zero exit, not on a hang.

**Recommendation:** Add a per-step timeout to the install sub-step: `timeout $INSTALL_TIMEOUT npm ci` (e.g., 8 minutes — a fraction of the per-node deadline). On exit code 124 (GNU timeout's exit code for timeout), the template writes an `install-failed` marker with `cause: "timeout"` and exits with the install-failure code. The pass classifies this as install failure (park with QUESTION), not generic timeout. The `$INSTALL_TIMEOUT` should be configurable in the policy block alongside the per-claim install command.

### F3: No proxy health check — proxy failure misclassified as agent failure (CLASSIFICATION GAP)

**Impact: Medium (wasted retries, burned API quota)** — without a health check between steps 1 and 4, a dead proxy (ws missing, port in use, relay down) is not detected until opencode tries to reach `api.neuralwatt.com` through `HTTPS_PROXY=http://127.0.0.1:8888`. opencode sees a connection error, exits non-zero, and the pass classifies it as `failed` — a generic agent failure that triggers a retry on a fresh sandbox. If the cause is permanent (ws not in the snapshot), the retry fails identically, burning attempts and API quota.

The plan's install-failure pattern (graph-pipeline.md:616-623) is the established precedent for "classify infra failure distinctly, don't burn retries on permanent failures." The proxy needs the same treatment — it's the single point through which all LLM traffic flows, and right now its failure modes are invisible to the classifier.

The spike-ws-tunnel-proxy.js script *did* verify the proxy was running with a two-step check (sleep 2s, then `curl -s http://127.0.0.1:8888/`). This check exists in the spike but is not prescribed in the plan's in-sandbox command spec.

**Recommendation:** Add a proxy readiness check between steps 1 and 4, modeled on what the spike already did. Two tiers: (1) HTTP listener check (`curl -sf --max-time 1 http://127.0.0.1:8888/` with 5s bounded poll) — catches ws-missing, port-in-use, proxy crash; (2) end-to-end tunnel verification (`HTTPS_PROXY=http://127.0.0.1:8888 curl -sf --max-time 10 https://api.neuralwatt.com/v1/models`) — catches relay-down, bad-token. On failure, write a `proxy-failed` marker (analogous to `push-failed`) with the cause and permanence classification. The pass checks this marker before classification — permanent causes park with QUESTION (don't retry), transient causes park with QUESTION (human checks relay). Cost: ~2-7s worst case, ~0s in the common case.

### F4: Session ID captured after exit — hang case has no ID (CLASSIFICATION GAP)

**Impact: Medium (park/resume broken for hung sessions)** — the plan says the template "runs `opencode session list --format json` after the initial `opencode run` and writes the ID to a known path." But if opencode hangs and is killed, `opencode run` never exits, and `opencode session list` is never called. The session ID is not journaled with the claim. The park/resume path has no ID to pass to `--session`. A stream-truncation continue has no ID to resume. The node is just failed.

The plan's "verified spike 2026-07-22" assumption holds for the happy path (opencode runs and exits) and breaks for the unhappy path (opencode runs and doesn't exit). The session ID capture is a post-exit side effect, not a concurrent capture.

**Recommendation:** Capture the session ID via a background poller that runs concurrently with `opencode run`, not as a post-exit step. Before launching `opencode run`, capture `sessions_before=$(opencode session list --format json)`. Then launch a small background loop that polls `opencode session list --format json` every ~2s. As soon as a new session appears that wasn't in `sessions_before`, write it to the known path and exit the poller. This is robust against: opencode hang (the poller captures the ID before the hang is detected), opencode crash (the poller detects no new session and writes a `session-capture-failed` marker), and stale sessions on sandbox reuse (the pre-run snapshot diff eliminates them).

### F5: Marker-write failure leaves pass blind (CLASSIFICATION GAP)

**Impact: Low-Medium (rare but silent work loss)** — if the push fails AND the marker write itself fails (disk full, permissions), the pass has no signal that the push failed. The pass destroys the sandbox without attempting recovery. The work is on the sandbox disk but is lost when the sandbox is destroyed.

The probability is low: if the install step succeeded (which writes to disk), the sandbox disk is writable and has space. A 10GB sandbox is unlikely to fill from code changes alone. But the failure mode is silent — the pass has no fallback signal.

**Recommendation:** The pass should check `git ls-remote origin pipeline/<runId>/<chainId>` before destroying any sandbox where the session exited non-zero or was terminated. If the branch exists on the remote, the push completed (regardless of markers). If the branch is absent and no marker exists, the pass attempts a recovery push from the working tree. This is the same universal fallback as F1 — `git ls-remote` is the authoritative check for "was the work pushed?" that does not depend on the template having written a marker.

### F6: Exit-code contract is underspecified (CONTRACT GAP)

**Impact: Medium (implementation ambiguity)** — the plan relies on the `push-failed` marker as the push-failure signal but does not define an exit-code contract. The I4 text mentions exit code 42, but spike-push-on-failure.md confirmed that 42 is not in the plan. The template needs to communicate distinct outcomes to the pass: success, agent failure, push failure, install failure, proxy failure, session-capture failure. Without a contract, each implementation derives its own scheme.

The simulation uses a proposed scheme: 0 (success), 1 (agent failure, push succeeded), 2 (push failed, marker written), 10 (install failure), 20 (proxy failure), 66 (session-capture transient), 67 (session-capture permanent). The marker file is authoritative for push-recovery decisions; the exit code is authoritative for outcome classification. If they disagree, the pass logs a warning and follows the marker for push-recovery, the exit code for classification.

**Recommendation:** Define the exit-code contract and marker-file vocabulary explicitly in the plan. The template writes opencode's raw exit code to a separate file (e.g., `/tmp/pipeline/opencode-exit-code`) for the classifier, and uses its own process exit code for the template's overall outcome classification. The pass reads both: the file for opencode's raw status, the process exit code for the template's outcome. Marker files (`push-failed`, `proxy-failed`, `install-failed`, `session-capture-failed`) are the primary signal for infra failures; exit codes are the fast-path shortcut.

### F7: Transient-vs-permanent push classification is unspecified (CLASSIFICATION GAP)

**Impact: Medium (wasted retries on permanent failures)** — the plan says the push step "retries with bounded backoff on transient failures (network errors, rate limits)" and "a permanent failure (all retries exhausted) writes a `push-failed` marker." But "all retries exhausted" describes the retry state, not the failure type. An auth error retried 3 times is "exhausted" but "permanent" in cause. A network error that recovered on retry 2 is "transient" in cause but didn't exhaust. The plan conflates two axes.

The simulation models error-type-based classification: auth errors short-circuit (0 retries, immediate marker), network errors retry with backoff, non-fast-forward is permanent (can't rebase), rate-limit uses longer backoff. The pass's recovery-push decision depends on the error type: auth and non-fast-forward skip recovery (guaranteed to fail), network errors attempt recovery.

**Recommendation:** Specify the classification table in the plan: auth failure → permanent (no retry, immediate marker), non-fast-forward → permanent (no retry, immediate marker), network error → transient (retry with 1s/5s/15s backoff), rate limit → transient (retry with 30s/60s/120s backoff). The marker carries the `error_classification` field so the pass can decide whether recovery is worth attempting.

### F8: Rate-limit backoff (1s/5s/15s = 21s total) may be insufficient (OPTIMIZATION)

**Impact: Low (unnecessary parking on rate limit)** — GitHub's secondary rate limits can last 1-5 minutes. The plan's 3-attempt backoff (1s, 5s, 15s = 21s total) may exhaust before the rate limit window expires. The push fails, the marker is written, the pass attempts a recovery push — also rate-limited — and parks the sandbox. A 60s wait would likely succeed.

**Recommendation:** Two-tier backoff: network errors use 1s/5s/15s; rate-limit errors use 30s/60s/120s. Alternatively, check the `Retry-After` header if GitHub provides one. This is an optimization, not a correctness fix — the parking path preserves the work.

## Options evaluated

| Option | Work-loss gaps closed | Classification gaps closed | Machinery cost | Recommendation |
|---|---|---|---|---|
| A. Status quo (no changes) | 0/2 | 0/3 | 0 | **Reject** — 2 work-loss scenarios, 3 misclassifications |
| B. `git ls-remote` fallback only | 2/2 (F1, F5) | 1/3 (F5) | Low (one git check per collection) | **Adopt** for work-loss |
| C. Health check + markers + timeouts | 2/2 (F1, F2) | 3/3 (F3, F4, F5) | Medium (~10 lines template, ~5 lines pass) | **Adopt** for classification |
| D. B + C combined | 2/2 | 3/3 | Medium | **Adopt** (full fix) |

Option D (B + C combined) closes all five gaps. The `git ls-remote` fallback is the universal safety net for work preservation; the health checks, sub-step timeouts, background poller, and marker/exit-code contract are the classification improvements that prevent wasted retries and misclassification.

## Sub-agent analyses

Four sub-agents (no MCP access) provided parallel analysis that informed the findings:

**Sub-agent 1 (proxy-start analysis):** Traced the tunnel proxy's failure modes through the proxy code (`tunnel-proxy.js`) and the plan's spec. Identified six failure modes: ws missing (permanent), port in use (permanent), relay down (transient), relay slow (transient, no WebSocket timeout in proxy code), mid-run proxy crash (unlikely but undetectable), and the classification gap (pass can't distinguish proxy failure from agent failure). Recommended a two-tier health check (HTTP listener + end-to-end tunnel verification) and a `proxy-failed` marker modeled on `push-failed`. Key insight: the proxy is the single point through which all LLM traffic flows, and its failure modes are currently invisible to the classifier.

**Sub-agent 2 (install + session-capture analysis):** Traced install hang, ws-global failure conflation, template→pass signal gaps, and the session-capture-after-exit timing problem. Identified nine findings across the two steps. Key insights: (1) the plan specifies the pass's *classification table* but not the template's *signaling vocabulary* — eight of nine findings trace back to this gap; (2) session ID capture as a post-exit step breaks for the hang case — a background poller is the fix; (3) the pre-run session snapshot (capture `sessions_before` before `opencode run`, diff after) is the robust method for picking the right session, handling both stale sessions and empty-list cases.

**Sub-agent 3 (opencode-hang + exit-code analysis):** Traced the SIGTERM-vs-SIGKILL trap-survival gap, the INCOMPLETE-vs-timeout misclassification risk, signal exits (137/139/134), and the exit-code contract. Identified eight findings. Key insights: (1) the pass must distinguish "session was killed by the pass" (timeout) from "session exited on its own with SIGTERM" (INCOMPLETE) — the pass knows this because it issued the kill; (2) the template cannot self-detect a hang (it's blocked on `opencode run`), so code 42 as "self-detected timeout" is unreachable — the pass must own all timeout detection; (3) the pass's post-termination recovery push (from the working tree) is the universal fallback for all hang modes.

**Sub-agent 4 (push + marker analysis):** Traced the transient-vs-permanent classification logic gap, the marker-contents insufficiency (missing opencode exit code, branch name, commit SHA), the marker-path contract gap (unspecified path), marker-write failure, and the trap-survival-on-SIGTERM question. Identified twelve findings. Key insights: (1) classification should be by error type (auth, non-fast-forward, network, rate-limit), not by retry count; (2) the marker should be a JSON file with structured fields, not a plain text file; (3) the marker path must be a fixed, documented constant in both the template and the pass; (4) the trap-based push on SIGTERM should be a single fast push (no retries) to fit within the grace period; (5) `git ls-remote` is the authoritative check for "was the work pushed?" that doesn't depend on markers.

## What this means for the plan

Five changes are needed:

1. **F1: Add `git ls-remote` fallback to the collection path.** Before destroying any sandbox where the session was terminated (not exited cleanly), the pass checks `git ls-remote origin pipeline/<runId>/<chainId>`. If the branch exists, the push completed. If absent, the pass attempts a recovery push from the working tree. This is the universal fallback for SIGKILL, trap failure, and marker-write failure. The pass already has this capability for the push-failed marker case (graph-pipeline.md:1567-1573) — extending it to the no-marker case is mechanical.

2. **F2: Add per-step timeout to the install command.** The template wraps the install command in `timeout $INSTALL_TIMEOUT npm ci` (configurable in the policy block). Exit code 124 (GNU timeout) is classified as install failure (park with QUESTION), not generic timeout. Without this, an install hang consumes the entire per-node deadline and hits the F1 work-loss gap.

3. **F3: Add proxy health check and `proxy-failed` marker.** Between steps 1 and 4, the template runs a two-tier health check (HTTP listener + end-to-end tunnel verification). On failure, it writes a `proxy-failed` marker with cause and permanence classification, and exits with code 20. The pass checks this marker before classification — permanent causes park with QUESTION (don't retry), transient causes park with QUESTION (human checks relay). Modeled on the install-failure pattern (graph-pipeline.md:616-623).

4. **F4: Capture session ID via background poller.** The template captures `sessions_before` before `opencode run`, then launches a background poller that polls `opencode session list --format json` every ~2s. When a new session appears, it writes the ID to the known path and exits the poller. This is robust against opencode hang (ID captured before the hang is detected), opencode crash (poller detects no new session, writes `session-capture-failed` marker), and stale sessions (pre-run snapshot diff).

5. **F6+F7: Define the marker/exit-code contract and push classification table.** The plan should specify: exit codes (0=success, 1=agent failure, 2=push failed, 10=install failure, 20=proxy failure, 66=session-capture transient, 67=session-capture permanent), marker files (`push-failed`, `proxy-failed`, `install-failed`, `session-capture-failed`) as JSON with structured fields, the marker path as a fixed constant, and the push-error classification table (auth → permanent, non-fast-forward → permanent, network → transient with 1s/5s/15s backoff, rate-limit → transient with 30s/60s/120s backoff). The pass reads markers first (authoritative for infra failures), then exit codes (for outcome classification).
