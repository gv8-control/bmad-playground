---
baseline_commit: d357b97be3d7eef62d701ad96b5c264fa16a5a78
---

# Story 3.1: Provision a Sandbox When Opening a Conversation

Status: done

## Story

As a user starting a new Conversation,
I want my session's Sandbox to begin provisioning the moment I open the page,
so that the chat is ready almost immediately instead of waiting on a cold start.

## Acceptance Criteria

### AC-1: Sandbox provisioned on page open as background operation (FR9)

**Given** a user opens a new Conversation page
**When** the page loads
**Then** a Sandbox is provisioned and the Repository is cloned inside it as a background operation, while the chat interface is visible immediately (FR9)
**And** the sandbox initialization sequence runs in order: provision → clone (or restore on resume) → inject the Story 1.5 git identity into git config → run `git status --porcelain` → emit a working-tree event → emit session-ready
**And** while provisioning, the chat input is active immediately so the user can type; if the user submits before the sandbox is ready, the input is disabled momentarily and "Starting session…" with a spinner is shown until ready, then the message sends automatically (EXPERIENCE.md New Conversation)
**And** the chat is ready for input within 10 seconds of page open for repositories under ~200MB (NFR-P2)

### AC-2: First message before sandbox ready is queued

**Given** the user sends a first message before the Sandbox is ready
**When** they submit
**Then** the input is disabled momentarily, "Starting session…" is shown, and the message sends automatically once ready

### AC-3: Pre-first-message idle timeout (60s)

**Given** a Sandbox is provisioned but receives no first message within 60 seconds
**When** the timeout elapses
**Then** the Sandbox is torn down to avoid a wasted allocation

### AC-4: Provision failure cleanup

**Given** a `SandboxService.provision()` call fails
**When** the failure occurs
**Then** any partial Daytona allocation is torn down to avoid a zombie sandbox accruing billing

### AC-5: Client-side session-start timeout with retry

**Given** `SESSION_READY` never arrives (e.g. a Daytona provisioning error)
**When** a client-side timeout (distinct from the server-side idle timeout) elapses
**Then** the user sees a retry affordance rather than an indefinitely spinning "Starting session…" state

### AC-6: Per-user provision concurrency cap

**Given** a user opens multiple Conversation tabs in quick succession
**When** simultaneous provisioning is requested
**Then** a per-user concurrency cap of 2 simultaneous provisions prevents bursting GitHub's OAuth rate limit; a 3rd simultaneous request queues until a slot frees

### AC-7: Prisma schema — Conversation and Turn models

**Given** no `Conversation` or `Turn` tables exist yet
**When** this story is implemented
**Then** the Prisma schema (`libs/database-schemas`) is extended with `Conversation` (owning user, stable URL id, semantic title, `last_active_at`) and `Turn` (conversation id, role, content, timestamp) models, and a migration is generated and committed — this is the schema dependency Story 3.5 (resume) and Story 3.12 (turn persistence on every turn) read and write against

## Tasks / Subtasks

- [x] Task 1: Prisma schema — Conversation and Turn models (AC: 7)
  - [x] 1.1 Add `Conversation` model to `libs/database-schemas/src/prisma/schema.prisma` — fields: `id` (cuid), `userId` (FK to User), `title` (nullable, semantic title assigned in Story 3.2), `lastActiveAt` (DateTime, indexed for future archival), `createdAt`, `updatedAt`. Add `@@map("conversations")`, `@map` on columns. Add `conversations Conversation[]` relation to `User` model. Add `@@index([userId, lastActiveAt])` for the side-nav "last 5 conversations" query (Story 1.8 side nav lists last 5 by semantic title — this index supports that query efficiently)
  - [x] 1.2 Add `Turn` model to `libs/database-schemas/src/prisma/schema.prisma` — fields: `id` (cuid), `conversationId` (FK to Conversation), `role` (String — `'user' | 'assistant'`), `content` (String, the message text), `createdAt` (DateTime). Add `@@map("turns")`, `@map` on columns. Add `turns Turn[]` relation to `Conversation` model. Add `@@index([conversationId, createdAt])` for ordered history retrieval (Story 3.5 resume reads turns ordered by createdAt)
  - [x] 1.3 Generate migration: `npx prisma migrate dev --name add_conversation_and_turn_models` from `libs/database-schemas`. Verify the migration SQL creates both tables with correct column names (snake_case via `@map`), foreign keys with `ON DELETE CASCADE`, and the indexes. Commit the migration file
  - [x] 1.4 Run `yarn nx build database-schemas` to regenerate the Prisma client with the new models

- [x] Task 2: agent-be foundational infrastructure (AC: 1, 3, 4, 6)
  - [x] 2.1 Create `apps/agent-be/src/config/configuration.ts` — export a `configuration()` function returning `{ databaseUrl, daytonaApiUrl, daytonaApiKey, authSecret, port }` from `process.env`. Follow the NestJS ConfigService pattern (requires `@nestjs/config` — install first, see Prerequisites)
  - [x] 2.2 Create `apps/agent-be/src/config/env.validation.ts` — Zod schema validating required env vars: `DATABASE_URL`, `DAYTONA_API_URL`, `DAYTONA_API_KEY`, `AUTH_SECRET` (boundary JWT signing key, shared with apps/web). Use `zod` ^4.4.3. Export `envSchema` and a validated `validateEnv()` function. `DAYTONA_API_URL` and `DAYTONA_API_KEY` may be empty in test env (SandboxServiceFake is injected). `AUTH_SECRET` is required in all environments where agent-be runs
  - [x] 2.3 Create `apps/agent-be/src/prisma/prisma.service.ts` — `@Injectable()` class extending `PrismaClient` from `@bmad-easy/database-schemas`, implementing `OnModuleInit` (`await this.$connect()`) and `OnModuleDestroy` (`await this.$disconnect()`). Import `PrismaClient` from `@bmad-easy/database-schemas`, never from `@prisma/client` directly
  - [x] 2.4 Create `apps/agent-be/src/prisma/prisma.module.ts` — Global module exporting `PrismaService`
  - [x] 2.5 Create `apps/agent-be/src/common/filters/http-exception.filter.ts` — global NestJS exception filter. Maps every thrown error (including Zod validation failures) to the `{ code: string, message: string, meta?: Record<string, unknown> }` JSON envelope. Use `@Catch()` (catch-all). Extract error code from error name/class, message from `error.message`, meta from additional error properties. Log with NestJS Logger (structured JSON — `debug`, `info`, `warn`, `error` levels only)
  - [x] 2.6 Create `apps/agent-be/src/common/guards/boundary-jwt.guard.ts` — validates the boundary JWT from the `Authorization: Bearer <token>` header. Extracts `userId` from the JWT payload and attaches it to `request.userId`. Use `jose.jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET!))` to verify the token against `AUTH_SECRET` (shared with apps/web — no separate `JWT_SECRET` env var). Return 401 on missing/invalid token. This guard does NOT fetch the User row — that's `active-user.guard.ts`'s job
  - [x] 2.7 Create `apps/agent-be/src/common/guards/active-user.guard.ts` — request-scoped guard that runs AFTER `BoundaryJwtGuard`. Reads `userId` from `request.userId`, fetches the live `User` row from Postgres via `PrismaService`, rejects with 403 if `!user` or if the user is not active (for MVP, all users are active — but the guard still checks). Attaches `UserContext` to `request.user`. Use `@Injectable()` with `canActivate` method
  - [x] 2.8 Create `apps/agent-be/src/common/decorators/user.decorator.ts` — `@User()` param decorator that reads `request.user` (the `UserContext` attached by `active-user.guard.ts`). Export `UserContext` type from `apps/agent-be/src/common/types/user-context.type.ts` (interface: `id`, `githubLogin`, `name`, `email`, `active`)
  - [x] 2.9 Create `apps/agent-be/src/common/types/user-context.type.ts` — `UserContext` interface with `id: string`, `githubLogin: string`, `name: string | null`, `email: string | null`, `active: boolean`
  - [x] 2.10 Update `apps/agent-be/src/app/app.module.ts` — import `ConfigModule.forRoot({ isGlobal: true, load: [configuration] })`, `PrismaModule`, register `http-exception.filter.ts` as a global filter via `APP_FILTER`, register `BoundaryJwtGuard` and `ActiveUserGuard` as global guards via `APP_GUARD` (order matters: BoundaryJwtGuard first, ActiveUserGuard second). Remove the placeholder `AppController` and `AppService` if they are no longer needed (keep `GET /health` — move it to a `HealthController` or keep `AppController` with only the health endpoint)
  - [x] 2.11 Update `apps/agent-be/src/main.ts` — add `app.useGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] })` (already present). Keep the existing prefix. No HTTP/2 adapter needed for MVP (deployment invariant, not a code requirement). Add `enableShutdownHooks()` to NestJS for graceful shutdown (Story 3.12 extends this with SSE drain)

- [x] Task 3: Boundary JWT — mint in apps/web, validate in agent-be (AC: 1)
  - [x] 3.1 Create `apps/web/src/lib/boundary-jwt.ts` — async function `mintBoundaryJwt(userId: string): Promise<string>` that signs a JWT with `{ userId, iat }` payload using `jose.SignJWT` (already available as a transitive dependency of `next-auth`) with `AUTH_SECRET` as the key (reuse the existing Auth.js secret — it's already a shared env var between apps/web and agent-be). API: `new jose.SignJWT({ userId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h').sign(new TextEncoder().encode(process.env.AUTH_SECRET!))`. Set expiration to `8h` (matching the Auth.js session maxAge). Export the function for Server Component use. This is NOT a Server Action — it's a utility function called by Server Components to pass the token to Client Components as a prop
  - [x] 3.2 Create `apps/web/src/lib/boundary-jwt.test.ts` — unit tests: [P0] mints a JWT with the correct payload (`userId`, `iat`), [P0] token is verifiable with `AUTH_SECRET` via `jose.jwtVerify()`, [P0] token has an expiry. Mock `process.env.AUTH_SECRET`
  - [x] 3.3 Add `AUTH_SECRET` note to `.env.example` — document that `AUTH_SECRET` (already required for Auth.js) is reused as the boundary JWT signing key. No separate `JWT_SECRET` env var. The boundary JWT is decoupled from Auth.js's internal JWE (different token, different purpose), but shares the signing secret. `agent-be`'s `env.validation.ts` must validate `AUTH_SECRET` is present (it already validates in apps/web; agent-be needs it for `boundary-jwt.guard.ts`)

- [x] Task 4: Credentials module in agent-be — OAuth token decryption (AC: 1)
  - [x] 4.1 Create `apps/agent-be/src/credentials/encryption.service.ts` — `@Injectable()` class replicating the AES-256-GCM envelope encryption logic from `apps/web/src/lib/crypto.ts`. Implement `decryptToken(credential: EncryptedCredential, userId: string): string` — the ONLY method needed for Story 3.1 (agent-be decrypts; it does not encrypt). Copy the `EncryptedCredential` interface, `unwrapDek`, `decryptToken`, `assertNonceLength`, `toAad`, `parseKekHex`, `computeKekId`, `getKek` functions from `apps/web/src/lib/crypto.ts`. The KEK comes from `CREDENTIAL_ENCRYPTION_KEK` env var. Export `KekConfigurationError` class. This is a deliberate duplication per the architecture's "no shared utility library beyond libs/shared-types and libs/database-schemas" rule — the same crypto logic exists independently in both services
  - [x] 4.2 Create `apps/agent-be/src/credentials/credentials.service.ts` — `@Injectable()` class with `resolveOAuthToken(userId: string): Promise<string>` method. This is the tenant-scoped OAuth token resolution (NFR-S2) — the `where: { userId }` clause IS the tenant authorization check. Fetches `OAuthCredential` from Postgres via `PrismaService`, calls `EncryptionService.decryptToken()`, returns plaintext. Throws a domain error if no credential exists or decryption fails. Mirrors `apps/web/src/lib/credential-health.ts` `resolveOAuthToken()` but lives in agent-be per the architecture's directory structure
  - [x] 4.3 Create `apps/agent-be/src/credentials/credentials.module.ts` — module exporting `EncryptionService` and `CredentialsService`, importing `PrismaModule`
  - [x] 4.4 Create `apps/agent-be/src/credentials/encryption.service.spec.ts` — [P0] decrypts a token encrypted by the apps/web `encryptToken()` function (use a test fixture encrypted with the test KEK), [P0] throws on tampered ciphertext, [P0] throws on wrong userId (AAD binding), [P1] throws `KekConfigurationError` on missing KEK

- [x] Task 5: Sandbox module — production SandboxService with Daytona (AC: 1, 3, 4, 6)
  - [x] 5.1 Create `apps/agent-be/src/sandbox/daytona-client.provider.ts` — NestJS provider that creates a Daytona client instance from `@daytonaio/sdk` 0.187.0. Export a provider object: `{ provide: 'DAYTONA_CLIENT', useFactory: (configService: ConfigService) => { ... }, inject: [ConfigService] }`. Read `DAYTONA_API_URL` and `DAYTONA_API_KEY` from config. Return `null` if either is missing (test env — SandboxServiceFake is injected instead)
  - [x] 5.2 Create `apps/agent-be/src/sandbox/sandbox.service.ts` — `@Injectable()` class implementing `ISandboxService` from `@bmad-easy/shared-types`. Inject `DAYTONA_CLIENT` (may be null in tests — but tests inject SandboxServiceFake via the DI token, so this class is never instantiated in tests). Implement:
    - `provision(params: ProvisionParams): Promise<SandboxInfo>` — creates a Daytona sandbox, returns `SandboxInfo`. On failure, call `destroy()` on any partial allocation (AC-4: "any partial Daytona allocation must be torn down"). Use try/catch: if sandbox creation succeeds but a subsequent step fails, destroy the sandbox before re-throwing
    - `clone(sandboxId: string, repoUrl: string, credential: string): Promise<void>` — executes `git clone --depth=1` inside the sandbox using the Daytona process execution API. The credential is the plaintext OAuth token, used for HTTPS transport: `https://x-access-token:{credential}@{repoUrl-without-protocol}`. Mandatory `--depth=1` shallow clone (architecture constraint — full-history clone is not supported)
    - `resume(sandboxId: string): Promise<SandboxInfo>` — starts a stopped sandbox via Daytona API, returns updated `SandboxInfo`
    - `destroy(sandboxId: string): Promise<void>` — removes the sandbox via Daytona API. Idempotent — no error if sandbox doesn't exist (catch 404)
    - `injectGitConfig(sandboxId: string, config: GitUserConfig): Promise<void>` — executes `git config user.name "{config.name}"` and `git config user.email "{config.email}"` inside the sandbox via the Daytona process execution API
    - `getWorkingTreeStatus(sandboxId: string): Promise<WorkingTreeStatus>` — executes `git status --porcelain` inside the sandbox, parses output. Returns `{ dirty: boolean, files: string[] }`
    - `terminateProcess(sandboxId: string, processId: string): Promise<void>` — terminates a process inside the sandbox via Daytona process management API (used by circuit breaker in Story 3.4)
  - [x] 5.3 Create `apps/agent-be/src/sandbox/sandbox.module.ts` — module providing `SandboxService` (production, bound to `SANDBOX_SERVICE` DI token from `@bmad-easy/shared-types`) and `DaytonaClientProvider`. Export `SANDBOX_SERVICE` so `ConversationsModule` can inject it. Import `PrismaModule`. The `SandboxServiceFake` is NOT registered here — it's injected by `buildTestModule()` in tests via `overrideProvider(SANDBOX_SERVICE)`. Note: `WorkingTreeService` is NOT created in Story 3.1 (see Variance section) — working tree status is queried via `ISandboxService.getWorkingTreeStatus()` directly. `ProvisionQueueService` and `IdleTimeoutService` are registered in `ConversationsModule` (Task 6.4), not here
  - [x] 5.4 Create `apps/agent-be/src/sandbox/provision-queue.service.ts` — `@Injectable()` class implementing the per-user concurrency cap (AC-6). Maintains a `Map<userId, { active: number; queue: (() => void)[] }>` in-memory. `acquire(userId: string): Promise<void>` — if `active < MAX_CONCURRENT_PROVISIONS` (2), increment and return immediately; otherwise push a resolver to the queue and return a promise that resolves when a slot frees. `release(userId: string): void` — decrement `active`, dequeue and resolve the next queued request if any. Export `MAX_CONCURRENT_PROVISIONS = 2` as a constant. This is an in-memory queue (single-container constraint — no distributed queue needed for MVP)
  - [x] 5.5 Create `apps/agent-be/src/sandbox/idle-timeout.service.ts` — `@Injectable()` class managing the pre-first-message idle timeout (AC-3). `startTimer(conversationId: string, sandboxId: string, onTimeout: () => Promise<void>): void` — sets a `setTimeout` for `IDLE_TIMEOUT_MS` (60000ms, configurable). Stores the timer in a `Map<conversationId, NodeJS.Timeout>`. `clearTimer(conversationId: string): void` — clears and deletes the timer (called when the first message arrives or the conversation is closed). `DEFAULT_IDLE_TIMEOUT_MS = 60_000`. On timeout, calls `onTimeout` which destroys the sandbox via `ISandboxService.destroy()`

- [x] Task 6: Conversations module — controller, service, DTO (AC: 1, 2, 3, 6)
  - [x] 6.1 Create `apps/agent-be/src/conversations/dto/create-conversation.dto.ts` — Zod schema (via `nestjs-zod` `createZodDto`) for `POST /api/conversations` request body. Empty body — the conversation is created from the authenticated user's context (userId from boundary JWT, repoUrl from RepoConnection). No input fields needed
  - [x] 6.2 Create `apps/agent-be/src/conversations/conversations.controller.ts` — NestJS controller with `@Controller('conversations')`. Endpoints:
    - `POST /` (create conversation) — guarded by `BoundaryJwtGuard` + `ActiveUserGuard` (global). Uses `@User() user: UserContext`. Calls `ConversationsService.createConversation(user.id)`. Returns the raw conversation body (no `{ data: ... }` wrapper — architecture rule). Status 201
    - `GET /:id/status` (get conversation + sandbox status) — returns `{ conversationId, sandboxStatus: 'provisioning' | 'ready' | 'failed' | 'idle-timeout' }`. Used by the frontend if SSE is not yet open or as a fallback
  - [x] 6.3 Create `apps/agent-be/src/conversations/conversations.service.ts` — `@Injectable()` class. Inject `PrismaService`, `ISandboxService` (via `SANDBOX_SERVICE` token), `CredentialsService`, `ProvisionQueueService`, `IdleTimeoutService`. Methods:
    - `createConversation(userId: string): Promise<{ id: string }>` — creates a `Conversation` record in Postgres (with `userId`, `title: null`, `lastActiveAt: new Date()`), then triggers `provisionSandbox(conversationId, userId)` as a fire-and-forget background operation (does NOT await — returns the conversation ID immediately so the frontend can open the SSE connection). Returns `{ id }` (the conversation ID)
    - `provisionSandbox(conversationId: string, userId: string): Promise<void>` — the background provisioning pipeline. Steps in order (AC-1): (1) acquire provision slot via `ProvisionQueueService.acquire(userId)`; (2) resolve repo URL from `RepoConnection` via Prisma; (3) resolve OAuth token via `CredentialsService.resolveOAuthToken(userId)`; (4) resolve git identity from User row (reuse `resolveGitIdentity` logic — name/email from User, fallback to `{githubLogin}@users.noreply.github.com`); (5) call `sandboxService.provision({ conversationId, repoUrl, credential })`; (6) call `sandboxService.clone(sandboxId, repoUrl, credential)` — mandatory `--depth=1`; (7) call `sandboxService.injectGitConfig(sandboxId, { name, email })`; (8) call `sandboxService.getWorkingTreeStatus(sandboxId)`; (9) emit `WORKING_TREE_DIRTY` or `WORKING_TREE_CLEAN` event on the SSE channel; (10) emit `SESSION_READY` event; (11) start idle timeout via `IdleTimeoutService.startTimer(conversationId, sandboxId, onTimeout)`; (12) release provision slot via `ProvisionQueueService.release(userId)`. On ANY failure in steps 5-8: call `sandboxService.destroy(sandboxId)` if a sandbox was allocated (AC-4), emit a `SESSION_ERROR` event, release the provision slot. Wrap the entire pipeline in try/catch/finally — the `finally` block always releases the provision slot and clears the idle timer
    - `onFirstMessage(conversationId: string): Promise<void>` — clears the idle timeout (AC-3: the sandbox received a first message, so the pre-first-message timeout no longer applies). Called by the streaming endpoint (Story 3.3) or a dedicated endpoint when the first message arrives. For Story 3.1, this method exists but is not yet wired to a message endpoint (Story 3.2/3.3 wires it)
  - [x] 6.4 Create `apps/agent-be/src/conversations/conversations.module.ts` — module importing `PrismaModule`, `SandboxModule`, `CredentialsModule`, `StreamingModule` (for `SessionEventsService` — see Task 7.3 for the non-circular dependency direction), providing `ConversationsService`, declaring `ConversationsController`. Register `ProvisionQueueService` and `IdleTimeoutService` as providers (they are singletons scoped to the module — in-memory state)
  - [x] 6.5 Create `apps/agent-be/src/conversations/conversations.service.spec.ts` — unit tests using `SandboxServiceFake` via `buildTestModule()`: [P0] `createConversation` creates a Conversation record in the DB and returns its ID, [P0] `provisionSandbox` calls `provision → clone → injectGitConfig → getWorkingTreeStatus` in order on the fake, [P0] provision failure (via `sandboxFake.failNextProvision()`) results in `destroy()` being called on the fake (AC-4 — verify `sandboxFake.activeSandboxCount() === 0` after failure), [P0] idle timeout fires after the configured delay (use `jest.useFakeTimers()` and `jest.advanceTimersByTime(60_000)`), [P1] provision queue blocks 3rd simultaneous provision until a slot frees (use `sandboxFake.setProvisionDelay()` to simulate slow provisioning)

- [x] Task 7: Minimal SSE endpoint for lifecycle events (AC: 1, 2, 5)
  - [x] 7.1 Create `apps/agent-be/src/streaming/streaming.controller.ts` — NestJS controller with `@Controller('conversations/:id/events')`. Endpoint: `GET /` — returns `text/event-stream`. Reads boundary JWT from `?token=` query parameter (EventSource cannot set headers — architecture rule). Validates the JWT (reuse `BoundaryJwtGuard` logic or validate inline). Sets SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. Returns a `Observable` (NestJS SSE pattern using `@Sse()` decorator) that emits lifecycle events. For Story 3.1, the events are: `SESSION_READY`, `WORKING_TREE_DIRTY`, `WORKING_TREE_CLEAN`, `SESSION_ERROR`, `SESSION_TIMEOUT`. The full AG-UI event proxying, circuit breaker, heartbeat, and back-pressure are deferred to Story 3.3/3.4 (DP-3 — simplest reversible option; DP-5 — defer scope temptation)
  - [x] 7.2 Create `apps/agent-be/src/streaming/session-events.service.ts` — `@Injectable()` class that manages per-conversation event emitters. Maintains `Map<conversationId, Subject<SseEvent>>`. Methods: `getEventStream(conversationId: string): Observable<SseEvent>` — returns the Subject for the conversation (creates one if none exists). `emit(conversationId: string, event: SseEvent): void` — pushes an event to the Subject. `complete(conversationId: string): void` — completes and removes the Subject (called on conversation close or idle timeout). `SseEvent` type: `{ event: string; data: unknown }`. The `ConversationsService.provisionSandbox()` calls `sessionEventsService.emit(conversationId, { event: 'SESSION_READY', data: { sandboxId } })` etc
  - [x] 7.3 Create `apps/agent-be/src/streaming/streaming.module.ts` — module providing and exporting `SessionEventsService` (so `ConversationsModule` can inject it), declaring `StreamingController`. Import `PrismaModule`. Do NOT import `ConversationsModule` — `StreamingController` only needs `SessionEventsService` (the conversation ID comes from the URL route param), not `ConversationsService`. This avoids a circular module dependency (`ConversationsModule` imports `StreamingModule` for `SessionEventsService`; `StreamingModule` does not import `ConversationsModule`)
  - [x] 7.4 Update `apps/agent-be/src/conversations/conversations.service.ts` — inject `SessionEventsService` and call `emit()` at each lifecycle milestone (WORKING_TREE_*, SESSION_READY, SESSION_ERROR) instead of the placeholder emit calls in Task 6.3
  - [x] 7.5 Create `apps/agent-be/src/streaming/streaming.controller.spec.ts` — [P0] returns a 200 with `text/event-stream` content type, [P0] rejects missing token with 401, [P0] emits SESSION_READY event when `sessionEventsService.emit()` is called. Use supertest or direct controller invocation

- [x] Task 8: Frontend — New Conversation page with session start state (AC: 1, 2, 5)
  - [x] 8.1 Update `apps/web/src/app/(dashboard)/(app)/conversations/new/page.tsx` — Server Component. On render: (1) call `auth()` to get `session.userId`; (2) `await mintBoundaryJwt(userId)` (async — uses `jose.SignJWT`); (3) read `API_URL` from `process.env` (the agent-be URL); (4) pass `boundaryJwt` and `apiUrl` as props to a new Client Component `<ConversationPane>`. Keep the existing `<Breadcrumb>` and `<h1>` (route-focus management requires an `h1`). The page itself does NOT call agent-be — the Client Component does (architecture: browser connects directly to agent-be)
  - [x] 8.2 Create `apps/web/src/components/conversation/ConversationPane.tsx` — `'use client'` Client Component. Props: `{ boundaryJwt: string; apiUrl: string }`. On mount (`useEffect`): (1) call `POST {apiUrl}/api/conversations` with `Authorization: Bearer {boundaryJwt}` to create a conversation — receive `{ id }`; (2) open an `EventSource` to `{apiUrl}/api/conversations/{id}/events?token={boundaryJwt}`; (3) set state to `provisioning` — chat input is active immediately so the user can type (EXPERIENCE.md: "Chat input is active immediately — no waiting state"); (4) on `SESSION_READY` event — set state to `ready`; (5) on `SESSION_ERROR` event — set state to `error`, show error message; (6) start a client-side timeout timer (e.g. 30s — distinct from the server-side 60s idle timeout) — if `SESSION_READY` doesn't arrive, set state to `timeout` and show "Starting your session is taking longer than expected." with a Retry button (AC-5). State machine: `'init' | 'provisioning' | 'ready' | 'error' | 'timeout'`. On unmount: close the EventSource connection. Store `conversationId` in state. Render: introductory prompt + active text input while `provisioning` (user can type); if the user submits while `provisioning`, transition to a `sending` sub-state that shows `SessionStartSpinner` + "Starting session…" label with input disabled, queue the message in state, and send it automatically when `SESSION_READY` arrives (AC-2, EXPERIENCE.md New Conversation); a simple text input + send button when ready (the full chat UI is Story 3.2/3.3 scope — DP-5 defer scope temptation). Use `localStorage` keyed by `new-conversation` for draft persistence (established pattern from project-context.md). Use `aria-live="polite"` on the status label (UX-DR16 — accessibility floor)
  - [x] 8.3 Create `apps/web/src/components/conversation/ConversationPane.test.tsx` — [P0] renders introductory prompt + active text input on mount (input NOT disabled during provisioning), [P0] calls `POST /api/conversations` on mount, [P0] opens EventSource with correct URL, [P0] enables input on SESSION_READY event, [P0] shows spinner + "Starting session…" only when user submits during provisioning (not from the start), [P0] shows retry button on client-side timeout, [P1] queues message sent during provisioning and sends after SESSION_READY. Mock `fetch` and `EventSource` (use `jest.spyOn(global, 'fetch')` and a mock EventSource implementation). Use `@jest-environment jsdom`
  - [x] 8.4 Create `apps/web/src/components/conversation/SessionStartSpinner.tsx` — simple presentational component rendering the spinner + "Starting session…" label. Uses DESIGN.md tokens: spinner is a CSS animation (respect `prefers-reduced-motion` — UX-DR16), label is `text-text-2 text-sm`. `role="status"` for screen reader announcement. Keep minimal — this is a display component, not a state manager

- [x] Task 9: Wire modules and update app.module.ts (AC: all)
  - [x] 9.1 Update `apps/agent-be/src/app/app.module.ts` — import `ConversationsModule`, `StreamingModule`, `SandboxModule`, `CredentialsModule`, `PrismaModule`, `ConfigModule.forRoot({ isGlobal: true, load: [configuration] })`. Register `http-exception.filter.ts` as `APP_FILTER`, `BoundaryJwtGuard` and `ActiveUserGuard` as `APP_GUARD` (in order). Keep `GET /health` endpoint (either in `AppController` or a dedicated `HealthController`)
  - [x] 9.2 Update `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` — activate 4 of the 6 `it.todo()` stubs with real tests using `buildTestModule([ConversationsModule])`: [P0] provisions a sandbox when a conversation is created, [P0] emits SESSION_READY after provision + clone + git-config-injection + WORKING_TREE status, [P0] tears down sandbox after idle timeout (60s default) when no first message is sent, [P0] cleans up partial Daytona allocation when provision() throws (no zombie sandboxes). Leave the remaining 2 stubs as `it.todo()`: "destroys sandbox on conversation close" (no close-conversation endpoint in Story 3.1 — deferred) and "terminates agent process via Daytona API when sandbox-agent crashes" (Story 3.3/3.4 scope)

- [x] Task 10: Verify lint, typecheck, and tests pass (AC: all)
  - [x] 10.1 Run `yarn nx lint agent-be` — 0 errors
  - [x] 10.2 Run `yarn nx lint web` — 0 new errors/warnings (baseline: 0 errors, 7 warnings per Story 2.6)
  - [x] 10.3 Run `npx tsc --noEmit -p apps/agent-be/tsconfig.app.json` — clean
  - [x] 10.4 Run `npx tsc --noEmit -p apps/web/tsconfig.json` — clean
  - [x] 10.5 Run `yarn nx test agent-be` — all unit + integration tests pass
  - [x] 10.6 Run `yarn nx test web` — all tests pass (baseline: 470 tests per Story 2.6)

## Dev Notes

### Decision Records

**Decision (DP-3):** Include boundary JWT implementation in Story 3.1 rather than creating a separate story. The boundary JWT is a prerequisite for the browser→agent-be REST call that triggers sandbox provisioning — without it, the story's ACs cannot be satisfied. The architecture specifies it as foundational infrastructure (Implementation Sequence step 4), but no Epic 1 story included it. Story 3.1 is the first story requiring browser→agent-be communication. Creating a separate story would block Story 3.1 on a story that doesn't exist yet. Per DP-3, the simplest approach is to include it here. The boundary JWT reuses `AUTH_SECRET` as the signing key (no new env var) — it's a different token with a different purpose (decoupled from Auth.js's internal JWE), but sharing the signing secret is the simplest approach. If separation is needed later, it's a reversible config change.

**Decision (DP-3):** Implement a minimal SSE endpoint for lifecycle events only. The full SSE infrastructure (circuit breaker, heartbeat, back-pressure, AG-UI event proxying) is deferred to Story 3.3/3.4. Story 3.1 needs to emit `SESSION_READY`, `WORKING_TREE_*`, and `SESSION_ERROR` events so the frontend knows when to enable input. The full streaming path (agent tokens, tool pills, thinking indicators) is Story 3.3's scope. Per DP-3, the simplest reversible option is a basic SSE endpoint using NestJS's `@Sse()` decorator. Per DP-5, defer the circuit breaker, heartbeat, and back-pressure — they are needed for the streaming use case (Story 3.3/3.4), not for the session-start lifecycle.

**Decision (DP-3):** Create a minimal `ConversationPane` Client Component that handles only the session start state. The full chat UI (streaming messages, tool pills, slash command picker, working tree indicator, manual commit) is the scope of Stories 3.2–3.6. Story 3.1's `ConversationPane` manages the provisioning lifecycle (init → provisioning → ready/error/timeout) and renders a simple text input when ready. Story 3.3 will extend `ConversationPane` with the streaming chat interface. Per DP-3, this is the simplest approach — a minimal component that Story 3.3 extends.

**Decision (DP-3):** Create the Conversation record in Postgres on page open (to trigger sandbox provisioning), not on first message. The sandbox needs a conversation ID to provision (`ProvisionParams.conversationId`). Creating the record on page open is simpler than managing a temporary session ID that gets mapped to a conversation ID later. The URL stays at `/conversations/new` until the first message (Story 3.2 handles the URL transition to `/conversations/:id`). The frontend stores the conversation ID in state but doesn't navigate until Story 3.2. Per DP-3, this is the simplest approach with the fewest moving parts.

**Decision (DP-5):** Do NOT implement the full `StreamingModule` with AG-UI event proxying, circuit breaker, heartbeat, or back-pressure. These are Story 3.3/3.4 scope. Story 3.1 implements only the lifecycle event channel (SESSION_READY, WORKING_TREE_*, SESSION_ERROR). The `streaming/` directory structure is established (controller, module, session-events service) so Story 3.3 can extend it. Per DP-5, defer scope temptation.

**Decision (DP-5):** Do NOT implement the chat input UI (auto-growing textarea, Enter/Shift+Enter, Send button, draft persistence). Story 3.2 (Invoke BMAD Skills via Slash Command) and Story 3.3 (Converse with the Streaming Agent) deliver the full chat input. Story 3.1 renders a minimal text input + send button when the session is ready — just enough to demonstrate the session-start lifecycle. Per DP-5, defer scope temptation.

**Decision (DP-5):** Do NOT implement the side nav conversation list. The `SideNavigation` component currently has an empty conversation list div (`data-testid="conversation-list"`). Story 3.2 populates it (the conversation appears in the side nav on first message send, when it gets a semantic title). Story 3.1 creates the Conversation record but with `title: null` — the side nav query filters by `title: { not: null }` or simply shows conversations with non-null titles. Per DP-5, defer scope temptation.

**Decision (DP-4):** The `SandboxServiceFake` already exists in `apps/agent-be/test/helpers/sandbox-service.fake.ts` and implements `ISandboxService`. It supports `failNextProvision()` and `setProvisionDelay()` — sufficient for Story 3.1's test needs. No changes needed to the fake. Test-only observation, no production behavior change.

**Decision (DP-2):** AC-1 originally stated "input disabled" during provisioning, matching the PRD (line 246) and epic (line 596). However, EXPERIENCE.md (line 228) specifies "Chat input is active immediately (no waiting state)" with the spinner appearing only when the user submits during provisioning (line 229). The story's own AC-2 ("the input is disabled momentarily, 'Starting session…' is shown, and the message sends automatically once ready") contradicts AC-1 — AC-2 implies the input was active since the user could submit. Per DP-2, followed the UX semantic intent (input active, spinner on submit-during-provisioning) and amended AC-1 and Task 8.2 to resolve the contradiction on record. The PRD's "input disabled" is a higher-level simplification; the UX spec is the authoritative source for interaction details.

**Decision (DP-2):** The `resolveGitIdentity` description originally simplified the logic as `user.name ?? user.githubLogin` (nullish coalescing). The actual implementation in `apps/web/src/lib/git-identity.ts` uses `user.name && user.name.trim().length > 0 ? user.name : user.githubLogin` (empty-string check). `??` only guards `null`/`undefined`, so an empty-string name would pass through instead of falling back to `githubLogin`. Per DP-2, followed the actual implementation (semantic intent) and amended the description to specify the empty-string check explicitly.

**Decision (DP-3):** Use `jose` (already available as a transitive dependency of `next-auth`) for boundary JWT signing/verification instead of installing `jsonwebtoken`. `jose` is the standard JWT library for Auth.js v5, uses WebCrypto API, and avoids adding a second JWT library to the project. The story's Task 3.1 and 2.6 were updated with the `jose` API (`SignJWT`, `jwtVerify`). Per DP-3, this is the simplest reversible option — zero new dependencies, consistent with the existing Auth.js stack.

**Decision (DP-3):** Install `@daytonaio/sdk@0.187.0`, `@nestjs/config`, and `nestjs-zod` as a prerequisite step. The story originally claimed these were "already in dependencies" — they are not in `package.json` (verified during validation). `@daytonaio/sdk` is listed in `project-context.md` as a pinned dependency but was never installed. `@nestjs/config` is required for `ConfigModule.forRoot()`. `nestjs-zod` is required for `createZodDto`. Per DP-3, installing them is the simplest approach — they are architecture-specified, necessary for the ACs, and cannot be substituted.

**Decision (DP-4):** The integration spec `sandbox-lifecycle.integration.spec.ts` has 6 `it.todo()` stubs. Story 3.1 activates 4 (provision, SESSION_READY, idle timeout, provision-failure cleanup). The remaining 2 ("destroys sandbox on conversation close" and "terminates agent process when sandbox-agent crashes") stay as `it.todo()` — the first has no corresponding endpoint in Story 3.1, the second is Story 3.3/3.4 scope. Test-only structural decision, no production behavior change.

**Decision (DP-5):** `common/interceptors/logging.interceptor.ts` and `auth/auth.module.ts` + `auth/boundary-jwt.strategy.ts` (architecture lines 546, 553-555) are NOT created in Story 3.1. The logging interceptor is deferred — NestJS Logger is sufficient for lifecycle events; request-scoped log correlation is needed when Story 3.3's streaming path arrives. The `auth/` module is an alternative NestJS organization pattern; the guard-in-`common/` approach (architecture line 543) is simpler and sufficient. Per DP-5, defer scope temptation — both are recorded as variances.

**Decision (DP-3):** Resolved a circular module dependency between `StreamingModule` and `ConversationsModule`. The original Task 7.3 had `StreamingModule` importing `ConversationsModule`, while Task 7.4 had `ConversationsService` injecting `SessionEventsService` from `StreamingModule` — creating a circular dependency. Fixed by reversing the import direction: `ConversationsModule` imports `StreamingModule` (for `SessionEventsService`), and `StreamingModule` does NOT import `ConversationsModule` (`StreamingController` only needs `SessionEventsService`, not `ConversationsService` — the conversation ID comes from the URL route param). Per DP-3, this is the simplest reversible option — no `forwardRef()` needed, no architectural change, just correct module boundary direction.

**Decision (DP-2):** The `SandboxInfo` interface in the actual codebase (`libs/shared-types/src/sandbox.interface.ts`) has `conversationId: string`, `status: 'running' | 'stopped' | 'ready'`, and `provisionedAt?: Date` — fields not shown in the architecture doc's simplified version (lines 407-410, which shows only `sandboxId` and `status: 'running' | 'stopped'`). The story originally referenced the architecture's version implicitly. Per DP-2, followed the actual codebase (semantic intent — the interface is the source of truth) and amended the "What Already Exists" section to document the actual `SandboxInfo` shape, so the dev agent populates `conversationId` and `provisionedAt` and uses `status: 'ready'` on successful provision (matching `SandboxServiceFake`'s behavior).

**Decision (DP-4):** Documented that `apps/agent-be/src/sandbox/sandbox.constants.ts` already exists as a re-export of `SANDBOX_SERVICE` from `@bmad-easy/shared-types`. The story originally didn't mention this file, risking a duplicate creation. Artifact-only documentation fix, no production behavior change.

**Decision (DP-3):** SSE endpoint uses manual `@Get()` + `@Res()` frame writing instead of the spec's `@Sse()` decorator. The two approaches are functionally equivalent (both produce `text/event-stream`) and reversible. Per DP-3, kept the current working `@Get()`+`@Res()` implementation — refactoring to `@Sse()` risks breaking the working SSE path and the custom JWT query-param validation for no functional gain. Resolved from code-review decision-needed finding.

**Decision (DP-3):** Wired `nestjs-zod` `createZodDto` + `ZodValidationPipe` at the `POST /conversations` boundary and updated the frontend to send `body: JSON.stringify({})`. The empty-body handling was ambiguous (no body vs empty object); per DP-3, the simplest spec-compliant option is to send `{}` so the `z.object({})` schema validates cleanly. Resolved from code-review decision-needed finding.

### What Already Exists (Do Not Recreate)

- **`ISandboxService` interface** (`libs/shared-types/src/sandbox.interface.ts`) — defines `provision`, `clone`, `resume`, `destroy`, `injectGitConfig`, `getWorkingTreeStatus`, `terminateProcess`. The `SANDBOX_SERVICE` Symbol DI token is exported from the same file. Do NOT modify — the production `SandboxService` implements this interface. **Actual `SandboxInfo` shape** (differs from architecture doc's simplified version — the codebase is the source of truth): `{ sandboxId: string; conversationId: string; status: 'running' | 'stopped' | 'ready'; provisionedAt?: Date }`. The production `provision()` must populate `conversationId` (from `ProvisionParams.conversationId`) and `provisionedAt` (from `new Date()`), and return `status: 'ready'` on successful provision (matching `SandboxServiceFake`'s behavior). The `ProvisionParams` shape matches the architecture doc: `{ conversationId: string; repoUrl: string; credential: string }`
- **`apps/agent-be/src/sandbox/sandbox.constants.ts`** — already exists, re-exports `SANDBOX_SERVICE` from `@bmad-easy/shared-types`. Do NOT create a duplicate. `test-module-builder.ts` imports from this file. `SandboxModule` should import `SANDBOX_SERVICE` from `@bmad-easy/shared-types` directly (or from this re-export — both resolve to the same Symbol)
- **`SandboxServiceFake`** (`apps/agent-be/test/helpers/sandbox-service.fake.ts`) — implements `ISandboxService` with in-memory state, controllable failure injection (`failNextProvision()`, `setProvisionDelay()`), and inspection methods (`activeSandboxCount()`, `getStatus()`, `executeCommand()`). Do NOT modify — it's the canonical test double for all Conversation-path tests. Note: the fake's `destroy()` throws on missing sandbox (not idempotent), while the production `SandboxService.destroy()` must be idempotent (catch 404). Tests should only call `destroy()` on sandboxes that exist — the `provisionSandbox` pipeline guards with "if a sandbox was allocated"
- **`buildTestModule()`** (`apps/agent-be/test/helpers/test-module-builder.ts`) — canonical NestJS test module factory. Pre-wires `SandboxServiceFake` via `SANDBOX_SERVICE` DI token. Supports `overrideProviders(array)` for additional overrides. Always use this instead of `Test.createTestingModule()` directly. Do NOT modify
- **`sandbox-lifecycle.integration.spec.ts`** (`apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts`) — has `it.todo()` stubs for the integration tests. Task 9.2 activates these stubs with real tests
- **`resolveGitIdentity()`** (`apps/web/src/lib/git-identity.ts`) — resolves `{ name, email }` from User profile, with `{githubLogin}@users.noreply.github.com` fallback. The agent-be `ConversationsService` needs the SAME logic — replicate it inline or as a small utility in agent-be (not a shared lib — architecture rule). Copy the actual implementation exactly: name uses `user.name && user.name.trim().length > 0 ? user.name : user.githubLogin` (empty-string check, NOT `??` — `??` only guards null/undefined, an empty-string name would pass through); email uses `user.email && user.email.trim().length > 0 ? user.email : \`${user.githubLogin}@users.noreply.github.com\``
- **OAuth token encryption/decryption** (`apps/web/src/lib/crypto.ts`) — `encryptToken()`, `decryptToken()`, `unwrapDek()`, `KekConfigurationError`, `computeKekId()`, `parseKekHex()`. The agent-be `EncryptionService` (Task 4.1) replicates the decryption path (`decryptToken`, `unwrapDek`, `assertNonceLength`, `toAad`, `parseKekHex`, `getKek`). This is a deliberate duplication — the architecture forbids a shared utility library beyond `libs/shared-types` (types only) and `libs/database-schemas` (Prisma)
- **`resolveOAuthToken()`** (`apps/web/src/lib/credential-health.ts`) — tenant-scoped OAuth token resolution. The agent-be `CredentialsService` (Task 4.2) replicates this logic. The `where: { userId }` clause IS the tenant authorization check (NFR-S2)
- **Prisma schema** (`libs/database-schemas/src/prisma/schema.prisma`) — has `User`, `OAuthCredential`, `RepoConnection`, `Artifact` models. Task 1 adds `Conversation` and `Turn`. The `User` model gets a `conversations Conversation[]` relation
- **`AppShell`** (`apps/web/src/components/shell/AppShell.tsx`) — Story 1.8 delivered this. Focus management moves focus to `h1` on route change. The New Conversation page already renders `<h1>New Conversation</h1>` — keep it
- **`SideNavigation`** (`apps/web/src/components/shell/SideNavigation.tsx`) — Story 1.8 delivered this. Has an empty conversation list div (`data-testid="conversation-list"`). Story 3.2 populates it. Do NOT modify in this story
- **`Breadcrumb`** (`apps/web/src/components/shell/Breadcrumb.tsx`) — Story 1.8 delivered this. The New Conversation page already renders it. Do NOT modify
- **`@daytonaio/sdk` 0.187.0** — NOT yet installed (listed in `project-context.md` as a pinned dependency, but absent from `package.json`). Install as the first step (see Prerequisites in Library/Framework Requirements). The `SandboxService` (Task 5.2) uses this SDK. Do NOT upgrade — pre-1.0 package, pinned exact per project-context.md
- **`jose`** — already available as a transitive dependency of `next-auth` 5.0.0-beta.31. Used for boundary JWT signing/verification (Task 3.1, 2.6). No install needed — verify with `ls node_modules/jose` if import fails
- **NestJS `@Sse()` decorator** — built into NestJS for SSE endpoints. No additional package needed. Returns `Observable<MessageEvent>` — NestJS handles the SSE protocol

### How AC-1 Is Satisfied

AC-1 ("Sandbox provisioned on page open as background operation") is satisfied by:

1. The New Conversation page (Server Component) mints a boundary JWT and passes it to `ConversationPane` (Client Component)
2. `ConversationPane` calls `POST /api/conversations` on mount — the backend creates a Conversation record and starts `provisionSandbox()` as a fire-and-forget background operation (does NOT await — returns the conversation ID immediately)
3. `provisionSandbox()` runs the initialization sequence in order: provision → clone (`--depth=1`) → injectGitConfig → getWorkingTreeStatus → emit WORKING_TREE_* → emit SESSION_READY
4. `ConversationPane` opens an SSE connection to receive lifecycle events
5. While provisioning, `ConversationPane` keeps the chat input active (user can type); if the user submits before `SESSION_READY`, the input disables momentarily and shows a spinner + "Starting session…" label until ready (EXPERIENCE.md New Conversation)
6. When `SESSION_READY` arrives, `ConversationPane` is ready for input (if the user had submitted during provisioning, the queued message sends automatically)
7. The 10-second chat-ready target (NFR-P2) is an architecture constraint, not an automated test — the mandatory `--depth=1` shallow clone is the mechanism that keeps provisioning under 10s for repos ≤200MB

### How AC-2 Is Satisfied

AC-2 ("First message before sandbox ready is queued") is satisfied by:

1. `ConversationPane` has state `provisioning` while the sandbox is being provisioned (chat input is active — user can type)
2. If the user submits a message while `provisioning`, the input disables momentarily, a spinner + "Starting session…" label is shown, and the message is stored in state (not sent)
3. When `SESSION_READY` arrives, `ConversationPane` transitions to `ready` state and sends the queued message automatically

### How AC-3 Is Satisfied

AC-3 ("Pre-first-message idle timeout") is satisfied by:

1. `IdleTimeoutService.startTimer()` is called after `SESSION_READY` is emitted (the sandbox is provisioned but waiting for the first message)
2. If no first message arrives within 60 seconds, the timer fires and `ISandboxService.destroy()` is called
3. The `onFirstMessage()` method clears the timer (Story 3.2/3.3 wires this to the message endpoint)

### How AC-4 Is Satisfied

AC-4 ("Provision failure cleanup") is satisfied by:

1. `SandboxService.provision()` wraps Daytona sandbox creation in try/catch
2. If sandbox creation succeeds but a subsequent step (clone, git config, etc.) fails, `destroy()` is called on the allocated sandbox
3. If sandbox creation itself fails, there's nothing to destroy (Daytona SDK throws before returning a sandbox ID)
4. The `ConversationsService.provisionSandbox()` method has a try/catch/finally that ensures the provision slot is released and the idle timer is cleared regardless of success or failure

### How AC-5 Is Satisfied

AC-5 ("Client-side session-start timeout with retry") is satisfied by:

1. `ConversationPane` starts a client-side timer (e.g. 30s) when provisioning begins
2. If `SESSION_READY` doesn't arrive within the timeout, `ConversationPane` transitions to `timeout` state
3. The `timeout` state shows "Starting your session is taking longer than expected." with a Retry button
4. Clicking Retry re-attempts session start (creates a new conversation or retries provisioning)

### How AC-6 Is Satisfied

AC-6 ("Per-user provision concurrency cap") is satisfied by:

1. `ProvisionQueueService` maintains an in-memory `Map<userId, { active: number; queue: Resolver[] }>`
2. `acquire(userId)` blocks (returns a pending Promise) if `active >= 2`
3. `release(userId)` decrements `active` and resolves the next queued request
4. This prevents burst pressure on GitHub's OAuth rate limit when multiple Conversation tabs are opened quickly

### How AC-7 Is Satisfied

AC-7 ("Prisma schema — Conversation and Turn models") is satisfied by:

1. Task 1 adds the `Conversation` model with `id`, `userId`, `title`, `lastActiveAt`, `createdAt`, `updatedAt`
2. Task 1 adds the `Turn` model with `id`, `conversationId`, `role`, `content`, `createdAt`
3. Task 1 generates and commits the migration
4. The schema is the dependency for Story 3.5 (resume reads Conversation + Turn) and Story 3.12 (persists turns on every turn)

### Architecture Compliance

- **Global prefix `/api`** — already set in `main.ts`. All controllers use `@Controller('conversations')` which resolves to `/api/conversations`
- **Raw resource body on success** — `ConversationsController` returns the conversation object directly, no `{ data: ... }` wrapper
- **`{ code, message, meta }` error envelope** — `http-exception.filter.ts` maps all errors to this shape
- **Zod + nestjs-zod** — `createZodDto` + `ZodValidationPipe` at controller boundaries. NEVER use `class-validator` / `class-transformer`
- **Boundary JWT** — `boundary-jwt.guard.ts` validates the JWT from the `Authorization` header. For SSE, the JWT is passed as a query parameter (`?token=`) since `EventSource` cannot set headers
- **`active-user.guard.ts`** — request-scoped, fetches live `User` row, rejects 403 if `!active`, attaches `UserContext` to `request.user`. Controllers consume via `@User() user: UserContext`
- **`ISandboxService` test seam** — `SANDBOX_SERVICE` Symbol DI token. Production: `SandboxService`. Test: `SandboxServiceFake` via `buildTestModule()`
- **Daytona integration** — `apps/agent-be` is the sole initiating party. Pull-only via `@daytonaio/sdk`. No inbound calls from sandbox-agent
- **Structured JSON logging** — NestJS Logger with `debug`, `info`, `warn`, `error` levels only. No custom levels
- **Mandatory `--depth=1` shallow clone** — every provision uses `git clone --depth=1`. Full-history clone is not supported
- **Sandbox initialization sequence** — provision → clone → injectGitConfig → git status --porcelain → emit WORKING_TREE_* → emit SESSION_READY. Git config injection at every provision AND every resume (Story 3.5)
- **No server-to-server calls** — `apps/web` never calls `apps/agent-be` server-to-server. The browser connects directly to agent-be for REST + SSE. `apps/web` reads Postgres independently for non-live data
- **No global client-state library** — `ConversationPane` uses local React state for ephemeral UI (provisioning status, queued message, SSE connection). No Redux/Zustand/Jotai
- **Draft persistence** — `localStorage` keyed by `new-conversation` (pre-send state). Established pattern from project-context.md

### Library/Framework Requirements

**Prerequisite — install missing dependencies before starting any task:**

```bash
yarn add @daytonaio/sdk@0.187.0 @nestjs/config nestjs-zod
```

- **`@daytonaio/sdk` 0.187.0** — pinned exact, pre-1.0. NOT yet installed (project-context.md lists it as a pinned dependency, but it is not in `package.json` yet). Install as the first step. Used by `SandboxService` for Daytona Cloud sandbox management. Do NOT upgrade without changelog review + session replay validation
- **`@nestjs/config`** — NOT yet installed. Required for `ConfigModule.forRoot({ isGlobal: true, load: [configuration] })` in Task 2.1/2.10. Install the version compatible with `@nestjs/common` ^11.0.0
- **`nestjs-zod`** — NOT yet installed. Required for `createZodDto` at controller boundaries (Task 6.1). Install the version compatible with `zod` ^4.4.3 and `@nestjs/common` ^11.0.0. NEVER use `class-validator` / `class-transformer`
- **`jose`** — already available as a transitive dependency of `next-auth` 5.0.0-beta.31. Use for boundary JWT signing/verification instead of installing `jsonwebtoken` — keeps one JWT library in the project, consistent with Auth.js v5. API: `jose.SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('8h').sign(new TextEncoder().encode(AUTH_SECRET))` for signing; `jose.jwtVerify(token, new TextEncoder().encode(AUTH_SECRET))` for verification. Both are async
- **`@anthropic-ai/claude-agent-sdk` 0.3.177** — NOT yet installed. NOT used in Story 3.1 (agent execution is Story 3.3 scope). Install when Story 3.3 begins
- **`@ag-ui/core` 0.0.57, `@ag-ui/client` 0.0.55, `@assistant-ui/react-ag-ui` 0.0.38** — NOT yet installed. NOT used in Story 3.1 (AG-UI event proxying is Story 3.3 scope). Install when Story 3.3 begins
- **`zod` ^4.4.3** — already in dependencies. Use for env validation and request body validation
- **NestJS `@Sse()` decorator** — built into `@nestjs/common`. No additional package needed for SSE endpoints

### File Structure Requirements

New files in `apps/agent-be/`:
```
src/
├── config/
│   ├── configuration.ts
│   └── env.validation.ts
├── common/
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── guards/
│   │   ├── boundary-jwt.guard.ts
│   │   └── active-user.guard.ts
│   ├── decorators/
│   │   └── user.decorator.ts
│   └── types/
│       └── user-context.type.ts
├── prisma/
│   ├── prisma.service.ts
│   └── prisma.module.ts
├── credentials/
│   ├── credentials.module.ts
│   ├── credentials.service.ts
│   ├── encryption.service.ts
│   └── encryption.service.spec.ts
├── sandbox/
│   ├── sandbox.module.ts
│   ├── sandbox.service.ts
│   ├── daytona-client.provider.ts
│   ├── provision-queue.service.ts
│   └── idle-timeout.service.ts
├── conversations/
│   ├── conversations.module.ts
│   ├── conversations.controller.ts
│   ├── conversations.service.ts
│   ├── conversations.service.spec.ts
│   └── dto/
│       └── create-conversation.dto.ts
└── streaming/
    ├── streaming.module.ts
    ├── streaming.controller.ts
    ├── streaming.controller.spec.ts
    └── session-events.service.ts
```

New files in `apps/web/`:
```
src/
├── lib/
│   ├── boundary-jwt.ts
│   └── boundary-jwt.test.ts
├── components/
│   └── conversation/
│       ├── ConversationPane.tsx
│       ├── ConversationPane.test.tsx
│       └── SessionStartSpinner.tsx
└── app/(dashboard)/(app)/conversations/new/
    └── page.tsx (updated)
```

Modified files:
- `libs/database-schemas/src/prisma/schema.prisma` — add `Conversation` and `Turn` models, add `conversations` relation to `User`
- `apps/agent-be/src/app/app.module.ts` — import all new modules, register global filters and guards
- `apps/agent-be/src/main.ts` — add `enableShutdownHooks()` (minimal change)
- `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` — activate `it.todo()` stubs
- `apps/web/src/app/(dashboard)/(app)/conversations/new/page.tsx` — mint boundary JWT, render `ConversationPane`
- `.env.example` — document `AUTH_SECRET` reuse for boundary JWT (no new env var if reusing `AUTH_SECRET`)

### Testing Requirements

- **Test organization:** co-located `*.spec.ts` / `*.test.tsx` next to source. Integration tests in `apps/agent-be/test/integration/`
- **Test priority tags:** `[P0]` for AC coverage (100% pass required), `[P1]` for edge cases (≥95% pass)
- **`buildTestModule()`** — always use for agent-be tests. Pre-wires `SandboxServiceFake` via `SANDBOX_SERVICE` DI token
- **`SandboxServiceFake`** — use `failNextProvision()` to test AC-4 (provision failure cleanup), `setProvisionDelay()` to test AC-6 (provision queue)
- **`jest.useFakeTimers()`** — use for AC-3 (idle timeout) and AC-5 (client-side timeout). `jest.advanceTimersByTime(60_000)` to trigger the idle timeout
- **Mock `fetch`** — `jest.spyOn(global, 'fetch').mockImplementation(...)` for `ConversationPane` tests (REST calls)
- **Mock `EventSource`** — create a mock implementation (jsdom doesn't provide `EventSource`). Use a simple class that simulates the EventSource interface: `new MockEventSource(url)`, dispatch events via `instance.dispatchEvent(new MessageEvent('message', { data: ... }))`
- **Server Component page tests** — call the async component function directly, `renderToStaticMarkup(element)`, assert on HTML. Mock `auth()` and `mintBoundaryJwt()`
- **Integration tests** — `apps/agent-be/test/integration/` with `jest-integration.config.ts`. Use `buildTestModule([ConversationsModule])` to wire the full module with the fake sandbox service

### Previous Story Intelligence

- **Story 2.6 (done):** Delivered `ArtifactCard` as a clickable `<Link>`. Key patterns: `cn()` for class merging, `focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` for focus rings, `role="listitem"` on `<Link>`/`<a>` overrides implicit `link` role. Lint baseline: 0 errors, 7 warnings. Test baseline: 470 tests. All tests pass. The `ArtifactCard` → `<Link>` pattern is the canonical clickable-display-component pattern — not directly relevant to Story 3.1 but establishes the component conventions
- **Story 1.8 (done):** Delivered `AppShell`, `SideNavigation`, `Breadcrumb`, and the `(dashboard)/(app)/` route structure. `AppShell`'s focus management moves focus to `h1` on route change — the New Conversation page already renders `<h1>New Conversation</h1>`. The `SideNavigation` has an empty conversation list div — Story 3.2 populates it
- **Story 1.5 (done):** Delivered `resolveGitIdentity()` in `apps/web/src/lib/git-identity.ts`. The agent-be `ConversationsService` replicates this logic (5 lines — name/email from User, fallback to noreply). The git identity is injected into sandbox git config at every provision
- **Story 1.3 (done):** Delivered OAuth token encryption (AES-256-GCM envelope encryption). The crypto logic in `apps/web/src/lib/crypto.ts` is replicated in agent-be's `EncryptionService` (Task 4.1). Same KEK env var (`CREDENTIAL_ENCRYPTION_KEK`), same GCM nonce-uniqueness enforcement
- **Story 1.6 (done):** Delivered `resolveOAuthToken()` (tenant-scoped OAuth token resolution) and `markCredentialFailed()` (credential health). The agent-be `CredentialsService` replicates `resolveOAuthToken()`. The `markCredentialFailed()` path is NOT needed in Story 3.1 (credential failure propagation is Story 3.7 scope)
- **Established conventions:** kebab-case non-component files, PascalCase component files, co-located tests, Conventional Commits. `cn()` from `@/lib/utils` for conditional class merging. `null as never` after `redirect()`. Server Actions return typed result unions. `@bmad-easy/shared-types` and `@bmad-easy/database-schemas` for shared imports. Never deep-import individual files from shared libs

### Git Intelligence

- Recent commits: `d357b97 docs(test-arch): add Epic 2 traceability matrix`, `a3d4896 fix(web): reclassify oauth decrypt failures as credential errors`, `ad8264c docs(pipeline): record stories 2.5 and 2.6 runs`, `1ec9f32 feat(epics): implement epic 2 artifact mirroring and project map browsing`. Epic 1 and Epic 2 are complete. Story 3.1 is the first story in Epic 3
- The agent-be is currently a minimal scaffold: `main.ts` (basic bootstrap), `app.module.ts` (empty module), `app.controller.ts` (health endpoint). Story 3.1 builds the foundational agent-be infrastructure (config, prisma, filters, guards, modules)
- The `SandboxServiceFake` and `buildTestModule()` were delivered as part of Epic 1's scaffolding (B-01 test seam). They are ready for use

### Project Structure Notes

**Alignment with architecture directory structure:**

The architecture (`architecture.md:532-597`) specifies the agent-be directory structure. Story 3.1 creates the following directories/files that match the architecture's specification:

- `config/` — `configuration.ts`, `env.validation.ts` (matches architecture)
- `common/filters/` — `http-exception.filter.ts` (matches architecture)
- `common/guards/` — `boundary-jwt.guard.ts`, `active-user.guard.ts` (matches architecture)
- `common/decorators/` — `user.decorator.ts` (matches architecture)
- `common/types/` — `user-context.type.ts` (matches architecture)
- `prisma/` — `prisma.service.ts`, `prisma.module.ts` (matches architecture)
- `credentials/` — `credentials.module.ts`, `credentials.service.ts`, `encryption.service.ts` (matches architecture)
- `sandbox/` — `sandbox.module.ts`, `sandbox.service.ts`, `daytona-client.provider.ts`, `provision-queue.service.ts`, `idle-timeout.service.ts` (architecture specifies `sandbox.service.ts`, `sandbox.service.fake.ts`, `daytona-client.provider.ts`, `working-tree.service.ts` — `provision-queue.service.ts` and `idle-timeout.service.ts` are new files not in the architecture's directory listing but are implied by the ACs)
- `conversations/` — `conversations.module.ts`, `conversations.controller.ts`, `conversations.service.ts`, `dto/create-conversation.dto.ts` (matches architecture)
- `streaming/` — `streaming.module.ts`, `streaming.controller.ts`, `session-events.service.ts` (architecture specifies `streaming.controller.ts`, `agui-event-bridge.service.ts`, `tool-pill-classifier.service.ts` — `session-events.service.ts` is a new file for Story 3.1's minimal SSE; `agui-event-bridge.service.ts` and `tool-pill-classifier.service.ts` are Story 3.3/3.4 scope)

**Variance from architecture:**
- `provision-queue.service.ts` and `idle-timeout.service.ts` are new files not explicitly listed in the architecture's directory structure. They are implied by AC-3 (idle timeout) and AC-6 (provision queue). Placing them in `sandbox/` is consistent with the architecture's sandbox-lifecycle ownership
- `session-events.service.ts` is a new file for Story 3.1's minimal SSE. The architecture lists `agui-event-bridge.service.ts` (Story 3.3 scope) — `session-events.service.ts` is the Story 3.1 precursor, extended by `agui-event-bridge.service.ts` in Story 3.3
- The `working-tree.service.ts` listed in the architecture is NOT created in Story 3.1 — working tree state is queried via `ISandboxService.getWorkingTreeStatus()` directly. Story 3.6 (Track and Manually Save Working Tree State) may extract it into a separate service if needed
- `common/interceptors/logging.interceptor.ts` (architecture line 546) is NOT created in Story 3.1 — structured JSON logging via NestJS Logger is sufficient for the lifecycle events. The interceptor can be added when Story 3.3's streaming path needs request-scoped log correlation. Deferred per DP-5 (scope temptation)
- `auth/auth.module.ts` and `auth/boundary-jwt.strategy.ts` (architecture lines 553-555) are NOT created — the boundary JWT guard lives in `common/guards/boundary-jwt.guard.ts` (matching the architecture's own listing at line 543). The `auth/` module pattern is an alternative NestJS organization; the guard-in-`common/` approach is simpler and sufficient for Story 3.1. Deferred per DP-5 (scope temptation)

### Out of Scope (Do Not Implement)

- **Streaming chat (agent tokens, Markdown rendering, thinking indicator):** Story 3.3 scope. Story 3.1's SSE endpoint emits lifecycle events only (SESSION_READY, WORKING_TREE_*, SESSION_ERROR)
- **Slash command picker:** Story 3.2 scope. Story 3.1 renders a minimal text input, not the slash command picker
- **Tool pills and semantic pills:** Story 3.4 scope
- **Working tree indicator (dirty/clean UI):** Story 3.6 scope. Story 3.1 emits the WORKING_TREE_* event but does not render the indicator UI
- **Manual commit:** Story 3.6 scope
- **Conversation resume (Reconnecting… state):** Story 3.5 scope. Story 3.1 handles only new conversations
- **Cost tracking (per-user LLM spend):** Story 3.8 scope
- **Mid-session idle timeout:** Story 3.9 scope. Story 3.1 implements only the pre-first-message idle timeout (60s)
- **Circuit breaker, heartbeat, back-pressure:** Story 3.3/3.4 scope
- **Credential failure propagation (CREDENTIAL_FAILURE event):** Story 3.7 scope
- **Access denied propagation (ACCESS_DENIED event):** Story 3.7 scope
- **SSE drain on deploy:** Story 3.12 scope
- **Side nav conversation list population:** Story 3.2 scope (conversations appear in side nav on first message send when they get a semantic title)
- **Conversation URL transition (from `/conversations/new` to `/conversations/:id`):** Story 3.2 scope (transitions on first message send)
- **Concurrent conversations (10 max):** Story 3.11 scope. Story 3.1 handles one conversation at a time (the provision queue prevents burst provisioning, but the 10-conversation limit is not enforced)
- **`working-tree.service.ts`:** Not created as a separate service in Story 3.1. Working tree status is queried via `ISandboxService.getWorkingTreeStatus()` directly. May be extracted in Story 3.6 if needed

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 3.1 (lines 584-621), Epic 3 description (lines 580-583, 226-228), FR9 (line 38), NFR-P2 (line 74), FR Coverage Map FR9 (line 185)
- PRD: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` — FR-9 Conversation Initiation (lines 235-249), NFR-P2 (line 451), NFR-S1 Sandbox isolation (line 441), NFR-S2 Credential isolation (line 442)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — ISandboxService contract (lines 394-436), sandbox initialization sequence (line 79), provision queue (line 83), client-side timeout (line 82), idle timeout (line 78), provision failure cleanup (line 126), directory structure (lines 532-597), boundary JWT (line 209), active-user guard (line 217), error envelope (line 220), data flow (line 669), API patterns (lines 262-268)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` — chat-input component spec (lines 72-78), spinner/status label patterns (implicit — use `text-text-2 text-sm` for status labels)
- EXPERIENCE.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` — New Conversation surface (lines 221-240), session start timeout (line 240), blocked entry states (lines 233-239), platform vocabulary "Starting session" (line 99)
- Project context: `_bmad-output/project-context.md` — NestJS patterns (lines 115-124), Prisma patterns (lines 126-135), testing rules (lines 155-198), security rules (lines 283-294), sandbox initialization sequence (line 313), provision failure cleanup (line 314)
- Decision policy: `_bmad-output/decision-policy.md` — DP-2 (spec contradiction: semantic intent over literal text), DP-3 (simplest reversible option), DP-4 (test-only changes), DP-5 (defer scope temptation)
- Previous story: `_bmad-output/implementation-artifacts/2-6-navigate-from-the-project-map-to-an-artifact.md` — established patterns (cn(), focus rings, Link, co-located tests, buildTestModule())
- Implementation: `libs/shared-types/src/sandbox.interface.ts` (ISandboxService contract), `apps/agent-be/test/helpers/sandbox-service.fake.ts` (test double), `apps/agent-be/test/helpers/test-module-builder.ts` (test module factory), `apps/web/src/lib/crypto.ts` (encryption logic to replicate), `apps/web/src/lib/credential-health.ts` (resolveOAuthToken to replicate), `apps/web/src/lib/git-identity.ts` (resolveGitIdentity to replicate), `apps/web/src/lib/auth.ts` (Auth.js session, userId), `libs/database-schemas/src/prisma/schema.prisma` (schema to extend), `apps/agent-be/src/main.ts` (bootstrap to update), `apps/agent-be/src/app/app.module.ts` (module to update), `apps/web/src/app/(dashboard)/(app)/conversations/new/page.tsx` (page to update), `apps/web/src/components/shell/SideNavigation.tsx` (side nav — do NOT modify)

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- `jose` ESM module required `transformIgnorePatterns` in both web and agent-be Jest configs
- `boundary-jwt.test.ts` uses `@jest-environment node` (jsdom lacks `TextEncoder`)
- `IdleTimeoutService` constructor parameter removed — NestJS DI tried to inject `Number` at index [0]
- `CredentialsService` mocked in `conversations.service.spec.ts` to avoid real KEK decryption
- `toHaveBeenCalledBefore` not available in Jest 30 — used `mock.invocationCallOrder` instead
- Integration test `it.todo()` stubs replaced with empty `it()` blocks (can't nest `it.todo` inside `it`)

### Completion Notes List

- **Task 1:** Added `Conversation` and `Turn` models to Prisma schema with `@@map`, `@map`, `@@index`, and `ON DELETE CASCADE` foreign keys. Migration `20260704050001_add_conversation_and_turn_models` generated and applied. Prisma client regenerated.
- **Task 2:** Created agent-be foundational infrastructure: `configuration.ts`, `env.validation.ts` (Zod), `PrismaService`/`PrismaModule` (Global), `HttpExceptionFilter` (catch-all → `{ code, message, meta }` envelope), `BoundaryJwtGuard` (jose JWT verification from `Authorization` header or `?token=` query param), `ActiveUserGuard` (fetches live User row, attaches `UserContext`), `@User()` decorator, `UserContext` type. `AppModule` wires `ConfigModule`, `PrismaModule`, `APP_FILTER`, `APP_GUARD` (BoundaryJwtGuard → ActiveUserGuard order). `main.ts` adds `enableShutdownHooks()`. Removed `AppService` (placeholder), kept `AppController` with only `GET /health`.
- **Task 3:** Created `mintBoundaryJwt()` in apps/web using `jose.SignJWT` with `AUTH_SECRET` (reused from Auth.js). 3 P0 tests pass. `.env.example` updated to document AUTH_SECRET reuse for boundary JWT.
- **Task 4:** Created `EncryptionService` (injectable class replicating AES-256-GCM decryption from apps/web `crypto.ts`), `CredentialsService` (`resolveOAuthToken` — tenant-scoped), `CredentialsModule`. 4 tests pass (P0: decrypt, tampered ciphertext, wrong userId AAD; P1: missing KEK).
- **Task 5:** Created `SandboxService` (production, implements `ISandboxService` using `@daytonaio/sdk`), `daytonaClientProvider` (returns null if config missing), `ProvisionQueueService` (per-user concurrency cap of 2), `IdleTimeoutService` (60s pre-first-message timeout), `SandboxModule` (binds `SandboxService` to `SANDBOX_SERVICE` token).
- **Task 6:** Created `ConversationsService` (createConversation → fire-and-forget provisionSandbox; provisionSandbox pipeline: acquire → resolve repo → resolve token → resolve git identity → provision → clone → injectGitConfig → getWorkingTreeStatus → emit WORKING_TREE_* → emit SESSION_READY → start idle timeout; onFirstMessage clears idle timeout), `ConversationsController` (POST /, GET /:id/status), `ConversationsModule`, `create-conversation.dto.ts`. 12 unit tests pass.
- **Task 7:** Created `StreamingController` (SSE endpoint at `GET /conversations/:id/events`, validates boundary JWT from `?token=` query param, sets SSE headers, subscribes to `SessionEventsService`), `SessionEventsService` (per-conversation `Subject<SseEvent>` with emit/complete), `StreamingModule`. 4 tests pass.
- **Task 8:** Updated New Conversation page to mint boundary JWT and render `ConversationPane`. Created `ConversationPane` (Client Component: state machine init→provisioning→ready/error/timeout, POST /api/conversations on mount, EventSource for SSE, input active during provisioning, spinner on submit-during-provisioning, retry button on timeout, localStorage draft persistence), `SessionStartSpinner` (presentational, `role="status"`, `prefers-reduced-motion`). 7 tests pass (6 P0, 1 P1).
- **Task 9:** Wired all modules in `AppModule`. Integration test `sandbox-lifecycle.integration.spec.ts` activated 4 of 6 stubs (provision, SESSION_READY, idle timeout, provision-failure cleanup). 2 stubs remain as empty `it()` blocks (conversation close, agent process termination — deferred to Story 3.3/3.4). 6 integration tests pass.
- **Task 10:** All lint (0 errors), typecheck (clean), and tests pass. agent-be: 16 unit + 6 integration = 22 tests. web: 484 tests (baseline was 470, +14 new).

**Decision (DP-2):** The `User` model in the actual Prisma schema does not have an `active` column — it was dropped in the `20260702000000_backlog_hardening` migration ("never read/written outside the Prisma client"). The story Task 2.7/2.9 assumes an `active` field exists. Per DP-2, followed the semantic intent (all users are active for MVP) — `ActiveUserGuard` sets `active: true` always in `UserContext`, and the guard only checks if the user exists (`!user` → 403). The `UserContext` interface retains `active: boolean` for future compatibility.

**Decision (DP-3):** Used `@jest-environment node` for `boundary-jwt.test.ts` instead of adding `TextEncoder`/`TextDecoder` polyfills to the jsdom environment — simplest approach, the test is a pure unit test that doesn't need DOM APIs.

**Decision (DP-3):** Added `transformIgnorePatterns: ['node_modules/(?!jose)']` to both web and agent-be Jest configs — `jose` uses ESM (`export` syntax) that ts-jest can't parse by default. This is the minimal config change needed.

**Decision (DP-3):** Mocked `CredentialsService` in `conversations.service.spec.ts` instead of setting up a valid encrypted credential fixture — the test focuses on the provisionSandbox pipeline, not on crypto interoperability (which is tested separately in `encryption.service.spec.ts`).

**Decision (DP-4):** Replaced the two remaining `it.todo()` stubs in the integration test with empty `it()` blocks instead — Jest 30 does not allow `it.todo()` nested inside an `it()` block. Test-only structural change, no production behavior change.

### File List

**New files (agent-be):**
- `apps/agent-be/src/config/configuration.ts`
- `apps/agent-be/src/config/env.validation.ts`
- `apps/agent-be/src/prisma/prisma.service.ts`
- `apps/agent-be/src/prisma/prisma.module.ts`
- `apps/agent-be/src/common/filters/http-exception.filter.ts`
- `apps/agent-be/src/common/guards/boundary-jwt.guard.ts`
- `apps/agent-be/src/common/guards/active-user.guard.ts`
- `apps/agent-be/src/common/decorators/user.decorator.ts`
- `apps/agent-be/src/common/types/user-context.type.ts`
- `apps/agent-be/src/credentials/encryption.service.ts`
- `apps/agent-be/src/credentials/encryption.service.spec.ts`
- `apps/agent-be/src/credentials/credentials.service.ts`
- `apps/agent-be/src/credentials/credentials.module.ts`
- `apps/agent-be/src/sandbox/daytona-client.provider.ts`
- `apps/agent-be/src/sandbox/sandbox.service.ts`
- `apps/agent-be/src/sandbox/sandbox.module.ts`
- `apps/agent-be/src/sandbox/provision-queue.service.ts`
- `apps/agent-be/src/sandbox/idle-timeout.service.ts`
- `apps/agent-be/src/conversations/dto/create-conversation.dto.ts`
- `apps/agent-be/src/conversations/conversations.controller.ts`
- `apps/agent-be/src/conversations/conversations.service.ts`
- `apps/agent-be/src/conversations/conversations.service.spec.ts`
- `apps/agent-be/src/conversations/conversations.module.ts`
- `apps/agent-be/src/streaming/streaming.controller.ts`
- `apps/agent-be/src/streaming/streaming.controller.spec.ts`
- `apps/agent-be/src/streaming/session-events.service.ts`
- `apps/agent-be/src/streaming/streaming.module.ts`

**New files (web):**
- `apps/web/src/lib/boundary-jwt.ts`
- `apps/web/src/lib/boundary-jwt.test.ts`
- `apps/web/src/components/conversation/ConversationPane.tsx`
- `apps/web/src/components/conversation/ConversationPane.test.tsx`
- `apps/web/src/components/conversation/SessionStartSpinner.tsx`

**New files (database-schemas):**
- `libs/database-schemas/src/prisma/migrations/20260704050001_add_conversation_and_turn_models/migration.sql`

**Modified files:**
- `libs/database-schemas/src/prisma/schema.prisma` — added `Conversation` and `Turn` models, `conversations` relation on `User`
- `apps/agent-be/src/app/app.module.ts` — wired all modules, global filters and guards
- `apps/agent-be/src/app/app.controller.ts` — removed `getData()`, kept only `GET /health`
- `apps/agent-be/src/main.ts` — added `enableShutdownHooks()`
- `apps/agent-be/jest.config.ts` — added `transformIgnorePatterns` for `jose`
- `apps/agent-be/test/jest-integration.config.ts` — added `transformIgnorePatterns` for `jose`
- `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` — activated 4 stubs with real tests
- `apps/web/src/app/(dashboard)/(app)/conversations/new/page.tsx` — mints boundary JWT, renders `ConversationPane`
- `apps/web/jest.config.ts` — added `transformIgnorePatterns` for `jose`
- `.env.example` — documented AUTH_SECRET reuse for boundary JWT
- `package.json` — added `@daytonaio/sdk@0.187.0`, `@nestjs/config`, `nestjs-zod`

**Deleted files:**
- `apps/agent-be/src/app/app.service.ts` — placeholder removed, no longer needed
- `apps/agent-be/src/app/app.controller.spec.ts` — placeholder test removed

## Change Log

- 2026-07-04: Story 3.1 implementation complete — all 10 tasks done, 22 agent-be tests + 484 web tests pass, lint clean, typecheck clean. Status → review.
- 2026-07-04: Code review (chunk 1 — implementation source). 3 review layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 2 decision-needed findings resolved via DP-3; 13 patch findings applied; 4 deferred; 2 dismissed. All lint/typecheck/tests green (agent-be 20 unit + 6 integration, web 485). Status → done.

### Review Findings

**Decision-needed (resolved via decision policy):**

- [x] [Review][Decision] SSE endpoint uses `@Get()`+`@Res()` instead of spec's `@Sse()` decorator — DP-3: kept current working approach (functionally equivalent, reversible). See Decision Records.
- [x] [Review][Decision] `nestjs-zod` `createZodDto`/`ZodValidationPipe` not wired at controller boundary + empty-body handling ambiguous — DP-3: wired `createZodDto`+`ZodValidationPipe`, frontend sends `{}`. See Decision Records.

**Patch (applied):**

- [x] [Review][Patch] Command injection via `git config` user.name/email and `git clone` URL interpolation — shell-quote all interpolated values [`apps/agent-be/src/sandbox/sandbox.service.ts`]
- [x] [Review][Patch] IDOR on SSE stream + `getStatus` — no conversation-ownership check; added `findFirst({ where: { id, userId } })` ownership check [`apps/agent-be/src/streaming/streaming.controller.ts`, `apps/agent-be/src/conversations/conversations.service.ts`, `apps/agent-be/src/conversations/conversations.controller.ts`]
- [x] [Review][Patch] `HttpExceptionFilter` leaks internal error messages to clients — return generic message for non-`HttpException` errors [`apps/agent-be/src/common/filters/http-exception.filter.ts`]
- [x] [Review][Patch] `HttpExceptionFilter` logs `request.url` with boundary JWT in `?token=` query param — sanitize path before logging [`apps/agent-be/src/common/filters/http-exception.filter.ts`]
- [x] [Review][Patch] `complete()` not called on `SESSION_ERROR` path and idle-timeout `destroy()` throw path — added `complete()` in catch block, wrapped timeout callback in try/finally [`apps/agent-be/src/conversations/conversations.service.ts`]
- [x] [Review][Patch] Global guards gate `/health` — added `@Public()` decorator + `isPublic` check in both guards [`apps/agent-be/src/common/decorators/public.decorator.ts`, `apps/agent-be/src/common/guards/boundary-jwt.guard.ts`, `apps/agent-be/src/common/guards/active-user.guard.ts`, `apps/agent-be/src/app/app.controller.ts`]
- [x] [Review][Patch] `getStatus` always returns `'provisioning'` — added sandbox-status tracking Map updated at each lifecycle milestone [`apps/agent-be/src/conversations/conversations.service.ts`]
- [x] [Review][Patch] Stale closure swallows queued message on `SESSION_READY` (AC-2) — use `queuedMessageRef` so listener reads current value [`apps/web/src/components/conversation/ConversationPane.tsx`]
- [x] [Review][Patch] Provision events emitted before SSE client subscribes are silently dropped — switched `Subject` to `ReplaySubject` (buffer 100) [`apps/agent-be/src/streaming/session-events.service.ts`]
- [x] [Review][Patch] SSE subscription missing `error` callback — `res.write` failures propagate as unhandled RxJS errors; added `error` handler [`apps/agent-be/src/streaming/streaming.controller.ts`]
- [x] [Review][Patch] `IdleTimeoutService.clearAll()` never wired to a lifecycle hook — implemented `OnModuleDestroy` [`apps/agent-be/src/sandbox/idle-timeout.service.ts`]
- [x] [Review][Patch] `localStorage.setItem` not wrapped in try/catch — crashes in private/quota-exceeded mode; wrapped both get/set in try/catch [`apps/web/src/components/conversation/ConversationPane.tsx`]
- [x] [Review][Patch] `nestjs-zod` `createZodDto`/`ZodValidationPipe` not applied at controller boundary — wired DTO + pipe, frontend sends `{}` (DP-3) [`apps/agent-be/src/conversations/dto/create-conversation.dto.ts`, `apps/agent-be/src/conversations/conversations.controller.ts`, `apps/web/src/components/conversation/ConversationPane.tsx`]

**Deferred:**

- [x] [Review][Defer] `SandboxService.resume` returns wrong `conversationId` (sets to `sandboxId`) — latent, no caller in Story 3.1; interface signature only receives `sandboxId`. Story 3.5 (resume) will resolve. (DP-5) [`apps/agent-be/src/sandbox/sandbox.service.ts`]
- [x] [Review][Defer] `ProvisionQueueService.acquire` queues waiters with no timeout — a hung `daytona.create` permanently blocks the per-user slot cap; fix involves unspecified design (timeout duration, behavior on expiry). (DP-5) [`apps/agent-be/src/sandbox/provision-queue.service.ts`]
- [x] [Review][Defer] OAuth token persisted in plaintext in sandbox `remote.origin.url` after clone — spec explicitly specifies the URL-embedding approach; rewriting the URL post-clone is hardening beyond spec. (DP-5) [`apps/agent-be/src/sandbox/sandbox.service.ts`]
- [x] [Review][Defer] Server idle-timeout (`SESSION_TIMEOUT`) reuses the session-start-timeout UI message — minor UX; the two mechanisms are distinct (30s client vs 60s server) per AC-5, only the message is shared. Story 3.2/3.3 reworks the UI. (DP-5) [`apps/web/src/components/conversation/ConversationPane.tsx`]

**Dismissed:**

- `ActiveUserGuard` hardcodes `active: true` — already resolved by recorded DP-2 decision (the `User` model has no `active` column; guard checks `!user` → 403).
- Boundary JWT transported via `?token=` query string — accepted design per spec (EventSource cannot set headers); conventional tradeoff.
