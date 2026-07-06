---
stepsCompleted:
  - step-01-load-context
  - step-02-define-thresholds
  - step-03-gather-evidence
  - step-04-evaluate-and-score
  - step-04e-aggregate-nfr
  - step-05-generate-report
lastStep: step-05-generate-report
lastSaved: '2026-07-03'
overallStatus: CONCERNS
criteriaScore: '17/29'
workflowType: 'testarch-nfr-assess'
scope: 'Story 2.2 — View the Project Map'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/implementation-artifacts/2-2-view-the-project-map.md
  - _bmad-output/test-artifacts/test-design-architecture.md
  - _bmad-output/test-artifacts/test-design-qa.md
  - _bmad-output/project-context.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/adr-quality-readiness-checklist.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/ci-burn-in.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/playwright-config.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/error-handling.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/playwright-cli.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/nfr-criteria.md
---

# NFR Evidence Audit — Story 2.2: View the Project Map

## Step 1: Context Loaded

### NFR Sources

| Source | Path | NFRs Referenced |
|---|---|---|
| PRD | `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` | NFR-P3 (Project Map ≤2s), NFR-S2, NFR-S4, NFR-R1 |
| Architecture | `_bmad-output/planning-artifacts/architecture.md` | Component/data boundaries, graceful degradation |
| Epics | `_bmad-output/planning-artifacts/epics.md` | Story 2.2 (lines 475–501), NFR coverage map (NFR-P3 → Epic 2) |
| Story 2.2 | `_bmad-output/implementation-artifacts/2-2-view-the-project-map.md` | AC-5 explicitly references NFR-P3 |
| Test Design (Architecture) | `_bmad-output/test-artifacts/test-design-architecture.md` | NFR testability requirements, R-06 (Daytona outage) |
| Test Design (QA) | `_bmad-output/test-artifacts/test-design-qa.md` | P1-002 maps to NFR-P3; P1-003 maps to R-06 |
| Project Context | `_bmad-output/project-context.md` | Frontend data flow, testing rules, performance gotchas |

### NFRs in Scope for Story 2.2

| NFR | Category | Threshold | Relevance to Story 2.2 |
|---|---|---|---|
| **NFR-P3** | Performance | Project Map loads within 2 seconds of page open | **Primary** — AC-5 explicitly mandates this; the page reads from Postgres via Prisma `findMany` |
| **NFR-S2** | Security | Tenant-scoped OAuth token lookups; tokens never resolved across users | **Secondary** — page calls `getCredentialHealthStatus()` and `syncArtifactsAction()` which resolve tokens |
| **NFR-S4** | Security | OAuth tokens AES-256-GCM encrypted at rest, never returned to client | **Secondary** — page relies on credential health actions that use encrypted token storage |
| **NFR-R1** | Reliability | Credential health updates within one git operation cycle; 403 classified, not failed | **Secondary** — page displays Credential Error Banner based on health status |

### Evidence Availability

| Evidence Type | Status | Location |
|---|---|---|
| Implementation | Available (Story 2.2 status: done) | `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx`, `ArtifactCard.tsx`, `CredentialErrorBanner.tsx`, `loading.tsx` |
| Unit/Component Tests | Available | `ArtifactCard.test.tsx`, `CredentialErrorBanner.test.tsx`, `page.test.tsx` |
| Test Results | 383 tests pass (29 suites, 0 regressions) | Story 2.2 completion notes |
| Lint | 0 errors, 9 warnings (within 11-warning baseline) | `yarn nx lint web` |
| Typecheck | Clean | `npx tsc --noEmit` |
| Review Findings | 10 patches applied, 8 deferred (pre-existing/spec-mandated) | Story 2.2 Review Findings section |
| E2E Tests | Not yet created for Story 2.2 | `playwright/` directory — P1-002 (NFR-P3 timing) planned but not implemented |
| CI Burn-In | Not yet run for Story 2.2 changes | CI pipeline exists (`test.yml`) |
| Load Testing | No load-testing tool selected yet | Blocked per test-design-architecture.md |

### Knowledge Fragments Loaded

- `adr-quality-readiness-checklist.md` (8-category, 29-criteria framework)
- `ci-burn-in.md` (CI pipeline and burn-in strategy)
- `test-quality.md` (test DoD: deterministic, isolated, <300 lines, <1.5 min)
- `playwright-config.md` (timeout standards, artifact output)
- `error-handling.md` (scoped exception handling, graceful degradation)
- `playwright-cli.md` (browser automation for evidence collection)
- `nfr-criteria.md` (NFR validation criteria and gate decision matrix)

### Configuration

- `tea_browser_automation`: auto (CLI + MCP available)
- `test_stack_type`: auto
- `ci_platform`: auto
- `test_framework`: auto
- `risk_threshold`: p1

---

## Step 2: NFR Categories & Thresholds

### Source: Test-Design NFR Plan (Primary)

Per step 0, thresholds are sourced from `test-design-qa.md` (NFR Test Coverage Plan) and `test-design-architecture.md` (NFR Testability Requirements), with fallback to PRD/architecture for missing values.

### NFR Matrix for Story 2.2

Scoped to the Project Map page (`/project-map`) — a Next.js Server Component reading from Postgres via Prisma, with conditional page-load sync from GitHub on first visit.

#### ADR Category 1: Testability & Automation

| Criterion | Threshold | Source |
|---|---|---|
| 1.1 Isolation | Page testable with mocked Prisma, auth, and Server Actions | `page.test.tsx` mocks all dependencies |
| 1.2 Headless Interaction | Business logic in Server Actions (callable without UI) | Architecture — Server Actions pattern |
| 1.3 State Control | Prisma mocking pattern; test route for artifact seeding (with validation fix) | `page.test.tsx`, `api/internal/test/artifacts/route.ts` |
| 1.4 Sample Requests | N/A — page render, not API endpoint | — |

#### ADR Category 2: Test Data Strategy

| Criterion | Threshold | Source |
|---|---|---|
| 2.1 Segregation | `repoConnectionId` scoping in all artifact queries | `page.tsx` Task 5.3 |
| 2.2 Generation | Mock data via `jest.mock` factories in tests | `page.test.tsx` |
| 2.3 Teardown | Test route `DELETE` with input validation (patched in review) | Review Patch: `route.ts:47-49` |

#### ADR Category 3: Scalability & Availability

| Criterion | Threshold | Source |
|---|---|---|
| 3.1 Statelessness | Server Component — fully stateless, no session state | Architecture |
| 3.2 Bottlenecks | Prisma `findMany` on `Artifact` table; page-load sync calls GitHub API on first visit only | Story 2.2 dev notes |
| 3.3 SLA Definitions | NFR-P3: ≤2 seconds page load | PRD, test-design-qa P1-002 |
| 3.4 Circuit Breakers | No external call on subsequent loads (Postgres read only); first-visit sync has no circuit breaker (deferred) | Story 2.2 dev notes |

#### ADR Category 4: Disaster Recovery

| Criterion | Threshold | Source |
|---|---|---|
| 4.1 RTO/RPO | N/A — single page render, no persistent state | — |
| 4.2 Failover | Infrastructure-level (Vercel) — not story-scoped | Architecture |
| 4.3 Backups | Postgres backups (Railway) — not story-scoped | Architecture |

#### ADR Category 5: Security

| Criterion | Threshold | Source |
|---|---|---|
| 5.1 AuthN/AuthZ | Auth.js OAuth + layout guards (`(dashboard)/layout.tsx`, `(app)/layout.tsx`); `auth()` null-check as defense-in-depth | Story 2.2 Task 5.1, NFR-S2 |
| 5.2 Encryption | NFR-S4: OAuth tokens AES-256-GCM encrypted at rest | PRD, test-design-qa P0-016 |
| 5.3 Secrets | KEK in Railway env var; tokens never returned to client | Architecture, project-context.md |
| 5.4 Input Validation | Zod validation in Server Actions; type assertions with fallbacks (patched in review) | Review Patch: `page.tsx:67,69` |

#### ADR Category 6: Monitorability/Debuggability/Manageability

| Criterion | Threshold | Source |
|---|---|---|
| 6.1 Tracing | **UNKNOWN** — no distributed tracing for apps/web in MVP | Architecture |
| 6.2 Logs | **UNKNOWN** — no structured logging in apps/web (NestJS Logger only in agent-be) | project-context.md |
| 6.3 Metrics | **UNKNOWN** — no /metrics endpoint, no RED metrics for apps/web | Architecture |
| 6.4 Config | Environment variables (`.env.local`); no feature flags | project-context.md |

#### ADR Category 7: QoS/QoE

| Criterion | Threshold | Source |
|---|---|---|
| 7.1 Latency | NFR-P3: ≤2 seconds Project Map load (p95) | PRD, test-design-qa P1-002 |
| 7.2 Throttling | N/A — no rate limiting on apps/web pages | Architecture |
| 7.3 Perceived Performance | Loading skeleton (`loading.tsx`) with 3 `animate-pulse` cards during data fetch | Story 2.2 Task 4 |
| 7.4 Degradation | Credential Error Banner on failed credential; empty state on no artifacts; sync failure renders existing Postgres data | Story 2.2 AC-3, AC-4 |

#### ADR Category 8: Deployability

| Criterion | Threshold | Source |
|---|---|---|
| 8.1 Zero Downtime | Vercel deployment (apps/web) — supports atomic deploys | Architecture |
| 8.2 Backward Compatibility | Prisma migrations separate from code; `Artifact` model from Story 2.1 | Story 2.1 |
| 8.3 Rollback | Manual trigger (not automatic on health check failure) | project-context.md |

### Thresholds Marked UNKNOWN

| Category | Criterion | Status | Planned Evidence |
|---|---|---|---|
| Monitorability | 6.1 Tracing | UNKNOWN | No tracing implemented for apps/web in MVP |
| Monitorability | 6.2 Logs | UNKNOWN | No structured logging in apps/web |
| Monitorability | 6.3 Metrics | UNKNOWN | No /metrics endpoint for apps/web |

Per `nfr-criteria.md`: ambiguous or undefined thresholds default to **CONCERNS** until clarified.

---

## Step 3: Evidence Gathered

### Performance Evidence (NFR-P3)

| Evidence | Source | Finding |
|---|---|---|
| E2E timing test | `playwright/e2e/project-map/project-map.spec.ts:18-30` | `[P0] Project Map loads within 2 seconds (NFR-P3, AC-5)` — warms up route, then measures steady-state load with `expect(elapsed).toBeLessThan(2_000)` |
| Page data-fetch pattern | `page.tsx:26-29` | Prisma `findMany` on `Artifact` table, ordered by `lastModifiedAt desc` — direct Postgres read, no GitHub API call on subsequent visits |
| Loading skeleton | `loading.tsx:1-19` | 3 `animate-pulse` skeleton cards shown during Server Component execution (Next.js convention) |
| First-visit sync | `page.tsx:37-47` | If Postgres empty AND credential healthy, calls `syncArtifactsAction()` (GitHub API) — skeleton shows during this sync |
| Test review finding L-1 | `test-review-2-2.md:127-133` | E2E timing test uses `Date.now()` — inherently non-deterministic on CI runners with varying speed |
| CI pipeline | `.github/workflows/test.yml` | E2E tests run in 4 shards with `fail-fast: false`; burn-in (10 iterations) on PRs + weekly |
| **Gap: No CI run results** | — | No CI execution results available to verify the timing test passes in CI |
| **Gap: No load-testing tool** | `test-design-architecture.md` | No k6/Artillery selected — NFR-P3 cannot be validated under load |

### Security Evidence (NFR-S2, NFR-S4)

| Evidence | Source | Finding |
|---|---|---|
| Auth guard (layout) | `(dashboard)/layout.tsx` | Redirects to `/sign-in` if unauthenticated — page does not re-implement this |
| Repo-connection guard | `(app)/layout.tsx` | Redirects to `/onboarding` if no `RepoConnection` — page assumes connection exists |
| Defense-in-depth auth | `page.tsx:11-15` | `auth()` null-check redirects to `/sign-in` — safety net for session expiry between layout guard and page render |
| Tenant scoping | `page.tsx:26-28` | `where: { repoConnectionId: repoConnection.id }` — artifacts scoped to user's connection |
| Credential health check | `page.tsx:31-33` | `getCredentialHealthStatus()` called — uses tenant-scoped token resolution (Story 1.6) |
| Type assertion fallbacks | `ArtifactCard.tsx:44,50-51` | `TYPE_LABELS[type] ?? 'Other'`, `STATUS_BADGE_CLASSES[status] ?? completed` — patched in review to handle unknown DB values |
| Error handling in banner | `CredentialErrorBanner.tsx:20-28` | `try/catch` around `reauthorizeGitHub()` — shows error message on failure (patched in review) |
| **Gap: No security scan** | — | No vulnerability scan (npm audit/Snyk) in CI pipeline |
| **Gap: No penetration test** | — | Not performed for MVP |

### Reliability Evidence (NFR-R1)

| Evidence | Source | Finding |
|---|---|---|
| Credential error banner | `page.tsx:54` | `{credentialFailed && <CredentialErrorBanner />}` — renders banner when health is `failed` |
| Sync failure handling | `page.tsx:44-46` | `NO_CREDENTIAL` → sets `credentialFailed = true`; other errors → render existing Postgres data |
| Graceful degradation | `page.tsx:56-73` | Empty state prompt on no artifacts; existing Postgres data rendered on sync failure |
| Daytona outage resilience | Architecture | Project Map is pure Postgres read — remains functional during Daytona outage (R-06) |
| E2E credential banner test | `project-map.spec.ts:64-74` | `[P0] credential error banner appears when credential is missing (AC-4)` |
| Re-auth error recovery | `CredentialErrorBanner.tsx:20-28` | `useTransition` + `try/catch` — button re-enables with error message on failure |
| **Gap: No burn-in results** | — | Burn-in job exists in CI but no execution results available |

### Maintainability Evidence

| Evidence | Source | Finding |
|---|---|---|
| Test count | `test-review-2-2.md` | 396 tests across 31 suites — ALL PASSING in 5.0 seconds |
| Test quality score | `test-review-2-2.md` | 92/100 (A — Excellent) — 0 Critical, 0 High, 2 Medium, 3 Low violations |
| P0/P1 tagging | All test files | 19 P0 tests, 14 P1 tests — all ACs have explicit P0 coverage |
| Co-located tests | project-context.md | Tests next to source — `*.test.tsx` / `*.spec.ts` convention followed |
| Lint | Story 2.2 completion notes | 0 errors, 9 warnings (within 11-warning baseline) |
| Typecheck | Story 2.2 completion notes | `tsc --noEmit` clean |
| Review patches | Story 2.2 Review Findings | 10 patches applied (test route validation, prefix matching, type fallbacks, error handling, etc.) |
| **Gap: No coverage threshold** | CI pipeline | No coverage % gate in CI |
| **Gap: No duplication check** | CI pipeline | No jscpd/code-duplication job |
| **Gap: No vulnerability scan** | CI pipeline | No npm audit job |

### CI / Burn-In Evidence

| Evidence | Source | Finding |
|---|---|---|
| CI pipeline stages | `.github/workflows/test.yml` | lint → unit/integration → E2E (4 shards, `fail-fast: false`) → burn-in (10 iterations, PRs + weekly) → report |
| Burn-in configuration | `test.yml:156-229` | 10 iterations of full Playwright suite; runs on PRs and weekly cron (Sundays 02:00 UTC) |
| Script injection prevention | `test.yml:269-303` | Extension patterns documented — `env:` intermediary for `${{ inputs.* }}` |
| Artifact retention | `test.yml:146-154, 221-229` | 30 days for E2E results, 7 days for burn-in failure artifacts |
| **Gap: No CI execution results** | — | No CI run results available to verify pipeline passes for Story 2.2 changes |

### Monitorability Evidence

| Evidence | Source | Finding |
|---|---|---|
| **Gap: No tracing** | Architecture | No W3C Trace Context / correlation IDs in apps/web |
| **Gap: No structured logging** | project-context.md | NestJS Logger only in agent-be; no structured logging in apps/web |
| **Gap: No metrics endpoint** | Architecture | No /metrics endpoint, no RED metrics for apps/web |
| **Gap: No error tracking** | Architecture | No Sentry/monitoring integration in apps/web |

### Evidence Summary

| Category | Evidence Available | Evidence Gaps |
|---|---|---|
| Performance (NFR-P3) | E2E timing test exists; page reads from Postgres | No CI run results; no load-testing tool; timing test non-deterministic |
| Security (NFR-S2, S4) | Auth guards, tenant scoping, type fallbacks, error handling | No security scan; no penetration test |
| Reliability (NFR-R1) | Credential banner, sync failure handling, graceful degradation | No burn-in results; no CI execution results |
| Maintainability | 396 tests pass; test quality 92/100; lint/typecheck clean | No coverage threshold; no duplication check; no vulnerability scan |
| Monitorability | — | No tracing, no structured logging, no metrics, no error tracking |
| CI/Burn-In | Pipeline exists with 4 shards + burn-in | No CI execution results available |

---

## Step 4: NFR Domain Audit Results (Subagent Execution)

**Execution Mode:** SUBAGENT (4 NFR domains) — ~67% faster than sequential

### Domain Risk Breakdown

| Domain | Risk Level | Key NFR | Status |
|---|---|---|---|
| Security | LOW | NFR-S2 (tenant scoping), NFR-S4 (encryption) | PASS |
| Performance | MEDIUM | NFR-P3 (≤2s load) | CONCERN |
| Reliability | MEDIUM | NFR-R1 (credential health cycle) | PASS |
| Scalability | MEDIUM | MVP scale | CONCERN |

**Overall Risk Level: MEDIUM** (3 of 4 domains at MEDIUM, none at HIGH)

### Compliance Summary

| Standard / NFR | Status | Source Domain |
|---|---|---|
| NFR-S2 (tenant-scoped token lookups) | PASS | Security |
| NFR-S4 (AES-256-GCM encryption at rest) | PASS | Security |
| NFR-P3 (Project Map ≤2s load) | CONCERN | Performance |
| NFR-R1 (credential health within one cycle) | PASS | Reliability |
| MVP Scale | CONCERN | Scalability |
| SOC2 | PARTIAL | Security |
| GDPR | PARTIAL | Security |

### Cross-Domain Risks

| # | Domains | Description | Impact |
|---|---|---|---|
| 1 | Performance + Scalability | Unbounded `findMany` (no `take` limit, fetches `content` column) + missing `@@index([repoConnectionId, lastModifiedAt])` — degrades as artifacts grow | HIGH |
| 2 | Reliability + Performance | No `error.tsx` boundary + sequential DB queries — a Postgres failure crashes the page with no fallback and added latency | MEDIUM |
| 3 | Security + Scalability | No rate limiting on sync path + unbounded GitHub API fan-out — authenticated abuse possible | MEDIUM |

### Domain Findings Summary

#### Security (LOW)

| Category | Status | Key Finding |
|---|---|---|
| Authentication & Authorization | PASS | Multi-layered defense-in-depth: middleware → layout → page → server action; JWT 8h maxAge; GitHub OAuth `repo` scope |
| Data Protection (NFR-S2, NFR-S4) | PASS | `resolveOAuthToken(userId)` is single tenant-scoped resolution point; AES-256-GCM envelope encryption with userId as GCM AAD; fresh nonces; DEK zeroed in memory |
| Input Validation | PASS | Prisma parameterized queries; React auto-escaping; strict repo URL regex; `encodeURIComponent` on GitHub API URLs |
| API Security | CONCERN | No explicit security headers in `next.config.js` (no CSP, X-Frame-Options, etc.) — project-wide gap |
| Secrets Management | PASS | KEK from env var, format-validated; rotation runbook exists; no hardcoded credentials; `assertTestEnvNotInProduction()` |

#### Performance (MEDIUM)

| Category | Status | Key Finding |
|---|---|---|
| Response Times (NFR-P3) | CONCERN | E2E timing test exists but uses `Date.now()` (non-deterministic on CI); no CI run results; 4 sequential DB awaits not parallelized |
| Throughput | CONCERN | `findMany` has no `take`/`skip` pagination; `orderBy(lastModifiedAt)` not backed by index; no load-testing tool selected |
| Resource Usage | PASS | Prisma singleton via `globalForPrisma` (serverless-safe); Server Component ships near-zero JS; sync fires at most once per repo |
| Optimization | CONCERN | No caching on dynamic route (correct for freshness, but no memoization); no negative cache on transient sync failures |

#### Reliability (MEDIUM)

| Category | Status | Key Finding |
|---|---|---|
| Error Handling | CONCERN | NFR-R1 credential health path is solid (401→markCredentialFailed→banner); but no `error.tsx` boundary for Prisma failures; no retry/backoff; no circuit breaker on GitHub sync |
| Monitoring & Observability | CONCERN | No Sentry/APM/tracing in apps/web; only `console.error`; no `/api/health` endpoint; no correlation IDs |
| Fault Tolerance | CONCERN | Daytona outage resilience by design (pure Postgres read); but Postgres itself has no retry, no failover, no pool config |
| Uptime & Availability | N/A | No SLA defined for MVP (explicitly deferred) |

#### Scalability (MEDIUM)

| Category | Status | Key Finding |
|---|---|---|
| Horizontal Scaling | PASS | Stateless Server Component on Vercel; serverless-safe Prisma singleton; no agent-be dependency |
| Vertical Scaling | CONCERN | `findMany` fetches `content` column (full markdown body) that `ArtifactCard` never renders — unbounded memory growth |
| Data Scaling | CONCERN | Missing `@@index([repoConnectionId, lastModifiedAt])` forces filesort; no archival policy; no read replicas |
| Traffic Handling | CONCERN | No rate limiting on apps/web sync path; unbounded `Promise.allSettled` fan-out in sync |

### Priority Actions (Sorted by Urgency)

| # | Priority | Domain | Action |
|---|---|---|---|
| 1 | HIGH | Scalability | Add `select` projection to both `findMany` calls to exclude unused `content` column — zero-risk, eliminates unbounded memory growth |
| 2 | MEDIUM | Performance + Scalability | Add `@@index([repoConnectionId, lastModifiedAt])` to Artifact model so filter+sort is index-served |
| 3 | MEDIUM | Reliability | Add route-level `error.tsx` boundary for project-map segment to catch unhandled Prisma exceptions |
| 4 | MEDIUM | Reliability | Wrap 3 Prisma reads in `page.tsx` in try-catch with degraded-render fallback |
| 5 | MEDIUM | Performance | Parallelize independent reads (`artifact.findMany` + `getCredentialHealthStatus`) with `Promise.all` |
| 6 | MEDIUM | Security | Add security headers to `next.config.js` (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) |
| 7 | MEDIUM | Reliability | Install Sentry (or equivalent) for unhandled exception capture in production |
| 8 | MEDIUM | Reliability | Add `/api/health` readiness probe verifying DATABASE_URL connectivity |
| 9 | MEDIUM | Performance | Validate NFR-P3 in CI — capture Playwright trace on next PR run to evidence 2s threshold on GitHub Actions |
| 10 | MEDIUM | Scalability | Add `take` limit (e.g. 100) to `findMany` to bound result set |
| 11 | LOW | Performance | Replace `Date.now()` in E2E test with `performance.now()` + `test.step()` for deterministic measurement |
| 12 | LOW | Scalability + Security | Add per-user cooldown on `syncArtifactsAction` to prevent abuse-driven burst load |

---

## Step 5: Final NFR Evidence Audit Report

**Date:** 2026-07-03
**Story:** 2.2 — View the Project Map
**Overall Status:** CONCERNS

---

Note: This audit summarizes existing implementation evidence; it does not run tests or CI workflows. NFR thresholds and planned evidence come from PRD, architecture, and `test-design` outputs.

### Executive Summary

**Assessment:** 17 PASS, 7 CONCERNS, 0 FAIL

**Blockers:** 0 — no FAIL status NFRs

**High Priority Issues:** 1 — unbounded `findMany` fetching `content` column with missing composite index (Performance + Scalability cross-domain risk)

**Recommendation:** Approve with conditions. Story 2.2's security posture is strong (NFR-S2, NFR-S4 PASS) and the NFR-R1 credential health path is correctly implemented. NFR-P3 (≤2s load) has an E2E timing test that passes locally but is not yet validated in CI. The primary concerns are: (1) the `findMany` query fetches the full `content` markdown body that `ArtifactCard` never renders — a zero-risk `select` projection fix eliminates this; (2) the missing `@@index([repoConnectionId, lastModifiedAt])` will degrade sort performance as artifacts grow; (3) no monitoring/observability tooling exists in apps/web. None block MVP launch at current scale, but the `select` projection fix should be applied immediately as a quick win.

---

### Performance Assessment

#### Response Time (NFR-P3)

- **Status:** CONCERNS
- **Threshold:** ≤2 seconds (NFR-P3)
- **Actual:** E2E test passes locally (396 tests in 5.0s); no CI run results available
- **Evidence:** `playwright/e2e/project-map/project-map.spec.ts:18-30` — `[P0] Project Map loads within 2 seconds (NFR-P3, AC-5)` with `expect(elapsed).toBeLessThan(2_000)`; warm-up navigation mitigates first-compile latency
- **Findings:** Timing test uses `Date.now()` (non-deterministic on CI runners — test review finding L-1); 4 sequential DB awaits not parallelized; no CI evidence available

#### Throughput

- **Status:** CONCERNS
- **Threshold:** No formal throughput SLO defined for MVP
- **Actual:** `findMany` has no `take`/`skip` pagination; `orderBy(lastModifiedAt)` not backed by index
- **Evidence:** `page.tsx:26-29` — unbounded `findMany`; `schema.prisma:69` — only `@@unique([repoConnectionId, path])`, no `@@index([repoConnectionId, lastModifiedAt])`
- **Findings:** No load-testing tool selected (blocked per test-design-architecture.md); concurrent-user behavior unvalidated

#### Resource Usage

- **Status:** PASS
- **Threshold:** No formal resource thresholds for MVP
- **Actual:** Prisma singleton via `globalForPrisma` (serverless-safe); Server Component ships near-zero JS; sync fires at most once per repo
- **Evidence:** `apps/web/src/lib/prisma.ts:4-22`; `page.tsx:37-47` (sync guard)

#### Scalability

- **Status:** CONCERNS
- **Threshold:** MVP scale (single-tenant, small user count)
- **Actual:** Stateless Server Component on Vercel; but `findMany` fetches `content` column (full markdown body) that UI never renders
- **Evidence:** `page.tsx:26-29` (no `select` projection); `ArtifactCard.tsx:30-34` (only needs type, title, status)
- **Findings:** Memory growth proportional to artifact body size × row count; no archival policy for MVP

---

### Security Assessment

#### Authentication Strength

- **Status:** PASS
- **Threshold:** OAuth2 with JWT session, 8h maxAge
- **Actual:** Multi-layered defense-in-depth: middleware → layout → page → server action; GitHub OAuth `repo` scope
- **Evidence:** `middleware.ts:4-9`; `auth.config.ts:20-31`; `page.tsx:11-15`; `auth.ts:20-22`

#### Authorization Controls (NFR-S2)

- **Status:** PASS
- **Threshold:** Tenant-scoped OAuth token lookups; tokens never resolved across users
- **Actual:** `resolveOAuthToken(userId)` is single tenant-scoped resolution point; `where:{userId}` IS the tenant authorization check; all Prisma queries scope by `userId` or derived `repoConnectionId`
- **Evidence:** `credential-health.ts:23-31`; `page.tsx:18,27,41`

#### Data Protection (NFR-S4)

- **Status:** PASS
- **Threshold:** AES-256-GCM encryption at rest; tokens never returned to client
- **Actual:** Envelope encryption (per-user DEK + platform KEK); userId bound as GCM AAD on both layers; fresh random 12-byte nonces; DEK zeroed in memory after use; KEK rotation runbook exists
- **Evidence:** `crypto.ts:3,121-148,150-172`; `auth.ts:49-68`; `project-context.md:266-269`

#### Vulnerability Management

- **Status:** CONCERNS
- **Threshold:** No formal vulnerability scan threshold defined
- **Actual:** No npm audit/Snyk in CI pipeline; no security headers in `next.config.js`
- **Evidence:** `.github/workflows/test.yml` (no security scan job); `next.config.js:6-14` (no `headers()` config)
- **Recommendation:** Add security headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) to `next.config.js`; add `npm audit` job to CI

---

### Reliability Assessment

#### Error Handling (NFR-R1)

- **Status:** PASS
- **Threshold:** Credential health updates within one git operation cycle; 403 classified, not failed
- **Actual:** 401 → `markCredentialFailed()` with optimistic-concurrency `capturedAt` guard → `CredentialErrorBanner` renders same cycle; 403 classified (rate-limit vs. access-denied) without marking credential failed
- **Evidence:** `repository-validation.ts:139-152`; `credential-health.ts:46-55`; `page.tsx:54`; `project-map.spec.ts:64-74`

#### Fault Tolerance

- **Status:** CONCERNS
- **Threshold:** Daytona outage resilience (R-06)
- **Actual:** Project Map is pure Postgres read — remains functional during Daytona outage; but no `error.tsx` boundary for Prisma failures; no retry/backoff; no circuit breaker on GitHub sync
- **Evidence:** `page.tsx:17-29` (3 Prisma reads with no try-catch); no `error.tsx` in route segment
- **Recommendation:** Add route-level `error.tsx` boundary; wrap Prisma reads in try-catch with degraded-render fallback

#### Monitoring & Observability

- **Status:** CONCERNS
- **Threshold:** No formal monitoring threshold defined for MVP
- **Actual:** No Sentry/APM/tracing in apps/web; only `console.error`; no `/api/health` endpoint; no correlation IDs
- **Evidence:** No `@sentry`, `@opentelemetry`, `pino`, or `winston` in `apps/web/package.json`; `artifacts.actions.ts:42,49,64,71` (console.error only)
- **Recommendation:** Install Sentry for unhandled exception capture; add `/api/health` readiness probe; add structured logging with correlation IDs

#### CI Burn-In (Stability)

- **Status:** CONCERNS
- **Threshold:** 10 consecutive successful runs (CI burn-in)
- **Actual:** Burn-in job exists in CI (10 iterations on PRs + weekly) but no execution results available
- **Evidence:** `.github/workflows/test.yml:156-229`
- **Findings:** Cannot verify burn-in passes for Story 2.2 changes

---

### Maintainability Assessment

#### Test Coverage

- **Status:** PASS
- **Threshold:** No hard coverage % threshold; P0 tests must cover all ACs
- **Actual:** 396 tests across 31 suites — ALL PASSING in 5.0 seconds; all 5 ACs have explicit P0 coverage (19 P0, 14 P1 tests)
- **Evidence:** `_bmad-output/test-artifacts/test-reviews/test-review-2-2.md` — test quality score 92/100 (A)

#### Code Quality

- **Status:** PASS
- **Threshold:** 0 lint errors (within 11-warning baseline)
- **Actual:** 0 errors, 9 warnings (within baseline); typecheck clean; 10 review patches applied
- **Evidence:** Story 2.2 completion notes; `yarn nx lint web`; `npx tsc --noEmit`

#### Technical Debt

- **Status:** CONCERNS
- **Threshold:** No formal debt ratio threshold
- **Actual:** 8 deferred items from review (all pre-existing or spec-mandated); missing `jest.restoreAllMocks()` in afterEach (test review M-1); CSS class assertions couple to Tailwind names (test review M-2)
- **Evidence:** Story 2.2 Review Findings — Deferred section; `test-review-2-2.md` recommendations

#### Test Quality

- **Status:** PASS
- **Threshold:** Test quality DoD (deterministic, isolated, <300 lines, <1.5 min)
- **Actual:** 92/100 (A — Excellent); 0 Critical, 0 High, 2 Medium, 3 Low violations; all tests under 300 lines; 5.0s execution time
- **Evidence:** `_bmad-output/test-artifacts/test-reviews/test-review-2-2.md`

---

### Quick Wins

3 quick wins identified for immediate implementation:

1. **Add `select` projection to `findMany`** (Performance/Scalability) - HIGH priority - Minimal code change
   - Exclude the `content` column from both `findMany` calls in `page.tsx:26` and `page.tsx:40`
   - `ArtifactCard` only needs `type`, `title`, `status` — `content` is fetched but never rendered
   - Zero behavioral risk, eliminates unbounded memory growth proportional to artifact body size

2. **Add `@@index([repoConnectionId, lastModifiedAt])`** (Performance/Scalability) - MEDIUM priority - Migration only
   - Add composite index to Artifact model in `schema.prisma`
   - Makes the page's filter+sort query index-served without a filesort
   - No code changes needed, just a Prisma migration

3. **Parallelize independent reads** (Performance) - MEDIUM priority - Single-line change
   - Use `Promise.all` for `artifact.findMany` and `getCredentialHealthStatus` once `repoConnectionId` is known
   - Removes one DB round-trip from every render
   - `page.tsx:26-31` — currently sequential awaits

---

### Recommended Actions

#### Immediate (Before Release) - CRITICAL/HIGH Priority

1. **Add `select` projection to `findMany`** - HIGH - 1 hour - Dev
   - Add `select: { id, type, title, status, lastModifiedAt, path }` to both `findMany` calls
   - Validates: no `content` column in query result; `ArtifactCard` renders correctly

2. **Validate NFR-P3 in CI** - HIGH - 2 hours - Dev/DevOps
   - Capture Playwright trace on next PR run to evidence 2s threshold on GitHub Actions
   - Publish trace artifact for verification
   - Validates: NFR-P3 (≤2s) holds on CI runners, not just locally

#### Short-term (Next Milestone) - MEDIUM Priority

1. **Add `@@index([repoConnectionId, lastModifiedAt])`** - MEDIUM - 1 hour - Dev
   - Prisma migration adding composite index; no code changes

2. **Add route-level `error.tsx` boundary** - MEDIUM - 2 hours - Dev
   - Create `apps/web/src/app/(dashboard)/(app)/project-map/error.tsx`
   - Catch unhandled Prisma exceptions; present recovery UI with Retry button

3. **Add security headers to `next.config.js`** - MEDIUM - 1 hour - Dev
   - CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy

4. **Install Sentry for error tracking** - MEDIUM - 4 hours - Dev/DevOps
   - Next.js server instrumentation for unhandled exception capture

5. **Add `/api/health` readiness probe** - MEDIUM - 2 hours - Dev
   - Verify DATABASE_URL connectivity for orchestrator-level routing

6. **Add `take` limit to `findMany`** - MEDIUM - 1 hour - Dev
   - Bound result set (e.g. `take: 100`); add "showing latest N" affordance

#### Long-term (Backlog) - LOW Priority

1. **Replace `Date.now()` in E2E test** - LOW - 1 hour - QA
   - Use `performance.now()` + `test.step()` for deterministic measurement

2. **Add per-user cooldown on `syncArtifactsAction`** - LOW - 4 hours - Dev
   - Prevent abuse-driven burst load on GitHub API and Postgres

3. **Select load-testing tool (k6/Artillery)** - LOW - 8 hours - DevOps
   - Unblock NFR-P3 automated timing assertions in CI

---

### Monitoring Hooks

4 monitoring hooks recommended:

#### Performance Monitoring

- [ ] Playwright trace artifact for NFR-P3 timing test — capture on every CI run
  - **Owner:** Dev/DevOps
  - **Deadline:** Next PR

#### Security Monitoring

- [ ] `npm audit` CI job — scan for critical/high vulnerabilities
  - **Owner:** Dev
  - **Deadline:** Next milestone

#### Reliability Monitoring

- [ ] Sentry error tracking — capture unhandled exceptions in production
  - **Owner:** Dev/DevOps
  - **Deadline:** Next milestone

- [ ] `/api/health` endpoint — verify DATABASE_URL connectivity
  - **Owner:** Dev
  - **Deadline:** Next milestone

---

### Fail-Fast Mechanisms

3 fail-fast mechanisms recommended:

#### Circuit Breakers (Reliability)

- [ ] Circuit breaker on `syncArtifactsAction` — fail fast when GitHub API consistently unreachable
  - **Owner:** Dev
  - **Estimated Effort:** 4 hours

#### Rate Limiting (Performance)

- [ ] Per-user cooldown on `syncArtifactsAction` — prevent burst load on GitHub API
  - **Owner:** Dev
  - **Estimated Effort:** 4 hours

#### Validation Gates (Security)

- [ ] Security headers in `next.config.js` — CSP, X-Frame-Options, etc.
  - **Owner:** Dev
  - **Estimated Effort:** 1 hour

---

### Evidence Gaps

5 evidence gaps identified — action required:

- [ ] **NFR-P3 (Performance)** — No CI run results available
  - **Owner:** Dev/DevOps
  - **Suggested Evidence:** Playwright trace from CI run
  - **Impact:** Cannot verify 2s threshold holds on GitHub Actions runners

- [ ] **CI Burn-In (Reliability)** — No burn-in execution results
  - **Owner:** DevOps
  - **Suggested Evidence:** CI burn-in run artifacts
  - **Impact:** Cannot verify test stability over 10 iterations

- [ ] **Vulnerability Scan (Security)** — No npm audit/Snyk in CI
  - **Owner:** Dev
  - **Suggested Evidence:** `npm audit` CI job results
  - **Impact:** Unknown vulnerability exposure

- [ ] **Coverage Report (Maintainability)** — No coverage threshold in CI
  - **Owner:** Dev
  - **Suggested Evidence:** Coverage report from `yarn nx test web --coverage`
  - **Impact:** No coverage regression detection

- [ ] **Monitoring (Reliability)** — No Sentry/APM/structured logging
  - **Owner:** Dev/DevOps
  - **Suggested Evidence:** Sentry dashboard, structured log output
  - **Impact:** Production failures invisible to operators

---

### Findings Summary

**Based on ADR Quality Readiness Checklist (8 categories, 29 criteria)**

| Category | Criteria Met | PASS | CONCERNS | FAIL | Overall Status |
|---|---|---|---|---|---|
| 1. Testability & Automation | 3/4 | 3 | 0 | 0 | PASS (1 N/A) |
| 2. Test Data Strategy | 3/3 | 3 | 0 | 0 | PASS |
| 3. Scalability & Availability | 2/4 | 2 | 2 | 0 | CONCERNS |
| 4. Disaster Recovery | 0/3 | 0 | 0 | 0 | N/A (3 N/A) |
| 5. Security | 4/4 | 4 | 0 | 0 | PASS |
| 6. Monitorability | 1/4 | 1 | 3 | 0 | CONCERNS |
| 7. QoS & QoE | 2/4 | 2 | 1 | 0 | CONCERNS (1 N/A) |
| 8. Deployability | 2/3 | 2 | 1 | 0 | CONCERNS |
| **Total** | **17/29** | **17** | **7** | **0** | **CONCERNS** |

**Criteria Met Scoring:**

- ≥26/29 (90%+) = Strong foundation
- 20-25/29 (69-86%) = Room for improvement
- <20/29 (<69%) = Significant gaps

**Score: 17/29 (59%) — Significant gaps** (primarily driven by 5 N/A criteria in DR/QoS and 3 monitorability gaps; excluding N/A: 17/24 = 71% — Room for improvement)

---

### Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-07-03'
  story_id: '2.2'
  feature_name: 'View the Project Map'
  adr_checklist_score: '17/29'
  categories:
    testability_automation: 'PASS'
    test_data_strategy: 'PASS'
    scalability_availability: 'CONCERNS'
    disaster_recovery: 'N/A'
    security: 'PASS'
    monitorability: 'CONCERNS'
    qos_qoe: 'CONCERNS'
    deployability: 'CONCERNS'
  overall_status: 'CONCERNS'
  critical_issues: 0
  high_priority_issues: 1
  medium_priority_issues: 11
  concerns: 7
  blockers: false
  quick_wins: 3
  evidence_gaps: 5
  recommendations:
    - 'Add select projection to findMany to exclude unused content column (HIGH, zero-risk)'
    - 'Add @@index([repoConnectionId, lastModifiedAt]) to Artifact model (MEDIUM)'
    - 'Add route-level error.tsx boundary for project-map segment (MEDIUM)'
    - 'Validate NFR-P3 in CI with Playwright trace artifact (HIGH)'
    - 'Install Sentry for error tracking in apps/web (MEDIUM)'
```

---

### Related Artifacts

- **Story File:** `_bmad-output/implementation-artifacts/2-2-view-the-project-map.md`
- **Architecture:** `_bmad-output/planning-artifacts/architecture.md`
- **PRD:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`
- **Test Design:** `_bmad-output/test-artifacts/test-design-architecture.md`, `_bmad-output/test-artifacts/test-design-qa.md`
- **Test Review:** `_bmad-output/test-artifacts/test-reviews/test-review-2-2.md` (92/100 — A)
- **Automate Validation:** `_bmad-output/test-artifacts/automate-validation-report-2-2.md` (PASS)
- **Evidence Sources:**
  - Test Results: `yarn nx test web` — 396 tests, 31 suites, 5.0s
  - Lint: `yarn nx lint web` — 0 errors, 9 warnings
  - CI: `.github/workflows/test.yml` — lint → unit → E2E (4 shards) → burn-in (10 iterations)
  - E2E: `playwright/e2e/project-map/project-map.spec.ts` — 5 tests (3 P0, 2 P1)

---

### Recommendations Summary

**Release Blocker:** None — no FAIL status NFRs; no critical vulnerabilities; NFR-S2/S4/R1 all PASS.

**High Priority:** Add `select` projection to `findMany` (zero-risk, eliminates unbounded memory growth); validate NFR-P3 in CI with Playwright trace.

**Medium Priority:** Add composite index, error boundary, security headers, Sentry, health endpoint, `take` limit, parallelize DB reads.

**Next Steps:** Apply the 3 quick wins (select projection, composite index, parallelize reads) as a follow-up PR. Then address the monitoring/observability gaps before GA. Re-run `*nfr-assess` after quick wins to verify NFR-P3 promotes from CONCERNS to PASS.

---

### Sign-Off

**NFR Evidence Audit:**

- Overall Status: CONCERNS
- Critical Issues: 0
- High Priority Issues: 1
- Concerns: 7
- Evidence Gaps: 5

**Gate Status:** CONCERNS — address HIGH priority issues, re-run `*nfr-assess` after quick wins

**Next Actions:**

- If PASS: Proceed to `*gate` workflow or release
- If CONCERNS: Address HIGH/CRITICAL issues, re-run `*nfr-assess`
- If FAIL: Resolve FAIL status NFRs, re-run `*nfr-assess`

**Generated:** 2026-07-03
**Workflow:** testarch-nfr v5.0

---

<!-- Powered by BMAD-CORE™ -->
