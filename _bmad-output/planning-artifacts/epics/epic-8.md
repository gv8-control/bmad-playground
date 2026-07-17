# Epic 8: Sandbox Reconciliation via Environment-Scoped Labels

Daytona sandboxes from local dev, the dev deployment, tests, and production share one account and a 30GiB disk quota, with no reconciliation mechanism — sandboxes leak on crashes, provisioning-window failures, and transient destroy failures, exhausting the quota. This epic adds an environment-scope label to every sandbox at creation time and a periodic background reaper that lists sandboxes by that label, reconciles them against the database, and destroys orphans. Defense-in-depth for the in-process cleanup paths in Epic 3 (Stories 3.1, 3.9, 3.12) that cannot run when the process crashes.

**Change proposal:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-17-sandbox-reaper.md`

## Story 8.1: Reconcile Orphaned Sandboxes via Environment-Scoped Labels

As the platform operator,
I want every Daytona sandbox tagged with the environment that created it and a background reaper that destroys orphaned sandboxes scoped to its own environment,
So that sandbox leaks from crashes, provisioning-window failures, and transient destroy failures do not accumulate against the shared 30GiB disk quota and block provisioning across environments.

**Acceptance Criteria:**

**Given** the `apps/agent-be` environment validation schema in `env.validation.ts`
**When** the Zod schema is extended
**Then** `SANDBOX_ENV_LABEL` is a required, non-empty string (`z.string().min(1)`) — startup fails loudly if it is unset or empty, rather than silently provisioning unlabeled sandboxes
**And** `SANDBOX_REAPER_INTERVAL_MS` is an optional string parsed to an integer with a default of `900000` (15 minutes) when unset or invalid, matching the `MID_SESSION_IDLE_TIMEOUT_MS` env-parsing pattern in `idle-timeout.service.ts`
**And** `configuration.ts` maps both to config keys (`sandboxEnvLabel`, `sandboxReaperIntervalMs`) so they are injectable via `ConfigService`

**Given** `SandboxService.provision()` calls `daytona.create()` in `sandbox.service.ts`
**When** the create call is made
**Then** the `labels` object includes both `conversationId` (unchanged) and `scope` set to the `SANDBOX_ENV_LABEL` value — `labels: { conversationId: params.conversationId, scope: config.sandboxEnvLabel }` — so every sandbox is attributable to its environment at the Daytona API level
**And** the existing `envVars` and `networkAllowList` arguments are unchanged
**And** a sandbox created without the `scope` label (e.g. a pre-existing sandbox from before this story) is not destroyed by the reaper on the basis of a missing label alone — it is logged and skipped, not guessed at

**Given** the typed mock factory `mock-daytona.ts` is the sole test seam for the Daytona SDK boundary
**When** it is extended to support the reaper
**Then** the `MockDaytona` interface gains a `list` method typed as `jest.Mock<AsyncIterableIterator<MockSandbox>, [ListSandboxesQuery?]>` matching the real SDK signature `list(query?: ListSandboxesQuery): AsyncIterableIterator<Sandbox>`
**And** the `createMockDaytona` factory accepts a list of pre-built mock sandboxes (or a filtering function) so a test can seed sandboxes with mixed labels and assert the reaper iterates only those matching its `scope` label
**And** the existing `create`/`get`/`delete`/`start` mocks are unchanged

**Given** a new `SandboxReaperService` in `apps/agent-be/src/sandbox/sandbox-reaper.service.ts`, registered as a provider in `SandboxModule`
**When** its `reap()` method runs
**Then** it calls `daytona.list({ labels: { scope: config.sandboxEnvLabel } })` — server-side label filtering returns only sandboxes belonging to this environment, not every sandbox in the account
**And** for each returned sandbox it reconciles against the database: it looks up the conversation by the sandbox's `conversationId` label (or by `sandboxId` against `conversation.sandboxId`)
**And** it destroys a sandbox only if the conversation record is gone, or `conversation.sandboxStatus` is `'idle-timeout'` or `'failed'` (terminal statuses where the sandbox should no longer be alive)
**And** it skips (does not destroy) any sandbox whose conversation has status `'ready'` or `'provisioning'` — these are active sandboxes, even if the in-memory `sandboxIds` Map has lost them (e.g. post-restart)
**And** destroy failures are logged but do not abort the reap pass — the next interval retries them (transient Daytona failures)
**And** the reaper does not depend on `ConversationsService`'s in-memory `sandboxIds`/`sandboxStatuses` Maps (which are lost on restart) — it reads Postgres, which survives

**Given** the reaper must run periodically without a new dependency
**When** `SandboxReaperService` implements `OnModuleInit` and `OnModuleDestroy`
**Then** `onModuleInit` starts a `setInterval` with the configured `SANDBOX_REAPER_INTERVAL_MS` (default 15 minutes) calling `reap()`, and the timer is `.unref()`'d so it does not keep the process alive on shutdown (matching `IdleTimeoutService`'s pattern)
**And** `onModuleDestroy` clears the interval (matching `IdleTimeoutService.onModuleDestroy` → `clearAll`)
**And** no `@nestjs/schedule` dependency is added — `setInterval` is the scheduling primitive
**And** the first `reap()` does not fire immediately on boot (it waits one interval) so a rolling deploy does not race against in-flight provisioning

**Given** the existing `scripts/cleanup-daytona-sandboxes.ts` lists and deletes all sandboxes unscoped
**When** it is updated
**Then** it accepts an optional `--scope <value>` flag (parsed from `process.argv`) that, when present, filters `daytona.list({ labels: { scope: value } })` so the script destroys only sandboxes belonging to that scope
**And** when the flag is absent, the existing behavior (list and delete all) is preserved with a deprecation warning printed to stderr recommending `--scope` for safety
**And** the script's existing `DAYTONA_API_URL` / `DAYTONA_API_KEY` env-var requirement and `process.exit(0)` on failure are unchanged

**Given** each environment (local dev, dev deployment, tests, production) shares one Daytona account
**When** environment configuration is applied
**Then** `SANDBOX_ENV_LABEL` is set to a distinct value in each: `local` for local development, `dev` for the dev deployment, `prod` for production, and `test` for the test suite
**And** the values are documented in `.env.example` (or the equivalent env-var reference) so a new contributor cannot start `apps/agent-be` without setting `SANDBOX_ENV_LABEL` (the Zod validation enforces this at boot)
**And** `SANDBOX_REAPER_INTERVAL_MS` is optionally tunable per environment (e.g. a shorter interval in `test`) but ships with the 15-minute default everywhere

**Scope notes:**

- **Defense-in-depth, not a replacement.** The reaper is the reconciliation backstop for leaks the in-process cleanup paths (Story 3.1 provision-failure cleanup, Story 3.9 mid-session idle teardown, Story 3.12 graceful drain) cannot reach — crashes, `SIGKILL`, OOM, and transient Daytona destroy failures. Those in-process paths remain the first line of defense and are not removed or weakened. Optionally, Story 8.1 may also add an `onModuleDestroy` hook to `ConversationsService` to destroy known-active sandboxes on graceful `SIGTERM` (closing cause 1's graceful-shutdown case directly); this is in-scope as a first-line improvement but not required for the story to close — the reaper covers it.
- **Why `scope` and not `env`.** `env` is a common Daytona label name; `scope` avoids collision and reads clearly as "the scope this sandbox belongs to." The label value is the environment identifier (`local`/`dev`/`prod`/`test`).
- **Why reconcile against Postgres, not in-memory Maps.** `ConversationsService.sandboxStatuses` and `sandboxIds` are in-memory `Map`s lost on restart (the gap Story 3.12's prerequisite flagged). A reaper that read those Maps would itself be blind immediately after a crash — the exact scenario that orphans sandboxes. Postgres `conversation.sandboxStatus` / `conversation.sandboxId` survive restarts.
- **Terminal-status gate.** `'idle-timeout'` and `'failed'` are the statuses `ConversationsService` sets when it believes it has torn down (or failed to set up) a sandbox. If a sandbox with one of these statuses is still alive in Daytona, the in-process destroy either never ran (crash) or failed (transient error) — the reaper finishes the job. `'ready'` and `'provisioning'` mean the application believes the sandbox is active; the reaper leaves them alone even if no in-memory record exists, because a post-restart `ready` sandbox may be serving a resumed conversation.
- **No schema migration.** The reaper reads existing `Conversation.sandboxStatus` and `Conversation.sandboxId` columns (persisted by `ConversationsService.persistSandboxState`). No new column or table.
- **`setInterval` + `.unref()` rationale.** Matches `IdleTimeoutService` exactly. `.unref()` ensures the reaper timer does not prevent `apps/agent-be` from exiting on shutdown; `onModuleDestroy` clears it. No `@nestjs/schedule` dependency — the project does not use it and one periodic task does not justify adding it.
- **First reap deferred one interval.** A rolling deploy starts a new instance while the old instance's sandboxes are still active. Firing `reap()` immediately on boot could destroy a sandbox the old instance is still serving. Waiting one interval gives the old instance time to drain (Story 3.12's graceful-drain window).
- **Pre-existing unlabeled sandboxes.** Sandboxes created before this story ships have no `scope` label and will not be returned by `daytona.list({ labels: { scope } })`. They are not destroyed by the reaper (it cannot see them). A one-time manual cleanup using the updated `cleanup-daytona-sandboxes.ts` (without `--scope`, or with a one-off label injection) clears them; this is an operational cutover step, not a story AC.
- **No dependencies on other stories or epics.** Epic 8 is independent of Epic 7 (frontend) and the done Epics 1–6.
