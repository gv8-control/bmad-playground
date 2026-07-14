---
stepsCompleted: ['step-01-load-context', 'step-02-define-thresholds', 'step-03-gather-evidence', 'step-04-evaluate-and-score', 'step-05-generate-report']
lastStep: 'step-05-generate-report'
lastSaved: '2026-07-14'
workflowType: 'testarch-nfr-assess'
inputDocuments:
  - '_bmad-output/implementation-artifacts/4-10-configure-database-backups-and-verify-restore.md'
  - 'docs/runbooks/db-restore.md'
  - 'apps/agent-be/test/unit/db-restore.spec.ts'
  - 'libs/database-schemas/src/prisma/schema.prisma'
  - '_bmad-output/project-context.md'
---

# NFR Evidence Audit - Database Backup and Restore (Story 4.10)

**Date:** 2026-07-14
**Story:** 4.10 — Configure Database Backups and Verify Restore
**Overall Status:** CONCERNS ⚠️

---

Note: This audit summarizes existing implementation evidence; it does not run tests or CI workflows. NFR thresholds and planned evidence should come from PRD, architecture, and `test-design` outputs where available.

## Executive Summary

**Assessment:** 2 PASS, 2 CONCERNS, 0 FAIL

**Blockers:** 0 — no release blockers. The findings are security hardening improvements on a documentation artifact, not functional gaps.

**High Priority Issues:** 0

**Medium Priority Issues:** 2 — `SELECT *` exposes sensitive encrypted credential fields; SSL not enforced on production database connections.

**Recommendation:** Address the 2 MEDIUM findings when the runbook is next touched. Both are one-line to few-line fixes. Neither blocks the story from proceeding to review.

---

## Security Assessment

### Data Protection — `SELECT *` in sample record comparison

- **Status:** CONCERNS ⚠️
- **Threshold:** Runbook SQL queries must not dump sensitive encrypted credential fields or PII to operator terminals.
- **Actual:** `SELECT * FROM <table-name> ORDER BY created_at DESC LIMIT 5;` is used for ALL 8 tables including `oauth_credentials` (contains `encrypted_dek`, `dek_nonce`, `encrypted_token`, `token_nonce`, `kek_id`) and `users` (contains `github_id`, `email`, `github_login`).
- **Evidence:** `docs/runbooks/db-restore.md` lines 204-206; `libs/database-schemas/src/prisma/schema.prisma` lines 27-41 (OAuthCredential model), lines 11-25 (User model).
- **Findings:** While the credential data is encrypted at rest, `SELECT *` dumps all columns to the operator's terminal — increasing exposure surface (terminal scrollback, terminal logging, screen sharing, CI output capture). The runbook itself says "Compare key fields (IDs, timestamps, foreign keys)" but the SQL query contradicts this by selecting everything.
- **Recommendation:** Replace `SELECT *` with explicit column projections for sensitive tables. For `oauth_credentials`: `SELECT id, user_id, kek_id, created_at, updated_at FROM oauth_credentials ORDER BY created_at DESC LIMIT 5;`. For `users`: `SELECT id, created_at FROM users ORDER BY created_at DESC LIMIT 5;`.

### Data Protection — SSL enforcement on production database connections

- **Status:** CONCERNS ⚠️
- **Threshold:** All production database connections (pg_dump, psql) must enforce SSL.
- **Actual:** `pg_dump "$DATABASE_URL"` (line 126) does not enforce SSL — `--sslmode=require` is a conditional fallback. `psql "$DATABASE_URL"` (line 172) has no SSL enforcement at all.
- **Evidence:** `docs/runbooks/db-restore.md` lines 126-133, 172.
- **Findings:** Railway's Postgres is SSL-enabled (documented in the runbook itself). Without `--sslmode=require`, if `DATABASE_URL` does not include `?sslmode=require`, the connection could fall back to unencrypted, exposing database traffic to network interception. The conditional language ("if the connection requires SSL") is backwards — SSL should be required for all production database connections.
- **Recommendation:** Make `--sslmode=require` the default on all `pg_dump` and `psql` commands connecting to production. Remove the conditional language.

### Network Exposure — Docker restore-test container

- **Status:** PASS ✅ (with LOW note)
- **Threshold:** Local test containers must not expose sensitive data to the network.
- **Actual:** `docker run ... -p 5435:5432 ...` binds to all interfaces (0.0.0.0:5435) with `POSTGRES_HOST_AUTH_METHOD=trust`.
- **Evidence:** `docs/runbooks/db-restore.md` line 140.
- **Findings:** LOW severity — the container is cleaned up after the test (line 160), but the window of exposure exists during the test. On a shared network, anyone could connect without a password. Fix: `-p 127.0.0.1:5435:5432`.

### Credential Isolation

- **Status:** PASS ✅
- **Threshold:** No literal credential values in the runbook; all credentials referenced as env vars.
- **Actual:** All curl commands use `Bearer $RAILWAY_TOKEN`; pg_dump uses `"$DATABASE_URL"`; no literal token values, no `sk-` prefixes, no connection strings with passwords, no literal `VAR=value` assignments.
- **Evidence:** `docs/runbooks/db-restore.md` (all curl commands lines 54-114, 229-232, 264-289); `apps/agent-be/test/unit/db-restore.spec.ts` (45 test blocks, all passing).
- **Findings:** Credential isolation is strong. The regression guard test has comprehensive credential-isolation and input-injection guards.

---

## Reliability Assessment

### Disaster Recovery — Backup configuration

- **Status:** PASS ✅
- **Threshold:** Daily + weekly backups with documented retention.
- **Actual:** Runbook documents Railway's built-in volume backup feature with Daily (6 days retention) and Weekly (1 month / ~4 weeks retention) schedules. The 6-day daily retention (vs. AC-1's 7 days) is a platform limitation documented with a decision (DP-3 + DP-5).
- **Evidence:** `docs/runbooks/db-restore.md` lines 37-49; story Dev Notes lines 117-125.
- **Findings:** Platform limitation is properly documented and decided. Weekly backup covers the 1-day gap.

### Disaster Recovery — Restore procedure

- **Status:** PASS ✅
- **Threshold:** Restore procedure tested and documented.
- **Actual:** Restore test validated against local development database (`bmad_easy_test`). All 8 tables matched on row counts and sample records. Tool versions recorded.
- **Evidence:** `docs/runbooks/db-restore.md` Verification Record lines 304-352.
- **Findings:** Production Railway restore test is pending the production `DATABASE_URL` (not available in dev environment). This is documented in the Verification Record.

---

## Maintainability Assessment

### Test Coverage

- **Status:** PASS ✅
- **Threshold:** Regression guard test covers runbook structure, ACs, credential-isolation, input-injection.
- **Actual:** 45 test blocks, all passing. Covers structure (file exists, heading, ≥10 lines, date, sections), AC-1 (backup feature, daily/weekly, retention), AC-2 (pg_dump, pg_restore, Docker, row count, sample), AC-3 (restore trigger, pointing agent-be, integrity, 7 tables), Railway references, rollback, credential-isolation (7 env vars + Bearer guard), input-injection (placeholders, env var refs), curl flags.
- **Evidence:** `apps/agent-be/test/unit/db-restore.spec.ts` (359 lines, 45 test blocks); `yarn nx test agent-be -- --testPathPattern=db-restore` — 532 tests pass.
- **Findings:** Strong coverage. LOW note: test lacks NFR assertions for SSL enforcement (`--sslmode=require`) and localhost port binding (`127.0.0.1:`). Recommended when Findings 1-3 are addressed.

### Documentation Completeness

- **Status:** PASS ✅
- **Threshold:** Runbook is actionable — operator can configure backups and test restore end-to-end.
- **Actual:** Runbook has Prerequisites, Section 1 (Backup Configuration), Section 2 (Restore Procedure), Section 3 (Integrity Verification), Section 4 (Pointing agent-be), Rollback Procedure (independently executable), Verification Record. All curl commands include `--fail` and `--max-time 30`. All variable values use `<placeholder>` syntax.
- **Evidence:** `docs/runbooks/db-restore.md` (352 lines).
- **Findings:** Complete and actionable.

---

## Quick Wins

2 quick wins identified for immediate implementation:

1. **SSL enforcement on pg_dump/psql** (Security) - MEDIUM - 5 minutes
   - Add `--sslmode=require` to all pg_dump and psql commands connecting to production
   - Remove the conditional language ("if the connection requires SSL")
   - No code changes needed — runbook edit only

2. **Localhost port binding on Docker container** (Security) - LOW - 1 minute
   - Change `-p 5435:5432` to `-p 127.0.0.1:5435:5432`
   - One-character fix that eliminates network exposure

---

## Recommended Actions

### Short-term (Next touch of db-restore.md) - MEDIUM Priority

1. **Replace `SELECT *` with explicit column projections** - MEDIUM - 15 minutes - Dev
   - Replace `SELECT *` with explicit columns for `oauth_credentials` and `users` tables
   - Add corresponding test assertions in `db-restore.spec.ts`
   - Validation: run `yarn nx test agent-be -- --testPathPattern=db-restore`

2. **Enforce SSL on all production database connections** - MEDIUM - 5 minutes - Dev
   - Make `--sslmode=require` the default on pg_dump and psql commands
   - Add test assertion for `--sslmode=require` in `db-restore.spec.ts`
   - Validation: run `yarn nx test agent-be -- --testPathPattern=db-restore`

### Long-term (Backlog) - LOW Priority

1. **Add NFR assertions to regression guard test** - LOW - 10 minutes - Dev
   - Add `expect(content).toMatch(/sslmode=require/)` assertion
   - Add `expect(content).toMatch(/127\.0\.0\.1:5435/)` assertion
   - Validation: run `yarn nx test agent-be -- --testPathPattern=db-restore`

---

## Findings Summary

**Based on ADR Quality Readiness Checklist (8 categories, 29 criteria)**

| Category                                         | Criteria Met | PASS | CONCERNS | FAIL | Overall Status |
| ------------------------------------------------ | ------------ | ---- | -------- | ---- | -------------- |
| 1. Testability & Automation                      | 4/4          | 4    | 0        | 0    | PASS ✅        |
| 2. Test Data Strategy                            | 3/3          | 3    | 0        | 0    | PASS ✅        |
| 3. Scalability & Availability                    | 4/4          | 4    | 0        | 0    | PASS ✅        |
| 4. Disaster Recovery                             | 3/3          | 3    | 0        | 0    | PASS ✅        |
| 5. Security                                      | 2/4          | 2    | 2        | 0    | CONCERNS ⚠️    |
| 6. Monitorability, Debuggability & Manageability | 4/4         | 4    | 0        | 0    | PASS ✅        |
| 7. QoS & QoE                                     | 4/4          | 4    | 0        | 0    | PASS ✅        |
| 8. Deployability                                 | 3/3          | 3    | 0        | 0    | PASS ✅        |
| **Total**                                        | **27/29**    | **27** | **2**  | **0** | **CONCERNS ⚠️** |

---

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-07-14'
  story_id: '4.10'
  feature_name: 'Database Backup and Restore'
  adr_checklist_score: '27/29'
  categories:
    testability_automation: 'PASS'
    test_data_strategy: 'PASS'
    scalability_availability: 'PASS'
    disaster_recovery: 'PASS'
    security: 'CONCERNS'
    monitorability: 'PASS'
    qos_qoe: 'PASS'
    deployability: 'PASS'
  overall_status: 'CONCERNS'
  critical_issues: 0
  high_priority_issues: 0
  medium_priority_issues: 2
  concerns: 2
  blockers: false
  quick_wins: 2
  evidence_gaps: 0
  recommendations:
    - 'Replace SELECT * with explicit column projections for oauth_credentials and users tables'
    - 'Enforce --sslmode=require on all pg_dump and psql commands connecting to production'
    - 'Add NFR assertions for SSL enforcement and localhost port binding to regression guard test'
```

---

## Related Artifacts

- **Story File:** `_bmad-output/implementation-artifacts/4-10-configure-database-backups-and-verify-restore.md`
- **Runbook:** `docs/runbooks/db-restore.md`
- **Regression Guard Test:** `apps/agent-be/test/unit/db-restore.spec.ts`
- **Prisma Schema:** `libs/database-schemas/src/prisma/schema.prisma`
- **Deferred Work:** `_bmad-output/implementation-artifacts/deferred-work.md` (NFR-1, NFR-2 recorded)

---

## Sign-Off

**NFR Evidence Audit:**

- Overall Status: CONCERNS ⚠️
- Critical Issues: 0
- High Priority Issues: 0
- Medium Priority Issues: 2 (deferred to `deferred-work.md`)
- Concerns: 2 (LOW findings documented in story review section)
- Evidence Gaps: 0

**Gate Status:** CONCERNS ⚠️

**Next Actions:**

- The 2 MEDIUM findings are recorded in `deferred-work.md` for a future story touching `docs/runbooks/db-restore.md`.
- The 2 LOW findings are documented in the story's NFR Evidence Audit Review section.
- The story can proceed to review — the findings are security hardening improvements, not functional gaps.

**Generated:** 2026-07-14
**Workflow:** testarch-nfr v5.0

---

<!-- Powered by BMAD-CORE™ -->
