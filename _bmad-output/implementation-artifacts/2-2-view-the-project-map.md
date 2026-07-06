---
baseline_commit: 296e67445e639f0db28a7054da73398549ed7264
---

# Story 2.2: View the Project Map

Status: done

## Story

As an authenticated user with a connected repository,
I want to see a list of Artifacts from `_bmad-output/` organized by type and status,
so that I can see what BMAD work the team has produced and what is in progress without opening GitHub.

## Acceptance Criteria

### AC-1: Artifact list with cards (FR6, UX-DR11)

**Given** an authenticated user with a connected repository
**When** they land on the Project Map (`/project-map`)
**Then** Artifacts are listed with type, title, and status (completed / in-progress), rendered as Artifact Cards per DESIGN.md (UX-DR11)

### AC-2: In-progress visual distinction (UX-DR11, UX-DR16)

**Given** an in-progress Artifact has an active Conversation open as a page on this platform
**When** it is displayed
**Then** it is visually distinguished from completed Artifacts (distinct badge style, not color alone)

### AC-3: Empty state (UX-DR19)

**Given** no `_bmad-output/` content exists
**When** the Project Map loads
**Then** an empty state shows a prompt to start the first Conversation (UX-DR19)

### AC-4: Credential error banner (UX-DR10)

**Given** a credential health status of `failed` (Story 1.6)
**When** the Project Map renders
**Then** a non-dismissible Credential Error Banner appears above the artifact list with a link to the inline re-auth flow (UX-DR10)

### AC-5: Loading skeleton and performance (NFR-P3)

**Given** the Project Map is loading
**When** data is being fetched
**Then** skeleton cards are shown, and the page loads within 2 seconds (NFR-P3)

## Tasks / Subtasks

- [x] Task 1: Add shadcn `dialog` component (AC: 4)
  - [x] 1.1 Run `yarn dlx shadcn@latest add dialog` from the `apps/web` directory to install the Radix Dialog-based modal primitive into `apps/web/src/components/ui/dialog.tsx`. This provides the focus-trapping, Escape-dismissing, return-focus behavior required by UX-DR16 for the re-auth modal in Task 3

- [x] Task 2: Create the `ArtifactCard` component (AC: 1, 2)
  - [x] 2.1 Create `apps/web/src/components/project-map/ArtifactCard.tsx` — a Server Component (no `'use client'`, no interactivity). Props: `{ type: ArtifactType; title: string; status: ArtifactStatus }`. Import `ArtifactType` and `ArtifactStatus` from `@bmad-easy/shared-types`
  - [x] 2.2 Implement the artifact type display-label mapping: `brainstorming` → "Brainstorming", `prd` → "PRD", `architecture` → "Architecture", `epics` → "Epics", `ux` → "UX", `technical-research` → "Technical Research", `market-research` → "Market Research", `domain-research` → "Domain Research", `product-brief` → "Brief", `prfaq` → "PR/FAQ", `test-arch` → "Test Architecture", `other` → "Other". Render the label in `text-xs text-text-2 uppercase tracking-wide font-medium` per DESIGN.md artifact-card spec
  - [x] 2.3 Render the title in `text-sm font-semibold text-text-1` per DESIGN.md
  - [x] 2.4 Implement the `StatusBadge` inline within `ArtifactCard` — two variants based on `status`:
    - `completed`: `border border-border bg-transparent text-text-2 rounded-full px-2 py-0.5 text-xs` — muted, less prominent (DESIGN.md `status-badge-completed`)
    - `in-progress`: `border border-caution bg-caution-bg text-caution rounded-full px-2 py-0.5 text-xs` — caution-colored (DESIGN.md `status-badge-in-progress`)
    - Both badges include a text label ("Completed" / "In progress") — never color alone (UX-DR16 non-color state signaling)
  - [x] 2.5 Card container: `bg-surface-raised border border-border rounded-lg p-3 px-4 flex items-center justify-between max-w-[720px]` per DESIGN.md `artifact-card` spec. Inner structure: two children — a left flex column (`flex flex-col gap-0.5`) containing the type label (2.2) above the title (2.3), and the StatusBadge (2.4) on the right (the `justify-between` pushes the badge to the far right). Add `role="listitem"` for screen reader semantics (the parent list container in the page has `role="list"`). Do NOT add `cursor-pointer`, `tabindex`, or click handlers — click navigation is Story 2.6's scope
  - [x] 2.6 Create `apps/web/src/components/project-map/ArtifactCard.test.tsx` — co-located test using `@testing-library/react` with `jsdom` environment. Test: [P0] renders type label, title, and completed badge; [P0] renders in-progress badge with distinct style (caution border, not just color); [P1] renders all 12 type labels correctly; [P1] completed badge is visually muted (transparent bg, text-2) vs in-progress (caution bg, caution text)

- [x] Task 3: Create the `CredentialErrorBanner` component (AC: 4)
  - [x] 3.1 Create `apps/web/src/components/project-map/CredentialErrorBanner.tsx` — a `'use client'` component. Renders the non-dismissible banner per DESIGN.md `credential-error-banner` spec: `bg-negative-bg border-b border-negative px-4 py-2.5 text-sm text-text-1` with a link styled in `text-negative` that opens the re-auth modal
  - [x] 3.2 Copy text: "Your repository connection needs attention." followed by a link "Update access token" (per EXPERIENCE.md Credential Error Banner spec)
  - [x] 3.3 Implement the re-auth modal using the shadcn `Dialog` component (installed in Task 1). The dialog opens when the link is clicked. Modal content: "Reconnect your GitHub account" heading, "Your access token may have expired or been revoked. Reconnect to continue syncing artifacts." body text, and a "Reconnect" button that calls the `reauthorizeGitHub()` Server Action (import from `@/actions/credential-health.actions`). Use `useTransition()` from React to get `[isPending, startTransition]` — wrap the `reauthorizeGitHub()` call in `startTransition` and disable the "Reconnect" button while `isPending` is true (the call redirects to GitHub OAuth, so the button stays disabled during the redirect)
  - [x] 3.4 The Dialog provides focus-trapping, Escape-to-dismiss, and return-focus-to-trigger automatically via Radix Dialog — no manual focus management needed. Add `aria-label` to the "Update access token" link trigger
  - [x] 3.5 Create `apps/web/src/components/project-map/CredentialErrorBanner.test.tsx` — co-located test using `@testing-library/react`. Mock `reauthorizeGitHub` from `@/actions/credential-health.actions`. Test: [P0] renders banner text and link; [P0] clicking link opens the dialog modal; [P0] dialog contains "Reconnect" button; [P1] clicking "Reconnect" calls `reauthorizeGitHub`; [P1] banner is non-dismissible (no close button in banner itself — only the dialog can be dismissed, and the banner persists)

- [x] Task 4: Create the `loading.tsx` skeleton state (AC: 5)
  - [x] 4.1 Create `apps/web/src/app/(dashboard)/(app)/project-map/loading.tsx` — Next.js convention: this file renders automatically while the `page.tsx` Server Component is executing. Render the page shell (`<div className="flex h-full flex-col overflow-hidden">`) with the header (`<h1 className="text-xl font-semibold text-text-1">Project Map</h1>`) and 3 skeleton cards in the content area. Each skeleton card: `bg-surface-raised border border-border rounded-lg p-3 px-4 max-w-[720px] h-14 animate-pulse` — matching the dimensions of a real `ArtifactCard`. Do NOT render the credential error banner or refresh button in the skeleton (those are runtime-state-dependent, not loading-state). No `overflow-y-auto` on the skeleton container (static, no scroll needed for 3 placeholder cards)

- [x] Task 5: Update the Project Map page (AC: 1, 2, 3, 4, 5)
  - [x] 5.1 Update `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` — keep it as an `async` Server Component. The auth guard and repo-connection guard are already provided by `(dashboard)/layout.tsx` and `(app)/layout.tsx` — do NOT re-implement them. Call `auth()` to get `session.userId`. A null-session `redirect('/sign-in')` after `auth()` is allowed as a defense-in-depth safety net for session expiry between the layout guard and page render — it is not a guard re-implementation
  - [x] 5.2 Read the repo connection: `const repoConnection = await getPrisma().repoConnection.findUnique({ where: { userId: session.userId } })`. The `(app)/layout.tsx` already verified it exists, but the page needs the `repoConnection.id` to query artifacts. If `null` (race condition — deleted between layout guard and page render), redirect to `/onboarding` (`return null as never` after `redirect()`)
  - [x] 5.3 Read artifacts from Postgres: `const artifacts = await getPrisma().artifact.findMany({ where: { repoConnectionId: repoConnection.id }, orderBy: { lastModifiedAt: 'desc' } })`. This is the fast read that satisfies NFR-P3 (direct Prisma read, no GitHub API call)
  - [x] 5.4 Read credential health: `const credentialResult = await getCredentialHealthStatus()`. Extract `const credentialFailed = credentialResult.success && credentialResult.status === 'failed'`. Import `getCredentialHealthStatus` from `@/actions/credential-health.actions`
  - [x] 5.5 Page-load sync trigger: if `artifacts.length === 0` AND `!credentialFailed`, call `await syncArtifactsAction()` (import from `@/actions/artifacts.actions`). This populates Postgres on the first visit. After the sync, re-read artifacts: `const refreshedArtifacts = await getPrisma().artifact.findMany(...)`. Use `refreshedArtifacts` for rendering if the sync returned `{ success: true }`; fall back to the original empty `artifacts` if the sync failed. Do NOT trigger the sync if `credentialFailed` is true (the credential is broken — the sync would fail and the banner already explains the problem)
  - [x] 5.6 If the sync returns `{ error, errorCode: 'NO_CREDENTIAL' }`, set `credentialFailed = true` for rendering (the Server Action already marked the credential as failed via `markCredentialFailed`). If it returns any other error code (`RATE_LIMITED`, `NOT_FOUND`, `UNKNOWN`), proceed with rendering whatever is in Postgres (which may be empty → empty state). Do NOT throw on sync failure — the page must still render
  - [x] 5.7 Render the page structure:
    ```
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0 px-8 py-6">
        <h1 className="text-xl font-semibold text-text-1">Project Map</h1>
        {/* Refresh button is Story 2.3's scope — do not add it here */}
      </header>
      {credentialFailed && <CredentialErrorBanner />}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {artifacts.length === 0
          ? <EmptyState />
          : <div className="flex flex-col gap-3" role="list">
              {artifacts.map(a => <ArtifactCard key={a.id} type={a.type as ArtifactType} title={a.title} status={a.status as ArtifactStatus} />)}
            </div>}
      </div>
    </div>
    ```
  - [x] 5.8 The empty state (AC-3): inline in the page — a centered prompt: `<p className="text-text-2 text-sm">Start your first conversation to create an artifact.</p>` (per EXPERIENCE.md empty-state voice: prompt action, not describe absence). Wrap in a flex container: `<div className="flex flex-col items-center justify-center py-16">` with the text. This matches the existing placeholder page's copy exactly — the placeholder was already correct
  - [x] 5.9 The `h1` must be present for the `AppShell` route-change focus management (it focuses `h1` on navigation). The existing placeholder already has this — preserve it
  - [x] 5.10 Create `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` — co-located test using `@jest-environment node`. Mock `@/lib/auth`, `@/lib/prisma`, `@/actions/credential-health.actions`, `@/actions/artifacts.actions`, `@/components/project-map/ArtifactCard`, `@/components/project-map/CredentialErrorBanner`. Test: [P0] renders artifact cards when Postgres has artifacts; [P0] renders empty state when no artifacts and sync returns empty; [P0] renders CredentialErrorBanner when credential health is failed; [P0] triggers syncArtifactsAction when Postgres is empty; [P0] does NOT trigger sync when credential is already failed; [P1] triggers sync on first visit (empty Postgres) but not on subsequent visits (populated Postgres); [P1] renders credential banner when sync returns NO_CREDENTIAL; [P1] renders empty state when sync returns NOT_FOUND and Postgres is empty

- [x] Task 6: Verify lint, typecheck, and tests pass (AC: all)
  - [x] 6.1 Run `yarn nx lint web` — 0 new errors/warnings (baseline: 0 errors, 11 pre-existing warnings)
  - [x] 6.2 Run `yarn nx typecheck web` — clean
  - [x] 6.3 Run `yarn nx test web` — all new and existing tests pass

## Dev Notes

### Page-Load Sync Strategy

Story 2.1's dev notes state: "Story 2.2 will decide the exact trigger mechanism." The strategy chosen here:

1. **Read from Postgres first** (fast, satisfies NFR-P3's 2s target — a Prisma `findMany` is < 100ms)
2. **If Postgres is empty**, call `syncArtifactsAction()` synchronously (first visit — the user just connected their repo and needs to see existing artifacts). The `loading.tsx` skeleton shows during this sync (AC-5). On subsequent visits, Postgres has data and the sync is skipped — the manual refresh button (Story 2.3) handles re-syncing
3. **If credential is already failed**, skip the sync (it would fail anyway) and show the Credential Error Banner

This approach satisfies FR5 ("reads current `_bmad-output/` state on page load") — the first page load syncs from GitHub, subsequent loads read from the synced Postgres. It also satisfies the "no automatic client-side revalidation" principle — there is no background polling, no client-side data fetching, no React Query/SWR. The user manually reloads to see fresh data (which re-reads Postgres; the manual refresh button in Story 2.3 re-syncs from GitHub).

**Calling `syncArtifactsAction()` from a Server Component**: In Next.js App Router, Server Actions are async functions that can be called directly from Server Components (not as HTTP requests). `syncArtifactsAction()` calls `auth()` internally, which works in Server Components. This reuses the existing action's auth, token resolution, repo URL parsing, and error handling — no duplication.

### What Already Exists (Do Not Recreate)

- **Auth guard**: `app/(dashboard)/layout.tsx` redirects to `/sign-in` if unauthenticated. The Project Map page does NOT need to re-implement this
- **Repo-connection guard**: `app/(dashboard)/(app)/layout.tsx` redirects to `/onboarding` if no `RepoConnection`. The page can assume a repo connection exists. The page still needs to query `repoConnection.findUnique()` to get the `id` for artifact queries — but it can assume the result is non-null (the layout already checked)
- **AppShell**: `app/(dashboard)/(app)/layout.tsx` wraps the page in `<AppShell>`. The side navigation, mobile drawer, and route-change focus management are already handled. The page only renders the content area
- **Side navigation active state**: `SideNavigation.tsx` already highlights "Project Map" when `pathname === '/' || pathname === '/project-map'`
- **Artifact mirroring**: `syncArtifacts()` in `apps/web/src/lib/artifacts.ts` and `syncArtifactsAction()` in `apps/web/src/actions/artifacts.actions.ts` (Story 2.1) — call the Server Action, do not call the lib function directly (the action handles auth, token resolution, and error classification)
- **Credential health**: `getCredentialHealthStatus()` and `reauthorizeGitHub()` in `apps/web/src/actions/credential-health.actions.ts` (Story 1.6) — call these directly
- **Prisma `Artifact` model**: created in Story 2.1 with fields `id`, `repoConnectionId`, `path`, `type` (String), `title`, `status` (String, default `"completed"`), `lastModifiedAt`, `content`, `createdAt`, `updatedAt`. Unique constraint on `(repoConnectionId, path)`
- **Placeholder page**: `app/(dashboard)/(app)/project-map/page.tsx` already has the correct page shell structure and empty-state copy — this story extends it with data fetching and rendering

### Component Boundaries

- `apps/web/src/components/project-map/` — **does not exist yet**. This story creates it. Components organized by feature (flat hierarchy), per project-context.md: "apps/web components organized by feature, flat hierarchy"
- `ArtifactCard` is a **Server Component** (no `'use client'`) — it's presentational only, no interactivity. Click navigation is Story 2.6's scope
- `CredentialErrorBanner` is a **Client Component** (`'use client'`) — it manages modal state and calls a Server Action. This is the only client component in this story
- The page itself is a **Server Component** — it reads from Postgres directly via Prisma and calls Server Actions for the sync and credential health check

### Design Token Usage

All colors, typography, spacing, and radii come from `tailwind.config.ts` (which mirrors DESIGN.md). Use semantic token names, never raw hex values:

- Card: `bg-surface-raised border border-border rounded-lg`
- Type label: `text-text-2 text-xs uppercase tracking-wide font-medium`
- Title: `text-text-1 text-sm font-semibold`
- Completed badge: `border border-border bg-transparent text-text-2 rounded-full px-2 py-0.5 text-xs`
- In-progress badge: `border border-caution bg-caution-bg text-caution rounded-full px-2 py-0.5 text-xs`
- Credential banner: `bg-negative-bg border-b border-negative px-4 py-2.5 text-sm text-text-1`
- Re-auth link: `text-negative underline`
- Empty state: `text-text-2 text-sm`
- Page title: `text-text-1 text-xl font-semibold`

### Accessibility (UX-DR16)

- The `h1` is present for route-change focus management (AppShell focuses it on navigation)
- Status badges use text labels ("Completed" / "In progress") — never color alone
- The Credential Error Banner link has an `aria-label`
- The Dialog (shadcn) provides focus trapping, Escape-to-dismiss, and return-focus automatically
- Focus rings: the existing global CSS + Tailwind `focus:ring-2 focus:ring-accent focus:ring-offset-2` pattern applies to interactive elements. The "Update access token" link must include the focus ring classes
- `role="list"` on the artifact card container and `role="listitem"` on each card (per mockup pattern) for screen reader semantics

### Out of Scope (Do Not Implement)

- **Refresh button**: Story 2.3 ("Manually Refresh the Project Map") delivers the refresh button and its spinner. Do not add a refresh button to the header in this story
- **Card click navigation**: Story 2.6 ("Navigate from the Project Map to an Artifact") delivers click-to-navigate. Do not add `cursor-pointer`, `tabindex`, or `onClick` to `ArtifactCard` in this story
- **Artifact Browser**: Stories 2.4-2.5 deliver the Artifact Browser. This story only renders the Project Map
- **Real-time updates**: No WebSocket, SSE, or polling. The page reads from Postgres on load; manual reload picks up fresh data
- **`apps/agent-be` changes**: No backend changes. The Project Map is a pure `apps/web` Server Component + Prisma read

### Prisma Query Pattern

```typescript
const artifacts = await getPrisma().artifact.findMany({
  where: { repoConnectionId: repoConnection.id },
  orderBy: { lastModifiedAt: 'desc' },
});
```

The `ArtifactType` and `ArtifactStatus` are stored as `String` in Prisma (not enums) to avoid migration friction. Cast to the TypeScript union types when passing to `ArtifactCard`:

```typescript
import type { ArtifactType, ArtifactStatus } from '@bmad-easy/shared-types';

artifacts.map((a) => ({
  ...a,
  type: a.type as ArtifactType,
  status: a.status as ArtifactStatus,
}))
```

### Testing Patterns

Follow the established patterns from the codebase:

- **Server Component tests** (`page.test.tsx`): use `@jest-environment node`. Mock `next/navigation` (`redirect`), `@/lib/auth` (`auth`), `@/lib/prisma` (`getPrisma`), and Server Actions (`@/actions/credential-health.actions`, `@/actions/artifacts.actions`). Mock child components as simple render stubs. Use `jest.clearAllMocks()` in `beforeEach`, `jest.restoreAllMocks()` in `afterEach`
- **Client Component tests** (`CredentialErrorBanner.test.tsx`): use `jsdom` environment (default). Use `@testing-library/react` with `render()`, `screen.getByText()`, `fireEvent.click()`. Mock Server Actions (`reauthorizeGitHub`)
- **Tag tests** `[P0]` or `[P1]` in `it()` descriptions. P0 for AC coverage, P1 for edge cases
- **Co-locate** tests with source: `*.test.tsx` next to the file under test

### Previous Story Intelligence

- **Story 2.1 (done)**: Delivered `syncArtifacts()` lib function, `syncArtifactsAction()` Server Action, `Artifact` Prisma model, `SyncArtifactsResult` / `SyncErrorCode` types. Review findings fixed: transaction-wrapped upsert+delete, `scannedPaths` initialized before fetch loop, `NOT_FOUND` error for inaccessible root, `markCredentialFailed` guarded in catch blocks. The `update` payload omits `status` (preserves `in-progress` set by Epic 3). This story calls `syncArtifactsAction()` — do not call `syncArtifacts()` directly (the action handles auth, token resolution, and error classification)
- **Story 1.6 (done)**: Delivered `getCredentialHealthStatus()` and `reauthorizeGitHub()` Server Actions, `CredentialFailureError`, `markCredentialFailed`, `getCredentialHealth`. The `reauthorizeGitHub()` action calls `signIn('github', { redirectTo })` which redirects to GitHub OAuth. On success, the `jwt` callback in `auth.ts` resets `credentialHealth` to `'healthy'` — so after re-auth, the banner disappears on the next page load
- **Story 1.8 (done)**: Delivered `AppShell`, `SideNavigation`, `Breadcrumb`. The Project Map is the depth-0 home page — no breadcrumb (only depth-1 pages show "← Project Map"). Side nav already highlights Project Map on `/` and `/project-map`
- **Established conventions**: kebab-case non-component files, PascalCase component files, co-located tests, Conventional Commits. Lint baseline: 0 errors, 11 pre-existing warnings — do not add new warnings. Only `sheet` shadcn component is pre-installed; this story adds `dialog`

### Git Intelligence

- Recent commits: `3260c58 feat: final epic1 fixes before self-healing workflows`, `ae6b4a6 docs: finalize epic1, with retro outcome`. Epic 1 is complete (all stories `done`). Epic 2 is in-progress (Story 2.1 done)
- Story 2.1's deliverables are present in the working tree but **uncommitted** (untracked: `apps/web/src/lib/artifacts.ts`, `apps/web/src/actions/artifacts.actions.ts`, their spec files, the Prisma migration; modified: `libs/database-schemas/src/prisma/schema.prisma`, `libs/shared-types/src/artifact.types.ts`, `apps/web/src/lib/repository-validation.ts`). The Prisma client has been regenerated — `getPrisma().artifact` is available. Confirm these are committed before starting this story so the baseline is stable
- The existing placeholder `project-map/page.tsx` is 14 lines — this story replaces it entirely

### Project Structure Notes

**New files:**
- `apps/web/src/components/project-map/ArtifactCard.tsx` — presentational card component
- `apps/web/src/components/project-map/ArtifactCard.test.tsx` — unit tests
- `apps/web/src/components/project-map/CredentialErrorBanner.tsx` — client component with re-auth modal
- `apps/web/src/components/project-map/CredentialErrorBanner.test.tsx` — unit tests
- `apps/web/src/app/(dashboard)/(app)/project-map/loading.tsx` — Next.js loading skeleton
- `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` — page unit tests
- `apps/web/src/components/ui/dialog.tsx` — shadcn dialog primitive (auto-generated by `shadcn add dialog`)

**Updated files:**
- `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` — replace placeholder with full data-fetching + rendering

**No changes to:**
- `apps/agent-be/` (no backend changes)
- `libs/` (no schema or shared-type changes — Story 2.1 already delivered everything needed)
- `apps/web/src/lib/artifacts.ts` or `apps/web/src/actions/artifacts.actions.ts` (Story 2.1 delivered these)
- `apps/web/src/lib/credential-health.ts` or `apps/web/src/actions/credential-health.actions.ts` (Story 1.6 delivered these)
- `apps/web/src/components/shell/` (app shell is complete from Story 1.8)
- `tailwind.config.ts`, `next.config.js`, CI config
- Any existing Server Action behavior

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 2.2 (lines 475-501), Epic 2 description (lines 447-449), FR coverage map (lines 182-184, 203)
- PRD: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` — FR-6 (Project Map Artifact List), NFR-P3 (Project Map ≤ 2s)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — component boundaries (line 629), data boundaries (line 636), API & Communication #5 (line 268), Frontend Architecture (lines 270-278), graceful degradation (line 96)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` — artifact-card spec (lines 127-131, 352-354), status-badge-in-progress (lines 133-139), status-badge-completed (lines 141-147), credential-error-banner (lines 180-186, 372-374)
- EXPERIENCE.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` — Project Map states (lines 271-281), Credential Error Banner (lines 198-203), Artifact Card behavior (lines 187-196), empty state voice (line 108)
- Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/mockups/key-project-map.html` — visual reference for card layout, badge styles, header structure
- Project context: `_bmad-output/project-context.md` — frontend data flow rules (lines 88-92), component organization (lines 194-196), shadcn/ui config (lines 126-128), accessibility floor (lines 100-101), testing rules (lines 141-177)
- Previous story: `_bmad-output/implementation-artifacts/2-1-mirror-repository-artifacts-into-postgres.md` — sync strategy notes (lines 187), `syncArtifactsAction` pattern, `Artifact` model schema, status semantics
- Implementation: `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` (placeholder to replace), `apps/web/src/app/(dashboard)/(app)/layout.tsx` (repo-connection guard), `apps/web/src/actions/artifacts.actions.ts` (sync action), `apps/web/src/actions/credential-health.actions.ts` (credential health actions), `apps/web/src/lib/prisma.ts` (Prisma client), `apps/web/src/components/shell/AppShell.tsx` (app shell), `apps/web/src/components/shell/SideNavigation.tsx` (side nav), `libs/shared-types/src/artifact.types.ts` (artifact types), `libs/database-schemas/src/prisma/schema.prisma` (Artifact model)

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- TypeScript error on `SyncArtifactsResult` discriminated union narrowing: `syncResult.success` and `syncResult.errorCode` not accessible because the discriminant property (`success`) only exists on one branch of the union. Fixed by using `'success' in syncResult` for type narrowing instead of property access.
- `yarn nx typecheck web` target not configured in project.json — used `npx tsc --noEmit -p apps/web/tsconfig.json` directly.

### Completion Notes List

- **Task 1**: Created `apps/web/src/components/ui/dialog.tsx` — shadcn new-york style Dialog component using `@radix-ui/react-dialog` (already installed as a dependency of `sheet.tsx`). Adapted to use project design tokens (`bg-overlay`, `bg-surface`, `border-border`, `text-text-1`, `text-text-2`, `ring-accent`). Provides focus-trapping, Escape-dismiss, return-focus, and close button (X icon with `sr-only` label).
- **Task 2**: Created `apps/web/src/components/project-map/ArtifactCard.tsx` — Server Component (no `'use client'`). Implements all 12 type-label mappings, status badge with two variants (completed: muted/transparent, in-progress: caution-colored), text labels on both badges (UX-DR16 non-color signaling), `role="listitem"`, no click handlers (Story 2.6 scope). ATDD tests (pre-existing red phase) now pass.
- **Task 3**: Created `apps/web/src/components/project-map/CredentialErrorBanner.tsx` — Client Component (`'use client'`). Non-dismissible banner with `bg-negative-bg` styling, "Update access token" link with `aria-label` and focus ring. Controlled Dialog (managed via `useState`) with "Reconnect your GitHub account" heading, body text, and "Reconnect" button. Uses `useTransition()` for pending state — button disabled during re-auth redirect. ATDD tests (pre-existing red phase) now pass.
- **Task 4**: Created `apps/web/src/app/(dashboard)/(app)/project-map/loading.tsx` — Next.js loading skeleton. Page shell with header and 3 `animate-pulse` skeleton cards matching ArtifactCard dimensions. No credential banner or refresh button (runtime-state-dependent).
- **Task 5**: Replaced placeholder `page.tsx` with full data-fetching Server Component. Calls `auth()`, reads `repoConnection` and `artifacts` from Postgres, checks `getCredentialHealthStatus()`. Page-load sync strategy: if Postgres empty AND credential healthy, calls `syncArtifactsAction()` and re-reads on success. If sync returns `NO_CREDENTIAL`, sets `credentialFailed = true`. Renders ArtifactCard list, empty state, or CredentialErrorBanner conditionally. Uses `'success' in syncResult` for discriminated union narrowing. ATDD tests (pre-existing red phase) now pass.
- **Task 6**: `yarn nx lint web` — 0 errors, 9 warnings (within 11-warning baseline, no new warnings from implementation code). `npx tsc --noEmit` — clean. `yarn nx test web` — 383 tests pass (29 suites, 0 regressions).
- **Story 2.1 bundling**: Story 2.1's deliverables (`artifacts.ts`, `artifacts.actions.ts`, `repository-validation.ts`, `schema.prisma`, `artifact.types.ts`, migration, test route) were uncommitted when Story 2.2 started and are landed together in this diff. Code is functionally correct; the stories should have been committed separately.

### File List

**New files:**
- `apps/web/src/components/ui/dialog.tsx` — shadcn Dialog primitive (Radix Dialog + project tokens)
- `apps/web/src/components/project-map/ArtifactCard.tsx` — Server Component, presentational artifact card
- `apps/web/src/components/project-map/CredentialErrorBanner.tsx` — Client Component, non-dismissible banner + re-auth modal
- `apps/web/src/app/(dashboard)/(app)/project-map/loading.tsx` — Next.js loading skeleton

**Updated files:**
- `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` — replaced 14-line placeholder with full data-fetching + rendering

**Pre-existing ATDD test files (red-phase tests, now passing):**
- `apps/web/src/components/project-map/ArtifactCard.test.tsx`
- `apps/web/src/components/project-map/CredentialErrorBanner.test.tsx`
- `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx`

## Change Log

- 2026-07-03: Story 2.2 implemented — Project Map page with ArtifactCard list, CredentialErrorBanner with re-auth modal, loading skeleton, page-load sync from GitHub on first visit. All 5 ACs satisfied. 383 tests pass, 0 lint errors, typecheck clean.

### Review Findings

#### Decision Records

**Decision (DP-5):** Non-`NO_CREDENTIAL` sync error codes render misleading empty state — deferred. Spec Task 5.6 explicitly mandates "proceed with rendering whatever is in Postgres." Adding a sync-failure indicator is beyond the story's acceptance criteria. Moved to deferred.

**Decision (DP-5):** Credential health check failure treated as "healthy" — deferred. Spec Task 5.4 explicitly specifies `credentialResult.success && credentialResult.status === 'failed'`. Treating health-check failure differently is a UX change with no spec backing. Moved to deferred.

**Decision (DP-4):** Story 2.1 deliverables bundled into Story 2.2 diff — dismissed (no code change). Process concern, no production behavior change. Completion note added below acknowledging the bundling. Code is functionally correct.

**Decision (DP-4):** `CredentialErrorBanner.test.tsx` uses `userEvent` instead of `fireEvent.click()` — dismissed (no code change). Test-only change, no production behavior change. `userEvent` is a valid superset of `fireEvent` (more realistic user simulation). Accepted as the testing convention; future tests may use `userEvent`.

**Decision (DP-2):** Page re-implements auth guard — dismissed (code is correct). Spec Task 5.1 says "do NOT re-implement them [auth guard]" but also says "Call `auth()` to get `session.userId`" — `auth()` can return null, and the redirect handles that race condition. Semantic intent is "don't duplicate the guard logic," not "don't handle null from `auth()`." Keeping the redirect as defense-in-depth. Spec Task 5.1 amended to clarify that a null-session redirect is allowed as a safety net. Removing the redirect would weaken authentication (escalate per policy).

#### Patch

- [x] [Review][Patch] DELETE test route wipes entire artifacts table when `repoConnectionId` is undefined — `deleteMany({ where: { repoConnectionId: undefined } })` becomes `deleteMany({ where: {} })`, deleting all rows. Add input validation. [`apps/web/src/app/api/internal/test/artifacts/route.ts:47-49`]
- [x] [Review][Patch] `deriveArtifactType` asymmetric prefix matching — Some prefixes include trailing `/` (`prds/`, `ux-designs/`), others don't (`architecture`, `epics`). A file at `planning-artifacts/architecture-old/notes.md` is misclassified as `architecture`. Add trailing `/` to all directory prefixes. [`apps/web/src/lib/artifacts.ts:142-160`]
- [x] [Review][Patch] Type assertions on DB rows bypass runtime validation — `a.type as ArtifactType` / `a.status as ArtifactStatus` without validation. Unknown DB values produce `undefined` from `Record<...>` lookups, rendering empty badges. Add fallbacks: `TYPE_LABELS[type] ?? 'Other'`, `STATUS_BADGE_CLASSES[status] ?? completed`. [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:67,69` + `apps/web/src/components/project-map/ArtifactCard.tsx:44,48`]
- [x] [Review][Patch] `CredentialErrorBanner` swallows `reauthorizeGitHub` errors — `useTransition` does not propagate thrown errors. If `reauthorizeGitHub()` rejects, the button re-enables with no feedback. Wrap in try/catch and show an error message. [`apps/web/src/components/project-map/CredentialErrorBanner.tsx:17-21`]
- [x] [Review][Patch] `fetchFileData` re-throws commit-lookup errors, network errors abort entire sync — `fetchLastCommitDate` throws on network errors (not just HTTP status), and `fetchFileData` re-throws, aborting the entire sync. The docstring says commit date is best-effort. Wrap `fetchLastCommitDate` in try/catch with `new Date()` fallback for network errors. [`apps/web/src/lib/artifacts.ts:168-198`]
- [x] [Review][Patch] Test "banner has no close button" doesn't validate what it claims — Test renders only the banner (dialog never opened), so the assertion passes trivially. Also, the selector `[aria-label="Close"]` won't match the dialog's close button (which uses `sr-only` text). Open dialog first, then verify banner has no close button. [`apps/web/src/components/project-map/CredentialErrorBanner.test.tsx:97-105`]
- [x] [Review][Patch] `deriveTitleFromPath('')` produces empty title for files named `.md` — `filename.replace(/\.md$/, '')` returns `''` for `.md`. Add a fallback (e.g., `'Untitled'`). [`apps/web/src/lib/artifacts.ts:126-130`]
- [x] [Review][Patch] `parseFrontmatterTitle` single `"` produces empty title — `title.startsWith('"') && title.endsWith('"')` is true for a single `"`, so `slice(1, -1)` returns `''`. Add a length check (`title.length >= 2`). [`apps/web/src/lib/artifacts.ts:111-116`]
- [x] [Review][Patch] `page.test.tsx` does not mock child components `ArtifactCard` / `CredentialErrorBanner` — Spec Task 5.10 and Testing Patterns require mocking child components as render stubs. The test header even says to add them but they were never added. Add `jest.mock` stubs for both components. [`apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx`]
- [x] [Review][Patch] `CredentialErrorBanner` link omits `focus:ring-offset-surface` — The link has `focus:ring-offset-2` but not `focus:ring-offset-surface`, unlike the Reconnect button which uses both. Add the missing class for visual consistency on dark `bg-negative-bg`. [`apps/web/src/components/project-map/CredentialErrorBanner.tsx:34`]

#### Deferred

- [x] [Review][Defer] `syncArtifactsAction` returns `NO_CREDENTIAL` for missing session — defensive path unreachable due to layout guard, ambiguous fix [`apps/web/src/actions/artifacts.actions.ts:16-18`] — deferred, pre-existing
- [x] [Review][Defer] No concurrency control on page-load sync / concurrent transactions race on upsert + deleteMany — non-trivial fix, not required by spec [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:37-47` + `apps/web/src/lib/artifacts.ts:232-274`] — deferred, pre-existing
- [x] [Review][Defer] `<a href="#">` for non-navigating action — spec says "link", works with aria-label, changing to `<button>` requires spec deviation [`apps/web/src/components/project-map/CredentialErrorBanner.tsx:27-37`] — deferred, pre-existing
- [x] [Review][Defer] `capturedAt` timestamp captured too early — minor, fix requires restructuring error handling [`apps/web/src/actions/artifacts.actions.ts:35`] — deferred, pre-existing
- [x] [Review][Defer] `Artifact.content` has no size cap — data modeling concern, defer to hardening story [`libs/database-schemas/src/prisma/schema.prisma`] — deferred, pre-existing
- [x] [Review][Defer] Prisma errors uncaught in page — Next.js error boundaries handle this, codebase-wide pattern [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:17-29`] — deferred, pre-existing
- [x] [Review][Defer] Session drift between page-level `auth()` and inner `auth()` — extremely unlikely timing [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:11,31`] — deferred, pre-existing
- [x] [Review][Defer] Non-`NO_CREDENTIAL` sync error codes render misleading empty state — spec Task 5.6 mandates this behavior; adding a sync-failure indicator is beyond ACs (DP-5) [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:37-47`] — deferred, spec-mandated
- [x] [Review][Defer] Credential health check failure silently treated as "healthy" — spec Task 5.4 specifies the logic; treating health-check failure differently is a UX change with no spec backing (DP-5) [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:31-33`] — deferred, spec-mandated
