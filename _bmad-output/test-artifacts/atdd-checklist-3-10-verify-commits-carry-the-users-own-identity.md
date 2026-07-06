---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-06'
workflowType: testarch-atdd
storyId: '3.10'
storyKey: '3-10-verify-commits-carry-the-users-own-identity'
storyFile: '_bmad-output/implementation-artifacts/3-10-verify-commits-carry-the-users-own-identity.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-3-10-verify-commits-carry-the-users-own-identity.md'
generatedTestFiles:
  - 'apps/agent-be/src/conversations/conversations.service.spec.ts'
  - 'apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts'
  - 'apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts'
inputDocuments:
  - '_bmad-output/implementation-artifacts/3-10-verify-commits-carry-the-users-own-identity.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/decision-policy.md'
  - 'apps/agent-be/src/sandbox/sandbox.service.ts'
  - 'apps/agent-be/src/conversations/conversations.service.ts'
  - 'apps/agent-be/src/conversations/manual-commit.service.ts'
  - 'apps/agent-be/test/helpers/sandbox-service.fake.ts'
  - 'apps/agent-be/test/helpers/agent-service.fake.ts'
  - 'apps/agent-be/src/conversations/conversations.service.spec.ts'
  - 'apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts'
  - 'apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts'
---

# ATDD Checklist - Epic 3, Story 3.10: Verify Commits Carry the User's Own Identity

**Date:** 2026-07-06
**Author:** Marius
**Primary Test Level:** Unit + Integration + Regression Guard (E2E deferred — no browser-level mock covers the ACs)

---

## Story Summary

As a user whose work gets committed through a Conversation, I want my name and email to be the actual author identity on the resulting commit, as my teammates would see it in GitHub, so that my contribution is visibly mine, not attributed to a generic platform bot.

**As a** user whose work gets committed through a Conversation
**I want** my name and email to be the actual author identity on the resulting commit
**So that** my contribution is visibly mine, not attributed to a generic platform bot

---

## Acceptance Criteria

1. **AC-1:** A commit produced through a Conversation carries the user's resolved git identity — author name and email match the identity resolved in Story 1.5, not a shared platform service account.
2. **AC-2:** Two different users' commits carry their own distinct identities — each carries that user's own distinct identity, confirming attribution is per-user end-to-end.
3. **AC-3:** The noreply-email fallback case lands on the commit — when the user's OAuth profile returns no primary email, the commit author email is the `{github_username}@users.noreply.github.com` fallback.

---

## Story Integration Metadata

- **Story ID:** `3.10`
- **Story Key:** `3-10-verify-commits-carry-the-users-own-identity`
- **Story File:** `_bmad-output/implementation-artifacts/3-10-verify-commits-carry-the-users-own-identity.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-3-10-verify-commits-carry-the-users-own-identity.md`
- **Generated Test Files:**
  - `apps/agent-be/src/conversations/conversations.service.spec.ts` (unit, 13 new tests)
  - `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (regression guard, 4 new tests)
  - `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` (integration, 2 new tests)

---

## E2E Deferral Analysis (Browser-Level Mock Verification)

Per user instruction: "Before deferring E2E coverage, verify no browser-level mock pattern can simulate the scenario — only defer if no mock covers the ACs, and record the check in the ATDD checklist."

### AC-1: A commit produced through a Conversation carries the user's resolved git identity

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-1's core behavior is entirely backend-internal. The identity chain is:
1. `resolveGitIdentity` reads the User profile from Postgres (`name`, `email`, `githubLogin`) and applies fallbacks (name to `githubLogin`, email to `{githubLogin}@users.noreply.github.com`).
2. `injectGitConfig` runs `git config user.name` and `git config user.email` inside the Daytona sandbox via `sandbox.process.executeCommand()`.
3. `commit()` runs `git commit -m <message>` without `--author`, so the commit author is determined by the injected `user.name`/`user.email` git config.
4. The commit author is only visible via `git log` inside the sandbox or the GitHub UI (external service with side effects).

A browser-level mock (Playwright `page.route()` / `addInitScript`) can intercept HTTP responses and inject SSE events into a mock `EventSource`, but it **cannot**:
- Verify that `injectGitConfig` was called with the correct identity (backend method call, not browser-observable)
- Verify that `git config user.name`/`user.email` was set in the sandbox (Daytona `executeCommand` API call, not browser-observable)
- Verify that `commit()` does not use `--author` (command string inspection, not browser-observable)
- Inspect the actual git commit author (requires `git log` in the sandbox via Daytona API, not browser-observable)
- Verify the GitHub UI attribution (external service with side effects — not testable in CI)

The only browser-observable aspect would be the GitHub UI showing the commit author, but that requires:
- A real Daytona sandbox (not available in CI)
- A real GitHub repository (external service with side effects)
- The Playwright auth-setup infrastructure (broken — Story 3.9 deferred finding: `POST /api/internal/test/seed-user` hangs)

**Coverage:** Unit tests (conversations.service.spec.ts, 7 tests — identity resolution + injection + ordering) + Regression guard (sandbox.service.nfr-s1.spec.ts, 4 tests — no `--author`, no platform account, both config fields set, exitCode guard) + Integration test (sandbox-lifecycle.integration.spec.ts, 1 test — end-to-end provision → commit carries identity) cover AC-1 at the appropriate level.

**Decision (DP-5):** E2E deferred for AC-1. No browser-level mock covers the backend-internal git config injection and commit authorship behavior. The structural verification (inject config + commit uses git config + no `--author` + exitCode checked) is sufficient proof because git's authorship behavior is stable and documented: `git commit` without `--author` uses `user.name`/`user.email` from config.

### AC-2: Two different users' commits carry their own distinct identities

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-2's core behavior is the same as AC-1 but for two users. The distinctness is in the git commit author, which is backend-internal. A browser-level mock cannot:
- Verify two different sandbox sessions have different git configs (backend Map state, not browser-observable)
- Inspect the commit authors in two different sandboxes (requires Daytona `executeCommand` calls)
- Verify the per-user identity resolution produces distinct results (backend `resolveGitIdentity` method)

The same blockers apply as AC-1: no Daytona in CI, broken Playwright auth setup, external GitHub service.

**Coverage:** Unit tests (conversations.service.spec.ts, 2 tests — two-user distinct commit identities + distinct injected configs before commit) + Integration test (sandbox-lifecycle.integration.spec.ts, 1 test — two users through full NestJS module wiring) cover AC-2 at the appropriate level.

**Decision (DP-5):** E2E deferred for AC-2. No browser-level mock covers the per-user git config injection and commit authorship distinctness. The structural verification proves the full chain: per-user identity resolution → per-user git config injection → per-user commit author.

### AC-3: The noreply-email fallback case lands on the commit

**Can a browser-level mock simulate this?** No.

**Reasoning:** AC-3's core behavior is the noreply-email fallback in `resolveGitIdentity` (backend method) and the injected email on the commit (backend git config). A browser-level mock cannot:
- Verify the email fallback logic (`{githubLogin}@users.noreply.github.com` when email is null/empty) — this is a backend `resolveGitIdentity` method
- Verify the injected email is on the commit author — requires inspecting the git config or `git log` in the sandbox
- Inspect the commit author email in the sandbox — requires Daytona `executeCommand`

The same blockers apply as AC-1: no Daytona in CI, broken Playwright auth setup.

**Coverage:** Unit tests (conversations.service.spec.ts, 3 tests — email falls back to noreply when null, email falls back to noreply when empty/whitespace, noreply-fallback user's commit carries the fallback email) cover AC-3 at the appropriate level.

**Decision (DP-5):** E2E deferred for AC-3. No browser-level mock covers the noreply-email fallback resolution and commit attribution. The structural verification proves the fallback logic in `resolveGitIdentity` and that the fallback email lands on the commit via the fake's `author` stamping.

### E2E Deferral Summary

All three ACs are backend-internal behaviors that no browser-level mock can cover. The core issue is that git commit authorship is determined by:
1. `injectGitConfig` setting `git config user.name`/`user.email` in the sandbox (Daytona API call)
2. `commit()` running `git commit` without `--author` (Daytona API call)
3. The commit author being visible only via `git log` in the sandbox or the GitHub UI

None of these are browser-observable. A browser-level mock can only intercept HTTP/SSE traffic, not Daytona sandbox process execution or git config state.

Additionally, the real-sandbox E2E is blocked by:
1. No Daytona availability in CI
2. Broken Playwright auth-setup infrastructure (Story 3.9 deferred finding: `POST /api/internal/test/seed-user` hangs)

The structural verification (unit + integration + regression tests) is sufficient proof for all ACs.

---

## Red-Phase Test Scaffolds Created

### Unit Tests (13 tests)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

#### describe('[P0] Story 3.10 — git identity resolution + injection (AC-1, AC-3)')

- **Test:** `[P0] resolveGitIdentity resolves name + email from the User profile`
  - **Status:** RED — `it.skip()` — `SandboxServiceFake.getInjectedGitConfig()` does not exist yet (Task 2 not implemented); fake's `injectGitConfig` discards config
  - **Verifies:** AC-1 (exact identity resolution from User profile, not just shape)

- **Test:** `[P0] name falls back to githubLogin when name is null`
  - **Status:** RED — `it.skip()` — `getInjectedGitConfig()` does not exist yet
  - **Verifies:** AC-1 (name fallback to githubLogin)

- **Test:** `[P0] name falls back to githubLogin when name is empty/whitespace`
  - **Status:** RED — `it.skip()` — `getInjectedGitConfig()` does not exist yet
  - **Verifies:** AC-1 (name fallback for empty/whitespace)

- **Test:** `[P0] email falls back to {githubLogin}@users.noreply.github.com when email is null (AC-3)`
  - **Status:** RED — `it.skip()` — `getInjectedGitConfig()` does not exist yet
  - **Verifies:** AC-3 (noreply email fallback)

- **Test:** `[P0] email falls back to noreply when email is empty/whitespace`
  - **Status:** RED — `it.skip()` — `getInjectedGitConfig()` does not exist yet
  - **Verifies:** AC-3 (noreply email fallback for empty/whitespace)

- **Test:** `[P0] provisionSandbox injects the resolved identity BEFORE emitting SESSION_READY (AC-1 agent-commit path)`
  - **Status:** RED — `it.skip()` — test asserts ordering via `invocationCallOrder`; inject-before-SESSION_READY is already implemented but the test is skipped pending Task 2 fake extension for consistency with the block
  - **Verifies:** AC-1 (git config injected before agent can run — agent-commit path)

- **Test:** `[P0] resumeConversation fast-path re-injects the same identity (AC-1 on resume)`
  - **Status:** RED — `it.skip()` — `getInjectedGitConfig()` does not exist yet
  - **Verifies:** AC-1 (identity re-injection on resume)

#### describe('[P0] Story 3.10 — commit carries the user\'s injected identity (AC-1, AC-3)')

- **Test:** `[P0] a manual save commit carries the user\'s injected name + email (AC-1)`
  - **Status:** RED — `it.skip()` — fake's `commit()` does not stamp `author` yet (Task 2 not implemented)
  - **Verifies:** AC-1 (manual save commit carries injected identity)

- **Test:** `[P0] the commit author is NOT a platform service account (AC-1)`
  - **Status:** RED — `it.skip()` — fake's `commit()` does not stamp `author` yet
  - **Verifies:** AC-1 (negative assertion — no platform service account)

- **Test:** `[P0] noreply-fallback user\'s commit carries the fallback email (AC-3)`
  - **Status:** RED — `it.skip()` — fake's `commit()` does not stamp `author` yet
  - **Verifies:** AC-3 (noreply fallback email on commit)

- **Test:** `[P0] a commit with no prior injectGitConfig records author: undefined (regression guard)`
  - **Status:** RED — `it.skip()` — fake's `commit()` does not stamp `author` yet
  - **Verifies:** AC-1 (regression guard — commit without injected config has no attributed identity)

#### describe('[P0] Story 3.10 — two users carry distinct commit identities (AC-2)')

- **Test:** `[P0] two users each commit in their own Conversation — each commit carries that user\'s own distinct identity`
  - **Status:** RED — `it.skip()` — fake's `commit()` does not stamp `author` yet (Task 2 not implemented)
  - **Verifies:** AC-2 (per-user distinct commit identities end-to-end)

- **Test:** `[P0] the two injected configs are distinct before any commit`
  - **Status:** RED — `it.skip()` — `getInjectedGitConfig()` does not exist yet
  - **Verifies:** AC-2 (per-user injection distinctness independent of commit path)

### Regression Guard Tests (4 tests)

**File:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts`

#### describe('[P0] Story 3.10 — commit attribution regression guards (AC-1)')

- **Test:** `[P0] commit() command does not include --author`
  - **Status:** RED — `it.skip()` — test is a regression guard against future `--author` addition; skipped pending Task 1 implementation for consistency with the block
  - **Verifies:** AC-1 (absence of `--author` guarantees commit carries injected identity)

- **Test:** `[P0] commit() command does not interpolate a platform service account`
  - **Status:** RED — `it.skip()` — regression guard against hardcoded platform identity
  - **Verifies:** AC-1 (no platform service account in commit command)

- **Test:** `[P0] injectGitConfig() sets BOTH user.name and user.email`
  - **Status:** RED — `it.skip()` — explicit attribution assertion documenting the Story 3.10 invariant
  - **Verifies:** AC-1 (both git config fields set)

- **Test:** `[P0] injectGitConfig() throws when git config fails (Task 1 fix)`
  - **Status:** RED — `it.skip()` — `injectGitConfig` does not check `exitCode` yet (Task 1 not implemented)
  - **Verifies:** AC-1 (silent-failure gap closed — fail loudly over mis-attribution, DP-1)

### Integration Tests (2 tests)

**File:** `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts`

- **Test:** `[P0] provision injects identity — manual commit carries it (AC-1)`
  - **Status:** RED — `it.skip()` — fake's `commit()` does not stamp `author` yet (Task 2 not implemented)
  - **Verifies:** AC-1 (end-to-end through full NestJS module wiring: provision → inject → commit carries identity)

- **Test:** `[P0] two users — distinct commit authors (AC-2)`
  - **Status:** RED — `it.skip()` — fake's `commit()` does not stamp `author` yet
  - **Verifies:** AC-2 (two users through full NestJS module wiring — distinct commit authors)

---

## Data Factories Created

No new data factories created. Tests reuse existing test infrastructure:
- `SandboxServiceFake` (test helper) — to be extended in Task 2 with `getInjectedGitConfig()` and `author` stamping
- `AgentServiceFake` (test helper) — `isIdle()` returns `true` by default, enabling the manual-commit path
- `buildTestModule()` from `test-module-builder.ts` (NestJS test module factory)

---

## Fixtures Created

No new fixtures created. Tests reuse existing test infrastructure:
- `mockPrisma` setup in `beforeEach` (conversations.service.spec.ts) — default user `{ name: 'Test User', email: 'test@example.com', githubLogin: 'testuser' }`
- `mockPrisma` setup in `beforeEach` (sandbox-lifecycle.integration.spec.ts) — same default user
- `mockDaytona`/`mockSandbox` setup in `beforeEach` (sandbox.service.nfr-s1.spec.ts) — `executeCommand` mocked

---

## Mock Requirements

### SandboxServiceFake Extension (Unit + Integration Tests)

**Method:** `injectGitConfig(sandboxId, config)` — to be extended in Task 2 to store config in `injectedGitConfigs` Map (was a no-op discard)

**Method:** `commit(sandboxId, message)` — to be extended in Task 2 to stamp each recorded commit with `author` from `injectedGitConfigs`

**New method:** `getInjectedGitConfig(sandboxId)` — inspection hook returning the last-injected `GitUserConfig` for a sandbox

### SandboxService Mock (Regression Guard Tests)

**Method:** `sandbox.process.executeCommand` — already mocked in `sandbox.service.nfr-s1.spec.ts`; Task 6.4 tests the `exitCode !== 0` guard (Task 1 fix)

### Prisma Mock (Two-User Tests)

**Method:** `user.findUnique` — uses `mockImplementation` keyed on `where.id` to return distinct users (Alice and Bob)
**Method:** `conversation.create` / `conversation.findFirst` — uses `mockImplementation` keyed on `userId`/`id` so two conversations coexist

---

## Required data-testid Attributes

No new `data-testid` attributes required. Story 3.10 is backend-only — no UI changes.

---

## Implementation Checklist

### Test: resolveGitIdentity resolves name + email from the User profile (AC-1)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 2.1: Add `injectedGitConfigs` Map to `SandboxServiceFake`
- [ ] Task 2.2: Update `injectGitConfig` to store config instead of discarding
- [ ] Task 2.5: Add `getInjectedGitConfig(sandboxId)` inspection hook
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN — no production change needed, `resolveGitIdentity` already correct)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 0.5 hours

---

### Test: injectGitConfig() throws when git config fails (Task 1 fix) (AC-1)

**File:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 1.1: Add `exitCode !== 0` check to `injectGitConfig` in `sandbox.service.ts`
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern sandbox.service.nfr-s1.spec`

**Estimated Effort:** 0.5 hours

---

### Test: a manual save commit carries the user's injected name + email (AC-1)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 2.3: Update `commitCalls` type and `commit()` to stamp author from `injectedGitConfigs`
- [ ] Task 2.4: Update `getCommitCalls()` return type to include `author?: GitUserConfig`
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN — no production change needed, `commit()` already uses `git commit -m` without `--author`)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 0.5 hours

---

### Test: two users each commit in their own Conversation — distinct identities (AC-2)

**File:** `apps/agent-be/src/conversations/conversations.service.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 2.1-2.6: Full `SandboxServiceFake` extension (capture config, stamp commits, inspection hook, destroy cleanup)
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern conversations.service.spec`

**Estimated Effort:** 1 hour

---

### Test: provision injects identity — manual commit carries it (AC-1, integration)

**File:** `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts`

**Tasks to make this test pass:**

- [ ] Task 2.1-2.6: Full `SandboxServiceFake` extension
- [ ] Remove `it.skip()` and confirm test fails (RED)
- [ ] Verify test passes (GREEN)
- [ ] Run test: `yarn nx test agent-be -- --testPathPattern sandbox-lifecycle.integration.spec`

**Estimated Effort:** 0.5 hours

---

## Running Tests

```bash
# Run all agent-be tests
yarn nx test agent-be

# Run conversations.service.spec.ts (Tasks 3, 4, 5)
yarn nx test agent-be -- --testPathPattern conversations.service.spec

# Run sandbox.service.nfr-s1.spec.ts (Task 6)
yarn nx test agent-be -- --testPathPattern sandbox.service.nfr-s1.spec

# Run sandbox-lifecycle.integration.spec.ts (Task 7)
yarn nx test agent-be -- --testPathPattern sandbox-lifecycle.integration.spec

# Typecheck
npx tsc --noEmit -p apps/agent-be/tsconfig.app.json

# Lint
yarn nx lint agent-be
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- All tests written as red-phase scaffolds with `it.skip()`
- Tests assert EXPECTED behavior (not placeholder assertions)
- E2E deferral analysis recorded with browser-level mock verification
- Decision records for all autonomous decisions
- Implementation checklist created

**Verification:**

- All 19 generated tests are present and marked with `it.skip()`
- Tests will fail when un-skipped because Task 1 (exitCode check) and Task 2 (fake extension) are not implemented yet
- Activation guidance: remove `it.skip()` for the current task, confirm RED, then implement

---

### GREEN Phase (DEV Team — Next Steps)

**DEV Agent Responsibilities:**

1. **Implement Task 1** (exitCode check on `injectGitConfig`) — un-skip Task 6.4 test, confirm RED, implement, confirm GREEN
2. **Implement Task 2** (extend `SandboxServiceFake`) — un-skip Task 3.1 test, confirm RED, implement, confirm GREEN
3. **Un-skip remaining tests** one at a time, confirm RED, verify GREEN (most tests pass immediately after Task 2 — production code is already correct)
4. **Run full test suite** — `yarn nx test agent-be`
5. **Lint + typecheck** — `yarn nx lint agent-be` + `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json`

**Key Principles:**

- One test at a time (don't try to fix all at once)
- Minimal implementation (don't over-engineer)
- Run tests frequently (immediate feedback)

---

### REFACTOR Phase (DEV Team — After All Tests Pass)

1. Verify all 19 tests pass
2. Review code for quality
3. Ensure tests still pass after each refactor
4. No production code changes expected beyond Task 1 (the fake extension in Task 2 is test-only)

---

## Decision Records

**Decision (DP-5):** E2E deferred for all ACs (AC-1, AC-2, AC-3). Per user instruction, verified no browser-level mock can simulate the scenario for each AC before deferring. The core behavior is backend-internal: `injectGitConfig` sets git config in the Daytona sandbox, `commit()` runs `git commit` without `--author`, and the commit author is only visible via `git log` in the sandbox or the GitHub UI. A browser-level mock can intercept HTTP/SSE traffic but cannot verify Daytona `executeCommand` calls, git config state, or commit authorship. Additionally, real-sandbox E2E is blocked by no Daytona in CI and broken Playwright auth setup (Story 3.9 deferred finding). The structural verification (unit + integration + regression tests) is sufficient proof.

**Decision (DP-4):** Test scaffolds use `it.skip()` (Jest) rather than `test.skip()` (Playwright) because Story 3.10 is a backend-only story using Jest, not Playwright. Test-only change, decided autonomously.

**Decision (DP-3):** Tests are added to existing spec files (`conversations.service.spec.ts`, `sandbox.service.nfr-s1.spec.ts`, `sandbox-lifecycle.integration.spec.ts`) rather than creating new files. The story specifies these files and they already have the required test infrastructure (mock setup, helpers, module wiring). Simplest reversible option — avoids duplicating setup.

**Decision (DP-4):** The `manualCommit` tests (Task 4) do NOT mock `requestCommit` — they let the real `ManualCommitService.requestCommit` run through to `sandboxFake.commit()`. This is necessary to verify the commit carries the injected identity. The `AgentServiceFake.isIdle()` returns `true` by default, so the manual-commit path works without override. Test-only approach decision, recorded because it differs from the existing Story 3.6 test pattern (which mocks `requestCommit`).

---

## Knowledge Base References Applied

This ATDD workflow consulted the following knowledge fragments and project patterns:

- **test-quality.md** — Given-When-Then structure, one assertion per test, exact-match over shape-match assertions
- **test-levels-framework.md** — Test level selection (Unit for identity resolution, Integration for end-to-end, Regression Guard for invariants)
- **test-priorities-matrix.md** — P0 for all AC-covering tests
- **test-healing-patterns.md** — `it.skip()` red-phase scaffolds with activation guidance
- **Project context** — test-seam fakes mimic production side effects, `exitCode` check rule, shell-quoting, deliberate cross-service duplication, regression-guard assert-absence pattern

---

## Test Execution Evidence

### Initial Scaffold Review / RED Verification

**Command:** `yarn nx test agent-be -- --testPathPattern "conversations.service.spec|sandbox.service.nfr-s1.spec|sandbox-lifecycle.integration.spec"`

**Expected Results:**

- Total tests: 19 new (all `it.skip()`)
- Skipped: 19 (expected before activation)
- Passing: 0 (expected — implementation not done yet)
- Status: Red-phase scaffolds verified

**Expected Skip Behavior:**
- All 19 tests are marked `it.skip()` — Jest reports them as skipped
- When a developer removes `it.skip()` for a task, the test should fail because Task 1 (exitCode check) and Task 2 (fake extension) are not implemented yet
- After implementing Task 1 + Task 2, most tests pass immediately (production code is already correct — the story is a verification story)

---

## Notes

- Story 3.10 is a **verification story** — the production code (`resolveGitIdentity`, `injectGitConfig`, `commit`, `provisionSandbox`, `resumeConversation`) is already implemented. The story adds tests to verify commit attribution end-to-end and closes one correctness gap (Task 1: `exitCode` check on `injectGitConfig`).
- The `SandboxServiceFake` extension (Task 2) is the key test enabler — the existing fake discards the injected config, making the commit-identity chain unverifiable. The extension follows the established `getCommitCalls()` / `setSkills()` / `failNextCommit()` control-hook pattern.
- The `AgentServiceFake.isIdle()` returns `true` by default (`!this.activeRun`), so the manual-commit path works without override in unit tests.
- The integration test uses `setImmediate` to drain the fire-and-forget provision from `createConversation`.

---

## Next Steps

1. **Link this checklist** into the story file `Dev Notes` / `ATDD Artifacts` section
2. **Implement Task 1** (exitCode check) — un-skip Task 6.4 test first
3. **Implement Task 2** (fake extension) — un-skip Task 3.1 test first
4. **Un-skip remaining tests** one at a time, confirm RED → implement → confirm GREEN
5. **Run full test suite** — `yarn nx test agent-be`
6. **Lint + typecheck** — `yarn nx lint agent-be` + `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json`
7. **When all tests pass**, refactor if needed, then update story status to 'done'

---

**Generated by BMad TEA Agent** - 2026-07-06
