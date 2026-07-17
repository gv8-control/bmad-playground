# Epic 8: Sandbox Lifecycle and Transport Correction

Two structural gaps in the sandbox infrastructure: (1) Daytona sandboxes from local dev, the dev deployment, tests, and production share one account and a 30GiB disk quota, with no reconciliation mechanism — sandboxes leak on crashes, provisioning-window failures, and transient destroy failures, exhausting the quota; (2) the event bridge's transport mechanism is built on a stale architectural assumption (JSONL-on-stdout) that contradicts the research-established truth (sandbox-agent is an HTTP server on port 2468) — no conversation can succeed against the current code. Direct binary inspection on 2026-07-17 revealed two additional defects: the wrong npm package is installed (`@anthropic-ai/claude-code` CLI instead of the ACP agent process), and the assumed API endpoints were wrong (ACP JSON-RPC, not REST-style `/run`). This epic adds an environment-scope label and background reaper for orphan reconciliation (Story 8.1), rewrites the event bridge's transport from JSONL-on-stdout to ACP HTTP SSE consumption of port 2468 and fixes agent installation via `install-agent` (Story 8.2), and establishes local dev parity plus real-service E2E verification (Story 8.3). Architecture document reconciliation is a handoff item for the Architect per the change proposal, not a story.

**Change proposals:**
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-17-sandbox-reaper.md` (Story 8.1)
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-17-sandbox-agent-transport.md` (Stories 8.2–8.3)

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
- **Story 8.1 has no dependencies on other stories or epics.** The reaper is independent of Epic 7 (frontend) and the done Epics 1–6. Stories 8.2–8.3 (transport correction) have dependencies on Epic 6 retro action items — see their individual scope notes.

## Story 8.2: Replace AguiEventBridgeService Transport with ACP HTTP SSE on Port 2468 + Fix Agent Installation

As the developer,
I want the event bridge to consume sandbox-agent's ACP HTTP SSE API on port 2468 instead of parsing JSONL on stdout, and Claude Code installed via `install-agent` instead of `npm install -g`,
So that agent events actually flow from the real sandbox-agent binary to the browser SSE pipeline — the current transport is structurally broken, the wrong package is installed, and no conversation can succeed against it.

**Acceptance Criteria:**

**Given** `AguiEventBridgeService.streamAgentEvents()` (lines 91-225) currently calls `sandboxService.streamAgentLogs()` and registers an `onStdout` callback that splits on newlines and JSON-parses each line
**When** the transport is rewritten
**Then** `streamAgentEvents()` opens an HTTP SSE connection to `GET http://<sandbox-tunnel-host>:2468/v1/acp/{server_id}` (verified endpoint — ACP JSON-RPC envelopes) and consumes SSE events
**And** the `onStdout` callback, `MAX_LINE_BUFFER_BYTES` buffer cap, and `buffer += chunk` / `lines.split('\n')` logic (lines 132-150) are removed — they are unused under the ACP SSE transport
**And** `processAgentEvent()` JSON-parsing (lines 267-290) is reused — sandbox-agent's SSE events are still JSON-per-frame, but the envelope schema is ACP JSON-RPC (not the `{ event_id, session_id, type, data }` shape originally assumed) — the exact envelope shapes must be discovered by inspecting the real SSE stream during implementation
**And** the transport-agnostic patterns are preserved: circuit breaker (120s timeout), `OnModuleDestroy` cleanup, lifecycle event ownership, `onEvent` callback seam, abort sentinel handling, `ABORT_SENTINELS` / `AGENT_STREAM_CRASHED` flow

**Given** `SandboxService.installBinaries()` (lines 309-359) currently runs `sudo -E env "PATH=$PATH" npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}` which installs the wrong package (the CLI, not the ACP agent process the server manages)
**When** the installation is corrected
**Then** `installBinaries()` runs `sandbox-agent install-agent claude` (first-class subcommand, no sudo, installs to `~/.local/share/sandbox-agent/bin/`) which installs both the native binary and the `@agentclientprotocol/claude-agent-acp` agent process
**And** the `CLAUDE_CODE_VERSION` constant (line 50) is removed or renamed — `install-agent` resolves the latest compatible version by default, or pins via `--agent-version` if exact pinning is still required
**And** the npm install verification step (lines 350-358) is replaced with a `GET /v1/agents` health check confirming `{"id":"claude","installed":true}`
**And** the NFR-S1 test at `sandbox.service.nfr-s1.spec.ts:509` (asserts `npm install -g @anthropic-ai/claude-code@<version>`) is rewritten to assert `install-agent claude`

**Given** `SandboxService.createAgentSession()` (lines 381-405) currently receives `sandbox-agent --agent claude-code --prompt <message>` as the command string
**When** the invocation is updated
**Then** the daemon is started as `sandbox-agent server` (recommended: once per provision in `installBinaries()`, surviving across turns — design decision confirmed in implementation)
**And** `createAgentSession` either becomes a no-op (daemon-per-provision) or starts the daemon per conversation (daemon-per-conversation) per the design decision
**And** `AgentService.runTurn()` no longer constructs the `--agent claude-code --prompt` placeholder — it sends ACP JSON-RPC envelopes via `POST http://<sandbox-tunnel-host>:2468/v1/acp/{server_id}` with the user message
**And** `terminateAgentSession()` closes the ACP stream via `POST http://.../v1/acp/{server_id}/close` (if daemon-per-provision) or terminates the daemon (if daemon-per-conversation)

**Given** the `ISandboxService` interface (`libs/shared-types/src/sandbox.interface.ts`) may need new methods
**When** the interface is updated
**Then** it exposes methods matching the new transport (e.g. `startSandboxAgent(sandboxId): Promise<{ port: number; baseUrl: string }>` + `stopSandboxAgent(sandboxId): Promise<void>`) or the existing `createAgentSession` / `streamAgentLogs` / `terminateAgentSession` signatures are replaced to match the HTTP SSE contract
**And** the `AgentSessionHandle` type evolves if the handle is no longer `{ sessionId, commandId }` but `{ serverId: string; baseUrl: string }` (ACP uses `server_id`, not `runId`)

**Given** Story 6.2's 44 ATDD tests mock JSONL chunks on stdout via `SandboxServiceFake`
**When** the tests are re-evaluated
**Then** tests exercising transport-agnostic patterns (circuit breaker timer reset, lifecycle event ownership, `onEvent` callback seam, `OnModuleDestroy` cleanup, abort sentinel handling) survive with their assertions intact
**And** tests exercising the JSONL-parsing logic (`onStdout` buffer split, `MAX_LINE_BUFFER_BYTES` cap, `processAgentEvent` JSON-parsing against stdout chunks) are rewritten against the new ACP-SSE consumption contract
**And** `SandboxServiceFake` is extended to expose the ACP-SSE channel mock (a fake HTTP server emitting ACP JSON-RPC SSE events, or a mock that returns an async iterator of SSE frames)

**Given** the Daytona SDK must provide a tunnel or bridge to the sandbox's port 2468
**When** agent-be connects to the sandbox-agent HTTP API
**Then** the connection uses the Daytona SDK's per-sandbox hostname or tunnel (validated in Story 8.3 against a real sandbox)
**And** no new npm packages are required unless `eventsource` is preferred over Node 24's native `fetch` + `ReadableStream` for cleaner SSE consumption (decision deferred to implementation)

**Scope notes:**

- **Central dev story.** This is the heaviest story in Epic 8 — transport rewrite of the only path from sandbox-agent to the browser SSE pipeline, plus fixing the agent installation. Estimated 4-6 dev days.
- **Transport-agnostic layer is sound.** Epic 6's central insight (event vocabulary preservation, `onEvent` callback seam, lifecycle ownership, circuit breaker, `SessionEventsService` / `StreamingController`, cost tracking, working-tree side-effect emission) is provably independent of how events arrive at the event bridge. Only the bottom of the stack changes.
- **No conversation can succeed against the current code.** The placeholder invocation `sandbox-agent --agent claude-code --prompt <message>` starts the HTTP server; `getSessionCommandLogs` streams startup logs then blocks forever; the circuit breaker fires after 120s and emits `RUN_ERROR`. This story fixes that.
- **Wrong package installed (verified 2026-07-17).** `sudo npm install -g @anthropic-ai/claude-code` installs the Claude Code CLI, not the ACP agent process (`@agentclientprotocol/claude-agent-acp`) that the sandbox-agent server manages. The server does not discover globally-installed npm packages. Even with the transport rewritten, the server would report Claude as `"installed": false` and reject run requests. `install-agent` is the correct mechanism — no sudo, installs to `~/.local/share/sandbox-agent/bin/`, server discovers automatically.
- **False-confidence tests.** Story 6.2's 44 tests are green but exercise a fictional contract (mocked JSONL chunks the real binary never produces). Per Epic 6 retro: "A green test asserts the specific contract, not the presence of the contract's bytes."
- **Pre-implementation fidelity audit recommended.** Murat (Test Architect) should run a fidelity audit before this story starts, mirroring the CF3 SandboxService audit before Epic 6 — identifies which of Story 6.2's 44 tests survive, which need replacement, which become no longer applicable.
- **Design decision: daemon-per-provision vs. daemon-per-conversation.** Recommended: daemon-per-provision (matches architecture's "agent-be is the active party, sandbox never initiates outbound" contract and minimizes per-turn startup cost for NFR-P1's 1,500ms first-token target). Confirm in implementation.
- **sandbox-agent ACP API contract (verified 2026-07-17).** Direct binary inspection confirmed the API is ACP (Agent Client Protocol) based, NOT the REST-style `/run` / `/runs/:id/events` pattern the research docs assumed. Verified endpoints: `GET /v1/agents` (list agents + install status), `POST /v1/acp/{server_id}` (send ACP JSON-RPC envelope), `GET /v1/acp/{server_id}` (stream ACP JSON-RPC envelopes via SSE), `POST /v1/acp/{server_id}/close` (close stream). The `server_id` identifies the agent (e.g. `claude`). The exact ACP JSON-RPC envelope schema carried by the SSE stream is NOT yet verified — Story 8.2 must inspect the real SSE stream output during implementation to discover the envelope shapes and map them to AG-UI events. See change proposal Resolved Unknown #1 for full details.

## Story 8.3: Local Dev Parity + Real-Service E2E Verification

As the developer and operator,
I want `nx serve agent-be` to work locally without the sandbox-agent binary and the real-service E2E specs to actually run against a real Daytona sandbox,
So that the transport rewrite is verified end-to-end and local development is not blocked by a missing binary that only exists in the Docker image.

**Acceptance Criteria:**

**Given** `nx serve agent-be` locally fails on first conversation request because `/opt/sandbox-agent` binary doesn't exist on the host (baked into the Docker image per `Dockerfile` lines 10-12, 47)
**When** local dev parity is established
**Then** `SandboxServiceFake` handles the new HTTP SSE path so `nx serve agent-be` works for full-stack smoke without the real binary
**And** the binary requirement remains for production / Docker-based smoke (documented in local dev setup)
**And** a developer running `nx serve agent-be` locally can send a message and receive a simulated agent event stream without ENOENT errors

**Given** Story 6.5's 5 real-service E2E specs are written with `beforeAll` env-var skip guards (`PLAYWRIGHT_REAL_SERVICE=1` not set in CI)
**When** the real-service verification runs
**Then** `PLAYWRIGHT_REAL_SERVICE=1 yarn playwright test --grep @real-service` discovers and runs all 5 specs (egress-control, functional-file-access, functional-git-commands, functional-stop-agent, functional-host-isolation)
**And** the specs run against a real Daytona sandbox + real sandbox-agent + real Anthropic API
**And** the specs pass (or surface real contract gaps that Story 8.2's implementation must address)

**Given** NFR-O1 (per-user LLM spend tracking) depends on cost data arriving via sandbox-agent's `RUN_FINISHED` event
**When** the real-service E2E verifies cost tracking
**Then** cost data arrives via the `RUN_FINISHED` event's `data` payload and `CostTrackingService` records it
**And** if the schema differs from what Story 6.3's cost capture expects, the gap is surfaced and addressed (compat shim in Story 8.2 or documented as a follow-up)

**Scope notes:**

- **Gated on Epic 6 retro Action Item #1** (operational prerequisites: GitHub test account with 2FA, CI secrets, OAuth callback setup, Anthropic API key for testing). Marius owns this workstream. Story 8.3 cannot run until these are resolved.
- **Gated on Epic 6 retro Action Item #2** (JWT Edge-vs-Node decryption) for the 3 PR-tier Playwright specs. The 5 functional real-service specs (Tier 3, agent-be to Daytona to Anthropic) don't require the JWT fix — they hit agent-be directly with a boundary JWT minted in Node.
- **This is the verification gate.** Story 8.2 implements the transport rewrite against the documented contract; Story 8.3 validates it against the real binary. Without this story, the transport is still unvalidated — the same gap that allowed the JSONL-on-stdout assumption to persist through all of Epic 6.
- **Closes Epic 6 retro Action Item #1's verification gap.** The retro flagged that real-service E2E never ran. This story is where it finally runs.
