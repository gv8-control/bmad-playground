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
storyId: '4.3'
storyKey: '4-3-add-a-dockerfile-for-apps-agent-be
storyFile: _bmad-output/implementation-artifacts/4-3-add-a-dockerfile-for-apps-agent-be.md
inputDocuments:
  - '_bmad-output/implementation-artifacts/4-3-add-a-dockerfile-for-apps-agent-be.md'
  - '_bmad-output/test-artifacts/atdd-checklist-4-3-add-a-dockerfile-for-apps-agent-be.md'
  - '_bmad-output/test-artifacts/nfr-assessment-4-2.md'
  - '_bmad-output/project-context.md'
  - 'apps/agent-be/Dockerfile'
  - '.dockerignore'
  - 'apps/agent-be/test/dockerfile.spec.ts'
  - 'apps/agent-be/test/dockerignore.spec.ts'
  - 'apps/agent-be/test/integration/railway-project-structure.integration.spec.ts'
  - 'apps/agent-be/src/main.ts'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

# NFR Evidence Audit - Story 4.3: Add a Dockerfile for `apps/agent-be`

**Date:** 2026-07-12
**Story:** 4.3
**Overall Status:** CONCERNS ⚠️

---

Note: This audit summarizes existing implementation evidence; it does not run tests or CI workflows. Per user instruction, this audit focuses on NFR-specific issues only (missing select projections, take limits, timing tests, security headers, container security, secret handling).

## Executive Summary

**Assessment:** 4 PASS, 4 CONCERNS, 0 FAIL

**Blockers:** 0

**High Priority Issues:** 0

**Recommendation:** Proceed to release. Story 4.3 creates a Dockerfile and `.dockerignore` for `apps/agent-be`. No database code is touched (select projections and take limits are N/A). Security headers are handled at the application level by `helmet()` in `main.ts` (line 14), which runs inside the container — no Dockerfile-level header configuration needed. The 4 CONCERNS findings are: (1) secret leakage risk persists in the Story 4.2 DATABASE_URL test that Story 4.3 modified but did not fix; (2) container runs as root with no USER directive; (3) NODE_ENV=production not set in the runtime stage; (4) HEALTHCHECK test claims "no curl install" but only asserts `node -e` presence, not `apt-get` absence — false confidence. None block release; all are hardening improvements.

---

## NFR Matrix for Story 4.3

| NFR | Category | Threshold | Relevance to Story 4.3 |
| --- | --- | --- | --- |
| **NFR-S1** | Security | Sandbox credential/network isolation | **Not applicable** — Story 4.3 does not inject credentials into sandboxes or modify sandbox network config. |
| **NFR-S2** | Security | Tenant-scoped credential/token lookups | **Not applicable** — Story 4.3 does not touch credential resolution or tenant-scoped database queries. |
| **NFR-S4** | Security | OAuth token storage — encrypted at rest | **Not applicable** — Story 4.3 does not touch OAuth token storage. |
| **NFR-P1** | Performance | First streamed token ≤1,500ms | **Not applicable** — Story 4.3 does not touch the streaming chat interface. |
| **NFR-P2** | Performance | Chat ready ≤10s of Conversation page open | **Not applicable** — Story 4.3 does not touch sandbox provisioning. |
| **NFR-P3** | Performance | Project Map loads ≤2s | **Not applicable** — Story 4.3 does not touch the Project Map. |
| **NFR-P4** | Performance | Artifact Browser loads ≤2s | **Not applicable** — Story 4.3 does not touch the Artifact Browser. |
| **NFR-P5** | Performance | Manual commit completes ≤5s | **Not applicable** — Story 4.3 does not touch manual commit. |
| **NFR-R1** | Reliability | Credential health updates within one git operation cycle | **Not applicable** — Story 4.3 does not touch credential health. |
| **NFR-R2** | Reliability | Committed Artifacts always recoverable | **Not applicable** — Story 4.3 does not touch artifact recovery. |
| **NFR-R3** | Reliability | SSE back-pressure (no silent event drops) | **Not applicable** — Story 4.3 does not touch SSE transport. |
| **NFR-R4** | Scalability | 10 concurrent SSE connections per browser session | **Not applicable** — Story 4.3 creates the Dockerfile; NFR-R4 concerns the deployed service (Story 4.7). |
| **NFR-O1** | Observability | Per-user LLM spend monitoring | **Not applicable** — Story 4.3 does not touch spend monitoring. |
| **Select Projections** | Maintainability | `select` projection on all Prisma DB reads/writes | **Not applicable** — Story 4.3 does not touch Prisma/database code. The Dockerfile and `.dockerignore` are static text files. |
| **Take Limits** | Maintainability | Bounded `take` on all Prisma collection queries | **Not applicable** — Story 4.3 does not touch database code. No `findFirst`, `findUnique`, `findMany` calls. |
| **Timing Tests** | Performance | Timing regression guards for performance-sensitive paths | **Not applicable** — Story 4.3 does not introduce timing-sensitive code paths. The Dockerfile is a build-time artifact, not a runtime performance path. |
| **Security Headers** | Security | CSP, HSTS, X-Frame-Options, etc. on production responses | **PASS** — Security headers are handled at the application level by `helmet()` in `apps/agent-be/src/main.ts:14` (`app.use(helmet())`), which runs inside the container. The Dockerfile does not need to configure security headers — `helmet()` sets them on every HTTP response. No action needed. |
| **Secret Handling** | Security | No secrets baked into image; no secrets in test output | **Primary** — The Dockerfile has no `ARG` or `ENV` directives with secret names (verified by 2 unit tests). The `.dockerignore` excludes `.env*` (verified by unit test). However, the integration test file modified by Story 4.3 still has `expect(vars).toHaveProperty('DATABASE_URL')` (line 200) which prints the entire `vars` object on assertion failure. |
| **Container Security** | Security | Container runs as non-root; NODE_ENV set | **Primary** — The Dockerfile has no `USER` directive (container runs as root). `NODE_ENV=production` is not set in the runtime stage. Both are container security best practices. |
| **Health Check Reliability** | Reliability | HEALTHCHECK polls correct endpoint with proper timeout | **Primary** — The HEALTHCHECK uses `127.0.0.1` (good — patched from `localhost`), polls `/health` (good — at root, not `/api/health`), has `--timeout=3s` (good). But the `http.get()` call has no request-level timeout, and no test guards the `127.0.0.1` fix against regression. |
| **Deployability** | Deployability | Manual deploy only; no auto-deploy | **Primary** — No GitHub repo connected to the Railway project. Architecture: "deploy is a manual trigger, not automatic on merge." |

---

## Performance Assessment

### Response Time (p95)

- **Status:** PASS ✅
- **Threshold:** N/A — no NFR-P1 through NFR-P5 applies to Story 4.3
- **Actual:** Story 4.3 creates a Dockerfile and `.dockerignore`. No runtime code paths with latency sensitivity.
- **Evidence:** Story 4.3 File List — `Dockerfile`, `.dockerignore`, test files
- **Findings:** None.

### Timing Tests

- **Status:** PASS ✅
- **Threshold:** N/A — no timing-sensitive code paths introduced
- **Actual:** Story 4.3 does not introduce timing-sensitive code. The Dockerfile is a build-time artifact. The HEALTHCHECK has Docker-level `--timeout=3s` (appropriate). The integration test uses `AbortSignal.timeout(10_000)` on Railway API calls (carried over from Story 4.2, good).
- **Evidence:** `apps/agent-be/Dockerfile:28` (`--timeout=3s`), `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:53` (`AbortSignal.timeout(10_000)`)
- **Findings:** None. No NFR-P1 through NFR-P5 performance thresholds apply.

### Resource Usage

- **CPU Usage**
  - **Status:** PASS ✅
  - **Threshold:** N/A
  - **Actual:** Story 4.3 creates a Dockerfile. No CPU usage concerns at runtime.
  - **Evidence:** Story 4.3 File List

- **Memory Usage**
  - **Status:** PASS ✅
  - **Threshold:** N/A
  - **Actual:** Story 4.3 creates a Dockerfile. No memory usage concerns at runtime.
  - **Evidence:** Story 4.3 File List

### Scalability

- **Status:** PASS ✅
- **Threshold:** NFR-R4 — 10 concurrent SSE connections per browser session
- **Actual:** NFR-R4 concerns the deployed `apps/agent-be` service (Story 4.7), not the Dockerfile created by Story 4.3.
- **Evidence:** `architecture.md` (NFR-R4 → Story 4.7)
- **Findings:** No scalability regression.

---

## Security Assessment

### Authentication Strength

- **Status:** PASS ✅
- **Threshold:** No secrets baked into Docker image
- **Actual:** The Dockerfile has no `ARG` or `ENV` directives with secret names. Two unit tests verify this: "No secret ARG directives in Dockerfile" and "No secret ENV directives in Dockerfile" — both check for `ANTHROPIC_API_KEY`, `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `DAYTONA_API_KEY`, `DAYTONA_API_URL`, `RAILWAY_TOKEN`.
- **Evidence:** `apps/agent-be/test/dockerfile.spec.ts:170-208` (credential isolation tests)
- **Findings:** No authentication regression.

### Authorization Controls

- **Status:** PASS ✅
- **Threshold:** N/A — Story 4.3 does not touch authorization
- **Actual:** Story 4.3 does not modify authorization. No new routes, no new API endpoints. The Dockerfile builds the existing `apps/agent-be` code without modification.
- **Evidence:** Story 4.3 File List — `main.ts` explicitly listed as "NOT to modify"
- **Findings:** No authorization regression.

### Data Protection

- **Status:** CONCERNS ⚠️
- **Threshold:** No secrets in committed files; no secrets leaked in test output/logs
- **Actual:** The Dockerfile and `.dockerignore` correctly prevent secrets from entering the Docker build context (`.dockerignore` excludes `.env*`, verified by unit test). However, the integration test file modified by Story 4.3 still contains `expect(vars).toHaveProperty('DATABASE_URL')` at line 200 — the exact secret leakage risk flagged in the Story 4.2 NFR audit. Story 4.3 applied the safe `Object.keys(vars).toContain()` pattern to its NEW test (RAILWAY_DOCKERFILE_PATH, line 236) but did NOT fix the existing DATABASE_URL test. The Story 4.2 NFR audit assigned ownership to "test hardening (Story 4.3 or post-MVP)" — Story 4.3 modified this file but left the issue unresolved.
- **Evidence:** `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts:200` (`expect(vars).toHaveProperty('DATABASE_URL')` — unsafe), `:236` (`expect(Object.keys(vars)).toContain('RAILWAY_DOCKERFILE_PATH')` — safe), Story 4.2 NFR audit finding (line 140)
- **Findings:**
  - [NFR][MEDIUM] Secret leakage risk persists in DATABASE_URL test. `expect(vars).toHaveProperty('DATABASE_URL')` at line 200 prints the entire `vars` object (containing `DATABASE_URL` with password, `PGPASSWORD`, `POSTGRES_PASSWORD`) on assertion failure. Story 4.3 applied the safe pattern to its new test but did not fix the existing test in the same file. Remediation: Replace `expect(vars).toHaveProperty('DATABASE_URL')` with `expect(Object.keys(vars)).toContain('DATABASE_URL')`, then extract only the DATABASE_URL value before asserting on it: `const databaseUrl = vars.DATABASE_URL; expect(databaseUrl).toBeDefined(); expect(databaseUrl.startsWith('postgresql://')).toBe(true);`. Owner: test hardening (post-MVP or next story touching this file).

### Container Security

- **Status:** CONCERNS ⚠️
- **Threshold:** Container runs as non-root user; NODE_ENV=production set
- **Actual:** The Dockerfile has no `USER` directive — the NestJS process runs as root inside the container. If an attacker achieves code execution through a dependency vulnerability, they have root privileges inside the container. Additionally, `NODE_ENV=production` is not set in the runtime stage. Without it, NestJS may run with development-mode behaviors (different error handling, verbose logging, potential debug info exposure). The code review deferred both: root user ("security best practice not in ACs") and NODE_ENV ("env var wiring is Story 4.5 scope"). However, from an NFR perspective, `NODE_ENV=production` is a Dockerfile-level concern (not a secret — it's a runtime mode flag), and the `node:24-slim` image includes a `node` user (UID 1000) that can be used without any additional setup.
- **Evidence:** `apps/agent-be/Dockerfile` (no `USER` directive, no `ENV NODE_ENV=production`), code review deferred findings (lines 386-387)
- **Findings:**
  - [NFR][MEDIUM] Container runs as root (no USER directive). The Dockerfile has no `USER` instruction — the process runs as root by default. Remediation: Add `USER node` after the `yarn install` in the runtime stage (the `node:24-slim` image includes a `node` user with UID 1000). The `yarn install` needs root permissions to write to `/app/node_modules`, so `USER node` must come after install. Owner: post-MVP hardening or next story touching the Dockerfile.
  - [NFR][MEDIUM] NODE_ENV=production not set in runtime stage. Without `NODE_ENV=production`, NestJS runs in development mode (verbose errors, potential debug info). Remediation: Add `ENV NODE_ENV=production` to the runtime stage. This is not a secret and does not need Story 4.5's env var wiring — it's a Dockerfile-level runtime mode flag, same as `EXPOSE 3001`. Owner: post-MVP hardening or next story touching the Dockerfile.

### Security Headers

- **Status:** PASS ✅
- **Threshold:** CSP, HSTS, X-Frame-Options, etc. on production responses
- **Actual:** Security headers are handled at the application level by `helmet()` in `apps/agent-be/src/main.ts:14` (`app.use(helmet())`). Helmet sets Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security (HSTS), and other security headers on every HTTP response. The Dockerfile does not need to configure security headers — `helmet()` runs inside the container and sets them on every response. The Story 4.2 NFR audit deferred this to Story 4.3 ("security headers on HTTP responses are N/A, deferred to Story 4.3 (Dockerfile)"); Story 4.3's Dev Notes correctly clarify: "security headers are already handled by `helmet()` in `main.ts` (line 14: `app.use(helmet())`), which runs inside the container. No action needed."
- **Evidence:** `apps/agent-be/src/main.ts:14` (`app.use(helmet())`), Story 4.3 Dev Notes (line 89)
- **Findings:** None. Security headers are correctly handled at the application level.

### Vulnerability Management

- **Status:** PASS ✅
- **Threshold:** N/A (no dependency changes in Story 4.3)
- **Actual:** No new dependencies introduced. The Dockerfile uses `node:24-slim` base image (official Node.js image). The runtime stage's dependency merge script combines existing root dependencies — no new packages added.
- **Evidence:** Story 4.3 File List — no `package.json` changes
- **Findings:** No new attack surface from dependencies.

### Input Validation

- **Status:** PASS ✅
- **Threshold:** N/A — Story 4.3 does not introduce user input handling
- **Actual:** The Dockerfile contains build commands that operate on committed source files, not user input. The HEALTHCHECK reads `process.env.PORT` (set by Railway, not user-controlled). The `.dockerignore` is a static text file.
- **Evidence:** ATDD checklist Regression Guard Check (lines 303-324)
- **Findings:** No input validation gap.

---

## Reliability Assessment

### Health Check Reliability

- **Status:** CONCERNS ⚠️
- **Threshold:** HEALTHCHECK polls correct endpoint with proper timeout; test guards against regression
- **Actual:** The HEALTHCHECK uses `127.0.0.1` (good — patched from `localhost` to prevent IPv6 `::1` resolution issues), polls `/health` (good — at root, not `/api/health`), has `--interval=30s --timeout=3s --start-period=10s --retries=3` (good). However: (1) the `http.get()` call has no request-level timeout — if the server accepts the TCP connection but never responds, the request hangs until Docker's `--timeout=3s` kills the process (a blunt instrument); (2) no test guards the `127.0.0.1` fix against regression — if someone edits the Dockerfile and changes it back to `localhost`, the test suite won't catch it; (3) the test "HEALTHCHECK uses Node.js (no curl install)" only asserts `node -e` is present, not that `apt-get install curl` is absent — the test name claims "no curl install" but the assertion doesn't verify that claim (false confidence).
- **Evidence:** `apps/agent-be/Dockerfile:28-29` (HEALTHCHECK), `apps/agent-be/test/dockerfile.spec.ts:164-167` (test only checks `node -e` presence)
- **Findings:**
  - [NFR][LOW] No test guarding HEALTHCHECK uses 127.0.0.1 (not localhost). The code review patched `localhost` → `127.0.0.1` to prevent IPv6 `::1` resolution issues, but no test asserts `127.0.0.1` is used. Remediation: Add a test in `dockerfile.spec.ts` that asserts the HEALTHCHECK command contains `127.0.0.1` and does NOT contain `localhost`. Owner: test hardening.
  - [NFR][LOW] HEALTHCHECK http.get has no request timeout. The `http.get()` call has no `req.setTimeout()`. If the server accepts the TCP connection but never responds, the request hangs until Docker's `--timeout=3s` kills it. Remediation: Add `r.setTimeout(2000, () => { process.exit(1); })` to the HEALTHCHECK node one-liner. Already deferred in code review — Docker `--timeout` handles it as a blunt instrument. Owner: post-MVP hardening.
  - [NFR][LOW] HEALTHCHECK test claims "no curl install" but doesn't verify absence. The test at `dockerfile.spec.ts:164` is named "HEALTHCHECK uses Node.js (no curl install)" but only asserts `expect(content).toMatch(/node\s+-e/)` — it checks that `node -e` is PRESENT, not that `apt-get install curl` is ABSENT. The test would pass even if someone added `RUN apt-get install curl` because it only checks for the presence of `node -e`, not the absence of `curl`/`apt-get`. Remediation: Add `expect(content).not.toMatch(/apt-get\s+install/i)` to the test, or add a separate test asserting no `apt-get install` directives in the Dockerfile. Owner: test hardening.

### Error Rate

- **Status:** PASS ✅
- **Threshold:** N/A
- **Actual:** Story 4.3 does not introduce runtime code. The Dockerfile is a build-time artifact. The HEALTHCHECK is a health probe, not an error path.
- **Evidence:** Story 4.3 File List
- **Findings:** No error handling regression.

### Fault Tolerance

- **Status:** PASS ✅
- **Threshold:** N/A
- **Actual:** The HEALTHCHECK has `--retries=3` — Docker marks the container unhealthy only after 3 consecutive failures. The Railway `healthcheckPath` provides a second health probe (complements the Dockerfile HEALTHCHECK). The `--start-period=10s` gives the app time to boot before health checks count.
- **Evidence:** `apps/agent-be/Dockerfile:28` (`--retries=3 --start-period=10s`), Railway `healthcheckPath: /health`
- **Findings:** No fault tolerance gap.

### CI Burn-In (Stability)

- **Status:** PASS ✅
- **Threshold:** P0 tests = 100% pass rate required
- **Actual:** All 20 Dockerfile unit tests pass, all 16 `.dockerignore` unit tests pass, all 8 integration tests pass (3 Story 4.3 + 5 Story 4.2). 347 total tests pass.
- **Evidence:** Story 4.3 Completion Notes: "All 20 unit tests pass (GREEN)" (Dockerfile), "All 16 unit tests pass (GREEN)" (.dockerignore), "All 8 integration tests pass (GREEN)" (Railway). Change Log: "All 347 tests pass."
- **Findings:** Test suite stable.

### Deployment Health

- **Status:** PASS ✅
- **Threshold:** Manual deploy only; no auto-deploy
- **Actual:** No GitHub repo connected to the Railway project. Railway deploy triggered manually via `railway up` CLI. Architecture: "deploy is a manual trigger, not automatic on merge."
- **Evidence:** Story 4.3 Completion Notes (Task 5), Story 4.3 Architecture Compliance section
- **Findings:** No deployment health regression.

---

## Maintainability Assessment

### Test Coverage

- **Status:** PASS ✅
- **Threshold:** P0 tests = 100% pass rate required
- **Actual:** 20 Dockerfile unit tests (all P0), 16 `.dockerignore` unit tests (all P0), 3 Story 4.3 integration tests (2 P0, 1 P1). All passing. Coverage spans: multi-stage structure, Corepack/Yarn, prisma generate ordering, HEALTHCHECK, EXPOSE, CMD, credential isolation (no secrets), `.dockerignore` exclusion patterns, Railway configuration (rootDirectory, RAILWAY_DOCKERFILE_PATH, healthcheckPath).
- **Evidence:** `apps/agent-be/test/dockerfile.spec.ts` (20 tests), `apps/agent-be/test/dockerignore.spec.ts` (16 tests), `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts` (8 tests, 3 Story 4.3)
- **Findings:** All ACs have P0 test coverage for the Dockerfile and `.dockerignore` structure.

### Code Quality (Select Projections)

- **Status:** PASS ✅ (N/A)
- **Threshold:** `select` projection on all DB reads AND writes (project-context.md:172)
- **Actual:** N/A — Story 4.3 does not touch database code. No Prisma queries, no `findFirst`, `findUnique`, `create`, `update`, or `delete` calls. The Dockerfile and `.dockerignore` are static text files.
- **Evidence:** Story 4.3 File List — no database code
- **Findings:** No select projection issues (N/A for this story).

### Code Quality (Take Limits)

- **Status:** PASS ✅ (N/A)
- **Threshold:** Bounded `take` on all Prisma collection queries
- **Actual:** N/A — Story 4.3 does not touch database code. No Prisma collection queries (`findMany`, `aggregate`, `groupBy`).
- **Evidence:** Story 4.3 File List — no database code
- **Findings:** No take limit issues (N/A for this story).

### Technical Debt

- **Status:** PASS ✅
- **Threshold:** UNKNOWN
- **Actual:** Story 4.3 explicitly documents 5 deferred findings (all marked [Defer]): non-deterministic dependency resolution, root user, NODE_ENV, healthcheck timeout, token quote stripping. All deferred items have clear owners and rationale. The DP-2 dependency merge (merging ALL root dependencies into the generated package.json) is a known tradeoff documented as a Decision.
- **Evidence:** Story 4.3 Review Findings section (5 items marked [Defer]), Decisions section (DP-2)
- **Findings:** No undocumented technical debt.

### Test Quality (Timing Tests)

- **Status:** PASS ✅
- **Threshold:** Timing regression guards for performance-sensitive paths
- **Actual:** N/A — Story 4.3 does not introduce timing-sensitive code paths. The Dockerfile is a build-time artifact. The HEALTHCHECK has Docker-level `--timeout=3s`. No NFR-P1 through NFR-P5 performance thresholds apply.
- **Evidence:** `apps/agent-be/Dockerfile:28` (`--timeout=3s`)
- **Findings:** No timing test gap for Story 4.3's code changes.

---

## Quick Wins

3 quick wins identified for immediate implementation:

1. **Fix secret leakage in DATABASE_URL test** (Security) - MEDIUM - ~5 min
   - Replace `expect(vars).toHaveProperty('DATABASE_URL')` with `expect(Object.keys(vars)).toContain('DATABASE_URL')` at line 200
   - Minimal code change — same pattern already applied to the RAILWAY_DOCKERFILE_PATH test at line 236

2. **Add test guarding 127.0.0.1 in HEALTHCHECK** (Reliability) - LOW - ~5 min
   - Add a test asserting HEALTHCHECK contains `127.0.0.1` and not `localhost`
   - No code changes needed — test-only addition

3. **Fix false-confidence "no curl install" test** (Maintainability) - LOW - ~5 min
   - Add `expect(content).not.toMatch(/apt-get\s+install/i)` to the existing test
   - No code changes needed — test-only addition

---

## Recommended Actions

### Immediate (Before Release) - CRITICAL/HIGH Priority

None. All critical and high-priority NFR controls are in place. Security headers are handled by `helmet()`. No secrets baked into the Docker image. The `.dockerignore` excludes `.env*` files. The HEALTHCHECK polls the correct endpoint.

### Short-term (Next Milestone) - MEDIUM Priority

1. **Fix secret leakage risk in DATABASE_URL test** - MEDIUM - ~5 min - Dev
   - Replace `expect(vars).toHaveProperty('DATABASE_URL')` (line 200) with `expect(Object.keys(vars)).toContain('DATABASE_URL')`
   - Extract only the DATABASE_URL value before asserting on it
   - Validation: test failure output does not contain `PGPASSWORD`, `POSTGRES_PASSWORD`, or the `DATABASE_URL` value
   - Owner: test hardening (post-MVP or next story touching this file)

2. **Add USER directive to Dockerfile** - MEDIUM - ~10 min - Dev
   - Add `USER node` after `yarn install` in the runtime stage
   - The `node:24-slim` image includes a `node` user with UID 1000
   - Validation: `docker run --rm agent-be:test id` shows `uid=1000(node)` not `uid=0(root)`
   - Owner: post-MVP hardening or next story touching the Dockerfile

3. **Set NODE_ENV=production in runtime stage** - MEDIUM - ~5 min - Dev
   - Add `ENV NODE_ENV=production` to the runtime stage
   - This is not a secret — it's a Dockerfile-level runtime mode flag
   - Validation: `docker run --rm agent-be:test node -e "console.log(process.env.NODE_ENV)"` prints `production`
   - Owner: post-MVP hardening or next story touching the Dockerfile

### Long-term (Backlog) - LOW Priority

1. **Add test guarding 127.0.0.1 in HEALTHCHECK** - LOW - ~5 min - Dev
   - Add a test in `dockerfile.spec.ts` asserting HEALTHCHECK contains `127.0.0.1` and not `localhost`
   - Validation: test fails if someone changes `127.0.0.1` back to `localhost`
   - Owner: test hardening

2. **Fix false-confidence "no curl install" test** - LOW - ~5 min - Dev
   - Add `expect(content).not.toMatch(/apt-get\s+install/i)` to the existing test at `dockerfile.spec.ts:164`
   - Validation: test fails if someone adds `RUN apt-get install curl` to the Dockerfile
   - Owner: test hardening

3. **Add request timeout to HEALTHCHECK http.get** - LOW - ~5 min - Dev
   - Add `r.setTimeout(2000, () => { process.exit(1); })` to the HEALTHCHECK node one-liner
   - Validation: HEALTHCHECK fails within 2s if server accepts connection but never responds
   - Owner: post-MVP hardening

---

## Monitoring Hooks

0 monitoring hooks recommended. Story 4.3 creates a Dockerfile — runtime monitoring is handled by Railway's health check probe and the Dockerfile's HEALTHCHECK instruction. No additional monitoring hooks needed for this story.

---

## Fail-Fast Mechanisms

2 fail-fast mechanisms already in place:

### Validation Gates (Security)

- [x] No secret ARG/ENV directives in Dockerfile — 2 unit tests verify absence of 9 secret names
  - **Owner:** Dev
  - **Estimated Effort:** Already implemented

### Health Checks (Reliability)

- [x] HEALTHCHECK instruction polls `GET /health` every 30s with 3 retries
  - **Owner:** Dev
  - **Estimated Effort:** Already implemented

---

## Evidence Gaps

0 evidence gaps identified. All NFR categories relevant to Story 4.3 have been assessed with evidence from the implementation files, test files, and previous NFR assessments.

---

## Findings Summary

**Based on NFR-specific issues only (missing select projections, take limits, timing tests, security headers, container security, secret handling)**

| NFR Category | Status | Findings | Introduced by Story 4.3? |
| --- | --- | --- | --- |
| **Missing select projections** | N/A | 0 — Story 4.3 does not touch database code | N/A |
| **Take limits** | N/A | 0 — Story 4.3 does not touch database code | N/A |
| **Timing tests** | PASS ✅ | 0 — no timing-sensitive code paths; `--timeout=3s` on HEALTHCHECK, `AbortSignal.timeout(10_000)` on API calls | N/A |
| **Security headers** | PASS ✅ | 0 — `helmet()` in `main.ts:14` handles security headers at the application level; no Dockerfile-level configuration needed | N/A |
| **Secret handling** | CONCERNS ⚠️ | 1 MEDIUM — Secret leakage risk persists in DATABASE_URL test (line 200); Story 4.3 applied safe pattern to new test but did not fix existing test | Partially — Story 4.3 modified the file but did not introduce the issue (Story 4.2 did); however, Story 4.3 was the assigned owner for the fix |
| **Container security** | CONCERNS ⚠️ | 2 MEDIUM — Container runs as root (no USER directive); NODE_ENV=production not set | Yes — both are properties of the Dockerfile created by Story 4.3 |
| **Health check reliability** | CONCERNS ⚠️ | 3 LOW — No test for 127.0.0.1; no request timeout on http.get; false-confidence "no curl install" test | Yes — all are properties of the Dockerfile/tests created by Story 4.3 |
| **Total** | CONCERNS ⚠️ | 6 findings (3 MEDIUM, 3 LOW) | 5 introduced or carried by Story 4.3; 1 pre-existing (Story 4.2) |

---

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-07-12'
  story_id: '4.3'
  feature_name: 'Add a Dockerfile for apps/agent-be'
  categories:
    security: 'CONCERNS'
    performance: 'PASS'
    reliability: 'CONCERNS'
    maintainability: 'PASS'
    deployability: 'PASS'
  overall_status: 'CONCERNS'
  critical_issues: 0
  high_priority_issues: 0
  medium_priority_issues: 3
  concerns: 3
  blockers: false
  quick_wins: 3
  evidence_gaps: 0
  findings_introduced_by_story: 5
  recommendations:
    - 'Proceed to release. All NFR findings are hardening improvements, not production code defects.'
    - 'Fix secret leakage risk in DATABASE_URL test (MEDIUM) — replace toHaveProperty with Object.keys().toContain().'
    - 'Add USER directive and NODE_ENV=production to Dockerfile (MEDIUM) — container security best practices.'
    - 'Add tests guarding 127.0.0.1 and absence of apt-get install (LOW) — regression guards.'
```

---

## Related Artifacts

- **Story File:** `_bmad-output/implementation-artifacts/4-3-add-a-dockerfile-for-apps-agent-be.md`
- **ATDD Checklist:** `_bmad-output/test-artifacts/atdd-checklist-4-3-add-a-dockerfile-for-apps-agent-be.md`
- **Previous NFR Assessment:** `_bmad-output/test-artifacts/nfr-assessment-4-2.md`
- **Evidence Sources:**
  - Dockerfile: `apps/agent-be/Dockerfile`
  - Dockerignore: `.dockerignore`
  - Unit tests: `apps/agent-be/test/dockerfile.spec.ts`, `apps/agent-be/test/dockerignore.spec.ts`
  - Integration tests: `apps/agent-be/test/integration/railway-project-structure.integration.spec.ts`
  - Application entry: `apps/agent-be/src/main.ts` (helmet security headers)
  - Architecture: `_bmad-output/planning-artifacts/architecture.md`
  - Epics: `_bmad-output/planning-artifacts/epics.md`

---

## Recommendations Summary

**Release Blocker:** None.

**High Priority:** None.

**Medium Priority:** 3 items — secret leakage in DATABASE_URL test (test hardening), container runs as root (Dockerfile hardening), NODE_ENV not set (Dockerfile hardening).

**Low Priority:** 3 items — no test for 127.0.0.1 (test gap), no request timeout on HEALTHCHECK http.get (reliability), false-confidence "no curl install" test (test fidelity).

**Next Steps:** Proceed to release. All 6 NFR findings are hardening improvements, not production code defects. The 3 quick wins (secret leakage fix, 127.0.0.1 test, curl absence test) can be applied in ~15 minutes total. The 3 MEDIUM findings (root user, NODE_ENV, secret leakage) should be addressed in the next story touching the Dockerfile or integration test file.

---

## Sign-Off

**NFR Evidence Audit:**

- Overall Status: CONCERNS ⚠️
- Critical Issues: 0
- High Priority Issues: 0
- Medium Priority Issues: 3
- Low Priority Issues: 3
- Evidence Gaps: 0
- Findings Introduced by Story 4.3: 5 (3 MEDIUM, 2 LOW — all hardening improvements)

**Gate Status:** PASS ✅

**Next Actions:**

- If PASS ✅: Proceed to release. All NFR findings are hardening improvements, not production code defects.
- Apply the 3 quick wins (secret leakage fix, 127.0.0.1 test, curl absence test) as test-hardening improvements.
- Address the 3 MEDIUM findings (root user, NODE_ENV, secret leakage) in the next story touching the Dockerfile or integration test file.

**Generated:** 2026-07-12
**Workflow:** testarch-nfr v5.0

---

<!-- Powered by BMAD-CORE™ -->
