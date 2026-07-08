# Story 5.4: Fix Token-Usage Drift and Token-Config Gaps

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer maintaining the design system,
I want tokens used correctly and config gaps closed,
so that drift doesn't recur and the design system is enforced.

## Acceptance Criteria

### AC-1: Project-map artifact card hover border (UX-DR)

**Given** project-map artifact cards
**When** they are hovered
**Then** the border uses `hover:border-accent`
**And** it does not use `hover:border-text-3` (investigation: `apps/web/src/components/project-map/ArtifactCard.tsx:53` vs `key-project-map.html:218`)

### AC-2: Onboarding input recessed background and label color (UX-DR)

**Given** the onboarding Repository URL input
**When** it renders
**Then** the input background is `bg-bg` (recessed)
**And** it is not `bg-surface` (raised) (investigation: `apps/web/src/components/onboarding/RepositoryUrlForm.tsx:53` vs `key-onboarding.html:128-135`)
**And** the field label uses `text-text-1`
**And** it does not use `text-text-2` (investigation: `RepositoryUrlForm.tsx:41` vs `key-onboarding.html:114-121`)

### AC-3: Onboarding focus ring offset correct for recessed input (UX-DR)

**Given** the onboarding Repository URL input
**When** it is focused
**Then** the focus ring offset uses `ring-offset-bg` (since no surface card wraps the field)
**And** it does not use `ring-offset-surface` (investigation: `RepositoryUrlForm.tsx:53` vs `key-onboarding.html:140-143`)
**And** the input border color transitions to `accent` on focus and `negative` on error (investigation: `RepositoryUrlForm.tsx:53` vs `key-onboarding.html:140-146`)

### AC-4: Conversation Retry and Save buttons use accent-fg text (UX-DR)

**Given** the Retry button and Save-in-popover button in the conversation
**When** they render on an accent surface
**Then** their text color uses `text-accent-fg`
**And** it does not use `text-bg` (investigation: `apps/web/src/components/conversation/ConversationPane.tsx:903`, `apps/web/src/components/conversation/WorkingTreeIndicator.tsx:179`)
**Note:** The prior drift spec already fixed `text-bg` → `text-accent-fg` on the *Send* button (`ChatInput.tsx`). Do NOT re-fix the Send button. This AC covers the *Retry* and *Save* buttons only.

### AC-5: Artifact-browser list entry hover and date color (UX-DR)

**Given** artifact-browser list entries
**When** they are hovered or display last-modified dates
**Then** the hover background uses `hover:bg-surface-raised` (no `/60` opacity modifier)
**And** dates use `text-text-3`
**And** the hover does not use `hover:bg-surface-raised/60`, and dates do not use `text-text-2` (investigation: `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx:71-74,81-83` vs `key-artifact-browser.html:209,211,236`)

### AC-6: Shell and artifact-browser hairline border token (UX-DR)

**Given** shell hairline dividers and artifact-browser hairlines
**When** they render
**Then** `border-border-subtle` is replaced with `border-surface-raised`
**Or** if `border-subtle` is the intended token, it is added to DESIGN.md as a documented token before continued use (investigation: `apps/web/src/components/shell/SideNavigation.tsx:29,60`, `apps/web/src/app/(dashboard)/artifacts/page.tsx:91`, `apps/web/src/components/artifact-browser/ArtifactViewer.tsx:19` vs mockup `#1E1E26`)

### AC-7: Scrollbar hiding on scrollable panels (UX-DR)

**Given** scrollable panels on the 3 affected surfaces (shell, conversation, artifact-browser)
**When** they overflow and scroll
**Then** scrollbars are hidden via `scrollbar-width: none` (Firefox) and `::-webkit-scrollbar { display: none }` (Chrome/Safari)
**And** the rules are defined in `apps/web/src/app/global.css` or as a reusable utility class (investigation: Finding 5 mechanism 5)

### AC-8: Floating box-shadow token added to Tailwind config (UX-DR)

**Given** the Tailwind config at `apps/web/tailwind.config.ts`
**When** it is updated
**Then** a `boxShadow: { floating: '0 8px 24px rgba(0,0,0,0.4)' }` token is added
**And** the value matches DESIGN.md line 327 (investigation: Finding 2, gap 2)

### AC-9: WorkingTreeIndicator uses floating shadow token (UX-DR)

**Given** the `WorkingTreeIndicator` component
**When** it renders as a floating element (popover/tooltip)
**Then** it uses the new `shadow-floating` token
**And** it does not use Tailwind's default `shadow-lg`, which has a different value (investigation: `apps/web/src/components/conversation/WorkingTreeIndicator.tsx:139,207`)

### AC-10: Font-weight override enforces 400/500/600 (UX-DR)

**Given** the Tailwind config at `apps/web/tailwind.config.ts`
**When** it is updated
**Then** a `fontWeight` override is added enforcing the DESIGN.md constraint: `regular=400, medium=500, semibold=600`
**And** weights above 600 (e.g. `font-bold=700`, `font-extrabold=800`) are blocked (investigation: Finding 2, gap 1; DESIGN.md line 445)

### AC-11: Evaluate replacing `theme.extend` with full `theme` overrides (UX-DR)

**Given** the Tailwind config's use of `theme.extend`
**When** the design-system enforcement is evaluated
**Then** the team considers replacing `extend` for tokenized categories (colors, spacing, radii, font) with full `theme` overrides
**So that** non-design-system defaults (`text-red-500`, `bg-gray-400`, `rounded-3xl`, etc.) are no longer available alongside the design system (investigation: Finding 2, gap 3)
**Note:** This is a staging consideration — see Dev Notes for the staging approach.

## Tasks / Subtasks

- [ ] Task 1: Fix project-map artifact card hover border (AC: 1)
  - [ ] 1.1 In `apps/web/src/components/project-map/ArtifactCard.tsx` (line 53), change `hover:border-text-3` to `hover:border-accent` (matching `key-project-map.html:218`)

- [ ] Task 2: Fix onboarding input background, label color, and focus ring (AC: 2, 3)
  - [ ] 2.1 In `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` (line 53), change input background from `bg-surface` to `bg-bg` (recessed, not raised) (matching `key-onboarding.html:128-135`)
  - [ ] 2.2 In `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` (line 41), change field label from `text-text-2` to `text-text-1` (matching `key-onboarding.html:114-121`)
  - [ ] 2.3 In `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` (line 53), change focus ring offset from `ring-offset-surface` to `ring-offset-bg` (matching `key-onboarding.html:140-143`)
  - [ ] 2.4 In `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` (line 53), set input border to transition to `border-accent` on focus and `border-negative` on error (matching `key-onboarding.html:140-146`)

- [ ] Task 3: Fix conversation Retry and Save button text color (AC: 4)
  - [ ] 3.1 In `apps/web/src/components/conversation/ConversationPane.tsx` (line 903), change Retry button text color from `text-bg` to `text-accent-fg`
  - [ ] 3.2 In `apps/web/src/components/conversation/WorkingTreeIndicator.tsx` (line 179), change Save-in-popover button text color from `text-bg` to `text-accent-fg`
  - [ ] 3.3 Verify the Send button in `ChatInput.tsx` already uses `text-accent-fg` (fixed by prior spec) — do NOT touch it

- [ ] Task 4: Fix artifact-browser list entry hover and date color (AC: 5)
  - [ ] 4.1 In `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` (lines 71-74), change `hover:bg-surface-raised/60` to `hover:bg-surface-raised` (remove the `/60` opacity modifier) (matching `key-artifact-browser.html:209,211`)
  - [ ] 4.2 In `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` (lines 81-83), change date color from `text-text-2` to `text-text-3` (matching `key-artifact-browser.html:236`)

- [ ] Task 5: Fix hairline border tokens (AC: 6)
  - [ ] 5.1 **Decision**: decide whether to replace `border-border-subtle` with `border-surface-raised`, OR add `border-subtle` as a documented token in DESIGN.md. The mockup's `#1E1E26` maps to `surface-raised` in DESIGN.md.
  - [ ] 5.2 If replacing: in `apps/web/src/components/shell/SideNavigation.tsx` (lines 29, 60), change `border-border-subtle` to `border-surface-raised`
  - [ ] 5.3 If replacing: in `apps/web/src/app/(dashboard)/artifacts/page.tsx` (line 91), change `border-border-subtle` to `border-surface-raised`
  - [ ] 5.4 If replacing: in `apps/web/src/components/artifact-browser/ArtifactViewer.tsx` (line 19), change `border-border-subtle` to `border-surface-raised`
  - [ ] 5.5 If documenting: add `border-subtle` to DESIGN.md as a token with the `#1E1E26` value, and keep `border-border-subtle` in code
  - [ ] 5.6 Coordinate with Story 5-2 (AC-8, AC-9) which also uses shell hairline tokens

- [ ] Task 6: Add scrollbar hiding to global CSS (AC: 7)
  - [ ] 6.1 In `apps/web/src/app/global.css`, add scrollbar hiding rules:
    ```
    .no-scrollbar { scrollbar-width: none; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    ```
  - [ ] 6.2 Apply the `no-scrollbar` utility class (or add a global rule) to scrollable panels on:
    - Shell: side navigation list in `SideNavigation.tsx`
    - Conversation: message panel in `ChatMessageList.tsx`
    - Artifact-browser: artifact list pane in `artifacts/page.tsx` or `ArtifactList.tsx`
  - [ ] 6.3 Verify scroll still works (scrollbar hidden, but content still scrollable via wheel/trackpad/touch)

- [ ] Task 7: Add floating box-shadow token to Tailwind config (AC: 8)
  - [ ] 7.1 In `apps/web/tailwind.config.ts`, add to `theme.extend.boxShadow`: `floating: '0 8px 24px rgba(0,0,0,0.4)'` (matching DESIGN.md line 327)

- [ ] Task 8: Replace shadow-lg with shadow-floating on WorkingTreeIndicator (AC: 9)
  - [ ] 8.1 In `apps/web/src/components/conversation/WorkingTreeIndicator.tsx` (line 139), replace `shadow-lg` with `shadow-floating`
  - [ ] 8.2 In `apps/web/src/components/conversation/WorkingTreeIndicator.tsx` (line 207), replace `shadow-lg` with `shadow-floating`
  - [ ] 8.3 Search the codebase for any other `shadow-lg` usage on floating elements and replace with `shadow-floating` where appropriate

- [ ] Task 9: Add font-weight override to Tailwind config (AC: 10)
  - [ ] 9.1 In `apps/web/tailwind.config.ts`, add to `theme.extend.fontWeight`: `regular: '400', medium: '500', semibold: '600'`
  - [ ] 9.2 **Before adding the full override**: grep the codebase (`grep -r "font-bold\|font-extrabold\|font-black" apps/web/src/`) to find any existing usage of weights above 600. Migrate any real uses to `font-semibold` (600) before blocking them.
  - [ ] 9.3 To fully block weights above 600, replace `theme.extend.fontWeight` with `theme.fontWeight` (full override) so `font-bold` and `font-extrabold` are no longer available. Alternatively, list all allowed weights in the extend and rely on review to catch violations.

- [ ] Task 10: Evaluate and stage `theme.extend` → full `theme` overrides (AC: 11)
  - [ ] 10.1 **Before switching**: grep the codebase for non-design-system utility usage:
    - `grep -rE "text-(red|blue|green|yellow|gray|slate|zinc|neutral|stone|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-[0-9]" apps/web/src/`
    - `grep -rE "bg-(red|blue|green|yellow|gray|...)-[0-9]" apps/web/src/`
    - `grep -rE "rounded-(3xl|2xl)" apps/web/src/`
  - [ ] 10.2 Migrate any real uses found to design-system tokens
  - [ ] 10.3 Replace `theme.extend` with full `theme` overrides for `colors`, `spacing`, `borderRadius`, and `fontFamily` categories so defaults are blocked
  - [ ] 10.4 **This task is a staging consideration** — if non-design-system uses are found and migration is non-trivial, defer to a follow-up story and document the decision. The goal is that the switch is a guardrail, not a regression.

- [ ] Task 11: Write/update co-located tests (AC: 1-10)
  - [ ] 11.1 Update `apps/web/src/components/project-map/ArtifactCard.test.tsx` — assert hover class includes `hover:border-accent`
  - [ ] 11.2 Update `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx` — assert input uses `bg-bg`, label uses `text-text-1`, focus ring offset uses `ring-offset-bg`
  - [ ] 11.3 Update `apps/web/src/components/conversation/ConversationPane.test.tsx` — assert Retry button uses `text-accent-fg`
  - [ ] 11.4 Update `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx` — assert Save button uses `text-accent-fg`; assert `shadow-floating` class (not `shadow-lg`)
  - [ ] 11.5 Update `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` — assert hover uses `hover:bg-surface-raised` (no `/60`); assert dates use `text-text-3`
  - [ ] 11.6 Update or create `apps/web/src/app/global.css.test.ts` or a utility test — assert `.no-scrollbar` class exists (if testable)
  - [ ] 11.7 Verify Tailwind config changes compile: run `yarn nx build web` and check for utility generation

- [ ] Task 12: Verify build, lint, and tests
  - [ ] 12.1 Run `yarn nx lint web` — confirm 0 lint errors
  - [ ] 12.2 Run `yarn nx test web` — confirm all tests pass
  - [ ] 12.3 Run `yarn nx typecheck web` — confirm no type errors
  - [ ] 12.4 Run `yarn nx build web` — confirm production build succeeds (especially important after Tailwind config changes — verify new tokens generate utilities)

## Dev Notes

### Architecture Context

This story closes token-usage drift (correct tokens exist but wrong ones are used in components) and token-config gaps (structural Tailwind config issues that create drift risk). The investigation confirmed 42/42 token values match DESIGN.md exactly — the problem is token *selection*, not token *definition*. This story fixes the selection and adds config guardrails to prevent recurrence.

The story is low-effort per-AC but spans multiple surfaces (project-map, onboarding, conversation, artifact-browser, shell). The config changes (AC-8, AC-10, AC-11) are structural and affect the entire design system, so they should be verified carefully with a production build.

### Prior Conversation-Drift Spec — What NOT to Re-fix

The prior spec `spec-ux-spec-drift-conversation-ui.md` (commit c7c1c5a) already fixed token-usage drift on these conversation elements:
- **Send button text color**: `text-bg` → `text-accent-fg` on `ChatInput.tsx:65` — **already fixed, do NOT touch**
- **Textarea background**: `bg-surface` → `bg-surface-raised` on `ChatInput.tsx:65` — **already fixed, do NOT touch**
- **Textarea border radius**: `rounded-md` → `rounded-lg` on `ChatInput.tsx:65` — **already fixed, do NOT touch**
- **Slash picker background**: `bg-surface` → `bg-surface-raised` on `SlashCommandPicker.tsx:32` — **already fixed, do NOT touch**
- **Slash picker shadow**: removed `shadow-lg` on `SlashCommandPicker.tsx:32` — **already fixed, do NOT touch**
- **ToolPill completion color**: `text-positive` → `text-text-2` on `ToolPill.tsx:64` — **already fixed, do NOT touch**

This story's AC-4 covers the **Retry button** (`ConversationPane.tsx:903`) and **Save-in-popover button** (`WorkingTreeIndicator.tsx:179`) — these are DIFFERENT components from the Send button and were NOT covered by the prior spec. The `text-bg` → `text-accent-fg` fix is needed here.

### Mockup References

| Surface | Mockup File | Implementation File | Lines to Compare |
|---------|------------|---------------------|------------------|
| Project-map card hover | `key-project-map.html` | `ArtifactCard.tsx` | Mockup: 218; Code: 53 |
| Onboarding input bg | `key-onboarding.html` | `RepositoryUrlForm.tsx` | Mockup: 128-135; Code: 53 |
| Onboarding label | `key-onboarding.html` | `RepositoryUrlForm.tsx` | Mockup: 114-121; Code: 41 |
| Onboarding focus ring | `key-onboarding.html` | `RepositoryUrlForm.tsx` | Mockup: 140-143; Code: 53 |
| Onboarding border focus/error | `key-onboarding.html` | `RepositoryUrlForm.tsx` | Mockup: 140-146; Code: 53 |
| Conversation Retry button | — | `ConversationPane.tsx` | Code: 903 |
| Conversation Save button | — | `WorkingTreeIndicator.tsx` | Code: 179 |
| Artifact-browser hover | `key-artifact-browser.html` | `ArtifactListEntry.tsx` | Mockup: 209, 211; Code: 71-74 |
| Artifact-browser dates | `key-artifact-browser.html` | `ArtifactListEntry.tsx` | Mockup: 236; Code: 81-83 |
| Shell hairlines | `key-project-map.html` | `SideNavigation.tsx` | Mockup: `#1E1E26`; Code: 29, 60 |
| Artifact-browser hairlines | `key-artifact-browser.html` | `artifacts/page.tsx`, `ArtifactViewer.tsx` | Mockup: 195, 327; Code: 91, 19 |

### Key Implementation Details

- **ArtifactCard hover border**: The mockup uses accent color for the hover border (`hover:border-accent`). The current `hover:border-text-3` uses a text color for a border, which is semantically wrong — borders should use border tokens, and hover states on interactive elements should use the accent token.
- **Onboarding input recessed**: The mockup shows the input as `bg-bg` (same as the page background — recessed/inset), not `bg-surface` (raised card). The label uses `text-text-1` (primary text), not `text-text-2` (secondary) — the label is the primary content of the form, not a hint. The focus ring offset must use `ring-offset-bg` because the input is on the page background (`bg`), not on a surface card (`surface`). The border transitions: default → `border-border`, focus → `border-accent`, error → `border-negative`.
- **Retry and Save buttons**: These render on an accent-colored background (`bg-accent`). Text on an accent surface must use `text-accent-fg` (the foreground color paired with accent). Using `text-bg` relies on the bg color being dark enough — it's not the correct semantic token and can break if the accent/bg relationship changes.
- **ArtifactListEntry hover**: Remove the `/60` opacity modifier from `hover:bg-surface-raised/60`. The mockup uses the full surface-raised color, not a 60% opacity version. Dates use `text-text-3` (tertiary text) because timestamps are low-priority metadata.
- **Hairline token decision**: The mockup's `#1E1E26` is the `surface-raised` token value in DESIGN.md. The `border-border-subtle` token also exists in `tailwind.config.ts`. The decision is: (a) replace `border-border-subtle` with `border-surface-raised` everywhere, or (b) keep `border-border-subtle` but document it in DESIGN.md. Option (a) is simpler and doesn't require a DESIGN.md change. Option (b) preserves the semantic distinction (border tokens for borders, surface tokens for backgrounds) but adds a token to the spine. Recommend option (a) unless the team prefers semantic separation. Coordinate with Story 5-2 which uses the same token on shell hairlines.
- **Scrollbar hiding**: Add a `.no-scrollbar` utility to `global.css` (or apply globally to all scrollable panels). The rules are `scrollbar-width: none` (standard) and `::-webkit-scrollbar { display: none }` (WebKit/Blink). Apply to scrollable containers on shell (side nav list), conversation (message panel), and artifact-browser (list pane).
- **Floating shadow token**: DESIGN.md line 327 specifies `0 8px 24px rgba(0,0,0,0.4)`. Tailwind's default `shadow-lg` is `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)` — a different value. Adding `boxShadow.floating` to the config makes `shadow-floating` available.
- **Font-weight override**: DESIGN.md lines 49-51, 445 define `regular=400, medium=500, semibold=600` and proscribe weights above 600. Adding these to `theme.extend.fontWeight` makes `font-regular`, `font-medium`, `font-semibold` available (note: `font-medium` and `font-semibold` already exist in Tailwind defaults with the same values, so the extend is a no-op unless you also remove defaults). To *block* weights above 600, use a full `theme.fontWeight` override that only lists the 3 allowed weights — this removes `font-bold`, `font-extrabold`, and `font-black` from the available classes. Run the grep in Task 9.2 first to find existing usage.
- **`theme.extend` → full `theme` overrides**: This is the most structural change. Using `extend` leaves all default Tailwind utilities available (the full default color palette, all default spacing, all default radii). Switching to full `theme` overrides for `colors`, `spacing`, `borderRadius`, and `fontFamily` means ONLY design-system tokens are available — `text-red-500`, `bg-gray-400`, `rounded-3xl` would no longer generate CSS. This is a guardrail against drift but can cause regressions if non-design-system utilities are in use. The staging approach is: grep for violations → migrate → switch. If migration is non-trivial, defer to a follow-up and document the decision.

### What NOT to Change

- **Prior spec conversation token fixes**: The 9 fixes listed above are done. Do NOT re-apply the Send button text color, textarea bg/border-radius, picker bg/shadow, or ToolPill color fixes.
- **Token values**: Do not change the 42 token values in `tailwind.config.ts` — they match DESIGN.md exactly. This story adds new config keys (`boxShadow`, `fontWeight`) and fixes token *usage* in components, not token definitions.
- **DESIGN.md / EXPERIENCE.md (UX spines)**: Do not change the UX spines unless the hairline decision (AC-6) requires documenting a new `border-subtle` token. If so, only add the token definition — do not modify existing token values or prose.
- **Pixel-level screenshot diff**: The investigation notes that a pixel-level screenshot comparison is Missing Evidence and is out of scope for this story. The ACs treat token-correctness as the success bar, not pixel-perfect rendering.

### Testing

Tests are co-located with source (`*.spec.ts` / `*.test.tsx` next to the file under test). For this story:
- Component tests assert the correct className is present on elements (e.g. `hover:border-accent`, `bg-bg`, `text-text-1`, `text-accent-fg`, `hover:bg-surface-raised`, `text-text-3`).
- Tailwind config changes (AC-8, AC-10, AC-11) are verified by running `yarn nx build web` — the build should succeed and generate the new utilities (`shadow-floating`, `font-regular` if added).
- For AC-11 (full theme override), the build is the critical test — if non-design-system utilities are in use, the build will fail or produce missing styles. This is the intended guardrail behavior.
- Run `yarn nx test web` and `yarn nx build web` to verify.

### References

- Investigation: `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md` (Finding 2: token-config gaps; Finding 5 mechanism 4: token-usage drift; Finding 5 mechanism 5: scrollbar hiding; Finding 5 mechanism 7: token-config gaps; Recommended Next Steps items 5, 6, 7)
- Prior conversation-drift spec: `_bmad-output/implementation-artifacts/spec-ux-spec-drift-conversation-ui.md` (9 fixes already landed — do NOT re-fix Send/textarea/picker/ToolPill tokens)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` (line 49-51: font weights; line 327: floating shadow; line 445: weight constraint)
- Tailwind config: `apps/web/tailwind.config.ts`
- Project context: `_bmad-output/project-context.md` (shadcn/ui + Tailwind section, lines 181-187; focus ring pattern: `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`)
- Story 5-2 (shell hairlines): coordinates the `border-border-subtle` vs `border-surface-raised` hairline token decision for AC-6

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
