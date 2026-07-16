---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-13'
workflowType: testarch-atdd
storyId: '4.8'
storyKey: 4-8-deploy-failure-recovery-and-rollback
storyFile: _bmad-output/implementation-artifacts/4-8-deploy-failure-recovery-and-rollback.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-4-8-deploy-failure-recovery-and-rollback.md
generatedTestFiles:
  - apps/agent-be/test/unit/deploy-failure-recovery.spec.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/4-8-deploy-failure-recovery-and-rollback.md
  - _bmad-output/project-context.md
  - _bmad-output/decision-policy.md
  - apps/agent-be/test/unit/http2-verification.spec.ts
  - apps/agent-be/test/unit/deploy-workflow.spec.ts
  - apps/agent-be/test/unit/run-migrations.spec.ts
---

# ATDD Checklist - Epic 4, Story 4.8: Deploy Failure Recovery and Rollback

**Date:** 2026-07-13
**Author:** Marius
**Primary Test Level:** Unit (runbook structure validation)

---

## Story Summary

A documentation + verification story that creates a deploy failure recovery runbook covering Vercel rollback, Railway rollback, Prisma migration recovery, misconfigured secret recovery, and split-brain deploy recovery. A regression guard test validates the runbook's structure and content.

**As a** platform operator
**I want** a documented recovery path for failed deploys, partial migrations, and misconfigured secrets
**So that** a production incident doesn't become a prolonged outage because no one knows how to roll back

---

## Acceptance Criteria

1. **AC-1 (Vercel rollback):** Vercel's automatic rollback to the previous successful deployment is confirmed enabled, and the operator can trigger `vercel rollback` to restore the last known-good version without a full redeploy.
2. **AC-2 (Railway rollback):** Railway's automatic redeploy of the previous revision is confirmed enabled, and the operator can manually trigger a redeploy of the last successful image via the Railway dashboard or CLI.
3. **AC-3 (Prisma migration recovery):** The operator follows a documented recovery procedure covering inspecting `_prisma_migrations`, marking or rolling back the failed migration, and re-running `prisma migrate deploy` — validated against a non-production database.
4. **AC-4 (Misconfigured secret blocks traffic):** A misconfigured secret causes startup failure, the health check fails post-deploy, the deploy is blocked from receiving traffic, and the previous working deployment continues serving until corrected.

---

## Story Integration Metadata

- **Story ID:** `4.8`
- **Story Key:** `4-8-deploy-failure-recovery-and-rollback`
- **Story File:** `_bmad-output/implementation-artifacts/4-8-deploy-failure-recovery-and-rollback.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-4-8-deploy-failure-recovery-and-rollback.md`
- **Generated Test Files:** `apps/agent-be/test/unit/deploy-failure-recovery.spec.ts`

---

## Test Scaffolds Created

### Unit Tests (31 tests)

**File:** `apps/agent-be/test/unit/deploy-failure-recovery.spec.ts`

#### AC-1: Vercel rollback capability documented (2 tests)

- **[P0] runbook contains the vercel rollback command**
  - **Verifies:** AC-1 (operator can trigger `vercel rollback`)

- **[P0] runbook contains the Vercel production URL**
  - **Verifies:** AC-1 (operator reference: `https://bmad-easy.vercel.app`)

#### AC-2: Railway rollback capability documented (4 tests)

- **[P0] runbook contains the railway redeploy command (or railway up)**
  - **Verifies:** AC-2 (operator can trigger `railway redeploy`)

- **[P0] runbook contains the Railway project ID**
  - **Verifies:** AC-2 (operator reference: `30ab04b2-132c-440b-92ca-bc57be294d6f`)

- **[P0] runbook contains the Railway agent-be service ID**
  - **Verifies:** AC-2 (operator reference: `4df7d0d1-0040-4395-89c8-bd166c4863cf`)

- **[P0] runbook references the HEALTHCHECK instruction**
  - **Verifies:** AC-2/AC-4 (Dockerfile HEALTHCHECK is the mechanism)

#### AC-3: Prisma migration recovery procedure documented (5 tests)

- **[P0] runbook references the _prisma_migrations table**
  - **Verifies:** AC-3 (inspection target)

- **[P0] runbook documents the SQL inspection query for _prisma_migrations**
  - **Verifies:** AC-3 (`SELECT migration_name ... FROM _prisma_migrations`)

- **[P0] runbook documents the DELETE recovery command for failed migrations**
  - **Verifies:** AC-3 (`DELETE FROM _prisma_migrations WHERE migration_name = ...`)

- **[P0] runbook references the describeDatabase() safety pattern**
  - **Verifies:** AC-3 (credential isolation: announces target, never logs credentials)

- **[P0] runbook references prisma migrate deploy or yarn db:migrate for re-run**
  - **Verifies:** AC-3 (re-run procedure after recovery)

#### AC-4: Misconfigured secret blocks traffic documented (2 tests)

- **[P0] runbook documents Vercel build-failure prevention**
  - **Verifies:** AC-4 (Vercel build-step failure prevents promotion)

- **[P0] runbook documents Railway HEALTHCHECK failure prevention**
  - **Verifies:** AC-4 (Railway HEALTHCHECK failure prevents traffic)

#### Task 5: Split-brain deploy recovery documented (3 tests)

- **[P0] runbook references the split-brain scenario**
  - **Verifies:** Task 5 (split-brain scenario documented)

- **[P0] runbook documents recovery option A (rollback Vercel)**
  - **Verifies:** Task 5 (recovery option A: `vercel rollback`)

- **[P0] runbook documents recovery option B (fix Railway and redeploy)**
  - **Verifies:** Task 5 (recovery option B: `railway redeploy`/`railway up`)

#### Runbook structure (5 tests)

- **[P0] runbook file exists at docs/runbooks/deploy-failure-recovery.md**
  - **Verifies:** Task 6.1 (file created at the correct path)

- **[P0] runbook has a markdown heading**
  - **Verifies:** Task 6.2 (file is non-empty, has markdown structure)

- **[P0] runbook is non-trivial (at least 10 lines)**
  - **Verifies:** Task 6.2 (file has substantive content)

- **[P0] runbook contains section headings for all 5 recovery procedures**
  - **Verifies:** Task 6.2 (Vercel, Railway, Prisma, Secret, Split-Brain sections)

- **[P0] runbook contains a date (YYYY-MM-DD format)**
  - **Verifies:** Task 6.2 (verification record date)

#### Security: credential-isolation regression guards (6 tests)

- **[P0] runbook does not contain Vercel token values**
  - **Verifies:** Credential isolation — no `vcp_*` token values in runbook

- **[P0] runbook does not contain Railway token values**
  - **Verifies:** Credential isolation — no Railway token values in runbook

- **[P0] runbook does not contain Anthropic API key values**
  - **Verifies:** Credential isolation — no `sk-*` API key values in runbook

- **[P0] runbook does not contain database connection strings with passwords**
  - **Verifies:** Credential isolation — no `postgresql://user:pass@host` in runbook

- **[P0] runbook does not contain literal credential env-var assignments**
  - **Verifies:** Credential isolation — no `VERCEL_TOKEN=...`, `DATABASE_URL=...` literal assignments

- **[P0] runbook references describeDatabase() safety pattern (credential isolation)**
  - **Verifies:** Credential isolation — `describeDatabase()` pattern referenced

#### Security: input-injection regression guards (4 tests)

- **[P0] SQL DELETE command uses placeholder, not raw interpolated value**
  - **Verifies:** Input injection — `DELETE FROM _prisma_migrations WHERE migration_name = '<placeholder>'`

- **[P0] vercel rollback command uses placeholder for deployment URL**
  - **Verifies:** Input injection — `vercel rollback <deployment-url>`, not hardcoded URL with credentials

- **[P0] railway redeploy command references service ID via flag, not inline interpolation**
  - **Verifies:** Input injection — `railway redeploy --service <id>`, not inline interpolation

- **[P0] DATABASE_URL referenced as env var, not interpolated into command string**
  - **Verifies:** Input injection — no `DATABASE_URL=postgresql://user:pass@host` in command strings

---

## E2E Coverage — Deferred (with browser-level mock check)

### Browser-Level Mock Feasibility Check

Per the ATDD workflow requirement, before deferring E2E coverage, I verified whether any browser-level mock pattern can simulate the ACs:

| AC | Deferred portion | Browser mock check | Verdict |
|---|---|---|---|
| AC-1 | Vercel rollback capability (platform feature) | Vercel's deployment promotion/rollback is a platform-level mechanism. Playwright route interception can mock HTTP responses from the Vercel API, but cannot simulate Vercel's deployment promotion/rollback mechanism — it's server-side infrastructure state, not a browser-interactable flow. | **No mock covers this** — defer |
| AC-2 | Railway rollback capability (platform feature) | Railway's container health check and restart behavior is a platform-level mechanism. Browser-level mocks cannot simulate Railway's container orchestration, health check polling, or deployment revision management. | **No mock covers this** — defer |
| AC-3 | Prisma migration recovery (manual procedure) | The recovery procedure requires a real Postgres instance with partial migration state. Browser-level mocks cannot simulate database schema state or `_prisma_migrations` table contents. | **No mock covers this** — defer |
| AC-4 | Misconfigured secret blocks traffic (platform feature) | Vercel build-step failure and Railway HEALTHCHECK failure are platform-level deployment mechanisms. Browser-level mocks cannot simulate container startup failures, health check polling, or deployment promotion gating. | **No mock covers this** — defer |

**Conclusion:** No browser-level mock pattern can simulate any of the ACs. All ACs involve platform infrastructure behavior (Vercel/Railway deployment mechanisms, Postgres migration state, container health checks) that is not browser-interactable. E2E deferral is justified.

### Verification Method for Deferred ACs

The deferred ACs are verified operationally per the story's Tasks:
- Task 1: Verify Vercel automatic rollback and manual `vercel rollback` (AC-1) — live API/CLI verification
- Task 2: Verify Railway automatic redeploy and manual `railway redeploy` (AC-2) — live API/CLI verification
- Task 3: Document and validate Prisma migration recovery (AC-3) — local Docker Postgres validation
- Task 4: Verify misconfigured secret blocks traffic (AC-4) — API inspection, no intentional production break

Per the decision policy, live Vercel/Railway API calls are "irreversible or externally visible effects" that must be escalated — they are one-time manual verifications, not automatable as CI tests. The regression guard test validates the runbook's structure, not live API state.

---

## Regression Guard Check

Per the ATDD workflow requirement, I checked whether the story introduces code that executes external commands with user-controlled input:

- **`docs/runbooks/deploy-failure-recovery.md`** is a markdown document. It does not execute commands, but it documents procedures involving external commands with user-controlled input (SQL queries, CLI commands, DATABASE_URL references).
- **`scripts/run-migrations.ts`** (referenced in the runbook) is actual code that executes external commands. It already has regression guards in `apps/agent-be/test/unit/run-migrations.spec.ts` covering credential-isolation and input-injection invariants.
- **The runbook documents procedures** that operators follow, including:
  - SQL: `DELETE FROM _prisma_migrations WHERE migration_name = '<failed-migration>'` — user-controlled input (migration name)
  - CLI: `vercel rollback <deployment-url>`, `railway redeploy --service <id>` — user-controlled input
  - `DATABASE_URL=<database-url> yarn db:migrate` — credential in command

**Conclusion:** Regression guards applied. The test file includes a uniform guard template covering both credential-isolation invariants (6 tests) and input-injection invariants (4 tests) for all documented command call sites in the runbook.

---

## Data Factories Created

None — this story validates a markdown runbook file, not data-driven behavior.

---

## Fixtures Created

None — the test reads `docs/runbooks/deploy-failure-recovery.md` directly from the filesystem.

---

## Mock Requirements

None — the test validates a local file, no external service mocking needed.

---

## Required data-testid Attributes

None — this story has no UI components.

---

## Implementation Checklist

### Test: runbook file exists at docs/runbooks/deploy-failure-recovery.md

**File:** `apps/agent-be/test/unit/deploy-failure-recovery.spec.ts`

**Tasks to make this test pass:**

- [x] Create `docs/runbooks/deploy-failure-recovery.md` (Story Task 6.1)
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=deploy-failure-recovery`
- [x] Test passes

### Test: runbook has a markdown heading

**File:** `apps/agent-be/test/unit/deploy-failure-recovery.spec.ts`

**Tasks to make this test pass:**

- [x] Add a `# Heading` to the runbook (Story Task 6.1)
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=deploy-failure-recovery`
- [x] Test passes

### Test: runbook is non-trivial (at least 10 lines)

**File:** `apps/agent-be/test/unit/deploy-failure-recovery.spec.ts`

**Tasks to make this test pass:**

- [x] Write the full runbook content (Story Task 6.1, ~150-250 lines)
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=deploy-failure-recovery`
- [x] Test passes

### All other tests

All remaining tests follow the same pattern:
1. Create the runbook with the required content (Story Tasks 1-5, 6.1)
2. Run: `yarn nx test agent-be -- --testPathPattern=deploy-failure-recovery` (Story Task 6.3)
3. Verify all tests pass

---

## Running Tests

```bash
# Run all deploy-failure-recovery tests
yarn nx test agent-be -- --testPathPattern=deploy-failure-recovery

# Run all agent-be unit tests
yarn nx test agent-be

# Run with verbose output
yarn nx test agent-be -- --verbose --testPathPattern=deploy-failure-recovery
```

---

## Story Task Updates

The story's Task 6.2 originally instructed the dev to "Create a regression guard test at `apps/agent-be/test/unit/deploy-failure-recovery.spec.ts`". The ATDD scaffolding already created this file with 31 test blocks covering all ACs, the runbook structure, and security regression guards (credential-isolation + input-injection).

**Task 6.2 amended:** "Activate the existing regression guard test at `apps/agent-be/test/unit/deploy-failure-recovery.spec.ts` by removing `test.skip()` markers from all test blocks once the runbook is created." — **Completed:** all 31 tests activated and passing.

**Task 6.3 unchanged:** "Run `yarn nx test agent-be -- --testPathPattern=deploy-failure-recovery` to confirm all tests pass."

---

## Notes

- This is a documentation + verification story. The only committed code artifact is the regression guard test. The primary deliverable is `docs/runbooks/deploy-failure-recovery.md`.
- The test follows the `http2-verification.spec.ts` pattern (Story 4.7) and `deploy-workflow.spec.ts` pattern (Story 4.6) — reading a committed file and asserting on its structure/content.
- The `loadRunbook()` helper returns `''` when the file doesn't exist, so activated tests fail with clean assertion messages (e.g., "expected '' to match /vercel\s+rollback/i") rather than throwing file-not-found errors.
- The security regression guards follow the uniform guard template established in `deploy-workflow.spec.ts` — credential-isolation invariants (no credentials leak via command arguments or environment variables) and input-injection invariants (malicious input is safely quoted and cannot alter the command's behavior).
- The `describeDatabase()` safety pattern is already tested in `run-migrations.spec.ts` (Story 4.4). The runbook regression guard verifies the runbook references this pattern, not that the pattern itself works.

---

## Knowledge Base References Applied

- **test-quality.md** — Test design principles (one assertion per test, determinism, isolation)
- **test-levels-framework.md** — Test level selection (unit test for runbook file validation, E2E deferred for platform infrastructure)
- **test-healing-patterns.md** — Common failure patterns (file-not-found handled gracefully via `loadRunbook()` returning `''`)

See `tea-index.csv` for complete knowledge fragment mapping.

---

## Test Execution Evidence

**Command:** `yarn nx test agent-be -- --testPathPattern=deploy-failure-recovery`

**Results:**

```
Test Suites: 1 passed, 1 total
Tests:       31 passed, 31 total
```

**Summary:**

- Total tests: 31
- Passing: 31
- All tests active and passing after runbook creation (Story 4.8)

---

**Generated by BMad TEA Agent** - 2026-07-13
