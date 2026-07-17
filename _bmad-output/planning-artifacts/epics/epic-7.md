# Epic 7: Live-Usage UX Improvements

Stories 7.1–7.5 are UX gaps discovered from live-app usage after Epic 5 closed. These are not mockup drift — they are live-usage findings about states and feedback that the design never fully specified (loading feedback during in-app navigation, relative timestamps beyond one minute, prominence of focus rings on navigation surfaces) and about inconsistency in how already-specified patterns render (error presentation in the conversation view). Stories 7.1–7.5 are frontend presentation changes only; independent of Epic 6.

**Extended 2026-07-16:** A deeper UX audit surfaced nine additional live-usage findings — dead ends and missing maintenance hatches the spec never specified. Stories 7.6–7.14 cover sign-out (avatar dropdown), repository disconnect, conversation management (delete, rename, search/show-all), the new-conversation intro prompt, the side-nav empty state, a global 404 page, and artifact-browser search/filter. Like 7.1–7.5 these are live-usage findings, not mockup drift; unlike 7.1–7.5, five of the nine also touch backend (a new bulk-terminate endpoint for repo disconnect, frontend wiring of the existing delete endpoint, Server Actions for rename and the full-conversation-list query) — but all remain independent of Epic 6 (they concern Auth.js session lifecycle, the `RepoConnection`/sandbox data model, and Prisma reads, not where the agent executes).

**Change proposal (7.1–7.5):** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-13.md`
**Change proposal (7.6–7.14):** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-16-ux-dead-ends.md`
**Change proposal (Story 7.1 AC amendment — error mockups):** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-16-error-mockups.md`

## Story 7.1: Unify Error State Presentation in Conversation View

As a user in a conversation,
I want every error that occurs within the conversation context to render inline in the same place and treatment as the happy-path greeting and the Claude Code error,
So that errors feel like part of the conversation, not a disconnected popup somewhere else on the page.

**Reference artifacts:**

- Error-state mockups — the authoritative visual reference for the states this story unifies:
  - `mockups/key-conversation-errors.html` — 7 error states on the Conversation surface, in full page context
  - `mockups/key-new-conversation-errors.html` — 4 states on the New Conversation surface (3 blocking + 1 transient)
  - `mockups/error-pattern-gallery.html` — cross-surface gallery of all 6 distinct error rendering patterns; every location labelled
- Component specifications (DESIGN.md, the visual identity reference):
  - `{components.blocking-content-message}` — the surface-replacement component used by every error state that hides the chat input and replaces the chat-messages panel. Max-width 480px; `negative-bg` background, 2px `negative` left border, `negative` icon, `sm`/`semibold`/`text-1` title, `sm`/`text-2` body, outlined action button.
  - `{components.error-state-tool-pill}` — the tool-pill variant used when a single agent tool call fails. Inherits base `{components.tool-pill}` styling (no visual override); error signal is carried by an adjacent Access Notice (`{components.access-notice}`) or the full-width Credential Error Banner (`{components.credential-error-banner}`), not by the pill itself. Status text "✕ failed" differentiates from success "✓ done".
- On any conflict between mockups and spines, the spines (DESIGN.md and EXPERIENCE.md §Conversation Surface States, §New Conversation) win (per EXPERIENCE.md Foundation).

**Acceptance Criteria:**

**Given** the new-conversation happy-path greeting
**When** it renders
**Then** it is the reference treatment: inline in the chat-messages panel, centered in the 824px column, with the established empty-state treatment
**And** every error state that occurs within the conversation context matches this placement and visual treatment (inline, centered in the chat-messages panel)
**And** blocking errors — those that hide the chat input and replace the chat-messages panel — including at minimum the session-start / sandbox-setup error — use the Blocking Content Message component (`{components.blocking-content-message}`) per `mockups/key-new-conversation-errors.html` State 1

**Given** a blocking error state with a Retry action — including the session-start / sandbox-setup error (`mockups/key-new-conversation-errors.html` State 1), the history-load failure (`mockups/key-conversation-errors.html` State 1), and the reconnecting-session timeout (`mockups/key-conversation-errors.html` State 2)
**When** it renders
**Then** the error message and Retry action render co-located, inline in the chat-messages panel — not detached above/below the conversation flow — using the Blocking Content Message component (`{components.blocking-content-message}`)
**And** the Retry button's behavior is unchanged — only its placement and visual treatment change

**Given** the cross-surface error inventory in `mockups/error-pattern-gallery.html` (all 6 distinct error rendering patterns: Pattern 1 Inline field error; Pattern 2 Auth error card; Pattern 3 Blocking Content Message; Pattern 4 Credential Error Banner; Pattern 5 Access Notice; Pattern 6 Error-State Tool Pill)
**When** the implementer runs the conversation-context error-state sweep
**Then** every conversation-context error state is traceable to a labelled gallery pattern (Patterns 3–6 for in-conversation surfaces; Patterns 1–2 are pre-app-shell states this story does not touch)
**And** any state that renders outside the conversation flow is brought inline per its gallery pattern's treatment
**And** any state found during implementation that is NOT covered by the gallery is brought inline per the same treatment AND registered as a finding before the story can close

**Given** a single agent tool call fails mid-turn — a 401 credential failure on a git operation, or a 403 access-denied (`ACCESS_DENIED` with code `RATE_LIMITED` / `ORG_RESTRICTION` / `INSUFFICIENT_PERMISSION`)
**When** the failing tool call renders in the message stream
**Then** the failing operation renders as the Error-State Tool Pill (`{components.error-state-tool-pill}`) — same styling as the base Tool Pill, no visual override; status text "✕ failed" differentiates from success "✓ done"
**And** the error signal is carried by an adjacent component, NOT by the pill itself:
  - For a credential failure (401 git operation), the Credential Error Banner (`{components.credential-error-banner}`) appears full-width above the message panel — see `mockups/key-conversation-errors.html` State 3
  - For an access-denied (403 git operation), an Access Notice (`{components.access-notice}`) renders inline in the message stream directly below the failing pill, with copy derived from the `ACCESS_DENIED` event's `code` field — see `mockups/key-conversation-errors.html` States 4–6
**And** clicking the Error-State Tool Pill expands to show the raw error output (same expand behavior as the base Tool Pill)
**And** the agent turn does not halt on an access-denied — the tool call's error result is returned to the agent, which adapts (per `architecture.md` §ACCESS_DENIED classification; the agent-process-terminated case in AC 2's gallery is distinct and only fires on a circuit-breaker event, not a single tool-call failure)

**Given** an error within the conversation context and the Credential Error Banner (UX-DR10, `{components.credential-error-banner}`)
**When** both could appear
**Then** the inline error (this story) is distinct from the Credential Error Banner — the banner is the already-specified full-width re-auth surface above the message panel (`mockups/key-conversation-errors.html` State 3 renders both together as the reference); this story covers sandbox/session/agent errors that belong in the conversation stream, not credential-health banners

**Scope notes:**
- Reference treatment = the happy-path new-conversation greeting.
- Two design decisions (Marius, 2026-07-16):
  1. **Blocking content messages carry the `negative` color family** — `negative-bg` background, 2px `negative` left border, `negative` icon. Captured in DESIGN.md `{components.blocking-content-message}`.
  2. **Error-state Tool Pills stay neutral** — they inherit base `{components.tool-pill}` styling with no visual override; the error signal is carried by the adjacent Access Notice or Credential Error Banner. Status text ("✕ failed") differentiates from success ("✓ done"). Captured in DESIGN.md `{components.error-state-tool-pill}`.
- Presentation (placement + visual treatment) is in scope. Rewriting error message copy wholesale is out of scope — only bring copy into compliance if a message clearly violates the Voice & Tone rules (EXPERIENCE.md §Voice and Tone). The example copy quoted in the original AC ("Failed to set up the sandbox. Please try again or contact support.") is illustrative; canonical copy lives in the spine (EXPERIENCE.md and the mockups) — defer to those at edit time.
- The Retry button's behavior is unchanged.
- Mockups are the visual reference; DESIGN.md and EXPERIENCE.md win on any conflict (per EXPERIENCE.md Foundation).

## Story 7.2: Loading State for Sidebar Page Navigation

As a user switching pages via the sidebar nav,
I want feedback that the navigation transition is in progress,
So that the app does not appear frozen while the destination page loads.

**Acceptance Criteria:**

**Given** a sidebar navigation destination
**When** the user activates it (click or keyboard)
**Then** a visible loading state appears in the content area within the response frame, indicating navigation is in progress
**And** the loading treatment is consistent with Story 7.3 (artifact switching) — the same visual language on both surfaces

**Given** a navigation transition is in progress
**When** the destination page renders
**Then** the loading state clears and the destination content appears

**Given** the loading treatment
**When** it renders
**Then** it uses the shared transition-loading pattern specified in the UX-DR19 amendment: existing content dims via opacity with a small spinner, keeping current content visible underneath rather than flashing an empty skeleton

**Given** the sidebar item itself
**When** navigation is triggered from it
**Then** the sidebar item does not render a separate loading indicator — the content-area loading state is the single source of truth for "navigation in progress" (avoids double-signaling; the active state on the destination item already confirms the selection)

**Scope notes:**
- Applies to all sidebar nav destinations (Project Map, Artifact Browser, existing Conversations, Settings, New Conversation).
- Shared visual treatment with Story 7.3 — implement the two together.

## Story 7.3: Loading State for Artifact Switching in Artifact Browser

As a user browsing the Artifact Browser with one artifact already open,
I want loading feedback when I click another artifact to switch to it,
So that the switch does not appear to have done nothing.

**Acceptance Criteria:**

**Given** an artifact is open in the Artifact Browser and the user clicks another artifact in the list
**When** the new artifact's content is fetching
**Then** a visible loading state renders in the content pane, consistent with Story 7.2's treatment

**Given** the loading treatment for artifact switching
**When** it renders
**Then** the previously-open artifact remains visible (dimmed via opacity) until the new artifact's content is ready, with a small spinner — no flash of empty content pane

**Given** the new artifact's content arrives
**When** it renders
**Then** the loading state clears and the new artifact's rendered Markdown replaces the previous one

**Scope notes:**
- Distinct surface from Story 7.2 but the loading treatment must feel consistent (decided jointly with Story 7.2).
- The "keep previous content visible dimmed" behavior is specific to artifact switching (where the outgoing content is meaningful context); Story 7.2's page transitions use the same dim+spinner language but the outgoing page may not persist as long.

## Story 7.4: Reduce Focus State Prominence on Navigation Surfaces

As a user navigating the sidebar, Project Map, and Artifact Browser with a mouse,
I want focus rings to not create visual noise on navigation surfaces,
So that the interface feels calm — while keyboard users still get a clear focus indicator.

**Acceptance Criteria:**

**Given** a navigation-surface interactive element (sidebar nav items, Project Map nodes/artifact cards, Artifact Browser list entries)
**When** it receives focus via mouse click
**Then** no visible design-system focus ring is shown (mouse-click focus is suppressed on these surfaces)

**Given** the same navigation-surface element
**When** it receives focus via keyboard (Tab)
**Then** the visible 2px accent focus ring with 2px offset appears (keyboard focus remains fully visible, satisfying WCAG 2.4.7)

**Given** an input or action surface (chat input; Run, Retry, Send, Save, Stop buttons; search/filter inputs; tab controls; modal dialog controls; tree/expand-collapse toggles; copy buttons; the slash-command picker)
**When** it receives focus by any means (mouse or keyboard)
**Then** the visible 2px accent focus ring with 2px offset appears and is never suppressed on click (unchanged from UX-DR16's original rule)

**Given** the global CSS and the existing `:focus:not(:focus-visible)` safety net (EXPERIENCE.md line 381)
**When** the nav-surface change is implemented
**Then** navigation surfaces use the `:focus-visible` Tailwind variant (`focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface`) instead of the `:focus` variant (`focus:ring-2 ...`) — so the ring appears on keyboard focus only
**And** input/action surfaces retain the `:focus` variant (ring on all focus, never suppressed on click)

**Given** the chat input's existing focus state
**When** this story ships
**Then** it is unchanged — it is explicitly in the "keep visible" set and was not the source of the noise complaint

**Scope notes:**
- Recommended reconciliation: `:focus-visible` on navigation surfaces only; full removal of keyboard focus is explicitly out of scope (would be a separate, deliberate accessibility trade-off requiring its own sign-off and is NOT recommended here).
- "Navigation surfaces" = sidebar nav items, Project Map artifact cards, Artifact Browser list entries. Revisit action buttons, modal controls, tabs, tree toggles, copy buttons, search inputs during implementation — recommend keeping all of these on `:focus` (visible on click).

## Story 7.5: Relative Time for Conversation Timestamps

As a user reading a conversation,
I want conversation message timestamps to show relative time as the primary display,
So that I can understand recency without doing mental arithmetic against the current clock.

**Acceptance Criteria:**

**Given** an agent message timestamp
**When** it renders inline below the message (low prominence, `xs`/`text-2`, per UX-DR4)
**Then** it displays relative time as the primary text: "just now" under 1 minute; "X minutes ago" 1–59 min; "X hours ago" 1–23 hr; "yesterday" / "X days ago" 24 hr–6 days; absolute date (e.g. "Jul 8") at 7 days and beyond

**Given** a user message timestamp
**When** it renders (hover-only, per UX-DR4)
**Then** the hover affordance shows relative time as the primary text using the same threshold table
**And** absolute time remains accessible (via the same hover) but is not the prominent display

**Given** any message timestamp and the absolute time
**When** the user hovers the timestamp
**Then** the absolute time is available (tooltip / `title`) — absolute time is demoted to accessible-but-not-prominent

**Given** a conversation view that stays open
**When** time passes
**Then** relative timestamps update live on an interval (configurable, e.g. 60s) while the conversation view is visible — "just now" rolls into "1 minute ago", etc. — and stops updating when the view is unmounted

**Given** the threshold for switching from relative to absolute date
**When** a message exceeds 7 days
**Then** the primary display becomes an absolute date (e.g. "Jul 8"), with the full absolute timestamp still available on hover

**Scope notes:**
- Relative time is primary and low-prominence (not bold, not large) — consistent with UX-DR4's "low-prominence inline on agent messages."
- Live-updating is in scope (interval tick while the conversation view is open; cleared on unmount).
- Store the absolute timestamp; compute relative client-side (or server-render once and hydrate with a client interval). Implementation choice.

## Story 7.6: Sign-out affordance (avatar dropdown)

As a signed-in user whose session is failing or expired,
I want a visible way to sign out and end my session from the side navigation,
So that I can recover from credential failures the way the product's own error messages instruct — without contacting support.

**Acceptance Criteria:**

**Given** the avatar circle in the side navigation
**When** the user activates it (click, or `Enter`/`Space` on keyboard focus)
**Then** it opens a dropdown menu (it is a button with `aria-haspopup="menu"` and `aria-expanded` reflecting open state), not a navigation link to `/settings`
**And** the prior "Settings" text label beside the avatar is removed — the avatar circle alone is the trigger, retaining its accessible name with the user's name

**Given** the avatar dropdown menu is open
**When** it renders
**Then** it contains, top to bottom: (1) the user's name and email as display-only muted text (`{colors.text-3}`, `{typography.scale.xs}` — not interactive), (2) a "Settings" link navigating to `/settings`, (3) a divider, (4) a "Sign out" action button

**Given** the avatar dropdown menu is open
**When** the user navigates by keyboard or pointer
**Then** `Tab` moves between menu items, `Escape` closes the menu and returns focus to the avatar trigger, and an outside click also closes the menu

**Given** the user selects "Sign out"
**When** the action fires
**Then** the platform session ends — the `signOut()` function from `apps/web/src/lib/auth.ts` is called with redirect to `/sign-in` — and the browser is redirected to the sign-in screen
**And** active sandboxes are not terminated: each active Conversation's Sandbox continues running until it reaches idle timeout or the Conversation is explicitly ended (FR-20; platform session lifetime and Sandbox session lifetime are independent)

**Scope notes:**
- Supersedes the prior avatar spec ("plain navigation link to `/settings`"); the avatar becomes a dropdown menu (EXPERIENCE.md §Avatar Account Menu, amended 2026-07-16). A full account-settings page is out of scope (FR-20 Out of Scope).
- Frontend-only wiring: no new endpoint, Server Action, or data-model change. `signOut()` is already exported from `apps/web/src/lib/auth.ts`; the avatar `<Link>` in `SideNavigation.tsx` is replaced with a Radix dropdown (`components/ui/dropdown-menu.tsx`, already in the shadcn/ui set). See architecture review §1.
- Token behavior (architecture review §1): `signOut()` clears the client-side session cookie (stateless JWT, 8h `maxAge`); the boundary JWT is not explicitly invalidated but becomes unusable without a valid session, and `ActiveUserGuard` performs a live `User` lookup on every privileged request. A server-side revocation list is out of scope for MVP.
- Reference: FR-20 (Session Termination), EXPERIENCE.md §Avatar Account Menu, architecture review §1.
- No dependencies on other stories in Epic 7.

## Story 7.7: Repository disconnect from Settings

As a user who connected the wrong repository, whose repository was renamed, or whose team migrated to a new repository,
I want to disconnect my connected repository from the Settings page,
So that I am not permanently welded to my first choice and can re-onboard to a different repository.

**Acceptance Criteria:**

**Given** the Settings page and a user with a connected repository
**When** the page renders
**Then** a "Repository" section displays the connected repository URL as display-only text (not editable here) and a "Disconnect" button with destructive action styling
**And** the prior "coming soon" static placeholder for this section is replaced (the "Coming soon" section for account management / notification preferences is retained as non-interactive display entries)

**Given** the user clicks "Disconnect"
**When** the confirmation dialog opens
**Then** it uses the standard dialog pattern (focus trap, `Escape` to close, focus returns to the trigger)
**And** it shows title "Disconnect repository?" and body "Disconnecting will end all active conversations. Any unsaved work will be lost. Committed artifacts remain in your repository." with "Disconnect" (destructive) and "Cancel" actions

**Given** the user confirms the disconnect
**When** the action fires
**Then** the browser calls the new agent-be bulk `DELETE /api/conversations` endpoint (browser-direct, boundary JWT in `Authorization` header) — which iterates the user's active conversations, terminates each sandbox, clears idle timers, deletes conversation records, and completes SSE sessions, returning `{ terminated: number }`
**And** then the browser calls the `disconnectRepository()` Server Action (in `apps/web/src/actions/repo-disconnect.actions.ts`) which deletes the `RepoConnection` record via Prisma (cascading to delete mirrored `Artifact` records)
**And** the browser redirects to `/onboarding`

**Given** the disconnect completes and the browser reaches `/onboarding`
**When** the onboarding flow loads
**Then** the user can immediately connect a new repository (FR-1, FR-2); no cooling-off period is imposed (FR-21)
**And** the `OAuthCredential` is not deleted — the GitHub OAuth token persists so the user can reconnect; disconnect is a repo-level operation, not an account-level one
**And** committed artifacts remain in the repository; when the same repository is reconnected, its committed artifacts reappear on the Project Map unchanged

**Scope notes:**
- Switching repositories is not a separate flow — it is disconnect followed by the existing onboarding redirect (FR-21 Out of Scope). A dedicated "switch repository" UI is out of scope.
- Architecture (architecture review §2 and §Architecture Conflicts #1): browser-direct call to the new agent-be `DELETE /api/conversations` (no `:id`) endpoint for sandbox termination, then a Server Action for Postgres cleanup. This is the first bulk-termination endpoint in agent-be and should reuse the existing `abandonConversation` teardown path (extracted into a shared private method), be rate-limited to match `createConversation` (10/60s), and be documented as the reference implementation for bulk sandbox termination.
- No server-to-server call between `apps/web` and `apps/agent-be` — the browser-direct call preserves the established architectural boundary (`apps/web` cannot query Daytona directly; it has no API key and no `@daytonaio/sdk` dependency).
- Deleting `RepoConnection` cascades to delete `Artifact` records (the mirrored cache); it does NOT delete `OAuthCredential` (correct — repo-level vs account-level). Conversation records are deleted during the bulk terminate, cascading to turns and cost records. See architecture review §2 (credential cleanup) and the §Risks partial-failure note.
- Reference: FR-21 (Repository Disconnection), EXPERIENCE.md §Settings, architecture review §2.
- Soft navigation dependency on Story 7.6: the avatar dropdown's "Settings" link is the path to the Settings page once the avatar is no longer a direct link to `/settings`. If 7.7 ships without 7.6, an alternate path to `/settings` must exist; implementing 7.6 first is recommended.

## Story 7.8: New conversation intro prompt

As a non-developer user opening a new conversation for the first time,
I want to see the slash-command hint the moment the conversation page loads,
So that I learn how to invoke a skill without having to discover it by accident.

**Acceptance Criteria:**

**Given** the new-conversation page at `/conversations/new` before the user sends their first message
**When** the chat area renders
**Then** it shows the introductory prompt as rendered platform copy centered in the chat-messages panel — "Press `/` to browse available skills, or type a message to start." — using the same placement and visual treatment as the happy-path greeting (Story 7.1's reference treatment)
**And** the copy is not rendered solely as the chat input's `placeholder` attribute (which is invisible until the user starts typing)

**Given** the introductory prompt is visible
**When** the user sends their first message
**Then** the page transitions to `/conversations/:id`, the conversation appears in the side nav with its semantic title, and the introductory prompt disappears
**And** the prompt copy is platform copy, not an agent message

**Given** the introductory prompt and a blocked entry state (conversation limit reached, or seat limit exceeded)
**When** the blocked state applies
**Then** the blocking message displays in place of the introductory prompt (per the existing New Conversation blocked-entry-states table) and the chat input is not shown

**Scope notes:**
- Replaces the prior implementation that rendered the intro copy only as `placeholder="Message bmad-easy…"` on the textarea. The spec's intended treatment is rendered platform copy centered in the chat-messages panel. See EXPERIENCE.md §New Conversation (amended 2026-07-16).
- Frontend-only; no PRD or architecture changes.
- Shares the Story 7.1 reference treatment (the happy-path greeting); the placement and visual treatment should match.
- Reference: EXPERIENCE.md §New Conversation.
- No dependencies on other stories.

## Story 7.9: Side-nav conversation empty state

As a new user on my first session, or after deleting all my conversations,
I want the empty conversation region in the side nav to tell me so rather than show blank space,
So that the most persistent surface in the application shell does not look broken.

**Acceptance Criteria:**

**Given** the side navigation's conversation region
**When** the conversation list is empty (no conversations with titles)
**Then** the region shows muted text "No conversations yet" — `{colors.text-3}` and `{typography.scale.xs}`
**And** no illustration or icon is shown; the New Conversation button directly above already prompts action

**Given** the empty state is visible
**When** the user creates their first conversation
**Then** the empty state is replaced by the conversation list with the new entry

**Scope notes:**
- Minimal — consistent with the calm platform voice. No illustration. See EXPERIENCE.md §Conversation List Interactions → Empty State (Finding 7).
- Frontend-only; no PRD or architecture changes.
- Reference: EXPERIENCE.md §Conversation List Interactions → Empty State.
- Logically pairs with Story 7.11 (delete): once a user deletes all conversations, this empty state appears. No hard dependency — implementable independently.

## Story 7.10: Global 404 page

As a user who hits a stale bookmark, typo, deleted-conversation URL, or access-revoked repository path,
I want a designed error page that keeps me inside the application shell and offers a way back,
So that I am not dumped into a default Next.js 404 that breaks the layout.

**Acceptance Criteria:**

**Given** a route Next.js cannot match (stale bookmark, typo, deleted-conversation URL, access-revoked repository path)
**When** the `not-found.tsx` page at the app root renders
**Then** it mirrors the canonical `error.tsx` structure: a full page shell, the message centered in the content area, design tokens respected, and a `<h1 tabIndex={-1}>` for AppShell route-focus management (focus moves to the h1 on render)
**And** the content is: h1 "Page not found"; body "The page you're looking for doesn't exist or may have moved."; a "Go to Project Map" link

**Given** the `not-found.tsx` page
**When** it renders within an authenticated route segment (inside the app shell)
**Then** the side nav remains visible and the message appears in the content area

**Given** the `not-found.tsx` page
**When** it renders outside the app shell (unauthenticated)
**Then** the message is a centered single-column layout against `{colors.bg}` — same treatment as Sign In

**Scope notes:**
- Closes the one gap in an otherwise rigorous error-state system (every other error state has a designed `error.tsx`). See EXPERIENCE.md §Not Found (404) (amended 2026-07-16).
- Frontend-only; no PRD or architecture changes. No separate mockup — reuses the existing `error.tsx` centered "full page" layout.
- Reference: EXPERIENCE.md §Not Found (404).
- No dependencies on other stories.

## Story 7.11: Conversation delete

As a user who has hit the 10-conversation limit or wants to clean up old conversations,
I want to delete conversations from the side navigation,
So that the limit is a manageable constraint rather than a permanent wall.

**Acceptance Criteria:**

**Given** a conversation entry in the side navigation
**When** the user hovers or focuses the entry
**Then** a delete affordance — a trash-icon button — is revealed
**And** the delete button is a separate focusable element (`Tab` reaches it independently of the conversation link) with `aria-label="Delete conversation: [title]"`

**Given** the user activates the delete button
**When** the confirmation dialog opens
**Then** it uses the standard dialog pattern (focus trap, `Escape` to close, focus returns to the trigger)
**And** it shows title "Delete conversation?" and body "This conversation and its chat history will be permanently deleted. This cannot be undone." with "Delete" (destructive) and "Cancel" actions

**Given** the user confirms the delete
**When** the action fires
**Then** the browser calls the existing `DELETE /api/conversations/:id` endpoint (boundary JWT in `Authorization` header) — which terminates the active sandbox if present, cancels any in-flight provisioning, clears the idle-timeout timer and in-memory state, deletes the conversation record (cascading to turns and cost records), and completes the SSE session
**And** the entry is removed from the side nav (list refreshes via `router.refresh()`)

**Given** the deleted conversation was the currently active page
**When** delete completes
**Then** the app redirects to the Project Map (before the side-nav refresh)

**Scope notes:**
- The endpoint already exists (`ConversationsController.abandonConversation`); this is frontend wiring only — a delete button, a confirmation dialog, a browser-direct `fetch('DELETE /api/conversations/:id')` call, and `router.refresh()` / `redirect('/project-map')` afterward. See architecture review §4.
- Delete is permanent, not archive — the confirmation dialog states "This cannot be undone." An archive/restore capability is explicitly out of scope.
- No schema migration: cascade deletes handle turns and cost records (`Turn` → `Conversation` `onDelete: Cascade`; `CostRecord` → `Conversation` `onDelete: Cascade`).
- Concurrent access: if another tab has the deleted conversation open, the SSE connection drops; the existing `ConversationPane` `onerror` handler covers this — no new handling needed.
- Turns the FR-11 10-conversation limit from a permanent wall into a manageable constraint (the FR-11 clarification added alongside this story references the delete capability).
- Reference: architecture review §4, EXPERIENCE.md §Conversation List Interactions → Delete.
- Pairs with Story 7.12 (rename) — both touch side-nav conversation interactions; implement together.

## Story 7.12: Conversation rename

As a user reading a conversation whose auto-generated title is wrong or unhelpful,
I want to rename it inline in the side navigation,
So that I can fix "PRD discussion" to "Q3 pricing PRD."

**Acceptance Criteria:**

**Given** a conversation entry in the side navigation
**When** the user hovers or focuses the entry, or double-clicks the title text
**Then** a rename affordance — a pencil-icon button — is revealed (alongside the delete button from Story 7.11)
**And** double-clicking the title text also enters edit mode

**Given** the user enters edit mode
**When** the title becomes an inline text input
**Then** it is pre-populated with the current title, the text is selected on entry, and the input has a `maxLength` matching the backend cap (100 characters)
**And** `Enter` saves, `Escape` cancels (reverts to the original title, exits edit mode), and click outside the input also saves (blur = save)

**Given** the user attempts to save with an empty title
**When** the save attempt fires
**Then** the empty title is rejected — the title reverts to the original and edit mode exits
**And** the side nav does not gain a conversation with a null title (null-title conversations are filtered from the list)

**Given** the user saves a valid (non-empty, ≤ 100 characters) title
**When** the Server Action completes
**Then** the conversation title is updated via Prisma and the side nav refreshes via `router.refresh()` with the new title
**And** the Server Action validates the conversation belongs to the authenticated user (tenant isolation via `findFirst({ where: { id, userId } })`) before updating

**Scope notes:**
- Architecture (architecture review §5): a new Server Action in `apps/web/src/actions/conversation.actions.ts` performing a Prisma `conversation.update` — no agent-be involvement. The conversation title is non-live metadata; `apps/web` owns synchronous data operations and already reads conversations directly from Postgres. Routing a title update through agent-be would violate the service boundary.
- The `Conversation` model's `title` field is already `String?`; no schema migration. The Server Action uses a Zod schema with `title: z.string().min(1).max(100)`.
- No uniqueness constraint on titles — two conversations may share a title; this is correct, no change needed (architecture review §Unknowns).
- The Server Action follows the established typed-result-union pattern (`{ success: true } | { error; errorCode }`, never throws to the client).
- Reference: architecture review §5, EXPERIENCE.md §Conversation List Interactions → Rename.
- Pairs with Story 7.11 (delete) — both touch side-nav conversation interactions; implement together.

## Story 7.13: Artifact Browser search and filter

As a user with forty-plus artifacts across multiple types,
I want to search and filter the artifact list by title and type,
So that I can find what I need without scrolling.

**Acceptance Criteria:**

**Given** the Artifact Browser list (in either layout state — list-only or list + detail)
**When** it renders
**Then** a search/filter control sits at the top of the list, above the entries
**And** it contains a search input (placeholder "Search artifacts…") that filters the list by title (case-insensitive substring match) as the user types, with a clear (×) button appearing inside the input when text is present
**And** it contains a type filter (pill buttons or a dropdown) to filter by artifact type (PRD, Brainstorming, Architecture, etc.), with "All" as the default showing every type

**Given** the user types in the search input or selects a type filter
**When** the filter changes
**Then** the list updates live to show only entries matching the active search text and type filter
**And** filter state persists in URL query params (`?q=search&type=prd`) for shareable filtered views; on load the list honors the query params and applies them

**Given** the user activates the clear (×) button, empties the search input, or resets the type filter to "All"
**When** the filters clear
**Then** the list returns to full and the URL query params are cleared

**Given** the active filter results in no matches
**When** the list area renders
**Then** it shows "No artifacts match your search." with the search input still active (an intentional exception to the Voice and Tone "prompt action" empty-state guidance — the search input itself is the actionable surface)

**Scope notes:**
- Architecture (architecture review §8): client-side filtering of the already-rendered (server-rendered) artifact list for MVP — no new endpoint, Server Action, or Prisma query. The list is already in the DOM. Adequate for ≤ 100 artifacts. NFR-P4 (Artifact Browser load ≤ 2s) is unaffected — search runs after initial load and adds no network requests.
- Post-MVP: if the artifact count grows large enough that rendering the full list is a performance concern, a server-side search endpoint with pagination would be needed (the `Artifact` table has `@@index([repoConnectionId, lastModifiedAt])` to support it). Out of scope for MVP.
- Reference: architecture review §8 (Finding 8), EXPERIENCE.md §Artifact Search and Filter.
- No dependencies on other stories.

## Story 7.14: Conversation search / show all

As a user whose important conversations from last week have fallen off the 5-entry side-nav cap,
I want to find and open them from a full conversation list,
So that they are not inaccessible except by direct URL.

**Acceptance Criteria:**

**Given** the side navigation's conversation region and a user with more than 5 conversations
**When** the region renders
**Then** a "Show all" link appears below the conversation list (below the 5th entry)
**And** when the user has 5 or fewer conversations, the link is not shown

**Given** the user clicks "Show all"
**When** the modal opens
**Then** it uses the standard dialog pattern (focus trap, `Escape` to close, focus returns to the "Show all" trigger)
**And** it shows title "Conversations", a search input (placeholder "Search conversations…") at the top, and a full scrollable list of all conversations (not capped at 5)
**And** each entry shows its title and a relative last-activity timestamp (the same relative-time treatment as Story 7.5)

**Given** the user types in the modal's search input
**When** the input changes
**Then** the scrollable list filters live by title (case-insensitive substring match)

**Given** the user selects a conversation in the modal
**When** the selection fires
**Then** the app navigates to that conversation and closes the modal

**Scope notes:**
- The full list is a modal, chosen over a dedicated `/conversations` route for MVP simplicity (EXPERIENCE.md §Show All). The side-nav list itself remains capped at 5 — this relocates the full list to a separate surface, respecting the original "no show more in MVP" by relocation, not by raising the cap.
- Architecture (architecture review §9): a new Server Action queries Prisma without the `take: 5` limit (same `where` clause as the layout query) and returns the full list for the modal. No agent-be involvement — conversation metadata is non-live data; `apps/web` reads Postgres directly. The Server Action returns the same `{ id, title }` shape the layout already passes to `SideNavigation`, plus `lastActiveAt` for the relative timestamp.
- For MVP (max 10 active conversations per FR-11), the search input filters the returned list client-side (same pattern as Story 7.13). Post-MVP, server-side `where: { title: { contains: searchQuery, mode: 'insensitive' } }` Prisma filtering and pagination could be added. The `Conversation` table has `@@index([userId, lastActiveAt])`, so the query is a simple indexed read.
- Reference: architecture review §9 (Finding 9), EXPERIENCE.md §Conversation List Interactions → Show All.
- Soft dependency on Story 7.5 (relative-time treatment for the timestamp column); acceptable to ship 7.14 with an alternate fallback (relative-only without live updates, or absolute time) if 7.5 is delayed.
