---
baseline_commit: e20d012dcea35f583a7924248310716f6f64a2e6
---

# Story 3.10: Verify Commits Carry the User's Own Identity

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user whose work gets committed through a Conversation,
I want my name and email to be the actual author identity on the resulting commit, as my teammates would see it in GitHub,
so that my contribution is visibly mine, not attributed to a generic platform bot.

## Acceptance Criteria

### AC-1: A commit produced through a Conversation carries the user's resolved git identity

**Given** a commit produced through an Agent `git commit` (Story 3.4) or a manual Save (Story 3.6)
**When** the commit is inspected via `git log` or the GitHub UI
**Then** the author name and email match the identity resolved in Story 1.5 for the user who triggered it — not a shared platform service account

### AC-2: Two different users' commits carry their own distinct identities

**Given** two different users each commit in their own Conversation against the same repository
**When** their respective commits are inspected
**Then** each carries that user's own distinct identity, confirming attribution is per-user end-to-end and not just correct in isolation

### AC-3: The noreply-email fallback case lands on the commit

**Given** the noreply-email fallback case from Story 1.5 (user's OAuth profile returns no primary email)
**When** that user's commit is inspected
**Then** the commit author email is the `{github_username}@users.noreply.github.com` fallback, and GitHub still attributes the commit to that user's profile

## Tasks / Subtasks

- [x] Task 1: Add `exitCode` check to `SandboxService.injectGitConfig` (AC: 1)
  - [x] 1.1 In `apps/agent-be/src/sandbox/sandbox.service.ts`, `injectGitConfig` (lines 88-102) currently awaits two `executeCommand` calls (`git config user.name`, `git config user.email`) without checking `exitCode`. A silent failure leaves the sandbox's default git config in place, causing the resulting commit to carry the wrong (platform default) identity — a direct AC-1 violation. Add the same `exitCode !== 0` guard `commit()` uses (lines 128-130, 137-139):
    ```typescript
    async injectGitConfig(sandboxId: string, config: GitUserConfig): Promise<void> {
      const sandbox = await this.getSandbox(sandboxId);
      const nameResponse = await sandbox.process.executeCommand(
        `git config user.name ${this.shellQuote(config.name)}`,
        undefined, undefined, 10,
      );
      if (nameResponse.exitCode !== 0) {
        throw new Error(nameResponse.result);
      }
      const emailResponse = await sandbox.process.executeCommand(
        `git config user.email ${this.shellQuote(config.email)}`,
        undefined, undefined, 10,
      );
      if (emailResponse.exitCode !== 0) {
        throw new Error(emailResponse.result);
      }
    }
    ```
    A thrown error here propagates through `provisionSandbox` / `resumeConversation` fast-path → `SESSION_ERROR` → the user sees "Starting your session…" fail with a retry, not a silently mis-attributed commit. This is the correct failure mode: fail loudly over reporting false success (DP-1).

- [x] Task 2: Extend `SandboxServiceFake` to capture injected git config and stamp commits with author (AC: 1, 2, 3)
  - [x] 2.1 In `apps/agent-be/test/helpers/sandbox-service.fake.ts`, add a private `injectedGitConfigs = new Map<string, GitUserConfig>()` field alongside the existing `sandboxes` Map.
  - [x] 2.2 Update `injectGitConfig` (line 86) to store the config instead of discarding it (`_config` → `config`):
    ```typescript
    async injectGitConfig(sandboxId: string, config: GitUserConfig): Promise<void> {
      if (!this.sandboxes.has(sandboxId)) throw new Error(`SandboxServiceFake: sandbox ${sandboxId} not found`);
      this.injectedGitConfigs.set(sandboxId, { ...config });
    }
    ```
  - [x] 2.3 Update the `commitCalls` field type (line 23) and `commit()` (lines 95-101) to stamp each recorded commit with the last-injected config as `author`:
    ```typescript
    private readonly commitCalls: Array<{ sandboxId: string; message: string; author?: GitUserConfig }> = [];
    // ...
    async commit(sandboxId: string, message: string): Promise<void> {
      const author = this.injectedGitConfigs.get(sandboxId);
      this.commitCalls.push({ sandboxId, message, author: author ? { ...author } : undefined });
      if (this.shouldFailNextCommit) {
        this.shouldFailNextCommit = false;
        throw new Error('SandboxServiceFake: simulated commit failure');
      }
    }
    ```
    `author: undefined` when no config was injected is intentional — a commit with no injected config would carry the sandbox default identity, and a test asserting `author` is defined and matches the user catches that regression.
  - [x] 2.4 Update `getCommitCalls()` (line 46) return type to `Array<{ sandboxId: string; message: string; author?: GitUserConfig }>`.
  - [x] 2.5 Add an inspection hook mirroring the existing `getCommitCalls()` / `activeSandboxCount()` pattern:
    ```typescript
    /** Inspection: the git config last injected for a sandbox. */
    getInjectedGitConfig(sandboxId: string): GitUserConfig | undefined {
      return this.injectedGitConfigs.get(sandboxId);
    }
    ```
  - [x] 2.6 Clear `injectedGitConfigs` in `destroy()` when the sandbox is deleted (keeps the two Maps consistent — an already-destroyed sandbox has no injectable config).

- [x] Task 3: Unit tests — `conversations.service.spec.ts` — identity resolution + injection (AC: 1, 3)
  - [x] 3.1 Add a `describe('[P0] Story 3.10 — git identity resolution + injection')` block. The default `mockPrisma.user.findUnique` (lines 56-62) returns `{ name: 'Test User', email: 'test@example.com', githubLogin: 'testuser' }`. Obtain the sandboxId for `getInjectedGitConfig(sandboxId)` by capturing it from the inject spy: `const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig'); await service.provisionSandbox('conv-1', 'user-1'); const sandboxId = injectSpy.mock.calls[0][0];` (the existing tests at lines 111-132 use this spy pattern). Tests:
    - `[P0]` `resolveGitIdentity` resolves name + email from the User profile — provision, then `expect(sandboxFake.getInjectedGitConfig(sandboxId)).toEqual({ name: 'Test User', email: 'test@example.com' })`. Asserts the EXACT identity, not just shape — strengthens the weaker `expect.objectContaining` assertions at lines 470-473 and 537-543 (leave those existing tests in place; they cover Story 3.5 AC-2 re-injection-happens, this covers Story 3.10 exact-identity).
    - `[P0]` name falls back to `githubLogin` when `name` is null — `mockPrisma.user.findUnique.mockResolvedValueOnce({ name: null, email: 'a@b.com', githubLogin: 'alice' })`, provision, assert `getInjectedGitConfig(sandboxId).name === 'alice'`.
    - `[P0]` name falls back to `githubLogin` when `name` is empty/whitespace — same with `name: '   '`, assert `name === 'alice'`.
    - `[P0]` email falls back to `{githubLogin}@users.noreply.github.com` when `email` is null (AC-3) — `mockPrisma.user.findUnique.mockResolvedValueOnce({ name: 'Alice', email: null, githubLogin: 'alice' })`, provision, assert `getInjectedGitConfig(sandboxId).email === 'alice@users.noreply.github.com'`.
    - `[P0]` email falls back to noreply when `email` is empty/whitespace — same with `email: '  '`.
    - `[P0]` `provisionSandbox` injects the resolved identity BEFORE emitting `SESSION_READY` (AC-1 agent-commit path) — provision with `const emitSpy = jest.spyOn(sessionEvents, 'emit')` + `const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig')`, then assert `injectSpy.mock.invocationCallOrder[0]` is less than the `SESSION_READY` emit's invocation order. Find the SESSION_READY emit via `emitSpy.mock.calls.find((c) => c[1].event === 'SESSION_READY')` and compare `emitSpy.mock.invocationCallOrder` at that index. The agent runs only after `SESSION_READY`, so the git config is in place before any agent `git commit`. Reuses the order-assertion pattern at lines 124-131.
    - `[P0]` `resumeConversation` fast-path re-injects the same identity (AC-1 on resume) — provision, then `mockPrisma.user.findUnique.mockResolvedValueOnce({ name: 'Alice V2', email: 'alice-v2@example.com', githubLogin: 'alice' })`, then `resumeConversation('conv-1', 'user-1')`, assert `getInjectedGitConfig(sandboxId)` equals the re-injected `{ name: 'Alice V2', email: 'alice-v2@example.com' }` (the Map is overwritten on re-inject).

- [x] Task 4: Unit tests — `conversations.service.spec.ts` — commit carries injected identity (AC: 1, 3)
  - [x] 4.1 Add a `describe('[P0] Story 3.10 — commit carries the user\'s injected identity')` block. For each test: provision (injects default identity), then `jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['f.ts'] })` so `executeCommit` proceeds to `commit`, then `await service.manualCommit('conv-1', 'user-1')`, then assert on `sandboxFake.getCommitCalls()`. Tests:
    - `[P0]` a manual save commit carries the user's injected name + email (AC-1) — default user, assert `getCommitCalls()[0].author` equals `{ name: 'Test User', email: 'test@example.com' }`.
    - `[P0]` the commit author is NOT a platform service account (AC-1) — assert `author.name` does not match `/bmad|platform|bot|service/i` and `author.email` does not match `/bmad-easy\.com|noreply@platform/i`. Negative assertion guards a future regression that hardcodes a platform identity.
    - `[P0]` noreply-fallback user's commit carries the fallback email (AC-3) — `mockPrisma.user.findUnique.mockResolvedValueOnce({ name: null, email: null, githubLogin: 'janedoe' })`, provision, dirty tree, manualCommit, assert `getCommitCalls()[0].author.email === 'janedoe@users.noreply.github.com'` and `author.name === 'janedoe'`.
    - `[P0]` a commit with no prior `injectGitConfig` records `author: undefined` (regression guard) — call `sandboxFake.commit('sb-x', 'msg')` directly without provisioning, assert `getCommitCalls()[0].author` is `undefined`. Documents that a commit without injected config has no attributed identity — the gap Task 1 prevents in production.

- [x] Task 5: Unit tests — `conversations.service.spec.ts` — two-user distinctness (AC: 2)
  - [x] 5.1 Add a `describe('[P0] Story 3.10 — two users carry distinct commit identities (AC-2)')` block. Use `mockImplementation` so identity and conversation lookups are per-user:
    ```typescript
    mockPrisma.user.findUnique.mockImplementation(({ where: { id } }) => Promise.resolve(
      id === 'user-alice'
        ? { name: 'Alice Lee', email: 'alice@example.com', githubLogin: 'alice' }
        : { name: 'Bob Wong', email: 'bob@example.com', githubLogin: 'bob' }
    ));
    mockPrisma.conversation.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: data.userId === 'user-alice' ? 'conv-a' : 'conv-b', userId: data.userId })
    );
    mockPrisma.conversation.findFirst.mockImplementation(({ where: { id, userId } }) =>
      Promise.resolve(id === 'conv-a' && userId === 'user-alice'
        ? { id: 'conv-a' }
        : id === 'conv-b' && userId === 'user-bob' ? { id: 'conv-b' } : null)
    );
    ```
    Tests:
    - `[P0]` two users each commit in their own Conversation → each commit carries that user's own distinct identity — `const injectSpy = jest.spyOn(sandboxFake, 'injectGitConfig')`, provision `conv-a` as `user-alice`, provision `conv-b` as `user-bob`, capture `sbA = injectSpy.mock.calls[0][0]` / `sbB = injectSpy.mock.calls[1][0]`, set dirty tree on both (`jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['f.ts'] })`), `await service.manualCommit('conv-a', 'user-alice')`, `await service.manualCommit('conv-b', 'user-bob')`, assert `getCommitCalls()` has 2 entries, `calls[0].author` equals `{ name: 'Alice Lee', email: 'alice@example.com' }`, `calls[1].author` equals `{ name: 'Bob Wong', email: 'bob@example.com' }`, and `calls[0].author.email !== calls[1].author.email`.
    - `[P0]` the two injected configs are distinct before any commit — provision both, assert `getInjectedGitConfig(sbA).email !== getInjectedGitConfig(sbB).email` (using the sandboxIds captured from the inject spy). Captures the per-user injection independently of the commit path.

- [x] Task 6: Regression guard — `sandbox.service.nfr-s1.spec.ts` — commit attribution (AC: 1)
  - [x] 6.1 Add a `describe('[P0] Story 3.10 — commit attribution regression guards')` block to the existing `sandbox.service.nfr-s1.spec.ts` (it already has the `mockDaytona`/`mockSandbox` setup with `executeCommand` mocked, and already tests `commit()` + `injectGitConfig()` against the real `SandboxService`). Tests:
    - `[P0]` `commit()` command does not include `--author` — call `service.commit('sandbox-1', 'msg')`, collect the `git commit` command string, assert it does NOT contain `--author`. `--author` would override the injected `user.name`/`user.email`; its absence is what guarantees the commit carries the injected identity.
    - `[P0]` `commit()` command does not interpolate a platform service account — assert the `git commit` command string does NOT contain a hardcoded name/email (e.g. does not match `/--author=|bmad-easy|platform@/`). Complements the existing NFR-S1 "no platform credentials" test (lines 135-152) with an attribution-specific assertion.
    - `[P0]` `injectGitConfig()` sets BOTH `user.name` and `user.email` — call `service.injectGitConfig('sandbox-1', { name: 'A', email: 'a@b.com' })`, collect commands, assert one command contains `git config user.name` and another contains `git config user.email`. Already implicitly covered by lines 120-126, but the explicit attribution assertion documents the Story 3.10 invariant.
    - `[P0]` `injectGitConfig()` throws when `git config` fails (Task 1 fix) — `mockSandbox.process.executeCommand.mockResolvedValueOnce({ exitCode: 1, result: 'git config failed' })`, `await expect(service.injectGitConfig('sandbox-1', { name: 'A', email: 'a@b.com' })).rejects.toThrow('git config failed')`. Proves the silent-failure gap is closed.

- [x] Task 7: Integration test — `sandbox-lifecycle.integration.spec.ts` (AC: 1, 2)
  - [x] 7.1 Add a new test case (the file already uses `buildTestModule` + `SandboxServiceFake` with mock Prisma wired; `AGENT_SERVICE` resolves to the real `AgentService` via `StreamingModule`, whose `isIdle()` returns `true` when no run is active — no override needed for the manual-commit path). Use `jest.useFakeTimers()` only if needed; the manual-commit path does not require timers.
    - `[P0]` end-to-end: provision injects identity → manual commit carries it (AC-1) — `createConversation`, drain provision with `await jest.advanceTimersByTimeAsync(0)` (or `setImmediate` if real timers), set dirty tree via `jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue({ dirty: true, files: ['f.ts'] })`, `POST /save` equivalent (`manualCommit`), assert `sandboxFake.getCommitCalls()[0].author` matches the seeded user's identity.
    - `[P0]` two users → distinct commit authors (AC-2) — seed two users, provision a conversation for each, manualCommit each, assert the two commits carry distinct author identities matching each user. Mirrors Task 5 but through the full NestJS module wiring.

- [x] Task 8: Lint, typecheck, test (AC: all)
  - [x] 8.1 `yarn nx lint agent-be` — 0 errors
  - [x] 8.2 `yarn nx lint web` — 0 errors (no web changes expected; run for safety)
  - [x] 8.3 `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json` — clean
  - [x] 8.4 `yarn nx test agent-be` — all tests pass
  - [x] 8.5 `yarn nx test web` — all tests pass (no web changes expected; run for safety)

## Dev Notes

### ATDD Artifacts

- **Checklist:** `_bmad-output/test-artifacts/atdd-checklist-3-10-verify-commits-carry-the-users-own-identity.md`
- **Unit tests:** `apps/agent-be/src/conversations/conversations.service.spec.ts` (13 new `it.skip()` scaffolds — Tasks 3, 4, 5)
- **Regression guard tests:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (4 new `it.skip()` scaffolds — Task 6)
- **Integration tests:** `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` (2 new `it.skip()` scaffolds — Task 7)
- **E2E:** Deferred for all ACs — no browser-level mock covers backend-internal git config injection and commit authorship (DP-5). See checklist for full analysis.

### Architecture Compliance

- **FR-3 (Commit Attribution) — architecture.md line 40:** "per-session git config injection must happen reliably at Sandbox initialization and every resume for every Conversation." The injection mechanism already exists (`provisionSandbox` line 80, `resumeConversation` fast-path line 328). This story VERIFIES it end-to-end and closes one correctness gap (Task 1).
- **Cross-Cutting Concern #5 (Git transport and commit attribution) — architecture.md line 92:** "Manual commit (FR-15) is a platform-level operation executed via Daytona process execution API, not an agent action." `ManualCommitService.executeCommit` → `SandboxService.commit` is that platform-level operation. The agent `git commit` path (Story 3.4) runs inside the sandbox via the Claude agent's Bash tool — it does NOT go through `SandboxService.commit`, but it DOES use the same injected `user.name`/`user.email` git config. Both paths are covered by AC-1: the manual-save path is verified end-to-end via the fake (Task 4); the agent-commit path is verified structurally (git config is injected before `SESSION_READY`, before the agent can run — Task 3.1 order assertion).
- **Sandbox initialization sequence — architecture.md line 79 / project-context.md:** provision → clone → inject per-user git config → `git status --porcelain` → emit `WORKING_TREE_*` → emit `SESSION_READY`. Git config injection at every provision AND every resume. Already implemented; this story adds the verification.
- **Deliberate cross-service logic duplication — project-context.md:** `resolveGitIdentity` is replicated in `apps/agent-be` (`ConversationsService.resolveGitIdentity`, lines 381-399) from `apps/web/src/lib/git-identity.ts` BY DESIGN. Do NOT extract a shared lib. The agent-be copy reads `User` from Postgres (`select: { name: true, email: true, githubLogin: true }`) and applies the same fallbacks (name→githubLogin, email→`{githubLogin}@users.noreply.github.com`).
- **Shell-quote all interpolated values — project-context.md:** `injectGitConfig` already shell-quotes `config.name` and `config.email` via `shellQuote` (line 91, 97). Task 1's exitCode check does not change the quoting. No new command-injection surface.
- **`exitCode` check on every command where success/failure matters — project-context.md:** "any new command where success/failure matters MUST check `exitCode`." `injectGitConfig` is an existing command where success/failure matters for attribution; Task 1 brings it in line with the established `commit()` pattern. `getWorkingTreeStatus` remains unchecked (pre-existing, deferred per DP-5 — not attribution-critical).

### Library / Framework Requirements

- **`SandboxService`** (`apps/agent-be/src/sandbox/sandbox.service.ts`) — Story 3.1 delivered this. `injectGitConfig` (lines 88-102) and `commit` (lines 120-140) are the attribution-critical methods. Task 1 modifies `injectGitConfig` (adds exitCode check). `commit` is NOT modified — it already uses `git commit -m <message>` with no `--author`, which is what guarantees the commit carries the injected identity. Do NOT add `--author`.
- **`SandboxServiceFake`** (`apps/agent-be/test/helpers/sandbox-service.fake.ts`) — Story 3.1 delivered this. Task 2 EXTENDS it: `injectGitConfig` stores the config (was a no-op discard), `commit` stamps the author, new `getInjectedGitConfig()` inspection hook. Follows the "test-seam fakes mimic production side effects" rule (project-context.md): the real `SandboxService.commit` produces a commit whose author is the injected git config; the fake now reproduces that observable side effect so integration tests can assert on it.
- **`ConversationsService.resolveGitIdentity`** (lines 381-399) — NOT modified. Already correct: name fallback to `githubLogin`, email fallback to `{githubLogin}@users.noreply.github.com`. Task 3 tests it.
- **`ManualCommitService.executeCommit`** (lines 63-108) — NOT modified. Already calls `sandboxService.commit(sandboxId, message)` (line 83). Task 4 tests through it.
- **`@bmad-easy/shared-types` `GitUserConfig`** — `{ name: string; email: string }`. Unchanged. The fake's new `author` field uses this type.

### File Structure Requirements

Files to MODIFY:
- `apps/agent-be/src/sandbox/sandbox.service.ts` — Task 1: `injectGitConfig` exitCode check (production fix, ~6 lines)
- `apps/agent-be/test/helpers/sandbox-service.fake.ts` — Task 2: capture config, stamp commits, `getInjectedGitConfig()` (test-only)
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — Tasks 3-5: Story 3.10 test blocks
- `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` — Task 6: attribution regression guards
- `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` — Task 7: integration tests

> **Note (amended per DP-2 during code review):** `sandbox.service.nfr-s1.spec.ts` was listed as an existing file to MODIFY, but it did not exist at the baseline commit (`e20d012`). The file was created during the Story 3.8 NFR-S1 work batch (uncommitted alongside Stories 3.8–3.10) and extended with Story 3.10 regression guards. The "No new files" constraint below is relaxed for this file — it was supposed to exist from Story 3.8 but was never committed separately.

No new files. No new Prisma models or migrations. No new modules. No `apps/web` changes. No `.env.example` changes.

### Testing Requirements

- **Test priority tags:** `[P0]` for all AC-covering tests (identity resolution, commit carries identity, two-user distinctness, noreply fallback, exitCode guard). `[P1]` for edge cases if any arise (none currently identified — all ACs are P0).
- **Fake extension is the test enabler:** the existing fake discards the injected config, making the commit-identity chain unverifiable. Task 2's extension follows the established `getCommitCalls()` / `setSkills()` / `failNextCommit()` control-hook pattern — no new test infrastructure.
- **`mockImplementation` for per-user identity:** the default `mockPrisma.user.findUnique` returns one user. Task 5 uses `mockImplementation` keyed on `where.id` to return distinct users. Same pattern for `conversation.create` / `conversation.findFirst` so two conversations coexist.
- **Exact-match assertions over shape-match:** Task 3.1 asserts `getInjectedGitConfig(sandboxId)` equals the exact `{ name, email }` object, not just `expect.objectContaining(...)`. The existing `[P1]` test at line 525 uses the weaker shape match; Task 3 supersedes it with exact match and `[P0]` priority. Do not delete the existing test — leave it or upgrade it in place.
- **Order assertion via `invocationCallOrder`:** Task 3.1 (inject before SESSION_READY) reuses the `mock.invocationCallOrder` comparison pattern at lines 124-131.
- **No E2E tests:** real-sandbox commit verification (actual `git log` inspection) requires a live Daytona sandbox, which is not available in CI, and the Playwright auth-setup infrastructure is currently broken (Story 3.9 deferred finding: `POST /api/internal/test/seed-user` hangs). The structural verification — git config injected before commit, commit uses git config (no `--author`), exitCode checked — is the testable proof for the ACs. See Deferred Findings / Decision Records.
- **No fake timers required for the manual-commit path:** `manualCommit` → `requestCommit` → `executeCommit` → `commit` is synchronous-ish (agent is idle, no queueing). Use `setImmediate` or `await jest.advanceTimersByTimeAsync(0)` only if the provision fire-and-forget needs draining (integration test, Task 7).

### Previous Story Intelligence (Story 3.9)

- **Test-seam fakes mimic production side effects:** Story 3.9's `AgentServiceFake` does NOT mimic the mid-session timer (timer is started by `ConversationsService`, not `AgentService`). Same principle here: `SandboxServiceFake` MUST mimic the commit-author side effect (the real `commit` produces a commit whose author is the injected config) because integration tests assert on it. Task 2 implements this.
- **`jest.spyOn` vs. fake control hooks:** Story 3.9 chose `jest.spyOn(sandboxFake, 'getWorkingTreeStatus').mockResolvedValue(...)` for the dirty-tree test rather than adding a `setWorkingTreeDirty()` hook. Same here for the dirty-tree setup in Tasks 4-5. The config-capture, however, is a permanent fake extension (not a per-test spy) because EVERY commit-identity test needs it and the fake should reflect the real production side effect.
- **Exact-match over shape-match:** Story 3.9's NFR audit (MEDIUM finding) added an event-ordering assertion the original test missed. Same rigor here: Task 3.1's exact-match identity assertion catches a regression the existing `expect.objectContaining` would miss (e.g. a future change that swaps name/email fields).
- **Decision records format:** Story 3.9 recorded DP-3/DP-4/DP-5 decisions inline. This story follows the same format (see Decision Records below).

### Git Intelligence

Recent commits (HEAD `e20d012`) are pipeline/workflow/docs changes — no commits touch `apps/agent-be/src/sandbox/` or `apps/agent-be/src/conversations/` since Story 3.9 (commit `6adc9d5`). The attribution-critical code is stable: `injectGitConfig`, `commit`, `resolveGitIdentity`, `provisionSandbox`, `resumeConversation` are unchanged. No merge-conflict risk.

### Project Context Reference

This story touches patterns documented in `_bmad-output/project-context.md`:

- **Deliberate cross-service logic duplication** — `resolveGitIdentity` is duplicated in agent-be from web BY DESIGN. Do NOT extract a shared lib.
- **Shell-quote all interpolated values in sandbox process commands** — `injectGitConfig` already shell-quotes name/email. Task 1 preserves this.
- **`exitCode` check on commands where success/failure matters** — Task 1 brings `injectGitConfig` in line with this rule.
- **Test-seam fakes mimic production side effects, not just canned returns** — Task 2 makes the fake's `commit` reflect the injected author, the side effect integration tests assert on.
- **`select` projection on `findFirst`/`findUnique`** — `resolveGitIdentity` already uses `select: { name: true, email: true, githubLogin: true }`. No change needed.
- **Regression-guard tests for security invariants assert ABSENCE** — Task 4.2 (author is NOT a platform service account) and Task 6.1 (no `--author`) follow the "assert what must NOT appear" pattern from `sandbox.service.nfr-s1.spec.ts`.

### Deferred Findings Addressed

- **deferred-work.md:69** — "Empty/whitespace `githubLogin` produces invalid fallback" — `resolveGitIdentity` uses `githubLogin` as fallback name and noreply local-part. GitHub guarantees `login` is non-empty from OAuth. Not reachable through normal flows. Task 3 tests the documented fallbacks (null/empty name and email); the empty-`githubLogin` case remains deferred (not reachable, per DP-5).
- **deferred-work.md:163** — "OAuth token persisted in plaintext in sandbox `remote.origin.url` after clone" — spec explicitly specifies the URL-embedding approach; ephemeral per-user sandbox limits exposure. Not an attribution concern (token is transport, not author identity). Not addressed by this story.

### Deferred Findings Introduced

- **Real-sandbox commit-identity E2E deferred (DP-5):** AC-1's "inspected via `git log` or the GitHub UI" describes the real-world verification. In CI, the structural proof (git config injected + commit uses git config with no `--author` + exitCode checked) is the testable equivalent. A real-sandbox E2E that provisions a Daytona sandbox, commits, and runs `git log --format='%an <%ae>'` to inspect the author is blocked by (a) no Daytona availability in CI and (b) the broken Playwright auth-setup infrastructure (Story 3.9 deferred finding). Deferred until both are resolved. The structural verification is sufficient for the ACs because git's authorship behavior is stable and documented: `git commit` without `--author` uses `user.name`/`user.email` from config.
- **Agent `git commit` path not exercised through `SandboxService.commit` (DP-5):** the agent's `git commit` runs inside the sandbox via the Claude agent's Bash tool, not through `SandboxService.commit`. It uses the same injected git config, so it carries the same identity — but it is not directly exercised in a unit test (the fake's `commit` is the platform manual-save path). Verified structurally: git config is injected before `SESSION_READY` (Task 3.1), before the agent can run. A direct test would require simulating the agent running `git commit` inside the fake sandbox, which is beyond the fake's purpose (it is a `SandboxService` test seam, not an agent-execution simulator).

### Decision Records

**Decision (DP-2):** Task 1 (exitCode check on `injectGitConfig`) is in scope. The AC-1 semantic intent is "the author name and email match the identity resolved in Story 1.5." Without the exitCode check, `injectGitConfig` can silently succeed when `git config` fails, leaving the sandbox's default identity on the commit — a direct, silent violation of AC-1. The literal AC text does not say "fix injectGitConfig," but the semantic intent requires it. The fix is small (~6 lines), follows the established `commit()` pattern, and fails loudly (throws → `SESSION_ERROR`) over silent mis-attribution (DP-1). Amending the implementation to match the semantic intent.

**Decision (DP-3):** Extend `SandboxServiceFake` (capture config, stamp commits, `getInjectedGitConfig()`) rather than relying solely on `jest.spyOn(sandboxFake, 'injectGitConfig')` call-arg assertions. The spy approach (used by existing tests at lines 114, 467, 534) proves the config was PASSED to `injectGitConfig` but not that a subsequent commit CARRIES it. The fake-extension approach proves the full chain: inject → commit author. It also mirrors the real production side effect (the fake-mimics-production rule), benefiting all future commit-path tests. Simplest reversible option that makes the AC verifiable end-to-end.

**Decision (DP-3):** Add the Story 3.10 commit-attribution regression guards to the existing `sandbox.service.nfr-s1.spec.ts` rather than creating a new `sandbox.service.spec.ts`. The NFR-S1 spec already has the `mockDaytona`/`mockSandbox` setup and tests `commit()` + `injectGitConfig()` against the real `SandboxService`. A new file would duplicate that setup. The describe block is clearly named `Story 3.10 — commit attribution regression guards` to distinguish it from the NFR-S1 (credential isolation) tests. Avoids a new file; follows the "regression guards in one place" precedent.

**Decision (DP-4):** Task 2 (fake extension) is a test-only change with no production behavior change. The fake's `injectGitConfig` now stores the config (was a discard), and `commit` records the author — both are observable-side-effect mimics that do not affect production code. Recorded because the fake is shared test infrastructure consumed by all Conversation-path tests.

**Decision (DP-5):** Real-sandbox commit-identity E2E deferred. Daytona is not available in CI and the Playwright auth-setup is broken (Story 3.9 deferred finding). The structural verification (inject config + commit uses git config + no `--author` + exitCode checked) is sufficient proof for the ACs. The agent `git commit` path is verified structurally (config injected before `SESSION_READY`), not by simulating an agent-run commit inside the fake. Both are beyond the story's testable-in-CI scope.

**Decision (DP-4):** Task 7.1 description corrected — the integration test (`sandbox-lifecycle.integration.spec.ts`) does NOT use `AgentServiceFake`; `AGENT_SERVICE` resolves to the real `AgentService` via `StreamingModule` (`streaming.module.ts:16`). The original text claimed the file "already uses `AgentServiceFake`", which is inaccurate. The real `AgentService.isIdle()` returns `true` when no run is active, so the manual-commit tests work without an override. Doc-wording fix only; no production or test-behavior change.

**Decision (DP-4):** Added `sandboxCounter` to `SandboxServiceFake.provision()` ID generation (`fake-sandbox-${Date.now()}-${this.sandboxCounter++}`). The previous `Date.now()`-only ID collided when two provisions happened in the same millisecond (Task 5 two-user test), causing the second `injectGitConfig` to overwrite the first in the `injectedGitConfigs` Map — both commits carried the second user's identity. Test-only fix; no production behavior change. Recorded because the fake is shared test infrastructure consumed by all Conversation-path tests.

## Dev Agent Record

### Agent Model Used

glm-5.2 (opencode)

### Debug Log References

- Task 1 (RED→GREEN): Un-skipped Task 6.4 test (`injectGitConfig() throws when git config fails`), confirmed RED (promise resolved instead of rejected), implemented exitCode check, confirmed GREEN.
- Task 2 (RED→GREEN): Un-skipped Task 3.1 test (`resolveGitIdentity resolves name + email`), confirmed RED (`getInjectedGitConfig` is not a function), implemented fake extension, confirmed GREEN.
- Task 5 (two-user distinctness): Two tests failed initially because `SandboxServiceFake.provision()` generated sandbox IDs using `Date.now()` only — two provisions in the same millisecond collided on the same ID, causing the second `injectGitConfig` to overwrite the first in the `injectedGitConfigs` Map. Fixed by adding a `sandboxCounter` to the fake's ID generation (DP-4, test-only). All tests passed after the fix.

### Completion Notes List

- Task 1 (production fix): Added `exitCode !== 0` checks to `SandboxService.injectGitConfig` for both `git config user.name` and `git config user.email` commands. A silent `git config` failure now throws → propagates through `provisionSandbox`/`resumeConversation` → `SESSION_ERROR` → user sees "Starting your session…" fail with a retry, not a silently mis-attributed commit. Follows the established `commit()` pattern (lines 128-130, 137-139). DP-1 (fail loudly over false success).
- Task 2 (test-only fake extension): Extended `SandboxServiceFake` with `injectedGitConfigs` Map, `getInjectedGitConfig()` inspection hook, `commit()` author stamping, and `destroy()` cleanup. Follows the "test-seam fakes mimic production side effects" rule — the real `commit` produces a commit whose author is the injected git config; the fake now reproduces that observable side effect. DP-3 (simplest reversible option), DP-4 (test-only).
- Task 2 (sandbox counter fix): Added `sandboxCounter` to `SandboxServiceFake.provision()` ID generation to prevent `Date.now()` collisions when two provisions happen in the same millisecond. DP-4 (test-only, no production behavior change).
- Tasks 3-5 (unit tests): 13 tests un-skipped and passing in `conversations.service.spec.ts`. Covers identity resolution (exact match, name/email fallbacks), inject-before-SESSION_READY ordering, resume re-injection, commit carries injected identity, noreply fallback on commit, no-platform-account regression guard, and two-user distinctness.
- Task 6 (regression guards): 4 tests un-skipped and passing in `sandbox.service.nfr-s1.spec.ts`. Covers no `--author` in commit command, no platform service account interpolation, both git config fields set, and exitCode guard on `injectGitConfig`.
- Task 7 (integration tests): 2 tests un-skipped and passing in `sandbox-lifecycle.integration.spec.ts`. Covers end-to-end provision→commit carries identity (AC-1) and two-user distinct commit authors through full NestJS module wiring (AC-2).
- Task 8 (lint/typecheck/test): agent-be lint 0 errors, typecheck clean, 189 tests pass. Web lint has 1 pre-existing error in `CredentialErrorBanner.test.tsx` (not touched by this story), 656 web tests pass.
- All 19 Story 3.10 tests pass (0 skipped). No regressions.

### File List

- `apps/agent-be/src/sandbox/sandbox.service.ts` — Task 1: `injectGitConfig` exitCode check (production fix)
- `apps/agent-be/test/helpers/sandbox-service.fake.ts` — Task 2: `injectedGitConfigs` Map, `getInjectedGitConfig()`, `commit()` author stamping, `destroy()` cleanup, `sandboxCounter` for unique IDs
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — Tasks 3-5: 13 Story 3.10 tests un-skipped
- `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` — Task 6: 4 Story 3.10 regression guard tests un-skipped
- `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` — Task 7: 2 Story 3.10 integration tests un-skipped

## Change Log

- 2026-07-06: Story 3.10 context created — verification story for commit attribution; production fix (injectGitConfig exitCode check), fake extension (capture config + stamp commits), unit/integration/regression tests.
- 2026-07-06: Validation pass (checklist.md) — all code references, line numbers, AC mappings, architecture claims, and decision records verified against source. One factual inaccuracy fixed (Task 7.1 AgentServiceFake claim → real AgentService via StreamingModule, DP-4).
- 2026-07-06: Story 3.10 implementation complete — Task 1 (exitCode check), Task 2 (fake extension + sandbox counter fix), Tasks 3-7 (19 tests un-skipped and passing), Task 8 (lint/typecheck/test all green). All ACs verified structurally (E2E deferred per DP-5).

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.10] — ACs and user story (lines 847-865)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5] — git identity resolution (lines 333-352)
- [Source: _bmad-output/planning-artifacts/epics.md#FR3] — Commit Attribution per User (line 24)
- [Source: _bmad-output/planning-artifacts/epics.md#FR Coverage Map] — FR3 end-to-end verification completed in Story 3.10 (line 179)
- [Source: _bmad-output/planning-artifacts/architecture.md#Cross-Cutting Concern #5] — Git transport and commit attribution (line 92)
- [Source: _bmad-output/planning-artifacts/architecture.md#Technical Constraints] — sandbox init sequence, git config injection at every provision AND resume (line 79)
- [Source: _bmad-output/planning-artifacts/architecture.md#ISandboxService Contract] — `injectGitConfig(sandboxId, config: GitUserConfig)` interface (lines 394-433)
- [Source: apps/agent-be/src/sandbox/sandbox.service.ts] — `injectGitConfig` (lines 88-102), `commit` (lines 120-140), `shellQuote` (line 189)
- [Source: apps/agent-be/src/conversations/conversations.service.ts] — `resolveGitIdentity` (lines 381-399), `provisionSandbox` injection (line 80), `resumeConversation` fast-path injection (line 328)
- [Source: apps/agent-be/src/conversations/manual-commit.service.ts] — `executeCommit` → `sandboxService.commit` (line 83)
- [Source: apps/agent-be/test/helpers/sandbox-service.fake.ts] — `injectGitConfig` no-op (line 86), `commit` records `{sandboxId, message}` (lines 95-101), `getCommitCalls()` (line 46)
- [Source: apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts] — existing `commit()` + `injectGitConfig()` regression guards (lines 113-152)
- [Source: apps/agent-be/src/conversations/conversations.service.spec.ts] — existing provision-order test (lines 111-132), noreply-fallback test (lines 525-544), manualCommit test setup (lines 547-587)
- [Source: apps/web/src/lib/git-identity.ts] — `resolveGitIdentity` (the web-side original; agent-be copy mirrors this)
- [Source: _bmad-output/implementation-artifacts/3-9-terminate-idle-sandboxes-mid-conversation.md] — fake-extension precedent, decision-record format, deferred-finding on broken E2E auth setup
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — line 69 (empty githubLogin fallback), line 163 (OAuth token in clone URL)
- [Source: _bmad-output/project-context.md] — deliberate cross-service duplication, shell-quoting, exitCode check rule, test-seam fakes mimic side effects, regression-guard assert-abscence pattern

## Review Findings

**Review date:** 2026-07-06
**Review layers:** Blind Hunter, Edge Case Hunter, Acceptance Auditor — all completed
**Triage:** 4 patch (all applied), 4 defer, 15 dismissed as noise

### Patch (all applied)

- [x] [Review][Patch] Email failure path untested — `injectGitConfig` exitCode check for `user.email` command not exercised (only `user.name` failure tested). Added test where name succeeds and email fails. [`apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts:209-216`]
- [x] [Review][Patch] `getInjectedGitConfig` returns mutable reference, not a clone — test mutation could corrupt fake internal state. Fixed to return `{ ...config }`. [`apps/agent-be/test/helpers/sandbox-service.fake.ts:53-55`]
- [x] [Review][Patch] NFR-S1 spec file header doesn't mention Story 3.10 — file contains Story 3.10 describe block but header only references Story 3.8. Updated header. [`apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts:1-8`]
- [x] [Review][Patch] Spec claims "No new files" but `sandbox.service.nfr-s1.spec.ts` is new (not in baseline) — spec contradiction amended per DP-2 (File Structure Requirements note added). [`_bmad-output/implementation-artifacts/3-10-verify-commits-carry-the-users-own-identity.md`]

### Defer

- [x] [Review][Defer] No rollback on partial `injectGitConfig` failure (name set, email fails) — pre-existing, sandbox destroyed on provision failure; rollback is separate concern (DP-5) [`apps/agent-be/src/sandbox/sandbox.service.ts:88-108`] — deferred, pre-existing
- [x] [Review][Defer] Fake's `commit()` skips sandbox-existence check that `injectGitConfig` and `destroy` enforce — test design per spec (Task 4.4 relies on this behavior) [`apps/agent-be/test/helpers/sandbox-service.fake.ts:104-111`] — deferred, per-spec test design
- [x] [Review][Defer] Tautological "regression guard" test (commit with no injected config) exercises fake, not production — same root as above; NFR-S1 test covers the production regression [`apps/agent-be/src/conversations/conversations.service.spec.ts:991-996`] — deferred, per-spec test design
- [x] [Review][Defer] Null `githubLogin` produces `null@users.noreply.github.com` fallback email — pre-existing deferred issue (deferred-work.md:69), GitHub guarantees login is non-empty from OAuth [`apps/agent-be/src/conversations/conversations.service.ts:381-399`] — deferred, pre-existing (deferred-work.md:69)

### NFR Evidence Audit

**Audit date:** 2026-07-06
**Audit mode:** Create (NFR-specific issues only)
**Auditor:** Master Test Architect (Reviewer)
**Scope:** NFR-specific findings only — missing select projections, take limits, timing tests, security headers, shell-injection guards, exitCode checks on the commit-attribution chain.

**Verification performed:**
- All DB queries in `conversations.service.ts` reviewed for `select` projections — all present (`resolveGitIdentity` line 384, `provisionSandbox` line 61, `getStatus` line 147, `listSkills` line 161, `sendTurn` line 183, `stopAgent` line 276, `manualCommit` line 294, `resumeConversation` line 315). No missing projections.
- SSE security headers reviewed on `StreamingController` (lines 70-74) — `X-Content-Type-Options: nosniff`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no` all present. Not modified by Story 3.10; no regression.
- `exitCode` checks audited across `SandboxService` — present on `injectGitConfig` (lines 96, 105) and `commit` (lines 134, 143); absent on `getWorkingTreeStatus` (line 112-117).
- Shell-quoting regression guards audited — `shellQuote` helper used on `injectGitConfig` name/email (lines 91, 100) and `commit` message (line 138), but no test exercises it with malicious input.
- Timing tests audited — none found in any agent-be spec file for the manual-commit path (NFR-P5).
- Test execution verified: 190 tests pass across 11 suites, 0 skipped.

#### NFR Findings

**[NFR][MEDIUM] No shell-injection regression guard for `injectGitConfig` with malicious name/email** (Security — NFR-S1)

- **Evidence:** `apps/agent-be/src/sandbox/sandbox.service.ts:88-108` — `injectGitConfig` uses `this.shellQuote(config.name)` and `this.shellQuote(config.email)` (lines 91, 100). The `shellQuote` helper (line 195-197) wraps values in single quotes and escapes embedded single quotes — correct POSIX shell-quoting. However, no test in `sandbox.service.nfr-s1.spec.ts` exercises `injectGitConfig` with shell metacharacters in `name`/`email`. Existing tests use safe values (`name: 'Test User'`, `name: 'A'`). The `name` originates from `resolveGitIdentity` which reads `User.name` (GitHub OAuth profile — user-controlled). A malicious GitHub display name like `'; rm -rf /; '` would be safely quoted by `shellQuote`, but a future change that removes or breaks the quoting would not be caught by any test.
- **Severity rationale:** MEDIUM — the production code is correct (quoting is in place), but the absence of a regression guard means a future regression could introduce a command-injection vulnerability in the sandbox. Story 3.10's Task 1 modified `injectGitConfig`, making this directly relevant.
- **Remediation:** Add a `[P0]` regression guard test in `sandbox.service.nfr-s1.spec.ts` that calls `injectGitConfig` with a malicious `name` containing single quotes, semicolons, and backticks (e.g., `name: "'; rm -rf /; '"`), then asserts the command string contains the value safely single-quoted (no unescaped metacharacters outside the quoted span). Follows the "regression-guard tests for security invariants assert ABSENCE" pattern (project-context.md). Estimated effort: ~15 min.

**[NFR][MEDIUM] `getWorkingTreeStatus` missing `exitCode` check — silent failure on commit-attribution chain** (Reliability — NFR-R2)

- **Evidence:** `apps/agent-be/src/sandbox/sandbox.service.ts:110-124` — `getWorkingTreeStatus` calls `executeCommand('git status --porcelain', ...)` but does NOT check `response.exitCode`. On failure (exitCode !== 0), `response.result` may be empty, causing the method to return `{ dirty: false, files: [] }` — a silent false-negative. This is on the commit-attribution chain: `ManualCommitService.executeCommit` (line 68) calls `getWorkingTreeStatus` and skips the commit when `!workingTree.dirty` (line 70-76), returning `{ clean: true }`. A silent failure here prevents the user's identity from landing on a commit — directly undermining AC-1. The story explicitly defers this per DP-5 ("not attribution-critical"), but that assessment is incorrect: if the working-tree check fails silently, the commit is skipped and attribution never happens.
- **Severity rationale:** MEDIUM — pre-existing from Story 3.1, but newly relevant to Story 3.10's commit-attribution verification. Story 3.10's Task 1 brought `injectGitConfig` in line with the `exitCode` check rule; `getWorkingTreeStatus` remains the only attribution-chain command without the check. The story's DP-5 deferral reasoning ("not attribution-critical") is challenged: a silent `getWorkingTreeStatus` failure prevents the commit, preventing attribution.
- **Remediation:** Add `if (response.exitCode !== 0) { throw new Error(response.result); }` after the `executeCommand` call in `getWorkingTreeStatus` (line 117), mirroring the `injectGitConfig` and `commit` pattern. Add a `[P0]` regression guard test verifying the throw on failure. Estimated effort: ~20 min.

**[NFR][LOW] No `take` limit on `getWorkingTreeStatus` files array** (Performance — NFR-R3 adjacent)

- **Evidence:** `apps/agent-be/src/sandbox/sandbox.service.ts:122` — `const files = output.split('\n').map((line) => line.slice(3));` returns all changed files with no cap. The `WORKING_TREE_DIRTY` event (`conversations.service.ts:84-87`) carries `{ files: workingTree.files }` — the full unbounded array. A working tree with thousands of changed files produces a large SSE event payload. The SSE back-pressure mechanism (200 events, 30s drain) caps event count, not payload size per event. Pre-existing from Story 3.1; `listSkills` (line 170-174) has the same unbounded `split('\n')` pattern.
- **Severity rationale:** LOW — the MVP use case (BMAD artifact editing) produces small working trees; the risk materializes only with unusually large changesets. Pre-existing, not introduced by Story 3.10.
- **Remediation:** Cap the files array at a reasonable limit (e.g., 100 entries) and add a `truncated: boolean` field to `WorkingTreeStatus` when the cap is exceeded. Apply the same cap to `listSkills` output. Estimated effort: ~30 min.

**[NFR][LOW] No timing test for NFR-P5 (manual commit ≤ 5s)** (Performance — NFR-P5)

- **Evidence:** No timing test exists in any agent-be spec file (searched for `timing`, `performance.now`, `Date.now` delta patterns — 0 matches). NFR-P5 ("A platform-initiated commit completes within 5 seconds of the save operation executing") is directly relevant to Story 3.10's commit-attribution chain (`manualCommit` → `requestCommit` → `executeCommit` → `commit`). NFR-P5 was assigned to Story 3.6 in the implementation-readiness report, but no NFR assessment exists for Story 3.6. Story 3.10 added integration tests exercising this path (`sandbox-lifecycle.integration.spec.ts:146-163`) but they assert on correctness, not timing.
- **Severity rationale:** LOW — with `SandboxServiceFake`, timing is near-zero (no real git operations), so a fake-based timing test would only catch gross regressions (infinite loops). A meaningful timing test requires a real Daytona sandbox, which is deferred per DP-5. The gap is documented, not actionable in CI.
- **Remediation:** When Daytona is available in CI (post-DP-5 resolution), add a real-sandbox timing test asserting the manual-commit path completes < 5s. Until then, document the gap. Estimated effort: ~1h (when Daytona CI is available).

**[NFR][LOW] Raw sandbox command output propagated to client via SSE error events** (Data Protection — NFR-S1 adjacent)

- **Evidence:** `apps/agent-be/src/sandbox/sandbox.service.ts:97,106` — `injectGitConfig` throws `new Error(nameResponse.result)` (the raw git command output). This propagates through `provisionSandbox` catch block (`conversations.service.ts:127-130`) to `SESSION_ERROR.data.message` — sent to the client via SSE. For `git config user.name`/`user.email`, the output is not sensitive (name/email being set or a generic error). But the pattern of sending raw command output to the client is an NFR-adjacent data-protection concern: a future command could leak sandbox internals (file paths, permission structures). The same pattern exists in `commit()` (line 135, 144) → `MANUAL_SAVE_FAILED.data.error` (`manual-commit.service.ts:96,104`). Pre-existing from Story 3.1/3.6; Story 3.10's Task 1 follows the same pattern for the new `injectGitConfig` exitCode check.
- **Severity rationale:** LOW — the `git config` commands produce non-sensitive output. The concern is the pattern, not the current content. Story 3.10 did not introduce the pattern; it followed the established convention.
- **Remediation:** Map known `executeCommand` error types to generic user-facing messages (e.g., "Failed to configure git identity" instead of raw `git config` output). Log the raw output server-side via `logger.error`. Apply to `SESSION_ERROR` and `MANUAL_SAVE_FAILED` events. Estimated effort: ~1h.

#### NFR Findings Summary

| # | Finding | Category | Severity | Status |
|---|---------|----------|----------|--------|
| 1 | No shell-injection regression guard for `injectGitConfig` | Security (NFR-S1) | MEDIUM | Open — recommend patch |
| 2 | `getWorkingTreeStatus` missing `exitCode` check | Reliability (NFR-R2) | MEDIUM | Open — challenges DP-5 deferral |
| 3 | No `take` limit on `getWorkingTreeStatus` files array | Performance (NFR-R3) | LOW | Open — pre-existing |
| 4 | No timing test for NFR-P5 (manual commit ≤ 5s) | Performance (NFR-P5) | LOW | Open — blocked by DP-5 |
| 5 | Raw command output in SSE error events | Data Protection (NFR-S1) | LOW | Open — pre-existing pattern |

**Overall NFR Status:** CONCERNS — 2 MEDIUM (shell-injection guard, `getWorkingTreeStatus` exitCode), 3 LOW. No FAIL. Select projections and SSE security headers verified present. The 2 MEDIUM findings are actionable patches; the 3 LOW findings are pre-existing or blocked by DP-5.
