---
baseline_commit: d646fc30029ed258414685ef08b6b4f349d8c1f7
---

# Story 2.5: View a Single Artifact's Rendered Content

Status: done

## Story

As a user who has selected an Artifact,
I want to read its full content as rendered Markdown,
so that I can understand the team's work without GitHub's file navigation.

## Acceptance Criteria

### AC-1: Two-column layout when an Artifact is selected (FR16, UX-DR12)

**Given** an Artifact is selected by clicking it in the Artifact Browser's list (Story 2.4)
**When** the page renders
**Then** the list narrows to 280px and the rendered Artifact occupies the remaining content area (FR16, UX-DR12)
**And** content is read at its latest committed revision and rendered with standard Markdown formatting (headings, lists, tables, code blocks, bold, italic)
**And** the view is read-only — no editing controls are present
**And** the Artifact loads within 2 seconds (NFR-P4)

### AC-2: Artifact load error state

**Given** an Artifact fails to load
**When** the content pane renders
**Then** it shows "Couldn't load this artifact. Try refreshing the page." with a Refresh button

### AC-3: Back navigation returns to entry point (FR17)

**Given** the Artifact Browser is entered directly (e.g. from the side nav)
**When** the user navigates back
**Then** "Back" returns them to the Artifact Browser's full list; arriving from the Project Map (Story 2.6) or a Conversation Semantic Pill (wired in Epic 3) instead returns the user to that entry point (FR17)

## Tasks / Subtasks

- [x] Task 0: Install markdown rendering dependencies (AC: 1)
  - [x] 0.1 Add `react-markdown` and `remark-gfm` to the root `package.json` dependencies. Run `yarn add react-markdown remark-gfm` from the monorepo root. Both are post-1.0 stable packages (react-markdown 10.1.0, remark-gfm 4.0.1) — `^` prefix is acceptable per project-context.md version discipline. `react-markdown` is safe by default (no `dangerouslySetInnerHTML` — it builds a virtual DOM from a syntax tree). `remark-gfm` adds GitHub-Flavored Markdown support (tables, strikethrough, task lists, autolink literals) which AC-1 requires ("tables, code blocks, bold, italic")
  - [x] 0.2 Verify the packages install cleanly with `yarn install` and do not introduce lint/typecheck regressions: `yarn nx lint web` and `npx tsc --noEmit -p apps/web/tsconfig.json`

- [x] Task 1: Create the `ArtifactViewer` component (AC: 1)
  - [x] 1.1 Create `apps/web/src/components/artifact-browser/ArtifactViewer.tsx` — a Server Component (no `'use client'`). This component renders the selected artifact's Markdown content. The architecture (`architecture.md:508`) specifies `ArtifactViewer.tsx` in the `components/artifact-browser/` directory. Props: `{ content: string }`. The `content` is the raw Markdown stored in Postgres (includes YAML frontmatter)
  - [x] 1.2 Strip YAML frontmatter before rendering. The `content` field in Postgres includes the full file content (frontmatter + body). The `syncArtifacts` lib (`apps/web/src/lib/artifacts.ts:104-118`) already has frontmatter-parsing logic — reuse the same regex pattern: `content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')`. Inline this as a private function in `ArtifactViewer.tsx` — do NOT extract to a shared lib file (DP-3 — fewest moving parts; the regex is 1 line and has a single consumer). The frontmatter badge shown in the mockup (`key-artifact-browser.html:447-456`) is NOT implemented — it is not in the ACs or the UX spec's Artifact Browser States table (EXPERIENCE.md:287-293). The artifact's metadata (type, title, status, date) is already displayed in the selected list entry (DP-5 — defer scope temptation)
  - [x] 1.3 Render the stripped Markdown using `react-markdown` with `remark-gfm` plugin. Import: `import Markdown from 'react-markdown'` and `import remarkGfm from 'remark-gfm'`. Usage: `<Markdown remarkPlugins={[remarkGfm]}>{strippedContent}</Markdown>`. The `Markdown` component is synchronous (not `MarkdownAsync`) — `remark-gfm` is a synchronous plugin, so the synchronous `Markdown` component works in Server Components
  - [x] 1.4 Wrap the rendered Markdown in a content container matching the mockup (`key-artifact-browser.html:256-261,299-302`): `<div className="flex-1 overflow-y-auto px-12 py-8" role="main" aria-label="Artifact content">` containing `<div className="max-w-[720px]">`. The `max-w-[720px]` matches the mockup's `.md-content { max-width: 720px; }` and DESIGN.md's content breathing room pattern. The content pane scrolls independently (EXPERIENCE.md:356 — "the selected artifact's Markdown content scrolls independently within the content pane"). Do NOT add `prose prose-invert` classes — `@tailwindcss/typography` is NOT installed (see Task 1.5 for the component-override alternative)
  - [x] 1.5 Do NOT install `@tailwindcss/typography`. The project does not use the Tailwind Typography plugin (not in `package.json` or `tailwind.config.ts`). Instead, style the Markdown output using custom component overrides via `react-markdown`'s `components` prop. Map heading and text elements to Tailwind classes matching the mockup's `.md-*` classes and DESIGN.md's typography scale (DESIGN.md:247 — "headings map down one step relative to their document hierarchy: H1 → `xl`, H2 → `lg`, H3 → `base semibold`"). Each `components` entry MUST be a function component (not a string) that spreads the incoming props and applies the className — e.g. `h1: ({node, ...props}) => <h1 className="text-xl font-semibold text-text-1 mb-4" {...props} />`. The className values: `h1: 'text-xl font-semibold text-text-1 mb-4'`, `h2: 'text-lg font-semibold text-text-1 mt-7 mb-2.5 pt-5 border-t border-border-subtle'`, `h3: 'text-base font-semibold text-text-1 mt-5 mb-2'`, `p: 'text-base leading-6 text-text-1 mb-5'`, `ul: 'pl-5 mb-5 flex flex-col gap-1.5'`, `li: 'text-base leading-6 text-text-1'`, `code: 'font-mono text-sm text-text-1 bg-surface-raised rounded px-1.5 py-0.5'`, `pre: 'bg-surface-raised border border-border rounded-lg p-4 mb-5 overflow-x-auto'`, `table: 'w-full mb-5 border-collapse'`, `th: 'border border-border px-3 py-2 text-left text-sm font-semibold text-text-1'`, `td: 'border border-border px-3 py-2 text-sm text-text-1'`, `blockquote: 'border-l-2 border-border pl-4 text-text-2 mb-5'`, `a: 'text-accent hover:text-accent-hover underline'`, `strong: 'font-semibold text-text-1'`, `em: 'italic'`, `ol: 'pl-5 mb-5 flex flex-col gap-1.5 list-decimal'`, `hr: 'border-border-subtle border-t my-6'`, `del: 'line-through text-text-2'`. The `ol`, `hr`, and `del` overrides cover GFM elements that `remark-gfm` adds (strikethrough via `del`) and standard Markdown elements (`ol` ordered lists, `hr` horizontal rules) — without these, they render with default browser styling that doesn't match the design tokens. Destructure `node` out of props (react-markdown passes a `node` prop that should not be spread to the DOM). This is the simplest approach (DP-3 — no new dependency, uses existing design tokens)
  - [x] 1.6 Create `apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx` — co-located test using `@testing-library/react` with `jsdom` environment. `ArtifactViewer` is a synchronous Server Component (no async logic), so `render()` works directly. Mock `react-markdown` as a render stub: `jest.mock('react-markdown', () => ({ __esModule: true, default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div> }))` — the `__esModule: true, default: ...` shape matches `react-markdown` v10's default export (the package exports `Markdown` as the default export, not as a named export). This isolates the test from the markdown rendering library's internals and tests only the frontmatter-stripping and container structure. Test cases: [P0] renders a container with `role="main"` and `aria-label="Artifact content"`; [P0] strips YAML frontmatter before passing content to Markdown (content with `---\ntitle: Test\n---\n# Hello` → Markdown receives `# Hello`); [P0] renders content without frontmatter as-is; [P0] renders empty content without error; [P1] handles content with no frontmatter (passes through unchanged); [P1] handles content with CRLF line endings in frontmatter

- [x] Task 2: Create the `ArtifactLoadError` Client Component (AC: 2)
  - [x] 2.1 Create `apps/web/src/components/artifact-browser/ArtifactLoadError.tsx` — a Client Component (`'use client'`). This component renders the "Couldn't load this artifact" error message and a Refresh button. It uses `useRouter` from `next/navigation` and calls `router.refresh()` on click — this re-renders the Server Component, which re-reads Postgres. This follows the "manual browser reload" pattern (project-context.md:93 — "No automatic client-side revalidation anywhere. Manual browser reload picks up fresh server-rendered state."). `router.refresh()` is the programmatic equivalent of a manual reload. No props needed
  - [x] 2.2 Render the error state matching the UX spec (EXPERIENCE.md:292 — "Couldn't load this artifact. Try refreshing the page." with a Refresh button) and the canonical error-surface pattern from `error.tsx` (`apps/web/src/app/(dashboard)/(app)/artifacts/error.tsx:21-31`): `<div className="flex flex-col items-center justify-center h-full">` containing `<p className="text-text-2 text-sm">Couldn&apos;t load this artifact. Try refreshing the page.</p>` and a `<button type="button" onClick={() => router.refresh()}>` with className `mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` and text "Refresh". The button className matches `error.tsx`'s Refresh button exactly (DP-3 — consistent with the established pattern)
  - [x] 2.3 Create `apps/web/src/components/artifact-browser/ArtifactLoadError.test.tsx` — co-located test using `@testing-library/react` with `jsdom` environment. Mock `next/navigation` (`useRouter`). Test cases: [P0] renders the error message text; [P0] renders a Refresh button; [P0] calls `router.refresh()` when the Refresh button is clicked; [P0] button has focus ring classes (`focus:ring-2 focus:ring-accent`)

- [x] Task 3: Update `ArtifactListEntry` to support click and selected state (AC: 1)
  - [x] 3.1 Update `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` — add `href: string` (required) and `selected?: boolean` (optional) props to `ArtifactListEntryProps`. Import `Link` from `next/link`. Change the root element from `<div>` to `<Link href={href}>`. The `<Link>` renders an `<a>` tag — it provides client-side navigation (no full page reload, the Server Component re-executes with new `searchParams`). Keep `role="listitem"` on the `<Link>` (matches the mockup's `role="listitem"` on `.list-entry` and the ARIA pattern where `role="list"` children have `role="listitem"`). Keep the existing `aria-label` format. Add `aria-current={selected ? 'true' : undefined}` — standard for the currently-selected item in a list (matches mockup `key-artifact-browser.html:412` `aria-current="true"`)
  - [x] 3.2 Update the container className to support the selected and hover states per the mockup (`key-artifact-browser.html:201-214`): base className remains `py-2.5 px-4 flex flex-col gap-0.5` — add focus ring classes `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` to the base (applies in both selected and unselected states, consistent with UX-DR16's visible focus ring requirement and the `error.tsx` button pattern). When `selected`: add `bg-surface-raised border-l-2 border-accent` (matches mockup's `.list-entry.selected { background: #1E1E26; border-left: 2px solid #7B6EE8; }`). When not `selected`: add `hover:bg-surface-raised/60 transition-colors` (matches mockup's `.list-entry:hover { background: rgba(30,30,38,0.6); }`). The `<a>` tag has `cursor: pointer` by default — no need to add `cursor-pointer`. Use `cn()` from `@/lib/utils` to merge conditional classes (the codebase's established pattern — see `SideNavigation.tsx:48-51`). Import `cn` from `@/lib/utils`
  - [x] 3.3 Update `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` — update the test to pass the new required `href` prop. Update the stale "RED PHASE" header comment to cite Story 2.5 and the new props (`href`, `selected`). Add test cases: [P0] renders as a link (`<a>` tag) with the correct `href`; [P0] renders `aria-current="true"` when `selected` is true; [P0] does NOT render `aria-current` when `selected` is false; [P0] applies selected styling classes (`bg-surface-raised`, `border-accent`) when selected; [P0] applies hover classes when not selected; [P0] preserves existing `role="listitem"` and `aria-label` behavior. Keep the existing P0/P1 tests from Story 2.4 (type label, title, status badge, date, unknown type/status) — update the component calls to include `href`

- [x] Task 4: Update the Artifact Browser page to handle the selected-artifact state (AC: 1, 2, 3)
  - [x] 4.1 Update `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` — extend the page to accept `searchParams` and render the two-column layout when an artifact is selected. In Next.js 16, `searchParams` is a `Promise` and must be awaited (see `apps/web/src/app/sign-in/page.tsx:5-9` for the canonical pattern). The page function signature changes to `export default async function ArtifactsPage({ searchParams }: { searchParams: Promise<{ id?: string }> })`. Await it at the top: `const { id: selectedArtifactIdParam } = await searchParams;`. Next.js App Router passes `searchParams` from the URL query string — `/artifacts?id=art_123` → `{ id: 'art_123' }`. This is the query-parameter approach (DP-2 — see Decision Records)
  - [x] 4.2 Extract the selected artifact ID: `const selectedArtifactId = selectedArtifactIdParam ?? null`. When `selectedArtifactId` is null, render the existing full-width list (Story 2.4's behavior — no changes to the list-only state). When `selectedArtifactId` is present, render the two-column layout
  - [x] 4.3 When an artifact is selected, query the selected artifact's content from Postgres. Add a separate `findFirst` query (do NOT add `content` to the list query's `select` — fetching content for all 100 artifacts would be wasteful, only the selected one needs its content). Query: `const selectedArtifact = await getPrisma().artifact.findFirst({ where: { id: selectedArtifactId, repoConnectionId: repoConnection.id }, select: { id: true, type: true, title: true, status: true, lastModifiedAt: true, content: true } })`. Use `findFirst`, NOT `findUnique` — the `Artifact` model (`schema.prisma:56-73`) has `@@unique([repoConnectionId, path])` but no `@@unique([id, repoConnectionId])`, so `findUnique({ where: { id, repoConnectionId } })` is invalid Prisma (it would be a type error). `findFirst` with both `id` and `repoConnectionId` in the `where` clause enforces tenant isolation (project-context.md:280 — "Every credential lookup must pass a `tenant_id` / `userId` check") — the `repoConnectionId` filter ensures the artifact belongs to the authenticated user's repo. Run this query AFTER the sync-on-first-visit block — if Postgres is empty and a user navigates directly to `/artifacts?id=art_123`, the sync populates Postgres first, then the `findFirst` finds the just-synced artifact. Running it before the sync would return `null` (artifact not found) and render `ArtifactLoadError` even though the sync would have made it available. Do NOT include it in the `Promise.all` — it would run unnecessarily when no artifact is selected
  - [x] 4.4 Render the two-column layout when an artifact is selected. Replace the existing `<div className="flex-1 overflow-y-auto px-8 pb-8">` content area with a conditional: when `selectedArtifactId` is present (regardless of whether `selectedArtifact` was found), render `<div className="flex flex-1 overflow-hidden">` (the two-column container) containing: (a) the list pane `<div className="w-[280px] flex-shrink-0 border-r border-border-subtle overflow-y-auto">` with the artifact list (same `ArtifactListEntry` mapping, but each entry now gets `href={`/artifacts?id=${a.id}`}` and `selected={a.id === selectedArtifactId}`), and (b) the content pane: when `selectedArtifact` exists (not null), render `<ArtifactViewer content={selectedArtifact.content} />`; when `selectedArtifact` is null (not found), render `<ArtifactLoadError />`. The two-column layout renders whenever an artifact ID is in the URL — the list narrows to 280px and the content pane shows either the rendered Markdown or the load error. Do NOT gate the two-column layout on `selectedArtifact` being truthy — that would make AC-2 (Artifact load error state) unreachable, since the error pane only renders inside the two-column layout. When no artifact is selected (`selectedArtifactId` is null), render the existing full-width list (Story 2.4's layout — `<div className="flex-1 overflow-y-auto px-8 pb-8">` with the list, each entry gets `href={`/artifacts?id=${a.id}`}` and `selected={false}`). The two-column layout matches the mockup (`key-artifact-browser.html:185-189` — `.two-col { display: flex; flex: 1; overflow: hidden; }`) and the UX spec (EXPERIENCE.md:82,290 — "list narrows to 280px; the rendered artifact occupies the remaining content area")
  - [x] 4.5 Update the list rendering to pass `href` and `selected` to every `ArtifactListEntry`. In both the full-width and two-column layouts, each `<ArtifactListEntry>` now requires `href={`/artifacts?id=${a.id}`}`. In the two-column layout, the selected entry also gets `selected={true}`. In the full-width layout, no entry is selected (`selected` defaults to `false`). This makes all list entries interactive (clickable) — clicking navigates to `/artifacts?id={a.id}`, which triggers the two-column layout with that artifact pre-selected
  - [x] 4.6 Keep the existing header, credential banner, sync-on-first-visit, and empty-state logic unchanged. The `CredentialErrorBanner` still renders above the content area in both layouts. The sync-on-first-visit pattern still runs when Postgres is empty. The empty state still shows "Start your first conversation to create an artifact." when no artifacts exist. The `return null as never;` after `redirect()` calls is preserved
  - [x] 4.7 Add `return null as never;` after each `redirect()` call — already present from Story 2.4, ensure it remains after the signature change

- [x] Task 5: Update the loading skeleton for the two-column state (AC: 1)
  - [x] 5.1 Update `apps/web/src/app/(dashboard)/(app)/artifacts/loading.tsx` — the loading skeleton currently renders the full-width list-only state. The `loading.tsx` is rendered by Next.js while the Server Component executes. Since the Server Component now handles both list-only and two-column states based on `searchParams`, the loading skeleton should match the two-column state when an artifact is being loaded. However, `loading.tsx` does not receive `searchParams` — it is a static skeleton. The simplest approach (DP-3): keep the existing list-only skeleton. When the page resolves, it renders the correct layout. The skeleton is a brief transitional state — it does not need to match the final layout exactly. The UX spec's "Artifact loading" state (EXPERIENCE.md:291 — "Content pane shows a skeleton loader while the Markdown file is fetched from the Repository") refers to the content pane's skeleton within the two-column layout, not the `loading.tsx` file. The `loading.tsx` covers the initial page load; the content pane skeleton is not needed because the content is read from Postgres (not fetched from GitHub on every view) — the query is fast enough to not need a separate content-pane skeleton. If the content query is slow, the `error.tsx` boundary catches failures. Do NOT add a content-pane skeleton (DP-5 — the ACs do not mention a content-pane loading state, only an error state)
  - [x] 5.2 Update `apps/web/src/app/(dashboard)/(app)/artifacts/loading.test.tsx` — no changes needed. The existing 3 tests (h1, skeleton structure, no CredentialErrorBanner) still pass. The loading skeleton is unchanged

- [x] Task 6: Update the page tests (AC: 1, 2, 3)
  - [x] 6.1 Update `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` — the existing tests from Story 2.4 need to be updated to handle the new `searchParams` prop and the new two-column layout. The page function now accepts `{ searchParams: Promise<{ id?: string }> }`. Update the `renderPage()` helper to accept optional search params: `async function renderPage(searchParams?: { id?: string }) { const element = await ArtifactsPage({ searchParams: Promise.resolve(searchParams ?? {}) }); return renderToStaticMarkup(element); }` — this follows the pattern from `sign-in/page.test.tsx:26` (`Promise.resolve({})`). Update the `ArtifactListEntry` mock to accept `href` and `selected` props: `({ type, title, status, lastModifiedAt, href, selected }) => 'ArtifactListEntry:${type}:${title}:${status}:${lastModifiedAt.toISOString()}:${href}:${selected}'`. Add mocks for `ArtifactViewer` and `ArtifactLoadError`: `jest.mock('@/components/artifact-browser/ArtifactViewer', () => ({ ArtifactViewer: ({ content }: { content: string }) => 'ArtifactViewer:' + content }))` and `jest.mock('@/components/artifact-browser/ArtifactLoadError', () => ({ ArtifactLoadError: () => 'ArtifactLoadError' }))`. Add `findFirst` to the Prisma mock: `artifact: { findMany: mockFindMany, findFirst: mockFindFirst }`
  - [x] 6.2 Update existing Story 2.4 tests to pass `searchParams: {}` (no selection) — the list-only state should still render as before, with each `ArtifactListEntry` now receiving `href` and `selected={false}`. All existing P0/P1 tests should still pass with updated mock assertions
  - [x] 6.3 Add new test cases for the two-column layout: [P0] when `searchParams.id` is present and the artifact exists, renders the two-column layout (list at 280px + ArtifactViewer); [P0] queries the selected artifact by id and repoConnectionId via `findFirst` (tenant isolation); [P0] passes the artifact's content to ArtifactViewer; [P0] marks the selected entry with `selected={true}`; [P0] when `searchParams.id` is present but the artifact is not found (`findFirst` returns null), renders the two-column layout with ArtifactLoadError in the content pane (AC-2); [P0] when no `searchParams.id`, renders the full-width list (no two-column layout); [P0] each ArtifactListEntry receives `href={`/artifacts?id=${a.id}`}`; [P1] the selected artifact query is NOT run when no `searchParams.id`; [P1] the list query does NOT select `content` (only the findFirst does); [P1] renders CredentialErrorBanner in the two-column layout when credential is failed; [P1] when Postgres is empty and `searchParams.id` is present, the sync-on-first-visit runs before the `findFirst` query (so the artifact is available if sync succeeds)

- [x] Task 7: Verify lint, typecheck, and tests pass (AC: all)
  - [x] 7.1 Run `yarn nx lint web` — 0 new errors/warnings (baseline: 0 errors, 9 warnings per Story 2.4 completion)
  - [x] 7.2 Run typecheck — `npx tsc --noEmit -p apps/web/tsconfig.json` (the `typecheck` target is not configured in `project.json` — known issue from Story 2.2)
  - [x] 7.3 Run `yarn nx test web` — all new and existing tests pass (baseline: 433 tests per Story 2.4 completion)

## Dev Notes

### Decision Records

**Decision (DP-2):** The architecture (`architecture.md:489-491`) specifies the Artifact Browser route as `artifacts/[artifactId]/page.tsx` — a dynamic route. The UX spec (EXPERIENCE.md:79 — "The Artifact Browser is a single route with two distinct layout states") and the PRD (FR-16 — "single page with two layout states") both say "single route." The mockup's address bar (`key-artifact-browser.html:360` — `app.bmad-easy.com/artifacts?id=prd-bmad-easy`) shows a query parameter. This is a spec contradiction. Per DP-2, follow the semantic intent over the literal text: implement as a single route (`artifacts/page.tsx`) with a query parameter (`?id={artifactId}`) that controls the layout state. Amend the architecture: the `artifacts/[artifactId]/page.tsx` dynamic route is replaced by `artifacts/page.tsx` with `searchParams.id`. The architecture amendment should be recorded in a future architecture update (DP-2 — "amend the spec artifact so the contradiction is resolved on record"). This is a docs-only change to `architecture.md` — deferred to a separate commit (DP-5 — the architecture amendment is not Story 2.5's implementation scope, it is a planning-artifact update).

**Decision (DP-3):** Choose `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 for Markdown rendering. No Markdown library is installed in the project. Options considered: (a) `react-markdown` + `remark-gfm` — renders to React elements (safe by default, no `dangerouslySetInnerHTML`), works in Server Components, most React-idiomatic; (b) `marked` — outputs HTML string, requires `dangerouslySetInnerHTML`, needs manual sanitization; (c) `markdown-it` — similar to `marked`. All options are reversible (can swap libraries) and functionally equivalent (they all render Markdown). Per DP-3, pick the simplest: `react-markdown` is safest (no XSS surface), requires no sanitization step, and integrates naturally with React/Next.js Server Components. Both packages are post-1.0 stable (react-markdown 10.1.0, remark-gfm 4.0.1) — `^` prefix is acceptable per project-context.md version discipline (pre-1.0 packages must be pinned exact; post-1.0 may use `^`).

**Decision (DP-3):** Do NOT install `@tailwindcss/typography`. The project does not use the Tailwind Typography plugin (not in `package.json` or `tailwind.config.ts`). Instead, style the Markdown output using `react-markdown`'s `components` prop — map each HTML element to a className using existing design tokens. This avoids adding a new dependency and keeps the styling consistent with the mockup's `.md-*` classes and DESIGN.md's typography scale. Fewest moving parts (DP-3).

**Decision (DP-5):** Do NOT render the frontmatter badge shown in the mockup (`key-artifact-browser.html:447-456`). The frontmatter badge displays `title`, `status`, and `updated` fields from the artifact's YAML frontmatter. It is NOT mentioned in the ACs, the UX spec's Artifact Browser States table (EXPERIENCE.md:287-293), or the UX spec's Artifact List pattern (EXPERIENCE.md:177-185). The artifact's metadata (type, title, status, date) is already displayed in the selected list entry. The frontmatter badge is a design detail that can be added later if desired. Per DP-5, defer scope temptation — record as a deferred finding, not new scope.

**Decision (DP-5):** Do NOT implement Story 2.6's Project Map click behavior. Story 2.6 ("Navigate from the Project Map to an Artifact") will wire `ArtifactCard` clicks to navigate to `/artifacts?id={artifactId}`. Story 2.5 only implements click-within-list behavior (clicking an `ArtifactListEntry` navigates to `/artifacts?id={artifactId}`). The `ArtifactCard` component remains display-only in Story 2.5 (same as Story 2.2 delivered it). Per DP-5, defer scope temptation.

**Decision (DP-3):** For the "Artifact load error" Refresh button, create a minimal Client Component (`ArtifactLoadError`) that calls `router.refresh()`. This follows the established pattern from `error.tsx` (which uses `reset()` — the error-boundary equivalent of `router.refresh()`). The alternative — a plain `<a>` tag pointing to the same URL — does not cause a full page reload in Next.js App Router (it triggers client-side navigation). A `<form>` with a Server Action is more complex than needed. `router.refresh()` is the simplest approach that re-renders the Server Component (DP-3 — fewest moving parts).

**Decision (DP-3):** Strip YAML frontmatter using an inline regex in `ArtifactViewer.tsx` rather than extracting to a shared utility. The regex (`content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')`) is 1 line and has a single consumer. The `syncArtifacts` lib (`apps/web/src/lib/artifacts.ts:104-118`) has similar frontmatter-parsing logic, but it parses frontmatter to extract a title — different purpose. Extracting a shared frontmatter-stripping function would touch `lib/artifacts.ts` (existing code) for no benefit (DP-3). If a third consumer appears, extract then.

**Decision (DP-3):** Validation found Task 4.3 specified `findUnique({ where: { id, repoConnectionId } })` — invalid Prisma. The `Artifact` model (`schema.prisma:56-73`) has `@@unique([repoConnectionId, path])` but no `@@unique([id, repoConnectionId])`, so `findUnique` with both fields is a type error. Amended to `findFirst({ where: { id, repoConnectionId } })` — the only correct option for tenant-scoped lookup by non-unique compound fields. `findFirst` returns `null` when not found, satisfying AC-2's "artifact fails to load" path. Tenant isolation is a security requirement (project-context.md:280), not a reversible choice — `findUnique({ where: { id } })` without `repoConnectionId` would weaken authorization and is rejected per the decision policy's "Always escalate" clause on weakening authorization.

**Decision (DP-3):** Validation found Task 4.3 placed the `findFirst` query "after the existing `Promise.all`" without specifying its position relative to the sync-on-first-visit block. The existing page flow is `Promise.all` → sync-on-empty → render. If `findFirst` runs before the sync block, direct navigation to `/artifacts?id=art_123` with empty Postgres returns `null` (artifact not found) and renders `ArtifactLoadError` even though the sync would populate it. Amended to run `findFirst` AFTER the sync-on-first-visit block. This is the simplest correct ordering (DP-3) — the alternative (run before, re-query if null) adds complexity for no benefit.

**Decision (DP-2):** Validation found Task 4.4 gated the two-column layout on `selectedArtifactId && selectedArtifact` (both must be truthy), but the same task's content-pane branch handles `selectedArtifact` being null (rendering `ArtifactLoadError`). This is a contradiction — if the two-column layout only renders when `selectedArtifact` is truthy, the `ArtifactLoadError` branch is unreachable, making AC-2 unimplementable. The UX spec (EXPERIENCE.md:290-292) defines "Artifact load error" as a content-pane state within the two-column layout ("List narrows to 280px" applies, then the content pane shows the error). Amended to gate the two-column layout on `selectedArtifactId` only — the list narrows whenever an artifact ID is in the URL, and the content pane conditionally renders `ArtifactViewer` (found) or `ArtifactLoadError` (not found). Intent over literal text.

**Decision (DP-4):** Validation found Task 1.4 included `prose prose-invert` in the content container className while Task 1.5 explicitly says `@tailwindcss/typography` is NOT installed. The `prose` classes would be no-ops. Removed `prose prose-invert` from the container — styling comes from the `react-markdown` `components` prop overrides in Task 1.5. Artifact-only change, no production behavior change.

**Decision (DP-4):** Validation found the Component Boundaries section stated `Link` is from `next/navigation`. `Link` is from `next/link`; `next/navigation` exports `useRouter`, `redirect`, `usePathname`. Corrected to `next/link`. Artifact-only change, no production behavior change.

**Decision (DP-4):** Validation found Task 1.5 listed className strings for each element override without showing the function-component shape. The `react-markdown` `components` prop accepts a function component (or string element name) per key — to apply a className, a function that destructures `node` (to prevent it from reaching the DOM) and spreads the remaining props is required. Added an explicit example shape (`h1: ({node, ...props}) => <h1 className="..." {...props} />`) to prevent the dev from passing bare strings, which would replace the element tag but not add styling. Test-only/artifact-only change, no production behavior change.

**Decision (DP-2):** Validation found Task 1.6 and the Testing Patterns section specified the `react-markdown` test mock as `{ Markdown: ... }` (named export), but `react-markdown` v10 exports `Markdown` as the **default export** (confirmed via the npm docs: "The default export is `Markdown`"). Task 1.3 correctly uses `import Markdown from 'react-markdown'` (default import). This is a spec contradiction — the mock doesn't match the import. Amended both the Task 1.6 mock and the Testing Patterns mock to `{ __esModule: true, default: ... }` so the mock shape matches the default-export import. Intent over literal text.

**Decision (DP-4):** Validation found the Component Boundaries section stated `Markdown` is "a Client Component (uses React hooks internally)." Per the react-markdown v10 docs, the synchronous `Markdown` component does NOT use hooks — only `MarkdownHooks` uses `useEffect`/`useState`. `Markdown` is a synchronous component that works in Server Components. Corrected the Component Boundaries section to reflect this: no server-client boundary exists, so the `components` prop (function components) can be passed directly without serialization concerns. Artifact-only change, no production behavior change.

**Decision (DP-4):** Validation found Task 3.2 omitted focus ring classes from the `ArtifactListEntry` className. The Accessibility section (line 198) mentions `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` but Task 3.2's className spec didn't include them. Without explicit ring classes, the browser default outline shows (project-context.md:376 — degrades to visible-but-unstyled), but for consistency with UX-DR16 and the `error.tsx` button pattern, the explicit classes should be in the base className. Added focus ring classes to Task 3.2's base className. Artifact-only change, no production behavior change.

**Decision (DP-4):** Validation found Task 1.5's component overrides omitted `ol` (ordered list), `hr` (horizontal rule), and `del` (strikethrough). `remark-gfm` adds `del` support; `ol` and `hr` are standard Markdown elements. Without overrides, these render with default browser styling that doesn't match the design tokens. Added `ol: 'pl-5 mb-5 flex flex-col gap-1.5 list-decimal'`, `hr: 'border-border-subtle border-t my-6'`, `del: 'line-through text-text-2'` to Task 1.5 and the Design Token Usage section. Artifact-only change, no production behavior change.

### What Already Exists (Do Not Recreate)

- **`ArtifactListEntry` component** (`apps/web/src/components/artifact-browser/ArtifactListEntry.tsx`) — Story 2.4 delivered this as a display-only Server Component. Story 2.5 updates it to add `href` and `selected` props and changes the root element to `<Link>`. The existing `TYPE_LABELS`, `STATUS_LABELS`, `STATUS_BADGE_CLASSES`, and `formatDate` helper remain unchanged
- **`ArtifactViewer` component** (`apps/web/src/components/artifact-browser/ArtifactViewer.tsx`) — Story 2.5 creates this. The architecture (`architecture.md:508`) specifies it in the `components/artifact-browser/` directory. It does NOT exist yet
- **`ArtifactAccessLink` component** (`architecture.md:509`) — the architecture mentions `ArtifactAccessLink.tsx` for FR-17. This is Story 2.6's scope (Project Map → Artifact Browser link). Do NOT create it in Story 2.5
- **`syncArtifactsAction()`** (`apps/web/src/actions/artifacts.actions.ts`) — Story 2.1 delivered this. The page calls it in the sync-on-first-visit pattern. Do not modify it
- **`getCredentialHealthStatus()`** (`apps/web/src/actions/credential-health.actions.ts`) — Story 1.6 delivered this. Called via `Promise.all` in the page. Do not modify it
- **`CredentialErrorBanner`** (`apps/web/src/components/project-map/CredentialErrorBanner.tsx`) — Story 2.2 delivered this. Imported from `@/components/project-map/CredentialErrorBanner` (DP-3 — do not move). Renders in both list-only and two-column layouts
- **`Breadcrumb`** (`apps/web/src/components/shell/Breadcrumb.tsx`) — Story 1.8 delivered this. Renders "← Project Map" link. Remains unchanged
- **`Artifact` Prisma model** (`libs/database-schemas/src/prisma/schema.prisma:56-71`) — Story 2.1 delivered this. Fields: `id`, `type`, `title`, `status`, `lastModifiedAt`, `content`, `path`, `repoConnectionId`. The `content` field stores the full Markdown content including YAML frontmatter. Story 2.5 reads this field via `findFirst` (scoped by `repoConnectionId` for tenant isolation) when an artifact is selected
- **`ArtifactType` and `ArtifactStatus` types** (`libs/shared-types/src/artifact.types.ts`) — Story 2.1 delivered these. Imported by `ArtifactListEntry` and the page
- **`(app)` layout guard** (`apps/web/src/app/(dashboard)/(app)/layout.tsx`) — Story 1.8 delivered this. Redirects to `/sign-in` if unauthenticated, `/onboarding` if no repo connection. The artifacts page does not repeat these guards but performs its own `repoConnection.findUnique` lookup
- **`AppShell`** (`apps/web/src/components/shell/AppShell.tsx`) — Story 1.8 delivered this. Focus management moves focus to `h1` on route change. The page already renders `<h1>Artifact Browser</h1>` (from Story 2.4). No changes needed
- **`error.tsx`** (`apps/web/src/app/(dashboard)/(app)/artifacts/error.tsx`) — Story 2.4 delivered this. Client Component error boundary with `reset()`. Remains unchanged — it catches unhandled Server Component errors. The "Artifact load error" state (AC-2) is a separate inline state handled by `ArtifactLoadError`, not the `error.tsx` boundary
- **`loading.tsx`** (`apps/web/src/app/(dashboard)/(app)/artifacts/loading.tsx`) — Story 2.4 delivered this. Server Component skeleton. Remains unchanged (DP-3 — the loading skeleton is a brief transitional state, does not need to match the two-column layout)
- **`cn()` helper** (`apps/web/src/lib/utils.ts`) — clsx + tailwind-merge. Used for conditional class merging. Import from `@/lib/utils`

### How AC-1 Is Satisfied

AC-1 ("list narrows to 280px and the rendered Artifact occupies the remaining content area") is satisfied by:

1. The page reads `searchParams.id` — when present, it queries the selected artifact's `content` from Postgres via `findFirst` (scoped by `repoConnectionId` for tenant isolation)
2. The page renders a two-column layout: `<div className="flex flex-1 overflow-hidden">` containing the list pane (`w-[280px]`) and the content pane (`flex-1`)
3. The list pane renders the same `ArtifactListEntry` components as the full-width list, but each entry gets `href={`/artifacts?id=${a.id}`}` and `selected={a.id === selectedArtifactId}`
4. The content pane renders `<ArtifactViewer content={selectedArtifact.content} />` which strips frontmatter and renders the Markdown body with `react-markdown` + `remark-gfm`
5. "Read-only — no editing controls are present" — the `ArtifactViewer` renders only `<Markdown>` output, no edit buttons or form controls
6. "Loads within 2 seconds" — the content is read from Postgres (not fetched from GitHub on every view). The Prisma `findFirst` query is fast (<100ms for a single row by primary key). The Markdown rendering happens server-side in the Server Component. The 2-second budget is easily met

### How AC-2 Is Satisfied

AC-2 ("Couldn't load this artifact. Try refreshing the page." with a Refresh button) is satisfied by:

1. When `searchParams.id` is present but the `findFirst` query returns `null` (artifact not found), the page renders `<ArtifactLoadError />` in the content pane of the two-column layout
2. `ArtifactLoadError` is a Client Component that renders the error message and a Refresh button
3. The Refresh button calls `router.refresh()` which re-renders the Server Component — if the artifact was synced since the last load (e.g., by another tab), it will now be available
4. The error message copy matches the UX spec (EXPERIENCE.md:292) exactly: "Couldn't load this artifact. Try refreshing the page."
5. The Refresh button styling matches the canonical `error.tsx` pattern (`ring-offset-surface`, `bg-accent`, etc.)

### How AC-3 Is Satisfied

AC-3 ("Back" returns to entry point) is satisfied by the query-parameter approach + browser back button:

1. Direct entry: user navigates to `/artifacts` (full-width list), clicks an entry → `/artifacts?id=art_123` (two-column layout). Browser back button → `/artifacts` (full-width list). The list-only state is restored
2. From Project Map (Story 2.6): user navigates from `/project-map` to `/artifacts?id=art_123`. Browser back button → `/project-map`. Story 2.6 wires the `ArtifactCard` click to navigate to `/artifacts?id={artifactId}`
3. From Conversation Semantic Pill (Epic 3): user navigates from `/conversations/xxx` to `/artifacts?id=art_123`. Browser back button → `/conversations/xxx`. Epic 3 wires the Semantic Pill "View" link
4. The breadcrumb "← Project Map" is always present as an explicit navigation link back to the Project Map (from Story 1.8/2.4)
5. No special "Back" control is needed — the browser's back button and the breadcrumb handle all entry-point scenarios. The UX spec does not define a separate "Back" button in the content pane

### Component Boundaries

- `ArtifactListEntry` becomes a **Server Component** that renders a `<Link>` (Client Component import). Server Components can render Client Components — `<Link>` from `next/link` works in Server Components. The component receives `href`, `selected`, and the existing props (`type`, `title`, `status`, `lastModifiedAt`)
- `ArtifactViewer` is a **Server Component** (no `'use client'`). It imports `react-markdown`'s `Markdown` component (the default export). The synchronous `Markdown` component does NOT use React hooks — only `MarkdownHooks` does (per the react-markdown v10 docs). Because `Markdown` is synchronous and hook-free, it works as a Server Component: no server-client boundary exists, so the `components` prop (function components) can be passed directly without serialization concerns. The `remark-gfm` plugin is synchronous, so the synchronous `Markdown` component is the correct choice (not `MarkdownAsync` for async plugins, or `MarkdownHooks` for client-side async)
- `ArtifactLoadError` is a **Client Component** (`'use client'`). It uses `useRouter` from `next/navigation` (Client Component API). The page renders it as a child in the content pane when the artifact is not found
- The page remains a **Server Component** — it reads from Postgres via Prisma, renders `ArtifactListEntry`, `ArtifactViewer`, and `ArtifactLoadError` as children. Server Components can render Client Components

### Design Token Usage

All colors and spacing from `tailwind.config.ts` (mirrors DESIGN.md). Use semantic token names, never raw hex:

- List pane container: `w-[280px] flex-shrink-0 border-r border-border-subtle overflow-y-auto`
- Two-column container: `flex flex-1 overflow-hidden`
- Selected entry: `bg-surface-raised border-l-2 border-accent` (added to base `py-2.5 px-4 flex flex-col gap-0.5`)
- Unselected entry hover: `hover:bg-surface-raised/60 transition-colors`
- Content pane: `flex-1 overflow-y-auto px-12 py-8` with inner `max-w-[720px]`
- Markdown h1: `text-xl font-semibold text-text-1 mb-4`
- Markdown h2: `text-lg font-semibold text-text-1 mt-7 mb-2.5 pt-5 border-t border-border-subtle`
- Markdown h3: `text-base font-semibold text-text-1 mt-5 mb-2`
- Markdown p: `text-base leading-6 text-text-1 mb-5`
- Markdown ul: `pl-5 mb-5 flex flex-col gap-1.5`
- Markdown li: `text-base leading-6 text-text-1`
- Markdown code (inline): `font-mono text-sm text-text-1 bg-surface-raised rounded px-1.5 py-0.5`
- Markdown pre (block): `bg-surface-raised border border-border rounded-lg p-4 mb-5 overflow-x-auto`
- Markdown table/th/td: `w-full mb-5 border-collapse` / `border border-border px-3 py-2 text-left text-sm font-semibold text-text-1` / `border border-border px-3 py-2 text-sm text-text-1`
- Markdown blockquote: `border-l-2 border-border pl-4 text-text-2 mb-5`
- Markdown a: `text-accent hover:text-accent-hover underline`
- Markdown ol: `pl-5 mb-5 flex flex-col gap-1.5 list-decimal`
- Markdown hr: `border-border-subtle border-t my-6`
- Markdown del: `line-through text-text-2`
- List entry focus ring: `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`
- Error message: `text-text-2 text-sm`
- Error Refresh button: `mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`

### Accessibility (UX-DR16)

- `role="list"` on the list container with `aria-label="Artifact list"` (preserved from Story 2.4)
- `role="listitem"` on each `<Link>`/`<a>` entry (preserved from Story 2.4, now on the `<a>` element)
- `aria-current="true"` on the selected entry (matches mockup `key-artifact-browser.html:412`)
- `aria-label="{TYPE_LABELS[type]}: {title} — {STATUS_LABELS[status]}"` on each entry (preserved from Story 2.4)
- `role="main"` with `aria-label="Artifact content"` on the content pane (matches mockup `key-artifact-browser.html:444`)
- `<h1>Artifact Browser</h1>` for route-change focus management (preserved from Story 2.4)
- Status badge uses text label ("Completed" / "In progress") in addition to color — non-color state signaling (UX-DR16)
- List entry links have visible focus ring — `<Link>` renders an `<a>` tag, which receives the browser default focus ring. Add `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` to the entry className for consistent focus styling with the rest of the app
- Error Refresh button has `focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` — visible 2px accent focus ring with 2px offset, never suppressed on click (matches `error.tsx` pattern)
- `error.tsx` renders `<h1>Artifact Browser</h1>` — preserves route-focus management when the error boundary replaces the page content (preserved from Story 2.4)

### Out of Scope (Do Not Implement)

- **Project Map → Artifact Browser navigation**: Story 2.6's scope. Clicking an `ArtifactCard` on the Project Map opens the Artifact Browser with that artifact pre-selected. Story 2.5 only implements click-within-list behavior
- **`ArtifactAccessLink` component**: Mentioned in `architecture.md:509` for FR-17. This is Story 2.6's scope (the link from Project Map to Artifact Browser). Story 2.5 does not create it
- **Frontmatter badge**: Shown in the mockup (`key-artifact-browser.html:447-456`) but not in the ACs or UX spec state descriptions. Deferred (DP-5)
- **Content-pane skeleton loader**: The UX spec's "Artifact loading" state (EXPERIENCE.md:291) mentions a skeleton loader in the content pane. The content is read from Postgres (not GitHub) — the query is fast enough to not need a separate skeleton. The `loading.tsx` file covers the initial page load. Deferred (DP-5)
- **Pagination**: `take: 100` silently truncates at 100 artifacts. Pre-existing pattern from Story 2.2 (DP-5)
- **Refresh button on the page**: The Project Map has a `RefreshButton` (Story 2.3). The Artifact Browser does not have a page-level refresh button (DP-5 — beyond ACs). The user can reload the page to refresh
- **Real-time updates**: No WebSocket, SSE, or polling. Manual browser reload is the refresh mechanism (architecture.md:276)
- **`apps/agent-be` changes**: No backend changes. The Artifact Browser is a pure `apps/web` Server Component page reading from Postgres
- **Markdown syntax highlighting for code blocks**: The mockup and ACs do not mention syntax highlighting. Code blocks render with monospace font and `surface-raised` background. Syntax highlighting (e.g., `react-syntax-highlighter`) is post-MVP (DP-5)
- **Per-code-block copy button**: The UX spec mentions per-code-block copy buttons for agent messages (EXPERIENCE.md:341), not for the Artifact Browser. Deferred (DP-5)
- **Table of contents / heading anchors**: Not in the ACs or UX spec. Deferred (DP-5)

### Deferred Findings (from Validation)

- **Mockup `:first-of-type` rule for h2**: The mockup (`key-artifact-browser.html:329`) has `.md-h2:first-of-type { margin-top: 0; }` — the first h2 doesn't get the top margin/border. The `react-markdown` `components` prop approach can't easily replicate `:first-of-type` without tracking element order. The first h2 will render with `mt-7 pt-5 border-t` unconditionally — a minor visual discrepancy (an extra top border on the first h2). Deferred (DP-5 — minor aesthetic detail, not in the ACs)
- **`role="listitem"` on `<a>` tag**: Task 3.1 keeps `role="listitem"` on the `<Link>` (which renders `<a>`). Per the ARIA spec, setting `role="listitem"` on an `<a>` overrides its implicit `link` role — a strict screen reader would announce "list item" not "link." In practice, most screen readers still announce `<a>` tags as links regardless of the role override (they check the tag name). The `aria-label` provides the accessible name. The existing test asserts `role="listitem"` (Story 2.4), so removing it would require test changes. Deferred — practical impact is minimal, and the mockup uses `role="listitem"` on the entry element
- **Stale test header in `ArtifactListEntry.test.tsx`**: The existing test file header says "RED PHASE: all tests will fail because ArtifactListEntry.tsx does not exist yet" — stale since Story 2.4 delivered the component. Task 3.3 should update the header to cite Story 2.5 and the new props (`href`, `selected`). (DP-4 — test-only change)
- **Architecture amendment for DP-2**: The DP-2 decision (query parameter vs dynamic route) records the contradiction between `architecture.md:489-491` (`artifacts/[artifactId]/page.tsx`) and the UX spec/PRD/mockup (single route + `?id=`). The story records the decision, but the actual `architecture.md` edit is deferred to a separate `docs(architecture)` commit. The contradiction remains on record in `architecture.md` until that edit lands.

### Testing Patterns

Follow the established patterns from the codebase:

- **Test file header comments:** every test file starts with a header comment block citing the story, acceptance criteria, and red-phase status (project-context.md:211 — see `project-map/page.test.tsx:1-21` for the canonical pattern). Both `ArtifactViewer.test.tsx`, `ArtifactLoadError.test.tsx`, and the updated `ArtifactListEntry.test.tsx` and `page.test.tsx` must include this header
- **Server Component page tests** (`page.test.tsx`): use `@jest-environment node` (see `project-map/page.test.tsx`). Call the async component function directly with `searchParams` as a resolved Promise — `await ArtifactsPage({ searchParams: Promise.resolve({ id: 'art_1' }) })` (follows the pattern from `sign-in/page.test.tsx:26`). Then `renderToStaticMarkup(element)` from `react-dom/server`, and assert on the HTML string. Mock child components as render stubs returning identifiable strings. Mock `ArtifactViewer` and `ArtifactLoadError` as render stubs (not `react-markdown` directly — the page test mocks child components, not their internals)
- **Component tests** (`ArtifactViewer.test.tsx`, `ArtifactLoadError.test.tsx`, `ArtifactListEntry.test.tsx`): use `jsdom` environment (default). Use `@testing-library/react` with `render()`, `screen.getByText()`, `screen.getByRole()`. `ArtifactViewer` is synchronous (no async), so no `await` needed. `ArtifactLoadError` is a Client Component — mock `next/navigation` (`useRouter`). `ArtifactListEntry` is synchronous
- **Mock patterns**: `jest.mock('next/navigation', () => ({ redirect: (...args) => mockRedirect(...args), useRouter: () => ({ refresh: mockRefresh }) }))`. Use `jest.fn()` with explicit `.mockResolvedValue()` / `.mockRejectedValue()` / `.mockImplementation()`. `beforeEach`: `jest.clearAllMocks()`, `afterEach`: `jest.restoreAllMocks()`
- **Prisma mocking**: `jest.mock('@/lib/prisma', () => ({ getPrisma: () => ({ repoConnection: { findUnique: mockFindUnique }, artifact: { findMany: mockFindMany, findFirst: mockArtifactFindFirst } }) }))` — note the new `artifact.findFirst` mock for the selected-artifact query (not `findUnique` — the `Artifact` model has no compound unique on `(id, repoConnectionId)`, so `findFirst` is used for tenant-scoped lookup)
- **react-markdown mocking**: in `ArtifactViewer.test.tsx`, mock `react-markdown` as a render stub: `jest.mock('react-markdown', () => ({ __esModule: true, default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div> }))`. The `__esModule: true, default: ...` shape matches `react-markdown` v10's default export. This isolates the test from the markdown library's internals and tests only the frontmatter-stripping and container structure
- **Tag tests** `[P0]` or `[P1]` in `it()` descriptions. P0 for AC coverage, P1 for edge cases
- **Co-locate** tests with source: `*.test.tsx` next to the file under test

### Previous Story Intelligence

- **Story 2.4 (done)**: Delivered `ArtifactListEntry` (display-only Server Component), the Artifact Browser page (Postgres-backed list), `loading.tsx`, `error.tsx`. The page follows the Project Map's data-fetching pattern: `auth()` → `repoConnection.findUnique` → `Promise.all([artifact.findMany, getCredentialHealthStatus])` → sync-on-empty → render. Story 2.5 extends this pattern: adds `searchParams` handling, a `findFirst` for the selected artifact's content, and the two-column layout. Lint baseline: 0 errors, 9 warnings. Test baseline: 433 tests. The `ArtifactListEntry` component is updated (not replaced) — `href` and `selected` props are added, the root element changes from `<div>` to `<Link>`. The existing `TYPE_LABELS`, `STATUS_LABELS`, `STATUS_BADGE_CLASSES`, and `formatDate` helper remain unchanged. Deferred findings from Story 2.4: `formatDate` timezone (fixed), redirect paths untested (deferred), empty-string title (deferred), unbounded title length (deferred), `syncArtifactsAction` no timeout (deferred)
- **Story 2.3 (done)**: Delivered `RefreshButton` — a `'use client'` component using `useTransition` to call `syncArtifactsAction()` then `router.refresh()`. The `useTransition` + Server Action pattern is established. Story 2.5's `ArtifactLoadError` uses a simpler pattern: `router.refresh()` without `useTransition` (no Server Action call, just a re-render). The `try/finally` pattern is not needed (no side effect to guarantee)
- **Story 2.2 (done)**: Delivered the Project Map page (`page.tsx`), `ArtifactCard`, `CredentialErrorBanner`, `loading.tsx`. The data-fetching pattern is the canonical pattern for any page that reads artifacts. Story 2.5 follows it. Review findings from Story 2.3: type-assertion fallbacks on DB rows, `Promise.all` has no error boundary, `take: 100` silently truncates, credential health mis-detection — all deferred, all pre-existing from Story 2.2
- **Story 2.1 (done)**: Delivered `syncArtifacts()` lib function, `syncArtifactsAction()` Server Action, `Artifact` Prisma model. The `content` field stores the full Markdown content including YAML frontmatter. Story 2.5 reads this field via `findFirst`. The `syncArtifacts` lib has frontmatter-parsing logic (`parseFrontmatterTitle`, `parseHeadingTitle`) — Story 2.5 reuses the frontmatter-stripping regex pattern (not the functions themselves)
- **Story 1.8 (done)**: Delivered the `AppShell`, `SideNavigation`, `Breadcrumb`, and the `(dashboard)/(app)/` route structure. The artifacts page placeholder was created here. Story 2.4 replaced it. Story 2.5 extends it. The `AppShell`'s focus management moves focus to `h1` on route change — the page already renders `<h1>`
- **Established conventions**: kebab-case non-component files, PascalCase component files, co-located tests, Conventional Commits. `lucide-react` is the icon library. shadcn/ui `new-york` style with `rsc: true`. `null as never` after `redirect()`. `as ArtifactType` / `as ArtifactStatus` type assertions on DB rows (pre-existing pattern, deferred finding). `cn()` from `@/lib/utils` for conditional class merging

### Git Intelligence

- Recent commits: `d10a327 chore(opencode): add neuralwatt provider config`, `55548a9 feat(pipeline): track human-escalation halts`, `a090cfc feat(pipeline): add decision policy`. Epic 1 is complete. Epic 2 is in-progress (Stories 2.1–2.4 are done). Story 2.5 is the next story
- The artifacts page (`artifacts/page.tsx`) was last modified in Story 2.4. The `ArtifactListEntry` component was created in Story 2.4. Both are updated in Story 2.5

### Project Structure Notes

**New files:**
- `apps/web/src/components/artifact-browser/ArtifactViewer.tsx` — Server Component, renders Markdown content
- `apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx` — unit tests
- `apps/web/src/components/artifact-browser/ArtifactLoadError.tsx` — Client Component, error state with Refresh button
- `apps/web/src/components/artifact-browser/ArtifactLoadError.test.tsx` — unit tests

**Updated files:**
- `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` — add `href` and `selected` props, change root element to `<Link>`, add selected/hover styling
- `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` — update tests for new props and `<Link>` root element
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` — add `searchParams` handling, selected-artifact query, two-column layout, `ArtifactViewer` and `ArtifactLoadError` rendering
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` — update tests for `searchParams`, two-column layout, new component mocks
- `package.json` — add `react-markdown` and `remark-gfm` dependencies

**No changes to:**
- `apps/agent-be/` (no backend changes)
- `libs/` (no schema or shared-type changes)
- `apps/web/src/actions/artifacts.actions.ts` (Story 2.1)
- `apps/web/src/lib/artifacts.ts` (Story 2.1)
- `apps/web/src/components/project-map/ArtifactCard.tsx` (Story 2.2 — Story 2.6's scope to add click)
- `apps/web/src/components/project-map/CredentialErrorBanner.tsx` (Story 2.2)
- `apps/web/src/components/shell/Breadcrumb.tsx` (Story 1.8)
- `apps/web/src/components/shell/AppShell.tsx` (Story 1.8)
- `apps/web/src/components/shell/SideNavigation.tsx` (Story 1.8)
- `apps/web/src/app/(dashboard)/(app)/artifacts/loading.tsx` (Story 2.4 — unchanged)
- `apps/web/src/app/(dashboard)/(app)/artifacts/error.tsx` (Story 2.4 — unchanged)
- `apps/web/src/app/(dashboard)/(app)/project-map/` (no changes to Project Map)
- `tailwind.config.ts`, `next.config.js`, CI config

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 2.5 (lines 540-561), Epic 2 description (lines 447-449, 223-224), FR16 (line 50), FR17 (line 52), NFR-P4 (line 56), UX-DR12 (line 157)
- PRD: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` — FR-16 (Artifact Rendering, line 336), FR-17 (Artifact Access Points, line 348)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Frontend Architecture #5 refresh/staleness model (line 276), API & Communication #5 data boundary (line 268), component boundaries (line 629 — `artifact-browser/*`: rendered from Server Component Prisma reads), directory structure (lines 507-509 — `components/artifact-browser/` with `ArtifactViewer.tsx` and `ArtifactAccessLink.tsx`), requirements-to-structure mapping (line 648 — Artifact Browser FR-16/17). **Note:** the directory structure shows `artifacts/[artifactId]/page.tsx` (dynamic route) — this is amended to `artifacts/page.tsx` with `searchParams.id` per DP-2 (see Decision Records)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` — color tokens (lines 7-34), Layout & Spacing table (lines 255-261 — Artifact Browser list pane 280px, content pane remaining width), typography scale (lines 40-47, 247 — headings map down one step), Markdown rendering in agent responses (line 330 — same pattern for artifact content)
- EXPERIENCE.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` — Artifact Browser Layout States (lines 77-84), Artifact List pattern (lines 177-185 — clicking an entry applies two-column layout, selected entry gets `surface-raised` background and left accent border), Artifact Browser States table (lines 283-293 — list+detail, artifact loading, artifact load error, credential failed), three-zone scroll model (line 356 — artifact list pane and page header are fixed, content scrolls independently), breadcrumb navigation (line 364), Flow 3 — Sarah Reads a Teammate's Artifact (lines 444-453)
- Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/mockups/key-artifact-browser.html` — full Artifact Browser mockup (two-column layout: 280px list pane with selected entry, content pane with rendered Markdown). Address bar shows `?id=prd-bmad-easy` (query parameter approach). Selected entry has `surface-raised` background and left accent border. Content pane has `max-width: 720px` Markdown content
- Decision log: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/.decision-log.md` — Artifact Browser ordering (line 78), scroll behavior (line 79)
- Project context: `_bmad-output/project-context.md` — Server Component patterns (lines 86-105), `loading.tsx` / `error.tsx` convention (line 105), `null as never` after `redirect()` (line 99), no automatic client-side revalidation (line 93), `as ArtifactType` type assertions (pre-existing pattern), testing rules (lines 144-177), component organization by feature (line 201), `@bmad-easy/shared-types` barrel export (line 72), `cn()` helper (line 134), version discipline for pre-1.0 packages (lines 41-51)
- Previous story: `_bmad-output/implementation-artifacts/2-4-browse-and-read-all-committed-artifacts.md` — `ArtifactListEntry` component structure, page data-fetching pattern, `error.tsx` pattern, lint/test baseline
- Decision policy: `_bmad-output/decision-policy.md` — DP-2 (spec contradiction → follow semantic intent, amend spec), DP-3 (simplest reversible option), DP-5 (defer scope temptation)
- Implementation: `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` (page to extend), `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` (component to update), `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` (canonical data-fetching pattern), `apps/web/src/app/(dashboard)/(app)/artifacts/error.tsx` (canonical error boundary pattern), `apps/web/src/lib/artifacts.ts` (frontmatter-stripping regex pattern at lines 104-118, 121), `apps/web/src/lib/utils.ts` (`cn()` helper), `apps/web/tailwind.config.ts` (design tokens), `libs/database-schemas/src/prisma/schema.prisma` (Artifact model with `content` field), `libs/shared-types/src/artifact.types.ts` (ArtifactType, ArtifactStatus types)
- npm: `react-markdown` 10.1.0 (https://www.npmjs.com/package/react-markdown — ESM only, safe by default, works in Server Components), `remark-gfm` 4.0.1 (https://www.npmjs.com/package/remark-gfm — GFM support: tables, strikethrough, task lists, autolink literals)

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- Task 1: `toHaveTextContent` normalizes whitespace — P1 test for "no frontmatter" used `.textContent` directly instead (DP-4)
- Task 6: `toHaveBeenCalledBefore` not available in Jest 30 — used `mock.invocationCallOrder` comparison instead (DP-4)
- Task 7: ESLint `no-empty-function` error on `remark-gfm` mock `() => {}` — changed to `() => null` (DP-4)
- Task 7: 18 new `_node` unused-var warnings in `ArtifactViewer.tsx` — configured `argsIgnorePattern: '^_'` in root ESLint config (DP-3, aligns with project-context.md:63 convention)

### Completion Notes List

- **Task 0:** Installed `react-markdown` 10.1.0 and `remark-gfm` 4.0.1. Lint (0 errors, 9 warnings) and typecheck clean.
- **Task 1:** Created `ArtifactViewer.tsx` (Server Component) — strips YAML frontmatter via inline regex, renders Markdown with `react-markdown` + `remark-gfm`, styles via `components` prop overrides using design tokens. 6 tests (4 P0, 2 P1).
- **Task 2:** Created `ArtifactLoadError.tsx` (Client Component) — renders error message + Refresh button calling `router.refresh()`. 4 tests (all P0).
- **Task 3:** Updated `ArtifactListEntry.tsx` — added `href` and `selected` props, changed root element from `<div>` to `<Link>`, added selected/hover/focus styling via `cn()`. 6 new tests (all P0), 9 existing tests updated.
- **Task 4:** Updated `artifacts/page.tsx` — added `searchParams` handling (Promise-based, Next.js 16), `findFirst` query for selected artifact (tenant-scoped), two-column layout (280px list + content pane), `ArtifactViewer`/`ArtifactLoadError` rendering. `findFirst` runs after sync-on-first-visit.
- **Task 5:** No changes needed — loading skeleton remains list-only (DP-3, DP-5 per story spec).
- **Task 6:** Updated `page.test.tsx` — added `searchParams` support, `findFirst` mock, `ArtifactViewer`/`ArtifactLoadError` mocks. 11 new tests (7 P0, 4 P1), 16 existing tests updated.
- **Task 7:** Lint: 0 errors, 7 warnings (down from 9 baseline — `_` prefix rule suppresses 2 pre-existing `_config` warnings). Typecheck: clean. Tests: 460 passed (27 new).

**Decision (DP-3):** Wrapped `ArtifactLoadError` in `<div className="flex-1">` in the two-column layout — `ArtifactLoadError` has `h-full` but not `flex-1`, so it needs a width-providing wrapper. `ArtifactViewer` has `flex-1` and is a direct flex child. Simplest solution that doesn't change component classNames.

**Decision (DP-3):** Configured `argsIgnorePattern: '^_'` in root `eslint.config.mjs` — the project convention (project-context.md:63) is to prefix intentionally-unused variables with `_`, but the ESLint config lacked this setting. This fixes 18 new `_node` warnings in `ArtifactViewer.tsx` and 2 pre-existing `_config` warnings. 1-line config change vs. 18 `void node` statements.

**Decision (DP-4):** Changed `remark-gfm` test mock from `() => {}` to `() => null` — `no-empty-function` ESLint rule flags empty function bodies. `() => null` has a return value and is not empty. Test-only change.

**Decision (DP-4):** Used `mock.invocationCallOrder` comparison instead of `toHaveBeenCalledBefore` — Jest 30 does not provide `toHaveBeenCalledBefore`. Test-only change.

**Decision (DP-4):** Used `.textContent` directly instead of `toHaveTextContent` for the "no frontmatter" P1 test — `toHaveTextContent` normalizes whitespace, which caused a false failure on multi-paragraph content. `.textContent` preserves the raw string. Test-only change.

### File List

**New files:**
- `apps/web/src/components/artifact-browser/ArtifactViewer.tsx`
- `apps/web/src/components/artifact-browser/ArtifactViewer.test.tsx`
- `apps/web/src/components/artifact-browser/ArtifactLoadError.tsx`
- `apps/web/src/components/artifact-browser/ArtifactLoadError.test.tsx`

**Modified files:**
- `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` (added `href`, `selected` props, `<Link>` root, `cn()` styling)
- `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` (updated for new props, added 6 new tests)
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` (searchParams, findFirst, two-column layout)
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` (searchParams, findFirst mock, 11 new tests)
- `package.json` (added `react-markdown`, `remark-gfm` dependencies)
- `eslint.config.mjs` (added `argsIgnorePattern: '^_'` to `@typescript-eslint/no-unused-vars`)

### Change Log

- 2026-07-03: Story 2.5 implemented — two-column Artifact Browser with rendered Markdown content, error state, and click-to-select navigation. 27 new tests, 460 total passing.

### Review Findings

- [x] [Review][Patch] `searchParams.id` as `string[]` crashes Prisma with 500 [`apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:44,85`] — Fixed: `typeof` guard rejects non-string `id` values safely; `?id=a&id=b` now renders full-width list instead of 500.
- [x] [Review][Patch] `code` element styling clobbered by react-markdown's `language-*` className [`apps/web/src/components/artifact-browser/ArtifactViewer.tsx:37-42`] — Fixed: destructured `className` from props and merged with `cn()` so fenced code blocks retain both styling and `language-*` classes.
- [x] [Review][Defer] Sync triggered on every render of empty artifacts list [`apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:71-83`] — deferred, pre-existing from Story 2.4, explicitly kept unchanged per Task 4.6.
- [x] [Review][Defer] Non-`NO_CREDENTIAL` sync errors silently swallowed [`apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:80-82`] — deferred, pre-existing from Story 2.4. `RATE_LIMITED`/`NOT_FOUND`/`UNKNOWN` fall through with no banner; ArtifactLoadError Refresh is no-op during 30s sync cooldown.
- [x] [Review][Defer] `role="listitem"` overrides implicit `link` role of `<Link>`/`<a>` [`apps/web/src/components/artifact-browser/ArtifactListEntry.tsx:63-66`] — deferred, already noted in story spec Deferred Findings.
- [x] [Review][Defer] `stripFrontmatter` regex strips non-frontmatter content starting with `---` [`apps/web/src/components/artifact-browser/ArtifactViewer.tsx:8-10`] — deferred, regex intentionally copied from existing `artifacts.ts`, edge case rare for BMAD artifacts.
- [x] [Review][Defer] Selected artifact out of top-100 list renders viewer with no selected list entry [`apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:57-64,85`] — deferred, `take: 100` is pre-existing pattern from Story 2.2 (DP-5).

### NFR Evidence Audit (2026-07-03)

**NFR-P4 (Performance — Artifact loads within 2s):** PASS
- Select projection on list query excludes `content` (heavy field) — only metadata fetched for 100 rows.
- `take: 100` caps list query result set.
- E2E timing test asserts <2s steady-state load (`playwright/e2e/artifact-browser/artifact-viewer.spec.ts:128-148`).
- [NFR][Patch] `findFirst` select projected `id`, `type`, `title`, `status`, `lastModifiedAt` — none consumed by the page (only `content` is passed to `ArtifactViewer`). Trimmed to `select: { content: true }` to reduce unnecessary data transfer.

**NFR-S2 (Security — Credential isolation / tenant authorization):** PASS
- `findFirst` scoped by `where: { id, repoConnectionId }` — tenant isolation enforced at the query level.
- `searchParams.id` validated with `typeof` guard (prevents `string[]` injection / Prisma 500).
- Safe Markdown rendering: `react-markdown` builds a virtual DOM from a syntax tree (no `dangerouslySetInnerHTML`, no XSS surface). `remark-gfm` adds GFM elements without raw HTML pass-through.

**NFR-R1 (Reliability — Error handling and recovery):** PASS
- `findFirst` returning `null` → `ArtifactLoadError` with Refresh button (AC-2).
- Unhandled Server Component errors caught by `error.tsx` boundary.
- [NFR][Defer] Non-`NO_CREDENTIAL` sync errors silently swallowed (pre-existing from Story 2.4, deferred above).
- [NFR][Defer] No content-size guard on `content` field — a very large Markdown file could exceed the 2s budget. Inherent to the feature (full content needed for rendering); a size guard would require truncation UX not in scope. Defer to post-MVP.

**Scalability:** CONCERNS
- [NFR][Defer] `take: 100` silently truncates — no pagination or "showing N of M" indicator (pre-existing from Story 2.2, DP-5).
- [NFR][Defer] No HTTP security headers (CSP, X-Frame-Options, Referrer-Policy) configured in `next.config.js` or `middleware.ts` — project-wide concern, not story-specific. Defer to a cross-cutting security-headers task.

**NFR Gate Decision:** PASS — all story-scoped NFRs (NFR-P4, NFR-S2, NFR-R1) have evidence. Deferred items are pre-existing or cross-cutting, not blockers for this story.
