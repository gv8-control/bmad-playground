# Story 5.1: Restore Missing Visual Containers Across Surfaces

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want each screen to match its designed visual container structure,
so that the app looks polished and intentional rather than unfinished.

## Acceptance Criteria

### AC-1: Sign-in auth card with brand logo box, heading, and legal footer

**Given** the sign-in page
**When** it renders
**Then** a bordered auth card (`bg-surface border border-border rounded-xl p-8`) wraps the OAuth button
**And** a brand logo box (48x48, `bg-accent`, `rounded-xl`, text "be") appears above the "Continue with GitHub" heading
**And** a heading reading "Continue with GitHub" is present
**And** a legal footer with Terms and Privacy links renders below the auth card
**And** none of these containers exist in the current implementation (investigation: `apps/web/src/app/sign-in/page.tsx:17-43` vs `ux-designs/.../mockups/key-signin.html:79-91,105-115`)

### AC-2: Onboarding form panel wraps the Repository URL input

**Given** the onboarding Repository URL input
**When** it renders
**Then** the input and its supporting copy sit inside a form panel (`bg-surface border border-border rounded-xl p-7` where p-7 = 28px)
**And** the panel is not present in the current implementation — the input renders without a container (investigation: `apps/web/src/components/onboarding/RepositoryUrlForm.tsx:39,55-69` vs `key-onboarding.html:98-106`)

### AC-3: Onboarding BMAD-not-found panel for blocking states

**Given** the onboarding BMAD-initialization-failed or repository-not-found blocking state
**When** it is shown
**Then** a styled panel (`bg-negative-bg border border-negative rounded-lg p-4`) renders with the blocking message and documentation link
**And** the panel uses a title/body split layout
**And** it is not a plain inline message (investigation: `RepositoryUrlForm.tsx:55-69` vs `key-onboarding.html:213-233`)

### AC-4: Settings "coming soon" empty-state

**Given** the Settings page
**When** it renders
**Then** the designed "coming soon" empty-state is present, comprising:
- A 56x56 icon box
- A title reading "Settings coming soon"
- A body paragraph
- Three teaser item rows
**And** it is not a bare placeholder (investigation: `apps/web/src/app/settings/page.tsx:10-12` vs `key-settings.html:184-247,304-332`)

### AC-5: Artifact-browser frontmatter metadata badge

**Given** an artifact selected in the Artifact Browser
**When** the artifact has frontmatter metadata
**Then** a frontmatter metadata badge renders in `ArtifactViewer` showing the metadata fields as label-value pairs in JetBrains Mono
**And** the badge uses a rounded `surface-raised` pill style
**And** it is not absent (investigation: `apps/web/src/components/artifact-browser/ArtifactViewer.tsx:9-11,89-103` vs `key-artifact-browser.html:264-297,446-456`)

### AC-6: Conversation chat-input-box container

**Given** the conversation chat input area
**When** it renders
**Then** the textarea, Send button, and WorkingTreeIndicator sit inside a single bordered `chat-input-box` container (`bg-surface-raised border border-border rounded-lg p-3 px-4 flex flex-col`)
**And** they are not rendered as sibling elements in the input zone without a shared container (investigation: `apps/web/src/components/conversation/ChatInput.tsx:59-94` vs `key-conversation.html:326-334`)

## Tasks / Subtasks

- [ ] Task 1: Add sign-in auth card, brand logo box, heading, and legal footer (AC: 1)
  - [ ] 1.1 In `apps/web/src/app/sign-in/page.tsx` (lines 17-43), wrap the OAuth button in an auth card: `<div className="bg-surface border border-border rounded-xl p-8">`
  - [ ] 1.2 Add a brand logo box above the heading: `<div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-bg font-semibold">be</div>` (48x48, matching `key-signin.html:79-91`)
  - [ ] 1.3 Add the heading "Continue with GitHub" between the logo box and the OAuth button (matching `key-signin.html:105-115`)
  - [ ] 1.4 Add a legal footer below the auth card with Terms and Privacy links (matching `key-signin.html` footer structure)

- [ ] Task 2: Add onboarding form panel (AC: 2)
  - [ ] 2.1 In `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` (line 39), wrap the input and supporting copy in a form panel: `<div className="bg-surface border border-border rounded-xl p-7">` (p-7 = 28px padding, matching `key-onboarding.html:98-106`)
  - [ ] 2.2 Ensure the label, input, helper text, and submit button all sit inside the panel

- [ ] Task 3: Add onboarding BMAD-not-found panel for blocking states (AC: 3)
  - [ ] 3.1 In `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` (lines 55-69), replace the plain inline blocking message with a styled panel: `<div className="bg-negative-bg border border-negative rounded-lg p-4">` (matching `key-onboarding.html:213-233`)
  - [ ] 3.2 Structure the panel with a title/body split — title on top, body text and documentation link below (matching the mockup's two-line layout)

- [ ] Task 4: Implement Settings "coming soon" empty-state (AC: 4)
  - [ ] 4.1 In `apps/web/src/app/settings/page.tsx` (lines 10-12), replace the bare placeholder with the designed empty-state (matching `key-settings.html:184-247,304-332`)
  - [ ] 4.2 Add a 56x56 icon box at the top of the empty-state
  - [ ] 4.3 Add the title "Settings coming soon"
  - [ ] 4.4 Add a body paragraph below the title
  - [ ] 4.5 Add three teaser item rows (icon + text) below the body paragraph

- [ ] Task 5: Add artifact-browser frontmatter metadata badge (AC: 5)
  - [ ] 5.1 In `apps/web/src/components/artifact-browser/ArtifactViewer.tsx` (lines 9-11, 89-103), add a frontmatter metadata badge above the rendered artifact content (matching `key-artifact-browser.html:264-297,446-456`)
  - [ ] 5.2 Style the badge as a rounded `surface-raised` pill: `bg-surface-raised rounded-lg`
  - [ ] 5.3 Render metadata fields (title, status, updated) as label-value pairs in JetBrains Mono (`font-mono`)

- [ ] Task 6: Add conversation chat-input-box container (AC: 6)
  - [ ] 6.1 In `apps/web/src/components/conversation/ChatInput.tsx` (lines 59-94), wrap the textarea, Send button, and WorkingTreeIndicator in a single shared container: `<div className="bg-surface-raised border border-border rounded-lg p-3 px-4 flex flex-col">` (matching `key-conversation.html:326-334`)
  - [ ] 6.2 Ensure the container uses `flex flex-col` so the textarea and controls stack vertically within the box
  - [ ] 6.3 Verify the WorkingTreeIndicator renders inside the container, not as a sibling outside it

- [ ] Task 7: Write/update co-located tests (AC: 1-6)
  - [ ] 7.1 Update or create `apps/web/src/app/sign-in/page.test.tsx` — assert auth card, logo box, heading, and legal footer render
  - [ ] 7.2 Update or create `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx` — assert form panel wraps the input; assert BMAD-not-found panel renders with correct styling in blocking state
  - [ ] 7.3 Update or create `apps/web/src/app/settings/page.test.tsx` — assert "coming soon" empty-state renders with icon, title, body, and 3 teaser items
  - [ ] 7.4 Update or create `apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx` — assert frontmatter metadata badge renders with label-value pairs
  - [ ] 7.5 Update `apps/web/src/components/conversation/ChatInput.test.tsx` — assert textarea, Send button, and WorkingTreeIndicator sit inside a single `chat-input-box` container

- [ ] Task 8: Verify build, lint, and tests
  - [ ] 8.1 Run `yarn nx lint web` — confirm 0 lint errors
  - [ ] 8.2 Run `yarn nx test web` — confirm all tests pass
  - [ ] 8.3 Run `yarn nx typecheck web` — confirm no type errors
  - [ ] 8.4 Run `yarn nx build web` — confirm production build succeeds

## Dev Notes

### Architecture Context

This story restores the 6 missing visual containers identified across 6 surfaces in the visual drift investigation. The drift is structural — components were implemented without the card/panel/wrapper containers the mockups specify, leaving the app looking unfinished. Token values are correct (42/42 match); this story adds the missing structural wrappers, not token changes. The mockups are authoritative; the code aligns to them.

### Mockup References

| Surface | Mockup File | Implementation File | Lines to Compare |
|---------|------------|---------------------|------------------|
| Sign-in | `ux-designs/.../mockups/key-signin.html` | `apps/web/src/app/sign-in/page.tsx` | Mockup: 79-91, 105-115; Code: 17-43 |
| Onboarding (form panel) | `key-onboarding.html` | `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` | Mockup: 98-106; Code: 39, 55-69 |
| Onboarding (not-found panel) | `key-onboarding.html` | `RepositoryUrlForm.tsx` | Mockup: 213-233; Code: 55-69 |
| Settings | `key-settings.html` | `apps/web/src/app/settings/page.tsx` | Mockup: 184-247, 304-332; Code: 10-12 |
| Artifact-browser | `key-artifact-browser.html` | `apps/web/src/components/artifact-browser/ArtifactViewer.tsx` | Mockup: 264-297, 446-456; Code: 9-11, 89-103 |
| Conversation (input) | `key-conversation.html` | `apps/web/src/components/conversation/ChatInput.tsx` | Mockup: 326-334; Code: 59-94 |

### Key Implementation Details

- **Sign-in logo box**: 48x48 px (`w-12 h-12`), `bg-accent`, `rounded-xl`, centered "be" text. Positioned above the "Continue with GitHub" heading inside the auth card.
- **Sign-in auth card**: `bg-surface border border-border rounded-xl p-8`. The OAuth button sits inside this card.
- **Onboarding form panel**: `bg-surface border border-border rounded-xl p-7` (p-7 = 28px, not the more common p-6 = 24px — match exactly).
- **Onboarding BMAD-not-found panel**: `bg-negative-bg border border-negative rounded-lg p-4`. Uses `rounded-lg` not `rounded-xl` (smaller radius than the form panel — intentional contrast). Title/body split: the mockup renders a title line, then the body text and documentation link on separate lines.
- **Settings empty-state**: 56x56 icon box (`w-14 h-14`), "Settings coming soon" title, body paragraph, then 3 teaser rows. Each teaser row has an icon + descriptive text. The mockup (`key-settings.html:184-247,304-332`) shows the full structure.
- **Artifact-browser frontmatter badge**: `bg-surface-raised rounded-lg` pill. Metadata fields (title, status, updated) rendered as label-value pairs in JetBrains Mono (`font-mono`). Positioned above the rendered artifact content in `ArtifactViewer`.
- **Conversation chat-input-box**: `bg-surface-raised border border-border rounded-lg p-3 px-4 flex flex-col`. This is a single container — the textarea, Send button, and WorkingTreeIndicator all live inside it. Note: the prior conversation-drift spec already changed the textarea background to `bg-surface-raised` and the border radius to `rounded-lg`; do NOT re-apply those. This task adds the *wrapper container*, not the textarea styling.

### What NOT to Change

- **Prior conversation-drift spec fixes**: The spec `spec-ux-spec-drift-conversation-ui.md` (commit c7c1c5a) already fixed 9 drift classes in the conversation cluster. Specifically for this story: the textarea background (`bg-surface-raised`) and border radius (`rounded-lg`) on `ChatInput.tsx` were already corrected. Do NOT re-apply those fixes. This story only adds the *wrapper container* around the existing textarea/Send/WorkingTreeIndicator.
- **Accessibility improvements that exceed the mockup**: The implementation has focus rings, aria labels, and keyboard navigation that exceed the mockup HTML. This is positive drift — do not remove it.
- **Token values**: All 42 design tokens match DESIGN.md exactly. Do not change token values; only add structural containers.

### Testing

Tests are co-located with source (`*.spec.ts` / `*.test.tsx` next to the file under test). For this story:
- Component tests should assert the container elements render (auth card, form panel, not-found panel, empty-state, frontmatter badge, chat-input-box).
- Use the mockup HTML structure as the reference for expected element hierarchy.
- Run `yarn nx test web` to execute.

### References

- Investigation: `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md` (Findings 3, 5 mechanism 1; Follow-up items 1-4, 7)
- Prior conversation-drift spec: `_bmad-output/implementation-artifacts/spec-ux-spec-drift-conversation-ui.md` (verifies textarea bg/border already fixed — do not re-fix)
- UX mockups: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/mockups/key-signin.html`, `key-onboarding.html`, `key-settings.html`, `key-artifact-browser.html`, `key-conversation.html`
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md`
- Project context: `_bmad-output/project-context.md` (shadcn/ui + Tailwind section, lines 181-187)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
