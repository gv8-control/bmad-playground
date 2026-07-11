---
baseline_commit: d646fc30029ed258414685ef08b6b4f349d8c1f7
---

# Story 2.6: Navigate from the Project Map to an Artifact

Status: done

## Story

As a user viewing the Project Map,
I want clicking an Artifact to take me to its content,
so that I can move seamlessly between the overview and the underlying work.

## Acceptance Criteria

### AC-1: Completed artifact click opens the Artifact Browser pre-selected (FR8)

**Given** a completed Artifact on the Project Map
**When** the user clicks it
**Then** it opens in the Artifact Browser (Story 2.5) with that Artifact pre-selected (FR8)

### AC-2: In-progress artifact click opens the read-only Artifact Browser (FR8)

**Given** an in-progress Artifact on the Project Map
**When** the user clicks it
**Then** it opens the Artifact in the read-only Artifact Browser (FR8)
**And** bringing an already-open Conversation tab into focus instead, when one exists for that Artifact, is delivered in Epic 3 once Conversation pages exist (Story 3.5) — this story's click behavior is the same for every in-progress Artifact

## Tasks / Subtasks

- [x] Task 1: Update `ArtifactCard` to be a clickable link (AC: 1, 2)
  - [x] 1.1 Update `apps/web/src/components/project-map/ArtifactCard.tsx` — add `href: string` to `ArtifactCardProps`. Import `Link` from `next/link` and `cn` from `@/lib/utils`. Change the root element from `<div>` to `<Link href={href}>`. Keep `role="listitem"` on the `<Link>` (matches the established pattern from `ArtifactListEntry` in Story 2.5 and the mockup's `role="listitem"` on `.artifact-card`). Add `aria-label={`${typeLabel}: ${title} — ${statusLabel}`}` (matches the mockup `key-project-map.html:321` `aria-label="PRD: bmad-easy product requirements — Completed"` and the `ArtifactListEntry` pattern). Add hover and focus classes via `cn()`: base className remains `bg-surface-raised border border-border rounded-lg p-3 px-4 flex items-center justify-between max-w-[720px]`, add `hover:border-text-3 transition-colors` (matches the mockup's `.artifact-card:hover { border-color: #3b3b4f; }` — `text-3` is the closest available token to the mockup's `#3b3b4f`; there is no `border-hover` token), add `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` (matches UX-DR16's visible focus ring requirement and the `ArtifactListEntry` focus ring pattern). The `<Link>` renders an `<a>` tag — it provides client-side navigation (no full page reload) and is naturally keyboard-focusable (no `tabindex` needed — the mockup's `tabindex="0"` was for the `<div>`; `<a href>` is focusable by default). Do NOT add `tabindex="0"` — it is redundant on `<a>` elements with an `href`. The existing `TYPE_LABELS`, `STATUS_LABELS`, and `STATUS_BADGE_CLASSES` maps remain unchanged
  - [x] 1.2 Update `apps/web/src/components/project-map/ArtifactCard.test.tsx` — update the stale "RED PHASE" header comment to cite Story 2.6 and the new `href` prop (DP-4 — test-only change; the "RED PHASE" comment is stale since Story 2.2 delivered the component). Add `href` to `COMPLETED_ARTIFACT` and `IN_PROGRESS_ARTIFACT` fixtures (e.g. `href: '/artifacts?id=art_1'`). Add new test cases: [P0] renders as a link (`<a>` tag) with the correct `href` (query via `screen.getByRole('listitem')` — NOT `getByRole('link')`, because `role="listitem"` on the `<a>` overrides its implicit `link` role; then assert `item.tagName === 'A'` and `item` has the `href` attribute); [P0] renders `aria-label` following the `{typeLabel}: {title} — {statusLabel}` pattern (e.g. `"PRD: bmad-easy PRD — Completed"`); [P0] has focus ring classes (`focus:ring-2`, `focus:ring-accent`) in the className; [P0] has hover border classes (`hover:border-text-3`) in the className; [P0] preserves `role="listitem"` on the link element. Update all existing tests to pass the `href` prop — the existing P0/P1 tests (type label, title, status badge, badge visual distinction) should still pass with `href` added to the fixtures. Note: the `[P1] renders all 12 type labels correctly` test constructs `<ArtifactCard>` inline (not from a fixture) — add `href="/artifacts?id=test"` to that inline call too, or TypeScript will flag the missing required prop

- [x] Task 2: Update the Project Map page to pass `href` to each `ArtifactCard` (AC: 1, 2)
  - [x] 2.1 Update `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` — pass `href={`/artifacts?id=${a.id}`}` to each `<ArtifactCard>` in the `.map()` call. The `artifactSelect` already includes `id: true` (line 28), so `a.id` is available — no query changes needed. The `href` format `/artifacts?id={artifactId}` matches the query-parameter approach established in Story 2.5 (DP-2 — the artifacts page reads `searchParams.id` and renders the two-column layout with the selected artifact). Both completed and in-progress artifacts receive the same `href` — AC-2's Conversation-tab-focus is deferred to Epic 3 (Story 3.5). No other changes to the page — the header, `RefreshButton`, `CredentialErrorBanner`, sync-on-first-visit, and empty-state logic remain unchanged
  - [x] 2.2 Update `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` — update the `ArtifactCard` mock to accept and render the `href` prop (use template literal backticks for interpolation, matching the existing mock): `` ({ title, type, status, href }) => `ArtifactCard:${type}:${title}:${status}:${href}` ``. Add a new test case: [P0] each `ArtifactCard` receives `href={`/artifacts?id=${a.id}`}` (assert the rendered HTML contains `ArtifactCard:prd:bmad-easy PRD:completed:/artifacts?id=art_1` and `ArtifactCard:architecture:System Architecture:in-progress:/artifacts?id=art_2`). The existing tests should still pass with the updated mock — the `select` assertion already includes `id: true`, and the artifact titles are still rendered. No changes to the `setupArtifacts` helper or the `ARTIFACTS` fixture (they already include `id`)

- [x] Task 3: Verify lint, typecheck, and tests pass (AC: all)
  - [x] 3.1 Run `yarn nx lint web` — 0 new errors/warnings (baseline: 0 errors, 7 warnings per Story 2.5 completion)
  - [x] 3.2 Run typecheck — `npx tsc --noEmit -p apps/web/tsconfig.json` (the `typecheck` target is not configured in `project.json` — known issue from Story 2.2)
  - [x] 3.3 Run `yarn nx test web` — all new and existing tests pass (baseline: 460 tests per Story 2.5 completion)

## Dev Notes

### Decision Records

**Decision (DP-1):** Story file already existed with status `ready-for-dev` when validation was requested. The `ready-for-dev` status is ambiguous — the story may already be complete, or the status may be stale. Overwriting the existing file would be the destructive path. Per DP-1, chose the non-destructive path: read the existing story, validate it against the checklist, and apply non-destructive fixes only. No full regeneration.

**Decision (DP-4):** Fixed mock pattern examples that used single quotes where template literal backticks are required — single-quoted strings don't interpolate `${}` in JavaScript. Doc wording fix, no production behavior change.

**Decision (DP-4):** Added note that `cursor: pointer` is automatic on `<a>` tags (rendered by `<Link>`) — prevents the dev agent from adding a redundant `cursor-pointer` class. Doc wording fix.

**Decision (DP-3):** Make `ArtifactCard` itself a `<Link>` rather than creating a separate `ArtifactAccessLink` wrapper component. The architecture (`architecture.md:509`) mentions `ArtifactAccessLink.tsx` for FR-17, but Story 2.5 already established the pattern of making the display component itself a link — `ArtifactListEntry` was changed from `<div>` to `<Link>` in Story 2.5. Creating a separate wrapper component that wraps `ArtifactCard` in a `<Link>` adds an unnecessary layer of indirection (the card would be a link inside a link wrapper, or the wrapper would replace the card's root element — either way, more moving parts for no benefit). Both approaches are reversible and functionally equivalent. Per DP-3, pick the simplest: make `ArtifactCard` itself the `<Link>`. The `ArtifactAccessLink.tsx` reference in the architecture is a structural suggestion superseded by the established pattern. If Epic 3's Semantic Pill "View" link needs a shared link helper, it can extract one then — YAGNI.

**Decision (DP-3):** Add `href: string` prop to `ArtifactCard` rather than `id: string`. Following the `ArtifactListEntry` pattern from Story 2.5 — the component receives a pre-constructed `href`, so it doesn't need to know the URL structure (`/artifacts?id=...`). The page constructs the `href` and passes it. This decouples the component from the routing convention.

**Decision (DP-5):** Do NOT implement Conversation-tab-focus for in-progress artifacts. AC-2 and FR-8 explicitly defer this to Epic 3 (Story 3.5): "bringing an already-open Conversation tab into focus instead, when one exists for that Artifact, is delivered in Epic 3 once Conversation pages exist." Both completed and in-progress artifacts get the same click behavior: navigate to `/artifacts?id={artifactId}`. Per DP-5, defer scope temptation.

**Decision (DP-3):** Use `hover:border-text-3` for the card hover border color. The mockup (`key-project-map.html:218`) specifies `.artifact-card:hover { border-color: #3b3b4f; }`. There is no `border-hover` or `border-strong` token in `tailwind.config.ts` — the available border tokens are `border` (`#2B2B38`) and `border-subtle` (`#1E1E26`, darker). `text-3` (`#56556A`) is the closest available token to the mockup's `#3b3b4f`. Adding a new token for one hover state is over-engineering. The mockup is a design reference, not an exact spec, and the ACs do not specify hover styling. The visual difference between `#3b3b4f` and `#56556A` is minimal (both are muted purple-grays lighter than the default `#2B2B38` border). Per DP-3, use the closest existing token.

**Decision (DP-4):** Update the stale "RED PHASE" header comment in `ArtifactCard.test.tsx`. The existing header says "RED PHASE: all tests will fail because ArtifactCard.tsx does not exist yet" — stale since Story 2.2 delivered the component. Update to cite Story 2.6 and the new `href` prop. Test-only change, no production behavior change.

**Decision (DP-5):** Do NOT add `tabindex="0"` to the `<Link>`. The mockup has `tabindex="0"` on the `<div>` card, but `<a href>` is naturally keyboard-focusable — adding `tabindex="0"` is redundant and can cause double-tab stops in some browsers. The mockup used `tabindex="0"` because it was a `<div>` (non-focusable by default). Per DP-5, the `<Link>`/`<a>` doesn't need it.

**Decision (DP-4):** Corrected Task 1.2 and Testing Patterns to recommend `screen.getByRole('listitem')` instead of `screen.getByRole('link')`. The component has `role="listitem"` on the `<Link>`/`<a>`, which overrides the `<a>`'s implicit `link` role — so `getByRole('link')` would fail at runtime. The actual test file already uses `getByRole('listitem')` correctly; the story's prose contradicted both the test file and its own accessibility note (line 111). Doc-only fix, no production behavior change.

### What Already Exists (Do Not Recreate)

- **`ArtifactCard` component** (`apps/web/src/components/project-map/ArtifactCard.tsx`) — Story 2.2 delivered this as a display-only Server Component with a `<div>` root. Story 2.6 updates it: adds `href` prop, changes root to `<Link>`, adds hover/focus styling and `aria-label`. The existing `TYPE_LABELS`, `STATUS_LABELS`, and `STATUS_BADGE_CLASSES` maps remain unchanged
- **`ArtifactListEntry` component** (`apps/web/src/components/artifact-browser/ArtifactListEntry.tsx`) — Story 2.5 delivered this with the `<Link>` pattern, `href`/`selected` props, `aria-label`, `aria-current`, `cn()` styling, and focus ring classes. Story 2.6's `ArtifactCard` update follows this exact pattern (minus `selected` — Project Map cards don't have a selected state). Do NOT modify `ArtifactListEntry`
- **Artifacts page** (`apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx`) — Story 2.5 delivered the two-column layout with `searchParams.id` handling, `findFirst` for the selected artifact, `ArtifactViewer` and `ArtifactLoadError`. The page already accepts `/artifacts?id={artifactId}` URLs and pre-selects the artifact. Do NOT modify it — Story 2.6 only navigates TO it
- **`RefreshButton`** (`apps/web/src/components/project-map/RefreshButton.tsx`) — Story 2.3 delivered this. Remains unchanged
- **`CredentialErrorBanner`** (`apps/web/src/components/project-map/CredentialErrorBanner.tsx`) — Story 2.2 delivered this. Remains unchanged
- **`Breadcrumb`** (`apps/web/src/components/shell/Breadcrumb.tsx`) — Story 1.8 delivered this. The artifacts page already renders "← Project Map" breadcrumb (from Story 2.4). When the user navigates from Project Map to Artifact Browser, the breadcrumb provides an explicit "Back" navigation path (FR-17). No changes needed
- **`AppShell`** (`apps/web/src/components/shell/AppShell.tsx`) — Story 1.8 delivered this. Focus management moves focus to `h1` on route change. The artifacts page already renders `<h1>Artifact Browser</h1>`. No changes needed
- **`Artifact` Prisma model** (`libs/database-schemas/src/prisma/schema.prisma`) — Story 2.1 delivered this. The `id` field is already selected in the Project Map page's `artifactSelect`. No schema changes
- **Project Map page's `artifactSelect`** — already includes `id: true` (line 28). No query changes needed to support `href` construction
- **`cn()` helper** (`apps/web/src/lib/utils.ts`) — clsx + tailwind-merge. Import from `@/lib/utils`
- **`Link` from `next/link`** — already used in `ArtifactListEntry`. Server Components can render `<Link>` — no `'use client'` directive needed on `ArtifactCard`

### How AC-1 Is Satisfied

AC-1 ("clicking a completed Artifact opens it in the Artifact Browser with that Artifact pre-selected") is satisfied by:

1. `ArtifactCard` renders as `<Link href={href}>` — clicking the card navigates to the `href` URL
2. The page passes `href={`/artifacts?id=${a.id}`}` to each `ArtifactCard` — the URL targets the artifacts page with the artifact ID as a query parameter
3. The artifacts page (Story 2.5) reads `searchParams.id` and renders the two-column layout with that artifact pre-selected (the `findFirst` query loads the artifact's content, `ArtifactViewer` renders it, `ArtifactListEntry` marks it as `selected`)
4. The navigation uses Next.js client-side routing (`<Link>`) — no full page reload, the Server Component re-executes with the new `searchParams`
5. "Completed" vs "in-progress" does not affect the `href` — both navigate to the same `/artifacts?id={artifactId}` URL. The artifacts page renders the same read-only view for both statuses

### How AC-2 Is Satisfied

AC-2 ("clicking an in-progress Artifact opens the read-only Artifact Browser") is satisfied by:

1. In-progress artifacts receive the same `href={`/artifacts?id=${a.id}`}` as completed artifacts — the click behavior is identical for every artifact regardless of status
2. The artifacts page (Story 2.5) renders the artifact as read-only Markdown via `ArtifactViewer` — no editing controls are present (AC-1 from Story 2.5: "the view is read-only — no editing controls are present")
3. The Conversation-tab-focus case ("bringing an already-open Conversation tab into focus instead, when one exists") is explicitly deferred to Epic 3 (Story 3.5) — this story's click behavior is the same for every in-progress artifact, as stated in the AC

### Component Boundaries

- `ArtifactCard` becomes a **Server Component** that renders a `<Link>` (Client Component import). Server Components can render Client Components — `<Link>` from `next/link` works in Server Components. The component receives `href`, `type`, `title`, and `status` props. No `'use client'` directive needed — the component itself has no client-side logic (no `useState`, `useEffect`, or event handlers)
- The page remains a **Server Component** — it reads from Postgres via Prisma, constructs the `href` for each artifact, and renders `ArtifactCard` components. No changes to the page's data-fetching logic

### Design Token Usage

All colors and spacing from `tailwind.config.ts` (mirrors DESIGN.md). Use semantic token names, never raw hex:

- Card base: `bg-surface-raised border border-border rounded-lg p-3 px-4 flex items-center justify-between max-w-[720px]` (unchanged from Story 2.2)
- Card hover: `hover:border-text-3 transition-colors` (matches mockup's `.artifact-card:hover { border-color: #3b3b4f; }`)
- Card focus ring: `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` (matches UX-DR16 and the `ArtifactListEntry` pattern)
- `cursor: pointer` is automatic — the `<Link>` renders an `<a>` tag, and browsers apply `cursor: pointer` to `<a href>` elements by default. Do NOT add a `cursor-pointer` class. The mockup's `cursor: pointer` on `.artifact-card` was needed because it was a `<div>`; `<a>` tags get it for free

### Accessibility (UX-DR16)

- `role="listitem"` on the `<Link>`/`<a>` (preserved from Story 2.2, matches the mockup and the `ArtifactListEntry` pattern). Note: `role="listitem"` on an `<a>` overrides its implicit `link` role — this is a known deferred finding from Story 2.5 (same pattern, same trade-off). Practical impact is minimal — most screen readers announce `<a>` tags as links regardless of the role override
- `aria-label="{typeLabel}: {title} — {statusLabel}"` on each card (matches the mockup `key-project-map.html:321` and the `ArtifactListEntry` pattern). Provides an accessible name that includes the artifact's type, title, and status
- Visible focus ring: `focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` — visible 2px accent focus ring with 2px offset, never suppressed on click (UX-DR16). The `<Link>`/`<a>` is naturally focusable via keyboard — no `tabindex` needed
- Whole card is a single click target (EXPERIENCE.md:193 — "The whole card is a single click target — not just the title") — making the root element a `<Link>` satisfies this: the entire card surface is the click target
- Status badge uses text label ("Completed" / "In progress") in addition to color — non-color state signaling (UX-DR16, preserved from Story 2.2)
- `<h1>Project Map</h1>` for route-change focus management (preserved from Story 2.2)

### Out of Scope (Do Not Implement)

- **Conversation-tab-focus for in-progress artifacts**: Epic 3 (Story 3.5) scope. AC-2 explicitly defers this. Both completed and in-progress artifacts navigate to `/artifacts?id={artifactId}` in this story
- **`ArtifactAccessLink` component**: Mentioned in `architecture.md:509` for FR-17. Not created — `ArtifactCard` itself becomes the link (DP-3, see Decision Records). The `ArtifactAccessLink` reference is a structural suggestion superseded by the established pattern from Story 2.5
- **`selected` state on `ArtifactCard`**: Project Map cards don't have a selected state (unlike `ArtifactListEntry` in the Artifact Browser's two-column layout). The user is navigating AWAY from the Project Map, not selecting within it
- **`lastModifiedAt` prop**: Project Map cards don't display a date (unlike Artifact Browser list entries). The mockup confirms — cards show type label, title, and status badge only
- **`apps/agent-be` changes**: No backend changes. Navigation is a pure `apps/web` client-side routing concern
- **`libs/` changes**: No schema or shared-type changes. The `id` field already exists on the `Artifact` model and is already selected in the page's query
- **Loading skeleton changes**: `loading.tsx` renders skeleton cards, not `ArtifactCard` components — no changes needed
- **Artifact Browser changes**: The artifacts page already handles `/artifacts?id={artifactId}` URLs from Story 2.5 — no changes needed to the destination page
- **Real-time updates**: No WebSocket, SSE, or polling. Manual browser reload is the refresh mechanism

### Testing Patterns

Follow the established patterns from the codebase:

- **Test file header comments:** update the `ArtifactCard.test.tsx` header comment block to cite Story 2.6, the `href` prop, and remove the stale "RED PHASE" text (DP-4). The `page.test.tsx` header already cites Story 2.2 — no header change needed (the test additions are incremental)
- **Component tests** (`ArtifactCard.test.tsx`): use `jsdom` environment (default). Use `@testing-library/react` with `render()`, `screen.getByText()`. `ArtifactCard` is synchronous (no async), so no `await` needed. Use `screen.getByRole('listitem')` to query the rendered element (NOT `getByRole('link')` — `role="listitem"` on the `<a>` overrides its implicit `link` role), then assert `item.tagName === 'A'` and `item` has the `href` attribute via `toHaveAttribute('href', ...)`
- **Server Component page tests** (`page.test.tsx`): use `@jest-environment node`. Call the async component function directly (`const element = await ProjectMapPage()`), then `renderToStaticMarkup(element)` from `react-dom/server`, and assert on the HTML string. Mock `ArtifactCard` as a render stub that includes the `href` prop in its output string
- **Mock patterns**: `` jest.mock('@/components/project-map/ArtifactCard', () => ({ ArtifactCard: ({ title, type, status, href }) => `ArtifactCard:${type}:${title}:${status}:${href}` })) `` — the mock accepts `href` and includes it in the output string so the test can assert on it. Use template literal backticks (not single quotes) for `${}` interpolation, matching the existing mock in the test file
- **Tag tests** `[P0]` or `[P1]` in `it()` descriptions. P0 for AC coverage, P1 for edge cases
- **Co-locate** tests with source: `*.test.tsx` next to the file under test

### Previous Story Intelligence

- **Story 2.5 (done)**: Delivered `ArtifactViewer`, `ArtifactLoadError`, updated `ArtifactListEntry` (added `href`/`selected` props, changed root to `<Link>`), updated the artifacts page (two-column layout, `searchParams.id`, `findFirst`). The `ArtifactListEntry` → `<Link>` pattern is the canonical pattern for making a display component clickable — Story 2.6's `ArtifactCard` update follows it exactly. Lint baseline: 0 errors, 7 warnings. Test baseline: 460 tests. Key learnings: (a) `react-markdown` v10 uses a default export (not named) — not relevant here since no markdown rendering; (b) `role="listitem"` on `<Link>`/`<a>` overrides implicit `link` role — deferred finding, applies here too; (c) `cn()` from `@/lib/utils` is the established pattern for class merging; (d) focus ring classes `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` are the standard focus styling across the app
- **Story 2.4 (done)**: Delivered `ArtifactListEntry` (display-only at the time), the Artifact Browser page (Postgres-backed list). Story 2.5 extended `ArtifactListEntry` with click behavior; Story 2.6 extends `ArtifactCard` the same way
- **Story 2.2 (done)**: Delivered the Project Map page (`page.tsx`), `ArtifactCard`, `CredentialErrorBanner`, `loading.tsx`. The `ArtifactCard` was delivered as display-only — Story 2.6 makes it clickable. The page's data-fetching pattern (`auth()` → `repoConnection.findUnique` → `Promise.all([artifact.findMany, getCredentialHealthStatus])` → sync-on-empty → render) is unchanged
- **Story 1.8 (done)**: Delivered the `AppShell`, `SideNavigation`, `Breadcrumb`, and the `(dashboard)/(app)/` route structure. The `AppShell`'s focus management moves focus to `h1` on route change — the artifacts page already renders `<h1>Artifact Browser</h1>`, so navigating from Project Map to Artifact Browser moves focus correctly
- **Established conventions**: kebab-case non-component files, PascalCase component files, co-located tests, Conventional Commits. `cn()` from `@/lib/utils` for conditional class merging. `null as never` after `redirect()`. `as ArtifactType` / `as ArtifactStatus` type assertions on DB rows (pre-existing pattern). `Link` from `next/link` for client-side navigation in Server Components

### Git Intelligence

- Recent commits: `d646fc3 feat(pipeline): tune review-nfrs/implement-story prompts`, `d10a327 chore(opencode): add neuralwatt provider config`, `55548a9 feat(pipeline): track human-escalation halts`. Epic 1 is complete. Epic 2 is in-progress (Stories 2.1–2.5 are done). Story 2.6 is the final story in Epic 2
- The `ArtifactCard` component was last modified in Story 2.2. The Project Map page was last modified in Story 2.3 (added `RefreshButton`). Both are updated in Story 2.6

### Project Structure Notes

**Updated files:**
- `apps/web/src/components/project-map/ArtifactCard.tsx` — add `href` prop, change root from `<div>` to `<Link>`, add `aria-label`, add hover/focus styling via `cn()`
- `apps/web/src/components/project-map/ArtifactCard.test.tsx` — update header comment, add `href` to fixtures, add new tests for link behavior, `aria-label`, focus/hover classes
- `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` — pass `href={`/artifacts?id=${a.id}`}` to each `<ArtifactCard>`
- `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` — update `ArtifactCard` mock to accept `href`, add test for `href` passing

**No changes to:**
- `apps/agent-be/` (no backend changes)
- `libs/` (no schema or shared-type changes)
- `apps/web/src/components/artifact-browser/` (Artifact Browser — already handles `?id=` from Story 2.5)
- `apps/web/src/components/project-map/RefreshButton.tsx` (Story 2.3)
- `apps/web/src/components/project-map/CredentialErrorBanner.tsx` (Story 2.2)
- `apps/web/src/components/shell/Breadcrumb.tsx` (Story 1.8)
- `apps/web/src/components/shell/AppShell.tsx` (Story 1.8)
- `apps/web/src/app/(dashboard)/(app)/project-map/loading.tsx` (Story 2.2 — skeleton, no `ArtifactCard`)
- `apps/web/src/app/(dashboard)/(app)/project-map/loading.test.tsx` (Story 2.2 — no `ArtifactCard` mock)
- `apps/web/src/app/(dashboard)/(app)/artifacts/` (Story 2.5 — destination page, no changes)
- `apps/web/src/actions/artifacts.actions.ts` (Story 2.1)
- `apps/web/src/lib/artifacts.ts` (Story 2.1)
- `tailwind.config.ts`, `next.config.js`, CI config

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 2.6 (lines 563-578), Epic 2 description (lines 447-449, 222-224), FR8 (line 34), FR17 (line 52), FR Coverage Map FR8 (line 184), FR17 (line 193)
- PRD: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` — FR-8 (line 213-222), FR-17 (line 348-356)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — directory structure (lines 507-509 — `artifact-browser/` with `ArtifactViewer.tsx` and `ArtifactAccessLink.tsx`; line 484 — `project-map/page.tsx`), requirements-to-structure mapping (line 582 — `artifacts/` FR-6/7/8/16/17)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` — artifact-card component spec (lines 127-131 — background, border, border-radius, padding), Artifact Cards section (lines 352-354 — card contents: type label, title, status badge)
- EXPERIENCE.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` — Artifact Card behavior (lines 187-196 — whole card is click target, completed → Artifact Browser pre-selected, in-progress → same read-only view until Epic 3), Artifact Browser Layout States (lines 77-84 — entering via Project Map click pre-selects the artifact)
- Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/mockups/key-project-map.html` — full Project Map mockup. Card has `cursor: pointer`, `:hover { border-color: #3b3b4f; }`, `role="listitem"`, `tabindex="0"`, `aria-label="PRD: bmad-easy product requirements — Completed"`
- Decision log: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/.decision-log.md` — Artifact Card behavior (line 70 — whole card is click target, completed → Artifact Browser pre-selected, in-progress → same read-only view until Epic 3)
- Project context: `_bmad-output/project-context.md` — Server Component patterns (lines 86-105), `cn()` helper (line 134), component organization by feature (line 201), `Link` from `next/link` (line 65), focus ring pattern (lines 100-102), accessibility floor UX-DR16 (line 165)
- Previous story: `_bmad-output/implementation-artifacts/2-5-view-a-single-artifacts-rendered-content.md` — `ArtifactListEntry` → `<Link>` pattern (Task 3), `href`/`selected` props, `aria-label`, `aria-current`, `cn()` styling, focus ring classes, test patterns
- Decision policy: `_bmad-output/decision-policy.md` — DP-3 (simplest reversible option), DP-4 (test-only changes), DP-5 (defer scope temptation)
- Implementation: `apps/web/src/components/project-map/ArtifactCard.tsx` (component to update), `apps/web/src/components/project-map/ArtifactCard.test.tsx` (test to update), `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` (page to update), `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` (page test to update), `apps/web/src/components/artifact-browser/ArtifactListEntry.tsx` (canonical `<Link>` pattern from Story 2.5), `apps/web/src/app/(dashboard)/(app)/artifacts/page.tsx` (destination page — already handles `?id=`), `apps/web/src/lib/utils.ts` (`cn()` helper), `apps/web/tailwind.config.ts` (design tokens)

### ATDD Artifacts

- Checklist: `_bmad-output/test-artifacts/atdd-checklist-2-6-navigate-from-the-project-map-to-an-artifact.md`
- Component tests: `apps/web/src/components/project-map/ArtifactCard.test.tsx` (5 red-phase scaffolds, `it.skip()`)
- Component tests: `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` (1 red-phase scaffold, `it.skip()`)

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- RED phase: activated 6 `it.skip()` scaffolds (5 in `ArtifactCard.test.tsx`, 1 in `page.test.tsx`). 5 failed as expected (the "preserves role" test passed because the `<div>` already had `role="listitem"`). 1 page test failed (page didn't pass `href`).
- GREEN phase: implemented `ArtifactCard` as `<Link>` with `href`/`aria-label`/hover/focus styling; updated `page.tsx` to pass `href={`/artifacts?id=${a.id}`}`. 1 remaining failure: `[P1] renders all 12 type labels correctly` constructed `<ArtifactCard>` inline without `href` — added `href="/artifacts?id=test"` to the inline call (story spec flagged this). All 470 tests pass.
- REFACTOR: no structural changes needed — the implementation follows the canonical `ArtifactListEntry` pattern from Story 2.5 exactly.

### Completion Notes List

- **Task 1.1:** `ArtifactCard.tsx` changed from `<div>` root to `<Link>` root. Added `href: string` to `ArtifactCardProps`. Imported `Link` from `next/link` and `cn` from `@/lib/utils`. Added `aria-label={`${typeLabel}: ${title} — ${statusLabel}`}`. Added `hover:border-text-3 transition-colors` and `focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface` via `cn()`. Extracted `typeLabel`/`statusLabel` locals (matching `ArtifactListEntry` pattern) so the `aria-label` and rendered content use the same fallback logic. No `tabindex` added (redundant on `<a href>` — DP-5).
- **Task 1.2:** `ArtifactCard.test.tsx` — removed 5 `it.skip()` markers to activate the red-phase scaffolds. Updated header comment from "RED PHASE scaffolds" to "GREEN" (DP-4 — test-only change). Added `href="/artifacts?id=test"` to the inline `[P1] renders all 12 type labels correctly` test call (story spec flagged this). Fixtures already had `href` (ATDD phase added them).
- **Task 2.1:** `page.tsx` — added `href={`/artifacts?id=${a.id}`}` to the `<ArtifactCard>` in the `.map()` call. No other changes. `a.id` was already selected in `artifactSelect`.
- **Task 2.2:** `page.test.tsx` — removed 1 `it.skip()` marker. The `ArtifactCard` mock already accepted `href` and included it in the output string (ATDD phase set this up).
- **Task 3.1:** `yarn nx lint web` — 0 errors, 7 warnings (matches Story 2.5 baseline; no new warnings).
- **Task 3.2:** `npx tsc --noEmit -p apps/web/tsconfig.json` — clean (no output).
- **Task 3.3:** `yarn nx test web` — 470 passed, 0 failed, 0 regressions (37 test suites all green).
- **AC-1 satisfied:** `ArtifactCard` renders as `<Link href={href}>` → clicking navigates to `/artifacts?id={artifactId}` → artifacts page (Story 2.5) reads `searchParams.id` and pre-selects the artifact. Both completed and in-progress artifacts use the same `href`.
- **AC-2 satisfied:** In-progress artifacts receive the same `href` as completed artifacts → the artifacts page renders read-only Markdown via `ArtifactViewer` (no editing controls). Conversation-tab-focus is deferred to Epic 3 (Story 3.5) per the AC text.
- **No decisions required HALT** — all decisions were pre-recorded in the story spec's Decision Records (DP-1 through DP-5) and applied as written. No new decision classes arose during implementation.

### File List

- `apps/web/src/components/project-map/ArtifactCard.tsx` — modified (added `href` prop, `<div>` → `<Link>`, `aria-label`, hover/focus styling via `cn()`)
- `apps/web/src/components/project-map/ArtifactCard.test.tsx` — modified (activated 5 `it.skip()` tests, updated header comment, added `href` to inline test call)
- `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` — modified (pass `href={`/artifacts?id=${a.id}`}` to each `<ArtifactCard>`)
- `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` — modified (activated 1 `it.skip()` test)

### Review Findings

**Review date:** 2026-07-04 — 3-layer adversarial review (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Diff baseline: `d646fc3` (story frontmatter). Story 2.6's actual changes are limited to the `href` prop on `ArtifactCard` and `page.tsx` (passing `href` to each card). The remaining diff content belongs to Stories 2.2–2.5 (baseline predates their implementation).

**Decision (DP-5):** All findings are either pre-existing issues already deferred from earlier story reviews (Stories 2.2, 2.5) or dismissed as noise. No patch findings — Story 2.6's implementation is correct against AC-1 and AC-2. The `role="listitem"` accessibility trade-off is explicitly documented in the story spec as a known deferred finding from Story 2.5. Per DP-5, no scope expansion.

- [x] [Review][Defer] `role="listitem"` on `<Link>`/`<a>` overrides implicit `link` role [`apps/web/src/components/project-map/ArtifactCard.tsx:44-46`] — deferred, pre-existing from Story 2.5 (same pattern, same trade-off, already recorded in deferred-work.md)
- [x] [Review][Defer] Non-`NO_CREDENTIAL` sync error codes silently render misleading empty state [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:51-63`] — deferred, pre-existing from Story 2.2 (already recorded in deferred-work.md)
- [x] [Review][Defer] Credential health check failure silently treated as "healthy" [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:46`] — deferred, pre-existing from Story 2.2 (already recorded in deferred-work.md)
- [x] [Review][Defer] Redirect/auth branches untested [`apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx`] — deferred, pre-existing from Story 2.2 (same pattern already recorded for artifacts page in deferred-work.md)
- [x] [Review][Defer] `redirect` mock doesn't replicate real throwing behavior [`apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx:23-25`] — deferred, pre-existing from Story 2.2 (same pattern already recorded for artifacts page in deferred-work.md)
- [x] [Review][Defer] No concurrency control on page-load sync [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:51-63`] — deferred, pre-existing from Story 2.2 (already recorded in deferred-work.md)
- [x] [Review][Defer] `Promise.all` has no error boundary [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:36-44`] — deferred, pre-existing from Story 2.2 (already recorded in deferred-work.md)
- [x] [Review][Defer] Test data over-specified vs. production `select` [`apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx:71-96`] — deferred, pre-existing from Story 2.2. `ARTIFACTS` fixture includes `content`, `createdAt`, `updatedAt`, `repoConnectionId` which the production `select` excludes. Tests render with fields production won't return, masking potential field-name mismatches.
- [x] [Review][Defer] No negative-constraint tests for "do not" rules [`apps/web/src/components/project-map/ArtifactCard.test.tsx`] — deferred, test coverage gap. Tests don't assert absence of `tabindex="0"` or `'use client'`. Implementation is correct (neither present). Per DP-5, not required by story spec tasks.

**Dismissed (8):** `encodeURIComponent` on cuid (URL-safe), `??` fallbacks (defensive pattern, matches `ArtifactListEntry`), page.tsx diff exceeds 2.6 scope (baseline artifact), page.test.tsx ACs from other stories (same), `RefreshButton` without 2.6 task (Story 2.3 addition), page selects unused fields (`lastModifiedAt` used in `orderBy`), sync-on-read side effect (established pattern, already deferred), unhandled rejection (Next.js `error.tsx` handles).

### NFR Evidence Audit

**Audit date:** 2026-07-04 — NFR Evidence Audit (testarch-nfr). Full report: `_bmad-output/test-artifacts/nfr-assessment-2-6.md`.

**Overall Status:** CONCERNS (18/29 ADR criteria met; 0 FAIL, 0 HIGH priority issues)

**NFR Patch Applied (1):**

- [x] [NFR][Patch] NFR-P4 timing test for Project Map → Artifact Browser navigation [`playwright/e2e/project-map/navigate-to-artifact.spec.ts:108-138`] — added `[P0]` E2E timing test that warms up both routes, then measures click-to-content-visible navigation, asserting `elapsed < 2_000`. Resolves the HIGH priority gap from Story 2.4's NFR assessment (no NFR-P4 timing test existed). Validates the navigation entry point introduced by Story 2.6.

**NFR Findings — Deferred (all pre-existing, project-wide):**

- [x] [NFR][Defer] No structured JSON logging in apps/web Server Actions — deferred, pre-existing from Story 2.2 (project-wide; no `logError` helper, sync-failure patterns invisible to operators)
- [x] [NFR][Defer] No circuit breaker on `syncArtifactsAction` — deferred, pre-existing from Story 2.1/2.2 (no fail-fast after consecutive GitHub failures; no retry/backoff on transient errors)
- [x] [NFR][Defer] No security headers in `next.config.js` — deferred, pre-existing from Story 2.2 (project-wide; no CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- [x] [NFR][Defer] No `npm audit`/Snyk in CI — deferred, pre-existing from Story 2.2 (project-wide; no dependency-vulnerability scanning)
- [x] [NFR][Defer] No CI burn-in results for Story 2.6 — deferred (burn-in job exists in CI but no execution results available; cannot verify test stability over 10 iterations)
- [x] [NFR][Defer] No per-user cooldown on `syncArtifactsAction` — deferred, pre-existing from Story 2.3 (RefreshButton makes sync repeatable on demand; no server-side throttle)
- [x] [NFR][Defer] No monitoring/observability tooling (Sentry/APM/tracing) in apps/web — deferred, pre-existing from Story 2.2 (project-wide; production failures invisible to operators)

**NFR Findings — Dismissed:**

- `encodeURIComponent(a.id)` in `href` construction — `a.id` is Prisma cuid (URL-safe). Dismissed in code review. Same pattern in `artifacts/page.tsx:105,135` (Story 2.5). Destination page has input validation and tenant-scoped `findFirst`. Not an NFR-specific patch for Story 2.6.

### Change Log

- 2026-07-03: Story 2.6 implemented — `ArtifactCard` is now a clickable `<Link>` navigating to `/artifacts?id={artifactId}`. Both completed and in-progress artifacts use the same click behavior (Conversation-tab-focus deferred to Epic 3). All 470 tests pass, lint clean, typecheck clean.
- 2026-07-04: Code review completed — 0 patch, 0 decision-needed, 9 deferred (7 pre-existing), 8 dismissed. Story status set to `done`.
- 2026-07-04: NFR Evidence Audit completed — 1 NFR patch applied (NFR-P4 timing test for navigation flow), 7 deferred (all pre-existing, project-wide). Overall status: CONCERNS (18/29). HIGH priority gap from Story 2.4 (no NFR-P4 timing test) resolved.
