# Sprint Change Proposal — 2026-07-08

## Issue Summary

A comprehensive visual-drift investigation (`_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md`) audited all 7 UX mockup surfaces plus the shared shell against the `apps/web` implementation and confirmed **102 drift findings** (10 High, 32 Medium, 60 Low) plus 3 token-config gaps.

Token values are faithful — all 42 primitive tokens in DESIGN.md match `tailwind.config.ts` exactly. The drift is therefore not token-value drift; it is:

1. **Structural drift** — missing visual containers/panels on 6 surfaces, Breadcrumb stacked rather than inline on every depth-1 page, tool/semantic pills rendered as standalone rows instead of inline in the agent stream.
2. **Token-usage drift** — correct tokens exist but components select the wrong ones (`text-3` for hover borders, `bg-surface` for recessed inputs, `text-bg` on accent buttons, etc.).
3. **Copy-level drift** — taglines, placeholders, error messages, and link text diverge from the mockups.
4. **Token-config gaps** — unenforced font weights, a missing floating box-shadow token, and an `extend`-based Tailwind config that leaves default-palette utilities available alongside the design system.

The prior conversation-drift spec (commit c7c1c5a) closed its 9 targeted issues but was narrowly scoped; no broader mockup-vs-implementation audit was ever performed, which is the process gap that allowed the drift to accumulate across 6 of 7 surfaces.

## Impact Analysis

- **Epic Impact:** A new Epic 5 ("UX Mockup Fidelity — Close Visual Drift") is created. Epics 1–3 are functionally complete (done or in-progress close-out); their implementations carry visual drift that this epic closes. No in-flight Epic 1–3 work is reopened.
- **Story Impact:** 4 new stories (5.1–5.4), added to the sprint plan and `sprint-status.yaml` as `backlog`. No existing stories are modified or removed.
- **Artifact Conflicts:** The UX mockups (DESIGN.md, EXPERIENCE.md, 7 HTML files) are the authoritative source of truth. Code aligns to the mockups, not the reverse. Two shell findings (nav links relocated, Settings label removed) may be intentional redesigns — these require design confirmation before being treated as drift to fix.
- **Technical Impact:** One architecturally significant change (Story 5.3 — inline tool/semantic pills, requiring a change to how `TOOL_CALL` events are stored and rendered). The remainder are CSS, token-selection, and component-structure fixes with low to moderate effort.

## Recommended Approach

**Direct Adjustment.** Add Epic 5 with 4 stories to the sprint plan. No rollback is needed — implemented features work correctly; this is visual-fidelity work that closes the gap between the shipped UI and the design intent. Stories are sequenced by leverage: container restoration and shell/header structure first (highest visibility), conversation-stream structure (architectural), then token-usage and config enforcement (preventive).

## Detailed Change Proposals

### Story 5.1: Restore Missing Visual Containers Across Surfaces — `5-1-restore-missing-visual-containers`

Restore the designed visual container structure on 6 surfaces:

- **Sign-in** — bordered auth card + brand logo box + heading + legal footer (`sign-in/page.tsx:17-43` vs `key-signin.html:79-91,105-115`)
- **Onboarding** — form panel around the URL input; BMAD-not-found styled panel (`RepositoryUrlForm.tsx:39,55-69` vs `key-onboarding.html:98-106,213-233`)
- **Settings** — designed "coming soon" empty-state (icon, title, body, teaser items) (`settings/page.tsx:10-12` vs `key-settings.html:184-247,304-332`)
- **Artifact Browser** — frontmatter metadata badge in `ArtifactViewer` (`ArtifactViewer.tsx:9-11,89-103` vs `key-artifact-browser.html:264-297,446-456`)
- **Conversation** — single bordered `chat-input-box` holding textarea + Send + WorkingTreeIndicator (`ChatInput.tsx:59-94` vs `key-conversation.html:326-334`)

### Story 5.2: Fix Shared Shell and Page-Header Structural Drift — `5-2-fix-shared-shell-and-page-header-structural-drift`

Align the persistent shell and depth-1 page headers to the mockups:

- Wordmark brand mark `bmad·easy` with accent interpunct (not `bmad-easy`)
- Visible "Settings" label next to avatar (pending design confirmation — may be intentional redesign)
- Inset-pill active nav state (not full-width bar)
- Remove doubled horizontal padding on nav items; align nav item spacing
- Breadcrumb inline beside the page title on a single flex row (not stacked above with `py-4`)
- 1px header bottom divider on all depth-1 pages (Conversation, Artifact Browser, Settings, New Conversation)

**Note:** Nav-link relocation and Settings-label removal may be intentional redesigns — design confirmation is a prerequisite for those two specific items before treating them as drift.

### Story 5.3: Fix Conversation Stream Structural Drift — `5-3-fix-conversation-stream-structural-drift`

Align the conversation surface to the mockups:

- **Inline tool/semantic pills** — render pills inline within the agent's markdown stream at the position the call occurred, not as standalone rows. *Architecturally significant:* requires changing how `TOOL_CALL`/recognition events are stored and rendered relative to the message stream. Cross-check against Story 3.4 and UX-DR5 before refactoring.
- 824px column centering for messages and chat input on active conversation
- Rich new-conversation empty-state (icon, title, `<kbd>` keyboard hint)
- `SessionStartSpinner` centered in the chat-messages panel, not the input area
- Disabled Send button styled as muted surface (not `opacity-50`)
- Copy/placeholder drift: placeholders, inter-message gap, user-bubble padding, scroll-to-bottom button text color, semantic-pill separator opacity

### Story 5.4: Fix Token-Usage Drift and Token-Config Gaps — `5-4-fix-token-usage-drift-and-token-config-gaps`

Correct token selection and close structural config gaps to prevent recurrence:

- Project-map: `hover:border-text-3` → `hover:border-accent`
- Onboarding: `bg-surface` → `bg-bg` for input; `text-text-2` → `text-text-1` for label
- Conversation: `text-bg` → `text-accent-fg` on Retry and Save buttons
- Artifact-browser: `hover:bg-surface-raised/60` → `hover:bg-surface-raised`; `text-text-2` → `text-text-3` for dates
- Shell hairlines: `border-border-subtle` → `border-surface-raised` (or document `border-subtle` in DESIGN.md)
- Scrollbar hiding (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) in `global.css`
- Add `boxShadow: { floating: '0 8px 24px rgba(0,0,0,0.4)' }` to `tailwind.config.ts`; replace `shadow-lg` on `WorkingTreeIndicator` with the `floating` token
- Add `fontWeight` override to enforce DESIGN.md's 400/500/600 constraint and block weights above 600
- Consider replacing `theme.extend` with full `theme` overrides for tokenized categories to block non-design-system defaults (stage carefully — migrate latent default-palette usage first)

## Implementation Handoff

- **Scope:** Moderate. 4 stories; one architectural (Story 5.3 inline tool/semantic pills), the rest are CSS/component-structure and token-selection fixes.
- **Route to:** Developer agent for implementation via `bmad-dev-story`, one story at a time. Recommended order: 5.1 → 5.2 → 5.3 → 5.4 (leverage-ordered; 5.3 last among the structural stories because it touches the streaming data model).
- **Verification:** Code-vs-mockup comparison per surface. The investigation notes pixel-level screenshot diff as Missing Evidence (out of scope here); a future Playwright visual-regression suite would catch recurrence and is a candidate post-Epic-5 hardening item, not an Epic 5 acceptance criterion.
