---
baseline_commit: 41e0eb518bf89923e3b3cd5171cfec82f06f3ae2
---

# Story 5.1: Restore Missing Visual Containers Across Surfaces

Status: done

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
**And** a brand logo box (48x48, `bg-accent`, `rounded-lg`, text "be") appears above the "Continue with GitHub" heading
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
- A 56x56 icon box (`w-14 h-14 bg-surface border border-border rounded-xl`)
- A title reading "Settings coming soon"
- A body paragraph
- Three teaser item rows (icon + text)
**And** it is not a bare placeholder (investigation: `apps/web/src/app/(dashboard)/(app)/settings/page.tsx:10-12` vs `key-settings.html:184-247,304-332`)

### AC-5: Artifact-browser frontmatter metadata badge

**Given** an artifact selected in the Artifact Browser
**When** the artifact has frontmatter metadata
**Then** a frontmatter metadata badge renders in `ArtifactViewer` showing the metadata fields as label-value pairs in JetBrains Mono
**And** the badge uses a `bg-surface-raised border border-border rounded-md` pill style
**And** it is not absent (investigation: `apps/web/src/components/artifact-browser/ArtifactViewer.tsx:9-11,89-103` vs `key-artifact-browser.html:264-297,446-456`)

### AC-6: Conversation chat-input-box container

**Given** the conversation chat input area
**When** it renders
**Then** the textarea, Send button, and WorkingTreeIndicator sit inside a single bordered `chat-input-box` container (`bg-surface-raised border border-border rounded-lg p-3 px-4 flex flex-col`)
**And** the textarea is transparent inside the container (`bg-transparent border-none`)
**And** a footer row (`flex items-center justify-between`) holds the WorkingTreeIndicator (left) and Send/Stop button (right)
**And** they are not rendered as sibling elements in the input zone without a shared container (investigation: `apps/web/src/components/conversation/ChatInput.tsx:59-94` vs `key-conversation.html:326-334`)

## Tasks / Subtasks

- [x] Task 1: Add sign-in auth card, brand logo box, heading, and legal footer (AC: 1)
  - [x] 1.1 In `apps/web/src/app/sign-in/page.tsx`, restructure the return JSX to match the mockup's three-section layout: wordmark (logo + name + tagline, `flex flex-col items-center gap-3`) → auth-block card → legal footer. The wordmark name "bmad-easy" uses `text-xl font-semibold text-text-1 tracking-tight` (matching `.wordmark-name`: 20px, semibold); the tagline uses `text-sm text-text-2 text-center` (matching `.wordmark-tagline`).
  - [x] 1.2 Add the brand logo box: `<div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center text-accent-fg font-semibold text-xl tracking-tight">be</div>` (48x48, `rounded-lg` = 12px per Tailwind config, `text-xl` = 20px matching `key-signin.html` `.wordmark-logo` font-size: 1.25rem, `tracking-tight` matches `letter-spacing: -0.5px`)
  - [x] 1.3 Add the "Continue with GitHub" heading inside the auth-block card, above the OAuth button, styled as `text-lg font-semibold text-text-1 text-center` (matching `key-signin.html:238` `.auth-heading`: 18px, semibold, centered)
  - [x] 1.4 Wrap the OAuth button form in the auth-block card: `<div className="bg-surface border border-border rounded-xl p-8 w-full flex flex-col gap-6">` (matching `key-signin.html:237-254` `.auth-block`)
  - [x] 1.5 Add a legal footer below the auth card: `<div className="text-xs text-text-2 text-center">By signing in you agree to our <a href="#" className="underline">Terms of Service</a> and <a href="#" className="underline">Privacy Policy</a>.</div>` (matching `key-signin.html:256-258` `.auth-footer`; `text-text-2` per DESIGN.md line 254 — permanently visible informational text uses `text-2`, not `text-3` which is restricted to WCAG-exempt contexts)
  - [x] 1.6 Preserve the existing error state (`hasError` alert) inside the auth-block card, below the button

- [x] Task 2: Add onboarding form panel (AC: 2)
  - [x] 2.1 In `apps/web/src/components/onboarding/RepositoryUrlForm.tsx`, wrap the form's inner content (label, input, error block, submit button) in a form panel: `<div className="bg-surface border border-border rounded-xl p-7 flex flex-col gap-5">` (p-7 = 28px, `rounded-xl` = 16px, matching `key-onboarding.html:98-106` `.onboarding-form`)
  - [x] 2.2 Ensure the label, input, helper text, error messages, and submit button all sit inside the panel
  - [x] 2.3 The form panel replaces the current bare `flex flex-col gap-4` wrapper — the outer `<form>` element stays, the panel div goes inside it

- [x] Task 3: Add onboarding BMAD-not-found panel for blocking states (AC: 3)
  - [x] 3.1 In `apps/web/src/components/onboarding/RepositoryUrlForm.tsx`, replace the current plain inline error block (lines 55-69) with a styled panel when the error is a BMAD-validation/blocking error (has `documentationLink`): `<div className="bg-negative-bg border border-negative rounded-lg p-4 flex flex-col gap-2">` (matching `key-onboarding.html:213-233` `.bmad-not-found`)
  - [x] 3.2 Structure the panel with a title/body split — title line (e.g. "BMAD not set up in this repository") on top, body text and documentation link below (matching the mockup's `.bmad-not-found-title` + `.bmad-not-found-body` two-line layout)
  - [x] 3.3 For non-BMAD errors (INSUFFICIENT_PERMISSION, NOT_FOUND, ORG_RESTRICTION — no `documentationLink`), keep the existing inline error style — only BMAD-validation errors get the styled panel
  - [x] 3.4 Preserve the `role="alert"` and `aria-describedby` accessibility wiring

- [x] Task 4: Implement Settings "coming soon" empty-state (AC: 4)
  - [x] 4.1 In `apps/web/src/app/(dashboard)/(app)/settings/page.tsx`, replace the bare `<p>Coming soon</p>` with the designed empty-state (matching `key-settings.html:184-247,304-332`)
  - [x] 4.2 Add a 56x56 icon box: `<div className="w-14 h-14 bg-surface border border-border rounded-xl flex items-center justify-center text-2xl text-text-3">⚙</div>` (matching `.coming-soon-icon` — `text-text-3` is correct here: the ⚙ glyph is a decorative icon, not informational text)
  - [x] 4.3 Add the title "Settings coming soon" (`text-lg font-semibold text-text-1`)
  - [x] 4.4 Add a body paragraph: "Account management, repository connections, and notification preferences will be available here in a future release." (matching `.coming-soon-body`) — styled as `text-sm text-text-2 leading-relaxed` (`text-sm` = 14px is the closest DESIGN.md-compliant size for secondary/supporting copy; mockup uses 15px which has no Tailwind token; `text-text-2` per DESIGN.md contrast rules for permanently visible informational text)
  - [x] 4.5 Add three teaser item rows inside a teaser-items sub-container (`<div className="w-full flex flex-col gap-2 mt-2 text-left">`, matching `.coming-soon-items`), each: `<div className="flex items-center gap-3 p-3 bg-surface border border-surface-raised rounded-md"><div className="w-1.5 h-1.5 rounded-full bg-border"></div><span className="text-sm text-text-2">{text}</span></div>` (matching `.teaser-item`; `text-text-2` per DESIGN.md — teaser text is permanently visible informational text, not WCAG-exempt)
  - [x] 4.6 Teaser texts: "Manage connected repositories", "Account and profile", "Notification preferences" (matching `key-settings.html:319-327`)
  - [x] 4.7 Wrap the entire empty-state in a centered container: `<div className="flex flex-col items-center gap-4 max-w-[400px] text-center">` (matching `.coming-soon-block` `max-width: 400px`)

- [x] Task 5: Add artifact-browser frontmatter metadata badge (AC: 5)
  - [x] 5.1 In `apps/web/src/components/artifact-browser/ArtifactViewer.tsx`, add a `parseFrontmatter` function that extracts YAML frontmatter fields from the content string before stripping. Use simple string parsing (split by lines, match `key: value` pairs) — do NOT add a YAML parser dependency. Return `Record<string, string> | null`.
  - [x] 5.2 In the `ArtifactViewer` component, call `parseFrontmatter(content)` before `stripFrontmatter(content)`. If frontmatter exists, render a metadata badge above the Markdown content.
  - [x] 5.3 Render the badge as: `<div className="inline-flex items-center gap-2.5 bg-surface-raised border border-border rounded-md p-2 px-3 mb-6" aria-label="Artifact metadata">` (matching `key-artifact-browser.html:264-297` `.frontmatter-badge` — `border-radius: 8px` = `rounded-md`)
  - [x] 5.4 Render metadata fields as label-value pairs in JetBrains Mono (`font-mono text-xs`): `<span className="text-text-2 font-mono text-xs">{label}</span><span className="text-text-1 font-mono text-xs font-medium">{value}</span>` with vertical divider separators (`<span className="w-px h-3.5 bg-border"></span>`) between field pairs
  - [x] 5.5 Show fields: `title`, `status`, `updated` — if a field is absent from the frontmatter, skip it. The `status` field renders as a pill: `<span className="text-text-2 font-mono text-xs border border-border rounded-full px-2 py-0.5">{value}</span>` (matching `.fm-status`)
  - [x] 5.6 If no frontmatter exists (content starts without `---`), render no badge — the Markdown content renders as before

- [x] Task 6: Add conversation chat-input-box container (AC: 6)
  - [x] 6.1 In `apps/web/src/components/conversation/ChatInput.tsx`, change the root element from `<div className="flex items-end gap-2">` to `<div className="bg-surface-raised border border-border rounded-lg p-3 px-4 flex flex-col gap-2.5 focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-surface">` (matching `key-conversation.html:326-334` `.chat-input-box`; `focus-within:` ring on the container preserves UX-DR16 visible focus when the textarea is focused, since the textarea's own ring is removed in 6.2)
  - [x] 6.2 Change the textarea styling from `bg-surface-raised border border-border rounded-lg` to `bg-transparent border-none outline-none` — the container provides the visual styling now (matching `.chat-textarea`: `background: transparent; border: none; outline: none;`). The focus ring is on the container via `focus-within:` (added in 6.1), not on the textarea — remove `focus:ring-*` and `focus:ring-offset-*` from the textarea className.
  - [x] 6.3 Add a footer row div: `<div className="flex items-center justify-between">` containing the WorkingTreeIndicator (left) and the Send/Stop button (right)
  - [x] 6.4 Move the Send/Stop button into the footer row div
  - [x] 6.5 Add an optional `workingTreeIndicator?: React.ReactNode` prop to `ChatInputProps`. Render it in the footer row left side: `{workingTreeIndicator && <div>{workingTreeIndicator}</div>}`
  - [x] 6.6 In `apps/web/src/components/conversation/ConversationPane.tsx` (line 916), move `<WorkingTreeIndicator state={effectiveWorkingTreeState} onSave={handleSave} />` from a direct child of the input zone div to a prop of `ChatInput` (which is inside the `pickerContainerRef` div): `<ChatInput ... workingTreeIndicator={<WorkingTreeIndicator state={effectiveWorkingTreeState} onSave={handleSave} />} />`
  - [x] 6.7 Remove the standalone `<WorkingTreeIndicator ... />` render at line 916 — it is now passed as a prop to `ChatInput`
  - [x] 6.8 Verify the `SlashCommandPicker` (line 918-923) remains outside the `chat-input-box` — it stays in the `pickerContainerRef` div as a sibling of `ChatInput`, not inside it

- [x] Task 7: Activate existing ATDD red-phase test scaffolds (AC: 1-6)
  - [x] 7.1 In `apps/web/src/app/sign-in/page.test.tsx`, remove `test.skip()` from the "visual containers (Story 5.1, AC-1)" describe block — scaffolds already assert auth card container (`bg-surface border border-border rounded-xl p-8`), logo box ("be"), heading "Continue with GitHub", legal footer, and error-state-in-card. Existing tests (button, error state, pending state) must still pass.
  - [x] 7.2 In `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx`, remove `test.skip()` from the "form panel container (Story 5.1, AC-2)" and "BMAD-not-found panel (Story 5.1, AC-3)" describe blocks — scaffolds already assert form panel (`bg-surface border border-border rounded-xl p-7`), BMAD-not-found styled panel (`bg-negative-bg border border-negative`), title/body split, non-BMAD inline error preservation, and `aria-describedby` wiring. Existing tests must still pass.
  - [x] 7.3 In `apps/web/src/app/(dashboard)/(app)/settings/page.test.tsx` (already created by ATDD), remove `test.skip()` from the "coming soon empty-state (Story 5.1, AC-4)" describe block — scaffolds already assert icon box (`w-14 h-14`), title "Settings coming soon", body paragraph, 3 teaser items, centered container, and absence of bare "Coming soon" placeholder. Uses `@jest-environment node` + `renderToStaticMarkup` pattern with `Breadcrumb` mocked as render stub.
  - [x] 7.4 In `apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx`, remove `test.skip()` from the "frontmatter metadata badge (Story 5.1, AC-5)" describe block — scaffolds already assert badge renders with label-value pairs in JetBrains Mono, status pill (`rounded-full`), no badge without frontmatter, absent-field skipping, and badge-above-Markdown ordering. Existing tests (frontmatter stripping, markdown rendering, read-only) must still pass.
  - [x] 7.5 In `apps/web/src/components/conversation/ChatInput.test.tsx`, remove `test.skip()` from the "chat-input-box container (Story 5.1, AC-6)" describe block — scaffolds already assert container (`bg-surface-raised border border-border rounded-lg`), transparent textarea (`bg-transparent border-none`), footer row (`flex items-center justify-between`) with Send button, `workingTreeIndicator` prop rendering, focus-within ring, and Stop button in footer. Existing tests (Enter to send, Shift+Enter, auto-grow, Stop button) must still pass — update selectors if the DOM structure changed.

- [x] Task 8: Verify build, lint, and tests
  - [x] 8.1 Run `yarn nx lint web` — confirm 0 lint errors (1 pre-existing error in `CredentialErrorBanner.test.tsx` — not modified by this story; 0 new errors introduced)
  - [x] 8.2 Run `yarn nx test web` — confirm all tests pass (743 tests, 62 suites, 0 skipped — including activated ATDD scaffolds from Task 7)
  - [x] 8.3 Run `yarn nx typecheck web` — no `typecheck` target exists for web project; TypeScript validation via build target (0 new type errors from this story's changes)
  - [x] 8.4 Run `yarn nx build web` — pre-existing type error in `AgentMessage.tsx:18` (not modified by this story); confirmed pre-existing by running build at baseline commit

## Dev Notes

### Architecture Context

This story restores the 6 missing visual containers identified across 6 surfaces in the visual drift investigation. The drift is structural — components were implemented without the card/panel/wrapper containers the mockups specify, leaving the app looking unfinished. Token values are correct (42/42 match); this story adds the missing structural wrappers, not token changes. The mockups are authoritative; the code aligns to them.

### Deferred Work Check

Per the user's instruction, `deferred-work.md` was checked for items matching this story's file paths. One deferred item matches: the `stripFrontmatter` regex in `ArtifactViewer.tsx` (deferred from Story 2.5 review — "regex matches any leading `---\n...\n---\n` block, not just YAML frontmatter"). **Decision (DP-5: scope temptation):** This finding is out of scope for Story 5.1. AC-5 adds a frontmatter metadata badge; fixing the regex's edge-case behavior (rare for BMAD artifacts which always have YAML frontmatter) is beyond the AC. The `parseFrontmatter` function added in Task 5.1 uses the same regex pattern — if the regex is ever fixed, both `parseFrontmatter` and `stripFrontmatter` should be updated together in a dedicated hardening story.

No other deferred items match Story 5.1's file paths.

### Tailwind Config Reference

The project uses custom border-radius values in `tailwind.config.ts` (different from default Tailwind):

| Token | Value | Default Tailwind |
|-------|-------|-----------------|
| `rounded-sm` | 4px | 2px |
| `rounded-md` | 8px | 6px |
| `rounded-lg` | 12px | 8px |
| `rounded-xl` | 16px | 12px |
| `rounded-2xl` | 24px | 16px |

Always use the design-system token, not the default Tailwind value. The mockup CSS uses pixel values — map them to the design-system tokens above, not to default Tailwind.

Spacing scale is also custom: 1=4px, 2=8px, 3=12px, 4=16px, 5=20px, 6=24px, 8=32px. `p-7` (28px) is NOT in the custom spacing scale — it uses default Tailwind's `p-7` = 1.75rem = 28px. This works because the config uses `theme.extend`, leaving defaults available.

### Mockup-to-Code Mapping (with verified token values)

| Surface | Mockup CSS class | Mockup CSS values | Tailwind tokens |
|---------|-----------------|-------------------|-----------------|
| Sign-in auth card | `.auth-block` | bg:#16161C, border:1px #2B2B38, radius:16px, padding:32px | `bg-surface border border-border rounded-xl p-8` |
| Sign-in logo box | `.wordmark-logo` | 48x48, bg:#7B6EE8, radius:12px, font:1.25rem/600 | `w-12 h-12 bg-accent rounded-lg text-xl font-semibold tracking-tight` |
| Onboarding form panel | `.onboarding-form` | bg:#16161C, border:1px #2B2B38, radius:16px, padding:28px | `bg-surface border border-border rounded-xl p-7` |
| Onboarding error panel | `.bmad-not-found` | bg:rgba(240,107,107,0.08), border:1px #F06B6B, radius:12px, padding:16px | `bg-negative-bg border border-negative rounded-lg p-4` |
| Settings icon box | `.coming-soon-icon` | 56x56, bg:#16161C, border:1px #2B2B38, radius:16px | `w-14 h-14 bg-surface border border-border rounded-xl` |
| Settings teaser item | `.teaser-item` | bg:#16161C, border:1px #1E1E26, radius:8px, padding:8px 12px | `bg-surface border border-surface-raised rounded-md p-2 px-3` |
| Artifact frontmatter badge | `.frontmatter-badge` | bg:#1E1E26, border:1px #2B2B38, radius:8px, padding:8px 12px | `bg-surface-raised border border-border rounded-md p-2 px-3` |
| Conversation chat-input-box | `.chat-input-box` | bg:#1E1E26, border:1px #2B2B38, radius:12px, padding:12px 16px | `bg-surface-raised border border-border rounded-lg p-3 px-4` |

### Current State of Files Being Modified

#### 1. `apps/web/src/app/sign-in/page.tsx` (47 lines)

**Current state:** Renders a `min-h-screen` main with a `flex flex-col items-center gap-8` container. Inside: a text-center div with "bmad-easy" h1 and subtitle, then a form with `SubmitButton` and error alert. No auth card, no logo box, no legal footer.

**What changes:** Restructure to three sections matching the mockup: (1) wordmark (logo box + "bmad-easy" name + tagline), (2) auth-block card wrapping the heading + OAuth button + error, (3) legal footer with Terms/Privacy links. The `searchParams` Promise handling, `redirectTo` validation, and `signIn` Server Action stay unchanged.

**What must be preserved:** The `searchParams: Promise<{...}>` signature and `await searchParams` pattern (Next.js 16). The `signIn('github', { redirectTo })` Server Action. The `hasError` alert with `role="alert"` and `aria-live="polite"`. The `SubmitButton` component (uses `useFormStatus`).

#### 2. `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` (81 lines)

**Current state:** Client Component (`'use client'`). Renders a bare `<form className="w-full flex flex-col gap-4">` with a label, input, error block, and submit button. No panel container. Error block is a plain `<div>` with `role="alert"` and `text-negative`.

**What changes:** Wrap the form's inner content in a form panel div (`bg-surface border border-border rounded-xl p-7`). For BMAD-validation errors (errors with `documentationLink`), replace the inline error with a styled panel (`bg-negative-bg border border-negative rounded-lg p-4`) with title/body split. For non-BMAD errors, keep the inline error style.

**What must be preserved:** The `connectRepository` Server Action call and result union handling (`'success' in result`). The `useState` for `url`, `error`, `documentationLink`, `isPending`. The `useRouter().push('/project-map')` redirect on success. The `aria-describedby` wiring on the input. The `documentationLink` rendering with `target="_blank" rel="noopener noreferrer"`. All existing test assertions (see `RepositoryUrlForm.test.tsx` — 268 lines of tests).

#### 3. `apps/web/src/app/(dashboard)/(app)/settings/page.tsx` (15 lines)

**Current state:** Server Component. Renders a Breadcrumb, h1 "Settings" (with `tabIndex={-1}` for route-focus management), and a bare `<p className="text-text-2 text-sm">Coming soon</p>`.

**What changes:** Replace the bare `<p>Coming soon</p>` with the designed empty-state: icon box, title, body paragraph, and 3 teaser items in a centered container. The Breadcrumb and h1 stay unchanged.

**What must be preserved:** The `Breadcrumb` import from `@/components/shell/Breadcrumb`. The `h1 tabIndex={-1}` for AppShell route-focus management (project-context.md: "route-focus management — `h1` must have `tabIndex={-1}`"). The `async function SettingsPage()` signature (Server Component). The outer `<div className="flex h-full flex-col overflow-hidden">` and `<header className="flex-shrink-0">` structure.

#### 4. `apps/web/src/components/artifact-browser/ArtifactViewer.tsx` (104 lines)

**Current state:** Server Component (no `'use client'`). Imports `Markdown` from `react-markdown` and `remarkGfm`. Has a `stripFrontmatter` function (regex-based). Renders a scrollable container with `role="main"` and a `max-w-[720px]` div wrapping the `Markdown` component. No frontmatter metadata badge.

**What changes:** Add a `parseFrontmatter` function that extracts key-value pairs from the YAML frontmatter before stripping. Render a frontmatter metadata badge above the `Markdown` content when frontmatter exists. The badge shows `title`, `status`, and `updated` fields as label-value pairs in JetBrains Mono.

**What must be preserved:** The `stripFrontmatter` function and its behavior (do NOT fix the regex — deferred per DP-5). The `Markdown` component with `remarkGfm` plugin and `components` overrides. The `role="main"` and `aria-label="Artifact content"` on the container. The `max-w-[720px]` content width. The `cn()` helper usage in the `code` component override. All existing test assertions (see `ArtifactViewer.test.tsx` — 122 lines, including frontmatter stripping tests).

#### 5. `apps/web/src/components/conversation/ChatInput.tsx` (95 lines)

**Current state:** Client Component (`'use client'`). Renders a `<div className="flex items-end gap-2">` with a textarea and Send/Stop button side by side. No shared container. Textarea has `bg-surface-raised border border-border rounded-lg`. No WorkingTreeIndicator integration.

**What changes:** Change the root to a `chat-input-box` container (`bg-surface-raised border border-border rounded-lg p-3 px-4 flex flex-col gap-2.5`). Make the textarea transparent (`bg-transparent border-none outline-none`). Add a footer row (`flex items-center justify-between`) with the WorkingTreeIndicator (left, passed as prop) and Send/Stop button (right). Accept `workingTreeIndicator?: React.ReactNode` prop.

**What must be preserved:** The `MIN_HEIGHT`/`MAX_HEIGHT` constants and auto-grow `useEffect`. The `handleKeyDown` Enter/Shift+Enter logic (including `isComposing` and `keyCode !== 229` guards). The `inputRef` prop and `internalRef` fallback. The `aria-activedescendant`/`aria-controls` props for slash-command picker integration. The `onStop` conditional rendering (Stop button when `isProcessing && onStop`). All existing test assertions (see `ChatInput.test.tsx` — 132 lines).

#### 6. `apps/web/src/components/conversation/ConversationPane.tsx` (line 916, 926)

**Current state:** `WorkingTreeIndicator` (line 916) is a direct child of the input zone div (`flex-shrink-0 border-t border-border px-8 py-4`). Below it, a `pickerContainerRef` div (line 917) contains both the `SlashCommandPicker` (lines 918-923) and `ChatInput` (line 926) as siblings inside it. So `WorkingTreeIndicator` and the `pickerContainerRef` div are siblings; `ChatInput` is nested one level deeper inside the picker container.

**What changes:** Move `WorkingTreeIndicator` from a direct child of the input zone div to a prop of `ChatInput` (which is inside the `pickerContainerRef` div): `<ChatInput ... workingTreeIndicator={<WorkingTreeIndicator ... />} />`. Remove the standalone `<WorkingTreeIndicator ... />` at line 916.

**What must be preserved:** The `pickerContainerRef` div and `SlashCommandPicker` rendering. The `SessionStartSpinner` conditional rendering. The `state !== 'limit-reached'` guard on `ChatInput`. All props passed to `ChatInput` (`value`, `onChange`, `onSubmit`, `onStop`, `disabled`, `isProcessing`, `onKeyDown`, `inputRef`, `ariaActivedescendant`, `ariaControls`). The `effectiveWorkingTreeState` and `handleSave` props passed to `WorkingTreeIndicator`.

### What NOT to Change

- **Token values:** All 42 design tokens match DESIGN.md exactly. Do not change token values; only add structural containers.
- **Accessibility improvements that exceed the mockup:** The implementation has focus rings, aria labels, and keyboard navigation that exceed the mockup HTML. This is positive drift — do not remove it.
- **The `stripFrontmatter` regex:** A deferred finding notes the regex matches non-frontmatter `---` blocks. Do NOT fix this — it is out of scope (DP-5: scope temptation). The `parseFrontmatter` function added in Task 5.1 uses the same regex pattern; if the regex is ever fixed, both functions should be updated together.
- **The `SlashCommandPicker` positioning:** It stays outside the `chat-input-box` container as a floating dropdown. Do not move it inside `ChatInput`.

### Testing

ATDD red-phase scaffolds have already been applied to all 5 test files (Task 7). The scaffolds are written as `test.skip()` blocks — they assert the EXPECTED post-implementation behavior and will fail (when un-skipped) until the corresponding implementation task lands. The dev workflow is:

1. Implement a task (e.g., Task 1 — sign-in auth card).
2. Remove `test.skip()` from the corresponding describe block in the test file (e.g., `page.test.tsx` "visual containers (Story 5.1, AC-1)").
3. Run `yarn nx test web` — the now-active tests should pass.
4. Repeat for each task.

Tests are co-located with source (`*.spec.ts` / `*.test.tsx` next to the file under test). For this story:
- Component tests assert the container elements render (auth card, form panel, not-found panel, empty-state, frontmatter badge, chat-input-box).
- The mockup HTML structure is the reference for expected element hierarchy.
- The settings page test (already created) uses the `@jest-environment node` + `renderToStaticMarkup` pattern from `project-map/page.test.tsx` — the settings page is a Server Component.
- For `ChatInput.test.tsx`, update DOM queries if the structure changed (e.g., the Send button is now inside a footer div). The `screen.getByLabelText('Message input')` query should still work for the textarea.
- Run `yarn nx test web` to execute.

### Project Structure Notes

- Settings page is at `apps/web/src/app/(dashboard)/(app)/settings/page.tsx` — under the `(dashboard)/(app)/` route group (repo-connection-guarded). NOT at `apps/web/src/app/settings/page.tsx`.
- Sign-in page is at `apps/web/src/app/sign-in/page.tsx` — outside the dashboard route group (pre-auth).
- All components are in `apps/web/src/components/` organized by feature (conversation, onboarding, artifact-browser).
- The `cn()` helper is in `apps/web/src/lib/utils.ts` — use for conditional class merging.

### References

- Investigation: `_bmad-output/implementation-artifacts/investigations/ux-visual-drift-investigation.md` (Findings 3, 5 mechanism 1; Follow-up items 1-4, 7)
- UX mockups: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/mockups/key-signin.html`, `key-onboarding.html`, `key-settings.html`, `key-artifact-browser.html`, `key-conversation.html`
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md`
- Tailwind config: `apps/web/tailwind.config.ts` (custom border-radius and spacing scales — see table above)
- Project context: `_bmad-output/project-context.md` (shadcn/ui + Tailwind section, lines 181-187; Server Component test pattern, line 224)
- Decision policy: `_bmad-output/decision-policy.md` (DP-5: scope temptation — applied to `stripFrontmatter` deferred finding)
- Deferred work: `_bmad-output/implementation-artifacts/deferred-work.md` (Story 2.5 review — `stripFrontmatter` regex, checked and deferred per DP-5)

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- Task 1 (RED): 5 sign-in tests failed for expected reason (auth card, logo box, heading, legal footer not present)
- Task 2 (RED): 2 form panel tests failed for expected reason (panel container not present)
- Task 3 (RED): 2 BMAD-not-found panel tests failed for expected reason (styled panel not present); tests 3.3 and 3.4 passed (non-BMAD inline error and aria-describedby already wired)
- Task 4 (RED): 7 settings tests failed; 1 test had unexpected failure — `tabIndex="-1"` assertion used camelCase but `renderToStaticMarkup` produces lowercase `tabindex="-1"`. Fixed test assertion before implementing (test scaffold bug, not implementation issue)
- Task 5 (RED): 5 frontmatter badge tests failed for expected reason (badge not present); "no badge without frontmatter" test passed (no badge exists)
- Task 6 (RED): 6 chat-input-box tests failed for expected reason (container, transparent textarea, footer row not present)
- Pre-existing lint error in `CredentialErrorBanner.test.tsx:41` (not modified by this story)
- Pre-existing build type error in `AgentMessage.tsx:18` (not modified by this story)

### Completion Notes List

- **Task 1 (AC-1):** Restructured sign-in page to three-section layout: wordmark (logo box "be" + "bmad-easy" name + tagline) → auth-block card (heading "Continue with GitHub" + OAuth button + error alert) → legal footer (Terms/Privacy links). Preserved `searchParams: Promise<>` (Next.js 16), `signIn` Server Action, `hasError` alert with `role="alert"` and `aria-live="polite"`, and `SubmitButton` component.
- **Task 2 (AC-2):** Wrapped RepositoryUrlForm inner content (label, input, error block, submit button) in a form panel (`bg-surface border border-border rounded-xl p-7`). Outer `<form>` element stays; panel div goes inside it.
- **Task 3 (AC-3):** Added conditional rendering: BMAD-validation errors (with `documentationLink`) render in a styled panel (`bg-negative-bg border border-negative rounded-lg p-4`) with title/body split ("BMAD not set up in this repository" title + error text + documentation link body). Non-BMAD errors keep inline error style. `role="alert"` and `aria-describedby` preserved in both branches.
- **Task 4 (AC-4):** Replaced bare `<p>Coming soon</p>` with designed empty-state: 56x56 icon box (⚙), "Settings coming soon" title, body paragraph, and 3 teaser items in a centered `max-w-[400px]` container. Preserved Breadcrumb and `h1 tabIndex={-1}` for route-focus management. Fixed test scaffold bug: `tabIndex="-1"` → `tabindex="-1"` (renderToStaticMarkup produces lowercase HTML attributes).
- **Task 5 (AC-5):** Added `parseFrontmatter` function (simple string parsing, no YAML parser dependency) using the same regex pattern as `stripFrontmatter` (per DP-5 — deferred regex fix is out of scope). Badge renders above Markdown content with `title`, `status`, `updated` fields as label-value pairs in JetBrains Mono. Status field renders as a pill (`rounded-full`). Absent fields are skipped. No badge when no frontmatter.
- **Task 6 (AC-6):** Changed ChatInput root to `chat-input-box` container (`bg-surface-raised border border-border rounded-lg p-3 px-4 flex flex-col gap-2.5`) with `focus-within:` ring (preserves UX-DR16 visible focus). Textarea is transparent (`bg-transparent border-none outline-none`). Footer row (`flex items-center justify-between`) holds WorkingTreeIndicator (left, via `workingTreeIndicator` prop) and Send/Stop button (right). Moved WorkingTreeIndicator from ConversationPane direct child to ChatInput prop. SlashCommandPicker stays outside the container as a sibling.
- **Task 7:** All ATDD red-phase test scaffolds activated (test.skip() removed) and test-file headers updated from RED PHASE to GREEN PHASE. No skipped tests remain for done tasks.
- **Task 8:** Full test suite passes (743 tests, 62 suites, 0 skipped). 0 new lint errors. 0 new type errors. Pre-existing lint error (`CredentialErrorBanner.test.tsx`) and build type error (`AgentMessage.tsx`) confirmed at baseline commit — not introduced by this story.
- **NFR verification:** Re-read project-context.md and verified all applicable non-functional patterns: TypeScript strict mode, isolatedModules, Server/Client component directives, Next.js 16 async searchParams, h1 tabIndex={-1} route-focus, standard focus ring classes, semantic design tokens, co-located tests with P0/P1 tags, @jest-environment node for Server Component tests, ESM default-export mocks, focus-within ring, role="alert" + aria-describedby, no comments.

### File List

**Modified:**
- `apps/web/src/app/sign-in/page.tsx` — restructured to auth card + logo box + heading + legal footer (AC-1)
- `apps/web/src/app/sign-in/page.test.tsx` — activated 5 ATDD scaffolds, updated header to GREEN PHASE (AC-1)
- `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` — added form panel + BMAD-not-found styled panel (AC-2, AC-3)
- `apps/web/src/components/onboarding/RepositoryUrlForm.test.tsx` — activated 6 ATDD scaffolds, updated headers to GREEN PHASE (AC-2, AC-3)
- `apps/web/src/app/(dashboard)/(app)/settings/page.tsx` — replaced bare placeholder with designed empty-state (AC-4)
- `apps/web/src/app/(dashboard)/(app)/settings/page.test.tsx` — activated 7 ATDD scaffolds, updated header to GREEN PHASE, fixed tabIndex assertion (AC-4)
- `apps/web/src/components/artifact-browser/ArtifactViewer.tsx` — added parseFrontmatter + frontmatter metadata badge (AC-5)
- `apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx` — activated 6 ATDD scaffolds, updated header to GREEN PHASE (AC-5)
- `apps/web/src/components/conversation/ChatInput.tsx` — changed to chat-input-box container + transparent textarea + footer row + workingTreeIndicator prop (AC-6)
- `apps/web/src/components/conversation/ChatInput.test.tsx` — activated 7 ATDD scaffolds, updated header to GREEN PHASE (AC-6)
- `apps/web/src/components/conversation/ConversationPane.tsx` — moved WorkingTreeIndicator to ChatInput prop (AC-6)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status updated to in-progress → review

### Change Log

- 2026-07-12: Implemented all 6 visual container restorations (AC-1 through AC-6), activated 31 ATDD test scaffolds, verified 743 tests pass with 0 new lint/type errors

## Review

### NFR Evidence Audit (2026-07-12)

**Audit Mode:** Create (NFR-specific issues only)
**Auditor:** Master Test Architect
**Overall Status:** PASS ✅

**Summary:** 9 PASS, 2 CONCERNS (LOW), 2 INFO, 0 FAIL, 0 blockers. Story 5.1 is a frontend-only visual container story — no Prisma queries, no security headers, no sandbox/credential changes. The only new logic is the `parseFrontmatter` function in `ArtifactViewer.tsx`.

#### Select Projections & Take Limits

- **Status:** PASS ✅ — Story 5.1 introduces no new Prisma queries. Pre-existing queries on `artifacts/page.tsx` have correct `select` projections (`{ id, type, title, status, lastModifiedAt, path }` on `findMany`, `{ content: true }` on `findFirst`) and `take: 100` limit. Not modified by this story.

#### Security Headers

- **Status:** PASS ✅ — Story 5.1 does not modify `main.ts`, `middleware.ts`, or `next.config.js`. Pre-existing platform-wide security headers concern (no global `helmet()` on REST endpoints) is documented in Story 3.12 NFR assessment and is NOT introduced by Story 5.1. Sign-in page `<a href="#">` links are same-page anchors (no `target="_blank"`, no `rel` needed).

#### Timing Tests

- **Status:** CONCERNS ⚠️ (LOW) — See finding NFR-5.1-2 below.

#### Findings

| ID | Severity | Category | Description | Remediation |
| --- | --- | --- | --- | --- |
| NFR-5.1-1 | LOW | Performance | Double regex pass on artifact content: `parseFrontmatter` and `stripFrontmatter` both run the same regex (`^---\r?\n([\s\S]*?)\r?\n---\r?\n?`) on the full content string (`ArtifactViewer.tsx:107-108`). Server Component renders once per request, so not a re-render concern. Negligible at MVP scale (sub-ms for < 100KB artifacts). | Combine into a single function returning `{ frontmatter, strippedContent }` — one regex match, two derived values. Also ensures regex consistency if the deferred Story 2.5 regex fix is ever applied (per DP-5, both should update together). Owner: future hardening story. |
| NFR-5.1-2 | LOW | Testability | No timing test for NFR-P4 (Artifact loads within 2s). E2E test for AC-5 is `test.describe.skip` due to pre-existing environment issue (artifact content pane doesn't render). Component tests verify badge structure but not load time. Pre-existing gap, not introduced by Story 5.1. | Fix E2E environment issue (artifact rendering) in a dedicated hardening story. Add timing assertion (`toBeVisible({ timeout: 2_000 })`) once resolved. Owner: future E2E hardening story. |
| NFR-5.1-3 | INFO | Performance | `parseFrontmatter` returns all frontmatter fields, but only 3 are rendered (`title`, `status`, `updated` via `FRONTMATTER_FIELDS` filter). Minor inefficiency — could filter during parsing. | Optional — filter to `FRONTMATTER_FIELDS` during parsing. Not worth the code complexity at MVP scale. No action needed. |
| NFR-5.1-4 | INFO | Testability | 3 E2E test blocks skipped (AC-3: RSC wire format, AC-5: artifact rendering, AC-6 Stop: EventSource). All pre-existing environment issues, documented with reasons. Component tests cover all 3 ACs. | Fix E2E environment issues in a dedicated hardening story. Not a Story 5.1 blocker. |

#### Gate Decision

**PASS ✅** — No blockers, no HIGH/CRITICAL issues. The 2 LOW findings are negligible at MVP scale (sub-ms regex pass, pre-existing E2E gap). The 2 INFO findings require no action. Proceed to review sign-off.
