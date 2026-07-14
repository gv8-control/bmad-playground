# SandboxService Test Fidelity Audit — 2026-07-14

**Auditor:** Vera (Test Fidelity Auditor)
**Target:** `apps/agent-be/src/sandbox/sandbox.service.ts` — Daytona SDK (`@daytonaio/sdk` 0.187.0) contract consumers
**Concern:** CF3 — `SandboxService` (Daytona SDK contract) was not audited in the Wave-1 fidelity sweep. Wave-1 reviewed `ArtifactViewer.components` and `RepositoryUrlForm`; SDK-contract fidelity for `SandboxService` was assumed, not verified.

---

## 1. Scope

**Production code under audit:**
- `apps/agent-be/src/sandbox/sandbox.service.ts` (186 lines, 9 public methods consuming the Daytona SDK)

**SDK contract declared by:**
- `node_modules/@daytonaio/sdk/esm/Daytona.d.ts` — `Daytona.create` / `get` / `start` / `delete` signatures and overload sets
- `node_modules/@daytonaio/sdk/esm/Sandbox.d.ts` — `Sandbox` class shape (`id`, `labels: Record<string,string>`, `git`, `process`)
- `node_modules/@daytonaio/sdk/esm/Git.d.ts` — `Git.clone`, `Git.status` signatures
- `node_modules/@daytonaio/sdk/esm/Process.d.ts` — `Process.executeCommand` signature
- `node_modules/@daytonaio/sdk/esm/types/ExecuteResponse.d.ts` — `ExecuteResponse { exitCode: number; result: string; artifacts?: ExecutionArtifacts }`
- `node_modules/@daytona/toolbox-api-client/src/models/git-status.d.ts` — `GitStatus { currentBranch: string; fileStatus: FileStatus[]; ahead?; behind?; branchPublished? }`
- `node_modules/@daytona/toolbox-api-client/src/models/file-status.d.ts` + `status.d.ts` — `FileStatus { name, staging, worktree, extra }`; `Status` enum
- `node_modules/@daytonaio/sdk/esm/errors/DaytonaError.d.ts` — `DaytonaError` base + `DaytonaNotFoundError` (HTTP 404), `DaytonaTimeoutError`, `DaytonaConflictError`, etc.

**Test files read (consumer-side, traced outward from the production code):**
- `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` — SDK-boundary tests (uses `mock-daytona.ts`)
- `apps/agent-be/src/sandbox/sandbox.service.working-tree.spec.ts` — SDK-boundary tests (`getWorkingTreeStatus`)
- `apps/agent-be/test/helpers/mock-daytona.ts` — typed mock of the `@daytonaio/sdk` boundary (the SDK seam)
- `apps/agent-be/test/helpers/sandbox-service.fake.ts` — in-memory service-level fake (`ISandboxService` boundary)
- `apps/agent-be/test/helpers/test-module-builder.ts` — injects `SandboxServiceFake` for the `SANDBOX_SERVICE` DI token
- `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` — uses `SandboxServiceFake`, NOT the real `SandboxService` (line 14 header comment)
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — injects `SandboxServiceFake` (lines 111, 127)
- `apps/agent-be/src/conversations/manual-commit.service.spec.ts` — injects `SandboxServiceFake` (line 82)
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — stubs `SandboxServiceFake.getWorkingTreeStatus` only (lines 63–65)
- `apps/agent-be/src/streaming/agent.service.spec.ts` — injects `SandboxServiceFake` (line 21, 64)
- `apps/agent-be/test/sdk-contract-replay.spec.ts` — recorded-session replay fixture, but for `@anthropic-ai/claude-agent-sdk`, NOT for `@daytonaio/sdk`

**Recorded-session replay fixtures checked for:** Daytona SDK — none exist. Only `apps/agent-be/test/fixtures/sdk-session-replay.jsonl` (Claude Agent SDK) is present.

---

## 2. Contract consumers identified

Every code path in `sandbox.service.ts` that consumes the Daytona SDK, traced from the production code outward to tests:

| # | SDK method / property | Production `path:line` | Consumed by |
|---|---|---|---|
| C1 | `this.daytona.create({ labels })` | `sandbox.service.ts:29` | `provision()` |
| C2 | `sandbox.id` (from created sandbox) | `sandbox.service.ts:33` | `provision()` return shape |
| C3 | `this.daytona.delete(sandbox)` (cleanup in provision catch) | `sandbox.service.ts:41` | `provision()` catch block |
| C4 | `sandbox.git.clone(url, path, undefined, undefined, 'x-access-token', credential)` | `sandbox.service.ts:52-59` | `clone()` |
| C5 | `this.daytona.get(sandboxId)` | `sandbox.service.ts:81` | `destroy()` |
| C6 | `this.daytona.delete(sandbox)` | `sandbox.service.ts:82` | `destroy()` |
| C7 | `sandbox.id` (from resumed sandbox) | `sandbox.service.ts:69` | `resume()` return shape |
| C8 | `sandbox.labels?.conversationId` | `sandbox.service.ts:70` | `resume()` |
| C9 | `this.daytona.start(sandbox)` | `sandbox.service.ts:67` | `resume()` |
| C10 | `this.daytona.get(sandboxId)` (helper) | `sandbox.service.ts:172` | `getSandbox()` private helper |
| C11 | `sandbox.process.executeCommand(git config user.name …)` | `sandbox.service.ts:93-98` | `injectGitConfig()` |
| C12 | `nameResponse.exitCode` / `nameResponse.result` | `sandbox.service.ts:99-100` | `injectGitConfig()` failure check |
| C13 | `sandbox.process.executeCommand(git config user.email …)` | `sandbox.service.ts:102-107` | `injectGitConfig()` |
| C14 | `emailResponse.exitCode` / `emailResponse.result` | `sandbox.service.ts:108-109` | `injectGitConfig()` failure check |
| C15 | `sandbox.git.status(REPO_SUBDIRECTORY)` | `sandbox.service.ts:115` | `getWorkingTreeStatus()` |
| C16 | `status.fileStatus` filter/map (`.staging`, `.worktree`, `.name`) | `sandbox.service.ts:116-118` | `getWorkingTreeStatus()` |
| C17 | `sandbox.process.executeCommand('git add -A', …)` | `sandbox.service.ts:124-129` | `commit()` |
| C18 | `addResponse.exitCode` / `addResponse.result` | `sandbox.service.ts:130-131` | `commit()` failure check |
| C19 | `sandbox.process.executeCommand('git commit -m …', …)` | `sandbox.service.ts:133-138` | `commit()` |
| C20 | `response.exitCode` / `response.result` | `sandbox.service.ts:139-140` | `commit()` failure check |
| C21 | `sandbox.process.executeCommand('ls -1 .claude/skills/', …)` | `sandbox.service.ts:147-152` | `listSkills()` |
| C22 | `response.result` parse | `sandbox.service.ts:153-161` | `listSkills()` |
| C23 | `isNotFoundError(err)` string heuristic | `sandbox.service.ts:179-185` (defined); called at `:84` | `destroy()` (handles not-found during delete) |

**SDK contract summary (verified against real `.d.ts`):**

- `Daytona.create(params?: CreateSandboxFromSnapshotParams | CreateSandboxFromImageParams, options?: {timeout?: number}): Promise<Sandbox>` — **two overloads**; both return a `Sandbox` after the sandbox reaches "started" state internally.
- `Daytona.get(sandboxIdOrName: string): Promise<Sandbox>` — returns a rehydrated `Sandbox`; throws `DaytonaNotFoundError` (subclass of `DaytonaError` with `statusCode === 404`) when the sandbox does not exist.
- `Daytona.start(sandbox: Sandbox, timeout?: number): Promise<void>` — "Starts a Sandbox and waits for it to be ready"; throws `DaytonaError` if the sandbox fails to start or times out, `DaytonaTimeoutError` on timeout.
- `Daytona.delete(sandbox: Sandbox, timeout?: number): Promise<void>` — throws `DaytonaNotFoundError` if already deleted.
- `Sandbox` class properties: `id: string`, `name: string`, `labels: Record<string, string>` (required, not optional — `Sandbox.d.ts:73`), `state?: SandboxState`, `git: Git`, `process: Process`.
- `Sandbox.git.clone(url, path, branch?, commitId?, username?, password?, insecureSkipTls?): Promise<void>` — 7 params, 2 required.
- `Sandbox.git.status(path: string): Promise<GitStatus>`.
- `Sandbox.process.executeCommand(command, cwd?, env?, timeout?): Promise<ExecuteResponse>`.
- `ExecuteResponse { exitCode: number; result: string; artifacts?: ExecutionArtifacts }`.
- `GitStatus { currentBranch: string; fileStatus: FileStatus[]; ahead?; behind?; branchPublished? }`.
- `FileStatus { name: string; staging: Status; worktree: Status; extra: string }`; `Status` enum = Unmodified | Untracked | Modified | Added | Deleted | Renamed | Copied | UpdatedButUnmerged | UNKNOWN_DEFAULT_OPEN_API.
- Typed error hierarchy: `DaytonaError extends Error` carries `statusCode?`, `errorCode?`, `headers?`; subclasses `DaytonaNotFoundError`, `DaytonaTimeoutError`, `DaytonaConflictError`, `DaytonaAuthenticationError`, `DaytonaAuthorizationError`, `DaytonaValidationError`, `DaytonaConnectionError`.

---

## 3. Findings

For each finding: the code path, the test (or absence of test), what the test assumes, what the real contract is, the gap (A, B, or C), and the production bug class this would hide. Cited with `path:line`.

### Finding F1 — `destroy()` has zero SDK-boundary test coverage; `isNotFoundError()` is a string heuristic fabricated against the real `DaytonaNotFoundError` type

**Code path (C5, C6, C23):** `sandbox.service.ts:76-89` (`destroy`) + `sandbox.service.ts:179-185` (`isNotFoundError`).

```ts
async destroy(sandboxId: string): Promise<void> {
  if (!this.daytona) return;
  try {
    const sandbox = await this.daytona.get(sandboxId);
    await this.daytona.delete(sandbox);
  } catch (err) {
    if (this.isNotFoundError(err)) return;
    throw err;
  }
}

private isNotFoundError(err: unknown): boolean {
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    return message.includes('not found') || message.includes('404');
  }
  return false;
}
```

**Test coverage (or absence):**

- `sandbox.service.nfr-s1.spec.ts` — spec header claims to cover "post-3.12 fix: clone() and getWorkingTreeStatus() exitCode checks". Grep for `destroy` / `resume` returns only `resume` matches (lines 281-312); **no `destroy()` test exists in either SDK-boundary spec file**.
- `sandbox.service.working-tree.spec.ts` — solely exercises `getWorkingTreeStatus()`.
- `sandbox-lifecycle.integration.spec.ts:255-256, 261` asserts `destroySpy` was called via the `SandboxServiceFake` — but the fake's `destroy()` (`sandbox-service.fake.ts:117-122`) deletes the Map entry and never throws a not-found error (it only throws "SandboxServiceFake: sandbox not found" when the sandbox isn't tracked, which never happens in those tests because destroy is always called on a tracked sandbox).
- `conversations.service.spec.ts:127` overrides `SANDBOX_SERVICE` with `SandboxServiceFake`, so the real `SandboxService.destroy` SDK consumption code is never instantiated in any conversation-flow test.
- `mock-daytona.ts:69` exposes `delete: jest.Mock<Promise<void>, [MockSandbox]>` with success default, but no test in `sandbox.service.nfr-s1.spec.ts` or `sandbox.service.working-tree.spec.ts` ever calls `service.destroy(...)`.

**What the tests assume:** the `destroy()` cleanup path handles not-found by string-matching the error message; the `SandboxServiceFake` confirms the happy path; no SDK error is ever modeled.

**What the real contract is:** the SDK throws `DaytonaNotFoundError extends DaytonaError` (`errors/DaytonaError.d.ts:46`) on HTTP 404 — a typed subclass carrying `statusCode?: number` (set to 404) and `errorCode?: string`. The contract-correct check is `err instanceof DaytonaNotFoundError` or `err.statusCode === 404`.

**Gap classification:**

- **Gap A (untested contract consumer):** `destroy()`'s SDK consumption (`daytona.get` + `daytona.delete`) has zero test coverage at the `mock-daytona` SDK boundary. The only `destroy` exercises go through `SandboxServiceFake`, which replaces the entire service including the SDK consumption code and the `isNotFoundError` heuristic.
- **Gap B (fabricated-contract test):** The `isNotFoundError` string-matching heuristic (`sandbox.service.ts:181-182`) is an assumed contract. The real contract surface is the `DaytonaNotFoundError` class + `statusCode` field. The string heuristic can false-positive (a real `DaytonaError` whose message happens to contain "not found" — e.g. an unrelated "label not found" validation error) and can false-negative (a `DaytonaNotFoundError` whose message the SDK phrases without the literal "not found" or "404" — e.g. localized or reformatted messages between SDK versions). No test ever compares the heuristic against an actual `DaytonaNotFoundError` instance or asserts `err.statusCode === 404`.

**Production bug class hidden:** (1) Silent error swallowing — a non-404 `DaytonaError` (e.g. `DaytonaAuthorizationError` 403 from a rotated API key) whose message contains "not found" would be silently dropped, leaving orphaned sandboxes in Daytona with no alarm raised, no destroy attempted, no retry path. (2) Cross-version fragility — `@daytonaio/sdk` is pre-1.0 (`"0.187.0"`, pinned), and the SDK is explicitly subject to changelog-review-on-upgrade per `architecture.md`. A future SDK version that changes the `DaytonaNotFoundError` message phrasing while preserving the `statusCode` field would silently flip the heuristic to false-negative, breaking the idempotent-destroy guarantee that `abandonConversation` (`conversations.service.spec.ts:1150-1156`) relies on.

---

### Finding F2 — `provision()` catch-block cleanup branch is dead code; the test that asserts "no zombie sandboxes" is vacuously true

**Code path (C1, C2, C3):** `sandbox.service.ts:22-48`.

```ts
let sandbox: Sandbox | null = null;
try {
  sandbox = await this.daytona.create({ labels: { conversationId: params.conversationId } });
  return { sandboxId: sandbox.id, conversationId: params.conversationId, status: 'ready', provisionedAt: new Date() };
} catch (err) {
  if (sandbox) {
    try { await this.daytona.delete(sandbox); } catch (cleanupErr) { this.logger.error(...); }
  }
  throw err;
}
```

**Test coverage:**

- The happy path of `provision()` IS tested at the SDK boundary (`sandbox.service.nfr-s1.spec.ts:51-75`) — `mockDaytona.create` resolves successfully, the test asserts `create` is called with only `labels`. ✅
- The failure path is "tested" via `SandboxServiceFake.failNextProvision()` at `sandbox-lifecycle.integration.spec.ts:140-148` ("cleans up partial Daytona allocation when provision() throws"):
  ```ts
  sandboxFake.failNextProvision();
  const destroySpy = jest.spyOn(sandboxFake, 'destroy');
  await conversationsService.provisionSandbox('conv-1', 'user-1');
  expect(destroySpy).not.toHaveBeenCalled();
  expect(sandboxFake.activeSandboxCount()).toBe(0);
  ```

**What the test assumes:** when `provision()` fails, `destroy()` is NOT called (the sandbox wasn't allocated); `activeSandboxCount()` is 0. This is presented as the contract validation for "no zombie sandboxes".

**What the real contract is:** `Daytona.create` is not atomic. Per `Daytona.d.ts:237-277`, `create` issues the HTTP request *and* internally polls / waits for the sandbox to reach "started" state before resolving. The SDK can reject *after* the sandbox has been allocated in Daytona (e.g. `DaytonaTimeoutError` if the sandbox enters an error state or fails to become ready within the timeout, or a network drop between the 201 response and the readiness poll). In that case, **no `Sandbox` reference is captured into the `sandbox` variable** — the `await this.daytona.create(...)` rejects and the assignment never completes — so the catch block's `if (sandbox)` is always false. The cleanup branch (`sandbox.service.ts:39-45`) is **dead code**: it can never run for any failure that originates from `daytona.create`.

The `SandboxServiceFake.failNextProvision` (`sandbox-service.fake.ts:34-36, 65-67`) throws synchronously *before* any Map entry is created, so it can only ever model the pre-allocation failure mode. The real partial-allocation failure mode is impossible to represent with the fake, and the integration test's `activeSandboxCount() === 0` assertion is vacuously true for both the production dead code and the fake's failure model.

**Gap classification:**

- **Gap A (untested contract consumer):** the `if (sandbox) { await this.daytona.delete(sandbox); }` cleanup branch at `sandbox.service.ts:39-45` has zero test coverage. It is dead code for the current implementation; no test exercises it (and no test CAN exercise it, because no test mocks `daytona.create` to reject after returning a sandbox reference — the SDK's contract precludes a partial return).
- **Gap C (contract-behavior blind spot):** the `mock-daytona.ts` `create: jest.fn().mockResolvedValue(mockSandbox)` (`mock-daytona.ts:104`) only models the success path. No test models the real failure mode where `create` allocates a sandbox in Daytona but the SDK throws during the readiness wait — the orphaned-sandbox case. Both the `mock-daytona` boundary mock AND the `SandboxServiceFake` agree on the same fabricated assumption: failure happens before allocation.

**Production bug class hidden:** Orphaned sandbox leak. When a Daytona sandbox is allocated but `daytona.create` rejects (timeout, network drop mid-poll, error-state sandbox), the production code throws the raw error with no cleanup. The sandbox lives in Daytona with no `Sandbox` reference in agent-be to destroy it later. This is exactly the "zombie sandbox" class the test at `sandbox-lifecycle.integration.spec.ts:140` claims to guard against — and the guard is fictional. The assumption that `if (sandbox)` can ever be true in the catch is also a misleading annotation: a future developer who adds a post-`create` step (e.g. `waitUntilStarted`, `setLabels`) between the assignment and the `return` would expect the cleanup to fire, without realizing the SDK already does readiness-waiting internally.

Cross-reference to existing known issue: `_bmad-output/implementation-artifacts/deferred-work.md:247` already records a related zombie-sandbox risk for `handleMidSessionIdleTimeout` (in-memory `sandboxIds.delete` before `destroy`). The `provision()` orphan-on-create-reject failure mode is a distinct, earlier-in-lifecycle instance of the same class.

---

### Finding F3 — `resume()`'s `daytona.start(sandbox)` call only models the success path; timeout and error-state failure modes are not represented

**Code path (C9):** `sandbox.service.ts:62-74`.

```ts
async resume(sandboxId: string): Promise<SandboxInfo> {
  if (!this.daytona) throw new Error('Daytona client is not configured');
  const sandbox = await this.getSandbox(sandboxId);
  await this.daytona.start(sandbox);
  return { sandboxId: sandbox.id, conversationId: sandbox.labels?.conversationId || sandboxId,
           status: 'ready', provisionedAt: new Date() };
}
```

**Test coverage:** `sandbox.service.nfr-s1.spec.ts:281-312` (three tests at the SDK boundary). All three set `mockSandbox.labels` to a known value, then assert the return shape; one additionally asserts `mockDaytona.start` is called with `mockSandbox` (line 310).

**What the tests assume:** `daytona.start(sandbox)` always resolves. The success-only mock at `mock-daytona.ts:107` (`start: jest.fn().mockResolvedValue(undefined)`) models only the happy path. No test sets `mockDaytona.start.mockRejectedValueOnce(...)`.

**What the real contract is:** `Daytona.start(sandbox, timeout?)` — per `Daytona.d.ts:302-313` — "Starts a Sandbox and waits for it to be ready". Documentation in `Sandbox.d.ts:160-175` (`Sandbox.start`, the equivalent instance method) lists the contract's failure modes explicitly:
- `@throws {DaytonaError}` if the sandbox fails to start or times out.
- The sandbox can be in a non-recoverable error state (`errorReason`, `recoverable=false` — `Sandbox.d.ts:81-82`).
- A `DaytonaTimeoutError` is thrown when the sandbox fails to reach "started" within the timeout.

**Gap classification: Gap C (contract-behavior blind spot).** The mock IS at the correct boundary (`mock-daytona.ts:69, 107`) and the return shape IS correct (`Promise<void>`). The gap is in what the mock never does: it never rejects. The real `start` can reject with a typed `DaytonaError` / `DaytonaTimeoutError`/ error-state information that the production code's `resume()` does not catch, classify, or recover from — it just re-throws raw to the caller. The caller (`ConversationsService`) then surfaces a generic `SESSION_ERROR` event without distinguishing recoverable vs. non-recoverable sandboxes, without trying `sandbox.recover()` (which exists on the `Sandbox` class — `Sandbox.d.ts:189`), and without tearing down the now-unusable sandbox.

**Production bug class hidden:** unrecoverable-sandbox misreporting. A resume failure that is actually recoverable (e.g. race condition during stop/start) is reported to the user identically to a permanently-broken sandbox, with no recovery path triggered and no diagnostic distinguishing timeout from a destroyed sandbox. The success-only mock and the success-only tests pass confidently.

---

### Finding F4 — `commit()`'s `executeCommand` non-zero exitCode failure path is not exercised (the pattern exists and IS tested for the sibling `injectGitConfig`, but NOT for `commit()`)

**Code path (C17-C20):** `sandbox.service.ts:122-142`.

```ts
const addResponse = await sandbox.process.executeCommand('git add -A', REPO_SUBDIRECTORY, undefined, 10);
if (addResponse.exitCode !== 0) throw new Error(addResponse.result);
const response = await sandbox.process.executeCommand(`git commit -m ${this.shellQuote(message)}`, REPO_SUBDIRECTORY, undefined, 10);
if (response.exitCode !== 0) throw new Error(response.result);
```

**Test coverage:** `sandbox.service.nfr-s1.spec.ts:141-158` exercises the **happy path only** — the mock returns `{ exitCode: 0, result: '' }`, and the test asserts the command strings do not contain platform credentials.
- `sandbox.service.nfr-s1.spec.ts:207-223` exercises the **failure path for `injectGitConfig()`** (the sibling method using the same `executeCommand` + exitCode-check pattern): sets `executeCommand` to return `{ exitCode: 1, result: 'git config failed' }`, asserts the method throws with the result message. ✅ — the pattern is proven working for sibling code.
- For `commit()` itself: no test sets `mockSandbox.process.executeCommand` to a non-zero exitCode for either the `git add` or `git commit` sub-call. The `commit()` failure path (`sandbox.service.ts:130-131, 139-140`) has zero direct coverage.

**What the tests assume:** `executeCommand` always returns `exitCode: 0`; only the command-string-composition assertions matter.

**What the real contract is:** `Process.executeCommand` returns `ExecuteResponse` with `exitCode: number` — `ExecuteResponse.d.ts:21-25`. The exitCode is the actual exit status of the shell command: non-zero for real git failures. The two failure modes that are production-relevant for `commit()` and never represented:
- `git add -A` exits non-zero when the working directory isn't a repo (e.g. `clone()` partially failed silently, or the sandbox working dir has been reset). The code throws `new Error(addResponse.result)` — `result` is stdout, which is empty for `git add` failures (the actual error is on stderr, which `executeCommand` does not surface as a separate field per the SDK type — `result` is the combined stdout only). The thrown error to the user/ManualCommitService is the *empty string*.
- `git commit -m '...'` exits non-zero when there's nothing to commit ("nothing to commit, working tree clean"). `ManualCommitService.requestCommit` is gated by a prior `getWorkingTreeStatus` check, but a race between the status check and the commit (the agent adds a turn that reverts changes between the two calls) is a real production path. The thrown error would be the `result` field of that commit — which for `git commit` actually does include the human-readable message ("nothing to commit"), but only because git writes the diagnostic to stdout, not because the SDK was designed to surface stderr.

**Gap classification: Gap C (contract-behavior blind spot).** The mock IS at the correct boundary, shape IS correct (`exitCode`, `result`). The gap is that `result` is `stdout` only; the SDK's `ExecuteResponse` has no `stderr` field (`ExecuteResponse.d.ts:21-25` — only `exitCode`, `result`, `artifacts`). Production code reads `addResponse.result` as the error message for `git add` failures — but `git add` writes failure diagnostics to stderr, so `result` (stdout) is empty. The empty-string error propagates as an unhelpful `Error('')` that `ManualCommitService` reports via `MANUAL_SAVE_FAILED` with an empty `error` string. The mock's success-only model never surfaces this gap.

**Production bug class hidden:** unhelpful empty-string error diagnostics on `git add` failure. A user who sees `MANUAL_SAVE_FAILED { error: '' }` during a failed commit has no actionable information, because the SDK's `result` field captures stdout and `git add` writes failures to stderr. The test that exists for `injectGitConfig` failure (which DOES surface a useful message, because `git config` writes its error to stdout) gives false confidence that the same pattern works for `commit()`.

---

### Finding F5 — `listSkills()`'s catch-block silent-swallow path is never exercised; the broad `catch (err)` masks SDK error classification

**Code path (C21, C22):** `sandbox.service.ts:144-166`.

```ts
async listSkills(sandboxId: string): Promise<SkillInfo[]> {
  try {
    const sandbox = await this.getSandbox(sandboxId);
    const response = await sandbox.process.executeCommand('ls -1 .claude/skills/', REPO_SUBDIRECTORY, undefined, 10);
    const output = response.result.trim();
    if (!output) return [];
    return output.split('\n').map((line) => line.trim()).filter(...).map((name) => ({ name }));
  } catch (err) {
    this.logger.warn(`listSkills failed for sandbox ${sandboxId}: ${err}`);
    return [];
  }
}
```

**Test coverage:** `sandbox.service.nfr-s1.spec.ts:160-173` — happy-path only: `mockSandbox.process.executeCommand.mockResolvedValue({ exitCode: 0, result: 'skill-1\nskill-2' })`, asserts the command string and that no credential interpolation occurs.
- `conversations.service.spec.ts:300-333` — exercises `listSkills` via `SandboxServiceFake` (the fake's `listSkills` just returns the configured skills list — `sandbox-service.fake.ts:143-145` — and never throws).

**What the tests assume:** `executeCommand` always resolves with `exitCode: 0` and a populated or empty `result`; resolve-with-empty-string is the only "no skills" path.

**What the real contract is:** the call can fail in several ways `executeCommand` and the SDK do not surface via `{ exitCode: 0, result: '' }`:
- `executeCommand` itself rejects (network failure to the sandbox toolbox, `DaytonaConnectionError`, sandbox stopped between the prior `get` and this command).
- `executeCommand` resolves with `exitCode: 1` (or non-zero) when `.claude/skills/` doesn't exist (`ls` exits 2 with a stderr message; `result` for `ls` failures captures only stdout). The production code does NOT check `exitCode` before reading `result` — it reads `result.trim()` regardless. A failed `ls` typically returns `result: ''` (stdout empty) and a non-zero exitCode; the code returns `[]` via the `if (!output)` branch — but only if `result` happens to be empty. If `ls` ever writes to stdout in a future/proxied failure mode, the parsing returns junk.
- The `getSandbox(sandboxId)` call itself can throw `DaytonaNotFoundError` for a sandbox that was archived/auto-archived between provisioning and the `listSkills` call.

**Gap classification: Gap C (contract-behavior blind spot).** The mock IS at the correct boundary, shape IS correct. The catch-block-at-162 swallows all errors and logs only a warning (`this.logger.warn(...)`). The broad `catch (err)` does not distinguish between an empty-skills directory (a legitimate operational state — return `[]`) and a real failure (sandbox unreachable, archived, stopped) — both return `[]`. No test models `mockSandbox.process.executeCommand.mockRejectedValueOnce(...)` or a non-zero exitCode, so the silent-swallow behavior and the missing `exitCode` check on `result.trim()` are never validated.

**Production bug class hidden:** masked operational failures. A user who tries to list skills against a stopped/archived sandbox sees an empty skills list with no diagnostic, no recovery hint, no signal that the sandbox is unreachable — `listSkills` reports the same `[]` as "this repo has no skills". The frontend slash-command picker (`Story 3.2` — `conversations.service.spec.ts:300-333` exercises only the happy path via the fake) cannot distinguish "no skills" from "sandbox broken". The success-only mock and the success-only fake agree on the same assumption.

---

## 4. Verdict

**⚠️ False confidence found.** 5 findings, comprising 2 Gap A instances, 1 Gap B instance, and 4 Gap C instances (two findings span multiple gaps):

| Finding | Title | Gap |
|---|---|---|
| F1 | `destroy()` untested at SDK boundary + `isNotFoundError()` fabricated against real `DaytonaNotFoundError` type | Gap A + Gap B |
| F2 | `provision()` cleanup branch is dead code; "no zombie sandboxes" integration test is vacuously true | Gap A + Gap C |
| F3 | `resume()`'s `daytona.start()` success-only mock skips `DaytonaTimeoutError` / error-state failure modes | Gap C |
| F4 | `commit()`'s `exitCode != 0` failure path for `git add`/`git commit` not exercised; empty-string error diagnostic hidden | Gap C |
| F5 | `listSkills()` catch-block silent-swallow + missing `exitCode` check uncovered | Gap C |

**What's working well (and therefore excluded from findings):**

- The `mock-daytona.ts` factory (`mock-daytona.ts:21-159`) imports real SDK types (`ExecuteResponse`, `GitStatus`, `FileStatus`, `Status`) from `@daytonaio/sdk/cjs/types/ExecuteResponse` and `@daytona/toolbox-api-client`, then exposes `MockDaytona` / `MockSandbox` interfaces with type-correct signatures. The `MockGitClone` (7 params) matches `Git.clone` (`Git.d.ts:120`) exactly; `MockExecuteCommand` matches `Process.executeCommand` (`Process.d.ts:67`); `MockGitStatus` matches `Git.status`. The factory IS placed at the correct boundary (the `@daytonaio/sdk` external dependency, not the `ISandboxService` service boundary). **The mock factory itself is shape-correct.**
- The `getWorkingTreeStatus()` SDK mapping (`sandbox.service.ts:113-120`) has **strong** fidelity coverage in `sandbox.service.working-tree.spec.ts:39-178`: 8 tests covering modified, untracked, rename-new-path, paths-with-spaces, staged-only, fully-unmodified-filter, plus a `mockRejectedValueOnce` test (nfr-s1:261). This is the model coverage shape other methods should follow. Not a finding.
- The `clone()` SDK migration (`sandbox.service.ts:50-60`) IS tested at the SDK boundary with both the happy path (`nfr-s1.spec.ts:79-117`) and the propagated-error path (`nfr-s1.spec.ts:226-258`), including the destination-path-already-exists failure mode that matches real `git clone` behavior. Not a finding.
- The `injectGitConfig()` exitCode-failure path (`nfr-s1.spec.ts:207-223`) IS properly exercised with `{ exitCode: 1, result: 'git config failed' }` and asserted to throw. The pattern is correct; F4 is specifically that the **same pattern is missing for `commit()`**.
- The `sdk-contract-replay.spec.ts` recorded-session replay for `@anthropic-ai/claude-agent-sdk` is correctly designed at the right boundary with a real recorded JSONL fixture — but covers only the Claude Agent SDK, not the Daytona SDK.

**The `as unknown as Daytona` cast at `nfr-s1.spec.ts:42` and `working-tree.spec.ts:46`:** the cast silences the compiler where it would otherwise flag that `MockDaytona` omits `stop`, `list`, `_experimental_fork`, `volume`, `snapshot`, `createAxiosInstance` from the real `Daytona` class. This is a type-assertion bypass, but the `MockDaytona` interface explicitly declares only the four methods `SandboxService` consumes (`create`, `get`, `delete`, `start`), so the cast does not currently hide a shape mismatch between the mock's call sites and the SDK's signatures. Flagging as a **stylistic weakness, not a finding**: the typed-`MockDaytona` interface is the forcing function the comments claim (`mock-daytona.ts:5-9`), and a future SDK signature change to `create` / `get` / `delete` / `start` would surface as a compile error in the `MockDaytona` fields. If `SandboxService` ever calls a fifth `Daytona` method (e.g. `stop`, `list`), the missing field on `MockDaytona` would silently not exist and the cast would mask the gap — recommend tightening by importing `Daytona` and `Pick`-ing the consumed methods rather than hand-declaring the interface.

---

## 5. Cross-references

### 5a. Architecture prescription: recorded-session replay for SDK contracts — applies to `@daytonaio/sdk` but is not implemented for `SandboxService`

- `docs/sdk-contract-testing-gap.md:63` — explicitly identifies `SandboxService` (Daytona SDK) as a candidate for the recorded-session replay pattern:
  > "This concern is not specific to `AgentService`. Any code that consumes an external SDK's streaming or message contract and tests against hand-rolled fixtures has the same gap. The recorded-session approach applies wherever an external contract is consumed. `SandboxService` (Daytona SDK) and `artifacts.service.ts` (GitHub API contents) are candidates for the same treatment if they have similar fabricated-fixture tests."

- `_bmad-output/implementation-artifacts/retrospective-sdk-contract-fidelity-gap-2026-07-06.md:148` — retrospective item 2 prescribes:
  > "Add to the Testing Rules section: a rule that any code consuming an external SDK's streaming or message contract (`@anthropic-ai/claude-agent-sdk`, `@daytonaio/sdk`, GitHub API contents) should ship with a recorded-session replay test as the contract anchor, not just fabricated-fixture tests. Reference `sdk-contract-replay.spec.ts` as the canonical pattern."

  The rule text explicitly names `@daytonaio/sdk`. The retrospective continues: "Accepted approaches: (a) recorded-session replay fixture — commit a JSONL of real SDK output, replay through the real processing code, assert the output sequence; (b) type-checked construction — construct real SDK types using the SDK's own type declarations without `as` bypasses, so the compiler enforces the shape."

  **Status:** `@daytonaio/sdk` is named in the prescription. No Daytona replay fixture exists in `apps/agent-be/test/fixtures/`. The `mock-daytona.ts` factory does use real SDK types (option b — type-checked construction), which satisfies the type-checked alternative for the cases it covers (C1, C4, C10, C11-C22) but does NOT capture recorded real-SDK responses for error-mode behaviors (F1, F3, F5). The prescription's option-(a) recorded-session technique is the prescribed safeguard for the exact gap class F1/F3/F5 fall into, and it has not been implemented for `SandboxService`.

- `.claude/skills/bmad-dev-story/SKILL.md:350` — the `critical` rule:
  > "Tests MUST exercise the real SDK contract shape — not a fabricated fixture that matches what the code expects. ... Do NOT use `as SDKMessage` or similar type assertions to bypass the compiler when constructing test fixtures — they silence the type checker and hide shape mismatches between the assumed contract and the real contract. Accepted approaches: (a) recorded-session replay fixture; (b) type-checked construction... See `docs/sdk-contract-testing-gap.md` for the incident that motivated this requirement."

  The `as unknown as Daytona` casts at `nfr-s1.spec.ts:42` / `working-tree.spec.ts:46` are in borderline compliance with this rule: the `MockDaytona` interface is type-checked against the real SDK types via the imported `ExecuteResponse` / `GitStatus` / `FileStatus` types, but the cast to `Daytona` itself bypasses the compiler check that `MockDaytona` is a complete substitute for the real class.

### 5b. Architecture prescription: SDK upgrade policy — gated on changelog + session replay

- `_bmad-output/planning-artifacts/architecture.md:80` — "Before any upgrade: diff the JSONL→AG-UI event mapping in the release changelog; run the new version against a recorded BMAD session replay and validate the expected AG-UI event sequence matches." Originally scoped to "sandbox-agent" (the JSONL→AG-UI bridge), but the principle applies equally to `SandboxService` consuming `@daytonaio/sdk`: a `0.187.0 → 0.188.0` bump that changes the `DaytonaNotFoundError` message phrasing, the `create` failure-after-allocation behavior, or the `executeCommand` return shape would silently break F1/F2/F4 and no test would catch it.

- `_bmad-output/implementation-artifacts/3-1-provision-a-sandbox-when-opening-a-conversation.md:294` — Story 3.1 recorded: "Used by `SandboxService` for Daytona Cloud sandbox management. Do NOT upgrade without changelog review + session replay validation". The prescription exists; the session replay validation for Daytona has not been implemented.

### 5c. Epics prescription: recorded BMAD session replay

- `_bmad-output/planning-artifacts/epics.md:117-118` — recorded-session replay prescription. The Wave-1 fidelity audit (`_bmad-output/test-artifacts/test-fidelity-audit-2026-07-12.md:122`) explicitly scoped this as applying only to `sandbox-agent` (JSONL→AG-UI bridge) and not to the Daytona SandboxService — that scoping is correct for the epic language, but `docs/sdk-contract-testing-gap.md:63` extends the principle to `SandboxService`, and this audit confirms the extension has not been implemented.

### 5d. Traceability matrix sequencing

- `_bmad-output/test-artifacts/traceability-matrix.md:166` — the matrix registers `sandbox.service.nfr-s1`, `sandbox.service.working-tree`, and `sdk-contract-replay` as the three test artifacts for the sandbox area. The `sdk-contract-replay` row is described as "(recorded-session contract test)" — its description does NOT indicate it covers only the Claude Agent SDK and not the Daytona SDK. A reader of the traceability matrix would reasonably assume `sdk-contract-replay` covers both SDK contracts. Recommend updating the matrix description to scope it precisely to `@anthropic-ai/claude-agent-sdk` until a Daytona replay fixture is added.

---

## 6. Recommended remediation (informational — not part of the verdict)

These are not findings; they are the minimal changes that would close each gap. Listed so an implementer can act on the report immediately.

- **F1 (Gap A+B):** add a test in `sandbox.service.nfr-s1.spec.ts` that constructs the real `SandboxService` against `mock-daytona`, calls `service.destroy('nonexistent-id')`, and uses `mockDaytona.get.mockRejectedValueOnce(new DaytonaNotFoundError(...))` (import the real error class from `@daytonaio/sdk`) to assert the method returns void (idempotent destroy). Add a second test with a non-404 `DaytonaError` to assert it propagates. Replace the string-`includes('not found' || '404')` heuristic (`sandbox.service.ts:181-182`) with `err instanceof DaytonaNotFoundError || (err instanceof DaytonaError && err.statusCode === 404)`.
- **F2 (Gap A+C):** either (a) delete the dead `if (sandbox) { ... }` cleanup branch (`sandbox.service.ts:39-45`) since the SDK contract precludes a partial-`Sandbox` return on rejection, OR (b) if partial-allocation cleanup is the intent, surface the sandbox ID from the SDK's failure metadata (the SDK's `DaytonaError` from `create` may carry response headers with the created sandbox ID — verify against the SDK source) and the catch block should re-`get` that ID and delete it. The current code does neither and the dead branch is misleading.
- **F3 (Gap C):** add `mockDaytona.start.mockRejectedValueOnce(new DaytonaTimeoutError('Sandbox failed to start'))` test; assert `resume()` propagates (current behavior) OR, if recovery is desired, add `sandbox.recover()` retry logic and assert it runs.
- **F4 (Gap C):** add `mockSandbox.process.executeCommand.mockResolvedValueOnce({ exitCode: 1, result: '' }).mockResolvedValueOnce({ exitCode: 0, result: '' })` to test `commit()` throwing on `git add` failure. Add a parallel test for `git commit` failure with `result: 'nothing to commit'`. Consider whether the production code should surface `artifacts.stdout` (the `ExecuteResponse.artifacts.stdout` field — `ExecuteResponse.d.ts:10`) or push the SDK for a `stderr` field, since empty `result` produces an empty `Error('')`.
- **F5 (Gap C):** add `mockSandbox.process.executeCommand.mockRejectedValueOnce(new Error('ENOTREACHABLE'))` test for `listSkills()` and assert it returns `[]` (silent-swallow is the desired behavior, but it should be an explicit asserted contract, not an unexercised code path). Add a test for `executeCommand` returning `exitCode: 2, result: ''` (the `ls` "no such directory" failure) and assert it returns `[]` (currently works via the `if (!output)` branch, but the `exitCode` check is bypassed — should be explicit).
- **General (cross-references 5a/5b):** add a `apps/agent-be/test/fixtures/daytona-sandbox-replay.jsonl` recorded fixture and a `sandbox.sdk-contract-replay.spec.ts` that replays a real recorded Daytona session through the real `SandboxService` (provision → clone → injectGitConfig → commit → destroy sequence with a real recorded SDK response trace), per `retrospective-sdk-contract-fidelity-gap-2026-07-06.md:148` item 2. This is the architecture-prescribed safeguard that has not been implemented.
- **Stylistic:** tighten `mock-daytona.ts:21-69` to derive `MockDaytona` from `Pick<Daytona, 'create' | 'get' | 'delete' | 'start'>` rather than hand-declaring the interface, so the cast at `nfr-s1.spec.ts:42` can be removed and any future SDK method `SandboxService` calls a fifth method will surface as a compile error in the mock.

---

*Report prepared by Vera, the Test Fidelity Auditor. Evidence is `path:line`-cited throughout; no finding is asserted without a reference to either production code, real SDK type declaration, or test file. The verdict is false confidence found — the tests that pass do so against the author's assumed model of the Daytona SDK contract, not against the contract's actual failure modes and typed error hierarchy.*
