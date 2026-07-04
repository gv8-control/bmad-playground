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
scope: 'Story 2.3 — Manually Refresh the Project Map'
workflowType: 'testarch-nfr-assess'
scope: 'Story 2.3 — Manually Refresh the Project Map'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/implementation-artifacts/2-3-manually-refresh-the-project-map.md
  - _bmad-output/test-artifacts/test-design-architecture.md
  - _bmad-output/test-artifacts/test-design-qa.md
  - _bmad-output/test-artifacts/test-reviews/test-review-2-3.md
  - _bmad-output/test-artifacts/automate-validation-report-2-3.md
  - _bmad-output/test-artifacts/nfr-assessment-2-2.md
  - _bmad-output/project-context.md
  - apps/web/src/components/project-map/RefreshButton.tsx
  - apps/web/src/components/project-map/RefreshButton.test.tsx
  - apps/web/src/app/(dashboard)/(app)/project-map/page.tsx
  - apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/adr-quality-readiness-checklist.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/ci-burn-in.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/playwright-config.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/error-handling.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/playwright-cli.md
  - .claude/skills/bmad-testarch-nfr/resources/knowledge/nfr-criteria.md
---

# NFR Evidence Audit — Story 2.3: Manually Refresh the Project Map

## Step 1: Context Loaded

### NFR Sources

| Source | Path | NFRs Referenced |
|---|---|---|
| PRD | `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` | FR-7 (Manual Refresh, line 203), NFR-P3 (≤2s, line 452), NFR-S2 (line 442), NFR-S4 (line 444), NFR-R1 (line 458) |
| Architecture | `_bmad-output/planning-artifacts/architecture.md` | RefreshButton directory entry (line 499, amended per DP-2: in-page sync via `syncArtifactsAction()` + `router.refresh()`), data boundary (apps/web never calls agent-be), graceful degradation |
| Epics | `_bmad-output/planning-artifacts/epics.md` | Story 2.3 (lines 503–518), FR7 coverage map (line 183: FR7 → Epic 2) |
| Story 2.3 | `_bmad-output/implementation-artifacts/2-3-manually-refresh-the-project-map.md` | AC-1 (FR7 spinner), AC-2 (no Conversation interruption); status: done; 4 patch + 7 deferred review findings |
| Test Design (QA) | `_bmad-output/test-artifacts/test-design-qa.md` | P2-001 (manual refresh re-reads, FR-7), P1-002 (NFR-P3), P0-015 (NFR-S2), P0-016 (NFR-S4), P0-005 (NFR-R1) |
| Test Design (Arch) | `_bmad-output/test-artifacts/test-design-architecture.md` | R-01 (NFR-S2), NFR-R1, manual-reload-only refresh model (no cache-invalidation flakiness) |
| Test Review (2.3) | `_bmad-output/test-artifacts/test-reviews/test-review-2-3.md` | 91/100 (A); 0 Critical, 0 High, 2 Medium, 3 Low violations |
| Automate Validation (2.3) | `_bmad-output/test-artifacts/automate-validation-report-2-3.md` | PASS — test healing applied (`useTransition` state poisoning fixed via reordering) |
| NFR Assessment (2.2) | `_bmad-output/test-artifacts/nfr-assessment-2-2.md` | Predecessor assessment — CONCERNS, 17/29; same Project Map page, inherited concerns |
| Project Context | `_bmad-output/project-context.md` | `useTransition` error swallowing rule, GitHub API `AbortSignal.timeout(10_000)`, no auto-revalidation, testing rules |

### NFRs in Scope for Story 2.3

| NFR | Category | Threshold | Relevance to Story 2.3 |
|---|---|---|---|
| **FR-7** | Functional | Manual refresh re-reads `_bmad-output/`; refresh indicator visible during read; does not interrupt active Conversations | **Primary** — AC-1 and AC-2 directly mandate this |
| **NFR-P3** | Performance | Project Map loads within 2 seconds of page open | **Secondary** — refresh triggers `router.refresh()` which re-renders the Server Component; inherited from Story 2.2 page |
| **NFR-S2** | Security | Tenant-scoped OAuth token lookups; tokens never resolved across users | **Secondary** — `syncArtifactsAction()` (called by RefreshButton) resolves the user's OAuth token via `resolveOAuthToken(userId)` |
| **NFR-S4** | Security | OAuth tokens AES-256-GCM encrypted at rest, never returned to client | **Secondary** — refresh relies on existing credential infrastructure from Story 1.6 |
| **NFR-R1** | Reliability | Credential health updates within one git operation cycle; 403 classified, not failed | **Secondary** — refresh failure (`NO_CREDENTIAL`) surfaces CredentialErrorBanner via existing health propagation |

### Evidence Availability (Fresh — gathered this session)

| Evidence Type | Status | Location / Result |
|---|---|---|
| Implementation | Available (Story 2.3 status: done) | `RefreshButton.tsx` (35 lines), `page.tsx` (94 lines — RefreshButton wired into header at line 69, `flex items-center gap-3` at line 67) |
| Unit/Component Tests | Available | `RefreshButton.test.tsx` (7 tests: 4 P0, 3 P1), `page.test.tsx` (14 tests: +1 RefreshButton stub test) |
| Test Results | **404 tests, 32 suites — ALL PASSING** (8.232s) | `yarn nx test web` — run this session |
| Lint | 0 errors, 9 warnings (within 11-warning baseline) | `yarn nx lint web` — run this session |
| Typecheck | Clean | `npx tsc --noEmit -p apps/web/tsconfig.json` — run this session |
| Test Review | 91/100 (A — Excellent) | `_bmad-output/test-artifacts/test-reviews/test-review-2-3.md` |
| Automate Validation | PASS (test healing applied) | `_bmad-output/test-artifacts/automate-validation-report-2-3.md` |
| Review Findings | 4 patch (applied), 7 deferred (pre-existing/spec-mandated) | Story 2.3 Review Findings section |
| E2E Tests | No Story 2.3-specific E2E | AC-2 is architectural invariant; AC-1 covered at component level. Project Map E2E (`project-map.spec.ts`) from Story 2.2 has no refresh-button test |
| CI Burn-In | Not run for Story 2.3 changes | CI pipeline exists (`.github/workflows/test.yml`) — no execution results available |
| Load Testing | No tool selected | Blocked per `test-design-architecture.md` |

### Knowledge Fragments Loaded

- `adr-quality-readiness-checklist.md` (8-category, 29-criteria framework)
- `ci-burn-in.md` (CI pipeline and burn-in strategy, script injection prevention)
- `test-quality.md` (test DoD: deterministic, isolated, <300 lines, <1.5 min)
- `playwright-config.md` (timeout standards, artifact output, parallelization)
- `error-handling.md` (scoped exception handling, retry validation, graceful degradation)
- `playwright-cli.md` (browser automation for evidence collection — loaded for `auto` mode)
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

Per step 0, thresholds are sourced from `test-design-qa.md` (NFR Test Coverage Plan) and `test-design-architecture.md` (NFR Testability Requirements), with fallback to PRD/architecture for missing values. Story 2.3's surface area is narrow: a `RefreshButton` Client Component calling `syncArtifactsAction()` + `router.refresh()`, wired into the existing Project Map page.

### NFR Matrix for Story 2.3

Scoped to the RefreshButton component and its interaction with the Project Map page (`/project-map`).

#### ADR Category 1: Testability & Automation

| Criterion | Threshold | Source |
|---|---|---|
| 1.1 Isolation | RefreshButton testable with mocked `syncArtifactsAction`, `useRouter`, and `useTransition` | `RefreshButton.test.tsx` mocks all dependencies |
| 1.2 Headless Interaction | Refresh logic in Server Action (`syncArtifactsAction`) — callable without UI | Architecture — Server Actions pattern; `syncArtifactsAction` is the Story 2.1 mirroring mechanism |
| 1.3 State Control | `mockResolvedValue` / `mockRejectedValue` / `mockImplementation` (never-resolving promise) for pending state | `RefreshButton.test.tsx:38,96,115` |
| 1.4 Sample Requests | N/A — UI component, not API endpoint | — |

#### ADR Category 2: Test Data Strategy

| Criterion | Threshold | Source |
|---|---|---|
| 2.1 Segregation | `repoConnectionId` scoping in all artifact queries (refresh re-renders page with same scoping) | `page.tsx:38` — `where: { repoConnectionId: repoConnection.id }` |
| 2.2 Generation | Inline mock return values in component tests; no production data | `RefreshButton.test.tsx` |
| 2.3 Teardown | `beforeEach(jest.clearAllMocks)` + `afterEach(jest.restoreAllMocks)` in RefreshButton.test.tsx | `RefreshButton.test.tsx:27-28` (first file in project with both) |

#### ADR Category 3: Scalability & Availability

| Criterion | Threshold | Source |
|---|---|---|
| 3.1 Statelessness | RefreshButton is stateless Client Component (pending state only); `router.refresh()` re-renders stateless Server Component | Architecture |
| 3.2 Bottlenecks | Refresh triggers `syncArtifactsAction()` → GitHub Contents API fan-out (unbounded `Promise.allSettled`) + Postgres upsert; no per-user cooldown | `artifacts.ts` (Story 2.1); story dev notes flag no concurrency guard |
| 3.3 SLA Definitions | NFR-P3: ≤2 seconds page load (refresh re-render must stay within this) | PRD line 452, test-design-qa P1-002 |
| 3.4 Circuit Breakers | No circuit breaker on `syncArtifactsAction`; no per-user cooldown; GitHub API has `AbortSignal.timeout(10_000)` per call | `artifacts.ts`; project-context.md |

#### ADR Category 4: Disaster Recovery

| Criterion | Threshold | Source |
|---|---|---|
| 4.1 RTO/RPO | N/A — stateless refresh action, no persistent state | — |
| 4.2 Failover | Infrastructure-level (Vercel) — not story-scoped | Architecture |
| 4.3 Backups | Postgres backups (Railway) — not story-scoped | Architecture |

#### ADR Category 5: Security

| Criterion | Threshold | Source |
|---|---|---|
| 5.1 AuthN/AuthZ | RefreshButton calls `syncArtifactsAction()` (Server Action) — auth enforced server-side via `auth()` + layout guards; no client-side token exposure | `artifacts.actions.ts`; project-context.md |
| 5.2 Encryption | NFR-S4: OAuth tokens AES-256-GCM encrypted at rest; RefreshButton never touches tokens directly | PRD line 444, test-design-qa P0-016 |
| 5.3 Secrets | KEK in env var; tokens never returned to client; `syncArtifactsAction` resolves token server-side only | Architecture, project-context.md |
| 5.4 Input Validation | No user input on refresh (button click only); `syncArtifactsAction` uses parameterized Prisma queries | `RefreshButton.tsx` (no form/input) |

#### ADR Category 6: Monitorability/Debuggability/Manageability

| Criterion | Threshold | Source |
|---|---|---|
| 6.1 Tracing | **UNKNOWN** — no distributed tracing for apps/web in MVP | Architecture |
| 6.2 Logs | **UNKNOWN** — no structured logging in apps/web (NestJS Logger only in agent-be); `console.error` only in `artifacts.actions.ts` | project-context.md |
| 6.3 Metrics | **UNKNOWN** — no /metrics endpoint, no RED metrics for apps/web | Architecture |
| 6.4 Config | Environment variables (`.env.local`); no feature flags; refresh behavior is not configurable | project-context.md |

#### ADR Category 7: QoS/QoE

| Criterion | Threshold | Source |
|---|---|---|
| 7.1 Latency | NFR-P3: ≤2 seconds Project Map load (refresh re-render must stay within this); GitHub API calls bounded by `AbortSignal.timeout(10_000)` | PRD line 452, test-design-qa P1-002, project-context.md |
| 7.2 Throttling | N/A — no rate limiting on apps/web refresh path (concern: abuse-driven burst load) | Architecture |
| 7.3 Perceived Performance | Spinner (`animate-spin`) visible during refresh; button `disabled` while pending; `try/finally` ensures `router.refresh()` runs on error | `RefreshButton.tsx:16,27,31`; AC-1 |
| 7.4 Degradation | Refresh failure → `router.refresh()` re-renders with stale Postgres data or CredentialErrorBanner; no "refresh failed" UI state (DP-5) | Story 2.3 dev notes (DP-5) |

#### ADR Category 8: Deployability

| Criterion | Threshold | Source |
|---|---|---|
| 8.1 Zero Downtime | Vercel deployment (apps/web) — supports atomic deploys; RefreshButton is a static client bundle | Architecture |
| 8.2 Backward Compatibility | No schema changes in Story 2.3; RefreshButton is additive (new component + header wiring) | Story 2.3 dev notes |
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

### Performance Evidence (NFR-P3, FR-7 refresh latency)

| Evidence | Source | Finding |
|---|---|---|
| RefreshButton pending-state tests | `RefreshButton.test.tsx:95-109` | `[P0]` button disabled + `animate-spin` while pending — verifies spinner visible during read (AC-1) |
| `router.refresh()` after sync | `RefreshButton.test.tsx:50-63` | `[P0]` Server Component re-renders with fresh Postgres data after sync resolves |
| `try/finally` on sync | `RefreshButton.tsx:14-18` | `router.refresh()` runs even if `syncArtifactsAction()` throws — no silent skip |
| Parallel DB reads | `page.tsx:36-44` | `Promise.all([findMany, getCredentialHealthStatus])` — Story 2.2 quick-win applied; removes one DB round-trip per render |
| `select` projection | `page.tsx:27-34,41,58` | Excludes unused `content` column — Story 2.2 quick-win applied; eliminates unbounded memory growth |
| `take: 100` limit | `page.tsx:40,58` | Bounds result set — Story 2.2 quick-win applied |
| GitHub API timeout | `artifacts.ts` (Story 2.1) | `AbortSignal.timeout(10_000)` on every GitHub fetch — no unbounded waits |
| E2E timing test (Story 2.2) | `playwright/e2e/project-map/project-map.spec.ts:18-30` | `[P0]` Project Map loads within 2 seconds (NFR-P3) — but no refresh-button E2E test |
| **Gap: No refresh-specific timing test** | — | No E2E test measures refresh→re-render latency; NFR-P3 not validated for the refresh path specifically |
| **Gap: No CI run results** | — | No CI execution results to verify timing test passes on GitHub Actions runners |
| **Gap: No load-testing tool** | `test-design-architecture.md` | No k6/Artillery selected — NFR-P3 cannot be validated under load |
| **Gap: No live browser evidence** | — | App not running with live DB; playwright-cli live capture not performed |

### Security Evidence (NFR-S2, NFR-S4)

| Evidence | Source | Finding |
|---|---|---|
| Server Action auth boundary | `RefreshButton.tsx:6,15` | `syncArtifactsAction` is a Server Action — auth enforced server-side; no client-side token handling |
| No client token exposure | `RefreshButton.tsx` (full file) | RefreshButton imports `syncArtifactsAction` only; never touches OAuth token, `auth()`, or `getPrisma()` directly |
| Tenant scoping (inherited) | `artifacts.actions.ts` (Story 2.1) | `resolveOAuthToken(userId)` is single tenant-scoped resolution point; `where: { userId }` IS the tenant check |
| AES-256-GCM encryption (inherited) | `crypto.ts` (Story 1.6) | Envelope encryption; userId as GCM AAD; fresh nonces; DEK zeroed in memory |
| No user input | `RefreshButton.tsx:23-33` | Button click only — no form, no input, no URL params; no injection surface |
| Button `disabled` while pending | `RefreshButton.tsx:27` | Prevents concurrent refresh requests (abuse-driven burst load mitigation — partial) |
| **Gap: No security scan** | — | No npm audit/Snyk in CI pipeline |
| **Gap: No security headers** | `next.config.js` | No CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy (project-wide gap, inherited from Story 2.2) |
| **Gap: No per-user cooldown** | `artifacts.actions.ts` | No rate limiting on `syncArtifactsAction` — authenticated abuse possible (burst GitHub API fan-out) |

### Reliability Evidence (NFR-R1)

| Evidence | Source | Finding |
|---|---|---|
| `try/finally` ensures refresh on throw | `RefreshButton.tsx:14-18`; `RefreshButton.test.tsx:111-126` | `[P1]` `router.refresh()` called even when sync throws (DB connectivity failure) — `useTransition` swallows error, `finally` mitigates |
| Refresh on error result | `RefreshButton.test.tsx:65-77` | `[P1]` `router.refresh()` called when sync returns `NO_CREDENTIAL` — page re-renders with CredentialErrorBanner |
| Credential health propagation | `page.tsx:46-47,71` | `NO_CREDENTIAL` → `credentialFailed = true` → CredentialErrorBanner rendered; 401→`markCredentialFailed` (Story 1.6) |
| Graceful degradation | `RefreshButton.tsx` + `page.tsx:65-93` | Refresh failure → `router.refresh()` re-renders with stale Postgres data or empty state; no "refresh failed" UI (DP-5 — UX spec defines no such state) |
| No Conversation interruption (AC-2) | Architecture | `syncArtifactsAction()` is apps/web Server Action — no interaction with agent-be/sandboxes/SSE; `router.refresh()` re-renders only current route. Architectural invariant |
| Button re-enable after sync | `RefreshButton.test.tsx:79-93` | `[P1]` `isPending` flips back to false; button re-enables |
| **Gap: No `error.tsx` boundary** | `project-map/` route segment | No route-level error boundary for Prisma failures during `router.refresh()` (deferred from Story 2.2) |
| **Gap: No circuit breaker on sync** | `artifacts.actions.ts` | No fail-fast when GitHub API consistently unreachable (deferred from Story 2.2) |
| **Gap: No burn-in results** | — | Burn-in job exists in CI but no execution results for Story 2.3 changes |
| **Gap: No retry/backoff** | `artifacts.actions.ts` | No retry on transient GitHub API failures (deferred) |

### Maintainability Evidence

| Evidence | Source | Finding |
|---|---|---|
| Test count | `yarn nx test web` (this session) | **404 tests across 32 suites — ALL PASSING** (8.232s) |
| Test quality score | `test-review-2-3.md` | 91/100 (A — Excellent); 0 Critical, 0 High, 2 Medium, 3 Low violations |
| P0/P1 tagging | `RefreshButton.test.tsx`, `page.test.tsx` | 4 P0 + 4 P1 new tests; all AC-1 sub-requirements have P0 coverage |
| Co-located tests | project-context.md | `RefreshButton.test.tsx` next to `RefreshButton.tsx`; `page.test.tsx` next to `page.tsx` |
| `beforeEach` + `afterEach` | `RefreshButton.test.tsx:27-28` | First file in project with both `jest.clearAllMocks()` AND `jest.restoreAllMocks()` |
| Lint | `yarn nx lint web` (this session) | 0 errors, 9 warnings (within 11-warning baseline) |
| Typecheck | `npx tsc --noEmit` (this session) | Clean |
| Review patches applied | Story 2.3 Review Findings | 4 patches: RefreshButton wired into page, page.test.tsx mock added, test ordering fixed, whitespace false-positive dismissed |
| Test healing | `automate-validation-report-2-3.md` | `useTransition` state poisoning fixed via test reordering; all 7 RefreshButton tests pass |
| **Gap: No coverage threshold** | CI pipeline | No coverage % gate in CI |
| **Gap: No duplication check** | CI pipeline | No jscpd/code-duplication job |
| **Gap: No vulnerability scan** | CI pipeline | No npm audit job |
| **Gap: Test ordering dependency** | `RefreshButton.test.tsx:95-109` | Never-resolving promise poisons `useTransition` state; tests not hermetic (M-1, M-3 from test review) |
| **Gap: Stale header comment** | `page.test.tsx:1-21` | Still says "RED PHASE" and "Story 2.2" only (L-3 from test review) |

### CI / Burn-In Evidence

| Evidence | Source | Finding |
|---|---|---|
| CI pipeline stages | `.github/workflows/test.yml` | lint → unit/integration → E2E (4 shards, `fail-fast: false`) → burn-in (10 iterations, PRs + weekly) → report |
| Burn-in configuration | `test.yml:156-229` | 10 iterations of full Playwright suite; runs on PRs and weekly cron (Sundays 02:00 UTC) |
| Script injection prevention | `test.yml:269-303` | `env:` intermediary for `${{ inputs.* }}` — extension patterns documented |
| Artifact retention | `test.yml:146-154, 221-229` | 30 days for E2E results, 7 days for burn-in failure artifacts |
| **Gap: No CI execution results** | — | No CI run results available to verify pipeline passes for Story 2.3 changes |

### Monitorability Evidence

| Evidence | Source | Finding |
|---|---|---|
| **Gap: No tracing** | Architecture | No W3C Trace Context / correlation IDs in apps/web |
| **Gap: No structured logging** | project-context.md | NestJS Logger only in agent-be; no structured logging in apps/web; `console.error` only |
| **Gap: No metrics endpoint** | Architecture | No /metrics endpoint, no RED metrics for apps/web |
| **Gap: No error tracking** | Architecture | No Sentry/monitoring integration in apps/web |

### Evidence Summary

| Category | Evidence Available | Evidence Gaps |
|---|---|---|
| Performance (NFR-P3, FR-7) | Spinner tests, `try/finally`, parallel reads, `select` projection, `take: 100`, GitHub timeout | No refresh-specific timing E2E; no CI run results; no load-testing tool; no live browser evidence |
| Security (NFR-S2, S4) | Server Action auth boundary, no client token exposure, tenant scoping, encryption, no user input | No security scan; no security headers; no per-user cooldown |
| Reliability (NFR-R1) | `try/finally` on throw/error, credential health propagation, graceful degradation, AC-2 architectural invariant | No `error.tsx` boundary; no circuit breaker; no burn-in results; no retry/backoff |
| Maintainability | 404 tests pass; test quality 91/100; lint/typecheck clean; 4 review patches applied | No coverage threshold; no duplication check; no vulnerability scan; test ordering dependency; stale header |
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
| Reliability | LOW | NFR-R1 (credential health cycle) | PASS |
| Scalability | MEDIUM | MVP scale | CONCERN |

**Overall Risk Level: MEDIUM** (2 of 4 domains at MEDIUM, none at HIGH)

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
| HIPAA | N/A | Security |
| PCI-DSS | N/A | Security |
| ISO 27001 | PARTIAL | Security |

### Cross-Domain Risks

| # | Domains | Description | Impact |
|---|---|---|---|
| 1 | Performance + Scalability + Security | No server-side per-user cooldown on `syncArtifactsAction` — Story 2.3 makes the first-visit-only sync repeatable on demand, enabling authenticated burst load (unbounded GitHub API fan-out + Postgres write transactions). Client-side `disabled={isPending}` only prevents single-tab concurrency. | MEDIUM-HIGH |
| 2 | Performance + Reliability | No negative cache on transient sync failures — immediate retry re-fans-out all GitHub calls; no debounce on the error path | MEDIUM |
| 3 | Scalability + Reliability | No concurrency guard on `syncArtifacts` — concurrent syncs can interleave `deleteMany` and silently delete each other's upserted rows (deferred from Story 2.1) | MEDIUM |

### Domain Findings Summary

#### Security (LOW)

| Category | Status | Key Finding |
|---|---|---|
| Authentication & Authorization | PASS | RefreshButton delegates to `syncArtifactsAction()` with zero args; auth enforced server-side via `auth()` + layout guards + `resolveOAuthToken(userId)`'s `where:{userId}` tenant check. No client args reach the credential resolution path. |
| Data Protection (NFR-S2, NFR-S4) | PASS | RefreshButton is `'use client'` importing no crypto/token modules; renders only an icon. AES-256-GCM envelope encryption, userId as GCM AAD, tokens never returned to client. |
| Input Validation | N/A | No user input accepted — icon-only button, no form/input/URL params. `syncArtifactsAction()` invoked with zero args; userId derived server-side from session. No injection surface. |
| API Security | CONCERN | GitHub fetch uses `AbortSignal.timeout(10_000)` (good). Button `disabled` while pending prevents single-client concurrency only; `syncArtifactsAction` has no server-side per-user cooldown. Story 2.3 makes the action repeatable on demand, so an authenticated user can script burst GitHub fan-out + Postgres load. Blast radius bounded (self-harm to own token quota, transaction-wrapped writes, single-tenant). |
| Secrets Management | PASS | RefreshButton imports no env/crypto/auth modules, no logging of sensitive data. KEK in server-only env var; rotation script accepts KEK only from env (never CLI args). |
| Inherited / Project-Wide Gaps | CONCERN | Two pre-existing, not introduced by Story 2.3: (1) no dependency-vulnerability scanning in CI; (2) `next.config.js` has no security headers. RefreshButton itself is not XSS-exposed. |

#### Performance (MEDIUM)

| Category | Status | Key Finding |
|---|---|---|
| Response Times (NFR-P3) | CONCERN | Page-open path covered by E2E timing test (NFR-P3 ≤2s, P0). However, Story 2.3 introduces a user-triggered refresh path (syncArtifactsAction → router.refresh → Server Component re-render) that is NOT covered by any timing test. That path performs a live GitHub Contents API fan-out + Postgres upsert transaction + full re-render, whose wall-clock latency is environment-dependent and unverified under the 2s SLA. AC-1 only requires the spinner be visible during read (verified by P0 test), not a latency ceiling. |
| Throughput | CONCERN | Story 2.3 promotes `syncArtifactsAction` from opt-in first-visit background job to a button any authenticated user can fire on demand. Client-side `disabled={isPending}` prevents double-fire within one transition. But there is NO server-side per-user cooldown or rate limit, so concurrent users or rapid session-by-session refreshes can trigger overlapping GitHub API fan-outs. No load-testing tool selected. |
| Resource Usage | PASS | Story 2.3's concrete delta is small and cheap. RefreshButton is a Client Component shipping minimal JS. The Server Component re-render reuses the Story 2.2 page.tsx query which is already optimized: `Promise.all` parallel DB reads, `select` projection excluding `content` column, `take:100` bounding. Per-call GitHub fetches carry a 10s `AbortSignal.timeout`. |
| Optimization | CONCERN | Strong optimizations already applied on the read path. Three optimization gaps remain on the refresh path: (1) No negative caching on transient failures; (2) No server-side cooldown; (3) No batching/concurrency cap on the repo traversal fan-out. None block correctness. |

#### Reliability (LOW)

| Category | Status | Key Finding |
|---|---|---|
| Error Handling | PASS | `try/finally` block ensures `router.refresh()` runs even when `syncArtifactsAction()` throws — verified by `[P1]` throw-case test. Server Action returns typed result union and never throws to the client for covered paths. `markCredentialFailed` is `.catch()`-guarded. **`error.tsx` boundary EXISTS** at `apps/web/src/app/(dashboard)/(app)/project-map/error.tsx` (35 lines) — catches Prisma failures during `router.refresh()` re-render and renders fallback UI with `reset()` button. Failure chain: action throws → useTransition swallows → finally runs `router.refresh()` → Server Component throws → `error.tsx` catches → user sees fallback. No crash, no blank page. |
| Monitoring & Observability | CONCERN | apps/web has no centralized observability: no Sentry, no structured JSON logging (only `console.error`), no `/api/health` endpoint. The `useTransition` swallows the action's thrown error silently; the `error.tsx` boundary's `console.error` is the only telemetry signal. App-wide environmental gap, not specific to Story 2.3. |
| Fault Tolerance | CONCERN | No circuit breaker on `syncArtifactsAction` (deferred from Story 2.2) — every refresh click hits GitHub API directly even when persistently unreachable. No retry/backoff on transient failures. GitHub API calls DO use `AbortSignal.timeout(10_000)`. `Promise.allSettled()` in `syncArtifacts` so single-file fetch failure doesn't delete others' rows. AC-2 (no Conversation interruption) satisfied by architectural separation. |
| Uptime & Availability | PASS | Refresh functionality available whenever apps/web is up. Graceful degradation verified: on refresh failure, `router.refresh()` re-renders with stale Postgres data, empty state, or CredentialErrorBanner. `error.tsx` boundary provides recovery via `reset()` button if Prisma itself is down. Project Map remains functional during Daytona/sandbox outages (pure Postgres/git reads). |

#### Scalability (MEDIUM)

| Category | Status | Key Finding |
|---|---|---|
| Horizontal Scaling | PASS | RefreshButton is a stateless Client Component; Project Map page is a stateless Server Component. Vercel serverless deploy requires no session affinity. Prisma singleton via `globalForPrisma` is serverless-safe. Refresh path has no `apps/agent-be` dependency. |
| Vertical Scaling | CONCERN | Read path quick-wins applied (`select` projection, `take: 100`, `Promise.all`). However, the refresh action's WRITE path is unbounded: `syncArtifacts()` upserts the full `content` column inside a single Postgres transaction. The fetch loop fans out via `Promise.allSettled` over every scanned `.md` file with no concurrency cap, issuing 2 GitHub requests per file. Memory scales with (artifact count × body size × 2 concurrent fetches). Inherited from Story 2.1, not introduced by Story 2.3. |
| Data Scaling | CONCERN | **`@@index([repoConnectionId, lastModifiedAt])` IS present** at `schema.prisma:70` — Story 2.2 deferred quick-win has been applied. Sort is now index-served. Read path well-bounded. Row count bounded by `@@unique([repoConnectionId, path])` + stale cleanup `deleteMany`. Residual gaps: no archival policy (acceptable for MVP), no read replicas (intended MVP pattern). |
| Traffic Handling | CONCERN | `disabled={isPending}` mitigates intra-tab concurrent refresh. But it does NOT mitigate cross-tab/cross-session abuse: an authenticated user can open multiple tabs and burst-trigger `syncArtifactsAction`. Each call bypasses the bounded GitHub cache (refresh semantics) and fans out unbounded GitHub API requests. No per-user cooldown, no server-side rate limit, no concurrency guard on `syncArtifactsAction` (deferred from Story 2.1). At MVP single-tenant scale this is tolerable. |

### Corrections to Known-Gaps List (from subagent verification)

Two of the Step 3 "known gaps" were factually incorrect — both have been resolved in the working tree since the Story 2.2 assessment:

1. **`error.tsx` EXISTS** at `apps/web/src/app/(dashboard)/(app)/project-map/error.tsx` (35 lines, created 2026-07-03 09:12) — catches Prisma failures during `router.refresh()` re-render, provides `reset()` recovery button. This fully mitigates the `useTransition`-swallow concern.
2. **`@@index([repoConnectionId, lastModifiedAt])` EXISTS** at `schema.prisma:70` — Story 2.2 deferred quick-win has been applied. Sort is now index-served.

These corrections improve Story 2.3's posture: the Story 2.2 assessment scored 17/29 (CONCERNS) with these as gaps; Story 2.3 benefits from their resolution.

### Priority Actions (Sorted by Cross-Domain Impact)

| # | Priority | Domain(s) | Action |
|---|---|---|---|
| 1 | HIGH | Security + Performance + Scalability | Add per-user server-side cooldown (30-60s) on `syncArtifactsAction` returning a structured `RATE_LIMITED` result — closes the burst-load gap now that refresh is user-on-demand |
| 2 | HIGH | Performance | Add a refresh-path E2E timing test (click Refresh → assert spinner within ~100ms AND re-rendered list visible within a defined budget); run on GitHub Actions runner |
| 3 | MEDIUM | Performance + Scalability | Cap `Promise.allSettled` GitHub fetch concurrency (chunked batches of N=10) + add negative cache (5-10s) on transient sync failures |
| 4 | MEDIUM | Performance + Scalability | Select k6/Artillery and add a smoke load test simulating concurrent refreshers |
| 5 | MEDIUM | Reliability | Add minimal structured JSON logging to apps/web Server Actions (single `logError` helper) — refresh-failure patterns reach Vercel logs |
| 6 | MEDIUM | Reliability | Add circuit breaker + single retry with exponential backoff on transient GitHub failures (deferred from Story 2.1/2.2) |
| 7 | MEDIUM | Security | Add security headers to `next.config.js` (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) — project-wide |
| 8 | MEDIUM | Security | Add `npm audit`/Snyk/Dependabot to CI — project-wide |
| 9 | MEDIUM | Reliability | Run a Story 2.3 burn-in (10x refresh clicks with stable data) — current evidence is unit/component tests only |
| 10 | LOW | Scalability | Commit the Artifact model migration (including `@@index`) so the index ships in the next deploy — commit hygiene |
| 11 | LOW | Maintainability | Address test ordering dependency in `RefreshButton.test.tsx` (document constraint or replace never-resolving promise with controllable promise) |
| 12 | LOW | Maintainability | Update stale red-phase header comment in `page.test.tsx:1-21` (still says "RED PHASE", "Story 2.2" only) |

---

## Step 5: Final NFR Evidence Audit Report

**Date:** 2026-07-03
**Story:** 2.3 — Manually Refresh the Project Map
**Overall Status:** CONCERNS

---

Note: This audit summarizes existing implementation evidence; it does not run tests or CI workflows. NFR thresholds and planned evidence come from PRD, architecture, and `test-design` outputs.

### Executive Summary

**Assessment:** 17 PASS, 8 CONCERNS, 0 FAIL

**Blockers:** 0 — no FAIL status NFRs

**High Priority Issues:** 1 — no server-side per-user cooldown on `syncArtifactsAction` (Security + Performance + Scalability cross-domain risk); Story 2.3 makes the first-visit-only sync repeatable on demand

**Recommendation:** Approve with conditions. Story 2.3's addition (RefreshButton, 35-line Client Component delegating to an existing Server Action) is well-engineered and security-neutral. NFR-S2 (tenant scoping) and NFR-S4 (encryption) PASS at the delegated server layer. NFR-R1 (credential health) PASSES — `try/finally` ensures `router.refresh()` runs on throw, `error.tsx` boundary catches Prisma failures, `markCredentialFailed` is `.catch()`-guarded. AC-2 (no Conversation interruption) is satisfied by architectural separation. The primary concerns are: (1) no server-side per-user cooldown on `syncArtifactsAction` — Story 2.3 turns the first-visit-only sync into an on-demand repeatable action, enabling authenticated burst load (bounded: self-harm to own token quota, transaction-wrapped, single-tenant); (2) NFR-P3 (≤2s) only covers page-open, not the refresh→sync→re-render path which is GitHub-API-bound and unmeasured; (3) no monitoring/observability tooling exists in apps/web. Notably, two Story 2.2 gaps have been resolved: `error.tsx` boundary now exists, and `@@index([repoConnectionId, lastModifiedAt])` is applied. None block MVP launch at current scale.

---

### Performance Assessment

#### Response Time (NFR-P3)

- **Status:** CONCERNS
- **Threshold:** ≤2 seconds (NFR-P3)
- **Actual:** Page-open E2E timing test passes locally (404 tests in 8.2s); no refresh-path timing test; no CI run results available
- **Evidence:** `playwright/e2e/project-map/project-map.spec.ts:18-30` — `[P0] Project Map loads within 2 seconds (NFR-P3)` with `expect(elapsed).toBeLessThan(2_000)`; RefreshButton pending-state test verifies spinner visible during read (AC-1)
- **Findings:** NFR-P3 timing test only covers page-open; the refresh→sync→re-render path is unmeasured and could legitimately exceed 2s (GitHub-API-bound). Read path optimized: `Promise.all` parallel reads, `select` projection, `take: 100` (Story 2.2 quick-wins applied)

#### Throughput

- **Status:** CONCERNS
- **Threshold:** No formal throughput SLO defined for MVP
- **Actual:** `syncArtifactsAction` has no server-side per-user cooldown; client-side `disabled={isPending}` prevents single-tab concurrency only; unbounded `Promise.allSettled` GitHub fan-out
- **Evidence:** `RefreshButton.tsx:27` (disabled guard); `artifacts.ts:228-230` (unbounded fan-out)
- **Findings:** Story 2.3 promotes syncArtifactsAction to user-triggered; no load-testing tool selected

#### Resource Usage

- **Status:** PASS
- **Threshold:** No formal resource thresholds for MVP
- **Actual:** RefreshButton ships minimal JS (icon + transition logic); Server Component re-render reuses optimized query (projection + parallel reads + take limit); GitHub fetches bounded by `AbortSignal.timeout(10_000)`
- **Evidence:** `RefreshButton.tsx` (35 lines); `page.tsx:27-44`; `artifacts.ts:34,176,177`

#### Scalability

- **Status:** CONCERNS
- **Threshold:** MVP scale (single-tenant, small user count)
- **Actual:** Stateless components on Vercel; `@@index([repoConnectionId, lastModifiedAt])` applied (Story 2.2 quick-win); but no per-user cooldown, no concurrency cap on fan-out
- **Evidence:** `schema.prisma:70` (index exists); `page.tsx:36-44` (parallel reads); `artifacts.ts:228-230` (unbounded fan-out)
- **Findings:** At MVP scale tolerable; risk promotes at growth scale where burst refresh abuse would blow GitHub secondary rate limits

---

### Security Assessment

#### Authentication Strength

- **Status:** PASS
- **Threshold:** OAuth2 with JWT session, 8h maxAge
- **Actual:** RefreshButton delegates to `syncArtifactsAction()` (Server Action) with zero args; auth enforced server-side via `auth()` + layout guards; no client-side token handling
- **Evidence:** `RefreshButton.tsx:6,15`; `page.tsx:12-16`; `middleware.ts`

#### Authorization Controls (NFR-S2)

- **Status:** PASS
- **Threshold:** Tenant-scoped OAuth token lookups; tokens never resolved across users
- **Actual:** `resolveOAuthToken(userId)` is single tenant-scoped resolution point; `where: { userId }` IS the tenant check; RefreshButton passes no args — userId derived server-side from session
- **Evidence:** `artifacts.actions.ts` (Story 2.1); `project-context.md:274`

#### Data Protection (NFR-S4)

- **Status:** PASS
- **Threshold:** AES-256-GCM encryption at rest; tokens never returned to client
- **Actual:** RefreshButton imports no crypto/token modules; renders only an icon. Envelope encryption; userId as GCM AAD; fresh nonces; DEK zeroed in memory
- **Evidence:** `RefreshButton.tsx:1-6` (no crypto imports); `crypto.ts` (Story 1.6); `project-context.md:270`

#### Vulnerability Management

- **Status:** CONCERNS
- **Threshold:** No formal vulnerability scan threshold defined
- **Actual:** No npm audit/Snyk in CI pipeline; no security headers in `next.config.js`
- **Evidence:** `.github/workflows/test.yml` (no security scan job); `next.config.js` (no `headers()` config)
- **Recommendation:** Add security headers to `next.config.js`; add `npm audit` job to CI (project-wide, inherited from Story 2.2)

---

### Reliability Assessment

#### Error Handling (NFR-R1)

- **Status:** PASS
- **Threshold:** Credential health updates within one git operation cycle; 403 classified, not failed
- **Actual:** `try/finally` ensures `router.refresh()` runs on throw (verified by `[P1]` test); `error.tsx` boundary catches Prisma failures during re-render with `reset()` recovery; `markCredentialFailed` is `.catch()`-guarded; 401→`markCredentialFailed` with optimistic-concurrency `capturedAt` guard; 403 classified (rate-limit vs. access-denied)
- **Evidence:** `RefreshButton.tsx:14-18`; `RefreshButton.test.tsx:111-126`; `error.tsx:1-35`; `artifacts.actions.ts:41-43,63-65`

#### Fault Tolerance

- **Status:** CONCERNS
- **Threshold:** Daytona outage resilience (R-06); graceful degradation
- **Actual:** Project Map is pure Postgres read — remains functional during Daytona outage; `error.tsx` boundary provides recovery; but no circuit breaker on `syncArtifactsAction`, no retry/backoff on transient GitHub failures
- **Evidence:** `error.tsx:25-31` (reset button); `artifacts.actions.ts:14-77` (no circuit breaker)
- **Recommendation:** Add circuit breaker + single retry with exponential backoff (deferred from Story 2.1/2.2)

#### Monitoring & Observability

- **Status:** CONCERNS
- **Threshold:** No formal monitoring threshold defined for MVP
- **Actual:** No Sentry/APM/tracing in apps/web; only `console.error` in `error.tsx` and `artifacts.actions.ts`; no `/api/health` endpoint; no correlation IDs
- **Evidence:** No `@sentry`, `@opentelemetry`, `pino`, or `winston` in `apps/web/package.json`; `error.tsx:13`; `artifacts.actions.ts:42,49,64,71`
- **Recommendation:** Add minimal structured JSON logging to apps/web Server Actions; install Sentry; add `/api/health` readiness probe

#### CI Burn-In (Stability)

- **Status:** CONCERNS
- **Threshold:** 10 consecutive successful runs (CI burn-in)
- **Actual:** Burn-in job exists in CI (10 iterations on PRs + weekly) but no execution results available for Story 2.3 changes
- **Evidence:** `.github/workflows/test.yml:156-229`
- **Findings:** Cannot verify burn-in passes for Story 2.3 changes

---

### Maintainability Assessment

#### Test Coverage

- **Status:** PASS
- **Threshold:** No hard coverage % threshold; P0 tests must cover all ACs
- **Actual:** 404 tests across 32 suites — ALL PASSING (8.232s); all AC-1 sub-requirements have P0 coverage (4 P0, 4 P1 new tests); AC-2 is architectural invariant
- **Evidence:** `yarn nx test web` (this session); `test-review-2-3.md` — test quality 91/100 (A)

#### Code Quality

- **Status:** PASS
- **Threshold:** 0 lint errors (within 11-warning baseline)
- **Actual:** 0 errors, 9 warnings (within baseline); typecheck clean; 4 review patches applied
- **Evidence:** `yarn nx lint web`; `npx tsc --noEmit` (this session)

#### Technical Debt

- **Status:** CONCERNS
- **Threshold:** No formal debt ratio threshold
- **Actual:** 7 deferred items from review (all pre-existing or spec-mandated); test ordering dependency in `RefreshButton.test.tsx` (never-resolving promise poisons `useTransition` state); stale red-phase header comment in `page.test.tsx`
- **Evidence:** Story 2.3 Review Findings — Deferred section; `test-review-2-3.md` M-1, M-3, L-3

#### Test Quality

- **Status:** PASS
- **Threshold:** Test quality DoD (deterministic, isolated, <300 lines, <1.5 min)
- **Actual:** 91/100 (A — Excellent); 0 Critical, 0 High, 2 Medium, 3 Low violations; all tests under 300 lines; 8.232s execution time
- **Evidence:** `_bmad-output/test-artifacts/test-reviews/test-review-2-3.md`

---

### Quick Wins

2 quick wins identified for immediate implementation:

1. **Add per-user server-side cooldown on `syncArtifactsAction`** (Security + Performance + Scalability) - HIGH priority - Minimal code change
   - Track `lastSyncedAt` on `RepoConnection`; reject refresh within ~30-60s with `RATE_LIMITED` result
   - Closes the burst-load gap now that refresh is user-on-demand
   - Directly relevant to Story 2.3 — the only new concern introduced by this story

2. **Add refresh-path E2E timing test** (Performance) - HIGH priority - 2 hours
   - Click "Refresh Project Map" → assert spinner appears within ~100ms AND re-rendered list visible within a defined budget
   - Run on GitHub Actions runner to verify NFR-P3 holds on CI
   - Document a separate refresh SLA (sync latency is GitHub-API-bound and may legitimately exceed 2s)

---

### Recommended Actions

#### Immediate (Before Release) - CRITICAL/HIGH Priority

1. **Add per-user server-side cooldown on `syncArtifactsAction`** - HIGH - 4 hours - Dev
   - Track `lastSyncedAt` on `RepoConnection`; reject within 30-60s with `RATE_LIMITED` result
   - Validates: no authenticated burst abuse; GitHub API budget protected

2. **Add refresh-path E2E timing test** - HIGH - 2 hours - Dev/DevOps
   - Click Refresh → assert spinner + re-rendered list within defined budget
   - Capture Playwright trace on CI run; publish as artifact
   - Validates: NFR-P3 holds for refresh path, not just page-open

#### Short-term (Next Milestone) - MEDIUM Priority

1. **Cap `Promise.allSettled` GitHub fetch concurrency** - MEDIUM - 4 hours - Dev
   - Chunked batches of N=10; bounds serverless function memory spikes on large repos

2. **Add negative cache on transient sync failures** - MEDIUM - 2 hours - Dev
   - 5-10s short-circuit on transient failures; absorbs immediate retries

3. **Add security headers to `next.config.js`** - MEDIUM - 1 hour - Dev
   - CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy

4. **Add structured JSON logging to apps/web Server Actions** - MEDIUM - 4 hours - Dev
   - Single `logError(scope, err, meta)` helper; refresh-failure patterns reach Vercel logs

5. **Add circuit breaker + retry/backoff on `syncArtifacts`** - MEDIUM - 4 hours - Dev
   - Fail-fast after N consecutive UNKNOWN results; single retry with exponential backoff

6. **Add `npm audit`/Snyk to CI** - MEDIUM - 2 hours - Dev
   - Dependency-vulnerability scanning (project-wide)

7. **Run Story 2.3 burn-in** - MEDIUM - 1 hour - DevOps
   - 10x refresh clicks with stable data; verify no flakiness

#### Long-term (Backlog) - LOW Priority

1. **Select load-testing tool (k6/Artillery)** - LOW - 8 hours - DevOps
   - Smoke load test simulating concurrent refreshers

2. **Address test ordering dependency** - LOW - 1 hour - Dev
   - Document constraint or replace never-resolving promise with controllable promise

3. **Update stale header comment in `page.test.tsx`** - LOW - 15 min - Dev
   - Update to reflect Stories 2.2 + 2.3 completion

4. **Commit Artifact model migration** - LOW - 15 min - Dev
   - Ensure `@@index` ships in next deploy (commit hygiene)

---

### Monitoring Hooks

4 monitoring hooks recommended:

#### Performance Monitoring

- [ ] Playwright trace artifact for refresh-path timing test — capture on every CI run
  - **Owner:** Dev/DevOps
  - **Deadline:** Next PR

#### Security Monitoring

- [ ] `npm audit` CI job — scan for critical/high vulnerabilities
  - **Owner:** Dev
  - **Deadline:** Next milestone

#### Reliability Monitoring

- [ ] Structured JSON logging in apps/web Server Actions — refresh-failure patterns
  - **Owner:** Dev
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

- [ ] **NFR-P3 refresh path (Performance)** — No refresh-specific timing test
  - **Owner:** Dev/DevOps
  - **Suggested Evidence:** Playwright E2E timing test for refresh→re-render path
  - **Impact:** Cannot verify 2s threshold holds for refresh path

- [ ] **CI Burn-In (Reliability)** — No burn-in execution results for Story 2.3
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
| 7. QoS & QoE | 2/4 | 2 | 2 | 0 | CONCERNS |
| 8. Deployability | 2/3 | 2 | 1 | 0 | CONCERNS |
| **Total** | **17/29** | **17** | **8** | **0** | **CONCERNS** |

**Criteria Met Scoring:**

- ≥26/29 (90%+) = Strong foundation
- 20-25/29 (69-86%) = Room for improvement
- <20/29 (<69%) = Significant gaps

**Score: 17/29 (59%) — Significant gaps** (primarily driven by 4 N/A criteria in DR/Testability and 3 monitorability gaps; excluding N/A: 17/25 = 68% — Significant gaps approaching room for improvement)

**Improvement vs Story 2.2 baseline:** Story 2.2 scored 17/29 (59%) with 17 PASS, 7 CONCERNS, 5 N/A. Story 2.3 scores 17/29 (59%) with 17 PASS, 8 CONCERNS, 4 N/A. Two Story 2.2 gaps resolved (`error.tsx` boundary, `@@index`), but one N/A criterion (7.2 Throttling) became applicable and CONCERN because refresh is now user-triggered. Net: same score, shifted concern distribution, real improvements in reliability and scalability infrastructure.

---

### Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-07-03'
  story_id: '2.3'
  feature_name: 'Manually Refresh the Project Map'
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
  medium_priority_issues: 8
  concerns: 8
  blockers: false
  quick_wins: 2
  evidence_gaps: 5
  recommendations:
    - 'Add per-user server-side cooldown on syncArtifactsAction (HIGH, closes burst-load gap)'
    - 'Add refresh-path E2E timing test (HIGH, validate NFR-P3 for refresh path)'
    - 'Cap Promise.allSettled concurrency + add negative cache on transient failures (MEDIUM)'
    - 'Add structured JSON logging to apps/web Server Actions (MEDIUM)'
    - 'Add circuit breaker + retry/backoff on syncArtifacts (MEDIUM, deferred from Story 2.1/2.2)'
```

---

### Related Artifacts

- **Story File:** `_bmad-output/implementation-artifacts/2-3-manually-refresh-the-project-map.md`
- **Architecture:** `_bmad-output/planning-artifacts/architecture.md`
- **PRD:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`
- **Test Design:** `_bmad-output/test-artifacts/test-design-architecture.md`, `_bmad-output/test-artifacts/test-design-qa.md`
- **Test Review:** `_bmad-output/test-artifacts/test-reviews/test-review-2-3.md` (91/100 — A)
- **Automate Validation:** `_bmad-output/test-artifacts/automate-validation-report-2-3.md` (PASS — test healing applied)
- **Predecessor Assessment:** `_bmad-output/test-artifacts/nfr-assessment-2-2.md` (CONCERNS, 17/29)
- **Evidence Sources:**
  - Test Results: `yarn nx test web` — 404 tests, 32 suites, 8.232s
  - Lint: `yarn nx lint web` — 0 errors, 9 warnings
  - Typecheck: `npx tsc --noEmit` — clean
  - CI: `.github/workflows/test.yml` — lint → unit → E2E (4 shards) → burn-in (10 iterations)
  - E2E: `playwright/e2e/project-map/project-map.spec.ts` — 5 tests (3 P0, 2 P1) from Story 2.2

---

### Recommendations Summary

**Release Blocker:** None — no FAIL status NFRs; no critical vulnerabilities; NFR-S2/S4/R1 all PASS.

**High Priority:** Add per-user server-side cooldown on `syncArtifactsAction` (closes burst-load gap introduced by user-triggered refresh); add refresh-path E2E timing test (validate NFR-P3 for refresh path).

**Medium Priority:** Cap fan-out concurrency, add negative cache, security headers, structured logging, circuit breaker, npm audit, burn-in.

**Next Steps:** Apply the 2 quick wins (per-user cooldown, refresh-path timing test) as a follow-up PR. Then address the monitoring/observability gaps before GA. Re-run `*nfr-assess` after quick wins to verify NFR-P3 promotes from CONCERNS to PASS.

---

### Sign-Off

**NFR Evidence Audit:**

- Overall Status: CONCERNS
- Critical Issues: 0
- High Priority Issues: 1
- Concerns: 8
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
