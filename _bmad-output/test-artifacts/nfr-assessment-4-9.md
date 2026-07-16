---
stepsCompleted:
  - step-01-load-context
  - step-02-define-thresholds
  - step-03-gather-evidence
  - step-04-evaluate-and-score
  - step-05-generate-report
lastStep: step-05-generate-report
lastSaved: '2026-07-14'
overallStatus: CONCERNS
workflowType: 'testarch-nfr-assess'
scope: 'Story 4.9 — Configure Custom Domain and Stable Production URL'
inputDocuments:
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/implementation-artifacts/4-9-configure-custom-domain-and-stable-production-url.md
  - _bmad-output/project-context.md
  - docs/runbooks/custom-domain-setup.md
  - apps/agent-be/test/unit/custom-domain-setup.spec.ts
---

# NFR Evidence Audit — Story 4.9: Configure Custom Domain and Stable Production URL

## Step 1: Context Loaded

### NFR Sources

| Source | Path | NFRs Referenced |
|---|---|---|
| Architecture | `_bmad-output/planning-artifacts/architecture.md` | NFR-S1 (sandbox credential isolation), NFR-S2 (per-user credential isolation), NFR-S4 (OAuth token storage), NFR-R4 (10 concurrent SSE connections) — none directly applicable to a domain configuration runbook |
| Epics | `_bmad-output/planning-artifacts/epics.md` | Story 4.9 (lines 1116-1144) — branding upgrade, not a functional requirement |
| Story 4.9 | `_bmad-output/implementation-artifacts/4-9-configure-custom-domain-and-stable-production-url.md` | 5 ACs, status: done; 9 review patches, 1 defer; NFR audit: 3 findings (2 MEDIUM, 1 LOW) |
| Project Context | `_bmad-output/project-context.md` | Credential-isolation + input-injection regression guards (line 241+), curl command patterns, env var conventions |

### NFRs in Scope for Story 4.9

Story 4.9 is a documentation + verification story. The deliverables are:
1. `docs/runbooks/custom-domain-setup.md` — a runbook documenting DNS, Vercel API, OAuth App, and verification steps
2. `apps/agent-be/test/unit/custom-domain-setup.spec.ts` — a regression guard test (24 tests)

No application code is modified. No Prisma queries, no DB operations, no API endpoints, no frontend components. The NFR surface is limited to the runbook's curl commands and the VERCEL_TOKEN extraction.

| NFR | Category | Threshold | Relevance to Story 4.9 |
|---|---|---|---|
| Reliability (curl error handling) | Reliability | curl commands must not silently fail on HTTP errors | **Primary** — 11 curl commands in the runbook document Vercel API calls with side effects |
| Reliability (curl timeout) | Reliability | curl commands must not hang indefinitely | **Primary** — same 11 curl commands |
| Security (credential isolation) | Security | No credentials leak in committed documents | **Primary** — runbook documents curl commands with `$VERCEL_TOKEN` |
| Security (input injection) | Security | Documented commands use placeholders, not hardcoded values | **Primary** — runbook uses `<custom-domain>` placeholder |
| Performance (select projections) | Performance | N/A | No Prisma queries |
| Performance (take limits) | Performance | N/A | No DB queries |
| Performance (timing tests) | Performance | N/A | No timing-sensitive operations |

### Evidence Availability

| Evidence Type | Status | Location / Result |
|---|---|---|
| Implementation | Available (Story 4.9 status: done) | `docs/runbooks/custom-domain-setup.md` (223 lines), `apps/agent-be/test/unit/custom-domain-setup.spec.ts` (226 lines) |
| Unit Tests | Available | 482 tests across 26 suites — ALL PASSING (agent-be 10.1s) |
| Test Results | **482 tests, 26 suites — ALL PASSING** | `yarn nx test agent-be -- --testPathPattern=custom-domain-setup` — run this session |
| Code Review | 9 patches applied, 1 deferred | Story 4.9 Review Findings section |
| CI Burn-In | Not run for Story 4.9 changes | CI pipeline exists — no execution results available |

---

## Step 2: NFR Categories & Thresholds

### NFR Matrix for Story 4.9

Scoped to the two deliverables: `docs/runbooks/custom-domain-setup.md` and `apps/agent-be/test/unit/custom-domain-setup.spec.ts`.

#### Security

| Criterion | Threshold | Source |
|---|---|---|
| Credential isolation | No literal credential values in runbook; `$VERCEL_TOKEN` env var reference used | `custom-domain-setup.spec.ts:184-213` (credential-isolation guards) |
| Input injection | Documented commands use `<custom-domain>` placeholder, not hardcoded domain values | `custom-domain-setup.spec.ts:215-225` (input-injection guards) |
| TLS configuration | Vercel automatically provisions TLS (Let's Encrypt) | `custom-domain-setup.md:86` |
| Security headers | Vercel automatically applies HSTS and security headers for custom domains | Vercel platform — not runbook-level |

#### Reliability

| Criterion | Threshold | Source |
|---|---|---|
| curl error handling | curl commands must detect HTTP errors (exit non-zero on 4xx/5xx) | `custom-domain-setup.md` — 11 curl commands |
| curl timeout | curl commands must not hang indefinitely | `custom-domain-setup.md` — 11 curl commands |
| Token extraction | VERCEL_TOKEN extraction must produce a valid token value | `custom-domain-setup.md:18` |
| Rollback procedure | Runbook documents rollback steps | `custom-domain-setup.md:156-189` |

#### Maintainability

| Criterion | Threshold | Source |
|---|---|---|
| Test coverage | All ACs have P0 regression guard tests | `custom-domain-setup.spec.ts` — 24 tests |
| Test quality | Tests are deterministic, isolated, <300 lines | `custom-domain-setup.spec.ts` — 226 lines |

---

## Step 3: Evidence Gathered

### Security Evidence

| Control | Location | Status |
|---|---|---|
| No literal VERCEL_TOKEN values | `custom-domain-setup.md` — all curl commands use `$VERCEL_TOKEN` | PASS |
| No `Bearer` followed by literal token | `custom-domain-setup.md` — all use `Bearer $VERCEL_TOKEN` | PASS |
| No DB connection strings with passwords | `custom-domain-setup.md` — none present | PASS |
| No literal `VAR=value` credential assignments | `custom-domain-setup.md` — `CREDENTIAL_ENV_VARS` guard passes | PASS |
| `<custom-domain>` placeholder used throughout | `custom-domain-setup.md` — all API commands use placeholder | PASS |
| `$VERCEL_TOKEN` env var reference used | `custom-domain-setup.md` — all curl commands | PASS |
| TLS provisioning documented | `custom-domain-setup.md:86` | PASS — Vercel auto-provisions Let's Encrypt |
| Rollback procedure documented | `custom-domain-setup.md:156-189` | PASS — 4-step rollback with envId derivation |

### Reliability Evidence

| Control | Location | Status |
|---|---|---|
| curl `--fail` flag on all commands | `custom-domain-setup.md` — 11 curl commands | **FAIL** — no curl command has `--fail` (NFR-1) |
| curl `--max-time` timeout on all commands | `custom-domain-setup.md` — 11 curl commands | **FAIL** — no curl command has `--max-time` (NFR-2) |
| VERCEL_TOKEN extraction strips quotes | `custom-domain-setup.md:18` | **CONCERNS** — `cut -d= -f2-` doesn't strip surrounding quotes (NFR-3) |
| Rollback procedure is independently executable | `custom-domain-setup.md:167-174` | PASS — envId derivation command added (Review Patch #2) |

### Maintainability Evidence

| Control | Location | Status |
|---|---|---|
| Test coverage | 24 tests, all passing | PASS — all 5 ACs have P0 coverage |
| Test quality | 226 lines, deterministic, isolated | PASS |
| Code review patches | 9 patches applied | PASS |
| Lint | 0 errors | PASS |

---

## Step 4: NFR Evidence Evaluation

### Security Assessment

- **Status:** PASS
- **Threshold:** No credentials leak in committed documents; commands use placeholders
- **Actual:** Runbook uses `$VERCEL_TOKEN` env var reference throughout. Regression guard test asserts no literal token values (`vcp_` prefix), no `Bearer` followed by literal token, no DB connection strings with passwords, no literal `VAR=value` credential assignments for 5 env vars (VERCEL_TOKEN, AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, DATABASE_URL). Input-injection guards assert `<custom-domain>` placeholder presence and `$VERCEL_TOKEN` env var reference.
- **Evidence:** `custom-domain-setup.md` (all curl commands), `custom-domain-setup.spec.ts:184-225`

### Reliability Assessment

- **Status:** CONCERNS
- **Threshold:** curl commands must detect HTTP errors and not hang indefinitely
- **Actual:** 3 findings (2 MEDIUM, 1 LOW). All 11 curl commands lack `--fail` flag (silent failures on 4xx/5xx) and `--max-time` timeout (hung API calls block operator). VERCEL_TOKEN extraction doesn't strip quotes from `.env.local` values.
- **Evidence:** `custom-domain-setup.md:71,82,99,106,115,163,170,179,204,213` (curl commands), `custom-domain-setup.md:18` (token extraction)

### Maintainability Assessment

- **Status:** PASS
- **Threshold:** All ACs have P0 coverage; tests are deterministic and isolated
- **Actual:** 24 regression guard tests, all passing (482 total tests across 26 suites). Test file is 226 lines. 9 code review patches applied.
- **Evidence:** `custom-domain-setup.spec.ts`, test execution this session

---

## Step 5: Final NFR Evidence Audit Report

**Date:** 2026-07-14
**Story:** 4.9 — Configure Custom Domain and Stable Production URL
**Overall Status:** CONCERNS

---

### Executive Summary

**Assessment:** Security PASS, Reliability CONCERNS (3 findings), Maintainability PASS

**Blockers:** 0 — no FAIL status on security or maintainability

**MEDIUM Priority Issues:** 2 — NFR-1 (curl `--fail`), NFR-2 (curl `--max-time`)

**NFR Patches Applied:** 0 (find-only mode per user instruction)

**NFR Findings Not Fixed (recorded in deferred-work.md):** 2 (NFR-1, NFR-2)

**Recommendation:** Approve with deferred findings. Story 4.9 is a documentation + verification story — the 2 MEDIUM reliability findings are runbook-level curl command improvements that don't affect the story's ACs or the regression guard test's validity. The runbook's Step 5 (end-to-end OAuth verification) serves as a backstop that catches silent curl failures. The findings should be picked up by a future story whose scope touches the runbook or operational scripts.

---

### NFR Findings

| # | Severity | Category | Finding | File | Fixed? |
|---|---|---|---|---|---|
| NFR-1 | MEDIUM | Reliability | curl commands lack `--fail` flag — silent failures on HTTP 4xx/5xx | `docs/runbooks/custom-domain-setup.md` (11 curl commands) | No — deferred |
| NFR-2 | MEDIUM | Reliability | curl commands lack `--max-time` timeout — hung API calls block operator | `docs/runbooks/custom-domain-setup.md` (11 curl commands) | No — deferred |
| NFR-3 | LOW | Reliability | VERCEL_TOKEN extraction doesn't strip surrounding quotes | `docs/runbooks/custom-domain-setup.md:18` | No — below MEDIUM threshold |

### Findings Summary

| Category | PASS | CONCERNS | FAIL | Overall Status |
|---|---|---|---|---|
| Security | 4 | 0 | 0 | PASS |
| Reliability | 1 | 3 | 0 | CONCERNS |
| Maintainability | 3 | 0 | 0 | PASS |
| Performance | N/A | N/A | N/A | N/A (no code) |
| **Total** | **8** | **3** | **0** | **CONCERNS** |

---

### Recommended Actions

#### Short-term (Next Milestone) - MEDIUM Priority

1. **Add `--fail` flag to all curl commands in custom domain setup runbook** - MEDIUM - 30 min - Dev
   - All 11 curl commands return exit code 0 on HTTP 4xx/5xx errors without `--fail`
   - An operator scripting the runbook gets false success signals
   - Recorded in deferred-work.md

2. **Add `--max-time 30` to all curl commands in custom domain setup runbook** - MEDIUM - 30 min - Dev
   - All 11 curl commands lack timeout — hung Vercel API blocks operator indefinitely
   - Recorded in deferred-work.md

3. **Strip quotes from VERCEL_TOKEN extraction** - LOW - 10 min - Dev
   - `cut -d= -f2-` doesn't strip surrounding quotes from `.env.local` values
   - Below MEDIUM threshold — not recorded in deferred-work.md
   - Similar issue deferred for Story 4.2's Railway token extraction (deferred-work.md line 380)
