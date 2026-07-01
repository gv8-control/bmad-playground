---
baseline_commit: 61570f4fcb15c07932862474463157a9018d9cd2
---

# Story 1.8: Build the Persistent App Shell

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user navigating the platform,
I want a consistent, accessible shell around every page,
so that navigation, scrolling, and keyboard use feel predictable everywhere, on any supported screen size.

## Acceptance Criteria

### AC-1: Side Navigation renders on all authenticated pages with a connected repository (UX-DR2)

**Given** any authenticated page where the user has a connected repository
**When** it renders
**Then** the Side Navigation (240px fixed) shows the product wordmark, a "New Conversation" button, the last 5 Conversations by semantic title (truncated with ellipsis), a separator, then Project Map and Artifact Browser links, with a bottom-pinned avatar-circle Settings entry, and active vs. inactive items styled per DESIGN.md
**And** no "show more"/"view all" affordance is shown beyond the 5 listed Conversations
**And** keyboard tab order reaches the side navigation before the main content area

### AC-2: Three-zone scroll model (UX-DR13)

**Given** a page with a chat panel or artifact content pane
**When** it renders
**Then** the side navigation and the chat input (or list/page header) remain fixed while only the message panel or content pane scrolls independently

### AC-3: Breadcrumb on depth-1 pages, no animated transitions (UX-DR20)

**Given** a depth-1 page (Conversation or Artifact Browser)
**When** it renders
**Then** a "← Project Map" breadcrumb is shown, and no animated page/route transitions are used

### AC-4: Accessibility floor (UX-DR16)

**Given** the accessibility floor
**When** any interactive element is focused, a route changes, a modal opens, or a status updates
**Then** a visible 2px accent focus ring with 2px offset appears and is never suppressed on click; route changes move focus to the page's `h1` or first interactive element; modals (re-auth, save confirmation) trap focus and return it to the trigger on close; state is never signaled by color alone; the chat message stream and working tree indicator use `aria-live="polite"`; loading/save-confirmation messages use `role="status"`; the streaming cursor and thinking indicator respect `prefers-reduced-motion`; avatar circles and icon-only buttons have `aria-label`s

### AC-5: Responsive behavior — desktop, tablet drawer, mobile out of scope (UX-DR17)

**Given** the viewport width
**When** it is at least 1024px
**Then** the full desktop layout renders; between 768–1023px the side navigation collapses into an off-canvas drawer triggered by a hamburger button; below 768px is explicitly out of scope for MVP
**And** the drawer renders as an overlay (not a content reflow), dismisses on outside click and on Escape, and follows the same focus-trap/return-focus behavior as other modals in this story's accessibility floor

## Tasks / Subtasks

- [x] Task 1: Install `@radix-ui/react-dialog` and create the `cn` utility (AC: 4, 5)
  - [x] 1.1 Add `@radix-ui/react-dialog` to root `package.json` dependencies (exact version `1.1.18`)
  - [x] 1.2 Create `apps/web/src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge), the standard shadcn/ui utility
  - [x] 1.3 Run `yarn install` to update lockfile

- [x] Task 2: Create the Sheet (drawer) UI primitive (AC: 5)
  - [x] 2.1 Create `apps/web/src/components/ui/sheet.tsx` — shadcn/ui Sheet pattern built on `@radix-ui/react-dialog`; exports `Sheet`, `SheetTrigger`, `SheetContent`, `SheetClose`; `SheetContent` accepts `side` prop (default `"left"`); includes overlay, focus trap (Radix handles), Escape dismiss, click-outside dismiss
  - [x] 2.2 Create `apps/web/src/components/ui/sheet.test.tsx` — unit tests: renders trigger, opens content on trigger click, closes on Escape, closes on overlay click

- [x] Task 3: Create the SideNavigation component (AC: 1, 4)
  - [x] 3.1 Create `apps/web/src/components/shell/SideNavigation.tsx` — Client Component (`'use client'`); receives `user` prop (`{ name?: string | null; email?: string | null }`); uses `usePathname()` for active state; renders: product wordmark, "New Conversation" button (Link to `/conversations/new`), conversation list section (empty — no conversations exist yet), separator, Project Map link, Artifact Browser link, bottom-pinned Settings avatar-circle; active item: `surface-raised` bg + `text-1`; inactive: `text-2`
  - [x] 3.2 Create `apps/web/src/components/shell/SideNavigation.test.tsx` — unit tests: renders all nav items, active item highlighted based on pathname, avatar shows correct initials, "New Conversation" button links to `/conversations/new`, conversation list section exists but is empty

- [x] Task 4: Create the AppShell component with mobile drawer and route focus management (AC: 2, 4, 5)
  - [x] 4.1 Create `apps/web/src/components/shell/AppShell.tsx` — Client Component; receives `user` and `children` props; renders: desktop sidebar (`hidden lg:flex`, 240px fixed, contains `SideNavigation`), mobile hamburger button (`lg:hidden`) + Sheet drawer (contains `SideNavigation`), main content area (`flex-1 overflow-hidden`); includes `RouteFocusManager` logic (on `usePathname()` change, focus the main content's `h1` or first interactive element)
  - [x] 4.2 Create `apps/web/src/components/shell/AppShell.test.tsx` — unit tests: renders children in main area, desktop sidebar hidden on mobile viewport (via class assertion), hamburger button visible on mobile, drawer opens on hamburger click, drawer closes on Escape, drawer closes on pathname change (mock `usePathname` to return different values)

- [x] Task 5: Create the Breadcrumb component (AC: 3)
  - [x] 5.1 Create `apps/web/src/components/shell/Breadcrumb.tsx` — simple component (no client interactivity needed); renders `<nav aria-label="Breadcrumb">` with a Link to `/project-map` labeled "← Project Map"
  - [x] 5.2 Create `apps/web/src/components/shell/Breadcrumb.test.tsx` — unit test: renders link to `/project-map` with correct label and aria-label

- [x] Task 6: Update the dashboard layout to render the shell (AC: 1, 2)
  - [x] 6.1 Update `apps/web/src/app/(dashboard)/layout.tsx` — after auth check, query `RepoConnection` by `userId`; if no repo connection, render `<>{children}</>` (pre-app shell — onboarding); if repo connection exists, render `<AppShell user={session.user}>{children}</AppShell>`
  - [x] 6.2 Update `apps/web/src/app/(dashboard)/layout.test.tsx` — add tests: no repo connection renders children without AppShell, with repo connection renders AppShell with user data; mock `@/lib/prisma` for `repoConnection.findUnique`

- [x] Task 7: Create placeholder pages for shell-dependent routes (AC: 1, 2, 3)
  - [x] 7.1 Create `apps/web/src/app/(dashboard)/project-map/page.tsx` — depth-0 page (no breadcrumb); Server Component; renders `<h1>Project Map</h1>` + empty-state text "Start your first conversation to create an artifact." (per EXPERIENCE.md Voice and Tone — prompt action, don't describe absence; actual artifact list comes in Story 2.2); three-zone scroll structure (fixed header, scrolling content)
  - [x] 7.2 Create `apps/web/src/app/(dashboard)/artifacts/page.tsx` — depth-1 page; renders `<Breadcrumb />` + `<h1>Artifact Browser</h1>` + empty-state text "Start a conversation to create your first artifact."; three-zone scroll structure
  - [x] 7.3 Create `apps/web/src/app/(dashboard)/settings/page.tsx` — depth-1 page; renders `<Breadcrumb />` + `<h1>Settings</h1>` + "Coming soon" text
  - [x] 7.4 Create `apps/web/src/app/(dashboard)/conversations/new/page.tsx` — depth-1 page; renders `<Breadcrumb />` + `<h1>New Conversation</h1>` + placeholder text "Press `/` to browse available skills, or type a message to start." (actual chat UI comes in Story 3.1+)

- [x] Task 8: Update global CSS for accessibility floor (AC: 4)
  - [x] 8.1 Update `apps/web/src/app/global.css` — add `*:focus { outline: none; }` (Tailwind `focus:ring-*` classes provide the visible ring); add `@media (prefers-reduced-motion: reduce)` block to disable animations/transitions; ensure `h1` elements in main content get `tabindex` via `RouteFocusManager` (JS, not CSS)

- [x] Task 9: E2E tests for the app shell (AC: 1, 2, 3, 4, 5)
  - [x] 9.1 Create `playwright/e2e/shell/app-shell.spec.ts` — E2E tests using `withRepoConnection` fixture: side nav visible with all items, active nav item highlighted, keyboard tab order, breadcrumb on depth-1 pages, focus moves to h1 on route change, mobile drawer (hamburger visible at tablet viewport, opens/closes on Escape, closes on nav link click — verifies drawer is not visible after navigation), side nav NOT shown on onboarding page (no repo connection)

- [x] Task 10: Verify build, lint, and tests
  - [x] 10.1 Run `yarn nx run-many --target=lint --all --parallel=4` — confirm 0 lint errors
  - [x] 10.2 Run `yarn nx run-many --target=test --all --parallel=4 --passWithNoTests` — confirm all tests pass
  - [x] 10.3 Run `yarn nx build web` — confirm production build succeeds

## Dev Notes

### Architecture Context

This story delivers **UX-DR2** (Side Navigation), **UX-DR13** (three-zone scroll), **UX-DR16** (accessibility floor), **UX-DR17** (responsive behavior), and **UX-DR20** (breadcrumb nav) — all delivered once as the persistent app shell, inherited by every later epic's pages. The architecture (lines 514, 648–660) specifies:

- **`(dashboard)/layout.tsx`** is the authenticated shell — "authenticated shell, nav, repo connection status."
- **`apps/web` components organized by feature, flat hierarchy** — `components/shell/` for shell components, `components/ui/` for shadcn/ui primitives.
- **shadcn/ui (Radix + Tailwind)** as the frontend component library — utility deps (`class-variance-authority`, `clsx`, `tailwind-merge`) are already installed; `lucide-react` is installed for icons.
- **No global client-state library** — local React state for ephemeral UI only (mobile drawer open/closed, etc.).
- **Server Components/Server Actions read Postgres directly** — the layout queries `RepoConnection` to decide shell visibility.

### What Already Exists (from Stories 1.1–1.7)

**Story 1.1 (Scaffold):**
- Tailwind config (`apps/web/tailwind.config.ts`) with ALL DESIGN.md tokens already mapped: colors (`bg`, `surface`, `surface-raised`, `border`, `border-subtle`, `text-1/2/3`, `accent`, `accent-hover`, `accent-fg`, `positive`, `caution`, `negative`, `overlay`), fonts (`Inter`, `JetBrains Mono`), font sizes (`xs`–`2xl`), border radii (`sm`–`full`).
- Fonts loaded via `next/font/google` in `apps/web/src/app/layout.tsx` (`Inter` + `JetBrains_Mono` with CSS variables `--font-inter` / `--font-jetbrains-mono`).
- Root layout sets `<html lang="en" className="dark ...">` — dark mode is always on.
- `global.css` has `@tailwind base/components/utilities` and base body styles (`bg-bg text-text-1 font-sans`).
- Package manager is **Yarn 4.17.0** — use `yarn nx` for all commands.
- Next.js version is **16.1.6** (not 15) — async props must be awaited; `usePathname()` works as expected in Client Components.

**Story 1.2 (Sign In):**
- Auth.js v5 wired in `apps/web/src/lib/auth.ts` and `apps/web/src/lib/auth.config.ts`.
- `auth()` returns `Promise<Session | null>` — `session.user` has `{ name?, email?, image? }`, `session.userId` is `string | undefined`.
- Sign-in page at `/sign-in` — pre-app shell (no side nav).

**Story 1.3 (Connect Repository):**
- `apps/web/src/app/page.tsx` — root page: calls `auth()`, redirects to `/project-map` (if repo connected) or `/onboarding`.
- `apps/web/src/app/(dashboard)/onboarding/page.tsx` — onboarding page: calls `auth()`, redirects to `/project-map` if `RepoConnection` exists.
- `RepoConnection` model in Prisma schema (`libs/database-schemas/src/prisma/schema.prisma`) — `userId` (unique), `repoUrl`, `credentialHealth`.

**Story 1.7 (Access Control):**
- `apps/web/src/app/(dashboard)/layout.tsx` — defense-in-depth auth guard: calls `auth()`, redirects to `/sign-in` if no `session?.user`. Currently returns `<>{children}</>` with no shell.
- `apps/web/src/app/(dashboard)/layout.test.tsx` — tests for the auth guard (mocks `next/navigation` redirect and `@/lib/auth`).

**E2E test infrastructure:**
- `playwright/auth.setup.ts` — synthetic session via JWT minting with `AUTH_SECRET`.
- `playwright/support/custom-fixtures.ts` — `withRepoConnection` fixture: seeds a `RepoConnection` row for the test user, cleans up after.
- `playwright/support/merged-fixtures.ts` — merged test fixtures (auth, intercept, etc.).
- `playwright.config.ts` — projects: `setup` (auth) + `chromium` (with storage state).

### What This Story Adds

1. **`cn()` utility** — standard shadcn/ui class merge helper (`clsx` + `tailwind-merge`).
2. **Sheet UI primitive** — shadcn/ui Sheet pattern built on `@radix-ui/react-dialog`, used for the mobile drawer. Provides focus trap, Escape dismiss, click-outside dismiss, focus return — all handled by Radix.
3. **SideNavigation component** — the 240px fixed side nav with wordmark, New Conversation button, conversation list (empty for now), nav links, and Settings avatar.
4. **AppShell component** — wraps all post-onboarding pages; renders desktop sidebar + mobile drawer + main content area; handles route focus management.
5. **Breadcrumb component** — "← Project Map" link for depth-1 pages.
6. **Placeholder pages** — `/project-map`, `/artifacts`, `/settings`, `/conversations/new` — minimal pages that render within the shell, enabling the shell to be tested end-to-end. Actual page content comes in Epics 2 and 3.
7. **Updated dashboard layout** — conditionally renders the shell based on whether the user has a connected repository.
8. **Global CSS accessibility updates** — focus ring baseline, `prefers-reduced-motion` handling.

### Critical: Do Not Reinvent

- **DO NOT** create a new auth system — Auth.js v5 is wired in `apps/web/src/lib/auth.ts`. The layout already calls `auth()` and redirects to `/sign-in`.
- **DO NOT** add a Conversation model to the Prisma schema — that is Epic 3's job (Story 3.2/3.5). The side nav's conversation list section is empty for now (no conversations exist). The component structure should accept conversation data as a prop when Epic 3 adds it, but for Story 1.8, pass an empty list or omit the query entirely.
- **DO NOT** implement the actual Project Map content (artifact list), Artifact Browser content (Markdown rendering), or Conversation UI (chat, streaming, tool pills) — those are Epics 2 and 3. Story 1.8 creates placeholder pages only.
- **DO NOT** install the full shadcn/ui CLI — manually create the `cn` utility and the Sheet component following the shadcn/ui source pattern. Only install `@radix-ui/react-dialog` as a dependency.
- **DO NOT** use `focus-visible:` for the shell's focus rings — the UX spec (UX-DR16) says "never suppressed on click." Use `focus:` (not `focus-visible:`) so the ring appears on both keyboard and click focus. The existing `submit-button.tsx` uses `focus-visible:` — that is a pre-existing inconsistency; do not change it in this story, but use `focus:` for new shell components.
- **DO NOT** add client-side state management libraries — the architecture mandates "no global client-state library." Use local React state (`useState`) for the mobile drawer open/closed state.
- **DO NOT** add automatic client-side revalidation or React Query/SWR — the architecture mandates manual browser reload as the refresh mechanism.
- **DO NOT** create animated page transitions — UX-DR20 explicitly says "no animated page/route transitions in MVP."
- **DO NOT** show the side nav on the onboarding page — EXPERIENCE.md specifies onboarding as a "pre-app shell" surface without side navigation. The layout conditionally renders the shell based on repo connection status.
- **DO NOT** modify the middleware matcher or `authorized` callback — those are correct from Stories 1.2/1.7.

### Component Specifications

#### SideNavigation (`components/shell/SideNavigation.tsx`)

**Client Component** (`'use client'`) — needs `usePathname()` for active state.

**Props:**
```typescript
interface SideNavigationProps {
  user: { name?: string | null; email?: string | null };
}
```

**Structure (top to bottom, per DESIGN.md "Side Navigation" spec):**
1. **Product wordmark** — "bmad-easy" text, 48px tall header zone, `text-1`, `semibold`
2. **"New Conversation" button** — `<Link href="/conversations/new">`; styled as outlined button: `accent` border, `accent` text, `md` radius; full-width within nav padding
3. **Conversation list** — last 5 conversations; `sm` text, `text-2` color; active entry: `surface-raised` bg + `text-1`; truncated with ellipsis. **For Story 1.8: this section is empty (no Conversation model exists). Render the section container but with no items.**
4. **Separator** — `border-subtle` horizontal line, 16px vertical margin
5. **Project Map link** — `<Link href="/project-map">`; active when `pathname === '/project-map'` or `pathname === '/'`
6. **Artifact Browser link** — `<Link href="/artifacts">`; active when `pathname.startsWith('/artifacts')`
7. **Bottom-pinned Settings avatar** — `<Link href="/settings">`; 32px circle, `accent` fill, user initials in `accent-fg`, `xs` `semibold`; `aria-label` with user's name (fallback to email, then "User") + "Settings"

**Active state logic:**
- Project Map: active when `pathname === '/' || pathname === '/project-map'`
- Artifact Browser: active when `pathname.startsWith('/artifacts')`
- Settings: active when `pathname === '/settings'`
- Conversation items: active when `pathname === '/conversations/:id'` (no items for now)

**Avatar initials derivation:**
```typescript
function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
```

**Styling (from DESIGN.md):**
- Container: `w-[240px] h-full bg-surface border-r border-border-subtle flex flex-col`
- Wordmark: `h-12 flex items-center px-4 text-text-1 font-semibold`
- New Conversation button: `mx-3 px-3 py-2 border border-accent text-accent rounded-md text-sm font-medium hover:bg-accent/10 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`
- Nav items (inactive): `px-4 py-2 text-sm text-text-2 rounded-md hover:bg-surface-raised transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface`
- Nav items (active): `px-4 py-2 text-sm text-text-1 bg-surface-raised rounded-md`
- Avatar: `w-8 h-8 rounded-full bg-accent text-accent-fg flex items-center justify-center text-xs font-semibold`

#### AppShell (`components/shell/AppShell.tsx`)

**Client Component** (`'use client'`) — needs `usePathname()` for route focus management, `useState` for mobile drawer.

**Props:**
```typescript
interface AppShellProps {
  user: { name?: string | null; email?: string | null };
  children: React.ReactNode;
}
```

**Structure:**
```tsx
<div className="flex h-screen overflow-hidden bg-bg">
  {/* Desktop sidebar — always visible on 1024px+ */}
  <aside className="hidden lg:flex w-[240px] flex-shrink-0">
    <SideNavigation user={user} />
  </aside>

  {/* Mobile hamburger + drawer — visible on 768-1023px */}
  <div className="lg:hidden">
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetTrigger asChild>
        <button aria-label="Open navigation" className="...">
          <Menu className="h-6 w-6" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[240px] bg-surface">
        <SideNavigation user={user} />
      </SheetContent>
    </Sheet>
  </div>

  {/* Main content area */}
  <main ref={mainRef} className="flex-1 overflow-hidden flex flex-col">
    {children}
  </main>
</div>
```

**Route focus management + drawer close on navigation:**
```tsx
const pathname = usePathname();
const mainRef = useRef<HTMLElement>(null);
const [drawerOpen, setDrawerOpen] = useState(false);

useEffect(() => {
  // Close mobile drawer on route change so focus can move to the new page
  setDrawerOpen(false);

  const main = mainRef.current;
  if (!main) return;
  const h1 = main.querySelector('h1');
  if (h1) {
    h1.setAttribute('tabindex', '-1');
    h1.focus({ preventScroll: true });
  } else {
    const firstInteractive = main.querySelector('button, a, input, [tabindex]:not([tabindex="-1"])');
    (firstInteractive as HTMLElement)?.focus({ preventScroll: true });
  }
}, [pathname]);
```

**Mobile hamburger button position:** Fixed top-left of the content area, visible only on `lg:hidden` (below 1024px). The hamburger button should be inside the main content area's header, not floating.

**Important:** The mobile drawer (Sheet) uses Radix Dialog which provides: focus trap, Escape dismiss, click-outside dismiss, focus return to trigger. Do NOT reimplement these — Radix handles them. The drawer MUST be controlled (`open`/`onOpenChange` with `useState`) so it can be closed on route change — an uncontrolled Sheet would stay open after navigation, trapping focus and obscuring the new page.

#### Breadcrumb (`components/shell/Breadcrumb.tsx`)

Simple component (can be Server Component — no client interactivity needed):

```tsx
import Link from 'next/link';

export function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="flex-shrink-0 px-8 py-4">
      <Link
        href="/project-map"
        className="text-sm text-text-2 hover:text-text-1 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg"
      >
        ← Project Map
      </Link>
    </nav>
  );
}
```

#### Sheet (`components/ui/sheet.tsx`)

shadcn/ui Sheet pattern built on `@radix-ui/react-dialog`. Follow the standard shadcn/ui source code for Sheet. Key exports: `Sheet` (Root), `SheetTrigger`, `SheetContent`, `SheetClose`. `SheetContent` accepts `side` prop (`"left"` | `"right"` | `"top"` | `"bottom"`, default `"left"`). Includes overlay backdrop (`overlay` color). Uses `cn()` for conditional classes.

**Do NOT copy the entire shadcn/ui CLI output** — write the component manually following the pattern. The essential structure:

```tsx
'use client';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: 'left' | 'right' | 'top' | 'bottom' }
>(({ side = 'left', className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 bg-surface shadow-lg transition ease-in-out',
        side === 'left' && 'inset-y-0 left-0 h-full w-[240px] border-r border-border-subtle',
        // ... other sides
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 ...">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';
```

#### Placeholder Pages

Each placeholder page follows the three-zone scroll structure:

```tsx
// Example: project-map/page.tsx (depth-0, no breadcrumb)
export default async function ProjectMapPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0 px-8 py-6">
        <h1 className="text-xl font-semibold text-text-1">Project Map</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <p className="text-text-2 text-sm">
          Start your first conversation to create an artifact.
        </p>
      </div>
    </div>
  );
}
```

Depth-1 pages (artifacts, settings, conversations/new) include `<Breadcrumb />` in the header before the `<h1>`.

### Accessibility Floor (UX-DR16) — Implementation Details

| Requirement | Implementation |
|---|---|
| 2px accent focus ring, 2px offset, never suppressed on click | Use `focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg` (NOT `focus-visible:`) on all interactive elements. Add `*:focus { outline: none; }` in global.css to remove default browser outlines. |
| Route change moves focus to `h1` or first interactive element | `RouteFocusManager` logic in `AppShell.tsx` — `useEffect` on `usePathname()` change, sets `tabindex={-1}` on `h1` and focuses it. |
| Modals trap focus and return focus to trigger on close | Radix Dialog (Sheet) handles this automatically. No custom implementation needed. |
| State never signaled by color alone | Nav items use `text-1`/`text-2` (color) + `bg-surface-raised` (background) + font weight differences. Avatar has initials (text). |
| `aria-live="polite"` on chat message stream and working tree indicator | These components don't exist yet (Epic 3). Do NOT add empty aria-live regions. |
| `role="status"` on loading/save-confirmation messages | No loading/save-confirmation states in this story. Do NOT add empty role="status" regions. |
| `prefers-reduced-motion` for streaming cursor and thinking indicator | These don't exist yet (Epic 3). Add the global `@media (prefers-reduced-motion: reduce)` reset in global.css for the drawer transition and any future animations. |
| `aria-label`s on avatar circles and icon-only buttons | Avatar: `aria-label="${user.name ?? user.email ?? 'User'} — Settings"`. Hamburger: `aria-label="Open navigation"`. Close button: `sr-only` "Close". |

### Responsive Behavior (UX-DR17) — Implementation Details

| Viewport | Behavior | CSS |
|---|---|---|
| 1024px+ | Full desktop layout; side nav always visible | Desktop sidebar: `hidden lg:flex` |
| 768–1023px | Side nav collapses to off-canvas drawer; hamburger button appears | Hamburger + Sheet: `lg:hidden` |
| <768px | Out of scope for MVP — no special handling | Not styled; may break but accepted |

The hamburger button is rendered in the main content area's top-left, visible only below `lg` (1024px). The Sheet drawer slides in from the left, containing the same `SideNavigation` component.

**Drawer behavior (provided by Radix Dialog + controlled state):**
- Opens on hamburger click
- Focus traps inside the drawer
- Escape key dismisses
- Click on overlay backdrop dismisses
- Focus returns to hamburger button on close
- Closes automatically on route change (controlled `open` state, reset in `useEffect` on `pathname` change) — prevents the drawer from trapping focus after navigation

### Three-Zone Scroll Model (UX-DR13) — Implementation Details

The shell uses flexbox with `overflow-hidden` at the container level:

```
┌─────────────────────────────────────────────┐
│ AppShell (flex h-screen overflow-hidden)     │
│ ┌──────────┬──────────────────────────────┐  │
│ │ Side Nav │ Main Content (flex-1)        │  │
│ │ (fixed)  │ ┌────────────────────────┐  │  │
│ │ 240px    │ │ Header (flex-shrink-0)  │  │  │
│ │          │ ├────────────────────────┤  │  │
│ │          │ │ Content (flex-1         │  │  │
│ │          │ │ overflow-y-auto)        │  │  │
│ │          │ │                         │  │  │
│ │          │ └────────────────────────┘  │  │
│ └──────────┴──────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

- **Side nav:** `w-[240px] flex-shrink-0` — never scrolls, always visible
- **Page header:** `flex-shrink-0` — fixed at top of content area (breadcrumb + h1)
- **Content pane:** `flex-1 overflow-y-auto` — scrolls independently

Each placeholder page implements this internal structure. Later epic pages (Project Map, Conversation, Artifact Browser) will follow the same pattern.

### Dashboard Layout — Conditional Shell Rendering

The layout queries `RepoConnection` to decide whether to show the shell:

```typescript
// apps/web/src/app/(dashboard)/layout.tsx
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  const userId = session.userId;
  if (!userId) {
    redirect('/sign-in');
  }

  const repoConnection = await getPrisma().repoConnection.findUnique({
    where: { userId },
  });

  // Pre-app shell: no repo connection — render without side navigation (onboarding)
  if (!repoConnection) {
    return <>{children}</>;
  }

  // App shell: side navigation + content area
  return <AppShell user={session.user}>{children}</AppShell>;
}
```

This means:
- `/onboarding` (no repo connection) → renders without shell (pre-app shell)
- `/project-map`, `/artifacts`, `/settings`, `/conversations/new` (repo connection exists) → renders with shell
- If a user with a repo connection visits `/onboarding`, the onboarding page redirects to `/project-map` (existing behavior) — the redirect happens in the page, so the shell never renders around a redirecting page

### Project Structure Notes

```
apps/web/src/
  lib/
    utils.ts                                      ← NEW (cn utility)
  components/
    ui/
      sheet.tsx                                   ← NEW (shadcn/ui Sheet primitive)
      sheet.test.tsx                              ← NEW
    shell/
      SideNavigation.tsx                          ← NEW
      SideNavigation.test.tsx                     ← NEW
      AppShell.tsx                                ← NEW
      AppShell.test.tsx                           ← NEW
      Breadcrumb.tsx                              ← NEW
      Breadcrumb.test.tsx                         ← NEW
    icons/
      github-icon.tsx                             ← UNCHANGED
    onboarding/
      RepositoryUrlForm.tsx                       ← UNCHANGED
  app/
    (dashboard)/
      layout.tsx                                  ← UPDATE (add conditional shell)
      layout.test.tsx                             ← UPDATE (add shell tests)
      onboarding/
        page.tsx                                  ← UNCHANGED
      project-map/
        page.tsx                                  ← NEW (placeholder, depth-0)
      artifacts/
        page.tsx                                  ← NEW (placeholder, depth-1)
      settings/
        page.tsx                                  ← NEW (placeholder, depth-1)
      conversations/
        new/
          page.tsx                                ← NEW (placeholder, depth-1)
    layout.tsx                                    ← UNCHANGED
    global.css                                    ← UPDATE (accessibility floor CSS)
    page.tsx                                      ← UNCHANGED
    sign-in/
      page.tsx                                    ← UNCHANGED
  tailwind.config.ts                              ← UNCHANGED (tokens already correct)
  next.config.js                                  ← UNCHANGED
```

**Naming convention:** Component files use PascalCase (`SideNavigation.tsx`) per architecture convention. Non-component files use kebab-case. Test files match their source file name with `.test.tsx`/`.spec.ts` suffix, co-located with source.

**E2E test:**
```
playwright/e2e/shell/
  app-shell.spec.ts                               ← NEW
```

### Dependencies

**New dependency to install:**
- `@radix-ui/react-dialog` — exact version `1.1.18`. Used for the Sheet (mobile drawer) component. Provides focus trap, Escape dismiss, click-outside dismiss, focus return — all required by UX-DR16.

**Already installed (do NOT reinstall):**
- `lucide-react` (`^1.20.0`) — icons (Menu, X)
- `clsx` (`^2.1.1`) — class name composition (used by `cn`)
- `tailwind-merge` (`^3.6.0`) — Tailwind class deduplication (used by `cn`)
- `class-variance-authority` (`^0.7.1`) — variant management (available if needed)

### Testing Requirements

**Unit tests (co-located with source):**
- `SideNavigation.test.tsx` — renders all nav items, active state based on pathname, avatar initials, "New Conversation" link target, conversation list section exists (empty)
- `AppShell.test.tsx` — renders children, desktop sidebar class assertion, hamburger button present, drawer open/close, drawer closes on pathname change
- `Breadcrumb.test.tsx` — renders link to `/project-map` with "← Project Map" text and `aria-label="Breadcrumb"`
- `sheet.test.tsx` — renders trigger/content, opens on trigger click, closes on Escape
- `layout.test.tsx` (updated) — no repo connection renders without AppShell, with repo connection renders AppShell

**Unit test patterns (from previous stories):**
- `@jest-environment node` directive at top of server component test files
- Mock `@/lib/auth` and `@/lib/prisma` at module level using `jest.mock()`
- Mock `next/navigation` for `redirect` (throw `NEXT_REDIRECT` in mock)
- Use `jest.clearAllMocks()` in `beforeEach`
- For Client Components: use `@jest-environment jsdom` and `@testing-library/react`
- Mock `next/navigation`'s `usePathname` in Client Component tests

**E2E tests (`playwright/e2e/shell/app-shell.spec.ts`):**
- Use `withRepoConnection` fixture for authenticated user with repo connection
- Test: side nav visible with wordmark, New Conversation button, Project Map link, Artifact Browser link, Settings avatar
- Test: active nav item highlighted on `/project-map` vs `/artifacts`
- Test: keyboard tab order — side nav before main content
- Test: breadcrumb "← Project Map" visible on `/artifacts` and `/settings`
- Test: no breadcrumb on `/project-map`
- Test: focus moves to `h1` on route change
- Test: side nav NOT visible on `/onboarding` (no repo connection — use authenticated `page` fixture without `withRepoConnection`)
- Test: mobile drawer — set viewport to 900x800, hamburger visible, drawer opens on click, closes on Escape, closes on nav link click
- Test: focus ring visible on focused elements

### Integration Points

- **Consumed by all later epics:** Every page in Epics 2 and 3 inherits the `(dashboard)/layout.tsx` shell. The three-zone scroll pattern, accessibility floor, and responsive behavior are established here and inherited.
- **Consumed by Story 2.2 (Project Map):** The `/project-map` placeholder page created here will be replaced with the actual Project Map content in Story 2.2.
- **Consumed by Story 2.4 (Artifact Browser):** The `/artifacts` placeholder page will be replaced with the actual Artifact Browser content.
- **Consumed by Story 3.1 (Conversation provisioning):** The `/conversations/new` placeholder will be replaced with the actual conversation UI. The "New Conversation" button in the side nav already links to `/conversations/new`.
- **Consumed by Story 3.2 (Slash command picker):** The conversation list in the side nav will be populated when conversations are created. The `SideNavigation` component structure should accept conversation data as a prop (or query it in the layout) when Epic 3 adds the Conversation model.
- **Settings page:** The `/settings` placeholder ("Coming soon") is the final state for MVP — no further stories implement Settings content.

### Known Issues (Do NOT Fix in This Story)

1. **No Conversation model** (deferred to Epic 3): The side nav's conversation list section is empty. When Epic 3 adds the `Conversation` model to the Prisma schema, the layout should query the last 5 conversations and pass them to `SideNavigation`.
2. **Fonts declared but not loaded via `<link>`** (deferred-work.md line 17): Inter and JetBrains Mono are loaded via `next/font/google` which handles font loading. The deferred note about "no `<link>` in layout" is outdated — `next/font/google` is the correct approach.
3. **`/api/internal/test` middleware exemption** (deferred-work.md line 35): Do not modify the middleware matcher.
4. **Layout redirect omits `callbackUrl`** (deferred-work.md line 95): The layout's `redirect('/sign-in')` does not preserve `callbackUrl`. This is the spec-prescribed pattern; do not fix.
5. **`auth()` throwing in layout guard is unhandled** (deferred-work.md line 97): No try/catch around `await auth()`. Codebase-wide pattern; do not fix.

### Performance Requirements

- The `auth()` call in the layout is a JWT decode (no DB round-trip) — negligible overhead.
- The `repoConnection.findUnique` query is a single indexed lookup by `userId` — fast.
- The `SideNavigation` Client Component is lightweight — `usePathname()` is a client-side hook with no network calls.
- No animations or transitions that could impact performance (UX-DR20: no animated transitions).
- The mobile drawer uses CSS transitions for slide-in/out — respects `prefers-reduced-motion`.

## Previous Story Intelligence

**From Story 1.7 (Enforce Authenticated, Full Access for All MVP Users):**
- The `(dashboard)/layout.tsx` currently has the auth guard: `auth()` + `redirect('/sign-in')` if no `session?.user`. Story 1.8 extends this layout to add the shell.
- The layout test mocks `next/navigation` redirect (throws `NEXT_REDIRECT`) and `@/lib/auth`. Story 1.8's updated tests also need to mock `@/lib/prisma` for the `repoConnection.findUnique` query.
- E2E tests use the `withRepoConnection` fixture to seed a repo connection for the test user.
- 233 web tests pass as of Story 1.7 completion — this story's new tests will add to that count.

**From Story 1.6 (Detect and Recover from Credential Failures):**
- `auth()` returns `Promise<Session | null>` — always `await` it.
- `session.userId` is typed as `string | undefined` (optional) — always guard with `?.` or check.
- Tests mock `@/lib/auth`, `@/lib/prisma`, `@/lib/crypto` at the module level using `jest.mock()`.

**From Story 1.3 (Connect a Repository by URL):**
- `page.tsx` redirects to `/project-map` (if repo connected) or `/onboarding`.
- `onboarding/page.tsx` redirects to `/project-map` if `RepoConnection` exists.
- The `withRepoConnection` E2E fixture creates a `RepoConnection` row for the test user.

**From Story 1.2 (Sign In with GitHub):**
- E2E tests use `browser.newContext()` for unauthenticated tests and the shared `page` fixture (with storage state) for authenticated tests.
- The `playwright/auth.setup.ts` creates a synthetic session by minting a JWT with `AUTH_SECRET`.

**From Story 1.1 (Scaffold):**
- Package manager is **Yarn 4.17.0**, not pnpm. Use `yarn nx` for all commands.
- Next.js version is 16.1.6 (not 15) — async props must be awaited.
- Tests co-located with source (`*.test.ts` / `*.spec.ts` next to the file under test).
- Tailwind design tokens are already configured in `tailwind.config.ts` — do NOT modify.

**Key Learnings to Apply:**
- Follow the existing `auth()` + `redirect('/sign-in')` pattern in the dashboard layout.
- Mock `@/lib/prisma` at the module level in layout tests.
- Use `@jest-environment node` for Server Component tests, `@jest-environment jsdom` for Client Component tests.
- Use `@testing-library/react` for Client Component tests.
- Use `yarn nx` for all commands.

## Git Intelligence

**Recent commits relevant to this story:**
- `8a80189 feat(n8n-analyst): add agent skill for n8n execution and workflow analysis` — n8n agent skill (not directly relevant)
- `d4172c6 feat: stories 1.6 & 1.7 done` — Stories 1.6 and 1.7 complete; the dashboard layout auth guard is in place
- `30e5d48 ci: minor workflow updates` — CI config
- `438ecf2 chore: migrate package manager from pnpm to yarn` — **CRITICAL**: package manager is Yarn, not pnpm

**Key patterns from working tree:**
- Dashboard layout in `apps/web/src/app/(dashboard)/layout.tsx` — currently minimal auth guard, needs shell
- Root layout in `apps/web/src/app/layout.tsx` — fonts loaded, dark mode set
- Tailwind config in `apps/web/tailwind.config.ts` — all design tokens configured
- Components in `apps/web/src/components/` — organized by feature (onboarding/, icons/)
- E2E tests in `playwright/e2e/` — organized by feature (auth/, onboarding/, project-map/, conversation/)
- E2E fixtures in `playwright/support/` — `withRepoConnection` fixture available

## References

- **Epics Source**: `_bmad-output/planning-artifacts/epics.md` lines 396–425 — Story 1.8 ACs
- **PRD UX Design Requirements**: UX-DR2 (side navigation), UX-DR13 (three-zone scroll), UX-DR16 (accessibility floor), UX-DR17 (responsive behavior), UX-DR20 (breadcrumb nav) — epics.md lines 137–174
- **Architecture**: `_bmad-output/planning-artifacts/architecture.md` — Frontend Architecture (lines 304–312), Project Structure (lines 484–644), Component Boundaries (lines 657–660), Naming Patterns (lines 356–369), Structure Patterns (lines 371–376)
- **DESIGN.md**: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` — Side Navigation spec (lines 304–316), Avatar Circle (lines 376–378), Layout & Spacing (lines 251–268), Elevation (lines 271–284), Shapes (lines 288–298), Colors (lines 207–228), Typography (lines 233–248), Do's and Don'ts (lines 382–397)
- **EXPERIENCE.md**: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` — Information Architecture (lines 28–71), Scroll Model (lines 307–319), Accessibility Floor (lines 331–364), Navigation Transitions (lines 321–323), Back Navigation (lines 325–327)
- **Dashboard Layout**: `apps/web/src/app/(dashboard)/layout.tsx` — current auth guard (to be extended with shell)
- **Dashboard Layout Test**: `apps/web/src/app/(dashboard)/layout.test.tsx` — existing auth guard tests (to be extended)
- **Root Layout**: `apps/web/src/app/layout.tsx` — fonts, dark mode
- **Global CSS**: `apps/web/src/app/global.css` — Tailwind directives, base styles
- **Tailwind Config**: `apps/web/tailwind.config.ts` — design tokens (colors, fonts, sizes, radii)
- **Home Page**: `apps/web/src/app/page.tsx` — redirect logic (`/project-map` or `/onboarding`)
- **Onboarding Page**: `apps/web/src/app/(dashboard)/onboarding/page.tsx` — pre-app shell (no side nav)
- **Auth Implementation**: `apps/web/src/lib/auth.ts` — `auth()`, `signIn`, session shape
- **Prisma Client**: `apps/web/src/lib/prisma.ts` — `getPrisma()` singleton
- **Prisma Schema**: `libs/database-schemas/src/prisma/schema.prisma` — `User`, `RepoConnection` models (no `Conversation` model yet)
- **E2E Fixtures**: `playwright/support/custom-fixtures.ts` — `withRepoConnection` fixture
- **E2E Auth Setup**: `playwright/auth.setup.ts` — synthetic session
- **E2E Merged Fixtures**: `playwright/support/merged-fixtures.ts` — test + expect exports
- **Existing E2E Tests**: `playwright/e2e/auth/access-baseline.spec.ts` — authenticated access test patterns
- **Existing Component**: `apps/web/src/components/onboarding/RepositoryUrlForm.tsx` — client component patterns, focus ring style
- **Existing Component**: `apps/web/src/app/sign-in/submit-button.tsx` — `useFormStatus` pattern, button styling
- **Deferred Work**: `_bmad-output/implementation-artifacts/deferred-work.md` — known issues (do not fix in this story)
- **Story 1.7**: `_bmad-output/implementation-artifacts/1-7-enforce-authenticated-full-access-for-all-mvp-users.md` — previous story, layout auth guard patterns
- **Story 1.1**: `_bmad-output/implementation-artifacts/1-1-scaffold-the-platform-monorepo-and-ci-pipeline.md` — scaffold, Tailwind config, fonts

## Dev Agent Record

### Agent Model Used

glm-5.2 (neuralwatt/glm-5.2)

### Debug Log References

- Sheet overlay click test initially failed because Radix Dialog does not expose `data-radix-dialog-overlay` attribute; fixed by querying the overlay via its `bg-overlay` class.
- SideNavigation active-state test for "not highlighted" initially failed because `hover:bg-surface-raised` contains the substring `bg-surface-raised`; fixed by asserting on `text-text-2` (inactive) vs `text-text-1` (active) instead.
- Layout test for AppShell rendering initially failed because the mock component's `data-testid` is inside the function body, not on the outer element props; fixed by asserting on `result.props.user` and `result.props.children` directly.

### Completion Notes List

- **Task 1:** Installed `@radix-ui/react-dialog@1.1.18` via `yarn add`. Created `cn()` utility at `apps/web/src/lib/utils.ts` using `clsx` + `tailwind-merge`.
- **Task 2:** Created Sheet UI primitive at `apps/web/src/components/ui/sheet.tsx` following the shadcn/ui pattern. Exports `Sheet`, `SheetTrigger`, `SheetContent`, `SheetClose`. `SheetContent` accepts `side` prop (default `"left"`). Radix handles focus trap, Escape dismiss, click-outside dismiss, and focus return. 5 unit tests pass.
- **Task 3:** Created SideNavigation Client Component at `apps/web/src/components/shell/SideNavigation.tsx`. Renders wordmark, New Conversation button, empty conversation list section, separator, Project Map and Artifact Browser links, and bottom-pinned Settings avatar. Active state via `usePathname()`. Avatar initials derived from user name. 16 unit tests pass.
- **Task 4:** Created AppShell Client Component at `apps/web/src/components/shell/AppShell.tsx`. Renders desktop sidebar (`hidden lg:flex`), mobile hamburger + controlled Sheet drawer, and main content area. Route focus management via `useEffect` on `usePathname()` — focuses `h1` (with `tabindex=-1`) or first interactive element on route change. Drawer closes on route change via controlled `open` state. 7 unit tests pass.
- **Task 5:** Created Breadcrumb component at `apps/web/src/components/shell/Breadcrumb.tsx`. Server Component rendering `<nav aria-label="Breadcrumb">` with "← Project Map" link. 3 unit tests pass.
- **Task 6:** Updated dashboard layout at `apps/web/src/app/(dashboard)/layout.tsx` to query `RepoConnection` by `userId` and conditionally render `AppShell` (when repo connection exists) or bare children (pre-app shell / onboarding). Added `userId` guard. Updated layout tests with prisma mock and AppShell mock — 7 tests pass.
- **Task 7:** Created 4 placeholder pages: `/project-map` (depth-0, no breadcrumb), `/artifacts` (depth-1, with breadcrumb), `/settings` (depth-1, with breadcrumb), `/conversations/new` (depth-1, with breadcrumb). All follow three-zone scroll structure.
- **Task 8:** Updated `apps/web/src/app/global.css` with `*:focus { outline: none; }` (Tailwind `focus:ring-*` provides visible ring) and `@media (prefers-reduced-motion: reduce)` block to disable animations/transitions.
- **Task 9:** Created E2E test suite at `playwright/e2e/shell/app-shell.spec.ts` covering: side nav visibility, active nav highlighting, keyboard tab order, breadcrumb on depth-1 pages, no breadcrumb on depth-0, focus moves to h1 on route change, side nav not shown on onboarding, mobile drawer open/close/Escape/nav-link-click behavior.
- **Task 10:** Lint: 0 errors (12 pre-existing warnings). Tests: 267 web tests + 4 other project tests all pass. Build: production build succeeds with all new routes (`/artifacts`, `/conversations/new`, `/project-map`, `/settings`).

### File List

**New files:**
- `apps/web/src/lib/utils.ts` — `cn()` utility (clsx + tailwind-merge)
- `apps/web/src/components/ui/sheet.tsx` — shadcn/ui Sheet primitive
- `apps/web/src/components/ui/sheet.test.tsx` — Sheet unit tests
- `apps/web/src/components/shell/SideNavigation.tsx` — Side navigation component
- `apps/web/src/components/shell/SideNavigation.test.tsx` — SideNavigation unit tests
- `apps/web/src/components/shell/AppShell.tsx` — App shell with drawer and route focus management
- `apps/web/src/components/shell/AppShell.test.tsx` — AppShell unit tests
- `apps/web/src/components/shell/Breadcrumb.tsx` — Breadcrumb component
- `apps/web/src/components/shell/Breadcrumb.test.tsx` — Breadcrumb unit tests
- `apps/web/src/app/(dashboard)/project-map/page.tsx` — Project Map placeholder page
- `apps/web/src/app/(dashboard)/artifacts/page.tsx` — Artifact Browser placeholder page
- `apps/web/src/app/(dashboard)/settings/page.tsx` — Settings placeholder page
- `apps/web/src/app/(dashboard)/conversations/new/page.tsx` — New Conversation placeholder page
- `playwright/e2e/shell/app-shell.spec.ts` — E2E tests for the app shell

**Modified files:**
- `apps/web/src/app/(dashboard)/layout.tsx` — Added conditional shell rendering with RepoConnection query
- `apps/web/src/app/(dashboard)/layout.test.tsx` — Added shell rendering tests with prisma mock
- `apps/web/src/app/global.css` — Added focus outline reset and prefers-reduced-motion media query
- `package.json` — Added `@radix-ui/react-dialog` dependency
- `yarn.lock` — Updated lockfile

## Change Log

- 2026-07-01: Implemented Story 1.8 — persistent app shell with side navigation, three-zone scroll model, breadcrumb, accessibility floor, responsive mobile drawer, and placeholder pages for shell-dependent routes.
