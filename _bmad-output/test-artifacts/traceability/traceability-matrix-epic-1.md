---
stepsCompleted:
  ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-07-02'
coverageBasis: 'acceptance_criteria'
oracleConfidence: 'high'
oracleResolutionMode: 'formal_requirements'
oracleSources:
  [
    '_bmad-output/planning-artifacts/epics.md (Epic 1: Authentication & Repository Connection, lines 230-446)',
    '_bmad-output/implementation-artifacts/epic-1-context.md',
  ]
externalPointerStatus: 'not_used'
traceTarget: { type: 'epic', id: 'epic-1', label: 'Authentication & Repository Connection' }
gateDecision: 'FAIL'
---

# Traceability Report — Epic 1: Authentication & Repository Connection

**Generated:** 2026-07-02
**Evaluator:** Marius
**Target:** Epic 1 (9 stories, all marked `done` in sprint-status.yaml)

## Gate Decision: FAIL

**Rationale:** P0 coverage is 70% (7/10 fully covered) — required: 100%. No P0 criterion has zero coverage, but 3 P0 acceptance criteria fall short of FULL: two in Story 1.6 (credential-failure handling) lack a required negative-path/timing assertion, and one in Story 1.2 has its only supporting assertion inside a test that is skipped by default. See [Gap Analysis](#gap-analysis) for detail and recommended fixes — all three are small, targeted additions to existing test files, not new test infrastructure.

## Oracle

Coverage was traced against the **formal acceptance criteria** in `_bmad-output/planning-artifacts/epics.md` (Given/When/Then blocks per story) — the highest-confidence oracle type available. All 9 Epic 1 stories are marked `done` in `sprint-status.yaml`, so this is a post-hoc audit of implemented, presumed-complete work, not a pre-implementation gap check.

Each Given/When/Then block in `epics.md` was treated as one requirement item. Story 1.6's fourth clause ("displaying failed status on the Project Map is Epic 2 scope") is a scope boundary, not a testable requirement, and is excluded from the count.

## Coverage Summary

| Metric | Value |
| --- | --- |
| Total requirement items (ACs) | 31 |
| Fully covered (FULL) | 24 (77%) |
| Partially covered (PARTIAL) | 5 |
| Not covered (NONE) | 2 |
| Test files discovered | 32 (25 unit/component/integration `.spec.ts`/`.test.tsx` + 6 Playwright E2E specs + 1 NestJS integration spec) |
| Test cases discovered | ~230+ (exact count not machine-counted; see per-story detail below) |
| Skipped tests found | 3 (all Playwright E2E, gated behind real-credential env vars) |

### Priority Breakdown

| Priority | Total | Covered (FULL) | Coverage % | Gate Rule |
| --- | --- | --- | --- | --- |
| **P0** | 10 | 7 | **70%** | Must be 100% → **FAILS** |
| P1 | 15 | 13 | 87% | Target 90%, min 80% → meets minimum |
| P2 | 4 | 3 | 75% | Advisory |
| P3 | 2 | 1 | 50% | Advisory |
| **Overall** | 31 | 24 | **77%** | Min 80% → also fails independently |

Both the P0 rule and the overall-coverage rule (≥80%) would independently fail this gate; the P0 rule is reported as the primary blocker since it is checked first.

---

## Traceability Matrix

Legend: **FULL** = actively tested, no caveats · **PARTIAL** = tested but with a specific documented gap · **NONE** = no automated test exists.

### Story 1.1: Scaffold the Platform Monorepo and CI Pipeline

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.1-AC1 | Nx workspace (Yarn/Corepack), apps/libs exist and build | P2 | **NONE** | Verified only by config/directory inspection (`nx.json`, `project.json`×4, `package.json`); no automated test. `atdd-checklist-1-1...md` documents this as an intentional exclusion ("testing the build system is circular"). |
| 1.1-AC2 | Tailwind theme = DESIGN.md tokens, dark-mode only | P3 | **NONE** | `tailwind.config.ts` inspected directly; zero test files reference `tailwind`/`theme`/`tokens`. |
| 1.1-AC3 | CI runs lint+tests as merge gate; deploy is manual | P1 | **FULL** | `.github/workflows/test.yml`: `lint` → `{unit, e2e}` → `burn-in` → `report` DAG via `needs:`; `yarn install --immutable` on every job; no `deploy.yml`/`vercel.yml`/`railway.yml` exists anywhere in `.github/workflows/`. |

### Story 1.2: Sign In with GitHub

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.2-AC1 | Redirect to /sign-in, sole "Sign in with GitHub" button, initiates OAuth with `repo` scope | P0 | **PARTIAL** | Redirect + UI-sole-element well covered (`auth.config.spec.ts:69-84`, `sign-in.spec.ts:14-70` E2E). **Gap:** the `repo`-scope request is asserted *only* by `playwright/e2e/auth/sign-in.spec.ts:123-147`, which is **skipped unless `AUTH_GITHUB_ID` is set** — no unit test asserts the GitHub provider config requests `scope: 'repo'`. |
| 1.2-AC2 | Session persists across refresh, ≥8h | P1 | **FULL** | `auth.integration.spec.ts:139-142` (maxAge=28800s config) + `sign-in.spec.ts:153-174` E2E (reload survives, cookie expiry ≥8h). |
| 1.2-AC3 | OAuth failure → inline error, button re-enabled | P1 | **FULL** | `sign-in/page.test.tsx:17-29` + `sign-in.spec.ts:87-114` E2E (error text + enabled button asserted). |
| 1.2-AC4 | Unauthenticated request → redirect to /sign-in (FR19) | P0 | **FULL** | Same redirect evidence as AC1, plus `auth.config.spec.ts:86-109` (API routes return 401 JSON instead of redirect, correctly differentiated). |

### Story 1.3: Connect a Repository by URL

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.3-AC1 | Single "Repository URL" input, no token field | P1 | **FULL** | `RepositoryUrlForm.test.tsx:36-45` + `onboarding.spec.ts:44-55` E2E. |
| 1.3-AC2 | Validates OAuth token grants write access | P0 | **FULL** | `repo-connection.actions.spec.ts:112-366` (URL normalization, Bearer-token GitHub API calls, push-permission check). |
| 1.3-AC3 | AES-256-GCM storage, fresh GCM nonce per op, token never returned to client | P0 | **FULL** | `crypto.test.ts:39-60` — **explicitly loops 20 `encryptToken` calls and asserts all 20 dekNonces and all 20 tokenNonces are unique** (direct test of the AC's literal wording). `auth.credential.spec.ts:158-167` (raw token never in JWT). `repo-connection.actions.spec.ts:368-372` (decrypted token never in response). E2E-level "never visible in browser" check is skipped (needs real GitHub creds) but the assertion is independently covered at unit+integration level, so this does not downgrade coverage. |
| 1.3-AC4 | Descriptive per-cause error, org-restriction named explicitly | P1 | **FULL** | `repo-connection.actions.spec.ts:215-239` — asserts org-restriction message matches `/organization/i` **and explicitly does NOT match** generic patterns (`couldn't connect`/`something went wrong`). Mirrored in component (`RepositoryUrlForm.test.tsx:113-122`) and integration tests. E2E variant skipped (needs org with OAuth restriction enabled) but backed by active unit/component tests. |

### Story 1.4: Validate BMAD Initialization in the Connected Repository

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.4-AC1 | Confirms `_bmad/`, `_bmad-output/`, `.claude/` present + v6.x; empty `_bmad-output/` OK | P1 | **FULL** | `repository-validation.actions.spec.ts:90-100` explicitly asserts empty `_bmad-output/` is valid **and that its contents are never fetched** (deliberate "don't even check" design). |
| 1.4-AC2 | Missing prerequisite → blocking message names it + doc link | P1 | **FULL** | Three **distinct** tests, one per directory (`repository-validation.actions.spec.ts:268-309`), plus a combined "names all missing" test and a doc-link test. |
| 1.4-AC3 | `.claude/skills/` absent or empty → "no Skills found" | P1 | **FULL** | Distinct tests for absent (404), empty (no `.md`), and README-only cases (`repository-validation.actions.spec.ts:355-378`), plus nested `SKILL.md` directory-style detection. |
| 1.4-AC4 | Version outside v6.x → names detected version, states only v6 supported | P1 | **FULL** | `repository-validation.actions.spec.ts:147-176` (v5.9.9, v7.0.0 both rejected; message matches `/v6/i` and contains the detected version string). |

### Story 1.5: Resolve Git Identity for Commit Attribution

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.5-AC1 | Name/email exactly as returned by OAuth profile | P1 | **FULL** | `git-identity.test.ts:10-30` (incl. special-character/UTF-8 preservation). |
| 1.5-AC2 | No primary email → fallback to `{username}@users.noreply.github.com` | P2 | **FULL** | `git-identity.test.ts:34-68` — null, empty-string, and whitespace-only email all tested distinctly. |
| 1.5-AC3 | Consumable by sandbox init; OAuth token never appears in identity record | P0 | **FULL** | `git-identity.test.ts:115-136` asserts returned object's keys are exactly `['email','name']`. `git-identity.actions.spec.ts:108-137` goes further — asserts the **Prisma `select:` clause itself** omits token fields, so the token is structurally unreachable, not just absent from the response by convention. |

### Story 1.6: Detect and Recover from Credential Failures

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.6-AC1 | 401/403 → `credentialHealth: failed` within one operation cycle, no silent failure (NFR-R1) | P0 | **PARTIAL** | Both 401 and 403 paths are confirmed to call `markCredentialFailed()` (`repo-connection.actions.spec.ts:185-314`, `repository-validation.actions.spec.ts:665-681`, `credential-health.test.ts:117-133`). **Gap:** no test asserts the status flip completes *before* the operation returns to the caller ("within one cycle" is untested as a timing/ordering property — only that the function is invoked). |
| 1.6-AC2 | Tenant authorization check before token resolution; tokens never resolved across users (NFR-S2) | P0 | **PARTIAL** | Positive path only: `credential-health.test.ts:64-106` confirms the Prisma query is scoped by the *correct* `userId`. **Gap:** no test attempts to resolve another user's token and asserts denial — the negative case that is the actual security guarantee in the AC's wording is untested. |
| 1.6-AC3 | Re-auth restores `healthy` without disconnecting repo | P1 | **PARTIAL** | `credential-health.actions.spec.ts:90-105` confirms `reauthorizeGitHub()` calls `signIn('github', ...)`; `credential-health.test.ts:144-150` confirms the status-flip function itself. **Gap:** no integration/E2E test runs the full cycle (fail → re-auth → healthy) or asserts the `RepoConnection` row survives re-auth undeleted — the two halves are only unit-tested in isolation. |

### Story 1.7: Enforce Authenticated, Full Access for All MVP Users

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.7-AC1 | Any unauthenticated route → redirect to /sign-in | P0 | **FULL** | Shared evidence with 1.2-AC4, plus `(dashboard)/layout.test.tsx:44-60` defense-in-depth guard. |
| 1.7-AC2 | Authenticated user gets full access, no paywall/billing gate | P2 | **FULL** | `access-baseline.spec.ts` — 5 E2E tests asserting absence of paywall/trial/billing/upgrade language across multiple routes and after reload. (Necessarily a negative assertion — no billing system exists yet to test against.) |

### Story 1.8: Build the Persistent App Shell

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.8-AC1 | Side nav (240px, wordmark, New Conversation, last-5 Conversations, links, Settings avatar), no show-more, keyboard order | P1 | **FULL** | `SideNavigation.test.tsx` (16 tests) + `app-shell.spec.ts` E2E (9 tests, incl. 240px width assertion and DOM tab-order check). |
| 1.8-AC2 | Three-zone independent scroll model | P1 | **FULL** | `app-shell.spec.ts:94-140` — injects 2000px content, scrolls it, asserts header/side-nav Y-position unchanged. |
| 1.8-AC3 | Breadcrumb on depth-1 pages only, no route transitions | P2 | **FULL** | `Breadcrumb.test.tsx` + `app-shell.spec.ts:171-197` (present on `/artifacts`, `/settings`, `/conversations/new`; absent on `/project-map`). |
| 1.8-AC4 | Accessibility floor (focus ring, focus-to-h1, modal trap, aria-live, aria-labels, reduced-motion) | P1 | **PARTIAL** | Most sub-behaviors covered (`AppShell.test.tsx`, `app-shell.spec.ts:201-286`). **Gaps:** (a) "no animated route transitions" verified only by absence of transition code, not by a test; (b) "focus ring never suppressed on click" tested only via programmatic `.focus()`, not a real click-then-check; (c) a prior test-review (`test-reviews/test-review-1-8.md`) flagged two `AppShell.test.tsx` cases (lines 67-76, 78-87) with weak/zero assertions, not yet fixed. `aria-live`/`role="status"` sub-clauses are Epic 3 scope (chat stream doesn't exist yet) and correctly out of scope here. |
| 1.8-AC5 | Responsive: ≥1024px desktop, 768-1023px drawer overlay, dismiss on outside-click/Escape | P1 | **FULL** | `app-shell.spec.ts:238-286` — hamburger at 900px, side nav at 1280px, drawer open/close/dismiss/focus-return all asserted. |

### Story 1.9: Document and Validate the KEK Rotation Runbook

| AC | Requirement | Priority | Coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1.9-AC1 | Runbook documents exact steps; no plaintext token ever exposed | P0 | **FULL** | `docs/runbooks/kek-rotation.md` documents the 9-step procedure. The no-exposure guarantee is enforced structurally: `unwrapDek`/`rewrapDek` accept only `Pick<'encryptedDek'\|'dekNonce'>` (token fields are not even in the type signature), and `crypto.test.ts:149-162` asserts the rewrap result's keys are exactly `['dekNonce','encryptedDek']`. |
| 1.9-AC2 | Validated against non-prod; every token remains decryptable after rotation | P0 | **FULL** | 8 unit tests (`crypto.test.ts:121-248`: round-trip, DEK-byte preservation, fresh nonce, wrong-KEK rejection, malformed input, chained A→B→C rotation) **plus** a recorded operational run in the runbook itself (2026-07-02, non-prod Postgres, 3 synthetic credentials, "3 ok, 0 failed" decrypt-under-new-KEK result, including straggler and unrecoverable-row failure-path validation). |
| 1.9-AC3 | Runbook committed to repo | P3 | **FULL** | `docs/runbooks/kek-rotation.md` tracked in git; cross-referenced from `.env.example` and `package.json`'s `rotate-kek` script. |

---

## Gap Analysis

### P0 gaps (block the gate)

1. **1.6-AC2 — Tenant isolation negative path untested (highest-severity finding).** The AC's core security guarantee — "tokens never resolved across users" — has no test that attempts cross-tenant access and asserts denial. Current tests only prove the *correct* user's token resolves correctly; they don't prove an *incorrect* user is refused. This is exactly the "auth/authz missing negative path" blind spot the coverage-heuristics check exists to catch (NFR-S2).
   _Suggested fix: in `credential-health.test.ts`, add a case that calls `resolveOAuthToken(userA)` with a credential row seeded for `userB` only, and asserts it throws/returns not-found rather than returning `userB`'s token._

2. **1.6-AC1 — "Within one operation cycle" timing unverified.** Both 401 and 403 are confirmed to trigger `markCredentialFailed()`, but no test proves this happens synchronously/before the response returns, which is what "no silent failure" and "within one cycle" mean in the AC.
   _Suggested fix: an integration test that triggers the 401/403 path and immediately (same test, no additional await beyond the action's own promise) queries credential health and asserts `failed`._

3. **1.2-AC1 — `repo`-scope OAuth request has no active-level test.** The only test that checks the GitHub provider requests `scope: 'repo'` is a Playwright E2E test gated behind `AUTH_GITHUB_ID`, which is skipped in ordinary CI runs.
   _Suggested fix: a one-line unit test on `authConfig.providers[0].authorization.params.scope` in `auth.config.spec.ts`, so this doesn't depend on a real OAuth app being configured._

### P1 gap (does not block gate, but noted)

4. **1.6-AC3 — Re-auth-to-healthy cycle only unit-tested in isolation.** No test demonstrates the full path (failed → re-auth → healthy) or confirms the `RepoConnection` row is preserved (not deleted) across re-auth.

5. **1.8-AC4 — Two weak-assertion unit tests already flagged in a prior review.** `AppShell.test.tsx:67-87` ("drawer opens on hamburger click" / "drawer closes on Escape") were flagged by `test-reviews/test-review-1-8.md` (findings M-1, M-2) as missing effective assertions. E2E coverage (`app-shell.spec.ts`) compensates functionally, but the unit tests themselves don't currently prove what their names claim.

### Coverage heuristics

| Heuristic | Result |
| --- | --- |
| Auth/authz negative-path coverage | **Gap found** — 1.6-AC2 (see above) |
| Happy-path-only criteria | 1.6-AC1, 1.6-AC3 lean happy-path (see above) |
| Endpoint coverage (internal test-only routes) | Not applicable — oracle is acceptance criteria, not an OpenAPI contract |
| UI journey / UI state gaps | Minor — 1.8-AC4's "no animated transitions" and click-triggered focus ring are unverified by test (verified only by code absence/inspection) |

### Skipped tests (all Playwright E2E, gated behind real-credential env vars)

| Test | File:Line | Reason | Severity |
| --- | --- | --- | --- |
| "clicking Sign in with GitHub navigates toward GitHub OAuth" | `playwright/e2e/auth/sign-in.spec.ts:123-147` | Requires `AUTH_GITHUB_ID` | High (this is the *only* test of 1.2-AC1's `repo` scope clause) |
| "encrypted token is never visible in the browser" | `playwright/e2e/onboarding/onboarding.spec.ts:265-291` | Requires real GitHub credentials | Medium (backed by active unit/integration tests) |
| "org OAuth App restriction error explicitly names the org cause" | `playwright/e2e/onboarding/onboarding.spec.ts:215-229` | Requires an org with OAuth App restrictions enabled | Medium (backed by active unit/component tests) |

---

## Recommendations

| Priority | Action | Affected Requirements |
| --- | --- | --- |
| URGENT | Add a negative-path test proving cross-tenant token resolution is denied | 1.6-AC2 |
| URGENT | Add a synchronous "flip happens before response returns" test for the 401/403 → failed transition | 1.6-AC1 |
| URGENT | Add a unit-level assertion that the GitHub provider requests `scope: 'repo'`, independent of the skipped E2E test | 1.2-AC1 |
| HIGH | Add an integration/E2E test for the full re-auth cycle (failed → healthy) that also asserts the RepoConnection row is not deleted | 1.6-AC3 |
| MEDIUM | Fix the two weak-assertion `AppShell.test.tsx` cases already flagged in `test-review-1-8.md` (M-1, M-2) | 1.8-AC4 |
| LOW | Run `/bmad-testarch-test-review` on Story 1.6's test files specifically, given the two P0 gaps found here | 1.6 |

## Next Actions

1. Address the 3 URGENT items above — they are small, targeted additions to existing test files (`credential-health.test.ts`, `auth.config.spec.ts`), not new test infrastructure or new stories.
2. Re-run `/bmad-testarch-trace for epic 1` after the fixes land to confirm P0 coverage reaches 100% and the gate flips to PASS or CONCERNS.
3. Stories 1.1's AC1/AC2 (P2/P3, NONE coverage) are low-risk by design (infrastructure/cosmetic, compile-time-caught) — no action required unless the team wants explicit regression protection for the Tailwind token values.

---

_Machine-readable companions: `e2e-trace-summary-epic-1.json`, `gate-decision-epic-1.json` (same directory)._
