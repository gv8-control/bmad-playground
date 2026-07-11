---
baseline_commit: a090cfc12bafcf803262a5317baa3226a59cae2d
---

# Story 2.3: Manually Refresh the Project Map

Status: done

## Story

As a user who just committed work elsewhere,
I want to manually refresh the Project Map,
so that I can see recently committed Artifacts without leaving the page.

## Acceptance Criteria

### AC-1: Manual refresh re-reads via mirroring mechanism with spinner (FR7)

**Given** the Project Map is visible
**When** the user activates the manual refresh control
**Then** `_bmad-output/` is re-read via the Story 2.1 mirroring mechanism (FR7)
**And** a refresh indicator (spinner replacing the refresh icon) is visible during the read

### AC-2: Refresh does not interrupt active Conversations

**Given** a refresh is in progress
**When** the user has an active Conversation open elsewhere
**Then** the refresh does not interrupt that Conversation

## Tasks / Subtasks

- [ ] Task 1: Create the `RefreshButton` component (AC: 1)
  - [ ] 1.1 Create `apps/web/src/components/project-map/RefreshButton.tsx` — a `'use client'` component. Imports: `useTransition` from `react`, `useRouter` from `next/navigation`, `RefreshCw` from `lucide-react` (already installed — used by `dialog.tsx`), `syncArtifactsAction` from `@/actions/artifacts.actions`
  - [ ] 1.2 Implement the click handler: `startTransition(async () => { try { await syncArtifactsAction(); } finally { router.refresh(); } })`. The `await syncArtifactsAction()` re-reads `_bmad-output/` from GitHub and upserts into Postgres (the Story 2.1 mirroring mechanism). The `router.refresh()` re-renders the Server Component with fresh Postgres data without a full browser reload. `isPending` from `useTransition` stays true through both the sync and the refresh (Next.js batches `router.refresh()` into the active transition). The `try/finally` ensures `router.refresh()` runs even if `syncArtifactsAction()` throws — `useTransition` swallows thrown errors (project-context rule: "wrap the call in try/catch"), so without `finally` a throw (e.g. `getPrisma().repoConnection.findUnique()` failing on a database connectivity error at `artifacts.actions.ts:20`) would silently skip the refresh and leave the user with no feedback. No user-facing error message is surfaced — the UX spec defines no "refresh failed" state (DP-5); if the database is down, `router.refresh()` triggers the Server Component's Prisma read which throws and Next.js renders the route's `error.tsx` boundary
  - [ ] 1.3 Render a `<button type="button" aria-label="Refresh Project Map">` containing the `RefreshCw` icon (16px, `text-text-2`). While `isPending`: add `animate-spin` to the icon, set `disabled` on the button. Styling: `p-1 rounded-md text-text-2 hover:text-text-1 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg disabled:opacity-50 disabled:pointer-events-none`
  - [ ] 1.4 Create `apps/web/src/components/project-map/RefreshButton.test.tsx` — co-located test using `@testing-library/react` with `jsdom` environment. Mock `@/actions/artifacts.actions` (`syncArtifactsAction`) and `next/navigation` (`useRouter`). Test: [P0] renders a button with `aria-label="Refresh Project Map"`; [P0] clicking calls `syncArtifactsAction`; [P0] button is disabled and icon has `animate-spin` while pending (use `mockImplementation(() => new Promise(() => undefined))` to keep pending — same pattern as `CredentialErrorBanner.test.tsx:78-91`); [P0] `router.refresh()` is called after sync resolves; [P1] `router.refresh()` is called even when sync returns an error result; [P1] `router.refresh()` is called even when sync throws (mock `syncArtifactsAction` with `mockRejectedValue(new Error('DB down'))` — verify `router.refresh()` still called via the `finally` block); [P1] button re-enables after sync resolves

- [ ] Task 2: Add `RefreshButton` to the Project Map page header (AC: 1)
  - [ ] 2.1 Update `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` — import `RefreshButton` from `@/components/project-map/RefreshButton`. Add `flex items-center gap-3` to the `<header>` className and render `<RefreshButton />` immediately after the `<h1>`. The header becomes: `<header className="flex-shrink-0 px-8 py-6 flex items-center gap-3">`. Do NOT change any other page logic — the data-fetching, sync-on-first-visit, credential banner, and artifact list rendering are all correct from Story 2.2
  - [ ] 2.2 Update `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` — add a `jest.mock` for `@/components/project-map/RefreshButton` as a render stub returning `'RefreshButton'` (same pattern as the existing `ArtifactCard` and `CredentialErrorBanner` mocks). Add one test: [P1] renders RefreshButton in the header

- [ ] Task 3: Verify lint, typecheck, and tests pass (AC: all)
  - [ ] 3.1 Run `yarn nx lint web` — 0 new errors/warnings (baseline: 0 errors, 9 warnings per Story 2.2 completion)
  - [ ] 3.2 Run typecheck — `npx tsc --noEmit -p apps/web/tsconfig.json` (the `typecheck` target is not configured in `project.json` — this is a known issue from Story 2.2)
  - [ ] 3.3 Run `yarn nx test web` — all new and existing tests pass (baseline: 383 tests per Story 2.2)

## Dev Notes

### Decision Records

**Decision (DP-4):** Validation found the "What Already Exists" section enumerated only 4 of 5 `SyncErrorCode` values — `NO_REPO_CONNECTION` (returned by `syncArtifactsAction()` at `artifacts.actions.ts:25` when the repo connection is missing) was omitted. This is a descriptive inaccuracy only: Task 1.2 already treats all results uniformly (`await syncArtifactsAction(); router.refresh();`), so no code-path change was needed. Corrected the enumeration and added a note that `NO_REPO_CONNECTION` is handled by the page's existing redirect-to-`/onboarding` logic on `router.refresh()`. Artifact-only change, no production behavior change.

**Decision (DP-2):** Architecture's `RefreshButton.tsx # FR-7 — triggers full browser reload` (architecture.md:499) contradicts Story 2.3 AC-1's "refresh indicator (spinner replacing the refresh icon) is visible during the read." The semantic intent is an in-page refresh: call `syncArtifactsAction()` (the Story 2.1 mirroring mechanism) then `router.refresh()` to re-render the Server Component with fresh Postgres data — the spinner shows during the sync. A full browser reload would show the `loading.tsx` skeleton, not a spinner on the refresh button. The architecture's "full browser reload" comment predates Story 2.1's mirroring mechanism (which introduced `syncArtifactsAction()` as the re-read path). The `router.refresh()` is user-triggered (manual), not automatic — the "no automatic client-side revalidation" rule (architecture.md Frontend Architecture #5) targets background polling and SSE/Postgres view disagreement, neither of which applies to the Project Map (no SSE, pure Postgres read). Architecture.md:499 amended to reflect the in-page sync approach.

**Decision (DP-2):** Validation found Task 1.2's click handler (`await syncArtifactsAction(); router.refresh();`) contradicts the project-context rule: "useTransition swallows thrown errors from the Server Action — wrap the call in try/catch." `syncArtifactsAction()` catches `CredentialFailureError` and `RateLimitError` internally, but `getPrisma().repoConnection.findUnique()` at `artifacts.actions.ts:20` is uncaught — a database connectivity failure would throw, `useTransition` would swallow it, and `router.refresh()` would silently never run. The semantic intent of the project-context rule is "don't silently swallow errors." Fix: wrap in `try/finally` so `router.refresh()` runs regardless. The "surface a user-facing message in state" part of the rule is not followed — the UX spec defines no "refresh failed" state (DP-5); if the database is down, `router.refresh()` triggers the Server Component's Prisma read which throws and Next.js renders `error.tsx`. Task 1.2 handler and Task 1.4 tests updated; Refresh Flow section updated.

**Decision (DP-4):** Validation found the "Previous Story Intelligence" section described Story 2.1's `scannedPaths` as "initialized before fetch loop." The actual code (`artifacts.ts:226-234`) computes `scannedFiles` first, runs the fetch loop (`Promise.allSettled`), then initializes `scannedPaths = scannedFiles.map(...)` after the loop but before the transaction. The safety property the description was reaching for — `scannedPaths` is built from the source listing, not from fetch results — is correct and is what matters for the stale-cleanup `deleteMany`. Corrected the wording to describe the actual invariant. Artifact-only change, no production behavior change.

### How AC-2 Is Satisfied (No Special Code Needed)

AC-2 ("refresh does not interrupt active Conversations") is satisfied by the existing architecture's separation of concerns — no special code is required:

- `syncArtifactsAction()` is a Server Action in `apps/web` that reads from the GitHub Contents API and writes to Postgres. It has **no interaction** with `apps/agent-be`, sandboxes, or conversations (architecture.md: "apps/web never calls apps/agent-be server-to-server"; "Project Map and Artifact Browser must remain functional during a Daytona outage — pure Postgres/git reads with no sandbox dependency")
- `router.refresh()` re-renders only the current route's Server Components (the Project Map page). It does not affect other browser tabs or the Conversation page's SSE connection
- The GitHub API calls in `syncArtifacts()` use the user's OAuth token with `AbortSignal.timeout(10_000)` — a separate HTTP request that does not touch any sandbox or conversation infrastructure

No test is needed for AC-2 — it's an architectural invariant, not a code path to verify.

### What Already Exists (Do Not Recreate)

- **`syncArtifactsAction()`** (`apps/web/src/actions/artifacts.actions.ts`) — the Server Action that re-reads `_bmad-output/` from GitHub and upserts into Postgres. Handles auth, token resolution, error classification (`NO_CREDENTIAL`, `NO_REPO_CONNECTION`, `RATE_LIMITED`, `NOT_FOUND`, `UNKNOWN`), and credential health marking. Story 2.3 calls this directly from the RefreshButton — do not wrap or duplicate it
- **`syncArtifacts()`** (`apps/web/src/lib/artifacts.ts`) — the underlying lib function. Do NOT call this directly — call `syncArtifactsAction()` which handles auth and error classification
- **Project Map page** (`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx`) — Server Component from Story 2.2. Reads artifacts from Postgres, checks credential health, syncs on first visit when Postgres is empty. Story 2.3 only adds `<RefreshButton />` to the header — no other page logic changes
- **`CredentialErrorBanner`** (`apps/web/src/components/project-map/CredentialErrorBanner.tsx`) — if `syncArtifactsAction()` returns `NO_CREDENTIAL`, the action already calls `markCredentialFailed()`. The subsequent `router.refresh()` re-renders the page, which calls `getCredentialHealthStatus()` and renders the banner. No additional error handling needed in RefreshButton for this case
- **`loading.tsx`** (`apps/web/src/app/(dashboard)/(app)/project-map/loading.tsx`) — Next.js loading skeleton. Do NOT add a RefreshButton to it — skeletons must not render runtime-state-dependent elements (Story 2.2 dev notes)
- **`useTransition()` pattern** — `CredentialErrorBanner.tsx` is the canonical example of a Client Component calling a Server Action with `useTransition()` for pending state. Follow the same pattern (import, `startTransition`, `isPending`, `disabled`)
- **`lucide-react`** — already installed (used by `dialog.tsx` for the `X` icon). `RefreshCw` is available — do not add a new dependency

### Refresh Flow (End-to-End)

1. User clicks the refresh button (icon: `RefreshCw` from lucide-react)
2. `startTransition` begins → `isPending = true` → icon gets `animate-spin`, button is `disabled`
3. `try { await syncArtifactsAction() }` runs: resolves OAuth token → fetches `_bmad-output/` from GitHub Contents API → upserts artifact metadata + content into Postgres (transaction-wrapped)
4. `finally { router.refresh() }` runs: Next.js re-runs the Project Map Server Component → fresh `getPrisma().artifact.findMany()` read → re-renders with updated artifact list
5. Transition completes → `isPending = false` → icon stops spinning, button re-enables

If the sync fails (any error code), `router.refresh()` still runs via the `finally` block — the page re-renders with whatever is in Postgres (stale data, or the CredentialErrorBanner if `NO_CREDENTIAL`). If `syncArtifactsAction()` throws (e.g. database connectivity failure on the uncaught `findUnique()` at `artifacts.actions.ts:20`), `useTransition` swallows the error but the `finally` block still runs `router.refresh()` — the Server Component's Prisma read may also throw, in which case Next.js renders the route's `error.tsx` boundary. `NO_REPO_CONNECTION` (repo deleted between layout guard and action call — a race condition) is handled by the page's existing logic: `router.refresh()` re-renders, `repoConnection.findUnique()` returns null, and the page redirects to `/onboarding` (Story 2.2 Task 5.2). The UX spec (EXPERIENCE.md Project Map States) does not define a "refresh failed" state, so no error indicator is shown beyond the existing banner for credential failures.

### Component Boundaries

- `RefreshButton` is a **Client Component** (`'use client'`) — it manages pending state and calls a Server Action. This is the only new client component in this story
- The page remains a **Server Component** — it renders `<RefreshButton />` as a child. Server Components can render Client Components; this is a standard Next.js App Router pattern
- `RefreshButton` calls `syncArtifactsAction()` directly (not via a prop callback) — Server Actions are async functions callable from Client Components. Same pattern as `CredentialErrorBanner` calling `reauthorizeGitHub()`

### Design Token Usage

All colors and spacing from `tailwind.config.ts` (mirrors DESIGN.md). Use semantic token names, never raw hex:

- Refresh icon (idle): `text-text-2` → hover: `text-text-1`
- Refresh icon (pending): `text-text-2 animate-spin`
- Button focus ring: `focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg`
- Button disabled: `disabled:opacity-50 disabled:pointer-events-none`
- Button container: `p-1 rounded-md` (matches mockup's `.refresh-btn` padding/border-radius)

### Accessibility (UX-DR16)

- `aria-label="Refresh Project Map"` on the button (icon-only button — per mockup line 312)
- Visible 2px accent focus ring with 2px offset — never suppressed on click
- Button is `disabled` while pending — keyboard users can't trigger a second concurrent refresh
- The spinner (`animate-spin`) is a visual indicator; screen reader users hear the button's `aria-label` regardless of state. No `aria-live` needed — the refresh is a user-initiated action, not an async status update they didn't trigger
- `prefers-reduced-motion`: the `animate-spin` class is a Tailwind animation. If reduced-motion compliance is needed, the dev agent may add `motion-reduce:animate-none` to the spinner — but this would remove the only visual feedback during refresh. Use `motion-reduce:animate-pulse` as a reduced-motion alternative if the spin is too aggressive. This is a judgment call — the UX spec only mentions reduced-motion for the streaming cursor and thinking indicator, not for spinners

### Out of Scope (Do Not Implement)

- **Refresh-failure error indicator**: The UX spec (EXPERIENCE.md Project Map States) does not define a "refresh failed" state. Adding one is beyond the ACs (DP-5). If the sync fails, `router.refresh()` re-renders with stale data; if `NO_CREDENTIAL`, the existing CredentialErrorBanner appears
- **Disabling refresh when credential is failed**: The epic AC doesn't specify this. If the credential is failed, `syncArtifactsAction()` returns `NO_CREDENTIAL` quickly and the banner persists. Adding a `disabled` state for failed credentials is a sensible enhancement but beyond the ACs (DP-5)
- **Card click navigation**: Story 2.6's scope
- **Artifact Browser**: Stories 2.4-2.5's scope
- **Real-time updates**: No WebSocket, SSE, or polling. The refresh button is the manual trigger; page reload is the other
- **`apps/agent-be` changes**: No backend changes. The refresh is a pure `apps/web` Server Action + Client Component

### Testing Patterns

Follow the established patterns from the codebase:

- **Client Component tests** (`RefreshButton.test.tsx`): use `jsdom` environment (default). Use `@testing-library/react` with `render()`, `screen.getByRole()`, `userEvent.click()`. Mock Server Actions (`syncArtifactsAction`) and `next/navigation` (`useRouter`). Use `jest.clearAllMocks()` in `beforeEach`, `jest.restoreAllMocks()` in `afterEach`
- **Pending state testing**: use `mockImplementation(() => new Promise(() => undefined))` to create a never-resolving promise that keeps `isPending` true — same pattern as `CredentialErrorBanner.test.tsx:78-91`
- **Throw-case testing**: use `mockRejectedValue(new Error('DB down'))` to verify `router.refresh()` still runs via the `finally` block when `syncArtifactsAction` throws (useTransition swallows the error, but the `finally` block still executes)
- **Tag tests** `[P0]` or `[P1]` in `it()` descriptions. P0 for AC coverage, P1 for edge cases
- **Co-locate** tests with source: `*.test.tsx` next to the file under test
- **Page test update**: add `jest.mock('@/components/project-map/RefreshButton', ...)` as a render stub to `page.test.tsx` — same pattern as the existing `ArtifactCard` and `CredentialErrorBanner` mocks

### Previous Story Intelligence

- **Story 2.2 (done)**: Delivered the Project Map page (`page.tsx`), `ArtifactCard`, `CredentialErrorBanner`, `loading.tsx`. The page reads from Postgres, syncs on first visit when empty, shows credential banner when failed. Review findings fixed: type-assertion fallbacks on DB rows, `CredentialErrorBanner` error swallowing (try/catch on `reauthorizeGitHub`), `page.test.tsx` child component mocks. The `useTransition()` + Server Action pattern is established in `CredentialErrorBanner.tsx` — follow it exactly. Lint baseline: 0 errors, 9 warnings. `typecheck` target not configured in `project.json` — use `npx tsc --noEmit -p apps/web/tsconfig.json` directly
- **Story 2.1 (done)**: Delivered `syncArtifacts()` lib function, `syncArtifactsAction()` Server Action, `Artifact` Prisma model, `SyncArtifactsResult` / `SyncErrorCode` types. The `update` payload omits `status` (preserves `in-progress` set by Epic 3). Transaction-wrapped upsert+delete. `scannedPaths` built from the source listing (`scannedFiles`) before the transaction's `deleteMany` — not from fetch results, so a transient fetch failure on one file doesn't delete its row. Story 2.3 calls `syncArtifactsAction()` — do not call `syncArtifacts()` directly
- **Established conventions**: kebab-case non-component files, PascalCase component files, co-located tests, Conventional Commits. `lucide-react` is the icon library (used by `dialog.tsx`). shadcn/ui `new-york` style with `rsc: true`

### Git Intelligence

- Recent commits: `a090cfc feat(pipeline): add decision policy...`, `296e674 feat(pipeline): add gen-2 self-healing epic development loop`, `3260c58 feat: final epic1 fixes before self-healing workflows`. Epic 1 is complete. Epic 2 is in-progress (Stories 2.1 and 2.2 are done)
- Story 2.2's deliverables are committed and stable. The Project Map page, components, and tests are all in the working tree

### Project Structure Notes

**New files:**
- `apps/web/src/components/project-map/RefreshButton.tsx` — Client Component, refresh button with spinner
- `apps/web/src/components/project-map/RefreshButton.test.tsx` — unit tests

**Updated files:**
- `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` — add `RefreshButton` to header, add `flex items-center gap-3` to header className
- `apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx` — add `RefreshButton` mock stub

**Amended artifacts (DP-2):**
- `_bmad-output/planning-artifacts/architecture.md:499` — RefreshButton comment updated from "triggers full browser reload" to "in-page sync via syncArtifactsAction() + router.refresh(); spinner during sync"

**No changes to:**
- `apps/agent-be/` (no backend changes)
- `libs/` (no schema or shared-type changes)
- `apps/web/src/actions/artifacts.actions.ts` (Story 2.1 delivered this — call it, don't modify it)
- `apps/web/src/lib/artifacts.ts` (Story 2.1 delivered this)
- `apps/web/src/components/project-map/ArtifactCard.tsx` (Story 2.2 delivered this)
- `apps/web/src/components/project-map/CredentialErrorBanner.tsx` (Story 2.2 delivered this)
- `apps/web/src/app/(dashboard)/(app)/project-map/loading.tsx` (Story 2.2 delivered this — do not add RefreshButton to skeleton)
- `tailwind.config.ts`, `next.config.js`, CI config

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 2.3 (lines 503-518), Epic 2 description (lines 447-449), FR7 (line 32), FR coverage map (line 183)
- PRD: `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` — FR-7 (Manual Refresh)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Frontend Architecture #5 refresh/staleness model (line 276), API & Communication #5 data boundary (line 268), graceful degradation (line 96), RefreshButton directory entry (line 499, amended per DP-2)
- DESIGN.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` — color tokens (lines 7-34), component specs
- EXPERIENCE.md: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` — Project Map States table (lines 271-281), "Refreshing" state (line 281), voice and tone (lines 88-108)
- Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/mockups/key-project-map.html` — refresh button placement in page header (lines 310-315), refresh button styling (lines 177-194)
- Project context: `_bmad-output/project-context.md` — Server Action result-union narrowing with `in` operator (line 77), `useTransition()` for non-form Server Action calls (line 101), no automatic client-side revalidation (line 93), GitHub API timeout pattern (line 80), testing rules (lines 144-177)
- Previous story: `_bmad-output/implementation-artifacts/2-2-view-the-project-map.md` — `useTransition()` pattern in CredentialErrorBanner (lines 66-68), page structure (lines 80-96), testing patterns (lines 190-197), what already exists (lines 120-135)
- Implementation: `apps/web/src/app/(dashboard)/(app)/project-map/page.tsx` (header to update), `apps/web/src/components/project-map/CredentialErrorBanner.tsx` (canonical `useTransition` + Server Action pattern), `apps/web/src/actions/artifacts.actions.ts` (sync action to call), `apps/web/src/components/ui/dialog.tsx` (confirms `lucide-react` is installed)

## Dev Agent Record

### Agent Model Used

_(to be filled by dev agent)_

### Debug Log References

### Completion Notes List

### File List

### Review Findings

**Review date:** 2026-07-03
**Review layers:** Blind Hunter, Edge Case Hunter, Acceptance Auditor
**Triage summary:** 0 decision-needed, 4 patch, 7 defer, 9 dismissed

#### Patch findings

- [x] [Review][Patch] RefreshButton never wired into page — Task 2.1 missing [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx`] — `RefreshButton` is created but never imported or rendered. Header className is `flex-shrink-0 px-8 py-6` (missing `flex items-center gap-3`), no `<RefreshButton />` after `<h1>`. Fix: import `RefreshButton` from `@/components/project-map/RefreshButton`, add `flex items-center gap-3` to header className, render `<RefreshButton />` after `<h1>`.
- [x] [Review][Patch] RefreshButton mock and test missing from page.test.tsx — Task 2.2 missing [`apps/web/src/app/(dashboard)/(app)/project-map/page.test.tsx`] — No `jest.mock('@/components/project-map/RefreshButton', ...)` render stub, no `[P1] renders RefreshButton in the header` test. Fix: add mock stub returning `'RefreshButton'` (same pattern as `ArtifactCard` mock), add test asserting `RefreshButton` appears in rendered header.
- [x] [Review][Patch] RefreshButton test suite is order-dependent, relies on poisoned state [`apps/web/src/components/project-map/RefreshButton.test.tsx:56-62`] — Test header comment admits ordering matters: the "disabled while pending" test uses a never-resolving promise that poisons `useTransition` state, and the "sync throws" test relies on that poisoned state to swallow the unhandled rejection. Tests are not hermetic. Fix: isolate each test so it does not depend on prior test state (e.g., suppress unhandled rejection with `jest.spyOn(console, 'error').mockImplementation(() => undefined)` in the throw test, or restructure to avoid cross-test state leakage).
- [x] [Review][Patch] Inconsistent leading-whitespace in throw-case test [`apps/web/src/components/project-map/RefreshButton.test.tsx:165`] — Dismissed: false positive. The actual file has correct 4-space indentation; the apparent whitespace issue was an artifact of the diff heredoc used to pass the diff to review subagents.

#### Deferred findings

- [x] [Review][Defer] Silent fallthrough masks sync errors in page.tsx [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:231-243`] — deferred, pre-existing from Story 2.2. Sync error codes other than `NO_CREDENTIAL` (`RATE_LIMITED`, `NOT_FOUND`, `UNKNOWN`, `NO_REPO_CONNECTION`) fall through to empty state with no error feedback.
- [x] [Review][Defer] Credential health failure mis-detected when health check itself errors [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:226-227`] — deferred, pre-existing from Story 2.2. `credentialResult.success && credentialResult.status === 'failed'` treats `success: false` as "healthy."
- [x] [Review][Defer] No pagination — `take: 100` silently truncates [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:220,237`] — deferred, pre-existing from Story 2.2, beyond Story 2.3 ACs.
- [x] [Review][Defer] Unsafe type assertions on DB rows [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:267-270`] — deferred, pre-existing from Story 2.2. `a.type as ArtifactType` and `a.status as ArtifactStatus` bypass type checking.
- [x] [Review][Defer] `Promise.all` has no error boundary — partial failure crashes page [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx:216-224`] — deferred, pre-existing from Story 2.2. No try/catch around `Promise.all([findMany, getCredentialHealthStatus])`.
- [x] [Review][Defer] Page-load sync has no concurrency guard [`apps/web/src/lib/artifacts.ts:226-279`] — deferred, pre-existing from Story 2.1. Concurrent syncs can interleave `deleteMany` and silently delete each other's upserted rows.
- [x] [Review][Defer] Scope creep — page.tsx rewritten end-to-end instead of only adding RefreshButton [`apps/web/src/app/(dashboard)/(app)/project-map/page.tsx`] — deferred, process issue. Story 2.2's page implementation was never committed; dev agent found a placeholder and implemented the full page. Story 2.3's only intended change was adding `<RefreshButton />` to the header.

#### Decision records (applied during triage)

**Decision (DP-5):** "No user feedback on refresh failure" finding — the UX spec defines no "refresh failed" state. Adding one is beyond the ACs. Deferred per DP-5 (scope temptation). Already recorded in spec's Dev Notes; confirmed, no new action.

**Decision (DP-2):** "RefreshButton missing catch / swallows errors" finding — the spec's DP-2 decision record explicitly chose `try/finally` over `try/catch` so `router.refresh()` runs regardless. `useTransition` swallows thrown errors (known React behavior per project-context.md). If the DB is down, `router.refresh()` triggers the Server Component's Prisma read which throws and Next.js renders `error.tsx`. Already recorded in spec's Dev Notes; confirmed, no new action.

**Decision (DP-5):** "Scope creep in page.tsx" finding — the page.tsx rewrite is Story 2.2's work, not Story 2.3's. Deferred per DP-5 (defer, don't expand). Recorded as deferred finding above.

**Decision (DP-5):** "Page.tsx error handling issues" (findings 5-9) — all pre-existing from Story 2.2's implementation, not caused by Story 2.3's changes. Deferred per DP-5. Recorded as deferred findings above.
