---
project_name: 'bmad-easy'
user_name: 'Marius'
date: '2026-07-02'
sections_completed:
  [
    'technology_stack',
    'language_rules',
    'framework_rules',
    'testing_rules',
    'code_quality_rules',
    'workflow_rules',
    'critical_rules',
  ]
status: 'complete'
rule_count: 101
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Core Stack

- **Monorepo:** Nx 23.0.0 + Yarn Berry 4.17.0 (via Corepack, pinned in `packageManager`)
- **Language:** TypeScript ~5.9.2 — `strict`, `isolatedModules`, `noUnusedLocals`, `noImplicitReturns`, `noImplicitOverride`, target ES2022, `module: commonjs`, `moduleResolution: node`
- **apps/web:** Next.js ~16.1.6 (App Router, `src/` layout, Turbopack dev), React 19, `@/*` import alias
- **apps/agent-be:** NestJS ^11.0.0 (global prefix `/api`, `GET /health` excluded)
- **Database:** PostgreSQL + Prisma ^7.8.0 (single shared schema in `libs/database-schemas`, `@prisma/adapter-pg` driver adapter)
- **Validation:** Zod ^4.4.3 in both services; `nestjs-zod` in agent-be
- **Frontend UI:** Tailwind CSS 3.4.19 + shadcn/ui (new-york style, `rsc: true`); custom dark-first design tokens in `tailwind.config.ts`
- **Auth:** Auth.js v5 (`next-auth` 5.0.0-beta.31) — GitHub OAuth, JWT session, 8h maxAge
- **Testing:** Jest ~30.3.0 (unit/integration, co-located), Playwright ^1.61.0 (E2E in `playwright/` dir)
- **Lint/Format:** ESLint ^9 (flat config), Prettier ^3.8.1 (`singleQuote: true`)

### Pinned-Exact Dependencies (pre-1.0 — never use `^` or `~`)

- `@ag-ui/core` 0.0.57, `@ag-ui/client` 0.0.55, `@assistant-ui/react-ag-ui` 0.0.38
- `@anthropic-ai/claude-agent-sdk` 0.3.177, `@daytonaio/sdk` 0.187.0
- `next-auth` 5.0.0-beta.31 (beta — review changelog before any Next.js upgrade)

### Version-Upgrade Discipline

- Pre-1.0 packages: pin exact, review changelog for breaking interface/enum changes, validate against recorded session replay before upgrading. Upgrade only when a specific fix/capability drives it.
- Prisma: trusted foundational dependency, no defensive abstraction. Same pinned-version discipline.
- Auth.js v5 beta: monitor changelog before Next.js upgrades — a security patch could force an incompatible bump.

---

## Critical Implementation Rules

### Language-Specific Rules

#### TypeScript Configuration

- `strict: true` is mandatory — never relax it with `any` or `@ts-ignore`. Use `unknown` and narrow with type guards.
- `isolatedModules` is on — every file must be independently transpilable. Use `export type` / `import type` for type-only exports/imports.
- `noUnusedLocals` — no unused variables. Prefix with `_` if intentionally unused (e.g. `_repoUrl`, `_config` in `SandboxServiceFake`).
- Target ES2022 — use native `Array.at()`, `Object.hasOwn()`, `structuredClone()`, top-level await (in modules). Do not polyfill what the target already supports.
- `module: commonjs` + `moduleResolution: node` — use `@/*` path alias in `apps/web` (resolves to `src/*`); use `@bmad-easy/shared-types` and `@bmad-easy/database-schemas` for shared lib imports. Never use relative paths that cross app/lib boundaries.

#### Import/Export Conventions

- Server Actions: start file with `'use server';` directive (see `apps/web/src/actions/*.actions.ts`).
- Client components: start file with `'use client';` directive. Server Components are the default — no directive needed.
- Shared types: barrel-exported from `libs/shared-types/src/index.ts`. Import from `@bmad-easy/shared-types`, never deep-import individual files.
- Prisma client: import from `@bmad-easy/database-schemas`, never from `@prisma/client` directly.

#### Async/Error Handling

- Server Actions return typed result unions (`{ success: true } | { error: string; errorCode: string }`), never throw to the client. Catch all errors and return the error shape.
- `apps/agent-be`: a global NestJS exception filter maps every thrown error (including Zod validation failures) to the `{ code, message, meta }` JSON envelope. Controllers throw; the filter catches.
- `apps/web` Server Actions: validation failures surface as field/form errors, NOT the agent-be error envelope — different layer, different consumer.
- GitHub API calls: always set `AbortSignal.timeout(10_000)` and handle 401/403/404 explicitly with per-cause error codes (see `repo-connection.actions.ts` for the canonical pattern).
- 403 responses must be classified: rate limit (primary/secondary), org restriction, or permission denial. Never use a generic "couldn't connect" message.

### Framework-Specific Rules

#### Next.js (apps/web)

- **App Router only.** `src/app/` layout. Route groups with parentheses for layout scoping: `(dashboard)/`.
- **Server Components are default.** Add `'use client'` only when the component needs browser APIs, state, or event handlers.
- **Server Actions** (`src/actions/*.actions.ts`) own all synchronous data operations: repository connection, BMAD validation, git identity, credential health. These read/write Postgres directly via Prisma — no intermediate service hop.
- **`apps/web` never calls `apps/agent-be` server-to-server.** The browser connects directly to agent-be for live REST+SSE. `apps/web` reads Postgres independently for non-live data (Conversation history, Project Map, Artifact Browser).
- **No global client-state library** (no Redux, Zustand, Jotai). Server Components/Server Actions handle server data; local React state for ephemeral UI only (Tool Pill expansion, draft text, optimistic echo).
- **No React Query / SWR.** Plain Server Component Prisma reads for data fetching.
- **No automatic client-side revalidation anywhere.** Manual browser reload picks up fresh server-rendered state. This is deliberate — eliminates SSE-rendered vs Postgres-backed view disagreement.
- **Draft message persistence:** browser `localStorage`, keyed by `conversationId`, no server round-trip.
- `middleware.ts` uses `NextAuth(authConfig).auth` — the matcher excludes `/sign-in`, `/api/auth`, `/api/internal/test`, and Next.js static assets.
- `next.config.js`: `serverExternalPackages: ['pg', '@prisma/adapter-pg']` — required for Prisma driver adapter. Turbopack root set to monorepo root for hoisted `next`.
- Test-only internal API routes live under `app/api/internal/test/*` and are guarded by `assertTestEnvNotInProduction()` at startup + per-request `NODE_ENV`/`TEST_ENV` checks.
- **`assertTestEnvNotInProduction()` runs from `instrumentation.ts`** (`register()` hook) at server startup — a misconfigured production deploy with `TEST_ENV` set fails loudly at boot, not silently after exposing test endpoints.
- **`null as never` after `redirect()`:** Server Components that call `redirect()` must `return null as never;` immediately after — `redirect()` throws internally but TypeScript doesn't know that, so the return type must be satisfied. Codebase-wide pattern (see `page.tsx`, `onboarding/page.tsx`).
- **`useFormStatus()` for Server Action form buttons:** submit buttons in Server Action forms use `useFormStatus()` from `react-dom` (not local React state) to track pending state. The button must be a separate `'use client'` component (see `sign-in/submit-button.tsx`). Inline Server Actions can be defined directly in a form's `action` prop with an `async () => { 'use server'; ... }` function for simple cases that don't need export.
- **Conditional app shell (onboarding-gated):** the `(dashboard)/layout.tsx` is an auth-only guard that renders bare `<>{children}</>` for authenticated users. Repo-connection-required pages (`/project-map`, `/artifacts`, `/conversations`, `/settings`) live under a nested `(dashboard)/(app)/` route group whose `layout.tsx` guards on `RepoConnection`: no connection → redirect to `/onboarding`, connection exists → render `<AppShell>`. `/onboarding` stays under `(dashboard)/` directly (outside the `(app)/` guard) so it renders without a redirect loop. New repo-connection-required pages go under `(app)/`; new non-guarded pages go directly under `(dashboard)/`.
- **Route-focus management:** `AppShell` moves focus to `h1` on every route change (sets `tabindex="-1"` dynamically, `focus({ preventScroll: true })`). If no `h1` exists at effect time (e.g. behind a Suspense boundary), focus lands on the first interactive element and a `MutationObserver` keeps watching for a late-mounting `h1`. New pages must render an `<h1>` for this to work.

#### NestJS (apps/agent-be)

- **Global prefix `/api`** — set in `main.ts`. `GET /health` is excluded (serves at root).
- **Module pattern:** feature-based modules (`conversations/`, `sandbox/`, `streaming/`, `manual-commit/`, `artifacts/`, `credentials/`, `auth/`, `users/`, `cost-tracking/`).
- **Validation:** `nestjs-zod` (`createZodDto` + `ZodValidationPipe`) at controller boundaries. NEVER use `class-validator` / `class-transformer`.
- **Error envelope:** every endpoint returns raw resource body on success (no `{ data: ... }` wrapper) and `{ code, message, meta }` on error.
- **Auth guards:** `boundary-jwt.guard.ts` validates the JWT and extracts `userId`; `active-user.guard.ts` (request-scoped) fetches the live `User` row from Postgres, rejects with 403 if `!active`, attaches to `request.user`. Controllers consume via `@User() user: UserContext` — never query `User` directly in controllers.
- **ISandboxService test seam:** `libs/shared-types/src/sandbox.interface.ts` defines the interface. `sandbox.service.ts` (production) and `sandbox.service.fake.ts` (test-only) both implement it. Injected via `SANDBOX_SERVICE` Symbol DI token. The fake supports controllable failure injection (`failNextProvision()`, `setProvisionDelay()`).
- **Daytona integration:** `apps/agent-be` is the sole initiating party toward Daytona. Pull-only via `@daytonaio/sdk`. No inbound calls from sandbox-agent.
- **Structured JSON logging** — `debug`, `info`, `warn`, `error` levels only. No custom levels.

#### Prisma / Database

- **Single shared schema** in `libs/database-schemas/src/prisma/schema.prisma`. Both apps generate their own client from this schema. Never create a second schema.
- **Prisma client access:** `apps/web` uses `getPrisma()` from `src/lib/prisma.ts` (singleton on `globalThis`). `apps/agent-be` uses its own `PrismaService`. Both import `PrismaClient` from `@bmad-easy/database-schemas`.
- **Migrations** run from `libs/database-schemas` against the shared Postgres instance.
- **No caching layer for database reads** for MVP. No React Query/SWR. Direct Prisma reads.
- **Bounded in-memory cache exception:** expensive external API calls (e.g. GitHub Contents API) may use a module-level `Map` cache with these guardrails: FIFO eviction at a max-entries cap (500), TTL expiry (120s), only successful results cached, and explicit invalidation hooks. Never cache database reads — only external API results.

#### shadcn/ui + Tailwind

- shadcn/ui configured as `new-york` style, `rsc: true`, `cssVariables: true`. Components live in `apps/web/src/components/ui/`.
- `cn()` helper in `apps/web/src/lib/utils.ts` (clsx + tailwind-merge) — always use for conditional class merging.
- Design tokens are custom dark-first colors defined in `tailwind.config.ts` (`bg`, `surface`, `surface-raised`, `border`, `text-1/2/3`, `accent`, `positive`, `caution`, `negative`). Use semantic token names, never raw hex values.
- Font: Inter (sans), JetBrains Mono (mono).

#### GitHub API Integration

- **Always set `AbortSignal.timeout(10_000)`** on every `fetch()` call to the GitHub API. No unbounded waits.
- **Always send `X-GitHub-Api-Version: 2022-11-28`** and `Accept: application/vnd.github+json` headers. Use the `githubHeaders()` helper in `repository-validation.ts` as the canonical pattern.
- **Directory-listing pagination:** GitHub silently truncates large directories. Follow the `Link` header's `rel="next"` until exhausted or capped (`MAX_CONTENT_PAGES = 10`, `MAX_CONTENT_ENTRIES = 10_000`). Never assume a single response is complete.
- **`RateLimitError` as a distinct error class:** 403 responses must be classified via `detectGithubRateLimit()` — primary (`X-RateLimit-Remaining: 0`) vs. secondary (body message contains "secondary rate limit" / "abuse detection"). Rate limits throw `RateLimitError` (with optional `waitHintSeconds` derived from `Retry-After` / `X-RateLimit-Reset`), NEVER `CredentialFailureError`. Use `rateLimitMessage()` to format user-facing messages with wait-time hints.
- **Non-rate-limit 403 returns `null`:** a 403 that is not a rate limit means the token is valid but the path is inaccessible (org-restriction, permission denial). Return `null` (like a 404) — do NOT call `markCredentialFailed`.
- **`inspectBmadSetup` security boundary:** functions that receive a plaintext OAuth token but perform no session check must NEVER carry `'use server'`. They are internal-only — only authenticated Server Actions may call them. Exposing them as network-callable endpoints would let anonymous callers relay arbitrary tokens through the server.
- **Parallel fetch, sequential priority resolution:** when probing multiple sources for a value (e.g. BMAD version detection), use `Promise.allSettled()` for parallelism but process results in original priority order — never by response timing. A rejected higher-priority probe must throw, not be silently skipped. "No version found" may only be concluded from clean 404s/parse misses across all sources.

### Testing Rules

#### Test Organization

- **Tests are co-located with source.** `*.spec.ts` / `*.test.tsx` sit next to the file under test. Never create a parallel `__tests__/` tree.
- **E2E tests** live in `playwright/` directory (Playwright), not in `apps/`.
- **Integration tests** in `apps/agent-be/test/integration/` with a separate Jest config (`jest-integration.config.ts`).
- Test file naming: `*.spec.ts` for unit, `*.test.tsx` for React component tests, `*.integration.spec.ts` for integration.

#### Test Priority Tags

- Tests are tagged `[P0]` or `[P1]` in their `it()` descriptions.
- **P0 = 100% pass rate required** — CI pipeline fails immediately on any P0 failure.
- **P1 = ≥95% pass rate** — pipeline fails below threshold.
- Always tag new tests appropriately. P0 for critical-path/acceptance-criteria tests; P1 for edge cases and nice-to-have coverage.

#### Mock Patterns

- **Jest mocks** at the top of the file before imports: `jest.mock('@/lib/auth', () => ({ auth: (...args) => mockAuth(...args) }))`.
- Use `jest.fn()` with explicit `.mockResolvedValue()` / `.mockRejectedValue()` / `.mockImplementation()`.
- `beforeEach` / `afterEach`: `jest.clearAllMocks()` in beforeEach, `jest.restoreAllMocks()` in afterEach.
- **GitHub API mocking:** mock `global.fetch` via `jest.spyOn(global, 'fetch').mockImplementation(...)`. Use the test-utils in `repository-validation.test-utils.ts` (`githubDirListing`, `githubFileContent`, `github404`, `github403PrimaryRateLimit`, etc.) for consistent GitHub response fixtures.
- **SandboxServiceFake** (`apps/agent-be/test/helpers/sandbox-service.fake.ts`) is the canonical test double for all Conversation-path tests. Inject via `buildTestModule()` from `test-module-builder.ts` which wires the fake through the `SANDBOX_SERVICE` DI token.
- **`buildTestModule()` is the canonical NestJS test module factory** (`apps/agent-be/test/helpers/test-module-builder.ts`). It augments NestJS's `TestingModuleBuilder` prototype with an `overrideProviders(array)` method (plural — NestJS only provides singular `overrideProvider`). Always use `buildTestModule(imports, overrides)` instead of manually calling `Test.createTestingModule()` — it pre-wires the `SandboxServiceFake` and supports array-form provider overrides.
- **Prisma mocking:** mock `getPrisma()` to return an object with the needed model methods: `jest.mock('@/lib/prisma', () => ({ getPrisma: () => ({ repoConnection: { upsert: mockUpsert } }) }))`.

#### Coverage Expectations

- No hard coverage percentage threshold, but P0 tests must cover all acceptance criteria from the story spec.
- ATDD pattern: tests are written first (red phase), often skipped with `test.skip()` until implementation lands. Remove skips one describe-block at a time per task.
- Credential health flip tests must prove the status actually changed within one operation cycle (not just that `markCredentialFailed` was called) — use `setImmediate` to make the flip genuinely async and assert the post-action state.

#### Playwright (E2E)

- Config in `playwright.config.ts` — testDir `./playwright`, 60s timeout, `trace: 'retain-on-failure'`, `video: 'retain-on-failure'`.
- Auth state: `.auth/local/default/storage-state.json` via a `setup` project that runs before `chromium`.
- `webServer` blocks start both `web:dev` (port 3000) and `agent-be:serve` (port 3001) with `wait-on` readiness checks.
- CI: 4 shards, 2 retries, `fail-fast: false`. Burn-in (10x) on PRs + weekly cron.
- Run via `yarn test:e2e` (or `:ci`, `:headed`, `:debug`). Scoped: `yarn test:e2e:auth`, `yarn test:e2e:conversation`.

### Code Quality & Style Rules

#### Naming Conventions

- **Component files:** PascalCase (`ConversationPane.tsx`, `RepositoryUrlForm.tsx`).
- **Non-component files:** kebab-case (`repo-connection.actions.ts`, `credential-health.ts`, `http-exception.filter.ts`).
- **Functions/variables:** camelCase. **Classes/types/interfaces:** PascalCase.
- **Prisma models:** PascalCase singular (`User`, `RepoConnection`), mapped to snake_case plural tables via `@@map("users")`.
- **Prisma columns:** camelCase in schema, mapped to snake_case via `@map("user_id")`. TypeScript-facing code stays camelCase; SQL schema stays snake_case.
- **REST endpoints:** plural nouns (`/conversations`, `/conversations/:id/turns`). NestJS `:id` route params.
- **JSON field naming:** camelCase throughout — matches TS end-to-end, no case-translation layer.

#### File/Folder Structure

- **apps/web components** organized by feature, flat hierarchy (`components/conversation/`, `components/project-map/`, `components/artifact-browser/`, `components/onboarding/`, `components/shell/`, `components/ui/`). NOT by type.
- **Shared utilities** are app-local (`apps/web/src/lib/`, `apps/agent-be/src/common/`). No shared utility library beyond `libs/shared-types` (types only) and `libs/database-schemas` (Prisma).
- **Never create a new `libs/` package** without a genuine cross-service need (the same justification as `libs/database-schemas`). No speculative `libs/utils`.
- **Server Actions** in `apps/web/src/actions/` — one file per domain (`repo-connection.actions.ts`, `credential-health.actions.ts`, etc.).
- **Test helpers** in `apps/agent-be/test/helpers/` — `test-module-builder.ts`, `sandbox-service.fake.ts`.

#### Comments & Documentation

- **DO NOT add comments unless explicitly requested** (per `CLAUDE.md`). Code should be self-documenting.
- JSDoc is used sparingly for public API contracts where the "why" isn't obvious (e.g. `resolveOAuthToken` tenant-scoping note, `rewrapDek` nonce-reuse warning). Follow that precedent — only document the non-obvious.
- Test files include a header comment block citing the story, acceptance criteria, and red-phase status.

#### Formatting

- Prettier: `singleQuote: true` only. Everything else is default.
- ESLint: flat config (`eslint.config.mjs`). `@nx/enforce-module-boundaries` with `enforceBuildableLibDependency: true`.
- Run lint via `yarn nx lint <project>` (or `yarn nx run-many -t lint`).

### Development Workflow Rules

#### Nx Task Running

- **Always run tasks through Nx**, never invoke underlying tools directly. Use `yarn nx build web`, `yarn nx test agent-be`, `yarn nx lint`, etc.
- Prefix commands with `yarn` (not `npx`) to use the workspace-pinned version.
- `yarn nx run-many -t <target>` runs across all projects. `yarn nx affected -t <target>` runs only changed projects.
- Targets: `build`, `test`, `lint`, `typecheck`, `dev`/`serve`, `e2e`.
- Dev: `yarn dev` runs both `web:dev` and `agent-be:serve`. `yarn nx serve web` / `yarn nx serve agent-be` individually.

#### Git/Commit Conventions

- **Conventional Commits** — subject line only, no body, trailers, or metadata.
- BMAD artifact updates use `docs` type with artifact-specific scope (e.g. `docs(architecture): ...`, `docs(prd): ...`, `docs(epics): ...`).
- Do NOT automatically commit changes after updating `_bmad-output` files.
- Examples: `feat(brainstorming): add initial ideation session`, `docs(architecture): update sandbox lifecycle section`.

#### CI/CD

- **GitHub Actions** (`.github/workflows/test.yml`): lint → unit + e2e (4 shards) → burn-in (PRs + weekly) → report.
- Quality gates: P0 = 100% pass (fails immediately), P1 = ≥95% pass (fails below threshold).
- Deploy is a **manual trigger**, not automatic on merge.
- `apps/web` deploys to Vercel; `apps/agent-be` deploys to Railway (Docker).
- Production only for MVP — no staging environment.
- Local CI mirror: `./scripts/ci-local.sh`. Affected-only: `./scripts/test-changed.sh main`. Burn-in: `./scripts/burn-in.sh 10`.

#### Environment

- `.env.example` documents all required env vars. Copy to `.env.local` for local dev.
- `DATABASE_URL` — Postgres connection string (test DB: `bmad_easy_test`).
- `CREDENTIAL_ENCRYPTION_KEK` — 32-byte hex string for AES-256-GCM. Generate with `openssl rand -hex 32`.
- `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` — Auth.js config.
- `DAYTONA_API_URL`, `DAYTONA_API_KEY` — leave blank in unit/integration tests (SandboxServiceFake is injected).
- `TEST_ENV=local` — test environment flag. `assertTestEnvNotInProduction()` enforces TEST_ENV is never set when `NODE_ENV=production`.
- KEK rotation: `yarn rotate-kek` (via `scripts/rotate-ke.ts`). Runbook in `docs/runbooks/kek-rotation.md`.

### Critical Don't-Miss Rules

#### Anti-Patterns to Avoid

- **NEVER wrap success responses in `{ data: ... }`** — return the raw resource body. The `{ code, message, meta }` envelope is for errors only.
- **NEVER use `class-validator` / `class-transformer`** in agent-be. Zod + `nestjs-zod` only.
- **NEVER create a speculative `libs/utils`** package. Shared libs require a genuine cross-service need.
- **NEVER add a global client-state library** to apps/web (no Redux/Zustand/Jotai). No React Query/SWR.
- **NEVER use `^` or `~` for pre-1.0 packages** — pin exact versions.
- **NEVER relax TypeScript strict mode** with `any` or `@ts-ignore`. Use `unknown` + type guards.
- **NEVER create a `__tests__/` tree** — co-locate tests with source.
- **NEVER organize apps/web components by type** — organize by feature.
- **NEVER return the decrypted OAuth token to the client** — tests explicitly assert `JSON.stringify(result)` does not contain the token value.
- **NEVER use `console.log` for production logging** in agent-be — use NestJS Logger with structured JSON.

#### Security Rules

- **OAuth token encryption:** AES-256-GCM envelope encryption (per-user DEK + platform KEK). `userId` is bound as GCM AAD on both GCM layers (DEK-wrap and token-encryption) — prevents ciphertext-transplant attacks. DEK is zeroed in memory after use (`dek.fill(0)` in `finally` block). Nonce length is validated before use (`assertNonceLength`) — a corrupt nonce throws a descriptive application error, not an opaque OpenSSL error.
- **`computeKekId(kek)` — deterministic KEK fingerprint:** first 16 hex chars of `sha256(kek)`, stored on `OAuthCredential.kekId`. Non-reversible: knowing the fingerprint does not help recover the KEK. Used by `rotate-kek.ts` to select rows by exact fingerprint match instead of trial-decryption. Every encryption operation writes `kekId`; every rotation classifies rows by it.
- **GCM nonce uniqueness is critical** — always use `randomBytes(12)`. Nonce reuse under the same key is a catastrophic failure.
- **KEK rotation script safety properties** (`scripts/rotate-kek.ts`): KEKs accepted from environment variables only (never CLI arguments — shell history / process listings). Output never contains key material, DEK bytes, or token fields. Three commands: `dry-run` (classify, no writes), `rotate` (re-wrap, fresh nonce), `verify` (classify against new KEK). Per-row optimistic update guard (`where: { id, encryptedDek, kekId }`). Idempotent re-run (already-rotated rows are `skipped`). Fail-closed on unmatched KEK. Announces target database (`describeDatabase()` — host:port/dbname only, never credentials) before any read/write so the operator can abort if it's the wrong database.
- **Tenant isolation:** `resolveOAuthToken(userId)` is the SINGLE point where plaintext tokens are resolved. The `where: { userId }` clause IS the tenant authorization check. Every credential lookup must pass a `tenant_id` / `userId` check.
- **Credential health propagation (NFR-R1):** 401 response → `markCredentialFailed(userId, capturedAt)` with optimistic-concurrency guard. 403 is NOT a credential failure — classify it (rate limit, org restriction, permission denial) and surface an appropriate error code. Silent failures are never acceptable.
- **Boundary JWT:** separate from Auth.js JWE. Transported via `Authorization` header (REST) and query parameter (SSE — `EventSource` cannot set headers). Logs must be sanitized to strip the token.
- **Live account-state check:** `active-user.guard.ts` fetches the live `User` row on every privileged agent-be request. A JWT alone doesn't reflect live account state.
- **Test endpoints:** `app/api/internal/test/*` routes are test-only. `assertTestEnvNotInProduction()` runs at startup. Per-request `NODE_ENV`/`TEST_ENV` checks. Never expose these in production.

#### Performance Gotchas

- **SSE back-pressure:** per-connection bounded event queue capped at 200 events. If the queue reaches 200 and hasn't drained within 30 seconds, emit `STREAM_ERROR` with `{ code: 'STREAM_BACK_PRESSURE' }` and close. Silent event drops are never acceptable.
- **Sandbox provisioning:** mandatory `--depth=1` shallow clone on every provision. Full-history clone is not supported. Repository size boundary: ≤200MB for the 10s chat-ready NFR.
- **Sandbox idle timeout:** a sandbox provisioned on page open that receives no first message within 60s must be torn down.
- **HTTP/2 requirement:** the agent-be reverse proxy must be HTTP/2-capable. HTTP/1.1 caps concurrent SSE at 6 connections (browser limit), breaking the 10-concurrent-conversations requirement.
- **SSE heartbeat:** emit heartbeat comments on a fixed interval so the browser detects dead connections even when sandbox-agent is stalled.
- **No caching layer for database reads** — don't add Redis/memoization for DB reads. Direct Prisma reads are the intended pattern for MVP. Bounded in-memory caches for expensive external API calls (GitHub) are acceptable with the guardrails documented in the Prisma/Database section above.

#### Edge Cases to Handle

- **GitHub org OAuth App restrictions:** 403 with org-restriction message must surface `ORG_RESTRICTION` error code with a specific message naming the org-restriction cause — not a generic "couldn't connect".
- **GitHub rate limits:** 403 with `X-RateLimit-Remaining: 0` (primary) or body containing "secondary rate limit" (abuse detection) → `RATE_LIMITED` error code. Do NOT call `markCredentialFailed` for rate limits.
- **GitHub 403 without rate-limit signal:** `INSUFFICIENT_PERMISSION` — token is valid, access denied. Do NOT mark credential as failed.
- **Missing `permissions` field** in GitHub API response: treat as `INSUFFICIENT_PERMISSION` (GitHub may omit permissions for org-member access).
- **Credential health flip timing:** `markCredentialFailed` must be awaited (not fire-and-forget) so the health status flips within one operation cycle. Tests use `setImmediate` to prove this.
- **Optimistic concurrency in `markCredentialFailed`:** capture a `capturedAt` timestamp BEFORE the external GitHub call, then pass it to `markCredentialFailed(userId, capturedAt)`. The write only applies if `updatedAt < capturedAt` (strict less-than — `lt`, not `lte`) — prevents a stale `failed` write from clobbering a concurrent re-authorization that bumped the status to `healthy` even in the same millisecond. This is the canonical pattern for any write that competes with a concurrent healthy-state writer.
- **Sandbox initialization sequence (ordered):** provision → clone (or restore on resume) → inject per-user git config → run `git status --porcelain` → emit `WORKING_TREE_*` event → emit `SESSION_READY`. Git config injection must occur at every provision AND every resume.
- **Failed `SandboxService.provision()`:** any partial Daytona allocation must be torn down — never leave orphaned sandboxes.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-07-02
