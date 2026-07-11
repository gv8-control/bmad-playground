---
title: 'Fix UX spec drift in conversation UI'
type: 'bugfix'
created: '2026-07-05'
status: 'done'
baseline_commit: 'c7c1c5a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The conversation UI (Stories 3.1–3.5) drifts from the finalized UX spines in 7 areas: input not disabled during agent processing, scroll-to-bottom button non-functional, copy affordance gaps, agent timestamps hover-only, markdown typography scale wrong, accessibility attribute gaps, and DESIGN.md visual token mismatches.

**Approach:** Patch all 7 drift classes in the conversation component cluster, aligning code to the authoritative spines. No spine changes. No behavior changes beyond what the specs already require.

## Boundaries & Constraints

**Always:**
- EXPERIENCE.md and DESIGN.md are authoritative; code aligns to them.
- Standard focus ring: `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`.
- `motion-reduce:animate-none` on all animations.
- Tests co-located; P0 for behavioral ACs.

**Ask First:** None anticipated.

**Never:**
- Do not change UX spines (DESIGN.md / EXPERIENCE.md) — that is layer 2.
- Do not touch the 5 undocumented behaviors (STREAM_ERROR, verbatim backend messages, unconditional /resume, silent redirect, per-conversation drafts) — those require spine reconciliation first.
- Do not use box shadows for elevation on dark surfaces.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Agent processing | `agentState !== 'idle'` | Textarea disabled; Stop visible; user cannot type or send | N/A |
| User scrolls up during streaming | Scroll above 50px threshold | Button appears outside scroll container, bottom-center; shows "N new messages" | N/A |
| User clicks scroll-to-bottom | Click on button | Container scrolls to bottom; auto-scroll re-enables; button hides; count resets | N/A |
| Code block in agent message | Markdown fenced code | Always-visible copy icon top-right of block; click copies raw code; "Copied" 1.5s | Clipboard failure: silent |
| Agent message rendered | Any agent message | Timestamp permanently visible (xs, text-3), not hover-only | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/conversation/ConversationPane.tsx` — session/agent state; computes `inputDisabled`; renders ChatMessageList + ChatInput + ThinkingIndicator
- `apps/web/src/components/conversation/ChatMessageList.tsx` — scrollable message container; renders messages, scroll button, system messages
- `apps/web/src/components/conversation/ScrollToBottomButton.tsx` — pill button for scroll-to-bottom
- `apps/web/src/components/conversation/AgentMessage.tsx` — agent messages with Markdown; heading/body typography; timestamps; copy
- `apps/web/src/components/conversation/CopyButton.tsx` — reusable copy-to-clipboard button
- `apps/web/src/components/conversation/UserMessage.tsx` — user messages; copy
- `apps/web/src/components/conversation/ChatInput.tsx` — textarea + Send/Stop; auto-grow
- `apps/web/src/components/conversation/SlashCommandPicker.tsx` — dropdown skill picker
- `apps/web/src/components/conversation/ToolPill.tsx` — inline tool call pill
- `apps/web/src/components/conversation/ThinkingIndicator.tsx` — three-dot thinking animation

## Tasks & Acceptance

**Execution:**
- [x] `ConversationPane.tsx` -- Add `agentState !== 'idle'` to `inputDisabled` (line 724) so textarea disables during processing. Add `onScrollPositionChange` handler: set `showScrollToBottom` true when not at bottom; track `newMessageCount` incrementing on `messages.length` change while scrolled away; reset both when at bottom. Pass `isThinking={agentState === 'thinking'}` and `onScrollPositionChange` to ChatMessageList. Remove standalone ThinkingIndicator render (line 742). Pass `aria-activedescendant` to ChatInput when picker open.
- [x] `ChatMessageList.tsx` -- Add props: `onScrollPositionChange?(isAtBottom: boolean)`, `isThinking?: boolean`. Restructure: outer `relative flex-1` wrapper, inner scroll div. Move ScrollToBottomButton outside scroll div (absolute, bottom-center of wrapper). In `handleScroll`: call `onScrollPositionChange(isAtBottom)`. In scroll-to-bottom click: scroll container (`scrollTop = scrollHeight`), reset `isAtBottomRef`, call `onScrollToBottom`. Add `role="status"` to system message `<p>` (line 62). Render `<ThinkingIndicator />` as last child inside scroll div when `isThinking`.
- [x] `ScrollToBottomButton.tsx` -- Remove `shadow-lg`. Fix copy: `${count} new` → `${count} new messages`.
- [x] `AgentMessage.tsx` -- Fix heading scale: h1→`text-xl`, h2→`text-lg`, h3→`text-base` (currently one step small). Fix body: `p`→`text-base`, `li`→`text-base` (currently `text-sm`). Fix code font: `text-xs`→`text-sm` inside `pre`. Add per-code-block copy: wrap `pre` children, render `<CopyButton text={extractedCode} alwaysVisible />` absolute top-right. Distinguish inline vs block `code` (check `node.position` or parent). Make agent timestamp permanent: remove `opacity-0 group-hover:opacity-100` from timestamp wrapper (keep on copy button only). Move message copy to top-right of message (currently `mt-1` below).
- [x] `CopyButton.tsx` -- Replace text "Copy"/"Copied" with lucide-react `Clipboard`/`ClipboardCheck` icon (16px). Keep "Copied" label swap for 1.5s. Keep `alwaysVisible` prop.
- [x] `UserMessage.tsx` -- Move copy + timestamp to top-right of bubble (currently below).
- [x] `ChatInput.tsx` -- Fix textarea: `bg-surface`→`bg-surface-raised`, `rounded-md`→`rounded-lg`. Fix Send text color to `accent-fg` (white, not `text-bg`). Add `aria-activedescendant?: string` passthrough prop to textarea.
- [x] `SlashCommandPicker.tsx` -- Fix `bg-surface`→`bg-surface-raised`. Remove `shadow-lg`. Add `id={`skill-option-${index}`}` to each option. Add `aria-activedescendant={\`skill-option-${selectedIndex}\`}` to listbox.
- [x] `ToolPill.tsx` -- Change completion `✓` color from `text-positive` to `text-text-2` (positive reserved for artifact commits per DESIGN.md semantic-color rule).
- [x] Update co-located tests: `ConversationPane.test.tsx` (input disabled during processing), `ChatMessageList.test.tsx` (scroll button appears + scrolls, system message role), `AgentMessage.test.tsx` (code-block copy present, timestamp visible without hover, heading sizes), `ChatInput.test.tsx` (textarea disabled when isProcessing), `SlashCommandPicker.test.tsx` (option IDs + aria-activedescendant).

**Acceptance Criteria:**
- Given agent is processing, when user tries to type, then textarea is disabled.
- Given user scrolls up during streaming, when new messages arrive, then button appears outside scroll container showing "N new messages".
- Given user clicks scroll-to-bottom, when button visible, then container scrolls to bottom, auto-scroll re-enables, button hides.
- Given agent message with fenced code, when rendered, then always-visible copy icon at top-right.
- Given agent message rendered, when not hovering, then timestamp permanently visible.
- Given agent message with H1/H2/H3, when rendered, then h1=`text-xl`, h2=`text-lg`, h3=`text-base` semibold.
- Given system message rendered, when inspected, then has `role="status"`.
- Given slash picker open, when ArrowDown pressed, then selected option announced via `aria-activedescendant`.

## Verification

**Commands:**
- `yarn nx test web` -- expected: all tests pass
- `yarn nx lint web` -- expected: no new errors
- `yarn nx typecheck web` -- expected: no type errors

## Suggested Review Order

**Agent state machine**

- Input now disables during all non-idle agent states (the core behavioral fix)
  [`ConversationPane.tsx:794`](../../apps/web/src/components/conversation/ConversationPane.tsx#L794)

- Scroll position handler sets button visible when not at bottom (else branch was missing)
  [`ConversationPane.tsx:783`](../../apps/web/src/components/conversation/ConversationPane.tsx#L783)

**Scroll behavior**

- Restructured: outer relative wrapper + inner scroll div; button anchored to wrapper not content
  [`ChatMessageList.tsx:43`](../../apps/web/src/components/conversation/ChatMessageList.tsx#L43)

- Click handler scrolls container, resets ref, notifies parent — fixes dead button
  [`ChatMessageList.tsx:49`](../../apps/web/src/components/conversation/ChatMessageList.tsx#L49)

- newMessageCount only increments for non-user messages (guards against counting own sends)
  [`ConversationPane.tsx:105`](../../apps/web/src/components/conversation/ConversationPane.tsx#L105)

- Removed shadow-lg; fixed copy to "N new messages" per spec
  [`ScrollToBottomButton.tsx:13`](../../apps/web/src/components/conversation/ScrollToBottomButton.tsx#L13)

**Message rendering**

- Heading scale fixed: h1=text-xl, h2=text-lg, h3=text-base (was one step too small)
  [`AgentMessage.tsx:25`](../../apps/web/src/components/conversation/AgentMessage.tsx#L25)

- Code override distinguishes block vs inline via language- class or newline in children
  [`AgentMessage.tsx:45`](../../apps/web/src/components/conversation/AgentMessage.tsx#L45)

- Pre override wraps in relative div with always-visible CopyButton at top-right
  [`AgentMessage.tsx:60`](../../apps/web/src/components/conversation/AgentMessage.tsx#L60)

- Timestamp now permanent (no hover-only opacity); copy button stays hover-only
  [`AgentMessage.tsx:110`](../../apps/web/src/components/conversation/AgentMessage.tsx#L110)

- Replaced text with Clipboard icon; "Copied" shown as text label per DESIGN.md
  [`CopyButton.tsx:30`](../../apps/web/src/components/conversation/CopyButton.tsx#L30)

- Hover chrome repositioned to -top-5 to avoid clipping at scroll boundaries
  [`UserMessage.tsx:20`](../../apps/web/src/components/conversation/UserMessage.tsx#L20)

**Accessibility**

- Listbox gets id="skill-listbox"; each option gets id="skill-option-N"
  [`SlashCommandPicker.tsx:36`](../../apps/web/src/components/conversation/SlashCommandPicker.tsx#L36)

- Textarea receives aria-activedescendant + aria-controls when picker open
  [`ChatInput.tsx:66`](../../apps/web/src/components/conversation/ChatInput.tsx#L66)

- aria-activedescendant guarded: undefined when filteredSkills is empty
  [`ConversationPane.tsx:802`](../../apps/web/src/components/conversation/ConversationPane.tsx#L802)

- System message gets role="status" per Accessibility Floor
  [`ChatMessageList.tsx:78`](../../apps/web/src/components/conversation/ChatMessageList.tsx#L78)

- ThinkingIndicator moved in-stream (last child of scroll div) per spec
  [`ChatMessageList.tsx:83`](../../apps/web/src/components/conversation/ChatMessageList.tsx#L83)

**Visual tokens**

- Textarea: bg-surface-raised, rounded-lg; Send: text-accent-fg (was text-bg)
  [`ChatInput.tsx:65`](../../apps/web/src/components/conversation/ChatInput.tsx#L65)

- Picker: bg-surface-raised, no shadow-lg (violates dark-surface elevation rule)
  [`SlashCommandPicker.tsx:32`](../../apps/web/src/components/conversation/SlashCommandPicker.tsx#L32)

- Completion ✓ color: text-text-2 (positive reserved for artifact commits only)
  [`ToolPill.tsx:64`](../../apps/web/src/components/conversation/ToolPill.tsx#L64)

**Tests**

- Input disabled during processing; system message role=status; textarea disabled; option IDs
  [`ConversationPane.test.tsx:586`](../../apps/web/src/components/conversation/ConversationPane.test.tsx#L586)
