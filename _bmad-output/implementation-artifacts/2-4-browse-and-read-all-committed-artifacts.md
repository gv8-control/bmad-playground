---
baseline_commit: 55548a9b81cc95465dc57c70469de6fa125b458c
---

# Story 2.4: Browse and Read All Committed Artifacts

Status: done

## Story

As a user who wants an overview of everything the team has produced,
I want to browse a flat list of all committed Artifacts,
so that I can find and read any of them as clean Markdown.

## Acceptance Criteria

### AC-1: Full-width flat list sorted by last-modified descending (FR16, UX-DR12)

**Given** an authenticated user navigates to the Artifact Browser directly (e.g. from the side nav)
**When** no Artifact is selected
**Then** a full-width flat list of all Artifacts from `_bmad-output/` is shown, sorted by last-modified date descending (FR16, UX-DR12)

### AC-2: Skeleton loader while loading

**Given** the Artifact Browser is loading
**When** data is being fetched
**Then** a skeleton loader is shown in the content pane

### AC-3: Credential Error Banner when credential failed

**Given** a credential health status of `failed`
**When** the Artifact Browser renders
**Then** the same Credential Error Banner as the Project Map appears above the list, and artifact reads may fail until credentials are refreshed

## Tasks / Subtasks

- [x] Task 1: Create the `ArtifactListEntry` component (AC: 1)
  - [x] 1.1 Create `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` — a Server Component (no `'use client'`). Props: `{ type: ArtifactType; title: string; status: ArtifactStatus; lastModifiedAt: Date }`. Imports: `ArtifactType`, `ArtifactStatus` from `@bmad-easy/shared-types`. This component is display-only — no click handler, no hover state. Click behavior and the two-column layout are Story 2.5's scope (DP-5)
  - [x] 1.2 Define `TYPE_LABELS`, `STATUS_LABELS`, and `STATUS_BADGE_CLASSES` maps — duplicate from `ArtifactCard.tsx` (`apps/web/src/components/project-map/ArtifactCard.tsx:3-28`). Do NOT extract to a shared file — extraction would touch `ArtifactCard` (existing code), which is beyond Story 2.4's scope (DP-3). The maps are identical to `ArtifactCard`'s maps; if a third consumer appears, extract then
  - [x] 1.3 Add a `formatDate` helper: `new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)` — produces "Jun 14" per the mockup (`key-artifact-browser.html:416`). Inline in the component file; do not create a separate utility file (DP-3 — fewest moving parts)
  - [x] 1.4 Render the entry structure per the mockup (`key-artifact-browser.html:409-419`): a `<div role="listitem">` with `aria-label="{TYPE_LABELS[type]}: {title} — {STATUS_LABELS[status]}"` (matches the mockup's `aria-label="PRD: bmad-easy product requirements — Completed"`). Inside: type label (`<span className="text-xs text-text-2 uppercase tracking-wide font-medium">`), title (`<span className="text-sm font-semibold text-text-1">`), meta row (`<div className="flex items-center justify-between mt-1">`) containing the date (`<span className="text-xs text-text-3">`) and the status badge (`<span className={STATUS_BADGE_CLASSES[status]}>`). Container className: `py-2.5 px-4 flex flex-col gap-0.5` (matches mockup's `.list-entry` padding `10px 16px` and `gap: 2px`). Do NOT add `cursor-pointer` or hover styles — the entry is not interactive in Story 2.4 (DP-5)
  - [x] 1.5 Export the component as a named export: `export function ArtifactListEntry({ type, title, status, lastModifiedAt }: ArtifactListEntryProps)`
  - [x] 1.6 Create `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` — co-located test using `@testing-library/react` with `jsdom` environment and `render()` directly. `ArtifactListEntry` is a synchronous presentational Server Component (no async logic), so `render()` works — the `renderToStaticMarkup` + `@jest-environment node` pattern is only needed for async page components. Test: [P0] renders type label text; [P0] renders title; [P0] renders status badge text; [P0] renders formatted date (e.g. `new Date('2026-06-14')` → "Jun 14"); [P0] renders `role="listitem"`; [P0] renders `aria-label` in the correct format; [P1] renders "Other" label for unknown type; [P1] renders "Completed" for unknown status

- [x] Task 2: Replace the Artifact Browser page placeholder with the actual implementation (AC: 1, 3)
  - [x] 2.1 Update `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` — replace the existing 17-line placeholder (which only renders a static "Start a conversation..." message) with a Server Component that reads artifacts from Postgres and renders the list. Preserve the existing header structure (`<Breadcrumb />` + `<h1>Artifact Browser</h1>`) — it is correct from Story 1.8
  - [x] 2.2 Add imports: `auth` from `@/lib/auth`, `getPrisma` from `@/lib/prisma`, `redirect` from `next/navigation`, `getCredentialHealthStatus` from `@/actions/credential-health.actions`, `syncArtifactsAction` from `@/actions/artifacts.actions`, `ArtifactListEntry` from `@/components/artifact-browser/ArtifactListEntry`, `CredentialErrorBanner` from `@/components/project-map/CredentialErrorBanner`, `ArtifactType` and `ArtifactStatus` types from `@bmad-easy/shared-types`
  - [x] 2.3 Implement the data-fetching logic — follow the Project Map's pattern exactly (`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:11-63`): `auth()` session check → `repoConnection.findUnique` → `Promise.all([artifact.findMany, getCredentialHealthStatus])` → sync-on-first-visit-when-empty → render. The Prisma query: `getPrisma().artifact.findMany({ where: { repoConnectionId: repoConnection.id }, orderBy: { lastModifiedAt: 'desc' }, take: 100, select: { id: true, type: true, title: true, status: true, lastModifiedAt: true, path: true } })`. The `take: 100` matches the Project Map — pagination is beyond the ACs (DP-5). The sync-on-first-visit pattern: `if (artifacts.length === 0 && !credentialFailed) { const syncResult = await syncArtifactsAction(); if ('success' in syncResult) { renderArtifacts = await getPrisma().artifact.findMany({...same query...}); } else if (syncResult.errorCode === 'NO_CREDENTIAL') { credentialFailed = true; } }` — same as the Project Map (DP-3 — consistent with the established pattern, ensures data is available regardless of which page the user visits first)
  - [x] 2.4 Implement the `credentialFailed` logic — same as the Project Map: `let credentialFailed = credentialResult.success && credentialResult.status === 'failed'`. This treats `success: false` (health check error) as "healthy" — a pre-existing pattern from Story 2.2, flagged as a deferred finding in Story 2.3's review. Do NOT fix this in Story 2.4 (DP-5 — defer, don't expand)
  - [x] 2.5 Render the page structure: `<div className="flex h-full flex-col overflow-hidden">` → `<header className="flex-shrink-0">` containing `<Breadcrumb />` and `<h1 className="px-8 text-xl font-semibold text-text-1">Artifact Browser</h1>` → `{credentialFailed && <CredentialErrorBanner />}` → `<div className="flex-1 overflow-y-auto px-8 pb-8">` containing either the empty state (`<p className="text-text-2 text-sm">Start your first conversation to create an artifact.</p>`) or the list (`<div className="flex flex-col" role="list" aria-label="Artifact list">` mapping `renderArtifacts` to `<ArtifactListEntry key={a.id} type={a.type as ArtifactType} title={a.title} status={a.status as ArtifactStatus} lastModifiedAt={a.lastModifiedAt} />` components (the `key={a.id}` matches the Project Map's pattern — `page.tsx:83`)). The `as ArtifactType` / `as ArtifactStatus` type assertions match the Project Map's pattern — the DB returns `string`, the component expects the union type. This is a pre-existing pattern from Story 2.2, flagged as a deferred finding. Do NOT fix (DP-5)
  - [x] 2.6 Add `return null as never;` after each `redirect()` call — codebase-wide pattern (project-context.md:99, `page.tsx`, `onboarding/page.tsx`). `redirect()` throws internally but TypeScript doesn't know that, so the return type must be satisfied

- [x] Task 3: Create the loading skeleton (AC: 2)
  - [x] 3.1 Create `apps/web/src/app/(dashboard)/(app)/artifacts/loading.tsx` — a Server Component (no `'use client'`). Structure: `<div className="flex h-full flex-col overflow-hidden">` → `<header className="flex-shrink-0">` with `<Breadcrumb />` and `<h1 className="px-8 text-xl font-semibold text-text-1">Artifact Browser</h1>` → `<div className="flex-1 overflow-y-auto px-8 pb-8">` with skeleton entries. Import `Breadcrumb` from `@/components/shell/Breadcrumb` — the breadcrumb is a static element, not a runtime-state-dependent element, so it belongs in the loading state (project-context.md:105). The skeleton entries: 5 `<div>` elements with `className="py-2.5 px-4 flex flex-col gap-0.5 h-16 animate-pulse"` each containing placeholder bars (`<div className="h-3 w-20 bg-surface-raised rounded" />` for the type label, `<div className="h-4 w-48 bg-surface-raised rounded" />` for the title, `<div className="flex justify-between mt-1"><div className="h-3 w-12 bg-surface-raised rounded" /><div className="h-5 w-20 bg-surface-raised rounded-full" /></div>` for the meta row). The skeleton dimensions match the actual `ArtifactListEntry` component's layout (project-context.md:105 — "Skeletons must match real content dimensions"). Do NOT render the `CredentialErrorBanner` in the loading state — it is a runtime-state-dependent element (project-context.md:105)

- [x] Task 4: Create the error boundary (project-context.md mandate)
  - [x] 4.1 Create `apps/web/src/app/(dashboard)/(app)/artifacts/error.tsx` — a Client Component (`'use client'`), following the canonical `project-map/error.tsx` pattern (Story 2.2 review fix). The project-context rule mandates `error.tsx` for every route with server-side data fetching (project-context.md:105). Structure: `export default function ArtifactsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void })`. `useEffect` to `console.error('Artifacts error:', error)`. Render the full page shell matching `project-map/error.tsx`: `<div className="flex h-full flex-col overflow-hidden">` → `<header className="flex-shrink-0 px-8 py-6">` containing `<h1 className="text-xl font-semibold text-text-1">Artifact Browser</h1>` (the h1 is required for `AppShell` route-focus management — project-context.md:104; `project-map/error.tsx` includes its h1 for the same reason) → `<div className="flex flex-1 flex-col items-center justify-center px-8 pb-8">` containing `<p className="text-text-2 text-sm">Couldn't load artifacts. Try refreshing the page.</p>` and a `<button type="button" onClick={reset}>` with className `mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` and text "Refresh". Do NOT import `Breadcrumb` — `error.tsx` is a Client Component and cannot import Server Components directly; the h1 is a plain string, so it is safe to include. The side nav (in `AppShell`) remains visible outside the error boundary, so navigation is not blocked

- [x] Task 5: Create the page test (AC: 1, 3)
  - [x] 5.1 Create `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` — follow the Project Map's test pattern (`apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx`). Use `@jest-environment node` (Server Component test). Mock: `next/navigation` (`redirect`), `@/lib/auth` (`auth`), `@/lib/prisma` (`getPrisma` with `repoConnection.findUnique` and `artifact.findMany`), `@/actions/credential-health.actions` (`getCredentialHealthStatus`), `@/actions/artifacts.actions` (`syncArtifactsAction`). Mock child components as render stubs: `@/components/artifact-browser/ArtifactListEntry` → `({ type, title, status, lastModifiedAt }) => 'ArtifactListEntry:${type}:${title}:${status}:${lastModifiedAt}'`, `@/components/project-map/CredentialErrorBanner` → `() => 'CredentialErrorBanner'`, `@/components/shell/Breadcrumb` → `() => 'Breadcrumb'`. Use `renderToStaticMarkup` from `react-dom/server` to render the page. Test cases: [P0] queries artifacts by repoConnectionId ordered by lastModifiedAt desc; [P0] renders artifact titles when Postgres has artifacts; [P0] renders empty state when no artifacts and sync returns empty; [P0] calls getCredentialHealthStatus; [P0] renders CredentialErrorBanner when credential health is failed; [P0] does NOT trigger sync when credential is already failed; [P0] triggers syncArtifactsAction when Postgres is empty; [P0] renders h1 "Artifact Browser" for route-change focus management; [P0] renders Breadcrumb; [P1] renders refreshed artifact titles after successful sync; [P1] falls back to empty state when sync returns UNKNOWN error; [P1] does NOT trigger sync on subsequent visits (populated Postgres); [P1] renders CredentialErrorBanner when sync returns NO_CREDENTIAL

- [x] Task 6: Verify lint, typecheck, and tests pass (AC: all)
  - [x] 6.1 Run `yarn nx lint web` — 0 new errors/warnings (baseline: 0 errors, 9 warnings per Story 2.3 completion)
  - [x] 6.2 Run typecheck — `npx tsc --noEmit -p apps/web/tsconfig.json` (the `typecheck` target is not configured in `project.json` — known issue from Story 2.2)
  - [x] 6.3 Run `yarn nx test web` — all new and existing tests pass (baseline: 408 tests per Story 2.3 completion)

## Dev Notes

### Decision Records

**Decision (DP-3):** Import `CredentialErrorBanner` from `@/components/project-map/CredentialErrorBanner` rather than moving it to a shared location (e.g. `@/components/shared/` or `@/components/artifact-browser/`). The UX spec (EXPERIENCE.md:200) says the banner appears on Project Map, Artifact Browser, and Conversation — it is the same component. Moving it would be cleaner architecturally, but it would touch the Project Map page (updating its import path), which is beyond Story 2.4's scope. The simplest approach is to import from the current location. If a third consumer (Conversation) appears in Epic 3, move it then. No production behavior change — the component is imported, not modified.

**Decision (DP-3):** Duplicate `TYPE_LABELS`, `STATUS_LABELS`, and `STATUS_BADGE_CLASSES` maps in `ArtifactListEntry.tsx` rather than extracting to a shared file (e.g. `@/lib/artifact-labels.ts`). The maps are identical to `ArtifactCard.tsx`'s maps. Extraction would require updating `ArtifactCard.tsx` to import from the new file — touching existing code beyond Story 2.4's scope. Duplication is simpler (fewest moving parts, least new surface). The `libs/shared-types` package is types-only (project-context.md:72) — values cannot go there. If a third consumer appears, extract to `@/lib/artifact-labels.ts` then.

**Decision (DP-3):** Follow the Project Map's sync-on-first-visit-when-empty pattern in the Artifact Browser page. The Artifact Browser reads from the same Postgres `Artifact` table as the Project Map. If the user navigates directly to `/artifacts` from the side nav without first visiting the Project Map, Postgres might be empty. The sync-on-first-visit pattern (`if (artifacts.length === 0 && !credentialFailed) { await syncArtifactsAction(); ... }`) ensures data is available regardless of entry point. This is the established pattern from Story 2.2, applied identically. The alternative (show empty state and require the user to visit the Project Map first) is worse UX with no code simplicity benefit.

**Decision (DP-5):** List entries are display-only in Story 2.4 — no click handler, no hover state, no `cursor-pointer`. Click behavior (selecting an artifact, narrowing the list to 280px, showing the rendered content) is Story 2.5's AC ("Given an Artifact is selected by clicking it in the Artifact Browser's list (Story 2.4)"). The hover state implies interactivity; adding it when the entry is not interactive would be misleading. Story 2.5 will add `cursor-pointer`, hover styles, and the click handler. This follows the same pattern as `ArtifactCard` (Story 2.2 delivered it display-only; Story 2.6 adds click behavior).

**Decision (DP-5):** Do not fix the pre-existing deferred findings from Story 2.3's review in the Artifact Browser page. The Project Map page has known issues: `Promise.all` has no error boundary, `take: 100` silently truncates, unsafe type assertions on DB rows (`a.type as ArtifactType`), credential health mis-detection when the health check itself errors. The Artifact Browser page follows the same patterns (DP-3 — consistent with the established pattern). Fixing these would expand scope beyond Story 2.4's ACs. They are recorded in `deferred-work.md` (or should be — see Story 2.3's review findings).

**Decision (DP-4):** Create `error.tsx` for the Artifact Browser route, following the canonical `project-map/error.tsx` pattern (committed during Story 2.2's review fixes). The project-context rule (project-context.md:105) mandates `error.tsx` for every route with server-side data fetching. The `error.tsx` is a technical safety net, not a new UX state — the UX spec's Artifact Browser States table does not define a "list load error" state, but the `error.tsx` is a Next.js convention that catches unhandled Server Component errors. The copy ("Couldn't load artifacts. Try refreshing the page.") parallels the UX spec's "Artifact load error" state (EXPERIENCE.md:292), adapted for the list context. The structure (full page shell with `<h1>Artifact Browser</h1>` in the header, `ring-offset-surface` on the button, `mt-4` button spacing) matches `project-map/error.tsx` exactly — the h1 is required for `AppShell` route-focus management (project-context.md:104), which moves focus to `h1` on every route change; without it in the error state, focus lands on the first interactive element with no programmatic label.

**Decision (DP-3):** Align `error.tsx` structure with the canonical `project-map/error.tsx` rather than a custom centered layout. Both `project-map/error.tsx` and `CredentialErrorBanner` (the two error-surface components already in the codebase) use `ring-offset-surface` for focus-ring offset and a full page shell with the h1 preserved. Matching the established pattern is simpler (fewest moving parts, no new layout to review) and keeps the error surface visually consistent with the Project Map error state. The `ring-offset-bg` token used elsewhere (Breadcrumb, RefreshButton) sits on the app background; the canonical `error.tsx` uses `ring-offset-surface` — matching the canonical file is the consistent choice regardless of the underlying page background, because the focus-ring offset color is a visual-design decision already locked in by the existing error-surface components.

**Decision (DP-2):** Validation found Task 4.1 specified `header className="flex-shrink-0 px-8 py-4"` while claiming to "match `project-map/error.tsx`". The canonical file (`project-map/error.tsx:18`) uses `py-6`. The semantic intent is to match the canonical pattern; the `py-4` was a transcription error. Amended Task 4.1 to `py-6` so the spec text and the stated intent agree.

**Decision (DP-4):** Validation found Task 2.5 omitted the React `key` prop on `<ArtifactListEntry>` in the list rendering description. The Project Map uses `key={a.id}` (`page.tsx:83`). Added `key={a.id}` to the task specification. Artifact-only change, no production behavior change — the dev agent would have inferred it from the established pattern, but explicit specification prevents ambiguity.

**Decision (DP-4):** Validation found the Testing Patterns section did not mention the test file header comment requirement (project-context.md:211). The canonical `project-map/page.test.tsx:1-21` includes a 20-line header citing the story, ACs, and red-phase status. Added a bullet to Testing Patterns requiring header comments in both `ArtifactListEntry.test.tsx` and `page.test.tsx`. Test-only change, no production behavior change.

**Decision (DP-4):** Validation found the DP-3 ring-offset explanation inaccurately claimed "the error boundary's button sits inside the page shell where `surface` is the offset baseline." The page canvas background is `bg` (`#0D0D11`), not `surface` (`#16161C`). The token choice (`ring-offset-surface`) is correct — it matches the canonical `project-map/error.tsx` — but the justification was wrong. Tightened the explanation to state that the focus-ring offset color is a visual-design decision already locked in by the existing error-surface components, not a background-matching calculation. Artifact-only change, no production behavior change.

### What Already Exists (Do Not Recreate)

- **`syncArtifactsAction()`** (`apps/web/src/actions/artifacts.actions.ts`) — the Server Action that re-reads `_bmad-output/` from GitHub and upserts into Postgres. Handles auth, token resolution, error classification (`NO_CREDENTIAL`, `NO_REPO_CONNECTION`, `RATE_LIMITED`, `NOT_FOUND`, `UNKNOWN`), and credential health marking. Story 2.4 calls this directly from the page's sync-on-first-visit logic — do not wrap or duplicate it
- **`syncArtifacts()`** (`apps/web/src/lib/artifacts.ts`) — the underlying lib function. Do NOT call this directly — call `syncArtifactsAction()` which handles auth and error classification
- **`getCredentialHealthStatus()`** (`apps/web/src/actions/credential-health.actions.ts`) — returns `{ success: true, status: 'healthy' | 'failed' } | { success: false, error: string }`. Called via `Promise.all` alongside the Prisma artifact query. The `credentialFailed` flag is derived from the result: `credentialResult.success && credentialResult.status === 'failed'`
- **`CredentialErrorBanner`** (`apps/web/src/components/project-map/CredentialErrorBanner.tsx`) — the reusable banner component. A `'use client'` component with an inline re-auth modal. Imported from `@/components/project-map/CredentialErrorBanner` — do not move or duplicate it (DP-3). The UX spec (EXPERIENCE.md:200) confirms it is the same component on Project Map, Artifact Browser, and Conversation
- **`Breadcrumb`** (`apps/web/src/components/shell/Breadcrumb.tsx`) — renders "← Project Map" link to `/project-map`. A Server Component (no `'use client'`). Already used in the existing artifacts page placeholder. Keep using it as-is
- **`ArtifactCard`** (`apps/web/src/components/project-map/ArtifactCard.tsx`) — the Project Map's card component. Do NOT reuse this for the Artifact Browser — the UX spec (EXPERIENCE.md:189) explicitly states "Artifact Cards (Project Map) and Artifact List entries (Artifact Browser) are two distinct components." The Artifact Browser's list entries have a different layout (list item with timestamp, not card) and different styling
- **`Artifact` Prisma model** (`libs/database-schemas/src/prisma/schema.prisma`) — the model with fields: `id`, `type`, `title`, `status`, `lastModifiedAt`, `content`, `path`, `repoConnectionId`. Story 2.1 delivered this. The Artifact Browser queries the same model as the Project Map
- **`ArtifactType` and `ArtifactStatus` types** (`libs/shared-types/src/artifact.types.ts`) — the union types for artifact type and status. Imported by both `ArtifactCard` and `ArtifactListEntry`
- **`(app)` layout guard** (`apps/web/src/app/(dashboard)/(app)/layout.tsx`) — redirects to `/sign-in` if unauthenticated, redirects to `/onboarding` if no repo connection. The Artifact Browser page does not need to repeat these guards — but it does need the `repoConnection.id` to query artifacts, so it performs its own `repoConnection.findUnique` lookup (same as the Project Map page)
- **`AppShell`** (`apps/web/src/components/shell/AppShell.tsx`) — the persistent app shell with side nav, focus management, and responsive drawer. The Artifact Browser renders inside it. The `AppShell`'s focus management moves focus to the `h1` on route change — the page must render an `<h1>` for this to work (project-context.md:104)
- **`SideNavigation`** (`apps/web/src/components/shell/SideNavigation.tsx`) — already has the "Artifact Browser" link to `/artifacts` with active state styling (`isArtifactsActive = pathname.startsWith('/artifacts')`). No changes needed

### How AC-1 Is Satisfied

AC-1 ("full-width flat list of all Artifacts, sorted by last-modified date descending") is satisfied by:

1. The page queries `getPrisma().artifact.findMany({ where: { repoConnectionId }, orderBy: { lastModifiedAt: 'desc' }, take: 100 })` — same query as the Project Map, ordered by last-modified descending
2. The list container is `<div className="flex flex-col" role="list" aria-label="Artifact list">` — full-width, no max-width constraint (the content area already has `px-8` padding)
3. Each artifact renders as an `<ArtifactListEntry>` — a vertical list item, not a card. The entries are stacked in document order (which is last-modified descending due to the query's `orderBy`)
4. "Flat list" means no grouping by type or status — all artifacts are in a single list, mixed completed and in-progress. This is confirmed by the UX decision log (`.decision-log.md:78`: "Last-modified descending confirmed. No section separation between completed and in-progress.")

### How AC-2 Is Satisfied

AC-2 ("skeleton loader shown in the content pane") is satisfied by `loading.tsx` — Next.js renders it automatically while the Server Component executes. The skeleton matches the actual list entry dimensions (`py-2.5 px-4 flex flex-col gap-0.5 h-16`). It does not render the `CredentialErrorBanner` (a runtime-state-dependent element — project-context.md:105).

### How AC-3 Is Satisfied

AC-3 ("same Credential Error Banner as the Project Map appears above the list") is satisfied by:

1. The page calls `getCredentialHealthStatus()` via `Promise.all` alongside the Prisma query
2. The `credentialFailed` flag is set to `true` when `credentialResult.success && credentialResult.status === 'failed'`
3. The page renders `{credentialFailed && <CredentialErrorBanner />}` between the header and the list
4. The `CredentialErrorBanner` is the same component imported from `@/components/project-map/CredentialErrorBanner` — not a duplicate
5. "Artifact reads may fail until credentials are refreshed" — the sync-on-first-visit logic is skipped when `credentialFailed` is true (`if (artifacts.length === 0 && !credentialFailed)`), so no GitHub API call is made with a failed credential. If Postgres already has artifacts, they are displayed (stale but functional). If Postgres is empty and the credential is failed, the empty state is shown

### Component Boundaries

- `ArtifactListEntry` is a **Server Component** (no `'use client'`) — it is a pure presentational component with no client-side interactivity. It receives props and renders HTML. This is the same pattern as `ArtifactCard`
- The page remains a **Server Component** — it reads from Postgres via Prisma and renders `ArtifactListEntry` components as children. Server Components can render Server Components directly
- `CredentialErrorBanner` is a **Client Component** (`'use client'`) — it manages modal state and calls a Server Action (`reauthorizeGitHub`). The page renders it as a child. Server Components can render Client Components — this is a standard Next.js App Router pattern
- `error.tsx` is a **Client Component** (`'use client'`) — Next.js error boundaries must be Client Components. It cannot import `Breadcrumb` (a Server Component) directly. The side nav remains visible outside the error boundary

### Design Token Usage

All colors and spacing from `tailwind.config.ts` (mirrors DESIGN.md). Use semantic token names, never raw hex:

- Type label: `text-xs text-text-2 uppercase tracking-wide font-medium`
- Title: `text-sm font-semibold text-text-1`
- Date: `text-xs text-text-3`
- Completed badge: `border border-border bg-transparent text-text-2 rounded-full px-2 py-0.5 text-xs`
- In-progress badge: `border border-caution bg-caution-bg text-caution rounded-full px-2 py-0.5 text-xs`
- Entry container: `py-2.5 px-4 flex flex-col gap-0.5`
- List container: `flex flex-col` with `role="list"` and `aria-label="Artifact list"`
- Page header: `flex-shrink-0` with `Breadcrumb` and `h1` (`px-8 text-xl font-semibold text-text-1`)
- Content area: `flex-1 overflow-y-auto px-8 pb-8`
- Empty state: `text-text-2 text-sm`
- Error boundary button: `mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`
- Skeleton entries: `py-2.5 px-4 flex flex-col gap-0.5 h-16 animate-pulse` with `bg-surface-raised rounded` placeholder bars

### Accessibility (UX-DR16)

- `role="list"` on the list container with `aria-label="Artifact list"` (matches mockup `key-artifact-browser.html:409`)
- `role="listitem"` on each entry with `aria-label="{TYPE_LABELS[type]}: {title} — {STATUS_LABELS[status]}"` (matches mockup `key-artifact-browser.html:412,422,432`)
- `<h1>Artifact Browser</h1>` for route-change focus management (project-context.md:104 — `AppShell` moves focus to `h1` on every route change)
- Status badge uses text label ("Completed" / "In progress") in addition to color — non-color state signaling (UX-DR16: "non-color state signaling everywhere")
- No `tabindex` on entries — they are not interactive in Story 2.4 (DP-5). Story 2.5 will add `tabindex` and keyboard handling when click behavior is implemented
- Error boundary button has `focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` — visible 2px accent focus ring with 2px offset, never suppressed on click
- Error boundary renders `<h1>Artifact Browser</h1>` — preserves route-focus management when the error boundary replaces the page content (project-context.md:104); `project-map/error.tsx` does the same
- `Breadcrumb` link has existing focus ring styling (`focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg`)

### Out of Scope (Do Not Implement)

- **Click-to-select behavior**: Story 2.5's scope. Clicking an entry narrows the list to 280px and shows the rendered Markdown content in the remaining area (UX-DR12, FR16). Story 2.4 delivers display-only entries
- **Two-column layout (list + detail)**: Story 2.5's scope. Story 2.4 renders the full-width list-only state
- **Markdown rendering**: Story 2.5's scope. No markdown rendering library is needed for Story 2.4 — the list entries show metadata (type, title, status, date), not artifact content
- **Navigation from Project Map**: Story 2.6's scope. Clicking an Artifact Card on the Project Map opens the Artifact Browser with that artifact pre-selected
- **Pagination**: `take: 100` silently truncates at 100 artifacts. Pagination is beyond the ACs. Pre-existing pattern from Story 2.2 (DP-5)
- **Refresh button**: The Project Map has a `RefreshButton` (Story 2.3). The Artifact Browser's ACs do not mention a refresh button. Adding one is beyond the ACs (DP-5). The user can reload the page to refresh
- **Real-time updates**: No WebSocket, SSE, or polling. Manual browser reload is the refresh mechanism (architecture.md:276 — "no automatic client-side revalidation anywhere")
- **`apps/agent-be` changes**: No backend changes. The Artifact Browser is a pure `apps/web` Server Component page reading from Postgres
- **Moving `CredentialErrorBanner` to a shared location**: Import from `@/components/project-map/CredentialErrorBanner` (DP-3). Moving is a refactor beyond Story 2.4's scope
- **Extracting `TYPE_LABELS` / `STATUS_LABELS` to a shared file**: Duplicate in `ArtifactListEntry` (DP-3). Extraction touches `ArtifactCard` (existing code)

### Testing Patterns

Follow the established patterns from the codebase:

- **Test file header comments:** every test file starts with a header comment block citing the story, acceptance criteria, and red-phase status (project-context.md:211 — see `project-map/page.test.tsx:1-21` for the canonical pattern). Both `ArtifactListEntry.test.tsx` and `page.test.tsx` must include this header
- **Server Component page tests** (`page.test.tsx`): use `@jest-environment node` (see `project-map/page.test.tsx`). Call the async component function directly (`const element = await ArtifactsPage()`), then `renderToStaticMarkup(element)` from `react-dom/server`, and assert on the HTML string. Mock child components as render stubs returning identifiable strings (e.g. `ArtifactListEntry:${type}:${title}:${status}:${lastModifiedAt}`) to isolate the page test from child logic. Use `@jest-environment node` (see `project-map/page.test.tsx:1-2` for the canonical pattern)
- **Component tests** (`ArtifactListEntry.test.tsx`): use `jsdom` environment (default). Use `@testing-library/react` with `render()`, `screen.getByText()`, `screen.getByRole()`. The component is synchronous (no async), so no `await` needed. Mock Server Actions and `next/navigation` are not needed — the component has no dependencies
- **Mock patterns**: `jest.mock('@/lib/auth', () => ({ auth: (...args) => mockAuth(...args) }))`. Use `jest.fn()` with explicit `.mockResolvedValue()` / `.mockRejectedValue()` / `.mockImplementation()`. `beforeEach`: `jest.clearAllMocks()`, `afterEach`: `jest.restoreAllMocks()`
- **Prisma mocking**: `jest.mock('@/lib/prisma', () => ({ getPrisma: () => ({ repoConnection: { findUnique: mockFindUnique }, artifact: { findMany: mockFindMany } }) }))`
- **Tag tests** `[P0]` or `[P1]` in `it()` descriptions. P0 for AC coverage, P1 for edge cases
- **Co-locate** tests with source: `*.test.tsx` next to the file under test

### Previous Story Intelligence

- **Story 2.3 (done)**: Delivered `RefreshButton` — a `'use client'` component using `useTransition` to call `syncArtifactsAction()` then `router.refresh()`. The `try/finally` pattern ensures `router.refresh()` runs even if the sync throws. Story 2.4 does NOT add a RefreshButton to the Artifact Browser (DP-5 — beyond ACs). But the `syncArtifactsAction()` call pattern and the `useTransition` + Server Action pattern are established. Lint baseline: 0 errors, 9 warnings. Test baseline: 408 tests
- **Story 2.2 (done)**: Delivered the Project Map page (`page.tsx`), `ArtifactCard`, `CredentialErrorBanner`, `loading.tsx`. The page reads from Postgres, syncs on first visit when empty, shows credential banner when failed. The data-fetching pattern (`auth()` → `repoConnection.findUnique` → `Promise.all([artifact.findMany, getCredentialHealthStatus])` → sync-on-empty → render) is the canonical pattern for any page that reads artifacts. Story 2.4 follows it exactly. Review findings from Story 2.3: type-assertion fallbacks on DB rows, `Promise.all` has no error boundary, `take: 100` silently truncates, credential health mis-detection — all deferred, all pre-existing from Story 2.2
- **Story 2.1 (done)**: Delivered `syncArtifacts()` lib function, `syncArtifactsAction()` Server Action, `Artifact` Prisma model, `SyncArtifactsResult` / `SyncErrorCode` types. The `update` payload omits `status` (preserves `in-progress` set by Epic 3). Transaction-wrapped upsert+delete. `scannedPaths` built from the source listing before the transaction's `deleteMany`. Story 2.4 calls `syncArtifactsAction()` — do not call `syncArtifacts()` directly
- **Story 1.8 (done)**: Delivered the `AppShell`, `SideNavigation`, `Breadcrumb`, and the `(dashboard)/(app)/` route structure. The artifacts page placeholder (`artifacts/page.tsx`) was created here with just a Breadcrumb, h1, and static "Start a conversation..." message. Story 2.4 replaces this placeholder with the actual implementation. The `AppShell`'s focus management moves focus to `h1` on route change — the page must render an `<h1>`
- **Established conventions**: kebab-case non-component files, PascalCase component files, co-located tests, Conventional Commits. `lucide-react` is the icon library. shadcn/ui `new-york` style with `rsc: true`. `null as never` after `redirect()`. `as ArtifactType` / `as ArtifactStatus` type assertions on DB rows (pre-existing pattern, deferred finding)

### Git Intelligence

- Recent commits: `55548a9 feat(pipeline): track human-escalation halts...`, `a090cfc feat(pipeline): add decision policy...`, `296e674 feat(pipeline): add gen-2 self-healing epic development loop`. Epic 1 is complete. Epic 2 is in-progress (Stories 2.1, 2.2, 2.3 are done). Story 2.4 is the next story
- The artifacts page placeholder (`artifacts/page.tsx`) was committed in Story 1.8 and has not been modified since. It is a 17-line placeholder with a Breadcrumb, h1, and static message

### Project Structure Notes

**New files:**
- `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` — Server Component, display-only list entry
- `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` — unit tests
- `apps/web/src/app/(dashboard)/(app)/artifacts/loading.tsx` — loading skeleton
- `apps/web/src/app/(dashboard)/(app)/artifacts/error.tsx` — error boundary (Client Component)
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` — page tests

**Updated files:**
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` — replace 17-line placeholder with actual implementation (Server Component reading from Postgres)

**New directory:**
- `apps/web/src/components/artifact-browser/` — matches the architecture's directory structure (architecture.md:507-509: `components/artifact-browser/` with `ArtifactViewer.tsx` and `ArtifactAccessLink.tsx` — those are Story 2.5/2.6's scope; Story 2.4 adds `ArtifactListEntry.tsx` to this directory)

**No changes to:**
- `apps/agent-be/` (no backend changes)
- `libs/` (no schema or shared-type changes)
- `apps/web/src/actions/artifacts.actions.ts` (Story 2.1 — call it, don't modify it)
- `apps/web/src/lib/artifacts.ts` (Story 2.1)
- `apps/web/src/components/project-map/ArtifactCard.tsx` (Story 2.2 — distinct component, do not modify)
- `apps/web/src/components/project-map/CredentialErrorBanner.tsx` (Story 2.2 — imported, not modified)
- `apps/web/src/components/shell/Breadcrumb.tsx` (Story 1.8)
- `apps/web/src/components/shell/AppShell.tsx` (Story 1.8)
- `apps/web/src/components/shell/SideNavigation.tsx` (Story 1.8 — already has Artifact Browser link)
- `apps/web/src/app/(dashboard)/(app)/project-map/` (no changes to Project Map)
- `tailwind.config.ts`, `next.config.js`, CI config

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 2.4 (lines 520-538), Epic 2 description (lines 447-449, 222-224), FR16 (line 50), FR17 (line 52), FR coverage map (lines 192-193), UX-DR12 (line 157)
- PRD: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` — FR-16 (Artifact Rendering), FR-17 (Artifact Access Points)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Frontend Architecture #5 refresh/staleness model (line 276), API & Communication #5 data boundary (line 268), graceful degradation (line 96), component boundaries (line 629 — `artifact-browser/*`: rendered from Server Component Prisma reads), directory structure (lines 507-509 — `components/artifact-browser/`), requirements-to-structure mapping (line 648 — Artifact Browser FR-16/17)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` — color tokens (lines 7-34), Layout & Spacing table (lines 255-261 — Artifact Browser list pane 280px, content pane remaining width), Artifact Cards spec (lines 352-354 — Project Map only), status badge specs (lines 133-147), Credential Error Banner spec (lines 374-375)
- EXPERIENCE.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` — Artifact Browser Layout States (lines 77-84), Artifact List pattern (lines 177-185), Artifact Card vs. Artifact List distinction (lines 187-196), Artifact Browser States table (lines 283-293), three-zone scroll model (line 356), breadcrumb navigation (line 364), Flow 3 — Sarah Reads a Teammate's Artifact (lines 444-453)
- Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/mockups/key-artifact-browser.html` — full Artifact Browser mockup (list pane at 280px with selected entry, content pane with rendered Markdown). Story 2.4 implements the "list only" state (no selection, full-width list). The two-column "list + detail" state is Story 2.5's scope
- Decision log: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/.decision-log.md` — Artifact Browser ordering: last-modified descending, no section separation (line 78)
- Project context: `_bmad-output/project-context.md` — Server Component patterns (lines 86-105), `loading.tsx` / `error.tsx` convention (line 105), `null as never` after `redirect()` (line 99), no automatic client-side revalidation (line 93), `as ArtifactType` type assertions (pre-existing pattern), testing rules (lines 144-177), component organization by feature (line 201), `@bmad-easy/shared-types` barrel export (line 72)
- Previous story: `_bmad-output/implementation-artifacts/2-3-manually-refresh-the-project-map.md` — `useTransition` + Server Action pattern, `syncArtifactsAction()` call pattern, lint/test baseline, deferred findings from Story 2.2
- Decision policy: `_bmad-output/decision-policy.md` — DP-3 (simplest reversible option), DP-5 (defer scope temptation), DP-4 (artifact-only changes)
- Implementation: `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` (canonical data-fetching pattern to follow), `apps/web/src/components/project-map/ArtifactCard.tsx` (TYPE_LABELS / STATUS_LABELS / STATUS_BADGE_CLASSES maps to duplicate), `apps/web/src/components/project-map/CredentialErrorBanner.tsx` (banner component to import), `apps/web/src/app/(dashboard)/(app)/project-map/error.tsx` (canonical error boundary pattern to follow — full page shell with h1, `ring-offset-surface` button), `apps/web/src/actions/artifacts.actions.ts` (sync action to call), `apps/web/src/actions/credential-health.actions.ts` (credential health check), `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` (placeholder to replace), `apps/web/src/components/shell/Breadcrumb.tsx` (breadcrumb component), `apps/web/src/components/shell/AppShell.tsx` (focus management), `apps/web/tailwind.config.ts` (design tokens)

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

No debug issues encountered. All tasks implemented cleanly on first pass.

### Completion Notes List

- **Task 1 (ArtifactListEntry component):** Created `ArtifactListEntry.tsx` as a Server Component (no `'use client'`). Duplicated `TYPE_LABELS`, `STATUS_LABELS`, and `STATUS_BADGE_CLASSES` maps from `ArtifactCard.tsx` (DP-3 — no extraction to shared file). Added inline `formatDate` helper using `Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })`. Rendered the entry structure per the mockup: `<div role="listitem">` with `aria-label="{TYPE_LABELS[type]}: {title} — {STATUS_LABELS[status]}"`, type label, title, meta row (date + status badge). Container className `py-2.5 px-4 flex flex-col gap-0.5`. No click handler, no hover state, no `cursor-pointer` (DP-5 — Story 2.5's scope). All 9 component tests pass (7 P0, 2 P1).

- **Task 2 (Artifact Browser page):** Replaced the 17-line placeholder in `page.tsx` with a Server Component that reads artifacts from Postgres. Followed the Project Map's data-fetching pattern exactly: `auth()` session check → `repoConnection.findUnique` → `Promise.all([artifact.findMany, getCredentialHealthStatus])` → sync-on-first-visit-when-empty → render. Prisma query uses `orderBy: { lastModifiedAt: 'desc' }`, `take: 100`, and the same `artifactSelect` const as the Project Map. Preserved the existing header structure (`<Breadcrumb />` + `<h1>Artifact Browser</h1>`). Added `return null as never;` after each `redirect()`. List container uses `role="list"` with `aria-label="Artifact list"`. All 13 page tests pass (8 P0, 5 P1).

- **Task 3 (loading skeleton):** Created `loading.tsx` as a Server Component. Renders the page shell (Breadcrumb + h1) and 5 skeleton entries with `className="py-2.5 px-4 flex flex-col gap-0.5 h-16 animate-pulse"` matching the actual `ArtifactListEntry` dimensions. Does NOT render `CredentialErrorBanner` (runtime-state-dependent element — project-context.md:105).

- **Task 4 (error boundary):** Created `error.tsx` as a Client Component (`'use client'`), following the canonical `project-map/error.tsx` pattern. Full page shell with `<h1>Artifact Browser</h1>` (required for `AppShell` route-focus management). Button uses `ring-offset-surface` matching the canonical pattern. Does NOT import `Breadcrumb` (Client Component cannot import Server Components). Used `py-6` per the DP-2 amendment (correcting the `py-4` transcription error in the original spec).

- **Task 5 (page test):** The ATDD red-phase test scaffold (`page.test.tsx`) was pre-generated. All 13 tests pass with the implementation: 8 P0 (query ordering, artifact titles, empty state, credential health check, banner render, sync gating, sync trigger, h1, Breadcrumb) and 5 P1 (refreshed titles after sync, UNKNOWN error fallback, no sync on subsequent visits, NO_CREDENTIAL banner).

- **Task 6 (verification):** `yarn nx lint web` → 0 errors, 9 warnings (all pre-existing baseline from Story 2.3 — no new issues). `npx tsc --noEmit -p apps/web/tsconfig.json` → clean (no output). `yarn nx test web` → 34 test suites, 430 tests passed (22 new from baseline of 408: 9 ArtifactListEntry + 13 page tests). No regressions.

### File List

**New files:**
- `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` — Server Component, display-only list entry
- `apps/web/src/app/(dashboard)/(app)/artifacts/loading.tsx` — loading skeleton (Server Component)
- `apps/web/src/app/(dashboard)/(app)/artifacts/error.tsx` — error boundary (Client Component)

**Updated files:**
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` — replaced 17-line placeholder with actual implementation (Server Component reading from Postgres)

**Pre-existing test files (ATDD red-phase scaffolds, now green):**
- `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx` — 9 component tests
- `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx` — 13 page tests

**Test files added during automate validation (coverage expansion):**
- `apps/web/src/app/(dashboard)/(app)/artifacts/loading.test.tsx` — 3 skeleton tests (AC-2 coverage gap found during validation — the ATDD checklist incorrectly claimed the Project Map's `loading.tsx` was untested)

### Change Log

- 2026-07-03: Implemented Story 2.4 — Browse and Read All Committed Artifacts. Created `ArtifactListEntry` component (display-only Server Component), replaced the Artifact Browser page placeholder with a Postgres-backed implementation following the Project Map's data-fetching pattern, added `loading.tsx` skeleton and `error.tsx` error boundary. 22 new tests (9 component + 13 page), all passing. Lint: 0 errors, 9 pre-existing warnings. Typecheck: clean.
- 2026-07-03: Automate validation expanded coverage — created `loading.test.tsx` (3 tests) for AC-2 after finding the ATDD checklist incorrectly accepted the loading skeleton as untested (the Project Map's `loading.tsx` IS tested). 433 tests total (was 430, +3). Lint and typecheck clean. Validation report: `_bmad-output/test-artifacts/automate-validation-report-2-4.md`.

### ATDD Artifacts

- Checklist: `_bmad-output/test-artifacts/atdd-checklist-2-4-browse-and-read-all-committed-artifacts.md`
- Component tests: `apps/web/src/components/artifact-browser/ArtifactListEntry.test.tsx`
- Page tests: `apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx`
- Loading skeleton tests: `apps/web/src/app/(dashboard)/(app)/artifacts/loading.test.tsx` (added during automate validation)
- Validation report: `_bmad-output/test-artifacts/automate-validation-report-2-4.md`

### Review Findings

**Decision (DP-2):** `formatDate` in `ArtifactListEntry.tsx` uses `Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })` without `timeZone` — spec Task 1.3 specifies this exact formatter, but the test expects "Jun 14" for `new Date('2026-06-14')` (UTC midnight). On a non-UTC server, the date renders as "Jun 13". Spec contradiction (formatter text vs. test determinism); DP-2 says follow semantic intent. Resolved: add `timeZone: 'UTC'`, amend Task 1.3. Patch applied.

- [x] [Review][Patch] `formatDate` timezone-dependent — server timezone shifts date display [`apps/web/src/components/artifact-browser/ArtifactListEntry.tsx:136-139`] — fixed: added `timeZone: 'UTC'`

- [x] [Review][Defer] Redirect paths (no session, no repoConnection) have zero test coverage [`apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx`] — deferred, matches canonical `project-map/page.test.tsx` pattern; spec Task 5.1 does not list redirect tests (DP-5)
- [x] [Review][Defer] `mockRedirect` doesn't throw `NEXT_REDIRECT` — tests can't model real redirect behavior [`apps/web/src/app/(dashboard)/(app)/artifacts/page.test.tsx:443-446`] — deferred, matches canonical pattern; coupled to redirect-test gap above
- [x] [Review][Defer] Empty-string `title` renders empty span and malformed `aria-label` [`apps/web/src/components/artifact-browser/ArtifactListEntry.tsx:164,170`] — deferred, schema field is non-nullable but allows empty string; defensive guard is scope expansion (DP-5)
- [x] [Review][Defer] Unbounded `title` length — no truncation, wrap control, or `max-w` [`apps/web/src/components/artifact-browser/ArtifactListEntry.tsx:165`] — deferred, spec and mockup do not specify truncation (DP-5)
- [x] [Review][Defer] `syncArtifactsAction()` awaited inline in Server Component with no timeout [`apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx:57`] — deferred, pre-existing pattern from Story 2.2; loading skeleton covers initial load but sync extends TTFB

**Already deferred from Story 2.2/2.3 reviews (not re-added to deferred-work.md):**
- Sync error codes other than `NO_CREDENTIAL` silently swallowed → see deferred-work.md line 113/130
- `success: false` from `getCredentialHealthStatus` treated as healthy → see deferred-work.md line 114/131
- `take: 100` silently truncates with no pagination → see deferred-work.md line 132
- `as ArtifactType` / `as ArtifactStatus` unsafe type assertions → see deferred-work.md line 133
- Auto-sync on every visit / concurrent sync race condition → see deferred-work.md line 135
