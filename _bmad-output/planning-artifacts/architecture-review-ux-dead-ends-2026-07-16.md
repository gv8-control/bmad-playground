# Architecture Review: UX Dead-Ends Findings

**Date:** 2026-07-16
**Author:** Winston (Architect)
**Source findings:** `_bmad-output/planning-artifacts/ux-dead-ends-findings-2026-07-16.md`
**Architecture doc:** `_bmad-output/planning-artifacts/architecture.md`

---

## Scope

Five findings from the UX dead-ends audit have architecture implications. This review documents the changes needed for each, identifies conflicts with existing architecture rules, and recommends the simplest viable approach. Findings 3, 6, and 7 have no architecture impact (frontend-only) and are excluded.

---

## Summary Table

| # | Finding | Architecture Impact | New Endpoints | New Server Actions | DDL Changes |
|---|---------|--------------------|---------------|-------------------|-------------|
| 1 | Sign-out | **None** — frontend-only wiring | No | No | No |
| 2 | Repo disconnect/switch | **Moderate** — new Server Action + a "terminate all" endpoint | Yes (1) | Yes (1) | No |
| 4 | Conversation delete | **Minimal** — endpoint already exists | No | No (browser-direct call) | No |
| 5 | Conversation rename | **Minimal** — new Server Action (Prisma update) | No | Yes (1) | No |
| 8+9 | Artifact search + conversation search | **Low** — client-side filter + new Server Action | No | Yes (1) | No |

---

## 1. Sign-Out (Finding 1)

### What changes

Auth.js `signOut()` is already exported from `apps/web/src/lib/auth.ts:18`. The `SideNavigation.tsx` avatar is currently a plain `<Link href="/settings">` (`SideNavigation.tsx:90`). The change replaces this link with a dropdown menu that calls `signOut({ redirectTo: '/sign-in' })`.

No new backend endpoint, Server Action, or data model change is needed. This is a frontend-only wiring task.

### Token invalidation

The platform uses two tokens:

- **Auth.js session JWT** (`apps/web/src/lib/auth.ts:21`) — stateless, 8h `maxAge`, stored in the session cookie. `signOut()` clears the client-side session cookie. Because it is stateless (no server-side session store), there is no server-side revocation step — the cookie is gone and subsequent requests are unauthenticated. This is the documented Auth.js v5 JWT-session model and is acceptable for MVP.

- **Boundary JWT** (`apps/web/src/lib/boundary-jwt.ts:3`) — minted via `mintBoundaryJwt(userId)`, HS256, 8h expiry, keyed by `AUTH_SECRET`. This token is **not explicitly invalidated on sign-out**. It expires naturally after its 8h TTL. This is acceptable for MVP because: (a) the boundary JWT is only usable with a valid Auth.js session (the browser holds it in memory, not in a persistent cookie), and (b) `ActiveUserGuard` in agent-be performs a live `User` lookup on every privileged request — a signed-out user's token alone cannot perform privileged operations (NFR-S3 active termination is deferred, but the per-request guard catches the next request).

### Active sandboxes

Sign-out does **not** terminate active sandboxes. Sandboxes continue until idle timeout (the `IdleTimeoutService` 60s/`MID_SESSION_IDLE_TIMEOUT_MS` path in `ConversationsService`) or explicit conversation termination via `DELETE /api/conversations/:id`. This is by design — the user may sign back in and resume the conversation (FR-13 session recovery). `signOut()` is a session-boundary event, not a resource-cleanup event.

### Architecture impact

**Minimal.** No new services, endpoints, or data model changes. Frontend-only: replace the `<Link>` in `SideNavigation.tsx` with a Radix dropdown (`components/ui/dropdown-menu.tsx` — already in the shadcn/ui set) containing "Sign out" calling `signOut({ redirectTo: '/sign-in' })`.

### NFRs affected

- **NFR-S2 (per-user credential isolation):** No change. The boundary JWT is scoped to `userId`; sign-out removes the client-side session.
- **NFR-R1 (credential health propagation):** No change.

---

## 2. Repo Disconnect / Switch (Finding 2)

### What changes

New Server Action in `apps/web/src/actions/repo-disconnect.actions.ts` that deletes the `RepoConnection` record. Before deletion, all active sandboxes for the user must be terminated.

### Sandbox cascade

The sequence (confirmed against the existing `ConversationsService.abandonConversation` pattern):

1. Identify all active conversations for the user (conversations where `sandboxStatus` is `'provisioning'` or `'ready'`).
2. For each active conversation, terminate the sandbox and delete the conversation record.
3. Delete the `RepoConnection` record.
4. Redirect to `/onboarding`.

### Credential cleanup

The OAuth token is stored encrypted in the `OAuthCredential` table (not in `RepoConnection`). The `OAuthCredential` is linked to `User` via `onDelete: Cascade` (`schema.prisma:38`). Deleting the `RepoConnection` does **not** delete the `OAuthCredential` — the GitHub OAuth token persists so the user can reconnect after onboarding. This is the correct behavior: disconnect is a repo-level operation, not an account-level operation. Re-authentication is a separate concern (handled by the Credential Error Banner's re-auth flow).

Deleting `RepoConnection` **does** cascade-delete `Artifact` records (`schema.prisma:70`, `onDelete: Cascade`). This wipes the mirrored artifact cache, which is the desired behavior — the artifacts belong to the disconnected repo.

### Architecture conflict: apps/web → apps/agent-be server-to-server call

The architecture explicitly forbids server-to-server calls between `apps/web` and `apps/agent-be`:

> "apps/web never calls apps/agent-be server-to-server — all non-live data is read directly from Postgres by apps/web; only the live REST+SSE interaction is browser-direct to apps/agent-be."

This rule appears in `architecture.md:209`, `architecture.md:631`, `project-context.md:91`, and `architecture.md:265`.

The disconnect flow needs to terminate sandboxes, and **only `apps/agent-be` knows which sandboxes are currently active**: the `sandboxIds` map is an in-memory `Map<string, string>` in `ConversationsService` (`conversations.service.ts:30`), and the `IdleTimeoutService` holds active timers. `apps/web` cannot query Daytona directly — it has no Daytona API key and no `@daytonaio/sdk` dependency.

Furthermore, the `sandboxStatus` column in Postgres is unreliable for determining which sandboxes need active termination: a conversation may be marked `'ready'` in Postgres but the sandbox may have already been torn down by idle timeout (and the DB not yet updated), or the conversation may be `'idle-timeout'` but the Daytona sandbox still running (orphan risk, accepted for MVP).

### Recommended resolution: new agent-be endpoint + browser-direct call

**Option chosen:** Add a new agent-be endpoint `DELETE /api/conversations` (no `:id` param) to `ConversationsController` that terminates all active sandboxes and conversations for the authenticated user. The browser calls this endpoint **directly** (browser → agent-be via boundary JWT, the established pattern), then calls the Server Action to delete the `RepoConnection`.

**Sequence:**
1. Browser calls `DELETE /api/conversations` (browser-direct to agent-be, boundary JWT in `Authorization` header).
2. agent-be iterates all active conversations for the user (from `sandboxIds` in-memory map + Postgres fallback for `provisioning`/`ready` conversations), terminates each sandbox via `ISandboxService.destroy()`, clears idle timers, deletes conversation records, completes SSE sessions.
3. Response returns `{ terminated: number }`.
4. Browser calls `disconnectRepository()` Server Action (in `apps/web/src/actions/repo-disconnect.actions.ts`), which deletes the `RepoConnection` record via Prisma.
5. Browser redirects to `/onboarding`.

**Why this approach over alternatives:**

- **(a) "apps/web marks conversations as terminating, agent-be picks them up":** Rejected. This requires a polling mechanism or background job in agent-be that doesn't exist. Adding a background sweeper for one flow is over-engineered.
- **(b) "Exception to the no-server-to-server rule for disconnect":** Rejected. The rule exists to avoid coupling the two services' request lifecycles. Making an exception creates precedent for future erosion of the boundary.
- **(c) "Browser calls `DELETE /api/conversations/:id` for each conversation individually":** Rejected. The side nav only shows 5 conversations; conversations beyond the 5-item limit would be missed. This approach can't guarantee all active sandboxes are terminated.

The new `DELETE /api/conversations` endpoint reuses the existing `abandonConversation` logic (extracted into a shared private method or loop) and follows all existing patterns: `BoundaryJwtGuard` + `ActiveUserGuard` on the route, `{ code, message, meta }` error envelope, Zod DTO validation (empty body or no body).

### Architecture impact

**Moderate.** One new agent-be endpoint (`DELETE /api/conversations`) + one new Server Action (`disconnectRepository`). The agent-be endpoint reuses the existing `abandonConversation` sandbox-termination path. No data model changes (cascade deletes handle artifact cleanup). No new dependencies.

### Risks

- **Partial failure:** If agent-be terminates some sandboxes but crashes before completing, some conversations may be orphaned. The `RepoConnection` is not yet deleted (the Server Action hasn't run yet), so the user can retry. The existing idle-timeout and orphan-cleanup (manual, deferred to post-MVP) paths cover residual orphans. Acceptable for MVP.
- **The new endpoint is a bulk-delete operation.** It should be rate-limited via `@Throttle()` matching the existing `createConversation` throttle (10/60s). This prevents accidental or malicious bulk-termination calls.
- **The in-memory `sandboxIds` map is per-process** (single-container architecture, no distributed session registry). If agent-be restarts between the user's connect and disconnect, some sandboxes may not have an in-memory entry but still exist in Daytona. The endpoint should also query Postgres for conversations in `provisioning` or `ready` status and attempt cleanup for any not in the in-memory map. Orphaned Daytona sandboxes from a container restart are an accepted MVP risk (Deferred Decisions, `architecture.md:227`).

### NFRs affected

- **NFR-S2 (per-user credential isolation):** The endpoint must scope all operations to the authenticated `userId` from the boundary JWT. The existing `@User() user: UserContext` decorator pattern enforces this.
- **NFR-S3 (active sandbox termination on deactivation):** This is the first in-app flow that performs active sandbox termination. It does not satisfy NFR-S3 (which is about user deactivation, not repo disconnect) but establishes the termination pattern that a future deactivation flow would extend. The endpoint should be documented as the reference implementation for bulk sandbox termination.

---

## 4. Conversation Delete (Finding 4)

### What changes

**The endpoint already exists.** `ConversationsController` at `conversations.controller.ts:84` defines `DELETE /api/conversations/:id` → `abandonConversation`. This endpoint already:

1. Validates conversation ownership (`findFirst({ where: { id, userId } })` — `conversations.service.ts:201`).
2. Cancels any in-flight provisioning (`cancelledConversations` set, `conversations.service.ts:209`).
3. Destroys the active sandbox via `ISandboxService.destroy(sandboxId)` (`conversations.service.ts:213-214`).
4. Clears the idle timeout timer (`conversations.service.ts:220`).
5. Removes in-memory state (`sandboxStatuses`, `sandboxIds` — `conversations.service.ts:221-222`).
6. Deletes the conversation record from Postgres (`conversations.service.ts:225`).
7. Completes the SSE session (`sessionEvents.complete(conversationId)` — `conversations.service.ts:230`).

### Data cleanup

The Prisma schema handles cascade deletes:
- `Turn` → `Conversation` with `onDelete: Cascade` (`schema.prisma:103`). Deleting the conversation cascades to all turns (chat history).
- `CostRecord` → `Conversation` with `onDelete: Cascade` (`schema.prisma:120`). Deleting the conversation cascades to cost records.

No explicit cascade SQL or additional Prisma calls needed.

### Side nav refresh

After the browser calls `DELETE /api/conversations/:id`, the frontend calls `router.refresh()` to re-render the Server Component layout (`app/(dashboard)/(app)/layout.tsx`), which re-queries the 5 most recent conversations (`layout.tsx:29-34`). This is the established `router.refresh()` pattern for pure Server Component re-render (documented in `project-context.md:114`).

If the deleted conversation was the active conversation, the frontend should redirect to `/project-map` before refreshing (the design decision in Finding 4 specifies this).

### Architecture impact

**Minimal.** The endpoint exists. The only work is frontend wiring: a delete button in `SideNavigation.tsx` (hover-revealed trash icon or context menu), a confirmation dialog, a `fetch('DELETE /api/conversations/:id', ...)` call with the boundary JWT in the `Authorization` header (the same pattern used by `ConversationPane.tsx` for all browser → agent-be REST calls), and `router.refresh()` or `redirect('/project-map')` afterward.

### Concurrent access

If another tab has the deleted conversation open, the SSE connection will drop. `sessionEvents.complete(conversationId)` closes the SSE channel. `ConversationPane.tsx`'s `onerror` handler already handles connection drops (`project-context.md:125` — the `eventSource.onerror` handler with intentional-state-preserving guards). No new handling needed. The frontend's existing error/recovery UI covers this case.

### NFRs affected

None. The endpoint already exists and follows all security patterns (boundary JWT, tenant-scoped query, `ActiveUserGuard`).

---

## 5. Conversation Rename (Finding 5)

### What changes

A new Server Action in `apps/web/src/actions/conversation.actions.ts` that updates the conversation title via Prisma:

```typescript
await getPrisma().conversation.update({
  where: { id: conversationId },
  data: { title },
});
```

### Why a Server Action, not an agent-be endpoint

The conversation title is non-live metadata — it is not part of the streaming/real-time domain that `apps/agent-be` owns. `apps/web` already reads conversations directly from Postgres in `layout.tsx:29-34` (the 5-recent-conversations query). A Server Action that writes to the same table via the shared Prisma client is fully consistent with the "apps/web owns synchronous data operations" split (`architecture.md:209`, `architecture.md:265`).

Adding a `PATCH /api/conversations/:id` endpoint to agent-be for a simple title update would violate the service boundary: agent-be owns real-time and infrastructure orchestration, not CRUD metadata. The architectural split is explicit: "synchronous request-scoped operations gain nothing from an intermediate service hop and lose the natural request-scoped session context that Server Actions provide" (`architecture.md:265`).

### Validation

Zod schema in the Server Action:

```typescript
const renameSchema = z.object({
  conversationId: z.string().min(1),
  title: z.string().min(1).max(100),
});
```

The `.max(100)` cap matches the frontend `maxLength` attribute (required by `project-context.md:141` — "Frontend text inputs should set `maxLength` to match the backend `.max(N)` cap"). The `.min(1)` prevents empty titles (conversations with `null` titles are filtered out of the side nav — `SideNavigation.tsx:44`).

The Server Action follows the established typed result union pattern (`project-context.md:76`): returns `{ success: true } | { error: string; errorCode: string }`, never throws to the client.

### Side nav refresh

After the Server Action completes, `router.refresh()` re-renders the layout Server Component, which re-queries the conversation list from Postgres with the updated title. This is the same `router.refresh()` pattern used by `RefreshButton.tsx` (`project-context.md:114`).

### Architecture impact

**Minimal.** One new Server Action. No agent-be changes, no data model changes, no new endpoints. The `Conversation` model's `title` field already exists as `String?` (`schema.prisma:81`).

### NFRs affected

- **Security:** The Server Action must validate that the conversation belongs to the authenticated user before updating (tenant isolation). The existing `auth()` session check + `findFirst({ where: { id, userId } })` ownership check (as seen in `connectRepository` and other Server Actions) is the pattern.

---

## 8 + 9. Artifact Browser Search (Finding 8) + Conversation Search (Finding 9)

These two findings share a query-pattern decision but differ in implementation complexity.

### Finding 8 — Artifact Browser Search

**What changes:** Client-side filtering of the server-rendered artifact list.

The artifact list is already server-rendered from Postgres. The `(app)/artifacts` page (or its Server Component) queries the mirrored `Artifact` table via Prisma and passes the list to client components. The list is already in the DOM.

**Implementation:** A client component search input that filters the rendered list by title substring and optionally by artifact type. No new endpoint, no new Server Action, no new Prisma query. The filtering runs entirely in the browser on the already-rendered data.

**Architecture impact: None.** Pure frontend. For post-MVP, if the artifact list grows large enough that rendering the full list is a performance concern, a server-side search endpoint with pagination would be needed. For MVP (6–40 artifacts), client-side filtering is the simplest and most appropriate approach.

**NFRs affected:** None. The list is already loaded; filtering adds no network requests. NFR-P4 (Artifact Browser load ≤ 2s) is unaffected — the search runs after initial load.

### Finding 9 — Conversation Search / Show All

**What changes:** A new Server Action that returns the full conversation list (removing the `take: 5` limit from the existing layout query).

The side nav currently receives the 5 most recent conversations from the `(app)/layout.tsx` Server Component (`layout.tsx:29-34`):
```typescript
const conversations = await getPrisma().conversation.findMany({
  where: { userId, title: { not: null } },
  orderBy: { lastActiveAt: 'desc' },
  take: 5,
  select: { id: true, title: true },
});
```

For the "Show all" modal (the design decision in Finding 9), the frontend needs the full list. Two options:

- **(a) New agent-be endpoint `GET /api/conversations`:** Returns all conversations for the user with search/pagination. Rejected — conversation metadata is non-live data, and routing it through agent-be violates the service boundary split. agent-be owns real-time and infrastructure orchestration, not CRUD reads of conversation metadata.

- **(b) New Server Action querying Prisma directly:** A Server Action `getConversations(userId, searchQuery?)` that queries `conversation.findMany` with the same `where` clause as the layout query but without the `take: 5` limit, optionally filtered by title substring.

**Option (b) is recommended.** It is consistent with how `Project Map` and `Artifact Browser` read data — `apps/web` Server Components/Server Actions read Postgres directly for non-live data (`architecture.md:265`, `project-context.md:90-91`). No new endpoint, no agent-be involvement, no boundary JWT needed for a simple Prisma read.

The search input in the modal filters the returned list client-side (same pattern as Finding 8). For post-MVP, if the conversation count grows large (> 100), the Server Action could add server-side `where: { title: { contains: searchQuery, mode: 'insensitive' } }` Prisma filtering and pagination. For MVP (max 10 active conversations per FR-11), client-side filtering of the full list is sufficient.

**Architecture impact: Low.** One new Server Action (a simple Prisma `findMany` without a `take` limit). No agent-be changes, no data model changes. The Server Action returns the same `{ id, title }` shape the layout already passes to `SideNavigation`.

**NFRs affected:** None. The query is a simple indexed read (`@@index([userId, lastActiveAt])` on `Conversation`, `schema.prisma:91`). With a 10-conversation ceiling (FR-11), the result set is small.

---

## Architecture Conflicts Discovered

### 1. The web → agent-be server-to-server prohibition (Finding 2 — Repo Disconnect)

**Conflict:** The disconnect flow needs to terminate active sandboxes, but only `apps/agent-be` knows which sandboxes are active (in-memory `sandboxIds` map). `apps/web` cannot call agent-be server-to-server, and cannot call Daytona directly (no API key, no SDK dependency).

**Resolution:** Add a browser-direct `DELETE /api/conversations` (no `:id`) endpoint to agent-be. The browser calls it before the Server Action that deletes the `RepoConnection`. This does not violate the server-to-server prohibition — it is a browser → agent-be call, the same as all other REST interactions (conversation create, resume, manual commit). The Server Action only deletes the Postgres record, which `apps/web` owns.

**Architectural note:** This is the first bulk-operation endpoint in agent-be. It should be documented as an exception to the "one sandbox : one conversation : one endpoint call" pattern and rate-limited appropriately. The implementation should extract the per-conversation termination logic from `abandonConversation` into a reusable private method so both the single-conversation and bulk endpoints share identical teardown behavior.

### 2. No other conflicts

Findings 1, 4, 5, 8, and 9 do not conflict with any existing architecture rules. They follow established patterns (Server Actions for synchronous data operations, browser-direct calls for agent-be interactions, `router.refresh()` for Server Component re-render).

---

## Risks and Unknowns

### Risk: In-memory sandbox state loss on agent-be restart (Finding 2)

If agent-be restarts between a user's connect and disconnect, the `sandboxIds` in-memory map is lost. The `DELETE /api/conversations` endpoint must fall back to querying Postgres for conversations with `sandboxStatus` in `('provisioning', 'ready')` and attempt to destroy their `sandboxId` values from the DB. However, `sandboxId` may be `null` in Postgres if the provision failed before persisting, or the Daytona sandbox may still be running with no record of it anywhere in the platform. This orphan-sandbox risk is an accepted MVP degradation (Deferred Decisions, `architecture.md:227`).

### Risk: Partial failure in bulk disconnect (Finding 2)

If agent-be terminates some sandboxes but fails midway, the response should indicate partial success. The Server Action should proceed to delete the `RepoConnection` regardless — residual orphaned sandboxes are covered by idle timeout (if the timer was set) or manual operator cleanup. The user sees a redirect to `/onboarding` and can reconnect. This is acceptable for MVP's non-adversarial-user assumption (A-2).

### Unknown: Post-disconnect conversation record handling (Finding 2)

The current `abandonConversation` deletes the conversation record entirely. For repo disconnect, the design decision says "terminate active sandboxes, delete RepoConnection." It does not specify whether conversation records should be deleted or retained. **Recommendation:** Delete all conversation records during disconnect. Conversations are tied to a specific repo connection — retaining orphaned conversation records that reference a disconnected repo serves no purpose and could confuse the conversation-list query. Deleting conversations also cascades to turns and cost records (per the schema), giving a clean slate for the next repo connection.

If cost records should be retained for spend analysis (NFR-O1), a query can be run before deletion to export/summarize. For MVP, the `CostRecord` → `Conversation` cascade delete (`schema.prisma:120`) removes them. This is an acceptable trade-off — cost monitoring is real-time (`cost-tracking.service.ts` logs every SDK cost event as it happens; the DB records are for historical queries, which no MVP UI surface consumes).

### Unknown: Title uniqueness (Finding 5)

The `Conversation` model has no unique constraint on `title` (`schema.prisma:77-93`). Two conversations can have the same title. Rename does not enforce uniqueness, which is correct — users should be able to name conversations however they like. No change needed; noted for completeness.

### Unknown: Artifact list size at which client-side search becomes insufficient (Finding 8)

Client-side filtering is adequate for ≤ 100 artifacts. Post-MVP, if users accumulate hundreds of artifacts across many sessions, a server-side search endpoint with pagination would be needed. The `Artifact` table already has `@@index([repoConnectionId, lastModifiedAt])` (`schema.prisma:73`), which could support an efficient server-side query. No action needed for MVP.
