# Epic 5 Open Issues — 2026-07-12

Consolidated, deduplicated list of every open, unresolved issue surfaced across the 8-stage post-epic closeout flow (bug-hunt, fidelity audit, traceability gate, NFR audit, deferred-work prune, retrospective, test-design revision, project-context cleanup).

**Epic 5 status:** NOT done. Stories 5-1 through 5-4 are marked `done` in `sprint-status.yaml`, but the epic itself remains `in-progress` pending resolution of the items below.

**Traceability gate:** CONCERNS (not FAIL — all 38 ACs have real coverage; 4 documented weaknesses).

**Source artifacts:**
- `_bmad-output/implementation-artifacts/bug-hunt-epic-5-ux-mockup-fidelity-close-visual-drift.md`
- `_bmad-output/test-artifacts/test-fidelity-audit-2026-07-12.md`
- `_bmad-output/test-artifacts/traceability/gate-decision-epic-5.json`
- `_bmad-output/test-artifacts/traceability/traceability-matrix-epic-5.md`
- `_bmad-output/test-artifacts/nfr-assessment-5-epic.md`, `nfr-assessment-5-2.md`, `nfr-assessment-5-3.md`
- `_bmad-output/implementation-artifacts/epic-5-retro-2026-07-12.md`
- `_bmad-output/test-artifacts/test-design-qa.md` (Post-Epic-5 Gap Closure Plan)

---

## A. Implementation gaps in "done" stories (ACs not fully met)

Stories marked `done` in `sprint-status.yaml` but with acceptance criteria not fully satisfied in the codebase. These are what keep Epic 5 from actually being done.

### A1 — `no-scrollbar` missing on full-width artifact-list pane (5.4-AC7)

- **Status:** NOT DONE
- **AC:** Story 5.4 AC-7 — all scrollable panels on the 3 affected surfaces get `no-scrollbar`.
- **Location:** `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:123`
- **Detail:** The two-pane layout (line 93, when an artifact is selected) got `no-scrollbar` correctly. The full-width list layout (line 123, when NO artifact is selected) has `overflow-y-auto` but was missed. The test suite only renders with `?id=` (two-pane mode); no test case renders without `id`, so the gap was invisible.
- **Flagged by:** bug-hunt M2, trace weakness #1, NFR-5.4-2, test-design P1-016
- **Fix:** Add `no-scrollbar` to line 123. Add a test case rendering without `id` searchParam asserting `no-scrollbar` on the full-width pane.

### A2 — Branded placeholder not wired up (5.3-AC5)

- **Status:** NOT DONE
- **AC:** Story 5.3 AC-5 — branded placeholder `"Message bmad-easy…"`.
- **Location:** `ChatMessageList` component (parent wiring).
- **Detail:** The branded placeholder exists in the component but the parent never wires it up. The test correctly verifies the default only, but the AC's branded variant is unimplemented.
- **Flagged by:** trace weakness #2
- **Fix:** Wire the branded placeholder text from the parent component.

### A3 — Auto-scroll regression hides Retry button on `SESSION_TIMEOUT` (5.3-AC3 regression)

- **Status:** NOT DONE
- **AC:** Story 5.3 AC-3 (spinner/retry relocation) introduced a regression.
- **Location:** `apps/web/src/components/conversation/ChatMessageList.tsx:44-48` (auto-scroll deps), `:131-146` (error/retry render).
- **Detail:** Story 5.3 AC-3 moved `SessionStartSpinner` and the Retry button from `ConversationPane`'s input area into `ChatMessageList` (the scrollable `role="log"` container). The auto-scroll `useEffect` depends on `[messages, isThinking]` only — it does NOT include `errorMessage` or `showRetry`. When an error or retry button appears without a new message, the scroll effect doesn't fire, so the new content renders below the current scroll position. If the user is scrolled up (e.g., reviewing earlier messages when a `SESSION_TIMEOUT` fires), the Retry button and error message are below the fold and invisible. The user sees a frozen conversation with no visible retry affordance.
- **Production-reachable:** `SESSION_TIMEOUT` during a long conversation (user scrolled up reading earlier messages) hides the Retry button. The 30s provisioning timeout fires during `provisioning`/`reconnecting` state, transitioning to `timeout` and setting `errorMessage`.
- **Flagged by:** bug-hunt M1, NFR-5.3-1, retro action item, test-design P1-014
- **Fix:** Add `errorMessage`, `showRetry`, `showSpinner` to the auto-scroll effect's dependency array, OR add a dedicated effect that scrolls to bottom when these flags flip true (guarded with `isAtBottomRef.current` to avoid scrolling when the user has intentionally scrolled up). **Needs decision B1.**

---

## B. Decisions requiring user input

Explicitly flagged by sub-agents as requiring user input rather than autonomous resolution.

### B1 — Auto-scroll fix approach (for A3)

- **Status:** PENDING DECISION
- **Context:** When an error appears while the user is scrolled up, should the UI override their scroll position?
- **Options:**
  - (a) Add `errorMessage`/`showRetry`/`showSpinner` to the existing deps array — simple, but scrolls even when user intentionally scrolled up.
  - (b) Dedicated `useEffect` guarded by `isAtBottomRef.current` — more precise, small refactor.
- **Recommendation:** (b) — scroll-override on error is justified (state change the user should see), but the guard respects intent.

### B2 — `parseFrontmatter` quote-strip scope (bug-hunt M3)

- **Status:** PENDING DECISION
- **Context:** `title: "PRD: Onboarding Flow"` renders with literal quotes in the metadata badge. Full YAML parser is deferred per DP-5.
- **Options:**
  - (a) Tactical one-liner quote-strip now (`value.replace(/^["']|["']$/g, '')`).
  - (b) Bundle with the deferred `stripFrontmatter` regex hardening story.
- **Recommendation:** (a) — the fix is trivial and the bug is user-visible; don't let DP-5 block a one-liner.

### B3 — Keyboard scrollability of `no-scrollbar` panels (bug-hunt L6)

- **Status:** PENDING DECISION
- **Context:** `no-scrollbar` panels lack `tabIndex={0}`/`role="region"` — keyboard users can't scroll them. Explicitly deferred during 5.4 (AC-7 listed wheel/trackpad/touch, not keyboard).
- **Options:**
  - (a) Address now as a cross-surface a11y fix.
  - (b) Keep deferred.
- **Recommendation:** (a) — accessibility gap on 3 surfaces; deferring a11y debt is costly.

### B4 — Story 5.5 placement

- **Status:** PENDING DECISION
- **Context:** Story 5.5 is defined in `_bmad-output/planning-artifacts/epics.md` (lines ~1092-1164) but absent from `sprint-status.yaml`.
- **Options:** Fold into Epic 6 backlog / pending Epic 5 story / drop.
- **Note:** Blocks a clean Epic 6 start. Flagged by retro sub-agent.

### B5 — Epic 6 Sprint Change Proposal (2026-07-11) approval

- **Status:** PENDING DECISION
- **Context:** Pending approval at `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-11.md`.
- **Options:** Approve / reject / revise.
- **Note:** Blocks all Epic 6 story creation. Not an Epic 5 item, but blocks the next sprint.

---

## C. Code/test fixes

Concrete fixes surfaced by the bug-hunt, fidelity audit, NFR audit, and test-design revision. The test-design sub-agent logged most of these as P1/P2/P3 items in `_bmad-output/test-artifacts/test-design-qa.md` (Post-Epic-5 Gap Closure Plan).

### P1 — should fix before Epic 5 closure

| # | Status | Issue | Location | Stages | Fix |
|---|---|---|---|---|---|
| C1 | NOT DONE | (= A1) `no-scrollbar` on full-width artifact pane | `artifacts/page.tsx:123` | M2, trace, NFR, P1-016 | Add class + test rendering without `id` searchParam |
| C2 | NOT DONE | (= A3) Auto-scroll regression | `ChatMessageList.tsx:44-48` | M1, NFR, P1-014 | Fix deps / add guarded effect (needs B1) |
| C3 | NOT DONE | False-green ChatInput AC-4 test — `toContain('bg-text-3')` can't distinguish `disabled:bg-text-3` (correct) from `bg-text-3` (regression). Removing the `disabled:` prefix would still pass. | `ChatInput.test.tsx:224-241` | bug-hunt L1, P1-017 | Add positive assertion: enabled button does NOT contain `bg-text-3`; optionally assert `disabled:` prefix present |
| C4 | NOT DONE | Missing `aria-live="polite"` assertion — test asserts `role="log"` but not the `aria-live` that makes it work for screen readers. A future change removing `aria-live="polite"` would pass undetected. | `ChatMessageList.test.tsx:184-198` | bug-hunt L2, NFR-5.3, P1-014 | Add `expect(list).toHaveAttribute('aria-live', 'polite')` |
| C5 | NOT DONE | `connectRepository` mock returns hand-rolled shapes not type-checked against `ConnectResult`; `.catch()` fallback path at `RepositoryUrlForm.tsx:32-36` is unexercised. | `RepositoryUrlForm.test.tsx:20-22` | fidelity audit Finding 1, P1-015 | Type-checked mock factory + one `.catch()`-path test (~10 lines) |

### P2 — should fix, lower urgency

| # | Status | Issue | Location | Stages | Fix |
|---|---|---|---|---|---|
| C6 | NOT DONE | `withArtifacts` Playwright fixture broken — Story 5.4 AC-1/AC-5 hover-token E2E blocks were removed; only className-level unit tests remain for those 2 ACs. | `playwright/e2e/visual-containers/story-5-4-*.spec.ts` | fidelity audit Finding 3, P2-008 | Repair fixture (unique-constraint violations), restore E2E blocks |
| C7 | NOT DONE | Loading skeleton header mismatch — `conversations/[conversationId]/loading.tsx` still uses old header structure (`px-8 py-6`, no `border-b`, no Breadcrumb). 5.2 established the canonical header and updated `artifacts/loading.tsx` but missed this file. Violates `project-context.md` line 107 ("Skeletons must match real content dimensions"). | `conversations/[conversationId]/loading.tsx:4-6` | bug-hunt L3, NFR-5.2, P2-009 | Update header to match canonical: `border-b border-surface-raised pt-6 pb-4 px-8` + `flex items-center gap-3` wrapper + Breadcrumb + h1 |
| C8 | NOT DONE | 5.2-AC10 conversation-list scroll behavior — tests cover only the zero-conversation case (jsdom can't test scroll). | `SideNavigation` tests | trace weakness #4, P2-010 | Add E2E test for scroll behavior with >5 conversations |
| C9 | NOT DONE | Story 5.2 has no `test-review-validation-report-5-2.md` — every other story has one. Coverage is fine (782/782); only the per-story test-quality evidence is missing. | missing artifact | NFR epic, test-design | Run `bmad-testarch-test-review` against Story 5.2 test files |

### P3 — NFR quick-wins bundle (~9 fixes, ~1 hour total)

The NFR and retro sub-agents recommend bundling these into one hardening story. Test-design logged as P3-001.

| # | Status | Issue | Location | Source |
|---|---|---|---|---|
| C10 | NOT DONE | `take: 100` missing on `turn.findMany` (unbounded) | `apps/agent-be` | NFR epic |
| C11 | NOT DONE | `select` projection missing on `repoConnection.findUnique` | `apps/agent-be` | NFR-5.4 |
| C12 | NOT DONE | `Intl.DateTimeFormat` instantiated per-render — hoist to module scope (pattern already used in `ArtifactListEntry.tsx:32-36`) | `AgentMessage.tsx:87-91`, `UserMessage.tsx:11-15` | bug-hunt L4 |
| C13 | NOT DONE | `maxLength` missing on RepositoryUrlForm input (no frontend defense-in-depth) | `RepositoryUrlForm.tsx:46-53` | bug-hunt L7 |
| C14 | NOT DONE | `MAX_DRAFT_SIZE` guard missing in `useDraftPersistence` | `useDraftPersistence` | NFR epic |
| C15 | NOT DONE | (= C4) `aria-live="polite"` test assertion | `ChatMessageList.test.tsx` | bug-hunt L2 |
| C16 | NOT DONE | (= C7) Loading-skeleton canonical header | `loading.tsx` | bug-hunt L3 |
| C17 | NOT DONE | (= B3/L6) `tabIndex`/`role="region"` on no-scrollbar panels | 3 panels (SideNavigation, ChatMessageList, artifacts page) | bug-hunt L6 |
| C18 | NOT DONE | `border-subtle` dead token in `tailwind.config.ts` (harmless cleanup) | `tailwind.config.ts:12` | bug-hunt pre-existing |

### Low — accepted deviations or coordinate-with-deferred

| # | Status | Issue | Location | Note |
|---|---|---|---|---|
| C19 | NOT DONE | SlashCommandPicker `role="presentation"` inside `role="listbox"` — soft ARIA violation (theoretical; screen readers honoring `presentation` won't see it). | `SlashCommandPicker.tsx:37` | bug-hunt L8. Fix: restructure so header is sibling of listbox, or document as accepted deviation. |
| C20 | NOT DONE | ArtifactViewer `a` component lacks focus ring — inconsistent with 5.3 AgentMessage fix. | `ArtifactViewer.tsx:91-92` | bug-hunt L5 (dismissed as pre-existing). Coordinate with deferred `target="_blank"` addition. |

---

## D. Process & standing concerns

Not Epic 5-introduced, but surfaced by the closeout. Don't block Epic 5 closure.

| # | Status | Issue | Stages | Note |
|---|---|---|---|---|
| D1 | NOT DONE | `epic-5` status in `sprint-status.yaml` is still `in-progress` — confirmed correct per user instruction. The retro sub-agent updated `epic-5-retrospective` to `done` but deliberately left `epic-5` unchanged. | retro, trace, NFR | No action needed — Epic 5 is confirmed not done. |
| D2 | NOT DONE | Standing NFR-P concerns (all pre-existing, no empirical validation): NFR-P1 (first token ≤1500ms), NFR-P2 (chat ready ≤10s), NFR-P3 (Project Map ≤2s), NFR-P4 (Artifact Browser ≤2s), NFR-P5 (manual commit ≤5s), NFR-R4 (10 concurrent SSE / HTTP/2). | NFR epic | No load testing / Lighthouse CI in place. Pre-launch concern, not Epic 5. |
| D3 | NOT DONE | E2E suite not executed during NFR audit session (no dev server + database available). | NFR epic | Recommended pre-release verification. |
| D4 | NOT DONE | ESLint `react-hooks/exhaustive-deps` is `warn`, not `error` — elevating it would have caught A3 (the auto-scroll regression) at build time. | retro action item | One-line config change; retro recommends doing it. |
| D5 | NOT DONE | SDK fidelity carry-forwards remain open: (1) open-concerns registry, (2) CI test-source classifier. | retro | Not Epic 5-attributable. |
| D6 | NOT DONE | `rule_count: 182` frontmatter in `project-context.md` is stale but harmless. | architect | Consider dropping or recounting in a separate pass. |

---

## Summary count

- **3 implementation gaps** in done stories (A1, A2, A3) — these are what keep Epic 5 from actually being done.
- **5 decisions** needing user input (B1-B5).
- **20 code/test fixes** (C1-C20): 5 P1, 4 P2, 9 P3-bundle, 2 low/coordinate.
- **6 process/standing concerns** (D1-D6), mostly pre-existing.

**Highest-leverage items:** A1 (doubly-confirmed by 4 stages, a literal AC gap with no test coverage) and A3 (the only behavior regression Epic 5 introduced, user-facing — a frozen conversation with no visible retry). Both are small fixes. B1 (the auto-scroll UX decision) is the one decision that blocks fixing A3.
