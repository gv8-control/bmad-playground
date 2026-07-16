# Investigation: Unit & Integration tests keep failing on GitHub pipeline

## Hand-off Brief

1. **What happened.** There was never a process kill. `web:test` runs all 66 suites to completion in CI and fails
   4 suites / 16 tests — the `api/internal/test/**` route tests — because those routes 404 when `TEST_ENV` is unset
   (`route.ts` guard), and the CI unit job never sets it; locally Nx auto-loads `.env` (which defines `TEST_ENV`),
   so the suites pass (Confirmed, run #123 streamed output + guard at `apps/web/src/app/api/internal/test/artifacts/route.ts:14`).
2. **Where the case stands.** Concluded. The "silent mid-run death" was an output-truncation artifact: Nx's task
   output capture drops the tail (later PASSes, all FAIL reports, the Jest summary) when the failing child exits —
   every buffered-mode log looked like a roaming mid-run kill, which misdirected two investigations (OOM, unhandled
   rejection, external killer — all refuted). Diagnostic commit 3705cd4 (streamed output + dmesg post-mortem) exposed
   the real failures in run #123.
3. **What's needed next.** Fix the 4 suites to set `process.env.TEST_ENV` themselves (preferred) or add `TEST_ENV: ci`
   to the unit job env; keep `--outputStyle=stream` in the unit step; revert the remaining diagnostics from 3705cd4.

## Case Info

| Field            | Value                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Ticket           | N/A (run #122 = run ID 29451570814, branch `chore/post-epic-4-cleanup`, PR-tier)          |
| Date opened      | 2026-07-15                                                                                 |
| Status           | Concluded                                                                                     |
| System           | GitHub Actions `ubuntu-latest`, private repo (standard runner), Node 24, Jest ~30.3.0     |
| Evidence sources | GH Actions job logs (runs #26, #101, #111–#122), `.github/workflows/test.yml`, git history |

## Problem Statement

User report: "Unit & Integration tests keep failing on github pipelines (latest run #122). It's probably not a
memory limit issue because setting node limit to 4gb did not fix it." — the "not memory" claim is registered as
Hypothesis #1, not accepted as fact.

## Evidence Inventory

| Source                                       | Status    | Notes                                                                 |
| -------------------------------------------- | --------- | --------------------------------------------------------------------- |
| Run #122 unit job log (job 87475257044)      | Available | Full log downloaded; scratchpad `job-unit-integration-122.log`        |
| Run #121/#120 unit job logs                  | Available | jobs 87471783195 / 87467376765                                        |
| Run #101/#26 unit job logs (older era)       | Available | Real FAIL-mode failures, different from current mode                  |
| Run history conclusions (#23–#122)           | Available | No unit=success anywhere; mostly skipped before #111                  |
| Runner memory telemetry (dmesg/OOM killer)   | Missing   | GitHub-hosted runners expose no kernel logs — mechanism must be inferred/reproduced |
| Local reproduction (RSS measurement)         | Available | Peak 986 MB total / 817 MB worker, 58 s, single worker               |
| Prior investigation doc (opencode session)   | Available | `docs/ci-web-test-failure-investigation.md` — H6 source; local-repro table cross-validates Finding 6 |
| E2E failure plan (separate track)            | Available | `docs/e2e-run-122-fix-plan.md` — E2E shard failures already analyzed & planned separately |
| CI diagnostic run (#123, commit 3705cd4)     | Available | Run 29454121485, job 87483522892 — decisive evidence (Findings 9–10) |

## Investigation Backlog

| # | Path to Explore                                                        | Priority | Status      | Notes                                                        |
| - | ---------------------------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------ |
| 1 | Measure peak RSS of `web:test` with `--maxWorkers=1` (CI-like)         | High     | Done        | 986 MB peak → H2 refuted                                     |
| 2 | Determine whether older FAIL-mode failures (route.test.ts) still exist | Medium   | Done        | They do (Finding 7) — env-dependent, latent second defect    |
| 3 | E2E shards 1–3 also failed in #122                                     | Medium   | Done        | Separate track — `docs/e2e-run-122-fix-plan.md` already covers it |
| 4 | Verify runner core count (2 vs 4 vCPU) → Jest worker count in CI       | Low      | Done        | 2 vCPU / 7.8 GB, availableParallelism 2 → 1 Jest worker      |
| 5 | Read diagnostic run #123 output (stream timing, rejection warning, dmesg) | High  | Done        | H3/H4/H6 all refuted; Findings 9–10 established              |
| 6 | If H6 confirms: identify the exact rejecting promise from the warning stack | High | Closed      | H6 refuted — no rejection exists                              |

## Timeline of Events

| Time (UTC)        | Event                                                                                       | Source                          | Confidence |
| ----------------- | ------------------------------------------------------------------------------------------- | ------------------------------- | ---------- |
| ≤ 2026-07-13      | Unit job fails with real test failures (web `route.test.ts`, agent-be railway specs) when it runs at all; otherwise skipped via lint/typecheck failures | Run #26, #101 logs              | Confirmed  |
| 2026-07-15 17:56  | Run #111 (fbf83c2 fixes lint/typecheck deps) — unit job actually runs on this branch; log truncated (later shown to be Nx capture artifact, Finding 10) | Run #111                        | Confirmed  |
| 2026-07-15 20:40  | Run #120 (5c4e056): web:test fails, output truncated at 24 suites, `--parallel=2` era                         | Run #120 log                    | Confirmed  |
| 2026-07-15 21:02  | d41cb71 mitigation: `--parallel=1 --maxWorkers=50%` + `NODE_OPTIONS=--max-old-space-size=4096` | git show d41cb71                | Confirmed  |
| 2026-07-15 21:05  | Run #121 still fails (output truncated at 26/66 suites)                                                          | Run #121 log                    | Confirmed  |
| 2026-07-15 21:14  | 253826c reverts mitigation (keeps `--parallel=1`)                                           | git show 253826c                | Confirmed  |
| 2026-07-15 21:23  | Run #122 fails, output truncated mid-line at 19/66 suites, no Jest summary                  | Run #122 log line ~1070         | Confirmed  |
| 2026-07-15 22:06  | Run #123 (3705cd4 diagnostics): full suite visible — 62 PASS / 4 FAIL, `Expected: 200 Received: 404`, dmesg clean | Run #123 job 87483522892        | Confirmed  |

## Confirmed Findings

### Finding 1: web:test dies without any test failing

**Evidence:** Run #122 job log — 19 `PASS web` lines, zero `FAIL` lines, no `Test Suites:` summary for web, output
truncated mid-line (`> 74 | console.error(...` then Nx "Failed tasks: - web:test").

**Detail:** *(Superseded by Findings 9–10: Jest does complete; the log is truncated.)* All other projects pass with
full summaries.

### Finding 2: Death point roams across runs

**Evidence:** PASS-count before death: #122 → 19, #121 → 26, #120 → 24 (of 66 web suites).

**Detail:** *(Superseded by Finding 10: the "death points" are output-truncation byte positions, not execution
positions.)* Correctly ruled out a deterministic per-suite crash at the time.

### Finding 3: No V8 heap-limit crash message

**Evidence:** Full-log grep for `heap|FATAL|SIGKILL|memory|worker` in runs #120–122 — no matches.

**Detail:** A V8 heap-cap crash prints `FATAL ERROR: Reached heap limit Allocation failed`. Its absence + abrupt
mid-line truncation = the process was killed from outside (kernel SIGKILL leaves no in-process output). This also
explains why `--max-old-space-size=4096` changed nothing — Hypothesis #1's *reasoning* is invalid (a V8 heap cap
doesn't bound process RSS and can't prevent kernel OOM kills), though its *conclusion* ("not memory") is what the
mitigation run appeared to support.

### Finding 4: The unit gate has never been green in retained history

**Evidence:** Job-conclusion sweep of runs #23–#122: `success` appears zero times; `skipped` dominates (unit `needs:
[lint, typecheck]` — those failed for most of the period; schedule-triggered runs skip unit by design).

**Detail:** "Keeps failing" is actually "was never passing, and was hidden until lint/typecheck got fixed" (run #111,
commit fbf83c2, 2026-07-15).

### Finding 5: Older failures were a different mode

**Evidence:** Run #26 (2026-07-04) and #101 (2026-07-13) logs: explicit `FAIL` lines — web
`api/internal/test/artifacts/route.test.ts`, `seed-user/route.test.ts`; #101 also agent-be railway integration specs
(since isolated into `test-railway` by 7891ddc).

**Detail:** Whether the web route.test.ts failures still exist is unknown — the current silent death occurs before
those suites report. They may resurface once the process survives to completion.

## Deduced Conclusions

### Deduction 1: The Jest process is killed externally, most consistent with the kernel OOM killer

**Based on:** Findings 1, 2, 3.

**Reasoning:** Silent death + roaming death point + no in-process error + mid-line stdout truncation + private-repo
`ubuntu-latest` runner (7 GB RAM class) + 66 jsdom/ts-jest suites on Node 24. The only common external killers on a
hosted runner are the job timeout (not hit — job ran ~90 s of its 15-min budget) and the kernel OOM killer.

**Conclusion:** Memory exhaustion at the *machine* level (RSS), not the V8 heap level. The 4 GB heap cap test doesn't
refute this — it can't.

## Hypothesized Paths

### Hypothesis 1 (user's): "Not a memory limit issue, because 4 GB node limit didn't fix it"

**Status:** Resolved — conclusion accidentally right, reasoning invalid (see Resolution)

**Theory:** Raising `--max-old-space-size` to 4096 should have fixed a memory problem; it didn't, so memory isn't the cause.

**Supporting indicators:** Mitigation run #121 indeed still failed.

**Would confirm:** Local run showing modest peak RSS (≪ 7 GB) with CI-like settings → memory genuinely not the issue.

**Would refute:** Local run showing peak RSS approaching/exceeding ~6–7 GB.

**Resolution (partial):** `--max-old-space-size` bounds only the V8 old-space per process; it neither bounds total
process RSS (heap + external + code + jsdom native structures across main + worker) nor prevents kernel OOM kills.
A 4 GB cap on a 7 GB machine with 2+ Node processes can even *worsen* OOM exposure by delaying GC pressure.

### Hypothesis 2: Kernel OOM kill from cumulative Jest worker memory growth

**Status:** Refuted

**Theory:** ts-jest + jsdom suites leak/accumulate per-suite so worker RSS grows monotonically; on a 7 GB runner the
sum crosses the threshold and the kernel kills the largest process mid-run.

**Supporting indicators:** Silent death, no V8 error.

**Would confirm:** Local `--maxWorkers=1` run showing peak RSS in the multi-GB range.

**Would refute:** Flat heap per suite and peak RSS well under 2 GB.

**Resolution:** Local single-worker run of all 66 suites: peak process-tree RSS **986 MB** (largest process 817 MB),
max per-suite heap 475 MB, wall time 58 s. Even ×3 workers this is far below any runner ceiling. Additionally the
kernel OOM killer would select the biggest process (the worker); a killed worker produces a visible Jest
"worker process was terminated" error and a continuing run — the observed silent main-process death doesn't match.
Also refuted by pattern: `--parallel=2` era (double memory pressure) died at the same clock/positions as `--parallel=1`.

### Hypothesis 3: Native crash (SIGSEGV) in Node 24.18 / V8 during reporter output

**Status:** Refuted

**Resolution:** Run #123 dmesg contains no segfault/trap lines; the process was never killed at all (Findings 9–10).

**Theory:** A V8/JIT/GC native bug crashes the Jest main process mid-write; silence and mid-line truncation fit.

**Supporting indicators:** Silent mid-write death fits a segfault exactly.

**Would confirm:** Local repro under identical Node build; or a core-dump/dmesg signature from a CI diagnostic run.

**Would refute:** Kill signature in dmesg from an external process; or the time-anchoring being confirmed as exact
(a random native crash wouldn't fire at a consistent wall-clock offset across 8 runs and 2 parallelism regimes).

**Supporting against:** Node v24.18.0 ran the FULL suite fine on Jul 4 and Jul 13 (runs #26/#101 completed with
proper FAIL summaries); local Node 24.14 completes; the ~39 s consistency across heap-flag and parallelism changes.

### Hypothesis 4: Time-anchored external kill in the CI environment (~39 s after the nx step starts)

**Status:** Refuted

**Resolution:** The ~16 s "kill clock" was web:test's ordinary full runtime at CI pace — the run *finishes* (red) at ~16 s; nothing kills it (Finding 9). dmesg clean; post-mortem memory healthy.

**Theory:** Something in the runner environment terminates the active Nx task child process at a near-fixed clock
offset. Both parallel=1 runs died 15.9 s / 16.7 s into web:test = 38.3 s / 39.2 s after the `yarn nx run-many` step
began; the parallel=2 era's death positions (19/24 suites) fit the same step-anchored clock (web:test starts earlier
and runs slower under contention) better than a web-start-anchored one.

**Would confirm:** CI diagnostic run showing the kill signal source (dmesg), or local mimic surviving while CI keeps
dying at ~39 s.

**Would refute:** Local CI-mimic dying the same way (→ repo-borne, not environment).

### Hypothesis 5: Test or app code kills its own process (process.exit/kill in main)

**Status:** Refuted (for web code)

**Theory:** A test calling `process.exit`/`process.kill(0)` mid-run terminates the main Jest process silently.

**Resolution:** `grep -rE 'process\.(kill|exit|abort)|SIGKILL|SIGTERM|SIGINT|ppid'` over `apps/web/src` and `libs/`
returns nothing. Also, test code executes in the worker (separate child process), which cannot silently kill the main
process — a dead worker produces a visible error.

### Hypothesis 6 (prior investigation's): Unhandled promise rejection under Node 24 (`--unhandled-rejections=throw`)

**Status:** Refuted

**Resolution:** Run #123 ran with `NODE_OPTIONS=--unhandled-rejections=warn`; zero rejection warnings appeared, and the run completed all suites regardless. The prior doc's core observation (no summary printed) is explained by Nx output truncation (Finding 10), not an early exit.

**Theory:** From `docs/ci-web-test-failure-investigation.md` (earlier opencode session): a fire-and-forget promise in
web test/app code (candidates: `ConversationPane.tsx` resume-fetch `.catch` that itself throws during jsdom teardown;
`fetchSkills`) rejects unhandled on the slow 2-core runner's different event-loop scheduling; Node 24's default
`--unhandled-rejections=throw` exits the process with code 1 before Jest prints its summary. A leaked real (non-fake)
~15 s timer from suite #1 (ConversationPane.test.tsx — the largest file, always executed first in CI's size-ordered
serial run) would also explain the consistent ~16 s-into-web:test death regardless of which suite is then running.

**Supporting indicators:** Exit code 1; silent truncation; CI-only (12-core local runs pass under every tested
condition — cross-validated by both investigations independently).

**Weak points found on review:** (a) The prior doc's "exit code 1, not 137, rules out OOM" reasoning is unsound —
the step exit code is nx's own, not the killed child's; OOM was instead refuted here by direct RSS measurement (H2).
(b) An unhandled rejection killing the *worker* produces a visible Jest worker-crash error and a surviving run —
only a *main-process* rejection fits the silent death, and Node's fatal `ERR_UNHANDLED_REJECTION` message ought to
appear on stderr (it doesn't; possibly lost in Nx's output capture on abrupt exit).

**Would confirm:** Diagnostic run with `NODE_OPTIONS=--unhandled-rejections=warn` printing an
`UnhandledPromiseRejectionWarning` with stack, with the run then surviving to the Jest summary.

**Would refute:** Diagnostic run still dying silently under warn mode + dmesg showing an external kill signature.

### Finding 6: The exact CI command completes locally under CI-like constraints

**Evidence:** `CI=true taskset -c 0,1 yarn nx run-many --target=test,test-integration --all --parallel=1
--passWithNoTests --skip-nx-cache` on the codespace (Node 24.14): all 5 tasks green, web 66/66 suites, 908/908 tests.
The prior investigation's table (docs/ci-web-test-failure-investigation.md §4) independently reports the same across
7 local conditions including 512 MB heap caps.

**Detail:** The killer does not travel with the repo, toolchain, or test code under local conditions — it manifests
only in the GitHub runner environment (2-core/7 GB per the prior doc's CI numbers).

### Finding 7: The 4 web route.test.ts failures are env-dependent and latent

**Evidence:** Bare `jest --config apps/web/jest.config.ts` (no Nx) fails 4 suites / 16 tests
(`api/internal/test/{artifacts,seed-user,repo-connections,repo-connections/[id]}/route.test.ts`); the same suites
passed under `yarn nx run web:test` locally (Nx executors auto-load the repo `.env`, absent in CI) and failed in CI
runs #26/#101 (nx, but no `.env` on the runner).

**Detail:** Once the silent-kill is resolved, CI web:test will reach these suites and fail on them unless the env
dependency (TEST_ENV-guarded internal routes) is provided or the tests are made env-independent. This is a second,
independent defect.

### Finding 8: Death is time-anchored, not suite- or resource-anchored

**Evidence:** web:test lifetime on the two parallel=1 runs: 16.7 s (#122) and 15.9 s (#121) = 39.2 s / 38.3 s after
the nx step began — despite dying at different suite positions (19 vs 26) and under different heap flags. The
pass-set frontier maps exactly onto Jest's size-descending file order (positions 1–19 = 19-set ⊂ 20–24 = 24-set
additions ⊂ 25–26 = 26-set additions), proving serial single-worker execution; the three 19-death runs have
byte-identical pass-sets.

**Detail:** The `--parallel=2` era died at the same positions (19/24), which fits a step-anchored ~39 s clock better
than a web-start-anchored one. Whatever kills the process fires on a consistent wall clock, killing whichever task is
then running (always web:test, since it's the longest and runs last/latest).

### Finding 9: Run #123 (diagnostic) — the full suite runs; 4 suites fail on a TEST_ENV guard

**Evidence:** Run #123 job 87483522892 streamed output: 62 `PASS` + 4 `FAIL` web lines (66/66 suites), failure detail
`Expected: 200 / Received: 404` at `route.test.ts:49`; guard at `apps/web/src/app/api/internal/test/artifacts/route.ts:14`
(`process.env.NODE_ENV === 'production' || !process.env.TEST_ENV` → 404); `TEST_ENV` present in local `.env`/`.env.test`
but not in the unit job env (only E2E jobs set `TEST_ENV: ci`); none of the 4 suites set `process.env.TEST_ENV`.
Runner confirmed 2 vCPU / 7.8 GB (`nproc`=2, `availableParallelism: 2`); dmesg clean (no OOM, no segfault); memory at
post-mortem 1.3/7.8 GB; zero unhandled-rejection warnings under `--unhandled-rejections=warn`.

**Detail:** web:test wall time ~15 s for the full suite — matching the ~16 s "death" time of every earlier run:
the process wasn't dying at 16 s, it was *finishing* (with failures) at 16 s.

### Finding 10: The "silent death" was Nx output truncation at failing-child exit

**Evidence:** Run #123 output ends mid-ANSI-escape (`Expected: [3` = `\x1b[32m…` cut inside the color code of the
final failure recap) with the preceding output arriving in 7–9-byte fragments; buffered-mode runs #111–#122 lost far
more — everything after ~19–26 suites' worth of output (later PASSes, all 4 FAIL reports, the summary). The
19/24/26 "death positions" are byte-truncation points of the captured stream, not execution positions.

**Detail:** This masking defect converted an ordinary red test run into an apparent process kill and misdirected all
prior analysis. `--outputStyle=stream` preserves enough output to see the real failures; the very tail is still lost
even in stream mode.

## Missing Evidence

| Gap                                  | Impact                                             | How to Obtain                                        |
| ------------------------------------ | -------------------------------------------------- | ---------------------------------------------------- |
| Kernel OOM log from the runner       | Direct proof of SIGKILL source                     | Not obtainable on hosted runners; infer via repro    |
| Runner vCPU count (2 vs 4)           | Exact worker count → total RSS math                | Add `nproc` + `free -h` debug step to workflow       |

## Source Code Trace

| Element       | Detail                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------- |
| Error origin  | External kill of `nx run web:test` child (Jest main or worker), `.github/workflows/test.yml:148` |
| Trigger       | Unit job step `yarn nx run-many --target=test,test-integration --all --parallel=1`        |
| Condition     | Machine-level memory exhaustion on `ubuntu-latest` (hypothesis 2, under confirmation)      |
| Related files | `apps/web/jest.config.ts` (no maxWorkers/workerIdleMemoryLimit), `jest.preset.js` (bare Nx preset), `apps/web/project.json` |

## Conclusion

**Confidence:** High

Two defects combine, both Confirmed:

1. **Real failure (why CI is red):** the 4 `apps/web/src/app/api/internal/test/**/route.test.ts` suites (16 tests)
   exercise TEST_ENV-guarded internal routes and implicitly require `TEST_ENV` to be set. The unit CI job doesn't set
   it, so the routes return 404 and the suites fail — on every run that ever reached them (back to run #26,
   2026-07-04). The unit gate has never been green in retained history; upstream lint/typecheck failures merely hid it
   until run #111.
2. **Masking failure (why it looked like a process kill):** Nx truncates the captured output of a failing task at
   child exit, discarding the tail — later PASS lines, all FAIL reports, and the Jest summary. Every log therefore
   ended mid-output at a "roaming" position, exactly mimicking a silent mid-run process death.

Refuted along the way: kernel OOM kill (RSS peak 986 MB vs 7.8 GB runner; dmesg clean), V8 heap-cap crash (no FATAL
error; 4 GB flag changed nothing because nothing was wrong), Node 24.18 regression (same version in passing-era runs),
native segfault (dmesg clean), unhandled promise rejection (zero warnings under `--unhandled-rejections=warn`),
process-kill code in web sources (grep clean). The user's premise ("probably not memory") was correct, but the
implied framing ("the process is being killed") was itself the illusion.

## Recommended Next Steps

### Fix direction

1. **Make the 4 suites own their env** (preferred — works in CI, bare Jest, and nx alike): in each
   `route.test.ts`, set `process.env.TEST_ENV = 'ci'` in `beforeAll` and restore in `afterAll`; keep/add the explicit
   negative tests that delete `TEST_ENV`/set production and assert 404. Alternative (one line, but couples tests to
   workflow config): add `TEST_ENV: ci` to the unit job's step env in `test.yml`.
2. **Keep `--outputStyle=stream`** on the unit step permanently so a failing task's output is never silently
   truncated again; revert the rest of diagnostic commit 3705cd4 (resource step, dmesg step,
   `NODE_OPTIONS=--unhandled-rejections=warn`).
3. Optional hygiene: fix the `saveFallbackTimeoutRef` unmount leak (Side Findings) — unrelated to CI redness.

### Diagnostic

None required — root cause observed directly in CI (run #123).

## Reproduction Plan

- **Reproduce the failures:** run web Jest without Nx's `.env` auto-load:
  `yarn jest --config apps/web/jest.config.ts --maxWorkers=1` → the same 4 suites / 16 tests fail with 404s.
- **Verify the fix:** after setting `TEST_ENV` in the suites, the same bare-Jest command passes; CI unit job goes
  green (the truncation defect only ever manifested on failing runs).

## Side Findings

- `ConversationPane.tsx` unmount cleanup clears `timeoutRef` but NOT `saveFallbackTimeoutRef` (the 15 s
  working-tree-save fallback created at `ConversationPane.tsx:854`) — a component unmounted while a save is pending
  leaks a live 15 s timer. Suspicious alignment: 15 s ≈ the observed ~16 s-into-web:test death clock, and
  `ConversationPane.test.tsx` (which toggles `jest.useRealTimers()` in several tests) always runs first in CI.
  Worth fixing on its own merits even if unrelated to the kill.
- E2E shards 1–3 also failed in run #122 (shard 4 passed) — already analyzed separately in
  `docs/e2e-run-122-fix-plan.md` (user's separate track).
- The `Upload unit test results` step finds no files (`apps/*/coverage/`, `apps/*/test-results/`) because Jest dies before writing anything — the artifact step yields no diagnostics in exactly the runs where it's needed.
- GitHub MCP server credentials are invalid (401) in this environment; `gh` CLI works via `GITHUB_TOKEN` from `.env`.
