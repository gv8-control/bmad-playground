# Epic 5: UX Mockup Fidelity — Close Visual Drift

A comprehensive audit (`_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md`) identified 102 findings of visual drift between the authoritative UX mockups (7 HTML files + DESIGN.md + EXPERIENCE.md) and the implemented application across all 7 surfaces and the shared shell. Token values match exactly (42/42); the drift is structural (missing containers, wrong layouts), token-usage (wrong tokens applied), and copy-level. This epic closes the drift by restoring missing visual containers, fixing structural divergences, correcting token-usage, and addressing token-config gaps. The mockups are authoritative; the code aligns to them.

## Story 5.1: Restore Missing Visual Containers Across Surfaces

As a user,
I want each screen to match its designed visual container structure,
So that the app looks polished and intentional rather than unfinished.

**Acceptance Criteria:**

**Given** the sign-in page
**When** it renders
**Then** a bordered auth card (`bg-surface border border-border rounded-xl p-8`) wraps the OAuth button, with a brand logo box above the heading, a heading, and a legal footer — matching the mockup structure (investigation: `apps/web/src/app/sign-in/page.tsx:17-43` vs `ux-designs/.../mockups/key-signin.html:79-91,105-115`)
**And** the auth card, logo box, heading, and footer are not present in the current implementation and must be added

**Given** the onboarding Repository URL input
**When** it renders
**Then** the input and its supporting copy sit inside a form panel (`bg-surface border border-border rounded-xl p-7`) — matching the mockup (investigation: `apps/web/src/components/onboarding/RepositoryUrlForm.tsx:39,55-69` vs `key-onboarding.html:98-106`)

**Given** the onboarding BMAD-initialization-failed / repository-not-found blocking state
**When** it is shown
**Then** a styled panel (`bg-negative-bg border border-negative rounded-lg p-4`) renders with the blocking message and documentation link — not a plain inline message (investigation: `RepositoryUrlForm.tsx:55-69` vs `key-onboarding.html:213-233`)

**Given** the Settings page
**When** it renders
**Then** the designed "coming soon" empty-state is present (icon, title, body, teaser items) — not a bare placeholder (investigation: `apps/web/src/app/settings/page.tsx:10-12` vs `key-settings.html:184-247,304-332`)

**Given** an artifact selected in the Artifact Browser
**When** the artifact has frontmatter metadata
**Then** a frontmatter metadata badge renders in `ArtifactViewer` showing the metadata fields — not absent (investigation: `apps/web/src/components/artifact-browser/ArtifactViewer.tsx:9-11,89-103` vs `key-artifact-browser.html:264-297,446-456`)

**Given** the conversation chat input area
**When** it renders
**Then** the textarea, Send button, and WorkingTreeIndicator sit inside a single bordered `chat-input-box` container — not as sibling elements in the input zone (investigation: `apps/web/src/components/conversation/ChatInput.tsx:59-94` vs `key-conversation.html:326-334`)

## Story 5.2: Fix Shared Shell and Page-Header Structural Drift

As a user navigating the platform,
I want the shell and page headers to match the design,
So that navigation feels consistent and polished on every page.

**Acceptance Criteria:**

**Given** the side navigation brand mark
**When** it renders
**Then** it shows a wordmark `bmad·easy` with an accent-colored interpunct between the words — not `bmad-easy` (investigation: `apps/web/src/components/shell/SideNavigation.tsx:30-31` vs `key-project-map.html:78-79`)

**Given** the bottom-pinned settings entry in the side navigation
**When** it renders
**Then** a visible "Settings" text label appears next to the avatar circle — not avatar-only (investigation: `SideNavigation.tsx:88-99` vs `key-project-map.html:300-303`)

**Given** the Project Map and Artifact Browser links in the side navigation
**When** the conversation list has fewer than 5 entries
**Then** the separator and nav links remain grouped with the conversation list (top-clustered), not pushed toward the bottom of the nav by a flex-grown conversation container — matching the mockup's layout where the separator and nav links sit inside the same flex container as conversations (investigation: `SideNavigation.tsx:41-60` vs `key-project-map.html:96-100,287-298`)

**Given** the active nav item
**When** it renders
**Then** it uses the inset pill styling from DESIGN.md, not a full-width bar (investigation: Shell Finding, active-state styling)

**Given** navigation items in the side navigation
**When** they render
**Then** horizontal padding is not doubled relative to the mockup (investigation: Shell Finding, double horizontal padding)
**And** item spacing and alignment match the mockup (investigation: Shell Finding, nav item spacing/alignment)

**Given** a depth-1 page header (Conversation, Artifact Browser, Settings, New Conversation)
**When** it renders
**Then** the Breadcrumb renders inline beside the page title on a single flex row — not stacked above the title as its own row with `py-4` padding (investigation: Shell Finding 14, breadcrumb stacked vs inline)

**Given** depth-1 page headers (Conversation, Artifact Browser, Settings, New Conversation)
**When** they render
**Then** a 1px header bottom divider (`border-b`) is present on each — currently missing on all depth-1 pages (investigation: Shell Finding 15, missing header bottom divider)

## Story 5.3: Fix Conversation Stream Structural Drift

As a user in a conversation,
I want the chat interface to match the design,
So that messages, input, and session states feel integrated and readable.

**Acceptance Criteria:**

**Given** an active conversation
**When** the messages and chat input render
**Then** both are centered in an 824px column (investigation: Conversation Finding, 824px column not centered)

**Given** the new-conversation page with no active conversation
**When** it renders
**Then** the rich empty-state (icon, title, and a `<kbd>` keyboard-hint element) is present — not a simplified/bare placeholder (investigation: Conversation Finding, new-conversation empty-state simplified)

**Given** the session-starting state ("Starting session…")
**When** it renders
**Then** the `SessionStartSpinner` is centered in the chat-messages panel — not rendered in the input area (investigation: Conversation Finding, SessionStartSpinner in wrong zone)

**Given** a disabled Send button (the agent is responding or the input is empty)
**When** it renders
**Then** it uses the muted-surface treatment — not `opacity-50` over the active style (investigation: Conversation Finding, disabled Send button styling)

**Given** conversational micro-drift items
**When** the conversation renders
**Then** placeholders match the mockup copy, the inter-message gap matches the mockup, user-bubble padding matches the mockup, the scroll-to-bottom button text color matches the mockup, and the semantic-pill separator uses the mockup's opacity (investigation: Conversation Findings, copy/placeholder drift)

**Dev Notes:**

- The inline tool/semantic pills AC was split into Story 5.5 because it requires a data model refactor, not just a visual fix. Implement Story 5.5 before or independently of this story — the remaining ACs here are genuine visual drift fixes with no architectural impact.

## Story 5.4: Fix Token-Usage Drift and Token-Config Gaps

As a developer maintaining the design system,
I want tokens used correctly and config gaps closed,
So that drift doesn't recur and the design system is enforced.

**Acceptance Criteria:**

**Given** project-map artifact cards
**When** they are hovered
**Then** the border uses `hover:border-accent` — not `hover:border-text-3` (investigation: Project-Map Finding, token-usage drift)

**Given** the onboarding Repository URL input
**When** it renders
**Then** the input background is `bg-bg` (recessed) — not `bg-surface` (raised) — and the label uses `text-text-1` — not `text-text-2` (investigation: `RepositoryUrlForm.tsx:53` vs `key-onboarding.html:128-135`)

**Given** the Retry and Save buttons in the conversation
**When** they render on an accent surface
**Then** their text color uses `text-accent-fg` — not `text-bg` (investigation: Conversation Finding, token-usage drift on accent buttons)

**Given** artifact-browser list entries
**When** they are hovered or display last-modified dates
**Then** the hover background uses `hover:bg-surface-raised` (no `/60` opacity modifier) and dates use `text-text-3` — not `text-text-2` (investigation: Artifact-Browser Findings, token-usage drift)

**Given** shell hairline dividers
**When** they render
**Then** `border-border-subtle` is replaced with `border-surface-raised` — or, if `border-subtle` is the intended token, it is added to DESIGN.md as a documented token before continued use (investigation: Shell Finding, token-usage drift on hairlines)

**Given** scrollable panels on the 3 affected surfaces (shell, conversation, artifact-browser)
**When** they overflow and scroll
**Then** scrollbars are hidden via `scrollbar-width: none` and `::-webkit-scrollbar { display: none }` defined in `apps/web/src/app/global.css` or as a reusable utility class (investigation: Finding 5 mechanism 5, missing scrollbar hiding)

**Given** the Tailwind config at `apps/web/tailwind.config.ts`
**When** it is updated
**Then** a `boxShadow: { floating: '0 8px 24px rgba(0,0,0,0.4)' }` token is added, matching DESIGN.md line 327 (investigation: Finding 2, gap 2)

**Given** the `WorkingTreeIndicator` component
**When** it renders as a floating element
**Then** it uses the new `floating` box-shadow token — not Tailwind's default `shadow-lg`, which has a different value (investigation: Finding 2, gap 2)

**Given** the Tailwind config at `apps/web/tailwind.config.ts`
**When** it is updated
**Then** a `fontWeight` override is added enforcing the DESIGN.md constraint `regular=400, medium=500, semibold=600` and blocking weights above 600 (e.g. `font-bold`, `font-extrabold`) (investigation: Finding 2, gap 1; DESIGN.md line 445)

**Given** the Tailwind config's use of `theme.extend`
**When** the design-system enforcement is evaluated
**Then** the team considers replacing `extend` for tokenized categories (colors, spacing, radii, font) with full `theme` overrides so non-design-system defaults (`text-red-500`, `bg-gray-400`, `rounded-3xl`, etc.) are no longer available alongside the design system (investigation: Finding 2, gap 3)

**Dev Notes:**

- Replacing `theme.extend` with full `theme` overrides (the final AC) is structural and may surface latent non-design-system usage in existing code. Stage it carefully: grep the codebase for default-palette utilities first, migrate any real uses to design-system tokens, then switch to full overrides so the change is a guardrail, not a regression.
- The ACs above treat token-correctness as the success bar; a pixel-level screenshot diff is called out as Missing Evidence in the investigation and is out of scope for this story.

## Story 5.5: Interleave Tool and Semantic Pills Within the Agent Markdown Stream

As a user watching the Agent work,
I want tool calls and recognized actions to appear inline within the agent's response at the exact position they occurred,
So that I can follow the Agent's reasoning and actions as a single continuous narrative, not as disconnected events above or below the message.

> ⚠️ **ARCHITECTURAL SCOPE WARNING:** This story is NOT a visual/CSS fix. It requires changing the `ChatMessage` data model, SSE event handlers, the agent message rendering pipeline, and the `Turn` persistence format. It was split out of Story 5.3 because its scope is architectural, not visual drift. Cross-reference: Story 3.4 (tool pill ACs), UX-DR5 ("inline chip at the exact stream position of the tool call"), FR-12, DESIGN.md Tool Pill spec, EXPERIENCE.md Tool Pills and Semantic Pills pattern.

**Prerequisites:**

- **Spec cross-references (all already require inline positioning):**
  - FR-12 (epics.md): "Every agent tool call produces an inline Tool Pill at the point of occurrence"
  - UX-DR5 (epics.md): "inline chip at the exact stream position of the tool call"
  - Story 3.4 AC1 (epics.md): "an inline 'Running… [tool name]' label appears in the chat stream at that exact position" + "replaced in place — at the same stream position, with no layout shift"
  - EXPERIENCE.md (line 141): "Tool Pills appear inline in the message stream at the position where the agent tool call occurred"
  - DESIGN.md (line 381): "inline chip in the agent message stream at the exact position the tool call occurred"
- **Investigation reference:** `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md` — Conversation Finding: inline pills rendered as standalone rows
- **Current implementation analysis:**
  - `ChatMessage` type (`apps/web/src/components/conversation/types.ts`): has `toolCall?: ToolCallData` — tool calls are separate flat entries with empty `content`, not interleaved within an agent message's text
  - `ConversationPane.tsx` (lines 314-329): `TOOL_CALL_START` handler pushes a new entry to the `messages` array instead of inserting into the streaming agent message at the current stream position
  - `ChatMessageList.tsx` (lines 84-103): renders tool calls as standalone `<div>` blocks between messages, not inline within markdown
  - `agent.service.ts` (lines 178-188): persists only `accumulatedText` (flat string) to `Turn.content` — tool call positions are not persisted, meaning resumed conversations lose tool pills entirely

**Acceptance Criteria:**

**Given** an agent is streaming a response and makes a tool call mid-stream
**When** the `TOOL_CALL_START` event arrives
**Then** a "Running… [tool name]" indicator renders inline within the agent's markdown stream at the exact position the tool call occurred — not as a standalone row above or below the message

**Given** a tool call completes during an agent's streaming response
**When** the `TOOL_CALL_RESULT` event arrives
**Then** the "Running…" indicator is replaced in place — at the same stream position, with no layout shift to surrounding content — by the completed Tool Pill showing the tool name and short status

**Given** the Agent performs a `git commit` that is confirmed successful
**When** the commit is recognized
**Then** its Tool Pill is promoted in place to a Semantic Pill ("Progress saved" with artifact type, title, and "View" link) at the same stream position where the tool call occurred

**Given** a tool call fails during an agent's streaming response
**When** the failure is received
**Then** an error-state Tool Pill renders inline at the position where the tool call occurred — not as a standalone row — and the FR-14 working-tree indicator remains dirty if applicable

**Given** an `ACCESS_DENIED` event is received for a failing git operation mid-conversation
**When** the frontend processes it
**Then** the Access Notice renders inline directly below the error-state Tool Pill within the agent's markdown stream — not as a standalone row

**Given** a manual save (Story 3.6) completes during or after an agent's response
**When** the Semantic Pill for the manual save is emitted
**Then** it renders inline at the position in the stream where the save event occurred

**Given** the `ChatMessage` data model
**When** it is updated to support interleaved tool calls
**Then** tool calls are stored as position-marked elements within an agent message's content (not as separate flat array entries with empty `content`), preserving the order they occurred relative to the surrounding text

**Given** the `ConversationPane.tsx` SSE event handlers for `TOOL_CALL_START`, `TOOL_CALL_RESULT`, `TOOL_CALL_PROMOTED`, `CREDENTIAL_FAILURE`, and `ACCESS_DENIED`
**When** they process events
**Then** they insert/update tool call elements within the currently-streaming agent message at the current stream position, not as new entries in the `messages` array

**Given** a conversation is resumed (Story 3.5) after being persisted
**When** the chat history loads from Postgres
**Then** tool pills and semantic pills are restored at their original positions within the agent's messages — not lost or rendered as standalone rows — because the `Turn` persistence format captures tool call positions relative to the message text

**Given** the `AgentMessage` rendering component
**When** it renders an agent message containing interleaved tool calls
**Then** tool pills, semantic pills, and access notices render at their correct positions within the rendered markdown, with no layout shift when expanding/collapsing a pill

**Dev Notes:**

- **Current data model:** `ChatMessage` has `toolCall?: ToolCallData` as an optional property on a flat message entry. Tool calls are stored as separate entries in the `messages` array with empty `content` fields. The fix requires either (a) a `segments` array on agent messages containing `{ type: 'text' | 'tool_call', content, position }` entries, or (b) a position-marked inline format within the message text. Approach (a) is recommended — it's cleaner to render and persists naturally.
- **Backend persistence gap:** `agent.service.ts` currently persists only `accumulatedText` (a flat string) to `Turn.content`. Tool call metadata is not persisted positionally. The developer must determine whether the `Turn` model needs a schema migration (changing `content: String` to a structured format like `Json`) or whether tool call positions can be reconstructed from the SSE event log. If tool calls are not persisted, conversation resume will show text-only messages without pills — a regression from the current behavior (which at least shows them as standalone rows).
- **Event ordering:** Tool call events (`TOOL_CALL_START`, `TOOL_CALL_RESULT`, `TOOL_CALL_PROMOTED`) arrive interleaved with text token events. The current handler treats them as separate message entries. The new handler must insert them into the currently-streaming agent message at the position corresponding to the current text cursor — the point in `accumulatedText` where the tool call interrupted the stream.
- **Scope boundary:** This story does NOT change the SSE event contract, the backend event emission logic, or the `tool-pill-classifier.service.ts` classification logic. It changes only how the frontend stores and renders the events it receives, and how the backend persists turn content for resume.
- **Test coverage impact:** `ConversationPane.test.tsx` has extensive `TOOL_CALL_*` tests (lines 642-940+) that assert pills appear as entries in the `messages` array. These must be updated to assert inline positioning within agent messages instead. Budget time for significant test refactoring.
- **Cross-epic risk:** Stories 3.7 (credential failure), 3.9 (sandbox teardown), and 3.12 (graceful drain) have event handlers that update tool call state by matching `toolCallId` in the flat `messages` array. These update patterns (`m.toolCall && m.toolCall.toolCallId === toolCallId`) must be adapted to work with the new interleaved data model — the `toolCallId` lookup now traverses segments within agent messages, not top-level message entries.
