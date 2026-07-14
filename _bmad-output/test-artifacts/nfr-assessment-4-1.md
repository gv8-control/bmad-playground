---
stepsCompleted:
  - step-01-load-context
  - step-02-define-thresholds
  - step-03-gather-evidence
  - step-04-evaluate-and-score
  - step-05-generate-report
lastStep: 'step-05-generate-report'
lastSaved: '2026-07-12'
workflowType: 'testarch-nfr-assess'
storyId: '4.1'
storyKey: '4-1-provision-the-vercel-project-for-apps-web'
storyFile: '_bmad-output/implementation-artifacts/4-1-provision-the-vercel-project-for-apps-web.md'
inputDocuments:
  - '_bmad-output/implementation-artifacts/4-1-provision-the-vercel-project-for-apps-web.md'
  - '_bmad-output/test-artifacts/atdd-checklist-4-1-provision-the-vercel-project-for-apps-web.md'
  - '_bmad-output/test-artifacts/nfr-assessment-3-12.md'
  - '_bmad-output/project-context.md'
  - 'apps/web/vercel.json'
  - 'apps/web/src/__tests__/vercel-config.spec.ts'
  - 'apps/web/src/components/conversation/AgentMessage.tsx'
  - 'apps/web/next.config.js'
  - 'apps/web/.gitignore'
  - '.gitignore'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

# NFR Evidence Audit - Story 4.1: Provision the Vercel Project for `apps/web`

**Date:** 2026-07-12
**Story:** 4.1
**Overall Status:** CONCERNS ⚠️

---

Note: This audit summarizes existing implementation evidence; it does not run tests or CI workflows. NFR thresholds and planned evidence come from PRD, architecture, and `test-design` outputs where available. Per user instruction, this audit focuses on NFR-specific issues only (missing select projections, take limits, timing tests, security headers).

## Executive Summary

**Assessment:** 6 PASS, 3 CONCERNS, 0 FAIL

**Blockers:** 0

**High Priority Issues:** 0

**Recommendation:** Proceed to release. Story 4.1 is an infrastructure/deployment story that creates a static `vercel.json` config file and deploys to Vercel production. No database code is touched (no select projections, no take limits applicable). The 3 CONCERNS findings are: (1) no automated security header verification test for the production deployment — pre-existing, platform-wide, now production-relevant; (2) CSP allows `unsafe-inline` and `unsafe-eval` in production — pre-existing in `next.config.js`, not modified by this story; (3) no build performance timing test — infrastructure concern, ATDD E2E explicitly deferred. None are introduced by Story 4.1's code changes. None block release.

---

## NFR Matrix for Story 4.1

| NFR | Category | Threshold | Relevance to Story 4.1 |
| --- | --- | --- | --- |
| **NFR-S1** | Security | Sandbox credential/network isolation | **Not applicable** — Story 4.1 does not inject credentials into sandboxes or modify sandbox network config. |
| **NFR-S2** | Security | Tenant-scoped credential/token lookups | **Not applicable** — Story 4.1 does not touch credential resolution or tenant-scoped database queries. |
| **NFR-S4** | Security | OAuth token storage — encrypted at rest | **Not applicable** — Story 4.1 does not touch OAuth token storage. |
| **NFR-P1** | Performance | First streamed token ≤1,500ms | **Not applicable** — Story 4.1 does not touch the streaming chat interface. |
| **NFR-P2** | Performance | Chat ready ≤10s of Conversation page open | **Not applicable** — Story 4.1 does not touch sandbox provisioning. |
| **NFR-P3** | Performance | Project Map loads ≤2s | **Not applicable** — Story 4.1 does not touch the Project Map. |
| **NFR-P4** | Performance | Artifact Browser loads ≤2s | **Not applicable** — Story 4.1 does not touch the Artifact Browser. |
| **NFR-P5** | Performance | Manual commit completes ≤5s | **Not applicable** — Story 4.1 does not touch manual commit. |
| **NFR-R1** | Reliability | Credential health updates within one git operation cycle | **Not applicable** — Story 4.1 does not touch credential health. |
| **NFR-R2** | Reliability | Committed Artifacts always recoverable | **Not applicable** — Story 4.1 does not touch artifact recovery. |
| **NFR-R3** | Reliability | SSE back-pressure (no silent event drops) | **Not applicable** — Story 4.1 does not touch SSE transport. |
| **NFR-R4** | Scalability | 10 concurrent SSE connections per browser session | **Not applicable** — Story 4.1 deploys `apps/web` only; NFR-R4 concerns `apps/agent-be` (Story 4.7). |
| **NFR-O1** | Observability | Per-user LLM spend monitoring | **Not applicable** — Story 4.1 does not touch spend monitoring (Epic 3, Story 3.8). |
| **Security Headers** | Security | CSP, HSTS, X-Frame-Options, etc. on production responses | **Primary** — Story 4.1 deploys `apps/web` to production. Security headers are in `next.config.js` (not modified by this story). No test verifies headers are present in the Vercel deployment. |
| **Build Performance** | Performance | Build completes within Vercel's timeout | **Primary** — Story 4.1's build command (`yarn nx run database-schemas:generate && yarn nx build web`) runs on Vercel. Build succeeded in ~4 minutes. No timing regression guard. |
| **Deployability** | Deployability | Auto-deploy disabled; manual deploy only | **Primary** — AC-2: `git.deploymentEnabled: false` in `vercel.json`. Architecture: "deploy is a manual trigger, not automatic on merge." |

---

## Performance Assessment

### Response Time (p95)

- **Status:** PASS ✅
- **Threshold:** N/A — no NFR-P1 through NFR-P5 applies to Story 4.1
- **Actual:** Story 4.1 creates a static JSON config file. No runtime code paths with latency sensitivity.
- **Evidence:** `apps/web/vercel.json` (9 lines, static JSON)
- **Findings:** None.

### Build Performance

- **Status:** CONCERNS ⚠️
- **Threshold:** Vercel default build timeout (45 min Pro plan)
- **Actual:** Build completed in ~4 minutes (Story 4.1 Completion Notes: "Build completed in ~4 minutes"). No timing regression guard exists to catch build performance degradation. The `vercel-config.spec.ts` tests validate config structure, not build performance.
- **Evidence:** Story 4.1 Dev Agent Record (Task 3 third attempt: "Build completed in ~4 minutes"), `vercel-config.spec.ts` (8 tests, all structural validation)
- **Findings:** [NFR][LOW] No timing test for build performance. The build succeeded, but there's no regression guard to catch performance degradation if dependencies grow or the build pipeline changes. Remediation: add a CI step that tracks Vercel build time and alerts on regression (e.g., build time > 10 minutes). Owner: CI/CD hardening (Story 4.6 or post-MVP).

### Resource Usage

- **CPU Usage**
  - **Status:** PASS ✅
  - **Threshold:** N/A
  - **Actual:** `vercel.json` is a static config file. No CPU usage concerns.
  - **Evidence:** `apps/web/vercel.json`

- **Memory Usage**
  - **Status:** PASS ✅
  - **Threshold:** N/A
  - **Actual:** `vercel.json` is a static config file. No memory usage concerns.
  - **Evidence:** `apps/web/vercel.json`

### Scalability

- **Status:** PASS ✅
- **Threshold:** NFR-R4 — 10 concurrent SSE connections per browser session
- **Actual:** NFR-R4 concerns `apps/agent-be` (Story 4.7), not `apps/web`. Story 4.1 deploys `apps/web` only. Vercel handles scaling for Next.js apps automatically.
- **Evidence:** `architecture.md` (NFR-R4 → Story 4.7), `epics.md` (NFR-R4 → Epic 3)
- **Findings:** No scalability regression.

---

## Security Assessment

### Authentication Strength

- **Status:** PASS ✅
- **Threshold:** Auth.js v5 on all `apps/web` routes
- **Actual:** Story 4.1 does not modify authentication. The production URL returns HTTP 302 redirect to `/sign-in` — the app requires auth. Pre-existing Auth.js v5 configuration unchanged.
- **Evidence:** Story 4.1 Task 3.5: "Production URL returns HTTP 302 redirect to `/sign-in?callbackUrl=%2F` — expected (app requires auth)"
- **Findings:** No authentication regression.

### Authorization Controls

- **Status:** PASS ✅
- **Threshold:** N/A — Story 4.1 does not touch authorization
- **Actual:** Story 4.1 does not modify authorization. No new routes, no new Server Actions, no new API endpoints.
- **Evidence:** Story 4.1 File List — only `vercel.json`, `vercel-config.spec.ts`, `AgentMessage.tsx`, `.gitignore` modified
- **Findings:** No authorization regression.

### Data Protection

- **Status:** PASS ✅
- **Threshold:** No secrets in committed files
- **Actual:** `VERCEL_TOKEN` is read from `.env.local` at runtime — not hardcoded in any committed file. The `.gitignore` changes add `.vercel` directory (Vercel CLI local project linking directory) to both root and `apps/web/.gitignore`. No secrets exposed.
- **Evidence:** `.gitignore` (`.vercel` entry), `apps/web/.gitignore` (`.vercel` entry), Story 4.1 Implementation Note #1: "Do NOT hardcode the token value in any committed file — read it from `.env.local` at runtime"
- **Findings:** No secret leakage.

### Security Headers

- **Status:** CONCERNS ⚠️
- **Threshold:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy on all production responses
- **Actual:** `apps/web/next.config.js` defines security headers via the `headers()` function: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Content-Security-Policy` with `default-src 'self'`, `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: https:`, `font-src 'self' data:`, `connect-src 'self' https://api.github.com <apiUrl>`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. These headers are pre-existing (not introduced or modified by Story 4.1 — `next.config.js` is explicitly listed as "Files NOT to modify"). However, Story 4.1 deploys to production, making these headers production-relevant. Two NFR-specific gaps:
  1. No test verifies these headers are actually present in the Vercel production deployment. The `vercel-config.spec.ts` only validates the `vercel.json` file structure. The ATDD checklist explicitly defers E2E coverage for external API operations.
  2. The CSP allows `script-src 'self' 'unsafe-inline' 'unsafe-eval'` — a permissive policy that weakens XSS protection in production.
- **Evidence:** `apps/web/next.config.js:16-49` (headers function), `apps/web/src/__tests__/vercel-config.spec.ts` (8 tests, all structural — no header verification), ATDD checklist (E2E deferred — "No browser-level mock pattern can simulate any of the deferred ACs")
- **Findings:**
  - [NFR][MEDIUM] No security header verification test for production deployment. Pre-existing, platform-wide, but now production-relevant. Remediation: add a Playwright E2E test or CI step that fetches the production URL (`https://bmad-easy.vercel.app`) and asserts security headers are present (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`). Owner: platform-wide hardening (Story 4.7 or post-MVP).
  - [NFR][LOW] CSP allows `unsafe-inline` and `unsafe-eval` in production. Pre-existing in `next.config.js` (not modified by this story, explicitly listed as "Files NOT to modify"). Remediation: tighten CSP to remove `unsafe-inline` and `unsafe-eval` (requires nonce-based CSP or hash-based CSP for Next.js inline scripts). Owner: platform-wide hardening (post-MVP).

### Vulnerability Management

- **Status:** PASS ✅
- **Threshold:** N/A (no dependency changes in Story 4.1)
- **Actual:** No new dependencies introduced. `vercel.json` is a static JSON config file. `AgentMessage.tsx` change is a TypeScript type fix — no new imports.
- **Evidence:** Story 4.1 File List — no `package.json` changes
- **Findings:** No new attack surface from dependencies.

### Input Validation

- **Status:** PASS ✅
- **Threshold:** N/A — Story 4.1 does not introduce user input handling
- **Actual:** `vercel.json` is a static config file with no user-controlled input. `AgentMessage.tsx` change is a TypeScript type fix for `extractText` — the function processes React children (already typed), not user input.
- **Evidence:** `apps/web/vercel.json` (static JSON), `apps/web/src/components/conversation/AgentMessage.tsx:17-19` (type cast fix)
- **Findings:** No input validation gap.

---

## Reliability Assessment

### Error Rate

- **Status:** PASS ✅
- **Threshold:** N/A
- **Actual:** Story 4.1 does not introduce runtime code. `vercel.json` is a static config. The `AgentMessage.tsx` change is a TypeScript type fix that resolves a build error (React 19 `ReactElement.props` defaults to `unknown`). No new error paths.
- **Evidence:** `apps/web/vercel.json` (static), `apps/web/src/components/conversation/AgentMessage.tsx:17-19` (type fix)
- **Findings:** No error handling regression.

### Fault Tolerance

- **Status:** PASS ✅
- **Threshold:** N/A
- **Actual:** Story 4.1's build command uses `&&` chaining: `yarn nx run database-schemas:generate && yarn nx build web`. If `prisma generate` fails, `nx build` won't run — correct fail-fast behavior. The build succeeded on the third attempt after fixing a pre-existing TypeScript error.
- **Evidence:** `apps/web/vercel.json:5` (buildCommand with `&&`), Story 4.1 Dev Agent Record (Task 3 attempts)
- **Findings:** No fault tolerance gap.

### CI Burn-In (Stability)

- **Status:** PASS ✅
- **Threshold:** P0 tests = 100% pass rate required
- **Actual:** 720 web tests pass (62 test suites), including the 8 vercel-config tests. All 8 tests are P0 or P1 tagged. 0 skipped. 0 failed.
- **Evidence:** `yarn nx test web -- --testPathPattern=vercel-config` — 720 passed, 0 failed, 0 skipped
- **Findings:** Test suite stable.

### Deployment Health

- **Status:** CONCERNS ⚠️
- **Threshold:** Production URL returns HTTP 200 or redirect to `/sign-in`
- **Actual:** Story 4.1 manually verifies the production URL returns HTTP 302 (redirect to `/sign-in`) — expected behavior (app requires auth). However, there's no automated test or CI step that verifies the production deployment remains healthy after future changes. The ATDD checklist explicitly defers E2E coverage for external API operations.
- **Evidence:** Story 4.1 Task 3.5: "Production URL returns HTTP 302 redirect to `/sign-in?callbackUrl=%2F` — expected", ATDD checklist (E2E deferred)
- **Findings:** [NFR][LOW] No automated production health check. Remediation: add a CI step or scheduled health check that fetches the production URL and asserts HTTP 200/302. Owner: CI/CD hardening (Story 4.6 or post-MVP).

---

## Maintainability Assessment

### Test Coverage

- **Status:** PASS ✅
- **Threshold:** P0 tests = 100% pass rate required
- **Actual:** 8 vercel-config tests active and passing. All P0-tagged tests cover AC-1 and AC-2. Coverage: file existence (1 test), framework preset (1), install command (1), build command content (3), auto-deploy disabled (1), schema validation (1).
- **Evidence:** `apps/web/src/__tests__/vercel-config.spec.ts` (8 tests, all passing)
- **Findings:** All ACs have P0 test coverage for the `vercel.json` config file.

### Code Quality (Select Projections)

- **Status:** PASS ✅
- **Threshold:** `select` projection on all DB reads AND writes (project-context.md:172)
- **Actual:** N/A — Story 4.1 does not touch database code. No Prisma queries, no `findFirst`, `findUnique`, `create`, `update`, or `delete` calls. The story creates a static JSON config file and fixes a TypeScript type error in a React component.
- **Evidence:** Story 4.1 File List — `vercel.json`, `vercel-config.spec.ts`, `AgentMessage.tsx`, `.gitignore` — no database code
- **Findings:** No select projection issues (N/A for this story).

### Technical Debt

- **Status:** PASS ✅
- **Threshold:** UNKNOWN
- **Actual:** Story 4.1 explicitly documents 1 deferred finding (DP-5): `next-env.d.ts` auto-generated churn from `next build` — reverted to baseline. 1 deferred test quality issue: P1 test casts `buildCommand as string` without `typeof` guard — pre-existing test pattern, low impact. All deferred items have clear owners and rationale.
- **Evidence:** Story 4.1 Review Findings section (2 items, both marked [x] or [Defer])
- **Findings:** No undocumented technical debt.

### Test Quality (Timing Tests)

- **Status:** PASS ✅
- **Threshold:** Timing regression guards for performance-sensitive paths
- **Actual:** N/A — Story 4.1 does not introduce timing-sensitive code paths. `vercel.json` is a static config file. `AgentMessage.tsx` change is a TypeScript type fix. No NFR-P1 through NFR-P5 performance thresholds apply. The build performance timing gap is noted in the Performance Assessment above (CONCERNS — infrastructure concern, not code concern).
- **Evidence:** `apps/web/vercel.json` (static), `apps/web/src/components/conversation/AgentMessage.tsx` (type fix)
- **Findings:** No timing test gap for Story 4.1's code changes.

---

## Quick Wins

0 quick wins identified. Story 4.1 creates a static config file — no database queries to add `select` projections to, no `take` limits to add, no timing-sensitive code paths to add regression guards for.

---

## Recommended Actions

### Immediate (Before Release) - CRITICAL/HIGH Priority

None. All critical and high-priority NFR controls are in place. The 1 MEDIUM finding (security header verification) is pre-existing and platform-wide. The 2 LOW findings (CSP permissiveness, build timing) are pre-existing or infrastructure concerns.

### Short-term (Next Milestone) - MEDIUM Priority

1. **Add security header verification test for production deployment** - MEDIUM - ~1 hour - Dev
   - Add a Playwright E2E test or CI step that fetches `https://bmad-easy.vercel.app` and asserts security headers are present
   - Assert: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`
   - Validation: test passes when all 6 headers are present with correct values
   - Owner: platform-wide hardening (Story 4.7 or post-MVP)

2. **Tighten CSP to remove `unsafe-inline` and `unsafe-eval`** - MEDIUM - ~2 hours - Dev
   - Replace `script-src 'self' 'unsafe-inline' 'unsafe-eval'` with nonce-based CSP or hash-based CSP
   - Next.js supports nonce-based CSP via `next.config.js` `headers()` function
   - Validation: CSP header no longer contains `unsafe-inline` or `unsafe-eval`; all inline scripts execute correctly
   - Owner: platform-wide hardening (post-MVP)

### Long-term (Backlog) - LOW Priority

1. **Add build performance timing regression guard** - LOW - ~30 min - Dev
   - Add a CI step that tracks Vercel build time and alerts on regression (e.g., build time > 10 minutes)
   - Validation: CI step runs after each deploy; alerts on threshold breach
   - Owner: CI/CD hardening (Story 4.6 or post-MVP)

2. **Add automated production health check** - LOW - ~30 min - Dev
   - Add a CI step or scheduled health check that fetches the production URL and asserts HTTP 200/302
   - Validation: health check runs on a schedule; alerts on failure
   - Owner: CI/CD hardening (Story 4.6 or post-MVP)

---

## Monitoring Hooks

2 monitoring hooks recommended:

### Security Monitoring

- [ ] Security header presence on production deployment
  - **Owner:** Dev
  - **Deadline:** Story 4.7 or post-MVP

### Reliability Monitoring

- [ ] Production URL health check (HTTP 200/302)
  - **Owner:** Dev
  - **Deadline:** Story 4.6 or post-MVP

---

## Fail-Fast Mechanisms

0 fail-fast mechanisms recommended. Story 4.1 creates a static config file — no circuit breakers, rate limiting, or validation gates needed.

---

## Evidence Gaps

2 evidence gaps identified:

- [ ] **Security header verification** (Security)
  - **Owner:** Dev
  - **Deadline:** Story 4.7 or post-MVP
  - **Suggested Evidence:** Playwright E2E test or CI step that fetches production URL and asserts security headers
  - **Impact:** No verification that security headers are present in the Vercel production deployment

- [ ] **Build performance baseline** (Performance)
  - **Owner:** Dev
  - **Deadline:** Story 4.6 or post-MVP
  - **Suggested Evidence:** CI step that tracks Vercel build time and alerts on regression
  - **Impact:** No regression guard for build performance degradation

---

## Findings Summary

**Based on NFR-specific issues only (missing select projections, take limits, timing tests, security headers)**

| NFR Category | Status | Findings | Introduced by Story 4.1? |
| --- | --- | --- | --- |
| **Missing select projections** | N/A | 0 — Story 4.1 does not touch database code | N/A |
| **Take limits** | N/A | 0 — Story 4.1 does not touch database code | N/A |
| **Timing tests** | CONCERNS ⚠️ | 1 LOW — No build performance timing regression guard | No — infrastructure concern, ATDD E2E explicitly deferred |
| **Security headers** | CONCERNS ⚠️ | 1 MEDIUM — No security header verification test for production; 1 LOW — CSP allows `unsafe-inline`/`unsafe-eval` | No — pre-existing in `next.config.js`, not modified by this story |
| **Deployment health** | CONCERNS ⚠️ | 1 LOW — No automated production health check | No — ATDD E2E explicitly deferred |
| **Total** | CONCERNS ⚠️ | 3 findings (1 MEDIUM, 2 LOW) | 0 introduced by Story 4.1 |

---

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-07-12'
  story_id: '4.1'
  feature_name: 'Provision the Vercel Project for apps/web'
  categories:
    security: 'CONCERNS'
    performance: 'CONCERNS'
    reliability: 'CONCERNS'
    maintainability: 'PASS'
    deployability: 'PASS'
  overall_status: 'CONCERNS'
  critical_issues: 0
  high_priority_issues: 0
  medium_priority_issues: 1
  concerns: 2
  blockers: false
  quick_wins: 0
  evidence_gaps: 2
  findings_introduced_by_story: 0
  recommendations:
    - 'Proceed to release. All 3 NFR findings are pre-existing or infrastructure concerns, not introduced by Story 4.1.'
    - 'Address security header verification as platform-wide hardening (Story 4.7 or post-MVP).'
    - 'Address CSP permissiveness as platform-wide hardening (post-MVP).'
```

---

## Related Artifacts

- **Story File:** `_bmad-output/implementation-artifacts/4-1-provision-the-vercel-project-for-apps-web.md`
- **ATDD Checklist:** `_bmad-output/test-artifacts/atdd-checklist-4-1-provision-the-vercel-project-for-apps-web.md`
- **Previous NFR Assessment:** `_bmad-output/test-artifacts/nfr-assessment-3-12.md`
- **Evidence Sources:**
  - Test Results: `yarn nx test web -- --testPathPattern=vercel-config` (720 passed, 0 failed)
  - Config Files: `apps/web/vercel.json`, `apps/web/next.config.js`
  - Test Files: `apps/web/src/__tests__/vercel-config.spec.ts`
  - Code Changes: `apps/web/src/components/conversation/AgentMessage.tsx`, `.gitignore`, `apps/web/.gitignore`

---

## Recommendations Summary

**Release Blocker:** None.

**High Priority:** None.

**Medium Priority:** 1 item — no security header verification test for production deployment (pre-existing, platform-wide).

**Low Priority:** 2 items — CSP allows `unsafe-inline`/`unsafe-eval` (pre-existing); no build performance timing test (infrastructure concern).

**Next Steps:** Proceed to release. Address security header verification as platform-wide hardening in Story 4.7 or post-MVP. Address CSP permissiveness as platform-wide hardening post-MVP.

---

## Sign-Off

**NFR Evidence Audit:**

- Overall Status: CONCERNS ⚠️
- Critical Issues: 0
- High Priority Issues: 0
- Concerns: 3 (1 MEDIUM, 2 LOW)
- Evidence Gaps: 2
- Findings Introduced by Story 4.1: 0

**Gate Status:** PASS ✅

**Next Actions:**

- If PASS ✅: Proceed to release. All 3 NFR findings are pre-existing or infrastructure concerns, not introduced by Story 4.1's code changes.
- Address the 1 MEDIUM finding (security header verification) as platform-wide hardening in Story 4.7 or post-MVP.
- Address the 2 LOW findings (CSP permissiveness, build timing) as platform-wide hardening post-MVP.

**Generated:** 2026-07-12
**Workflow:** testarch-nfr v5.0

---

<!-- Powered by BMAD-CORE™ -->
