---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-07-06'
---

# Test Design: Hydration & SSR Testing Gap (Post-Incident)

**Date:** 2026-07-06
**Author:** Murat (TEA Master Test Architect)
**Status:** Draft

---

## Executive Summary

**Scope:** Epic-level test design for the hydration & SSR testing gap identified after a React 19 hydration mismatch on `/project-map` escaped the entire test suite.

**Triggering Incident:** React 19 hydration warning — "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties." Root cause: `AppShell.tsx:31` calls `h1.setAttribute('tabindex', '-1')` in a `useEffect`, which can fire on streamed content before React finishes hydrating that chunk. The `project-context.md` rule at line 106 already documents this anti-pattern.

**Risk Summary:**

- Total risks identified: 5
- High-priority risks (≥6): 3 (R-H01, R-H02, R-H03)
- Critical categories: TECH (all five risks are technical/test-methodology gaps)

**Coverage Summary:**

- P0 scenarios: 4 (~8–12 hours)
- P1 scenarios: 3 (~4–6 hours)
- P2 scenarios: 1 (~2–3 hours)
- **Total effort**: ~14–21 hours (~0.5–1 week for 1 QA/SDET)

---

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| Backend SSE streaming hydration | SSE streaming is agent-be → browser; hydration is a frontend-only concern. Backend SSE tests exist in `streaming.controller.spec.ts`. | None needed — different defect class. |
| Non-AppShell client components | No confirmed hydration defects in other components yet. | HYD-UNIT-003 (setAttribute detection) will flag any future occurrences mechanically. Coverage target extends to all client components with `useEffect` + DOM mutation. |
| Visual regression testing | Hydration mismatches cause attribute divergence, not visual layout changes. | Out of scope for this incident. |

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-H01 | TECH | Hydration mismatch defects escape the entire test suite — no `hydrateRoot` calls; jsdom+RTL does pure client render; page tests use `renderToStaticMarkup` without hydrating | 3 | 2 | 6 | Add hydration round-trip testing (`hydrateRoot` in jest); refactor `setAttribute` to React props (`tabIndex={-1}`) per `project-context.md` line 106 | QA + Dev | Before next sprint release |
| R-H02 | TECH | Integrated tree defects hide behind mocked child seams — page tests mock children as string stubs; layout tests mock the shell; the seam where SSR streaming + client hydration interact is never exercised | 3 | 2 | 6 | Add at least one integrated render test per layout/page boundary — render real shell wrapping real page content (not stubs) | QA | Before next sprint release |
| R-H03 | TECH | Browser console errors invisible to E2E suite — no `page.on('pageerror')` or `page.on('console')` listeners anywhere; React warnings fire silently | 3 | 2 | 6 | Wire up `page.on('pageerror')` and `page.on('console', msg => msg.type() === 'error')` in a global Playwright fixture; fail tests on uncaught errors and hydration warnings | QA | Before next sprint release |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |
| R-H04 | TECH | Behavior-vs-mechanism testing gap — tests assert outcomes (`tabindex="-1"` present) without asserting mechanism safety (`setAttribute` in `useEffect` is unsafe in streaming SSR) | 2 | 2 | 4 | Add a review checklist item that flags `setAttribute` in client-component `useEffect`s; document "assert mechanism safety, not just outcome" principle | QA |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |
| R-H05 | TECH | `next/font/google` variable hydration mismatch (hypothesized) — `layout.tsx:27` applies font variables to `<html className>`; mocked in jest, so invisible to unit tests | 2 | 1 | 2 | Document; confirm by running dev server and reading full hydration error |

### Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **BUS**: Business Impact (UX harm, logic errors, revenue)
- **OPS**: Operations (deployment, config, monitoring)

---

## NFR Planning

**Purpose:** Capture epic-specific NFR thresholds, planned validation, and evidence expected for later `nfr-assess`. This is not a final evidence audit.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| ------------ | ----------------------- | --------- | ------------------ | --------------- |
| Maintainability | Zero `setAttribute` calls in client-component `useEffect` bodies (enforces `project-context.md` line 106) | R-H04 | HYD-UNIT-003: static analysis/lint scan of client-component files | Test/lint output in CI |
| Reliability | Zero hydration warnings/errors emitted during `hydrateRoot` round-trip | R-H01 | HYD-UNIT-001/002 + HYD-E2E-002: hydration round-trip tests | Test pass/fail in CI |

**Unknown thresholds:** None. Both thresholds are binary (zero occurrences / zero warnings).

---

## Entry Criteria

- [ ] Requirements and assumptions agreed upon by QA, Dev, PM
- [ ] Test environment provisioned and accessible (dev server for E2E)
- [ ] `project-context.md` line 106 rule acknowledged by Dev team
- [ ] R-H05 confirmation complete (run dev server, read full hydration error) — determines whether HYD-UNIT-004 is needed

## Exit Criteria

- [ ] All P0 tests passing (HYD-UNIT-001, HYD-UNIT-002, HYD-E2E-001, HYD-E2E-002)
- [ ] All P1 tests passing or failures triaged (HYD-UNIT-003, HYD-E2E-003, HYD-E2E-004)
- [ ] No open high-priority risks (R-H01, R-H02, R-H03 all mitigated)
- [ ] `setAttribute` anti-pattern refactored to `tabIndex={-1}` prop in AppShell
- [ ] Hydration round-trip test utility exists and is reusable for future client components

---

## Test Coverage Plan

> **Note:** P0/P1/P2/P3 denote priority and risk level, NOT execution timing. Execution timing is defined in the Execution Strategy section below.

### P0 (Critical)

**Criteria**: Blocks core journey + High risk (≥6) + No workaround

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| `hydrateRoot` round-trip for AppShell — render to static markup, hydrate, assert no warnings | Unit (jsdom) | R-H01 | 1 | QA + Dev | Foundational test for the entire defect class. Requires `hydrateRoot` test utility setup. |
| Integrated tree `hydrateRoot` round-trip — real AppShell wrapping real ProjectMapPage (not stubs) | Unit (node) | R-H01, R-H02 | 1 | QA | Exercises the mocked-child seam. Replaces isolation with integrated coverage. |
| Global `page.on('pageerror')` + `page.on('console')` fixture — fail on uncaught errors/hydration warnings | E2E (Playwright) | R-H03 | 1 | QA | Infrastructure-level fix. Automatically applies to all existing E2E tests. |
| `/project-map` hydration assertion — navigate, assert no warnings, assert `tabindex="-1"` in server HTML | E2E (Playwright) | R-H01, R-H03 | 1 | QA | Confirms the specific defect site is clean after fix. Real browser, real streaming. |

**Total P0**: 4 tests, ~8–12 hours

### P1 (High)

**Criteria**: Important features + Medium risk (3-4) + Common workflows

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| `setAttribute`-in-`useEffect` detection — scan client-component files, fail if found | Unit (lint) | R-H04 | 1 | QA | Enforces `project-context.md` line 106 mechanically. |
| `/artifacts` hydration assertion — navigate, assert no warnings | E2E (Playwright) | R-H03 | 1 | QA | Second route for pattern coverage. |
| `/settings` hydration assertion — navigate, assert no warnings | E2E (Playwright) | R-H03 | 1 | QA | Third route for pattern coverage. |

**Total P1**: 3 tests, ~4–6 hours

### P2 (Medium)

**Criteria**: Secondary features + Low risk (1-2) + Edge cases

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| `next/font` `suppressHydrationWarning` on `<html>` — conditional on R-H05 confirmation | Unit | R-H05 | 1 | Dev | Only needed if font-variable mismatch is confirmed as root cause. |

**Total P2**: 1 test, ~2–3 hours

### P3 (Low) - Run on-demand

**Criteria**: Nice-to-have + Exploratory + Performance benchmarks

N/A — no P3 scenarios identified for this scope.

**Total P3**: 0 tests, 0 hours

---

## Execution Strategy

**Philosophy:** Run everything in PRs if <15 min; defer only if expensive or long-running.

### PR Pipeline (<15 min)

All unit tests + P0 E2E tests:

- [ ] HYD-UNIT-001: AppShell `hydrateRoot` round-trip (Unit, ~30s)
- [ ] HYD-UNIT-002: Integrated tree `hydrateRoot` round-trip (Unit, ~30s)
- [ ] HYD-UNIT-003: `setAttribute`-in-`useEffect` lint scan (Unit, ~15s)
- [ ] HYD-E2E-001: Global console error fixture (E2E — infrastructure, applies to all existing tests automatically)
- [ ] HYD-E2E-002: `/project-map` hydration assertion (E2E, ~30s)

### Nightly

P1 E2E route coverage (hydration assertions on additional routes):

- [ ] HYD-E2E-003: `/artifacts` hydration assertion (E2E)
- [ ] HYD-E2E-004: `/settings` hydration assertion (E2E)

### Weekly / On-Demand

Conditional P2 tests:

- [ ] HYD-UNIT-004: `next/font` `suppressHydrationWarning` (only if R-H05 confirmed)

---

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| -------- | ----- | ---------- | ----------- | ----- |
| P0 | 4 | 2.5 | ~8–12 | `hydrateRoot` utility setup is the bulk; subsequent tests reuse it |
| P1 | 3 | 1.5 | ~4–6 | Lint rule + route coverage |
| P2 | 1 | 2.0 | ~2–3 | Conditional on R-H05 confirmation |
| P3 | 0 | — | 0 | — |
| **Total** | **8** | **-** | **~14–21** | **~0.5–1 week** |

### Prerequisites

**Test Data:**

- Existing `withArtifacts` / `withRepoConnection` Playwright fixtures (reused for HYD-E2E-002/003/004)
- Mock auth/prisma stubs from existing page tests (reused for HYD-UNIT-002)

**Tooling:**

- `hydrateRoot` from `react-dom/client` (not currently used in the suite — new dependency on existing package)
- `renderToStaticMarkup` from `react-dom/server` (already used in page tests)
- Playwright `page.on('pageerror')` / `page.on('console')` APIs (built-in, not currently wired)

**Environment:**

- Dev server (`yarn nx run web:dev`) for E2E — already configured in `playwright.config.ts`
- Jest jsdom environment — already configured in `apps/web/jest.config.ts`

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (no exceptions)
- **P1 pass rate**: ≥95% (waivers required for failures)
- **P2/P3 pass rate**: ≥90% (informational)
- **High-risk mitigations**: 100% complete or approved waivers (R-H01, R-H02, R-H03)

### Coverage Targets

- **Critical paths**: Hydration round-trip test exists for AppShell (the confirmed defect site)
- **Security scenarios**: N/A (no SEC risks in this scope)
- **Business logic**: N/A (no BUS risks in this scope)
- **Edge cases**: `setAttribute` detection covers all client components, not just AppShell

### Non-Negotiable Requirements

- [ ] All P0 tests pass
- [ ] No high-risk (≥6) items unmitigated (R-H01, R-H02, R-H03)
- [ ] `setAttribute` anti-pattern refactored to `tabIndex={-1}` prop in AppShell
- [ ] Planned NFR evidence exists (maintainability: HYD-UNIT-003; reliability: HYD-UNIT-001/002 + HYD-E2E-002)

---

## Mitigation Plans

### R-H01: Hydration mismatch defects escape the entire test suite (Score: 6)

**Mitigation Strategy:** Create a `hydrateRoot` test utility that renders a component to static markup (server), then hydrates that markup with `hydrateRoot` (client), capturing any hydration warnings. Use it in HYD-UNIT-001 (AppShell) and HYD-UNIT-002 (integrated tree). Dev team refactors `AppShell.tsx:31` `h1.setAttribute('tabindex', '-1')` to `<h1 tabIndex={-1}>` prop per `project-context.md` line 106.
**Owner:** QA (test utility) + Dev (refactor)
**Timeline:** Before next sprint release
**Status:** Planned
**Verification:** HYD-UNIT-001 and HYD-UNIT-002 pass with zero hydration warnings. `grep -r "setAttribute" apps/web/src/components/shell/AppShell.tsx` returns no matches in `useEffect` bodies.

### R-H02: Integrated tree defects hide behind mocked child seams (Score: 6)

**Mitigation Strategy:** HYD-UNIT-002 renders the real `AppShell` wrapping the real `ProjectMapPage` (with mocked data dependencies, but real component tree — no string stubs). This exercises the seam where SSR streaming + client hydration interact.
**Owner:** QA
**Timeline:** Before next sprint release
**Status:** Planned
**Verification:** HYD-UNIT-002 passes. The test renders the integrated tree, not isolated stubs.

### R-H03: Browser console errors invisible to E2E suite (Score: 6)

**Mitigation Strategy:** Add a global Playwright fixture (or `beforeEach` in a shared support file) that wires `page.on('pageerror', err => { throw err })` and `page.on('console', msg => { if (msg.type() === 'error') throw new Error(msg.text()) })`. Once wired, every existing E2E test automatically gains console-error detection.
**Owner:** QA
**Timeline:** Before next sprint release
**Status:** Planned
**Verification:** HYD-E2E-001 is the fixture itself. Any E2E test that triggers a console error or hydration warning will fail.

---

## Assumptions and Dependencies

### Assumptions

1. The `setAttribute` anti-pattern in `AppShell.tsx:31` is the primary cause of the hydration mismatch (Reflector's Finding 5 hypothesizes `next/font/google` as a secondary cause — R-H05).
2. `hydrateRoot` from `react-dom/client` works in jsdom (it does — jsdom supports DOM hydration; React 19's `hydrateRoot` is designed for this).
3. Playwright's `page.on('pageerror')` captures React hydration warnings (it captures uncaught errors; React hydration warnings log to `console.error`, which `page.on('console')` captures).

### Dependencies

1. Dev team refactors `AppShell.tsx:31` `setAttribute` → `tabIndex={-1}` prop — Required before HYD-UNIT-001 can pass
2. R-H05 confirmation (dev server run) — Required to determine whether HYD-UNIT-004 is needed

### Risks to Plan

- **Risk**: `hydrateRoot` in jsdom doesn't reproduce the streaming timing that triggers the mismatch in a real browser
  - **Impact**: HYD-UNIT-001/002 may pass even when the defect exists in production
  - **Contingency**: HYD-E2E-002 (real browser, real streaming) is the defense-in-depth backstop. The unit tests catch the mechanism; the E2E test catches the timing.

---

## Follow-on Workflows (Manual)

- Run `*atdd` to generate failing P0 tests (separate workflow; not auto-run).
- Run `*automate` for broader coverage once implementation exists.
- After implementation, run `*nfr-assess` to validate maintainability and reliability evidence.

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: _______ Date: _______
- [ ] Tech Lead: _______ Date: _______
- [ ] QA Lead: _______ Date: _______

**Comments:**

---

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| ----------------- | ------ | ----------------- |
| **AppShell** | `setAttribute` refactor to `tabIndex={-1}` prop | `AppShell.test.tsx` (existing focus-management tests must still pass), `app-shell.spec.ts` (E2E route-focus tests) |
| **Playwright E2E suite** | Global console-error fixture added | All existing E2E tests — any that currently trigger console errors will start failing (expected; fix the errors, don't suppress the fixture) |
| **Jest config** | `hydrateRoot` utility added | No config change needed; `react-dom/client` is already available via React 19 |

---

## Appendix

### Knowledge Base References

- `risk-governance.md` - Risk classification framework
- `probability-impact.md` - Risk scoring methodology
- `test-levels-framework.md` - Test level selection
- `test-priorities-matrix.md` - P0-P3 prioritization

### Related Documents

- PRD: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- Project Context: `_bmad-output/project-context.md` (line 106 documents the `setAttribute` anti-pattern)
- System-Level Test Design: `_bmad-output/test-artifacts/test-design-architecture.md` (2026-06-16, preserved)
- System-Level QA Strategy: `_bmad-output/test-artifacts/test-design-qa.md` (2026-06-16, preserved)

---

**Generated by**: BMad TEA Agent - Test Architect Module
**Workflow**: `bmad-testarch-test-design`
**Version**: 4.0 (BMad v6)
