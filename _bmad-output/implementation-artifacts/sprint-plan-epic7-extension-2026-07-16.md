# Sprint Plan: Epic 7 Extension (Stories 7.6–7.14)

**Date:** 2026-07-16
**Epic:** 7 — Live-Usage UX Improvements (extension)
**Proposal:** sprint-change-proposal-2026-07-16-ux-dead-ends.md
**Readiness report:** implementation-readiness-report-2026-07-16-epic7-extension.md
**Architecture review:** architecture-review-ux-dead-ends-2026-07-16.md
**Status:** Ready for story development

---

## Implementation Order

The 9 stories are sequenced in 3 waves, respecting priority and cross-story dependencies. The linear order within each wave follows the dependency graph and the readiness report's recommendations.

### Wave 1 — Dead Ends + Free Wins (P0 + P2)

| Order | Story | Title                                          | Type        | Priority | Dependencies                                          |
|-------|-------|------------------------------------------------|-------------|----------|------------------------------------------------------|
| 1     | 7.6   | Sign-out affordance (avatar dropdown)          | Frontend   | P0       | None — implement first                                |
| 2     | 7.7   | Repository disconnect from Settings            | Full-stack | P0       | 7.6 (avatar dropdown's "Settings" link is the path to `/settings`) |
| 3     | 7.8   | New conversation intro prompt                  | Frontend   | P2       | None — independent, rides along with Wave 1          |
| 4     | 7.9   | Side-nav conversation empty state              | Frontend   | P2       | None — independent, rides along with Wave 1          |

### Wave 2 — Maintenance Hatches (P1 + P2)

| Order   | Story        | Title                          | Type        | Priority   | Dependencies                                                              |
|---------|--------------|--------------------------------|-------------|------------|--------------------------------------------------------------------------|
| 5       | 7.10         | Global 404 page                 | Frontend   | P1         | None — independent (new `not-found.tsx` file)                             |
| 6 + 7   | 7.11 + 7.12  | Conversation delete + rename    | Frontend   | P1 + P2    | Implement together — both add hover-revealed icon buttons to `SideNavigation.tsx` conversation entries |

### Wave 3 — Scale Features (P3)

| Order | Story | Title                                 | Type        | Priority | Dependencies                                                               |
|-------|-------|---------------------------------------|-------------|----------|---------------------------------------------------------------------------|
| 8     | 7.13  | Artifact Browser search and filter    | Frontend   | P3       | None — can implement independently                                        |
| 9     | 7.14  | Conversation search / show all        | Full-stack | P3       | 7.5 (reuses relative-time treatment — soft dependency, fallback documented) |

---

## Dependency Graph

```
Wave 1                          Wave 2                          Wave 3
─────────                       ─────────                       ─────────

 7.6 ──┐                         7.10 (independent)
       │ hard-ish (Settings link)          
       ▼                                7.11 ◄──┐
 7.7                                  (pair) │ both touch SideNavigation.tsx
                                      7.12 ◄──┘
 7.8 (independent)
 7.9 (independent)                                                 7.5 ──(soft)──► 7.14
                                                                   (relative-time treatment)
```

**Dependency details:**

| From  | To    | Type        | Rationale                                                                                                            |
|-------|-------|-------------|---------------------------------------------------------------------------------------------------------------------|
| 7.7   | 7.6   | Hard-ish    | The avatar dropdown (7.6) creates the "Settings" link that is the navigation path to `/settings` once the avatar is no longer a direct link. If 7.7 ships without 7.6, an alternate path to `/settings` must exist. |
| 7.11  | 7.12  | Pair (mutual) | Both add hover-revealed icon buttons to `SideNavigation.tsx` conversation entries. Implementing them separately means touching the same component twice and risking merge conflicts on the hover interaction pattern. |
| 7.14  | 7.5   | Soft        | 7.14's "Show all" modal reuses Story 7.5's relative-time treatment for the last-activity timestamp column. A fallback (relative-only without live updates, or absolute time) is documented if 7.5 is delayed. |
| All   | Epic 6 | None        | No story in 7.6–7.14 depends on Epic 6. They touch Auth.js session lifecycle, the `RepoConnection`/sandbox data model, and Prisma reads — not where the agent executes. |

**Circular dependencies:** None.
**Missing dependencies:** None. The readiness report validated that every dependency declared in a story's scope notes is consistent with the wave sequencing.

---

## Story Type Summary

| Type                              | Stories            | Count |
|-----------------------------------|--------------------|-------|
| Frontend-only                     | 7.6, 7.8, 7.9, 7.10, 7.11, 7.13 | 6     |
| Full-stack (backend + frontend)   | 7.7, 7.12, 7.14   | 3     |

**Full-stack breakdown:**

| Story | Backend work                                                                                          |
|-------|-------------------------------------------------------------------------------------------------------|
| 7.7   | New agent-be `DELETE /api/conversations` (bulk terminate) endpoint + new `disconnectRepository()` Server Action |
| 7.12  | New Server Action in `conversation.actions.ts` (Prisma `conversation.update`)                          |
| 7.14  | New Server Action querying Prisma without `take: 5` limit (returns `{ id, title, lastActiveAt }`)     |

Note: 7.11 wires a frontend delete button to the **already existing** `DELETE /api/conversations/:id` endpoint (`abandonConversation`) — no new backend work.

---

## Story Cycle

For each story, the developer (Amelia) follows the standard BMad cycle:

1. **`bmad-create-story`** (CS) — prepare the story file in `_bmad-output/implementation-artifacts/stories/` with full Given/When/Then acceptance criteria pulled from `epics.md`
2. **`bmad-dev-story`** (DS) — implement against the story spec
3. **`bmad-agent-fidelity-auditor`** (TFA) — audit that tests exercise the real contract, not a fabricated one
4. **`bmad-code-review`** (CR) — adversarial code review (fresh context, different LLM recommended)

Sprint status transitions in `sprint-status.yaml`: `backlog` → `ready-for-dev` → `in-progress` → `review` → `done`.

---

## Implementation Notes

### Wave 1 — Dead Ends + Free Wins (7.6, 7.7, 7.8, 7.9)

- **7.6 is the foundational change.** It transforms the avatar in `SideNavigation.tsx` from a plain `<Link href="/settings">` into a dropdown button (Radix `DropdownMenu` from `components/ui/dropdown-menu.tsx`, already in the shadcn/ui set). The dropdown contains: (1) user name + email as muted display-only text, (2) a "Settings" link to `/settings`, (3) a divider, (4) a "Sign out" action calling `signOut({ redirectTo: '/sign-in' })` from `apps/web/src/lib/auth.ts:18`. This is frontend-only wiring — no new endpoint, Server Action, or data-model change.
- **7.7 depends on 7.6's Settings link.** Once the avatar is a dropdown (not a direct link), the "Settings" menu item in the dropdown is the navigation path to the Settings page where the disconnect flow lives. 7.7 is the most complex story in the set: it adds a new agent-be `DELETE /api/conversations` (no `:id`) bulk-terminate endpoint (reusing the existing `abandonConversation` teardown path, extracted into a shared private method) + a `disconnectRepository()` Server Action. The browser-direct call sequence (browser → agent-be for sandbox termination, then Server Action for Postgres cleanup) preserves the no-server-to-server boundary. Rate-limit the new endpoint to match `createConversation` (10/60s).
- **7.8 and 7.9 are trivial frontend wins** that ride along. 7.8 renders the intro prompt ("Press `/` to browse available skills, or type a message to start.") as platform copy centered in the chat-messages panel on the new-conversation page — replacing the textarea-placeholder-only implementation. 7.9 adds muted "No conversations yet" text to the side-nav conversation region when the list is empty. Neither has backend work or cross-story dependencies.
- **Token invalidation (7.6):** The architecture review §1 confirms `signOut()` clears the client-side session cookie (stateless JWT, 8h `maxAge`); the boundary JWT is not explicitly invalidated but becomes unusable without a valid session, and `ActiveUserGuard` performs a live `User` lookup on every privileged request. A server-side revocation list is out of scope for MVP. Sign-out does **not** terminate active sandboxes (they continue until idle timeout or explicit conversation end — FR-20 documents this independence).

### Wave 2 — Maintenance Hatches (7.10, 7.11, 7.12)

- **7.10 is fully independent** — a new `not-found.tsx` file at the app root, mirroring the canonical `error.tsx` structure (`<h1 tabIndex={-1}>` for AppShell route-focus, centered message, "Go to Project Map" link, design tokens). Closes the one gap in the error-state system. Can be done in parallel with 7.11+7.12.
- **7.11 and 7.12 MUST be implemented together.** Both add hover-revealed icon buttons to `SideNavigation.tsx` conversation entries: 7.11 adds a trash-icon delete button (calling the existing `DELETE /api/conversations/:id` endpoint), 7.12 adds a pencil-icon rename button (calling a new Server Action for `conversation.update`). Doing them separately means touching the same hover-interaction pattern in the same component twice — risking merge conflicts and inconsistent affordance placement. The UX spec specifies the pencil icon appears alongside the trash icon; implement both in one pass.
- **Delete is destructive and permanent** (7.11): the confirmation dialog states "This cannot be undone." On delete, cascade deletes handle `Turn` and `CostRecord` (`onDelete: Cascade` in the Prisma schema). If the deleted conversation was the active page, redirect to `/project-map` before `router.refresh()`. Concurrent access (another tab open on the deleted conversation) is handled by the existing `ConversationPane` `onerror` handler — no new logic needed.
- **Rename uses a Server Action, not an agent-be endpoint** (7.12): conversation title is non-live metadata; `apps/web` owns synchronous data operations and already reads conversations from Postgres directly. The Server Action uses a Zod schema (`title: z.string().min(1).max(100)`), validates ownership via `findFirst({ where: { id, userId } })`, and follows the typed-result-union pattern (`{ success: true } | { error; errorCode }`). Empty titles are rejected (null-title conversations are filtered from the side nav).

### Wave 3 — Scale Features (7.13, 7.14)

- **7.13 is pure client-side filtering** of the already-rendered (server-rendered) artifact list — no new endpoint, Server Action, or Prisma query. A search input at the top of the artifact list filters by title (case-insensitive substring) and optionally by type (pill buttons or dropdown). Filter state persists in URL query params (`?q=search&type=prd`) for shareable views. Adequate for ≤ 100 artifacts; post-MVP a server-side search endpoint would be needed (the `Artifact` table has `@@index([repoConnectionId, lastModifiedAt])` to support it).
- **7.14 needs a Server Action** to fetch the full conversation list (the side-nav query uses `take: 5`; the "Show all" modal needs all conversations). The Server Action queries Prisma with the same `where` clause as the layout query but without the `take: 5` limit, returning `{ id, title, lastActiveAt }`. The search input in the modal filters client-side (same pattern as 7.13). For MVP (max 10 active conversations per FR-11), client-side filtering of the full list is sufficient.
- **7.14 reuses 7.5's relative-time treatment** for the last-activity timestamp column in the "Show all" modal. This is a soft dependency: if 7.5 is delayed, ship 7.14 with a fallback (relative-only without live updates, or absolute time). 7.5 is in the pre-existing story set (7.1–7.5), likely done or in progress by the time Wave 3 starts.
- **The full conversation list is a modal** (chosen over a dedicated `/conversations` route for MVP simplicity — resolves the open UX decision flagged in the sprint change proposal §5 Blocker #5). The side-nav list itself remains capped at 5; this relocates the full list to a separate surface, respecting the original "no show more in MVP" rule by relocation, not by raising the cap.

---

## Parallelization Opportunities

All parallelization assumes team capacity allows and that the developer is comfortable with concurrent branches on different components.

### Within Wave 1

| Parallel set           | Rationale                                                                                         |
|------------------------|---------------------------------------------------------------------------------------------------|
| 7.8 ∥ 7.9 ∥ 7.6        | 7.8 touches the new-conversation page; 7.9 touches the side-nav empty-state region; 7.6 touches the side-nav avatar. Different components, no overlap. |
| 7.7 **after** 7.6      | 7.7 must wait for 7.6 — the avatar dropdown's "Settings" link is the path to the Settings page where the disconnect flow lives. |

**Recommended Wave 1 sequence:** Start 7.6 first (or 7.6 + 7.8 + 7.9 in parallel if capacity allows). Once 7.6 is done, start 7.7.

### Within Wave 2

| Parallel set           | Rationale                                                                                         |
|------------------------|---------------------------------------------------------------------------------------------------|
| 7.10 ∥ (7.11 + 7.12)   | 7.10 creates a new `not-found.tsx` file at the app root — entirely separate from `SideNavigation.tsx`. 7.11 and 7.12 are paired (both touch side-nav conversation hover interactions). |

**Recommended Wave 2 sequence:** 7.10 in parallel with 7.11+7.12 (implemented as one combined effort).

### Within Wave 3

| Parallel set           | Rationale                                                                                         |
|------------------------|---------------------------------------------------------------------------------------------------|
| 7.13 ∥ 7.14            | 7.13 is a client component in the Artifact Browser; 7.14 is a modal + Server Action on the side nav. Different components, different data sources, no overlap. |

**Recommended Wave 3 sequence:** 7.13 and 7.14 in parallel. Note 7.14's soft dependency on 7.5 — verify 7.5 status before starting; if 7.5 is not yet done, use the documented fallback.

### Across Waves

- **Wave 2 can start as soon as Wave 1's 7.6 is done** — 7.10 (the natural Wave 2 starter) has no dependency on anything from Wave 1. If capacity allows, 7.10 could begin while 7.7 is still in progress.
- **Waves should generally be sequential** to avoid merge conflicts on shared components. The side nav (`SideNavigation.tsx`) is touched by 7.6 (Wave 1), 7.9 (Wave 1), 7.11 (Wave 2), 7.12 (Wave 2), and 7.14 (Wave 3). Parallel work across waves on the same component invites conflicts.
- **No dependency on Epic 6** — all stories in 7.6–7.14 can proceed regardless of Epic 6's status (Epic 6 is `done` in sprint-status.yaml as of this plan).

---

## Sequencing Decisions Made (Beyond Source Documents)

These decisions were inferred from the source artifacts and are documented here for transparency:

1. **Linear order within Wave 1: 7.6 → 7.7 → 7.8 → 7.9.** The proposal §5 and the readiness report §Recommendations both specify "7.6 then 7.7, then 7.8 and 7.9" — 7.8 and 7.9 are unordered relative to each other but follow the two P0s. This plan preserves that: 7.8 and 7.9 can be done in either order (or in parallel) but come after the P0 dead ends.

2. **Linear order within Wave 2: 7.10 → 7.11 + 7.12.** The readiness report §Recommendations states "7.10, then 7.11 and 7.12 together." 7.10 is listed first because it is the simplest and most independent (new file, no shared-component risk); 7.11 + 7.12 are paired. However, since 7.10 is fully independent of 7.11+7.12, it can also be done in parallel — the "then" is a recommendation, not a hard constraint.

3. **7.11 + 7.12 treated as a single combined effort, not two sequential stories.** The readiness report and both story scope notes state "implement together." This plan sequences them as order 6+7 (a pair) rather than 6 then 7. The developer should create both story files, implement the shared hover-reveal pattern once, then wire delete (7.11) and rename (7.12) to the shared affordance.

4. **7.5 → 7.14 soft dependency confirmed non-blocking.** Story 7.5 is in the pre-existing set (7.1–7.5) and is `backlog` in sprint-status.yaml. If Wave 3 begins and 7.5 is not yet done, 7.14 ships with the documented fallback (relative-only without live updates, or absolute time). No hard wait.
