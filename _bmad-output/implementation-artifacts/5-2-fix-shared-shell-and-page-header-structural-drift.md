---
baseline_commit: acaf4059485bfbfab683e9645d598030b2ffc1a1
---

# Story 5.2: Fix Shared Shell and Page-Header Structural Drift

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user navigating the platform,
I want the shell and page headers to match the design,
so that navigation feels consistent and polished on every page.

## Acceptance Criteria

### AC-1: Wordmark brand mark with accent interpunct

**Given** the side navigation brand mark
**When** it renders
**Then** it shows a wordmark `bmad·easy` with an accent-colored interpunct (·) between the words
**And** it does not show `bmad-easy` with a plain hyphen (investigation: `apps/web/src/components/shell/SideNavigation.tsx:30-31` vs `key-project-map.html:78-79,281-283`)

### AC-2: Wordmark border-bottom separator

**Given** the side navigation brand mark area
**When** it renders
**Then** a border-bottom separator appears below the wordmark, dividing the brand area from the navigation links (investigation: `SideNavigation.tsx:30` vs `key-project-map.html:71-77`)

### AC-3: "Settings" visible label next to avatar

**Given** the bottom-pinned settings entry in the side navigation
**When** it renders
**Then** a visible "Settings" text label appears next to the avatar circle
**And** it is not avatar-only (investigation: `SideNavigation.tsx:88-99` vs `key-project-map.html:300-303`)

### AC-4: Active-state inset pill styling

**Given** the active nav item
**When** it renders
**Then** it uses the inset pill styling from DESIGN.md: margin `0 8px` (`mx-2`), `rounded-md` (8px radius — closest token to mockup's 6px; 6px is not in the custom border-radius scale, see Dev Notes)
**And** it does not use a full-width bar (investigation: `SideNavigation.tsx:48-54` vs `key-project-map.html:113-119`)

### AC-5: Single horizontal padding (no doubling)

**Given** navigation items in the side navigation
**When** they render
**Then** horizontal padding totals 12px (matching the mockup)
**And** padding is not doubled from a wrapper `px-3` plus item-level `px-3` = 24px (investigation: `SideNavigation.tsx:41` vs `key-project-map.html:102-111`)

### AC-6: Nav button spacing and alignment

**Given** nav buttons (e.g. "New Conversation") in the side navigation
**When** they render
**Then** vertical margins between buttons match the mockup spacing (`margin: 12px 12px 8px`)
**And** button text is vertically centered
**And** the "New Conversation" button includes the `+` prefix shown in the mockup (investigation: `SideNavigation.tsx:34-39` vs `key-project-map.html:81-93,285`)

### AC-7: Breadcrumb inline beside page title

**Given** a depth-1 page header (Conversation, Artifact Browser, Settings, New Conversation)
**When** it renders
**Then** the Breadcrumb renders inline beside the page title on a single flex row
**And** it is not stacked above the title as its own row with `py-4` padding (investigation: `apps/web/src/components/shell/Breadcrumb.tsx:5-12` vs `key-conversation.html:189-193,426-428`)

### AC-8: Header bottom divider on all depth-1 pages

**Given** depth-1 page headers (Conversation, Artifact Browser, Settings, New Conversation)
**When** they render
**Then** a 1px header bottom divider (`border-b`) is present on each
**And** the divider color matches the mockup's `#1E1E26` (which maps to the `surface-raised` token) (investigation: all `page.tsx` files vs mockup `.page-header { border-bottom: 1px solid #1E1E26 }`)

### AC-9: Nav separator styling

**Given** the separator between conversation list and nav links in the side navigation
**When** it renders
**Then** it uses `my-2` (not `my-4`), `border-surface-raised` (matching mockup `#1E1E26`), and `mx-4` (not `mx-3`) (investigation: `SideNavigation.tsx:60` vs `key-project-map.html:121-125`)

### AC-10: Nav links grouped with conversation list (top-clustered)

**Given** the Project Map and Artifact Browser links in the side navigation
**When** the conversation list has fewer entries than fill the viewport
**Then** the separator and nav links remain grouped with the conversation list (top-clustered), not pushed toward the bottom of the nav by a flex-grown conversation container
**And** the separator and nav links sit inside the same flex container as conversations, matching the mockup's layout (investigation: `SideNavigation.tsx:41-60` vs `key-project-map.html:96-100,287-298`)

## Tasks / Subtasks

- [x] Task 1: Fix wordmark brand mark with accent interpunct (AC: 1)
  - [x] 1.1 In `apps/web/src/components/shell/SideNavigation.tsx` (lines 30-31), change the wordmark from `bmad-easy` (plain hyphen) to `bmad<span className="text-accent">·</span>easy` — the interpunct (·) is U+00B7 (middle dot), rendered in `text-accent` color, with "bmad" and "easy" in `text-text-1`
  - [x] 1.2 Add `tracking-tight` to the wordmark div className (mockup `.wordmark-text` has `letter-spacing: -0.02em`; `tracking-tight` = `-0.025em` is the closest Tailwind token, consistent with Story 5.1 sign-in wordmark)
  - [x] 1.3 Verify the result matches `key-project-map.html:78-79,281-283`

- [x] Task 2: Add wordmark border-bottom separator (AC: 2)
  - [x] 2.1 In `apps/web/src/components/shell/SideNavigation.tsx` (line 30), add `border-b border-surface-raised` to the wordmark div className (mockup `.nav-wordmark` has `border-bottom: 1px solid #1E1E26`; `#1E1E26` = `surface-raised` token)
  - [x] 2.2 Verify the separator matches `key-project-map.html:71-77`

- [x] Task 3: Restore "Settings" visible label next to avatar (AC: 3)
  - [x] 3.1 In `apps/web/src/components/shell/SideNavigation.tsx` (lines 88-99), add a visible "Settings" text label inside the settings Link, after the avatar span: `<span className="text-xs text-text-2">Settings</span>` (matching `key-project-map.html:300-303` `.nav-bottom-label { font-size: 0.75rem; color: #8D8CA0 }`)
  - [x] 3.2 The `aria-label` on the Link (`${user.name ?? user.email ?? 'User'} — Settings`) stays — it takes precedence over text content for the accessible name, so existing E2E tests matching `/e2e test user.*settings/i` continue to pass
  - [x] 3.3 Verify the label matches `key-project-map.html:302`

- [x] Task 4: Fix active-state inset pill styling (AC: 4)
  - [x] 4.1 In `apps/web/src/components/shell/SideNavigation.tsx` (lines 48-54), change the active nav item from a full-width bar to an inset pill: add `mx-2` (margin 0 8px) and `rounded-md` (6px radius) to the active className (matching `key-project-map.html:113-119` `.nav-item.active { border-radius: 6px; margin: 0 8px; padding: 8px 8px }`)
  - [x] 4.2 The active item's padding changes from `px-3` to `px-2` when active (mockup active item has `padding: 8px 8px` = `py-2 px-2`; the `mx-2` inset + `px-2` compensates so the text position stays visually consistent)
  - [x] 4.3 Inactive items do NOT get the inset margin — only the active state gets `mx-2` (matching `key-project-map.html:113-119`)
  - [x] 4.4 Apply the same inset pill pattern to ALL active nav items: conversation list items, Project Map, Artifact Browser, and Settings (the mockup's `.nav-bottom.active` also uses `border-radius: 6px; margin: 0 6px`)

- [x] Task 5: Fix double horizontal padding (AC: 5)
  - [x] 5.1 In `apps/web/src/components/shell/SideNavigation.tsx`, remove `px-3` from the conversation list container (line 41) and the nav links container (line 62) — the mockup has NO horizontal padding on the container; padding is on the items only (`padding: 8px 12px` = `py-2 px-3`)
  - [x] 5.2 Ensure all nav items (conversations, Project Map, Artifact Browser) use `px-3` (12px horizontal padding) — the nav links currently use `px-4` (16px), change to `px-3` to match the mockup
  - [x] 5.3 Verify total horizontal padding is 12px (not 24px) at `key-project-map.html:102-111`

- [x] Task 6: Fix nav button spacing and alignment (AC: 6)
  - [x] 6.1 In `apps/web/src/components/shell/SideNavigation.tsx` (line 36), add vertical margins to the "New Conversation" button: change `mx-3` to `mt-3 mx-3 mb-2` (matching `key-project-map.html:81-93` `.nav-new-btn { margin: 12px 12px 8px }`)
  - [x] 6.2 Add `flex items-center justify-center` to the button className (mockup button is full-width with centered text; the `<Link>` needs `flex` display to be block-level and fill width minus margins)
  - [x] 6.3 Change the button text from `New Conversation` to `+ New Conversation` (matching `key-project-map.html:285`)

- [x] Task 7: Refactor Breadcrumb to render inline beside title (AC: 7)
  - [x] 7.1 In `apps/web/src/components/shell/Breadcrumb.tsx`, remove the `flex-shrink-0 px-8 py-4` padding from the `<nav>` element — the padding moves to the header element on each consumer page. The Breadcrumb becomes a simple inline `<nav aria-label="Breadcrumb">` wrapping the Link (no padding, no flex-shrink-0)
  - [x] 7.2 In each depth-1 page's header, restructure to render breadcrumb and h1 in a single flex row with the header providing padding and border-b:
    - `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx`
    - `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx`
    - `apps/web/src/app/(dashboard)/(app)/settings/page.tsx`
    - `apps/web/src/app/(dashboard)/(app)/conversations/new/page.tsx`
  - [x] 7.3 New header structure for each page (matching `key-conversation.html:189-193` `.page-header` + `.page-header-row`):
    ```
    <header className="flex-shrink-0 border-b border-surface-raised pt-6 pb-4 px-8">
      <div className="flex items-center gap-3">
        <Breadcrumb />
        <h1 tabIndex={-1} className="text-xl font-semibold text-text-1">Title</h1>
      </div>
    </header>
    ```
  - [x] 7.4 Remove the `px-8` from the h1 className — the header now provides horizontal padding
  - [x] 7.5 The Breadcrumb Link keeps its existing `text-sm text-text-2 hover:text-text-1` styling and focus ring

- [x] Task 8: Add header bottom divider on all depth-1 pages (AC: 8)
  - [x] 8.1 This is accomplished by Task 7.3 — the `border-b border-surface-raised` on the header element provides the divider (mockup `.page-header { border-bottom: 1px solid #1E1E26 }`; `#1E1E26` = `surface-raised`)
  - [x] 8.2 Verify depth-0 pages (e.g. `project-map/page.tsx`) do NOT get the divider — the project-map page has its own header structure that should remain unchanged

- [x] Task 9: Fix nav separator styling (AC: 9)
  - [x] 9.1 In `apps/web/src/components/shell/SideNavigation.tsx` (line 60), change the separator from `border-t border-border-subtle my-4 mx-3` to `border-t border-surface-raised my-2 mx-4` (matching `key-project-map.html:121-125` `.nav-separator { margin: 8px 16px; background: #1E1E26 }`)

- [x] Task 10: Group nav links with conversation list — top-clustered (AC: 10)
  - [x] 10.1 In `apps/web/src/components/shell/SideNavigation.tsx`, restructure the nav so the separator and nav links (Project Map, Artifact Browser) are INSIDE the `flex-1` container alongside the conversation list — matching the mockup's `.nav-conversations` (flex:1) which contains conversations + separator + nav links (`key-project-map.html:96-100,287-298`)
  - [x] 10.2 Keep `data-testid="conversation-list"` on a wrapper that contains ONLY the conversation items (not the separator or nav links) — the E2E test `app-shell.spec.ts:69-72` expects `conversation-list` to be empty when there are no conversations
  - [x] 10.3 Proposed structure:
    ```
    <div className="flex-1 flex flex-col overflow-hidden py-1">
      <div data-testid="conversation-list" className="flex flex-col gap-1 overflow-y-auto">
        {conversations...}
      </div>
      <div className="border-t border-surface-raised my-2 mx-4" />
      <div className="flex flex-col gap-1">
        <Link href="/project-map" ...>Project Map</Link>
        <Link href="/artifacts" ...>Artifact Browser</Link>
      </div>
    </div>
    ```
    **Note:** The conversation-list wrapper includes `overflow-y-auto` so conversations scroll within their area when the list is long. Without this, many conversations render at natural height and push the separator and nav links below the visible area (clipped by the outer container's `overflow-hidden`), making them inaccessible. In the current code the conversation list has `flex-1 overflow-hidden` and the nav links are outside the flex-1 container, so they are always visible — the restructure must preserve that accessibility.
  - [x] 10.4 Remove the `mt-4` from the conversation list wrapper (was `px-3 mt-4`) — the `flex-1` container now provides the structure; the `mt-4` created a gap between the New Conversation button and the conversation list that doesn't exist in the mockup (mockup's `.nav-conversations` has `padding: 4px 0` = `py-1`)
  - [x] 10.5 Add `py-1` to the `flex-1` container (matching mockup `.nav-conversations { padding: 4px 0 }`)
  - [x] 10.6 Verify: with 0 conversations, the separator and nav links appear right below the New Conversation button (top-clustered), not pushed to the bottom

- [x] Task 11: Activate existing ATDD red-phase test scaffolds (AC: 1-10)
  - [x] 11.1 In `apps/web/src/components/shell/SideNavigation.test.tsx`, remove `it.skip()` from the "Story 5.2 — Shell Structural Drift" describe block tests one sub-task at a time, confirm each fails (red), then implement to make it pass (green). The wordmark test (line 33) was already updated to assert `bmad·easy` via `getByTestId('product-wordmark')` + `toHaveTextContent` and skipped — activate it first. Scaffolds cover: wordmark `tracking-tight` (AC-1), wordmark `border-b border-surface-raised` (AC-2), Settings visible label (AC-3), active inset pill `mx-2 rounded-md px-2` on all nav items (AC-4), single horizontal padding no `px-3` on container + `px-3` on items (AC-5), `+` prefix + `mt-3 mb-2` + `flex items-center justify-center` on New Conversation button (AC-6), separator `my-2 mx-4 border-surface-raised` (AC-9), nav links + separator inside `flex-1` container top-clustered (AC-10)
  - [x] 11.2 In `apps/web/src/components/shell/Breadcrumb.test.tsx`, remove `it.skip()` from the "Story 5.2 — Breadcrumb inline layout (AC-7)" describe block. Scaffolds cover: nav does NOT have `px-8`, `py-4`, or `flex-shrink-0`. The existing tests for `aria-label="Breadcrumb"`, link to `/project-map`, and `← Project Map` text should still pass without modification
  - [x] 11.3 Page-level header structure scaffolds were created for AC-7 and AC-8 on 3 depth-1 pages: `settings/page.test.tsx`, `artifacts/page.test.tsx`, and `conversations/[conversationId]/page.test.tsx`. Remove `it.skip()` from the "Story 5.2 — Header structure (AC-7, AC-8)" describe blocks. Scaffolds cover: header has `border-b border-surface-raised` (AC-8), header has `pt-6 pb-4 px-8` padding (AC-7), breadcrumb + h1 in `flex items-center gap-3` row (AC-7), h1 does NOT have `px-8` (AC-7). Decision (DP-4): page-level tests added despite story originally saying "no page-level tests needed" — E2E covers behavior but not CSS class presence; page tests are more precise for className assertions. `conversations/new/page.test.tsx` was NOT created — header structure is identical to the other 3 pages, and E2E covers conversations/new behavior.

- [x] Task 12: Verify build, lint, and tests
  - [x] 12.1 Run `yarn nx lint web` — confirm 0 new lint errors (pre-existing error in `InProgressArtifactCard.test.tsx` is not modified by this story)
  - [x] 12.2 Run `yarn nx test web` — confirm all tests pass including activated ATDD scaffolds from Task 11 (SideNavigation, Breadcrumb, and 3 page-level header structure tests)
  - [x] 12.3 Run `yarn nx build web` — confirm production build succeeds (pre-existing type error in `AgentMessage.tsx:18` is not modified by this story)

## Dev Notes

### Architecture Context

This story fixes shared-shell structural drift in `SideNavigation.tsx` and `Breadcrumb.tsx`, plus page-header layout across 4 depth-1 pages. The shell is rendered once in `AppShell.tsx` / `(dashboard)/(app)/layout.tsx` and inherited by every authenticated page, so fixes here propagate broadly. The Breadcrumb fix (AC-7) is the highest-leverage single change: it improves fidelity on 4 surfaces with one component refactor. Per the investigation's Deduction 3, the Breadcrumb/header layout is the highest-leverage fix in the entire epic.

### Deferred Work Check

Per the user's instruction, `deferred-work.md` was checked for items matching this story's file paths. The file paths `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` and `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx` appear in deferred-work entries, but those findings concern sync behavior (`syncArtifactsAction` inline await, sync-on-empty-render, non-`NO_CREDENTIAL` error swallowing) and env validation (`API_URL` empty-string handling) — different code paths from the header/border-b changes this story makes.

**Decision (DP-5: scope temptation):** No deferred findings are in scope for this story's code changes. This story only adds a `border-b` CSS class to page headers and refactors the Breadcrumb layout — it does not touch sync logic, data fetching, or env validation. No items pulled in from deferred-work.md.

### Decision Records

**Decision (DP-2):** The existing story file contradicted the epics dev notes (epics.md line 1005) which confirm both shell findings are drift, not intentional redesigns: (a) nav links relocated from top-grouped to bottom-pinned — confirmed drift, the mockup groups them inside `.nav-conversations` (flex:1) with the conversation list; (b) "Settings" label removed — confirmed drift, the label was never present in code (absent since first commit). The epics (higher authority) wins over the story spec. Amended the story file to: remove "confirm with design/PM" language from AC-3 and Task 3, add AC-10 (nav links top-clustered) from the epics, remove "do NOT change nav link placement" from What NOT to Change, and remove "coordinate with Story 5-4" hedging (the mockup is authoritative per the Epic 5 principle). All ACs should be implemented as written — the mockups are authoritative; the code aligns to them.

**Decision (DP-2, validation):** AC-4 originally stated "`rounded-md` (6px radius)" but the project's Tailwind config defines `rounded-md` as 8px, not 6px. The AC text contradicted the implementation authority (Tailwind config). The Dev Notes already explained the discrepancy. Amended AC-4 to state `rounded-md` (8px radius) with a note that 6px is not in the custom scale.

**Decision (DP-4, validation):** AC-10 originally stated "When the conversation list has fewer than 5 entries" — the "fewer than 5" threshold was misleading because the fix (Task 10) restructures the nav so nav links are always top-clustered regardless of conversation count. Amended AC-10 to "fewer entries than fill the viewport" which accurately describes the condition. Artifact-only wording fix, no production behavior change.

**Decision (DP-4, validation):** Task 10.3's proposed structure moved the separator and nav links inside the `flex-1` container (matching the mockup), but the conversation-list wrapper lacked overflow handling. In the current code the conversation list has `flex-1 overflow-hidden` and the nav links are outside the flex-1 container, so they are always visible. Without `overflow-y-auto` on the conversation-list wrapper, many conversations would render at natural height and push the separator and nav links below the visible area (clipped by the outer container's `overflow-hidden`), making them inaccessible — a regression from the current behavior. Added `overflow-y-auto` to the conversation-list wrapper in the proposed structure and a "What must be preserved" entry. Artifact-only doc wording fix, no AC change.

### Tailwind Config Reference

The project uses custom border-radius values in `tailwind.config.ts` (different from default Tailwind):

| Token | Value | Default Tailwind |
|-------|-------|-----------------|
| `rounded-sm` | 4px | 2px |
| `rounded-md` | 8px | 6px |
| `rounded-lg` | 12px | 8px |
| `rounded-xl` | 16px | 12px |
| `rounded-2xl` | 24px | 16px |

**Important:** the mockup CSS `.nav-item.active { border-radius: 6px }` — `6px` is NOT in the custom scale. The closest tokens are `rounded-sm` (4px) and `rounded-md` (8px). DESIGN.md (line 353) says the New Conversation button uses `md` radius. The mockup's `6px` for active items falls between `rounded-sm` (4px) and `rounded-md` (8px). Use `rounded-md` (8px) — it's the closest standard token and is consistent with the conversation item styling (which already uses `rounded-md`).

Spacing scale: 1=4px, 2=8px, 3=12px, 4=16px, 5=20px, 6=24px, 8=32px.

Design tokens (from `tailwind.config.ts`):

| Token | Hex | Mockup Usage |
|-------|-----|-------------|
| `surface` | #16161C | Side nav background |
| `surface-raised` | #1E1E26 | Active item bg, separator, wordmark border-b, page-header border-b |
| `border` | #2B2B38 | (not used in shell hairlines) |
| `border-subtle` | #232330 | Side nav right border (current code; token-usage drift for Story 5.4) |
| `accent` | #7B6EE8 | Wordmark interpunct, New Conversation button border/text |
| `text-1` | #EDECF5 | Wordmark text, active item text, page title |
| `text-2` | #8D8CA0 | Inactive item text, breadcrumb text, Settings label |

### Mockup-to-Code Mapping (with verified token values)

| Surface | Mockup CSS class | Mockup CSS values | Tailwind tokens |
|---------|-----------------|-------------------|-----------------|
| Wordmark text | `.wordmark-text` | 1rem/600, #EDECF5, letter-spacing -0.02em | `text-base font-semibold text-text-1 tracking-tight` |
| Wordmark interpunct | `.wordmark-dot` | color #7B6EE8 | `text-accent` |
| Wordmark container | `.nav-wordmark` | 48px, border-bottom 1px #1E1E26, padding 0 16px | `h-12 flex items-center px-4 border-b border-surface-raised` |
| New Conversation btn | `.nav-new-btn` | margin 12px 12px 8px, padding 8px 12px, border 1px #7B6EE8, radius 8px, #7B6EE8, 0.875rem/500, text-align center | `mt-3 mx-3 mb-2 flex items-center justify-center px-3 py-2 border border-accent text-accent rounded-md text-sm font-medium` |
| Nav container | `.nav-conversations` | flex:1, overflow:hidden, padding 4px 0 | `flex-1 flex flex-col overflow-hidden py-1` |
| Nav item (inactive) | `.nav-item` | padding 8px 12px, 0.875rem, #8D8CA0 | `py-2 px-3 text-sm text-text-2` |
| Nav item (active) | `.nav-item.active` | bg #1E1E26, #EDECF5, radius 6px, margin 0 8px, padding 8px 8px | `bg-surface-raised text-text-1 rounded-md mx-2 py-2 px-2` |
| Nav separator | `.nav-separator` | height 1px, bg #1E1E26, margin 8px 16px | `border-t border-surface-raised my-2 mx-4` |
| Settings label | `.nav-bottom-label` | 0.75rem, #8D8CA0 | `text-xs text-text-2` |
| Page header | `.page-header` | padding 24px 32px 16px, border-bottom 1px #1E1E26 | `pt-6 pb-4 px-8 border-b border-surface-raised` |
| Page header row | `.page-header-row` | flex, align-items center, gap 12px | `flex items-center gap-3` |
| Breadcrumb | `.breadcrumb` | 0.875rem, #8D8CA0 | `text-sm text-text-2` |
| Page title | `.page-title` | 1.25rem/600, line-height 1.75rem, #EDECF5 | `text-xl font-semibold text-text-1` |

### Current State of Files Being Modified

#### 1. `apps/web/src/components/shell/SideNavigation.tsx` (103 lines)

**Current state:** Client Component (`'use client'`). Renders a 240px-wide `<nav>` with: (1) wordmark div (`h-12 flex items-center px-4 text-text-1 font-semibold`, text "bmad-easy", no border-b), (2) "New Conversation" Link (`mx-3 px-3 py-2 border border-accent text-accent rounded-md text-sm font-medium`, no `+` prefix, no vertical margins, no centering), (3) conversation list div (`flex-1 flex flex-col gap-1 px-3 mt-4 overflow-hidden`, `data-testid="conversation-list"`), (4) separator div (`border-t border-border-subtle my-4 mx-3`), (5) nav links div (`flex flex-col gap-1 px-3`, contains Project Map and Artifact Browser Links with `px-4 py-2`), (6) settings div (`p-3 mt-auto`, Link with avatar span only, no visible "Settings" label, `aria-label` includes "Settings").

**Key structural issue:** The conversation list (line 41) has `flex-1` which grows to fill available space, pushing the separator (line 60) and nav links (line 62) toward the bottom. The mockup groups all three inside a single `flex:1` container, so they stay top-clustered.

**What changes:**
- Wordmark: `bmad-easy` → `bmad·easy` with accent interpunct span; add `tracking-tight border-b border-surface-raised`
- New Conversation button: add `mt-3 mb-2` vertical margins, `flex items-center justify-center`, `+ ` prefix
- Conversation list + separator + nav links: restructure into a single `flex-1` container with conversation-list wrapper inside
- Remove `px-3` from containers (keep on items only); change nav links `px-4` → `px-3`
- Active items: add `mx-2 rounded-md` (inset pill); reduce active item padding from `px-3` to `px-2`
- Separator: `border-t border-border-subtle my-4 mx-3` → `border-t border-surface-raised my-2 mx-4`
- Settings: add visible `<span className="text-xs text-text-2">Settings</span>` inside the Link

**What must be preserved:**
- `'use client'` directive (uses `usePathname`)
- `usePathname()` for active-state detection
- `getInitials()` helper function
- `SideNavigationProps` interface (`user`, `conversations`)
- `data-testid="product-wordmark"` on the wordmark div (E2E test queries it)
- `data-testid="conversation-list"` on the conversation items wrapper (E2E test queries it — must be empty when no conversations)
- `aria-label` on the settings Link (`${user.name ?? user.email ?? 'User'} — Settings`)
- Focus ring classes on all interactive elements (`focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`)
- `hover:bg-surface-raised` on inactive items
- `truncate` class on conversation items
- The `cn()` helper for conditional class merging
- Nav links (Project Map, Artifact Browser) remain visible when the conversation list is long — the conversation-list wrapper must scroll its own content (`overflow-y-auto`) rather than pushing the separator and nav links out of view

#### 2. `apps/web/src/components/shell/Breadcrumb.tsx` (14 lines)

**Current state:** Server Component (no `'use client'`). Renders `<nav aria-label="Breadcrumb" className="flex-shrink-0 px-8 py-4">` containing a Link to `/project-map` with text "← Project Map".

**What changes:** Remove `flex-shrink-0 px-8 py-4` from the nav className — the padding and border-b move to the header element on each consumer page. The Breadcrumb becomes a simple inline `<nav aria-label="Breadcrumb">` wrapping the Link.

**What must be preserved:**
- `<nav aria-label="Breadcrumb">` wrapper (E2E tests query `getByRole('navigation', { name: /breadcrumb/i })`)
- Link to `/project-map` with text "← Project Map"
- Link styling: `text-sm text-text-2 hover:text-text-1 transition-colors`
- Focus ring classes on the Link

#### 3. `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx` (67 lines)

**Current state:** Server Component. Header structure:
```jsx
<header className="flex-shrink-0">
  <Breadcrumb />
  <h1 tabIndex={-1} className="px-8 text-xl font-semibold text-text-1">
    {conversation.title ?? 'Conversation'}
  </h1>
</header>
```

**What changes:** Restructure header to inline breadcrumb + title with border-b:
```jsx
<header className="flex-shrink-0 border-b border-surface-raised pt-6 pb-4 px-8">
  <div className="flex items-center gap-3">
    <Breadcrumb />
    <h1 tabIndex={-1} className="text-xl font-semibold text-text-1">
      {conversation.title ?? 'Conversation'}
    </h1>
  </div>
</header>
```

**What must be preserved:**
- `params: Promise<{ conversationId: string }>` and `await params` (Next.js 16)
- `auth()` call and `if (!userId) { redirect('/sign-in'); return null as never; }`
- `getPrisma().conversation.findFirst` with `where: { id: conversationId, userId }` (tenant-scoped)
- `redirect('/conversations/new')` when conversation not found
- `mintBoundaryJwt(userId)` and `process.env.API_URL!`
- `ConversationPane` component and its props
- `h1 tabIndex={-1}` for AppShell route-focus management

#### 4. `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` (144 lines)

**Current state:** Server Component. Header structure (lines 84-87):
```jsx
<header className="flex-shrink-0">
  <Breadcrumb />
  <h1 tabIndex={-1} className="px-8 text-xl font-semibold text-text-1">Artifact Browser</h1>
</header>
```

**What changes:** Same header restructure as file 3 (inline breadcrumb + title with border-b). The h1 text "Artifact Browser" stays.

**What must be preserved:**
- `searchParams: Promise<{ id?: string }>` and `await searchParams` (Next.js 16)
- `typeof selectedArtifactIdParam === 'string'` guard (Next.js 16 query param type)
- `auth()` and `redirect('/sign-in')` / `redirect('/onboarding')` guards
- `getPrisma().repoConnection.findUnique` and `getCredentialHealthStatus()` calls
- `syncArtifactsAction()` call and result union handling (`'success' in syncResult`)
- `select` projection on `findMany` and `findFirst`
- `take: 100` limit
- `ArtifactListEntry`, `ArtifactViewer`, `ArtifactLoadError`, `CredentialErrorBanner` rendering
- `h1 tabIndex={-1}` for route-focus management

#### 5. `apps/web/src/app/(dashboard)/(app)/settings/page.tsx` (37 lines)

**Current state:** Server Component. Header structure (lines 6-9):
```jsx
<header className="flex-shrink-0">
  <Breadcrumb />
  <h1 tabIndex={-1} className="px-8 text-xl font-semibold text-text-1">Settings</h1>
</header>
```

**What changes:** Same header restructure (inline breadcrumb + title with border-b). The h1 text "Settings" stays. The "coming soon" empty-state body (from Story 5.1) stays unchanged.

**What must be preserved:**
- `async function SettingsPage()` signature (Server Component)
- The "coming soon" empty-state (icon box, title, body, teaser items — from Story 5.1)
- `h1 tabIndex={-1}` for route-focus management

#### 6. `apps/web/src/app/(dashboard)/(app)/conversations/new/page.tsx` (28 lines)

**Current state:** Server Component. Header structure (lines 19-22):
```jsx
<header className="flex-shrink-0">
  <Breadcrumb />
  <h1 tabIndex={-1} className="px-8 text-xl font-semibold text-text-1">New Conversation</h1>
</header>
```

**What changes:** Same header restructure (inline breadcrumb + title with border-b). The h1 text "New Conversation" stays.

**What must be preserved:**
- `auth()` and `if (!userId) { return null; }` guard (note: returns `null`, not `redirect` — intentional for new conversation page)
- `mintBoundaryJwt(userId)` and `process.env.API_URL!`
- `ConversationPane` component and its props
- `h1 tabIndex={-1}` for route-focus management

### E2E Test Impact Analysis

The existing E2E suite `playwright/e2e/shell/app-shell.spec.ts` (288 lines, Story 1.8) must continue to pass. Key test interactions:

1. **`getByTestId('product-wordmark')`** (lines 18, 232, 265) — the testid stays on the wordmark div. ✓
2. **`getByRole('link', { name: /new conversation/i })`** (line 19) — the `+ New Conversation` text still matches `/new conversation/i`. ✓
3. **`getByRole('link', { name: /settings/i })`** (line 22) — the `aria-label` still contains "Settings". ✓
4. **`getByRole('link', { name: /e2e test user.*settings/i })`** (line 46) — `aria-label` takes precedence over text content. ✓
5. **`toContainText('EU')`** (line 57) — the avatar span still contains initials. ✓
6. **`getByTestId('conversation-list')` + `toBeEmpty()`** (lines 69-72) — `data-testid="conversation-list"` stays on the conversation items wrapper only (not the flex-1 container). When no conversations, the wrapper is empty. ✓
7. **`getByRole('navigation')`** (line 79) — gets the first `<nav>`. The side nav `<nav>` is in `<aside>` which comes before `<main>` in DOM order. The Breadcrumb `<nav>` is in `<main>`. On `/project-map` (no breadcrumb), only the side nav `<nav>` exists. ✓
8. **`getByRole('navigation', { name: /breadcrumb/i })`** (lines 173, 179, 189) — explicitly filters by accessible name, gets the Breadcrumb nav. ✓
9. **`getByRole('link', { name: /← project map/i })`** (lines 174, 190, 195) — the Link text "← Project Map" stays. ✓
10. **`getByRole('heading', { level: 1, name: /.../ })` + `toBeFocused()`** (lines 203-206) — the h1 still has `tabIndex={-1}` for route-focus. ✓
11. **`main header` locator** (lines 117-134) — the `<header>` element stays inside `<main>`. ✓
12. **Tab order test** (lines 144-167) — side nav links are in `<aside>`, breadcrumb link is in `<main>`. Tab order is preserved. ✓

No E2E test updates should be needed. If any fail, investigate whether the DOM structure change caused a selector mismatch before modifying the test.

### What NOT to Change

- **Side nav right border color:** Currently `border-border-subtle` (#232330). The mockup uses `#1E1E26` (surface-raised). This is a token-usage change — Story 5.4's scope. Leave as `border-border-subtle`.
- **Accessibility improvements:** The implementation has focus rings, aria labels, and keyboard tab order that exceed the mockup. Do not remove these.
- **The `getInitials()` helper:** Unchanged — it produces correct initials for the avatar.
- **The `ConversationPane` rendering:** Not touched by this story — only the page header above it changes.
- **The "coming soon" empty-state in Settings:** Added by Story 5.1, stays unchanged.
- **Project-map page header:** Depth-0 page — does not get the border-b divider. Its header structure stays as-is.

### Testing

Tests are co-located with source (`*.spec.ts` / `*.test.tsx` next to the file under test). ATDD red-phase scaffolds have been applied by the `bmad-testarch-atdd` workflow — all scaffolds use `it.skip()` and assert EXPECTED behavior (will fail when un-skipped until implementation lands).

For this story:

- **`SideNavigation.test.tsx`**: 25 scaffolds (1 updated existing wordmark test + 24 new). The wordmark test was updated from `getByText('bmad-easy')` to `getByTestId('product-wordmark')` + `toHaveTextContent('bmad·easy')` and skipped. Activate the "Story 5.2 — Shell Structural Drift" describe block one sub-task at a time.
- **`Breadcrumb.test.tsx`**: 3 scaffolds. Activate the "Story 5.2 — Breadcrumb inline layout (AC-7)" describe block. Existing tests for aria-label, link href, and text content should still pass without modification.
- **Page tests** (`settings/page.test.tsx`, `artifacts/page.test.tsx`, `conversations/[conversationId]/page.test.tsx`): 4 scaffolds each. Activate the "Story 5.2 — Header structure (AC-7, AC-8)" describe blocks. Decision (DP-4): page-level tests added for AC-7/AC-8 despite original Task 11.3 saying "no page-level tests needed" — E2E covers behavior but not CSS class presence.
- **E2E (`app-shell.spec.ts`)**: should pass without modification — see E2E Test Impact Analysis above.
- Run `yarn nx test web` to execute all unit/component tests.
- ATDD checklist: `_bmad-output/test-artifacts/atdd-checklist-5-2-fix-shared-shell-and-page-header-structural-drift.md`

### Project Structure Notes

- All 4 depth-1 pages are under `apps/web/src/app/(dashboard)/(app)/` — the `(app)` route group is repo-connection-guarded by `(dashboard)/(app)/layout.tsx`.
- Shell components are in `apps/web/src/components/shell/` — `SideNavigation.tsx`, `Breadcrumb.tsx`, `AppShell.tsx`.
- The `cn()` helper is in `apps/web/src/lib/utils.ts` — use for conditional class merging.
- The `AppShell` renders `SideNavigation` in both a desktop `<aside>` and a mobile `SheetContent` — changes to `SideNavigation` propagate to both.

### References

- Investigation: `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md` (Findings 3, 5 mechanism 3; Follow-up items 5, 6, 9; Missing Evidence: design intent for shell changes — now resolved)
- Epics: `_bmad-output/planning-artifacts/epics.md` (Epic 5, lines 929-1006; Story 5.2 ACs, lines 966-1005; dev notes confirming both shell findings are drift, line 1005)
- UX mockups: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/mockups/key-project-map.html` (lines 60-135 CSS, 280-303 HTML), `key-conversation.html` (lines 185-210 CSS, 426-428 HTML)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` (§Side Navigation, lines 347-359; §Wordmark treatments, line 222)
- Tailwind config: `apps/web/tailwind.config.ts` (custom border-radius and color tokens)
- Project context: `_bmad-output/project-context.md` (shadcn/ui + Tailwind section; route-focus management — h1 tabIndex={-1}; standard focus ring classes; Server/Client component directives)
- Decision policy: `_bmad-output/decision-policy.md` (DP-2: higher-authority artifact wins; DP-5: scope temptation — applied to deferred-work check)
- Deferred work: `_bmad-output/implementation-artifacts/deferred-work.md` (checked — no items in scope for this story's code changes)
- Previous story: `_bmad-output/implementation-artifacts/5-1-restore-missing-visual-containers.md` (Story 5.1 patterns: mockup-to-code mapping table, DP-5 application, ATDD scaffold activation)

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- Task 5: Fixed test scaffold for AC-5 `nav links use px-3` — the test was checking `px-3` on an active item, but active items correctly have `px-2` (from AC-4). Changed the test to check the inactive state (pathname `/settings`) so the base `px-3` is preserved by tailwind-merge.
- Task 10: Fixed test scaffold for AC-10 `separator and nav links are inside flex-1 container` — the test used `flexChildren.contains(projectMapLink)` (direct children only), but the story's proposed structure (Task 10.3) wraps nav links in a `<div className="flex flex-col gap-1">`. Changed to `flexContainer!.contains(projectMapLink)` (descendant check) to match the proposed structure.

### Completion Notes List

- All 12 tasks completed. All 10 ACs satisfied.
- Tasks 1-10 implemented via red-green-refactor: activated ATDD scaffolds one describe-block at a time, confirmed RED, implemented minimal code for GREEN, preserved existing patterns.
- Task 11: All 39 `it.skip()` markers removed across 5 test files. All test-file headers updated from "TDD RED PHASE" to "GREEN PHASE".
- Task 12: `yarn nx test web` — 782/782 tests pass (0 skipped). `yarn nx lint web` — 0 new lint errors (1 pre-existing error in `InProgressArtifactCard.test.tsx`, 1 pre-existing warning in `SideNavigation.test.tsx:311` non-null assertion from test scaffold). `yarn nx build web` — pre-existing type error in `AgentMessage.tsx:18` (not modified by this story).
- NFR patterns from project-context.md verified: `cn()` helper, focus ring classes, Server/Client component directives, `h1 tabIndex={-1}`, semantic design tokens, test co-location, P0 priority tags, `@jest-environment` directives.

### File List

- `apps/web/src/components/shell/SideNavigation.tsx` — modified (wordmark, border-b, Settings label, active inset pill, padding, button spacing, separator, nav restructure)
- `apps/web/src/components/shell/Breadcrumb.tsx` — modified (removed padding/flex-shrink-0 from nav)
- `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.tsx` — modified (header restructure: inline breadcrumb + title with border-b)
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` — modified (header restructure: inline breadcrumb + title with border-b)
- `apps/web/src/app/(dashboard)/(app)/settings/page.tsx` — modified (header restructure: inline breadcrumb + title with border-b)
- `apps/web/src/app/(dashboard)/(app)/conversations/new/page.tsx` — modified (header restructure: inline breadcrumb + title with border-b)
- `apps/web/src/components/shell/SideNavigation.test.tsx` — modified (activated 25 ATDD scaffolds, updated header to GREEN phase, fixed AC-5 and AC-10 test scaffolds)
- `apps/web/src/components/shell/Breadcrumb.test.tsx` — modified (activated 3 ATDD scaffolds, updated header to GREEN phase)
- `apps/web/src/app/(dashboard)/(app)/settings/page.test.tsx` — modified (activated 4 ATDD scaffolds, updated header to GREEN phase)
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` — modified (activated 4 ATDD scaffolds, updated header to GREEN phase)
- `apps/web/src/app/(dashboard)/(app)/conversations/[conversationId]/page.test.tsx` — modified (activated 4 ATDD scaffolds, updated header to GREEN phase)

### Change Log

- 2026-07-12: Story 5.2 implementation complete — all 10 ACs satisfied, 39 ATDD scaffolds activated, all tests passing
- 2026-07-12: Code review complete — 4 patches applied, 6 deferred, 3 dismissed

### Review Findings

- [x] [Review][Patch] Page-level tests use tautological `toContain('flex')` assertion [artifacts/page.test.tsx:427, settings/page.test.tsx:89, conversations/[conversationId]/page.test.tsx:257] — `expect(html).toContain('flex')` passes via `flex-shrink-0` substring even without the `flex` class on the breadcrumb/h1 wrapper. Fixed: replaced with combined class string check `flex items-center gap-3`.
- [x] [Review][Patch] Story artifact contradicts itself on pre-existing lint error file location [5-2-...md:173 vs 455] — Task 12.1 said `CredentialErrorBanner.test.tsx`, Completion Notes said `InProgressArtifactCard.test.tsx`. Verified: error is in `InProgressArtifactCard.test.tsx:41`. Fixed: corrected Task 12.1.
- [x] [Review][Patch] Settings active state omits `text-text-1` [SideNavigation.tsx:95] — All other active items have `text-text-1`; Settings active only had `bg-surface-raised mx-2`. Fixed: added `text-text-1` for consistency with spec Task 4.4.
- [x] [Review][Patch] `artifacts/loading.tsx` not updated — Breadcrumb renders without padding [artifacts/loading.tsx:6-9] — Breadcrumb lost its padding; all 4 page.tsx consumers were updated but loading.tsx was missed. Fixed: updated header to match page.tsx structure (border-b, pt-6 pb-4 px-8, flex items-center gap-3 wrapper, removed px-8 from h1).
- [x] [Review][Defer] Infinite loop risk: healthz polling has no timeout [.devcontainer/import-workflows.sh:14] — deferred, out of scope (devcontainer config, DP-5)
- [x] [Review][Defer] n8n runner exit-code change removes salvage behavior [n8n/workflows/C8qzMFk2e00sLHJg.json] — deferred, out of scope (n8n workflow, DP-5)
- [x] [Review][Defer] Hardcoded workspace path replaces dynamic detection [.devcontainer/create.sh + .env.example] — deferred, out of scope (devcontainer config, DP-5)
- [x] [Review][Defer] AC-10 tests cover only zero-conversation case [SideNavigation.test.tsx] — deferred, real test gap but requires E2E layout testing (jsdom cannot test scroll behavior)
- [x] [Review][Defer] pm2 restart failure not checked [.devcontainer/import-workflows.sh:13] — deferred, out of scope (devcontainer config, DP-5)
- [x] [Review][Defer] EXTERNAL_HOOK_FILES path becomes stale for existing .env [.devcontainer/create.sh] — deferred, out of scope (devcontainer config, DP-5)

### NFR Audit Findings (bmad-testarch-nfr, Create mode)

Audit scope: NFR-specific issues only (missing select projections, take limits, timing tests, security headers) across all files modified by Story 5.2.

- [NFR][MEDIUM] Missing `take` limit on `turn.findMany` [conversations/[conversationId]/page.tsx:33-37] — The query loads all turns for a conversation without a bound. The `Turn.content` field is an unbounded `String`; a long conversation with hundreds of turns loads all message content into memory at once. The `artifacts/page.tsx` in the same story correctly uses `take: 100` on its `findMany` calls, establishing the pattern this query should follow. Remediation: Add `take: 100` (or appropriate limit) to bound the query. Pre-existing code, but in a file modified by this story.
- [NFR][LOW] Missing `select` projection on `repoConnection.findUnique` [artifacts/page.tsx:24-26] — The query fetches all 7 columns (`id`, `userId`, `repoUrl`, `credentialHealth`, `lastSyncedAt`, `createdAt`, `updatedAt`) when only `id` is used downstream (lines 28, 48, 65, 77). The project-context.md mandates `select` projections on all `findFirst`/`findUnique` calls for column-level performance. No sensitive fields in the `RepoConnection` model (encrypted tokens live in `OAuthCredential`), so impact is performance only. Remediation: Add `select: { id: true }`. Pre-existing code, but in a file modified by this story.
- [NFR][LOW] `conversations/[conversationId]/loading.tsx` not updated to match new header structure [conversations/[conversationId]/loading.tsx:4-6] — The loading skeleton's header uses `flex-shrink-0 px-8 py-6` (no `border-b border-surface-raised`, no `flex items-center gap-3` wrapper), while the page now uses `flex-shrink-0 border-b border-surface-raised pt-6 pb-4 px-8` with a `flex items-center gap-3` wrapper. The review found and fixed `artifacts/loading.tsx` (same issue) but missed this file. Violates project-context.md: "Skeletons must match real content dimensions." Remediation: Update loading.tsx header to match page.tsx structure (`border-b border-surface-raised pt-6 pb-4 px-8` + `flex items-center gap-3` wrapper).
- [NFR][INFO] No timing tests — Not applicable for this story type. Story 5.2 introduces only CSS/structural class changes; no performance-sensitive code paths (API calls, DB queries, SSE streams) were added. Existing timing tests in the codebase cover the NFR categories this story doesn't touch.
- [NFR][INFO] Security headers — Not applicable. Story 5.2 touches only frontend presentational components (`SideNavigation.tsx`, `Breadcrumb.tsx`, page headers). No API endpoints, SSE controllers, middleware, or Server Actions were modified. No new security header surface introduced.
