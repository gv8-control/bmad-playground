---
title: "EXPERIENCE: bmad-easy"
status: final
created: 2026-06-15
updated: 2026-07-16
sources:
  - _bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md
  - _bmad-output/planning-artifacts/briefs/brief-bmad-easy-2026-06-12/brief.md
  - _bmad-output/planning-artifacts/architecture.md
---

# EXPERIENCE: bmad-easy

## Foundation

**Form factor:** Web application, modern browser, desktop-first. Minimum supported viewport: 1024px wide. Tablet (768px–1023px) supported with a collapsed side navigation; mobile is out of scope for MVP.

**UI system:** React + Tailwind CSS. No named component library. DESIGN.md tokens are the visual identity reference; all color, typography, spacing, and shape decisions defer to it.

**Dark mode:** Default and only mode for MVP. Light mode is post-MVP.

**Rendering stack:** Markdown rendered in agent messages using a streaming-compatible Markdown library. All user-visible text outside agent messages is platform UI copy, not Markdown.

**DESIGN.md reference:** Visual identity (color tokens, typography, radii, component specifications) is fully defined in DESIGN.md. This document specifies behavior, information architecture, states, and interactions only. DESIGN.md tokens are referenced as `{colors.*}`, `{typography.*}`, etc.

**Mockups:** Key-screen HTML mockups for all seven surfaces live in [mockups/](mockups/), linked from each surface's State Patterns section. Error states for Conversation and New Conversation are in [mockups/key-conversation-errors.html](mockups/key-conversation-errors.html) and [mockups/key-new-conversation-errors.html](mockups/key-new-conversation-errors.html). A cross-surface [error pattern gallery](mockups/error-pattern-gallery.html) renders every distinct error rendering pattern on one page for style reference. Mockups show one representative state per surface; the full state inventory lives in the tables here. On any conflict, DESIGN.md and EXPERIENCE.md win over the mockups. Mocks are rendered at 1280px viewport width for readability; the 1024px minimum layout and the 768–1023px tablet collapsed-nav behavior are spine-only.

---

## Information Architecture

### Surfaces

The platform has two distinct zones: the **pre-app shell** (unauthenticated / onboarding) and the **app shell** (authenticated, post-onboarding).

#### Pre-App Shell

| Surface | URL pattern | Entry condition |
|---|---|---|
| Sign In | `/sign-in` | Unauthenticated user (new or returning) |
| Onboarding | `/onboarding` | Authenticated, no connected repository |

These surfaces do not display the side navigation. They are centered, single-column layouts against `{colors.bg}`.

#### App Shell

After onboarding completes, the app shell is always present: the persistent side navigation panel (240px) plus a fluid content area. All authenticated surfaces below share this shell.

| Surface | URL pattern | IA role |
|---|---|---|
| Project Map | `/` | Home screen — default destination post-onboarding |
| New Conversation | `/conversations/new` | Transient — no stable URL until first message sent |
| Conversation | `/conversations/:id` | Persistent chat surface |
| Artifact Browser | `/artifacts` | List + optional detail |
| Settings | `/settings` | Repository management (disconnect) + non-interactive "coming soon" teaser items |

**Depth model:** Project Map is the root (depth 0). Conversation and Artifact Browser are one level down (depth 1). Breadcrumb navigation is one level deep: depth-1 pages show "← Project Map" in their header. No deeper nesting.

### Side Navigation

Always visible in the app shell. Contents, top to bottom:

1. Product wordmark
2. **New Conversation** button — primary action; always accessible
3. Conversation list — the 5 most-recent conversations, each labeled with its 2–5 word semantic title. Rendered in `text-2`; active conversation highlighted. The nav list itself is capped at 5 entries; when the user has more than 5 conversations, a "Show all" link appears below the list and opens a full conversation list modal (see [Conversation List Interactions — Show All](#conversation-list-interactions) below). *Amendment 2026-07-16:* the prior "no 'show more' in MVP" is superseded — the side-nav list still caps at 5, but the full list is reachable via the Show All modal.
4. Horizontal separator
5. **Project Map** link
6. **Artifact Browser** link
7. _(bottom-pinned)_ **Account** — the user's avatar circle, a dropdown menu trigger (see [Avatar Account Menu](#avatar-account-menu) below)

Active state: the current surface's nav item has `{colors.surface-raised}` background and `{colors.text-1}` text color. All inactive items use `{colors.text-2}`.

No nested items. No expand/collapse. No icon-only collapsed state (collapsed nav is a tablet-only behavior, implemented as an off-canvas drawer triggered by a hamburger button in the app header).

#### Avatar Account Menu

_(Amendment 2026-07-16 per UX findings — Finding 1. Supersedes the prior "The avatar circle (Settings entry) is a plain navigation link…" text that previously occupied this position.)_

The avatar circle is a **button** (not a link), with `aria-haspopup="menu"` and `aria-expanded` reflecting the open state. It retains its `aria-label` with the user's name (per Accessibility Floor — Text alternatives). The previous "Settings" text label beside the avatar is removed; the avatar circle alone is the trigger.

Activating the avatar (click, or `Enter`/`Space` on keyboard focus) opens a dropdown menu containing:

1. User name and email — display only, `{colors.text-3}` and `{typography.scale.xs}` (muted; not interactive)
2. "Settings" — link, navigates to `/settings`
3. Divider (separator)
4. "Sign out" — action button

Menu behavior:

- Keyboard-navigable: `Tab` moves between items; `Escape` closes the menu and returns focus to the avatar trigger.
- Outside click closes the menu.
- Selecting "Sign out" terminates the session and redirects to `/sign-in`.

#### Conversation List Interactions

_(Amendment 2026-07-16 per UX findings — Findings 4, 5, 7, 9.)_

**Empty State** (Finding 7). When the conversation list is empty (no conversations with titles), the conversation region shows muted text: "No conversations yet" — `{colors.text-3}` and `{typography.scale.xs}`. No illustration or icon; the New Conversation button directly above already prompts action.

**Delete** (Finding 4). Each conversation entry has a delete affordance — a trash-icon button — revealed on hover and on focus. The delete button is a separate focusable element (`Tab` reaches it independently of the conversation link) and has `aria-label="Delete conversation: [title]"`. Clicking delete opens a confirmation dialog using the standard dialog pattern (§Accessibility Floor — focus trap, `Escape` to close, focus returns to the trigger):

- Title: "Delete conversation?"
- Body: "This conversation and its chat history will be permanently deleted. This cannot be undone."
- Actions: "Delete" (destructive styling per DESIGN.md) and "Cancel"

On confirm: the conversation's sandbox is terminated if active; the conversation record and its messages are deleted; the entry is removed from the side nav (list refreshes). If the deleted conversation was the currently active page, the app redirects to the Project Map.

**Rename** (Finding 5). Each conversation entry has a rename affordance — a pencil-icon button — revealed on hover and on focus, or the user may double-click the title text to enter edit mode. In edit mode:

- The title becomes an inline text input, pre-populated with the current title, text selected on entry.
- `Enter` saves the new title.
- `Escape` cancels (reverts to the original title, exits edit mode).
- Click outside the input also saves (blur = save).
- An empty title on save is rejected — the title reverts to the original and edit mode exits.
- The input has a `maxLength` matching the backend cap (generous — e.g. 100 characters).

On save: a Server Action updates the conversation title; the side nav refreshes with the new title.

**Show All** (Finding 9). Below the conversation list (below the 5th entry), a "Show all" link appears when the user has more than 5 conversations. This respects the prior "no show more in MVP" by relocating the full list to a modal — the side-nav list itself remains capped at 5. Clicking "Show all" opens a **modal** (chosen over a dedicated `/conversations` route for MVP simplicity):

- Title: "Conversations"
- Search input at the top: "Search conversations…" (filters by title, case-insensitive substring match, as the user types)
- Full scrollable list of all conversations (not capped at 5); each entry shows its title and a relative last-activity timestamp (the same relative-time treatment as side-nav timestamps — Story 7.5).
- Clicking a conversation navigates to it and closes the modal.
- The modal uses the standard dialog pattern (§Accessibility Floor — focus trap, `Escape` to close, focus returns to the "Show all" trigger).

### Artifact Browser Layout States

The Artifact Browser is a single route with two distinct layout states:

- **No artifact selected:** full-width flat list of all artifacts from `_bmad-output/`, sorted by last-modified date descending (most recently committed at top). The list occupies the full content area.
- **Artifact selected:** list narrows to 280px; the rendered artifact occupies the remaining content area. Entering this state via a Project Map click or Semantic Pill "View" link pre-selects the artifact and applies the detail layout immediately.

No section separation between completed and in-progress artifacts (flat list and ordering confirmed by Marius, 2026-06-15).

---

## Voice and Tone

bmad-easy speaks with platform-generated text in two contexts: UI chrome (navigation, buttons, status labels) and status messages (loading states, errors, confirmations). Agent responses are the agent's own voice — the platform does not editorialize, wrap, or subtitle them.

**Platform voice:** Direct, calm, minimal. Fragments over full sentences in status text. Plain language over git or developer vocabulary — users do not need to know what a "sandbox" or "commit" is; they need to know their work is safe.

| Developer vocabulary | Platform vocabulary |
|---|---|
| Commit | Save / Progress saved |
| Sandbox provisioning | Starting session |
| Cloning repository | (hidden — transparent to user) |
| Working tree dirty | Unsaved changes |
| Working tree clean | All saved |
| PAT / Personal Access Token | Access token |
| `_bmad-output/` | (not surfaced) |

**Error messages:** State what happened and what to do next. Never show stack traces, HTTP codes, or internal identifiers to end users. Example: "Couldn't connect to your repository. Check that your access token is still valid." not "403 Forbidden."

**Loading states:** Use present-continuous progressive labels. "Starting session…" not "Loading." "Saving…" not "Please wait."

**Empty states:** Prompt action rather than describe absence. "Start your first conversation to create an artifact." not "No artifacts found."

---

## Component Patterns

Behavioral specifications for key components. Visual specifications are in DESIGN.md.

### Slash Command Picker

Triggered when the user types `/` in the chat input. Appears as a dropdown anchored above the input field. Behavior:

- Displays all available skills from the connected repository's `.claude/skills/` directory.
- Filterable: further typing after `/` narrows the list by skill name prefix.
- Keyboard-navigable: Arrow keys move focus within the list; Enter selects the focused skill; Escape dismisses without selecting.
- Selecting a skill appends the full slash command to the input and focuses the textarea. The user may then type context or send immediately.
- If no skills are found (empty skills directory), the picker displays: "No skills found in this repository."
- The picker is dismissed by clicking outside it or pressing Escape.

### Streaming Chat Messages

Agent responses render progressively as tokens arrive. Markdown is rendered during streaming — headings, lists, code blocks, bold/italic, tables appear formatted as they stream in, not as raw text that transforms on completion.

During streaming:
- The agent message area shows a blinking cursor at the insertion point.
- A **thinking indicator** (three-dot animation) appears above the streaming text when the agent is processing between tool calls but not yet emitting tokens.
- A **tool execution indicator** ("Running…" label + tool name) appears in the stream at the point a tool call begins, replaced by the completed Tool Pill when the call resolves.
- These two indicators are visually distinct: thinking = dots; tool execution = labeled inline in the stream.

After streaming completes: cursor disappears, copy action becomes available on hover.

**Timestamps:** Relative time is the primary display on both user and agent messages — "just now" under 1 minute, "X minutes ago" 1–59 min, "X hours ago" 1–23 hr, "yesterday"/"X days ago" 24 hr–6 days, absolute date (e.g. "Jul 8") at 7 days and beyond. Absolute time remains accessible via hover but is not prominent. User message timestamps remain hover-only; agent message timestamps remain low-prominence inline. Relative timestamps update live (interval tick) while the conversation view is open. (Extended 2026-07-13 per Story 7.5 — supersedes the prior "just now under 1 minute" only rule; previously older messages showed wall-clock time.)

### Tool Pills and Semantic Pills

Tool Pills appear inline in the message stream at the position where the agent tool call occurred — not in a sidebar or separate panel. They are part of the conversation history and scroll with it.

**Tool Pill expand behavior:** Clicking a Tool Pill toggles an inline expanded view showing the tool input parameters and output, formatted in monospace at `{typography.scale.xs}`. Clicking again collapses it. The expanded state does not affect surrounding message layout (it grows in place).

**Semantic Pill:** A git commit by the agent produces a Semantic Pill instead of a plain Tool Pill. The Semantic Pill contains:
1. "Progress saved" label
2. Artifact type and title (derived from commit metadata)
3. "View" link — opens Artifact Browser pre-selected to the committed artifact

The "View" link opens the Artifact Browser in the same tab; a breadcrumb back to the Conversation is available.

Multiple commits in a single Conversation each produce a distinct Semantic Pill at their respective positions in the stream.

### Working Tree Indicator

Displayed in the chat input area, left-aligned below the textarea. Two states:

**Dirty (uncommitted changes exist):**
- Label: `● Unsaved changes`
- Color: `{colors.caution}`
- Background pill: `{colors.caution-bg}`
- Interactive: clicking opens a confirmation tooltip with a "Save" button
- A separate small "ⓘ" info affordance sits beside the label, dirty state only. It is its own focusable element (Tab reaches it independently of the indicator label), `aria-label="Why does this matter?"`. Activating it (click, Enter, or Space) shows a tooltip/popover: "Unsaved changes are lost if you close this page or your session restarts. Saving commits them permanently to your repository." This is deliberately a separate interactive target from the label, not a hover-only tooltip on the label itself — a hover-only affordance would be unreachable by keyboard, and Enter/Space on the label must always open the Save confirmation, never the info text.

**Clean (no uncommitted changes):**
- Label: `✓ All saved`
- Color: `{colors.text-2}`
- Not interactive

**Hidden:** when no session is active (New Conversation before first message sent).

**Save confirmation flow:**
1. User clicks the dirty indicator.
2. A small popover appears above it with: "Save current progress?" and a "Save" button and "Cancel" link.
3. User confirms → platform commits silently; indicator transitions to clean; a manual-save Semantic Pill appears in the chat at the position of the save event.
4. If an agent turn is in progress when Save is triggered: the indicator shows "Saving after response…" and the commit fires when the agent next becomes idle.

### Artifact List (Artifact Browser)

Flat list, no grouping. Each entry:
- Artifact type label (e.g. "PRD", "Brainstorming") — `{typography.scale.xs}`, `{colors.text-2}`, uppercase
- Artifact title — `{typography.scale.sm}`, semibold, `{colors.text-1}`
- Status badge — in-progress or completed per DESIGN.md component specs
- Last modified timestamp — `{typography.scale.xs}`, `{colors.text-2}`

Clicking an entry: applies the two-column layout (list at 280px, artifact content in remaining area). The selected entry gets `{colors.surface-raised}` background and a left accent border in `{colors.accent}`.

### Artifact Search and Filter

_(Amendment 2026-07-16 per UX findings — Finding 8.)_

A search/filter control sits at the top of the artifact list, above the list entries. It appears in both Artifact Browser layout states (list-only and list + detail). Components:

- **Search input.** Placeholder: "Search artifacts…". Filters the list by title (case-insensitive substring match) as the user types. A clear button (×) appears inside the input when text is present; activating it (or emptying the input) returns the list to full.
- **Type filter.** A control (pill buttons or a dropdown) to filter by artifact type (PRD, Brainstorming, Architecture, etc.). "All" is the default and shows every type.

Filter state:

- Filter state persists in URL query params (`?q=search&type=prd`) for shareable filtered views; on load the list honours the query params and applies them.
- When the active filter results in no matches, the list area shows: "No artifacts match your search." (an exception to the Voice and Tone "prompt action" empty-state guidance — the absence is the intended feedback, and the search input itself is the actionable surface).
- Clearing the search text and/or resetting the type filter to "All" returns the list to full.

Implementation note: for MVP this is a client-side filter of the server-rendered artifact list (the list is small — tens of items). Architecture review pending for the query pattern.

### Artifact Card (Project Map)

Artifact Cards (Project Map) and Artifact List entries (Artifact Browser) are two distinct components: cards carry the DESIGN.md `{components.artifact-card}` visual spec and appear only on the Project Map; the Browser's flat list rows are entries, specified under Artifact List above. Card contents (type label, title, status badge) are defined in DESIGN.md.

Behavior:

- The whole card is a single click target — not just the title. Pointer cursor across the full card surface; hover treatment per DESIGN.md.
- Clicking a completed artifact opens the Artifact Browser with that artifact pre-selected (FR-8).
- Clicking an in-progress artifact opens the same read-only Artifact Browser view. Once concurrent Conversations exist (Epic 3), clicking an in-progress artifact that has an already-open Conversation brings that Conversation into focus instead; until then, click behavior is identical for every in-progress artifact.
- The status badge is display-only — it is not an independent click target.

### Credential Error Banner

When credential health status is `failed`, a banner appears at the top of the Project Map, Artifact Browser, and Conversation content areas (not the side nav). On the Conversation surface it is triggered in real time by a failed git operation (see Conversation Surface States). It is non-dismissible until credentials are replaced.

Content: "Your repository connection needs attention. [Update access token]" — the bracketed text is a link that opens the re-auth flow inline (same page, modal dialog, not a separate page navigation).

---

## State Patterns

### Sign In (Pre-App Shell)

Mockup: [mockups/key-signin.html](mockups/key-signin.html)

GitHub is the sole identity provider. There is no separate sign-up screen — a first-time user completes the same GitHub OAuth flow as a returning user; account creation is transparent. `/sign-in` is the only unauthenticated surface.

| State | Display |
|---|---|
| Cold-load | Centered single-column layout on `{colors.bg}`; "Sign in with GitHub" OAuth button is the sole interactive element; no form fields |
| Auth error | Inline error message below the OAuth button (e.g., "Sign-in failed. Try again or contact support."); OAuth button re-enabled |

### New Conversation

Mockup: [mockups/key-new-conversation.html](mockups/key-new-conversation.html) (idle, slash picker, starting session). Error states: [mockups/key-new-conversation-errors.html](mockups/key-new-conversation-errors.html) — session timeout, conversation limit, seat limit, starting session (transient).

Entry point: "New Conversation" button in side nav, or at `/conversations/new`.

- No stable URL until the user sends their first message.
- Chat area shows an introductory prompt as **rendered content centered in the chat-messages panel** (same placement as the happy-path greeting in Story 7.1) — not a textarea placeholder. Copy: "Press `/` to browse available skills, or type a message to start." This is platform copy, not an agent message. It disappears when the user sends their first message. *Amendment 2026-07-16:* the implementation previously rendered this copy only as the chat input's `placeholder` attribute (invisible until the user starts typing); this amendment confirms it is rendered content in the chat area.
- Chat input is active immediately (no waiting state — sandbox provisioning begins when the user lands on this page, in the background).
- If sandbox provisioning is still in progress when the user sends their first message: input is disabled momentarily and the chat area shows "Starting session…" with a spinner until ready, then the message sends automatically.
- On first message send: the page transitions to `/conversations/:id`, the conversation appears in the side nav with its semantic title, and the "New Conversation" page no longer exists for this session.
- Draft persistence: unsent draft in the textarea is persisted to `localStorage` keyed by `new-conversation`. On page refresh, the draft is restored. The draft is cleared immediately on successful send.

**Blocked entry states.** Two conditions block opening a new Conversation. Both display a blocking message in the chat area in place of the introductory prompt; the chat input is not shown. The side nav's New Conversation button stays enabled — the block is communicated on the page, not by disabling navigation. (Inline placement and copy confirmed by Marius, 2026-07-02.)

| State | Trigger | Display |
|---|---|---|
| Conversation limit reached | User already has 10 active Conversations — the per-user maximum (FR-11's "session limit reached" message, phrased in platform vocabulary) | "You've reached the limit of 10 active conversations. Return to one of your existing conversations, or try again later." No upgrade action — this limit applies to every plan. |
| Seat limit exceeded | User's team has exceeded its Seat allocation (FR-9) | "Your team has used all of its seats. Upgrade your plan to start new conversations." with an upgrade prompt. The upgrade action's destination is post-MVP billing; in MVP all users have full access (FR-19), so this state is specified but not reachable until billing ships. |

**Session start timeout.** If session start-up never completes (the backend's `SESSION_READY` signal never arrives) within a client-side timeout — distinct from the server-side idle timeout that tears down an unused Sandbox — the spinner and "Starting session…" label are replaced, in the same chat area, by: "Starting your session is taking longer than expected." with a **Retry** button. Clicking Retry re-attempts session start-up. This does not disable the side nav's New Conversation button. The same treatment applies if reconnection stalls past the equivalent timeout during Conversation Loading (Returning), below — one consistent pattern for both cases.

### Conversation Loading (Returning)

When a user opens an existing Conversation from the side nav or a direct URL:

1. Chat history loads immediately from platform storage.
2. If the underlying sandbox requires re-initialization (e.g. session expired): a status label "Reconnecting…" appears in the chat input area (input disabled). The user sees full chat history during reconnection. Input re-enables when ready.
3. If reconnection never completes within the client-side timeout: the "Reconnecting…" label and chat history give way to the same Session start timeout treatment described above ("Starting your session is taking longer than expected." with a **Retry** button) — chat history remains visible above it.
4. Working tree indicator reflects the current git state once the session is active.

### Conversation Surface States

Mockup: [mockups/key-conversation.html](mockups/key-conversation.html) (active state). Error states: [mockups/key-conversation-errors.html](mockups/key-conversation-errors.html) — all 7 error states rendered in full page context.

| State | Display |
|---|---|
| Cold-load (history loading) | Chat history area shows a skeleton loader; input disabled until history is ready |
| Error (history load failure) | Content area shows "Couldn't load this conversation. Try refreshing the page." with a Refresh button |
| Reconnecting (sandbox re-init) | Full history visible; input disabled with "Reconnecting…" label in the input area |
| Active / idle | Full history; input enabled; working tree indicator visible |
| Credential failed (mid-Conversation) | The failing git operation renders as an error-state Tool Pill in the stream; simultaneously, the Credential Error Banner appears above the message panel — same component and inline re-auth flow as Project Map and Artifact Browser — in real time, without requiring navigation or a page reload. The banner clears once credentials are updated. (Banner reuse confirmed by Marius, 2026-07-02.) |
| Access denied (mid-Conversation) | A 403 is not a credential failure (per FINDING-12) — the Credential Error Banner does NOT appear and no re-auth prompt is shown, because re-authentication resolves none of the three 403 causes. Instead the failing git operation renders as an error-state Tool Pill (same as the credential-failed state), with an Access Notice (`{components.access-notice}`, background `{colors.caution-bg}` or `{colors.negative-bg}` for `INSUFFICIENT_PERMISSION`, left border `{colors.caution}` / `{colors.negative}`) inline in the message stream directly below the failing pill. The notice copy is derived from the `ACCESS_DENIED` event's `code`: `RATE_LIMITED` → "GitHub is rate-limiting this request. Wait a moment and try again." (with a retry hint when `retryAfter` is present); `ORG_RESTRICTION` → "Your organization hasn't approved this app. Ask an org admin to grant access."; `INSUFFICIENT_PERMISSION` → "Your account doesn't have access to this resource." The raw GitHub error text remains available in the Tool Pill's expanded output. The notice is dismissible (unlike the Credential Error Banner) and does not block the input — the agent turn continues; the tool call's error result is returned to the agent, which adapts. (Event contract defined in architecture.md; parallels the credential-failed row added 2026-07-02; tokens resolved 2026-07-08.) |
| Agent process terminated (circuit breaker) | Distinct from a single failed tool call (which produces only an error-state Tool Pill and lets the agent keep working, per the Tool Pills and Semantic Pills pattern): when `sandbox-agent` crashes or stalls and the backend's circuit breaker terminates the whole Claude Code agent process, the entire in-flight turn ends. A system message (platform copy, not an agent message, same visual treatment as the "Couldn't load…" error copy elsewhere) appears at the point the stream stopped: "The agent stopped unexpectedly. Send a new message to try again." Any partial streamed response already rendered stays visible above it — it is not retracted. Input re-enables (Agent Processing state returns to Idle); no automatic retry. |

### Agent Processing States

| State | Input | Stop button | Indicator |
|---|---|---|---|
| Idle | Enabled | Hidden | Working tree indicator visible |
| Thinking | Disabled | Visible | Three-dot animation in message stream |
| Tool executing | Disabled | Visible | Inline tool execution label in stream |
| Streaming response | Disabled | Visible | Cursor at stream position |

The Stop button terminates the in-flight response and any tool execution, but does not terminate the sandbox. After Stop, state returns to Idle and the user can send a new message. An agent-process termination by the backend circuit breaker (see Conversation Surface States) returns to Idle the same way, but is not user-initiated and is announced by the system message described there rather than by the user's own Stop action.

### Project Map States

Mockup: [mockups/key-project-map.html](mockups/key-project-map.html)

| State | Display |
|---|---|
| Loading | Skeleton cards in the artifact list area |
| Empty (no artifacts) | Empty state illustration + "Start your first conversation to create an artifact." |
| Populated | Artifact card list |
| Credential failed | Credential error banner above artifact list |
| Refreshing | Refresh indicator (spinner replacing the manual refresh icon) |

### Artifact Browser States

Mockup: [mockups/key-artifact-browser.html](mockups/key-artifact-browser.html)

| State | Display |
|---|---|
| List only (no artifact selected) | Full-width flat artifact list; no right pane |
| List + detail (artifact selected) | List narrows to 280px; rendered Markdown in remaining area; selected entry has `{colors.surface-raised}` background and left accent border |
| Artifact loading | Content pane shows a skeleton loader while the Markdown file is fetched from the Repository |
| Artifact load error | Content pane shows: "Couldn't load this artifact. Try refreshing the page." with a Refresh button |
| Credential failed | Credential error banner above the list (same as Project Map); artifact reads may fail until credentials are refreshed |
| Filtered (search/type) | List shows only entries matching the active search text and type filter; the search input and Type filter are visible at the top of the list; query params reflect filter state *(Amendment 2026-07-16 — Finding 8)* |
| Filtered — no matches | List area shows: "No artifacts match your search." with the search input still active; clearing filters returns the full list *(Amendment 2026-07-16 — Finding 8)* |

### Settings

Mockup: [mockups/key-settings.html](mockups/key-settings.html) *(mockup shows the prior "coming soon" treatment — amended 2026-07-16, see below)*

_(Amendment 2026-07-16 per UX findings — Finding 2. Supersedes the prior "Static 'coming soon' page" text below.)_

The Settings page has two sections: **Repository** and **Coming soon**.

**Repository section.** Shows:

- Connected repository URL — display only (`{typography.scale.sm}`, `{colors.text-1}`), not editable here
- "Disconnect" button — destructive action styling per DESIGN.md

Disconnect flow. Clicking "Disconnect" opens a confirmation dialog using the standard dialog pattern (§Accessibility Floor — focus trap, `Escape` to close, focus returns to the trigger):

- Title: "Disconnect repository?"
- Body: "Disconnecting will end all active conversations. Any unsaved work will be lost. Committed artifacts remain in your repository."
- Actions: "Disconnect" (destructive) and "Cancel"

On confirm: all active sandboxes are terminated; the `RepoConnection` is deleted; the user is redirected to `/onboarding`. (Switching repositories is the same path — disconnect → onboarding, where the user connects the new repository.)

**Coming soon section.** Retains the teaser items (account management, notification preferences) as non-interactive display entries — unchanged from the prior "coming soon" treatment. No loading, empty, or error states required for this section.

### Onboarding Flow States

Mockup: [mockups/key-onboarding.html](mockups/key-onboarding.html)

Single-page flow at `/onboarding`. Steps:

1. **Repository URL** — single text input, validated on blur for URL format only. No access-token field: the GitHub OAuth permission granted at sign-in is what the platform checks against, so the user is not asked for anything else here.
2. **Validating…** — the input becomes read-only, a spinner appears, no redirect until validation completes.
3. **Validation failure** — inline error below the URL field, naming the specific cause in plain language: insufficient permission, an inaccessible repository, or a GitHub org OAuth App restriction (named explicitly — never folded into a generic "couldn't connect" message).
4. **BMAD not found** — blocking message: "This repository hasn't been set up for BMAD yet. Ask a developer to initialise BMAD, then try again. [Learn more]" — links to BMAD documentation.
5. **Success** — redirect to Project Map.

The "Back" action at step 2+ returns to step 1 with the URL preserved.

### Not Found (404)

_(Amendment 2026-07-16 per UX findings — Finding 3.)_

A `not-found.tsx` page at the app root handles unmatched routes (stale bookmarks, typos, deleted-conversation URLs, access-revoked-repo paths). It mirrors the canonical `error.tsx` structure:

- Full page shell; message centered in the content area.
- `<h1 tabIndex={-1}>` for AppShell route-focus management (focus moves to the h1 on render).
- Content: h1 "Page not found"; body "The page you're looking for doesn't exist or may have moved."; a "Go to Project Map" link.
- Respects design tokens (dark-first, same as all surfaces).

Shell context:

- If rendered within the app shell (authenticated route segment), the side nav remains visible and the message appears in the content area.
- If rendered outside the app shell (unauthenticated), the message is a centered single-column layout against `{colors.bg}` — same treatment as Sign In.

No separate mockup — the treatment reuses the existing `error.tsx` centered "full page" layout.

---

## Interaction Primitives

### Chat Input Keyboard Behavior

| Key | Action |
|---|---|
| `Enter` | Send message |
| `Shift+Enter` | Insert newline |
| `/` at start of empty input | Open slash command picker |
| `ArrowUp` / `ArrowDown` in picker | Move focus within skill list |
| `Enter` in picker | Select focused skill |
| `Escape` in picker | Dismiss picker, return focus to input |
| `Escape` in empty input | No action |

### Scroll Behavior (Chat)

- Chat auto-scrolls to the bottom during streaming as new tokens arrive.
- If the user scrolls up during streaming, auto-scroll pauses.
- A **scroll-to-bottom button** appears when the user is not at the bottom. The button is anchored at the bottom-center of the chat content area, above the input. It shows the count of new messages since the user scrolled away, if any (e.g. "3 new messages").
- Clicking the scroll-to-bottom button scrolls to the bottom and re-enables auto-scroll.

### Copy Behavior

- Per-message copy: icon button, appears on hover at the top-right of every message (user and agent). Copies the message's raw text content (not rendered HTML).
- Per-code-block copy: a copy icon button in the top-right corner of each code block within an agent message. Always visible (not hover-only) on code blocks. Copies the block's raw code string.
- Both show a brief "Copied" confirmation label for 1.5 seconds after activation.

### Scroll Model

The app shell is divided into three independently fixed zones:

| Zone | Scroll behavior |
|---|---|
| Side navigation | Fixed — never scrolls |
| Chat input area | Fixed at the bottom of the content area — never scrolls out of view |
| Chat message panel | Scrolls independently between the side nav and the fixed chat input |

The chat message panel occupies the remaining height between the top of the content area and the top of the chat input. It scrolls vertically; the side nav and chat input are always in view regardless of scroll position.

The same principle applies to the Artifact Browser: the artifact list pane and page header are fixed; the selected artifact's Markdown content scrolls independently within the content pane.

### Navigation Transitions

Page transitions are minimal — no full-page animations. The content area updates immediately; the side nav is stationary. No fade, slide, or route transition animation in MVP. [ASSUMPTION: if transition animation is added post-MVP, it must respect `prefers-reduced-motion`.]

### Back Navigation

Depth-1 pages (Conversation, Artifact Browser) display a breadcrumb link "← Project Map" in the page header area. This is a standard link (not the browser back button). Browser back behavior is supported but not the primary affordance.

---

## Accessibility Floor

Behavioral accessibility baseline. Visual contrast ratios are governed by DESIGN.md color token choices.

**Focus management:**
- All interactive elements have a visible focus ring: `{colors.accent}` 2px outline, 2px offset.
- Focus is not suppressed on click; the focus ring is always visible. Exception — navigation surfaces only (sidebar nav items, Project Map artifact cards, Artifact Browser list entries): these use `:focus-visible` so the ring appears on keyboard focus but is suppressed on mouse-click focus. Keyboard focus remains fully visible on every interactive element (WCAG 2.4.7 satisfied). Input and action surfaces (chat input; Run/Retry/Send/Save/Stop buttons; search/filter inputs; tab controls; modal controls; tree/expand-collapse toggles; copy buttons; slash-command picker) retain `:focus` — ring on all focus, never suppressed on click. (Navigation-surface exception added 2026-07-13 per Story 7.4.)
- On route change, focus moves to the page's main heading `h1` or the first interactive element in the content area.
- Safety net: the global CSS removes the browser default outline only on mouse-click focus (`*:focus:not(:focus-visible) { outline: none; }`); any element that lacks an explicit ring class still shows the browser default outline on keyboard focus, so a forgotten ring class degrades to an unstyled-but-visible indicator rather than no indicator (WCAG 2.4.7).

**Keyboard navigation:**
- The full interface is navigable by keyboard.
- Side nav is in natural tab order before the content area.
- Slash command picker is keyboard-navigable (arrow keys, Enter, Escape) per Interaction Primitives.
- Dialog/modal (re-auth, save confirmation): focus traps inside while open; Escape dismisses; focus returns to the trigger on close.
- Working Tree Indicator's info affordance (dirty state) is independently reachable by Tab, separate from the indicator label's own tab stop — Enter/Space on the label always opens Save confirmation; Enter/Space on the info affordance always opens the disclosure text.

**Non-color state indicators:**
- Unsaved working tree state: `●` icon + text label + caution color (three distinct signals — never color alone).
- In-progress artifact status: uses a distinct label and badge border, not just a color difference from completed.
- Error states: always accompanied by a text message and icon, not solely a red border.

**Live regions:**
- The chat message stream is wrapped in `aria-live="polite"`. New messages are announced to screen readers.
- Status messages (loading states, tool execution labels, save confirmations, the agent-process-terminated system message) use `role="status"`.
- The working tree indicator uses `aria-live="polite"` so state changes are announced.

**Motion:**
- Streaming token rendering: respects `prefers-reduced-motion`. If reduced motion is preferred, content appears without a typing-cursor animation.
- The three-dot thinking indicator: static display (no animation) under `prefers-reduced-motion`.
- No other motion in MVP beyond these two.

**Text alternatives:**
- Avatar circles with user initials provide an `aria-label` with the user's name.
- Icon-only buttons (copy, scroll-to-bottom) have `aria-label`.

---

## Key Flows

Named-protagonist journeys derived from PRD §2.3. Protagonist and context are preserved verbatim.

---

### Flow 1 — Sarah Connects the Repository

**Protagonist:** Sarah — PM at a 40-person SaaS company. The developer shared bmad-easy with her after growing tired of being the BMAD intermediary. She has just signed in with GitHub for the first time and is on the onboarding screen.

1. Sarah opens bmad-easy. She has no connected repository. She lands at `/onboarding`.
2. The onboarding surface shows a single field: "Repository URL." She pastes her team's repository URL and clicks "Connect" — she isn't asked for a token; the GitHub permission she already granted at sign-in is what the platform uses.
3. The field goes read-only and "Validating…" appears. After a moment, the platform confirms BMAD is initialised and her OAuth-granted access has write permission to the repository.
4. *(Climax)* She is redirected to the Project Map. The artifact list loads: a brainstorming session the developer ran two weeks ago, a draft brief that was never finished. Sarah sees the team's BMAD work at a glance, without opening GitHub.
5. The New Conversation button and the sidebar are visible. Sarah is oriented: she knows what has been done, and her next action is obvious.

**Edge path — BMAD not found:** If the repository exists but `_bmad/` is absent, the platform blocks at step 3 with a non-dismissible message: "This repository hasn't been set up for BMAD yet. Ask a developer to initialise BMAD, then try again." with a link to BMAD documentation. Sarah cannot proceed until a developer resolves this.

**Edge path — org OAuth App restriction:** If Sarah's GitHub organization has restricted OAuth App access, the write-access check at step 3 fails with an inline error naming the restriction explicitly — not a generic "couldn't connect" message — and tells her an org owner must approve the bmad-easy OAuth App before she can proceed.

---

### Flow 2 — Sarah Runs a PRD Skill and Sees It Committed

**Protagonist:** Sarah — now on the Project Map, repository connected. The team has a brainstorming artifact she wants to turn into a PRD.

1. Sarah clicks "New Conversation" in the side nav. She lands on `/conversations/new`. The chat area shows the prompt "Press `/` to browse available skills, or type a message to start." Behind the scenes, the sandbox is provisioning.
2. She types `/bmad` and the slash command picker opens, filtered to skills beginning with "bmad". She selects `/bmad-prd`.
3. The command appears in the input. She sends it. The page transitions to `/conversations/:id`. "Starting session…" appears briefly (the sandbox was already provisioning; it is ready within seconds).
4. The agent takes on the BMAD PM persona defined by the `bmad-prd` skill and begins the PRD discovery process. Sarah reads the questions and responds, conversing across multiple turns over about 20 minutes.
5. Throughout the session, Tool Pills appear inline in the stream as the agent reads files from the repository, references the brainstorming artifact, and writes draft content.
6. The agent completes the PRD and commits it. A Semantic Pill appears inline in the stream: "Progress saved · PRD draft · **View**."
7. *(Climax)* Sarah clicks "View." The Artifact Browser opens in the same tab, the PRD pre-selected, rendered as clean Markdown. She reads through it. Her name appears as the commit author in git history — the same identity that will appear when her developer teammates pull the branch.
8. She navigates back via the "← Project Map" breadcrumb, then reopens her conversation from the side nav.

**Edge path — working tree dirty at close:** If Sarah closes the tab before the agent commits, the working tree indicator (Unsaved changes) would have been visible. Any work the agent produced but did not commit is not guaranteed to survive a sandbox restart — this is disclosed to users via help text accessible from the indicator.

---

### Flow 3 — Sarah Reads a Teammate's Artifact Before a Meeting

**Protagonist:** Sarah — her developer teammate committed an architecture document through local Claude Code. Sarah wants to read it before a planning meeting. She's authenticated, Project Map visible.

1. Sarah opens the Project Map (`/`). She sees the architecture document listed as a completed artifact.
2. She clicks it. The Artifact Browser opens with the two-column layout: the artifact list narrows to 280px on the left; the architecture document renders as Markdown in the remaining area.
3. *(Climax)* She reads the document in clean, uninterrupted Markdown — no GitHub file navigation, no repository sidebar, no raw text. The document looks the same as anything her team would produce through the platform itself.
4. The meeting starts. She has the context she needs.

**No edge case here — this is the simplest flow.** If the document fails to load (git read failure), the content area shows: "Couldn't load this artifact. Try refreshing the page." with a Refresh button.
