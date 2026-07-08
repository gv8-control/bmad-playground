# Story 5.2: Fix Shared Shell and Page-Header Structural Drift

Status: ready-for-dev

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
**And** it does not show `bmad-easy` with a plain hyphen (investigation: `apps/web/src/components/shell/SideNavigation.tsx:30-31` vs `key-project-map.html:78-79`)

### AC-2: Wordmark border-bottom separator

**Given** the side navigation brand mark area
**When** it renders
**Then** a border-bottom separator appears below the wordmark, dividing the brand area from the navigation links (investigation: `SideNavigation.tsx:30` vs `key-project-map.html:71-77`)

### AC-3: "Settings" visible label next to avatar

**Given** the bottom-pinned settings entry in the side navigation
**When** it renders
**Then** a visible "Settings" text label appears next to the avatar circle
**And** it is not avatar-only (investigation: `SideNavigation.tsx:88-99` vs `key-project-map.html:300-303`)
**Note:** This may be an intentional redesign — confirm with design/PM before implementing. See Dev Notes.

### AC-4: Active-state inset pill styling

**Given** the active nav item
**When** it renders
**Then** it uses the inset pill styling from DESIGN.md: margin `0 8px`, `rounded-md` (6px radius)
**And** it does not use a full-width bar (investigation: `SideNavigation.tsx:48-54` vs `key-project-map.html:113-119`)

### AC-5: Single horizontal padding (no doubling)

**Given** navigation items in the side navigation
**When** they render
**Then** horizontal padding totals 12px (matching the mockup)
**And** padding is not doubled from a wrapper `px-3` plus item-level `px-3` = 24px (investigation: `SideNavigation.tsx:41` vs `key-project-map.html:102-111`)

### AC-6: Nav button spacing and alignment

**Given** nav buttons (e.g. "New Conversation") in the side navigation
**When** they render
**Then** vertical margins between buttons match the mockup spacing
**And** button text is vertically centered
**And** the "New Conversation" button includes the `+` prefix shown in the mockup (investigation: `SideNavigation.tsx:34-39` vs `key-project-map.html:81-93`)

### AC-7: Breadcrumb inline beside page title

**Given** a depth-1 page header (Conversation, Artifact Browser, Settings, New Conversation)
**When** it renders
**Then** the Breadcrumb renders inline beside the page title on a single flex row
**And** it is not stacked above the title as its own row with `py-4` padding (investigation: `apps/web/src/components/shell/Breadcrumb.tsx:5-12` vs `key-conversation.html:189-193`)

### AC-8: Header bottom divider on all depth-1 pages

**Given** depth-1 page headers (Conversation, Artifact Browser, Settings, New Conversation)
**When** they render
**Then** a 1px header bottom divider (`border-b`) is present on each
**And** the divider color matches the mockup's `#1E1E26` (which maps to the `surface-raised` token) (investigation: all `page.tsx` files vs mockup `.page-header { border-bottom: 1px solid #1E1E26 }`)

### AC-9: Nav separator styling

**Given** the separator between conversation list and nav links in the side navigation
**When** it renders
**Then** it uses `my-2` (not `my-4`), `border-border-subtle` or `border-surface-raised` (per token-usage story 5-4), and `mx-4` (not `mx-3`) (investigation: `SideNavigation.tsx:60` vs `key-project-map.html:121-125`)

## Tasks / Subtasks

- [ ] Task 1: Fix wordmark brand mark with accent interpunct (AC: 1)
  - [ ] 1.1 In `apps/web/src/components/shell/SideNavigation.tsx` (lines 30-31), change the wordmark from `bmad-easy` (plain hyphen) to `bmad·easy` with an accent-colored interpunct
  - [ ] 1.2 Render the interpunct (·) in `text-accent` color, with the "bmad" and "easy" parts in `text-text-1`
  - [ ] 1.3 Verify the result matches `key-project-map.html:78-79`

- [ ] Task 2: Add wordmark border-bottom separator (AC: 2)
  - [ ] 2.1 In `apps/web/src/components/shell/SideNavigation.tsx` (line 30), add a `border-b` separator below the wordmark area
  - [ ] 2.2 Use the same border color token as other shell hairlines (see Story 5-4 for `border-surface-raised` vs `border-border-subtle` decision)
  - [ ] 2.3 Verify the separator matches `key-project-map.html:71-77`

- [ ] Task 3: Restore "Settings" visible label next to avatar (AC: 3)
  - [ ] 3.1 **Before implementing**: confirm with design/PM whether the "Settings" label was deliberately removed (intentional redesign) or is drift. See Dev Notes.
  - [ ] 3.2 If confirmed as drift: in `apps/web/src/components/shell/SideNavigation.tsx` (lines 88-99), add a visible "Settings" text label next to the avatar circle (matching `key-project-map.html:300-303`)
  - [ ] 3.3 If confirmed as intentional: skip this task, document the decision in Completion Notes, and update the AC

- [ ] Task 4: Fix active-state inset pill styling (AC: 4)
  - [ ] 4.1 In `apps/web/src/components/shell/SideNavigation.tsx` (lines 48-54), change the active nav item from a full-width bar to an inset pill: add `mx-2` (margin 0 8px) and `rounded-md` (6px radius)
  - [ ] 4.2 Verify the inactive items do not get the inset margin (only active state) (matching `key-project-map.html:113-119`)

- [ ] Task 5: Fix double horizontal padding (AC: 5)
  - [ ] 5.1 In `apps/web/src/components/shell/SideNavigation.tsx` (line 41), resolve the doubled horizontal padding: currently the wrapper has `px-3` (12px) and items also have `px-3` (12px) = 24px total, but the mockup specifies 12px total
  - [ ] 5.2 Either remove `px-3` from the wrapper (keep it on items only), or remove `px-3` from items (keep it on wrapper only) — match whichever pattern the mockup uses at `key-project-map.html:102-111`

- [ ] Task 6: Fix nav button spacing and alignment (AC: 6)
  - [ ] 6.1 In `apps/web/src/components/shell/SideNavigation.tsx` (lines 34-39), add missing vertical margins between nav buttons to match the mockup spacing
  - [ ] 6.2 Ensure button text is vertically centered (check `items-center` / `flex` alignment)
  - [ ] 6.3 Add the `+` prefix to the "New Conversation" button label (matching `key-project-map.html:81-93`)

- [ ] Task 7: Refactor Breadcrumb to render inline beside title (AC: 7)
  - [ ] 7.1 In `apps/web/src/components/shell/Breadcrumb.tsx` (lines 5-12), refactor the component so the breadcrumb renders inline beside the page title on a single flex row, not stacked above as its own row with `py-4` padding
  - [ ] 7.2 The consumer pages (`conversations/[id]/page.tsx`, `artifacts/page.tsx`, `settings/page.tsx`, `conversations/new/page.tsx`) should render the breadcrumb and h1 in a single `flex items-center gap-2` container (matching `key-conversation.html:189-193`)
  - [ ] 7.3 Remove the separate stacked `py-4` row that currently wraps the breadcrumb alone

- [ ] Task 8: Add header bottom divider on all depth-1 pages (AC: 8)
  - [ ] 8.1 In each depth-1 page's header element, add `border-b` with the hairline border color token:
    - `apps/web/src/app/(dashboard)/conversations/[conversationId]/page.tsx`
    - `apps/web/src/app/(dashboard)/artifacts/page.tsx`
    - `apps/web/src/app/(dashboard)/settings/page.tsx`
    - `apps/web/src/app/(dashboard)/conversations/new/page.tsx`
  - [ ] 8.2 The divider should match the mockup's `1px solid #1E1E26` (maps to `border-surface-raised` — coordinate with Story 5-4 for the final token choice)
  - [ ] 8.3 Verify depth-0 pages (e.g. project-map) do NOT get the divider if the mockup omits it there

- [ ] Task 9: Fix nav separator styling (AC: 9)
  - [ ] 9.1 In `apps/web/src/components/shell/SideNavigation.tsx` (line 60), change the separator from `my-4` to `my-2` (vertical margin)
  - [ ] 9.2 Change `mx-3` to `mx-4` (horizontal margin)
  - [ ] 9.3 The border color should use `border-surface-raised` (coordinate with Story 5-4's hairline token decision) (matching `key-project-map.html:121-125`)

- [ ] Task 10: Write/update co-located tests (AC: 1-9)
  - [ ] 10.1 Update `apps/web/src/components/shell/SideNavigation.test.tsx` — assert wordmark renders `bmad·easy` with accent interpunct; assert border-bottom separator; assert active item uses inset pill (mx-2, rounded-md); assert single horizontal padding (12px, not 24px); assert nav button spacing and `+` prefix; assert separator uses my-2 mx-4
  - [ ] 10.2 Update `apps/web/src/components/shell/Breadcrumb.test.tsx` — assert it renders inline beside title in a flex row, not stacked above
  - [ ] 10.3 Update or create page tests for each depth-1 page — assert `border-b` divider on header

- [ ] Task 11: Verify build, lint, and tests
  - [ ] 11.1 Run `yarn nx lint web` — confirm 0 lint errors
  - [ ] 11.2 Run `yarn nx test web` — confirm all tests pass
  - [ ] 11.3 Run `yarn nx typecheck web` — confirm no type errors
  - [ ] 11.4 Run `yarn nx build web` — confirm production build succeeds

## Dev Notes

### Architecture Context

This story fixes shared-shell structural drift in `SideNavigation.tsx` and `Breadcrumb.tsx`, plus page-header layout across 4 depth-1 pages. The shell is rendered once in `AppShell.tsx` / `(dashboard)/layout.tsx` and inherited by every authenticated page, so fixes here propagate broadly. The Breadcrumb fix (AC-7) is the highest-leverage single change: it improves fidelity on 4 surfaces with one component refactor. Per the investigation's Deduction 3, the Breadcrumb/header layout is the highest-leverage fix in the entire epic.

### Design Confirmation Needed

Two shell findings may be **intentional redesigns** rather than drift, per the investigation's Missing Evidence section. Before implementing, confirm with design/PM:

1. **Nav links relocated from top-grouped cluster to bottom-pinned** (`SideNavigation.tsx:41-60,87` vs `key-project-map.html:96-100,287-298`) — the mockup groups nav links at the top; the implementation pins them at the bottom. This is NOT in scope for this story but should be flagged.
2. **"Settings" label removed, leaving avatar-only** (`SideNavigation.tsx:88-99` vs `key-project-map.html:300-303`) — AC-3 covers this. If it is intentional, skip AC-3 and document the decision.

If the designer/PM confirms these are intentional redesigns, do NOT "fix" them — the mockup is stale, and the implementation is the new authority for those items.

### Mockup References

| Surface | Mockup File | Implementation File | Lines to Compare |
|---------|------------|---------------------|------------------|
| Shell wordmark | `key-project-map.html` | `SideNavigation.tsx` | Mockup: 71-79; Code: 30-31 |
| Shell active state | `key-project-map.html` | `SideNavigation.tsx` | Mockup: 113-119; Code: 48-54 |
| Shell padding | `key-project-map.html` | `SideNavigation.tsx` | Mockup: 102-111; Code: 41 |
| Shell nav buttons | `key-project-map.html` | `SideNavigation.tsx` | Mockup: 81-93; Code: 34-39 |
| Shell separator | `key-project-map.html` | `SideNavigation.tsx` | Mockup: 121-125; Code: 60 |
| Shell settings label | `key-project-map.html` | `SideNavigation.tsx` | Mockup: 300-303; Code: 88-99 |
| Breadcrumb layout | `key-conversation.html` | `Breadcrumb.tsx` | Mockup: 189-193; Code: 5-12 |
| Page headers (divider) | `key-conversation.html` | all depth-1 `page.tsx` | Mockup: `.page-header { border-bottom: 1px solid #1E1E26 }` |

### Key Implementation Details

- **Wordmark interpunct**: The mockup renders `bmad` + an accent-colored `·` + `easy`. Use `<span className="text-accent">·</span>` between the two words. The `·` character is U+00B7 (middle dot).
- **Active-state inset pill**: The mockup uses `margin: 0 8px` (which is `mx-2` in Tailwind) and `border-radius: 6px` (which is `rounded-md`). The active background should remain `bg-surface-raised`; only the shape changes from full-width to inset pill.
- **Double padding fix**: The root cause is a wrapper `<nav>` or `<div>` with `px-3` containing items that also have `px-3`. The fix is to apply padding at only one level. Check the mockup's computed padding (12px = `px-3` at one level) and remove the redundant one.
- **Breadcrumb inline**: The mockup renders the breadcrumb and title as `<div class="flex items-center gap-2"><span>← Project Map</span><h1>...</h1></div>`. The current implementation renders breadcrumb as its own full-width row with `py-4` above the title. Refactor the consumer pages to use the inline flex pattern. The `Breadcrumb` component itself should be a simple inline element (no wrapping div with `py-4`).
- **Header divider**: The mockup specifies `1px solid #1E1E26`. The hex `#1E1E26` maps to the `surface-raised` token in DESIGN.md. However, Story 5-4 addresses the `border-border-subtle` vs `border-surface-raised` decision for hairlines — coordinate with that story for the final token. Use `border-surface-raised` if 5-4 confirms it, otherwise `border-border-subtle` if 5-4 adds it to DESIGN.md.
- **Nav separator**: Current uses `my-4 mx-3`; mockup uses `my-2 mx-4`. These are small spacing corrections. The border color should match the shell hairline decision from Story 5-4.

### What NOT to Change

- **Nav links placement (top vs bottom)**: The investigation flags that nav links were relocated from a top-grouped cluster to bottom-pinned. This may be intentional. Do NOT change nav link placement without design confirmation. This story only fixes the styling of the links within their current position.
- **Accessibility improvements**: The implementation has focus rings, aria labels, and keyboard tab order that exceed the mockup. Do not remove these.
- **Token values**: Do not change token values. This story is structural/layout only. Token-usage drift (e.g. `border-border-subtle` vs `border-surface-raised`) is handled in Story 5-4.
- **Prior conversation-drift spec fixes**: The spec `spec-ux-spec-drift-conversation-ui.md` did not touch the shell. No conflicts expected, but verify no regression in conversation component tests after Breadcrumb refactor.

### Testing

Tests are co-located with source (`*.spec.ts` / `*.test.tsx` next to the file under test). For this story:
- `SideNavigation.test.tsx`: assert wordmark text/interpunct, border-bottom, active pill styling, padding, button spacing, separator margins.
- `Breadcrumb.test.tsx`: assert inline rendering (no stacked `py-4` row).
- Page tests: assert `border-b` divider on depth-1 page headers.
- E2E: existing `playwright/e2e/shell/app-shell.spec.ts` should still pass — verify no regression in nav visibility, active item, or breadcrumb.
- Run `yarn nx test web` to execute all unit/component tests.

### References

- Investigation: `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md` (Findings 3, 5 mechanism 3; Follow-up items 5, 6, 9; Missing Evidence: design intent for shell changes)
- UX mockups: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/mockups/key-project-map.html`, `key-conversation.html`
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md`
- Project context: `_bmad-output/project-context.md` (shadcn/ui + Tailwind section, lines 181-187; focus ring pattern)
- Story 5-4 (token-usage drift): coordinates the `border-border-subtle` vs `border-surface-raised` hairline token decision

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
