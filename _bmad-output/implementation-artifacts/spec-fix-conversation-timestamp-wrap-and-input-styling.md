---
title: 'Fix conversation timestamp wrapping and white input box'
type: 'bugfix'
created: '2026-07-13'
status: 'done'
route: 'one-shot'
---

# Fix conversation timestamp wrapping and white input box

## Intent

**Problem:** Two design bugs in the live conversation UI: (1) for short user messages like "test", the timestamp above the bubble wraps to multiple lines because the absolute-positioned container is width-constrained by the narrow bubble; (2) the message input box renders white with barely readable text because the full `theme.colors` override in `tailwind.config.ts` accidentally omits the `transparent` CSS-wide keyword, so `bg-transparent` and `border-transparent` utilities are never generated — the textarea keeps its browser-default white background and the Send button gets a visible border instead of none.

**Approach:** Add `whitespace-nowrap` to the timestamp/copy container in `UserMessage.tsx` to prevent text wrapping. Restore `transparent: 'transparent'` and `current: 'currentColor'` in the Tailwind `colors` palette so the full override no longer drops these CSS-wide keywords. This fixes the ChatInput textarea (`bg-transparent`), the Send button (`border-transparent`), and two badge components in `ArtifactCard.tsx` and `ArtifactListEntry.tsx` that also use `bg-transparent`.

## Suggested Review Order

**Root cause — missing Tailwind color keywords**

- Full `theme.colors` override dropped `transparent` and `current`; `bg-transparent` and `border-transparent` generated zero CSS
  [`tailwind.config.ts:8`](../../apps/web/tailwind.config.ts#L8)

**Affected components — `bg-transparent` / `border-transparent` consumers**

- Textarea uses `bg-transparent` — was showing browser-default white background
  [`ChatInput.tsx:73`](../../apps/web/src/components/conversation/ChatInput.tsx#L73)

- Send button uses `border-transparent` — was showing a visible border instead of none
  [`ChatInput.tsx:92`](../../apps/web/src/components/conversation/ChatInput.tsx#L92)

- Artifact badge uses `bg-transparent` — also fixed by the palette restoration
  [`ArtifactCard.tsx:28`](../../apps/web/src/components/project-map/ArtifactCard.tsx#L28)

- Artifact list badge uses `bg-transparent` — also fixed by the palette restoration
  [`ArtifactListEntry.tsx:27`](../../apps/web/src/components/artifact-browser/ArtifactListEntry.tsx#L27)

**Timestamp wrapping fix**

- Added `whitespace-nowrap` to the absolute-positioned timestamp/copy container
  [`UserMessage.tsx:22`](../../apps/web/src/components/conversation/UserMessage.tsx#L22)

**Test — regression guard for timestamp fix**

- Asserts `whitespace-nowrap` on the hover wrapper to catch future removal
  [`UserMessage.test.tsx:44`](../../apps/web/src/components/conversation/UserMessage.test.tsx#L44)
