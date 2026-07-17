# UX Findings: Dead Ends and Missing Maintenance Surfaces

**Date:** 2026-07-16
**Source:** Sally (UX Designer) audit of bmad-easy implementation against PRD, EXPERIENCE.md, and live code
**Scope:** 9 findings selected by Marius for Epic 7 extension (items 10 and 11 — toast system and command palette — excluded)

---

## Context

A UX audit of the bmad-easy web application surfaced 11 missing common-sense UX features. Marius selected 9 for implementation (excluding toast system and command palette). These are live-usage findings — states, maintenance hatches, and recovery paths that the design never specified. They fit the same category as Epic 7's existing stories (7.1–7.5): live-usage UX improvements, not mockup drift.

**Decision:** Extend Epic 7 with stories 7.6–7.14 via a single sprint change proposal (one proposal, not two). The sprint plan can sequence P0s first within the epic.

**Sign-out pattern decision:** Avatar becomes a dropdown menu (sign-out + future account items). Smallest change that unblocks the dead end without forcing a full Settings page redesign.

---

## The 9 Findings

### Finding 1 — Sign-out affordance (P0)

**Description:** There is no sign-out button anywhere in the product. The `signOut` function is exported from `apps/web/src/lib/auth.ts` but never wired to any UI element. The avatar circle in `SideNavigation.tsx` is a plain `<Link href="/settings">`, and Settings is a static placeholder.

**Evidence:** Error copy in five separate files tells users to "sign out and sign back in" to resolve credential failures:
- `apps/web/src/components/project-map/CredentialErrorBanner.tsx` line 29
- `apps/web/src/actions/repository-validation.actions.ts` lines 68, 102
- `apps/web/src/actions/repo-connection.actions.ts` lines 77, 107
- `apps/web/src/actions/artifacts.actions.ts` lines 66, 88

**Impact:** Critical. Users trapped in expired-token sessions with no in-product recovery path. The product's own error copy creates an expectation the UI doesn't fulfill.

**Design decision:** Avatar becomes a dropdown menu containing "Sign out" and future account items. Keeps the avatar as the account surface without forcing a full Settings page redesign. Sign-out calls `signOut()` from auth.ts and redirects to `/sign-in`.

**Needs:** PRD FR (session termination), UX spec (dropdown pattern), Architecture review (token invalidation).

---

### Finding 2 — Disconnect/switch repository (P0)

**Description:** No UI surface to disconnect, switch, or re-point the connected repository. `onboarding/page.tsx` hard-redirects to `/project-map` if a `RepoConnection` exists. FR-1 covers connecting but says nothing about disconnecting or switching.

**Evidence:** `apps/web/src/app/(dashboard)/onboarding/page.tsx` — `existing` check redirects. No disconnect/switch UI anywhere in `apps/web/src/components/` or `apps/web/src/app/(dashboard)/(app)/settings/`.

**Impact:** Critical. Wrong-repo, renamed-repo, and team-migration scenarios have no in-product recovery. Users are welded to their first choice.

**Design decision:** Add a "Repository" section to Settings (or a dedicated repo management surface) with a "Disconnect" action. Disconnect requires a confirmation dialog warning about active conversations. On disconnect: terminate active sandboxes, delete RepoConnection, redirect to `/onboarding`. Switching = disconnect + onboarding redirect.

**Needs:** PRD FR (extend FR-1 or new FR), UX spec (confirmation flow), Architecture review (sandbox cascade, credential cleanup, active conversation handling).

---

### Finding 3 — Global 404 page (P1)

**Description:** No `not-found.tsx` at the app root or any route segment. Stale bookmarks, typos, deleted conversations, and access-revoked repos all yield Next.js's default 404, which breaks out of AppShell, ignores design tokens, and offers no way back.

**Evidence:** `find apps/web/src/app -name "not-found*"` returns nothing. Every other error state has a designed `error.tsx` with `<h1>` and Refresh buttons.

**Impact:** High. Closes the one gap in an otherwise rigorous error-state system.

**Design decision:** Add `not-found.tsx` at app root (and optionally at route segments). Mirrors the `error.tsx` canonical structure: full page shell, centered message, link back to Project Map. Respects design tokens. Must include `<h1 tabIndex={-1}>` for AppShell route-focus management.

**Needs:** UX spec (404 page pattern), no PRD or architecture changes.

---

### Finding 4 — Conversation delete (P1)

**Description:** No way to delete or archive conversations. `SideNavigation.tsx` renders conversations as bare `<Link>` elements. FR-11 caps users at 10 active conversations with a blocking message, but there's no way to clean up to make room.

**Evidence:** `apps/web/src/components/shell/SideNavigation.tsx` — conversations are read-only links. Grep for "delete.*conversation" in src returns nothing.

**Impact:** High. The 10-conversation limit is a permanent wall without delete. Users who hit the limit have no in-product recovery.

**Design decision:** Add a delete action to each conversation in the side nav (hover-revealed trash icon, or a context menu on hover/click). Delete requires a confirmation dialog: "Delete this conversation? This cannot be undone." On delete: terminate sandbox if active, delete conversation record and chat history, remove from side nav, redirect to Project Map if the deleted conversation was active.

**Needs:** UX spec (delete confirmation + side-nav interaction), Architecture review (endpoint, sandbox termination, data cleanup).

---

### Finding 5 — Conversation rename (P2)

**Description:** No way to rename conversations. Semantic titles are auto-generated (2–5 words) and may be wrong or unhelpful. Users can't fix "PRD discussion" to "Q3 pricing PRD."

**Evidence:** `SideNavigation.tsx` — conversations are bare links with no edit affordance.

**Impact:** Medium. Semantic titles misfire often; users need to correct them.

**Design decision:** Add inline rename to side nav conversations. Double-click the title (or click an edit icon on hover) to enter edit mode. Enter saves, Escape cancels. Server Action updates the conversation title. Side nav refreshes.

**Needs:** UX spec (inline edit pattern), Architecture review (endpoint).

---

### Finding 6 — New conversation intro prompt (P2)

**Description:** The spec calls for the chat area to show "Press `/` to browse available skills, or type a message to start." as platform copy. The implementation only passes `placeholder="Message bmad-easy…"` — a textarea placeholder invisible until the user starts typing.

**Evidence:** `apps/web/src/app/(dashboard)/(app)/conversations/new/page.tsx` line 20 — `placeholder="Message bmad-easy…"`. EXPERIENCE.md §New Conversation specifies the intro prompt copy.

**Impact:** Medium. The slash-command affordance — the single most important onboarding hint for a non-dev user — is invisible until they happen to type `/`.

**Design decision:** Render the spec's introductory prompt as platform copy in the chat area (not a textarea placeholder). Centered in the chat-messages panel, same treatment as the happy-path greeting (Story 7.1's reference treatment).

**Needs:** UX spec note (one sentence confirming the copy and placement), no PRD or architecture changes.

---

### Finding 7 — Side-nav empty state (P2)

**Description:** When the conversation list is empty (new user, first session), the side nav's conversation region is blank space. No empty state.

**Evidence:** `SideNavigation.tsx` — filters out null-title conversations and maps the rest. No fallback for empty array.

**Impact:** Low-medium. Polish, but the side nav is the most persistent surface in the shell.

**Design decision:** Show "No conversations yet" muted text in the conversation list area when empty. Possibly with a subtle arrow pointing up to the New Conversation button.

**Needs:** UX spec note, no PRD or architecture changes.

---

### Finding 8 — Artifact Browser search/filter (P3)

**Description:** No search or filter on the Artifact Browser. The spec calls for a flat list sorted by last-modified. Clean for six artifacts, but at forty artifacts across multiple types there's no way to find anything except scrolling.

**Evidence:** Grep for "search|filter|Search|Filter" in `apps/web/src/app/(dashboard)/(app)/artifacts` and `apps/web/src/components/artifact-browser` returns only unrelated matches (searchParams, frontmatter field filtering).

**Impact:** Medium. Scales with usage.

**Design decision:** Add a search input at the top of the artifact list. Filter by title (substring match) and optionally by artifact type (dropdown or pills). List updates live as user types. Clear button to reset. Persists filter state in URL query params for shareable filtered views.

**Needs:** UX spec (search input + filter pattern), Architecture review (query pattern — likely client-side filter of server-rendered list for MVP).

---

### Finding 9 — Conversation search / show-more (P3)

**Description:** No search or "show more" for conversations. The spec explicitly says "no show more in MVP" for the side nav. Conversation #6+ is inaccessible except by direct URL.

**Evidence:** EXPERIENCE.md §Side Navigation: "Below the 5th entry, no additional history is shown (no 'show more' in MVP)." `SideNavigation.tsx` renders only the conversations passed to it (server-query-limited).

**Impact:** Medium. The 5-cap is a deliberate MVP cut, but the cliff is real. Important conversations from last week disappear from nav.

**Design decision:** Add a "Show all" link at the bottom of the conversation list in the side nav. Clicking opens a full conversation list view (either a modal/overlay or a dedicated `/conversations` page) with search by title and scrollable history. Selecting a conversation navigates to it. This respects the spec's "no show more in side nav" by moving the full list to a separate surface.

**Needs:** UX spec (full conversation list pattern — modal or page), Architecture review (query pattern for full list).

---

## Wave Sequencing

| Wave | Findings | Priority | Rationale |
|---|---|---|---|
| 1 | #1, #2, #6, #7 | P0 + free wins | Dead ends unblocked; trivial wins ride along |
| 2 | #3, #4, #5 | P1 + P2 | Maintenance hatches; conversation limit is a wall without #4 |
| 3 | #8, #9 | P3 | Scale features; design now, implement when usage justifies |

Sprint plan should sequence Wave 1 stories first within Epic 7.

---

## What Each Finding Needs

| # | Finding | PRD FR? | UX Spec? | Architecture? |
|---|---|---|---|---|
| 1 | Sign-out | Yes — new FR (session termination) | Yes — dropdown pattern | Yes — token invalidation |
| 2 | Repo disconnect/switch | Yes — extend FR-1 or new FR | Yes — confirmation flow | Yes — sandbox cascade |
| 3 | Global 404 | No | Yes — 404 page pattern | No |
| 4 | Conversation delete | No (within FR-11 scope) | Yes — delete confirmation + side-nav | Yes — endpoint, sandbox, data cleanup |
| 5 | Conversation rename | No (within FR-11 scope) | Yes — inline edit | Yes — endpoint |
| 6 | Intro prompt | No | Yes — one sentence | No |
| 7 | Side-nav empty state | No | Yes — one sentence | No |
| 8 | Artifact search/filter | No | Yes — search + filter pattern | Yes — query pattern |
| 9 | Conversation search/show-more | No | Yes — full list pattern | Yes — query pattern |

---

## Epic 7 Context

Epic 7 ("Live-Usage UX Improvements") was created by the 2026-07-13 sprint change proposal. It currently contains stories 7.1–7.5:
- 7.1: Unify Error State Presentation in Conversation View
- 7.2: Loading State for Sidebar Page Navigation
- 7.3: Loading State for Artifact Switching in Artifact Browser
- 7.4: Reduce Focus State Prominence on Navigation Surfaces
- 7.5: Relative Time for Conversation Timestamps

New stories will be numbered 7.6–7.14, following the same story format (As a / I want / So that + Given/When/Then acceptance criteria + Scope notes).

**Prior sprint change proposal (template):** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-13.md`

**Epic 7 in epics.md:** starts at line 1664

---

## Key Files

| File | Path |
|---|---|
| PRD | `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md` |
| UX spec | `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/EXPERIENCE.md` |
| Architecture | `_bmad-output/planning-artifacts/architecture.md` |
| Epics | `_bmad-output/planning-artifacts/epics.md` |
| Prior proposal (template) | `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-13.md` |
| SideNavigation component | `apps/web/src/components/shell/SideNavigation.tsx` |
| Settings page | `apps/web/src/app/(dashboard)/(app)/settings/page.tsx` |
| Onboarding page | `apps/web/src/app/(dashboard)/onboarding/page.tsx` |
| New conversation page | `apps/web/src/app/(dashboard)/(app)/conversations/new/page.tsx` |
| Auth lib | `apps/web/src/lib/auth.ts` |
| Project context | `_bmad-output/project-context.md` |
