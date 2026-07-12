# Test Fidelity Audit Report — Epic 5

**Date:** 2026-07-12
**Auditor:** Vera (Test Fidelity Auditor)
**Scope:** Epic 5 — UX Mockup Fidelity (Close Visual Drift), Stories 5.1–5.4
**Verdict:** PASS — fidelity confirmed with notes (0 blockers, 2 LOW Gap-C findings, 1 INFO coverage note)

## Scope

Epic 5 audit of test fidelity — whether tests exercise the real contract or a fabricated assumption. The "real contract" for this epic is the authoritative UX package (`ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md`, `EXPERIENCE.md`, and the 7 mockup HTML files), the Tailwind config (`apps/web/tailwind.config.ts`), `apps/web/src/app/global.css`, and the external SDK contracts the touched components consume (`react-markdown`'s `Components` type, Next.js Server Actions, the SSE `EventSource` API).

Audited test surfaces across 4 stories, 24 test files (~133 Epic-5-specific tests) plus the two E2E specs in `playwright/e2e/visual-containers/`:

- Story 5.1 — 31 co-located component tests across 5 files (sign-in, onboarding, settings, artifact viewer, chat input)
- Story 5.2 — 40 co-located component/page tests across 5 files (SideNavigation, Breadcrumb, 3 depth-1 page tests)
- Story 5.3 — 42 co-located component/hook/page tests across 10 files (ChatMessageList, ChatInput, ConversationPane, AgentMessage, UserMessage, ScrollToBottomButton, SemanticPill, SlashCommandPicker, useDraftPersistence, conversations/new page)
- Story 5.4 — 20 co-located unit tests across 10 files + 2 E2E specs (visual-containers story-5-1 and story-5-4)

Verified execution: `yarn nx test web` → 65 suites / 853 tests / 0 skipped / 0 failed (re-run during this audit confirms the green-test condition the reports cite).

## Verification Method

- Loaded the SKILL workflow (`audit-test-fidelity.md`) and mirrored the structure of the prior audit (`test-fidelity-audit-2026-07-06.md`).
- Read all 4 ATDD checklists, all 4 automate-validation reports, the 3 available test-review-validation reports, both E2E spec files in `playwright/e2e/visual-containers/`, and the 4 story spec files.
- Traced contract consumers outward from production source to tests (not the reverse), per the skill's prescribed approach.
- Re-ran the full web Jest suite to confirm the green-test condition.
- Cross-referenced the prior fidelity audit (Finding 2 — `as` cast, Finding 3 — `Query.interrupt()` mocked away) for any extension into Epic 5 surfaces.
- Confirmed the customization resolver returned no workflow overrides (empty `{}`).

## Contract Consumers Identified

| # | Code path | External contract | File:line |
|---|-----------|-------------------|-----------|
| C1 | `ArtifactViewer` — `components` prop passed to `<Markdown>` | `react-markdown` `Components` type (override functions for `h2`, `hr`, etc.) | `apps/web/src/components/artifact-browser/ArtifactViewer.tsx:30-104, 147` |
| C2 | `AgentMessage.markdownComponents.a` — override for markdown `<a>` (AC-7 focus ring) | `react-markdown` `Components` type | `apps/web/src/components/conversation/AgentMessage.tsx:24-84` |
| C3 | `RepositoryUrlForm` — consumes `connectRepository` Server Action result (`ConnectResult` union) | Next.js Server Action contract (`error`, `errorCode`, `documentationLink`, `success`) | `apps/web/src/components/onboarding/RepositoryUrlForm.tsx:22-36` |
| C4 | `ConversationPane` — consumes SSE `EventSource` events (`SESSION_READY`, `SESSION_TIMEOUT`, `SESSION_DRAINING`…) | AG-UI / SSE event stream from agent-be | `apps/web/src/components/conversation/ConversationPane.tsx` (state machine around `MockEventSource`) |
| C5 | `tailwind.config.ts` — `theme.extend.boxShadow`, full `theme.fontWeight`, full `theme.colors/borderRadius/fontFamily` overrides | DESIGN.md token values (e.g. `0 8px 24px rgba(0,0,0,0.4)` for `boxShadow.floating`) | `apps/web/tailwind.config.ts` |
| C6 | `global.css` — `.no-scrollbar` rule + `::-webkit-scrollbar` selector | CSS rule presence for AC-7 scrollbar hiding | `apps/web/src/app/global.css` |
| C7 | Browser computed style for elements styled by Tailwind utilities | The Tailwind class → computed-CSS resolution chain (config → utility → CSS → computed style) | `playwright/e2e/visual-containers/story-5-4-token-usage-drift.spec.ts:71-115, 147-183` |

## Findings

### Finding 1 — Gap C: `RepositoryUrlForm` mocks `connectRepository` with hand-rolled shapes not type-checked against `ConnectResult` (LOW)

**Code path:** C3 — `apps/web/src/components/onboarding/RepositoryUrlForm.tsx:22-36`. The form calls `connectRepository(url)` and branches on `'success' in result` then reads `result.error`, `result.documentationLink`. The `.catch(...)` path (line 32-36) sets a generic "An unexpected error occurred" fallback.

**Real contract:** `ConnectResult = Awaited<ReturnType<typeof connectRepository>>` — a discriminated union of `{ success: true }` and per-error-code error shapes (`INVALID_URL`, `NOT_FOUND`, `ORG_RESTRICTION`, `INSUFFICIENT_PERMISSION`, `RATE_LIMITED`, `MISSING_DIRECTORY`, `UNSUPPORTED_VERSION`, `NO_SKILLS_FOUND`, `UNKNOWN`, `NO_CREDENTIAL`). Some include `documentationLink`, most don't.

**The gap:** `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx:20-22` mocks the module with `connectRepository: jest.fn()` — a bare `jest.fn()` typed only as `(...args: unknown[]) => any`. The hand-rolled return shapes (`:307, :354-356, :370-372, :387-389`) are not checked against `ConnectResult` at compile time. If the real action's shape drifts (e.g. renames `documentationLink`, omits it for a new error code, returns a different union member), the form's branching logic would diverge silently while the test passes green against the fabricated shape.

**Mitigating:** `apps/web/src/actions/repo-connection.actions.spec.ts` (646 lines) exercises the real action end-to-end — including the `MISSING_DIRECTORY` + `documentationLink` success-shape assertion at `:560-576`. The Server Action contract is itself well-covered; only the consumer-side mock's shape assumption is unverified.

**What this hides:** A drift between the Action's return shape and the form's parsing logic, with the form's `.catch()` fallback path entirely unexercised by Story 5.1 AC-3 tests. If `connectRepository` ever rejects in production (network timeout, RSC transport error), the form would show "An unexpected error occurred" with no test verifying that path renders correctly.

**Evidence:** `RepositoryUrlForm.test.tsx:20-22, 307, 354-356, 370-372, 387-389`; `repo-connection.actions.spec.ts:560-576`; `RepositoryUrlForm.tsx:22-36, 32-36`.

**Severity:** LOW — Gap C (mock at correct boundary, success-only shape, mitigated by action-side coverage).

---

### Finding 2 — Gap C: `ConversationPane` Story 5.3 tests drive `MockEventSource` with fabricated event shapes (LOW)

**Code path:** C4 — `apps/web/src/components/conversation/ConversationPane.test.tsx:56-96` (MockEventSource class) drives AC-3 (SessionStartSpinner placement, `:2260-2276`) and AC-11 (Retry button color, `:2353-2374`).

**Real contract:** The agent-be emits AG-UI/JSONL events over SSE that `ConversationPane` parses into a session-state machine. The event types (`SESSION_READY`, `SESSION_TIMEOUT`, `SESSION_DRAINING`) and the data shape (`{ reason: 'mid-session' }`, `{ sandboxId }`) are fabricated in the test rather than recorded from a real session.

**The gap:** The mock emits `JSON.stringify({ reason: 'mid-session' })` (MockEventSource.emit at `:84-90`, :2360-2364) — a hand-rolled shape that resembles what the real backend sends. The tests assert on the UI reaction (spinner placement, Retry button className) rather than on event parsing, so the gap is bounded. But if the real backend never emits `SESSION_TIMEOUT` with `reason: 'mid-session'` (e.g. it sends `reason: 'idle'` or omits the field), the UI reaction under test would never actually exercise this branch in production.

**Mitigating:** The prior fidelity audit (Finding 3, `Query.interrupt()`, `test-fidelity-audit-2026-07-06.md`) already blocks on the agent-be SSE contract gap. Story 5.3's Gap-C concern is bounded to UI reaction under fabricated events; the deeper event-interpretation gap is owned at the agent-be layer.

**What this hides:** A mismatch between the assumed event shape and the real AG-UI event stream — UI state machine code paths would pass green against fabricated events while production may never reach those states. Bounded because Story 5.3 only asserts on derived UI state, not event-parsing correctness.

**Evidence:** `ConversationPane.test.tsx:56-96, 2260-2276, 2353-2374`; cross-reference `test-fidelity-audit-2026-07-06.md` Finding 3.

**Severity:** LOW — Gap C (bounded scope, downstream of prior blocker).

---

### Finding 3 — INFO: Story 5.4 E2E tests for AC-1 (ArtifactCard hover) and AC-5 (ArtifactListEntry hover/date) removed; only className-level unit tests remain (INFO)

**Code path:** `apps/web/src/components/project-map/ArtifactCard.tsx` (hover border token), `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` (hover bg + date color token).

**What happened:** `test-review-validation-report-5-4.md:42, 49-52` removed the skipped E2E blocks (`test.describe.skip('AC-1: ArtifactCard hover border')`, `test.describe.skip('AC-5…')`) and the Story 5.1 AC-5 E2E block (`:52`) because the `withArtifacts` Playwright fixture is broken (unique-constraint violations on `[repoConnectionId, path]`), with no planned fix. The behavioral coverage was deferred to co-located unit tests.

**What remains:** `apps/web/src/components/project-map/ArtifactCard.test.tsx:147` asserts `hover:border-accent` is present and `hover:border-text-3` is absent on the rendered className. `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx:109-123` asserts `hover:bg-surface-raised` (no `/60`) and `text-text-3`. Both render the real component and assert on real className strings — these are not fabricated-contract tests.

**The gap:** A className-only unit test cannot verify that the hover token actually resolves to the correct computed color when the component is composed into the Project Map page with real artifact data. The Story 5.4 E2E suite does cover the equivalent computed-style verification for AC-2 (onboarding input), AC-3 (focus ring), AC-6 (side nav border), and AC-7 (scrollbar) — proving the Tailwind class → computed-`backgroundColor`/`borderColor` resolution chain works in a real browser for those cases. The hover-only cases (AC-1, AC-5) lack that end-to-end verification.

**What this hides:** An integration defect in the Project Map → ArtifactCard composition (e.g. hovered class never applied because a parent overrides hover context, or the artifact-fetch pipeline never produces the data shape ArtifactCard expects under load). Not a contract fidelity gap per se.

**Evidence:** `test-review-validation-report-5-4.md:42, 49-52`; `ArtifactCard.test.tsx:147`; `ArtifactListEntry.test.tsx:109-123`; `story-5-4-token-usage-drift.spec.ts:14-17, 22-23` (header comment documenting the deferral).

**Severity:** INFO — coverage decision, not a fabricated contract.

---

## Out of Scope (Verified Clean)

**C1 — `ArtifactViewer.components` prop (react-markdown `Components` type):** `apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx:204-231` extracts the `components` object passed to the mocked `Markdown` and invokes `H2({ node: null, children: 'Heading' })` / `Hr({ node: null })` directly — then asserts on the rendered output's className. The mock is at the correct boundary (react-markdown is an external SDK); the override functions themselves run with real props. This is the technique the skill's Gap-A rationale prescribes — exercise the contract-consuming code, not the consumer of the SDK.

**C2 — `AgentMessage.markdownComponents` (Story 5.3 AC-7 focus ring):** `apps/web/src/components/conversation/AgentMessage.test.tsx:75-84` imports `markdownComponents` directly from the source and renders `<markdownComponents.a href="https://example.com">example</markdownComponents.a>`. The real override function runs; the focus-ring className (`focus:ring-2 focus:ring-accent focus:outline-none`) is asserted on a real `<a>` element. Clean.

**C3 — Server Action contract (mitigated):** See Finding 1 for the LOW Gap-C note; the action side (`repo-connection.actions.spec.ts`) is high-coverage and verifies the real contract shape.

**C5 — Tailwind config structure (`tailwind-theme.spec.ts`):** `apps/web/src/__tests__/tailwind-theme.spec.ts:10-218` imports the real `tailwind.config.ts` and asserts on object structure directly (`theme.colors.bg === '#0D0D11'`, `extend.fontWeight === undefined`, `extend.boxShadow.floating === '0 8px 24px rgba(0,0,0,0.4)'`, etc.). No mocks, no fabrication. Clean.

**C6 — `global.css` content (`global-css.spec.ts`):** `apps/web/src/app/global-css.spec.ts:15-29` reads the real CSS file via `readFileSync` and asserts on substring content. Structural test, real source. Clean.

**C7 — Browser computed styles (`story-5-4-token-usage-drift.spec.ts`):** `playwright/e2e/visual-containers/story-5-4-token-usage-drift.spec.ts:71-115, 147-183` drives a real Chrome page (`/onboarding`, `/project-map`), applies `getComputedStyle()`, and asserts on resolved RGB values (e.g. `13, 13, 17` for `bg-bg`, `30, 30, 38` for `border-surface-raised`, `123` for accent border) and CSS properties (`scrollbar-width: none`, `overflow-y: auto`). This goes beyond className presence and verifies the full Tailwind config → utility → CSS → computed-resolution chain end-to-end. Highest fidelity in the Epic 5 suite.

**Server Component page tests (Story 5.1 AC-4, Story 5.2 AC-7/AC-8, Story 5.3 AC-6):** `apps/web/src/app/(dashboard)/(app)/settings/page.test.tsx`, `conversations/[conversationId]/page.test.tsx`, `artifacts/page.test.tsx`, `conversations/new/page.test.tsx` all use the canonical `@jest-environment node` + `renderToStaticMarkup` pattern with child components (Breadcrumb, ConversationPane) mocked as render stubs at the correct boundary. The page's own JSX (icon box, header, empty-state, h1 with `tabindex="-1"`) is asserted on real static HTML. Clean.

**useDraftPersistence hook (Story 5.3 AC-7):** `apps/web/src/components/conversation/useDraftPersistence.test.ts` renders the real hook via `renderHook` and spies `Storage.prototype.getItem`/`setItem`/`removeItem` at the prototype boundary. The `new-conversation` key assertion (`:101, 112, 126-127, 143-144`) verifies real hook behavior — both positive (`toHaveBeenCalledWith('new-conversation')`) and negative (`not.toHaveBeenCalledWith('new-conversation-draft')`). Clean.

## Cross-References

1. **`test-fidelity-audit-2026-07-06.md` Finding 2 — `as SDKMessage` type-assertion bypass.** Earlier finding blocked on the agent-be's `makeSdkMessage(partial: Partial<SDKMessage>): SDKMessage { return partial as SDKMessage; }` pattern that silences the compiler. Epic 5 surfaces do not repeat this pattern — the form-test mock `jest.fn()` is untyped, not type-cast, so the compiler would catch a mismatch if any test file imported the real `ConnectResult` type for the mock's return value. Worth tightening (see recommendation 1) but not a structural repeat of the prior finding.

2. **`test-fidelity-audit-2026-07-06.md` Finding 3 — `Query.interrupt()` contract never verified.** Finding 2 above extends this same blind-spot class to the conversation-pane SSE consumers — fabricated event shapes versus the real AG-UI contract. The blocker remains at the agent-be SSE-boundary layer; Epic 5's UI reaction tests are downstream consumers and are low-severity.

3. **`epics.md:117-118` — recorded BMAD session replay prescription.** Applies specifically to the `sandbox-agent` (JSONL→AG-UI bridge) and AG-UI packages, not to the Epic 5 UX surfaces. Not a fidelity gap for Epic 5; recorded in the cross-reference for completeness.

4. **`epics.md:929-1098` — Epic 5 design principle: "The mockups are authoritative; the code aligns to them."** Epic 5's contract is the mockup HTML + DESIGN.md. The Story 5.x tests faithfully trace ACs back to mockup HTML line references in the story specs and assert on the specific Tailwind tokens (`bg-surface-raised`, `border-surface-raised`, `text-accent-fg`, etc.) that the mockups prescribe. The contract assumption — "the right class string in source will produce the right visual in production" — is verified end-to-end by the Story 5.4 computed-style E2E for 4 of the 11 ACs (AC-2, AC-3, AC-6, AC-7).

## Contract-Test Strategy Recommendations

### Recommendation 1 — Type-checked mock factory for `connectRepository` (closes Finding 1)

Replace `jest.mock('@/actions/repo-connection.actions', () => ({ connectRepository: jest.fn() }))` (`RepositoryUrlForm.test.tsx:20-22`) with a typed mock factory that takes a `ConnectResult` member:

```ts
import type { ConnectResult } from '@/actions/repo-connection.actions'; // or export from the action module
function mockConnectRepository(result: ConnectResult) {
  (connectRepository as jest.Mock).mockResolvedValue(result);
}
```

And add one `.catch()`-path test:

```ts
it('shows generic fallback when connectRepository rejects', async () => {
  (connectRepository as jest.Mock).mockRejectedValue(new Error('network'));
  render(<RepositoryUrlForm />);
  // ... submit
  await waitFor(() => expect(screen.getByText(/unexpected error occurred/i)).toBeInTheDocument());
});
```

Closes both the shape-drift gap (compile-time) and the `.catch()`-path coverage gap.

### Recommendation 2 — Bound Finding 2 to the agent-be SSE contract owner

Finding 2's risk is bounded to UI reaction under fabricated events; the deeper event-interpretation gap is already blocked on `test-fidelity-audit-2026-07-06.md` Finding 3 (the `Query.interrupt()` mock in `agent.service.unit.spec.ts`). Until the recorded-session replay fixture lands (per `architecture.md:80` / `docs/sdk-contract-testing-gap.md`), ConversationPane's fabricated-event tests are acceptable. When the JSONL replay fixture exists, port the Story 5.3 AC-3 and AC-11 tests to drive the real `MockEventSource` from a recorded fixture rather than from hand-rolled `emit(type, data)` calls.

### Recommendation 3 — Restore `withArtifacts` E2E fixture (closes Finding 3)

The `withArtifacts` Playwright fixture is broken on unique-constraint violations (`test-review-validation-report-5-4.md:42`). Track as a deferred-work item; when fixed, restore the removed E2E blocks for Story 5.4 AC-1 (ArtifactCard hover border → computed `borderColor`) and AC-5 (ArtifactListEntry hover → computed `backgroundColor`). Until then, Story 5.4 AC-2/3/6/7 computed-style E2E coverage is sufficient evidence that the Tailwind → computed-style chain works; the hover-only className unit tests are a reasonable holding pattern.

## Verdict

**FIDELITY CONFIRMED with notes.** 2 LOW Gap-C findings (both bounded, neither fabricated), 1 INFO coverage note. No blockers, no Gap-A (untested contract consumer), no Gap-B (hand-rolled shape that diverges from the real type).

The Epic 5 test suite passes 853/853 green across 65 suites — re-verified during this audit. The tests exercise the real production components (real `ArtifactViewer`, real `AgentMessage.markdownComponents`, real `RepositoryUrlForm`, real `ConversationPane`, real `SettingsPage`/`ConversationPage`/`ArtifactsPage`, real `useDraftPersistence` hook, real `tailwind.config.ts`, real `global.css`) against the real contract (DESIGN.md tokens, mockup HTML structure, Tailwind config, real DOM rendered output, real computed browser styles for the E2E subset). The mocks are placed at correct boundaries — `react-markdown` SDK, Next.js Server Actions, SSE `EventSource` — and several tests go further by extracting the `components`/`markdownComponents` objects and rendering override functions directly with real props (C1, C2 verified clean).

The two LOW findings are downstream effects of the prior fidelity audit's blocker on the agent-be SSE contract, plus a single consumer-side mock that isn't type-checked. Neither causes Epic 5's AC coverage to be fabricated — every AC maps to at least one test that runs real production code and asserts on real output.

## Gate Decision

**PASS.** No blockers. Proceed to Epic 5 sign-off. Track the 3 recommendations as low-priority follow-ups; Recommendation 1 (type-checked `connectRepository` mock + one `.catch()` test) is the highest-value tightening and applies to the form test consumer — not a story-blocking change.
