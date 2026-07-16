# Sprint Change Proposal: Dead Ends and Missing Maintenance Surfaces

**Date:** 2026-07-16
**Trigger:** Sally's UX audit of the bmad-easy implementation surfaced nine missing common-sense UX features — dead ends and missing maintenance hatches that the design never specified
**Scope Classification:** Moderate — extends existing Epic 7, adds PRD FRs for 2 items, UX spec amendments for all 9, architecture review for 5
**Status:** Approved — pre-authorized by Marius
**Mode:** Batch — assumptions documented in §Assumptions

---

## Section 1: Issue Summary

### Problem Statement

After Epic 7 was created (2026-07-13) to hold the first five live-usage UX gaps, a deeper UX audit by Sally against the PRD, EXPERIENCE.md, and the live code surfaced nine additional missing common-sense UX features. Like Epic 7's existing stories (7.1–7.5), these are **not mockup drift** — the mockups and specs simply never specified them. They are dead ends (no sign-out, no repository switch, no way out of the 10-conversation limit) and missing maintenance hatches (no rename, no delete, no recovery from stale bookmarks). These are the states, recovery paths, and maintenance surfaces that real usage demands but that a greenfield spec authored before launch could not anticipate.

Where Epic 7's first wave (7.1–7.5) addressed presentation gaps (error placement, loading feedback, focus prominence, relative timestamps), this second wave addresses **functional dead ends** — places where a non-developer user gets stuck with no in-product exit. The product's own error copy tells users to "sign out and sign back in" in five separate files, yet no sign-out affordance exists in the UI. The 10-conversation limit (FR-11) is a permanent wall with no delete. A wrong initial repository choice welds the user to that repo forever.

The nine findings fit Epic 7's theme ("Live-Usage UX Improvements") exactly, which is why they extend that epic rather than spawning a new one. They are the same category, surfaced by the same audit method, against the same live build.

### Evidence

The nine findings are concrete and surface-specific, with code-level evidence in each case:

| # | Story | Surface | Evidence |
|---|-------|---------|---------|
| 1 | Sign-out affordance | Side navigation / avatar | The `signOut` function is exported from `apps/web/src/lib/auth.ts` but wired to no UI element. The avatar in `SideNavigation.tsx` is a plain `<Link href="/settings">`, and Settings is a static placeholder. Error copy in five files instructs users to "sign out and sign back in": `CredentialErrorBanner.tsx:29`, `repository-validation.actions.ts:68,102`, `repo-connection.actions.ts:77,107`, `artifacts.actions.ts:66,88`. |
| 2 | Disconnect / switch repository | Settings / onboarding | `onboarding/page.tsx` hard-redirects to `/project-map` if a `RepoConnection` exists. No disconnect, switch, or re-point UI exists anywhere under `apps/web/src/components/` or `settings/`. FR-1 covers connecting but says nothing about disconnecting or switching. |
| 3 | Global 404 page | App root / every route segment | `find apps/web/src/app -name "not-found*"` returns nothing. Every other error state has a designed `error.tsx` with `<h1>` and Refresh buttons. Stale bookmarks, typos, deleted conversations, and access-revoked repos yield Next.js's default 404, which breaks out of AppShell and ignores design tokens. |
| 4 | Conversation delete | Side navigation | `SideNavigation.tsx` renders conversations as bare `<Link>` elements. Grep for "delete.*conversation" across `src` returns nothing. FR-11 caps users at 10 active conversations with a blocking message, but there is no way to clean up to make room — the limit is a permanent wall. |
| 5 | Conversation rename | Side navigation | `SideNavigation.tsx` — conversations are bare links with no edit affordance. Semantic titles are auto-generated (2–5 words) and may be wrong or unhelpful; users cannot correct "PRD discussion" to "Q3 pricing PRD." |
| 6 | New conversation intro prompt | Conversation / new page | `conversations/new/page.tsx:20` passes only `placeholder="Message bmad-easy…"` — a textarea placeholder invisible until the user starts typing. EXPERIENCE.md §New Conversation specifies the intro prompt copy ("Press `/` to browse available skills, or type a message to start."). The slash-command affordance — the single most important onboarding hint for a non-developer — is invisible until the user happens to type `/`. |
| 7 | Side-nav empty state | Side navigation | `SideNavigation.tsx` filters out null-title conversations and maps the rest, with no fallback for an empty array. When the conversation list is empty (new user, first session), the conversation region is blank space. |
| 8 | Artifact Browser search / filter | Artifact Browser | Grep for "search|filter" in `apps/web/src/app/(dashboard)/(app)/artifacts` and `components/artifact-browser` returns only unrelated matches (searchParams, frontmatter field filtering). Clean for six artifacts; at forty-plus across multiple types there is no way to find anything except scrolling. |
| 9 | Conversation search / show-more | Side navigation | EXPERIENCE.md §Side Navigation: "Below the 5th entry, no additional history is shown (no 'show more' in MVP)." `SideNavigation.tsx` renders only the server-query-limited conversations. Conversation #6+ is inaccessible except by direct URL. The 5-cap is a deliberate MVP cut, but the cliff is real — important conversations from last week disappear from the nav. |

### Consequences

- Findings 1 and 2 are **critical dead ends.** Users trapped in expired-token sessions, welded to a wrong or renamed repository, have no in-product recovery path. The product's own error copy creates an expectation ("sign out and sign back in") the UI does not fulfill.
- Finding 4 is a **functional wall.** The 10-conversation limit (FR-11) is a permanent block with no cleanup affordance — users who hit it are stuck.
- Finding 3 is a **recovery gap.** The one state without a designed surface (stale bookmarks, deleted conversations) dumps users into a default 404 that breaks out of the application shell.
- Findings 5, 6, and 7 are **polish and discoverability** issues — rename, the intro prompt, and the empty state — that compound the sense that the product is unfinished precisely where a non-developer user spends the most time.
- Findings 8 and 9 are **scale problems.** Invisible at low usage; they erode usability as artifact and conversation counts grow.

None of these blocks the MVP thesis (the application is functional and shipped), but the first four together represent dead ends that a non-developer user cannot escape without support intervention — exactly the audience bmad-easy exists to serve.

---

## Section 2: Impact Analysis

### Epic Impact

**Epic 7 (Live-Usage UX Improvements)** is the home for these stories. It was created by the 2026-07-13 sprint change proposal and currently holds stories 7.1–7.5 in `backlog`. These nine findings are the same category — live-usage UX gaps the spec never specified — so they extend Epic 7 rather than spawning a new epic. Splitting one coherent category across two epics would dilute both and complicate sprint tracking. **Epic 7 is extended, not reopened** (it was never closed — its stories are still in `backlog`).

**Epic 5 (UX Mockup Fidelity — Close Visual Drift)** is `done`, including its retrospective. It is **not touched** by this proposal. Epic 5's theme was "the mockups are authoritative; the code aligns to them" (epics.md line 931). These nine findings are the opposite direction — the specs need to evolve based on live usage — so reopening Epic 5 would conflate the two categories the project has already distinguished and would retroactively invalidate its retrospective.

**Epic 6 (Sandbox-Based Agent Execution)** is in `backlog`. It is **not touched** and has **no dependency**. Epic 6 is a backend execution migration; most of these stories are frontend interaction patterns. Two stories (7.6 sign-out token invalidation, 7.7 session cascade on repo disconnect) touch backend concerns but are independent of where the agent executes. The two epics can run in parallel.

| Epic | Status | Impact |
|-------|--------|--------|
| Epic 5 | done (incl. retrospective) | Not touched. Different category (mockup drift, not live-usage UX). |
| Epic 6 | backlog | Not touched. No dependency. Can run in parallel. |
| Epic 7 | backlog (5 stories) | Extended with 9 new stories (7.6–7.14). No existing story reopened or re-scoped. |

### Story Impact

No existing stories are modified or removed — not stories 7.1–7.5, and no stories from any other epic. Nine new stories are appended to Epic 7:

| New Story | Title | Finding | Priority |
|-----------|-------|---------|----------|
| 7.6 | Sign-out affordance | #1 | P0 |
| 7.7 | Disconnect / switch repository | #2 | P0 |
| 7.8 | New conversation intro prompt | #6 | P2 |
| 7.9 | Side-nav empty state | #7 | P2 |
| 7.10 | Global 404 page | #3 | P1 |
| 7.11 | Conversation delete | #4 | P1 |
| 7.12 | Conversation rename | #5 | P2 |
| 7.13 | Artifact Browser search / filter | #8 | P3 |
| 7.14 | Conversation search / show-more | #9 | P3 |

### PRD Impact

Two new functional requirements are needed:

1. **Session termination (sign-out).** Story 7.6 (Finding #1) introduces a sign-out affordance that ends the user's session and invalidates the session token. The PRD currently covers sign-in (GitHub OAuth, FR scope) but has no FR for the ability to end a session. A new FR is added specifying that a signed-in user can sign out from the in-product UI, which terminates the session and redirects to the sign-in page.

2. **Repository disconnection.** Story 7.7 (Finding #2) introduces the ability to disconnect the connected repository (and, by extension, switch repositories via disconnect + re-onboarding). FR-1 covers connecting a repository but says nothing about disconnecting or switching. A new FR is added specifying that a user can disconnect the connected repository from Settings, with a confirmation dialog warning about active conversations, after which sessions are terminated and the user is returned to onboarding.

No existing FRs are contradicted. FR-11 (the 10-conversation limit) is not changed in wording but is no longer a permanent wall once Story 7.11 (conversation delete) ships — a clarification note is added to FR-11 referencing the delete capability.

### UX Spec Impact

EXPERIENCE.md is amended with interaction patterns for all nine items. No patterns are removed; the amendments add patterns the spec never specified. The locations and the patterns added:

- **§Side Navigation (avatar):** the avatar transforms from a plain link to `/settings` into a dropdown menu containing "Sign out" and future account items (Story 7.6).
- **§Side Navigation (conversation list):** gains a delete action per conversation with a confirmation dialog (Story 7.11); gains inline rename via double-click / hover edit icon (Story 7.12); gains an empty state ("No conversations yet") when the list is empty (Story 7.9); gains a "Show all" link opening a full conversation list view (Story 7.14).
- **§Settings:** gains a real "Repository" section with a "Disconnect" action and confirmation dialog warning about active conversations (Story 7.7). The existing "coming soon" static placeholder is replaced with real content.
- **§New Conversation:** gains the introductory prompt — "Press `/` to browse available skills, or type a message to start." — as platform copy centered in the chat-messages panel, mirroring the happy-path greeting treatment from Story 7.1 (Story 7.8). This replaces the textarea-only-placeholder implementation.
- **§Error States / 404:** gains a `not-found.tsx` page pattern mirroring the canonical `error.tsx` structure, with `<h1 tabIndex={-1}>` for AppShell route-focus management (Story 7.10).
- **§Artifact Browser:** gains a search input pattern at the top of the artifact list with live title-substring filtering, optional type filter (dropdown or pills), a clear button, and URL query-param persistence (Story 7.13).
- **§Conversation List (full):** gains a full conversation list pattern (modal/overlay or dedicated `/conversations` page) with title search and scrollable history, reached via the "Show all" link (Story 7.14).

### Architecture Impact

Five items require backend review — these touch concerns beyond frontend presentation:

1. **Sign-out token invalidation (Story 7.6).** Calling `signOut()` from Auth.js ends the client session; the architecture review confirms whether the JWT is truly invalidated server-side or merely discarded client-side, and whether the 8h `maxAge` session window (Auth.js v5) requires any server-side revocation list for expired-token recovery.
2. **Repository disconnect session cascade (Story 7.7).** On disconnect: terminate active sessions bound to the repository, delete the `RepoConnection` record, clean up credentials, and handle in-flight conversations. The cascade must not leave orphaned sessions or credentials.
3. **Conversation delete endpoint + cleanup (Story 7.11).** A Server Action (or endpoint) to delete a conversation record and its chat history, terminate the active session if the conversation has one, and produce a consistent side-nav refresh / redirect.
4. **Conversation rename endpoint (Story 7.12).** A Server Action to update the conversation title. Confirms the data model change is a simple title-field update (already exists for auto-generated titles).
5. **Conversation and artifact search query patterns (Stories 7.13, 7.14).** Two search surfaces (artifact list, full conversation list). For MVP both are likely client-side filters of server-rendered lists; the architecture review confirms whether the existing server query limits (the 5-conversation cap on the side nav) need a new unbounded query path for the full conversation list, and whether artifact filtering should remain client-side or move server-side at scale.

Items 1 and 2 are independent of Epic 6's backend execution migration — they concern Auth.js session lifecycle and the `RepoConnection` / sandbox data model, not where the agent executes.

### Technical Impact

- **Code:** Frontend-first across all nine stories (interaction patterns, components, routes). Five stories additionally touch backend: Server Actions / endpoints for delete and rename (7.11, 7.12), the sign-out token path (7.6), the disconnect cascade (7.7), and search query paths (7.13, 7.14). No schema migrations are required — conversation titles already exist; `RepoConnection` deletion and conversation deletion use existing models.
- **Infrastructure:** None.
- **Deployment:** None.
- **Testing:** Each story that adds a confirmation dialog (7.7, 7.11) needs dialog-interaction tests. Stories 7.6 and 7.7 need tests asserting the side effects (session ended, sessions terminated, records deleted). Stories 7.12 needs inline-edit tests (Enter saves, Escape cancels). Stories 7.13 and 7.14 need filter/search behavior tests and URL-query-param persistence tests.

---

## Section 3: Recommended Approach

### Selected: Extend Epic 7 — Stories 7.6–7.14

Append nine new stories to Epic 7 and apply the PRD, UX spec, and architecture amendments. **Do not create Epic 8.** Do not reopen Epic 5 or any closed epic. Do not rollback any completed work (these are net-new affordances, not corrections of broken work).

### Rationale

1. **Category match.** Epic 7's theme is live-usage UX improvements. These nine findings are live-usage UX improvements, surfaced by the same audit method against the same live build. They belong in the same epic; splitting them into Epic 8 would fragment a single coherent category across two backlogs for no benefit.

2. **Epic 7 is open.** Epic 7 was created three days ago and its stories are still in `backlog`. Extending an open epic with findings from a continuation of the same audit is normal change-management hygiene — no closed epic is reopened, no retrospective is invalidated.

3. **One proposal, not two.** The nine findings were triaged and selected together by Marius in one audit pass (two further findings — toast system and command palette — were excluded). Bundling them in one proposal keeps the decision rationale in one place and lets the sprint plan sequence them by wave in a single pass.

4. **PRD changes are additions, not scope changes.** Two new FRs (session termination, repository disconnection) are added to cover affordances the MVP shipped without; they do not change MVP goals, success metrics, or scope. A clarification note on FR-11 (the 10-conversation limit is no longer a permanent wall once delete ships) is a presentation-level refinement. This keeps the change below the "Major" threshold that would require PM/Architect strategic intervention.

5. **No dependency on Epic 6.** Five of the nine stories touch backend concerns, but all are independent of where the agent executes. They can ship ahead of, or during, Epic 6.

### Alternatives Considered and Rejected

**New Epic 8.** Rejected — splits one coherent category (live-usage UX gaps from one audit) across two epics and complicates tracking for no benefit.

**Reopen Epic 5 with Stories 5.6+.** Rejected — conflation of categories (mockup drift vs. live-usage UX) and invalidates the retrospective, same reasoning as the 2026-07-13 proposal.

**Fold into Epic 6.** Rejected — Epic 6 is a backend execution migration; mixing frontend interaction patterns and dead-end recovery into it dilutes both and couples independent timelines.

**Two proposals (P0s first, then P1–P3).** Rejected — the findings document explicitly decided on one proposal. Wave sequencing within the sprint plan handles prioritization; one proposal keeps the decision rationale intact.

**Rollback / revert.** Rejected — nothing is broken. These are missing affordances, not defects requiring reversal.

### Effort, Risk, and Timeline

| Dimension | Assessment |
|------------|------------|
| **Effort** | Medium-high (9 stories; 2 new PRDs; UX spec amendments across 7 sections; 5 architecture reviews). Frontend-led; backend touches are endpoint/cascade work, not schema migrations. |
| **Risk** | Low–medium. Sign-out (7.6) and repo disconnect (7.7) are the highest-impact dead ends and carry the most backend care (token invalidation, session cascade). Conversation delete (7.11) is destructive and permanently deletes data — the confirmation dialog is mandatory, not optional. Rename, 404, intro prompt, and empty state are low-risk. Search surfaces (7.13, 7.14) are P3 and can be deferred until usage justifies. |
| **Timeline** | Multi-sprint. Recommend the three-wave sequencing below; Wave 1 unblocks the two critical dead ends plus two trivial wins, Wave 2 adds the maintenance hatches, Wave 3 adds scale features. |
| **MVP impact** | MVP already shipped; no goal/scope change. Two new FRs are additions, not revisions of shipped scope. |

---

## Section 4: Detailed Change Proposals

### 4.1 Story Mapping Summary

| Finding | Priority | New story | Surfaces | Backend? |
|---------|----------|-----------|----------|----------|
| #1 Sign-out affordance | P0 | 7.6 | Side navigation / avatar | Yes — token invalidation |
| #2 Disconnect / switch repository | P0 | 7.7 | Settings | Yes — session cascade |
| #6 New conversation intro prompt | P2 | 7.8 | New conversation | No |
| #7 Side-nav empty state | P2 | 7.9 | Side navigation | No |
| #3 Global 404 page | P1 | 7.10 | App root / every route segment | No |
| #4 Conversation delete | P1 | 7.11 | Side navigation | Yes — endpoint + cleanup |
| #5 Conversation rename | P2 | 7.12 | Side navigation | Yes — endpoint |
| #8 Artifact Browser search / filter | P3 | 7.13 | Artifact Browser | Yes — query pattern |
| #9 Conversation search / show-more | P3 | 7.14 | Side navigation / full list view | Yes — query pattern |

### 4.2 Wave Sequencing

Sprint plan should sequence waves in order within Epic 7:

| Wave | Stories | Findings | Priority | Rationale |
|---|---|---|---|---|
| 1 | 7.6, 7.7, 7.8, 7.9 | #1, #2, #6, #7 | P0 + free wins | Dead ends unblocked; trivial wins ride along in the same pass. |
| 2 | 7.10, 7.11, 7.12 | #3, #4, #5 | P1 + P2 | Maintenance hatches; the conversation limit is a wall without delete. |
| 3 | 7.13, 7.14 | #8, #9 | P3 | Scale features; design now, implement when usage justifies. |

### 4.3 Stories — New Epic 7 stories appended to `epics.md`

The nine stories below are appended to Epic 7 after Story 7.5. Each is described with its intent and key behaviors; full Given/When/Then acceptance criteria are authored at story-creation time (per the project's story format) using the design decisions in the findings document as input.

---

#### Story 7.6: Sign-out affordance

As a signed-in user with an expired or failing session, I want a visible way to sign out and end my session, so that I can recover from credential failures the way the product's own error messages tell me to — without contacting support.

The avatar in the side navigation becomes a dropdown menu containing a "Sign out" action (and room for future account items). Selecting "Sign out" calls the existing `signOut()` function from `apps/web/src/lib/auth.ts` and redirects to `/sign-in`. This unblocks the dead end where error copy in five separate files tells users to "sign out and sign back in" but no sign-out UI exists. The avatar remains the account surface; this is the smallest change that unblocks recovery without forcing a full Settings page redesign. Requires a PRD FR for session termination, a UX spec amendment for the dropdown pattern, and an architecture review confirming token invalidation behavior.

---

#### Story 7.7: Disconnect / switch repository

As a user who connected the wrong repository, whose repository was renamed, or whose team migrated to a new repository, I want to disconnect or re-point my connected repository, so that I am not permanently welded to my first choice.

A "Repository" section is added to Settings with a "Disconnect" action. Disconnect requires a confirmation dialog warning that active conversations will be terminated. On disconnect: terminate active sessions bound to the repository, delete the `RepoConnection` record, clean up credentials, and redirect to `/onboarding`. Switching repositories is the same flow — disconnect then re-onboard. This gives users an in-product recovery path for wrong-repo, renamed-repo, and team-migration scenarios that currently have no exit. Requires a PRD FR for repository disconnection, a UX spec amendment for the confirmation flow, and an architecture review for the session cascade and credential cleanup.

---

#### Story 7.8: New conversation intro prompt

As a non-developer user opening a new conversation for the first time, I want to see the slash-command hint without having to discover it by accident, so that I learn how to invoke a skill.

The chat area on the new-conversation page renders the spec's introductory prompt — "Press `/` to browse available skills, or type a message to start." — as platform copy centered in the chat-messages panel, mirroring the happy-path greeting treatment established by Story 7.1. This replaces the current implementation which passes only a textarea placeholder invisible until the user starts typing. The slash-command affordance — the single most important onboarding hint for a non-developer — becomes visible on first view. Requires a UX spec note confirming the copy and placement; no PRD or architecture changes.

---

#### Story 7.9: Side-nav empty state

As a new user on my first session, or after deleting all my conversations, I want the empty conversation region in the side nav to tell me so rather than show blank space, so that the most persistent surface in the shell does not look broken.

When the conversation list is empty, the side nav's conversation region shows muted "No conversations yet" text (optionally with a subtle arrow pointing up to the New Conversation button) rather than blank space. This is polish for the side nav, the most persistent surface in the application shell. Requires a UX spec note; no PRD or architecture changes.

---

#### Story 7.10: Global 404 page

As a user who hits a stale bookmark, typo, deleted conversation, or access-revoked repository URL, I want a designed error page that keeps me inside the application shell and offers a way back, so that I am not dumped into a default Next.js 404 that breaks the layout.

A `not-found.tsx` is added at the app root, mirroring the canonical `error.tsx` structure already used for every other error state: full-page shell, centered message, link back to Project Map, design tokens respected, and `<h1 tabIndex={-1}>` so AppShell route-focus management continues to work. This closes the one gap in an otherwise rigorous error-state system. Optionally additional `not-found.tsx` files may be added at route segments. Requires a UX spec amendment for the 404 page pattern; no PRD or architecture changes.

---

#### Story 7.11: Conversation delete

As a user who has hit the 10-conversation limit or wants to clean up old conversations, I want to delete conversations, so that the limit is a manageable constraint rather than a permanent wall.

A delete action is added to each conversation in the side nav (hover-revealed trash icon, or a context menu on hover/click). Delete requires a confirmation dialog: "Delete this conversation? This cannot be undone." On delete: terminate the active session if the conversation has one, delete the conversation record and chat history, remove it from the side nav, and redirect to Project Map if the deleted conversation was the active one. This turns the FR-11 10-conversation limit from a permanent wall into a manageable constraint. Requires a UX spec amendment for the delete confirmation and side-nav interaction, and an architecture review for the endpoint, session termination, and data cleanup.

---

#### Story 7.12: Conversation rename

As a user reading a conversation whose auto-generated title is wrong or unhelpful, I want to rename it, so that I can fix "PRD discussion" to "Q3 pricing PRD."

Inline rename is added to side nav conversations. Double-click the title (or click an edit icon on hover) to enter edit mode; Enter saves, Escape cancels. A Server Action updates the conversation title and the side nav refreshes. This lets users correct the auto-generated semantic titles that misfire. Requires a UX spec amendment for the inline-edit pattern, and an architecture review confirming the endpoint is a simple title-field update.

---

#### Story 7.13: Artifact Browser search / filter

As a user with forty-plus artifacts across multiple types, I want to search and filter the artifact list by title and type, so that I can find what I need without scrolling.

A search input is added at the top of the artifact list in the Artifact Browser. It filters by title (substring match) and optionally by artifact type (dropdown or pills). The list updates live as the user types, with a clear button to reset. Filter state persists in URL query params for shareable filtered views. For MVP this is likely a client-side filter of the server-rendered list. This scales the browser beyond the six-artifact happy path. Requires a UX spec amendment for the search input and filter pattern, and an architecture review for the query pattern.

---

#### Story 7.14: Conversation search / show-more

As a user whose important conversations from last week have fallen off the 5-entry side-nav cap, I want to find and open them, so that they are not inaccessible except by direct URL.

A "Show all" link is added at the bottom of the conversation list in the side nav. Clicking opens a full conversation list view (modal/overlay or dedicated `/conversations` page) with search by title and scrollable history. Selecting a conversation navigates to it. This respects the spec's "no show more in side nav" rule by moving the full list to a separate surface, addressing the cliff where conversations beyond #5 become inaccessible. Requires a UX spec amendment for the full conversation list pattern, and an architecture review for the query pattern (the side nav's 5-cap query is deliberate; the full list needs an unbounded query path).

---

### 4.4 UX Spec amendments

EXPERIENCE.md is amended across seven sections; no patterns are removed. The amendments add interaction patterns the spec never specified. Exact replacement text is finalized by Sally (UX Designer) at edit time using the design decisions in the findings document; the proposal identifies the locations and the patterns added.

| Spec section | Amendment | Stories |
|---|---|---|
| §Side Navigation → avatar | Avatar becomes a dropdown menu: trigger on the avatar circle, containing "Sign out" (and future account items). Trigger and item affordances follow the existing dropdown-component conventions. | 7.6 |
| §Side Navigation → conversation list (delete) | Per-conversation delete affordance (hover-revealed trash icon or context menu); confirmation dialog "Delete this conversation? This cannot be undone." On confirm: remove from list, redirect to Project Map if active. | 7.11 |
| §Side Navigation → conversation list (rename) | Inline rename: double-click title or hover edit icon to enter edit mode; Enter saves, Escape cancels; side nav refreshes on save. | 7.12 |
| §Side Navigation → conversation list (empty state) | When the conversation array is empty, show muted "No conversations yet" (optional up-arrow cue to New Conversation). | 7.9 |
| §Side Navigation → conversation list (show all) | "Show all" link below the list; opens full conversation list surface (modal/overlay or `/conversations` page) with title search and scrollable history. Respects the MVP "no show more in side nav" rule by relocating the full list. | 7.14 |
| §Settings | Replace static "coming soon" placeholder with a real "Repository" section: connected-repo summary + "Disconnect" action + confirmation dialog warning about active conversations. | 7.7 |
| §New Conversation | Render the introductory prompt — "Press `/` to browse available skills, or type a message to start." — as platform copy centered in the chat-messages panel (same treatment as the happy-path greeting, Story 7.1). Not a textarea placeholder. | 7.8 |
| §Error States (404) | Add a `not-found.tsx` page pattern mirroring `error.tsx`: full-page shell, centered message, link back to Project Map, design tokens, `<h1 tabIndex={-1}>` for AppShell route-focus. | 7.10 |
| §Artifact Browser | Add search input at list top: live title-substring filter, optional type filter (dropdown or pills), clear button, URL query-param persistence. | 7.13 |

### 4.5 PRD updates

**Artifact:** `_bmad-output/planning-artifacts/prds/prd-bmad-easy-2026-06-14/prd.md`

Two new functional requirements are added (exact numbering assigned by PM at edit time):

1. **New FR — session termination (sign-out).** A signed-in user can sign out from the in-product UI (avatar dropdown). Signing out ends the session, invalidates the session token, and redirects to the sign-in page. Added per Story 7.6 / Finding #1.

2. **New FR — repository disconnection.** A user with a connected repository can disconnect it from Settings. Disconnection requires a confirmation dialog warning that active conversations will be terminated. On disconnection: active sessions are terminated, the `RepoConnection` record is deleted, credentials are cleaned up, and the user is redirected to onboarding (allowing a new repository to be connected — repository switching). Added per Story 7.7 / Finding #2.

3. **FR-11 clarification (not a contradiction).** FR-11 caps users at 10 active conversations with a blocking message. Once Story 7.11 (conversation delete) ships, the limit is no longer a permanent wall — a clarifying note is appended to FR-11 referencing the delete capability. No wording of the limit itself changes.

### 4.6 Architecture amendments

`architecture.md` gains review notes for the five backend-touching items, authored at implementation prep time:

1. **Sign-out token invalidation (Story 7.6).** Confirm whether `signOut()` invalidates the JWT server-side (Auth.js v5 behavior) or merely discards the client session, and whether the 8h `maxAge` session window needs any server-side revocation list for expired-token recovery.
2. **Repository disconnect session cascade (Story 7.7).** Define the disconnect side-effect sequence: terminate active sessions bound to the repository → delete `RepoConnection` → clean up credentials → handle in-flight conversations. Ensure no orphaned sessions or credentials remain.
3. **Conversation delete endpoint + cleanup (Story 7.11).** Define the Server Action / endpoint: delete conversation record + chat history, terminate active session if present, return a consistent state for side-nav refresh and (if active) redirect to Project Map.
4. **Conversation rename endpoint (Story 7.12).** Confirm the data model change is a simple title-field update (the field already holds auto-generated titles).
5. **Conversation and artifact search query patterns (Stories 7.13, 7.14).** For MVP, both are client-side filters of server-rendered lists. Confirm whether the full conversation list (Story 7.14) needs an unbounded query path distinct from the side nav's deliberate 5-cap. Confirm whether artifact filtering should remain client-side or move server-side at scale.

### 4.7 Epics — append stories and update sprint-status.yaml

**Artifact:** `_bmad-output/planning-artifacts/epics.md` (Epic 7 section, after Story 7.5) and `_bmad-output/implementation-artifacts/sprint-status.yaml`.

Append Stories 7.6–7.14 to Epic 7 in `epics.md` using the project's story format (As a / I want / So that + Given/When/Then acceptance criteria + scope notes), with the design decisions from the findings document as input.

Append the new story entries to `sprint-status.yaml` after the existing `7-5-...` line:

```yaml
  7-6-sign-out-affordance: backlog
  7-7-disconnect-or-switch-repository: backlog
  7-8-new-conversation-intro-prompt: backlog
  7-9-side-nav-empty-state: backlog
  7-10-global-404-page: backlog
  7-11-conversation-delete: backlog
  7-12-conversation-rename: backlog
  7-13-artifact-browser-search-or-filter: backlog
  7-14-conversation-search-or-show-more: backlog
```

Also update the top-of-file `last_updated` timestamp to the current UTC datetime on the day this is applied.

### 4.8 Post-implementation (non-blocking)

- `project-context.md` — document the avatar-dropdown, repo-disconnect, conversation-delete, and search patterns once the relevant stories ship. Not a prerequisite for implementation.

---

## Section 5: Implementation Handoff

### Scope Classification: Moderate

Moderate, not Minor, because it requires **UX spec reconciliation** (seven EXPERIENCE.md sections amended), **two new PRD FRs** (session termination, repository disconnection), and **five architecture review items** alongside nine new stories — this is spec/PO coordination, not a pure Developer-only change. It does not rise to Major: no architectural replan, no MVP goal/scope change, no PM/Architect strategic intervention needed beyond sign-off on the two destructive-action confirmation dialogs (7.7 repo disconnect, 7.11 conversation delete) and the token-invalidation behavior (7.6).

### Handoff Recipients

| Role | Responsibility | Deliverable |
|------|---------------|-------------|
| **PM (John)** | Approve this proposal; apply the two new PRDs (§4.5) and the FR-11 clarification. | Updated PRD. |
| **UX Designer (Sally)** | Approve the EXPERIENCE.md amendments (§4.4); finalize exact replacement text for the seven amended sections and confirm the dropdown, confirmation-dialog, inline-edit, empty-state, 404, and search patterns. | Updated EXPERIENCE.md. |
| **Architect (Winston)** | Approve the five architecture review items (§4.6); confirm token invalidation, session cascade, and the query-pattern decisions. | Updated architecture.md review notes. |
| **Developer (Amelia)** | Append Stories 7.6–7.14 to `epics.md`; add the sprint-status.yaml entries (§4.7); implement stories one at a time via `bmad-dev-story`, sequenced by wave. | New stories, sprint-status entries, working stories. |
| **QA** | Dialog-interaction tests (7.7, 7.11); side-effect tests for sign-out and disconnect (7.6, 7.7); inline-edit tests (7.12); filter/search + URL-query-param tests (7.13, 7.14); 404 routing test (7.10). | Updated/added tests. |

### Recommended Implementation Order

1. **Wave 1 — 7.6, 7.7, then 7.8, 7.9.** The two P0 dead ends first (sign-out, repo disconnect); the two trivial wins (intro prompt, empty state) ride along in the same pass since they touch the same side-nav / new-conversation surfaces.
2. **Wave 2 — 7.10, 7.11, 7.12.** The 404 page closes the error-state gap; conversation delete relieves the FR-11 wall; rename adds the maintenance hatch. Delete and rename share the side-nav conversation interaction — implement together.
3. **Wave 3 — 7.13, 7.14.** Scale features for artifact and conversation search. Design the patterns now; implement when usage justifies.

### Success Criteria

1. A visible "Sign out" action is reachable from the avatar dropdown; selecting it ends the session and redirects to `/sign-in`. (7.6)
2. A "Disconnect" action in Settings terminates sessions, deletes the `RepoConnection`, cleans up credentials, and returns the user to onboarding. (7.7)
3. The new-conversation page shows the intro prompt as platform copy on first view. (7.8)
4. The side-nav conversation region shows "No conversations yet" when empty. (7.9)
5. Stale-bookmark, typo, and deleted-conversation URLs render a designed 404 inside the application shell with a link back to Project Map. (7.10)
6. Each conversation in the side nav has a delete affordance with a confirmation dialog; deleting removes the conversation, terminates its active session if any, and redirects to Project Map if it was active. (7.11)
7. Each conversation in the side nav has an inline rename affordance; Enter saves, Escape cancels, the side nav refreshes. (7.12)
8. The Artifact Browser has a search input that filters by title (and optionally type), updates live, persists in URL query params, and clears on demand. (7.13)
9. A "Show all" link opens a full conversation list with title search and scrollable history; selecting an entry navigates to that conversation. (7.14)
10. The PRD has new FRs for session termination and repository disconnection; FR-11 has the delete-capability clarification.
11. EXPERIENCE.md reflects the seven amended sections; architecture.md has the five review notes.
12. `sprint-status.yaml` contains Epic 7 stories 7.6–7.14 in `backlog`.

---

## Assumptions

Documented decisions made on the user's behalf in Batch mode (no interactive halts):

1. **Mode = Batch.** Per task instructions, Batch is selected: all changes presented at once, no per-edit approval loop.

2. **Extend Epic 7, do not create Epic 8.** The nine findings are the same category as Epic 7's existing stories (live-usage UX gaps from one audit). They extend the open epic rather than spawning a new one. Epic 7 is `backlog` (open), so this is normal scope growth, not a reopened-closed-epic situation.

3. **One proposal, not two.** The findings document explicitly decided on one proposal covering all nine findings (two further findings — toast system and command palette — were excluded by Marius). Wave sequencing within the sprint plan handles prioritization.

4. **Sign-out pattern = avatar dropdown.** Per the findings design decision: the avatar becomes a dropdown menu (sign-out + future account items). This is the smallest change that unblocks the dead end without forcing a full Settings page redesign. A full account-settings page is explicitly out of scope.

5. **Story-number ordering follows priority-based mapping, not a naive sequential-by-finding-number.** Finding #1 → 7.6, #2 → 7.7, #6 → 7.8, #7 → 7.9 (Wave 1); #3 → 7.10, #4 → 7.11, #5 → 7.12 (Wave 2); #8 → 7.13, #9 → 7.14 (Wave 3). This keeps wave-adjacent stories numerically adjacent for cleaner sprint tracking. The alternative ordering in the task brief (which referenced 7.15) is treated as a typo and corrected.

6. **Conversation delete is permanent, not archive.** Per the findings design decision: the confirmation dialog states "This cannot be undone." On delete, the conversation record and chat history are deleted, not archived. An archive/restore capability is explicitly out of scope.

7. **Repo switch = disconnect + re-onboard.** Switching repositories is not a separate flow — it is disconnect followed by the existing onboarding redirect. No dedicated "switch repository" UI is built.

8. **Both PRD changes are new FRs, not extensions of existing FRs.** Session termination is a new FR (the PRD covers sign-in but not sign-out). Repository disconnection is a new FR (FR-1 covers connecting only). The findings document left repo-disconnect open ("extend FR-1 or new FR"); this proposal decides on a new FR for clarity.

9. **The "architecture review for 5" combines conversation and artifact search into one review item.** Stories 7.13 and 7.14 both add search query patterns; they are reviewed together as one architecture item ("conversation/artifact search query patterns") rather than two.

10. **Five backend-touching items do not require schema migrations.** Conversation titles already exist (used by auto-generated semantic titles). `RepoConnection` deletion and conversation deletion use existing models. Search is client-side filtering of server-rendered lists for MVP.

11. **No existing stories are reopened.** Stories 7.1–7.5 are amended only in the spec-requirement sense (EXPERIENCE.md sections they implemented against gain new patterns); no story is re-scoped or re-opened. The new stories carry the delta.

12. **Spec artifact edits are specified in this proposal but not applied by this run.** Following the pattern of the 2026-07-13 proposal, this run produces the *proposal* document only. The actual edits to epics.md, sprint-status.yaml, EXPERIENCE.md, the PRD, and architecture.md are post-approval implementation steps carried out by the handoff recipients in §5. The proposal identifies the locations and the patterns so approval triggers direct application.

13. **Full Given/When/Then acceptance criteria for each story are authored at story-creation time**, not in this proposal. The proposal gives one-paragraph descriptions plus the design decisions from the findings document as input; the dev-story workflow authors the ACs. This keeps the proposal at a readable length while preserving the detail needed to write the stories.

---

## Blockers / Decisions Needing Human Sign-off Before Implementation

1. **Destructive-action confirmation dialogs (Stories 7.7, 7.11).** Repository disconnect terminates active sessions; conversation delete permanently deletes chat history. These are destructive, irreversible operations. The confirmation-dialog copy and the exact destruction side-effect sequence should be explicitly confirmed by the UX Designer (copy) and Architect (side effects) before implementation.

2. **Sign-out token invalidation behavior (Story 7.6).** Whether `signOut()` in Auth.js v5 truly invalidates the JWT server-side or merely discards the client session affects whether expired-token recovery actually works. The Architect should confirm the behavior; if server-side revocation is required, Story 7.6's backend scope grows.

3. **PRD additions require PM sign-off.** Two new FRs (session termination, repository disconnection) are additions to the product contract. While they do not change MVP goals or scope (they add affordances the shipped product lacked), the PRD is the product contract and any edit should be explicitly approved by the PM (John) before it lands.

4. **EXPERIENCE.md amendments require UX Designer sign-off.** Seven sections of the UX spec are amended. The UX Designer (Sally) should finalize the exact replacement text for each pattern (dropdown, confirmation flow, inline edit, empty state, 404, search input, full conversation list) before implementation.

5. **Full conversation list surface choice (Story 7.14).** The findings document leaves open whether the full conversation list is a modal/overlay or a dedicated `/conversations` page. This is a UX decision that affects routing and should be confirmed by Sally before implementation.
