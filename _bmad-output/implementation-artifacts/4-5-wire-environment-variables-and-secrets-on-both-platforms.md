---
baseline_commit: dd1fbf00254bada5e748fcc613c26c6a92cb3bf1
---

# Story 4.5: Wire Environment Variables and Secrets on Both Platforms

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the platform operator,
I want all required secrets set on Vercel and Railway,
so that both services run with the correct production configuration.

## Acceptance Criteria

1. **AC-1 (Vercel env vars present):** Given `apps/web` on Vercel, When environment variables are set, Then `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_URL`, and `DATABASE_URL` are present as production-scoped env vars on the Vercel project.

2. **AC-2 (Railway env vars present):** Given `apps/agent-be` on Railway, When environment variables are set, Then `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK` (generated via `openssl rand -hex 32`), `DAYTONA_API_URL`, `DAYTONA_API_KEY`, `ANTHROPIC_API_KEY` (Claude Agent SDK credential, required per PRD §8 Assumption A-3 — consumed by the agent-be Anthropic proxy endpoint that sandboxes reach via `ANTHROPIC_BASE_URL`; never injected into a Daytona sandbox, per NFR-S1) are present on the agent-be Railway service.

3. **AC-3 (TEST_ENV absent):** Given either platform, When variables are reviewed, Then `TEST_ENV` is confirmed absent — on `apps/web`, the existing `assertTestEnvNotInProduction()` guard (in `apps/web/src/lib/env-guard.ts`, invoked from `apps/web/src/instrumentation.ts`) must not fail startup; on `apps/agent-be`, an equivalent check (or documented manual verification) confirms `TEST_ENV` is not set in the Railway environment.

4. **AC-4 (GitHub OAuth App callback URL):** Given the GitHub OAuth App requirement, When `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` are needed, Then the OAuth App callback URL is updated to the production `*.vercel.app` domain — this sub-step is manual (no API exists for OAuth App settings), performed by the user at `github.com/settings/developers`.

5. **AC-5 (Anthropic proxy endpoint — NFR-S1 compliance):** Given NFR-S1 (platform-internal credentials must not reach the sandbox), When the Anthropic proxy endpoint is built in `apps/agent-be`, Then it forwards HTTP requests to `api.anthropic.com` with an injected `x-api-key` header (sourced from `ANTHROPIC_API_KEY`), never leaks the key in response body/headers/logs, supports streaming (SSE) responses, and is registered as a `@Public()` endpoint (the sandbox has no boundary JWT — per the 2026-07-11 Party Mode resolution, the sandbox carries "no key, no secret, no credential of any kind").

6. **AC-6 (NODE_ENV=production in Dockerfile):** Given the Dockerfile runtime stage, When the container runs on Railway, Then `NODE_ENV` is set to `production` — the existing `assertTestEnvNotInProduction()` guard in `apps/web` checks `NODE_ENV === 'production'` to enforce `TEST_ENV` is never set in production; without `NODE_ENV=production`, the guard cannot distinguish production from development.

7. **AC-7 (ANTHROPIC_API_KEY in env validation):** Given `apps/agent-be`'s env validation schema, When the service starts, Then `ANTHROPIC_API_KEY` is validated as present (min length 1) — a missing key currently silently becomes `''` at the call site, failing at first agent run rather than at boot.

## Tasks / Subtasks

- [ ] **Task 1: Build the Anthropic proxy endpoint** (AC: #5)
  - [ ] 1.1 **ATDD scaffolding applied:** `anthropic-proxy.module.ts` stub already created at `apps/agent-be/src/anthropic-proxy/anthropic-proxy.module.ts` with the controller registered. **Dev action:** Import `AnthropicProxyModule` into `AppModule.imports` (after `StreamingModule`, before `ConversationsModule` — ordering doesn't matter for this stateless module, but keep it grouped with other feature modules).
  - [ ] 1.2 **ATDD scaffolding applied:** `anthropic-proxy.controller.ts` stub already created at `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts` with `@Public()`, `@Controller('proxy/anthropic')`, and `@All('*path')` decorators. The stub throws "Not implemented". **Dev action:** Implement the `proxy()` method:
    - `@Public()` decorator (bypasses `BoundaryJwtGuard` and `ActiveUserGuard` — the sandbox has no boundary JWT per NFR-S1 resolution).
    - `@Controller('proxy/anthropic')` — the global prefix `/api` makes the full path `/api/proxy/anthropic`.
    - `@All('*path')` handler — catches all HTTP methods and path segments under the prefix.
    - Read `ANTHROPIC_API_KEY` from `process.env`. If missing/unset, respond `503 { code: 'PROXY_NOT_CONFIGURED', message: 'ANTHROPIC_API_KEY not set' }`.
    - Construct target URL: `https://api.anthropic.com/${req.params.path}` (the `*path` route parameter captures everything after `/api/proxy/anthropic/`, e.g. `v1/messages`) with query string forwarded from the original request (`req.url` query portion).
    - Forward the request using `fetch()` with: method from original request, `body: req.body` (forward the parsed request body — NestJS body parser handles JSON; for raw body forwarding, use `req.pipe()` or read the raw stream, but parsed+re-serialized JSON is acceptable for MVP since the Anthropic API accepts JSON), `x-api-key: ${apiKey}` header (injected — the Anthropic API uses `x-api-key`, not `Authorization: Bearer`), `anthropic-version` header (forwarded from request, defaulting to `2023-06-01` if absent), `content-type` header (forwarded from request). Do NOT forward `authorization`, `x-api-key` (from client), `host`, or `cookie` headers.
    - Stream the response body back to the client — read `response.body` via `getReader()` and pipe chunks to `res.write()`. This is critical: the Claude Agent SDK uses SSE streaming; buffering the response would break streaming and add latency.
    - Forward response status code and headers. Strip only true hop-by-hop headers (`transfer-encoding`) and `content-length` (the proxy streams chunks and cannot guarantee the upstream byte count matches — Express will use `transfer-encoding: chunked` automatically when `content-length` is absent). **Forward `content-encoding`** — it is an end-to-end header, NOT hop-by-hop. Node's native `fetch()` via `getReader()` yields raw bytes (no auto-decompression — that only happens with `response.text()`/`response.json()`). If the proxy strips `content-encoding: gzip` but forwards raw gzip bytes, the client receives compressed data with no indication to decompress. For SSE streams (primary use case), the Anthropic API sends `text/event-stream` without compression, so this mainly affects non-streaming API calls — but the header must be forwarded regardless.
    - Wrap `res.write()` / `res.end()` in try/catch — the client may disconnect mid-stream.
    - Log at `debug` level: method, path, status code. NEVER log the API key, request body, or response body.
  - [ ] 1.3 The `ThrottlerGuard` (registered as `APP_GUARD` in `AppModule`) applies globally — the proxy is rate-limited at 100 req/60s per IP. No additional rate limiting needed for MVP.

- [ ] **Task 2: Add ANTHROPIC_API_KEY to env validation** (AC: #7)
  - [ ] 2.1 In `apps/agent-be/src/config/env.validation.ts`, add `ANTHROPIC_API_KEY: z.string().min(1)` to the Zod schema. The service now fails at boot if the key is missing, rather than silently becoming `''` at the first agent run.

- [ ] **Task 3: Set NODE_ENV=production in Dockerfile** (AC: #6)
  - [ ] 3.1 In `apps/agent-be/Dockerfile`, add `ENV NODE_ENV=production` in the runtime stage (after `FROM node:24-slim AS runtime`, before `CMD`). This is a Docker `ENV` instruction, not a Railway env var — it's baked into the image so every container start has it.
  - [ ] 3.2 Verify the existing `HEALTHCHECK` still works — `NODE_ENV=production` does not affect the `node -e` health check command.

- [ ] **Task 4: Wire env vars on Vercel via REST API** (AC: #1, #3)
  - [ ] 4.1 Read `VERCEL_TOKEN` from `.env.local` (value starts with `vcp_`). Team ID: `team_DV9hczWkgqbOEoMGnX9Pta3t`. Project ID: `prj_ih4UAxO759A1CHdrZ93j4rk3poYD` (from Story 4.1 completion notes).
  - [ ] 4.2 For each env var, check if it already exists via `GET https://api.vercel.com/v9/projects/{projectId}/env?teamId={teamId}`. If it exists, update via `PATCH https://api.vercel.com/v9/projects/{projectId}/env/{envId}?teamId={teamId}`. If not, create via `POST https://api.vercel.com/v9/projects/{projectId}/env?teamId={teamId}`.
  - [ ] 4.3 Set the following env vars with `type: "encrypted"`, `target: ["production"]`:
    - `AUTH_SECRET` — read from `.env` (reuse the local dev value; it's a random string, acceptable for MVP single-environment).
    - `AUTH_GITHUB_ID` — read from `.env` (value: `Ov23liwPSopCBFh9nMRN`).
    - `AUTH_GITHUB_SECRET` — read from `.env`.
    - `AUTH_URL` — set to `https://bmad-easy.vercel.app` (the production URL from Story 4.1, NOT the local `http://localhost:3000`).
    - `DATABASE_URL` — the Railway Postgres connection string (from Story 4.2/4.4 completion notes: `tokaido.proxy.rlwy.net:42861/railway`). Fetch the full connection string from the Railway GraphQL API (reuse the pattern from `railway-project-structure.integration.spec.ts:172-203`). Ensure `sslmode=require` is appended if not already present (NFR finding from Story 4.2: no SSL verification on manually constructed DATABASE_URL).
  - [ ] 4.4 Verify `TEST_ENV` is NOT set on the Vercel project (check the env var list from step 4.2). If it exists, delete it via `DELETE https://api.vercel.com/v9/projects/{projectId}/env/{envId}?teamId={teamId}`.

- [ ] **Task 5: Wire env vars on Railway via GraphQL API** (AC: #2, #3)
  - [ ] 5.1 Read `RAILWAY_TOKEN` from `.env.local` (value starts with `d49618b7`). Railway GraphQL endpoint: `https://backboard.railway.com/graphql/v2`. Project ID: `30ab04b2-132c-440b-92ca-bc57be294d6f`. Environment ID: `0c3802e5-d0a4-44c0-beec-ed6ff592f5e5` (production). Agent-be service ID: `4df7d0d1-0040-4395-89c8-bd166c4863cf`.
  - [ ] 5.2 Use the `variableCollectionUpsert` mutation to set env vars on the agent-be service. The mutation accepts `projectId`, `environmentId`, `serviceId`, and a `variables` map. Reuse the Railway GraphQL query pattern from `railway-project-structure.integration.spec.ts`.
  - [ ] 5.3 Set the following env vars:
    - `DATABASE_URL` — the Railway Postgres connection string (same value as Vercel, from the Postgres service). Ensure `sslmode=require` is appended.
    - `CREDENTIAL_ENCRYPTION_KEK` — generate a NEW production value via `openssl rand -hex 32`. Do NOT reuse the local dev placeholder (`0000…0000`). Record only that it was set (never log the value).
    - `DAYTONA_API_URL` — read from `.env`.
    - `DAYTONA_API_KEY` — read from `.env`.
    - `ANTHROPIC_API_KEY` — read from `.env`. This key is consumed by the proxy endpoint (Task 1), NOT injected into sandboxes.
    - `NODE_ENV` — set to `production` (belt-and-suspenders with the Dockerfile `ENV` from Task 3; the Docker `ENV` is the primary, this is a redundancy for Railway's env var layer).
    - `AUTH_SECRET` — read from `.env` (same value as Vercel; the boundary JWT is signed with this key on both sides).
  - [ ] 5.4 Verify `TEST_ENV` is NOT set on the agent-be Railway service (query variables and check). If it exists, delete it via the `variableDelete` mutation.
  - [ ] 5.5 Redeploy the agent-be service so the new env vars take effect: trigger a redeploy via the Railway GraphQL API (`deploymentRedeploy` mutation with the latest deployment ID) or via the Railway CLI.

- [ ] **Task 6: Update GitHub OAuth App callback URL** (AC: #4)
  - [ ] 6.1 Navigate to `https://github.com/settings/developers` → find the OAuth App with ID `Ov23liwPSopCBFh9nMRN`.
  - [ ] 6.2 Update the "Authorization callback URL" to `https://bmad-easy.vercel.app/api/auth/callback/github` (replacing the current `http://localhost:3000/api/auth/callback/github`).
  - [ ] 6.3 Update the "Homepage URL" to `https://bmad-easy.vercel.app`.
  - [ ] 6.4 This is a MANUAL step — no API exists for OAuth App settings. Record completion in the Dev Agent Record.

- [ ] **Task 7: Update .env.example** (AC: #1, #2, #5)
  - [ ] 7.1 Add `ANTHROPIC_API_KEY=` to the `.env.example` file under a new "LLM / Claude Agent SDK" section, with a comment: "Consumed by the agent-be Anthropic proxy endpoint. Never injected into Daytona sandboxes (NFR-S1)."
  - [ ] 7.2 Add `ANTHROPIC_BASE_URL=` to `.env.example` under the same section, with a comment: "Set on Daytona sandboxes (Epic 6) to point at the agent-be proxy. Local dev: leave blank (host-based SDK execution uses ANTHROPIC_API_KEY directly)."
  - [ ] 7.3 Add `NODE_ENV=` to `.env.example` under the "Test Environment" section, with a comment: "Set to 'production' on Railway (Dockerfile ENV). Leave unset for local dev."

- [ ] **Task 8: Create tests** (AC: #5, #7)
  - [ ] 8.1 **ATDD scaffolding applied:** `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts` already created with 9 `it.skip()` red-phase test scaffolds. **Dev action:** Remove `it.skip()` one describe-block at a time during implementation, verify each test fails first (red), then passes after implementing the proxy (green). The 9 tests cover:
    - `[P0]` injects `x-api-key` header from `process.env.ANTHROPIC_API_KEY` into the forwarded request.
    - `[P0]` returns 503 when `ANTHROPIC_API_KEY` is not set.
    - `[P0]` does NOT forward `authorization`, `x-api-key` (from client), `host`, or `cookie` headers.
    - `[P0]` forwards the response status code and body.
    - `[P0]` streams the response body (does not buffer).
    - `[P0]` never includes the API key in the response body or headers.
    - `[P0]` forwards query string parameters.
    - `[P0]` forwards the request body to the upstream Anthropic API (POST body reaches `fetch()` call).
    - `[P1]` logs at debug level only (no key, no body, no response content).
  - [ ] 8.2 **ATDD scaffolding applied:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` already migrated — `toHaveProperty` assertions replaced with `Object.keys()` assertions per the "Secret-aware test assertions" rule in `project-context.md`:
    - Line 60: `expect(Object.keys(createArg)).toContain('labels')` (was `toHaveProperty('labels')`).
    - Line 61: `expect(Object.keys(createArg)).not.toContain('env')` (was `not.toHaveProperty('env')`).
    - Line 62: `expect(Object.keys(createArg)).not.toContain('resources')` (was `not.toHaveProperty('resources')`).
    - Line 63: `expect(Object.keys(createArg)).not.toContain('metadata')` (was `not.toHaveProperty('metadata')`).
    - **Dev action:** Run `yarn nx test agent-be -- --testPathPatterns=nfr-s1` to verify all existing tests still pass after the migration.
  - [ ] 8.3 **ATDD scaffolding applied:** `apps/agent-be/test/integration/platform-env-vars.integration.spec.ts` already created with 6 `it.skip()` red-phase test scaffolds. **Dev action:** Remove `it.skip()` after wiring env vars (Tasks 4-5), verify each test passes. The 6 tests cover:
    - `[P0]` Vercel project has `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_URL`, `DATABASE_URL` as production env vars.
    - `[P0]` Vercel project does NOT have `TEST_ENV`.
    - `[P0]` Railway agent-be service has `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK`, `DAYTONA_API_URL`, `DAYTONA_API_KEY`, `ANTHROPIC_API_KEY`, `AUTH_SECRET`, `NODE_ENV`.
    - `[P0]` Railway agent-be service does NOT have `TEST_ENV`.
    - `[P0]` `CREDENTIAL_ENCRYPTION_KEK` is NOT the test placeholder `0000…0000` (verify length is 64 hex chars).
    - `[P0]` `DATABASE_URL` on both platforms contains `sslmode=require` (NFR finding from Story 4.2).
    - Uses `expect(Object.keys(vars)).toContain('KEY')` (NOT `toHaveProperty`) per the secret-aware test assertions rule — assertion failures must not dump secret values into CI logs.
    - Uses the `getRailwayToken()` helper pattern from `railway-project-structure.integration.spec.ts:22-40` for Railway API auth.
    - Uses `VERCEL_TOKEN` from `.env.local` for Vercel API auth (same pattern as `getRailwayToken()` but reading `VERCEL_TOKEN`).
    - **Vercel API limitation:** Vercel env vars with `type: "encrypted"` do NOT return values via the API — only the key, target, and type are returned. The `DATABASE_URL` sslmode verification test can only check the value on Railway (which returns variable values). For Vercel, the test only verifies the env var exists. Vercel `DATABASE_URL` sslmode must be verified manually (Vercel dashboard or a runtime check after deploy).

- [ ] **Task 9: Verify the proxy endpoint works end-to-end** (AC: #5)
  - [ ] 9.1 After deploying agent-be to Railway (Task 5.5), verify the proxy responds: `curl -X POST https://<railway-domain>/api/proxy/anthropic/v1/messages -H "content-type: application/json" -H "anthropic-version: 2023-06-01" -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'` — should return a valid Anthropic API response (the proxy injects the `x-api-key` header).
  - [ ] 9.2 Verify the proxy does NOT accept an `x-api-key` header from the client (the proxy overwrites it with its own key — a client-provided key must not be forwarded).
  - [ ] 9.3 Verify the proxy streams SSE responses: send a streaming request (`"stream": true`) and confirm chunks arrive incrementally (not buffered).

## Dev Notes

### ATDD Artifacts

- **Checklist:** `_bmad-output/test-artifacts/atdd-checklist-4-5-wire-environment-variables-and-secrets-on-both-platforms.md`
- **Unit tests (red-phase):** `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts` (9 `it.skip()` scaffolds)
- **Integration tests (red-phase):** `apps/agent-be/test/integration/platform-env-vars.integration.spec.ts` (6 `it.skip()` scaffolds)
- **Stub files (red-phase):** `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts`, `apps/agent-be/src/anthropic-proxy/anthropic-proxy.module.ts`
- **NFR-S1 migration (active):** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` — `toHaveProperty` → `Object.keys()` assertions migrated
- **E2E deferred:** No browser-level mock covers any AC (all are platform/backend-level). See checklist for full justification.
- **Regression guard check:** Proxy uses `fetch()` (not shell commands) — credential-isolation guards cover key leakage in response/headers/logs. Sandbox `executeCommand` guards already exist (NFR-S1 spec). Input-injection guards for `shellQuote` deferred (DP-5, scope temptation).

### Deferred Work Check

**Checked:** `_bmad-output/implementation-artifacts/deferred-work.md` was scanned for deferred findings matching file paths or components in scope for this story's code changes.

**Result: 4 deferred findings pulled into scope.**

#### 1. NODE_ENV=production not set in Dockerfile runtime stage (deferred-work.md line 7)

> `NODE_ENV=production not set in runtime stage — env var wiring is Story 4.5 scope. [apps/agent-be/Dockerfile:17-30]`

**Pulled in:** Task 3 sets `ENV NODE_ENV=production` in the Dockerfile runtime stage. This was explicitly deferred from the Story 4.3 code review with the note "env var wiring is Story 4.5 scope."

#### 2. ANTHROPIC_API_KEY proxy approach — NFR-S1 compliance (deferred-work.md lines 123-139)

> **[BLOCKING]** Raw `ANTHROPIC_API_KEY` becomes readable inside every Daytona sandbox. Resolution (2026-07-11, Party Mode roundtable): NFR-S1 is inviolable — `ANTHROPIC_API_KEY` must not enter the sandbox. The proxy-through-agent-be approach is the selected solution.
>
> **Rework required for Story 4.5:**
> - Build the proxy endpoint in `apps/agent-be` (~30 lines: forward HTTP requests to `api.anthropic.com` with injected key; never leak key in response body/headers).
> - `ANTHROPIC_API_KEY` stays as a Railway env var on agent-be, but its purpose changes from "injected into sandboxes" to "consumed by agent-be proxy endpoint".
> - Story 3.1 sandbox init sequence: replace `ANTHROPIC_API_KEY` env var injection with `ANTHROPIC_BASE_URL` env var injection (Epic 6 scope — Story 4.5 builds the proxy, Epic 6 wires `ANTHROPIC_BASE_URL` into sandbox provisioning).

**Pulled in:** Task 1 builds the proxy endpoint. Task 5 wires `ANTHROPIC_API_KEY` on Railway (consumed by the proxy, NOT injected into sandboxes). Task 7 documents `ANTHROPIC_BASE_URL` in `.env.example` (for Epic 6 to set on sandboxes).

**Decision (DP-2):** `architecture.md` line 259 still describes the OLD design ("`ANTHROPIC_API_KEY` is injected into each Daytona sandbox as an environment variable at `daytona.create()` time"). This contradicts NFR-S1 ("Platform-internal credentials must not reach Sandbox") — the architecture's own NFR. Per DP-2, the higher-authority semantic intent (NFR-S1) wins over the literal text describing the old injection approach. The Party Mode resolution (2026-07-11) is the current truth. The architecture doc should be amended to reflect the proxy approach, but that is a documentation change outside this story's code scope — flag it for the architect. The epics.md AC for Story 4.5 already reflects the proxy approach (updated 2026-07-11).

#### 3. ANTHROPIC_API_KEY not in env validation (deferred-work.md line 358)

> `ANTHROPIC_API_KEY` and `AGENT_WORKDIR` not in env validation — `env.validation.ts` Zod schema validates only `DATABASE_URL`, `DAYTONA_API_URL`, `DAYTONA_API_KEY`, `AUTH_SECRET`. A missing `ANTHROPIC_API_KEY` silently becomes `''` at the call site, failing at first agent run rather than at boot.

**Pulled in:** Task 2 adds `ANTHROPIC_API_KEY: z.string().min(1)` to the env validation schema. `AGENT_WORKDIR` is NOT pulled in — it's an optional env var with a `tmpdir()` fallback (not a required secret); adding it to the Zod schema would make it required, contradicting its optional-with-default design (per the "Env-configured numeric thresholds" pattern in `project-context.md`).

#### 4. NFR-S1 test uses `toHaveProperty` on secret-bearing objects (deferred-work.md line 392)

> `expect(createArg).not.toHaveProperty('env')` — `createArg` is the Daytona `create()` args. If a regression introduces `env: { ANTHROPIC_API_KEY: ... }`, the assertion fails and prints the full `createArg` including the key. Migrate to `Object.keys(createArg).not.toContain('env')`.

**Pulled in:** Task 8.2 migrates the `toHaveProperty` assertions in `sandbox.service.nfr-s1.spec.ts` to `Object.keys()` assertions per the "Secret-aware test assertions" rule in `project-context.md`.

**Checked but NOT in scope:**

- **`env` option passes only `ANTHROPIC_API_KEY`** (deferred-work.md line 359): `agent.service.ts:95-97` passes `env: { ANTHROPIC_API_KEY: ... }` which replaces the entire process environment. This is about host-based agent execution (Epic 3), not the proxy endpoint. Story 4.5 does NOT modify `agent.service.ts`. **Decision (DP-5):** scope temptation — the proxy is a new endpoint, not a refactor of the existing agent execution path. Defer.
- **`AGENT_WORKDIR` not in env validation** (deferred-work.md line 358): Optional with `tmpdir()` fallback. Not a required secret. **Decision (DP-5):** defer — adding it to Zod schema would make it required.
- **Secret leakage in `railway-project-structure.integration.spec.ts:196`** (deferred-work.md line 390): `expect(vars).toHaveProperty('DATABASE_URL')` dumps secrets on failure. Story 4.5 does NOT modify this file — env var verification tests go in a NEW file (`platform-env-vars.integration.spec.ts`). If the dev chooses to extend the existing railway test file instead, pull this fix in: replace `expect(vars).toHaveProperty('DATABASE_URL')` with `expect(Object.keys(vars)).toContain('DATABASE_URL')`.
- **HEALTHCHECK http.get has no request timeout** (deferred-work.md line 8): `apps/agent-be/Dockerfile:28-29`. Optimization, not a bug. The Docker `--timeout=3s` flag already kills hung health checks. **Decision (DP-5):** defer.
- **Runtime container runs as root** (deferred-work.md line 6): No `USER` directive in Dockerfile. Security best practice not in ACs. **Decision (DP-5):** defer.
- **Non-deterministic dependency resolution** (deferred-work.md line 5): root `yarn.lock` copied for merged `package.json` doesn't match. Spec-accepted tradeoff (DP-3). Not in scope.

### Decisions (per decision-policy.md)

**Decision (DP-2):** `architecture.md` line 259 describes injecting `ANTHROPIC_API_KEY` into Daytona sandboxes. This contradicts NFR-S1 (architecture line 54: "Platform-internal credentials must not reach Sandbox"). The Party Mode resolution (2026-07-11) selected the proxy-through-agent-be approach. The semantic intent (NFR-S1) wins over the literal text. The epics.md AC already reflects the proxy approach. The architecture doc should be amended separately (flag for architect). This story implements the proxy, not the old injection design.

**Decision (DP-3):** The proxy endpoint is `@Public()` (no boundary JWT). The sandbox has no credential per the NFR-S1 resolution ("no key, no secret, no credential of any kind"). Security for MVP: (1) the proxy URL is not advertised, (2) the global `ThrottlerGuard` rate-limits at 100 req/60s per IP, (3) the proxy only forwards to `api.anthropic.com` (not an open proxy), (4) `networkAllowList` on sandboxes restricts egress to the proxy URL. Residual risk (proxy URL discovery and abuse) is accepted for MVP single-user. This is the simplest reversible option — adding per-sandbox authentication would require injecting a credential into the sandbox, violating NFR-S1.

**Decision (DP-3):** The proxy uses `x-api-key` header (the Anthropic API standard), not `Authorization: Bearer`. The deferred finding says "Authorization header" but the Anthropic API and Claude Agent SDK use `x-api-key`. Per DP-2 (semantic intent over literal text), the intent is "inject the API key so the sandbox doesn't have it" — `x-api-key` is the correct header.

**Decision (DP-3):** Reuse local dev secret values for production (AUTH_SECRET, AUTH_GITHUB_SECRET, DAYTONA_API_KEY, ANTHROPIC_API_KEY) rather than generating new production-only values. For MVP single-environment, this is the simplest option. The only value that MUST be new is `CREDENTIAL_ENCRYPTION_KEK` (the local dev value is a test placeholder `0000…0000`). Generating new production-only secrets for every value would require a secret rotation mechanism that doesn't exist yet (Story 4.12).

**Decision (DP-3):** Set `NODE_ENV=production` as a Docker `ENV` instruction in the Dockerfile (primary) AND as a Railway env var (redundancy). The Docker `ENV` is baked into the image and applies to every container start. The Railway env var is a belt-and-suspenders for Railway's env var layer. Both are the simplest option — no new mechanism needed.

**Decision (DP-5):** Do NOT modify `agent.service.ts` to change how it passes `ANTHROPIC_API_KEY` to the SDK `query()` call. The proxy is a new endpoint for sandbox-based execution (Epic 6). The host-based execution path (Epic 3) continues to use `ANTHROPIC_API_KEY` from `process.env` directly. Refactoring the host-based path is scope temptation.

**Decision (DP-5):** Do NOT create ATDD test scaffolds for SEC-002, SEC-003, SEC-009 (sandbox env injection tests). These test sandbox env var injection, which is Epic 6's scope (the current `SandboxService.provision()` doesn't inject any env vars). The existing NFR-S1 regression guard (`sandbox.service.nfr-s1.spec.ts`) already asserts `daytona.create()` has no `env` property — this covers the "no ANTHROPIC_API_KEY in sandbox" invariant for the current code. Epic 6 will add env var injection (including `ANTHROPIC_BASE_URL`) and update these tests then.

**Decision (DP-4):** Clarified proxy URL construction from `path.join('/')` (ambiguous — `req.params.path` is a string in Express 4, not an array) to `req.params.path` directly. Also added explicit request body forwarding (`body: req.body`) to the `fetch()` call description — the original omitted the body, risking empty POST requests to the Anthropic API. Added a P0 test for request body forwarding and updated the test count in the File Structure table (7 → 9 tests). All doc-wording changes with no production behavior change.

**Decision (DP-2):** The "Current State of Key Code" section showed stale pre-migration code for `sandbox.service.nfr-s1.spec.ts` (with `toHaveProperty` assertions and `// MIGRATE` comments). The actual file already has the `Object.keys()` migration applied (verified at lines 60-63). Task 8.2 correctly states "already migrated". The stale code snippet contradicted the task description — per DP-2, amended the "Current State" code snippet to show the actual current post-migration state, eliminating the contradiction.

**Decision (DP-2):** Task 1.2 originally said "Forward response status code and headers (except `transfer-encoding` and `content-encoding` which are hop-by-hop)." This is technically incorrect — `content-encoding` is an end-to-end header, NOT hop-by-hop (per RFC 7230). Node's native `fetch()` via `getReader()` yields raw bytes without auto-decompression. Stripping `content-encoding` while forwarding raw compressed bytes would cause the client to receive garbage data for non-streaming responses. The semantic intent is "forward headers correctly so the client can interpret the response" — amended the task to forward `content-encoding` and only strip true hop-by-hop headers (`transfer-encoding`) plus `content-length` (which cannot be guaranteed accurate when streaming chunks).

**Decision (DP-4):** Added note about Vercel API limitation for `DATABASE_URL` sslmode verification — Vercel encrypted env vars don't return values via the API, so the integration test can only verify sslmode on Railway. Vercel sslmode must be verified manually. Test-only documentation change with no production behavior change.

### Architecture Compliance

**NFR-S1 (architecture.md line 54):** "Platform-internal credentials must not reach Sandbox." The proxy endpoint (Task 1) ensures `ANTHROPIC_API_KEY` is consumed by agent-be, never injected into a Daytona sandbox. The existing `SandboxService.provision()` already passes only `labels` to `daytona.create()` (no `env` property) — verified by the NFR-S1 regression guard tests.

**Authentication & Security item 6 (architecture.md line 259):** Describes the OLD design (inject `ANTHROPIC_API_KEY` into sandbox). Superseded by the Party Mode resolution (2026-07-11) — the proxy approach is the current truth. The architecture doc should be amended separately.

**Technical Constraints — Sandbox initialization sequence (architecture.md line 80):** Describes "provision (env vars `ANTHROPIC_API_KEY`/`GITHUB_TOKEN` injected...)". The `ANTHROPIC_API_KEY` injection is superseded by the proxy approach. `GITHUB_TOKEN` injection remains (it's the user's own OAuth token, NFR-S1-compliant). The sandbox init sequence update (replacing `ANTHROPIC_API_KEY` with `ANTHROPIC_BASE_URL`) is Epic 6 scope.

**Infrastructure & Deployment (architecture.md lines 284-290):** "`apps/web`: Vercel. `apps/agent-be`: Railway (Docker)." This story wires env vars on both platforms. "Every Daytona sandbox must have `networkAllowList` egress restriction applied at provision time" — the proxy URL must be in the allow-list (Epic 6 scope, when sandbox env injection is implemented).

**Implementation Sequence (architecture.md line 298):** "Stand up `apps/agent-be` on Railway (Docker); wire the shared Prisma client." This story wires the production env vars on Railway. Line 302: "Integrate the Daytona SDK in `apps/agent-be` (API key as a Railway secret)" — `DAYTONA_API_KEY` is wired as a Railway env var in Task 5.

### Library / Framework Requirements

- **NestJS ^11.0.0** — the proxy endpoint is a NestJS controller. Uses `@Public()` decorator, `@Controller()`, `@All()`, `@Req()`, `@Res()`. The global `ThrottlerGuard` applies rate limiting. No new dependencies needed.
- **Vercel REST API v9** — `POST/GET/PATCH/DELETE /v9/projects/{projectId}/env?teamId={teamId}` for env var management. Auth: `Authorization: Bearer ${VERCEL_TOKEN}`.
- **Railway GraphQL API v2** — `https://backboard.railway.com/graphql/v2`. `variableCollectionUpsert` mutation for setting env vars. `variables` query for reading env vars. Auth: `Authorization: Bearer ${RAILWAY_TOKEN}`.
- **Zod ^4.4.3** — env validation schema in `env.validation.ts`. Add `ANTHROPIC_API_KEY: z.string().min(1)`.
- **Node.js `fetch`** — the proxy uses the built-in `fetch()` (Node 24 has native `fetch` with streaming support via `response.body.getReader()`).

### File Structure Requirements

**Files to CREATE (NEW):**

| File | What it does |
|---|---|
| `apps/agent-be/src/anthropic-proxy/anthropic-proxy.module.ts` | NestJS module for the Anthropic proxy feature. |
| `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts` | `@Public()` controller that forwards requests to `api.anthropic.com` with injected `x-api-key` header. Supports streaming (SSE). ~40-50 lines. |
| `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts` | Unit tests for the proxy controller (13 tests: 12 P0 + 1 P1 — 9 original + 4 NFR audit fix tests). |
| `apps/agent-be/test/integration/platform-env-vars.integration.spec.ts` | Integration tests verifying env vars are set on Vercel and Railway via their APIs (6 tests, Task 8.3). |

**Files to MODIFY:**

| File | What changes |
|---|---|
| `apps/agent-be/src/app/app.module.ts` | Add `AnthropicProxyModule` to `imports` array. One import + one array entry. |
| `apps/agent-be/src/config/env.validation.ts` | Add `ANTHROPIC_API_KEY: z.string().min(1)` to Zod schema. One line. |
| `apps/agent-be/Dockerfile` | Add `ENV NODE_ENV=production` in the runtime stage. One line. |
| `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` | Migrate `toHaveProperty` → `Object.keys()` assertions (4 lines). Deferred finding from code review of 4-2. |
| `.env.example` | Add `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `NODE_ENV` entries with comments. |

**Files NOT to modify (preserved interactions — do NOT regress):**

| File | Why preserved |
|---|---|
| `apps/agent-be/src/streaming/agent.service.ts` | Host-based agent execution uses `ANTHROPIC_API_KEY` from `process.env` directly (line 97). The proxy is a SEPARATE endpoint for sandbox-based execution (Epic 6). Do NOT refactor the host-based path (DP-5). |
| `apps/agent-be/src/sandbox/sandbox.service.ts` | `provision()` already passes only `labels` to `daytona.create()` (no `env`). The NFR-S1 regression guard tests verify this. Do NOT add env var injection — that's Epic 6 scope. |
| `apps/web/src/lib/env-guard.ts` | `assertTestEnvNotInProduction()` checks `NODE_ENV === 'production'` and `TEST_ENV` is not set. Story 4.5 sets `NODE_ENV=production` in the Dockerfile so this guard works in production. Do NOT modify the guard. |
| `apps/web/src/instrumentation.ts` | Invokes `assertTestEnvNotInProduction()` at startup. Do NOT modify. |
| `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts` | Railway API structure tests (Stories 4.2 + 4.3). Env var verification goes in a NEW file. If extending this file instead, pull in the `toHaveProperty` → `Object.keys()` fix (deferred-work.md line 390). |
| `.github/workflows/test.yml` | CI deploy job is Story 4.6, not this story. |
| `apps/web/vercel.json` | Vercel project configuration (Story 4.1). Do NOT modify. |

### Current State of Key Code (READ BEFORE IMPLEMENTING)

**`apps/agent-be/src/app/app.module.ts` — module registration pattern:**
```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    CredentialsModule,
    SandboxModule,
    StreamingModule,
    ConversationsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: BoundaryJwtGuard },
    { provide: APP_GUARD, useClass: ActiveUserGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```
The `AnthropicProxyModule` goes in `imports`. The `@Public()` decorator on the proxy controller bypasses `BoundaryJwtGuard` and `ActiveUserGuard`. The `ThrottlerGuard` still applies (rate limiting).

**`apps/agent-be/src/app/app.controller.ts` — `@Public()` pattern:**
```typescript
@Controller()
export class AppController {
  @Get('health')
  @Public()
  health(): { status: string } {
    return { status: 'ok' };
  }
}
```
The proxy controller follows the same `@Public()` pattern. The global prefix `/api` (set in `main.ts:17`) makes the full path `/api/proxy/anthropic`.

**`apps/agent-be/src/config/env.validation.ts` — current schema:**
```typescript
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DAYTONA_API_URL: z.string().optional().default(''),
  DAYTONA_API_KEY: z.string().optional().default(''),
  AUTH_SECRET: z.string().min(1),
});
```
Add `ANTHROPIC_API_KEY: z.string().min(1)` — the key is required (the proxy and the host-based agent execution both need it). Do NOT add `AGENT_WORKDIR` (optional with fallback, DP-5).

**`apps/agent-be/Dockerfile` — runtime stage (lines 17-30):**
```dockerfile
# ── Runtime stage ──
FROM node:24-slim AS runtime
RUN corepack enable && corepack prepare yarn@4.17.0 --activate
WORKDIR /app
COPY --from=build /app/dist/apps/agent-be/ ./
...
RUN yarn install
EXPOSE 3001
HEALTHCHECK ...
CMD ["node", "main.js"]
```
Add `ENV NODE_ENV=production` after the `FROM` line, before `WORKDIR`. Docker `ENV` persists across all subsequent layers and runtime.

**`apps/agent-be/src/streaming/agent.service.ts:90-101` — host-based ANTHROPIC_API_KEY usage:**
```typescript
const agentQuery = query({
  prompt: message,
  options: {
    cwd: process.env.AGENT_WORKDIR ?? tmpdir(),
    abortController,
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    },
    includePartialMessages: true,
  },
});
```
This is the HOST-BASED execution path (Epic 3). It reads `ANTHROPIC_API_KEY` from `process.env` and passes it to the SDK `query()` call. The proxy endpoint (Task 1) is a SEPARATE path for SANDBOX-BASED execution (Epic 6). Do NOT modify this code (DP-5).

**`apps/agent-be/src/sandbox/sandbox.service.ts:22-48` — provision() does NOT inject env vars:**
```typescript
async provision(params: ProvisionParams): Promise<SandboxInfo> {
  ...
  sandbox = await this.daytona.create({
    labels: { conversationId: params.conversationId },
  });
  ...
}
```
`daytona.create()` receives only `labels` — no `env` property. This satisfies NFR-S1. The NFR-S1 regression guard tests verify this. Epic 6 will add `ANTHROPIC_BASE_URL` to the sandbox env (not `ANTHROPIC_API_KEY`).

**`apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts:50-64` — NFR-S1 regression guards (already migrated):**
```typescript
it('calls daytona.create() with only labels — no env, no resources, no metadata', async () => {
  ...
  const createArg = mockDaytona.create.mock.calls[0][0];
  expect(Object.keys(createArg)).toContain('labels');
  expect(Object.keys(createArg)).not.toContain('env');
  expect(Object.keys(createArg)).not.toContain('resources');
  expect(Object.keys(createArg)).not.toContain('metadata');
});
```
Task 8.2 migration is **already applied** — `toHaveProperty` was replaced with `Object.keys()` assertions per the "Secret-aware test assertions" rule. The dev action is to run the tests and verify they still pass.

**Railway GraphQL API — `variableCollectionUpsert` pattern:**
The `railway-project-structure.integration.spec.ts` file shows how to query Railway variables. For SETTING variables, use:
```graphql
mutation {
  variableCollectionUpsert(input: {
    projectId: "30ab04b2-132c-440b-92ca-bc57be294d6f"
    environmentId: "0c3802e5-d0a4-44c0-beec-ed6ff592f5e5"
    serviceId: "4df7d0d1-0040-4395-89c8-bd166c4863cf"
    variables: { DATABASE_URL: "postgresql://..." }
  }) {
    ... on VariableCollection { id }
  }
}
```

**Vercel REST API — env var creation pattern:**
```http
POST https://api.vercel.com/v9/projects/{projectId}/env?teamId={teamId}
Authorization: Bearer ${VERCEL_TOKEN}
Content-Type: application/json

{
  "key": "AUTH_SECRET",
  "value": "...",
  "type": "encrypted",
  "target": ["production"]
}
```

### Project Structure Notes

- The `anthropic-proxy/` module follows the feature-based module pattern (`conversations/`, `sandbox/`, `streaming/`, `credentials/`, `cost-tracking/`). It's a stateless pass-through — no service layer needed, just the controller.
- Integration tests go in `apps/agent-be/test/integration/` (the existing integration test location). Unit tests are co-located with the controller (`anthropic-proxy.controller.spec.ts`).
- The `.env.example` file is at the workspace root. The `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` entries go under a new "LLM / Claude Agent SDK" section.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5] — Story definition and ACs (lines 1023-1050)
- [Source: _bmad-output/planning-artifacts/architecture.md#NFR-S1] — "Platform-internal credentials must not reach Sandbox" (line 54)
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security item 6] — Anthropic API key handling (line 259) — SUPERSEDED by Party Mode resolution
- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment] — Vercel/Railway deployment (lines 282-290)
- [Source: _bmad-output/planning-artifacts/architecture.md#Technical Constraints] — Sandbox initialization sequence (line 80) — `ANTHROPIC_API_KEY` injection superseded
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#lines 123-139] — ANTHROPIC_API_KEY proxy resolution (Party Mode, 2026-07-11)
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#line 7] — NODE_ENV=production deferred from Story 4.3
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#line 358] — ANTHROPIC_API_KEY not in env validation
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#line 392] — NFR-S1 test toHaveProperty migration
- [Source: _bmad-output/test-artifacts/security-test-cases-secrets-sandbox.md] — SEC-002 through SEC-009 security test cases
- [Source: _bmad-output/implementation-artifacts/4-1-provision-the-vercel-project-for-apps-web.md] — Vercel project ID, team ID, production URL
- [Source: _bmad-output/implementation-artifacts/4-2-provision-the-railway-project-with-postgres-for-apps-agent-be.md] — Railway project ID, service IDs, DATABASE_URL
- [Source: _bmad-output/implementation-artifacts/4-3-add-a-dockerfile-for-apps-agent-be.md] — Dockerfile structure, NODE_ENV deferred
- [Source: _bmad-output/implementation-artifacts/4-4-run-prisma-migrations-against-the-railway-postgres-instance.md] — Railway DATABASE_URL, migration confirmation
- [Source: apps/agent-be/src/app/app.module.ts] — Module registration pattern, APP_GUARD order
- [Source: apps/agent-be/src/app/app.controller.ts] — `@Public()` decorator pattern
- [Source: apps/agent-be/src/common/decorators/public.decorator.ts] — `@Public()` implementation
- [Source: apps/agent-be/src/config/env.validation.ts] — Zod env validation schema
- [Source: apps/agent-be/src/config/configuration.ts] — Configuration factory
- [Source: apps/agent-be/src/streaming/agent.service.ts:90-101] — Host-based ANTHROPIC_API_KEY usage (DO NOT MODIFY)
- [Source: apps/agent-be/src/sandbox/sandbox.service.ts:22-48] — provision() — no env vars injected
- [Source: apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts:50-64] — NFR-S1 regression guards (migrate toHaveProperty)
- [Source: apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:22-40,172-203] — Railway token reading + variable query pattern
- [Source: apps/agent-be/Dockerfile] — Multi-stage build, runtime stage
- [Source: .env.example] — Env var documentation
- [Source: .env] — Available secret values (AUTH_SECRET, AUTH_GITHUB_ID, DAYTONA_API_URL, DAYTONA_API_KEY, ANTHROPIC_API_KEY, DATABASE_URL)
- [Source: .env.local] — VERCEL_TOKEN, RAILWAY_TOKEN

### Previous Story Intelligence

This is the fifth story in Epic 4. The previous story (4.4: Run Prisma Migrations Against the Railway Postgres Instance) is complete. Key learnings from Stories 4.1-4.4 that apply here:

- **Railway GraphQL API:** `RAILWAY_TOKEN` in `.env.local` is account/workspace-scoped and works with the GraphQL API at `https://backboard.railway.com/graphql/v2`. The `variables(projectId, environmentId, serviceId)` query returns service variables (may be a JSON string or parsed object — handle both). The `variableCollectionUpsert` mutation sets variables.
- **Vercel REST API:** `VERCEL_TOKEN` in `.env.local` works with the REST API at `https://api.vercel.com`. Team ID: `team_DV9hczWkgqbOEoMGnX9Pta3t`. Project ID: `prj_ih4UAxO759A1CHdrZ93j4rk3poYD`.
- **Secret handling:** Never log the full `DATABASE_URL` connection string (it contains the Postgres password). Record only that it exists and note host:port. The `describeDatabase()` function in `rotate-kek.ts` / `run-migrations.ts` is the canonical pattern. Use `expect(Object.keys(vars)).toContain('KEY')` (NOT `toHaveProperty`) in tests — assertion failures must not dump secret values into CI logs.
- **Idempotency:** Check if env vars already exist before creating them. Vercel: `GET /v9/projects/{projectId}/env` returns existing env vars. Railway: `variables(projectId, environmentId, serviceId)` query returns existing variables. Upsert if they exist, create if they don't.
- **DP-3 pattern:** Pick the simplest reversible option. Reuse local dev secret values for production (MVP single-environment). Generate a new `CREDENTIAL_ENCRYPTION_KEK` only (the local dev value is a placeholder).
- **File preservation:** Explicitly list files NOT to modify and why. This prevents scope creep (DP-5).
- **Test file location:** Integration tests for Railway go in `apps/agent-be/test/integration/`. The existing `railway-project-structure.integration.spec.ts` has the `getRailwayToken()` helper and Railway API query patterns to reuse.

### Git Intelligence

Recent commits (last 5):
```
dd1fbf0 docs(epics): complete story 4.3 dockerfile for agent-be
b52e129 Merge remote-tracking branch 'origin/main' into feat/epic-4
acfaf82 feat(n8n): add session trace recording to develop-story playbook (#23)
8ac530c chore(nx): remove dead n8n nx project wrapper (#24)
0754701 fix(devcontainer): restart n8n after workflow import to register webhooks (#22)
```

The `feat/epic-4` branch is being worked on. Stories 4.1 (Vercel project), 4.2 (Railway project + Postgres), 4.3 (Dockerfile), and 4.4 (Prisma migrations) are complete and committed. The Vercel project exists (`prj_ih4UAxO759A1CHdrZ93j4rk3poYD`, URL: `https://bmad-easy.vercel.app`). The Railway project exists (`30ab04b2-132c-440b-92ca-bc57be294d6f`) with a Postgres service and an agent-be service. Prisma migrations are applied. This story wires the production env vars on both platforms and builds the Anthropic proxy endpoint.

### Latest Technical Information

- **Anthropic API authentication:** The Anthropic API accepts `x-api-key: <key>` header (preferred) or `Authorization: Bearer <key>`. The Claude Agent SDK uses `x-api-key`. The proxy should inject `x-api-key` (not `Authorization: Bearer`) to match the SDK's expectation.
- **Anthropic API streaming:** The API returns SSE streams for streaming requests (`"stream": true`). The proxy must stream the response body without buffering — use `response.body.getReader()` and pipe chunks to `res.write()`. Buffering would break streaming and add latency (NFR-P1: 1,500ms to first token).
- **Node.js `fetch` streaming:** Node 24's native `fetch()` supports streaming via `response.body` (a `ReadableStream`). The `getReader()` API reads chunks incrementally. This is the correct approach for the proxy — no need for `http`/`https` modules or `pipe()`.
- **Vercel env var API:** `POST /v9/projects/{projectId}/env` creates an env var. `PATCH /v9/projects/{projectId}/env/{envId}` updates. `DELETE /v9/projects/{projectId}/env/{envId}` deletes. `GET /v9/projects/{projectId}/env` lists all. The `type` field accepts `"encrypted"` (value encrypted at rest), `"plain"` (visible in dashboard). Use `"encrypted"` for all secrets. The `target` field accepts `["production"]`, `["preview"]`, `["development"]`, or any combination.
- **Railway `variableCollectionUpsert` mutation:** Sets multiple variables at once on a service. Accepts `projectId`, `environmentId`, `serviceId`, and a `variables` map (key-value pairs). Idempotent — re-running with the same values is a no-op. Variables are visible in the Railway dashboard.
- **Docker `ENV` instruction:** `ENV NODE_ENV=production` sets the env var for all subsequent layers and runtime. Persists across container restarts. Does NOT require a rebuild to change (unlike `ARG`). This is the correct approach for `NODE_ENV` — it's a build-time decision that applies to every container start.

### Important Implementation Notes

1. **The proxy is `@Public()` — no boundary JWT.** The sandbox has no credential per the NFR-S1 resolution. Security for MVP: ThrottlerGuard rate limiting (100 req/60s per IP), proxy URL not advertised, proxy only forwards to `api.anthropic.com`. Residual risk (proxy URL discovery) is accepted for MVP. Document this in the architecture doc (separate task).

2. **The proxy must stream responses.** The Claude Agent SDK uses SSE streaming. If the proxy buffers the response, streaming breaks and latency increases (NFR-P1). Use `response.body.getReader()` and pipe chunks to `res.write()`. Do NOT use `response.json()` or `response.text()` — they buffer.

3. **`ANTHROPIC_API_KEY` is consumed by BOTH the proxy AND the host-based agent execution.** The proxy (Task 1) reads it from `process.env` to inject into forwarded requests. The host-based agent execution (`agent.service.ts:97`) reads it from `process.env` to pass to the SDK `query()` call. Both paths use the same Railway env var. No conflict — they're different consumers of the same secret.

4. **`CREDENTIAL_ENCRYPTION_KEK` must be a NEW production value.** The local dev value is a test placeholder (`0000…0000`). Generate with `openssl rand -hex 32` (64 hex chars = 32 bytes = AES-256). If existing OAuth credentials were encrypted with the test KEK, they need re-encryption — but for a fresh production deploy, there are no existing credentials yet (the Railway Postgres was just migrated in Story 4.4, tables are empty). So the new KEK is the production KEK from the start.

5. **`AUTH_URL` must be the production URL.** Set to `https://bmad-easy.vercel.app` (from Story 4.1), NOT `http://localhost:3000` (the local dev value). Auth.js uses `AUTH_URL` for callback URL construction.

6. **`DATABASE_URL` on Vercel must be the Railway Postgres connection string.** NOT the local dev Postgres URL. Fetch it from the Railway GraphQL API (same pattern as Story 4.4). Ensure `sslmode=require` is appended (NFR finding from Story 4.2: no SSL verification on manually constructed DATABASE_URL).

7. **The GitHub OAuth App callback URL update is MANUAL.** No API exists for OAuth App settings. The user must navigate to `github.com/settings/developers` and update the callback URL. Record completion in the Dev Agent Record. The OAuth App ID is `Ov23liwPSopCBFh9nMRN`.

8. **Redeploy agent-be after setting Railway env vars.** Railway env vars take effect on the next deploy. After Task 5, trigger a redeploy via the Railway API (`deploymentRedeploy` mutation) or Railway CLI. The proxy endpoint (Task 1) and the `NODE_ENV=production` Dockerfile change (Task 3) also need a deploy to take effect.

9. **The NFR-S1 regression guard tests already pass.** `sandbox.service.nfr-s1.spec.ts` asserts `daytona.create()` has no `env` property. Task 8.2 migrates the assertion METHOD (from `toHaveProperty` to `Object.keys()`) — the test logic is unchanged. The tests still pass after the migration; they just don't dump secrets on failure.

10. **Do NOT add `ANTHROPIC_BASE_URL` to `SandboxService.provision()`.** The current code doesn't inject any env vars into sandboxes. Adding `ANTHROPIC_BASE_URL` is Epic 6 scope (when sandbox-based execution is implemented). Story 4.5 builds the proxy (so `ANTHROPIC_BASE_URL` has something to point at) and wires `ANTHROPIC_API_KEY` on Railway (for the proxy to consume). Epic 6 will set `ANTHROPIC_BASE_URL` on sandboxes.

### Testing Approach

- **Unit tests (`anthropic-proxy.controller.spec.ts`):** Tests the proxy controller in isolation. Mock `fetch()` via `jest.spyOn(global, 'fetch')`. Verify: key injection, header filtering, status forwarding, body streaming, error handling (503 when key missing), no key leakage in response/logs. Use `@jest-environment node` (the proxy uses `fetch` and streaming, which require the Node environment, not jsdom).

- **NFR-S1 test migration (`sandbox.service.nfr-s1.spec.ts`):** Migrate `toHaveProperty` → `Object.keys()` assertions. No new tests — just safer assertion methods. All existing tests still pass.

- **Integration tests (`platform-env-vars.integration.spec.ts`):** Verifies env vars are set on Vercel and Railway via their APIs. Uses `VERCEL_TOKEN` and `RAILWAY_TOKEN` from `.env.local`. Uses `expect(Object.keys(vars)).toContain('KEY')` (NOT `toHaveProperty`) to avoid dumping secrets on failure. Run via `yarn nx test-integration agent-be -- --testPathPatterns=platform-env-vars`.

- **Manual verification (Task 9):** `curl` the proxy endpoint after deploy to verify it forwards to `api.anthropic.com` correctly. Verify streaming with a `"stream": true` request.

- **No E2E tests.** Browser-level E2E tests cannot verify platform env vars or proxy forwarding. The integration tests and manual verification are the appropriate levels.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### Test Automation Validation (2026-07-12)

**Agent:** Murat (Master Test Architect) — `bmad-testarch-automate` workflow

**Mode:** Validate → Create (coverage gaps found)

#### Skipped Test Outcomes

All 6 `it.skip()` integration tests in `platform-env-vars.integration.spec.ts` were un-skipped and run against live Vercel/Railway APIs.

| Test | Result | Action |
|---|---|---|
| Vercel project has required env vars (AC-1) | FAIL — 0 env vars on Vercel | Re-skipped as expected-to-fail (infrastructure gap, Task 4 not executed) |
| Vercel project does NOT have TEST_ENV (AC-3) | PASS | Kept un-skipped |
| Railway agent-be has required env vars (AC-2) | FAIL — only Railway-injected vars + DATABASE_URL | Re-skipped as expected-to-fail (infrastructure gap, Task 5 not executed) |
| Railway agent-be does NOT have TEST_ENV (AC-3) | PASS | Kept un-skipped |
| CREDENTIAL_ENCRYPTION_KEK is NOT test placeholder (AC-2) | FAIL — KEK undefined | Re-skipped as expected-to-fail (infrastructure gap, Task 5.3 not executed) |
| DATABASE_URL contains sslmode=require (NFR) | FAIL — no sslmode in DATABASE_URL | Re-skipped as expected-to-fail (infrastructure gap, Task 4.3/5.3 not executed) |

**Classification:** All 4 failures are infrastructure gaps, NOT test-quality issues. The tests are correctly written and will pass once env vars are wired (Tasks 4-5). Per DP-5, wiring env vars is outside test automation scope.

#### Expected-to-Fail Records

1. **Vercel env vars (AC-1):** Vercel API returned 0 env vars on project `prj_ih4UAxO759A1CHdrZ93j4rk3poYD` (verified 2026-07-12). Un-skip after Task 4 completion.
2. **Railway env vars (AC-2):** Railway API returned only `RAILWAY_*` injected vars + `DATABASE_URL`. Missing: `CREDENTIAL_ENCRYPTION_KEK`, `DAYTONA_API_URL`, `DAYTONA_API_KEY`, `ANTHROPIC_API_KEY`, `AUTH_SECRET`, `NODE_ENV`. Un-skip after Task 5 completion.
3. **CREDENTIAL_ENCRYPTION_KEK (AC-2):** `railwayVars['CREDENTIAL_ENCRYPTION_KEK']` is `undefined`. Un-skip after Task 5.3 (generate production KEK via `openssl rand -hex 32`).
4. **DATABASE_URL sslmode (NFR):** Railway `DATABASE_URL` is `postgresql://...@tokaido.proxy.rlwy.net:42861/railway` — no `sslmode=require`. Un-skip after Task 4.3/5.3 (append sslmode).

#### Coverage Gaps Filled

Two ACs had no test coverage. Generated 6 new tests (all passing):

1. **AC-6 (NODE_ENV=production in Dockerfile):** Created `apps/agent-be/test/dockerfile-node-env.spec.ts` — 2 P0 tests verifying `ENV NODE_ENV=production` in the Dockerfile runtime stage and its ordering before `CMD`.
2. **AC-7 (ANTHROPIC_API_KEY in env validation):** Created `apps/agent-be/src/config/env.validation.spec.ts` — 4 P0 tests verifying the Zod schema includes `ANTHROPIC_API_KEY` as required (min length 1), accepts valid key, rejects empty string, rejects missing key.

#### Healing Applied

- **dockerfile-node-env.spec.ts:** Initial regex used `\z` (PCRE end-of-string construct) which is invalid in JavaScript regex. Fixed to `([\s\S]*)` to capture the remainder of the Dockerfile after the runtime stage `FROM` line. Test-quality fix, not production code change.

#### Files Modified

| File | Action |
|---|---|
| `apps/agent-be/test/integration/platform-env-vars.integration.spec.ts` | Un-skipped 6 tests, ran them, re-skipped 4 as expected-to-fail with comments. Updated header. |
| `apps/agent-be/test/dockerfile-node-env.spec.ts` | Created — 2 tests for AC-6 |
| `apps/agent-be/src/config/env.validation.spec.ts` | Created — 4 tests for AC-7 |
| `_bmad-output/test-artifacts/automate-validation-report.md` | Created — full validation report |

**Production code modified:** None.

#### Decisions (per decision-policy.md)

**Decision (DP-5):** Wiring env vars on Vercel/Railway (Tasks 4-5) is the story's implementation work, not test automation scope. The 4 failing integration tests are correctly written — they fail because the infrastructure hasn't been configured, not because of test-quality issues. Marking them as expected-to-fail is the correct action.

### Review Findings

**Review date:** 2026-07-12
**Review mode:** full (spec + diff)
**Diff baseline:** `dd1fbf0` (frontmatter `baseline_commit`)
**Layers:** Blind Hunter, Edge Case Hunter, Acceptance Auditor — all completed

#### Patches (applied)

- [x] [Review][Patch] Reader never cancelled on client disconnect; upstream keeps billing Anthropic for unread tokens [`apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts:84-103`]
- [x] [Review][Patch] `content-length` not stripped from forwarded request headers; body re-serialized makes it stale [`apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts:11-16`]
- [x] [Review][Patch] `res.write()` return value ignored; backpressure not honored — OOM under load with slow consumers [`apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts:89-93`]
- [x] [Review][Patch] Mid-stream read errors silently swallowed; no log signal for ops debugging [`apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts:95-96`]
- [x] [Review][Patch] `req.body` truthiness sends spurious `'{}'` body for empty requests; GET/HEAD with body throws TypeError [`apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts:55`]
- [x] [Review][Patch] Token readers don't strip quotes from `.env.local` values — inconsistent with `getDatabaseUrl()` [`apps/agent-be/test/integration/platform-env-vars.integration.spec.ts:44-45,64-65`]
- [x] [Review][Patch] Railway `JSON.parse(variables)` can throw uncaught `SyntaxError` on malformed API response [`apps/agent-be/test/integration/platform-env-vars.integration.spec.ts:111-119`]
- [x] [Review][Patch] Logging test spies on `console.log` instead of NestJS Logger; test is vacuous if Logger doesn't route to console [`apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts:358-372`]

#### Deferred

- [x] [Review][Defer] No timeout/AbortSignal on upstream `fetch` — stalled connections hang indefinitely [`apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts:55`] — deferred: DP-5 scope temptation; SSE needs idle timeout (not total), spec doesn't mention proxy timeout
- [x] [Review][Defer] Whitespace-only `ANTHROPIC_API_KEY` passes `min(1)` validation [`apps/agent-be/src/config/env.validation.ts:8`] — deferred: DP-5 scope expansion; spec explicitly says `min(1)`
- [x] [Review][Defer] Vercel API pagination not handled in integration test [`apps/agent-be/test/integration/platform-env-vars.integration.spec.ts:46-62`] — deferred: DP-4 test-only, ~5 env vars well under page limit
- [x] [Review][Defer] AC-1: Vercel env vars not wired (Task 4 not executed) — deferred: infrastructure work pending; requires human action to wire env vars via Vercel API with real secrets (decision policy: external service calls with side effects must be escalated)
- [x] [Review][Defer] AC-2: Railway env vars not wired (Task 5 not executed) — deferred: same as AC-1; Railway API calls with real secrets; `CREDENTIAL_ENCRYPTION_KEK` not generated

#### Dismissed (4)

- Open unauthenticated proxy (`@Public()`) — spec DP-3 explicitly accepted this risk for MVP (ThrottlerGuard rate limiting, proxy URL not advertised, only forwards to api.anthropic.com)
- `accept-encoding`/`content-encoding` body corruption — false positive; fetch handles decompression correctly per spec's DP-2 analysis
- Multiple `Set-Cookie` header collapse — no practical impact; Anthropic API doesn't return `Set-Cookie`
- Out-of-scope Story 4.4 changes in diff — diff baseline scope issue (baseline commit predates Story 4.4 commit), not a code defect

#### NFR Audit Findings (2026-07-12) — ALL RESOLVED

**Audit:** `bmad-testarch-nfr` Create mode — NFR-specific issues only (performance, security, reliability, test fidelity)
**Auditor:** Reviewer (independent adversarial review)
**Scope:** `anthropic-proxy.controller.ts`, `anthropic-proxy.controller.spec.ts`, `env.validation.ts`, `Dockerfile`, `platform-env-vars.integration.spec.ts`
**Status:** All 4 findings resolved (2026-07-13). Fixes applied to controller and test file. All 13 tests pass.

---

**NFR-1: Missing SSE proxy headers on responses** — RESOLVED

- **Severity:** High
- **NFRs affected:** NFR-P1 (first token ≤ 1500ms), NFR-R3 (SSE back-pressure), NFR-S1 (security)
- **Location:** `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts:86-91`
- **Evidence:** The proxy forwards upstream response headers (`upstream.headers.forEach`) but never sets `X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`, or `X-Content-Type-Options: nosniff`. The codebase's own SSE pattern (`StreamingController` at `streaming.controller.ts:70-74`) sets all four headers explicitly on every SSE response. `X-Accel-Buffering: no` is the load-bearing one — it disables Nginx/reverse-proxy buffering. Railway fronts `apps/agent-be` with an HTTP/2 reverse proxy (architecture.md deployment invariant for NFR-R4); without this header, the proxy may buffer SSE chunks, breaking streaming and adding latency that eats into the NFR-P1 1,500ms budget. `Cache-Control: no-cache, no-transform` prevents intermediary caching of SSE responses. `X-Content-Type-Options: nosniff` prevents MIME-sniffing. The upstream (Anthropic API) does not set these proxy-level headers — they are the proxy's responsibility, not the origin's.
- **Remediation:** After `res.status(upstream.status)` and before/after the `upstream.headers.forEach` loop, add:
  ```typescript
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  ```
  Set them AFTER the `forEach` loop so upstream values cannot overwrite them (or guard the loop to skip these keys). Add a unit test asserting these headers are present on the response.
- **Resolution (2026-07-13):** Added all 3 headers after the `forEach` loop in `anthropic-proxy.controller.ts`. Added 2 unit tests: (1) verifies all 3 headers are present on the response, (2) verifies they override upstream values. Both tests pass.

---

**NFR-2: Event listener accumulation in backpressure handler** — RESOLVED

- **Severity:** Medium
- **NFRs affected:** NFR-R3 (reliability under back-pressure)
- **Location:** `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts:117-120`
- **Evidence:** Each backpressure cycle registers two `once` listeners:
  ```typescript
  await new Promise<void>((resolve) => {
    res.once('drain', resolve);
    req.once('close', resolve);
  });
  ```
  If `drain` fires first, the `close` listener on `req` is NOT removed — `once` auto-removes only after the listener fires. Over a long SSE stream with N backpressure cycles (slow consumer, exactly the NFR-R3 scenario), N `close` listeners accumulate on `req`, each holding a closure reference. This is a memory leak that manifests under the exact conditions NFR-R3 is designed to handle. The `StreamingController` avoids this pattern entirely (uses a single `cleanupBackPressure()` helper, not per-cycle listener registration).
- **Remediation:** Clean up the losing listener when the winner fires. Use named handlers and `removeListener`:
  ```typescript
  await new Promise<void>((resolve) => {
    const onDrain = () => { req.removeListener('close', onClose); resolve(); };
    const onClose = () => { res.removeListener('drain', onDrain); resolve(); };
    res.once('drain', onDrain);
    req.once('close', onClose);
  });
  ```
- **Resolution (2026-07-13):** Replaced anonymous `once` listeners with named handlers (`onDrain`/`onClose`) that call `removeListener` on the losing handler. The NFR-4 backpressure test exercises this code path with a real EventEmitter and passes.

---

**NFR-3: Streaming test provides false confidence (NFR-P1 test fidelity)** — RESOLVED

- **Severity:** Medium
- **NFRs affected:** NFR-P1 (streaming, no buffering)
- **Location:** `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts:179-187`
- **Evidence:** The test `[P0] streams the response body (does not buffer)` asserts only `expect(written.length).toBeGreaterThanOrEqual(2)`. The mock `res.write()` (line 82-85) pushes to a `written` array synchronously — it captures all writes regardless of when they occur. A buffering implementation (read all chunks, then write them all at the end) would pass this test. The test name claims "does not buffer" but the assertion proves only that multiple chunks were written, not that they were written incrementally before the stream completed. A regression that introduces buffering would pass silently — false green.
- **Remediation:** Add a test that proves incremental delivery: mock `reader.read()` to return the first chunk, then delay the second chunk behind a `setTimeout`/microtask. Assert `res.write()` is called with the first chunk BEFORE the second `reader.read()` call returns. This proves the proxy writes chunks as they arrive, not after the upstream stream completes.
- **Resolution (2026-07-13):** Added `[P0] writes each chunk before reading the next — proves no buffering` test. Tracks call order of `reader.read()` and `res.write()` calls. Asserts `firstWriteIdx < secondReadIdx` — the first write happens before the second read, proving incremental delivery. A buffering implementation would fail this test. Test passes.

---

**NFR-4: No backpressure test coverage (NFR-R3 test fidelity)** — RESOLVED

- **Severity:** Medium
- **NFRs affected:** NFR-R3 (SSE back-pressure — pause emission when client is slow)
- **Location:** `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts:82-85` (mock); `anthropic-proxy.controller.ts:113-121` (untested code path)
- **Evidence:** The `res.write()` mock always returns `true` (line 84: `return true;`). The production code's backpressure path (`if (!canWrite)` at controller line 113) is never exercised by any test. NFR-R3 requires the transport to "pause token emission until the client is ready" — the proxy's implementation of this (waiting for `drain` before reading more from upstream) has zero test coverage. A regression that removes the backpressure check entirely would pass all existing tests.
- **Remediation:** Add a test where `res.write()` returns `false` on the first call. Verify `reader.read()` is not called again until `res` emits `drain`. Verify the proxy does not read ahead and buffer when the consumer is slow. This directly tests the NFR-R3 invariant.
- **Resolution (2026-07-13):** Added `[P0] pauses upstream reads when res.write() returns false, resumes on drain` test. Uses EventEmitter-backed `res` and `req` mocks. `res.write()` returns `false` on the first call. Asserts `readCount === 1` after `setImmediate` (proxy is paused waiting for `drain`). Emits `drain`, then asserts `readCount >= 2` after proxy completes. Directly tests the NFR-R3 invariant. Test passes.

### File List

## Suggested Review Order

**NFR-1: SSE proxy headers**

- SSE headers set after upstream forEach — prevents reverse-proxy buffering on Railway
  [`anthropic-proxy.controller.ts:93`](../../apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts#L93)

- Override test: mock normalizes keys to lowercase, explicit headers overwrite upstream
  [`anthropic-proxy.controller.spec.ts:267`](../../apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts#L267)

**NFR-2: Backpressure listener cleanup**

- Named handlers + removeListener — prevents close-listener accumulation across N cycles
  [`anthropic-proxy.controller.ts:130`](../../apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts#L130)

- listenerCount assertion — verifies onClose removed after drain fires
  [`anthropic-proxy.controller.spec.ts:431`](../../apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts#L431)

**NFR-3: Incremental streaming proof**

- Call-order tracking — first write before second read proves no buffering
  [`anthropic-proxy.controller.spec.ts:292`](../../apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts#L292)

**NFR-4: Backpressure test**

- EventEmitter-backed mocks — res.write() returns false, reader pauses until drain
  [`anthropic-proxy.controller.spec.ts:339`](../../apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts#L339)
