---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-07-06'
epic: 'Hydration & SSR Testing Gap (post-incident test design)'
inputDocuments:
  - '_bmad-output/project-context.md'
  - 'apps/web/src/components/shell/AppShell.tsx'
  - 'apps/web/src/app/(dashboard)/(app)/project-map/page.tsx'
  - 'apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx'
  - 'apps/web/src/components/shell/AppShell.test.tsx'
  - 'apps/web/jest.config.ts'
  - 'playwright.config.ts'
  - 'playwright/e2e/project-map/project-map.spec.ts'
  - 'playwright/e2e/shell/app-shell.spec.ts'
  - '_bmad-output/test-artifacts/test-design-architecture.md'
  - '_bmad-output/test-artifacts/test-design-qa.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/risk-governance.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/probability-impact.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/test-levels-framework.md'
  - '.claude/skills/bmad-testarch-test-design/resources/knowledge/test-priorities-matrix.md'
  - '_bmad/tea/config.yaml'
---

# Test Design Progress — Hydration & SSR Testing Gap

## Step 1: Detect Mode & Prerequisites

**Mode:** Epic-Level Test Design

**Rationale:** A hydration mismatch defect on `/project-map` slipped through the entire test suite. Forensic investigation (Reflector role) confirmed four systemic test gaps, all graded Confirmed against actual artifacts. This run produces a risk-grounded test plan to close those gaps and prevent the defect class from recurring.

**Triggering incident:** React 19 hydration warning — "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties." Root cause: `AppShell.tsx` calls `h1.setAttribute('tabindex', '-1')` in a `useEffect`, which can fire on streamed content before React finishes hydrating that chunk. The `project-context.md` rule at line 106 already documents this anti-pattern — the code predates or violates the rule.

**Confirmed findings (de-facto acceptance criteria):**
1. No hydration round-trip testing exists anywhere in the suite (no `hydrateRoot` calls; jsdom+RTL does pure client render; page tests use `renderToStaticMarkup` without hydrating).
2. Page and layout tests mock their children, so the integrated tree (server-rendered AppShell wrapping streamed page content) is never exercised.
3. E2E tests don't capture browser console errors (`page.on('pageerror')` / `page.on('console')` not wired up anywhere).
4. The AppShell unit test encodes the problematic `setAttribute` pattern as correct behavior (asserts `tabindex="-1"` outcome without asserting mechanism safety).

**Prerequisite check:**
- Epic/story requirements with acceptance criteria: ✅ (four confirmed findings)
- Architecture context: ✅ (`project-context.md` loaded as persistent fact; line 106 documents the anti-pattern)

**Scope note:** This run is scoped to the hydration/SSR testing gap. The completed System-Level progress file at `test-design-progress.md` (2026-06-17) is preserved untouched.

## Step 2: Load Context & Knowledge Base

**Config flags loaded** from `_bmad/tea/config.yaml`:
- `tea_use_playwright_utils`: true
- `tea_use_pactjs_utils`: false
- `tea_pact_mcp`: none
- `tea_browser_automation`: auto
- `test_stack_type`: auto → **detected stack: fullstack** (Playwright config + Next.js frontend + NestJS backend)
- `test_artifacts`: `_bmad-output/test-artifacts`
- `risk_threshold`: p1

**Knowledge fragments loaded (Epic-Level required):**
- `risk-governance.md` — risk scoring (probability × impact, 1-9 scale), gate decision engine, coverage traceability matrix
- `probability-impact.md` — 3×3 matrix definitions, action thresholds (1-3 DOCUMENT, 4-5 MONITOR, 6-8 MITIGATE, 9 BLOCK)
- `test-levels-framework.md` — unit/integration/E2E decision matrix, duplicate coverage guard, test ID format
- `test-priorities-matrix.md` — P0-P3 classification, risk-score-to-priority mapping, priority decision tree

**Prior system-level outputs loaded (context only, not modified):**
- `test-design-architecture.md` (2026-06-16) — 10 risks (R-01–R-10), none address SSR/hydration; closest is R-08 (SSE drain on shutdown, backend-side)
- `test-design-qa.md` (2026-06-16) — QA strategy
- `test-design-progress.md` (2026-06-17, completed) — system-level run, preserved untouched

**Existing test coverage analysis (Epic-Level):**

Scanned 100+ test artifact files. Key finding: **zero hydration/SSR round-trip coverage exists anywhere in the test suite.**

- Grep for `hydrat|SSR|server.render|stream` across all test artifacts returns 100 matches — every match relates to SSE streaming (agent-be → browser), BroadcastChannel SSR guards (preventing server-side execution), or `streaming.controller.spec.ts`. **Zero matches relate to React hydration, SSR-to-client HTML consistency, or `hydrateRoot` testing.**
- `automate-validation-report-1-8.md` (App Shell, Story 1.8) verdict: "PASS — AC-4 is covered at unit and E2E levels. Route focus management tested (unit + E2E)." This is the false positive — tests verify focus management *outcome* but not *mechanism safety* against hydration races.
- System-level `test-design-architecture.md` identifies 10 risks — none address SSR/hydration. The defect class was not on the radar during system-level planning.

**Existing fixture/test patterns noted:**
- Page tests: `renderToStaticMarkup` + string assertions, children mocked as string stubs (canonical pattern in `project-map/page.test.tsx`)
- Component tests: `@testing-library/react` `render()` in jsdom (pure client render, no hydration phase)
- E2E: Playwright with `withArtifacts`/`withRepoConnection` fixtures, no `page.on('pageerror')`/`page.on('console')` listeners anywhere
- `next/font/google` mocked in jest via `__mocks__/next-font.ts` (returns `--font-mock`), so font-variable hydration issues are invisible in unit tests too

**Loaded inputs confirmed.** Nothing missing.

## Step 3: Testability & Risk Assessment

Epic-Level mode — system-level testability review skipped (section 1). Risk assessment, NFR planning, and summary below.

### Risk Register

**R-H01: Hydration mismatch defects escape the entire test suite**
- **Category:** TECH
- **Probability:** 3 (Likely) — confirmed instance in `AppShell.tsx:31` (`setAttribute` in `useEffect`); the pattern may recur in other client components with `useEffect` + DOM mutation. React 19 no longer silently patches these.
- **Impact:** 2 (Degraded) — hydration warnings don't crash the app, but cause attribute/state divergence, broken accessibility (focus management), and potential runtime errors in edge cases. User-facing degradation, not a crash.
- **Score:** 6 → **MITIGATE** (CONCERNS at gate)
- **Mitigation:** Add hydration round-trip testing (`hydrateRoot` in jest with `react-dom/server` → `hydrateRoot` pipeline); refactor `setAttribute` to React props (`tabIndex={-1}`) per `project-context.md` line 106.
- **Owner:** QA + Dev (QA writes the hydration test utility; Dev refactors the anti-pattern)
- **Timeline:** Before next sprint release

**R-H02: Integrated tree defects hide behind mocked child seams**
- **Category:** TECH
- **Probability:** 3 (Likely) — page tests mock children as string stubs (`project-map/page.test.tsx:52-63`); layout tests mock the shell (`(app)/layout.test.tsx:27-33`). Any defect that manifests only when the server-rendered `AppShell` wraps streamed page content is structurally invisible.
- **Impact:** 2 (Degraded) — defects in the integration seam cause real user-facing issues (hydration mismatches, focus management races, layout shifts) that no test catches.
- **Score:** 6 → **MITIGATE** (CONCERNS at gate)
- **Mitigation:** Add at least one integrated render test per layout/page boundary — render the real shell wrapping real page content (not stubs) — to exercise the seam where SSR streaming + client hydration interact.
- **Owner:** QA
- **Timeline:** Before next sprint release

**R-H03: Browser console errors invisible to E2E suite**
- **Category:** TECH
- **Probability:** 3 (Likely) — no `page.on('pageerror')` or `page.on('console')` listeners anywhere in `playwright/e2e/**/*.spec.ts` (grep confirmed zero matches). Any console error, hydration warning, or uncaught exception on any route fires silently without failing any test.
- **Impact:** 2 (Degraded) — silent console errors indicate real defects that degrade UX, accessibility, or runtime stability. The entire defect class of "React warns in console but page still renders" is invisible.
- **Score:** 6 → **MITIGATE** (CONCERNS at gate)
- **Mitigation:** Wire up `page.on('pageerror')` and `page.on('console', msg => msg.type() === 'error')` in a global Playwright fixture or `beforeEach`; fail tests on uncaught errors and React hydration warnings.
- **Owner:** QA
- **Timeline:** Before next sprint release

**R-H04: Behavior-vs-mechanism testing gap**
- **Category:** TECH
- **Probability:** 2 (Possible) — not all outcome-based tests hide unsafe mechanisms, but the pattern is established (`AppShell.test.tsx:119-120` asserts `tabindex="-1"` outcome without asserting the `setAttribute` mechanism is safe in streaming SSR). May recur in other component tests.
- **Impact:** 2 (Degraded) — unsafe mechanisms pass tests but fail in production streaming conditions. Creates false confidence.
- **Score:** 4 → **MONITOR**
- **Mitigation:** Add a review checklist item that flags `setAttribute` in client-component `useEffect`s during test review; document the "assert mechanism safety, not just outcome" principle in test guidelines.
- **Owner:** QA
- **Timeline:** Next test review cycle

**R-H05: `next/font/google` variable hydration mismatch (Hypothesized)**
- **Category:** TECH
- **Probability:** 2 (Possible) — `layout.tsx:27` applies `inter.variable`/`jetbrainsMono.variable` to `<html className>`. Font class hashes may differ between server/client bundles in Turbopack. Mocked in jest (`__mocks__/next-font.ts` returns `--font-mock`), so invisible to unit tests. Not confirmed — the truncated error message didn't name the offending attribute.
- **Impact:** 1 (Minor) — if it's just the font class on `<html>`, it's cosmetic; if it cascades to child hydration, impact could be higher.
- **Score:** 2 → **DOCUMENT**
- **Mitigation:** Confirm by running dev server and reading the full hydration error message. If confirmed, add `suppressHydrationWarning` to `<html>` or pin font loading strategy.
- **Owner:** Dev
- **Timeline:** During root cause confirmation

### NFR Planning Assessment

`nfr-criteria.md` was not loaded for this Epic-Level run. This gap touches **maintainability** and **reliability** of the test suite itself:

- **Maintainability:** The test suite's inability to catch hydration defects means future client-component changes that introduce `setAttribute`/`Date.now()`/`Math.random()` in render or `useEffect` will escape detection. Maintainability debt in the test methodology.
- **Reliability:** Hydration mismatches cause runtime attribute divergence — a reliability degradation for end users. React 19's decision to stop patching them elevates this from warning to potential runtime failure.

No measurable thresholds from PRD/architecture apply directly. NFR gap converted into risks R-H01 through R-H04 above.

### Risk Summary

| ID | Category | Title | P | I | Score | Action | Owner |
|----|----------|-------|---|---|-------|--------|-------|
| R-H01 | TECH | Hydration mismatch defects escape entire test suite | 3 | 2 | 6 | MITIGATE | QA + Dev |
| R-H02 | TECH | Integrated tree defects hide behind mocked child seams | 3 | 2 | 6 | MITIGATE | QA |
| R-H03 | TECH | Browser console errors invisible to E2E suite | 3 | 2 | 6 | MITIGATE | QA |
| R-H04 | TECH | Behavior-vs-mechanism testing gap | 2 | 2 | 4 | MONITOR | QA |
| R-H05 | TECH | `next/font/google` variable hydration mismatch (hypothesized) | 2 | 1 | 2 | DOCUMENT | Dev |

**Gate decision:** CONCERNS — three risks at score 6 (MITIGATE) require mitigation before the test suite can be considered adequate for the hydration defect class. No score-9 blockers. R-H05 is hypothesized and needs confirmation before action.

## Step 4: Coverage Plan & Execution Strategy

### Coverage Matrix

| Test ID | Scenario | Test Level | Priority | Risk Addressed | Rationale |
|---------|----------|------------|----------|----------------|-----------|
| HYD-UNIT-001 | `hydrateRoot` round-trip for `AppShell` — render to static markup (server), hydrate with `hydrateRoot` (client), assert no hydration warnings emitted | Unit (jsdom) | P0 | R-H01 | Foundational test that catches the entire defect class. AppShell is the confirmed defect site. |
| HYD-UNIT-002 | Integrated tree `hydrateRoot` round-trip — render real `AppShell` wrapping real `ProjectMapPage` (not stubbed children) to static markup, hydrate, assert no warnings | Unit (node) | P0 | R-H01, R-H02 | Exercises the seam where SSR streaming + client hydration interact. Replaces mocked-child isolation with integrated coverage. |
| HYD-UNIT-003 | `setAttribute`-in-`useEffect` detection — scan client-component files for `setAttribute` calls in `useEffect` bodies, fail if found | Unit (lint/static analysis) | P1 | R-H04 | Catches the anti-pattern at code level. Enforces `project-context.md` line 106 rule mechanically, not just by review. |
| HYD-E2E-001 | Global `page.on('pageerror')` + `page.on('console', msg => msg.type() === 'error')` fixture — fail any E2E test on uncaught errors or React hydration warnings | E2E (Playwright) | P0 | R-H03 | Infrastructure-level fix. Once wired, every existing E2E test automatically gains console-error detection. |
| HYD-E2E-002 | `/project-map` hydration assertion — navigate, assert no hydration warnings in console, assert `h1` has `tabindex="-1"` in server HTML (not added post-hydration by `setAttribute`) | E2E (Playwright) | P0 | R-H01, R-H03 | Confirms the specific defect site is clean after fix. Real browser, real streaming. |
| HYD-E2E-003 | `/artifacts` hydration assertion — navigate, assert no hydration warnings | E2E (Playwright) | P1 | R-H03 | Second route for pattern coverage. Ensures the fix generalizes beyond project-map. |
| HYD-E2E-004 | `/settings` hydration assertion — navigate, assert no hydration warnings | E2E (Playwright) | P1 | R-H03 | Third route for pattern coverage. |
| HYD-UNIT-004 | `next/font` `suppressHydrationWarning` on `<html>` — if R-H05 confirmed, add `suppressHydrationWarning` to `<html>` in `layout.tsx` and verify via test | Unit | P2 | R-H05 | Conditional on R-H05 confirmation. Only needed if font-variable mismatch is the root cause. |

**Duplicate coverage guard:** HYD-UNIT-001/002 (unit) and HYD-E2E-002 (E2E) both test hydration — acceptable defense-in-depth (unit: mechanism, fast CI; E2E: real browser streaming). HYD-UNIT-003 (lint) and HYD-E2E-001 (global fixture) are orthogonal (code-time prevention vs runtime detection). No redundant overlap.

### NFR Coverage and Evidence Plan

| NFR Category | Planned Validation | Evidence Artifact | Status |
|--------------|-------------------|-------------------|--------|
| Maintainability | HYD-UNIT-003: `setAttribute`-in-`useEffect` detection test/lint | Test/lint output in CI | Threshold defined: zero `setAttribute` calls in client-component `useEffect` bodies |
| Reliability | HYD-UNIT-001/002 + HYD-E2E-002: hydration round-trip tests | Test pass/fail in CI | Threshold defined: zero hydration warnings/errors emitted during hydration |

No missing thresholds. No blockers. Evidence sources identified for `nfr-assess` to consume later.

### Execution Strategy

**PR pipeline (<15 min):**
- All unit tests: HYD-UNIT-001, HYD-UNIT-002, HYD-UNIT-003 (conditional: HYD-UNIT-004 if R-H05 confirmed)
- HYD-E2E-001 (global fixture applies automatically to all existing E2E tests — no separate run needed)
- HYD-E2E-002 (/project-map hydration — P0, runs on every PR)

**Nightly:**
- HYD-E2E-003, HYD-E2E-004 (P1 route coverage — hydration assertions on /artifacts, /settings)

### Resource Estimates

| Priority | Estimate | Scope |
|----------|----------|-------|
| P0 | ~8–12 hours | `hydrateRoot` test utility setup + HYD-UNIT-001/002 + HYD-E2E-001 global fixture + HYD-E2E-002 |
| P1 | ~4–6 hours | HYD-UNIT-003 (setAttribute detection) + HYD-E2E-003/004 (route coverage) |
| P2 | ~2–3 hours | HYD-UNIT-004 (conditional on R-H05 confirmation) |
| **Total** | **~14–21 hours** | ~2–3 days for 1 QA/SDET |

### Quality Gates

- **P0 pass rate = 100%** — HYD-UNIT-001, HYD-UNIT-002, HYD-E2E-001, HYD-E2E-002 must all pass
- **P1 pass rate ≥ 95%** — HYD-UNIT-003, HYD-E2E-003, HYD-E2E-004
- **Risk mitigations complete before release:** R-H01, R-H02, R-H03 must be mitigated (all score 6)
- **Coverage target:** hydration round-trip test exists for every client component with `useEffect` + DOM mutation (not just AppShell)
- **NFR evidence identified:** maintainability (HYD-UNIT-003), reliability (HYD-UNIT-001/002 + HYD-E2E-002)
- **Full NFR PASS/CONCERNS/FAIL deferred to `nfr-assess`** when implementation evidence exists

## Step 5: Generate Outputs & Validate

**Execution mode:** Sequential (auto-resolved from config `tea_execution_mode: auto`; no subagent/agent-team capability in this runtime)

**Output document:** `_bmad-output/test-artifacts/test-design-epic-hydration-gap.md`

**Template used:** `test-design-template.md` (Epic-Level mode, single document)

**Validation against checklist:**
- [x] Risk assessment matrix created (5 risks, R-H01 through R-H05)
- [x] Coverage matrix created (8 test scenarios, HYD-UNIT-001 through HYD-E2E-004)
- [x] Execution strategy documented (PR/Nightly/Weekly — simplified per checklist)
- [x] Resource estimates as ranges (~14–21 hours, ~0.5–1 week)
- [x] Quality gate criteria defined (P0 100%, P1 ≥95%, R-H01/H02/H03 mitigated)
- [x] NFR planning summary included (maintainability, reliability)
- [x] Output file written to correct location
- [x] Output file uses template structure
- [x] Priority sections do NOT include execution context (fixed per checklist)
- [x] Note at top of Test Coverage Plan clarifies P0/P1/P2/P3 = priority/risk, NOT timing
- [x] Resource estimates use intervals, not exact numbers
- [x] Timeline in week range (~0.5–1 week)
- [x] No duplicate coverage across levels (defense-in-depth justified)
- [x] CLI sessions cleaned up (no browser exploration used)
- [x] Temp artifacts stored in `_bmad-output/test-artifacts/`

**Completion report:**
- **Mode:** Epic-Level Test Design
- **Output file:** `_bmad-output/test-artifacts/test-design-epic-hydration-gap.md`
- **Progress file:** `_bmad-output/test-artifacts/test-design-progress-hydration-gap.md`
- **Key risks:** R-H01 (hydration escapes suite, score 6), R-H02 (mocked seams hide defects, score 6), R-H03 (console errors invisible to E2E, score 6)
- **Gate decision:** CONCERNS — three score-6 risks require mitigation before release
- **Open assumptions:** R-H05 (next/font mismatch) is hypothesized, needs dev server confirmation
- **Follow-on:** Run `*atdd` to generate failing P0 tests; run `*nfr-assess` after implementation
