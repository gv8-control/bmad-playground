---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04c-aggregate
lastStep: step-04c-aggregate
lastSaved: '2026-07-12'
workflowType: testarch-atdd
storyId: '4.5'
storyKey: 4-5-wire-environment-variables-and-secrets-on-both-platforms
storyFile: _bmad-output/implementation-artifacts/4-5-wire-environment-variables-and-secrets-on-both-platforms.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-4-5-wire-environment-variables-and-secrets-on-both-platforms.md
generatedTestFiles:
  - apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts
  - apps/agent-be/test/integration/platform-env-vars.integration.spec.ts
  - apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts
  - apps/agent-be/src/anthropic-proxy/anthropic-proxy.module.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/4-5-wire-environment-variables-and-secrets-on-both-platforms.md
  - _bmad-output/project-context.md
  - _bmad-output/decision-policy.md
  - apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts
  - apps/agent-be/test/integration/railway-project-structure.integration.spec.ts
  - apps/agent-be/src/streaming/streaming.controller.spec.ts
  - apps/agent-be/src/app/app.module.ts
  - apps/agent-be/src/config/env.validation.ts
  - apps/agent-be/Dockerfile
---

# ATDD Checklist - Epic 4, Story 4.5: Wire Environment Variables and Secrets on Both Platforms

**Date:** 2026-07-12
**Author:** Marius
**Primary Test Level:** Unit (proxy controller) + Integration (platform env vars)

---

## Story Summary

Wire all required secrets on Vercel and Railway, build the Anthropic proxy endpoint (NFR-S1 compliance), and add ANTHROPIC_API_KEY to env validation so both services run with correct production configuration.

**As a** platform operator
**I want** all required secrets set on Vercel and Railway
**So that** both services run with the correct production configuration

---

## Acceptance Criteria

1. **AC-1 (Vercel env vars present):** `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_URL`, `DATABASE_URL` present as production-scoped env vars on Vercel.
2. **AC-2 (Railway env vars present):** `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK`, `DAYTONA_API_URL`, `DAYTONA_API_KEY`, `ANTHROPIC_API_KEY` present on agent-be Railway service.
3. **AC-3 (TEST_ENV absent):** `TEST_ENV` confirmed absent on both platforms.
4. **AC-4 (GitHub OAuth App callback URL):** OAuth App callback URL updated to production `*.vercel.app` domain (manual).
5. **AC-5 (Anthropic proxy endpoint — NFR-S1):** Proxy forwards to `api.anthropic.com` with injected `x-api-key`, never leaks key, supports SSE streaming, registered as `@Public()`.
6. **AC-6 (NODE_ENV=production in Dockerfile):** `NODE_ENV=production` set in Dockerfile runtime stage.
7. **AC-7 (ANTHROPIC_API_KEY in env validation):** `ANTHROPIC_API_KEY` validated as present (min length 1) in Zod env schema.

---

## Story Integration Metadata

- **Story ID:** `4.5`
- **Story Key:** `4-5-wire-environment-variables-and-secrets-on-both-platforms`
- **Story File:** `_bmad-output/implementation-artifacts/4-5-wire-environment-variables-and-secrets-on-both-platforms.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-4-5-wire-environment-variables-and-secrets-on-both-platforms.md`
- **Generated Test Files:**
  - `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts` (unit — 13 tests, all passing)
  - `apps/agent-be/test/integration/platform-env-vars.integration.spec.ts` (integration — 6 tests, 2 passing, 4 skipped pending infrastructure)
  - `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts` (implemented)
  - `apps/agent-be/src/anthropic-proxy/anthropic-proxy.module.ts` (implemented)

---

## Red-Phase Test Scaffolds Created

### Unit Tests — AnthropicProxyController (13 tests, all passing)

**File:** `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts`

**Stub file:** `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts` (implemented)

**Environment:** `@jest-environment node` (proxy uses `fetch` and streaming)

#### [P0] x-api-key header injection (AC-5)

- **[P0] injects x-api-key header from process.env.ANTHROPIC_API_KEY into the forwarded request**
  - **Status:** PASS
  - **Verifies:** AC-5 (proxy injects `x-api-key` header from env var)

- **[P0] returns 503 when ANTHROPIC_API_KEY is not set**
  - **Status:** PASS
  - **Verifies:** AC-5 (graceful failure when key missing)

#### [P0] header filtering — credential isolation (AC-5, NFR-S1)

- **[P0] does NOT forward authorization, x-api-key (from client), host, or cookie headers**
  - **Status:** PASS
  - **Verifies:** AC-5 (client-provided credentials are stripped; proxy overwrites with its own key)

#### [P0] response forwarding (AC-5)

- **[P0] forwards the response status code and body**
  - **Status:** PASS
  - **Verifies:** AC-5 (response status and body forwarded to client)

- **[P0] streams the response body (does not buffer)**
  - **Status:** PASS
  - **Verifies:** AC-5 (SSE streaming — `getReader()` + `res.write()`, no buffering)

- **[P0] never includes the API key in the response body or headers**
  - **Status:** PASS
  - **Verifies:** AC-5, NFR-S1 (credential-isolation invariant — key never leaks in response)

#### [P0] request forwarding (AC-5)

- **[P0] forwards query string parameters**
  - **Status:** PASS
  - **Verifies:** AC-5 (query string forwarded from original request)

- **[P0] forwards the request body to the upstream Anthropic API (POST body reaches fetch())**
  - **Status:** PASS
  - **Verifies:** AC-5 (request body forwarded to upstream)

#### [P1] logging (AC-5)

- **[P1] logs at debug level only (no key, no body, no response content)**
  - **Status:** PASS
  - **Verifies:** AC-5 (no sensitive data in logs)

#### [P0] NFR audit fix tests (NFR-1, NFR-3, NFR-4 — added 2026-07-13)

- **[P0] sets X-Accel-Buffering, Cache-Control, and X-Content-Type-Options on the response**
  - **Status:** PASS
  - **Verifies:** NFR-1 fix — SSE proxy headers present on response (NFR-P1, NFR-R3, NFR-S1)

- **[P0] SSE proxy headers override upstream values (set after forEach loop)**
  - **Status:** PASS
  - **Verifies:** NFR-1 fix — explicit proxy headers take precedence over upstream values

- **[P0] writes each chunk before reading the next — proves no buffering**
  - **Status:** PASS
  - **Verifies:** NFR-3 fix — incremental streaming proven by call-order assertion (first write before second read)

- **[P0] pauses upstream reads when res.write() returns false, resumes on drain**
  - **Status:** PASS
  - **Verifies:** NFR-4 fix — backpressure path exercised with EventEmitter-backed mocks; reader pauses until `drain` fires

### Integration Tests — Platform Env Vars (6 tests)

**File:** `apps/agent-be/test/integration/platform-env-vars.integration.spec.ts`

**Status (validated 2026-07-12):** 2 PASS, 4 EXPECTED-TO-FAIL (infrastructure gaps)

#### [P0] Vercel env vars (AC-1, AC-3)

- **[P0] Vercel project has AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, AUTH_URL, DATABASE_URL as production env vars**
  - **Status:** EXPECTED-TO-FAIL — Vercel API returned 0 env vars (Task 4 not executed). Infrastructure gap, not test-quality. Re-skipped with comment.
  - **Verifies:** AC-1 (all required Vercel env vars present as production-scoped)

- **[P0] Vercel project does NOT have TEST_ENV**
  - **Status:** PASS
  - **Verifies:** AC-3 (TEST_ENV absent on Vercel)

#### [P0] Railway agent-be env vars (AC-2, AC-3, AC-6)

- **[P0] Railway agent-be service has DATABASE_URL, CREDENTIAL_ENCRYPTION_KEK, DAYTONA_API_URL, DAYTONA_API_KEY, ANTHROPIC_API_KEY, AUTH_SECRET, NODE_ENV**
  - **Status:** EXPECTED-TO-FAIL — Railway API returned only Railway-injected vars + DATABASE_URL (Task 5 not executed). Infrastructure gap, not test-quality. Re-skipped with comment.
  - **Verifies:** AC-2 (all required Railway env vars present), AC-6 (NODE_ENV=production)

- **[P0] Railway agent-be service does NOT have TEST_ENV**
  - **Status:** PASS
  - **Verifies:** AC-3 (TEST_ENV absent on Railway)

- **[P0] CREDENTIAL_ENCRYPTION_KEK is NOT the test placeholder (verify length is 64 hex chars)**
  - **Status:** EXPECTED-TO-FAIL — KEK is undefined on Railway (Task 5.3 not executed). Infrastructure gap, not test-quality. Re-skipped with comment.
  - **Verifies:** AC-2 (production KEK is a new value, not the `0000…0000` placeholder)

- **[P0] DATABASE_URL on both platforms contains sslmode=require**
  - **Status:** EXPECTED-TO-FAIL — Railway DATABASE_URL lacks sslmode=require (Task 4.3/5.3 not executed). Infrastructure gap, not test-quality. Re-skipped with comment.
  - **Verifies:** NFR finding from Story 4.2 (SSL verification on DATABASE_URL)

### New Tests Generated (AC-6, AC-7 — coverage gaps filled)

**File:** `apps/agent-be/test/dockerfile-node-env.spec.ts` (NEW — AC-6)
- **[P0] Dockerfile runtime stage sets ENV NODE_ENV=production** — PASS
- **[P0] ENV NODE_ENV=production appears before CMD in runtime stage** — PASS

**File:** `apps/agent-be/src/config/env.validation.spec.ts` (NEW — AC-7)
- **[P0] envSchema includes ANTHROPIC_API_KEY as required field** — PASS
- **[P0] validateEnv accepts a valid ANTHROPIC_API_KEY** — PASS
- **[P0] validateEnv rejects empty ANTHROPIC_API_KEY** — PASS
- **[P0] validateEnv rejects missing ANTHROPIC_API_KEY** — PASS

### NFR-S1 Spec Migration (Task 8.2 — ACTIVE, not red-phase)

**File:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts`

**Change:** Migrated 4 assertions from `toHaveProperty` / `not.toHaveProperty` to `Object.keys()` / `.toContain()` / `.not.toContain()` per the "Secret-aware test assertions" rule in `project-context.md`.

- Line 60: `expect(createArg).toHaveProperty('labels')` → `expect(Object.keys(createArg)).toContain('labels')`
- Line 61: `expect(createArg).not.toHaveProperty('env')` → `expect(Object.keys(createArg)).not.toContain('env')`
- Line 62: `expect(createArg).not.toHaveProperty('resources')` → `expect(Object.keys(createArg)).not.toContain('resources')`
- Line 63: `expect(createArg).not.toHaveProperty('metadata')` → `expect(Object.keys(createArg)).not.toContain('metadata')`

**Rationale:** `toHaveProperty` dumps the full object on failure. If a regression introduces `env: { ANTHROPIC_API_KEY: ... }`, the assertion failure would print the API key into CI logs. `Object.keys()` prints keys only, never values.

**Status:** ACTIVE — these tests already pass. The migration changes the assertion method, not the test logic.

---

## E2E Coverage Deferral Check

**Per ATDD workflow requirement:** Before deferring E2E coverage, verify no browser-level mock pattern can simulate the scenario.

| AC | Browser mock possible? | Reason |
|---|---|---|
| AC-1 (Vercel env vars) | No | Platform-level config via Vercel REST API. No browser interaction. |
| AC-2 (Railway env vars) | No | Platform-level config via Railway GraphQL API. No browser interaction. |
| AC-3 (TEST_ENV absent) | No | Platform-level config verification. No browser interaction. |
| AC-4 (OAuth callback URL) | No | Manual GitHub settings page. No API exists. |
| AC-5 (Anthropic proxy) | No | Proxy is `@Public()` on agent-be (backend). The proxy's security invariants (key injection, header filtering, no key leakage) are HTTP-level concerns, not browser-level. A browser test would need the Railway URL (not deployed yet) and could only verify forwarding, not key injection (the key is server-side only). Unit tests with mocked `fetch()` cover all proxy ACs. |
| AC-6 (NODE_ENV in Dockerfile) | No | Docker build config. No browser interaction. |
| AC-7 (ANTHROPIC_API_KEY env validation) | No | Backend boot-time Zod validation. No browser interaction. |

**Conclusion:** No browser-level mock pattern can simulate any of the 7 ACs. E2E coverage is deferred. All ACs are covered by unit tests (AC-5, AC-7) and integration tests (AC-1, AC-2, AC-3, AC-6). AC-4 is manual by nature (no API exists for GitHub OAuth App settings).

---

## Regression Guard Template Check (External Commands with User-Controlled Input)

**Per ATDD workflow requirement:** When creating regression guards for code that executes external commands with user-controlled input, apply a uniform guard template to every call site.

### Proxy Controller (AC-5)

The proxy controller does NOT execute external shell commands. It uses `fetch()` for HTTP forwarding. The "external command" guard template (credential-isolation in command arguments + input-injection quoting) does not apply to HTTP forwarding.

However, the proxy has analogous security invariants covered by the unit tests:
- **Credential-isolation:** `x-api-key` header injected from server-side env var, never forwarded from client. Client-provided `authorization`, `x-api-key`, `host`, `cookie` headers stripped. API key never appears in response body, response headers, or logs.
- **Input-injection analog:** The proxy constructs `https://api.anthropic.com/${req.params.path}` — user-controlled path segments in a URL. This is an SSRF concern, not a shell-injection concern. The proxy only forwards to `api.anthropic.com` (not an open proxy), which is the SSRF mitigation. No shell quoting applies.

### SandboxService (NFR-S1 spec — existing guards)

The existing `sandbox.service.nfr-s1.spec.ts` already has credential-isolation regression guards for `executeCommand` call sites:
- `injectGitConfig()` — no credentials in command string
- `commit()` — no credentials in command string
- `listSkills()` — no credential interpolation

**Decision (DP-5):** Adding input-injection regression guards (malicious input quoting tests) to the NFR-S1 spec is scope temptation. Task 8.2 only migrates assertion methods. The `shellQuote` helper was introduced in Story 3.6 and its input-injection guards belong in that story's test scope. Defer, don't expand.

---

## Decisions (per decision-policy.md)

**Decision (DP-4):** Created stub files (`anthropic-proxy.controller.ts`, `anthropic-proxy.module.ts`) as test seams so the red-phase spec file can import the controller. The stub throws "Not implemented" — when a dev activates a test (removes `it.skip()`), the test fails because the stub doesn't implement the behavior. This is the standard ATDD red-phase pattern. Test-only changes with no production behavior change.

**Decision (DP-5):** Did NOT add input-injection regression guards to the NFR-S1 spec. Task 8.2 only migrates assertion methods (toHaveProperty → Object.keys). Adding new test cases for `shellQuote` input-injection is scope temptation — the `shellQuote` helper was validated in Story 3.6. Defer.

**Decision (DP-5):** Did NOT modify `railway-project-structure.integration.spec.ts` to fix the `toHaveProperty` → `Object.keys()` issue (deferred-work.md line 390). The story explicitly states env var verification tests go in a NEW file. The existing file's `toHaveProperty` issue is deferred.

**Decision (DP-3):** Used `it.skip()` (Jest) instead of `test.skip()` (Playwright) for red-phase scaffolds because the project uses Jest for unit/integration tests. The ATDD workflow template uses Playwright's `test.skip()`, but the project's actual test framework is Jest. The simplest option that matches the codebase.

---

## Implementation Checklist

### Test: anthropic-proxy.controller.spec.ts (9 tests)

**File:** `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts`

**Controller:** `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.ts`

**Tasks completed:**

- [x] Implement `AnthropicProxyController.proxy()` method (Story Task 1.2)
- [x] Create `AnthropicProxyModule` and register in `AppModule.imports` (Story Task 1.1)
- [x] Add `ANTHROPIC_API_KEY: z.string().min(1)` to env validation (Story Task 2.1)
- [x] Remove `it.skip()` from the x-api-key injection tests (2 tests)
- [x] Remove `it.skip()` from the header filtering tests (1 test)
- [x] Remove `it.skip()` from the response forwarding tests (3 tests)
- [x] Remove `it.skip()` from the request forwarding tests (2 tests)
- [x] Remove `it.skip()` from the logging test (1 test)
- [x] Run: `yarn nx test agent-be -- --testPathPatterns=anthropic-proxy`
- [x] All 9 tests pass

### Test: platform-env-vars.integration.spec.ts (6 tests)

**File:** `apps/agent-be/test/integration/platform-env-vars.integration.spec.ts`

**Tasks to make tests pass:**

- [ ] Wire Vercel env vars via REST API (Story Task 4)
- [ ] Wire Railway env vars via GraphQL API (Story Task 5)
- [ ] Generate production `CREDENTIAL_ENCRYPTION_KEK` via `openssl rand -hex 32` (Story Task 5.3)
- [ ] Ensure `sslmode=require` on `DATABASE_URL` (Story Task 4.3, 5.3)
- [ ] Remove `it.skip()` from Vercel env vars tests (2 tests)
- [ ] Remove `it.skip()` from Railway env vars tests (4 tests)
- [ ] Run: `yarn nx test-integration agent-be -- --testPathPatterns=platform-env-vars`
- [ ] All 6 tests pass (green phase)

### Test: sandbox.service.nfr-s1.spec.ts (migration — ACTIVE)

**File:** `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts`

**Status:** Migration complete. Tests pass.

- [x] Migrate `toHaveProperty` → `Object.keys()` (4 assertions)
- [x] Run: `yarn nx test agent-be -- --testPathPatterns=nfr-s1`
- [x] All existing tests still pass (24 tests)

---

## Running Tests

```bash
# Run proxy controller unit tests (after removing skips)
yarn nx test agent-be -- --testPathPatterns=anthropic-proxy

# Run platform env vars integration tests (after removing skips)
yarn nx test-integration agent-be -- --testPathPatterns=platform-env-vars

# Run NFR-S1 regression guards (migration verification)
yarn nx test agent-be -- --testPathPatterns=nfr-s1

# Run all agent-be unit tests
yarn nx test agent-be

# Run all agent-be integration tests
yarn nx test-integration agent-be
```

---

## Implementation Progress

### Unit Tests — Proxy Controller (COMPLETE)

- 9 unit tests implemented and passing (proxy controller)
- 4 NFR-S1 assertions migrated (active — tests pass)
- 2 stub files implemented (controller + module)
- E2E deferred with recorded justification (no browser mock covers any AC)

### Integration Tests — Platform Env Vars (PENDING)

- 4 integration tests still skipped (pending env var wiring — Tasks 4-5); 2 active and passing (TEST_ENV absent on both platforms)
- Requires VERCEL_TOKEN and RAILWAY_TOKEN in `.env.local`
- Requires env vars to be wired on Vercel and Railway before un-skipping

---

## Notes

- The proxy controller is implemented and all 9 unit tests pass.
- The integration tests require `VERCEL_TOKEN` and `RAILWAY_TOKEN` in `.env.local`. They make real API calls to Vercel and Railway — they are NOT mocked.
- The NFR-S1 migration is complete — tests use safer assertion methods (`Object.keys()` instead of `toHaveProperty`).
- The `railway-project-structure.integration.spec.ts` file still has `toHaveProperty` on line 200 (deferred-work.md line 390). This is intentionally NOT fixed per the story scope (DP-5).

---

**Generated by BMad TEA Agent** — 2026-07-12
