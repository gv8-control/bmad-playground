---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-14'
workflowType: testarch-atdd
storyId: '4.9'
storyKey: 4-9-configure-custom-domain-and-stable-production-url
storyFile: _bmad-output/implementation-artifacts/4-9-configure-custom-domain-and-stable-production-url.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-4-9-configure-custom-domain-and-stable-production-url.md
generatedTestFiles:
  - apps/agent-be/test/unit/custom-domain-setup.spec.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/4-9-configure-custom-domain-and-stable-production-url.md
  - _bmad-output/project-context.md
  - _bmad-output/decision-policy.md
  - apps/agent-be/test/unit/deploy-failure-recovery.spec.ts
  - apps/agent-be/test/unit/http2-verification.spec.ts
  - docs/runbooks/deploy-failure-recovery.md
---

# ATDD Checklist - Epic 4, Story 4.9: Configure Custom Domain and Stable Production URL

**Date:** 2026-07-14
**Author:** Marius
**Primary Test Level:** Unit (runbook structure validation)

---

## Story Summary

A documentation + verification story that creates a custom domain setup runbook covering DNS configuration, Vercel domain add via API, AUTH_URL env var update via API, OAuth App callback URL update (manual), end-to-end OAuth verification, and rollback procedure. A regression guard test validates the runbook's structure and content.

**As a** platform operator
**I want** a custom domain configured for the production deployment
**So that** the GitHub OAuth callback URL and AUTH_URL env var point at a stable, branded domain that doesn't change between deploys

---

## Acceptance Criteria

1. **AC-1 (DNS + Vercel domain + TLS):** DNS records are configured (A or CNAME pointing to Vercel), the domain is added and verified in the Vercel project settings, and TLS is provisioned automatically by Vercel.
2. **AC-2 (AUTH_URL update):** AUTH_URL on Vercel is updated to the custom domain so Auth.js redirects and session callbacks use the stable URL.
3. **AC-3 (OAuth App callback URL — manual):** The OAuth App's callback URL is updated at github.com/settings/developers to use the custom domain.
4. **AC-4 (End-to-end OAuth verification — manual):** The full OAuth flow (sign-in → callback → session establishment) works end-to-end against the custom domain, verified by a manual sign-in test.
5. **AC-5 (Execution model):** DNS configuration and OAuth App callback URL update are human-executed steps. Vercel domain add and AUTH_URL update are automatable via Vercel REST API but are external service calls with side effects (must be escalated). The agent's deliverables are: (a) a runbook documenting all steps, and (b) a regression guard test validating the runbook's structure.

---

## Story Integration Metadata

- **Story ID:** `4.9`
- **Story Key:** `4-9-configure-custom-domain-and-stable-production-url`
- **Story File:** `_bmad-output/implementation-artifacts/4-9-configure-custom-domain-and-stable-production-url.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-4-9-configure-custom-domain-and-stable-production-url.md`
- **Generated Test Files:** `apps/agent-be/test/unit/custom-domain-setup.spec.ts`

---

## Test Scaffolds Created

### Unit Tests (24 tests)

**File:** `apps/agent-be/test/unit/custom-domain-setup.spec.ts`

#### AC-1: DNS + Vercel domain + TLS documented (3 tests)

- **[P0] runbook documents DNS configuration (A record or CNAME)**
  - **Verifies:** AC-1 (DNS records: A record for apex, CNAME for subdomain)

- **[P0] runbook documents the Vercel API endpoint for adding a domain**
  - **Verifies:** AC-1 (Vercel REST API: `api.vercel.com/v10/projects`)

- **[P0] runbook references TLS provisioning**
  - **Verifies:** AC-1 (Vercel automatically provisions TLS via Let's Encrypt)

#### AC-2: AUTH_URL update documented (2 tests)

- **[P0] runbook references AUTH_URL**
  - **Verifies:** AC-2 (AUTH_URL env var updated to custom domain)

- **[P0] runbook documents the Vercel API endpoint for env var management**
  - **Verifies:** AC-2 (Vercel REST API: `api.vercel.com` + `env`)

#### AC-3: OAuth App callback URL update documented (3 tests)

- **[P0] runbook references the OAuth App ID**
  - **Verifies:** AC-3 (OAuth App ID: `Ov23liwPSopCBFh9nMRN`)

- **[P0] runbook references github.com/settings/developers**
  - **Verifies:** AC-3 (manual step: update OAuth App callback URL)

- **[P0] runbook references the callback URL path**
  - **Verifies:** AC-3 (callback path: `/api/auth/callback/github`)

#### AC-4: End-to-end OAuth verification documented (1 test)

- **[P0] runbook documents the end-to-end OAuth verification procedure**
  - **Verifies:** AC-4 (manual sign-in test against custom domain)

#### AC-5: Execution model documented (1 test)

- **[P0] runbook documents which steps are human-executed vs API-automatable**
  - **Verifies:** AC-5 (execution model: human-executed vs API-automatable)

#### Runbook structure (8 tests)

- **[P0] runbook file exists at docs/runbooks/custom-domain-setup.md**
  - **Verifies:** Task 1.1 (file created at the correct path)

- **[P0] runbook has a markdown heading**
  - **Verifies:** Task 1.1 (file is non-empty, has markdown structure)

- **[P0] runbook is non-trivial (at least 10 lines)**
  - **Verifies:** Task 1.1 (file has substantive content)

- **[P0] runbook contains section headings for all 5 steps**
  - **Verifies:** Task 1.1 (DNS, Vercel domain add, AUTH_URL, OAuth callback, verification sections)

- **[P0] runbook contains a rollback procedure section**
  - **Verifies:** Task 1.1 (rollback procedure documented)

- **[P0] runbook contains a date (YYYY-MM-DD format)**
  - **Verifies:** Task 1.1 (verification record date)

- **[P0] runbook contains the Vercel project ID**
  - **Verifies:** Task 1.1 (operator reference: `prj_ih4UAxO759A1CHdrZ93j4rk3poYD`)

- **[P0] runbook contains the current production URL**
  - **Verifies:** Task 1.1 (operator reference: `bmad-easy.vercel.app`)

#### Security: credential-isolation regression guards (4 tests)

- **[P0] runbook does not contain Vercel token values**
  - **Verifies:** Credential isolation — no `vcp_*` token values in runbook

- **[P0] runbook does not contain Bearer followed by a literal token value**
  - **Verifies:** Credential isolation — `Bearer $VERCEL_TOKEN` (env var reference) is allowed; `Bearer <literal-token>` is NOT

- **[P0] runbook does not contain database connection strings with passwords**
  - **Verifies:** Credential isolation — no `postgresql://user:pass@host` in runbook

- **[P0] runbook does not contain literal credential env-var assignments**
  - **Verifies:** Credential isolation — no `VERCEL_TOKEN=...` literal assignments (env var references `$VERCEL_TOKEN` and placeholders `<token>` are allowed)

#### Security: input-injection regression guards (2 tests)

- **[P0] documented API commands use <custom-domain> placeholder, not hardcoded domain values**
  - **Verifies:** Input injection — curl commands use `<custom-domain>` placeholder, not hardcoded domain values

- **[P0] curl commands reference VERCEL_TOKEN as env var, not literal value**
  - **Verifies:** Input injection — `$VERCEL_TOKEN` env var reference in curl commands, not literal token values

---

## E2E Coverage — Deferred (with browser-level mock check)

### Browser-Level Mock Feasibility Check

Per the ATDD workflow requirement, before deferring E2E coverage, I verified whether any browser-level mock pattern can simulate the ACs:

| AC | Deferred portion | Browser mock check | Verdict |
|---|---|---|---|
| AC-1 | DNS configuration + Vercel domain add + TLS provisioning (platform infrastructure) | DNS configuration is a DNS provider operation (A/CNAME records at the domain registrar). Vercel domain verification is a server-side platform mechanism. TLS provisioning is Vercel-internal (Let's Encrypt). Playwright route interception can mock HTTP responses from the Vercel API, but cannot simulate DNS propagation, domain verification state, or TLS certificate provisioning — these are infrastructure-level operations, not browser-interactable flows. | **No mock covers this** — defer |
| AC-2 | AUTH_URL env var update on Vercel (platform configuration) | AUTH_URL is a Vercel project environment variable. Updating it requires Vercel REST API access with authentication. Browser-level mocks cannot simulate Vercel's env var management — it's server-side platform state, not a browser-interactable flow. | **No mock covers this** — defer |
| AC-3 | OAuth App callback URL update (manual GitHub settings) | The OAuth App settings page at github.com/settings/developers is a GitHub platform UI. While Playwright could navigate to this page, it requires GitHub authentication and modifies a production OAuth App configuration — an irreversible, externally visible effect (decision policy: must be escalated). Browser-level mocking of the GitHub settings UI would not verify the actual OAuth flow; it would only test UI interaction with a mocked page. | **No mock covers this** — defer |
| AC-4 | End-to-end OAuth verification (manual sign-in test) | The E2E OAuth flow requires a real GitHub OAuth App, real DNS resolution, real TLS, and real Auth.js session establishment. Playwright could mock the GitHub OAuth flow (intercept the redirect to github.com), but this would test the mock, not the actual OAuth integration against the custom domain. The AC explicitly states "verified by a manual sign-in test" — it is a manual verification step, not an automated one. | **No mock covers this** — defer |
| AC-5 | Execution model documentation (runbook content) | The execution model is documented in the runbook, not in application code. Browser-level mocks cannot validate runbook content — that is the regression guard test's role. | **No mock covers this** — defer |

**Conclusion:** No browser-level mock pattern can simulate any of the ACs. All ACs involve platform infrastructure behavior (DNS, Vercel domain management, TLS, OAuth App settings, GitHub OAuth flow) that is not browser-interactable or requires production credentials/external services. E2E deferral is justified.

### Verification Method for Deferred ACs

The deferred ACs are verified operationally per the story's Tasks:
- Task 1: Create the runbook documenting all steps (AC-1 through AC-5)
- Task 2: Create the regression guard test validating the runbook's structure (AC-1 through AC-5)
- Task 3: Pull deferred item — OAuth App callback URL update (AC-3)
- Task 4: Verify via Vercel API (read-only, after human execution) (AC-1, AC-2)

Per the decision policy, live Vercel API calls are "irreversible or externally visible effects" that must be escalated — they are one-time manual verifications, not automatable as CI tests. The regression guard test validates the runbook's structure, not live API state.

---

## Regression Guard Check

Per the ATDD workflow requirement, I checked whether the story introduces code that executes external commands with user-controlled input:

- **`docs/runbooks/custom-domain-setup.md`** is a markdown document. It does not execute commands, but it documents procedures involving external commands with user-controlled input (curl commands with `$VERCEL_TOKEN` and `<custom-domain>` placeholders).
- **The runbook documents procedures** that operators follow, including:
  - `curl -X POST "https://api.vercel.com/v10/projects/{projectId}/domains?teamId={teamId}"` with `-H "Authorization: Bearer $VERCEL_TOKEN"` and `-d '{"name":"<custom-domain>"}'` — credential (`$VERCEL_TOKEN`) and user-controlled input (`<custom-domain>`)
  - `GET https://api.vercel.com/v9/projects/{projectId}/domains?teamId={teamId}` with `Authorization: Bearer $VERCEL_TOKEN` — credential
  - `GET/PATCH/POST https://api.vercel.com/v9|v10/projects/{projectId}/env?teamId={teamId}` with `Authorization: Bearer $VERCEL_TOKEN` and body containing `<custom-domain>` — credential and user-controlled input
  - `DELETE https://api.vercel.com/v9/projects/{projectId}/domains/{domain}` (rollback) — credential and user-controlled input

**Call sites with the uniform guard template applied:**

| Call site | Credential-isolation guard | Input-injection guard |
|---|---|---|
| `curl -X POST` (add domain) | No `vcp_*` token values; `Bearer $VERCEL_TOKEN` (env var ref) allowed; no literal `VERCEL_TOKEN=value` assignments | `<custom-domain>` placeholder used, not hardcoded domain |
| `GET` (verify domain) | No `vcp_*` token values; `Bearer $VERCEL_TOKEN` (env var ref) allowed | N/A (read-only, no user-controlled input in body) |
| `GET` (check AUTH_URL env) | No `vcp_*` token values; `Bearer $VERCEL_TOKEN` (env var ref) allowed | N/A (read-only, no user-controlled input in body) |
| `PATCH` (update AUTH_URL) | No `vcp_*` token values; `Bearer $VERCEL_TOKEN` (env var ref) allowed; no literal `VERCEL_TOKEN=value` assignments | `<custom-domain>` placeholder used in body value, not hardcoded domain |
| `POST` (create AUTH_URL) | No `vcp_*` token values; `Bearer $VERCEL_TOKEN` (env var ref) allowed; no literal `VERCEL_TOKEN=value` assignments | `<custom-domain>` placeholder used in body value, not hardcoded domain |
| `DELETE` (rollback domain) | No `vcp_*` token values; `Bearer $VERCEL_TOKEN` (env var ref) allowed | `<custom-domain>` placeholder used in URL, not hardcoded domain |

**Conclusion:** Regression guards applied. The test file includes a uniform guard template covering both credential-isolation invariants (4 tests) and input-injection invariants (2 tests) for all documented command call sites in the runbook. The `CREDENTIAL_ENV_VARS` list contains `VERCEL_TOKEN` (the only credential in this runbook).

---

## Data Factories Created

None — this story validates a markdown runbook file, not data-driven behavior.

---

## Fixtures Created

None — the test reads `docs/runbooks/custom-domain-setup.md` directly from the filesystem.

---

## Mock Requirements

None — the test validates a local file, no external service mocking needed.

---

## Required data-testid Attributes

None — this story has no UI components.

---

## Implementation Checklist

### Test: runbook file exists at docs/runbooks/custom-domain-setup.md

**File:** `apps/agent-be/test/unit/custom-domain-setup.spec.ts`

**Tasks to make this test pass:**

- [x] Create `docs/runbooks/custom-domain-setup.md` (Story Task 1.1)
- [x] Activate test: remove skip marker from this test block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=custom-domain-setup`
- [x] Test passes

### Test: runbook has a markdown heading

**File:** `apps/agent-be/test/unit/custom-domain-setup.spec.ts`

**Tasks to make this test pass:**

- [x] Add a `# Heading` to the runbook (Story Task 1.1)
- [x] Activate test: remove skip marker from this test block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=custom-domain-setup`
- [x] Test passes

### Test: runbook is non-trivial (at least 10 lines)

**File:** `apps/agent-be/test/unit/custom-domain-setup.spec.ts`

**Tasks to make this test pass:**

- [x] Write the full runbook content (Story Task 1.1, ~100-150 lines)
- [x] Activate test: remove skip marker from this test block
- [x] Run test: `yarn nx test agent-be -- --testPathPattern=custom-domain-setup`
- [x] Test passes

### All other tests

All remaining tests follow the same pattern:
1. Create the runbook with the required content (Story Task 1.1)
2. Activate tests: remove skip markers from all test blocks (Story Task 2.4)
3. Run: `yarn nx test agent-be -- --testPathPattern=custom-domain-setup` (Story Task 2.4)
4. Verify all tests pass

---

## Running Tests

```bash
# Run all custom-domain-setup tests
yarn nx test agent-be -- --testPathPattern=custom-domain-setup

# Run all agent-be unit tests
yarn nx test agent-be

# Run with verbose output
yarn nx test agent-be -- --verbose --testPathPattern=custom-domain-setup
```

---

## Story Task Updates

The story's Task 2 originally instructed the dev to "Create `apps/agent-be/test/unit/custom-domain-setup.spec.ts`" (Task 2.1) and "Write tests asserting the runbook contains..." (Task 2.2). The ATDD scaffolding created this file with 24 test blocks covering all ACs, the runbook structure, and security regression guards (credential-isolation + input-injection).

**Task 2.1 amended:** "Activate the existing regression guard test at `apps/agent-be/test/unit/custom-domain-setup.spec.ts` by removing skip markers from all 24 test blocks once the runbook is created. The test file already exists with the correct path resolution (`path.resolve(__dirname, '../../../../docs/runbooks/custom-domain-setup.md')`) and throw-on-missing-file behavior."

**Task 2.2 amended:** "The test file already contains 24 test blocks covering all required assertions (section headings, API endpoints, OAuth App ID, callback URL path, TLS, rollback, date, project ID, production URL, credential-isolation guards, input-injection guards). Activate by removing skip markers — no new test cases need to be written."

**Task 2.3 unchanged:** "Include a file header comment citing the story (4.9), acceptance criteria, and test purpose. Tag all tests as `[P0]`." — **Already done** in the scaffolded file.

**Task 2.4 unchanged:** "Run `yarn nx test agent-be -- --testPathPattern=custom-domain-setup` to confirm all tests pass." — Execute after removing skip markers and creating the runbook.

---

## Notes

- This is a documentation + verification story. The only committed code artifact is the regression guard test. The primary deliverable is `docs/runbooks/custom-domain-setup.md`.
- The test follows the `deploy-failure-recovery.spec.ts` pattern (Story 4.8) and `http2-verification.spec.ts` pattern (Story 4.7) — reading a committed file and asserting on its structure/content.
- The `loadRunbook()` helper throws on missing file (per Story Task 2.1: "Throw on missing file (do NOT return empty string)") — distinct from the 4.8 pattern which returns `''`. This gives clearer error messages when the runbook doesn't exist.
- The security regression guards follow the uniform guard template established in `deploy-failure-recovery.spec.ts` — credential-isolation invariants (no credentials leak via command arguments or environment variables) and input-injection invariants (malicious input is safely quoted and cannot alter the command's behavior).
- The `CREDENTIAL_ENV_VARS` list contains only `VERCEL_TOKEN` — the sole credential in this runbook. Simpler than 4.8 which had 8 credential env vars.
- The `Bearer` guard uses a negative lookahead `(?![$])` to allow `Bearer $VERCEL_TOKEN` (env var reference) while rejecting `Bearer <literal-token-value>`. This is a new guard pattern specific to this runbook's curl command structure.

---

## Knowledge Base References Applied

- **test-quality.md** — Test design principles (one assertion per test, determinism, isolation)
- **test-levels-framework.md** — Test level selection (unit test for runbook file validation, E2E deferred for platform infrastructure)
- **test-healing-patterns.md** — Common failure patterns (file-not-found handled via throw-on-missing-file per story spec)

See `tea-index.csv` for complete knowledge fragment mapping.

---

## Test Execution Evidence

### Test Results (Story 4.9)

**Command:** `yarn nx test agent-be -- --testPathPattern=custom-domain-setup`

**Results:**

```
Test Suites: 26 passed, 26 total
Tests:       480 passed, 480 total
```

**Summary:**

- Total tests: 24 (custom-domain-setup.spec.ts)
- All 24 tests passing
- All tests tagged [P0]
- Runbook created at `docs/runbooks/custom-domain-setup.md`
- All skip markers removed, all transitional phase markers removed from test file header and ATDD checklist

---

**Generated by BMad TEA Agent** - 2026-07-14
