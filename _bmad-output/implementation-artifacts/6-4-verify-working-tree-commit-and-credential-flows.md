---
baseline_commit: 0d60d0b5e980bc0721e286f296b73a5fbeae59e4
---

# Story 6.4: Verify Working Tree, Commit, and Credential Flows

Status: done

## Story

As a developer on the bmad-easy team,
I want the working-tree tracking, manual commit, and credential detection flows verified against the sandbox-based execution,
so that the Stories 3.6, 3.7, and 3.10 flows that were broken by host-based execution now work correctly.

## Acceptance Criteria

1. **AC-1: Working-tree tracking fires on agent file modifications.** Given the agent modifies files inside the sandbox (via `Write`, `Edit`, `Bash` tool calls), when `getWorkingTreeStatus` runs after a file-modifying tool call, then `WORKING_TREE_DIRTY` fires with the changed files (because the agent and the working tree are now in the same filesystem), and the working-tree indicator (Story 3.6) shows `● Unsaved changes`.

2. **AC-2: Manual commit works inside the sandbox.** Given the user triggers a manual save (Story 3.6), when the commit executes inside the sandbox via Daytona process exec, then there are actual changes to commit (the agent's file modifications are in the sandbox), and the commit carries the user's git identity (Story 3.10 / Story 1.5), and the working-tree indicator resets to clean.

3. **AC-3: Credential failure detection triggers on 401/403.** Given the agent runs a git command that hits a 401/403 (e.g., `git push` with an expired token), when the tool-pill classifier (Story 3.7) inspects the tool call result, then credential failure detection triggers (because git commands now run inside the sandbox where the credential is injected), and `CREDENTIAL_FAILURE` or `ACCESS_DENIED` events emit to the browser.

4. **AC-4: No host filesystem operations.** Given the host-based execution code path, when verification is complete, then no agent file operations happen on the host filesystem — all file operations happen inside the sandbox.

## Tasks / Subtasks

> **Scope correction (validation pass):** Tasks 1–3 and 6.1 from the original draft prescribed "Add test" for flows already covered by existing tests added in Story 6.3. Those tests are listed under **Regression coverage** below — the dev should run them, not recreate them. The remaining tasks are the genuinely new work: F4/F5 fidelity-audit fixes and host-filesystem regression guards.

- [x] **Task 1: Fix F4 — `commit()` failure-path tests + empty-error-message fix (AC: #2)**
  - [x] 1.1: **Activate the existing skipped F4 scaffolds** in `sandbox.service.nfr-s1.spec.ts` (ATDD prepare-tests already applied them as `it.skip()` — see ATDD Artifacts). Remove `.skip` for both F4 tests:
    - Test `git add -A` failure: `mockSandbox.process.executeCommand.mockResolvedValueOnce({ exitCode: 1, result: '' })` for the first call (git add), then `{ exitCode: 0, result: '' }` for the second (git commit). Assert `commit()` rejects with a non-empty diagnostic matching `/exit code 1/` (RED until 1.2). Assert `git commit` is NOT called (the `git add` failure short-circuits) — assert `executeCommand` called exactly once.
    - Test `git commit` failure: first call (git add) returns `{ exitCode: 0, result: '' }`, second call (git commit) returns `{ exitCode: 1, result: 'nothing to commit, working tree clean' }`. Assert `commit()` rejects with `'nothing to commit, working tree clean'`.
  - [x] 1.2: **Fix the empty-error-message production bug (F4).** When `git add` fails, `addResponse.result` is empty (the SDK's `ExecuteResponse.result` is stdout-only; `git add` writes failures to stderr). The current code `throw new Error(addResponse.result)` throws `Error('')` — the user sees `MANUAL_SAVE_FAILED { error: '' }` with no actionable information. Fix: when `result` is empty and `exitCode !== 0`, throw a diagnostic message that includes the exit code. Apply the same fix to the `git commit` failure path for consistency. Pattern: `throw new Error(response.result || \`git ${step} failed (exit code ${response.exitCode})\`)` — the `||` fallback surfaces the exit code when `result` is empty. This is the simplest option (DP-3) — no SDK changes, no new fields, just a fallback message.

- [x] **Task 2: Fix F5 — `listSkills()` catch-block + exitCode tests (AC: #4)**
  - [x] 2.1: **Activate the existing skipped F5 scaffolds** in `sandbox.service.nfr-s1.spec.ts` (ATDD prepare-tests already applied them as `it.skip()` — see ATDD Artifacts). Remove `.skip` for all three F5 tests:
    - Test `executeCommand` rejection: `mockSandbox.process.executeCommand.mockRejectedValueOnce(new Error('ENOTREACHABLE'))`. Assert `listSkills()` returns `[]` (silent-swallow is the desired behavior — the spec-mandated default). Assert a `logger.warn` is emitted via `jest.spyOn(service['logger'], 'warn')` (the failure is diagnosable, per project-context.md "logger.warn() in catch blocks that return a default value").
    - Test non-zero exitCode: `mockSandbox.process.executeCommand.mockResolvedValue({ exitCode: 2, result: '' })` (the `ls` "no such directory" failure). Assert `listSkills()` returns `[]`.
    - Test non-zero exitCode with stdout output: `mockSandbox.process.executeCommand.mockResolvedValue({ exitCode: 1, result: 'some junk' })`. Assert `listSkills()` returns `[]` (RED until 2.2 — the `exitCode !== 0` early-return prevents junk parsing).
  - [x] 2.2: **Add `exitCode` check to `listSkills()` (F5).** The production code reads `response.result.trim()` without checking `response.exitCode` first. A failed `ls` typically returns `result: ''` (stdout empty), so the `if (!output)` branch catches it. But if `ls` ever writes to stdout in a failure mode, the parsing returns junk. **Decision (DP-3):** Add `if (response.exitCode !== 0) { return []; }` before reading `result` — the simplest fix that makes the contract explicit. This is a 2-line production change that prevents a future `ls` failure mode from returning junk.

- [x] **Task 3: Verify no host filesystem operations (AC: #4)**
  - [x] 3.1: **Activate the existing skipped host-fs regression guard scaffold** in `agent.service.unit.spec.ts` (ATDD prepare-tests already applied it as `it.skip()` — see ATDD Artifacts). Remove `.skip` for the `cwd: "repo"` test, which verifies `buildAgentCommand()` produces a command that runs inside the sandbox (the `cwd: REPO_SUBDIRECTORY` is passed to `streamAgentEvents`), NOT on the host. Assert the `streamAgentEvents` call receives `cwd: 'repo'`. This is a regression guard — it passes once activated (production already passes `cwd: REPO_SUBDIRECTORY`).
  - [x] 3.2: **Activate the existing skipped host-fs regression guard scaffold** in `agent.service.unit.spec.ts` (ATDD prepare-tests already applied it as `it.skip()` — see ATDD Artifacts). Remove `.skip` for the `getWorkingTreeStatus ... sandboxId` test, which verifies `sandboxService.getWorkingTreeStatus` is called with the `sandboxId` from the active run, NOT a host path. **Decision (DP-2):** the story text also names `sandboxService.commit`, but `AgentService` does not call `commit` — `ManualCommitService` does, and its existing tests (`manual-commit.service.spec.ts`) already pass `sandboxId` through `SandboxServiceFake.getCommitCalls()`. The `commit` sandboxId assertion is therefore not duplicated here; the `getWorkingTreeStatus` assertion is the one activated in this file. This is a regression guard — it passes once activated.

## Dev Notes

### ATDD Artifacts

Red-phase scaffolds were applied by the ATDD (prepare-tests) workflow. The dev **activates** these existing skipped scaffolds (removes `.skip`) rather than creating them — the story tasks above are amended to instruct activation so the story does not contradict the codebase state.

- **Checklist:** `_bmad-output/test-artifacts/atdd-checklist-6-4-verify-working-tree-commit-and-credential-flows.md`
- **F4 + F5 scaffolds:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (appended describe blocks, 5 `it.skip()` tests)
- **Task 3 host-fs guard scaffolds:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (inserted describe block, 2 `it.skip()` tests)

RED activation spot-checks (temporarily activated, then reverted) confirmed: the F4 git-add-empty test fails with `Received message: ""` (RED until Task 1.2); the F5 exitCode-gate test fails with `Received [{"name":"some junk"}]` (RED until Task 2.2); both Task 3 guards pass when activated (regression guards). Full suite baseline: 7 skipped, 782 passed.

### What this story does

Verifies that the working-tree tracking (Story 3.6), manual commit (Story 3.6), and credential detection (Story 3.7) flows work correctly against the sandbox-based execution (Stories 6.1–6.3). In the host-based model, the agent modified files on the host (`tmpdir()`), but `getWorkingTreeStatus` and manual commit ran against the sandbox via Daytona process exec — the two filesystems were disconnected. With sandbox-based execution, the agent runs inside the sandbox where the repository is cloned, so file modifications, git commands, and working-tree checks all operate on the same filesystem.

This story is **verification, not new implementation**. The working-tree tracking (AC-1), manual commit flow (AC-2), and credential detection (AC-3) are already covered by existing tests added in Story 6.3 — see **Regression coverage** below. The only new work is the F4 (empty error message) and F5 (exitCode check) fidelity-audit fixes, plus two host-filesystem regression guard tests (AC-4).

### What this story does NOT do

- Does NOT run real-service E2E tests against a real Daytona sandbox (Story 6.5)
- Does NOT modify the flow logic (Stories 3.6, 3.7, 3.10) unless the sandbox-based execution surfaces a genuine edge case the host-based model didn't exercise
- Does NOT modify `AguiEventBridgeService`, `StreamingController`, `SessionEventsService`, or `SandboxService` session methods (Stories 6.2/6.3 own those)
- Does NOT fix pre-existing deferred findings in `tool-pill-classifier.service.ts` (brittle regex, dead logic, path truncation — all DP-5 scope temptation, pre-existing from Story 3.4)

### Why these flows were broken (and why they work now)

In the host-based model (Story 3.3 DP-2 deviation):
- The agent modified files on the host via `tmpdir()` as the working directory
- `getWorkingTreeStatus` ran `git status` inside the sandbox via Daytona process exec
- Manual commit ran `git add` + `git commit` inside the sandbox via Daytona process exec
- The two filesystems were disconnected — the agent's changes never appeared in the sandbox's working tree
- `WORKING_TREE_DIRTY` never fired, manual commit had nothing to commit, and git credential detection never triggered because the agent couldn't run git against the sandbox repo

With sandbox-based execution (Stories 6.1–6.3):
- The agent runs inside the sandbox where the repository is cloned (`REPO_SUBDIRECTORY = 'repo'`)
- File modifications, git commands, and working-tree checks all operate on the same filesystem
- The existing `getWorkingTreeStatus` / `ManualCommitService` / `tool-pill-classifier.service.ts` code works without changes — the fix is the execution location

### F4 fidelity audit finding — `commit()` empty error message

**Finding:** `SandboxService.commit()` (`sandbox.service.ts:215-235`) checks `addResponse.exitCode !== 0` and throws `new Error(addResponse.result)`. The SDK's `ExecuteResponse.result` is stdout-only (`ExecuteResponse.d.ts:21-25` — only `exitCode`, `result`, `artifacts`). `git add` writes failure diagnostics to stderr, not stdout — so `result` is empty for `git add` failures. The thrown error is `Error('')`, and `ManualCommitService` reports `MANUAL_SAVE_FAILED { error: '' }` with no actionable information.

The sibling `injectGitConfig` failure path IS tested (`nfr-s1.spec.ts:235-241`) and works because `git config` writes its error to stdout. The false confidence: the pattern looks correct for `injectGitConfig` but produces an empty error for `commit()`.

**Fix (Task 1.2):** When `result` is empty and `exitCode !== 0`, throw a diagnostic message that includes the exit code: `throw new Error(response.result || \`git ${step} failed (exit code ${response.exitCode})\`)`. The `||` fallback surfaces the exit code when `result` is empty. This is the simplest option (DP-3) — no SDK changes, no new fields, just a fallback message.

**Audit report:** `_bmad-output/test-artifacts/sandbox-service-fidelity-audit-2026-07-14.md` Finding F4 (Gap C).

### F5 fidelity audit finding — `listSkills()` silent-swallow + missing exitCode check

**Finding:** `SandboxService.listSkills()` (`sandbox.service.ts:237-259`) has a broad `catch (err)` that returns `[]` for all failures (sandbox unreachable, archived, stopped, `executeCommand` rejection). The catch-block is never exercised by tests. Additionally, the code reads `response.result.trim()` without checking `response.exitCode` first — a failed `ls` (exit code 2, empty stdout) returns `[]` via the `if (!output)` branch, but only because `result` happens to be empty. If `ls` ever writes to stdout in a failure mode, the parsing returns junk.

**Fix (Task 2.2):** Add `if (response.exitCode !== 0) { return []; }` before reading `result`. This makes the contract explicit: non-zero exit code means "no skills" (or "can't read skills"), regardless of stdout content. The catch-block silent-swallow behavior is verified as an explicit asserted contract (return `[]` + `logger.warn`), not an unexercised code path.

**Audit report:** `_bmad-output/test-artifacts/sandbox-service-fidelity-audit-2026-07-14.md` Finding F5 (Gap C).

### `executing*` Set guard (ManualCommitService)

`ManualCommitService`'s `executingCommits` Set guard (Story 3.6) still applies — concurrent commit requests for the same conversation are still prevented. The guard is transport-agnostic (it tracks conversation IDs, not execution locations). No changes needed.

### Regression coverage (AC-1, AC-2, AC-3)

The working-tree, manual-commit, and credential-detection flows are already covered by existing tests added in Story 6.3. The dev should run these as a regression suite — they must pass without modification. Do NOT add duplicate tests.

- **AC-1 (working-tree tracking):** `agent.service.unit.spec.ts` lines 681–830 — `WORKING_TREE_DIRTY` after file-modifying tool calls (line 682), `WORKING_TREE_CLEAN` when tree is clean (line 711), `FILE_MODIFYING_TOOLS` Set gate excludes non-file-modifying tools (line 739), failed `getWorkingTreeStatus` doesn't crash run (line 766), working-tree event arrives before `RUN_FINISHED` (line 798).
- **AC-2 (manual commit):** `manual-commit.service.spec.ts` — commit when idle+dirty with correct message format (line 95), no-op on clean tree (line 113), queued behind agent turn (line 127), `flushPendingCommit` executes after idle (line 138), failed commit emits `MANUAL_SAVE_FAILED` (line 163), commit message format regex (line 191).
- **AC-3 (credential detection):** `tool-pill-classifier.service.spec.ts` — 401 detection → `CREDENTIAL_FAILURE` + `markCredentialFailed` (lines 205–243), 403 classification → `ACCESS_DENIED` with `RATE_LIMITED`/`ORG_RESTRICTION`/`INSUFFICIENT_PERMISSION` (lines 245–280), `GIT_REMOTE_COMMAND` gate excludes non-git Bash (lines 317–329), non-Bash tools don't trigger (line 294). Integration: `agent.service.unit.spec.ts` lines 832–916 — `CREDENTIAL_FAILURE`/`ACCESS_DENIED` emitted to `sessionEvents` via `onEvent`.
- **AC-4 (host-fs removal, partial):** `agent.service.unit.spec.ts` lines 1414–1431 — `AgentService` does not import `tmpdir`/`AGENT_WORKDIR`/`@anthropic-ai/claude-agent-sdk` (Story 6.3 added this; Task 3.1/3.2 extend it with `cwd: 'repo'` and `sandboxId` assertions).

### Testing approach

New tests added by this story:

- **`sandbox.service.nfr-s1.spec.ts`** — F4 and F5 SDK-boundary tests using `mock-daytona.ts`. Follow the existing pattern (construct real `SandboxService` against `mock-daytona`, mock `executeCommand` responses). The `injectGitConfig()` failure-path test at lines 235–251 is the pattern to follow for F4.
- **`agent.service.unit.spec.ts`** — Task 3 host-filesystem regression guards (`cwd: 'repo'` assertion, `sandboxId` assertion). These extend the existing Story 6.3 regression guard block at lines 1315–1431.

Test priority tags: `[P0]` for AC coverage, `[P1]` for edge cases.

### Previous story intelligence (Story 6.3)

- **`onEvent` callback pattern:** Story 6.3 established the `onEvent` callback in `AguiEventBridgeService.streamAgentEvents()`. `AgentService.runTurn()` provides the callback that accumulates text/segments, triggers the classifier on `TOOL_CALL_RESULT`, emits working-tree events after file-modifying tool calls, and captures cost data. Existing tests at `agent.service.unit.spec.ts:681-916` already verify the working-tree emission and classifier triggering paths.
- **`toolCallRegistry` pattern:** Story 6.3 replaced the old `activeToolCalls` map with a `toolCallRegistry` keyed by `toolCallId`. The classifier lookup uses `toolCallRegistry.get(toolCallId)` to get `toolName` and `input` for `classifier.classifyToolResult()`. Existing tests at `tool-pill-classifier.service.spec.ts:205-329` already verify the registry correctly feeds the classifier for credential detection.
- **`FILE_MODIFYING_TOOLS` Set:** Story 6.3 preserved the `FILE_MODIFYING_TOOLS` Set (`Bash`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`). After a `TOOL_CALL_RESULT` for one of these, `getWorkingTreeStatus` is called fire-and-forget. Existing tests at `agent.service.unit.spec.ts:739` already verify the Set gate works correctly.
- **Sandbox-agent command unverifiable:** Story 6.3 flagged that the `sandbox-agent --agent claude-code --prompt ...` command cannot be fully verified without a real sandbox. This is flagged for Story 6.5. This story verifies the flows that depend on the agent running inside the sandbox (working-tree, commit, credential), but cannot verify the actual sandbox-agent invocation — that's Story 6.5.
- **Cost data gap:** Story 6.3 flagged that cost data from sandbox-agent's `RUN_FINISHED` event may not be in the expected format. This is Story 6.5 scope. Not relevant to this story's flows.

### Git intelligence

Recent commits:
- `0d60d0b` — Story 6.3: migrate AgentService to sandbox-based execution
- `6e5f908` — Story 6.2: agui-event-bridge service implementation
- `751489d` — Story 6.1: sandbox binary installation during provision

Story 6.3 established the sandbox-based execution model this story verifies against. The `onEvent` callback, `toolCallRegistry`, and `FILE_MODIFYING_TOOLS` patterns are all from Story 6.3.

### Architecture compliance

- **Architecture line 667:** "User message (browser) → `conversations.controller.ts` → sandbox process exec (Claude Code agent) → sandbox-agent JSONL → `agui-event-bridge.service.ts` → SSE → browser." — existing tests verify the working-tree and credential flows that operate on the sandbox filesystem alongside this data flow.
- **Architecture line 622:** "Credential failure propagation (NFR-R1) — 401 path: `tool-pill-classifier.service.ts` inspects git-related tool call results from the sandbox-agent JSONL stream for 401 patterns; on detection it (a) calls `credentials.service.ts` to persist the failed health status, and (b) emits a synthetic `CREDENTIAL_FAILURE` event on the same SSE channel already carrying AG-UI events." — existing tests verify AC-3 (credential detection) against this prescribed flow.
- **Architecture line 88:** "Manual commit (FR-15) is a platform-level operation executed via Daytona process execution API, not an agent action. Queued behind agent turn idle state in-process." — existing tests verify AC-2 (manual commit) against this prescribed flow; Task 1 fixes the `commit()` error-message bug in this path.
- **Sprint change proposal (2026-07-11):** Stories 3.6 (working tree), 3.7 (credential), and 3.10 (commit identity) were "Broken" in the host-based model. This story verifies they now work with sandbox-based execution.

### Deferred findings picked up by this story

No `deferred-work.md` entries are in scope for this story's code changes. The F4 and F5 fidelity audit findings are tracked in the epic dev notes (`epics.md` lines 1619-1621), not as separate `deferred-work.md` entries. They are explicitly in scope per the epic and are included as Tasks 1 and 2.

### Project Structure Notes

Files modified:
- `apps/agent-be/src/sandbox/sandbox.service.ts` — F4 fix (empty error message fallback in `commit()`), F5 fix (exitCode check in `listSkills()`)
- `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` — F4 and F5 SDK-boundary tests
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — Task 3 host-filesystem regression guards (`cwd: 'repo'` assertion, `sandboxId` assertion)

Files NOT modified (regression — existing tests must pass unchanged):
- `apps/agent-be/src/streaming/agent.service.ts` — `onEvent` callback, `FILE_MODIFYING_TOOLS`, working-tree emission logic unchanged (Story 6.3 code)
- `apps/agent-be/src/conversations/manual-commit.service.ts` — commit flow logic unchanged (Story 3.6 code)
- `apps/agent-be/src/conversations/manual-commit.service.spec.ts` — existing AC-2 tests unchanged (Story 3.6 code)
- `apps/agent-be/src/streaming/tool-pill-classifier.service.ts` — classifier logic unchanged (Story 3.7 code)
- `apps/agent-be/src/streaming/tool-pill-classifier.service.spec.ts` — existing AC-3 tests unchanged (Story 3.7 code)
- `apps/agent-be/src/streaming/agui-event-bridge.service.ts` — event bridge unchanged (Story 6.2/6.3 code)
- `apps/agent-be/src/streaming/streaming.controller.ts` — SSE transport unchanged
- `apps/agent-be/src/streaming/session-events.service.ts` — `emit()` / `ReplaySubject`, unchanged

### References

- [Source: epics.md#Story 6.4 lines 1585-1622] — story ACs and dev notes
- [Source: _bmad-output/implementation-artifacts/6-3-migrate-agentservice-to-sandbox-execution.md] — previous story (sandbox-based execution migration, `onEvent` callback, `toolCallRegistry`, `FILE_MODIFYING_TOOLS`)
- [Source: _bmad-output/test-artifacts/sandbox-service-fidelity-audit-2026-07-14.md] — F4 and F5 fidelity audit findings
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-11.md lines 65-67] — Stories 3.6/3.7/3.10 marked "Broken" in host-based model
- [Source: apps/agent-be/src/sandbox/sandbox.service.ts lines 206-259] — `getWorkingTreeStatus()`, `commit()`, `listSkills()` (F4/F5 fix targets)
- [Source: apps/agent-be/src/streaming/agent.service.ts lines 89-277] — `onEvent` callback (working-tree emission, classifier triggering)
- [Source: apps/agent-be/src/streaming/agent.service.ts lines 226-249] — `FILE_MODIFYING_TOOLS` Set + working-tree emission
- [Source: apps/agent-be/src/conversations/manual-commit.service.ts lines 56-120] — `runCommit()` / `executeCommit()` flow
- [Source: apps/agent-be/src/streaming/tool-pill-classifier.service.ts lines 126-213] — `classifyToolResult()` (credential detection, commit promotion)
- [Source: apps/agent-be/src/streaming/tool-pill-classifier.service.ts lines 19, 88-115] — `GIT_REMOTE_COMMAND` gate, `isCredentialFailureOutput()`, `classifyAccessDenied()`
- [Source: apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts lines 169-201] — existing `commit()` and `listSkills()` happy-path tests (F4/F5 tests extend this)
- [Source: apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts lines 235-251] — `injectGitConfig()` failure-path test pattern (F4 follows this pattern)
- [Source: apps/agent-be/test/helpers/mock-daytona.ts] — typed mock of the `@daytonaio/sdk` boundary
- [Source: apps/agent-be/test/helpers/sandbox-service.fake.ts] — in-memory `ISandboxService` fake
- [Source: _bmad-output/planning-artifacts/architecture.md line 667] — data flow (sandbox process exec → sandbox-agent → agui-event-bridge → SSE → browser)
- [Source: _bmad-output/planning-artifacts/architecture.md line 622] — credential failure propagation (NFR-R1)
- [Source: _bmad-output/planning-artifacts/architecture.md line 88] — manual commit (FR-15) is a platform-level operation via Daytona process execution API
- [Source: _bmad-output/project-context.md] — `FILE_MODIFYING_TOOLS` Set + working-tree emission pattern, `logger.warn()` in catch blocks, `GIT_REMOTE_COMMAND` gate, discriminated-union classifier return, `.no-scrollbar` (N/A), test-seam fakes pattern
- [Source: _bmad-output/decision-policy.md] — DP-3 (simplest option), DP-5 (defer scope temptation)

## Dev Agent Record

### Agent Model Used

glm-5.2-fast (neuralwatt/glm-5.2-fast)

### Debug Log References

- RED confirmation (F4 git-add-empty): `Received message: ""` — current code threw `Error('')` because `git add` writes failures to stderr (SDK `ExecuteResponse.result` is stdout-only). Fixed in Task 1.2.
- RED confirmation (F5 exitCode-gate): `Received [{"name":"some junk"}]` — current code parsed junk stdout without an exitCode check. Fixed in Task 2.2.
- Task 3.1 + 3.2 regression guards passed immediately on activation (production already targets the sandbox filesystem).

### Completion Notes List

- **Task 1 (F4 — commit() empty error message):** Activated both F4 scaffolds (removed `it.skip`). Confirmed the git-add-empty test failed RED with `Received message: ""`. Applied the F4 fix to both throw sites in `SandboxService.commit()`: `throw new Error(response.result || \`git ${step} failed (exit code ${response.exitCode})\`)`. The `||` fallback surfaces the exit code when `result` is empty (stderr-only failures). Both F4 tests now pass. Decision (DP-3): simplest option — no SDK changes, no new fields.
- **Task 2 (F5 — listSkills() exitCode gate):** Activated all three F5 scaffolds (removed `it.skip`). Confirmed the exitCode-gate test failed RED with `Received [{"name":"some junk"}]`. Applied the F5 fix: added `if (response.exitCode !== 0) { return []; }` before reading `response.result` in `SandboxService.listSkills()`. All three F5 tests now pass (including the `logger.warn` assertion on the catch-block path). Decision (DP-3): 2-line production change making the contract explicit.
- **Task 3 (host-filesystem regression guards):** Activated both Task 3 scaffolds in `agent.service.unit.spec.ts` (removed `it.skip`). Both pass immediately — production already passes `cwd: REPO_SUBDIRECTORY` to `streamAgentEvents` and calls `getWorkingTreeStatus` with the `sandboxId` from the active run. No production change required. Decision (DP-2): the `commit` sandboxId assertion is covered by `manual-commit.service.spec.ts` (not duplicated here — `AgentService` does not call `commit`).
- **REFACTOR:** Removed all transitional phase markers (RED-PHASE SCAFFOLDS headers, "RED until", "passes once activated", "Turns green when", status lines) from the test-file headers in `sandbox.service.nfr-s1.spec.ts` and `agent.service.unit.spec.ts`, and from the ATDD checklist. Updated the test-file header coverage descriptions to describe the active tests. No `it.skip` markers remain for done tasks.
- **NFR pattern verification:** Re-read `project-context.md`. Verified applicable patterns are applied: "Two separate `executeCommand` calls (not `&&`)" (preserved in `commit()`), "check `response.exitCode !== 0` on each call" (both `commit()` sites + new `listSkills()` gate), "`logger.warn()` in catch blocks that return a default value" (existing in `listSkills()`, now explicitly asserted by the F5 test), "Shell-quote all interpolated values" (`shellQuote(message)` preserved in `commit()`).
- **Regression suite:** Full agent-be suite green — 32 suites, 789 tests, 0 failures, 0 skipped. The 7 previously-skipped scaffolds are now active and passing. All existing AC-1/AC-2/AC-3 regression tests pass unchanged. Lint: 0 errors (31 pre-existing warnings in Story 6.1 tests, none from this story's changes).

### File List

- `apps/agent-be/src/sandbox/sandbox.service.ts` — F4 fix (empty error message fallback in `commit()`), F5 fix (exitCode check in `listSkills()`)
- `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` — F4 and F5 SDK-boundary tests activated (removed `it.skip`), transitional phase markers removed from header
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — Task 3 host-filesystem regression guards activated (removed `it.skip`), transitional phase markers removed from header
- `_bmad-output/test-artifacts/atdd-checklist-6-4-verify-working-tree-commit-and-credential-flows.md` — ATDD checklist updated: phase markers removed, implementation checklist marked complete, test execution evidence updated
- `_bmad-output/implementation-artifacts/6-4-verify-working-tree-commit-and-credential-flows.md` — story file (baseline_commit frontmatter, tasks [x], Dev Agent Record, File List, Change Log, Status=review)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updated to in-progress (→ review on completion)

## Test Automation Validation (bmad-testarch-automate, Validate mode)

**Validated:** 2026-07-16 — **PASS**. Independent re-run of `yarn nx test agent-be`: 32 suites, 789 tests passed, 0 failures, 0 skipped (Story 6.4 scope). All 7 new tests (2 F4 + 3 F5 + 2 Task 3 host-fs guards) confirmed active and passing. AC-1..AC-4 coverage verified at the cited line numbers. No production code edited during validation. Full report: `_bmad-output/test-artifacts/automate-validation-report.md`.

**Skipped-test sweep:** 0 skipped tests in Story 6.4 scope. One out-of-scope conditional skip found (`test/integration/platform-env-vars.integration.spec.ts:181`, Story 4.5) — deferred per DP-5 (scope temptation) and the escalation rule (external-service side effects); not a Story 6.4 coverage gap.

## Change Log

- 2026-07-16: Story 6.4 implemented — F4 (`commit()` empty error message fallback) and F5 (`listSkills()` exitCode gate) fidelity-audit fixes applied; 7 ATDD scaffolds activated (2 F4 + 3 F5 + 2 Task 3 host-fs regression guards); all transitional phase markers removed from test-file headers and ATDD checklist; full agent-be regression suite green (789 tests, 0 skipped).
- 2026-07-16: Test automation validation (bmad-testarch-automate, Validate mode) — PASS. 789 tests, 0 skipped in scope; AC-1..AC-4 coverage confirmed; 1 out-of-scope skip deferred (DF-1, Story 4.5 platform-env-vars). No production code changes.
- 2026-07-16: Tech-writer review (bmad-agent-tech-writer) — appended 1 new pattern to `project-context.md` ("`ExecuteResponse.result` is stdout-only — use `||` fallback for empty-result failure throws (F4 pattern)"), correcting the existing rule's claim that `result` "contains stderr/stdout". Recorded 4 `installBinaries()` throw sites in `deferred-work.md` that do not follow the new pattern (low severity — prefix already identifies the step; exit code is supplementary). The `injectGitConfig()` violation was already recorded. Story marked Done in story file and `sprint-status.yaml`.

### Review Findings

Code review run 2026-07-16 (Edge Case Hunter + Acceptance Auditor; Blind Hunter skipped). 0 patches, 1 deferred, 8 dismissed.

- [x] [Review][Defer] `listSkills()` exitCode gate returns `[]` without logging [`apps/agent-be/src/sandbox/sandbox.service.ts:259-261`] — deferred: the new `if (response.exitCode !== 0) { return []; }` gate is a failure-return path that returns `[]` silently. The project-context rule (line 147) names `listSkills returns []` as the canonical "warn before returning default" example, but its literal scope is "catch blocks" and the author's comment frames non-zero exitCode as "no skills" (a missing `.claude/skills/` directory is common/benign for non-BMAD repos, where warning would be noisy). Genuine ambiguity: a missing-directory exitCode (expected) vs a permission/corrupt-fs read failure (should be visible) are indistinguishable. Needs owner decision on whether to warn uniformly, distinguish missing-dir from read-failure, or document the exemption explicitly.

#### NFR Evidence Audit (bmad-testarch-nfr, Create mode) — 2026-07-16

Scope: Story 6.4 changed files — `sandbox.service.ts`, `sandbox.service.nfr-s1.spec.ts`, `agent.service.unit.spec.ts`, `agui-event-bridge.service.ts`.

NFR categories checked against changed code:
- **Performance (select projections, take limits, timeouts):** No Prisma queries in changed code — `sandbox.service.ts` uses Daytona SDK `executeCommand`/`git.status` calls, not Prisma. The `executeCommand` timeout parameter (`10` seconds) is pre-existing and unchanged by this story. No timing tests required by ACs (story is verification, not performance). No findings.
- **Security (shell injection, security headers):** `shellQuote(message)` preserved in `commit()`; `listSkills()` uses a constant path (`ls -1 .claude/skills/`); `agui-event-bridge.service.ts` change is comment-only. No HTTP responses or controllers touched — no security-header concerns. No findings.
- **Reliability (error-message quality, failure-path observability):** 1 new finding (NFR-1 below); 1 already-deferred item (the `listSkills` exitCode-gate-no-log, recorded above and in `deferred-work.md`).
- **Maintainability:** No findings.

Findings:

- **[NFR-1][MEDIUM][Defer] `injectGitConfig()` has the same F4 empty-error-message bug that `commit()` just fixed** [`apps/agent-be/src/sandbox/sandbox.service.ts:192-193, 201-202`] — pre-existing, same file, same SDK boundary, not introduced by this story. The F4 fix applied the `|| \`git ${step} failed (exit code ${exitCode})\`` fallback to both throw sites in `commit()`, but the sibling `injectGitConfig()` method 30 lines above retains `throw new Error(nameResponse.result)` / `throw new Error(emailResponse.result)` with no fallback. The story's Dev Notes dismiss this with "git config writes its error to stdout" — **empirically false**: `git config user.name "test"` run in a non-git directory exits 128 with empty stdout and `fatal: not in a git directory` on stderr (verified). The SDK's `ExecuteResponse.result` is stdout-only (established by the F4 finding), so a real `git config` failure produces `result: ''` and `throw new Error('')` — the exact unactionable empty-error bug F4 fixed. The existing tests (`nfr-s1.spec.ts:235-241`) mock non-empty `result` strings (`'git config failed'`, `'email config failed'`), giving false confidence — they never exercise the empty-`result` path that occurs in reality. Remediation: apply the same `||` fallback to both throw sites in `injectGitConfig()` and add an empty-`result` test case mirroring the F4 `commit()` tests. Pre-existing (the `injectGitConfig` code is unchanged by this story) → recorded in `deferred-work.md` for a future story whose scope touches `sandbox.service.ts` git-config paths.

- **[NFR-2][LOW][Already deferred] `listSkills()` exitCode gate returns `[]` without logging** [`apps/agent-be/src/sandbox/sandbox.service.ts:259-261`] — already recorded in the Review Findings above and in `deferred-work.md`. No new action; carried forward as before.

No NFR findings were introduced by this story's code changes (the F4 and F5 fixes are correctness improvements, not NFR regressions). No NFR findings have a straightforward remediation that this story should have applied to a location it touched — NFR-1 is pre-existing code that this story did not modify.
