---
stepsCompleted:
  - step-01-load-context
  - step-02-define-thresholds
  - step-03-gather-evidence
  - step-04-evaluate-and-score
  - step-04e-aggregate-nfr
  - step-05-generate-report
lastStep: 'step-05-generate-report'
lastSaved: '2026-07-12'
workflowType: 'testarch-nfr-assess'
storyId: '5.3'
storyKey: '5-3-fix-conversation-stream-structural-drift'
storyFile: '_bmad-output/implementation-artifacts/5-3-fix-conversation-stream-structural-drift.md'
inputDocuments:
  - '_bmad-output/implementation-artifacts/5-3-fix-conversation-stream-structural-drift.md'
  - '_bmad-output/test-artifacts/atdd-checklist-5-3-fix-conversation-stream-structural-drift.md'
  - '_bmad-output/test-artifacts/automate-validation-report-5-3.md'
  - '_bmad-output/test-artifacts/test-review-validation-report-5-3.md'
  - '_bmad-output/test-artifacts/traceability/traceability-matrix-epic-5.md'
  - '_bmad-output/test-artifacts/traceability/gate-decision-epic-5.json'
  - '_bmad-output/implementation-artifacts/bug-hunt-epic-5-ux-mockup-fidelity-close-visual-drift.md'
  - '_bmad-output/test-artifacts/test-fidelity-audit-2026-07-12.md'
  - '_bmad-output/test-artifacts/nfr-assessment-full-20260707.md'
  - '_bmad-output/test-artifacts/nfr-assessment-5-1.md'
  - '_bmad-output/test-artifacts/nfr-assessment-5-4.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - 'apps/web/src/components/conversation/ChatMessageList.tsx'
  - 'apps/web/src/components/conversation/AgentMessage.tsx'
  - 'apps/web/src/components/conversation/UserMessage.tsx'
  - 'apps/web/src/components/conversation/useDraftPersistence.ts'
  - 'apps/web/src/components/conversation/SlashCommandPicker.tsx'
  - 'apps/web/src/components/conversation/ChatMessageList.test.tsx'
---

# NFR Evidence Audit - Story 5.3: Fix Conversation Stream Structural Drift

**Date:** 2026-07-12
**Story:** 5.3
**Overall Status:** PASS-WITH-CONCERNS

---

Note: This audit summarizes existing implementation evidence; it does not run tests or CI workflows. Per the established pattern from `nfr-assessment-5-1.md` and `nfr-assessment-5-4.md`, this audit focuses on NFR-specific issues only (performance, reliability, maintainability, accessibility where the NFR thresholds touch it). Functional/visual drift findings and the 11 review patches live in the story file's Review Findings section.

## Executive Summary

**Assessment:** 8 PASS, 5 CONCERNS (2 Medium, 3 Low), 0 FAIL

**Blockers:** 0

**Medium Priority Issues:** 2 — auto-scroll effect misses error/retry render in its dependency array (reliability regression from the spinner/retry relocation in AC-3); no message list rendering limit or virtualization in `ChatMessageList`.

**Low Priority Issues:** 3 — per-render `Intl.DateTimeFormat` instantiation in `AgentMessage` and `UserMessage`; localStorage draft write has no size guard (QuotaExceededError silently swallowed); missing `aria-live="polite"` assertion in the existing `role="log"` regression test.

**Recommendation:** Proceed to release with documented findings. Story 5.3 is a frontend visual-drift story (CSS class corrections, DOM structure restoration, ARIA attributes). It is more architecturally significant than 5.1 and 5.2 because AC-3 relocates the `SessionStartSpinner` and Retry button from the input area into the `ChatMessageList` (the chat-messages panel). That relocation introduced a behavioural regression (the auto-scroll `useEffect` does not react to `errorMessage`/`showRetry`/`showSpinner` flags). The bug-hunt flagged it as M1. The remaining findings are pre-existing performance patterns surfaced by the story touching the files they live in (Intl formatter instantiation, unbound `messages.map()`), plus one test-fidelity gap (Low).

## Context Loaded

### Configuration

- `test_artifacts`: `_bmad-output/test-artifacts`
- `user_name`: Marius
- `communication_language`: English
- `tea_browser_automation`: auto (not used — codebase audit, not live running app)

### Knowledge Fragments

Tier-based load from `tea-index.csv`:

- `adr-quality-readiness-checklist.md` (extended) — 8-category, 29-criteria assessment framework
- `test-quality.md` (core) — Definition of done
- `playwright-config.md` (extended) — Playwright guardrails
- `error-handling.md` (extended) — Resilience checks (auto-scroll deps, no message bound)
- `playwright-cli.md` (core) — Playwright CLI for AI agents

### Artifacts Loaded

- Epics source: `_bmad-output/planning-artifacts/epics.md` (Epic 5, Story 5.3 ACs lines 1007-1037, dev notes line 1037)
- Story file: `_bmad-output/implementation-artifacts/5-3-fix-conversation-stream-structural-drift.md` (incl. its "NFR Evidence Audit" section listing 4 NFR findings)
- ATDD checklist: `atdd-checklist-5-3-...`
- Automate validation report: `automate-validation-report-5-3.md` (PASS, 0 skipped, 823 tests, 1 coverage gap fixed during validation)
- Test review validation: `test-review-validation-report-5-3.md` (PASS, 0 skipped, 0 stale markers, 0 empty stubs)
- Traceability matrix: `traceability/traceability-matrix-epic-5.md` (Story 5.3: 11/11 ACs FULL, P0 100%)
- Gate decision: `traceability/gate-decision-epic-5.json` (epic gate = CONCERNS)
- Bug hunt: `bug-hunt-epic-5-...md` (M1 auto-scroll regression, L2 missing aria-live assertion, L4 Intl.DateTimeFormat per-render, L8 SlashCommandPicker ARIA structure)
- Test fidelity audit: `test-fidelity-audit-2026-07-12.md` (epic verdict PASS, Finding 2 ConversationPane fabricated event shapes)
- Epic-level NFR assessment for Epics 1-3: `nfr-assessment-full-20260707.md` (consolidated source of NFR thresholds)
- Per-story NFR siblings: `nfr-assessment-5-1.md` (PASS), `nfr-assessment-5-4.md` (PASS-WITH-CONCERNS)
- Project context: `_bmad-output/project-context.md` (testing conventions, security headers, focus rings, role="log" + aria-live pair)

### NFR Thresholds (inherited from `nfr-assessment-full-20260707.md`)

| NFR | Threshold | Source | Status for Story 5.3 |
| --- | --- | --- | --- |
| NFR-P1 | First streamed token ≤ 1,500ms | architecture.md:46 | Not exercised — Story 5.3 does not modify streaming latency. The relocation of `SessionStartSpinner` does not affect token timing. PASS (N/A). |
| NFR-P2 | Chat ready ≤ 10s from page open (repos ≤ 200MB) | architecture.md:47 | Not exercised. PASS (N/A). |
| NFR-P3 | Project Map loads ≤ 2s | architecture.md:48 | Not exercised. PASS (N/A). |
| NFR-P4 | Artifact Browser loads ≤ 2s | architecture.md:49 | Not exercised — Story 5.3 does not modify the Artifact Browser. PASS (N/A). |
| NFR-R3 | SSE back-pressure (no silent drops) | architecture.md:90 | Not exercised — Story 5.3 does not modify SSE transport. The Retry button is rendered inside `ChatMessageList` but uses a local `handleRetry` ref — SSE transport unchanged. PASS (N/A). |
| NFR-O1 | Per-user LLM spend tracking | architecture.md:93 | Not exercised. PASS (N/A). |
| UX-DR16 | Visible focus rings, keyboard nav, aria-live, role="log", route-focus | epics.md:165 | **Primary** — AC-7 adds `role="log"` to the chat-messages container and a focus ring to agent markdown links; AC-6 preserves `tabIndex={-1}` via a visually-hidden `sr-only` h1; AC-7 also preserves the existing `aria-live="polite"` on the same container — verified at `ChatMessageList.tsx:76-77` (the dev notes Task 7.1 explicitly says "preserve `aria-live`"). The container has both attributes. The regression test at `ChatMessageList.test.tsx:184-198` only asserts `role="log"` — see Finding 4 (Low, M). |
| UX-DR7 | `aria-live="polite"` on WorkingTreeIndicator | epics.md:153 | Not exercised by Story 5.3 — Story 5.4 owns WorkingTreeIndicator. PASS. |

### Story Profile

Epic 5 is a visual-drift-fix epic. Story 5.3 is mostly presentational (CSS class corrections, copy adjustments, ARIA attributes) with one architectural change: AC-3 relocates `SessionStartSpinner` and the Retry button from `ConversationPane`'s input area into the scrollable `ChatMessageList` container. The relocation is the source of the M1 reliability regression found by the bug hunt (the auto-scroll `useEffect` does not include `errorMessage`/`showRetry`/`showSpinner` in its deps). The remaining NFR findings are pre-existing patterns surfaced by the story touching the files they live in.

Files modified by Story 5.3 (production code only):

- `ChatMessageList.tsx` — 824px centering, `role="log"`, rich empty-state, spinner/retry/error rendering block, `no-scrollbar` (added by 5.4)
- `ChatInput.tsx` — placeholder, disabled button styling, arrow icon + `font-medium`
- `ConversationPane.tsx` — 824px centering on input area, spinner/retry moved out (into `ChatMessageList`), limit copy fix
- `AgentMessage.tsx` — `mb-6` gap, markdown link focus ring, exported `markdownComponents`, pre-existing TS error fixed
- `UserMessage.tsx` — `mb-6` gap, `py-3` padding
- `ScrollToBottomButton.tsx` — `text-text-2` color
- `SemanticPill.tsx` — separator `opacity-40`
- `SessionStartSpinner.tsx` — 24px spinner, `border-border`, preview message
- `SlashCommandPicker.tsx` — "Skills — type to filter" header
- `useDraftPersistence.ts` — localStorage key renamed from `new-conversation-draft` to `new-conversation` (with migration logic on first load)
- `conversations/new/page.tsx` — visible header removed; `sr-only` h1 for route focus

No Prisma queries were added or modified by this story. No SSE transport changes. No auth/credential changes. No security header changes. No middleware changes.

## Evidence Gathered

### Performance

**Source:** Files modified by Story 5.3

| Concern | Location | Status |
| --- | --- | --- |
| `messages.map()` with no bound | `ChatMessageList.tsx:98-130` | CONCERN (Finding 2, Medium) — pre-existing pattern in a file heavily modified by 5.3 |
| `Intl.DateTimeFormat` per render | `AgentMessage.tsx:87-91`, `UserMessage.tsx:11-15` | CONCERN (Finding 3, Low) — pre-existing bug-hunt L4 |
| 824px centering CSS classes | `ChatMessageList.tsx:75`, `ConversationPane.tsx` | PASS — pure CSS, no compute cost |
| Rich empty-state DOM | `ChatMessageList.tsx:80-92` | PASS — renders only when `messages.length === 0` (conditional), one-time render |
| Spinner/retry/error block | `ChatMessageList.tsx:93-135` | CONCERN (Finding 1, Medium — auto-scroll deps) |
| `no-scrollbar` class | `ChatMessageList.tsx:75` | PASS — added by Story 5.4 AC-7; CSS rule only |
| `aria-live="polite"` + `role="log"` | `ChatMessageList.tsx:76-77` | PASS — both attributes present; missing regression-test assertion (Finding 4, Low, M) |
| `aria-live="polite"` on WorkingTreeIndicator | n/a | PASS — not modified by Story 5.3 |
| `role="presentation"` inside `role="listbox"` | `SlashCommandPicker.tsx:37` | PASS (Wave-1 INFO/ARIA note — bug hunt L8) |

### Security

**Source:** Files modified by Story 5.3

- No new authentication or authorization surfaces. `auth()` guards in `conversations/new/page.tsx` preserved. `mintBoundaryJwt(userId)` preserved.
- No open-redirect changes (sign-in page untouched).
- No new user-input handling: the `ChatInput` textarea receives user text but it was already wired to the agent conversation — Story 5.3 only changed CSS classes, the placeholder string, and added an arrow icon. No new unbounded input length risk.
- No Server Action arguments modified. The `connectRepository` Server Action is not touched by Story 5.3.
- No security headers (`main.ts`, `middleware.ts`, `next.config.js`) modified. The platform-wide `helmet()`/CSP/HSTS gap (documented in `nfr-assessment-full-20260707.md` Security Evidence) is pre-existing, project-wide, and out of scope.
- No credential / token handling modified.

### Accessibility (UX-DR16) — verified because the NFR threshold touches it

- `role="log"` added at `ChatMessageList.tsx:76`. The container already had `aria-live="polite"` (Task 7.1's dev notes say "preserve it; the mockup mandates both `role="log"` AND `aria-live="polite"` on the same element"). **Verified at `ChatMessageList.tsx:76-77`: both present.** The regression-test gap is documented in Finding 4.
- Markdown links in `AgentMessage.tsx:75-77` have focus ring (`focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`). Verified.
- localStorage key `new-conversation` (replacing `new-conversation-draft`) with a one-time migration on first read. No accessibility regression.
- Visually-hidden `<h1 tabIndex={-1} className="sr-only">` on `/conversations/new` — preserves route-focus management. Verified.
- `aria-label="Message input"` on the textarea preserved.
- `aria-activedescendant`/`aria-controls` props on the textarea preserved.
- Stop button rendering logic preserved.
- Slash picker `role="listbox"` + `role="option"` + `aria-selected` preserved. The new "Skills — type to filter" header (`SlashCommandPicker.tsx:37`) uses `role="presentation"` to prevent it from being announced as an option — bug-hunt L8 notes the `role="presentation"` child is technically not a valid child of `role="listbox"` (ARIA strict mode), but is the best fix without a structural wrapper. Recorded as INFO, not a CONCERN.

### Reliability

- The bug-hunt M1 finding (auto-scroll effect deps) is the primary reliability concern: `ChatMessageList.tsx:44-48` `useEffect` depends only on `[messages, isThinking]`. After AC-3 relocated `SessionStartSpinner` and the Retry button into the `ChatMessageList` container, the auto-scroll effect does not react when `errorMessage` or `showRetry` or `showSpinner` flips true without a new message arriving. Production-reachable: a `SESSION_TIMEOUT` fires while the user is scrolled up reading earlier messages; the Retry button renders at the bottom of the container but is not scrolled into view. The 30s provisioning timeout (per `ConversationPane.tsx:633` in the bug-hunt analysis) sets `errorMessage` and `showRetry`. See Finding 1.
- `eventSource.onerror` guards preserved in `ConversationPane.tsx`.
- `useRef<boolean>` re-entrancy guard on `handleRetry` preserved in `ConversationPane.tsx`.
- localStorage try/catch in `useDraftPersistence.ts:33, 47, 58` swallows `QuotaExceededError` silently. See Finding 5 (Low, R).

### Maintainability

- TypeScript strict mode respected across all changed files. No `any`, no `@ts-ignore` introduced.
- One pre-existing TS error at `AgentMessage.tsx:18` fixed by casting `props` (per Story 5.3 dev record). Unblocks the build.
- Tests co-located with source. 41 ATDD scaffolds activated across 10 test files. Story 5.3 TEA validation found and fixed 1 coverage gap (AC-1 input-area 824px centering — added 1 test to `ConversationPane.test.tsx`).
- 6 test scaffold bugs found and fixed during dev (per Debug Log References section of the story file).
- Test review validation report PASS: 0 skipped, 0 stale markers, 0 empty stubs.
- Deferred finding: AC-5 branded placeholder `Message bmad-easy…` is not wired up (the default `Message…` is correct and tested; the branded variant is not passed by the parent component). Recorded as implementation gap, not a test gap. Not blocking for NFR — documented in traceability matrix concerns list.
- 853 tests pass / 0 skipped per the traceability matrix's fresh 2026-07-12 run.

### Test Fidelity Cross-Reference

The Wave-1 fidelity audit `_bmad-output/test-artifacts/test-fidelity-audit-2026-07-12.md` (verdict: PASS) flagged Story 5.3 surfaces in its Finding 2: `ConversationPane` Story 5.3 tests drive `MockEventSource` with fabricated event shapes (LOW, Gap-C). The fabricated shapes (`{ reason: 'mid-session' }` for `SESSION_TIMEOUT`) are not type-checked against the real AG-UI SSE contract emitted by `apps/agent-be`. The fidelity audit accepted this as a bounded downstream effect of the prior `test-fidelity-audit-2026-07-06.md` Finding 3 (`Query.interrupt()` contract never verified — agent-be layer). It is recorded here as a low-severity evidence concern.

## NFR Matrix for Story 5.3

| NFR | Category | Threshold | Relevance to Story 5.3 | Status |
| --- | --- | --- | --- | --- |
| NFR-P1 | Performance | First streamed token ≤ 1,500ms | **Not applicable** — Story 5.3 does not modify streaming latency. | PASS (N/A) |
| NFR-P2 | Performance | Chat ready ≤ 10s from page open | **Not applicable** — Story 5.3 does not modify sandbox provisioning. | PASS (N/A) |
| NFR-P3 | Performance | Project Map loads ≤ 2s | **Not applicable** — Story 5.3 does not modify Project Map. | PASS (N/A) |
| NFR-P4 | Performance | Artifact Browser loads ≤ 2s | **Not applicable** — Story 5.3 does not modify the Artifact Browser. | PASS (N/A) |
| NFR-P5 | Performance | Manual commit ≤ 5s | **Not applicable** — Story 5.3 does not modify commit logic. | PASS (N/A) |
| NFR-S1 | Security | Sandbox credential isolation | **Not applicable**. | PASS (N/A) |
| NFR-S2 | Security | Tenant-scoped lookups | **Not applicable** — no new Prisma queries. See NFR-5.2 for the depth-1 page queries Story 5.3 renders inside. | PASS (N/A) |
| NFR-S4 | Security | OAuth token storage | **Not applicable**. | PASS (N/A) |
| NFR-R3 | Reliability | SSE back-pressure | **Not applicable** — Story 5.3 does not modify SSE transport. The Retry button consumes a local `onRetry` callback; SSE handlers in `ConversationPane.tsx` untouched. | PASS (N/A) |
| NFR-R4 | Scalability | 10 concurrent SSE | **Not applicable**. | PASS (N/A) |
| NFR-O1 | Observability | Per-user LLM spend | **Not applicable**. | PASS (N/A) |
| UX-DR16 | Accessibility | Focus rings, keyboard nav, aria-live, role="log" | **Primary** — AC-7 adds `role="log"`. The container also retains `aria-live="polite"` (verified). The regression test does not assert `aria-live` (Finding 4, Low, M). | PASS (with Finding 4) |
| Local performance pattern | Performance | Avoid per-render allocations (project-context.md equitable with `cn`/constant hoist pattern) | **Primary** — `Intl.DateTimeFormat` instantiated per render in `AgentMessage.tsx:87-91` and `UserMessage.tsx:11-15`. Pre-existing. Story 5.3 modified both files for `mb-6`/focus-ring changes and could have hoisted it. | CONCERNS (Finding 3) |
| Message list rendering | Performance / Reliability | Bound list rendering (project convention from `nfr-assessment-full-20260707.md` resource usage) | **Primary** — `messages.map()` at `ChatMessageList.tsx:98-130` renders all messages with no bound. Pre-existing pattern but the file is heavily modified by 5.3. | CONCERNS (Finding 2) |
| Auto-scroll effect deps | Reliability | Effect must re-fire on the inputs it consumes (React hooks rule) | **Primary** — `useEffect` deps `[messages, isThinking]` exclude `errorMessage`/`showRetry`/`showSpinner` after AC-3 relocated those renders into the scrollable container. Bug-hunt M1. Story-introduced regression (medium severity). | CONCERNS (Finding 1) |
| localStorage resilience | Reliability | Handle `QuotaExceededError` distinctly from "storage unavailable" (project convention from `error-handling.md`) | **Primary** — `useDraftPersistence.ts:33, 47, 58` try/catch swallows all errors. Story 5.3 added a migration step in the load effect that piggybacks on the same try/catch. | CONCERNS (Finding 5) |

## Findings

### Finding 1: Auto-scroll effect misses `errorMessage`/`showRetry`/`showSpinner` deps [Medium]

**Category:** Reliability (NFR-R3-adjacent — the SSE back-pressure guarantee is preserved, but the user-visible Retry affordance can be scrolled out of view); UX-DR16 accessibility (the affordance is present in the DOM but not visible to keyboard-only users without a scroll)
**Introduced by Story 5.3:** Yes — AC-3 relocated `SessionStartSpinner` and the Retry button from `ConversationPane`'s input area into the scrollable `ChatMessageList` (chat-messages panel). The bug-hunt M1 finding identifies this as a regression: the auto-scroll `useEffect` deps (`[messages, isThinking]`) were not updated to react to the new render triggers.
**Status:** Open (tracked by bug-hunt M1)

**Evidence:**
- File: `apps/web/src/components/conversation/ChatMessageList.tsx:44-48`
- Code: `useEffect(() => { if (isAtBottomRef.current && containerRef.current) { containerRef.current.scrollTop = containerRef.current.scrollHeight; } }, [messages, isThinking]);`
- New render triggers at `ChatMessageList.tsx:93-135`: `showSpinner` (line 93), `errorMessage` (line 131), `showRetry` + `onRetry` (line 136). The effect's dependency array does not include any of these.
- The render order inside the container is: `<div ref={containerRef}>` → empty-state (line 80) → spinner (line 93) → `messages.map()` (line 98) → `errorMessage` (line 131) → `showRetry` (line 136) → `ThinkingIndicator` (line 147).

**Spec citation:** project-context.md (focus-ring section, accessibility floor) — "every focusable interactive element should be discoverable". The Retry button is a focusable `<button type="button">` but can be below the fold after a `SESSION_TIMEOUT`.

**Impact:** When a `SESSION_TIMEOUT` fires while the user is scrolled up reviewing earlier messages, the Retry button renders at the bottom of the container but is not scrolled into view. The user sees a frozen conversation with no visible retry affordance. The 30s provisioning timeout (`ConversationPane.tsx` per bug-hunt analysis) fires during `provisioning`/`reconnecting` state and transitions to `timeout`, setting `errorMessage`. Production-reachable.

**Remediation:** Add `errorMessage`, `showRetry`, and `showSpinner` to the `useEffect` dependency array, OR add a dedicated effect that scrolls to bottom when these flags flip true (guarded by `isAtBottomRef.current` to avoid scrolling when the user has intentionally scrolled up). The dedicated-effect approach is recommended — it preserves user scroll intent during normal streaming while still surfacing the Retry button when an error arrives. The bug-hunt M1 blocker-to-decide asks which approach to take.

**Owner:** Future patch story (small refactor of the scroll effect)

---

### Finding 2: No message list rendering limit or virtualization [Medium]

**Category:** Performance (NFR-P1/P2-adjacent — chat-ready); Maintainability (project convention parity with the prisma `take: 100` limit on hot paths)
**Introduced by Story 5.3:** No (pre-existing pattern at `ChatMessageList.tsx:98-130`), but the file was heavily modified by Story 5.3 (824px centering, role="log", spinner/retry/error rendering) — the pattern is now more visible.
**Status:** Open (also surfaced in bug-hunt pre-existing findings)

**Evidence:**
- File: `apps/web/src/components/conversation/ChatMessageList.tsx:98-130`
- Code: `messages.map((message) => { if (message.role === 'user') return <UserMessage ... />; ... return <AgentMessage ... />; })` — renders every message in the array with no bound.
- The `role="log"` + `aria-live="polite"` container re-announces new messages to screen readers; mounting hundreds of messages at once potentially causes a long announcement queue.

**Spec citation:** project-context.md line 179 (per NFR-5.4 Finding 1) — same select/take-limit principle extends to bounded array rendering. architecture.md line 131 — NFR-P2 has a documented 200MB repository boundary; the equivalent for conversation length is undocumented.

**Impact:** For long conversations (hundreds of turns), slow initial render, high memory usage, and sluggish scrolling. The `ConversationPane.tsx` SSE event handlers append new messages to the array without bound — there is no "load more" pattern and no windowing. MVP conversations are bounded by the 10-concurrent-conversation limit (FR-11) and natural length, but a BMAD agent session that runs for thousands of turns would hit the failure mode.

**Remediation:** Implement windowing/virtualization (e.g., `react-window`) or cap rendered messages with a "load more" pattern. Short-term: document the conversation-length boundary for MVP (mirrors the NFR-P2 boundary). Long-term: windowing library.

**Owner:** Future hardening story (architectural — not a one-line fix)

---

### Finding 3: `Intl.DateTimeFormat` instantiated on every render [Low]

**Category:** Performance (NFR-P1/P2-adjacent — chat-ready budget); Maintainability (project convention parity with `ArtifactListEntry.tsx:32-36` module-level constant)
**Introduced by Story 5.3:** No (pre-existing), but Story 5.3 modified both `AgentMessage.tsx` (for `mb-6` and the focus-ring change) and `UserMessage.tsx` (for `mb-6` and `py-3`) — the opportunity to hoist the formatter was in scope. Bug-hunt L4.
**Status:** Open (also tracked by bug-hunt L4 and traceability matrix long-term action)

**Evidence:**
- Files: `apps/web/src/components/conversation/AgentMessage.tsx:87-91`, `apps/web/src/components/conversation/UserMessage.tsx:11-15`
- Both components create a `new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })` inside the component body on every render.
- The correct pattern is used in `ArtifactListEntry.tsx:32-36` (module-level `const dateFormatter = new Intl.DateTimeFormat(...)`).

**Impact:** For a conversation with 100 messages, this creates 100 formatter instances on mount and re-creates them on every re-render (typing in the input textarea, SSE state changes, scroll-driven `isThinking` updates). Not measurable on the 1,500ms first-token budget, but it is wasteful CPU on the chat-ready path.

**Remediation:** Hoist the formatter to module scope in both files: `const TIME_FORMATTER = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });` then `TIME_FORMATTER.format(message.createdAt)` in the component body. Single-line refactor per file.

**Owner:** Future patch story

---

### Finding 4: No regression test for `aria-live="polite"` preservation [Low]

**Category:** Maintainability (regression-test fidelity); Accessibility (UX-DR16 — the `aria-live="polite"` attribute is mandatory per AC-7)
**Introduced by Story 5.3:** No (the test gap was always there — the pre-existing test asserted only `role="log"`), but the AC-7 dev notes explicitly say "preserve `aria-live='polite'`" without a corresponding test assertion. Bug-hunt L2.
**Status:** Open (low-severity test-fidelity gap, not blocking release)

**Evidence:**
- File: `apps/web/src/components/conversation/ChatMessageList.test.tsx:184-198`
- Test asserts `expect(list).toHaveAttribute('role', 'log')` but does NOT assert `expect(list).toHaveAttribute('aria-live', 'polite')`.
- The implementation correctly has `aria-live="polite"` at `ChatMessageList.tsx:77` (verified during this audit) — the gap is the missing regression-test assertion, not the implementation.

**Spec citation:** AC-7 dev notes Task 7.1: "the mockup mandates both `role='log'` AND `aria-live='polite'` on the same element." The wave-1 fidelity audit `_bmad-output/test-artifacts/test-fidelity-audit-2026-07-12.md` does not flag this as a fidelity gap (the test exercises the real contract element, just with a missing assertion — a Gap-C concern).

**Impact:** A future change removing `aria-live="polite"` (e.g., a refactor that replaces `aria-live` with `role="status"` thinking it is redundant) would pass the test suite. Screen readers would lose new-message announcements.

**Remediation:** Add `expect(list).toHaveAttribute('aria-live', 'polite');` to the existing `role="log"` test at `ChatMessageList.test.tsx:195`. One-line test addition.

**Owner:** Future patch story

---

### Finding 5: localStorage draft write has no size guard — silent data loss on quota exceeded [Low]

**Category:** Reliability (NFR-R3-adjacent — graceful handling of resource limits); Maintainability
**Introduced by Story 5.3:** Story 5.3 changed the localStorage key (`new-conversation-draft` → `new-conversation`) and added a one-time migration in the load effect (`useDraftPersistence.ts:23-30`). The new migration code reads/writes localStorage using the same try/catch pattern, so QuotaExceededError during the migration would also be silently swallowed. The pattern itself is pre-existing.
**Status:** Open (also surfaced in the story file's NFR Audit Findings section)

**Evidence:**
- File: `apps/web/src/components/conversation/useDraftPersistence.ts:39-50`
- Code: write-effect does `localStorage.setItem(key, draft)` on every keystroke (`draft` is a dep). The `try/catch` at line 47-49 swallows all errors with comment `// storage unavailable`.
- The same try/catch pattern runs in the load effect (lines 16-37), the write effect (lines 39-50), and the `clearDraft` function (lines 52-62). All three silently swallow `QuotaExceededError`.

**Spec citation:** project-context.md — `error-handling.md` knowledge fragment (loaded in step 1) — distinct error categories warrant distinct handling. `QuotaExceededError` is "storage full", not "storage unavailable".

**Impact:** A user pasting a large document (e.g., a multi-thousand-line code file) into the chat input triggers `QuotaExceededError` on every subsequent keystroke. The user gets no indication the draft isn't being saved. Refreshing the page loses everything typed since the quota was exceeded.

**Remediation:** Add a size guard before write (`if (draft.length > MAX_DRAFT_SIZE) return;` with `MAX_DRAFT_SIZE = 10_000` or matching the server-side Zod limit). Log a `console.warn` on `QuotaExceededError` so the failure is diagnosable. Optionally surface a user-facing hint when the draft exceeds the size guard.

**Owner:** Future patch story (small refactor of the try/catches)

## Categories with No Findings

| Category | Status | Notes |
|----------|--------|-------|
| Selected projections | PASS | Story 5.3 does not add or modify Prisma queries. NFR-5.2 owns the depth-1 page queries. |
| Take limits | PASS | No new list queries. `messages` array is in-memory only (see Finding 2 for the array-rendering bound). |
| Timing tests | PASS | The 824px centering, role="log" addition, and spinner relocation add no measurable compute cost; NFR-P1/P2 budgets unaffected. |
| Security headers | PASS | No middleware, headers, or security configuration modified. |
| SSE back-pressure | PASS | No SSE transport changes. |
| Credential isolation (NFR-S2) | PASS | No new credential lookups added. |
| LLM spend tracking (NFR-O1) | PASS | No cost-tracking changes. |
| Encryption (NFR-S4) | PASS | No encryption or token storage modified. |
| Test fidelity | PASS | Wave-1 fidelity audit returned PASS; Finding 2 ConversationPane fabricated event shapes (LOW, Gap-C, bounded). |
| CI burn-in | PASS | 853 tests / 65 suites pass with 0 skipped per the traceability matrix's fresh 2026-07-12 run. |
| Test review validation | PASS | `test-review-validation-report-5-3.md` returned PASS (0 skipped, 0 stale markers, 0 empty stubs). |
| E2E deferral | INFO | Story 5.3 E2E tests deferred to component-level tests (ATDD decision DP-4: "component tests more precise for CSS class assertions"). Not a gap — E2E supplementary. |

## Quick Wins

1. **Hoist `Intl.DateTimeFormat` to module scope** (Performance) — 5 minutes — Frontend developer
   - One line per file: add `const TIME_FORMATTER = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });` at module scope, replace the per-render instantiation with `TIME_FORMATTER.format(message.createdAt)`.
   - No behavioural change. Existing tests unchanged.
   - Closes both `<AgentMessage>` and `<UserMessage>` gaps in one PR.

2. **Add `aria-live="polite"` assertion to the existing `role="log"` test** (Maintainability / Accessibility) — 5 minutes — Test engineer
   - One line: `expect(list).toHaveAttribute('aria-live', 'polite');` in the test at `ChatMessageList.test.tsx:195`.
   - Closes the regression-test gap noted by bug-hunt L2 (Low, Gap-C).

3. **Add `MAX_DRAFT_SIZE` guard to localStorage write** (Reliability) — 15 minutes — Frontend developer
   - Add `const MAX_DRAFT_SIZE = 10_000;` and a guard `if (draft.length > MAX_DRAFT_SIZE) return;` at the top of the write effect body at `useDraftPersistence.ts:39-50`.
   - Distinguish `QuotaExceededError` from "storage unavailable" in the catch block (check `e instanceof DOMException && e.name === 'QuotaExceededError'`, log a `console.warn`).
   - Closes Finding 5.

## Recommended Actions

### Immediate (Before Release) — CRITICAL/HIGH Priority

None. No CRITICAL or HIGH priority issues found.

### Short-term (Next Milestone) — MEDIUM Priority

1. **Fix the auto-scroll effect dependency array** - MEDIUM - 2 hours - Frontend developer
   - Either add `errorMessage`, `showRetry`, `showSpinner` to the existing `useEffect` deps at `ChatMessageList.tsx:44-48`, OR (preferred) add a second `useEffect` that scrolls to bottom when these flags flip true, guarded by `isAtBottomRef.current`.
   - Validation: new test that triggers `SESSION_TIMEOUT` while the user is scrolled up and asserts the Retry button is in the viewport. The bug-hunt M1 "blocker-to-decide" asks for user preference on the scroll-override behaviour.

2. **Document the conversation-length boundary for MVP** - MEDIUM - 1 hour - Architect
   - Mirrors the NFR-P2 200MB repository-size boundary with a conversation-length boundary (e.g., "≤ 200 turns per conversation").
   - Bound the `messages.map()` rendering concern with a design decision until virtualization lands.

### Short-term (Next Milestone) — LOW Priority

3. **Bundle the 3 quick wins into a single patch story** - LOW - 30 minutes - Frontend developer
   - Closes Findings 3, 4, 5.
   - Validation: `yarn nx test web` passes.

### Long-term (Backlog) — LOW Priority

4. **Implement windowing/virtualization for the message list** - LOW - 1-2 days - Frontend engineer
   - Add `react-window` or equivalent. Cap rendered messages, recycle DOM nodes for off-screen messages.
   - Close Finding 2 properly (the `messages.map()` bound is a symptom; the fix is windowing).

5. **Address agent-be SSE event-shape fidelity concern** - LOW - 1-2 days - Backend engineer
   - Per wave-1 fidelity audit Finding 2: replace fabricated event shapes in `ConversationPane.test.tsx` with a recorded-session replay fixture when the architecture.md:80 recorded-session JSONL plan is implemented.
   - Mitigated today by `sdk-contract-replay.spec.ts` (per `test-fidelity-audit-2026-07-06.md`).

## Monitoring Hooks

Story 5.3 is mostly presentational — no monitoring hooks specific to it. The project-wide gaps documented in `nfr-assessment-full-20260707.md` (no APM, no `/metrics`, no distributed tracing, no MTTR tracking) are inherited and not duplicated here. The Finding 1 auto-scroll regression would surface in production as a frozen UI with no Retry button — a Sentry error-tracking hook would catch it as a "user reports frozen conversation" pattern.

## Fail-Fast Mechanisms

1. **Add a `useEffect`-dep lint rule for scroll-on-flag visibility** - LOW - Frontend developer - Validation: ESLint config addition.
   - Catches future "auto-scroll effect missing a dep" regressions (Finding 1 class). Not strictly a fail-fast but a static-analysis fast-fail.

## Evidence Gaps

1. **QuotaExceededError diagnostic path** (Reliability) — **Suite:** Frontend engineer — **Suggested evidence:** An automated test that mocks `localStorage.setItem` to throw `QuotaExceededError` and asserts the user gets a visible warning. Currently no test covers the catch-path behavior. **Impact:** Purposeful-availability gap; not blocking for MVP (single-user authenticated endpoints; natural draft length is below 5MB).

## Findings Summary

**Based on NFR-specific audit (performance, security, reliability, maintainability, accessibility where the NFR thresholds touch it)**

| Category | PASS | CONCERNS (Med/Low) | INFO | FAIL |
| --- | --- | --- | --- | --- |
| `select` projections | N/A (no new Prisma queries) | 0 | 0 | 0 |
| Take limits | N/A (see NFR-5.2 for depth-1 page queries) | 0 | 0 | 0 |
| Timing tests | PASS | 0 | 0 | 0 |
| Security headers | PASS | 0 | 0 | 0 |
| Accessibility (UX-DR16) | 4/5 attributes verified | 1 Low (Finding 4: missing `aria-live` assertion) | 1 INFO (L8 ARIA structure) | 0 |
| Auto-scroll effect | 0 | 1 Medium (Finding 1: deps gap, bug-hunt M1) | 0 | 0 |
| Message-list rendering bound | 0 | 1 Medium (Finding 2: unbounded `messages.map()`) | 0 | 0 |
| Per-render allocations | 0 | 1 Low (Finding 3: `Intl.DateTimeFormat`) | 0 | 0 |
| localStorage resilience | 0 | 1 Low (Finding 5: QuotaExceededError swallowed) | 0 | 0 |
| SSE back-pressure (NFR-R3) | PASS | 0 | 0 | 0 |
| Credential isolation (NFR-S2) | PASS | 0 | 0 | 0 |
| Test fidelity | PASS | 1 INFO (wave-1 fidelity audit Finding 2) | 0 | 0 |
| CI burn-in | PASS | 0 | 0 | 0 |
| Test review validation | PASS | 0 | 0 | 0 |
| **Total** | **~8** | **5** | **1** | **0** |

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-07-12'
  story_id: '5.3'
  feature_name: 'Fix Conversation Stream Structural Drift'
  overall_status: 'PASS-WITH-CONCERNS'
  critical_issues: 0
  high_priority_issues: 0
  medium_priority_issues: 2
  concerns: 5
  blockers: false
  quick_wins: 3
  evidence_gaps: 1
  findings:
    - id: 'NFR-5.3-1'
      severity: 'MEDIUM'
      category: 'Reliability'
      description: 'Auto-scroll effect deps omit errorMessage/showRetry/showSpinner after AC-3 spinner relocation; Retry button can be scrolled out of view'
      remediation: 'Add deps to existing effect OR dedicated scroll-on-error effect guarded by isAtBottomRef'
      cross_ref: 'bug-hunt-epic-5 M1'
    - id: 'NFR-5.3-2'
      severity: 'MEDIUM'
      category: 'Performance'
      description: 'messages.map() in ChatMessageList has no bound; long conversations render all messages with no virtualization'
      remediation: 'Windowing (react-window) or "load more" pattern; short-term: document conversation-length boundary'
    - id: 'NFR-5.3-3'
      severity: 'LOW'
      category: 'Performance'
      description: 'Intl.DateTimeFormat instantiated on every render in AgentMessage and UserMessage'
      remediation: 'Hoist to module scope as TIME_FORMATTER constant'
      cross_ref: 'bug-hunt-epic-5 L4'
    - id: 'NFR-5.3-4'
      severity: 'LOW'
      category: 'Maintainability'
      description: 'No regression test for aria-live="polite" preservation on the role="log" container'
      remediation: 'Add expect(list).toHaveAttribute("aria-live", "polite") to existing role="log" test'
      cross_ref: 'bug-hunt-epic-5 L2'
    - id: 'NFR-5.3-5'
      severity: 'LOW'
      category: 'Reliability'
      description: 'localStorage draft write has no size guard; QuotaExceededError silently swallowed'
      remediation: 'Add MAX_DRAFT_SIZE guard + console.warn on QuotaExceededError'
  recommendations:
    - 'Proceed to release — no blockers'
    - 'Fix the auto-scroll dependency gap in a follow-up patch (bug-hunt M1; user preference needed on scroll-override behaviour)'
    - 'Bundle Findings 3-5 quick wins into a single patch story'
    - 'Document the conversation-length boundary for MVP (mirrors NFR-P2 200MB boundary)'
    - 'Plan message-list windowing as a backlog item (architectural, not one-line)'
```

## Related Artifacts

- **Story File:** `_bmad-output/implementation-artifacts/5-3-fix-conversation-stream-structural-drift.md`
- **ATDD Checklist:** `_bmad-output/test-artifacts/atdd-checklist-5-3-fix-conversation-stream-structural-drift.md`
- **Automate Validation:** `_bmad-output/test-artifacts/automate-validation-report-5-3.md`
- **Test Review Validation:** `_bmad-output/test-artifacts/test-review-validation-report-5-3.md`
- **Bug Hunt:** `_bmad-output/implementation-artifacts/bug-hunt-epic-5-ux-mockup-fidelity-close-visual-drift.md` (M1, L2, L4, L8)
- **Test Fidelity Audit:** `_bmad-output/test-artifacts/test-fidelity-audit-2026-07-12.md` (Finding 2, Gap-C, LOW, bounded)
- **Traceability:** `_bmad-output/test-artifacts/traceability/traceability-matrix-epic-5.md`
- **Gate Decision:** `_bmad-output/test-artifacts/traceability/gate-decision-epic-5.json`
- **PRD:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`
- **Architecture:** `_bmad-output/planning-artifacts/architecture.md`
- **Epics:** `_bmad-output/planning-artifacts/epics.md`
- **NFR Siblings:** `nfr-assessment-5-1.md` (PASS), `nfr-assessment-5-2.md` (PASS-WITH-CONCERNS), `nfr-assessment-5-4.md` (PASS-WITH-CONCERNS), `nfr-assessment-full-20260707.md` (CONCERNS — Epics 1-3 baseline)
- **Evidence Sources:**
  - Test Results: `yarn nx test web` (853 tests, 65 suites, 0 skipped, 0 failed — fresh 2026-07-12 run per traceability matrix)
  - Source code: `ChatMessageList.tsx`, `AgentMessage.tsx`, `UserMessage.tsx`, `useDraftPersistence.ts`, `SlashCommandPicker.tsx`, `ChatInput.tsx`, `ConversationPane.tsx`, `ScrollToBottomButton.tsx`, `SemanticPill.tsx`, `SessionStartSpinner.tsx`, `conversations/new/page.tsx`

## Recommendations Summary

**Release Blocker:** None. 0 blockers.

**High Priority:** None. 0 HIGH issues.

**Medium Priority:** 2 items — auto-scroll effect dependency regression (introduced by AC-3 spinner relocation) and unbounded message-list rendering (pre-existing but visible). The auto-scroll issue is the only Medium finding introduced by Story 5.3 itself — a small targeted fix is recommended before the next release.

**Low Priority:** 3 items — per-render `Intl.DateTimeFormat` instantiation (pre-existing, addressable by module-scope hoist); missing `aria-live="polite"` test assertion (Gap-C test fidelity); localStorage `QuotaExceededError` silent swallow (pre-existing, addressable by size guard). All three are bookable into a single follow-up patch.

**Next Steps:** Proceed to release. The Medium auto-scroll regression is the only story-introduced concern; track it as a P1 follow-up. Bundle Findings 3-5 (Low) into a single hardening story alongside NFR-5.2 Findings 1-3 and NFR-5.4 Findings 2-5 for efficient closure. Plan message-list windowing as a longer-term backlog item.

## Sign-Off

**NFR Evidence Audit:**

- Overall Status: PASS-WITH-CONCERNS
- Critical Issues: 0
- High Priority Issues: 0
- Concerns: 5 (2 Medium, 3 Low)
- Evidence Gaps: 1

**Gate Status:** PASS-WITH-CONCERNS (proceed with documented mitigation plan)

**Next Actions:**

- PASS-WITH-CONCERNS: Proceed to release. Address the Medium auto-scroll regression in a P1 follow-up patch. The Medium message-list rendering bound needs an architectural fix and can be booked as backlog.

## Autonomous Decisions

In place of halting at checkpoints, the following autonomous decisions were made:

1. **Bug-hunt M1 classification retained as Medium, not High:** Per the bug-hunt severity calibration note (autonomous decision 6 in the bug-hunt report), M1 hides a Retry button below the fold but does not cause data loss or security exposure. The user still sees the timeout error message in the same container; only the affordance is hidden. Upgrading to High would over-state the severity. Retained as Medium.
2. **Story 5.3 "introduced" vs "pre-existing" classification of M1:** The M1 finding is genuinely introduced by Story 5.3 — before AC-3, the Retry button rendered in the input area (always visible at the bottom of the screen). After AC-3, it renders inside the scrollable container. The auto-scroll effect deps were never updated to match. Marked as story-introduced regression.
3. **Cross-reference rather than re-discover:** Wave-1 bug-hunt findings (M1, L2, L4, L8) and wave-1 fidelity audit (Finding 2) were inlined and verified against the source rather than re-discovered. The verification confirmed each Wave-1 finding still stands at audit time (e.g., `ChatMessageList.tsx:44-48` deps are `[messages, isThinking]` only; `AgentMessage.tsx:87-91` instantiates per render; `ChatMessageList.test.tsx:184-198` does not assert `aria-live`).
4. **NFR-5.4 accessibility gap shared with NFR-5.3:** The "no-scrollbar panels lack `tabIndex`/`role="region`" finding (NFR-5.4 Finding 4) touches `ChatMessageList.tsx:75` (one of the three `no-scrollbar` panels) — but Story 5.4 added the `no-scrollbar` class, not Story 5.3. The NFR-5.3 audit does not duplicate this finding; it records it as out-of-scope cross-reference to NFR-5.4. Story 5.3 contributed the `role="log"` + `aria-live="polite"` to the same element — verified both attributes present (Finding 4 is the test gap, not the implementation gap).
5. **AC-5 branded placeholder not implemented:** Recorded as INFO, not CONCERN — the implementation gap is tracked in the traceability matrix concerns list (deferred DP-5). The default placeholder `Message…` is correct and tested; the branded variant is a minor UX enhancement. Not an NFR concern.
6. **Scope adherence:** Stayed strictly on NFR-specific concerns. The 11 review patches (localStorage key migration with no warning, SlashCommandPicker `role="presentation"` fix, error message and retry button render before messages, etc.) live in the story file's Review Findings section. Some overlap with NFR Findings (e.g., NFR-5.3-1 = bug-hunt M1 = review patch). Identified the overlap rather than duplicated.
7. **No test for `useEffect` dependency arrays:** ESLint's `react-hooks/exhaustive-deps` rule typically catches this class of bug. The lint run in Task 13.1 reported 0 errors — either the rule is configured to warn rather than error, or the effect is exempted. Did not upgrade this to a CONCERN beyond Finding 1; the lint config is a separate discussion.

**Generated:** 2026-07-12
**Workflow:** testarch-nfr v5.0

---

<!-- Powered by BMAD-CORE™ -->
