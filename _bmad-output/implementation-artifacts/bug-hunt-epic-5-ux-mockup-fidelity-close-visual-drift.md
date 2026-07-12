# Bug Hunt Report: Epic 5 — UX Mockup Fidelity — Close Visual Drift

**Date:** 2026-07-12
**Target files:** 30 files across `apps/web/src/components/conversation/`, `apps/web/src/components/shell/`, `apps/web/src/components/artifact-browser/`, `apps/web/src/components/onboarding/`, `apps/web/src/components/project-map/`, `apps/web/src/app/(dashboard)/(app)/**/page.tsx`, `apps/web/src/app/(dashboard)/(app)/**/loading.tsx`, `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/app/global.css`, `apps/web/tailwind.config.ts`, plus 20 co-located test files
**Has diff:** false

## Summary

- **Total findings:** 11
- **Critical:** 0
- **High:** 0
- **Medium:** 3
- **Low:** 8

### Layer results:
- **TFA (Test Fidelity Audit):** 2 findings — verdict: false-confidence-found
- **ECH (Edge Case Hunter):** 4 unhandled paths
- **CR (Code Review):** 5 findings (2 dismissed)

### Profile note:
Epic 5 is a visual-drift-fix epic — CSS class corrections, structural container additions, token-usage fixes, and Tailwind config guardrails. The work touches presentational layers almost exclusively; no SSE handlers, no Prisma queries, no sandbox lifecycles, and no security-sensitive code paths were added by these stories. The finding profile reflects this: zero critical/high findings (no production-reachable data-loss or security regressions introduced), with medium findings concentrated in two areas — a behavioral regression from the spinner/retry relocation (Story 5.3) and an incomplete scrollbar-hiding migration (Story 5.4). The low findings are test-fidelity gaps and NFR carry-overs from the per-story reviews.

Three layers ran sequentially (TFA → ECH → CR) in subagent-fallback mode (single-session inline execution). Cross-cutting verification: the `tailwind-merge` `cn()` helper was observed converting `px-3` → `px-2` when an active-state class appends `mx-2 px-2` — the padding conflict is resolved correctly by tailwind-merge, so the AC-4 inset-pill tests that assert `px-2` are exercising real behavior, not false-green assumptions.

---

## Findings

### Medium

#### [M1] Auto-scroll effect does not fire when error message or retry button appears — regression from Story 5.3 spinner/retry relocation
- **Sources:** ech+cr
- **Location:** `apps/web/src/components/conversation/ChatMessageList.tsx:44-48` (auto-scroll deps), `:131-146` (error/retry render)
- **Detail:** Story 5.3 AC-3 moved the `SessionStartSpinner` and Retry button from `ConversationPane`'s input area into `ChatMessageList` (the chat-messages panel). Before 5.3, the Retry button rendered in the input area, which is always visible at the bottom of the screen. After 5.3, the Retry button and error message render at the bottom of the message list, inside the scrollable `role="log"` container. The auto-scroll `useEffect` (line 44-48) depends on `[messages, isThinking]` only — it does NOT include `errorMessage` or `showRetry`. When an error or retry button appears (without a new message arriving), the scroll effect does not fire, so the new content renders below the current scroll position. If the user is scrolled up (e.g., reviewing earlier messages when a `SESSION_TIMEOUT` fires), the Retry button and error message are below the fold and invisible. The user sees a frozen conversation with no visible retry affordance.

  Additionally, the `errorMessage` and Retry button render AFTER `messages.map()` (lines 131-146) — they are at the very bottom of the container. Even when the user IS at the bottom, the container's scroll height grows (new content appended) without a corresponding scroll adjustment, so the error/retry can still be one viewport高度的 below the visible area until the user scrolls.

  **Production-reachable:** `SESSION_TIMEOUT` during a long conversation (user scrolled up reading earlier messages) hides the Retry button. The 30s provisioning timeout (ConversationPane line 633) fires during `provisioning`/`reconnecting` state, transitioning to `timeout` and setting `errorMessage`. The error and retry button render in ChatMessageList but are not scrolled into view.
- **Original classifications:** ECH: unhandled path (scroll-on-error gap); CR: patch
- **Remediation:** Add `errorMessage`, `showRetry`, and `showSpinner` to the auto-scroll effect's dependency array, OR add a dedicated effect that scrolls to bottom when these flags flip true. Guard with `isAtBottomRef.current` to avoid scrolling when the user has intentionally scrolled up.

#### [M2] `no-scrollbar` class missing on full-width artifact list pane — Story 5.4 AC-7 incomplete
- **Sources:** cr
- **Location:** `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:123`
- **Detail:** Story 5.4 AC-7 added the `no-scrollbar` utility class to three scrollable panels. The two-pane artifact layout (line 93, when an artifact is selected) received `no-scrollbar` correctly. The full-width list layout (line 123, when NO artifact is selected) has `overflow-y-auto` but was missed — it lacks `no-scrollbar`. AC-7 says "scrollable panels on the 3 affected surfaces (shell, conversation, artifact-browser)" — the full-width list pane is a scrollable panel on the artifact-browser surface. The test suite (`page.test.tsx`) does not cover the full-width layout's scrollbar hiding because the existing test passes `{ id: 'art_1' }` (two-pane mode); no test case renders the page without an `id` searchParam.

  **Production-reachable:** Any visit to `/artifacts` without an `?id=` query param renders the full-width list with a visible scrollbar, while `/artifacts?id=...` hides it. Inconsistent within the same surface.
- **Original classifications:** CR: patch; also flagged by NFR-5.4 audit (Medium)
- **Remediation:** Add `no-scrollbar` to the full-width list pane at line 123. Add a test case to `page.test.tsx` that renders the page without an `id` searchParam and asserts `no-scrollbar` on the full-width pane.

#### [M3] `parseFrontmatter` renders quoted YAML values with surrounding quote characters
- **Sources:** ech
- **Location:** `apps/web/src/components/artifact-browser/ArtifactViewer.tsx:14-26`
- **Detail:** The `parseFrontmatter` function (added by Story 5.1 AC-5) extracts frontmatter fields using a simple regex parser: `/^(\w+):\s*(.*)$/` per line. The regex captures the value AFTER the colon verbatim — including surrounding YAML quotes. For a frontmatter field like `title: "PRD: Onboarding Flow"`, the regex captures `"PRD: Onboarding Flow"` (with the double-quote characters). The frontmatter metadata badge then renders this value including the quotes. Verified by test: a content string with `title: "PRD: Onboarding Flow"` produces a badge whose `textContent` includes `"PRD: Onboarding Flow"` (with literal quotes).

  The function also does not handle YAML multiline values (block scalars `|` or `>`), nested mappings, or folded strings — only the first line of each value is captured. For BMAD artifacts that typically use simple unquoted values (`title: My PRD`), this is not an issue, but titles containing colons or special characters commonly require quoting in YAML.

  The intentional decision (DP-5 in Story 5.1) was to use simple string parsing without a YAML parser dependency. The deferred `stripFrontmatter` regex finding (Story 2.5) uses the same regex. Both should be hardened together.
- **Original classifications:** ECH: unhandled path (quoted/multiline YAML values)
- **Remediation:** In a dedicated hardening story, strip surrounding quotes (`"` or `'`) from captured values after the regex match: `value.replace(/^["']|["']$/g, '')`. For full YAML correctness (multiline, nested), a real YAML parser would be needed — but that is explicitly deferred per DP-5. Coordinate with the deferred `stripFrontmatter` regex hardening.

### Low

#### [L1] False-green test: ChatInput AC-4 disabled-state tests cannot distinguish `disabled:` variant from unconditional application
- **Sources:** tfa
- **Location:** `apps/web/src/components/conversation/ChatInput.test.tsx:224-241`
- **Detail:** The AC-4 tests assert `sendButton.className.toContain('bg-text-3')`, `toContain('text-text-2')`, `toContain('border')`, and `toContain('border-border')`. The implementation uses `disabled:bg-text-3 disabled:text-text-2 disabled:border disabled:border-border` (line 92). The substring `bg-text-3` is present inside `disabled:bg-text-3`, so the test passes. But the test cannot distinguish between `disabled:bg-text-3` (correct — scoped to the disabled state via the `disabled:` variant) and `bg-text-3` (always applied — a regression where the muted tokens are used even for the enabled button). If someone removes the `disabled:` prefix, the button would always show muted styling, but the tests would still pass. Gap C (contract-behavior blind spot): the mock/test verifies the token is present but not that it is correctly scoped to the disabled variant.

  The test also renders `<ChatInput value="" ... />`, which makes the Send button disabled (because `!value.trim()` is true). The test does not assert the button is disabled in this scenario, nor does it render an enabled button to verify the muted tokens are ABSENT when enabled.
- **Original classifications:** TFA: Gap C false-green test
- **Remediation:** Add a positive assertion that the enabled Send button does NOT contain `bg-text-3` (e.g., render `<ChatInput value="hello" ... />` where the button is enabled, assert `not.toContain('bg-text-3')`). Optionally assert the `disabled:` prefix is present: `expect(sendButton.className).toContain('disabled:bg-text-3')`.

#### [L2] Missing assertion: ChatMessageList AC-7 test asserts `role="log"` but not `aria-live="polite"` preservation
- **Sources:** tfa
- **Location:** `apps/web/src/components/conversation/ChatMessageList.test.tsx:184-198`
- **Detail:** AC-7 (Story 5.3) states: "The chat-messages container has `role="log"` (investigation: `ChatMessageList.tsx:64-67` vs `key-conversation.html:433`)" and the dev notes specify "The container already has `aria-live='polite'` — preserve it; the mockup mandates both `role='log'` AND `aria-live='polite'` on the same element." The test at line 195 asserts `expect(list).toHaveAttribute('role', 'log')` but does NOT assert `aria-live="polite"` is present. A future change removing `aria-live="polite"` would pass the test suite undetected, breaking the screen-reader announcement behavior that `role="log"` relies on for new-message notifications. This was flagged as NFR-5.3 LOW (M) and remains unfixed.
- **Original classifications:** TFA: Gap C (missing assertion)
- **Remediation:** Add `expect(list).toHaveAttribute('aria-live', 'polite')` to the existing `role="log"` test.

#### [L3] Loading skeleton header does not match new canonical depth-1 page header structure
- **Sources:** cr
- **Location:** `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/loading.tsx:4-6`
- **Detail:** Story 5.2 established the canonical depth-1 page header (`border-b border-surface-raised pt-6 pb-4 px-8` with a `flex items-center gap-3` wrapper containing Breadcrumb + h1) and updated `artifacts/loading.tsx` to match (5.2 review patch). The `conversations/[conversationId]/loading.tsx` was missed — it still uses the old structure: `<header className="flex-shrink-0 px-8 py-6">` with no `border-b border-surface-raised`, no `pt-6 pb-4` (uses `py-6`), no `flex items-center gap-3` wrapper, and no `Breadcrumb`. Violates project-context.md line 107: "Skeletons must match real content dimensions." Also flagged as NFR-5.2 LOW.
- **Original classifications:** CR: patch; also NFR-5.2 LOW
- **Remediation:** Update the loading skeleton's header to match `page.tsx`: `<header className="flex-shrink-0 border-b border-surface-raised pt-6 pb-4 px-8"><div className="flex items-center gap-3"><Breadcrumb /><h1 tabIndex={-1} className="text-xl font-semibold text-text-1">Conversation</h1></div></header>`. Import `Breadcrumb` from `@/components/shell/Breadcrumb`.

#### [L4] `Intl.DateTimeFormat` instantiated on every render in AgentMessage and UserMessage
- **Sources:** cr
- **Location:** `apps/web/src/components/conversation/AgentMessage.tsx:87-91`, `apps/web/src/components/conversation/UserMessage.tsx:11-15`
- **Detail:** Both components create `new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })` inside the component body on every render. For a conversation with 100 messages, this creates 100 formatter instances on mount and re-creates them on every re-render (typing in the input, SSE state changes, scroll, etc.). The correct pattern is already used in `ArtifactListEntry.tsx:32-36` — a module-level `const dateFormatter = new Intl.DateTimeFormat(...)` shared across renders. Flagged as NFR-5.3 LOW. Pre-existing (not introduced by Epic 5, but Epic 5 modified both files for `mb-6`/focus-ring changes).
- **Original classifications:** CR: patch; also NFR-5.3 LOW (NFR-P)
- **Remediation:** Hoist the formatter to module scope in both files: `const TIME_FORMATTER = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });` then `TIME_FORMATTER.format(message.createdAt)` in the component body.

#### [L5] ArtifactViewer `a` component override lacks focus ring — inconsistent with Story 5.3 AgentMessage fix
- **Sources:** cr
- **Location:** `apps/web/src/components/artifact-browser/ArtifactViewer.tsx:91-92`
- **Detail:** Story 5.3 AC-7 added a focus ring (`focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`) to markdown links in `AgentMessage.tsx:76`. The `ArtifactViewer.tsx` `a` component override (line 91-92) uses only `text-accent hover:text-accent-hover underline` — no focus ring. project-context.md line 190 mandates the standard focus ring for "every focusable interactive element." Links rendered in artifact markdown content are focusable. Pre-existing (ArtifactViewer's `a` override was not touched by Epic 5), but the inconsistency with the 5.3 AgentMessage fix makes it stand out.
- **Original classifications:** CR: patch (dismissed as pre-existing/out-of-scope during 5.3 review — same finding applies here)
- **Remediation:** Add `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` to the `a` component className in `ArtifactViewer.tsx:92`. Coordinate with the deferred `target="_blank"` / `rel="noopener noreferrer"` addition for external links in artifact content.

#### [L6] `no-scrollbar` panels lack keyboard scrollability — `tabIndex`/`role="region"` missing
- **Sources:** cr
- **Location:** `apps/web/src/components/shell/SideNavigation.tsx:42` (conversation list), `apps/web/src/components/conversation/ChatMessageList.tsx:75` (message panel), `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:93` (artifact list pane)
- **Detail:** Story 5.4 AC-7 added the `no-scrollbar` utility class (which sets `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`) to three scrollable panels. With the scrollbar hidden, keyboard-only users (who rely on arrow keys/Page Down to scroll a focused container) cannot scroll these panels — the panels have `overflow-y-auto` but lack `tabIndex={0}` and `role="region"` with an `aria-label`, which are the standard attributes that make a scrollable div keyboard-focusable. AC-7's dev notes explicitly list "wheel/trackpad/touch" as the supported scroll methods, not keyboard. Flagged as NFR-5.4 LOW.
- **Original classifications:** CR: defer; also NFR-5.4 LOW (NFR accessibility)
- **Remediation:** Add `tabIndex={0}` and `role="region"` with a descriptive `aria-label` to each scrollable panel. For the conversation list: `aria-label="Conversations"`. For the message panel: `aria-label="Conversation messages"`. For the artifact list: `aria-label="Artifact list"`.

#### [L7] RepositoryUrlForm input lacks `maxLength` attribute — no frontend defense-in-depth
- **Sources:** cr
- **Location:** `apps/web/src/components/onboarding/RepositoryUrlForm.tsx:46-53`
- **Detail:** The Repository URL input (`<input type="url" ...>`) has no `maxLength` attribute, allowing unbounded input length on the frontend. Server-side Zod validation likely bounds the URL length, but the frontend lacks defense-in-depth per project-context.md line 137 (`.max(N)` on every Zod string field). Pre-existing (Story 5.4 only changed CSS classes on this input — `bg-bg`, `ring-offset-bg`, `focus:border-accent`). Flagged as NFR-5.4 LOW.
- **Original classifications:** CR: defer; also NFR-5.4 LOW (NFR security)
- **Remediation:** Add `maxLength={2000}` (or a limit matching the server-side Zod schema) to the input element at line 46.

#### [L8] SlashCommandPicker header `role="presentation"` inside `role="listbox"` — soft ARIA structure violation
- **Sources:** ech
- **Location:** `apps/web/src/components/conversation/SlashCommandPicker.tsx:37`
- **Detail:** Story 5.3 AC-9 added a "Skills — type to filter" header at the top of the slash command picker. A 5.3 review patch added `role="presentation"` to the header `<div>` to prevent it from being announced as a listbox option. However, `role="listbox"` (line 34) only permits `role="option"` children (and `role="group"` for grouping). A `role="presentation"` div is a non-permitted child in the DOM, even though `role="presentation"` removes it from the accessibility tree. The ARIA Authoring Practices violation is theoretical — screen readers that honor `role="presentation"` will not see the header. This is the best available fix without restructuring the picker to use a wrapper around the listbox.
- **Original classifications:** ECH: unhandled path (ARIA structure)
- **Remediation:** If strict ARIA compliance is required, restructure the picker so the header is a sibling of (not a child of) the `role="listbox"` element: wrap both in a container `<div>` and move the header outside the listbox. Otherwise, document as an accepted deviation.

---

## Pre-existing findings reviewed and NOT reported (out of scope for Epic 5)

The following were identified during the hunt but are pre-existing issues from earlier epics, not introduced or worsened by Epic 5's drift-fix work. Recorded for traceability.

- **useDraftPersistence load/save race (C15 from Epic 3 bug-hunt):** The `loadedForIdRef` guard added in the C15 fix mitigates the conversationId-change race (b) but does not fully prevent the initial-load race (a) — the save effect can briefly write `''` to localStorage before `setDraft(saved)` commits on the next render. The migration logic added by Story 5.3 (renaming `new-conversation-draft` → `new-conversation`) runs inside the load effect and is not affected by this race. Pre-existing, sub-millisecond window, self-correcting on next render.
- **ConversationPane timer leak on SESSION_DRAINING during provisioning:** `timeoutRef.current` is overwritten at line 228 (draining timeout) without clearing the line 633 (provisioning timeout). Both timers fire; the second is a no-op. Pre-existing, not introduced by Epic 5.
- **Message list rendering without virtualization (NFR-P):** `messages.map()` renders all messages with no bound. Pre-existing pattern; NFR-5.3 flagged it. MVP conversations are bounded by the 10-concurrent-conversation limit and natural conversation length.
- **ArtifactViewer `a` links lack `target="_blank"`/`rel="noopener noreferrer`:** Deferred from 5.3 review for AgentMessage; same applies to ArtifactViewer. Pre-existing.
- **`border-subtle` token defined but unused in tailwind.config.ts:** Story 5.4 migrated all usages of `border-border-subtle` to `border-surface-raised` but left the `border-subtle` color token (line 12) in the config. Harmless dead config. Cleanup pass optional.
- **Double regex pass in ArtifactViewer:** `parseFrontmatter` and `stripFrontmatter` both run the same regex on the full content (lines 107-108). NFR-5.1-1, deferred to a future hardening story per DP-5.

## Autonomous decisions (in place of halting at checkpoints)

1. **Target scope:** Expanded the bug-hunt target from "the surfaces Epic 5 touched" (per the task prompt) to the specific 30 source files + 20 test files modified by Stories 5-1 through 5-4, resolved via `git diff --stat HEAD~4..HEAD`. This kept the hunt focused on files the epic actually changed rather than the entire `apps/web/src/` tree.
2. **Subagent fallback:** The bug-hunt skill delegates TFA/ECH/CR to subagents. Since this session runs as a single inline agent, I executed all three layers inline (the skill's documented subagent-fallback mode). No `bug-hunt-tfa-prompt.md` / `bug-hunt-ech-prompt.md` / `bug-hunt-cr-prompt.md` prompt files were written — the analysis was performed directly against the source.
3. **`tailwind-merge` behavior verification:** I observed an apparent contradiction between the SideNavigation AC-4 test (asserts `px-2` on active Project Map link) and my reading of the source (active state string appeared to omit `px-2`). Rather than report a false-green test, I wrote a throwaway debug test to capture the actual rendered `className` and the `cn()` output. The debug test confirmed the source DOES include `px-2` in the active-state class string (`'bg-surface-raised text-text-1 mx-2 px-2'`) and `tailwind-merge` correctly resolves the `px-3` → `px-2` conflict. The debug test was deleted after verification. My initial source read had truncated the class string.
4. **`parseFrontmatter` quote handling:** Verified the quoted-YAML-value bug by writing a throwaway debug test that rendered `ArtifactViewer` with `title: "PRD: Onboarding Flow"` frontmatter and captured the badge's `textContent`. Confirmed the quotes appear in the rendered output. Debug test deleted after verification.
5. **`global-css.spec.ts` git tracking:** The NFR-5.4 audit flagged this file as untracked. I verified via `git ls-files` that it IS now tracked — the story commit staged it. Dropped from the findings list.
6. **Severity calibration:** Classified zero findings as critical/high. Epic 5 is a visual-drift-fix epic with no SSE/state/security changes. The most impactful finding (M1: auto-scroll regression) hides a Retry button below the fold but does not cause data loss or security exposure — medium is the conservative classification. Per step-05 rule "prefer the more conservative classification when uncertain," I considered upgrading M1 to high, but the retry button remains reachable by scrolling, and the user gets a 30s timeout error message regardless.
7. **Pre-existing findings:** Listed 6 pre-existing issues in a separate section rather than counting them toward the total. They were reviewed during the hunt but are out of scope for Epic 5's drift-fix work.

## Blockers / items for the user to decide

1. **M1 remediation approach:** Two viable fixes — (a) add `errorMessage`/`showRetry`/`showSpinner` to the auto-scroll effect deps (simplest, but scrolls even when the user has intentionally scrolled up), or (b) add a dedicated scroll-on-error effect guarded by `isAtBottomRef.current` (more precise). Option (b) is recommended but requires a small refactor. User preference needed on whether to scroll-override user intent when an error appears.
2. **M3 scope:** Fixing `parseFrontmatter` quote-stripping is a one-liner, but full YAML correctness (multiline, nested, folded) requires a real parser — explicitly deferred per DP-5. Decide whether the quote-strip fix is worth doing now as a tactical patch, or whether to bundle it with the deferred `stripFrontmatter` regex hardening story.
3. **L6 accessibility scope:** Adding `tabIndex={0}` + `role="region"` to scrollable panels is a cross-surface accessibility improvement. It was explicitly deferred during 5.4 (AC-7 listed wheel/trackpad/touch, not keyboard). Decide whether to address it now or keep it deferred.
