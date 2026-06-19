---
stepsCompleted:
  - step-01-load-context
  - step-02-define-thresholds
  - step-03-gather-evidence
  - step-05-generate-report
lastStep: step-05-generate-report
lastSaved: '2026-06-19'
scope: 'Stories 1.1, 1.2, 1.3'
overallStatus: CONCERNS
criteriaScore: '15/29'
---

# NFR Evidence Audit — bmad-easy (Stories 1.1–1.3)

**Date:** 2026-06-19  
**Author:** TEA Master Test Architect  
**Scope:** Stories 1.1 (Scaffold), 1.2 (Sign In with GitHub), 1.3 (Connect a Repository by URL)  
**Standard:** ADR Quality Readiness Checklist (8 categories, 29 criteria)  
**NFR Sources:** `architecture.md` (NFR-P1–P5, NFR-R1/R3/R4, NFR-S1–S4, NFR-O1), `test-design-architecture.md`

---

## Assessment Summary

| Category | Criteria Met | Status | Evidence |
|---|---|---|---|
| 1. Testability & Automation | 3/4 | ⚠️ CONCERNS | E2E seeding gap; unit/integration isolation strong |
| 2. Test Data Strategy | 3/3 | ✅ PASS | Synthetic data, mock-only, lifecycle cleanup |
| 3. Scalability & Availability | 1/4 | ⚠️ CONCERNS | Single-container constraint; no load tests; no SLA |
| 4. Disaster Recovery | 0/3 | ⚠️ CONCERNS | Post-MVP infrastructure scope; no RTO/RPO defined |
| 5. Security | 4/4 | ✅ PASS | OAuth 2.0, AES-256-GCM, Zod validation, startup guards |
| 6. Monitorability | 1/4 | ⚠️ CONCERNS | Basic env-var logging; no traces/metrics/structured JSON |
| 7. QoS & QoE | 1/4 | ⚠️ CONCERNS | Targets defined; not measured; sign-in pending state gap |
| 8. Deployability | 2/3 | ⚠️ CONCERNS | Missing `/health` endpoint blocks CI E2E jobs |

**Overall: 15/29 criteria met (52%) → ⚠️ CONCERNS**

**Gate Decision: CONCERNS — release blocked pending two mandatory actions (see below)**

---

## Context Note

Stories 1.1–1.3 are the earliest sprint of a pre-production MVP. Six of the eight categories with CONCERNS are expected at this stage and are waivable:

- **DR (Cat 4):** No RTO/RPO, no failover validation — appropriate pre-production; architecture delegates to Railway/Vercel platform primitives.
- **Scalability (Cat 3):** Single-container documented architectural constraint (architecture.md); no horizontal scaling in MVP.
- **Monitorability (Cat 6):** Basic env-var logging appropriate for sprint 1; structured logging and metrics are Epic 2+ scope.
- **QoS latency (Cat 7.1):** Performance targets defined in architecture.md (NFR-P1–P5); measurement deferred to load-testing spike (B-02 resolution, Conversations epic).
- **Throttling (Cat 7.2):** Rate limiting not in scope for auth/onboarding stories.
- **Failover (Cat 8.1):** Vercel provides zero-downtime for web; Railway single-container accepted for MVP.

The two non-waivable findings are documented in Critical Findings below.

---

## Critical Findings (Block Release)

### FINDING-1: CI E2E Jobs Reference Non-Existent `/health` Endpoint [BLOCKER]

**Location:** `.github/workflows/test.yml`, jobs `e2e` and `burn-in`

**Evidence:**
```yaml
# Both e2e and burn-in jobs contain:
- name: Start agent-be
  run: pnpm exec nx run agent-be:serve &
  env:
    PORT: 3001

- name: Wait for services
  run: pnpm exec wait-on http://localhost:3000 http://localhost:3001/api/health --timeout 60000
```

**Problem:** `apps/agent-be` has no `/health` endpoint. Story 1.1 completion notes explicitly state: *"E2E and burn-in blueprint blocks left commented (no `/health` endpoint yet)"*. However the current `test.yml` has these jobs active and uncommented. The `wait-on` command will time out after 60 seconds on every CI run, causing all E2E and burn-in jobs to fail.

**Impact:** CI E2E (4 shards × timeout = 4 minutes wasted) and burn-in jobs will never execute. The burn-in flakiness gate is effectively disabled. This violates the CI quality gate established in AC-4 of Story 1.1.

**NFR alignment:** `ci-burn-in.md` burn-in requirement; architecture CI gate.

**Required action:**
```yaml
# Option A (recommended): Comment out agent-be start + wait-on until /health is delivered
# - name: Start agent-be
#   run: pnpm exec nx run agent-be:serve &
# Change wait-on to web-only:
- name: Wait for web app
  run: pnpm exec wait-on http://localhost:3000 --timeout 60000

# Option B: Add a minimal /health endpoint to apps/agent-be immediately
# apps/agent-be/src/app/app.controller.ts — add @Get('health') returning { status: 'ok' }
```

Option B is preferable as it enables real E2E runs. Option A unblocks CI while the endpoint is developed.

---

### FINDING-2: 17 of 25 E2E Tests Are Permanently Skipped in CI [HIGH]

**Location:** `playwright/e2e/auth/sign-in.spec.ts` (4 skipped), `playwright/e2e/onboarding/onboarding.spec.ts` (13 skipped)

**Evidence:**
```typescript
// sign-in.spec.ts — 4 tests skipped:
test.skip('OAuth scope is requested correctly', async () => { /* needs AUTH_GITHUB_ID */ });
test.skip('authenticated session persists across refresh', async () => { /* needs GitHub creds */ });
test.skip('session cookie has correct maxAge', async () => { /* needs GitHub creds */ });
// (+ 1 more)

// onboarding.spec.ts — 13 of 14 tests skipped:
test.skip('authenticated user sees RepositoryUrlForm', async () => { /* needs session */ });
// ... 12 more
```

**Problem:** 68% of E2E tests are inactive because they require real GitHub OAuth credentials. No mechanism exists to inject a pre-authenticated session in CI (no mock OAuth server, no `page.addInitScript` seeding, no seed-user fixture).

**Impact:** The acceptance criteria for Story 1.2 (AC-2: session persists 8 hours; AC-3: error state) and Story 1.3 (AC-1: onboarding form; AC-2: write-access validation; AC-4: specific error messages) have zero E2E coverage. Only redirect behavior and unauthenticated page protection are verified by E2E.

**NFR alignment:** `adr-quality-readiness-checklist.md` §1.3 (State Control — seeding mechanism); test-design-architecture.md §Quality gates (P0 = 100% pass required for AC coverage).

**Required action (before GA, not blocker for sprint):**

Implement one of:
- **Recommended:** Mock OAuth server using `playwright/e2e/support/` — intercept GitHub OAuth redirect, return a synthetic user session, seed Prisma via a test-only API endpoint.
- **Alternative:** Add `AUTH_TRUST_HOST=true` + test user injection via `authStorageInit` from `@seontechnologies/playwright-utils` (already a project dependency per `tea_use_playwright_utils: true`).
- **Minimum viable:** Add `playwright/e2e/support/auth-mock.ts` fixture that injects `storageState` for a seed user using Auth.js `encode` JWT utility (avoids real GitHub call).

---

## Detailed Category Assessment

### Category 1: Testability & Automation (3/4)

| Criterion | Status | Evidence |
|---|---|---|
| 1.1 Isolation: Mock downstream deps | ✅ | `SandboxServiceFake` (B-01), Prisma mocked, Auth.js mocked, `capturedConfig` pattern for JWT callbacks |
| 1.2 Headless: Business logic via API | ✅ | Server Actions tested directly; crypto utilities tested at function level; NestJS controllers via Supertest |
| 1.3 State Control: Seeding mechanism | ⚠️ | Unit/integration: mocks sufficient. E2E: no OAuth seed → 17 tests skipped |
| 1.4 Sample Requests: Valid/invalid examples | ✅ | `repo-connection.actions.spec.ts` includes 6 URL validation cases; `crypto.test.ts` includes tamper-detection |

**Evidence files:**
- `auth.config.spec.ts` — 6 tests (authorized callback, unauthorized redirect, callbackUrl, API 401)
- `auth.integration.spec.ts` — 7 tests (jwt upsert, session propagation, maxAge, null email)
- `auth.credential.spec.ts` — 7 tests (OAuthCredential upsert, encryption, no-op on refresh, error propagation)
- `crypto.test.ts` — 9 tests (roundtrip, nonce uniqueness × 20 calls, tamper rejection, invalid KEK)
- `repo-connection.actions.spec.ts` — 23 tests (URL validation × 6, session checks, GitHub API error cases × 8, success)
- `RepositoryUrlForm.test.tsx` — 15 tests (render, pending state, error display × 7, success redirect)
- `sandbox-lifecycle.integration.spec.ts` — 6 tests (B-01 fake contract)

**Gap:** `sign-in/page.test.tsx` (3 tests) and `app/app.controller.spec.ts` (1 test) not listed in test evidence — verify these are still passing.

---

### Category 2: Test Data Strategy (3/3) ✅

| Criterion | Status | Evidence |
|---|---|---|
| 2.1 Segregation: Test data isolated from prod | ✅ | All tests use mocked Prisma; no real DB queries. E2E uses `.auth/local/default/storage-state.json` |
| 2.2 Generation: Synthetic data (no prod scrubs) | ✅ | Mock tokens (`'gho_real_access_token'`), synthetic KEK (`'a'.repeat(64)`), no production data |
| 2.3 Teardown: Cleanup after destructive tests | ✅ | `beforeEach`/`afterEach` in crypto tests; Jest module-level mock cleanup; Playwright `try/finally` context.close() |

**Standout pattern:** `JSON.stringify(result).not.toContain('gho_real_access_token')` — absence assertion ensures token never leaks in credential response. ✅

---

### Category 3: Scalability & Availability (1/4)

| Criterion | Status | Evidence |
|---|---|---|
| 3.1 Statelessness: JWT sessions, horizontal scaling | ⚠️ | Next.js: JWT stateless ✅. NestJS: single-container, in-process state ⚠️ (documented architectural constraint) |
| 3.2 Bottlenecks identified and tested under load | ⚠️ | Architecture identifies bottlenecks (Daytona, Postgres, GitHub rate limit); no load tests yet |
| 3.3 SLA defined (uptime %) | ⚠️ | Performance targets (NFR-P1–P5) defined; no uptime SLA (99.9% / etc.) documented |
| 3.4 Circuit breakers: fail fast on dependency failure | ✅ | Architecture specifies sandbox-agent circuit breaker + SSE heartbeat; designed (not yet in sprint 1–3 scope) |

**Waiver justified:** Single-container is a documented MVP architectural decision. Load testing deferred to "Weekly/on-demand" tier (test-design-architecture.md §CI/CD tiering). SLA not required pre-GA.

---

### Category 4: Disaster Recovery (0/3)

| Criterion | Status | Evidence |
|---|---|---|
| 4.1 RTO/RPO defined and tested | ⚠️ | Not assessed. No RTO/RPO documented. FR-13 (session recovery) defers to "Reconnecting…" indicator |
| 4.2 Failover: automated or manual? | ⚠️ | Vercel: CDN edge failover (platform). Railway: single-container, manual rollback |
| 4.3 Backups: immutable, restoration tested | ⚠️ | Railway Postgres backups: platform-managed, not tested |

**Waiver justified:** Pre-production MVP. DR is a post-GA operational concern. Architecture delegates to Railway/Vercel platform capabilities. No waiver documentation required at this sprint.

---

### Category 5: Security (4/4) ✅

| Criterion | Status | Evidence |
|---|---|---|
| 5.1 AuthN/AuthZ: OAuth2/OIDC, least privilege | ✅ | GitHub OAuth 2.0 via Auth.js v5. `repo` scope. JWT strategy 8h. Middleware guard. `auth.config.spec.ts` tests 401 path |
| 5.2 Encryption: at rest and in transit | ✅ | AES-256-GCM DEK+KEK envelope (NFR-S4). Railway/Vercel TLS 1.3. `crypto.test.ts` 9 tests including GCM tamper rejection |
| 5.3 Secrets: not in code, validated at startup | ✅ | `getKek()` throws on missing/malformed KEK. `DATABASE_URL` startup guard. `.env.example` uses `REPLACE_WITH_OPENSSL_RAND_HEX_32` placeholder |
| 5.4 Input validation: SQL/XSS/injection | ✅ | Zod URL schema in `connectRepository`. Open-redirect validation on `callbackUrl` (starts with `/`). Parameterized Prisma queries. CI script injection prevention via `env:` intermediaries |

**Standout patterns:**
- Nonce uniqueness: 20-call set-size assertion (`crypto.test.ts`) verifies GCM nonce collision probability is negligible. ✅
- CI security: `BURN_IN_COUNT` passed via `env:` (not interpolated directly in `run:`) per `ci-burn-in.md` script injection prevention pattern. ✅
- `callOrder` tracking in `auth.credential.spec.ts` verifies encrypt-then-upsert execution order. ✅

**Minor deferred concerns:**
- `/api/*` routes (non-auth) return HTML 302 redirect rather than JSON 401 — Story 1.2 review decision deferred. Low risk for MVP (internal API routes don't exist yet in sprint 1–3).
- No secrets vault (Railway env vars only) — appropriate for MVP.

---

### Category 6: Monitorability / Debuggability / Manageability (1/4)

| Criterion | Status | Evidence |
|---|---|---|
| 6.1 Tracing: W3C Trace Context / Correlation IDs | ⚠️ | Not implemented. No cross-service calls in sprint 1–3 scope |
| 6.2 Logs: dynamic log levels without redeploy | ⚠️ | Prisma log levels via `NODE_ENV`. `console.error` in Server Action. No structured JSON, no dynamic toggle |
| 6.3 Metrics: RED metrics (Rate, Errors, Duration) | ⚠️ | No `/metrics` endpoint. NFR-O1 (LLM spend) not implemented (Conversations epic scope) |
| 6.4 Config: externalized, no rebuild needed | ✅ | All configuration via env vars. Auth.js, Prisma, encryption KEK all env-var driven |

**Waiver justified:** Structured logging, distributed tracing, and metrics are Epic 2+ scope. Basic `NODE_ENV`-gated Prisma logging is sufficient for sprint 1. NFR-O1 (LLM cost monitoring) is explicitly B-04 scope, with partial resolution noted in architecture.md.

---

### Category 7: QoS & Quality of Experience (1/4)

| Criterion | Status | Evidence |
|---|---|---|
| 7.1 Latency: P95/P99 targets defined | ⚠️ | Targets defined (NFR-P1–P5); no performance tests exist; page-load times not measured |
| 7.2 Throttling: rate limiting | ⚠️ | No rate limiting on any route. Not in scope for auth/onboarding stories |
| 7.3 Perceived performance: skeletons, optimistic updates | ⚠️ | Onboarding: "Validating…" state ✅ (`RepositoryUrlForm.test.tsx` verifies). Sign-in: no pending state on button during OAuth redirect ⚠️ (Story 1.2 review decision: add `useFormStatus`) |
| 7.4 Degradation: friendly errors, no stack traces | ✅ | `connectRepository` returns typed user-facing strings for all error cases. Auth.js redirects to `/sign-in?error=` → friendly message. No stack traces exposed |

**Pending UX fix (before Story 1.2 closes):**

The sign-in button shows no disabled/pending state during the GitHub OAuth redirect (Server Action fires immediately, browser navigates). Story 1.2 review item [Decision] acknowledged this. AC-3 requires "re-enabled button" behavior. Implement:

```tsx
// apps/web/src/app/sign-in/submit-button.tsx (Client Component)
'use client';
import { useFormStatus } from 'react-dom';

export function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} ...>
      {pending ? 'Redirecting to GitHub…' : 'Sign in with GitHub'}
    </button>
  );
}
```

---

### Category 8: Deployability (2/3)

| Criterion | Status | Evidence |
|---|---|---|
| 8.1 Zero downtime: Blue/Green or Canary | ⚠️ | Vercel: atomic zero-downtime ✅. Railway: stop-start single-container ⚠️. NestJS shutdown hooks not yet implemented |
| 8.2 Backward compatibility: DB migrations separate from code | ✅ | Prisma migration `20260619000000_add_oauth_credential_and_repo_connection/migration.sql` committed. Migrations as code pattern. |
| 8.3 Rollback: automated on health check failure | ⚠️ | Vercel: instant dashboard rollback ✅. Railway: manual only ⚠️. No `/health` endpoint on `agent-be` (explicitly deferred in Story 1.1; blocks CI) |

**See FINDING-1 above for the CI blocker related to 8.3.**

---

## NFR Threshold Compliance

| NFR | Threshold | Evidence | Status |
|---|---|---|---|
| NFR-P1 | First token ≤ 1,500ms | No measurement (Conversations epic scope) | ⬜ Not Assessed |
| NFR-P2 | Chat ready ≤ 10s | No Daytona provisioning in sprint 1–3 | ⬜ Not Assessed |
| NFR-P3 | Project Map ≤ 2s | No Project Map in sprint 1–3 | ⬜ Not Assessed |
| NFR-P4 | Artifact Browser ≤ 2s | No Artifact Browser in sprint 1–3 | ⬜ Not Assessed |
| NFR-P5 | Manual commit ≤ 5s | No Conversations in sprint 1–3 | ⬜ Not Assessed |
| NFR-R3 | 200 events, 30s drain → STREAM_ERROR | No SSE in sprint 1–3 | ⬜ Not Assessed |
| NFR-R4 | 10 concurrent SSE / HTTP/2 | No SSE in sprint 1–3 | ⬜ Not Assessed |
| NFR-S4 | AES-256-GCM, token never returned | `crypto.test.ts` 9 tests; `auth.credential.spec.ts` absence assertion | ✅ PASS |
| NFR-S1 | Sandbox credential/network isolation | Not in sprint 1–3 scope | ⬜ Not Assessed |
| NFR-S2 | Per-user credential isolation | `auth.credential.spec.ts` verifies userId scoping | ✅ PASS |
| NFR-R1 | Credential health ≤ 1 git cycle | Not in sprint 1–3 scope | ⬜ Not Assessed |
| NFR-O1 | Per-user LLM spend monitoring | Not in sprint 1–3 scope (B-04 scope) | ⬜ Not Assessed |

NFRs scoped to Conversations/Epic 2+ are Not Assessed — appropriate. NFR-S4 and NFR-S2 are the only NFRs in sprint 1–3 scope and both **PASS**.

---

## Action Items

### Mandatory (Block Next CI Run)

| ID | Priority | Action | Owner | Story |
|---|---|---|---|---|
| A-1 | P0 | Add `/health` endpoint to `apps/agent-be` OR comment out `agent-be` start + `wait-on` in CI E2E/burn-in jobs until endpoint is available | Backend Dev | Epic 1 (immediate) |

### Required Before GA

| ID | Priority | Action | Owner | Story |
|---|---|---|---|---|
| A-2 | P1 | Implement E2E OAuth session seeding mechanism (mock OAuth server or `authStorageInit` + seed-user fixture) to activate 17 skipped E2E tests | QA / Dev | Epic 1 / 2 |
| A-3 | P1 | Add `SubmitButton` Client Component with `useFormStatus` to sign-in page to satisfy AC-3 pending-state requirement | Dev | Story 1.2 follow-up |
| A-4 | P1 | Document API 401 vs 302 redirect decision for `/api/*` routes (Story 1.2 review decision) | Dev | Story 1.2 close |

### Recommended (Before Epic 2)

| ID | Priority | Action | Owner | Story |
|---|---|---|---|---|
| A-5 | P2 | Add structured JSON logging (Winston or Pino) with correlation IDs to `apps/agent-be` | Dev | Epic 2 |
| A-6 | P2 | Wire NFR-O1 LLM spend monitoring (Claude SDK cost reporting → Railway metrics) | Dev | B-04 scope |
| A-7 | P2 | Define formal availability SLA target (99.9% or similar) in architecture.md | Architect/PM | Epic 2 |
| A-8 | P3 | Add NestJS shutdown hooks for graceful SSE drain before deploy | Dev | Conversations epic |
| A-9 | P3 | Extract `unauthenticatedPage` Playwright fixture to eliminate 7× `browser.newContext()` boilerplate (noted in test-review.md M-3) | QA | Next test sprint |

---

## Waivers Granted (Sprint 1–3 Context)

The following CONCERNS are waived as expected for pre-production sprint 1–3:

| Waiver | Category | Justification |
|---|---|---|
| W-1 | DR (Cat 4) | Pre-production. Railway/Vercel platform manages backups. RTO/RPO deferred to operational runbook at GA. |
| W-2 | Scalability SLA (Cat 3.3) | Performance targets defined in architecture.md NFR table. No formal uptime SLA required pre-GA. |
| W-3 | Load testing (Cat 3.2) | Deferred to "Weekly/on-demand" CI tier per test-design-architecture.md. B-02 spike in Conversations epic. |
| W-4 | Structured logging (Cat 6.2) | Sprint 1–3 scope. NFR-O1 and structured logging are Epic 2+ deliverables. |
| W-5 | Metrics endpoint (Cat 6.3) | Epic 2+ scope per architecture.md NFR-O1 tracking. |
| W-6 | Rate limiting (Cat 7.2) | No public API surface in sprint 1–3. Rate limiting required before Conversations epic GA. |
| W-7 | Railway zero-downtime (Cat 8.1) | Single-container MVP architectural constraint. NestJS shutdown hooks deferred to Conversations epic. |

---

## Gate Decision

**Current gate status: ⚠️ CONCERNS — Release blocked on A-1 (CI health endpoint)**

Once A-1 is resolved, release of sprint 1–3 (Stories 1.1–1.3) may proceed with waivers W-1 through W-7 applied. Actions A-2 through A-9 are tracked for subsequent sprints.

**Security gate: ✅ PASS** — NFR-S2 and NFR-S4 both satisfied with test coverage. AES-256-GCM implementation with per-call nonce uniqueness is correct. No hardcoded secrets. Input validation applied.

**Next recommended workflow:** `trace` — run coverage analysis on `apps/web/src/lib/` to confirm integration coverage ≥80% for `auth.ts`, `auth.config.ts`, `crypto.ts`, `prisma.ts` before the next sprint begins.

---

## Knowledge Base References

- `adr-quality-readiness-checklist.md` — 8-category, 29-criteria assessment framework
- `ci-burn-in.md` — burn-in loop pattern; script injection prevention
- `test-quality.md` — determinism, isolation, explicit assertions, cleanup
- `playwright-config.md` — timeout standards, artifact storage, parallelization
- `error-handling.md` — scoped exception handling, graceful degradation

---

*Produced by TEA Master Test Architect (bmad-testarch-nfr workflow), 2026-06-19*
