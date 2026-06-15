---
title: "EXPERIENCE: bmad-easy"
status: draft
created: 2026-06-15
updated: 2026-06-15
sources:
  - _bmad-output/navigation.md
  - _bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md
  - _bmad-output/planning-artifacts/briefs/brief-bmad-easy-2026-06-12/brief.md
---

# EXPERIENCE: bmad-easy

## Foundation

**Form factor:** Web application, modern browser, desktop-first. Minimum supported viewport: 1024px wide. Tablet (768px–1023px) supported with a collapsed side navigation; mobile is out of scope for MVP.

**UI system:** React + Tailwind CSS. No named component library. DESIGN.md tokens are the visual identity reference; all color, typography, spacing, and shape decisions defer to it.

**Dark mode:** Default and only mode for MVP. Light mode is post-MVP.

**Rendering stack:** Markdown rendered in agent messages using a streaming-compatible Markdown library. All user-visible text outside agent messages is platform UI copy, not Markdown.

**DESIGN.md reference:** Visual identity (color tokens, typography, radii, component specifications) is fully defined in DESIGN.md. This document specifies behavior, information architecture, states, and interactions only. DESIGN.md tokens are referenced as `{colors.*}`, `{typography.*}`, etc.

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
| Settings | `/settings` | Placeholder — empty "coming soon" |

**Depth model:** Project Map is the root (depth 0). Conversation and Artifact Browser are one level down (depth 1). Breadcrumb navigation is one level deep: depth-1 pages show "← Project Map" in their header. No deeper nesting.

### Side Navigation

Always visible in the app shell. Contents, top to bottom:

1. Product wordmark
2. **New Conversation** button — primary action; always accessible
3. Conversation list — last 5 conversations, each labeled with its 2–5 word semantic title. Labeled with `text-2`; active conversation highlighted. Below the 5th entry, no additional history is shown (no "show more" in MVP).
4. Horizontal separator
5. **Project Map** link
6. **Artifact Browser** link
7. _(bottom-pinned)_ **Settings** — represented as the user's avatar circle

Active state: the current surface's nav item has `{colors.surface-raised}` background and `{colors.text-1}` text color. All inactive items use `{colors.text-2}`.

No nested items. No expand/collapse. No icon-only collapsed state (collapsed nav is a tablet-only behavior, implemented as an off-canvas drawer triggered by a hamburger button in the app header).

### Artifact Browser States

The Artifact Browser is a single route with two distinct layout states:

- **No artifact selected:** full-width flat list of all artifacts from `_bmad-output/`, sorted by last-modified date descending. The list occupies the full content area.
- **Artifact selected:** list narrows to 280px; the rendered artifact occupies the remaining content area. Entering this state via a Project Map click or Semantic Pill "View" link pre-selects the artifact and applies the detail layout immediately.

Artifact ordering in the list: last-modified date descending (most recently committed at top). Confirmed by Marius 2026-06-15; no section separation between completed and in-progress artifacts.

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

**Clean (no uncommitted changes):**
- Label: `✓ All saved`
- Color: `{colors.text-3}`
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
- Last modified timestamp — `{typography.scale.xs}`, `{colors.text-3}`

Clicking an entry: applies the two-column layout (list at 280px, artifact content in remaining area). The selected entry gets `{colors.surface-raised}` background and a left accent border in `{colors.accent}`.

### Credential Error Banner

When credential health status is `failed`, a banner appears at the top of the Project Map and Artifact Browser content areas (not the side nav). It is non-dismissible until credentials are replaced.

Content: "Your repository connection needs attention. [Update access token]" — the bracketed text is a link that opens the re-auth flow inline (same page, modal dialog, not a separate page navigation).

---

## State Patterns

### Sign In (Pre-App Shell)

GitHub is the sole identity provider. There is no separate sign-up screen — a first-time user completes the same GitHub OAuth flow as a returning user; account creation is transparent. `/sign-in` is the only unauthenticated surface.

| State | Display |
|---|---|
| Cold-load | Centered single-column layout on `{colors.bg}`; "Sign in with GitHub" OAuth button is the sole interactive element; no form fields |
| Auth error | Inline error message below the OAuth button (e.g., "Sign-in failed. Try again or contact support."); OAuth button re-enabled |

### New Conversation

Entry point: "New Conversation" button in side nav, or at `/conversations/new`.

- No stable URL until the user sends their first message.
- Chat area shows an introductory prompt: "Press `/` to browse available skills, or type a message to start." This is platform copy, not an agent message.
- Chat input is active immediately (no waiting state — sandbox provisioning begins when the user lands on this page, in the background).
- If sandbox provisioning is still in progress when the user sends their first message: input is disabled momentarily and the chat area shows "Starting session…" with a spinner until ready, then the message sends automatically.
- On first message send: the page transitions to `/conversations/:id`, the conversation appears in the side nav with its semantic title, and the "New Conversation" page no longer exists for this session.
- Draft persistence: unsent draft in the textarea is persisted to `localStorage` keyed by `new-conversation`. On page refresh, the draft is restored. The draft is cleared immediately on successful send.

### Conversation Loading (Returning)

When a user opens an existing Conversation from the side nav or a direct URL:

1. Chat history loads immediately from platform storage.
2. If the underlying sandbox requires re-initialization (e.g. session expired): a status label "Reconnecting…" appears in the chat input area (input disabled). The user sees full chat history during reconnection. Input re-enables when ready.
3. Working tree indicator reflects the current git state once the session is active.

### Conversation Surface States

| State | Display |
|---|---|
| Cold-load (history loading) | Chat history area shows a skeleton loader; input disabled until history is ready |
| Error (history load failure) | Content area shows "Couldn't load this conversation. Try refreshing the page." with a Refresh button |
| Reconnecting (sandbox re-init) | Full history visible; input disabled with "Reconnecting…" label in the input area |
| Active / idle | Full history; input enabled; working tree indicator visible |

### Agent Processing States

| State | Input | Stop button | Indicator |
|---|---|---|---|
| Idle | Enabled | Hidden | Working tree indicator visible |
| Thinking | Disabled | Visible | Three-dot animation in message stream |
| Tool executing | Disabled | Visible | Inline tool execution label in stream |
| Streaming response | Disabled | Visible | Cursor at stream position |

The Stop button terminates the in-flight response and any tool execution, but does not terminate the sandbox. After Stop, state returns to Idle and the user can send a new message.

### Project Map States

| State | Display |
|---|---|
| Loading | Skeleton cards in the artifact list area |
| Empty (no artifacts) | Empty state illustration + "Start your first conversation to create an artifact." |
| Populated | Artifact card list |
| Credential failed | Credential error banner above artifact list |
| Refreshing | Refresh indicator (spinner replacing the manual refresh icon) |

### Artifact Browser States

| State | Display |
|---|---|
| List only (no artifact selected) | Full-width flat artifact list; no right pane |
| List + detail (artifact selected) | List narrows to 280px; rendered Markdown in remaining area; selected entry has `{colors.surface-raised}` background and left accent border |
| Artifact loading | Content pane shows a skeleton loader while the Markdown file is fetched from the Repository |
| Artifact load error | Content pane shows: "Couldn't load this artifact. Try refreshing the page." with a Refresh button |
| Credential failed | Credential error banner above the list (same as Project Map); artifact reads may fail until credentials are refreshed |

### Settings

Static "coming soon" page. No loading, empty, or error states required — content is platform copy only.

### Onboarding Flow States

Single-page flow at `/onboarding`. Steps:

1. **Repository URL** — text input, validated on blur for URL format only.
2. **Access token** — password input (masked). Platform shows a contextual link: "How to generate an access token" → GitHub documentation. Opens in a new tab.
3. **Validating…** — both inputs become read-only, a spinner appears, no redirect until validation completes.
4. **Validation failure** — inline error below the relevant field (URL field or token field depending on failure type). Error text uses plain language per the Voice and Tone section.
5. **BMAD not found** — blocking message: "This repository hasn't been set up for BMAD yet. Ask a developer to initialise BMAD, then try again. [Learn more]" — links to BMAD documentation.
6. **Success** — redirect to Project Map.

The "Back" action at step 3+ returns to step 1 with inputs preserved (except the token, which is cleared for security reasons).

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
- Focus is not suppressed on click; the focus ring is always visible.
- On route change, focus moves to the page's main heading `h1` or the first interactive element in the content area.

**Keyboard navigation:**
- The full interface is navigable by keyboard.
- Side nav is in natural tab order before the content area.
- Slash command picker is keyboard-navigable (arrow keys, Enter, Escape) per Interaction Primitives.
- Dialog/modal (re-auth, save confirmation): focus traps inside while open; Escape dismisses; focus returns to the trigger on close.

**Non-color state indicators:**
- Unsaved working tree state: `●` icon + text label + caution color (three distinct signals — never color alone).
- In-progress artifact status: uses a distinct label and badge border, not just a color difference from completed.
- Error states: always accompanied by a text message and icon, not solely a red border.

**Live regions:**
- The chat message stream is wrapped in `aria-live="polite"`. New messages are announced to screen readers.
- Status messages (loading states, tool execution labels, save confirmations) use `role="status"`.
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
2. The onboarding surface shows two fields: "Repository URL" and "Access token." There is a contextual link: "How to generate an access token" — she clicks it and generates a fine-grained GitHub PAT with `contents:write` scope. She returns to the tab.
3. She pastes the repository URL and the token into the respective fields and clicks "Connect."
4. The fields go read-only and "Validating…" appears. After a moment, the platform confirms BMAD is initialised and the token has write access.
5. *(Climax)* She is redirected to the Project Map. The artifact list loads: a brainstorming session the developer ran two weeks ago, a draft brief that was never finished. Sarah sees the team's BMAD work at a glance, without opening GitHub.
6. The New Conversation button and the sidebar are visible. Sarah is oriented: she knows what has been done, and her next action is obvious.

**Edge path — BMAD not found:** If the repository exists but `_bmad/` is absent, the platform blocks at step 4 with a non-dismissible message: "This repository hasn't been set up for BMAD yet. Ask a developer to initialise BMAD, then try again." with a link to BMAD documentation. Sarah cannot proceed until a developer resolves this.

---

### Flow 2 — Sarah Runs a PRD Skill and Sees It Committed

**Protagonist:** Sarah — now on the Project Map, repository connected. The team has a brainstorming artifact she wants to turn into a PRD.

1. Sarah clicks "New Conversation" in the side nav. She lands on `/conversations/new`. The chat area shows the prompt "Press `/` to browse available skills, or type a message to start." Behind the scenes, the sandbox is provisioning.
2. She types `/bmad` and the slash command picker opens, filtered to skills beginning with "bmad". She selects `/bmad-prd`.
3. The command appears in the input. She sends it. The page transitions to `/conversations/:id`. "Starting session…" flickers briefly (the sandbox was already provisioning; it is ready within seconds).
4. The agent takes on the BMAD PM persona defined by the `bmad-prd` skill and begins the PRD discovery process. Sarah reads the questions and responds, conversing across multiple turns over about 20 minutes.
5. Throughout the session, Tool Pills appear inline in the stream as the agent reads files from the repository, references the brainstorming artifact, and writes draft content.
6. The agent completes the PRD and commits it. A Semantic Pill appears inline in the stream: "Progress saved · PRD draft · **View**."
7. *(Climax)* Sarah clicks "View." The Artifact Browser opens in the same tab, the PRD pre-selected, rendered as clean Markdown. She reads through it. Her name appears as the commit author in git history — the same identity that will appear when her developer teammates pull the branch.
8. She navigates back to the Conversation via the breadcrumb "← Project Map" → then finds her conversation in the side nav.

**Edge path — working tree dirty at close:** If Sarah closes the tab before the agent commits, the working tree indicator (Unsaved changes) would have been visible. Any work the agent produced but did not commit is not guaranteed to survive a sandbox restart — this is disclosed to users via help text accessible from the indicator.

---

### Flow 3 — Sarah Reads a Teammate's Artifact Before a Meeting

**Protagonist:** Sarah — her developer teammate committed an architecture document through local Claude Code. Sarah wants to read it before a planning meeting. She's authenticated, Project Map visible.

1. Sarah opens the Project Map (`/`). She sees the architecture document listed as a completed artifact.
2. She clicks it. The Artifact Browser opens with the two-column layout: the artifact list narrows to 280px on the left; the architecture document renders as Markdown in the remaining area.
3. *(Climax)* She reads the document in clean, uninterrupted Markdown — no GitHub file navigation, no repository sidebar, no raw text. The document looks the same as anything her team would produce through the platform itself.
4. The meeting starts. She has the context she needs.

**No edge case here — this is the simplest flow.** If the document fails to load (git read failure), the content area shows: "Couldn't load this artifact. Try refreshing the page." with a Refresh button.
