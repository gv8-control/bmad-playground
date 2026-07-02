---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria']
lastStep: 'step-03-map-criteria'
lastSaved: '2026-07-02'
coverageBasis: 'acceptance_criteria'
oracleConfidence: 'high'
oracleResolutionMode: 'formal_requirements'
oracleSources:
  [
    '_bmad-output/planning-artifacts/epics.md (Epics 1-3, 25 stories with Given/When/Then acceptance criteria)',
    '_bmad-output/test-artifacts/test-design-architecture.md (system-level test design, 10 risks)',
    '_bmad-output/test-artifacts/test-design-qa.md (QA coverage plan, ~37 P0-P3 scenarios)',
    '_bmad-output/implementation-artifacts/sprint-status.yaml (Epic 1: done, Epics 2-3: backlog)',
    '_bmad-output/project-context.md (testing conventions, P0/P1 quality gates)',
  ]
externalPointerStatus: 'not_used'
---

# Traceability Matrix — bmad-easy

**Generated:** 2026-07-02
**Evaluator:** Marius
**Coverage Oracle:** Formal acceptance criteria (Given/When/Then blocks per story)
**Oracle Confidence:** High

---

## Step 1: Coverage Oracle & Knowledge Base

### Oracle Resolution

The coverage oracle was resolved as **formal requirements** — the highest-confidence oracle type. The primary source is `_bmad-output/planning-artifacts/epics.md`, which contains detailed Given/When/Then acceptance criteria for all 3 epics (25 stories total).

### Sprint Status (from `sprint-status.yaml`)

| Epic | Status | Stories |
| --- | --- | --- |
| Epic 1: Authentication & Repository Connection | **done** | 9 stories, all complete |
| Epic 2: Project Map & Artifact Browser | backlog | 6 stories, not started |
| Epic 3: Conversations — Running BMAD Skills | backlog | 10 stories, not started |

### Supporting Artifacts

- **Test Design Architecture** (`test-design-architecture.md`): 10 risks identified (4 high-priority score >=6), NFR testability requirements, 4 pre-implementation blockers (B-01 through B-04, most resolved)
- **Test Design QA** (`test-design-qa.md`): ~37 system-level test scenarios across P0-P3, ~140-205 hours estimated effort
- **Existing Epic 1 Trace** (`traceability/traceability-matrix-epic-1.md`): CONCERNS gate decision, 87% coverage (P0: 100%, P1: 87%), generated 2026-07-02

### Knowledge Base Loaded

- `test-priorities-matrix.md` — P0-P3 criteria and coverage targets
- `risk-governance.md` — Risk scoring (probability x impact), gate decision engine
- `probability-impact.md` — 1-9 scale, DOCUMENT/MONITOR/MITIGATE/BLOCK thresholds
- `test-quality.md` — Deterministic, isolated, explicit, focused, fast test criteria
- `selective-testing.md` — Tag-based execution, diff-based selection, promotion rules

---

## Step 2: Discover & Catalog Tests

### Test Execution Results (fresh run, 2026-07-02)

| Metric | Value |
| --- | --- |
| Unit/Integration tests | 320 pass, 0 fail (23 suites, 5.4s) |
| E2E tests | 73 total in 8 files; 8 skipped (conditional) |
| Active E2E tests | 65 |
| Source SHA | `a6cad47a5900827f81c90785e586121dffe70f3e` |

### Test Inventory by Level

#### Unit Tests (14 files)

| # | File | Scope | Stories |
| --- | --- | --- | --- |
| 1 | `apps/web/src/lib/auth.config.spec.ts` | OAuth config, redirect, `repo` scope | 1.2, 1.7 |
| 2 | `apps/web/src/lib/auth.credential.spec.ts` | Credential encryption, JWT token exclusion | 1.3, 1.6 |
| 3 | `apps/web/src/lib/auth.integration.spec.ts` | Session persistence, maxAge >=8h | 1.2 |
| 4 | `apps/web/src/lib/crypto.test.ts` | AES-256-GCM, nonce uniqueness, KEK rotation | 1.3, 1.9 |
| 5 | `apps/web/src/lib/git-identity.test.ts` | Git identity resolution, noreply fallback | 1.5 |
| 6 | `apps/web/src/lib/credential-health.test.ts` | Credential health, tenant isolation, race conditions | 1.6 |
| 7 | `apps/web/src/middleware.spec.ts` | Auth middleware, redirect matcher | 1.2, 1.7 |
| 8 | `apps/web/src/actions/repository-validation.actions.spec.ts` | BMAD validation, directory/version checks | 1.4 |
| 9 | `apps/web/src/actions/git-identity.actions.spec.ts` | Git identity actions, token exclusion | 1.5 |
| 10 | `apps/web/src/actions/repo-connection.actions.spec.ts` | Repo connection, write-access, org-restriction | 1.3, 1.6 |
| 11 | `apps/web/src/actions/credential-health.actions.spec.ts` | Re-auth flow | 1.6 |
| 12 | `apps/agent-be/src/app/app.controller.spec.ts` | Basic controller health | 1.1 |
| 13 | `libs/database-schemas/src/lib/database-schemas.spec.ts` | Prisma schema | 1.1 |
| 14 | `libs/shared-types/src/lib/shared-types.spec.ts` | Shared types | 1.1 |

#### Component Tests (9 files)

| # | File | Scope | Stories |
| --- | --- | --- | --- |
| 15 | `apps/web/src/app/page.test.tsx` | Root page redirect logic | 1.7, 1.8 |
| 16 | `apps/web/src/app/sign-in/page.test.tsx` | Sign-in page, error state | 1.2 |
| 17 | `apps/web/src/app/(dashboard)/onboarding/page.test.tsx` | Onboarding page | 1.3 |
| 18 | `apps/web/src/app/(dashboard)/layout.test.tsx` | Dashboard layout guard | 1.7, 1.8 |
| 19 | `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx` | Repo URL form, org-restriction error | 1.3 |
| 20 | `apps/web/src/components/shell/SideNavigation.test.tsx` | Side nav (16 tests) | 1.8 |
| 21 | `apps/web/src/components/ui/sheet.test.tsx` | Sheet/drawer component | 1.8 |
| 22 | `apps/web/src/components/shell/Breadcrumb.test.tsx` | Breadcrumb | 1.8 |
| 23 | `apps/web/src/components/shell/AppShell.test.tsx` | App shell, drawer, focus | 1.8 |

#### API / Internal Route Tests (3 files)

| # | File | Scope | Stories |
| --- | --- | --- | --- |
| 24 | `apps/web/src/app/api/internal/test/seed-user/route.test.ts` | Seed user endpoint | test infra |
| 25 | `apps/web/src/app/api/internal/test/repo-connections/[id]/route.test.ts` | Repo connections by ID | test infra |
| 26 | `apps/web/src/app/api/internal/test/repo-connections/route.test.ts` | Repo connections list | test infra |

#### Integration Tests (1 file)

| # | File | Scope | Stories |
| --- | --- | --- | --- |
| 27 | `apps/agent-be/test/integration/sandbox-lifecycle.integration.spec.ts` | Sandbox lifecycle | 3.1 (Epic 3, backlog) |

#### E2E Tests (7 spec files, 73 tests)

| # | File | Tests | Skipped | Stories |
| --- | --- | --- | --- | --- |
| 28 | `playwright/e2e/auth/access-baseline.spec.ts` | 5 | 0 | 1.7 |
| 29 | `playwright/e2e/auth/sign-in.spec.ts` | 10 | 1 | 1.2 |
| 30 | `playwright/e2e/onboarding/onboarding.spec.ts` | 16 | 2 | 1.3 |
| 31 | `playwright/e2e/onboarding/bmad-validation.spec.ts` | 9 | 0 | 1.4 |
| 32 | `playwright/e2e/shell/app-shell.spec.ts` | 26 | 0 | 1.8 |
| 33 | `playwright/e2e/project-map/project-map.spec.ts` | 4 | 0 | 2.x (Epic 2, backlog) |
| 34 | `playwright/e2e/conversation/sandbox-lifecycle.spec.ts` | 5 | 5 | 3.x (Epic 3, backlog) |

### Skipped Tests Detail

| File | Line | Reason |
| --- | --- | --- |
| `sign-in.spec.ts` | 124 | Conditional skip (requires real GitHub OAuth credentials) |
| `onboarding.spec.ts` | 215 | Conditional skip (requires real GitHub credentials) |
| `onboarding.spec.ts` | 265 | Conditional skip (requires real GitHub credentials) |
| `sandbox-lifecycle.spec.ts` | 13, 31, 51, 68, 85 | `TEST_GITHUB_REPO_URL` not set (all 5 tests) |

### Coverage Heuristics Inventory

#### API Endpoint Coverage
- Internal test routes (`/api/internal/test/*`) covered by 3 route test files
- No OpenAPI contract exists — oracle is acceptance criteria, not endpoint spec
- GitHub API calls mocked via `jest.spyOn(global, 'fetch')` in unit tests

#### Auth/Authz Coverage
- Sign-in flow: unit + component + E2E (redirect, OAuth scope, session persistence)
- Access baseline: E2E (5 tests asserting no paywall/billing across routes)
- Cross-tenant denial: unit test at `credential-health.test.ts:112-135`
- Unauthenticated redirect: unit + E2E (middleware, auth config, layout guard)
- **No gaps identified** in auth/authz negative paths

#### Error-Path Coverage
- Org-restriction 403: unit + component (explicit message assertion)
- Insufficient permission: unit (403 classification)
- Not-found repository: E2E
- BMAD validation errors: unit + E2E (missing dirs, bad version, no skills)
- Crypto failures: unit (wrong KEK, malformed input, nonce reuse prevention)
- **Gap**: Re-auth full cycle (fail -> re-auth -> healthy) only unit-tested in isolation

#### UI Journey Coverage
- Sign-in -> onboarding -> project-map: E2E covered
- App shell navigation: E2E covered (26 tests)
- Project Map: 4 E2E tests (Epic 2 backlog, but basic smoke tests exist)
- Sandbox lifecycle: 5 E2E tests (all skipped, Epic 3 backlog)
- **Gap**: Conversation flow E2E tests exist but all skipped (require real GitHub + Daytona)

#### UI State Coverage
- Loading states: onboarding "Validating..." covered
- Empty states: side nav conversation list empty covered
- Error states: sign-in error, onboarding errors, BMAD validation errors covered
- Credential-failed banner: not yet covered (Epic 2 scope)

---

## Step 3: Traceability Matrix

### Coverage Summary

| Epic | Status | Total ACs | FULL | PARTIAL | NONE | Coverage % |
| --- | --- | --- | --- | --- | --- | --- |
| Epic 1: Auth & Repo Connection | **done** | 31 | 27 | 2 | 2 | 87% |
| Epic 2: Project Map & Artifacts | backlog | 17 | 0 | 0 | 17 | 0% |
| Epic 3: Conversations | backlog | 47 | 0 | 0 | 47 | 0% |
| **Total** | | **95** | **27** | **2** | **66** | **28%** |

**Note:** Epic 2 and 3 are backlog (not implemented). Their ACs are listed for completeness but have no test coverage by design. The quality gate decision (Step 5) will focus on Epic 1 (the only implemented epic).

### Priority Breakdown (Epic 1 only — implemented)

| Priority | Total ACs | FULL Coverage | Coverage % | Status |
| --- | --- | --- | --- | --- |
| P0 | 10 | 10 | **100%** | PASS |
| P1 | 15 | 13 | **87%** | PARTIAL |
| P2 | 4 | 3 | **75%** | CONCERNS |
| P3 | 2 | 1 | **50%** | Advisory |
| **Total** | **31** | **27** | **87%** | CONCERNS |

---

### Epic 1: Authentication & Repository Connection (DONE)

Legend: **FULL** = actively tested, no caveats | **PARTIAL** = tested but with a specific documented gap | **NONE** = no automated test exists

#### Story 1.1: Scaffold the Platform Monorepo and CI Pipeline

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.1-AC1 | Nx workspace (Yarn/Corepack), apps/libs exist and build | P2 | **NONE** | Verified by config/directory inspection only (`nx.json`, `project.json`x4, `package.json`); no automated test. `atdd-checklist-1-1...md` documents this as intentional ("testing the build system is circular"). |
| 1.1-AC2 | Tailwind theme = DESIGN.md tokens, dark-mode only | P3 | **NONE** | `tailwind.config.ts` inspected directly; zero test files reference tailwind/theme/tokens. |
| 1.1-AC3 | CI runs lint+tests as merge gate; deploy is manual | P1 | **FULL** | `.github/workflows/test.yml`: `lint` -> `{unit, e2e}` -> `burn-in` -> `report` DAG via `needs:`; `yarn install --immutable` on every job; no deploy workflow exists. |

#### Story 1.2: Sign In with GitHub

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.2-AC1 | Redirect to /sign-in, sole "Sign in with GitHub" button, initiates OAuth with `repo` scope | P0 | **FULL** | Redirect + UI covered (`auth.config.spec.ts:69-84`, `sign-in.spec.ts:14-70` E2E). `repo`-scope request asserted by unit test `auth.config.spec.ts:137-140` (`expect(scope).toMatch(/\brepo\b/)`). |
| 1.2-AC2 | Session persists across refresh, >=8h | P1 | **FULL** | `auth.integration.spec.ts:139-142` (maxAge=28800s) + `sign-in.spec.ts:153-174` E2E (reload survives, cookie expiry >=8h). |
| 1.2-AC3 | OAuth failure -> inline error, button re-enabled | P1 | **FULL** | `sign-in/page.test.tsx:17-29` + `sign-in.spec.ts:87-114` E2E. |
| 1.2-AC4 | Unauthenticated request -> redirect to /sign-in (FR19) | P0 | **FULL** | `auth.config.spec.ts:86-109` (API routes return 401 JSON, not redirect) + `access-baseline.spec.ts` E2E. |

#### Story 1.3: Connect a Repository by URL

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.3-AC1 | Single "Repository URL" input, no token field | P1 | **FULL** | `RepositoryUrlForm.test.tsx:36-45` + `onboarding.spec.ts:44-55` E2E. |
| 1.3-AC2 | Validates OAuth token grants write access | P0 | **FULL** | `repo-connection.actions.spec.ts:112-366` (URL normalization, Bearer-token GitHub API calls, push-permission check). |
| 1.3-AC3 | AES-256-GCM storage, fresh GCM nonce per op, token never returned to client | P0 | **FULL** | `crypto.test.ts:39-60` (20 encryptToken calls, all nonces unique). `auth.credential.spec.ts:158-167` (raw token never in JWT). `repo-connection.actions.spec.ts:368-372` (decrypted token never in response). |
| 1.3-AC4 | Descriptive per-cause error, org-restriction named explicitly | P1 | **FULL** | `repo-connection.actions.spec.ts:215-239` (org-restriction message matches `/organization/i`, not generic). Mirrored in `RepositoryUrlForm.test.tsx:113-122` and E2E. |

#### Story 1.4: Validate BMAD Initialization in the Connected Repository

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.4-AC1 | Confirms `_bmad/`, `_bmad-output/`, `.claude/` present + v6.x; empty `_bmad-output/` OK | P1 | **FULL** | `repository-validation.actions.spec.ts:90-100` (empty `_bmad-output/` is valid, contents never fetched). |
| 1.4-AC2 | Missing prerequisite -> blocking message names it + doc link | P1 | **FULL** | Three distinct tests per directory (`repository-validation.actions.spec.ts:268-309`) + combined "names all missing" + doc-link test. |
| 1.4-AC3 | `.claude/skills/` absent or empty -> "no Skills found" | P1 | **FULL** | Distinct tests for absent (404), empty (no .md), README-only (`repository-validation.actions.spec.ts:355-378`) + nested SKILL.md detection. |
| 1.4-AC4 | Version outside v6.x -> names detected version, states only v6 supported | P1 | **FULL** | `repository-validation.actions.spec.ts:147-176` (v5.9.9, v7.0.0 both rejected; message matches `/v6/i` and contains detected version). |

#### Story 1.5: Resolve Git Identity for Commit Attribution

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.5-AC1 | Name/email exactly as returned by OAuth profile | P1 | **FULL** | `git-identity.test.ts:10-30` (incl. special-character/UTF-8 preservation). |
| 1.5-AC2 | No primary email -> fallback to `{username}@users.noreply.github.com` | P2 | **FULL** | `git-identity.test.ts:34-68` (null, empty-string, whitespace-only email all tested). |
| 1.5-AC3 | Consumable by sandbox init; OAuth token never appears in identity record | P0 | **FULL** | `git-identity.test.ts:115-136` (returned object keys are exactly `['email','name']`). `git-identity.actions.spec.ts:108-137` (Prisma `select:` clause omits token fields). |

#### Story 1.6: Detect and Recover from Credential Failures

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.6-AC1 | 401/403 -> `credentialHealth: failed` within one operation cycle, no silent failure (NFR-R1) | P0 | **FULL** | 401 and 403 paths call `markCredentialFailed()` (`repo-connection.actions.spec.ts:185-314`, `repository-validation.actions.spec.ts:665-681`, `credential-health.test.ts:146-188`). Race-condition guard: `updatedAt < capturedAt` optimistic concurrency. `markCredentialFailed` is `await`ed at every call site. |
| 1.6-AC2 | Tenant authorization check before token resolution; tokens never resolved across users (NFR-S2) | P0 | **FULL** | `credential-health.test.ts:75-135` — positive path confirms `where: { userId }` scoping; cross-tenant negative-path test at lines 112-135 (userB resolves own token, userA denied with `CredentialFailureError`). |
| 1.6-AC3 | Re-auth restores `healthy` without disconnecting repo | P1 | **PARTIAL** | `credential-health.actions.spec.ts:90-105` confirms `reauthorizeGitHub()` calls `signIn('github', ...)`. `credential-health.test.ts:199-210` confirms status-flip. `auth.credential.spec.ts` confirms `updateMany` only sets `credentialHealth`. **Gap:** no integration/E2E test runs the full cycle (fail -> re-auth -> healthy) asserting RepoConnection row survives. |

#### Story 1.7: Enforce Authenticated, Full Access for All MVP Users

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.7-AC1 | Any unauthenticated route -> redirect to /sign-in | P0 | **FULL** | Shared evidence with 1.2-AC4, plus `(dashboard)/layout.test.tsx:44-60` defense-in-depth guard. |
| 1.7-AC2 | Authenticated user gets full access, no paywall/billing gate | P2 | **FULL** | `access-baseline.spec.ts` (5 E2E tests asserting absence of paywall/trial/billing/upgrade across routes + after reload, paired with positive assertions). |

#### Story 1.8: Build the Persistent App Shell

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.8-AC1 | Side nav (240px, wordmark, New Conversation, last-5, links, Settings avatar), no show-more, keyboard order | P1 | **FULL** | `SideNavigation.test.tsx` (16 tests) + `app-shell.spec.ts` E2E (9 tests, incl. 240px width + DOM tab-order). |
| 1.8-AC2 | Three-zone independent scroll model | P1 | **FULL** | `app-shell.spec.ts:94-140` (injects 2000px content, scrolls, asserts header/side-nav Y-position unchanged). |
| 1.8-AC3 | Breadcrumb on depth-1 pages only, no route transitions | P2 | **FULL** | `Breadcrumb.test.tsx` + `app-shell.spec.ts:171-197` (present on `/artifacts`, `/settings`, `/conversations/new`; absent on `/project-map`). |
| 1.8-AC4 | Accessibility floor (focus ring, focus-to-h1, modal trap, aria-live, aria-labels, reduced-motion) | P1 | **PARTIAL** | Most sub-behaviors covered (`AppShell.test.tsx`, `app-shell.spec.ts:201-286`). **Gaps:** (a) "no animated route transitions" verified only by absence of transition code; (b) "focus ring never suppressed on click" tested only via programmatic `.focus()`; (c) `AppShell.test.tsx:68-77` and `:79-88` have weak/zero post-action assertions (flagged in `test-review-1-8.md`). E2E compensates functionally. |
| 1.8-AC5 | Responsive: >=1024px desktop, 768-1023px drawer overlay, dismiss on outside-click/Escape | P1 | **FULL** | `app-shell.spec.ts:238-286` (hamburger at 900px, side nav at 1280px, drawer open/close/dismiss/focus-return). |

#### Story 1.9: Document and Validate the KEK Rotation Runbook

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.9-AC1 | Runbook documents exact steps; no plaintext token ever exposed | P0 | **FULL** | `docs/runbooks/kek-rotation.md` (9-step procedure). `crypto.test.ts:149-162` asserts rewrap result keys are exactly `['dekNonce','encryptedDek']`. |
| 1.9-AC2 | Validated against non-prod; every token remains decryptable after rotation | P0 | **FULL** | 8 unit tests (`crypto.test.ts:121-248`: round-trip, DEK-byte preservation, fresh nonce, wrong-KEK rejection, chained A->B->C rotation) + recorded operational run (2026-07-02, non-prod, 3 credentials, "3 ok, 0 failed"). |
| 1.9-AC3 | Runbook committed to repo | P3 | **FULL** | `docs/runbooks/kek-rotation.md` tracked in git; cross-referenced from `.env.example` and `package.json` `rotate-kek` script. |

---

### Epic 2: Project Map & Artifact Browser (BACKLOG)

All 17 acceptance criteria have **NONE** coverage — epic not yet implemented. 4 skeleton E2E tests exist in `project-map.spec.ts` (basic smoke: loads within 2s, shows connected repositories, remains accessible when sandbox fails) but these are preliminary scaffolding, not full AC coverage.

| Story | ACs | Coverage | Notes |
| --- | --- | --- | --- |
| 2.1: Mirror Repository Artifacts into Postgres | 3 | NONE | `artifacts.service.ts` not yet built |
| 2.2: View the Project Map | 4 | NONE | 4 skeleton E2E tests exist but do not map to full ACs |
| 2.3: Manually Refresh the Project Map | 2 | NONE | Not implemented |
| 2.4: Browse and Read All Committed Artifacts | 3 | NONE | Not implemented |
| 2.5: View a Single Artifact's Rendered Content | 3 | NONE | Not implemented |
| 2.6: Navigate from the Project Map to an Artifact | 2 | NONE | Not implemented |

---

### Epic 3: Conversations — Running BMAD Skills with the Agent (BACKLOG)

All 47 acceptance criteria have **NONE** coverage — epic not yet implemented. 5 E2E tests exist in `sandbox-lifecycle.spec.ts` (all skipped, require `TEST_GITHUB_REPO_URL`) and 1 integration test in `sandbox-lifecycle.integration.spec.ts`, but these are skeleton scaffolding.

| Story | ACs | Coverage | Notes |
| --- | --- | --- | --- |
| 3.1: Provision a Sandbox When Opening a Conversation | 6 | NONE | 5 skipped E2E tests exist (skeleton) |
| 3.2: Invoke BMAD Skills via Slash Command | 4 | NONE | Not implemented |
| 3.3: Converse with the Streaming Agent | 5 | NONE | Not implemented |
| 3.4: See Tool Calls and Recognized Actions Inline | 5 | NONE | Not implemented |
| 3.5: Resume and Run Concurrent Conversations | 6 | NONE | Not implemented |
| 3.6: Track and Manually Save Working Tree State | 7 | NONE | Not implemented |
| 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation | 5 | NONE | Not implemented |
| 3.8: Track Per-User LLM Spend | 3 | NONE | Not implemented |
| 3.9: Terminate Idle Sandboxes Mid-Conversation | 3 | NONE | Not implemented |
| 3.10: Verify Commits Carry the User's Own Identity | 3 | NONE | Not implemented |

---

### Coverage Logic Validation

- **P0/P1 items have coverage:** All 10 P0 ACs in Epic 1 have FULL coverage. 13/15 P1 ACs have FULL coverage (2 PARTIAL).
- **No unjustified duplicate coverage:** Multi-level coverage (unit + E2E) exists for auth, onboarding, and app shell — all justified as defense-in-depth (different aspects tested at each level).
- **Error paths covered:** Org-restriction, insufficient permission, not-found, BMAD validation errors, crypto failures all have dedicated tests.
- **Auth/authz includes negative paths:** Cross-tenant denial test, unauthenticated redirect, access-baseline (no paywall) all covered.
- **No happy-path-only gaps:** 1.6-AC3 (re-auth cycle) is the only criterion tested in isolation rather than full cycle.


