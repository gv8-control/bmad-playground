# Story 5.3: Fix Conversation Stream Structural Drift

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user in a conversation,
I want the chat interface to match the design,
so that messages, tool calls, and input feel integrated and readable.

## Acceptance Criteria

### AC-1: Inline tool/semantic pills within agent markdown stream (UX-DR5)

**Given** an agent tool call and the resulting Tool Pill or Semantic Pill
**When** it renders in the message stream
**Then** the pill renders inline within the agent's markdown stream at the exact position the tool call occurred
**And** it is not rendered as a standalone row above or below the message (investigation: `apps/web/src/components/conversation/ChatMessageList.tsx:84-103` vs `key-conversation.html:448-451`)
**Note:** This is architecturally significant — see Dev Notes.

### AC-2: 824px column centering for messages and chat input

**Given** an active conversation
**When** the messages and chat input render
**Then** both are centered in an 824px column
**And** the column is horizontally centered within the available panel width (investigation: `ChatMessageList.tsx:60-67` vs `key-conversation.html:218-224,319-325`)

### AC-3: Rich new-conversation empty-state

**Given** the new-conversation page with no active conversation
**When** it renders
**Then** the rich empty-state is present, comprising:
- An icon (✦ character)
- A title "Start a new conversation"
- A `<kbd>` keyboard-hint element showing `/`
**And** it is not a simplified or bare placeholder (investigation: `ChatMessageList.tsx:68-72` vs `key-new-conversation.html:170-209,451-457`)

### AC-4: SessionStartSpinner centered in chat-messages panel

**Given** the session-starting state ("Starting session...")
**When** it renders
**Then** the `SessionStartSpinner` is centered in the chat-messages panel
**And** it is not rendered in the input area (investigation: `apps/web/src/components/conversation/ConversationPane.tsx:909-915` vs `key-new-conversation.html:212-240,459-464`)

### AC-5: Disabled Send button uses muted surface style

**Given** a disabled Send button (the agent is responding or the input is empty)
**When** it renders
**Then** it uses the muted-surface treatment
**And** it does not use `opacity-50` over the active style (investigation: `apps/web/src/components/conversation/ChatInput.tsx:88` vs `key-new-conversation.html:309-314`)

### AC-6: Conversation micro-drift — copy and spacing

**Given** conversational micro-drift items
**When** the conversation renders
**Then** all of the following match the mockup:
- Placeholders use "Message..." (active) and "Message bmad-easy..." (branded), not "Type a message..." (investigation: `ChatInput.tsx:29` vs mockups)
- Inter-message gap is 24px, not 16px (investigation: `AgentMessage.tsx:93`, `UserMessage.tsx:18` vs `key-conversation.html:208-215`)
- User bubble padding is `py-3` (12px), not `py-2` (8px) (investigation: `UserMessage.tsx:24` vs `key-conversation.html:233-238`)
- Scroll-to-bottom button text color is `text-text-2`, not `text-text-1` (investigation: `ScrollToBottomButton.tsx:13`)
- Semantic pill separator uses 0.4 alpha, not full opacity (investigation: `SemanticPill.tsx:44,50` vs `key-conversation.html:314-316`)

### AC-7: New-conversation page header removal

**Given** the new-conversation page
**When** it renders
**Then** the Breadcrumb and h1 header are removed (the mockup omits them)
**And** the conversation view takes the full panel (investigation: `apps/web/src/app/(dashboard)/conversations/new/page.tsx:19-22` vs `key-new-conversation.html:437-519`)
**Note:** Coordinate with Story 5-2 (AC-7) — if 5-2 makes the Breadcrumb inline, this AC simply removes it from the new-conversation page entirely.

### AC-8: Accessibility and focus fixes

**Given** the conversation interface
**When** it renders
**Then** all of the following are true:
- The chat-messages container has `role="log"` (investigation: `ChatMessageList.tsx:64-67` vs `key-conversation.html:433`)
- Markdown links in agent messages have a focus ring (investigation: `AgentMessage.tsx:74-76`)
- The draft localStorage key is `new-conversation`, not `new-conversation-draft` (investigation: `apps/web/src/components/conversation/useDraftPersistence.ts:19-21`)

### AC-9: Send button arrow icon and weight

**Given** the Send button
**When** it renders
**Then** it displays an upward arrow (↑) icon
**And** the button text uses `font-medium` (investigation: `ChatInput.tsx:88-90` vs `key-conversation.html:481-483`)

### AC-10: Slash picker "Skills" header

**Given** the slash command picker
**When** it renders
**Then** a "Skills — type to filter" header is present at the top of the picker
**And** it is not missing (investigation: `apps/web/src/components/conversation/SlashCommandPicker.tsx:31-53` vs `key-new-conversation.html:473`)

### AC-11: Conversation limit copy

**Given** the conversation limit message
**When** it renders
**Then** the copy reads "limit of 10 active conversations"
**And** it does not read "limit of active conversations" (investigation: `ConversationPane.tsx:150-154`)

## Tasks / Subtasks

- [ ] Task 1: Inline tool/semantic pills within agent markdown stream (AC: 1)
  - [ ] 1.1 **Before implementing**: cross-check against Story 3.4 and UX-DR5 ("inline chip at the exact stream position of the tool call") to confirm the data-model change is consistent with the existing spec
  - [ ] 1.2 In `apps/web/src/components/conversation/ChatMessageList.tsx` (lines 84-103), refactor the rendering so `TOOL_CALL` events interleave within the agent's markdown stream at the position they occurred, rather than being emitted as separate standalone rows keyed off the message boundary
  - [ ] 1.3 This likely requires changing how `TOOL_CALL`/recognition events are stored — they must be positionally interleaved with the agent's markdown content, not stored as separate `ChatMessage` entries rendered after the message
  - [ ] 1.4 Verify the result matches `key-conversation.html:448-451` — pills appear inline mid-stream inside the agent's message block

- [ ] Task 2: Center messages and chat input in 824px column (AC: 2)
  - [ ] 2.1 In `apps/web/src/components/conversation/ChatMessageList.tsx` (lines 60-67), wrap the message list in a centered column: `max-w-[824px] mx-auto w-full` (matching `key-conversation.html:218-224,319-325`)
  - [ ] 2.2 Apply the same 824px centering to the chat-input area so messages and input align (coordinate with Story 5-1 AC-6 chat-input-box container)

- [ ] Task 3: Implement rich new-conversation empty-state (AC: 3)
  - [ ] 3.1 In `apps/web/src/components/conversation/ChatMessageList.tsx` (lines 68-72), replace the simplified/bare placeholder with the rich empty-state (matching `key-new-conversation.html:170-209,451-457`)
  - [ ] 3.2 Add the ✦ icon character, centered
  - [ ] 3.3 Add the title "Start a new conversation"
  - [ ] 3.4 Add a `<kbd>` element styled as a keyboard hint showing `/`

- [ ] Task 4: Move SessionStartSpinner to chat-messages panel (AC: 4)
  - [ ] 4.1 In `apps/web/src/components/conversation/ConversationPane.tsx` (lines 909-915), move the `SessionStartSpinner` from the input area to the chat-messages panel
  - [ ] 4.2 Center it within the chat-messages panel (matching `key-new-conversation.html:212-240,459-464`)

- [ ] Task 5: Fix disabled Send button styling (AC: 5)
  - [ ] 5.1 In `apps/web/src/components/conversation/ChatInput.tsx` (line 88), replace `opacity-50` with the muted-surface treatment (matching `key-new-conversation.html:309-314`)
  - [ ] 5.2 Use `bg-surface` (muted) and `text-text-3` for the disabled state, not `opacity-50` over the active style

- [ ] Task 6: Fix conversation micro-drift — copy and spacing (AC: 6)
  - [ ] 6.1 In `apps/web/src/components/conversation/ChatInput.tsx` (line 29), change placeholders to "Message..." (active conversation) and "Message bmad-easy..." (branded), not "Type a message..."
  - [ ] 6.2 In `apps/web/src/components/conversation/AgentMessage.tsx` (line 93), change inter-message gap from 16px to 24px (`mb-6` or `gap-6` depending on layout)
  - [ ] 6.3 In `apps/web/src/components/conversation/UserMessage.tsx` (line 18), change inter-message gap from 16px to 24px
  - [ ] 6.4 In `apps/web/src/components/conversation/UserMessage.tsx` (line 24), change user bubble padding from `py-2` (8px) to `py-3` (12px) (matching `key-conversation.html:233-238`)
  - [ ] 6.5 In `apps/web/src/components/conversation/ScrollToBottomButton.tsx` (line 13), change text color from `text-text-1` to `text-text-2`
  - [ ] 6.6 In `apps/web/src/components/conversation/SemanticPill.tsx` (lines 44, 50), change the separator opacity to 0.4 alpha (matching `key-conversation.html:314-316`)

- [ ] Task 7: Remove Breadcrumb + h1 from new-conversation page (AC: 7)
  - [ ] 7.1 In `apps/web/src/app/(dashboard)/conversations/new/page.tsx` (lines 19-22), remove the Breadcrumb and h1 header (matching `key-new-conversation.html:437-519`)
  - [ ] 7.2 Let the conversation view take the full panel
  - [ ] 7.3 Coordinate with Story 5-2 AC-7 — if 5-2 makes the Breadcrumb inline, this simply removes it from the new-conversation page entirely

- [ ] Task 8: Fix accessibility and focus (AC: 8)
  - [ ] 8.1 In `apps/web/src/components/conversation/ChatMessageList.tsx` (lines 64-67), add `role="log"` to the chat-messages container (matching `key-conversation.html:433`)
  - [ ] 8.2 In `apps/web/src/components/conversation/AgentMessage.tsx` (lines 74-76), add a focus ring to markdown links: `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`
  - [ ] 8.3 In `apps/web/src/components/conversation/useDraftPersistence.ts` (lines 19-21), change the localStorage key from `new-conversation-draft` to `new-conversation`

- [ ] Task 9: Add arrow icon and font-medium to Send button (AC: 9)
  - [ ] 9.1 In `apps/web/src/components/conversation/ChatInput.tsx` (lines 88-90), add an upward arrow (↑) icon to the Send button (matching `key-conversation.html:481-483`)
  - [ ] 9.2 Add `font-medium` to the button text

- [ ] Task 10: Add "Skills — type to filter" header to slash picker (AC: 10)
  - [ ] 10.1 In `apps/web/src/components/conversation/SlashCommandPicker.tsx` (lines 31-53), add a "Skills — type to filter" header at the top of the picker (matching `key-new-conversation.html:473`)

- [ ] Task 11: Fix conversation limit copy (AC: 11)
  - [ ] 11.1 In `apps/web/src/components/conversation/ConversationPane.tsx` (lines 150-154), change "limit of active conversations" to "limit of 10 active conversations"

- [ ] Task 12: Write/update co-located tests (AC: 1-11)
  - [ ] 12.1 Update `apps/web/src/components/conversation/ChatMessageList.test.tsx` — assert tool pills render inline within the agent's message stream (not as standalone rows); assert `role="log"` on chat-messages container; assert 824px column centering; assert rich empty-state renders (✦ icon, title, kbd)
  - [ ] 12.2 Update `apps/web/src/components/conversation/ChatInput.test.tsx` — assert placeholder copy ("Message..."/"Message bmad-easy..."); assert disabled button uses muted surface (not opacity-50); assert arrow icon + font-medium on Send
  - [ ] 12.3 Update `apps/web/src/components/conversation/ConversationPane.test.tsx` — assert SessionStartSpinner renders in chat-messages panel (not input area); assert conversation limit copy "limit of 10 active conversations"
  - [ ] 12.4 Update `apps/web/src/components/conversation/AgentMessage.test.tsx` — assert inter-message gap is 24px; assert markdown links have focus ring
  - [ ] 12.5 Update `apps/web/src/components/conversation/UserMessage.test.tsx` — assert inter-message gap is 24px; assert user bubble padding is py-3
  - [ ] 12.6 Update `apps/web/src/components/conversation/ScrollToBottomButton.test.tsx` — assert text color is text-text-2
  - [ ] 12.7 Update `apps/web/src/components/conversation/SemanticPill.test.tsx` — assert separator uses 0.4 alpha
  - [ ] 12.8 Update `apps/web/src/components/conversation/SlashCommandPicker.test.tsx` — assert "Skills — type to filter" header renders
  - [ ] 12.9 Update or create `apps/web/src/components/conversation/useDraftPersistence.test.ts` — assert localStorage key is `new-conversation`
  - [ ] 12.10 Update `apps/web/src/app/(dashboard)/conversations/new/page.test.tsx` — assert no Breadcrumb or h1 header renders

- [ ] Task 13: Verify build, lint, and tests
  - [ ] 13.1 Run `yarn nx lint web` — confirm 0 lint errors
  - [ ] 13.2 Run `yarn nx test web` — confirm all tests pass
  - [ ] 13.3 Run `yarn nx typecheck web` — confirm no type errors
  - [ ] 13.4 Run `yarn nx build web` — confirm production build succeeds

## Dev Notes

### Architecture Context

This story fixes structural and micro-drift in the conversation stream — the most architecturally significant story in Epic 5. The inline tool/semantic pills change (AC-1) requires changing how `TOOL_CALL` and recognition events are stored and rendered: they must interleave within the agent's markdown stream at the position they occurred, rather than being emitted as separate standalone rows. This is a data-model change, not just a CSS fix.

The remaining ACs are structural (824px centering, empty-state, spinner placement) and micro-drift (copy, spacing, padding, opacity, accessibility attributes) — lower risk but numerous.

### Architectural Significance: Inline Tool/Semantic Pills (AC-1)

The current implementation stores `TOOL_CALL` events as separate `ChatMessage` entries, rendered as standalone rows after the agent message. The mockup (`key-conversation.html:448-451`) shows pills rendered inline *within* the agent's markdown stream at the exact position the tool call occurred. This requires:

1. **Data model change**: `TOOL_CALL`/recognition events must be positionally interleaved with the agent's markdown content, not stored as separate top-level `ChatMessage` entries. The events need an ordering/position field that places them within the agent's stream.
2. **Rendering change**: `ChatMessageList` must split the agent's markdown at tool-call positions and insert the pills inline, rather than rendering them as siblings after the message.
3. **Cross-check**: Verify this is consistent with Story 3.4 and UX-DR5 ("inline chip at the exact stream position of the tool call") before refactoring. If the existing data model already supports positional interleaving but the renderer doesn't use it, the change is rendering-only.

### Prior Conversation-Drift Spec — What NOT to Re-fix

The prior spec `spec-ux-spec-drift-conversation-ui.md` (commit c7c1c5a) already fixed 9 drift classes. The following items are **already fixed** — do NOT re-apply them:

1. **Input disable during agent processing** — `ConversationPane.tsx` already disables textarea when `agentState !== 'idle'`
2. **Scroll-to-bottom button** — `ScrollToBottomButton.tsx` already removed `shadow-lg` and fixed copy to "N new messages" (but text *color* is NOT fixed — that's AC-6 in this story)
3. **Copy affordances** — code-block copy and Clipboard icon already added in `AgentMessage.tsx` / `CopyButton.tsx`
4. **Agent timestamps** — permanent visibility (no hover-only opacity) already applied in `AgentMessage.tsx`
5. **Typography scale** — h1/h2/h3 and body text sizes already corrected in `AgentMessage.tsx`
6. **System message role** — `role="status"` already on system message `<p>` in `ChatMessageList.tsx` (but `role="log"` on the container is NOT added — that's AC-8 in this story)
7. **Textarea styling** — `bg-surface-raised` and `rounded-lg` already applied to textarea in `ChatInput.tsx`
8. **Send button text color** — already changed to `text-accent-fg` in `ChatInput.tsx` (do NOT change to `text-bg`)
9. **Slash picker styling** — `bg-surface-raised` and `shadow-lg` removal already applied in `SlashCommandPicker.tsx`; option IDs and `aria-activedescendant` already added
10. **ToolPill completion color** — `text-text-2` already applied (was `text-positive`)

Reference the prior spec's Code Map and Suggested Review Order for the exact lines of each completed fix.

### Mockup References

| Surface | Mockup File | Implementation File | Lines to Compare |
|---------|------------|---------------------|------------------|
| Inline tool pills | `key-conversation.html` | `ChatMessageList.tsx` | Mockup: 448-451; Code: 84-103 |
| 824px column | `key-conversation.html` | `ChatMessageList.tsx` | Mockup: 218-224, 319-325; Code: 60-67 |
| New-conversation empty-state | `key-new-conversation.html` | `ChatMessageList.tsx` | Mockup: 170-209, 451-457; Code: 68-72 |
| SessionStartSpinner | `key-new-conversation.html` | `ConversationPane.tsx` | Mockup: 212-240, 459-464; Code: 909-915 |
| Disabled Send button | `key-new-conversation.html` | `ChatInput.tsx` | Mockup: 309-314; Code: 88 |
| Chat placeholders | `key-conversation.html` / `key-new-conversation.html` | `ChatInput.tsx` | Code: 29 |
| Inter-message gap | `key-conversation.html` | `AgentMessage.tsx`, `UserMessage.tsx` | Mockup: 208-215; Code: AgentMessage:93, UserMessage:18 |
| User bubble padding | `key-conversation.html` | `UserMessage.tsx` | Mockup: 233-238; Code: 24 |
| Scroll-to-bottom color | `key-conversation.html` | `ScrollToBottomButton.tsx` | Code: 13 |
| Semantic pill separator | `key-conversation.html` | `SemanticPill.tsx` | Mockup: 314-316; Code: 44, 50 |
| New-conversation page | `key-new-conversation.html` | `conversations/new/page.tsx` | Mockup: 437-519; Code: 19-22 |
| role="log" | `key-conversation.html` | `ChatMessageList.tsx` | Mockup: 433; Code: 64-67 |
| Markdown links focus | — | `AgentMessage.tsx` | Code: 74-76 |
| Draft localStorage key | — | `useDraftPersistence.ts` | Code: 19-21 |
| Conversation limit copy | — | `ConversationPane.tsx` | Code: 150-154 |
| Send button icon/weight | `key-conversation.html` | `ChatInput.tsx` | Mockup: 481-483; Code: 88-90 |
| Slash picker header | `key-new-conversation.html` | `SlashCommandPicker.tsx` | Mockup: 473; Code: 31-53 |

### Key Implementation Details

- **824px column**: Use `max-w-[824px] mx-auto w-full` on the messages container and the chat-input-box. Both must align to the same column width.
- **New-conversation empty-state**: The ✦ icon is Unicode U+2726 (black four-pointed star) or U+2722 (four teardrop-spoked asterisk). Check the mockup HTML for the exact character entity. The `<kbd>` element should be styled as a keyboard key (border, rounded, mono font).
- **SessionStartSpinner**: Move from wherever it currently renders in the input zone to the chat-messages panel, centered with `flex items-center justify-center`.
- **Disabled Send button**: Use `bg-surface text-text-3` for the disabled state. Do NOT use `opacity-50` — that dims the entire button including the accent color, which looks broken. The muted-surface treatment uses a different (non-accent) background.
- **Placeholders**: The active conversation uses "Message..." and the branded state uses "Message bmad-easy...". Check the mockup HTML for exact copy. Do NOT use "Type a message...".
- **Inter-message gap**: Change from 16px (`mb-4`/`gap-4`) to 24px (`mb-6`/`gap-6`). This applies to the gap between consecutive messages in the stream, both agent and user.
- **User bubble padding**: Change from `py-2` (8px) to `py-3` (12px). Horizontal padding should remain as-is.
- **Scroll-to-bottom text color**: `text-text-2` (secondary text), not `text-text-1` (primary text). The button is secondary UI and should not compete with message content.
- **Semantic pill separator**: Use `border-white/40` or `border-current opacity-40` — the mockup shows a 0.4 alpha separator, not a full-opacity one. Check `key-conversation.html:314-316` for the exact implementation.
- **role="log"**: Add `role="log"` to the outer chat-messages scroll container. This is distinct from the `role="status"` already on system messages (fixed by prior spec). `role="log"` announces new messages to screen readers.
- **Draft localStorage key**: Change from `new-conversation-draft` to `new-conversation`. Check `useDraftPersistence.ts:19-21` for the key constant. Update any code that reads/writes this key.
- **Send button arrow**: Add the ↑ character (U+2191) or a lucide-react `ArrowUp` icon. The button should use `font-medium`.
- **Slash picker header**: Add a header row at the top of `SlashCommandPicker` reading "Skills — type to filter" in `text-text-2 text-xs`.
- **Conversation limit copy**: Change "limit of active conversations" to "limit of 10 active conversations" at `ConversationPane.tsx:150-154`.

### What NOT to Change

- **Prior spec fixes (listed above)**: The 9 drift classes fixed by `spec-ux-spec-drift-conversation-ui.md` are done. Do NOT re-apply textarea bg/border-radius, Send text color, picker bg/shadow, ToolPill completion color, system message role, timestamp visibility, typography scale, or code-block copy.
- **Accessibility improvements that exceed the mockup**: Focus rings, aria labels, keyboard nav, route-focus management. These are positive drift.
- **Story 3.4 behavior**: The inline pill change (AC-1) must be consistent with Story 3.4's existing behavior and UX-DR5. Do not break the tool-call flow; only change *where* the pill renders (inline vs standalone row).
- **Token values**: Do not change token values. Micro-drift here is spacing/copy/opacity, not token values.

### Testing

Tests are co-located with source (`*.spec.ts` / `*.test.tsx` next to the file under test). For this story:
- The inline pill test (AC-1) is the most complex — it should verify that a `TOOL_CALL` event renders *within* the agent message's rendered output, not as a sibling row. This may require changing the test's mock data structure if the data model changes.
- Micro-drift tests (AC-6, AC-8-11) are straightforward assertions on className/text content.
- Update existing tests that assert the old behavior (e.g. tests that expect standalone tool-pill rows, or `opacity-50` on the Send button).
- Run `yarn nx test web` to execute all unit/component tests.

### References

- Investigation: `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md` (Findings 3, 4, 5 mechanism 2; Follow-up items 7, 8)
- Prior conversation-drift spec: `_bmad-output/implementation-artifacts/spec-ux-spec-drift-conversation-ui.md` (9 fixes already landed — do NOT re-fix)
- UX mockups: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/mockups/key-conversation.html`, `key-new-conversation.html`
- EXPERIENCE.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` (UX-DR5: inline chip at exact stream position)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md`
- Project context: `_bmad-output/project-context.md` (shadcn/ui + Tailwind section, lines 181-187; focus ring pattern)
- Story 5-1 (chat-input-box container): coordinates the wrapper container for textarea + Send + WorkingTreeIndicator
- Story 5-2 (Breadcrumb inline): coordinates the new-conversation page header removal (AC-7)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
